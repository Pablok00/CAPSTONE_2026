// Deno real, sin permisos de red, entorno ni archivos: servicios exclusivamente simulados.
import assert from 'node:assert/strict';
import { createHandler, errorInspeccionPorEtapa } from '../supabase/functions/usuario-eliminacion-previsualizar/handler.mjs';
import { createDatabaseProvider, databaseUrlFromEnvironment } from '../supabase/functions/usuario-eliminacion-previsualizar/database-safety.mjs';
const actor = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
const origin = 'https://permitido.example';
const data = () => ({ callerPermanent: true, targetExists: true, authExists: true,
  targetPermanent: false, permanentCount: 2, checkedAt: '2026-11-01T00:00:00Z',
  assignments: { mantenciones: 0, tareas: 0 }, storage: { total: 0, por_owner_id: 0, por_owner: 0 },
  documents: { prevencion: 0, trabajadores: 0 },
  historial_solicitudes: { solicitudes_creadas: 0, avisos_asociados: 0, accion: 'conservar_sin_modificar' }, references: [] });
function request(body = { usuario_id: target }, headers = {}, method = 'POST') {
  return new Request('http://localhost/preview', { method,
    headers: { authorization: 'Bearer prueba-sintetica', 'content-type': 'application/json', origin, ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
}
function fixture(options = {}) {
  const calls = [];
  const handler = createHandler({ origins: [origin],
    authenticate: options.authenticate || (async () => ({ id: actor, permanent: true })),
    inspect: async (...args) => { calls.push(args); return options.inspect ? await options.inspect(...args) : data(); } });
  return { handler, calls };
}
async function checked(response, status) {
  assert(response instanceof Response); assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  if (status === 204) { assert.equal(await response.text(), ''); return; }
  const body = await response.json();
  assert.equal(body.puede_eliminar, false); assert.equal(body.eliminacion_habilitada, false);
  assert(!JSON.stringify(body).includes('detalle-interno-sintetico'));
  return body;
}
Deno.test('HTTP Deno 185.4E: etapa controlada solo después de Auth y permanente', async () => {
  const marked = () => { throw errorInspeccionPorEtapa('CONSULTA_STORAGE'); };
  const valid = fixture({ inspect: marked });
  const body = await checked(await valid.handler(request()), 503);
  assert.deepEqual(body, { error: 'DEPENDENCIAS_NO_VERIFICABLES', puede_eliminar: false,
    eliminacion_habilitada: false, etapa_fallida: 'CONSULTA_STORAGE' });
  for (const [authenticate, status] of [[marked, 503], [async () => null, 401],
    [async () => ({ id: actor, permanent: false }), 403]]) {
    const f = fixture({ authenticate, inspect: marked });
    const denied = await checked(await f.handler(request()), status);
    assert.equal(denied.etapa_fallida, undefined); assert.equal(f.calls.length, 0);
  }
  const missing = fixture({ inspect: marked });
  assert.equal((await checked(await missing.handler(request(undefined, { authorization: '' })), 401)).etapa_fallida, undefined);
  assert.equal(missing.calls.length, 0);
});

Deno.test('HTTP Deno: sesiones y administradores temporales no inspeccionan', async () => {
  for (const user of [null, { id: actor, permanent: false }, { id: actor, permanent: false, temporal: true }]) {
    const f = fixture({ authenticate: async () => user });
    await checked(await f.handler(request()), user ? 403 : 401); assert.equal(f.calls.length, 0);
  }
  for (const authorization of ['', 'Basic prueba']) {
    const f = fixture(); await checked(await f.handler(request(undefined, { authorization })), 401);
    assert.equal(f.calls.length, 0);
  }
});
Deno.test('Deno Paso 185.8: parámetros solo del default se descartan y override queda estricto', () => {
  const base = 'postgresql://postgres:simulado@db.hgveesryfmcjxpeumzbp.supabase.co:5432/postgres';
  const env = { SUPABASE_DB_URL: base + '?application_name=prueba&sslmode=disable&host=ajeno&max=99' };
  let captured;
  const provider = createDatabaseProvider({ databaseUrl: () => databaseUrlFromEnvironment(name => env[name]),
    postgres: config => { captured = config; return {}; } });
  provider(); assert.deepEqual(captured.ssl, { rejectUnauthorized: true });
  assert.equal(captured.host, 'db.hgveesryfmcjxpeumzbp.supabase.co'); assert.equal(captured.max, 1);
  assert.equal(captured.application_name, undefined); assert.equal(captured.url, undefined);
  env.PREVIEW_DATABASE_URL = env.SUPABASE_DB_URL;
  assert.throws(createDatabaseProvider({ databaseUrl: () => databaseUrlFromEnvironment(name => env[name]),
    postgres: () => { assert.fail('no debe crear driver'); } }), /NO_ACREDITADA/);
});

Deno.test('HTTP Deno Paso 183: configuración DB ausente/incompatible devuelve error sin ceros', async () => {
  for (const env of [{}, { SUPABASE_DB_URL: '' },
    { SUPABASE_DB_URL: 'postgresql://postgres:simulado@db.otro.supabase.co:5432/postgres' },
    { SUPABASE_DB_URL: 'postgresql://postgres.hgveesryfmcjxpeumzbp:simulado@aws-0-eu-central-1.pooler.supabase.com:6543/postgres' }]) {
    let created = 0;
    const database = createDatabaseProvider({ databaseUrl: () => databaseUrlFromEnvironment(name => env[name]),
      postgres: () => { created++; } });
    const f = fixture({ inspect: async () => database() });
    const body = await checked(await f.handler(request()), 503);
    assert.equal(body.error, 'DEPENDENCIAS_NO_VERIFICABLES'); assert.equal(created, 0);
    assert.equal(body.storage, undefined); assert.equal(body.historial_solicitudes, undefined);
  }
});
Deno.test('HTTP Deno Paso 150: historial informativo conserva conteos y eliminación deshabilitada', async () => {
  for (const [solicitudes_creadas, avisos_asociados] of [[0, 0], [1, 1], [2, 3]]) {
    const historial_solicitudes = { solicitudes_creadas, avisos_asociados, accion: 'conservar_sin_modificar' };
    const f = fixture({ inspect: async () => ({ ...data(), historial_solicitudes }) });
    const body = await checked(await f.handler(request()), 200);
    assert.deepEqual(body.historial_solicitudes, historial_solicitudes);
    assert.equal(body.validacion_integral_completa, false);
    assert.deepEqual(body.bloqueos, ['ELIMINACION_NO_IMPLEMENTADA']);
    assert.equal(body.storage.total, 0); assert.equal(body.asignaciones.tareas, 0);
  }
  const f = fixture({ inspect: async () => { throw new Error('detalle-interno-sintetico'); } });
  const body = await checked(await f.handler(request()), 503);
  assert.equal(body.historial_solicitudes, undefined);
});
Deno.test('HTTP Deno: UUID, campos extra, métodos, CORS y JSON', async () => {
  const f = fixture();
  for (const body of [{ usuario_id: 'incorrecto' }, { usuario_id: target, eliminar: true }])
    await checked(await f.handler(request(body)), 400);
  await checked(await f.handler(request(undefined, { 'content-type': 'text/plain' })), 415);
  await checked(await f.handler(request(undefined, { origin: 'https://ajeno.example' })), 403);
  for (const method of ['GET', 'DELETE', 'PUT', 'PATCH']) await checked(await f.handler(request(undefined, {}, method)), 405);
  const preflight = await f.handler(request(undefined, {}, 'OPTIONS'));
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  await checked(preflight, 204); assert.equal(f.calls.length, 0);
});
Deno.test('HTTP Deno: permanente, propia, último administrador, asignaciones y Storage', async () => {
  const f = fixture(); const result = await checked(await f.handler(request()), 200);
  assert.deepEqual(f.calls, [[actor, target]]); assert.deepEqual(result.bloqueos, ['ELIMINACION_NO_IMPLEMENTADA']);
  const blocked = fixture({ inspect: async () => ({ ...data(), targetPermanent: true, permanentCount: 1,
    assignments: { mantenciones: 2, tareas: 3 }, storage: { total: 4, por_owner_id: 4, por_owner: 4 } }) });
  const body = await checked(await blocked.handler(request({ usuario_id: actor })), 200);
  for (const code of ['CUENTA_PROPIA', 'ULTIMO_ADMIN_PERMANENTE', 'ASIGNACIONES_MANTENCIONES', 'ASIGNACIONES_TAREAS', 'OBJETOS_STORAGE_CON_PROPIETARIO']) assert(body.bloqueos.includes(code));
  assert.equal(body.storage.total, 4);
});
Deno.test('HTTP Deno: Auth, PostgreSQL y permisos fallan cerrados', async () => {
  const fail = async () => { throw new Error('detalle-interno-sintetico'); };
  const auth = fixture({ authenticate: fail }); await checked(await auth.handler(request()), 503); assert.equal(auth.calls.length, 0);
  for (const error of ['conexion PostgreSQL', 'SELECT denegado']) {
    const f = fixture({ inspect: async () => { throw new Error(error + ' detalle-interno-sintetico'); } });
    const body = await checked(await f.handler(request()), 503); assert.equal(body.storage, undefined);
  }
  await checked(await fixture({ inspect: async () => ({ ...data(), callerPermanent: false }) }).handler(request()), 403);
});
Deno.test('HTTP Deno: FK no expone definiciones ni propiedades internas', async () => {
  const f = fixture({ inspect: async () => ({ ...data(), references: [{ esquema: 'public', tabla: 'ejemplo',
    restriccion: 'fk_sintetica', definicion: 'detalle-interno-sintetico', extra: 'detalle-interno-sintetico' }] }) });
  const body = await checked(await f.handler(request()), 200);
  assert.deepEqual(body.referencias_fk_detectadas, [{ esquema: 'public', tabla: 'ejemplo', restriccion: 'fk_sintetica' }]);
});
Deno.test('HTTP Deno: cupo único, rechazo sin cola y desconexión no abandona SQL', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  let active = 0; let settled = 0;
  const f = fixture({ inspect: async () => { active++; await gate; active--; return data(); } });
  const controller = new AbortController();
  const pending = f.handler(new Request(request(), { signal: controller.signal })).then(r => { settled++; return r; });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(active, 1); assert.equal(settled, 0);
  controller.abort();
  for (let i = 0; i < 8; i++) {
    const body = await checked(await f.handler(request()), 429);
    assert.equal(body.error, 'PREVISUALIZACION_OCUPADA');
  }
  assert.equal(active, 1); assert.equal(f.calls.length, 1); release();
  await checked(await pending, 499);
  await checked(await f.handler(request()), 200);
  assert.equal(active, 0); assert.equal(settled, 1);
  assert(f.calls.every(([a, t]) => a === actor && t === target));
});
Deno.test('HTTP Deno: cuerpo incompleto vence a los 5s, cancela sin esperar al transporte y libera cupo', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{')); },
    cancel() { cancelled = true; return new Promise(() => {}); } });
  const f = fixture(); const start = performance.now();
  const response = await f.handler(new Request(request(), { body: stream }));
  const body = await checked(response, 408);
  assert.equal(body.error, 'TIEMPO_CUERPO_AGOTADO'); assert(cancelled);
  assert(performance.now() - start >= 4900); assert(performance.now() - start < 8000);
  assert.equal(stream.locked, false); assert.equal(f.calls.length, 0);
  await checked(await f.handler(request()), 200);
});
Deno.test('HTTP Deno: abortar lectura libera stream y cupo; mantiene límite de 256 bytes', async () => {
  const f = fixture(); const controller = new AbortController(); let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const pending = f.handler(new Request(request(), { body: stream, signal: controller.signal }));
  await new Promise(resolve => setTimeout(resolve, 10)); controller.abort();
  await checked(await pending, 499); assert(cancelled); assert.equal(stream.locked, false);
  const valid = JSON.stringify({ usuario_id: target });
  await checked(await f.handler(new Request(request(), { body: valid.padEnd(256, ' ') })), 200);
  await checked(await f.handler(new Request(request(), { body: valid.padEnd(257, ' ') })), 400);
  await checked(await f.handler(request()), 200);
});
Deno.test('HTTP Deno: admisión cubre también Auth y se recupera tras su error', async () => {
  let release; let calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ authenticate: async () => {
    calls++;
    if (calls === 1) { await gate; throw new Error('simulado'); }
    return { id: actor, permanent: true };
  } });
  const first = f.handler(request());
  await checked(await f.handler(request()), 429);
  assert.equal(calls, 1); assert.equal(f.calls.length, 0);
  release(); await checked(await first, 503);
  await checked(await f.handler(request()), 200); assert.equal(calls, 2);
});
Deno.test('HTTP Deno: errores Auth/SQL, autorización y JSON liberan admisión', async () => {
  for (const stage of ['auth', 'sql']) {
    let fail = true;
    const f = fixture({ authenticate: async () => {
      if (fail && stage === 'auth') throw new Error('simulado');
      return { id: actor, permanent: true };
    }, inspect: async () => { if (fail) throw new Error('simulado'); return data(); } });
    await checked(await f.handler(request()), 503); fail = false;
    await checked(await f.handler(request()), 200);
    await checked(await f.handler(request({ usuario_id: 'incorrecto' })), 400);
    await checked(await f.handler(request()), 200);
  }
});
