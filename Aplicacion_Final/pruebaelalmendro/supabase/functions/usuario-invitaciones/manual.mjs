// INV-28: coordinación manual. Nunca persistir ni derivar huellas de contraseñas.
import { InvitationError, UUID, normalizarNombre, normalizarCorreo } from './invitaciones.mjs';
export const MOTIVO_MANUAL = 'Confirmación administrativa de identidad laboral durante creación manual de cuenta.';
const fail = (code, status = 409) => { throw new InvitationError(code, status); };
// Solo etapa controlada y SQLSTATE. Nunca copiar message/detail/query/parameters.
export async function etapaManual(etapa, work) {
  try { return await work(); }
  catch (original) {
    const error = original instanceof InvitationError ? original :
      new InvitationError('CREACION_MANUAL_ETAPA_NO_CONFIRMADA', 503);
    if (!error.etapa) error.etapa = etapa;
    if (!(original instanceof InvitationError) && /^[0-9A-Z]{5}$/.test(original?.code || ''))
      error.sqlstate = original.code;
    throw error;
  }
}
// Configuración exclusivamente del servidor. Ausencia de modo nunca abre producción.
export function exigirCorreoManual(config, correo) {
  const modo = config?.modo === undefined ? 'ENSAYO' : config.modo;
  if (modo === 'ENSAYO') {
    let permitido;
    try { permitido = normalizarCorreo(typeof config?.correoEnsayo === 'string' ? config.correoEnsayo.trim() : null); }
    catch (_) { fail('CREACION_MANUAL_ENSAYO_SIN_CONFIGURAR', 503); }
    if (correo !== permitido) fail('CREACION_MANUAL_CORREO_NO_PERMITIDO', 403);
  } else if (modo === 'PRODUCCION') {
    // Exige seleccionar producción expresamente y retirar la configuración de ensayo.
    if (config.correoEnsayo !== undefined) fail('CREACION_MANUAL_MODO_INCOMPATIBLE', 503);
  } else fail('CREACION_MANUAL_MODO_INVALIDO', 503);
}
export async function manualIntent(body) {
  const keys = ['accion','solicitud_id','nombre','email','rol','ficha_accion','trabajador_id','confirmacion','recuperar'];
  if (!body || Object.keys(body).some(k => ![...keys,'password'].includes(k)) ||
      keys.some(k => !(k in body)) || body.accion !== 'CREAR_USUARIO_MANUAL' ||
      !UUID.test(body.solicitud_id || '') || !['Técnico','Recepción'].includes(body.rol) ||
      body.confirmacion !== true || typeof body.recuperar !== 'boolean' ||
      !['VINCULAR','CREAR_Y_VINCULAR'].includes(body.ficha_accion) ||
      (body.ficha_accion === 'VINCULAR' ? !UUID.test(body.trabajador_id || '') : body.trabajador_id !== null))
    fail('CREACION_MANUAL_DATOS_INVALIDOS', 400);
  if (body.recuperar ? 'password' in body : typeof body.password !== 'string' ||
      !body.password.length || body.password.length > 1024) fail('CREACION_MANUAL_PASSWORD_INVALIDA', 400);
  const intent = { solicitud_id: body.solicitud_id.toLowerCase(), nombre: normalizarNombre(body.nombre),
    correo: normalizarCorreo(typeof body.email === 'string' ? body.email.trim() : body.email), rol_nombre_snapshot: body.rol, ficha_accion: body.ficha_accion,
    ficha_objetivo_id: body.trabajador_id?.toLowerCase() || null };
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(intent)));
  return Object.freeze({ ...intent, huella_solicitud: [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2,'0')).join('') });
}
export function manualMarca(op) {
  return { version: 1, solicitud_id: op.solicitud_id, correlacion_id: op.correlacion_id, huella_solicitud: op.huella_solicitud };
}
export function manualPayload(op) {
  return { p_accion: op.ficha_accion, p_usuario_id: op.cuenta_id,
    p_trabajador_id: op.ficha_objetivo_id, p_motivo: MOTIVO_MANUAL,
    p_solicitud_id: op.vinculo_solicitud_id,
    p_nombre_laboral: op.ficha_accion === 'CREAR_Y_VINCULAR' ? op.nombre : null,
    p_cargo: null, p_observaciones: null };
}
export function createManualService({ store, authorize, humanClient, createUser, policy = () => ({}) }) {
  return async ({ body, actor, token }) => {
    const intent = await manualIntent(body);
    const check = async () => { await etapaManual('AUTORIZAR', () => authorize(token, actor)); };
    await check();
    exigirCorreoManual(policy(), intent.correo);
    return await store.serializar(intent.correo, async guard => {
      const secure = async () => { await etapaManual('SESION_SQL', guard); await check(); exigirCorreoManual(policy(), intent.correo); };
      await secure();
      let op = await etapaManual('RESERVAR', () => store.reservar(actor, intent, body.recuperar));
      let returnedId = null;
      const advance = async (estado, fields = {}) => {
        await secure(); op = await etapaManual('TRANSICION_' + estado, () => store.transicion(actor, op, estado, fields)); return op;
      };
      const response = () => ({ estado: op.estado, solicitud_id: op.solicitud_id,
        cuenta_id: op.cuenta_id, trabajador_id: op.trabajador_id,
        codigo_error: ['AUTH_NO_CONFIRMADA','PASSWORD_RECHAZADA','CORREO_EXISTENTE_AUTH',
          'VINCULO_NO_CONFIRMADO','APROBACION_NO_CONFIRMADA'].includes(op.codigo_error) ? op.codigo_error : null,
        completada: op.estado === 'COMPLETADA', requiere_revision: op.estado !== 'COMPLETADA',
        no_reintentar_automaticamente: true });
      if (op.estado === 'RECHAZADA') fail('CREACION_MANUAL_RECHAZADA');
      if (op.estado === 'COMPLETADA') {
        await secure(); await etapaManual('VERIFICAR_FINAL', () => store.verificarFinal(actor, op)); return response();
      }
      if (op.estado === 'PREPARADA') {
        // Recuperación nunca dispone de contraseña ni autoriza un segundo envío.
        if (body.recuperar) return response();
        await secure(); await etapaManual('PREPARAR_AUTH', () => store.prepararAuth(actor, op));
        await advance('AUTH_EN_CURSO');
        let codigoAuth = 'AUTH_NO_CONFIRMADA';
        try {
          await secure();
          const result = await createUser({ email: op.correo, password: body.password, email_confirm: true,
            user_metadata: { nombre: op.nombre }, app_metadata: { creacion_manual_v1: manualMarca(op) } });
          if (result?.error) {
            // Solo códigos estructurados conocidos, nunca el mensaje de Auth.
            if (result.error.code === 'weak_password') codigoAuth = 'PASSWORD_RECHAZADA';
            if (['email_exists','user_already_exists'].includes(result.error.code)) codigoAuth = 'CORREO_EXISTENTE_AUTH';
            throw Error('AUTH_NO_CONFIRMADA');
          }
          if (!UUID.test(result?.data?.user?.id || '')) throw Error('AUTH_NO_CONFIRMADA');
          returnedId = result.data.user.id;
          // Incluso con respuesta, comprobar correlación en el servidor SQL.
        } catch (_) {
          await advance('REVISION_AUTH', { codigo_error: codigoAuth });
          return response();
        } finally { delete body.password; }
      }
      if (['AUTH_EN_CURSO','REVISION_AUTH'].includes(op.estado)) {
        await secure();
        const identity = await etapaManual('RECONCILIAR_AUTH', () => store.reconciliarAuth(actor, op));
        if (returnedId && identity && returnedId !== identity) fail('CREACION_MANUAL_UUID_RESPUESTA_INCOMPATIBLE');
        if (!identity) {
          if (op.estado !== 'REVISION_AUTH') await advance('REVISION_AUTH', { codigo_error: 'AUTH_NO_CONFIRMADA' });
          return response();
        }
        await advance('AUTH_CONFIRMADA', { cuenta_id: identity });
      }
      if (['AUTH_CONFIRMADA','VINCULO_EN_CURSO','REVISION_VINCULO'].includes(op.estado)) {
        await secure();
        let receipt = await etapaManual('VERIFICAR_VINCULO', () => store.reciboVinculo(actor, op));
        if (!receipt) {
          await etapaManual('VERIFICAR_PENDIENTE', () => store.verificarPendiente(actor, op));
          // Solo una petición explícita de recuperación puede reenviar la misma
          // subsolicitud; previamente se buscó el recibo y se verificó el perfil.
          if (op.estado !== 'AUTH_CONFIRMADA' && !body.recuperar) return response();
          // Si el proceso cayó después del claim, la fase ya está guardada.
          // No solicitar una transición EN_CURSO -> EN_CURSO inexistente.
          if (op.estado !== 'VINCULO_EN_CURSO') await advance('VINCULO_EN_CURSO');
          try {
            await secure();
            const result = await humanClient(token).rpc('usuarios_trabajadores_gestionar_v1', manualPayload(op));
            if (result?.error) throw Error('VINCULO_NO_CONFIRMADO');
          } catch (_) {
            await advance('REVISION_VINCULO', { codigo_error: 'VINCULO_NO_CONFIRMADO' });
            return response();
          }
          await secure(); receipt = await etapaManual('VERIFICAR_VINCULO', () => store.reciboVinculo(actor, op));
          if (!receipt) {
            await advance('REVISION_VINCULO', { codigo_error: 'VINCULO_NO_CONFIRMADO' }); return response();
          }
        }
        await advance('VINCULADA', { trabajador_id: receipt });
      }
      if (['VINCULADA','APROBACION_EN_CURSO','REVISION_APROBACION'].includes(op.estado)) {
        await secure();
        const approved = await etapaManual('VERIFICAR_APROBACION', () => store.estadoAprobacion(actor, op));
        if (!approved) {
          if (op.estado !== 'VINCULADA' && !body.recuperar) return response();
          if (op.estado !== 'APROBACION_EN_CURSO') await advance('APROBACION_EN_CURSO');
          try {
            await secure();
            const result = await humanClient(token).rpc('aprobar_usuario_normal', { p_usuario_id: op.cuenta_id, p_rol_id: op.rol_id });
            if (result?.error) throw Error('APROBACION_NO_CONFIRMADA');
          } catch (_) {
            await advance('REVISION_APROBACION', { codigo_error: 'APROBACION_NO_CONFIRMADA' }); return response();
          }
        }
        await secure(); await etapaManual('VERIFICAR_FINAL', () => store.verificarFinal(actor, op));
        await advance('COMPLETADA');
      }
      return response();
    });
  };
}

// Transporte exclusivo de createUser: un solo POST por instancia, sin redirects/reintentos.
export function createManualAuthFetch(projectUrl, requestFetch = fetch) {
  let attempted = false;
  return async (resource, init) => {
    const req = new Request(resource, init), url = new URL(req.url);
    if (url.origin !== projectUrl || url.pathname !== '/auth/v1/admin/users' || url.search || req.method !== 'POST' || attempted)
      fail('DESTINO_NO_PERMITIDO', 403);
    attempted = true;
    return await requestFetch(req, { redirect: 'error', signal: AbortSignal.any([req.signal, AbortSignal.timeout(8000)]) });
  };
}
