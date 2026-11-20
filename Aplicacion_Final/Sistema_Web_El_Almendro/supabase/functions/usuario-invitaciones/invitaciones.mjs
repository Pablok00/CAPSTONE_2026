export const DESTINO_INVITACION = 'https://pruebaelalmendro.vercel.app/registrar.html';
export const DESTINO_INVITACION_LOCAL = 'http://127.0.0.1:5500/registrar.html';
// Solo configuración del servidor. Nunca se obtiene de Origin ni del body.
export function destinoInvitacionConfigurado(value) {
  if (value === undefined) return DESTINO_INVITACION;
  if (value === DESTINO_INVITACION || value === DESTINO_INVITACION_LOCAL) return value;
  throw new InvitationError('DESTINO_INVITACION_NO_PERMITIDO', 503);
}
export const PROJECT_URL = 'https://hgveesryfmcjxpeumzbp.supabase.co';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class InvitationError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new InvitationError(code, status); };

// Cliente humano separado: conserva el JWT real y solo permite consultar su autorización.
// No habilita todavía las RPC de escritura ni Auth Admin para creación manual.
export function createManualRpcFetch(requestFetch = fetch, writes = false) {
  return async (resource, init) => {
    const request = new Request(resource, init), url = new URL(request.url);
    const authRead = request.method === 'GET' && ['/auth/v1/user','/auth/v1/.well-known/jwks.json'].includes(url.pathname);
    const roleRead = request.method === 'POST' && url.pathname === '/rest/v1/rpc/mi_estado_administrativo';
    const manualWrite = writes === true && request.method === 'POST' &&
      ['/rest/v1/rpc/usuarios_trabajadores_gestionar_v1','/rest/v1/rpc/aprobar_usuario_normal'].includes(url.pathname);
    if (url.origin !== PROJECT_URL || url.search || !(authRead || roleRead || manualWrite)) fail('DESTINO_NO_PERMITIDO', 403);
    return await requestFetch(request, { redirect: 'error', signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]) });
  };
}
export function createManualActorAuthorizer(clientFactory) {
  return async (token, actor) => {
    const client = clientFactory(token);
    const { data: identity, error: identityError } = await client.auth.getUser(token);
    if (identityError || identity?.user?.id !== actor.id) fail('SESION_INVALIDA', 401);
    const { data, error } = await client.rpc('mi_estado_administrativo');
    const row = Array.isArray(data) && data.length === 1 ? data[0] : !Array.isArray(data) ? data : null;
    if (error || row?.es_admin_permanente !== true) fail('SOLO_ADMIN_PERMANENTE', 403);
  };
}

export function createRestrictedFetch(requestFetch = fetch) {
  let inviteAttempted = false;
  return async (resource, init) => {
    const request = new Request(resource, init);
    const url = new URL(request.url);
    const reading = request.method === 'GET' && ['/auth/v1/user', '/auth/v1/.well-known/jwks.json'].includes(url.pathname);
    const sending = request.method === 'POST' && url.pathname === '/auth/v1/invite';
    if (url.origin !== PROJECT_URL || !(reading || sending)) throw Error('DESTINO_NO_PERMITIDO');
    if (sending) {
      if (inviteAttempted) throw Error('NO_REINTENTAR_ENVIO');
      inviteAttempted = true;
    }
    return await requestFetch(request, { redirect: 'error', signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]) });
  };
}

export function createInvitationAuthenticator(clientFactory, now = Date.now) {
  return async token => {
    const client = clientFactory();
    const userResult = await client.auth.getUser(token);
    const user = userResult.data?.user;
    if (userResult.error || !UUID.test(user?.id || '')) fail('SESION_INVALIDA', 401);
    const result = await client.auth.getClaims(token);
    const claims = result.data?.claims;
    if (result.error || !claims || claims.sub !== user.id || claims.role !== 'authenticated' ||
        !claims.exp || claims.exp * 1000 <= now() || !UUID.test(String(claims.session_id || ''))) fail('SESION_INVALIDA', 401);
    return Object.freeze({ id: user.id, sessionId: String(claims.session_id),
      invitedAt: user.invited_at || null, emailConfirmed: !!user.email_confirmed_at });
  };
}

