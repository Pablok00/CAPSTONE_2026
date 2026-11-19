// INV-05: mocks/HTTP en memoria. No red, PostgreSQL, Auth ni correos reales.
import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createInvitationHandler, createInvitationAuthenticator, createRestrictedFetch, createManualRpcFetch, createManualActorAuthorizer, PROJECT_URL, ejecutarInvitacion, normalizarNombre, InvitationError, DESTINO_INVITACION, DESTINO_INVITACION_LOCAL, destinoInvitacionConfigurado } from '../supabase/functions/usuario-invitaciones/invitaciones.mjs';
import { createInvitationStore, createDirectInvitationSession, INVITE_LOCK_NAMESPACE, DIAGNOSTIC_LOCK_NAMESPACE, estadoInvitacion } from '../supabase/functions/usuario-invitaciones/postgres-store.mjs';
import { createManualService, manualIntent, manualMarca, manualPayload, createManualAuthFetch, exigirCorreoManual, etapaManual } from '../supabase/functions/usuario-invitaciones/manual.mjs';
import { createManualStore } from '../supabase/functions/usuario-invitaciones/manual-store.mjs';

const id = '10000000-0000-4000-8000-000000000001';
const sessionId = '10000000-0000-4000-8000-000000000002';
const actor = { id, sessionId, invitedAt: '2026-11-12', emailConfirmed: true };
const origin = 'https://pruebaelalmendro.vercel.app';
function fixture(options = {}) {
  const state = { profile: { id, nombre: null, estado: true, rol_id: null, trabajador_id: null, ...options.profile },
    auth: { id, invited_at: '2026-11-12', email_confirmed_at: '2026-11-12', password_configurada: true, ...options.auth }, updates: 0, commits: 0 };
  const queries = []; let busy = false;
  const database = () => ({
    async begin(mode, work) {
      assert.equal(mode, 'isolation level read committed read write');
      if (busy) throw new InvitationError('OPERACION_CONCURRENTE_REVISAR');
      busy = true;
      const previous = structuredClone(state);
      const tx = async (parts, ...values) => {
        const text = parts.join('?').replace(/\s+/g, ' ').trim();
        queries.push({ text, values });
        if (options.delay) await options.delay(text);
        if (text.startsWith('SET LOCAL') || text.startsWith('SELECT set_config')) return [];
        if (text.includes('AS effective_role')) return [{ effective_role: 'postgres', login_role: 'postgres', database_name: 'postgres',
          isolation: 'read committed', read_only: 'off', bypass_rls: true, can_update_name: true, ...options.context }];
        if (text.includes('auth.uid()')) return [{ actor_id: options.identity || id }];
        if (text.includes('pg_try_advisory')) return [{ acquired: options.lock !== false }];
        if (text.includes('SELECT id,invited_at')) return options.noAuth ? [] : [structuredClone(state.auth)];
        if (text.includes('SELECT id,nombre,estado')) return options.noProfile ? [] : [structuredClone(state.profile)];
        if (text.includes('SELECT id,estado,rol_id')) return [structuredClone(state.profile)];
        if (text.includes('FROM public.roles')) return [{ id: state.profile.rol_id, normalizado: options.role || 'administrador' }];
        if (text.includes('es_administrador_permanente_actual')) return [{ permitido: options.helper !== false }];
        if (text.includes('WHERE lower(email)')) return options.existing ? [{ id }] : [];
        if (text.startsWith('UPDATE public.usuarios')) {
          assert.match(text, /^UPDATE public\.usuarios SET nombre=\?/);
          assert.deepEqual(values, [values[0], id]);
          state.updates++;
          state.profile.nombre = values[0];
          if (options.triggerFailure) throw Error('TRIGGER_RECHAZA_NO_EXPONER');
          return [structuredClone(state.profile)];
        }
        throw Error('Consulta no cubierta: ' + text);
      };
      try {
        const result = await work(tx);
        if (options.commitUncertain) throw Error('COMMIT_INCIERTO_NO_EXPONER');
        state.commits++;
        return result;
      } catch (error) { Object.assign(state, previous); throw error; }
      finally { busy = false; }
    },
  });
  return { state, queries, store: createInvitationStore(database, options.invitationSession) };
}
const nameBody = { accion: 'COMPLETAR_NOMBRE', nombre: '  Ana   O’Connor  ' };

test('nombre propio: transacción, contexto verificado, coordinación antes de filas y único UPDATE parametrizado', async () => {
  const f = fixture();
  const result = await ejecutarInvitacion({ body: nameBody, actor, store: f.store });
  assert.equal(result.nombre, 'Ana O’Connor'); assert.equal(result.aplicada, true);
  assert.equal(f.state.updates, 1); assert.equal(f.state.commits, 1);
  const texts = f.queries.map(q => q.text);
  assert.ok(texts.findIndex(q => q.includes('AS effective_role')) < texts.findIndex(q => q.startsWith('UPDATE')));
  assert.ok(texts.findIndex(q => q.includes('pg_try_advisory')) < texts.findIndex(q => q.includes('FOR SHARE NOWAIT')));
  assert.ok(texts.some(q => q.includes('FOR UPDATE NOWAIT')));
  assert.ok(texts.some(q => q.includes('SET LOCAL row_security = off')));
  assert.deepEqual(Object.keys(f.state.profile).sort(), ['estado', 'id', 'nombre', 'rol_id', 'trabajador_id']);
});
test('mismo nombre reconcilia sin otra escritura; distinto no sobrescribe', async () => {
  const f = fixture();
  await ejecutarInvitacion({ body: nameBody, actor, store: f.store });
  const again = await ejecutarInvitacion({ body: nameBody, actor, store: f.store });
  assert.equal(again.reconciliado, true); assert.equal(again.aplicada, false); assert.equal(f.state.updates, 1);
  await assert.rejects(ejecutarInvitacion({ body: { ...nameBody, nombre: 'Otra Persona' }, actor, store: f.store }), /NOMBRE_DISTINTO/);
  assert.equal(f.state.profile.nombre, 'Ana O’Connor');
});
test('respuesta perdida después de commit: repetición del resultado conservado no reescribe', async () => {
  const f = fixture();
  // Se descarta deliberadamente la respuesta, conservando el estado del mock.
  await f.store.completarNombre(actor, 'Ana O’Connor');
  const result = await f.store.completarNombre(actor, 'Ana O’Connor');
  assert.equal(result.reconciliado, true); assert.equal(f.state.updates, 1);
});
test('cada condición backend inválida detiene el nombre antes del UPDATE', async t => {
  for (const options of [{ auth: { password_configurada: false } }, { auth: { invited_at: null } }, { auth: { email_confirmed_at: null } }, { profile: { estado: false } },
    { profile: { rol_id: sessionId } }, { profile: { trabajador_id: sessionId } }, { noAuth: true }, { noProfile: true },
    { context: { effective_role: 'service_role' } }, { context: { login_role: 'authenticated' } },
    { context: { database_name: 'otra' } }, { context: { can_update_name: false } }, { context: { bypass_rls: false } },
    { context: { isolation: 'repeatable read' } }, { lock: false }, { identity: sessionId }]) {
    await t.test(JSON.stringify(options), async () => {
      const f = fixture(options); await assert.rejects(f.store.completarNombre(actor, 'Ana Persona'));
      assert.equal(f.state.updates, 0); assert.equal(f.state.commits, 0);
    });
  }
});
test('guardas y fallo transaccional simulado revierten el nombre', async () => {
  for (const options of [{ triggerFailure: true }, { commitUncertain: true }]) {
    const f = fixture(options); await assert.rejects(f.store.completarNombre(actor, 'Ana Persona'));
    assert.equal(f.state.profile.nombre, null); assert.equal(f.state.commits, 0);
  }
});
test('concurrencia simulada: segunda solicitud rechaza, revisión posterior reconcilia', async () => {
  let resolve, entered;
  const paused = new Promise(r => entered = r);
  const f = fixture({ delay: async text => { if (text.startsWith('UPDATE')) { entered(); await new Promise(r => resolve = r); } } });
  const first = f.store.completarNombre(actor, 'Ana Persona'); await paused;
  await assert.rejects(f.store.completarNombre(actor, 'Otro Nombre'), /CONCURRENTE/);
  resolve(); await first;
  assert.equal((await f.store.completarNombre(actor, 'Ana Persona')).reconciliado, true);
  assert.equal(f.state.updates, 1);
});
test('nombre válido conserva apóstrofos y Unicode, sin SQL dinámico ni HTML/control', async () => {
  assert.equal(normalizarNombre("José O'Connor"), "José O'Connor");
  for (const nombre of ['', 'A', '<script>x</script>', 'Nombre\u0000', 'a'.repeat(321), 5]) assert.throws(() => normalizarNombre(nombre));
  const f = fixture(); const nombre = "Ana'); DELETE FROM usuarios; --";
  await f.store.completarNombre(actor, nombre);
  assert.equal(f.state.profile.nombre, nombre);
  assert.equal(f.queries.filter(q => q.text.startsWith('UPDATE')).length, 1);
});
test('no acepta UUID, rol, ficha, contraseña ni evidencia del navegador', async () => {
  const f = fixture();
  for (const extra of ['usuario_id', 'rol_id', 'trabajador_id', 'password', 'invited_at']) {
    await assert.rejects(ejecutarInvitacion({ body: { ...nameBody, [extra]: id }, actor, store: f.store }), /DATOS_INVALIDOS/);
  }
  await assert.rejects(ejecutarInvitacion({ body: nameBody, actor: { ...actor, invitedAt: null }, store: f.store }), /INVITACION_NO_ACREDITADA/);
  assert.equal(f.queries.length, 0);
});
test('INVITAR: permanente actual, no Técnico/Recepción/temporal/inactivo', async () => {
  for (const options of [{ profile: { rol_id: null } }, { profile: { estado: false, rol_id: id } },
    { profile: { rol_id: id }, role: 'tecnico' }, { profile: { rol_id: id }, role: 'recepcion' }, { profile: { rol_id: id }, helper: false }]) {
    const f = fixture(options);
    await assert.rejects(ejecutarInvitacion({ body: { accion: 'INVITAR', email: 'persona@example.test' }, actor, store: f.store }), /SOLO_ADMIN_PERMANENTE/);
    assert.equal(f.state.updates, 0);
  }
});
function sessionsModel(options = {}) {
  const state = { locks: new Set(), pids: new Set(), sessions: 0, closes: 0, releases: 0, unlocks: 0, queries: [], existing: options.existing || false, lost: false };
  const open = async () => {
    const pid = 100 + ++state.sessions; state.pids.add(pid); let held;
    const sql = async (parts, ...values) => {
      const text = parts.join('?').replace(/\s+/g, ' ').trim();state.queries.push({text, values});
      assert.ok(!/BEGIN|COMMIT|ROLLBACK|209/.test(text),'sesión de invitación sin transacción/candado de eliminación');
      if (text.startsWith('SET statement_timeout')) return [];
      if (text.includes('AS effective_role')) return [{ pid:options.samePid?100:state.lost?pid+500:pid, effective_role: options.badRole?'authenticated':'postgres', login_role:'postgres', database_name:'postgres', bypass_rls:true }];
      if (text.includes('AS permitido')) return [{permitido:options.permanent!==false}];
      if (text.includes('pg_stat_activity')) return [{cerradas:!options.closeNotConfirmed&&!values.some(p=>state.pids.has(p))}];
      if (text.includes('pg_try_advisory_lock')) {
        assert.ok([INVITE_LOCK_NAMESPACE,DIAGNOSTIC_LOCK_NAMESPACE].includes(values[0])); held=values.join(':');
        if(state.locks.has(held)){held=null;return [{pid,acquired:false}];}state.locks.add(held);options.afterLock?.();if(options.loseBeforeHTTP)state.lost=true;return [{pid:state.lost?pid+500:pid,acquired:true}];
      }
      if (text.includes('FROM auth.users') && options.authRows) return structuredClone(options.authRows);
      if (text.includes('FROM public.usuarios') && options.profileRows) return structuredClone(options.profileRows);
      if (text.includes('FROM auth.users')) return state.existing ? [{id,invited_at:'2026-11-12'}] : [];
      if (text.includes('FROM public.usuarios')) return [];
      if (text.includes('pg_advisory_unlock')) {state.unlocks++;if(options.unlockFailure)return [{released:false}];state.locks.delete(held);held=null;return [{released:true}];}
      if(text==='SELECT pg_backend_pid() AS pid')return [{pid:state.lost?pid+500:pid}];
      throw Error(text);
    };
    return {sql,release(){state.releases++;},async close(){state.closes++;state.pids.delete(pid);state.locks.delete(held);if(options.closeFailure)throw Error('close');}};
  };
  return {state,open};
}
const inviteBody={accion:'INVITAR',email:'persona@example.test'};
function adminFixture(model){return fixture({profile:{rol_id:id},invitationSession:model.open});}
function invokeInvite(f,send){return ejecutarInvitacion({body:inviteBody,actor,store:f.store,allowInvites:true,enviarInvitacion:send});}
const confirmed=async()=>({data:{user:{id,email:inviteBody.email,invited_at:'2026-11-12'}}});

test('INVITAR cerrado por defecto y sin conexión acreditada',async()=>{
  let emails=0;const f=fixture({profile:{rol_id:id}});
  await assert.rejects(ejecutarInvitacion({body:inviteBody,actor,store:f.store,enviarInvitacion:async()=>emails++}),/DESHABILITADO/);
  await assert.rejects(invokeInvite(f,async()=>emails++),/SIN_AFINIDAD/);assert.equal(emails,0);
});
test('correo previamente invitado rechaza y libera candado/cliente',async()=>{
  const model=sessionsModel({existing:true}),f=adminFixture(model);let emails=0;
  await assert.rejects(invokeInvite(f,async()=>emails++),/CUENTA_EXISTENTE/);
  assert.equal(emails,0);assert.equal(model.state.unlocks,1);assert.equal(model.state.closes,1);assert.equal(model.state.locks.size,0);
});
test('envío simulado bajo sesión, HTTPS fijo y sin acreditar entrega',async()=>{
  const model=sessionsModel(),f=adminFixture(model);let emails=0;
  const result=await invokeInvite(f,async(email,url)=>{emails++;assert.equal(email,inviteBody.email);assert.equal(url,DESTINO_INVITACION);assert.equal(model.state.locks.size,1);return confirmed();});
  assert.equal(result.estado,'INVITACION_CONFIRMADA');assert.equal(result.entrega_correo_acreditada,false);assert.equal(emails,1);
  assert.equal(model.state.unlocks,1);assert.equal(model.state.closes,1);assert.equal(model.state.locks.size,0);
});
test('dos workers simulados excluyen la segunda invitación concurrente',async()=>{
  const model=sessionsModel(),f1=adminFixture(model),f2=adminFixture(model);let release,entered,emails=0;
  const started=new Promise(r=>entered=r);
  const first=invokeInvite(f1,async()=>{emails++;entered();await new Promise(r=>release=r);model.state.existing=true;return confirmed();});await started;
  await assert.rejects(invokeInvite(f2,async()=>{emails++;return confirmed();}),/EN_CURSO/);
  release();await first;assert.equal(emails,1);assert.equal(model.state.locks.size,0);assert.equal(model.state.closes,2);
});
test('timeout/respuesta inválida exige revisión; ausencia de Auth no prueba no envío',async()=>{
  for(const mode of ['timeout','invalid','authEncontrado']){
    const model=sessionsModel(),f=adminFixture(model);let emails=0;
    await assert.rejects(invokeInvite(f,async()=>{emails++;if(mode==='authEncontrado')model.state.existing=true;if(mode==='invalid')return {};throw Error('red');}),error=>{
      assert.equal(error.status,202);assert.equal(error.evidence,mode==='authEncontrado'?'IDENTIDAD_INVITADA_ENCONTRADA':'SIN_EVIDENCIA_CONCLUYENTE');return true;});
    await assert.rejects(invokeInvite(f,async()=>emails++),/INCIERTO_REVISAR/);
    assert.equal(emails,1);assert.equal(model.state.unlocks,1);assert.equal(model.state.closes,1);assert.equal(model.state.locks.size,0);
  }
});
test('fallo de unlock, pérdida de sesión y fallo de cierre nunca anuncian éxito',async()=>{
  for(const options of [{unlockFailure:true},{closeFailure:true},{lost:true}]){
    const model=sessionsModel(options),f=adminFixture(model);
    await assert.rejects(invokeInvite(f,async()=>{model.state.lost=!!options.lost;return confirmed();}),/INCIERTO_REVISAR/);
    assert.equal(model.state.closes,1);assert.equal(model.state.locks.size,0);
  }
});
test('factory acepta solo conexión directa dedicada; poolers y puerto transacción no abren cliente',async()=>{
  let created=0,closed=0,released=0;
  const postgres=()=>{created++;return {reserve:async()=>Object.assign(()=>{}, {release(){released++;}}),end:async()=>{closed++;}};};
  const url='postgresql://postgres:fixture@db.hgveesryfmcjxpeumzbp.supabase.co:5432/postgres';
  const factory=createDirectInvitationSession({postgres,databaseUrl:()=>({url,source:'SUPABASE_DB_URL'})});
  const session=await factory();session.release();await session.close();assert.equal(created,1);assert.equal(closed,1);assert.equal(released,1);
  for(const port of ['5432','6543']){
    const pool='postgresql://postgres.hgveesryfmcjxpeumzbp:fixture@aws-0-eu.pooler.supabase.com:'+port+'/postgres';
    await assert.rejects(createDirectInvitationSession({postgres,databaseUrl:()=>({url:pool,source:'SUPABASE_DB_URL'})})());
  }
  assert.equal(created,1);
});
test('pérdida de afinidad antes de HTTP descarta cliente y no envía',async()=>{
  const model=sessionsModel({loseBeforeHTTP:true}),f=adminFixture(model);let sends=0;
  await assert.rejects(invokeInvite(f,async()=>sends++),/SESION_POSTGRES/);
  assert.equal(sends,0);assert.equal(model.state.closes,1);assert.equal(model.state.locks.size,0);
});
test('revocación posterior al candado vuelve a comprobar el perfil antes del envío',async()=>{
  let f;const model=sessionsModel({afterLock:()=>{f.state.profile.estado=false;}});f=adminFixture(model);let sends=0;
  await assert.rejects(invokeInvite(f,async()=>sends++),/SOLO_ADMIN_PERMANENTE/);
  assert.equal(sends,0);assert.equal(model.state.unlocks,1);assert.equal(model.state.closes,1);
});
test('fallo al reservar conexión directa destruye el cliente creado',async()=>{
  let closed=0;const factory=createDirectInvitationSession({postgres:()=>({reserve:async()=>{throw Error('connect');},end:async()=>closed++}),
    databaseUrl:()=>({url:'postgresql://postgres:fixture@db.hgveesryfmcjxpeumzbp.supabase.co:5432/postgres',source:'SUPABASE_DB_URL'})});
  await assert.rejects(factory(),/CONEXION_INVITACION_NO_CONFIRMADA/);assert.equal(closed,1);
});
test('password primero y nombre después: nombre incompleto no queda listo; reintento reconcilia',async()=>{
  const f=fixture({auth:{password_configurada:false}});
  await assert.rejects(f.store.completarNombre(actor,'Ana Persona'),/CONTRASENA_NO_CONFIGURADA/);assert.equal(f.state.profile.nombre,null);
  f.state.auth.password_configurada=true;await f.store.completarNombre(actor,'Ana Persona');
  const recovered=await f.store.completarNombre(actor,'Ana Persona');assert.equal(recovered.reconciliado,true);assert.equal(f.state.updates,1);
  const sql=f.queries.find(q=>q.text.includes('password_configurada')).text;
  assert.match(sql,/coalesce\(encrypted_password,''\) <> ''\) AS password_configurada/);
  assert.ok(!Object.keys(recovered).some(k=>k.includes('password')));
});

