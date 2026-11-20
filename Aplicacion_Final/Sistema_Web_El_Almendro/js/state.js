// ==========================================================
// GESTOR DE ESTADO GLOBAL (STATE STORE) - HOTEL EL ALMENDRO
// ==========================================================

// ==========================================================
// S2B (SEGURIDAD): LIMPIEZA DE CLAVES DEL ANTIGUO AUTH MOCK
// Solo estas claves; NUNCA se usa localStorage.clear() para no
// afectar datos de otros módulos. Estas claves NO se vuelven a
// crear: el login/logout reales son de Supabase Auth.
// ==========================================================
(function limpiarClavesAuthMock() {
  try {
    localStorage.removeItem('hotel_auth_users');
    localStorage.removeItem('hotel_session');
    localStorage.removeItem('hotel_admin_pin');
    sessionStorage.removeItem('hotel_admin_verified');
  } catch (e) { /* almacenamiento no disponible */ }
})();

function getSystemDate() {
  return new Date('2026-08-28T00:00:00');
}

// Configuración Maestra y Escalable de Roles del Sistema
const SYSTEM_ROLES = [
  {
    id: "ADMINISTRADOR",
    name: "Administrador General",
    title: "Administrador General",
    avatar: "👨‍💼",
    badgeClass: "bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60",
    description: "Acceso total a todo el sistema, presupuestos y configuración",
    // S3B-4: se eliminó defaultUserId ("usr_1"): era una referencia
    // al usuario mock ya eliminado de mockData.users. El id real del
    // administrador es el uuid de Supabase Auth.
    permissions: [
      'dashboard', 'mantenciones', 'mejoras', 'remodelaciones', 'activos', 
      'inventario',
      'areas', 'trabajadores', 'prevencionista', 'tareas-pendientes', 'gantt', 'solicitudes', 'notificaciones',
      'importar', 'configuracion', 'admin'
    ]
  },
  {
    id: "TECNICO",
    name: "Técnico Mantención",
    title: "Técnico Especialista en Terreno",
    avatar: "👷‍♂️",
    badgeClass: "bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60",
    description: "Actualizar trabajos asignados, fotos y estados",
    // S3B-4: se eliminó defaultUserId ("usr_3"): referencia al
    // usuario mock ya eliminado.
    // INV-4: 'inventario' solo agrega CONSULTA (matriz aprobada). El
    // Técnico NO tiene escritura de inventario: eso lo decide el backend
    // (inventario_puede_consultar / RPCs con es_administrador_actual()).
    permissions: [
      'dashboard', 'mantenciones', 'mejoras', 'remodelaciones', 'activos', 
      'inventario',
      'areas', 'prevencionista', 'gantt', 'solicitudes', 'notificaciones'
    ]
  },
  {
    id: "RECEPCION",
    name: "Recepción",
    title: "Recepción",
    avatar: "👩‍💼",
    badgeClass: "bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60",
    description: "Ingresar incidentes de pasajeros y consultar estado",
    // S3B-4: se eliminó defaultUserId ("usr_4"): referencia al
    // usuario mock ya eliminado.
    permissions: [
      'solicitudes', 'configuracion'
    ]
  }
];

window.SYSTEM_ROLES = SYSTEM_ROLES;

const DEFAULT_WORK_AREAS = [
  {
    id: "workarea_general",
    name: "Mantención General",
    icon: "🛠️",
    description: "Tareas rutinarias de mantenimiento integral en habitaciones, pasillos y salones del hotel.",
    bullets: [
      "Tareas rutinarias de mantenimiento.",
      "Habitaciones, pasillos y salones.",
      "Mantenciones generales programadas."
    ],
    color: "blue",
    isPrincipal: true,
    relatedAreas: ["workarea_reactiva", "workarea_maquinas", "workarea_jardineria"],
    responsible: ""
  },
  {
    id: "workarea_reactiva",
    name: "Mantención Reactiva",
    icon: "⚡",
    description: "Emergencias o fallas imprevistas que requieren atención inmediata y reparación técnica sin demora.",
    bullets: [
      "Emergencias o fallas que requieren atención inmediata.",
      "Fugas, sifones, artefactos u otros problemas inesperados.",
      "Trabajos que no estaban previamente programados."
    ],
    color: "amber",
    isPrincipal: false,
    responsible: ""
  },
  {
    id: "workarea_mejoras",
    name: "Mejoras",
    icon: "🌿",
    description: "Proyectos nuevos y obras de valor planificadas para enriquecer las instalaciones de El Almendro.",
    bullets: [
      "Proyectos nuevos o mejoras futuras.",
      "Ejemplo: zona de parrillas, pérgola, iluminación, nuevas instalaciones.",
      "Trabajos planificados para mejorar espacios existentes."
    ],
    color: "emerald",
    isPrincipal: false,
    responsible: ""
  },
  {
    id: "workarea_remodelacion",
    name: "Remodelación",
    icon: "🏗️",
    description: "Renovación y modificación de recintos existentes con control estricto de materiales y partidas.",
    bullets: [
      "Renovación o modificación de espacios existentes.",
      "Cambio de materiales, terminaciones o distribución.",
      "Control de materiales y costos asociados a la remodelación."
    ],
    color: "purple",
    isPrincipal: false,
    responsible: ""
  },
  {
    id: "workarea_maquinas",
    name: "Mantención de Máquinas",
    icon: "⚙️",
    description: "Revisión técnica sistemática de maquinaria, generadores, calderas y equipos centrales del hotel.",
    bullets: [
      "Revisión y mantenimiento de equipos y maquinaria.",
      "Mantenciones semanales, mensuales o anuales.",
      "Responsable y fechas de revisión asignadas."
    ],
    color: "slate",
    isPrincipal: false,
    responsible: ""
  },
  {
    id: "workarea_jardineria",
    name: "Mantención de Jardinería",
    icon: "🌳",
    description: "Cuidado continuo del parque, áreas verdes, piscina y labores de jardinería según estación climática.",
    bullets: [
      "Cuidado y mantenimiento de jardines y áreas verdes.",
      "Trabajos según temporada.",
      "Planificación de labores de invierno y verano."
    ],
    color: "teal",
    isPrincipal: false,
    responsible: ""
  }
];

