import { InvitationError, UUID } from './invitaciones.mjs';
import { validateDatabaseUrl, PROJECT_REF } from '../usuario-eliminacion-previsualizar/database-safety.mjs';
const fail = (code, status) => { throw new InvitationError(code, status); };

// Namespace propio INV1, no relacionado con los candados de eliminación.
export const INVITE_LOCK_NAMESPACE = 0x494e5631;
// INVT: exclusivo de diagnóstico, distinto del namespace de correo INV1 y de 209.
export const DIAGNOSTIC_LOCK_NAMESPACE = 0x494e5654;

// Proyección administrativa mínima. Nunca devolver contraseña/hash ni metadata de Auth.
export function estadoInvitacion(authRows, profiles, email, now = Date.now()) {
  const result = (estado, identidad_id = null, espera_segundos = 0) => ({
    estado, email, identidad_id, espera_segundos,
    reenvio_permitido: estado === 'INVITACION_PENDIENTE' && espera_segundos === 0
  });
  if (!authRows.length && !profiles.length) return result('CORREO_NUEVO');
  if (authRows.length !== 1 || profiles.length !== 1) return result('REQUIERE_REVISION');
  const a = authRows[0], p = profiles[0];
  if (!UUID.test(a.id || '') || a.id !== p.id || p.estado !== true ||
      !(p.nombre === null || typeof p.nombre === 'string') ||
      !(p.rol_id === null || UUID.test(p.rol_id || '')) ||
      !(p.trabajador_id === null || UUID.test(p.trabajador_id || '')) || typeof a.password_configurada !== 'boolean')
    return result('REQUIERE_REVISION');
  if (p.rol_id !== null) return result('CUENTA_APROBADA', a.id);
  if (!a.invited_at) return result('REQUIERE_REVISION', a.id);
  if (a.email_confirmed_at) return result(a.password_configurada === true && typeof p.nombre === 'string' && p.nombre.trim()
    ? 'PENDIENTE_APROBACION' : 'REGISTRO_INCOMPLETO', a.id);
  if (p.trabajador_id !== null || p.nombre !== null && String(p.nombre).trim() || a.password_configurada !== false)
    return result('REQUIERE_REVISION', a.id);
  const sent = new Date(a.confirmation_sent_at || a.invited_at).getTime();
  if (!Number.isFinite(sent) || sent > now + 5000) return result('REQUIERE_REVISION', a.id);
  return result('INVITACION_PENDIENTE', a.id, Math.max(0, Math.ceil((sent + 60000 - now) / 1000)));
}

export function createDirectInvitationSession({ postgres, databaseUrl }) {
  return async () => {
    const selected = databaseUrl();
    const config = validateDatabaseUrl(selected.url, selected.source);
    // No inferir afinidad de Supavisor por el puerto. Solo conexión directa acreditable.
    if (config.host !== `db.${PROJECT_REF}.supabase.co`) fail('CONEXION_INVITACION_SIN_AFINIDAD', 503);
    const client = postgres({ ...config, ssl: { rejectUnauthorized: true }, max: 1,
      prepare: false, max_pipeline: 1, connect_timeout: 8, idle_timeout: 0, max_lifetime: 60,
      debug: false, onnotice: () => {} });
    try {
      const sql = await client.reserve();
      return { sql, release: () => sql.release(), close: () => client.end({ timeout: 0 }) };
    } catch (_) {
      try { await client.end({ timeout: 0 }); } catch (_) {}
      fail('CONEXION_INVITACION_NO_CONFIRMADA', 503);
    }
  };
}

