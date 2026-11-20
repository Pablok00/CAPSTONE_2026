// UX-07: guardados confirmados se releen y repintan localmente, sin F5.
// UX-02: las ventanas solo se cierran con controles explícitos o tras guardar.
// Esta regla sustituye las referencias históricas a cierre por fondo o Escape.
// ==========================================================
// PREVENCIONISTA — MÓDULO PRINCIPAL DE NAVEGACIÓN
// ==========================================================
//
// Interfaz ÚNICA y limpia de Prevencionista (antes subapartado de
// Mantención General, hoy módulo propio en la navegación). Enfocada en:
//   1) Cartas Gantt (prevencion_gantt_planes)
//   2) Archivos Prevencionista (biblioteca real de documentos; C2P-5D
//      vía window.PrevencionDocumentosService)
//
// FUENTE DE DATOS: window.MantencionesService.getPrevencionGantt()
// (mismo SELECT y misma caché _prevencionCache de siempre) y, para la
// sección de archivos (solo administrador permanente),
// window.PrevencionDocumentosService. La vista NO consulta Supabase
// directamente.
//
// ESCRITURAS: SOLO vía service (MantencionesService.guardarPlanPrevencion /
// guardarFasePrevencion / guardarItemPrevencion / reordenarPrevencion) que
// ejecutan .rpc() server-side. Aquí NO existe .insert() / .update() /
// .delete(). Tras una RPC confirmada con ÉXITO la vista hace
// una relectura local de la carta, sin recargar la SPA.
// Si la RPC FALLA: NO hay reload, se muestra el error real y el formulario
// conserva sus datos para corregir.
// EXCEPCIÓN C2P-5D: los documentos (subir/eliminar) NO usan F5; refrescan
// SOLO la sección de Archivos releyendo Supabase con listarDocumentos(true).
//
// CONTROLES DE EDICIÓN: solo si esAdminPermanenteActual() === true
// (defensa en profundidad; el backend revalida con auth.uid(),
// usuario_habilitado_actual() y es_administrador_permanente_actual()).
//
// RENDERER: window.GanttCarta (js/components/ganttCarta.js), SIN
// modificarlo: la Carta Gantt conserva meses, días, columna izquierda,
// colores, barras, línea Hoy, progreso, scrollbar y tipografía del Gantt
// aprobado de Mejoras. Los controles administrativos van FUERA del
// renderer (alrededor del bloque).
//
// PLACEHOLDERS / GRUPOS (regla C2P-4B-D): una fila es tarea visible
// SOLO si es_grupo !== true AND activo !== false AND titulo tiene
// contenido real. Los 16 placeholders (titulo NULL) se conservan en
// Supabase como trazabilidad del Excel y NO aparecen en la Carta Gantt
// estándar. No se inventan nombres ni fechas.
//
// INMUTABLES: *_original, fila_origen, celda_identificacion_origen,
// es_placeholder, es_grupo, importacion_id y segmentos históricos NUNCA
// se envían en ninguna escritura.
//
// UX C2P-4C (limpieza del editor):
// - La ventana principal de la Carta Gantt queda LIMPIA: cabecera +
//   botones + gráfico y nada más (sin listas permanentes de fases ni de
//   tareas debajo, sin flechas ↑↓ repetidas).
// - "+ Agregar fase" y "+ Agregar tarea" abren la modal de formulario
//   (pvModalFormulario) sobre la carta; "Editar información" abre el
//   mismo patrón de la Nueva Carta Gantt.
// - "Administrar estructura" abre una modal ADMINISTRATIVA con pestañas
//   Fases (n) / Tareas (m); las tareas se agrupan por fase. Placeholders
//   y grupos siguen sin aparecer.
// - Edición directa desde el Gantt (solo administrador): clic en el
//   nombre/fila de una tarea de la columna izquierda abre "Editar
//   tarea". GanttCarta NO se modifica: la detección es por delegación de
//   eventos en el contenedor de la modal.
// - Escape cierra en orden: confirmar eliminación > subida de archivo >
//   formulario > administración > carta.
// ==========================================================

// ------------------------------------------------------------
// Estado local (solo lectura en cliente; NO son copias de escritura)
// ------------------------------------------------------------
let pvPlanes = [];
let pvFases = [];
let pvItems = [];
let pvPlanAbiertoId = null;
let pvGuardandoForm = false;
let pvFormularioExterno = null;
let pvTrasGuardarExterno = null;
let pvFormCtx = { tipo: null, planId: null, faseId: null, itemId: null };
// C2P-4C: estado de la modal administrativa "Administrar estructura".
let pvAdminAbierto = false;
let pvAdminTab = 'fases'; // 'fases' | 'tareas'

// C2P-4B.3 — clave temporal de sessionStorage para CONSERVAR la Carta
// Gantt abierta después del F5 automático. Vive solo en la pestaña actual,
// se escribe SOLO tras una RPC exitosa y se elimina (consume) al volver a
// cargar los datos desde Supabase, antes de reabrir, para no crear bucles.
const PV_REABRIR_PLAN_KEY = 'prevencionista_reabrir_plan';

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function pvEsAdmin() {
  return typeof esAdminPermanenteActual === 'function' && esAdminPermanenteActual() === true;
}

