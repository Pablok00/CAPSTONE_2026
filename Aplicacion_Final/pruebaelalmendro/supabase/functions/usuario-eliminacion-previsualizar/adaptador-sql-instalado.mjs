// Paso 191. Adaptador local de contratos reales. No importado por index.ts ni frontend.
// Sin credenciales, red implícita, SQL dinámico o Auth admin. La conexión se inyecta en servidor.
import { validInput, isExceptionalTarget, assertExceptionalOperation, assertConsumedProof, assertExceptionalGate } from './eliminacion-preparar.mjs';
import { fingerprint } from './eliminacion-coordinar.mjs';
import { readServerReauthenticationProof, readAuthenticatedSessionId } from './reautenticacion-servidor.mjs';
import { captureConservation, verifyConservation, conserveDocumentStorage, verifyAfterAuth, normalizePhysicalInventory, measurePhysicalStorage, measureIntegralPhysicalStorage, samePhysicalReceipt, PERSISTENT_HISTORY_TABLES } from './conservacion-previa.mjs';
// Los JSON ya serializados se vinculan primero como TEXT y luego se convierten
// a JSONB: evita que Postgres.js los vuelva a serializar como cadenas JSON.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const states = ['PREPARADA', 'AUTH_EN_CURSO', 'AUTH_ELIMINADA', 'COMPLETADA', 'REQUIERE_REVISION'];
const integralRelations = new Set([...PERSISTENT_HISTORY_TABLES,'usuarios_trabajadores_vinculos_auditoria',
  'mantenciones_reactivas_ciclos','televisores_habitaciones','televisores_habitaciones_auditoria',
  'usuarios_creaciones_manuales_operaciones'].map(name => name.includes('.') ? name : 'public.' + name));
// Alcances cerrados; el navegador solo elige módulo e ID de registros, no cuentas.
const historicalScopes = Object.freeze({
  // Proyecciones acreditadas de la RPC. No se consultan tablas privadas.
  TAREAS: { table:'public.tareas_pendientes_asignaciones' },
  TAREAS_REGISTROS: { table:'public.tareas_pendientes' },
  TAREAS_OPERACIONES: { table:'public.tareas_pendientes' },
  MANTENCIONES: { table:'public.mantenciones_operativas', accounts:['registrado_por'], workers:['trabajador_id'], children:[
    {table:'public.mantenciones_operativas_responsables',key:'mantencion_id',workers:['trabajador_id']},
    {table:'public.mantenciones_operativas_anulaciones',key:'mantencion_id',accounts:['anulado_por']}] },
  HISTORIAL: { table:'public.mantencion_historial', accounts:['revisado_por'], children:[
    {table:'public.mantencion_historial_anulaciones',key:'historial_id',accounts:['anulado_por']}] },
  REACTIVAS_EVENTOS: { table:'public.solicitudes_reactivas_eventos', accounts:['actor_id'] },
  REACTIVAS_CICLOS: { table:'public.mantenciones_reactivas_ciclos', workers:['responsable_trabajador_id'] },
  SOLICITUDES: { table:'public.solicitudes_reactivas', reception:true,noTech:true, accounts:['creada_por','revisada_por','anulada_por'] },
  DOCUMENTOS_CUENTA: { table:'public.cuentas_documentos', admin:true, accounts:['cuenta_id','creado_por'] },
  DOCUMENTOS_TRABAJADOR: { table:'public.trabajadores_documentos', admin:true, accounts:['creado_por'], workers:['trabajador_id'] },
  DOCUMENTOS_FICHA: { table:'public.trabajadores', admin:true, workers:['id'] },
  MANTENCIONES_ANTIGUAS: { table:'public.mantenciones', accounts:['responsable_id'] },
});
const controlled = new WeakSet();
const diagnostics = new WeakMap();
const diagnosticCodes = new Set(["SQL_EXCEPCIONAL_NO_ACREDITADO","OPERACION_NO_VINCULADA","CONFIRMACION_INVALIDA","SESION_REQUERIDA","SOLO_ADMIN_PERMANENTE","CUENTA_PROPIA","REAUTENTICACION_NO_ACREDITADA","CONTEXTO_SQL_NO_ACREDITADO","REFERENCIAS_SOBREVENIDAS","AUDITORIA_NO_VERIFICABLE","REAUTENTICACION_REUTILIZADA","INTENCION_NO_ADMITIDA","INICIO_IRREVERSIBLE_NO_IMPLEMENTADO","OPERACION_AMBIGUA","CONTRATO_SQL_INVALIDO","CONFLICTO_IDEMPOTENCIA","COMPUERTA_EXCEPCIONAL_CERRADA","INICIO_NO_ACREDITADO","REAUTENTICACION_NO_VINCULADA","OPERACION_CAMBIO","OBJETIVO_CAMBIO","HISTORIAL_NO_VERIFICABLE","RESULTADO_NO_VERIFICABLE","VERIFICACION_AUTH_PENDIENTE","CONTRATOS_SQL_NO_VERIFICABLES","RECUPERACION_NO_ACREDITADA","CONSERVACION_INTEGRAL_NO_HABILITADA","CONSERVACION_NO_ACREDITADA","CONSERVACION_POSTERIOR_NO_ACREDITADA","CERTIFICADO_V1_SIN_PROYECCION_POSTERIOR","VERIFICACION_FISICA_PENDIENTE"]);
const safeSqlstates = new Set(['P0001','42501','55000','55P03','57014','40001','40P01','23503','23505','23514','22P02','42883','42703','42P01','08006','08001']);
// 373H: diagnóstico de lectura únicamente. Nunca incluye el mensaje del driver.
const historicalSqlstates = new Set([...safeSqlstates,'25006','25001','0A000','22023','42804']);
const historicalSubstages = new Set(['ENTRADA','AUTENTICACION','SESION_JWT','CONEXION_TRANSACCION',
  'CONFIGURACION_TRANSACCION','CLAIMS','CONTEXTO_POSTGRES','AUTORIZACION_MODULO','CAMBIO_ROL_LECTURA',
  'CONTEXTO_LECTURA','PARAMETROS_TAREAS','RPC_ACCESO_TAREA','RESPUESTA_ACCESO_TAREA',
  'RPC_TAREAS','RESPUESTA_TAREAS','CURSOR_TAREAS','LECTURA_RLS','CONTEXTOS_HISTORICOS',
  'RESTAURAR_ROL','CONTEXTO_PRIVADO','RPC_IDENTIDADES','RESPUESTA_IDENTIDADES','DOCUMENTOS_HISTORICOS_RLS','CIERRE_TRANSACCION']);
const historicalValidationCodes = new Set(['SESION_REQUERIDA','SOLO_ADMIN_PERMANENTE','SESION_NO_VERIFICABLE',
  'CONFIRMACION_INVALIDA','CONTEXTO_SQL_NO_ACREDITADO','CONTRATO_SQL_INVALIDO']);
const startSubstages = new Set(['ENTRADA','VALIDAR_ENTRADA','AUTENTICACION','SESION_JWT','VALIDAR_REAUTENTICACION',
  'VINCULAR_SOLICITUD','CONEXION_TRANSACCION','CONFIGURACION_CONTEXTO','CONFIGURAR_CLAIMS',
  'BLOQUEO_COORDINACION','BLOQUEO_ACTOR','VALIDAR_CONTEXTO_SQL','LEER_OPERACION_PREVIA',
  'VALIDAR_REAUTENTICACION_PERSISTIDA','PERSISTIR_REAUTENTICACION','VALIDAR_PERSISTENCIA_REAUTENTICACION',
  'EJECUTAR_INICIO_SQL','VALIDAR_RESPUESTA_SQL','LEER_OPERACION_POSTERIOR','VALIDAR_ESTADO_POSTERIOR',
  'VALIDAR_CERTIFICADO_POSTERIOR','CIERRE_TRANSACCION']);
const startValidationCodes = new Set([...diagnosticCodes,'SESION_NO_VERIFICABLE']);
// DEL-FIX-11: códigos acreditados por SELECT instalado, informados por el usuario.
// Igualdad exacta: no trim, prefijos, extracción con regex ni mensajes libres.
const safeP0001Rejections = new Set(["USUARIO_OBJETIVO_REQUERIDO","RELACION_NO_ADMITIDA","AISLAMIENTO_ELIMINACION_NO_CERTIFICADO","CONTEXTO_SQL_NO_ADMITIDO","SOLO_ADMIN_PERMANENTE","OPERACION_NO_INICIABLE","PRIVILEGIO_CAMBIO","ROL_O_NOMBRE_NO_ADMITIDO","AUTH_OBJETIVO_NO_EXISTE","RESERVA_EXISTENTE","GUARDAS_NO_ACREDITADAS","DEPENDENCIAS_NO_ADMITIDAS","COBERTURA_EVALUADOR_CAMBIO","REGISTROS_PERSONALES_PENDIENTES","HISTORIAL_CAMBIO","EVIDENCIA_SUPERA_LIMITE","PETICION_NO_VINCULADA","REAUTENTICACION_NO_ACREDITADA","OBJETIVO_CAMBIO","OPERACION_CAMBIO","RELACION_DOCUMENTAL_NO_ADMITIDA","SOLO_ADMINISTRADOR_PERMANENTE","IDENTIDADES_DOCUMENTALES_NO_AUTORIZADAS","INSERT_DOCUMENTAL_MANIPULADO","DECLARACION_DOCUMENTAL_INMUTABLE","DOCUMENTO_DISPONIBLE_INMUTABLE","REVISION_CON_EVIDENCIA_NO_ADMITIDA","TRANSICION_DOCUMENTAL_NO_ADMITIDA","OBJETO_STORAGE_NO_COINCIDE","EVENTO_DOCUMENTAL_NO_ADMITIDO","RELACION_LABORAL_NO_ADMITIDA","EVENTO_LABORAL_NO_ADMITIDO"]);
// No propiedades del driver, SQL, detalles ni credenciales en la respuesta.
for (const code of ['ELIMINACION_INTEGRAL_V2_DESHABILITADA','CONSERVACION_INTEGRAL_V2_PENDIENTE',
  'CERTIFICADO_V2_DESACTUALIZADO','CERTIFICADO_V2_NO_ACREDITADO','REGISTROS_INDIVIDUALES_V2_CAMBIARON',
  'MIGRACION_INSTITUCIONAL_REQUERIDA','RETIRO_O_MIGRACION_V2_PENDIENTE','FISICA_POSTERIOR_V2_PENDIENTE',
  'AUSENCIA_AUTH_V2_NO_ACREDITADA','REAUTENTICACION_V2_NO_ACREDITADA','REAUTENTICACION_V2_VENCIDA_O_CONSUMIDA'])
  safeP0001Rejections.add(code);