function request(body = nameBody, options = {}) {
  return new Request('https://edge.example.test', { method: 'POST', headers: { origin, authorization: 'Bearer jwt.solo.mock', 'content-type': 'application/json', ...options.headers },
    body: JSON.stringify(body), ...options });
}
test('HTTP: cierre por defecto, CORS y método antes de Auth/SQL', async () => {
  let auths = 0;
  const handler = createInvitationHandler({ origins: [origin], authenticate: async () => { auths++; return actor; } });
  assert.equal((await handler(request())).status, 503);
  assert.equal((await handler(new Request('https://edge.test', { method: 'OPTIONS', headers: { origin } }))).status, 204);
  assert.equal((await handler(new Request('https://edge.test', { headers: { origin } }))).status, 405);
  assert.equal((await handler(request(nameBody, { headers: { origin: 'https://ajeno.test' } }))).status, 403);
  assert.equal(auths, 0);
});
test('HTTP: JWT inválido, JSON/keys/acción/tamaño inválidos no llegan a SQL', async () => {
  let writes = 0;
  const store = { completarNombre: async () => { writes++; return {}; } };
  const handler = createInvitationHandler({ enabled: true, origins: [origin], authenticate: async () => actor, store });
  const invalid = createInvitationHandler({ enabled: true, origins: [origin], authenticate: async () => null, store });
  assert.equal((await invalid(request())).status, 401);
  for (const body of [{}, { ...nameBody, usuario_id: id }, { accion: 'BORRAR' }, { ...nameBody, nombre: 'x'.repeat(3000) }]) assert.notEqual((await handler(request(body))).status, 200);
  assert.equal(writes, 0);
});
test('HTTP: resultado nombre y error transaccional incierto sin filtración', async () => {
  const f = fixture();
  const handler = createInvitationHandler({ enabled: true, origins: [origin], authenticate: async () => actor, store: f.store });
  const ok = await handler(request()); assert.equal(ok.status, 200); assert.equal((await ok.json()).aplicada, true);
  const broken = createInvitationHandler({ enabled: true, origins: [origin], authenticate: async () => actor,
    store: { completarNombre: async () => { throw Error('SECRETO_SQL_CREDENCIAL'); } } });
  const result = await broken(request()); assert.equal(result.status, 503);
  const body = await result.json(); assert.equal(body.requiere_revision, true); assert.equal(body.no_reintentar_automaticamente, true);
  assert.ok(!JSON.stringify(body).includes('SECRETO'));
});
test('HTTP: presupuesto local limitado, sin presentarlo como defensa distribuida', async () => {
  const handler = createInvitationHandler({ enabled: true, origins: [origin], authenticate: async () => actor,
    store: { completarNombre: async () => ({ estado: 'NOMBRE_CONFIRMADO' }) } });
  for (let i = 0; i < 8; i++) assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request())).status, 429);
});
test('HTTP: resultado incierto conserva ok=false y evidencia sin afirmar entrega',async()=>{
  const model=sessionsModel(),f=adminFixture(model);let sends=0;
  const handler=createInvitationHandler({enabled:true,allowInvites:true,origins:[origin],authenticate:async()=>actor,store:f.store,enviarInvitacion:async()=>{sends++;throw Error('red');}});
  const response=await handler(request(inviteBody));assert.equal(response.status,202);const result=await response.json();
  assert.equal(result.ok,false);assert.equal(result.requiere_revision,true);assert.equal(result.evidencia_auth,'SIN_EVIDENCIA_CONCLUYENTE');assert.equal(sends,1);
});
test('pantallas y recuperación conservan cierres; sin backend de eliminación ni SQL nuevo', () => {
  const entry = readFileSync('supabase/functions/usuario-invitaciones/index.ts', 'utf8');
  assert.ok(entry.includes('auth.admin.inviteUserByEmail(email, { redirectTo: destino })'));
  assert.ok(entry.includes("destinoInvitacionConfigurado(Deno.env.get('USUARIO_INVITACIONES_DESTINO'))"));
  assert.ok(entry.includes('createInvitationAuthenticator'));
  assert.ok(entry.includes('USUARIO_INVITACIONES_HABILITADA'));
  assert.ok(!/deleteUser|createInstalledSqlAdapter|createDeletionCoordinator|\.rpc\(/.test(entry));
  const sql = readFileSync('supabase/functions/usuario-invitaciones/postgres-store.mjs', 'utf8');
  assert.ok(!/CREATE|ALTER|DROP|DISABLE TRIGGER|SET ROLE|auth\.users SET/.test(sql.replaceAll('// No SET ROLE', '//')));
  assert.match(readFileSync('publicacion/registrar.html', 'utf8'), /id="invitation-save" disabled/);
  assert.match(readFileSync('publicacion/js/views/admin.js', 'utf8'), /type="submit" disabled/);
  const registrar=readFileSync('publicacion/js/registrar.js','utf8');
  assert.ok(registrar.includes('window.INVITACIONES_UI_HABILITADA !== true')&&registrar.includes('auth.updateUser({password})')&&!registrar.includes('.signUp('));
});

test('autenticación valida usuario con Auth y claims, nunca metadata ni type', async () => {
  const defaults = { sub: id, role: 'authenticated', session_id: sessionId, exp: Math.ceil(Date.now() / 1000) + 3600 };
  const build = (overrides = {}) => createInvitationAuthenticator(() => ({ auth: {
    getUser: async token => { assert.equal(token, 'solo-mock'); return { data: { user: { id, invited_at: '2026-11-12', email_confirmed_at: '2026-11-12', ...overrides.user } }, error: overrides.userError }; },
    getClaims: async token => { assert.equal(token, 'solo-mock'); return { data: { claims: { ...defaults, ...overrides.claims } }, error: overrides.claimsError }; },
  } }));
  const result = await build()('solo-mock'); assert.equal(result.id, id); assert.ok(Object.isFrozen(result));
  for (const overrides of [{ userError: {} }, { claimsError: {} }, { claims: { sub: sessionId } },
    { claims: { exp: 1 } }, { claims: { role: 'service_role' } }, { claims: { session_id: null } }]) await assert.rejects(build(overrides)('solo-mock'), /SESION_INVALIDA/);
  const metadata = await build({ user: { invited_at: null, user_metadata: { invited_at: 'inventado', permanente: true } } })('solo-mock');
  assert.equal(metadata.invitedAt, null); assert.equal(metadata.permanente, undefined);
});
test('fetch restringido: proyecto/ruta/método fijos y nunca reintenta un POST invite', async () => {
  let calls = 0;
  const transport = createRestrictedFetch(async (_request, options) => { calls++; assert.equal(options.redirect, 'error'); return new Response('{}'); });
  await transport(PROJECT_URL + '/auth/v1/user');
  for (const url of ['https://ajeno.test/auth/v1/user', PROJECT_URL + '/rest/v1/usuarios', PROJECT_URL + '/auth/v1/admin/users']) await assert.rejects(transport(url), /DESTINO_NO_PERMITIDO/);
  await transport(PROJECT_URL + '/auth/v1/invite', { method: 'POST' });
  await assert.rejects(transport(PROJECT_URL + '/auth/v1/invite', { method: 'POST' }), /NO_REINTENTAR/);
  assert.equal(calls, 2);
  let attempts = 0;
  const uncertain = createRestrictedFetch(async () => { attempts++; throw Error('red'); });
  await assert.rejects(uncertain(PROJECT_URL + '/auth/v1/invite', { method: 'POST' }));
  await assert.rejects(uncertain(PROJECT_URL + '/auth/v1/invite', { method: 'POST' }), /NO_REINTENTAR/);
  assert.equal(attempts, 1);
});

// INV-07: scripts operativos en VM, sin página/harness nuevo ni conexión externa.
function adminBrowser(options={}) {
  const nodes=new Map(), storage=options.storage||new Map(), calls=[], queryCalls=[], timers=new Map();let timerSeq=0;const prefix=options.root?'':'publicacion/';const confirmados=new Set();let allowed=options.allowed!==false;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,classList:{add(){},remove(){},toggle(){}},setAttribute(){},querySelector(){return null;}});return nodes.get(id);};
  const auth={getSession:async()=>({data:{session:{user:{id},access_token:'token-solo-mock'}},error:null}),getUser:async()=>({data:{user:{id:options.wrongActor?sessionId:id}},error:null})};
  const window={supabaseClient:{auth,functions:{invoke:async(name,request)=>{if(request.body.accion==='CONSULTAR_INVITACION'){
        queryCalls.push({name,request});return options.inspect?options.inspect(name,request):{data:{ok:true,envio_habilitado:true,email:request.body.email,
          estado:confirmados.has(request.body.email)?'INVITACION_PENDIENTE':'CORREO_NUEVO',identidad_id:confirmados.has(request.body.email)?sessionId:null,
          reenvio_permitido:false,espera_segundos:confirmados.has(request.body.email)?60:0},error:null};
      }
      calls.push({name,request});const result=options.invoke?await options.invoke(name,request):{data:{ok:true,estado:'INVITACION_CONFIRMADA',identidad_id:sessionId},error:null};
      if(result.data?.ok===true)confirmados.add(request.body.email);return result;}}},
    UsuariosService:{getMiEstadoAdministrativo:async()=>({es_admin_permanente:options.permanent!==false}),getUsuarios:async()=>options.users||[]}};
  const context=vm.createContext({window,document:{getElementById:node},state:{currentUser:{id}},adminAccesoVigente:()=>allowed,
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    crypto:{randomUUID:()=>sessionId},URL,setTimeout:fn=>{const key=++timerSeq;timers.set(key,fn);return key;},clearTimeout:key=>timers.delete(key)});
  const config=readFileSync(prefix+'js/config/supabaseClient.js','utf8');vm.runInContext(config.slice(config.indexOf('// Destino público documentado;')),context);
  window.INVITACIONES_UI_HABILITADA=!!options.enabled;
  const admin=readFileSync(prefix+'js/views/admin.js','utf8');vm.runInContext(admin.slice(admin.indexOf('let adminInvitacionEnCurso'),admin.indexOf('function getAdminPanelHTML')),context);
  return {context,window,node,storage,calls,queryCalls,timers,async runTimer(){const [key,fn]=timers.entries().next().value||[];if(fn){timers.delete(key);await fn();}},setAllowed:v=>allowed=v};
}
const submitEvent={preventDefault(){}};
test('UI Admin: compuerta cerrada/no permanente impiden invocaciones incluso por submit manual',async()=>{
  for(const options of [{},{enabled:true,allowed:false},{enabled:true,permanent:false}]){
    const r=adminBrowser(options);r.node('admin-invitacion-email').value='persona@example.test';await r.context.adminEnviarInvitacion(submitEvent);assert.equal(r.calls.length,0);
  }
});
test('UI Admin: envío explícito único, solo email, UUID conservado y bloqueo doble clic',async()=>{
  let resolve,entered;const started=new Promise(r=>entered=r);
  const r=adminBrowser({enabled:true,invoke:async()=>{entered();return new Promise(r=>resolve=r);}});
  r.node('admin-invitacion-email').value='persona@example.test';
  r.context.adminActualizarInvitacion();assert.equal(r.node('admin-invitacion-enviar').disabled,true,'Esperar comprobación del servidor');
  const first=r.context.adminEnviarInvitacion(submitEvent);await started;
  const saved=JSON.parse([...r.storage.values()][0]);assert.equal(saved.estado,'ENVIANDO');assert.equal(saved.solicitudId,sessionId);
  await r.context.adminEnviarInvitacion(submitEvent);assert.equal(r.calls.length,1);
  assert.deepEqual(Object.keys(r.calls[0].request.body).sort(),['accion','email']);assert.equal(r.calls[0].request.headers.Authorization,'Bearer token-solo-mock');
  resolve({data:{ok:true,estado:'INVITACION_CONFIRMADA',identidad_id:sessionId},error:null});await first;
  assert.match(r.node('admin-invitacion-estado').textContent,/Supabase confirmó/);
  await r.context.adminEnviarInvitacion(submitEvent);assert.equal(r.calls.length,1);
  assert.ok([...r.storage.values()].every(v=>!v.includes('token-solo-mock')));
});
test('UI Admin: HTTP202/incierto se conserva tras recarga y nunca reenvía',async()=>{
  const r=adminBrowser({enabled:true,invoke:async()=>({data:{ok:false,error:'INVITACION_RESULTADO_INCIERTO_REVISAR',requiere_revision:true},error:null})});
  r.node('admin-invitacion-email').value='persona@example.test';await r.context.adminEnviarInvitacion(submitEvent);
  assert.equal(JSON.parse([...r.storage.values()][0]).estado,'INCIERTO');
  await r.context.adminEnviarInvitacion(submitEvent);assert.equal(r.calls.length,1);
  const reload=adminBrowser({enabled:true,storage:r.storage});reload.context.adminActualizarInvitacion();
  await reload.context.adminEnviarInvitacion(submitEvent);await reload.context.adminRevisarInvitacion();
  assert.equal(reload.calls.length,0);assert.equal(reload.node('admin-invitacion-email').value,'persona@example.test');assert.match(reload.node('admin-invitacion-estado').textContent,/revisión/);
});
test('UI Admin: backend cerrado o conexión incompatible muestra bloqueo sin éxito',async()=>{
  for(const code of ['INVITACIONES_DESHABILITADAS','CONEXION_INVITACION_SIN_AFINIDAD','ENVIO_INVITACION_DESHABILITADO']){
    const r=adminBrowser({enabled:true,invoke:async()=>({data:{ok:false,error:code},error:null})});r.node('admin-invitacion-email').value='persona@example.test';await r.context.adminEnviarInvitacion(submitEvent);
    assert.equal(JSON.parse([...r.storage.values()][0]).estado,'RECHAZADA');assert.ok(!r.node('admin-invitacion-estado').textContent.includes('Supabase confirmó'));
  }
});
test('cliente rechaza respuesta malformada y nunca publica errores internos o cambia identidad',async()=>{
  const r=adminBrowser({enabled:true,invoke:async()=>({data:{ok:true,estado:'OTRO'},error:null})});
  await assert.rejects(r.window.invocarUsuarioInvitaciones({accion:'INVITAR',email:'persona@example.test'},id),e=>e.incierto===true);
  const other=adminBrowser({enabled:true,wrongActor:true});await assert.rejects(other.window.invocarUsuarioInvitaciones({accion:'INVITAR',email:'persona@example.test'},id));assert.equal(other.calls.length,0);
});
test('aprobación existente rechaza nombre vacío antes de enviar RPC, sin modificar su implementación',async()=>{
  let rpcs=0;const c={window:{supabaseClient:{rpc:async()=>rpcs++}},console:{error(){}}};vm.createContext(c);
  vm.runInContext(readFileSync('publicacion/js/services/usuarios.service.js','utf8'),c);
  c.window.UsuariosService.getUsuario=async()=>({id,nombre:null,estado:true,rol_id:null});
  await assert.rejects(c.window.UsuariosService.aprobarUsuario(id,{rol_id:sessionId}),e=>e.codigo==='SOLICITUD_SIN_NOMBRE');assert.equal(rpcs,0);
});
test('presentación separa registro incompleto y espera administrativa sin reenvío innecesario',()=>{
  const c={window:{}};vm.createContext(c);vm.runInContext(readFileSync('publicacion/js/views/pendingAccount.js','utf8'),c);
  const pending=c.window.PendingAccountView.render('persona@example.test',{correoVerificado:true,esInvitacion:true,registroIncompleto:true});
  assert.match(pending,/Registro incompleto/);assert.match(pending,/Continuar mi registro/);assert.ok(!pending.includes('data-reenvio-signup'));
  const done=c.window.PendingAccountView.render('persona@example.test',{correoVerificado:true,esInvitacion:true,registroIncompleto:false});assert.match(done,/Cuenta pendiente de aprobación/);assert.ok(!done.includes('Continuar mi registro'));
});

// INV-10: diagnóstico excepcional independiente de las dos compuertas de escritura.
const diagnosticBody={accion:'DIAGNOSTICO_CONEXION'};
function diagnosticHandler(f,options={}) {
  return createInvitationHandler({enabled:false,allowInvites:false,diagnosticEnabled:true,origins:[origin],
    authenticate:async()=>actor,store:f.store,enviarInvitacion:async()=>{throw Error('NUNCA_ENVIAR');},...options});
}
test('diagnóstico con gates generales cerrados verifica dos sesiones/locks/cierre sin datos ni escrituras',async()=>{
  const model=sessionsModel(),f=adminFixture(model);const handler=diagnosticHandler(f);
  const response=await handler(request(diagnosticBody));assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.estado,'DIAGNOSTICO_CONEXION_OK');assert.equal(result.ok,true);
  assert.ok(Object.values(result.comprobaciones).every(v=>v===true));
  assert.equal(model.state.sessions,3);assert.equal(model.state.closes,3);assert.equal(model.state.pids.size,0);assert.equal(model.state.locks.size,0);
  assert.equal(f.state.updates,0);assert.ok(model.state.queries.every(q=>/^(SELECT|SET statement_timeout)/.test(q.text)));
  const locking=model.state.queries.filter(q=>q.text.includes('pg_try_advisory_lock'));
  assert.equal(locking.length,3);assert.ok(locking.every(q=>q.values[0]===DIAGNOSTIC_LOCK_NAMESPACE));
  assert.notEqual(DIAGNOSTIC_LOCK_NAMESPACE,INVITE_LOCK_NAMESPACE);assert.notEqual(DIAGNOSTIC_LOCK_NAMESPACE,209);
  const json=JSON.stringify(result);for(const secret of ['usuario_id','sessionId','password','postgresql://','token-solo',id,'persona@'])assert.ok(!json.includes(secret));
  assert.ok(!Object.keys(result.comprobaciones).includes('pid'));assert.equal(model.state.unlocks,2);
});
test('diagnóstico cerrado por defecto y gate diagnóstico nunca habilita INVITAR ni nombre',async()=>{
  let calls=0;const f={store:{exigirPermanente:async()=>calls++,diagnosticarConexion:async()=>calls++}};
  const closed=diagnosticHandler(f,{diagnosticEnabled:false});const rejected=await closed(request(diagnosticBody));
  assert.equal(rejected.status,503);assert.equal((await rejected.json()).error,'DIAGNOSTICO_DESHABILITADO');assert.equal(calls,0);
  const diagOnly=diagnosticHandler(f,{allowInvites:true});
  for(const body of [inviteBody,nameBody])assert.equal((await diagOnly(request(body))).status,503);assert.equal(calls,0);
  const normalOnly=diagnosticHandler(f,{enabled:true,diagnosticEnabled:false});assert.equal((await normalOnly(request(diagnosticBody))).status,503);assert.equal(calls,0);
});

