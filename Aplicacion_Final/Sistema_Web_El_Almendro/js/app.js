// UX-02: las ventanas solo se cierran con controles explícitos o tras guardar.
// Esta regla sustituye las referencias históricas a cierre por fondo o Escape.
// ==========================================================
// APP PRINCIPAL & ENRUTADOR - HOTEL EL ALMENDRO
// ==========================================================

// ==========================================================
// BLOQUEO DE CUENTAS SIN ROL (PENDIENTES)
// ==========================================================
// Bandera de CUENTA PENDIENTE o NO VERIFICABLE:
// - public.usuarios.estado = true y rol_id = NULL → PENDIENTE
// - fallo al leer la propia fila (red / permisos) → NO VERIFICABLE
// Mientras sea true la app NO ejecuta ningún service operativo ni
// renderiza módulos: solo la pantalla de cuenta pendiente.
// NO se guarda en `state` porque saveState() serializa state
// completo a localStorage; es una bandera de ejecución, no datos.
let cuentaPendiente = false;
let sesionNoVerificable = false;
let sesionEnReconexion = false;
let delegacionesSesionPropias = [];
let interfazSesionInicializada = false;

// ¿La sesión actual carece de rol verificable?
// Cualquier cuenta SIN_ROL (pendiente, error de verificación o rol
// desconocido en BD) queda sin acceso a módulos. Denegar por defecto.
function esCuentaSinRol() {
  return sesionNoVerificable || sesionEnReconexion || cuentaPendiente === true
    || !state
    || !state.currentUser
    || state.currentUser.role === 'SIN_ROL';
}

// Permission map and helper dinámico y escalable
// ==========================================================
// S3C-2C — ESTADO ADMINISTRATIVO (PERMANENTE vs TEMPORAL)
// ==========================================================
// Fuente REAL: RPC public.mi_estado_administrativo() (reloj del
// servidor PostgreSQL). El frontend SÓLO refleja ese resultado en
// state.currentUser (esAdminPermanente / esAdminTemporal /
// adminTemporalHasta). NUNCA decide vigencia con el reloj del
// navegador: si el backend dice que venció, venció.
// Fail closed: si la carga inicial falla, todos quedan en false.
//
// Permiso PERMANENTE: reservado a funciones de DELEGACIÓN
// (otorgar/revocar administración temporal). Sólo se cumple con
// esAdminPermanente === true (NUNCA con role, NUNCA con temporal).
function esAdminPermanenteActual() {
  return !sesionNoVerificable && !sesionEnReconexion && !!(state && state.currentUser && state.currentUser.esAdminPermanente === true);
}

// Permiso TEMPORAL: delegación vigente reportada por el backend.
function esAdminTemporalActual() {
  return !sesionNoVerificable && !sesionEnReconexion && !!(state && state.currentUser && state.currentUser.esAdminTemporal === true);
}

// Permiso OPERATIVO: permanente O temporal vigente. Es el que da
// acceso a módulos operativos administrativos (Trabajadores…).
// Un Administrador TEMPORAL es administrador operativo, pero NO
// administrador permanente (no puede delegar).
function esAdminOperativoActual() {
  return esAdminPermanenteActual() || esAdminTemporalActual();
}

function esRecepcionRestringida() {
  return state.currentUser?.role === 'RECEPCION' && !esAdminOperativoActual();
}

// Permission map and helper dinámico y escalable (Roles + Permisos individuales)
function hasAccess(view, role, permitirConfiguracionPersonal = true) {
  if (sesionEnReconexion) return false;
  if (sesionNoVerificable) return view === 'pending-account';
  // S3C-0D: SIN_ROL (cuenta pendiente de aprobación o sin rol
  // verificable) solo puede ver la pantalla de cuenta pendiente.
  // NUNCA un módulo operativo. (Antes: 'dashboard' era fallback
  // permitido para cualquier rol desconocido.)
  if (!role || role === 'SIN_ROL') {
    return view === 'pending-account';
  }
  // La delegación vigente conserva sus permisos; fuera de ella no se
  // admiten ampliaciones mediante permisos locales personalizados.
  if (role === 'RECEPCION' && !esAdminOperativoActual()) {
    return view === 'solicitudes' || (view === 'configuracion' && permitirConfiguracionPersonal);
  }
  if (view === 'activos') return false; // UX-04: módulo retirado de navegación.

  // Gestión de cuentas: permanente, antes de permisos personalizados.
  if (view === 'admin') return esAdminPermanenteActual();
  if (view === 'tareas-pendientes') return window.GestionTareas?.puede() === true;

  // AUTH-2A.2: entrada personal; no concede permisos a las secciones previas.
  // El tercer parámetro false conserva la evaluación administrativa original.
  if (view === 'configuracion' && permitirConfiguracionPersonal && state.currentUser &&
      state.currentUser.id && state.currentUser.role === role) return true;

  // Prioridad 1: Permisos granulares personalizados del colaborador actual
  if (state.currentUser && state.currentUser.permissions && Array.isArray(state.currentUser.permissions.modules)) {
    return state.currentUser.permissions.modules.includes(view);
  }

  const roles = window.SYSTEM_ROLES || (typeof SYSTEM_ROLES !== 'undefined' ? SYSTEM_ROLES : []);

  // S3C-2C: administrador OPERATIVO (permanente O temporal vigente).
  // Durante su vigencia recibe el set de módulos del Administrador,
  // INDEPENDIENTE del rol permanente (TECNICO o RECEPCION). Esto
  // NO aplica a cuentas SIN_ROL (ya retornadas arriba) ni concede
  // capacidades de delegación (eso es esAdminPermanenteActual()).
  if (esAdminOperativoActual()) {
    const roleConfig = roles.find(r => r.id === 'ADMINISTRADOR');
    if (roleConfig) return roleConfig.permissions.includes(view);
  }

  // Prioridad 2: Configuración por rol del sistema
  const roleConfig = roles.find(r => r.id === role);
  if (!roleConfig) {
    // Rol sin configuración: ACCESO DENEGADO a todo módulo.
    // Nunca se asume Administrador ni se concede el Dashboard.
    return false;
  }
  return roleConfig.permissions.includes(view);
}

function hasActionPermission(actionId) {
  // S3C-0D: una cuenta SIN_ROL jamás tiene acciones permitidas.
  if (esCuentaSinRol()) return false;
  if (esRecepcionRestringida()) return false;
  // S3C-2C: administrador OPERATIVO (permanente O temporal vigente)
  // tiene las acciones administrativas operativas del sistema.
  // Las acciones de DELEGACIÓN (otorgar/revocar administración
  // temporal) NO pasan por aquí: se controlan con
  // esAdminPermanenteActual() en la vista del Panel Admin.
  if (esAdminOperativoActual()) return true;
  if (state.currentUser && state.currentUser.permissions && Array.isArray(state.currentUser.permissions.actions)) {
    return state.currentUser.permissions.actions.includes(actionId);
  }
  return false;
}

function updateSidebarVisibility() {
  // S3C-0D: fallback seguro 'SIN_ROL' (antes 'ADMINISTRADOR').
  // Con SIN_ROL, hasAccess() deniega todos los .nav-item.
  const role = state.currentUser?.role || 'SIN_ROL';
  document.querySelectorAll('.nav-item').forEach(btn => {
    const viewName = btn.dataset?.view || btn.id?.replace('nav-','');
    if (viewName && !hasAccess(viewName, role)) {
      btn.classList.add('hidden');
    } else {
      btn.classList.remove('hidden');
    }
  });
  const campana = document.getElementById('btn-notification-dropdown');
  if (campana) campana.parentElement.classList.toggle('hidden', esCuentaSinRol());
}

function toggleMobileSidebar(forceState) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;

  const isClosed = sidebar.classList.contains('-translate-x-full');
  const shouldOpen = (typeof forceState === 'boolean') ? forceState : isClosed;

  if (shouldOpen) {
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0');
    if (backdrop) backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    sidebar.classList.remove('translate-x-0');
    if (backdrop) backdrop.classList.add('hidden');
  }
}

// ==========================================================
// S3C-0D — PANTALLA DE CUENTA PENDIENTE
// ==========================================================
// Dibuja ÚNICAMENTE la pantalla de cuenta pendiente de aprobación
// (o de cuenta no verificable), oculta el layout operativo y fija
// el hash a #pending-account sin disparar hashchange (replaceState).
// NO ejecuta ningún service operativo ni consulta Supabase: el
// email proviene del perfil YA cargado en state.currentUser.
function renderPantallaCuentaPendiente(mensaje) {
  cuentaPendiente = true;
  currentView = 'pending-account';

  if (window.PendingAccountView) {
    window.PendingAccountView.ocultarLayoutOperativa();
  }

  // Fijar el hash sin disparar hashchange (evita bucles de eventos)
  // y evita dejar visible una URL como #admin o #dashboard.
  if (window.location.hash !== '#pending-account') {
    try {
      history.replaceState(null, '', '#pending-account');
    } catch (e) {
      window.location.hash = 'pending-account';
    }
  }

  const container = document.getElementById('view-container');
  if (container && window.PendingAccountView) {
    const email = (state && state.currentUser && state.currentUser.email) || null;
    container.innerHTML = window.PendingAccountView.render(email, { mensaje, correoVerificado: state.currentUser?.correoVerificado, esInvitacion: state.currentUser?.esInvitacion, registroIncompleto: state.currentUser?.esInvitacion === true && !state.currentUser?.nombreRegistrado });
    window.prepararReenviosCorreo?.(container);
  }

  // FASE S3C-0D: la página ya está lista para mostrarse (solo con la
  // pantalla pendiente renderizada; sin destello del layout operativo).
  document.documentElement.classList.remove('auth-pending');
}

