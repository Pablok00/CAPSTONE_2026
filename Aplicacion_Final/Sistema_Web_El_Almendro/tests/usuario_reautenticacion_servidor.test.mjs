import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerReauthentication, readServerReauthenticationProof } from '../supabase/functions/usuario-eliminacion-previsualizar/reautenticacion-servidor.mjs';
const A = '11111111-1111-4111-8111-111111111111', T = '22222222-2222-4222-8222-222222222222';
const R = '33333333-3333-4333-8333-333333333333', S = '44444444-4444-4444-8444-444444444444';
const input = { usuario_id: T, operacion_id: R, nombre_confirmacion: 'Cuenta sintética', motivo: 'Motivo suficiente de prueba', confirmacion: true };
const issued = Date.now();
const jwt = (sid, aal = 'aal1') => ['e30', btoa(JSON.stringify({ sub: A, role: 'authenticated', aal, session_id: sid,
  iss: 'https://hgveesryfmcjxpeumzbp.supabase.co/auth/v1', exp: Math.floor(issued / 1000) + 600 })).replaceAll('=', ''), 'firma-sintetica'].join('.');
const authorization = 'Bearer ' + jwt(S);
export function reauthFixture(options = {}) {
  const calls = []; let authentications = 0, signedIn = false;
  const service = createServerReauthentication({ publicKey: options.publicKey || 'sb_publishable_sintetica', now: () => issued,
    authenticate: async () => ({ id: A, permanent: !options.notPermanent && !(options.revoke && authentications++ > 0) }),
    createClient: (url, key, config) => {
      calls.push({ kind: 'client', url, config });
      return { auth: {
        getUser: async () => ({ data: { user: { id: options.wrongIdentity ? T : A, email: 'prueba@example.invalid',
          factors: options.mfa ? [{ status: 'verified' }] : [] } } }),
        signInWithPassword: async params => { calls.push({ kind: 'password', email: params.email });
          if (options.providerError) throw new Error('respuesta privada con token');
          signedIn = !options.badPassword;
          return { error: options.badPassword ? {} : null,
            data: { user: { id: A }, session: { user: { id: A }, access_token: 'token-temporal-sintetico' } } }; },
        signOut: async params => { calls.push({ kind: 'logout', ...params }); return { error: options.logoutError ? {} : null }; },
        // Como Auth JS 2.71.1: ignora argumentos y consulta SU sesión local.
        mfa: { getAuthenticatorAssuranceLevel: async (...args) => {
          calls.push({ kind: 'aal', arguments: args.length, signedIn });
          if (options.mfaQueryError) return { data: null, error: {} };
          const currentLevel = signedIn ? (options.freshAal2 ? 'aal2' : 'aal1') : null;
          return { data: { currentLevel, nextLevel: signedIn && options.mfa ? 'aal2' : currentLevel } };
        } },
      } };
    } });
  return { service, calls, input, authorization: 'Bearer ' + jwt(S, options.oldAal2 ? 'aal2' : 'aal1'), issued };
}
test('Paso 192: contraseña verificada en Auth y prueba opaca vinculada, sin contraseña/JWT en evidencia', async () => {
  const f = reauthFixture(); const proof = await f.service.reauthenticate({ authorization, input, password: 'password-sintetica' });
  const record = await readServerReauthenticationProof(proof, { actorId: A, authorization, input, now: issued });
  assert.equal(record.actor_id, A); assert.equal(record.target_id, T); assert.equal(record.request_id, R);
  assert.equal(record.session_id, S); assert.equal(record.expires_at - record.verified_at, 120000);
  assert.equal(record.consumed_at, null); assert.equal(JSON.stringify(proof), '{}');
  assert(!JSON.stringify(record).includes('password-sintetica')); assert(!JSON.stringify(record).includes(jwt(S)));
  assert.deepEqual(f.calls.find(c => c.kind === 'client').config.auth,
    { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
  assert.deepEqual(f.calls.at(-1), { kind: 'logout', scope: 'local' });
  assert.deepEqual(f.calls.filter(c => c.kind === 'aal'), [{ kind: 'aal', arguments: 0, signedIn: true }]);
});
test('Paso 192: rol insuficiente, identidad distinta, contraseña incorrecta, MFA o cierre fallido bloquean', async () => {
  for (const options of [{ notPermanent: true }, { wrongIdentity: true }, { badPassword: true },
    { mfa: true }, { oldAal2: true }, { revoke: true }, { logoutError: true }, { providerError: true }]) {
    const f = reauthFixture(options);
    await assert.rejects(f.service.reauthenticate({ authorization: f.authorization, input, password: 'sintetica' }),
      error => /^[A-Z_]+$/.test(error.message) && !error.message.includes('privada'));
    if (f.calls.some(c => c.kind === 'password')) assert.equal(f.calls.at(-1).scope, 'local');
  }
});

test('Paso 260: MFA exigido y errores de consulta siguen bloqueando sin rebajar aal2', async () => {
  for (const options of [{ mfa: true }, { oldAal2: true }]) {
    const f = reauthFixture(options);
    await assert.rejects(f.service.reauthenticate({ authorization: f.authorization, input, password: 'sintetica' }), /MFA_ADICIONAL_REQUERIDO/);
    assert.equal(f.calls.at(-1).kind, 'logout');
  }
  const failure = reauthFixture({ mfaQueryError: true });
  await assert.rejects(failure.service.reauthenticate({ authorization, input, password: 'sintetica' }), /MFA_NO_VERIFICABLE/);
  assert.equal(failure.calls.at(-1).kind, 'logout');
  const aal2 = reauthFixture({ oldAal2: true, mfa: true, freshAal2: true });
  await aal2.service.reauthenticate({ authorization: aal2.authorization, input, password: 'sintetica' });
  assert.equal(aal2.calls.at(-1).kind, 'logout');
  const missing = reauthFixture();
  await assert.rejects(missing.service.reauthenticate({ authorization: 'Bearer ' + jwt(S, null), input, password: 'sintetica' }), /MFA_NO_VERIFICABLE/);
  assert(!missing.calls.some(c => c.kind === 'password'));
});
test('Paso 192: prueba no se exporta como JSON, vence y no cambia de actor/objetivo/sesión/operación/motivo', async () => {
  const f = reauthFixture(); const proof = await f.service.reauthenticate({ authorization, input, password: 'sintetica' });
  const base = { actorId: A, authorization, input, now: issued };
  for (const change of [{ actorId: T }, { now: issued + 120000 }, { now: issued - 1 },
    { authorization: 'Bearer ' + jwt(R) }, { input: { ...input, operacion_id: S } },
    { input: { ...input, motivo: 'Otro motivo suficiente' } }, { input: { ...input, usuario_id: S } }])
    await assert.rejects(readServerReauthenticationProof(proof, { ...base, ...change }));
  await assert.rejects(readServerReauthenticationProof(JSON.parse(JSON.stringify(proof)), base));
});
test('Paso 192: no permite clave administrativa en el cliente de reautenticación', async () => {
  const f = reauthFixture({ publicKey: 'sb_secret_no-utilizar' });
  await assert.rejects(f.service.reauthenticate({ authorization, input, password: 'sintetica' }));
  assert.equal(f.calls.length, 0);
});
test('Paso 192: transporte Auth rechaza otro proyecto o rutas fuera de Auth antes de cualquier red', async () => {
  const f = reauthFixture(); await f.service.reauthenticate({ authorization, input, password: 'sintetica' });
  const guardedFetch = f.calls.find(c => c.kind === 'client').config.global.fetch;
  for (const url of ['https://otro.example/auth/v1/token', 'https://hgveesryfmcjxpeumzbp.supabase.co/rest/v1/usuarios'])
    await assert.rejects(guardedFetch(url), /DESTINO_AUTH_NO_ADMITIDO/);
});
