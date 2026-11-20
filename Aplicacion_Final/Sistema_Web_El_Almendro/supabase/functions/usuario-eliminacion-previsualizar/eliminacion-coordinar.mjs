// Paso 169. Planificador de intenciones; no ejecuta SQL ni Auth administrativo.
// Ningún consumidor de estas intenciones está conectado a index.ts.
import { validInput } from './eliminacion-preparar.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES = ['PREPARADA', 'AUTH_EN_CURSO', 'AUTH_ELIMINADA', 'COMPLETADA', 'REQUIERE_REVISION'];
const disabled = body => ({ ...body, simulacion: true, puede_eliminar: false,
  eliminacion_habilitada: false, eliminacion_ejecutada: false, validacion_integral_completa: false });
const fail = code => { throw new Error(code); };
const count = n => Number.isSafeInteger(n) && n >= 0;
function checkReport(data, input, actor) {
  if (data?.callerPermanent !== true) fail('PRIVILEGIO_CAMBIO');
  if (data.targetExists !== true || data.authExists !== true) fail('CUENTA_NO_VERIFICABLE');
  if (data.targetName !== input.nombre_confirmacion) fail('NOMBRE_NO_COINCIDE');
  if (actor === input.usuario_id.toLowerCase()) fail('CUENTA_PROPIA');
  if (typeof data.targetPermanent !== 'boolean' || !count(data.permanentCount) ||
      !count(data.assignments?.mantenciones) || !count(data.assignments?.tareas) || !count(data.storage?.total)) fail('CONTEOS_NO_VERIFICABLES');
  if (data.targetPermanent && data.permanentCount <= 1) fail('ULTIMO_ADMIN_PERMANENTE');
  if (data.assignments.mantenciones || data.assignments.tareas || data.storage.total) fail('DEPENDENCIAS_INCOMPATIBLES');
}
export async function fingerprint(actor, input) {
  const canonical = JSON.stringify([actor, input.usuario_id.toLowerCase(), input.operacion_id.toLowerCase(),
    input.nombre_confirmacion, input.motivo.trim(), input.confirmacion]);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export function createDeletionCoordinator({ authenticate, inspect, verifyRecentIdentity, verifyBeforeIrreversible, certificationInSql = false }) {
  // Incondicional, incluso si se inyectan dependencias privilegiadas o flags adicionales.
  const execute = async () => ({ error: 'ELIMINACION_REAL_DESHABILITADA',
    puede_eliminar: false, eliminacion_habilitada: false, eliminacion_ejecutada: false,
    validacion_integral_completa: false });

  async function* simulate({ authorization, input }) {
    let operation; let reviewOperation; let authorizedAttempt; let attempted = false;
    // Los retornos de yield son evidencia del adaptador de pruebas, NUNCA del JSON frontend.
    const intent = (kind, payload) => ({ simulacion: true, kind, payload });
    try {
      if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) fail('SESION_REQUERIDA');
      const actor = await authenticate(authorization);
      if (!actor || typeof actor.id !== 'string' || !UUID.test(actor.id) || actor.permanent !== true) fail('SOLO_ADMIN_PERMANENTE');
      if (!validInput(input)) fail('CONFIRMACION_INVALIDA');
      // Copia de entrada antes de esperar dependencias: evita cambios de objetivo durante la secuencia.
      input = { ...input, usuario_id: input.usuario_id.toLowerCase(), operacion_id: input.operacion_id.toLowerCase(), motivo: input.motivo.trim() };
      const actorId = actor.id.toLowerCase();
      if (actorId === input.usuario_id) fail('CUENTA_PROPIA');
      const identity = await verifyRecentIdentity({ actorId, input, authorization });
      if (identity !== true) fail('REAUTENTICACION_NO_ACREDITADA');
      const binding = { actor_id: actorId, target_id: input.usuario_id,
        request_id: input.operacion_id, fingerprint: await fingerprint(actorId, input) };
      const bound = op => op && typeof op.id === 'string' && UUID.test(op.id) && STATES.includes(op.state) &&
        Object.entries(binding).every(([key, value]) => op[key] === value);
      const authorized = op => bound(op) && op.conservacion_historica_certificada === true &&
        op.execution_authorized === true && typeof op.attempt_id === 'string' && UUID.test(op.attempt_id) &&
        (!authorizedAttempt || op.attempt_id === authorizedAttempt);
      operation = yield intent('LEER_OPERACION', binding);
      if (operation === null) {
        checkReport(await inspect(actorId, input.usuario_id), input, actorId);
        operation = yield intent('PREPARAR_SQL', { ...binding, nombre: input.nombre_confirmacion, motivo: input.motivo, confirmacion: true });
      }
      if (!bound(operation)) fail('OPERACION_NO_VINCULADA');
      reviewOperation = operation;
      if (authorized(operation)) authorizedAttempt = operation.attempt_id;
      if (operation.state === 'COMPLETADA') {
        if (!authorized(operation) || operation.audit_verified !== true) fail('COMPLETADO_NO_ACREDITADO');
        return disabled({ resultado_simulado: 'COMPLETADA', repetida: true });
      }
      if (operation.state === 'REQUIERE_REVISION') {
        const previous = operation;
        operation = yield intent('RECONCILIAR_SQL', { operation: previous });
        if (!authorized(operation) || !['AUTH_EN_CURSO', 'AUTH_ELIMINADA'].includes(operation.state)) fail('REVISION_MANUAL_REQUERIDA');
        reviewOperation = operation; authorizedAttempt = operation.attempt_id;
        // Recuperación solo verifica/finaliza. Nunca reintenta la eliminación de Auth.
      }
      if (operation.state === 'PREPARADA') {
        const fresh = await inspect(actorId, input.usuario_id);
        checkReport(fresh, input, actorId);
        // En ejecución servidor, el SQL instalado certifica dentro del inicio atómico.
        if (!certificationInSql && fresh.historicalProtectionVerified !== true) fail('CONSERVACION_HISTORICA_PENDIENTE');
        attempted = true; // También cubre commit de inicio cuyo resultado no llegó al servidor.
        operation = yield intent('CERTIFICAR_Y_AUTORIZAR_INICIO_SQL', { operation });
        if (!authorized(operation) || operation.state !== 'AUTH_EN_CURSO') fail('INICIO_NO_ACREDITADO');
        reviewOperation = operation; authorizedAttempt = operation.attempt_id;
        attempted = true;
        // Revalidación posterior al inicio durable. No sustituye reservas/CAS SQL entre workers.
        const current = await authenticate(authorization);
        if (current?.id?.toLowerCase() !== actorId || current.permanent !== true) fail('PRIVILEGIO_CAMBIO');
        checkReport(await inspect(actorId, input.usuario_id), input, actorId);
        // Puerto exclusivo de servidor: preview vigente, reauth, cobertura/cascadas, políticas y reserva.
        // Sin adaptador acreditado se bloquea; nunca aceptar estos resultados desde el body.
        if (typeof verifyBeforeIrreversible !== 'function' || await verifyBeforeIrreversible({
          actorId, input: { ...input }, operation: structuredClone(operation),
        }) !== true) fail('INICIO_IRREVERSIBLE_NO_ACREDITADO');
        const auth = yield intent('ELIMINAR_AUTH_SIMULADO', { operation });
        if (auth?.outcome !== 'acknowledged') fail('RESULTADO_AUTH_INCIERTO');
      }
      // Un AUTH_EN_CURSO ya existente jamás dispara otra eliminación.
      if (!authorized(operation) || !['AUTH_EN_CURSO', 'AUTH_ELIMINADA'].includes(operation.state)) fail('EJECUCION_PREVIA_NO_ACREDITADA');
      const observation = yield intent('VERIFICAR_AUSENCIA', { operation });
      if (observation?.auth_absent !== true || observation.profile_absent !== true || observation.history_preserved !== true)
        fail('RESULTADO_NO_VERIFICABLE');
      if (operation.state === 'AUTH_EN_CURSO') {
        operation = yield intent('MARCAR_AUTH_ELIMINADA_SQL', { operation });
        if (!authorized(operation) || operation.state !== 'AUTH_ELIMINADA') fail('TRANSICION_NO_ACREDITADA');
        reviewOperation = operation;
      }
      operation = yield intent('FINALIZAR_SQL_ENDURECIDA', { operation });
      if (!authorized(operation) || operation.state !== 'COMPLETADA' || operation.audit_verified !== true) fail('AUDITORIA_NO_VERIFICABLE');
      return disabled({ resultado_simulado: 'COMPLETADA', repetida: false });
    } catch {
      // No exponer errores internos. El adaptador SQL futuro debe persistir revisión sin falsear éxito.
      if (reviewOperation && (attempted || ['AUTH_EN_CURSO', 'AUTH_ELIMINADA', 'REQUIERE_REVISION'].includes(reviewOperation.state))) {
        try {
          const evidence = yield intent('REGISTRAR_REVISION_SQL', { operation: reviewOperation, codigo: 'RESULTADO_NO_ACREDITADO' });
          return disabled({ error: 'REQUIERE_REVISION', operacion_id: reviewOperation.id, revision_registrada: evidence?.persisted === true });
        } catch { return disabled({ error: 'REQUIERE_REVISION', operacion_id: reviewOperation.id, revision_registrada: false }); }
      }
      return disabled({ error: 'PRECONDICIONES_NO_ACREDITADAS' });
    }
  }
  return Object.freeze({ execute, simulate });
}