function restaurarNavegacionHistorial() {
  const vista = window.location.hash.replace('#', '') || 'dashboard';
  const contexto = window.history.state || {};
  const subVista = vista === 'areas' && ['maquinas', 'jardineria'].includes(contexto.areaSubVista)
    ? contexto.areaSubVista : null;
  const ficha = vista === 'areas' && !subVista && contexto.areaFicha === 'workarea_reactiva'
    ? contexto.areaFicha : null;
  if (vista !== currentView || (vista === 'areas' &&
      (subVista !== areaSubVista || ficha !== activeAreaFilter))) {
    navigateTo(vista, ficha, subVista, true);
  }
}

// UI-12: cabecera visual compartida; no modifica datos ni permisos.
function uiEncabezadoSeccion(titulo, descripcion, icono, acciones = '') {
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const trazos = {
    wrench:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    box:'<path d="m3 7 9-5 9 5v10l-9 5-9-5Z"/><path d="m3 7 9 5 9-5M12 12v10M7.5 4.5l9 5"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h2M14 14h2M8 18h2"/>',
    folder:'<path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z"/>',
    shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 8l5-5 5 5M12 3v12"/>',
    clipboard:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M8 12h8M8 16h5"/>',
    tree:'<path d="m12 2 7 9h-4l5 7H4l5-7H5Z M12 18v4"/>',
    settings:'<path d="m9 3 1-1h4l1 1v2l2 1 2-1 2 3-1 2v3l1 2-2 3-2-1-2 1v2l-1 1h-4l-1-1v-2l-2-1-2 1-2-3 1-2v-3L3 8l2-3 2 1 2-1Z"/><circle cx="12" cy="11" r="3"/>'
  };
  return '<header class="alm-panel alm-page-heading"><div class="alm-heading-main"><span class="alm-module-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (trazos[icono] || trazos.folder) + '</svg></span><div class="alm-heading-text"><h2 class="alm-title">' + esc(titulo) + '</h2><p class="alm-muted">' + esc(descripcion) + '</p></div></div>' + (acciones ? '<div class="alm-heading-actions">' + acciones + '</div>' : '') + '</header>';
}

function navigateTo(viewName, filterAreaId = null, subVista = null, desdeHistorial = false) {
  if (sesionNoVerificable || sesionEnReconexion) return;
  if (viewName === 'areas' && !['maquinas','jardineria'].includes(subVista) && filterAreaId !== 'workarea_reactiva') {
    if (filterAreaId === 'workarea_maquinas' || filterAreaId === 'workarea_jardineria') {
      subVista = filterAreaId === 'workarea_maquinas' ? 'maquinas' : 'jardineria'; filterAreaId = null;
      window.history.replaceState({ ...(window.history.state || {}), areaSubVista:subVista, areaFicha:null },'','#areas');
    } else {
      viewName = ({ workarea_mejoras:'mejoras', workarea_remodelacion:'remodelaciones' })[filterAreaId] || 'mantenciones';
      filterAreaId = null; subVista = null;
      window.history.replaceState(null,'','#' + viewName); desdeHistorial = true;
    }
  }
  if (esRecepcionRestringida() && !hasAccess(viewName, 'RECEPCION')) {
    viewName = 'solicitudes'; filterAreaId = null; subVista = null;
    window.history.replaceState(null, '', '#solicitudes');
    desdeHistorial = true;
  }
  if (viewName === 'activos') {
    viewName = 'dashboard'; filterAreaId = null; subVista = null;
    window.history.replaceState(null, '', '#dashboard');
  }
  // Ruta retirada: tampoco se habilita con permisos personalizados antiguos.
  if (viewName === 'fechas-proximas') return;
  // Cerrar sidebar móvil si estaba abierto
  toggleMobileSidebar(false);

  // Cerrar dropdown de notificaciones si estaba abierto
  const nDrop = document.getElementById('notification-dropdown');
  if (nDrop) nDrop.classList.add('hidden');

  // S3C-0D: fallback seguro 'SIN_ROL' (antes 'ADMINISTRADOR').
  const role = state.currentUser?.role || 'SIN_ROL';
  if (!hasAccess(viewName, role)) {
    // S3C-0D: cuenta SIN_ROL → jamás se renderiza un módulo operativo
    // (ni con navigateTo() invocado desde consola). Se redirige en
    // silencio a la pantalla de cuenta pendiente, sin alertas.
    if (!role || role === 'SIN_ROL') {
      renderPantallaCuentaPendiente();
      return;
    }
    alert('Acceso denegado: su rol no permite ver esta sección');
    return;
  }

  // S2B: Se eliminó el gate de PIN maestro para el Panel de
  // Administración (PIN 1234 hardcodeado + verificación por
  // contraseña mock). El acceso depende ÚNICAMENTE de
  // hasAccess('admin'), que evalúa state.currentUser.role REAL
  // (perfil de Supabase Auth → public.usuarios → public.roles).
  // Las operaciones reales siguen protegidas por RLS.

  if (viewName === 'admin' && !window.AdminAcceso?.vigente()) {
    window.AdminAcceso?.solicitar(); return;
  }
  if (viewName !== 'admin') window.AdminAcceso?.invalidar();
  currentView = viewName;
  if (typeof closeModal === 'function') closeModal('modal-area-detail');
  if (filterAreaId !== undefined) {
    activeAreaFilter = filterAreaId;
  }

  // UX-04: reutilizar las subvistas existentes sin cambiar sus permisos.
  if (typeof areaSubVista !== 'undefined') {
    areaSubVista = (viewName === 'areas' && subVista) ? subVista : null;
  }

  // Las subvistas existentes comparten #areas. Guardar su contexto en
  // cada entrada del historial evita perderlo al volver o avanzar.
  const contexto = { areaSubVista: viewName === 'areas' ? subVista : null,
    areaFicha: viewName === 'areas' && filterAreaId === 'workarea_reactiva' ? filterAreaId : null };
  const previo = window.history.state || {};
  if (!desdeHistorial && (window.location.hash !== `#${viewName}` ||
      (previo.areaSubVista || null) !== contexto.areaSubVista || (previo.areaFicha || null) !== contexto.areaFicha)) {
    window.history.pushState(contexto, '', `#${viewName}`);
  }
  
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.remove('bg-blue-600/20', 'text-blue-400', 'border', 'border-blue-500/30');
  });
  const navId = viewName === 'areas'
    ? (subVista === 'maquinas' ? 'maquinas' : subVista === 'jardineria' ? 'jardineria' : contexto.areaFicha ? 'reactiva' : 'areas')
    : viewName;
  const activeNav = document.getElementById(`nav-${navId}`);
  if (activeNav) {
    activeNav.classList.add('bg-blue-600/20', 'text-blue-400', 'border', 'border-blue-500/30');
  }

  renderCurrentView();
}