function normalizeState(data) {
  if (!data) data = {};
  if (!data.workAreas || data.workAreas.length < 6) {
    data.workAreas = JSON.parse(JSON.stringify(DEFAULT_WORK_AREAS));
  } else {
    data.workAreas.forEach(wa => {
      const def = DEFAULT_WORK_AREAS.find(d => d.id === wa.id);
      if (def) {
        wa.bullets = def.bullets;
        wa.description = def.description;
        wa.responsible = def.responsible;
      }
    });
  }

  // S3B-4: Se eliminó por completo el store legacy de usuarios
  // (mockData.users → state.users) y el re-seed automático que
  // inyectaba "Roberto Silva" / "Manuel Pérez" / "Valentina Castro".
  // La única fuente de usuarios y roles es Supabase (public.usuarios
  // + public.roles vía UsuariosService). La identidad NUNCA proviene
  // de aquí: normalizeState inicializa currentUser neutro (más abajo)
  // y el perfil real lo carga app.js → cargarPerfilReal().

  // S1 (Seguridad): la identidad visible NUNCA proviene de mocks. Se
  // inicializa un perfil neutro SIN_ROL (acceso mínimo). El perfil real
  // se carga desde Supabase (app.js → cargarPerfilReal()) antes de
  // renderizar. Se descarta cualquier currentUser persistido o mock.
  data.currentUser = {
    id: null,
    name: '',
    email: null,
    role: 'SIN_ROL',
    title: '',
    avatar: '👤'
  };

  // Normalizar mantenciones para asociarlas a las 6 áreas de trabajo
  if (Array.isArray(data.maintenances)) {
    data.maintenances.forEach(m => {
      if (m.responsible === 'Carolina Morales') m.responsible = 'Roberto Silva';
      if (!m.materials) m.materials = [];
      if (!m.workAreaId) {
        const text = ((m.title || '') + ' ' + (m.assetName || '') + ' ' + (m.description || '')).toLowerCase();
        if (text.includes('caldera') || text.includes('generador') || text.includes('lavavajillas') || text.includes('lavadora') || text.includes('frío') || text.includes('refrigerador')) {
          m.workAreaId = 'workarea_maquinas';
          m.workAreaName = 'Mantención de Máquinas';
        } else if (text.includes('piscina') || text.includes('césped') || text.includes('jardín') || text.includes('árboles') || text.includes('bomba') || text.includes('filtro de piscina')) {
          m.workAreaId = 'workarea_jardineria';
          m.workAreaName = 'Mantención de Jardinería';
        } else if (text.includes('fuga') || text.includes('urgente') || text.includes('imprevista') || text.includes('cortocircuito') || text.includes('falla') || m.type === 'Esporádica') {
          m.workAreaId = 'workarea_reactiva';
          m.workAreaName = 'Mantención Reactiva';
        } else {
          m.workAreaId = 'workarea_general';
          m.workAreaName = 'Mantención General';
        }
      }
    });
  }

  // Normalizar mejoras
  if (Array.isArray(data.improvements)) {
    data.improvements.forEach(imp => {
      if (imp.responsible === 'Carolina Morales') imp.responsible = 'Roberto Silva';
      imp.workAreaId = 'workarea_mejoras';
      imp.workAreaName = 'Mejoras';
      if (!imp.materials) imp.materials = [];
    });
  }

  // Normalizar remodelaciones
  if (Array.isArray(data.renovations)) {
    data.renovations.forEach(ren => {
      if (ren.responsible === 'Carolina Morales') ren.responsible = 'Roberto Silva';
      ren.workAreaId = 'workarea_remodelacion';
      ren.workAreaName = 'Remodelación';
      if (!ren.materials) ren.materials = [];
    });
  }

  return data;
}

