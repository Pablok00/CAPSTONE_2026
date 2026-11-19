// AUTH-2B: cliente aislado en memoria; nunca cargar app.js ni una sesión de la SPA.
let recoveryUserId = null;
let recoveryBusy = false;
let recoveryFinished = false;

function recoveryMensaje(texto) {
  document.getElementById('recovery-message').textContent = texto;
}

function recoveryVisibilidad(id, visible) {
  const campo = document.getElementById(id);
  const boton = document.getElementById(id + '-eye');
  campo.type = visible ? 'text' : 'password';
  const etiqueta = (visible ? 'Ocultar ' : 'Mostrar ') + (id === 'recovery-password' ? 'nueva contraseña' : 'confirmación de nueva contraseña');
  boton.setAttribute('aria-label', etiqueta); boton.setAttribute('title', etiqueta);
  boton.setAttribute('aria-pressed', String(visible));
  boton.innerHTML = `<svg aria-hidden="true" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${visible ? '<path d="m3 3 18 18"/>' : ''}</svg>`;
}

function alternarPasswordRecuperada(id) {
  const campo = document.getElementById(id);
  if (!campo.disabled) recoveryVisibilidad(id, campo.type === 'password');
}

function recoveryLimpiar() {
  ['recovery-password', 'recovery-confirm'].forEach(id => {
    document.getElementById(id).value = ''; recoveryVisibilidad(id, false);
  });
}

function recoveryBloquear(bloqueado) {
  ['recovery-password', 'recovery-confirm', 'recovery-save'].forEach(id => { document.getElementById(id).disabled = bloqueado; });
}

async function recoveryVerificar() {
  const auth = window.supabaseClient.auth;
  // setSession puede aceptar un JWT aún vigente sin comprobar el refresh token.
  // Renovarlo con el servidor rechaza sesiones revocadas y enlaces ya consumidos.
  const renovada = await auth.refreshSession();
  if (renovada.error || !renovada.data.session) throw Error('invalid_recovery');
  const { data, error } = await auth.getSession();
  if (error || !data.session) throw Error('invalid_recovery');
  const sesion = data.session;
  // getClaims verifica el JWT con el SDK; un type=recovery en la URL no basta.
  const verificado = await auth.getClaims(sesion.access_token);
  const claims = verificado.data && verificado.data.claims;
  if (verificado.error || !claims || !Array.isArray(claims.amr) ||
      // Métodos que Supabase clasifica oficialmente como recuperación (IsRecovery).
      !claims.amr.some(a => ['otp', 'magiclink', 'recovery'].includes(a.method)) || claims.sub !== sesion.user.id ||
      !claims.exp || claims.exp * 1000 <= Date.now()) throw Error('invalid_recovery');
  const usuario = await auth.getUser();
  if (usuario.error || !usuario.data.user || usuario.data.user.id !== claims.sub) throw Error('invalid_recovery');
  return claims.sub;
}

