// Preparación local; no desplegada. Ninguna API de eliminación ni Storage de escritura.
import postgres from 'npm:postgres@3.4.5';
import { createHandler, errorInspeccionPorEtapa } from './handler.mjs';
import { isExceptionalTarget, assertExceptionalGate } from './eliminacion-preparar.mjs';
import { createDatabaseProvider, assertCompleteVisibility, databaseUrlFromEnvironment } from './database-safety.mjs';

const EXPECTED_PROJECT = 'https://hgveesryfmcjxpeumzbp.supabase.co';
function setting(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error('Configuración de servidor incompleta');
  return value;
}

function publicApiKey(): string {
  // Compatibilidad con proyectos que aún ofrecen la clave antigua.
  const legacyKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();

  if (legacyKey) return legacyKey;

  // Proyectos actuales: claves publicables agrupadas en JSON.
  let keys: unknown;

  try {
    keys = JSON.parse(setting('SUPABASE_PUBLISHABLE_KEYS'));
  } catch {
    throw new Error('Configuración de servidor incompleta');
  }

  const key =
    keys !== null &&
    typeof keys === 'object' &&
    !Array.isArray(keys)
      ? (keys as Record<string, unknown>).default
      : undefined;

  if (
    typeof key !== 'string' ||
    !key.startsWith('sb_publishable_')
  ) {
    throw new Error('Configuración de servidor incompleta');
  }

  return key;
}