export function normalizarNombre(value) {
  if (typeof value !== 'string' || value.length > 320 || /[\p{C}<>]/u.test(value)) fail('NOMBRE_INVALIDO', 400);
  const nombre = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if ([...nombre].length < 3 || [...nombre].length > 160 || (nombre.match(/\p{L}/gu) || []).length < 2) fail('NOMBRE_INVALIDO', 400);
  return nombre;
}
export function normalizarCorreo(value) {
  if (typeof value !== 'string' || value.length > 254 || /[^\x21-\x7e]|[<>"\\]/.test(value)) fail('CORREO_INVALIDO', 400);
  const email = value.toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('CORREO_INVALIDO', 400);
  return email;
}
function exactKeys(body, expected) {
  if (!body || Array.isArray(body) || Object.keys(body).sort().join(',') !== [...expected].sort().join(',')) fail('DATOS_INVALIDOS', 400);
}
export function validarEntrada(body) {
  if (body?.accion === 'CONSULTAR_INVITACION') {
    exactKeys(body, ['accion', 'email']);
    return Object.freeze({ accion: body.accion, email: normalizarCorreo(body.email) });
  }
  if (body?.accion === 'REENVIAR_INVITACION') {
    exactKeys(body, ['accion', 'email', 'identidad_id']);
    if (!UUID.test(body.identidad_id || '')) fail('DATOS_INVALIDOS', 400);
    return Object.freeze({ accion: body.accion, email: normalizarCorreo(body.email), identidad_id: body.identidad_id });
  }
  if (body?.accion === 'DIAGNOSTICO_CONEXION') {
    exactKeys(body, ['accion']);
    return Object.freeze({ accion: body.accion });
  }
  if (body?.accion === 'COMPLETAR_NOMBRE') {
    exactKeys(body, ['accion', 'nombre']);
    return Object.freeze({ accion: body.accion, nombre: normalizarNombre(body.nombre) });
  }
  if (body?.accion === 'INVITAR') {
    exactKeys(body, ['accion', 'email']);
    return Object.freeze({ accion: body.accion, email: normalizarCorreo(body.email) });
  }
  fail('ACCION_NO_PERMITIDA', 400);
}

// Solo datos ya comprobados por Auth. No acepta actor, UUID, rol ni marcadores del body.
export async function ejecutarInvitacion({ body, actor, store, enviarInvitacion, allowInvites = false, diagnosticEnabled = false }) {
  const input = validarEntrada(body);
  if (!actor || !UUID.test(actor.id || '') || !UUID.test(actor.sessionId || '')) fail('SESION_INVALIDA', 401);
  if (input.accion === 'DIAGNOSTICO_CONEXION') {
    if (!diagnosticEnabled) fail('DIAGNOSTICO_DESHABILITADO', 503);
    await store.exigirPermanente(actor);
    return await store.diagnosticarConexion(actor);
  }
  if (input.accion === 'COMPLETAR_NOMBRE') {
    if (!actor.invitedAt || !actor.emailConfirmed) fail('INVITACION_NO_ACREDITADA', 403);
    return await store.completarNombre(actor, input.nombre);
  }
  // Autorización independiente: una cuenta invitada no obtiene permisos de invitación.
  await store.exigirPermanente(actor);
  if (input.accion === 'CONSULTAR_INVITACION') {
    return await store.conInvitacionSerializada(actor, input.email, async estado => {
      await store.exigirPermanente(actor);
      // Información de configuración, nunca sustituye el control previo al envío.
      return { ...estado, envio_habilitado: allowInvites === true };
    }, { consulta: true });
  }
  if (!allowInvites) fail('ENVIO_INVITACION_DESHABILITADO', 503);
  return await store.conInvitacionSerializada(actor, input.email, async () => {
    // Revalidación tras esperas. La transacción de autorización termina antes de HTTP.
    await store.exigirPermanente(actor);
    try {
      const result = await enviarInvitacion(input.email, DESTINO_INVITACION);
      const user = result?.data?.user;
      if (result?.error || !UUID.test(user?.id || '') || user.email?.toLowerCase() !== input.email || !user.invited_at ||
          input.accion === 'REENVIAR_INVITACION' && user.id !== input.identidad_id) throw Error('RESULTADO_NO_CONFIRMADO');
      return { estado: 'INVITACION_CONFIRMADA', identidad_id: user.id, entrega_correo_acreditada: false };
    } catch (_) {
      // Nunca transformar timeout en "no enviado", ni intentar otra llamada nativa.
      fail('INVITACION_RESULTADO_INCIERTO_REVISAR', 202);
    }
  }, input.accion === 'REENVIAR_INVITACION' ? { reenviar: input.identidad_id } : {});
}

async function leerBody(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') fail('JSON_REQUERIDO', 415);
  if (!request.body) fail('DATOS_INVALIDOS', 400);
  const reader = request.body.getReader();
  const parts = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); fail('CUERPO_DEMASIADO_GRANDE', 413); }
      parts.push(value);
    }
    const bytes = new Uint8Array(size); let at = 0;
    for (const part of parts) { bytes.set(part, at); at += part.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof InvitationError) throw error;
    fail('JSON_INVALIDO', 400);
  } finally { reader.releaseLock(); }
}

