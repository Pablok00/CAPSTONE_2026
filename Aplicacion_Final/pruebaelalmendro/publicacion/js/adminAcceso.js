// Reautenticación de conveniencia por visita. La autorización real sigue en RLS/RPC.
window.AdminAcceso = (function () {
  let visita = null, solicitud = null, generacion = 0, entrando = false;
  const permanente = () => typeof esAdminPermanenteActual === 'function' && esAdminPermanenteActual();
  function vigente() {
    return !!visita && visita.id === state.currentUser?.id && permanente() && (currentView === 'admin' || entrando);
  }
  function retirar(d) {
    if (!d) return;
    d.dialogo.querySelector('input[type="password"],input[name="password"]').value = '';
    d.dialogo.remove();
    document.removeEventListener('keydown', d.teclado, true);
    document.body.style.overflow = d.overflow;
    if (d.foco?.isConnected) d.foco.focus();
  }
  function invalidar() {
    if (!visita && !solicitud) return;
    generacion++; visita = null;
    const anterior = solicitud; solicitud = null; retirar(anterior);
    window.AdminCorreosVerificados?.detener();
    if (typeof adminLimpiarVisita === 'function') adminLimpiarVisita();
  }
  function revisar() {
    if ((visita && !vigente()) || (solicitud && (!permanente() || solicitud.id !== state.currentUser?.id))) invalidar();
  }
  function mensaje(d, texto) { d.dialogo.querySelector('[data-acceso-error]').textContent = texto; }
  function cancelar() {
    const d = solicitud;
    if (!d) return;
    invalidar();
    window.history.replaceState(d.historial, '', d.hash);
    if (currentView === 'admin') navigateTo(d.anterior, null, null, true);
  }
  function solicitar() {
    revisar();
    if (!permanente() || vigente() || solicitud) return;
    const anterior = currentView === 'admin' ? 'dashboard' : currentView;
    const dialogo = document.createElement('div');
    dialogo.id = 'admin-acceso-dialog'; dialogo.className = 'alm-ui';
    dialogo.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto';
    dialogo.setAttribute('role', 'dialog'); dialogo.setAttribute('aria-modal', 'true');
    dialogo.setAttribute('aria-labelledby', 'admin-acceso-titulo');
    dialogo.setAttribute('aria-describedby', 'admin-acceso-descripcion');
    dialogo.innerHTML = `<form class="alm-panel" style="width:100%;max-width:460px;max-height:calc(100dvh - 32px);overflow:auto;padding:24px;display:grid;gap:16px">
      <h2 id="admin-acceso-titulo" class="alm-title">Verificación de seguridad</h2>
      <p id="admin-acceso-descripcion">Ingresa la contraseña de tu cuenta para acceder al Panel de Administración</p>
      <p data-acceso-nombre style="overflow-wrap:anywhere"></p>
      <label for="admin-acceso-password">Contraseña</label>
      <div class="relative">
        <input id="admin-acceso-password" name="password" type="password" autocomplete="current-password" required aria-describedby="admin-acceso-error" style="width:100%;min-height:44px;padding:12px;padding-right:2.75rem;border:1px solid var(--alm-border);border-radius:12px;background:var(--alm-inset);color:var(--alm-text)">
        ${adminPasswordEyeHTML('admin-acceso-password', 'eye-admin-acceso')}
      </div>
      <p id="admin-acceso-error" data-acceso-error role="alert" aria-live="polite"></p>
      <div style="display:flex;flex-wrap:wrap;gap:12px"><button type="submit" class="alm-btn-primary" style="padding:12px 18px;min-height:44px">Verificar acceso</button><button type="button" data-acceso-cancelar class="alm-btn-secondary" style="padding:12px 18px;min-height:44px;border:1px solid var(--alm-border);border-radius:12px;background:var(--alm-inset);color:var(--alm-text)">Cancelar</button></div>
    </form>`;
    const d = { dialogo, id:state.currentUser.id, anterior,
      historial:window.location.hash === '#admin' ? null : window.history.state,
      hash:window.location.hash === '#admin' ? '#' + anterior : window.location.hash || '#' + anterior,
      foco:document.activeElement, overflow:document.body.style.overflow, ocupada:false, token:generacion };
    solicitud = d;
    dialogo.querySelector('[data-acceso-nombre]').textContent = state.currentUser.name || state.currentUser.nombre || 'Administrador conectado';
    const campo = dialogo.querySelector('[name="password"]');
    dialogo.querySelector('[data-acceso-cancelar]').onclick = cancelar;
    dialogo.querySelector('form').onsubmit = e => { e.preventDefault(); verificar(d); };
    d.teclado = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); }
      if (e.key === 'Tab') {
        const controles = [...dialogo.querySelectorAll('input,button')].filter(n => !n.disabled);
        const primero = controles[0], ultimo = controles.at(-1);
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
      }
    };
    document.addEventListener('keydown', d.teclado, true);
    document.body.appendChild(dialogo); document.body.style.overflow = 'hidden'; campo.focus();
  }
  const activa = d => solicitud === d && d.token === generacion && d.dialogo.isConnected && d.id === state.currentUser?.id && permanente();
  async function sesionPrincipal(id) {
    const auth = window.supabaseClient.auth;
    const usuario = await auth.getUser();
    const resultado = await auth.getSession();
    const sesion = resultado.data?.session;
    if (usuario.error || resultado.error || usuario.data?.user?.id !== id || sesion?.user?.id !== id || !sesion.access_token || !usuario.data.user.email) throw { code:'acceso_sesion' };
    return { usuario:usuario.data.user, token:sesion.access_token };
  }
  async function verificar(d) {
    if (!activa(d) || d.ocupada) return;
    const campo = d.dialogo.querySelector('[name="password"]');
    let password = campo.value;
    campo.value = '';
    if (!password) { mensaje(d, 'Ingresa tu contraseña.'); campo.focus(); return; }
    d.ocupada = true;
    const boton = d.dialogo.querySelector('[type="submit"]');
    boton.disabled = true; campo.disabled = true; boton.textContent = 'Verificando…'; mensaje(d, '');
    let temporal = null;
    async function liberarTemporal() {
      if (!temporal) return;
      const cliente = temporal; temporal = null;
      try {
        const salida = await cliente.auth.signOut({ scope:'local' });
        if (salida?.error) throw salida.error;
      } finally { await cliente.auth.stopAutoRefresh(); }
    }
    try {
      const antes = await sesionPrincipal(d.id);
      if (!activa(d)) return;
      d.sesionToken = antes.token;
      // Auth no expone si una identidad OAuth tiene además contraseña: se intenta
      // siempre la contraseña propia; nunca se concede acceso por el proveedor.
      temporal = window.crearClienteVerificacionAdmin();
      const comprobacion = temporal.auth.signInWithPassword({ email:antes.usuario.email, password });
      password = '';
      const resultado = await comprobacion;
      if (!activa(d)) return;
      if (resultado.error) {
        if (resultado.error.code === 'invalid_credentials') {
          const proveedores = antes.usuario.app_metadata?.providers || [];
          throw { code:proveedores.includes('google') ? 'acceso_google' : 'acceso_password' };
        }
        throw resultado.error;
      }
      if (resultado.data?.user?.id !== d.id || resultado.data?.session?.user?.id !== d.id) throw { code:'acceso_sesion' };
      if (!await revalidarPrivilegioParaEscritura() || !activa(d)) throw { code:'acceso_sesion' };
      const despues = await sesionPrincipal(d.id);
      if (!activa(d) || antes.token !== despues.token || antes.usuario.email !== despues.usuario.email) throw { code:'acceso_sesion' };
      // Cerrar solo la sesión creada por este cliente, nunca todas las sesiones.
      await liberarTemporal();
      if (!activa(d) || !await revalidarPrivilegioParaEscritura() || !activa(d)) throw { code:'acceso_sesion' };
      const final = await sesionPrincipal(d.id);
      if (!activa(d) || final.token !== antes.token) throw { code:'acceso_sesion' };
      visita = { id:d.id, token:final.token };
      solicitud = null; retirar(d);
      entrando = true;
      try { navigateTo('admin'); } finally { entrando = false; }
      window.AdminCorreosVerificados?.actualizarSesion();
    } catch (error) {
      if (!activa(d)) return;
      let texto = 'No se pudo verificar el acceso. Comprueba tu conexión y vuelve a intentarlo.';
      if (error.code === 'acceso_password') texto = 'Contraseña incorrecta. Inténtalo nuevamente';
      else if (error.code === 'acceso_google') texto = 'Contraseña incorrecta. Inténtalo nuevamente. Si tu cuenta usa solo Google y no tiene contraseña, este método no permite acceder; requiere un mecanismo de reautenticación compatible.';
      else if (error.code === 'acceso_sesion') texto = 'La sesión o los permisos cambiaron. Vuelve a iniciar la verificación.';
      else if (error.status === 429 || String(error.code || '').includes('rate_limit')) texto = 'Demasiados intentos. Espera antes de volver a verificar.';
      mensaje(d, texto);
    } finally {
      password = ''; campo.value = '';
      try { await liberarTemporal(); } catch (_) { /* Sin reintentos ni cambios a la sesión operativa. */ }
      if (activa(d)) {
        d.ocupada = false; boton.disabled = false; campo.disabled = false; boton.textContent = 'Verificar acceso'; campo.focus();
      }
    }
  }
  window.supabaseClient.auth.onAuthStateChange((evento, sesion) => {
    const id = visita?.id || solicitud?.id;
    if (evento === 'SIGNED_OUT' || id && sesion?.user?.id && sesion.user.id !== id ||
        evento === 'SIGNED_IN' && (visita || solicitud?.sesionToken) && sesion?.access_token !== (visita?.token || solicitud?.sesionToken)) invalidar();
    else if (evento === 'TOKEN_REFRESHED' && visita && sesion?.user?.id === visita.id) visita.token = sesion.access_token;
  });
  window.addEventListener('pagehide', invalidar);
  const revisarRuta = () => { if (window.location.hash !== '#admin' && (visita || solicitud)) invalidar(); };
  window.addEventListener('hashchange', revisarRuta);
  window.addEventListener('popstate', revisarRuta);
  return { vigente, solicitar, invalidar, revisar };
})();