test('INV-11: Origin ajeno y acción desconocida no eluden gates ni alcanzan Auth/SQL',async()=>{
  let authCalls=0,sqlCalls=0;
  const handler=diagnosticHandler({store:{exigirPermanente:async()=>sqlCalls++,diagnosticarConexion:async()=>sqlCalls++}},
    {authenticate:async()=>{authCalls++;return actor;}});
  const foreign=request(diagnosticBody);foreign.headers.set('origin','https://ajeno.example');
  assert.equal((await handler(foreign)).status,403);
  for(const accion of ['OTRA','DIAGNOSTICO_CONEXION ','INVITAR','COMPLETAR_NOMBRE']){
    const response=await handler(request({accion}));assert.equal(response.status,503);
    assert.equal((await response.json()).error,'INVITACIONES_DESHABILITADAS');
  }
  assert.equal(authCalls,0);assert.equal(sqlCalls,0);
});
test('diagnóstico exige JWT válido y permanente, no permite actor/clave suministrados',async()=>{
  const model=sessionsModel();
  for(const options of [{profile:{rol_id:null}},{profile:{rol_id:id},role:'tecnico'},{profile:{rol_id:id},role:'recepcion'},{profile:{rol_id:id,estado:false}}]){
    const f=fixture({...options,invitationSession:model.open});const response=await diagnosticHandler(f)(request(diagnosticBody));assert.equal(response.status,403);
  }
  const f=adminFixture(model);assert.equal((await diagnosticHandler(f,{authenticate:async()=>null})(request(diagnosticBody))).status,401);
  for(const extra of [{usuario_id:id},{key:1},{email:'persona@example.test'}])assert.equal((await diagnosticHandler(f)(request({...diagnosticBody,...extra}))).status,400);
  assert.equal(model.state.sessions,0);
});
test('diagnóstico deniega cambios de permiso, contexto/pid incompatible y fallos de cleanup, sin éxito falso',async()=>{
  for(const options of [{permanent:false},{samePid:true},{badRole:true},{loseBeforeHTTP:true},{unlockFailure:true},{closeFailure:true},{closeNotConfirmed:true}]){
    const model=sessionsModel(options),f=adminFixture(model);const response=await diagnosticHandler(f)(request(diagnosticBody));
    assert.notEqual(response.status,200);const result=await response.json();assert.equal(result.ok,false);assert.equal(result.estado,'DIAGNOSTICO_CONEXION_FALLIDO');
    assert.equal(model.state.pids.size,0);assert.equal(model.state.locks.size,0);assert.equal(model.state.closes,model.state.sessions);assert.equal(f.state.updates,0);
  }
});
test('diagnóstico limpia A si falla abrir B y permite nueva ejecución después del error',async()=>{
  const model=sessionsModel();let opens=0;
  const f=fixture({profile:{rol_id:id},invitationSession:async()=>{opens++;if(opens===2)throw Error('URL_PRIVADA_PASSWORD_NO_EXPONER');return model.open();}});
  const handler=diagnosticHandler(f);let response=await handler(request(diagnosticBody));assert.equal(response.status,503);
  assert.ok(!(await response.text()).includes('URL_PRIVADA'));assert.equal(model.state.closes,1);
  response=await handler(request(diagnosticBody));assert.equal(response.status,200);assert.equal(model.state.pids.size,0);
});
test('diagnóstico incompatible con pooler no crea conexión física ni cambia permisos',async()=>{
  let connections=0;const open=createDirectInvitationSession({postgres:()=>{connections++;throw Error('NO_CONECTAR');},
    databaseUrl:()=>({url:'postgresql://postgres.hgveesryfmcjxpeumzbp:fixture@aws-0-eu.pooler.supabase.com:5432/postgres',source:'SUPABASE_DB_URL'})});
  const f=fixture({profile:{rol_id:id},invitationSession:open});const response=await diagnosticHandler(f)(request(diagnosticBody));
  assert.equal(response.status,503);assert.equal((await response.json()).error,'CONEXION_INVITACION_SIN_AFINIDAD');assert.equal(connections,0);assert.equal(f.state.updates,0);
});
test('dos diagnósticos simultáneos del mismo worker no dejan sesiones adicionales',async()=>{
  const model=sessionsModel();let release,entered,first=true;const started=new Promise(r=>entered=r);
  const f=fixture({profile:{rol_id:id},invitationSession:async()=>{if(first){first=false;entered();await new Promise(r=>release=r);}return model.open();}});
  const a=f.store.diagnosticarConexion(actor);await started;
  await assert.rejects(f.store.diagnosticarConexion(actor),/DIAGNOSTICO_EN_CURSO/);release();await a;assert.equal(model.state.sessions,3);assert.equal(model.state.pids.size,0);
});
test('diagnóstico no llama Auth admin ni ruta de nombre y configuración tiene gate dedicado',()=>{
  const index=readFileSync('supabase/functions/usuario-invitaciones/index.ts','utf8');assert.ok(index.includes("diagnosticEnabled: Deno.env.get('USUARIO_INVITACIONES_DIAGNOSTICO_HABILITADO') === 'true'"));
  const store=readFileSync('supabase/functions/usuario-invitaciones/postgres-store.mjs','utf8');
  const method=store.slice(store.indexOf('async diagnosticarConexion'),store.indexOf('async exigirPermanente'));
  assert.ok(!/\b(INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)\b/.test(method));
  assert.ok(!/enviarInvitacion|inviteUserByEmail|completarNombre|pg_terminate_backend/.test(method));
});

// INV-14: destinos exactos elegidos exclusivamente por configuración servidor.
test('destino servidor conserva Vercel por defecto y acepta solo dos URLs exactas',()=>{
  assert.equal(destinoInvitacionConfigurado(undefined),DESTINO_INVITACION);
  for(const url of [DESTINO_INVITACION,DESTINO_INVITACION_LOCAL])assert.equal(destinoInvitacionConfigurado(url),url);
  for(const url of ['',null,'http://localhost:5500/registrar.html','http://127.0.0.1:5500/publicacion/registrar.html',
    'https://ajeno.example/registrar.html',DESTINO_INVITACION_LOCAL+'?next=otro',DESTINO_INVITACION_LOCAL+'#token',
    ' '+DESTINO_INVITACION,DESTINO_INVITACION+'/'])assert.throws(()=>destinoInvitacionConfigurado(url),/DESTINO_INVITACION_NO_PERMITIDO/);
});
test('INVITAR no admite redirectTo ni destino desde navegador',async()=>{
  const f=adminFixture(sessionsModel());let sends=0;
  const handler=createInvitationHandler({enabled:true,allowInvites:true,origins:[origin],authenticate:async()=>actor,
    store:f.store,enviarInvitacion:async()=>{sends++;}});
  for(const extra of [{redirectTo:DESTINO_INVITACION_LOCAL},{destino:DESTINO_INVITACION_LOCAL}]){
    const response=await handler(request({...inviteBody,...extra}));assert.equal(response.status,400);
  }
  assert.equal(sends,0);
});
test('adaptador Auth selecciona destino servidor y no cambia el destino de producción',()=>{
  const index=readFileSync('supabase/functions/usuario-invitaciones/index.ts','utf8');
  assert.ok(index.includes("destinoInvitacionConfigurado(Deno.env.get('USUARIO_INVITACIONES_DESTINO'))"));
  assert.ok(index.includes('inviteUserByEmail(email, { redirectTo: destino })'));
  assert.ok(index.includes("if (redirectTo !== DESTINO_INVITACION)"));
});

// INV-15: configuración local y conservación de la isla DOM durante refrescos.
test('UI disponible solo en orígenes local y producción exactos, en ambas configuraciones',()=>{
  for(const path of ['js/config/supabaseClient.js','publicacion/js/config/supabaseClient.js']){
    const source=readFileSync(path,'utf8');const tail=source.slice(source.indexOf('// Destino público documentado;'));
    for(const origin of ['http://127.0.0.1:5500','https://pruebaelalmendro.vercel.app','http://localhost:5500','http://127.0.0.1:5501','https://ajeno.example']){
      const c={window:{location:{origin}},sessionStorage:{getItem:()=>null},Date,Set,clearTimeout(){},setTimeout(){}};
      vm.runInNewContext(tail,c);assert.equal(c.window.INVITACIONES_UI_HABILITADA,['http://127.0.0.1:5500','https://pruebaelalmendro.vercel.app'].includes(origin));
      assert.equal(c.window.REGISTRO_PUBLICO_UI_HABILITADO,false);
    }
  }
});
test('refresco mantiene mismo formulario conectado, abierto, correo/foco/mensaje y otros detalles',()=>{
  let focused;
  class Element {
    constructor(id,tag='div'){this.id=id;this.tag=tag;this.childNodes=[];this.parentNode=null;this.open=false;}
    get firstElementChild(){return this.childNodes[0]||null;}
    get nextSibling(){return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)+1]||null;}
    insertBefore(node,anchor){if(node.parentNode)node.remove();const i=anchor?this.childNodes.indexOf(anchor):this.childNodes.length;assert.ok(i>=0);this.childNodes.splice(i,0,node);node.parentNode=this;}
    remove(){if(this===focused||this.childNodes.includes(focused))throw Error('FOCO_DESCONECTADO');const p=this.parentNode;if(p)p.childNodes.splice(p.childNodes.indexOf(this),1);this.parentNode=null;}
    querySelectorAll(selector){const out=[];for(const n of this.childNodes){if(selector==='details'&&n.tag==='details'||selector==='#'+n.id)out.push(n);out.push(...n.querySelectorAll(selector));}return out;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  }
  const add=(p,n)=>{p.insertBefore(n,null);return n;};
  const container=new Element('container'),root=add(container,new Element('root'));
  add(root,new Element('old-header'));const island=add(root,new Element('admin-invitacion-panel','details'));
  island.open=true;const input=add(island,new Element('admin-invitacion-email'));input.value='nuevo@example.test';input.selectionStart=3;focused=input;
  const message=add(island,new Element('message'));message.textContent='Último intento rechazado';
  const other=add(root,new Element('other','details'));other.open=true;
  const source=readFileSync('publicacion/js/views/admin.js','utf8');
  const helper=source.slice(source.indexOf('function adminRenderizarPanelConInvitacion'),source.indexOf('let adminInvitacionEnCurso'));
  let generation=0;
  const c={document:{createElement(){const buffer=new Element('buffer');Object.defineProperty(buffer,'innerHTML',{set(){
    const fresh=add(buffer,new Element('fresh-root'));add(fresh,new Element('new-header-'+(++generation)));
    add(fresh,new Element('admin-invitacion-panel','details'));add(fresh,new Element('other','details'));
  }});return buffer;}}};vm.createContext(c);vm.runInContext(helper,c);
  for(let i=0;i<3;i++)c.adminRenderizarPanelConInvitacion(container,'html-simulado');
  assert.equal(container.querySelector('#admin-invitacion-panel'),island);assert.equal(island.parentNode,root);
  assert.equal(island.open,true);assert.equal(input.value,'nuevo@example.test');assert.equal(input.selectionStart,3);assert.equal(focused,input);
  assert.equal(message.textContent,'Último intento rechazado');assert.equal(container.querySelector('#other').open,true);
  assert.equal(root.childNodes.length,3);assert.ok(root.firstElementChild.id.startsWith('new-header-'));
  assert.equal(source.split('adminRenderizarPanelConInvitacion(container, getAdminPanelHTML').length-1,3);
});
test('último rechazo servidor no se confunde con un sondeo actual de configuración',async()=>{
  let attempts=0;const r=adminBrowser({enabled:true,invoke:async()=>{attempts++;return attempts===1?
    {data:{ok:false,error:'INVITACIONES_DESHABILITADAS'},error:null}:{data:{ok:true,estado:'INVITACION_CONFIRMADA',identidad_id:sessionId},error:null};}});
  r.node('admin-invitacion-email').value='persona@example.test';await r.context.adminEnviarInvitacion(submitEvent);
  assert.match(r.node('admin-invitacion-estado').textContent,/rechazó este intento/);assert.equal(r.calls.length,1);
  assert.equal(r.node('admin-invitacion-email').value,'persona@example.test');
  await r.context.adminEnviarInvitacion(submitEvent);assert.equal(r.calls.length,2);
  assert.match(r.node('admin-invitacion-estado').textContent,/Supabase confirmó/);
});

test('INV-17: pendiente conserva dos SVG legibles, temas, textos y cuenta escapada en ambas copias',()=>{
  for(const prefix of ['', 'publicacion/']){
    const source=readFileSync(prefix+'js/views/pendingAccount.js','utf8');const c={window:{}};vm.createContext(c);vm.runInContext(source,c);
    const html=c.window.PendingAccountView.render('<persona@example.test>',{correoVerificado:true});
    assert.equal((html.match(/<svg /g)||[]).length,2);assert.doesNotMatch(html,/⏳|🏢|🌳/);
    assert.match(html,/data-pending-brand-icon[^>]*text-white/);
    assert.match(html,/data-pending-wait-icon[^>]*text-amber-700[^>]*dark:text-amber-300/);
    assert.equal((html.match(/width="28" height="28"/g)||[]).length,2);
    assert.equal((html.match(/aria-hidden="true" focusable="false"/g)||[]).length,2);
    assert.match(html,/<rect x="4"/);assert.match(html,/<circle cx="12" cy="12" r="9"/);
    assert.match(html,/Cuenta pendiente de aprobación/);assert.match(html,/Cerrar sesión/);assert.match(html,/&lt;persona@example.test&gt;/);
    assert.match(html,/w-full/);assert.match(html,/max-w-lg/);assert.match(html,/p-6 sm:p-8/);
    const css=readFileSync(prefix+'css/tailwind.css','utf8');
    for(const selector of ['.text-white{','.text-amber-700{','.dark'+String.fromCharCode(92)+':text-amber-300'])assert.ok(css.includes(selector));
  }
});

// INV-18: estado servidor y reenvío explícito nativo, sin tablas ni correos reales.
function pendienteServidor(overrides={}) {
  return {auth:[{id:sessionId,invited_at:new Date(Date.now()-120000),confirmation_sent_at:new Date(Date.now()-120000),
    email_confirmed_at:null,password_configurada:false,...overrides.auth}],
    profiles:[{id:sessionId,nombre:null,estado:true,rol_id:null,trabajador_id:null,...overrides.profile}]};
}
test('INV-18: seis estados administrativos sin utilizar metadata ni recibos del navegador',()=>{
  const e=inviteBody.email,b=pendienteServidor();
  assert.equal(estadoInvitacion([],[],e).estado,'CORREO_NUEVO');
  const p=estadoInvitacion(b.auth,b.profiles,e);assert.equal(p.estado,'INVITACION_PENDIENTE');assert.equal(p.reenvio_permitido,true);
  for(const c of [pendienteServidor({auth:{email_confirmed_at:new Date()}}),
    pendienteServidor({auth:{email_confirmed_at:new Date(),password_configurada:true}})])assert.equal(estadoInvitacion(c.auth,c.profiles,e).estado,'REGISTRO_INCOMPLETO');
  const full=pendienteServidor({auth:{email_confirmed_at:new Date(),password_configurada:true},profile:{nombre:'Persona'}});
  assert.equal(estadoInvitacion(full.auth,full.profiles,e).estado,'PENDIENTE_APROBACION');
  full.profiles[0].rol_id=id;assert.equal(estadoInvitacion(full.auth,full.profiles,e).estado,'CUENTA_APROBADA');
  assert.equal(estadoInvitacion([],b.profiles,e).estado,'REQUIERE_REVISION');
  assert.equal(estadoInvitacion(b.auth,[...b.profiles,...b.profiles],e).estado,'REQUIERE_REVISION');
});
test('INV-18: espera servidor60s, ficha/rol/cuenta bloqueada o identidad incompatible no permiten reenviar',()=>{
  const recent=pendienteServidor({auth:{confirmation_sent_at:new Date()}});
  const r=estadoInvitacion(recent.auth,recent.profiles,inviteBody.email);assert.ok(r.espera_segundos>=59);assert.equal(r.reenvio_permitido,false);
  for(const c of [pendienteServidor({profile:{estado:false}}),pendienteServidor({profile:{trabajador_id:id}}),
    pendienteServidor({auth:{invited_at:null}}),pendienteServidor({auth:{password_configurada:true}}),
    pendienteServidor({auth:{confirmation_sent_at:'fecha inválida'}}),pendienteServidor({profile:{id}})]){
    const state=estadoInvitacion(c.auth,c.profiles,inviteBody.email);assert.equal(state.reenvio_permitido,false);assert.equal(state.estado,'REQUIERE_REVISION');
  }
});
test('INV-18: consulta autorizada no llama Auth ni escribe; reenvío mantiene identidad y lock',async()=>{
  const b=pendienteServidor(),model=sessionsModel({authRows:b.auth,profileRows:b.profiles}),f=adminFixture(model);let sends=0;
  const send=async(email,url)=>{sends++;assert.equal(email,inviteBody.email);assert.equal(url,DESTINO_INVITACION);assert.equal(model.state.locks.size,1);
    return {data:{user:{id:sessionId,email,invited_at:new Date()}}};};
  const state=await ejecutarInvitacion({body:{accion:'CONSULTAR_INVITACION',email:inviteBody.email},actor,store:f.store,enviarInvitacion:send});
  assert.equal(state.reenvio_permitido,true);assert.equal(sends,0);
  const r=await ejecutarInvitacion({body:{accion:'REENVIAR_INVITACION',email:inviteBody.email,identidad_id:sessionId},actor,store:f.store,allowInvites:true,enviarInvitacion:send});
  assert.equal(r.identidad_id,sessionId);assert.equal(sends,1);assert.equal(model.state.locks.size,0);assert.equal(f.state.updates,0);
  assert.equal(model.state.sessions,model.state.closes);
});
test('INV-18: reenvío rechaza UUID antiguo y estados confirmados o recientes sin enviar',async()=>{
  for(const b of [pendienteServidor({auth:{email_confirmed_at:new Date()}}),pendienteServidor({profile:{rol_id:id}}),
    pendienteServidor({auth:{confirmation_sent_at:new Date()}}),pendienteServidor({profile:{trabajador_id:id}})]){
    const model=sessionsModel({authRows:b.auth,profileRows:b.profiles}),f=adminFixture(model);let sends=0;
    await assert.rejects(ejecutarInvitacion({body:{accion:'REENVIAR_INVITACION',email:inviteBody.email,identidad_id:sessionId},actor,store:f.store,allowInvites:true,enviarInvitacion:async()=>sends++}),/REENVIO_NO_AUTORIZADO/);
    assert.equal(sends,0);assert.equal(model.state.locks.size,0);
  }
  const b=pendienteServidor(),f=adminFixture(sessionsModel({authRows:b.auth,profileRows:b.profiles}));
  await assert.rejects(ejecutarInvitacion({body:{accion:'REENVIAR_INVITACION',email:inviteBody.email,identidad_id:id},actor,store:f.store,allowInvites:true}),/REENVIO_NO_AUTORIZADO/);
});
test('INV-18: dos reenvíos simultáneos comparten candado, sin repetir Auth tras incertidumbre',async()=>{
  const b=pendienteServidor(),model=sessionsModel({authRows:b.auth,profileRows:b.profiles}),f=adminFixture(model),g=adminFixture(model);
  let resolve,entered,sends=0;const started=new Promise(r=>entered=r);
  const body={accion:'REENVIAR_INVITACION',email:inviteBody.email,identidad_id:sessionId};
  const send=async()=>{sends++;entered();await new Promise(r=>resolve=r);throw Error('red incierta');};
  const a=ejecutarInvitacion({body,actor,store:f.store,allowInvites:true,enviarInvitacion:send});await started;
  await assert.rejects(ejecutarInvitacion({body,actor,store:g.store,allowInvites:true,enviarInvitacion:send}),/INVITACION_EN_CURSO/);
  resolve();await assert.rejects(a,/RESULTADO_INCIERTO/);
  await assert.rejects(ejecutarInvitacion({body,actor,store:f.store,allowInvites:true,enviarInvitacion:send}),/RESULTADO_INCIERTO/);
  assert.equal(sends,1);assert.equal(model.state.locks.size,0);
});
test('INV-18: reenvío no autoriza Técnico/Recepción/temporal ni gates cerrados',async()=>{
  for(const role of ['tecnico','recepcion']){
    const f=fixture({profile:{rol_id:id},role});
    for(const accion of ['CONSULTAR_INVITACION','REENVIAR_INVITACION'])await assert.rejects(ejecutarInvitacion({body:{accion,email:inviteBody.email,...(accion==='REENVIAR_INVITACION'?{identidad_id:sessionId}:{})},actor,store:f.store,allowInvites:true}),/SOLO_ADMIN_PERMANENTE/);
  }
  const f=adminFixture(sessionsModel());
  await assert.rejects(ejecutarInvitacion({body:{accion:'REENVIAR_INVITACION',email:inviteBody.email,identidad_id:sessionId},actor,store:f.store}),/ENVIO_INVITACION_DESHABILITADO/);
  const handler=createInvitationHandler({enabled:false,origins:[origin],authenticate:async()=>actor,store:f.store});
  assert.equal((await handler(request({accion:'CONSULTAR_INVITACION',email:inviteBody.email}))).status,503);
});
test('INV-18: UI revisa antes del reenvío y solo envía una vez para el mismo correo/UUID',async()=>{
  const r=adminBrowser({enabled:true,inspect:async(_name,req)=>({data:{ok:true,envio_habilitado:true,estado:'INVITACION_PENDIENTE',email:req.body.email,
    identidad_id:sessionId,espera_segundos:0,reenvio_permitido:true},error:null})});
  r.node('admin-invitacion-email').value='persona@example.test';await r.context.adminEnviarInvitacion(submitEvent);
  assert.equal(r.calls.length,0,'Primera acción solo descubre estado, no reenvía a ciegas');
  assert.equal(r.node('admin-invitacion-enviar').textContent,'Reenviar invitación');
  await r.context.adminEnviarInvitacion(submitEvent);assert.equal(r.calls.length,1);
  assert.equal(r.calls[0].request.body.accion,'REENVIAR_INVITACION');assert.equal(r.calls[0].request.body.identidad_id,sessionId);
  assert.match(r.node('admin-invitacion-enviar').textContent,/01:00/);
});
test('INV-18: recibo confirmado antiguo no bloquea correo eliminado vuelto a usar, ni se reutiliza para otro correo',async()=>{
  const storage=new Map([['hotel.invitar.'+id,JSON.stringify({version:1,actor:id,email:'persona@example.test',solicitudId:id,estado:'CONFIRMADA',identidadId:id})]]);
  const r=adminBrowser({enabled:true,storage});r.node('admin-invitacion-email').value='persona@example.test';
  await r.context.adminEnviarInvitacion(submitEvent);assert.equal(r.calls.length,1);assert.equal(r.calls[0].request.body.accion,'INVITAR');
  r.node('admin-invitacion-email').value='otra@example.test';r.context.adminActualizarInvitacion();
  assert.equal(r.node('admin-invitacion-enviar').textContent,'Enviar invitación');
  await r.context.adminEnviarInvitacion(submitEvent);assert.equal(r.calls.length,2);assert.equal(r.calls[1].request.body.email,'otra@example.test');
  assert.equal(r.queryCalls.length,2);
});
test('INV-18: registro incompleto, pendiente y aprobado solo ofrecen revisión/recuperación, sin correo',async()=>{
  for(const estado of ['REGISTRO_INCOMPLETO','PENDIENTE_APROBACION','CUENTA_APROBADA','REQUIERE_REVISION']){
    const r=adminBrowser({enabled:true,inspect:async(_n,req)=>({data:{ok:true,envio_habilitado:true,estado,email:req.body.email,identidad_id:sessionId,
      espera_segundos:0,reenvio_permitido:false},error:null})});
    r.node('admin-invitacion-email').value='persona@example.test';await r.context.adminEnviarInvitacion(submitEvent);
    assert.equal(r.calls.length,0);assert.equal(r.node('admin-invitacion-enviar').disabled,true);
    await r.context.adminEnviarInvitacion(submitEvent);assert.equal(r.calls.length,0);
  }
});
test('INV-18: correo invitado readonly con indicador, sin confiar en correo editado ni metadata',()=>{
  for(const prefix of ['', 'publicacion/']){
    const html=readFileSync(prefix+'registrar.html','utf8');assert.match(html,/id="invitation-email" readonly aria-readonly="true"/);
    assert.match(html,/Correo verificado de tu invitación · No editable/);assert.match(html,/cursor-not-allowed/);
    const script=readFileSync(prefix+'js/registrar.js','utf8');assert.ok(script.includes('value = user.email'));assert.ok(!script.includes("updateUser({email"));
  }
});

