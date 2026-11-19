// Paso 192. Solo servidor. Cliente Auth aislado, suministrado por el ensamblador futuro.
// No endpoint, env, almacenamiento, logging ni credencial administrativa.
import { validInput } from './eliminacion-preparar.mjs';
import { fingerprint } from './eliminacion-coordinar.mjs';
import { PROJECT_REF } from './database-safety.mjs';
const URL = `https://${PROJECT_REF}.supabase.co`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const proofs = new WeakMap();
const controlled = new WeakSet();
const fail = code => { const e = new Error(code); controlled.add(e); throw e; };
function claims(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return fail('SESION_NO_VERIFICABLE');
    const json = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(json.padEnd(Math.ceil(json.length / 4) * 4, '=')));
  } catch { return fail('SESION_NO_VERIFICABLE'); }
}
function session(token, actorId, now) {
  // Solo llamar DESPUÉS de getUser(token)/authenticate: decodificar no verifica firma.
  const c = claims(token);
  if (c.sub !== actorId || c.role !== 'authenticated' || c.iss !== URL + '/auth/v1' ||
      !UUID.test(c.session_id || '') || !Number.isFinite(c.exp) || c.exp * 1000 <= now)
    return fail('SESION_NO_VERIFICABLE');
  return c.session_id;
}
export function createServerReauthentication({ authenticate, createClient, publicKey, now = Date.now }) {
  async function reauthenticate({ authorization, input, password, purpose = 'inicio' }) {
    let client; let attempted = false; let metadata;
    try {
      if (!['inicio', 'recuperacion'].includes(purpose) || !validInput(input) || typeof password !== 'string' || !password || password.length > 4096 ||
          typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return fail('REAUTENTICACION_INVALIDA');
      input = { ...input, usuario_id: input.usuario_id.toLowerCase(), operacion_id: input.operacion_id.toLowerCase(), motivo: input.motivo.trim() };
      const actor = await authenticate(authorization);
      if (!actor || !UUID.test(actor.id || '') || actor.permanent !== true || actor.id.toLowerCase() === input.usuario_id)
        return fail('SOLO_ADMIN_PERMANENTE');
      const actorId = actor.id.toLowerCase(); const token = authorization.slice(7);
      // No service_role ni Secret key para comprobar contraseña. API Auth usa clave pública.
      if (typeof publicKey !== 'string' || (!publicKey.startsWith('sb_publishable_') && claims(publicKey).role !== 'anon'))
        return fail('CONFIGURACION_AUTH_PUBLICA_NO_VERIFICABLE');
      client = createClient(URL, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: async (resource, init = {}) => {
          const request = new Request(resource, init);
          const endpoint = new globalThis.URL(request.url);
          if (endpoint.origin !== URL || !endpoint.pathname.startsWith('/auth/v1/'))
            return fail('DESTINO_AUTH_NO_ADMITIDO');
          return await fetch(request, { redirect: 'error', signal: AbortSignal.any([
            request.signal, AbortSignal.timeout(10000),
          ]) });
        } },
      });
      const original = await client.auth.getUser(token);
      if (original.error || original.data?.user?.id !== actorId || typeof original.data.user.email !== 'string' || !original.data.user.email)
        return fail('SESION_NO_VERIFICABLE');
      const sessionId = session(token, actorId, now());
      // Auth JS 2.71.1 no acepta JWT en getAuthenticatorAssuranceLevel(): lee
      // SU sesión local. getUser(token) valida el JWT pero no instala esa sesión.
      // Mismo cálculo del SDK, usando el JWT YA validado y factores de getUser.
      const oldLevel = claims(token).aal;
      const originalFactors = original.data.user.factors ?? [];
      if (!['aal1', 'aal2'].includes(oldLevel) || !Array.isArray(originalFactors)) return fail('MFA_NO_VERIFICABLE');
      const oldRequiredLevel = originalFactors.some(factor => factor?.status === 'verified') ? 'aal2' : oldLevel;
      attempted = true;
      const fresh = await client.auth.signInWithPassword({ email: original.data.user.email, password });
      password = ''; // No persistir. No es garantía de borrado físico de strings en memoria JS.
      if (fresh.error || fresh.data?.user?.id !== actorId || fresh.data?.session?.user?.id !== actorId ||
          typeof fresh.data.session.access_token !== 'string') return fail('REAUTENTICACION_RECHAZADA');
      const freshUser = await client.auth.getUser(fresh.data.session.access_token);
      if (freshUser.error || freshUser.data?.user?.id !== actorId) return fail('REAUTENTICACION_RECHAZADA');
      // signInWithPassword sí guarda la sesión nueva en este cliente aislado.
      const freshAal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (freshAal.error || !['aal1', 'aal2'].includes(freshAal.data?.currentLevel) ||
          !['aal1', 'aal2'].includes(freshAal.data?.nextLevel)) return fail('MFA_NO_VERIFICABLE');
      if (freshAal.data.currentLevel !== freshAal.data.nextLevel ||
          (oldRequiredLevel === 'aal2' && freshAal.data.currentLevel !== 'aal2'))
        return fail('MFA_ADICIONAL_REQUERIDO');
      const current = await authenticate(authorization);
      if (current?.id?.toLowerCase() !== actorId || current.permanent !== true) return fail('PRIVILEGIO_CAMBIO');
      const verifiedAt = now();
      if (!Number.isSafeInteger(verifiedAt)) return fail('REAUTENTICACION_INVALIDA');
      // ID de sesión es identificador, no access/refresh token. Nunca guardar contraseñas/JWT/OTP.
      metadata = { proof_id: crypto.randomUUID(), actor_id: actorId, target_id: input.usuario_id,
        request_id: input.operacion_id, fingerprint: await fingerprint(actorId, input), session_id: sessionId,
        verified_at: verifiedAt, expires_at: verifiedAt + 120000, method: 'password', purpose, consumed_at: null };
    } catch (error) {
      if (controlled.has(error)) throw error;
      return fail('REAUTENTICACION_NO_VERIFICABLE');
    } finally {
      password = '';
      if (attempted && client) {
        try { const result = await client.auth.signOut({ scope: 'local' });
          if (result?.error) fail('CIERRE_SESION_TEMPORAL_NO_VERIFICABLE');
        } catch { fail('CIERRE_SESION_TEMPORAL_NO_VERIFICABLE'); }
      }
    }
    const proof = Object.freeze({}); proofs.set(proof, metadata); return proof;
  }
  return Object.freeze({ reauthenticate });
}
export async function readServerReauthenticationProof(proof, { actorId, authorization, input, now = Date.now() }) {
  const record = proofs.get(proof);
  if (!record || !validInput(input) || !Number.isSafeInteger(now) || now < record.verified_at || now >= record.expires_at ||
      actorId !== record.actor_id || input.usuario_id.toLowerCase() !== record.target_id || input.operacion_id.toLowerCase() !== record.request_id ||
      await fingerprint(actorId, input) !== record.fingerprint || typeof authorization !== 'string' ||
      session(authorization.slice(7), actorId, now) !== record.session_id) return fail('REAUTENTICACION_NO_ACREDITADA');
  // El llamante DEBE autenticar este mismo Bearer primero. No autoriza consumo solo por decodificar.
  return structuredClone(record);
}

// Solo tras authenticate/getUser del MISMO Bearer; no verifica firma por sí solo.
export function readAuthenticatedSessionId(authorization, actorId, now = Date.now()) {
  if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))
    return fail('SESION_NO_VERIFICABLE');
  return session(authorization.slice(7), actorId, now);
}