function renderCurrentView() {
  if (sesionNoVerificable) return;
  if (currentView === 'areas' && !['maquinas','jardineria'].includes(areaSubVista) && activeAreaFilter !== 'workarea_reactiva') { navigateTo('areas',activeAreaFilter,null,true); return; }
  // S3C-0D: BLOQUEO DEFENSIVO. Ningún módulo se renderiza con una
  // cuenta SIN_ROL (pendiente o no verificable), aunque se llame a
  // renderCurrentView() directamente desde consola.
  if (esCuentaSinRol()) {
    renderPantallaCuentaPendiente();
    return;
  }

  // Comprobar también el renderizado inicial y las llamadas directas,
  // antes de ejecutar cualquier vista o servicio del módulo solicitado.
  if (!hasAccess(currentView, state.currentUser.role)) {
    const destino = esRecepcionRestringida() ? 'solicitudes'
      : ['dashboard', 'mantenciones', 'solicitudes', 'configuracion'].find(v => hasAccess(v, state.currentUser.role));
    if (destino) {
      window.history.replaceState(null, '', '#' + destino);
      navigateTo(destino, null, null, true);
    } else {
      updateSidebarVisibility();
      const contenedor = document.getElementById('view-container');
      if (contenedor) contenedor.textContent = 'No tienes acceso a este apartado.';
    }
    return;
  }

  if (currentView === 'admin' && !window.AdminAcceso?.vigente()) {
    window.AdminAcceso?.solicitar(); return;
  }
  if (currentView !== 'admin') window.AdminAcceso?.invalidar();
  updateSidebarVisibility();
  const container = document.getElementById('view-container');
  const pageIcon = document.getElementById('page-icon');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');

  switch (currentView) {
    case 'dashboard':
      pageIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="1.15em" height="1.15em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 22v-6.57M12 11h.01M12 7h.01M14 15.43V22M15 16a5 5 0 0 0-6 0M16 11h.01M16 7h.01M8 11h.01M8 7h.01"/><rect x="4" y="2" width="16" height="20" rx="2"/></svg>';
      pageTitle.textContent = 'Panel Principal - Hotel El Almendro';
      pageSubtitle.textContent = 'Navegación visual por los tres pilares de trabajo y resúmenes';
      container.innerHTML = renderDashboardView();
      break;

    case 'admin':
      pageIcon.textContent = '🛡️';
      pageTitle.textContent = 'Panel de Administración & Roles';
      pageSubtitle.textContent = 'Control centralizado de usuarios, permisos y capacidades operativas';
      container.innerHTML = typeof renderAdminView === 'function' ? renderAdminView() : '<div class="p-8 text-center"><p class="text-slate-500">Módulo de administración no cargado</p></div>';
      break;

    case 'mantenciones':
      pageIcon.textContent = '🔧';
      pageTitle.textContent = 'Mantención General';
      pageSubtitle.textContent = 'Resumen real y navegación por subapartados de mantención del hotel';
      container.innerHTML = renderMaintenancesView();
      break;

    case 'mejoras':
      pageIcon.textContent = '🌿';
      pageTitle.textContent = 'Mejoras y Proyectos Nuevos';
      pageSubtitle.textContent = 'Obras, quincho, pérgolas, jardinería y conectividad';
      container.innerHTML = renderImprovementsView();
      break;

    case 'remodelaciones':
      pageIcon.textContent = '🏗️';
      pageTitle.textContent = 'Remodelaciones de Espacios';
      pageSubtitle.textContent = 'Renovación de habitaciones, salones y calculadora de materiales';
      container.innerHTML = renderRenovationsView();
      break;

    case 'activos':
      navigateTo('dashboard');
      return;

    // INV-4: módulo principal Inventario (bodegas). Catálogo de productos
    // en tarjetas + ficha en modal; modo lectura (INV-4). La autorización
    // real la define Supabase (inventario_puede_consultar); aquí solo se
    // registra la vista para la navegación.
    case 'inventario':
      pageIcon.textContent = '📦';
      pageTitle.textContent = 'Inventario';
      pageSubtitle.textContent = 'Catálogo de productos, existencias verificadas y movimientos operativos';
      container.innerHTML = renderInventarioView();
      break;

    case 'areas':
      // C2E-4D: dentro de "Áreas de Trabajo" existe la sub-vista interna
      // "Mantención de Máquinas" (pantalla completa, sin ruta nueva en la
      // barra lateral). El título y el ícono de la topbar reflejan la
      // sub-vista activa; la opción del sidebar sigue marcando Áreas.
      pageIcon.textContent = (typeof areaSubVista !== 'undefined' && areaSubVista === 'maquinas') ? '⚙️' : '📍';
      pageTitle.textContent = (typeof areaSubVista !== 'undefined' && areaSubVista === 'maquinas')
        ? 'Mantención de Máquinas'
        : 'Áreas de Trabajo';
      pageSubtitle.textContent = (typeof areaSubVista !== 'undefined' && areaSubVista === 'maquinas')
        ? 'Catálogo de equipos, fichas individuales e historial importado'
        : 'Unidades base de gestión operativa y mantenimiento de El Almendro';
      if (typeof areaSubVista !== 'undefined' && areaSubVista === 'jardineria') {
        pageIcon.textContent = '🌳';
        pageTitle.textContent = 'Mantención de Jardinería';
        pageSubtitle.textContent = 'Sectores, trabajos definidos, riego y labores documentales';
      }
      if (activeAreaFilter === 'workarea_reactiva' && !areaSubVista) {
        pageIcon.textContent = '⚡';
        pageTitle.textContent = 'Mantención Reactiva';
        pageSubtitle.textContent = 'Consulta de mantenciones y antecedentes de solicitudes aprobadas';
        container.innerHTML = renderReactivaView();
      } else container.innerHTML = renderAreasView();
      break;

    case 'trabajadores':
      pageIcon.textContent = '👥';
      pageTitle.textContent = 'Trabajadores';
      pageSubtitle.textContent = 'Personal registrado del Hotel El Almendro';
      container.innerHTML = renderTrabajadoresView();
      break;

    case 'prevencionista':
      pageIcon.textContent = '📋';
      pageTitle.textContent = 'Prevencionista';
      pageSubtitle.textContent = 'Planificación y documentación preventiva';
      container.innerHTML = renderPrevencionistaView();
      break;

    case 'tareas-pendientes':
      pageIcon.textContent = '✅';
      pageTitle.textContent = 'Gestión de Tareas';
      pageSubtitle.textContent = 'Organiza los trabajos generales pendientes del hotel.';
      if (!esAdminOperativoActual()) pageSubtitle.textContent = 'Mi trabajo';
      container.innerHTML = renderGestionTareas();
      iniciarGestionTareas();
      break;

    case 'gantt':
      pageIcon.textContent = '📈';
      pageTitle.textContent = 'Línea de Tiempo & Diagrama Visual Gantt';
      pageSubtitle.textContent = 'Visualización 100% gráfica de obras y mantenciones sin listas ni tablas';
      container.innerHTML = renderGanttView();
      break;

    case 'solicitudes':
      pageIcon.textContent = '📩';
      pageTitle.textContent = 'Solicitudes de Personal y Huéspedes';
      pageSubtitle.textContent = 'Registro y consulta de solicitudes';
      container.innerHTML = renderRequestsView();
      break;

    case 'notificaciones':
      pageIcon.textContent = '🔔';
      pageTitle.textContent = 'Centro de Notificaciones y Alertas';
      pageSubtitle.textContent = esAdminOperativoActual() ? 'Avisos de solicitudes pendientes de revisión' : 'Gestión de notificaciones pendiente de implementación';
      container.innerHTML = renderNotificationsView();
      break;

    case 'importar':
      pageIcon.textContent = '📥';
      pageTitle.textContent = 'Importación de Datos Excel / CSV';
      pageSubtitle.textContent = 'Importación desde la aplicación pendiente de implementación';
      container.innerHTML = renderImportView();
      break;

    case 'configuracion':
      pageIcon.textContent = '⚙️';
      pageTitle.textContent = 'Configuración';
      pageSubtitle.textContent = 'Seguridad de mi cuenta y ajustes autorizados';
      container.innerHTML = renderSettingsView();
      break;

    default:
      container.innerHTML = `<div class="p-8 text-center"><p class="text-slate-500">Módulo en construcción</p></div>`;
  }

  updateSidebarBadges();
  populateSelectAreas();
}

// Los conteos verificados permanecen visibles solo dentro del mismo contexto.
let sidebarSesionVersion = 0;
let sidebarContexto = null;
let sidebarLecturaVersion = 0;
const sidebarConteosEnCurso = new Map();
function sidebarFirmaAcceso() {
  const u=state.currentUser||{};
  return JSON.stringify([sidebarSesionVersion,u.id,u.role,u.esAdminPermanente,u.esAdminTemporal,u.adminTemporalHasta,u.permissions,
    sesionNoVerificable,sesionEnReconexion,hasAccess('mejoras',u.role),hasAccess('remodelaciones',u.role)]);
}
function invalidarSidebarConteos() {
  sidebarContexto=null;sidebarLecturaVersion++;sidebarConteosEnCurso.clear();
  for(const servicio of [window.MejorasService,window.RemodelacionesService])servicio?.invalidarProyectos?.();
  for(const id of ['badge-nav-mejoras','badge-nav-remodelaciones']){
    const el=document.getElementById(id);if(el){el.textContent='';el.classList.add('hidden');}
  }
}
function updateSidebarBadges() {
  const firma=sidebarFirmaAcceso();
  if(sidebarContexto!==firma){invalidarSidebarConteos();sidebarContexto=firma;}
  for(const id of ['badge-nav-mantenciones','badge-nav-activos','badge-nav-solicitudes']){
    const el=document.getElementById(id);if(el){el.textContent='';el.classList.add('hidden');}
  }
  window.AvisosSolicitudes?.pintar();
  if(esCuentaSinRol()||esRecepcionRestringida()||sesionNoVerificable||sesionEnReconexion)return;
  const version=sidebarLecturaVersion;
  const contar=(id,vista,servicio,filtrar,titulo)=>{
    const el=document.getElementById(id);if(!el||!servicio||!hasAccess(vista,state.currentUser?.role)||sidebarConteosEnCurso.has(id))return;
    const vigente=()=>version===sidebarLecturaVersion&&firma===sidebarFirmaAcceso()&&sidebarContexto===firma&&document.getElementById(id)===el;
    const consulta=Promise.resolve().then(()=>servicio.getProyectos()).then(proyectos=>{
      if(!vigente())return;
      if(!Array.isArray(proyectos))throw Error('Respuesta incompleta');
      const cantidad=proyectos.filter(filtrar).length;
      el.textContent=String(cantidad);el.title=titulo;el.classList.toggle('hidden',cantidad===0);
    }).catch(()=>{
      if(vigente()){el.textContent='';el.classList.add('hidden');el.title='Conteo no disponible';}
    }).finally(()=>{if(sidebarConteosEnCurso.get(id)===consulta)sidebarConteosEnCurso.delete(id);});
    sidebarConteosEnCurso.set(id,consulta);
  };
  contar('badge-nav-mejoras','mejoras',window.MejorasService,p=>p.estado!=='Finalizado','Proyectos de Mejoras no finalizados');
  contar('badge-nav-remodelaciones','remodelaciones',window.RemodelacionesService,()=>true,'Proyectos de Remodelación registrados');
}

function handleGlobalSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  if (!query) return;
  if (e.key === 'Enter') {
    navigateTo('mantenciones');
  }
}