test('INV-18: UUID diferente en respuesta Auth nunca confirma el reenvío',async()=>{
  const b=pendienteServidor(),model=sessionsModel({authRows:b.auth,profileRows:b.profiles}),f=adminFixture(model);
  await assert.rejects(ejecutarInvitacion({body:{accion:'REENVIAR_INVITACION',email:inviteBody.email,identidad_id:sessionId},
    actor,store:f.store,allowInvites:true,enviarInvitacion:confirmed}),/INVITACION_RESULTADO_INCIERTO_REVISAR/);
  assert.equal(model.state.locks.size,0);assert.equal(model.state.sessions,model.state.closes);
});
test('INV-18: reenvío se protege también por Origin y JWT, cuerpo extra y cooldown no se eluden',async()=>{
  const model=sessionsModel(),f=adminFixture(model),body={accion:'REENVIAR_INVITACION',email:inviteBody.email,identidad_id:sessionId};
  const handler=createInvitationHandler({enabled:true,allowInvites:true,origins:[origin],authenticate:async()=>null,store:f.store});
  assert.equal((await handler(request(body))).status,401);
  const foreign=request(body);foreign.headers.set('origin','https://ajeno.example');assert.equal((await handler(foreign)).status,403);
  assert.equal(model.state.sessions,0);
  const good=createInvitationHandler({enabled:true,allowInvites:true,origins:[origin],authenticate:async()=>actor,store:f.store});
  assert.equal((await good(request({...body,espera_segundos:0}))).status,400);
});

function adminModalFixture(prefix='',allowed=true,manualEnabled=false,uiOrigin='http://127.0.0.1:5500'){
  const elements=new Map(),storage=new Map();let focused,opened=0;
  const node=id=>{
    const attrs={},button={setAttribute:(k,v)=>attrs[k]=v,getAttribute:k=>attrs[k]},icons={show:{style:{display:''}},hide:{style:{display:'none'}}};
    return {id,value:'',textContent:'',disabled:false,hidden:false,focus(){focused=id;},classList:{add(){},remove(){},toggle(){}},
      setAttribute:(k,v)=>attrs[k]=v,getAttribute:k=>attrs[k],closest:selector=>selector==='button'?button:null,
      querySelector:selector=>selector==='[data-eye-icon="show"]'?icons.show:selector==='[data-eye-icon="hide"]'?icons.hide:null};
  };
  for(const id of ['admin-abrir-invitacion','admin-abrir-nuevo'])elements.set(id,node(id));
  const document={getElementById:id=>elements.get(id)||null,body:{appendChild(el){elements.set(el.id,el);el.isConnected=true;}},createElement(){
    const events={},attrs={};let html='';const children=[];
    return {dataset:{},open:false,isConnected:false,set className(v){this.classValue=v;},get className(){return this.classValue;},
      set innerHTML(v){html=v;for(const m of v.matchAll(/id="([^"]+)"/g)){const child=node(m[1]),tag=v.slice(v.lastIndexOf('<',m.index),v.indexOf('>',m.index));
        child.disabled=/\bdisabled\b/.test(tag);child.hidden=/\bhidden\b/.test(tag);child.type=tag.match(/type="([^"]+)"/)?.[1];
        elements.set(m[1],child);children.push(m[1]);}},get innerHTML(){return html;},
      setAttribute(k,v){attrs[k]=v;},getAttribute:k=>attrs[k],addEventListener(k,fn){events[k]=fn;},
      showModal(){this.open=true;opened++;},close(){this.open=false;events.close?.();},remove(){elements.delete(this.id);for(const id of children)elements.delete(id);this.isConnected=false;},
      querySelectorAll(){return children.map(id=>elements.get(id));},
      querySelector(selector){if(selector==='input[type="password"]')return elements.get('admin-manual-password')||null;
        if(selector==='button[type="button"]')return {focus(){focused='cancelar';}};return null;},
      cancel(){let prevented=false;events.cancel?.({preventDefault(){prevented=true;}});return prevented;}
    };
  }};
  const source=readFileSync(prefix+'js/views/admin.js','utf8');let block=source.slice(source.indexOf('let adminInvitacionEnCurso'),source.indexOf('function getAdminPanelHTML'));
  // Fijar ambos estados solo en el VM: no depender de la bandera local
  // que el operador haya cambiado para su ensayo y nunca modificarla.
  if(manualEnabled!=='produccion')block=block.replace(/const ADMIN_CREACION_MANUAL_UI_HABILITADA = (?:false|true);/,
    'const ADMIN_CREACION_MANUAL_UI_HABILITADA = '+String(manualEnabled===true)+';');
  const c={document,window:{INVITACIONES_UI_HABILITADA:true,location:{origin:uiOrigin}},state:{currentUser:{id}},adminAccesoVigente:()=>allowed,
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto,
    setTimeout:()=>1,clearTimeout(){}};
  vm.createContext(c);
  const access=readFileSync(prefix+'js/adminAcceso.js','utf8');vm.runInContext(access.slice(access.indexOf('function togglePasswordVisibility')),c);
  vm.runInContext(block,c);return {c,elements,source,opened:()=>opened,focused:()=>focused,setAllowed:v=>allowed=v};
}
test('INV-22: dos botones de cabecera y formulario fuera del panel, modal nativo reutilizado',()=>{
  for(const prefix of ['', 'publicacion/']){
    const f=adminModalFixture(prefix),panel=f.source.slice(f.source.indexOf('function getAdminPanelHTML'),f.source.indexOf('function getAdminFilasHTML'));
    assert.ok(panel.includes('onclick="adminAbrirInvitacion()"'));assert.ok(panel.includes('onclick="adminAbrirNuevoUsuario()"'));
    assert.ok(!panel.includes('$'+'{adminInvitacionPreparadaHTML()}'));
    f.c.adminAbrirInvitacion();const dialog=f.elements.get('admin-invitacion-dialog');assert.equal(dialog.open,true);assert.equal(f.opened(),1);
    assert.equal(dialog.getAttribute('aria-labelledby'),'admin-invitacion-titulo');assert.ok(!dialog.innerHTML.includes('<details'));
    const input=f.elements.get('admin-invitacion-email');input.value='persona@example.test';f.c.adminActualizarInvitacion();
    f.c.adminAbrirInvitacion();assert.equal(f.opened(),1);assert.equal(f.elements.get('admin-invitacion-email'),input);assert.equal(input.value,'persona@example.test');
    assert.equal(dialog.cancel(),true);assert.equal(dialog.open,true);
    f.c.adminAbrirNuevoUsuario();assert.equal(f.elements.has('admin-nuevo-usuario-dialog'),false,'No apilar dos modales');
    f.c.adminCerrarInvitacion();assert.equal(dialog.open,false);assert.equal(f.focused(),'admin-abrir-invitacion');
    f.c.adminAbrirInvitacion();assert.equal(input.value,'persona@example.test');
    vm.runInContext('adminInvitacionEnCurso=true',f.c);f.c.adminActualizarInvitacion();assert.equal(f.elements.get('admin-invitacion-cancelar').disabled,true);
    f.c.adminCerrarInvitacion();assert.equal(dialog.open,true,'No cerrar durante operación incierta');
  }
});
test('INV-22: manual muestra cuatro campos bloqueados, no acepta password ni ejecuta backend',()=>{
  for(const prefix of ['', 'publicacion/']){
    const f=adminModalFixture(prefix);f.c.adminAbrirNuevoUsuario();const d=f.elements.get('admin-nuevo-usuario-dialog');
    assert.equal(d.open,true);assert.match(d.innerHTML,/id="admin-manual-password" type="password" disabled/);assert.match(d.innerHTML,/Creación aún bloqueada/);
    for(const label of ['Nombre completo','Correo electrónico','Rol','Contraseña inicial'])assert.ok(d.innerHTML.includes(label));
    assert.ok(d.innerHTML.includes('<option>Técnico</option>'));assert.ok(d.innerHTML.includes('<option>Recepción</option>'));assert.ok(!d.innerHTML.includes('<option>Administrador'));
    assert.match(d.innerHTML,/type="submit" disabled/);assert.equal(d.getAttribute('aria-describedby'),'admin-manual-bloqueo');
    const password=f.elements.get('admin-manual-password');password.value='SECRETO_SOLO_MOCK';assert.equal(f.c.adminCrearUsuarioManual({preventDefault(){}}),false);assert.equal(password.value,'');
    password.value='SECRETO_SOLO_MOCK';f.c.adminCerrarNuevoUsuario();assert.equal(password.value,'');assert.equal(f.elements.has('admin-nuevo-usuario-dialog'),false);
    assert.equal(f.focused(),'admin-abrir-nuevo');assert.equal(f.opened(),1);
    const handler=f.source.slice(f.source.indexOf('function adminCrearUsuarioManual'),f.source.indexOf('function adminClaveCreacionManual'));
    for(const forbidden of ['console','sessionStorage','localStorage','.rpc(','fetch(','.invoke(','signUp','createUser'])assert.ok(!handler.includes(forbidden));
    assert.match(handler,/adminCreacionManualUIHabilitada\(\)&&adminAccesoVigente/);
  }
});
test('INV-22: roles sin acceso no abren ninguno y estilos de ambos temas son existentes',()=>{
  for(const prefix of ['', 'publicacion/']){
    const f=adminModalFixture(prefix,false);f.c.adminAbrirInvitacion();f.c.adminAbrirNuevoUsuario();assert.equal(f.opened(),0);
    const css=readFileSync(prefix+'css/ui-system.css','utf8');assert.ok(css.includes('#admin-invitacion-dialog::backdrop'));assert.ok(css.includes('#admin-nuevo-usuario-dialog::backdrop'));
    assert.ok(css.includes('width: min(32rem, calc(100% - 2rem))'));assert.ok(css.includes('max-height: 90vh; overflow-y: auto'));
    f.setAllowed(true);f.c.adminAbrirInvitacion();assert.match(f.elements.get('admin-invitacion-dialog').className,/bg-white dark:bg-slate-900/);
  }
});

// INV-23: una acción visible, consultas automáticas solo de lectura y sin polling tras error.
test('INV-23: escribir correo consulta tras pausa, no envía y no ofrece botón separado',async()=>{
  for(const root of [false,true]){
    const r=adminBrowser({enabled:true,root});r.node('admin-invitacion-email').value='persona@example.test';
    r.context.adminProgramarConsultaInvitacion();assert.equal(r.queryCalls.length,0);assert.equal(r.node('admin-invitacion-enviar').disabled,true);
    await r.runTimer();assert.equal(r.queryCalls.length,1);assert.equal(r.calls.length,0);assert.equal(r.node('admin-invitacion-enviar').disabled,false);
    const html=r.context.adminInvitacionPreparadaHTML();assert.ok(!html.includes('admin-invitacion-revisar'));assert.ok(!html.includes('Revisar correo</button>'));
    assert.ok(html.includes('Si el trabajador no puede utilizar su enlace, podrás solicitar otro después de al menos 60 segundos, siempre que la invitación siga pendiente y permita reenvío'));
    assert.equal((html.match(/type="submit"/g)||[]).length,1);assert.ok(html.includes('flex flex-wrap items-center justify-end gap-4'));
    await r.context.adminEnviarInvitacion(submitEvent);assert.equal(r.queryCalls.length,2,'Revalidar al pulsar');assert.equal(r.calls.length,1);
  }
});
test('INV-23: cambios rápidos agrupan consultas y una respuesta antigua no cambia el correo actual',async()=>{
  const pending=[];const r=adminBrowser({enabled:true,inspect:(_n,req)=>new Promise(resolve=>pending.push({email:req.body.email,resolve}))});
  r.node('admin-invitacion-email').value='primero@example.test';r.context.adminProgramarConsultaInvitacion();
  r.node('admin-invitacion-email').value='otro@example.test';r.context.adminProgramarConsultaInvitacion();assert.equal(r.timers.size,1);
  const old=r.runTimer();await new Promise(setImmediate);assert.equal(pending.length,1);
  r.node('admin-invitacion-email').value='actual@example.test';r.context.adminProgramarConsultaInvitacion();
  const fresh=r.runTimer();await new Promise(setImmediate);
  const response=email=>({data:{ok:true,email,estado:'CORREO_NUEVO',identidad_id:null,espera_segundos:0,reenvio_permitido:false,envio_habilitado:true},error:null});
  pending[1].resolve(response(pending[1].email));await fresh;
  pending[0].resolve(response(pending[0].email));await old;
  assert.equal(r.node('admin-invitacion-email').value,'actual@example.test');assert.equal(r.node('admin-invitacion-enviar').disabled,false);
  assert.match(r.node('admin-invitacion-estado').textContent,/Correo sin cuenta/);assert.equal(r.calls.length,0);
});
test('INV-23: compuertas cerradas o estado no comprobable mantienen botón bloqueado sin reintentos',async()=>{
  for(const root of [false,true])for(const type of ['general','envio','incompatible']){
    const r=adminBrowser({root,enabled:true,inspect:async(_n,req)=>type==='general'?{data:{ok:false,error:'INVITACIONES_DESHABILITADAS'},error:null}:
      {data:{ok:true,email:req.body.email,estado:'CORREO_NUEVO',identidad_id:null,espera_segundos:0,reenvio_permitido:false,
        ...(type==='envio'?{envio_habilitado:false}:{})},error:null}});
    r.node('admin-invitacion-email').value='persona@example.test';r.context.adminProgramarConsultaInvitacion();await r.runTimer();
    assert.equal(r.node('admin-invitacion-enviar').disabled,true);assert.equal(r.calls.length,0);assert.equal(r.queryCalls.length,1);assert.equal(r.timers.size,0);
    assert.match(r.node('admin-invitacion-estado').textContent,/deshabilitad|bloqueado/);
  }
});
test('INV-23: countdown consulta al terminar, solo click explícito reenvía y vuelve a validar',async()=>{
  let wait=60;
  const r=adminBrowser({enabled:true,inspect:async(_n,req)=>({data:{ok:true,email:req.body.email,estado:'INVITACION_PENDIENTE',identidad_id:sessionId,
    espera_segundos:wait,reenvio_permitido:wait===0,envio_habilitado:true},error:null})});
  const time=Date.now();vm.runInContext('Date.now=()=>'+time,r.context);
  r.node('admin-invitacion-email').value='persona@example.test';r.context.adminProgramarConsultaInvitacion();await r.runTimer();
  assert.equal(r.node('admin-invitacion-enviar').disabled,true);assert.match(r.node('admin-invitacion-enviar').textContent,/01:00/);
  wait=0;vm.runInContext('Date.now=()=>'+(time+61000),r.context);r.context.adminActualizarInvitacion();await r.runTimer();
  assert.equal(r.node('admin-invitacion-enviar').textContent,'Reenviar invitación');assert.equal(r.node('admin-invitacion-enviar').disabled,false);assert.equal(r.calls.length,0);
  await r.context.adminEnviarInvitacion(submitEvent);assert.equal(r.calls.length,1);assert.equal(r.calls[0].request.body.accion,'REENVIAR_INVITACION');
  assert.equal(r.queryCalls.length,3);
});
test('INV-23: si estado cambia antes del click se informa sin enviar, y sin permiso no consulta',async()=>{
  let approved=false;
  const r=adminBrowser({enabled:true,inspect:async(_n,req)=>({data:{ok:true,email:req.body.email,estado:approved?'CUENTA_APROBADA':'CORREO_NUEVO',
    identidad_id:approved?sessionId:null,espera_segundos:0,reenvio_permitido:false,envio_habilitado:true},error:null})});
  r.node('admin-invitacion-email').value='persona@example.test';r.context.adminProgramarConsultaInvitacion();await r.runTimer();
  approved=true;await r.context.adminEnviarInvitacion(submitEvent);assert.equal(r.calls.length,0);assert.equal(r.node('admin-invitacion-enviar').disabled,true);
  assert.match(r.node('admin-invitacion-estado').textContent,/Cuenta con rol/);
  const denied=adminBrowser({enabled:true,allowed:false});denied.node('admin-invitacion-email').value='persona@example.test';
  denied.context.adminProgramarConsultaInvitacion();await denied.runTimer();assert.equal(denied.queryCalls.length,0);
});
test('INV-23: consulta informa gate de envío cerrado sin abrirlo ni llamar Auth admin',async()=>{
  const model=sessionsModel({authRows:[],profileRows:[]}),f=adminFixture(model);let sends=0;
  const result=await ejecutarInvitacion({body:{accion:'CONSULTAR_INVITACION',email:inviteBody.email},actor,store:f.store,allowInvites:false,enviarInvitacion:async()=>sends++});
  assert.equal(result.envio_habilitado,false);assert.equal(result.estado,'CORREO_NUEVO');assert.equal(sends,0);
  await assert.rejects(ejecutarInvitacion({body:inviteBody,actor,store:f.store,allowInvites:false,enviarInvitacion:async()=>sends++}),/ENVIO_INVITACION_DESHABILITADO/);
  assert.equal(sends,0);
});