// PASO 363. Puerto servidor; ninguna dependencia ni evidencia procede del body.
// SQL V2 concede/consume el intento. Un intento persistido nunca vuelve a Auth.
/** @param {any} dependencies */
export function createIntegralDeletionCoordinator({ enabled, authenticate, adapter, reauthenticate, deleteAuth, diagnostic = () => undefined }) {
  return Object.freeze({ async execute(original) {
    if (enabled() !== true) return { error: 'ELIMINACION_REAL_DESHABILITADA', eliminacion_ejecutada: false };
    let operation; let authSent = false;
    const context = { ...original, input: { ...original.input } };
    try {
      if (!validInput(context.input)) fail('CONFIRMACION_INVALIDA');
      const actor = await authenticate(context.authorization);
      if (actor?.permanent !== true || !UUID.test(actor.id || '') || actor.id === context.input.usuario_id)
        fail('SOLO_ADMIN_PERMANENTE');
      operation = await adapter.integral.leer(context);
      if (operation?.estado === 'COMPLETADA') {
        const final = await adapter.integral.finalizar(context, operation.id);
        if (final.state !== 'COMPLETADA' || final.audit_verified !== true) fail('AUDITORIA_NO_VERIFICABLE');
        return { resultado: 'COMPLETADA', operacion_id: final.id, eliminacion_ejecutada: true };
      }
      const recovering = operation?.intentos_auth === 1;
      if (operation && !(recovering ? ['AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION'].includes(operation.estado)
        : operation.estado === 'PREPARADA' && operation.intentos_auth === 0)) fail('OPERACION_NO_VINCULADA');
      if (recovering && !operation.dependencias_resumen?.conservacion_integral_v2) fail('CONSERVACION_NO_ACREDITADA');
      context.reauthProof = await reauthenticate({ purpose: recovering ? 'recuperacion' : 'inicio' });
      if (recovering) {
        await adapter.integral.verificarArchivos(context, operation.id, 'despues');
        operation = await adapter.integral.recuperar(context, operation.id);
        if(operation?.requiere_revision===true||operation?.estado==='REQUIERE_REVISION')
          return {error:'REQUIERE_REVISION',operacion_id:operation.id,eliminacion_ejecutada:false,
            ...(operation.codigo_revision==='AUTH_TODAVIA_PRESENTE'?{codigo_revision:operation.codigo_revision}:{}),
            revision_registrada:operation.estado==='REQUIERE_REVISION'};
        if(operation?.estado!=='AUTH_ELIMINADA')fail('RECUPERACION_NO_ACREDITADA');
      } else {
        operation = await adapter.integral.preparar(context);
        operation = await adapter.integral.certificar(context, operation.id);
        await adapter.integral.verificarArchivos(context, operation.id, 'antes');
        operation = await adapter.integral.iniciar(context, operation.id);
        const attempt = operation.dependencias_resumen?.paso191?.attempt_id;
        if (!UUID.test(attempt || '')) fail('INICIO_NO_ACREDITADO');
        if (enabled() !== true) fail('ELIMINACION_REAL_DESHABILITADA');
        const current = await authenticate(context.authorization);
        if (current?.id !== actor.id || current.permanent !== true) fail('PRIVILEGIO_CAMBIO');
        const sealed = await adapter.integral.verificarInicio(context, operation.id, attempt);
        if (sealed.id !== operation.id || sealed.attempt_id !== attempt || sealed.state !== 'AUTH_EN_CURSO' ||
            sealed.target_id !== context.input.usuario_id || sealed.actor_id !== actor.id ||
            sealed.request_id !== context.input.operacion_id || sealed.execution_authorized !== true ||
            sealed.conservacion_historica_certificada !== true) fail('INICIO_NO_ACREDITADO');
        if (enabled() !== true) fail('ELIMINACION_REAL_DESHABILITADA');
        authSent = true; // Incluso timeout: no volver a invocar Auth en esta petición.
        const result = await deleteAuth(sealed);
        if (result?.outcome !== 'acknowledged') fail('RESULTADO_AUTH_INCIERTO');
        await adapter.integral.verificarArchivos(context, operation.id, 'despues');
        operation = await adapter.integral.confirmar(context, operation.id);
      }
      const final = await adapter.integral.finalizar(context, operation.id);
      if (final.state !== 'COMPLETADA' || final.audit_verified !== true || final.execution_authorized !== true ||
          final.conservacion_historica_certificada !== true) fail('AUDITORIA_NO_VERIFICABLE');
      return { resultado: 'COMPLETADA', operacion_id: final.id, eliminacion_ejecutada: true };
    } catch (error) {
      // No interrumpir otro intento por un inicio rechazado o una recuperación
      // concurrente. Solo registrar incertidumbre del Auth que ESTE flujo invocó.
      let revisionRegistrada=false;
      if (authSent && operation?.id) {
        try { const r=await adapter.integral.revisar(context, operation.id);
          revisionRegistrada=r?.persisted===true;
        } catch { /* conservar primer fallo */ }
      }
      const detail = diagnostic(error);
      return { error: operation?.id ? 'REQUIERE_REVISION' : 'PRECONDICIONES_NO_ACREDITADAS',
        ...(UUID.test(operation?.id || '') ? { operacion_id: operation.id } : {}),
        ...(authSent?{revision_registrada:revisionRegistrada}:{}),
        ...(detail ? { diagnostico: detail } : {}), eliminacion_ejecutada: false };
    }
  } });
}
