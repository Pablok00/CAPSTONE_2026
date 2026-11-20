// Seguridad personal: solicitud de recuperación, sin actualización directa de contraseña.
let passwordPersonalGuardando = false;
let passwordPersonalUsuarioId = null;
let passwordPersonalPeticion = 0;

function passwordPersonalCuentaActual() {
  return typeof state !== 'undefined' && state.currentUser && state.currentUser.id &&
    state.currentUser.role && state.currentUser.role !== 'SIN_ROL' ? state.currentUser : null;
}

async function passwordPersonalValidarSesion() {
  const cuenta = passwordPersonalCuentaActual();
  const auth = window.supabaseClient && window.supabaseClient.auth;
  if (!cuenta || !auth) throw { code: 'personal_session_invalid' };
  const sesion = await auth.getSession();
  if (sesion.error || !sesion.data?.session?.user || sesion.data.session.user.id !== cuenta.id) {
    throw { code: 'personal_session_invalid' };
  }
  const usuario = await auth.getUser();
  if (usuario.error) throw usuario.error;
  if (!usuario.data?.user || usuario.data.user.id !== cuenta.id || passwordPersonalCuentaActual()?.id !== cuenta.id) {
    throw { code: 'personal_session_invalid' };
  }
  return usuario.data.user;
}

function passwordPersonalMensaje(mensaje, error = false) {
  const nodo = document.getElementById('password-personal-mensaje');
  if (!nodo) return;
  nodo.textContent = mensaje;
  nodo.className = 'text-sm rounded-xl p-3 ' + (error
    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300');
  nodo.setAttribute('role', error ? 'alert' : 'status');
}

function passwordPersonalError(error) {
  const codigo = String(error?.code || '');
  if (['personal_session_invalid', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'user_not_found', 'bad_jwt'].includes(codigo) || error?.status === 401) {
    return 'La sesión no es válida o ha vencido. Vuelve a iniciar sesión.';
  }
  if (codigo === 'personal_email_missing') return 'Tu cuenta no tiene un correo registrado válido. Contacta al administrador.';
  if (codigo === 'personal_origin_invalid') return 'La solicitud no está habilitada desde esta dirección. Abre la aplicación en su dirección autorizada.';
  if (error?.status === 429 || codigo.includes('rate_limit') || codigo.includes('over_email_send_rate_limit')) {
    return 'Demasiadas solicitudes. Espera unos minutos antes de reintentar.';
  }
  return 'No fue posible procesar la solicitud. Comprueba tu conexión y vuelve a intentarlo.';
}

async function abrirCambioPasswordPersonal() {
  if (passwordPersonalGuardando) return;
  const boton = document.getElementById('password-personal-guardar');
  if (!boton) return;
  const peticion = ++passwordPersonalPeticion;
  passwordPersonalGuardando = true;
  passwordPersonalUsuarioId = null;
  boton.disabled = true;
  boton.textContent = 'Procesando solicitud…';
  passwordPersonalMensaje('Procesando solicitud…');
  try {
    const destinos = {
      'https://pruebaelalmendro.vercel.app': 'https://pruebaelalmendro.vercel.app/recuperar-password.html',
      'http://127.0.0.1:5500': 'http://127.0.0.1:5500/recuperar-password.html'
    };
    const destino = destinos[new URL(window.location.href).origin];
    if (!destino) throw { code: 'personal_origin_invalid' };
    const usuario = await passwordPersonalValidarSesion();
    if (peticion !== passwordPersonalPeticion || document.getElementById('password-personal-guardar') !== boton) return;
    const correo = usuario.email;
    if (typeof correo !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw { code: 'personal_email_missing' };
    passwordPersonalUsuarioId = usuario.id;
    const { error } = await window.supabaseClient.auth.resetPasswordForEmail(correo, { redirectTo: destino });
    if (error) throw error;
    if (peticion !== passwordPersonalPeticion || passwordPersonalUsuarioId !== usuario.id || passwordPersonalCuentaActual()?.id !== usuario.id || document.getElementById('password-personal-guardar') !== boton) return;
    passwordPersonalMensaje('Solicitud procesada. Revisa tu correo para continuar. Tu contraseña todavía no se ha cambiado.');
  } catch (error) {
    if (document.getElementById('password-personal-guardar') === boton) passwordPersonalMensaje(passwordPersonalError(error), true);
  } finally {
    passwordPersonalGuardando = false;
    passwordPersonalUsuarioId = null;
    boton.disabled = false;
    boton.textContent = 'Cambiar contraseña por correo';
  }
}

// Invalidar la respuesta pendiente si cambia la identidad; sin operaciones asíncronas aquí.
if (window.supabaseClient && typeof window.supabaseClient.auth.onAuthStateChange === 'function') {
  window.supabaseClient.auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'SIGNED_OUT' || !sesion?.user || (passwordPersonalCuentaActual() && sesion.user.id !== passwordPersonalCuentaActual().id)) {
      passwordPersonalPeticion++;
      passwordPersonalUsuarioId = null;
      passwordPersonalMensaje('La sesión ha cambiado. Vuelve a iniciar sesión antes de solicitar otro enlace.', true);
    }
  });
}