// ==========================================================
// S3B-4: MIGRACIÓN PUNTUAL DE localStorage
// EL_ALMENDRO_HOTEL_DATA históricamente pudo persistir la propiedad
// "users" (usuarios mock usr_1 / usr_3 / usr_4). Se elimina ÚNICAMENTE
// esa propiedad y se vuelve a guardar el resto del objeto intacto
// (mantenciones, activos, solicitudes, configuración, etc.).
// Segura si la clave no existe, si el JSON está vacío/inválido o si
// "users" ya no está. Si el storage ya está limpio NO se vuelve a
// escribir (no se modifica en cada carga). NUNCA se usa
// localStorage.clear().
// ==========================================================
function migrarLocalStorageLegacy() {
  const CLAVE = 'EL_ALMENDRO_HOTEL_DATA';
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return; // clave inexistente o vacía: nada que migrar

    let parsed;
    try {
      parsed = JSON.parse(crudo);
    } catch (e) {
      return; // JSON inválido: se ignora (loadInitialState usará datos iniciales)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;

    if (!Object.prototype.hasOwnProperty.call(parsed, 'users')) return; // ya limpio

    delete parsed.users;
    localStorage.setItem(CLAVE, JSON.stringify(parsed));
  } catch (e) {
    // Storage no disponible o cuota excedida: no bloquea el arranque.
    console.warn('No se pudo migrar EL_ALMENDRO_HOTEL_DATA (usuarios legacy):', e);
  }
}

function loadInitialState() {
  // Configuración local legítima; nunca rehidratar registros operativos heredados.
  const initial = {
    areas: [], workAreas: JSON.parse(JSON.stringify(DEFAULT_WORK_AREAS)),
    assets: [], maintenances: [], improvements: [], renovations: [], requests: [], notifications: [],
    settings: { appearance: { theme: 'light' } }
  };
  try {
    const saved = JSON.parse(localStorage.getItem('EL_ALMENDRO_HOTEL_DATA') || 'null');
    const theme = localStorage.getItem('hotel_theme') || saved?.settings?.appearance?.theme;
    if (theme === 'light' || theme === 'dark') initial.settings.appearance.theme = theme;
  } catch (_) { /* estado inválido o almacenamiento no disponible: iniciar vacío */ }
  return normalizeState(initial);
}

// Variables de estado global
let state = loadInitialState();
let currentView = 'dashboard';
let activeAreaFilter = null;
// C2E-4D — sub-vista interna de "Áreas de Trabajo". Cuando vale 'maquinas',
// renderAreasView() muestra el catálogo real de Mantención de Máquinas en
// pantalla completa en lugar de las seis tarjetas. Se activa SOLO con
// navigateTo('areas', null, 'maquinas') (desde openAreaMaquinas) y se limpia
// en cualquier otra navegación, por lo que la barra lateral sigue marcando
// "Áreas de Trabajo" y NO se agrega una ruta nueva al sidebar.
let areaSubVista = null;
let activeConvertingRequestId = null;
let selectedAssetTab = 'ficha';
let ganttViewMode = 'timeline'; // 'timeline' (diagrama) o 'horizontes' (fases)
let ganttCategoryFilter = 'TODAS';
let ganttAreaFilter = 'TODAS';
let ganttStatusFilter = 'TODAS';
let maintenanceCategoryFilter = 'TODAS';
let maintenanceAreaFilter = 'TODAS';
let maintenanceStatusFilter = 'TODAS';
let assetCategoryFilter = 'TODAS';
let assetWarrantyFilter = 'TODAS';

// Persistencia en localStorage
function saveState() {
  localStorage.setItem('EL_ALMENDRO_HOTEL_DATA', JSON.stringify(state));
  if (typeof updateSidebarBadges === 'function') updateSidebarBadges();
  if (typeof renderCurrentView === 'function') renderCurrentView();
}

function resetToFactoryData() {
  if (confirm('¿Reiniciar el estado local de la aplicación? No se eliminan registros de Supabase ni datos guardados anteriormente en este navegador.')) {
    const usuarioActual = state.currentUser;
    state = loadInitialState();
    state.currentUser = usuarioActual;
    if (typeof updateSidebarBadges === 'function') updateSidebarBadges();
    if (typeof renderCurrentView === 'function') renderCurrentView();
    alert('Estado local reiniciado. Los datos del servidor no se han modificado.');
  }
}

// Funciones de formato y utilidades
function formatCLP(amount) {
  return '$ ' + Number(amount || 0).toLocaleString('es-CL');
}

