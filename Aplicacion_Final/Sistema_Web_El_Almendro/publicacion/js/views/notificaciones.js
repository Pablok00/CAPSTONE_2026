function renderNotificationsView() {
  if (esAdminOperativoActual()) {
    return `<div class="alm-ui alm-main-page alm-module-page space-y-4 pb-10">${uiEncabezadoSeccion('Notificaciones','Avisos de solicitudes pendientes de revisión.','bell')}<section class="alm-panel p-5 sm:p-6"><div id="avisos-solicitudes-lista" class="space-y-3">${window.AvisosSolicitudes?.contenidoLista() || 'Cargando avisos…'}</div></section></div>`;
  }
  return `<div class="alm-ui alm-main-page alm-module-page space-y-4 pb-10">${uiEncabezadoSeccion('Notificaciones','Información y avisos de tu cuenta.','bell')}<section class="alm-panel p-5 sm:p-6"><p role="status" class="text-sm alm-muted leading-relaxed">La gestión de notificaciones estará disponible en próximas actualizaciones del sistema.</p></section></div>`;
}
function renderTopbarNotifications() {
  window.AvisosSolicitudes?.pintar();
}
