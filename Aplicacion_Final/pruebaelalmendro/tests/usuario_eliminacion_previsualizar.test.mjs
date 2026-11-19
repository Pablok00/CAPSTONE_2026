import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { isExceptionalTarget, exceptionalProfile, assertExceptionalOperation } from '../supabase/functions/usuario-eliminacion-previsualizar/eliminacion-preparar.mjs';
import { fingerprint } from '../supabase/functions/usuario-eliminacion-previsualizar/eliminacion-coordinar.mjs';
import { createHandler, errorInspeccionPorEtapa } from '../supabase/functions/usuario-eliminacion-previsualizar/handler.mjs';
import { REQUIRED_TABLES, validateDatabaseUrl, createDatabaseProvider, assertCompleteVisibility, databaseUrlFromEnvironment } from '../supabase/functions/usuario-eliminacion-previsualizar/database-safety.mjs';
const actor = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
function fixture(overrides = {}) {
  const calls = [];
  return { calls, handler: createHandler({
    authenticate: async () => overrides.actor === undefined ? { id: actor, permanent: true } : overrides.actor,
    inspect: async (...args) => {
      calls.push(args);
      if (overrides.fail) throw new Error('detalle privado que no debe aparecer');
      return { callerPermanent: true, targetExists: true, authExists: true,
        targetPermanent: false, permanentCount: 2, checkedAt: '2026-11-01T00:00:00Z',
        assignments: { mantenciones: 0, tareas: 0 }, storage: { total: 0, por_owner_id: 0, por_owner: 0 },
        documents: { prevencion: 0, trabajadores: 0 },
        historial_solicitudes: { solicitudes_creadas: 0, avisos_asociados: 0, accion: 'conservar_sin_modificar' },
        references: [], ...overrides.data };
    }, origins: ['https://permitido.example'],
  }) };
}
function request(body = { usuario_id: target }, options = {}) {
  return new Request('https://local.invalid/preview', {
    method: 'POST', headers: { authorization: 'Bearer sesion-simulada', 'content-type': 'application/json', ...options.headers },
    body: JSON.stringify(body),
  });
}
test('AE.1: previsualización excepcional no autoriza y rechaza perfil cambiado o evidencia del navegador', async () => {
  for (const id of ['43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4','d642838d-19df-4fd5-994a-77c6b63795ad']) {
    for (const eligible of [true, false, undefined]) {
      const f = fixture({ data: { exceptionalEligible: eligible } });
      const response = await f.handler(request({ usuario_id: id }));
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.puede_eliminar, false);
      assert.equal(body.bloqueos.includes('EXCEPCION_NO_ELEGIBLE'), eligible !== true);
      assert.equal(body.bloqueos.includes('COMPUERTA_EXCEPCIONAL_CERRADA'), true);
      assert.equal(body.validacion_integral_completa, false);
    }
    const f = fixture();
    assert.equal((await f.handler(request({ usuario_id: id, exceptionalEligible: true }))).status, 400);
    assert.equal(f.calls.length, 0);
  }
});
test('AE.1: inspector real de ejecución conserva Técnico/Recepción y limita la excepción', async () => {
  const source = readFileSync(new URL('../supabase/functions/usuario-eliminacion-ejecutar/index.ts', import.meta.url), 'utf8');
  const code = stripTypeScriptTypes(source.slice(source.indexOf('async function inspect('), source.indexOf('// Cuerpo acotado')));
  for (const [id, changes, allowed] of [
    ['43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4', {}, true],
    ['d642838d-19df-4fd5-994a-77c6b63795ad', {}, true],
    [target, { rol: 'Técnico', rol_id: actor }, true],
    [target, { rol: 'Recepción', rol_id: actor }, true],
    [target, {}, false],
    ['fad894e5-0fd5-4637-ad0f-31ffa41dc6cf', { rol: 'Administrador', rol_id: actor }, false],
    ['43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4', { estado: false }, false],
    ['43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4', { rol_id: actor }, false],
    ['43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4', { trabajador_id: actor }, false],
    ['43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4', { auth_exists: false }, false],
  ]) {
    const tx = async parts => parts.join('?').includes('SELECT u.id') ? [{ id, nombre: 'Fixture',
      estado: true, rol_id: null, trabajador_id: null, rol: null, auth_exists: true,
      permanent: true, target_permanent: false, admins: 1, mantenciones: 0, tareas: 0, storage: 0, ...changes }] : [];
    const database = () => ({ begin: async (_mode, callback) => callback(tx) });
    const inspect = new Function('database','assertCompleteVisibility','isExceptionalTarget','exceptionalProfile',
      'assertExceptionalOperation','fingerprint', `${code}; return inspect;`)(database, async () => {},
      isExceptionalTarget, exceptionalProfile, assertExceptionalOperation, fingerprint);
    const result = () => inspect(actor, id, undefined, { nombre_confirmacion: 'Fixture', operacion_id: target });
    if (allowed) assert.equal((await result()).targetExists, true);
    else await assert.rejects(result());
  }
});
test('sin sesión o sin permanencia no inspecciona datos', async () => {
  for (const user of [null, { id: actor, permanent: false }]) {
    const f = fixture({ actor: user });
    assert.equal((await f.handler(request())).status, user ? 403 : 401);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  assert.equal((await f.handler(request(undefined, { headers: { authorization: '' } }))).status, 401);
  assert.equal(f.calls.length, 0);
});
test('rechaza comandos, parámetros extra, UUID inválido, cuerpo excesivo y origen ajeno', async () => {
  const f = fixture();
  for (const body of [{ usuario_id: target, eliminar: true }, { usuario_id: 'invalido' }, { otro: target }, { usuario_id: 'x'.repeat(300) }]) {
    assert.equal((await f.handler(request(body))).status, 400);
  }
  assert.equal((await f.handler(request(undefined, { headers: { origin: 'https://ajeno.example' } }))).status, 403);
  assert.equal((await f.handler(new Request('https://local.invalid', { method: 'DELETE' }))).status, 405);
  assert.equal(f.calls.length, 0);
});
test('respuesta sin bloqueos operativos nunca permite eliminar', async () => {
  const f = fixture(); const r = await f.handler(request()); const body = await r.json();
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(f.calls, [[actor, target]]);
  assert.equal(body.puede_eliminar, false); assert.equal(body.eliminacion_habilitada, false);
  assert.equal(body.validacion_integral_completa, false);
  assert.deepEqual(body.bloqueos, ['ELIMINACION_NO_IMPLEMENTADA']);
});
test('señala propia, último administrador, asignaciones y Storage', async () => {
  const f = fixture({ data: { targetPermanent: true, permanentCount: 1,
    assignments: { mantenciones: 3, tareas: 2 }, storage: { total: 4, por_owner_id: 4, por_owner: 4 } } });
  const body = await (await f.handler(request({ usuario_id: actor }))).json();
  for (const code of ['CUENTA_PROPIA', 'ULTIMO_ADMIN_PERMANENTE', 'ASIGNACIONES_MANTENCIONES', 'ASIGNACIONES_TAREAS', 'OBJETOS_STORAGE_CON_PROPIETARIO']) assert(body.bloqueos.includes(code));
  assert.equal(body.storage.total, 4);
});
test('revocación y errores fallan cerrados sin exponer detalles', async () => {
  const f = fixture({ data: { callerPermanent: false } });
  assert.equal((await f.handler(request())).status, 403);
  const broken = fixture({ fail: true }); const r = await broken.handler(request());
  assert.equal(r.status, 503); const text = await r.text();
  assert(!text.includes('detalle privado')); assert.equal(JSON.parse(text).puede_eliminar, false);
});
test('perfil/Auth ausentes se informan sin inventar aptitud', async () => {
  const f = fixture({ data: { targetExists: false, authExists: false } });
  const body = await (await f.handler(request())).json();
  assert(body.bloqueos.includes('PERFIL_OBJETIVO_AUSENTE'));
  assert(body.bloqueos.includes('CUENTA_AUTH_OBJETIVO_AUSENTE'));
});

// Todas las cadenas siguientes son datos sintéticos; no se lee env ni se abre ninguna conexión.
const ref = 'hgveesryfmcjxpeumzbp';
const direct = `postgresql://postgres:simulado@db.${ref}.supabase.co:5432/postgres`;
const pooled = `postgresql://postgres.${ref}:simulado@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;

test('Paso 183: SUPABASE_DB_URL predeterminada con validación y override explícito sin fallback inseguro', () => {
  for (const env of [{ SUPABASE_DB_URL: direct }, { SUPABASE_DB_URL: pooled },
    { SUPABASE_DB_URL: 'invalida', PREVIEW_DATABASE_URL: direct }]) {
    let reads = 0; let created = 0;
    const get = createDatabaseProvider({ databaseUrl: () => databaseUrlFromEnvironment(name => { reads++; return env[name]; }),
      postgres: options => { created++; assert.equal(options.port, 5432); assert.deepEqual(options.ssl, { rejectUnauthorized: true }); return {}; } });
    assert.equal(reads, 0); get(); get(); assert.equal(created, 1);
  }
  for (const env of [{}, { SUPABASE_DB_URL: '' }, { SUPABASE_DB_URL: direct.replace(ref, 'otro') },
    { SUPABASE_DB_URL: pooled.replace(':5432/', ':6543/') },
    { SUPABASE_DB_URL: direct, PREVIEW_DATABASE_URL: '' }, { SUPABASE_DB_URL: direct, PREVIEW_DATABASE_URL: 'invalida' }]) {
    let created = 0;
    const get = createDatabaseProvider({ databaseUrl: () => databaseUrlFromEnvironment(name => env[name]), postgres: () => { created++; } });
    assert.throws(get, /NO_ACREDITADA/); assert.equal(created, 0);
  }
});

test('Paso 183: falta de conexión produce 503 sin conteos y sin crear driver', async () => {
  let created = 0;
  const get = createDatabaseProvider({ databaseUrl: () => databaseUrlFromEnvironment(() => undefined), postgres: () => { created++; } });
  const handler = createHandler({ authenticate: async () => ({ id: actor, permanent: true }), inspect: async () => get() });
  const response = await handler(request()); const body = await response.json();
  assert.equal(response.status, 503); assert.equal(created, 0);
  assert.equal(body.error, 'DEPENDENCIAS_NO_VERIFICABLES'); assert.equal(body.storage, undefined);
  assert.equal(body.historial_solicitudes, undefined); assert.equal(body.puede_eliminar, false); assert.equal(body.eliminacion_habilitada, false);
});

test('Paso 183: Auth usa defaults de plataforma y JWT del usuario; configuración ausente falla segura', async () => {
  const source = readFileSync(new URL('../supabase/functions/usuario-eliminacion-previsualizar/index.ts', import.meta.url), 'utf8');
  const code = stripTypeScriptTypes(source.slice(source.indexOf('async function authenticate('), source.indexOf('Deno.serve(')));
  const url = `https://${ref}.supabase.co`; const calls = [];
  const setting = name => { const values = { SUPABASE_URL: url, SUPABASE_ANON_KEY: 'anon-sintetica' }; return values[name]; };
  // publicApiKey fue incorporada al código existente; simular su valor sin cambiar Auth.
  const auth = new Function('setting', 'EXPECTED_PROJECT', 'publicApiKey', 'fetch', `${code};return authenticate;`)(setting, url, () => 'anon-sintetica',
    async (endpoint, options) => { calls.push({ endpoint, options }); return { ok: true, status: 200, json: async () =>
      endpoint.endsWith('/auth/v1/user') ? { id: actor, role: 'authenticated' } : [{ es_admin_permanente: true }] }; });
  assert.deepEqual(await auth('Bearer sesion-sintetica'), { id: actor, permanent: true });
  assert.equal(calls.length, 2); assert(calls[1].endpoint.endsWith('/rest/v1/rpc/mi_estado_administrativo'));
  assert(calls.every(c => c.options.headers.apikey === 'anon-sintetica' && c.options.headers.Authorization === 'Bearer sesion-sintetica'));
  // No env real ni credenciales. setting real lanza cuando falta una variable.
  const missing = new Function('setting', 'EXPECTED_PROJECT', 'fetch', `${code};return authenticate;`)(
    () => { throw new Error('Configuración de servidor incompleta'); }, url, () => { throw new Error('no debe llamar'); });
  const response = await createHandler({ authenticate: missing, inspect: async () => { throw new Error('no debe inspeccionar'); } })(request());
  const body = await response.json(); assert.equal(response.status, 503);
  assert.equal(body.error, 'AUTENTICACION_NO_VERIFICABLE'); assert.equal(body.storage, undefined); assert.equal(body.puede_eliminar, false);
});