// Solo presentación. DATE civil no pasa por UTC; timestamptz se representa en Chile.
function formatearFechaCL(valor, { hora = false, civil = false, vacio = 'No definida', invalida = vacio } = {}) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return vacio;
  const texto=String(valor).trim();
  let partes=/^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(texto);
  const legible=/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto);
  if(!partes && legible)partes=[texto,legible[3],legible[2].padStart(2,'0'),legible[1].padStart(2,'0'),''];
  if(partes){
    const y=Number(partes[1]),m=Number(partes[2]),d=Number(partes[3]);
    const limite=[31,(y%4===0&&(y%100!==0||y%400===0))?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
    if(y<1||m<1||m>12||d<1||d>limite)return invalida;
    if(civil && partes[4] && !/^[T ]\d{2}:\d{2}/.test(partes[4]))return invalida;
    if(!partes[4] || civil)return `${partes[3]}-${partes[2]}-${partes[1]}`;
    // Un timestamp sin zona no se reinterpreta con la zona del ordenador.
    if(!/^[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(partes[4]))return invalida;
    const reloj=/^[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(partes[4]);
    if(Number(reloj[1])>23||Number(reloj[2])>59||Number(reloj[3]||0)>59)return invalida;
  }
  if(!partes && Object.prototype.toString.call(valor)!=='[object Date]')return invalida;
  const fecha=Object.prototype.toString.call(valor)==='[object Date]'?valor:new Date(texto.replace(/([+-]\d{2})(\d{2})$/,'$1:$2').replace(/([+-]\d{2})$/,'$1:00'));
  if(!Number.isFinite(fecha.getTime()))return invalida;
  const formato=formatearFechaCL.formato || (formatearFechaCL.formato=new Intl.DateTimeFormat('es-CL',{
    timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }));
  const p=formato.formatToParts(fecha),dato=tipo=>p.find(x=>x.type===tipo)?.value;
  return `${dato('day')}-${dato('month')}-${dato('year').padStart(4,'0')}`+(hora?` ${dato('hour')}:${dato('minute')}`:'');
}
function formatDate(dateStr) {
  return formatearFechaCL(dateStr,{invalida:dateStr==null||dateStr===''?'No definida':String(dateStr)});
}

// Carga inicial compartida: solo presentación, sin temporizadores ni consultas.
function uiCargandoHTML(id = '') {
  const atributo = /^[a-zA-Z][\w-]*$/.test(id) ? ' id="' + id + '"' : '';
  return '<div' + atributo + ' class="alm-carga-inicial" role="status" aria-live="polite"><span class="animate-spin alm-carga-inicial-icono" aria-hidden="true">⏳</span><span>Cargando...</span></div>';
}

function calculateWarrantyStatus(warranty) {
  if (!warranty || !warranty.endDate) {
    return { status: 'Sin Garantía', color: 'slate', badge: 'Sin Garantía', daysLeft: 0, text: 'No registra garantía' };
  }
  const today = getSystemDate();
  const endDate = new Date(warranty.endDate + 'T00:00:00');
  const diffTime = endDate.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return {
      status: 'Vencida',
      color: 'rose',
      badge: 'Garantía Vencida',
      daysLeft: daysLeft,
      text: `Venció el ${formatDate(warranty.endDate)}`
    };
  } else if (daysLeft <= 60) {
    return {
      status: 'Proxima',
      color: 'amber',
      badge: `Por vencer (${daysLeft} días)`,
      daysLeft: daysLeft,
      text: `Vence el ${formatDate(warranty.endDate)} (Quedan ${daysLeft} días)`
    };
  } else {
    return {
      status: 'Vigente',
      color: 'emerald',
      badge: 'En Garantía',
      daysLeft: daysLeft,
      text: `Vigente hasta ${formatDate(warranty.endDate)}`
    };
  }
}

// ==========================================================
// LÓGICA DE ALERTAS AUTOMÁTICAS DE MANTENCIÓN
// ==========================================================
function getMaintenanceAlert(mnt) {
  if (!mnt || mnt.status === 'Completada' || mnt.status === 'Cancelada') {
    return null;
  }

  const targetDateStr = mnt.limitDate || mnt.startDate;
  if (!targetDateStr) return null;

  const today = getSystemDate();
  const targetDate = new Date(targetDateStr + 'T00:00:00');
  const diffTime = targetDate.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return {
      level: 'Atrasada',
      badge: 'Atrasada',
      color: 'rose',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold ring-1 ring-rose-400',
      daysLeft: daysLeft,
      text: `Venció hace ${Math.abs(daysLeft)} día(s)`
    };
  } else if (daysLeft === 0) {
    return {
      level: 'Vence hoy',
      badge: 'Vence hoy',
      color: 'rose',
      badgeClass: 'bg-rose-600 text-white font-black animate-pulse shadow-sm',
      daysLeft: 0,
      text: 'Vence hoy'
    };
  } else if (daysLeft >= 1 && daysLeft <= 3) {
    return {
      level: 'Urgente',
      badge: `Urgente (${daysLeft}d)`,
      color: 'orange',
      badgeClass: 'bg-orange-100 text-orange-900 border border-orange-300 font-bold',
      daysLeft: daysLeft,
      text: `Urgente: faltan ${daysLeft} día(s)`
    };
  } else if (daysLeft >= 4 && daysLeft <= 7) {
    return {
      level: 'Alta',
      badge: `Alta (${daysLeft}d)`,
      color: 'amber',
      badgeClass: 'bg-amber-100 text-amber-900 border border-amber-300 font-bold',
      daysLeft: daysLeft,
      text: `Prioridad alta: faltan ${daysLeft} días`
    };
  } else if (daysLeft >= 8 && daysLeft <= 30) {
    return {
      level: 'Próxima',
      badge: `Próxima (${daysLeft}d)`,
      color: 'blue',
      badgeClass: 'bg-blue-100 text-blue-900 border border-blue-200 font-semibold',
      daysLeft: daysLeft,
      text: `Programada en ${daysLeft} días`
    };
  }

  return null;
}