function pvEsc(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Texto no vacío o null (nunca '' como valor semántico).
function pvValor(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

// Fecha legible dd-mm-aaaa (acepta 'YYYY-MM-DD' o Date). null si no hay.
function pvFecha(valor) {
  const civil=Object.prototype.toString.call(valor)==='[object Date]'&&Number.isFinite(valor.getTime()) ? [valor.getFullYear(),String(valor.getMonth()+1).padStart(2,'0'),String(valor.getDate()).padStart(2,'0')].join('-') : valor;
  return formatearFechaCL(civil,{civil:true,vacio:null});
}

function pvPlanPorId(planId) {
  return (Array.isArray(pvPlanes) ? pvPlanes : []).find(p => p && p.id === planId) || null;
}

function pvFasePorId(faseId) {
  if (!faseId) return null;
  return (Array.isArray(pvFases) ? pvFases : []).find(f => f && f.id === faseId) || null;
}

function pvItemPorId(itemId) {
  if (!itemId) return null;
  return (Array.isArray(pvItems) ? pvItems : []).find(i => i && i.id === itemId) || null;
}

// Campo 'orden' o 999999 si es NULL (los registros migrados pueden no
// tenerlo; NUNCA se inventa un orden para ocultar el registro).
function pvOrden(registro) {
  const n = Number(registro && registro.orden !== undefined && registro.orden !== null ? registro.orden : NaN);
  return Number.isFinite(n) ? n : 999999;
}

function pvOrdenFila(registro) {
  const n = Number(registro && registro.fila_origen !== undefined && registro.fila_origen !== null ? registro.fila_origen : NaN);
  return Number.isFinite(n) ? n : 999999;
}

// Orden por defecto de fases: fase.orden ASC, con desempate estable.
function pvCompararFases(a, b) {
  return (pvOrden(a) - pvOrden(b))
    || (pvOrdenFila(a) - pvOrdenFila(b))
    || String(pvValor((a && a.nombre) || '') || '').localeCompare(String(pvValor((b && b.nombre) || '') || ''), 'es');
}

// Orden por defecto de tareas: fase.orden + item.orden (spec C2P-4B-C/G),
// con desempate por fila_origen (orden del Excel) y título.
function pvCompararItems(a, b) {
  const fa = pvFasePorId(a && a.fase_id);
  const fb = pvFasePorId(b && b.fase_id);
  const oa = fa ? pvOrden(fa) : 999999;
  const ob = fb ? pvOrden(fb) : 999999;
  return (oa - ob)
    || (pvOrden(a) - pvOrden(b))
    || (pvOrdenFila(a) - pvOrdenFila(b))
    || String(pvValor((a && a.titulo) || '') || '').localeCompare(String(pvValor((b && b.titulo) || '') || ''), 'es');
}

// Orden dentro de una misma fase (reordenamiento TAREAS).
function pvCompararItemsMismaFase(a, b) {
  return (pvOrden(a) - pvOrden(b))
    || (pvOrdenFila(a) - pvOrdenFila(b))
    || String(pvValor((a && a.titulo) || '') || '').localeCompare(String(pvValor((b && b.titulo) || '') || ''), 'es');
}

function pvFasesPlan(planId) {
  return (Array.isArray(pvFases) ? pvFases : [])
    .filter(f => f && f.plan_id === planId)
    .slice()
    .sort(pvCompararFases);
}

// REGLA C2P-4B-D: solo una fila con título real, no grupo y activa es
// "tarea definida". Los placeholders (titulo NULL) quedan fuera del
// Gantt estándar; en BD siguen intactos.
function pvEsTareaReal(item) {
  return !!(item && item.es_grupo !== true && item.activo !== false && pvValor(item.titulo) !== null);
}

function pvTareasReales(planId) {
  return (Array.isArray(pvItems) ? pvItems : [])
    .filter(it => it && it.plan_id === planId && pvEsTareaReal(it))
    .slice()
    .sort(pvCompararItems);
}

// REGLA C2P-4B.2 — CONJUNTO ADMINISTRABLE (distinto del Gantt):
//   A) pvTareasReales()      → solo activas + título real + no grupo (Gantt).
//   B) pvTareaAdministrable() → título real + no grupo, INCLUYENDO las
//      inactivas, para que una tarea desactivada nunca quede inaccesible.
// Los placeholders (es_placeholder === true y sin título) quedan
// excluidos de AMBOS conjuntos y de toda la UI administrativa; en
// Supabase siguen intactos. Los encabezados es_grupo=true tampoco se
// muestran ni participan en la UI.
function pvTareaAdministrable(item) {
  return !!(item && item.es_grupo !== true && pvValor(item.titulo) !== null);
}

function pvTareasAdministrables(planId) {
  return (Array.isArray(pvItems) ? pvItems : [])
    .filter(it => it && it.plan_id === planId && pvTareaAdministrable(it))
    .slice()
    .sort(pvCompararItems);
}

// ADAPTADOR Prevencionista → GanttCarta. Mapea campos de BD al modelo
// normalizado del componente. NO incluye la clave 'estado' (Prevencionista
// no tiene estado): la línea meta del renderer omite ese segmento y
// muestra FASE · RESPONSABLE · PROGRESO.
function pvAdaptarTareas(items) {
  return (Array.isArray(items) ? items : []).map(it => {
    const fase = pvFasePorId(it.fase_id);
    const bruto = it.progreso_porcentaje;
    const progreso = (bruto === null || bruto === undefined || String(bruto).trim() === '')
      ? null
      : Number(bruto);

    return {
      id: it.id,
      titulo: pvValor(it.titulo) || 'Sin título registrado',
      faseId: it.fase_id || null,
      faseNombre: (fase && pvValor(fase.nombre)) || 'Sin fase registrada',
      responsable: pvValor(it.responsable),
      fechaInicio: pvValor(it.fecha_inicio),
      fechaFin: pvValor(it.fecha_termino),
      progreso: Number.isNaN(progreso) ? null : progreso,
      activo: it.activo !== false
      // SIN 'estado' → la meta línea no dibuja ese segmento.
    };
  });
}

// Colores SOLO presentación: paleta del componente por posición de fase
// (nunca se persisten hex).
function pvColoresFases(planId) {
  const colores = {};
  if (!window.GanttCarta || !Array.isArray(window.GanttCarta.PALETA_FASES)) return colores;
  pvFasesPlan(planId).forEach((f, i) => {
    const nombre = pvValor(f.nombre);
    if (nombre && colores[nombre] === undefined) {
      colores[nombre] = window.GanttCarta.PALETA_FASES[i % window.GanttCarta.PALETA_FASES.length];
    }
  });
  return colores;
}

// Leyenda: fases ACTIVAS del plan en su orden, más cualquier fase usada
// por tareas visibles que no esté en esa lista (nunca se pierde una
// agrupación real en la leyenda).
function pvFasesLeyenda(tareas, planId) {
  const nombres = [];
  pvFasesPlan(planId).filter(f => f.activo !== false).forEach(f => {
    const nombre = pvValor(f.nombre) || null;
    if (!nombres.includes(nombre)) nombres.push(nombre);
  });
  (Array.isArray(tareas) ? tareas : []).forEach(t => {
    const nombre = (t && t.faseNombre) || null;
    if (!nombres.includes(nombre)) nombres.push(nombre);
  });
  return nombres.map(nombre => ({ nombre }));
}

function pvFormVisible() {
  const overlay = document.getElementById('pv-modal-formulario-prevencion');
  return !!(overlay && !overlay.classList.contains('hidden'));
}

function pvGanttVisible() {
  const overlay = document.getElementById('pv-modal-carta-gantt');
  return !!(overlay && !overlay.classList.contains('hidden'));
}

function pvAdminVisible() {
  const overlay = document.getElementById('pv-modal-administrar-prevencion');
  return !!(overlay && !overlay.classList.contains('hidden'));
}

function pvCampo(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function pvCampoMarcado(id) {
  const el = document.getElementById(id);
  return !!(el && el.checked);
}

// Mensaje de error visible: conserva SIEMPRE el texto real de Supabase y
// agrega el token .codigo del backend si corresponde.
function pvMensajeError(e) {
  const base = (e && typeof e.message === 'string' && e.message)
    ? e.message
    : 'No fue posible completar la operación.';
  if (e && e.codigo && base.indexOf(e.codigo) !== 0) return `${e.codigo}: ${base}`;
  return base;
}

// ------------------------------------------------------------
// UX-07: contexto de actualización local. La antigua clave de sessionStorage
// solo se consume por compatibilidad; las escrituras nuevas no la generan.
let pvPlanTrasGuardar = null;
let pvActualizando = false;
let pvRelecturaPendiente = false;
let pvAccionEnCurso = false;
function pvGuardarClaveReabrir(planId, activo) {
  pvPlanTrasGuardar = activo === false ? null : planId || null;

}

// Extrae el plan_id retornado por prevencion_gantt_guardar_plan. Soporta
// uuid plano, objeto { plan_id } / { id } o fila única en arreglo. Si la
// forma no es reconocible devuelve null → se queda en el listado (seguro).
function pvResultadoPlanId(data) {
  if (typeof data === 'string') return data.trim() || null;
  if (Array.isArray(data)) return data.length ? pvResultadoPlanId(data[0]) : null;
  if (data && typeof data === 'object') {
    if (typeof data.plan_id === 'string' && data.plan_id) return data.plan_id;
    if (typeof data.id === 'string' && data.id) return data.id;
    if (data.plan && typeof data.plan === 'object') return pvResultadoPlanId(data.plan);
  }
  return null;
}

// Se ejecuta DESPUÉS de que pvCargarVista() cargó los planes reales.
// Consume la clave SIEMPRE antes de intentar abrir (rompe cualquier bucle)
// y solo reabre si el plan existe realmente en los datos cargados y sigue
// activo. Si no existe: permanece en el listado, sin error.
function pvReabrirCartaPendiente() {
  let planId = null;
  try {
    planId = sessionStorage.getItem(PV_REABRIR_PLAN_KEY);
    sessionStorage.removeItem(PV_REABRIR_PLAN_KEY);
  } catch (e) {
    return;
  }
  if (!planId) return;

  const plan = pvPlanPorId(planId);
  if (!plan || plan.activo === false) {
    console.warn('Prevencionista: la carta pendiente ya no está disponible; se permanece en el listado.');
    return;
  }
  pvAbrirCartaGantt(planId);
}

// ------------------------------------------------------------
// VISTA PRINCIPAL
// ------------------------------------------------------------
function renderPrevencionistaView() {
  setTimeout(() => { pvCargarVista(); }, 0);
  return `
    ${uiCargandoHTML("pv-loader")}
    <div id="pv-content" class="hidden"></div>
  `;
}

async function pvCargarVista() {
  const loader = document.getElementById('pv-loader');
  const cont = document.getElementById('pv-content');
  if (!cont) return;

  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está disponible.');
    }

    const datos = await window.MantencionesService.getPrevencionGantt(pvRelecturaPendiente);
    pvPlanes = Array.isArray(datos && datos.planes) ? datos.planes : [];
    pvFases = Array.isArray(datos && datos.fases) ? datos.fases : [];
    pvItems = Array.isArray(datos && datos.items) ? datos.items : [];
    if(datos&&['planes','fases','items'].every(k=>Array.isArray(datos[k]))){
      pvRelecturaPendiente=false;pvPlanTrasGuardar=null;
    }

    cont.innerHTML = pvVistaHTML();
    cont.classList.remove('hidden');
    if (loader) loader.classList.add('hidden');

    // C2P-4B.3: los datos YA fueron releídos desde Supabase (F5 hecho);
    // si quedó una Carta Gantt pendiente de la última escritura, se
    // reabre automáticamente. La clave se consume aquí mismo.
    pvReabrirCartaPendiente();

    // C2P-5D: la biblioteca de documentos se carga en paralelo (SOLO
    // administrador permanente; sin permiso no hay consulta) sin retrasar
    // el bloque de Cartas Gantt. Cualquier fallo queda confinado a la
    // sección de Archivos con su estado de error y Reintentar.
    pvCargarDocumentos(true).catch((eDocs) => {
      console.error('Error inesperado cargando documentos de Prevencionista:', eDocs);
    });
  } catch (e) {
    console.error('Error cargando el módulo Prevencionista:', e);
    cont.innerHTML = pvErrorHTML();
    cont.classList.remove('hidden');
    if (loader) loader.classList.add('hidden');
  }
}

function pvErrorHTML() {
  return `
    <div class="max-w-3xl mx-auto bg-white dark:bg-slate-900 rounded-3xl p-10 border border-rose-200 dark:border-rose-900 text-center space-y-3">
      <span class="text-4xl block">⚠️</span>
      <h3 class="text-lg font-black text-slate-900 dark:text-white">Error al cargar Prevencionista</h3>
      <p class="text-sm text-slate-600 dark:text-slate-400">
        No fue posible obtener los planes desde Supabase. Verifica tu sesión y conexión, luego reintenta.
      </p>
      <button onclick="pvCargarVista()" class="mt-2 text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline">
        Reintentar
      </button>
    </div>
  `;
}

function pvVistaHTML() {
  const admin = pvEsAdmin();

  return `
    <div class="alm-ui alm-main-page alm-module-page alm-prevention space-y-5 pb-10">
    ${uiEncabezadoSeccion('Prevencionista','Planificación y documentación preventiva.','shield',admin ? '<button type="button" onclick="pvAbrirFormPlan(null)" class="alm-btn-primary px-4 py-2">+ Nueva Carta Gantt</button>' : '')}

    <div id="pv-cartas-listado">${pvCartasHTML()}</div>
    ${pvArchivosHTML()}
    </div>
  `;
}

function pvCartasHTML() {
  const admin = pvEsAdmin();
  const activos = pvPlanes
    .filter(p => p && p.activo !== false)
    .slice()
    .sort((a, b) => (pvOrden(a) - pvOrden(b))
      || String(pvValor(a.titulo) || '').localeCompare(String(pvValor(b.titulo) || ''), 'es'));
  const inactivos = pvPlanes.filter(p => p && p.activo === false);

  return `    <!-- BLOQUE: CARTAS GANTT -->
    <div class="mt-6">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 class="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Cartas Gantt</h3>
        <span class="text-[11px] font-bold text-slate-400 dark:text-slate-500">
          ${activos.length} ${activos.length === 1 ? 'carta activa' : 'cartas activas'}
        </span>
      </div>

      <div class="alm-record-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        ${activos.length ? activos.map(pvTarjetaPlanHTML).join('') : pvCartasVaciasHTML(admin)}
      </div>

      ${admin && inactivos.length ? `
        <div class="mt-4 bg-white dark:bg-slate-900 rounded-3xl p-4 border border-dashed border-slate-300 dark:border-slate-700">
          <p class="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Planificaciones inactivas</p>
          <div class="flex flex-wrap gap-2">
            ${inactivos.map(pvTarjetaPlanInactivoHTML).join('')}
          </div>
        </div>` : ''}
    </div>


`;
}

// Origen visual discreto: solo dos estados conocidos de BD.
function pvOrigenHTML(plan) {
  const origen = String((plan && plan.origen_registro) || '').toUpperCase();
  const creado = origen === 'CREADO_EN_SISTEMA';
  return `<span class="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border ${creado
    ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-900'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}">${creado ? 'Creado en sistema' : 'Importado'}</span>`;
}

function pvTarjetaPlanHTML(plan) {
  const p = plan || {};
  const admin = pvEsAdmin();
  const tareas = pvTareasReales(p.id);
  const titulo = pvValor(p.titulo) || 'Sin título registrado';
  const proyecto = pvValor(p.titulo_proyecto);
  const empresa = pvValor(p.empresa);
  const anio = pvValor(p.anio);
  const meta = [empresa, anio].filter(v => v !== null);

  return `
    <div class="alm-prevention-card bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-purple-400 dark:hover:border-purple-700 hover:shadow-lg transition-all flex flex-col justify-between">
      <div>
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center flex-wrap gap-2">
              <h4 class="text-sm font-black text-slate-900 dark:text-white">${pvEsc(titulo)}</h4>
              ${pvOrigenHTML(p)}
            </div>
            ${proyecto ? `<p class="text-xs font-bold text-slate-600 dark:text-slate-300 mt-1.5">${pvEsc(proyecto)}</p>` : ''}
            ${meta.length ? `<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">${meta.map(pvEsc).join(' · ')}</p>` : ''}
          </div>
          <span class="shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-900">
            ${tareas.length} ${tareas.length === 1 ? 'tarea' : 'tareas'}
          </span>
        </div>
        <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-2">Tareas reales definidas en este plan.</p>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <button onclick="pvAbrirCartaGantt('${pvEsc(p.id)}')"
          class="px-3.5 py-2 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900 rounded-xl text-xs font-black hover:bg-purple-100 dark:hover:bg-purple-950 transition-colors">
          Ver Carta Gantt
        </button>
        ${admin ? `
          <div class="flex items-center gap-2">
            <button onclick="pvAbrirFormPlan('${pvEsc(p.id)}')"
              class="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-[11px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              Editar
            </button>
            <button onclick="pvAlternarPlan('${pvEsc(p.id)}')"
              class="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl text-[11px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              Desactivar
            </button>
          </div>` : ''}
      </div>
    </div>
  `;
}

// Los planes inactivos NO se listan como cartas vigentes; solo el
// administrador los ve aquí para poder reactivarlos (si no, al
// desactivar quedarían inaccesibles desde la UI).
function pvTarjetaPlanInactivoHTML(plan) {
  const p = plan || {};
  const titulo = pvValor(p.titulo) || 'Sin título registrado';
  return `
    <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 opacity-80">
      <span class="text-xs font-bold text-slate-500 dark:text-slate-400">${pvEsc(titulo)}</span>
      <span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">Inactiva</span>
      <button onclick="pvAlternarPlan('${pvEsc(p.id)}')"
        class="text-[11px] font-black text-purple-600 dark:text-purple-400 hover:underline">Activar</button>
    </div>
  `;
}

function pvCartasVaciasHTML(admin) {
  return `
    <div class="col-span-full bg-white dark:bg-slate-900 rounded-3xl p-10 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
      <span class="text-3xl block">🗓️</span>
      <p class="text-sm font-black text-slate-700 dark:text-slate-200">Sin Cartas Gantt activas</p>
      <p class="text-xs text-slate-500 dark:text-slate-400">
        ${admin ? 'Usa "+ Nueva Carta Gantt" para crear el primer plan preventivo.' : 'Aún no hay planes preventivos publicados.'}
      </p>
    </div>
  `;
}

// ------------------------------------------------------------
// C2P-5D — ARCHIVOS PREVENCIONISTA (biblioteca real de documentos)
// ------------------------------------------------------------
// Fuente única: window.PrevencionDocumentosService (bucket privado
// documentos-prevencionista + public.prevencion_documentos). Patrón de UI
// documentado desde js/views/trabajadores.js (sección de documentos).
//
// SEGURIDAD VISUAL: el backend sólo permite SELECT/INSERT/DELETE a
// es_administrador_permanente_actual(). Por eso:
//   - sin permiso NO se consulta el service, NO hay lista, NO hay
//     botones Ver/Descargar/Eliminar ni + Subir archivo, y la tarjeta
//     sólo muestra un estado neutro;
//   - con permiso, cada acción vuelve a validar pvEsAdmin() antes de
//     tocar el service (defensa en profundidad; RLS es la autoridad).
//
// SIN F5: documentos NO son escrituras de Carta Gantt. Después de subir
// o eliminar se relee SOLO esta sección con listarDocumentos(true).
// SIN joins: el título de la Carta Gantt se resuelve con los planes ya
// cargados (pvPlanes); plan_id = NULL se muestra como "Documento general".
// SIN campos inventados: sólo lo que existe en la tabla (nombre, tipo,
// tamaño, fecha, relación).
// ------------------------------------------------------------

// Estado local de la sección (sólo lectura en cliente).
let pvDocumentos = [];         // últimas filas reales de listarDocumentos()
let pvDocsEstado = 'inicial';  // 'inicial' | 'cargando' | 'listo' | 'error'
let pvDocFiltro = 'todos';     // 'todos' | 'generales' | 'plan'
let pvDocFiltroPlanId = null;  // plan_id activo del filtro 'plan'
let pvSubirDoc = null;         // estado de la modal de subida (null = cerrada)
// C2P-5D.1 — confirmación visual de eliminación (modal propia; SIN
// diálogo nativo del navegador). pvEliminarDoc conserva el documento
// EXACTO pendiente
// de decisión; pvEliminarOcupado evita doble clic mientras hay una
// eliminación en vuelo.
let pvEliminarDoc = null;
let pvEliminarOcupado = false;

function pvSubirVisible() {
  const overlay = document.getElementById('pv-archivos-modal-subir');
  return !!(overlay && !overlay.classList.contains('hidden'));
}

// Tipo legible a partir del mime_type REAL. Tipos fuera de la allowlist
// del bucket se muestran neutros ("Archivo"): no se inventan categorías.
function pvTipoDocLegible(mimeType) {
  const mime = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
  if (mime === 'application/pdf') return 'PDF';
  if (mime === 'image/jpeg') return 'JPG';
  if (mime === 'image/png') return 'PNG';
  if (mime === 'image/webp') return 'WEBP';
  return 'Archivo';
}

// Tamaño legible desde tamano_bytes REAL. Sin inventar: si el valor no
// es numérico se indica que no está disponible. NUNCA altera el original.
function pvTamanoLegible(bytes) {
  const valor = Number(bytes);
  if (!isFinite(valor) || valor < 0) return 'Tamaño no disponible';
  if (valor < 1024) return `${valor} B`;
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;
  return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
}

// Fecha de subida dd-mm-aaaa desde created_at. null si no se puede
// interpretar (no se inventa fecha).
function pvFechaSubida(valor) {
  return formatearFechaCL(valor,{vacio:null});
}

function pvDocPorId(docId) {
  if (!docId) return null;
  return (Array.isArray(pvDocumentos) ? pvDocumentos : []).find(d => d && d.id === docId) || null;
}

// Relación del documento. plan_id NULL → "Documento general"; UUID
// resuelto en pvPlanes → título real (+ chip "Inactiva" si el plan se
// desactivó); UUID no resoluble → neutro "Carta Gantt asociada" (sin
// inventar título y sin exponer UUID).
function pvDocRelacionHTML(doc) {
  const chipBase = 'inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border';

  if (!doc || doc.plan_id === null || doc.plan_id === undefined || doc.plan_id === '') {
    return `<span class="${chipBase} bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700">Documento general</span>`;
  }

  const plan = pvPlanPorId(doc.plan_id);
  if (!plan) {
    return `<span class="${chipBase} bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700">Carta Gantt asociada</span>`;
  }

  const titulo = pvValor(plan.titulo) || 'Carta Gantt asociada';
  const inactiva = plan.activo === false
    ? ` <span class="${chipBase} bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900">Inactiva</span>`
    : '';
  return `<span class="${chipBase} bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-900">${pvEsc(titulo)}</span>${inactiva}`;
}

// Filtro EN MEMORIA sobre pvDocumentos. NO consulta Supabase al cambiar.
function pvDocsFiltrados() {
  const docs = Array.isArray(pvDocumentos) ? pvDocumentos : [];
  if (pvDocFiltro === 'generales') return docs.filter(d => !d || d.plan_id === null || d.plan_id === undefined || d.plan_id === '');
  if (pvDocFiltro === 'plan') return docs.filter(d => d && pvValor(d.plan_id) === pvValor(pvDocFiltroPlanId));
  return docs;
}

// Consistencia del filtro: si el filtro 'Carta Gantt' apunta a un plan
// que ya no tiene documentos, se vuelve a "Todos" (sin perder generales).
function pvNormalizarFiltroArchivos() {
  if (pvDocFiltro !== 'plan') return;
  const existe = (Array.isArray(pvDocumentos) ? pvDocumentos : [])
    .some(d => d && pvValor(d.plan_id) === pvValor(pvDocFiltroPlanId));
  if (!pvDocFiltroPlanId || !existe) {
    pvDocFiltro = 'todos';
    pvDocFiltroPlanId = null;
  }
}

// Planes que REALMENTE tienen documentos (para el selector de filtro).
function pvPlanesConDocumentos() {
  const ids = [];
  (Array.isArray(pvDocumentos) ? pvDocumentos : []).forEach(d => {
    const id = d && pvValor(d.plan_id);
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids.map(id => pvPlanPorId(id)).filter(p => !!p);
}

// Etiqueta de plan para selects: título real; si dos títulos se repiten
// se agrega información REAL disponible (empresa / año) para distinguirlos.
function pvEtiquetaPlanLista(lista) {
  const conteo = {};
  (Array.isArray(lista) ? lista : []).forEach(p => {
    const t = pvValor(p && p.titulo) || 'Sin título registrado';
    conteo[t] = (conteo[t] || 0) + 1;
  });
  return (Array.isArray(lista) ? lista : []).map(p => {
    const t = pvValor(p && p.titulo) || 'Sin título registrado';
    if (conteo[t] > 1) {
      const extra = [pvValor(p.empresa), pvValor(p.anio)].filter(v => v !== null);
      if (extra.length) return `${t} · ${extra.join(' · ')}`;
    }
    return t;
  });
}

// Planes ACTIVOS: únicos admitidos para asociar documentos NUEVOS
// (decisión de backend C2P-5B). Una Carta desactivada NO aparece aquí,
// aunque sus documentos históricos sigan en la lista.
function pvPlanesActivosSubida() {
  return (Array.isArray(pvPlanes) ? pvPlanes : []).filter(p => p && p.activo !== false);
}

// Carga real de documentos. SOLO administrador permanente: sin permiso
// jamás se llama al service (ni se dispara una consulta RLS fallida).
async function pvCargarDocumentos(force = true) {
  if (!pvEsAdmin()) return;

  if (!window.PrevencionDocumentosService) {
    pvDocsEstado = 'error';
    pvRefrescarArchivos();
    return;
  }

  pvDocsEstado = 'cargando';
  pvRefrescarArchivos();

  try {
    const documentos = await window.PrevencionDocumentosService.listarDocumentos(force);
    pvDocumentos = Array.isArray(documentos) ? documentos : [];
    pvDocsEstado = 'listo';
  } catch (e) {
    // Error real (conexión/permisos): se muestra y se propaga a consola.
    // NUNCA fallback a mocks ni a localStorage.
    console.error('Error cargando documentos de Prevencionista desde Supabase:', e);
    pvDocumentos = [];
    pvDocsEstado = 'error';
  }

  pvRefrescarArchivos();
}

// Re-renderiza SOLO la sección de Archivos (tras subir/eliminar/cambiar
// filtro), sin recargar la página ni tocar el bloque de Cartas Gantt.
function pvRefrescarArchivos() {
  const cont = document.getElementById('pv-archivos-bloque');
  if (!cont) return;
  cont.innerHTML = pvArchivosContenidoHTML();
}

function pvArchivosHTML() {
  return `<div id="pv-archivos-bloque" class="mt-6">${pvArchivosContenidoHTML()}</div>`;
}

function pvArchivosContenidoHTML() {
  const admin = pvEsAdmin();

  const tarjeta = (borde, cuerpo) => `
    <div class="alm-panel bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border ${borde} shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center space-x-3">
          <div class="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl">📁</div>
          <div>
            <h3 class="text-[11px] font-black uppercase tracking-wider text-slate-900 dark:text-white">ARCHIVOS PREVENCIONISTA</h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Documentos generales y archivos asociados a Cartas Gantt.</p>
          </div>
        </div>
        ${admin ? `
          <button type="button" onclick="pvAbrirSubirDocumento()"
            class="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition-colors shadow-sm whitespace-nowrap">
            + Subir archivo
          </button>` : ''}
      </div>
      ${cuerpo}
    </div>`;

  // SIN permiso: estado neutro corto. Ni lista, ni datos, ni acciones.
  if (!admin) {
    return tarjeta('border-dashed border-slate-300 dark:border-slate-700', `
      <p class="mt-4 text-xs text-slate-500 dark:text-slate-400">Gestión de documentos disponible para administrador.</p>`);
  }

  pvNormalizarFiltroArchivos();

  const total = (Array.isArray(pvDocumentos) ? pvDocumentos : []).length;
  const filtrados = pvDocsFiltrados();
  const planesConDocs = pvPlanesConDocumentos();
  const etiquetas = pvEtiquetaPlanLista(planesConDocs);

  const chipFiltro = (clave, etiqueta) => {
    const activo = pvDocFiltro === clave;
    return `<button type="button" onclick="pvDocFiltroCambiar('${clave}')"
      class="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors border ${activo
        ? 'bg-purple-600 border-purple-600 text-white'
        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'}">${etiqueta}</button>`;
  };

  const filtros = `
    <div class="mt-4 flex flex-wrap items-center gap-2">
      ${chipFiltro('todos', 'Todos')}
      ${chipFiltro('generales', 'Generales')}
      ${planesConDocs.length ? `
        <select id="pv-doc-filtro-plan" onchange="pvDocFiltroPlanCambiar(this.value)"
          class="px-3 py-1.5 rounded-xl text-[11px] font-bold border bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
          <option value="">Por Carta Gantt…</option>
          ${planesConDocs.map((p, i) => `
            <option value="${pvEsc(p.id)}"${pvValor(p.id) === pvValor(pvDocFiltroPlanId) ? ' selected' : ''}>${pvEsc(etiquetas[i])}</option>`).join('')}
        </select>` : ''}
      <span class="ml-auto text-[11px] font-bold text-slate-400 dark:text-slate-500">
        ${total} ${total === 1 ? 'documento' : 'documentos'}
      </span>
    </div>`;

  let listaHTML = '';
  if (pvDocsEstado === 'cargando' || pvDocsEstado === 'inicial') {
    listaHTML = `<p class="mt-4 text-[11px] text-slate-500 dark:text-slate-400 text-center py-4">Cargando documentos...</p>`;
  } else if (pvDocsEstado === 'error') {
    listaHTML = `
      <div class="mt-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-3 text-center">
        <p class="text-[11px] font-bold text-rose-700 dark:text-rose-300">Error al cargar los documentos</p>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Revisa la conexión con Supabase o los permisos de tu sesión.</p>
        <button type="button" onclick="pvCargarDocumentos(true)"
          class="mt-2 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70 transition-colors">
          Reintentar
        </button>
      </div>`;
  } else if (total === 0) {
    listaHTML = `
      <div class="mt-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-5 text-center">
        <p class="text-[11px] text-slate-500 dark:text-slate-400">No hay documentos registrados en Prevencionista.</p>
      </div>`;
  } else if (filtrados.length === 0) {
    listaHTML = `
      <div class="mt-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-5 text-center">
        <p class="text-[11px] text-slate-500 dark:text-slate-400">No hay documentos para este filtro.</p>
      </div>`;
  } else {
    listaHTML = `<div class="mt-4 space-y-2">${filtrados.map(pvDocumentoFilaHTML).join('')}</div>`;
  }

  return tarjeta('border-slate-200 dark:border-slate-800', filtros + listaHTML);
}