test('Paso 185.4E: cada fallo inspect devuelve una etapa fija sin logs', async () => {
  const source = readFileSync(new URL('../supabase/functions/usuario-eliminacion-previsualizar/index.ts', import.meta.url), 'utf8');
  const code = stripTypeScriptTypes(source.slice(source.indexOf('async function inspect('), source.indexOf('async function authenticate(')));
  const etapas = ['CONFIGURACION_DATABASE_URL', 'INICIO_TRANSACCION', 'VERIFICACION_VISIBILIDAD',
    'CONSULTA_ROL_ADMINISTRADOR', 'CONSULTA_DEPENDENCIAS', 'CONSULTA_STORAGE', 'CONSULTA_REFERENCIAS_FK', 'CONSTRUCCION_RESPUESTA'];
  for (const etapa of etapas) {
    const logs = [];
    const reject = () => { throw new Error(`secreto-sintetico postgres://privado JWT ${actor} SELECT privado`); };
    const row = { profile_exists: true, auth_exists: true, permanent: false, admins: '2',
      mantenciones: '0', tareas: '0', prevencion: '0', trabajadores: '0', solicitudes_creadas: '1', avisos_asociados: '1' };
    const tx = async parts => {
      const query = parts.join('?');
      if (query.includes('lower(btrim(nombre))')) { if (etapa === 'CONSULTA_ROL_ADMINISTRADOR') reject(); return [{ id: target }]; }
      if (query.includes('SELECT id FROM public.usuarios')) return [{ id: actor }];
      if (query.includes('transaction_timestamp()')) { if (etapa === 'CONSULTA_DEPENDENCIAS') reject(); return [row]; }
      if (query.includes('FROM storage.objects')) { if (etapa === 'CONSULTA_STORAGE') reject(); return [{ total: '0', por_owner_id: '0', por_owner: '0' }]; }
      if (etapa === 'CONSULTA_REFERENCIAS_FK') reject();
      return [];
    };
    if (etapa === 'CONSTRUCCION_RESPUESTA') row.admins = 'conteo-invalido';
    const database = () => {
      if (etapa === 'CONFIGURACION_DATABASE_URL') reject();
      return { begin: async (mode, fn) => {
        assert.equal(mode, 'isolation level repeatable read read only');
        if (etapa === 'INICIO_TRANSACCION') reject();
        return await fn(tx);
      } };
    };
    const inspect = new Function('database', 'assertCompleteVisibility', 'errorInspeccionPorEtapa', 'console', `${code};return inspect;`)(
      database, async () => { if (etapa === 'VERIFICACION_VISIBILIDAD') reject(); }, errorInspeccionPorEtapa, { error: (...args) => logs.push(args) });
    const response = await createHandler({ authenticate: async () => ({ id: actor, permanent: true }), inspect })(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'DEPENDENCIAS_NO_VERIFICABLES', eliminacion_habilitada: false, puede_eliminar: false, etapa_fallida: etapa });
    assert.deepEqual(logs, []); // Sin logs ni mensajes internos.
  }
});

