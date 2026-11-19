// INV-05: preparación local. No desplegar ni abrir pantallas sin autorización.
import postgres from 'npm:postgres@3.4.5';
import { createInstitutionalStore, createInstitutionalStorage, createInstitutionalService, createInstitutionalHandler, createMigrationStore, createMigrationStorage, createMigrationService } from './documentos.mjs';
import { createClient } from 'npm:@supabase/supabase-js@2.102.0';
import { createDatabaseProvider, databaseUrlFromEnvironment } from '../usuario-eliminacion-previsualizar/database-safety.mjs';
import { createInvitationHandler, createInvitationAuthenticator, createRestrictedFetch, PROJECT_URL, DESTINO_INVITACION, destinoInvitacionConfigurado, createManualRpcFetch, createManualActorAuthorizer, InvitationError } from './invitaciones.mjs';
import { createInvitationStore, createDirectInvitationSession } from './postgres-store.mjs';
import { createManualStore } from './manual-store.mjs';
import { createManualService, createManualAuthFetch, exigirCorreoManual } from './manual.mjs';

function databaseSelection() {
  // Override exclusivo de esta Edge: nunca exigir cambios al secreto de eliminación.
  const own = Deno.env.get('USUARIO_INVITACIONES_DATABASE_URL');
  return own === undefined ? databaseUrlFromEnvironment((name: string) => Deno.env.get(name))
    : { url: own, source: 'USUARIO_INVITACIONES_DATABASE_URL' };
}
const database = createDatabaseProvider({ postgres, databaseUrl: databaseSelection });
const invitationSession = createDirectInvitationSession({ postgres, databaseUrl: databaseSelection });
const store = createInvitationStore(database, invitationSession);
function publicKey(): string {
  if (Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '') !== PROJECT_URL) throw Error('CONFIGURACION_INVALIDA');
  const key = Deno.env.get('SUPABASE_ANON_KEY')?.trim() || JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default;
  if (typeof key !== 'string' || !key) throw Error('CONFIGURACION_INVALIDA');
  return key;
}
const authenticate = createInvitationAuthenticator(() => createClient(PROJECT_URL, publicKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: createRestrictedFetch() } }));
const manualAuthorize = createManualActorAuthorizer((token: string) => createClient(PROJECT_URL, publicKey(), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { Authorization: 'Bearer ' + token }, fetch: createManualRpcFetch() }
}));
const manualHumanClient = (token: string) => createClient(PROJECT_URL, publicKey(), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { Authorization: 'Bearer ' + token }, fetch: createManualRpcFetch(fetch, true) }
});
const manualStore = createManualStore({ database, sessionFactory: invitationSession });
const manualPolicy = () => ({ modo: Deno.env.get('USUARIO_CREACION_MANUAL_MODO'),
  correoEnsayo: Deno.env.get('USUARIO_CREACION_MANUAL_CORREO_ENSAYO') });
const manualExecute = createManualService({ store: manualStore, authorize: manualAuthorize, humanClient: manualHumanClient,
  policy: manualPolicy,
  createUser: async (attributes: { email: string; password: string; email_confirm: boolean; user_metadata: object; app_metadata: object }) => {
    if (Deno.env.get('USUARIO_CREACION_MANUAL_HABILITADA') !== 'true') throw Error('CREACION_MANUAL_DESHABILITADA');
    exigirCorreoManual(manualPolicy(), attributes.email);
    publicKey();
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;
    if (typeof key !== 'string' || !key) throw Error('CONFIGURACION_INVALIDA');
    const client = createClient(PROJECT_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: createManualAuthFetch(PROJECT_URL) }
    });
    return await client.auth.admin.createUser(attributes);
  }
});
async function enviarInvitacion(email: string, redirectTo: string) {
  // Requiere dos compuertas explícitas y una sesión PostgreSQL directa verificada.
  if (redirectTo !== DESTINO_INVITACION) throw Error('DESTINO_NO_PERMITIDO');
  const destino = destinoInvitacionConfigurado(Deno.env.get('USUARIO_INVITACIONES_DESTINO'));
  publicKey();
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;
  if (typeof key !== 'string' || !key) throw Error('CONFIGURACION_INVALIDA');
  const admin = createClient(PROJECT_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: createRestrictedFetch() } });
  return await admin.auth.admin.inviteUserByEmail(email, { redirectTo: destino });
}

const origins = (Deno.env.get('USUARIO_INVITACIONES_ORIGENES') || '').split(',').map(s => s.trim()).filter(Boolean);
const validOrigins = origins.filter(origin => {
  try { const url = new URL(origin); return url.origin === origin &&
    (origin === 'https://pruebaelalmendro.vercel.app' || ['http://127.0.0.1:5500', 'http://localhost:5500'].includes(origin)); }
  catch { return false; }
});
const invitationHandler = createInvitationHandler({ enabled: Deno.env.get('USUARIO_INVITACIONES_HABILITADA') === 'true',
  allowInvites: Deno.env.get('USUARIO_INVITAR_HABILITADO') === 'true',
  diagnosticEnabled: Deno.env.get('USUARIO_INVITACIONES_DIAGNOSTICO_HABILITADO') === 'true',
  manualEnabled: Deno.env.get('USUARIO_CREACION_MANUAL_HABILITADA') === 'true', manualAuthorize, manualExecute,
  origins: validOrigins.length === origins.length ? validOrigins : [], authenticate, store, enviarInvitacion });

// Ruta aislada; no depende de compuertas de invitación ni cambia sus acciones.
const institutionalAuthorize = async (token: string, actor: { id: string }) => {
    // Conserva Administrador actual (permanente o delegación válida), no autorización de invitaciones.
    const client = createClient(PROJECT_URL, publicKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: 'Bearer ' + token } }
    });
    const identity = await client.auth.getUser(token);
    const permission = await client.rpc('es_administrador_actual');
    if (identity.error || identity.data?.user?.id !== actor.id || permission.error || permission.data !== true)
      throw new InvitationError('DOCUMENTO_NO_AUTORIZADO',403);
  };
const institutionalStorageKey = () => {
    publicKey();
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;
    if (typeof key !== 'string' || !key) throw Error('CONFIGURACION_INVALIDA');
    return key;
};
const institutionalExecute = createInstitutionalService({
  store: createInstitutionalStore(store.conDocumentoInstitucional),
  storage: createInstitutionalStorage(institutionalStorageKey),
  authorize: institutionalAuthorize
});
const institutionalHandler = createInstitutionalHandler({
  enabled: Deno.env.get('USUARIO_DOCUMENTOS_INSTITUCIONALES_HABILITADA') === 'true',
  origins: validOrigins.length === origins.length ? validOrigins : [], authenticate, authorize: institutionalAuthorize, execute: institutionalExecute
});
const migrationHandler = createInstitutionalHandler({
  enabled: Deno.env.get('USUARIO_DOCUMENTOS_MIGRACION_HABILITADA') === 'true',
  disabledCode: 'MIGRACION_DOCUMENTAL_DESHABILITADA', maxBodyBytes: 2048,
  origins: validOrigins.length === origins.length ? validOrigins : [], authenticate, authorize: institutionalAuthorize,
  execute: createMigrationService({ store: createMigrationStore(store.conDocumentoInstitucional),
    storage: createMigrationStorage(institutionalStorageKey, fetch, publicKey), authorize: institutionalAuthorize })
});
Deno.serve(request => {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  return path.endsWith('/usuario-invitaciones/migracion-documentos') ? migrationHandler(request)
    : path.endsWith('/usuario-invitaciones/documentos') ? institutionalHandler(request) : invitationHandler(request);
});