test('INV-23: pendiente sin permiso explícito de reenvío no habilita botón aunque no haya contador',async()=>{
  const r=adminBrowser({enabled:true,inspect:async(_n,req)=>({data:{ok:true,email:req.body.email,estado:'INVITACION_PENDIENTE',identidad_id:sessionId,
    espera_segundos:0,reenvio_permitido:false,envio_habilitado:true},error:null})});
  r.node('admin-invitacion-email').value='persona@example.test';r.context.adminProgramarConsultaInvitacion();await r.runTimer();
  assert.equal(r.node('admin-invitacion-enviar').disabled,true);assert.match(r.node('admin-invitacion-estado').textContent,/no permite reenviarla/);assert.equal(r.calls.length,0);
});

// INV-25: preparar creación manual, pero jamás activarla sin reserva durable.
test('INV-25: gate manual independiente cerrado; incluso abierto rechaza sin almacenamiento',async()=>{
  let authorizations=0,emails=0,sql=0;
  const common={enabled:false,origins:[origin],authenticate:async()=>actor,store:{exigirPermanente:async()=>sql++},
    enviarInvitacion:async()=>emails++,manualAuthorize:async()=>authorizations++};
  const body={accion:'CREAR_USUARIO_MANUAL',password:'SOLO_EN_MEMORIA'};
  let r=await createInvitationHandler(common)(request(body));assert.equal(r.status,503);assert.equal((await r.json()).error,'CREACION_MANUAL_DESHABILITADA');assert.equal(authorizations,0);
  r=await createInvitationHandler({...common,manualEnabled:true})(request(body));assert.equal(r.status,503);
  const text=await r.text();assert.ok(text.includes('CREACION_MANUAL_DURABILIDAD_PENDIENTE'));assert.ok(!text.includes('SOLO_EN_MEMORIA'));assert.equal(authorizations,1);assert.equal(emails,0);assert.equal(sql,0);
  const denied=createInvitationHandler({...common,manualEnabled:true,manualAuthorize:async()=>{throw new InvitationError('SOLO_ADMIN_PERMANENTE',403);}});
  assert.equal((await denied(request(body))).status,403);
  const invalid=createInvitationHandler({...common,manualEnabled:true,authenticate:async()=>null});assert.equal((await invalid(request(body))).status,401);
});
test('INV-25: autorización de creación utiliza cliente humano y RPC bajo JWT real, no postgres',async()=>{
  let received,calls=0;
  const factory=(row={es_admin_permanente:true})=>createManualActorAuthorizer(token=>{received=token;return {
    auth:{getUser:async t=>{assert.equal(t,token);return {data:{user:{id}},error:null};}},
    rpc:async(name,...args)=>{calls++;assert.equal(name,'mi_estado_administrativo');assert.equal(args.length,0);return {data:[row],error:null};}
  };});
  await factory()('solo-jwt-mock',actor);assert.equal(received,'solo-jwt-mock');assert.equal(calls,1);
  for(const row of [{es_admin_permanente:false,es_admin_temporal:true},{es_admin_permanente:false},{es_admin_permanente:'true'}])await assert.rejects(factory(row)('solo-jwt-mock',actor),/SOLO_ADMIN_PERMANENTE/);
  let network=0;const transport=createManualRpcFetch(async request=>{network++;assert.equal(request.headers.get('authorization'),'Bearer solo-jwt-mock');return new Response('{}');});
  await transport(PROJECT_URL+'/rest/v1/rpc/mi_estado_administrativo',{method:'POST',headers:{Authorization:'Bearer solo-jwt-mock'}});
  for(const path of ['/auth/v1/admin/users','/auth/v1/invite','/rest/v1/usuarios','/rest/v1/rpc/aprobar_usuario_normal'])await assert.rejects(transport(PROJECT_URL+path,{method:'POST'}),/DESTINO_NO_PERMITIDO/);
  assert.equal(network,1);
});
test('INV-25: nombre busca fichas y exige confirmación UUID antes de cualquier activación, ambas rutas',async()=>{
  for(const prefix of ['', 'publicacion/'])for(const mode of ['existente','nueva','cancelar','inactivo']){
    const f=adminModalFixture(prefix);f.c.adminAbrirNuevoUsuario();f.elements.get('admin-manual-nombre').value='Persona de prueba';
    let plans=0,reads=0;const worker={id:sessionId,nombre:'Persona de prueba',cargo:'Cargo real',estado:mode==='inactivo'?'Inactivo':'Activo'};
    f.c.window.UsuariosService={getMiEstadoAdministrativo:async()=>({es_admin_permanente:true})};
    f.c.window.TrabajadoresService={getTrabajadores:async()=>{reads++;return mode==='nueva'?[]:[worker];},listarVinculosCuentas:async()=>[]};
    f.c.adminConfirmarFichaAprobacion=async plan=>{plans++;assert.equal(plan.usuario.nombre,worker.nombre);assert.ok(!JSON.stringify(plan).includes('password'));
      if(mode==='existente'){assert.equal(plan.elegibles[0].id,sessionId);assert.equal(plan.coincidencias[0].cargo,'Cargo real');return {accion:'VINCULAR',trabajadorId:sessionId};}
      if(mode==='nueva'){assert.equal(plan.coincidencias.length,0);return {accion:'CREAR_Y_VINCULAR'};}
      if(mode==='inactivo'){assert.equal(plan.elegibles.length,0);return {accion:'VINCULAR',trabajadorId:sessionId};}return null;};
    await f.c.adminPlanificarFichaManual();assert.equal(reads,1);assert.equal(plans,1);
    const plan=vm.runInContext('adminManualPlan',f.c);
    if(['existente','nueva'].includes(mode)){assert.equal(plan.accion,mode==='existente'?'VINCULAR':'CREAR_Y_VINCULAR');assert.equal(plan.trabajadorId,mode==='existente'?sessionId:null);}
    else assert.equal(plan,null);
    assert.match(f.elements.get('admin-manual-ficha').textContent,/confirmad|confirmar|cancelada/);
  }
});
test('INV-25: homónimos/UUID ajeno nunca se vinculan y permiso temporal bloquea planificación',async()=>{
  const f=adminModalFixture();f.c.adminAbrirNuevoUsuario();f.elements.get('admin-manual-nombre').value='Persona de prueba';
  let reads=0;f.c.window.UsuariosService={getMiEstadoAdministrativo:async()=>({es_admin_permanente:false,es_admin_temporal:true})};
  f.c.window.TrabajadoresService={getTrabajadores:async()=>{reads++;return [];},listarVinculosCuentas:async()=>[]};
  await f.c.adminPlanificarFichaManual();assert.equal(reads,0);
  f.c.window.UsuariosService.getMiEstadoAdministrativo=async()=>({es_admin_permanente:true});
  f.c.window.TrabajadoresService.getTrabajadores=async()=>[id,sessionId].map(id=>({id,nombre:'Persona de prueba',estado:'Activo'}));
  f.c.adminConfirmarFichaAprobacion=async plan=>{assert.equal(plan.coincidencias.length,2);return {accion:'CREAR_Y_VINCULAR'};};
  await f.c.adminPlanificarFichaManual();assert.equal(vm.runInContext('adminManualPlan',f.c),null);
});
test('INV-25: confirmar password y mostrar/ocultar no guarda secretos; submit sigue cerrado',()=>{
  for(const prefix of ['', 'publicacion/']){
    const f=adminModalFixture(prefix);f.c.adminAbrirNuevoUsuario();const a=f.elements.get('admin-manual-password'),b=f.elements.get('admin-manual-password-confirm');
    a.value='CLAVE_SOLO_MOCK';b.value='OTRA';assert.equal(f.c.adminValidarPasswordsManual(),false);
    b.value=a.value;assert.equal(f.c.adminValidarPasswordsManual(),true);a.type='password';
    const eye=f.elements.get('eye-'+a.id),button=eye.closest('button');
    f.c.togglePasswordVisibility(a.id,eye.id);assert.equal(a.type,'text');assert.equal(button.getAttribute('aria-pressed'),'true');
    f.c.togglePasswordVisibility(a.id,eye.id);assert.equal(a.type,'password');assert.equal(f.c.adminCrearUsuarioManual({preventDefault(){}}),false);
    assert.equal(a.value,'');assert.equal(b.value,'');
    const d=f.elements.get('admin-nuevo-usuario-dialog');assert.match(d.innerHTML,/Confirmar contraseña/);assert.match(d.innerHTML,/type="submit" disabled/);
  }
});

// INV-28: modelo durable compartido entre workers; exclusivamente simulación.
const manualBody = () => ({ accion:'CREAR_USUARIO_MANUAL',solicitud_id:'90000000-0000-4000-8000-000000000001',
  nombre:'Persona Manual',email:'manual@example.invalid',rol:'Técnico',ficha_accion:'VINCULAR',trabajador_id:sessionId,
  confirmacion:true,recuperar:false,password:'CLAVE_TRANSITORIA_MOCK' });
function manualFixture(options={}) {
  const s={op:null,auth:null,receipt:null,approved:false,busy:false,creates:0,links:0,approvals:0,authorizations:0,phases:[],rpcTokens:[]};
  const authorize=async token=>{assert.equal(token,'human-jwt');s.authorizations++;if(options.denied)throw new InvitationError('SOLO_ADMIN_PERMANENTE',403);};
  const store={
    async serializar(_email,work){if(s.busy)throw new InvitationError('CREACION_MANUAL_EN_CURSO');s.busy=true;try{return await work(async()=>{if(options.lost)throw Error('SESSION_LOST');});}finally{s.busy=false;}},
    async reservar(a,intent,recover){
      if(s.op){if(s.op.actor_id!==a.id||s.op.huella_solicitud!==intent.huella_solicitud)throw new InvitationError('CREACION_MANUAL_SOLICITUD_INCOMPATIBLE');return structuredClone(s.op);}
      if(recover)throw Error('NO_RESERVA');if(options.existing)throw Error('CORREO_EXISTENTE');if(options.homonym)throw Error('HOMONIMO');
      s.op={...intent,actor_id:a.id,correlacion_id:'90000000-0000-4000-8000-000000000002',
        vinculo_solicitud_id:'90000000-0000-4000-8000-000000000003',rol_id:id,cuenta_id:null,trabajador_id:null,estado:'PREPARADA',revision:1};
      return structuredClone(s.op);
    },
    async transicion(_a,op,state,fields){assert.equal(op.revision,s.op.revision);s.phases.push(state);Object.assign(s.op,fields,{estado:state,revision:op.revision+1});return structuredClone(s.op);},
    async prepararAuth(){if(options.precondition)throw Error('PRECONDITION');},
    async reconciliarAuth(){if(!s.auth)return null;if(options.badMarker)throw new InvitationError('CREACION_MANUAL_IDENTIDAD_INCOMPATIBLE');return s.auth.id;},
    async reciboVinculo(){return s.receipt;},
    async verificarPendiente(){if(options.linkConflict)throw Error('VINCULO_INCOMPATIBLE');},
    async estadoAprobacion(){return s.approved;},
    async verificarFinal(){if(!s.auth||!s.receipt||!s.approved||options.finalConflict)throw Error('FINAL_INCOMPATIBLE');}
  };
  const createUser=async attrs=>{
    s.creates++;assert.equal(s.op.estado,'AUTH_EN_CURSO');assert.equal(attrs.password,'CLAVE_TRANSITORIA_MOCK');
    assert.equal(attrs.email_confirm,true);assert.equal(attrs.user_metadata.nombre,s.op.nombre);
    assert.deepEqual(attrs.app_metadata.creacion_manual_v1,manualMarca(s.op));
    if(options.pause)await options.pause();
    if(!options.noAuth)s.auth={id:'90000000-0000-4000-8000-000000000004'};
    if(options.authError)throw Error('ERROR_CONTIENE_CLAVE_TRANSITORIA_MOCK');
    return {data:{user:{id:s.auth?.id}},error:options.nativeCode?{code:options.nativeCode,message:'CLAVE_TRANSITORIA_MOCK'}:
      options.passwordRejected?{code:'weak_password',message:'PASSWORD_MOCK'}:null};
  };
  const humanClient=token=>({async rpc(name,args){
    s.rpcTokens.push(token);assert.equal(token,'human-jwt');
    if(name==='usuarios_trabajadores_gestionar_v1'){
      s.links++;assert.equal(s.approved,false);assert.equal(s.op.estado,'VINCULO_EN_CURSO');
      assert.deepEqual(args,manualPayload(s.op));
      assert.ok(!JSON.stringify(args).includes('CLAVE_'));
      if(!options.noLink)s.receipt=sessionId;
      if(options.linkError)throw Error('RPC_TIMEOUT');return {data:{resultado:'REGISTRADA'},error:null};
    }
    assert.equal(name,'aprobar_usuario_normal');s.approvals++;
    assert.equal(s.receipt,sessionId);assert.equal(s.op.estado,'APROBACION_EN_CURSO');
    assert.deepEqual(args,{p_usuario_id:s.op.cuenta_id,p_rol_id:id});
    if(!options.noApproval)s.approved=true;
    if(options.approvalError)throw Error('RPC_TIMEOUT');return {data:[{id:s.op.cuenta_id}],error:null};
  }});
  const run=body=>createManualService({store,authorize,humanClient,createUser,
    policy:()=>options.policy===undefined?{modo:'ENSAYO',correoEnsayo:'manual@example.invalid'}:options.policy})({body,actor,token:'human-jwt'});
  const recover=()=>run({...manualBody(),recuperar:true,password:undefined});
  return {s,store,run,options,recover:()=>{const b=manualBody();delete b.password;b.recuperar=true;return run(b);}};
}
test('INV-28: Técnico/Recepción, UUID explícito, JWT humano, password solo Auth y éxito verificado',async()=>{
  for(const rol of ['Técnico','Recepción'])for(const action of ['VINCULAR','CREAR_Y_VINCULAR']){
    const f=manualFixture(),b={...manualBody(),rol,ficha_accion:action,trabajador_id:action==='VINCULAR'?sessionId:null};
    const r=await f.run(b);assert.equal(r.estado,'COMPLETADA');assert.equal(r.completada,true);
    assert.equal(f.s.creates,1);assert.equal(f.s.links,1);assert.equal(f.s.approvals,1);assert.ok(f.s.authorizations>5);
    assert.ok(!JSON.stringify([f.s.op,r]).includes('CLAVE_'));assert.equal('password' in b,false);
    assert.deepEqual(f.s.phases,['AUTH_EN_CURSO','AUTH_CONFIRMADA','VINCULO_EN_CURSO','VINCULADA','APROBACION_EN_CURSO','COMPLETADA']);
  }
});
test('INV-28: entrada inválida/Admin/confirmación/UUID y contraseña de recuperación rechazan antes de reservar',async()=>{
  for(const change of [{rol:'Administrador'},{confirmacion:false},{trabajador_id:null},{actor_id:id},{password:''},{recuperar:true}]){
    const f=manualFixture();await assert.rejects(f.run({...manualBody(),...change}));assert.equal(f.s.op,null);assert.equal(f.s.creates,0);
  }
  for(const denied of ['temporal','tecnico','recepcion']){
    const f=manualFixture({denied});await assert.rejects(f.run(manualBody()),/SOLO_ADMIN_PERMANENTE/);assert.equal(f.s.op,null);
  }
});
test('INV-28: password no participa en huella, correo existente/homónimo no crea Auth',async()=>{
  const a=await manualIntent(manualBody()),b=await manualIntent({...manualBody(),password:'OTRA_PASSWORD'});
  assert.deepEqual(a,b);assert.ok(!JSON.stringify(a).includes('password'));
  for(const mode of ['existing','homonym','precondition']){
    const f=manualFixture({[mode]:true});await assert.rejects(f.run(manualBody()));assert.equal(f.s.creates,0);
  }
});
test('INV-28: respuesta Auth perdida reconcilia marca durable, nunca repite createUser',async()=>{
  const f=manualFixture({authError:true});let r=await f.run(manualBody());assert.equal(r.estado,'REVISION_AUTH');assert.equal(f.s.approved,false);
  r=await f.recover();assert.equal(r.completada,true);assert.equal(f.s.creates,1);assert.equal(f.s.links,1);
  r=await f.recover();assert.equal(r.completada,true);assert.equal(f.s.creates,1);assert.equal(f.s.approvals,1);
});
test('INV-28: Auth ausente/contraseña rechazada retiene incertidumbre; jamás RECHAZADA ni segundo create',async()=>{
  for(const o of [{authError:true,noAuth:true},{passwordRejected:true,noAuth:true}]){
    const f=manualFixture(o);await f.run(manualBody());const r=await f.recover();
    assert.equal(r.estado,'REVISION_AUTH');assert.equal(f.s.creates,1);assert.equal(f.s.links,0);
    assert.ok(!f.s.phases.includes('RECHAZADA'));
  }
});
test('INV-28: vinculación/aprobación perdidas recuperan recibo/rol sin repetir RPC',async()=>{
  for(const stage of ['linkError','approvalError']){
    const f=manualFixture({[stage]:true});let r=await f.run(manualBody());assert.equal(r.completada,false);
    assert.equal(r.estado,stage==='linkError'?'REVISION_VINCULO':'REVISION_APROBACION');
    r=await f.recover();assert.equal(r.completada,true);assert.equal(f.s.links,1);assert.equal(f.s.approvals,1);assert.equal(f.s.creates,1);
  }
});
test('INV-28: recuperación explícita sin recibo reusa exactamente subUUID y parámetros laborales',async()=>{
  const f=manualFixture({linkError:true,noLink:true});await f.run(manualBody());const saved=manualPayload(f.s.op);
  f.options.linkError=false;f.options.noLink=false;const r=await f.recover();assert.equal(r.completada,true);
  assert.deepEqual(manualPayload(f.s.op),saved);assert.equal(f.s.links,2);assert.equal(f.s.creates,1);
});

test('INV-29: recuperación de claim laboral/aprobación interrumpido no repite transición EN_CURSO',async()=>{
  for(const phase of ['VINCULO_EN_CURSO','APROBACION_EN_CURSO']){
    const options=phase==='VINCULO_EN_CURSO'?{linkError:true,noLink:true}:{approvalError:true,noApproval:true};
    const f=manualFixture(options);await f.run(manualBody());
    f.s.op.estado=phase; // caída tras persistir claim, antes de resultado confirmado
    const previous=f.s.phases.length;
    f.options.linkError=false;f.options.noLink=false;f.options.approvalError=false;f.options.noApproval=false;
    const subUuid=f.s.op.vinculo_solicitud_id;
    const result=await f.recover();assert.equal(result.completada,true);assert.equal(f.s.creates,1);
    assert.equal(f.s.op.vinculo_solicitud_id,subUuid);
    assert.ok(!f.s.phases.slice(previous).includes(phase),'La fase durable ya existía');
  }
});

test('INV-32: modo por defecto es ensayo; configuración ausente/inválida y otro correo no reservan',async()=>{
  for(const policy of [{},{modo:'ENSAYO'},{modo:'ENSAYO',correoEnsayo:''},
    {modo:'ENSAYO',correoEnsayo:'correo-invalido'},{modo:'ensayo',correoEnsayo:'manual@example.invalid'},
    {modo:'ENSAYO',correoEnsayo:'otro@example.invalid'},{modo:'PRODUCCION',correoEnsayo:'manual@example.invalid'}]){
    const f=manualFixture({policy});await assert.rejects(f.run(manualBody()),/CREACION_MANUAL_(ENSAYO|CORREO|MODO)/);
    assert.equal(f.s.op,null);assert.equal(f.s.creates,0);assert.equal(f.s.links,0);assert.ok(f.s.authorizations>0);
  }
});

test('INV-32: correo autorizado normaliza espacios/mayúsculas; producción solo explícita y sin restricción residual',async()=>{
  const f=manualFixture({policy:{correoEnsayo:'  MANUAL@EXAMPLE.INVALID  '}});
  const r=await f.run({...manualBody(),email:' MANUAL@EXAMPLE.INVALID '});assert.equal(r.completada,true);
  const normal=manualFixture({policy:{modo:'PRODUCCION'}});
  assert.equal((await normal.run({...manualBody(),email:'otro@example.invalid'})).completada,true);
  assert.throws(()=>exigirCorreoManual({},'manual@example.invalid'),/SIN_CONFIGURAR/);
  assert.throws(()=>exigirCorreoManual({modo:'',correoEnsayo:'manual@example.invalid'},'manual@example.invalid'),/MODO_INVALIDO/);
});