test('Paso 185.4E: fallo al cerrar transacción identifica transacción, no construcción', async () => {
  const source = readFileSync(new URL('../supabase/functions/usuario-eliminacion-previsualizar/index.ts', import.meta.url), 'utf8');
  const code = stripTypeScriptTypes(source.slice(source.indexOf('async function inspect('), source.indexOf('async function authenticate(')));
  const logs = [];
  const database = () => ({ begin: async (_, fn) => {
    await fn(async parts => parts.join('').includes('lower(btrim(nombre))') ? [{ id: target }] : []);
    throw new Error('detalle-privado');
  } });
  const inspect = new Function('database', 'assertCompleteVisibility', 'errorInspeccionPorEtapa', 'console', `${code};return inspect;`)(database, async () => {}, errorInspeccionPorEtapa, { error: (...args) => logs.push(args) });
  const response = await createHandler({ authenticate: async () => ({ id: actor, permanent: true }), inspect })(request());
  assert.equal((await response.json()).etapa_fallida, 'INICIO_TRANSACCION'); assert.deepEqual(logs, []);
});

test('Paso 185.4E: construcción o serialización del handler devuelve solo RESPUESTA_INVALIDA', async () => {
  const original = console.error; const logs = [];
  try {
    console.error = (...args) => logs.push(args);
    for (const data of [null, { callerPermanent: true, assignments: { mantenciones: 1n, tareas: 0 }, storage: { total: 0 }, references: [] }]) {
      const response = await createHandler({ authenticate: async () => ({ id: actor, permanent: true }), inspect: async () => data })(request());
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'DEPENDENCIAS_NO_VERIFICABLES', eliminacion_habilitada: false, puede_eliminar: false, etapa_fallida: 'RESPUESTA_INVALIDA' });
    }
    assert.deepEqual(logs, []);
  } finally { console.error = original; }
});
test('Paso 185.4E: Auth y roles rechazados nunca revelan etapas, incluso errores marcados', async () => {
  let calls = 0;
  for (const authenticate of [async () => null, async () => ({ id: actor, permanent: false }),
    async () => ({ id: actor, permanent: false, temporal: true }),
    async () => { throw errorInspeccionPorEtapa('CONSULTA_STORAGE'); }]) {
    const response = await createHandler({ authenticate, inspect: async () => { calls++; } })(request());
    assert([401, 403, 503].includes(response.status));
    const body = await response.json();
    assert.equal(body.etapa_fallida, undefined);
    assert.equal(body.puede_eliminar, false); assert.equal(body.eliminacion_habilitada, false);
  }
  assert.equal(calls, 0);
});