// Fila del documento: nombre, relación, tipo/tamaño/fecha reales y
// acciones. NUNCA se muestra storage_path ni el id en el texto.
function pvDocumentoFilaHTML(doc) {
  const docId = pvEsc(doc && doc.id ? doc.id : '');
  const nombre = pvEsc(pvValor(doc && doc.nombre_original) || 'Documento sin nombre');
  const tipo = pvEsc(pvTipoDocLegible(doc && doc.mime_type));
  const tamano = pvEsc(pvTamanoLegible(doc && doc.tamano_bytes));
  const fecha = pvEsc(pvFechaSubida(doc && doc.created_at) || 'Fecha no disponible');

  return `
    <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
      <div class="min-w-0">
        <p class="text-xs font-bold text-slate-800 dark:text-slate-100 break-all leading-snug">📄 ${nombre}</p>
        <div class="mt-1">${pvDocRelacionHTML(doc)}</div>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">${tipo} · ${tamano} · Subido el ${fecha}</p>
      </div>
      <div class="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
        <button type="button" onclick="pvVerDocumento('${docId}')"
          class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors">
          Ver
        </button>
        <button type="button" onclick="pvDescargarDocumento('${docId}')"
          class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors">
          Descargar
        </button>
        <button type="button" onclick="pvEliminarDocumento('${docId}')"
          class="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70 transition-colors">
          Eliminar
        </button>
      </div>
    </div>`;
}

// Cambios de filtro: 100% en memoria, sin consultas a Supabase.
function pvDocFiltroCambiar(filtro) {
  pvDocFiltro = (filtro === 'generales' || filtro === 'plan') ? filtro : 'todos';
  if (pvDocFiltro !== 'plan') pvDocFiltroPlanId = null;
  pvRefrescarArchivos();
}

function pvDocFiltroPlanCambiar(valor) {
  const id = typeof valor === 'string' ? valor.trim() : '';
  if (!id) {
    pvDocFiltro = 'todos';
    pvDocFiltroPlanId = null;
  } else {
    pvDocFiltro = 'plan';
    pvDocFiltroPlanId = id;
  }
  pvRefrescarArchivos();
}

// ------------------------------------------------------------
// MODAL "+ SUBIR ARCHIVO" (mismos tokens de las modales del módulo)
// ------------------------------------------------------------
function pvAsegurarModalSubir() {
  let overlay = document.getElementById('pv-archivos-modal-subir');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pv-archivos-modal-subir';
    overlay.className = 'alm-ui alm-personnel-dialog hidden fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[80] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto cursor-pointer';
    overlay.innerHTML = `
      <div onclick="event.stopPropagation()"
        class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full p-5 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto custom-scrollbar cursor-default my-auto text-slate-800 dark:text-slate-100">
        <div id="pv-subir-content"></div>
      </div>`;
    overlay.addEventListener('click', (ev) => {
      // UX-02: el fondo conserva esta ventana.
    });
    document.body.appendChild(overlay);
  }
  return overlay;
}

function pvAbrirSubirDocumento() {
  if (!pvEsAdmin()) return; // defensa UX; RLS es la autoridad
  if (!window.PrevencionDocumentosService) {
    pvToastError('El servicio de documentos no está disponible.');
    return;
  }

  // Por defecto: Documento general (selector de Carta oculto).
  pvSubirDoc = { modo: 'general', archivo: null, error: null, enviando: false };

  const overlay = pvAsegurarModalSubir();
  const cont = document.getElementById('pv-subir-content');
  if (!cont || !overlay) return;

  const planesActivos = pvPlanesActivosSubida();
  const etiquetasActivas = pvEtiquetaPlanLista(planesActivos);

  cont.innerHTML = `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div>
        <span class="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">Prevencionista · documentos</span>
        <h3 class="text-base font-extrabold text-slate-900 dark:text-white mt-1">Subir archivo</h3>
      </div>
      <button onclick="pvCerrarSubirDocumento()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl font-bold p-1">&times;</button>
    </div>

    <div id="pv-subir-error" class="hidden mt-3 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs font-bold text-rose-700 dark:text-rose-300"></div>

    <div class="mt-4 space-y-4">
      <div>
        <label for="pv-subir-archivo" class="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Archivo *</label>
        <input type="file" id="pv-subir-archivo" onchange="pvSubirArchivoCambio()"
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
          class="mt-1.5 block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-[11px] file:font-bold file:bg-purple-50 dark:file:bg-purple-950/60 file:text-purple-700 dark:file:text-purple-300 hover:file:bg-purple-100 dark:hover:file:bg-purple-950 cursor-pointer">
        <p class="mt-1 text-[10px] text-slate-400 dark:text-slate-500">PDF, JPG, PNG o WEBP · máximo 10 MB</p>
        <p id="pv-subir-archivo-nombre" class="mt-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 break-all"></p>
      </div>

      <div>
        <span class="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Relación del documento *</span>
        <div class="mt-1.5 space-y-1.5">
          <label class="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
            <input type="radio" name="pv-subir-modo" value="general" checked onchange="pvSubirCambiarModo('general')">
            Documento general
          </label>
          <label class="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
            <input type="radio" name="pv-subir-modo" value="plan" onchange="pvSubirCambiarModo('plan')">
            Asociar a una Carta Gantt
          </label>
        </div>

        <div id="pv-subir-plan-bloque" class="hidden mt-3">
          <label for="pv-subir-plan" class="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Carta Gantt *</label>
          ${planesActivos.length ? `
            <select id="pv-subir-plan" class="mt-1.5 block w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-bold text-slate-700 dark:text-slate-200">
              <option value="">Selecciona una Carta Gantt…</option>
              ${planesActivos.map((p, i) => `<option value="${pvEsc(p.id)}">${pvEsc(etiquetasActivas[i])}</option>`).join('')}
            </select>`
            : `<p class="mt-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">No hay Cartas Gantt activas disponibles.</p>`}
        </div>
      </div>
    </div>

    <div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2">
      <button onclick="pvCerrarSubirDocumento()" id="pv-subir-cancelar"
        class="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
        Cancelar
      </button>
      <button onclick="pvEnviarSubida()" id="pv-subir-guardar"
        class="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition-colors">
        Guardar
      </button>
    </div>`;

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

// Cambia General / Asociar. NO se re-renderiza la modal: se preserva la
// selección de archivo ya elegida por la persona usuaria.
function pvSubirCambiarModo(modo) {
  if (!pvSubirDoc || pvSubirDoc.enviando) return;
  pvSubirDoc.modo = (modo === 'plan') ? 'plan' : 'general';
  const bloque = document.getElementById('pv-subir-plan-bloque');
  if (bloque) bloque.classList.toggle('hidden', pvSubirDoc.modo !== 'plan');
  pvSubirActualizarGuardar();
}

// Guardar queda deshabilitado sólo en un caso real: modo "Asociar" sin
// Cartas Gantt activas disponibles (el usuario puede volver a General).
function pvSubirActualizarGuardar() {
  const btn = document.getElementById('pv-subir-guardar');
  if (!btn) return;
  const sinPlanes = !!(pvSubirDoc && pvSubirDoc.modo === 'plan' && pvPlanesActivosSubida().length === 0);
  btn.disabled = sinPlanes;
  btn.classList.toggle('opacity-60', sinPlanes);
  btn.classList.toggle('cursor-not-allowed', sinPlanes);
}

function pvSubirArchivoCambio() {
  if (!pvSubirDoc) return;
  const input = document.getElementById('pv-subir-archivo');
  pvSubirDoc.archivo = (input && input.files && input.files.length > 0) ? input.files[0] : null;
  const nombre = document.getElementById('pv-subir-archivo-nombre');
  if (nombre) nombre.textContent = pvSubirDoc.archivo ? String(pvSubirDoc.archivo.name || '') : '';
  pvSubirError(null);
}

function pvSubirError(mensaje) {
  const el = document.getElementById('pv-subir-error');
  if (!el) return;
  if (!mensaje) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }
  el.textContent = mensaje;
  el.classList.remove('hidden');
}