// Sincronización de notificaciones automáticas sin duplicación
function syncMaintenanceAlertNotifications() {
  if (!state.notifications) state.notifications = [];

  let newNotificationsAdded = false;

  (state.maintenances || []).forEach(m => {
    const alert = getMaintenanceAlert(m);
    if (alert && (alert.level === 'Atrasada' || alert.level === 'Vence hoy' || alert.level === 'Urgente' || alert.level === 'Alta')) {
      const notifId = `notif_mnt_alert_${m.id}_${alert.level}`;
      const exists = state.notifications.some(n => n.id === notifId);

      if (!exists) {
        state.notifications.unshift({
          id: notifId,
          type: alert.level === 'Atrasada' || alert.level === 'Vence hoy' ? 'alert' : 'warning',
          title: `Alerta: ${m.title} (${alert.badge})`,
          message: `${alert.text} en ${m.areaName} (${m.workAreaName || 'Mantención'}). Responsable: ${m.responsible}.`,
          timestamp: 'Automática',
          linkModule: 'mantenciones',
          read: false,
          referenceId: m.id
        });
        sendEmailAlertNotification(alert, m);
        newNotificationsAdded = true;
      }
    }
  });

  if (newNotificationsAdded) {
    saveState();
  }
}

// Preparación lógica para envío de correo
function sendEmailAlertNotification(alert, mnt) {
  // Simulación y registro de auditoría de despacho de correo
  const emailPayload = {
    to: state.currentUser ? state.currentUser.email : 'operaciones@elalmendro.cl',
    subject: `[Alerta Mantención - ${alert.badge}] ${mnt.title}`,
    body: `Se ha detectado una mantención con estado: ${alert.level}.\nÁrea: ${mnt.areaName}\nFecha límite: ${mnt.limitDate}\nResponsable: ${mnt.responsible}`,
    sentAt: new Date().toISOString()
  };
  console.info("📧 [ALERTA DE CORREO PREPARADA]", emailPayload);
}

// ==========================================================
// CACHÉ RUNTIME DE PROYECTOS REALES DE MEJORAS (FASE 4G-4B)
// Fuente única: MejorasService.getProyectos(), cargada por las vistas
// (Dashboard / Áreas) en sus loaders async. Es SOLO runtime:
// NO se guarda en state, NI en state.improvements, NI en localStorage.
// null = sin datos reales disponibles (error de Supabase o aún no se
// cargó); en ese caso las funciones de KPIs aportan CERO de Mejoras
// y NUNCA caen de vuelta a los mocks.
// ==========================================================
let proyectosMejorasReales = null;

function setProyectosMejorasReales(proyectos) {
  proyectosMejorasReales = Array.isArray(proyectos) ? proyectos : null;
}

function getProyectosMejorasReales() {
  return proyectosMejorasReales;
}

// ==========================================================
// CÁLCULO DINÁMICO DE KPIS PARA EL DASHBOARD
// ==========================================================
function getDashboardKPIs(realRenovations = null) {
  const activeMnt = (state.maintenances || []).filter(m => m.status !== 'Completada' && m.status !== 'Cancelada').length;
  // FASE 4G-4B: activas de Mejoras desde proyectos REALES (caché runtime),
  // nunca desde state.improvements. Regla: estado !== 'Finalizado' cuenta
  // como activo (En proceso, Pendiente de inicio, Pausado y NULL cuentan;
  // Finalizado no). Misma regla que el badge sidebar (4G-1). Caché null →
  // 0 aporte, sin fallback a mocks.
  const activeImp = (proyectosMejorasReales || []).filter(p => p && p.estado !== 'Finalizado').length;
  
  let activeRen = 0;
  let costRen = 0;
  let renCompletedCount = 0;

  if (realRenovations) {
    activeRen = realRenovations.filter(r => r.status && r.status !== 'Finalizado' && r.status !== 'Sin definir').length;
    renCompletedCount = realRenovations.filter(r => r.status === 'Finalizado').length;
    
    // REGLA ECONOMICA UNICA
    costRen = realRenovations.reduce((acc, r) => {
      let val = 0;
      const pres = r.presupuestosResumen || [];
      const imps = r.importacionesResumen || [];
      const pReal = pres.find(p => p.tipo === 'REAL');
      const pHist = pres.find(p => p.tipo === 'PRESUPUESTO_HISTORICO');
      
      if (pReal && pReal.total_con_iva != null) val = pReal.total_con_iva;
      else if (pHist && pHist.total_con_iva != null) val = pHist.total_con_iva;
      else if (imps.length > 0 && imps[0].total_con_iva != null) val = imps[0].total_con_iva;
      
      return acc + val;
    }, 0);
  } else {
    // Fallback
    activeRen = (state.renovations || []).filter(r => r.status !== 'Completado' && r.status !== 'Cancelado').length;
    renCompletedCount = (state.renovations || []).filter(r => r.status === 'Completado').length;
    costRen = (state.renovations || []).reduce((acc, r) => {
      const matSum = (r.materials || []).reduce((subAcc, mat) => subAcc + (mat.subtotal || 0), 0);
      return acc + matSum;
    }, 0);
  }

  const totalActiveTasks = activeMnt + activeImp + activeRen;

  // Mantenciones próximas (alertas activas Próxima, Alta, Urgente, Vence hoy)
  const upcomingCount = (state.maintenances || []).filter(m => {
    const alert = getMaintenanceAlert(m);
    return alert && (alert.level === 'Próxima' || alert.level === 'Alta' || alert.level === 'Urgente' || alert.level === 'Vence hoy');
  }).length;

  // Costo acumulado (FASE 4G-4B): Mejoras / Obras NO participa porque el
  // proyecto real no tiene costo confirmado. Se EXCLUYE de la suma — no se
  // sustituye por 0, budget, montos del Plan Anual ni estimaciones.
  // totalMonthlyCostIsPartial avisa a la UI que el total no cubre
  // Mejoras / Obras por falta de costo confirmado.
  const costMnt = (state.maintenances || []).reduce((acc, m) => acc + (m.actualCost || 0), 0);
  const totalMonthlyCost = costMnt + costRen;
  const totalMonthlyCostIsPartial = true;

  // Porcentaje de tareas completadas a tiempo
  let completedOnTime = 0;
  let totalCompleted = 0;

  (state.maintenances || []).forEach(m => {
    if (m.status === 'Completada') {
      totalCompleted++;
      if (m.completedDate && m.limitDate) {
        if (m.completedDate <= m.limitDate) completedOnTime++;
      } else {
        completedOnTime++;
      }
    }
  });

  // FASE 4G-4B: Mejoras / Obras NO participa de completedOnTime/totalCompleted.
  // Los proyectos reales no tienen fecha real de término que permita comprobar
  // puntualidad, y NO se asume "Finalizado = terminado a tiempo" (el loop de
  // state.improvements se eliminó).

  totalCompleted += renCompletedCount;
  completedOnTime += renCompletedCount; // Asumimos on-time temporalmente o solo aportamos al volumen

  // FASE 4G-4B: se eliminó el 92% hardcodeado. Sin base de cálculo → null
  // (la UI muestra "Sin datos suficientes"; nunca un porcentaje inventado).
  const onTimePercentage = totalCompleted > 0 ? Math.round((completedOnTime / totalCompleted) * 100) : null;

  return {
    totalActiveTasks,
    upcomingCount,
    totalMonthlyCost,
    totalMonthlyCostIsPartial,
    onTimePercentage,
    completedOnTime,
    totalCompleted
  };
}