// ==========================================================
// S1 — IDENTIDAD REAL (Supabase Auth → public.usuarios → roles)
// ==========================================================
// Mapeo EXCLUSIVO para adaptar el rol real de BD a los IDs que ya
// conoce la UI existente (SYSTEM_ROLES / hasAccess). NO inventa
// permisos: es solo traducción de presentación.
const ROL_REAL_A_UI = {
  'administrador': 'ADMINISTRADOR',
  'tecnico': 'TECNICO',
  'recepcion': 'RECEPCION'
};

// Rol visible derivado SIEMPRE del rol real. Si es NULL o desconocido
// se usa SIN_ROL (acceso mínimo). NUNCA se asume Administrador.
// Los nombres reales en public.roles pueden traer tildes ("Técnico",
// "Recepción"), por lo que se normalizan (lowercase + sin diacríticos)
// antes de comparar contra ROL_REAL_A_UI.
function mapearRolRealAUI(nombreRol) {
  if (!nombreRol || typeof nombreRol !== 'string') return 'SIN_ROL';
  const clave = String(nombreRol)
    .trim()
    .toLowerCase()
    .normalize('NFD')                      // separa letra + diacrítico
    .replace(/[\u0300-\u036f]/g, '');      // elimina tildes/acentos
  return ROL_REAL_A_UI[clave] || 'SIN_ROL';
}

// Nombre visible: 1) public.usuarios.nombre, 2) email real, 3) "Usuario".
// NO se usa ningún nombre mock ni metadata inventada.
function resolverNombreVisible(perfil, authUser) {
  if (perfil && typeof perfil.nombre === 'string' && perfil.nombre.trim() !== '') {
    return perfil.nombre.trim();
  }
  const email = (perfil && perfil.email) || (authUser && authUser.email) || null;
  if (email && String(email).trim() !== '') return String(email).trim();
  return 'Usuario';
}

// Iniciales para el avatar (mientras no exista foto de perfil).
function calcularIniciales(nombre) {
  if (!nombre) return '👤';
  const partes = String(nombre).trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '👤';
  const primera = partes[0].charAt(0) || '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1].charAt(0) || '') : '';
  return (primera + ultima).toUpperCase() || '👤';
}

// Construye la estructura de COMPATIBILIDAD de state.currentUser a
// partir del perfil real. Este objeto es temporal mientras toda la
// app siga leyendo state.currentUser.
// S3C-2C: agrega las banderas administrativas SIEMPRE en fail closed
// (false/false/null). Los valores reales los escribe
// aplicarEstadoAdministrativo() desde la RPC del backend; el rol
// PERMANENTE (role) nunca cambia por una delegación temporal.
function construirPerfilUI(perfil, authUser, nombreRol) {
  const nombreVisible = resolverNombreVisible(perfil, authUser);
  return {
    id: (perfil && perfil.id) || (authUser && authUser.id) || null,
    name: nombreVisible,
    email: (perfil && perfil.email) || (authUser && authUser.email) || null,
    correoVerificado: authUser ? Boolean(authUser.email_confirmed_at) : null,
    esInvitacion: Boolean(authUser?.invited_at),
    nombreRegistrado: typeof perfil?.nombre === 'string' && perfil.nombre.trim().length > 0,
    role: mapearRolRealAUI(nombreRol),
    // Compatibilidad: modals.js lee state.currentUser.title.
    title: (nombreRol && String(nombreRol).trim()) || '',
    avatar: calcularIniciales(nombreVisible),
    // S3C-2C: estado administrativo (fuente: RPC del backend).
    esAdminPermanente: false,
    esAdminTemporal: false,
    adminTemporalHasta: null
  };
}

// ==========================================================
// S3C-2C — APLICAR ESTADO ADMINISTRATIVO (RPC DEL BACKEND)
// ==========================================================
// Llama a UsuariosService.getMiEstadoAdministrativo() (RPC
// mi_estado_administrativo, reloj PostgreSQL) y guarda el resultado
// en state.currentUser. FAIL CLOSED: ante cualquier fallo (red,
// permisos, service ausente) deja TODO en false/null y NO asume
// administrador. El rol permanente (role) no se toca.
async function aplicarEstadoAdministrativo(force = false) {
  if (!state || !state.currentUser) return;

  // Fail closed por defecto (también en revalidación: si el backend
  // no responde, se pierde el privilegio en la UI; RLS manda igual).
  state.currentUser.esAdminPermanente = false;
  state.currentUser.esAdminTemporal = false;
  state.currentUser.adminTemporalHasta = null;

  try {
    if (!window.UsuariosService ||
        typeof window.UsuariosService.getMiEstadoAdministrativo !== 'function') {
      throw new Error('UsuariosService.getMiEstadoAdministrativo no está disponible.');
    }

    const estado = await window.UsuariosService.getMiEstadoAdministrativo(force);

    state.currentUser.esAdminPermanente = estado.es_admin_permanente === true;
    state.currentUser.esAdminTemporal = estado.es_admin_temporal === true;
    state.currentUser.adminTemporalHasta = estado.vigente_hasta || null;
  } catch (e) {
    console.error('S3C-2C: no fue posible verificar el estado administrativo (fail closed):', e);
  }
}

// ==========================================================
// S3C-2C/2D — REVALIDACIÓN DE VIGENCIA (EXPIRACIÓN / REVOCACIÓN)
// ==========================================================
// La seguridad real ya expira en backend (now() > vigente_hasta o
// revocado_at). Esto sólo sincroniza la UI con el estado real.
//
// MECANISMOS (S3C-2D), de mayor a menor prioridad:
//   1. TIMER EXACTO de expiración (setTimeout al instante de
//      vigente_hasta) — mecanismo PRINCIPAL.
//   2. FALLBACK PERIÓDICO cada 30 s — recupera navegador
//      suspendido, laptop dormida, throttling de timers y cambios
//      de reloj. NO es la autoridad.
//   3. visibilitychange — al volver a la pestaña.
// Ninguno asume nada localmente: TODOS confirman contra
// mi_estado_administrativo() (reloj PostgreSQL).
//
// Si el usuario PERDIÓ el estado administrativo (true → false):
//   1. se actualiza state.currentUser (fail closed);
//   2. se recalculan sidebar/permisos y se elimina el badge;
//   3. si la vista actual ya no está permitida para su rol
//      permanente, se redirige a una vista permitida (sin logout,
//      sin F5, sin pending-account).

// --- Estado del TIMER EXACTO (S3C-2D, único por sesión) ---
// Invariante: existe a lo sumo UN timer de expiración. Toda
// programación cancela el anterior antes de crear el nuevo.
let adminTemporalTimerId = null;     // handle del setTimeout activo
let adminTemporalTimerHasta = null;  // ISO de vigencia que sirve el timer

// Fallback periódico: 30 s (antes 5 min). Es sólo recuperación.
const ADMIN_FALLBACK_MS = 30 * 1000;
// Reintento corto cuando el timer dispara pero el backend aún
// reporta delegación vigente (diferencia de reloj navegador/servidor).
const ADMIN_REINTENTO_CORTO_MS = 12 * 1000;
// Límite técnico de setTimeout (~24.8 días): si la vigencia queda
// más lejos, se programa al máximo y se recalcula al disparar.
const ADMIN_MAX_DELAY_MS = 2147483647;

// Cancela el timer exacto si existe (evita timers duplicados).
function cancelarTimerExpiracionAdmin() {
  if (adminTemporalTimerId !== null) {
    clearTimeout(adminTemporalTimerId);
    adminTemporalTimerId = null;
  }
  adminTemporalTimerHasta = null;
}

// Programa (o REPROGRAMA) el timer exacto según el estado actual de
// state.currentUser. Se llama tras cada carga/revalidación, y por
// tanto también cuando cambia adminTemporalHasta: cancela el timer
// anterior y crea el que corresponde. No programa nada si no hay
// delegación vigente en la UI.
function programarTimerExpiracionAdmin() {
  cancelarTimerExpiracionAdmin();
  if (!state.currentUser) return;
  const ahora = Date.now();
  const limites = delegacionesSesionPropias.filter(d => d.revocado_at == null)
    .flatMap(d => [Date.parse(d.vigente_desde), Date.parse(d.vigente_hasta)])
    .filter(t => Number.isFinite(t) && t > ahora);
  if (state.currentUser.esAdminTemporal && state.currentUser.adminTemporalHasta) {
    const fin = Date.parse(state.currentUser.adminTemporalHasta);
    if (Number.isFinite(fin)) limites.push(fin > ahora ? fin : ahora + ADMIN_REINTENTO_CORTO_MS);
  }
  if (!limites.length) return;
  const siguiente = Math.min(...limites);
  adminTemporalTimerHasta = new Date(siguiente).toISOString();
  adminTemporalTimerId = setTimeout(dispararTimerExpiracionAdmin, Math.min(Math.max(0, siguiente - ahora), ADMIN_MAX_DELAY_MS));
}
async function dispararTimerExpiracionAdmin() {
  adminTemporalTimerId = null;
  await revalidarEstadoAdministrativo();
}

