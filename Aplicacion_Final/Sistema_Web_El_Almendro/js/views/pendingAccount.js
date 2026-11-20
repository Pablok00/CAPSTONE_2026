// ==========================================================
// VISTA: CUENTA PENDIENTE DE APROBACIÓN — HOTEL EL ALMENDRO
// ==========================================================
// FASE S3C-0D. Pantalla ÚNICA para una cuenta con:
// - public.usuarios.estado = true y
// - public.usuarios.rol_id = NULL   → PENDIENTE DE APROBACIÓN
// y también para una cuenta cuyo estado no pudo verificarse
// (fallo de red/permisos al leer la fila propia).
//
// La presentación no consulta datos operativos. El reenvío explícito verifica la sesión
// mediante Auth y reutiliza auth.resend; no ejecuta services operativos.
// NO consulta public.roles. NO muestra módulos, cards, sidebar,
// estadísticas, usuarios ni datos operativos del Hotel.
// Solo recibe el email YA obtenido de public.usuarios (o de
// Supabase Auth) y lo inserta escapado.
//
// IMPORTANTE: esta pantalla es PRESENTACIÓN. La barrera real de
// datos es RLS (public.usuario_habilitado_actual()) en Supabase.
// Ocultar la UI no es seguridad.

// Escape mínimo para insertar texto (email) en innerHTML.
function pendingEscapeHTML(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.PendingAccountView = {
  // Elementos globales del layout operativo que se ocultan de forma
  // controlada (NO se eliminan del DOM, para no romper la app).
  // #sidebar           → navegación lateral completa (incluye Panel Admin)
  // #sidebar-backdrop  → fondo del menú móvil
  // #topbar      → header: título de módulo, buscador global,
  //                pill de usuario, campana de notificaciones,
  //                accesos rápidos, dark mode y botón Salir.
  async reenviar(boton) {
    const mensaje = document.getElementById('pending-verification-message');
    if (!mensaje || boton.disabled) return;
    boton.disabled = true;
    try {
      const { data, error } = await window.supabaseClient.auth.getUser();
      if (error || !data?.user?.email) throw new Error();
      if (data.user.invited_at) { mensaje.textContent = 'Solicita un nuevo enlace de invitación al Administrador. No se ha enviado ningún correo.'; return; }
      if (data.user.email_confirmed_at) { mensaje.textContent = 'Tu correo ya está verificado. Vuelve a ingresar para actualizar el estado.'; return; }
      await window.reenviarCorreoVerificacion(data.user.email, boton, mensaje);
    } catch (_) { mensaje.textContent = 'No fue posible verificar tu sesión. Puedes solicitar el correo desde Ingresar.'; }
    finally { boton.disabled = false; window.actualizarContadorCorreo?.(); }
  },
  _idsOperativos: ['sidebar', 'sidebar-backdrop', 'topbar'],

  // ----------------------------------------------------------
  // ocultarLayoutOperativa()
  // Oculta sidebar, backdrop y topbar mientras la cuenta está
  // pendiente. Se usa la clase 'hidden' de Tailwind (display:none)
  // en todos los breakpoints, incluso en desktop.
  // ----------------------------------------------------------
  ocultarLayoutOperativa() {
    this._idsOperativos.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  },

  // ----------------------------------------------------------
  // mostrarLayoutOperativa()
  // Restaura el layout (por si la misma sesión pasa a aprobada
  // tras recargar la página).
  // ----------------------------------------------------------
  mostrarLayoutOperativa() {
    this._idsOperativos.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('hidden');
    });
  },

  // ----------------------------------------------------------
  // render(email, opciones)
  // Devuelve el HTML de la pantalla de cuenta pendiente.
  // - email: correo real de la cuenta (ya escapado al insertarse).
  // - opciones.mensaje: mensaje adicional opcional (p. ej. fallo
  //   de verificación del perfil). NUNCA se construye desde datos
  //   de usuario sin escapar.
  // ----------------------------------------------------------
  render(email, opciones = {}) {
    const sinVerificar = opciones.correoVerificado === false;
    const emailVisible = pendingEscapeHTML(email || 'Cuenta sin correo registrado');
    const mensajeAdicional = (opciones && opciones.mensaje)
      ? `<p class="text-sm font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl px-3 py-2">${pendingEscapeHTML(opciones.mensaje)}</p>`
      : '';

    return `
      <div class="min-h-full w-full flex items-center justify-center">
        <div class="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">

          <!-- Branding del Hotel -->
          <div class="p-6 bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center space-x-3">
            <div data-pending-brand-icon class="w-12 h-12 rounded-xl bg-slate-950/80 text-white flex items-center justify-center text-2xl shadow-lg"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 22v-6.57M12 11h.01M12 7h.01M14 15.43V22M15 16a5 5 0 0 0-6 0M16 11h.01M16 7h.01M8 11h.01M8 7h.01"/><rect x="4" y="2" width="16" height="20" rx="2"/></svg></div>
            <div>
              <h1 class="font-bold text-slate-950 text-lg leading-tight">El Almendro</h1>
              <p class="text-xs text-slate-800/80 font-semibold">Hotel &amp; Centro de Eventos</p>
            </div>
          </div>

          <!-- Contenido -->
          <div class="p-6 sm:p-8 text-center space-y-4">
            <div data-pending-wait-icon class="mx-auto w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>

            <h2 class="text-lg sm:text-xl font-bold text-slate-800 dark:text-white">
              ${sinVerificar ? 'Verifica tu correo electrónico' : opciones.registroIncompleto ? 'Registro incompleto' : 'Cuenta pendiente de aprobación'}
            </h2>

            <p class="text-sm text-slate-600 dark:text-slate-400">
              ${opciones.registroIncompleto ? 'Tu identidad invitada existe, pero el registro aún no está completo.' : 'Tu cuenta fue registrada correctamente.'}
            </p>
            <p class="text-sm text-slate-600 dark:text-slate-400">
              ${sinVerificar ? 'Confirma el enlace enviado a tu correo. Después, un administrador deberá aprobar tu cuenta.' : opciones.registroIncompleto ? 'Tu correo está verificado, pero falta completar tu registro antes de la aprobación administrativa.' : 'Un administrador debe revisar tu solicitud y asignarte los accesos correspondientes antes de que puedas utilizar el sistema.'}
            </p>

            ${mensajeAdicional}

            <!-- Cuenta (email real) -->
            <div class="pt-4 border-t border-slate-100 dark:border-slate-800 text-left">
              <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Cuenta</p>
              <p class="text-sm font-semibold text-slate-800 dark:text-slate-200 break-all">${emailVisible}</p>
            </div>

            ${sinVerificar && email && !opciones.esInvitacion ? '<button type="button" data-reenvio-signup onclick="PendingAccountView.reenviar(this)" class="w-full py-2 text-sm font-bold text-blue-600 dark:text-blue-400">Volver a enviar enlace</button><p id="pending-verification-message" role="status" aria-live="polite" class="text-sm text-slate-600 dark:text-slate-300"></p>' : ''}
            ${sinVerificar && opciones.esInvitacion ? '<p class="text-sm text-slate-600 dark:text-slate-400">Solicita al Administrador un nuevo enlace para completar tu invitación.</p>' : ''}
            ${!sinVerificar && opciones.registroIncompleto ? '<a href="./registrar.html" class="block text-sm font-bold text-blue-600 dark:text-blue-400">Continuar mi registro</a>' : ''}
            <!-- Cerrar sesión -->
            <button onclick="handleLogout()"
              class="w-full mt-2 inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-sm font-bold transition-all shadow-sm">
              <span>Cerrar sesión</span>
            </button>
          </div>

        </div>
      </div>
    `;
  }
};
