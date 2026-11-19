// Preparación local. La activación requiere revisión y autorización posteriores.
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { createInstalledSqlAdapter, readDeletionDiagnostic } from '../usuario-eliminacion-previsualizar/adaptador-sql-instalado.mjs';
import { createPhysicalStorageReader } from '../usuario-eliminacion-previsualizar/conservacion-previa.mjs';
import { createDeletionCoordinator, createIntegralDeletionCoordinator, fingerprint } from '../usuario-eliminacion-previsualizar/eliminacion-coordinar.mjs';
import { createServerReauthentication, readServerReauthenticationProof } from '../usuario-eliminacion-previsualizar/reautenticacion-servidor.mjs';
import { validInput, isExceptionalTarget, exceptionalProfile, assertExceptionalOperation, assertExceptionalGate } from '../usuario-eliminacion-previsualizar/eliminacion-preparar.mjs';
import { createDatabaseProvider, databaseUrlFromEnvironment, assertCompleteVisibility } from '../usuario-eliminacion-previsualizar/database-safety.mjs';

export const ELIMINACION_HABILITADA: boolean = true;
// El objetivo procede de la solicitud validada y de la operación sellada por SQL.
export function assertDeletionTarget(target: unknown, requested: unknown, actorId: unknown) {
  if(typeof target!=='string'||typeof requested!=='string'||typeof actorId!=='string'||
    !UUID.test(target)||!UUID.test(requested)||!UUID.test(actorId)||
    target.toLowerCase()!==requested.toLowerCase()||target.toLowerCase()===actorId.toLowerCase())
    throw new Error('OBJETIVO_NO_ACREDITADO');
}
// Disponibilidad informativa; no sustituye la autorización irreversible SQL.
export function estadoHabilitacion(target: unknown, permanent: boolean, sql: boolean|null, comprobadaEn: string|null) {
  const autorizado=permanent===true&&typeof target==='string'&&UUID.test(target);
  const verificada=autorizado&&typeof sql==='boolean'&&typeof comprobadaEn==='string'&&Number.isFinite(Date.parse(comprobadaEn));
  return {contrato:'usuario-eliminacion-habilitacion/v2',objetivo_id:autorizado?target.toLowerCase():null,
    servidor:autorizado&&ELIMINACION_HABILITADA,sql:verificada?sql:null,comprobada_en:verificada?comprobadaEn:null,
    verificada,efectiva:verificada&&ELIMINACION_HABILITADA&&sql===true,autoriza_auth:false};
}
const URL_PROYECTO = 'https://hgveesryfmcjxpeumzbp.supabase.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const database = createDatabaseProvider({ postgres,
  databaseUrl: () => databaseUrlFromEnvironment((name: string) => Deno.env.get(name)),
});
let occupied = false; // Por worker, no garantía global. SQL mantiene las reservas durables.

function publicKey() {
  if (Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '') !== URL_PROYECTO) throw new Error('CONFIGURACION_INVALIDA');
  const key = Deno.env.get('SUPABASE_ANON_KEY')?.trim() ||
    JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default;
  if (typeof key !== 'string' || !key) throw new Error('CONFIGURACION_INVALIDA');
  return key;
}
async function authenticate(authorization: string) {
  // Mismo contrato Auth + mi_estado_administrativo de la previsualización.
  if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) return null;
  const client = createClient(URL_PROYECTO, publicKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization }, fetch: authFetch },
  });
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !UUID.test(data.user?.id || '')) return null;
  const state = await client.rpc('mi_estado_administrativo');
  if (state.error) throw new Error('AUTORIZACION_NO_VERIFICABLE');
  const value = Array.isArray(state.data) && state.data.length === 1 ? state.data[0] : state.data;
  return { id: data.user!.id.toLowerCase(), permanent: value?.es_admin_permanente === true };
}
async function authFetch(resource: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(resource, init);
  const url = new URL(request.url);
  if (url.origin !== URL_PROYECTO ||
      !(url.pathname.startsWith('/auth/v1/') || url.pathname === '/rest/v1/rpc/mi_estado_administrativo'))
    throw new Error('DESTINO_NO_ADMITIDO');
  // Sin reintentos de transporte; un timeout de DELETE es resultado incierto.
  return await fetch(request, { redirect: 'error', signal: AbortSignal.any([
    request.signal, AbortSignal.timeout(10000),
  ]) });
}
// Diagnóstico temporal por petición: solo etiquetas fijas, sin errores originales.
type EtapaDiagnostico = 'AUTENTICACION_AUTORIZACION' | 'LECTURA_ENTRADA' |
  'CONFIGURACION_ADMINISTRATIVA' | 'CONFIGURACION_POSTGRESQL' | 'CONEXION_POSTGRESQL' |
  'INSPECCION_POSTGRESQL' | 'CIERRE_TRANSACCION_POSTGRESQL' | 'REAUTENTICACION' |
  'PREPARACION_COORDINACION';