// ==========================================================
// CONSULTA UNIFICADA POR ÁREA DE TRABAJO (SINGLE SOURCE OF TRUTH)
// ==========================================================
function getWorkAreaStats(workAreaId, realRenovations = null) {
  const areaDef = (state.workAreas || DEFAULT_WORK_AREAS).find(a => a.id === workAreaId) || DEFAULT_WORK_AREAS[0];

  let tasks = [];

  if (workAreaId === 'workarea_mejoras') {
    // FASE 4G-4B: proyectos REALES de Supabase (caché runtime de state.js).
    // TODOS los proyectos de MejorasService.getProyectos() pertenecen
    // funcionalmente a workarea_mejoras; NO se usa proyecto.area_id (UUID de
    // área física) para decidir este bucket ni se relaciona con state.areas.
    // Caché null → CERO tareas, sin fallback a state.improvements.
    tasks = (proyectosMejorasReales || []).filter(p => p).map(p => {
      // Área visible (solo presentación): resolución SOLO por coincidencia
      // exacta contra state.areas. NULL → "Sin área registrada"; sin match →
      // "Área registrada". Nunca se muestra el UUID ni se inventa el nombre.
      let areaTexto = 'Sin área registrada';
      if (p.area_id !== null && p.area_id !== undefined && p.area_id !== '') {
        const areaEnCatalogo = (state.areas || []).find(a => a && a.id === p.area_id);
        areaTexto = areaEnCatalogo ? areaEnCatalogo.name : 'Área registrada';
      }

      return {
        id: p.id,
        title: p.nombre || 'Sin nombre registrado',
        description: p.observaciones || 'Sin descripción registrada.',
        status: (p.estado !== null && p.estado !== undefined && p.estado !== '')
          ? p.estado
          : 'Sin estado registrado',
        responsible: (p.responsable_texto !== null && p.responsable_texto !== undefined && p.responsable_texto !== '')
          ? p.responsable_texto
          : 'Sin responsable registrado',
        startDate: p.fecha_inicio,
        limitDate: p.fecha_fin_estimada,
        // Sin costo/presupuesto/materiales confirmados a nivel proyecto:
        // null explícito (NO 0 como si fuera real) y sin materiales inventados.
        estimatedCost: null,
        actualCost: null,
        materials: [],
        type: 'Mejora',
        module: 'mejoras',
        areaName: areaTexto
      };
    });
  } else if (workAreaId === 'workarea_remodelacion') {
    if (realRenovations) {
      tasks = realRenovations.map(r => {
        let actualCost = 0;
        let estCost = 0;
        const pres = r.presupuestosResumen || [];
        const imps = r.importacionesResumen || [];
        const pReal = pres.find(p => p.tipo === 'REAL');
        const pHist = pres.find(p => p.tipo === 'PRESUPUESTO_HISTORICO');
        const pEst = pres.find(p => p.tipo === 'ESTIMADO');

        if (pReal && pReal.total_con_iva != null) actualCost = pReal.total_con_iva;
        else if (pHist && pHist.total_con_iva != null) actualCost = pHist.total_con_iva;
        else if (imps.length > 0 && imps[0].total_con_iva != null) actualCost = imps[0].total_con_iva;
        
        if (pEst && pEst.total_con_iva != null) estCost = pEst.total_con_iva;

        return {
          id: r.id,
          title: r.name,
          description: r.description,
          status: r.status || 'Sin definir',
          responsible: r.responsible,
          startDate: r.fechaInicio,
          limitDate: r.fechaFin,
          estimatedCost: estCost,
          actualCost: actualCost,
          type: 'Remodelación',
          module: 'remodelaciones',
          areaName: r.space
        };
      });
    } else {
      tasks = (state.renovations || []).map(r => ({
        id: r.id,
        title: r.name,
        description: r.description,
        status: r.status === 'Completado' ? 'Completada' : (r.status === 'En Proceso' ? 'En proceso' : 'Pendiente'),
        responsible: r.responsible,
        startDate: r.startDate,
        limitDate: r.endDate,
        estimatedCost: r.budget || 0,
        actualCost: (r.materials || []).reduce((acc, m) => acc + (m.subtotal || 0), 0),
        materials: r.materials || [],
        type: 'Remodelación',
        module: 'remodelaciones',
        areaName: r.areaName
      }));
    }
  } else {
    // Mantenciones asignadas a este área de trabajo
    tasks = (state.maintenances || []).filter(m => {
      if (workAreaId === 'workarea_general') {
        return m.workAreaId === 'workarea_general' || !m.workAreaId;
      }
      return m.workAreaId === workAreaId;
    }).map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      status: m.status,
      responsible: m.responsible,
      startDate: m.startDate,
      limitDate: m.limitDate,
      estimatedCost: m.estimatedCost || 0,
      actualCost: m.actualCost || 0,
      materials: m.materials || [],
      type: m.type,
      module: 'mantenciones',
      areaName: m.areaName,
      alert: getMaintenanceAlert(m)
    }));
  }

    let active, pending, inProgress, completed, delayed;
  if (workAreaId === 'workarea_mejoras') {
    // FASE 4G-4B: contadores con el vocabulario REAL de proyectos (no el
    // contador genérico de estados mock):
    // - 'En proceso' → inProgress + active
    // - 'Pendiente de inicio' → pending + active
    // - 'Finalizado' → completed (NO active)
    // - 'Pausado' → active únicamente
    // - NULL / 'Sin estado registrado' → active únicamente
    active = tasks.filter(t => t.status !== 'Finalizado').length;
    pending = tasks.filter(t => t.status === 'Pendiente de inicio').length;
    inProgress = tasks.filter(t => t.status === 'En proceso').length;
    completed = tasks.filter(t => t.status === 'Finalizado').length;
    // delayed = 0 por ahora: NO se marca 'Pausado' como atrasado y NO se
    // deriva atraso por fecha (getSystemDate() sigue pendiente de corrección).
    delayed = 0;
  } else if (workAreaId === 'workarea_remodelacion') {
    active = tasks.filter(t => t.status === 'En proceso').length;
    pending = tasks.filter(t => t.status === 'Pendiente de inicio').length;
    inProgress = active;
    completed = tasks.filter(t => t.status === 'Finalizado').length;
    delayed = tasks.filter(t => t.status === 'Pausado').length;
    const undef = tasks.filter(t => t.status === 'Sin definir').length;
    areaDef.undef = undef; // pass this down so UI can use it
  } else {
    active = tasks.filter(t => t.status !== 'Completada' && t.status !== 'Cancelada').length;
    pending = tasks.filter(t => t.status === 'Pendiente' || t.status === 'Programada' || t.status === 'Planificación').length;
    inProgress = tasks.filter(t => t.status === 'En proceso' || t.status === 'En Proceso').length;
    completed = tasks.filter(t => t.status === 'Completada' || t.status === 'Completado').length;
    delayed = tasks.filter(t => t.status === 'Atrasada' || (t.alert && t.alert.level === 'Atrasada')).length;
  }
  
  let totalEstimatedCost = tasks.reduce((acc, t) => acc + (t.estimatedCost || 0), 0);
  let totalActualCost = tasks.reduce((acc, t) => acc + (t.actualCost || 0), 0);

  // FASE 4G-4B: si Mejoras / Obras no tiene NINGÚN costo confirmado →
  // null explícito (NO 0, que se leería como "$0 reales"). Solo aplica a
  // workarea_mejoras: los demás módulos conservan su comportamiento actual.
  if (workAreaId === 'workarea_mejoras') {
    if (!tasks.some(t => t.estimatedCost !== null && t.estimatedCost !== undefined)) {
      totalEstimatedCost = null;
    }
    if (!tasks.some(t => t.actualCost !== null && t.actualCost !== undefined)) {
      totalActualCost = null;
    }
  }

  // Materiales consolidados del área
  const allMaterials = [];
  tasks.forEach(t => {
    (t.materials || []).forEach(m => {
      allMaterials.push({
        ...m,
        taskTitle: t.title,
        taskId: t.id
      });
    });
  });

  return {
    area: areaDef,
    tasks,
    active,
    pending,
    inProgress,
    completed,
    delayed,
    totalEstimatedCost,
    totalActualCost,
    materials: allMaterials
  };
}