export function createInvitationHandler({ enabled = false, allowInvites = false, diagnosticEnabled = false, manualEnabled = false, manualAuthorize, manualExecute, origins = /** @type {string[]} */ ([]), authenticate, store, enviarInvitacion, now = Date.now }) {
  const budgets = new Map(); // Solo defensa local adicional; no certifica un rate limit distribuido.
  return async request => {
    const origin = request.headers.get('origin');
    const allowed = !!origin && origins.includes(origin);
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (allowed) Object.assign(headers, { 'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS' });
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    let diagnosticRequest = false, manualRequest = false;
    try {
      if (!allowed) fail('ORIGEN_NO_PERMITIDO', 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'POST') fail('METODO_NO_PERMITIDO', 405);
      // Clasificar primero: el diagnóstico nunca depende de las compuertas generales.
      // Leer la acción no autoriza nada; JWT, esquema y permisos se validan después.
      const body = await leerBody(request);
      diagnosticRequest = body?.accion === 'DIAGNOSTICO_CONEXION';
      manualRequest = body?.accion === 'CREAR_USUARIO_MANUAL';
      if (manualRequest && !manualEnabled) fail('CREACION_MANUAL_DESHABILITADA', 503);
      if (diagnosticRequest && !diagnosticEnabled) fail('DIAGNOSTICO_DESHABILITADO', 503);
      if (!diagnosticRequest && !manualRequest && !enabled) fail('INVITACIONES_DESHABILITADAS', 503);
      const authorization = request.headers.get('authorization') || '';
      if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization) || authorization.length > 8192) fail('SESION_INVALIDA', 401);
      const actor = await authenticate(authorization.slice(7));
      if (!actor || !UUID.test(actor.id || '') || !UUID.test(actor.sessionId || '')) fail('SESION_INVALIDA', 401);
      const time = now();
      for (const [key, value] of budgets) if (time - value.start >= 60000) budgets.delete(key);
      const budget = budgets.get(actor.id) || { start: time, count: 0 };
      if (budgets.size >= 256 && !budgets.has(actor.id) || budget.count >= 8) fail('LIMITE_LOCAL_ESPERAR', 429);
      budget.count++; budgets.set(actor.id, budget);
      if (manualRequest) {
        if (typeof manualAuthorize !== 'function') fail('CREACION_MANUAL_NO_CONFIGURADA', 503);
        await manualAuthorize(authorization.slice(7), actor);
        if (typeof manualExecute !== 'function') fail('CREACION_MANUAL_DURABILIDAD_PENDIENTE', 503);
        const result = await manualExecute({ body, actor, token: authorization.slice(7) });
        return reply(result.completada === true ? 200 : 202, { ok: result.completada === true, ...result });
      }
      const result = await ejecutarInvitacion({ body, actor, store, enviarInvitacion, allowInvites, diagnosticEnabled });
      return reply(200, { ok: true, ...result });
    } catch (error) {
      if (diagnosticRequest) return reply(error instanceof InvitationError ? error.status : 503, {
        ok: false, estado: 'DIAGNOSTICO_CONEXION_FALLIDO',
        error: error instanceof InvitationError ? error.code : 'DIAGNOSTICO_NO_CONFIRMADO'
      });
      if (error instanceof InvitationError) return reply(error.status, { ok: false, error: error.code,
        ...(manualRequest && /^[A-Z_]{3,64}$/.test(error.etapa || '') ? {
          etapa: error.etapa,
          ...(/^[0-9A-Z]{5}$/.test(error.sqlstate || '') ? { sqlstate: error.sqlstate } : {}),
          requiere_revision: true, no_reintentar_automaticamente: true
        } : {}),
        ...(error.status === 202 ? { requiere_revision: true, no_reintentar_automaticamente: true,
          evidencia_auth: ['IDENTIDAD_INVITADA_ENCONTRADA','CUENTA_ENCONTRADA','SIN_EVIDENCIA_CONCLUYENTE','CIERRE_SESION_NO_CONFIRMADO'].includes(error.evidence) ? error.evidence : 'SIN_EVIDENCIA_CONCLUYENTE' } : {}) });
      // Un error SQL, de Auth o de transporte no confirma COMMIT ni ausencia de cambios.
      return reply(503, { ok: false, error: 'RESULTADO_NO_CONFIRMADO', requiere_revision: true,
        no_reintentar_automaticamente: true });
    }
  };
}