// Refresca la UI (badge, sidebar, navegación) tras un CAMBIO del
// estado administrativo detectado. Reutilizado por la revalidación
// normal y por la revalidación previa a escrituras sensibles.
function refrescarTrasCambioEstadoAdministrativo() {
  // 1-2. Refrescar UI (rol permanente intacto) y navegación.
  syncCurrentUserUI();
  updateSidebarVisibility();

  // 3. ¿La vista actual sigue permitida para el rol PERMANENTE?
  //    (Si el usuario era sólo temporal y perdió la delegación,
  //    hasAccess() ya no le concede los módulos administrativos.)
  const rolPermanente = state.currentUser?.role || 'SIN_ROL';
  if (hasAccess(currentView, rolPermanente)) return;

  // Redirigir a la primera vista permitida por su rol real.
  const vistas = ['dashboard', 'mantenciones', 'solicitudes', 'notificaciones'];
  const destino = vistas.find(v => hasAccess(v, rolPermanente));
  if (destino) {
    navigateTo(destino);
    return;
  }

  // Caso límite (rol sin módulos permitidos, p. ej. Recepción mientras
  // su set de permisos no esté definido): aviso neutral propio. NO se
  // usa la pantalla de "cuenta pendiente" (esta cuenta NO está
  // pendiente) y NO se cierra sesión.
  currentView = '';
  const container = document.getElementById('view-container');
  if (container) {
    container.innerHTML = `
      <div class="min-h-full w-full flex items-center justify-center p-6">
        <div class="max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
          <span class="text-4xl block">🛡️</span>
          <h2 class="text-lg font-bold text-slate-800 dark:text-white">Tu acceso administrativo temporal ha finalizado</h2>
          <p class="text-sm text-slate-600 dark:text-slate-400">
            Volviste a tu rol permanente. Si necesitas administrar el sistema,
            contacta al Administrador del hotel.
          </p>
          <button onclick="handleLogout()"
            class="mt-2 inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-sm font-bold transition-all shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="1.15em" height="1.15em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>`;
  }
}

async function revalidarEstadoAdministrativo() {
  return window.SesionCambios?.revalidar();
}

// ==========================================================
// S3C-2D — REVALIDACIÓN PREVIA A ESCRITURAS SENSIBLES
// ==========================================================
// Ninguna escritura administrativa sensible debe quedar autorizada
// EXCLUSIVAMENTE por estado frontend viejo (puede estar stale hasta
// 30 s, o más si el navegador estuvo suspendido). Esta función
// confirma el privilegio contra el backend ANTES de ejecutar la
// escritura y, si ya no está vigente, actualiza la UI de inmediato.
//
// Devuelve true si el privilegio administrativo sigue vigente según
// el backend. La autorización FINAL sigue siendo RLS/RPC de
// PostgreSQL: esto es defensa UX + cierre temprano, no la barrera.
//
// NOTA: no se usa para LECTURAS (RLS ya protege cada lectura); sólo
// para escrituras sensibles iniciadas desde la UI.
async function revalidarPrivilegioParaEscritura() {
  if (!state.currentUser) return false;
  await revalidarEstadoAdministrativo();
  return !esCuentaSinRol() && esAdminOperativoActual();
}

// Registro de revalidaciones periódicas (una sola vez por sesión).
// Se comparte entre cuentas aprobadas y pendientes; nunca duplica el respaldo.
function iniciarRevalidacionEstadoAdministrativo() {
  window.SesionCambios?.iniciar();
  if (window.__s3c2cRevalidacionIniciada) return;
  window.__s3c2cRevalidacionIniciada = true;

  // S3C-2D: sembrar el timer exacto si la carga inicial ya trajo una
  // delegación vigente.
  programarTimerExpiracionAdmin();

  // Al volver a la pestaña/ventana.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      revalidarEstadoAdministrativo();
    }
  });

  // S3C-2D: fallback periódico de 30 s (antes 5 min). Recupera
  // navegador suspendido, laptop dormida, throttling de timers y
  // cambios de reloj. NO es la autoridad: sólo dispara una
  // revalidación que confirma contra el backend.
  window.__s3c2cRevalidacionIntervalo = setInterval(() => {
    revalidarEstadoAdministrativo();
  }, ADMIN_FALLBACK_MS);
}

// Carga el perfil REAL y setea state.currentUser.
// S3C-0D — Estados devueltos (objeto { estado, perfil }):
// - 'sin_sesion'           → sin sesión Auth → redirect a login.html
// - 'inactivo'             → estado !== true (o sin fila) → signOut + login
// - 'pendiente'            → estado = true y rol_id = NULL → pantalla pendiente
//                            (NO se cierra sesión)
// - 'verificacion_fallida' → error de red/permisos al leer la propia fila
//                            → bloqueo total (sin signOut: puede ser transitorio)
// - 'aprobado'             → estado = true y rol_id con valor → flujo normal
// NUNCA se asume Administrador por un fallo de carga.
// NO guarda nada en localStorage.
async function cargarPerfilReal() {
  // 1. Usuario Auth real.
  const { data: authData, error: authError } = await window.supabaseClient.auth.getUser();
  if (authError && clasificarErrorVerificacionSesion(authError) !== 'invalida' && authData?.user == null) {
    state.currentUser = null;
    return { estado: 'verificacion_fallida', perfil: null };
  }
  if (authError || !authData || !authData.user) {
    window.location.replace('login.html');
    return { estado: 'sin_sesion', perfil: null };
  }
  const authUser = authData.user;

  // 2. SOLO la fila propia en public.usuarios, sin join a public.roles:
  //    una cuenta pendiente NO debe consultar el catálogo de roles
  //    (§10 S3C-0D). El email mostrado en la pantalla pendiente viene
  //    de esta misma fila.
  const { data: perfil, error: errPerfil } = await window.supabaseClient
    .from('usuarios')
    .select('id, nombre, email, estado, rol_id')
    .eq('id', authUser.id)
    .maybeSingle();

  if (errPerfil) {
    // Fallo de permisos/red: SIN_ROL (mínimo). Sin mock, sin admin.
    // NO se cierra sesión (puede ser transitorio), pero NO se
    // ejecuta ningún módulo ni service operativo.
    console.error('Error cargando perfil real desde public.usuarios:', errPerfil);
    state.currentUser = construirPerfilUI(null, authUser, null);
    return { estado: 'verificacion_fallida', perfil: null };
  }

  // 3. Usuario INACTIVO (estado !== true, o sin fila en public.usuarios):
  //    bloquear y cerrar sesión. NUNCA se muestra la pantalla pendiente
  //    a un usuario inactivo.
  if (!perfil || perfil.estado !== true) {
    console.warn('Usuario inactivo o sin perfil en public.usuarios. Se bloquea el acceso.');
    try { await window.supabaseClient.auth.signOut(); } catch (e) { /* sin sesión que limpiar */ }
    alert('Su cuenta está inactiva. Contacte al administrador.');
    window.location.replace('login.html');
    return { estado: 'inactivo', perfil: null };
  }

  // 4. CUENTA PENDIENTE: estado = true y rol_id = NULL.
  //    Se mantiene la sesión Auth y NO se consulta public.roles.
  if (!perfil.rol_id) {
    state.currentUser = construirPerfilUI(perfil, authUser, null); // SIN_ROL
    return { estado: 'pendiente', perfil };
  }

  // 5. CUENTA APROBADA: recién aquí se resuelve el nombre del rol
  //    desde public.roles (solo para cuentas que ya tienen rol_id).
  let nombreRol = null;
  const { data: rol, error: errRol } = await window.supabaseClient
    .from('roles')
    .select('nombre')
    .eq('id', perfil.rol_id)
    .maybeSingle();

  if (errRol) {
    // Sin catálogo de roles NO se asume ningún rol: SIN_ROL (mínimo).
    console.error('Error resolviendo el rol desde public.roles:', errRol);
    nombreRol = null;
  } else {
    nombreRol = (rol && rol.nombre) || null;
  }

  state.currentUser = construirPerfilUI(perfil, authUser, nombreRol);

  // S3C-2C: ANTES de decidir navegación/permisos, se resuelve el
  // estado administrativo real (permanente / temporal vigente) con
  // el reloj del servidor. Fail closed dentro de la función.
  await aplicarEstadoAdministrativo(true);

  return { estado: 'aprobado', perfil };
}

// ==========================================================
// S3C-2C — FORMATO DE FECHAS/HORAS DE ADMINISTRACIÓN TEMPORAL
// ==========================================================
// Sólo PRESENTACIÓN (es-CL, zona America/Santiago). La autorización
// NUNCA depende de esto: el backend usa PostgreSQL now().
function formatearFechaHoraCL(iso) {
  return formatearFechaCL(iso,{hora:true,vacio:'—'});
}

// Convierte los campos [fecha][hora] (hora LOCAL de Chile elegida en
// el modal) a un timestamp ISO-8601 UTC inequívoco para enviar a la
// RPC. No usa el reloj del cliente para AUTORIZAR: sólo traduce la
// intención del administrador a un instante absoluto.
//   fecha: 'YYYY-MM-DD'  hora: 'HH:MM'
function construirTimestampISOChile(fecha, hora) {
  if (!fecha || !hora) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha).trim());
  const h = /^(\d{2}):(\d{2})$/.exec(String(hora).trim());
  if (!m || !h) return null;

  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const horaN = Number(h[1]);
  const minN = Number(h[2]);

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  if (horaN > 23 || minN > 59) return null;

  // Instante UTC tal que, vistos desde America/Santiago, corresponda
  // a la fecha/hora escritas. Se calcula el offset real de Chile para
  // ese instante (incluye horario de verano) con dos iteraciones de
  // convergencia.
  const comoUtc = Date.UTC(anio, mes - 1, dia, horaN, minN);
  const offset1 = obtenerOffsetMinutosChile(comoUtc);
  const candidato1 = comoUtc - (offset1 * 60000);
  const offset2 = obtenerOffsetMinutosChile(candidato1);
  const timestamp = comoUtc - (offset2 * 60000);

  const fechaResultante = new Date(timestamp);
  if (isNaN(fechaResultante.getTime())) return null;
  return fechaResultante.toISOString();
}