test('Paso 185.4E: no copia etiquetas arbitrarias ni propiedades de excepciones', async () => {
  for (const error of [errorInspeccionPorEtapa('secreto-no-permitido'),
    Object.assign(new Error('secreto-no-permitido'), { etapa_fallida: 'CONSULTA_STORAGE' }), null, 'secreto-no-permitido']) {
    const response = await createHandler({ authenticate: async () => ({ id: actor, permanent: true }),
      inspect: async () => { throw error; } })(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'DEPENDENCIAS_NO_VERIFICABLES', puede_eliminar: false, eliminacion_habilitada: false });
  }
});

test('URL: admite solo directa y pooler compartido de sesión para el proyecto fijado', () => {
  for (const value of [direct, pooled, direct.replace(':5432', ''), direct + '?sslmode=verify-full', pooled + '?sslmode=require']) {
    const config = validateDatabaseUrl(value);
    assert.equal(config.database, 'postgres');
    assert.equal(config.password, 'simulado');
    assert.equal(config.port, 5432);
  }
});
test('URL: rechaza otro proyecto, host, rol, base, puerto, parámetros y SSL inseguro sin revelar valores', () => {
  for (const value of [undefined, '', direct.replace(ref, 'otroproyecto'), pooled.replace(ref, 'otroproyecto'),
    direct.replace('.supabase.co', '.supabase.co.ajeno.example'), direct.replace('postgres:simulado', 'lector:simulado'),
    direct.replace('/postgres', '/otra_base'), direct.replace(':5432/', ':1234/'), direct + '?sslmode=disable',
    direct + '?host=ajeno.example', direct + '?sslmode=require&sslmode=verify-full', direct + '#fragmento',
    direct.replace(':simulado@', '@'), direct + ' ', direct.replace('simulado', '%ZZ'),
    pooled.replace('pooler.supabase.com', 'pooler.supabase.com.ajeno.example')]) {
    assert.throws(() => validateDatabaseUrl(value), error =>
      error.message === 'VISIBILIDAD_O_CONFIGURACION_NO_ACREDITADA' && !error.message.includes('simulado'));
  }
});
test('pool por worker: creación perezosa, TLS verificado, max 1 y prepare false', () => {
  const calls = []; const stub = {};
  const get = createDatabaseProvider({ postgres: config => { calls.push(config); return stub; }, databaseUrl: () => pooled });
  assert.equal(calls.length, 0); assert.equal(get(), stub); assert.equal(get(), stub);
  assert.equal(calls.length, 1); assert.equal(calls[0].max, 1); assert.equal(calls[0].prepare, false);
  assert.equal(calls[0].max_pipeline, 100);
  assert.deepEqual(calls[0].ssl, { rejectUnauthorized: true });
  let connections = 0;
  const bad = createDatabaseProvider({ postgres: () => { connections++; }, databaseUrl: () => pooled.replace(ref, 'otro') });
  assert.throws(bad); assert.equal(connections, 0);
});
test('puerto 6543 y otros modos se rechazan antes de crear el driver', () => {
  for (const url of [direct.replace(':5432/', ':6543/'), pooled.replace(':5432/', ':6543/'),
    pooled.replace(':5432/', ':6432/'), pooled.replace(ref, 'tenant-ajeno'),
    direct + '?max_pipeline=0', pooled + '?options=-c%20role=otro']) {
    let created = 0;
    const provider = createDatabaseProvider({ databaseUrl: () => url, postgres: () => { created++; } });
    assert.throws(provider, /NO_ACREDITADA/); assert.equal(created, 0);
  }
});
test('max_pipeline explícito no puede heredarse como cero u otro valor del entorno simulado', () => {
  // Replica únicamente la precedencia opción > entorno documentada por Postgres.js.
  // No lee ni modifica process.env y no ejecuta el driver real ni sql.begin().
  for (const inherited of [0, 1, 999, undefined]) {
    const provider = createDatabaseProvider({ databaseUrl: () => pooled,
      postgres: options => ({ effectivePipeline: options.max_pipeline ?? inherited }) });
    assert.equal(provider().effectivePipeline, 100);
    assert(provider().effectivePipeline > 0);
  }
});
const visible = () => REQUIRED_TABLES.map(table_name => ({ table_name, effective_role: 'postgres', login_role: 'postgres',
  database_name: 'postgres', read_only: 'on', isolation: 'repeatable read', row_security: 'off', bypass_rls: true,
  relation_kind: 'r', schema_usage: true, can_select: true, rls_active: false }));
