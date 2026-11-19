// UX-02: las ventanas solo se cierran con controles explícitos o tras guardar.
// Esta regla sustituye las referencias históricas a cierre por fondo o Escape.
// ==========================================================
// VISTA: MANTENCIÓN GENERAL - HOTEL EL ALMENDRO
// ==========================================================
// Datos reales desde Supabase vía window.MantencionesService.


//
// Convenciones:
// - Ya NO usa state.maintenances ni mocks.
// - NULL → "Sin dato registrado" / "Sin fecha registrada" /
//   "Sin responsable registrado". Nunca NULL → 0.
// - Estados: cargando / sin datos / error.

let mantencionSubapartado = null;

// Estado local de Catálogo General e Historial.
// mantencionElementoSeleccionado: id del elemento cuya ficha está abierta.
// mantencionFiltrosElementos: filtros en cliente (nunca recargan la SPA).
// C2E-2/3: el filtro "grupo" se sustituye por "categoria", derivada de
// hoja_origen (LUGAR / MAQUINAS / RADIADORES / REFRIGERADOR). NO existe
// columna categoría en la base: solo cambia la etiqueta visible.
let mantencionElementoSeleccionado = null;
const mantencionFiltrosElementos = { texto: '', ubicacion: '', categoria: '' };

// C2E-2/3 — copia en cliente del historial DEDICADO (getMantencionesGenerales)
// para calcular por tarjeta el número de mantenciones y la última fecha sin
// volver a Supabase. Independiente de _mantencionesCache (que es de Baños).
let mntMantencionesGeneralesBase = [];

// Estado local de Inventario / Bodegas (Fase 2.2).
// INDEPENDIENTE del estado de Elementos e Historial: nunca se reutiliza.
// mantencionInventarioSeleccionado: id del registro de inventario con ficha abierta.
// mantencionFiltrosInventario: filtros en cliente (nunca recargan la SPA).
let mantencionInventarioSeleccionado = null;
const mantencionFiltrosInventario = { texto: '', ubicacion: '', responsable: '' };

// Estado local de Baños (Fase 2.3).
// INDEPENDIENTE de Elementos e Historial e Inventario: nunca se reutiliza.
// mantencionBanoSeleccionado: id del baño cuya ficha está abierta.
// mantencionFiltrosBanos: filtros en cliente (nunca recargan la SPA).
// No hay filtro por responsable/estado/costo: el Excel de baños nunca trajo
// responsable, estado ni costo (siempre NULL). No se filtra por lo inexistente.
let mantencionBanoSeleccionado = null;
const mantencionFiltrosBanos = { texto: '', grupo: '', historial: '' };

// Estado local de Pilas y Controles (Fase 2.4).
// INDEPENDIENTE de Elementos e Historial, Inventario y Baños: nunca se
// reutilizan sus filtros ni su selección.
// mantencionPilaSeleccionada: id del control cuya ficha está abierta.
// mantencionFiltrosPilas: filtros en cliente (nunca recargan la SPA).
// No hay filtro por responsable/estado/costo/mantención: el archivo de pilas
// tiene nemotecnico y estado_original NULL, 0 mantenciones, y no hay
// responsables ni costos que filtrar. No se filtra por lo inexistente.
let mantencionPilaSeleccionada = null;
const mantencionFiltrosPilas = { texto: '', tipo: '', relacionTv: '' };

// Estado local de TV Habitaciones (Fase 2.5).
// INDEPENDIENTE de Elementos e Historial, Inventario, Baños y Pilas: nunca
// se reutilizan sus filtros ni su selección.
// mantencionTelevisorSeleccionado: id del televisor cuya ficha está abierta.
// mantencionFiltrosTV: filtros en cliente (nunca recargan la SPA).
// No hay filtro por ubicación/estilo: el archivo de TV trae una ubicación
// prácticamente por registro y tamaños ambiguos; no se filtra por lo que
// genera ruido. Marca y booleanos de control sí aportan valor real.
let mantencionTelevisorSeleccionado = null;
const mantencionFiltrosTV = { texto: '', marca: '', controlTv: '', controlDeco: '' };

// Estado local de Puertas / Engrase y Aceitado (Fase 2.6).
// INDEPENDIENTE de Elementos e Historial, Inventario, Baños, Pilas y TV:
// nunca se reutilizan sus filtros ni su selección.
// mantencionEngraseSeleccionado: id del registro de listado cuya ficha está
// abierta.
// mantencionFiltrosEngrase: filtros en cliente (nunca recargan la SPA).
// No hay filtro por hoja ni por ubicación: Hoja1/Hoja2 es trazabilidad
// técnica (no es un filtro de negocio) y el buscador ya cubre ubicación.
// El filtro de fecha sí aporta valor real (15 con fecha / 32 sin fecha).
let mantencionEngraseSeleccionado = null;
const mantencionFiltrosEngrase = { texto: '', responsable: '', fecha: '' };

// Estado local de Fosas y Alcantarillado (Fase 2.7).
// INDEPENDIENTE de Elementos e Historial, Inventario, Baños, Pilas, TV y
// Puertas / Engrase: nunca se reutilizan sus filtros ni su selección.
// mantencionFosaSeleccionada: id del registro de fosa cuya ficha está abierta.
// mantencionFiltrosFosas: filtros en cliente (nunca recargan la SPA).
// No hay filtro por archivo/hoja ni por ubicación: la trazabilidad es técnica
// y el buscador ya cubre nombre, código, ubicación y capacidad.
let mantencionFosaSeleccionada = null;
const mantencionFiltrosFosas = { texto: '', categoria: '', historial: '' };

// Estado local de Guía Preventiva (Fase 2.8).
// INDEPENDIENTE de todos los subapartados anteriores: nunca se reutilizan
// sus filtros ni su estado. La guía es DOCUMENTACIÓN PREVENTIVA (un solo
// documento navegable), por lo que NO existe ficha de registro:
// - mntGuiasBase / mntGuiaSecciones / mntGuiaItems: copias en cliente de
//   getGuias() para trabajar sin volver a Supabase.
// - mantencionFiltroGuia: solo buscador (sin filtros por tipo/temporada/
//   frecuencia: existe UNA guía con UN único valor de cada uno).
// - mntSeccionesGuiaAbiertas: ids de secciones con el acordeón abierto;
//   null = sin inicializar (al abrir la modal solo se despliega la PRIMERA
//   sección). No se crea mantencionGuiaSeleccionada ni una segunda modal.
let mntGuiasBase = [];
let mntGuiaSecciones = [];
let mntGuiaItems = [];
const mantencionFiltroGuia = { texto: '' };
let mntSeccionesGuiaAbiertas = null;

// Estado local de Jardinería (Fase 2.9).
// INDEPENDIENTE de todos los subapartados anteriores: nunca se reutilizan
// sus filtros ni su selección. Son copias en cliente de getJardineria()
// para navegar sin volver a Supabase (la caché _jardineriaCache se
// conserva intacta, también al cerrar la modal).
// - mntJardineriaSectores / mntJardineriaTrabajos: los 5 sectores y los
//   127 trabajos; la relación sector → trabajos se resuelve SIEMPRE por
//   trabajo.sector_id === sector.id (nunca por nombre ni por hoja).
// - mntJardineriaRiegoProgramacion / RiegoZonas / RiegoNotas: bloque
//   general "Riego con Agua Tratada" (7 días, 2 zonas, 2 notas).
// - mntJardineriaLabores: 23 labores complementarias (fuente distinta del
//   Excel; NO se mezclan con los 127 trabajos).
// - mantencionSectorJardineriaSeleccionado / mantencionTrabajoJardineria-
//   Seleccionado: navegación Principal → sector → trabajo dentro de la
//   MISMA modal (sin modal sobre modal).
// - mantencionFiltrosJardineria: filtros en cliente del DETALLE de sector.
//   Se conservan al ir y volver del trabajo y se limpian solo al cerrar
//   la modal (X, Cerrar, Escape u overlay).
// Sin fechas, sin historial, sin CRUD: solo lectura.
let mntJardineriaSectores = [];
let mntJardineriaTrabajos = [];
let mntJardineriaRiegoProgramacion = [];
let mntJardineriaRiegoZonas = [];
let mntJardineriaRiegoNotas = [];
let mntJardineriaLabores = [];
let mantencionSectorJardineriaSeleccionado = null;
let mantencionTrabajoJardineriaSeleccionado = null;
const mantencionFiltrosJardineria = { texto: '', prioridad: '', temporada: '', titulo: '' };

// C2P-4C: Prevencionista ya NO mantiene estado local aquí. Su interfaz
// (Cartas Gantt, edición y administración de fases/tareas) vive en el
// módulo principal js/views/prevencionista.js. MantencionesService.
// getPrevencionGantt() y _prevencionCache siguen intactos en el service
// (el conteo de prevencion_gantt_items se retiró de getResumen()).

const MNT_SUBAPARTADOS = [
  { id: 'elementos', nombre: 'Catálogo General e Historial', icono: '🧰', descripcion: 'Lugares, máquinas, radiadores y refrigeradores con su historial de mantenciones.' },
  { id: 'inventario', nombre: 'Inventario / Bodegas', icono: '🏬', descripcion: 'Inventarios de elementos con fecha de inventario y responsable.' },
  { id: 'banos', nombre: 'Baños', icono: '🚻', descripcion: 'Elementos y artículos asociados a baños.' },
  { id: 'pilas', nombre: 'Pilas y Controles', icono: '🔋', descripcion: 'Controles TV / DECO y sus pilas.' },
  { id: 'tv', nombre: 'TV Habitaciones', icono: '📺', descripcion: 'Inventario y estado de televisores por habitación.' },
  { id: 'engrase', nombre: 'Puertas / Engrase', icono: '🚪', descripcion: 'Listado de engrase y aceitado de puertas y herrajes.' },
  { id: 'fosas', nombre: 'Fosas y Alcantarillado', icono: '🕳️', descripcion: 'Fosas, alcantarillado y contactos de servicio.' },
  { id: 'guia', nombre: 'Guía Preventiva', icono: '📖', descripcion: 'Guía de mantención preventiva documentada.' },
  { id: 'ubicaciones', nombre: 'Ubicaciones del hotel', icono: '📍', descripcion: 'Consulta y administra las habitaciones, salones y sectores del hotel. Registra nuevas ubicaciones cuando se realicen ampliaciones o remodelaciones.' },
  { id: 'jardineria', nombre: 'Jardinería', icono: '🌿', descripcion: 'Subapartado: trabajos, riego y labores complementarias.', subapartado: true }
  // C2P-4C: Prevencionista YA NO es subapartado ni shortcut de Mantención
  // General. Es un módulo principal de la navegación (js/views/
  // prevencionista.js) con vista, modal y contador propios. Su tarjeta
  // morada, su entrada en MNT_SUBAPARTADOS, su cargador y su guard de
  // navegación fueron retirados de este archivo. No se tocan los demás
  // subapartados ni el servicio de lectura.
];

const MNT_CARGADORES_SUBAPARTADO = {
  ubicaciones: () => window.MantencionesService.getUbicacionesTV(true),
  // C2E-2/3 — Catálogo General e Historial: carga DEDICADA (elementos +
  // historial del MISMO archivo de origen) con dos colecciones cacheadas y
  // sin N+1. Se usan los métodos nuevos getElementosGenerales() /
  // getMantencionesGenerales() para NO alterar getElementos() /
  // getMantenciones(), que siguen alimentando los subáreas CERRADAS
  // (Pilas, TV, Engrase, Fosas y Baños).
  elementos: async () => {
    const [elementos, mantenciones] = await Promise.all([
      window.MantencionesService.getElementosGenerales(),
      window.MantencionesService.getMantencionesGenerales()
    ]);
    return { elementos, mantenciones };
  },
  inventario: () => window.MantencionesService.getInventarios(),
  // Fase 2.3 — Baños: Promise.all de ambas colecciones cacheadas (una sola
  // consulta por fuente, sin N+1). El cruce baño ↔ historial se hace en
  // cliente por mantencion.elemento_id === bano.id.
  banos: async () => {
    const [banos, mantenciones] = await Promise.all([
      window.MantencionesService.getBanos(),
      window.MantencionesService.getMantenciones()
    ]);
    return { banos, mantenciones };
  },
  // Fase 2.4 — Pilas y Controles: Promise.all de TRES colecciones
  // cacheadas (una sola consulta por fuente, sin N+1 y sin N consultas por
  // ficha). getPilasControles → los controles del subapartado;
  // getTelevisores → relación/estado contextual por FK real;
  // getElementos → permite resolver el elemento TV relacionado por
  // tv.elemento_id SIN depender de que "Elementos e Historial" se haya
  // abierto antes (no se usa mntElementosBase).
  // NO se llama getMantenciones(): este archivo tiene 0 mantenciones
  // confirmadas y no hace falta cargar toda esa tabla para esta vista.
  pilas: async () => {
    const [pilas, televisores, elementos] = await Promise.all([
      window.MantencionesService.getPilasControles(),
      window.MantencionesService.getTelevisores(),
      window.MantencionesService.getElementos()
    ]);
    return { pilas, televisores, elementos };
  },
  tv: async () => {
    // Fase 2.5 — TV Habitaciones: Promise.all de DOS colecciones cacheadas
    // (sin N+1 y sin consultas por ficha). getTelevisores → las 28 filas
    // técnicas (ordenadas por fila_origen); getElementos → permite resolver
    // por FK real (tv.elemento_id === elemento.id) el nombre_original,
    // el codigo y la ubicación canónica del elemento TV, SIN depender de
    // que "Elementos e Historial" se haya abierto antes (no se usa
    // mntElementosBase). NO se agrega embed hacia elementos_mantenibles en
    // el servicio: televisores_habitaciones tiene TRES FK hacia esa tabla.
    const [televisores, elementos] = await Promise.all([
      window.MantencionesService.getTelevisores(),
      window.MantencionesService.getElementos()
    ]);
    return { televisores, elementos };
  },
  engrase: async () => {
    // Fase 2.6 — Puertas / Engrase: Promise.all de DOS colecciones
    // cacheadas (sin N+1 y sin consultas por ficha). getEngraseAceitado →
    // los registros fuente del listado (las 47 de Puertas; las 15 filas de
    // Fosas quedan excluidas por trazabilidad en el servicio); getElementos
    // → información canónica para los registros que tienen elemento_id
    // (resolución por FK en cliente), SIN depender de mntElementosBase y SIN
    // usar embed hacia elementos_mantenibles (evita relaciones PostgREST
    // ambiguas). NO se llama getMantenciones(): la fecha de última
    // mantención y el responsable ya vienen en el propio listado.
    const [engrase, elementos] = await Promise.all([
      window.MantencionesService.getEngraseAceitado(),
      window.MantencionesService.getElementos()
    ]);
    return { engrase, elementos };
  },
  fosas: async () => {
    // Fase 2.7 — Fosas y Alcantarillado: Promise.all de DOS fuentes
    // cacheadas (sin N+1 y sin consultas por ficha). getFosas() →
    // { fosas, contactos, fuente, comentarios } (los 19 registros
    // principales, los 3 contactos, el historial fuente y los comentarios
    // del Excel, todo en 4 consultas); getElementos() → permite resolver el
    // elemento vinculado por FK real (fosa.elemento_id === elemento.id) SIN
    // depender de mntElementosBase (funciona aunque "Elementos e Historial"
    // no se haya abierto). NO se llama getMantenciones(): el historial ya
    // viene en fosas_mantencion_fuente; no se duplica información.
    const [datosFosas, elementos] = await Promise.all([
      window.MantencionesService.getFosas(),
      window.MantencionesService.getElementos()
    ]);
    return { ...datosFosas, elementos };
  },
  guia: () => window.MantencionesService.getGuias(),
  jardineria: () => window.MantencionesService.getJardineria()
  // C2P-4C: sin cargador de 'prevencionista' (ya no es subapartado de
  // Mantención General; su lectura getPrevencionGantt() vive en el módulo
  // principal js/views/prevencionista.js).
};

const MNT_ETIQUETAS_SECCION = {
  fosas: 'Fosas y alcantarillado',
  contactos: 'Contactos de servicio',
  fuente: 'Fuente de mantención de fosas',
  guias: 'Guías preventivas',
  secciones: 'Secciones de guía',
  items: 'Ítems',
  sectores: 'Sectores de jardinería',
  trabajos: 'Trabajos de jardinería',
  riegoProgramacion: 'Programación de riego',
  riegoZonas: 'Zonas de riego',
  riegoNotas: 'Notas de riego',
  laboresComplementarias: 'Labores complementarias'
  // C2P-4C: se retiraron las etiquetas planes / fases / segmentos: eran
  // residuales de la interfaz anterior de Prevencionista dentro de
  // Mantención General (ya no carga ese subapartado aquí).
};

// ------------------------------------------------------------
// Utilidades de presentación (NULL → textos neutros)
// ------------------------------------------------------------
function mntEsc(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mntSinDato(valor) {
  return (valor === null || valor === undefined || valor === '') ? 'Sin dato registrado' : valor;
}

function mntSinFecha(valor) {
  return (valor === null || valor === undefined || valor === '') ? 'Sin fecha registrada' : valor;
}

function mntSinResponsable(valor) {
  return (valor === null || valor === undefined || valor === '') ? 'Sin responsable registrado' : valor;
}

function mntValorCelda(clave, valor) {
  if (valor === null || valor === undefined || valor === '') {
    if (/fecha/i.test(clave)) return mntSinFecha(valor);
    if (/responsable/i.test(clave)) return mntSinResponsable(valor);
    return mntSinDato(valor);
  }
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  return mntEsc(valor);
}

// ------------------------------------------------------------
// Render principal (patrón loader: áreas.js / dashboard.js)
// ------------------------------------------------------------
function renderMaintenancesView() {
  setTimeout(async () => {
    const loader = document.getElementById('mantenciones-loader');
    const container = document.getElementById('mantenciones-content');
    if (!loader || !container) return;

    try {
      if (!window.MantencionesService) {
        throw new Error('MantencionesService no está cargado.');
      }
      const resumen = await window.MantencionesService.getResumen();
      const sinDatos =
        resumen.elementos === 0 &&
        resumen.mantenciones === 0 &&
        resumen.inventarios === 0 &&
        resumen.subapartados.conDatos === 0;

      container.innerHTML = sinDatos ? getMantencionesVacioHTML() + getMantencionesHTML(resumen) : getMantencionesHTML(resumen);
      container.classList.remove('hidden');
    } catch (e) {
      console.error('Error cargando Mantención General:', e);
      container.innerHTML = getMantencionesErrorHTML();
      container.classList.remove('hidden');
    } finally {
      loader.classList.add('hidden');
    }
  }, 0);

  return `
    ${uiCargandoHTML("mantenciones-loader")}
    <div id="mantenciones-content" class="hidden w-full"></div>
  `;
}

// ------------------------------------------------------------
// HTML: vista principal
// ------------------------------------------------------------
function getMantencionesHTML(resumen) {
  const sub = resumen.subapartados;
  // Jardinería conserva su vista independiente y sus metadatos de navegación.
  const visibles = MNT_SUBAPARTADOS.filter(s => s.id !== 'jardineria');
  const cantidadPorId = {};
  sub.detalle.forEach(d => { cantidadPorId[d.id] = d.cantidad; });
  const conDatos = visibles.filter(s => cantidadPorId[s.id] > 0).length;

  return `
    <div class="alm-ui alm-main-page alm-module-page space-y-5 max-w-7xl mx-auto pb-10">

      ${uiEncabezadoSeccion('Mantención General','Catálogo, fichas e historiales del hotel. Selecciona un subapartado para consultar sus registros.','wrench')}

      <!-- RESUMEN REAL -->
      <div class="alm-module-stats-grid alm-summary-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        ${mntKPIHTML('🧰', 'Elementos generales', resumen.elementos)}
        ${mntKPIHTML('🕓', 'Mantenciones históricas', resumen.mantenciones)}
        ${mntKPIHTML('🏬', 'Inventarios', resumen.inventarios)}
        <div class="alm-stat-card alm-summary-card bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center space-x-4">
          <div class="alm-module-icon w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-900 flex items-center justify-center text-2xl">🗂️</div>
          <div class="min-w-0">
            <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Subapartados disponibles</p>
            <p class="text-2xl font-black text-slate-900 dark:text-white">
              ${conDatos}
              <span class="text-sm font-bold text-slate-400 dark:text-slate-500">/ ${visibles.length}</span>
            </p>
          </div>
        </div>
      </div>

      <!-- NAVEGACIÓN POR TARJETAS -->
      <div>
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Navegación por subapartados</h4>
        <div class="alm-module-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
          ${visibles.map(s => mntTarjetaHTML(s, cantidadPorId[s.id] ?? (s.id === 'ubicaciones' ? 'No disponible' : 0))).join('')}
        </div>
      </div>

      <!-- El contenido del subapartado se abre en una MODAL sobre esta vista.
           Ya NO se renderiza ningún subapartado debajo de las tarjetas. -->

    </div>
  `;
}

function mntKPIHTML(icono, etiqueta, valor) {
  return `
    <div class="alm-stat-card alm-summary-card bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center space-x-4">
      <div class="alm-module-icon w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-2xl">${icono}</div>
      <div class="min-w-0">
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">${mntEsc(etiqueta)}</p>
        <p class="text-2xl font-black text-slate-900 dark:text-white">${valor}</p>
      </div>
    </div>
  `;
}

function mntTarjetaHTML(s, cantidad) {
  // C2P-4C: no existen shortcuts/atajos de módulo dentro de Mantención
  // General. Prevencionista (antes tarjeta morada "Ir al módulo →") fue
  // retirado completamente: hoy es un módulo principal con su propia
  // entrada en el sidebar. Todas las tarjetas de aquí abren un
  // subapartado real de este módulo.
  return `
    <div onclick="abrirMantencionSubapartado('${s.id}')"
         class="alm-module-card bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer card-hover group flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-3">
          <div class="alm-module-icon w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/60 flex items-center justify-center text-2xl transition-colors">${s.icono}</div>
          <span class="alm-module-count text-xs font-black px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900">${cantidad}</span>
        </div>
        <h4 class="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${mntEsc(s.nombre)}</h4>
        <p class="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">${mntEsc(s.descripcion)}</p>
      </div>
      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold">
        ${s.subapartado
          ? '<span class="text-purple-600 dark:text-purple-400">Subapartado</span>'
          : '<span class="text-slate-400 dark:text-slate-500">Sección</span>'}
        <span class="text-blue-600 dark:text-blue-400 group-hover:text-blue-800 dark:group-hover:text-blue-300">Abrir</span>
      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// HTML: estados sin datos y error
// ------------------------------------------------------------
function getMantencionesVacioHTML() {
  return `
    <div class="max-w-3xl mx-auto bg-white dark:bg-slate-900 rounded-3xl p-12 border border-slate-200 dark:border-slate-800 text-center space-y-3">
      <span class="text-4xl block">🗃️</span>
      <h3 class="text-lg font-black text-slate-900 dark:text-white">Sin datos registrados</h3>
      <p class="text-sm text-slate-600 dark:text-slate-300">
        Aún no existen elementos, mantenciones ni inventarios para Mantención General.
      </p>
      <button onclick="renderCurrentView()" class="mt-3 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
        Reintentar
      </button>
    </div>
  `;
}

function getMantencionesErrorHTML() {
  return `
    <div class="max-w-3xl mx-auto bg-white dark:bg-slate-900 rounded-3xl p-12 border border-rose-200 dark:border-rose-900 text-center space-y-3">
      <span class="text-4xl block">⚠️</span>
      <h3 class="text-lg font-black text-slate-900 dark:text-white">Error al cargar Mantención General</h3>
      <p class="text-sm text-slate-600 dark:text-slate-300">
        No fue posible cargar los registros. Verifica tu sesión y conexión, luego reintenta.
      </p>
      <button onclick="renderCurrentView()" class="mt-3 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
        Reintentar
      </button>
    </div>
  `;
}

// ------------------------------------------------------------
// Navegación interna por subapartados
// ------------------------------------------------------------
// ------------------------------------------------------------
// Navegación interna por subapartados (MODAL ÚNICA)
// ------------------------------------------------------------
// Al pulsar una tarjeta se abre una sola modal grande sobre la pantalla de
// Mantención General. El contenido del subapartado se muestra DENTRO de esa
// modal. La vista principal permanece detrás. No hay modal sobre modal.
const MNT_MODAL_SUBAPARTADO_ID = 'mnt-modal-subapartado';

// Escape cierra la modal de subapartado (sea listado o ficha).
function mntTeclaEscapeSubapartado(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

function abrirMantencionSubapartado(id) {
  // C2P-4C: 'prevencionista' YA NO es un subapartado de Mantención General
  // (ni siquiera como shortcut). No hay ninguna derivación a otro módulo:
  // las tarjetas de este módulo solo abren subapartados reales de
  // MNT_SUBAPARTADOS.

  const meta = MNT_SUBAPARTADOS.find(s => s.id === id);
  if (!meta) return;

  mantencionSubapartado = id;
  // Al abrir un subapartado nunca arrancamos en la ficha de un elemento.
  mantencionElementoSeleccionado = null;
  // Fase 2.2: al abrir Inventario / Bodegas nunca se arranca en una ficha
  // previa; los filtros ya vienen en cero desde cerrarMantencionSubapartado.
  mantencionInventarioSeleccionado = null;
  // Fase 2.3: al abrir Baños nunca se arranca en la ficha de un baño previo.
  mantencionBanoSeleccionado = null;
  // Fase 2.4: al abrir Pilas y Controles nunca se arranca en la ficha de un
  // control previo; los filtros ya vienen en cero desde
  // cerrarMantencionSubapartado.
  mantencionPilaSeleccionada = null;
  // Fase 2.5: al abrir TV Habitaciones nunca se arranca en la ficha de un
  // televisor previo; los filtros ya vienen en cero desde
  // cerrarMantencionSubapartado.
  mantencionTelevisorSeleccionado = null;
  // Fase 2.6: al abrir Puertas / Engrase nunca se arranca en la ficha de un
  // registro previo; los filtros ya vienen en cero desde
  // cerrarMantencionSubapartado.
  mantencionEngraseSeleccionado = null;
  // Fase 2.7: al abrir Fosas y Alcantarillado nunca se arranca en la ficha
  // de una fosa previa; los filtros ya vienen en cero desde
  // cerrarMantencionSubapartado.
  mantencionFosaSeleccionada = null;
  // Fase 2.8: al abrir Guía Preventiva nunca se arranca con una búsqueda
  // previa ni con acordeones heredados: la primera sección se despliega al
  // construir el panel. Solo estado local; NO se consulta Supabase.
  mntResetGuia();

  // Fase 2.9: al abrir Jardinería nunca se arranca en un sector ni en un
  // trabajo previo; los filtros ya vienen en cero desde
  // cerrarMantencionSubapartado. Solo estado local; NO se consulta Supabase.
  mntResetJardineria();

  let modal = document.getElementById(MNT_MODAL_SUBAPARTADO_ID);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = MNT_MODAL_SUBAPARTADO_ID;
    // Adjunta al body para quedar por encima de toda la SPA.
    document.body.appendChild(modal);
  }

  modal.innerHTML = mntModalSubapartadoHTML(meta);

  // Escape y clic en el overlay cierran la modal.
  document.addEventListener('keydown', mntTeclaEscapeSubapartado);
  const overlay = document.getElementById('mnt-modal-subapartado-overlay');
  if (overlay) {
    overlay.addEventListener('click', function (ev) {
      // UX-02: fondo sin cierre.
    });
  }

  // Bloquea el scroll del fondo mientras la modal está abierta.
  document.body.style.overflow = 'hidden';

  // Carga el contenido del subapartado dentro de la modal.
  cargarPanelSubapartado(id);
}

function cerrarMantencionSubapartado() {
  // C2C-2C: si quedara abierta la modal de revisión del televisor, se cierra
  // junto con la modal del subapartado (nunca queda huérfana).
  // C2C-2C.1: esto es solo visual; NO libera mntRevisionTVGuardando si hay
  // una RPC en vuelo (el guard lo libera la RPC al terminar).
  cerrarModalRevisionTV();
  // C2D-3D2: mismo criterio para la modal de ANULACIÓN de revisión del TV
  // (ns propio): se oculta junto con la modal del subapartado y NO libera
  // mntAnulacionRevisionTVGuardando si hay una RPC en vuelo.
  cerrarModalAnulacionRevisionTV();
  // C2D-2D2B-2: mismo criterio para la modal de revisión del CONTROL (ns
  // propio): se oculta junto con la modal del subapartado y NO libera
  // mntRevisionControlGuardando si hay una RPC en vuelo.
  cerrarModalRevisionControl();
  // C2D-2E5B: mismo criterio para la modal de ANULACIÓN de revisión (ns
  // propio): se oculta junto con la modal del subapartado y NO libera
  // mntAnulacionRevisionControlGuardando si hay una RPC en vuelo.
  cerrarModalAnulacionRevisionControl();
  // C2D-2F1: mismo criterio para la modal de CAMBIO DE PILAS (ns propio):
  // se oculta junto con la modal del subapartado y NO libera
  // mntCambioPilasControlGuardando si hay una RPC en vuelo.
  cerrarModalCambioPilasControl();
  // C2D-2F2: mismo criterio para la modal de ANULACIÓN de un registro de
  // cambio de pilas (ns propio): se oculta junto con la modal del
  // subapartado y NO libera mntAnulacionCambioPilasControlGuardando si hay
  // una RPC en vuelo.
  cerrarModalAnularCambioPilasControl();
  // C2E-6: mismo criterio para la modal de REGISTRO de engrase/aceitado
  // (ns propio): se oculta junto con la modal del subapartado y NO libera
  // mntRegistroEngraseGuardando si hay una RPC en vuelo.
  cerrarModalRegistroEngrase();
  // C2E-6: mismo criterio para la modal de ANULACIÓN de una actividad de
  // engrase (ns propio): se oculta junto con la modal del subapartado y NO
  // libera mntAnulacionEngraseGuardando si hay una RPC en vuelo.
  cerrarModalAnularEngrase();
  // C2G-6: mismo criterio para la modal de ADMINISTRACIÓN de Guía Preventiva
  // (ns propio): se oculta junto con la modal del subapartado y NO libera
  // mntGuiaAdminGuardando si hay una RPC en vuelo.
  cerrarModalAdminGuia();
  // C2P-4C: la Carta Gantt de Prevencionista vive en el módulo principal
  // (js/views/prevencionista.js) con su propio ns/overlay; aquí ya no
  // queda nada que cerrar (incluso el shortcut fue retirado).

  mntCerrarModalSubapartado();
  mantencionSubapartado = null;
  // Limpia cualquier estado de ficha de elemento al cerrar.
  mantencionElementoSeleccionado = null;
  // Reset de filtros de Elementos e Historial al cerrar COMPLETAMENTE la
  // modal (X, Cerrar, Escape u overlay): la próxima apertura parte con
  // búsqueda vacía, "Todas las ubicaciones" y "Todos los grupos".
  // Solo se limpia el estado local; NO se consulta Supabase (la caché del
  // service, getElementos() y mntElementosBase se conservan intactos).
  mntResetFiltrosElementos();
  // Mismo criterio para Inventario / Bodegas (Fase 2.2): al cerrar la modal
  // (X, Cerrar, Escape u overlay) se limpia la ficha abierta y los filtros
  // vuelven a texto/ubicación/responsable vacíos. Solo estado local; NO se
  // consulta Supabase ni se toca _inventariosCache. La próxima apertura
  // parte con "X de 29 registros" y las opciones en "Todos...".
  mantencionInventarioSeleccionado = null;
  mntResetFiltrosInventario();
  mntBodSolicitud++;
  mntBodEstado = null;
  mntBodCerrarFormulario(true);
  // Mismo criterio para Baños (Fase 2.3): al cerrar la modal por completo
  // se limpia la ficha abierta y los filtros vuelven a texto/grupo/historial
  // vacíos. Solo estado local; NO se consulta Supabase ni se toca
  // _banosCache / _mantencionesCache. La próxima apertura parte con
  // "X de 32 baños", búsqueda vacía, todos los grupos y todos los historiales.
  mantencionBanoSeleccionado = null;
  mntBanosOperativasSolicitud++;
  mntBanosOperativasEstado = null;
  mntLimpiarContextoOperativas('banos');
  mntResetFiltrosBanos();
  // Mismo criterio para Pilas y Controles (Fase 2.4): al cerrar la modal por
  // completo se limpia la ficha abierta y los filtros vuelven a
  // texto/tipo/relación vacíos. Solo estado local; NO se consulta Supabase ni
  // se toca _pilasCache / _televisoresCache / _elementosCache. La próxima
  // apertura parte con "X de 56 controles", búsqueda vacía, todos los tipos
  // y todas las relaciones.
  mantencionPilaSeleccionada = null;
  mntResetFiltrosPilas();
  // Mismo criterio para TV Habitaciones (Fase 2.5): al cerrar la modal por
  // completo se limpia la ficha abierta y los filtros vuelven a
  // texto/marca/controlTv/controlDeco vacíos. Solo estado local; NO se
  // consulta Supabase ni se toca _televisoresCache / _elementosCache. La
  // próxima apertura parte con "X de 28 televisores" (total real), búsqueda
  // vacía y todos los filtros en "Todos".
  mantencionTelevisorSeleccionado = null;
  mntResetFiltrosTV();
  // Mismo criterio para Puertas / Engrase (Fase 2.6): al cerrar la modal por
  // completo se limpia la ficha abierta y los filtros vuelven a
  // texto/responsable/fecha vacíos. Solo estado local; NO se consulta
  // Supabase ni se toca _engraseCache / _elementosCache. La próxima apertura
  // parte con "X de Y registros" (total real), búsqueda vacía, todos los
  // responsables y todas las fechas.
  mantencionEngraseSeleccionado = null;
  mntResetFiltrosEngrase();
  // Mismo criterio para Fosas y Alcantarillado (Fase 2.7): al cerrar la
  // modal por completo se limpia la ficha abierta y los filtros vuelven a
  // texto/categoría/historial vacíos. Solo estado local; NO se consulta
  // Supabase ni se toca _fosasCache / _elementosCache. La próxima apertura
  // parte con "X de Y elementos" (total real) y todos los filtros en
  // "Todos".
  mantencionFosaSeleccionada = null;
  mntResetFiltrosFosas();
  // Mismo criterio para Guía Preventiva (Fase 2.8): al cerrar la modal por
  // completo (X, Cerrar, Escape u overlay) se limpia la búsqueda y el estado
  // de los acordeones (vuelve a null ⇒ la próxima apertura despliega SOLO la
  // primera sección). Solo estado local; NO se consulta Supabase ni se toca
  // _guiasCache. La próxima apertura parte con el buscador vacío.
  // Mismo criterio para Jardinería (Fase 2.9): al cerrar la modal por
  // completo (X, Cerrar, Escape u overlay) se limpia el sector y el trabajo
  // seleccionados y los filtros vuelven a texto/prioridad/temporada/título
  // vacíos. Solo estado local; NO se consulta Supabase ni se toca
  // _jardineriaCache: la próxima apertura parte con las tarjetas de los
  // sectores y la búsqueda vacía.
  mntResetJardineria();
}

function mntCerrarModalSubapartado() {
  const modal = document.getElementById(MNT_MODAL_SUBAPARTADO_ID);
  if (modal) modal.remove();

  document.removeEventListener('keydown', mntTeclaEscapeSubapartado);
  document.body.style.overflow = '';
}

// Estructura de la modal de subapartado: overlay + caja grande centrada,
// título = nombre real del subapartado, scroll interno y cierre visible.
// NOTA C2P-4C: la Carta Gantt de Prevencionista NO vive dentro de esta
// modal: es parte del módulo principal js/views/prevencionista.js (modal
// propia, mismo formato estándar de GanttCarta). Este módulo ya no tiene
// tarjeta ni acceso aquí; el ancho habitual se conserva por si otro
// subapartado reutiliza esta estructura.
function mntModalSubapartadoHTML(meta) {
  return `
    <div id="mnt-modal-subapartado-overlay"
      class="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
      style="background-color: rgba(15, 23, 42, 0.6); backdrop-filter: blur(2px);">
      <div class="relative w-[92vw] sm:w-[90vw] lg:w-[86vw] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl my-2 sm:my-4 flex flex-col"
        style="max-width: 1280px; max-height: 90vh;" role="dialog" aria-modal="true" aria-label="${mntEsc(meta.nombre)}">

        <!-- CABECERA: título real del subapartado + X -->
        <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div class="flex items-center space-x-3 min-w-0">
            <span class="text-2xl shrink-0">${meta.icono}</span>
            <div class="min-w-0">
              <h3 class="text-base font-black text-slate-900 dark:text-white truncate">${mntEsc(meta.nombre)}</h3>
            </div>
          </div>
          <button onclick="cerrarMantencionSubapartado()" title="Cerrar (Esc)"
            class="shrink-0 w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-rose-100 dark:hover:bg-rose-950/60 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center text-xl font-bold transition-colors">
            &times;
          </button>
        </div>

        <!-- CONTENIDO CON SCROLL INTERNO -->
        <div id="mnt-modal-subapartado-body" class="flex-1 min-h-0 ${meta.id === 'ubicaciones' ? 'mnt-ubicaciones-body' : 'p-4 sm:p-5 overflow-y-auto'}">
          <div class="flex flex-col items-center justify-center py-12 space-y-3">
            <span class="animate-spin text-3xl text-blue-600">⏳</span>
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Cargando subapartado…</span>
          </div>
        </div>

        <!-- PIE CON BOTÓN VISIBLE DE CIERRE -->
        <div class="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
          <button onclick="cerrarMantencionSubapartado()"
            class="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  `;
}

// Carga el contenido del subapartado dentro del cuerpo de la modal.
async function cargarPanelSubapartado(id) {
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;

  const cargador = MNT_CARGADORES_SUBAPARTADO[id];
  if (!cargador) {
    panel.innerHTML = getMantencionesErrorHTML();
    return;
  }

  try {
    const datos = await cargador();
    panel.innerHTML = getPanelSubapartadoHTML(id, datos);

    // Elementos e Historial: si hay una ficha abierta, cargarla dentro de la modal.
    if (id === 'elementos' && mantencionElementoSeleccionado) {
      mntCargarFichaElemento(mantencionElementoSeleccionado);
    }

    // C2D-1B — TV Habitaciones: si la ficha de un televisor quedó abierta
    // al redibujar el panel (p. ej. "Limpiar filtros"), el historial del
    // estado del televisor se carga después del render síncrono de la ficha.
    if (id === 'tv' && mantencionTelevisorSeleccionado) {
      const tvAbierto = mntTelevisoresBase.find(t => t && t.id === mantencionTelevisorSeleccionado) || null;
      if (tvAbierto) mntCargarHistorialEstadoTV(tvAbierto);
    }

    // C2D-3A — TV Habitaciones: los datos recién llegaron de Supabase (tras
    // una revisión exitosa _televisoresCache quedó invalidada, así que este
    // cargador siempre relee), por lo que AQUÍ se levanta el bloqueo de
    // reintento de una revisión cuyo refresco había fallado: la ficha ya
    // mostrará el estado real y una nueva revisión sí sería legítima. Es el
    // "Cierra y vuelve a abrir TV Habitaciones" del aviso. NO se limpia al
    // cerrar la modal ni si una lectura posterior fallara (este punto se
    // alcanza SOLO tras una lectura y render exitosos).
    if (id === 'tv') mntRevisionTVPendienteRefresco = null;

    // C2D-3D2 — mismo criterio para la ANULACIÓN de revisión del TV: los
    // datos de TV Habitaciones acaban de releerse desde Supabase (tras
    // anular, la service invalidó su caché), por lo que AQUÍ se levanta el
    // bloqueo de reintento de una anulación cuyo refresco había fallado.
    // NO se limpia al cerrar la modal ni si una lectura posterior fallara
    // (este punto se alcanza SOLO tras una lectura y render exitosos).
    if (id === 'tv') mntAnulacionRevisionTVPendienteRefresco = null;

    // C2D-2D2B-2.2 — Pilas y Controles: los datos recién llegaron de
    // Supabase (tras una revisión exitosa _pilasCache quedó invalidada, así
    // que este cargador siempre relee), por lo que AQUÍ se levanta el
    // bloqueo de reintento de una revisión cuyo refresco había fallado: la
    // ficha ya mostrará el estado real y una nueva revisión sí sería
    // legítima. Es el "Cierra y vuelve a abrir Pilas y Controles" del aviso.
    if (id === 'pilas') mntRevisionControlPendienteRefresco = null;

    // C2D-2E5B — mismo criterio para la ANULACIÓN de revisión: los datos de
    // Pilas/Controles acaban de releerse desde Supabase (tras anular, la
    // service invalidó su caché), por lo que AQUÍ se levanta el bloqueo de
    // reintento de una anulación cuyo refresco había fallado. NO se limpia
    // al cerrar la modal ni si una lectura posterior fallara (este punto se
    // alcanza SOLO tras una lectura y render exitosos).
    if (id === 'pilas') mntAnulacionRevisionControlPendienteRefresco = null;

    // C2D-2D2B-1 — Pilas y Controles: mismo criterio; si la ficha de un
    // control quedó abierta al redibujar el panel, sus dos historiales se
    // cargan después del render síncrono (solo lectura).
    if (id === 'pilas' && mantencionPilaSeleccionada) {
      const controlAbierto = mntPilasBase.find(p => p && p.id === mantencionPilaSeleccionada) || null;
      if (controlAbierto) mntCargarHistorialesControl(controlAbierto);
    }
  } catch (e) {
    console.error(`Error cargando subapartado ${id}:`, e);
    panel.innerHTML = getMantencionesErrorHTML();
  }
}

function mntBuscarUbicacionesHotel(control) {
  const panel = control.closest('[data-ubicaciones-hotel]');
  const consulta = mntNormalizarBusquedaUbicacion(panel.querySelector('[data-ubicaciones-busqueda]').value.trim());
  const tipo = panel.querySelector('[data-ubicaciones-filtro]').value;
  let visibles = 0;
  panel.dataset.busquedaActiva = String(Boolean(consulta));
  panel.querySelector('[data-ubicaciones-volver]').hidden = !tipo || Boolean(consulta);
  for (const tarjeta of panel.querySelectorAll('[data-ubicaciones-categoria]')) {
    tarjeta.setAttribute('aria-pressed', String(tarjeta.dataset.ubicacionesCategoria === tipo));
  }
  for (const grupo of panel.querySelectorAll('[data-ubicaciones-grupo]')) {
    let coincidencias = 0;
    for (const fila of grupo.querySelectorAll('[data-ubicacion-nombre]')) {
      fila.hidden = !mntNormalizarBusquedaUbicacion(fila.dataset.ubicacionNombre).includes(consulta);
      if (!fila.hidden) coincidencias++;
    }
    const coincide = !tipo || tipo === grupo.dataset.ubicacionesGrupo;
    grupo.hidden = !coincide || coincidencias === 0 || (!consulta && !tipo);
    if (coincide) visibles += coincidencias;
  }
  panel.querySelector('[data-ubicaciones-resultados]').textContent = 'Resultados: ' + visibles;
  panel.querySelector('[data-ubicaciones-vacio]').hidden = visibles !== 0;
}

function mntElegirCategoriaUbicaciones(boton) {
  const panel = boton.closest('[data-ubicaciones-hotel]');
  const tipo = boton.dataset.ubicacionesCategoria ?? '';
  const filtro = panel.querySelector('[data-ubicaciones-filtro]');
  const anterior = filtro.value;
  filtro.value = tipo;
  mntBuscarUbicacionesHotel(boton);
  if (tipo) {
    panel.querySelector('#mnt-ubicacion-' + tipo)?.focus();
  } else {
    const tarjeta = panel.querySelector('[data-ubicaciones-categoria="' + anterior + '"]');
    (tarjeta || filtro).focus();
  }
}

function mntAlternarGrupoUbicaciones(boton) {
  const grupo = boton.closest('[data-ubicaciones-grupo]');
  const expandido = grupo.dataset.expandido !== 'true';
  grupo.dataset.expandido = String(expandido);
  boton.setAttribute('aria-expanded', String(expandido));
  boton.textContent = expandido ? 'Ver menos' : 'Ver más (' + boton.dataset.adicionales + ')';
}

function mntNormalizarBusquedaUbicacion(texto) {
  return texto.toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '');
}

const MNT_TIPOS_UBICACION = [
  ['BODEGA', 'Bodega'], ['CABAÑA', 'Cabaña'], ['CASA', 'Casa'], ['COCINA', 'Cocina'],
  ['HABITACION', 'Habitación'], ['Hotel', 'Hotel'], ['OFICINA', 'Oficina'],
  ['PASILLO', 'Pasillo'], ['SALON', 'Salón'], ['SECTOR', 'Sector']
];

const MNT_ERRORES_ALTA_UBICACION = {
  UBICACION_GESTION_NO_AUTORIZADA: 'Tu permiso administrativo no está vigente.',
  UBICACION_NOMBRE_INVALIDO: 'Ingresa un nombre válido para la ubicación.',
  UBICACION_TIPO_INVALIDO: 'Selecciona un tipo de ubicación válido.',
  UBICACION_YA_EXISTE: 'Ya existe una ubicación con ese nombre según el catálogo.'
};

function mntAbrirAltaUbicacion(origen) {
  const bodega = origen === 'inventario';
  const vista = bodega ? 'inventario' : 'mantenciones';
  const actor = state.currentUser?.id;
  const vigente = () => actor && state.currentUser?.id === actor && currentView === vista &&
    hasAccess(vista, state.currentUser?.role) && window.esAdminOperativoActual?.() &&
    (bodega || mantencionSubapartado === 'ubicaciones');
  if ((!bodega && origen !== 'ubicaciones') || !vigente() ||
      document.getElementById('mnt-alta-ubicacion')) return;

  const dialogo = document.createElement('dialog');
  dialogo.id = 'mnt-alta-ubicacion';
  dialogo.className = 'alm-ui alm-panel rounded-2xl p-5';
  dialogo.setAttribute('aria-labelledby', 'mnt-alta-ubicacion-titulo');
  dialogo.style.cssText = 'width:min(92vw,36rem);max-height:85vh;margin:auto';
  const campo = 'mnt-gestion-tv-campo block w-full px-3 py-2';
  dialogo.innerHTML = `<form class="space-y-4">
    <h2 class="alm-title" id="mnt-alta-ubicacion-titulo">${bodega ? 'Agregar bodega' : 'Agregar ubicación'}</h2>
    <label class="block">Nombre de la ubicación<input class="${campo}" name="nombre" required></label>
    ${bodega
      ? `<label class="block">Tipo<input class="${campo}" value="BODEGA" readonly></label>`
      : `<label class="block">Tipo<select class="${campo}" name="tipo" required>${MNT_TIPOS_UBICACION.map(([valor, etiqueta]) => `<option value="${valor}">${etiqueta}</option>`).join('')}</select></label>`}
    <p class="alm-muted text-sm" role="status"></p>
    <div class="flex flex-wrap gap-2">
      <button type="button" data-cerrar class="alm-btn-secondary px-4 py-2">Cancelar</button>
      <button type="submit" class="alm-btn-primary px-4 py-2">Guardar</button>
      <button type="button" data-consultar hidden class="alm-btn-secondary px-4 py-2">Consultar catálogo</button>
    </div>
  </form>`;
  const form = dialogo.querySelector('form');
  const mensaje = form.querySelector('[role="status"]');
  const guardar = form.querySelector('[type="submit"]');
  const consultar = form.querySelector('[data-consultar]');
  const cerrar = form.querySelector('[data-cerrar]');
  const servicio = window.MantencionesService;
  const clave = 'hotel.ubicaciones.alta.pendiente.' + actor;
  let pendiente = null, ocupada = false, confirmada = false, almacenamientoDisponible = true;
  try {
    pendiente = JSON.parse(sessionStorage.getItem(clave));
  } catch {
    almacenamientoDisponible = false;
    mensaje.textContent = 'No se pudo consultar el estado local del alta. El guardado queda bloqueado.';
  }

  function actualizarBotones() {
    guardar.disabled = ocupada || confirmada || Boolean(pendiente) || !almacenamientoDisponible;
    form.elements.nombre.disabled = guardar.disabled;
    if (!bodega) form.elements.tipo.disabled = guardar.disabled;
    consultar.hidden = !pendiente;
    consultar.disabled = ocupada || confirmada;
    cerrar.disabled = ocupada;
  }

  async function refrescar(fila) {
    servicio.invalidarCatalogoUbicaciones(fila.tipo);
    if (!vigente() || !dialogo.open) return;
    if (bodega) await invCargarBodegas(true);
    else await cargarPanelSubapartado('ubicaciones');
  }

  async function reconciliar() {
    try {
      const normalizar = nombre => nombre.trim().normalize('NFC').toLocaleLowerCase('es');
      const ubicaciones = await servicio.getUbicacionesTV(true);
      if (!vigente() || !dialogo.open) return;
      const coincidencias = ubicaciones.filter(u => u.tipo === pendiente.tipo &&
        normalizar(u.nombre) === normalizar(pendiente.nombre));
      if (coincidencias.length !== 1) {
        mensaje.textContent = 'El resultado sigue sin confirmarse en el catálogo. No se repetirá el alta.';
        return;
      }
      sessionStorage.removeItem(clave);
      pendiente = null;
      confirmada = true;
      mensaje.textContent = 'La ubicación ya está en el catálogo. No se volvió a enviar el alta.';
      await refrescar(coincidencias[0]);
    } catch {
      mensaje.textContent = confirmada
        ? 'La ubicación está registrada. Vuelve a abrir el listado para actualizarlo.'
        : 'No se pudo verificar el resultado. Consulta el catálogo nuevamente.';
    }
  }

  if (pendiente) mensaje.textContent = 'Hay un alta sin confirmar. Consulta el catálogo antes de continuar.';
  actualizarBotones();
  cerrar.onclick = () => dialogo.close();
  consultar.onclick = async () => {
    if (ocupada || !pendiente || !vigente()) return;
    ocupada = true;
    actualizarBotones();
    try { await reconciliar(); }
    finally { ocupada = false; actualizarBotones(); }
  };
  form.onsubmit = async evento => {
    evento.preventDefault();
    if (guardar.disabled || ocupada || !vigente() || !dialogo.open) return;
    const nombre = form.elements.nombre.value.trim();
    const tipo = bodega ? 'BODEGA' : form.elements.tipo.value;
    if (!nombre) {
      mensaje.textContent = MNT_ERRORES_ALTA_UBICACION.UBICACION_NOMBRE_INVALIDO;
      form.elements.nombre.focus();
      return;
    }
    if (!MNT_TIPOS_UBICACION.some(([valor]) => valor === tipo)) {
      mensaje.textContent = MNT_ERRORES_ALTA_UBICACION.UBICACION_TIPO_INVALIDO;
      return;
    }
    ocupada = true;
    actualizarBotones();
    mensaje.textContent = 'Guardando…';
    try {
      try {
        sessionStorage.setItem(clave, JSON.stringify({ nombre, tipo }));
        pendiente = { nombre, tipo };
      } catch {
        almacenamientoDisponible = false;
        mensaje.textContent = 'No se pudo conservar la referencia. El alta no se envió.';
        return;
      }
      let fila;
      try {
        fila = await servicio.crearUbicacion(nombre, tipo);
      } catch (error) {
        const codigo = [error?.message, error?.code].find(valor => Object.hasOwn(MNT_ERRORES_ALTA_UBICACION, valor));
        if (codigo) {
          sessionStorage.removeItem(clave);
          pendiente = null;
          mensaje.textContent = MNT_ERRORES_ALTA_UBICACION[codigo];
        } else {
          await reconciliar();
        }
        return;
      }
      confirmada = true;
      mensaje.textContent = 'Ubicación guardada correctamente.';
      sessionStorage.removeItem(clave);
      pendiente = null;
      await refrescar(fila);
      if (vigente() && dialogo.open) dialogo.close();
    } catch {
      mensaje.textContent = confirmada
        ? 'Ubicación guardada. Vuelve a abrir el listado para actualizarlo.'
        : 'No se pudo confirmar el alta. Consulta el catálogo antes de continuar.';
    } finally {
      ocupada = false;
      actualizarBotones();
    }
  };
  dialogo.addEventListener('cancel', evento => evento.preventDefault());
  dialogo.addEventListener('close', () => dialogo.remove(), { once: true });
  document.body.append(dialogo);
  dialogo.showModal();
}

function mntPanelUbicacionesHotelHTML(ubicaciones) {
  const orden = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
  const etiquetas = {
    BODEGA: ['Bodegas', '📦'], 'CABAÑA': ['Cabañas', '🏡'], CASA: ['Casas', '🏠'], COCINA: ['Cocinas', '🍽️'],
    HABITACION: ['Habitaciones', '🛏️'], Hotel: ['Hotel', '🏨'], OFICINA: ['Oficinas', '🗄️'], PASILLO: ['Pasillos', '🚪'],
    SALON: ['Salones', '🪑'], SECTOR: ['Sectores', '📍']
  };
  const porTipo = new Map();
  for (const ubicacion of ubicaciones) {
    const tipo = ubicacion.tipo ?? null;
    if (!porTipo.has(tipo)) porTipo.set(tipo, []);
    porTipo.get(tipo).push(ubicacion);
  }
  const grupos = [...porTipo].map(([tipo, filas]) => {
    const [etiqueta, icono] = Object.hasOwn(etiquetas, tipo) ? etiquetas[tipo] : [tipo ?? 'Sin tipo', '📍'];
    return { tipo, filas: filas.sort((a, b) => orden.compare(a.nombre, b.nombre)), etiqueta, icono };
  }).sort((a, b) => Number(a.tipo === null) - Number(b.tipo === null) || orden.compare(a.etiqueta, b.etiqueta));
  const limite = 6;
  const campo = 'block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2';
  return `<section class="alm-ui mnt-ubicaciones-panel" data-ubicaciones-hotel>
    <div class="mnt-ubicaciones-filtros space-y-3 border-b border-slate-200 dark:border-slate-700">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="alm-muted">${ubicaciones.length} ubicaciones registradas</p>
        ${window.esAdminOperativoActual?.() ? '<button type="button" onclick="mntAbrirAltaUbicacion(\'ubicaciones\')" class="alm-btn-primary px-4 py-2">Agregar ubicación</button>' : ''}
      </div>
      <div class="mnt-ubicaciones-controles">
        <label class="block text-sm font-bold">Buscar por nombre
          <input type="search" data-ubicaciones-busqueda oninput="mntBuscarUbicacionesHotel(this)" class="${campo}">
        </label>
        <label class="block text-sm font-bold">Tipo
          <select data-ubicaciones-filtro onchange="mntBuscarUbicacionesHotel(this)" class="${campo}">
            <option value="">Todas</option>
            ${grupos.map((grupo, i) => `<option value="tipo-${i}">${mntEsc(grupo.etiqueta)}</option>`).join('')}
          </select>
        </label>
      </div>
      <p data-ubicaciones-resultados class="alm-muted text-sm" role="status">Resultados: ${ubicaciones.length}</p>
    </div>
    <div class="mnt-ubicaciones-listado" role="region" aria-label="Listado de ubicaciones" tabindex="0">
      ${grupos.length ? `<ul class="mnt-ubicaciones-resumen" aria-label="Resumen por tipo">
        ${grupos.map((grupo, i) => `<li><button type="button" data-ubicaciones-categoria="tipo-${i}"
          aria-pressed="false" aria-controls="mnt-ubicacion-grupo-${i}" onclick="mntElegirCategoriaUbicaciones(this)">
          <span aria-hidden="true">${grupo.icono}</span><span>${mntEsc(grupo.etiqueta)}</span><strong>${grupo.filas.length}</strong>
        </button></li>`).join('')}
      </ul>` : ''}
      <button type="button" class="mnt-ubicaciones-mas" data-ubicaciones-volver hidden onclick="mntElegirCategoriaUbicaciones(this)">Volver a categorías</button>
      <div class="mnt-ubicaciones-grupos">
        ${grupos.map((grupo, i) => `<section class="mnt-ubicaciones-grupo" id="mnt-ubicacion-grupo-${i}" data-ubicaciones-grupo="tipo-${i}" aria-labelledby="mnt-ubicacion-tipo-${i}" hidden>
          <h4 id="mnt-ubicacion-tipo-${i}" tabindex="-1" class="mnt-ubicaciones-titulo">${mntEsc(grupo.etiqueta)} <span>${grupo.filas.length}</span></h4>
          <ul id="mnt-ubicacion-lista-${i}" class="mnt-ubicaciones-tarjetas">
            ${grupo.filas.map((u, indice) => `<li data-ubicacion-nombre="${mntEsc(u.nombre)}" ${indice >= limite ? 'data-ubicacion-adicional' : ''} class="mnt-ubicacion-tarjeta">
              <span class="mnt-ubicacion-icono" aria-hidden="true">${grupo.icono}</span>
              <div class="min-w-0"><p title="${mntEsc(u.nombre)}">${mntEsc(u.nombre)}</p>
              ${grupo.tipo === null ? '' : `<span class="mnt-ubicacion-tipo">${mntEsc(grupo.etiqueta)}</span>`}</div>
            </li>`).join('')}
          </ul>
          ${grupo.filas.length > limite ? `<button type="button" class="mnt-ubicaciones-mas" aria-controls="mnt-ubicacion-lista-${i}"
            aria-expanded="false" data-adicionales="${grupo.filas.length - limite}" onclick="mntAlternarGrupoUbicaciones(this)">Ver más (${grupo.filas.length - limite})</button>` : ''}
        </section>`).join('')}
      </div>
      <p data-ubicaciones-vacio ${ubicaciones.length ? 'hidden' : ''} class="alm-muted">No hay ubicaciones que mostrar.</p>
    </div>
  </section>`;
}

function getPanelSubapartadoHTML(id, datos) {
  if (id === 'ubicaciones') return mntPanelUbicacionesHotelHTML(datos);
  const meta = MNT_SUBAPARTADOS.find(s => s.id === id) || { nombre: id, icono: '📁', subapartado: false };

  // Catálogo General e Historial usa su propia vista de Fase 2.
  // C2E-2/3: datos es { elementos, mantenciones } del MISMO archivo de
  // origen (los dos métodos dedicados del service).
  if (id === 'elementos') {
    const elementos = (datos && Array.isArray(datos.elementos)) ? datos.elementos : [];
    const mantenciones = (datos && Array.isArray(datos.mantenciones)) ? datos.mantenciones : [];
    return mntPanelElementosHTML(meta, elementos, mantenciones);
  }

  // Inventario / Bodegas usa su propia vista de Fase 2.2.
  // La preview genérica de Fase 1 ya NO aparece para este subapartado.
  if (id === 'inventario') {
    return mntPanelInventarioHTML(meta, Array.isArray(datos) ? datos : []);
  }

  // Baños usa su propia vista de Fase 2.3. La preview genérica de Fase 1 ya
  // NO aparece para este subapartado. datos es { banos, mantenciones }.
  if (id === 'banos') {
    const listaBanos = (datos && Array.isArray(datos.banos)) ? datos.banos : [];
    const mantenciones = (datos && Array.isArray(datos.mantenciones)) ? datos.mantenciones : [];
    return mntPanelBanosHTML(meta, listaBanos, mantenciones);
  }

  // Pilas y Controles usa su propia vista de Fase 2.4. La preview genérica
  // de Fase 1 ya NO aparece para este subapartado. datos es
  // { pilas, televisores, elementos }.
  if (id === 'pilas') {
    const pilas = (datos && Array.isArray(datos.pilas)) ? datos.pilas : [];
    const televisores = (datos && Array.isArray(datos.televisores)) ? datos.televisores : [];
    const elementos = (datos && Array.isArray(datos.elementos)) ? datos.elementos : [];
    return mntPanelPilasHTML(meta, pilas, televisores, elementos);
  }

  // TV Habitaciones usa su propia vista de Fase 2.5. La preview genérica de
  // Fase 1 ya NO aparece para este subapartado. datos es
  // { televisores, elementos }.
  if (id === 'tv') {
    const televisores = (datos && Array.isArray(datos.televisores)) ? datos.televisores : [];
    const elementos = (datos && Array.isArray(datos.elementos)) ? datos.elementos : [];
    return mntPanelTelevisoresHTML(meta, televisores, elementos);
  }

  // Puertas / Engrase usa su propia vista de Fase 2.6. La preview genérica
  // de Fase 1 ya NO aparece para este subapartado. datos es
  // { engrase, elementos }.
  if (id === 'engrase') {
    const engrase = (datos && Array.isArray(datos.engrase)) ? datos.engrase : [];
    const elementos = (datos && Array.isArray(datos.elementos)) ? datos.elementos : [];
    return mntPanelEngraseHTML(meta, engrase, elementos);
  }

  // Fosas y Alcantarillado usa su propia vista de Fase 2.7. La preview
  // genérica de Fase 1 ya NO aparece para este subapartado. datos es
  // { fosas, contactos, fuente, comentarios, elementos }.
  if (id === 'fosas') {
    return mntPanelFosasHTML(meta, datos);
  }

  // Guía Preventiva usa su propia vista documental de Fase 2.8. La preview
  // genérica de Fase 1 (y su badge "Verificación Fase 1") ya NO aparece para
  // este subapartado. datos es { guias, secciones, items }.
  // NO hay listado → ficha: existe UNA sola guía y el documento completo
  // (encabezado + secciones en acordeón + ítems + origen) se muestra
  // directamente dentro de la MISMA modal. No se crea una segunda modal.
  if (id === 'guia') {
    return mntPanelGuiaHTML(meta, datos);
  }

  // Jardinería usa su propia vista de Fase 2.9. La preview genérica de
  // Fase 1 (y su badge "Verificación Fase 1") ya NO aparecen para este
  // subapartado. datos es { sectores, trabajos, riegoProgramacion,
  // riegoZonas, riegoNotas, laboresComplementarias }.
  if (id === 'jardineria') {
    return mntPanelJardineriaHTML(meta, datos);
  }

  // C2P-4C: 'prevencionista' NO llega aquí — ese módulo ya no forma parte
  // de MNT_SUBAPARTADOS. Se conserva la ausencia de caso propio para que,
  // ante cualquier intento futuro, caiga en la preview genérica en vez de
  // reabrir una interfaz que ya no existe dentro de Mantención General.

  // El resto de subapartados conserva exactamente la preview de Fase 1.

  let cuerpo = '';
  if (Array.isArray(datos)) {
    cuerpo = mntSeccionHTML('Registros', datos);
  } else if (datos && typeof datos === 'object') {
    cuerpo = Object.keys(datos)
      .map(k => mntSeccionHTML(MNT_ETIQUETAS_SECCION[k] || k, datos[k]))
      .join('');
  }

  return `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center space-x-3">
          <span class="text-2xl">${meta.icono}</span>
          <div>
            <h3 class="text-lg font-black text-slate-900 dark:text-white">${mntEsc(meta.nombre)}</h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">
              ${meta.subapartado ? 'Subapartado de Mantención General' : 'Sección de Mantención General'}
            </p>
          </div>
        </div>
        <span class="text-xs font-bold text-purple-700 bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-900 px-3 py-1.5 rounded-xl">
          Verificación Fase 1
        </span>
      </div>
      ${cuerpo}
      <p class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
        Fase 2: vista completa del subapartado con fichas, filtros y detalle de registros.
      </p>
    </div>
  `;
}

function mntSeccionHTML(titulo, registros) {
  const lista = Array.isArray(registros) ? registros : [];
  return `
    <div class="mt-5">
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">${mntEsc(titulo)}</h4>
        <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">${lista.length} registro(s) cargado(s)</span>
      </div>
      ${mntPreviewHTML(lista)}
    </div>
  `;
}

// Vista previa genérica: comprueba que los datos reales llegan desde Supabase.
function mntPreviewHTML(lista, limite = 5) {
  if (!Array.isArray(lista) || lista.length === 0) {
    return `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
        Sin dato registrado
      </div>
    `;
  }

  const muestra = lista.slice(0, limite);
  const columnas = Object.keys(muestra[0])
    .filter(k => muestra[0][k] === null || typeof muestra[0][k] !== 'object')
    .slice(0, 6);

  return `
    <div class="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 uppercase">
            ${columnas.map(c => `<th class="px-3 py-2 font-bold">${mntEsc(c)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${muestra.map(r => `
            <tr class="border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200">
              ${columnas.map(c => `<td class="px-3 py-2">${mntValorCelda(c, r[c])}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${lista.length > limite ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Mostrando ${limite} de ${lista.length} registros.</p>` : ''}
  `;
}

// ==========================================================
// CATÁLOGO GENERAL E HISTORIAL — FASE 2 (C2E-2/3)
// ==========================================================
// Vista propia del subapartado 'elementos'.
//
// Alcance APROBADO en C2E-2: SOLO elementos con
// archivo_origen = 'LISTA DE MANTENCIONES.xlsx' (114 reales:
// LUGAR 15 / MAQUINAS 48 / RADIADORES 32 / REFRIGERADOR 19).
// El filtrado ocurre EN SUPABASE (getElementosGenerales), nunca solo
// visual: así NINGÚN elemento de Pilas, TV, Engrase, Fosas o Baños
// (subáreas CERRADAS con vista propia) puede aparecer duplicado aquí.
//
// Categoría REAL: hoja_origen (LUGAR / MAQUINAS / RADIADORES /
// REFRIGERADOR). NO existe columna categoría en la base: solo cambia la
// etiqueta visible.
//
// Historial: public.mantenciones vía mantenciones.elemento_id
// (getMantencionesGenerales: 174 registros del mismo archivo de origen).
//
// Convenciones de datos:
// - Supabase es la fuente de verdad.
// - NULL texto → "Sin dato registrado"; NULL fecha → "Sin fecha registrada";
//   NULL responsable → "Sin responsable registrado".
// - NULL de costo NUNCA se convierte en 0.
// - No se inventan estados, responsables ni fechas.
// - No se muestran UUIDs al usuario; se usa ubicaciones.nombre vía relación
//   FK embebida, con fallback a ubicacion_original (dato real, no inventado).
// - Solo lectura: sin crear, editar, eliminar, revisar ni anular.

// Copia del array real recibido, para filtrar en cliente sin volver a Supabase.
// (mntMantencionesGeneralesBase se declara junto al estado local del módulo.)
let mntElementosBase = [];

// Resumen de historial por elemento ({ [id]: { cantidad, ultimaFecha } }),
// derivado del historial cargado. Se recalcula al pintar el panel.
let mntResumenHistorialElementos = Object.create(null);

// Etiquetas amigables de categoría. El valor REAL es hoja_origen; aquí solo
// se cambia la presentación. Fuera del mapeo se muestra el valor original.
const MNT_ETIQUETAS_CATEGORIA = {
  lugar: 'Lugar',
  maquinas: 'Máquinas',
  radiadores: 'Radiadores',
  refrigerador: 'Refrigerador'
};

// Orden preferente de las categorías conocidas del catálogo.
const MNT_ORDEN_CATEGORIAS = ['lugar', 'maquinas', 'radiadores', 'refrigerador'];

function mntClaveCategoria(valor) {
  return (valor === null || valor === undefined) ? '' : String(valor).trim().toLowerCase();
}

function mntEtiquetaCategoria(valor) {
  const clave = mntClaveCategoria(valor);
  if (!clave) return 'Sin categoría registrada';
  return MNT_ETIQUETAS_CATEGORIA[clave] || String(valor);
}

// Ubicación canónica desde la relación embebida ubicaciones(nombre).
// Si no existe, cae a ubicacion_original (dato real). Nunca expone el UUID.
function mntNombreUbicacion(e) {
  if (!e) return null;
  const u = e.ubicacion;
  if (u && typeof u === 'object' && !Array.isArray(u) && u.nombre) return u.nombre;
  if (Array.isArray(u) && u.length > 0 && u[0] && u[0].nombre) return u[0].nombre;
  return e.ubicacion_original ? e.ubicacion_original : null;
}

// Primer valor no vacío entre varios campos (para código / nemotécnico).
function mntPrimerValor() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return null;
}

// Contexto/origen mostrado en la tarjeta: grupo_origen si tiene valor real;
// si está vacío, hoja_origen; si ambos vacíos, null (no se muestra etiqueta).
// Muestra el valor tal cual, sin interpretarlo.
function mntContextoOrigen(e) {
  if (!e) return null;
  if (e.grupo_origen !== null && e.grupo_origen !== undefined && e.grupo_origen !== '') {
    return String(e.grupo_origen);
  }
  if (e.hoja_origen !== null && e.hoja_origen !== undefined && e.hoja_origen !== '') {
    return String(e.hoja_origen);
  }
  return null;
}

// Etiqueta de presentación para el campo elementos_mantenibles.codigo,
// según el Excel de origen (archivo_origen + hoja_origen).
// Mapeo CONFIRMADO con los scripts reales de migración. NO se reinterpretan
// los valores; solo cambia la etiqueta visible. Fuera del mapeo → "Código".
const MNT_ETIQUETAS_CODIGO = {
  '_lista fosas de alcantarillados.xlsx|hoja1': 'N.º original',
  'lista de mantenciones.xlsx|lugar': 'N.º original',
  'lista de mantenciones.xlsx|maquinas': 'N.º original',
  'lista de mantenciones.xlsx|radiadores': 'N.º original',
  'lista de mantenciones.xlsx|refrigerador': 'N.º original',
  'lista de puertas por engrasar y aceitar.xlsx|hoja1': 'N.º original',
  'lista de puertas por engrasar y aceitar.xlsx|hoja2': 'N.º original',
  'mantencion de baños.xlsx|hoja1': 'HAB (origen)',
  'mantencion de pilas.xlsx|hoja1': 'HAB (origen)',
  'tv-habitaciones.xlsx|hoja1': 'Habitación'
};

function mntEtiquetaCodigo(e) {
  if (!e) return 'Código';
  const archivo = (e.archivo_origen === null || e.archivo_origen === undefined) ? '' : String(e.archivo_origen).trim().toLowerCase();
  const hoja = (e.hoja_origen === null || e.hoja_origen === undefined) ? '' : String(e.hoja_origen).trim().toLowerCase();
  return MNT_ETIQUETAS_CODIGO[`${archivo}|${hoja}`] || 'Código';
}

// ------------------------------------------------------------
// Resumen de historial por elemento (derivado, sin consultas extra)
// ------------------------------------------------------------
// Construye { [elementoId]: { cantidad, ultimaFecha } } a partir del
// historial DEDICADO ya cargado. NUNCA se inventa fecha: si no existe
// fecha_realizacion, ultimaFecha queda null.
function mntResumenHistorialPorElemento(mantenciones) {
  const mapa = Object.create(null);
  (Array.isArray(mantenciones) ? mantenciones : []).forEach(m => {
    if (!m || m.elemento_id === null || m.elemento_id === undefined) return;
    if (!mapa[m.elemento_id]) mapa[m.elemento_id] = { cantidad: 0, ultimaFecha: null };
    const reg = mapa[m.elemento_id];
    reg.cantidad += 1;
    const f = (m.fecha_realizacion === null || m.fecha_realizacion === undefined || m.fecha_realizacion === '')
      ? null : String(m.fecha_realizacion);
    if (f && (reg.ultimaFecha === null || f > reg.ultimaFecha)) reg.ultimaFecha = f;
  });
  return mapa;
}

// Fecha DATE de Postgres ('YYYY-MM-DD' o con hora) → 'DD-MM-AAAA'.
// Cualquier otro formato se devuelve tal cual (sin reinterpretar).
function mntFormatoFechaCorta(valor) {
  return formatearFechaCL(valor,{civil:true,vacio:null,invalida:String(valor)});
}

// Opciones de filtros derivadas de los datos (sin hardcodear).
// C2E-2/3: categorías desde hoja_origen en el orden conocido del catálogo;
// las desconocidas (si alguna vez aparecieran) se agregan al final.
function mntOpcionesFiltrosElementos(lista) {
  const ubicaciones = new Set();
  const categorias = new Set();

  lista.forEach(e => {
    const ub = mntNombreUbicacion(e);
    if (ub) ubicaciones.add(String(ub));
    const hoja = (e.hoja_origen === null || e.hoja_origen === undefined) ? '' : String(e.hoja_origen).trim();
    if (hoja) categorias.add(hoja);
  });

  const listaCategorias = Array.from(categorias).sort((a, b) => {
    const ia = MNT_ORDEN_CATEGORIAS.indexOf(mntClaveCategoria(a));
    const ib = MNT_ORDEN_CATEGORIAS.indexOf(mntClaveCategoria(b));
    if (ia !== -1 || ib !== -1) {
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    }
    return String(a).localeCompare(String(b), 'es');
  });

  return {
    ubicaciones: Array.from(ubicaciones).sort((a, b) => a.localeCompare(b, 'es')),
    categorias: listaCategorias
  };
}

// Aplica los tres filtros de forma simultánea (AND).
// C2E-2/3: texto busca nombre / código / ubicación (según el requisito
// aprobado); el filtro de "grupo" fue sustituido por categoría (hoja_origen).
function mntFiltrarElementos(lista) {
  const texto = (mantencionFiltrosElementos.texto || '').trim().toLowerCase();
  const ubicacion = mantencionFiltrosElementos.ubicacion || '';
  const categoria = mantencionFiltrosElementos.categoria || '';

  return lista.filter(e => {
    // Filtro por ubicación.
    if (ubicacion) {
      if (mntNombreUbicacion(e) !== ubicacion) return false;
    }
    // Filtro por categoría (hoja_origen, valor REAL sin reinterpretar).
    if (categoria) {
      const c = (e.hoja_origen === null || e.hoja_origen === undefined) ? '' : String(e.hoja_origen).trim();
      if (c !== categoria) return false;
    }
    // Buscador (case-insensitive) sobre nombre, código y ubicación.
    // NULL se ignora, nunca se convierte en "null".
    if (texto) {
      const campos = [e.nombre_original, e.codigo, mntNombreUbicacion(e), e.ubicacion_original];
      const coincide = campos.some(c => {
        if (c === null || c === undefined || c === '') return false;
        return String(c).toLowerCase().indexOf(texto) !== -1;
      });
      if (!coincide) return false;
    }
    return true;
  });
}

// Panel contenedor: decide entre listado y ficha.
// C2E-2/3: recibe elementos + historial del CATÁLOGO (métodos dedicados) y
// deriva el resumen de cabecera y el historial por tarjeta en cliente, sin
// consultas adicionales a Supabase.
function mntPanelElementosHTML(meta, datos, mantenciones) {
  mntElementosBase = Array.isArray(datos) ? datos : [];
  mntMantencionesGeneralesBase = Array.isArray(mantenciones) ? mantenciones : [];
  mntResumenHistorialElementos = mntResumenHistorialPorElemento(mntMantencionesGeneralesBase);

  const totalElementos = mntElementosBase.length;
  let conHistorial = 0;
  mntElementosBase.forEach(e => {
    const reg = mntResumenHistorialElementos[e.id];
    if (reg && reg.cantidad > 0) conHistorial += 1;
  });
  const sinHistorial = totalElementos - conHistorial;

  // El título grande ya lo muestra la cabecera de la modal, por lo que aquí NO
  // se repite. Solo el resumen real (derivado del dataset cargado: NUNCA 114 /
  // 104 / 10 escritos a mano) y el badge de solo lectura.
  const encabezado = `
    <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
      <div>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Sección de Mantención General</p>
        <p class="text-xs font-black text-slate-700 dark:text-slate-200 mt-1">
          ${totalElementos} elemento${totalElementos === 1 ? '' : 's'} · ${conHistorial} con historial · ${sinHistorial} sin historial
        </p>
      </div>
      <span class="text-xs font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 px-3 py-1.5 rounded-xl">
        Históricos Excel · Solo lectura
      </span>
    </div>
  `;

  // Dentro de la modal: si hay un elemento seleccionado se muestra su ficha;
  // si no, se muestra el listado con buscador y filtros.
  let cuerpo;
  if (mantencionElementoSeleccionado) {
    cuerpo = `
      <div>
        <button onclick="cerrarFichaElemento()"
          class="mb-4 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1.5">
          <span>←</span>
          <span>Volver al listado de elementos</span>
        </button>
        <div id="mnt-ficha-elemento">
          <div class="flex flex-col items-center justify-center py-12 space-y-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl">
            <span class="animate-spin text-3xl text-blue-600">⏳</span>
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Cargando ficha del elemento...</span>
          </div>
        </div>
      </div>
    `;
  } else if (totalElementos === 0) {
    cuerpo = `
      <div class="mt-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-10 text-center space-y-2">
        <span class="text-4xl block">🧰</span>
        <h4 class="text-base font-black text-slate-700 dark:text-slate-200">No hay elementos en el catálogo general</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400">Aún no existen elementos de LISTA DE MANTENCIONES.xlsx.</p>
      </div>
    `;
  } else {
    const opciones = mntOpcionesFiltrosElementos(mntElementosBase);
    const filtrados = mntFiltrarElementos(mntElementosBase);
    cuerpo = `
      <div class="mt-5 space-y-4">
        ${mntFiltrosElementosHTML(opciones)}
        <p id="mnt-contador-elementos" class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
          ${filtrados.length} de ${totalElementos} elementos
        </p>
        <div id="mnt-listado-elementos">
          ${mntCuadriculaElementosHTML(filtrados)}
        </div>
      </div>
    `;
  }

  return `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      ${encabezado}
      ${cuerpo}
    </div>
  `;
}

// Buscador + filtros de ubicación y categoría, derivados de los datos.
// C2E-2/3: el filtro de "grupo / origen" se sustituye por CATEGORÍA
// (hoja_origen), que es la clasificación real del catálogo.
function mntFiltrosElementosHTML(opciones) {
  const selUbicacion = mntEsc(mantencionFiltrosElementos.ubicacion);
  const selCategoria = mntEsc(mantencionFiltrosElementos.categoria);

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-3 border border-slate-100 dark:border-slate-800">
      <div>
        <label for="mnt-buscar-elemento" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Buscar</label>
        <input id="mnt-buscar-elemento" type="text" value="${mntEsc(mantencionFiltrosElementos.texto)}"
          oninput="mntOnBuscarElemento(this.value)"
          placeholder="Buscar por nombre, código o ubicación..."
          class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label for="mnt-filtro-ubicacion" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Ubicación</label>
          <select id="mnt-filtro-ubicacion" onchange="mntOnFiltrarUbicacion(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todas las ubicaciones</option>
            ${opciones.ubicaciones.map(u => `<option value="${mntEsc(u)}" ${u === mantencionFiltrosElementos.ubicacion ? 'selected' : ''}>${mntEsc(u)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="mnt-filtro-categoria" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Categoría</label>
          <select id="mnt-filtro-categoria" onchange="mntOnFiltrarCategoria(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todas las categorías</option>
            ${opciones.categorias.map(c => `<option value="${mntEsc(c)}" ${c === mantencionFiltrosElementos.categoria ? 'selected' : ''}>${mntEsc(mntEtiquetaCategoria(c))}</option>`).join('')}
          </select>
        </div>
      </div>
      ${selUbicacion || selCategoria || mantencionFiltrosElementos.texto ? `
        <button onclick="mntLimpiarFiltrosElementos()"
          class="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
          Limpiar filtros
        </button>
      ` : ''}
    </div>
  `;
}

// Cuadrícula de tarjetas (el cliente pidió tarjetas, no tablas tipo Excel).
function mntCuadriculaElementosHTML(filtrados) {
  if (!filtrados || filtrados.length === 0) {
    return `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-1">
        <span class="text-3xl block">🔍</span>
        <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Sin resultados para los filtros aplicados</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Prueba con otro texto, ubicación o categoría.</p>
      </div>
    `;
  }

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${filtrados.map(mntTarjetaElementoHTML).join('')}
    </div>
  `;
}

// Tarjeta del catálogo: SOLO información útil y real del elemento
// (nombre, categoría de hoja_origen, ubicación, código si existe) más su
// historial derivado (nº de mantenciones y última fecha_realizacion).
// NO se muestran estado_operativo_actual, es_activo_fijo ni proveedor.
function mntTarjetaElementoHTML(e) {
  const ubicacion = mntNombreUbicacion(e);
  const categoria = mntEtiquetaCategoria(e.hoja_origen);

  // Identificador: código si existe; si no, nemotécnico; si ambos vacíos, no
  // se muestra. La etiqueta de "codigo" depende del Excel de origen.
  const hayCodigo = e.codigo !== null && e.codigo !== undefined && e.codigo !== '';
  const hayNemotecnico = e.nemotecnico !== null && e.nemotecnico !== undefined && e.nemotecnico !== '';
  let identificador = '';
  if (hayCodigo) {
    identificador = `<p class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">${mntEsc(mntEtiquetaCodigo(e))}: ${mntEsc(e.codigo)}</p>`;
  } else if (hayNemotecnico) {
    identificador = `<p class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">Nemotécnico: ${mntEsc(e.nemotecnico)}</p>`;
  }

  // Historial derivado del dataset cargado (cuenta y última fecha REALES).
  const reg = mntResumenHistorialElementos[e.id] || { cantidad: 0, ultimaFecha: null };
  const cantidad = reg.cantidad;
  let historialLinea;
  if (cantidad === 0) {
    historialLinea = `
        <p class="text-[11px] font-black text-slate-500 dark:text-slate-400">0 mantenciones</p>
        <p class="text-[11px] font-semibold text-slate-400 dark:text-slate-500">Sin historial registrado</p>`;
  } else {
    const ultima = mntFormatoFechaCorta(reg.ultimaFecha);
    historialLinea = `
        <p class="text-[11px] font-black text-slate-500 dark:text-slate-400">${cantidad} ${cantidad === 1 ? 'mantención' : 'mantenciones'}</p>
        <p class="text-[11px] font-semibold ${ultima ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}">${ultima ? `Última: ${mntEsc(ultima)}` : 'Sin fecha registrada'}</p>`;
  }

  return `
    <div onclick="abrirFichaElemento('${mntEsc(e.id)}')"
      class="bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer card-hover group flex flex-col justify-between">
      <div>
        <div class="flex items-start justify-between mb-3">
          <div class="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-xl shrink-0">
            🧰
          </div>
          <span class="text-[10px] font-black px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[60%]" title="${mntEsc(categoria)}">${mntEsc(categoria)}</span>
        </div>
        <h4 class="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug line-clamp-2">${mntEsc(mntSinDato(e.nombre_original))}</h4>
        ${identificador}
        ${ubicacion ? `<p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-2 flex items-center space-x-1.5 truncate"><span>📍</span><span class="truncate">${mntEsc(ubicacion)}</span></p>` : ''}
      </div>
      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold gap-2">
        <div class="min-w-0">
          ${historialLinea}
        </div>
        <span class="text-blue-600 dark:text-blue-400 group-hover:text-blue-800 dark:group-hover:text-blue-300 shrink-0">Ver ficha</span>
      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// Manejadores de filtros (solo re-render del listado, sin recargar la SPA)
// ------------------------------------------------------------
function mntOnBuscarElemento(valor) {
  mantencionFiltrosElementos.texto = valor || '';
  mntRefrescarListadoElementos();
}

function mntOnFiltrarUbicacion(valor) {
  mantencionFiltrosElementos.ubicacion = valor || '';
  mntRefrescarListadoElementos();
}

function mntOnFiltrarCategoria(valor) {
  mantencionFiltrosElementos.categoria = valor || '';
  mntRefrescarListadoElementos();
}

// Rutina ÚNICA de reset del estado de filtros de Catálogo General e Historial.
// La usan el cierre completo de la modal (cerrarMantencionSubapartado) y
// el botón "Limpiar filtros" (mntLimpiarFiltrosElementos). No toca DOM ni
// consulta Supabase; solo restaura los valores iniciales del estado.
function mntResetFiltrosElementos() {
  mantencionFiltrosElementos.texto = '';
  mantencionFiltrosElementos.ubicacion = '';
  mantencionFiltrosElementos.categoria = '';
}

function mntLimpiarFiltrosElementos() {
  mntResetFiltrosElementos();
  // Vuelve a dibujar el panel completo para refrescar también los <select>.
  cargarPanelSubapartado('elementos');
}

// Actualiza únicamente la cuadrícula y el contador.
function mntRefrescarListadoElementos() {
  const cont = document.getElementById('mnt-listado-elementos');
  const contador = document.getElementById('mnt-contador-elementos');
  if (!cont) return;

  const filtrados = mntFiltrarElementos(mntElementosBase);
  cont.innerHTML = mntCuadriculaElementosHTML(filtrados);
  if (contador) contador.textContent = `${filtrados.length} de ${mntElementosBase.length} elementos`;
}

// ------------------------------------------------------------
// Ficha del elemento + historial real (DENTRO de la modal del subapartado)
// ------------------------------------------------------------
// La ficha NO crea una segunda modal. Reemplaza el contenido del listado
// dentro de la misma modal de "Catálogo General e Historial". El listado y
// sus filtros se conservan en estado (mantencionFiltrosElementos) y al
// volver se repintan igual. No se recarga la SPA.

// Cambia el panel de la modal a la ficha del elemento seleccionado.
function abrirFichaElemento(id) {
  mantencionElementoSeleccionado = id;
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;

  // Repinta el panel: ahora muestra la ficha (con su cargador).
  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'elementos') || { nombre: 'Catálogo General e Historial', icono: '🧰' };
  panel.innerHTML = mntPanelElementosHTML(meta, mntElementosBase, mntMantencionesGeneralesBase);

  // Carga el detalle real dentro del contenedor de la ficha.
  mntCargarFichaElemento(id);
}

// Vuelve al listado conservando búsqueda, ubicación y categoría seleccionadas.
function cerrarFichaElemento() {
  mantencionElementoSeleccionado = null;
  // C2E-4E4 / F5: al cerrar la ficha se descarta el contexto de anulación,
  // para que no quede disponible ninguna mantención que ya no se esté viendo.
  mntLimpiarOperativasFichaActual();
  // C2E-4E4 / F6: y también el contexto de la ficha operativa ACTIVA
  // (solo el del Catálogo; el de Máquinas, si existiera, no se toca).
  mntLimpiarContextoOperativas('catalogo');
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;

  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'elementos') || { nombre: 'Catálogo General e Historial', icono: '🧰' };
  panel.innerHTML = mntPanelElementosHTML(meta, mntElementosBase, mntMantencionesGeneralesBase);
}

// Carga la ficha de forma asíncrona dentro de la modal.
// C2E-4E4 / F4 — segundo parámetro opcional para forzar la relectura del
// historial operativo (se usa tras un registro nuevo, cuando el service ya
// invalidó su caché y queremos garantizar la fila recién creada).
async function mntCargarFichaElemento(id, forzarOperativas = false) {
  const cont = document.getElementById('mnt-ficha-elemento');
  if (!cont) return;

  // C2E-4E4 / F4 — guard anti-carrera: si mientras se resolvía la consulta
  // el usuario abrió la ficha de OTRO elemento, la respuesta NO se pinta
  // (evita que la carga lenta de una ficha anterior sobrescriba la actual).
  const fichaSolicitada = mantencionElementoSeleccionado;

  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está cargado.');
    }
    // Fase 2.1.1: se cargan en paralelo el detalle del elemento y los
    // televisores. getElementoDetalle conserva su contrato { elemento,
    // mantenciones } sin cambios. getTelevisores usa su caché
    // (_televisoresCache), por lo que después de la primera carga no hay
    // consultas nuevas por ficha. Sin N+1.
    //
    // C2E-4E4 / F4+F6: se agrega a la misma ronda la consulta del historial
    // OPERATIVO de ESTE elemento_id (service de F2: filtro en Supabase +
    // anulaciones en una sola consulta por lote). Su resultado NO se
    // confunde nunca con un error: mntCargarEstadoOperativasFicha (F6,
    // compartida con Máquinas) devuelve { ok, lista, aviso } para poder
    // distinguir "cargado y vacío" de "falló la lectura" (en ese caso la
    // ficha se muestra completa con su aviso y su reintento).
    const operativasPromise = mntCargarEstadoOperativasFicha(id, forzarOperativas);

    const [detalle, televisores, resOperativas] = await Promise.all([
      window.MantencionesService.getElementoDetalle(id),
      window.MantencionesService.getTelevisores(),
      operativasPromise
    ]);
    if (!detalle || !detalle.elemento) {
      cont.innerHTML = `
        <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-2">
          <span class="text-3xl block">⚠️</span>
          <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Elemento no encontrado</p>
        </div>
      `;
      return;
    }

    // Guard anti-carrera (ver comentario arriba): solo se pinta si el
    // elemento de la respuesta sigue siendo el que está abierto.
    if (mantencionElementoSeleccionado !== fichaSolicitada) return;

    // Contexto DEFENSIVO para la anulación (F5): el Map de operativas
    // refleja SOLO lo que se está mostrando en esta ficha. Si la lectura
    // falló, no hay contexto y por lo tanto no hay anulación posible.
    if (resOperativas && resOperativas.ok) {
      mntGuardarOperativasFichaActual(resOperativas.lista);
    } else {
      mntLimpiarOperativasFichaActual();
    }

    cont.innerHTML = mntFichaElementoHTML(
      detalle,
      televisores,
      (resOperativas && resOperativas.ok) ? resOperativas.lista : null,
      (resOperativas && resOperativas.ok) ? null : MNT_MENSAJE_ERROR_HISTORIAL_OPERATIVO
    );

    // C2E-4E4 / F6 — esta ficha pasa a ser la ficha operativa ACTIVA del
    // Catálogo: los modales compartidos repintarán el contenedor del
    // Catálogo y su propio elemento, nunca los de Máquinas. `elemento` da
    // contexto real al formulario sin depender de mntElementosBase.
    mntFijarContextoOperativas({
      origen: 'catalogo',
      elementoId: id,
      contenedorId: 'mnt-ficha-elemento',
      elemento: (detalle && detalle.elemento) ? detalle.elemento : null,
      repintar: () => mntRepintarFichaOperativa(id, true)
    });
  } catch (e) {
    console.error('Error cargando ficha del elemento:', e);
    cont.innerHTML = getMantencionesErrorHTML();
  }
}

// Campo de ficha con reglas de NULL explícitas.
function mntCampoFichaHTML(etiqueta, valor, esFecha = false, esResponsable = false) {
  let texto;
  if (valor === null || valor === undefined || valor === '') {
    if (esFecha) texto = mntSinFecha(valor);
    else if (esResponsable) texto = mntSinResponsable(valor);
    else texto = mntSinDato(valor);
  } else if (typeof valor === 'boolean') {
    texto = valor ? 'Sí' : 'No';
  } else {
    texto = mntEsc(valor);
  }

  return `
    <div>
      <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">${mntEsc(etiqueta)}</p>
      <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 leading-relaxed break-words">${texto}</p>
    </div>
  `;
}

// C2E-2/3 — variante que NO se emite cuando el valor está vacío. La ficha
// debe mostrar la información real sin repetir "Sin dato registrado" en
// campos que simplemente no aplican a este catálogo.
function mntCampoFichaSiHTML(etiqueta, valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  return mntCampoFichaHTML(etiqueta, valor);
}

// Costo: NULL → "Sin dato registrado" (NUNCA $0). Numérico real → moneda.
function mntFormatoCosto(valor) {
  if (valor === null || valor === undefined || valor === '') return mntSinDato(valor);
  const numero = Number(valor);
  if (Number.isNaN(numero)) return mntEsc(valor);
  return mntEsc(new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(numero));
}

// Ficha del elemento del CATÁLOGO GENERAL (C2E-2/3).
// Muestra SOLO información real y útil: nombre, categoría (hoja_origen),
// código/nemotécnico si existen, ubicación canónica (fallback real),
// ubicación original cuando aporta trazabilidad, observaciones y un bloque
// secundario de trazabilidad. NO se muestran estado ni campos siempre NULL.
// C2E-4E4 / F4 — el TERCER parámetro es opcional y distingue a propósito
// tres estados:
//   null  → la vista NO tiene integración operativa (Mantención de Máquinas,
//           cuya integración es de F6) ⇒ el bloque NO se emite y la ficha
//           queda EXACTAMENTE igual que antes de F4;
//   []    → integración habilitada pero sin registros ⇒ se emite el bloque
//           con su estado vacío (y el botón de registro en el Catálogo);
//   [...] → integración habilitada con registros.
// El default es null (nunca []) para que Máquinas NO muestre un bloque
// vacío por efecto de un valor por defecto.
//
// C2E-4E4 / F5 — el CUARTO parámetro (avisoOperativas) separa el ERROR DE
// LECTURA de "cargado y vacío": si llega un mensaje, se emite el bloque de
// aviso con su acción de reintento en lugar del bloque operativo. La ficha
// y el historial importado de Excel se mantienen visibles siempre.
function mntFichaElementoHTML(detalle, televisores = [], operativas = null, avisoOperativas = null, opciones = {}) {
  const e = detalle.elemento;
  const ubicacion = mntNombreUbicacion(e);
  const categoria = mntEtiquetaCategoria(e.hoja_origen);

  // Ubicación canónica REAL del embed (sin caer al fallback) para decidir
  // si ubicacion_original aporta trazabilidad o solo repetiría el dato.
  let ubCanonica = null;
  if (e.ubicacion && typeof e.ubicacion === 'object' && !Array.isArray(e.ubicacion) && e.ubicacion.nombre) {
    ubCanonica = e.ubicacion.nombre;
  } else if (Array.isArray(e.ubicacion) && e.ubicacion.length > 0 && e.ubicacion[0] && e.ubicacion[0].nombre) {
    ubCanonica = e.ubicacion[0].nombre;
  }
  const mostrarUbicacionOriginal = !!e.ubicacion_original &&
    (!ubCanonica || String(e.ubicacion_original) !== String(ubCanonica));

  // Trazabilidad: solo valores no vacíos (bloque secundario discreto).
  const origenParts = [
    ['Archivo', e.archivo_origen],
    ['Hoja', e.hoja_origen],
    ['Fila', e.fila_origen],
    ['Celda', e.celda_origen]
  ].filter(p => p[1] !== null && p[1] !== undefined && p[1] !== '');

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-5 space-y-5">

      <!-- CABECERA FICHA -->
      <div class="flex items-start space-x-3">
        <div class="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-2xl shrink-0">🧰</div>
        <div class="min-w-0">
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Ficha del elemento</p>
          <h3 class="text-lg font-black text-slate-900 dark:text-white leading-snug break-words">${mntEsc(mntSinDato(e.nombre_original))}</h3>
          <span class="inline-block mt-1.5 text-[10px] font-black px-2 py-1 rounded-full bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${mntEsc(categoria)}</span>
        </div>
      </div>

      <!-- DATOS (solo campos con contenido real) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${mntCampoFichaSiHTML(mntEtiquetaCodigo(e), e.codigo)}
        ${mntCampoFichaSiHTML('Nemotécnico', e.nemotecnico)}
        ${mntCampoFichaHTML('Ubicación', ubicacion)}
        ${mostrarUbicacionOriginal ? mntCampoFichaHTML('Ubicación original', e.ubicacion_original) : ''}
      </div>

      <!-- ENRIQUECIMIENTO POR TIPO DE ELEMENTO (Fase 2.1.1).
           Solo se emite si existe relación REAL (FK) con
           televisores_habitaciones. Los elementos sin relación se ven
           exactamente igual que antes. -->
      ${mntEnriquecimientoFichaHTML(e, televisores)}

      ${e.observaciones ? `
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        ${mntCampoFichaHTML('Observaciones', e.observaciones)}
      </div>` : ''}

      <!-- TRAZABILIDAD (bloque secundario discreto) -->
      ${origenParts.length ? `
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Origen / trazabilidad</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          ${origenParts.map(p => mntCampoFichaHTML(p[0] + ' origen', p[1])).join('')}
        </div>
      </div>` : ''}

      <!-- C2E-4E4 / F4+F5 — HISTORIAL DEL SISTEMA (mantenciones registradas
           desde la aplicación), SIEMPRE ANTES del historial importado.
           Cuatro estados EXPLÍCITOS, nunca se confunde un error con cero
           registros ni una vista sin integración con una vacía:
             avisoOperativas → error de lectura (aviso + reintento)
             operativas = null  → Máquinas (sin integración, F6)
             operativas = []    → integración vacía
             operativas = [...] → integración con registros -->
      ${avisoOperativas ? mntAvisoOperativasHTML(avisoOperativas, e && e.id, opciones.programarTarea)
        : (Array.isArray(operativas) ? mntBloqueOperativasHTML(operativas, {
          conBotonRegistro: true,
          programarTarea: opciones.programarTarea,
          conBotonAnulacion: true,
          elementoId: e && e.id
        }) : '')}

      <!-- HISTORIAL REAL DE MANTENCIONES (tarjetas importadas de Excel) -->
      ${mntHistorialElementoHTML(detalle.mantenciones)}
    </div>
  `;
}

// Encabezado + listado del historial de un elemento.
// C2E-2/3: se sustituyó la tabla horizontal por TARJETAS COMPACTAS
// (detalle_trabajo puede ser largo y muchos campos estructurales están
// siempre NULL en este conjunto). El orden lo da el service
// (fecha_realizacion DESC con desempate por fila/celda).
// FIX-04D: páginas del contenido ya cargado; no simula paginación SQL.
function mntOrdenarHistorialReciente(filas) {
  const fecha = r => {
    const campos = ['fecha_realizacion','fecha_revision','fecha_cambio','fecha_evento','fecha_inventariado','created_at'];
    const campo = campos.find(k => Object.hasOwn(r || {},k));
    const valor = campo && r[campo];
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(valor)) return -Infinity;
    const [y,m,d] = valor.slice(0,10).split('-').map(Number), check = new Date(Date.UTC(y,m-1,d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m-1 || check.getUTCDate() !== d) return -Infinity;
    const t = Date.parse(valor); return Number.isFinite(t) ? t : -Infinity;
  };
  return [...filas].map((r,i)=>({r,i,t:fecha(r)})).sort((a,b)=>a.t===b.t?a.i-b.i:a.t>b.t?-1:1).map(x=>x.r);
}
function mntHistorialPaginadoHTML(cantidad, etiqueta, contenido) {
  if (cantidad <= 2) return contenido;
  return `<alm-historial-paginado role="region" aria-label="${mntEsc(etiqueta)}">${contenido}</alm-historial-paginado>`;
}
if (typeof customElements !== 'undefined') customElements.define('alm-historial-paginado', class extends HTMLElement {
  connectedCallback() {
    if (this.iniciado) return;
    const lista = this.firstElementChild;
    if (!lista) return;
    this.iniciado = true;
    const filas = Array.from(lista.children);
    let pagina = 0;
    const total = Math.max(1, Math.ceil(filas.length / 2));
    const nav = document.createElement('nav'); nav.className = 'mnt-historial-paginacion';
    nav.setAttribute('aria-label','Páginas del historial');
    const anterior = document.createElement('button'), siguiente = document.createElement('button'), estado = document.createElement('span');
    anterior.type = siguiente.type = 'button'; anterior.className = siguiente.className = 'alm-btn-secondary';
    anterior.textContent = 'Anterior'; siguiente.textContent = 'Siguiente';
    estado.setAttribute('aria-live','polite'); estado.setAttribute('role','status');
    const pintar = () => {
      filas.forEach((fila,i) => { fila.hidden = i < pagina*2 || i >= pagina*2+2; });
      anterior.disabled = pagina === 0; siguiente.disabled = pagina === total-1;
      estado.textContent = 'Página ' + (pagina+1) + ' de ' + total;
    };
    anterior.onclick = () => { if (pagina > 0) { pagina--; pintar(); } };
    siguiente.onclick = () => { if (pagina < total-1) { pagina++; pintar(); } };
    nav.append(anterior,estado,siguiente); this.appendChild(nav); pintar();
  }
});

function mntHistorialCompactoHTML(cantidad, etiqueta, contenido) {
  if (cantidad <= 2) return contenido;
  return `<alm-historial-scroll role="region" tabindex="0" aria-label="${mntEsc(etiqueta)}: ${cantidad} registros">${contenido}</alm-historial-scroll>`;
}

if (typeof customElements !== 'undefined') customElements.define('alm-historial-scroll', class extends HTMLElement {
  connectedCallback() {
    const lista = this.firstElementChild;
    const segundo = lista?.children[1];
    if (!segundo) return;
    const medir = () => {
      const altura = segundo.getBoundingClientRect().bottom - lista.getBoundingClientRect().top;
      if (altura > 0) this.style.maxHeight = Math.ceil(altura) + 'px';
    };
    this.observador = new ResizeObserver(medir);
    this.observador.observe(lista);
    this.observador.observe(lista.firstElementChild);
    this.observador.observe(segundo);
    medir();
  }

  disconnectedCallback() {
    this.observador?.disconnect();
  }
});

function mntHistorialElementoHTML(mantenciones) {
  const lista = Array.isArray(mantenciones) ? mantenciones : [];

  if (lista.length === 0) {
    return `
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Historial de mantenciones</h4>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-800">
          No hay mantenciones históricas registradas para este elemento.
        </div>
      </div>
    `;
  }

  // Última mantención REAL (fecha_realizacion). Si ninguna tiene fecha,
  // no se inventa ninguna.
  let ultimaRaw = null;
  lista.forEach(m => {
    const f = (m === null || m === undefined) ? null
      : (m.fecha_realizacion === null || m.fecha_realizacion === undefined || m.fecha_realizacion === '')
        ? null : String(m.fecha_realizacion);
    if (f && (ultimaRaw === null || f > ultimaRaw)) ultimaRaw = f;
  });
  const ultima = mntFormatoFechaCorta(ultimaRaw);

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Historial de mantenciones</h4>
        <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">${lista.length} registro${lista.length === 1 ? '' : 's'}</span>
      </div>
      ${ultima ? `
      <p class="text-[11px] font-black text-slate-600 dark:text-slate-300 mb-3">
        Última mantención: <span class="text-blue-600 dark:text-blue-400">${mntEsc(ultima)}</span>
      </p>` : ''}
      ${mntHistorialPaginadoHTML(lista.length, 'Historial de mantenciones', `<div class="space-y-3">
        ${mntOrdenarHistorialReciente(lista).map(mntTarjetaHistorialHTML).join('')}
      </div>`)}
    </div>
  `;
}

// Tarjeta compacta de un registro histórico.
// Muestra: fecha_realizacion (o "Sin fecha registrada"), fecha_original SOLO
// como dato secundario cuando no hay fecha_realizacion, responsable (o
// "Sin responsable registrado"), detalle_trabajo SOLO si tiene contenido y
// trazabilidad discreta opcional. NO se muestran tipo / estado /
// fecha_programada / costo (0 con dato en todo este conjunto).
function mntTarjetaHistorialHTML(m) {
  const reg = m || {};
  const fechaReal = mntFormatoFechaCorta(reg.fecha_realizacion);
  const hayFechaOriginal = reg.fecha_original !== null && reg.fecha_original !== undefined && reg.fecha_original !== '';
  // NULL → "Sin responsable registrado"; valor real → escapado (importado de Excel).
  const responsable = (reg.responsable_texto === null || reg.responsable_texto === undefined || reg.responsable_texto === '')
    ? 'Sin responsable registrado'
    : mntEsc(reg.responsable_texto);

  const origenParts = [
    reg.archivo_origen,
    reg.hoja_origen,
    (reg.fila_origen === null || reg.fila_origen === undefined || reg.fila_origen === '') ? null : `fila ${reg.fila_origen}`,
    (reg.celda_origen === null || reg.celda_origen === undefined || reg.celda_origen === '') ? null : `celda ${reg.celda_origen}`
  ].filter(v => v !== null && v !== undefined && v !== '');

  return `
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm font-extrabold ${fechaReal ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}">
          ${fechaReal ? mntEsc(fechaReal) : 'Sin fecha registrada'}
        </p>
        ${!fechaReal && hayFechaOriginal ? `
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          Fecha original: ${mntEsc(formatDate(reg.fecha_original))}
        </span>` : ''}
      </div>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-1.5">
        Responsable: ${responsable}
      </p>
      ${(reg.detalle_trabajo !== null && reg.detalle_trabajo !== undefined && reg.detalle_trabajo !== '') ? `
      <p class="text-xs text-slate-700 dark:text-slate-200 mt-2 leading-relaxed break-words">${mntEsc(reg.detalle_trabajo)}</p>` : ''}
      ${origenParts.length ? `
      <p class="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-2.5 truncate" title="${mntEsc(origenParts.join(' · '))}">
        Origen: ${mntEsc(origenParts.join(' · '))}
      </p>` : ''}
    </div>
  `;
}

// ==========================================================
// C2E-4E4 / F3 — HISTORIAL DEL SISTEMA (MANTENCIONES OPERATIVAS)
// ==========================================================
// Componentes PUROS de visualización de los trabajos registrados desde la
// aplicación (public.mantenciones_operativas), SIEMPRE separados del
// historial importado de Excel (public.mantenciones). Estos renderizadores
// aún NO se integran en mntFichaElementoHTML / mntCargarFichaElemento /
// mqaFichaHTML: esa conexión es de F4/F5. Existen desde ahora como
// componentes reutilizables por las DOS vistas (Catálogo General e
// Historial y Áreas de Trabajo → Mantención de Máquinas).
//
// REGLAS DE ESTA SECCIÓN:
// - SOLO LECTURA: sin onclick, sin inputs, sin escrituras, sin estado
//   global. Cada componente recibe sus datos por parámetro.
// - Todo texto de BD pasa por mntEsc() (& < > " '): inyección HTML
//   imposible, incluidos los motivos de anulación y los nombres.
// - NULL: fecha → "Sin fecha registrada"; responsable → "Sin responsable
//   registrado"; detalle → "Sin detalle registrado"; autor → "Autor no
//   registrado". NUNCA NULL → 0 ni datos inventados.
// - fecha_realizacion (DATE de Postgres) se formatea con
//   mntFormatoFechaCorta, que NO usa new Date(): evita el desplazamiento
//   de un día por zona horaria (patrón del historial importado).
// - created_at y la fecha de anulación (timestamptz con zona) usan el
//   helper real mntFechaHoraRevisionTexto (mismo formato de toda la app).
// - Los saltos de línea del detalle se preservan con whitespace-pre-line
//   (CSS), sin insertar HTML no confiable (<br>).
// - Los UUID (registrado_por, anulado_por) NUNCA se muestran.
// - El bloque se renderiza SIEMPRE, incluso con cero registros (estado
//   vacío), porque F4 pondrá allí el registro de la primera mantención.

// Chip "ANULADA". Sin parámetros: el estado ya está decidido por quien
// invoca (igual que los chips inline del historial de las subáreas).
function mntChipAnuladoOperativaHTML() {
  return `<span class="text-[10px] font-black px-2.5 py-1 rounded-full border bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900">ANULADA</span>`;
}

// Tarjeta de UNA mantención operativa (vigente o anulada). Cuando está
// anulada conserva TODO el contenido original y agrega el chip, el motivo,
// el autor y la fecha de anulación (helper genérico mntBloqueAnulacionHTML,
// ya validado en las subáreas cerradas).
function mntTarjetaOperativaHTML(op, opciones = {}) {
  const reg = (op && typeof op === 'object') ? op : {};
  const anulada = reg.anulada === true;

  // C2E-4E4 / F5 — botón «Anular mantención»: SOLO en tarjetas VIGENTES y
  // SOLO cuando la vista lo habilita (opciones.conBotonAnulacion, que pasa
  // únicamente la ficha del Catálogo General) Y el usuario es admin
  // PERMANENTE vigente (un admin temporal puede registrar pero no anular).
  // Doble gate de UX, nunca de seguridad: la RPC vuelve a validar todo.
  const esAdminPermanente = typeof window.esAdminPermanenteActual === 'function' &&
    window.esAdminPermanenteActual() === true;
  const puedeAnular = anulada !== true && opciones.conBotonAnulacion === true &&
    esAdminPermanente && reg.id !== null && reg.id !== undefined;
  const botonAnular = puedeAnular ? `
      <button type="button" onclick="abrirModalAnularMantencion('${mntEsc(String(reg.id))}')"
        class="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950 text-[10px] font-black transition-colors">
        <span aria-hidden="true">🚫</span>
        <span>Anular mantención</span>
      </button>` : '';

  const fechaReal = mntFormatoFechaCorta(reg.fecha_realizacion);
  const responsable = reg.responsables?.length
    ? reg.responsables.map(r => mntEsc(window.UsuariosService?.nombreParaMostrar?.(r,'nombre') ?? r.nombre)).join(' · ')
    : (reg.responsable_texto === null || reg.responsable_texto === undefined || reg.responsable_texto === '')
    ? 'Sin responsable registrado'
    : mntEsc(reg.responsable_texto);
  const detalle = (reg.detalle_trabajo === null || reg.detalle_trabajo === undefined || reg.detalle_trabajo === '')
    ? 'Sin detalle registrado'
    : mntEsc(reg.detalle_trabajo);
  const autorRegistro = (typeof (window.UsuariosService?.nombreParaMostrar?.(reg,'autor_nombre_snapshot') ?? reg.autor_nombre_snapshot) === 'string' && (window.UsuariosService?.nombreParaMostrar?.(reg,'autor_nombre_snapshot') ?? reg.autor_nombre_snapshot).trim() !== '')
    ? mntEsc((window.UsuariosService?.nombreParaMostrar?.(reg,'autor_nombre_snapshot') ?? reg.autor_nombre_snapshot).trim())
    : 'Autor no registrado';
  const fechaRegistro = opciones.soloFechaRegistro === true
    ? formatearFechaCL(reg.created_at,{vacio:'Sin fecha registrada'}) : mntFechaHoraRevisionTexto(reg.created_at);

  return `
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm font-extrabold ${fechaReal ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}">
          ${fechaReal ? mntEsc(fechaReal) : 'Sin fecha registrada'}
        </p>
        <span class="flex flex-wrap items-center gap-2">
          <span class="text-[10px] font-black px-2.5 py-1 rounded-full border bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900">
            Registrada en el sistema
          </span>
          ${anulada ? mntChipAnuladoOperativaHTML() : ''}
        </span>
      </div>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
        Responsable: ${responsable}
      </p>
      <p class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed break-words whitespace-pre-line">Detalle: ${detalle}</p>
      <p class="text-[10px] text-slate-400 dark:text-slate-500 font-semibold break-words">
        Registrada por: ${autorRegistro} · ${opciones.soloFechaRegistro === true ? 'Fecha de registro: ' : ''}${mntEsc(fechaRegistro)}
      </p>
      ${botonAnular ? `<div class="flex justify-end pt-1">${botonAnular}</div>` : ''}
      ${anulada ? mntBloqueAnulacionHTML(reg.anulacion, {
        texto: 'Este trabajo fue anulado y no se considera vigente.'
      }) : ''}
    </div>
  `;
}

// Bloque completo "Historial del sistema": encabezado con contador DERIVADO
// de los datos (nunca hardcodeado), estado vacío o la lista de tarjetas.
//
// C2E-4E4 / F4 — segundo parámetro OPCIONAL de opciones para poder emitir
// el botón «Registrar mantención» SIN alterar el contrato de F3: los
// llamados de F3 siguen pasando un solo argumento y por tanto siguen sin
// botón (ningún cambio visual en las pruebas previas).
//   opciones.conBotonRegistro = true  → la vista habilita el alta
//                                       (en F4, SOLO Catálogo General)
//   opciones.elementoId               → id real del elemento de la ficha
// El botón se emite además SOLO si hay administración operativa vigente
// (permanente o temporal): es un control de UX, la autorización real la
// impone la RPC del backend.
function mntBloqueOperativasHTML(operativas = [], opciones = {}) {
  const lista = Array.isArray(operativas) ? operativas : [];
  const anuladas = lista.filter(o => o && o.anulada === true).length;

  const resumen = lista.length ? `
        <span class="text-[10px] font-black px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          ${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}${anuladas ? ` · ${anuladas} anulada${anuladas === 1 ? '' : 's'}` : ''}
        </span>` : '';

  // Gate doble de UX (nunca de seguridad): habilitación explícita de la
  // vista + helper de permisos con guard de existencia de función.
  const habilitaRegistro = opciones && opciones.conBotonRegistro === true &&
    opciones.elementoId !== null && opciones.elementoId !== undefined &&
    String(opciones.elementoId).trim() !== '';
  const esAdminOperativo = typeof window.esAdminOperativoActual === 'function' &&
    window.esAdminOperativoActual() === true;
  const botonRegistro = (habilitaRegistro && esAdminOperativo) ? `
        <button type="button" onclick="abrirModalRegistrarMantencion('${mntEsc(String(opciones.elementoId))}')"
          class="alm-btn-secondary">
          <span aria-hidden="true">🛠️</span>
          <span>${opciones.programarTarea ? 'Registrar mantención realizada' : 'Registrar mantención'}</span>
        </button>` : '';

  const botonTarea = opciones.programarTarea ? mntBotonProgramarTareaHTML(opciones.elementoId) : '';
  const contenido = lista.length
    ? mntHistorialPaginadoHTML(lista.length, 'Historial del sistema', `<ul class="space-y-3">${mntOrdenarHistorialReciente(lista).map(o => `<li>${mntTarjetaOperativaHTML(o, {
      // C2E-4E4 / F5: la habilitación de anulación se propaga a cada
      // tarjeta; dentro de ella se aplica además el gate de admin
      // permanente y el filtro de vigencia (nunca una anulada).
      conBotonAnulacion: !!(opciones && opciones.conBotonAnulacion === true),
      soloFechaRegistro: opciones.soloFechaRegistro === true
    })}</li>`).join('')}</ul>`)
    : `
      <div class="text-center py-6 space-y-1.5">
        <span class="text-2xl block">🗓️</span>
        <p class="text-xs font-bold text-slate-600 dark:text-slate-300">Todavía no hay mantenciones registradas desde el sistema.</p>
        <p class="text-[11px] text-slate-400 dark:text-slate-500">Los trabajos que se registren aquí se mostrarán separados del historial importado de Excel.</p>
      </div>`;

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Historial del sistema</h4>
        <span class="flex flex-wrap items-center gap-2">${resumen}${botonRegistro}${botonTarea}</span>
      </div>${contenido}
    </div>
  `;
}

// ==========================================================
// C2E-4E4 / F4 — REGISTRAR MANTENCIÓN (Catálogo General e Historial)
// ==========================================================
// Modal de ALTA de una mantención operativa sobre UN elemento del Catálogo
// General, con el mismo patrón de las modales dinámicas existentes
// (asegurarModal* / abrirModal* / cerrarModal* + Escape con capture +
// backdrop que cierra + bloque de error que nunca cierra el formulario).
//
// REGLAS DE ESTA FASE:
// - Campos: fecha de realización (input date), responsable (trabajador activo) y
//   detalle del trabajo (textarea), los tres OBLIGATORIOS. NO existen
//   campos de autor ni de fecha de registro: ambos los asignan los
//   triggers del backend server-side y aquí NI SIQUIERA se envían.
// - Única escritura: MantencionesService.registrarMantencionOperativa
//   (RPC mantencion_registrar_mantencion_v2). Cero .insert()/.update().
// - El gating de administración operativa es SOLO UX: la autorización
//   real la impone la RPC; cualquier rechazo backend se muestra tal cual,
//   sin simular éxito y conservando lo escrito en el formulario.
// - Tras el éxito: el service ya invalidó su caché y aquí se repinta SOLO
//   la ficha del elemento afectado, con guard anti-carrera y relectura
//   forzada para ver la fila recién creada con su auditoría real.
// - El historial importado de Excel y sus contadores (66 elementos / 64
//   mantenciones de catálogo) NO se tocan: los KPI salen de
//   public.mantenciones, de donde estas filas no se leen.

// Id del overlay y nombre del canal de error (nombres únicos en el archivo).
const MNT_MODAL_REGISTRAR_MANTENCION_ID = 'mnt-modal-registrar-mantencion';
const MNT_ERROR_REGISTRAR_MANTENCION_ID = 'mnt-registrar-mantencion-error';

// Guard anti doble envío (mismo patrón que mntAnulacionEngraseGuardando):
// se activa ANTES de la RPC y se libera solo en las rutas finales.
let mntRegistroMantencionGuardando = false;

// Contexto de la ficha que abrió la modal. Se usa SOLO para identificar el
// elemento de la RPC; el nombre mostrado en el modal se resuelve desde
// mntElementosBase en el momento del render.
let mntRegistroMantencionElementoId = null;
let mntRegistroMantencionActorId = null;

// ==========================================================
// C2E-4E4 / F5 — ANULACIÓN DE MANTENCIONES OPERATIVAS (Catálogo)
// ==========================================================
// Misma arquitectura que el registro de F4 (overlay único + contenido por
// apertura + Escape con capture + backdrop + bloque de error que nunca
// cierra el formulario + guard anti doble envío), pero sobre la RPC
// mantencion_anular_mantencion.
//
// REGLAS DE ESTA FASE:
// - El botón «Anular mantención» existe SOLO en tarjetas operativas VIGENTES
//   de la ficha del Catálogo General y SOLO para administrador PERMANENTE
//   (esAdminPermanenteActual): un administrador temporal puede registrar
//   mantenciones, pero no anular. Es control de UX; la autoridad es la RPC.
// - Única escritura: MantencionesService.anularMantencionOperativa
//   ({ mantencionId, motivo }). Sin DELETE/UPDATE/INSERT; el registro se
//   conserva íntegro y queda marcado como ANULADA con su auditoría.
// - El motivo es OBLIGATORIO y se valida con trim() ANTES de la RPC.
// - Token real de doble anulación: MANTENCION_YA_ANULADA (el de
//   REGISTRO_YA_ANULADO pertenece a mantencion_anular_historial y NO se
//   usa aquí). En ese caso se informa al usuario y se actualiza la ficha.
const MNT_MODAL_ANULAR_MANTENCION_ID = 'mnt-modal-anular-mantencion';
const MNT_ERROR_ANULAR_MANTENCION_ID = 'mnt-anular-mantencion-error';

// Mensaje del aviso de ERROR DE LECTURA del historial operativo (F5 §1):
// se distingue de "cargado y vacío" y de "sin integración" (Máquinas).
const MNT_MENSAJE_ERROR_HISTORIAL_OPERATIVO = 'No fue posible cargar el historial del sistema';

// Guard anti doble envío de la anulación (se libera SOLO en las rutas
// finales del submit, nunca al cerrar la ventana).
let mntAnulacionMantencionGuardando = false;

// Mantención seleccionada en la modal de anulación (id real; nunca se
// muestra al usuario).
let mntAnulacionMantencionId = null;

// Contexto DEFENSIVO de la ficha abierta: operativas por id, repoblado en
// cada pintado de ficha y vaciado al cerrarla. El modal y el submit solo
// aceptan ids presentes aquí: nunca se anula algo que no se está viendo.
const mntOperativasFichaPorId = new Map();

function mntGuardarOperativasFichaActual(lista) {
  mntOperativasFichaPorId.clear();
  (Array.isArray(lista) ? lista : []).forEach(op => {
    if (op && op.id !== null && op.id !== undefined) mntOperativasFichaPorId.set(String(op.id), op);
  });
}

function mntLimpiarOperativasFichaActual() {
  mntOperativasFichaPorId.clear();
}

function mntOperativaFichaActual(mantencionId) {
  const id = (mantencionId === null || mantencionId === undefined) ? '' : String(mantencionId);
  if (!id) return null;
  return mntOperativasFichaPorId.get(id) || null;
}

// ==========================================================
// C2E-4E4 / F6 — CONTEXTO DE LA FICHA OPERATIVA ACTIVA
// ==========================================================
// Existe UNA sola ficha de historial operativo a la vez: la del Catálogo
// General, Mantención de Máquinas o Baños. Los modales de registro (F4) y
// de anulación (F5) son ÚNICOS y compartidos, por lo que necesitan saber
// de qué apartado viene la acción:
//   origen      → 'catalogo' | 'maquinas' | 'banos' (procedencia de la acción)
//   elementoId  → elemento de ESA ficha (nunca el de la otra)
//   contenedorId→ dónde vive la ficha (para avisos transitorios)
//   repintar    → repintado PROPIO de ese apartado, con su guard anti-
//                 carrera correspondiente.
// Así un registro seleccionado en el Catálogo jamás se confunde con uno de
// Máquinas, y el repintado posterior siempre toca el contenedor correcto.
let mntOperativasContexto = null;

function mntFijarContextoOperativas(contexto) {
  const ctx = (contexto && typeof contexto === 'object') ? contexto : null;
  mntOperativasContexto = (ctx && ctx.elementoId && typeof ctx.repintar === 'function')
    ? {
      origen: ['maquinas', 'banos'].includes(ctx.origen) ? ctx.origen : 'catalogo',
      elementoId: String(ctx.elementoId),
      contenedorId: (typeof ctx.contenedorId === 'string' && ctx.contenedorId) ? ctx.contenedorId : 'mnt-ficha-elemento',
      repintar: ctx.repintar,
      // Elemento REAL de ESA ficha (catálogo o máquina). Sirve para que el
      // formulario de registro muestre el contexto verdadero del apartado de
      // origen sin depender de mntElementosBase (que solo contiene el
      // Catálogo y excluiría las máquinas). No aporta datos inventados: es
      // el mismo objeto que se está pintando.
      elemento: (ctx.elemento && typeof ctx.elemento === 'object') ? ctx.elemento : null
    }
    : null;
}

// Limpieza CONDICIONAL: un apartado solo puede borrar su propio contexto
// (si Máquinas limpia el suyo, no debe borrar el del Catálogo y viceversa).
function mntLimpiarContextoOperativas(origen) {
  if (origen && mntOperativasContexto && mntOperativasContexto.origen !== origen) return;
  mntOperativasContexto = null;
}

function mntContextoOperativas() {
  return mntOperativasContexto;
}

// Repintado de la ficha operativa ACTIVA tras una escritura (registro o
// anulación) o tras un reintento de lectura, sea del apartado que sea: si
// el contexto corresponde a ese elemento se usa SU repintado (Catálogo o
// Máquinas); si no, se cae al repintado clásico del Catálogo, que ya aplica
// su guard anti-carrera. Así un único camino sirve a los dos apartados sin
// duplicar la lógica de repintado.
async function mntRepintarFichaContextoOperativa(elementoId) {
  const id = (elementoId === null || elementoId === undefined) ? '' : String(elementoId);
  if (!id) return;

  const ctx = mntOperativasContexto;
  if (ctx && ctx.elementoId === id && typeof ctx.repintar === 'function') {
    await ctx.repintar();
    return;
  }

  await mntRepintarFichaOperativa(id, true);
}

// Aviso TRANSITORIO (role="status", accesible) insertado al inicio de la
// ficha activa. Vive hasta el siguiente repintado de esa ficha: sirve para
// informar algo que ocurrió al cerrar un formulario (por ejemplo, que el
// registro ya estaba anulado) sin depender de una modal ya cerrada.
function mntInsertarAvisoFichaOperativa(mensaje) {
  const texto = (typeof mensaje === 'string' && mensaje.trim() !== '')
    ? mensaje.trim()
    : 'La ficha se ha actualizado.';
  const contenedorId = (mntOperativasContexto && mntOperativasContexto.contenedorId)
    ? mntOperativasContexto.contenedorId
    : 'mnt-ficha-elemento';
  const cont = document.getElementById(contenedorId);
  if (!cont || typeof cont.insertAdjacentHTML !== 'function') return;

  cont.insertAdjacentHTML('afterbegin', `
    <div role="status" class="mb-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-[11px] font-bold text-amber-800 dark:text-amber-300 leading-relaxed">
      ⚠️ ${mntEsc(texto)}
    </div>
  `);
}

// Lectura del historial operativo CON sus tres resultados explícitos
// (ok con datos / ok vacío / error), compartida por el Catálogo (F4/F5) y
// por Máquinas (F6) para que NO existan dos versiones del mismo patrón.
// El error NUNCA se representa como cero registros.
async function mntCargarEstadoOperativasFicha(elementoId, force = false) {
  try {
    const lista = await window.MantencionesService.getMantencionesOperativasPorElemento(elementoId, force);
    return { ok: true, lista: Array.isArray(lista) ? lista : [], aviso: null };
  } catch (e) {
    console.error('Error cargando el historial operativo de la ficha:', e);
    return { ok: false, lista: null, aviso: MNT_MENSAJE_ERROR_HISTORIAL_OPERATIVO };
  }
}

// Crea el overlay una sola vez, con roles de accesibilidad. El contenido
// se inyecta en cada apertura.
function asegurarModalRegistrarMantencion() {
  let overlay = document.getElementById(MNT_MODAL_REGISTRAR_MANTENCION_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MNT_MODAL_REGISTRAR_MANTENCION_ID;
  overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Registrar mantención');
  overlay.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      onclick="event.stopPropagation()">
      <div class="flex items-start justify-between gap-3">
        <h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">Registrar mantención</h3>
        <button type="button" onclick="cerrarModalRegistrarMantencion()"
          aria-label="Cerrar"
          class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none font-bold shrink-0">×</button>
      </div>
      <div id="${MNT_ERROR_REGISTRAR_MANTENCION_ID}" class="hidden bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl p-3 text-[11px] font-bold text-rose-700 dark:text-rose-300"></div>
      <div id="mnt-registrar-mantencion-contenido"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// Escape cierra SOLO la modal visible; se registra en capture y se limpia
// al cerrar, igual que el resto de las modales del módulo.
function mntTeclaEscapeRegistrarMantencion(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

// Contenido del formulario: contexto del elemento (desde mntElementosBase,
// o — si no está en esa lista, p.ej. una máquina en F6 — desde el elemento
// de la ficha ACTIVA; sin inventar datos si no hay ninguno de los dos) +
// los 3 campos obligatorios. SIN campos de autoría ni de fecha de registro
// (las asigna el backend).
function mntContenidoModalRegistrarMantencionHTML(elementoId) {
  const listaElementos = Array.isArray(mntElementosBase) ? mntElementosBase : [];
  // F6: si el elemento no está en la base del Catálogo (las máquinas nunca
  // lo están), se usa el de la ficha activa SOLO cuando corresponde a ESTE
  // elemento: así el formulario muestra el apartado correcto y nunca etiqueta
  // una máquina como "Elemento del catálogo".
  const ctxActual = mntOperativasContexto;
  const elementoContexto = (ctxActual && ctxActual.elementoId === String(elementoId) && ctxActual.elemento)
    ? ctxActual.elemento
    : null;
  const elemento = listaElementos.find(x => x && String(x.id) === String(elementoId)) || elementoContexto;

  const nombreElemento = elemento
    ? mntEsc(mntSinDato(elemento.nombre_original))
    : 'Elemento del catálogo';
  const ubicacionElemento = elemento
    ? mntEsc(mntSinDato(mntNombreUbicacion(elemento)))
    : 'Sin dato registrado';
  const categoriaElemento = ctxActual && ctxActual.origen === 'banos' && elementoContexto
    ? 'Baño' : elemento
    ? mntEsc(mntSinDato(mntEtiquetaCategoria(elemento.hoja_origen)))
    : 'Sin dato registrado';

  return `
    <div class="space-y-1 pb-3 mb-1 border-b border-slate-200 dark:border-slate-800">
      <p class="text-xs font-black text-blue-700 dark:text-blue-300 truncate">${nombreElemento}</p>
      <p class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">${categoriaElemento} · ${ubicacionElemento}</p>
      <p class="text-[10px] text-slate-400 dark:text-slate-500">El autor y la fecha de registro se asignan automáticamente al guardar.</p>
    </div>

    <form onsubmit="mntEnviarRegistrarMantencion(event)" class="space-y-3">
      <div>
        <label for="mnt-registrar-mantencion-fecha"
          class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
          Fecha de realización <span class="text-rose-500">*</span>
        </label>
        <input type="date" id="mnt-registrar-mantencion-fecha"
          class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none" />
      </div>

      <div>
        <label for="mnt-registrar-mantencion-responsable"
          class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
          Responsable del trabajo <span class="text-rose-500">*</span>
        </label>
        <input type="search" id="mnt-buscar-responsable" aria-label="Buscar trabajador por nombre o cargo"
          placeholder="Buscar trabajador" autocomplete="off" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none mb-2" />
        <div id="mnt-responsables-filas" class="space-y-2"><div class="flex items-center gap-2"><select data-mnt-responsable id="mnt-registrar-mantencion-responsable" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none" aria-describedby="mnt-responsable-aviso" disabled>
          <option value="">Selecciona un trabajador</option>
        </select><button type="button" data-mnt-agregar title="Agregar trabajador" aria-label="Agregar trabajador" class="alm-btn-secondary mt-2" disabled>+</button></div></div>
        <p id="mnt-responsable-aviso" class="text-xs alm-muted mt-1" role="status"></p>
      </div>

      <div>
        <label for="mnt-registrar-mantencion-detalle"
          class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
          Detalle del trabajo realizado <span class="text-rose-500">*</span>
        </label>
        <textarea id="mnt-registrar-mantencion-detalle" rows="3" maxlength="1000"
          placeholder="Qué se hizo, repuestos, observaciones..."
          class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none resize-y"></textarea>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
        <button type="button" onclick="cerrarModalRegistrarMantencion()"
          class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
          Cancelar
        </button>
        <button type="submit" id="mnt-registrar-mantencion-submit"
          class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
          <span id="mnt-registrar-mantencion-submit-label">Registrar mantención</span>
        </button>
      </div>
    </form>
  `;
}

// Abre la modal. Se rechaza la apertura si no hay administración operativa
// vigente o si ya hay un registro en vuelo (nunca se genera una segunda
// vía de escritura).
function mntIniciarSelectorResponsable(overlay) {
  const buscar = overlay.querySelector('#mnt-buscar-responsable');
  const filas = overlay.querySelector('#mnt-responsables-filas');
  const sumar = overlay.querySelector('[data-mnt-agregar]');
  const aviso = overlay.querySelector('#mnt-responsable-aviso');
  const actor = state.currentUser?.id;
  const vigente = () => actor && actor === state.currentUser?.id && window.esAdminOperativoActual?.() && buscar.isConnected && !overlay.classList.contains('hidden');
  const elegidos = new Map(); let trabajadores = [], cargando = true, abriendo = false;
  const normalizar = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const selects = () => [...filas.querySelectorAll('select')];
  function pintar() {
    const all = selects(), filtro = normalizar(buscar.value.trim());
    for (const select of all) {
      const valor = elegidos.get(select) || '';
      select.replaceChildren(new Option('Selecciona un trabajador',''));
      for (const w of trabajadores) {
        if (w.id !== valor && !normalizar(w.nombre + ' ' + (w.cargo || '')).includes(filtro)) continue;
        const opt = new Option([w.nombre,w.cargo].filter(Boolean).join(' · '),w.id);
        opt.disabled = all.some(other => other !== select && elegidos.get(other) === w.id);
        select.add(opt);
      }
      select.add(new Option('+ Registrar trabajador sin cuenta','nuevo'));
      select.value = valor; select.disabled = cargando;
    }
    sumar.disabled = cargando || all.some(s => !elegidos.get(s)) || all.length >= trabajadores.length;
  }
  async function cargar(nuevo, select) {
    cargando = true; pintar(); aviso.textContent = 'Cargando trabajadores…';
    try {
      const result = await window.TrabajadoresService.getTrabajadores(true);
      if (!vigente()) return;
      trabajadores = result.filter(w => w.estado === 'Activo');
      if (nuevo?.id && nuevo.estado === 'Activo' && !trabajadores.some(w => w.id === nuevo.id)) trabajadores.push(nuevo);
      if (select && nuevo?.id) elegidos.set(select,nuevo.id);
      for (const s of selects()) if (!trabajadores.some(w => w.id === elegidos.get(s))) elegidos.set(s,'');
      cargando = false; aviso.textContent = trabajadores.length ? '' : 'No hay trabajadores activos. Puedes registrar uno.';
    } catch { if (!vigente()) return; aviso.textContent = 'No se pudieron verificar los trabajadores. Cierra y vuelve a abrir el formulario.'; }
    pintar();
  }
  function conectar(select) {
    elegidos.set(select,'');
    select.onchange = async () => {
      if (!vigente() || cargando || abriendo || mntRegistroMantencionGuardando) return;
      if (select.value !== 'nuevo') {
        const value = select.value;
        elegidos.set(select, trabajadores.some(w => w.id === value) && !selects().some(s => s !== select && elegidos.get(s) === value) ? value : '');
        pintar(); return;
      }
      select.value = elegidos.get(select) || ''; abriendo = true;
      try {
        if (!await revalidarPrivilegioParaEscritura() || !vigente()) return;
        let modal, zIndex;
        abrirTrabajadorFormulario('nuevo',null,{
          alCerrar(){ overlay.inert=false; if(modal)modal.style.zIndex=zIndex; if(vigente())select.focus(); },
          alGuardar(nuevo){ if(vigente())return cargar(nuevo,select); }
        });
        modal=document.getElementById('modal-trabajador-form');
        if(modal&&!modal.classList.contains('hidden')) { zIndex=modal.style.zIndex;modal.style.zIndex='80';overlay.inert=true;document.getElementById('tform-nombre')?.focus(); }
      } catch { if(vigente())mntMostrarErrorRegistrarMantencion('No se pudo abrir el formulario de trabajador.'); }
      finally { abriendo=false; }
    };
  }
  conectar(filas.querySelector('select'));
  sumar.onclick=()=>{
    if(!vigente()||sumar.disabled||mntRegistroMantencionGuardando)return;
    const fila=document.createElement('div');fila.className='flex items-center gap-2';
    fila.innerHTML='<select data-mnt-responsable aria-label="Responsable adicional" class="w-full px-3 py-2 rounded-xl border"></select><button type="button" class="alm-btn-secondary" aria-label="Quitar trabajador">×</button>';
    const select=fila.querySelector('select');select.className=filas.querySelector('select').className;conectar(select);
    fila.querySelector('button').onclick=()=>{if(!vigente()||mntRegistroMantencionGuardando)return;elegidos.delete(select);fila.remove();pintar();};
    filas.appendChild(fila);pintar();select.focus();
  };
  buscar.oninput=()=>{if(vigente()&&!cargando)pintar();};
  cargar();
}

function abrirModalRegistrarMantencion(elementoId) {
  // Anti doble RPC: si ya hay una anulación/registro en curso no se abre.
  if (mntRegistroMantencionGuardando) {
    console.warn('mntRegistroMantencionGuardando activo: se omite abrir el modal.');
    return;
  }

  const id = (elementoId === null || elementoId === undefined) ? '' : String(elementoId).trim();
  if (!id) return;

  // C2E-4E4 / F6 §7 — procedencia de la acción: si hay una ficha operativa
  // ACTIVA (Catálogo o Máquinas) y el botón que se pulsó pertenece a OTRA,
  // no se abre el formulario (evita registrar "para" un elemento que no es
  // el que se está viendo). Sin contexto se mantiene la apertura clásica de
  // F4: la autoridad real la vuelve a ejercer el backend.
  if (mntOperativasContexto && mntOperativasContexto.elementoId !== id) {
    console.warn('Registrar mantención: el elemento no corresponde a la ficha activa, se omite la apertura.');
    return;
  }

  // Gating UX: el backend vuelve a validar; aquí solo evitamos mostrar la
  // modal a quien no tiene permiso.
  const esAdminOperativo = typeof window.esAdminOperativoActual === 'function' &&
    window.esAdminOperativoActual() === true;
  if (!esAdminOperativo) {
    console.warn('Registrar mantención: sin administración operativa vigente, se omite la apertura.');
    return;
  }

  const overlay = asegurarModalRegistrarMantencion();
  const contenido = document.getElementById('mnt-registrar-mantencion-contenido');
  if (!overlay || !contenido) return;

  mntRegistroMantencionElementoId = id;
  mntRegistroMantencionActorId = state.currentUser?.id;
  contenido.innerHTML = mntContenidoModalRegistrarMantencionHTML(id);

  const errorBox = document.getElementById(MNT_ERROR_REGISTRAR_MANTENCION_ID);
  if (errorBox) {
    errorBox.textContent = '';
    errorBox.classList.add('hidden');
  }

  overlay.classList.remove('hidden');
  mntIniciarSelectorResponsable(overlay);
  document.removeEventListener('keydown', mntTeclaEscapeRegistrarMantencion, true);
  document.addEventListener('keydown', mntTeclaEscapeRegistrarMantencion, true);
}

// Cierra la modal SIN tocar el guard de envío: si hay una RPC en vuelo,
// cerrar la ventana no debe permitir lanzar un segundo registro.
function cerrarModalRegistrarMantencion() {
  const overlay = document.getElementById(MNT_MODAL_REGISTRAR_MANTENCION_ID);
  if (overlay) overlay.classList.add('hidden');
  document.removeEventListener('keydown', mntTeclaEscapeRegistrarMantencion, true);
  mntRegistroMantencionElementoId = null;
  mntRegistroMantencionActorId = null;
}

// Bloque de error (textContent: nunca HTML del usuario ni del backend).
function mntMostrarErrorRegistrarMantencion(mensaje) {
  const caja = document.getElementById(MNT_ERROR_REGISTRAR_MANTENCION_ID);
  if (!caja) return;
  caja.textContent = (typeof mensaje === 'string' && mensaje.trim() !== '')
    ? mensaje.trim()
    : 'No se pudo registrar la mantención.';
  caja.classList.remove('hidden');
}

// Ruta de ENVÍO en curso: se deshabilita el botón mientras la RPC resuelve,
// evitando registros duplicados ante doble clic o doble Enter.
function mntMarcarSubmitRegistrarMantencionEnviando() {
  const btn = document.getElementById('mnt-registrar-mantencion-submit');
  const etiqueta = document.getElementById('mnt-registrar-mantencion-submit-label');
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Registrando...';
}

// Restauración del botón. Se libera el guard SOLO en el submit (éxito o
// error), nunca al cerrar la ventana, para que un cierre durante una RPC
// no habilite una segunda escritura.
function mntRestaurarSubmitRegistrarMantencion() {
  mntRegistroMantencionGuardando = false;
  const btn = document.getElementById('mnt-registrar-mantencion-submit');
  const etiqueta = document.getElementById('mnt-registrar-mantencion-submit-label');
  if (btn) btn.disabled = false;
  if (etiqueta) etiqueta.textContent = 'Registrar mantención';
}

// SUBMIT: única escritura de registro de mantención desde la vista, vía
// MantencionesService.registrarMantencionOperativa (RPC). Los tres campos
// se validan con trim() ANTES de la RPC (vacío ⇒ error local, sin llamada).
// NO se envía registrado_por, autor_nombre_snapshot, created_at,
// archivo_origen ni hoja_origen: los asigna el backend.
async function mntEnviarRegistrarMantencion(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  // Anti doble envío: mientras la RPC está en vuelo se ignoran los submits.
  if (mntRegistroMantencionGuardando || !window.esAdminOperativoActual?.() ||
      !mntRegistroMantencionActorId || mntRegistroMantencionActorId !== state.currentUser?.id) return;

  const inputFecha = document.getElementById('mnt-registrar-mantencion-fecha');
  const inputResponsable = document.getElementById('mnt-registrar-mantencion-responsable');
  const inputDetalle = document.getElementById('mnt-registrar-mantencion-detalle');

  const elementoId = mntRegistroMantencionElementoId;
  const fecha = (inputFecha && typeof inputFecha.value === 'string') ? inputFecha.value.trim() : '';
  const selectors = [...(document.getElementById('mnt-responsables-filas')?.querySelectorAll('select') || [])];
  const trabajadoresIds = selectors.filter(s => s.value).map(s => s.value);
  const detalle = (inputDetalle && typeof inputDetalle.value === 'string') ? inputDetalle.value.trim() : '';

  if (!elementoId) {
    mntMostrarErrorRegistrarMantencion('No se pudo identificar el elemento a mantener. Cierra la ventana y vuelve a abrir la ficha.');
    return;
  }
  if (!fecha) {
    mntMostrarErrorRegistrarMantencion('Indica la fecha en que se realizó el trabajo.');
    return;
  }
  if (!trabajadoresIds.length || selectors.some(s => s.disabled) || trabajadoresIds.some(id => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) || new Set(trabajadoresIds).size !== trabajadoresIds.length) {
    mntMostrarErrorRegistrarMantencion('Selecciona trabajadores activos sin repetirlos.');
    return;
  }
  if (!detalle) {
    mntMostrarErrorRegistrarMantencion('Describe el trabajo realizado.');
    return;
  }

  mntRegistroMantencionGuardando = true;
  mntMarcarSubmitRegistrarMantencionEnviando();

  try {
    if (!window.MantencionesService ||
        typeof window.MantencionesService.registrarMantencionOperativa !== 'function') {
      throw new Error('MantencionesService no está disponible.');
    }

    await window.MantencionesService.registrarMantencionOperativa({
      elementoId,
      fechaRealizacion: fecha,
      trabajadoresIds,
      detalleTrabajo: detalle
    });

    // ÉXITO: la escritura quedó confirmada por el backend. Se cierra la
    // modal y se repinta SOLO la ficha del elemento afectado, usando el
    // repintado del apartado de ORIGEN (Catálogo o Máquinas; F6). Force
    // para garantizar la fila nueva con su auditoría real. Los históricos
    // de Excel y sus contadores quedan intactos por diseño.
    cerrarModalRegistrarMantencion();
    await mntRepintarFichaContextoOperativa(elementoId);
  } catch (e) {
    // ERROR: la modal PERMANECE ABIERTA con el formulario cargado; nunca
    // se simula éxito. El texto mostrado es el del backend si existe
    // (incluida la negación de permisos), si no, un mensaje genérico.
    const mensaje = (e && typeof e.message === 'string' && e.message.trim() !== '')
      ? e.message.trim()
      : 'No fue posible registrar la mantención. Intenta nuevamente.';
    const trabajadorNoDisponible = e?.detalle?.code === '23503' ||
      /trabajador|responsable/i.test(mensaje) && /activ|elimin|exist|encontr|invalid|disponib/i.test(mensaje);
    mntMostrarErrorRegistrarMantencion(trabajadorNoDisponible
      ? 'El trabajador ya no está activo o no existe. Selecciona otro trabajador.'
      : mensaje);
  } finally {
    mntRestaurarSubmitRegistrarMantencion();
  }
}

// Repinta SOLO la ficha del elemento afectado, con guard anti-carrera: si
// el usuario abrió otra ficha mientras la RPC estaba en vuelo, la respuesta
// NO se pinta (mntCargarFichaElemento valida que el id solicitado siga
// seleccionado antes de escribir en el contenedor).
//
// C2E-4E4 / F5 — segundo parámetro opcional para forzar la relectura del
// historial operativo. Por defecto true: repintar siempre se hace después
// de una escritura (registro en F4, anulación en F5) o de un reintento de
// lectura, casos en los que hay que garantizar datos frescos de Supabase.
async function mntRepintarFichaOperativa(elementoId, forzarOperativas = true) {
  const id = (elementoId === null || elementoId === undefined) ? '' : String(elementoId);
  if (!id) return;
  if (String(mantencionElementoSeleccionado) !== id) return;

  const cont = document.getElementById('mnt-ficha-elemento');
  if (!cont) return;

  await mntCargarFichaElemento(id, forzarOperativas);
}

// ==========================================================
// C2E-4E4 / F5 — AVISO DE ERROR DE LECTURA + ANULACIÓN (Catálogo)
// ==========================================================

// Aviso emitido cuando la consulta del historial operativa FALLÓ. Se
// distingue a propósito del estado vacío ("Todavía no hay...") y de la
// vista sin integración (Máquinas, que no emite ningún bloque). La ficha y
// el historial importado de Excel permanecen visibles completos.
function mntBotonProgramarTareaHTML(elementoId) {
  if (!elementoId || !window.esAdminOperativoActual?.()) return '';
  return `<button type="button" class="alm-btn-secondary" onclick="mqaProgramarTarea('${mntEsc(elementoId)}')">Programar tarea</button>`;
}

function mntAvisoOperativasHTML(mensaje, elementoId, programarTarea = false) {
  const id = (elementoId === null || elementoId === undefined) ? '' : String(elementoId);
  const texto = (typeof mensaje === 'string' && mensaje.trim() !== '')
    ? mensaje.trim()
    : MNT_MENSAJE_ERROR_HISTORIAL_OPERATIVO;

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Historial del sistema</h4>
      <div class="mt-3 rounded-2xl p-4 border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 space-y-2">
        <p class="text-xs font-bold text-amber-800 dark:text-amber-300">⚠️ ${mntEsc(texto)}</p>
        <p class="text-[11px] font-semibold text-amber-700 dark:text-amber-400 leading-relaxed">
          No se mostraron las mantenciones registradas desde el sistema. El historial importado de Excel se muestra completo más abajo.
        </p>
        ${id ? `
        <button type="button" onclick="mntReintentarHistorialOperativo('${mntEsc(id)}')"
          class="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shadow-lg shadow-amber-600/20 transition-all">
          <span aria-hidden="true">🔄</span>
          <span>Reintentar</span>
        </button>` : ''}
        ${programarTarea ? mntBotonProgramarTareaHTML(id) : ''}
      </div>
    </div>
  `;
}

// Reintento de la lectura operativa desde el propio aviso. Usa la MISMA
// vía que el repintado tras una escritura: el repintado del apartado de
// ORIGEN (Catálogo o Máquinas, vía contexto; F6), con su guard anti-carrera
// correspondiente (si el usuario ya abrió otra ficha, la respuesta no la
// pisa) y relectura forzada del historial operativo.
async function mntReintentarHistorialOperativo(elementoId) {
  await mntRepintarFichaContextoOperativa(elementoId);
}

// Crea el overlay de anulación una sola vez, con roles de accesibilidad.
function asegurarModalAnularMantencion() {
  let overlay = document.getElementById(MNT_MODAL_ANULAR_MANTENCION_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MNT_MODAL_ANULAR_MANTENCION_ID;
  overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Anular mantención');
  overlay.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      onclick="event.stopPropagation()">
      <div class="flex items-start justify-between gap-3">
        <h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">Anular mantención</h3>
        <button type="button" onclick="cerrarModalAnularMantencion()"
          aria-label="Cerrar"
          class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none font-bold shrink-0">×</button>
      </div>
      <div id="${MNT_ERROR_ANULAR_MANTENCION_ID}" class="hidden bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl p-3 text-[11px] font-bold text-rose-700 dark:text-rose-300"></div>
      <div id="mnt-anular-mantencion-contenido"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// Escape cierra SOLO la modal visible; se registra en capture y se limpia
// al cerrar, igual que el resto de las modales del módulo.
function mntTeclaEscapeAnularMantencion(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

// Contenido: contexto REAL de la mantención (tomado del Map de la ficha
// abierta, nunca de texto de la UI), la advertencia de que la anulación
// CONSERVA el historial y el campo obligatorio del motivo. SIN campos de
// autoría ni de fecha de anulación (los asigna el backend).
function mntContenidoModalAnularMantencionHTML(reg) {
  const r = (reg && typeof reg === 'object') ? reg : {};

  const fechaReal = mntFormatoFechaCorta(r.fecha_realizacion);
  const responsable = (r.responsable_texto === null || r.responsable_texto === undefined || r.responsable_texto === '')
    ? 'Sin responsable registrado'
    : mntEsc(r.responsable_texto);
  const detalle = (r.detalle_trabajo === null || r.detalle_trabajo === undefined || r.detalle_trabajo === '')
    ? 'Sin detalle registrado'
    : mntEsc(r.detalle_trabajo);
  const autorRegistro = (typeof (window.UsuariosService?.nombreParaMostrar?.(r,'autor_nombre_snapshot') ?? r.autor_nombre_snapshot) === 'string' && (window.UsuariosService?.nombreParaMostrar?.(r,'autor_nombre_snapshot') ?? r.autor_nombre_snapshot).trim() !== '')
    ? mntEsc((window.UsuariosService?.nombreParaMostrar?.(r,'autor_nombre_snapshot') ?? r.autor_nombre_snapshot).trim())
    : 'Autor no registrado';
  const fechaRegistro = mntFechaHoraRevisionTexto(r.created_at);

  return `
    <div class="space-y-1 pb-3 mb-1 border-b border-slate-200 dark:border-slate-800">
      <p class="text-xs font-black text-slate-800 dark:text-white">Mantención registrada en el sistema</p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Fecha de realización: ${fechaReal ? mntEsc(fechaReal) : 'Sin fecha registrada'}</p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Responsable: ${responsable}</p>
      <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed break-words whitespace-pre-line">Detalle: ${detalle}</p>
      <p class="text-[10px] text-slate-400 dark:text-slate-500 font-semibold break-words">Registrada por: ${autorRegistro} · ${mntEsc(fechaRegistro)}</p>
    </div>

    <div class="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-[11px] font-bold text-amber-800 dark:text-amber-300 leading-relaxed">
      ⚠️ La anulación NO borra ni modifica el registro: el trabajo queda visible en el historial marcado como ANULADA, junto con este motivo, el autor y la fecha de la anulación. El historial importado de Excel no se toca.
    </div>

    <form onsubmit="mntEnviarAnularMantencion(event)" class="space-y-3 pt-1">
      <div>
        <label for="mnt-anular-mantencion-motivo"
          class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
          Motivo de la anulación <span class="text-rose-500">*</span>
        </label>
        <textarea id="mnt-anular-mantencion-motivo" rows="3" maxlength="500"
          placeholder="Por qué se anula este registro"
          class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-rose-500 focus:outline-none resize-y"></textarea>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
        <button type="button" onclick="cerrarModalAnularMantencion()"
          class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
          Cancelar
        </button>
        <button type="submit" id="mnt-anular-mantencion-submit"
          class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
          <span id="mnt-anular-mantencion-submit-label">Confirmar anulación</span>
        </button>
      </div>
    </form>
  `;
}

// Abre la modal. Se rechaza la apertura si no hay administración PERMANENTE
// vigente, si no hay ficha abierta o si el id no corresponde a una
// mantención VIGENTE de esa ficha (validación defensiva: el backend vuelve
// a comprobarlo todo, aquí solo se evita una vía inútil).
function abrirModalAnularMantencion(mantencionId) {
  // Anti doble RPC: si ya hay una anulación/registro en curso no se abre.
  if (mntAnulacionMantencionGuardando) {
    console.warn('mntAnulacionMantencionGuardando activo: se omite abrir el modal de anulación.');
    return;
  }

  const id = (mantencionId === null || mantencionId === undefined) ? '' : String(mantencionId).trim();
  if (!id) return;

  // Gating UX de F5: SOLO administrador permanente (un admin temporal puede
  // registrar mantenciones, pero no anularlas).
  const esAdminPermanente = typeof window.esAdminPermanenteActual === 'function' &&
    window.esAdminPermanenteActual() === true;
  if (!esAdminPermanente) {
    console.warn('Anular mantención: sin administración permanente vigente, se omite la apertura.');
    return;
  }

  if (!mntOperativasContexto && !mantencionElementoSeleccionado) {
    console.warn('Anular mantención: no hay una ficha operativa activa, se omite la apertura.');
    return;
  }

  const registro = mntOperativaFichaActual(id);
  if (!registro) {
    console.warn('Anular mantención: el registro no pertenece a la ficha abierta, se omite la apertura.');
    return;
  }
  if (registro.anulada === true) {
    console.warn('Anular mantención: el registro ya está anulado, se omite la apertura.');
    return;
  }

  const overlay = asegurarModalAnularMantencion();
  const contenido = document.getElementById('mnt-anular-mantencion-contenido');
  if (!overlay || !contenido) return;

  mntAnulacionMantencionId = id;
  contenido.innerHTML = mntContenidoModalAnularMantencionHTML(registro);

  const errorBox = document.getElementById(MNT_ERROR_ANULAR_MANTENCION_ID);
  if (errorBox) {
    errorBox.textContent = '';
    errorBox.classList.add('hidden');
  }

  overlay.classList.remove('hidden');
  document.removeEventListener('keydown', mntTeclaEscapeAnularMantencion, true);
  document.addEventListener('keydown', mntTeclaEscapeAnularMantencion, true);
}

// Cierra la modal SIN tocar el guard de envío: si hay una RPC en vuelo,
// cerrar la ventana no debe permitir lanzar una segunda anulación.
function cerrarModalAnularMantencion() {
  const overlay = document.getElementById(MNT_MODAL_ANULAR_MANTENCION_ID);
  if (overlay) overlay.classList.add('hidden');
  document.removeEventListener('keydown', mntTeclaEscapeAnularMantencion, true);
  mntAnulacionMantencionId = null;
}

// Bloque de error (textContent: nunca HTML del usuario ni del backend).
function mntMostrarErrorAnularMantencion(mensaje) {
  const caja = document.getElementById(MNT_ERROR_ANULAR_MANTENCION_ID);
  if (!caja) return;
  caja.textContent = (typeof mensaje === 'string' && mensaje.trim() !== '')
    ? mensaje.trim()
    : 'No fue posible anular la mantención.';
  caja.classList.remove('hidden');
}

// Ruta de ENVÍO en curso: se deshabilita el botón mientras la RPC resuelve,
// evitando dobles anulaciones ante doble clic o doble Enter.
function mntMarcarSubmitAnularMantencionEnviando() {
  const btn = document.getElementById('mnt-anular-mantencion-submit');
  const etiqueta = document.getElementById('mnt-anular-mantencion-submit-label');
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Anulando...';
}

// Restauración del botón. Se libera el guard SOLO en el submit (éxito o
// error), nunca al cerrar la ventana.
function mntRestaurarSubmitAnularMantencion() {
  mntAnulacionMantencionGuardando = false;
  const btn = document.getElementById('mnt-anular-mantencion-submit');
  const etiqueta = document.getElementById('mnt-anular-mantencion-submit-label');
  if (btn) btn.disabled = false;
  if (etiqueta) etiqueta.textContent = 'Confirmar anulación';
}

// SUBMIT: única escritura de anulación desde la vista, vía
// MantencionesService.anularMantencionOperativa (RPC). El motivo se valida
// con trim() ANTES de la RPC (vacío ⇒ error local, sin llamada). El id
// seleccionado se revalida DEFENSIVAMENTE contra el contexto de la ficha
// abierta: no se confía solo en el botón oculto.
async function mntEnviarAnularMantencion(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  // Anti doble envío: mientras la RPC está en vuelo se ignoran los submits.
  if (mntAnulacionMantencionGuardando) return;

  const inputMotivo = document.getElementById('mnt-anular-mantencion-motivo');
  const motivo = (inputMotivo && typeof inputMotivo.value === 'string') ? inputMotivo.value.trim() : '';
  const mantencionId = mntAnulacionMantencionId;

  // --- Validación defensiva (F5 §5 + F6 §7) ---
  // Se exige una ficha operativa ACTIVA (Catálogo o Máquinas). El Map de
  // contexto se repuebla al pintar ESA ficha y se vacía al cerrarla, por lo
  // que un registro del Catálogo jamás resulta anulable desde Máquinas ni
  // al revés.
  if (!mntOperativasContexto && !mantencionElementoSeleccionado) {
    mntMostrarErrorAnularMantencion('No hay una ficha abierta. Vuelve a abrir el elemento y reintenta.');
    return;
  }
  const registro = mntOperativaFichaActual(mantencionId);
  if (!registro) {
    mntMostrarErrorAnularMantencion('La mantención seleccionada ya no está disponible en esta ficha. Vuelve a cargarla.');
    return;
  }
  if (registro.anulada === true) {
    mntMostrarErrorAnularMantencion('Este registro ya fue anulado.');
    return;
  }
  if (!motivo) {
    mntMostrarErrorAnularMantencion('Indica el motivo de la anulación.');
    return;
  }

  // Elemento a repintar: el de la ficha ACTIVA (Catálogo o Máquinas, F6).
  const elementoRepintar = mntOperativasContexto
    ? mntOperativasContexto.elementoId
    : mantencionElementoSeleccionado;

  mntAnulacionMantencionGuardando = true;
  mntMarcarSubmitAnularMantencionEnviando();

  try {
    if (!window.MantencionesService ||
        typeof window.MantencionesService.anularMantencionOperativa !== 'function') {
      throw new Error('MantencionesService no está disponible.');
    }

    // ÚNICA escritura (F2): RPC mantencion_anular_mantencion con SOLO el id
    // y el motivo. Ni autor ni fecha de anulación: los asigna el backend.
    await window.MantencionesService.anularMantencionOperativa({ mantencionId, motivo });

    // ÉXITO: se cierra la modal y se repinta SOLO la ficha afectada, con el
    // repintado del apartado de ORIGEN. El registro NO desaparece: queda
    // visible con el chip ANULADA, el motivo, el autor y la fecha reales,
    // y SIN botón de anulación.
    cerrarModalAnularMantencion();
    await mntRepintarFichaContextoOperativa(elementoRepintar);
  } catch (e) {
    console.error('Error anulando mantención operativa:', e);

    // MANTENCION_YA_ANULADA — token REAL de ESTA RPC (el código
    // REGISTRO_YA_ANULADO pertenece a mantencion_anular_historial y NO se
    // usa aquí). Otra persona/proceso ya la anuló: se CIERRA el formulario
    // obsoleto (ya no se puede anular algo anulado), se actualiza la ficha
    // y el informe queda en la propia ficha como aviso transitorio, para
    // que no se pierda al cerrarse la ventana. NO se simula éxito y aquí NO
    // se creó ninguna anulación. Vale para Catálogo y para Máquinas (F6 §6).
    if (e && e.codigo === 'MANTENCION_YA_ANULADA') {
      cerrarModalAnularMantencion();
      await mntRepintarFichaContextoOperativa(elementoRepintar);
      mntInsertarAvisoFichaOperativa('Este registro ya fue anulado por otra persona o proceso. La ficha se ha actualizado.');
      return;
    }

    // Otro error: la modal PERMANECE ABIERTA con el motivo conservado; el
    // texto mostrado es el del backend si existe, si no uno genérico.
    const mensaje = (e && typeof e.message === 'string' && e.message.trim() !== '')
      ? e.message.trim()
      : 'No fue posible anular la mantención. Intenta nuevamente.';
    mntMostrarErrorAnularMantencion(mensaje);
  } finally {
    mntRestaurarSubmitAnularMantencion();
  }
}

// ==========================================================
// ENRIQUECIMIENTO DE FICHAS — FASE 2.1.1
// ==========================================================
// Bloques específicos por tipo de elemento, activados SOLO cuando existe
// relación real (FK) con televisores_habitaciones. Las FK son la única
// fuente de verdad: NUNCA se relaciona por nombre, código, habitación ni
// similitud textual.
//
// Rutas soportadas (28 filas, sin duplicados confirmados):
// - elementos_mantenibles.id === televisores_habitaciones.elemento_id
//   → rol 'televisor'
// - elementos_mantenibles.id === televisores_habitaciones.control_tv_elemento_id
//   → rol 'control_tv'
// - elementos_mantenibles.id === televisores_habitaciones.control_deco_elemento_id
//   → rol 'control_deco'
//
// Semántica (confirmada con los encabezados del Excel):
// - control_tv_original = "¿El Control TV es ORIGINAL?" NO significa
//   "funciona". true → "Sí, es original"; false → "No es original".
// - control_deco_funciona = "¿El Control Deco FUNCIONA?".
//   true → "Funciona"; false → "No funciona".
//
// Convenciones:
// - Solo lectura: sin onclick, onchange, inputs, UPDATE ni INSERT.
// - NULL booleano → "Sin dato registrado"; NUNCA NULL → false.
// - El valor *_original siempre se muestra; el normalizado solo si existe.
// - No se infiere "40 pulgadas" desde "40?".
// - No se muestran UUID, elemento_id, control_*_elemento_id ni importacion_id.
// - Elementos sin relación FK quedan EXACTAMENTE iguales que antes.
// - Cero consultas por ficha: se usa _televisoresCache y mntElementosBase.

// Busca el rol de un elemento comparando contra las tres FK reales.
// Sin duplicados confirmados → .find() es suficiente. Devuelve
// { registro, rol } o null si no hay relación.
function mntRolElementoEnTV(id, televisores) {
  if (id === null || id === undefined || id === '') return null;
  const lista = Array.isArray(televisores) ? televisores : [];

  const porElemento = lista.find(t => t && t.elemento_id === id);
  if (porElemento) return { registro: porElemento, rol: 'televisor' };

  const porControlTV = lista.find(t => t && t.control_tv_elemento_id === id);
  if (porControlTV) return { registro: porControlTV, rol: 'control_tv' };

  const porControlDeco = lista.find(t => t && t.control_deco_elemento_id === id);
  if (porControlDeco) return { registro: porControlDeco, rol: 'control_deco' };

  return null;
}

// Indicador visual de SOLO LECTURA para booleanos de control.
// Compara de forma estricta con true/false; cualquier otro valor (null,
// undefined, texto) cae a "Sin dato registrado". Nunca convierte NULL en false.
// etiquetas: { verdadero, falso } con la semántica correcta de cada campo.
function mntIndicadorBooleanoHTML(valor, etiquetas) {
  let texto, clases, punto;

  if (valor === true) {
    texto = etiquetas.verdadero;
    clases = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900';
    punto = 'bg-emerald-500 dark:bg-emerald-400';
  } else if (valor === false) {
    texto = etiquetas.falso;
    clases = 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900';
    punto = 'bg-rose-500 dark:bg-rose-400';
  } else {
    texto = 'Sin dato registrado';
    clases = 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
    punto = 'bg-slate-400 dark:bg-slate-500';
  }

  return `
    <span class="inline-flex items-center space-x-1.5 text-[11px] font-black px-2.5 py-1 rounded-full border ${clases}">
      <span aria-hidden="true" class="w-2 h-2 rounded-full ${punto} shrink-0"></span>
      <span>${mntEsc(texto)}</span>
    </span>
  `;
}

// Tamaño normalizado: "N pulgadas" SOLO si tamano_pulgadas está registrado.
// Si es NULL devuelve null para que mntCampoFichaHTML muestre
// "Sin dato registrado". NUNCA se infiere desde tamano_original.
function mntTamanoNormalizadoTexto(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  return `${valor} pulgadas`;
}

// Compone los bloques extra según el rol real del elemento.
// Sin relación FK → cadena vacía (la ficha no cambia en nada).
function mntEnriquecimientoFichaHTML(elemento, televisores) {
  if (!elemento || !elemento.id) return '';

  const relacion = mntRolElementoEnTV(elemento.id, televisores);
  if (!relacion) return '';

  const { registro, rol } = relacion;

  if (rol === 'televisor') {
    return `
      ${mntBloqueTelevisorHTML(registro)}
      ${mntBloqueControlesTVHTML(registro)}
    `;
  }

  // 'control_tv' o 'control_deco'.
  return `
    ${mntBloqueInformacionControlHTML(registro, rol)}
    ${mntBloqueTelevisorRelacionadoHTML(registro)}
  `;
}

// Bloque INFORMACIÓN DEL TELEVISOR (rol 'televisor').
function mntBloqueTelevisorHTML(tv) {
  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Información del televisor</h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        ${mntCampoFichaHTML('Marca original', tv.marca_original)}
        ${mntCampoFichaHTML('Marca normalizada', tv.marca_normalizada)}
        ${mntCampoFichaHTML('Tamaño original', tv.tamano_original)}
        ${mntCampoFichaHTML('Tamaño normalizado', mntTamanoNormalizadoTexto(tv.tamano_pulgadas))}
      </div>
    </div>
  `;
}

// Bloque CONTROLES (rol 'televisor'). Semánticas distintas por campo.
function mntBloqueControlesTVHTML(tv) {
  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Controles</h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-2">
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Control TV original</p>
          <p class="text-xs font-semibold text-slate-800 dark:text-slate-200">Valor original: ${mntEsc(mntSinDato(tv.control_tv_original_texto))}</p>
          ${mntIndicadorBooleanoHTML(tv.control_tv_original, { verdadero: 'Sí, es original', falso: 'No es original' })}
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-2">
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Control Deco funciona</p>
          <p class="text-xs font-semibold text-slate-800 dark:text-slate-200">Valor original: ${mntEsc(mntSinDato(tv.control_deco_funciona_texto))}</p>
          ${mntIndicadorBooleanoHTML(tv.control_deco_funciona, { verdadero: 'Funciona', falso: 'No funciona' })}
        </div>
      </div>
    </div>
  `;
}

// Bloque INFORMACIÓN DEL CONTROL (roles 'control_tv' y 'control_deco').
// Control TV NUNCA se etiqueta "Funciona": el Excel solo registra si es
// original. Control Deco sí registra funcionamiento.
function mntBloqueInformacionControlHTML(tv, rol) {
  const esControlTV = rol === 'control_tv';
  const tipo = esControlTV ? 'Control TV' : 'Control Deco';
  const valorOriginal = esControlTV ? tv.control_tv_original_texto : tv.control_deco_funciona_texto;
  const etiquetas = esControlTV
    ? { verdadero: 'Sí, es original', falso: 'No es original' }
    : { verdadero: 'Funciona', falso: 'No funciona' };
  const booleano = esControlTV ? tv.control_tv_original : tv.control_deco_funciona;

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Información del control</h4>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Tipo</p>
          <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1">${mntEsc(tipo)}</p>
        </div>
        <div>
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Valor original</p>
          <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1">${mntEsc(mntSinDato(valorOriginal))}</p>
        </div>
        <div>
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Estado registrado</p>
          <p class="mt-1.5">${mntIndicadorBooleanoHTML(booleano, etiquetas)}</p>
        </div>
      </div>
    </div>
  `;
}

// Bloque TELEVISOR RELACIONADO (roles 'control_tv' y 'control_deco').
// Reutiliza mntElementosBase (ya cargado por Elementos e Historial) para
// obtener nombre, código/habitación y ubicación canónica del TV. Sin UUID
// y sin consultas nuevas. Si el elemento TV no estuviera en la base, se
// muestran solo los datos que trae la propia fila del televisor.
// Fase 2.4: segundo parámetro OPCIONAL con valor por defecto
// mntElementosBase, para que Pilas y Controles pueda pasar su propio array
// (mntPilasElementos, obtenido de getElementos()) y NO dependa de que
// "Elementos e Historial" se haya abierto antes. La llamada existente de
// Fase 2.1.1 con un solo argumento sigue comportándose exactamente igual.
function mntBloqueTelevisorRelacionadoHTML(tv, elementos = mntElementosBase) {
  const lista = Array.isArray(elementos) ? elementos : [];
  const tvElemento = (tv.elemento_id === null || tv.elemento_id === undefined)
    ? null
    : lista.find(x => x && x.id === tv.elemento_id) || null;

  const nombre = tvElemento ? tvElemento.nombre_original : null;
  const etiquetaCodigo = tvElemento ? mntEtiquetaCodigo(tvElemento) : 'Código';
  const codigo = tvElemento ? tvElemento.codigo : null;
  const ubicacion = tvElemento ? mntNombreUbicacion(tvElemento) : tv.ubicacion_original;

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Televisor relacionado</h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        ${mntCampoFichaHTML('Nombre del televisor', nombre)}
        ${mntCampoFichaHTML(etiquetaCodigo, codigo)}
        ${mntCampoFichaHTML('Ubicación', ubicacion)}
        ${mntCampoFichaHTML('Marca original', tv.marca_original)}
        ${mntCampoFichaHTML('Tamaño original', tv.tamano_original)}
      </div>
    </div>
  `;
}

// ==========================================================
// INVENTARIO / BODEGAS — FASE 2.2
// ==========================================================
// Vista propia del subapartado 'inventario'. Los demás subapartados
// siguen usando mntPreviewHTML (Fase 1).
//
// Convenciones de datos:
// - Fuente única: LISTA DE BODEGAS.xlsx (Hoja1) → inventarios_elementos.
// - nombre_original NUNCA se sustituye por elementos_mantenibles.nombre_original:
//   existen casos reales donde difieren ("Bodega Piscina" vs
//   "Puerta Bodega Piscina"). El elemento vinculado es información
//   complementaria, no reemplazo.
// - nemotecnico_original SIEMPRE proviene del registro de inventario
//   (columna B — Nemotécnico). No se mezcla con
//   elementos_mantenibles.nemotecnico.
// - numero_original proviene de la columna A — NUM. El N.º REINICIA en cada
//   ubicación; NO es un identificador global y no se usa para ordenar solo.
// - fecha_inventario es EXCLUSIVAMENTE fecha de inventario. NO es fecha de
//   mantención, programada, de reparación ni de realización. Jamás ingresa a
//   getMantenciones(), historiales, Gantt, Fechas Próximas ni Notificaciones.
// - observaciones fue GENERADO por la lógica de migración (no proviene del
//   Excel): se etiqueta "Nota de migración", va separado de los datos
//   originales y NO se muestra en las tarjetas.
// - NULL texto → "Sin dato registrado"; NULL fecha → "Sin fecha registrada";
//   NULL responsable → "Sin responsable registrado". Nunca NULL → 0.
// - No se muestran UUID, importacion_id, elemento_id ni celda_origen.

// Copia del array real recibido, para filtrar en cliente sin volver a Supabase.
let mntInventariosBase = [];

// Ubicación canónica del elemento vinculado (embed ubicaciones(nombre)).
// Si no existe relación, cae a elemento.ubicacion_original (dato real).
// Nunca expone el UUID.
function mntUbicacionElementoVinculado(r) {
  const e = r && r.elemento;
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const u = e.ubicacion;
  if (u && typeof u === 'object' && !Array.isArray(u) && u.nombre) return u.nombre;
  if (Array.isArray(u) && u.length > 0 && u[0] && u[0].nombre) return u[0].nombre;
  return e.ubicacion_original ? e.ubicacion_original : null;
}

// Archivo de origen real del registro (embed importaciones_excel.archivo_origen).
function mntArchivoOrigenInventario(r) {
  const i = r && r.importacion;
  if (!i || typeof i !== 'object' || Array.isArray(i)) return null;
  const v = i.archivo_origen;
  return (v === null || v === undefined || v === '') ? null : v;
}

// fecha_inventario → "dd-mm-aaaa". Si el valor no sigue el formato esperado
// se muestra TAL CUAL (no se inventa ni se reinterpreta la fecha).
function mntFechaInventarioTexto(valor) {
  return formatearFechaCL(valor,{civil:true,vacio:String(valor),invalida:String(valor)});
}

// Valor para mntCampoFichaHTML: devuelve null si está vacío, para que la
// regla global de NULL ("Sin fecha registrada") se aplique en la ficha.
function mntValorFechaInventario(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  return mntFechaInventarioTexto(valor);
}

// Panel contenedor: decide entre listado y ficha (misma modal, sin modal sobre modal).
function mntPanelInventarioHTML(meta, datos) {
  mntInventariosBase = Array.isArray(datos) ? datos : [];

  // El título grande ya lo muestra la cabecera de la modal.
  const encabezado = '';

  let cuerpo;
  if (mantencionInventarioSeleccionado) {
    // Ficha interna: se busca el registro en la base ya cargada (sin N+1 y
    // sin nueva consulta a Supabase). Los filtros quedan guardados en estado.
    const registro = mntInventariosBase.find(r => r.id === mantencionInventarioSeleccionado) || null;
    cuerpo = `
      <div>
        <button onclick="cerrarFichaInventario()"
          class="mb-4 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1.5">
          <span>←</span>
          <span>Volver al listado de inventario</span>
        </button>
        ${registro ? mntFichaInventarioHTML(registro) : `
          <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-2">
            <span class="text-3xl block">⚠️</span>
            <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Registro de inventario no encontrado</p>
          </div>
        `}
      </div>
    `;
  } else if (mntInventariosBase.length === 0) {
    cuerpo = `
      <div class="mt-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-10 text-center space-y-2">
        <span class="text-4xl block">🏬</span>
        <h4 class="text-base font-black text-slate-700 dark:text-slate-200">No hay registros de inventario</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400">Aún no existen registros de inventario.</p>
      </div>
    `;
  } else {
    const opciones = mntOpcionesFiltrosInventario(mntInventariosBase);
    const filtrados = mntFiltrarInventario(mntInventariosBase);
    cuerpo = `
      <div class="mt-5 space-y-4">
        ${mntFiltrosInventarioHTML(opciones)}
        <p id="mnt-contador-inventario" class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
          ${filtrados.length} de ${mntInventariosBase.length} registros
        </p>
        <div id="mnt-listado-inventario">
          ${mntCuadriculaInventariosHTML(filtrados)}
        </div>
      </div>
    `;
  }

  return `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      ${encabezado}
      ${cuerpo}
    </div>
  `;
}

// Opciones de filtros derivadas de los datos (sin hardcodear).
// Solo valores reales; los NULL nunca se convierten en una opción inventada.
function mntOpcionesFiltrosInventario(lista) {
  const ubicaciones = new Set();
  const responsables = new Set();

  lista.forEach(r => {
    if (r.ubicacion_original !== null && r.ubicacion_original !== undefined && r.ubicacion_original !== '') {
      ubicaciones.add(String(r.ubicacion_original));
    }
    if (r.responsable_texto !== null && r.responsable_texto !== undefined && r.responsable_texto !== '') {
      responsables.add(String(r.responsable_texto));
    }
  });

  return {
    ubicaciones: Array.from(ubicaciones).sort((a, b) => a.localeCompare(b, 'es')),
    responsables: Array.from(responsables).sort((a, b) => a.localeCompare(b, 'es'))
  };
}

// Aplica los tres filtros de forma simultánea (AND), en cliente.
function mntFiltrarInventario(lista) {
  const texto = (mantencionFiltrosInventario.texto || '').trim().toLowerCase();
  const ubicacion = mantencionFiltrosInventario.ubicacion || '';
  const responsable = mantencionFiltrosInventario.responsable || '';

  return lista.filter(r => {
    // Filtro por ubicación (ubicacion_original: dato del registro de inventario).
    if (ubicacion) {
      const ub = (r.ubicacion_original === null || r.ubicacion_original === undefined) ? '' : String(r.ubicacion_original);
      if (ub !== ubicacion) return false;
    }
    // Filtro por responsable (responsable_texto).
    if (responsable) {
      const resp = (r.responsable_texto === null || r.responsable_texto === undefined) ? '' : String(r.responsable_texto);
      if (resp !== responsable) return false;
    }
    // Buscador (case-insensitive). NULL se ignora; nunca se convierte en "null".
    // No incluye UUID ni ids técnicos.
    if (texto) {
      const campos = [r.numero_original, r.nemotecnico_original, r.nombre_original, r.ubicacion_original, r.responsable_texto];
      const coincide = campos.some(c => {
        if (c === null || c === undefined || c === '') return false;
        return String(c).toLowerCase().indexOf(texto) !== -1;
      });
      if (!coincide) return false;
    }
    return true;
  });
}

// Buscador + filtros de ubicación y responsable, derivados de los datos.
function mntFiltrosInventarioHTML(opciones) {
  const selUbicacion = mntEsc(mantencionFiltrosInventario.ubicacion);
  const selResponsable = mntEsc(mantencionFiltrosInventario.responsable);

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-3 border border-slate-100 dark:border-slate-800">
      <div>
        <label for="mnt-buscar-inventario" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Buscar</label>
        <input id="mnt-buscar-inventario" type="text" value="${mntEsc(mantencionFiltrosInventario.texto)}"
          oninput="mntOnBuscarInventario(this.value)"
          placeholder="Nemotécnico, nombre, ubicación o responsable..."
          class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label for="mnt-filtro-ubicacion-inventario" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Ubicación</label>
          <select id="mnt-filtro-ubicacion-inventario" onchange="mntOnFiltrarUbicacionInventario(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todas las ubicaciones</option>
            ${opciones.ubicaciones.map(u => `<option value="${mntEsc(u)}" ${u === mantencionFiltrosInventario.ubicacion ? 'selected' : ''}>${mntEsc(u)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="mnt-filtro-responsable-inventario" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Responsable</label>
          <select id="mnt-filtro-responsable-inventario" onchange="mntOnFiltrarResponsableInventario(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todos los responsables</option>
            ${opciones.responsables.map(rp => `<option value="${mntEsc(rp)}" ${rp === mantencionFiltrosInventario.responsable ? 'selected' : ''}>${mntEsc(rp)}</option>`).join('')}
          </select>
        </div>
      </div>
      ${selUbicacion || selResponsable || mantencionFiltrosInventario.texto ? `
        <button onclick="mntLimpiarFiltrosInventario()"
          class="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
          Limpiar filtros
        </button>
      ` : ''}
    </div>
  `;
}

// Cuadrícula de tarjetas (patrón ya validado en Elementos e Historial).
function mntCuadriculaInventariosHTML(filtrados) {
  if (!filtrados || filtrados.length === 0) {
    return `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-1">
        <span class="text-3xl block">🔍</span>
        <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Sin resultados para los filtros aplicados</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Prueba con otro texto, ubicación o responsable.</p>
      </div>
    `;
  }

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${filtrados.map(mntTarjetaInventarioHTML).join('')}
    </div>
  `;
}

function mntTarjetaInventarioHTML(r) {
  // Nemotécnico del REGISTRO DE INVENTARIO (columna B), no el del elemento.
  const nemotecnico = (r.nemotecnico_original !== null && r.nemotecnico_original !== undefined && r.nemotecnico_original !== '')
    ? String(r.nemotecnico_original) : null;

  const ubicacion = mntSinDato(r.ubicacion_original);
  const fecha = mntSinFecha(mntValorFechaInventario(r.fecha_inventario));
  const responsable = mntSinResponsable(r.responsable_texto);
  const numero = mntSinDato(r.numero_original);

  return `
    <div onclick="abrirFichaInventario('${mntEsc(r.id)}')"
      class="bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer card-hover group flex flex-col justify-between">
      <div>
        <div class="flex items-start justify-between mb-3">
          <div class="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-xl shrink-0">🏬</div>
          ${nemotecnico ? `<span class="text-[10px] font-black px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[60%]" title="${mntEsc(nemotecnico)}">${mntEsc(nemotecnico)}</span>` : ''}
        </div>
        <h4 class="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug line-clamp-2">${mntEsc(mntSinDato(r.nombre_original))}</h4>
        <p class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">N.º original: ${mntEsc(numero)}</p>
        <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-2 flex items-center space-x-1.5 truncate"><span>📍</span><span class="truncate">Ubicación: ${mntEsc(ubicacion)}</span></p>
        <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-1.5 flex items-center space-x-1.5 truncate"><span>📆</span><span class="truncate">Fecha inventario: ${mntEsc(fecha)}</span></p>
        <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-1.5 flex items-center space-x-1.5 truncate"><span>👤</span><span class="truncate">Responsable: ${mntEsc(responsable)}</span></p>
      </div>
      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold">
        <span class="text-slate-400 dark:text-slate-500">Ver ficha</span>

      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// Manejadores de filtros (solo re-render del listado, sin recargar la SPA)
// ------------------------------------------------------------
function mntOnBuscarInventario(valor) {
  mantencionFiltrosInventario.texto = valor || '';
  mntRefrescarListadoInventario();
}

function mntOnFiltrarUbicacionInventario(valor) {
  mantencionFiltrosInventario.ubicacion = valor || '';
  mntRefrescarListadoInventario();
}

function mntOnFiltrarResponsableInventario(valor) {
  mantencionFiltrosInventario.responsable = valor || '';
  mntRefrescarListadoInventario();
}

// Rutina ÚNICA de reset del estado de filtros de Inventario / Bodegas.
// La usan el cierre completo de la modal (cerrarMantencionSubapartado) y el
// botón "Limpiar filtros" (mntLimpiarFiltrosInventario). No toma DOM ni
// consulta Supabase; solo restaura los valores iniciales del estado.
function mntResetFiltrosInventario() {
  mantencionFiltrosInventario.texto = '';
  mantencionFiltrosInventario.ubicacion = '';
  mantencionFiltrosInventario.responsable = '';
}

function mntLimpiarFiltrosInventario() {
  mntResetFiltrosInventario();
  // Vuelve a dibujar el panel completo para refrescar también los <select>.
  cargarPanelSubapartado('inventario');
}

// Actualiza únicamente la cuadrícula y el contador.
function mntRefrescarListadoInventario() {
  const cont = document.getElementById('mnt-listado-inventario');
  const contador = document.getElementById('mnt-contador-inventario');
  if (!cont) return;

  const filtrados = mntFiltrarInventario(mntInventariosBase);
  cont.innerHTML = mntCuadriculaInventariosHTML(filtrados);
  if (contador) contador.textContent = `${filtrados.length} de ${mntInventariosBase.length} registros`;
}

// ------------------------------------------------------------
// Ficha del registro de inventario (DENTRO de la modal del subapartado)
// ------------------------------------------------------------
// La ficha NO crea una segunda modal. Reemplaza el contenido del listado
// dentro de la misma modal de "Inventario / Bodegas". Los filtros se
// conservan en estado (mantencionFiltrosInventario) y al volver se repintan
// igual. No se recarga la SPA ni se vuelve a consultar Supabase: el registro
// se busca en mntInventariosBase.

async function abrirFichaInventario(id) {
  const registro = mntInventariosBase.find(r => r && r.id === id);
  if (!registro) return;
  mantencionInventarioSeleccionado = id;
  return mntBodCargar(id);
}

// Vuelve al listado conservando búsqueda, ubicación y responsable seleccionados.
function cerrarFichaInventario() {
  mantencionInventarioSeleccionado = null;
  mntBodSolicitud++;
  mntBodEstado = null;
  mntBodCerrarFormulario(true);
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;

  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'inventario') || { nombre: 'Inventario / Bodegas', icono: '🏬' };
  panel.innerHTML = mntPanelInventarioHTML(meta, mntInventariosBase);
}

// Ficha con reglas de NULL explícitas y bloques separados.
function mntFichaInventarioHTML(r) {
  const e = (r.elemento && typeof r.elemento === 'object' && !Array.isArray(r.elemento)) ? r.elemento : null;
  const ubicacionElemento = mntUbicacionElementoVinculado(r);
  const archivoOrigen = mntArchivoOrigenInventario(r);

  // Nota de migración: observaciones NO proviene del Excel; fue generado por
  // la lógica de migración. Solo se muestra en la ficha y nunca en tarjetas.
  const notaMigracion = (r.observaciones !== null && r.observaciones !== undefined && String(r.observaciones).trim() !== '')
    ? String(r.observaciones) : null;

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-5 space-y-5">

      <!-- CABECERA FICHA -->
      <div class="flex items-start space-x-3">
        <div class="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-2xl shrink-0">🏬</div>
        <div class="min-w-0">
          <h3 class="text-lg font-black text-slate-900 dark:text-white leading-snug break-words">${mntEsc(mntSinDato(r.nombre_original))}</h3>
          ${r.nemotecnico_original ? `<span class="inline-block mt-1.5 text-[10px] font-black px-2 py-1 rounded-full bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${mntEsc(r.nemotecnico_original)}</span>` : ''}
        </div>
      </div>

      <!-- DATOS DEL INVENTARIO -->
      <div>
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Datos de la bodega</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${mntCampoFichaHTML('Nombre completo', r.nombre_original)}
          ${mntCampoFichaHTML('Nemotécnico', r.nemotecnico_original)}
          ${mntCampoFichaHTML('N.º original', r.numero_original)}
          ${mntCampoFichaHTML('Ubicación', r.ubicacion_original)}
        </div>
      </div>

      ${mntBodHistorialHTML(r)}

      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Registro histórico del Excel</h4>
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            ${mntCampoFichaHTML('Fecha original del inventario', mntValorFechaInventario(r.fecha_inventario), true)}
            ${mntCampoFichaHTML('Responsable original', r.responsable_texto, false, true)}
          </div>
          <p class="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-2.5 break-words">Origen: ${mntEsc(mntSinDato(archivoOrigen))}</p>
        </div>
      </div>

      <!-- ELEMENTO MANTENIBLE VINCULADO (información complementaria) -->
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Elemento mantenible vinculado</h4>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          ${mntCampoFichaHTML('Nombre del elemento', e ? e.nombre_original : null)}
          ${mntCampoFichaHTML('Nemotécnico del elemento', e ? e.nemotecnico : null)}
          ${mntCampoFichaHTML('Ubicación del elemento', ubicacionElemento)}
        </div>
        <p class="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
          El nombre del elemento puede diferir del nombre del registro de inventario. Se muestran por separado; ninguno reemplaza al otro.
        </p>
      </div>

      <!-- TRAZABILIDAD -->
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Origen / trazabilidad</h4>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          ${mntCampoFichaHTML('Archivo origen', archivoOrigen)}
          ${mntCampoFichaHTML('Hoja origen', r.hoja_origen)}
          ${mntCampoFichaHTML('Fila origen', r.fila_origen)}
        </div>
      </div>

      <!-- NOTA DE MIGRACIÓN (solo si existe; texto generado, no del Excel) -->
      ${notaMigracion ? `
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Nota de migración</h4>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
          <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-relaxed break-words">${mntEsc(notaMigracion)}</p>
        </div>
        <p class="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
          Texto generado automáticamente durante la migración. No proviene del archivo original.
        </p>
      </div>` : ''}
    </div>
  `;
}

// ==========================================================
// BAÑOS — FASE 2.3
// ==========================================================
// Vista propia del subapartado 'banos'. Los demás subapartados pendientes
// siguen usando mntPreviewHTML (Fase 1).
//
// Fuente: MANTENCION DE BAÑOS.xlsx (Hoja1) → elementos_mantenibles.
// - 32 elementos, 30 mantenciones. 15 elementos con historial (2 registros
//   cada uno), 17 sin historial. 0 mantenciones sin elemento_id.
// - Identificación por trazabilidad real (getBanos filtra por archivo+hoja),
//   NUNCA por nombre del elemento.
//
// Convenciones de datos:
// - nombre_original fue DERIVADO en la migración a partir de la columna HAB
//   ("101" → "Baño Habitación 101"). Se usa como título amigable, pero NO se
//   etiqueta "nombre original del Excel".
// - Los baños públicos (B PUBLICO 1/2) se repiten en cada bloque y son
//   INTENCIONALMENTE distintos. NO se fusionan ni se deduplican; se
//   distinguen por grupo_origen (+ fila/celda de origen). NO se inventa piso.
// - Ubicación canónica (ubicacion_id → ubicaciones.nombre) solo para
//   habitaciones/cabañas. Para baños públicos puede ser NULL: NO se infiere.
// - Mantenciones de este archivo: tipo MANTENCION/INSTALACION y
//   detalle_trabajo reales; responsable_texto/estado/costo_total son NULL
//   SIEMPRE (el Excel no los traía). NO se crea filtro por responsable/estado.
// - Fechas: fecha_realizacion (DATE válida) o, si es inválida,
//   fecha_original (texto, ej. '31-04-2023') con fecha_precision='TEXTO'.
//   NUNCA se convierte una fecha inválida en otra fecha.
// - NO se muestra "Última mantención": parte del historial tiene fechas
//   inválidas y no puede ordenarse cronológicamente de forma segura.
// - Orden del historial por trazabilidad (fila_origen, celda_origen), no
//   cronológico.
// - NULL texto → "Sin dato registrado"; NULL fecha → "Sin fecha registrada";
//   NULL responsable → "Sin responsable registrado". Nunca NULL → 0.

// Archivo de origen de Baños (coincide con getBanos / ARCHIVO_BANOS).
const MNT_ARCHIVO_BANOS = 'MANTENCION DE BAÑOS.xlsx';

// Copias en cliente de las colecciones ya cacheadas (sin N+1).
let mntBanosBase = [];
// Historial de Baños YA filtrado por archivo de origen y ordenado por
// trazabilidad (fila_origen, celda_origen).
let mntBanosHistorial = [];

// Ubicación canónica del baño (embed ubicaciones(nombre)). Si es NULL
// (baños públicos), cae a ubicacion_original (dato real). Nunca expone UUID
// ni infiere piso.
function mntUbicacionBano(b) {
  return mntNombreUbicacion(b);
}

// Filtra el historial completo por el archivo de origen de Baños y lo ordena
// por trazabilidad original (fila_origen ASC, celda_origen ASC). NO se ordena
// por fechas: parte del historial tiene fechas inválidas no normalizables.
function mntHistorialBanosBase(mantenciones) {
  const lista = (Array.isArray(mantenciones) ? mantenciones : [])
    .filter(m => m && m.archivo_origen === MNT_ARCHIVO_BANOS);

  return lista.sort((a, b) => {
    const fa = (a.fila_origen === null || a.fila_origen === undefined) ? Infinity : Number(a.fila_origen);
    const fb = (b.fila_origen === null || b.fila_origen === undefined) ? Infinity : Number(b.fila_origen);
    if (fa !== fb) return fa - fb;
    // Misma fila → celda_origen (B, C, D) preserva el orden de columnas.
    const ca = (a.celda_origen === null || a.celda_origen === undefined) ? '' : String(a.celda_origen);
    const cb = (b.celda_origen === null || b.celda_origen === undefined) ? '' : String(b.celda_origen);
    return ca.localeCompare(cb, 'es');
  });
}

// Mapa elemento_id → cantidad de mantenciones reales (para tarjetas/filtros).
function mntConteoMantencionesBanos(historial) {
  const mapa = new Map();
  (Array.isArray(historial) ? historial : []).forEach(m => {
    if (!m || m.elemento_id === null || m.elemento_id === undefined) return;
    mapa.set(m.elemento_id, (mapa.get(m.elemento_id) || 0) + 1);
  });
  return mapa;
}

// Panel contenedor: decide entre listado y ficha (misma modal, sin modal sobre modal).
function mntPanelBanosHTML(meta, banos, mantenciones) {
  mntBanosBase = Array.isArray(banos) ? banos : [];
  // Historial de Baños: solo registros de MANTENCION DE BAÑOS.xlsx, ordenados
  // por trazabilidad. Se cruza en cliente por elemento_id (sin N+1).
  mntBanosHistorial = mntHistorialBanosBase(mantenciones);
  const conteo = mntConteoMantencionesBanos(mntBanosHistorial);

  // El título grande ya lo muestra la cabecera de la modal.
  const encabezado = `
    <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
      <p class="text-[11px] text-slate-500 dark:text-slate-400">Sección de Mantención General</p>
      <span class="text-xs font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 px-3 py-1.5 rounded-xl">
        Fase 2 · Baños
      </span>
    </div>
  `;

  let cuerpo;
  if (mantencionBanoSeleccionado) {
    // Ficha interna: se busca el baño en la base ya cargada (sin N+1 y sin
    // nueva consulta). Los filtros quedan guardados en estado.
    const bano = mntBanosBase.find(b => b.id === mantencionBanoSeleccionado) || null;
    const historialBano = mntBanosHistorial.filter(m => m.elemento_id === mantencionBanoSeleccionado);
    cuerpo = `
      <div>
        <button onclick="cerrarFichaBano()"
          class="mb-4 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1.5">
          <span>←</span>
          <span>Volver al listado de baños</span>
        </button>
        ${bano ? `<div id="mnt-ficha-bano">${mntFichaBanoHTML(bano, historialBano, conteo.get(bano.id) || 0)}</div>` : `
          <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-2">
            <span class="text-3xl block">⚠️</span>
            <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Baño no encontrado</p>
          </div>
        `}
      </div>
    `;
  } else if (mntBanosBase.length === 0) {
    cuerpo = `
      <div class="mt-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-10 text-center space-y-2">
        <span class="text-4xl block">🚻</span>
        <h4 class="text-base font-black text-slate-700 dark:text-slate-200">No hay baños registrados</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400">Aún no existen baños.</p>
      </div>
    `;
  } else {
    const opciones = mntOpcionesFiltrosBanos(mntBanosBase);
    const filtrados = mntFiltrarBanos(mntBanosBase, conteo);
    cuerpo = `
      <div class="mt-5 space-y-4">
        ${mntFiltrosBanosHTML(opciones)}
        <p id="mnt-contador-banos" class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
          ${filtrados.length} de ${mntBanosBase.length} baños
        </p>
        <div id="mnt-listado-banos">
          ${mntCuadriculaBanosHTML(filtrados, conteo)}
        </div>
      </div>
    `;
  }

  return `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      ${encabezado}
      ${cuerpo}
    </div>
  `;
}

// Opciones de filtro de grupo derivadas de los datos (sin hardcodear).
// Solo grupo: no hay filtro por responsable ni por estado (siempre NULL).
function mntOpcionesFiltrosBanos(lista) {
  const grupos = new Set();
  lista.forEach(b => {
    if (b.grupo_origen !== null && b.grupo_origen !== undefined && b.grupo_origen !== '') {
      grupos.add(String(b.grupo_origen));
    }
  });
  return {
    grupos: Array.from(grupos).sort((a, b) => a.localeCompare(b, 'es'))
  };
}

// Aplica los tres filtros en cliente (AND), sin volver a Supabase.
// historial: '' (todos) | 'con' | 'sin'.
function mntFiltrarBanos(lista, conteo) {
  const texto = (mantencionFiltrosBanos.texto || '').trim().toLowerCase();
  const grupo = mantencionFiltrosBanos.grupo || '';
  const historial = mantencionFiltrosBanos.historial || '';

  return lista.filter(b => {
    // Filtro por grupo / origen (distingue los B PUBLICO repetidos por bloque).
    if (grupo) {
      const g = (b.grupo_origen === null || b.grupo_origen === undefined) ? '' : String(b.grupo_origen);
      if (g !== grupo) return false;
    }
    // Filtro por historial (con / sin).
    if (historial) {
      const n = conteo.get(b.id) || 0;
      if (historial === 'con' && n === 0) return false;
      if (historial === 'sin' && n > 0) return false;
    }
    // Buscador (case-insensitive). NULL se ignora; nunca "null".
    if (texto) {
      const campos = [b.codigo, b.nombre_original, b.grupo_origen, b.ubicacion_original, mntUbicacionBano(b)];
      const coincide = campos.some(c => {
        if (c === null || c === undefined || c === '') return false;
        return String(c).toLowerCase().indexOf(texto) !== -1;
      });
      if (!coincide) return false;
    }
    return true;
  });
}

// Buscador + filtros de grupo e historial, derivados de los datos.
function mntFiltrosBanosHTML(opciones) {
  const selGrupo = mntEsc(mantencionFiltrosBanos.grupo);
  const selHistorial = mntEsc(mantencionFiltrosBanos.historial);

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-3 border border-slate-100 dark:border-slate-800">
      <div>
        <label for="mnt-buscar-bano" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Buscar</label>
        <input id="mnt-buscar-bano" type="text" value="${mntEsc(mantencionFiltrosBanos.texto)}"
          oninput="mntOnBuscarBano(this.value)"
          placeholder="HAB, nombre, grupo u ubicación..."
          class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label for="mnt-filtro-grupo-bano" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Grupo / origen</label>
          <select id="mnt-filtro-grupo-bano" onchange="mntOnFiltrarGrupoBano(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todos los grupos</option>
            ${opciones.grupos.map(g => `<option value="${mntEsc(g)}" ${g === mantencionFiltrosBanos.grupo ? 'selected' : ''}>${mntEsc(g)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="mnt-filtro-historial-bano" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Historial</label>
          <select id="mnt-filtro-historial-bano" onchange="mntOnFiltrarHistorialBano(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todos</option>
            <option value="con" ${mantencionFiltrosBanos.historial === 'con' ? 'selected' : ''}>Con historial</option>
            <option value="sin" ${mantencionFiltrosBanos.historial === 'sin' ? 'selected' : ''}>Sin historial</option>
          </select>
        </div>
      </div>
      ${selGrupo || selHistorial || mantencionFiltrosBanos.texto ? `
        <button onclick="mntLimpiarFiltrosBanos()"
          class="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
          Limpiar filtros
        </button>
      ` : ''}
    </div>
  `;
}

// Cuadrícula de tarjetas (patrón validado en Elementos e Inventario).
function mntCuadriculaBanosHTML(filtrados, conteo) {
  if (!filtrados || filtrados.length === 0) {
    return `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-1">
        <span class="text-3xl block">🔍</span>
        <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Sin resultados para los filtros aplicados</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Prueba con otro texto, grupo u historial.</p>
      </div>
    `;
  }

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${filtrados.map(b => mntTarjetaBanoHTML(b, conteo)).join('')}
    </div>
  `;
}

// Texto de historial para la tarjeta. NO muestra "Última mantención".
function mntTextoHistorialBano(b, conteo) {
  const n = conteo.get(b.id) || 0;
  if (n === 0) return 'Sin mantenciones registradas';
  return `${n} registro${n === 1 ? '' : 's'} histórico${n === 1 ? '' : 's'}`;
}

function mntTarjetaBanoHTML(b, conteo) {
  const ubicacion = mntUbicacionBano(b);
  const n = conteo.get(b.id) || 0;
  const historialTexto = mntTextoHistorialBano(b, conteo);

  const hayCodigo = b.codigo !== null && b.codigo !== undefined && b.codigo !== '';
  const hayGrupo = b.grupo_origen !== null && b.grupo_origen !== undefined && b.grupo_origen !== '';

  return `
    <div onclick="abrirFichaBano('${mntEsc(b.id)}')"
      class="bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer card-hover group flex flex-col justify-between">
      <div>
        <div class="flex items-start justify-between mb-3">
          <div class="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-xl shrink-0">🚻</div>
          ${hayGrupo ? `<span class="text-[10px] font-black px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[60%]" title="${mntEsc(b.grupo_origen)}">${mntEsc(b.grupo_origen)}</span>` : ''}
        </div>
        <h4 class="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug line-clamp-2">${mntEsc(mntSinDato(b.nombre_original))}</h4>
        ${hayCodigo ? `<p class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">${mntEsc(mntEtiquetaCodigo(b))}: ${mntEsc(b.codigo)}</p>` : ''}
        ${ubicacion ? `<p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-2 flex items-center space-x-1.5 truncate"><span>📍</span><span class="truncate">Ubicación: ${mntEsc(ubicacion)}</span></p>` : ''}
        <p class="mt-2 text-[11px] font-bold ${n > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}">${mntEsc(historialTexto)}</p>
      </div>
      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold">
        <span class="text-slate-400 dark:text-slate-500">Ver ficha</span>

      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// Manejadores de filtros (solo re-render del listado, sin recargar la SPA)
// ------------------------------------------------------------
function mntOnBuscarBano(valor) {
  mantencionFiltrosBanos.texto = valor || '';
  mntRefrescarListadoBanos();
}

function mntOnFiltrarGrupoBano(valor) {
  mantencionFiltrosBanos.grupo = valor || '';
  mntRefrescarListadoBanos();
}

function mntOnFiltrarHistorialBano(valor) {
  mantencionFiltrosBanos.historial = valor || '';
  mntRefrescarListadoBanos();
}

// Rutina ÚNICA de reset del estado de filtros de Baños.
// La usan el cierre completo de la modal (cerrarMantencionSubapartado) y el
// botón "Limpiar filtros" (mntLimpiarFiltrosBanos). No toca DOM ni consulta
// Supabase; solo restaura los valores iniciales del estado.
function mntResetFiltrosBanos() {
  mantencionFiltrosBanos.texto = '';
  mantencionFiltrosBanos.grupo = '';
  mantencionFiltrosBanos.historial = '';
}

function mntLimpiarFiltrosBanos() {
  mntResetFiltrosBanos();
  // Vuelve a dibujar el panel completo para refrescar también los <select>.
  cargarPanelSubapartado('banos');
}

// Actualiza únicamente la cuadrícula y el contador.
function mntRefrescarListadoBanos() {
  const cont = document.getElementById('mnt-listado-banos');
  const contador = document.getElementById('mnt-contador-banos');
  if (!cont) return;

  const conteo = mntConteoMantencionesBanos(mntBanosHistorial);
  const filtrados = mntFiltrarBanos(mntBanosBase, conteo);
  cont.innerHTML = mntCuadriculaBanosHTML(filtrados, conteo);
  if (contador) contador.textContent = `${filtrados.length} de ${mntBanosBase.length} baños`;
}

// ------------------------------------------------------------
// Ficha del baño (DENTRO de la modal del subapartado)
// ------------------------------------------------------------
// La ficha NO crea una segunda modal. Reemplaza el contenido del listado
// dentro de la misma modal de "Baños". Los filtros se conservan en estado
// (mantencionFiltrosBanos) y al volver se repintan igual. No se recarga la
// SPA: el baño se busca en mntBanosBase y el historial importado ya está
// filtrado/ordenado. Solo el historial operativo se relee desde Supabase.

let mntBanosOperativasSolicitud = 0;
let mntBanosOperativasEstado = null;

async function abrirFichaBano(id) {
  const bano = mntBanosBase.find(b => b && String(b.id) === String(id));
  if (!bano || bano.archivo_origen !== MNT_ARCHIVO_BANOS || bano.hoja_origen !== 'Hoja1') return;
  mantencionBanoSeleccionado = id;
  return mntRefrescarOperativasBano(id);
}

async function mntRefrescarOperativasBano(id) {
  if (String(mantencionBanoSeleccionado) !== String(id)) return;
  const bano = mntBanosBase.find(b => b && String(b.id) === String(id));
  if (!bano || bano.archivo_origen !== MNT_ARCHIVO_BANOS || bano.hoja_origen !== 'Hoja1') return;
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;
  const solicitud = ++mntBanosOperativasSolicitud;
  mntBanosOperativasEstado = { id: String(id), cargando: true };
  mntFijarContextoOperativas({ origen: 'banos', elementoId: id,
    elemento: bano, contenedorId: 'mnt-ficha-bano',
    repintar: () => mntRefrescarOperativasBano(id) });
  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'banos') || { nombre: 'Baños', icono: '🚻' };
  panel.innerHTML = mntPanelBanosHTML(meta, mntBanosBase, mntBanosHistorial);
  const estado = await mntCargarEstadoOperativasFicha(id, true);
  if (solicitud !== mntBanosOperativasSolicitud || String(mantencionBanoSeleccionado) !== String(id) ||
      !mntOperativasContexto || mntOperativasContexto.origen !== 'banos' || mntOperativasContexto.elementoId !== String(id)) return;
  mntBanosOperativasEstado = { id: String(id), cargando: false, ...estado };
  panel.innerHTML = mntPanelBanosHTML(meta, mntBanosBase, mntBanosHistorial);
}

// Vuelve al listado conservando búsqueda, grupo e historial seleccionados.
function cerrarFichaBano() {
  mantencionBanoSeleccionado = null;
  mntBanosOperativasSolicitud++;
  mntBanosOperativasEstado = null;
  mntLimpiarContextoOperativas('banos');
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;

  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'banos') || { nombre: 'Baños', icono: '🚻' };
  panel.innerHTML = mntPanelBanosHTML(meta, mntBanosBase, mntBanosHistorial);
}

// fecha_realizacion (DATE válida) → dd-mm-aaaa. Si no sigue el formato se
// muestra tal cual (no se inventa ni se reinterpreta).
function mntFechaRealizacionTexto(valor) {
  return formatearFechaCL(valor,{civil:true,vacio:String(valor),invalida:String(valor)});
}

// Ficha del baño: datos + historial de trabajos con presentación propia + traza.
function mntHistorialSistemaBanoHTML(b) {
  const estado = mntBanosOperativasEstado;
  if (!estado || estado.id !== String(b.id) || estado.cargando) {
    return '<div class="pt-4 border-t border-slate-100 dark:border-slate-800"><h4 class="text-xs font-black">Historial del sistema</h4><p role="status" class="text-xs mt-3">Cargando mantenciones del sistema…</p></div>';
  }
  if (!estado.ok) return mntAvisoOperativasHTML(estado.aviso, b.id);
  return mntBloqueOperativasHTML(estado.lista, {
    conBotonRegistro: true, elementoId: b.id, soloFechaRegistro: true
  });
}

function mntFichaBanoHTML(b, historialBano, totalHistorial) {
  const historial = Array.isArray(historialBano) ? historialBano : [];

  const hayCodigo = b.codigo !== null && b.codigo !== undefined && b.codigo !== '';
  const hayGrupo = b.grupo_origen !== null && b.grupo_origen !== undefined && b.grupo_origen !== '';
  const hayNemotecnico = b.nemotecnico !== null && b.nemotecnico !== undefined && b.nemotecnico !== '';
  const hayEstado = b.estado_original !== null && b.estado_original !== undefined && b.estado_original !== '';
  const hayObservaciones = b.observaciones !== null && b.observaciones !== undefined && b.observaciones !== '';

  // Ubicación sin duplicar (SOLO presentación; no infiere ni inventa datos).
  // - ubicacionCanonica = valor REAL de ubicaciones.nombre (FK embed), SIN
  //   fallback a ubicacion_original.
  // - Con canónica: se muestra "Ubicación"; "Ubicación original" solo si
  //   existe y es DIFERENTE (evita repetir el mismo valor dos veces).
  // - Sin canónica (p. ej. baños públicos, ubicacion_id NULL): se muestra
  //   únicamente "Ubicación original".
  let ubicacionCanonica = null;
  const u = b.ubicacion;
  if (u && typeof u === 'object' && !Array.isArray(u) && u.nombre) {
    ubicacionCanonica = u.nombre;
  } else if (Array.isArray(u) && u.length > 0 && u[0] && u[0].nombre) {
    ubicacionCanonica = u[0].nombre;
  }
  const mostrarUbicacionCanonica = ubicacionCanonica !== null;
  const mostrarUbicacionOriginal = mostrarUbicacionCanonica
    ? (b.ubicacion_original !== null && b.ubicacion_original !== undefined && b.ubicacion_original !== '' &&
       String(b.ubicacion_original) !== String(ubicacionCanonica))
    : true;

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-5 space-y-5">

      <!-- CABECERA FICHA -->
      <div class="flex items-start space-x-3">
        <div class="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-2xl shrink-0">🚻</div>
        <div class="min-w-0">
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Ficha del baño</p>
          <h3 class="text-lg font-black text-slate-900 dark:text-white leading-snug break-words">${mntEsc(mntSinDato(b.nombre_original))}</h3>
          ${hayGrupo ? `<span class="inline-block mt-1.5 text-[10px] font-black px-2 py-1 rounded-full bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${mntEsc(b.grupo_origen)}</span>` : ''}
        </div>
      </div>

      <!-- DATOS DEL BAÑO -->
      <div>
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Datos del baño</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${mntCampoFichaHTML('Baño', b.nombre_original)}
          ${hayCodigo ? mntCampoFichaHTML('HAB (origen)', b.codigo) : ''}
          ${mntCampoFichaHTML('Grupo / origen', b.grupo_origen)}
          ${mostrarUbicacionCanonica ? mntCampoFichaHTML('Ubicación', ubicacionCanonica) : ''}
          ${mostrarUbicacionOriginal ? mntCampoFichaHTML('Ubicación original', b.ubicacion_original) : ''}
          ${hayNemotecnico ? mntCampoFichaHTML('Nemotécnico', b.nemotecnico) : ''}
        </div>
        <p class="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
          El título del baño fue derivado durante la migración a partir de la habitación (HAB) del Excel; no es un nombre original de columna.
        </p>
      </div>

      <!-- ESTADO ORIGINAL (solo si existe; no se llena con NULL) -->
      ${hayEstado ? `
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        ${mntCampoFichaHTML('Estado original', b.estado_original)}
      </div>` : ''}

      ${mntHistorialSistemaBanoHTML(b)}

      <!-- HISTORIAL DE TRABAJOS (presentación propia; no usa tabla cronológica) -->
      ${mntHistorialTrabajosBanoHTML(historial, totalHistorial)}

      <!-- OBSERVACIONES (solo si existen) -->
      ${hayObservaciones ? `
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        ${mntCampoFichaHTML('Observaciones', b.observaciones)}
      </div>` : ''}

      <!-- TRAZABILIDAD -->
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Origen / trazabilidad</h4>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          ${mntCampoFichaHTML('Archivo origen', b.archivo_origen)}
          ${mntCampoFichaHTML('Hoja origen', b.hoja_origen)}
          ${mntCampoFichaHTML('Fila origen', b.fila_origen)}
        </div>
      </div>
    </div>
  `;
}

// Historial de trabajos con presentación propia por registro (tarjetas), NO
// una tabla cronológica. Mantiene el orden de trazabilidad (fila, celda).
function mntHistorialTrabajosBanoHTML(historial, total) {
  const lista = Array.isArray(historial) ? historial : [];

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Historial importado del Excel</h4>
        <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">${total} registro(s)</span>
      </div>
      ${lista.length === 0
        ? `<div class="bg-white dark:bg-slate-900 rounded-2xl p-6 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-800">
             Sin mantenciones registradas para este baño.
           </div>`
        : mntHistorialPaginadoHTML(lista.length, 'Historial importado de baños', `<div class="space-y-3">${mntOrdenarHistorialReciente(lista).map(mntRegistroTrabajoBanoHTML).join('')}</div>`)}
    </div>
  `;
}

// Un registro del historial: TIPO + DETALLE + FECHA (con reglas DIA/TEXTO) +
// trazabilidad de celda. Responsable/estado/costo NO se muestran porque el
// Excel de baños nunca los trajo (siempre NULL); no se inventan valores.
function mntRegistroTrabajoBanoHTML(m) {
  // Tipo: MANTENCION / INSTALACION (badge neutro). NULL → "Sin dato registrado".
  const tipoTexto = mntSinDato(m.tipo);
  const esInstalacion = String(m.tipo || '').toUpperCase() === 'INSTALACION';
  const tipoClase = esInstalacion
    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
    : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900';

  // FECHA: fecha_realizacion válida → dd-mm-aaaa; si no, fecha_original como
  // texto (sin normalizar); si ninguno → "Sin fecha registrada".
  let fechaBloque;
  if (m.fecha_realizacion !== null && m.fecha_realizacion !== undefined && m.fecha_realizacion !== '') {
    fechaBloque = `
      <div>
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Fecha de realización</p>
        <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1">${mntEsc(mntFechaRealizacionTexto(m.fecha_realizacion))}</p>
      </div>`;
  } else if (m.fecha_original !== null && m.fecha_original !== undefined && m.fecha_original !== '') {
    fechaBloque = `
      <div>
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Fecha original del Excel</p>
        <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1">${mntEsc(formatDate(m.fecha_original))}</p>
        <span class="mt-1.5 inline-flex items-center space-x-1.5 text-[10px] font-black px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          Texto original · sin fecha normalizada
        </span>
      </div>`;
  } else {
    fechaBloque = `
      <div>
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Fecha</p>
        <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1">${mntSinFecha(null)}</p>
      </div>`;
  }

  const hayCelda = m.celda_origen !== null && m.celda_origen !== undefined && m.celda_origen !== '';

  return `
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
      <div class="flex items-start justify-between gap-3">
        <span class="shrink-0 inline-flex items-center text-[10px] font-black px-2.5 py-1 rounded-full border ${tipoClase}">${mntEsc(tipoTexto)}</span>
        ${hayCelda ? `<span class="text-[10px] font-bold text-slate-400 dark:text-slate-500">Celda origen: ${mntEsc(m.celda_origen)}</span>` : ''}
      </div>
      <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Detalle</p>
          <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 leading-relaxed break-words">${mntEsc(mntSinDato(m.detalle_trabajo))}</p>
        </div>
        ${fechaBloque}
      </div>
    </div>
  `;
}

// ==========================================================
// PILAS Y CONTROLES — FASE 2.4
// ==========================================================
// Vista propia del subapartado 'pilas'. La preview genérica de Fase 1 ya NO
// aparece para este subapartado.
//
// Fuente: MANTENCION DE PILAS.xlsx (Hoja1) → elementos_mantenibles, por
// TRAZABILIDAD REAL (archivo_origen + hoja_origen) vía getPilasControles().
// - 28 HAB en el Excel; cada HAB produjo 1 CONTROL TV + 1 CONTROL DECO
//   = 56 elementos. El número de controles NUNCA se hardcodea: se deriva de
//   mntPilasBase.length y del count real de getResumen().
// - mantenciones: 0. Las columnas C/E (FECHA MANTENCION) estaban vacías;
//   la migración creó los elementos porque el archivo define que existe un
//   CONTROL TV y un CONTROL DECO por HAB, pero NO creó registros de
//   mantención. Por eso NO existe bloque de historial en este subapartado.
//
// Convenciones de datos:
// - codigo = columna A (HAB), literal. ubicacion_original = mismo valor HAB.
// - grupo_origen = 'CONTROL TV' (columna B) o 'CONTROL DECO' (columna D):
//   es la única fuente del TIPO mostrado en tarjetas y ficha.
// - nombre_original fue DERIVADO en la migración (tipo + HAB). Se usa como
//   título amigable, pero NO se etiqueta "nombre original del Excel".
// - celda_origen = B<n> para CONTROL TV y D<n> para CONTROL DECO. Se muestra
//   tal cual (trazabilidad); NO se reinterpreta como dato operativo.
// - nemotecnico y estado_original: NULL en los 56 → NO se muestran.
// - observaciones: texto GENERADO durante la migración (no lo escribió el
//   cliente). Se presenta como "Nota de migración" SOLO en la ficha.
// - Ubicación canónica desde ubicaciones(nombre) (FK embed); "Ubicación
//   original" solo si existe y aporta un valor distinto. No se infiere nada.
// - Relación con TV Habitaciones SOLO por FK real
//   (televisores_habitaciones.control_tv_elemento_id /
//   control_deco_elemento_id). Nunca por nombre, código, habitación ni
//   similitud textual. Los controles sin relación simplemente no muestran
//   esos bloques (no hay error rojo ni afirmaciones inventadas).
// - Semánticas distintas: Control TV = "original si/no"; Control Deco =
//   "funciona si/no". Control TV NUNCA se etiqueta "Funciona".
// - Solo lectura: sin inputs, sin switches, sin INSERT/UPDATE/DELETE.
// - NULL texto → "Sin dato registrado"; NULL boolean → "Sin dato registrado".
//   Nunca NULL → false, nunca NULL → 0.
// - Sin N+1 y sin consultas por ficha: los tres conjuntos llegan por
//   Promise.all en el cargador (todos con caché) y la ficha se resuelve
//   desde mntPilasBase.

// Copias en cliente de las colecciones ya cacheadas (sin N+1).
// mntPilasElementos viene de getElementos() para resolver el elemento TV
// relacionado (tv.elemento_id) SIN depender de mntElementosBase: el
// subapartado funciona aunque "Elementos e Historial" no se haya abierto.
let mntPilasBase = [];
let mntPilasTelevisores = [];
let mntPilasElementos = [];

// Tipo de control: grupo_origen real ('CONTROL TV' / 'CONTROL DECO').
// NULL/ vacío → null (no se infiere el tipo desde el nombre).
function mntTipoControlPila(p) {
  if (!p) return null;
  const g = p.grupo_origen;
  if (g === null || g === undefined || String(g).trim() === '') return null;
  return String(g);
}

// Relación FK REAL del control con televisores_habitaciones.
// A diferencia de mntRolElementoEnTV (que también revisa elemento_id, la
// ruta de los televisores), aquí SOLO se revisan las dos rutas de controles,
// que son las únicas aplicables a este subapartado.
// Devuelve { registro, rol } con rol 'control_tv' | 'control_deco', o null.
function mntRelacionControlPila(p, televisores) {
  if (!p || p.id === null || p.id === undefined || p.id === '') return null;
  const lista = Array.isArray(televisores) ? televisores : [];

  const porControlTV = lista.find(t => t && t.control_tv_elemento_id === p.id);
  if (porControlTV) return { registro: porControlTV, rol: 'control_tv' };

  const porControlDeco = lista.find(t => t && t.control_deco_elemento_id === p.id);
  if (porControlDeco) return { registro: porControlDeco, rol: 'control_deco' };

  return null;
}

// Etiquetas correctas por rol. Control TV: semántica de ORIGINALIDAD (nunca
// "Funciona"). Control Deco: semántica de FUNCIONAMIENTO.
function mntEtiquetasEstadoControl(rol) {
  return rol === 'control_tv'
    ? { verdadero: 'Sí, es original', falso: 'No es original' }
    : { verdadero: 'Funciona', falso: 'No funciona' };
}

// Ubicación sin duplicar (SOLO presentación; no infiere ni inventa datos).
// - canonica: valor REAL de ubicaciones.nombre (FK embed), SIN fallback.
// - mostrarOriginal: con canónica, solo si existe y es DIFERENTE; sin
//   canónica, siempre (para no perder el dato real del Excel).
function mntUbicacionesPila(p) {
  let canonica = null;
  const u = p && p.ubicacion;
  if (u && typeof u === 'object' && !Array.isArray(u) && u.nombre) {
    canonica = u.nombre;
  } else if (Array.isArray(u) && u.length > 0 && u[0] && u[0].nombre) {
    canonica = u[0].nombre;
  }

  const hayOriginal = !!p && p.ubicacion_original !== null &&
    p.ubicacion_original !== undefined && p.ubicacion_original !== '';

  const mostrarOriginal = canonica !== null
    ? (hayOriginal && String(p.ubicacion_original) !== String(canonica))
    : hayOriginal;

  return { canonica, mostrarOriginal };
}

// Panel contenedor: decide entre listado y ficha (misma modal, sin modal
// sobre modal).
function mntPanelPilasHTML(meta, pilas, televisores, elementos) {
  mntPilasBase = Array.isArray(pilas) ? pilas : [];
  mntPilasTelevisores = Array.isArray(televisores) ? televisores : [];
  mntPilasElementos = Array.isArray(elementos) ? elementos : [];

  // El título grande ya lo muestra la cabecera de la modal.
  const encabezado = `
    <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
      <p class="text-[11px] text-slate-500 dark:text-slate-400">Sección de Mantención General</p>
      <span class="text-xs font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 px-3 py-1.5 rounded-xl">
        Fase 2 · Pilas y Controles
      </span>
    </div>
  `;

  let cuerpo;
  if (mantencionPilaSeleccionada) {
    // Ficha interna: se busca el control en la base ya cargada (sin N+1 y
    // sin nueva consulta). Los filtros quedan guardados en estado.
    const pila = mntPilasBase.find(p => p.id === mantencionPilaSeleccionada) || null;
    cuerpo = `
      <div>
        <button onclick="cerrarFichaPila()"
          class="mb-4 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1.5">
          <span>←</span>
          <span>Volver al listado de controles</span>
        </button>
        ${pila ? mntFichaPilaHTML(pila) : `
          <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-2">
            <span class="text-3xl block">⚠️</span>
            <p class="text-sm font-bold text-slate-600 dark:text-slate-200">Control no encontrado</p>
          </div>
        `}
      </div>
    `;
  } else if (mntPilasBase.length === 0) {
    cuerpo = `
      <div class="mt-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-10 text-center space-y-2">
        <span class="text-4xl block">🔋</span>
        <h4 class="text-base font-black text-slate-700 dark:text-slate-200">No hay controles registrados</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400">Aún no existen controles de TV o DECO.</p>
      </div>
    `;
  } else {
    const opciones = mntOpcionesFiltrosPilas(mntPilasBase);
    const filtrados = mntFiltrarPilas(mntPilasBase);
    cuerpo = `
      <div class="mt-5 space-y-4">
        ${mntFiltrosPilasHTML(opciones)}
        <p id="mnt-contador-pilas" class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
          ${filtrados.length} de ${mntPilasBase.length} controles
        </p>
        <div id="mnt-listado-pilas">
          ${mntCuadriculaPilasHTML(filtrados)}
        </div>
      </div>
    `;
  }

  return `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      ${encabezado}
      ${cuerpo}
    </div>
  `;
}

// Opciones de filtro de TIPO derivadas de los datos reales (grupo_origen),
// sin hardcodear "CONTROL TV" / "CONTROL DECO".
function mntOpcionesFiltrosPilas(lista) {
  const tipos = new Set();
  lista.forEach(p => {
    const t = mntTipoControlPila(p);
    if (t) tipos.add(t);
  });
  return {
    tipos: Array.from(tipos).sort((a, b) => a.localeCompare(b, 'es'))
  };
}

// Aplica los tres filtros en cliente (AND), sin volver a Supabase.
// relacionTv: '' (todos) | 'con' | 'sin' — determinado EXCLUSIVAMENTE por
// las FK reales de televisores_habitaciones; nunca se hardcodean conteos.
function mntFiltrarPilas(lista) {
  const texto = (mantencionFiltrosPilas.texto || '').trim().toLowerCase();
  const tipo = mantencionFiltrosPilas.tipo || '';
  const relacionTv = mantencionFiltrosPilas.relacionTv || '';

  return lista.filter(p => {
    // Filtro por tipo (valor real de grupo_origen).
    if (tipo) {
      const t = mntTipoControlPila(p) || '';
      if (t !== tipo) return false;
    }
    // Filtro por relación con TV-Habitaciones (solo FK real).
    if (relacionTv) {
      const tieneRelacion = mntRelacionControlPila(p, mntPilasTelevisores) !== null;
      if (relacionTv === 'con' && !tieneRelacion) return false;
      if (relacionTv === 'sin' && tieneRelacion) return false;
    }
    // Buscador (case-insensitive). NULL se ignora; nunca "null".
    if (texto) {
      const campos = [
        p.nombre_original,
        p.codigo,
        p.grupo_origen,
        p.ubicacion_original,
        mntNombreUbicacion(p)
      ];
      const coincide = campos.some(c => {
        if (c === null || c === undefined || c === '') return false;
        return String(c).toLowerCase().indexOf(texto) !== -1;
      });
      if (!coincide) return false;
    }
    return true;
  });
}

// Buscador + filtros de tipo y relación con TV, derivados de los datos.
function mntFiltrosPilasHTML(opciones) {
  const selTipo = mntEsc(mantencionFiltrosPilas.tipo);
  const selRelacion = mntEsc(mantencionFiltrosPilas.relacionTv);

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-3 border border-slate-100 dark:border-slate-800">
      <div>
        <label for="mnt-buscar-pila" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Buscar</label>
        <input id="mnt-buscar-pila" type="text" value="${mntEsc(mantencionFiltrosPilas.texto)}"
          oninput="mntOnBuscarPila(this.value)"
          placeholder="Nombre, HAB, tipo o ubicación..."
          class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label for="mnt-filtro-tipo-pila" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Tipo</label>
          <select id="mnt-filtro-tipo-pila" onchange="mntOnFiltrarTipoPila(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todos los tipos</option>
            ${opciones.tipos.map(t => `<option value="${mntEsc(t)}" ${t === mantencionFiltrosPilas.tipo ? 'selected' : ''}>${mntEsc(t)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="mnt-filtro-relacion-pila" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Relación con TV</label>
          <select id="mnt-filtro-relacion-pila" onchange="mntOnFiltrarRelacionTvPila(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todas las relaciones</option>
            <option value="con" ${mantencionFiltrosPilas.relacionTv === 'con' ? 'selected' : ''}>Con relación TV</option>
            <option value="sin" ${mantencionFiltrosPilas.relacionTv === 'sin' ? 'selected' : ''}>Sin relación TV</option>
          </select>
        </div>
      </div>
      ${selTipo || selRelacion || mantencionFiltrosPilas.texto ? `
        <button onclick="mntLimpiarFiltrosPilas()"
          class="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
          Limpiar filtros
        </button>
      ` : ''}
    </div>
  `;
}

// Cuadrícula de tarjetas (patrón validado en Elementos, Inventario y Baños).
function mntCuadriculaPilasHTML(filtrados) {
  if (!filtrados || filtrados.length === 0) {
    return `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-1">
        <span class="text-3xl block">🔍</span>
        <p class="text-sm font-bold text-slate-600 dark:text-slate-200">Sin resultados para los filtros aplicados</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Prueba con otro texto, tipo o relación.</p>
      </div>
    `;
  }

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${filtrados.map(mntTarjetaPilaHTML).join('')}
    </div>
  `;
}

// Tarjeta del control. NO se muestra historial (el archivo tiene 0
// mantenciones confirmadas) ni nota de migración (solo va en la ficha).
function mntTarjetaPilaHTML(p) {
  const tipo = mntTipoControlPila(p);
  const ubicacion = mntNombreUbicacion(p);
  const relacion = mntRelacionControlPila(p, mntPilasTelevisores);

  // Dato relacionado de TV-Habitaciones: SOLO si existe FK real.
  // Control TV → "Sí, es original" / "No es original" (NUNCA "Funciona").
  // Control Deco → "Funciona" / "No funciona".
  let bloqueRelacion = '';
  if (relacion) {
    bloqueRelacion = `
      <p class="mt-2 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Dato relacionado en TV-Habitaciones</p>
      <p class="mt-1.5">${mntIndicadorBooleanoHTML(
        relacion.rol === 'control_tv' ? relacion.registro.control_tv_original : relacion.registro.control_deco_funciona,
        mntEtiquetasEstadoControl(relacion.rol)
      )}</p>
    `;
  }

  return `
    <div onclick="abrirFichaPila('${mntEsc(p.id)}')"
      class="bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer card-hover group flex flex-col justify-between">
      <div>
        <div class="flex items-start justify-between mb-3">
          <div class="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-100 dark:border-amber-900 flex items-center justify-center text-xl shrink-0">🔋</div>
          ${tipo ? `<span class="text-[10px] font-black px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[60%]" title="${mntEsc(tipo)}">${mntEsc(tipo)}</span>` : ''}
        </div>
        <h4 class="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug line-clamp-2">${mntEsc(mntSinDato(p.nombre_original))}</h4>
        ${p.codigo !== null && p.codigo !== undefined && p.codigo !== '' ? `<p class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">${mntEsc(mntEtiquetaCodigo(p))}: ${mntEsc(p.codigo)}</p>` : ''}
        ${ubicacion ? `<p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-2 flex items-center space-x-1.5 truncate"><span>📍</span><span class="truncate">Ubicación: ${mntEsc(ubicacion)}</span></p>` : ''}
        ${bloqueRelacion}
      </div>
      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold">
        <span class="text-slate-400 dark:text-slate-500">Ver ficha</span>

      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// Manejadores de filtros (solo re-render del listado, sin recargar la SPA)
// ------------------------------------------------------------
function mntOnBuscarPila(valor) {
  mantencionFiltrosPilas.texto = valor || '';
  mntRefrescarListadoPilas();
}

function mntOnFiltrarTipoPila(valor) {
  mantencionFiltrosPilas.tipo = valor || '';
  mntRefrescarListadoPilas();
}

function mntOnFiltrarRelacionTvPila(valor) {
  mantencionFiltrosPilas.relacionTv = valor || '';
  mntRefrescarListadoPilas();
}

// Rutina ÚNICA de reset del estado de filtros de Pilas y Controles.
// La usan el cierre completo de la modal (cerrarMantencionSubapartado) y el
// botón "Limpiar filtros" (mntLimpiarFiltrosPilas). No toca DOM ni consulta
// Supabase; solo restaura los valores iniciales del estado.
function mntResetFiltrosPilas() {
  mantencionFiltrosPilas.texto = '';
  mantencionFiltrosPilas.tipo = '';
  mantencionFiltrosPilas.relacionTv = '';
}

function mntLimpiarFiltrosPilas() {
  mntResetFiltrosPilas();
  // Vuelve a dibujar el panel completo para refrescar también los <select>.
  cargarPanelSubapartado('pilas');
}

// Actualiza únicamente la cuadrícula y el contador.
function mntRefrescarListadoPilas() {
  const cont = document.getElementById('mnt-listado-pilas');
  const contador = document.getElementById('mnt-contador-pilas');
  if (!cont) return;

  const filtrados = mntFiltrarPilas(mntPilasBase);
  cont.innerHTML = mntCuadriculaPilasHTML(filtrados);
  if (contador) contador.textContent = `${filtrados.length} de ${mntPilasBase.length} controles`;
}

// ------------------------------------------------------------
// Ficha del control (DENTRO de la modal del subapartado)
// ------------------------------------------------------------
// La ficha NO crea una segunda modal. Reemplaza el contenido del listado
// dentro de la misma modal de "Pilas y Controles". Los filtros se conservan
// en estado (mantencionFiltrosPilas) y al volver se repintan igual. No se
// recarga la SPA ni se consulta Supabase: el control se busca en
// mntPilasBase y la relación con TV usa mntPilasTelevisores (caché).
function abrirFichaPila(id) {
  mantencionPilaSeleccionada = id;
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;

  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'pilas') || { nombre: 'Pilas y Controles', icono: '🔋' };
  panel.innerHTML = mntPanelPilasHTML(meta, mntPilasBase, mntPilasTelevisores, mntPilasElementos);

  // C2D-2D2B-1: la ficha se renderiza de forma síncrona; los dos
  // historiales del control se cargan en este punto, ya con la ficha en
  // el DOM (patrón async de la ficha TV). Solo lectura.
  const pila = mntPilasBase.find(p => p && p.id === id) || null;
  if (pila) mntCargarHistorialesControl(pila);
}

// Vuelve al listado conservando búsqueda, tipo y relación seleccionados.
function cerrarFichaPila() {
  mantencionPilaSeleccionada = null;
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;

  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'pilas') || { nombre: 'Pilas y Controles', icono: '🔋' };
  panel.innerHTML = mntPanelPilasHTML(meta, mntPilasBase, mntPilasTelevisores, mntPilasElementos);
}

// ==========================================================
// PILAS Y CONTROLES — FASE C2D-2D2B-1 (CAPA OPERACIONAL, SOLO LECTURA)
// ==========================================================
// Bloques NUEVOS que existen EXCLUSIVAMENTE dentro de
// mntFichaPilaHTML(p), con la arquitectura de 3 capas:
//  1) Capa 1 (EXISTENTE, intacta): datos originales/importados del Excel
//     (nombre_original, grupo_origen, codigo, ubicacion_original,
//     ubicación canónica, observaciones, nota de migración, trazabilidad)
//     y la relación FK real con TV-Habitaciones (control_tv_original =
//     dato de ORIGINALIDAD; control_deco_funciona = funcionamiento
//     importado histórico). NINGUNO equivale a estado_operativo_actual.
//  2) Capa 2: "Estado actual del control" desde p.estado_operativo_actual
//     (boolean NULL) y sección "Cambio de pilas". Desde C2D-2D2B-2 el
//     botón "Registrar revisión" está HABILITADO y abre la modal propia
//     de Control, con ÚNICA escritura vía HistorialService.revisarEstado
//     (tipoEntidad 'control', campo 'estado_operativo'). El botón
//     "Registrar cambio de pilas" sigue VISUAL y deshabilitado: sin
//     onclick, sin registrarEvento y sin RPC alguna.
//  3) Capa 3 (NUEVA, solo lectura): dos historiales SEPARADOS —
//     "Revisiones de estado" (campo 'estado_operativo', accion
//     'revision', valores booleanos) y "Cambios de pilas" (campo
//     'cambio_pilas', accion 'evento', sin interpretación booleana).
// Lecturas: HistorialService.getRevisiones (solo lectura). Escritura de
// C2D-2D2B-2: SOLO HistorialService.revisarEstado desde la modal propia de
// Control. SIN escrituras directas, SIN localStorage, SIN mocks. Todo texto
// de BD pasa por mntEsc.

// Etiqueta del estado operativo del control. Comparación ESTRICTA:
// `false` es un valor operacional legítimo ("No operativo") y JAMÁS se
// trata como vacío (nunca truthy/falsy genérico). null/undefined (y
// cualquier otro tipo inesperado) → sin revisión registrada.
function mntTextoEstadoOperativoControl(valor) {
  if (valor === true) return 'Operativo';
  if (valor === false) return 'No operativo';
  return 'Sin revisión registrada';
}

// Badge del estado operativo del control (mismo lenguaje visual que
// mntIndicadorBooleanoHTML, con texto propio de este campo).
function mntIndicadorEstadoOperativoControlHTML(valor) {
  let clases, punto;

  if (valor === true) {
    clases = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900';
    punto = 'bg-emerald-500 dark:bg-emerald-400';
  } else if (valor === false) {
    clases = 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900';
    punto = 'bg-rose-500 dark:bg-rose-400';
  } else {
    clases = 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
    punto = 'bg-slate-400 dark:bg-slate-500';
  }

  return `
    <span class="inline-flex items-center space-x-1.5 text-[11px] font-black px-2.5 py-1 rounded-full border ${clases}">
      <span aria-hidden="true" class="w-2 h-2 rounded-full ${punto} shrink-0"></span>
      <span>${mntEsc(mntTextoEstadoOperativoControl(valor))}</span>
    </span>
  `;
}

// Bloque ESTADO ACTUAL DEL CONTROL (Capa 2). Fuente EXCLUSIVA:
// p.estado_operativo_actual. C2D-2D2B-2: el botón "Registrar revisión" deja
// de estar deshabilitado y abre la modal PROPIA de Control. El gating es
// SOLO UX y usa EXACTAMENTE el patrón real de TV: si el helper global
// esAdminOperativoActual no existe o no devuelve true, el botón no se pinta.
// La autoridad definitiva sigue siendo la RPC backend (usuario habilitado +
// es_administrador_actual); aquí NO se inventan roles, emails ni UUID.
function mntBloqueEstadoOperativoControlHTML(p) {
  const valorActual = p ? p.estado_operativo_actual : null;
  const sinRevision = valorActual === null || valorActual === undefined;

  const puedeRevisar = typeof window.esAdminOperativoActual === 'function' &&
    window.esAdminOperativoActual() === true &&
    !!p && !!p.id;

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Estado actual del control</h4>
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-2">
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Estado operativo actual</p>
        <div>${mntIndicadorEstadoOperativoControlHTML(valorActual)}</div>
        <p class="text-[10px] text-slate-400 dark:text-slate-500">
          ${sinRevision
            ? 'Todavía no se registran revisiones del estado de este control.'
            : 'Resultado de la última revisión registrada en Mantención General.'}
        </p>
        ${puedeRevisar ? `
        <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onclick="abrirModalRevisionControl('${mntEsc(p.id)}')"
            class="mt-1 inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all">
            <span aria-hidden="true">📝</span>
            <span>Registrar revisión</span>
          </button>
        </div>` : ''}
      </div>
    </div>
  `;
}

// Bloque CAMBIO DE PILAS. Un cambio de pilas es un EVENTO fechado
// (append-only), NO un estado booleano: no se muestra último cambio,
// contador, periodicidad ni próximo cambio porque no existen datos reales
// que los sustenten. C2D-2F1: el botón "Registrar cambio de pilas" se pinta
// SOLO con permiso operativo (mismo criterio visual que "Registrar revisión":
// sin permiso simplemente no se pinta). La autoridad real sigue en la RPC
// (usuario habilitado + es_administrador_actual: admite Administrador
// permanente O temporal vigente). El botón "Anular registro" NO existe aún
// (será C2D-2F2).
function mntBloqueCambioPilasControlHTML(p) {
  const puedeRegistrar = !!p && !!p.id &&
    typeof window.esAdminOperativoActual === 'function' &&
    window.esAdminOperativoActual() === true;

  const botonRegistrar = puedeRegistrar
    ? `<div class="pt-2 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onclick="abrirModalCambioPilasControl('${mntEsc(p.id)}')"
            class="mt-1 inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-lg shadow-amber-600/30 transition-all">
            <span aria-hidden="true">🔋</span>
            <span>Registrar cambio de pilas</span>
          </button>
        </div>`
    : '';

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Cambio de pilas</h4>
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-2">
        <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed">
          Cada cambio de pilas se registra como un <span class="font-black">evento</span> con su
          fecha, autor y observación. No es un estado booleano: un control puede acumular varios
          cambios de pilas a lo largo del tiempo.
        </p>
        ${botonRegistrar}
      </div>
    </div>
  `;
}

// Bloques HISTORIALES del control (Capa 3, solo lectura): DOS
// contenedores separados con namespace propio de control. Nunca se
// mezclan revisiones de estado (booleanas) con eventos de cambio de
// pilas (no booleanos). El contenido real se pinta de forma asíncrona
// desde mntCargarHistorialesControl(p).
function mntBloqueHistorialesControlHTML() {
  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Historial de revisiones de estado</h4>
      <div id="mnt-historial-estado-control" class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Cargando historial...</p>
      </div>
    </div>
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Historial de cambios de pilas</h4>
      <div id="mnt-historial-pilas-control" class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Cargando historial...</p>
      </div>
    </div>
  `;
}

// Etiqueta de un valor PREVIO de revisión de estado (jsonb:
// true/false/null). SOLO presentación; comparación estricta.
function mntEtiquetaEstadoPreviaControl(valor) {
  if (valor === true) return 'Operativo';
  if (valor === false) return 'No operativo';
  return 'Sin estado previo';
}

// C2D-2E5A — Bloque informativo de ANULACIÓN (SOLO representación,
// read-only). NO es un botón, NO tiene onclick, NO llama a
// HistorialService.anularHistorial(). Se agrega DEBAJO de la
// información original, que siempre permanece visible: la anulación no
// borra ni reinterpreta el registro, solo indica que dejó de estar
// vigente. Todo texto de BD pasa por mntEsc(). Fechas por el helper real
// mntFechaHoraRevisionTexto (que ya devuelve texto neutro si falta o es
// ilegible). El UUID anulado_por NUNCA se muestra al usuario.
function mntBloqueAnulacionHTML(anulacion, opciones = {}) {
  const a = (anulacion && typeof anulacion === 'object') ? anulacion : {};

  const motivo = (typeof a.motivo === 'string' && a.motivo.trim() !== '')
    ? a.motivo.trim()
    : 'Sin motivo registrado';

  const autorAnulacion = (typeof (window.UsuariosService?.nombreParaMostrar?.(a,'autor_nombre_snapshot') ?? a.autor_nombre_snapshot) === 'string' && (window.UsuariosService?.nombreParaMostrar?.(a,'autor_nombre_snapshot') ?? a.autor_nombre_snapshot).trim() !== '')
    ? (window.UsuariosService?.nombreParaMostrar?.(a,'autor_nombre_snapshot') ?? a.autor_nombre_snapshot).trim()
    : 'Autor no registrado';

  const fechaAnulacion = mntFechaHoraRevisionTexto(a.created_at);
  const texto = opciones.texto || 'Este registro fue anulado y no se considera vigente.';

  return `
    <div class="mt-1 p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 space-y-1">
      <p class="text-[10px] font-black uppercase tracking-wide text-rose-600 dark:text-rose-400">ANULACIÓN</p>
      <p class="text-[11px] font-semibold text-rose-700 dark:text-rose-300 break-words">${mntEsc(texto)}</p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Motivo: ${mntEsc(motivo)}
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Anulado por: ${mntEsc(autorAnulacion)}
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Fecha de anulación: ${mntEsc(fechaAnulacion)}
      </p>
    </div>
  `;
}

// Evento de REVISIÓN DE ESTADO (campo 'estado_operativo', accion
// 'revision'). Renderer EXCLUSIVO: no reutiliza mntEventoRevisionHTML
// (semántica propia de TV). La tabla no tiene columna "cambio": la
// comparación valor_anterior !== valor_nuevo es SOLO para presentación
// (comparación estricta). Todo texto de BD pasa por mntEsc.
// C2D-2E5A: si ev.anulacion existe, el registro ORIGINAL sigue visible
// con fecha, autor, valores y chip intactos; se agrega el chip "ANULADA"
// y el bloque de anulación. Si ev.anulacion es null/undefined el
// comportamiento es EXACTAMENTE el anterior. NO hay botón de anulación.
function mntEventoRevisionControlHTML(ev) {
  const registro = ev || {};
  const anterior = registro.valor_anterior;
  const nuevo = registro.valor_nuevo;
  const huboCambio = anterior !== nuevo;
  const anulada = registro.anulacion !== null && registro.anulacion !== undefined;

  const observacionTexto = (typeof registro.observacion === 'string' && registro.observacion.trim() !== '')
    ? registro.observacion.trim()
    : 'Sin observación registrada';

  const autorTexto = (typeof (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot) === 'string' && (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot).trim() !== '')
    ? (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot).trim()
    : 'Autor no registrado';

  const cambioClases = huboCambio
    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';

  const chipAnulada = anulada
    ? `<span class="text-[10px] font-black px-2.5 py-1 rounded-full border bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900">ANULADA</span>`
    : '';

  const bloqueAnulacion = anulada
    ? mntBloqueAnulacionHTML(registro.anulacion, {
        texto: 'Este registro fue anulado y no se considera una revisión vigente.'
      })
    : '';

  // C2D-2E5B — GATING del botón "Anular revisión" (SOLO lectura del rol en
  // cliente; la autoridad definitiva sigue siendo la RPC backend). Se exige
  // TODO: registro real con id, dominio EXACTO control / estado_operativo /
  // revision, aún NO anulado, y Administrador PERMANENTE (nunca temporal).
  // Sin rol/email/UUID hardcodeados. El botón NO aparece en eventos de
  // cambio de pilas ni en el historial de TV.
  const historialId = registro.id || null;
  const puedeAnular = !!historialId &&
    registro.tipo_entidad === 'control' &&
    registro.campo === 'estado_operativo' &&
    registro.accion === 'revision' &&
    !anulada &&
    typeof window.esAdminPermanenteActual === 'function' &&
    window.esAdminPermanenteActual() === true;

  // Registro original (copia superficial) disponible para la modal de
  // anulación: evita serializar datos de BD en atributos onclick y garantiza
  // que el contexto mostrado (fecha, estados, autor, observación y sobre todo
  // el entidad_id REAL del evento) salga del evento leído, nunca de la UI.
  if (puedeAnular) {
    mntAnulacionRevisionControlEventos.set(String(historialId), Object.assign({}, registro));
  }

  const botonAnular = puedeAnular
    ? `<div class="pt-2 border-t border-slate-100 dark:border-slate-700">
        <button type="button" onclick="abrirModalAnulacionRevisionControl('${mntEsc(String(historialId))}')"
          class="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all">
          <span aria-hidden="true">⛔</span>
          <span>Anular revisión</span>
        </button>
      </div>`
    : '';

  return `
    <li class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs font-black text-slate-800 dark:text-slate-200">${mntEsc(mntFechaHoraRevisionTexto(registro.created_at))}</p>
        <span class="flex flex-wrap items-center gap-2">
          <span class="text-[10px] font-black px-2.5 py-1 rounded-full border ${cambioClases}">
            ${huboCambio ? 'Cambio de estado' : 'Revisión sin cambio'}
          </span>
          ${chipAnulada}
        </span>
      </div>
      <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">
        ${mntEsc(mntEtiquetaEstadoPreviaControl(anterior))} → ${mntEsc(mntEtiquetaEstadoPreviaControl(nuevo))}
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Observación: ${mntEsc(observacionTexto)}
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Autor: ${mntEsc(autorTexto)}
      </p>
      ${botonAnular}
      ${bloqueAnulacion}
    </li>
  `;
}

// Evento de CAMBIO DE PILAS (campo 'cambio_pilas', accion 'evento').
// Renderer EXCLUSIVO: NO interpreta valor_nuevo ni valor_anterior como
// booleanos (valor_nuevo = 'cambio_pilas' es dato técnico del backend y
// NO se muestra al usuario). Solo: título del evento, fecha real
// (created_at del servidor), autor y observación. Todo con mntEsc.
// C2D-2E5A: si ev.anulacion existe, el evento ORIGINAL sigue visible y
// se agrega el chip "ANULADO" más el bloque de anulación. Si
// ev.anulacion es null/undefined el comportamiento base es EXACTAMENTE el
// anterior.
// C2D-2F2: se agrega el botón "Anular registro" SOLO para el dominio
// control / cambio_pilas / evento, aún NO anulado y con Administrador
// PERMANENTE (el backend exige es_administrador_permanente_actual(); un
// administrador temporal NO puede anular). Sin rol/email/UUID hardcodeados.
function mntEventoCambioPilasHTML(ev) {
  const registro = ev || {};
  const anulado = registro.anulacion !== null && registro.anulacion !== undefined;

  const observacionTexto = (typeof registro.observacion === 'string' && registro.observacion.trim() !== '')
    ? registro.observacion.trim()
    : 'Sin observación registrada';

  const autorTexto = (typeof (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot) === 'string' && (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot).trim() !== '')
    ? (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot).trim()
    : 'Autor no registrado';

  const chipAnulado = anulado
    ? `<span class="text-[10px] font-black px-2.5 py-1 rounded-full border bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900">ANULADO</span>`
    : '';

  const bloqueAnulacion = anulado
    ? mntBloqueAnulacionHTML(registro.anulacion, {
        texto: 'Este evento fue anulado y no se considera vigente.'
      })
    : '';

  // C2D-2F2 — GATING del botón "Anular registro" (SOLO lectura del rol en
  // cliente; la autoridad definitiva sigue siendo la RPC backend). Se exige
  // TODO: registro real con id, dominio EXACTO control / cambio_pilas /
  // evento, aún NO anulado, y Administrador PERMANENTE (nunca temporal).
  const historialId = registro.id || null;
  const puedeAnular = !!historialId &&
    registro.tipo_entidad === 'control' &&
    registro.campo === 'cambio_pilas' &&
    registro.accion === 'evento' &&
    !anulado &&
    typeof window.esAdminPermanenteActual === 'function' &&
    window.esAdminPermanenteActual() === true;

  // Registro original (copia superficial) disponible para la modal de
  // anulación: evita serializar datos de BD en atributos onclick y garantiza
  // que historialId (ev.id), controlId (ev.entidad_id) y el contexto
  // mostrado salgan del evento leído, nunca de la UI.
  if (puedeAnular) {
    mntAnulacionCambioPilasControlEventos.set(String(historialId), Object.assign({}, registro));
  }

  const botonAnular = puedeAnular
    ? `<div class="pt-2 border-t border-slate-100 dark:border-slate-700">
        <button type="button" onclick="abrirModalAnularCambioPilasControl('${mntEsc(String(historialId))}')"
          class="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all">
          <span aria-hidden="true">⛔</span>
          <span>Anular registro</span>
        </button>
      </div>`
    : '';

  return `
    <li class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs font-black text-slate-800 dark:text-slate-200">Cambio de pilas</p>
        <span class="flex flex-wrap items-center gap-2">
          <span class="text-[10px] font-black px-2.5 py-1 rounded-full border bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900">
            Evento registrado
          </span>
          ${chipAnulado}
        </span>
      </div>
      <p class="text-xs font-semibold text-slate-600 dark:text-slate-400">
        ${mntEsc(mntFechaHoraRevisionTexto(registro.created_at))}
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Observación: ${mntEsc(observacionTexto)}
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Autor: ${mntEsc(autorTexto)}
      </p>
      ${botonAnular}
      ${bloqueAnulacion}
    </li>
  `;
}

// Carga ASÍNCRONA de los DOS historiales del control seleccionado (solo
// lectura). Se invoca SIEMPRE después de insertar la ficha en el DOM.
// Dos lecturas independientes vía Promise.allSettled: cada bloque pinta
// su resultado o su error POR SEPARADO sin destruir la ficha.
// Antes de pintar se comprueba, por bloque:
//   1) que el contenedor siga existiendo (ficha abierta);
//   2) que mantencionPilaSeleccionada siga siendo p.id.
// Si el usuario cerró la ficha o abrió otro control, los resultados
// viejos NO se pintan. En error: console.error técnico + mensaje neutro
// dentro del bloque, sin stack traces.
async function mntCargarHistorialesControl(p) {
  if (!p || !p.id) return;

  const contRevisionesInicial = document.getElementById('mnt-historial-estado-control');
  const contPilasInicial = document.getElementById('mnt-historial-pilas-control');
  if (!contRevisionesInicial && !contPilasInicial) return;

  const cargar = (campo) => {
    if (!window.HistorialService) {
      return Promise.reject(new Error('HistorialService no está cargado.'));
    }
    // Única fuente de datos: public.mantencion_historial (solo lectura,
    // vía service), SIEMPRE filtrado por campo para no mezclar
    // revisiones booleanas con eventos de cambio de pilas. Orden: el
    // más reciente primero (created_at DESC).
    return window.HistorialService.getRevisiones('control', p.id, campo);
  };

  const [resRevisiones, resPilas] = await Promise.allSettled([
    cargar('estado_operativo'),
    cargar('cambio_pilas')
  ]);

  // Tras el await la ficha pudo cambiar: se re-verifica antes de pintar.
  if (mantencionPilaSeleccionada !== p.id) return;

  // --- Bloque A: revisiones de estado ---
  const contRevisiones = document.getElementById('mnt-historial-estado-control');
  if (contRevisiones) {
    if (resRevisiones.status === 'rejected') {
      console.error('Error cargando las revisiones de estado del control:', resRevisiones.reason);
      contRevisiones.innerHTML = `
        <p class="text-xs font-bold text-rose-600 dark:text-rose-400">
          No fue posible cargar las revisiones de estado.
        </p>
      `;
    } else {
      const revisiones = resRevisiones.value;
      if (!Array.isArray(revisiones) || revisiones.length === 0) {
        contRevisiones.innerHTML = `
          <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Sin revisiones de estado registradas.
          </p>
        `;
      } else {
        contRevisiones.innerHTML = `
          <p class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            ${revisiones.length} revisión(es) registrada(s) · más reciente primero
          </p>
          <div class="mt-3">${mntHistorialPaginadoHTML(revisiones.length, 'Revisiones de controles', `<ul class="space-y-3">
            ${mntOrdenarHistorialReciente(revisiones).map(mntEventoRevisionControlHTML).join('')}
          </ul>`)}</div>
        `;
      }
    }
  }

  // --- Bloque B: cambios de pilas ---
  const contPilas = document.getElementById('mnt-historial-pilas-control');
  if (contPilas) {
    if (resPilas.status === 'rejected') {
      console.error('Error cargando los cambios de pilas del control:', resPilas.reason);
      contPilas.innerHTML = `
        <p class="text-xs font-bold text-rose-600 dark:text-rose-400">
          No fue posible cargar los cambios de pilas.
        </p>
      `;
    } else {
      const eventos = resPilas.value;
      if (!Array.isArray(eventos) || eventos.length === 0) {
        contPilas.innerHTML = `
          <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Sin cambios de pilas registrados.
          </p>
        `;
      } else {
        contPilas.innerHTML = `
          <p class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            ${eventos.length} cambio(s) de pilas registrado(s) · más reciente primero
          </p>
          <div class="mt-3">${mntHistorialPaginadoHTML(eventos.length, 'Cambios de pilas', `<ul class="space-y-3">
            ${mntOrdenarHistorialReciente(eventos).map(mntEventoCambioPilasHTML).join('')}
          </ul>`)}</div>
        `;
      }

      // C2D-2F1 — opción B de limpieza del bloqueo pendiente: la lectura
      // ESPECÍFICA del historial de cambio_pilas de ESTE control terminó
      // correctamente (aquí solo se llega con status 'fulfilled'), por lo que
      // el historial ya se confirmó fresco en Supabase y un nuevo registro
      // vuelve a ser legítimo. NO se limpia si la lectura falló (bloque
      // 'rejected' de arriba) ni simplemente al abrir la ficha.
      if (mntCambioPilasControlPendienteRefresco !== null &&
          mntCambioPilasControlPendienteRefresco === p.id) {
        mntCambioPilasControlPendienteRefresco = null;
      }

      // C2D-2F2 — mismo criterio para la anulación de un registro de cambio
      // de pilas: esta lectura ESPECÍFICA del historial de cambio_pilas de
      // ESTE control terminó correctamente (status 'fulfilled'), por lo que
      // el estado real del historial quedó confirmado y una nueva anulación
      // vuelve a ser legítima. NO se limpia si la lectura falló.
      if (mntAnulacionCambioPilasControlPendienteRefresco !== null &&
          mntAnulacionCambioPilasControlPendienteRefresco === p.id) {
        mntAnulacionCambioPilasControlPendienteRefresco = null;
      }
    }
  }
}

// Ficha del control: Capa 1 (datos propios del Excel + información
// relacionada con TV solo si existe FK + nota de migración + trazabilidad)
// y, desde C2D-2D2B-1, Capa 2 (estado actual del control + sección de
// cambio de pilas) y Capa 3 (dos historiales separados con carga asíncrona).
// Desde C2D-2D2B-2 el botón "Registrar revisión" está habilitado (modal
// propia de Control); "Registrar cambio de pilas" sigue deshabilitado.
// Sin campos editables. La nota de "mantenciones: 0" sigue siendo el dato
// del Excel (las columnas de fecha de mantención estaban vacías).
function mntFichaPilaHTML(p) {
  const tipo = mntTipoControlPila(p);
  const ubicaciones = mntUbicacionesPila(p);
  const relacion = mntRelacionControlPila(p, mntPilasTelevisores);

  // Bloque de información relacionada: SOLO cuando existe FK real.
  // Sin relación (p. ej. Salón 2 / Salón 3) no se emite ningún bloque; la
  // ausencia de relación se trata como ausencia, no como error.
  // C2D-2D2B-1: se ROTULA como dato original/importado para no confundirlo
  // con el estado operativo actual (Capa 2): control_tv_original es
  // originalidad y control_deco_funciona es funcionamiento importado
  // histórico; ninguno equivale a estado_operativo_actual.
  let bloqueRelacion = '';
  if (relacion) {
    bloqueRelacion = `
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <p class="text-[10px] font-black uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1">Dato original / importado (TV-Habitaciones)</p>
        <p class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
          Valores heredados del Excel de TV-Habitaciones: originalidad del Control TV o
          funcionamiento histórico del Control Deco. NO representan el estado operativo actual del control.
        </p>
      </div>
      ${mntBloqueInformacionControlHTML(relacion.registro, relacion.rol)}
      ${mntBloqueTelevisorRelacionadoHTML(relacion.registro, mntPilasElementos)}
    `;
  }

  // observaciones: texto generado por la migración (no del cliente).
  const notaMigracion = (p.observaciones !== null && p.observaciones !== undefined && String(p.observaciones).trim() !== '')
    ? String(p.observaciones) : null;

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-5 space-y-5">

      <!-- CABECERA FICHA -->
      <div class="flex items-start space-x-3">
        <div class="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-100 dark:border-amber-900 flex items-center justify-center text-2xl shrink-0">🔋</div>
        <div class="min-w-0">
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Ficha del control</p>
          <h3 class="text-lg font-black text-slate-900 dark:text-white leading-snug break-words">${mntEsc(mntSinDato(p.nombre_original))}</h3>
          ${tipo ? `<span class="inline-block mt-1.5 text-[10px] font-black px-2 py-1 rounded-full bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${mntEsc(tipo)}</span>` : ''}
        </div>
      </div>

      <!-- DATOS DEL CONTROL -->
      <div>
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Datos del control</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${mntCampoFichaHTML('Control', p.nombre_original)}
          ${mntCampoFichaHTML('Tipo', tipo)}
          ${mntCampoFichaHTML(mntEtiquetaCodigo(p), p.codigo)}
          ${ubicaciones.canonica !== null ? mntCampoFichaHTML('Ubicación', ubicaciones.canonica) : ''}
          ${ubicaciones.mostrarOriginal ? mntCampoFichaHTML('Ubicación original', p.ubicacion_original) : ''}
        </div>
        <p class="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
          El título del control fue generado durante la migración a partir del tipo de control y HAB del Excel.
        </p>
      </div>

      <!-- INFORMACIÓN RELACIONADA CON TV-HABITACIONES + TELEVISOR RELACIONADO
           (solo si existe relación FK real; rotulado como dato original) -->
      ${bloqueRelacion}

      <!-- ESTADO ACTUAL DEL CONTROL (Capa 2): fuente EXCLUSIVA
           p.estado_operativo_actual. Desde C2D-2D2B-2 el botón "Registrar
           revisión" abre la modal propia de Control (escritura SOLO vía
           HistorialService.revisarEstado) -->
      ${mntBloqueEstadoOperativoControlHTML(p)}

      <!-- CAMBIO DE PILAS (C2D-2D2B-1, evento fechado). Desde C2D-2F1 el
           botón "Registrar cambio de pilas" abre la modal propia (escritura
           SOLO vía HistorialService.registrarEvento). Sin fecha, cantidad,
           marca ni periodicidad inventados -->
      ${mntBloqueCambioPilasControlHTML(p)}

      <!-- HISTORIALES SEPARADOS (C2D-2D2B-1, Capa 3, solo lectura):
           dos contenedores con namespace propio de control; se pintan de
           forma asíncrona vía mntCargarHistorialesControl(p) DESPUÉS de
           insertar la ficha -->
      ${mntBloqueHistorialesControlHTML()}

      <!-- NOTA DE MIGRACIÓN (texto generado, no del cliente) -->
      ${notaMigracion ? `
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Nota de migración</h4>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
          <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-relaxed break-words">${mntEsc(notaMigracion)}</p>
          <p class="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
            Texto generado durante la migración; no proviene de una columna de observaciones del Excel.
          </p>
        </div>
      </div>` : ''}

      <!-- TRAZABILIDAD -->
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Origen / trazabilidad</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          ${mntCampoFichaHTML('Archivo origen', p.archivo_origen)}
          ${mntCampoFichaHTML('Hoja origen', p.hoja_origen)}
          ${mntCampoFichaHTML('Fila origen', p.fila_origen)}
          ${mntCampoFichaHTML('Celda origen', p.celda_origen)}
        </div>
      </div>
    </div>
  `;
}

// ==========================================================
// PILAS Y CONTROLES — FASE C2D-2D2B-2 (REGISTRAR REVISIÓN DEL CONTROL)
// ==========================================================
// Modal PROPIA y reutilizable para registrar UNA revisión del campo
// 'estado_operativo' (elementos_mantenibles.estado_operativo_actual) de un
// control (tipoEntidad 'control').
// ÚNICA vía de escritura: window.HistorialService.revisarEstado(...) →
// RPC public.mantencion_revisar_estado. SIN supabase.rpc() directo desde la
// vista, SIN .from().insert()/update()/delete(), SIN localStorage ni mocks.
// El cliente NO envía autor, fecha, created_at ni usuario: todo lo controla
// el backend (auth.uid() + snapshots server-side).
// Namespace y guard PROPIOS: jamás se comparten ids ni flags con el modal
// TV (mntRevisionTVGuardando / mnt-modal-revision-*).
// El "cambio de pilas" sigue DESCONECTADO: en esta fase NO se llama
// HistorialService.registrarEvento y NO existe modal/guard/submit de pilas.
// Todo texto de BD mostrado en el HTML pasa por mntEsc; los errores se
// muestran con textContent (nunca stack traces ni HTML de error).

const MNT_MODAL_REVISION_CONTROL_ID = 'mnt-modal-revision-control-overlay';

// true mientras la RPC está en vuelo. Guard EXCLUSIVO de Control (nunca se
// reutiliza mntRevisionTVGuardando). Ciclo:
//   false → true : en mntEnviarRevisionControl, justo antes de llamar a
//                  HistorialService.revisarEstado.
//   true  → false: SOLO cuando la RPC terminó — error ⇒
//                  mntRestaurarSubmitRevisionControl(); éxito ⇒ liberación
//                  explícita en el finally de mntEnviarRevisionControl.
// Cerrar/ocultar la modal (Escape, X, Cancelar, clic fuera o cierre del
// subapartado) NO lo libera, y abrirModalRevisionControl lo respeta (return).
let mntRevisionControlGuardando = false;

// C2D-2D2B-2.2 — BLOQUEO DE REINTENTO tras escritura CONFIRMADA con
// refresco fallido. Guarda el id del control cuya revisión YA quedó
// registrada en mantencion_historial pero cuyo refresco de la vista falló.
// Mientras esté activa:
//   - mntEnviarRevisionControl hace return SIN ejecutar ninguna RPC;
//   - la modal de ESE control se renderiza con el aviso informativo y el
//     botón deshabilitado en "Revisión registrada".
// Se limpia SOLO cuando Pilas/Controles se vuelve a leer de Supabase
// (cargarPanelSubapartado), es decir cuando el usuario sigue el aviso
// "Cierra y vuelve a abrir Pilas y Controles": en ese punto la ficha ya
// muestra el estado real y una nueva revisión sí sería legítima.
let mntRevisionControlPendienteRefresco = null;

// Texto ÚNICO del aviso "escritura confirmada + refresco fallido".
// NUNCA se muestra en el contenedor de error de RPC ni se resuelve con
// MNT_MENSAJES_ERROR_REVISION_CONTROL: esos mensajes son EXCLUSIVOS del
// fallo de la RPC y aquí la revisión SÍ quedó registrada.
const MNT_AVISO_REFRESCO_CONTROL = 'La revisión quedó registrada correctamente, pero no fue posible actualizar la vista. No vuelvas a enviar la revisión. Cierra y vuelve a abrir Pilas y Controles.';

// Mensajes amigables por código de error real del backend.
// NUNCA se muestra el detalle técnico (SQL, UUID, stack) al usuario.
const MNT_MENSAJES_ERROR_REVISION_CONTROL = {
  SESION_INVALIDA: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
  NO_AUTORIZADO: 'No tienes permisos para registrar esta revisión.',
  CAMPO_NO_PERMITIDO: 'No se puede registrar esta revisión.',
  CONFIG_INCOMPLETA: 'La configuración de esta revisión no está disponible.',
  ENTIDAD_NO_ENCONTRADA: 'Este control ya no está disponible.',
  TIPO_NO_IMPLEMENTADO: 'Este tipo de control aún no admite esta operación.',
  VALOR_INVALIDO: 'El estado seleccionado no es válido.',
  VALOR_NO_PERMITIDO: 'El estado seleccionado no está permitido.'
};

// Crea la modal UNA sola vez. Si ya existe, devuelve la misma (no duplica
// ids ni estructura).
function asegurarModalRevisionControl() {
  let overlay = document.getElementById(MNT_MODAL_REVISION_CONTROL_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MNT_MODAL_REVISION_CONTROL_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Registrar revisión del control');
  overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-3 sm:p-4 overflow-y-auto';
  overlay.onclick = function (ev) {
    // Solo el clic en el fondo cierra; el clic dentro de la caja no burbujea.
    // UX-02: fondo sin cierre.
  };
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 my-auto text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
      <div id="mnt-modal-revision-control"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// Escape cierra PRIMERO la modal de revisión del control (fase de captura,
// por delante de mntTeclaEscapeSubapartado). Aunque la RPC esté en vuelo
// puede ocultar la modal, pero NO libera mntRevisionControlGuardando ⇒ no
// se puede iniciar otra revisión hasta que esa RPC termine.
function mntTeclaEscapeRevisionControl(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

// Contenido de la modal: contexto REAL del control (tipo, código/HAB,
// ubicación y estado actual) + formulario. Estado revisado: radios con
// valor "true"/"false"; la VALIDACIÓN distingue explícitamente
// true / false / sin selección (nunca if (!valor)). Preselección: solo
// comodidad, NO implica que la revisión esté guardada, y sale SIEMPRE de
// p.estado_operativo_actual (nunca de datos históricos/importados).
function mntContenidoModalRevisionControlHTML(p) {
  const tipo = mntTipoControlPila(p);
  const ubicaciones = mntUbicacionesPila(p);
  const ubicacionTexto = ubicaciones.canonica !== null ? ubicaciones.canonica : p.ubicacion_original;
  const valorActual = p.estado_operativo_actual;

  // C2D-2D2B-2.2: si la revisión de ESTE control ya quedó registrada y solo
  // falló el refresco, la modal se abre/mantiene en estado "ya registrada":
  // aviso informativo visible y botón deshabilitado (sin segundo envío).
  const pendienteRefresco = mntRevisionControlPendienteRefresco !== null &&
    mntRevisionControlPendienteRefresco === p.id;

  const preseleccionTrue = valorActual === true ? 'checked' : '';
  const preseleccionFalse = valorActual === false ? 'checked' : '';

  const claseRadio = 'w-4 h-4 text-blue-600 bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-blue-500 cursor-pointer';
  const claseOpcion = 'flex items-center space-x-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700';

  return `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center space-x-2.5 min-w-0">
        <span class="text-2xl shrink-0">🔋</span>
        <div class="min-w-0">
          <h3 class="text-base font-bold text-slate-800 dark:text-white truncate">Registrar revisión del control</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate">Hotel & Centro de Eventos El Almendro</p>
        </div>
      </div>
      <button type="button" onclick="cerrarModalRevisionControl()"
        class="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold">&times;</button>
    </div>

    <div class="mt-3 space-y-1.5">
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Control: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(p.nombre_original))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Tipo: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(tipo))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        ${mntEsc(mntEtiquetaCodigo(p))}: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(p.codigo))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Ubicación: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(ubicacionTexto))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Estado actual:
        <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntTextoEstadoOperativoControl(valorActual))}</span>
      </p>
    </div>

    <form onsubmit="mntEnviarRevisionControl(event)" class="mt-4 space-y-3.5">
      <input type="hidden" id="mnt-revision-control-id" value="${mntEsc(p.id)}">

      <div>
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Estado revisado *</label>
        <div class="space-y-2">
          <label class="${claseOpcion}">
            <input type="radio" id="mnt-revision-control-operativo" name="mnt-revision-control-estado" value="true" ${preseleccionTrue} class="${claseRadio}">
            <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">Operativo</span>
          </label>
          <label class="${claseOpcion}">
            <input type="radio" id="mnt-revision-control-no-operativo" name="mnt-revision-control-estado" value="false" ${preseleccionFalse} class="${claseRadio}">
            <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">No operativo</span>
          </label>
        </div>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          Debes seleccionar una opción. También se registra si el estado no cambia: es una revisión periódica válida.
        </p>
      </div>

      <div>
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Observación (opcional)</label>
        <textarea id="mnt-revision-control-observacion" rows="3"
          placeholder="Sin observación registrada si lo dejas vacío"
          class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
      </div>

      <!-- Mensaje inline de error. NO se muestra éxito salvo que
           Supabase confirme la operación. -->
      <div id="mnt-revision-control-error"
        class="hidden rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
      </div>

      <!-- Aviso INFORMATIVO (C2D-2D2B-2.2): caja azul, DISTINTA del
           recuadro rose de error de RPC. Texto fijo de la constante
           MNT_AVISO_REFRESCO_CONTROL; se llena con textContent. -->
      <div id="mnt-revision-control-aviso" class="${pendienteRefresco ? '' : 'hidden'} rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-xs font-bold text-blue-800 dark:text-blue-200 leading-relaxed">${pendienteRefresco ? mntEsc(MNT_AVISO_REFRESCO_CONTROL) : ''}</div>

      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2.5">
        <button type="button" onclick="cerrarModalRevisionControl()"
          class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" id="mnt-revision-control-submit" ${pendienteRefresco ? 'disabled' : ''}
          class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-blue-600">
          <span id="mnt-revision-control-submit-label">${pendienteRefresco ? 'Revisión registrada' : 'Guardar revisión'}</span>
        </button>
      </div>
    </form>
  `;
}

// Abre la modal para el control indicado. El estado inicial del formulario
// sale de p.estado_operativo_actual (leído desde Supabase), con comparación
// estricta: true → "Operativo", false → "No operativo",
// null/undefined → ninguna preselección. NUNCA se infiere desde
// control_tv_original / control_deco_funciona / estado_original.
function abrirModalRevisionControl(controlId) {
  // Anti doble RPC: si hay una revisión en vuelo NO se permite iniciar otra.
  // Cerrar la modal (Escape, X, Cancelar, clic fuera o cierre del
  // subapartado) NO libera el guard: solo lo hace la RPC al terminar.
  if (mntRevisionControlGuardando) {
    console.warn('mntRevisionControlGuardando activo: se omite abrir una nueva revisión del control.');
    return;
  }

  const pila = mntPilasBase.find(p => p && p.id === controlId) || null;
  if (!pila || !pila.id) return;

  const overlay = asegurarModalRevisionControl();
  const cont = document.getElementById('mnt-modal-revision-control');
  if (!overlay || !cont) return;

  // Contenido nuevo en cada apertura (sin errores ni envíos previos).
  // NO se toca mntRevisionControlGuardando: aquí ya es false por la guarda.
  cont.innerHTML = mntContenidoModalRevisionControlHTML(pila);
  overlay.classList.remove('hidden');

  // Sin listeners duplicados: se retira antes de volver a agregar.
  document.removeEventListener('keydown', mntTeclaEscapeRevisionControl, true);
  document.addEventListener('keydown', mntTeclaEscapeRevisionControl, true);

  const preseleccionado = cont.querySelector('input[name="mnt-revision-control-estado"]:checked');
  const primero = preseleccionado || cont.querySelector('input[name="mnt-revision-control-estado"]');
  if (primero && typeof primero.focus === 'function') primero.focus();
}

// Oculta la modal y retira SOLO su listener de Escape. NO libera el guard:
// cerrar/ocultar no significa que la RPC terminó. No toca la ficha
// subyacente ni el estado de selección.
function cerrarModalRevisionControl() {
  const overlay = document.getElementById(MNT_MODAL_REVISION_CONTROL_ID);
  if (overlay) overlay.classList.add('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeRevisionControl, true);
}

function mntMostrarErrorRevisionControl(mensaje) {
  const caja = document.getElementById('mnt-revision-control-error');
  if (!caja) return;
  caja.textContent = mensaje;   // textContent: nunca HTML de error
  caja.classList.remove('hidden');
}

function mntOcultarErrorRevisionControl() {
  const caja = document.getElementById('mnt-revision-control-error');
  if (!caja) return;
  caja.textContent = '';
  caja.classList.add('hidden');
}

// Aviso INFORMATIVO de "escritura confirmada + refresco fallido"
// (C2D-2D2B-2.2). Caja AZUL propia de la modal (no es el recuadro rose de
// error de RPC) y texto fijo: comunica que la revisión SÍ quedó
// registrada, que falló solo la actualización visual y que NO hay que
// reenviar. textContent: nunca HTML.
function mntMostrarAvisoRevisionControl() {
  const caja = document.getElementById('mnt-revision-control-aviso');
  if (!caja) return;
  caja.textContent = MNT_AVISO_REFRESCO_CONTROL;
  caja.classList.remove('hidden');
}

// Estado final del botón tras una escritura CONFIRMADA con refresco
// fallido: queda DESHABILITADO y rotulado "Revisión registrada", de modo
// que un segundo submit sea imposible desde esta modal. El reintento solo
// vuelve a habilitarse en una modal nueva (render normal) cuando
// Pilas/Controles se vuelva a leer de Supabase.
function mntMarcarSubmitRevisionControlRegistrado() {
  const btn = document.getElementById('mnt-revision-control-submit');
  const etiqueta = document.getElementById('mnt-revision-control-submit-label');
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Revisión registrada';
}

// Ruta de ERROR: la RPC terminó (con fallo), por lo que SÍ se libera el
// guard y se restaura el botón para poder reintentar.
function mntRestaurarSubmitRevisionControl() {
  mntRevisionControlGuardando = false;
  const btn = document.getElementById('mnt-revision-control-submit');
  const etiqueta = document.getElementById('mnt-revision-control-submit-label');
  if (btn) btn.disabled = false;
  if (etiqueta) etiqueta.textContent = 'Guardar revisión';
}

// SUBMIT: única escritura, vía HistorialService.revisarEstado con
// tipoEntidad 'control' y campo 'estado_operativo'. Distingue
// true / false / sin selección; acepta revisiones "sin cambio"
// (false → false o true → true): el backend las registra igual.
// NO envía autor, fecha ni usuario; observación = texto o null.
async function mntEnviarRevisionControl(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  // Anti doble envío: mientras la RPC está en vuelo se ignora cualquier
  // segundo submit (el botón además queda deshabilitado).
  if (mntRevisionControlGuardando) return;

  const cont = document.getElementById('mnt-modal-revision-control');
  if (!cont) return;

  const inputControl = document.getElementById('mnt-revision-control-id');
  const controlId = inputControl ? String(inputControl.value || '') : '';
  if (!controlId) return;

  // C2D-2D2B-2.2: si la revisión de ESTE control YA quedó registrada y solo
  // falló el refresco, aquí NO se ejecuta ninguna RPC (segundo envío
  // bloqueado aunque el botón quedara habilitado por algún repaint).
  if (mntRevisionControlPendienteRefresco !== null &&
      mntRevisionControlPendienteRefresco === controlId) {
    console.warn('Revisión ya registrada del control con refresco pendiente: se omite un segundo envío.');
    return;
  }

  // --- Estado revisado (obligatorio, con distinción explícita) ---
  const marcado = cont.querySelector('input[name="mnt-revision-control-estado"]:checked');
  let valorNuevo = null; // null = SIN SELECCIÓN
  if (marcado && marcado.value === 'true') valorNuevo = true;
  else if (marcado && marcado.value === 'false') valorNuevo = false;

  if (valorNuevo !== true && valorNuevo !== false) {
    mntMostrarErrorRevisionControl('Debes seleccionar el estado revisado: Operativo o No operativo.');
    return;
  }

  // --- Observación opcional (texto o null; nunca inventada) ---
  const textarea = document.getElementById('mnt-revision-control-observacion');
  const observacion = (textarea && typeof textarea.value === 'string' && textarea.value.trim() !== '')
    ? textarea.value.trim()
    : null;

  // --- Bloqueo de doble envío + estado "Guardando..." ---
  const btn = document.getElementById('mnt-revision-control-submit');
  const etiqueta = document.getElementById('mnt-revision-control-submit-label');
  mntRevisionControlGuardando = true;
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Guardando...';
  mntOcultarErrorRevisionControl();

  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }

    // ÚNICA escritura. El cliente NO envía autor (la RPC lo resuelve desde
    // auth.uid()) ni tablas/columnas adicionales.
    await window.HistorialService.revisarEstado({
      tipoEntidad: 'control',
      entidadId: controlId,
      campo: 'estado_operativo',
      valorNuevo: valorNuevo,
      observacion: observacion
    });
  } catch (err) {
    // Detalle técnico SOLO en consola; en la modal, mensaje amigable.
    console.error('Error registrando la revisión del control:', err);
    const codigo = err && err.codigo;
    const mensaje = MNT_MENSAJES_ERROR_REVISION_CONTROL[codigo] || 'No fue posible registrar la revisión.';
    mntMostrarErrorRevisionControl(mensaje);
    mntRestaurarSubmitRevisionControl();
    return;
  }

  // ÉXITO DE LA RPC: la revisión YA quedó registrada en mantencion_historial
  // (append-only). Desde este punto NINGÚN fallo posterior puede presentarse
  // como fallo de escritura ni usar MNT_MENSAJES_ERROR_REVISION_CONTROL.
  // El guard se mantiene en true durante todo el refresco y se libera
  // SIEMPRE en el finally.
  let refrescoOk = false;
  try {
    refrescoOk = (await mntRefrescarFichaControlTrasRevision(controlId)) === true;
  } catch (err) {
    // Excepción de render (u otra) posterior a la RPC → "escritura
    // confirmada / refresco fallido", NUNCA fallo de RPC.
    console.error('Error inesperado refrescando la ficha del control:', err);
    refrescoOk = false;
  } finally {
    mntRevisionControlGuardando = false;
  }

  // RUTA B — RPC exitosa + refresco exitoso: repintado desde datos reales
  // (ya ocurrió dentro del refresh), historiales recargados y cierre de la
  // modal. El estado mostrado NUNCA sale del radio elegido: sale de
  // Supabase.
  if (refrescoOk) {
    cerrarModalRevisionControl();
    return;
  }

  // RUTA C — RPC exitosa + refresco fallido: la modal PERMANECE ABIERTA
  // para que el usuario lea el aviso inequívoco (revisión registrada /
  // falló solo la vista / no reenviar), el botón queda en "Revisión
  // registrada" y cualquier nuevo envío de este control queda bloqueado.
  mntRevisionControlPendienteRefresco = controlId;
  mntMostrarAvisoRevisionControl();
  mntMarcarSubmitRevisionControlRegistrado();
}

// Relectura real tras el éxito + repintado de la ficha del MISMO control.
// C2D-2D2B-2.2: devuelve true SOLO cuando los datos frescos llegaron y (si
// aplica) la ficha se repintó; false cuando el REFRESCO falló (lectura o
// render). NO decide nada sobre la escritura, que ya ocurrió: la lectura de
// este resultado es exclusiva del caller para informar "éxito/fallo del
// refresco". Si el usuario cambió o cerró la ficha durante la RPC, solo se
// refrescan datos/caché: NO se pinta sobre otra ficha, NO se reabre la
// anterior y NO se toca mantencionPilaSeleccionada (eso NO es un fallo).
async function mntRefrescarFichaControlTrasRevision(controlId) {
  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está cargado.');
    }
    const pilas = await window.MantencionesService.getPilasControles(true);
    mntPilasBase = Array.isArray(pilas) ? pilas : [];
  } catch (e) {
    // Sin datos frescos NO se repinta nada (no se inventa estado local).
    console.error('Error releyendo controles tras la revisión:', e);
    return false;
  }

  // Si durante el request el usuario cerró la ficha o cambió de control,
  // NO se fuerza el repintado de la ficha anterior (los datos SÍ están
  // frescos ⇒ refresco correcto).
  if (mantencionPilaSeleccionada !== controlId) return true;

  const controlActualizado = mntPilasBase.find(p => p && p.id === controlId) || null;
  if (!controlActualizado) return true;

  // Flujo real de render de ficha: repinta con el objeto REAL recién leído
  // desde Supabase y, dentro del mismo flujo, vuelve a disparar la carga
  // ASÍNCRONA de los dos historiales (la revisión nueva ya viene de BD;
  // HistorialService.revisarEstado ya invalidó su caché).
  // C2D-2D2B-2.2: una excepción AQUÍ también cuenta como refresco fallido
  // (escritura ya confirmada) y ya NO escapa como unhandled rejection.
  try {
    abrirFichaPila(controlId);
  } catch (e) {
    console.error('Error repintando la ficha del control tras la revisión:', e);
    return false;
  }

  return true;
}

// ==========================================================
// PILAS Y CONTROLES — FASE C2D-2E5B (ANULAR REVISIÓN DE ESTADO)
// ==========================================================
// Modal PROPIA y reutilizable para anular UNA revisión de estado
// (tipo_entidad 'control', campo 'estado_operativo', accion 'revision')
// desde el historial de la ficha de Control.
// ÚNICA vía de escritura: window.HistorialService.anularHistorial({ historialId,
// motivo }) → RPC public.mantencion_anular_historial. SIN supabase.rpc()
// directo, SIN .insert()/.update()/.delete(), SIN localStorage ni mocks.
// El cliente NO envía entidad, tipo, campo, acción, autor, fecha ni estado
// resultante: todo lo resuelve el backend (y SOLO un Administrador
// PERMANENTE puede anular; un temporal recibe NO_AUTORIZADO).
// NO se elimina nada: el registro original se conserva y el backend crea la
// anulación + recalcula estado_operativo_actual server-side.
// Namespace y guards PROPIOS: jamás se reutilizan los ids ni los flags del
// modal Registrar revisión (mnt-modal-revision-control-*, mntRevisionControl*).
// El historial de CAMBIO DE PILAS sigue SOLO read-only (sin botón de
// anulación en esta fase) y el flujo de TV NO se toca: la RPC actual no
// soporta TV.
// Todo texto de BD mostrado en el HTML pasa por mntEsc; los errores se
// muestran con textContent (nunca stack traces, SQL ni HTML de error).

const MNT_MODAL_ANULAR_REVISION_CONTROL_ID = 'mnt-modal-anular-revision-control-overlay';

// true mientras la RPC de anulación está en vuelo. Guard EXCLUSIVO de
// anulación (nunca se reutiliza mntRevisionControlGuardando). Ciclo:
//   false → true : en mntEnviarAnulacionRevisionControl, justo antes de
//                  llamar a HistorialService.anularHistorial.
//   true  → false: SOLO cuando la RPC terminó — error ⇒
//                  mntRestaurarSubmitAnulacionRevisionControl(); éxito ⇒
//                  liberación explícita en el finally del refresco.
// Cerrar/ocultar la modal (Escape, X, Cancelar, clic fuera o cierre del
// subapartado) NO lo libera, y abrirModalAnulacionRevisionControl lo respeta
// (return): así no se puede iniciar una segunda anulación en vuelo.
let mntAnulacionRevisionControlGuardando = false;

// BLOQUEO DE REINTENTO tras anulación CONFIRMADA con refresco fallido.
// Guarda el historialId cuya anulación YA quedó registrada en
// mantencion_historial_anulaciones pero cuyo refresco de la vista falló.
// Se identifica por historialId (UNIQUE(historial_id) en backend + locks +
// REGISTRO_YA_ANULADO hacen imposible una segunda anulación real).
// Mientras esté activa:
//   - mntEnviarAnulacionRevisionControl hace return SIN ejecutar ninguna RPC;
//   - la modal de ESE registro se renderiza con el aviso informativo y el
//     botón deshabilitado en "Revisión anulada".
// Se limpia SOLO cuando Pilas/Controles se vuelve a leer de Supabase
// (cargarPanelSubapartado), es decir cuando el usuario sigue el aviso
// "Cierra y vuelve a abrir Pilas y Controles". NO se limpia al cerrar la
// modal ni si una lectura posterior falla.
let mntAnulacionRevisionControlPendienteRefresco = null;

// Texto ÚNICO del aviso "anulación confirmada + refresco fallido".
// NUNCA se muestra en el contenedor de error de RPC ni se resuelve con
// MNT_MENSAJES_ERROR_ANULACION_CONTROL: esos mensajes son EXCLUSIVOS del
// fallo de la RPC y aquí la anulación SÍ quedó registrada.
const MNT_AVISO_REFRESCO_ANULACION_CONTROL = 'La revisión quedó anulada correctamente, pero no fue posible actualizar la vista. No vuelvas a intentar anularla. Cierra y vuelve a abrir Pilas y Controles.';

// Mensajes amigables por código de error real (backend + validaciones locales).
// NUNCA se muestra el detalle técnico (SQL, UUID, stack) al usuario.
const MNT_MENSAJES_ERROR_ANULACION_CONTROL = {
  MOTIVO_REQUERIDO: 'Debes indicar el motivo de la anulación.',
  SESION_INVALIDA: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
  NO_AUTORIZADO: 'Solo un administrador permanente puede anular esta revisión.',
  REGISTRO_YA_ANULADO: 'Esta revisión ya fue anulada.',
  CAMPO_NO_PERMITIDO: 'Esta revisión no admite anulación.',
  CONFIG_INCOMPLETA: 'La configuración necesaria para anular esta revisión no está disponible.',
  ENTIDAD_NO_ENCONTRADA: 'La revisión o el control asociado ya no está disponible.',
  TIPO_NO_IMPLEMENTADO: 'Este tipo de registro aún no admite anulación.',
  VALOR_INVALIDO: 'La anulación solicitada no es válida.',
  VALOR_NO_PERMITIDO: 'La anulación solicitada no está permitida.'
};

// Registro ORIGINAL de cada revisión anulable, poblado por el renderer
// (mntEventoRevisionControlHTML) en el mismo pintado que muestra el botón.
// Permite abrir la modal con el contexto REAL del evento (incluido el
// entidad_id del control) sin serializar BD en atributos HTML y sin
// inferir nada desde el texto de la interfaz.
const mntAnulacionRevisionControlEventos = new Map();

// Crea la modal UNA sola vez. Si ya existe, devuelve la misma (no duplica
// ids ni estructura).
function asegurarModalAnulacionRevisionControl() {
  let overlay = document.getElementById(MNT_MODAL_ANULAR_REVISION_CONTROL_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MNT_MODAL_ANULAR_REVISION_CONTROL_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Anular revisión');
  overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overflow-y-auto';
  overlay.onclick = function (ev) {
    // Solo el clic en el fondo cierra; el clic dentro de la caja no burbujea.
    // UX-02: fondo sin cierre.
  };
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 my-auto text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
      <div id="mnt-modal-anular-revision-control"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// Escape cierra PRIMERO la modal de anulación (fase de captura, por delante
// de mntTeclaEscapeSubapartado). Si la modal NO está visible no intercepta
// (no roba el Escape a otros diálogos). Aunque la RPC esté en vuelo puede
// ocultar la modal, pero NO libera mntAnulacionRevisionControlGuardando ⇒ no
// se puede iniciar otra anulación hasta que esa RPC termine.
function mntTeclaEscapeAnulacionRevisionControl(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

// Contenido de la modal: contexto REAL de la revisión original (fecha, estado
// anterior, estado registrado, autor y observación — todo desde el evento
// leído de BD) + advertencia sobre el recálculo server-side + textarea del
// motivo OBLIGATORIO. NO dice "Eliminar"/"Borra": el registro se conserva.
function mntContenidoModalAnulacionRevisionControlHTML(ev, pendienteRefresco) {
  const registro = ev || {};

  const observacionTexto = (typeof registro.observacion === 'string' && registro.observacion.trim() !== '')
    ? registro.observacion.trim()
    : 'Sin observación registrada';

  const autorTexto = (typeof (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot) === 'string' && (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot).trim() !== '')
    ? (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot).trim()
    : 'Autor no registrado';

  return `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center space-x-2.5 min-w-0">
        <span class="text-2xl shrink-0">⛔</span>
        <div class="min-w-0">
          <h3 class="text-base font-bold text-slate-800 dark:text-white truncate">Anular revisión</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate">Hotel & Centro de Eventos El Almendro</p>
        </div>
      </div>
      <button type="button" onclick="cerrarModalAnulacionRevisionControl()"
        class="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold">&times;</button>
    </div>

    <div class="mt-3 space-y-2.5">
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed">
        Esta acción invalidará esta revisión, pero conservará el registro original para trazabilidad.
      </p>
      <div class="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-[11px] font-bold text-amber-800 dark:text-amber-200 leading-relaxed">
        El estado actual del control se recalculará automáticamente usando la última revisión válida anterior.
        Si no existe otra revisión válida, quedará como Sin revisión registrada.
      </div>

      <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 pt-1">Revisión a anular</p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Fecha de la revisión: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntFechaHoraRevisionTexto(registro.created_at))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Estado anterior: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntEtiquetaEstadoPreviaControl(registro.valor_anterior))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Estado registrado: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntEtiquetaEstadoPreviaControl(registro.valor_nuevo))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Autor original: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(autorTexto)}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Observación original: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(observacionTexto)}</span>
      </p>
    </div>

    <form onsubmit="mntEnviarAnulacionRevisionControl(event)" class="mt-4 space-y-3.5">
      <!-- IDs reales del evento: historialId (clave de la anulación) y
           controlId REAL (ev.entidad_id). NUNCA se infieren de la UI. -->
      <input type="hidden" id="mnt-anular-revision-control-id" value="${mntEsc(registro.id)}">
      <input type="hidden" id="mnt-anular-revision-control-control-id" value="${mntEsc(registro.entidad_id)}">

      <div>
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Motivo de anulación *</label>
        <textarea id="mnt-anular-revision-control-motivo" rows="3"
          placeholder="Indica por qué se anula esta revisión"
          class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"></textarea>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          El motivo es obligatorio y queda registrado en la trazabilidad de la anulación.
        </p>
      </div>

      <!-- Mensaje inline de error. NO se muestra éxito salvo que
           Supabase confirme la operación. -->
      <div id="mnt-anular-revision-control-error"
        class="hidden rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
      </div>

      <!-- Aviso INFORMATIVO: anulación CONFIRMADA + refresco fallido. Caja
           azul, DISTINTA del recuadro rose de error de RPC. Texto fijo de
           MNT_AVISO_REFRESCO_ANULACION_CONTROL; se llena con textContent. -->
      <div id="mnt-anular-revision-control-aviso" class="${pendienteRefresco ? '' : 'hidden'} rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-xs font-bold text-blue-800 dark:text-blue-200 leading-relaxed">${pendienteRefresco ? mntEsc(MNT_AVISO_REFRESCO_ANULACION_CONTROL) : ''}</div>

      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2.5">
        <button type="button" onclick="cerrarModalAnulacionRevisionControl()"
          class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" id="mnt-anular-revision-control-submit" ${pendienteRefresco ? 'disabled' : ''}
          class="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-rose-600">
          <span id="mnt-anular-revision-control-submit-label">${pendienteRefresco ? 'Revisión anulada' : 'Anular revisión'}</span>
        </button>
      </div>
    </form>
  `;
}

// Abre la modal para la revisión indicada. El contexto sale del evento
// ORIGINAL registrado por el renderer (ev.id, ev.entidad_id, valores, autor,
// observación, created_at): nada se infiere del texto de la interfaz.
function abrirModalAnulacionRevisionControl(historialId) {
  // Anti doble RPC: si hay una anulación en vuelo NO se permite iniciar otra.
  // Cerrar la modal (Escape, X, Cancelar, clic fuera o cierre del
  // subapartado) NO libera el guard: solo lo hace la RPC al terminar.
  if (mntAnulacionRevisionControlGuardando) {
    console.warn('mntAnulacionRevisionControlGuardando activo: se omite abrir una nueva anulación de revisión.');
    return;
  }

  const id = typeof historialId === 'string' ? historialId.trim() : '';
  if (!id) return;

  const registro = mntAnulacionRevisionControlEventos.get(id);
  if (!registro || !registro.id) {
    console.warn('Anulación de revisión: evento no disponible en memoria, se omite abrir la modal.');
    return;
  }
  // Sin entidad_id REAL no hay forma legítima de refrescar la ficha tras la
  // escritura: mejor no abrir que arriesgar un refresh incorrecto.
  if (!registro.entidad_id) {
    console.warn('Anulación de revisión: el evento no tiene entidad_id, se omite abrir la modal.');
    return;
  }

  const overlay = asegurarModalAnulacionRevisionControl();
  const cont = document.getElementById('mnt-modal-anular-revision-control');
  if (!overlay || !cont) return;

  // Si la anulación de ESTE registro YA quedó registrada y solo falló el
  // refresco, la modal se abre en estado "ya anulada": aviso visible y botón
  // deshabilitado (sin segundo envío).
  const pendienteRefresco = mntAnulacionRevisionControlPendienteRefresco !== null &&
    mntAnulacionRevisionControlPendienteRefresco === String(registro.id);

  // Contenido nuevo en cada apertura (sin errores ni envíos previos).
  // NO se toca mntAnulacionRevisionControlGuardando: aquí ya es false por la
  // guarda.
  cont.innerHTML = mntContenidoModalAnulacionRevisionControlHTML(registro, pendienteRefresco);
  overlay.classList.remove('hidden');

  // Sin listeners duplicados: se retira antes de volver a agregar.
  document.removeEventListener('keydown', mntTeclaEscapeAnulacionRevisionControl, true);
  document.addEventListener('keydown', mntTeclaEscapeAnulacionRevisionControl, true);

  if (!pendienteRefresco) {
    const textarea = document.getElementById('mnt-anular-revision-control-motivo');
    if (textarea && typeof textarea.focus === 'function') textarea.focus();
  }
}

// Oculta la modal y retira SOLO su listener de Escape. NO libera el guard:
// cerrar/ocultar no significa que la RPC terminó. NO ejecuta ninguna
// escritura. No toca la ficha subyacente ni el estado de selección.
function cerrarModalAnulacionRevisionControl() {
  const overlay = document.getElementById(MNT_MODAL_ANULAR_REVISION_CONTROL_ID);
  if (overlay) overlay.classList.add('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeAnulacionRevisionControl, true);
}

function mntMostrarErrorAnulacionRevisionControl(mensaje) {
  const caja = document.getElementById('mnt-anular-revision-control-error');
  if (!caja) return;
  caja.textContent = mensaje;   // textContent: nunca HTML de error
  caja.classList.remove('hidden');
}

function mntOcultarErrorAnulacionRevisionControl() {
  const caja = document.getElementById('mnt-anular-revision-control-error');
  if (!caja) return;
  caja.textContent = '';
  caja.classList.add('hidden');
}

// Aviso INFORMATIVO de "anulación confirmada + refresco fallido". Caja
// AZUL propia de la modal (no es el recuadro rose de error de RPC) y texto
// fijo: comunica que la anulación SÍ quedó registrada, que falló solo la
// actualización visual y que NO hay que reintentar. textContent: nunca HTML.
function mntMostrarAvisoAnulacionRevisionControl() {
  const caja = document.getElementById('mnt-anular-revision-control-aviso');
  if (!caja) return;
  caja.textContent = MNT_AVISO_REFRESCO_ANULACION_CONTROL;
  caja.classList.remove('hidden');
}

// Estado final del botón tras una anulación CONFIRMADA con refresco
// fallido: queda DESHABILITADO y rotulado "Revisión anulada", de modo que un
// segundo submit sea imposible desde esta modal. El reintento solo vuelve a
// habilitarse en una modal nueva (render normal) cuando Pilas/Controles se
// vuelva a leer de Supabase.
function mntMarcarSubmitAnulacionRevisionControlAnulado() {
  const btn = document.getElementById('mnt-anular-revision-control-submit');
  const etiqueta = document.getElementById('mnt-anular-revision-control-submit-label');
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Revisión anulada';
}

// Ruta de ERROR: la RPC terminó (con fallo), por lo que SÍ se libera el
// guard y se restaura el botón para poder reintentar (o leer el mensaje y
// cerrar). La modal PERMANECE ABIERTA.
function mntRestaurarSubmitAnulacionRevisionControl() {
  mntAnulacionRevisionControlGuardando = false;
  const btn = document.getElementById('mnt-anular-revision-control-submit');
  const etiqueta = document.getElementById('mnt-anular-revision-control-submit-label');
  if (btn) btn.disabled = false;
  if (etiqueta) etiqueta.textContent = 'Anular revisión';
}

// SUBMIT: única escritura de anulación desde la vista, vía
// HistorialService.anularHistorial({ historialId, motivo }). El motivo se
// valida localmente con trim() ANTES de la RPC (vacío ⇒ error local, sin
// llamada). NO se envía entidad, tipo, campo, acción, autor, fecha ni
// estado resultante. El backend es la autoridad final (sesión, habilitación,
// Administrador PERMANENTE, dominio control/estado_operativo/revision y
// doble anulación).
async function mntEnviarAnulacionRevisionControl(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  // Anti doble envío: mientras la RPC está en vuelo se ignora cualquier
  // segundo submit (el botón además queda deshabilitado).
  if (mntAnulacionRevisionControlGuardando) return;

  const cont = document.getElementById('mnt-modal-anular-revision-control');
  if (!cont) return;

  const inputHistorial = document.getElementById('mnt-anular-revision-control-id');
  const historialId = inputHistorial ? String(inputHistorial.value || '') : '';
  if (!historialId) return;

  const inputControl = document.getElementById('mnt-anular-revision-control-control-id');
  const controlId = inputControl ? String(inputControl.value || '') : '';

  // Si la anulación de ESTE registro YA quedó registrada y solo falló el
  // refresco, aquí NO se ejecuta ninguna RPC (segundo envío bloqueado
  // aunque el botón quedara habilitado por algún repaint).
  if (mntAnulacionRevisionControlPendienteRefresco !== null &&
      mntAnulacionRevisionControlPendienteRefresco === historialId) {
    console.warn('Revisión ya anulada con refresco pendiente: se omite un segundo envío.');
    return;
  }

  // --- Motivo (obligatorio; trim ANTES de la RPC) ---
  const textarea = document.getElementById('mnt-anular-revision-control-motivo');
  const motivo = (textarea && typeof textarea.value === 'string')
    ? textarea.value.trim()
    : '';
  if (!motivo) {
    mntMostrarErrorAnulacionRevisionControl(MNT_MENSAJES_ERROR_ANULACION_CONTROL.MOTIVO_REQUERIDO);
    return;
  }

  // --- Bloqueo de doble envío + estado "Anulando..." ---
  const btn = document.getElementById('mnt-anular-revision-control-submit');
  const etiqueta = document.getElementById('mnt-anular-revision-control-submit-label');
  mntAnulacionRevisionControlGuardando = true;
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Anulando...';
  mntOcultarErrorAnulacionRevisionControl();

  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }

    // ÚNICA escritura. Solo historialId + motivo; el backend resuelve todo
    // lo demás (autor, fecha, entidad, campo, acción y recálculo de estado).
    await window.HistorialService.anularHistorial({
      historialId: historialId,
      motivo: motivo
    });
  } catch (err) {
    // Detalle técnico SOLO en consola; en la modal, mensaje amigable.
    // REGISTRO_YA_ANULADO se presenta aquí como fallo informativo (la
    // revisión ya estaba anulada): NO se trata como éxito ni se re-ejecuta
    // ninguna RPC automáticamente.
    console.error('Error anulando la revisión del control:', err);
    const codigo = err && err.codigo;
    const mensaje = MNT_MENSAJES_ERROR_ANULACION_CONTROL[codigo] || 'No fue posible anular la revisión.';
    mntMostrarErrorAnulacionRevisionControl(mensaje);
    mntRestaurarSubmitAnulacionRevisionControl();
    return;
  }

  // ÉXITO DE LA RPC: la anulación YA quedó registrada en
  // mantencion_historial_anulaciones y el backend YA recalculó el estado.
  // Desde este punto NINGÚN fallo posterior puede presentarse como fallo de
  // escritura ni usar MNT_MENSAJES_ERROR_ANULACION_CONTROL.
  // El guard se mantiene en true durante todo el refresco y se libera
  // SIEMPRE en el finally.
  let refrescoOk = false;
  try {
    refrescoOk = (await mntRefrescarFichaControlTrasAnulacion(controlId)) === true;
  } catch (err) {
    // Excepción de render (u otra) posterior a la RPC → "anulación
    // confirmada / refresco fallido", NUNCA fallo de anulación.
    console.error('Error inesperado refrescando la ficha tras la anulación:', err);
    refrescoOk = false;
  } finally {
    mntAnulacionRevisionControlGuardando = false;
  }

  // RUTA B — RPC exitosa + refresco exitoso: repintado desde datos reales
  // (el estado sale de elementos_mantenibles.estado_operativo_actual, NUNCA
  // se calcula en frontend), historiales recargados y cierre de la modal.
  if (refrescoOk) {
    cerrarModalAnulacionRevisionControl();
    return;
  }

  // RUTA C — RPC exitosa + refresco fallido: la modal PERMANECE ABIERTA
  // para que el usuario lea el aviso inequívoco (anulación registrada /
  // falló solo la vista / no reintentar), el botón queda en "Revisión
  // anulada" y cualquier nuevo envío de este registro queda bloqueado.
  mntAnulacionRevisionControlPendienteRefresco = historialId;
  mntMostrarAvisoAnulacionRevisionControl();
  mntMarcarSubmitAnulacionRevisionControlAnulado();
}

// Relectura real tras el éxito + repintado de la ficha del MISMO control.
// Devuelve true SOLO cuando los datos frescos llegaron y (si aplica) la ficha
// se repintó; false cuando el REFRESCO falló (lectura o render). NO decide
// nada sobre la escritura, que ya ocurrió. Si el usuario cambió o cerró la
// ficha durante la RPC, solo se refrescan datos/caché: NO se pinta sobre otra
// ficha, NO se reabre la anterior y NO se toca mantencionPilaSeleccionada
// (eso NO es un fallo). NO calcula el estado resultante en frontend: badge e
// indicador salen del objeto fresco leído desde Supabase.
async function mntRefrescarFichaControlTrasAnulacion(controlId) {
  if (!controlId) return false;

  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está cargado.');
    }
    const pilas = await window.MantencionesService.getPilasControles(true);
    mntPilasBase = Array.isArray(pilas) ? pilas : [];
  } catch (e) {
    // Sin datos frescos NO se repinta nada (no se inventa estado local).
    console.error('Error releyendo controles tras la anulación:', e);
    return false;
  }

  if (mantencionPilaSeleccionada !== controlId) return true;

  const controlActualizado = mntPilasBase.find(p => p && p.id === controlId) || null;
  if (!controlActualizado) return true;

  // Mismo flujo real de render de ficha que usa la revisión: repinta con el
  // objeto REAL recién leído y, dentro del mismo flujo, vuelve a disparar la
  // carga ASÍNCRONA de los dos historiales (HistorialService.anularHistorial
  // ya vació _revisionesCache ⇒ relectura real desde Supabase).
  try {
    abrirFichaPila(controlId);
  } catch (e) {
    console.error('Error repintando la ficha del control tras la anulación:', e);
    return false;
  }

  return true;
}

// ==========================================================
// PILAS Y CONTROLES — FASE C2D-2F1 (REGISTRAR CAMBIO DE PILAS)
// ==========================================================
// Modal PROPIA y reutilizable para registrar UNA nueva OCURRENCIA de
// 'cambio_pilas' (tipo_entidad 'control', accion 'evento') desde la ficha
// de Control. Cada envío crea un NUEVO evento independiente en
// mantencion_historial: NO es estado booleano, NO es revisión, NO hay
// selector de estado, NO hay fecha editable, NO hay cantidad/marca/tipo de
// pila ni periodicidad (esos datos NO existen en la fuente real).
// ÚNICA vía de escritura: window.HistorialService.registrarEvento({ tipoEntidad,
// entidadId, campo, observacion }) → RPC public.mantencion_registrar_evento.
// SIN supabase.rpc() directo, SIN .insert()/.update()/.delete(), SIN
// localStorage ni mocks. El cliente NO envía autor, fecha, accion,
// valor_nuevo ni tablas: autor y created_at se fijan server-side.
// El backend NO modifica estado_operativo_actual: el evento nunca cambia el
// estado del control.
// Namespace y guards PROPIOS: jamás se reutilizan ids ni flags del modal
// Registrar revisión (mnt-modal-revision-control-*, mntRevisionControl*) ni
// del modal Anular revisión (mnt-modal-anular-revision-control-*,
// mntAnulacionRevisionControl*).
// Permiso visual: esAdminOperativoActual() (permanente O temporal vigente),
// igual que el backend con es_administrador_actual(). NO se exige
// Administrador permanente aquí.
// Anulación de eventos: SIN botón aún (C2D-2F2).
// Todo texto de BD mostrado en el HTML pasa por mntEsc; los errores se
// muestran con textContent (nunca stack traces, SQL ni HTML de error).

const MNT_MODAL_CAMBIO_PILAS_CONTROL_ID = 'mnt-modal-cambio-pilas-control-overlay';

// true mientras la RPC de cambio de pilas está en vuelo. Guard EXCLUSIVO
// (nunca se reutiliza mntRevisionControlGuardando ni
// mntAnulacionRevisionControlGuardando). Ciclo:
//   false → true : en mntEnviarCambioPilasControl, justo antes de llamar a
//                  HistorialService.registrarEvento.
//   true  → false: SOLO cuando la RPC terminó — error ⇒
//                  mntRestaurarSubmitCambioPilasControl(); éxito ⇒
//                  liberación explícita en el finally del refresco.
// Cerrar/ocultar la modal (Escape, X, Cancelar, clic fuera o cierre del
// subapartado) NO lo libera, y abrirModalCambioPilasControl lo respeta
// (return): así un doble clic no puede crear DOS eventos reales.
let mntCambioPilasControlGuardando = false;

// BLOQUEO DE REINTENTO tras evento CONFIRMADO con refresco de historial
// fallido. Guarda el controlId cuyo cambio de pilas YA quedó registrado en
// mantencion_historial pero cuyo releer del historial falló.
// Mientras esté activa:
//   - mntEnviarCambioPilasControl hace return SIN ejecutar ninguna RPC;
//   - la modal de ESE control se renderiza con el aviso informativo y el
//     botón deshabilitado en "Cambio registrado".
// Se limpia SOLO tras una lectura EXITOSA del historial de cambio_pilas de
// ese control (mntRefrescarHistorialCambioPilas, opción A; o el loader de
// mntCargarHistorialesControl con status 'fulfilled', opción B). NO se limpia
// al cerrar la modal, con Escape, simplemente al abrir la ficha, ni si una
// lectura posterior falla.
let mntCambioPilasControlPendienteRefresco = null;

// Texto ÚNICO del aviso "evento confirmado + refresco de historial fallido".
// NUNCA se muestra en el contenedor de error de RPC ni se resuelve con
// MNT_MENSAJES_ERROR_CAMBIO_PILAS_CONTROL: esos mensajes son EXCLUSIVOS del
// fallo de la RPC y aquí el cambio de pilas SÍ quedó registrado.
const MNT_AVISO_REFRESCO_CAMBIO_PILAS_CONTROL = 'El cambio de pilas quedó registrado correctamente, pero no fue posible actualizar el historial. No vuelvas a registrarlo. Cierra y vuelve a abrir Pilas y Controles.';

// Mensajes amigables por código de error real del backend.
// NUNCA se muestra el detalle técnico (SQL, UUID, stack) al usuario.
const MNT_MENSAJES_ERROR_CAMBIO_PILAS_CONTROL = {
  SESION_INVALIDA: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
  NO_AUTORIZADO: 'No tienes permisos para registrar este cambio de pilas.',
  CAMPO_NO_PERMITIDO: 'No se puede registrar este evento.',
  CONFIG_INCOMPLETA: 'La configuración del cambio de pilas no está disponible.',
  ENTIDAD_NO_ENCONTRADA: 'Este control ya no está disponible.',
  TIPO_NO_IMPLEMENTADO: 'Este tipo de control aún no admite esta operación.',
  VALOR_INVALIDO: 'No fue posible validar el evento.',
  VALOR_NO_PERMITIDO: 'Este evento no está permitido.'
};

// Crea la modal UNA sola vez. Si ya existe, devuelve la misma (no duplica
// ids ni estructura).
function asegurarModalCambioPilasControl() {
  let overlay = document.getElementById(MNT_MODAL_CAMBIO_PILAS_CONTROL_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MNT_MODAL_CAMBIO_PILAS_CONTROL_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Registrar cambio de pilas');
  overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overflow-y-auto';
  overlay.onclick = function (ev) {
    // Solo el clic en el fondo cierra; el clic dentro de la caja no burbujea.
    // UX-02: fondo sin cierre.
  };
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 my-auto text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
      <div id="mnt-modal-cambio-pilas-control"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// Escape cierra PRIMERO la modal de cambio de pilas (fase de captura, por
// delante de mntTeclaEscapeSubapartado). Si la modal NO está visible no
// intercepta (no roba el Escape a otros diálogos). Aunque la RPC esté en
// vuelo puede ocultar la modal, pero NO libera mntCambioPilasControlGuardando
// ⇒ no se puede iniciar otro registro hasta que esa RPC termine.
function mntTeclaEscapeCambioPilasControl(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

// Contenido de la modal: contexto REAL del control (nombre, tipo CONTROL TV
// / CONTROL DECO, HAB de origen si existe, ubicación si existe) + explicación
// del evento + SOLO un campo de observación opcional. EXPLÍCITAMENTE sin
// selector Operativo/No operativo, sin input de fecha (la fecha real es
// mantencion_historial.created_at, server-side) y sin cantidad/marca/tipo de
// pila ni periodicidad: esos datos NO existen en la fuente.
function mntContenidoModalCambioPilasControlHTML(p, pendienteRefresco) {
  const tipo = mntTipoControlPila(p);
  const ubicaciones = mntUbicacionesPila(p);
  const ubicacionTexto = ubicaciones.canonica !== null ? ubicaciones.canonica : p.ubicacion_original;

  return `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center space-x-2.5 min-w-0">
        <span class="text-2xl shrink-0">🔋</span>
        <div class="min-w-0">
          <h3 class="text-base font-bold text-slate-800 dark:text-white truncate">Registrar cambio de pilas</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate">Hotel & Centro de Eventos El Almendro</p>
        </div>
      </div>
      <button type="button" onclick="cerrarModalCambioPilasControl()"
        class="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold">&times;</button>
    </div>

    <div class="mt-3 space-y-1.5">
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Control: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(p.nombre_original))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Tipo: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(tipo))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        ${mntEsc(mntEtiquetaCodigo(p))}: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(p.codigo))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Ubicación: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(ubicacionTexto))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
        Se registrará un evento con la fecha y el autor actuales.
        Este registro no modifica el estado operativo del control.
      </p>
    </div>

    <form onsubmit="mntEnviarCambioPilasControl(event)" class="mt-4 space-y-3.5">
      <input type="hidden" id="mnt-cambio-pilas-control-id" value="${mntEsc(p.id)}">

      <div>
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Observación (opcional)</label>
        <textarea id="mnt-cambio-pilas-control-observacion" rows="3"
          placeholder="Sin observación registrada si lo dejas vacío"
          class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"></textarea>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          La fecha y el autor del evento se registran automáticamente en el servidor.
        </p>
      </div>

      <!-- Mensaje inline de error. NO se muestra éxito salvo que
           Supabase confirme la operación. -->
      <div id="mnt-cambio-pilas-control-error"
        class="hidden rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
      </div>

      <!-- Aviso INFORMATIVO: evento CONFIRMADO + refresco de historial
           fallido. Caja azul, DISTINTA del recuadro rose de error de RPC.
           Texto fijo de MNT_AVISO_REFRESCO_CAMBIO_PILAS_CONTROL; se llena
           con textContent. -->
      <div id="mnt-cambio-pilas-control-aviso" class="${pendienteRefresco ? '' : 'hidden'} rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-xs font-bold text-blue-800 dark:text-blue-200 leading-relaxed">${pendienteRefresco ? mntEsc(MNT_AVISO_REFRESCO_CAMBIO_PILAS_CONTROL) : ''}</div>

      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2.5">
        <button type="button" onclick="cerrarModalCambioPilasControl()"
          class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" id="mnt-cambio-pilas-control-submit" ${pendienteRefresco ? 'disabled' : ''}
          class="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-lg shadow-amber-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-amber-600">
          <span id="mnt-cambio-pilas-control-submit-label">${pendienteRefresco ? 'Cambio registrado' : 'Registrar cambio'}</span>
        </button>
      </div>
    </form>
  `;
}

// Abre la modal para el control indicado. El contexto sale del objeto REAL
// de mntPilasBase (leído desde Supabase), nunca de texto de la interfaz.
function abrirModalCambioPilasControl(controlId) {
  // Anti doble RPC: si hay un registro en vuelo NO se permite iniciar otro.
  // Cerrar la modal (Escape, X, Cancelar, clic fuera o cierre del
  // subapartado) NO libera el guard: solo lo hace la RPC al terminar.
  if (mntCambioPilasControlGuardando) {
    console.warn('mntCambioPilasControlGuardando activo: se omite abrir una nueva registro de cambio de pilas.');
    return;
  }

  const id = typeof controlId === 'string' ? controlId.trim() : '';
  if (!id) return;

  const pila = mntPilasBase.find(p => p && p.id === id) || null;
  if (!pila || !pila.id) return;

  // Permiso UX (mismo criterio que el botón de la ficha): sin permiso
  // operativo no se abre la modal. La autoridad real sigue en la RPC.
  if (typeof window.esAdminOperativoActual !== 'function' ||
      window.esAdminOperativoActual() !== true) {
    console.warn('Sin permiso operativo: se omite abrir el modal de cambio de pilas.');
    return;
  }

  const overlay = asegurarModalCambioPilasControl();
  const cont = document.getElementById('mnt-modal-cambio-pilas-control');
  if (!overlay || !cont) return;

  // Si el cambio de pilas de ESTE control YA quedó registrado y solo falló
  // el refresco del historial, la modal se abre en estado "ya registrado":
  // aviso informativo visible y botón deshabilitado (sin segundo envío).
  const pendienteRefresco = mntCambioPilasControlPendienteRefresco !== null &&
    mntCambioPilasControlPendienteRefresco === pila.id;

  // Contenido nuevo en cada apertura (sin errores ni envíos previos).
  // NO se toca mntCambioPilasControlGuardando: aquí ya es false por la guarda.
  cont.innerHTML = mntContenidoModalCambioPilasControlHTML(pila, pendienteRefresco);
  overlay.classList.remove('hidden');

  // Sin listeners duplicados: se retira antes de volver a agregar.
  document.removeEventListener('keydown', mntTeclaEscapeCambioPilasControl, true);
  document.addEventListener('keydown', mntTeclaEscapeCambioPilasControl, true);

  if (!pendienteRefresco) {
    const textarea = document.getElementById('mnt-cambio-pilas-control-observacion');
    if (textarea && typeof textarea.focus === 'function') textarea.focus();
  }
}

// Oculta la modal y retira SOLO su listener de Escape. NO libera el guard:
// cerrar/ocultar no significa que la RPC terminó. NO ejecuta ninguna
// escritura. No toca la ficha subyacente ni el estado de selección.
function cerrarModalCambioPilasControl() {
  const overlay = document.getElementById(MNT_MODAL_CAMBIO_PILAS_CONTROL_ID);
  if (overlay) overlay.classList.add('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeCambioPilasControl, true);
}

function mntMostrarErrorCambioPilasControl(mensaje) {
  const caja = document.getElementById('mnt-cambio-pilas-control-error');
  if (!caja) return;
  caja.textContent = mensaje;   // textContent: nunca HTML de error
  caja.classList.remove('hidden');
}

function mntOcultarErrorCambioPilasControl() {
  const caja = document.getElementById('mnt-cambio-pilas-control-error');
  if (!caja) return;
  caja.textContent = '';
  caja.classList.add('hidden');
}

// Aviso INFORMATIVO de "evento confirmado + refresco de historial fallido".
// Caja AZUL propia de la modal (no es el recuadro rose de error de RPC) y
// texto fijo: comunica que el cambio de pilas SÍ quedó registrado, que falló
// solo la actualización visual y que NO hay que volver a registrarlo.
// textContent: nunca HTML.
function mntMostrarAvisoCambioPilasControl() {
  const caja = document.getElementById('mnt-cambio-pilas-control-aviso');
  if (!caja) return;
  caja.textContent = MNT_AVISO_REFRESCO_CAMBIO_PILAS_CONTROL;
  caja.classList.remove('hidden');
}

// Estado final del botón tras un evento CONFIRMADO con refresco de historial
// fallido: queda DESHABILITADO y rotulado "Cambio registrado", de modo que un
// segundo submit sea imposible desde esta modal. El reintento solo vuelve a
// habilitarse en una modal nueva (render normal) cuando el historial de
// cambio_pilas de ese control se vuelva a leer con éxito.
function mntMarcarSubmitCambioPilasControlRegistrado() {
  const btn = document.getElementById('mnt-cambio-pilas-control-submit');
  const etiqueta = document.getElementById('mnt-cambio-pilas-control-submit-label');
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Cambio registrado';
}

// Ruta de ERROR: la RPC terminó (con fallo), por lo que SÍ se libera el
// guard y se restaura el botón para poder reintentar. La modal PERMANECE
// ABIERTA. En esta ruta NO se confirmó ninguna escritura.
function mntRestaurarSubmitCambioPilasControl() {
  mntCambioPilasControlGuardando = false;
  const btn = document.getElementById('mnt-cambio-pilas-control-submit');
  const etiqueta = document.getElementById('mnt-cambio-pilas-control-submit-label');
  if (btn) btn.disabled = false;
  if (etiqueta) etiqueta.textContent = 'Registrar cambio';
}

// SUBMIT: única escritura de cambio de pilas desde la vista, vía
// HistorialService.registrarEvento con tipoEntidad 'control' y campo
// 'cambio_pilas'. Observación: texto con trim() o null si queda vacío (sin
// límite de longitud inventado). NO se envía autor, fecha, accion,
// valor_nuevo, usuario ni tabla: todo lo fija el backend server-side.
async function mntEnviarCambioPilasControl(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  // Anti doble envío: mientras la RPC está en vuelo se ignora cualquier
  // segundo submit (el botón además queda deshabilitado). Protege contra un
  // doble clic que crearía DOS eventos reales.
  if (mntCambioPilasControlGuardando) return;

  const cont = document.getElementById('mnt-modal-cambio-pilas-control');
  if (!cont) return;

  const inputControl = document.getElementById('mnt-cambio-pilas-control-id');
  const controlId = inputControl ? String(inputControl.value || '') : '';
  if (!controlId) return;

  // Si el cambio de pilas de ESTE control YA quedó registrado y solo falló
  // el refresco del historial, aquí NO se ejecuta ninguna RPC (segundo
  // envío bloqueado aunque el botón quedara habilitado por algún repaint).
  if (mntCambioPilasControlPendienteRefresco !== null &&
      mntCambioPilasControlPendienteRefresco === controlId) {
    console.warn('Cambio de pilas ya registrado con refresco pendiente: se omite un segundo envío.');
    return;
  }

  // --- Observación opcional (texto con trim o null; nunca inventada) ---
  const textarea = document.getElementById('mnt-cambio-pilas-control-observacion');
  const observacion = (textarea && typeof textarea.value === 'string' && textarea.value.trim() !== '')
    ? textarea.value.trim()
    : null;

  // --- Bloqueo de doble envío + estado "Registrando..." ---
  const btn = document.getElementById('mnt-cambio-pilas-control-submit');
  const etiqueta = document.getElementById('mnt-cambio-pilas-control-submit-label');
  mntCambioPilasControlGuardando = true;
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Registrando...';
  mntOcultarErrorCambioPilasControl();

  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }

    // ÚNICA escritura. Solo tipoEntidad, entidadId, campo y observación.
    await window.HistorialService.registrarEvento({
      tipoEntidad: 'control',
      entidadId: controlId,
      campo: 'cambio_pilas',
      observacion: observacion
    });
  } catch (err) {
    // Detalle técnico SOLO en consola; en la modal, mensaje amigable.
    console.error('Error registrando el cambio de pilas del control:', err);
    const codigo = err && err.codigo;
    const mensaje = MNT_MENSAJES_ERROR_CAMBIO_PILAS_CONTROL[codigo] || 'No fue posible registrar el cambio de pilas.';
    mntMostrarErrorCambioPilasControl(mensaje);
    mntRestaurarSubmitCambioPilasControl();
    return;
  }

  // ÉXITO DE LA RPC: el cambio de pilas YA quedó registrado en
  // mantencion_historial (append-only, autor y fecha server-side; sin cambios
  // en estado_operativo_actual). Desde este punto NINGÚN fallo posterior
  // puede presentarse como "No fue posible registrar el cambio de pilas"
  // ni usar MNT_MENSAJES_ERROR_CAMBIO_PILAS_CONTROL.
  // El guard se mantiene en true durante todo el refresco y se libera
  // SIEMPRE en el finally.
  let refrescoOk = false;
  try {
    refrescoOk = (await mntRefrescarHistorialCambioPilas(controlId)) === true;
  } catch (err) {
    // Excepción de render (u otra) posterior a la RPC → "evento confirmado
    // / refresco fallido", NUNCA fallo de escritura.
    console.error('Error inesperado refrescando el historial de cambio de pilas:', err);
    refrescoOk = false;
  } finally {
    mntCambioPilasControlGuardando = false;
  }

  // RUTA B — RPC exitosa + refresco exitoso: solo se repintó el bloque
  // HISTORIAL DE CAMBIOS DE PILAS (datos frescos de Supabase, orden
  // created_at DESC) y se cierra la modal. El bloque de revisiones de
  // estado NO se toca y el estado operativo NO se recalcula en frontend.
  if (refrescoOk) {
    cerrarModalCambioPilasControl();
    return;
  }

  // RUTA C — RPC exitosa + refresco fallido: la modal PERMANECE ABIERTA
  // para que el usuario lea el aviso inequívoco (cambio registrado / falló
  // solo el historial / no volver a registrarlo), el botón queda en "Cambio
  // registrado" y cualquier nuevo envío de este control queda bloqueado.
  mntCambioPilasControlPendienteRefresco = controlId;
  mntMostrarAvisoCambioPilasControl();
  mntMarcarSubmitCambioPilasControlRegistrado();
}

// Relectura ESPECÍFICA del historial de cambio_pilas tras el éxito (opción A
// de limpieza del bloqueo pendiente). NO llama getPilasControles(true):
// cambio_pilas no modifica elementos_mantenibles, así que no hace falta
// releer la colección operacional. Devuelve true SOLO cuando la lectura
// terminó bien (y, si la ficha sigue en ESTE control y su contenedor existe,
// se repintó únicamente el bloque de historial de pilas). Si el usuario
// cambió o cerró la ficha durante la RPC, NO se reabre, NO se pinta sobre
// otro control y NO se toca mantencionPilaSeleccionada (eso NO es un fallo).
async function mntRefrescarHistorialCambioPilas(controlId) {
  if (!controlId) return false;

  let eventos = null;
  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }
    // force=true: obliga a releer Supabase (la service invalidó su caché de
    // este campo en registrarEvento; force garantiza el estado fresco).
    eventos = await window.HistorialService.getRevisiones('control', controlId, 'cambio_pilas', true);
  } catch (e) {
    // Lectura fallida ⇒ refresco fallido (la escritura YA ocurrió; aquí NO
    // se decide nada sobre ella). El bloqueo pendiente NO se limpia.
    console.error('Error releyendo el historial de cambios de pilas tras el registro:', e);
    return false;
  }

  // LECTURA EXITOSA ⇒ se levanta el bloqueo pendiente de ESTE control
  // (opción A: confirmación específica y sencilla). Vale también si la ficha
  // ya no está abierta: el historial fresco quedó cacheado en la service.
  if (mntCambioPilasControlPendienteRefresco !== null &&
      mntCambioPilasControlPendienteRefresco === controlId) {
    mntCambioPilasControlPendienteRefresco = null;
  }

  // Ficha cambiada/cerrada durante la RPC: solo datos frescos, sin repintado.
  if (mantencionPilaSeleccionada !== controlId) return true;

  const cont = document.getElementById('mnt-historial-pilas-control');
  if (!cont) return true;   // la ficha ya no muestra ese bloque: nada que pintar

  // Repintado ÚNICO del bloque de cambios de pilas, con la MISMA estructura
  // de mntCargarHistorialesControl (más reciente primero, mntEsc, renderer
  // mntEventoCambioPilasHTML con soporte de ANULADO ya existente).
  if (!Array.isArray(eventos) || eventos.length === 0) {
    cont.innerHTML = `
      <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
        Sin cambios de pilas registrados.
      </p>
    `;
  } else {
    cont.innerHTML = `
      <p class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
        ${eventos.length} cambio(s) de pilas registrado(s) · más reciente primero
      </p>
      <div class="mt-3">${mntHistorialPaginadoHTML(eventos.length, 'Cambios de pilas', `<ul class="space-y-3">
        ${mntOrdenarHistorialReciente(eventos).map(mntEventoCambioPilasHTML).join('')}
      </ul>`)}</div>
    `;
  }

  return true;
}

// ==========================================================
// PILAS Y CONTROLES — FASE C2D-2F2 (ANULAR REGISTRO DE CAMBIO DE PILAS)
// ==========================================================
// Modal PROPIA y reutilizable para anular UN EVENTO de 'cambio_pilas'
// (tipo_entidad 'control', campo 'cambio_pilas', accion 'evento') desde el
// historial de cambios de pilas de la ficha de Control.
// La anulación NO elimina nada: el evento original (fecha, autor y
// observación originales) se conserva para trazabilidad y se agrega el
// estado ANULADO con motivo, quién anuló y fecha de anulación.
// ÚNICA vía de escritura: window.HistorialService.anularHistorial({ historialId,
// motivo }) → RPC public.mantencion_anular_historial. SIN supabase.rpc()
// directo, SIN .insert()/.update()/.delete(), SIN localStorage ni mocks.
// El cliente envía EXCLUSIVAMENTE historialId y motivo (controlId NO es
// parámetro de la RPC: se usa SOLO para el refresh visual de la ficha).
// SEMÁNTICA DIFERENTE de "Anular revisión": el backend NO recalcula
// estado_operativo_actual ni modifica elementos_mantenibles al anular un
// evento, por lo que este flujo NUNCA llama getPilasControles(true), NO
// recalcula estado en frontend y NO toca el bloque "Estado actual del
// control".
// Exige Administrador PERMANENTE (backend: es_administrador_permanente_actual);
// un administrador temporal recibe NO_AUTORIZADO.
// Namespace, guard y pending flag PROPIOS: jamás se comparten con
// mnt-modal-anular-revision-control-* / mntAnulacionRevisionControl*, ni con
// mnt-modal-cambio-pilas-control-* / mntCambioPilasControl* (F1), ni con el
// modal de Registrar revisión.
// Todo texto de BD mostrado en el HTML pasa por mntEsc; los errores se
// muestran con textContent (nunca stack traces, SQL, UUID ni HTML de error).

const MNT_MODAL_ANULAR_CAMBIO_PILAS_CONTROL_ID = 'mnt-modal-anular-cambio-pilas-control-overlay';

// true mientras la RPC de anulación está en vuelo. Guard EXCLUSIVO de esta
// anulación (nunca se reutilizan mntCambioPilasControlGuardando,
// mntAnulacionRevisionControlGuardando ni mntRevisionControlGuardando).
// Ciclo:
//   false → true : en mntEnviarAnularCambioPilasControl, justo antes de
//                  llamar a HistorialService.anularHistorial.
//   true  → false: SOLO cuando la RPC terminó — error ⇒
//                  mntRestaurarSubmitAnularCambioPilasControl(); éxito ⇒
//                  liberación explícita en el finally del refresco.
// Cerrar/ocultar la modal (Escape, X, Cancelar, clic fuera o cierre del
// subapartado) NO lo libera, y abrirModalAnularCambioPilasControl lo respeta
// (return): así no se puede iniciar una segunda anulación en vuelo.
let mntAnulacionCambioPilasControlGuardando = false;

// BLOQUEO DE REINTENTO tras anulación CONFIRMADA con refresco de historial
// fallido. Guarda el historialId cuya anulación YA quedó registrada en
// mantencion_historial_anulaciones pero cuyo releer del historial falló.
// Se identifica por historialId (UNIQUE(historial_id) en backend + locks +
// REGISTRO_YA_ANULADO hacen imposible una segunda anulación real).
// Mientras esté activa:
//   - mntEnviarAnularCambioPilasControl hace return SIN ejecutar ninguna RPC;
//   - la modal de ESE registro se renderiza con el aviso informativo y el
//     botón deshabilitado en "Registro anulado".
// Se limpia SOLO tras una lectura EXITOSA de ese historial vía
// getRevisiones('control', controlId, 'cambio_pilas', true) (opción A en
// mntRefrescarHistorialAnulacionCambioPilas, opción B en el loader
// mntCargarHistorialesControl con status 'fulfilled'). NO se limpia al
// cerrar la modal, con Escape, al abrir la modal/ficha, ni si una lectura
// posterior falla.
let mntAnulacionCambioPilasControlPendienteRefresco = null;

// Texto ÚNICO del aviso "anulación confirmada + refresco de historial
// fallido". NUNCA se muestra en el contenedor de error de RPC ni se resuelve
// con MNT_MENSAJES_ERROR_ANULAR_CAMBIO_PILAS: esos mensajes son EXCLUSIVOS
// del fallo de la RPC y aquí la anulación SÍ quedó registrada.
const MNT_AVISO_REFRESCO_ANULAR_CAMBIO_PILAS = 'El registro quedó anulado correctamente, pero no fue posible actualizar el historial. No vuelvas a intentar anularlo. Cierra y vuelve a abrir Pilas y Controles.';

// Mensajes amigables por código de error real (backend + validaciones
// locales). NUNCA se muestra el detalle técnico (SQL, UUID, stack) al
// usuario.
const MNT_MENSAJES_ERROR_ANULAR_CAMBIO_PILAS = {
  MOTIVO_REQUERIDO: 'Debes indicar el motivo de la anulación.',
  SESION_INVALIDA: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
  NO_AUTORIZADO: 'Solo un administrador permanente puede anular este registro.',
  REGISTRO_YA_ANULADO: 'Este registro ya fue anulado.',
  CAMPO_NO_PERMITIDO: 'Este registro no admite anulación.',
  CONFIG_INCOMPLETA: 'La configuración necesaria para anular este registro no está disponible.',
  ENTIDAD_NO_ENCONTRADA: 'El registro o el control asociado ya no está disponible.',
  TIPO_NO_IMPLEMENTADO: 'Este tipo de registro aún no admite anulación.',
  VALOR_INVALIDO: 'La anulación solicitada no es válida.',
  VALOR_NO_PERMITIDO: 'La anulación solicitada no está permitida.'
};

// Registro ORIGINAL de cada evento de cambio de pilas anulable, poblado por
// el renderer (mntEventoCambioPilasHTML) en el mismo pintado que muestra el
// botón. Permite abrir la modal con historialId (ev.id), controlId
// (ev.entidad_id) y el contexto REAL del evento, sin serializar BD en
// atributos HTML y sin inferir nada desde el texto de la interfaz.
const mntAnulacionCambioPilasControlEventos = new Map();

// Crea la modal UNA sola vez. Si ya existe, devuelve la misma (no duplica
// ids ni estructura).
function asegurarModalAnularCambioPilasControl() {
  let overlay = document.getElementById(MNT_MODAL_ANULAR_CAMBIO_PILAS_CONTROL_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MNT_MODAL_ANULAR_CAMBIO_PILAS_CONTROL_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Anular registro de cambio de pilas');
  overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overflow-y-auto';
  overlay.onclick = function (ev) {
    // Solo el clic en el fondo cierra; el clic dentro de la caja no burbujea.
    // UX-02: fondo sin cierre.
  };
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 my-auto text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
      <div id="mnt-modal-anular-cambio-pilas-control"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// Escape cierra PRIMERO la modal de anulación de cambio de pilas (fase de
// captura, por delante de mntTeclaEscapeSubapartado). Si la modal NO está
// visible no intercepta (no roba el Escape a otros diálogos). Aunque la RPC
// esté en vuelo puede ocultar la modal, pero NO libera
// mntAnulacionCambioPilasControlGuardando ⇒ no se puede iniciar otra
// anulación hasta que esa RPC termine.
function mntTeclaEscapeAnularCambioPilasControl(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

// Contenido de la modal: contexto REAL del evento original (fecha, autor y
// observación originales; Control/Tipo/Ubicación SOLO si el control se
// encuentra en mntPilasBase) + texto de trazabilidad + advertencia de que
// esta anulación NO modifica el estado operativo + textarea del motivo
// OBLIGATORIO. SIN advertencia de recálculo de estado (la anulación de un
// EVENTO no recalcula nada). NO muestra valor_nuevo = 'cambio_pilas'
// (detalle técnico del backend).
function mntContenidoModalAnularCambioPilasControlHTML(registro, pila, pendienteRefresco) {
  const ev = registro || {};

  const observacionTexto = (typeof ev.observacion === 'string' && ev.observacion.trim() !== '')
    ? ev.observacion.trim()
    : 'Sin observación registrada';

  const autorTexto = (typeof (window.UsuariosService?.nombreParaMostrar?.(ev,'autor_nombre_snapshot') ?? ev.autor_nombre_snapshot) === 'string' && (window.UsuariosService?.nombreParaMostrar?.(ev,'autor_nombre_snapshot') ?? ev.autor_nombre_snapshot).trim() !== '')
    ? (window.UsuariosService?.nombreParaMostrar?.(ev,'autor_nombre_snapshot') ?? ev.autor_nombre_snapshot).trim()
    : 'Autor no registrado';

  // Contexto del control SOLO si está disponible de forma segura en los
  // datos reales ya leídos; nunca se inventa ni se infiere de la UI.
  let bloqueControl = '';
  if (pila && pila.id) {
    const tipo = mntTipoControlPila(pila);
    const ubicaciones = mntUbicacionesPila(pila);
    const ubicacionTexto = ubicaciones.canonica !== null ? ubicaciones.canonica : pila.ubicacion_original;
    bloqueControl = `
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Control: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(pila.nombre_original))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Tipo: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(tipo))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Ubicación: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(ubicacionTexto))}</span>
      </p>
    `;
  }

  return `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center space-x-2.5 min-w-0">
        <span class="text-2xl shrink-0">⛔</span>
        <div class="min-w-0">
          <h3 class="text-base font-bold text-slate-800 dark:text-white truncate">Anular registro de cambio de pilas</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate">Hotel & Centro de Eventos El Almendro</p>
        </div>
      </div>
      <button type="button" onclick="cerrarModalAnularCambioPilasControl()"
        class="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold">&times;</button>
    </div>

    <div class="mt-3 space-y-2">
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed">
        Esta acción invalidará este registro de cambio de pilas, pero conservará el evento original para trazabilidad.
      </p>
      <div class="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-[11px] font-bold text-blue-800 dark:text-blue-200 leading-relaxed">
        Esta anulación no modifica el estado operativo del control.
      </div>

      <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 pt-1">Registro original</p>
      ${bloqueControl}
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Fecha del cambio: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntFechaHoraRevisionTexto(ev.created_at))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Autor original: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(autorTexto)}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Observación original: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(observacionTexto)}</span>
      </p>
    </div>

    <form onsubmit="mntEnviarAnularCambioPilasControl(event)" class="mt-4 space-y-3.5">
      <!-- IDs reales del evento: historialId (clave de la anulación y del
           pending flag) y controlId REAL (ev.entidad_id, SOLO para el
           refresh visual; NO se envía a la RPC). NUNCA se infieren de la
           UI. -->
      <input type="hidden" id="mnt-anular-cambio-pilas-control-id" value="${mntEsc(ev.id)}">
      <input type="hidden" id="mnt-anular-cambio-pilas-control-control-id" value="${mntEsc(ev.entidad_id)}">

      <div>
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Motivo de anulación *</label>
        <textarea id="mnt-anular-cambio-pilas-control-motivo" rows="3"
          placeholder="Indica por qué se anula este registro"
          class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"></textarea>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          El motivo es obligatorio y queda registrado en la trazabilidad de la anulación.
        </p>
      </div>

      <!-- Mensaje inline de error. NO se muestra éxito salvo que
           Supabase confirme la operación. -->
      <div id="mnt-anular-cambio-pilas-control-error"
        class="hidden rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
      </div>

      <!-- Aviso INFORMATIVO: anulación CONFIRMADA + refresco de historial
           fallido. Caja azul, DISTINTA del recuadro rose de error de RPC.
           Texto fijo de MNT_AVISO_REFRESCO_ANULAR_CAMBIO_PILAS; se llena
           con textContent. -->
      <div id="mnt-anular-cambio-pilas-control-aviso" class="${pendienteRefresco ? '' : 'hidden'} rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-xs font-bold text-blue-800 dark:text-blue-200 leading-relaxed">${pendienteRefresco ? mntEsc(MNT_AVISO_REFRESCO_ANULAR_CAMBIO_PILAS) : ''}</div>

      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2.5">
        <button type="button" onclick="cerrarModalAnularCambioPilasControl()"
          class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" id="mnt-anular-cambio-pilas-control-submit" ${pendienteRefresco ? 'disabled' : ''}
          class="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-rose-600">
          <span id="mnt-anular-cambio-pilas-control-submit-label">${pendienteRefresco ? 'Registro anulado' : 'Anular registro'}</span>
        </button>
      </div>
    </form>
  `;
}

// Abre la modal para el registro indicado. El contexto sale del evento
// ORIGINAL registrado por el renderer (ev.id, ev.entidad_id, created_at,
// autor, observación): nada se infiere del texto de la interfaz.
function abrirModalAnularCambioPilasControl(historialId) {
  // Anti doble RPC: si hay una anulación en vuelo NO se permite iniciar otra.
  // Cerrar la modal (Escape, X, Cancelar, clic fuera o cierre del
  // subapartado) NO libera el guard: solo lo hace la RPC al terminar.
  if (mntAnulacionCambioPilasControlGuardando) {
    console.warn('mntAnulacionCambioPilasControlGuardando activo: se omite abrir una nueva anulación de cambio de pilas.');
    return;
  }

  const id = typeof historialId === 'string' ? historialId.trim() : '';
  if (!id) return;

  const registro = mntAnulacionCambioPilasControlEventos.get(id);
  if (!registro || !registro.id) {
    console.warn('Anulación de cambio de pilas: evento no disponible en memoria, se omite abrir la modal.');
    return;
  }
  // Sin entidad_id REAL no hay forma legítima de refrescar el historial
  // tras la escritura: mejor no abrir que arriesgar un refresh incorrecto.
  if (!registro.entidad_id) {
    console.warn('Anulación de cambio de pilas: el evento no tiene entidad_id, se omite abrir la modal.');
    return;
  }

  const overlay = asegurarModalAnularCambioPilasControl();
  const cont = document.getElementById('mnt-modal-anular-cambio-pilas-control');
  if (!overlay || !cont) return;

  // Contexto del control SOLO desde datos reales ya leídos (puede no estar
  // si la ficha ya no muestra ese control); la modal funciona igual sin él.
  const pila = mntPilasBase.find(p => p && p.id === registro.entidad_id) || null;

  // Si la anulación de ESTE registro YA quedó registrada y solo falló el
  // refresco del historial, la modal se abre en estado "ya anulado": aviso
  // visible y botón deshabilitado (sin segundo envío).
  const pendienteRefresco = mntAnulacionCambioPilasControlPendienteRefresco !== null &&
    mntAnulacionCambioPilasControlPendienteRefresco === String(registro.id);

  // Contenido nuevo en cada apertura (sin errores ni envíos previos).
  // NO se toca mntAnulacionCambioPilasControlGuardando: aquí ya es false
  // por la guarda.
  cont.innerHTML = mntContenidoModalAnularCambioPilasControlHTML(registro, pila, pendienteRefresco);
  overlay.classList.remove('hidden');

  // Sin listeners duplicados: se retira antes de volver a agregar.
  document.removeEventListener('keydown', mntTeclaEscapeAnularCambioPilasControl, true);
  document.addEventListener('keydown', mntTeclaEscapeAnularCambioPilasControl, true);

  if (!pendienteRefresco) {
    const textarea = document.getElementById('mnt-anular-cambio-pilas-control-motivo');
    if (textarea && typeof textarea.focus === 'function') textarea.focus();
  }
}

// Oculta la modal y retira SOLO su listener de Escape. NO libera el guard:
// cerrar/ocultar no significa que la RPC terminó. NO ejecuta ninguna
// escritura. No toca la ficha subyacente ni el estado de selección.
function cerrarModalAnularCambioPilasControl() {
  const overlay = document.getElementById(MNT_MODAL_ANULAR_CAMBIO_PILAS_CONTROL_ID);
  if (overlay) overlay.classList.add('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeAnularCambioPilasControl, true);
}

function mntMostrarErrorAnularCambioPilasControl(mensaje) {
  const caja = document.getElementById('mnt-anular-cambio-pilas-control-error');
  if (!caja) return;
  caja.textContent = mensaje;   // textContent: nunca HTML de error
  caja.classList.remove('hidden');
}

function mntOcultarErrorAnularCambioPilasControl() {
  const caja = document.getElementById('mnt-anular-cambio-pilas-control-error');
  if (!caja) return;
  caja.textContent = '';
  caja.classList.add('hidden');
}

// Aviso INFORMATIVO de "anulación confirmada + refresco de historial
// fallido". Caja AZUL propia de la modal (no es el recuadro rose de error de
// RPC) y texto fijo: comunica que la anulación SÍ quedó registrada, que
// falló solo la actualización visual y que NO hay que reintentar.
// textContent: nunca HTML.
function mntMostrarAvisoAnularCambioPilasControl() {
  const caja = document.getElementById('mnt-anular-cambio-pilas-control-aviso');
  if (!caja) return;
  caja.textContent = MNT_AVISO_REFRESCO_ANULAR_CAMBIO_PILAS;
  caja.classList.remove('hidden');
}

// Estado final del botón tras una anulación CONFIRMADA con refresco de
// historial fallido: queda DESHABILITADO y rotulado "Registro anulado", de
// modo que un segundo submit sea imposible desde esta modal. El reintento
// solo vuelve a habilitarse en una modal nueva (render normal) cuando el
// historial de cambio_pilas de ese control se vuelva a leer con éxito.
function mntMarcarSubmitAnularCambioPilasControlAnulado() {
  const btn = document.getElementById('mnt-anular-cambio-pilas-control-submit');
  const etiqueta = document.getElementById('mnt-anular-cambio-pilas-control-submit-label');
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Registro anulado';
}

// Ruta de ERROR: la RPC terminó (con fallo), por lo que SÍ se libera el
// guard y se restaura el botón para poder reintentar (o leer el mensaje y
// cerrar). La modal PERMANECE ABIERTA. En esta ruta NO se confirmó ninguna
// escritura.
function mntRestaurarSubmitAnularCambioPilasControl() {
  mntAnulacionCambioPilasControlGuardando = false;
  const btn = document.getElementById('mnt-anular-cambio-pilas-control-submit');
  const etiqueta = document.getElementById('mnt-anular-cambio-pilas-control-submit-label');
  if (btn) btn.disabled = false;
  if (etiqueta) etiqueta.textContent = 'Anular registro';
}

// SUBMIT: única escritura de anulación de cambio de pilas desde la vista,
// vía HistorialService.anularHistorial({ historialId, motivo }). El motivo se
// valida localmente con trim() ANTES de la RPC (vacío ⇒ error local, sin
// llamada). NO se envía controlId, entidad, tipo, campo, acción, autor,
// fecha ni estado: todo lo resuelve el backend (sesión, habilitación,
// Administrador PERMANENTE, dominio y doble anulación).
async function mntEnviarAnularCambioPilasControl(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  // Anti doble envío: mientras la RPC está en vuelo se ignora cualquier
  // segundo submit (el botón además queda deshabilitado).
  if (mntAnulacionCambioPilasControlGuardando) return;

  const cont = document.getElementById('mnt-modal-anular-cambio-pilas-control');
  if (!cont) return;

  const inputHistorial = document.getElementById('mnt-anular-cambio-pilas-control-id');
  const historialId = inputHistorial ? String(inputHistorial.value || '') : '';
  if (!historialId) return;

  const inputControl = document.getElementById('mnt-anular-cambio-pilas-control-control-id');
  const controlId = inputControl ? String(inputControl.value || '') : '';

  // Si la anulación de ESTE registro YA quedó registrada y solo falló el
  // refresco del historial, aquí NO se ejecuta ninguna RPC (segundo envío
  // bloqueado aunque el botón quedara habilitado por algún repaint).
  if (mntAnulacionCambioPilasControlPendienteRefresco !== null &&
      mntAnulacionCambioPilasControlPendienteRefresco === historialId) {
    console.warn('Registro de cambio de pilas ya anulado con refresco pendiente: se omite un segundo envío.');
    return;
  }

  // --- Motivo (obligatorio; trim ANTES de la RPC) ---
  const textarea = document.getElementById('mnt-anular-cambio-pilas-control-motivo');
  const motivo = (textarea && typeof textarea.value === 'string')
    ? textarea.value.trim()
    : '';
  if (!motivo) {
    mntMostrarErrorAnularCambioPilasControl(MNT_MENSAJES_ERROR_ANULAR_CAMBIO_PILAS.MOTIVO_REQUERIDO);
    return;
  }

  // --- Bloqueo de doble envío + estado "Anulando..." ---
  const btn = document.getElementById('mnt-anular-cambio-pilas-control-submit');
  const etiqueta = document.getElementById('mnt-anular-cambio-pilas-control-submit-label');
  mntAnulacionCambioPilasControlGuardando = true;
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Anulando...';
  mntOcultarErrorAnularCambioPilasControl();

  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }

    // ÚNICA escritura. Solo historialId + motivo; controlId NO viaja a la
    // RPC (se usa más abajo, únicamente, para el refresh visual).
    await window.HistorialService.anularHistorial({
      historialId: historialId,
      motivo: motivo
    });
  } catch (err) {
    // Detalle técnico SOLO en consola; en la modal, mensaje amigable.
    // REGISTRO_YA_ANULADO se presenta aquí como fallo informativo (el
    // registro ya estaba anulado): NO se trata como éxito ni se re-ejecuta
    // ninguna RPC automáticamente.
    console.error('Error anulando el registro de cambio de pilas:', err);
    const codigo = err && err.codigo;
    const mensaje = MNT_MENSAJES_ERROR_ANULAR_CAMBIO_PILAS[codigo] || 'No fue posible anular el registro.';
    mntMostrarErrorAnularCambioPilasControl(mensaje);
    mntRestaurarSubmitAnularCambioPilasControl();
    return;
  }

  // ÉXITO DE LA RPC: la anulación YA quedó registrada en
  // mantencion_historial_anulaciones. El backend NO recalcula
  // estado_operativo_actual (un evento no modifica estado operacional).
  // Desde este punto NINGÚN fallo posterior puede presentarse como
  // "No fue posible anular el registro" ni usar
  // MNT_MENSAJES_ERROR_ANULAR_CAMBIO_PILAS.
  // El guard se mantiene en true durante todo el refresco y se libera
  // SIEMPRE en el finally.
  let refrescoOk = false;
  try {
    refrescoOk = (await mntRefrescarHistorialAnulacionCambioPilas(controlId, historialId)) === true;
  } catch (err) {
    // Excepción de render (u otra) posterior a la RPC → "anulación
    // confirmada / refresco fallido", NUNCA fallo de anulación.
    console.error('Error inesperado refrescando el historial tras la anulación del cambio de pilas:', err);
    refrescoOk = false;
  } finally {
    mntAnulacionCambioPilasControlGuardando = false;
  }

  // RUTA B — RPC exitosa + refresco exitoso: solo se repintó el bloque
  // HISTORIAL DE CAMBIOS DE PILAS con el evento original visible, chip
  // ANULADO, motivo, quién anuló y fecha de anulación (y sin botón). Se
  // cierra la modal. El estado operativo NO se tocó ni se recalculó.
  if (refrescoOk) {
    cerrarModalAnularCambioPilasControl();
    return;
  }

  // RUTA C — RPC exitosa + refresco fallido: la modal PERMANECE ABIERTA
  // para que el usuario lea el aviso inequívoco (registro anulado / falló
  // solo el historial / no reintentar), el botón queda en "Registro
  // anulado" y cualquier nuevo envío de este registro queda bloqueado.
  mntAnulacionCambioPilasControlPendienteRefresco = historialId;
  mntMostrarAvisoAnularCambioPilasControl();
  mntMarcarSubmitAnularCambioPilasControlAnulado();
}

// Relectura ESPECÍFICA del historial de cambio_pilas tras el éxito +
// repintado ÚNICO del bloque #mnt-historial-pilas-control.
// NO llama getPilasControles(true): anular un evento NO modifica
// elementos_mantenibles ni estado_operativo_actual, así que no hace falta
// releer la colección operacional ni el bloque "Estado actual del control".
// Reutiliza mntRefrescarHistorialCambioPilas (lectura force=true + repintado
// del historial de pilas) y SOLO añade la limpieza del bloqueo pendiente
// PROPIO cuando esa lectura terminó correctamente (opción A).
// Devuelve true cuando la lectura terminó bien (aunque la ficha ya no
// muestre ese control: eso NO es un fallo); false cuando la LECTURA falló,
// en cuyo caso el bloqueo pendiente NO se limpia.
async function mntRefrescarHistorialAnulacionCambioPilas(controlId, historialId) {
  const lecturaOk = (await mntRefrescarHistorialCambioPilas(controlId)) === true;

  if (lecturaOk &&
      mntAnulacionCambioPilasControlPendienteRefresco !== null &&
      mntAnulacionCambioPilasControlPendienteRefresco === historialId) {
    mntAnulacionCambioPilasControlPendienteRefresco = null;
  }

  return lecturaOk;
}

// ==========================================================
// TV HABITACIONES — FASE 2.5
// ==========================================================
// Vista propia del subapartado 'tv'. La preview genérica de Fase 1 ya NO
// aparece para este subapartado.
//
// Fuente: TV-Habitaciones.xlsx (Hoja1) → televisores_habitaciones
// (getTelevisores(), 28 filas ordenadas por fila_origen).
//
// Convenciones de datos:
// - Relación TV → elemento SOLO por FK real
//   (tv.elemento_id === elementos_mantenibles.id). Nunca por nombre,
//   habitación, ubicación ni similitud textual. El nombre del título de la
//   tarjeta/ficha viene del elemento relacionado; NO se concatena
//   "TV Habitación " + ubicación.
// - El elemento relacionado se resuelve contra mntTelevisoresElementos
//   (copia de getElementos() en el cargador), SIN depender de mntElementosBase
//   y SIN consultas por ficha (sin N+1).
// - Sin embeds hacia elementos_mantenibles en el servicio: la tabla tiene
//   TRES FK hacia esa tabla y se evitan relaciones PostgREST ambiguas.
// - Especificaciones: el valor ORIGINAL siempre se muestra; el normalizado
//   solo si existe. NUNCA se infiere "40 pulgadas" desde "40?" ni se
//   convierte una marca con opción "otro" en SAMSUNG: si
//   marca_normalizada / tamano_pulgadas son NULL → "Sin dato registrado".
// - Semántica de controles SIN mezclar:
//   control_tv_original = ¿es ORIGINAL? → "Sí, es original" / "No es
//   original". NUNCA "Funciona".
//   control_deco_funciona = ¿FUNCIONA? → "Funciona" / "No funciona".
//   NULL → "Sin dato registrado"; nunca NULL → false.
// - Elementos de control relacionados: SOLO cuando existan las FK
//   (control_tv_elemento_id / control_deco_elemento_id). Los TV sin esas FK
//   (Salón 2º piso / Salón 3º piso) muestran sus propios datos pero NO
//   muestran el bloque de controles relacionados; no se inventa relación.
// - observaciones: texto GENERADO durante la migración (verificado: son las
//   notas de marca/tamaño con opción "otro"). NO son comentarios del cliente.
//   Se muestra EXCLUSIVAMENTE en la ficha como "Nota de migración"; nunca en
//   tarjetas; nunca se etiqueta "Observaciones".
// - Sin bloque de historial: el archivo es inventario/estado técnico, no
//   historial de mantenciones (mantenciones de TV = 0). No se inventa
//   "Sin mantenimiento" / "Pendiente" / "Nunca mantenido".
// - Orden: fila_origen ASC (definido en getTelevisores), respetando el Excel.
// - Sin N+1 y sin consultas por ficha: ambos conjuntos llegan por Promise.all
//   en el cargador (todos con caché) y la ficha se resuelve desde
//   mntTelevisoresBase.
// - Solo lectura: sin inputs, sin switches, sin INSERT/UPDATE/DELETE.
// - No se muestran UUID (id, elemento_id, control_*_elemento_id,
//   importacion_id).

// Copias en cliente de las colecciones ya cacheadas (sin N+1).
// mntTelevisoresElementos viene de getElementos() para resolver el elemento
// TV (tv.elemento_id) y los elementos de control (control_*_elemento_id)
// SIN depender de mntElementosBase: el subapartado funciona aunque
// "Elementos e Historial" no se haya abierto.
let mntTelevisoresBase = [];
let mntTelevisoresElementos = [];

// Valor conceptual del <select> de marca para los TV sin marca_normalizada
// (los ambiguos con opción "otro"). Es un identificador de filtro, NO un
// valor de dato; nunca se reemplaza la marca original por él.
const MNT_TV_MARCA_SIN_NORMALIZAR = '__sin_marca_normalizada__';

// Elemento físico TV relacionado (FK real tv.elemento_id → elemento.id).
// Sin relación → null (no se infiere nada por texto).
function mntTvElemento(tv) {
  if (!tv || tv.elemento_id === null || tv.elemento_id === undefined || tv.elemento_id === '') return null;
  const lista = Array.isArray(mntTelevisoresElementos) ? mntTelevisoresElementos : [];
  return lista.find(x => x && x.id === tv.elemento_id) || null;
}

const MNT_GESTION_TV = {
  ALTA: 'Nuevo televisor', EDICION: 'Editar televisor',
  TRASLADO: 'Trasladar televisor', REEMPLAZO: 'Registrar reemplazo'
};
const MNT_ERRORES_GESTION_TV = {
  TV_GESTION_NO_AUTORIZADA: 'Tu permiso administrativo no está vigente.',
  TV_FICHA_DESACTUALIZADA: 'La ficha cambió. Cierra el formulario y vuelve a abrir el listado antes de editar.',
  TV_PREDECESOR_YA_RETIRADO: 'El televisor anterior ya fue retirado.',
  TV_RETIRADO: 'El televisor está retirado.',
  TV_CONTROL_YA_ASOCIADO: 'El control ya está asociado a otro televisor instalado.',
  TV_CONTROL_TV_UBICACION_INCOMPATIBLE: 'El control TV pertenece a otra ubicación.',
  TV_CONTROL_DECO_UBICACION_INCOMPATIBLE: 'El control Deco pertenece a otra ubicación.',
  TV_CONTROL_TV_INVALIDO: 'El control TV seleccionado no es válido.',
  TV_CONTROL_DECO_INVALIDO: 'El control Deco seleccionado no es válido.',
  TV_UBICACIONES_INCONSISTENTES: 'La ubicación del equipo y la de su ficha vinculada no coinciden.',
  TV_UBICACION_PREDECESOR_CAMBIO: 'La ubicación del equipo anterior cambió.',
  TV_UBICACION_NO_EXISTE: 'La ubicación seleccionada ya no está disponible.',
  TV_MODELO_REQUERIDO: 'Informa el modelo del televisor.',
  TV_FECHA_EFECTIVA_INVALIDA: 'La fecha de retiro debe ser válida y no futura.',
  TV_DATOS_INVALIDOS: 'Revisa la marca, el modelo y las pulgadas.',
  TV_SIN_CAMBIOS: 'No hay cambios para guardar.',
  TV_OPERACION_ID_REUTILIZADO: 'El identificador pertenece a otra solicitud. Solicita revisión antes de volver a enviar.'
};

function mntGestionTVBoton(accion, texto = MNT_GESTION_TV[accion]) {
  return `<button type="button" class="${accion === 'ALTA' ? 'alm-btn-primary mnt-tv-alta' : 'alm-btn-secondary'} px-3 py-2"
    onclick="mntAbrirGestionTV('${accion}')">${mntEsc(texto)}</button>`;
}

function mntGestionTVParametros(accion, tv, campos, operacionId) {
  const marca = campos.get('marca')?.trim() || null;
  const modelo = campos.get('modelo')?.trim() || null;
  const pulgadas = campos.has('pulgadas') ? Number(campos.get('pulgadas')) : null;
  const traslado = accion === 'TRASLADO';
  if (accion === 'ALTA' || accion === 'REEMPLAZO' || accion === 'CONTROLES') {
    const respuesta = nombre => {
      const valor = campos.get(nombre);
      if (valor !== 'true' && valor !== 'false') throw new Error('TV_DATOS_INVALIDOS');
      return valor === 'true';
    };
    const controles = {
      p_control_tv_original: respuesta('tv_original'),
      p_control_deco_funciona: respuesta('deco_funciona')
    };
    if (accion === 'CONTROLES') return {
      rpc: 'tv_habitaciones_guardar_controles_v1',
      parametros: {
        p_operacion_id: operacionId, p_televisor_id: tv.id,
        p_esperado_tv: tv.control_tv_original_declarado ?? null,
        p_esperado_deco: tv.control_deco_funciona_declarado ?? null,
        ...controles
      }
    };
    const reemplazo = accion === 'REEMPLAZO';
    return {
      rpc: 'tv_habitaciones_crear_o_reemplazar_v2',
      parametros: {
        p_operacion_id: operacionId, p_ubicacion_id: reemplazo ? tv.ubicacion_id : campos.get('ubicacion'),
        p_marca: marca, p_modelo: modelo, p_pulgadas: pulgadas, ...controles,
        p_predecesor_id: reemplazo ? tv.id : null,
        p_retiro_efectivo: reemplazo ? campos.get('fecha') : null,
        p_motivo: reemplazo ? campos.get('motivo')?.trim() || null : null
      }
    };
  }
  if (accion !== 'EDICION' && !traslado) throw new Error('TV_OPERACION_INVALIDA');
  return {
    rpc: 'tv_habitaciones_editar_o_trasladar_v2',
    parametros: {
      p_operacion_id: operacionId, p_televisor_id: tv.id, p_accion: accion,
      p_esperado: traslado ? { ubicacion_id: tv.ubicacion_id } : {
        marca: tv.marca_normalizada, modelo: tv.modelo, pulgadas: tv.tamano_pulgadas == null ? null : Number(tv.tamano_pulgadas)
      },
      p_marca: marca, p_modelo: modelo, p_pulgadas: pulgadas,
      p_ubicacion_id: traslado ? campos.get('ubicacion') : null
    }
  };
}

function mntTVControlBooleano(nombre, pregunta, valor = null, mostrarSinDato = false) {
  return `<fieldset class="mnt-tv-respuestas space-y-2">
    <legend class="text-sm font-bold">${mntEsc(pregunta)}</legend>
    ${mostrarSinDato && valor == null ? '<span class="mnt-tv-sin-dato alm-muted text-sm">Sin dato</span>' : ''}
    <div class="flex flex-wrap gap-3">
      ${[[true, 'Sí'], [false, 'No']].map(([opcion, texto]) => `
        <label class="mnt-tv-respuesta inline-flex items-center gap-2">
          <input type="radio" name="${mntEsc(nombre)}" value="${opcion}" required ${valor === opcion ? 'checked' : ''}>
          ${texto}
        </label>`).join('')}
    </div>
  </fieldset>`;
}

let mntControlesTVEnCurso = false;

async function mntAbrirGestionTV(accion) {
  if (mntControlesTVEnCurso || !window.esAdminOperativoActual?.() || !Object.hasOwn(MNT_GESTION_TV, accion) ||
      mantencionSubapartado !== 'tv' || document.getElementById('mnt-gestion-tv')) return;
  const panel = document.getElementById('mnt-modal-subapartado-body');
  const tv = mntTelevisoresBase.find(t => t.id === mantencionTelevisorSeleccionado);
  const actor = state.currentUser?.id;
  if (!panel || !actor) return;

  const clave = 'hotel.tv.gestion.pendiente.' + actor;
  const dialogo = document.createElement('dialog');
  dialogo.id = 'mnt-gestion-tv';
  dialogo.className = 'alm-ui alm-panel rounded-2xl p-5';
  dialogo.setAttribute('aria-labelledby', 'mnt-gestion-tv-titulo');
  dialogo.style.cssText = 'width:min(92vw,36rem);max-height:85vh;margin:auto';
  dialogo.innerHTML = `
    <form class="space-y-4">
      <h2 id="mnt-gestion-tv-titulo" class="alm-title"></h2>
      <p data-estado role="status"></p>
      <fieldset class="space-y-3"></fieldset>
      <div class="flex flex-wrap gap-2">
        <button type="button" data-cerrar class="alm-btn-secondary px-4 py-2">Cancelar</button>
        <button type="submit" class="alm-btn-primary px-4 py-2" disabled>Guardar</button>
      </div>
    </form>`;
  document.body.append(dialogo);
  dialogo.addEventListener('cancel', e => e.preventDefault());
  dialogo.addEventListener('close', () => dialogo.remove(), { once: true });
  const form = dialogo.querySelector('form');
  const campos = form.querySelector('fieldset');
  const titulo = form.querySelector('h2');
  const mensaje = form.querySelector('[data-estado]');
  const guardar = form.querySelector('[type="submit"]');
  const cerrar = form.querySelector('[data-cerrar]');
  cerrar.onclick = () => dialogo.close();
  dialogo.showModal();

  const vigente = () => dialogo.open && dialogo.isConnected && panel.isConnected &&
    mantencionSubapartado === 'tv' && state.currentUser?.id === actor && window.esAdminOperativoActual?.();
  const clase = 'mnt-gestion-tv-campo w-full px-3 py-2';
  const opcion = (id, nombre) => `<option value="${mntEsc(id)}">${mntEsc(nombre)}</option>`;
  let pendiente;
  try {
    pendiente = JSON.parse(sessionStorage.getItem(clave));
    if (pendiente && !pendiente.parametros?.p_operacion_id) throw new Error('Referencia incompleta');
  } catch {
    titulo.textContent = 'Gestión de televisores';
    mensaje.textContent = 'No se pudo leer la operación pendiente. No se enviará ninguna solicitud.';
    return;
  }
  if (!pendiente && accion !== 'ALTA' && (!tv || tv.retirado_en)) {
    dialogo.close();
    return;
  }
  if (!pendiente && accion === 'REEMPLAZO' && !tv.ubicacion_id) {
    titulo.textContent = MNT_GESTION_TV[accion];
    mensaje.textContent = 'El equipo anterior no tiene una ubicación vinculada.';
    return;
  }

  function mostrarPendiente() {
    titulo.textContent = 'Verificar operación de TV';
    mensaje.textContent = 'El resultado está pendiente de confirmación. Puedes reenviar la misma solicitud. Referencia: ' +
      pendiente.parametros.p_operacion_id;
    campos.hidden = true;
    guardar.textContent = 'Reenviar la misma solicitud';
    guardar.disabled = false;
    cerrar.textContent = 'Cerrar';
  }

  let ubicaciones = [];
  let ubicacionesVerificadas = true;
  async function cargarUbicacionesDisponibles(excluir = []) {
    const servicio = window.MantencionesService;
    const [catalogo, ocupadas] = await Promise.all([
      servicio.getUbicacionesTV(), servicio.getUbicacionesOcupadasTV()
    ]);
    return catalogo.filter(u => !ocupadas.has(u.id) && !excluir.includes(u.id));
  }

  async function prepararFormulario(disponibles) {
    campos.hidden = false;
    titulo.textContent = MNT_GESTION_TV[accion];
    const traslado = accion === 'TRASLADO';
    const reemplazo = accion === 'REEMPLAZO';
    const edicion = accion === 'EDICION';
    const solicitaControles = accion === 'ALTA' || reemplazo;
    if (accion === 'ALTA' || traslado) {
      mensaje.textContent = 'Cargando ubicaciones…';
      try {
        ubicaciones = disponibles ?? (accion === 'ALTA'
          ? await cargarUbicacionesDisponibles()
          : await window.MantencionesService.getUbicacionesTV());
      } catch {
        if (vigente()) mensaje.textContent = 'No se pudieron cargar las ubicaciones. Cierra y vuelve a abrir el formulario.';
        return;
      }
      if (!vigente()) return;
      if ((accion === 'ALTA' || disponibles) && ubicaciones.length === 0) {
        mensaje.textContent = 'No hay ubicaciones disponibles para instalar un televisor nuevo.';
        return;
      }
    }
    const ubicacionActual = mntNombreUbicacion(mntTvElemento(tv) || {}) || tv?.ubicacion_original;
    const selectorUbicacion = accion === 'ALTA' || traslado
      ? `<label class="block">Ubicación ${traslado ? 'de destino' : ''}<select name="ubicacion" required class="${clase}">
        ${opcion('', 'Selecciona una ubicación')}${ubicaciones.filter(u => !traslado || u.id !== tv.ubicacion_id)
          .map(u => opcion(u.id, u.nombre)).join('')}</select></label>` : '';
    const fechaMaxima = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', dateStyle: 'short' }).format(new Date());
    campos.innerHTML = `
      ${traslado || reemplazo ? `<p>Ubicación actual: ${mntEsc(mntSinDato(ubicacionActual))}</p>` : ''}
      ${selectorUbicacion}
      ${traslado ? '<p>Se moverá el mismo televisor, conservando su identificación e historial. Los controles asociados no cambian automáticamente de ubicación.</p>' : `
        ${reemplazo ? '<h3 class="border-t border-slate-200 dark:border-slate-700 pt-3 text-sm font-bold">Nuevo televisor</h3>' : ''}
        <label class="block">Marca<input name="marca" required maxlength="100" class="${clase}"
          value="${mntEsc(edicion ? tv.marca_normalizada ?? tv.marca_original ?? '' : '')}"></label>
        <label class="block">Pulgadas<input name="pulgadas" type="number" required min="0.01" max="9999.99"
          step="0.01" class="${clase}" value="${mntEsc(edicion ? tv.tamano_pulgadas ?? '' : '')}"></label>
        <label class="block">Modelo (opcional)<input name="modelo" maxlength="120"
          class="${clase}" value="${mntEsc(edicion ? tv.modelo ?? '' : '')}"></label>`}
      ${solicitaControles ? `
        <h3 class="border-t border-slate-200 dark:border-slate-700 pt-3 text-sm font-bold">Controles del nuevo televisor</h3>
        ${mntTVControlBooleano('tv_original', '¿El televisor tiene su Control TV original?')}
        ${mntTVControlBooleano('deco_funciona', '¿Funciona el Control Deco?')}` : ''}
      ${reemplazo ? `
        <h3 class="border-t border-slate-200 dark:border-slate-700 pt-3 text-sm font-bold">Información del retiro</h3>
        <label class="block">Fecha efectiva de retiro<input name="fecha" type="date" required max="${fechaMaxima}" class="${clase}"></label>
        <label class="block">Motivo del reemplazo (opcional)<textarea name="motivo" maxlength="1000" class="${clase}"></textarea></label>
        <h3 class="text-sm font-bold">Confirmación</h3>
        <label class="block"><input type="checkbox" required> Confirmo que el equipo anterior quedará retirado, conservará su historial y el sucesor tendrá una identidad independiente.</label>` : ''}`;

    mensaje.textContent = '';
    guardar.textContent = reemplazo ? 'Confirmar reemplazo' : traslado ? 'Confirmar traslado' : 'Guardar';
    guardar.disabled = false;
  }

  if (pendiente) mostrarPendiente();
  else await prepararFormulario();

  let enviando = false;
  let confirmada = false;
  form.onsubmit = async e => {
    e.preventDefault();
    if (!vigente() || enviando || confirmada || guardar.disabled) return;
    const reenviando = Boolean(pendiente);
    const valores = new FormData(form);
    if (!reenviando && !form.reportValidity()) return;
    enviando = true;
    campos.disabled = cerrar.disabled = guardar.disabled = true;
    mensaje.textContent = 'Verificando y enviando…';
    try {
      if (!(await revalidarPrivilegioParaEscritura()) || !vigente()) {
        mensaje.textContent = 'No se pudo verificar tu permiso administrativo.';
        return;
      }
      if (!reenviando && accion === 'ALTA') {
        const ubicacionId = valores.get('ubicacion');
        if (!ubicaciones.some(u => u.id === ubicacionId)) {
          mensaje.textContent = 'Selecciona una ubicación disponible.';
          return;
        }
        let ocupadas;
        try {
          ocupadas = await window.MantencionesService.getUbicacionesOcupadasTV();
        } catch {
          mensaje.textContent = 'No se pudo verificar la disponibilidad. Vuelve a intentarlo.';
          return;
        }
        if (!vigente()) return;
        if (ocupadas.has(ubicacionId)) {
          ubicaciones = ubicaciones.filter(u => !ocupadas.has(u.id));
          form.elements.ubicacion.innerHTML = opcion('', 'Selecciona una ubicación') +
            ubicaciones.map(u => opcion(u.id, u.nombre)).join('');
          mensaje.textContent = ubicaciones.length
            ? 'Esa ubicación ya tiene un televisor instalado. Selecciona otra.'
            : 'No hay ubicaciones disponibles para instalar un televisor nuevo.';
          return;
        }
      }
      const solicitud = pendiente || mntGestionTVParametros(accion, tv, valores, crypto.randomUUID());
      try {
        sessionStorage.setItem(clave, JSON.stringify(solicitud));
      } catch {
        mensaje.textContent = 'No se pudo conservar la referencia. No se envió la solicitud.';
        return;
      }
      pendiente = solicitud;
      let resultado;
      try {
        resultado = await window.MantencionesService.gestionarTelevisor(solicitud.rpc, solicitud.parametros);
      } catch (error) {
        const accionSolicitud = solicitud.parametros.p_accion;
        const alta = ['tv_habitaciones_crear_o_reemplazar_v1', 'tv_habitaciones_crear_o_reemplazar_v2'].includes(solicitud.rpc)
          && solicitud.parametros.p_predecesor_id == null;
        const traslado = ['tv_habitaciones_editar_o_trasladar_v1', 'tv_habitaciones_editar_o_trasladar_v2'].includes(solicitud.rpc)
          && accionSolicitud === 'TRASLADO';
        const conflictoUbicacion = error?.code === '23505' && (
          /Key \(ubicacion_id\)=/i.test(error.details ?? '') ||
          /unique constraint "(?:tv_habitaciones|televisores_habitaciones)[^"]*ubicacion[^"]*"/i.test(error.message ?? '')
        );
        if ((alta || traslado) && conflictoUbicacion) {
          sessionStorage.removeItem(clave);
          pendiente = null;
          ubicacionesVerificadas = false;
          const aviso = 'Esta ubicación ya tiene un televisor instalado. Actualiza el listado y selecciona otra ubicación';
          mensaje.textContent = aviso;
          try {
            ubicaciones = await cargarUbicacionesDisponibles([
              solicitud.parametros.p_ubicacion_id, ...(traslado ? [tv?.ubicacion_id] : [])
            ]);
            if (!vigente()) return;
            if (traslado && (!tv || tv.id !== solicitud.parametros.p_televisor_id || tv.retirado_en)) {
              mensaje.textContent = aviso + '. Vuelve a abrir la ficha del equipo que quieres trasladar.';
              return;
            }
            accion = alta ? 'ALTA' : 'TRASLADO';
            const selector = form.elements.ubicacion;
            if (selector) {
              campos.hidden = false;
              selector.innerHTML = opcion('', 'Selecciona una ubicación') +
                ubicaciones.map(u => opcion(u.id, u.nombre)).join('');
              guardar.textContent = alta ? 'Guardar' : 'Confirmar traslado';
            } else {
              await prepararFormulario(ubicaciones);
            }
            ubicacionesVerificadas = ubicaciones.length > 0;
            mensaje.textContent = aviso + (ubicacionesVerificadas ? '' : '. No quedan ubicaciones disponibles.');
          } catch {
            mensaje.textContent = aviso + '. No se pudieron cargar las opciones. Cierra y vuelve a abrir el formulario.';
          }
          return;
        }
        const texto = MNT_ERRORES_GESTION_TV[error?.message];
        if (!reenviando && texto && error.message !== 'TV_OPERACION_ID_REUTILIZADO') {
          sessionStorage.removeItem(clave);
          pendiente = null;
          if (error.message === 'TV_FICHA_DESACTUALIZADA') {
            window.MantencionesService.invalidarCacheTelevisores();
          }
          mensaje.textContent = texto;
        } else {
          mostrarPendiente();
          if (texto) mensaje.textContent += ' ' + texto;
        }
        return;
      }
      confirmada = true;
      sessionStorage.removeItem(clave);
      pendiente = null;
      mensaje.textContent = 'Operación confirmada. Actualizando catálogo…';
      try {
        const datos = await MNT_CARGADORES_SUBAPARTADO.tv();
        if (!vigente()) return;
        mantencionTelevisorSeleccionado = resultado.sucesor_id || resultado.televisor_id;
        panel.innerHTML = mntPanelTelevisoresHTML(MNT_SUBAPARTADOS.find(s => s.id === 'tv'), datos.televisores, datos.elementos);
        const actual = datos.televisores.find(t => t.id === mantencionTelevisorSeleccionado);
        if (actual) mntCargarHistorialEstadoTV(actual);
        dialogo.close();
      } catch {
        mensaje.textContent = 'Operación confirmada. Cierra y vuelve a abrir TV Habitaciones para actualizar el catálogo.';
      }
    } catch {
      mensaje.textContent = 'No se pudo completar la comprobación. Vuelve a abrir la gestión para revisar si hay una operación pendiente.';
    } finally {
      enviando = false;
      campos.disabled = cerrar.disabled = false;
      guardar.disabled = confirmada || !ubicacionesVerificadas || (!pendiente && accion === 'ALTA' && ubicaciones.length === 0);
    }
  };
}

const MNT_ERRORES_ELIMINACION_TV = {
  TV_HISTORIAL_EXISTENTE: 'Este televisor tiene historial y debe conservarse.',
  TV_CADENA_REEMPLAZO: 'Este televisor forma parte de un reemplazo y debe conservarse.',
  TV_DEPENDENCIAS_EXISTENTES: 'Otros registros dependen de este equipo. No se puede eliminar.',
  TV_ELIMINACION_NO_AUTORIZADA: 'Solo un Administrador permanente habilitado puede eliminar televisores.',
  TV_ORIGEN_NO_ELEGIBLE: 'Solo se pueden eliminar televisores registrados desde la aplicación.',
  TV_RETIRADO: 'Este televisor está retirado y debe conservarse.',
  TELEVISOR_NO_ENCONTRADO: 'El televisor ya no está disponible. Vuelve a abrir el catálogo para actualizarlo.'
};

function mntLeerEliminacionTV(clave) {
  const pendiente = JSON.parse(sessionStorage.getItem(clave));
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (pendiente !== null && (!uuid.test(pendiente.p_operacion_id) || !uuid.test(pendiente.p_televisor_id))) {
    throw new Error('Referencia de eliminación inválida');
  }
  return pendiente;
}

function mntPuedeEliminarTV(tv) {
  return tv?.origen_registro === 'OPERATIVO' && window.esAdminPermanenteActual?.() === true;
}

function mntAbrirEliminarTV(recuperar = false) {
  const actor = state.currentUser?.id;
  const panel = document.getElementById('mnt-modal-subapartado-body');
  const seleccion = mantencionTelevisorSeleccionado;
  const tv = mntTelevisoresBase.find(t => t.id === seleccion);
  if (!actor || !panel || mantencionSubapartado !== 'tv' ||
      window.esAdminPermanenteActual?.() !== true ||
      (!recuperar && !mntPuedeEliminarTV(tv)) ||
      document.getElementById('mnt-gestion-tv') || mntControlesTVEnCurso) return;

  const clave = 'hotel.tv.eliminacion.pendiente.' + actor;
  const dialogo = document.createElement('dialog');
  dialogo.id = 'mnt-gestion-tv';
  dialogo.className = 'alm-ui alm-panel rounded-2xl p-5';
  dialogo.style.cssText = 'width:min(92vw,36rem);max-height:85vh;margin:auto';
  dialogo.setAttribute('aria-labelledby', 'mnt-gestion-tv-titulo');
  dialogo.innerHTML = `<form class="space-y-4">
    <h2 id="mnt-gestion-tv-titulo" class="alm-title">¿Eliminar este televisor?</h2>
    <p data-equipo></p>
    <p>La eliminación es definitiva. El sistema conserva el registro de auditoría.</p>
    <p data-estado role="status" aria-live="polite"></p>
    <div class="flex flex-wrap gap-2">
      <button type="button" data-cerrar class="alm-btn-secondary px-4 py-2" autofocus>Cancelar</button>
      <button type="submit" class="alm-btn-danger px-4 py-2" disabled>Eliminar televisor</button>
    </div>
  </form>`;
  const form = dialogo.querySelector('form');
  const mensaje = form.querySelector('[data-estado]');
  const equipo = form.querySelector('[data-equipo]');
  const cerrar = form.querySelector('[data-cerrar]');
  const confirmar = form.querySelector('[type="submit"]');
  cerrar.onclick = () => dialogo.close();
  dialogo.addEventListener('cancel', e => e.preventDefault());
  dialogo.addEventListener('close', () => dialogo.remove(), { once: true });
  document.body.append(dialogo);
  dialogo.showModal();

  let pendiente;
  try {
    pendiente = mntLeerEliminacionTV(clave);
  } catch {
    mensaje.textContent = 'No se pudo leer la referencia local. No se enviará una eliminación.';
    return;
  }
  if ((recuperar && !pendiente) || (!recuperar && pendiente && pendiente.p_televisor_id !== seleccion)) {
    mensaje.textContent = 'Revisa la eliminación pendiente desde el listado de TV Habitaciones.';
    return;
  }
  const objetivo = pendiente?.p_televisor_id || seleccion;
  const equipoObjetivo = mntTelevisoresBase.find(t => t.id === objetivo);
  if (equipoObjetivo) {
    const marca = mntSinDato(equipoObjetivo.marca_normalizada ?? equipoObjetivo.marca_original);
    const ubicacion = mntSinDato(mntNombreUbicacion(mntTvElemento(equipoObjetivo)) || equipoObjetivo.ubicacion_original);
    const modelo = equipoObjetivo.modelo;
    equipo.textContent = [
      'Marca: ' + marca, ...(modelo ? ['Modelo: ' + modelo] : []), 'Ubicación: ' + ubicacion
    ].join(' · ');
  } else {
    equipo.textContent = 'Equipo: ' + objetivo;
  }

  const mostrarPendiente = () => {
    confirmar.textContent = 'Verificar la misma eliminación';
    mensaje.textContent = 'El resultado está pendiente de confirmación. Referencia: ' + pendiente.p_operacion_id;
  };
  if (pendiente) mostrarPendiente();
  confirmar.disabled = false;

  const enFicha = () => panel.isConnected && mantencionSubapartado === 'tv' &&
    state.currentUser?.id === actor && mantencionTelevisorSeleccionado === seleccion;
  let enviando = false;
  let finalizado = false;
  form.onsubmit = async e => {
    e.preventDefault();
    if (enviando || finalizado || confirmar.disabled || !enFicha()) return;
    enviando = true;
    cerrar.disabled = confirmar.disabled = true;
    mensaje.textContent = 'Verificando permiso…';
    try {
      if (!(await revalidarPrivilegioParaEscritura()) || !enFicha() ||
          window.esAdminPermanenteActual?.() !== true) {
        mensaje.textContent = MNT_ERRORES_ELIMINACION_TV.TV_ELIMINACION_NO_AUTORIZADA;
        return;
      }

      const reenvio = Boolean(pendiente);
      const solicitud = pendiente || { p_operacion_id: crypto.randomUUID(), p_televisor_id: objetivo };
      sessionStorage.setItem(clave, JSON.stringify(solicitud));
      pendiente = solicitud;
      mensaje.textContent = 'Comprobando eliminación…';

      let resultado;
      try {
        resultado = await window.MantencionesService.eliminarTelevisor(solicitud);
      } catch (error) {
        const codigo = String(error?.message ?? '').split(':', 1)[0];
        const texto = MNT_ERRORES_ELIMINACION_TV[codigo];
        if (texto && !(reenvio && codigo === 'TV_ELIMINACION_NO_AUTORIZADA')) {
          sessionStorage.removeItem(clave);
          pendiente = null;
          finalizado = true;
          mensaje.textContent = texto;
        } else {
          mostrarPendiente();
          if (texto) mensaje.textContent += ' ' + texto;
        }
        return;
      }

      finalizado = true;
      try { sessionStorage.removeItem(clave); } catch { /* Puede verificarse de nuevo con el mismo UUID. */ }
      pendiente = null;
      const texto = resultado === 'TV_YA_ELIMINADO'
        ? 'El televisor ya había sido eliminado.' : 'Televisor eliminado.';
      if (!enFicha()) { dialogo.close(); return; }

      const meta = MNT_SUBAPARTADOS.find(s => s.id === 'tv');
      const renderizar = (televisores, elementos, aviso) => {
        panel.innerHTML = '<p role="status" class="alm-muted mb-3">' + mntEsc(aviso) + '</p>' +
          mntPanelTelevisoresHTML(meta, televisores.filter(t => t.id !== objetivo), elementos);
      };
      mantencionTelevisorSeleccionado = null;
      renderizar(mntTelevisoresBase, mntTelevisoresElementos, texto);
      const listado = panel.firstElementChild;
      dialogo.close();

      try {
        const datos = await MNT_CARGADORES_SUBAPARTADO.tv();
        if (panel.isConnected && panel.firstElementChild === listado &&
            state.currentUser?.id === actor && mantencionSubapartado === 'tv' &&
            !mantencionTelevisorSeleccionado) renderizar(datos.televisores, datos.elementos, texto);
      } catch {
        if (panel.isConnected && panel.firstElementChild === listado && state.currentUser?.id === actor) {
          listado.textContent = texto + ' No se pudo actualizar el resto del catálogo. Vuelve a abrir TV Habitaciones.';
        }
      }
    } catch {
      if (pendiente) mostrarPendiente();
      else mensaje.textContent = 'No se pudo preparar la eliminación. No se envió una solicitud.';
    } finally {
      enviando = false;
      cerrar.disabled = false;
      confirmar.disabled = finalizado;
    }
  };
}

function mntControlesTVModificados(form) {
  return Array.from(form.querySelectorAll('input[type="radio"]'))
    .some(campo => campo.checked !== campo.defaultChecked);
}

function mntActualizarGuardarControlesTV(form) {
  form.querySelector('[type="submit"]').disabled =
    mntControlesTVEnCurso || form.dataset.confirmada === 'true' || !mntControlesTVModificados(form);
}

async function mntGuardarControlesTV(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const actor = state.currentUser?.id;
  const tv = mntTelevisoresBase.find(t => t.id === mantencionTelevisorSeleccionado);
  const panel = document.getElementById('mnt-modal-subapartado-body');
  const vigente = () => form.isConnected && panel?.contains(form) && state.currentUser?.id === actor &&
    mantencionSubapartado === 'tv' && mantencionTelevisorSeleccionado === tv?.id && window.esAdminOperativoActual?.();
  if (!actor || !tv || tv.retirado_en || !vigente() || mntControlesTVEnCurso ||
      document.getElementById('mnt-gestion-tv')) return;

  const mensaje = form.querySelector('[data-estado]');
  const guardar = form.querySelector('[type="submit"]');
  if (guardar.disabled || !mntControlesTVModificados(form)) return;
  const clave = 'hotel.tv.gestion.pendiente.' + actor;
  let solicitud;
  try {
    if (sessionStorage.getItem(clave) !== null) {
      await mntAbrirGestionTV('EDICION');
      return;
    }
    if (!form.reportValidity()) return;
    solicitud = mntGestionTVParametros('CONTROLES', tv, new FormData(form), crypto.randomUUID());
  } catch {
    mensaje.textContent = 'No se pudo preparar el guardado. Revisa las respuestas y la disponibilidad del almacenamiento local.';
    return;
  }

  mntControlesTVEnCurso = true;
  const campos = form.querySelectorAll('fieldset');
  guardar.disabled = true;
  campos.forEach(campo => { campo.disabled = true; });
  mensaje.textContent = 'Verificando y enviando…';
  try {
    if (!(await revalidarPrivilegioParaEscritura()) || !vigente()) {
      mensaje.textContent = 'No se pudo verificar tu permiso administrativo.';
      return;
    }
    try {
      sessionStorage.setItem(clave, JSON.stringify(solicitud));
    } catch {
      mensaje.textContent = 'No se pudo conservar la referencia. No se envió la solicitud.';
      return;
    }
    try {
      await window.MantencionesService.gestionarTelevisor(solicitud.rpc, solicitud.parametros);
    } catch (error) {
      const texto = MNT_ERRORES_GESTION_TV[error?.message];
      if (texto && error.message !== 'TV_OPERACION_ID_REUTILIZADO') {
        sessionStorage.removeItem(clave);
        if (error.message === 'TV_FICHA_DESACTUALIZADA') window.MantencionesService.invalidarCacheTelevisores();
        mensaje.textContent = texto;
      } else {
        mensaje.textContent = 'Resultado pendiente. Pulsa Guardar cambios para revisar y reenviar la misma solicitud. Referencia: ' +
          solicitud.parametros.p_operacion_id;
      }
      return;
    }
    form.dataset.confirmada = 'true';
    sessionStorage.removeItem(clave);
    mensaje.textContent = 'Cambios confirmados. Actualizando ficha…';
    try {
      const datos = await MNT_CARGADORES_SUBAPARTADO.tv();
      if (!vigente()) return;
      panel.innerHTML = mntPanelTelevisoresHTML(MNT_SUBAPARTADOS.find(s => s.id === 'tv'), datos.televisores, datos.elementos);
      const actual = datos.televisores.find(t => t.id === tv.id);
      if (actual) mntCargarHistorialEstadoTV(actual);
      const estado = panel.querySelector('form [data-estado]');
      if (estado) estado.textContent = 'Cambios guardados correctamente.';
    } catch {
      mensaje.textContent = 'Cambios confirmados. Vuelve a abrir TV Habitaciones para actualizar la ficha.';
    }
  } catch {
    mensaje.textContent = 'No se pudo completar la comprobación. Revisa si quedó una operación pendiente.';
  } finally {
    mntControlesTVEnCurso = false;
    mntActualizarGuardarControlesTV(form);
    campos.forEach(campo => { campo.disabled = false; });
  }
}

function mntTituloTelevisor(tv) {
  const e = mntTvElemento(tv);
  if (e && e.nombre_original !== null && e.nombre_original !== undefined && e.nombre_original !== '') {
    return String(e.nombre_original);
  }
  if (tv && tv.ubicacion_original !== null && tv.ubicacion_original !== undefined && tv.ubicacion_original !== '') {
    return String(tv.ubicacion_original);
  }
  return null;
}

// Opciones de filtro de marca derivadas de los datos (marca_normalizada
// real) + el bucket conceptual "Sin marca normalizada". NO se hardcodean
// marcas; NO se convierte el original ambiguo en marca normalizada.
function mntOpcionesFiltrosTelevisores(lista) {
  const marcas = new Set();
  (Array.isArray(lista) ? lista : []).forEach(t => {
    const m = t && t.marca_normalizada;
    if (m !== null && m !== undefined && String(m).trim() !== '') marcas.add(String(m));
  });
  return {
    marcas: Array.from(marcas).sort((a, b) => a.localeCompare(b, 'es'))
  };
}

// Aplica los cuatro filtros en cliente (AND), sin volver a Supabase.
// Control TV / Control Deco se filtran por el BOOLEANO REAL
// (control_tv_original / control_deco_funciona), nunca por el texto.
// NULL → bucket 'sin'; nunca se convierte NULL en false.
function mntFiltrarTelevisores(lista) {
  const texto = (mantencionFiltrosTV.texto || '').trim().toLowerCase();
  const marca = mantencionFiltrosTV.marca || '';
  const controlTv = mantencionFiltrosTV.controlTv || '';
  const controlDeco = mantencionFiltrosTV.controlDeco || '';

  return (Array.isArray(lista) ? lista : []).filter(t => {
    if (!t) return false;

    // Filtro por marca normalizada (bucket "Sin marca normalizada" incluye
    // los 6 ambiguos cuya marca_normalizada es NULL).
    if (marca) {
      const mn = (t.marca_normalizada === null || t.marca_normalizada === undefined || String(t.marca_normalizada).trim() === '')
        ? '' : String(t.marca_normalizada);
      if (marca === MNT_TV_MARCA_SIN_NORMALIZAR) {
        if (mn !== '') return false;
      } else if (mn !== marca) {
        return false;
      }
    }

    // Filtro Control TV original (booleano real).
    if (controlTv) {
      const v = t.control_tv_original;
      if (controlTv === 'true' && v !== true) return false;
      if (controlTv === 'false' && v !== false) return false;
      if (controlTv === 'sin' && v !== null && v !== undefined) return false;
    }

    // Filtro Control Deco funciona (booleano real).
    if (controlDeco) {
      const v = t.control_deco_funciona;
      if (controlDeco === 'true' && v !== true) return false;
      if (controlDeco === 'false' && v !== false) return false;
      if (controlDeco === 'sin' && v !== null && v !== undefined) return false;
    }

    // Buscador (case-insensitive). NULL se ignora; nunca "null".
    if (texto) {
      const e = mntTvElemento(t);
      const campos = [
        t.ubicacion_original,
        t.marca_original,
        t.marca_normalizada,
        t.modelo,
        t.tamano_original,
        e ? e.nombre_original : null,
        e ? e.codigo : null,
        e ? mntNombreUbicacion(e) : null
      ];
      const coincide = campos.some(c => {
        if (c === null || c === undefined || c === '') return false;
        return String(c).toLowerCase().indexOf(texto) !== -1;
      });
      if (!coincide) return false;
    }
    return true;
  });
}

// Buscador + filtros de marca y booleanos de control, derivados de los datos.
function mntFiltrosTelevisoresHTML(opciones) {
  const selMarca = mantencionFiltrosTV.marca || '';
  const selControlTv = mantencionFiltrosTV.controlTv || '';
  const selControlDeco = mantencionFiltrosTV.controlDeco || '';
  const haySeleccion = !!(mantencionFiltrosTV.texto || selMarca || selControlTv || selControlDeco);

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-3 border border-slate-100 dark:border-slate-800">
      <div class="flex flex-wrap items-end gap-3">
        <div class="mnt-tv-busqueda">
          <label for="mnt-buscar-tv" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Buscar</label>
        <input id="mnt-buscar-tv" type="text" value="${mntEsc(mantencionFiltrosTV.texto)}"
          oninput="mntOnBuscarTelevisor(this.value)"
          placeholder="Habitación, marca, tamaño o nombre del TV..."
          class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500" />
        </div>
        ${window.esAdminOperativoActual?.() ? mntGestionTVBoton('ALTA', '+ Nuevo televisor') : ''}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label for="mnt-filtro-marca-tv" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Marca</label>
          <select id="mnt-filtro-marca-tv" onchange="mntOnFiltrarMarcaTV(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todas las marcas</option>
            ${opciones.marcas.map(m => `<option value="${mntEsc(m)}" ${m === selMarca ? 'selected' : ''}>${mntEsc(m)}</option>`).join('')}
            <option value="${MNT_TV_MARCA_SIN_NORMALIZAR}" ${selMarca === MNT_TV_MARCA_SIN_NORMALIZAR ? 'selected' : ''}>Marca original sin normalizar</option>
          </select>
        </div>
        <div>
          <label for="mnt-filtro-controltv-tv" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Control TV original</label>
          <select id="mnt-filtro-controltv-tv" onchange="mntOnFiltrarControlTvTV(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todos</option>
            <option value="true" ${selControlTv === 'true' ? 'selected' : ''}>Sí, es original</option>
            <option value="false" ${selControlTv === 'false' ? 'selected' : ''}>No es original</option>
            <option value="sin" ${selControlTv === 'sin' ? 'selected' : ''}>Sin dato registrado</option>
          </select>
        </div>
        <div>
          <label for="mnt-filtro-controldeco-tv" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Control Deco funciona</label>
          <select id="mnt-filtro-controldeco-tv" onchange="mntOnFiltrarControlDecoTV(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todos</option>
            <option value="true" ${selControlDeco === 'true' ? 'selected' : ''}>Funciona</option>
            <option value="false" ${selControlDeco === 'false' ? 'selected' : ''}>No funciona</option>
            <option value="sin" ${selControlDeco === 'sin' ? 'selected' : ''}>Sin dato registrado</option>
          </select>
        </div>
      </div>
      ${haySeleccion ? `
        <button onclick="mntLimpiarFiltrosTelevisores()"
          class="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
          Limpiar filtros
        </button>
      ` : ''}
    </div>
  `;
}

// Cuadrícula de tarjetas (patrón validado en Elementos, Inventario, Baños y Pilas).
function mntCuadriculaTelevisoresHTML(filtrados) {
  if (!filtrados || filtrados.length === 0) {
    return `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-1">
        <span class="text-3xl block">🔍</span>
        <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Sin resultados para los filtros aplicados</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Prueba con otro texto, marca o estado de control.</p>
      </div>
    `;
  }

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${filtrados.map(mntTarjetaTelevisorHTML).join('')}
    </div>
  `;
}

// Tarjeta del televisor. SOLO valores ORIGINALES (marca/tamaño) + dos
// indicadores read-only de control. Sin normalizados (evita saturar), sin
// UUID y sin bloque de historial ni nota de migración (van en la ficha).
function mntTarjetaTelevisorHTML(t) {
  const titulo = mntTituloTelevisor(t);
  const habitacion = mntNombreUbicacion(mntTvElemento(t) || {}) || ((t.ubicacion_original !== null && t.ubicacion_original !== undefined && t.ubicacion_original !== '')
    ? String(t.ubicacion_original) : null);

  return `
    <div onclick="abrirFichaTelevisor('${mntEsc(t.id)}')"
      class="bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer card-hover group flex flex-col justify-between">
      <div>
        <div class="flex items-start justify-between mb-3">
          <div class="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-xl shrink-0">📺</div>
          ${habitacion ? `<span class="text-[10px] font-black px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[60%]" title="${mntEsc(habitacion)}">${mntEsc(habitacion)}</span>` : ''}
        </div>
        <h4 class="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug line-clamp-2">${mntEsc(mntSinDato(titulo))}</h4>
        <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-2 flex items-center space-x-1.5 truncate"><span>🏷️</span><span class="truncate">Marca: ${mntEsc(mntSinDato(t.marca_normalizada ?? t.marca_original))}</span></p>
        <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-1.5 flex items-center space-x-1.5 truncate"><span>📐</span><span class="truncate">Tamaño: ${mntEsc(mntSinDato(t.tamano_pulgadas ?? t.tamano_original))}</span></p>
        <p class="text-xs alm-muted">Modelo: ${mntEsc(mntSinDato(t.modelo))}</p>
        <p class="text-xs alm-muted">${t.retirado_en ? 'Retirado' : 'Instalado'} · ${t.origen_registro === 'OPERATIVO' ? 'Operativo' : 'Importado'}</p>
        <p class="mt-2 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Control TV original</p>
        <p class="mt-1">${mntIndicadorBooleanoHTML(t.control_tv_original, mntEtiquetasEstadoControl('control_tv'))}</p>
        <p class="mt-2 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Control Deco funciona</p>
        <p class="mt-1">${mntIndicadorBooleanoHTML(t.control_deco_funciona, mntEtiquetasEstadoControl('control_deco'))}</p>
      </div>
      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold">
        <span class="text-slate-400 dark:text-slate-500">Ver ficha</span>

      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// Manejadores de filtros (solo re-render del listado, sin recargar la SPA)
// ------------------------------------------------------------
function mntOnBuscarTelevisor(valor) {
  mantencionFiltrosTV.texto = valor || '';
  mntRefrescarListadoTelevisores();
}

function mntOnFiltrarMarcaTV(valor) {
  mantencionFiltrosTV.marca = valor || '';
  mntRefrescarListadoTelevisores();
}

function mntOnFiltrarControlTvTV(valor) {
  mantencionFiltrosTV.controlTv = valor || '';
  mntRefrescarListadoTelevisores();
}

function mntOnFiltrarControlDecoTV(valor) {
  mantencionFiltrosTV.controlDeco = valor || '';
  mntRefrescarListadoTelevisores();
}

// Rutina ÚNICA de reset del estado de filtros de TV Habitaciones.
// La usan el cierre completo de la modal (cerrarMantencionSubapartado) y el
// botón "Limpiar filtros" (mntLimpiarFiltrosTelevisores). No toca DOM ni
// consulta Supabase; solo restaura los valores iniciales del estado.
function mntResetFiltrosTV() {
  mantencionFiltrosTV.texto = '';
  mantencionFiltrosTV.marca = '';
  mantencionFiltrosTV.controlTv = '';
  mantencionFiltrosTV.controlDeco = '';
}

function mntLimpiarFiltrosTelevisores() {
  mntResetFiltrosTV();
  // Vuelve a dibujar el panel completo para refrescar también los <select>.
  cargarPanelSubapartado('tv');
}

// Actualiza únicamente la cuadrícula y el contador.
function mntRefrescarListadoTelevisores() {
  const cont = document.getElementById('mnt-listado-televisores');
  const contador = document.getElementById('mnt-contador-televisores');
  if (!cont) return;

  const filtrados = mntFiltrarTelevisores(mntTelevisoresBase);
  cont.innerHTML = mntCuadriculaTelevisoresHTML(filtrados);
  if (contador) contador.textContent = `${filtrados.length} de ${mntTelevisoresBase.length} televisores`;
}

// ------------------------------------------------------------
// Panel contenedor: decide entre listado y ficha (misma modal, sin modal
// sobre modal)
// ------------------------------------------------------------
function mntPanelTelevisoresHTML(meta, televisores, elementos) {
  mntTelevisoresBase = Array.isArray(televisores) ? televisores : [];
  mntTelevisoresElementos = Array.isArray(elementos) ? elementos : [];

  let cuerpo;
  if (mantencionTelevisorSeleccionado) {
    // Ficha interna: se busca el televisor en la base ya cargada (sin N+1 y
    // sin nueva consulta). Los filtros quedan guardados en estado.
    const tv = mntTelevisoresBase.find(t => t && t.id === mantencionTelevisorSeleccionado) || null;
    cuerpo = `
      <div>
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <button onclick="cerrarFichaTelevisor()"
          class="mb-4 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1.5">
          <span>←</span>
          <span>Volver al listado de televisores</span>
        </button>
        </div>
        ${tv ? mntFichaTelevisorHTML(tv) : `
          <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-2">
            <span class="text-3xl block">⚠️</span>
            <p class="text-sm font-bold text-slate-700 dark:text-slate-200">Televisor no encontrado</p>
          </div>
        `}
      </div>
    `;
  } else if (mntTelevisoresBase.length === 0) {
    cuerpo = `
      ${mntFiltrosTelevisoresHTML({ marcas: [] })}
      <div class="mt-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-10 text-center space-y-2">
        <span class="text-4xl block">📺</span>
        <h4 class="text-base font-black text-slate-700 dark:text-slate-200">No hay televisores registrados</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400">Aún no existen televisores de habitaciones.</p>

      </div>
    `;
  } else {
    const opciones = mntOpcionesFiltrosTelevisores(mntTelevisoresBase);
    const filtrados = mntFiltrarTelevisores(mntTelevisoresBase);
    cuerpo = `
      <div class="mt-5 space-y-4">
        ${mntFiltrosTelevisoresHTML(opciones)}
        <p id="mnt-contador-televisores" class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
          ${filtrados.length} de ${mntTelevisoresBase.length} televisores
        </p>
        <div id="mnt-listado-televisores">
          ${mntCuadriculaTelevisoresHTML(filtrados)}
        </div>
      </div>
    `;
  }

  let recuperar = false;
  if (!mantencionTelevisorSeleccionado && window.esAdminPermanenteActual?.() === true) {
    try {
      recuperar = Boolean(mntLeerEliminacionTV('hotel.tv.eliminacion.pendiente.' + state.currentUser?.id));
    } catch { /* La ficha informa si la referencia local no se puede leer. */ }
  }
  return `
    <div class="alm-ui bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      ${recuperar ? '<button type="button" class="alm-btn-secondary px-3 py-2 mb-3" onclick="mntAbrirEliminarTV(true)">Verificar eliminación pendiente</button>' : ''}
      ${cuerpo}
    </div>
  `;
}

// ------------------------------------------------------------
// Ficha del televisor (DENTRO de la modal del subapartado)
// ------------------------------------------------------------
// La ficha NO crea una segunda modal. Reemplaza el contenido del listado
// dentro de la misma modal de "TV Habitaciones". Los filtros se conservan
// en estado (mantencionFiltrosTV) y al volver se repintan igual. No se
// recarga la SPA ni se consulta Supabase: el televisor se busca en
// mntTelevisoresBase y el elemento relacionado en mntTelevisoresElementos.

function abrirFichaTelevisor(id) {
  mantencionTelevisorSeleccionado = id;
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;

  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'tv') || { nombre: 'TV Habitaciones', icono: '📺' };
  panel.innerHTML = mntPanelTelevisoresHTML(meta, mntTelevisoresBase, mntTelevisoresElementos);

  // C2D-1B: la ficha se renderiza de forma síncrona; el historial real del
  // estado del televisor se carga en este punto, ya con la ficha en el DOM.
  const tv = mntTelevisoresBase.find(t => t && t.id === id) || null;
  if (tv) mntCargarHistorialEstadoTV(tv);
}

// Vuelve al listado conservando búsqueda, marca y booleanos seleccionados.
function cerrarFichaTelevisor() {
  mantencionTelevisorSeleccionado = null;
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;

  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'tv') || { nombre: 'TV Habitaciones', icono: '📺' };
  panel.innerHTML = mntPanelTelevisoresHTML(meta, mntTelevisoresBase, mntTelevisoresElementos);
}

function mntFichaTelevisorHTML(t) {
  const titulo = mntTituloTelevisor(t);
  const ubicacion = mntNombreUbicacion(mntTvElemento(t)) || t.ubicacion_original;
  const siNo = valor => valor === true ? 'Sí' : valor === false ? 'No' : 'Sin dato';
  const tvOriginal = t.control_tv_original_declarado ?? t.control_tv_original;
  const decoFunciona = t.control_deco_funciona_declarado ?? t.control_deco_funciona;
  const tamano = t.tamano_pulgadas == null ? t.tamano_original : t.tamano_pulgadas + '″';

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-5 space-y-5">

      <!-- CABECERA FICHA -->
      <div class="flex items-start space-x-3">
        <div class="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-2xl shrink-0">📺</div>
        <div class="min-w-0">
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Ficha del televisor</p>
          <h3 class="text-lg font-black text-slate-900 dark:text-white leading-snug break-words">${mntEsc(mntSinDato(titulo))}</h3>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        ${t.retirado_en ? `<span class="alm-muted">Retirado el ${mntEsc(t.retirado_en)}</span>` : ''}
        ${t.reemplaza_a_id ? `<button type="button" class="alm-btn-secondary px-3 py-2" onclick="abrirFichaTelevisor('${mntEsc(t.reemplaza_a_id)}')">Ver equipo anterior</button>` : ''}
        ${mntTelevisoresBase.filter(sucesor => sucesor.reemplaza_a_id === t.id).map(sucesor => `<button type="button" class="alm-btn-secondary px-3 py-2" onclick="abrirFichaTelevisor('${mntEsc(sucesor.id)}')">Ver sucesor</button>`).join('')}
        ${!t.retirado_en && window.esAdminOperativoActual?.() ? mntGestionTVBoton('EDICION', 'Editar información de la televisión') + mntGestionTVBoton('REEMPLAZO') : ''}
        ${mntPuedeEliminarTV(t) ? '<button type="button" class="alm-btn-danger px-3 py-2" onclick="mntAbrirEliminarTV()">Eliminar televisor</button>' : ''}
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${mntCampoFichaHTML('Ubicación actual', ubicacion)}
        ${mntCampoFichaHTML('Marca', t.marca_normalizada ?? t.marca_original)}
        ${mntCampoFichaHTML('Pulgadas', tamano)}
        ${t.modelo ? mntCampoFichaHTML('Modelo', t.modelo) : ''}
      </div>
      ${!t.retirado_en && window.esAdminOperativoActual?.() ? `
        <form class="space-y-3" onchange="mntActualizarGuardarControlesTV(this)" onsubmit="mntGuardarControlesTV(event)">
          ${mntTVControlBooleano('tv_original', '¿Control TV original?', tvOriginal, true)}
          ${mntTVControlBooleano('deco_funciona', '¿Control Deco funciona?', decoFunciona, true)}
          <button type="submit" class="alm-btn-primary px-3 py-2" disabled>Guardar cambios</button>
          <p class="alm-muted text-sm" data-estado role="status"></p>
        </form>` : `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${mntCampoFichaHTML('¿Control TV original?', siNo(tvOriginal))}
          ${mntCampoFichaHTML('¿Control Deco funciona?', siNo(decoFunciona))}
        </div>`}
      ${mntBloqueEstadoOperativoTVHTML(t)}
      ${mntBloqueHistorialEstadoTVHTML()}
    </div>
  `;
}

// ==========================================================
// TV HABITACIONES — FASE C2C-2B / C2D-1B (ESTADO OPERATIVO DEL TELEVISOR)
// ==========================================================
// Bloques NUEVOS que existen EXCLUSIVAMENTE dentro de
// mntFichaTelevisorHTML(tv):
//  1) mntBloqueEstadoOperativoTVHTML: estado operativo ACTUAL del televisor
//     (tv.estado_operativo_actual). NO existe dato original del estado del
//     televisor: NO se muestra ni se inventa ninguno.
//  2) mntBloqueHistorialEstadoTVHTML: contenedor del historial real
//     (public.mantencion_historial, campo = 'estado_operativo') que se pinta
//     de forma ASÍNCRONA.
// NO se modifica mntBloqueControlesTVHTML (también lo usan Elementos e
// Historial): ahí siguen el dato original/importado del Control TV y del
// Control Deco, sin cambios.
// PILOTO CONTROL DECO (C2C-2A/2B/2C): sus datos y sus revisiones en
// mantencion_historial (campo = 'control_deco_funciona') PERMANECEN EN BD
// INTACTOS; solo dejan de ser la funcionalidad operacional principal de la
// ficha TV (ya no se muestran aquí su estado actual ni su historial).
// Escrituras: ÚNICAMENTE vía HistorialService.revisarEstado con
// campo = 'estado_operativo'. SIN escritura directa a tablas.

// Etiqueta del estado operativo del TV. Comparación ESTRICTA: `false` es un
// valor operacional legítimo ("No operativo") y JAMÁS se trata como vacío.
// null/undefined (y cualquier otro tipo inesperado) → sin revisión registrada.
function mntTextoEstadoOperativoTV(valor) {
  if (valor === true) return 'Operativo';
  if (valor === false) return 'No operativo';
  return 'Sin revisión registrada';
}

// Badge del estado operativo. Reutiliza el mismo lenguaje visual de
// mntIndicadorBooleanoHTML (solo lectura), pero con el texto neutro propio
// de este campo: "Sin revisión registrada" (no "Sin dato registrado").
function mntIndicadorEstadoOperativoTVHTML(valor) {
  let clases, punto;

  if (valor === true) {
    clases = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900';
    punto = 'bg-emerald-500 dark:bg-emerald-400';
  } else if (valor === false) {
    clases = 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900';
    punto = 'bg-rose-500 dark:bg-rose-400';
  } else {
    clases = 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
    punto = 'bg-slate-400 dark:bg-slate-500';
  }

  return `
    <span class="inline-flex items-center space-x-1.5 text-[11px] font-black px-2.5 py-1 rounded-full border ${clases}">
      <span aria-hidden="true" class="w-2 h-2 rounded-full ${punto} shrink-0"></span>
      <span>${mntEsc(mntTextoEstadoOperativoTV(valor))}</span>
    </span>
  `;
}

// Bloque ESTADO ACTUAL DEL TELEVISOR (ficha principal, C2D-1B): muestra SOLO
// el estado operativo del televisor (estado_operativo_actual). NO hay dato
// original: no existe en el Excel ni en BD. El bloque ocupa el ancho completo
// de la ficha: una única tarjeta, sin grid de dos columnas.
function mntBloqueEstadoOperativoTVHTML(tv) {
  const valorActual = tv ? tv.estado_operativo_actual : null;
  const sinRevision = valorActual === null || valorActual === undefined;

  // El botón es SOLO UX. La autoridad real sigue siendo la RPC backend
  // (usuario habilitado + es_administrador_actual). Si el helper global real
  // no existe o devuelve distinto de true, el botón no se pinta.
  const puedeRevisar = typeof window.esAdminOperativoActual === 'function' &&
    window.esAdminOperativoActual() === true &&
    !!tv && !!tv.id && !tv.retirado_en;

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Estado actual del televisor</h4>
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-2">
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Estado operativo actual</p>
        <div>${mntIndicadorEstadoOperativoTVHTML(valorActual)}</div>
        <p class="text-[10px] text-slate-400 dark:text-slate-500">
          ${sinRevision
            ? 'Todavía no se registran revisiones del estado del televisor.'
            : 'Resultado de la última revisión registrada en Mantención General.'}
        </p>
        ${puedeRevisar ? `
        <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onclick="abrirModalRevisionTV('${mntEsc(tv.id)}')"
            class="mt-1 inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all">
            <span aria-hidden="true">📝</span>
            <span>Registrar revisión</span>
          </button>
        </div>` : ''}
      </div>
    </div>
  `;
}

// Bloque HISTORIAL DEL ESTADO DEL TELEVISOR: contenedor con estado de carga
// inicial. El contenido real se pinta después, de forma asíncrona, desde
// mntCargarHistorialEstadoTV(tv). Usa EXCLUSIVAMENTE campo
// 'estado_operativo'; NUNCA muestra las revisiones de control_deco_funciona.
function mntBloqueHistorialEstadoTVHTML() {
  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Historial del estado del televisor</h4>
      <div id="mnt-historial-estado-tv" class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Cargando historial...</p>
      </div>
    </div>
  `;
}

// Conversión visual de un valor previo del historial (jsonb: true/false/null/...).
// Solo presentación; no guarda ni transforma nada.
function mntEtiquetaEstadoPreviaTV(valor) {
  if (valor === true) return 'Operativo';
  if (valor === false) return 'No operativo';
  return 'Sin estado previo';
}

// Fecha/hora del evento → texto local. created_at sale del servidor; aquí
// solo se formatea para lectura. Fecha ilegible → texto neutro, nunca NaN.
function mntFechaHoraRevisionTexto(iso) {
  return formatearFechaCL(iso,{hora:true,vacio:'Fecha no registrada'});
}

// Evento individual del historial (SOLO LECTURA). La tabla NO tiene
// columna "cambio": se calcula únicamente para presentación comparando
// valor_anterior !== valor_nuevo (comparación estricta, cuidando true /
// false / null). Nada de esto se persiste.
// C2D-3D1: si ev.anulacion existe, el registro ORIGINAL sigue visible con
// fecha, autor, observación, valores y chip intactos; se agrega el chip
// "ANULADA" (convive con el chip de cambio, no lo reemplaza) y el bloque
// informativo de anulación (helper genérico mntBloqueAnulacionHTML, mismo
// texto neutro de Control: "Este registro fue anulado y no se considera una
// revisión vigente."). Si ev.anulacion es null/undefined el comportamiento
// es EXACTAMENTE el anterior.
// C2D-3D2: se agrega el botón "Anular revisión" SOLO para el dominio
// EXACTO televisor / estado_operativo / revision, aún NO anulado y con
// Administrador PERMANENTE (el backend exige es_administrador_permanente_
// actual(); un administrador temporal NO puede anular). El piloto Deco
// (campo 'control_deco_funciona') queda EXCLUIDO por la condición de campo:
// esos 3 registros históricos jamás muestran este botón. Sin rol/email/UUID
// hardcodeados. La anulación se ejecuta vía modal PROPIO TV
// (abrirModalAnulacionRevisionTV), nunca desde el renderer.
// La semántica true/false/null sigue siendo EXCLUSIVAMENTE
// Operativo / No operativo / Sin estado previo (mntEtiquetaEstadoPreviaTV);
// el estado ACTUAL del televisor NUNCA se recalcula aquí: sigue saliendo de
// tv.estado_operativo_actual (recalculado server-side al anular).
function mntEventoRevisionHTML(ev) {
  const registro = ev || {};
  const anterior = registro.valor_anterior;
  const nuevo = registro.valor_nuevo;
  const huboCambio = anterior !== nuevo;
  const anulada = registro.anulacion !== null && registro.anulacion !== undefined;

  const observacionTexto = (typeof registro.observacion === 'string' && registro.observacion.trim() !== '')
    ? registro.observacion.trim()
    : 'Sin observación registrada';

  const autorTexto = (typeof (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot) === 'string' && (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot).trim() !== '')
    ? (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot).trim()
    : 'Autor no registrado';

  const cambioClases = huboCambio
    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';

  const chipAnulada = anulada
    ? `<span class="text-[10px] font-black px-2.5 py-1 rounded-full border bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900">ANULADA</span>`
    : '';

  const bloqueAnulacion = anulada
    ? mntBloqueAnulacionHTML(registro.anulacion, {
        texto: 'Este registro fue anulado y no se considera una revisión vigente.'
      })
    : '';

  // C2D-3D2 — GATING del botón "Anular revisión" (SOLO lectura del rol en
  // cliente; la autoridad definitiva sigue siendo la RPC backend). Se exige
  // TODO: registro real con id, dominio EXACTO televisor / estado_operativo /
  // revision, aún NO anulado y Administrador PERMANENTE (nunca temporal).
  // El campo 'control_deco_funciona' (piloto Deco) queda EXCLUIDO por la
  // condición de campo === 'estado_operativo'. Sin rol/email/UUID
  // hardcodeados. El botón NO aparece en revisiones ya anuladas.
  const historialId = registro.id || null;
  const puedeAnular = !!historialId &&
    registro.tipo_entidad === 'televisor' &&
    registro.campo === 'estado_operativo' &&
    registro.accion === 'revision' &&
    !anulada &&
    typeof window.esAdminPermanenteActual === 'function' &&
    window.esAdminPermanenteActual() === true;

  // Registro original (copia superficial) disponible para la modal de
  // anulación TV: evita serializar datos de BD en atributos onclick y
  // garantiza que el contexto mostrado (fecha, estados, autor, observación y
  // sobre todo el entidad_id REAL del evento) salga del evento leído, nunca
  // de la UI.
  if (puedeAnular) {
    mntAnulacionRevisionTVEventos.set(String(historialId), Object.assign({}, registro));
  }

  const botonAnular = puedeAnular
    ? `<div class="pt-2 border-t border-slate-100 dark:border-slate-700">
        <button type="button" onclick="abrirModalAnulacionRevisionTV('${mntEsc(String(historialId))}')"
          class="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all">
          <span aria-hidden="true">⛔</span>
          <span>Anular revisión</span>
        </button>
      </div>`
    : '';

  return `
    <li class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs font-black text-slate-800 dark:text-slate-200">${mntEsc(mntFechaHoraRevisionTexto(registro.created_at))}</p>
        <span class="flex flex-wrap items-center gap-2">
          <span class="text-[10px] font-black px-2.5 py-1 rounded-full border ${cambioClases}">
            ${huboCambio ? 'Cambio de estado' : 'Revisión sin cambio'}
          </span>
          ${chipAnulada}
        </span>
      </div>
      <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">
        ${mntEsc(mntEtiquetaEstadoPreviaTV(anterior))} → ${mntEsc(mntEtiquetaEstadoPreviaTV(nuevo))}
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Observación: ${mntEsc(observacionTexto)}
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Autor: ${mntEsc(autorTexto)}
      </p>
      ${botonAnular}
      ${bloqueAnulacion}
    </li>
  `;
}

// Carga ASÍNCRONA del historial real del ESTADO DEL TELEVISOR (campo
// 'estado_operativo'). Se invoca SIEMPRE después de insertar la ficha en el
// DOM (la ficha se renderiza de forma síncrona y este bloque arranca en
// "Cargando historial...").
// Antes de pintar se comprueba:
//   1) que el contenedor siga existiendo (ficha abierta);
//   2) que mantencionTelevisorSeleccionado siga siendo tv.id.
// Si el usuario cerró la ficha o abrió otro televisor, los resultados
// viejos NO se pintan. En error: console.error técnico + mensaje neutro
// dentro del bloque, sin romper el resto de la ficha.
async function mntCargarHistorialEstadoTV(tv) {
  if (!tv || !tv.id) return;

  const cont = document.getElementById('mnt-historial-estado-tv');
  if (!cont) return;

  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }

    // Única fuente de datos: public.mantencion_historial (solo lectura,
    // vía service), filtrado por campo = 'estado_operativo'. Orden: el más
    // reciente primero (created_at DESC). Las revisiones de
    // control_deco_funciona NO se consultan aquí.
    const revisiones = await window.HistorialService.getRevisiones(
      'televisor',
      tv.id,
      'estado_operativo'
    );

    if (mantencionTelevisorSeleccionado !== tv.id) return;
    const contActual = document.getElementById('mnt-historial-estado-tv');
    if (!contActual) return;

    if (!Array.isArray(revisiones) || revisiones.length === 0) {
      contActual.innerHTML = `
        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Sin revisiones registradas
        </p>
      `;
      return;
    }

    contActual.innerHTML = `
      <p class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
        ${revisiones.length} revisión(es) registrada(s) · más reciente primero
      </p>
      <div class="mt-3">${mntHistorialPaginadoHTML(revisiones.length, 'Revisiones del televisor', `<ul class="space-y-3">
        ${mntOrdenarHistorialReciente(revisiones).map(mntEventoRevisionHTML).join('')}
      </ul>`)}</div>
    `;
  } catch (e) {
    console.error('Error cargando el historial del estado del televisor (TV):', e);

    if (mantencionTelevisorSeleccionado !== tv.id) return;
    const contError = document.getElementById('mnt-historial-estado-tv');
    if (!contError) return;

    contError.innerHTML = `
      <p class="text-xs font-bold text-rose-600 dark:text-rose-400">
        No fue posible cargar el historial.
      </p>
    `;
  }
}

// ==========================================================
// TV HABITACIONES — FASE C2D-1B (REGISTRAR REVISIÓN DEL TELEVISOR)
// (Adapta el piloto C2C-2C del Control Deco al estado del televisor)
// ==========================================================
// Modal específica y reutilizable para registrar UNA revisión del campo
// 'estado_operativo' (estado_operativo_actual). ÚNICA vía de escritura:
// window.HistorialService.revisarEstado(...) → RPC
// public.mantencion_revisar_estado. SIN supabase.from().update()/insert(),
// SIN escritura directa a televisores_habitaciones ni mantencion_historial,
// SIN localStorage NI mocks. El campo de control_deco_funciona NUNCA se usa
// para esta revisión; el piloto de Control Deco queda solo en BD.
// Patrón visual: overlay + caja (js/views/trabajadores.js línea 299 y
// mntModalSubapartadoHTML), montado UNA sola vez en <body> (id único,
// handlers en línea ⇒ sin listeners duplicados al reabrir).

const MNT_MODAL_REVISION_TV_ID = 'mnt-modal-revision-tv-overlay';

// true mientras la RPC + el refresco están en vuelo. Guard EXCLUSIVO de TV
// (nunca se reutiliza mntRevisionControlGuardando). Ciclo (C2D-3A):
//   false → true  : en mntEnviarRevisionTV, justo antes de llamar a
//                    HistorialService.revisarEstado.
//   true  → false  : SOLO cuando termina el REFRESCO posterior — error RPC ⇒
//                    mntRestaurarSubmitRevisionTV(); éxito RPC ⇒ liberación
//                    explícita en el finally de mntEnviarRevisionTV (después
//                    de intentar el refresco, nunca antes).
// Cerrar/ocultar la modal (Escape, X, Cancelar, clic fuera o cierre del
// subapartado) NO lo libera, y abrirModalRevisionTV lo respeta (return).
let mntRevisionTVGuardando = false;

// C2D-3A — BLOQUEO DE REINTENTO tras escritura CONFIRMADA con refresco
// fallido. Guarda el id del televisor cuya revisión YA quedó registrada en
// mantencion_historial pero cuyo refresco de la vista falló. Mientras esté
// activa:
//   - mntEnviarRevisionTV hace return SIN ejecutar ninguna RPC;
//   - la modal de ESE televisor se renderiza con el aviso informativo y el
//     botón deshabilitado en "Revisión registrada".
// Se limpia SOLO cuando TV Habitaciones se vuelve a leer de Supabase
// (cargarPanelSubapartado), es decir cuando el usuario sigue el aviso
// "Cierra y vuelve a abrir TV Habitaciones": en ese punto la ficha ya
// muestra el estado real y una nueva revisión sí sería legítima.
let mntRevisionTVPendienteRefresco = null;

// Texto ÚNICO del aviso "escritura confirmada + refresco fallido".
// NUNCA se muestra en el contenedor de error de RPC ni se resuelve con
// MNT_MENSAJES_ERROR_REVISION_TV: esos mensajes son EXCLUSIVOS del fallo de
// la RPC y aquí la revisión SÍ quedó registrada.
const MNT_AVISO_REFRESCO_TV = 'La revisión quedó registrada correctamente, pero no fue posible actualizar la vista. No vuelvas a enviar la revisión. Cierra y vuelve a abrir TV Habitaciones.';

// Mensajes amigables por código de error real del backend.
// NUNCA se muestra el detalle técnico (SQL, UUID, stack) al usuario.
const MNT_MENSAJES_ERROR_REVISION_TV = {
  SESION_INVALIDA: 'Tu sesión no pudo verificarse. Cierra sesión e ingresa nuevamente.',
  NO_AUTORIZADO: 'No tienes permiso para registrar esta revisión.',
  CAMPO_NO_PERMITIDO: 'Este campo no está habilitado para revisiones.',
  CONFIG_INCOMPLETA: 'La configuración de revisiones de este campo está incompleta. Contacta al administrador.',
  ENTIDAD_NO_ENCONTRADA: 'Este televisor ya no está disponible en Supabase.',
  TIPO_NO_IMPLEMENTADO: 'Este tipo de entidad aún no soporta revisiones.',
  VALOR_INVALIDO: 'El valor seleccionado no es válido para este campo.',
  VALOR_NO_PERMITIDO: 'Ese valor no está permitido para este campo.'
};

// Crea la modal UNA sola vez. Si ya existe, devuelve la misma (no duplica
// ids ni estructura).
function asegurarModalRevisionTV() {
  let overlay = document.getElementById(MNT_MODAL_REVISION_TV_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MNT_MODAL_REVISION_TV_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Registrar revisión del televisor');
  overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-3 sm:p-4 overflow-y-auto';
  overlay.onclick = function (ev) {
    // Solo el clic en el fondo cierra; el clic dentro de la caja no burbujea.
    // UX-02: fondo sin cierre.
  };
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 my-auto text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
      <div id="mnt-modal-revision-tv"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// Escape cierra PRIMERO la modal de revisión (fase de captura, por delante
// de mntTeclaEscapeSubapartado que cierra la modal del subapartado).
// C2C-2C.1: aunque la RPC esté en vuelo puede ocultar la modal, pero
// NO libera mntRevisionTVGuardando ⇒ no se puede iniciar otra revisión
// hasta que esa RPC termine.
function mntTeclaEscapeRevisionTV(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

// Contenido de la modal: contexto (habitación + estado actual) + formulario.
// Estado revisado: radios con valor "true"/"false"; la VALIDACIÓN distingue
// explícitamente true / false / sin selección (nunca if (!valor)).
// Preselección: solo comodidad, NO implica que la revisión esté guardada.
function mntContenidoModalRevisionTVHTML(tv) {
  const e = mntTvElemento(tv);
  const titulo = mntTituloTelevisor(tv);
  const habitacion = mntPrimerValor(e ? e.codigo : null, tv.ubicacion_original);
  const valorActual = tv.estado_operativo_actual;

  // C2D-3A: si la revisión de ESTE televisor ya quedó registrada y solo
  // falló el refresco, la modal se abre/mantiene en estado "ya registrada":
  // aviso informativo visible y botón deshabilitado (sin segundo envío).
  const pendienteRefresco = mntRevisionTVPendienteRefresco !== null &&
    mntRevisionTVPendienteRefresco === tv.id;

  const preseleccionTrue = valorActual === true ? 'checked' : '';
  const preseleccionFalse = valorActual === false ? 'checked' : '';

  const claseRadio = 'w-4 h-4 text-blue-600 bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-blue-500 cursor-pointer';
  const claseOpcion = 'flex items-center space-x-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700';

  return `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center space-x-2.5 min-w-0">
        <span class="text-2xl shrink-0">📺</span>
        <div class="min-w-0">
          <h3 class="text-base font-bold text-slate-800 dark:text-white truncate">Registrar revisión del televisor</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate">Hotel & Centro de Eventos El Almendro</p>
        </div>
      </div>
      <button type="button" onclick="cerrarModalRevisionTV()"
        class="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold">&times;</button>
    </div>

    <div class="mt-3 space-y-1.5">
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Televisor: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(titulo))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Habitación: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(habitacion))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Estado actual:
        <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntTextoEstadoOperativoTV(valorActual))}</span>
      </p>
    </div>

    <form onsubmit="mntEnviarRevisionTV(event)" class="mt-4 space-y-3.5">
      <input type="hidden" id="mnt-revision-tv-id" value="${mntEsc(tv.id)}">

      <div>
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Estado revisado *</label>
        <div class="space-y-2">
          <label class="${claseOpcion}">
            <input type="radio" name="mnt-revision-tv-estado" value="true" ${preseleccionTrue} class="${claseRadio}">
            <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">Operativo</span>
          </label>
          <label class="${claseOpcion}">
            <input type="radio" name="mnt-revision-tv-estado" value="false" ${preseleccionFalse} class="${claseRadio}">
            <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">No operativo</span>
          </label>
        </div>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          Debes seleccionar una opción. También se registra si el estado no cambia: es una revisión periódica válida.
        </p>
      </div>

      <div>
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Observación (opcional)</label>
        <textarea id="mnt-revision-tv-observacion" rows="3"
          placeholder="Sin observación registrada si lo dejas vacío"
          class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
      </div>

      <!-- Mensaje inline de error. NO se muestra éxito salvo que
           Supabase confirme la operación. -->
      <div id="mnt-revision-tv-error"
        class="hidden rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
      </div>

      <!-- Aviso INFORMATIVO (C2D-3A): caja azul, DISTINTA del recuadro
           rose de error de RPC. Texto fijo de la constante
           MNT_AVISO_REFRESCO_TV; se llena con textContent. -->
      <div id="mnt-revision-tv-aviso" class="${pendienteRefresco ? '' : 'hidden'} rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-xs font-bold text-blue-800 dark:text-blue-200 leading-relaxed">${pendienteRefresco ? mntEsc(MNT_AVISO_REFRESCO_TV) : ''}</div>

      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2.5">
        <button type="button" onclick="cerrarModalRevisionTV()"
          class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" id="mnt-revision-tv-submit" ${pendienteRefresco ? 'disabled' : ''}
          class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-blue-600">
          <span id="mnt-revision-tv-submit-label">${pendienteRefresco ? 'Revisión registrada' : 'Guardar revisión'}</span>
        </button>
      </div>
    </form>
  `;
}

// Abre la modal para el televisor indicado. El estado inicial del formulario
// sale de tv.estado_operativo_actual (leído desde Supabase), con comparación
// estricta: true → "Operativo", false → "No operativo",
// null/undefined → ninguna preselección.
function abrirModalRevisionTV(tvId) {
  // C2C-2C.1: si hay una RPC en vuelo NO se permite iniciar otra revisión.
  // Cerrar la modal (Escape, X, Cancelar, clic fuera o cierre del
  // subapartado) NO libera el guard: solo lo hace la RPC al terminar.
  if (mntRevisionTVGuardando) {
    console.warn('mntRevisionTVGuardando activo: se omite abrir una nueva revisión del televisor.');
    return;
  }

  const tv = mntTelevisoresBase.find(t => t && t.id === tvId) || null;
  if (!tv || !tv.id) return;

  const overlay = asegurarModalRevisionTV();
  const cont = document.getElementById('mnt-modal-revision-tv');
  if (!overlay || !cont) return;

  // Contenido nuevo en cada apertura (sin errores ni envíos previos).
  // NO se toca mntRevisionTVGuardando: aquí ya es false por la guarda anterior.
  cont.innerHTML = mntContenidoModalRevisionTVHTML(tv);
  overlay.classList.remove('hidden');

  // Sin listeners duplicados: se retira antes de volver a agregar.
  document.removeEventListener('keydown', mntTeclaEscapeRevisionTV, true);
  document.addEventListener('keydown', mntTeclaEscapeRevisionTV, true);

  const preseleccionado = cont.querySelector('input[name="mnt-revision-tv-estado"]:checked');
  const primero = preseleccionado || cont.querySelector('input[name="mnt-revision-tv-estado"]');
  if (primero && typeof primero.focus === 'function') primero.focus();
}

// Oculta la modal y retira el listener de Escape. NO libera el guard:
// cerrar/ocultar no significa que la RPC terminó. El guard lo libera
// mntRestaurarSubmitRevisionTV (error) o el caso de éxito del submit.
// No toca la ficha subyacente.
function cerrarModalRevisionTV() {
  const overlay = document.getElementById(MNT_MODAL_REVISION_TV_ID);
  if (overlay) overlay.classList.add('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeRevisionTV, true);
}

function mntMostrarErrorRevisionTV(mensaje) {
  const caja = document.getElementById('mnt-revision-tv-error');
  if (!caja) return;
  caja.textContent = mensaje;   // textContent: nunca HTML de error
  caja.classList.remove('hidden');
}

function mntOcultarErrorRevisionTV() {
  const caja = document.getElementById('mnt-revision-tv-error');
  if (!caja) return;
  caja.textContent = '';
  caja.classList.add('hidden');
}

// Aviso INFORMATIVO de "escritura confirmada + refresco fallido" (C2D-3A).
// Caja AZUL propia de la modal (no es el recuadro rose de error de RPC) y
// texto fijo: comunica que la revisión SÍ quedó registrada, que falló solo
// la actualización visual y que NO hay que reenviar. textContent: nunca HTML.
function mntMostrarAvisoRevisionTV() {
  const caja = document.getElementById('mnt-revision-tv-aviso');
  if (!caja) return;
  caja.textContent = MNT_AVISO_REFRESCO_TV;
  caja.classList.remove('hidden');
}

// Estado final del botón tras una escritura CONFIRMADA con refresco fallido:
// queda DESHABILITADO y rotulado "Revisión registrada", de modo que un
// segundo submit sea imposible desde esta modal. El reintento solo vuelve a
// habilitarse en una modal nueva (render normal) cuando TV Habitaciones se
// vuelva a leer de Supabase.
function mntMarcarSubmitRevisionTVRegistrado() {
  const btn = document.getElementById('mnt-revision-tv-submit');
  const etiqueta = document.getElementById('mnt-revision-tv-submit-label');
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Revisión registrada';
}

// Ruta de ERROR: la RPC terminó (con fallo), por lo que SÍ se libera el
// guard y se restaura el botón para poder reintentar.
function mntRestaurarSubmitRevisionTV() {
  mntRevisionTVGuardando = false;
  const btn = document.getElementById('mnt-revision-tv-submit');
  const etiqueta = document.getElementById('mnt-revision-tv-submit-label');
  if (btn) btn.disabled = false;
  if (etiqueta) etiqueta.textContent = 'Guardar revisión';
}

// SUBMIT: única escritura, vía HistorialService.revisarEstado con
// campo = 'estado_operativo' (NUNCA control_deco_funciona).
// Distingue true / false / sin selección; acepta revisiones "sin cambio"
// (false → false o true → true): el backend las registra igual.
async function mntEnviarRevisionTV(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  // Anti doble envío: mientras la RPC + el refresco están en vuelo se ignora
  // cualquier segundo submit (el botón además queda deshabilitado).
  if (mntRevisionTVGuardando) return;

  const cont = document.getElementById('mnt-modal-revision-tv');
  if (!cont) return;

  const inputTv = document.getElementById('mnt-revision-tv-id');
  const tvId = inputTv ? String(inputTv.value || '') : '';
  if (!tvId) return;

  // C2D-3A: si la revisión de ESTE televisor YA quedó registrada y solo
  // falló el refresco, aquí NO se ejecuta ninguna RPC (segundo envío
  // bloqueado aunque el botón quedara habilitado por algún repaint).
  if (mntRevisionTVPendienteRefresco !== null &&
      mntRevisionTVPendienteRefresco === tvId) {
    console.warn('Revisión ya registrada del televisor con refresco pendiente: se omite un segundo envío.');
    return;
  }

  // --- Estado revisado (obligatorio, con distinción explícita) ---
  const marcado = cont.querySelector('input[name="mnt-revision-tv-estado"]:checked');
  let valorNuevo = null; // null = SIN SELECCIÓN
  if (marcado && marcado.value === 'true') valorNuevo = true;
  else if (marcado && marcado.value === 'false') valorNuevo = false;

  if (valorNuevo !== true && valorNuevo !== false) {
    mntMostrarErrorRevisionTV('Debes seleccionar el estado revisado: Operativo o No operativo.');
    return;
  }

  // --- Observación opcional (texto o null; nunca inventada) ---
  const textarea = document.getElementById('mnt-revision-tv-observacion');
  const observacion = (textarea && typeof textarea.value === 'string' && textarea.value.trim() !== '')
    ? textarea.value.trim()
    : null;

  // --- Bloqueo de doble envío + estado "Guardando..." ---
  const btn = document.getElementById('mnt-revision-tv-submit');
  const etiqueta = document.getElementById('mnt-revision-tv-submit-label');
  mntRevisionTVGuardando = true;
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Guardando...';
  mntOcultarErrorRevisionTV();

  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }

    // ÚNICA escritura. El cliente NO envía autor (la RPC lo resuelve desde
    // auth.uid()) ni tablas/columnas adicionales. El campo es EXCLUSIVAMENTE
    // 'estado_operativo'; el piloto de control_deco_funciona no se usa aquí.
    await window.HistorialService.revisarEstado({
      tipoEntidad: 'televisor',
      entidadId: tvId,
      campo: 'estado_operativo',
      valorNuevo: valorNuevo,
      observacion: observacion
    });
  } catch (err) {
    // RUTA A — RPC fallida: detalle técnico SOLO en consola; en la modal,
    // mensaje amigable. La modal PERMANECE ABIERTA, el guard se libera y el
    // botón se restaura: reintento permitido. NADA de refresco en este catch.
    console.error('Error registrando revisión del televisor:', err);
    const codigo = err && err.codigo;
    const mensaje = MNT_MENSAJES_ERROR_REVISION_TV[codigo] || 'No fue posible registrar la revisión.';
    mntMostrarErrorRevisionTV(mensaje);
    mntRestaurarSubmitRevisionTV();
    return;
  }

  // ÉXITO DE LA RPC: la revisión YA quedó registrada en mantencion_historial
  // (append-only). Desde este punto NINGÚN fallo posterior puede presentarse
  // como fallo de escritura ni usar MNT_MENSAJES_ERROR_REVISION_TV.
  // El guard se mantiene en true durante todo el refresco y se libera
  // SIEMPRE en el finally.
  // HistorialService.revisarEstado ya invalidó la caché de historial y la de
  // televisores; además se pide force = true, que es el parámetro real que
  // acepta getTelevisores(force = false).
  let refrescoOk = false;
  try {
    refrescoOk = (await mntRefrescarFichaTrasRevision(tvId)) === true;
  } catch (err) {
    // Excepción de render (u otra) posterior a la RPC → "escritura
    // confirmada / refresco fallido", NUNCA fallo de RPC.
    console.error('Error inesperado refrescando la ficha del televisor:', err);
    refrescoOk = false;
  } finally {
    mntRevisionTVGuardando = false;
  }

  // RUTA B — RPC exitosa + refresco exitoso: repintado desde datos reales
  // (ya ocurrió dentro del refresh), historial recargado y cierre de la
  // modal. El estado mostrado NUNCA sale del radio elegido: sale de
  // Supabase.
  if (refrescoOk) {
    cerrarModalRevisionTV();
    return;
  }

  // RUTA C — RPC exitosa + refresco fallido: la modal PERMANECE ABIERTA
  // para que el usuario lea el aviso inequívoco (revisión registrada /
  // falló solo la vista / no reenviar), el botón queda en "Revisión
  // registrada" y cualquier nuevo envío de este televisor queda bloqueado.
  mntRevisionTVPendienteRefresco = tvId;
  mntMostrarAvisoRevisionTV();
  mntMarcarSubmitRevisionTVRegistrado();
}

// Relectura real tras el éxito + repintado de la ficha del MISMO televisor.
// C2D-3A: devuelve true SOLO cuando los datos frescos llegaron y (si aplica)
// la ficha se repintó; false cuando el REFRESCO falló (lectura o render).
// NO decide nada sobre la escritura, que ya ocurrió: la lectura de este
// resultado es exclusiva del caller para informar "éxito/fallo del refresco".
// Si el usuario cambió o cerró la ficha durante la RPC, solo se refrescan
// datos/caché: NO se pinta sobre otra ficha, NO se reabre la anterior y NO
// se toca mantencionTelevisorSeleccionado (eso NO es un fallo).
async function mntRefrescarFichaTrasRevision(tvId) {
  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está cargado.');
    }
    const televisores = await window.MantencionesService.getTelevisores(true);
    mntTelevisoresBase = Array.isArray(televisores) ? televisores : [];
  } catch (e) {
    // Sin datos frescos NO se repinta nada (no se inventa estado local).
    console.error('Error releyendo televisores tras la revisión:', e);
    return false;
  }

  // Si durante el request el usuario cerró la ficha o cambió de televisor,
  // NO se fuerza el repintado de la ficha anterior (los datos SÍ están
  // frescos ⇒ refresco correcto).
  if (mantencionTelevisorSeleccionado !== tvId) return true;

  const televisorActualizado = mntTelevisoresBase.find(t => t && t.id === tvId) || null;
  if (!televisorActualizado) return true;

  // Flujo real de render de ficha: repinta con los datos recién leídos y
  // vuelve a disparar la carga ASÍNCRONA del historial (evento nuevo
  // incluido). La carga del historial tiene su propio try/catch interno
  // (mntCargarHistorialEstadoTV) y no escapa como unhandled rejection.
  // C2D-3A: una excepción AQUÍ también cuenta como refresco fallido
  // (escritura ya confirmada) y ya NO escapa como unhandled rejection.
  try {
    abrirFichaTelevisor(tvId);
  } catch (e) {
    console.error('Error repintando la ficha del televisor tras la revisión:', e);
    return false;
  }

  return true;
}

// ==========================================================
// TV HABITACIONES — FASE C2D-3D2 (ANULAR REVISIÓN DE ESTADO)
// ==========================================================
// Modal PROPIO y reutilizable para anular UNA revisión de estado
// (tipo_entidad 'televisor', campo 'estado_operativo', accion 'revision')
// desde el historial de la ficha de TV Habitaciones.
// ÚNICA vía de escritura: window.HistorialService.anularHistorial({ historialId,
// motivo }) → RPC public.mantencion_anular_historial. SIN supabase.rpc()
// directo, SIN .insert()/.update()/.delete(), SIN localStorage ni mocks.
// El cliente NO envía entidad, tipo, campo, acción, autor, fecha ni estado
// resultante: todo lo resuelve el backend (y SOLO un Administrador
// PERMANENTE puede anular; un temporal recibe NO_AUTORIZADO).
// NO se elimina nada: el registro original se conserva y el backend crea la
// anulación + recalcula estado_operativo_actual server-side.
// Namespace y guards PROPIOS: jamás se reutilizan los ids ni los flags del
// modal Registrar revisión TV (mnt-modal-revision-tv-*, mntRevisionTV*) ni
// de Control (mnt-modal-anular-revision-control-*, mntAnulacionRevision*).
// El piloto Deco (campo 'control_deco_funciona') queda FUERA de este flujo:
// su botón jamás se muestra (condición de campo en el renderer) y el
// backend además lo rechaza.
// Todo texto de BD mostrado en el HTML pasa por mntEsc; los errores se
// muestran con textContent (nunca stack traces, SQL ni HTML de error).

const MNT_MODAL_ANULAR_REVISION_TV_ID = 'mnt-modal-anular-revision-tv-overlay';

// true mientras la RPC de anulación TV está en vuelo. Guard EXCLUSIVO de
// anulación TV (nunca se reutiliza mntRevisionTVGuardando ni
// mntAnulacionRevisionControlGuardando). Ciclo:
//   false → true : en mntEnviarAnulacionRevisionTV, justo antes de llamar a
//                  HistorialService.anularHistorial.
//   true  → false: SOLO cuando la RPC terminó — error ⇒
//                  mntRestaurarSubmitAnulacionRevisionTV(); éxito ⇒
//                  liberación explícita en el finally del refresco.
// Cerrar/ocultar la modal (Escape, X, Cancelar, clic fuera o cierre del
// subapartado) NO lo libera, y abrirModalAnulacionRevisionTV lo respeta
// (return): así no se puede iniciar una segunda anulación en vuelo.
let mntAnulacionRevisionTVGuardando = false;

// BLOQUEO DE REINTENTO tras anulación CONFIRMADA con refresco fallido.
// Guarda el historialId cuya anulación YA quedó registrada en
// mantencion_historial_anulaciones pero cuyo refresco de la vista falló.
// Se identifica por historialId (UNIQUE(historial_id) en backend + locks +
// REGISTRO_YA_ANULADO hacen imposible una segunda anulación real).
// Mientras esté activa:
//   - mntEnviarAnulacionRevisionTV hace return SIN ejecutar ninguna RPC;
//   - la modal de ESE registro se renderiza con el aviso informativo y el
//     botón deshabilitado en "Revisión anulada".
// Se limpia SOLO cuando TV Habitaciones se vuelve a leer de Supabase
// (cargarPanelSubapartado), es decir cuando el usuario sigue el aviso
// "Cierra y vuelve a abrir TV Habitaciones". NO se limpia al cerrar la
// modal ni si una lectura posterior falla.
let mntAnulacionRevisionTVPendienteRefresco = null;

// Texto ÚNICO del aviso "anulación confirmada + refresco fallido".
// NUNCA se muestra en el contenedor de error de RPC ni se resuelve con
// MNT_MENSAJES_ERROR_ANULACION_TV: esos mensajes son EXCLUSIVOS del fallo
// de la RPC y aquí la anulación SÍ quedó registrada.
const MNT_AVISO_REFRESCO_ANULACION_TV = 'La revisión quedó anulada correctamente, pero no fue posible actualizar la vista. No vuelvas a intentar anularla. Cierra y vuelve a abrir TV Habitaciones.';

// Mensajes amigables por código de error real (backend + validaciones locales).
// NUNCA se muestra el detalle técnico (SQL, UUID, stack) al usuario.
const MNT_MENSAJES_ERROR_ANULACION_TV = {
  MOTIVO_REQUERIDO: 'Debes indicar el motivo de la anulación.',
  SESION_INVALIDA: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
  NO_AUTORIZADO: 'Solo un administrador permanente puede anular esta revisión.',
  REGISTRO_YA_ANULADO: 'Esta revisión ya fue anulada.',
  CAMPO_NO_PERMITIDO: 'Esta revisión no admite anulación.',
  CONFIG_INCOMPLETA: 'La configuración necesaria para anular esta revisión no está disponible.',
  ENTIDAD_NO_ENCONTRADA: 'La revisión o el televisor asociado ya no está disponible.',
  TIPO_NO_IMPLEMENTADO: 'Este tipo de registro aún no admite anulación.',
  VALOR_INVALIDO: 'La anulación solicitada no es válida.',
  VALOR_NO_PERMITIDO: 'La anulación solicitada no está permitida.'
};

// Registro ORIGINAL de cada revisión anulable de TV, poblado por el renderer
// (mntEventoRevisionHTML) en el mismo pintado que muestra el botón. Permite
// abrir la modal con el contexto REAL del evento (incluido el entidad_id del
// televisor) sin serializar BD en atributos HTML y sin inferir nada desde el
// texto de la interfaz.
const mntAnulacionRevisionTVEventos = new Map();

// Crea la modal UNA sola vez. Si ya existe, devuelve la misma (no duplica
// ids ni estructura).
function asegurarModalAnulacionRevisionTV() {
  let overlay = document.getElementById(MNT_MODAL_ANULAR_REVISION_TV_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MNT_MODAL_ANULAR_REVISION_TV_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Anular revisión del televisor');
  overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overflow-y-auto';
  overlay.onclick = function (ev) {
    // Solo el clic en el fondo cierra; el clic dentro de la caja no burbujea.
    // UX-02: fondo sin cierre.
  };
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 my-auto text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
      <div id="mnt-modal-anular-revision-tv"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// Escape cierra PRIMERO la modal de anulación TV (fase de captura, por
// delante de mntTeclaEscapeRevisionTV y mntTeclaEscapeSubapartado). Si la
// modal NO está visible no intercepta (no roba el Escape a otros diálogos).
// Aunque la RPC esté en vuelo puede ocultar la modal, pero NO libera
// mntAnulacionRevisionTVGuardando ⇒ no se puede iniciar otra anulación hasta
// que esa RPC termine.
function mntTeclaEscapeAnulacionRevisionTV(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

// Contenido de la modal: contexto REAL de la revisión original (TV,
// habitación, fecha, estado anterior, estado registrado, autor y observación
// — todo desde el evento leído de BD y la colección real de televisores) +
// advertencia sobre el recálculo server-side + textarea del motivo
// OBLIGATORIO. NO dice "Eliminar"/"Borra": el registro se conserva.
function mntContenidoModalAnulacionRevisionTVHTML(ev, pendienteRefresco) {
  const registro = ev || {};

  // Contexto del televisor: colección REAL local (mntTelevisoresBase,
  // alimentada por getTelevisores desde Supabase). Si no se encuentra se
  // muestran textos neutros; nunca se inventa habitación ni nombre.
  const tv = mntTelevisoresBase.find(t => t && t.id === registro.entidad_id) || null;
  const e = tv ? mntTvElemento(tv) : null;
  const tituloTV = tv ? mntTituloTelevisor(tv) : null;
  const habitacionTV = tv ? mntPrimerValor(e ? e.codigo : null, tv.ubicacion_original) : null;

  const observacionTexto = (typeof registro.observacion === 'string' && registro.observacion.trim() !== '')
    ? registro.observacion.trim()
    : 'Sin observación registrada';

  const autorTexto = (typeof (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot) === 'string' && (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot).trim() !== '')
    ? (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot).trim()
    : 'Autor no registrado';

  return `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center space-x-2.5 min-w-0">
        <span class="text-2xl shrink-0">⛔</span>
        <div class="min-w-0">
          <h3 class="text-base font-bold text-slate-800 dark:text-white truncate">Anular revisión</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate">Hotel & Centro de Eventos El Almendro</p>
        </div>
      </div>
      <button type="button" onclick="cerrarModalAnulacionRevisionTV()"
        class="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold">&times;</button>
    </div>

    <div class="mt-3 space-y-2.5">
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed">
        Esta acción invalidará esta revisión, pero conservará el registro original para trazabilidad.
      </p>
      <div class="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-[11px] font-bold text-amber-800 dark:text-amber-200 leading-relaxed">
        El estado actual del televisor se recalculará automáticamente usando la última revisión válida anterior.
        Si no existe otra revisión válida, quedará como Sin revisión registrada.
      </div>

      <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 pt-1">Revisión a anular</p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        TV: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(tituloTV))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Habitación: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(habitacionTV))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Fecha de la revisión: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntFechaHoraRevisionTexto(registro.created_at))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Estado anterior: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntEtiquetaEstadoPreviaTV(registro.valor_anterior))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Estado registrado: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntEtiquetaEstadoPreviaTV(registro.valor_nuevo))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Autor original: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(autorTexto)}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Observación original: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(observacionTexto)}</span>
      </p>
    </div>

    <form onsubmit="mntEnviarAnulacionRevisionTV(event)" class="mt-4 space-y-3.5">
      <!-- IDs reales del evento: historialId (clave de la anulación) y
           televisorId REAL (ev.entidad_id). NUNCA se infieren de la UI. -->
      <input type="hidden" id="mnt-anular-revision-tv-id" value="${mntEsc(registro.id)}">
      <input type="hidden" id="mnt-anular-revision-tv-tv-id" value="${mntEsc(registro.entidad_id)}">

      <div>
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Motivo de anulación *</label>
        <textarea id="mnt-anular-revision-tv-motivo" rows="3"
          placeholder="Indica por qué se anula esta revisión"
          class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"></textarea>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          El motivo es obligatorio y queda registrado en la trazabilidad de la anulación.
        </p>
      </div>

      <!-- Mensaje inline de error. NO se muestra éxito salvo que
           Supabase confirme la operación. -->
      <div id="mnt-anular-revision-tv-error"
        class="hidden rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
      </div>

      <!-- Aviso INFORMATIVO: anulación CONFIRMADA + refresco fallido. Caja
           azul, DISTINTA del recuadro rose de error de RPC. Texto fijo de
           MNT_AVISO_REFRESCO_ANULACION_TV; se llena con textContent. -->
      <div id="mnt-anular-revision-tv-aviso" class="${pendienteRefresco ? '' : 'hidden'} rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-xs font-bold text-blue-800 dark:text-blue-200 leading-relaxed">${pendienteRefresco ? mntEsc(MNT_AVISO_REFRESCO_ANULACION_TV) : ''}</div>

      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2.5">
        <button type="button" onclick="cerrarModalAnulacionRevisionTV()"
          class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" id="mnt-anular-revision-tv-submit" ${pendienteRefresco ? 'disabled' : ''}
          class="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-rose-600">
          <span id="mnt-anular-revision-tv-submit-label">${pendienteRefresco ? 'Revisión anulada' : 'Anular revisión'}</span>
        </button>
      </div>
    </form>
  `;
}

// Abre la modal para la revisión indicada. El contexto sale del evento
// ORIGINAL registrado por el renderer (ev.id, ev.entidad_id, valores, autor,
// observación, created_at): nada se infiere del texto de la interfaz.
function abrirModalAnulacionRevisionTV(historialId) {
  // Anti doble RPC: si hay una anulación TV en vuelo NO se permite iniciar
  // otra. Cerrar la modal (Escape, X, Cancelar, clic fuera o cierre del
  // subapartado) NO libera el guard: solo lo hace la RPC al terminar.
  if (mntAnulacionRevisionTVGuardando) {
    console.warn('mntAnulacionRevisionTVGuardando activo: se omite abrir una nueva anulación de revisión del televisor.');
    return;
  }

  const id = typeof historialId === 'string' ? historialId.trim() : '';
  if (!id) return;

  const registro = mntAnulacionRevisionTVEventos.get(id);
  if (!registro || !registro.id) {
    console.warn('Anulación de revisión TV: evento no disponible en memoria, se omite abrir la modal.');
    return;
  }
  // Sin entidad_id REAL no hay forma legítima de refrescar la ficha tras la
  // escritura: mejor no abrir que arriesgar un refresh incorrecto.
  if (!registro.entidad_id) {
    console.warn('Anulación de revisión TV: el evento no tiene entidad_id, se omite abrir la modal.');
    return;
  }

  const overlay = asegurarModalAnulacionRevisionTV();
  const cont = document.getElementById('mnt-modal-anular-revision-tv');
  if (!overlay || !cont) return;

  // Si la anulación de ESTE registro YA quedó registrada y solo falló el
  // refresco, la modal se abre en estado "ya anulada": aviso visible y botón
  // deshabilitado (sin segundo envío).
  const pendienteRefresco = mntAnulacionRevisionTVPendienteRefresco !== null &&
    mntAnulacionRevisionTVPendienteRefresco === String(registro.id);

  // Contenido nuevo en cada apertura (sin errores ni envíos previos).
  // NO se toca mntAnulacionRevisionTVGuardando: aquí ya es false por la
  // guarda.
  cont.innerHTML = mntContenidoModalAnulacionRevisionTVHTML(registro, pendienteRefresco);
  overlay.classList.remove('hidden');

  // Sin listeners duplicados: se retira antes de volver a agregar.
  document.removeEventListener('keydown', mntTeclaEscapeAnulacionRevisionTV, true);
  document.addEventListener('keydown', mntTeclaEscapeAnulacionRevisionTV, true);

  if (!pendienteRefresco) {
    const textarea = document.getElementById('mnt-anular-revision-tv-motivo');
    if (textarea && typeof textarea.focus === 'function') textarea.focus();
  }
}

// Oculta la modal y retira SOLO su listener de Escape. NO libera el guard:
// cerrar/ocultar no significa que la RPC terminó. NO ejecuta ninguna
// escritura. No toca la ficha subyacente ni el estado de selección.
function cerrarModalAnulacionRevisionTV() {
  const overlay = document.getElementById(MNT_MODAL_ANULAR_REVISION_TV_ID);
  if (overlay) overlay.classList.add('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeAnulacionRevisionTV, true);
}

function mntMostrarErrorAnulacionRevisionTV(mensaje) {
  const caja = document.getElementById('mnt-anular-revision-tv-error');
  if (!caja) return;
  caja.textContent = mensaje;   // textContent: nunca HTML de error
  caja.classList.remove('hidden');
}

function mntOcultarErrorAnulacionRevisionTV() {
  const caja = document.getElementById('mnt-anular-revision-tv-error');
  if (!caja) return;
  caja.textContent = '';
  caja.classList.add('hidden');
}

// Aviso INFORMATIVO de "anulación confirmada + refresco fallido". Caja
// AZUL propia de la modal (no es el recuadro rose de error de RPC) y texto
// fijo: comunica que la anulación SÍ quedó registrada, que falló solo la
// actualización visual y que NO hay que reintentar. textContent: nunca HTML.
function mntMostrarAvisoAnulacionRevisionTV() {
  const caja = document.getElementById('mnt-anular-revision-tv-aviso');
  if (!caja) return;
  caja.textContent = MNT_AVISO_REFRESCO_ANULACION_TV;
  caja.classList.remove('hidden');
}

// Estado final del botón tras una anulación CONFIRMADA con refresco
// fallido: queda DESHABILITADO y rotulado "Revisión anulada", de modo que un
// segundo submit sea imposible desde esta modal. El reintento solo vuelve a
// habilitarse en una modal nueva (render normal) cuando TV Habitaciones se
// vuelva a leer de Supabase.
function mntMarcarSubmitAnulacionRevisionTVAnulado() {
  const btn = document.getElementById('mnt-anular-revision-tv-submit');
  const etiqueta = document.getElementById('mnt-anular-revision-tv-submit-label');
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Revisión anulada';
}

// Ruta de ERROR: la RPC terminó (con fallo), por lo que SÍ se libera el
// guard y se restaura el botón para poder reintentar (o leer el mensaje y
// cerrar). La modal PERMANECE ABIERTA.
function mntRestaurarSubmitAnulacionRevisionTV() {
  mntAnulacionRevisionTVGuardando = false;
  const btn = document.getElementById('mnt-anular-revision-tv-submit');
  const etiqueta = document.getElementById('mnt-anular-revision-tv-submit-label');
  if (btn) btn.disabled = false;
  if (etiqueta) etiqueta.textContent = 'Anular revisión';
}

// SUBMIT: única escritura de anulación TV desde la vista, vía
// HistorialService.anularHistorial({ historialId, motivo }). El motivo se
// valida localmente con trim() ANTES de la RPC (vacío ⇒ error local, sin
// llamada). NO se envía televisorId, entidad, tipo, campo, acción, autor,
// fecha ni estado resultante. El backend es la autoridad final (sesión,
// habilitación, Administrador PERMANENTE, dominio
// televisor/estado_operativo/revision y doble anulación).
async function mntEnviarAnulacionRevisionTV(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  // Anti doble envío: mientras la RPC está en vuelo se ignora cualquier
  // segundo submit (el botón además queda deshabilitado).
  if (mntAnulacionRevisionTVGuardando) return;

  const cont = document.getElementById('mnt-modal-anular-revision-tv');
  if (!cont) return;

  const inputHistorial = document.getElementById('mnt-anular-revision-tv-id');
  const historialId = inputHistorial ? String(inputHistorial.value || '') : '';
  if (!historialId) return;

  const inputTv = document.getElementById('mnt-anular-revision-tv-tv-id');
  const televisorId = inputTv ? String(inputTv.value || '') : '';

  // Si la anulación de ESTE registro YA quedó registrada y solo falló el
  // refresco, aquí NO se ejecuta ninguna RPC (segundo envío bloqueado
  // aunque el botón quedara habilitado por algún repaint).
  if (mntAnulacionRevisionTVPendienteRefresco !== null &&
      mntAnulacionRevisionTVPendienteRefresco === historialId) {
    console.warn('Revisión TV ya anulada con refresco pendiente: se omite un segundo envío.');
    return;
  }

  // --- Motivo (obligatorio; trim ANTES de la RPC) ---
  const textarea = document.getElementById('mnt-anular-revision-tv-motivo');
  const motivo = (textarea && typeof textarea.value === 'string')
    ? textarea.value.trim()
    : '';
  if (!motivo) {
    mntMostrarErrorAnulacionRevisionTV(MNT_MENSAJES_ERROR_ANULACION_TV.MOTIVO_REQUERIDO);
    return;
  }

  // --- Bloqueo de doble envío + estado "Anulando..." ---
  const btn = document.getElementById('mnt-anular-revision-tv-submit');
  const etiqueta = document.getElementById('mnt-anular-revision-tv-submit-label');
  mntAnulacionRevisionTVGuardando = true;
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Anulando...';
  mntOcultarErrorAnulacionRevisionTV();

  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }

    // ÚNICA escritura. Solo historialId + motivo; el backend resuelve todo
    // lo demás (autor, fecha, entidad, campo, acción y recálculo de estado).
    await window.HistorialService.anularHistorial({
      historialId: historialId,
      motivo: motivo
    });
  } catch (err) {
    // Detalle técnico SOLO en consola; en la modal, mensaje amigable.
    // REGISTRO_YA_ANULADO se presenta aquí como fallo informativo (la
    // revisión ya estaba anulada): NO se trata como éxito ni se re-ejecuta
    // ninguna RPC automáticamente.
    console.error('Error anulando la revisión del televisor:', err);
    const codigo = err && err.codigo;
    const mensaje = MNT_MENSAJES_ERROR_ANULACION_TV[codigo] || 'No fue posible anular la revisión.';
    mntMostrarErrorAnulacionRevisionTV(mensaje);
    mntRestaurarSubmitAnulacionRevisionTV();
    return;
  }

  // ÉXITO DE LA RPC: la anulación YA quedó registrada en
  // mantencion_historial_anulaciones y el backend YA recalculó
  // estado_operativo_actual. Desde este punto NINGÚN fallo posterior puede
  // presentarse como fallo de escritura ni usar
  // MNT_MENSAJES_ERROR_ANULACION_TV.
  // El guard se mantiene en true durante todo el refresco y se libera
  // SIEMPRE en el finally.
  let refrescoOk = false;
  try {
    refrescoOk = (await mntRefrescarFichaTVTrasAnulacion(televisorId)) === true;
  } catch (err) {
    // Excepción de render (u otra) posterior a la RPC → "anulación
    // confirmada / refresco fallido", NUNCA fallo de anulación.
    console.error('Error inesperado refrescando la ficha del televisor tras la anulación:', err);
    refrescoOk = false;
  } finally {
    mntAnulacionRevisionTVGuardando = false;
  }

  // RUTA B — RPC exitosa + refresco exitoso: repintado desde datos reales
  // (el estado sale de televisores_habitaciones.estado_operativo_actual,
  // NUNCA se calcula en frontend ni se usa valor_resultante), historial
  // recargado y cierre de la modal.
  if (refrescoOk) {
    cerrarModalAnulacionRevisionTV();
    return;
  }

  // RUTA C — RPC exitosa + refresco fallido: la modal PERMANECE ABIERTA
  // para que el usuario lea el aviso inequívoco (anulación registrada /
  // falló solo la vista / no reintentar), el botón queda en "Revisión
  // anulada" y cualquier nuevo envío de este registro queda bloqueado.
  mntAnulacionRevisionTVPendienteRefresco = String(historialId);
  mntMostrarAvisoAnulacionRevisionTV();
  mntMarcarSubmitAnulacionRevisionTVAnulado();
}

// Relectura real tras el éxito + repintado de la ficha del MISMO televisor.
// Devuelve true SOLO cuando los datos frescos llegaron y (si aplica) la ficha
// se repintó; false cuando el REFRESCO falló (lectura o render). NO decide
// nada sobre la escritura, que ya ocurrió. Si el usuario cambió o cerró la
// ficha durante la RPC, solo se refrescan datos/caché: NO se pinta sobre otra
// ficha, NO se reabre la anterior y NO se toca mantencionTelevisorSeleccionado
// (eso NO es un fallo). NO calcula el estado resultante en frontend: badge e
// indicador salen del objeto fresco leído desde Supabase
// (estado_operativo_actual). El historial se recarga en el flujo normal de
// abrirFichaTelevisor() → mntCargarHistorialEstadoTV() (fail-closed).
async function mntRefrescarFichaTVTrasAnulacion(televisorId) {
  if (!televisorId) return false;

  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está cargado.');
    }
    const televisores = await window.MantencionesService.getTelevisores(true);
    mntTelevisoresBase = Array.isArray(televisores) ? televisores : [];
  } catch (e) {
    // Sin datos frescos NO se repinta nada (no se inventa estado local).
    console.error('Error releyendo televisores tras la anulación:', e);
    return false;
  }

  if (mantencionTelevisorSeleccionado !== televisorId) return true;

  const televisorActualizado = mntTelevisoresBase.find(t => t && t.id === televisorId) || null;
  if (!televisorActualizado) return true;

  // Mismo flujo real de render de ficha que usa la revisión: repinta con el
  // objeto REAL recién leído y, dentro del mismo flujo, vuelve a disparar la
  // carga ASÍNCRONA del historial (HistorialService.anularHistorial ya vació
  // _revisionesCache ⇒ relectura real desde Supabase).
  try {
    abrirFichaTelevisor(televisorId);
  } catch (e) {
    console.error('Error repintando la ficha del televisor tras la anulación:', e);
    return false;
  }

  return true;
}

// ==========================================================
// PUERTAS / ENGRASE Y ACEITADO — FASE 2.6
// ==========================================================
// Vista propia del subapartado 'engrase'. La preview genérica de Fase 1 ya
// NO aparece para este subapartado.
//
// Fuente: LISTA DE PUERTAS POR ENGRASAR Y ACEITAR.xlsx (Hoja1 + Hoja2) →
// listado_engrase_aceitado (getEngraseAceitado(), registros fuente
// ordenados por hoja_origen y fila_origen). Hoja1 = 32 filas, Hoja2 = 15
// filas; total operacional = 47 registros (NUNCA se hardcodea: el contador
// usa mntEngraseBase.length). Las 15 filas provenientes de
// _LISTA FOSAS DE ALCANTARILLADOS.xlsx se conservan en la base por
// trazabilidad pero quedan EXCLUIDAS por el filtro de importación del
// servicio (importacion_id → importaciones_excel.archivo_origen).
//
// Mapeo real del Excel (Hoja1 y Hoja2 tienen la MISMA estructura):
// - A NUM → numero_original; B Nombre completo → nombre_original;
//   C Ubicación → ubicacion_original; D ULTIMA MANTENCION FECHA →
//   ultima_mantencion_fecha (DATE cuando es válida) +
//   ultima_mantencion_fecha_original (texto fuente) +
//   ultima_mantencion_fecha_precision (metadata de migración, ej. DIA);
//   F Quien lo Hizo → responsable_original.
// - celda_nombre_origen ← celda de la columna B. elemento_id ← FK creada
//   por la migración (NO es columna del Excel y puede ser NULL).
// - observaciones ← NO existe columna Observaciones en el Excel: los
//   valores poblados son notas GENERADAS por la migración.
//
// Convenciones de datos:
// - La vista representa REGISTROS DEL LISTADO (47 filas fuente), no
//   elementos físicos: exactamente 1 fila (Hoja1, NUM=8, Centro de Eventos)
//   tiene elemento_id NULL porque la migración NO inventó un elemento con el
//   nombre vacío. Esa fila es un registro válido: se muestra con título
//   "Sin nombre registrado" y SIN bloque de elemento vinculado (ausencia no
//   es error).
// - Relación registro → elemento SOLO por FK real
//   (engrase.elemento_id === elementos_mantenibles.id), resuelta en cliente
//   contra mntEngraseElementos (copia de getElementos() en el cargador),
//   SIN depender de mntElementosBase, SIN N+1 y SIN consultas por ficha.
// - Los datos principales del registro son SIEMPRE los campos del listado
//   (numero_original, nombre_original, ubicacion_original): esta vista
//   reproduce el Excel de Puertas / Engrase. El elemento aporta solo
//   ubicación canónica y código como contexto complementario.
// - La encabezado real de la columna D es "ULTIMA MANTENCION FECHA", por lo
//   que la etiqueta visible "Fecha de última mantención" es correcta.
// - Responsable y fecha son datos INDEPENDIENTES: en Hoja1 existen 2 filas
//   con responsable y SIN fecha. NO se interpreta eso como una mantención
//   fechada; el responsable se etiqueta con el encabezado real del Excel
//   ("Quien lo hizo") y nunca "Responsable de última mantención".
// - Fecha: normalizada → dd-mm-aaaa; sin normalizada pero con texto fuente
//   → se muestra el texto sin reinterpretarlo; ambas NULL → "Sin fecha
//   registrada". La precisión (ej. DIA) se usa internamente, no se muestra.
// - observaciones: texto GENERADO durante la migración. Se muestra
//   EXCLUSIVAMENTE en la ficha, como "Nota de migración"; nunca en
//   tarjetas; nunca se etiqueta "Observaciones del cliente".
// - Sin bloque de historial (no se llama getMantenciones()): la fecha y el
//   responsable ya vienen en el propio listado; el historial general del
//   elemento permanece en "Elementos e Historial". No se duplica información.
// - Sin filtro por hoja (Hoja1/Hoja2 es trazabilidad técnica) ni por
//   ubicación (el buscador ya la cubre).
// - Solo lectura: sin inputs, sin INSERT/UPDATE/DELETE.
// - NULL texto → "Sin dato registrado"; NULL fecha → "Sin fecha registrada";
//   NULL responsable → "Sin responsable registrado". Nunca NULL → 0.
// - No se muestran UUID (id, elemento_id, importacion_id, created_at).

// Bucket técnico del filtro de responsable para filas con
// responsable_original NULL/vacío. Es un identificador de filtro, NO un
// valor de dato; los nombres reales se derivan de los datos (Set).
const MNT_ENGRASE_RESP_SIN = '__sin_responsable__';

// Copias en cliente de las colecciones ya cacheadas (sin N+1).
// mntEngraseElementos viene de getElementos() para resolver el elemento
// relacionado (r.elemento_id) SIN depender de mntElementosBase: el
// subapartado funciona aunque "Elementos e Historial" no se haya abierto.
let mntEngraseBase = [];
let mntEngraseElementos = [];

// Elemento mantenible vinculado (FK real r.elemento_id → elemento.id).
// Sin relación (fila conservada con nombre vacío en el Excel) → null; NO se
// infiere nada por nombre, número ni similitud textual.
function mntEngraseElemento(r) {
  if (!r || r.elemento_id === null || r.elemento_id === undefined || r.elemento_id === '') return null;
  const lista = Array.isArray(mntEngraseElementos) ? mntEngraseElementos : [];
  return lista.find(x => x && x.id === r.elemento_id) || null;
}

// Archivo de origen real del registro (embed importacion:importaciones_excel).
function mntArchivoOrigenEngrase(r) {
  const i = r && r.importacion;
  if (!i || typeof i !== 'object' || Array.isArray(i)) return null;
  const v = i.archivo_origen;
  return (v === null || v === undefined || v === '') ? null : v;
}

// Fecha → "dd-mm-aaaa". Si el valor no sigue el formato esperado se muestra
// TAL CUAL (no se inventa ni se reinterpreta la fecha), patrón de Inventario.
function mntFechaEngraseTexto(valor) {
  return formatearFechaCL(valor,{civil:true,vacio:String(valor),invalida:String(valor)});
}

// Título del registro: nombre_original del listado (dato del Excel).
// Nombre vacío (fila conservada sin nombre) → "Sin nombre registrado";
// NUNCA se inventa ni se concatena un nombre.
function mntTituloEngrase(r) {
  if (!r) return 'Sin nombre registrado';
  const n = r.nombre_original;
  if (n === null || n === undefined || String(n).trim() === '') return 'Sin nombre registrado';
  return String(n);
}

// Responsable: texto literal del Excel (columna F "Quien lo Hizo").
// NULL/vacío → null; nunca se infiere desde la fecha ni desde el elemento.
function mntResponsableEngrase(r) {
  if (!r) return null;
  const v = r.responsable_original;
  if (v === null || v === undefined || String(v).trim() === '') return null;
  return String(v);
}

// El registro tiene fecha de última mantención si existe la fecha
// normalizada O el texto fuente original. Nunca se decide por responsable.
function mntTieneFechaEngrase(r) {
  if (!r) return false;
  const n = r.ultima_mantencion_fecha;
  if (n !== null && n !== undefined && n !== '') return true;
  const o = r.ultima_mantencion_fecha_original;
  return !(o === null || o === undefined || o === '');
}

// Texto visible de la fecha: normalizada (dd-mm-aaaa) primero; si no existe
// pero hay texto fuente, se muestra el original sin reinterpretarlo; si no
// hay ninguna, null (la UI aplica "Sin fecha registrada").
function mntValorFechaEngrase(r) {
  if (!r) return null;
  if (r.ultima_mantencion_fecha !== null && r.ultima_mantencion_fecha !== undefined && r.ultima_mantencion_fecha !== '') {
    return mntFechaEngraseTexto(r.ultima_mantencion_fecha);
  }
  if (r.ultima_mantencion_fecha_original !== null && r.ultima_mantencion_fecha_original !== undefined && r.ultima_mantencion_fecha_original !== '') {
    return String(r.ultima_mantencion_fecha_original);
  }
  return null;
}

// Opciones de filtro de responsable derivadas de los datos reales (Set),
// SIN hardcodear nombres. El bucket "Sin responsable registrado" solo se
// ofrece si realmente existen filas sin responsable.
function mntOpcionesFiltrosEngrase(lista) {
  const responsables = new Set();
  let haySinResponsable = false;

  (Array.isArray(lista) ? lista : []).forEach(r => {
    const resp = mntResponsableEngrase(r);
    if (resp) responsables.add(resp);
    else haySinResponsable = true;
  });

  return {
    responsables: Array.from(responsables).sort((a, b) => a.localeCompare(b, 'es')),
    haySinResponsable
  };
}

// Aplica los tres filtros en cliente (AND), sin volver a Supabase.
// fecha: '' (todas) | 'con' | 'sin' — por ultima_mantencion_fecha o
// ultima_mantencion_fecha_original. responsable: '' (todos) | nombre real |
// bucket MNT_ENGRASE_RESP_SIN. NULL nunca se convierte en otro valor.
function mntFiltrarEngrase(lista) {
  const texto = (mantencionFiltrosEngrase.texto || '').trim().toLowerCase();
  const responsable = mantencionFiltrosEngrase.responsable || '';
  const fecha = mantencionFiltrosEngrase.fecha || '';

  return (Array.isArray(lista) ? lista : []).filter(r => {
    if (!r) return false;

    // Filtro por fecha de última mantención (normalizada o texto fuente).
    if (fecha) {
      const tiene = mntTieneFechaEngrase(r);
      if (fecha === 'con' && !tiene) return false;
      if (fecha === 'sin' && tiene) return false;
    }

    // Filtro por responsable (valor literal del Excel; NULL → bucket "sin").
    if (responsable) {
      const resp = mntResponsableEngrase(r) || '';
      if (responsable === MNT_ENGRASE_RESP_SIN) {
        if (resp !== '') return false;
      } else if (resp !== responsable) {
        return false;
      }
    }

    // Buscador (case-insensitive). NULL se ignora; nunca "null".
    if (texto) {
      const e = mntEngraseElemento(r);
      const campos = [
        r.numero_original,
        r.nombre_original,
        r.ubicacion_original,
        mntResponsableEngrase(r),
        e ? e.nombre_original : null,
        e ? e.codigo : null,
        e ? mntNombreUbicacion(e) : null
      ];
      const coincide = campos.some(c => {
        if (c === null || c === undefined || c === '') return false;
        return String(c).toLowerCase().indexOf(texto) !== -1;
      });
      if (!coincide) return false;
    }
    return true;
  });
}

// Buscador + filtros de responsable y fecha, derivados de los datos.
function mntFiltrosEngraseHTML(opciones) {
  const selResponsable = mantencionFiltrosEngrase.responsable || '';
  const selFecha = mantencionFiltrosEngrase.fecha || '';
  const haySeleccion = !!(mantencionFiltrosEngrase.texto || selResponsable || selFecha);

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-3 border border-slate-100 dark:border-slate-800">
      <div>
        <label for="mnt-buscar-engrase" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Buscar</label>
        <input id="mnt-buscar-engrase" type="text" value="${mntEsc(mantencionFiltrosEngrase.texto)}"
          oninput="mntOnBuscarEngrase(this.value)"
          placeholder="N.º, nombre, ubicación o responsable..."
          class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label for="mnt-filtro-responsable-engrase" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Quien lo hizo</label>
          <select id="mnt-filtro-responsable-engrase" onchange="mntOnFiltrarResponsableEngrase(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todos los responsables</option>
            ${opciones.responsables.map(resp => `<option value="${mntEsc(resp)}" ${resp === selResponsable ? 'selected' : ''}>${mntEsc(resp)}</option>`).join('')}
            ${opciones.haySinResponsable ? `<option value="${MNT_ENGRASE_RESP_SIN}" ${selResponsable === MNT_ENGRASE_RESP_SIN ? 'selected' : ''}>Sin responsable registrado</option>` : ''}
          </select>
        </div>
        <div>
          <label for="mnt-filtro-fecha-engrase" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Fecha de última mantención</label>
          <select id="mnt-filtro-fecha-engrase" onchange="mntOnFiltrarFechaEngrase(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todas las fechas</option>
            <option value="con" ${selFecha === 'con' ? 'selected' : ''}>Con fecha de última mantención</option>
            <option value="sin" ${selFecha === 'sin' ? 'selected' : ''}>Sin fecha de última mantención</option>
          </select>
        </div>
      </div>
      ${haySeleccion ? `
        <button onclick="mntLimpiarFiltrosEngrase()"
          class="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
          Limpiar filtros
        </button>
      ` : ''}
    </div>
  `;
}

// Cuadrícula de tarjetas (patrón validado en Elementos, Inventario, Baños,
// Pilas y TV).
function mntCuadriculaEngraseHTML(filtrados) {
  if (!filtrados || filtrados.length === 0) {
    return `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-1">
        <span class="text-3xl block">🔍</span>
        <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Sin resultados para los filtros aplicados</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Prueba con otro texto, responsable o fecha.</p>
      </div>
    `;
  }

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${filtrados.map(mntTarjetaEngraseHTML).join('')}
    </div>
  `;
}

// Tarjeta del REGISTRO del listado (una tarjeta por fila fuente). NO se
// muestra nota de migración (va solo en la ficha) ni UUID. La fecha y el
// responsable son datos independientes: el responsable solo se imprime si
// existe, con el encabezado real del Excel ("Quien lo hizo"); nunca
// "Responsable de última mantención".
function mntTarjetaEngraseHTML(r) {
  const numero = (r.numero_original !== null && r.numero_original !== undefined && r.numero_original !== '')
    ? String(r.numero_original) : null;
  const ubicacion = (r.ubicacion_original !== null && r.ubicacion_original !== undefined && r.ubicacion_original !== '')
    ? String(r.ubicacion_original) : null;
  const responsable = mntResponsableEngrase(r);
  const fechaTexto = mntValorFechaEngrase(r);

  return `
    <div onclick="abrirFichaEngrase('${mntEsc(r.id)}')"
      class="bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer card-hover group flex flex-col justify-between">
      <div>
        <div class="flex items-start justify-between mb-3">
          <div class="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-xl shrink-0">🚪</div>
          ${numero ? `<span class="text-[10px] font-black px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[60%]" title="N.º original: ${mntEsc(numero)}">N.º ${mntEsc(numero)}</span>` : ''}
        </div>
        <h4 class="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug line-clamp-2">${mntEsc(mntTituloEngrase(r))}</h4>
        ${ubicacion ? `<p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-2 flex items-center space-x-1.5 truncate"><span>📍</span><span class="truncate">Ubicación: ${mntEsc(ubicacion)}</span></p>` : ''}
        <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-1.5 flex items-center space-x-1.5"><span>🗓️</span><span>Fecha de última mantención: ${mntEsc(mntSinFecha(fechaTexto))}</span></p>
        ${responsable ? `<p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-1.5 flex items-center space-x-1.5 truncate"><span>👤</span><span class="truncate">Quien lo hizo: ${mntEsc(responsable)}</span></p>` : ''}
      </div>
      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold">
        <span class="text-slate-400 dark:text-slate-500">Ver ficha</span>

      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// Manejadores de filtros (solo re-render del listado, sin recargar la SPA)
// ------------------------------------------------------------
function mntOnBuscarEngrase(valor) {
  mantencionFiltrosEngrase.texto = valor || '';
  mntRefrescarListadoEngrase();
}

function mntOnFiltrarResponsableEngrase(valor) {
  mantencionFiltrosEngrase.responsable = valor || '';
  mntRefrescarListadoEngrase();
}

function mntOnFiltrarFechaEngrase(valor) {
  mantencionFiltrosEngrase.fecha = valor || '';
  mntRefrescarListadoEngrase();
}

// Rutina ÚNICA de reset del estado de filtros de Puertas / Engrase.
// La usan el cierre completo de la modal (cerrarMantencionSubapartado) y el
// botón "Limpiar filtros" (mntLimpiarFiltrosEngrase). No toca DOM ni consulta
// Supabase; solo restaura los valores iniciales del estado.
function mntResetFiltrosEngrase() {
  mantencionFiltrosEngrase.texto = '';
  mantencionFiltrosEngrase.responsable = '';
  mantencionFiltrosEngrase.fecha = '';
}

function mntLimpiarFiltrosEngrase() {
  mntResetFiltrosEngrase();
  // Vuelve a dibujar el panel completo para refrescar también los <select>.
  cargarPanelSubapartado('engrase');
}

// Actualiza únicamente la cuadrícula y el contador.
function mntRefrescarListadoEngrase() {
  const cont = document.getElementById('mnt-listado-engrase');
  const contador = document.getElementById('mnt-contador-engrase');
  if (!cont) return;

  const filtrados = mntFiltrarEngrase(mntEngraseBase);
  cont.innerHTML = mntCuadriculaEngraseHTML(filtrados);
  // "X de Y registros": las 47 filas son REGISTROS del listado; una de ellas
  // no tiene elemento físico asociado, por lo que no se afirma "47 puertas".
  if (contador) contador.textContent = `${filtrados.length} de ${mntEngraseBase.length} registros`;
}

// ------------------------------------------------------------
// Panel contenedor: decide entre listado y ficha (misma modal, sin modal
// sobre modal)
// ------------------------------------------------------------
function mntPanelEngraseHTML(meta, engrase, elementos) {
  mntEngraseBase = Array.isArray(engrase) ? engrase : [];
  mntEngraseElementos = Array.isArray(elementos) ? elementos : [];

  // El título grande ya lo muestra la cabecera de la modal.
  const encabezado = `
    <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
      <p class="text-[11px] text-slate-500 dark:text-slate-400">Sección de Mantención General</p>
      <span class="text-xs font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 px-3 py-1.5 rounded-xl">
        Fase 2 · Puertas / Engrase
      </span>
    </div>
  `;

  let cuerpo;
  if (mantencionEngraseSeleccionado) {
    // Ficha interna: se busca el registro en la base ya cargada (sin N+1 y
    // sin nueva consulta). Los filtros quedan guardados en estado.
    const registro = mntEngraseBase.find(r => r && r.id === mantencionEngraseSeleccionado) || null;
    cuerpo = `
      <div>
        <button onclick="cerrarFichaEngrase()"
          class="mb-4 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1.5">
          <span>←</span>
          <span>Volver al listado de puertas / engrase</span>
        </button>
        ${registro ? mntFichaEngraseHTML(registro) : `
          <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-2">
            <span class="text-3xl block">⚠️</span>
            <p class="text-sm font-bold text-slate-700 dark:text-slate-200">Registro no encontrado</p>
          </div>
        `}
      </div>
    `;
  } else if (mntEngraseBase.length === 0) {
    cuerpo = `
      <div class="mt-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-10 text-center space-y-2">
        <span class="text-4xl block">🚪</span>
        <h4 class="text-base font-black text-slate-700 dark:text-slate-200">No hay registros de engrase y aceitado</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400">Aún no existen registros del listado de puertas.</p>
      </div>
    `;
  } else {
    const opciones = mntOpcionesFiltrosEngrase(mntEngraseBase);
    const filtrados = mntFiltrarEngrase(mntEngraseBase);
    cuerpo = `
      <div class="mt-5 space-y-4">
        ${mntFiltrosEngraseHTML(opciones)}
        <p id="mnt-contador-engrase" class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
          ${filtrados.length} de ${mntEngraseBase.length} registros
        </p>
        <div id="mnt-listado-engrase">
          ${mntCuadriculaEngraseHTML(filtrados)}
        </div>
      </div>
    `;
  }

  return `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      ${encabezado}
      ${cuerpo}
    </div>
  `;
}

// ------------------------------------------------------------
// Ficha del registro (DENTRO de la modal del subapartado)
// ------------------------------------------------------------
// La ficha NO crea una segunda modal. Reemplaza el contenido del listado
// dentro de la misma modal de "Puertas / Engrase". Los filtros se conservan
// en estado (mantencionFiltrosEngrase) y al vuelven se repintan igual. No se
// recarga la SPA ni se consulta Supabase: el registro se busca en
// mntEngraseBase y el elemento relacionado en mntEngraseElementos.
function abrirFichaEngrase(id) {
  mantencionEngraseSeleccionado = id;
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;

  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'engrase') || { nombre: 'Puertas / Engrase', icono: '🚪' };
  panel.innerHTML = mntPanelEngraseHTML(meta, mntEngraseBase, mntEngraseElementos);

  // C2E-6: la ficha se renderiza de forma síncrona; el historial de
  // actividades se carga en este punto, ya con la ficha en el DOM (patrón
  // async de la ficha de Control). Solo lectura.
  const registro = mntEngraseBase.find(r => r && r.id === id) || null;
  if (registro) mntCargarActividadesEngrase(registro);
}

// Vuelve al listado conservando búsqueda, responsable y fecha seleccionados.
function cerrarFichaEngrase() {
  mantencionEngraseSeleccionado = null;
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;

  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'engrase') || { nombre: 'Puertas / Engrase', icono: '🚪' };
  panel.innerHTML = mntPanelEngraseHTML(meta, mntEngraseBase, mntEngraseElementos);
}

// Bloque DATOS DE ÚLTIMA MANTENCIÓN (fecha + responsable, datos
// INDEPENDIENTES).
// A) fecha normalizada → dd-mm-aaaa.
// B) sin normalizada pero con texto fuente → "Sin fecha registrada" +
//    "Fecha original del Excel" con el texto tal cual, más una aclaración
//    discreta de que no existe fecha normalizada (la precisión, ej. TEXTO,
//    se usa internamente; no se imprime).
// C) ambas NULL → "Sin fecha registrada".
// El responsable SIEMPRE se evalúa por separado: en Hoja1 hay filas con
// responsable y sin fecha; eso NO se convierte en una mantención fechada.
function mntBloqueUltimaMantencionEngraseHTML(r) {
  const hayNormalizada = r.ultima_mantencion_fecha !== null &&
    r.ultima_mantencion_fecha !== undefined && r.ultima_mantencion_fecha !== '';
  const hayOriginal = r.ultima_mantencion_fecha_original !== null &&
    r.ultima_mantencion_fecha_original !== undefined && r.ultima_mantencion_fecha_original !== '';

  let celdaFecha;
  if (hayNormalizada) {
    celdaFecha = mntCampoFichaHTML('Fecha de última mantención', mntFechaEngraseTexto(r.ultima_mantencion_fecha), true);
  } else if (hayOriginal) {
    celdaFecha = `
      ${mntCampoFichaHTML('Fecha de última mantención', null, true)}
      ${mntCampoFichaHTML('Fecha original del Excel', formatDate(r.ultima_mantencion_fecha_original))}
    `;
  } else {
    celdaFecha = mntCampoFichaHTML('Fecha de última mantención', null, true);
  }

  const aclaracionFecha = (!hayNormalizada && hayOriginal) ? `
    <p class="sm:col-span-2 lg:col-span-3 mt-1 text-[10px] text-slate-400 dark:text-slate-500">
      No existe fecha normalizada en el Excel; se conserva el texto original sin reinterpretarlo.
    </p>` : '';

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Datos de última mantención</h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${celdaFecha}
        ${mntCampoFichaHTML('Quien lo hizo', mntResponsableEngrase(r), false, true)}
        ${aclaracionFecha}
      </div>
      <p class="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
        La fecha y el responsable son campos independientes del listado: un responsable registrado no implica una mantención fechada.
      </p>
    </div>
  `;
}

// Bloque REGISTRAR ENGRASE / ACEITADO (C2E-6). Un evento fechado
// (append-only), NO un estado booleano: no se muestra próxima fecha,
// periodicidad ni lubricante porque no existen datos reales que los
// sustenten. El botón se pinta SOLO con permiso operativo
// (esAdminOperativoActual, mismo criterio que "Registrar cambio de pilas");
// la autoridad real sigue en la RPC backend. El bloque de "Anular registro"
// vive dentro del historial (mntEventoEngraseHTML).
function mntBloqueRegistrarEngraseHTML(r) {
  const puedeRegistrar = !!r && !!r.id &&
    typeof window.esAdminOperativoActual === 'function' &&
    window.esAdminOperativoActual() === true;

  const botonRegistrar = puedeRegistrar
    ? `<div class="pt-2 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onclick="abrirModalRegistroEngrase('${mntEsc(r.id)}')"
            class="mt-1 inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all">
            <span aria-hidden="true">🚪</span>
            <span>Registrar engrase / aceitado</span>
          </button>
        </div>`
    : '';

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Registrar engrase / aceitado</h4>
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-2">
        <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed">
          Cada engrase o aceitado se registra como un <span class="font-black">evento</span> con su
          fecha, autor y observación. No es un estado booleano: un registro puede acumular varias
          actividades a lo largo del tiempo.
        </p>
        ${botonRegistrar}
      </div>
    </div>
  `;
}

// Bloque HISTORIAL "Actividades registradas" (C2E-6, solo lectura).
// Contenedor con namespace propio de engrase; el contenido real se pinta de
// forma asíncrona desde mntCargarActividadesEngrase(r) DESPUÉS de insertar
// la ficha. Separa el historial operacional del bloque "Datos de última
// mantención" (Excel histórico).
function mntBloqueActividadesEngraseHTML() {
  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Actividades registradas</h4>
      <div id="mnt-historial-engrase" class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Cargando historial...</p>
      </div>
    </div>
  `;
}

// Ficha del registro: datos del listado + elemento vinculado (solo si
// existe FK) + datos de última mantención (Excel histórico) + registrar
// actividad + historial de actividades (C2E-6, carga asíncrona) + nota de
// migración + origen/trazabilidad. Sin campos editables.
function mntFichaEngraseHTML(r) {
  const e = mntEngraseElemento(r);

  // Ubicación canónica: valor REAL de ubicaciones.nombre vía el elemento
  // relacionado (embed de getElementos()). NO sustituye al dato original:
  // se muestra solo si existe y aporta un valor distinto.
  const ubicacionCanonica = e ? mntNombreUbicacion(e) : null;
  const hayUbicacionOriginal = r.ubicacion_original !== null &&
    r.ubicacion_original !== undefined && r.ubicacion_original !== '';
  const mostrarUbicacionOriginal = ubicacionCanonica !== null
    ? (hayUbicacionOriginal && String(r.ubicacion_original) !== String(ubicacionCanonica))
    : hayUbicacionOriginal;

  // Bloque del elemento vinculado: SOLO cuando existe FK resoluble. Para
  // la fila conservada sin nombre (elemento_id NULL) no se emite el bloque;
  // la ausencia de relación se trata como ausencia, no como error.
  const bloqueElemento = e ? `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Elemento mantenible vinculado</h4>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        ${mntCampoFichaHTML('Nombre del elemento', e.nombre_original)}
        ${mntCampoFichaHTML(mntEtiquetaCodigo(e), e.codigo)}
        ${mntCampoFichaHTML('Ubicación del elemento', mntNombreUbicacion(e))}
      </div>
      <p class="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
        Resuelto por FK real (elemento_id). Los datos del listado se muestran por separado; ninguno reemplaza al otro.
      </p>
    </div>` : '';

  // observaciones: NO existe columna Observaciones en el Excel; los valores
  // poblados son notas GENERADAS por la migración. Solo en ficha, como
  // "Nota de migración"; nunca en tarjetas.
  const notaMigracion = (r.observaciones !== null && r.observaciones !== undefined && String(r.observaciones).trim() !== '')
    ? String(r.observaciones) : null;

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-5 space-y-5">

      <!-- CABECERA FICHA -->
      <div class="flex items-start space-x-3">
        <div class="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-2xl shrink-0">🚪</div>
        <div class="min-w-0">
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Registro de engrase y aceitado</p>
          <h3 class="text-lg font-black text-slate-900 dark:text-white leading-snug break-words">${mntEsc(mntTituloEngrase(r))}</h3>
          ${(r.numero_original !== null && r.numero_original !== undefined && r.numero_original !== '') ? `<span class="inline-block mt-1.5 text-[10px] font-black px-2 py-1 rounded-full bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">N.º original: ${mntEsc(r.numero_original)}</span>` : ''}
        </div>
      </div>

      <!-- DATOS DEL REGISTRO -->
      <div>
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Datos del registro</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${mntCampoFichaHTML('Nombre', mntTituloEngrase(r))}
          ${mntCampoFichaHTML('N.º original', r.numero_original)}
          ${mntCampoFichaHTML('Ubicación original', r.ubicacion_original)}
          ${mostrarUbicacionOriginal ? mntCampoFichaHTML('Ubicación', ubicacionCanonica) : ''}
        </div>
        <p class="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
          Los datos mostrados provienen del listado de Puertas / Engrase (el Excel de origen).
        </p>
      </div>

      <!-- ELEMENTO MANTENIBLE VINCULADO (solo si existe FK resoluble) -->
      ${bloqueElemento}

      <!-- DATOS DE ÚLTIMA MANTENCIÓN (fecha y responsable independientes).
           Bloque del EXCEL HISTÓRICO: NO se reinterpreta como actividad
           registrada ni alimenta el historial operacional. -->
      ${mntBloqueUltimaMantencionEngraseHTML(r)}

      <!-- REGISTRAR ENGRASE / ACEITADO (C2E-6, evento append-only):
           escritura SOLO vía HistorialService.registrarEvento -->
      ${mntBloqueRegistrarEngraseHTML(r)}

      <!-- ACTIVIDADES REGISTRADAS (C2E-6, historial real de eventos
           registro_engrase / engrase_aceitado, carga asíncrona) -->
      ${mntBloqueActividadesEngraseHTML()}

      <!-- NOTA DE MIGRACIÓN (texto generado, no del cliente) -->
      ${notaMigracion ? `
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Nota de migración</h4>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
          <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-relaxed break-words">${mntEsc(notaMigracion)}</p>
          <p class="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
            Texto generado durante la migración; no proviene de una columna de observaciones del Excel.
          </p>
        </div>
      </div>` : ''}

      <!-- ORIGEN / TRAZABILIDAD (ej.: Hoja2 · Fila 2 · Celda nombre B2) -->
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Origen / trazabilidad</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          ${mntCampoFichaHTML('Archivo origen', mntArchivoOrigenEngrase(r))}
          ${mntCampoFichaHTML('Hoja origen', r.hoja_origen)}
          ${mntCampoFichaHTML('Fila origen', r.fila_origen)}
          ${mntCampoFichaHTML('Celda nombre', r.celda_nombre_origen)}
        </div>
      </div>
    </div>
  `;
}

// ==========================================================
// PUERTAS / ENGRASE Y ACEITADO — FASE C2E-6 (ACTIVIDADES)
// ==========================================================
// Sección operacional del subapartado 'engrase'. Un engrase/aceitado es un
// EVENTO fechado (append-only) en mantencion_historial con
// tipo_entidad 'registro_engrase', campo 'engrase_aceitado', accion
// 'evento'. NO existe estado operativo booleano, periodicidad, próxima
// fecha, lubricante, cantidad ni responsable de actividad (esos datos NO
// existen en la fuente real).
// ÚNICA vía de escritura de registro: HistorialService.registrarEvento(...)
// y ÚNICA vía de anulación: HistorialService.anularHistorial(...). SIN
// supabase.rpc() directo, SIN .insert()/.update()/.delete(), SIN
// localStorage ni mocks. El cliente envía tipoEntidad, entidadId, campo y
// observación (o historialId y motivo); autor y created_at se fijan
// server-side. El backend valida además que el registro pertenezca a los 47
// canónicos (los 15 duplicados de Fosas se rechazan server-side).
// Namespace, guards y pending flags PROPIOS de engrase: jamás se
// reutilizan ids ni flags de Pilas (mnt*Control*) ni de TV.
// Todo texto de BD mostrado pasa por mntEsc; los errores se muestran con
// textContent. Los UUID (id, entidad_id) NUNCA se muestran al usuario.

// -----------------------------------------------------------
// Estado y constantes
// -----------------------------------------------------------

// true mientras la RPC de registro de engrase está en vuelo. Guard
// EXCLUSIVO (nunca se reutilizan flags de Pilas/TV). Cerrar/ocultar la
// modal NO lo libera: solo lo libera la RPC al terminar.
let mntRegistroEngraseGuardando = false;

// BLOQUEO DE REINTENTO tras registro CONFIRMADO con refresco de historial
// fallido. Guarda el registroId cuya actividad YA quedó registrada pero
// cuyo releer del historial falló. Se limpia SOLO tras una lectura
// EXITOSA del historial de engrase_aceitado de ese registro (opción A en
// mntRefrescarHistorialEngrase; opción B en mntCargarActividadesEngrase).
let mntRegistroEngrasePendienteRefresco = null;

// Mismo patrón para la ANULACIÓN: guarda el historialId cuya anulación YA
// quedó registrada pero cuyo releer falló. Se limpia solo tras lectura
// exitosa que confirme ese historialId.
let mntAnulacionEngrasePendienteRefresco = null;

// true mientras la RPC de anulación de engrase está en vuelo.
let mntAnulacionEngraseGuardando = false;

const MNT_MODAL_REGISTRO_ENGRASE_ID = 'mnt-modal-registro-engrase-overlay';
const MNT_MODAL_ANULAR_ENGRASE_ID = 'mnt-modal-anular-engrase-overlay';

const MNT_AVISO_REFRESCO_REGISTRO_ENGRASE = 'La actividad quedó registrada correctamente, pero no fue posible actualizar el historial. No vuelvas a registrarla. Cierra y vuelve a abrir Puertas / Engrase.';
const MNT_AVISO_REFRESCO_ANULAR_ENGRASE = 'El registro quedó anulado correctamente, pero no fue posible actualizar el historial. No vuelvas a intentar anularlo. Cierra y vuelve a abrir Puertas / Engrase.';

const MNT_MENSAJES_ERROR_REGISTRO_ENGRASE = {
  SESION_INVALIDA: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
  NO_AUTORIZADO: 'No tienes permisos para registrar esta actividad.',
  CAMPO_NO_PERMITIDO: 'No se puede registrar esta actividad.',
  CONFIG_INCOMPLETA: 'La configuración de engrase y aceitado no está disponible.',
  ENTIDAD_NO_ENCONTRADA: 'Este registro ya no está disponible.',
  TIPO_NO_IMPLEMENTADO: 'Este tipo de registro aún no admite esta operación.',
  VALOR_INVALIDO: 'No fue posible validar la actividad.',
  VALOR_NO_PERMITIDO: 'Esta actividad no está permitida.'
};

const MNT_MENSAJES_ERROR_ANULAR_ENGRASE = {
  MOTIVO_REQUERIDO: 'Debes indicar el motivo de la anulación.',
  SESION_INVALIDA: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
  NO_AUTORIZADO: 'Solo un administrador permanente puede anular este registro.',
  REGISTRO_YA_ANULADO: 'Este registro ya fue anulado.',
  CAMPO_NO_PERMITIDO: 'Este registro no admite anulación.',
  CONFIG_INCOMPLETA: 'La configuración necesaria para anular este registro no está disponible.',
  ENTIDAD_NO_ENCONTRADA: 'El registro o la actividad asociada ya no está disponible.',
  TIPO_NO_IMPLEMENTADO: 'Este tipo de registro aún no admite anulación.',
  VALOR_INVALIDO: 'La anulación solicitada no es válida.',
  VALOR_NO_PERMITIDO: 'La anulación solicitada no está permitida.'
};

// Registro ORIGINAL de cada actividad de engrase anulable, poblado por el
// renderer (mntEventoEngraseHTML) en el mismo pintado que muestra el botón.
// Permite abrir la modal sin serializar BD en atributos HTML.
const mntEngraseEventosAnulables = new Map();

// -----------------------------------------------------------
// Renderer del evento de engrase/aceitado
// -----------------------------------------------------------
// Renderer EXCLUSIVO: NO interpreta valor_nuevo ni valor_anterior como
// booleanos (son detalle técnico del backend y NO se muestran). Solo:
// título del evento, fecha real (created_at server-side), autor y
// observación. Si ev.anulacion existe, el evento ORIGINAL sigue visible y
// se agrega el chip "ANULADO" más el bloque de anulación.
// Botón "Anular registro" SOLO para: evento engrase_aceitado real del
// dominio registro_engrase, aún NO anulado y con Administrador PERMANENTE
// (el backend exige es_administrador_permanente_actual()).
function mntEventoEngraseHTML(ev) {
  const registro = ev || {};
  const anulado = registro.anulacion !== null && registro.anulacion !== undefined;

  const observacionTexto = (typeof registro.observacion === 'string' && registro.observacion.trim() !== '')
    ? registro.observacion.trim()
    : 'Sin observación registrada';

  const autorTexto = (typeof (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot) === 'string' && (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot).trim() !== '')
    ? (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot).trim()
    : 'Autor no registrado';

  const chipAnulado = anulado
    ? `<span class="text-[10px] font-black px-2.5 py-1 rounded-full border bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900">ANULADO</span>`
    : '';

  const bloqueAnulacion = anulado
    ? mntBloqueAnulacionHTML(registro.anulacion, {
        texto: 'Esta actividad fue anulada y no se considera vigente.'
      })
    : '';

  // GATING del botón (SOLO lectura del rol en cliente; la autoridad
  // definitiva sigue siendo la RPC backend).
  const historialId = registro.id || null;
  const puedeAnular = !!historialId &&
    registro.tipo_entidad === 'registro_engrase' &&
    registro.campo === 'engrase_aceitado' &&
    registro.accion === 'evento' &&
    !anulado &&
    typeof window.esAdminPermanenteActual === 'function' &&
    window.esAdminPermanenteActual() === true;

  if (puedeAnular) {
    mntEngraseEventosAnulables.set(String(historialId), Object.assign({}, registro));
  }

  const botonAnular = puedeAnular
    ? `<div class="pt-2 border-t border-slate-100 dark:border-slate-700">
        <button type="button" onclick="abrirModalAnularEngrase('${mntEsc(String(historialId))}')"
          class="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all">
          <span aria-hidden="true">⛔</span>
          <span>Anular registro</span>
        </button>
      </div>`
    : '';

  return `
    <li class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs font-black text-slate-800 dark:text-slate-200">Engrase / aceitado</p>
        <span class="flex flex-wrap items-center gap-2">
          <span class="text-[10px] font-black px-2.5 py-1 rounded-full border bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900">
            Evento registrado
          </span>
          ${chipAnulado}
        </span>
      </div>
      <p class="text-xs font-semibold text-slate-600 dark:text-slate-400">
        ${mntEsc(mntFechaHoraRevisionTexto(registro.created_at))}
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Observación: ${mntEsc(observacionTexto)}
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Autor: ${mntEsc(autorTexto)}
      </p>
      ${botonAnular}
      ${bloqueAnulacion}
    </li>
  `;
}

// Carga ASÍNCRONA del historial de actividades del registro (solo
// lectura). Se invoca SIEMPRE después de insertar la ficha en el DOM.
// Antes de pintar se comprueba que el contenedor siga existiendo y que
// mantencionEngraseSeleccionado siga siendo r.id: si el usuario cerró la
// ficha o abrió otro registro, el resultado viejo NO se pinta.
async function mntCargarActividadesEngrase(r) {
  if (!r || !r.id) return;

  const contInicial = document.getElementById('mnt-historial-engrase');
  if (!contInicial) return;

  let eventos = null;
  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }
    // Única fuente: public.mantencion_historial filtrado por el dominio
    // EXACTO registro_engrase / engrase_aceitado (más reciente primero).
    eventos = await window.HistorialService.getRevisiones('registro_engrase', r.id, 'engrase_aceitado');
  } catch (e) {
    // La ficha pudo cambiar tras el await: se re-verifica antes de pintar.
    if (mantencionEngraseSeleccionado !== r.id) return;
    const cont = document.getElementById('mnt-historial-engrase');
    if (!cont) return;
    console.error('Error cargando las actividades de engrase/aceitado:', e);
    cont.textContent = 'No fue posible cargar las actividades registradas.';
    return;
  }

  // LECTURA EXITOSA ⇒ opción B: se levantan los bloqueos pendientes de
  // ESTE registro (tanto el de registro como el de anulación, si aplica).
  if (mntRegistroEngrasePendienteRefresco !== null &&
      mntRegistroEngrasePendienteRefresco === r.id) {
    mntRegistroEngrasePendienteRefresco = null;
  }
  if (mntAnulacionEngrasePendienteRefresco !== null &&
      Array.isArray(eventos) &&
      eventos.some(ev => ev && String(ev.id) === String(mntAnulacionEngrasePendienteRefresco))) {
    mntAnulacionEngrasePendienteRefresco = null;
  }

  // Ficha cambiada/cerrada durante la lectura: sin repintado.
  if (mantencionEngraseSeleccionado !== r.id) return;

  const cont = document.getElementById('mnt-historial-engrase');
  if (!cont) return;
  mntPintarHistorialEngrase(cont, eventos);
}

// Repintado ÚNICO del bloque de actividades (misma estructura en el loader
// inicial y en los dos refresh posteriores a una RPC).
function mntPintarHistorialEngrase(cont, eventos) {
  if (!cont) return;
  if (!Array.isArray(eventos) || eventos.length === 0) {
    cont.innerHTML = `
      <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
        Sin actividades de engrase / aceitado registradas.
      </p>
    `;
    return;
  }
  cont.innerHTML = `
    <p class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
      ${eventos.length} actividad(es) registrada(s) · más reciente primero
    </p>
    <div class="mt-3">${mntHistorialPaginadoHTML(eventos.length, 'Historial de engrase', `<ul class="space-y-3">
      ${mntOrdenarHistorialReciente(eventos).map(mntEventoEngraseHTML).join('')}
    </ul>`)}</div>
  `;
}

// Relectura ESPECÍFICA del historial de engrase_aceitado tras el éxito de
// una RPC (opción A de limpieza del bloqueo pendiente). NO se releen
// listado_engrase_aceitado: un evento no modifica el listado original.
// Devuelve true SOLO cuando la lectura terminó bien (y, si la ficha sigue
// en ESTE registro y su contenedor existe, se repintó el bloque). Si el
// usuario cambió o cerró la ficha durante la RPC, NO se reabre ni se pinta
// sobre otro registro (eso NO es un fallo).
async function mntRefrescarHistorialEngrase(registroId) {
  if (!registroId) return false;

  let eventos = null;
  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }
    // force=true: obliga a releer Supabase (estado fresco tras la escritura).
    eventos = await window.HistorialService.getRevisiones('registro_engrase', registroId, 'engrase_aceitado', true);
  } catch (e) {
    // Lectura fallida ⇒ refresco fallido (la escritura YA ocurrió). El
    // bloqueo pendiente NO se limpia.
    console.error('Error releyendo las actividades de engrase tras la escritura:', e);
    return false;
  }

  // LECTURA EXITOSA ⇒ se levantan los bloqueos pendientes de ESTE registro.
  if (mntRegistroEngrasePendienteRefresco !== null &&
      mntRegistroEngrasePendienteRefresco === registroId) {
    mntRegistroEngrasePendienteRefresco = null;
  }
  if (mntAnulacionEngrasePendienteRefresco !== null &&
      Array.isArray(eventos) &&
      eventos.some(ev => ev && String(ev.id) === String(mntAnulacionEngrasePendienteRefresco))) {
    mntAnulacionEngrasePendienteRefresco = null;
  }

  // Ficha cambiada/cerrada durante la RPC: solo datos frescos, sin repintado.
  if (mantencionEngraseSeleccionado !== registroId) return true;

  const cont = document.getElementById('mnt-historial-engrase');
  if (!cont) return true;

  mntPintarHistorialEngrase(cont, eventos);
  return true;
}

// -----------------------------------------------------------
// Modal: REGISTRAR ENGRASE / ACEITADO
// -----------------------------------------------------------

// Crea la modal UNA sola vez. Si ya existe, devuelve la misma.
function asegurarModalRegistroEngrase() {
  let overlay = document.getElementById(MNT_MODAL_REGISTRO_ENGRASE_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MNT_MODAL_REGISTRO_ENGRASE_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Registrar engrase / aceitado');
  overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overflow-y-auto';
  overlay.onclick = function (ev) {
    // Solo el clic en el fondo cierra; el clic dentro de la caja no burbujea.
    // UX-02: fondo sin cierre.
  };
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 my-auto text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
      <div id="mnt-modal-registro-engrase"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// Escape cierra PRIMERO la modal de registro de engrase (fase de captura).
// Aunque la RPC esté en vuelo puede ocultar la modal, pero NO libera el
// guard ⇒ no se puede iniciar otro registro hasta que esa RPC termine.
function mntTeclaEscapeRegistroEngrase(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

// Contenido de la modal: contexto REAL del registro (nombre, ubicación,
// N.º si existe) + explicación del evento + SOLO un campo de observación
// opcional. EXPLÍCITAMENTE sin input de fecha (la fecha real es
// mantencion_historial.created_at, server-side) y sin periodicidad,
// lubricante, cantidad ni responsable: esos datos NO existen en la fuente.
function mntContenidoModalRegistroEngraseHTML(r, pendienteRefresco) {
  const ubicacionTexto = (r.ubicacion_original !== null && r.ubicacion_original !== undefined && String(r.ubicacion_original).trim() !== '')
    ? r.ubicacion_original
    : mntNombreUbicacion(mntEngraseElemento(r));

  return `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center space-x-2.5 min-w-0">
        <span class="text-2xl shrink-0">🚪</span>
        <div class="min-w-0">
          <h3 class="text-base font-bold text-slate-800 dark:text-white truncate">Registrar engrase / aceitado</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate">Hotel & Centro de Eventos El Almendro</p>
        </div>
      </div>
      <button type="button" onclick="cerrarModalRegistroEngrase()"
        class="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold">&times;</button>
    </div>

    <div class="mt-3 space-y-1.5">
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Registro: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntTituloEngrase(r))}</span>
      </p>
      ${(r.numero_original !== null && r.numero_original !== undefined && String(r.numero_original).trim() !== '') ? `
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        N.º original: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(r.numero_original)}</span>
      </p>` : ''}
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Ubicación: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(ubicacionTexto))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
        Se registrará un evento con la fecha y el autor actuales.
        Este registro no modifica los datos históricos del Excel.
      </p>
    </div>

    <form onsubmit="mntEnviarRegistroEngrase(event)" class="mt-4 space-y-3.5">
      <input type="hidden" id="mnt-registro-engrase-id" value="${mntEsc(r.id)}">

      <div>
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Observación (opcional)</label>
        <textarea id="mnt-registro-engrase-observacion" rows="3"
          placeholder="Sin observación registrada si lo dejas vacío"
          class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          La fecha y el autor de la actividad se registran automáticamente en el servidor.
        </p>
      </div>

      <!-- Mensaje inline de error. NO se muestra éxito salvo que
           Supabase confirme la operación. -->
      <div id="mnt-registro-engrase-error"
        class="hidden rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
      </div>

      <!-- Aviso INFORMATIVO: actividad CONFIRMADA + refresco de historial
           fallido. Caja azul, DISTINTA del recuadro rose de error de RPC. -->
      <div id="mnt-registro-engrase-aviso" class="${pendienteRefresco ? '' : 'hidden'} rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-xs font-bold text-blue-800 dark:text-blue-200 leading-relaxed">${pendienteRefresco ? mntEsc(MNT_AVISO_REFRESCO_REGISTRO_ENGRASE) : ''}</div>

      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2.5">
        <button type="button" onclick="cerrarModalRegistroEngrase()"
          class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" id="mnt-registro-engrase-submit" ${pendienteRefresco ? 'disabled' : ''}
          class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-blue-600">
          <span id="mnt-registro-engrase-submit-label">${pendienteRefresco ? 'Actividad registrada' : 'Registrar actividad'}</span>
        </button>
      </div>
    </form>
  `;
}

// Abre la modal para el registro indicado. El contexto sale del objeto REAL
// de mntEngraseBase (leído desde Supabase), nunca de texto de la interfaz.
function abrirModalRegistroEngrase(registroId) {
  // Anti doble RPC: si hay un registro en vuelo NO se permite iniciar otro.
  if (mntRegistroEngraseGuardando) {
    console.warn('mntRegistroEngraseGuardando activo: se omite abrir un nuevo registro de engrase.');
    return;
  }

  const id = typeof registroId === 'string' ? registroId.trim() : '';
  if (!id) return;

  const registro = mntEngraseBase.find(r => r && r.id === id) || null;
  if (!registro || !registro.id) return;

  // Permiso UX (mismo criterio que el botón de la ficha). La autoridad real
  // sigue en la RPC.
  if (typeof window.esAdminOperativoActual !== 'function' ||
      window.esAdminOperativoActual() !== true) {
    console.warn('Sin permiso operativo: se omite abrir el modal de registro de engrase.');
    return;
  }

  const overlay = asegurarModalRegistroEngrase();
  const cont = document.getElementById('mnt-modal-registro-engrase');
  if (!overlay || !cont) return;

  // Si la actividad de ESTE registro YA quedó registrada y solo falló el
  // refresco del historial, la modal se abre en estado "ya registrado".
  const pendienteRefresco = mntRegistroEngrasePendienteRefresco !== null &&
    mntRegistroEngrasePendienteRefresco === registro.id;

  cont.innerHTML = mntContenidoModalRegistroEngraseHTML(registro, pendienteRefresco);
  overlay.classList.remove('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeRegistroEngrase, true);
  document.addEventListener('keydown', mntTeclaEscapeRegistroEngrase, true);

  if (!pendienteRefresco) {
    const textarea = document.getElementById('mnt-registro-engrase-observacion');
    if (textarea && typeof textarea.focus === 'function') textarea.focus();
  }
}

// Oculta la modal y retira SOLO su listener de Escape. NO libera el guard.
function cerrarModalRegistroEngrase() {
  const overlay = document.getElementById(MNT_MODAL_REGISTRO_ENGRASE_ID);
  if (overlay) overlay.classList.add('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeRegistroEngrase, true);
}

function mntMostrarErrorRegistroEngrase(mensaje) {
  const caja = document.getElementById('mnt-registro-engrase-error');
  if (!caja) return;
  caja.textContent = mensaje;   // textContent: nunca HTML de error
  caja.classList.remove('hidden');
}

function mntOcultarErrorRegistroEngrase() {
  const caja = document.getElementById('mnt-registro-engrase-error');
  if (!caja) return;
  caja.textContent = '';
  caja.classList.add('hidden');
}

function mntMostrarAvisoRegistroEngrase() {
  const caja = document.getElementById('mnt-registro-engrase-aviso');
  if (!caja) return;
  caja.textContent = MNT_AVISO_REFRESCO_REGISTRO_ENGRASE;
  caja.classList.remove('hidden');
}

function mntMarcarSubmitRegistroEngraseRegistrado() {
  const btn = document.getElementById('mnt-registro-engrase-submit');
  const etiqueta = document.getElementById('mnt-registro-engrase-submit-label');
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Actividad registrada';
}

// Ruta de ERROR: la RPC terminó (con fallo), por lo que SÍ se libera el
// guard y se restaura el botón para poder reintentar. La modal PERMANECE
// ABIERTA. En esta ruta NO se confirmó ninguna escritura.
function mntRestaurarSubmitRegistroEngrase() {
  mntRegistroEngraseGuardando = false;
  const btn = document.getElementById('mnt-registro-engrase-submit');
  const etiqueta = document.getElementById('mnt-registro-engrase-submit-label');
  if (btn) btn.disabled = false;
  if (etiqueta) etiqueta.textContent = 'Registrar actividad';
}

// SUBMIT: única escritura de registro de engrase desde la vista, vía
// HistorialService.registrarEvento con tipoEntidad 'registro_engrase' y
// campo 'engrase_aceitado'. Observación: trim() o null si queda vacía.
// NO se envía autor, fecha, accion, valor_nuevo, usuario ni tabla.
async function mntEnviarRegistroEngrase(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  // Anti doble envío: mientras la RPC está en vuelo se ignora cualquier
  // segundo submit (el botón además queda deshabilitado).
  if (mntRegistroEngraseGuardando) return;

  const cont = document.getElementById('mnt-modal-registro-engrase');
  if (!cont) return;

  const inputRegistro = document.getElementById('mnt-registro-engrase-id');
  const registroId = inputRegistro ? String(inputRegistro.value || '') : '';
  if (!registroId) return;

  // Si la actividad de ESTE registro YA quedó registrada y solo falló el
  // refresco del historial, aquí NO se ejecuta ninguna RPC.
  if (mntRegistroEngrasePendienteRefresco !== null &&
      mntRegistroEngrasePendienteRefresco === registroId) {
    console.warn('Actividad de engrase ya registrada con refresco pendiente: se omite un segundo envío.');
    return;
  }

  // --- Observación opcional (texto con trim o null; nunca inventada) ---
  const textarea = document.getElementById('mnt-registro-engrase-observacion');
  const observacion = (textarea && typeof textarea.value === 'string' && textarea.value.trim() !== '')
    ? textarea.value.trim()
    : null;

  // --- Bloqueo de doble envío + estado "Registrando..." ---
  const btn = document.getElementById('mnt-registro-engrase-submit');
  const etiqueta = document.getElementById('mnt-registro-engrase-submit-label');
  mntRegistroEngraseGuardando = true;
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Registrando...';
  mntOcultarErrorRegistroEngrase();

  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }

    // ÚNICA escritura. Solo tipoEntidad, entidadId, campo y observación.
    await window.HistorialService.registrarEvento({
      tipoEntidad: 'registro_engrase',
      entidadId: registroId,
      campo: 'engrase_aceitado',
      observacion: observacion
    });
  } catch (err) {
    // Detalle técnico SOLO en consola; en la modal, mensaje amigable.
    console.error('Error registrando la actividad de engrase/aceitado:', err);
    const codigo = err && err.codigo;
    const mensaje = MNT_MENSAJES_ERROR_REGISTRO_ENGRASE[codigo] || 'No fue posible registrar la actividad.';
    mntMostrarErrorRegistroEngrase(mensaje);
    mntRestaurarSubmitRegistroEngrase();
    return;
  }

  // ÉXITO DE LA RPC: la actividad YA quedó registrada en
  // mantencion_historial (append-only, autor y fecha server-side; el
  // listado original NO se modifica). Desde este punto NINGÚN fallo
  // posterior puede presentarse como fallo de escritura.
  let refrescoOk = false;
  try {
    refrescoOk = (await mntRefrescarHistorialEngrase(registroId)) === true;
  } catch (err) {
    console.error('Error inesperado refrescando el historial de engrase:', err);
    refrescoOk = false;
  } finally {
    mntRegistroEngraseGuardando = false;
  }

  // RUTA B — RPC exitosa + refresco exitoso: solo se repintó el bloque de
  // actividades (datos frescos) y se cierra la modal.
  if (refrescoOk) {
    cerrarModalRegistroEngrase();
    return;
  }

  // RUTA C — RPC exitosa + refresco fallido: la modal PERMANECE ABIERTA
  // con el aviso inequívoco; el botón queda "Actividad registrada" y
  // cualquier nuevo envío de este registro queda bloqueado.
  mntRegistroEngrasePendienteRefresco = registroId;
  mntMostrarAvisoRegistroEngrase();
  mntMarcarSubmitRegistroEngraseRegistrado();
}

// -----------------------------------------------------------
// Modal: ANULAR REGISTRO DE ACTIVIDAD
// -----------------------------------------------------------
// La anulación NO elimina nada: el evento original (fecha, autor y
// observación) se conserva y se agrega el estado ANULADO con motivo,
// quién anuló y fecha de anulación. ÚNICA vía: HistorialService.anularHistorial
// ({ historialId, motivo }). El backend NO recalcula ningún estado
// operativo (no existe) ni modifica el listado original.
// Exige Administrador PERMANENTE (backend: es_administrador_permanente_actual).

// Crea la modal UNA sola vez.
function asegurarModalAnularEngrase() {
  let overlay = document.getElementById(MNT_MODAL_ANULAR_ENGRASE_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MNT_MODAL_ANULAR_ENGRASE_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Anular registro de actividad');
  overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overflow-y-auto';
  overlay.onclick = function (ev) {
    // UX-02: fondo sin cierre.
  };
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 my-auto text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
      <div id="mnt-modal-anular-engrase"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function mntTeclaEscapeAnularEngrase(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

// Contenido de la modal: contexto REAL del evento original (fecha, autor y
// observación) + contexto del registro del listado SOLO si está disponible
// en mntEngraseBase + texto de trazabilidad + advertencia de que esta
// anulación NO modifica los datos históricos del Excel + textarea del
// motivo OBLIGATORIO. NO muestra valor_nuevo (detalle técnico del backend).
function mntContenidoModalAnularEngraseHTML(registro, r, pendienteRefresco) {
  const ev = registro || {};

  const observacionTexto = (typeof ev.observacion === 'string' && ev.observacion.trim() !== '')
    ? ev.observacion.trim()
    : 'Sin observación registrada';

  const autorTexto = (typeof (window.UsuariosService?.nombreParaMostrar?.(ev,'autor_nombre_snapshot') ?? ev.autor_nombre_snapshot) === 'string' && (window.UsuariosService?.nombreParaMostrar?.(ev,'autor_nombre_snapshot') ?? ev.autor_nombre_snapshot).trim() !== '')
    ? (window.UsuariosService?.nombreParaMostrar?.(ev,'autor_nombre_snapshot') ?? ev.autor_nombre_snapshot).trim()
    : 'Autor no registrado';

  let bloqueRegistro = '';
  if (r && r.id) {
    const ubicacionTexto = (r.ubicacion_original !== null && r.ubicacion_original !== undefined && String(r.ubicacion_original).trim() !== '')
      ? r.ubicacion_original
      : mntNombreUbicacion(mntEngraseElemento(r));
    bloqueRegistro = `
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Registro: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntTituloEngrase(r))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Ubicación: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(ubicacionTexto))}</span>
      </p>
    `;
  }

  return `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center space-x-2.5 min-w-0">
        <span class="text-2xl shrink-0">⛔</span>
        <div class="min-w-0">
          <h3 class="text-base font-bold text-slate-800 dark:text-white truncate">Anular registro de actividad</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate">Hotel & Centro de Eventos El Almendro</p>
        </div>
      </div>
      <button type="button" onclick="cerrarModalAnularEngrase()"
        class="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold">&times;</button>
    </div>

    <div class="mt-3 space-y-2">
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed">
        Esta acción invalidará esta actividad de engrase / aceitado, pero conservará el evento original para trazabilidad.
      </p>
      <div class="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-[11px] font-bold text-blue-800 dark:text-blue-200 leading-relaxed">
        Esta anulación no modifica los datos históricos del Excel de Puertas / Engrase.
      </div>

      <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 pt-1">Actividad original</p>
      ${bloqueRegistro}
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Fecha: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntFechaHoraRevisionTexto(ev.created_at))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Autor original: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(autorTexto)}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Observación original: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(observacionTexto)}</span>
      </p>
    </div>

    <form onsubmit="mntEnviarAnularEngrase(event)" class="mt-4 space-y-3.5">
      <!-- IDs reales: historialId (clave de la anulación y del pending
           flag) y registroId REAL (ev.entidad_id, SOLO para el refresh
           visual; NO se envía a la RPC). NUNCA se infieren de la UI. -->
      <input type="hidden" id="mnt-anular-engrase-id" value="${mntEsc(ev.id)}">
      <input type="hidden" id="mnt-anular-engrase-registro-id" value="${mntEsc(ev.entidad_id)}">

      <div>
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Motivo de anulación *</label>
        <textarea id="mnt-anular-engrase-motivo" rows="3"
          placeholder="Indica por qué se anula este registro"
          class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"></textarea>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          El motivo es obligatorio y queda registrado en la trazabilidad de la anulación.
        </p>
      </div>

      <!-- Mensaje inline de error. NO se muestra éxito salvo que
           Supabase confirme la operación. -->
      <div id="mnt-anular-engrase-error"
        class="hidden rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
      </div>

      <!-- Aviso INFORMATIVO: anulación CONFIRMADA + refresco fallido. -->
      <div id="mnt-anular-engrase-aviso" class="${pendienteRefresco ? '' : 'hidden'} rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-xs font-bold text-blue-800 dark:text-blue-200 leading-relaxed">${pendienteRefresco ? mntEsc(MNT_AVISO_REFRESCO_ANULAR_ENGRASE) : ''}</div>

      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2.5">
        <button type="button" onclick="cerrarModalAnularEngrase()"
          class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" id="mnt-anular-engrase-submit" ${pendienteRefresco ? 'disabled' : ''}
          class="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-rose-600">
          <span id="mnt-anular-engrase-submit-label">${pendienteRefresco ? 'Registro anulado' : 'Anular registro'}</span>
        </button>
      </div>
    </form>
  `;
}

// Abre la modal para el registro indicado. El contexto sale del evento
// ORIGINAL registrado por el renderer: nada se infiere del texto de la UI.
function abrirModalAnularEngrase(historialId) {
  // Anti doble RPC: si hay una anulación en vuelo NO se permite iniciar otra.
  if (mntAnulacionEngraseGuardando) {
    console.warn('mntAnulacionEngraseGuardando activo: se omite abrir una nueva anulación de engrase.');
    return;
  }

  const id = typeof historialId === 'string' ? historialId.trim() : '';
  if (!id) return;

  const registro = mntEngraseEventosAnulables.get(id);
  if (!registro || !registro.id) {
    console.warn('Anulación de engrase: actividad no disponible en memoria, se omite abrir la modal.');
    return;
  }
  // Sin registroId REAL no hay forma legítima de refrescar el historial
  // tras la escritura: mejor no abrir que arriesgar un refresh incorrecto.
  if (!registro.entidad_id) {
    console.warn('Anulación de engrase: la actividad no tiene entidad_id, se omite abrir la modal.');
    return;
  }

  const overlay = asegurarModalAnularEngrase();
  const cont = document.getElementById('mnt-modal-anular-engrase');
  if (!overlay || !cont) return;

  // Contexto del registro SOLO desde datos reales ya leídos; la modal
  // funciona igual sin él.
  const r = mntEngraseBase.find(x => x && x.id === registro.entidad_id) || null;

  // Si la anulación de ESTE registro YA quedó registrada y solo falló el
  // refresco, la modal se abre en estado "ya anulado".
  const pendienteRefresco = mntAnulacionEngrasePendienteRefresco !== null &&
    mntAnulacionEngrasePendienteRefresco === String(registro.id);

  cont.innerHTML = mntContenidoModalAnularEngraseHTML(registro, r, pendienteRefresco);
  overlay.classList.remove('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeAnularEngrase, true);
  document.addEventListener('keydown', mntTeclaEscapeAnularEngrase, true);

  if (!pendienteRefresco) {
    const textarea = document.getElementById('mnt-anular-engrase-motivo');
    if (textarea && typeof textarea.focus === 'function') textarea.focus();
  }
}

// Oculta la modal y retira SOLO su listener de Escape. NO libera el guard.
function cerrarModalAnularEngrase() {
  const overlay = document.getElementById(MNT_MODAL_ANULAR_ENGRASE_ID);
  if (overlay) overlay.classList.add('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeAnularEngrase, true);
}

function mntMostrarErrorAnularEngrase(mensaje) {
  const caja = document.getElementById('mnt-anular-engrase-error');
  if (!caja) return;
  caja.textContent = mensaje;   // textContent: nunca HTML de error
  caja.classList.remove('hidden');
}

function mntOcultarErrorAnularEngrase() {
  const caja = document.getElementById('mnt-anular-engrase-error');
  if (!caja) return;
  caja.textContent = '';
  caja.classList.add('hidden');
}

function mntMostrarAvisoAnularEngrase() {
  const caja = document.getElementById('mnt-anular-engrase-aviso');
  if (!caja) return;
  caja.textContent = MNT_AVISO_REFRESCO_ANULAR_ENGRASE;
  caja.classList.remove('hidden');
}

function mntMarcarSubmitAnularEngraseAnulado() {
  const btn = document.getElementById('mnt-anular-engrase-submit');
  const etiqueta = document.getElementById('mnt-anular-engrase-submit-label');
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Registro anulado';
}

// Ruta de ERROR: la RPC terminó (con fallo), por lo que SÍ se libera el
// guard y se restaura el botón para poder reintentar. La modal PERMANECE
// ABIERTA. En esta ruta NO se confirmó ninguna escritura.
function mntRestaurarSubmitAnularEngrase() {
  mntAnulacionEngraseGuardando = false;
  const btn = document.getElementById('mnt-anular-engrase-submit');
  const etiqueta = document.getElementById('mnt-anular-engrase-submit-label');
  if (btn) btn.disabled = false;
  if (etiqueta) etiqueta.textContent = 'Anular registro';
}

// SUBMIT: única escritura de anulación de engrase desde la vista, vía
// HistorialService.anularHistorial({ historialId, motivo }). El motivo se
// valida localmente con trim() ANTES de la RPC (vacío ⇒ error local, sin
// llamada). NO se envía registroId, entidad, tipo, campo, acción, autor,
// fecha ni estado: todo lo resuelve el backend.
async function mntEnviarAnularEngrase(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  // Anti doble envío: mientras la RPC está en vuelo se ignora cualquier
  // segundo submit.
  if (mntAnulacionEngraseGuardando) return;

  const cont = document.getElementById('mnt-modal-anular-engrase');
  if (!cont) return;

  const inputHistorial = document.getElementById('mnt-anular-engrase-id');
  const historialId = inputHistorial ? String(inputHistorial.value || '') : '';
  if (!historialId) return;

  const inputRegistro = document.getElementById('mnt-anular-engrase-registro-id');
  const registroId = inputRegistro ? String(inputRegistro.value || '') : '';

  // Si la anulación de ESTE registro YA quedó registrada y solo falló el
  // refresco del historial, aquí NO se ejecuta ninguna RPC.
  if (mntAnulacionEngrasePendienteRefresco !== null &&
      mntAnulacionEngrasePendienteRefresco === historialId) {
    console.warn('Actividad de engrase ya anulada con refresco pendiente: se omite un segundo envío.');
    return;
  }

  // --- Motivo (obligatorio; trim ANTES de la RPC) ---
  const textarea = document.getElementById('mnt-anular-engrase-motivo');
  const motivo = (textarea && typeof textarea.value === 'string')
    ? textarea.value.trim()
    : '';
  if (!motivo) {
    mntMostrarErrorAnularEngrase(MNT_MENSAJES_ERROR_ANULAR_ENGRASE.MOTIVO_REQUERIDO);
    return;
  }

  // --- Bloqueo de doble envío + estado "Anulando..." ---
  const btn = document.getElementById('mnt-anular-engrase-submit');
  const etiqueta = document.getElementById('mnt-anular-engrase-submit-label');
  mntAnulacionEngraseGuardando = true;
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Anulando...';
  mntOcultarErrorAnularEngrase();

  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }

    // ÚNICA escritura. Solo historialId + motivo; registroId NO viaja a la
    // RPC (se usa más abajo, únicamente, para el refresh visual).
    await window.HistorialService.anularHistorial({
      historialId: historialId,
      motivo: motivo
    });
  } catch (err) {
    // Detalle técnico SOLO en consola; en la modal, mensaje amigable.
    // REGISTRO_YA_ANULADO se presenta como fallo informativo: NO se trata
    // como éxito ni se re-ejecuta ninguna RPC automáticamente.
    console.error('Error anulando la actividad de engrase:', err);
    const codigo = err && err.codigo;
    const mensaje = MNT_MENSAJES_ERROR_ANULAR_ENGRASE[codigo] || 'No fue posible anular el registro.';
    mntMostrarErrorAnularEngrase(mensaje);
    mntRestaurarSubmitAnularEngrase();
    return;
  }

  // ÉXITO DE LA RPC: la anulación YA quedó registrada en
  // mantencion_historial_anulaciones. El backend NO recalcula ningún estado
  // (no existe estado operativo en engrase) ni modifica el listado original.
  let refrescoOk = false;
  try {
    refrescoOk = (await mntRefrescarHistorialEngrase(registroId)) === true;
  } catch (err) {
    console.error('Error inesperado refrescando el historial tras la anulación de engrase:', err);
    refrescoOk = false;
  } finally {
    mntAnulacionEngraseGuardando = false;
  }

  // RUTA B — RPC exitosa + refresco exitoso: solo se repintó el bloque de
  // actividades (evento original visible + chip ANULADO + trazabilidad, y
  // sin botón). Se cierra la modal.
  if (refrescoOk) {
    cerrarModalAnularEngrase();
    return;
  }

  // RUTA C — RPC exitosa + refresco fallido: la modal PERMANECE ABIERTA
  // con el aviso inequívoco; el botón queda "Registro anulado" y cualquier
  // nueva anulación de este registro queda bloqueada.
  mntAnulacionEngrasePendienteRefresco = historialId;
  mntMostrarAvisoAnularEngrase();
  mntMarcarSubmitAnularEngraseAnulado();
}

// ==========================================================
// FOSAS Y ALCANTARILLADO — FASE 2.7
// ==========================================================
// Vista propia del subapartado 'fosas'. La preview genérica de Fase 1 ya NO
// aparece para este subapartado.
//
// Fuente: _LISTA FOSAS DE ALCANTARILLADOS.xlsx →
// - fosas_alcantarillado      → registros principales (contador del panel);
// - fosas_mantencion_fuente    → historial fuente (fechas válidas + el caso
//                                N8, valor 0, que NO es una fecha);
// - contactos_servicio_fosas   → contactos GENERALES del subapartado;
// - comentarios_excel          → comentarios del mismo archivo.
// Todo llega desde getFosas() (4 consultas, sin N+1) y getElementos().
//
// Convenciones de datos:
// - El contador usa SIEMPRE mntFosasBase.length (registros principales);
//   NUNCA se hardcodea el total ni se suman fuente / mantenciones /
//   comentarios / contactos al contador principal.
// - Relación fosa → elemento SOLO por FK real (fosa.elemento_id ===
//   elemento.id), resuelta en cliente contra mntFosasElementos (copia de
//   getElementos() en el cargador): SIN depender de mntElementosBase, SIN N+1
//   y SIN consultas por ficha.
// - Historial SOLO desde fosas_mantencion_fuente con es_fecha_valida ===
//   true. N8 (valor_original = 0, fecha_precision = VALOR_NO_FECHA) NO es
//   una fecha y NO cuenta como mantención. NO se llama getMantenciones() ni
//   se construye un segundo historial desde public.mantenciones.
// - Evento → comentarios por comentario.mantencion_id ===
//   evento.mantencion_id (relación principal; NUNCA por texto ni por fecha).
// - Comentario sin mantencion_id → primero por celda_origen contra los
//   datos fuente NO normalizables del mismo elemento; si no coincide, queda
//   en COMENTARIOS GENERALES DEL EXCEL. Ningún comentario se pierde ni se
//   duplica.
// - comentario_original puede traer <br>: se convierten a saltos lógicos,
//   se escapa el texto y los saltos se devuelven como <br> (sin XSS y sin
//   mostrar "<br>" literal).
// - capacidad_original SIEMPRE se muestra; capacidad_litros es el dato
//   normalizado y capacidad_aproximada = true solo agrega el badge
//   "Aproximada" (NO significa error). NO se infieren litros si es NULL.
// - categoria_original queda INTACTA: solo se agrega una etiqueta de
//   presentación (MNT_CATEGORIAS_FOSA).
// - observaciones de fosas_alcantarillado están NULL en los registros: no
//   se crea bloque vacío. observaciones de fosas_mantencion_fuente es una
//   NOTA DE MIGRACIÓN y se muestra únicamente cuando existe.
// - Los contactos son GENERALES: se muestran UNA sola vez, debajo de la
//   cuadrícula, y nunca dentro de las fichas.
// - Las 15 filas Hoja2 del archivo de Fosas viven en
//   listado_engrase_aceitado (Puertas / Engrase): NO se consultan aquí.
// - Listado, ficha y datos importados SON SOLO LECTURA (sin
//   INSERT/UPDATE/DELETE y sin supabase.rpc() directo). Única excepción
//   operacional (Fase C2F-7): registrar/anular ACTIVIDADES en el sistema
//   exclusivamente vía HistorialService (ver la sección C2F-7 al final del
//   apartado de Fosas); jamás se escribe sobre las tablas importadas.
// - No se muestran UUID (id, elemento_id, mantencion_id, importacion_id,
//   proveedor_id, created_at).

// Etiquetas de PRESENTACIÓN para fosas_alcantarillado.categoria_original.
// Solo cambia lo visible: categoria_original nunca se modifica ni se
// sobrescribe. Valor fuera del mapeo → se muestra tal cual.
const MNT_CATEGORIAS_FOSA = {
  FOSA: 'Fosa',
  GRASERA: 'Grasera',
  PLANTA_TRATAMIENTO: 'Planta de tratamiento',
  CAMARA_REGISTRO: 'Cámara de registro'
};

// Copias en cliente de las colecciones ya cacheadas (sin N+1).
let mntFosasBase = [];
let mntFosasFuente = [];
let mntFosasContactos = [];
let mntFosasComentarios = [];
let mntFosasElementos = [];

// elemento_id → eventos de fosas_mantencion_fuente con es_fecha_valida ===
// true, ordenados por fecha de realización DESC (más reciente primero).
// Se reconstruye en cada repintado del panel; NUNCA incluye el caso N8.
let mntFosasHistorial = new Map();

// ------------------------------------------------------------
// Presentación de categoría (SOLO presentación; datos intactos)
// ------------------------------------------------------------
function mntCategoriaFosaTexto(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return null;
  const clave = String(valor).trim();
  return MNT_CATEGORIAS_FOSA[clave] || clave;
}

// ------------------------------------------------------------
// Relación fosa → elemento (FK real, resuelta en cliente)
// ------------------------------------------------------------
function mntFosaElemento(f) {
  if (!f || f.elemento_id === null || f.elemento_id === undefined || f.elemento_id === '') return null;
  const lista = Array.isArray(mntFosasElementos) ? mntFosasElementos : [];
  return lista.find(x => x && x.id === f.elemento_id) || null;
}

// Título de la tarjeta/ficha: nombre_original del elemento relacionado.
// No se inventan títulos ni se concatena información.
function mntTituloFosa(f) {
  const e = mntFosaElemento(f);
  if (e && e.nombre_original !== null && e.nombre_original !== undefined && String(e.nombre_original).trim() !== '') {
    return String(e.nombre_original);
  }
  return 'Sin nombre registrado';
}

// Ubicación del registro: prefiere ubicacion_original (dato real del
// registro); si está vacía, cae a la ubicación canónica del elemento.
// Nunca se infiere piso ni habitación.
function mntUbicacionFosa(f) {
  if (f && f.ubicacion_original !== null && f.ubicacion_original !== undefined && String(f.ubicacion_original).trim() !== '') {
    return String(f.ubicacion_original);
  }
  const e = mntFosaElemento(f);
  return e ? mntNombreUbicacion(e) : null;
}

// Capacidad original: SIEMPRE es la representación fuente principal.
function mntCapacidadOriginalFosa(f) {
  if (!f) return null;
  const v = f.capacidad_original;
  if (v === null || v === undefined || String(v).trim() === '') return null;
  return String(v);
}

// Capacidad normalizada: solo si capacidad_litros existe. NO se infieren
// litros cuando es NULL. Separa miles con el formato es-CL.
function mntCapacidadLitrosTexto(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  if (Number.isNaN(n)) return `${String(valor)} litros`;
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 }).format(n)} litros`;
}

// Fecha dd-mm-aaaa. Si el valor no sigue el formato esperado se muestra
// TAL CUAL (no se inventa ni se reinterpreta la fecha), patrón de Inventario.
function mntFechaFosaTexto(valor) {
  return formatearFechaCL(valor,{civil:true,vacio:null,invalida:String(valor)});
}

// ------------------------------------------------------------
// Historial de fosas (SOLO fechas válidas, ordenadas DESC)
// ------------------------------------------------------------
// Reconstruye el mapa elemento_id → eventos válidos. Los registros con
// es_fecha_valida !== true (p. ej. N8: valor 0 / VALOR_NO_FECHA) quedan
// FUERA del historial: no son fechas y no cuentan como mantención.
function mntFosasConstruirHistorial(fuente) {
  const mapa = new Map();
  (Array.isArray(fuente) ? fuente : []).forEach(x => {
    if (!x || x.es_fecha_valida !== true) return;
    if (x.elemento_id === null || x.elemento_id === undefined || x.elemento_id === '') return;
    if (!mapa.has(x.elemento_id)) mapa.set(x.elemento_id, []);
    mapa.get(x.elemento_id).push(x);
  });

  // UX: más reciente primero (fecha ISO → comparación lexicográfica segura).
  mapa.forEach(lista => {
    lista.sort((a, b) => {
      const fa = String((a && a.fecha_realizacion) || '');
      const fb = String((b && b.fecha_realizacion) || '');
      if (fa === fb) return 0;
      return fa > fb ? -1 : 1;
    });
  });

  return mapa;
}

// Eventos válidos de una fosa (nunca incluye el caso N8).
function mntHistorialFosa(f) {
  if (!f || f.elemento_id === null || f.elemento_id === undefined) return [];
  const lista = mntFosasHistorial instanceof Map ? mntFosasHistorial.get(f.elemento_id) : null;
  return Array.isArray(lista) ? lista : [];
}

// Datos fuente NO normalizables del elemento (es_fecha_valida === false).
// La verificación real arrojó 56 válidos + 1 no válido (N8) y 0 NULL, por lo
// que este filtro conserva exactamente los registros que no son fecha.
function mntFuenteNoNormalizableFosa(f) {
  if (!f || f.elemento_id === null || f.elemento_id === undefined) return [];
  return (Array.isArray(mntFosasFuente) ? mntFosasFuente : [])
    .filter(x => x && x.elemento_id === f.elemento_id && x.es_fecha_valida === false);
}

// ------------------------------------------------------------
// Comentarios del Excel (seguro ante <br> y contra XSS)
// ------------------------------------------------------------
// 1) convierte variantes de <br> a saltos lógicos;
// 2) escapa el texto (sin HTML sin escapar → sin XSS);
// 3) convierte los saltos resultantes en <br> para presentación.
// Así se conservan los saltos reales (p. ej. "Richard <br><br>La vacio...")
// sin mostrar "<br>" literal ni inyectar marcado.
function mntTextoComentarioHTML(valor) {
  if (valor === null || valor === undefined) return '';
  const conSaltos = String(valor).replace(/<br\s*\/?>/gi, '\n');
  return mntEsc(conSaltos).replace(/\n/g, '<br>');
}

// Comentario renderizado de forma segura (autor + texto + celda discreta).
function mntComentarioFosaHTML(c, mostrarCelda = true) {
  if (!c) return '';
  const autor = (c.autor_original !== null && c.autor_original !== undefined && String(c.autor_original).trim() !== '')
    ? String(c.autor_original) : null;
  const texto = (c.comentario_original === null || c.comentario_original === undefined || c.comentario_original === '')
    ? mntEsc('Sin texto registrado')
    : mntTextoComentarioHTML(c.comentario_original);
  const celda = (mostrarCelda && c.celda_origen !== null && c.celda_origen !== undefined && c.celda_origen !== '')
    ? String(c.celda_origen) : null;

  return `
    <div class="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
      ${autor ? `<p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 break-words">${mntEsc(autor)}</p>` : ''}
      <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 leading-relaxed break-words">${texto}</p>
      ${celda ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">Celda ${mntEsc(celda)}</p>` : ''}
    </div>
  `;
}

// Asigna los comentarios del elemento a la ficha SIN perder ni duplicar:
//   1) por mantencion_id → evento del historial (relación principal);
//   2) por celda_origen  → datos fuente no normalizables del elemento
//      (permite que N8 muestre su comentario real del Excel);
//   3) resto             → COMENTARIOS GENERALES DEL EXCEL.
function mntAsignarComentariosFosa(f, eventos, noNormalizables) {
  const delElemento = (Array.isArray(mntFosasComentarios) ? mntFosasComentarios : [])
    .filter(c => c && c.elemento_id === f.elemento_id);
  const usados = new Set();
  const porEvento = new Map();
  const porCelda = new Map();

  eventos.forEach(ev => {
    if (!ev || ev.mantencion_id === null || ev.mantencion_id === undefined) return;
    const lista = delElemento.filter(c => !usados.has(c.id) && c.mantencion_id === ev.mantencion_id);
    if (lista.length === 0) return;
    lista.forEach(c => usados.add(c.id));
    porEvento.set(ev.mantencion_id, lista);
  });

  noNormalizables.forEach(fu => {
    if (!fu || fu.celda_origen === null || fu.celda_origen === undefined || fu.celda_origen === '') return;
    const lista = delElemento.filter(c => !usados.has(c.id) && c.celda_origen === fu.celda_origen);
    if (lista.length === 0) return;
    lista.forEach(c => usados.add(c.id));
    porCelda.set(fu.id, lista);
  });

  const restantes = delElemento.filter(c => !usados.has(c.id));
  return { porEvento, porCelda, restantes };
}

// ------------------------------------------------------------
// Opciones y filtros en cliente (sin volver a Supabase)
// ------------------------------------------------------------
// Categorías derivadas de los datos reales (Set), SIN hardcodear la lista.
function mntOpcionesFiltrosFosas(lista) {
  const categorias = new Set();
  (Array.isArray(lista) ? lista : []).forEach(f => {
    if (!f) return;
    if (f.categoria_original !== null && f.categoria_original !== undefined && String(f.categoria_original).trim() !== '') {
      categorias.add(String(f.categoria_original));
    }
  });

  return {
    categorias: Array.from(categorias).sort((a, b) => {
      const ta = mntCategoriaFosaTexto(a) || a;
      const tb = mntCategoriaFosaTexto(b) || b;
      return ta.localeCompare(tb, 'es');
    })
  };
}

// Aplica los tres filtros en cliente (AND), sin volver a Supabase.
// historial: '' (todos) | 'con' | 'sin' — se decide SOLO por eventos con
// es_fecha_valida === true (N8 no es historial).
function mntFiltrarFosas(lista) {
  const texto = (mantencionFiltrosFosas.texto || '').trim().toLowerCase();
  const categoria = mantencionFiltrosFosas.categoria || '';
  const historial = mantencionFiltrosFosas.historial || '';

  return (Array.isArray(lista) ? lista : []).filter(f => {
    if (!f) return false;

    // Filtro por categoría (se compara contra categoria_original REAL).
    if (categoria) {
      const c = (f.categoria_original === null || f.categoria_original === undefined)
        ? '' : String(f.categoria_original);
      if (c !== categoria) return false;
    }

    // Filtro por historial (solo fechas válidas).
    if (historial) {
      const n = mntHistorialFosa(f).length;
      if (historial === 'con' && n === 0) return false;
      if (historial === 'sin' && n > 0) return false;
    }

    // Buscador (case-insensitive). NULL se ignora; nunca "null".
    if (texto) {
      const e = mntFosaElemento(f);
      const campos = [
        e ? e.nombre_original : null,
        e ? e.codigo : null,
        f.categoria_original,
        mntCategoriaFosaTexto(f.categoria_original),
        f.ubicacion_original,
        e ? mntNombreUbicacion(e) : null,
        f.capacidad_original
      ];
      const coincide = campos.some(c => {
        if (c === null || c === undefined || c === '') return false;
        return String(c).toLowerCase().indexOf(texto) !== -1;
      });
      if (!coincide) return false;
    }
    return true;
  });
}

// Buscador + filtros de categoría e historial, derivados de los datos.
function mntFiltrosFosasHTML(opciones) {
  const selCategoria = mantencionFiltrosFosas.categoria || '';
  const selHistorial = mantencionFiltrosFosas.historial || '';
  const haySeleccion = !!(mantencionFiltrosFosas.texto || selCategoria || selHistorial);

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-3 border border-slate-100 dark:border-slate-800">
      <div>
        <label for="mnt-buscar-fosa" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Buscar</label>
        <input id="mnt-buscar-fosa" type="text" value="${mntEsc(mantencionFiltrosFosas.texto)}"
          oninput="mntOnBuscarFosa(this.value)"
          placeholder="Nombre, código, categoría, ubicación o capacidad..."
          class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label for="mnt-filtro-categoria-fosa" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Categoría</label>
          <select id="mnt-filtro-categoria-fosa" onchange="mntOnFiltrarCategoriaFosa(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todas las categorías</option>
            ${opciones.categorias.map(c => `<option value="${mntEsc(c)}" ${c === selCategoria ? 'selected' : ''}>${mntEsc(mntCategoriaFosaTexto(c) || c)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="mnt-filtro-historial-fosa" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Historial</label>
          <select id="mnt-filtro-historial-fosa" onchange="mntOnFiltrarHistorialFosa(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todos</option>
            <option value="con" ${selHistorial === 'con' ? 'selected' : ''}>Con historial</option>
            <option value="sin" ${selHistorial === 'sin' ? 'selected' : ''}>Sin historial</option>
          </select>
        </div>
      </div>
      ${haySeleccion ? `
        <button onclick="mntLimpiarFiltrosFosas()"
          class="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
          Limpiar filtros
        </button>
      ` : ''}
    </div>
  `;
}

// ------------------------------------------------------------
// Cuadrícula y tarjeta de fosa
// ------------------------------------------------------------
function mntCuadriculaFosasHTML(filtrados) {
  if (!filtrados || filtrados.length === 0) {
    return `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-1">
        <span class="text-3xl block">🔍</span>
        <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Sin resultados para los filtros aplicados</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Prueba con otro texto, categoría u historial.</p>
      </div>
    `;
  }

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${filtrados.map(mntTarjetaFosaHTML).join('')}
    </div>
  `;
}

// Texto de historial de la tarjeta: SOLO eventos con fecha válida.
function mntTextoHistorialFosa(f) {
  const eventos = mntHistorialFosa(f);
  const n = eventos.length;
  if (n === 0) return 'Sin historial registrado';
  if (n === 1) return '1 mantención registrada';
  return `${n} mantenciones registradas`;
}

function mntTarjetaFosaHTML(f) {
  const categoria = mntCategoriaFosaTexto(f.categoria_original);
  const ubicacion = mntUbicacionFosa(f);
  const capacidad = mntCapacidadOriginalFosa(f);
  const e = mntFosaElemento(f);
  const eventos = mntHistorialFosa(f);
  const ultimaFecha = eventos.length > 0 ? mntFechaFosaTexto(eventos[0].fecha_realizacion) : null;
  const hayCodigo = e && e.codigo !== null && e.codigo !== undefined && e.codigo !== '';

  return `
    <div onclick="abrirFichaFosa('${mntEsc(f.id)}')"
      class="bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer card-hover group flex flex-col justify-between">
      <div>
        <div class="flex items-start justify-between mb-3">
          <div class="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-xl shrink-0">🕳️</div>
          ${categoria ? `<span class="text-[10px] font-black px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900 truncate max-w-[60%]" title="Categoría: ${mntEsc(f.categoria_original)}">${mntEsc(categoria)}</span>` : ''}
        </div>
        <h4 class="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug line-clamp-2">${mntEsc(mntTituloFosa(f))}</h4>
        ${hayCodigo ? `<p class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">${mntEsc(mntEtiquetaCodigo(e))}: ${mntEsc(e.codigo)}</p>` : ''}
        ${ubicacion ? `<p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-2 flex items-center space-x-1.5 truncate"><span>📍</span><span class="truncate">Ubicación: ${mntEsc(ubicacion)}</span></p>` : ''}
        <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-1.5 flex items-center space-x-1.5 truncate"><span>💧</span><span class="truncate">Capacidad: ${mntEsc(mntSinDato(capacidad))}</span></p>
        <p class="mt-2 text-[11px] font-bold ${eventos.length > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}">${mntEsc(mntTextoHistorialFosa(f))}</p>
        ${ultimaFecha ? `<p class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Última fecha: ${mntEsc(ultimaFecha)}</p>` : ''}
      </div>
      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold">
        <span class="text-slate-400 dark:text-slate-500">Ver ficha</span>

      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// Contactos de servicio (BLOQUE GENERAL, una sola vez)
// ------------------------------------------------------------
// contactos_servicio_fosas no tiene elemento_id ni fosa_id: son contactos
// GENERALES del subapartado. Se muestran debajo de la cuadrícula y NUNCA se
// repiten dentro de las fichas. No se convierten en parte del contador.
function mntContactosServicioFosasHTML(contactos) {
  const lista = Array.isArray(contactos) ? contactos : [];
  if (lista.length === 0) return '';

  return `
    <div class="pt-5 border-t border-slate-100 dark:border-slate-800">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Contactos de servicio</h4>
        <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">${lista.length} contacto${lista.length === 1 ? '' : 's'}</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${lista.map(mntTarjetaContactoFosaHTML).join('')}
      </div>
      <p class="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
        Contactos generales del subapartado: no están asociados a una fosa específica en el Excel, por lo que se muestran una sola vez.
      </p>
    </div>
  `;
}

function mntTarjetaContactoFosaHTML(c) {
  const detalle = (c.detalle_original !== null && c.detalle_original !== undefined && String(c.detalle_original).trim() !== '')
    ? String(c.detalle_original) : null;
  const origen = [];
  if (c.hoja_origen !== null && c.hoja_origen !== undefined && c.hoja_origen !== '') origen.push(String(c.hoja_origen));
  if (c.fila_origen !== null && c.fila_origen !== undefined && c.fila_origen !== '') origen.push(`fila ${c.fila_origen}`);

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-1.5">
      <p class="text-sm font-extrabold text-slate-900 dark:text-white leading-snug break-words">${mntEsc(mntSinDato(c.nombre_original))}</p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Contacto: ${mntEsc(mntSinDato(c.contacto_original))}</p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Teléfono: ${mntEsc(mntSinDato(c.telefono_original))}</p>
      ${detalle ? `<p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Detalle: ${mntEsc(detalle)}</p>` : ''}
      ${origen.length ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">${mntEsc(origen.join(' · '))}</p>` : ''}
    </div>
  `;
}

// ------------------------------------------------------------
// Manejadores de filtros (solo re-render del listado, sin recargar la SPA)
// ------------------------------------------------------------
function mntOnBuscarFosa(valor) {
  mantencionFiltrosFosas.texto = valor || '';
  mntRefrescarListadoFosas();
}

function mntOnFiltrarCategoriaFosa(valor) {
  mantencionFiltrosFosas.categoria = valor || '';
  mntRefrescarListadoFosas();
}

function mntOnFiltrarHistorialFosa(valor) {
  mantencionFiltrosFosas.historial = valor || '';
  mntRefrescarListadoFosas();
}

// Rutina ÚNICA de reset del estado de filtros de Fosas. La usan el cierre
// completo de la modal (cerrarMantencionSubapartado) y el botón "Limpiar
// filtros" (mntLimpiarFiltrosFosas). No toca DOM ni consulta Supabase; solo
// restaura los valores iniciales del estado (ni _fosasCache ni
// _elementosCache se limpian).
function mntResetFiltrosFosas() {
  mantencionFiltrosFosas.texto = '';
  mantencionFiltrosFosas.categoria = '';
  mantencionFiltrosFosas.historial = '';
}

function mntLimpiarFiltrosFosas() {
  mntResetFiltrosFosas();
  // Vuelve a dibujar el panel completo para refrescar también los <select>.
  cargarPanelSubapartado('fosas');
}

// Actualiza únicamente la cuadrícula y el contador.
function mntRefrescarListadoFosas() {
  const cont = document.getElementById('mnt-listado-fosas');
  const contador = document.getElementById('mnt-contador-fosas');
  if (!cont) return;

  const filtrados = mntFiltrarFosas(mntFosasBase);
  cont.innerHTML = mntCuadriculaFosasHTML(filtrados);
  // "X de Y elementos": 19 registros y 19 elemento_id distintos; el total
  // siempre sale de mntFosasBase.length (NUNCA se hardcodea).
  if (contador) contador.textContent = `${filtrados.length} de ${mntFosasBase.length} elementos`;
}

// ------------------------------------------------------------
// Panel contenedor: decide entre listado y ficha (misma modal, sin modal
// sobre modal)
// ------------------------------------------------------------
function mntPanelFosasHTML(meta, datos) {
  const d = (datos && typeof datos === 'object') ? datos : {};
  mntFosasBase = Array.isArray(d.fosas) ? d.fosas : [];
  mntFosasFuente = Array.isArray(d.fuente) ? d.fuente : [];
  mntFosasContactos = Array.isArray(d.contactos) ? d.contactos : [];
  mntFosasComentarios = Array.isArray(d.comentarios) ? d.comentarios : [];
  mntFosasElementos = Array.isArray(d.elementos) ? d.elementos : [];
  mntFosasHistorial = mntFosasConstruirHistorial(mntFosasFuente);

  // El título grande ya lo muestra la cabecera de la modal.
  const encabezado = `
    <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
      <p class="text-[11px] text-slate-500 dark:text-slate-400">Sección de Mantención General</p>
      <span class="text-xs font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 px-3 py-1.5 rounded-xl">
        Fase 2 · Fosas y Alcantarillado
      </span>
    </div>
  `;

  let cuerpo;
  if (mantencionFosaSeleccionada) {
    // Ficha interna: se busca la fosa en la base ya cargada (sin N+1 y sin
    // nueva consulta). Los filtros quedan guardados en estado.
    const fosa = mntFosasBase.find(x => x && x.id === mantencionFosaSeleccionada) || null;
    cuerpo = `
      <div>
        <button onclick="cerrarFichaFosa()"
          class="mb-4 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1.5">
          <span>←</span>
          <span>Volver al listado de fosas</span>
        </button>
        ${fosa ? mntFichaFosaHTML(fosa) : `
          <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-2">
            <span class="text-3xl block">⚠️</span>
            <p class="text-sm font-bold text-slate-700 dark:text-slate-200">Fosa no encontrada</p>
          </div>
        `}
      </div>
    `;
  } else if (mntFosasBase.length === 0) {
    cuerpo = `
      <div class="mt-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-10 text-center space-y-2">
        <span class="text-4xl block">🕳️</span>
        <h4 class="text-base font-black text-slate-700 dark:text-slate-200">No hay fosas registradas</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400">Aún no existen registros de fosas y alcantarillado.</p>
      </div>
    `;
  } else {
    const opciones = mntOpcionesFiltrosFosas(mntFosasBase);
    const filtrados = mntFiltrarFosas(mntFosasBase);
    cuerpo = `
      <div class="mt-5 space-y-4">
        ${mntFiltrosFosasHTML(opciones)}
        <p id="mnt-contador-fosas" class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
          ${filtrados.length} de ${mntFosasBase.length} elementos
        </p>
        <div id="mnt-listado-fosas">
          ${mntCuadriculaFosasHTML(filtrados)}
        </div>
        ${mntContactosServicioFosasHTML(mntFosasContactos)}
      </div>
    `;
  }

  return `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      ${encabezado}
      ${cuerpo}
    </div>
  `;
}

// ------------------------------------------------------------
// Ficha de la fosa (DENTRO de la modal del subapartado)
// ------------------------------------------------------------
// La ficha NO crea una segunda modal. Reemplaza el contenido del listado
// dentro de la misma modal de "Fosas y Alcantarillado". Los filtros se
// conservan en estado (mantencionFiltrosFosas) y al volver se repintan igual.
// No se recarga la SPA ni se consulta Supabase: todo sale de las copias en
// cliente ya cacheadas.
function abrirFichaFosa(id) {
  mantencionFosaSeleccionada = id;
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;

  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'fosas') || { nombre: 'Fosas y Alcantarillado', icono: '🕳️' };
  panel.innerHTML = mntPanelFosasHTML(meta, {
    fosas: mntFosasBase,
    contactos: mntFosasContactos,
    fuente: mntFosasFuente,
    comentarios: mntFosasComentarios,
    elementos: mntFosasElementos
  });

  // C2F-7: la ficha se renderiza de forma síncrona; las ACTIVIDADES
  // registradas en el sistema se cargan en este punto, ya con la ficha en
  // el DOM (patrón async validado en Puertas / Engrase). Solo lectura:
  // el historial importado del Excel NO se vuelve a consultar aquí.
  const fosa = mntFosasBase.find(x => x && x.id === id) || null;
  if (fosa) mntCargarActividadesFosa(fosa);
}

// Vuelve al listado conservando búsqueda, categoría e historial seleccionados.
function cerrarFichaFosa() {
  mantencionFosaSeleccionada = null;
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;

  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'fosas') || { nombre: 'Fosas y Alcantarillado', icono: '🕳️' };
  panel.innerHTML = mntPanelFosasHTML(meta, {
    fosas: mntFosasBase,
    contactos: mntFosasContactos,
    fuente: mntFosasFuente,
    comentarios: mntFosasComentarios,
    elementos: mntFosasElementos
  });
}

// Bloque CAPACIDAD: capacidad_original SIEMPRE visible; la normalizada solo
// si existe; el badge "Aproximada" aparece únicamente cuando
// capacidad_aproximada === true (no significa error).
function mntBloqueCapacidadFosaHTML(f) {
  const original = mntCapacidadOriginalFosa(f);
  const normalizada = mntCapacidadLitrosTexto(f.capacidad_litros);
  const aproximada = f.capacidad_aproximada === true;

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Capacidad</h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${mntCampoFichaHTML('Capacidad original', original)}
        <div>
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Capacidad normalizada</p>
          <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 leading-relaxed break-words">
            ${normalizada ? mntEsc(normalizada) : mntEsc('Sin dato registrado')}
            ${aproximada ? `<span class="inline-block ml-1 align-middle text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900">Aproximada</span>` : ''}
          </p>
        </div>
      </div>
      ${!normalizada ? `
        <p class="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
          No existe capacidad normalizada en la fuente; no se infieren litros.
        </p>` : ''}
      ${aproximada ? `
        <p class="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
          La normalización aproximada proviene del propio Excel; no indica un dato erróneo.
        </p>` : ''}
    </div>
  `;
}

// Cada evento del historial (SOLO fechas válidas) con sus comentarios
// asociados por mantencion_id. Orden: fecha de realización DESC.
function mntEventoFosaHTML(ev, comentarios) {
  const lista = Array.isArray(comentarios) ? comentarios : [];

  return `
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        ${mntCampoFichaHTML('Fecha', mntFechaFosaTexto(ev.fecha_realizacion), true)}
        ${mntCampoFichaHTML('Valor original', ev.valor_original)}
        ${mntCampoFichaHTML('Año de cabecera', ev.anio_cabecera_original)}
        ${mntCampoFichaHTML('Origen', ev.celda_origen)}
      </div>
      ${lista.length ? `
        <div class="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Comentarios del Excel</p>
          ${lista.map(c => mntComentarioFosaHTML(c)).join('')}
        </div>` : ''}
    </div>
  `;
}

// Bloque HISTORIAL: únicamente fosas_mantencion_fuente con
// es_fecha_valida === true. NO se llama public.mantenciones.
function mntHistorialFosaHTML(f, asignacion) {
  const eventos = mntHistorialFosa(f);

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Historial importado del Excel</h4>
        <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">${eventos.length} evento${eventos.length === 1 ? '' : 's'}</span>
      </div>
      ${eventos.length === 0
        ? `<div class="bg-white dark:bg-slate-900 rounded-2xl p-6 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-800">
             Sin historial importado desde Excel para esta fosa.
           </div>`
        : mntHistorialPaginadoHTML(eventos.length, 'Historial importado de fosas', `<div class="space-y-3">
             ${mntOrdenarHistorialReciente(eventos).map(ev => mntEventoFosaHTML(ev, (asignacion.porEvento instanceof Map) ? asignacion.porEvento.get(ev.mantencion_id) : null)).join('')}
           </div>`)}
      <p class="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
        Historial derivado de fosas_mantencion_fuente con fecha válida; los valores fuente no convertidos a fecha se muestran en la sección siguiente.
      </p>
    </div>
  `;
}

// Bloque DATOS FUENTE NO NORMALIZABLES (p. ej. N8 = 0).
// Si el array está vacío, NO se emite la sección.
function mntFuenteNoNormalizableFosaHTML(f, asignacion) {
  const registros = mntFuenteNoNormalizableFosa(f);
  if (registros.length === 0) return '';

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Datos fuente no normalizables</h4>
      <div class="space-y-3">
        ${registros.map(fu => {
          const nota = (fu.observaciones !== null && fu.observaciones !== undefined && String(fu.observaciones).trim() !== '')
            ? String(fu.observaciones) : null;
          const comentarios = (asignacion.porCelda instanceof Map) ? (asignacion.porCelda.get(fu.id) || []) : [];

          return `
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                ${mntCampoFichaHTML('Valor original', fu.valor_original)}
                ${mntCampoFichaHTML('Año de cabecera', fu.anio_cabecera_original)}
                ${mntCampoFichaHTML('Fecha', 'Sin fecha normalizada')}
                ${mntCampoFichaHTML('Celda', fu.celda_origen)}
              </div>
              ${nota ? `
                <div class="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Nota de migración</p>
                  <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 leading-relaxed break-words">${mntEsc(nota)}</p>
                  <p class="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                    Texto generado durante la migración; no proviene de una columna de observaciones del Excel.
                  </p>
                </div>` : ''}
              ${comentarios.length ? `
                <div class="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Comentario real del Excel</p>
                  ${comentarios.map(c => mntComentarioFosaHTML(c)).join('')}
                </div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// Comentarios del elemento que NO se mostraron ni en un evento ni en un
// dato fuente no normalizable. Así los comentarios del Excel se conservan
// completos y sin duplicar.
function mntComentariosGeneralesFosaHTML(asignacion) {
  const restantes = Array.isArray(asignacion.restantes) ? asignacion.restantes : [];
  if (restantes.length === 0) return '';

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Comentarios generales del Excel</h4>
        <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">${restantes.length} comentario${restantes.length === 1 ? '' : 's'}</span>
      </div>
      <div class="space-y-2">
        ${restantes.map(c => mntComentarioFosaHTML(c)).join('')}
      </div>
    </div>
  `;
}

// Ficha de la fosa: datos del elemento + capacidad + historial importado +
// datos fuente no normalizables + comentarios generales + (C2F-7)
// "Registrar mantención" y "Actividades registradas en el sistema" +
// observaciones + origen/trazabilidad.
// Sin campos editables DENTRO de la ficha (el único input —observación
// opcional— vive en la modal propia de Fosas) y sin UUID visibles.
function mntFichaFosaHTML(f) {
  const e = mntFosaElemento(f);
  const categoria = mntCategoriaFosaTexto(f.categoria_original);
  const historial = mntHistorialFosa(f);
  const noNormalizables = mntFuenteNoNormalizableFosa(f);
  const asignacion = mntAsignarComentariosFosa(f, historial, noNormalizables);

  // Ubicación canónica: valor REAL de ubicaciones.nombre vía el elemento
  // relacionado. Solo se muestra si aporta un valor distinto al original.
  const ubicacionCanonica = e ? mntNombreUbicacion(e) : null;
  const hayUbicacionOriginal = f.ubicacion_original !== null &&
    f.ubicacion_original !== undefined && f.ubicacion_original !== '';
  const mostrarUbicacionCanonica = ubicacionCanonica !== null &&
    (!hayUbicacionOriginal || String(f.ubicacion_original) !== String(ubicacionCanonica));

  // observaciones de fosas_alcantarillado están NULL en los registros
  // verificados: el bloque solo se emite si existe contenido real.
  const observaciones = (f.observaciones !== null && f.observaciones !== undefined && String(f.observaciones).trim() !== '')
    ? String(f.observaciones) : null;

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-5 space-y-5">

      <!-- CABECERA FICHA -->
      <div class="flex items-start space-x-3">
        <div class="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-2xl shrink-0">🕳️</div>
        <div class="min-w-0">
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Registro de fosas y alcantarillado</p>
          <h3 class="text-lg font-black text-slate-900 dark:text-white leading-snug break-words">${mntEsc(mntTituloFosa(f))}</h3>
          ${categoria ? `<span class="inline-block mt-1.5 text-[10px] font-black px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900">${mntEsc(categoria)}</span>` : ''}
        </div>
      </div>

      <!-- DATOS DEL ELEMENTO -->
      <div>
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Datos del elemento</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${mntCampoFichaHTML('Nombre', e ? e.nombre_original : null)}
          ${e ? mntCampoFichaHTML(mntEtiquetaCodigo(e), e.codigo) : ''}
          ${mntCampoFichaHTML('Categoría', categoria || f.categoria_original)}
          ${mntCampoFichaHTML('Ubicación original', f.ubicacion_original)}
          ${mostrarUbicacionCanonica ? mntCampoFichaHTML('Ubicación', ubicacionCanonica) : ''}
        </div>
        <p class="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
          Relación resuelta por FK real (elemento_id). La ubicación canónica solo se muestra cuando difiere de la original.
        </p>
      </div>

      <!-- CAPACIDAD -->
      ${mntBloqueCapacidadFosaHTML(f)}

      <!-- HISTORIAL (solo fechas válidas; N8 no cuenta) -->
      ${mntHistorialFosaHTML(f, asignacion)}

      <!-- DATOS FUENTE NO NORMALIZABLES (si existen) -->
      ${mntFuenteNoNormalizableFosaHTML(f, asignacion)}

      <!-- COMENTARIOS GENERALES DEL EXCEL (si quedan sin asignar) -->
      ${mntComentariosGeneralesFosaHTML(asignacion)}

      <!-- REGISTRAR MANTENCIÓN (C2F-7, evento append-only en el sistema):
           escritura SOLO vía HistorialService.registrarEvento. Separado del
           historial importado del Excel (nunca se mezclan). -->
      ${mntBloqueRegistrarFosaHTML(f)}

      <!-- ACTIVIDADES REGISTRADAS EN EL SISTEMA (C2F-7, historial real
           fosa / mantencion_fosa / evento, carga asíncrona) -->
      ${mntBloqueActividadesFosaHTML()}

      <!-- OBSERVACIONES (solo si existe contenido real) -->
      ${observaciones ? `
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Observaciones</h4>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
          <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-relaxed break-words">${mntEsc(observaciones)}</p>
        </div>
      </div>` : ''}

      <!-- ORIGEN / TRAZABILIDAD -->
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Origen / trazabilidad</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          ${mntCampoFichaHTML('Archivo origen', mntArchivoOrigenFosa(f))}
          ${mntCampoFichaHTML('Hoja origen', f.hoja_origen)}
          ${mntCampoFichaHTML('Fila origen', f.fila_origen)}
          ${mntCampoFichaHTML('Celda origen', f.celda_origen)}
        </div>
      </div>
    </div>
  `;
}

// Archivo de origen real del registro (embed importacion:importaciones_excel).
function mntArchivoOrigenFosa(f) {
  const i = f && f.importacion;
  if (!i || typeof i !== 'object' || Array.isArray(i)) return null;
  const v = i.archivo_origen;
  return (v === null || v === undefined || v === '') ? null : v;
}

// ==========================================================
// FOSAS Y ALCANTARILLADO — FASE C2F-7 (ACTIVIDADES EN EL SISTEMA)
// ==========================================================
// Sección operacional de la ficha de fosas. Una actividad es un EVENTO
// append-only en mantencion_historial con tipo_entidad 'fosa', campo
// 'mantencion_fosa' y accion 'evento'. NO existe estado operativo,
// periodicidad, próxima fecha, responsable, materiales ni tipo de limpieza
// (esos datos NO existen en la fuente real; no se piden ni se inventan).
//
// FECHAS: created_at y autor se fijan SIEMPRE server-side y se presentan
// como "Registro en el sistema" / "Fecha de registro en el sistema".
// JAMÁS se etiquetan como "fecha de realización": en esta fase no se
// almacena una fecha de ejecución distinta del registro.
//
// SEPARACIÓN DE HISTORIALES (inviolable):
// - Historial importado del Excel → fosas_mantencion_fuente (inmutable,
//   con su propio contador y su dato N8 = 0 / VALOR_NO_FECHA intacto).
// - Actividades nuevas → mantencion_historial (fosa / mantencion_fosa).
// NO se unen en una sola línea de tiempo y NUNCA se mezclan contadores ni
// fechas entre ambas fuentes.
//
// Escritura: ÚNICA vía de registro HistorialService.registrarEvento(...)
// y ÚNICA vía de anulación HistorialService.anularHistorial(...). SIN
// supabase.rpc() directo, SIN .insert()/.update()/.delete(), SIN
// localStorage ni mocks. Namespace, modals y guards PROPIOS de Fosas:
// jamás se reutilizan ids ni flags de Pilas (mnt*Control*), de TV ni de
// engrase (mnt*Engrase*). Todo texto de BD pasa por mntEsc; los errores se
// muestran con textContent. Los UUID (id, entidad_id, anulado_por) NUNCA
// se muestran al usuario.
//
// Permisos: registro SOLO con permiso operativo (esAdminOperativoActual);
// anulación SOLO con Administrador permanente (esAdminPermanenteActual),
// mismo patrón que Pilas, TV y engrase. La autoridad real sigue en la RPC.

// -----------------------------------------------------------
// Estado y constantes (NAMESPACE EXCLUSIVO DE FOSAS)
// -----------------------------------------------------------

// true mientras la RPC de registro de mantención de fosa está en vuelo.
let mntRegistroFosaGuardando = false;

// fosaId cuya mantención YA quedó registrada pero cuyo releer del
// historial falló. Se limpia SOLO tras una lectura EXITOSA posterior.
let mntRegistroFosaPendienteRefresco = null;

// true mientras la RPC de anulación de fosa está en vuelo.
let mntAnulacionFosaGuardando = false;

// historialId cuya anulación YA quedó registrada pero cuyo releer falló.
let mntAnulacionFosaPendienteRefresco = null;

const MNT_MODAL_REGISTRO_FOSA_ID = 'mnt-modal-registro-fosa-overlay';
const MNT_MODAL_ANULAR_FOSA_ID = 'mnt-modal-anular-fosa-overlay';

const MNT_AVISO_REFRESCO_REGISTRO_FOSA = 'La mantención quedó registrada correctamente, pero no fue posible actualizar las actividades. No vuelvas a registrarla. Cierra y vuelve a abrir Fosas y Alcantarillado.';
const MNT_AVISO_REFRESCO_ANULAR_FOSA = 'El registro quedó anulado correctamente, pero no fue posible actualizar las actividades. No vuelvas a intentar anularlo. Cierra y vuelve a abrir Fosas y Alcantarillado.';

const MNT_MENSAJES_ERROR_REGISTRO_FOSA = {
  SESION_INVALIDA: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
  NO_AUTORIZADO: 'No tienes permisos para registrar esta actividad.',
  CAMPO_NO_PERMITIDO: 'No se puede registrar esta actividad.',
  CONFIG_INCOMPLETA: 'La configuración de fosas y alcantarillado no está disponible.',
  ENTIDAD_NO_ENCONTRADA: 'Esta fosa ya no está disponible.',
  TIPO_NO_IMPLEMENTADO: 'Este tipo de registro aún no admite esta operación.',
  VALOR_INVALIDO: 'No fue posible validar la actividad.',
  VALOR_NO_PERMITIDO: 'Esta actividad no está permitida.'
};

const MNT_MENSAJES_ERROR_ANULAR_FOSA = {
  MOTIVO_REQUERIDO: 'Debes indicar el motivo de la anulación.',
  SESION_INVALIDA: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
  NO_AUTORIZADO: 'Solo un administrador permanente puede anular este registro.',
  REGISTRO_YA_ANULADO: 'Este registro ya fue anulado.',
  CAMPO_NO_PERMITIDO: 'Este registro no admite anulación.',
  CONFIG_INCOMPLETA: 'La configuración necesaria para anular este registro no está disponible.',
  ENTIDAD_NO_ENCONTRADA: 'El registro o la actividad asociada ya no está disponible.',
  TIPO_NO_IMPLEMENTADO: 'Este tipo de registro aún no admite anulación.',
  VALOR_INVALIDO: 'La anulación solicitada no es válida.',
  VALOR_NO_PERMITIDO: 'La anulación solicitada no está permitida.'
};

// Registro ORIGINAL de cada actividad de fosa anulable, poblado por el
// renderer (mntActividadFosaSistemaHTML) en cada pintado. Permite abrir la
// modal sin serializar BD en atributos HTML. Se REPOBLA en cada repintado
// del bloque (ver mntPintarActividadesFosa).
const mntFosaEventosAnulables = new Map();

// -----------------------------------------------------------
// Bloque "Registrar mantención" (solo permiso operativo)
// -----------------------------------------------------------
// Un evento fechado por el registro (append-only), NO un estado booleano:
// no se muestra próxima fecha, periodicidad, responsable ni material porque
// no existen datos reales que los sustenten. El botón se pinta SOLO con
// permiso operativo; la autoridad real sigue en la RPC backend.
function mntBloqueRegistrarFosaHTML(f) {
  const puedeRegistrar = !!f && !!f.id &&
    typeof window.esAdminOperativoActual === 'function' &&
    window.esAdminOperativoActual() === true;

  const botonRegistrar = puedeRegistrar
    ? `<div class="pt-2 border-t border-slate-100 dark:border-slate-700">
          <button type="button" onclick="abrirModalRegistroFosa('${mntEsc(f.id)}')"
            class="mt-1 inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all">
            <span aria-hidden="true">🕳️</span>
            <span>Registrar mantención</span>
          </button>
        </div>`
    : '';

  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Registrar mantención</h4>
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-2">
        <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed">
          Cada mantención se registra como un <span class="font-black">evento</span> con la fecha, la
          hora y el autor del momento del registro. Solo se admite una observación opcional: no se
          piden fecha manual, responsable, materiales, tipo de limpieza ni periodicidad porque la
          fuente real no los contiene.
        </p>
        <p class="text-[10px] text-slate-400 dark:text-slate-500">
          Este registro no modifica ni reemplaza el historial importado del Excel.
        </p>
        ${botonRegistrar}
      </div>
    </div>
  `;
}

// -----------------------------------------------------------
// Bloque "Actividades registradas en el sistema"
// -----------------------------------------------------------
// Contenedor con namespace propio de fosas; el contenido real se pinta de
// forma asíncrona desde mntCargarActividadesFosa(f) DESPUÉS de insertar la
// ficha. Separa por completo el historial operacional del bloque "Historial
// de mantenciones" (Excel importado, fosas_mantencion_fuente).
function mntBloqueActividadesFosaHTML() {
  return `
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-3">Actividades registradas en el sistema</h4>
      <div id="mnt-historial-fosas-actividades" class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Cargando actividades...</p>
      </div>
      <p class="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
        Esta sección muestra SOLO las actividades registradas (fecha y hora del registro,
        autor y observación). El historial importado del Excel se muestra por separado y permanece
        intacto.
      </p>
    </div>
  `;
}

// -----------------------------------------------------------
// Renderer de la actividad registrada en el sistema
// -----------------------------------------------------------
// Renderer EXCLUSIVO de Fosas: NO interpreta valor_nuevo ni valor_anterior
// (detalle técnico del backend, no se muestran). Solo: fecha/hora de
// REGISTRO EN EL SISTEMA (created_at, server-side), autor y observación.
// Si ev.anulacion existe, el evento ORIGINAL sigue visible y se agrega el
// chip "ANULADO" más el bloque de anulación (helper genérico).
// Botón "Anular registro" SOLO para: evento fosa / mantencion_fosa / evento
// aún NO anulado y con Administrador PERMANENTE.
function mntActividadFosaSistemaHTML(ev) {
  const registro = ev || {};
  const anulado = registro.anulacion !== null && registro.anulacion !== undefined;

  const observacionTexto = (typeof registro.observacion === 'string' && registro.observacion.trim() !== '')
    ? registro.observacion.trim()
    : 'Sin observación registrada';

  const autorTexto = (typeof (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot) === 'string' && (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot).trim() !== '')
    ? (window.UsuariosService?.nombreParaMostrar?.(registro,'autor_nombre_snapshot') ?? registro.autor_nombre_snapshot).trim()
    : 'Autor no registrado';

  const chipAnulado = anulado
    ? `<span class="text-[10px] font-black px-2.5 py-1 rounded-full border bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900">ANULADO</span>`
    : '';

  const bloqueAnulacion = anulado
    ? mntBloqueAnulacionHTML(registro.anulacion, {
        texto: 'Esta actividad fue anulada y no se considera vigente.'
      })
    : '';

  // GATING del botón (SOLO lectura del rol en cliente; la autoridad
  // definitiva sigue siendo la RPC backend).
  const historialId = registro.id || null;
  const puedeAnular = !!historialId &&
    registro.tipo_entidad === 'fosa' &&
    registro.campo === 'mantencion_fosa' &&
    registro.accion === 'evento' &&
    !anulado &&
    typeof window.esAdminPermanenteActual === 'function' &&
    window.esAdminPermanenteActual() === true;

  if (puedeAnular) {
    mntFosaEventosAnulables.set(String(historialId), Object.assign({}, registro));
  }

  const botonAnular = puedeAnular
    ? `<div class="pt-2 border-t border-slate-100 dark:border-slate-700">
        <button type="button" onclick="abrirModalAnularFosa('${mntEsc(String(historialId))}')"
          class="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all">
          <span aria-hidden="true">⛔</span>
          <span>Anular registro</span>
        </button>
      </div>`
    : '';

  return `
    <li class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs font-black text-slate-800 dark:text-slate-200">Mantención registrada</p>
        <span class="flex flex-wrap items-center gap-2">
          <span class="text-[10px] font-black px-2.5 py-1 rounded-full border bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900">
            Evento registrado
          </span>
          ${chipAnulado}
        </span>
      </div>
      <p class="text-xs font-semibold text-slate-600 dark:text-slate-400">
        Registro en el sistema: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntFechaHoraRevisionTexto(registro.created_at))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Autor: ${mntEsc(autorTexto)}
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Observación: ${mntEsc(observacionTexto)}
      </p>
      ${botonAnular}
      ${bloqueAnulacion}
    </li>
  `;
}

// Repintado ÚNICO del bloque de actividades (misma estructura en el loader
// inicial y en los dos refresh posteriores a una RPC). REPOBLA el mapa de
// eventos anulables en CADA pintado: los eventos ya anulados o ajenos al
// dominio no quedan disponibles para abrir la modal.
function mntPintarActividadesFosa(cont, eventos) {
  if (!cont) return;

  mntFosaEventosAnulables.clear();

  if (!Array.isArray(eventos) || eventos.length === 0) {
    cont.innerHTML = `
      <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
        Sin actividades registradas en el sistema para esta fosa.
      </p>
    `;
    return;
  }
  cont.innerHTML = `
    <p class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
      ${eventos.length} actividad(es) registrada(s) · más reciente primero
    </p>
    <div class="mt-3">${mntHistorialPaginadoHTML(eventos.length, 'Historial del sistema de fosas', `<ul class="space-y-3">
      ${mntOrdenarHistorialReciente(eventos).map(mntActividadFosaSistemaHTML).join('')}
    </ul>`)}</div>
  `;
}

// Carga ASÍNCRONA de las actividades (solo lectura). Se invoca SIEMPRE
// después de insertar la ficha en el DOM. Antes de pintar se comprueba que
// el contenedor siga existiendo y que mantencionFosaSeleccionada siga
// siendo f.id: si el usuario cerró la ficha o abrió otra, el resultado
// viejo NO se pinta.
async function mntCargarActividadesFosa(f) {
  if (!f || !f.id) return;

  const contInicial = document.getElementById('mnt-historial-fosas-actividades');
  if (!contInicial) return;

  let eventos = null;
  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }
    // Única fuente: public.mantencion_historial filtrado por el dominio
    // EXACTO fosa / mantencion_fosa (más reciente primero).
    eventos = await window.HistorialService.getRevisiones('fosa', f.id, 'mantencion_fosa');
  } catch (e) {
    // La ficha pudo cambiar tras el await: se re-verifica antes de pintar.
    if (mantencionFosaSeleccionada !== f.id) return;
    const cont = document.getElementById('mnt-historial-fosas-actividades');
    if (!cont) return;
    console.error('Error cargando las actividades de fosas:', e);
    cont.textContent = 'No fue posible cargar las actividades registradas.';
    return;
  }

  // LECTURA EXITOSA ⇒ se levantan los bloqueos pendientes de ESTA fosa
  // (tanto el de registro como el de anulación, si aplica).
  if (mntRegistroFosaPendienteRefresco !== null &&
      mntRegistroFosaPendienteRefresco === f.id) {
    mntRegistroFosaPendienteRefresco = null;
  }
  if (mntAnulacionFosaPendienteRefresco !== null &&
      Array.isArray(eventos) &&
      eventos.some(ev => ev && String(ev.id) === String(mntAnulacionFosaPendienteRefresco))) {
    mntAnulacionFosaPendienteRefresco = null;
  }

  // Ficha cambiada/cerrada durante la lectura: sin repintado.
  if (mantencionFosaSeleccionada !== f.id) return;

  const cont = document.getElementById('mnt-historial-fosas-actividades');
  if (!cont) return;
  mntPintarActividadesFosa(cont, eventos);
}

// Relectura ESPECÍFICA de las actividades de ESTA fosa tras el éxito de una
// RPC (opción A de limpieza del bloqueo pendiente). NO se releen
// fosas_alcantarillado ni fosas_mantencion_fuente: un evento no modifica
// el registro principal ni el historial importado. Devuelve true SOLO
// cuando la lectura terminó bien (y, si la ficha sigue en esta fosa y su
// contenedor existe, se repintó el bloque). Si el usuario cambió o cerró
// la ficha durante la RPC, NO se reabre ni se pinta sobre otra ficha (eso
// NO es un fallo).
async function mntRefrescarActividadesFosa(fosaId) {
  if (!fosaId) return false;

  let eventos = null;
  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }
    // force=true: obliga a releer Supabase (estado fresco tras la escritura).
    eventos = await window.HistorialService.getRevisiones('fosa', fosaId, 'mantencion_fosa', true);
  } catch (e) {
    // Lectura fallida ⇒ refresco fallido (la escritura YA ocurrió). El
    // bloqueo pendiente NO se limpia.
    console.error('Error releyendo las actividades de la fosa tras la escritura:', e);
    return false;
  }

  // LECTURA EXITOSA ⇒ se levantan los bloqueos pendientes de ESTA fosa.
  if (mntRegistroFosaPendienteRefresco !== null &&
      mntRegistroFosaPendienteRefresco === fosaId) {
    mntRegistroFosaPendienteRefresco = null;
  }
  if (mntAnulacionFosaPendienteRefresco !== null &&
      Array.isArray(eventos) &&
      eventos.some(ev => ev && String(ev.id) === String(mntAnulacionFosaPendienteRefresco))) {
    mntAnulacionFosaPendienteRefresco = null;
  }

  // Ficha cambiada/cerrada durante la RPC: solo datos frescos, sin repintado.
  if (mantencionFosaSeleccionada !== fosaId) return true;

  const cont = document.getElementById('mnt-historial-fosas-actividades');
  if (!cont) return true;

  mntPintarActividadesFosa(cont, eventos);
  return true;
}

// -----------------------------------------------------------
// Modal: REGISTRAR MANTENCIÓN (Fosas)
// -----------------------------------------------------------

// Crea la modal UNA sola vez. Si ya existe, devuelve la misma.
function asegurarModalRegistroFosa() {
  let overlay = document.getElementById(MNT_MODAL_REGISTRO_FOSA_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MNT_MODAL_REGISTRO_FOSA_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Registrar mantención');
  overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overflow-y-auto';
  overlay.onclick = function (ev) {
    // Solo el clic en el fondo cierra; el clic dentro de la caja no burbujea.
    // UX-02: fondo sin cierre.
  };
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 my-auto text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
      <div id="mnt-modal-registro-fosa"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// Escape cierra PRIMERO la modal de registro de fosa (fase de captura).
// Aunque la RPC esté en vuelo puede ocultar la modal, pero NO libera el
// guard ⇒ no se puede iniciar otro registro hasta que esa RPC termine.
function mntTeclaEscapeRegistroFosa(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

// Contexto REAL de la ficha (nombre del elemento, categoría, ubicación y
// capacidad) + explicación del evento + SOLO un campo de observación
// opcional. EXPLÍCITAMENTE sin input de fecha (fecha y autor de registro
// son server-side) y sin responsable, materiales, tipo de limpieza,
// periodicidad ni próxima fecha: esos datos NO existen en la fuente.
function mntContenidoModalRegistroFosaHTML(f, pendienteRefresco) {
  const categoria = mntCategoriaFosaTexto(f.categoria_original) || f.categoria_original;

  return `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center space-x-2.5 min-w-0">
        <span class="text-2xl shrink-0">🕳️</span>
        <div class="min-w-0">
          <h3 class="text-base font-bold text-slate-800 dark:text-white truncate">Registrar mantención</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate">Fosas y Alcantarillado</p>
        </div>
      </div>
      <button type="button" onclick="cerrarModalRegistroFosa()"
        class="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold">&times;</button>
    </div>

    <div class="mt-3 space-y-1.5">
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Unidad: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntTituloFosa(f))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Categoría: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(categoria))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Ubicación: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(mntUbicacionFosa(f)))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Capacidad: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(mntCapacidadOriginalFosa(f)))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
        Se registrará un evento con la fecha, la hora y el autor actuales del sistema.
        Este registro no modifica el historial importado del Excel.
      </p>
    </div>

    <form onsubmit="mntEnviarRegistroFosa(event)" class="mt-4 space-y-3.5">
      <input type="hidden" id="mnt-registro-fosa-id" value="${mntEsc(f.id)}">

      <div>
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Observación (opcional)</label>
        <textarea id="mnt-registro-fosa-observacion" rows="3"
          placeholder="Sin observación registrada si lo dejas vacío"
          class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          La fecha, la hora y el autor del registro se guardan automáticamente en el servidor.
        </p>
      </div>

      <!-- Mensaje inline de error. NO se muestra éxito salvo que
           Supabase confirme la operación. -->
      <div id="mnt-registro-fosa-error"
        class="hidden rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
      </div>

      <!-- Aviso INFORMATIVO: actividad CONFIRMADA + refresco de historial
           fallido. Caja azul, DISTINTA del recuadro rose de error de RPC. -->
      <div id="mnt-registro-fosa-aviso" class="${pendienteRefresco ? '' : 'hidden'} rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-xs font-bold text-blue-800 dark:text-blue-200 leading-relaxed">${pendienteRefresco ? mntEsc(MNT_AVISO_REFRESCO_REGISTRO_FOSA) : ''}</div>

      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2.5">
        <button type="button" onclick="cerrarModalRegistroFosa()"
          class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" id="mnt-registro-fosa-submit" ${pendienteRefresco ? 'disabled' : ''}
          class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-blue-600">
          <span id="mnt-registro-fosa-submit-label">${pendienteRefresco ? 'Mantención registrada' : 'Registrar actividad'}</span>
        </button>
      </div>
    </form>
  `;
}

// Abre la modal para la fosa indicada. El contexto sale del objeto REAL de
// mntFosasBase (leído desde Supabase), nunca de texto de la interfaz.
function abrirModalRegistroFosa(fosaId) {
  // Anti doble RPC: si hay un registro en vuelo NO se permite iniciar otro.
  if (mntRegistroFosaGuardando) {
    console.warn('mntRegistroFosaGuardando activo: se omite abrir un nuevo registro de fosa.');
    return;
  }

  const id = typeof fosaId === 'string' ? fosaId.trim() : '';
  if (!id) return;

  const fosa = mntFosasBase.find(f => f && f.id === id) || null;
  if (!fosa || !fosa.id) return;

  // Permiso UX (mismo criterio que el botón de la ficha). La autoridad real
  // sigue en la RPC.
  if (typeof window.esAdminOperativoActual !== 'function' ||
      window.esAdminOperativoActual() !== true) {
    console.warn('Sin permiso operativo: se omite abrir el modal de registro de fosa.');
    return;
  }

  const overlay = asegurarModalRegistroFosa();
  const cont = document.getElementById('mnt-modal-registro-fosa');
  if (!overlay || !cont) return;

  // Si la actividad de ESTA fosa YA quedó registrada y solo falló el
  // refresco del historial, la modal se abre en estado "ya registrado".
  const pendienteRefresco = mntRegistroFosaPendienteRefresco !== null &&
    mntRegistroFosaPendienteRefresco === fosa.id;

  cont.innerHTML = mntContenidoModalRegistroFosaHTML(fosa, pendienteRefresco);
  overlay.classList.remove('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeRegistroFosa, true);
  document.addEventListener('keydown', mntTeclaEscapeRegistroFosa, true);

  if (!pendienteRefresco) {
    const textarea = document.getElementById('mnt-registro-fosa-observacion');
    if (textarea && typeof textarea.focus === 'function') textarea.focus();
  }
}

// Oculta la modal y retira SOLO su listener de Escape. NO libera el guard.
function cerrarModalRegistroFosa() {
  const overlay = document.getElementById(MNT_MODAL_REGISTRO_FOSA_ID);
  if (overlay) overlay.classList.add('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeRegistroFosa, true);
}

function mntMostrarErrorRegistroFosa(mensaje) {
  const caja = document.getElementById('mnt-registro-fosa-error');
  if (!caja) return;
  caja.textContent = mensaje;   // textContent: nunca HTML de error
  caja.classList.remove('hidden');
}

function mntOcultarErrorRegistroFosa() {
  const caja = document.getElementById('mnt-registro-fosa-error');
  if (!caja) return;
  caja.textContent = '';
  caja.classList.add('hidden');
}

function mntMostrarAvisoRegistroFosa() {
  const caja = document.getElementById('mnt-registro-fosa-aviso');
  if (!caja) return;
  caja.textContent = MNT_AVISO_REFRESCO_REGISTRO_FOSA;
  caja.classList.remove('hidden');
}

function mntMarcarSubmitRegistroFosaRegistrado() {
  const btn = document.getElementById('mnt-registro-fosa-submit');
  const etiqueta = document.getElementById('mnt-registro-fosa-submit-label');
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Mantención registrada';
}

// Ruta de ERROR: la RPC terminó (con fallo), por lo que SÍ se libera el
// guard y se restaura el botón para poder reintentar. La modal PERMANECE
// ABIERTA. En esta ruta NO se confirmó ninguna escritura.
function mntRestaurarSubmitRegistroFosa() {
  mntRegistroFosaGuardando = false;
  const btn = document.getElementById('mnt-registro-fosa-submit');
  const etiqueta = document.getElementById('mnt-registro-fosa-submit-label');
  if (btn) btn.disabled = false;
  if (etiqueta) etiqueta.textContent = 'Registrar actividad';
}

// SUBMIT: única escritura de registro de mantención de fosa desde la vista,
// vía HistorialService.registrarEvento con tipoEntidad 'fosa' y campo
// 'mantencion_fosa'. Observación: trim() o null si queda vacía.
// NO se envía autor, fecha, accion, valor_nuevo, usuario ni tabla.
async function mntEnviarRegistroFosa(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  // Anti doble envío: mientras la RPC está en vuelo se ignora cualquier
  // segundo submit (el botón además queda deshabilitado).
  if (mntRegistroFosaGuardando) return;

  const cont = document.getElementById('mnt-modal-registro-fosa');
  if (!cont) return;

  const inputFosa = document.getElementById('mnt-registro-fosa-id');
  const fosaId = inputFosa ? String(inputFosa.value || '') : '';
  if (!fosaId) return;

  // Si la actividad de ESTA fosa YA quedó registrada y solo falló el
  // refresco del historial, aquí NO se ejecuta ninguna RPC.
  if (mntRegistroFosaPendienteRefresco !== null &&
      mntRegistroFosaPendienteRefresco === fosaId) {
    console.warn('Actividad de fosa ya registrada con refresco pendiente: se omite un segundo envío.');
    return;
  }

  // --- Observación opcional (texto con trim o null; nunca inventada) ---
  const textarea = document.getElementById('mnt-registro-fosa-observacion');
  const observacion = (textarea && typeof textarea.value === 'string' && textarea.value.trim() !== '')
    ? textarea.value.trim()
    : null;

  // --- Bloqueo de doble envío + estado "Registrando..." ---
  const btn = document.getElementById('mnt-registro-fosa-submit');
  const etiqueta = document.getElementById('mnt-registro-fosa-submit-label');
  mntRegistroFosaGuardando = true;
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Registrando...';
  mntOcultarErrorRegistroFosa();

  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }

    // ÚNICA escritura. Solo tipoEntidad, entidadId, campo y observación.
    await window.HistorialService.registrarEvento({
      tipoEntidad: 'fosa',
      entidadId: fosaId,
      campo: 'mantencion_fosa',
      observacion: observacion
    });
  } catch (err) {
    // Detalle técnico SOLO en consola; en la modal, mensaje amigable.
    console.error('Error registrando la mantención de la fosa:', err);
    const codigo = err && err.codigo;
    const mensaje = MNT_MENSAJES_ERROR_REGISTRO_FOSA[codigo] || 'No fue posible registrar la mantención.';
    mntMostrarErrorRegistroFosa(mensaje);
    mntRestaurarSubmitRegistroFosa();
    return;
  }

  // ÉXITO DE LA RPC: la actividad YA quedó registrada en
  // mantencion_historial (append-only, autor y fecha server-side; ni el
  // registro principal ni el historial importado se modifican). Desde este
  // punto NINGÚN fallo posterior puede presentarse como fallo de escritura.
  let refrescoOk = false;
  try {
    refrescoOk = (await mntRefrescarActividadesFosa(fosaId)) === true;
  } catch (err) {
    console.error('Error inesperado refrescando las actividades de la fosa:', err);
    refrescoOk = false;
  } finally {
    mntRegistroFosaGuardando = false;
  }

  // RUTA B — RPC exitosa + refresco exitoso: solo se repintó el bloque de
  // actividades (datos frescos) y se cierra la modal.
  if (refrescoOk) {
    cerrarModalRegistroFosa();
    return;
  }

  // RUTA C — RPC exitosa + refresco fallido: la modal PERMANECE ABIERTA
  // con el aviso inequívoco; el botón queda "Mantención registrada" y
  // cualquier nuevo envío de esta fosa queda bloqueado.
  mntRegistroFosaPendienteRefresco = fosaId;
  mntMostrarAvisoRegistroFosa();
  mntMarcarSubmitRegistroFosaRegistrado();
}

// -----------------------------------------------------------
// Modal: ANULAR REGISTRO DE ACTIVIDAD (Fosas)
// -----------------------------------------------------------
// La anulación NO elimina nada: el evento original (fecha de registro, autor
// y observación) se conserva y se agrega el estado ANULADO con motivo, quién
// anuló y fecha de anulación. ÚNICA vía: HistorialService.anularHistorial
// ({ historialId, motivo }). El backend NO recalcula ningún estado
// operativo (no existe) ni modifica el registro principal ni el historial
// importado del Excel.
// Exige Administrador PERMANENTE (backend: es_administrador_permanente_actual).

// Crea la modal UNA sola vez.
function asegurarModalAnularFosa() {
  let overlay = document.getElementById(MNT_MODAL_ANULAR_FOSA_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MNT_MODAL_ANULAR_FOSA_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Anular registro de actividad');
  overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overflow-y-auto';
  overlay.onclick = function (ev) {
    // UX-02: fondo sin cierre.
  };
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 my-auto text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
      <div id="mnt-modal-anular-fosa"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function mntTeclaEscapeAnularFosa(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

// Contenido de la modal: contexto REAL del evento original (fecha de
// registro, autor y observación) + contexto de la unidad SOLO si está
// disponible en mntFosasBase + advertencia de que esta anulación NO modifica
// el historial importado del Excel + textarea del motivo OBLIGATORIO.
// NO muestra valor_nuevo/valor_anterior (detalle técnico del backend) y
// NUNCA muestra UUID.
function mntContenidoModalAnularFosaHTML(registro, f, pendienteRefresco) {
  const ev = registro || {};

  const observacionTexto = (typeof ev.observacion === 'string' && ev.observacion.trim() !== '')
    ? ev.observacion.trim()
    : 'Sin observación registrada';

  const autorTexto = (typeof (window.UsuariosService?.nombreParaMostrar?.(ev,'autor_nombre_snapshot') ?? ev.autor_nombre_snapshot) === 'string' && (window.UsuariosService?.nombreParaMostrar?.(ev,'autor_nombre_snapshot') ?? ev.autor_nombre_snapshot).trim() !== '')
    ? (window.UsuariosService?.nombreParaMostrar?.(ev,'autor_nombre_snapshot') ?? ev.autor_nombre_snapshot).trim()
    : 'Autor no registrado';

  let bloqueFosa = '';
  if (f && f.id) {
    const categoria = mntCategoriaFosaTexto(f.categoria_original) || f.categoria_original;
    bloqueFosa = `
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Unidad: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntTituloFosa(f))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Categoría: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(categoria))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Ubicación: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntSinDato(mntUbicacionFosa(f)))}</span>
      </p>
    `;
  }

  return `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center space-x-2.5 min-w-0">
        <span class="text-2xl shrink-0">⛔</span>
        <div class="min-w-0">
          <h3 class="text-base font-bold text-slate-800 dark:text-white truncate">Anular registro de actividad</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate">Fosas y Alcantarillado</p>
        </div>
      </div>
      <button type="button" onclick="cerrarModalAnularFosa()"
        class="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold">&times;</button>
    </div>

    <div class="mt-3 space-y-2">
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed">
        Esta acción invalidará esta actividad, pero conservará el evento original para trazabilidad.
      </p>
      <div class="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-[11px] font-bold text-blue-800 dark:text-blue-200 leading-relaxed">
        Esta anulación no modifica el historial importado del Excel ni los datos de la unidad.
      </div>

      <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 pt-1">Actividad original</p>
      ${bloqueFosa}
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        Registro en el sistema: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(mntFechaHoraRevisionTexto(ev.created_at))}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Autor original: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(autorTexto)}</span>
      </p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 break-words">
        Observación original: <span class="font-bold text-slate-800 dark:text-slate-200">${mntEsc(observacionTexto)}</span>
      </p>
    </div>

    <form onsubmit="mntEnviarAnularFosa(event)" class="mt-4 space-y-3.5">
      <!-- IDs reales: historialId (clave de la anulación y del pending
           flag) y fosaId REAL (ev.entidad_id, SOLO para el refresh visual;
           NO se envía a la RPC). NUNCA se infieren de la UI. -->
      <input type="hidden" id="mnt-anular-fosa-id" value="${mntEsc(ev.id)}">
      <input type="hidden" id="mnt-anular-fosa-fosa-id" value="${mntEsc(ev.entidad_id)}">

      <div>
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Motivo de anulación *</label>
        <textarea id="mnt-anular-fosa-motivo" rows="3"
          placeholder="Indica por qué se anula este registro"
          class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"></textarea>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          El motivo es obligatorio y queda registrado en la trazabilidad de la anulación.
        </p>
      </div>

      <!-- Mensaje inline de error. NO se muestra éxito salvo que
           Supabase confirme la operación. -->
      <div id="mnt-anular-fosa-error"
        class="hidden rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
      </div>

      <!-- Aviso INFORMATIVO: anulación CONFIRMADA + refresco fallido. -->
      <div id="mnt-anular-fosa-aviso" class="${pendienteRefresco ? '' : 'hidden'} rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-xs font-bold text-blue-800 dark:text-blue-200 leading-relaxed">${pendienteRefresco ? mntEsc(MNT_AVISO_REFRESCO_ANULAR_FOSA) : ''}</div>

      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2.5">
        <button type="button" onclick="cerrarModalAnularFosa()"
          class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" id="mnt-anular-fosa-submit" ${pendienteRefresco ? 'disabled' : ''}
          class="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-rose-600">
          <span id="mnt-anular-fosa-submit-label">${pendienteRefresco ? 'Registro anulado' : 'Anular registro'}</span>
        </button>
      </div>
    </form>
  `;
}

// Abre la modal para la actividad indicada. El contexto sale del evento
// ORIGINAL registrado por el renderer: nada se infiere del texto de la UI.
function abrirModalAnularFosa(historialId) {
  // Anti doble RPC: si hay una anulación en vuelo NO se permite iniciar otra.
  if (mntAnulacionFosaGuardando) {
    console.warn('mntAnulacionFosaGuardando activo: se omite abrir una nueva anulación de fosa.');
    return;
  }

  const id = typeof historialId === 'string' ? historialId.trim() : '';
  if (!id) return;

  const registro = mntFosaEventosAnulables.get(id);
  if (!registro || !registro.id) {
    console.warn('Anulación de fosa: actividad no disponible en memoria, se omite abrir la modal.');
    return;
  }
  // Sin fosaId REAL no hay forma legítima de refrescar las actividades
  // tras la escritura: mejor no abrir que arriesgar un refresh incorrecto.
  if (!registro.entidad_id) {
    console.warn('Anulación de fosa: la actividad no tiene entidad_id, se omite abrir la modal.');
    return;
  }

  const overlay = asegurarModalAnularFosa();
  const cont = document.getElementById('mnt-modal-anular-fosa');
  if (!overlay || !cont) return;

  // Contexto de la unidad SOLO desde datos reales ya leídos; la modal
  // funciona igual sin él.
  const f = mntFosasBase.find(x => x && x.id === registro.entidad_id) || null;

  // Si la anulación de ESTA fosa YA quedó registrada y solo falló el
  // refresco, la modal se abre en estado "ya anulado".
  const pendienteRefresco = mntAnulacionFosaPendienteRefresco !== null &&
    mntAnulacionFosaPendienteRefresco === String(registro.id);

  cont.innerHTML = mntContenidoModalAnularFosaHTML(registro, f, pendienteRefresco);
  overlay.classList.remove('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeAnularFosa, true);
  document.addEventListener('keydown', mntTeclaEscapeAnularFosa, true);

  if (!pendienteRefresco) {
    const textarea = document.getElementById('mnt-anular-fosa-motivo');
    if (textarea && typeof textarea.focus === 'function') textarea.focus();
  }
}

// Oculta la modal y retira SOLO su listener de Escape. NO libera el guard.
function cerrarModalAnularFosa() {
  const overlay = document.getElementById(MNT_MODAL_ANULAR_FOSA_ID);
  if (overlay) overlay.classList.add('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeAnularFosa, true);
}

function mntMostrarErrorAnularFosa(mensaje) {
  const caja = document.getElementById('mnt-anular-fosa-error');
  if (!caja) return;
  caja.textContent = mensaje;   // textContent: nunca HTML de error
  caja.classList.remove('hidden');
}

function mntOcultarErrorAnularFosa() {
  const caja = document.getElementById('mnt-anular-fosa-error');
  if (!caja) return;
  caja.textContent = '';
  caja.classList.add('hidden');
}

function mntMostrarAvisoAnularFosa() {
  const caja = document.getElementById('mnt-anular-fosa-aviso');
  if (!caja) return;
  caja.textContent = MNT_AVISO_REFRESCO_ANULAR_FOSA;
  caja.classList.remove('hidden');
}

function mntMarcarSubmitAnularFosaAnulado() {
  const btn = document.getElementById('mnt-anular-fosa-submit');
  const etiqueta = document.getElementById('mnt-anular-fosa-submit-label');
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Registro anulado';
}

// Ruta de ERROR: la RPC terminó (con fallo), por lo que SÍ se libera el
// guard y se restaura el botón para poder reintentar. La modal PERMANECE
// ABIERTA. En esta ruta NO se confirmó ninguna escritura.
function mntRestaurarSubmitAnularFosa() {
  mntAnulacionFosaGuardando = false;
  const btn = document.getElementById('mnt-anular-fosa-submit');
  const etiqueta = document.getElementById('mnt-anular-fosa-submit-label');
  if (btn) btn.disabled = false;
  if (etiqueta) etiqueta.textContent = 'Anular registro';
}

// SUBMIT: única escritura de anulación de fosa desde la vista, vía
// HistorialService.anularHistorial({ historialId, motivo }). El motivo se
// valida localmente con trim() ANTES de la RPC (vacío ⇒ error local, sin
// llamada). NO se envía fosaId, entidad, tipo, campo, acción, autor, fecha
// ni estado: todo lo resuelve el backend.
async function mntEnviarAnularFosa(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  // Anti doble envío: mientras la RPC está en vuelo se ignora cualquier
  // segundo submit.
  if (mntAnulacionFosaGuardando) return;

  const cont = document.getElementById('mnt-modal-anular-fosa');
  if (!cont) return;

  const inputHistorial = document.getElementById('mnt-anular-fosa-id');
  const historialId = inputHistorial ? String(inputHistorial.value || '') : '';
  if (!historialId) return;

  const inputFosa = document.getElementById('mnt-anular-fosa-fosa-id');
  const fosaId = inputFosa ? String(inputFosa.value || '') : '';

  // Si la anulación de ESTA fosa YA quedó registrada y solo falló el
  // refresco, aquí NO se ejecuta ninguna RPC.
  if (mntAnulacionFosaPendienteRefresco !== null &&
      mntAnulacionFosaPendienteRefresco === historialId) {
    console.warn('Actividad de fosa ya anulada con refresco pendiente: se omite un segundo envío.');
    return;
  }

  // --- Motivo (obligatorio; trim ANTES de la RPC) ---
  const textarea = document.getElementById('mnt-anular-fosa-motivo');
  const motivo = (textarea && typeof textarea.value === 'string')
    ? textarea.value.trim()
    : '';
  if (!motivo) {
    mntMostrarErrorAnularFosa(MNT_MENSAJES_ERROR_ANULAR_FOSA.MOTIVO_REQUERIDO);
    return;
  }

  // --- Bloqueo de doble envío + estado "Anulando..." ---
  const btn = document.getElementById('mnt-anular-fosa-submit');
  const etiqueta = document.getElementById('mnt-anular-fosa-submit-label');
  mntAnulacionFosaGuardando = true;
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Anulando...';
  mntOcultarErrorAnularFosa();

  try {
    if (!window.HistorialService) {
      throw new Error('HistorialService no está cargado.');
    }

    // ÚNICA escritura. Solo historialId + motivo; fosaId NO viaja a la RPC
    // (se usa más abajo, únicamente, para el refresh visual).
    await window.HistorialService.anularHistorial({
      historialId: historialId,
      motivo: motivo
    });
  } catch (err) {
    // Detalle técnico SOLO en consola; en la modal, mensaje amigable.
    // REGISTRO_YA_ANULADO se presenta como fallo informativo: NO se trata
    // como éxito ni se re-ejecuta ninguna RPC automáticamente.
    console.error('Error anulando la actividad de la fosa:', err);
    const codigo = err && err.codigo;
    const mensaje = MNT_MENSAJES_ERROR_ANULAR_FOSA[codigo] || 'No fue posible anular el registro.';
    mntMostrarErrorAnularFosa(mensaje);
    mntRestaurarSubmitAnularFosa();
    return;
  }

  // ÉXITO DE LA RPC: la anulación YA quedó registrada en
  // mantencion_historial_anulaciones. El backend NO recalcula ningún estado
  // (no existe estado operativo en fosas) ni modifica el registro principal
  // ni el historial importado del Excel.
  let refrescoOk = false;
  try {
    refrescoOk = (await mntRefrescarActividadesFosa(fosaId)) === true;
  } catch (err) {
    console.error('Error inesperado refrescando las actividades tras la anulación de fosa:', err);
    refrescoOk = false;
  } finally {
    mntAnulacionFosaGuardando = false;
  }

  // RUTA B — RPC exitosa + refresco exitoso: solo se repintó el bloque de
  // actividades (evento original visible + chip ANULADO + trazabilidad, y
  // sin botón). Se cierra la modal.
  if (refrescoOk) {
    cerrarModalAnularFosa();
    return;
  }

  // RUTA C — RPC exitosa + refresco fallido: la modal PERMANECE ABIERTA
  // con el aviso inequívoco; el botón queda "Registro anulado" y cualquier
  // nueva anulación de esta fosa queda bloqueada.
  mntAnulacionFosaPendienteRefresco = historialId;
  mntMostrarAvisoAnularFosa();
  mntMarcarSubmitAnularFosaAnulado();
}

// ==========================================================
// GUÍA PREVENTIVA — FASE 2.8
// ==========================================================
// DOCUMENTACIÓN PREVENTIVA (fuente: mantenciones preventivas.docx).
// NO es un catálogo de mantenciones ejecutadas:
// - NO se llama getMantenciones() ni se relaciona con elementos_mantenibles.
// - NO genera fechas, tareas, barras, duración ni progreso.
// - NO entra al Gantt general, a Fechas Próximas ni a Notificaciones.
// - frecuencia_recomendada (ANUAL) es SOLO dato documental a nivel guía:
//   jamás se convierte en fecha_programada ni en tarea recurrente.
// - Solo lectura: sin CRUD, sin editar/crear/eliminar recomendaciones, sin
//   marcar completadas ni programar.
// - getResumen() NO cambia: la tarjeta principal sigue contando 1 guía
//   (this._contar('guias_mantencion')). Los conteos de 6 secciones y 28
//   recomendaciones se muestran DENTRO del documento y SIEMPRE se derivan
//   de los arrays reales (nunca se hardcodean).
//
// Presentación dentro de la MISMA modal (modal única existente), SIN
// listado → ficha y SIN segunda modal, porque existe UNA sola guía:
//   encabezado documental → buscador → 6 acordeones → origen / documento
//
// Estado local (Fase 2.8): mntGuiasBase, mntGuiaSecciones, mntGuiaItems,
// mantencionFiltroGuia.texto, mntSeccionesGuiaAbiertas.
// NO existe mantencionGuiaSeleccionada.

// ------------------------------------------------------------
// RESET del estado de Guía Preventiva (solo estado local; NO consulta
// Supabase ni toca _guiasCache). Lo usan abrirMantencionSubapartado() y
// cerrarMantencionSubapartado() (X, Cerrar, Escape y overlay).
// mntSeccionesGuiaAbiertas = null ⇒ la próxima apertura despliega SOLO la
// primera sección y deja las demás cerradas.
// ------------------------------------------------------------
function mntResetGuia() {
  mantencionFiltroGuia.texto = '';
  mntSeccionesGuiaAbiertas = null;
}

// Guía vigente: EXACTAMENTE la guía con activo = true (los datos actuales
// tienen una sola guía y está activa). Si no hay guía activa, la vista
// muestra "Sin guía preventiva activa registrada" (no se inventa contenido
// ni se cae a una guía inactiva).
function mntGuiaActiva(guias) {
  const lista = Array.isArray(guias) ? guias : mntGuiasBase;
  return lista.find(g => g && g.activo) || null;
}

// Secciones de la guía en ORDEN DOCUMENTAL (seccion.orden ASC 1 → 6).
// Defensivo en cliente aunque el servicio ya ordene: NUNCA alfabético.
// C2G-6: guia_mantencion_secciones SÍ tiene campo `activo` (migración de
// contenido maestro); la vista de SOLO LECTURA muestra únicamente las
// secciones activas (activo !== false). Las inactivas solo son visibles
// para el Administrador permanente dentro de la modal de administración.
function mntSeccionesActivasGuia(guiaId) {
  return mntGuiaSecciones
    .filter(s => s && s.guia_id === guiaId && s.activo !== false)
    .slice()
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
}

// Ítems vigentes (activo === true). Los datos actuales tienen los 28 activos;
// el filtro es defensivo por si aparece uno inactivo, que NO se muestre como
// recomendación vigente. El campo se conserva en los datos.
function mntItemsActivosGuia() {
  return mntGuiaItems.filter(i => i && i.activo);
}

// Ítems de UNA sección en orden de ítem (item.orden ASC), defensivamente.
function mntItemsSeccionGuia(seccionId) {
  return mntItemsActivosGuia()
    .filter(i => i.seccion_id === seccionId)
    .slice()
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
}

// Conteos DERIVADOS de los arrays reales (secciones de la guía activa y
// ítems activos asociados a esas secciones). NUNCA se hardcodea 6 ni 28.
function mntConteosGuia(secciones) {
  const lista = Array.isArray(secciones) ? secciones : [];
  let recomendaciones = 0;
  lista.forEach(s => { recomendaciones += mntItemsSeccionGuia(s.id).length; });
  return { secciones: lista.length, recomendaciones: recomendaciones };
}

// Textos de conteo con plural correcto en español
// (1 recomendación / 13 recomendaciones — nunca "recomendaciónes";
//  1 sección / 6 secciones). Solo números + palabras fijas: seguro en HTML.
function mntTextoRecomendaciones(cantidad) {
  const n = Number(cantidad) || 0;
  return n + ' recomendaci' + (n === 1 ? 'ón' : 'ones');
}

function mntTextoSecciones(cantidad) {
  const n = Number(cantidad) || 0;
  return n + ' secci' + (n === 1 ? 'ón' : 'ones');
}

// Etiqueta de presentación de valores de BD en mayúsculas
// (PREVENTIVA → Preventiva, INVIERNO → Invierno, ANUAL → Anual).
// SOLO cambia el texto visible; el valor original de BD queda intacto.
// Devuelve null cuando no hay valor (no se inventa etiqueta).
function mntEtiquetaDatoGuia(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim().toLowerCase();
  if (!texto) return null;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Normalización del texto de búsqueda (case-insensitive, sin espacios
// sobrantes). Local de Fase 2.8: no se modifica ningún helper de fases
// anteriores.
function mntNormalizarBusquedaGuia(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto).trim().toLowerCase();
}

// Buscador de la guía: busca en seccion.titulo, seccion.codigo y
// item.contenido (case-insensitive).
// - Sin búsqueda → todas las secciones con TODOS sus ítems activos.
// - Coincide el título o el código de la sección → la sección con TODOS sus
//   ítems activos.
// - Coincide solo en ítems → la sección SOLO con los ítems coincidentes.
// - Sin ninguna coincidencia → la sección queda OCULTA mientras exista
//   búsqueda.
// Respeta el orden documental de secciones e ítems.
function mntFiltrarGuia(guiaId) {
  const texto = mntNormalizarBusquedaGuia(mantencionFiltroGuia.texto);
  const filas = [];

  mntSeccionesActivasGuia(guiaId).forEach(seccion => {
    const itemsSeccion = mntItemsSeccionGuia(seccion.id);

    if (!texto) {
      filas.push({ seccion: seccion, items: itemsSeccion });
      return;
    }

    const titulo = mntNormalizarBusquedaGuia(seccion.titulo);
    const codigo = mntNormalizarBusquedaGuia(seccion.codigo);
    const coincideSeccion = titulo.indexOf(texto) !== -1 || codigo.indexOf(texto) !== -1;

    if (coincideSeccion) {
      // A): la sección coincide → se muestra completa.
      filas.push({ seccion: seccion, items: itemsSeccion });
      return;
    }

    // B): solo coinciden ítems → sección visible con esos ítems.
    const itemsCoincidentes = itemsSeccion.filter(item =>
      mntNormalizarBusquedaGuia(item.contenido).indexOf(texto) !== -1
    );
    if (itemsCoincidentes.length > 0) {
      filas.push({ seccion: seccion, items: itemsCoincidentes });
    }
    // C): sin coincidencias → la sección queda oculta (no se agrega).
  });

  return filas;
}

// Estado del acordeón de una sección.
// Con búsqueda activa TODAS las secciones con coincidencias se muestran
// abiertas (el usuario ve los resultados sin desplegarlas a mano).
// Sin búsqueda se respeta mntSeccionesGuiaAbiertas (se permite tener más de
// una abierta a la vez).
function mntSeccionGuiaAbierta(seccionId, hayBusqueda) {
  if (hayBusqueda) return true;
  if (!Array.isArray(mntSeccionesGuiaAbiertas)) return false;
  return mntSeccionesGuiaAbiertas.indexOf(seccionId) !== -1;
}

// ------------------------------------------------------------
// PANEL DE LA GUÍA PREVENTIVA (DENTRO de la modal única)
// ------------------------------------------------------------
// Sin listado → ficha: al abrir "Guía Preventiva" se muestra directamente
// el documento navegable completo. No usa mntPreviewHTML de Fase 1 (esa
// preview cortaba el contenido en 6 columnas y exponía UUID).
function mntPanelGuiaHTML(meta, datos) {
  const d = (datos && typeof datos === 'object') ? datos : {};
  mntGuiasBase = Array.isArray(d.guias) ? d.guias : [];
  mntGuiaSecciones = Array.isArray(d.secciones) ? d.secciones : [];
  mntGuiaItems = Array.isArray(d.items) ? d.items : [];

  const guia = mntGuiaActiva(mntGuiasBase);

  // C2G-6: botón de administración SOLO para Administrador permanente
  // (helper real esAdminPermanenteActual() de js/app.js). Los usuarios
  // habilitados normales mantienen EXACTAMENTE la experiencia de solo
  // lectura actual: sin ningún botón ni control de edición.
  const botonesAdmin = (guia && mntGuiaAdminEsPermanente())
    ? `<button type="button" onclick="abrirModalAdminGuia()"
        class="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 px-3 py-1.5 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors">
        Administrar guía
      </button>`
    : '';

  const encabezado = `
    <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
      <p class="text-[11px] text-slate-500 dark:text-slate-400">Sección de Mantención General</p>
      <div class="flex flex-wrap items-center gap-2">
        ${botonesAdmin}
        <span class="text-xs font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 px-3 py-1.5 rounded-xl">
          Fase 2 · Guía Preventiva
        </span>
      </div>
    </div>
  `;

  // Comportamiento defensivo: sin guía activa NO se inventa contenido.
  if (!guia) {
    return `
      <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
        ${encabezado}
        <div class="mt-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-10 text-center space-y-2">
          <span class="text-4xl block">📖</span>
          <h4 class="text-base font-black text-slate-700 dark:text-slate-200">Sin guía preventiva activa registrada</h4>
          <p class="text-xs text-slate-500 dark:text-slate-400">Aún no existe una guía preventiva activa.</p>
        </div>
      </div>
    `;
  }

  const seccionesGuia = mntSeccionesActivasGuia(guia.id);

  // Estado inicial del acordeón: SOLO la primera sección abierta
  // (mntSeccionesGuiaAbiertas === null ⇒ sin inicializar).
  if (!Array.isArray(mntSeccionesGuiaAbiertas) && seccionesGuia.length > 0) {
    mntSeccionesGuiaAbiertas = [seccionesGuia[0].id];
  }

  const conteos = mntConteosGuia(seccionesGuia);
  const filas = mntFiltrarGuia(guia.id);

  let cuerpo;
  if (seccionesGuia.length === 0) {
    cuerpo = `
      <div class="mt-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-1">
        <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Sin secciones registradas</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Esta guía todavía no tiene secciones documentadas.</p>
      </div>
    `;
  } else {
    cuerpo = `
      ${mntBuscadorGuiaHTML(conteos, filas)}
      <div id="mnt-secciones-guia" class="mt-4 space-y-3">
        ${mntSeccionesGuiaHTML(filas)}
      </div>
    `;
  }

  return `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      ${encabezado}
      ${mntEncabezadoGuiaHTML(guia, conteos)}
      ${cuerpo}
      ${mntOrigenGuiaHTML(guia)}
    </div>
  `;
}

// Encabezado documental: título real del documento + descripción real (sin
// resumir ni reemplazar) + metadatos compactos + contadores derivados.
// NO se muestran id, area_id, created_at ni updated_at.
function mntEncabezadoGuiaHTML(guia, conteos) {
  const hayDescripcion = guia.descripcion !== null && guia.descripcion !== undefined && guia.descripcion !== '';

  // Badges de metadatos: solo se pintan los que tienen valor real.
  // NO se crean filtros por tipo/temporada/frecuencia: existe UNA guía con
  // UN único valor de cada uno.
  const metadatos = [
    { clave: 'Tipo', valor: mntEtiquetaDatoGuia(guia.tipo) },
    { clave: 'Temporada', valor: mntEtiquetaDatoGuia(guia.temporada) },
    { clave: 'Frecuencia recomendada', valor: mntEtiquetaDatoGuia(guia.frecuencia_recomendada) }
  ].filter(m => m.valor);

  return `
    <div class="mt-5">
      <h4 class="text-lg font-black text-slate-900 dark:text-white leading-snug">${mntEsc(mntSinDato(guia.titulo))}</h4>
      ${hayDescripcion ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">${mntEsc(guia.descripcion)}</p>` : ''}
      <div class="flex flex-wrap gap-2 mt-3">
        ${metadatos.map(m => `
          <span class="text-[10px] font-black px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
            ${mntEsc(m.clave)}: ${mntEsc(m.valor)}
          </span>
        `).join('')}
        <span class="text-[10px] font-black px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          ${mntTextoSecciones(conteos.secciones)} · ${mntTextoRecomendaciones(conteos.recomendaciones)}
        </span>
      </div>
    </div>
  `;
}

// Buscador ÚNICO de la guía (no hay filtros select: con una sola guía y un
// solo tipo/temporada/frecuencia no aportarían nada).
function mntBuscadorGuiaHTML(conteos, filas) {
  return `
    <div class="mt-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-2 border border-slate-100 dark:border-slate-800">
      <label for="mnt-buscar-guia" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Buscar</label>
      <input id="mnt-buscar-guia" type="text" value="${mntEsc(mantencionFiltroGuia.texto)}"
        oninput="mntOnBuscarGuia(this.value)"
        placeholder="Buscar en la guía preventiva..."
        class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500" />
      <p id="mnt-contador-guia" class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
        ${mntTextoContadorGuia(filas, conteos)}
      </p>
    </div>
  `;
}

// Contador dinámico derivado de los arrays reales:
// sin búsqueda → total general; con búsqueda → "X recomendaciones de 28"
// (el total SIEMPRE sale del array real, nunca hardcodeado).
function mntTextoContadorGuia(filas, conteos) {
  const lista = Array.isArray(filas) ? filas : [];
  const texto = mntNormalizarBusquedaGuia(mantencionFiltroGuia.texto);

  if (!texto) {
    return `Mostrando ${mntTextoRecomendaciones(conteos.recomendaciones)} en ${mntTextoSecciones(conteos.secciones)}`;
  }

  const visibles = lista.reduce((total, fila) => total + ((fila && fila.items) ? fila.items.length : 0), 0);
  return `${mntTextoRecomendaciones(visibles)} de ${conteos.recomendaciones}`;
}

// Acordeones de las secciones (una sola modal; sin 28 tarjetas principales).
function mntSeccionesGuiaHTML(filas) {
  const lista = Array.isArray(filas) ? filas : [];
  const hayBusqueda = mntNormalizarBusquedaGuia(mantencionFiltroGuia.texto) !== '';

  if (lista.length === 0) {
    return `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-1">
        <span class="text-3xl block">🔍</span>
        <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Sin resultados para la búsqueda</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Prueba con otro texto de recomendación o de sección.</p>
      </div>
    `;
  }

  return lista.map((fila, indice) => mntSeccionGuiaHTML(fila, indice, hayBusqueda)).join('');
}

function mntSeccionGuiaHTML(fila, indice, hayBusqueda) {
  const seccion = fila && fila.seccion ? fila.seccion : null;
  if (!seccion) return '';

  const items = Array.isArray(fila.items) ? fila.items : [];
  const abierta = mntSeccionGuiaAbierta(seccion.id, hayBusqueda);
  // Número de sección = orden documental real (1 → 6); con fallback al
  // índice solo si el orden viniera ausente. Nunca orden alfabético.
  const numero = (seccion.orden !== null && seccion.orden !== undefined && seccion.orden !== '') ? seccion.orden : (indice + 1);

  return `
    <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button type="button" onclick="mntAlternarSeccionGuia('${mntEsc(seccion.id)}')"
        class="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left">
        <span class="flex items-start gap-3 min-w-0">
          <span class="shrink-0 w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-900 flex items-center justify-center text-[11px] font-black text-blue-800 dark:text-blue-300">${mntEsc(numero)}.</span>
          <span class="min-w-0">
            <span class="block text-sm font-extrabold text-slate-900 dark:text-white leading-snug">${mntEsc(mntSinDato(seccion.titulo))}</span>
            <span class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">${mntTextoRecomendaciones(items.length)}</span>
          </span>
        </span>
        <span class="shrink-0 text-sm font-black text-slate-400 dark:text-slate-500">${abierta ? '−' : '+'}</span>
      </button>
      ${abierta ? `
        <div class="px-4 py-3 space-y-3">
          ${items.length > 0
            ? items.map((item, i) => mntItemGuiaHTML(item, i)).join('')
            : '<p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Sin recomendaciones registradas en esta sección.</p>'}
        </div>
      ` : ''}
    </div>
  `;
}

// Recomendación: número + contenido EXACTO tal como fue persistido.
// Siempre escapado con mntEsc(): el contenido NUNCA entra como innerHTML.
// No se inventan títulos ni se convierte en tarjeta de mantención.
function mntItemGuiaHTML(item, indice) {
  if (!item) return '';
  const numero = (item.orden !== null && item.orden !== undefined && item.orden !== '') ? item.orden : (indice + 1);
  const contenido = (item.contenido === null || item.contenido === undefined) ? '' : String(item.contenido);

  return `
    <div class="flex items-start gap-3">
      <span class="shrink-0 w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[11px] font-black text-slate-600 dark:text-slate-300">${mntEsc(numero)}</span>
      <p class="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-relaxed break-words">${mntEsc(contenido)}</p>
    </div>
  `;
}

// ORIGEN / DOCUMENTO (trazabilidad solo a nivel de guía: ni las secciones
// ni los ítems tienen archivo/hoja/fila/celda propios, y la fuente es un
// DOCX, por lo que NO se inventa hoja, fila ni celda).
// archivo_url está NULL en el dato real → NO se pinta ningún botón de
// "Abrir/Descargar documento" ni un botón deshabilitado.
// No se repite "Tipo" aquí porque ya aparece en el encabezado.
function mntOrigenGuiaHTML(guia) {
  return `
    <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 mb-3">Origen / Documento</h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        ${mntCampoFichaHTML('Archivo', guia.archivo_origen)}
        ${mntCampoFichaHTML('Fuente', guia.fuente)}
      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// Manejadores de la guía (solo re-render de secciones y contador, sin
// recargar la SPA, sin tocar el <input> — así conserva el foco al escribir)
// ------------------------------------------------------------
function mntOnBuscarGuia(valor) {
  mantencionFiltroGuia.texto = valor || '';
  mntRefrescarGuia();
}

// Abre/cierra el acordeón de una sección (se permite más de una abierta).
// Con búsqueda activa las secciones coincidentes permanecen abiertas.
function mntAlternarSeccionGuia(seccionId) {
  if (!Array.isArray(mntSeccionesGuiaAbiertas)) mntSeccionesGuiaAbiertas = [];
  const indice = mntSeccionesGuiaAbiertas.indexOf(seccionId);
  if (indice === -1) mntSeccionesGuiaAbiertas.push(seccionId);
  else mntSeccionesGuiaAbiertas.splice(indice, 1);
  mntRefrescarGuia();
}

// Actualiza únicamente el bloque de secciones y el contador.
function mntRefrescarGuia() {
  const cont = document.getElementById('mnt-secciones-guia');
  if (!cont) return;

  const guia = mntGuiaActiva(mntGuiasBase);
  if (!guia) return;

  const seccionesGuia = mntSeccionesActivasGuia(guia.id);
  const conteos = mntConteosGuia(seccionesGuia);
  const filas = mntFiltrarGuia(guia.id);

  cont.innerHTML = mntSeccionesGuiaHTML(filas);

  const contador = document.getElementById('mnt-contador-guia');
  if (contador) contador.textContent = mntTextoContadorGuia(filas, conteos);
}

// ==========================================================
// GUÍA PREVENTIVA — CONTENIDO MAESTRO ADMINISTRABLE (C2G-6)
// ==========================================================
// La guía sigue siendo DOCUMENTACIÓN PREVENTIVA: NO es una checklist.
// NO se agregan completado/pendiente, fecha realizada, responsable,
// próxima fecha, estado, materiales ni alertas.
//
// Permisos: solo Administrador PERMANENTE administra (helper real
// esAdminPermanenteActual() de js/app.js). Los usuarios habilitados
// normales mantienen EXACTAMENTE la experiencia de solo lectura.
//
// Escritura: EXCLUSIVAMENTE vía MantencionesService — guardarGuia(),
// guardarSeccion() y guardarItemGuia() (RPCs server-side con auditoría).
// NUNCA supabase.rpc directo, ni .insert()/.update()/.delete(), ni
// HistorialService. El reordenamiento (C2G-7) usa EXCLUSIVAMENTE
// MantencionesService.reordenarContenidoGuia(), nunca updates sueltos.
//
// Sin borrado físico: "Desactivar" = activo false vía RPC; el registro
// permanece visible para el administrador y puede reactivarse.
//
// Datos NO editables desde la UI: fuente, archivo_origen, archivo_url,
// area_id, activo de la guía y orden de la guía. El código de sección es
// dato técnico server-side: se muestra como solo lectura y no se pide.
//
// Estado local (independiente del acordeón de solo lectura):
//   mntGuiaAdminVista, mntGuiaAdminSeccionId, mntGuiaAdminEditando,
//   mntGuiaAdminGuardando, mntGuiaAdminPendienteRefresco.
// NO usa localStorage; NO toca _guiasCache directamente.

const MNT_MODAL_ADMIN_GUIA_ID = 'mnt-modal-admin-guia-overlay';

// Aviso INEQUÍVOCO de la Ruta C: la RPC YA quedó registrada pero la
// relectura posterior falló. Mismo criterio que Fosas (§4.6 del HANDOFF).
const MNT_AVISO_REFRESCO_ADMIN_GUIA = 'El cambio sí quedó guardado, pero no fue posible actualizar la vista. No vuelvas a enviarlo. Cierra y vuelve a abrir Guía Preventiva.';

// C2G-7: aviso EXPLÍCITO para el reordenamiento (Ruta C del orden).
const MNT_AVISO_REFRESCO_ORDEN_GUIA = 'El nuevo orden quedó guardado, pero no fue posible actualizar la vista. No vuelvas a mover elementos hasta que la vista se actualice. Cierra y vuelve a abrir Guía Preventiva.';

const MNT_MENSAJES_ERROR_ADMIN_GUIA = {
  SESION_INVALIDA: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
  NO_AUTORIZADO: 'Solo un administrador permanente puede administrar la guía.',
  CAMPO_NO_PERMITIDO: 'Este dato no admite cambios.',
  CONFIG_INCOMPLETA: 'La configuración de la guía no está disponible.',
  ENTIDAD_NO_ENCONTRADA: 'El contenido seleccionado ya no está disponible.',
  TIPO_NO_IMPLEMENTADO: 'Esta operación aún no admite este contenido.',
  VALOR_INVALIDO: 'Los datos ingresados no son válidos.',
  VALOR_NO_PERMITIDO: 'Esta operación no está permitida.'
};

// Estado local de la modal de administración.
let mntGuiaAdminVista = 'general';        // 'general' | 'secciones' | 'items'
let mntGuiaAdminSeccionId = null;         // sección cuyos ítems se administran
let mntGuiaAdminEditando = null;          // { tipo, id } del formulario inline abierto
let mntGuiaAdminGuardando = false;        // guard anti doble RPC
let mntGuiaAdminPendienteRefresco = null; // clave cuyo cambio quedó guardado sin relectura

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function mntGuiaAdminEsPermanente() {
  return (typeof esAdminPermanenteActual === 'function') && esAdminPermanenteActual() === true;
}

// Clave estable de la entidad afectada (bloqueo de reintento pendiente).
function mntGuiaAdminClave(tipo, id) {
  return String(tipo) + ':' + String(id);
}

function mntGuiaAdminValor(id) {
  const el = document.getElementById(id);
  return (el && typeof el.value === 'string') ? el.value.trim() : '';
}

// C2G-7.1 — AISLAMIENTO DE FLUJOS DE EDICIÓN.
// Devuelve el <form> que disparó el submit (nunca un id global del
// documento) o null si el evento no aporta un formulario.
function mntGuiaAdminFormulario(ev) {
  if (!ev) return null;
  if (ev.currentTarget && ev.currentTarget.tagName === 'FORM') return ev.currentTarget;
  if (ev.target && ev.target.tagName === 'FORM') return ev.target;
  return null;
}

// Lee un campo DENTRO del formulario enviado. Devuelve null si el campo no
// existe en ESE formulario (fail-closed: el llamador DETIENE el envío en
// lugar de leer el primer id coincidente del documento, que podría pertenecer
// al formulario de otra entidad).
function mntGuiaAdminValorFormulario(form, id) {
  if (!form) return null;
  const el = form.querySelector('[id="' + id + '"]');
  return (el && typeof el.value === 'string') ? el.value.trim() : null;
}

function mntGuiaAdminError(mensaje) {
  const caja = document.getElementById('mnt-guia-admin-error');
  if (!caja) return;
  caja.textContent = mensaje; // textContent: nunca HTML de error
  caja.classList.remove('hidden');
}

function mntGuiaAdminOcultarError() {
  const caja = document.getElementById('mnt-guia-admin-error');
  if (!caja) return;
  caja.textContent = '';
  caja.classList.add('hidden');
}

// Mensaje: token amigable del backend + mensaje REAL de Supabase, para
// no ocultar la causa ni inventar textos silenciosos.
function mntGuiaAdminMensajeError(err) {
  const codigo = (err && err.codigo) ? err.codigo : null;
  const real = (err && typeof err.message === 'string' && err.message)
    ? err.message
    : 'No fue posible guardar el cambio.';
  const base = (codigo && MNT_MENSAJES_ERROR_ADMIN_GUIA[codigo])
    ? MNT_MENSAJES_ERROR_ADMIN_GUIA[codigo]
    : null;
  return base ? (base + ' (' + real + ')') : real;
}

function mntGuiaAdminAplicarDatos(datos) {
  mntGuiasBase = (datos && Array.isArray(datos.guias)) ? datos.guias : [];
  mntGuiaSecciones = (datos && Array.isArray(datos.secciones)) ? datos.secciones : [];
  mntGuiaItems = (datos && Array.isArray(datos.items)) ? datos.items : [];
}

// Relee Supabase con force=true tras una escritura. Devuelve los datos o
// null si la relectura falló (la escritura YA ocurrió: NUNCA se presenta
// como fallo de escritura). Una relectura exitosa levanta el bloqueo
// pendiente (mismo criterio que TV/Pilas en cargarPanelSubapartado).
async function mntGuiaAdminRefrescar() {
  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está cargado.');
    }
    const datos = await window.MantencionesService.getGuias(true);
    if (!datos || !Array.isArray(datos.guias)) {
      throw new Error('Respuesta de guías incompleta.');
    }
    mntGuiaAdminPendienteRefresco = null;
    return datos;
  } catch (e) {
    console.error('Error releyendo Guía Preventiva tras la escritura:', e);
    return null;
  }
}

// Repinta el panel de solo lectura SOLO si la modal del subapartado sigue
// en Guía Preventiva; si cambió/cerró durante la RPC no se pinta nada
// sobre otra vista.
function mntGuiaAdminRepintarPanel() {
  if (mantencionSubapartado !== 'guia') return;
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;
  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'guia');
  if (!meta) return;
  panel.innerHTML = mntPanelGuiaHTML(meta, {
    guias: mntGuiasBase,
    secciones: mntGuiaSecciones,
    items: mntGuiaItems
  });
}

// Repinta la modal de administración solo si sigue abierta.
function mntGuiaAdminRepintarModal() {
  const cont = document.getElementById('mnt-modal-admin-guia');
  if (!cont) return;
  const overlay = document.getElementById(MNT_MODAL_ADMIN_GUIA_ID);
  if (!overlay || overlay.classList.contains('hidden')) return;
  cont.innerHTML = mntGuiaAdminContenidoHTML();
}

// ------------------------------------------------------------
// Modal: CREAR / ABRIR / CERRAR
// ------------------------------------------------------------
function asegurarModalAdminGuia() {
  let overlay = document.getElementById(MNT_MODAL_ADMIN_GUIA_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MNT_MODAL_ADMIN_GUIA_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Administrar Guía Preventiva');
  overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overflow-y-auto';
  overlay.onclick = function (ev) {
    // Solo el clic en el fondo cierra; el clic dentro de la modal de
    // administración NO burbujea al subapartado de detrás.
    // UX-02: fondo sin cierre.
  };
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-3xl w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 my-auto text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
      <div id="mnt-modal-admin-guia"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function mntTeclaEscapeAdminGuia(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

function abrirModalAdminGuia() {
  // Permisos: SOLO Administrador permanente. El backend también lo exige
  // (defensa en profundidad); aquí se evita abrir la ventana.
  if (!mntGuiaAdminEsPermanente()) {
    console.warn('Administrar guía: requiere Administrador permanente; se omite abrir la modal.');
    return;
  }
  // Anti doble RPC: con una escritura en vuelo no se abre otra ventana.
  if (mntGuiaAdminGuardando) {
    console.warn('mntGuiaAdminGuardando activo: se omite abrir la administración de la guía.');
    return;
  }
  if (!mntGuiaActiva(mntGuiasBase)) {
    console.warn('Administrar guía: no hay guía activa en los datos; se omite abrir la modal.');
    return;
  }

  mntGuiaAdminVista = 'general';
  mntGuiaAdminSeccionId = null;
  mntGuiaAdminEditando = null;

  const overlay = asegurarModalAdminGuia();
  const cont = document.getElementById('mnt-modal-admin-guia');
  if (!overlay || !cont) return;

  // Pinta desde los datos locales ya leídos (mismo origen Supabase) y
  // luego refresca de forma asíncrona.
  cont.innerHTML = mntGuiaAdminContenidoHTML();
  overlay.classList.remove('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeAdminGuia, true);
  document.addEventListener('keydown', mntTeclaEscapeAdminGuia, true);

  // Relectura fresca al abrir (levantaría un bloqueo pendiente si ahora
  // la relectura funciona). No se pinta si la modal se cerró en el camino.
  mntGuiaAdminRefrescar().then(datos => {
    if (!datos) return;
    mntGuiaAdminAplicarDatos(datos);
    mntGuiaAdminRepintarModal();
    mntGuiaAdminRepintarPanel();
  });
}

// Oculta la modal y retira SOLO su listener de Escape. NO libera el guard
// si hay una RPC en vuelo (el guard lo libera la RPC al terminar).
function cerrarModalAdminGuia() {
  const overlay = document.getElementById(MNT_MODAL_ADMIN_GUIA_ID);
  if (overlay) overlay.classList.add('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeAdminGuia, true);
  mntGuiaAdminEditando = null;
  mntGuiaAdminSeccionId = null;
  mntGuiaAdminVista = 'general';
}

// ------------------------------------------------------------
// CONTENIDO DE LA MODAL: A) datos generales / B) secciones /
// C) recomendaciones de la sección
// ------------------------------------------------------------
function mntGuiaAdminContenidoHTML() {
  const guia = mntGuiaActiva(mntGuiasBase);

  const encabezado = `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center space-x-2.5 min-w-0">
        <span class="text-2xl shrink-0">🛠️</span>
        <div class="min-w-0">
          <h3 class="text-base font-bold text-slate-800 dark:text-white truncate">Administrar Guía Preventiva</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate">Contenido maestro · edición exclusiva de Administrador permanente</p>
        </div>
      </div>
      <button type="button" onclick="cerrarModalAdminGuia()"
        class="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold">&times;</button>
    </div>
  `;

  if (!guia) {
    return `
      ${encabezado}
      <div class="mt-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center">
        <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Sin guía activa registrada</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">No hay contenido maestro para administrar.</p>
      </div>
    `;
  }

  let cuerpo = '';
  if (mntGuiaAdminVista === 'items') {
    cuerpo = mntGuiaAdminItemsHTML(guia);
  } else if (mntGuiaAdminVista === 'secciones') {
    cuerpo = mntGuiaAdminSeccionesHTML(guia);
  } else {
    cuerpo = mntGuiaAdminGeneralHTML(guia);
  }

  // C2G-7: si el bloqueo pendiente es de REORDENAMIENTO, el aviso usa el
  // texto explícito del orden (no el genérico de C2G-6).
  const avisoTexto = (typeof mntGuiaAdminPendienteRefresco === 'string' &&
    mntGuiaAdminPendienteRefresco.indexOf('reorden:') === 0)
    ? MNT_AVISO_REFRESCO_ORDEN_GUIA
    : MNT_AVISO_REFRESCO_ADMIN_GUIA;

  const avisoHTML = mntGuiaAdminPendienteRefresco
    ? `<div id="mnt-guia-admin-aviso" class="mt-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-xs font-bold text-blue-800 dark:text-blue-200 leading-relaxed">${mntEsc(avisoTexto)}</div>`
    : `<div id="mnt-guia-admin-aviso" class="hidden mt-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-xs font-bold text-blue-800 dark:text-blue-200 leading-relaxed"></div>`;

  return `
    ${encabezado}
    ${cuerpo}
    <div id="mnt-guia-admin-error" class="hidden mt-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300"></div>
    ${avisoHTML}
    <p class="mt-3 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
      No existe borrado físico: las secciones y recomendaciones se desactivan (quedan visibles aquí) y pueden reactivarse.
      La guía es documentación preventiva; no registra mantenciones ejecutadas ni planificación.
    </p>
  `;
}

// A) DATOS GENERALES DE LA GUÍA
function mntGuiaAdminGeneralHTML(guia) {
  const bloqueado = mntGuiaAdminPendienteRefresco === mntGuiaAdminClave('guia', guia.id);

  return `
    <div class="mt-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
      <h4 class="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">A) Datos generales de la guía</h4>
      <form onsubmit="mntGuiaAdminEnviarGuia(event)" class="space-y-3">
        <input type="hidden" id="mnt-guia-admin-guia-id" value="${mntEsc(guia.id)}">
        <div>
          <label for="mnt-guia-admin-titulo" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Título *</label>
          <input id="mnt-guia-admin-titulo" type="text" value="${mntEsc(guia.titulo)}"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <div>
          <label for="mnt-guia-admin-descripcion" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Descripción</label>
          <textarea id="mnt-guia-admin-descripcion" rows="3"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">${mntEsc(guia.descripcion)}</textarea>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label for="mnt-guia-admin-tipo" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Tipo</label>
            <input id="mnt-guia-admin-tipo" type="text" value="${mntEsc(guia.tipo)}"
              class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="mnt-guia-admin-temporada" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Temporada</label>
            <input id="mnt-guia-admin-temporada" type="text" value="${mntEsc(guia.temporada)}"
              class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="mnt-guia-admin-frecuencia" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Frecuencia recomendada</label>
            <input id="mnt-guia-admin-frecuencia" type="text" value="${mntEsc(guia.frecuencia_recomendada)}"
              class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Fuente, archivo de origen, enlace del documento y trazabilidad documental NO son editables desde aquí.
          "Frecuencia recomendada" es un dato documental: no programa fechas ni tareas.
        </p>
        <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2.5">
          <button type="submit" id="mnt-guia-admin-submit" ${bloqueado ? 'disabled' : ''}
            class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-blue-600">
            <span id="mnt-guia-admin-submit-label">${bloqueado ? 'Cambio guardado' : 'Guardar cambios'}</span>
          </button>
        </div>
      </form>
      <div class="pt-3 border-t border-slate-100 dark:border-slate-800">
        <button type="button" onclick="mntGuiaAdminIrSecciones()"
          class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
          B) Administrar secciones
        </button>
      </div>
    </div>
  `;
}

// B) SECCIONES (TODAS, incluidas activo = false, para poder reactivar)
function mntGuiaAdminSeccionesHTML(guia) {
  const secciones = mntGuiaSecciones
    .filter(s => s && s.guia_id === guia.id)
    .slice()
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));

  const creando = !!(mntGuiaAdminEditando && mntGuiaAdminEditando.tipo === 'nueva_seccion');

  const formNueva = creando ? `
    <form onsubmit="mntGuiaAdminEnviarSeccion(event)" class="mb-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2.5">
      <input type="hidden" id="mnt-guia-admin-seccion-id" value="">
      <input type="hidden" id="mnt-guia-admin-seccion-guia-id" value="${mntEsc(guia.id)}">
      <label for="mnt-guia-admin-seccion-titulo" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Título de la sección *</label>
      <input id="mnt-guia-admin-seccion-titulo" type="text" placeholder="Título de la nueva sección"
        class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
      <p class="text-[10px] text-slate-500 dark:text-slate-400">El código técnico y el orden los asigna el sistema; no se piden.</p>
      <div class="flex items-center justify-end space-x-2.5">
        <button type="button" onclick="mntGuiaAdminCancelarEdicion()"
          class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
        <button type="submit" id="mnt-guia-admin-submit"
          class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all">
          <span id="mnt-guia-admin-submit-label">Agregar sección</span>
        </button>
      </div>
    </form>` : '';

  const filas = secciones.length > 0
    ? secciones.map((s, indice) => mntGuiaAdminSeccionFilaHTML(guia, s, indice, secciones.length)).join('')
    : '<p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Sin secciones registradas en esta guía.</p>';

  return `
    <div class="mt-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">B) Secciones</h4>
        <div class="flex items-center space-x-2.5">
          <button type="button" onclick="mntGuiaAdminVolverGeneral()"
            class="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:underline">← Datos de la guía</button>
          <button type="button" onclick="mntGuiaAdminNuevaSeccion()"
            class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all">+ Agregar sección</button>
        </div>
      </div>
      ${formNueva}
      <div class="space-y-2">
        ${filas}
      </div>
      <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
        Se muestran todas las secciones, activas e inactivas. La vista de solo lectura muestra únicamente las activas.
      </p>
    </div>
  `;
}

function mntGuiaAdminSeccionFilaHTML(guia, s, indice, total) {
  // Datos actuales: las 6 secciones tienen activo = true. El filtro es
  // defensivo: solo un false explícito se considera inactivo.
  const activo = s.activo !== false;

  // Formulario inline de EDICIÓN (solo título; el código NO es editable).
  if (mntGuiaAdminEditando && mntGuiaAdminEditando.tipo === 'seccion' &&
      mntGuiaAdminEditando.id === s.id) {
    const bloqueado = mntGuiaAdminPendienteRefresco === mntGuiaAdminClave('seccion', s.id);
    return `
      <form onsubmit="mntGuiaAdminEnviarSeccion(event)" class="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2.5">
        <input type="hidden" id="mnt-guia-admin-seccion-id" value="${mntEsc(s.id)}">
        <input type="hidden" id="mnt-guia-admin-seccion-guia-id" value="${mntEsc(guia.id)}">
        <label for="mnt-guia-admin-seccion-titulo" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Título de la sección *</label>
        <input id="mnt-guia-admin-seccion-titulo" type="text" value="${mntEsc(s.titulo)}"
          class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
        <p class="text-[10px] text-slate-500 dark:text-slate-400">Código técnico (solo lectura): ${mntEsc(mntSinDato(s.codigo))}</p>
        <div class="flex items-center justify-end space-x-2.5">
          <button type="button" onclick="mntGuiaAdminCancelarEdicion()"
            class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
          <button type="submit" id="mnt-guia-admin-submit" ${bloqueado ? 'disabled' : ''}
            class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-blue-600">
            <span id="mnt-guia-admin-submit-label">${bloqueado ? 'Cambio guardado' : 'Guardar sección'}</span>
          </button>
        </div>
      </form>
    `;
  }

  const bloqueado = mntGuiaAdminPendienteRefresco === mntGuiaAdminClave('seccion', s.id);
  const idBoton = 'mnt-guia-admin-toggle-' + s.id;

  // C2G-7: reordenamiento visual con controles simples (sin drag & drop).
  // La primera posición tiene "Subir" deshabilitado y la última "Bajar".
  // Mientras hay una RPC en vuelo (mntGuiaAdminGuardando) o el orden de
  // ESTA guía quedó guardado sin relectura, ambos quedan bloqueados.
  const ordenBloqueado = mntGuiaAdminGuardando ||
    mntGuiaAdminPendienteRefresco === mntGuiaAdminClave('reorden:seccion', guia.id);
  const esPrimera = Number(indice) === 0;
  const esUltima = Number(indice) === (Number(total) - 1);

  return `
    <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="text-xs font-extrabold text-slate-900 dark:text-white leading-snug">${mntEsc(mntSinDato(s.titulo))}</p>
        <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
          Código: ${mntEsc(mntSinDato(s.codigo))} · ${activo ? 'Activa' : 'Inactiva'}
        </p>
      </div>
      <div class="flex items-center space-x-2 shrink-0">
        <button type="button" onclick="mntGuiaAdminMoverSeccion('${mntEsc(s.id)}', -1)" ${esPrimera || ordenBloqueado ? 'disabled' : ''}
          title="${esPrimera ? 'Primera posición' : 'Subir una posición'}"
          class="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">↑ Subir</button>
        <button type="button" onclick="mntGuiaAdminMoverSeccion('${mntEsc(s.id)}', 1)" ${esUltima || ordenBloqueado ? 'disabled' : ''}
          title="${esUltima ? 'Última posición' : 'Bajar una posición'}"
          class="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">↓ Bajar</button>
        <button type="button" onclick="mntGuiaAdminVerItems('${mntEsc(s.id)}')"
          class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Recomendaciones</button>
        <button type="button" onclick="mntGuiaAdminEditarSeccion('${mntEsc(s.id)}')"
          class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Editar</button>
        <button type="button" id="${mntEsc(idBoton)}" onclick="mntGuiaAdminAlternarSeccion('${mntEsc(s.id)}')" ${bloqueado ? 'disabled' : ''}
          class="px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-colors ${activo
            ? 'border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40'
            : 'border-emerald-200 dark:border-emerald-900/60 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'} disabled:opacity-60 disabled:cursor-not-allowed">
          ${bloqueado ? 'Cambio guardado' : (activo ? 'Desactivar' : 'Activar')}
        </button>
      </div>
    </div>
  `;
}

// C) RECOMENDACIONES DE LA SECCIÓN (TODAS, incluidas activo = false)
function mntGuiaAdminItemsHTML(guia) {
  const seccion = mntGuiaSecciones.find(s => s && s.id === mntGuiaAdminSeccionId && s.guia_id === guia.id) || null;

  // La sección dejó de existir (o cambió la guía) mientras se administraba:
  // se vuelve a B) sin inventar contenido.
  // C2G-7.1: además se SINCRONIZA el estado local. Antes este fallback podía
  // seguir renderizando contenido de B) con mntGuiaAdminVista === 'items';
  // las filas de sección son visualmente idénticas a las de ítem y su botón
  // "Editar" abre el formulario de SECCIÓN (→ guardarSeccion()), con lo que
  // una edición de recomendación podía terminar escribiendo en la sección.
  if (!seccion) {
    if (mntGuiaAdminVista === 'items') {
      mntGuiaAdminVista = 'secciones';
      mntGuiaAdminSeccionId = null;
      if (mntGuiaAdminEditando &&
          (mntGuiaAdminEditando.tipo === 'item' || mntGuiaAdminEditando.tipo === 'nuevo_item')) {
        mntGuiaAdminEditando = null; // el formulario de ítem ya no tiene sección
      }
    }
    return mntGuiaAdminSeccionesHTML(guia);
  }

  const items = mntGuiaItems
    .filter(i => i && i.seccion_id === seccion.id)
    .slice()
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));

  const creando = !!(mntGuiaAdminEditando && mntGuiaAdminEditando.tipo === 'nuevo_item');

  const formNuevo = creando ? `
    <form onsubmit="mntGuiaAdminEnviarItem(event)" class="mb-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2.5">
      <input type="hidden" id="mnt-guia-admin-item-id" value="">
      <input type="hidden" id="mnt-guia-admin-item-seccion-id" value="${mntEsc(seccion.id)}">
      <label for="mnt-guia-admin-item-contenido" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Recomendación *</label>
      <textarea id="mnt-guia-admin-item-contenido" rows="3" placeholder="Texto de la recomendación"
        class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
      <p class="text-[10px] text-slate-500 dark:text-slate-400">El orden lo asigna el sistema; no se pide.</p>
      <div class="flex items-center justify-end space-x-2.5">
        <button type="button" onclick="mntGuiaAdminCancelarEdicion()"
          class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
        <button type="submit" id="mnt-guia-admin-submit"
          class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all">
          <span id="mnt-guia-admin-submit-label">Agregar recomendación</span>
        </button>
      </div>
    </form>` : '';

  const filas = items.length > 0
    ? items.map((i, indice) => mntGuiaAdminItemFilaHTML(seccion, i, indice, items.length)).join('')
    : '<p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Sin recomendaciones registradas en esta sección.</p>';

  return `
    <div class="mt-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h4 class="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">C) Recomendaciones</h4>
          <p class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">Sección: ${mntEsc(mntSinDato(seccion.titulo))}</p>
        </div>
        <div class="flex items-center space-x-2.5">
          <button type="button" onclick="mntGuiaAdminVolverSecciones()"
            class="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:underline">← Secciones</button>
          <button type="button" onclick="mntGuiaAdminNuevoItem()"
            class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all">+ Agregar recomendación</button>
        </div>
      </div>
      ${formNuevo}
      <div class="space-y-2">
        ${filas}
      </div>
      <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
        Se muestran todas las recomendaciones, activas e inactivas. La vista de solo lectura muestra únicamente las activas.
      </p>
    </div>
  `;
}

function mntGuiaAdminItemFilaHTML(seccion, item, indice, total) {
  // Datos actuales: los 28 ítems tienen activo = true. Defensivo: solo un
  // false explícito se considera inactivo.
  const activo = item.activo !== false;

  // Formulario inline de EDICIÓN (solo contenido).
  if (mntGuiaAdminEditando && mntGuiaAdminEditando.tipo === 'item' &&
      mntGuiaAdminEditando.id === item.id) {
    const bloqueado = mntGuiaAdminPendienteRefresco === mntGuiaAdminClave('item', item.id);
    return `
      <form onsubmit="mntGuiaAdminEnviarItem(event)" class="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2.5">
        <input type="hidden" id="mnt-guia-admin-item-id" value="${mntEsc(item.id)}">
        <input type="hidden" id="mnt-guia-admin-item-seccion-id" value="${mntEsc(seccion.id)}">
        <label for="mnt-guia-admin-item-contenido" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Recomendación *</label>
        <textarea id="mnt-guia-admin-item-contenido" rows="3"
          class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">${mntEsc(item.contenido)}</textarea>
        <div class="flex items-center justify-end space-x-2.5">
          <button type="button" onclick="mntGuiaAdminCancelarEdicion()"
            class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
          <button type="submit" id="mnt-guia-admin-submit" ${bloqueado ? 'disabled' : ''}
            class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-blue-600">
            <span id="mnt-guia-admin-submit-label">${bloqueado ? 'Cambio guardado' : 'Guardar recomendación'}</span>
          </button>
        </div>
      </form>
    `;
  }

  const bloqueado = mntGuiaAdminPendienteRefresco === mntGuiaAdminClave('item', item.id);
  const idBoton = 'mnt-guia-admin-toggle-' + item.id;

  // C2G-7: reordenamiento visual (Subir/Bajar) de las recomendaciones de
  // ESTA sección. Participan TODAS (activas e inactivas); la vista de solo
  // lectura sigue mostrando solo las activas con su orden real de Supabase.
  const ordenBloqueado = mntGuiaAdminGuardando ||
    mntGuiaAdminPendienteRefresco === mntGuiaAdminClave('reorden:item', seccion.id);
  const esPrimera = Number(indice) === 0;
  const esUltima = Number(indice) === (Number(total) - 1);

  return `
    <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-relaxed break-words min-w-0">${mntEsc(mntSinDato(item.contenido))}</p>
      <div class="flex items-center space-x-2 shrink-0">
        <button type="button" onclick="mntGuiaAdminMoverItem('${mntEsc(item.id)}', -1)" ${esPrimera || ordenBloqueado ? 'disabled' : ''}
          title="${esPrimera ? 'Primera posición' : 'Subir una posición'}"
          class="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">↑ Subir</button>
        <button type="button" onclick="mntGuiaAdminMoverItem('${mntEsc(item.id)}', 1)" ${esUltima || ordenBloqueado ? 'disabled' : ''}
          title="${esUltima ? 'Última posición' : 'Bajar una posición'}"
          class="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">↓ Bajar</button>
        <span class="text-[10px] font-black px-2 py-1 rounded-full border ${activo
          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}">${activo ? 'Activa' : 'Inactiva'}</span>
        <button type="button" onclick="mntGuiaAdminEditarItem('${mntEsc(item.id)}')"
          class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Editar</button>
        <button type="button" id="${mntEsc(idBoton)}" onclick="mntGuiaAdminAlternarItem('${mntEsc(item.id)}')" ${bloqueado ? 'disabled' : ''}
          class="px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-colors ${activo
            ? 'border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40'
            : 'border-emerald-200 dark:border-emerald-900/60 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'} disabled:opacity-60 disabled:cursor-not-allowed">
          ${bloqueado ? 'Cambio guardado' : (activo ? 'Desactivar' : 'Activar')}
        </button>
      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// Navegación dentro de la modal (solo estado local)
// ------------------------------------------------------------
function mntGuiaAdminVolverGeneral() {
  mntGuiaAdminVista = 'general';
  mntGuiaAdminSeccionId = null;
  mntGuiaAdminEditando = null;
  mntGuiaAdminRepintarModal();
}

function mntGuiaAdminIrSecciones() {
  mntGuiaAdminVista = 'secciones';
  mntGuiaAdminSeccionId = null;
  mntGuiaAdminEditando = null;
  mntGuiaAdminRepintarModal();
}

function mntGuiaAdminVolverSecciones() {
  mntGuiaAdminVista = 'secciones';
  mntGuiaAdminSeccionId = null;
  mntGuiaAdminEditando = null;
  mntGuiaAdminRepintarModal();
}

function mntGuiaAdminVerItems(seccionId) {
  const id = typeof seccionId === 'string' ? seccionId.trim() : '';
  if (!id) return;
  mntGuiaAdminVista = 'items';
  mntGuiaAdminSeccionId = id;
  mntGuiaAdminEditando = null;
  mntGuiaAdminRepintarModal();
}

function mntGuiaAdminNuevaSeccion() {
  if (mntGuiaAdminGuardando) return;
  mntGuiaAdminEditando = { tipo: 'nueva_seccion', id: null };
  mntGuiaAdminRepintarModal();
}

function mntGuiaAdminEditarSeccion(seccionId) {
  if (mntGuiaAdminGuardando) return;
  const id = typeof seccionId === 'string' ? seccionId.trim() : '';
  if (!id) return;
  mntGuiaAdminEditando = { tipo: 'seccion', id: id };
  mntGuiaAdminRepintarModal();
}

function mntGuiaAdminNuevoItem() {
  if (mntGuiaAdminGuardando) return;
  mntGuiaAdminEditando = { tipo: 'nuevo_item', id: null };
  mntGuiaAdminRepintarModal();
}

function mntGuiaAdminEditarItem(itemId) {
  if (mntGuiaAdminGuardando) return;
  const id = typeof itemId === 'string' ? itemId.trim() : '';
  if (!id) return;
  mntGuiaAdminEditando = { tipo: 'item', id: id };
  mntGuiaAdminRepintarModal();
}

function mntGuiaAdminCancelarEdicion() {
  if (mntGuiaAdminGuardando) return;
  mntGuiaAdminEditando = null;
  mntGuiaAdminRepintarModal();
}

// ------------------------------------------------------------
// C2G-7: REORDENAMIENTO VISUAL (Subir/Bajar) — solo en la modal de
// administración y solo para Administrador permanente.
// ÚNICA vía de escritura del orden: MantencionesService.reordenarContenidoGuia
// (RPC guia_contenido_reordenar). SIN .insert()/.update()/.delete(), SIN
// supabase.rpc directo, SIN renumeración desde el frontend y SIN cambio del
// campo `codigo` ni del contenido de las recomendaciones.
// La RPC exige el CONJUNTO COMPLETO de UUID del padre (sin faltantes,
// extras ni duplicados), por lo que NUNCA se emiten updates sueltos.
// ------------------------------------------------------------

// Listas COMPLETAS ordenadas por el campo `orden` real de Supabase.
// Incluyen activas e inactivas: el orden es de la guía/sección completa,
// aunque la vista de solo lectura oculte las inactivas.
function mntGuiaAdminSeccionesOrdenadas(guiaId) {
  return mntGuiaSecciones
    .filter(s => s && s.guia_id === guiaId)
    .slice()
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
}

function mntGuiaAdminItemsOrdenados(seccionId) {
  return mntGuiaItems
    .filter(i => i && i.seccion_id === seccionId)
    .slice()
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
}

// Bloqueo INMEDIATO de todos los botones Subir/Bajar de la modal mientras
// la RPC de orden está en vuelo (evita doble clic / doble RPC aunque
// todavía no haya habido repintado).
function mntGuiaAdminBloquearBotonesOrden() {
  const overlay = document.getElementById(MNT_MODAL_ADMIN_GUIA_ID);
  if (!overlay) return;
  const botones = overlay.querySelectorAll('button[onclick*="mntGuiaAdminMover"]');
  for (let i = 0; i < botones.length; i++) {
    botones[i].disabled = true;
  }
}

// Mueve una SECCIÓN una posición. delta: -1 (subir) o 1 (bajar).
async function mntGuiaAdminMoverSeccion(seccionId, delta) {
  const id = typeof seccionId === 'string' ? seccionId.trim() : '';
  const paso = (Number(delta) === 1 || Number(delta) === -1) ? Number(delta) : 0;
  if (!id || !paso) return;

  // Anti doble RPC y permiso: mismo patrón que C2G-6.
  if (mntGuiaAdminGuardando) return;
  if (!mntGuiaAdminEsPermanente()) return;

  const cont = document.getElementById('mnt-modal-admin-guia');
  if (!cont) return;

  const guia = mntGuiaActiva(mntGuiasBase);
  if (!guia) return;

  // 1) Copia del orden ACTUAL completo (activas + inactivas). El array
  //    global NUNCA se muta antes del éxito de la RPC.
  const ids = mntGuiaAdminSeccionesOrdenadas(guia.id).map(s => s.id);
  const indice = ids.indexOf(id);
  const destino = indice + paso;
  if (indice < 0 || destino < 0 || destino >= ids.length) return;

  // 2) Intercambio de SOLO las dos posiciones dentro de la copia.
  const idsOrdenados = ids.slice();
  const temporal = idsOrdenados[indice];
  idsOrdenados[indice] = idsOrdenados[destino];
  idsOrdenados[destino] = temporal;

  const clave = mntGuiaAdminClave('reorden:seccion', guia.id);
  if (mntGuiaAdminPendienteRefresco === clave) {
    console.warn('Orden de secciones ya guardado con relectura pendiente: se omite un segundo movimiento.');
    return;
  }

  mntGuiaAdminGuardando = true;
  mntGuiaAdminBloquearBotonesOrden();
  mntGuiaAdminOcultarError();

  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está cargado.');
    }
    // ÚNICA escritura de orden: SIEMPRE el conjunto completo de la guía.
    await window.MantencionesService.reordenarContenidoGuia({
      tipo: 'seccion',
      padreId: guia.id,
      ordenes: idsOrdenados
    });
  } catch (err) {
    // Ruta A: el orden visual se MANTIENE (no se mutó nada localmente),
    // la modal permanece abierta y el reintento queda permitido.
    console.error('Error reordenando las secciones de la guía:', err);
    mntGuiaAdminGuardando = false;
    mntGuiaAdminRepintarModal();
    mntGuiaAdminError(mntGuiaAdminMensajeError(err));
    return;
  }

  let datos = null;
  try {
    datos = await mntGuiaAdminRefrescar();
  } finally {
    mntGuiaAdminGuardando = false;
  }

  if (!datos) {
    // Ruta C: el nuevo orden SÍ quedó guardado. NO se revierte visualmente
    // fingiendo fallo de escritura; el aviso lo explica y los botones de
    // orden de ESTA guía quedan bloqueados.
    mntGuiaAdminPendienteRefresco = clave;
    mntGuiaAdminRepintarModal();
    return;
  }

  // Ruta B: SOLO datos frescos de Supabase (nada del array optimista).
  mntGuiaAdminAplicarDatos(datos);
  mntGuiaAdminRepintarPanel();
  mntGuiaAdminRepintarModal();
}

// Mueve una RECOMENDACIÓN una posición dentro de SU sección.
async function mntGuiaAdminMoverItem(itemId, delta) {
  const id = typeof itemId === 'string' ? itemId.trim() : '';
  const paso = (Number(delta) === 1 || Number(delta) === -1) ? Number(delta) : 0;
  if (!id || !paso) return;

  if (mntGuiaAdminGuardando) return;
  if (!mntGuiaAdminEsPermanente()) return;

  const cont = document.getElementById('mnt-modal-admin-guia');
  if (!cont) return;

  // La sección administrada en este momento; si cambió, no se actúa sobre
  // un contexto que ya no es el visible.
  const seccion = mntGuiaSecciones.find(s => s && s.id === mntGuiaAdminSeccionId) || null;
  if (!seccion) return;

  const item = mntGuiaItems.find(i => i && i.id === id) || null;
  if (!item || item.seccion_id !== seccion.id) return;

  const ids = mntGuiaAdminItemsOrdenados(seccion.id).map(i => i.id);
  const indice = ids.indexOf(id);
  const destino = indice + paso;
  if (indice < 0 || destino < 0 || destino >= ids.length) return;

  const idsOrdenados = ids.slice();
  const temporal = idsOrdenados[indice];
  idsOrdenados[indice] = idsOrdenados[destino];
  idsOrdenados[destino] = temporal;

  const clave = mntGuiaAdminClave('reorden:item', seccion.id);
  if (mntGuiaAdminPendienteRefresco === clave) {
    console.warn('Orden de recomendaciones ya guardado con relectura pendiente: se omite un segundo movimiento.');
    return;
  }

  mntGuiaAdminGuardando = true;
  mntGuiaAdminBloquearBotonesOrden();
  mntGuiaAdminOcultarError();

  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está cargado.');
    }
    // ÚNICA escritura de orden: SIEMPRE el conjunto completo de la sección
    // (activas e inactivas).
    await window.MantencionesService.reordenarContenidoGuia({
      tipo: 'item',
      padreId: seccion.id,
      ordenes: idsOrdenados
    });
  } catch (err) {
    console.error('Error reordenando las recomendaciones de la sección:', err);
    mntGuiaAdminGuardando = false;
    mntGuiaAdminRepintarModal();
    mntGuiaAdminError(mntGuiaAdminMensajeError(err));
    return;
  }

  let datos = null;
  try {
    datos = await mntGuiaAdminRefrescar();
  } finally {
    mntGuiaAdminGuardando = false;
  }

  if (!datos) {
    mntGuiaAdminPendienteRefresco = clave;
    mntGuiaAdminRepintarModal();
    return;
  }

  // Si la sección seleccionada cambió/cerró durante la RPC, la repintación
  // de la modal usa el estado actual (mntGuiaAdminItemsHTML vuelve a B)
  // si la sección ya no existe); el panel de solo lectura se repinta solo
  // si sigue en Guía Preventiva (mntGuiaAdminRepintarPanel).
  mntGuiaAdminAplicarDatos(datos);
  mntGuiaAdminRepintarPanel();
  mntGuiaAdminRepintarModal();
}

// ------------------------------------------------------------
// ESCRITURAS (Rutas A/B/C, patrón Fosas)
// A) RPC falla → modal abierta, error real visible, botón restaurado.
// B) RPC OK + relectura OK → datos frescos de Supabase en ambas vistas.
// C) RPC OK + relectura falla → aviso "sí quedó guardado", sin doble envío.
// ------------------------------------------------------------

// A) EDITAR DATOS GENERALES DE LA GUÍA → guardarGuia()
async function mntGuiaAdminEnviarGuia(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  if (mntGuiaAdminGuardando) return;         // anti doble RPC
  if (!mntGuiaAdminEsPermanente()) return;

  const cont = document.getElementById('mnt-modal-admin-guia');
  if (!cont) return;

  const guiaId = mntGuiaAdminValor('mnt-guia-admin-guia-id');
  if (!guiaId) return;

  const clave = mntGuiaAdminClave('guia', guiaId);
  // Ruta C: el cambio YA quedó guardado; NO se reenvía.
  if (mntGuiaAdminPendienteRefresco === clave) {
    console.warn('Cambio de guía ya guardado con relectura pendiente: se omite un segundo envío.');
    return;
  }

  const titulo = mntGuiaAdminValor('mnt-guia-admin-titulo');
  if (!titulo) {
    mntGuiaAdminError('El título de la guía es obligatorio.');
    return;
  }
  const descripcion = mntGuiaAdminValor('mnt-guia-admin-descripcion');
  const tipo = mntGuiaAdminValor('mnt-guia-admin-tipo');
  const temporada = mntGuiaAdminValor('mnt-guia-admin-temporada');
  const frecuencia = mntGuiaAdminValor('mnt-guia-admin-frecuencia');

  const btn = document.getElementById('mnt-guia-admin-submit');
  const etiqueta = document.getElementById('mnt-guia-admin-submit-label');
  mntGuiaAdminGuardando = true;
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Guardando...';
  mntGuiaAdminOcultarError();

  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está cargado.');
    }
    // ÚNICA escritura. NO se envían fuente, archivo_origen, archivo_url,
    // area_id, activo ni orden: son datos de origen/no editables.
    await window.MantencionesService.guardarGuia({
      guiaId: guiaId,
      titulo: titulo,
      descripcion: descripcion,
      tipo: tipo,
      temporada: temporada,
      frecuenciaRecomendada: frecuencia
    });
  } catch (err) {
    // Ruta A: el error de escritura SÍ es error; la modal permanece abierta.
    console.error('Error guardando los datos de la guía:', err);
    mntGuiaAdminError(mntGuiaAdminMensajeError(err));
    mntGuiaAdminGuardando = false;
    if (btn) btn.disabled = false;
    if (etiqueta) etiqueta.textContent = 'Guardar cambios';
    return;
  }

  // ÉXITO DE LA RPC: el cambio YA quedó guardado. Ningún fallo posterior
  // puede presentarse como fallo de escritura.
  let datos = null;
  try {
    datos = await mntGuiaAdminRefrescar();
  } finally {
    mntGuiaAdminGuardando = false;
  }

  if (!datos) {
    // Ruta C: aviso inequívoco; el botón queda bloqueado para esta guía.
    mntGuiaAdminPendienteRefresco = clave;
    mntGuiaAdminRepintarModal();
    return;
  }

  // Ruta B: datos frescos de Supabase en la vista de lectura y en la modal.
  mntGuiaAdminAplicarDatos(datos);
  mntGuiaAdminRepintarPanel();
  mntGuiaAdminRepintarModal();
}

// B) CREAR / EDITAR SECCIÓN → guardarSeccion()
async function mntGuiaAdminEnviarSeccion(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  if (mntGuiaAdminGuardando) return;
  if (!mntGuiaAdminEsPermanente()) return;

  const cont = document.getElementById('mnt-modal-admin-guia');
  if (!cont) return;

  // C2G-7.1 — GUARDED #1: el envío solo procede si EL ESTADO dice que lo
  // que se edita/crea es una SECCIÓN. Cualquier otro estado (p. ej. una
  // recomendación en edición) se DETIENE aquí: esta función es el ÚNICO punto
  // de partida de guardarSeccion() desde un formulario.
  const editandoSeccion = mntGuiaAdminEditando;
  const tipoEdicion = (editandoSeccion && typeof editandoSeccion.tipo === 'string')
    ? editandoSeccion.tipo
    : '';
  if (tipoEdicion !== 'seccion' && tipoEdicion !== 'nueva_seccion') {
    console.warn('Envío de sección ignorado: no hay una edición de sección activa (tipo actual: ' + (tipoEdicion || 'ninguno') + ').');
    return;
  }

  // C2G-7.1 — campos LEÍDOS DEL FORMULARIO ENVIADO (nunca por id global del
  // documento): si el evento no corresponde al formulario de sección, los
  // campos no existen y el envío se DETIENE (fail-closed).
  const form = mntGuiaAdminFormulario(ev);
  const seccionIdCampo = mntGuiaAdminValorFormulario(form, 'mnt-guia-admin-seccion-id');
  const guiaId = mntGuiaAdminValorFormulario(form, 'mnt-guia-admin-seccion-guia-id');
  if (seccionIdCampo === null || guiaId === null || !guiaId) {
    console.warn('Envío de sección ignorado: el formulario enviado no es el de secciones.');
    return;
  }
  const seccionId = seccionIdCampo || null;

  // C2G-7.1 — GUARDED #2: coherencia estado ↔ id del formulario. Edición ⇒
  // id real y = al id en edición; creación ⇒ SIN id.
  if (tipoEdicion === 'seccion') {
    if (!seccionId || seccionId !== editandoSeccion.id) {
      console.warn('Envío de sección ignorado: el id del formulario no coincide con la sección que se está editando.');
      return;
    }
  } else if (seccionId) {
    console.warn('Envío de sección ignorado: la creación no debe enviar un id de sección.');
    return;
  }

  // Clave de bloqueo: para una creación no existe aún el id real, por lo
  // que se usa una clave estable por guía.
  const clave = seccionId
    ? mntGuiaAdminClave('seccion', seccionId)
    : mntGuiaAdminClave('nueva_seccion', guiaId);
  if (mntGuiaAdminPendienteRefresco === clave) {
    console.warn('Cambio de sección ya guardado con relectura pendiente: se omite un segundo envío.');
    return;
  }

  const titulo = mntGuiaAdminValorFormulario(form, 'mnt-guia-admin-seccion-titulo');
  if (!titulo) {
    mntGuiaAdminError('El título de la sección es obligatorio.');
    return;
  }

  // C2G-7.1 — estado REAL: en EDICIÓN se conserva el estado vigente (no se
  // reactiva una sección inactiva al cambiarle el título); al CREAR, true
  // (dato actual: todas las secciones vigentes).
  let activoSeccion = true;
  if (tipoEdicion === 'seccion') {
    const seccionReal = mntGuiaSecciones.find(s => s && s.id === seccionId) || null;
    if (!seccionReal) {
      console.warn('Envío de sección ignorado: la sección indicada no existe en los datos cargados.');
      return;
    }
    activoSeccion = seccionReal.activo !== false;
  }

  const btn = form ? form.querySelector('[id="mnt-guia-admin-submit"]') : null;
  const etiqueta = form ? form.querySelector('[id="mnt-guia-admin-submit-label"]') : null;
  const etiquetaBase = seccionId ? 'Guardar sección' : 'Agregar sección';
  mntGuiaAdminGuardando = true;
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Guardando...';
  mntGuiaAdminOcultarError();

  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está cargado.');
    }
    // ÚNICA escritura. El código y el orden NO viajan: los asigna el
    // backend server-side (código derivado, agregado al final).
    await window.MantencionesService.guardarSeccion({
      seccionId: seccionId,
      guiaId: guiaId,
      titulo: titulo,
      activo: activoSeccion
    });
  } catch (err) {
    console.error('Error guardando la sección de la guía:', err);
    mntGuiaAdminError(mntGuiaAdminMensajeError(err));
    mntGuiaAdminGuardando = false;
    if (btn) btn.disabled = false;
    if (etiqueta) etiqueta.textContent = etiquetaBase;
    return;
  }

  let datos = null;
  try {
    datos = await mntGuiaAdminRefrescar();
  } finally {
    mntGuiaAdminGuardando = false;
  }

  if (!datos) {
    mntGuiaAdminPendienteRefresco = clave;
    mntGuiaAdminRepintarModal();
    return;
  }

  mntGuiaAdminAplicarDatos(datos);
  mntGuiaAdminEditando = null; // el formulario inline ya cumplió su rol
  mntGuiaAdminRepintarPanel();
  mntGuiaAdminRepintarModal();
}

// C) CREAR / EDITAR RECOMENDACIÓN → guardarItemGuia()
async function mntGuiaAdminEnviarItem(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();

  if (mntGuiaAdminGuardando) return;
  if (!mntGuiaAdminEsPermanente()) return;

  const cont = document.getElementById('mnt-modal-admin-guia');
  if (!cont) return;

  // C2G-7.1 — GUARDED #1: el envío solo procede si EL ESTADO dice que lo
  // que se edita/crea es una RECOMENDACIÓN. Un estado de sección (o uno
  // ausente) que llegue aquí se DETIENE: esta función jamás puede derivar en
  // guardarSeccion().
  const editandoItem = mntGuiaAdminEditando;
  const tipoEdicion = (editandoItem && typeof editandoItem.tipo === 'string')
    ? editandoItem.tipo
    : '';
  if (tipoEdicion !== 'item' && tipoEdicion !== 'nuevo_item') {
    console.warn('Envío de recomendación ignorado: no hay una edición de recomendación activa (tipo actual: ' + (tipoEdicion || 'ninguno') + ').');
    return;
  }

  // C2G-7.1 — campos LEÍDOS DEL FORMULARIO ENVIADO (nunca por id global del
  // documento): si el evento no corresponde al formulario de recomendación,
  // los campos no existen y el envío se DETIENE (fail-closed).
  const form = mntGuiaAdminFormulario(ev);
  const itemId = mntGuiaAdminValorFormulario(form, 'mnt-guia-admin-item-id') || null;
  const seccionId = mntGuiaAdminValorFormulario(form, 'mnt-guia-admin-item-seccion-id');
  if (seccionId === null || !seccionId) {
    console.warn('Envío de recomendación ignorado: el formulario enviado no es el de recomendaciones.');
    return;
  }

  // C2G-7.1 — GUARDED #2: la sección destino debe EXISTIR en los datos.
  const seccionDestino = mntGuiaSecciones.find(s => s && s.id === seccionId) || null;
  if (!seccionDestino) {
    console.warn('Envío de recomendación ignorado: la sección destino no existe en los datos cargados.');
    return;
  }

  // C2G-7.1 — GUARDED #3: coherencia estado ↔ ids ↔ datos reales, y estado
  // ACTUAL real del ítem (nunca se inventa ni se fuerza un estado).
  let activoActual = true;
  if (itemId) {
    // Edición: estado 'item' y con el MISMO id; nunca un id de sección como
    // itemId; el ítem debe EXISTIR y pertenecer a ESTA sección.
    if (tipoEdicion !== 'item' || editandoItem.id !== itemId) {
      console.warn('Envío de recomendación ignorado: el id del formulario no coincide con la recomendación que se está editando.');
      return;
    }
    if (itemId === seccionId) {
      console.warn('Envío de recomendación ignorado: un id de sección no puede usarse como id de recomendación.');
      return;
    }
    const itemReal = mntGuiaItems.find(i => i && i.id === itemId) || null;
    if (!itemReal) {
      console.warn('Envío de recomendación ignorado: la recomendación indicada no existe en los datos cargados.');
      return;
    }
    if (itemReal.seccion_id !== seccionId) {
      console.warn('Envío de recomendación ignorado: la recomendación no pertenece a la sección seleccionada.');
      return;
    }
    activoActual = itemReal.activo !== false; // estado REAL actual
  } else if (tipoEdicion !== 'nuevo_item') {
    console.warn('Envío de recomendación ignorado: creación sin estado "nuevo_item".');
    return;
  }

  const clave = itemId
    ? mntGuiaAdminClave('item', itemId)
    : mntGuiaAdminClave('nuevo_item', seccionId);
  if (mntGuiaAdminPendienteRefresco === clave) {
    console.warn('Cambio de recomendación ya guardado con relectura pendiente: se omite un segundo envío.');
    return;
  }

  const contenido = mntGuiaAdminValorFormulario(form, 'mnt-guia-admin-item-contenido');
  if (!contenido) {
    mntGuiaAdminError('El texto de la recomendación es obligatorio.');
    return;
  }

  const btn = form ? form.querySelector('[id="mnt-guia-admin-submit"]') : null;
  const etiqueta = form ? form.querySelector('[id="mnt-guia-admin-submit-label"]') : null;
  const etiquetaBase = itemId ? 'Guardar recomendación' : 'Agregar recomendación';
  mntGuiaAdminGuardando = true;
  if (btn) btn.disabled = true;
  if (etiqueta) etiqueta.textContent = 'Guardando...';
  mntGuiaAdminOcultarError();

  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está cargado.');
    }
    // ÚNICA escritura. El orden NO viaja: lo asigna el backend.
    // C2G-7.1: `activo` = estado REAL actual del ítem (en creación, true;
    // dato actual: los ítems existentes están vigentes).
    await window.MantencionesService.guardarItemGuia({
      itemId: itemId,
      seccionId: seccionId,
      contenido: contenido,
      activo: activoActual
    });
  } catch (err) {
    console.error('Error guardando la recomendación de la guía:', err);
    mntGuiaAdminError(mntGuiaAdminMensajeError(err));
    mntGuiaAdminGuardando = false;
    if (btn) btn.disabled = false;
    if (etiqueta) etiqueta.textContent = etiquetaBase;
    return;
  }

  let datos = null;
  try {
    datos = await mntGuiaAdminRefrescar();
  } finally {
    mntGuiaAdminGuardando = false;
  }

  if (!datos) {
    mntGuiaAdminPendienteRefresco = clave;
    mntGuiaAdminRepintarModal();
    return;
  }

  mntGuiaAdminAplicarDatos(datos);
  mntGuiaAdminEditando = null;
  mntGuiaAdminRepintarPanel();
  mntGuiaAdminRepintarModal();
}

// D) ACTIVAR / DESACTIVAR SECCIÓN → guardarSeccion() con el título REAL
//    actual (nunca se borra físicamente).
async function mntGuiaAdminAlternarSeccion(seccionId) {
  const id = typeof seccionId === 'string' ? seccionId.trim() : '';
  if (!id) return;

  if (mntGuiaAdminGuardando) return;
  if (!mntGuiaAdminEsPermanente()) return;

  const cont = document.getElementById('mnt-modal-admin-guia');
  if (!cont) return;

  const guia = mntGuiaActiva(mntGuiasBase);
  const seccion = mntGuiaSecciones.find(s => s && s.id === id) || null;
  if (!guia || !seccion) return;

  const activoActual = seccion.activo !== false;
  const activoNuevo = !activoActual;

  // Confirmación clara antes de DESACTIVAR (sin borrado físico).
  if (!activoNuevo) {
    const confirmar = window.confirm(
      '¿Desactivar esta sección?\n\n' +
      'No se borra nada: la sección quedará oculta en la vista de lectura, ' +
      'pero permanecerá aquí para poder reactivarla.'
    );
    if (!confirmar) return;
  }

  const clave = mntGuiaAdminClave('seccion', id);
  if (mntGuiaAdminPendienteRefresco === clave) {
    console.warn('Cambio de sección ya guardado con relectura pendiente: se omite un segundo envío.');
    return;
  }

  const btn = document.getElementById('mnt-guia-admin-toggle-' + id);
  mntGuiaAdminGuardando = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  mntGuiaAdminOcultarError();

  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está cargado.');
    }
    await window.MantencionesService.guardarSeccion({
      seccionId: seccion.id,
      guiaId: guia.id,
      titulo: seccion.titulo,
      activo: activoNuevo
    });
  } catch (err) {
    console.error('Error cambiando el estado de la sección:', err);
    // Ruta A: el botón se restaura vía repintado (sin formulario abierto).
    mntGuiaAdminRepintarModal();
    mntGuiaAdminError(mntGuiaAdminMensajeError(err));
    mntGuiaAdminGuardando = false;
    return;
  }

  let datos = null;
  try {
    datos = await mntGuiaAdminRefrescar();
  } finally {
    mntGuiaAdminGuardando = false;
  }

  if (!datos) {
    mntGuiaAdminPendienteRefresco = clave;
    mntGuiaAdminRepintarModal();
    return;
  }

  mntGuiaAdminAplicarDatos(datos);
  mntGuiaAdminRepintarPanel();
  mntGuiaAdminRepintarModal();
}

// E) ACTIVAR / DESACTIVAR RECOMENDACIÓN → guardarItemGuia() con el
//    contenido REAL actual (nunca se borra físicamente).
async function mntGuiaAdminAlternarItem(itemId) {
  const id = typeof itemId === 'string' ? itemId.trim() : '';
  if (!id) return;

  if (mntGuiaAdminGuardando) return;
  if (!mntGuiaAdminEsPermanente()) return;

  const cont = document.getElementById('mnt-modal-admin-guia');
  if (!cont) return;

  const item = mntGuiaItems.find(i => i && i.id === id) || null;
  if (!item || !item.seccion_id) return;

  const activoActual = item.activo !== false;
  const activoNuevo = !activoActual;

  if (!activoNuevo) {
    const confirmar = window.confirm(
      '¿Desactivar esta recomendación?\n\n' +
      'No se borra nada: quedará oculta en la vista de lectura, ' +
      'pero permanecerá aquí para poder reactivarla.'
    );
    if (!confirmar) return;
  }

  const clave = mntGuiaAdminClave('item', id);
  if (mntGuiaAdminPendienteRefresco === clave) {
    console.warn('Cambio de recomendación ya guardado con relectura pendiente: se omite un segundo envío.');
    return;
  }

  const btn = document.getElementById('mnt-guia-admin-toggle-' + id);
  mntGuiaAdminGuardando = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  mntGuiaAdminOcultarError();

  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está cargado.');
    }
    await window.MantencionesService.guardarItemGuia({
      itemId: item.id,
      seccionId: item.seccion_id,
      contenido: item.contenido,
      activo: activoNuevo
    });
  } catch (err) {
    console.error('Error cambiando el estado de la recomendación:', err);
    mntGuiaAdminRepintarModal();
    mntGuiaAdminError(mntGuiaAdminMensajeError(err));
    mntGuiaAdminGuardando = false;
    return;
  }

  let datos = null;
  try {
    datos = await mntGuiaAdminRefrescar();
  } finally {
    mntGuiaAdminGuardando = false;
  }

  if (!datos) {
    mntGuiaAdminPendienteRefresco = clave;
    mntGuiaAdminRepintarModal();
    return;
  }

  mntGuiaAdminAplicarDatos(datos);
  mntGuiaAdminRepintarPanel();
  mntGuiaAdminRepintarModal();
}

// ==========================================================
// JARDINERÍA — FASE 2.9
// ==========================================================
// Subapartado de Mantención General (NO es un módulo principal del sidebar
// y NO confundir con workarea_jardineria / "Mantención de Jardinería" de los
// mocks antiguos de Áreas/Mejoras).
//
// Fuentes: 6 tablas ya cacheadas por MantencionesService.getJardineria():
//   jardineria_sectores, jardineria_trabajos, jardineria_riego_programacion,
//   jardineria_riego_zonas, jardineria_riego_notas,
//   jardineria_labores_complementarias.
//
// Reglas de datos (NO se inventa información):
// - Título vacío → "Sin título registrado" (solo presentación; el dato
//   fuente sigue siendo vacío). Las 26 filas sin título se MUESTRAN en su
//   listado normal, sin toggle y sin tratarse como error.
// - Prioridad LITERAL (Prioridad 1 / 2 / 3 / Sin prioridad registrada).
//   NUNCA Alta / Media / Baja: no hay evidencia de esa semántica.
// - Los booleanos estacionales son PERIODOS DOCUMENTALES
//   (Invierno / Otoño, Verano / Primavera). NUNCA se convierten en fechas;
//   no hay Gantt, ni programación, ni alertas, ni notificaciones.
// - NO se llama getMantenciones(): no existe historial de jardinería.
// - SOLO LECTURA: sin INSERT / UPDATE / DELETE.
// - No se muestran UUID (id, sector_id, importacion_id) ni created_at /
//   updated_at.
// - Relación sector → trabajos SIEMPRE por FK trabajo.sector_id.
// - Labores complementarias son fuente INDEPENDIENTE (Labores Jardineros.docx)
//   y nunca se suman ni mezclan con los 127 trabajos del Excel.
// - Reset de estado al cerrar la modal; _jardineriaCache NUNCA se limpia.

// Archivo fuente conocido de los trabajos de jardinería. Se usa como
// constante en la trazabilidad de la ficha para NO hacer una consulta por
// trabajo (sin N+1) ni arriesgar un embed PostgREST que tumbaría
// getJardineria() si la FK no estuviera declarada.
const MNT_ARCHIVO_JARDINERIA = '2024-Trabajos de jardinería 4 sectores.xlsx';

// Fuente documental de las labores complementarias (DOCX independiente).
const MNT_FUENTE_LABORES_JARDINERIA = 'Labores Jardineros.docx';

// Fragmento que identifica la nota técnica de migración de las filas del
// Excel sin nombre de trabajo. Se detecta por CONTENIDO (no por posición)
// y en la ficha se muestra el TEXTO REAL guardado en BD, nunca uno reescrito.
const MNT_NOTA_MIGRACION_FILA_VACIA = 'Fila original preservada';

// ------------------------------------------------------------
// RESET (solo estado local; NO consulta Supabase ni toca _jardineriaCache)
// ------------------------------------------------------------
// Lo usan abrirMantencionSubapartado() y cerrarMantencionSubapartado()
// (X, Cerrar, Escape y overlay). Mientras la modal está abierta, la
// navegación Principal → sector → trabajo conserva los filtros del sector.
function mntResetJardineria() {
  mantencionSectorJardineriaSeleccionado = null;
  mantencionTrabajoJardineriaSeleccionado = null;
  mntResetFiltrosJardineria();
}

// Solo filtros (usa "Limpiar filtros" sin perder la navegación).
function mntResetFiltrosJardineria() {
  mantencionFiltrosJardineria.texto = '';
  mantencionFiltrosJardineria.prioridad = '';
  mantencionFiltrosJardineria.temporada = '';
  mantencionFiltrosJardineria.titulo = '';
}

// ------------------------------------------------------------
// Utilidades de datos (derivadas, nunca hardcodeadas)
// ------------------------------------------------------------
// Registros operativos: se excluye SOLO lo marcado activo = false.
// Hoy los 5 sectores, 127 trabajos, 7 días, 2 zonas, 2 notas y 23 labores
// están activos; el filtro es defensivo (null/true se muestran: no se
// ocultan datos por desconocimiento).
function mntJardineriaActivos(lista) {
  return (Array.isArray(lista) ? lista : []).filter(r => r && r.activo !== false);
}

// Plural correcto en español (1 labor / 23 labores).
function mntTextoJardineria(cantidad, singular, plural) {
  const n = Number(cantidad) || 0;
  return `${n} ${n === 1 ? singular : plural}`;
}

// Presentación Title Case de valores FUENTE en mayúsculas
// (PARCELA CASA → Parcela Casa; PERMANENTE DURANTE LA SEMANA →
// Permanente durante la semana). SOLO cambia el texto visible; el valor de
// BD queda intacto. Devuelve null cuando no hay valor (no se inventa).
function mntTextoTitleJardineria(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  // Conectores y sustantivos comunes que NO se capitalizan. Incluye
  // 'semana' para que el bloque "PERMANENTE DURANTE LA SEMANA" se lea como
  // "Permanente durante la semana" (etiqueta documental pedida en Fase 2.9).
  // Si la palabra encabeza la frase (índice 0) se capitaliza igualmente.
  const conectores = ['de', 'del', 'la', 'el', 'y', 'e', 'en', 'a', 'al', 'con', 'por', 'para', 'las', 'los', 'durante', 'sin', 'semana'];
  return texto.toLowerCase().split(/\s+/).map((palabra, i) => {
    if (i > 0 && conectores.indexOf(palabra) !== -1) return palabra;
    return palabra.charAt(0).toUpperCase() + palabra.slice(1);
  }).join(' ');
}

// Texto no vacío o null (para decidir si un campo opcional se muestra).
function mntValorPresenteJardineria(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

// ---- Título ----
// "Con título" = titulo no NULL y sin espacios en blanco.
// Nunca se genera un título alternativo: el fallback es SOLO presentación.
function mntTrabajoConTitulo(t) {
  return mntValorPresenteJardineria(t ? t.titulo : null) !== null;
}

function mntTituloTrabajoJardineria(t) {
  const titulo = mntValorPresenteJardineria(t ? t.titulo : null);
  return titulo !== null ? titulo : 'Sin título registrado';
}

// ---- Prioridad (literal; NUNCA Alta/Media/Baja) ----
function mntPrioridadTrabajoJardineria(valor) {
  const v = mntValorPresenteJardineria(valor);
  return v !== null ? `Prioridad ${v}` : 'Sin prioridad registrada';
}

// Valor literal para la ficha ("Prioridad original: 1").
function mntValorPrioridadJardineria(valor) {
  return mntValorPresenteJardineria(valor) !== null ? String(valor).trim() : 'Sin prioridad registrada';
}

// ---- Temporadas (periodos documentales, booleanos; nunca fechas) ----
function mntPeriodosTrabajoJardineria(t) {
  const invierno = !!(t && t.invierno_otono === true);
  const verano = !!(t && t.verano_primavera === true);
  return {
    invierno: invierno,
    verano: verano,
    alguna: invierno || verano,
    ambas: invierno && verano
  };
}

// ------------------------------------------------------------
// Sectores y trabajos (relación SIEMPRE por FK sector_id)
// ------------------------------------------------------------
// Sectores ordenados por sector.orden ASC (1 → 5), con defensa si orden es
// NULL. NUNCA por nombre ni por hoja.
function mntSectoresJardineria() {
  return mntJardineriaActivos(mntJardineriaSectores).slice().sort((a, b) => {
    const na = Number(a.orden), nb = Number(b.orden);
    const oa = Number.isFinite(na) ? na : Number.MAX_SAFE_INTEGER;
    const ob = Number.isFinite(nb) ? nb : Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    const nombreA = mntValorPresenteJardineria(a.nombre) || '';
    const nombreB = mntValorPresenteJardineria(b.nombre) || '';
    return nombreA.localeCompare(nombreB, 'es');
  });
}

function mntSectorSeleccionadoJardineria() {
  if (!mantencionSectorJardineriaSeleccionado) return null;
  const lista = Array.isArray(mntJardineriaSectores) ? mntJardineriaSectores : [];
  return lista.find(s => s && s.id === mantencionSectorJardineriaSeleccionado) || null;
}

// Orden estable heredado del servicio (hoja_origen ASC, fila_origen ASC);
// se re-aplica defensivamente en cliente y NUNCA se ordena por título.
function mntCompararTrabajosJardineria(a, b) {
  const hojaA = mntValorPresenteJardineria(a.hoja_origen) || '';
  const hojaB = mntValorPresenteJardineria(b.hoja_origen) || '';
  if (hojaA !== hojaB) return hojaA.localeCompare(hojaB, 'es');
  const filaA = Number(a.fila_origen), filaB = Number(b.fila_origen);
  const esNumA = Number.isFinite(filaA), esNumB = Number.isFinite(filaB);
  if (esNumA && esNumB) return filaA - filaB;
  if (esNumA) return -1;
  if (esNumB) return 1;
  return 0;
}

// Trabajos de UN sector por FK real (t.work.sector_id === sector.id).
// NUNCA se relaciona por nombre ni por hoja_origen.
function mntTrabajosSectorJardineria(sectorId) {
  if (!sectorId) return [];
  return mntJardineriaActivos(mntJardineriaTrabajos)
    .filter(t => t && t.sector_id === sectorId)
    .slice()
    .sort(mntCompararTrabajosJardineria);
}

// ------------------------------------------------------------
// Filtros del detalle de sector (derivados de los datos reales)
// ------------------------------------------------------------
// prioridad: '1' | '2' | '3' | ... | 'sin' | '' (Todas).
// Opciones derivadas de los valores presentes (hoy: 1, 2, 3 y NULL).
function mntOpcionesPrioridadJardineria(lista) {
  const valores = new Set();
  let haySinPrioridad = false;
  mntJardineriaActivos(lista).forEach(t => {
    if (!t) return;
    const v = mntValorPresenteJardineria(t.prioridad);
    if (v === null) haySinPrioridad = true;
    else valores.add(v);
  });

  const ordenadas = Array.from(valores).sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b, 'es');
  });

  return { prioridades: ordenadas, haySinPrioridad: haySinPrioridad };
}

// Aplica los 4 filtros en cliente (AND), sin volver a Supabase.
// texto | prioridad | temporada | titulo
function mntFiltrarJardineria(lista) {
  const texto = (mantencionFiltrosJardineria.texto || '').trim().toLowerCase();
  const prioridad = mantencionFiltrosJardineria.prioridad || '';
  const temporada = mantencionFiltrosJardineria.temporada || '';
  const titulo = mantencionFiltrosJardineria.titulo || '';

  return mntJardineriaActivos(lista).filter(t => {
    if (!t) return false;

    // Filtro de título: 'con' | 'sin' (definición: trim !== '').
    if (titulo) {
      const conTitulo = mntTrabajoConTitulo(t);
      if (titulo === 'con' && !conTitulo) return false;
      if (titulo === 'sin' && conTitulo) return false;
    }

    // Filtro de prioridad LITERAL (sin interpretación semántica).
    if (prioridad) {
      const v = mntValorPresenteJardineria(t.prioridad);
      if (prioridad === 'sin') {
        if (v !== null) return false;
      } else if (v === null || v !== prioridad) {
        return false;
      }
    }

    // Filtro de temporada:
    // - invierno: invierno_otono === true (aunque también verano).
    // - verano:   verano_primavera === true (aunque también invierno).
    // - ambas:    ambos true.
    // - sin:      ambos false.
    if (temporada) {
      const p = mntPeriodosTrabajoJardineria(t);
      if (temporada === 'invierno' && !p.invierno) return false;
      if (temporada === 'verano' && !p.verano) return false;
      if (temporada === 'ambas' && !p.ambas) return false;
      if (temporada === 'sin' && p.alguna) return false;
    }

    // Buscador (case-insensitive): título, título original y el texto de
    // presentación (de modo que "Sin título registrado" encuentra las 26),
    // más prioridad como texto y hoja de origen.
    if (texto) {
      const campos = [
        t.titulo,
        t.titulo_original,
        mntTituloTrabajoJardineria(t),
        mntPrioridadTrabajoJardineria(t.prioridad),
        t.hoja_origen
      ];
      const coincide = campos.some(c => {
        if (c === null || c === undefined || c === '') return false;
        return String(c).toLowerCase().indexOf(texto) !== -1;
      });
      if (!coincide) return false;
    }

    return true;
  });
}

// Buscador + 3 filtros, con las opciones SIEMPRE derivadas de los datos.
function mntFiltrosJardineriaHTML(opciones) {
  const selPrioridad = mantencionFiltrosJardineria.prioridad || '';
  const selTemporada = mantencionFiltrosJardineria.temporada || '';
  const selTitulo = mantencionFiltrosJardineria.titulo || '';
  const haySeleccion = !!(
    mantencionFiltrosJardineria.texto || selPrioridad || selTemporada || selTitulo
  );

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-3 border border-slate-100 dark:border-slate-800">
      <div>
        <label for="mnt-buscar-jardineria" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Buscar</label>
        <input id="mnt-buscar-jardineria" type="text" value="${mntEsc(mantencionFiltrosJardineria.texto || '')}"
          oninput="mntOnBuscarJardineria(this.value)"
          placeholder="Título, prioridad u hoja de origen..."
          class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label for="mnt-filtro-prioridad-jardineria" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Prioridad</label>
          <select id="mnt-filtro-prioridad-jardineria" onchange="mntOnFiltrarPrioridadJardineria(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todas las prioridades</option>
            ${opciones.prioridades.map(v => `<option value="${mntEsc(v)}" ${v === selPrioridad ? 'selected' : ''}>${mntEsc('Prioridad ' + v)}</option>`).join('')}
            ${opciones.haySinPrioridad ? `<option value="sin" ${selPrioridad === 'sin' ? 'selected' : ''}>Sin prioridad registrada</option>` : ''}
          </select>
        </div>
        <div>
          <label for="mnt-filtro-temporada-jardineria" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Temporada</label>
          <select id="mnt-filtro-temporada-jardineria" onchange="mntOnFiltrarTemporadaJardineria(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todas las temporadas</option>
            <option value="invierno" ${selTemporada === 'invierno' ? 'selected' : ''}>Invierno / Otoño</option>
            <option value="verano" ${selTemporada === 'verano' ? 'selected' : ''}>Verano / Primavera</option>
            <option value="ambas" ${selTemporada === 'ambas' ? 'selected' : ''}>Ambas</option>
            <option value="sin" ${selTemporada === 'sin' ? 'selected' : ''}>Sin temporada registrada</option>
          </select>
        </div>
        <div>
          <label for="mnt-filtro-titulo-jardineria" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Título</label>
          <select id="mnt-filtro-titulo-jardineria" onchange="mntOnFiltrarTituloJardineria(this.value)"
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="">Todos</option>
            <option value="con" ${selTitulo === 'con' ? 'selected' : ''}>Con título</option>
            <option value="sin" ${selTitulo === 'sin' ? 'selected' : ''}>Sin título</option>
          </select>
        </div>
      </div>
      ${haySeleccion ? `
        <button onclick="mntLimpiarFiltrosJardineria()"
          class="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
          Limpiar filtros
        </button>
      ` : ''}
    </div>
  `;
}

// ------------------------------------------------------------
// Manejadores (solo re-render de la cuadrícula y el contador; sin recargar
// la SPA, sin volver a Supabase y sin tocar el <input>: conserva el foco)
// ------------------------------------------------------------
function mntOnBuscarJardineria(valor) {
  mantencionFiltrosJardineria.texto = valor || '';
  mntRefrescarJardineria();
}

function mntOnFiltrarPrioridadJardineria(valor) {
  mantencionFiltrosJardineria.prioridad = valor || '';
  mntRefrescarJardineria();
}

function mntOnFiltrarTemporadaJardineria(valor) {
  mantencionFiltrosJardineria.temporada = valor || '';
  mntRefrescarJardineria();
}

function mntOnFiltrarTituloJardineria(valor) {
  mantencionFiltrosJardineria.titulo = valor || '';
  mntRefrescarJardineria();
}

// Limpia los 4 filtros y redibuja el panel completo (para refrescar también
// los <select>). No toca la selección de sector ni la caché.
function mntLimpiarFiltrosJardineria() {
  mntResetFiltrosJardineria();
  mntRepintarJardineria();
}

// Actualiza únicamente la cuadrícula y el contador del sector.
function mntRefrescarJardineria() {
  const cont = document.getElementById('mnt-listado-trabajos-jardineria');
  const contador = document.getElementById('mnt-contador-jardineria');
  if (!cont) return;

  const sector = mntSectorSeleccionadoJardineria();
  if (!sector) return;

  const trabajos = mntTrabajosSectorJardineria(sector.id);
  const filtrados = mntFiltrarJardineria(trabajos);
  cont.innerHTML = mntCuadriculaTrabajosJardineriaHTML(filtrados);
  if (contador) contador.textContent = `${filtrados.length} de ${trabajos.length} trabajos`;
}

// Redibuja el panel completo desde el estado en memoria (sin consultar
// Supabase: se reutilizan las copias cacheadas).
function mntRepintarJardineria() {
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel) return;

  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'jardineria')
    || { nombre: 'Jardinería', icono: '🌿', subapartado: true };

  panel.innerHTML = mntPanelJardineriaHTML(meta, {
    sectores: mntJardineriaSectores,
    trabajos: mntJardineriaTrabajos,
    riegoProgramacion: mntJardineriaRiegoProgramacion,
    riegoZonas: mntJardineriaRiegoZonas,
    riegoNotas: mntJardineriaRiegoNotas,
    laboresComplementarias: mntJardineriaLabores
  });
}

// ------------------------------------------------------------
// Navegación dentro de la MISMA modal (sin modal sobre modal)
// ------------------------------------------------------------
function abrirSectorJardineria(id) {
  mantencionSectorJardineriaSeleccionado = id;
  mantencionTrabajoJardineriaSeleccionado = null;
  // Los filtros NO se limpian aquí: se conservan mientras la modal siga abierta.
  mntRepintarJardineria();
}

function volverAJardineria() {
  mantencionSectorJardineriaSeleccionado = null;
  mantencionTrabajoJardineriaSeleccionado = null;
  mntRepintarJardineria();
}

function abrirTrabajoJardineria(id) {
  mantencionTrabajoJardineriaSeleccionado = id;
  mntRepintarJardineria();
}

// Vuelve al listado del sector CONSERVANDO texto, prioridad, temporada y
// título (los filtros viven en estado, no en el DOM).
function volverAlSectorJardineria() {
  mantencionTrabajoJardineriaSeleccionado = null;
  mntRepintarJardineria();
}

// ------------------------------------------------------------
// Panel: principal / sector / ficha de trabajo (misma modal)
// ------------------------------------------------------------
function mntPanelJardineriaHTML(meta, datos) {
  const d = (datos && typeof datos === 'object') ? datos : {};
  mntJardineriaSectores = Array.isArray(d.sectores) ? d.sectores : [];
  mntJardineriaTrabajos = Array.isArray(d.trabajos) ? d.trabajos : [];
  mntJardineriaRiegoProgramacion = Array.isArray(d.riegoProgramacion) ? d.riegoProgramacion : [];
  mntJardineriaRiegoZonas = Array.isArray(d.riegoZonas) ? d.riegoZonas : [];
  mntJardineriaRiegoNotas = Array.isArray(d.riegoNotas) ? d.riegoNotas : [];
  mntJardineriaLabores = Array.isArray(d.laboresComplementarias) ? d.laboresComplementarias : [];

  // C2J-4: botón de administración SOLO para Administrador permanente
  // (helper real esAdminPermanenteActual() de js/app.js, mismo criterio que
  // "Administrar guía"). Los usuarios habilitados normales mantienen
  // EXACTAMENTE la experiencia de solo lectura actual, sin controles.
  const botonesAdmin = mntJardineriaAdminEsPermanente()
    ? `<button type="button" onclick="abrirModalAdminJardineria()"
        class="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 px-3 py-1.5 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors">
        Administrar Jardinería
      </button>`
    : '';

  // El título grande ya lo muestra la cabecera de la modal.
  const encabezado = `
    <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
      <p class="text-[11px] text-slate-500 dark:text-slate-400">Subapartado de Mantención General</p>
      <div class="flex flex-wrap items-center gap-2">
        ${botonesAdmin}
        <span class="text-xs font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 px-3 py-1.5 rounded-xl">
          Fase 2 · Jardinería
        </span>
      </div>
    </div>
  `;

  let cuerpo;
  const sector = mntSectorSeleccionadoJardineria();
  if (sector) {
    cuerpo = mntCuerpoSectorJardineriaHTML(sector);
  } else if (mantencionSectorJardineriaSeleccionado) {
    // Sector seleccionado que ya no existe en los datos cargados.
    cuerpo = `
      <div class="mt-5 space-y-4">
        <button onclick="volverAJardineria()"
          class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1.5">
          <span>←</span><span>Volver a Jardinería</span>
        </button>
        <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-2">
          <span class="text-3xl block">⚠️</span>
          <p class="text-sm font-bold text-slate-700 dark:text-slate-200">Sector no encontrado</p>
        </div>
      </div>
    `;
  } else {
    cuerpo = mntCuerpoPrincipalJardineriaHTML();
  }

  return `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      ${encabezado}
      ${cuerpo}
    </div>
  `;
}

// Cuerpo PRINCIPAL: contador derivado + 5 tarjetas de sector (orden 1 → 5)
// + bloque general de Riego + bloque general de Labores complementarias.
function mntCuerpoPrincipalJardineriaHTML() {
  const sectores = mntSectoresJardineria();
  const totalTrabajos = mntJardineriaActivos(mntJardineriaTrabajos).length;

  if (sectores.length === 0) {
    return `
      <div class="mt-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-10 text-center space-y-2">
        <span class="text-4xl block">🌿</span>
        <h4 class="text-base font-black text-slate-700 dark:text-slate-200">No hay sectores de jardinería registrados</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400">Aún no existen registros de jardinería.</p>
      </div>
    `;
  }

  return `
    <div class="mt-5 space-y-6">

      <!-- ENCABEZADO CON CONTADOR DERIVADO (nunca hardcodeado) -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Jardinería</h4>
          <p class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">
            ${mntTextoJardineria(sectores.length, 'sector', 'sectores')} · ${mntTextoJardineria(totalTrabajos, 'registro de trabajo', 'registros de trabajo')}
          </p>
        </div>
      </div>

      <!-- TARJETAS DE SECTOR (ordenadas por sector.orden) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${sectores.map(mntTarjetaSectorJardineriaHTML).join('')}
      </div>

      <!-- BLOQUE GENERAL: RIEGO CON AGUA TRATADA (una sola vez) -->
      ${mntBloqueRiegoHTML()}

      <!-- BLOQUE GENERAL: LABORES COMPLEMENTARIAS (una sola vez) -->
      ${mntBloqueLaboresHTML()}
    </div>
  `;
}

function mntTarjetaSectorJardineriaHTML(sector) {
  const trabajos = mntTrabajosSectorJardineria(sector.id);
  const total = trabajos.length;
  const conTitulo = trabajos.filter(t => mntTrabajoConTitulo(t)).length;
  const sinTitulo = total - conTitulo;
  const hoja = mntValorPresenteJardineria(sector.hoja_origen);

  return `
    <div onclick="abrirSectorJardineria('${mntEsc(sector.id)}')"
      class="bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-500 hover:shadow-lg transition-all cursor-pointer card-hover group flex flex-col justify-between">
      <div>
        <div class="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center text-xl shrink-0 mb-3">🌿</div>
        <h4 class="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-snug break-words">${mntEsc(sector.nombre || 'Sin nombre registrado')}</h4>
        ${hoja ? `<p class="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-1">Hoja origen: ${mntEsc(hoja)}</p>` : ''}
        <p class="mt-2.5 text-[11px] font-black ${total > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}">
          ${total === 0 ? '0 trabajos registrados' : mntTextoJardineria(total, 'trabajo', 'trabajos')}
        </p>
        ${total > 0 ? `<p class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">${mntTextoJardineria(conTitulo, 'con título', 'con título')}</p>` : ''}
        ${sinTitulo > 0 ? `<p class="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">${mntTextoJardineria(sinTitulo, 'sin título', 'sin título')}</p>` : ''}
      </div>
      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold">
        <span class="text-slate-400 dark:text-slate-500">Abrir sector</span>

      </div>
    </div>
  `;
}

// Cuerpo del SECTOR: cabecera + listado con filtros, o la ficha del trabajo
// si hay uno seleccionado. Todo dentro de la misma modal.
function mntCuerpoSectorJardineriaHTML(sector) {
  const botonVolver = `
    <button onclick="volverAJardineria()"
      class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1.5">
      <span>←</span><span>Volver a Jardinería</span>
    </button>
  `;

  // ---- FICHA DEL TRABAJO (sector → trabajo) ----
  if (mantencionTrabajoJardineriaSeleccionado) {
    const trabajo = mntTrabajosSectorJardineria(sector.id)
      .find(t => t && t.id === mantencionTrabajoJardineriaSeleccionado) || null;

    return `
      <div class="mt-5 space-y-4">
        <button onclick="volverAlSectorJardineria()"
          class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1.5">
          <span>←</span><span>Volver a los trabajos de ${mntEsc(sector.nombre || 'Jardinería')}</span>
        </button>
        ${trabajo ? mntFichaTrabajoJardineriaHTML(trabajo, sector) : `
          <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-2">
            <span class="text-3xl block">⚠️</span>
            <p class="text-sm font-bold text-slate-700 dark:text-slate-200">Trabajo no encontrado</p>
          </div>
        `}
      </div>
    `;
  }

  // ---- LISTADO DEL SECTOR ----
  const trabajos = mntTrabajosSectorJardineria(sector.id);
  const hoja = mntValorPresenteJardineria(sector.hoja_origen);

  const cabecera = `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h4 class="text-base font-black text-slate-900 dark:text-white leading-snug break-words">${mntEsc(sector.nombre || 'Sin nombre registrado')}</h4>
        ${hoja ? `<p class="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-1">Hoja origen: ${mntEsc(hoja)}</p>` : ''}
      </div>
    </div>
  `;

  // Sector sin trabajos (ej.: Zona Cachureos y Trabajos para anotar):
  // estado vacío correcto + nota del registro con etiqueta neutra.
  if (trabajos.length === 0) {
    return `
      <div class="mt-5 space-y-4">
        ${botonVolver}
        ${cabecera}
        <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-2">
          <span class="text-3xl block">🌿</span>
          <h5 class="text-sm font-black text-slate-700 dark:text-slate-200">Sin trabajos registrados en este sector.</h5>
          <p class="text-xs text-slate-500 dark:text-slate-400">Este sector existe y está activo; la hoja original del archivo estaba vacía.</p>
        </div>
        ${mntNotaRegistroSectorHTML(sector)}
      </div>
    `;
  }

  const opciones = mntOpcionesPrioridadJardineria(trabajos);
  const filtrados = mntFiltrarJardineria(trabajos);

  return `
    <div class="mt-5 space-y-4">
      ${botonVolver}
      ${cabecera}
      <p id="mnt-contador-jardineria" class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
        ${filtrados.length} de ${trabajos.length} trabajos
      </p>
      ${mntFiltrosJardineriaHTML(opciones)}
      <div id="mnt-listado-trabajos-jardineria">
        ${mntCuadriculaTrabajosJardineriaHTML(filtrados)}
      </div>
    </div>
  `;
}

// Nota del sector con etiqueta NEUTRA ("Nota del registro"). La etiqueta
// comercial de cliente jamás se usa sin evidencia documental.
function mntNotaRegistroSectorHTML(sector) {
  const nota = mntValorPresenteJardineria(sector ? sector.observaciones : null);
  if (nota === null) return '';

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
      <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">Nota del registro</p>
      <p class="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-relaxed break-words">${mntEsc(nota)}</p>
    </div>
  `;
}

// ------------------------------------------------------------
// Cuadrícula y tarjeta de trabajo
// ------------------------------------------------------------
function mntCuadriculaTrabajosJardineriaHTML(filtrados) {
  if (!filtrados || filtrados.length === 0) {
    return `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center space-y-1">
        <span class="text-3xl block">🔍</span>
        <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Sin resultados para los filtros aplicados</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Prueba con otro texto, prioridad, temporada u título.</p>
      </div>
    `;
  }

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${filtrados.map(mntTarjetaTrabajoJardineriaHTML).join('')}
    </div>
  `;
}

function mntTarjetaTrabajoJardineriaHTML(t) {
  const conTitulo = mntTrabajoConTitulo(t);
  const periodo = mntPeriodosTrabajoJardineria(t);
  const fila = mntValorPresenteJardineria(t.fila_origen);

  return `
    <div onclick="abrirTrabajoJardineria('${mntEsc(t.id)}')"
      class="bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-500 hover:shadow-lg transition-all cursor-pointer card-hover group flex flex-col justify-between">
      <div>
        <div class="flex items-start justify-between gap-2 mb-2">
          <h4 class="text-sm font-extrabold leading-snug break-words ${conTitulo ? 'text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400' : 'text-slate-400 dark:text-slate-500 font-semibold italic'}">${mntEsc(mntTituloTrabajoJardineria(t))}</h4>
          ${fila !== null ? `<span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 shrink-0">fila ${mntEsc(fila)}</span>` : ''}
        </div>
        <p class="text-[11px] font-black text-slate-600 dark:text-slate-300">${mntEsc(mntPrioridadTrabajoJardineria(t.prioridad))}</p>
        <div class="flex flex-wrap gap-1.5 mt-2.5">
          ${periodo.invierno ? `<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-900">Invierno / Otoño</span>` : ''}
          ${periodo.verano ? `<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">Verano / Primavera</span>` : ''}
          ${!periodo.alguna ? `<span class="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Sin temporada registrada</span>` : ''}
        </div>
      </div>
      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold">
        <span class="text-slate-400 dark:text-slate-500">Ver detalle</span>

      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// Ficha del trabajo (DENTRO de la modal del subapartado)
// ------------------------------------------------------------
// Sin UUID, sin importacion_id, sin created_at/updated_at. La prioridad se
// muestra LITERAL y los periodos como booleanos documentales (nunca fechas).
function mntFichaTrabajoJardineriaHTML(t, sector) {
  const conTitulo = mntTrabajoConTitulo(t);
  const tituloOriginal = mntValorPresenteJardineria(t.titulo_original);
  const tituloNormal = mntValorPresenteJardineria(t.titulo);
  // Título original SOLO si aporta diferencia frente a titulo.
  const mostrarTituloOriginal = tituloOriginal !== null && tituloOriginal !== tituloNormal;

  const observaciones = mntValorPresenteJardineria(t.observaciones);
  const esNotaMigracion = observaciones !== null
    && observaciones.indexOf(MNT_NOTA_MIGRACION_FILA_VACIA) !== -1;

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-5 space-y-5">

      <!-- CABECERA FICHA -->
      <div class="flex items-start gap-3">
        <div class="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center text-2xl shrink-0">🌿</div>
        <div class="min-w-0">
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Ficha del trabajo</p>
          <h3 class="text-lg font-black leading-snug break-words ${conTitulo ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}">${mntEsc(mntTituloTrabajoJardineria(t))}</h3>
          <p class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">Sector: ${mntEsc(mntValorPresenteJardineria(sector ? sector.nombre : null) || 'Sin dato registrado')}</p>
        </div>
      </div>

      <!-- DATOS DEL TRABAJO -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${mostrarTituloOriginal ? mntCampoFichaHTML('Título original', tituloOriginal) : ''}
        ${mntCampoFichaHTML('Prioridad original', mntValorPrioridadJardineria(t.prioridad_original))}
        ${mntCampoFichaHTML('Prioridad', mntPrioridadTrabajoJardineria(t.prioridad))}
        <div>
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Periodo Invierno / Otoño</p>
          <p class="mt-1.5">${mntIndicadorBooleanoHTML(t.invierno_otono, { verdadero: 'Sí', falso: 'No' })}</p>
        </div>
        <div>
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Periodo Verano / Primavera</p>
          <p class="mt-1.5">${mntIndicadorBooleanoHTML(t.verano_primavera, { verdadero: 'Sí', falso: 'No' })}</p>
        </div>
      </div>

      <!-- NOTA DE MIGRACIÓN (solo cuando el texto real corresponde) -->
      ${esNotaMigracion ? `
        <div class="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl p-4 space-y-1.5">
          <p class="text-[10px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">Nota de migración</p>
          <p class="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-relaxed break-words">${mntEsc(observaciones)}</p>
          <p class="text-[10px] text-slate-500 dark:text-slate-400">Texto generado durante la migración para conservar una fila del Excel sin nombre de trabajo.</p>
        </div>
      ` : ''}

      <!-- OTRA OBSERVACIÓN: etiqueta neutra; jamás se atribuye al cliente sin evidencia -->
      ${(!esNotaMigracion && observaciones !== null) ? `
        <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
          <h4 class="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 mb-2">Observación registrada</h4>
          <p class="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-relaxed break-words">${mntEsc(observaciones)}</p>
        </div>
      ` : ''}

      <!-- TRAZABILIDAD (archivo fuente conocido, sin query por trabajo) -->
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 mb-3">Trazabilidad</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          ${mntCampoFichaHTML('Archivo', MNT_ARCHIVO_JARDINERIA)}
          ${mntCampoFichaHTML('Hoja', t.hoja_origen)}
          ${mntCampoFichaHTML('Fila', t.fila_origen)}
          ${mntCampoFichaHTML('Celda', t.celda_origen)}
        </div>
      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// BLOQUE GENERAL: RIEGO CON AGUA TRATADA (una sola vez, bajo los sectores)
// ------------------------------------------------------------
// Tabla semanal compacta (Día | Zona) ordenada por orden_dia ASC, zonas
// registradas como chips y notas con su contenido REAL (sin resumir ni
// reinterpretar). NO se repite dentro de cada sector.
function mntBloqueRiegoHTML() {
  const dias = mntJardineriaActivos(mntJardineriaRiegoProgramacion).slice().sort((a, b) => {
    const na = Number(a.orden_dia), nb = Number(b.orden_dia);
    const oa = Number.isFinite(na) ? na : Number.MAX_SAFE_INTEGER;
    const ob = Number.isFinite(nb) ? nb : Number.MAX_SAFE_INTEGER;
    return oa - ob;
  });
  const zonas = mntJardineriaActivos(mntJardineriaRiegoZonas);
  const notas = mntJardineriaActivos(mntJardineriaRiegoNotas).slice().sort((a, b) => {
    const na = Number(a.orden), nb = Number(b.orden);
    const oa = Number.isFinite(na) ? na : Number.MAX_SAFE_INTEGER;
    const ob = Number.isFinite(nb) ? nb : Number.MAX_SAFE_INTEGER;
    return oa - ob;
  });

  if (dias.length === 0 && zonas.length === 0 && notas.length === 0) return '';

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 sm:p-5 border border-slate-100 dark:border-slate-800 space-y-4">
      <div class="pb-3 border-b border-slate-200 dark:border-slate-700">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Riego con Agua Tratada</h4>
        <p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
          ${mntTextoJardineria(dias.length, 'día de riego', 'días de riego')} · Programación semanal general
        </p>
      </div>

      ${dias.length > 0 ? `
        <!-- TABLA SEMANAL COMPACTA (7 filas, orden por orden_dia) -->
        <div class="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 uppercase">
                <th class="px-3 py-2 font-bold">Día</th>
                <th class="px-3 py-2 font-bold">Zona</th>
              </tr>
            </thead>
            <tbody>
              ${dias.map(d => {
                const dia = mntTextoTitleJardineria(d.dia_semana) || 'Sin día registrado';
                const valorZona = mntValorPresenteJardineria(d.zona) || mntValorPresenteJardineria(d.zona_original);
                const zona = mntTextoTitleJardineria(valorZona) || 'Sin zona registrada';
                return `
                  <tr class="border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200">
                    <td class="px-3 py-2 font-bold whitespace-nowrap">${mntEsc(dia)}</td>
                    <td class="px-3 py-2">${mntEsc(zona)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      ${zonas.length > 0 ? `
        <!-- CATÁLOGO DE ZONAS (Title Case solo como presentación) -->
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Zonas registradas:</span>
          ${zonas.map(z => {
            const valor = mntValorPresenteJardineria(z.zona) || mntValorPresenteJardineria(z.zona_original);
            return `<span class="text-[11px] font-black px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700" title="${mntEsc(valor || 'Sin zona registrada')}">${mntEsc(mntTextoTitleJardineria(valor) || 'Sin zona registrada')}</span>`;
          }).join('')}
        </div>
      ` : ''}

      ${notas.length > 0 ? `
        <!-- NOTAS: contenido REAL, sin resumir ni reinterpretar -->
        <div class="space-y-2">
          <span class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Notas</span>
          ${notas.map((n, i) => mntNotaRiegoHTML(n, i)).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function mntNotaRiegoHTML(n, indice) {
  if (!n) return '';
  const contenido = mntValorPresenteJardineria(n.contenido) || mntValorPresenteJardineria(n.contenido_original);
  const contenidoOriginal = mntValorPresenteJardineria(n.contenido_original);
  const difiere = contenido !== null && contenidoOriginal !== null && contenido !== contenidoOriginal;
  const tipo = mntValorPresenteJardineria(n.tipo);
  const hoja = mntValorPresenteJardineria(n.hoja_origen);
  const celda = mntValorPresenteJardineria(n.celda_origen);
  const trazabilidad = [
    hoja !== null ? `Hoja ${hoja}` : null,
    celda !== null ? `Celda ${celda}` : null
  ].filter(Boolean).join(' · ');

  return `
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-100 dark:border-slate-800 space-y-1.5">
      <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Nota ${indice + 1}${tipo ? ` · ${mntEsc(tipo)}` : ''}</p>
      <p class="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-relaxed break-words whitespace-pre-wrap">${contenido !== null ? mntEsc(contenido) : 'Sin dato registrado'}</p>
      ${difiere ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 break-words">Texto original: ${mntEsc(contenidoOriginal)}</p>` : ''}
      ${trazabilidad ? `<p class="text-[10px] text-slate-400 dark:text-slate-500">${mntEsc(trazabilidad)}</p>` : ''}
    </div>
  `;
}

// ------------------------------------------------------------
// BLOQUE GENERAL: LABORES COMPLEMENTARIAS (una sola vez, tras Riego)
// ------------------------------------------------------------
// Fuente INDEPENDIENTE (Labores Jardineros.docx): NUNCA se mezclan con los
// 127 trabajos del Excel ni entran en ningún contador de trabajos.
// 3 grupos por bloque real (8 / 8 / 7). Campos opcionales (frecuencia, días,
// momento) SOLO se pintan cuando existen: nunca "Sin dato registrado".
function mntBloqueLaboresHTML() {
  const grupos = mntAgruparLaboresJardineria();
  if (grupos.length === 0) return '';

  const total = mntJardineriaActivos(mntJardineriaLabores).length;

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 sm:p-5 border border-slate-100 dark:border-slate-800 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-700">
        <div>
          <h4 class="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Labores complementarias</h4>
          <p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            ${mntTextoJardineria(total, 'labor', 'labores')} · Fuente: ${mntEsc(MNT_FUENTE_LABORES_JARDINERIA)}
          </p>
        </div>
      </div>

      ${grupos.map(grupo => `
        <div>
          <div class="flex items-center justify-between mb-2">
            <h5 class="text-[11px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">${mntEsc(grupo.etiqueta)}</h5>
            <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500">${mntTextoJardineria(grupo.labores.length, 'labor', 'labores')}</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${grupo.labores.map(mntFilaLaborJardineriaHTML).join('')}
          </div>
        </div>
      `).join('')}

      <p class="text-[10px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-700">
        Bloque documental propio, distinto de los trabajos de jardinería del archivo de sectores.
      </p>
    </div>
  `;
}

// Clave de agrupación: bloque (normalizado) con defensa a bloque_original.
function mntClaveBloqueLaborJardineria(l) {
  return mntValorPresenteJardineria(l ? l.bloque : null)
    || mntValorPresenteJardineria(l ? l.bloque_original : null)
    || 'Sin bloque registrado';
}

// Grupos en orden de bloque ASC (defensivo en cliente, igual que el
// servicio) y, dentro de cada bloque, por orden ASC.
function mntAgruparLaboresJardineria() {
  const labores = mntJardineriaActivos(mntJardineriaLabores).slice().sort((a, b) => {
    const cmp = mntClaveBloqueLaborJardineria(a).localeCompare(mntClaveBloqueLaborJardineria(b), 'es');
    if (cmp !== 0) return cmp;
    const na = Number(a.orden), nb = Number(b.orden);
    const oa = Number.isFinite(na) ? na : Number.MAX_SAFE_INTEGER;
    const ob = Number.isFinite(nb) ? nb : Number.MAX_SAFE_INTEGER;
    return oa - ob;
  });

  const grupos = [];
  const indices = new Map();

  labores.forEach(l => {
    const clave = mntClaveBloqueLaborJardineria(l);
    if (!indices.has(clave)) {
      indices.set(clave, grupos.length);
      grupos.push({
        clave: clave,
        etiqueta: mntTextoTitleJardineria(clave) || clave,
        labores: []
      });
    }
    grupos[indices.get(clave)].labores.push(l);
  });

  return grupos;
}

// Días de la semana: array → "LUNES · MIÉRCOLES"; texto → tal cual.
// NULL → null (el campo NO se muestra; nunca se inventan días).
function mntDiasLaborJardineria(l) {
  const valor = l ? l.dias_semana : null;
  if (valor === null || valor === undefined) return null;
  if (Array.isArray(valor)) {
    const items = valor
      .map(v => (v === null || v === undefined) ? '' : String(v).trim())
      .filter(v => v !== '');
    return items.length > 0 ? items.join(' · ') : null;
  }
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

function mntTituloLaborJardineria(l) {
  return mntValorPresenteJardineria(l ? l.titulo : null)
    || mntValorPresenteJardineria(l ? l.titulo_original : null)
    || 'Sin título registrado';
}

// Fila compacta de labor. Frecuencia / Días / Momento SOLO si existen
// (sin "Sin dato registrado" para campos ausentes).
function mntFilaLaborJardineriaHTML(l) {
  if (!l) return '';

  const frecuencia = mntValorPresenteJardineria(l.frecuencia)
    || mntValorPresenteJardineria(l.frecuencia_original);
  const dias = mntDiasLaborJardineria(l);
  const momento = mntValorPresenteJardineria(l.momento)
    || mntValorPresenteJardineria(l.momento_original);

  return `
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
      <p class="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug break-words">${mntEsc(mntTituloLaborJardineria(l))}</p>
      ${frecuencia !== null ? `<p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-1.5"><span class="font-black text-slate-500 dark:text-slate-400">Frecuencia:</span> ${mntEsc(mntTextoTitleJardineria(frecuencia) || frecuencia)}</p>` : ''}
      ${dias !== null ? `<p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-1"><span class="font-black text-slate-500 dark:text-slate-400">Días:</span> ${mntEsc(dias)}</p>` : ''}
      ${momento !== null ? `<p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-1"><span class="font-black text-slate-500 dark:text-slate-400">Momento:</span> ${mntEsc(mntTextoTitleJardineria(momento) || momento)}</p>` : ''}
    </div>
  `;
}

// ==========================================================
// JARDINERÍA — ADMINISTRACIÓN (C2J-4)
// ==========================================================
// Contenido maestro administrable para Administrador permanente, dentro de
// la ÚNICA modal del subapartado (esta modal de administración se superpone
// a ella igual que "Administrar guía", sin modal sobre modal de edición).
//
// Patrón: idéntico al de Guía Preventiva (C2G-6/C2G-7), ya corregido y
// probado: aislamiento de formularios (lectura fail-closed dentro del
// <form> enviado), guard anti doble RPC, bloqueo pendiente de relectura
// (Ruta C: la escritura YA ocurrió pero la relectura falló), error de
// escritura visible sin destruir la modal, refresh tras éxito.
//
// Escritura: EXCLUSIVAMENTE vía MantencionesService (RPCs server-side con
// auditoría en jardineria_contenido_auditoria). NUNCA supabase.rpc directo,
// ni .insert()/.update()/.delete(), ni HistorialService, ni localStorage.
//
// NO se administra aquí: borrado físico, creación de registros, reorden,
// ni edición de campos *_original / es_fila_vacia_original / importacion_id /
// hoja/fila/celda_origen (inmutables, las RPCs no los reciben).
// NO registra ejecución: sin fechas, responsables, completado ni alertas.
//
// Las 26 filas vacías originales (es_fila_vacia_original = true) NO aparecen
// en el panel administrativo; la vista documental normal NO cambia.

const MNT_MODAL_ADMIN_JARDINERIA_ID = 'mnt-modal-admin-jardineria-overlay';

// Aviso INEQUÍVOCO de la Ruta C: la RPC YA quedó registrada pero la
// relectura posterior falló. Mismo criterio que Guía Preventiva.
const MNT_AVISO_REFRESCO_ADMIN_JARDINERIA = 'El cambio sí quedó guardado, pero no fue posible actualizar la vista. No vuelvas a enviarlo. Cierra y vuelve a abrir Administrar Jardinería.';

const MNT_MENSAJES_ERROR_ADMIN_JARDINERIA = {
  SESION_INVALIDA: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
  NO_AUTORIZADO: 'Solo un administrador permanente puede administrar jardinería.',
  CAMPO_NO_PERMITIDO: 'Este dato no admite cambios.',
  CONFIG_INCOMPLETA: 'La configuración de jardinería no está disponible.',
  ENTIDAD_NO_ENCONTRADA: 'El registro seleccionado ya no está disponible.',
  TIPO_NO_IMPLEMENTADO: 'Esta operación aún no admite este registro.',
  VALOR_INVALIDO: 'Los datos ingresados no son válidos.',
  VALOR_NO_PERMITIDO: 'Esta operación no está permitida.'
};

// Tablas administrables → etiquetas de la UI (el valor EXACTO es lo que
// viaja en data-tabla hacia los handlers; nunca se infiere por posición).
const MNT_JARDINERIA_ADMIN_TABLAS = {
  sector: 'Sector',
  trabajo: 'Trabajo',
  riego_programacion: 'Programación de riego',
  riego_zona: 'Zona de riego',
  riego_nota: 'Nota de riego',
  labor: 'Labor complementaria'
};

// Estado local de la modal de administración (independiente de la vista de
// solo lectura y de _jardineriaCache).
let mntJardineriaAdminVista = 'sectores';        // 'sectores'|'trabajos'|'riego'|'labores'
let mntJardineriaAdminEditando = null;            // { tabla, id } del formulario inline abierto
let mntJardineriaAdminSectorFiltro = '';          // sectorId del filtro de trabajos ('' = todos)
let mntJardineriaAdminBusqueda = '';              // texto del buscador de trabajos (C2J-4.1)
let mntJardineriaAdminGuardando = false;          // guard anti doble RPC
let mntJardineriaAdminPendienteRefresco = null;   // clave cuyo cambio quedó guardado sin relectura

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
// Mismo criterio que mntGuiaAdminEsPermanente(): helper real
// esAdminPermanenteActual() de js/app.js. NUNCA se inventan roles, emails
// ni UUID, y NUNCA se asume que un Administrador operativo es permanente.
function mntJardineriaAdminEsPermanente() {
  return (typeof esAdminPermanenteActual === 'function') && esAdminPermanenteActual() === true;
}

// Clave estable de la entidad afectada (bloqueo de reintento pendiente).
function mntJardineriaAdminClave(tabla, id) {
  return String(tabla) + ':' + String(id);
}

// C2G-7.1 — AISLAMIENTO DE FLUJOS DE EDICIÓN (patrón ya corregido).
// Devuelve el <form> que disparó el submit (nunca un id global del
// documento) o null si el evento no aporta un formulario.
function mntJardineriaAdminFormulario(ev) {
  if (!ev) return null;
  if (ev.currentTarget && ev.currentTarget.tagName === 'FORM') return ev.currentTarget;
  if (ev.target && ev.target.tagName === 'FORM') return ev.target;
  return null;
}

// Lee un campo DENTRO del formulario enviado. Devuelve null si el campo no
// existe en ESE formulario (fail-closed: el llamador DETIENE el envío en
// lugar de leer el primer id coincidente del documento, que podría
// pertenecer al formulario de otra entidad).
function mntJardineriaAdminValorFormulario(form, id) {
  if (!form) return null;
  const el = form.querySelector('[id="' + id + '"]');
  return (el && typeof el.value === 'string') ? el.value.trim() : null;
}

// Casilla (checkbox) dentro del formulario: true / false / null si no existe.
function mntJardineriaAdminCasillaFormulario(form, id) {
  if (!form) return null;
  const el = form.querySelector('[id="' + id + '"]');
  return (el && el.type === 'checkbox') ? (el.checked === true) : null;
}

function mntJardineriaAdminError(mensaje) {
  const caja = document.getElementById('mnt-jardineria-admin-error');
  if (!caja) return;
  caja.textContent = mensaje; // textContent: nunca HTML de error
  caja.classList.remove('hidden');
}

function mntJardineriaAdminOcultarError() {
  const caja = document.getElementById('mnt-jardineria-admin-error');
  if (!caja) return;
  caja.textContent = '';
  caja.classList.add('hidden');
}

// Mensaje: token amigable del backend + mensaje REAL de Supabase, para no
// ocultar la causa ni inventar textos silenciosos.
function mntJardineriaAdminMensajeError(err) {
  const codigo = (err && err.codigo) ? err.codigo : null;
  const real = (err && typeof err.message === 'string' && err.message)
    ? err.message
    : 'No fue posible guardar el cambio.';
  const base = (codigo && MNT_MENSAJES_ERROR_ADMIN_JARDINERIA[codigo])
    ? MNT_MENSAJES_ERROR_ADMIN_JARDINERIA[codigo]
    : null;
  return base ? (base + ' (' + real + ')') : real;
}

// Acceso por tabla a las copias locales ya cargadas por getJardineria().
function mntJardineriaAdminLista(tabla) {
  if (tabla === 'sector') return Array.isArray(mntJardineriaSectores) ? mntJardineriaSectores : [];
  if (tabla === 'trabajo') return Array.isArray(mntJardineriaTrabajos) ? mntJardineriaTrabajos : [];
  if (tabla === 'riego_programacion') return Array.isArray(mntJardineriaRiegoProgramacion) ? mntJardineriaRiegoProgramacion : [];
  if (tabla === 'riego_zona') return Array.isArray(mntJardineriaRiegoZonas) ? mntJardineriaRiegoZonas : [];
  if (tabla === 'riego_nota') return Array.isArray(mntJardineriaRiegoNotas) ? mntJardineriaRiegoNotas : [];
  if (tabla === 'labor') return Array.isArray(mntJardineriaLabores) ? mntJardineriaLabores : [];
  return null;
}

function mntJardineriaAdminRegistro(tabla, id) {
  const lista = mntJardineriaAdminLista(tabla);
  if (!lista) return null;
  return lista.find(r => r && r.id === id) || null;
}

function mntJardineriaAdminAplicarDatos(datos) {
  mntJardineriaSectores = (datos && Array.isArray(datos.sectores)) ? datos.sectores : [];
  mntJardineriaTrabajos = (datos && Array.isArray(datos.trabajos)) ? datos.trabajos : [];
  mntJardineriaRiegoProgramacion = (datos && Array.isArray(datos.riegoProgramacion)) ? datos.riegoProgramacion : [];
  mntJardineriaRiegoZonas = (datos && Array.isArray(datos.riegoZonas)) ? datos.riegoZonas : [];
  mntJardineriaRiegoNotas = (datos && Array.isArray(datos.riegoNotas)) ? datos.riegoNotas : [];
  mntJardineriaLabores = (datos && Array.isArray(datos.laboresComplementarias)) ? datos.laboresComplementarias : [];
}

// Relee Supabase con force=true tras una escritura. Devuelve los datos o
// null si la relectura falló (la escritura YA ocurrió: NUNCA se presenta
// como fallo de escritura). Una relectura exitosa levanta el bloqueo
// pendiente (mismo criterio que Guía Preventiva).
async function mntJardineriaAdminRefrescar() {
  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está cargado.');
    }
    const datos = await window.MantencionesService.getJardineria(true);
    if (!datos || !Array.isArray(datos.sectores)) {
      throw new Error('Respuesta de jardinería incompleta.');
    }
    mntJardineriaAdminPendienteRefresco = null;
    return datos;
  } catch (e) {
    console.error('Error releyendo Jardinería tras la escritura:', e);
    return null;
  }
}

// Repinta el panel de solo lectura SOLO si la modal del subapartado sigue
// en Jardinería; si cambió/cerró durante la RPC no se pinta nada encima.
function mntJardineriaAdminRepintarPanel() {
  if (mantencionSubapartado !== 'jardineria') return;
  mntRepintarJardineria();
}

// Repinta la modal de administración solo si sigue abierta.
function mntJardineriaAdminRepintarModal() {
  const cont = document.getElementById('mnt-modal-admin-jardineria');
  if (!cont) return;
  const overlay = document.getElementById(MNT_MODAL_ADMIN_JARDINERIA_ID);
  if (!overlay || overlay.classList.contains('hidden')) return;
  cont.innerHTML = mntJardineriaAdminContenidoHTML();
}

// Tras una escritura exitosa: relectura y, si falló, bloqueo pendiente.
async function mntJardineriaAdminFinalizarEscritura(clave) {
  let datos = null;
  try {
    datos = await mntJardineriaAdminRefrescar();
  } finally {
    mntJardineriaAdminGuardando = false;
  }

  if (!datos) {
    // Ruta C: el cambio SÍ quedó guardado; se bloquea el reintento.
    mntJardineriaAdminPendienteRefresco = clave;
    mntJardineriaAdminRepintarModal();
    return;
  }

  mntJardineriaAdminAplicarDatos(datos);
  mntJardineriaAdminEditando = null; // el formulario se cierra con datos frescos
  mntJardineriaAdminRepintarPanel();
  mntJardineriaAdminRepintarModal();
}

// ------------------------------------------------------------
// Normalización de dias_semana (text[] REAL)
// ------------------------------------------------------------
// BD: text[]. La vista de lectura (mntDiasLaborJardineria) acepta array o
// texto heredado; AQUÍ siempre se envía un array de strings o null.
// Nunca un string JSON. Vacío → null (sin días registrados).
function mntJardineriaAdminDiasArray(valor) {
  if (valor === null || valor === undefined) return null;
  if (Array.isArray(valor)) {
    const arr = valor
      .map(v => (v === null || v === undefined) ? '' : String(v).trim())
      .filter(v => v !== '');
    return arr.length > 0 ? arr : null;
  }
  const texto = String(valor).trim();
  if (!texto) return null;
  const arr = texto
    .split(/\s*[·,;]\s*/)
    .map(v => v.trim())
    .filter(v => v !== '');
  return arr.length > 0 ? arr : null;
}

// ------------------------------------------------------------
// Trabajos administrables: se excluyen SOLO las filas vacías originales
// ------------------------------------------------------------
// es_fila_vacia_original === true → fila del Excel sin nombre de trabajo,
// preservada por trazabilidad. Se MUESTRA en la vista documental normal
// (sin toggle, sin tratarse como error) pero NUNCA es editable aquí.
// Se muestran también los inactivos (para poder reactivarlos).
function mntJardineriaAdminTrabajos() {
  const filtroSector = mntJardineriaAdminSectorFiltro || '';
  const busqueda = mntJardineriaAdminNormalizarBusqueda(mntJardineriaAdminBusqueda);

  return mntJardineriaAdminLista('trabajo').filter(t => {
    if (!t || t.es_fila_vacia_original === true) return false;
    if (filtroSector && t.sector_id !== filtroSector) return false;
    // Búsqueda en MEMORIA (C2J-4.1): solo sobre los datos ya cargados, sin
    // consultas nuevas a Supabase. Vacío → sin filtro. Combina con sector.
    if (!busqueda) return true;
    const campos = [t.titulo, t.titulo_original];
    return campos.some(c =>
      c !== null && c !== undefined &&
      mntJardineriaAdminNormalizarBusqueda(c).indexOf(busqueda) !== -1
    );
  });
}

// Normalización de búsqueda: minúsculas + sin acentos + trim, para que
// "bambu" encuentre "Bambú". SOLO presentación; el valor de BD queda intacto.
function mntJardineriaAdminNormalizarBusqueda(texto) {
  if (texto === null || texto === undefined) return '';
  const t = String(texto).trim().toLowerCase();
  if (!t) return '';
  return (typeof t.normalize === 'function')
    ? t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    : t;
}

// Valores ACTUALES de un registro (para reenviarlos en un solo cambio de
// activo sin alterar ningún otro campo).
function mntJardineriaAdminValoresActuales(tabla, r) {
  if (tabla === 'trabajo') {
    return {
      titulo: r.titulo,
      prioridad: r.prioridad,
      inviernoOtono: r.invierno_otono === true,
      veranoPrimavera: r.verano_primavera === true
    };
  }
  if (tabla === 'riego_programacion' || tabla === 'riego_zona') {
    return { zona: r.zona };
  }
  if (tabla === 'riego_nota') {
    return { contenido: r.contenido };
  }
  if (tabla === 'labor') {
    return {
      bloque: r.bloque,
      titulo: r.titulo,
      frecuencia: r.frecuencia,
      diasSemana: mntJardineriaAdminDiasArray(r.dias_semana),
      momento: r.momento
    };
  }
  return {};
}

// Despacho único hacia MantencionesService (un método por RPC). Los campos
// inmutables JAMÁS viajan aquí.
async function mntJardineriaAdminGuardarRPC(tabla, registro, activo, valores) {
  if (!window.MantencionesService) {
    throw new Error('MantencionesService no está cargado.');
  }
  const v = valores || mntJardineriaAdminValoresActuales(tabla, registro);

  if (tabla === 'sector') {
    return window.MantencionesService.actualizarSectorJardineria({
      sectorId: registro.id,
      activo: activo
    });
  }
  if (tabla === 'trabajo') {
    return window.MantencionesService.actualizarTrabajoJardineria({
      trabajoId: registro.id,
      titulo: (v.titulo === undefined) ? null : v.titulo,
      prioridad: (v.prioridad === undefined) ? null : v.prioridad,
      inviernoOtono: !!v.inviernoOtono,
      veranoPrimavera: !!v.veranoPrimavera,
      activo: activo
    });
  }
  if (tabla === 'riego_programacion') {
    return window.MantencionesService.actualizarRiegoProgramacionJardineria({
      id: registro.id,
      zona: (v.zona === undefined) ? null : v.zona,
      activo: activo
    });
  }
  if (tabla === 'riego_zona') {
    return window.MantencionesService.actualizarRiegoZonaJardineria({
      id: registro.id,
      zona: (v.zona === undefined) ? null : v.zona,
      activo: activo
    });
  }
  if (tabla === 'riego_nota') {
    return window.MantencionesService.actualizarRiegoNotaJardineria({
      id: registro.id,
      contenido: (v.contenido === undefined) ? null : v.contenido,
      activo: activo
    });
  }
  if (tabla === 'labor') {
    return window.MantencionesService.actualizarLaborJardineria({
      id: registro.id,
      bloque: (v.bloque === undefined) ? null : v.bloque,
      titulo: (v.titulo === undefined) ? null : v.titulo,
      frecuencia: (v.frecuencia === undefined) ? null : v.frecuencia,
      diasSemana: (v.diasSemana === undefined) ? null : v.diasSemana,
      momento: (v.momento === undefined) ? null : v.momento,
      activo: activo
    });
  }

  throw new Error('mntJardineriaAdminGuardarRPC: tabla no reconocida (' + String(tabla) + ').');
}

// ------------------------------------------------------------
// Modal: CREAR / ABRIR / CERRAR
// ------------------------------------------------------------
function asegurarModalAdminJardineria() {
  let overlay = document.getElementById(MNT_MODAL_ADMIN_JARDINERIA_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = MNT_MODAL_ADMIN_JARDINERIA_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Administrar Jardinería');
  overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overflow-y-auto';
  overlay.onclick = function (ev) {
    // Solo el clic en el fondo cierra; el clic dentro de la modal de
    // administración NO burbujea al subapartado de detrás.
    // UX-02: fondo sin cierre.
  };
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-4xl w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 my-auto text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
      <div id="mnt-modal-admin-jardineria"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function mntTeclaEscapeAdminJardineria(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

function abrirModalAdminJardineria() {
  // Permisos: SOLO Administrador permanente. El backend también lo exige
  // (defensa en profundidad); aquí se evita abrir la ventana.
  if (!mntJardineriaAdminEsPermanente()) {
    console.warn('Administrar jardinería: requiere Administrador permanente; se omite abrir la modal.');
    return;
  }
  // Anti doble RPC: con una escritura en vuelo no se abre otra ventana.
  if (mntJardineriaAdminGuardando) {
    console.warn('mntJardineriaAdminGuardando activo: se omite abrir la administración de jardinería.');
    return;
  }

  mntJardineriaAdminVista = 'sectores';
  mntJardineriaAdminEditando = null;
  mntJardineriaAdminSectorFiltro = '';
  mntJardineriaAdminBusqueda = '';

  const overlay = asegurarModalAdminJardineria();
  const cont = document.getElementById('mnt-modal-admin-jardineria');
  if (!overlay || !cont) return;

  // Pinta desde los datos locales ya leídos (mismo origen Supabase) y
  // luego refresca de forma asíncrona.
  cont.innerHTML = mntJardineriaAdminContenidoHTML();
  overlay.classList.remove('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeAdminJardineria, true);
  document.addEventListener('keydown', mntTeclaEscapeAdminJardineria, true);

  // Relectura fresca al abrir (levantaría un bloqueo pendiente si ahora la
  // relectura funciona). No se pinta si la modal se cerró en el camino.
  mntJardineriaAdminRefrescar().then(datos => {
    if (!datos) return;
    mntJardineriaAdminAplicarDatos(datos);
    mntJardineriaAdminRepintarModal();
  });
}

function cerrarModalAdminJardineria() {
  const overlay = document.getElementById(MNT_MODAL_ADMIN_JARDINERIA_ID);
  if (overlay) overlay.classList.add('hidden');

  document.removeEventListener('keydown', mntTeclaEscapeAdminJardineria, true);
  mntJardineriaAdminEditando = null;
  mntJardineriaAdminSectorFiltro = '';
  mntJardineriaAdminBusqueda = '';
  mntJardineriaAdminVista = 'sectores';
}

// ------------------------------------------------------------
// CONTENIDO DE LA MODAL: pestañas Sectores / Trabajos / Riego / Labores
// ------------------------------------------------------------
function mntJardineriaAdminContenidoHTML() {
  const encabezado = `
    <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center space-x-2.5 min-w-0">
        <span class="text-2xl shrink-0">🌿</span>
        <div class="min-w-0">
          <h3 class="text-base font-bold text-slate-800 dark:text-white truncate">Administrar Jardinería</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 truncate">Contenido maestro · edición exclusiva de Administrador permanente</p>
        </div>
      </div>
      <button type="button" onclick="cerrarModalAdminJardineria()"
        class="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold">&times;</button>
    </div>
  `;

  const pestanas = [
    { id: 'sectores', etiqueta: 'Sectores' },
    { id: 'trabajos', etiqueta: 'Trabajos' },
    { id: 'riego', etiqueta: 'Riego' },
    { id: 'labores', etiqueta: 'Labores complementarias' }
  ];

  const navHTML = `
    <div class="flex flex-wrap gap-2 mt-4">
      ${pestanas.map(p => `
        <button type="button" onclick="mntJardineriaAdminIrVista('${p.id}')"
          class="text-xs font-black px-3 py-1.5 rounded-xl border transition-colors ${mntJardineriaAdminVista === p.id
            ? 'bg-emerald-600 text-white border-emerald-600'
            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500'}">
          ${p.etiqueta}
        </button>
      `).join('')}
    </div>
  `;

  let cuerpo = '';
  if (mntJardineriaAdminVista === 'trabajos') {
    cuerpo = mntJardineriaAdminTrabajosHTML();
  } else if (mntJardineriaAdminVista === 'riego') {
    cuerpo = mntJardineriaAdminRiegoHTML();
  } else if (mntJardineriaAdminVista === 'labores') {
    cuerpo = mntJardineriaAdminLaboresHTML();
  } else {
    cuerpo = mntJardineriaAdminSectoresHTML();
  }

  const avisoHTML = mntJardineriaAdminPendienteRefresco
    ? `<div id="mnt-jardineria-admin-aviso" class="mt-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-xs font-bold text-blue-800 dark:text-blue-200 leading-relaxed">${mntEsc(MNT_AVISO_REFRESCO_ADMIN_JARDINERIA)}</div>`
    : `<div id="mnt-jardineria-admin-aviso" class="hidden mt-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-xs font-bold text-blue-800 dark:text-blue-200 leading-relaxed"></div>`;

  return `
    ${encabezado}
    ${navHTML}
    ${cuerpo}
    <div id="mnt-jardineria-admin-error" class="hidden mt-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300"></div>
    ${avisoHTML}
    <p class="mt-3 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
      No existe borrado físico: los registros se desactivan (quedan visibles aquí) y pueden reactivarse.
      Los campos de origen (título/prioridad/temporada/zona/contenido originales, archivo, hoja, fila y celda) son inmutables y NO se editan.
      Jardinería es contenido maestro documental: no registra mantenciones ejecutadas, fechas, responsables ni planificación.
    </p>
  `;
}

// ------------------------------------------------------------
// PESTAÑA A) SECTORES — solo activo
// ------------------------------------------------------------
function mntJardineriaAdminSectoresHTML() {
  const sectores = mntJardineriaAdminLista('sector').slice().sort((a, b) => {
    const na = Number(a && a.orden), nb = Number(b && b.orden);
    const oa = Number.isFinite(na) ? na : Number.MAX_SAFE_INTEGER;
    const ob = Number.isFinite(nb) ? nb : Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return String((a && a.nombre) || '').localeCompare(String((b && b.nombre) || ''), 'es');
  });

  if (sectores.length === 0) {
    return `
      <div class="mt-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center">
        <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Sin sectores registrados</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">No hay sectores de jardinería para administrar.</p>
      </div>
    `;
  }

  return `
    <div class="mt-4 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 uppercase">
            <th class="px-3 py-2 font-bold">Sector</th>
            <th class="px-3 py-2 font-bold">Código</th>
            <th class="px-3 py-2 font-bold">Orden</th>
            <th class="px-3 py-2 font-bold">Hoja origen</th>
            <th class="px-3 py-2 font-bold">Estado</th>
            <th class="px-3 py-2 font-bold">Acción</th>
          </tr>
        </thead>
        <tbody>
          ${sectores.map(s => {
            const activo = s.activo !== false;
            const bloqueado = mntJardineriaAdminPendienteRefresco === mntJardineriaAdminClave('sector', s.id);
            return `
              <tr class="border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200">
                <td class="px-3 py-2 font-bold">${mntEsc(s.nombre || 'Sin nombre registrado')}</td>
                <td class="px-3 py-2">${mntEsc(mntValorPresenteJardineria(s.codigo) || '—')}</td>
                <td class="px-3 py-2">${mntEsc(mntValorPresenteJardineria(s.orden) || '—')}</td>
                <td class="px-3 py-2">${mntEsc(mntValorPresenteJardineria(s.hoja_origen) || '—')}</td>
                <td class="px-3 py-2">${activo ? 'Activo' : 'Inactivo'}</td>
                <td class="px-3 py-2">
                  <button type="button" id="mnt-jardineria-admin-toggle-sector-${mntEsc(s.id)}" ${bloqueado ? 'disabled' : ''}
                    onclick="mntJardineriaAdminAlternarEntidad('sector', '${mntEsc(s.id)}')"
                    class="text-[11px] font-black px-2.5 py-1 rounded-lg border transition-colors ${bloqueado
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                      : (activo
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900 hover:bg-rose-100 dark:hover:bg-rose-900/50'
                        : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-900/50')}">
                    ${bloqueado ? 'Guardado (relectura pendiente)' : (activo ? 'Desactivar' : 'Activar')}
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    <p class="mt-2 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
      Solo se administra el estado (activo/inactivo). Nombre, código, orden, observaciones y hoja de origen son datos del archivo importado y NO se editan. No existe borrado físico ni creación de sectores.
    </p>
  `;
}

// ------------------------------------------------------------
// PESTAÑA B) TRABAJOS — excluye las filas vacías originales
// ------------------------------------------------------------
function mntJardineriaAdminTrabajosHTML() {
  const sectores = mntJardineriaAdminLista('sector').slice().sort((a, b) => {
    const na = Number(a && a.orden), nb = Number(b && b.orden);
    const oa = Number.isFinite(na) ? na : Number.MAX_SAFE_INTEGER;
    const ob = Number.isFinite(nb) ? nb : Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return String((a && a.nombre) || '').localeCompare(String((b && b.nombre) || ''), 'es');
  });
  const filtro = mntJardineriaAdminSectorFiltro || '';

  const filtroHTML = `
    <div>
      <label for="mnt-ja-filtro-sector" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Sector</label>
      <select id="mnt-ja-filtro-sector" onchange="mntJardineriaAdminFiltrarSector(this.value)"
        class="text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2.5 py-1.5">
        <option value="">Todos los sectores</option>
        ${sectores.map(s => `
          <option value="${mntEsc(s.id)}" ${filtro === s.id ? 'selected' : ''}>${mntEsc(s.nombre || 'Sin nombre registrado')}</option>
        `).join('')}
      </select>
    </div>
  `;

  // C2J-4.1: buscador de trabajos junto al filtro de sector. Filtra en
  // cliente (sin nuevas consultas), combinado con el sector seleccionado.
  const buscadorHTML = `
    <div class="flex items-end gap-2">
      <div>
        <label for="mnt-ja-admin-buscar-trabajos" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Buscar</label>
        <input id="mnt-ja-admin-buscar-trabajos" type="text" value="${mntEsc(mntJardineriaAdminBusqueda || '')}"
          placeholder="Buscar trabajo..." autocomplete="off"
          oninput="mntJardineriaAdminBuscarTrabajos(this.value)"
          class="text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2.5 py-1.5" />
      </div>
      <button type="button" id="mnt-ja-admin-limpiar-busqueda" onclick="mntJardineriaAdminLimpiarBusqueda()"
        class="${(mntJardineriaAdminBusqueda || '').trim() !== '' ? '' : 'hidden'} text-[11px] font-black px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
        Limpiar
      </button>
    </div>
  `;

  return `
    <div class="mt-4 space-y-3">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="flex flex-wrap items-end gap-3">
          ${filtroHTML}
          ${buscadorHTML}
        </div>
        <p id="mnt-ja-admin-contador-trabajos" class="text-[11px] font-bold text-slate-500 dark:text-slate-400">${mntEsc(mntJardineriaAdminContadorTrabajos())}</p>
      </div>
      <div id="mnt-ja-admin-listado-trabajos">${mntJardineriaAdminListadoTrabajosHTML()}</div>
      <p class="text-[10px] text-slate-500 dark:text-slate-400">Las filas vacías originales no se administran.</p>
    </div>
  `;
}

// Contador derivado del resultado filtrado (sector + búsqueda), en el
// mismo estilo del módulo. Nunca hardcodeado.
function mntJardineriaAdminContadorTrabajos() {
  const filas = mntJardineriaAdminTrabajos();
  const filtro = mntJardineriaAdminSectorFiltro || '';
  const sector = filtro ? mntJardineriaAdminRegistro('sector', filtro) : null;
  const contexto = (sector && sector.nombre)
    ? sector.nombre
    : (filtro ? 'Sector seleccionado' : 'Todos los sectores');
  const hayBusqueda = (mntJardineriaAdminBusqueda || '').trim() !== '';
  const base = hayBusqueda
    ? `${filas.length} ${filas.length === 1 ? 'resultado' : 'resultados'}`
    : mntTextoJardineria(filas.length, 'registro administrable', 'registros administrables');
  return `${base} · ${contexto}`;
}

// Listado de tarjetas (o estado vacío). Se extrae para poder repintarlo
// SOLO (sin repintar la modal entera) al escribir en el buscador.
function mntJardineriaAdminListadoTrabajosHTML() {
  const filas = mntJardineriaAdminTrabajos();
  const hayBusqueda = (mntJardineriaAdminBusqueda || '').trim() !== '';

  if (filas.length === 0) {
    return `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center">
        ${hayBusqueda ? `
          <p class="text-sm font-bold text-slate-600 dark:text-slate-300">No se encontraron trabajos con esta búsqueda.</p>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Prueba con otro texto o limpia la búsqueda.</p>
        ` : `
          <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Sin trabajos para administrar</p>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Los sectores vacíos y las filas originales sin nombre de trabajo no aparecen aquí.</p>
        `}
      </div>
    `;
  }

  return `<div class="grid grid-cols-1 gap-3">${filas.map(mntJardineriaAdminTrabajoHTML).join('')}</div>`;
}

// Búsqueda en memoria (C2J-4.1). NO repinta la modal entera (se perdería
// el foco del input): solo se actualizan listado, contador y botón Limpiar.
function mntJardineriaAdminBuscarTrabajos(valor) {
  mntJardineriaAdminBusqueda = (typeof valor === 'string') ? valor : '';
  mntJardineriaAdminPintarResultadosBusqueda();
}

function mntJardineriaAdminLimpiarBusqueda() {
  if (mntJardineriaAdminGuardando) return;
  mntJardineriaAdminBusqueda = '';
  const input = document.getElementById('mnt-ja-admin-buscar-trabajos');
  if (input) input.value = '';
  mntJardineriaAdminPintarResultadosBusqueda();
  if (input) input.focus();
}

function mntJardineriaAdminPintarResultadosBusqueda() {
  const cont = document.getElementById('mnt-ja-admin-listado-trabajos');
  if (cont) cont.innerHTML = mntJardineriaAdminListadoTrabajosHTML();

  const contador = document.getElementById('mnt-ja-admin-contador-trabajos');
  if (contador) contador.textContent = mntJardineriaAdminContadorTrabajos();

  const btnLimpiar = document.getElementById('mnt-ja-admin-limpiar-busqueda');
  if (btnLimpiar) {
    if ((mntJardineriaAdminBusqueda || '').trim() !== '') btnLimpiar.classList.remove('hidden');
    else btnLimpiar.classList.add('hidden');
  }
}

function mntJardineriaAdminTrabajoHTML(t) {
  if (!t) return '';
  const editando = !!(mntJardineriaAdminEditando &&
    mntJardineriaAdminEditando.tabla === 'trabajo' &&
    mntJardineriaAdminEditando.id === t.id);
  if (editando) return mntJardineriaAdminFormTrabajoHTML(t);

  const activo = t.activo !== false;
  const bloqueado = mntJardineriaAdminPendienteRefresco === mntJardineriaAdminClave('trabajo', t.id);
  const periodo = mntPeriodosTrabajoJardineria(t);
  const sector = mntJardineriaAdminRegistro('sector', t.sector_id);
  const tituloOriginal = mntValorPresenteJardineria(t.titulo_original);
  const mostrarOriginal = tituloOriginal !== null && tituloOriginal !== (mntValorPresenteJardineria(t.titulo) || null);

  return `
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-2">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-xs font-extrabold text-slate-900 dark:text-white leading-snug">${mntEsc(mntTituloTrabajoJardineria(t))}</p>
          <p class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
            ${mntEsc(sector && sector.nombre ? sector.nombre : 'Sin sector registrado')} · ${mntEsc(mntPrioridadTrabajoJardineria(t.prioridad))} · ${activo ? 'Activo' : 'Inactivo'}
          </p>
        </div>
        <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 shrink-0">${mntEsc(mntValorPresenteJardineria(t.hoja_origen) || '—')} · fila ${mntEsc(mntValorPresenteJardineria(t.fila_origen) || '—')}</span>
      </div>
      <div class="flex flex-wrap gap-1.5">
        ${periodo.invierno ? `<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-900">Invierno / Otoño</span>` : ''}
        ${periodo.verano ? `<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">Verano / Primavera</span>` : ''}
        ${!periodo.alguna ? `<span class="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Sin temporada registrada</span>` : ''}
      </div>
      ${mostrarOriginal ? `<p class="text-[10px] text-slate-400 dark:text-slate-500">Título original: ${mntEsc(tituloOriginal)}</p>` : ''}
      <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button type="button" onclick="mntJardineriaAdminAbrirEdicion('trabajo', '${mntEsc(t.id)}')" ${bloqueado ? 'disabled' : ''}
          class="text-[11px] font-black px-2.5 py-1 rounded-lg border bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors ${bloqueado ? 'opacity-50 cursor-not-allowed' : ''}">
          Editar
        </button>
        <button type="button" id="mnt-jardineria-admin-toggle-trabajo-${mntEsc(t.id)}" ${bloqueado ? 'disabled' : ''}
          onclick="mntJardineriaAdminAlternarEntidad('trabajo', '${mntEsc(t.id)}')"
          class="text-[11px] font-black px-2.5 py-1 rounded-lg border transition-colors ${bloqueado
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed'
            : (activo
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900 hover:bg-rose-100 dark:hover:bg-rose-900/50'
              : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-900/50')}">
          ${bloqueado ? 'Guardado (relectura pendiente)' : (activo ? 'Desactivar' : 'Activar')}
        </button>
      </div>
    </div>
  `;
}

function mntJardineriaAdminFormTrabajoHTML(t) {
  if (!t) return '';
  const bloqueado = mntJardineriaAdminPendienteRefresco === mntJardineriaAdminClave('trabajo', t.id);
  const activo = t.activo !== false;
  const invierno = t.invierno_otono === true;
  const verano = t.verano_primavera === true;
  const prioridadActual = (t.prioridad === null || t.prioridad === undefined || String(t.prioridad).trim() === '')
    ? ''
    : String(t.prioridad).trim();

  return `
    <form onsubmit="mntJardineriaAdminEnviar(event)" data-tabla="trabajo" data-id="${mntEsc(t.id)}"
      class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 space-y-3">
      <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Editar trabajo · ${mntEsc(mntValorPresenteJardineria(t.hoja_origen) || '—')} · fila ${mntEsc(mntValorPresenteJardineria(t.fila_origen) || '—')}</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label for="mnt-ja-campo-titulo" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Título</label>
          <input id="mnt-ja-campo-titulo" type="text" value="${mntEsc(t.titulo || '')}" ${bloqueado ? 'disabled' : ''}
            class="w-full text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2.5 py-1.5" />
        </div>
        <div>
          <label for="mnt-ja-campo-prioridad" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Prioridad</label>
          <select id="mnt-ja-campo-prioridad" ${bloqueado ? 'disabled' : ''}
            class="w-full text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2.5 py-1.5">
            <option value="" ${prioridadActual === '' ? 'selected' : ''}>Sin prioridad</option>
            <option value="1" ${prioridadActual === '1' ? 'selected' : ''}>Prioridad 1</option>
            <option value="2" ${prioridadActual === '2' ? 'selected' : ''}>Prioridad 2</option>
            <option value="3" ${prioridadActual === '3' ? 'selected' : ''}>Prioridad 3</option>
          </select>
        </div>
      </div>
      <div class="flex flex-wrap gap-4">
        <label class="flex items-center space-x-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
          <input id="mnt-ja-campo-invierno" type="checkbox" ${invierno ? 'checked' : ''} ${bloqueado ? 'disabled' : ''} />
          <span>Periodo Invierno / Otoño</span>
        </label>
        <label class="flex items-center space-x-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
          <input id="mnt-ja-campo-verano" type="checkbox" ${verano ? 'checked' : ''} ${bloqueado ? 'disabled' : ''} />
          <span>Periodo Verano / Primavera</span>
        </label>
        <label class="flex items-center space-x-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
          <input id="mnt-ja-campo-activo" type="checkbox" ${activo ? 'checked' : ''} ${bloqueado ? 'disabled' : ''} />
          <span>Activo (visible en la vista de lectura)</span>
        </label>
      </div>
      <p class="text-[10px] text-slate-400 dark:text-slate-500">Inmutables (solo lectura): ${mntEsc(t.titulo_original || '—')} · prioridad original: ${mntEsc(mntValorPresenteJardineria(t.prioridad_original) || '—')} · observaciones, importación, hoja, fila y celda de origen.</p>
      <div class="flex flex-wrap items-center gap-2">
        <button type="submit" ${bloqueado ? 'disabled' : ''}
          class="text-[11px] font-black px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors ${bloqueado ? 'opacity-50 cursor-not-allowed' : ''}">
          ${bloqueado ? 'Guardado (relectura pendiente)' : 'Guardar cambios'}
        </button>
        <button type="button" onclick="mntJardineriaAdminCancelarEdicion()" ${bloqueado ? 'disabled' : ''}
          class="text-[11px] font-black px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${bloqueado ? 'opacity-50 cursor-not-allowed' : ''}">
          Cancelar
        </button>
      </div>
    </form>
  `;
}

// ------------------------------------------------------------
// PESTAÑA C) RIEGO — programación / zonas / notas
// ------------------------------------------------------------
function mntJardineriaAdminRiegoHTML() {
  return `
    <div class="mt-4 space-y-5">
      ${mntJardineriaAdminBloqueSimpleHTML(
        'Programación de riego',
        'Solo se administra la zona y el estado. Día de la semana y orden son datos del archivo y NO se editan.',
        mntJardineriaAdminLista('riego_programacion').slice().sort((a, b) => {
          const na = Number(a && a.orden_dia), nb = Number(b && b.orden_dia);
          const oa = Number.isFinite(na) ? na : Number.MAX_SAFE_INTEGER;
          const ob = Number.isFinite(nb) ? nb : Number.MAX_SAFE_INTEGER;
          return oa - ob;
        }),
        'riego_programacion',
        r => mntTextoTitleJardineria(mntValorPresenteJardineria(r.zona) || mntValorPresenteJardineria(r.zona_original)) || 'Sin zona registrada',
        r => mntTextoTitleJardineria(mntValorPresenteJardineria(r.dia_semana)) || 'Sin día registrado',
        r => `Zona original: ${mntEsc(mntValorPresenteJardineria(r.zona_original) || '—')} · Orden: ${mntEsc(mntValorPresenteJardineria(r.orden_dia) || '—')} · Celda: ${mntEsc(mntValorPresenteJardineria(r.celda_origen) || '—')}`
      )}
      ${mntJardineriaAdminBloqueSimpleHTML(
        'Zonas de riego',
        'Solo se administra el nombre de la zona y el estado.',
        mntJardineriaAdminLista('riego_zona').slice().sort((a, b) => {
          const na = Number(a && a.fila_origen), nb = Number(b && b.fila_origen);
          const oa = Number.isFinite(na) ? na : Number.MAX_SAFE_INTEGER;
          const ob = Number.isFinite(nb) ? nb : Number.MAX_SAFE_INTEGER;
          return oa - ob;
        }),
        'riego_zona',
        r => mntTextoTitleJardineria(mntValorPresenteJardineria(r.zona) || mntValorPresenteJardineria(r.zona_original)) || 'Sin zona registrada',
        () => '',
        r => `Zona original: ${mntEsc(mntValorPresenteJardineria(r.zona_original) || '—')} · Hoja: ${mntEsc(mntValorPresenteJardineria(r.hoja_origen) || '—')} · Fila: ${mntEsc(mntValorPresenteJardineria(r.fila_origen) || '—')} · Celda: ${mntEsc(mntValorPresenteJardineria(r.celda_origen) || '—')}`
      )}
      ${mntJardineriaAdminBloqueSimpleHTML(
        'Notas de riego',
        'Solo se administra el contenido de la nota y el estado. Tipo y orden son datos del archivo y NO se editan.',
        mntJardineriaAdminLista('riego_nota').slice().sort((a, b) => {
          const na = Number(a && a.orden), nb = Number(b && b.orden);
          const oa = Number.isFinite(na) ? na : Number.MAX_SAFE_INTEGER;
          const ob = Number.isFinite(nb) ? nb : Number.MAX_SAFE_INTEGER;
          return oa - ob;
        }),
        'riego_nota',
        r => {
          const contenido = mntValorPresenteJardineria(r.contenido) || mntValorPresenteJardineria(r.contenido_original);
          if (contenido === null) return 'Sin contenido registrado';
          const recortado = contenido.length > 90 ? (contenido.slice(0, 90) + '…') : contenido;
          return recortado;
        },
        r => mntValorPresenteJardineria(r.tipo) || '',
        r => `Contenido original: ${mntEsc(mntValorPresenteJardineria(r.contenido_original) || '—')} · Orden: ${mntEsc(mntValorPresenteJardineria(r.orden) || '—')} · Celda: ${mntEsc(mntValorPresenteJardineria(r.celda_origen) || '—')}`
      )}
    </div>
  `;
}

// Bloque genérico de riego: lista de filas con Editar + Activar/Desactivar.
function mntJardineriaAdminBloqueSimpleHTML(titulo, nota, registros, tabla, etiquetaValor, etiquetaExtra, detalleOriginal) {
  const filas = (Array.isArray(registros) ? registros : []);

  if (filas.length === 0) {
    return `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-6 text-center">
        <p class="text-xs font-bold text-slate-600 dark:text-slate-300">${mntEsc(titulo)}: sin registros</p>
      </div>
    `;
  }

  return `
    <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <div class="pb-2 border-b border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">${mntEsc(titulo)}</h4>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">${mntEsc(nota)}</p>
      </div>
      <div class="space-y-2">
        ${filas.map(r => mntJardineriaAdminFilaRiegoHTML(tabla, r, etiquetaValor, etiquetaExtra, detalleOriginal)).join('')}
      </div>
    </div>
  `;
}

function mntJardineriaAdminFilaRiegoHTML(tabla, r, etiquetaValor, etiquetaExtra, detalleOriginal) {
  if (!r) return '';
  const editando = !!(mntJardineriaAdminEditando &&
    mntJardineriaAdminEditando.tabla === tabla &&
    mntJardineriaAdminEditando.id === r.id);
  if (editando) return mntJardineriaAdminFormRiegoHTML(tabla, r);

  const activo = r.activo !== false;
  const bloqueado = mntJardineriaAdminPendienteRefresco === mntJardineriaAdminClave(tabla, r.id);
  const extra = (typeof etiquetaExtra === 'function') ? etiquetaExtra(r) : '';

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 border border-slate-100 dark:border-slate-800 space-y-1.5">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug break-words">${mntEsc(etiquetaValor(r))}</p>
          ${extra ? `<p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">${mntEsc(extra)}</p>` : ''}
          <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">${detalleOriginal(r)}</p>
        </div>
        <span class="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${activo
          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'}">
          ${activo ? 'Activo' : 'Inactivo'}
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
        <button type="button" onclick="mntJardineriaAdminAbrirEdicion('${tabla}', '${mntEsc(r.id)}')" ${bloqueado ? 'disabled' : ''}
          class="text-[11px] font-black px-2.5 py-1 rounded-lg border bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors ${bloqueado ? 'opacity-50 cursor-not-allowed' : ''}">
          Editar
        </button>
        <button type="button" id="mnt-jardineria-admin-toggle-${mntEsc(tabla)}-${mntEsc(r.id)}" ${bloqueado ? 'disabled' : ''}
          onclick="mntJardineriaAdminAlternarEntidad('${tabla}', '${mntEsc(r.id)}')"
          class="text-[11px] font-black px-2.5 py-1 rounded-lg border transition-colors ${bloqueado
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed'
            : (activo
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900 hover:bg-rose-100 dark:hover:bg-rose-900/50'
              : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-900/50')}">
          ${bloqueado ? 'Guardado (relectura pendiente)' : (activo ? 'Desactivar' : 'Activar')}
        </button>
      </div>
    </div>
  `;
}

function mntJardineriaAdminFormRiegoHTML(tabla, r) {
  if (!r) return '';
  const bloqueado = mntJardineriaAdminPendienteRefresco === mntJardineriaAdminClave(tabla, r.id);
  const activo = r.activo !== false;
  const esNota = tabla === 'riego_nota';
  const etiqueta = esNota ? 'Contenido de la nota' : 'Zona';
  const idCampo = esNota ? 'mnt-ja-campo-contenido' : 'mnt-ja-campo-zona';
  const valor = esNota ? (r.contenido || '') : (r.zona || '');

  return `
    <form onsubmit="mntJardineriaAdminEnviar(event)" data-tabla="${mntEsc(tabla)}" data-id="${mntEsc(r.id)}"
      class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 space-y-3">
      <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Editar ${mntEsc(MNT_JARDINERIA_ADMIN_TABLAS[tabla] || 'registro')}</p>
      <div>
        <label for="${idCampo}" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">${mntEsc(etiqueta)}</label>
        <textarea id="${idCampo}" rows="3" ${bloqueado ? 'disabled' : ''}
          class="w-full text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2.5 py-1.5">${mntEsc(valor)}</textarea>
      </div>
      <label class="flex items-center space-x-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
        <input id="mnt-ja-campo-activo" type="checkbox" ${activo ? 'checked' : ''} ${bloqueado ? 'disabled' : ''} />
        <span>Activo (visible en la vista de lectura)</span>
      </label>
      <div class="flex flex-wrap items-center gap-2">
        <button type="submit" ${bloqueado ? 'disabled' : ''}
          class="text-[11px] font-black px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors ${bloqueado ? 'opacity-50 cursor-not-allowed' : ''}">
          ${bloqueado ? 'Guardado (relectura pendiente)' : 'Guardar cambios'}
        </button>
        <button type="button" onclick="mntJardineriaAdminCancelarEdicion()" ${bloqueado ? 'disabled' : ''}
          class="text-[11px] font-black px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${bloqueado ? 'opacity-50 cursor-not-allowed' : ''}">
          Cancelar
        </button>
      </div>
    </form>
  `;
}

// ------------------------------------------------------------
// PESTAÑA D) LABORES COMPLEMENTARIAS
// ------------------------------------------------------------
// Agrupación por bloque REAL (general / centro de eventos / hotel), igual
// que la vista documental, pero SIN excluir los inactivos (aquí se pueden
// reactivar). El orden es bloque ASC + orden ASC, defensivo en cliente.
function mntJardineriaAdminLaboresAgrupadas() {
  const labores = mntJardineriaAdminLista('labor').slice().sort((a, b) => {
    const cmp = mntClaveBloqueLaborJardineria(a).localeCompare(mntClaveBloqueLaborJardineria(b), 'es');
    if (cmp !== 0) return cmp;
    const na = Number(a && a.orden), nb = Number(b && b.orden);
    const oa = Number.isFinite(na) ? na : Number.MAX_SAFE_INTEGER;
    const ob = Number.isFinite(nb) ? nb : Number.MAX_SAFE_INTEGER;
    return oa - ob;
  });

  const grupos = [];
  const indices = new Map();
  labores.forEach(l => {
    const clave = mntClaveBloqueLaborJardineria(l);
    if (!indices.has(clave)) {
      indices.set(clave, grupos.length);
      grupos.push({ clave: clave, etiqueta: mntTextoTitleJardineria(clave) || clave, labores: [] });
    }
    grupos[indices.get(clave)].labores.push(l);
  });
  return grupos;
}

function mntJardineriaAdminLaboresHTML() {
  const grupos = mntJardineriaAdminLaboresAgrupadas();
  const total = mntJardineriaAdminLista('labor').length;

  if (total === 0) {
    return `
      <div class="mt-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-8 text-center">
        <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Sin labores complementarias registradas</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">No hay contenido de ${mntEsc(MNT_FUENTE_LABORES_JARDINERIA)} para administrar.</p>
      </div>
    `;
  }

  return `
    <div class="mt-4 space-y-4">
      <p class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
        ${mntTextoJardineria(total, 'labor', 'labores')} · Fuente: ${mntEsc(MNT_FUENTE_LABORES_JARDINERIA)} · Fuente independiente de los trabajos del Excel.
      </p>
      ${grupos.map(grupo => `
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
          <div class="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h4 class="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">${mntEsc(grupo.etiqueta)}</h4>
            <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500">${mntTextoJardineria(grupo.labores.length, 'labor', 'labores')}</span>
          </div>
          <div class="space-y-2">
            ${grupo.labores.map(mntJardineriaAdminLaborHTML).join('')}
          </div>
        </div>
      `).join('')}
      <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
        No se mueven sectores ni áreas (area_id / sector_id son datos de origen) y no se crean ni borran labores.
      </p>
    </div>
  `;
}

function mntJardineriaAdminLaborHTML(l) {
  if (!l) return '';
  const editando = !!(mntJardineriaAdminEditando &&
    mntJardineriaAdminEditando.tabla === 'labor' &&
    mntJardineriaAdminEditando.id === l.id);
  if (editando) return mntJardineriaAdminFormLaborHTML(l);

  const activo = l.activo !== false;
  const bloqueado = mntJardineriaAdminPendienteRefresco === mntJardineriaAdminClave('labor', l.id);
  const dias = mntDiasLaborJardineria(l);

  return `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 border border-slate-100 dark:border-slate-800 space-y-1.5">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug break-words">${mntEsc(mntTituloLaborJardineria(l))}</p>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            ${mntValorPresenteJardineria(l.frecuencia) || mntValorPresenteJardineria(l.frecuencia_original)
              ? `<span class="font-black text-slate-500 dark:text-slate-400">Frecuencia:</span> ${mntEsc(mntTextoTitleJardineria(mntValorPresenteJardineria(l.frecuencia) || mntValorPresenteJardineria(l.frecuencia_original)) || '')} · `
              : ''}${dias !== null ? `<span class="font-black text-slate-500 dark:text-slate-400">Días:</span> ${mntEsc(dias)} · ` : ''}${mntValorPresenteJardineria(l.momento) || mntValorPresenteJardineria(l.momento_original)
              ? `<span class="font-black text-slate-500 dark:text-slate-400">Momento:</span> ${mntEsc(mntTextoTitleJardineria(mntValorPresenteJardineria(l.momento) || mntValorPresenteJardineria(l.momento_original)) || '')}`
              : ''}
          </p>
        </div>
        <span class="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${activo
          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'}">
          ${activo ? 'Activo' : 'Inactivo'}
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
        <button type="button" onclick="mntJardineriaAdminAbrirEdicion('labor', '${mntEsc(l.id)}')" ${bloqueado ? 'disabled' : ''}
          class="text-[11px] font-black px-2.5 py-1 rounded-lg border bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors ${bloqueado ? 'opacity-50 cursor-not-allowed' : ''}">
          Editar
        </button>
        <button type="button" id="mnt-jardineria-admin-toggle-labor-${mntEsc(l.id)}" ${bloqueado ? 'disabled' : ''}
          onclick="mntJardineriaAdminAlternarEntidad('labor', '${mntEsc(l.id)}')"
          class="text-[11px] font-black px-2.5 py-1 rounded-lg border transition-colors ${bloqueado
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed'
            : (activo
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900 hover:bg-rose-100 dark:hover:bg-rose-900/50'
              : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-900/50')}">
          ${bloqueado ? 'Guardado (relectura pendiente)' : (activo ? 'Desactivar' : 'Activar')}
        </button>
      </div>
    </div>
  `;
}

function mntJardineriaAdminFormLaborHTML(l) {
  if (!l) return '';
  const bloqueado = mntJardineriaAdminPendienteRefresco === mntJardineriaAdminClave('labor', l.id);
  const activo = l.activo !== false;
  const diasTexto = mntDiasLaborJardineria(l) || '';

  return `
    <form onsubmit="mntJardineriaAdminEnviar(event)" data-tabla="labor" data-id="${mntEsc(l.id)}"
      class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 space-y-3">
      <p class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Editar labor complementaria</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label for="mnt-ja-campo-bloque" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Bloque</label>
          <input id="mnt-ja-campo-bloque" type="text" value="${mntEsc(l.bloque || '')}" ${bloqueado ? 'disabled' : ''}
            class="w-full text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2.5 py-1.5" />
        </div>
        <div>
          <label for="mnt-ja-campo-titulo" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Título</label>
          <input id="mnt-ja-campo-titulo" type="text" value="${mntEsc(l.titulo || '')}" ${bloqueado ? 'disabled' : ''}
            class="w-full text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2.5 py-1.5" />
        </div>
        <div>
          <label for="mnt-ja-campo-frecuencia" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Frecuencia</label>
          <input id="mnt-ja-campo-frecuencia" type="text" value="${mntEsc(l.frecuencia || '')}" ${bloqueado ? 'disabled' : ''}
            class="w-full text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2.5 py-1.5" />
        </div>
        <div>
          <label for="mnt-ja-campo-dias" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Días de la semana</label>
          <input id="mnt-ja-campo-dias" type="text" value="${mntEsc(diasTexto)}" ${bloqueado ? 'disabled' : ''}
            placeholder="Ej.: Lunes · Miércoles"
            class="w-full text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2.5 py-1.5" />
          <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Separa los días con "·", coma o punto y coma. Vacío = sin días.</p>
        </div>
        <div>
          <label for="mnt-ja-campo-momento" class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Momento</label>
          <input id="mnt-ja-campo-momento" type="text" value="${mntEsc(l.momento || '')}" ${bloqueado ? 'disabled' : ''}
            class="w-full text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2.5 py-1.5" />
        </div>
      </div>
      <label class="flex items-center space-x-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
        <input id="mnt-ja-campo-activo" type="checkbox" ${activo ? 'checked' : ''} ${bloqueado ? 'disabled' : ''} />
        <span>Activo (visible en la vista de lectura)</span>
      </label>
      <p class="text-[10px] text-slate-400 dark:text-slate-500">Inmutables (solo lectura): bloque, título, frecuencia, días y momento originales, importación y relaciones de área/sector.</p>
      <div class="flex flex-wrap items-center gap-2">
        <button type="submit" ${bloqueado ? 'disabled' : ''}
          class="text-[11px] font-black px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors ${bloqueado ? 'opacity-50 cursor-not-allowed' : ''}">
          ${bloqueado ? 'Guardado (relectura pendiente)' : 'Guardar cambios'}
        </button>
        <button type="button" onclick="mntJardineriaAdminCancelarEdicion()" ${bloqueado ? 'disabled' : ''}
          class="text-[11px] font-black px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${bloqueado ? 'opacity-50 cursor-not-allowed' : ''}">
          Cancelar
        </button>
      </div>
    </form>
  `;
}

// ------------------------------------------------------------
// ACCIONES
// ------------------------------------------------------------
function mntJardineriaAdminIrVista(vista) {
  const permitidas = ['sectores', 'trabajos', 'riego', 'labores'];
  if (permitidas.indexOf(vista) === -1) return;
  if (mntJardineriaAdminGuardando) return;
  mntJardineriaAdminVista = vista;
  mntJardineriaAdminEditando = null;
  mntJardineriaAdminRepintarModal();
}

function mntJardineriaAdminFiltrarSector(valor) {
  if (mntJardineriaAdminGuardando) return;
  mntJardineriaAdminSectorFiltro = (typeof valor === 'string') ? valor.trim() : '';
  // El filtro NO cierra una edición en curso de OTRO sector: solo cambia el
  // listado; si el registro editado sigue en la lista se conserva el form.
  mntJardineriaAdminRepintarModal();
}

function mntJardineriaAdminAbrirEdicion(tabla, id) {
  if (mntJardineriaAdminGuardando) return;
  if (!mntJardineriaAdminEsPermanente()) return;

  const tablaValida = Object.prototype.hasOwnProperty.call(MNT_JARDINERIA_ADMIN_TABLAS, tabla);
  if (!tablaValida) {
    mntJardineriaAdminError('No fue posible abrir el formulario: tabla no reconocida.');
    return;
  }
  const registro = mntJardineriaAdminRegistro(tabla, id);
  if (!registro) {
    mntJardineriaAdminError('No fue posible abrir el formulario: el registro ya no está disponible.');
    return;
  }
  // Las filas vacías originales NUNCA son editables (defensa en profundidad:
  // el listado ya las excluye, pero el guard se aplica también aquí).
  if (tabla === 'trabajo' && registro.es_fila_vacia_original === true) {
    mntJardineriaAdminError('Esta fila está preservada como fila original vacía del archivo y no admite edición.');
    return;
  }

  mntJardineriaAdminEditando = { tabla: tabla, id: registro.id };
  mntJardineriaAdminOcultarError();
  mntJardineriaAdminRepintarModal();
}

function mntJardineriaAdminCancelarEdicion() {
  if (mntJardineriaAdminGuardando) return;
  mntJardineriaAdminEditando = null;
  mntJardineriaAdminOcultarError();
  mntJardineriaAdminRepintarModal();
}

// Activar / desactivar SIN editar otros campos: se reenvían los valores
// actuales del registro + el nuevo activo. Un solo clic, con confirmación
// al desactivar (no se borra nada).
async function mntJardineriaAdminAlternarEntidad(tabla, id) {
  const idLimpio = (typeof id === 'string') ? id.trim() : '';
  const tablaLimpia = (typeof tabla === 'string') ? tabla.trim() : '';
  if (!idLimpio || !tablaLimpia) return;

  if (mntJardineriaAdminGuardando) return;
  if (!mntJardineriaAdminEsPermanente()) return;

  const cont = document.getElementById('mnt-modal-admin-jardineria');
  if (!cont) return;

  const registro = mntJardineriaAdminRegistro(tablaLimpia, idLimpio);
  if (!registro) {
    mntJardineriaAdminError('El registro seleccionado ya no está disponible.');
    return;
  }

  const activoActual = registro.activo !== false;
  const activoNuevo = !activoActual;

  if (!activoNuevo) {
    const confirmar = window.confirm(
      '¿Desactivar este registro?\n\n' +
      'No se borra nada: quedará oculto en la vista de lectura, ' +
      'pero permanecerá aquí para poder reactivarlo.'
    );
    if (!confirmar) return;
  }

  const clave = mntJardineriaAdminClave(tablaLimpia, idLimpio);
  if (mntJardineriaAdminPendienteRefresco === clave) {
    console.warn('Cambio de jardinería ya guardado con relectura pendiente: se omite un segundo envío.');
    return;
  }

  const btn = document.getElementById('mnt-jardineria-admin-toggle-' + tablaLimpia + '-' + idLimpio);
  mntJardineriaAdminGuardando = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  mntJardineriaAdminOcultarError();

  try {
    await mntJardineriaAdminGuardarRPC(tablaLimpia, registro, activoNuevo, null);
  } catch (err) {
    console.error('Error cambiando el estado de jardinería:', err);
    mntJardineriaAdminRepintarModal();
    mntJardineriaAdminError(mntJardineriaAdminMensajeError(err));
    mntJardineriaAdminGuardando = false;
    return;
  }

  await mntJardineriaAdminFinalizarEscritura(clave);
}

// Submit ÚNICO de los formularios inline de la modal. Lee los campos
// DENTRO del <form> enviado (fail-closed: si falta un campo NO se envía
// nada y se avisa), confirma al desactivar y guarda con un solo RPC.
async function mntJardineriaAdminEnviar(ev) {
  ev.preventDefault();

  const form = mntJardineriaAdminFormulario(ev);
  if (!form) return;
  if (mntJardineriaAdminGuardando) return;
  if (!mntJardineriaAdminEsPermanente()) return;

  const tabla = (form.getAttribute('data-tabla') || '').trim();
  const id = (form.getAttribute('data-id') || '').trim();
  const registro = mntJardineriaAdminRegistro(tabla, id);
  if (!tabla || !id || !registro) {
    mntJardineriaAdminError('No fue posible identificar el registro a guardar.');
    return;
  }
  // Guard extra: las filas vacías originales jamás se envían.
  if (tabla === 'trabajo' && registro.es_fila_vacia_original === true) {
    mntJardineriaAdminError('Esta fila está preservada como fila original vacía del archivo y no admite edición.');
    return;
  }

  const clave = mntJardineriaAdminClave(tabla, id);
  if (mntJardineriaAdminPendienteRefresco === clave) {
    console.warn('Cambio ya guardado con relectura pendiente: se omite un segundo envío.');
    return;
  }

  // Lectura fail-closed de los campos editables de CADA tabla.
  let valores = null;
  let activoNuevo = null;

  if (tabla === 'trabajo') {
    const titulo = mntJardineriaAdminValorFormulario(form, 'mnt-ja-campo-titulo');
    const prioridad = mntJardineriaAdminValorFormulario(form, 'mnt-ja-campo-prioridad');
    const invierno = mntJardineriaAdminCasillaFormulario(form, 'mnt-ja-campo-invierno');
    const verano = mntJardineriaAdminCasillaFormulario(form, 'mnt-ja-campo-verano');
    const activo = mntJardineriaAdminCasillaFormulario(form, 'mnt-ja-campo-activo');
    if (titulo === null || prioridad === null || invierno === null || verano === null || activo === null) {
      mntJardineriaAdminError('Formulario de trabajo incompleto: no se envió ningún cambio.');
      return;
    }
    valores = {
      titulo: (titulo === '') ? null : titulo,
      prioridad: (prioridad === '') ? null : prioridad,
      inviernoOtono: invierno,
      veranoPrimavera: verano
    };
    activoNuevo = activo;
  } else if (tabla === 'riego_programacion' || tabla === 'riego_zona') {
    const zona = mntJardineriaAdminValorFormulario(form, 'mnt-ja-campo-zona');
    const activo = mntJardineriaAdminCasillaFormulario(form, 'mnt-ja-campo-activo');
    if (zona === null || activo === null) {
      mntJardineriaAdminError('Formulario incompleto: no se envió ningún cambio.');
      return;
    }
    valores = { zona: (zona === '') ? null : zona };
    activoNuevo = activo;
  } else if (tabla === 'riego_nota') {
    const contenido = mntJardineriaAdminValorFormulario(form, 'mnt-ja-campo-contenido');
    const activo = mntJardineriaAdminCasillaFormulario(form, 'mnt-ja-campo-activo');
    if (contenido === null || activo === null) {
      mntJardineriaAdminError('Formulario incompleto: no se envió ningún cambio.');
      return;
    }
    valores = { contenido: (contenido === '') ? null : contenido };
    activoNuevo = activo;
  } else if (tabla === 'labor') {
    const bloque = mntJardineriaAdminValorFormulario(form, 'mnt-ja-campo-bloque');
    const titulo = mntJardineriaAdminValorFormulario(form, 'mnt-ja-campo-titulo');
    const frecuencia = mntJardineriaAdminValorFormulario(form, 'mnt-ja-campo-frecuencia');
    const dias = mntJardineriaAdminValorFormulario(form, 'mnt-ja-campo-dias');
    const momento = mntJardineriaAdminValorFormulario(form, 'mnt-ja-campo-momento');
    const activo = mntJardineriaAdminCasillaFormulario(form, 'mnt-ja-campo-activo');
    if (bloque === null || titulo === null || frecuencia === null || dias === null || momento === null || activo === null) {
      mntJardineriaAdminError('Formulario de labor incompleto: no se envió ningún cambio.');
      return;
    }
    valores = {
      bloque: (bloque === '') ? null : bloque,
      titulo: (titulo === '') ? null : titulo,
      frecuencia: (frecuencia === '') ? null : frecuencia,
      diasSemana: mntJardineriaAdminDiasArray(dias),
      momento: (momento === '') ? null : momento
    };
    activoNuevo = activo;
  } else {
    mntJardineriaAdminError('Esta tabla no admite edición desde el formulario.');
    return;
  }

  const activoActual = registro.activo !== false;
  if (activoActual && activoNuevo === false) {
    const confirmar = window.confirm(
      '¿Desactivar este registro?\n\n' +
      'No se borra nada: quedará oculto en la vista de lectura, ' +
      'pero permanecerá aquí para poder reactivarlo.'
    );
    if (!confirmar) return;
  }

  const btn = form.querySelector('button[type="submit"]');
  mntJardineriaAdminGuardando = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  mntJardineriaAdminOcultarError();

  try {
    await mntJardineriaAdminGuardarRPC(tabla, registro, activoNuevo, valores);
  } catch (err) {
    console.error('Error guardando administración de jardinería:', err);
    mntJardineriaAdminRepintarModal();
    mntJardineriaAdminError(mntJardineriaAdminMensajeError(err));
    mntJardineriaAdminGuardando = false;
    return;
  }

  await mntJardineriaAdminFinalizarEscritura(clave);
}

// BOD-3: estado exclusivo de inventariados, separado de mantenciones y stock.
let mntBodSolicitud = 0;
let mntBodEstado = null;
let mntBodGuardando = false;
let mntBodFormularioId = null;
const MNT_BOD_MODAL = 'mnt-modal-registrar-inventariado';

function mntBodPuedeRegistrar() {
  return typeof window.esAdminOperativoActual === 'function' && window.esAdminOperativoActual() === true;
}

function mntBodPintar() {
  const panel = document.getElementById('mnt-modal-subapartado-body');
  if (!panel || !mantencionInventarioSeleccionado) return;
  const meta = MNT_SUBAPARTADOS.find(s => s.id === 'inventario');
  panel.innerHTML = mntPanelInventarioHTML(meta, mntInventariosBase);
}

async function mntBodCargar(id, aviso = '') {
  if (!id || mantencionInventarioSeleccionado !== id || !mntInventariosBase.some(r => r.id === id)) return;
  const solicitud = ++mntBodSolicitud;
  mntBodEstado = { id, cargando: true, aviso };
  mntBodPintar();
  try {
    const filas = await window.MantencionesService.getInventariadosBodega(id);
    if (solicitud !== mntBodSolicitud || mantencionInventarioSeleccionado !== id) return;
    mntBodEstado = { id, filas, aviso };
  } catch (e) {
    if (solicitud !== mntBodSolicitud || mantencionInventarioSeleccionado !== id) return;
    mntBodEstado = { id, error: e.message || 'No fue posible consultar los inventariados.', aviso };
  }
  if (solicitud === mntBodSolicitud && mantencionInventarioSeleccionado === id) mntBodPintar();
}

function mntBodHistorialHTML(r) {
  const estado = mntBodEstado && mntBodEstado.id === r.id ? mntBodEstado : null;
  let contenido;
  if (!estado || estado.cargando) contenido = '<p role="status" class="text-xs mt-3">Cargando inventariados…</p>';
  else if (estado.error) contenido = `<div role="alert" class="text-xs text-rose-700 dark:text-rose-300 mt-3">${mntEsc(estado.error)}</div><button onclick="mntBodCargar('${mntEsc(r.id)}')" class="mt-3 text-xs font-bold text-blue-600">Reintentar lectura</button>`;
  else contenido = estado.filas.length ? `<ul class="space-y-3">${estado.filas.map(f => `
    <li><div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-2">
      <p class="text-xs font-black text-slate-800 dark:text-slate-100">Fecha del inventariado: ${mntEsc(mntFormatoFechaCorta(f.fecha_inventariado) || 'Sin fecha registrada')}</p>
      <p class="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Responsable: ${mntEsc(f.responsable_texto || 'Sin responsable registrado')}</p>
      <p class="text-[10px] text-slate-400 dark:text-slate-500 font-semibold break-words">Autor: ${mntEsc(f.autor_nombre_snapshot || 'Autor no registrado')} · Fecha de registro: ${mntEsc(mntFormatoFechaCorta(f.created_at) || 'Sin fecha registrada')}</p>
    </div></li>`).join('')}</ul>` : `<div class="text-center py-6 space-y-1.5">
        <span class="text-2xl block">🗓️</span>
        <p class="text-xs font-bold text-slate-600 dark:text-slate-300">Todavía no hay inventariados registrados desde el sistema para esta bodega.</p>
        <p class="text-[11px] text-slate-400 dark:text-slate-500">Los inventariados que se registren aquí se mostrarán separados del registro histórico del Excel.</p>
      </div>`;
  return `<div class="pt-4 border-t border-slate-100 dark:border-slate-800">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3"><h4 class="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Inventariados registrados en el sistema</h4>
    ${mntBodPuedeRegistrar() ? '<button onclick="mntBodAbrirFormulario()" class="alm-btn-secondary">+ Registrar inventariado</button>' : ''}</div>
    ${estado && estado.aviso ? `<p role="status" class="text-xs mt-3 text-emerald-700 dark:text-emerald-300">${mntEsc(estado.aviso)}</p>` : ''}${contenido}</div>`;
}

function mntBodEscape(ev) {
  // UX-02: cierre únicamente mediante X, Cerrar o Cancelar.

}

function mntBodAbrirFormulario() {
  if (!mntBodPuedeRegistrar() || mntBodGuardando) return;
  const r = mntInventariosBase.find(f => f.id === mantencionInventarioSeleccionado);
  if (!r) return;
  let overlay = document.getElementById(MNT_BOD_MODAL);
  if (!overlay) {
    overlay = document.createElement('div'); overlay.id = MNT_BOD_MODAL;
    overlay.className = 'hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4';
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Registrar inventariado');
    document.body.appendChild(overlay);
  }
  mntBodFormularioId = r.id;
  overlay.innerHTML = `<div onclick="event.stopPropagation()" class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
    <div class="flex items-start justify-between gap-3"><h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">Registrar inventariado</h3><button onclick="mntBodCerrarFormulario()" aria-label="Cerrar" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none font-bold shrink-0">×</button></div>
    <p class="text-xs font-black text-blue-700 dark:text-blue-300 truncate">${mntEsc(r.nombre_original || 'Sin dato registrado')}</p>
    <p class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">${mntEsc(r.ubicacion_original || 'Ubicación sin dato registrado')} · El autor y la fecha de registro los asigna el servidor.</p>
    <div id="mnt-bod-error" role="alert" class="hidden bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl p-3 text-[11px] font-bold text-rose-700 dark:text-rose-300"></div>
    <form onsubmit="mntBodEnviar(event)" class="space-y-3">
      <label class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1" for="mnt-bod-fecha">Fecha del inventariado *</label>
      <input id="mnt-bod-fecha" type="date" required class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none" />
      <label class="block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1" for="mnt-bod-responsable">Responsable del inventariado *</label>
      <input id="mnt-bod-responsable" type="text" required class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none" />
      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
        <button type="button" onclick="mntBodCerrarFormulario()" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Cancelar</button>
        <button id="mnt-bod-submit" type="submit" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">Registrar inventariado</button>
      </div></form></div>`;
  overlay.classList.remove('hidden');
  document.removeEventListener('keydown', mntBodEscape, true);
  document.addEventListener('keydown', mntBodEscape, true);
}

function mntBodCerrarFormulario(forzado = false) {
  if (mntBodGuardando && !forzado) return;
  const overlay = document.getElementById(MNT_BOD_MODAL);
  if (overlay) overlay.classList.add('hidden');
  document.removeEventListener('keydown', mntBodEscape, true);
  mntBodFormularioId = null;
}

function mntBodError(mensaje) {
  const cont = document.getElementById('mnt-bod-error');
  if (cont) { cont.textContent = mensaje; cont.classList.remove('hidden'); }
}

async function mntBodEnviar(ev) {
  if (ev) ev.preventDefault();
  if (mntBodGuardando || !mntBodPuedeRegistrar()) return;
  const id = mntBodFormularioId;
  if (!id || mantencionInventarioSeleccionado !== id) { mntBodError('La ficha cambió. Cierra el formulario y vuelve a abrirlo desde la bodega correcta.'); return; }
  const fecha = document.getElementById('mnt-bod-fecha').value.trim();
  const responsable = document.getElementById('mnt-bod-responsable').value.trim();
  if (!fecha) { mntBodError('Indica la fecha del inventariado.'); return; }
  if (!responsable) { mntBodError('Indica quién realizó el inventariado.'); return; }
  const solicitud = mntBodSolicitud;
  const btn = document.getElementById('mnt-bod-submit');
  mntBodGuardando = true; btn.disabled = true; btn.textContent = 'Registrando…';
  try {
    await window.MantencionesService.registrarInventariadoBodega({ inventarioElementoId: id, fechaInventariado: fecha, responsableTexto: responsable });
    mntBodCerrarFormulario(true);
    if (solicitud === mntBodSolicitud && mantencionInventarioSeleccionado === id) {
      await mntBodCargar(id, 'Inventariado registrado correctamente.');
    }
  } catch (e) {
    if (mntBodFormularioId === id) mntBodError(e.message || 'No fue posible registrar el inventariado.');
  } finally {
    mntBodGuardando = false; btn.disabled = false; btn.textContent = 'Registrar inventariado';
  }
}