export function createInvitationStore(database, invitationSession) {
  // Solo memoria: retiene incertidumbre conocida, sin caducarla ni certificar persistencia.
  const uncertain = new Map();
  let diagnosticRunning = false;
  async function transaction(actor, work, coordinate = true) {
    return await database().begin('isolation level read committed read write', async tx => {
      await tx`SET LOCAL statement_timeout = '8s'`;
      await tx`SET LOCAL lock_timeout = '2s'`;
      await tx`SET LOCAL search_path = pg_catalog, public`;
      const [context] = await tx`SELECT current_user::text AS effective_role, session_user::text AS login_role,
        current_database() AS database_name, current_setting('transaction_isolation') AS isolation,
        current_setting('transaction_read_only') AS read_only,
        (SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user) AS bypass_rls,
        pg_catalog.has_column_privilege(current_user,'public.usuarios','nombre','UPDATE') AS can_update_name`;
      if (context?.effective_role !== 'postgres' || context.login_role !== 'postgres' || context.database_name !== 'postgres' ||
          context.isolation !== 'read committed' || context.read_only !== 'off' || context.bypass_rls !== true || context.can_update_name !== true)
        fail('CONTEXTO_SQL_NO_ACREDITADO', 503);
      // No SET ROLE ni cambios de RLS/permisos. Esta opción falla si RLS ocultara filas.
      await tx`SET LOCAL row_security = off`;
      await tx`SELECT set_config('request.jwt.claim.sub', ${actor.id}, true),
        set_config('request.jwt.claims', ${JSON.stringify({ sub: actor.id, role: 'authenticated', session_id: actor.sessionId })}, true)`;
      const [identity] = await tx`SELECT auth.uid()::text AS actor_id`;
      if (identity?.actor_id !== actor.id) fail('IDENTIDAD_SQL_NO_ACREDITADA', 503);
      // Misma coordinación existente, antes de filas. No esperar con locks parciales.
      if (coordinate) {
        const [lock] = await tx`SELECT pg_try_advisory_xact_lock(209,1) AS acquired`;
        if (lock?.acquired !== true) fail('OPERACION_CONCURRENTE_REVISAR');
      }
      return await work(tx);
    });
  }
  return {
    conDocumentoInstitucional: (actor, work) => transaction(actor, work),
    async diagnosticarConexion(actor) {
      if (diagnosticRunning) fail('DIAGNOSTICO_EN_CURSO', 429);
      if (typeof invitationSession !== 'function') fail('CONEXION_INVITACION_SIN_AFINIDAD', 503);
      const key = crypto.getRandomValues(new Int32Array(1))[0];
      diagnosticRunning = true;
      const sessions = [];
      let problem, cleanupFailed = false, observerClosed = false;
      const checks = { conexion_directa: false, rol_postgres: false, pid_estable: false,
        sesiones_independientes: false, exclusion_confirmada: false, liberacion_confirmada: false,
        readquisicion_confirmada: false, sesiones_prueba_cerradas: false, clientes_descartados: false };
      const inspect = async record => {
        const [row] = await record.sql`SELECT pg_backend_pid() AS pid, current_user::text AS effective_role,
          session_user::text AS login_role, current_database() AS database_name,
          (SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user) AS bypass_rls`;
        if (!Number.isInteger(row?.pid) || row.effective_role !== 'postgres' || row.login_role !== 'postgres' ||
            row.database_name !== 'postgres' || row.bypass_rls !== true) fail('DIAGNOSTICO_CONTEXTO_NO_ACREDITADO', 503);
        if (record.pid !== undefined && record.pid !== row.pid) fail('DIAGNOSTICO_SESION_PERDIDA', 503);
        record.pid = row.pid;
      };
      const open = async () => {
        const session = await invitationSession();
        const record = { session, sql: session.sql, held: false, pid: undefined };
        sessions.push(record);
        await record.sql`SET statement_timeout = '3s'`;
        await inspect(record);
        return record;
      };
      const permanent = async record => {
        const [row] = await record.sql`SELECT EXISTS (
          SELECT 1 FROM public.usuarios u JOIN public.roles r ON r.id=u.rol_id
          WHERE u.id=${actor.id}::uuid AND u.estado IS TRUE
            AND public.normalizar_nombre_rol(r.nombre)='administrador'
        ) AS permitido`;
        if (row?.permitido !== true) fail('SOLO_ADMIN_PERMANENTE', 403);
      };
      const acquire = async record => {
        const [row] = await record.sql`SELECT pg_backend_pid() AS pid,
          pg_try_advisory_lock(${DIAGNOSTIC_LOCK_NAMESPACE}::integer, ${key}::integer) AS acquired`;
        // Si se adquirió pero cambió el backend, el finally descarta la conexión.
        record.held = row?.acquired === true;
        if (row?.pid !== record.pid) fail('DIAGNOSTICO_SESION_PERDIDA', 503);
        return record.held;
      };
      const unlock = async record => {
        await inspect(record);
        const [row] = await record.sql`SELECT pg_advisory_unlock(${DIAGNOSTIC_LOCK_NAMESPACE}::integer, ${key}::integer) AS released`;
        if (row?.released !== true) fail('DIAGNOSTICO_UNLOCK_NO_CONFIRMADO', 503);
        record.held = false;
      };
      const dispose = async record => {
        try {
          await inspect(record);
          if (record.held) await unlock(record);
          record.session.release();
        } catch (_) { cleanupFailed = true; }
        // Siempre termina el cliente privado; nunca se devuelve un lock incierto al pool.
        try { await record.session.close(); } catch (_) { cleanupFailed = true; }
      };
      try {
        const a = await open();
        checks.conexion_directa = true; // La factory real rechaza poolers antes de conectar.
        await permanent(a);
        const b = await open();
        checks.rol_postgres = true;
        if (a.pid === b.pid) fail('DIAGNOSTICO_SESIONES_NO_INDEPENDIENTES', 503);
        checks.sesiones_independientes = true;
        await inspect(a); await inspect(b); checks.pid_estable = true;
        if (!await acquire(a)) fail('DIAGNOSTICO_CLAVE_OCUPADA', 409);
        if (await acquire(b)) fail('DIAGNOSTICO_EXCLUSION_NO_ACREDITADA', 503);
        checks.exclusion_confirmada = true;
        await unlock(a); checks.liberacion_confirmada = true;
        if (!await acquire(b)) fail('DIAGNOSTICO_READQUISICION_FALLIDA', 503);
        checks.readquisicion_confirmada = true;
        await unlock(b);
        await permanent(a); // Revalidación tras todas las esperas relevantes.
      } catch (error) { problem = error; }
      finally {
        // Dos sesiones independientes dedicadas, limpiadas incluso si la segunda falla.
        for (const record of [...sessions].reverse()) await dispose(record);
      }
      try {
        if (cleanupFailed) fail('DIAGNOSTICO_LIMPIEZA_NO_CONFIRMADA', 503);
        if (problem) throw problem;
        // Observador propio: solo comprueba ausencia de los dos PID de prueba.
        // No devuelve PID, usuarios, actividad ajena ni cadenas de conexión.
        let observer;
        try {
          const session = await invitationSession();
          observer = { session, sql: session.sql, held: false, pid: undefined };
          await observer.sql`SET statement_timeout = '3s'`;
          await inspect(observer);
          for (let attempt = 0; attempt < 4; attempt++) {
            const [row] = await observer.sql`SELECT NOT EXISTS (
              SELECT 1 FROM pg_catalog.pg_stat_activity WHERE pid IN (${sessions[0].pid}::integer, ${sessions[1].pid}::integer)
            ) AS cerradas`;
            if (row?.cerradas === true) { checks.sesiones_prueba_cerradas = true; break; }
            if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 100));
          }
          if (!checks.sesiones_prueba_cerradas) fail('DIAGNOSTICO_CIERRE_NO_CONFIRMADO', 503);
        } finally {
          if (observer) { await dispose(observer); observerClosed = !cleanupFailed; }
        }
        if (!observerClosed || cleanupFailed) fail('DIAGNOSTICO_LIMPIEZA_NO_CONFIRMADA', 503);
        checks.clientes_descartados = true;
        return { estado: 'DIAGNOSTICO_CONEXION_OK', comprobaciones: checks };
      } finally { diagnosticRunning = false; }
    },
    async exigirPermanente(actor) {
      return await transaction(actor, async tx => {
        const [user] = await tx`SELECT id,estado,rol_id FROM public.usuarios WHERE id=${actor.id}::uuid FOR SHARE NOWAIT`;
        if (!user || user.estado !== true || !user.rol_id) fail('SOLO_ADMIN_PERMANENTE', 403);
        const [role] = await tx`SELECT id,public.normalizar_nombre_rol(nombre) AS normalizado FROM public.roles WHERE id=${user.rol_id}::uuid FOR SHARE NOWAIT`;
        if (role?.normalizado !== 'administrador') fail('SOLO_ADMIN_PERMANENTE', 403);
        const [helper] = await tx`SELECT public.es_administrador_permanente_actual() AS permitido`;
        if (helper?.permitido !== true) fail('SOLO_ADMIN_PERMANENTE', 403);
      }, false); // Solo lectura de autorización, sin candado de eliminación ni HTTP.
    },
    async completarNombre(actor, nombre) {
      return await transaction(actor, async tx => {
        // Evidencia de la tabla Auth, no raw_user_meta_data ni marcadores del navegador.
        const [auth] = await tx`SELECT id,invited_at,email_confirmed_at,
          (coalesce(encrypted_password,'') <> '') AS password_configurada
          FROM auth.users WHERE id=${actor.id}::uuid FOR SHARE NOWAIT`;
        if (!auth?.invited_at || !auth.email_confirmed_at) fail('INVITACION_NO_ACREDITADA', 403);
        // Solo booleano. El hash nunca sale de PostgreSQL ni se escribe desde esta Edge.
        if (auth.password_configurada !== true) fail('CONTRASENA_NO_CONFIGURADA', 409);
        const [profile] = await tx`SELECT id,nombre,estado,rol_id,trabajador_id FROM public.usuarios WHERE id=${actor.id}::uuid FOR UPDATE NOWAIT`;
        if (!profile || profile.estado !== true || profile.rol_id !== null || profile.trabajador_id !== null) fail('PERFIL_NO_PENDIENTE', 403);
        const empty = profile.nombre === null || typeof profile.nombre === 'string' && profile.nombre.trim() === '';
        if (!empty) {
          if (profile.nombre !== nombre) fail('NOMBRE_DISTINTO_REQUIERE_REVISION');
          return { estado: 'NOMBRE_CONFIRMADO', aplicada: false, reconciliado: true, usuario_id: actor.id, nombre };
        }
        // Único UPDATE. Los triggers se ejecutan normalmente y cualquier error revierte todo.
        const rows = await tx`UPDATE public.usuarios SET nombre=${nombre}
          WHERE id=${actor.id}::uuid AND estado IS TRUE AND rol_id IS NULL AND trabajador_id IS NULL
            AND (nombre IS NULL OR btrim(nombre)='')
          RETURNING id,nombre,estado,rol_id,trabajador_id`;
        const row = rows?.[0];
        if (rows?.length !== 1 || row.id !== actor.id || row.nombre !== nombre || row.estado !== true || row.rol_id !== null || row.trabajador_id !== null)
          fail('ACTUALIZACION_NO_CONFIRMADA', 503);
        return { estado: 'NOMBRE_CONFIRMADO', aplicada: true, reconciliado: false, usuario_id: actor.id, nombre };
      });
    },
    async conInvitacionSerializada(_actor, email, action, options = {}) {
      if (uncertain.has(email)) {
        const error = new InvitationError('INVITACION_RESULTADO_INCIERTO_REVISAR', 202);
        error.evidence = uncertain.get(email); throw error;
      }
      if (uncertain.size >= 256) fail('REVISION_ADMINISTRATIVA_REQUERIDA', 503);
      if (typeof invitationSession !== 'function') fail('CONEXION_INVITACION_SIN_AFINIDAD', 503);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
      const key = new DataView(digest).getInt32(0, false);
      let session, sql, pid, locked = false, actionStarted = false, result, problem, cleanupFailed = false;
      try {
        session = await invitationSession(); sql = session.sql;
        // Todas estas consultas son autocommit. Nunca BEGIN durante la llamada Auth.
        await sql`SET statement_timeout = '8s'`;
        const [context] = await sql`SELECT pg_backend_pid() AS pid, current_user::text AS effective_role,
          session_user::text AS login_role, current_database() AS database_name,
          (SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user) AS bypass_rls`;
        if (!Number.isInteger(context?.pid) || context.effective_role !== 'postgres' || context.login_role !== 'postgres' ||
            context.database_name !== 'postgres' || context.bypass_rls !== true) fail('CONTEXTO_SQL_NO_ACREDITADO', 503);
        pid = context.pid;
        const [lock] = await sql`SELECT pg_backend_pid() AS pid,
          pg_try_advisory_lock(${INVITE_LOCK_NAMESPACE}::integer, ${key}::integer) AS acquired`;
        locked = lock?.acquired === true;
        if (lock?.pid !== pid) fail('SESION_POSTGRES_PERDIDA', 503);
        if (!locked) fail('INVITACION_EN_CURSO_REVISAR');
        let estado;
        if (options.consulta || options.reenviar) {
          const authRows = await sql`SELECT id,invited_at,email_confirmed_at,confirmation_sent_at,
            (coalesce(encrypted_password,'') <> '') AS password_configurada
            FROM auth.users WHERE lower(email)=${email} LIMIT 2`;
          const profiles = await sql`SELECT id,nombre,estado,rol_id,trabajador_id FROM public.usuarios
            WHERE lower(email)=${email} OR id=${authRows[0]?.id || null}::uuid LIMIT 2`;
          estado = estadoInvitacion(authRows, profiles, email);
          if (options.reenviar && (estado.identidad_id !== options.reenviar || !estado.reenvio_permitido))
            fail('REENVIO_NO_AUTORIZADO_REVISAR');
        } else {
          const existing = await sql`SELECT id FROM auth.users WHERE lower(email)=${email} LIMIT 1`;
          const profiles = await sql`SELECT id FROM public.usuarios WHERE lower(email)=${email} LIMIT 1`;
          if (existing.length || profiles.length) fail('CUENTA_EXISTENTE_REVISAR');
        }
        const [current] = await sql`SELECT pg_backend_pid() AS pid`;
        if (current?.pid !== pid) fail('SESION_POSTGRES_PERDIDA', 503);
        actionStarted = !options.consulta;
        result = await action(estado);
      } catch (error) {
        problem = error;
        if (error instanceof InvitationError && error.status === 202) {
          let evidence = 'SIN_EVIDENCIA_CONCLUYENTE';
          try {
            const rows = await sql`SELECT id,invited_at FROM auth.users WHERE lower(email)=${email} LIMIT 1`;
            if (rows[0]) evidence = rows[0].invited_at ? 'IDENTIDAD_INVITADA_ENCONTRADA' : 'CUENTA_ENCONTRADA';
          } catch (_) {}
          // Ausencia de fila no demuestra que Auth/proveedor no sigan procesando.
          uncertain.set(email, evidence); error.evidence = evidence;
        }
      } finally {
        if (session) {
          try {
            const [current] = await sql`SELECT pg_backend_pid() AS pid`;
            if (current?.pid !== pid) throw Error('AFINIDAD_PERDIDA');
            if (locked) {
              const [released] = await sql`SELECT pg_advisory_unlock(${INVITE_LOCK_NAMESPACE}::integer, ${key}::integer) AS released`;
              if (released?.released !== true) throw Error('UNLOCK_NO_CONFIRMADO');
            }
            session.release();
          } catch (_) { cleanupFailed = true; }
          // Siempre destruir el cliente dedicado; no devolver una sesión incierta al pool.
          try { await session.close(); } catch (_) { cleanupFailed = true; }
        }
      }
      if (cleanupFailed && actionStarted) {
        const error = new InvitationError('INVITACION_RESULTADO_INCIERTO_REVISAR', 202);
        error.evidence = 'CIERRE_SESION_NO_CONFIRMADO'; uncertain.set(email, error.evidence); throw error;
      }
      if (cleanupFailed) fail('SESION_POSTGRES_NO_CONFIRMADA', 503);
      if (problem) throw problem;
      return result;
    },
  };
}