test('INV-32: restricción se aplica a recuperación y revalidación antes de Auth; navegador no controla modo',async()=>{
  const f=manualFixture({authError:true});await f.run(manualBody());const original=structuredClone(f.s.op);
  f.options.policy={modo:'ENSAYO',correoEnsayo:'otro@example.invalid'};
  await assert.rejects(f.recover(),/CORREO_NO_PERMITIDO/);assert.deepEqual(f.s.op,original);assert.equal(f.s.creates,1);
  const denied=manualFixture({denied:true,policy:{}});await assert.rejects(denied.run(manualBody()),/SOLO_ADMIN_PERMANENTE/);
  const attempt=manualFixture();await assert.rejects(attempt.run({...manualBody(),modo:'PRODUCCION'}),/DATOS_INVALIDOS/);assert.equal(attempt.s.op,null);
  const race=manualFixture();const previous=race.store.prepararAuth;
  race.store.prepararAuth=async(...args)=>{await previous(...args);race.options.policy={};};
  await assert.rejects(race.run(manualBody()),/SIN_CONFIGURAR/);assert.equal(race.s.creates,0);
});

test('INV-32: errores Auth se codifican sin contraseña ni mensaje original, sin liberar incertidumbre',async()=>{
  for(const code of ['weak_password','email_exists','user_already_exists','unexpected_failure']){
    const f=manualFixture({nativeCode:code,noAuth:true});const r=await f.run(manualBody());
    assert.equal(r.estado,'REVISION_AUTH');assert.equal(r.completada,false);assert.equal(r.requiere_revision,true);
    assert.equal(r.codigo_error,code==='weak_password'?'PASSWORD_RECHAZADA':code==='unexpected_failure'?'AUTH_NO_CONFIRMADA':'CORREO_EXISTENTE_AUTH');
    assert.ok(!JSON.stringify([r,f.s.op]).includes('CLAVE_TRANSITORIA_MOCK'));
    await f.recover();assert.equal(f.s.creates,1);assert.ok(!f.s.phases.includes('RECHAZADA'));
  }
});

test('INV-36: interfaz permanente sin bandera local y restringida al administrador permanente',async()=>{
  for(const prefix of ['', 'publicacion/']){
    const f=adminModalFixture(prefix,true,'produccion','https://pruebaelalmendro.vercel.app');
    assert.equal(f.c.adminCreacionManualUIHabilitada(),true);assert.ok(!f.source.includes('ADMIN_CREACION_MANUAL_UI_LOCAL_HABILITADA'));
    f.c.adminAbrirNuevoUsuario();assert.equal(f.elements.get('admin-manual-password').disabled,false);
    assert.equal(f.elements.get('admin-manual-password-confirm').disabled,false);assert.equal(f.elements.get('admin-manual-recuperar').hidden,true);
    f.setAllowed(false);assert.equal(f.c.adminCreacionManualUIHabilitada(),false);
    for(const role of ['Técnico','Recepción','Administrador temporal']){
      const denied=adminModalFixture(prefix,false,'produccion','https://pruebaelalmendro.vercel.app');
      denied.c.state.currentUser.role=role;denied.c.adminAbrirNuevoUsuario();denied.c.adminAbrirInvitacion();assert.equal(denied.opened(),0);
      let calls=0;denied.c.window.supabaseClient={functions:{invoke:async()=>calls++}};
      await denied.c.adminEnviarCreacionManual(false);assert.equal(calls,0);
    }
  }
});

