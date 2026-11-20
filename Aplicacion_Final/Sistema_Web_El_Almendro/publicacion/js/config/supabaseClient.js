
const SUPABASE_URL = 'https://hgveesryfmcjxpeumzbp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wYgSDBk9lok0ya9rNBy67A_eyFxjg5o';


window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY,
  (document.documentElement.dataset.authRecovery === 'true' || document.documentElement.dataset.authInvitation === 'true') ? {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
      storageKey: document.documentElement.dataset.authInvitation === 'true' ? 'hotel-invitation-memory' : 'hotel-recovery-memory', flowType: 'implicit' }
  } : undefined);

// Cliente efímero para confirmar la contraseña propia; nunca reemplaza al operativo.
window.crearClienteVerificacionAdmin = () => window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false,
    storageKey:'hotel-admin-verificacion-' + crypto.randomUUID() }
});

// Destino público documentado; autorizar esta URL en Supabase Auth.
window.correoVerificacionDestino = () => 'https://pruebaelalmendro.vercel.app/login.html';
// Se conserva el intervalo anterior: 30 s no está acreditado en Dashboard.
const CORREO_INTERVALO_MS = 60000;
let correoVerificacionEnCurso = false, correoVerificacionHasta = 0, correoContadorTimer = null;
const correoBotones = new Set();
try { correoVerificacionHasta = Math.max(0, Math.min(Number(sessionStorage.getItem('hotel.correo-espera')) || 0, Date.now() + 300000)); } catch (_) {}
window.actualizarContadorCorreo = () => {
  if (correoContadorTimer !== null) { clearTimeout(correoContadorTimer); correoContadorTimer = null; }
  const segundos = Math.max(0, Math.ceil((correoVerificacionHasta - Date.now()) / 1000));
  for (const boton of correoBotones) {
    if (boton.isConnected === false) { correoBotones.delete(boton); continue; }
    boton.disabled = correoVerificacionEnCurso || segundos > 0;
    boton.textContent = segundos > 0 ? 'Podrás solicitar otro enlace en ' + String(Math.floor(segundos / 60)).padStart(2,'0') + ':' + String(segundos % 60).padStart(2,'0') : 'Volver a enviar enlace';
  }
  if (segundos > 0 || correoVerificacionEnCurso) correoContadorTimer = setTimeout(window.actualizarContadorCorreo, 1000);
};
window.prepararReenviosCorreo = (raiz = document) => {
  raiz.querySelectorAll?.('[data-reenvio-signup]').forEach(boton => correoBotones.add(boton));
  window.actualizarContadorCorreo();
};
function correoGuardarEspera() {
  try { sessionStorage.setItem('hotel.correo-espera', String(correoVerificacionHasta)); } catch (_) {}
}
window.reenviarCorreoVerificacion = async (email, boton, mensaje) => {
  if (boton) correoBotones.add(boton);
  if (correoVerificacionEnCurso || !mensaje) return;
  if (Date.now() < correoVerificacionHasta) { mensaje.textContent = 'Espera a que termine el contador antes de solicitar otro enlace.'; window.actualizarContadorCorreo(); return; }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { mensaje.textContent = 'Ingresa tu correo electrónico.'; return; }
  correoVerificacionEnCurso = true; correoVerificacionHasta = Date.now() + CORREO_INTERVALO_MS;
  correoGuardarEspera(); window.actualizarContadorCorreo();
  mensaje.textContent = 'Solicitando correo…';
  try {
    const respuesta = await window.supabaseClient.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: window.correoVerificacionDestino() } });
    if (!respuesta || respuesta.error) throw respuesta?.error || {};
    mensaje.textContent = 'Si corresponde, recibirás un nuevo enlace. Revisa también spam y utiliza el más reciente.';
  } catch (error) {
    const limitado = error?.status === 429 || String(error?.code || '').includes('rate_limit');
    if (limitado) { correoVerificacionHasta = Math.max(correoVerificacionHasta, Date.now() + 120000); correoGuardarEspera(); }
    mensaje.textContent = limitado ? 'El servidor limitó los envíos. Espera al menos dos minutos; el proveedor puede requerir más tiempo.'
      : 'No fue posible confirmar el envío. Revisa tu conexión y espera antes de reintentar. No se reenviará automáticamente.';
  } finally { correoVerificacionEnCurso = false; window.actualizarContadorCorreo(); }
};