async function recoveryCerrarSesion() {
  const { error } = await window.supabaseClient.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

async function iniciarRecuperacion() {
  recoveryBusy = true;
  document.getElementById('recovery-back').disabled = true;
  recoveryLimpiar(); recoveryBloquear(true);
  let enlace = window.hotelRecoveryLink;
  delete window.hotelRecoveryLink;
  try {
    const hash = new URLSearchParams(enlace && enlace.hash.replace(/^#/, ''));
    const query = new URLSearchParams(enlace && enlace.search);
    enlace = null;
    if (hash.has('error') || query.has('error')) throw Error('invalid_recovery');
    const auth = window.supabaseClient.auth;
    let resultado;
    if (query.get('type') === 'recovery' && query.get('token_hash')) {
      resultado = await auth.verifyOtp({ token_hash: query.get('token_hash'), type: 'recovery' });
    } else if (hash.get('type') === 'recovery' && hash.get('access_token') && hash.get('refresh_token')) {
      resultado = await auth.setSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') });
    } else { throw Error('invalid_recovery'); }
    if (resultado.error || !resultado.data.session) throw Error('invalid_recovery');
    recoveryUserId = await recoveryVerificar();
    recoveryBloquear(false);
    document.getElementById('recovery-form').classList.remove('hidden');
    recoveryMensaje('Enlace verificado. Ingresa y confirma tu nueva contraseña (mínimo 6 caracteres).');
    document.getElementById('recovery-password').focus();
  } catch (_) {
    recoveryUserId = null; recoveryBloquear(true);
    try { await recoveryCerrarSesion(); } catch (_) { /* sesión en memoria, sin acceso a la SPA */ }
    recoveryMensaje('El enlace no es válido, ha vencido o ya fue utilizado. Solicita uno nuevo desde el inicio de sesión. Si persiste, comprueba tu conexión.');
  } finally {
    recoveryBusy = false;
    document.getElementById('recovery-back').disabled = false;
  }
}

async function guardarPasswordRecuperada(evento) {
  evento.preventDefault();
  if (recoveryBusy || recoveryFinished || !recoveryUserId) return;
  const nueva = document.getElementById('recovery-password');
  const confirmar = document.getElementById('recovery-confirm');
  if (!nueva.value || nueva.value.length < 6) { recoveryMensaje('La nueva contraseña debe tener al menos 6 caracteres.'); return; }
  if (nueva.value !== confirmar.value) { recoveryMensaje('Las contraseñas no coinciden.'); return; }
  recoveryBusy = true; recoveryBloquear(true);
  document.getElementById('recovery-back').disabled = true;
  recoveryMensaje('Guardando nueva contraseña…');
  try {
    if (await recoveryVerificar() !== recoveryUserId) throw Error('invalid_recovery');
    // La excepción de current_password corresponde a la sesión recovery del servidor.
    const { data, error } = await window.supabaseClient.auth.updateUser({ password: nueva.value });
    if (error) throw error;
    if (!data.user || data.user.id !== recoveryUserId) throw Error('invalid_recovery');
    recoveryFinished = true; recoveryUserId = null;
    try {
      await recoveryCerrarSesion();
      recoveryMensaje('Tu contraseña se actualizó correctamente. Vuelve al inicio de sesión para ingresar.');
    } catch (_) {
      recoveryMensaje('Tu contraseña se actualizó correctamente, pero no se pudo confirmar el cierre de la sesión temporal. Pulsa Volver al inicio de sesión para reintentar.');
    }
    document.getElementById('recovery-form').classList.add('hidden');
  } catch (error) {
    const codigo = String(error.code || '');
    if (codigo === 'weak_password') recoveryMensaje('La contraseña no cumple la política de seguridad de Supabase. Elige una más segura.');
    else if (codigo === 'same_password') recoveryMensaje('Elige una contraseña diferente de la anterior.');
    else if (error.status === 429 || codigo.includes('rate_limit')) recoveryMensaje('Demasiados intentos. Espera antes de reintentar.');
    else recoveryMensaje('No fue posible confirmar el cambio. Comprueba tu conexión o solicita otro enlace si ha vencido.');
  } finally {
    recoveryLimpiar(); recoveryBusy = false;
    recoveryBloquear(recoveryFinished || !recoveryUserId);
    document.getElementById('recovery-back').disabled = false;
  }
}

async function volverLoginRecuperacion() {
  if (recoveryBusy) return;
  recoveryBusy = true; recoveryUserId = null; recoveryBloquear(true); recoveryLimpiar();
  try {
    await recoveryCerrarSesion();
    window.location.replace('./login.html');
  } catch (_) {
    recoveryMensaje('No fue posible confirmar el cierre de la sesión temporal. Comprueba tu conexión y vuelve a intentarlo.');
  } finally { recoveryBusy = false; }
}

document.addEventListener('DOMContentLoaded', iniciarRecuperacion);