function pvSubirOcupado(ocupado) {
  if (!pvSubirDoc) return;
  pvSubirDoc.enviando = !!ocupado;
  const btn = document.getElementById('pv-subir-guardar');
  if (btn) {
    btn.disabled = !!ocupado;
    btn.classList.toggle('opacity-60', !!ocupado);
    btn.classList.toggle('cursor-not-allowed', !!ocupado);
    btn.textContent = ocupado ? 'Subiendo...' : 'Guardar';
  }
}

function pvCerrarSubirDocumento() {
  if (pvSubirDoc && pvSubirDoc.enviando) return; // con una subida en vuelo NO se pierde
  const overlay = document.getElementById('pv-archivos-modal-subir');
  if (overlay) overlay.classList.add('hidden');
  pvSubirDoc = null;
  if (!pvGanttVisible() && !pvFormVisible() && !pvAdminVisible()) document.body.style.overflow = '';
}

// ENVÍO: el service es la autoridad client-side para tamaño/MIME; la
// vista sólo valida lo mínimo de UX (archivo elegido y carta elegida si
// corresponde). SIN F5: se relee SOLO la sección de Archivos.
async function pvEnviarSubida() {
  if (!pvSubirDoc || pvSubirDoc.enviando) return;
  if (!pvEsAdmin()) { pvCerrarSubirDocumento(); return; }
  if (!window.PrevencionDocumentosService) {
    pvSubirError('El servicio de documentos no está disponible.');
    return;
  }

  const archivo = pvSubirDoc.archivo;
  if (!archivo) {
    pvSubirError('Debes seleccionar un archivo.');
    return;
  }

  let planId = null;
  if (pvSubirDoc.modo === 'plan') {
    const sel = document.getElementById('pv-subir-plan');
    const valor = sel && typeof sel.value === 'string' ? sel.value.trim() : '';
    if (!valor) {
      pvSubirError('Selecciona una Carta Gantt o elige "Documento general".');
      return;
    }
    planId = valor;
  }

  pvSubirError(null);
  pvSubirOcupado(true);

  try {
    await window.PrevencionDocumentosService.subirDocumento({ archivo, planId });
  } catch (e) {
    // La modal PERMANECE abierta con la selección conservada y el
    // error real visible (nunca "[object Object]").
    console.error('Error subiendo documento en Prevencionista:', e);
    pvSubirOcupado(false);
    pvSubirError(pvMensajeDocError(e));
    return;
  }

  // Éxito real (Supabase confirmó): se cierra la modal, se limpia el
  // formulario y se relee la biblioteca. SIN recarga de página.
  pvSubirOcupado(false);
  pvCerrarSubirDocumento();
  pvToastExito('✅ Documento subido correctamente.');
  await pvCargarDocumentos(true);
}

// ------------------------------------------------------------
// VER / DESCARGAR / ELIMINAR (solo administrador permanente)
// La UI trabaja por docId contra el estado local; el service resuelve
// todo con los datos reales de la tabla. Nunca getPublicUrl().
// ------------------------------------------------------------
async function pvVerDocumento(docId) {
  if (!pvEsAdmin() || !window.PrevencionDocumentosService) return;
  const doc = pvDocPorId(docId);
  if (!doc) {
    pvToastError('El documento ya no está disponible. Actualiza la lista.');
    return;
  }

  // Pestaña abierta de forma SÍNCRONA (gesto del usuario) para que el
  // navegador no la bloquee como emergente.
  const ventana = window.open('about:blank', '_blank');
  if (!ventana) {
    pvToastError('El navegador bloqueó la ventana emergente. Permítela para ver el documento.');
    return;
  }
  try { ventana.opener = null; } catch (eOpener) { /* sin opener */ }

  try {
    const enlace = await window.PrevencionDocumentosService.crearUrlFirmada(doc);
    if (ventana.closed) return;
    ventana.location.href = enlace.url; // signed URL de 60 segundos, no persistida
  } catch (e) {
    if (!ventana.closed) ventana.close();
    console.error('Error abriendo documento en Prevencionista:', e);
    pvToastError('⚠️ ' + pvMensajeDocError(e));
  }
}

async function pvDescargarDocumento(docId) {
  if (!pvEsAdmin() || !window.PrevencionDocumentosService) return;
  const doc = pvDocPorId(docId);
  if (!doc) {
    pvToastError('El documento ya no está disponible. Actualiza la lista.');
    return;
  }

  try {
    const enlace = await window.PrevencionDocumentosService.crearUrlFirmada(doc, { descargar: true });
    const ancla = document.createElement('a');
    ancla.href = enlace.url;
    ancla.target = '_blank';
    ancla.rel = 'noopener';
    if (enlace.nombreOriginal) ancla.download = enlace.nombreOriginal;
    document.body.appendChild(ancla);
    ancla.click();
    document.body.removeChild(ancla);
  } catch (e) {
    console.error('Error descargando documento en Prevencionista:', e);
    pvToastError('⚠️ ' + pvMensajeDocError(e));
  }
}

// C2P-5D.1 — ELIMINAR CON MODAL PROPIA (sin diálogo nativo del
// navegador).
// Al presionar [Eliminar] de una tarjeta NO se borra nada: se abre una
// modal visual centrada (mismo lenguaje que las demás modales del
// módulo), se guarda el documento EXACTO en estado y se espera la
// decisión. Cancelar, X y Escape cierran con 0 llamadas al service.
// La eliminación definitiva usa SIEMPRE el documento guardado en estado
// (nunca atributos del DOM) y el documento sólo desaparece de la lista
// cuando el backend confirma y se relee Supabase.
function pvEliminarVisible() {
  const overlay = document.getElementById('pv-archivos-modal-eliminar');
  return !!(overlay && !overlay.classList.contains('hidden'));
}

function pvEliminarError(mensaje) {
  const el = document.getElementById('pv-eliminar-error');
  if (!el) return;
  if (!mensaje) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }
  el.textContent = mensaje;
  el.classList.remove('hidden');
}

// Estado "en vuelo": deshabilita ambos botones y cambia el texto del
// botón destructivo a "Eliminando...". Mientras dure, la modal NO se
// puede cerrar (ni con Escape ni con X) para no perder el resultado.
function pvEliminarOcupar(ocupado) {
  pvEliminarOcupado = !!ocupado;
  const btnConfirmar = document.getElementById('pv-eliminar-confirmar');
  const btnCancelar = document.getElementById('pv-eliminar-cancelar');
  if (btnConfirmar) {
    btnConfirmar.disabled = !!ocupado;
    btnConfirmar.classList.toggle('opacity-60', !!ocupado);
    btnConfirmar.classList.toggle('cursor-not-allowed', !!ocupado);
    btnConfirmar.textContent = ocupado ? 'Eliminando...' : 'Eliminar documento';
  }
  if (btnCancelar) {
    btnCancelar.disabled = !!ocupado;
    btnCancelar.classList.toggle('opacity-60', !!ocupado);
    btnCancelar.classList.toggle('cursor-not-allowed', !!ocupado);
  }
}

function pvCerrarConfirmarEliminacion() {
  if (pvEliminarOcupado) return; // con una eliminación en vuelo NO se cierra
  const overlay = document.getElementById('pv-archivos-modal-eliminar');
  if (overlay) overlay.classList.add('hidden');
  pvEliminarDoc = null;
  pvEliminarError(null);
  if (!pvGanttVisible() && !pvFormVisible() && !pvAdminVisible() && !pvSubirVisible()) {
    document.body.style.overflow = '';
  }
}

function pvAsegurarModalEliminar() {
  let overlay = document.getElementById('pv-archivos-modal-eliminar');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pv-archivos-modal-eliminar';
    overlay.className = 'hidden fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[80] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto cursor-pointer';
    overlay.innerHTML = `
      <div role="dialog" aria-modal="true" aria-label="Eliminar documento" onclick="event.stopPropagation()"
        class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-5 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto custom-scrollbar cursor-default my-auto text-slate-800 dark:text-slate-100">
        <div id="pv-eliminar-content"></div>
      </div>`;
    overlay.addEventListener('click', (ev) => {
      // UX-02: el fondo conserva esta ventana.
    });
    document.body.appendChild(overlay);
  }
  return overlay;
}

// Abre la modal de confirmación. Sólo administrador permanente.
function pvEliminarDocumento(docId) {
  if (!pvEsAdmin() || !window.PrevencionDocumentosService) return; // defensa UX; RLS es la autoridad
  const doc = pvDocPorId(docId);
  if (!doc) {
    pvToastError('El documento ya no está disponible. Actualiza la lista.');
    return;
  }

  const overlay = pvAsegurarModalEliminar();
  const cont = document.getElementById('pv-eliminar-content');
  if (!cont || !overlay) return;

  // El nombre SIEMPRE escapado; sin UUID visible ni storage_path.
  const nombre = pvEsc(pvValor(doc.nombre_original) || 'Documento sin nombre');

  pvEliminarDoc = doc; // documento EXACTO pendiente de decisión
  pvEliminarOcupar(false);
  pvEliminarError(null);

  cont.innerHTML = `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div>
        <span class="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">Prevencionista · documentos</span>
        <h3 class="text-base font-extrabold text-slate-900 dark:text-white mt-1">Eliminar documento</h3>
      </div>
      <button type="button" onclick="pvCerrarConfirmarEliminacion()" aria-label="Cerrar"
        class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl font-bold p-1">&times;</button>
    </div>

    <div id="pv-eliminar-error" class="hidden mt-3 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs font-bold text-rose-700 dark:text-rose-300"></div>

    <div class="mt-4 space-y-2">
      <p class="text-sm font-bold text-slate-800 dark:text-slate-100 break-all">📄 ${nombre}</p>
      <p class="text-xs text-slate-600 dark:text-slate-300">¿Estás seguro de que deseas eliminar este archivo de Prevencionista?</p>
      <p class="text-[11px] font-black text-rose-600 dark:text-rose-400">Esta acción no se puede deshacer.</p>
    </div>

    <div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2">
      <button type="button" onclick="pvCerrarConfirmarEliminacion()" id="pv-eliminar-cancelar"
        class="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
        Cancelar
      </button>
      <button type="button" onclick="pvConfirmarEliminarDocumento()" id="pv-eliminar-confirmar"
        class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-colors">
        Eliminar documento
      </button>
    </div>`;

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

// Confirmación definitiva: usa EXACTAMENTE el documento guardado en
// estado. Anti doble clic (pvEliminarOcupado) y botones inhabilitados
// con texto "Eliminando..." durante el vuelo.
async function pvConfirmarEliminarDocumento() {
  if (!pvEsAdmin() || !window.PrevencionDocumentosService) {
    pvCerrarConfirmarEliminacion();
    return;
  }
  const doc = pvEliminarDoc;
  if (!doc || pvEliminarOcupado) return; // sin pendiente o ya en vuelo

  pvEliminarError(null);
  pvEliminarOcupar(true);

  try {
    await window.PrevencionDocumentosService.eliminarDocumento(doc);
  } catch (e) {
    // ERROR: el documento SIGUE visible, la modal permanece abierta con
    // el banner de error para cancelar o reintentar. Sin refresh falso.
    console.error('Error eliminando documento en Prevencionista:', e);
    pvEliminarOcupar(false);
    pvEliminarError(pvMensajeDocError(e));
    return;
  }

  // ÉXITO real (backend confirmó): se cierra la modal, se limpia el
  // estado, toast y se relee SOLO la sección de Archivos. SIN F5.
  pvEliminarOcupar(false);
  pvCerrarConfirmarEliminacion();
  pvToastExito('✅ Documento eliminado correctamente.');
  await pvCargarDocumentos(true);
}

// Traducción de errores a mensajes amigables. NUNCA se muestran SQL,
// policies, paths, UUID internos ni "[object Object]". mensajeUsuario
// sólo lo define el service con mensajes propios ya seguros.
function pvMensajeDocError(e) {
  if (e && typeof e.mensajeUsuario === 'string' && e.mensajeUsuario.trim() !== '') {
    return e.mensajeUsuario;
  }

  const codigo = e && e.code ? String(e.code) : '';
  const texto = (e && typeof e.message === 'string') ? e.message : '';

  if (codigo === '42501' || /row-level security|permission denied|not authorized|forbidden|status code: 403|status code: 401/i.test(texto)) {
    return 'No tienes permisos para gestionar documentos de Prevencionista. Contacta al administrador.';
  }
  if (codigo === 'PGRST116' || /no rows returned|not found|does not exist/i.test(texto)) {
    return 'El documento ya no está disponible. Actualiza la lista.';
  }
  if (/Failed to fetch|NetworkError|network/i.test(texto)) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión.';
  }
  if (texto.trim()) return texto;
  return 'La operación con documentos no se pudo completar. Intenta nuevamente.';
}