// La conexión se crea perezosamente: solo después de autenticar al solicitante.
// Una instancia por worker; max:1 limita el worker, no cada petición por separado.
const database = createDatabaseProvider({ postgres,
  databaseUrl: () => databaseUrlFromEnvironment((name: string) => Deno.env.get(name)),
});
async function inspect(actor: string, target: string) {
  let etapa = 'CONFIGURACION_DATABASE_URL';
  try {
  const sql: postgres.Sql = database();
  etapa = 'INICIO_TRANSACCION';
  return await sql.begin('isolation level repeatable read read only', async (tx) => {
      // Antes de cualquier lectura de negocio: identidad, privilegios y ausencia de filtrado RLS.
      etapa = 'VERIFICACION_VISIBILIDAD';
      await assertCompleteVisibility(tx);
      // Rol permanente real: catálogo único + perfil habilitado; nunca rol del request.
      etapa = 'CONSULTA_ROL_ADMINISTRADOR';
      const roles = await tx`SELECT id FROM public.roles WHERE lower(btrim(nombre)) = 'administrador'`;
      if (roles.length !== 1) throw new Error('Catálogo administrativo no verificable');
      const role = roles[0].id;
      const [caller] = await tx`SELECT id FROM public.usuarios WHERE id = ${actor}::uuid AND estado IS TRUE AND rol_id = ${role}::uuid`;
      if (!caller) {
        etapa = 'INICIO_TRANSACCION';
        return { callerPermanent: false };
      }
      etapa = 'CONSULTA_DEPENDENCIAS';
      const [row] = await tx`
        SELECT transaction_timestamp() AS checked_at,
          EXISTS(SELECT 1 FROM public.usuarios WHERE id=${target}::uuid AND estado IS TRUE
            AND rol_id IS NULL AND trabajador_id IS NULL) AS exceptional_profile,
          EXISTS(SELECT 1 FROM public.usuarios WHERE id = ${target}::uuid) AS profile_exists,
          EXISTS(SELECT 1 FROM auth.users WHERE id = ${target}::uuid) AS auth_exists,
          EXISTS(SELECT 1 FROM public.usuarios WHERE id = ${target}::uuid AND estado IS TRUE AND rol_id = ${role}::uuid) AS permanent,
          (SELECT count(*)::text FROM public.usuarios WHERE estado IS TRUE AND rol_id = ${role}::uuid) AS admins,
          (SELECT count(*)::text FROM public.mantenciones WHERE responsable_id = ${target}::uuid) AS mantenciones,
          (SELECT count(*)::text FROM public.tareas WHERE responsable_id = ${target}::uuid) AS tareas,
          (SELECT count(*)::text FROM public.prevencion_documentos WHERE creado_por = ${target}::uuid) AS prevencion,
          (SELECT count(*)::text FROM public.trabajadores_documentos WHERE creado_por = ${target}::uuid) AS trabajadores,
          (SELECT count(*)::text FROM public.solicitudes_reactivas WHERE creada_por = ${target}::uuid) AS solicitudes_creadas,
          (SELECT count(*)::text FROM public.solicitudes_reactivas_avisos aviso
            WHERE EXISTS (SELECT 1 FROM public.solicitudes_reactivas solicitud
              WHERE solicitud.id = aviso.solicitud_id AND solicitud.creada_por = ${target}::uuid)) AS avisos_asociados`;
      etapa = 'CONSULTA_STORAGE';
      const [storage] = await tx`
        SELECT count(*)::text AS total,
          count(*) FILTER (WHERE lower(owner_id::text) = ${target})::text AS por_owner_id,
          count(*) FILTER (WHERE lower(owner::text) = ${target})::text AS por_owner
        FROM storage.objects
        WHERE lower(owner_id::text) = ${target} OR lower(owner::text) = ${target}`;
      // Inventario de restricciones: no adivina tablas ni ejecuta SQL dinámico.
      // No demuestra filas vinculadas ni cubre triggers/RPC/referencias sin FK.
      etapa = 'CONSULTA_REFERENCIAS_FK';
      const references = await tx`
        SELECT ns.nspname AS esquema, rel.relname AS tabla, c.conname AS restriccion,
          pg_get_constraintdef(c.oid) AS definicion
        FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        WHERE c.contype = 'f' AND c.confrelid IN ('public.usuarios'::regclass, 'auth.users'::regclass)
        ORDER BY ns.nspname, rel.relname, c.conname`;
      etapa = 'CONSTRUCCION_RESPUESTA';
      const count = (value: unknown) => {
        const result = Number(value);
        if (!Number.isSafeInteger(result) || result < 0) throw new Error('Conteo inválido');
        return result;
      };
      const resultado = {
        callerPermanent: true, targetExists: row.profile_exists, authExists: row.auth_exists,
        ...(isExceptionalTarget(target) ? { exceptionalEligible: row.exceptional_profile === true && row.auth_exists === true,
          exceptionalGateOpen: (() => { try { assertExceptionalGate(target, name => Deno.env.get(name)); return true; } catch { return false; } })() } : {}),
        targetPermanent: row.permanent, permanentCount: count(row.admins), checkedAt: row.checked_at,
        assignments: { mantenciones: count(row.mantenciones), tareas: count(row.tareas), alcance: 'todas_las_filas_sin_inferir_vigencia' },
        storage: { total: count(storage.total), por_owner_id: count(storage.por_owner_id), por_owner: count(storage.por_owner), total_sin_duplicar: true },
        documents: { prevencion: count(row.prevencion), trabajadores: count(row.trabajadores), accion: 'conservar_sin_modificar' },
        historial_solicitudes: { solicitudes_creadas: count(row.solicitudes_creadas), avisos_asociados: count(row.avisos_asociados), accion: 'conservar_sin_modificar' },
        references,
      };
      // Tras el callback, el driver aún debe completar/cerrar la transacción.
      etapa = 'INICIO_TRANSACCION';
      return resultado;
  });
  } catch (error) {
    // Diagnóstico temporal: descartar excepción original y transportar solo una etiqueta permitida.
    throw errorInspeccionPorEtapa(etapa, error);
  }
}

async function authenticate(authorization: string) {
  const url = setting('SUPABASE_URL').replace(/\/$/, '');
  if (url !== EXPECTED_PROJECT) throw new Error('Proyecto inesperado');
  const headers = { apikey: publicApiKey(), Authorization: authorization };
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers, redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (userResponse.status === 401 || userResponse.status === 403) return null;
  if (!userResponse.ok) throw new Error('Auth no verificable');
  const user = await userResponse.json();
  if (!user.id || user.role !== 'authenticated') return null;
  const response = await fetch(`${url}/rest/v1/rpc/mi_estado_administrativo`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}',
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Privilegio no verificable');
  const raw = await response.json();
  const state = Array.isArray(raw) && raw.length === 1 ? raw[0] : !Array.isArray(raw) ? raw : null;
  return { id: user.id, permanent: state?.es_admin_permanente === true };
}

Deno.serve(createHandler({
  authenticate, inspect,
  origins: (Deno.env.get('PREVIEW_ALLOWED_ORIGINS') || '').split(',').map(v => v.trim()).filter(Boolean),
}));