function fakeTransaction(rows, statements = []) {
  return async parts => { const query = parts.join('?'); statements.push(query); return query.includes('WITH required') ? rows : []; };
}
test('visibilidad: diez tablas completas y guardas de sesión dentro de la transacción', async () => {
  const statements = []; await assertCompleteVisibility(fakeTransaction(visible(), statements));
  assert.equal(REQUIRED_TABLES.length, 10);
  for (const name of ['solicitudes_reactivas', 'solicitudes_reactivas_avisos']) {
    assert(REQUIRED_TABLES.includes(`public.${name}`));
    assert(statements[3].includes(`('public','${name}')`));
  }
  assert.equal(statements.length, 4);
  assert(statements[2].includes('SET LOCAL row_security = off'));
  assert(statements[3].includes('has_table_privilege'));
  assert(statements[3].includes('row_security_active'));
});
test('visibilidad: bloquea identidad, bypass, SELECT/USAGE o tabla ausente y filtrado activo', async () => {
  const changes = [{ effective_role: 'lector' }, { login_role: 'otro' }, { database_name: 'otra' },
    { bypass_rls: false }, { can_select: false }, { can_select: null }, { schema_usage: false },
    { rls_active: true }, { rls_active: null }, { relation_kind: null }, { relation_kind: 'v' },
    { read_only: 'off' }, { row_security: 'on' }, { isolation: 'read committed' }];
  for (const change of changes) {
    const rows = visible(); Object.assign(rows[7], change);
    await assert.rejects(assertCompleteVisibility(fakeTransaction(rows)), /NO_ACREDITADA/);
  }
  await assert.rejects(assertCompleteVisibility(fakeTransaction(visible().slice(1))));
  const repeated = visible(); repeated[7] = repeated[0];
  await assert.rejects(assertCompleteVisibility(fakeTransaction(repeated)));
});
test('permisos insuficientes o conexión fallida devuelven 503, nunca conteos cero o secretos', async () => {
  for (const configuration of ['no-bypass', 'no-select', 'error-conexion', 'url-ajena']) {
    let businessReads = 0;
    const handler = createHandler({ authenticate: async () => ({ id: actor, permanent: true }), inspect: async () => {
      if (configuration === 'url-ajena') validateDatabaseUrl(pooled.replace(ref, 'otro'));
      if (configuration === 'error-conexion') throw new Error('detalle-conexion-sintetico');
      const rows = visible(); rows[7][configuration === 'no-select' ? 'can_select' : 'bypass_rls'] = false;
      await assertCompleteVisibility(fakeTransaction(rows));
      businessReads++; throw new Error('No debe llegar');
    } });
    const response = await handler(request()); const body = await response.json();
    assert.equal(response.status, 503); assert.equal(businessReads, 0);
    assert.equal(body.puede_eliminar, false); assert.equal(body.eliminacion_habilitada, false);
    assert.equal(body.storage, undefined); assert(!JSON.stringify(body).includes('sintetico'));
  }
});
test('todos los errores JSON mantienen ambas banderas de eliminación deshabilitadas', async () => {
  const f = fixture();
  const requests = [request({ usuario_id: 'mal' }), request(undefined, { headers: { authorization: '' } }),
    request(undefined, { headers: { origin: 'https://ajeno.example' } }), new Request('https://local.invalid', { method: 'DELETE' })];
  for (const r of requests) {
    const body = await (await f.handler(r)).json();
    assert.equal(body.puede_eliminar, false); assert.equal(body.eliminacion_habilitada, false);
  }
});