// Offset (en minutos) de America/Santiago respecto a UTC para un
// instante dado, derivado de Intl (reloj del sistema sólo para
// CONVERTIR, nunca para autorizar).
function obtenerOffsetMinutosChile(utcMs) {
  try {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Santiago',
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(utcMs));

    const valor = t => Number((partes.find(p => p.type === t) || {}).value || 0);
    const comoUtcLocal = Date.UTC(
      valor('year'), valor('month') - 1, valor('day'),
      valor('hour') % 24, valor('minute'), valor('second')
    );
    return Math.round((comoUtcLocal - utcMs) / 60000);
  } catch (e) {
    return -new Date(utcMs).getTimezoneOffset(); // fallback: zona del navegador
  }
}

function syncCurrentUserUI() {
  // S1/S2B: la identidad proviene del perfil real ya cargado en
  // state.currentUser (Supabase Auth → public.usuarios →
  // public.roles). js/auth.js (auth mock con hotel_session) fue
  // eliminado completamente en S2B.
  if (!state.currentUser) return;
  const sName = document.getElementById('sidebar-user-name');
  const sRole = document.getElementById('sidebar-user-role');
  const sAvatar = document.getElementById('sidebar-user-avatar');
  const topBadge = document.getElementById('topbar-role-badge');

  if (sName) sName.textContent = state.currentUser.name;
  // S3C-2C: el rol PERMANENTE nunca cambia. Un Administrador
  // temporal sigue viendo "TECNICO" / "RECEPCION".
  if (sRole) sRole.textContent = state.currentUser.role;
  if (sAvatar) sAvatar.textContent = state.currentUser.avatar || '👤';

  // S3C-2C: badge discreto de Administrador temporal, DEBAJO del rol
  // permanente. Sólo visible con delegación vigente (backend).
  const sAdminTmp = document.getElementById('sidebar-admin-temporal');
  if (sAdminTmp) {
    if (state.currentUser.esAdminTemporal === true) {
      sAdminTmp.textContent = `Admin. temporal · hasta ${formatearFechaHoraCL(state.currentUser.adminTemporalHasta)}`;
      sAdminTmp.classList.remove('hidden');
    } else {
      sAdminTmp.textContent = '';
      sAdminTmp.classList.add('hidden');
    }
  }

  const topAvatar = document.getElementById('topbar-user-avatar');
  const topName = document.getElementById('topbar-user-name');
  if (topAvatar) topAvatar.textContent = state.currentUser.avatar || '👤';
  // S3C-0D: fallback neutro (antes 'Administrador', que inventaba un rol).
  if (topName) topName.textContent = state.currentUser.name || 'Usuario';

  if (topBadge) {
    // S3C-2C: el badge del topbar conserva el rol PERMANENTE; si hay
    // delegación vigente se agrega un distintivo aparte.
    topBadge.textContent = state.currentUser.role;
    const badgeColor = state.currentUser.role === 'ADMINISTRADOR'
      ? 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60'
      : (state.currentUser.role === 'TECNICO'
        ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
        : 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60');
    topBadge.className = `font-bold px-2 py-0.5 rounded-md text-xs truncate max-w-[120px] sm:max-w-none ${badgeColor}`;
  }

  // S3C-2C: distintivo del topbar para Administrador temporal.
  const topAdminTmp = document.getElementById('topbar-admin-temporal-badge');
  if (topAdminTmp) {
    if (state.currentUser.esAdminTemporal === true) {
      topAdminTmp.textContent = `🛡️ Admin. temporal · hasta ${formatearFechaHoraCL(state.currentUser.adminTemporalHasta)}`;
      topAdminTmp.classList.remove('hidden');
    } else {
      topAdminTmp.textContent = '';
      topAdminTmp.classList.add('hidden');
    }
  }
  window.AvisosSolicitudes?.actualizarSesion();
  window.SolicitudesSincronizacion?.actualizarSesion();
  window.AdminCorreosVerificados?.actualizarSesion();
}

// Inicialización y Listeners Globales
window.addEventListener('DOMContentLoaded', async () => {
  if (window.hotelSesionLista && !(await window.hotelSesionLista)) return;
  // S1: la identidad REAL se carga ANTES de updateSidebarVisibility(),
  // hasAccess() y renderCurrentView(), para que la interfaz nunca
  // aparezca primero como el admin mock y luego cambie.
  // Si no hay sesión o el usuario está inactivo, cargarPerfilReal()
  // redirige a login y no se continúa.
  const resultado = await cargarPerfilReal();

  // ==========================================================
  // S3C-0D: CUENTA PENDIENTE DE APROBACIÓN (estado = true,
  // rol_id = NULL) o cuenta cuyo estado no pudo verificarse.
  // El flujo se DETIENE aquí: NO se ejecutan
  // syncMaintenanceAlertNotifications(), updateSidebarBadges(),
  // renderCurrentView() ni ningún service operativo.
  // Se dibuja únicamente la pantalla de cuenta pendiente.
  // ==========================================================
  if (resultado.estado === 'pendiente' || resultado.estado === 'verificacion_fallida') {
    renderPantallaCuentaPendiente(
      resultado.estado === 'verificacion_fallida'
        ? 'No fue posible verificar el estado de tu cuenta en este momento. Comprueba tu conexión y vuelve a cargar la aplicación.'
        : null
    );

    // Tema oscuro/claro: aplica al botón de la propia pantalla.
    initThemeMode();

    // Hash manual (#dashboard, #admin, #mantenciones, #trabajadores…):
    // se ignora y se vuelve a forzar #pending-account. NO se renderiza
    // ningún módulo, ni siquiera escribiendo la URL a mano.
    window.addEventListener('hashchange', () => {
      if (esCuentaSinRol() && window.location.hash !== '#pending-account') {
        try {
          history.replaceState(null, '', '#pending-account');
        } catch (e) {
          window.location.hash = 'pending-account';
        }
      }
    });
    iniciarRevalidacionEstadoAdministrativo();
    return;
  }

  if (!resultado.perfil) return; // redirigido a login (sin sesión o inactivo)

  inicializarInterfazSesion();
});

function inicializarInterfazSesion() {
  if (interfazSesionInicializada) return;
  interfazSesionInicializada = true;
  cuentaPendiente = false;
  window.PendingAccountView?.mostrarLayoutOperativa();
  toggleMobileSidebar(false);
  // Flujo NORMAL de usuario aprobado.
  if (esRecepcionRestringida()) {
    currentView = 'solicitudes';
    window.history.replaceState(null, '', '#solicitudes');
  }
  syncCurrentUserUI();
  if (!esRecepcionRestringida() && typeof syncMaintenanceAlertNotifications === 'function') {
    syncMaintenanceAlertNotifications();
  }
  // El primer montaje se realiza después de restaurar la ruta, una sola vez.

  // S3C-2C: revalidar vigencia administrativa al volver a la pestaña
  // y cada 30 segundos como respaldo de Realtime.
  iniciarRevalidacionEstadoAdministrativo();

  // FASE S3C-0D: la página ya está lista para mostrarse (tras evaluar
  // la cuenta y renderizar la vista del usuario aprobado).
  document.documentElement.classList.remove('auth-pending');

  // Escape conserva las ventanas; solo cierra controles no modales.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const nDrop = document.getElementById('notification-dropdown');
      if (nDrop) nDrop.classList.add('hidden');
      if (typeof toggleMobileSidebar === 'function') toggleMobileSidebar(false);
    }
  });

  // Listener global para cerrar dropdowns al hacer clic fuera
  document.addEventListener('click', (e) => {


    // Cerrar dropdown de notificaciones si se hace clic fuera
    const notifDropdown = document.getElementById('notification-dropdown');
    const notifBtn = document.getElementById('btn-notification-dropdown');
    if (notifDropdown && !notifDropdown.classList.contains('hidden')) {
      if (!notifDropdown.contains(e.target) && (!notifBtn || !notifBtn.contains(e.target))) {
        notifDropdown.classList.add('hidden');
      }
    }
  });

  // Inicializar Tema y Enrutamiento por Hash
  initThemeMode();

  // Atrás/Adelante y hashes manuales conservan las subvistas existentes.
  window.addEventListener('popstate', restaurarNavegacionHistorial);
  window.addEventListener('hashchange', restaurarNavegacionHistorial);

  // Si hay un hash en la URL al cargar, navegar a esa vista
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash && ['dashboard', 'mantenciones', 'mejoras', 'remodelaciones', 'activos', 'inventario', 'areas', 'prevencionista', 'tareas-pendientes', 'gantt', 'solicitudes', 'notificaciones', 'importar', 'configuracion', 'admin'].includes(initialHash)) {
    const contexto = window.history.state || {};
    const subVista = initialHash === 'areas' && ['maquinas', 'jardineria'].includes(contexto.areaSubVista) ? contexto.areaSubVista : null;
    const ficha = initialHash === 'areas' && !subVista && contexto.areaFicha === 'workarea_reactiva' ? contexto.areaFicha : null;
    navigateTo(initialHash, ficha, subVista, true);
  } else {
    renderCurrentView();
  }
}