async function inspect(actor: string, target: string, diagnostico?: { etapa: EtapaDiagnostico }, input?: Record<string, any>) {
  if (diagnostico) diagnostico.etapa = 'CONFIGURACION_POSTGRESQL';
  const sql = database();
  if (diagnostico) diagnostico.etapa = 'CONEXION_POSTGRESQL';
  return await sql.begin('isolation level repeatable read read only', async (tx: postgres.TransactionSql) => {
    if (diagnostico) diagnostico.etapa = 'INSPECCION_POSTGRESQL';
    await tx`SET LOCAL statement_timeout = '10s'`;
    await assertCompleteVisibility(tx);
    const [row] = await tx`SELECT u.id, u.nombre, u.estado, u.rol_id, u.trabajador_id, r.nombre AS rol,
      (u.estado IS TRUE AND public.es_rol_administrador(u.rol_id)) AS target_permanent,
      EXISTS(SELECT 1 FROM auth.users WHERE id=${target}::uuid) AS auth_exists,
      EXISTS(SELECT 1 FROM public.usuarios a WHERE a.id=${actor}::uuid AND a.estado IS TRUE
        AND public.es_rol_administrador(a.rol_id)) AS permanent,
      (SELECT count(*)::int FROM public.usuarios a WHERE a.estado IS TRUE AND public.es_rol_administrador(a.rol_id)) AS admins,
      (SELECT count(*)::int FROM public.mantenciones WHERE responsable_id=${target}::uuid) AS mantenciones,
      (SELECT count(*)::int FROM public.tareas WHERE responsable_id=${target}::uuid) AS tareas,
      (SELECT count(*)::int FROM storage.objects WHERE lower(owner_id::text)=${target} OR lower(owner::text)=${target}) AS storage
      FROM public.usuarios u LEFT JOIN public.roles r ON r.id=u.rol_id WHERE u.id=${target}::uuid`;
    if (isExceptionalTarget(target)) {
      if (!input) throw new Error('OBJETIVO_NO_ADMITIDO');
      if (!row) {
        // Reenvío tras Auth: la ausencia no autoriza; exigir la operación
        // original certificada. El coordinador solo verificará/finalizará, sin DELETE.
        const operations = await tx`SELECT * FROM public.usuarios_eliminaciones_operaciones
          WHERE actor_id=${actor}::uuid AND objetivo_id=${target}::uuid
          AND dependencias_resumen->'paso191'->>'request_id'=${input.operacion_id}`;
        const op = operations.length === 1 ? operations[0] : null;
        if (!op || op.estado === 'PREPARADA' || op.objetivo_nombre_snapshot !== input.nombre_confirmacion ||
            op.motivo !== input.motivo.trim() ||
            op.dependencias_resumen?.paso191?.fingerprint !== await fingerprint(actor, input) ||
            !assertExceptionalOperation(op)) throw new Error('INICIO_NO_ACREDITADO');
        return { targetExists: false }; // No simular perfil, Auth ni conteos ausentes.
      }
      if (row.nombre !== input.nombre_confirmacion || row.rol_id !== null || row.trabajador_id !== null)
        throw new Error('OBJETIVO_NO_ADMITIDO');
      if (!exceptionalProfile(row, row.auth_exists)) {
        // El inicio SQL deshabilita el perfil: solo admitirlo con su operación
        // durable certificada y la misma petición. Nunca basta el UUID permitido.
        const operations = await tx`SELECT * FROM public.usuarios_eliminaciones_operaciones
          WHERE actor_id=${actor}::uuid AND objetivo_id=${target}::uuid
          AND dependencias_resumen->'paso191'->>'request_id'=${input.operacion_id}`;
        const op = operations.length === 1 ? operations[0] : null;
        if (!op || row.estado !== false || op.estado === 'PREPARADA' ||
            op.dependencias_resumen?.paso191?.fingerprint !== await fingerprint(actor, input) ||
            !assertExceptionalOperation(op)) throw new Error('INICIO_NO_ACREDITADO');
      }
    } else if (!row || !['recepción','recepcion','técnico','tecnico'].includes(row.rol?.trim().toLowerCase()))
      throw new Error('OBJETIVO_NO_ADMITIDO');
    if (diagnostico) diagnostico.etapa = 'CIERRE_TRANSACCION_POSTGRESQL';
    return { callerPermanent: row.permanent === true, targetExists: true, authExists: row.auth_exists,
      targetName: row.nombre, targetPermanent: row.target_permanent, permanentCount: row.admins,
      assignments: { mantenciones: row.mantenciones, tareas: row.tareas }, storage: { total: row.storage } };
  });
}