function adminAccesoVigente() { return window.AdminAcceso.vigente(); }

// Misma implementación e iconos del login; compartidos por los dos diálogos administrativos.
function togglePasswordVisibility(inputId, iconId) {
      const input = document.getElementById(inputId);
      const iconWrap = document.getElementById(iconId);
      if (!input || !iconWrap) return;

      // Si estaba oculta, el clic la hace visible.
      const nowVisible = input.type === 'password';
      input.type = nowVisible ? 'text' : 'password';

      const svgShow = iconWrap.querySelector('[data-eye-icon="show"]'); // ojo abierto
      const svgHide = iconWrap.querySelector('[data-eye-icon="hide"]'); // ojo tachado
      if (svgShow) svgShow.style.display = nowVisible ? 'none' : '';
      if (svgHide) svgHide.style.display = nowVisible ? '' : 'none';

      // Accesibilidad: la etiqueta describe la ACCIÓN que realizará el clic.
      const btn = iconWrap.closest('button');
      if (btn) {
        const label = nowVisible ? 'Ocultar contraseña' : 'Mostrar contraseña';
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
        btn.setAttribute('aria-pressed', String(nowVisible));
      }
    }

function adminPasswordEyeHTML(inputId, iconId) {
  return `<button type="button" onclick="togglePasswordVisibility('${inputId}', '${iconId}')"
                class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                aria-label="Mostrar contraseña" aria-controls="${inputId}" aria-pressed="false"
                title="Mostrar contraseña">
                <span id="${iconId}" class="flex items-center justify-center w-5 h-5">
                  <!-- Ojo ABIERTO: contraseña OCULTA → el clic la muestra -->
                  <svg data-eye-icon="show" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  <!-- Ojo TACHADO (eye-off): contraseña VISIBLE → el clic la oculta -->
                  <svg data-eye-icon="hide" style="display:none" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
                    <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
                    <path d="m2 2 20 20"></path>
                  </svg>
                </span>
              </button>`;
}