// Avisos breves (toast), mismo patrón del proyecto. Sólo se usan con
// mensajes ya traducidos: jamás se imprime el error crudo ni una signed URL.
function pvToast(id, texto, clases, duracion = 4000) {
  let toast = document.getElementById(id);
  if (!toast) {
    toast = document.createElement('div');
    toast.id = id;
    toast.className = `fixed bottom-6 right-6 z-[100] px-4 py-3 rounded-2xl shadow-2xl text-xs font-bold text-white transition-all ${clases}`;
    document.body.appendChild(toast);
  }
  toast.textContent = texto;
  toast.classList.remove('hidden');
  setTimeout(() => { toast.classList.add('hidden'); }, duracion);
}

function pvToastExito(texto, duracion = 4000) {
  pvToast('pv-toast-exito', texto, 'bg-emerald-600', duracion);
}

function pvToastError(texto) {
  pvToast('pv-toast-error', texto, 'bg-rose-600');
}

// ------------------------------------------------------------
// MODAL DE LA CARTA GANTT (mismo formato estándar de GanttCarta)
// ------------------------------------------------------------
function pvAsegurarModalGantt() {
  let overlay = document.getElementById('pv-modal-carta-gantt');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pv-modal-carta-gantt';
    // Mismos tokens que la modal estándar del proyecto (z-[70], backdrop,
    // scroll y caja), ya en la variante ANCHA propia de la Carta Gantt.
    overlay.className = 'hidden fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[70] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto cursor-pointer';
    overlay.innerHTML = `
      <div id="pv-carta-gantt-content" onclick="event.stopPropagation()"
        class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-[95vw] xl:max-w-[1560px] p-4 sm:p-6 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto custom-scrollbar cursor-default my-auto text-slate-800 dark:text-slate-100">
      </div>`;
    overlay.addEventListener('click', (ev) => {
      // UX-02: el fondo conserva esta ventana.
    });
    document.body.appendChild(overlay);
  }
  return overlay;
}

// C2P-4C — EDICIÓN DIRECTA DESDE EL GANTT (solo administrador permanente).
// El renderer GanttCarta NO se modifica: la edición se detecta por
// delegación de eventos sobre el contenedor de la modal. La columna
// izquierda (fija, ancho GanttCarta.ANCHO_INFO) dibuja sus filas en el
// MISMO orden del modelo `pvTareasReales(plan)`, por lo que el índice de
// la fila clickeada identifica la tarea. Si el componente cambia su
// estructura, simplemente no se detecta fila y NO ocurre nada.
function pvClickGanttEditarTarea(ev) {
  if (!pvEsAdmin()) return;
  const planId = pvPlanAbiertoId;
  if (!planId) return;

  const cont = document.getElementById('pv-carta-gantt-content');
  if (!cont) return;

  const anchoInfo = (window.GanttCarta && window.GanttCarta.ANCHO_INFO) || 260;
  const colInfo = cont.querySelector(`div[style*="width:${anchoInfo}px"]`);
  if (!colInfo) return; // timeline alternativa (sin fechas): sin edición inline

  let nodo = ev.target;
  let fila = null;
  while (nodo && nodo !== cont) {
    if (nodo.parentElement === colInfo && nodo !== colInfo.firstElementChild) {
      fila = nodo; // la cabecera (firstElementChild) NO edita nada
      break;
    }
    nodo = nodo.parentElement;
  }
  if (!fila) return;

  const filas = Array.prototype.slice.call(colInfo.children, 1);
  const indice = filas.indexOf(fila);
  if (indice < 0) return;

  const tareas = pvTareasReales(planId);
  const tarea = tareas[indice];
  if (!tarea) return;

  ev.preventDefault();
  ev.stopPropagation();
  pvAbrirFormTarea(tarea.plan_id, tarea.fase_id, tarea.id);
}

// Afordancia visual de la edición inline: SOLO CSS presentacional sobre
// el DOM del componente (no se altera ganttCarta.js). Se inyecta una vez,
// únicamente cuando el usuario es administrador.
function pvAsegurarEstilosGanttAdmin() {
  if (document.getElementById('pv-estilos-gantt-admin')) return;
  const anchoInfo = (window.GanttCarta && window.GanttCarta.ANCHO_INFO) || 260;
  const estilo = document.createElement('style');
  estilo.id = 'pv-estilos-gantt-admin';
  estilo.textContent = `
    #pv-carta-gantt-content div[style*="width:${anchoInfo}px"] > div:not(:first-child) { cursor: pointer; }
    #pv-carta-gantt-content div[style*="width:${anchoInfo}px"] > div:not(:first-child):hover { background: rgba(139, 92, 246, 0.07); }
  `;
  document.head.appendChild(estilo);
}

function pvAbrirCartaGantt(planId) {
  const plan = pvPlanPorId(planId);
  if (!plan) return;

  const overlay = pvAsegurarModalGantt();
  const cont = document.getElementById('pv-carta-gantt-content');
  if (!cont) return;

  const conservar=pvPlanAbiertoId===planId&&pvGanttVisible();
  const posiciones=window.GanttCarta?.capturarScroll?.(cont)||[];
  const vertical=cont.scrollTop;
  pvPlanAbiertoId = planId;
  cont.innerHTML = pvGanttHTML(plan);
  cont.scrollTop = conservar?vertical:0;
  if(conservar)window.GanttCarta?.restaurarScroll?.(cont,posiciones);
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Clic en una fila del Gantt → Editar tarea (solo administrador).
  if (pvEsAdmin()) {
    pvAsegurarEstilosGanttAdmin();
    cont.removeEventListener('click', pvClickGanttEditarTarea);
    cont.addEventListener('click', pvClickGanttEditarTarea);
  }

  document.removeEventListener('keydown', pvTeclaEscape, true);
  document.addEventListener('keydown', pvTeclaEscape, true);
  if(pvRelecturaPendiente&&!pvActualizando)pvMostrarActualizacion('Hay un guardado confirmado pendiente de actualizar.',true);
}

function pvCerrarCartaGantt() {
  // Un formulario o la modal administrativa está ENCIMA: no se cierra la
  // carta por debajo (se cierran primero esas capas).
  if (pvFormVisible() || pvAdminVisible()) return;

  const overlay = document.getElementById('pv-modal-carta-gantt');
  if (overlay) overlay.classList.add('hidden');
  pvPlanAbiertoId = null;
  pvTrasGuardarExterno = null;
  document.removeEventListener('keydown', pvTeclaEscape, true);
  document.body.style.overflow = '';
}

// Escape cierra en orden de profundidad: confirmar eliminación (z-80) >
// subida de archivo (z-80) > formulario (z-80) > administración (z-75) >
// Carta Gantt (z-70). Escape sobre la confirmación cierra SIN eliminar
// (0 llamadas al service).
function pvTeclaEscape(ev) {
  // UX-02: Escape no cierra ninguna ventana de Prevencionista/Gantt.

}

// Banner de error dentro de la carta (reordenar / alternar). Si no hay
// carta abierta se usa alert() para no perder el mensaje.
function pvMostrarAvisoGantt(mensaje) {
  const aviso = document.getElementById('pv-aviso-gantt');
  if (aviso && pvGanttVisible()) {
    aviso.textContent = mensaje;
    aviso.classList.remove('hidden');
    aviso.scrollIntoView({ block: 'nearest' });
    return;
  }
  window.alert(mensaje);
}

// C2P-4C: los errores de las acciones rápidas (activar/desactivar y ↑↓)
// se muestran en la capa VISIBLE más alta: primero la modal
// administrativa, luego el banner de la carta, y finalmente alert().
function pvMostrarAvisoOperacion(mensaje) {
  if (pvFormVisible()) { pvFormError(mensaje); return; }
  if (pvAdminVisible()) {
    const aviso = document.getElementById('pv-admin-aviso');
    if (aviso) {
      aviso.textContent = mensaje;
      aviso.classList.remove('hidden');
      aviso.scrollIntoView({ block: 'nearest' });
      return;
    }
  }
  pvMostrarAvisoGantt(mensaje);
}

function pvGanttHTML(plan) {
  const p = plan || {};
  const admin = pvEsAdmin();
  const fases = pvFasesPlan(p.id);
  const tareas = pvTareasReales(p.id);
  const modelo = pvAdaptarTareas(tareas);
  const rango = (window.GanttCarta && typeof window.GanttCarta.calcularRango === 'function')
    ? window.GanttCarta.calcularRango(modelo)
    : null;
  const tituloPlan = pvValor(p.titulo) || 'Sin título registrado';

  const renderizador = (window.GanttCarta && typeof window.GanttCarta.render === 'function')
    ? window.GanttCarta.render({
      tareas: modelo,
      fases: pvFasesLeyenda(modelo, p.id),
      colores: pvColoresFases(p.id),
      formatearFecha: pvFecha,
      textos: {
        vacio: 'Esta Carta Gantt no tiene tareas definidas todavía.',
        sinFechas: 'No hay fechas registradas para construir la línea temporal.',
        sinBarra: 'Sin fechas suficientes para dibujar la barra',
        // C2P-4C: el renderer sigue siendo presentación estándar; la
        // edición vive en los controles superiores y en la modal
        // administrativa (nunca dentro del gráfico).
        notaEscala: (dias) => `Escala diaria · ${dias} ${dias === 1 ? 'día' : 'días'} derivados de las fechas reales de las tareas del plan. Los fines de semana aparecen en tono gris y la línea roja marca "Hoy" solo cuando cae dentro del rango. ${admin
          ? 'Vista de presentación: la edición de fases y tareas se hace con los botones de arriba.'
          : 'Vista de solo lectura.'}`
      }
    })
    : '<p class="text-xs font-bold text-rose-600">El componente GanttCarta no está cargado.</p>';

  return `
    <div id="pv-aviso-gantt" class="hidden mb-3 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs font-bold text-rose-700 dark:text-rose-300"></div>

    <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
      <div>
        <button onclick="pvCerrarCartaGantt()" class="text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-950 border border-purple-200 dark:border-purple-900 px-2.5 py-1 rounded-xl flex items-center space-x-1 transition-colors mb-2">
          <span>← Volver a Cartas Gantt</span>
        </button>
        <span class="text-xs font-extrabold bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 px-2.5 py-1 rounded-md uppercase">
          Carta Gantt · ${admin ? 'administración' : 'solo lectura'}
        </span>
        <h3 class="text-lg font-extrabold text-slate-900 dark:text-white mt-2">${pvEsc(tituloPlan)}</h3>
      </div>
      <button onclick="pvCerrarCartaGantt()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl font-bold p-1">&times;</button>
    </div>

    <div class="mt-3 inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">
      <span>${tareas.length} ${tareas.length === 1 ? 'tarea' : 'tareas'}</span>
      ${rango ? `<span class="text-slate-400 dark:text-slate-500">·</span><span>${pvFecha(rango.inicio)} → ${pvFecha(rango.fin)}</span>` : ''}
    </div>

    ${admin ? `
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button onclick="pvAbrirFormFase('${pvEsc(p.id)}', null)"
          class="px-3 py-1.5 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900 rounded-xl text-xs font-bold hover:bg-purple-100 dark:hover:bg-purple-950 transition-colors">
          + Agregar fase
        </button>
        <button onclick="pvAbrirFormTarea('${pvEsc(p.id)}', null, null)"
          class="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950 transition-colors">
          + Agregar tarea
        </button>
        <button onclick="pvAbrirFormPlan('${pvEsc(p.id)}')"
          class="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
          Editar información
        </button>
        <button onclick="pvAbrirAdmin('${pvEsc(p.id)}')"
          class="px-3 py-1.5 bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 rounded-xl text-xs font-bold hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-colors">
          Administrar estructura
        </button>
      </div>
      <p class="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        ${fases.length} ${fases.length === 1 ? 'fase' : 'fases'} y ${tareas.length} ${tareas.length === 1 ? 'tarea definida' : 'tareas definidas'} ·
        las fases y tareas se administran en su propia modal; aquí solo se muestra el gráfico.
      </p>` : ''}

    <div class="mt-4">${renderizador}</div>

    <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
      <button onclick="pvCerrarCartaGantt()" class="px-4 py-2 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900 rounded-xl text-xs font-bold hover:bg-purple-100 dark:hover:bg-purple-950 transition-colors">
        ← Volver
      </button>
      <button onclick="pvCerrarCartaGantt()" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
        Cerrar
      </button>
    </div>
  `;
}