test('Paso 150: permisos o ausencia de cada tabla histórica bloquean sin conteos', async () => {
  for (const name of ['public.solicitudes_reactivas', 'public.solicitudes_reactivas_avisos']) {
    for (const mode of ['ausente', 'select', 'usage', 'rls']) {
      let businessReads = 0;
      const handler = createHandler({ authenticate: async () => ({ id: actor, permanent: true }), inspect: async () => {
        let rows = visible();
        if (mode === 'ausente') rows = rows.filter(row => row.table_name !== name);
        else Object.assign(rows.find(row => row.table_name === name),
          mode === 'select' ? { can_select: false } : mode === 'usage' ? { schema_usage: false } : { rls_active: true });
        await assertCompleteVisibility(fakeTransaction(rows)); businessReads++;
      } });
      const response = await handler(request()); const body = await response.json();
      assert.equal(response.status, 503); assert.equal(businessReads, 0);
      assert.equal(body.historial_solicitudes, undefined);
      assert.equal(body.puede_eliminar, false); assert.equal(body.eliminacion_habilitada, false);
    }
  }
});

test('Paso 150: inspect real con driver simulado, conteos parametrizados y respuesta conservable', async () => {
  // Ejecuta únicamente inspect extraído del código local: no importa index.ts ni lee env.
  // El driver simula resultados agregados; las comprobaciones SQL son estructurales, no PostgreSQL real.
  const source = readFileSync(new URL('../supabase/functions/usuario-eliminacion-previsualizar/index.ts', import.meta.url), 'utf8');
  const start = source.indexOf('async function inspect(');
  const end = source.indexOf('async function authenticate(');
  assert(start >= 0 && end > start);
  const code = stripTypeScriptTypes(source.slice(start, end));
  for (const expected of [[1, 1], [0, 0], [2, 3]]) {
    const statements = []; let fail = false;
    const tx = async (parts, ...values) => {
      const query = parts.join('?'); statements.push({ query, values });
      if (query.includes('WITH required')) return visible();
      if (query.includes('lower(btrim(nombre))')) return [{ id: target }];
      if (query.includes('SELECT id FROM public.usuarios')) return [{ id: actor }];
      if (query.includes('transaction_timestamp()')) {
        assert(query.includes('FROM public.solicitudes_reactivas WHERE creada_por = ?::uuid'));
        assert.match(query, /FROM public\.solicitudes_reactivas_avisos aviso\s+WHERE EXISTS/);
        assert.match(query, /solicitud\.id = aviso\.solicitud_id AND solicitud\.creada_por = \?::uuid/);
        assert(!/\bJOIN\b/i.test(query)); // EXISTS cuenta cada aviso una vez, sin multiplicar solicitudes.
        assert(values.every(value => value === target)); assert(!query.includes(target));
        if (fail) throw new Error('detalle privado');
        return [{ profile_exists: true, auth_exists: true, permanent: false, admins: '2',
          mantenciones: '0', tareas: '0', prevencion: '0', trabajadores: '0',
          solicitudes_creadas: String(expected[0]), avisos_asociados: String(expected[1]), checked_at: 'simulado' }];
      }
      if (query.includes('FROM storage.objects')) return [{ total: '0', por_owner_id: '0', por_owner: '0' }];
      return [];
    };
    const database = () => ({ begin: async (mode, fn) => {
      assert.equal(mode, 'isolation level repeatable read read only'); return await fn(tx);
    } });
    const inspect = new Function('database', 'assertCompleteVisibility', 'errorInspeccionPorEtapa', 'isExceptionalTarget', `${code}; return inspect;`)(database, assertCompleteVisibility, errorInspeccionPorEtapa, isExceptionalTarget);
    const handler = createHandler({ authenticate: async () => ({ id: actor, permanent: true }), inspect });
    const response = await handler(request()); const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.historial_solicitudes, { solicitudes_creadas: expected[0], avisos_asociados: expected[1], accion: 'conservar_sin_modificar' });
    assert.deepEqual(body.bloqueos, ['ELIMINACION_NO_IMPLEMENTADA']);
    assert.equal(body.puede_eliminar, false); assert.equal(body.eliminacion_habilitada, false);
    assert.equal(body.validacion_integral_completa, false);
    assert.equal(statements.filter(s => s.query.includes('transaction_timestamp()')).length, 1);
    fail = true;
    const error = await handler(request()); const errorBody = await error.json();
    assert.equal(error.status, 503); assert.equal(errorBody.historial_solicitudes, undefined);
    assert(!JSON.stringify(errorBody).includes('detalle privado'));
    assert.equal(errorBody.puede_eliminar, false); assert.equal(errorBody.eliminacion_habilitada, false);
  }
});