// ==========================================================
// Identidad de usuarios
// ==========================================================







// La única fuente de usuarios y roles es Supabase:
// public.usuarios + public.roles vía js/services/usuarios.service.js.
// La identidad real se carga en app.js → cargarPerfilReal()
// → state.currentUser.

// ==========================================================

// ==========================================================
// REGISTRO ESCALABLE DE MÓDULOS Y ACCIONES DEL SISTEMA
// ==========================================================
window.SYSTEM_MODULES_CONFIG = [
  { id: 'dashboard', name: 'Panel Principal / Dashboard', icon: '📊', desc: 'Métricas generales, KPIs y resúmenes ejecutivos' },
  { id: 'mantenciones', name: 'Mantenciones del Hotel', icon: '🔧', desc: 'Cuadrícula de preventivas, correctivas y esporádicas' },
  { id: 'mejoras', name: 'Obras y Mejoras', icon: '🌿', desc: 'Proyectos de infraestructura, quincho, pérgolas y jardinería' },
  { id: 'remodelaciones', name: 'Remodelaciones & Calculadora', icon: '🏗️', desc: 'Renovación de espacios y cómputos de materiales' },
  { id: 'activos', name: 'Activos Fijos & Garantías', icon: '🏷️', desc: 'Inventario técnico, maquinaria y vencimiento de garantías' },
  { id: 'inventario', name: 'Inventario de Bodegas', icon: '📦', desc: 'Catálogo de productos por bodega, existencias verificadas y trazabilidad de movimientos' },
  { id: 'areas', name: 'Áreas del Hotel', icon: '📍', desc: 'Explorador y fichas de sectores y cabañas' },
  { id: 'fechas', name: 'Calendario & Próximas Fechas', icon: '📅', desc: 'Cronograma visual de compromisos y plazos' },
  { id: 'prevencionista', name: 'Prevencionista · Cartas Gantt', icon: '📋', desc: 'Planes preventivos, fases, tareas y documentación' },
  { id: 'tareas-pendientes', name: 'Gestión de Tareas', icon: '✅', desc: 'Trabajos generales del hotel' },
  { id: 'gantt', name: 'Línea de Tiempo Gantt', icon: '📈', desc: 'Planificación temporal gráfica de proyectos' },
  { id: 'solicitudes', name: 'Bandeja de Solicitudes', icon: '📩', desc: 'Recepción y seguimiento de reportes de personal' },
  { id: 'notificaciones', name: 'Centro de Notificaciones', icon: '🔔', desc: 'Avisos de atrasos, garantías por vencer y alertas' },
  { id: 'configuracion', name: 'Configuración del Sistema', icon: '⚙️', desc: 'Parámetros del hotel, exportación y copias de seguridad' },
  { id: 'admin', name: 'Panel de Administración & Roles', icon: '🛡️', desc: 'Control de colaboradores, permisos y seguridad (acceso solo para Administradores reales)' }
];