// ------------------------------------------------------------
// FASES (fila reutilizable, ahora dentro de la modal administrativa):
// activas en su orden; el administrador también ve las inactivas (para
// poder reactivarlas) con controles ↑ ↓ / Editar / activar-desactivar.
// Sin borrado físico. NUNCA se modifica nombre_original.
// ------------------------------------------------------------
function pvFilaFaseHTML(plan, fase, colores, admin) {
  const f = fase || {};
  const nombre = pvValor(f.nombre) || 'Sin nombre registrado';
  const inactiva = f.activo === false;
  const color = (window.GanttCarta && typeof window.GanttCarta.colorFase === 'function')
    ? window.GanttCarta.colorFase(nombre, colores)
    : '#94a3b8';

  return `
    <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border ${inactiva
      ? 'border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 opacity-70'
      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}">
      <div class="flex items-center space-x-2 min-w-0">
        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${color}"></span>
        <span class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${pvEsc(nombre)}</span>
        ${inactiva ? '<span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">Inactiva</span>' : ''}
      </div>
      ${admin ? `
        <div class="flex items-center gap-1.5">
          <button onclick="pvMoverFase('${pvEsc(f.id)}', -1)" title="Subir fase"
            class="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">↑</button>
          <button onclick="pvMoverFase('${pvEsc(f.id)}', 1)" title="Bajar fase"
            class="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">↓</button>
          <button onclick="pvAbrirFormFase('${pvEsc(plan.id)}', '${pvEsc(f.id)}')"
            class="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Editar</button>
          <button onclick="pvAlternarFase('${pvEsc(f.id)}')"
            class="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">${inactiva ? 'Activar' : 'Desactivar'}</button>
        </div>` : ''}
    </div>
  `;
}

// ------------------------------------------------------------
// TAREAS (fila reutilizable dentro de la modal administrativa): formato
// estándar NOMBRE / FASE · RESPONSABLE · PROGRESO — las fechas se leen
// en la barra temporal. Solo tareas administrables (con título real, no
// grupo): placeholders y encabezados no aparecen. Las INACTIVAS se
// muestran con chip [Inactiva], con "Reactivar" y sin ↑↓ (no son visibles
// en el Gantt; su orden se conserva en el payload de reordenar).
// Clic en la fila = Editar tarea (mismo modal que el Gantt).
// ------------------------------------------------------------
function pvFilaTareaHTML(plan, item) {
  const p = plan || {};
  const it = item || {};
  const fase = pvFasePorId(it.fase_id);
  const titulo = pvValor(it.titulo) || 'Sin título registrado';
  const inactiva = it.activo === false;
  const meta = [
    (fase && pvValor(fase.nombre)) || 'Sin fase registrada',
    pvValor(it.responsable) || 'Sin responsable registrado',
    (it.progreso_porcentaje === null || it.progreso_porcentaje === undefined || String(it.progreso_porcentaje).trim() === '')
      ? 'Sin progreso registrado'
      : `${Number(it.progreso_porcentaje)}%`
  ].join(' · ');

  // ↑↓ solo entre tareas VISIBLES del Gantt (activas) de la misma fase.
  const puedeReordenar = !!it.fase_id && !inactiva;

  return `
    <div onclick="pvAbrirFormTarea('${pvEsc(p.id)}', ${it.fase_id ? `'${pvEsc(it.fase_id)}'` : 'null'}, '${pvEsc(it.id)}')"
      class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border ${inactiva
        ? 'border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40'
        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'} hover:border-purple-300 dark:hover:border-purple-800 transition-colors cursor-pointer">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 min-w-0">
          <p class="text-xs font-extrabold text-slate-800 dark:text-white truncate">${pvEsc(titulo)}</p>
          ${inactiva ? '<span class="shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">Inactiva</span>' : ''}
        </div>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 truncate">${pvEsc(meta)}</p>
      </div>
      <div class="flex items-center gap-1.5">
        ${puedeReordenar ? `
          <button onclick="event.stopPropagation(); pvMoverTarea('${pvEsc(it.id)}', -1)" title="Subir tarea"
            class="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">↑</button>
          <button onclick="event.stopPropagation(); pvMoverTarea('${pvEsc(it.id)}', 1)" title="Bajar tarea"
            class="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">↓</button>` : ''}
        <button onclick="event.stopPropagation(); pvAbrirFormTarea('${pvEsc(p.id)}', ${it.fase_id ? `'${pvEsc(it.fase_id)}'` : 'null'}, '${pvEsc(it.id)}')"
          class="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
          Editar
        </button>
        ${inactiva ? `
        <button onclick="event.stopPropagation(); pvAlternarTarea('${pvEsc(it.id)}')"
          class="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 text-[11px] font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950 transition-colors">
          Reactivar
        </button>` : ''}
      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// MODAL ADMINISTRATIVA — "Administrar estructura" (C2P-4C)
// Reemplaza las listas permanentes de fases/tareas que antes quedaban
// debajo del gráfico (generaban demasiado scroll con muchas tareas).
// Dos pestañas simples: Fases (n) y Tareas (m) agrupadas por fase.
// Misma arquitectura que el resto del módulo: SOLO lectura de
// pvPlanes/pvFases/pvItems en cliente y escrituras vía MantencionesService
// (RPC). Tras una RPC exitosa: relectura y actualización local.
// ------------------------------------------------------------
function pvAsegurarModalAdmin() {
  let overlay = document.getElementById('pv-modal-administrar-prevencion');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pv-modal-administrar-prevencion';
    // Encima de la Carta Gantt (z-70), por debajo del formulario (z-80),
    // para que "+ Agregar fase" / "Editar" abran su modal POR ENCIMA.
    overlay.className = 'hidden fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[75] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto cursor-pointer';
    overlay.innerHTML = `
      <div onclick="event.stopPropagation()"
        class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-3xl w-full p-4 sm:p-5 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto custom-scrollbar cursor-default my-auto text-slate-800 dark:text-slate-100">
        <div id="pv-admin-content"></div>
      </div>`;
    overlay.addEventListener('click', (ev) => {
      // UX-02: el fondo conserva esta ventana.
    });
    document.body.appendChild(overlay);
  }
  return overlay;
}

function pvAbrirAdmin(planId) {
  if (!pvEsAdmin()) return;
  const plan = pvPlanPorId(planId);
  if (!plan) return;

  const overlay = pvAsegurarModalAdmin();
  const cont = document.getElementById('pv-admin-content');
  if (!cont) return;

  pvPlanAbiertoId = planId;
  pvAdminAbierto = true;
  pvAdminTab = 'fases';
  pvRenderAdminContenido();
  cont.scrollTop = 0;
  overlay.classList.remove('hidden');
  if(pvRelecturaPendiente&&!pvActualizando)pvMostrarActualizacion('Hay un guardado confirmado pendiente de actualizar.',true);
}

function pvCerrarAdmin() {
  const overlay = document.getElementById('pv-modal-administrar-prevencion');
  if (overlay) overlay.classList.add('hidden');
  pvAdminAbierto = false;
  pvAdminTab = 'fases';
  // Mientras quede una carta abierta detrás, el scroll del body sigue
  // bloqueado (lo libera pvCerrarCartaGantt).
  if (!pvGanttVisible() && !pvFormVisible()) document.body.style.overflow = '';
}

// Cambia de pestaña sin volver a Supabase: pvPlanes/pvFases/pvItems son
// copias locales de lectura y la re-renderización es pura.
function pvAdminCambiarTab(tab) {
  if (!pvAdminAbierto) return;
  pvAdminTab = (tab === 'tareas') ? 'tareas' : 'fases';
  pvRenderAdminContenido();
}

function pvRenderAdminContenido() {
  const cont = document.getElementById('pv-admin-content');
  if (!cont) return;
  const plan = pvPlanPorId(pvPlanAbiertoId);
  if (!plan) return;
  cont.innerHTML = pvAdminHTML(plan);
}

function pvAdminHTML(plan) {
  const p = plan || {};
  const fases = pvFasesPlan(p.id);
  // Contador de la pestaña: conjuntos ADMINISTRABLES (activas + inactivas
  // con título real). El Gantt sigue usando pvTareasReales().
  const tareas = pvTareasAdministrables(p.id);
  const esTareas = pvAdminTab === 'tareas';
  const tituloPlan = pvValor(p.titulo) || 'Sin título registrado';

  return `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="min-w-0">
        <span class="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">${pvFormularioExterno?'Carta Gantt':'Prevencionista'} · administración</span>
        <h3 class="text-base font-extrabold text-slate-900 dark:text-white mt-1">Administrar estructura</h3>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">${pvEsc(tituloPlan)}</p>
      </div>
      <button onclick="pvCerrarAdmin()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl font-bold p-1 shrink-0">&times;</button>
    </div>

    <div id="pv-admin-aviso" class="hidden mt-3 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs font-bold text-rose-700 dark:text-rose-300"></div>

    <div class="mt-4 inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-1">
      <button onclick="pvAdminCambiarTab('fases')"
        class="px-3.5 py-1.5 rounded-lg text-[11px] font-black transition-colors ${!esTareas
          ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-sm'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}">
        Fases (${fases.length})
      </button>
      <button onclick="pvAdminCambiarTab('tareas')"
        class="px-3.5 py-1.5 rounded-lg text-[11px] font-black transition-colors ${esTareas
          ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-sm'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}">
        Tareas (${tareas.length})
      </button>
    </div>

    <div class="mt-4">
      ${esTareas ? pvAdminTareasHTML(p) : pvAdminFasesHTML(p)}
    </div>

    <div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
      <button onclick="pvCerrarAdmin()"
        class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
        Cerrar
      </button>
    </div>
  `;
}

// Pestaña FASES: crear, editar nombre, activar/desactivar y reordenar ↑↓.
// Sin borrado físico (solo activar/desactivar) y sin tocar nombre_original.
function pvAdminFasesHTML(plan) {
  const p = plan || {};
  const fases = pvFasesPlan(p.id); // activas + inactivas, en su orden
  const colores = pvColoresFases(p.id);

  return `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-2.5">
      <div class="flex items-center space-x-2">
        <h4 class="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Fases</h4>
        <span class="text-[11px] font-bold text-slate-400 dark:text-slate-500">${fases.length} ${fases.length === 1 ? 'registrada' : 'registradas'}</span>
      </div>
      <button onclick="pvAbrirFormFase('${pvEsc(p.id)}', null)"
        class="px-3 py-1.5 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900 rounded-xl text-[11px] font-bold hover:bg-purple-100 dark:hover:bg-purple-950 transition-colors">
        + Agregar fase
      </button>
    </div>
    ${fases.length
      ? `<div class="space-y-1.5">${fases.map(f => pvFilaFaseHTML(p, f, colores, true)).join('')}</div>`
      : `<p class="text-xs font-bold text-slate-400 dark:text-slate-500">Este plan todavía no tiene fases registradas. Usa "+ Agregar fase" para crear la primera.</p>`}
    <p class="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
      El reordenamiento envía la lista completa de fases del plan a Supabase; no existe borrado físico ni se modifica el nombre original del Excel.
    </p>
  `;
}

// Pestaña TAREAS: conjuntos ADMINISTRABLES (título real + es_grupo !==
// true), es decir activas E INACTIVAS, agrupadas por fase. Así una tarea
// desactivada sigue visible aquí para poder reactivarla. Los placeholders
// (sin título) y los encabezados es_grupo=true NO aparecen: siguen en
// Supabase y participan (los placeholders) en el payload de reordenar.
function pvAdminTareasHTML(plan) {
  const p = plan || {};
  const fases = pvFasesPlan(p.id);
  const tareas = pvTareasAdministrables(p.id);
  const sinFase = tareas.filter(t => !t.fase_id);

  const bloques = fases.map(f => ({
    clave: f.id,
    nombre: pvValor(f.nombre) || 'Sin nombre registrado',
    inactiva: f.activo === false,
    tareas: tareas.filter(t => t.fase_id === f.id)
  }));

  const encabezado = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-2.5">
      <div class="flex items-center space-x-2">
        <h4 class="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Tareas</h4>
        <span class="text-[11px] font-bold text-slate-400 dark:text-slate-500">${tareas.length} ${tareas.length === 1 ? 'definida' : 'definidas'}</span>
      </div>
      <button onclick="pvAbrirFormTarea('${pvEsc(p.id)}', null, null)"
        class="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-xl text-[11px] font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950 transition-colors">
        + Agregar tarea
      </button>
    </div>`;

  if (!tareas.length) {
    return `${encabezado}
      <p class="text-xs font-bold text-slate-400 dark:text-slate-500">
        Sin tareas definidas todavía: usa "+ Agregar tarea" (primero debe existir una fase).
      </p>`;
  }

  const grupos = bloques.map(b => `
    <div class="mb-4">
      <div class="flex items-center space-x-2 mb-1.5">
        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${(window.GanttCarta && typeof window.GanttCarta.colorFase === 'function')
          ? window.GanttCarta.colorFase(b.nombre, pvColoresFases(p.id))
          : '#94a3b8'}"></span>
        <h5 class="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">${pvEsc(b.nombre)}</h5>
        ${b.inactiva ? '<span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">Fase inactiva</span>' : ''}
        <span class="text-[11px] font-bold text-slate-400 dark:text-slate-500">${b.tareas.length} ${b.tareas.length === 1 ? 'tarea' : 'tareas'}</span>
      </div>
      ${b.tareas.length
      ? `<div class="space-y-1.5">${b.tareas.map(t => pvFilaTareaHTML(p, t)).join('')}</div>`
      : `<p class="text-[11px] font-bold text-slate-400 dark:text-slate-500 px-1">Sin tareas en esta fase.</p>`}
    </div>
  `).join('');

  // Tareas sin fase asignada: visibles para poder editarlo (asignarle una
  // fase), pero NO reordenables (la RPC reordena por fase_id).
  const bloqueSinFase = sinFase.length ? `
    <div class="mb-4">
      <div class="flex items-center space-x-2 mb-1.5">
        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:#94a3b8"></span>
        <h5 class="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Sin fase registrada</h5>
        <span class="text-[11px] font-bold text-slate-400 dark:text-slate-500">${sinFase.length} ${sinFase.length === 1 ? 'tarea' : 'tareas'}</span>
      </div>
      <div class="space-y-1.5">${sinFase.map(t => pvFilaTareaHTML(p, t)).join('')}</div>
    </div>` : '';

  const conInactivas = tareas.filter(t => t.activo === false).length;
  return `${encabezado}${grupos}${bloqueSinFase}
    <p class="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
      Las flechas ↑↓ mueven tareas visibles entre sí; el array que se envía a Supabase es SIEMPRE la lista completa de los items NO-grupo de la fase (activas + inactivas + placeholders históricos), preservando la posición de los ocultos. Ni los placeholders ni los encabezados (es_grupo) se muestran aquí.
      ${conInactivas ? `<br><span class="text-amber-600 dark:text-amber-400 font-bold">${conInactivas} ${conInactivas === 1 ? 'tarea inactiva' : 'tareas inactivas'} en este plan: usa Editar o Reactivar para volver a activarlas.</span>` : ''}
    </p>`;
}