export function readDeletionDiagnostic(error, permanent = false) {
  return permanent === true && error && diagnostics.has(error) ? { ...diagnostics.get(error) } : undefined;
}
const fail = code => { const error = new Error(code); controlled.add(error); throw error; };
function exceptional(row) {
  try { return assertExceptionalOperation(row); }
  catch { return fail('SQL_EXCEPCIONAL_NO_ACREDITADO'); }
}
function mapOperation(row, binding, input) {
  const metadata = row?.dependencias_resumen?.paso191;
  if (!row || !UUID.test(row.id || '') || !states.includes(row.estado) ||
      row.actor_id !== binding.actor_id || row.objetivo_id !== binding.target_id ||
      row.objetivo_nombre_snapshot !== input.nombre_confirmacion || row.motivo !== input.motivo.trim() ||
      metadata?.request_id !== binding.request_id || metadata?.fingerprint !== binding.fingerprint)
    return fail('OPERACION_NO_VINCULADA');
  const exceptionalVerified = exceptional(row);
  return { id: row.id, ...binding, state: row.estado,
    ...(exceptionalVerified ? { alcance_excepcional_verificado: true } : {}),
    conservacion_historica_certificada: row.dependencias_resumen.conservacion_historica_certificada === true,
    execution_authorized: row.dependencias_resumen.autorizacion_irreversible_confirmada === true,
    attempt_id: metadata.attempt_id, audit_verified: row.estado === 'COMPLETADA' && UUID.test(row.auditoria_id || '') };
}
/** @param {{database: any, authenticate: any, readExceptionalSetting?: any, physicalStorageReader?: {read: (object: any, authorization: string) => Promise<any>}}} dependencies */
export function createInstalledSqlAdapter({ database, authenticate, readExceptionalSetting, physicalStorageReader }) {
  async function requirePostConservation(tx, row) {
    let result;
    try { result=await verifyAfterAuth(tx,row); }
    catch { return fail('CONSERVACION_POSTERIOR_NO_ACREDITADA'); }
    if (result.historia_persistente_verificada!==true || result.habilita_auth!==false)
      return fail('CONSERVACION_POSTERIOR_NO_ACREDITADA');
    if (result.conservacion_integral_verificada!==true)
      return fail('VERIFICACION_FISICA_PENDIENTE');
  }
  async function transaction({ authorization, input, write, reauthProof, reviewOnly = false, diagnosticStage, v2Context = false, startTrace = null }, action) {
    if(startTrace)startTrace.value='VALIDAR_ENTRADA';
    if (!validInput(input)) return fail('CONFIRMACION_INVALIDA');
    // Capturar entrada antes de esperar Auth: no cambiar identidad/objetivo durante awaits.
    input = { ...input, usuario_id: input.usuario_id.toLowerCase(), operacion_id: input.operacion_id.toLowerCase(), motivo: input.motivo.trim() };
    if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) return fail('SESION_REQUERIDA');
    if(startTrace)startTrace.value='AUTENTICACION';
    const actor = await authenticate(authorization);
    if (!actor || !UUID.test(actor.id || '') || actor.permanent !== true) return fail('SOLO_ADMIN_PERMANENTE');
    const actorId = actor.id.toLowerCase();
    if(startTrace)startTrace.value='SESION_JWT';
    const sessionId = v2Context ? readAuthenticatedSessionId(authorization, actorId) : null;
    if (actorId === input.usuario_id) return fail('CUENTA_PROPIA');
    if(startTrace)startTrace.value='VALIDAR_REAUTENTICACION';
    const reauth = write && reauthProof && !reviewOnly ? await readServerReauthenticationProof(reauthProof, { actorId, authorization, input }) : null;
    // No se admite ya el antiguo callback booleano como sustituto de reautenticación.
    // Registrar incertidumbre no autoriza Auth ni finalización: permite cerrar en revisión
    // un intento ya vinculado aunque la prueba de 120s haya caducado durante Auth.
    if (write && !reauth && !reviewOnly)
      return fail('REAUTENTICACION_NO_ACREDITADA');
    if(startTrace)startTrace.value='VINCULAR_SOLICITUD';
    const binding = { actor_id: actorId, target_id: input.usuario_id, request_id: input.operacion_id,
      fingerprint: await fingerprint(actorId, input) };
    if (diagnosticStage) diagnosticStage.value = 'CONEXION_TRANSACCION';
    if(startTrace)startTrace.value='CONEXION_TRANSACCION';
    const sql = database();
    return await sql.begin(write ? 'isolation level read committed read write' : 'isolation level repeatable read read only', async tx => {
      if(startTrace)startTrace.value='CONFIGURACION_CONTEXTO';
      if (diagnosticStage) diagnosticStage.value = 'CONFIGURACION_CONTEXTO';
      await tx`SET LOCAL statement_timeout = '10s'`;
      await tx`SET LOCAL lock_timeout = '3s'`;
      await tx`SET LOCAL row_security = off`;
      // auth.uid() del JSON real prioriza claim.sub. Sobrescribir AMBOS localmente.
      // No SET ROLE, no claims del body y jamás incluir el JWT original en SQL/GUC.
      if(startTrace)startTrace.value='CONFIGURAR_CLAIMS';
      await tx`SELECT set_config('request.jwt.claim.sub', ${actorId}, true),
        set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated', ...(reauth ? { session_id: reauth.session_id } : sessionId ? { session_id: sessionId } : {}) })}, true)`;
      if (write) {
        // Misma llave del SQL215, antes de cualquier bloqueo de filas.
        if(startTrace)startTrace.value='BLOQUEO_COORDINACION';
        await tx`SELECT pg_advisory_xact_lock(209,1)`;
        if(startTrace)startTrace.value='BLOQUEO_ACTOR';
        await tx`SELECT id FROM public.usuarios WHERE id = ${actorId}::uuid FOR SHARE`;
      }
      if(startTrace)startTrace.value='VALIDAR_CONTEXTO_SQL';
      const [identity] = await tx`SELECT auth.uid()::text AS actor_id, current_user::text AS effective_role,
        session_user::text AS login_role, current_database() AS database_name,
        current_setting('transaction_read_only') AS read_only, current_setting('row_security') AS row_security,
        (SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = current_user) AS bypass_rls,
        public.es_administrador_permanente_actual() AS permanente`;
      if (identity?.actor_id !== actorId || identity.effective_role !== 'postgres' || identity.login_role !== 'postgres' ||
          identity.database_name !== 'postgres' || identity.bypass_rls !== true || identity.row_security !== 'off' ||
          identity.read_only !== (write ? 'off' : 'on') || identity.permanente !== true) return fail('CONTEXTO_SQL_NO_ACREDITADO');
      if (diagnosticStage) diagnosticStage.value = 'VALIDACION_OPERACION';
      const result=await action(tx, binding, input, reauth);
      if(startTrace)startTrace.value='CIERRE_TRANSACCION';
      return result;
    });
  }
  async function operation(tx, id, binding, input) {
    if (!UUID.test(id || '')) return fail('OPERACION_NO_VINCULADA');
    const rows = await tx`SELECT * FROM public.usuarios_eliminaciones_operaciones WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length !== 1) return fail('OPERACION_NO_VINCULADA');
    const envelope = mapOperation(rows[0], binding, input);
    await verifyAudit(tx, rows[0], envelope);
    return { row: rows[0], envelope };
  }
  async function additionalReferencesAbsent(tx, target) {
    const [check] = await tx`SELECT
      NOT EXISTS(SELECT 1 FROM public.cuentas_documentos WHERE cuenta_id=${target}::uuid OR creado_por=${target}::uuid)
      AND NOT EXISTS(SELECT 1 FROM public.tareas_pendientes WHERE creada_por=${target}::uuid OR completada_por=${target}::uuid OR retirada_por=${target}::uuid)
      AND NOT EXISTS(SELECT 1 FROM public.tareas_pendientes_asignaciones WHERE asignada_por=${target}::uuid OR completada_por=${target}::uuid OR retirada_por=${target}::uuid)
      AND NOT EXISTS(SELECT 1 FROM public.tareas_pendientes_operaciones WHERE actor_id=${target}::uuid) AS adicionales_ausentes`;
    if (check?.adicionales_ausentes !== true) return fail('REFERENCIAS_SOBREVENIDAS');
  }
  async function verifyAudit(tx, row, envelope) {
    if (row.estado !== 'COMPLETADA') return;
    const [audit] = await tx`SELECT * FROM public.del_registro_eliminaciones WHERE id = ${row.auditoria_id}::uuid`;
    if (!audit || audit.modulo !== 'Administración de Usuarios' || audit.entidad_tipo !== 'usuario' ||
        audit.accion !== 'ELIMINACION_PERMANENTE' || audit.entidad_id !== row.objetivo_id ||
        audit.ejecutado_por !== row.actor_id || audit.entidad_referencia !== row.objetivo_nombre_snapshot ||
        audit.ejecutado_por_nombre_snapshot !== row.actor_nombre_snapshot || audit.motivo !== row.motivo ||
        audit.dependencias_resumen?.operacion_id !== row.id) return fail('AUDITORIA_NO_VERIFICABLE');
    envelope.audit_verified = true;
  }
  async function persistReauthentication(tx, row, record, trace = null) {
    if(trace)trace.value='VALIDAR_REAUTENTICACION_PERSISTIDA';
    if (!record || record.purpose !== 'inicio' || row.estado !== 'PREPARADA' || row.intentos_auth !== 0 || row.auditoria_id !== null)
      return fail('REAUTENTICACION_NO_ACREDITADA');
    const old = row.dependencias_resumen.paso192?.reauth;
    if (old?.consumed_at != null || (old && old.proof_id !== record.proof_id && old.verified_at >= record.verified_at))
      return fail('REAUTENTICACION_REUTILIZADA');
    if (old?.proof_id === record.proof_id) return;
    const metadata = { ...record, operation_id: row.id };
    if(trace)trace.value='PERSISTIR_REAUTENTICACION';
    const rows = await tx`UPDATE public.usuarios_eliminaciones_operaciones SET dependencias_resumen =
      dependencias_resumen || jsonb_build_object('paso192', COALESCE(dependencias_resumen->'paso192','{}'::jsonb)
        || jsonb_build_object('reauth', ${JSON.stringify(metadata)}::text::jsonb)), updated_at = clock_timestamp()
      WHERE id = ${row.id}::uuid AND estado = 'PREPARADA' AND intentos_auth = 0 RETURNING *`;
    if(trace)trace.value='VALIDAR_PERSISTENCIA_REAUTENTICACION';
    if (rows.length !== 1) return fail('REAUTENTICACION_NO_ACREDITADA');
  }
  async function dispatchInternal(intent, context) {
    // Solo recibe intenciones del coordinador en código servidor, no JSON HTTP.
    if (intent?.simulacion !== true) return fail('INTENCION_NO_ADMITIDA');
    const kind = intent.kind;
    const payload = structuredClone(intent.payload);
    if (['ELIMINAR_AUTH_SIMULADO', 'RECONCILIAR_SQL'].includes(kind))
      return fail('INICIO_IRREVERSIBLE_NO_IMPLEMENTADO');
    const allowed = ['LEER_OPERACION', 'PREPARAR_SQL', 'MARCAR_AUTH_ELIMINADA_SQL', 'FINALIZAR_SQL_ENDURECIDA', 'REGISTRAR_REVISION_SQL', 'CERTIFICAR_Y_AUTORIZAR_INICIO_SQL', 'VERIFICAR_AUSENCIA', 'VERIFICAR_INICIO_AUTH'];
    if (!allowed.includes(kind)) return fail('INTENCION_NO_ADMITIDA');
    return transaction({ ...context, write: kind !== 'LEER_OPERACION', reviewOnly: kind === 'REGISTRAR_REVISION_SQL' }, async (tx, binding, input, reauth) => {
      if (kind === 'LEER_OPERACION' || kind === 'PREPARAR_SQL') {
        if (payload?.actor_id !== binding.actor_id || payload.target_id !== binding.target_id ||
            payload.request_id !== binding.request_id || payload.fingerprint !== binding.fingerprint) return fail('OPERACION_NO_VINCULADA');
      }
      if (kind === 'LEER_OPERACION') {
        const rows = await tx`SELECT * FROM public.usuarios_eliminaciones_operaciones
          WHERE dependencias_resumen->'paso191'->>'request_id' = ${binding.request_id}`;
        if (rows.length > 1) return fail('OPERACION_AMBIGUA');
        if (!rows.length) {
          if (context.pendingOperationId) return fail('OPERACION_NO_VINCULADA');
          return null;
        }
        if (context.pendingOperationId && rows[0].id !== context.pendingOperationId) return fail('OPERACION_NO_VINCULADA');
        const envelope = mapOperation(rows[0], binding, input);
        await verifyAudit(tx, rows[0], envelope);
        return envelope;
      }
      if (kind === 'PREPARAR_SQL') {
        if (context.pendingOperationId) return fail('OPERACION_NO_VINCULADA'); // Continuar nunca crea otra operación.
        // Todos los adaptadores cooperantes serializan request_id. READ COMMITTED permite
        // ver el commit del anterior tras esperar. No acredita reservas para el inicio Auth.
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${binding.request_id}::text, 191::bigint))`;
        const previous = await tx`SELECT * FROM public.usuarios_eliminaciones_operaciones
          WHERE dependencias_resumen->'paso191'->>'request_id' = ${binding.request_id}`;
        if (previous.length > 1) return fail('OPERACION_AMBIGUA');
        if (previous.length) {
          const envelope = mapOperation(previous[0], binding, input);
          await verifyAudit(tx, previous[0], envelope);
          if (reauth && previous[0].estado === 'PREPARADA') await persistReauthentication(tx, previous[0], reauth);
          return envelope;
        }
        // Firma real, no request UUID inventado como parámetro de v1.
        const [answer] = await tx`SELECT public.usuario_eliminacion_preparar_v1(
          ${binding.target_id}::uuid, ${input.nombre_confirmacion}::text,
          ${input.motivo}::text, ${input.confirmacion}::boolean) AS resultado`;
        const data = answer?.resultado;
        if (!['PREPARADA', 'YA_PREPARADA'].includes(data?.resultado) || data.estado !== 'PREPARADA' ||
            data.eliminacion_habilitada !== false || !UUID.test(data.operacion_id || '')) return fail('CONTRATO_SQL_INVALIDO');
        const [row] = await tx`SELECT * FROM public.usuarios_eliminaciones_operaciones WHERE id = ${data.operacion_id}::uuid FOR UPDATE`;
        if (!row || row.estado !== 'PREPARADA' || row.intentos_auth !== 0 || row.auditoria_id !== null ||
            row.actor_id !== binding.actor_id || row.objetivo_id !== binding.target_id ||
            row.objetivo_nombre_snapshot !== input.nombre_confirmacion || row.motivo !== input.motivo ||
            row.dependencias_resumen?.conservacion_historica_certificada !== false) return fail('OPERACION_NO_VINCULADA');
        exceptional(row); // SQL original sin marcador: rollback antes de vincular petición/reauth.
        const old = row.dependencias_resumen.paso191;
        // Namespace NUEVO propuesto sobre JSONB existente; no se atribuye a v1 instalada.
        if (old && (old.request_id !== binding.request_id || old.fingerprint !== binding.fingerprint)) return fail('CONFLICTO_IDEMPOTENCIA');
        if (!old) {
          const metadata = { request_id: binding.request_id, fingerprint: binding.fingerprint };
          const rows = await tx`UPDATE public.usuarios_eliminaciones_operaciones
            SET dependencias_resumen = dependencias_resumen || jsonb_build_object('paso191', ${JSON.stringify(metadata)}::text::jsonb),
              updated_at = clock_timestamp() WHERE id = ${row.id}::uuid AND estado = 'PREPARADA'
              AND intentos_auth = 0 AND auditoria_id IS NULL RETURNING *`;
          if (rows.length !== 1) return fail('CONFLICTO_IDEMPOTENCIA');
          if (reauth) await persistReauthentication(tx, rows[0], reauth);
          return mapOperation(rows[0], binding, input);
        }
        if (reauth) await persistReauthentication(tx, row, reauth);
        return mapOperation(row, binding, input);
      }
      const { row, envelope } = await operation(tx, payload?.operation?.id, binding, input);
      // DEL-FIX-21: evidencia nueva nunca hereda la autorización restringida antigua.
      // Ni flags, ni una huella válida habilitan el alcance integral aún incompleto.
      if (Object.hasOwn(row.dependencias_resumen, 'conservacion_previa_v1') && kind !== 'REGISTRAR_REVISION_SQL') {
        if (['VERIFICAR_AUSENCIA','MARCAR_AUTH_ELIMINADA_SQL','FINALIZAR_SQL_ENDURECIDA'].includes(kind))
          await requirePostConservation(tx,row);
        else return fail('CONSERVACION_INTEGRAL_NO_HABILITADA');
      }
      if (['CERTIFICAR_Y_AUTORIZAR_INICIO_SQL', 'VERIFICAR_INICIO_AUTH'].includes(kind) && isExceptionalTarget(binding.target_id)) {
        try { assertExceptionalGate(binding.target_id, readExceptionalSetting); }
        catch { return fail('COMPUERTA_EXCEPCIONAL_CERRADA'); }
        // Sin helper SQL instalado o respuesta exacta TRUE, no iniciar ni Auth.
        const [gate] = await tx`SELECT public.usuario_eliminacion_compuerta_excepcional_v1(${binding.target_id}::uuid) AS abierta`;
        if (gate?.abierta !== true) return fail('COMPUERTA_EXCEPCIONAL_CERRADA');
      }
      if (kind === 'CERTIFICAR_Y_AUTORIZAR_INICIO_SQL') {
        if (row.estado !== 'PREPARADA' || row.intentos_auth !== 0 || reauth?.purpose !== 'inicio') return fail('INICIO_NO_ACREDITADO');
        if (context.pendingOperationId) {
          if (row.id !== context.pendingOperationId) return fail('OPERACION_NO_VINCULADA');
          context.diagnosticStage.value = 'RENOVAR_REAUTENTICACION';
          await persistReauthentication(tx, row, reauth);
        }
        context.diagnosticStage.value = 'RPC_INICIAR';
        const [answer] = await tx`SELECT public.usuario_eliminacion_iniciar_general_v1(${row.id}::uuid) AS resultado`;
        context.diagnosticStage.value = 'VALIDAR_RESPUESTA_INICIO';
        if (answer?.resultado?.operacion_id !== row.id || answer.resultado.estado !== 'AUTH_EN_CURSO' ||
            !UUID.test(answer.resultado.attempt_id || '')) return fail('CONTRATO_SQL_INVALIDO');
        context.diagnosticStage.value = 'VERIFICAR_INICIO_DURABLE';
        const updated = await operation(tx, row.id, binding, input);
        if (updated.envelope.state !== 'AUTH_EN_CURSO' || updated.row.intentos_auth !== 1 ||
            updated.envelope.attempt_id !== answer.resultado.attempt_id ||
            !updated.envelope.conservacion_historica_certificada || !updated.envelope.execution_authorized) return fail('INICIO_NO_ACREDITADO');
        try { assertConsumedProof(updated.row, reauth); }
        catch { return fail('REAUTENTICACION_NO_VINCULADA'); }
        return updated.envelope;
      }
      // Releer también un inicio cuyo commit/respuesta fue incierto; nunca repetir Auth.
      if (kind !== 'REGISTRAR_REVISION_SQL' &&
          (envelope.attempt_id !== payload.operation.attempt_id || envelope.state !== payload.operation.state)) return fail('OPERACION_CAMBIO');
      if (kind === 'REGISTRAR_REVISION_SQL') {
        // v1 solo admite INCIERTA desde AUTH_EN_CURSO; no fingir CAS desde otros estados.
        if (row.estado !== 'AUTH_EN_CURSO') return { persisted: false };
        const [r] = await tx`SELECT public.usuario_eliminacion_registrar_resultado_auth_v1(
          ${row.id}::uuid, 'INCIERTA'::text, 'RESULTADO_NO_ACREDITADO'::text) AS resultado`;
        if (r?.resultado?.operacion_id !== row.id || r.resultado.estado !== 'REQUIERE_REVISION') return fail('CONTRATO_SQL_INVALIDO');
        return { persisted: true };
      }
      if (!envelope.conservacion_historica_certificada || !envelope.execution_authorized ||
          !UUID.test(envelope.attempt_id || '') || row.intentos_auth < 1) return fail('INICIO_NO_ACREDITADO');
      if (kind === 'VERIFICAR_INICIO_AUTH') {
        if (row.estado !== 'AUTH_EN_CURSO') return fail('INICIO_NO_ACREDITADO');
        if (isExceptionalTarget(binding.target_id)) {
          try { assertConsumedProof(row, reauth); }
          catch { return fail('REAUTENTICACION_NO_VINCULADA'); }
          const [target] = await tx`SELECT u.estado, u.rol_id, u.trabajador_id,
            EXISTS(SELECT 1 FROM auth.users WHERE id=${binding.target_id}::uuid) AS auth_exists
            FROM public.usuarios u WHERE u.id=${binding.target_id}::uuid FOR SHARE`;
          if (!target || target.estado !== false || target.rol_id !== null || target.trabajador_id !== null ||
              target.auth_exists !== true) return fail('OBJETIVO_CAMBIO');
          await additionalReferencesAbsent(tx, binding.target_id);
        }
        return envelope;
      }
      if (['VERIFICAR_AUSENCIA', 'MARCAR_AUTH_ELIMINADA_SQL', 'FINALIZAR_SQL_ENDURECIDA'].includes(kind)) {
        const evidence = row.dependencias_resumen.paso176_evidencia;
        if ((!isExceptionalTarget(binding.target_id) && evidence?.alcance !== 'recepcion_tecnico_restringido') || evidence?.objetivo_id !== row.objetivo_id ||
            !Array.isArray(evidence.huellas_solicitudes) || !Array.isArray(evidence.huellas_avisos)) return fail('HISTORIAL_NO_VERIFICABLE');
        if (isExceptionalTarget(binding.target_id)) await additionalReferencesAbsent(tx, binding.target_id);
        const [check] = await tx`SELECT
          NOT EXISTS(SELECT 1 FROM auth.users WHERE id = ${binding.target_id}::uuid) AS auth_absent,
          NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id = ${binding.target_id}::uuid) AS profile_absent,
          (SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'estado',s.estado,
            'sha256',encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex')) ORDER BY s.id),'[]'::jsonb)
            FROM public.solicitudes_reactivas s WHERE s.creada_por = ${binding.target_id}::uuid) =
              ${JSON.stringify(evidence.huellas_solicitudes)}::text::jsonb AS requests_preserved,
          (SELECT coalesce(jsonb_agg(jsonb_build_object('solicitud_id',a.solicitud_id,
            'sha256',encode(sha256(convert_to(to_jsonb(a)::text,'UTF8')),'hex')) ORDER BY a.solicitud_id,to_jsonb(a)::text),'[]'::jsonb)
            FROM public.solicitudes_reactivas_avisos a JOIN public.solicitudes_reactivas s ON s.id=a.solicitud_id
            WHERE s.creada_por = ${binding.target_id}::uuid) =
              ${JSON.stringify(evidence.huellas_avisos)}::text::jsonb AS notices_preserved`;
        if (check?.auth_absent !== true || check.profile_absent !== true || check.requests_preserved !== true ||
            check.notices_preserved !== true) return fail('RESULTADO_NO_VERIFICABLE');
        if (kind === 'VERIFICAR_AUSENCIA') return { auth_absent: true, profile_absent: true, history_preserved: true };
      }
      if (kind === 'MARCAR_AUTH_ELIMINADA_SQL') {
        const [r] = await tx`SELECT public.usuario_eliminacion_registrar_resultado_auth_v1(
          ${row.id}::uuid, 'CONFIRMADA'::text, NULL::text) AS resultado`;
        if (!['AUTH_ELIMINADA', 'YA_CONFIRMADA'].includes(r?.resultado?.resultado) || r.resultado.operacion_id !== row.id ||
            r.resultado.estado !== 'AUTH_ELIMINADA') return fail('CONTRATO_SQL_INVALIDO');
      } else {
        if (!['AUTH_ELIMINADA', 'COMPLETADA'].includes(row.estado) || row.dependencias_resumen.auth_eliminacion_verificada !== true)
          return fail('VERIFICACION_AUTH_PENDIENTE');
        const [r] = await tx`SELECT public.usuario_eliminacion_finalizar_v1(${row.id}::uuid) AS resultado`;
        if (!['COMPLETADA', 'YA_COMPLETADA'].includes(r?.resultado?.resultado) || r.resultado.operacion_id !== row.id ||
            !UUID.test(r.resultado.auditoria_id || '')) return fail('CONTRATO_SQL_INVALIDO');
      }
      return (await operation(tx, row.id, binding, input)).envelope;
    });
  }
  async function dispatch(intent, context) {
    const diagnosticStage = { value: 'VALIDACION_SOLICITUD' };
    try { return await dispatchInternal(intent, { ...context, diagnosticStage }); }
    catch (error) {
      const internal = controlled.has(error);
      const safe = internal ? error : new Error('CONTRATOS_SQL_NO_VERIFICABLES');
      if (!internal) controlled.add(safe);
      diagnostics.set(safe, Object.freeze({ etapa: diagnosticStage.value,
        codigo: internal && diagnosticCodes.has(error.message) ? error.message : 'CONTRATOS_SQL_NO_VERIFICABLES',
        tipo: internal ? 'VALIDACION_INTERNA' : safeSqlstates.has(error?.code) ? 'POSTGRESQL' : 'NO_CLASIFICADO',
        ...(!internal && safeSqlstates.has(error?.code) ? { sqlstate: error.code } : {}),
        ...(!internal && error?.code === 'P0001' ? {
          rechazo_sql: typeof error.message === 'string' && safeP0001Rejections.has(error.message)
            ? error.message : 'P0001_NO_CLASIFICADO',
        } : {}),
      }));
      throw safe;
    }
  }
  async function prepareRecovery(context, op) {
    try {
      if (!context?.reauthProof) return fail('REAUTENTICACION_NO_ACREDITADA');
      return await transaction({ ...context, write: true }, async (tx, binding, input, record) => {
        const { row } = await operation(tx, op?.id, binding, input);
        if (record?.purpose !== 'recuperacion' || !['AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION'].includes(row.estado) ||
            row.intentos_auth !== 1) return fail('RECUPERACION_NO_ACREDITADA');
        if (Object.hasOwn(row.dependencias_resumen, 'conservacion_previa_v1'))
          await requirePostConservation(tx,row);
        const old = row.dependencias_resumen.paso192?.recovery_reauth;
        if ((old?.proof_id === record.proof_id && old.consumed_at != null) ||
            (old && old.proof_id !== record.proof_id && (old.verified_at >= record.verified_at ||
              (old.consumed_at != null && record.verified_at <= old.consumed_at))))
          return fail('REAUTENTICACION_REUTILIZADA');
        if (old?.proof_id !== record.proof_id) {
          const rows = await tx`UPDATE public.usuarios_eliminaciones_operaciones SET dependencias_resumen =
            dependencias_resumen || jsonb_build_object('paso192', COALESCE(dependencias_resumen->'paso192','{}'::jsonb)
              || jsonb_build_object('recovery_reauth', ${JSON.stringify({ ...record, operation_id: row.id })}::text::jsonb)),
              updated_at=clock_timestamp() WHERE id=${row.id}::uuid RETURNING *`;
          if (rows.length !== 1) return fail('RECUPERACION_NO_ACREDITADA');
        }
        return { preparada: true, puede_eliminar: false, eliminacion_habilitada: false };
      });
    } catch (error) {
      if (controlled.has(error)) throw error;
      return fail('CONTRATOS_SQL_NO_VERIFICABLES');
    }
  }
  // DEL-FIX-07: lectura independiente; no reutiliza operation(), que toma FOR UPDATE.
  async function consultarOperaciones({ authorization, operacion_id = null }) {
    if (operacion_id !== null && (typeof operacion_id !== 'string' || !UUID.test(operacion_id))) fail('CONFIRMACION_INVALIDA');
    if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) fail('SESION_REQUERIDA');
    const actor = await authenticate(authorization);
    if (!actor || !UUID.test(actor.id || '') || actor.permanent !== true) fail('SOLO_ADMIN_PERMANENTE');
    const actorId = actor.id.toLowerCase();
    try {
      return await database().begin('isolation level repeatable read read only', async tx => {
        await tx`SET LOCAL statement_timeout = '10s'`;
        await tx`SET LOCAL lock_timeout = '3s'`;
        await tx`SET LOCAL row_security = off`;
        await tx`SELECT set_config('request.jwt.claim.sub', ${actorId}, true),
          set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
        const [identity] = await tx`SELECT current_user::text AS effective_role, session_user::text AS login_role,
          auth.uid()::text AS actor_id, current_setting('transaction_read_only') AS read_only,
          current_setting('transaction_isolation') AS isolation, current_setting('row_security') AS row_security,
          public.es_administrador_permanente_actual() AS permanente`;
        if (identity?.effective_role !== 'postgres' || identity.login_role !== 'postgres' ||
            identity.actor_id !== actorId || identity.read_only !== 'on' || identity.isolation !== 'repeatable read' ||
            identity.row_security !== 'off' || identity.permanente !== true) fail('CONTEXTO_SQL_NO_ACREDITADO');
        const rows = await tx`SELECT id, actor_id, objetivo_id, objetivo_nombre_snapshot, motivo, estado, intentos_auth,
            dependencias_resumen->'paso191'->>'request_id' AS request_id,
            dependencias_resumen->'paso191'->>'fingerprint' AS fingerprint
          FROM public.usuarios_eliminaciones_operaciones
          WHERE actor_id = ${actorId}::uuid
            AND (${operacion_id}::uuid IS NULL OR id = ${operacion_id}::uuid)
            AND estado IN ('PREPARADA','AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION')
          ORDER BY id LIMIT 51`;
        if (rows.length > 50) fail('OPERACION_AMBIGUA'); // No presentar una lista truncada como completa.
        const seen = new Set();
        const result = [];
        for (const row of rows) {
          const input = { usuario_id: row.objetivo_id, operacion_id: row.request_id,
            nombre_confirmacion: row.objetivo_nombre_snapshot, motivo: row.motivo, confirmacion: true };
          if (row.actor_id !== actorId || !UUID.test(row.id || '') || seen.has(row.id) ||
              (operacion_id !== null && row.id !== operacion_id.toLowerCase()) || !validInput(input) ||
              !['PREPARADA','AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION'].includes(row.estado) ||
              !Number.isSafeInteger(row.intentos_auth) || row.intentos_auth < 0 ||
              (row.estado === 'PREPARADA' && row.intentos_auth !== 0) ||
              row.fingerprint !== await fingerprint(actorId, input)) fail('OPERACION_NO_VINCULADA');
          seen.add(row.id);
          result.push({ operacion_id: row.id, request_id: row.request_id, objetivo_id: row.objetivo_id,
            nombre: row.objetivo_nombre_snapshot, motivo: row.motivo, fingerprint: row.fingerprint,
            estado: row.estado, intentos_auth: row.intentos_auth });
        }
        return result;
      });
    } catch (error) {
      if (controlled.has(error)) throw error;
      fail('CONTRATOS_SQL_NO_VERIFICABLES');
    }
  }
  async function certificarConservacion(context, operationId) {
    // Puerto interno de servidor, sin endpoint HTTP nuevo ni parámetros de certificado del navegador.
    try {
      return await transaction({ ...context, write: true }, async (tx, b, input) => {
        const { row } = await operation(tx, operationId, b, input);
        if (row.estado !== 'PREPARADA' || row.intentos_auth !== 0) return fail('INICIO_NO_ACREDITADO');
        const old = row.dependencias_resumen.conservacion_previa_v1;
        if (old !== undefined) {
          await verifyConservation(tx, row, old); // No renovar silenciosamente evidencia obsoleta.
          return { evidencia_vigente: true, habilita_auth: false, sha256: old.sha256 };
        }
        const certificate = await captureConservation(tx, row);
        const rows = await tx`UPDATE public.usuarios_eliminaciones_operaciones
          SET dependencias_resumen = dependencias_resumen || jsonb_build_object('conservacion_previa_v1', ${JSON.stringify(certificate)}::text::jsonb),
            updated_at = clock_timestamp()
          WHERE id=${row.id}::uuid AND estado='PREPARADA' AND intentos_auth=0
            AND NOT (dependencias_resumen ? 'conservacion_previa_v1') RETURNING *`;
        if (rows.length !== 1 || rows[0].dependencias_resumen?.conservacion_previa_v1?.sha256 !== certificate.sha256)
          return fail('CONTRATO_SQL_INVALIDO');
        await verifyConservation(tx, rows[0], rows[0].dependencias_resumen.conservacion_previa_v1);
        return { evidencia_vigente: true, habilita_auth: false, sha256: certificate.sha256 };
      });
    } catch {
      // No revelar errores libres de SQL, manifiestos ni identidades técnicas de Storage.
      return fail('CONSERVACION_NO_ACREDITADA');
    }
  }
  async function conservarDocumentos(context, operationId) {
    try {
      return await transaction({ ...context, write: true }, async (tx, b, input) => {
        const { row } = await operation(tx, operationId, b, input);
        return await conserveDocumentStorage(tx, row);
      });
    } catch { return fail('CONSERVACION_DOCUMENTAL_NO_ACREDITADA'); }
  }
  async function verificarArchivos(context,operationId,phase='antes') {
    async function load(tx,b,input,proof) {
      if(proof?.purpose!==(phase==='antes'?'inicio':'recuperacion')) fail('STORAGE_FISICO_NO_ACREDITADO');
      const {row}=await operation(tx,operationId,b,input),c=row.dependencias_resumen.conservacion_previa_v1;
      if(!c||c.vinculo?.operacion_id!==row.id||c.vinculo.actor_id!==b.actor_id||c.vinculo.objetivo_id!==b.target_id||
        c.vinculo.request_id!==b.request_id||c.vinculo.fingerprint!==b.fingerprint) fail('STORAGE_FISICO_NO_ACREDITADO');
      if(phase==='antes'){
        if(row.estado!=='PREPARADA'||row.intentos_auth!==0) fail('STORAGE_FISICO_NO_ACREDITADO');
        await verifyConservation(tx,row,c);
      }else if(!['AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION','COMPLETADA'].includes(row.estado)||row.intentos_auth!==1)
        fail('STORAGE_FISICO_NO_ACREDITADO');
      const worker=c.evidencia.ledger_laboral.trabajador_actual;
      const [data]=await tx`WITH referencias AS (
        SELECT s.bucket_id,s.name AS path,s.id AS esperado,s.version AS version_esperada,
          s.metadata->'size' AS tamano_esperado,NULL::text AS sha,true AS completa FROM storage.objects s
          WHERE s.owner=${b.target_id}::uuid OR s.owner_id=${b.target_id}::text
        UNION ALL SELECT d.bucket_id,d.storage_path,d.storage_object_id,d.storage_version,to_jsonb(d.tamano_bytes_verificado),
          d.sha256_verificado,(d.estado_reserva='disponible' AND d.storage_object_id IS NOT NULL AND d.storage_version IS NOT NULL
            AND d.sha256_verificado ~ '^[0-9a-f]{64}$') FROM public.cuentas_documentos d
          WHERE d.cuenta_id=${b.target_id}::uuid OR d.creado_por=${b.target_id}::uuid
        UNION ALL SELECT 'documentos-trabajadores',d.storage_path,NULL::uuid,NULL::text,NULL::jsonb,NULL::text,true
          FROM public.trabajadores_documentos d WHERE d.creado_por=${b.target_id}::uuid OR d.trabajador_id=${worker}::uuid
        UNION ALL SELECT 'documentos-prevencionista',d.storage_path,NULL::uuid,NULL::text,NULL::jsonb,NULL::text,true
          FROM public.prevencion_documentos d WHERE d.creado_por=${b.target_id}::uuid
        UNION ALL SELECT x->>'bucket_id',x->>'storage_path',(x->>'id')::uuid,x->>'version',x->'tamano_bytes',x->>'sha256',true
          FROM jsonb_array_elements(${JSON.stringify(row.dependencias_resumen.conservacion_fisica_v1?.antes?.objetos??[])}::text::jsonb) x
      ), inventario AS (SELECT jsonb_build_object('id',s.id,'bucket_id',r.bucket_id,'storage_path',r.path,
        'version',s.version,'tamano_bytes',s.metadata->'size','id_esperado',r.esperado,'version_esperada',r.version_esperada,
        'tamano_esperado',r.tamano_esperado,'sha256_documental',r.sha,'completa',r.completa IS TRUE) AS j
        FROM referencias r LEFT JOIN storage.objects s ON s.bucket_id=r.bucket_id AND s.name=r.path LIMIT 10001)
      SELECT coalesce(jsonb_agg(j),'[]'::jsonb) AS inventario_fisico,
        EXISTS(SELECT 1 FROM auth.users WHERE id=${b.target_id}::uuid) AS auth_presente,
        EXISTS(SELECT 1 FROM public.usuarios WHERE id=${b.target_id}::uuid) AS perfil_presente FROM inventario`;
      if(!data||data.auth_presente!==(phase==='antes')||data.perfil_presente!==(phase==='antes')) fail('STORAGE_FISICO_NO_ACREDITADO');
      return {row,objects:normalizePhysicalInventory(data.inventario_fisico)};
    }
    try{
      if(!['antes','despues'].includes(phase)||!physicalStorageReader) fail('STORAGE_FISICO_NO_ACREDITADO');
      const before=await transaction({...context,write:true},load);
      const original=before.row.dependencias_resumen.conservacion_fisica_v1??null;
      if(original&&(original.version!==1||original.habilita_auth!==false||
        Object.keys(original).some(k=>!['version','habilita_auth','antes','despues'].includes(k))||
        (phase==='antes'&&original.despues))) fail('STORAGE_FISICO_NO_ACREDITADO');
      const receipt=await measurePhysicalStorage(physicalStorageReader,context.authorization,before.objects,
        before.row.dependencias_resumen.conservacion_previa_v1,phase,original?.antes??null);
      if(original?.[phase]&&!samePhysicalReceipt(original[phase],receipt)) fail('STORAGE_FISICO_NO_ACREDITADO');
      // Primera transacción cerrada antes de GET. Segunda revalida sesión, estado y metadatos.
      return await transaction({...context,write:true},async(tx,b,input,proof)=>{
        const now=await load(tx,b,input,proof),current=now.row.dependencias_resumen.conservacion_fisica_v1??null;
        if(JSON.stringify(now.objects)!==JSON.stringify(before.objects)||
          now.row.dependencias_resumen.conservacion_previa_v1.sha256!==before.row.dependencias_resumen.conservacion_previa_v1.sha256||
          JSON.stringify(current)!==JSON.stringify(original)) fail('STORAGE_FISICO_NO_ACREDITADO');
        if(!current?.[phase]){
          const updated={...(current??{version:1,habilita_auth:false}),[phase]:receipt};
          const rows=await tx`UPDATE public.usuarios_eliminaciones_operaciones SET dependencias_resumen=dependencias_resumen||
            jsonb_build_object('conservacion_fisica_v1',${JSON.stringify(updated)}::text::jsonb),updated_at=clock_timestamp()
            WHERE id=${operationId}::uuid AND estado=${now.row.estado}::text AND intentos_auth=${now.row.intentos_auth}::integer
              AND coalesce(dependencias_resumen->'conservacion_fisica_v1','null'::jsonb)=${JSON.stringify(current)}::text::jsonb RETURNING id`;
          if(rows.length!==1||rows[0].id!==operationId) fail('STORAGE_FISICO_NO_ACREDITADO');
        }
        return {fase:phase,archivos:receipt.objetos.length,archivos_verificados:phase==='despues',habilita_auth:false};
      });
    }catch{return fail('STORAGE_FISICO_NO_ACREDITADO');}
  }
  // PASO 363. Contratos V2 nativos. No reutilizar certificados globales V1.
  async function integralGuard(stage, work, trace = null) {
    try { return await work(); }
    catch (error) {
      const safe = new Error('OPERACION_V2_NO_VERIFICABLE'); controlled.add(safe);
      const historical = stage === 'V2_IDENTIDADES_LECTURA' && trace !== null;
      const starting = stage === 'V2_RPC_INICIAR' && trace !== null;
      const sqlstates = historical ? historicalSqlstates : safeSqlstates;
      diagnostics.set(safe, Object.freeze({ etapa: stage, codigo: 'OPERACION_V2_NO_VERIFICABLE',
        ...(historical && historicalSubstages.has(trace.value) ? {subetapa:trace.value} : {}),
        ...(historical && controlled.has(error) && historicalValidationCodes.has(error.message) ? {validacion:error.message} : {}),
        ...(starting && startSubstages.has(trace.value) ? {subetapa:trace.value} : {}),
        ...(starting && !safeSqlstates.has(error?.code) && startValidationCodes.has(error?.message) ? {validacion:error.message} : {}),
        tipo: sqlstates.has(error?.code) ? 'POSTGRESQL' : starting&&!controlled.has(error)&&!startValidationCodes.has(error?.message)?'NO_CLASIFICADO':'VALIDACION_INTERNA',
        ...(sqlstates.has(error?.code) ? { sqlstate: error.code } : {}),
        ...(error?.code === 'P0001' ? { rechazo_sql: safeP0001Rejections.has(error.message)
          ? error.message : 'P0001_NO_CLASIFICADO' } : {}) }));
      throw safe;
    }
  }
  async function integralRow(tx, binding, input, id = null, locked = true) {
    if (id !== null && !UUID.test(id)) fail('OPERACION_NO_VINCULADA');
    const rows = locked
      ? await tx`SELECT * FROM public.usuarios_eliminaciones_operaciones
          WHERE dependencias_resumen->'paso191'->>'request_id'=${binding.request_id} FOR UPDATE`
      : await tx`SELECT * FROM public.usuarios_eliminaciones_operaciones
          WHERE dependencias_resumen->'paso191'->>'request_id'=${binding.request_id}`;
    if (rows.length > 1) fail('OPERACION_AMBIGUA');
    if (!rows.length) { if (id) fail('OPERACION_NO_VINCULADA'); return null; }
    if (id && rows[0].id !== id) fail('OPERACION_NO_VINCULADA');
    const mapped = mapOperation(rows[0], binding, input); await verifyAudit(tx, rows[0], mapped);
    return rows[0];
  }
  function integralCertificate(row) {
    const c = row?.dependencias_resumen?.conservacion_integral_v2;
    if (!c || c.version !== 2 || c.habilita_auth !== false || !/^[0-9a-f]{64}$/.test(c.sha256 || '') ||
        c.vinculo?.operacion_id !== row.id || c.vinculo.actor_id !== row.actor_id || c.vinculo.objetivo_id !== row.objetivo_id ||
        c.vinculo.request_id !== row.dependencias_resumen.paso191?.request_id ||
        c.vinculo.fingerprint !== row.dependencias_resumen.paso191?.fingerprint ||
        !c.registros || Object.keys(c.registros).length !== 46 ||
        Object.entries(c.registros).some(([name, data]) => !integralRelations.has(name) ||
          !Number.isSafeInteger(data?.total) || data.total < 0 || !Array.isArray(data.registros) || data.registros.length !== data.total ||
          data.registros.some(r => !r?.clave || typeof r.clave !== 'object' || Array.isArray(r.clave) || !/^[0-9a-f]{64}$/.test(r.sha256 || ''))) ||
        !Array.isArray(c.inventario)) fail('CONSERVACION_NO_ACREDITADA');
    normalizePhysicalInventory(c.inventario); // 128 / 16 MiB / 64 MiB; sin GET dentro del tx.
    return c;
  }
  const integral = Object.freeze({
    leer: context => integralGuard('V2_LEER', () => transaction({ ...context, write: false, v2Context: true },
      (tx, b, input) => integralRow(tx, b, input, context.pendingOperationId ?? null, false))),
    preparar: context => integralGuard('V2_PREPARAR', () => transaction({ ...context, write: true, v2Context: true }, async (tx, b, input, proof) => {
      if (proof?.purpose !== 'inicio') fail('REAUTENTICACION_NO_ACREDITADA');
      const prior = await integralRow(tx, b, input, context.pendingOperationId ?? null);
      if (context.pendingOperationId && !prior) fail('OPERACION_NO_VINCULADA');
      const [r] = await tx`SELECT public.usuario_eliminacion_preparar_v2(${b.target_id}::uuid,${input.nombre_confirmacion}::text,
        ${input.motivo}::text,true,${b.request_id}::uuid,${b.fingerprint}::text) AS resultado`;
      if (!UUID.test(r?.resultado?.operacion_id || '') || r.resultado.estado !== 'PREPARADA' || r.resultado.habilita_auth !== false ||
          r.resultado.request_id !== b.request_id || (prior && r.resultado.operacion_id !== prior.id)) fail('CONTRATO_SQL_INVALIDO');
      const row = await integralRow(tx, b, input, r.resultado.operacion_id);
      await persistReauthentication(tx, row, proof);
      return row;
    })),
    certificar: (context, id) => integralGuard('V2_CERTIFICAR', () => transaction({ ...context, write: true, reviewOnly: true, v2Context: true }, async (tx, b, input) => {
      await integralRow(tx, b, input, id);
      const [r] = await tx`SELECT public.usuario_eliminacion_certificar_v2(${id}::uuid) AS resultado`;
      const row = await integralRow(tx, b, input, id), c = integralCertificate(row);
      if (!samePhysicalReceipt(r?.resultado, c)) fail('CONTRATO_SQL_INVALIDO');
      return row;
    })),
    async verificarArchivos(context, id, phase) {
      return integralGuard('V2_FISICA_' + (phase === 'antes' ? 'PREVIA' : 'POSTERIOR'), async () => {
        if (!['antes', 'despues'].includes(phase) || !physicalStorageReader) fail('VERIFICACION_FISICA_PENDIENTE');
        const load = () => transaction({ ...context, write: true, reviewOnly: true, v2Context: true }, async (tx, b, input) => {
          const row = await integralRow(tx, b, input, id), c = integralCertificate(row);
          if (phase === 'antes' ? row.estado !== 'PREPARADA' || row.intentos_auth !== 0
            : !['AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION'].includes(row.estado) || row.intentos_auth !== 1)
            fail('INICIO_NO_ACREDITADO');
          const [r] = await tx`SELECT public.usuario_eliminacion_verificar_huellas_v2(${id}::uuid) AS resultado,
            EXISTS(SELECT 1 FROM auth.users WHERE id=${b.target_id}::uuid) AS auth_presente,
            EXISTS(SELECT 1 FROM public.usuarios WHERE id=${b.target_id}::uuid) AS perfil_presente`;
          if (r?.resultado?.registros_conservados !== true || r.resultado.habilita_auth !== false ||
              r.resultado.certificado_sha256 !== c.sha256 || r.auth_presente !== (phase === 'antes') ||
              r.perfil_presente !== (phase === 'antes')) fail('CONSERVACION_NO_ACREDITADA');
          return { row, c };
        });
        const before = await load(), prior = before.row.dependencias_resumen.fisica_integral_v2?.antes?.objetos ?? null;
        if (phase === 'despues' && prior === null) fail('VERIFICACION_FISICA_PENDIENTE');
        const measured = await measureIntegralPhysicalStorage(physicalStorageReader, context.authorization, before.c.inventario, prior);
        // Segunda transacción: renovar Auth/contexto y revalidar todos los datos tras GET.
        return await transaction({ ...context, write: true, reviewOnly: true, v2Context: true }, async (tx, b, input) => {
          const row = await integralRow(tx, b, input, id), c = integralCertificate(row);
          if (c.sha256 !== before.c.sha256 || row.estado !== before.row.estado || row.intentos_auth !== before.row.intentos_auth ||
              !samePhysicalReceipt(c.inventario, before.c.inventario) ||
              !samePhysicalReceipt(row.dependencias_resumen.fisica_integral_v2 ?? null, before.row.dependencias_resumen.fisica_integral_v2 ?? null))
            fail('OPERACION_CAMBIO');
          const [r] = await tx`SELECT public.usuario_eliminacion_registrar_fisica_v2(${id}::uuid,${phase}::text,${JSON.stringify(measured)}::text::jsonb) AS resultado`;
          if (r?.resultado?.fase !== phase || r.resultado.archivos !== measured.length || r.resultado.habilita_auth !== false) fail('CONTRATO_SQL_INVALIDO');
          return { archivos: measured.length, fase: phase };
        });
      });
    },
    iniciar: (context, id) => {
      const trace={value:'ENTRADA'};
      return integralGuard('V2_RPC_INICIAR', () => transaction({ ...context, write: true, v2Context: true, startTrace:trace }, async (tx, b, input, proof) => {
      trace.value='LEER_OPERACION_PREVIA';
      const row = await integralRow(tx, b, input, id);
      await persistReauthentication(tx, row, proof,trace);
      trace.value='EJECUTAR_INICIO_SQL';
      const [r] = await tx`SELECT public.usuario_eliminacion_iniciar_v2(${id}::uuid) AS resultado`;
      trace.value='VALIDAR_RESPUESTA_SQL';
      if(r?.resultado?.operacion_id!==id||r.resultado.estado!=='AUTH_EN_CURSO'||r.resultado.habilita_auth!==false||
        !UUID.test(r.resultado.attempt_id||''))fail('CONTRATO_SQL_INVALIDO');
      trace.value='LEER_OPERACION_POSTERIOR';
      const updated = await integralRow(tx, b, input, id);
      trace.value='VALIDAR_ESTADO_POSTERIOR';
      if (updated.estado !== 'AUTH_EN_CURSO' || updated.intentos_auth !== 1 ||
          updated.dependencias_resumen.paso191?.attempt_id !== r.resultado.attempt_id) fail('CONTRATO_SQL_INVALIDO');
      trace.value='VALIDAR_CERTIFICADO_POSTERIOR';
      integralCertificate(updated); return updated;
    }),trace);
    },
    verificarInicio: (context, id, attempt) => integralGuard('V2_VERIFICAR_INICIO', () => transaction({ ...context, write: true, v2Context: true }, async (tx, b, input, proof) => {
      const row = await integralRow(tx, b, input, id), stored = row.dependencias_resumen.paso192?.reauth;
      integralCertificate(row);
      const copy = { ...stored }; delete copy.operation_id; copy.consumed_at = null;
      if (proof?.purpose !== 'inicio' || !samePhysicalReceipt(copy, proof) || stored.operation_id !== id ||
          !Number.isFinite(stored.consumed_at) || stored.consumed_at < proof.verified_at || stored.consumed_at >= proof.expires_at ||
          row.estado !== 'AUTH_EN_CURSO' || row.intentos_auth !== 1 || row.dependencias_resumen.paso191?.attempt_id !== attempt)
        fail('REAUTENTICACION_NO_VINCULADA');
      const [r] = await tx`SELECT public.usuario_eliminacion_v2_habilitada() AS abierta,
        public.usuario_eliminacion_documentos_autorizados_v2(${JSON.stringify(row)}::text::jsonb) AS conservada,
        public.usuario_eliminacion_verificar_huellas_v2(${id}::uuid) AS evidencia,
        EXISTS(SELECT 1 FROM auth.users WHERE id=${b.target_id}::uuid) AS auth_presente,
        EXISTS(SELECT 1 FROM public.usuarios WHERE id=${b.target_id}::uuid AND estado IS FALSE) AS perfil_bloqueado`;
      if (r?.abierta !== true || r.conservada !== true || r.evidencia?.registros_conservados !== true ||
          r.auth_presente !== true || r.perfil_bloqueado !== true) fail('INICIO_NO_ACREDITADO');
      return mapOperation(row, b, input);
    })),
    confirmar: (context, id) => integralGuard('V2_CONFIRMAR_AUTH', () => transaction({ ...context, write: true, reviewOnly: true, v2Context: true }, async (tx, b, input) => {
      await integralRow(tx, b, input, id);
      const [r] = await tx`SELECT public.usuario_eliminacion_confirmar_auth_v2(${id}::uuid) AS resultado`;
      if (r?.resultado?.operacion_id !== id || r.resultado.estado !== 'AUTH_ELIMINADA' || r.resultado.habilita_auth !== false) fail('CONTRATO_SQL_INVALIDO');
      return await integralRow(tx, b, input, id);
    })),
    recuperar: (context, id) => integralGuard('V2_RECUPERAR', () => transaction({ ...context, write: true, v2Context: true }, async (tx, b, input, proof) => {
      const row = await integralRow(tx, b, input, id), old = row.dependencias_resumen.paso192?.recovery_reauth;
      if (proof?.purpose !== 'recuperacion' || row.intentos_auth !== 1 || !['AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION'].includes(row.estado) ||
          (old?.proof_id === proof.proof_id && old.consumed_at != null) ||
          (old && old.proof_id !== proof.proof_id && (old.verified_at >= proof.verified_at || old.consumed_at >= proof.verified_at))) fail('RECUPERACION_NO_ACREDITADA');
      await tx`UPDATE public.usuarios_eliminaciones_operaciones SET dependencias_resumen=dependencias_resumen||
        jsonb_build_object('paso192',coalesce(dependencias_resumen->'paso192','{}'::jsonb)||
          jsonb_build_object('recovery_reauth',${JSON.stringify({ ...proof, operation_id: id })}::text::jsonb)),updated_at=clock_timestamp() WHERE id=${id}::uuid`;
      const [r] = await tx`SELECT public.usuario_eliminacion_recuperar_v2(${id}::uuid) AS resultado`;
      const result=r?.resultado;
      const review=result?.requiere_revision===true||result?.estado==='REQUIERE_REVISION';
      // El contrato SQL de Auth presente puede omitir operacion_id; solo se
      // admite esa forma con su código exacto y la fila original bloqueada.
      if(!result||result.habilita_auth!==false||
        (result.operacion_id!==id&&!(review&&result.operacion_id==null&&result.codigo==='AUTH_TODAVIA_PRESENTE'))||
        !(review?['AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION'].includes(result.estado):result.estado==='AUTH_ELIMINADA'))
        fail('RECUPERACION_NO_ACREDITADA');
      const updated=await integralRow(tx,b,input,id);
      if(updated.estado!==result.estado||updated.intentos_auth!==1)fail('RECUPERACION_NO_ACREDITADA');
      // No arrojar una excepción por un resultado legítimo de revisión: la
      // transacción debe conservar la evidencia que acaba de persistir SQL.
      return review?{...updated,requiere_revision:true,
        ...(result.codigo==='AUTH_TODAVIA_PRESENTE'?{codigo_revision:result.codigo}:{})}:updated;
    })),
    finalizar: (context, id) => integralGuard('V2_FINALIZAR', () => transaction({ ...context, write: true, reviewOnly: true, v2Context: true }, async (tx, b, input) => {
      await integralRow(tx, b, input, id);
      const [r] = await tx`SELECT public.usuario_eliminacion_finalizar_v2(${id}::uuid) AS resultado`;
      const row = await integralRow(tx, b, input, id), mapped = mapOperation(row, b, input);
      if (!['COMPLETADA','YA_COMPLETADA'].includes(r?.resultado?.resultado) || r.resultado.operacion_id !== id ||
          r.resultado.habilita_auth !== false || !UUID.test(r.resultado.auditoria_id || '') ||
          row.auditoria_id !== r.resultado.auditoria_id || row.estado !== 'COMPLETADA' || mapped.audit_verified !== true)
        fail('AUDITORIA_NO_VERIFICABLE');
      return mapped;
    })),
    revisar: (context, id) => integralGuard('V2_REGISTRAR_REVISION', () => transaction({ ...context, write: true, reviewOnly: true, v2Context: true }, async (tx, b, input) => {
      const row = await integralRow(tx, b, input, id);
      if(row.estado!=='AUTH_EN_CURSO')return {persisted:row.estado==='REQUIERE_REVISION'};
      const c=integralCertificate(row),e=row.dependencias_resumen.ejecucion_integral_v2;
      if(row.intentos_auth!==1||row.dependencias_resumen.conservacion_historica_certificada!==true||
        row.dependencias_resumen.autorizacion_irreversible_confirmada!==true||e?.version!==2||
        e.certificado_sha256!==c.sha256||!UUID.test(e.attempt_id||'')||e.attempt_id!==row.dependencias_resumen.paso191?.attempt_id)
        fail('CONTRATO_SQL_INVALIDO');
      // Rama instalada INCIERTA: solo estado/código/fecha. La guarda V2 permite
      // esta transición con certificado e intento intactos; no confirma Auth.
      const [r]=await tx`SELECT public.usuario_eliminacion_registrar_resultado_auth_v1(${id}::uuid,'INCIERTA'::text,'RESULTADO_NO_ACREDITADO'::text) AS resultado`;
      const updated=await integralRow(tx,b,input,id);
      const immutable=x=>{const copy={...x};delete copy.estado;delete copy.ultimo_error_codigo;delete copy.updated_at;return copy;};
      if(r?.resultado?.operacion_id!==id||r.resultado.estado!=='REQUIERE_REVISION'||updated.estado!=='REQUIERE_REVISION'||
        updated.ultimo_error_codigo!=='RESULTADO_NO_ACREDITADO'||!samePhysicalReceipt(immutable(row),immutable(updated)))fail('CONTRATO_SQL_INVALIDO');
      integralCertificate(updated);
      return {persisted:true};
    })),
  });
  // READ WRITE solo para la fase RPC de tareas; las demás lecturas y la fase
  // privada histórica conservan READ ONLY. tasks no es una opción del cliente.
  async function historicalTransaction(authorization, permanent, work, tasks = false, trace = null) {
    if(trace)trace.value='AUTENTICACION';
    if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) fail('SESION_REQUERIDA');
    const actor = await authenticate(authorization);
    if (!actor || !UUID.test(actor.id || '') || (permanent && actor.permanent !== true)) fail('SOLO_ADMIN_PERMANENTE');
    if(trace)trace.value='SESION_JWT';
    const sessionId = readAuthenticatedSessionId(authorization, actor.id);
    if(trace)trace.value='CONEXION_TRANSACCION';
    return database().begin(tasks ? 'isolation level read committed read write' : 'isolation level repeatable read read only', async tx => {
      if(trace)trace.value='CONFIGURACION_TRANSACCION';
      await tx`SET LOCAL statement_timeout = '10s'`;
      await tx`SET LOCAL lock_timeout = '3s'`;
      await tx`SET LOCAL row_security = off`;
      if(trace)trace.value='CLAIMS';
      await tx`SELECT set_config('request.jwt.claim.sub',${actor.id},true),
        set_config('request.jwt.claims',${JSON.stringify({sub:actor.id,role:'authenticated',session_id:sessionId})}::text,true)`;
      if(trace)trace.value='CONTEXTO_POSTGRES';
      const [identity] = await tx`SELECT current_user::text AS effective_role,session_user::text AS login_role,
        current_database() AS database_name,current_setting('transaction_read_only') AS read_only,
        (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass_rls,
        auth.uid()::text AS actor_id,u.estado,public.es_administrador_actual() AS admin,
        public.es_administrador_permanente_actual() AS permanent,public.normalizar_nombre_rol(r.nombre) AS role
        FROM public.usuarios u LEFT JOIN public.roles r ON r.id=u.rol_id WHERE u.id=${actor.id}::uuid`;
      if (identity?.effective_role !== 'postgres' || identity.login_role !== 'postgres' || identity.database_name !== 'postgres' ||
          identity.read_only !== (tasks ? 'off' : 'on') || identity.bypass_rls !== true || identity.actor_id !== actor.id || identity.estado !== true ||
          (permanent && identity.permanent !== true)) fail('CONTEXTO_SQL_NO_ACREDITADO');
      const result = await work(tx, actor, identity);
      if(trace)trace.value='CIERRE_TRANSACCION';
      return result;
    });
  }
  async function consultarResumen({ authorization, usuario_id }) {
    if (!UUID.test(usuario_id || '')) fail('CONFIRMACION_INVALIDA');
    return integralGuard('V2_RESUMEN_LECTURA', () => historicalTransaction(authorization, true, async tx => {
      const [r] = await tx`SELECT public.usuario_eliminacion_resumen_v2(${usuario_id}::uuid) AS resultado`;
      const d = r?.resultado;
      if (d?.contrato !== 'usuario-eliminacion-resumen/v2' || d.usuario_id !== usuario_id.toLowerCase() ||
          !Array.isArray(d.registros) || d.registros.length !== 46 ||
          new Set(d.registros.map(x => x.tabla)).size !== 46 || d.registros.some(x => !integralRelations.has(x.tabla) || !Number.isSafeInteger(x.cantidad) || x.cantidad<0) ||
          d.conservacion_certificada !== false || d.eliminacion_habilitada !== false || d.puede_eliminar !== false)
        fail('CONTRATO_SQL_INVALIDO');
      return d;
    }));
  }
  async function consultarHabilitacion({authorization}) {
    return integralGuard('V2_HABILITACION_LECTURA',()=>historicalTransaction(authorization,true,async tx=>{
      const [r]=await tx`SELECT public.usuario_eliminacion_v2_habilitada() AS abierta,
        transaction_timestamp() AS comprobada_en`;
      const fecha=new Date(r?.comprobada_en);
      if(typeof r?.abierta!=='boolean'||r.comprobada_en==null||!Number.isFinite(fecha.getTime()))fail('CONTRATO_SQL_INVALIDO');
      return {sql:r.abierta,comprobada_en:fecha.toISOString()};
    }));
  }
  async function consultarIdentidades({ authorization, modulo, registros, tareas = [] }) {
    const tasks = ['TAREAS','TAREAS_REGISTROS','TAREAS_OPERACIONES'].includes(modulo);
    const scope = Object.hasOwn(historicalScopes, modulo || '') ? historicalScopes[modulo] : null;
    if (!scope || !Array.isArray(registros) || !registros.length || registros.length>100 ||
        (modulo==='DOCUMENTOS_FICHA' && registros.length!==1) ||
        registros.some(id=>typeof id!=='string'||!UUID.test(id)) || new Set(registros.map(id=>id.toLowerCase())).size!==registros.length)
      fail('CONFIRMACION_INVALIDA');
    const trace={value:'ENTRADA'};
    const finish=async(tx,{contexts,allowed,revisions,actor:preparedActor})=>{
      trace.value='RESTAURAR_ROL';
      await tx`SET LOCAL ROLE postgres`;
      await tx`SET LOCAL row_security = off`;
      trace.value='CONTEXTO_PRIVADO';
      const [root] = await tx`SELECT current_user::text AS role,session_user::text AS login_role,
        current_setting('transaction_read_only') AS read_only`;
      if(root?.role!=='postgres'||root.login_role!=='postgres'||root.read_only!=='on')fail('CONTEXTO_SQL_NO_ACREDITADO');
      trace.value='RPC_IDENTIDADES';
      const rows=contexts.length ? await tx`SELECT * FROM public.usuario_eliminacion_identidades_consultar_v2(${JSON.stringify(contexts)}::text::jsonb)` : [];
      trace.value='RESPUESTA_IDENTIDADES';
      const seen=new Set();
      for(const row of rows){
        const key=row.registro_id+'|'+row.origen_id+'|'+row.referencia_id+'|'+row.tipo;
        if(seen.has(key)||row.cuenta_eliminada!==true||!UUID.test(row.cuenta_id||'')||
           typeof row.nombre_snapshot!=='string'||!row.nombre_snapshot.trim()||
           !contexts.some(c=>c.registro_id===row.registro_id&&c.origen_id===row.origen_id&&c.referencia_id===row.referencia_id&&c.tipo===row.tipo))fail('CONTRATO_SQL_INVALIDO');
        seen.add(key);
      }
      // Solo este alcance administrativo resuelve la cuenta anterior de una
      // ficha. El helper certifica la eliminación y su vínculo original; RLS
      // documental decide después qué documentos puede consultar el actor.
      let cuentasDocumentales;
      if(modulo==='DOCUMENTOS_FICHA'){
        trace.value='DOCUMENTOS_HISTORICOS_RLS';
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SET LOCAL row_security = on`;
        const [security]=await tx`SELECT current_user::text AS role,auth.uid()::text AS actor_id,
          current_setting('transaction_read_only') AS read_only,row_security_active('public.cuentas_documentos'::regclass) AS active,
          (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass`;
        if(security?.role!=='authenticated'||security.actor_id!==preparedActor||security.read_only!=='on'||security.active!==true||security.bypass!==false)
          fail('CONTEXTO_SQL_NO_ACREDITADO');
        const accounts=[...new Set(rows.map(r=>r.cuenta_id))];
        const docs=accounts.length?await tx`SELECT id,cuenta_id FROM public.cuentas_documentos
          WHERE cuenta_id=ANY(${accounts}::uuid[]) AND estado_reserva='disponible'`:[];
        if(docs.some(d=>!UUID.test(d.id||'')||!accounts.includes(d.cuenta_id)))fail('CONTRATO_SQL_INVALIDO');
        cuentasDocumentales=rows.filter(r=>docs.some(d=>d.cuenta_id===r.cuenta_id))
          .map(r=>({trabajador_id:r.referencia_id,cuenta_id:r.cuenta_id}));
        await tx`SET LOCAL ROLE postgres`;
        await tx`SET LOCAL row_security = off`;
      }
      return {contrato:'usuario-identidades-historicas/v2',modulo,registros_autorizados:allowed,
        ...(cuentasDocumentales?{cuentas_documentales:cuentasDocumentales}:{}),
        identidades:rows.map(({registro_id,origen_id,referencia_id,tipo,nombre_snapshot,cuenta_eliminada})=>
          ({registro_id,origen_id,referencia_id,tipo,nombre_snapshot,cuenta_eliminada,
            ...(modulo==='TAREAS_OPERACIONES'?{revision:revisions.get(registro_id+'|'+origen_id)}:{})}))};
    };
    return integralGuard('V2_IDENTIDADES_LECTURA', async () => {
    const prepared=await historicalTransaction(authorization, false, async (tx, actor, identity) => {
      trace.value='AUTORIZACION_MODULO';
      if (identity.admin !== true && (scope.admin || ![...(scope.noTech?[]:['tecnico']),...(scope.reception?['recepcion']:[])].includes(identity.role)))
        fail('SOLO_ADMIN_PERMANENTE');
      // Reducción real de privilegios, solo local al tx. Auth.uid procede del
      // JWT validado. Error => ROLLBACK restaura rol/GUC; éxito restaura antes del
      // helper histórico privado. No se usa postgres para saltarse RLS del módulo.
      trace.value='CAMBIO_ROL_LECTURA';
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SET LOCAL row_security = on`;
      // 373F: no SELECT de asignaciones/operaciones. La RPC instalada conserva
      // alcance laboral, autorización y cursores bajo el JWT real del actor.
      const taskRead = async () => {
        trace.value='CONTEXTO_LECTURA';
        const [security]=await tx`SELECT current_user::text AS task_role,auth.uid()::text AS actor_id,
          current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only,
          current_setting('row_security') AS rls,(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass`;
        if(security?.task_role!=='authenticated'||security.actor_id!==actor.id||security.isolation!=='read committed'||
          security.read_only!=='off'||security.rls!=='on'||security.bypass!==false)fail('CONTEXTO_SQL_NO_ACREDITADO');
        trace.value='PARAMETROS_TAREAS';
        if(!Array.isArray(tareas)||tareas.length>100||tareas.some(id=>typeof id!=='string'||!UUID.test(id)))fail('CONFIRMACION_INVALIDA');
        const wanted=registros.map(id=>id.toLowerCase()), visible=[];
        const parents=modulo==='TAREAS'?[...new Set(tareas.map(id=>id.toLowerCase()))]:wanted;
        if(!parents.length)fail('CONTRATO_SQL_INVALIDO');
        for(const parent of parents){
          if(modulo==='TAREAS_OPERACIONES'){
            trace.value='RPC_ACCESO_TAREA';
            const [access]=await tx`SELECT public.tareas_pendientes_consultar_v1(p_vista => 'TAREAS'::text,p_tarea_id => ${parent}::uuid,p_limite => 1) AS resultado`;
            trace.value='RESPUESTA_ACCESO_TAREA';
            if(!Array.isArray(access?.resultado?.items))fail('CONTRATO_SQL_INVALIDO');
            if(!access.resultado.items.length)continue;
            if(access.resultado.items.length!==1||access.resultado.items[0].id!==parent)fail('CONTRATO_SQL_INVALIDO');
          }
          const vista=modulo==='TAREAS'?'ASIGNACIONES':modulo==='TAREAS_OPERACIONES'?'HISTORIAL':'TAREAS';
          let cursor=null;const seen=new Set();
          for(let page=0;page<20;page++){
            trace.value='RPC_TAREAS';
            const [r]=await tx`SELECT public.tareas_pendientes_consultar_v1(
              p_vista => ${vista}::text,p_tarea_id => ${parent}::uuid,
              p_cursor_id => ${vista==='HISTORIAL'?null:cursor}::uuid,
              p_cursor_revision => ${vista==='HISTORIAL'?cursor:null}::bigint,p_limite => 50) AS resultado`;
            trace.value='RESPUESTA_TAREAS';
            const d=r?.resultado;
            if(!Array.isArray(d?.items)||d.items.length>50||typeof d.hay_mas!=='boolean')fail('CONTRATO_SQL_INVALIDO');
            for(const row of d.items){
              if(vista==='HISTORIAL'){
                // revision es revision_resultante proyectada. No se inventa un
                // UUID de operación: esta proyección conserva sus snapshots.
                if(!Number.isSafeInteger(row.revision)||row.revision<1)fail('CONTRATO_SQL_INVALIDO');
              }else if(!UUID.test(row.id||'')||(vista==='ASIGNACIONES'&&row.tarea_id!==parent)||(vista==='TAREAS'&&row.id!==parent))fail('CONTRATO_SQL_INVALIDO');
              if(vista==='ASIGNACIONES'&&wanted.includes(row.id))visible.push({id:row.id});
              if(vista==='TAREAS')visible.push({id:row.id,retirada_por:row.retirada_por});
            }
            if(vista==='HISTORIAL'){
              // La autorización proviene de la propia RPC, incluso sin eventos.
              visible.push({id:parent});break;
            }
            if(!d.hay_mas)break;
            trace.value='CURSOR_TAREAS';
            const next=d.siguiente_cursor;
            if(!UUID.test(next||'')||next!==d.items.at(-1)?.id||seen.has(next)||page===19)fail('CONTRATO_SQL_INVALIDO');
            seen.add(next);cursor=next;
          }
        }
        return visible;
      };
      const read = async (spec, ids) => {
        trace.value='LECTURA_RLS';
        const [security] = await tx`SELECT current_user::text AS role,auth.uid()::text AS actor_id,
          current_setting('transaction_read_only') AS read_only,row_security_active(${spec.table}::regclass) AS active,
          (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass`;
        if (security?.role!=='authenticated' || security.actor_id!==actor.id || security.read_only!=='on' || security.active!==true || security.bypass!==false)
          fail('CONTEXTO_SQL_NO_ACREDITADO');
        const key=spec.key||'id', fields=[...new Set([key,...(spec.originKey?[spec.originKey]:[]),...(spec.extras||[]),...(spec.accounts||[]),...(spec.workers||[])])];
        // Tabla/columnas son únicamente las constantes de historicalScopes.
        return tx.unsafe(`SELECT ${fields.join(',')} FROM ${spec.table} WHERE ${key}=ANY($1::uuid[])`,[ids]);
      };
      const visible = tasks ? await taskRead() : await read(scope,registros.map(id=>id.toLowerCase())), allowed = visible.map(r=>r.id);
      trace.value='CONTEXTOS_HISTORICOS';
      const contexts=[]; const revisions=new Map();
      const collect = (rows,spec) => rows.forEach(row=>{
        const id=row[spec.key||'id'];
        for(const [kind,fields] of [['cuenta',spec.accounts||[]],['trabajador',spec.workers||[]]])
          for(const field of fields)if(row[field]!=null){
            if(!UUID.test(row[field]))fail('CONTRATO_SQL_INVALIDO');
            const c={registro_id:id,origen_id:spec.originKey?row[spec.originKey]:id,
              tabla:spec.originKey?spec.table:scope.table,referencia_id:row[field],tipo:kind};
            if(!UUID.test(c.origen_id||''))fail('CONTRATO_SQL_INVALIDO');
            if(modulo==='TAREAS_OPERACIONES'){
              if(!Number.isSafeInteger(row.revision)||row.revision<0)fail('CONTRATO_SQL_INVALIDO');
              revisions.set(id+'|'+c.origen_id,row.revision);
            }
            if(!contexts.some(x=>samePhysicalReceipt(x,c)))contexts.push(c);
          }
      });
      collect(visible,tasks?{table:scope.table,accounts:modulo==='TAREAS_REGISTROS'?['retirada_por']:[]}:scope);
      for(const child of tasks?[]:scope.children||[])if(allowed.length)collect(await read(child,allowed),child);
      if(contexts.length>600)fail('CONTRATO_SQL_INVALIDO');
      const prepared={contexts,allowed,revisions,actor:actor.id,admin:identity.admin,role:identity.role};
      // La RPC de tareas requiere READ WRITE (p. ej. sus bloqueos internos).
      // Se cierra esa transacción antes de cualquier helper histórico privado.
      if(tasks)return prepared;
      return finish(tx,prepared);
    },tasks,trace);
    if(!tasks)return prepared;
    // Nueva sesión Auth validada y nueva transacción READ ONLY. Los contextos
    // provienen exclusivamente de registros devueltos por la RPC autorizada.
    return historicalTransaction(authorization,false,async(tx,actor,identity)=>{
      trace.value='AUTORIZACION_MODULO';
      if(actor.id!==prepared.actor||identity.admin!==prepared.admin||identity.role!==prepared.role)
        fail('CONTEXTO_SQL_NO_ACREDITADO');
      return finish(tx,prepared);
    },false,trace);
    },trace);

  }
  return Object.freeze({ dispatch, prepareRecovery, consultarOperaciones, consultarResumen, consultarHabilitacion, consultarIdentidades, certificarConservacion, conservarDocumentos, verificarArchivos, integral,
    // No puede activar Auth ni el coordinador mediante una opción o variable de entorno.
    execute: async () => ({ error: 'ELIMINACION_REAL_DESHABILITADA', puede_eliminar: false, eliminacion_habilitada: false }),
  });
}