// ==========================================================
// CONTROLADOR GLOBAL DE TEMA OSCURO / CLARO (DARK MODE)
// ==========================================================
function initThemeMode() {
  const savedTheme = localStorage.getItem('hotel_theme') || (state.settings?.appearance?.theme) || 'light';
  if (savedTheme === 'dark' || (savedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  updateThemeButtonUI();
}

function toggleThemeMode() {
  const isDark = document.documentElement.classList.contains('dark');
  if (isDark) {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('hotel_theme', 'light');
    if (state.settings && state.settings.appearance) state.settings.appearance.theme = 'light';
  } else {
    document.documentElement.classList.add('dark');
    localStorage.setItem('hotel_theme', 'dark');
    if (state.settings && state.settings.appearance) state.settings.appearance.theme = 'dark';
  }
  updateThemeButtonUI();
  if (typeof saveState === 'function') saveState();
}

function updateThemeButtonUI() {
  const isDark = document.documentElement.classList.contains('dark');
  const icon = document.getElementById('theme-toggle-icon');
  const text = document.getElementById('theme-toggle-text');
  if (icon) icon.textContent = isDark ? '☀️' : '🌙';
  if (text) text.textContent = isDark ? 'Claro' : 'Oscuro';
}

// ==========================================================
// CONTROLADOR DE CIERRE DE SESIÓN (LOGOUT)
// ==========================================================
// Confirmación de cierre; la escritura corresponde a auth.signOut().
let cierreSesionContexto=null;
let cierreSesionGuardando=false;
async function handleLogout(){
  if(cierreSesionContexto||cierreSesionGuardando)return;
  let modal=document.getElementById('logout-confirm-overlay');
  if(!modal){
    modal=document.createElement('div');modal.id='logout-confirm-overlay';
    modal.className='alm-ui alm-logout hidden fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4';
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','logout-confirm-titulo');modal.setAttribute('aria-describedby','logout-confirm-descripcion');
    modal.innerHTML='<section class="alm-panel w-full max-w-md p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto"><span class="alm-logout-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="1.15em" height="1.15em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg></span><h2 id="logout-confirm-titulo" class="alm-title">¿Cerrar sesión?</h2><p id="logout-confirm-descripcion" class="alm-muted text-sm">¿Estás seguro de que deseas cerrar sesión?</p><p id="logout-confirm-error" role="alert" class="hidden text-sm text-rose-700 dark:text-rose-300"></p><div class="alm-logout-actions"><button id="logout-confirm-cancelar" type="button" onclick="cancelarCierreSesion()" class="alm-logout-cancelar px-4 py-2.5 rounded-xl text-sm font-bold">Cancelar</button><button id="logout-confirm-aceptar" type="button" onclick="confirmarCierreSesion()" class="alm-btn-primary px-4 py-2.5">Cerrar sesión</button></div></section>';
    document.body.appendChild(modal);
  }
  const fondos=['view-container','sidebar','topbar'].map(id=>document.getElementById(id)).filter(Boolean);
  cierreSesionContexto={foco:document.activeElement,overflow:document.body.style.overflow,fondos:fondos.map(el=>({el,inert:el.inert}))};
  fondos.forEach(el=>{el.inert=true;});document.body.style.overflow='hidden';
  const error=document.getElementById('logout-confirm-error');error.textContent='';error.classList.add('hidden');
  openModal('logout-confirm-overlay');window.addEventListener('keydown',teclaCierreSesion,true);document.getElementById('logout-confirm-cancelar').focus({preventScroll:true});
}
function cancelarCierreSesion(){
  if(cierreSesionGuardando||!cierreSesionContexto)return;
  const previo=cierreSesionContexto;cierreSesionContexto=null;
  document.getElementById('logout-confirm-overlay').classList.add('hidden');window.removeEventListener('keydown',teclaCierreSesion,true);
  document.body.style.overflow=previo.overflow;previo.fondos.forEach(({el,inert})=>{el.inert=inert;});
  if(previo.foco?.isConnected)previo.foco.focus({preventScroll:true});
}
function teclaCierreSesion(e){
  if(!cierreSesionContexto)return;
  if(e.key==='Escape')return; // UX-02: solo controles explícitos.
  if(e.key!=='Tab')return;
  const modal=document.getElementById('logout-confirm-overlay'),focos=[...modal.querySelectorAll('button:not([disabled])')];
  if(!focos.length){e.preventDefault();return;}
  const primero=focos[0],ultimo=focos[focos.length-1];
  if(!modal.contains(document.activeElement)||(e.shiftKey&&document.activeElement===primero)||(!e.shiftKey&&document.activeElement===ultimo)){e.preventDefault();(e.shiftKey?ultimo:primero).focus();}
}
async function confirmarCierreSesion(){
  if(!cierreSesionContexto||cierreSesionGuardando)return;
  cierreSesionGuardando=true;
  const cancelar=document.getElementById('logout-confirm-cancelar'),aceptar=document.getElementById('logout-confirm-aceptar'),error=document.getElementById('logout-confirm-error');
  cancelar.disabled=true;aceptar.disabled=true;aceptar.textContent='Cerrando sesión…';error.classList.add('hidden');
  let completado=false;
  try{
    if(!window.supabaseClient?.auth)throw Error('No se pudo acceder al servicio de autenticación. Intenta nuevamente.');
    const resultado=await window.supabaseClient.auth.signOut();
    if(resultado?.error)throw resultado.error;
    window.AvisosSolicitudes?.detener(); window.SolicitudesSincronizacion?.detener();
    window.AdminCorreosVerificados?.detener();
    window.SesionCambios?.detener();
    completado=true;window.location.replace('login.html');
  }catch(e){error.textContent=e.message||'No se pudo cerrar la sesión. Intenta nuevamente.';error.classList.remove('hidden');}
  finally{if(!completado){cierreSesionGuardando=false;cancelar.disabled=false;aceptar.disabled=false;aceptar.textContent='Cerrar sesión';}}
}

// S2B: Se elimino el monitor AFK de 5 minutos del Panel de Administracion.
// Su unica finalidad era invalidar la segunda sesion del PIN maestro
// (sessionStorage hotel_admin_verified), que ya no existe. No se inventa
// una nueva politica de timeout.





function clasificarErrorVerificacionSesion(error) {
  const codigo = error?.code;
  const estado = Number(error?.status);
  if (error?.name === 'AuthSessionMissingError' ||
      ['session_not_found', 'session_expired', 'refresh_token_not_found',
        'user_not_found'].includes(codigo)) return 'invalida';
  if (error?.name === 'AuthRetryableFetchError' || [502, 503, 504].includes(estado) ||
      (!estado && !codigo && /^(?:TypeError: )?(?:Failed to fetch|NetworkError(?: when attempting to fetch resource\.)?|Load failed|net::ERR_CONNECTION_CLOSED)$/i.test(error?.message || ''))) {
    return 'transitoria';
  }
  return 'indeterminada';
}

// USR-01D/E: Realtime invalida; el perfil, RPC y ledger propios deciden.
window.SesionCambios = (function () {
  let usuario = null, canal = null, generacion = 0, lectura = null, repetir = false;
  let programada = null, reconexion = null, transicion = null;
  let espera = null, terminarEspera = null;
  const vigente = token => token === generacion && usuario === state.currentUser?.id;
  function bloquear(mensaje) {
    invalidarSidebarConteos();
    sesionNoVerificable = true;
    window.AdminAcceso?.invalidar();
    document.documentElement.classList.add('auth-pending');
    window.AvisosSolicitudes?.detener(); window.SolicitudesSincronizacion?.detener(); window.AdminCorreosVerificados?.detener();
    let aviso = document.getElementById('sesion-verificacion-bloqueo');
    if (!aviso) {
      aviso = document.createElement('div'); aviso.id = 'sesion-verificacion-bloqueo';
      aviso.className = 'alm-ui fixed inset-0 flex items-center justify-center p-4';
      aviso.style.cssText = 'visibility:visible;z-index:10000;background:var(--alm-inset,#0f172a)';
      aviso.setAttribute('role','alertdialog'); aviso.setAttribute('aria-modal','true');
      aviso.setAttribute('aria-label','Verificación de acceso');
      aviso.innerHTML = '<section class="alm-panel p-5 space-y-4" style="max-width:480px"><p data-sesion-mensaje></p><div class="flex gap-3"><button type="button" class="alm-btn-primary px-4 py-2" onclick="revalidarEstadoAdministrativo()">Reintentar</button><button type="button" class="px-4 py-2" onclick="window.supabaseClient.auth.signOut().finally(()=>window.location.replace(\'login.html\'))">Cerrar sesión</button></div></section>';
      document.body.appendChild(aviso); aviso.querySelector('button').focus();
    }
    aviso.querySelector('[data-sesion-mensaje]').textContent = mensaje;
  }
  function desbloquear() {
    sesionNoVerificable = false;
    document.getElementById('sesion-verificacion-bloqueo')?.remove();
    document.documentElement.classList.remove('auth-pending');
  }
  function retirarFormularios(perdioVista, perdioAdministracion, perdioPermanente) {
    document.querySelectorAll('[role="dialog"],[aria-modal="true"],body > [id*="modal"],#admin-gestion-dialog').forEach(el => {
      if (el.id === 'logout-confirm-overlay' || el.id === 'sesion-verificacion-bloqueo') return;
      const deUsuarios = /^(modal-user-form|modal-admin-temporal|admin-gestion-dialog)$/.test(el.id);
      const formularioAdministrativo = /^(inv-modal-(nuevo|operacion)|modal-trabajador-form|pv-.*(formulario|administrar|subir|eliminar))/.test(el.id) || el.querySelector('form');
      if (!perdioVista && !(perdioPermanente && deUsuarios) && !(perdioAdministracion && formularioAdministrativo && currentView !== 'configuracion')) return;
      el.classList.add('hidden');
      // Los diálogos creados dinámicamente se descartan; los fijos se reutilizan.
      if (el.getAttribute('role') === 'dialog' && !/^modal-/.test(el.id)) el.remove();
      if (typeof solicitudesLimpiarEliminacionRetirada === 'function') solicitudesLimpiarEliminacionRetirada(el);
    });
    ['sidebar','topbar','view-container'].forEach(id => { const el = document.getElementById(id); if (el) el.inert = false; });
    document.body.style.overflow = '';
  }
  async function aplicar(datos, token) {
    if (!vigente(token)) return;
    sesionEnReconexion = false;
    const previo = state.currentUser;
    if (!datos.perfil || datos.perfil.estado !== true) {
      bloquear('Tu cuenta está inactiva. Contacta al administrador.');
      retirarFormularios(true, true, true);
      detener();
      try { await window.supabaseClient.auth.signOut(); } finally { window.location.replace('login.html'); }
      return;
    }
    const nuevo = construirPerfilUI(datos.perfil, datos.authUser, datos.nombreRol);
    nuevo.esAdminPermanente = datos.administrativo.es_admin_permanente === true && nuevo.role === 'ADMINISTRADOR';
    nuevo.esAdminTemporal = datos.administrativo.es_admin_temporal === true && nuevo.role !== 'SIN_ROL';
    nuevo.adminTemporalHasta = nuevo.esAdminTemporal ? datos.administrativo.vigente_hasta : null;
    const perdioPermanente = previo.esAdminPermanente && !nuevo.esAdminPermanente;
    const perdioAdministracion = (previo.esAdminPermanente || previo.esAdminTemporal) && !(nuevo.esAdminPermanente || nuevo.esAdminTemporal);
    const estabaPendiente = cuentaPendiente;
    state.currentUser = nuevo;
    window.AdminAcceso?.revisar();
    delegacionesSesionPropias = datos.delegaciones;
    cuentaPendiente = nuevo.role === 'SIN_ROL';
    sesionNoVerificable = false;
    if (perdioAdministracion && window.GestionTareas?.habilitada) {
      document.querySelectorAll('[data-gestion-laboral]').forEach(panel => panel.remove());
    }
    const perdioVista = !hasAccess(currentView, nuevo.role);
    if (perdioVista || perdioAdministracion || perdioPermanente) {
      retirarFormularios(perdioVista, perdioAdministracion, perdioPermanente);
      if (perdioVista || currentView !== 'configuracion') {
        // Desconectar el contenedor anterior invalida lectores que aún lo conservan.
        const anterior = document.getElementById('view-container');
        if (anterior) anterior.replaceWith(anterior.cloneNode(false));
      }
    }
    if (cuentaPendiente) {
      cancelarTimerExpiracionAdmin();
      window.AvisosSolicitudes?.detener(); window.SolicitudesSincronizacion?.detener(); window.AdminCorreosVerificados?.detener();
      desbloquear(); renderPantallaCuentaPendiente(); return;
    }
    programarTimerExpiracionAdmin();
    if (!interfazSesionInicializada) { desbloquear(); inicializarInterfazSesion(); return; }
    if (estabaPendiente) { window.PendingAccountView?.mostrarLayoutOperativa(); toggleMobileSidebar(false); }
    syncCurrentUserUI(); updateSidebarVisibility();
    if (perdioVista || currentView === 'pending-account') {
      const destino = esRecepcionRestringida() ? 'solicitudes' : ['dashboard','solicitudes','configuracion'].find(v => hasAccess(v,nuevo.role));
      if (destino) { window.history.replaceState(null,'','#' + destino); navigateTo(destino,null,null,true); }
    } else if ((perdioAdministracion || perdioPermanente) && currentView !== 'configuracion') {
      // Cambió el alcance de lectura/acciones: retirar datos administrativos antiguos.
      renderCurrentView();
    }
    desbloquear();
  }
  async function revalidar() {
    if (!usuario || usuario !== state.currentUser?.id) return;
    if (lectura) return lectura;
    clearTimeout(programada); programada = null;
    const token = generacion, id = usuario;
    const tarea = (async () => {
      let intentos = 0;
      do {
        repetir = false;
        try {
          const datos = await window.UsuariosService.getSesionActual(id);
          if (!vigente(token)) return;
          if (repetir && datos.perfil?.estado === true &&
              (!state.currentUser.esAdminPermanente || datos.administrativo.es_admin_permanente) &&
              (!state.currentUser.esAdminTemporal || datos.administrativo.es_admin_temporal)) continue;
          clearTimeout(transicion); transicion = null;
          await aplicar(datos, token);
        } catch (error) {
          if (!vigente(token)) return;
          const clase = clasificarErrorVerificacionSesion(error);
          if (clase === 'invalida') {
            bloquear('Tu sesión ya no es válida. Vuelve a iniciar sesión.');
            detener();
            window.location.replace('login.html');
            return;
          }
          if (clase === 'transitoria' && intentos < 2) {
            sesionEnReconexion = true;
            intentos++;
            await new Promise(resolve => {
              terminarEspera = resolve;
              espera = setTimeout(resolve, intentos * 300);
            });
            if (!vigente(token)) return;
            espera = terminarEspera = null;
            repetir = true;
            continue;
          }
          sesionEnReconexion = false;
          repetir = false;
          bloquear(clase === 'transitoria'
            ? 'No se pudo verificar tu acceso por un problema de conexión. Tu trabajo se conserva. Pulsa Reintentar.'
            : 'No se pudo verificar tu acceso. Tu trabajo se conserva mientras se vuelve a validar.');
          if (String(error.message).includes('SESION_EN_TRANSICION') && !transicion) {
            transicion = setTimeout(() => { transicion = null; programar(); }, 500);
          }
        }
      } while (repetir && vigente(token));
    })();
    lectura = tarea;
    try { await tarea; } finally { if (lectura === tarea) lectura = null; }
  }
  function programar(invalidarLectura = false) {
    if (!usuario) return;
    if (lectura) {
      if (invalidarLectura) repetir = true;
      return;
    }
    if (programada) return;
    programada = setTimeout(() => { programada = null; revalidar(); }, 100);
  }
  function conectar() {
    if (!usuario || canal) return;
    const token = generacion, nuevo = window.supabaseClient.channel('sesion-cambios-' + usuario);
    canal = nuevo;
    for (const evento of ['INSERT','UPDATE']) nuevo.on('postgres_changes', {
      event:evento, schema:'public', table:'usuarios_sesion_cambios', filter:'usuario_id=eq.' + usuario
    }, () => { if (vigente(token)) programar(true); });
    nuevo.subscribe(estado => {
      if (!vigente(token) || canal !== nuevo) return;
      if (estado === 'SUBSCRIBED') { clearTimeout(reconexion); reconexion = null; programar(); }
      else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(estado) && !reconexion) {
        reconexion = setTimeout(() => {
          reconexion = null;
          if (!vigente(token) || canal !== nuevo) return;
          canal = null;
          Promise.resolve(window.supabaseClient.removeChannel(nuevo)).catch(() => {}).finally(() => { if (vigente(token)) conectar(); });
        }, 3000);
      }
    });
  }
  function detener() {
    generacion++; usuario = null; lectura = null; repetir = false;
    clearTimeout(espera); terminarEspera?.(); espera = terminarEspera = null;
    sesionEnReconexion = false;
    clearTimeout(programada); clearTimeout(reconexion); clearTimeout(transicion); programada = reconexion = transicion = null;
    cancelarTimerExpiracionAdmin(); delegacionesSesionPropias = [];
    clearInterval(window.__s3c2cRevalidacionIntervalo); window.__s3c2cRevalidacionIntervalo = null;
    const anterior = canal; canal = null;
    if (anterior) Promise.resolve(window.supabaseClient.removeChannel(anterior)).catch(() => {});
  }
  function iniciar() {
    if (!state.currentUser?.id) return;
    if (usuario === state.currentUser.id) return;
    detener(); usuario = state.currentUser.id; conectar(); programar();
  }
  window.addEventListener('online', () => { iniciar(); programar(); });
  window.supabaseClient.auth.onAuthStateChange((evento, sesion) => {
    if (evento !== 'TOKEN_REFRESHED') { sidebarSesionVersion++; invalidarSidebarConteos(); }
    if (evento === 'SIGNED_OUT') detener();
    else if (usuario && sesion?.user?.id && usuario !== sesion.user.id) {
      bloquear('La cuenta de la sesión cambió. Verificando el nuevo acceso.'); detener(); window.location.replace('login.html');
    } else if (evento === 'TOKEN_REFRESHED') programar(true);
  });
  return { iniciar, revalidar, detener };
})();