// ------------------------------------------------------------
// MODAL DE FORMULARIOS (plan / fase / tarea) — solo administración
// ------------------------------------------------------------
function pvAsegurarModalForm() {
  let overlay = document.getElementById('pv-modal-formulario-prevencion');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pv-modal-formulario-prevencion';
    overlay.className = 'hidden fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[80] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto cursor-pointer';
    overlay.innerHTML = `
      <div onclick="event.stopPropagation()"
        class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-xl w-full p-5 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto custom-scrollbar cursor-default my-auto text-slate-800 dark:text-slate-100">
        <div id="pv-form-content"></div>
      </div>`;
    overlay.addEventListener('click', (ev) => {
      // UX-02: el fondo conserva esta ventana.
    });
    document.body.appendChild(overlay);
  }
  return overlay;
}

function pvAbrirForm(tituloForm, campos) {
  const overlay = pvAsegurarModalForm();
  const cont = document.getElementById('pv-form-content');
  if (!cont || !overlay) return;

  cont.innerHTML = `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div>
        <span class="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">Prevencionista · administración</span>
        <h3 class="text-base font-extrabold text-slate-900 dark:text-white mt-1">${pvEsc(tituloForm)}</h3>
      </div>
      <button onclick="pvCerrarForm()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl font-bold p-1">&times;</button>
    </div>

    <div id="pv-form-error" class="hidden mt-3 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs font-bold text-rose-700 dark:text-rose-300"></div>

    <div class="mt-4 space-y-3">${campos}</div>

    <div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2">
      <button onclick="pvCerrarForm()"
        class="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
        Cancelar
      </button>
      <button id="pv-form-guardar" onclick="pvGuardarFormulario()"
        class="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition-colors">
        Guardar
      </button>
    </div>
  `;

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const primerCampo = cont.querySelector('input, select');
  if (primerCampo) setTimeout(() => { try { primerCampo.focus(); } catch (e) { /* sin foco */ } }, 0);
}

function pvCerrarForm() {
  if (pvGuardandoForm) return;
  const externo=pvFormularioExterno;pvFormularioExterno=null;
  if(externo?.cerrar)externo.cerrar(); 
  const overlay = document.getElementById('pv-modal-formulario-prevencion');
  if (overlay) overlay.classList.add('hidden');
  pvFormCtx = { tipo: null, planId: null, faseId: null, itemId: null };
  if (!pvGanttVisible()) document.body.style.overflow = '';
}

function pvFormError(mensaje) {
  const el = document.getElementById('pv-form-error');
  if (!el) return;
  if (!mensaje) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }
  el.textContent = mensaje;
  el.classList.remove('hidden');
}

function pvFormOcupado(ocupado) {
  pvGuardandoForm = !!ocupado;
  const btn = document.getElementById('pv-form-guardar');
  if (btn) {
    btn.disabled = !!ocupado;
    btn.classList.toggle('opacity-60', !!ocupado);
    btn.classList.toggle('cursor-not-allowed', !!ocupado);
    btn.textContent = ocupado ? 'Guardando...' : 'Guardar';
  }
}

// Encola el estado del formulario actual (nada se guarda aquí: solo
// contexto para leer los campos al enviar).
function pvFormPreparar(tipo, planId, faseId, itemId) {
  pvFormCtx = {
    tipo: tipo,
    planId: planId || null,
    faseId: faseId || null,
    itemId: itemId || null
  };
  pvFormError(null);
  pvFormOcupado(false);
}

// ---- Campos reutilizables ----
function pvCampoTexto(id, etiqueta, valor, op) {
  const o = op || {};
  return `
    <div>
      <label for="${id}" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
        ${pvEsc(etiqueta)}${o.obligatorio ? ' *' : ''}
      </label>
      <input id="${id}" type="${o.tipo || 'text'}" value="${pvEsc(valor === null || valor === undefined ? '' : valor)}"
        ${o.min !== undefined ? `min="${o.min}"` : ''}
        ${o.max !== undefined ? `max="${o.max}"` : ''}
        ${o.pista ? `placeholder="${pvEsc(o.pista)}"` : ''}
        ${o.obligatorio ? 'required' : ''}
        class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500">
    </div>
  `;
}

function pvCampoCheckbox(id, etiqueta, marcado) {
  return `
    <label class="flex items-center space-x-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
      <input id="${id}" type="checkbox" ${marcado ? 'checked' : ''}
        class="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500">
      <span>${pvEsc(etiqueta)}</span>
    </label>
  `;
}

function pvCampoSelectFase(id, planId, faseId) {
  const fases = pvFasesPlan(planId);
  const activas = fases.filter(f => f.activo !== false);
  const actual = faseId ? pvFasePorId(faseId) : null;
  const opciones = activas.slice();
  if (actual && !opciones.some(f => f.id === actual.id)) opciones.push(actual);

  if (!opciones.length) {
    return `
      <div>
        <label class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Fase a la que pertenece *</label>
        <p class="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2 rounded-xl">
          Este plan aún no tiene fases: primero usa "+ Agregar fase".
        </p>
      </div>
    `;
  }

  return `
    <div>
      <label for="${id}" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Fase a la que pertenece *</label>
      <select id="${id}" required
        class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500">
        ${opciones.map(f => {
    const nombre = pvValor(f.nombre) || 'Sin nombre registrado';
    const inactiva = f.activo === false;
    return `<option value="${pvEsc(f.id)}" ${f.id === faseId ? 'selected' : ''}>${pvEsc(nombre)}${inactiva ? ' (inactiva)' : ''}</option>`;
  }).join('')}
      </select>
    </div>
  `;
}

// ---- Aperturas de formulario ----
function pvAbrirFormPlan(planId) {
  if (!pvEsAdmin()) return;
  const plan = planId ? pvPlanPorId(planId) : null;
  if (planId && !plan) return;
  const p = plan || {};

  pvFormPreparar('plan', planId || null, null, null);
  pvAbrirForm(planId ? 'Editar información de la Carta Gantt' : 'Nueva Carta Gantt', [
    pvCampoTexto('pv-f-titulo', 'Título', p.titulo, { obligatorio: true, pista: 'Nombre de la Carta Gantt' }),
    pvCampoTexto('pv-f-titulo-proyecto', 'Título del proyecto (opcional)', p.titulo_proyecto),
    pvCampoTexto('pv-f-empresa', 'Empresa (opcional)', p.empresa),
    pvCampoTexto('pv-f-gerente', 'Responsable / Gerente (opcional)', p.gerente_proyecto),
    pvCampoTexto('pv-f-anio', 'Año (opcional)', p.anio, { tipo: 'number', min: 1900, max: 2999 }),
    pvCampoCheckbox('pv-f-activo', 'Plan activo (visible en Cartas Gantt)', p.activo !== false),
    '<p class="text-[11px] text-slate-400 dark:text-slate-500">Los campos de origen del Excel (título/empresa originales e importación) no se modifican.</p>'
  ].join(''));
}

function pvAbrirFormFase(planId, faseId) {
  if (!pvEsAdmin()) return;
  if (!planId) return;
  const fase = faseId ? pvFasePorId(faseId) : null;
  if (faseId && !fase) return;
  const f = fase || {};

  pvFormPreparar('fase', planId, faseId || null, null);
  pvAbrirForm(faseId ? 'Editar fase' : 'Nueva fase', [
    pvCampoTexto('pv-f-nombre', faseId ? 'Nombre de la fase' : 'Nombre de la nueva fase', f.nombre, { obligatorio: true, pista: 'Ej.: Planificación' }),
    pvCampoCheckbox('pv-f-activo', 'Fase activa', !fase || f.activo !== false),
    '<p class="text-[11px] text-slate-400 dark:text-slate-500">El nombre original del Excel (nombre_original) no se modifica y no existe borrado físico.</p>'
  ].join(''));
}

function pvAbrirFormTarea(planId, faseId, itemId) {
  if (!pvEsAdmin()) return;
  const item = itemId ? pvItemPorId(itemId) : null;
  if (itemId && !item) return;
  const it = item || {};

  // Al editar, el plan y la fase salen del propio registro (nunca se
  // reasigna un registro a otro plan desde la UI).
  const planFinal = item ? item.plan_id : planId;
  const faseFinal = item ? (it.fase_id || faseId) : faseId;
  if (!planFinal) return;

  pvFormPreparar('tarea', planFinal, faseFinal || null, itemId || null);

  const progreso = (it.progreso_porcentaje === null || it.progreso_porcentaje === undefined
    || String(it.progreso_porcentaje).trim() === '') ? '' : it.progreso_porcentaje;

  pvAbrirForm(itemId ? 'Editar tarea' : 'Nueva tarea', [
    pvCampoTexto('pv-f-titulo', itemId ? 'Nombre de la tarea' : 'Nombre de la nueva tarea', it.titulo, { obligatorio: true, pista: 'Nombre real de la tarea' }),
    pvCampoSelectFase('pv-f-fase', planFinal, faseFinal || null),
    pvCampoTexto('pv-f-responsable', 'Responsable de la tarea (opcional)', it.responsable),
    pvCampoTexto('pv-f-inicio', 'Fecha de inicio de la tarea (opcional)', it.fecha_inicio, { tipo: 'date' }),
    pvCampoTexto('pv-f-termino', 'Fecha de término de la tarea (opcional)', it.fecha_termino, { tipo: 'date' }),
    pvCampoTexto('pv-f-progreso', 'Porcentaje de avance (opcional)', progreso, { tipo: 'number', min: 0, max: 100, pista: '0 – 100' }),
    '<p class="text-[11px] text-slate-400 dark:text-slate-500">Deja el porcentaje vacío si no hay avance registrado. El valor 0 indica un avance registrado de 0 %.</p>',
    pvCampoCheckbox('pv-f-activo', 'Tarea activa', !item || it.activo !== false),
    '<p class="text-[11px] text-slate-400 dark:text-slate-500">Títulos, fechas y progresos originales del Excel, la fila de origen y los segmentos históricos no se modifican.</p>'
  ].join(''));
}

// ---- Envío único: valida, escribe vía RPC y recarga SOLO en éxito ----
function pvGuardarFormulario() {
  if(pvFormularioExterno)return pvFormularioExterno.guardar();
  if (pvFormCtx.tipo === 'plan') return pvGuardarPlan();
  if (pvFormCtx.tipo === 'fase') return pvGuardarFase();
  if (pvFormCtx.tipo === 'tarea') return pvGuardarTarea();
  return undefined;
}

async function pvGuardarPlan() {
  if (!pvEsAdmin() || pvGuardandoForm || pvAccionEnCurso || pvActualizando || pvRelecturaPendiente) return;

  const titulo = pvValor(pvCampo('pv-f-titulo'));
  if (!titulo) { pvFormError('El título de la Carta Gantt es obligatorio.'); return; }

  const anioTexto = pvValor(pvCampo('pv-f-anio'));
  let anio = null;
  if (anioTexto !== null) {
    anio = Number(anioTexto);
    if (!Number.isInteger(anio) || anio < 1900 || anio > 2999) {
      pvFormError('El año debe ser un número entre 1900 y 2999.');
      return;
    }
  }

  pvFormError(null);
  pvFormOcupado(true);
  const activoPlan = pvCampoMarcado('pv-f-activo');

  try {
    const resultado = await window.MantencionesService.guardarPlanPrevencion({
      planId: pvFormCtx.planId,
      titulo: titulo,
      tituloProyecto: pvValor(pvCampo('pv-f-titulo-proyecto')),
      empresa: pvValor(pvCampo('pv-f-empresa')),
      gerenteProyecto: pvValor(pvCampo('pv-f-gerente')),
      anio: anio,
      activo: activoPlan
    });

    // ÉXITO confirmado por Supabase → C2P-4B.3: marcar la carta a
    // reabrir y DESPUÉS el F5 automático (estándar Gantt).
    // - Edición desde dentro de la Carta → se conserva abierta.
    //   (Editar desde la tarjeta del listado deja el listado tal cual.)
    // - "+ Nueva Carta Gantt" → se reabre la recién creada con el id que
    //   devuelve la RPC.
    // - EXCEPCIÓN: si el plan queda DESACTIVADO no se marca nada.
    if (pvFormCtx.planId) {
      if (pvGanttVisible()) pvGuardarClaveReabrir(pvFormCtx.planId, activoPlan);
    } else {
      pvGuardarClaveReabrir(pvResultadoPlanId(resultado), activoPlan);
    }

    await pvFinalizarGuardado();
  } catch (e) {
    console.error('Error guardando la Carta Gantt:', e);
    pvFormError(pvMensajeError(e));
    pvFormOcupado(false);
  }
}

async function pvGuardarFase() {
  if (!pvEsAdmin() || pvGuardandoForm || pvAccionEnCurso || pvActualizando || pvRelecturaPendiente) return;

  const nombre = pvValor(pvCampo('pv-f-nombre'));
  if (!nombre) { pvFormError('El nombre de la fase es obligatorio.'); return; }
  if (!pvFormCtx.planId) { pvFormError('Falta el plan de la fase.'); return; }

  pvFormError(null);
  pvFormOcupado(true);

  try {
    await window.MantencionesService.guardarFasePrevencion({
      faseId: pvFormCtx.faseId,
      planId: pvFormCtx.planId,
      nombre: nombre,
      activo: pvCampoMarcado('pv-f-activo')
    });

    // ÉXITO → C2P-4B.3: conservar la Carta Gantt de este plan tras el F5.
    pvGuardarClaveReabrir(pvFormCtx.planId, true);
    await pvFinalizarGuardado();
  } catch (e) {
    console.error('Error guardando la fase:', e);
    pvFormError(pvMensajeError(e));
    pvFormOcupado(false);
  }
}