// Conjunto candidato: archivos completos de raíz/Edge; resto proviene de HEAD.
// No hace staging, no crea checkout ni materializa archivos auxiliares.
const INV36_ARCHIVOS_COMPLETOS = [
  '.vercelignore','login.html','registrar.html','js/registrar.js','js/config/supabaseClient.js',
  'js/app.js','js/views/pendingAccount.js','js/views/admin.js','js/services/usuarios.service.js',
  'js/services/trabajadores.service.js','css/ui-system.css',
  ...['index.ts','invitaciones.mjs','manual.mjs','manual-store.mjs','postgres-store.mjs']
    .map(f=>'supabase/functions/usuario-invitaciones/'+f)
];
function inv36Candidato(file){
  return INV36_ARCHIVOS_COMPLETOS.includes(file)?readFileSync(file,'utf8'):
    execFileSync('git',['show','HEAD:'+file],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
}
test('INV-36: candidato de raíz resuelve HTML, scripts y CSS sin depender del espejo pendiente',()=>{
  for(const file of ['index.html','login.html','registrar.html','recuperar-password.html']){
    const html=inv36Candidato(file);
    for(const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)){
      if(/^(?:https?:|#|data:)/.test(match[1]))continue;
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1].replace(/[?#].*$/,'')));
      assert.ok(!target.startsWith('publicacion/'));assert.ok(inv36Candidato(target).length>0,target);
    }
  }
  const index=inv36Candidato('index.html');assert.ok(index.indexOf('./js/adminAcceso.js')<index.indexOf('./js/views/admin.js'));
  assert.ok(inv36Candidato('js/services/trabajadores.service.js').includes('async aprobarCuentaConFicha'));
  assert.ok(inv36Candidato('js/services/trabajadores.service.js').includes('p_solicitud_id: solicitud'));
  assert.ok(inv36Candidato('js/services/usuarios.service.js').includes('trabajador_id, roles(nombre)'));
});
test('INV-36: candidato no añade excepción de eliminación, ni secretos, y excluye fuentes del hosting',()=>{
  const forbidden=/43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4|d642838d-19df-4fd5-994a-77c6b63795ad|usuarioEsExcepcionalEliminacion|COMPUERTA_EXCEPCIONAL|adminObjetivoEliminacionPermitido/;
  for(const file of INV36_ARCHIVOS_COMPLETOS){
    const source=inv36Candidato(file);assert.ok(!forbidden.test(source),file);
    assert.ok(!/sb_secret_[A-Za-z0-9_-]{15,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(source),file);
  }
  assert.equal(inv36Candidato('supabase/functions/usuario-eliminacion-previsualizar/database-safety.mjs'),readFileSync('supabase/functions/usuario-eliminacion-previsualizar/database-safety.mjs','utf8'));
  const ignores=inv36Candidato('.vercelignore').split(/\r?\n/);
  for(const folder of ['publicacion/','supabase/','tests/','docs/','tools/'])assert.ok(ignores.includes(folder));
  assert.ok(!ignores.includes('js/'));assert.ok(!ignores.includes('css/'));
});
test('INV-36: destino HTTPS y registro fijo; producción explícita sin abrir ENSAYO por omisión',()=>{
  exigirCorreoManual({modo:'PRODUCCION'},'nuevo@example.invalid');
  assert.throws(()=>exigirCorreoManual({},'nuevo@example.invalid'),/SIN_CONFIGURAR/);
  assert.throws(()=>exigirCorreoManual({modo:'PRODUCCION',correoEnsayo:''},'nuevo@example.invalid'),/MODO_INCOMPATIBLE/);
  const registrar=inv36Candidato('js/registrar.js'),login=inv36Candidato('login.html'),client=inv36Candidato('js/config/supabaseClient.js');
  assert.match(inv36Candidato('registrar.html'),/<input[^>]*id="invitation-email"[^>]*\breadonly\b/);
  assert.ok(!/signUp\s*\(|updateUser\(\{\s*email/.test(registrar));
  assert.ok(!login.includes('id="tab-register"'));assert.ok(!/\.signUp\s*\(/.test(login));
  assert.ok(client.includes("'https://pruebaelalmendro.vercel.app'"));assert.ok(client.includes('window.REGISTRO_PUBLICO_UI_HABILITADO = false'));
  assert.equal(DESTINO_INVITACION,'https://pruebaelalmendro.vercel.app/registrar.html');
  assert.ok(inv36Candidato('js/recuperarPassword.js').includes('auth.updateUser({ password: nueva.value })'));
});

test('INV-32: mensajes distinguen bloqueo, autorización, cuenta existente, contraseña y revisión sin mostrar datos crudos',()=>{
  const cases=[
    [{error:'CREACION_MANUAL_DESHABILITADA'},/todavía no está disponible/],
    [{error:'CREACION_MANUAL_ENSAYO_SIN_CONFIGURAR'},/no está configurado/],
    [{error:'CREACION_MANUAL_CORREO_NO_PERMITIDO'},/no está autorizado/],
    [{error:'SOLO_ADMIN_PERMANENTE'},/no autorizada/],
    [{error:'CREACION_MANUAL_CORREO_EXISTENTE'},/ya pertenece a una cuenta/],
    [{estado:'REVISION_AUTH',codigo_error:'PASSWORD_RECHAZADA'},/rechazó la contraseña/],
    [{estado:'REVISION_VINCULO'},/falta confirmar su ficha laboral/],
    [{estado:'REVISION_APROBACION'},/aprobación todavía no está confirmada/],
    [{error:'ERROR_CLAVE_TRANSITORIA_MOCK',message:'CLAVE_TRANSITORIA_MOCK'},/No pudimos confirmar/]
  ];
  for(const prefix of ['', 'publicacion/']){
    const f=adminModalFixture(prefix);
    for(const [data,pattern] of cases){const m=f.c.adminMensajeCreacionManual(data);assert.match(m,pattern);assert.ok(!m.includes('CLAVE_TRANSITORIA_MOCK'));}
  }
});

test('INV-32: UI interpreta error HTTP estructurado y conserva recibo/UUID sin contraseña',async()=>{
  for(const code of ['CREACION_MANUAL_DESHABILITADA','CREACION_MANUAL_CORREO_EXISTENTE','SOLO_ADMIN_PERMANENTE']){
    const f=adminModalFixture('',true,true);f.c.adminAbrirNuevoUsuario();
    f.c.window.UsuariosService={getMiEstadoAdministrativo:async()=>({es_admin_permanente:true})};
    const ticket={version:1,actor:id,body:{...manualBody()}};delete ticket.body.password;delete ticket.body.recuperar;
    f.c.sessionStorage.setItem(f.c.adminClaveCreacionManual(),JSON.stringify(ticket));
    let calls=0;f.c.window.supabaseClient={functions:{invoke:async()=>{calls++;return {data:null,error:{context:new Response(JSON.stringify({ok:false,error:code}),{status:503})}};}}};
    await f.c.adminEnviarCreacionManual(true);assert.equal(calls,1);
    assert.equal(f.elements.get('admin-manual-ficha').textContent,f.c.adminMensajeCreacionManual({error:code}));
    const saved=f.c.sessionStorage.getItem(f.c.adminClaveCreacionManual());assert.equal(JSON.parse(saved).body.solicitud_id,ticket.body.solicitud_id);
    assert.ok(!saved.includes('CLAVE_'));assert.equal(f.elements.get('admin-manual-crear').disabled,true);
  }
});
test('INV-28: dos workers simultáneos/doble clic, nueva solicitud mismo correo no repite Auth',async()=>{
  let finish,entered;const enteredPromise=new Promise(r=>entered=r);
  const f=manualFixture({pause:async()=>{entered();await new Promise(r=>finish=r);}});
  const first=f.run(manualBody());await enteredPromise;
  await assert.rejects(f.run(manualBody()),/EN_CURSO/);
  await assert.rejects(f.run({...manualBody(),solicitud_id:sessionId}),/EN_CURSO/);
  finish();await first;assert.equal(f.s.creates,1);assert.equal(f.s.busy,false);
  await assert.rejects(f.run({...manualBody(),nombre:'Nombre cambiado'}),/INCOMPATIBLE/);assert.equal(f.s.creates,1);
});
test('INV-28: marca incompatible, sesión perdida y verificación final fallida no confirman éxito',async()=>{
  const f=manualFixture({authError:true});await f.run(manualBody());f.options.badMarker=true;
  await assert.rejects(f.recover(),/IDENTIDAD_INCOMPATIBLE/);assert.equal(f.s.links,0);assert.equal(f.s.creates,1);
  const lost=manualFixture({lost:true});await assert.rejects(lost.run(manualBody()),e=>e.etapa==='SESION_SQL'&&e.code==='CREACION_MANUAL_ETAPA_NO_CONFIRMADA');assert.equal(lost.s.creates,0);
  const final=manualFixture({finalConflict:true});await assert.rejects(final.run(manualBody()),e=>e.etapa==='VERIFICAR_FINAL'&&e.code==='CREACION_MANUAL_ETAPA_NO_CONFIRMADA');assert.ok(!final.s.phases.includes('COMPLETADA'));
});

async function contextoInv33(){
  const body={...manualBody(),solicitud_id:'17add781-fc90-41e2-8447-42b5910e3fda',
    nombre:'Prueba Manual INV32',rol:'Recepción',ficha_accion:'CREAR_Y_VINCULAR',trabajador_id:null,recuperar:true};
  delete body.password;
  const f=manualFixture(),intent=await manualIntent(body);
  f.s.op={...intent,actor_id:actor.id,actor_sesion_id:actor.sessionId,
    correlacion_id:'90000000-0000-4000-8000-000000000002',vinculo_solicitud_id:'90000000-0000-4000-8000-000000000003',
    rol_id:id,cuenta_id:null,trabajador_id:null,estado:'AUTH_EN_CURSO',revision:2};
  f.s.auth={id:'90000000-0000-4000-8000-000000000004',marca:manualMarca(f.s.op),correo_confirmado:true};
  f.s.profile={nombre:body.nombre,rol_id:null,trabajador_id:null,correo_verificado:true};
  const reconcile=f.store.reconciliarAuth;
  f.store.reconciliarAuth=async(...args)=>{
    assert.deepEqual(f.s.auth.marca,manualMarca(args[1]));assert.equal(f.s.profile.rol_id,null);assert.equal(f.s.profile.trabajador_id,null);
    assert.equal(f.s.profile.correo_verificado,true);return await reconcile(...args);
  };
  return {f,body};
}

test('INV-33: contexto real informado AUTH_EN_CURSO rev2, Recepción y ficha nueva recupera sin password/createUser',async()=>{
  const {f,body}=await contextoInv33();
  const receiptId=f.s.op.vinculo_solicitud_id;
  const result=await f.run(body);
  assert.equal(result.estado,'COMPLETADA');assert.equal(result.completada,true);assert.equal(result.solicitud_id,body.solicitud_id);
  assert.equal(result.cuenta_id,f.s.auth.id);assert.equal(f.s.creates,0);assert.equal(f.s.links,1);assert.equal(f.s.approvals,1);
  assert.equal(f.s.op.vinculo_solicitud_id,receiptId);assert.equal(f.s.op.rol_nombre_snapshot,'Recepción');
  assert.deepEqual(f.s.phases,['AUTH_CONFIRMADA','VINCULO_EN_CURSO','VINCULADA','APROBACION_EN_CURSO','COMPLETADA']);
  assert.equal((await f.run(body)).completada,true);assert.equal(f.s.creates,0);assert.equal(f.s.links,1);assert.equal(f.s.approvals,1);
});

test('INV-33: rechazo de transición informa etapa/SQLSTATE sin secretos y conserva AUTH_EN_CURSO para recuperar',async()=>{
  const {f,body}=await contextoInv33();const original=f.store.transicion;
  f.store.transicion=async(_a,_op,estado)=>{
    assert.equal(estado,'AUTH_CONFIRMADA');const error=new Error('CLAVE_PRIVADA_MOCK');
    Object.assign(error,{code:'23514',detail:'CLAVE_PRIVADA_MOCK',query:'PARAMETROS_PRIVADOS_MOCK'});throw error;
  };
  const handler=createInvitationHandler({manualEnabled:true,origins:[origin],authenticate:async()=>actor,manualAuthorize:async()=>{},manualExecute:async params=>{
    return await createManualService({store:f.store,authorize:async()=>{},humanClient:()=>{throw Error('NO_RPC');},createUser:()=>{throw Error('NO_AUTH');},
      policy:()=>({modo:'ENSAYO',correoEnsayo:'manual@example.invalid'})})(params);
  }});
  const response=await handler(request(body));const data=await response.json();assert.equal(response.status,503);
  assert.equal(data.etapa,'TRANSICION_AUTH_CONFIRMADA');assert.equal(data.sqlstate,'23514');assert.equal(data.requiere_revision,true);
  assert.ok(!JSON.stringify(data).includes('PRIVAD'));assert.equal(f.s.op.estado,'AUTH_EN_CURSO');assert.equal(f.s.op.revision,2);
  assert.equal(f.s.creates,0);assert.equal(f.s.links,0);assert.equal(f.s.approvals,0);
  f.store.transicion=original;assert.equal((await f.run(body)).completada,true);assert.equal(f.s.creates,0);
});

test('INV-33: diagnósticos no propagan mensaje de red ni SQLSTATE inválido y UI orienta recuperación manual correcta',async()=>{
  await assert.rejects(etapaManual('RECONCILIAR_AUTH',async()=>{throw Object.assign(new Error('JWT_O_PASSWORD_MOCK'),{code:'codigo-no-sql'});}),e=>
    e.etapa==='RECONCILIAR_AUTH'&&e.sqlstate===undefined&&!e.message.includes('MOCK'));
  for(const prefix of ['', 'publicacion/']){
    const f=adminModalFixture(prefix);
    const message=f.c.adminMensajeCreacionManual({error:'CREACION_MANUAL_ETAPA_NO_CONFIRMADA',etapa:'TRANSICION_AUTH_CONFIRMADA',sqlstate:'23514'});
    assert.match(message,/no crees otra cuenta/);assert.match(message,/23514/);assert.match(message,/Revisar solicitud/);assert.match(message,/TRANSICION_AUTH_CONFIRMADA/);
  }
});

test('INV-33: reabrir Nuevo usuario identifica la solicitud guardada sin autoenviar ni revelar contraseña',()=>{
  for(const prefix of ['', 'publicacion/']){
    const f=adminModalFixture(prefix,true,true);
    f.c.sessionStorage.setItem(f.c.adminClaveCreacionManual(),JSON.stringify({version:1,actor:id,body:{
      accion:'CREAR_USUARIO_MANUAL',solicitud_id:'17add781-fc90-41e2-8447-42b5910e3fda'}}));
    f.c.adminAbrirNuevoUsuario();const text=f.elements.get('admin-manual-ficha').textContent;
    assert.match(text,/17add781-fc90-41e2-8447-42b5910e3fda/);assert.match(text,/No crees otra cuenta/);
    assert.equal(f.elements.get('admin-manual-crear').disabled,true);assert.equal(f.elements.get('admin-manual-password').value,'');
  }
});
test('INV-28: Auth transport permite solo un POST createUser; nunca invite, DELETE ni redirects',async()=>{
  let sends=0;const transport=createManualAuthFetch(PROJECT_URL,async(req,opt)=>{sends++;assert.equal(opt.redirect,'error');return new Response('{}');});
  for(const path of ['/auth/v1/invite','/auth/v1/admin/users/otro','/rest/v1/usuarios'])await assert.rejects(transport(PROJECT_URL+path,{method:'POST'}),/DESTINO/);
  await transport(PROJECT_URL+'/auth/v1/admin/users',{method:'POST'});
  await assert.rejects(transport(PROJECT_URL+'/auth/v1/admin/users',{method:'POST'}),/DESTINO/);assert.equal(sends,1);
});

test('INV-28: gate/Origin/JWT y errores HTTP manuales no filtran contraseñas ni llaman invitaciones',async()=>{
  let calls=0;const f=manualFixture({authError:true,noAuth:true});
  const handler=createInvitationHandler({enabled:false,manualEnabled:true,origins:[origin],authenticate:async()=>actor,
    manualAuthorize:async()=>{},manualExecute:async params=>{calls++;return await createManualService({
      store:f.store,authorize:async()=>{},policy:()=>({modo:'ENSAYO',correoEnsayo:'manual@example.invalid'}),humanClient:()=>{throw Error('NO_RPC');},createUser:async()=>{throw Error('CLAVE_TRANSITORIA_MOCK');}
    })(params);},enviarInvitacion:()=>{throw Error('NO_INVITAR');}});
  const result=await handler(request(manualBody()));assert.equal(result.status,202);
  const text=await result.text();assert.ok(text.includes('REVISION_AUTH'));assert.ok(!text.includes('CLAVE_TRANSITORIA_MOCK'));
  const bad=request(manualBody());bad.headers.set('origin','https://ajeno.example');assert.equal((await handler(bad)).status,403);assert.equal(calls,1);
});

test('INV-28: UI ambas rutas conserva solicitud sin password y recupera explícitamente sin reenvío Auth',async()=>{
  for(const prefix of ['', 'publicacion/']){
    const f=adminModalFixture(prefix,true,true);f.c.adminAbrirNuevoUsuario();
    f.c.window.UsuariosService={getMiEstadoAdministrativo:async()=>({es_admin_permanente:true}),_usuariosCache:{}};
    f.c.window.TrabajadoresService={_trabajadoresCache:{}};
    f.elements.get('admin-manual-nombre').value='Persona Manual';f.elements.get('admin-manual-email').value='manual@example.invalid';
    f.elements.get('admin-manual-rol').value='Técnico';f.elements.get('admin-manual-confirmacion').checked=true;
    f.elements.get('admin-manual-password').value='CLAVE_UI_MOCK';f.elements.get('admin-manual-password-confirm').value='CLAVE_UI_MOCK';
    vm.runInContext('adminManualPlan={nombre:"Persona Manual",accion:"VINCULAR",trabajadorId:"'+sessionId+'"}',f.c);
    const calls=[];f.c.window.supabaseClient={functions:{invoke:async(name,req)=>{
      assert.equal(name,'usuario-invitaciones');calls.push(structuredClone(req.body));
      const raw=f.c.sessionStorage.getItem(f.c.adminClaveCreacionManual());assert.ok(!raw.includes('CLAVE_UI_MOCK'));
      if(calls.length===1){assert.equal(req.body.password,'CLAVE_UI_MOCK');throw Error('RED_INCIERTA');}
      assert.equal('password' in req.body,false);assert.equal(req.body.recuperar,true);
      return {error:null,data:{ok:true,completada:true,estado:'COMPLETADA',solicitud_id:req.body.solicitud_id,cuenta_id:id,trabajador_id:sessionId}};
    }}};
    await f.c.adminEnviarCreacionManual(false);assert.equal(calls.length,1);assert.equal(f.elements.get('admin-manual-password').value,'');
    const ticket=JSON.parse(f.c.sessionStorage.getItem(f.c.adminClaveCreacionManual()));
    await f.c.adminEnviarCreacionManual(false);assert.equal(calls.length,1,'No nuevo UUID ni doble creación');
    await f.c.adminEnviarCreacionManual(true);assert.equal(calls.length,2);assert.equal(calls[1].solicitud_id,ticket.body.solicitud_id);
    assert.equal(f.c.sessionStorage.getItem(f.c.adminClaveCreacionManual()),null);assert.match(f.elements.get('admin-manual-ficha').textContent,/confirmados/);
  }
});

test('INV-28: reserva PREPARADA requiere contraseña nueva y confirmación explícita, conserva UUID',async()=>{
  const f=manualFixture({precondition:true});await assert.rejects(f.run(manualBody()));assert.equal(f.s.op.estado,'PREPARADA');
  const r=await f.recover();assert.equal(r.estado,'PREPARADA');assert.equal(f.s.creates,0);
  f.options.precondition=false;await f.run(manualBody());assert.equal(f.s.creates,1);assert.equal(f.s.op.solicitud_id,manualBody().solicitud_id);
});

function manualSqlFixture(options={}) {
  const state={op:null,queries:[],updates:[],sessions:0,closes:0,releases:0,locks:new Set()};
  const sql=async(parts,...values)=>{
    if(!Array.isArray(parts))return {update:parts};
    const text=parts.join('?').replace(/\s+/g,' ').trim();state.queries.push({text,values});
    if(text.startsWith('SET '))return [];
    if(text.includes('current_database() AS db'))return [{rol:options.role||'postgres',login:'postgres',db:'postgres',isolation:'read committed'}];
    if(text.startsWith('SELECT u.id FROM public.usuarios'))return options.denied?[]:[{id}];
    if(text.startsWith('SELECT * FROM public.usuarios_creaciones'))return state.op?[structuredClone(state.op)]:[];
    if(text.includes('greatest(clock_timestamp()'))return [{instante:'2026-11-13T12:00:00Z'}];
    if(text.startsWith('UPDATE public.usuarios_creaciones')){
      const update=values[0].update;state.updates.push(update);Object.assign(state.op,update);return [structuredClone(state.op)];
    }
    if(text.startsWith('SELECT id FROM public.roles'))return [{id}];
    if(text.startsWith('SELECT id FROM public.trabajadores'))return options.homonym?[{id:sessionId}]:[];
    if(text.startsWith('SELECT id,email,email_confirmed_at')){
      if(options.authDocument){
        // Contrato de postgres@3.4.5 verificado con su serializer real:
        // OID3802 -> JSON.stringify; OID25 -> String. No ejecuta PostgreSQL.
        const transmitted=text.includes('?::text::jsonb')?String(values[0]):JSON.stringify(values[0]);
        const decoded=JSON.parse(transmitted);
        return [{...options.authDocument,
          marca_coincide:JSON.stringify(decoded)===JSON.stringify(options.authDocument.marker)}];
      }
      return options.authRows||[];
    }
    if(text.startsWith('SELECT id,nombre,email,estado'))return [options.profile||{id:sessionId,nombre:state.op.nombre,email:state.op.correo,estado:true,rol_id:null,trabajador_id:null}];
    if(text.startsWith('SELECT usuario_id FROM public.usuarios_correos'))return options.unverified?[]:[{usuario_id:sessionId}];
    if(text.startsWith('SELECT id FROM auth.users'))return [];
    throw Error('SQL_MOCK_NO_PREVISTO: '+text);
  };
  const tagged=(parts,...args)=>{
    if(!Array.isArray(parts))return {update:parts};
    return sql(parts,...args);
  };
  const database=()=>({begin:async(mode,work)=>{assert.equal(mode,'isolation level read committed read write');return await work(tagged);}});
  const sessionFactory=async()=>{
    state.sessions++;
    return {sql:async(parts,...values)=>{
      const text=parts.join('?');
      if(text.includes('pg_try_advisory_lock')){const key=values.join(':');if(state.locks.has(key))return [{adquirido:false}];state.locks.add(key);return [{adquirido:true}];}
      if(text.includes('pg_advisory_unlock')){const released=state.locks.delete(values.join(':'));return [{liberado:options.unlockError?false:released}];}
      if(text.includes('pg_backend_pid()'))return [{pid:123,rol:'postgres',login:'postgres'}];
      if(text.startsWith('SET '))return [];
      throw Error('SESION_MOCK_NO_PREVISTA');
    },release(){state.releases++;},async close(){state.closes++;state.locks.clear();}};
  };
  return {state,store:createManualStore({database,sessionFactory})};
}
test('INV-28: store real usa CAS, reloj SQL único y no modifica perfil/rol/ficha',async()=>{
  const f=manualSqlFixture(),intent=await manualIntent(manualBody());
  f.state.op={...intent,actor_id:id,correlacion_id:sessionId,revision:'1',estado:'AUTH_CONFIRMADA',
    actualizada_en:'2026-11-13T11:00:00Z',cuenta_id:'90000000-0000-4000-8000-000000000004'};
  const before=structuredClone(f.state.op);
  const after=await f.store.transicion(actor,before,'VINCULADA',{trabajador_id:sessionId});
  assert.equal(after.estado,'VINCULADA');assert.equal(after.revision,'2');
  assert.equal(f.state.updates[0].actualizada_en,f.state.updates[0].ficha_vinculada_en);
  assert.ok(f.state.queries.some(q=>q.text.includes('AND revision=')&&q.text.includes('AND estado=')));
  await assert.rejects(f.store.transicion(actor,before,'VINCULADA',{trabajador_id:sessionId}),/OPERACION_CAMBIO/);
  assert.ok(!f.state.queries.some(q=>/UPDATE public\.(usuarios |trabajadores )|set_config|SET ROLE|statement_timestamp/.test(q.text)));
  const denied=manualSqlFixture({role:'authenticated'});denied.state.op=before;
  await assert.rejects(denied.store.transicion(actor,before,'VINCULADA',{trabajador_id:sessionId}),/CONTEXTO_SQL/);
  assert.equal(denied.state.updates.length,0);
});
test('INV-28: store real libera/cierra sesión dedicada ante éxito, error y fallo de unlock',async()=>{
  const f=manualSqlFixture();await f.store.serializar('manual@example.invalid',async guard=>{await guard();return true;});
  await assert.rejects(f.store.serializar('manual@example.invalid',async()=>{throw Error('FALLO_CONTROLADO');}),/FALLO_CONTROLADO/);
  assert.equal(f.state.locks.size,0);assert.equal(f.state.sessions,f.state.closes);assert.equal(f.state.releases,2);
  const bad=manualSqlFixture({unlockError:true});await assert.rejects(bad.store.serializar('manual@example.invalid',async()=>true),/CIERRE_NO_CONFIRMADO/);
  assert.equal(bad.state.closes,1);
});

test('INV-28: reconciliación SQL contrasta marca, UUID/correo, perfil y verificación, sin buscar por nombre/correo',async()=>{
  const valid={id:sessionId,email:'manual@example.invalid',email_confirmed_at:'2026-11-13',password_configurada:true,marca_coincide:true};
  for(const mode of ['valid','absent','double','marker','email','password','unverified','profile']){
    const options={authRows:mode==='absent'?[]:mode==='double'?[valid,valid]:[{...valid,
      ...(mode==='marker'?{marca_coincide:false}:{}),...(mode==='email'?{email:'ajeno@example.invalid'}:{}),
      ...(mode==='password'?{password_configurada:false}:{})}],unverified:mode==='unverified',
      ...(mode==='profile'?{profile:{id:sessionId,nombre:'Nombre cambiado',estado:true,email:valid.email,rol_id:null,trabajador_id:null}}:{})};
    const f=manualSqlFixture(options),intent=await manualIntent(manualBody());
    f.state.op={...intent,actor_id:id,correlacion_id:sessionId,revision:'2',estado:'REVISION_AUTH',cuenta_id:null,rol_id:id};
    if(mode==='valid')assert.equal(await f.store.reconciliarAuth(actor,structuredClone(f.state.op)),sessionId);
    else if(mode==='absent')assert.equal(await f.store.reconciliarAuth(actor,structuredClone(f.state.op)),null);
    else await assert.rejects(f.store.reconciliarAuth(actor,structuredClone(f.state.op)));
    const query=f.state.queries.find(q=>q.text.includes('raw_app_meta_data'));
    assert.ok(query.text.includes("'solicitud_id'="));assert.ok(query.text.includes("'correlacion_id'="));
    assert.ok(!query.text.includes('raw_user_meta_data'));assert.ok(!query.text.includes('WHERE lower(email)'));
    assert.ok(!JSON.stringify(f.state.queries).includes('CLAVE_'));assert.equal(f.state.updates.length,0);
  }
});

test('INV-34: marca exacta pasa por serialización de parámetro antes de reconciliar AUTH_EN_CURSO',async()=>{
  const {f,body}=await contextoInv33();
  const options={authDocument:{id:f.s.auth.id,email:'manual@example.invalid',email_confirmed_at:'2026-11-13',password_configurada:true,
    marker:manualMarca(f.s.op)},profile:{id:f.s.auth.id,nombre:body.nombre,email:'manual@example.invalid',estado:true,rol_id:null,trabajador_id:null}};
  const sql=manualSqlFixture(options);sql.state.op=structuredClone(f.s.op);
  // Usar la implementación real del store para la reconciliación, no un
  // mock que devuelva marca_coincide=true sin serializar el parámetro.
  f.store.reconciliarAuth=(a,op)=>sql.store.reconciliarAuth(a,op);
  const result=await f.run(body);
  assert.equal(result.estado,'COMPLETADA');assert.equal(result.cuenta_id,options.authDocument.id);
  assert.equal(f.s.creates,0);assert.equal(f.s.links,1);assert.equal(f.s.approvals,1);
  assert.equal(f.s.op.solicitud_id,'17add781-fc90-41e2-8447-42b5910e3fda');
  assert.ok(sql.state.queries.some(q=>q.text.includes('= ?::text::jsonb')));
  assert.equal((await f.run(body)).completada,true);
  assert.equal(f.s.creates,0);assert.equal(f.s.links,1);assert.equal(f.s.approvals,1);
});

test('INV-35: ojos compartidos dentro del input mantienen valores, iconos y accesibilidad al limpiar',()=>{
  for(const prefix of ['', 'publicacion/']){
    const f=adminModalFixture(prefix,true,true);f.c.adminAbrirNuevoUsuario();
    const html=f.elements.get('admin-nuevo-usuario-dialog').innerHTML;
    for(const id of ['admin-manual-password','admin-manual-password-confirm']){
      const input=f.elements.get(id),eye=f.elements.get('eye-'+id),button=eye.closest('button');
      assert.ok(html.includes("togglePasswordVisibility('"+id+"', 'eye-"+id+"')"));
      assert.ok(html.includes('aria-controls="'+id+'"'));assert.ok(!html.includes('adminAlternarPasswordManual'));
      input.value='SOLO_MEMORIA_INV35';f.c.togglePasswordVisibility(id,eye.id);
      assert.equal(input.value,'SOLO_MEMORIA_INV35');assert.equal(input.type,'text');assert.equal(button.getAttribute('aria-pressed'),'true');
      assert.equal(button.getAttribute('aria-label'),'Ocultar contraseña');assert.equal(eye.querySelector('[data-eye-icon="show"]').style.display,'none');
      assert.equal(input.getAttribute('value'),undefined);assert.ok(!html.includes('SOLO_MEMORIA_INV35'));
    }
    f.c.adminLimpiarPasswordsManual();
    for(const id of ['admin-manual-password','admin-manual-password-confirm']){
      const input=f.elements.get(id),eye=f.elements.get('eye-'+id);
      assert.equal(input.value,'');assert.equal(input.type,'password');assert.equal(eye.closest('button').getAttribute('aria-pressed'),'false');
      assert.equal(eye.querySelector('[data-eye-icon="hide"]').style.display,'none');
    }
    const css=readFileSync(prefix+'css/ui-system.css','utf8');
    assert.ok(css.includes('.admin-manual-password input { padding-right: 3rem; }'));
    assert.ok(css.includes('.admin-manual-password button { min-width: 44px;'));
    assert.ok(css.includes('#admin-manual-recuperar[hidden] { display: none; }'));
    assert.ok(html.includes('dark:border-slate-700'));assert.ok(html.includes('dark:hover:text-slate-200'));
  }
});

test('INV-35: revisar solo aparece con solicitud del actor y no borra recibos inciertos o ilegibles',()=>{
  for(const prefix of ['', 'publicacion/']){
    const f=adminModalFixture(prefix,true,true);f.c.adminAbrirNuevoUsuario();const button=f.elements.get('admin-manual-recuperar');
    assert.equal(button.hidden,true);assert.equal(button.disabled,true);
    const raw=JSON.stringify({version:1,actor:id,body:{accion:'CREAR_USUARIO_MANUAL',solicitud_id:manualBody().solicitud_id}});
    const key=f.c.adminClaveCreacionManual();f.c.sessionStorage.setItem(key,raw);f.c.adminActualizarRecuperacionManual();
    assert.equal(button.hidden,false);assert.equal(button.disabled,false);assert.equal(f.c.sessionStorage.getItem(key),raw);
    f.setAllowed(false);f.c.adminActualizarRecuperacionManual();assert.equal(button.disabled,true);assert.equal(f.c.sessionStorage.getItem(key),raw);
    f.setAllowed(true);f.c.sessionStorage.setItem(key,'{ilegible');f.c.adminActualizarRecuperacionManual();
    assert.equal(button.hidden,true);assert.equal(f.c.sessionStorage.getItem(key),'{ilegible');
    f.c.sessionStorage.setItem(key,JSON.stringify({version:1,actor:sessionId,body:{accion:'CREAR_USUARIO_MANUAL',solicitud_id:id}}));
    f.c.adminActualizarRecuperacionManual();assert.equal(button.hidden,true);
  }
});

test('INV-35: recuperación pendiente permanece visible; COMPLETADA confirmada lo oculta y no reaparece al reabrir',async()=>{
  for(const prefix of ['', 'publicacion/']){
    const f=adminModalFixture(prefix,true,true),ticket={version:1,actor:id,body:{...manualBody()}};
    delete ticket.body.password;delete ticket.body.recuperar;
    f.c.sessionStorage.setItem(f.c.adminClaveCreacionManual(),JSON.stringify(ticket));f.c.adminAbrirNuevoUsuario();
    f.c.window.UsuariosService={getMiEstadoAdministrativo:async()=>({es_admin_permanente:true})};f.c.window.TrabajadoresService={};
    let complete=false,calls=0;f.c.window.supabaseClient={functions:{invoke:async(_name,req)=>{
      calls++;assert.equal(req.body.solicitud_id,ticket.body.solicitud_id);assert.equal(req.body.recuperar,true);assert.equal('password' in req.body,false);
      return {error:null,data:{ok:complete,completada:complete,estado:complete?'COMPLETADA':'REVISION_AUTH',
        solicitud_id:ticket.body.solicitud_id,cuenta_id:complete?id:null,trabajador_id:complete?sessionId:null}};
    }}};
    await f.c.adminEnviarCreacionManual(true);assert.equal(calls,1);assert.equal(f.elements.get('admin-manual-recuperar').hidden,false);
    assert.ok(f.c.sessionStorage.getItem(f.c.adminClaveCreacionManual()));assert.equal(f.elements.get('admin-manual-crear').disabled,true);
    complete=true;await f.c.adminEnviarCreacionManual(true);assert.equal(calls,2);
    assert.equal(f.elements.get('admin-manual-recuperar').hidden,true);assert.equal(f.elements.get('admin-manual-recuperar').disabled,true);
    assert.equal(f.c.sessionStorage.getItem(f.c.adminClaveCreacionManual()),null);
    assert.match(f.elements.get('admin-manual-ficha').textContent,/Cuenta, ficha laboral y rol confirmados/);
    f.c.adminCerrarNuevoUsuario();f.c.adminAbrirNuevoUsuario();assert.equal(f.elements.get('admin-manual-recuperar').hidden,true);assert.equal(calls,2);
  }
});

test('INV-25: cambiar nombre durante consulta descarta resultado anterior sin confirmar ni crear',async()=>{
  const f=adminModalFixture();f.c.adminAbrirNuevoUsuario();const name=f.elements.get('admin-manual-nombre');name.value='Persona inicial';
  let finish,confirmations=0;f.c.window.UsuariosService={getMiEstadoAdministrativo:async()=>({es_admin_permanente:true})};
  f.c.window.TrabajadoresService={getTrabajadores:async()=>new Promise(r=>finish=r),listarVinculosCuentas:async()=>[]};
  f.c.adminConfirmarFichaAprobacion=async()=>{confirmations++;return {accion:'CREAR_Y_VINCULAR'};};
  const a=f.c.adminPlanificarFichaManual();await new Promise(setImmediate);name.value='Otra persona';f.c.adminInvalidarFichaManual();finish([]);await a;
  assert.equal(confirmations,0);assert.equal(vm.runInContext('adminManualPlan',f.c),null);
});
import { institutionalInput, createInstitutionalService, createInstitutionalStorage, createInstitutionalHandler, createInstitutionalStore } from '../supabase/functions/usuario-invitaciones/documentos.mjs';
const docInput=()=>({accion:'SUBIR_DOCUMENTO_INSTITUCIONAL',documento_id:id,cuenta_id:sessionId,nombre:'Archivo.pdf',mime:'application/pdf',contenido_base64:btoa('%PDF-prueba')});
const docRow=async()=>{const i=await institutionalInput(docInput());return {id,cuenta_id:sessionId,creado_por:id,propiedad_institucional:true,subida_institucional_intentada_en:'2026-11-15T12:00:00Z',
  sha256_institucional_declarado:i.sha,tamano_bytes_declarado:i.size,mime_type_declarado:i.mime,nombre_original:i.nombre,bucket_id:'documentos-cuentas',storage_path:'cuentas/'+sessionId+'/'+id,estado_reserva:'pendiente'};};
test('375K.5 documental: mapea solo rechazo SQL exacto de eliminación pendiente sin publicar mensajes',async()=>{
 for(const [code,message,blocked]of [
   ['55000','REGISTRO_RELACIONADO_EN_ELIMINACION_V2',true],
   ['P0001','REGISTRO_RELACIONADO_EN_ELIMINACION_V2',false],
   ['55000','REGISTRO_RELACIONADO_EN_ELIMINACION_V2\nSQL PRIVADO',false],
 ]){
  const handler=createInstitutionalHandler({enabled:true,origins:[origin],authenticate:async()=>({id,sessionId}),authorize:async()=>{},
   execute:async()=>{throw Object.assign(Error(message),{code,detail:'JWT PRIVADO'});}});
  const r=await handler(new Request(PROJECT_URL+'/functions/v1/usuario-invitaciones/documentos',{method:'POST',
   headers:{origin,authorization:'Bearer sintetico','content-type':'application/json'},body:JSON.stringify(docInput())}));
  const body=await r.json();assert.equal(r.status,blocked?409:503);
  assert.equal(body.error,blocked?'DOCUMENTO_BLOQUEADO_POR_ELIMINACION':'DOCUMENTO_RESULTADO_NO_CONFIRMADO');
  assert.equal(body.requiere_revision,true);assert.equal(body.no_reintentar_automaticamente,true);assert(!JSON.stringify(body).includes('PRIVADO'));
 }
});
test('236 institucional: entrada exacta, UUID estable, firma real y hash calculado en servidor',async()=>{
 const parsed=await institutionalInput(docInput());assert.equal(parsed.id,id);assert.match(parsed.sha,/^[a-f0-9]{64}$/);assert.equal(parsed.size,11);
 for(const change of [{cuenta_id:'otro'},{mime:'text/plain'},{contenido_base64:btoa('no-pdf')},{creado_por:id},{contenido_base64:'***'}])
  await assert.rejects(institutionalInput({...docInput(),...change}));
 assert.deepEqual(await institutionalInput({accion:'REVISAR_DOCUMENTO_INSTITUCIONAL',documento_id:id}),{id,revisar:true});
});
test('236 institucional: reserva antes de POST, recuperación sin otro envío y hash alterado bloqueado',async()=>{
 const row=await docRow(),events=[];let saved=false,uploads=0,confirms=0,corrupt=false;
 const execute=createInstitutionalService({authorize:async()=>{events.push('auth')},store:{
  prepare:async()=>{events.push('reserve');const upload=!saved;saved=true;return {row,upload}},
  inspect:async()=>({row,object:{id:sessionId,version:'1'}}),confirm:async()=>{confirms++}
 },storage:{upload:async()=>{uploads++;events.push('post')},download:async()=>new TextEncoder().encode(corrupt?'%PDF-otross':'%PDF-prueba')}});
 assert.equal((await execute({body:docInput(),actor,token:'real'})).habilita_auth,false);
 assert.ok(events.indexOf('reserve')<events.indexOf('post'));assert.equal(uploads,1);assert.equal(confirms,1);
 await execute({body:{accion:'REVISAR_DOCUMENTO_INSTITUCIONAL',documento_id:id},actor,token:'real'});
 await execute({body:docInput(),actor,token:'real'});assert.equal(uploads,1);assert.equal(confirms,3);
 corrupt=true;await assert.rejects(execute({body:{accion:'REVISAR_DOCUMENTO_INSTITUCIONAL',documento_id:id},actor,token:'real'}));assert.equal(confirms,3);
});
test('236 institucional: respuesta POST perdida conserva reserva y revisión nunca repite POST',async()=>{
 const row=await docRow();let uploads=0,saved=false;
 const execute=createInstitutionalService({authorize:async()=>{},store:{prepare:async()=>{assert.equal(saved,false);saved=true;return {row,upload:true}},inspect:async()=>({row,object:{}}),confirm:async()=>{}},
 storage:{upload:async()=>{uploads++;throw Error('respuesta perdida')},download:async()=>new TextEncoder().encode('%PDF-prueba')}});
 await assert.rejects(execute({body:docInput(),actor,token:'real'}));assert.equal(saved,true);
 const r=await execute({body:{accion:'REVISAR_DOCUMENTO_INSTITUCIONAL',documento_id:id},actor,token:'real'});assert.equal(r.ok,true);assert.equal(uploads,1);
});
test('236 institucional: autorización fallida no reserva; permanente y delegado siguen el mismo permiso documental',async()=>{
 for(const allowed of [false,true]){let writes=0;const row=await docRow();const execute=createInstitutionalService({authorize:async()=>{if(!allowed)throw new InvitationError('DOCUMENTO_NO_AUTORIZADO',403)},
 store:{prepare:async()=>{writes++;return {row,upload:false}},inspect:async()=>({row}),confirm:async()=>{}},storage:{download:async()=>new TextEncoder().encode('%PDF-prueba')}});
 if(!allowed)await assert.rejects(execute({body:docInput(),actor,token:'real'}));else assert.equal((await execute({body:docInput(),actor,token:'real'})).ok,true);
 assert.equal(writes,Number(allowed));}
 const text=readFileSync(new URL('../supabase/functions/usuario-invitaciones/index.ts',import.meta.url),'utf8');
 assert.match(text,/client.rpc\('es_administrador_actual'\)/);assert.match(text,/USUARIO_DOCUMENTOS_INSTITUCIONALES_HABILITADA'\) === 'true'/);
});
test('236 institucional: compuerta independiente cerrada, Origin/JWT y errores sin secretos',async()=>{
 let executions=0;const request=(o=origin)=>new Request(PROJECT_URL+'/functions/v1/usuario-invitaciones/documentos',{method:'POST',headers:{origin:o,authorization:'Bearer token', 'content-type':'application/json'},body:JSON.stringify(docInput())});
 const handler=opts=>createInstitutionalHandler({origins:[origin],authenticate:async()=>actor,authorize:async()=>{},execute:async()=>{executions++;return {ok:true,habilita_auth:false}},...opts});
 assert.equal((await handler({})(request())).status,503);assert.equal(executions,0);
 assert.equal((await handler({enabled:true})(request('https://otro.test'))).status,403);assert.equal(executions,0);
 assert.equal((await handler({enabled:true,authenticate:async()=>{throw new InvitationError('SESION_INVALIDA',401)}})(request())).status,401);
 assert.equal((await handler({enabled:true})(request())).status,200);assert.equal(executions,1);
 const r=await handler({enabled:true,execute:async()=>{throw Error('SECRET JWT SQL')}})(request());assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/SECRET|JWT|SQL/);
});
test('236 institucional: Storage usa solo POST único y GET acotado, sin upsert ni DELETE',async()=>{
 const row=await docRow(),calls=[];const storage=createInstitutionalStorage(()=> 'secret-in-server',async(url,init)=>{calls.push({url,init});return new Response(init.method==='GET'?'%PDF-prueba':'{}',{status:200})});
 await storage.upload(row,await institutionalInput(docInput()));assert.equal(calls[0].init.headers['x-upsert'],'false');
 assert.equal((await storage.download(row)).length,11);assert.deepEqual(calls.map(c=>c.init.method),['POST','GET']);
 assert(calls.every(c=>c.init.redirect==='error'&&c.url.startsWith(PROJECT_URL+'/storage/v1/object/')));
 const overflow=createInstitutionalStorage(()=> 'secret-in-server',async()=>new Response('%PDF-pruebaextra'));
 await assert.rejects(overflow.download(row));
});
test('236 institucional: store no convierte cuenta ajena ni documento personal y valida revisión final',async()=>{
 const row=await docRow(),input=await institutionalInput(docInput());let updates=0;
 const transaction=async(_,fn)=>fn(async(parts,...values)=>{
  const sql=parts.join('?');if(sql.includes('institucional_contexto'))return [];
  if(sql.includes('FROM public.cuentas_documentos'))return [row];
  if(sql.includes('FROM storage.objects'))return [{id:sessionId,version:'v1',owner:null,owner_id:null,metadata:{size:11,mimetype:'application/pdf'}}];
  if(sql.includes('UPDATE public.cuentas_documentos')){updates++;return [{id}]};throw Error(sql);
 });
 const store=createInstitutionalStore(transaction);
 assert.equal((await store.prepare(actor,input)).upload,false);
 row.propiedad_institucional=false;await assert.rejects(store.prepare(actor,input));row.propiedad_institucional=true;
 row.creado_por=sessionId;await assert.rejects(store.inspect(actor,id));row.creado_por=id;
 const before=await store.inspect(actor,id);await store.confirm(actor,before,input.sha);assert.equal(updates,1);
 before.object.version='otra';await assert.rejects(store.confirm(actor,before,input.sha));assert.equal(updates,1);
});
test('236 institucional: dos solicitudes concurrentes reservan una sola subida y el permiso se valida antes de leer cuerpo',async()=>{
 const row=await docRow();let claimed=false,posts=0;
 const execute=createInstitutionalService({authorize:async()=>{},store:{prepare:async()=>{const upload=!claimed;claimed=true;return {row,upload}},inspect:async()=>({row}),confirm:async()=>{}},
 storage:{upload:async()=>{posts++;await new Promise(resolve=>setTimeout(resolve,5))},download:async()=>new TextEncoder().encode('%PDF-prueba')}});
 await Promise.all([execute({body:docInput(),actor,token:'real'}),execute({body:docInput(),actor,token:'real'})]);assert.equal(posts,1);
 let executed=false;const handler=createInstitutionalHandler({enabled:true,origins:[origin],authenticate:async()=>actor,
  authorize:async()=>{throw new InvitationError('DOCUMENTO_NO_AUTORIZADO',403)},execute:async()=>{executed=true}});
 const response=await handler(new Request(PROJECT_URL+'/functions/v1/usuario-invitaciones/documentos',{method:'POST',headers:{origin,authorization:'Bearer token','content-type':'application/json'},body:'no es JSON'}));
 assert.equal(response.status,403);assert.equal(executed,false);
});
test('236 institucional: falta contrato SQL o destinatario válido impide reservar y no toca Storage',async()=>{
 const input=await institutionalInput(docInput());let inserts=0;
 for(const missing of [true,false]){
  const transaction=async(_,fn)=>fn(async(parts)=>{
   const sql=parts.join('?');if(sql.includes('institucional_contexto')){if(missing)throw Error('contrato ausente');return [];}
   if(sql.includes('FROM public.cuentas_documentos'))return [];
   if(sql.includes('JOIN public.roles'))return [];
   if(sql.includes('INSERT'))inserts++;
   throw Error('No se debe llegar');
  });
  await assert.rejects(createInstitutionalStore(transaction).prepare(actor,input));
 }
 assert.equal(inserts,0);
});
import { migrationInput, createMigrationService, createMigrationStorage } from '../supabase/functions/usuario-invitaciones/documentos.mjs';
async function migrationFixture(){
 const original={...(await docRow()),propiedad_institucional:false,storage_path:'cuentas/'+sessionId+'/'+id,storage_object_id:sessionId,storage_version:'v0',
  sha256_verificado:(await institutionalInput(docInput())).sha,tamano_bytes_verificado:11,mime_type_verificado:'application/pdf'};
 const op='20000000-0000-4000-8000-000000000001',newId='20000000-0000-4000-8000-000000000002';
 let m=null,sourcePresent=true,destPresent=false,corrupt=false,copyLost=false,removeLost=false;
 const events=[];
 const store={transition:async(_,action,doc,operation,proof)=>{
  events.push(action);assert.equal(doc,id);
  if(action==='PREPARAR'){m??={version:1,documento_id:id,operacion_id:op,original,estado:'PREPARADA',revision:1,intentos_retiro:0,destino_path:original.storage_path+'/institucional/'+op};return structuredClone(m);}
  assert.equal(operation,op);if(action==='LEER')return structuredClone(m);
  const states={INICIAR_COPIA:['PREPARADA','COPIA_EN_CURSO'],CERTIFICAR_COPIA:['COPIA_EN_CURSO','COPIA_VERIFICADA'],ASOCIAR:['COPIA_VERIFICADA','ASOCIADA'],INICIAR_RETIRO:['ASOCIADA','RETIRO_EN_CURSO'],REGISTRAR_AUSENCIA:['RETIRO_EN_CURSO','COMPLETADA']};
  assert.equal(m.estado,states[action][0]);m.estado=states[action][1];m.revision++;
  if(action==='CERTIFICAR_COPIA')m.nuevo={id:proof.nuevo_id,version:proof.nuevo_version};if(action==='INICIAR_RETIRO')m.intentos_retiro=1;
  return structuredClone(m);
 },inspect:async()=>({original:sourcePresent?{id:sessionId,version:'v0',bucket_id:'documentos-cuentas',name:original.storage_path,owner_id:id}:null,
  nuevo:destPresent?{id:newId,version:'v1',bucket_id:'documentos-cuentas',name:m.destino_path,owner:null,owner_id:null,metadata:{size:11,mimetype:'application/pdf'}}:null})};
 const storage={readAuthorized:async()=>({tamano_bytes:11,sha256:original.sha256_verificado}),download:async(_,dest)=>new TextEncoder().encode(corrupt&&dest?'%PDF-otrosx':'%PDF-prueba'),
  copy:async()=>{events.push('HTTP_COPY');destPresent=true;if(copyLost)throw Error('respuesta perdida');},
  removeOriginal:async()=>{events.push('HTTP_DELETE');sourcePresent=false;if(removeLost)throw Error('respuesta perdida');},originalAbsent:async()=>!sourcePresent};
 const execute=createMigrationService({store,storage,authorize:async()=>{}});
 const call=(action,extra={})=>execute({body:{accion:action,documento_id:id,...(action==='PREPARAR'?{}:{operacion_id:op}),...extra},actor,token:'JWT-validado'});
 return {call,events,original,storage,get:()=>m,setCorrupt:v=>corrupt=v,setCopyLost:v=>copyLost=v,setRemoveLost:v=>removeLost=v};
}
test('258 migración: fases separadas, UUID y autor originales; nunca borrar al copiar/asociar',async()=>{
 const f=await migrationFixture(),before=JSON.stringify(f.original);
 assert.equal((await f.call('PREPARAR')).completada,false);
 assert.equal((await f.call('COPIAR')).estado,'COPIA_VERIFICADA');assert(!f.events.includes('HTTP_DELETE'));
 assert.equal((await f.call('ASOCIAR')).estado,'ASOCIADA');assert(!f.events.includes('HTTP_DELETE'));
 await assert.rejects(f.call('RETIRAR_ORIGINAL'));assert(!f.events.includes('HTTP_DELETE'));
 const r=await f.call('RETIRAR_ORIGINAL',{confirmar:true});assert.equal(r.estado,'COMPLETADA');assert.equal(r.habilita_auth,false);assert.equal(r.documento_id,id);
 assert.equal(JSON.stringify(f.original),before);assert.equal(f.events.filter(e=>e==='HTTP_COPY').length,1);assert.equal(f.events.filter(e=>e==='HTTP_DELETE').length,1);
});
test('258 migración: copia incierta se reconcilia sin repetir COPY; hash diferente impide asociación',async()=>{
 const f=await migrationFixture();await f.call('PREPARAR');f.setCopyLost(true);await assert.rejects(f.call('COPIAR'));
 await assert.rejects(f.call('COPIAR'));assert.equal(f.events.filter(e=>e==='HTTP_COPY').length,1);
 assert.equal((await f.call('REVISAR')).estado,'COPIA_VERIFICADA');f.setCorrupt(true);await assert.rejects(f.call('ASOCIAR'));
 assert.equal(f.get().estado,'COPIA_VERIFICADA');assert(!f.events.includes('HTTP_DELETE'));
});
test('258 migración: pérdida tras DELETE se recupera con ausencia y copia física, sin repetir borrado',async()=>{
 const f=await migrationFixture();await f.call('PREPARAR');await f.call('COPIAR');await f.call('ASOCIAR');f.setRemoveLost(true);
 await assert.rejects(f.call('RETIRAR_ORIGINAL',{confirmar:true}));assert.equal(f.get().estado,'RETIRO_EN_CURSO');
 assert.equal((await f.call('REVISAR')).estado,'COMPLETADA');assert.equal(f.events.filter(e=>e==='HTTP_DELETE').length,1);
});
test('258 migración: concurrencia, sesión denegada, compuerta cerrada y parámetros extra fallan cerrados',async()=>{
 const f=await migrationFixture();await f.call('PREPARAR');const r=await Promise.allSettled([f.call('COPIAR'),f.call('COPIAR')]);assert(r.some(x=>x.status==='rejected'));assert.equal(f.events.filter(e=>e==='HTTP_COPY').length,1);
 assert.throws(()=>migrationInput({accion:'PREPARAR',documento_id:id,actor_id:id}));
 const handler=createInstitutionalHandler({origins:[origin],disabledCode:'MIGRACION_DOCUMENTAL_DESHABILITADA',authenticate:()=>assert.fail('No autenticar con gate cerrado'),execute:()=>assert.fail('No ejecutar')});
 const response=await handler(new Request(PROJECT_URL+'/functions/v1/usuario-invitaciones/migracion-documentos',{method:'POST',headers:{origin}}));assert.equal((await response.json()).error,'MIGRACION_DOCUMENTAL_DESHABILITADA');
 const denied=createMigrationService({store:{transition:()=>assert.fail('No SQL')},storage:{},authorize:async()=>{throw Error('sin permiso')}});await assert.rejects(denied({body:{accion:'PREPARAR',documento_id:id},actor,token:'invalid'}));
});
test('258 migración: API copia sin overwrite y retirada solo del original autorizado, sin RPC220',async()=>{
 const f=await migrationFixture();await f.call('PREPARAR');const m=structuredClone(f.get()),requests=[];
 const api=createMigrationStorage(()=> 'secret-only-server',async(url,opts)=>{requests.push({url,opts});return new Response('{}',{status:200})});
 m.estado='COPIA_EN_CURSO';m.intentos_copia=1;await api.copy(m);assert.equal(JSON.parse(requests[0].opts.body).upsert,false);assert.equal(JSON.parse(requests[0].opts.body).sourceKey,m.original.storage_path);
 await assert.rejects(api.removeOriginal(m));m.estado='RETIRO_EN_CURSO';m.intentos_retiro=1;await api.removeOriginal(m);
 assert.deepEqual(JSON.parse(requests[1].opts.body).prefixes,[m.original.storage_path]);assert.equal(requests[1].opts.method,'DELETE');
 assert(requests.every(r=>r.url.startsWith(PROJECT_URL+'/storage/v1/object/')));
});

test('258 migración: denegación de lectura humana o fallo antes del DELETE conserva el original y no anuncia éxito',async()=>{
 const f=await migrationFixture();await f.call('PREPARAR');await f.call('COPIAR');await f.call('ASOCIAR');
 const previous=f.storage.readAuthorized;f.storage.readAuthorized=async()=>{throw Error('RLS denegado')};
 await assert.rejects(f.call('RETIRAR_ORIGINAL',{confirmar:true}));assert.equal(f.get().estado,'ASOCIADA');assert(!f.events.includes('HTTP_DELETE'));
 f.storage.readAuthorized=previous;f.storage.removeOriginal=async()=>{throw Error('corte antes de enviar')};
 await assert.rejects(f.call('RETIRAR_ORIGINAL',{confirmar:true}));assert.equal(f.get().estado,'RETIRO_EN_CURSO');
 await assert.rejects(f.call('REVISAR'));assert.equal(f.get().estado,'RETIRO_EN_CURSO');assert(!f.events.includes('HTTP_DELETE'));
});