// INV-18: presentación disponible en orígenes exactos local/producción.
// No autoriza operaciones: JWT, roles y compuertas se comprueban en servidor.
window.INVITACIONES_UI_HABILITADA = ['http://127.0.0.1:5500','https://pruebaelalmendro.vercel.app'].includes(window.location?.origin);
window.REGISTRO_PUBLICO_UI_HABILITADO = false;
window.invocarUsuarioInvitaciones = async (body, usuarioEsperado) => {
  const errorSeguro = (codigo, incierto = false) => Object.assign(new Error(codigo), { codigo, incierto });
  if (window.INVITACIONES_UI_HABILITADA !== true) throw errorSeguro('INVITACIONES_UI_DESHABILITADA');
  const auth = window.supabaseClient.auth;
  let enviada = false;
  try {
    const sesion = await auth.getSession();
    const usuario = await auth.getUser();
    if (sesion.error || usuario.error || !sesion.data?.session?.access_token ||
        usuario.data?.user?.id !== usuarioEsperado || sesion.data.session.user?.id !== usuarioEsperado)
      throw errorSeguro('SESION_INVALIDA');
    enviada = true;
    const result = await window.supabaseClient.functions.invoke('usuario-invitaciones', {
      body, headers: { Authorization: 'Bearer ' + sesion.data.session.access_token }
    });
    let data = result.data;
    if (!data && result.error?.context?.clone) {
      try { data = await result.error.context.clone().json(); } catch (_) {}
    }
    if (result.error || data?.ok !== true) {
      const codigo = typeof data?.error === 'string' && /^[A-Z0-9_]{1,96}$/.test(data.error) ? data.error : 'RESULTADO_NO_CONFIRMADO';
      const sinEscritura = ['INVITACIONES_DESHABILITADAS','ENVIO_INVITACION_DESHABILITADO','CONEXION_INVITACION_SIN_AFINIDAD',
        'SOLO_ADMIN_PERMANENTE','ORIGEN_NO_PERMITIDO','SESION_INVALIDA','CUENTA_EXISTENTE_REVISAR','INVITACION_EN_CURSO_REVISAR',
        'CONTRASENA_NO_CONFIGURADA','INVITACION_NO_ACREDITADA','PERFIL_NO_PENDIENTE','NOMBRE_DISTINTO_REQUIERE_REVISION',
        'REENVIO_NO_AUTORIZADO_REVISAR','NOMBRE_INVALIDO','CORREO_INVALIDO','DATOS_INVALIDOS','LIMITE_LOCAL_ESPERAR'].includes(codigo);
      throw errorSeguro(codigo, data?.requiere_revision === true || !sinEscritura);
    }
    if (['INVITAR','REENVIAR_INVITACION'].includes(body.accion) && (data.estado !== 'INVITACION_CONFIRMADA' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(data.identidad_id || '')) || body.accion === 'COMPLETAR_NOMBRE' &&
        (data.estado !== 'NOMBRE_CONFIRMADO' || data.usuario_id !== usuarioEsperado || data.nombre !== body.nombre))
      throw errorSeguro('RESULTADO_NO_CONFIRMADO', true);
    if (body.accion === 'CONSULTAR_INVITACION' && (data.email !== body.email ||
        !['CORREO_NUEVO','INVITACION_PENDIENTE','REGISTRO_INCOMPLETO','PENDIENTE_APROBACION','CUENTA_APROBADA','REQUIERE_REVISION'].includes(data.estado) ||
        typeof data.envio_habilitado !== 'boolean' || typeof data.reenvio_permitido !== 'boolean' || !Number.isInteger(data.espera_segundos) || data.espera_segundos < 0 ||
        !(data.identidad_id === null || /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(data.identidad_id || '')) ||
        data.reenvio_permitido && (data.estado !== 'INVITACION_PENDIENTE' || !data.identidad_id || data.espera_segundos !== 0)))
      throw errorSeguro('RESULTADO_NO_CONFIRMADO', true);
    if (body.accion === 'REENVIAR_INVITACION' && data.identidad_id !== body.identidad_id) throw errorSeguro('RESULTADO_NO_CONFIRMADO', true);
    const actual = await auth.getUser();
    if (actual.error || actual.data?.user?.id !== usuarioEsperado) throw errorSeguro('SESION_CAMBIO_REVISAR', true);
    return data;
  } catch (error) {
    if (error?.codigo) throw error;
    throw errorSeguro(enviada ? 'RESULTADO_NO_CONFIRMADO' : 'SESION_NO_VERIFICABLE', enviada);
  }
};