// Cuerpo acotado y cancelación de lectura; nunca abandonar una consulta PostgreSQL.
async function bodyJson(request: Request) {
  if (!request.body || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    throw new Error('ENTRADA_INVALIDA');
  const reader = request.body.getReader();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 5000);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) throw new Error('LECTURA_AGOTADA');
      if (done) break;
      size += value.length;
      if (size > 8192) throw new Error('ENTRADA_EXCESIVA');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const origins = (Deno.env.get('PREVIEW_ALLOWED_ORIGINS') || '').split(',').map(v => v.trim()).filter(v => v && v !== '*');
  const allowedOrigin = origin !== null && origins.includes(origin);
  let habilitacion: ReturnType<typeof estadoHabilitacion>|undefined;
  let respuestaEjecucion=false;
  const headers: Record<string,string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (allowedOrigin) Object.assign(headers, { 'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
  const reply = (status: number, body: Record<string,unknown>) => new Response(JSON.stringify({
    ...body, puede_eliminar: false,
    eliminacion_habilitada:respuestaEjecucion&&habilitacion?.efectiva===true,
    ...(habilitacion?{habilitacion}:{}),
  }), { status, headers });
  if (origin && !allowedOrigin) return reply(403, { error: 'ORIGEN_NO_PERMITIDO' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, { error: 'METODO_NO_PERMITIDO' });
  // Las lecturas autorizadas no abren la compuerta irreversible ni usan Auth Admin.
  let occupiedHere = false;
  let body: { password?: string } | undefined;
  let administradorVerificado = false;
  const diagnostico: { etapa: EtapaDiagnostico } = { etapa: 'AUTENTICACION_AUTORIZACION' };
  try {
    const authorization = request.headers.get('authorization') || '';
    const actor = await authenticate(authorization);
    if (!actor) return reply(403, { error: 'SESION_REQUERIDA' });
    administradorVerificado = actor.permanent === true;
    diagnostico.etapa = 'LECTURA_ENTRADA';
    let raw = await bodyJson(request);
    if (raw && Object.getPrototypeOf(raw) === Object.prototype && Object.hasOwn(raw,'password')) body=raw;
    let pendingOperationId: string | undefined;
    if (raw && Object.getPrototypeOf(raw) === Object.prototype && raw.accion === 'CONSULTAR_IDENTIDADES_HISTORICAS') {
      if (![3,4].includes(Object.keys(raw).length) || !Object.keys(raw).every(k=>['accion','modulo','registros','tareas'].includes(k)) || !['accion','modulo','registros'].every(k=>Object.hasOwn(raw,k)) ||
          typeof raw.modulo!=='string' || !Array.isArray(raw.registros)) return reply(400,{error:'ENTRADA_INVALIDA'});
      const reader=createInstalledSqlAdapter({database,authenticate});
      try {
        const data=await reader.consultarIdentidades({authorization,modulo:raw.modulo,registros:raw.registros,tareas:raw.tareas??[]});
        return reply(200,{...data,eliminacion_ejecutada:false});
      } catch(error) {
        const safe=readDeletionDiagnostic(error,true);
        return reply(503,{error:'LECTURA_HISTORICA_NO_DISPONIBLE',eliminacion_ejecutada:false,
          diagnostico:{etapa:'LECTURA_HISTORICA_V2',codigo:'LECTURA_HISTORICA_NO_DISPONIBLE',
            subetapa:safe?.subetapa??'ENTRADA',tipo:safe?.tipo??'NO_CLASIFICADO',
            ...(safe?.validacion?{validacion:safe.validacion}:{}),
            ...(safe?.sqlstate?{sqlstate:safe.sqlstate}:{})}});
      }
    }
    if (!actor.permanent) return reply(403, { error:'SOLO_ADMIN_PERMANENTE' });
    const comunicarHabilitacion=async(target:unknown)=>{
      if(typeof target!=='string'||!UUID.test(target)||target.toLowerCase()===actor.id)return;
      try {
        const reader=createInstalledSqlAdapter({database,authenticate});
        const dato=await reader.consultarHabilitacion({authorization});
        habilitacion=estadoHabilitacion(target,true,dato.sql,dato.comprobada_en);
      } catch { habilitacion=estadoHabilitacion(target,true,null,null); }
    };
    if (raw && Object.getPrototypeOf(raw) === Object.prototype && raw.accion === 'RESUMEN_CONSERVACION_V2') {
      if (Object.keys(raw).length!==2 || !Object.hasOwn(raw,'usuario_id') || typeof raw.usuario_id!=='string' ||
          !UUID.test(raw.usuario_id)) return reply(400,{error:'ENTRADA_INVALIDA'});
      const reader=createInstalledSqlAdapter({database,authenticate});
      const resumen=await reader.consultarResumen({authorization,usuario_id:raw.usuario_id.toLowerCase()});
      await comunicarHabilitacion(raw.usuario_id);
      return reply(200,{...resumen,eliminacion_ejecutada:false});
    }
    // Consulta explícita: antes de leer password, configurar Auth Admin o reautenticar.
    if (raw && Object.getPrototypeOf(raw) === Object.prototype && raw.accion === 'CONSULTAR_OPERACION') {
      const keys = Object.keys(raw);
      if (!keys.every(k => ['accion','operacion_id'].includes(k)) || keys.length > 2 ||
          (Object.hasOwn(raw, 'operacion_id') && (typeof raw.operacion_id !== 'string' || !UUID.test(raw.operacion_id))))
        return reply(400, { error: 'ENTRADA_INVALIDA' });
      const reader = createInstalledSqlAdapter({ database, authenticate, readExceptionalSetting: (name: string) => Deno.env.get(name) });
      const operaciones = await reader.consultarOperaciones({ authorization, operacion_id: raw.operacion_id ?? null });
      if(operaciones.length===1)await comunicarHabilitacion(operaciones[0].objetivo_id);
      return reply(200, { resultado: 'CONSULTA_OK', operaciones, eliminacion_ejecutada: false });
    }
    if (raw?.accion !== undefined && raw.accion !== 'CONTINUAR_PREPARADA') return reply(400,{error:'ENTRADA_INVALIDA'});
    // Solo las acciones de ejecución/continuación quedan detrás del cierre.
    if (!ELIMINACION_HABILITADA) return reply(503, { error: 'ELIMINACION_REAL_DESHABILITADA' });
    if (occupied) return reply(429,{error:'SOLICITUD_EN_CURSO'});
    occupied=true; occupiedHere=true;
    if (raw && Object.getPrototypeOf(raw) === Object.prototype && raw.accion === 'CONTINUAR_PREPARADA') {
      const keys = ['accion','operacion_id','fingerprint','nombre_confirmacion','confirmacion','password'];
      if (Object.keys(raw).length !== keys.length || !keys.every(k => Object.hasOwn(raw,k)) ||
          typeof raw.operacion_id !== 'string' || !UUID.test(raw.operacion_id) || raw.confirmacion !== true ||
          typeof raw.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(raw.fingerprint) ||
          typeof raw.password !== 'string' || !raw.password || raw.password.length > 4096)
        return reply(400, { error: 'ENTRADA_INVALIDA' });
      body = raw; // Finalmente limpiar incluso si falla la consulta previa.
      const reader = createInstalledSqlAdapter({ database, authenticate, readExceptionalSetting: (name: string) => Deno.env.get(name) });
      const rows = await reader.consultarOperaciones({ authorization, operacion_id: raw.operacion_id });
      const op = rows.length === 1 ? rows[0] : null;
      if (!op || op.estado !== 'PREPARADA' || op.intentos_auth !== 0 ||
          op.fingerprint !== raw.fingerprint || op.nombre !== raw.nombre_confirmacion)
        return reply(409, { error: 'CONTINUACION_NO_ADMITIDA', eliminacion_ejecutada: false });
      pendingOperationId = op.operacion_id;
      const password = raw.password;
      raw.password = undefined;
      // La intención proviene del servidor: el navegador no elige request, objetivo ni motivo.
      raw = { usuario_id: op.objetivo_id, operacion_id: op.request_id,
        nombre_confirmacion: op.nombre, motivo: op.motivo, confirmacion: true, password };
    }
    if (!raw || Object.getPrototypeOf(raw) !== Object.prototype ||
        Object.keys(raw).length !== 6 || !Object.hasOwn(raw,'password')) return reply(400, { error: 'ENTRADA_INVALIDA' });
    body = raw;
    const { password, ...input } = raw;
    if (!validInput(input) || actor.id === input.usuario_id.toLowerCase()) return reply(400, { error: 'CONFIRMACION_INVALIDA' });
    input.usuario_id = input.usuario_id.toLowerCase(); input.operacion_id = input.operacion_id.toLowerCase();
    // La compuerta SQL sigue siendo obligatoria para toda cuenta elegible.
    respuestaEjecucion=true;
    await comunicarHabilitacion(input.usuario_id);
    if(habilitacion?.efectiva!==true)return reply(503,{error:habilitacion?.sql===false?'COMPUERTA_SQL_V2_CERRADA':'COMPUERTA_SQL_V2_NO_VERIFICABLE',eliminacion_ejecutada:false});
    try { assertExceptionalGate(input.usuario_id, name => Deno.env.get(name)); }
    catch { return reply(403, { error: 'COMPUERTA_EXCEPCIONAL_CERRADA' }); }
    // Detectar falta de configuración antes de desactivar/reservar la cuenta en SQL.
    diagnostico.etapa = 'CONFIGURACION_ADMINISTRATIVA';
    const administrativeKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!administrativeKey) throw new Error('CONFIGURACION_ADMIN_NO_DISPONIBLE');
    if (!isExceptionalTarget(input.usuario_id)) {
      const adapterV2 = createInstalledSqlAdapter({ database, authenticate,
        physicalStorageReader: createPhysicalStorageReader({ projectUrl: URL_PROYECTO, publicKey }),
        readExceptionalSetting: (name: string) => Deno.env.get(name) });
      const reauthV2 = createServerReauthentication({ authenticate, createClient, publicKey: publicKey() });
      let proofV2: object | undefined;
      const correlation = crypto.randomUUID();
      const coordinatorV2 = createIntegralDeletionCoordinator({ enabled: () => ELIMINACION_HABILITADA,
        authenticate, adapter: adapterV2,
        reauthenticate: async ({ purpose }: { purpose: 'inicio' | 'recuperacion' }) => {
          diagnostico.etapa = 'REAUTENTICACION';
          try { proofV2 = await reauthV2.reauthenticate({ authorization, input, password: body?.password, purpose }); return proofV2; }
          finally { if (body) body.password = undefined; }
        },
        diagnostic: (error: unknown) => {
          const detail = readDeletionDiagnostic(error, true);
          return detail ? { ...detail, correlacion: correlation } : undefined;
        },
        deleteAuth: async (operation: Record<string, any>) => {
          if (!ELIMINACION_HABILITADA) throw new Error('ELIMINACION_REAL_DESHABILITADA');
          assertDeletionTarget(operation.target_id,input.usuario_id,actor.id);
          const current = await authenticate(authorization);
          if (current?.id !== actor.id || current.permanent !== true) throw new Error('PRIVILEGIO_CAMBIO');
          await readServerReauthenticationProof(proofV2, { actorId: actor.id, authorization, input });
          const admin = createClient(URL_PROYECTO, administrativeKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: authFetch },
          });
          // Destino sellado por el adaptador SQL, nunca un UUID independiente del body.
          if (!ELIMINACION_HABILITADA) throw new Error('ELIMINACION_REAL_DESHABILITADA');
          assertDeletionTarget(operation.target_id,input.usuario_id,actor.id);
          const deletion = await admin.auth.admin.deleteUser(operation.target_id, false);
          if (deletion.error) throw new Error('RESULTADO_AUTH_INCIERTO');
          return { outcome: 'acknowledged' };
        },
      });
      const result = await coordinatorV2.execute({ authorization, input, pendingOperationId });
      return reply(result.resultado === 'COMPLETADA' && result.eliminacion_ejecutada === true ? 200 : 409, result);
    }
    const inspectRequest = (a: string, t: string) => inspect(a, t, diagnostico, input);
    await inspectRequest(actor.id, input.usuario_id);
    diagnostico.etapa = 'REAUTENTICACION';
    const reauth = createServerReauthentication({ authenticate, createClient, publicKey: publicKey() });
    const proof = await reauth.reauthenticate({ authorization, input, password });
    if (body) body.password = undefined;
    // reauthenticate() solo resuelve después de cerrar su sesión temporal en finally.
    diagnostico.etapa = 'PREPARACION_COORDINACION';
    const adapter = createInstalledSqlAdapter({ database, authenticate,
      physicalStorageReader: createPhysicalStorageReader({ projectUrl: URL_PROYECTO, publicKey }),
      readExceptionalSetting: (name: string) => Deno.env.get(name) });
    const context = { authorization, input, reauthProof: proof, pendingOperationId };
    // Mantener el interruptor de seguridad antes de entrar al coordinador.
    if (!ELIMINACION_HABILITADA) return reply(503, { error: 'ELIMINACION_REAL_DESHABILITADA' });
    const coordinator = createDeletionCoordinator({ authenticate, inspect: inspectRequest, certificationInSql: true,
      verifyRecentIdentity: async () => { await readServerReauthenticationProof(proof, { actorId: actor.id, authorization, input }); return true; },
      verifyBeforeIrreversible: async () => {
        await readServerReauthenticationProof(proof, { actorId: actor.id, authorization, input }); return true;
      },
    });
    const flow = coordinator.simulate({ authorization, input });
    let finalSqlOperationId: string | undefined;
    const correlacionDiagnostico = crypto.randomUUID();
    let falloDiagnostico: Record<string, string> | undefined;
    let step = await flow.next();
    while (!step.done) {
      const intent = step.value;
      try {
        let result;
        if (intent.kind === 'ELIMINAR_AUTH_SIMULADO') {
          // El planificador solo emite esta intención tras inicio confirmado y revalidación.
          // No usar el UUID aportado por el body como destino administrativo independiente.
          const op = intent.payload.operation;
          const persisted = await adapter.dispatch({ simulacion: true, kind: 'LEER_OPERACION', payload: {
            actor_id: op.actor_id, target_id: op.target_id, request_id: op.request_id, fingerprint: op.fingerprint,
          } }, context);
          if (persisted?.state !== 'AUTH_EN_CURSO' || persisted.id !== op.id || persisted.attempt_id !== op.attempt_id ||
              persisted.conservacion_historica_certificada !== true || persisted.execution_authorized !== true)
            throw new Error('INICIO_NO_ACREDITADO');
          // Nueva lectura bajo candados SQL; la prueba consumida debe ser la
          // generada por esta reautenticación real, no un marcador del navegador.
          const verified = await adapter.dispatch({ simulacion: true, kind: 'VERIFICAR_INICIO_AUTH',
            payload: { operation: persisted } }, context);
          if (verified?.id !== persisted.id || verified.attempt_id !== persisted.attempt_id ||
              (isExceptionalTarget(persisted.target_id) && verified.alcance_excepcional_verificado !== true))
            throw new Error('INICIO_NO_ACREDITADO');
          await readServerReauthenticationProof(proof, { actorId: actor.id, authorization, input });
          const current = await authenticate(authorization);
          if (current?.id !== actor.id || current.permanent !== true) throw new Error('PRIVILEGIO_CAMBIO');
          const admin = createClient(URL_PROYECTO, administrativeKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: authFetch },
          });
          // Mantener el interruptor de seguridad también antes de Auth administrativo.
          if (!ELIMINACION_HABILITADA)
            throw new Error('ELIMINACION_REAL_DESHABILITADA');
          assertExceptionalGate(persisted.target_id, name => Deno.env.get(name));
          assertDeletionTarget(persisted.target_id,input.usuario_id,actor.id);
          const deletion = await admin.auth.admin.deleteUser(persisted.target_id, false);
          if (deletion.error) throw new Error('RESULTADO_AUTH_INCIERTO');
          result = { outcome: 'acknowledged' };
        } else {
          result = await adapter.dispatch(intent, context);
          // Evidencia del adaptador SQL, nunca del planificador o del body HTTP.
          // FINALIZAR_SQL_ENDURECIDA comprueba ausencia, huellas y auditoría real.
          if (intent.kind === 'FINALIZAR_SQL_ENDURECIDA' && result?.state === 'COMPLETADA' &&
              result.audit_verified === true && result.conservacion_historica_certificada === true &&
              result.execution_authorized === true && UUID.test(result.id || '') &&
              result.actor_id === actor.id && result.target_id === input.usuario_id &&
              result.request_id === input.operacion_id) finalSqlOperationId = result.id;
        }
        step = await flow.next(result);
       } catch (error) {
        // Conservar el primer fallo, no sustituirlo por un error al registrar revisión.
        if (!falloDiagnostico && administradorVerificado) {
          const detail = readDeletionDiagnostic(error, true);
          falloDiagnostico = detail ? { ...detail, correlacion: correlacionDiagnostico }
            : { etapa: 'COORDINACION_EJECUCION', codigo: 'OPERACION_NO_VERIFICABLE', tipo: 'NO_CLASIFICADO', correlacion: correlacionDiagnostico };
        }
        step = await flow.throw(new Error('OPERACION_NO_VERIFICABLE'));
      }
    }
    // Nunca interpretar un resultado simulado como confirmación: completar requiere auditoría SQL.
    const result = step.value;
    if (result?.resultado_simulado === 'COMPLETADA' && finalSqlOperationId) return reply(200, {
      resultado: 'COMPLETADA', eliminacion_ejecutada: true, operacion_id: finalSqlOperationId,
    });
    return reply(409, {
      error: result?.error === 'REQUIERE_REVISION' ? 'REQUIERE_REVISION' : 'OPERACION_NO_VERIFICABLE',
      ...(administradorVerificado && falloDiagnostico ? { diagnostico: falloDiagnostico } : {}),
      ...(UUID.test(result?.operacion_id || '') ? { operacion_id: result.operacion_id } : {}),
    });
  } catch {
    return reply(503, { error: 'OPERACION_NO_VERIFICABLE',
      ...(administradorVerificado ? { etapa_diagnostico: diagnostico.etapa } : {}),
    });
  }
  finally { if (body) body.password = undefined; if (occupiedHere) occupied = false; }
}

if (import.meta.main) Deno.serve(handler);