async function pvGuardarTarea() {
  if (!pvEsAdmin() || pvGuardandoForm || pvAccionEnCurso || pvActualizando || pvRelecturaPendiente) return;

  const titulo = pvValor(pvCampo('pv-f-titulo'));
  const faseId = pvValor(pvCampo('pv-f-fase'));
  const fechaInicio = pvValor(pvCampo('pv-f-inicio'));
  const fechaTermino = pvValor(pvCampo('pv-f-termino'));
  const progresoTexto = pvValor(pvCampo('pv-f-progreso'));

  if (!titulo) { pvFormError('El nombre de la tarea es obligatorio.'); return; }
  if (!pvFormCtx.planId) { pvFormError('Falta el plan de la tarea.'); return; }
  if (!faseId) { pvFormError('La fase de la tarea es obligatoria. Si el plan no tiene fases, primero usa "+ Agregar fase".'); return; }

  let progreso = null;
  if (progresoTexto !== null) {
    progreso = Number(progresoTexto);
    if (Number.isNaN(progreso) || progreso < 0 || progreso > 100) {
      pvFormError('El progreso debe estar entre 0 y 100.');
      return;
    }
  }

  if (fechaInicio && fechaTermino && fechaTermino < fechaInicio) {
    pvFormError('La fecha de término no puede ser anterior a la fecha de inicio.');
    return;
  }

  pvFormError(null);
  pvFormOcupado(true);

  try {
    await window.MantencionesService.guardarItemPrevencion({
      itemId: pvFormCtx.itemId,
      planId: pvFormCtx.planId,
      faseId: faseId,
      titulo: titulo,
      responsable: pvValor(pvCampo('pv-f-responsable')),
      fechaInicio: fechaInicio,
      fechaTermino: fechaTermino,
      progreso: progreso,
      activo: pvCampoMarcado('pv-f-activo')
    });

    // ÉXITO → C2P-4B.3: conservar la Carta Gantt de este plan tras el F5.
    pvGuardarClaveReabrir(pvFormCtx.planId, true);
    await pvFinalizarGuardado();
  } catch (e) {
    console.error('Error guardando la tarea:', e);
    pvFormError(pvMensajeError(e));
    pvFormOcupado(false);
  }
}

// ------------------------------------------------------------
// ACCIONES RÁPIDAS DE ADMINISTRACIÓN (todas vía RPC + reload en éxito)
// ------------------------------------------------------------
async function pvAlternarPlan(planId) {
  if (!pvEsAdmin() || pvAccionEnCurso || pvGuardandoForm || pvActualizando || pvRelecturaPendiente) return;
  const plan = pvPlanPorId(planId);
  if (!plan) return;

  pvAccionEnCurso = true;
  try {
    await window.MantencionesService.guardarPlanPrevencion({
      planId: plan.id,
      titulo: plan.titulo,
      tituloProyecto: plan.titulo_proyecto,
      empresa: plan.empresa,
      gerenteProyecto: plan.gerente_proyecto,
      anio: plan.anio,
      activo: !(plan.activo !== false)
    });
    // C2P-4B.3 — EXCEPCIÓN: desactivar/activar el plan completo NO marca
    // reapertura. La operación nace en el LISTADO de Cartas Gantt y, si
    // el plan queda inactivo, reabrirlo sería incorrecto: tras el F5 se
    // permanece en la pantalla principal de Prevencionista.
    await pvFinalizarGuardado();
  } catch (e) {
    console.error('Error cambiando el estado del plan:', e);
    pvMostrarAvisoGantt(pvMensajeError(e));
  } finally {
    pvAccionEnCurso = false;
  }
}

async function pvAlternarFase(faseId) {
  if (!pvEsAdmin() || pvAccionEnCurso || pvGuardandoForm || pvActualizando || pvRelecturaPendiente) return;
  const fase = pvFasePorId(faseId);
  if (!fase || !fase.plan_id) return;

  pvAccionEnCurso = true;
  try {
    await window.MantencionesService.guardarFasePrevencion({
      faseId: fase.id,
      planId: fase.plan_id,
      nombre: fase.nombre,
      activo: !(fase.activo !== false)
    });
    // ÉXITO → C2P-4B.3: conservar la Carta Gantt abierta de esta fase.
    pvGuardarClaveReabrir(fase.plan_id, true);
    await pvFinalizarGuardado();
  } catch (e) {
    console.error('Error cambiando el estado de la fase:', e);
    pvMostrarAvisoOperacion(pvMensajeError(e));
  } finally {
    pvAccionEnCurso = false;
  }
}

// C2P-4B.2 — Reactivación/desactivación rápida de una tarea REAL desde la
// modal Administrar estructura. Reutiliza prevencion_gantt_guardar_item
// (misma RPC del formulario) reenviando SOLO campos editables: nunca
// *_original, es_grupo, es_placeholder, fila_origen ni origen_registro.
// Sin fase asignada la RPC rechazaría el guardado, así que se avisa antes.
async function pvAlternarTarea(itemId) {
  if (!pvEsAdmin() || pvAccionEnCurso || pvGuardandoForm || pvActualizando || pvRelecturaPendiente) return;
  const item = pvItemPorId(itemId);
  if (!item || !pvTareaAdministrable(item)) return;
  if (!item.plan_id || !item.fase_id) {
    pvMostrarAvisoOperacion('Esta tarea no tiene fase asignada: asígnale una fase antes de cambiar su estado.');
    return;
  }

  const progreso = (item.progreso_porcentaje === null || item.progreso_porcentaje === undefined
    || String(item.progreso_porcentaje).trim() === '') ? null : Number(item.progreso_porcentaje);

  pvAccionEnCurso = true;
  try {
    await window.MantencionesService.guardarItemPrevencion({
      itemId: item.id,
      planId: item.plan_id,
      faseId: item.fase_id,
      titulo: item.titulo,
      responsable: item.responsable,
      fechaInicio: item.fecha_inicio,
      fechaTermino: item.fecha_termino,
      progreso: progreso,
      activo: !(item.activo !== false)
    });
    // ÉXITO → C2P-4B.3: conservar la Carta Gantt abierta de este plan
    // (reactivar/desactivar una tarea no afecta a la carta).
    pvGuardarClaveReabrir(item.plan_id, true);
    await pvFinalizarGuardado();
  } catch (e) {
    console.error('Error cambiando el estado de la tarea:', e);
    pvMostrarAvisoOperacion(pvMensajeError(e));
  } finally {
    pvAccionEnCurso = false;
  }
}

// FASES: p_tipo='FASES', p_padre_id=plan_id y la lista COMPLETA de IDs
// del plan con el par intercambiado (sin drag & drop: solo ↑ / ↓).
async function pvMoverFase(faseId, dir) {
  if (!pvEsAdmin() || pvAccionEnCurso || pvGuardandoForm || pvActualizando || pvRelecturaPendiente) return;
  const fase = pvFasePorId(faseId);
  if (!fase || !fase.plan_id) return;

  const ids = pvFasesPlan(fase.plan_id).map(f => f.id);
  const i = ids.indexOf(faseId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return; // borde: sin movimiento

  const tmp = ids[i];
  ids[i] = ids[j];
  ids[j] = tmp;

  pvAccionEnCurso = true;
  try {
    await window.MantencionesService.reordenarPrevencion({
      tipo: 'FASES',
      padreId: fase.plan_id,
      ordenes: ids
    });
    // ÉXITO → C2P-4B.3: conservar la Carta Gantt tras el reordenamiento.
    pvGuardarClaveReabrir(fase.plan_id, true);
    await pvFinalizarGuardado();
  } catch (e) {
    console.error('Error reordenando fases:', e);
    pvMostrarAvisoOperacion(pvMensajeError(e));
  } finally {
    pvAccionEnCurso = false;
  }
}

// TAREAS: p_tipo='TAREAS', p_padre_id=fase_id. El backend valida
//   WHERE fase_id = p_padre_id AND es_grupo IS FALSE
// por lo que p_ordenes debe contener TODOS y SOLO los IDs de esa fase con
// es_grupo !== true: tareas reales ACTIVAS + reales INACTIVAS +
// placeholders históricos. Los encabezados es_grupo=true NUNCA viajan.
// No se filtra por título, es_placeholder ni activo (la RPC exige
// también los registros ocultos). La posición de los ocultos se
// preserva: solo se intercambian los dos IDs VISIBLES elegidos y se
// envía el array completo. Los placeholders siguen ocultos en pantalla.
async function pvMoverTarea(itemId, dir) {
  if (!pvEsAdmin() || pvAccionEnCurso || pvGuardandoForm || pvActualizando || pvRelecturaPendiente) return;
  const item = pvItemPorId(itemId);
  if (!item) return;
  if (!item.fase_id) {
    pvMostrarAvisoOperacion('Esta tarea no tiene fase asignada: asígnale una fase antes de reordenarla.');
    return;
  }

  // Array COMPLETO exigido por la RPC: exactamente es_grupo !== true.
  const hermanas = (Array.isArray(pvItems) ? pvItems : [])
    .filter(x => x && x.fase_id === item.fase_id && x.es_grupo !== true)
    .slice()
    .sort(pvCompararItemsMismaFase);
  // ↑ y ↓ operan solo sobre las VISIBLES del Gantt (activas + título
  // real): los ocultos conservan su posición y no se reordenan solos.
  const visibles = hermanas.filter(pvEsTareaReal);

  const pos = visibles.findIndex(x => x.id === itemId);
  const vecino = (pos >= 0) ? visibles[pos + dir] : null;
  if (!vecino) return; // borde: sin movimiento

  const ids = hermanas.map(x => x.id);
  const a = ids.indexOf(itemId);
  const b = ids.indexOf(vecino.id);
  if (a < 0 || b < 0) return;

  const tmp = ids[a];
  ids[a] = ids[b];
  ids[b] = tmp;

  pvAccionEnCurso = true;
  try {
    await window.MantencionesService.reordenarPrevencion({
      tipo: 'TAREAS',
      padreId: item.fase_id,
      ordenes: ids
    });
    // ÉXITO → C2P-4B.3: conservar la Carta Gantt tras el reordenamiento.
    pvGuardarClaveReabrir(item.plan_id, true);
    await pvFinalizarGuardado();
  } catch (e) {
    console.error('Error reordenando tareas:', e);
    pvMostrarAvisoOperacion(pvMensajeError(e));
  } finally {
    pvAccionEnCurso = false;
  }
}

// Escape global de este módulo: cierra primero el formulario (conservando
// sus datos si hay una RPC en vuelo), luego la modal administrativa y
// finalmente la Carta Gantt.
document.addEventListener('keydown', pvTeclaEscape, true);

// Relectura local tras confirmar la escritura; nunca repite la RPC de guardado.
async function pvFinalizarGuardado(){
  if(pvActualizando)return;
  pvActualizando=true;pvRelecturaPendiente=true;
  const externo=pvTrasGuardarExterno;
  const plan=pvPlanAbiertoId||pvPlanTrasGuardar;
  const principal=document.getElementById('pv-content');
  const carta=document.getElementById('pv-carta-gantt-content');
  const seleccion=pvPlanAbiertoId;
  pvFormOcupado(false);pvCerrarForm();
  const zona=pvGanttVisible()?carta:principal;
  if(zona)zona.setAttribute('aria-busy','true');
  pvMostrarActualizacion('Actualizando Carta Gantt…');
  try{
    if(externo){
      const vigente=await externo();
      if(vigente===false){pvRelecturaPendiente=false;pvPlanTrasGuardar=null;return;}
    }
    else {
      const datos=await window.MantencionesService.getPrevencionGantt(true);
      if(!datos||!['planes','fases','items'].every(k=>Array.isArray(datos[k])))throw Error('Relectura incompleta');
      pvPlanes=datos.planes;pvFases=datos.fases;pvItems=datos.items;
      if(!principal||document.getElementById('pv-content')!==principal){
        pvRelecturaPendiente=false;pvPlanTrasGuardar=null;return;
      }
      if(document.getElementById('pv-content')===principal){
        const listado=document.getElementById('pv-cartas-listado');
        if(listado)listado.innerHTML=pvCartasHTML();
      }
      if(document.getElementById('pv-carta-gantt-content')===carta&&pvPlanAbiertoId===seleccion){
        if(plan&&pvPlanes.some(p=>p.id===plan&&p.activo!==false))pvAbrirCartaGantt(plan);
        else if(pvGanttVisible()){pvCerrarAdmin();pvCerrarCartaGantt();}
      }
    }
    if(pvAdminVisible()){
      const admin=document.getElementById('pv-admin-content');
      const scroll=admin?.scrollTop||0;pvRenderAdminContenido();if(admin)admin.scrollTop=scroll;
    }
    pvRelecturaPendiente=false;pvPlanTrasGuardar=null;
    document.getElementById('pv-actualizacion-estado')?.remove();
    window.GanttCarta?.avisarGuardado?.();
  }catch(_){
    pvMostrarActualizacion('Guardado confirmado. No se pudo actualizar la carta; vuelve a consultar antes de continuar.',true);
  }finally{
    pvActualizando=false;
    if(zona)zona.setAttribute('aria-busy','false');
  }
}

function pvMostrarActualizacion(texto, reintentar=false){
  if(!document.createElement)return;
  document.getElementById('pv-actualizacion-estado')?.remove();
  const zona=pvAdminVisible()?document.getElementById('pv-admin-content'):
    pvGanttVisible()?document.getElementById('pv-carta-gantt-content'):document.getElementById('pv-content');
  if(!zona)return;
  const aviso=document.createElement('p');aviso.id='pv-actualizacion-estado';
  aviso.className='text-sm font-bold mb-3';aviso.setAttribute('role',reintentar?'alert':'status');aviso.textContent=texto;
  if(reintentar){const boton=document.createElement('button');boton.type='button';boton.className='ml-3 underline';boton.textContent='Volver a consultar';boton.onclick=()=>pvFinalizarGuardado();aviso.appendChild(boton);}
  zona.prepend(aviso);
}