window.SYSTEM_ACTIONS_CONFIG = [
  { id: 'approve_budgets', name: 'Aprobar Presupuestos y Costos', icon: '💰', desc: 'Validar montos asignados, gastos reales y partidas' },
  { id: 'convert_requests', name: 'Convertir Solicitud a Orden de Trabajo', icon: '⚡', desc: 'Aprobar reportes y despacharlos a mantención u obra' },
  { id: 'create_records', name: 'Crear Órdenes y Proyectos', icon: '➕', desc: 'Registrar nuevas tareas, obras o remodelaciones' },
  { id: 'export_data', name: 'Exportar Reportes a Excel / CSV', icon: '📥', desc: 'Descarga masiva de inventario y planillas operativas' },
  { id: 'delete_records', name: 'Eliminar Registros Operativos', icon: '🗑️', desc: 'Borrar fichas, activos o proyectos de la base de datos' }
];

function getUserEffectivePermissions(user) {
  if (!user) return { modules: [], actions: [] };
  // S3C-0D: una cuenta SIN_ROL (pendiente de aprobación o sin rol
  // verificable) NO tiene módulos ni acciones. Denegar por defecto.
  if (!user.role || user.role === 'SIN_ROL') return { modules: [], actions: [] };
  if (user.role === 'RECEPCION' && user.esAdminPermanente !== true && user.esAdminTemporal !== true) {
    return { modules: ['solicitudes', 'configuracion'], actions: [] };
  }
  if (user.permissions && Array.isArray(user.permissions.modules)) {
    return {
      modules: [...user.permissions.modules],
      actions: Array.isArray(user.permissions.actions) ? [...user.permissions.actions] : []
    };
  }
  // S3C-2C: Administrador OPERATIVO (permanente O temporal vigente)
  // recibe el set completo, aunque su rol permanente sea TECNICO o
  // RECEPCION. La bandera esAdminTemporal la pone app.js desde la
  // RPC mi_estado_administrativo() (reloj del servidor). El rol
  // permanente (user.role) NO se modifica.
  if (user.role === 'ADMINISTRADOR' || user.esAdminPermanente === true || user.esAdminTemporal === true) {
    return {
      modules: window.SYSTEM_MODULES_CONFIG.map(m => m.id),
      actions: window.SYSTEM_ACTIONS_CONFIG.map(a => a.id)
    };
  } else if (user.role === 'TECNICO') {
    return {
      // INV-4: 'inventario' agrega solo CONSULTA (matriz de permisos
      // aprobada para el módulo Inventario).
      modules: ['dashboard', 'mantenciones', 'mejoras', 'remodelaciones', 'activos', 'inventario', 'areas', 'fechas', 'prevencionista', 'gantt', 'solicitudes', 'notificaciones'],
      actions: ['create_records', 'export_data']
    };
  } else {
    // SOLICITANTE
    return {
      modules: ['dashboard', 'solicitudes'],
      actions: []
    };
  }
}