test('Paso 185.6: configuración clasifica nueve fallos sin filtrar secretos', async () => {
  const source = readFileSync(new URL('../supabase/functions/usuario-eliminacion-previsualizar/index.ts', import.meta.url), 'utf8');
  const code = stripTypeScriptTypes(source.slice(source.indexOf('async function inspect('), source.indexOf('async function authenticate(')));
  const cases = [
    [undefined, 'URL_AUSENTE'], ['', 'URL_AUSENTE'], ['no-es-url', 'FORMATO_URL_INVALIDO'],
    [direct.replace(ref, 'otroproyecto'), 'HOST_NO_ADMITIDO'],
    [pooled.replace(':5432', ':6543'), 'PUERTO_NO_ADMITIDO'],
    [pooled.replace(ref, 'otroproyecto'), 'USUARIO_NO_ADMITIDO'],
    [direct.replace(/\/postgres$/, '/otra'), 'BASE_DATOS_NO_ADMITIDA'],
    [direct + '?sslmode=disable', 'PARAMETROS_NO_ADMITIDOS'],
    [direct.replace(':simulado@', '@'), 'CREDENCIALES_NO_VERIFICABLES'],
    [direct.replace('simulado', '%ZZ'), 'CREDENCIALES_NO_VERIFICABLES'],
    [direct, 'INICIALIZACION_CLIENTE_FALLIDA'],
  ];
  for (const [raw, expected] of cases) {
    const provider = createDatabaseProvider({ postgres: () => { throw new Error('secreto-sintetico'); },
      databaseUrl: () => databaseUrlFromEnvironment(name => name === (expected === 'PARAMETROS_NO_ADMITIDOS' ? 'PREVIEW_DATABASE_URL' : 'SUPABASE_DB_URL') ? raw : undefined) });
    let marked;
    try { provider(); assert.fail('debe fallar'); } catch (error) {
      marked = errorInspeccionPorEtapa('CONFIGURACION_DATABASE_URL', error);
    }
    const inspect = new Function('database', 'assertCompleteVisibility', 'errorInspeccionPorEtapa', `${code};return inspect;`)(
      provider, async () => { throw new Error('no debe consultar'); }, errorInspeccionPorEtapa);
    const response = await createHandler({ authenticate: async () => ({ id: actor, permanent: true }), inspect })(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'DEPENDENCIAS_NO_VERIFICABLES', etapa_fallida: 'CONFIGURACION_DATABASE_URL',
      detalle_configuracion: expected, puede_eliminar: false, eliminacion_habilitada: false });
    for (const authenticate of [async () => { throw marked; }, async () => null, async () => ({ id: actor, permanent: false })]) {
      const denied = await createHandler({ authenticate, inspect })(request());
      const body = await denied.json(); assert.equal(body.detalle_configuracion, undefined); assert.equal(body.etapa_fallida, undefined);
    }
  }
});

