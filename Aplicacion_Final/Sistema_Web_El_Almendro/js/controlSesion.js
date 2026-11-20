// Guard de documentos: no administra roles ni escribe en Supabase.
(function () {
  const raiz = document.documentElement;
  const pagina = raiz.dataset.authPage;
  if (!['login', 'app'].includes(pagina) || raiz.dataset.authRecovery === 'true') return;
  const auth = window.supabaseClient?.auth;
  let saliendo = false;
  function ocultar() { raiz.classList.add('auth-pending'); }
  function irLogin() { if (saliendo) return; ocultar(); saliendo = true; window.location.replace('login.html'); }
  function alEstarListo(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }
  function mostrarError() {
    alEstarListo(() => {
      if (saliendo) return;
      if (pagina === 'app') {
        document.body.innerHTML = '';
        const panel = document.createElement('main');
        panel.setAttribute('role', 'alert');
        panel.style.cssText = 'padding:24px;max-width:640px;margin:40px auto';
        const mensaje = document.createElement('p');
        mensaje.textContent = 'No se pudo verificar la sesión. Comprueba tu conexión y vuelve a intentar.';
        const boton = document.createElement('button');
        boton.type = 'button'; boton.textContent = 'Reintentar';
        boton.addEventListener('click', () => window.location.reload());
        panel.appendChild(mensaje); panel.appendChild(boton); document.body.appendChild(panel);
      } else {
        const mensaje = document.getElementById('login-session-status');
        if (mensaje) { mensaje.hidden = false; mensaje.textContent = 'No se pudo verificar la sesión existente. Comprueba tu conexión antes de continuar.'; }
      }
      raiz.classList.remove('auth-pending');
    });
  }
  ocultar();
  window.hotelSesionLista = (async () => {
    try {
      if (!auth) throw Error('auth_unavailable');
      const sesion = await auth.getSession();
      if (saliendo) return false;
      if (sesion.error) throw sesion.error;
      if (!sesion.data?.session) {
        if (pagina === 'app') irLogin(); else raiz.classList.remove('auth-pending');
        return false;
      }
      const usuario = await auth.getUser();
      if (saliendo) return false;
      if (usuario.error && usuario.error.status !== 401 && usuario.error.status !== 403) throw usuario.error;
      if (usuario.error || !usuario.data?.user) {
        if (pagina === 'app') irLogin(); else raiz.classList.remove('auth-pending');
        return false;
      }
      if (pagina === 'login') {
        const perfil = await window.supabaseClient.from('usuarios').select('id, estado, rol_id').eq('id', usuario.data.user.id).maybeSingle();
        if (saliendo) return false;
        if (perfil.error) throw perfil.error;
        if (perfil.data?.id === usuario.data.user.id && perfil.data.estado === true) {
          saliendo = true; window.location.replace('index.html#dashboard');
        } else raiz.classList.remove('auth-pending');
        return false;
      }
      return true; // app.js verifica perfil, rol y vigencia antes de mostrar la SPA.
    } catch (_) { mostrarError(); return false; }
  })();
  window.addEventListener('pagehide', ocultar);
  window.addEventListener('pageshow', evento => {
    if (!evento.persisted) return;
    ocultar(); window.location.reload(); // Revalidar sin agregar entradas al historial.
  });
  if (pagina === 'app' && auth?.onAuthStateChange) {
    auth.onAuthStateChange(evento => {
      if (evento === 'SIGNED_OUT') irLogin();
    });
  }
})();
