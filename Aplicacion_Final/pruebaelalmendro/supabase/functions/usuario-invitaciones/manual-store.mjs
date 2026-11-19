// INV-28: solo ledger privado y lecturas. Las mutaciones de perfil/ficha/rol
// pertenecen exclusivamente a RPC invocadas mediante el JWT humano real.
import { InvitationError, UUID } from './invitaciones.mjs';
import { INVITE_LOCK_NAMESPACE } from './postgres-store.mjs';
import { manualMarca, MOTIVO_MANUAL } from './manual.mjs';
const fail = (code, status = 409) => { throw new InvitationError(code, status); };
const nextStates = {
  PREPARADA: ['AUTH_EN_CURSO'], AUTH_EN_CURSO: ['AUTH_CONFIRMADA','REVISION_AUTH'],
  REVISION_AUTH: ['AUTH_CONFIRMADA'], AUTH_CONFIRMADA: ['VINCULO_EN_CURSO','VINCULADA'],
  VINCULO_EN_CURSO: ['VINCULADA','REVISION_VINCULO'], REVISION_VINCULO: ['VINCULO_EN_CURSO','VINCULADA'],
  VINCULADA: ['APROBACION_EN_CURSO','COMPLETADA'],
  APROBACION_EN_CURSO: ['REVISION_APROBACION','COMPLETADA'],
  REVISION_APROBACION: ['APROBACION_EN_CURSO','COMPLETADA']
};
export function createManualStore({ database, sessionFactory }) {
  async function txActor(actor, work) {
    return await database().begin('isolation level read committed read write', async tx => {
      await tx`SET LOCAL statement_timeout = '8s'`;
      await tx`SET LOCAL lock_timeout = '2s'`;
      await tx`SET LOCAL search_path = pg_catalog, public`;
      const [context] = await tx`SELECT current_user::text AS rol, session_user::text AS login,
        current_database() AS db, current_setting('transaction_isolation') AS isolation`;
      if (context?.rol !== 'postgres' || context.login !== 'postgres' || context.db !== 'postgres' || context.isolation !== 'read committed')
        fail('CONTEXTO_SQL_NO_ACREDITADO', 503);
      // Nunca set_config JWT ni SET ROLE para sustituir al administrador.
      const admins = await tx`SELECT u.id FROM public.usuarios u JOIN auth.users a ON a.id=u.id
        WHERE u.id=${actor.id}::uuid AND u.estado IS TRUE AND public.es_rol_administrador(u.rol_id)
        FOR SHARE OF u NOWAIT`;
      if (admins.length !== 1) fail('SOLO_ADMIN_PERMANENTE', 403);
      return await work(tx);
    });
  }
  async function current(tx, actor, op) {
    const [row] = await tx`SELECT * FROM public.usuarios_creaciones_manuales_operaciones
      WHERE solicitud_id=${op.solicitud_id}::uuid FOR UPDATE NOWAIT`;
    if (!row || row.actor_id !== actor.id || row.huella_solicitud !== op.huella_solicitud ||
        row.correlacion_id !== op.correlacion_id || String(row.revision) !== String(op.revision) || row.estado !== op.estado)
      fail('CREACION_MANUAL_OPERACION_CAMBIO');
    return row;
  }
  async function identity(tx, op) {
    const marker = JSON.stringify(manualMarca(op));
    const rows = await tx`SELECT id,email,email_confirmed_at,
      (coalesce(encrypted_password,'') <> '') AS password_configurada,
      -- El parámetro ya contiene JSON serializado. Forzar TEXT antes del cast
      -- evita que postgres@3.4.5 lo vuelva a serializar como cadena JSONB.
      (raw_app_meta_data->'creacion_manual_v1' = ${marker}::text::jsonb) AS marca_coincide
      FROM auth.users WHERE
      raw_app_meta_data->'creacion_manual_v1'->>'solicitud_id'=${op.solicitud_id}
      OR raw_app_meta_data->'creacion_manual_v1'->>'correlacion_id'=${op.correlacion_id}`;
    if (!rows.length) return null;
    if (rows.length !== 1 || rows[0].marca_coincide !== true ||
        rows[0].email?.toLowerCase() !== op.correo || !rows[0].email_confirmed_at || rows[0].password_configurada !== true ||
        !UUID.test(rows[0].id || '') || (op.cuenta_id && rows[0].id !== op.cuenta_id))
      fail('CREACION_MANUAL_IDENTIDAD_INCOMPATIBLE');
    return rows[0];
  }
  async function profile(tx, op, id) {
    const rows = await tx`SELECT id,nombre,email,estado,rol_id,trabajador_id FROM public.usuarios
      WHERE id=${id}::uuid FOR SHARE NOWAIT`;
    const p = rows[0];
    if (rows.length !== 1 || p.estado !== true || p.nombre !== op.nombre || p.email?.toLowerCase() !== op.correo)
      fail('CREACION_MANUAL_PERFIL_INCOMPATIBLE');
    const verified = await tx`SELECT usuario_id FROM public.usuarios_correos_verificados WHERE usuario_id=${id}::uuid`;
    if (verified.length !== 1) fail('CREACION_MANUAL_CORREO_NO_VERIFICADO');
    return p;
  }
  async function role(tx, op) {
    const rows = await tx`SELECT id FROM public.roles WHERE id=${op.rol_id}::uuid
      AND public.normalizar_nombre_rol(nombre)=${op.rol_nombre_snapshot === 'Técnico' ? 'tecnico' : 'recepcion'}`;
    if (rows.length !== 1) fail('CREACION_MANUAL_ROL_CAMBIO');
  }
  async function laborPlan(tx, op) {
    if (op.ficha_accion === 'VINCULAR') {
      const rows = await tx`SELECT id FROM public.trabajadores WHERE id=${op.ficha_objetivo_id}::uuid
        AND estado='Activo' AND nombre=${op.nombre} FOR SHARE NOWAIT`;
      const used = await tx`SELECT id FROM public.usuarios WHERE trabajador_id=${op.ficha_objetivo_id}::uuid LIMIT 1`;
      if (rows.length !== 1 || used.length) fail('CREACION_MANUAL_FICHA_REQUIERE_REVISION');
    } else {
      const rows = await tx`SELECT id FROM public.trabajadores
        WHERE estado <> 'Eliminado' AND lower(btrim(nombre))=lower(${op.nombre}) LIMIT 1`;
      if (rows.length) fail('CREACION_MANUAL_HOMONIMO_REVISAR');
    }
  }
  async function receipt(tx, op) {
    const rows = await tx`SELECT trabajador_id,usuario_id,actor_id,accion,evento_nro,
      solicitud_sha256 = encode(sha256(convert_to(jsonb_build_object(
        'actor',${op.actor_id}::uuid,'accion',${op.ficha_accion}::text,'usuario',${op.cuenta_id}::uuid,
        'trabajador',${op.ficha_objetivo_id}::uuid,'motivo',${MOTIVO_MANUAL}::text,
        'nombre_laboral',${op.ficha_accion === 'CREAR_Y_VINCULAR' ? op.nombre : null}::text,
        'cargo',NULL,'observaciones',NULL)::text,'UTF8')),'hex') AS huella_coincide,
      evento_nro = (SELECT max(b.evento_nro) FROM public.usuarios_trabajadores_vinculos_auditoria b
        WHERE b.usuario_id=${op.cuenta_id}::uuid) AS ultimo
      FROM public.usuarios_trabajadores_vinculos_auditoria WHERE solicitud_id=${op.vinculo_solicitud_id}::uuid`;
    if (!rows.length) return null;
    const r = rows[0];
    if (rows.length !== 1 || r.usuario_id !== op.cuenta_id || r.actor_id !== op.actor_id ||
        r.accion !== op.ficha_accion || r.huella_coincide !== true || r.ultimo !== true || !UUID.test(r.trabajador_id || '') ||
        (op.ficha_objetivo_id && r.trabajador_id !== op.ficha_objetivo_id)) fail('CREACION_MANUAL_AUDITORIA_INCOMPATIBLE');
    const p = await profile(tx, op, op.cuenta_id);
    if (p.trabajador_id !== r.trabajador_id) fail('CREACION_MANUAL_VINCULO_CAMBIO');
    const workers = await tx`SELECT id FROM public.trabajadores WHERE id=${r.trabajador_id}::uuid AND estado='Activo'`;
    if (workers.length !== 1) fail('CREACION_MANUAL_FICHA_INACTIVA');
    return r.trabajador_id;
  }
  return {
    async serializar(email, work) {
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
      const key = new DataView(hash).getInt32(0, false);
      let session, sql, pid, held = false, cleanup = false;
      const guard = async () => {
        const [c] = await sql`SELECT pg_backend_pid() AS pid, current_user::text AS rol, session_user::text AS login`;
        if (!Number.isInteger(c?.pid) || c.rol !== 'postgres' || c.login !== 'postgres' || (pid !== undefined && c.pid !== pid))
          fail('CREACION_MANUAL_SESION_SQL_PERDIDA', 503);
        pid = c.pid;
      };
      let result, problem;
      try {
        session = await sessionFactory(); sql = session.sql;
        await sql`SET statement_timeout = '8s'`; await guard();
        const [lock] = await sql`SELECT pg_try_advisory_lock(${INVITE_LOCK_NAMESPACE}::integer,${key}::integer) AS adquirido`;
        held = lock?.adquirido === true;
        if (!held) fail('CREACION_MANUAL_EN_CURSO');
        await guard(); result = await work(guard);
      } catch (e) { problem = e; }
      finally {
        if (session) {
          try {
            await guard();
            if (held) {
              const [r] = await sql`SELECT pg_advisory_unlock(${INVITE_LOCK_NAMESPACE}::integer,${key}::integer) AS liberado`;
              if (r?.liberado !== true) throw Error('LOCK_NO_LIBERADO');
            }
            session.release();
          } catch (_) { cleanup = true; }
          try { await session.close(); } catch (_) { cleanup = true; }
        }
      }
      if (problem) throw problem;
      if (cleanup) fail('CREACION_MANUAL_CIERRE_NO_CONFIRMADO', 202);
      return result;
    },
    async reservar(actor, intent, recuperar) {
      return await txActor(actor, async tx => {
        const [prior] = await tx`SELECT * FROM public.usuarios_creaciones_manuales_operaciones
          WHERE solicitud_id=${intent.solicitud_id}::uuid FOR UPDATE NOWAIT`;
        if (prior) {
          if (prior.actor_id !== actor.id || prior.huella_solicitud !== intent.huella_solicitud ||
              Object.keys(intent).some(k => String(prior[k]) !== String(intent[k]))) fail('CREACION_MANUAL_SOLICITUD_INCOMPATIBLE');
          return prior;
        }
        if (recuperar) fail('CREACION_MANUAL_RESERVA_NO_ENCONTRADA');
        const roles = await tx`SELECT id FROM public.roles
          WHERE public.normalizar_nombre_rol(nombre)=${intent.rol_nombre_snapshot === 'Técnico' ? 'tecnico' : 'recepcion'}`;
        if (roles.length !== 1) fail('CREACION_MANUAL_ROL_INVALIDO');
        const op = { ...intent, rol_id: roles[0].id };
        await laborPlan(tx, op);
        const existing = await tx`SELECT id FROM auth.users WHERE lower(email)=${intent.correo}
          UNION ALL SELECT id FROM public.usuarios WHERE lower(email)=${intent.correo} LIMIT 1`;
        if (existing.length) fail('CREACION_MANUAL_CORREO_EXISTENTE');
        const [row] = await tx`WITH instante AS MATERIALIZED (SELECT clock_timestamp() AS fecha)
          INSERT INTO public.usuarios_creaciones_manuales_operaciones
          (solicitud_id,correlacion_id,actor_id,actor_sesion_id,correo,nombre,rol_id,rol_nombre_snapshot,
           ficha_accion,ficha_objetivo_id,vinculo_solicitud_id,huella_solicitud,creada_en,actualizada_en)
          SELECT ${intent.solicitud_id}::uuid,${crypto.randomUUID()}::uuid,${actor.id}::uuid,${actor.sessionId}::uuid,
            ${intent.correo},${intent.nombre},${op.rol_id}::uuid,${intent.rol_nombre_snapshot},${intent.ficha_accion},
            ${intent.ficha_objetivo_id}::uuid,${crypto.randomUUID()}::uuid,${intent.huella_solicitud},fecha,fecha
          FROM instante RETURNING *`;
        return row;
      });
    },
    async prepararAuth(actor, op) {
      return await txActor(actor, async tx => {
        await current(tx, actor, op); await role(tx, op); await laborPlan(tx, op);
        const rows = await tx`SELECT id FROM auth.users WHERE lower(email)=${op.correo}
          UNION ALL SELECT id FROM public.usuarios WHERE lower(email)=${op.correo} LIMIT 1`;
        if (rows.length) fail('CREACION_MANUAL_CORREO_EXISTENTE');
      });
    },
    async transicion(actor, op, estado, fields) {
      return await txActor(actor, async tx => {
        const old = await current(tx, actor, op);
        if (!nextStates[old.estado]?.includes(estado)) fail('CREACION_MANUAL_TRANSICION_INVALIDA');
        if (estado === 'AUTH_EN_CURSO') {
          await role(tx, old); await laborPlan(tx, old);
          const existing = await tx`SELECT id FROM auth.users WHERE lower(email)=${old.correo}
            UNION ALL SELECT id FROM public.usuarios WHERE lower(email)=${old.correo} LIMIT 1`;
          if (existing.length) fail('CREACION_MANUAL_CORREO_EXISTENTE');
        }
        // Mantener precisión PostgreSQL: no convertir timestamptz a Date de JS
        // (milisegundos) y devolverlo truncado a una transición posterior.
        const [time] = await tx`SELECT greatest(clock_timestamp(),actualizada_en)::text AS instante
          FROM public.usuarios_creaciones_manuales_operaciones WHERE solicitud_id=${op.solicitud_id}::uuid`;
        const update = { estado, revision: String(BigInt(old.revision) + 1n), actualizada_en: time.instante, codigo_error: null };
        if (estado === 'AUTH_EN_CURSO') update.auth_intentado_en = time.instante;
        if (estado === 'AUTH_CONFIRMADA') {
          if (!UUID.test(fields.cuenta_id || '')) fail('CREACION_MANUAL_UUID_INVALIDO');
          update.cuenta_id = fields.cuenta_id; update.auth_confirmada_en = time.instante;
        }
        if (estado === 'VINCULADA') {
          if (!UUID.test(fields.trabajador_id || '')) fail('CREACION_MANUAL_FICHA_INVALIDA');
          update.trabajador_id = fields.trabajador_id; update.ficha_vinculada_en = time.instante;
        }
        if (estado.startsWith('REVISION_')) update.codigo_error = fields.codigo_error;
        if (estado === 'COMPLETADA') update.finalizada_en = time.instante;
        const [row] = await tx`UPDATE public.usuarios_creaciones_manuales_operaciones SET ${tx(update)}
          WHERE solicitud_id=${op.solicitud_id}::uuid AND revision=${old.revision}::bigint AND estado=${old.estado} RETURNING *`;
        if (!row) fail('CREACION_MANUAL_OPERACION_CAMBIO');
        return row;
      });
    },
    async reconciliarAuth(actor, op) {
      return await txActor(actor, async tx => {
        await current(tx, actor, op); const a = await identity(tx, op); if (!a) return null;
        const p = await profile(tx, op, a.id);
        if (p.rol_id !== null || p.trabajador_id !== null) fail('CREACION_MANUAL_PERFIL_YA_MODIFICADO');
        await role(tx, op); return a.id;
      });
    },
    async verificarPendiente(actor, op) {
      return await txActor(actor, async tx => {
        await current(tx, actor, op); if (!await identity(tx, op)) fail('CREACION_MANUAL_AUTH_AUSENTE');
        const p = await profile(tx, op, op.cuenta_id);
        if (p.rol_id !== null || p.trabajador_id !== null) fail('CREACION_MANUAL_PERFIL_YA_MODIFICADO');
        await role(tx, op); await laborPlan(tx, op);
      });
    },
    async reciboVinculo(actor, op) {
      return await txActor(actor, async tx => {
        await current(tx, actor, op); if (!await identity(tx, op)) fail('CREACION_MANUAL_AUTH_AUSENTE');
        return await receipt(tx, op);
      });
    },
    async estadoAprobacion(actor, op) {
      return await txActor(actor, async tx => {
        await current(tx, actor, op); await role(tx, op);
        if (!await identity(tx, op) || await receipt(tx, op) !== op.trabajador_id) fail('CREACION_MANUAL_VINCULO_NO_ACREDITADO');
        const p = await profile(tx, op, op.cuenta_id);
        if (p.rol_id !== null && p.rol_id !== op.rol_id) fail('CREACION_MANUAL_ROL_CAMBIO');
        return p.rol_id === op.rol_id;
      });
    },
    async verificarFinal(actor, op) {
      if (!await this.estadoAprobacion(actor, op)) fail('CREACION_MANUAL_FINAL_NO_CONFIRMADO');
    }
  };
}