test('Paso 185.8: parámetros automáticos descartados, override estricto y ninguna opción llega al driver', () => {
  for (const base of [direct, pooled]) {
    const query = '?application_name=prueba&sslmode=disable&host=ajeno.example&port=6543&user=otro&password=no-usar&database=otra&options=privado&max=99&prepare=true&ssl=false';
    let captured; let created = 0;
    const env = { SUPABASE_DB_URL: base + query };
    const selected = databaseUrlFromEnvironment(name => env[name]);
    assert.equal(selected.source, 'SUPABASE_DB_URL');
    const get = createDatabaseProvider({ databaseUrl: () => selected,
      postgres: config => { captured = config; created++; return {}; } });
    get(); get(); assert.equal(created, 1);
    assert.deepEqual(captured, { ...validateDatabaseUrl(base), ssl: { rejectUnauthorized: true },
      max: 1, prepare: false, max_pipeline: 100, connect_timeout: 10, idle_timeout: 5, max_lifetime: 60,
      debug: false, onnotice: captured.onnotice });
    assert.equal(JSON.stringify(captured).includes('privado'), false);
    env.PREVIEW_DATABASE_URL = base + query;
    const strict = createDatabaseProvider({ databaseUrl: () => databaseUrlFromEnvironment(name => env[name]),
      postgres: () => { assert.fail('no debe crear driver'); } });
    assert.throws(strict, /NO_ACREDITADA/);
    assert.throws(() => validateDatabaseUrl(base + query));
  }
});

test('Paso 185.8: parámetros automáticos no evitan las guardas de identidad y conexión', () => {
  for (const raw of [direct.replace(ref, 'otro'), pooled.replace(ref, 'otro'),
    direct.replace(':5432/', ':6543/'), direct.replace('postgres:simulado', 'otro:simulado'),
    direct.replace(/\/postgres$/, '/otra'), direct.replace(':simulado@', '@'), direct.replace('postgresql:', 'https:')]) {
    let created = 0;
    const get = createDatabaseProvider({ databaseUrl: () => databaseUrlFromEnvironment(name =>
      name === 'SUPABASE_DB_URL' ? raw + '?host=correcto&sslmode=require&application_name=prueba' : undefined),
      postgres: () => { created++; } });
    assert.throws(get, /NO_ACREDITADA/); assert.equal(created, 0);
  }
});

test('Paso 185.6: override no cae al default, contraseña codificada y TLS siguen estrictos', async () => {
  const raw = direct.replace('simulado', 'texto%40con%3Aseparadores');
  let options;
  const client = { begin() {} };
  const provider = createDatabaseProvider({ postgres: config => { options = config; return client; },
    databaseUrl: () => databaseUrlFromEnvironment(name => name === 'PREVIEW_DATABASE_URL' ? raw : 'url-no-usada') });
  assert.equal(provider(), client); assert.equal(provider(), client);
  assert.equal(options.password, 'texto@con:separadores'); assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.max, 1); assert.equal(options.prepare, false); assert.equal(options.max_pipeline, 100);
  const empty = databaseUrlFromEnvironment(name => name === 'PREVIEW_DATABASE_URL' ? '' : direct);
  assert.deepEqual(empty, { url: '', source: 'PREVIEW_DATABASE_URL' }); assert.throws(() => validateDatabaseUrl(empty.url, empty.source));
  const arbitrary = Object.assign(new Error('privado'), { detalle_configuracion: 'HOST_NO_ADMITIDO' });
  const response = await createHandler({ authenticate: async () => ({ id: actor, permanent: true }),
    inspect: async () => { throw errorInspeccionPorEtapa('CONFIGURACION_DATABASE_URL', arbitrary); } })(request());
  assert.equal((await response.json()).detalle_configuracion, undefined);
});
