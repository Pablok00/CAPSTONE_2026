// ==========================================================
// VISTA: MEJORAS Y OBRAS - HOTEL EL ALMENDRO
// ==========================================================
// FASE 4C-1: vista principal con PROYECTOS REALES de Supabase
// vía window.MejorasService (FASE 4B-1/4B-2).
//
// - Ya NO lee state.improvements (mock).
// - Sin fallback automático a mocks: si Supabase falla, se
//   muestra el estado de error.
// - Solo se muestra información real confirmada del proyecto:
//   nombre, estado, fecha_inicio, fecha_fin_estimada, es_historico.
// - NO se muestran presupuesto, materiales, fotos, costos,
//   prioridad ni progreso: no están confirmados para estos datos.
// - NO se inventan valores: los NULL se presentan con textos
//   neutros, sin modificar el dato real.
//
// PENDIENTE (fases posteriores):
// - Plan Anual, Metas, Pendientes y Carta Gantt visual.
//
// FASE 4C-2: ficha real del proyecto.
// - Al hacer clic en la tarjeta se abre el modal existente
//   #modal-improvement-detail (reutilizado SIN depender de
//   state.improvements; el modal viejo openImprovementDetail()
//   de modals.js sigue intacto para las demás pantallas).
// - Datos reales: MejorasService.getProyectoDetalle() +
//   MejorasService.getTareas() en Promise.all.
// - Cierre: X, botón Cerrar, Escape y clic en overlay funcionan
//   con los handlers globales existentes (app.js + closeModal()).
// - Cada apertura limpia el contenido y muestra "Cargando...",
//   por lo que nunca queda ficha obsoleta al reabrir.

function renderImprovementsView() {
  setTimeout(async () => {
    const loader = document.getElementById('mejoras-loader');
    const container = document.getElementById('mejoras-content');
    if (!loader || !container) return;

    try {
      if (!window.MejorasService) throw new Error('MejorasService no está disponible.');
      const [proyectos, planes, pendientes, metas, pendMantencion] = await Promise.all([
        window.MejorasService.getProyectos(),
        window.MejorasService.getPlanesAnuales(),
        window.MejorasService.getPlanAnualPendientes(),
        window.MejorasService.getMetas(),
        window.MejorasService.getPendientes()
      ]);
      container.innerHTML = getImprovementsHTML(proyectos, planes, pendientes, metas, pendMantencion);
    } catch (e) {
      console.error('Error cargando proyectos de Mejoras / Obras:', e);
      container.innerHTML = getImprovementsErrorHTML();
    }

    loader.classList.add('hidden');
    container.classList.remove('hidden');
  }, 0);

  return `
    ${uiCargandoHTML("mejoras-loader")}
    <div id="mejoras-content" class="hidden w-full"></div>
  `;
}

// ==========================================================
// HTML FINAL: encabezado + tarjetas de proyectos reales
// + entrada Plan Anual (FASE 4D-1)
// + entrada Metas por Área (FASE 4E-1)
// + entrada Pendientes de Mantención (FASE 4E-2)
// ==========================================================
function getImprovementsHTML(proyectos, planes, pendientesPlanAnual, metas, pendientesMantencion) {
  const lista = proyectos || [];
  const planesLista = planes || [];
  const pendientesLista = pendientesPlanAnual || [];
  const metasLista = metas || [];
  const pendMantLista = pendientesMantencion || [];

  // Rango de años calculado desde los datos reales (no hardcodeado).
  const anios = planesLista.map(p => p.anio).filter(a => a !== null && a !== undefined);
  const anioMin = anios.length ? Math.min(...anios) : null;
  const anioMax = anios.length ? Math.max(...anios) : null;
  const rangoAnios = (anioMin !== null && anioMax !== null)
    ? (anioMin === anioMax ? `${anioMin}` : `${anioMin}–${anioMax}`)
    : 'Sin años registrados';

  // Contextos distintos derivados de los datos (no hardcodeados).
  const contextos = [...new Set(planesLista.map(p => p.contexto).filter(c => c !== null && c !== undefined && c !== ''))];
  const textoContextos = contextos.length ? `Contextos: ${contextos.join(' y ')}` : '';

  return `
    <div class="alm-ui alm-main-page alm-module-page alm-project-page space-y-6 max-w-7xl mx-auto pb-10">
      
      ${uiEncabezadoSeccion('Mejoras y Obras','Proyectos de mejoras y obras de El Almendro registrados en el sistema.','folder',`<div class="alm-heading-count"><strong>${lista.length}</strong><span>${lista.length === 1 ? 'Proyecto registrado' : 'Proyectos registrados'}</span></div>`)}

      ${lista.length === 0 ? `
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800">
          <p class="text-sm font-bold text-slate-600 dark:text-slate-400">No hay proyectos registrados.</p>
        </div>
      ` : `
        <div class="alm-record-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${lista.map(p => `
            <div data-project-id="${p.id}" onclick="openImprovementProjectDetail('${p.id}')" class="alm-project-card bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all card-hover flex flex-col cursor-pointer group">
              
              <div class="alm-project-emblem h-28 bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-4xl">
                🌿
              </div>

              <div class="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <span class="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-md uppercase">
                    Proyecto de Mejora
                  </span>

                  <h4 class="text-lg font-extrabold text-slate-800 dark:text-white mt-2.5 leading-snug">
                    ${p.nombre || 'Sin nombre registrado'}
                  </h4>

                  <div class="mt-4 space-y-2 text-xs">
                    <div class="flex items-center justify-between">
                      <span class="text-slate-500 dark:text-slate-400 font-medium">Estado</span>
                      <span class="font-extrabold text-emerald-700 dark:text-emerald-300">${p.estado || 'Sin estado registrado'}</span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span class="text-slate-500 dark:text-slate-400 font-medium">Inicio</span>
                      <span class="font-bold text-slate-700 dark:text-slate-200">${p.fecha_inicio ? formatDate(p.fecha_inicio) : 'Sin fecha registrada'}</span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span class="text-slate-500 dark:text-slate-400 font-medium">Fin estimado</span>
                      <span class="font-bold text-slate-700 dark:text-slate-200">${p.fecha_fin_estimada ? formatDate(p.fecha_fin_estimada) : 'Sin fecha registrada'}</span>
                    </div>
                    ${p.es_historico ? `
                      <div class="flex items-center justify-between">
                        <span class="text-slate-500 dark:text-slate-400 font-medium">Origen</span>
                        <span class="font-bold text-slate-700 dark:text-slate-200">Histórico</span>
                      </div>
                    ` : ''}
                  </div>
                </div>

                <div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Tareas del proyecto</span>
                  <span class="font-bold text-emerald-600 dark:text-emerald-400 group-hover:translate-x-1 transition-transform flex items-center space-x-1">
                    <span>Ver Detalles</span>

                  </span>
                </div>
              </div>

            </div>
          `).join('')}
        </div>
      `}

      <!-- SECCIÓN PLAN ANUAL (FASE 4D-1): datos reales -->
      <div class="mt-2">
        <div class="flex items-center space-x-2 mb-3">
          <span class="text-lg">📅</span>
          <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Planificación</h3>
        </div>

        ${planesLista.length === 0 && pendientesLista.length === 0 ? `
          <div class="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800">
            <p class="text-sm font-bold text-slate-600 dark:text-slate-400">No hay planes anuales registrados.</p>
          </div>
        ` : `
          <div onclick="openPlanAnualModal()" class="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all card-hover flex flex-col md:flex-row cursor-pointer group">
            
            <div class="md:w-56 h-32 md:h-auto bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-5xl shrink-0">
              📅
            </div>

            <div class="p-6 flex-1">
              <span class="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-md uppercase">
                Planificación anual
              </span>

              <h4 class="text-lg font-extrabold text-slate-800 dark:text-white mt-2.5 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors leading-snug">
                Plan Anual
              </h4>

              <div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  <p class="text-2xl font-black text-slate-800 dark:text-white">${planesLista.length}</p>
                  <p class="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mt-0.5">${planesLista.length === 1 ? 'Plan registrado' : 'Planes registrados'}</p>
                </div>
                <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  <p class="text-2xl font-black text-slate-800 dark:text-white">${rangoAnios}</p>
                  <p class="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mt-0.5">Años disponibles</p>
                </div>
                <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  <p class="text-2xl font-black text-slate-800 dark:text-white">${pendientesLista.length}</p>
                  <p class="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mt-0.5">${pendientesLista.length === 1 ? 'Pendiente histórico' : 'Pendientes históricos'}</p>
                </div>
              </div>

              <div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium">${textoContextos}</span>
                <span class="font-bold text-emerald-600 dark:text-emerald-400 group-hover:translate-x-1 transition-transform flex items-center space-x-1">
                  <span>Ver Plan Anual</span>

                </span>
              </div>
            </div>

          </div>
        `}
      </div>

      <!-- SECCIÓN METAS POR ÁREA (FASE 4E-1): datos reales -->
      <div class="mt-2">
        <div class="flex items-center space-x-2 mb-3">
          <span class="text-lg">🎯</span>
          <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Metas</h3>
        </div>

        ${metasLista.length === 0 ? `
          <div class="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800">
            <p class="text-sm font-bold text-slate-600 dark:text-slate-400">No hay metas registradas.</p>
          </div>
        ` : `
          <div onclick="openMetasAreaModal()" class="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all card-hover flex flex-col md:flex-row cursor-pointer group">
            
            <div class="md:w-56 h-32 md:h-auto bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-5xl shrink-0">
              🎯
            </div>

            <div class="p-6 flex-1">
              <span class="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-md uppercase">
                Metas operativas
              </span>

              <h4 class="text-lg font-extrabold text-slate-800 dark:text-white mt-2.5 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors leading-snug">
                Metas por Área
              </h4>

              <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  <p class="text-2xl font-black text-slate-800 dark:text-white">${metasLista.length}</p>
                  <p class="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mt-0.5">${metasLista.length === 1 ? 'Meta registrada' : 'Metas registradas'}</p>
                </div>
                <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  <p class="text-2xl font-black text-slate-800 dark:text-white">${new Set(metasLista.map(m => m.area_original || 'sin_area')).size}</p>
                  <p class="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mt-0.5">Áreas reales</p>
                </div>
              </div>

              <div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Fuente: POR HACER- Area Mantenciones.xlsx</span>
                <span class="font-bold text-emerald-600 dark:text-emerald-400 group-hover:translate-x-1 transition-transform flex items-center space-x-1">
                  <span>Ver Metas por Área</span>

                </span>
              </div>
            </div>

          </div>
        `}
      </div>

      <!-- SECCIÓN PENDIENTES DE MANTENCIÓN (FASE 4E-2): datos reales -->
      <div class="mt-2">
        <div class="flex items-center space-x-2 mb-3">
          <span class="text-lg">🧰</span>
          <h3 class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Pendientes</h3>
        </div>

        ${pendMantLista.length === 0 ? `
          <div class="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800">
            <p class="text-sm font-bold text-slate-600 dark:text-slate-400">No hay pendientes de mantención registrados.</p>
          </div>
        ` : `
          <div onclick="openPendientesMantencionModal()" class="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all card-hover flex flex-col md:flex-row cursor-pointer group">

            <div class="md:w-56 h-32 md:h-auto bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-5xl shrink-0">
              🧰
            </div>

            <div class="p-6 flex-1">
              <span class="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded-md uppercase">
                Bitácora de pendientes
              </span>

              <h4 class="text-lg font-extrabold text-slate-800 dark:text-white mt-2.5 group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors leading-snug">
                Pendientes de Mantención
              </h4>

              <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  <p class="text-2xl font-black text-slate-800 dark:text-white">${pendMantLista.length}</p>
                  <p class="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mt-0.5">${pendMantLista.length === 1 ? 'Pendiente registrado' : 'Pendientes registrados'}</p>
                </div>
                <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  <p class="text-2xl font-black text-slate-800 dark:text-white">${new Set(pendMantLista.map(p => p.grupo_original || 'sin_grupo')).size}</p>
                  <p class="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mt-0.5">Grupos reales</p>
                </div>
              </div>

              <div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Fuente: POR HACER- Area Mantenciones.xlsx</span>
                <span class="font-bold text-amber-600 dark:text-amber-400 group-hover:translate-x-1 transition-transform flex items-center space-x-1">
                  <span>Ver Pendientes de Mantención</span>

                </span>
              </div>
            </div>

          </div>
        `}
      </div>

    </div>
  `;
}

// ==========================================================
// ESTADO DE ERROR: sin fallback a mocks
// ==========================================================
function getImprovementsErrorHTML() {
  return `
    <div class="space-y-6 max-w-7xl mx-auto pb-10">
      <div class="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-red-200 dark:border-red-900/60">
        <p class="text-2xl mb-2">⚠️</p>
        <p class="text-sm font-bold text-red-700 dark:text-red-400">No fue posible cargar los proyectos.</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Revisa tu conexión e intenta nuevamente.</p>
      </div>
    </div>
  `;
}

// ==========================================================
// FICHA REAL DEL PROYECTO (FASE 4C-2)
// Reutiliza el modal existente #modal-improvement-detail
// (contenedor #improvement-modal-content). NO depende de
// state.improvements ni de openImprovementDetail() (mock).
// ==========================================================

// Formato de avance (progreso):
// - La escala real en Supabase es 0–100 (tareas.progreso ya
//   viene normalizado durante la migración; el Excel original
//   pudo usar 0–1, pero esa conversión ya se hizo).
// - NULL  -> "Sin progreso registrado" (NULL nunca es 0).
// - 0     -> "0%" (cero real sí se muestra como 0%).
// - cualquier valor se muestra con signo % tal cual
//   (1 -> "1%", 20 -> "20%", 100 -> "100%"). NO se interpreta
//   1 como 100%.
function formatProgresoTarea(valor) {
  if (valor === null || valor === undefined || valor === '') return 'Sin progreso registrado';
  const n = Number(valor);
  if (Number.isNaN(n)) return String(valor);
  if (n === 0) return '0%';
  return `${n}%`;
}

// Formato de duración (solo presentación):
// - NULL/vacío  -> "Sin duración registrada".
// - numérico    -> 1 día / [n] días.
// - texto       -> se muestra tal cual, sin interpretar.
function formatDuracionTarea(valor) {
  if (valor === null || valor === undefined || valor === '') return 'Sin duración registrada';
  const texto = String(valor).trim();
  if (texto === '') return 'Sin duración registrada';
  if (/^\d+$/.test(texto)) {
    const n = Number(texto);
    return n === 1 ? '1 día' : `${n} días`;
  }
  return texto;
}

async function openImprovementProjectDetail(projectId) {
  const content = mejModalContent();
  if (!content) return;

  // Cada apertura limpia el estado previo y muestra "Cargando":
  // así no queda ficha obsoleta al reabrir (también tras cerrar
  // con Escape u overlay, que no ejecutan código de esta vista).
  content.innerHTML = `
    <div class="flex flex-col items-center justify-center py-20 space-y-4">
      <span class="animate-spin text-4xl text-emerald-600">⏳</span>
      <span class="text-sm font-bold text-slate-500 dark:text-slate-400">Cargando detalle del proyecto...</span>
    </div>
  `;
  openModal('modal-improvement-detail');

  try {
    if (!window.MejorasService) throw new Error('MejorasService no está disponible.');

    const [proyecto, tareas] = await Promise.all([
      window.MejorasService.getProyectoDetalle(projectId),
      window.MejorasService.getTareas(projectId)
    ]);

    content.innerHTML = getImprovementFichaHTML(proyecto, tareas);
  } catch (e) {
    console.error('Error cargando detalle del proyecto de Mejoras:', e);
    content.innerHTML = getImprovementFichaErrorHTML();
  }

  content.scrollTop = 0;
}

// Encabezado de la ficha + información general + listado de
// tareas agrupadas por grupo_origen (fase real del Excel).
function getImprovementFichaHTML(proyecto, tareas) {
  const p = proyecto || {};
  const lista = tareas || [];

  // Agrupación por grupo_origen REAL, preservando el orden
  // entregado por MejorasService (fecha_inicio ASC).
  const grupos = [];
  const indiceGrupo = {};
  lista.forEach(t => {
    const clave = t.grupo_origen || null;
    if (!(clave in indiceGrupo)) {
      indiceGrupo[clave] = grupos.length;
      grupos.push({ nombre: clave, tareas: [] });
    }
    grupos[indiceGrupo[clave]].tareas.push(t);
  });

  return `
    <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
      <div>
        <div class="flex items-center space-x-2 flex-wrap gap-y-1">
          <span class="text-xs font-extrabold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-md uppercase">
            Proyecto de Mejora
          </span>
          ${p.es_historico ? `
            <span class="text-xs font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-md uppercase">
              Histórico
            </span>
          ` : ''}
        </div>
        <h3 class="text-xl font-extrabold text-slate-900 dark:text-white mt-2">${p.nombre || 'Sin nombre registrado'}</h3>
      </div>
      <button onclick="closeModal('modal-improvement-detail')" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl font-bold p-1">&times;</button>
    </div>

    <div class="mt-4 grid grid-cols-2 gap-3 p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 text-xs">
      <div>
        <span class="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold uppercase block">Estado</span>
        <span class="text-sm font-extrabold text-slate-900 dark:text-white">${p.estado || 'Sin estado registrado'}</span>
      </div>
      <div>
        <span class="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold uppercase block">Origen</span>
        <span class="text-sm font-extrabold text-slate-900 dark:text-white">${p.es_historico ? 'Histórico' : 'Actual'}</span>
      </div>
      <div>
        <span class="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold uppercase block">Fecha de inicio</span>
        <span class="text-sm font-extrabold text-slate-900 dark:text-white">${p.fecha_inicio ? formatDate(p.fecha_inicio) : 'Sin fecha registrada'}</span>
      </div>
      <div>
        <span class="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold uppercase block">Fecha fin estimada</span>
        <span class="text-sm font-extrabold text-slate-900 dark:text-white">${p.fecha_fin_estimada ? formatDate(p.fecha_fin_estimada) : 'Sin fecha registrada'}</span>
      </div>
      <div class="col-span-2">
        <span class="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold uppercase block">Responsable</span>
        <span class="text-sm font-extrabold text-slate-900 dark:text-white">${p.responsable_texto || 'Sin responsable registrado'}</span>
      </div>
    </div>

    ${p.observaciones ? `
      <div class="mt-3 p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
        <span class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block mb-1">Observaciones</span>
        <p class="text-slate-700 dark:text-slate-200 leading-relaxed">${p.observaciones}</p>
      </div>
    ` : ''}

    <!-- ENTRADA CARTA GANTT (FASE 4F-1): solo lectura -->
    ${p.id ? `
      <div class="mt-4">
        <button onclick="openProyectoGantt('${p.id}')" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center justify-center space-x-2">
          <span>📊</span>
          <span>Ver Carta Gantt</span>

        </button>
      </div>
    ` : ''}

    <div class="mt-6">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">Tareas del proyecto</h4>
        <span class="text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-full">
          ${lista.length} ${lista.length === 1 ? 'tarea' : 'tareas'}
        </span>
      </div>

      ${lista.length === 0 ? `
        <div class="p-6 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400">Sin tareas registradas para este proyecto.</p>
        </div>
      ` : grupos.map(g => `
        <div class="mb-4">
          <h5 class="text-[11px] font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-tight mb-2">
            ${g.nombre || 'Sin grupo registrado'} · ${g.tareas.length} ${g.tareas.length === 1 ? 'tarea' : 'tareas'}
          </h5>
          <div class="space-y-2">
            ${g.tareas.map(t => `
              <div class="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
                <div class="flex items-start justify-between gap-3">
                  <p class="font-extrabold text-slate-800 dark:text-white leading-snug">${t.titulo || 'Sin título registrado'}</p>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                    ${t.estado || 'Sin estado'}
                  </span>
                </div>
                <div class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[11px]">
                  <div>
                    <span class="text-slate-400 dark:text-slate-500 block">Responsable</span>
                    <span class="font-bold text-slate-700 dark:text-slate-200">${t.responsable_texto || 'Sin responsable registrado'}</span>
                  </div>
                  <div>
                    <span class="text-slate-400 dark:text-slate-500 block">Inicio</span>
                    <span class="font-bold text-slate-700 dark:text-slate-200">${t.fecha_inicio ? formatDate(t.fecha_inicio) : 'Sin fecha registrada'}</span>
                  </div>
                  <div>
                    <span class="text-slate-400 dark:text-slate-500 block">Fin</span>
                    <span class="font-bold text-slate-700 dark:text-slate-200">${t.fecha_vencimiento ? formatDate(t.fecha_vencimiento) : 'Sin fecha registrada'}</span>
                  </div>
                  <div>
                    <span class="text-slate-400 dark:text-slate-500 block">Duración</span>
                    <span class="font-bold text-slate-700 dark:text-slate-200">${formatDuracionTarea(t.duracion_original)}</span>
                  </div>
                  <div>
                    <span class="text-slate-400 dark:text-slate-500 block">Avance</span>
                    <span class="font-bold text-slate-700 dark:text-slate-200">${formatProgresoTarea(t.progreso)}</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
      <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
        Cerrar Ficha
      </button>
    </div>
  `;
}

// Estado de error de la ficha: sin fallback a mocks.
function getImprovementFichaErrorHTML() {
  return `
    <div class="flex flex-col items-center justify-center py-16 space-y-4 text-center">
      <p class="text-3xl">⚠️</p>
      <p class="text-sm font-bold text-red-700 dark:text-red-400">No fue posible cargar el detalle del proyecto.</p>
      <p class="text-xs text-slate-500 dark:text-slate-400">Revisa tu conexión e intenta nuevamente.</p>
      <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
        Cerrar
      </button>
    </div>
  `;
}

// ==========================================================
// CARTA GANTT VISUAL — SOLO LECTURA (FASE 4F-1)
// Visualiza las tareas reales del proyecto en una línea
// temporal DIARIA dentro del mismo modal. NO CRUD, NO edición,
// NO drag & drop. NO se conecta con js/views/gantt.js (ese
// Gantt general y el de Prevencionista quedan intactos).
//
// C2P-4A: el renderer visual fue EXTRAÍDO a
// js/components/ganttCarta.js (window.GanttCarta), que es
// presentación pura (sin servicios, sin Supabase, sin
// escrituras). Esta vista conserva SOLO la carga de datos
// (MejorasService) y el adaptador a su modelo normalizado;
// el HTML generado sigue siendo el del Gantt aprobado.
//
// REGLAS (vigentes aquí y en el componente):
// - El rango temporal se DERIVA de las fechas reales
//   (proyecto + tareas). NO se hardcodea ningún mes.
// - Las fechas son la fuente de posición de la barra
//   (fecha_inicio -> fecha_vencimiento, ambos inclusive).
//   NO se deriva posición desde duracion_original.
// - progreso: NULL -> sin relleno (nunca 0); >100 -> se
//   limita el ancho visual al 100% pero el TEXTO conserva
//   el valor real (sin reinterpretar).
// - estado se muestra tal cual, NO se recalcula.
// - Colores por grupo_origen son SOLO presentación (no se
//   guardan en Supabase). NULL -> estilo neutro.
// - "Hoy" solo se dibuja si cae dentro de la ventana derivada.
// ==========================================================

// ----------------------------------------------------------
// MODAL DE MEJORAS: variante ancha SOLO para Carta Gantt
// (#modal-improvement-detail / #improvement-modal-content).
// Normalizador de acceso: cualquier vista que escriba en este
// contenedor usa mejModalContent(), que devuelve el elemento
// ya restaurado al ancho normal (max-w-3xl). La variante
// ancha la activa únicamente openProyectoGantt al renderizar
// la Carta Gantt (GanttCarta.modalAncha).
// ----------------------------------------------------------
function mejModalContent() {
  const content = document.getElementById('improvement-modal-content');
  if (content && window.GanttCarta) window.GanttCarta.modalAncha(content, false);
  return content;
}

// Utilidades del Gantt (parseFechaDia, días, rango, progreso,
// colores, escape de atributos) viven ahora en
// window.GanttCarta (js/components/ganttCarta.js).

async function openProyectoGantt(projectId) {
  // Variante ANCHA: solo la Carta Gantt usa la modal amplia de Gantt.
  const content = mejModalContent();
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-col items-center justify-center py-20 space-y-4">
      <span class="animate-spin text-4xl text-emerald-600">⏳</span>
      <span class="text-sm font-bold text-slate-500 dark:text-slate-400">Cargando Carta Gantt...</span>
    </div>
  `;
  content.scrollTop = 0;

  try {
    if (!window.MejorasService) throw new Error('MejorasService no está disponible.');

    const [proyecto, tareas] = await Promise.all([
      window.MejorasService.getProyectoDetalle(projectId),
      window.MejorasService.getTareas(projectId)
    ]);

    content.innerHTML = getProyectoGanttHTML(proyecto, tareas);
    // Se activa el ancho amplio SOLO tras renderizar la Carta Gantt.
    if (window.GanttCarta) window.GanttCarta.modalAncha(content, true);
  } catch (e) {
    console.error('Error cargando la Carta Gantt del proyecto:', e);
    content.innerHTML = getProyectoGanttErrorHTML(projectId);
  }

  content.scrollTop = 0;
}

// ADAPTADOR MEJORAS → GanttCarta (C2P-4A).
// Transforma las tareas REALES de MejorasService al modelo
// normalizado del componente (faseNombre = grupo_origen,
// fechaFin = fecha_vencimiento, responsable = responsable_texto,
// progreso 0–100 tal cual, estado tal cual). El componente NO
// conoce MejorasService: aquí vive todo el mapeo de campos.
function adaptarTareasGanttMejoras(tareas) {
  return (Array.isArray(tareas) ? tareas : []).map(t => ({
    id: t.id,
    titulo: t.titulo,
    faseId: t.grupo_origen || null,
    faseNombre: t.grupo_origen || null,
    responsable: t.responsable_texto,
    estado: t.estado,
    fechaInicio: t.fecha_inicio,
    fechaFin: t.fecha_vencimiento,
    progreso: t.progreso,
    activo: true
  }));
}

function getProyectoGanttHTML(proyecto, tareas) {
  const p = proyecto || {};
  const lista = tareas || [];

  // Rango derivado de las fechas reales (proyecto + tareas),
  // igual que antes: se usa solo para el chip informativo; el
  // renderer lo recalcula con el mismo criterio.
  const rango = GanttCarta.calcularRango(
    [{ fechaInicio: p.fecha_inicio, fechaFin: p.fecha_fin_estimada }]
      .concat(lista.map(t => ({ fechaInicio: t.fecha_inicio, fechaFin: t.fecha_vencimiento })))
  );

  return `
    <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
      <div>
        <button onclick="openImprovementProjectDetail('${p.id || ''}')" class="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 px-2.5 py-1 rounded-xl flex items-center space-x-1 transition-colors mb-2">
          <span>← Volver a la ficha del proyecto</span>
        </button>
        <span class="text-xs font-extrabold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-md uppercase">
          Carta Gantt · solo lectura
        </span>
        <h3 class="text-lg font-extrabold text-slate-900 dark:text-white mt-2">${p.nombre || 'Sin nombre registrado'}</h3>
      </div>
      <button onclick="closeModal('modal-improvement-detail')" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl font-bold p-1">&times;</button>
    </div>

    <div class="mt-3 inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">
      <span>${lista.length} ${lista.length === 1 ? 'tarea' : 'tareas'}</span>
      ${rango ? `<span class="text-slate-400 dark:text-slate-500">·</span><span>${formatDate(p.fecha_inicio) || '—'} → ${formatDate(p.fecha_fin_estimada) || '—'}</span>` : ''}
    </div>

    ${GanttCarta.render({
      tareas: adaptarTareasGanttMejoras(lista),
      fechasProyecto: { fechaInicio: p.fecha_inicio, fechaFin: p.fecha_fin_estimada },
      formatearProgreso: formatProgresoTarea,
      formatearFecha: formatDate,
      textos: {
        // Texto EXACTO del Gantt aprobado (paridad visual Fase 4F-1).
        notaEscala: (dias) => `Escala diaria · ${dias} ${dias === 1 ? 'día' : 'días'} derivados de las fechas reales del proyecto y sus tareas. Los fines de semana aparecen en tono gris y la línea roja marca "Hoy" solo cuando cae dentro del rango. Vista de solo lectura.`
      }
    })}

    <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
      <button onclick="openImprovementProjectDetail('${p.id || ''}')" class="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950 transition-colors">
        ← Volver a la ficha del proyecto
      </button>
      <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
        Cerrar
      </button>
    </div>
  `;
}

function getProyectoGanttErrorHTML(projectId) {
  return `
    <div class="flex flex-col items-center justify-center py-16 space-y-4 text-center">
      <p class="text-3xl">⚠️</p>
      <p class="text-sm font-bold text-red-700 dark:text-red-400">No fue posible cargar la Carta Gantt.</p>
      <p class="text-xs text-slate-500 dark:text-slate-400">Revisa tu conexión e intenta nuevamente.</p>
      <div class="flex items-center space-x-2">
        <button onclick="openImprovementProjectDetail('${projectId || ''}')" class="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950 transition-colors">
          ← Volver a la ficha del proyecto
        </button>
        <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
          Cerrar
        </button>
      </div>
    </div>
  `;
}

// ==========================================================
// PLAN ANUAL (FASE 4D-1)
// Modal con los 12 planes y el resumen de pendientes por año.
// Reutiliza #modal-improvement-detail (cada apertura limpia el
// contenido, por lo que no mezcla estado con la ficha del
// proyecto). NO usa mocks ni el modal viejo de mejoras.
// ==========================================================

async function openPlanAnualModal() {
  const content = mejModalContent();
  if (!content) return;

  // Cada apertura limpia el contenido previo y muestra "Cargando".
  content.innerHTML = `
    <div class="flex flex-col items-center justify-center py-20 space-y-4">
      <span class="animate-spin text-4xl text-emerald-600">⏳</span>
      <span class="text-sm font-bold text-slate-500 dark:text-slate-400">Cargando Plan Anual...</span>
    </div>
  `;
  openModal('modal-improvement-detail');

  try {
    if (!window.MejorasService) throw new Error('MejorasService no está disponible.');

    const [planes, pendientes] = await Promise.all([
      window.MejorasService.getPlanesAnuales(),
      window.MejorasService.getPlanAnualPendientes()
    ]);

    content.innerHTML = getPlanAnualModalHTML(planes, pendientes);
  } catch (e) {
    console.error('Error cargando el Plan Anual de Mejoras:', e);
    content.innerHTML = getPlanAnualErrorHTML();
  }

  content.scrollTop = 0;
}

function getPlanAnualModalHTML(planes, pendientes) {
  const listaPlanes = planes || [];
  const listaPendientes = pendientes || [];

  // Resumen de pendientes por año, calculado desde los 26
  // registros reales. NO se interpretan ni suman montos.
  const pendientesPorAnio = {};
  listaPendientes.forEach(p => {
    const clave = (p.anio === null || p.anio === undefined) ? 'sin_anio' : p.anio;
    pendientesPorAnio[clave] = (pendientesPorAnio[clave] || 0) + 1;
  });

  // Planes agrupados por año, preservando el orden real del
  // service (anio ASC, contexto ASC).
  const anios = [];
  const indiceAnio = {};
  listaPlanes.forEach(pl => {
    const clave = (pl.anio === null || pl.anio === undefined) ? 'sin_anio' : pl.anio;
    if (!(clave in indiceAnio)) {
      indiceAnio[clave] = anios.length;
      anios.push({ anio: clave, planes: [] });
    }
    anios[indiceAnio[clave]].planes.push(pl);
  });

  return `
    <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
      <div>
        <span class="text-xs font-extrabold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-md uppercase">
          Planificación anual
        </span>
        <h3 class="text-xl font-extrabold text-slate-900 dark:text-white mt-2">Plan Anual</h3>
      </div>
      <button onclick="closeModal('modal-improvement-detail')" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl font-bold p-1">&times;</button>
    </div>

    <div class="mt-4 grid grid-cols-3 gap-3 p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 text-xs text-center">
      <div>
        <p class="text-xl font-black text-slate-900 dark:text-white">${listaPlanes.length}</p>
        <span class="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold uppercase">Planes</span>
      </div>
      <div>
        <p class="text-xl font-black text-slate-900 dark:text-white">${anios.filter(a => a.anio !== 'sin_anio').length || '—'}</p>
        <span class="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold uppercase">Años</span>
      </div>
      <div>
        <p class="text-xl font-black text-slate-900 dark:text-white">${listaPendientes.length}</p>
        <span class="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold uppercase">Pendientes</span>
      </div>
    </div>

    <div class="mt-3 flex justify-end">
      <button onclick="openPlanAnualPendientesModal()" class="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 hover:bg-amber-100 dark:hover:bg-amber-950 transition-colors">
        Ver pendientes históricos (${listaPendientes.length})
      </button>
    </div>

    <div class="mt-5">
      <h4 class="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight mb-3">Planes por año</h4>

      ${listaPlanes.length === 0 ? `
        <div class="p-6 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400">No hay planes anuales registrados.</p>
        </div>
      ` : anios.map(grupo => `
        <div class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <h5 class="text-[11px] font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-tight">
              ${grupo.anio === 'sin_anio' ? 'Sin año registrado' : grupo.anio}
            </h5>
            ${(grupo.anio in pendientesPorAnio) ? `
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60">
                ${pendientesPorAnio[grupo.anio]} ${pendientesPorAnio[grupo.anio] === 1 ? 'pendiente' : 'pendientes'}
              </span>
            ` : `
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700">
                Sin pendientes registrados
              </span>
            `}
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${grupo.planes.map(pl => `
              <div data-plan-id="${pl.id}" onclick="openPlanAnualDetalleModal('${pl.id}')" class="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors text-xs">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-extrabold text-emerald-700 dark:text-emerald-300">${pl.contexto || 'Sin contexto registrado'}</span>
                  <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500">${pl.anio ?? '—'}</span>
                </div>
                <p class="mt-1 font-bold text-slate-800 dark:text-white leading-snug">${pl.nombre_original || 'Sin nombre registrado'}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="mt-5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400">
      Los montos de los pendientes se muestran en su texto original ("40M", "700 mil", "1,5M", etc.); no se convierten ni se suman. Nada de este contenido proviene de datos simulados.
    </div>

    <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
      <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
        Cerrar
      </button>
    </div>
  `;
}

// ==========================================================
// DETALLE DE UN PLAN (FASE 4D-2A)
// Clic en un plan -> MejorasService.getPlanAnualDetalle(planId).
// Reutiliza el mismo modal (nunca dos modales encima).
// "← Volver al Plan Anual" regresa a la lista de 12 planes
// dentro del mismo modal (usa la caché del service: sin
// spinner prolongado).
// ==========================================================

async function openPlanAnualDetalleModal(planId) {
  const content = mejModalContent();
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-col items-center justify-center py-20 space-y-4">
      <span class="animate-spin text-4xl text-emerald-600">⏳</span>
      <span class="text-sm font-bold text-slate-500 dark:text-slate-400">Cargando detalle del plan...</span>
    </div>
  `;
  content.scrollTop = 0;

  try {
    if (!window.MejorasService) throw new Error('MejorasService no está disponible.');

    const detalle = await window.MejorasService.getPlanAnualDetalle(planId);
    content.innerHTML = getPlanAnualDetalleHTML(detalle);
  } catch (e) {
    console.error('Error cargando el detalle del plan anual:', e);
    content.innerHTML = getPlanAnualDetalleErrorHTML();
  }

  content.scrollTop = 0;
}

function getPlanAnualDetalleHTML(detalle) {
  const plan = (detalle && detalle.plan) || {};
  const items = (detalle && detalle.items) || [];

  // Agrupación MES -> ÁREA, preservando el orden real del
  // service (mes ASC, area_original ASC, celda_origen ASC).
  const gruposMes = [];
  const indiceMes = {};
  items.forEach(it => {
    const claveMes = it.mes_original || null;
    if (!(claveMes in indiceMes)) {
      indiceMes[claveMes] = gruposMes.length;
      gruposMes.push({ mes: claveMes, areas: [], indiceArea: {} });
    }
    const grupo = gruposMes[indiceMes[claveMes]];
    const claveArea = it.area_original || null;
    if (!(claveArea in grupo.indiceArea)) {
      grupo.indiceArea[claveArea] = grupo.areas.length;
      grupo.areas.push({ area: claveArea, items: [] });
    }
    grupo.areas[grupo.indiceArea[claveArea]].items.push(it);
  });

  return `
    <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
      <div>
        <button onclick="openPlanAnualModal()" class="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 px-2.5 py-1 rounded-xl flex items-center space-x-1 transition-colors mb-2">
          <span>← Volver al Plan Anual</span>
        </button>
        <span class="text-xs font-extrabold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-md uppercase">
          ${plan.anio ?? 'Sin año registrado'} · ${plan.contexto || 'Sin contexto registrado'}
        </span>
        <h3 class="text-lg font-extrabold text-slate-900 dark:text-white mt-2">${plan.nombre_original || 'Sin nombre registrado'}</h3>
      </div>
      <button onclick="closeModal('modal-improvement-detail')" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl font-bold p-1">&times;</button>
    </div>

    <div class="mt-3 inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">
      <span>${items.length} ${items.length === 1 ? 'actividad' : 'actividades'}</span>
    </div>

    <div class="mt-4">
      ${items.length === 0 ? `
        <div class="p-6 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400">No hay actividades registradas para este plan.</p>
        </div>
      ` : gruposMes.map(g => `
        <div class="mb-5">
          <h5 class="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">
            ${g.mes || 'Sin mes registrado'}
          </h5>
          ${g.areas.map(a => `
            <div class="ml-1 mb-3 pl-3 border-l-2 border-emerald-200 dark:border-emerald-900">
              <p class="text-[11px] font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-tight mb-1.5">
                ${a.area || 'Sin área registrada'}
              </p>
              <div class="space-y-2">
                ${a.items.map(it => `
                  <div class="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
                    <p class="font-bold text-slate-800 dark:text-white leading-relaxed">${it.texto_original || 'Sin actividad escrita'}</p>

                    ${it.comentario_original ? `
                      <div class="mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60">
                        <p class="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">${it.comentario_original}</p>
                        ${(it.comentario_autor_original || it.comentario_metadato_original) ? `
                          <p class="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-1">
                            ${[it.comentario_autor_original, it.comentario_metadato_original].filter(Boolean).join(' · ')}
                          </p>
                        ` : ''}
                      </div>
                    ` : ''}

                    ${it.celda_origen ? `
                      <p class="text-[10px] text-slate-300 dark:text-slate-600 font-medium mt-2">Origen: ${it.celda_origen}</p>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>

    <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
      <button onclick="openPlanAnualModal()" class="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950 transition-colors">
        ← Volver al Plan Anual
      </button>
      <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
        Cerrar
      </button>
    </div>
  `;
}

function getPlanAnualDetalleErrorHTML() {
  return `
    <div class="flex flex-col items-center justify-center py-16 space-y-4 text-center">
      <p class="text-3xl">⚠️</p>
      <p class="text-sm font-bold text-red-700 dark:text-red-400">No fue posible cargar el detalle del plan.</p>
      <p class="text-xs text-slate-500 dark:text-slate-400">Revisa tu conexión e intenta nuevamente.</p>
      <div class="flex items-center space-x-2">
        <button onclick="openPlanAnualModal()" class="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950 transition-colors">
          ← Volver al Plan Anual
        </button>
        <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
          Cerrar
        </button>
      </div>
    </div>
  `;
}

function getPlanAnualErrorHTML() {
  return `
    <div class="flex flex-col items-center justify-center py-16 space-y-4 text-center">
      <p class="text-3xl">⚠️</p>
      <p class="text-sm font-bold text-red-700 dark:text-red-400">No fue posible cargar el Plan Anual.</p>
      <p class="text-xs text-slate-500 dark:text-slate-400">Revisa tu conexión e intenta nuevamente.</p>
      <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
        Cerrar
      </button>
    </div>
  `;
}

// ==========================================================
// PENDIENTES HISTÓRICOS DEL PLAN ANUAL (FASE 4D-2B)
// 26 registros reales de plan_anual_pendientes, agrupados por
// año. REGLA DE MONTOS: monto_original se muestra EXACTAMENTE
// como viene ("40M", "700 mil", "1,5M"...). NO se interpreta,
// NO se convierte, NO se agrega "$", NO se suma, NO se asume
// moneda. NULL -> "Sin valor registrado" (nunca 0).
// No se deduplican nombres repetidos: cada registro pertenece
// a su año documental.
// ==========================================================

async function openPlanAnualPendientesModal() {
  const content = mejModalContent();
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-col items-center justify-center py-20 space-y-4">
      <span class="animate-spin text-4xl text-emerald-600">⏳</span>
      <span class="text-sm font-bold text-slate-500 dark:text-slate-400">Cargando pendientes históricos...</span>
    </div>
  `;
  content.scrollTop = 0;

  try {
    if (!window.MejorasService) throw new Error('MejorasService no está disponible.');

    // Los años del rango completo se derivan de los planes
    // reales (caché del service, sin consulta nueva) para poder
    // mostrar la continuidad 2021–2026 sin inventar registros.
    const [pendientes, planes] = await Promise.all([
      window.MejorasService.getPlanAnualPendientes(),
      window.MejorasService.getPlanesAnuales()
    ]);

    content.innerHTML = getPlanAnualPendientesHTML(pendientes, planes);
  } catch (e) {
    console.error('Error cargando los pendientes históricos del Plan Anual:', e);
    content.innerHTML = getPlanAnualPendientesErrorHTML();
  }

  content.scrollTop = 0;
}

function getPlanAnualPendientesHTML(pendientes, planes) {
  const lista = pendientes || [];
  const listaPlanes = planes || [];

  // Rango completo de años derivado de los planes reales.
  const aniosPlanes = listaPlanes.map(p => p.anio).filter(a => a !== null && a !== undefined);
  const anioMin = aniosPlanes.length ? Math.min(...aniosPlanes) : null;
  const anioMax = aniosPlanes.length ? Math.max(...aniosPlanes) : null;

  // Registros reales agrupados por año (sin deduplicar).
  const grupos = [];
  const indiceGrupo = {};
  lista.forEach(p => {
    const clave = (p.anio === null || p.anio === undefined) ? 'sin_anio' : p.anio;
    if (!(clave in indiceGrupo)) {
      indiceGrupo[clave] = grupos.length;
      grupos.push({ anio: clave, pendientes: [] });
    }
    grupos[indiceGrupo[clave]].pendientes.push(p);
  });

  // Continuidad visual: años del rango sin pendientes reales
  // (ej.: 2026) se muestran como "Sin pendientes registrados",
  // sin crear registros ficticios.
  const aniosConPendientes = new Set(grupos.map(g => g.anio));
  const aniosSinPendientes = [];
  if (anioMin !== null && anioMax !== null) {
    for (let a = anioMin; a <= anioMax; a++) {
      if (!aniosConPendientes.has(a)) aniosSinPendientes.push(a);
    }
  }

  return `
    <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
      <div>
        <button onclick="openPlanAnualModal()" class="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 px-2.5 py-1 rounded-xl flex items-center space-x-1 transition-colors mb-2">
          <span>← Volver al Plan Anual</span>
        </button>
        <span class="text-xs font-extrabold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-md uppercase">
          Planificación anual
        </span>
        <h3 class="text-lg font-extrabold text-slate-900 dark:text-white mt-2">Pendientes históricos</h3>
      </div>
      <button onclick="closeModal('modal-improvement-detail')" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl font-bold p-1">&times;</button>
    </div>

    <div class="mt-3 inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">
      <span>${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}</span>
      ${(anioMin !== null && anioMax !== null) ? `<span class="text-slate-400 dark:text-slate-500">·</span><span>Años: ${anioMin === anioMax ? anioMin : `${anioMin}–${anioMax}`}</span>` : ''}
    </div>

    <div class="mt-4">
      ${lista.length === 0 ? `
        <div class="p-6 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400">No hay pendientes históricos registrados.</p>
        </div>
      ` : `
        ${grupos.map(g => `
          <div class="mb-5">
            <h5 class="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">
              ${g.anio === 'sin_anio' ? 'Sin año registrado' : g.anio}
              <span class="ml-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 normal-case">${g.pendientes.length} ${g.pendientes.length === 1 ? 'pendiente' : 'pendientes'}</span>
            </h5>
            <div class="space-y-2">
              ${g.pendientes.map(p => `
                <div class="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
                  <div class="flex items-start justify-between gap-3">
                    <p class="font-extrabold text-slate-800 dark:text-white leading-snug">${p.nombre_original || 'Sin nombre registrado'}</p>
                    <span class="font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      ${p.monto_original !== null && p.monto_original !== undefined && p.monto_original !== '' ? `Valor original: ${p.monto_original}` : 'Sin valor registrado'}
                    </span>
                  </div>

                  ${p.observaciones ? `
                    <div class="mt-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                      <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">${p.observaciones}</p>
                    </div>
                  ` : ''}

                  ${(p.celda_nombre_origen || p.celda_monto_origen) ? `
                    <p class="text-[10px] text-slate-300 dark:text-slate-600 font-medium mt-2">
                      Origen: ${[p.celda_nombre_origen ? `Nombre: ${p.celda_nombre_origen}` : null, p.celda_monto_origen ? `Valor: ${p.celda_monto_origen}` : null].filter(Boolean).join(' · ')}
                    </p>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}

        ${aniosSinPendientes.map(a => `
          <div class="mb-5">
            <h5 class="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">${a}</h5>
            <div class="p-4 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <p class="text-xs font-bold text-slate-500 dark:text-slate-400">Sin pendientes registrados</p>
            </div>
          </div>
        `).join('')}
      `}
    </div>

    <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
      <button onclick="openPlanAnualModal()" class="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950 transition-colors">
        ← Volver al Plan Anual
      </button>
      <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
        Cerrar
      </button>
    </div>
  `;
}

function getPlanAnualPendientesErrorHTML() {
  return `
    <div class="flex flex-col items-center justify-center py-16 space-y-4 text-center">
      <p class="text-3xl">⚠️</p>
      <p class="text-sm font-bold text-red-700 dark:text-red-400">No fue posible cargar los pendientes históricos.</p>
      <p class="text-xs text-slate-500 dark:text-slate-400">Revisa tu conexión e intenta nuevamente.</p>
      <div class="flex items-center space-x-2">
        <button onclick="openPlanAnualModal()" class="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950 transition-colors">
          ← Volver al Plan Anual
        </button>
        <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
          Cerrar
        </button>
      </div>
    </div>
  `;
}

// ==========================================================
// METAS POR ÁREA (FASE 4E-1)
// 58 registros reales de metas_area (fuente:
// POR HACER- Area Mantenciones.xlsx).
//
// REGLAS DE TEXTO ORIGINAL:
// - area_original, mes_original, frecuencia_original y
//   estado_original se muestran LITERALMENTE: sin corregir
//   mayúsculas ni ortografía ("JARDNERIA" queda tal cual),
//   sin convertir mes a fecha, sin interpretar frecuencia y
//   SIN normalizar estados ("SI", "NO", "LISTO", "EN PARTE",
//   "MÁS O MENOS" o NULL -> "Sin estado registrado").
// - NULL nunca se convierte en 0, "No", "Pendiente" ni
//   "Sin realizar".
// - No se sigue tarea_id ni se deduplica nada.
// - Conteos SIEMPRE derivados de los datos reales.
// ==========================================================

async function openMetasAreaModal() {
  const content = mejModalContent();
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-col items-center justify-center py-20 space-y-4">
      <span class="animate-spin text-4xl text-emerald-600">⏳</span>
      <span class="text-sm font-bold text-slate-500 dark:text-slate-400">Cargando metas por área...</span>
    </div>
  `;
  openModal('modal-improvement-detail');
  content.scrollTop = 0;

  try {
    if (!window.MejorasService) throw new Error('MejorasService no está disponible.');
    const metas = await window.MejorasService.getMetas();
    content.innerHTML = getMetasAreaHTML(metas);
  } catch (e) {
    console.error('Error cargando Metas por Área:', e);
    content.innerHTML = getMetasAreaErrorHTML();
  }

  content.scrollTop = 0;
}

// Resumen: bloques por area_original (agrupación por primera
// aparición, preservando el orden real del service).
function getMetasAreaHTML(metas) {
  const lista = metas || [];

  const grupos = [];
  const indiceGrupo = {};
  lista.forEach(m => {
    const clave = m.area_original || null;
    if (!(clave in indiceGrupo)) {
      indiceGrupo[clave] = grupos.length;
      grupos.push({ area: clave, metas: [] });
    }
    grupos[indiceGrupo[clave]].metas.push(m);
  });

  return `
    <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
      <div>
        <span class="text-xs font-extrabold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-md uppercase">
          Metas operativas
        </span>
        <h3 class="text-lg font-extrabold text-slate-900 dark:text-white mt-2">Metas por Área</h3>
      </div>
      <button onclick="closeModal('modal-improvement-detail')" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl font-bold p-1">&times;</button>
    </div>

    <div class="mt-3 inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">
      <span>${lista.length} ${lista.length === 1 ? 'meta' : 'metas'}</span>
      <span class="text-slate-400 dark:text-slate-500">·</span>
      <span>${grupos.length} ${grupos.length === 1 ? 'área' : 'áreas'}</span>
    </div>

    <div class="mt-4">
      ${lista.length === 0 ? `
        <div class="p-6 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400">No hay metas registradas.</p>
        </div>
      ` : `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${grupos.map((g, i) => `
            <div data-area-index="${i}" onclick="openMetasAreaDetallePorIndice(${i})" class="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors text-xs flex items-center justify-between gap-2">
              <div>
                <p class="font-extrabold text-slate-800 dark:text-white leading-snug">${g.area || 'Sin área registrada'}</p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mt-0.5">${g.metas.length} ${g.metas.length === 1 ? 'meta' : 'metas'}</p>
              </div>

            </div>
          `).join('')}
        </div>
      `}
    </div>

    <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
      <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
        Cerrar
      </button>
    </div>
  `;
}

// Detalle: metas de UN área, en el mismo modal.
// Se identifica el área por ÍNDICE de grupo (misma agrupación
// por primera aparición del resumen), evitando incrustar textos
// de datos dentro de atributos onclick (riesgo de romper el
// HTML si el texto contiene comillas).
async function openMetasAreaDetallePorIndice(indice) {
  const content = mejModalContent();
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-col items-center justify-center py-20 space-y-4">
      <span class="animate-spin text-4xl text-emerald-600">⏳</span>
      <span class="text-sm font-bold text-slate-500 dark:text-slate-400">Cargando metas por área...</span>
    </div>
  `;
  content.scrollTop = 0;

  try {
    if (!window.MejorasService) throw new Error('MejorasService no está disponible.');
    // Reutiliza la caché de getMetas(): sin consulta nueva.
    const metas = await window.MejorasService.getMetas();

    // Misma agrupación del resumen (primera aparición).
    const grupos = [];
    const indiceGrupo = {};
    metas.forEach(m => {
      const clave = m.area_original || null;
      if (!(clave in indiceGrupo)) {
        indiceGrupo[clave] = grupos.length;
        grupos.push({ area: clave, metas: [] });
      }
      grupos[indiceGrupo[clave]].metas.push(m);
    });

    const grupo = grupos[indice];
    if (!grupo) throw new Error('Área de metas no encontrada.');

    content.innerHTML = getMetasAreaDetalleHTML(grupo.area, grupo.metas);
  } catch (e) {
    console.error('Error cargando las metas del área:', e);
    content.innerHTML = getMetasAreaErrorHTML();
  }

  content.scrollTop = 0;
}

function getMetasAreaDetalleHTML(area, metas) {
  const lista = metas || [];

  return `
    <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
      <div>
        <button onclick="openMetasAreaModal()" class="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 px-2.5 py-1 rounded-xl flex items-center space-x-1 transition-colors mb-2">
          <span>← Volver a Metas por Área</span>
        </button>
        <span class="text-xs font-extrabold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-md uppercase">
          Metas del área
        </span>
        <h3 class="text-lg font-extrabold text-slate-900 dark:text-white mt-2">${area || 'Sin área registrada'}</h3>
      </div>
      <button onclick="closeModal('modal-improvement-detail')" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl font-bold p-1">&times;</button>
    </div>

    <div class="mt-3 inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">
      <span>${lista.length} ${lista.length === 1 ? 'meta' : 'metas'}</span>
    </div>

    <div class="mt-4 space-y-2">
      ${lista.length === 0 ? `
        <div class="p-6 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400">No hay metas registradas para esta área.</p>
        </div>
      ` : lista.map(m => `
        <div class="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
          <div class="flex items-start justify-between gap-3">
            <p class="font-extrabold text-slate-800 dark:text-white leading-relaxed">${m.tarea_original || 'Sin tarea registrada'}</p>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
              ${m.estado_original || 'Sin estado registrado'}
            </span>
          </div>

          <div class="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
            <div>
              <span class="text-slate-400 dark:text-slate-500 block">Mes</span>
              <span class="font-bold text-slate-700 dark:text-slate-200">${m.mes_original || 'Sin mes registrado'}</span>
            </div>
            <div>
              <span class="text-slate-400 dark:text-slate-500 block">Responsable</span>
              <span class="font-bold text-slate-700 dark:text-slate-200">${m.responsable_original || 'Sin responsable registrado'}</span>
            </div>
            <div>
              <span class="text-slate-400 dark:text-slate-500 block">Frecuencia</span>
              <span class="font-bold text-slate-700 dark:text-slate-200">${m.frecuencia_original || 'Sin frecuencia registrada'}</span>
            </div>
            ${m.equipo_original ? `
              <div class="col-span-2 sm:col-span-3">
                <span class="text-slate-400 dark:text-slate-500 block">Equipo</span>
                <span class="font-bold text-slate-700 dark:text-slate-200">${m.equipo_original}</span>
              </div>
            ` : ''}
          </div>

          ${m.observaciones ? `
            <div class="mt-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">${m.observaciones}</p>
            </div>
          ` : ''}

          ${(m.celda_tarea_origen || m.fila_origen) ? `
            <p class="text-[10px] text-slate-300 dark:text-slate-600 font-medium mt-2">
              Origen: ${[m.celda_tarea_origen ? `Celda: ${m.celda_tarea_origen}` : null, m.fila_origen ? `Fila: ${m.fila_origen}` : null].filter(Boolean).join(' · ')}
            </p>
          ` : ''}
        </div>
      `).join('')}
    </div>

    <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
      <button onclick="openMetasAreaModal()" class="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950 transition-colors">
        ← Volver a Metas por Área
      </button>
      <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
        Cerrar
      </button>
    </div>
  `;
}

function getMetasAreaErrorHTML() {
  return `
    <div class="flex flex-col items-center justify-center py-16 space-y-4 text-center">
      <p class="text-3xl">⚠️</p>
      <p class="text-sm font-bold text-red-700 dark:text-red-400">No fue posible cargar las metas.</p>
      <p class="text-xs text-slate-500 dark:text-slate-400">Revisa tu conexión e intenta nuevamente.</p>
      <div class="flex items-center space-x-2">
        <button onclick="openMetasAreaModal()" class="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950 transition-colors">
          ← Volver a Metas por Área
        </button>
        <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
          Cerrar
        </button>
      </div>
    </div>
  `;
}

// ==========================================================
// PENDIENTES DE MANTENCIÓN (FASE 4E-2)
// 198 registros reales de pendientes_mantencion (fuente:
// POR HACER- Area Mantenciones.xlsx).
//
// REGLAS DE PRESENTACIÓN:
// - grupo_original y titulo_original se muestran LITERALMENTE
//   (sin corregir ortografía, espacios internos ni mayúsculas).
// - Fechas: se prioriza el TEXTO ORIGINAL (fecha_*_original);
//   solo si no existe se usa la fecha normalizada (formatDate).
//   NO se inventa día/mes/año faltante ni se convierte una
//   precisión parcial en fecha exacta.
// - realizado_por_color y fecha_realizado son EVIDENCIAS
//   SEPARADAS: el color NO define "Realizado" y la fecha NO
//   define por sí sola que esté hecho. Se muestran por
//   separado, sin derivar estados ni porcentajes.
// - NULL nunca se convierte en 0, "Pendiente" ni "No realizado".
// - No se deduplican títulos ni se fusionan con otras fuentes.
// - Conteos SIEMPRE derivados de los datos reales.
// ==========================================================

// Presentación de una fecha: original -> normalizada -> neutro.
// fechaOriginal es el texto tal cual del Excel; fechaNormal es
// el valor ya interpretado por la importación. La precisión
// (parcial/día/mes...) se muestra aparte, sin completarla.
function formatFechaPendiente(fechaOriginal, fechaNormal, textoSinDato, precision) {
  let valor;
  let fuente;

  if (fechaOriginal !== null && fechaOriginal !== undefined && String(fechaOriginal).trim() !== '') {
    valor = formatearFechaCL(fechaOriginal,{civil:true,invalida:String(fechaOriginal)});
    fuente = 'original';
  } else if (fechaNormal !== null && fechaNormal !== undefined && String(fechaNormal).trim() !== '') {
    valor = (typeof formatDate === 'function') ? formatDate(fechaNormal) : String(fechaNormal);
    fuente = 'normalizada';
  } else {
    return { texto: textoSinDato, precision: null };
  }

  return {
    texto: valor,
    fuente,
    precision: (precision !== null && precision !== undefined && String(precision).trim() !== '') ? String(precision) : null
  };
}

async function openPendientesMantencionModal() {
  const content = mejModalContent();
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-col items-center justify-center py-20 space-y-4">
      <span class="animate-spin text-4xl text-amber-600">⏳</span>
      <span class="text-sm font-bold text-slate-500 dark:text-slate-400">Cargando pendientes de mantención...</span>
    </div>
  `;
  openModal('modal-improvement-detail');
  content.scrollTop = 0;

  try {
    if (!window.MejorasService) throw new Error('MejorasService no está disponible.');
    const pendientes = await window.MejorasService.getPendientes();
    content.innerHTML = getPendientesMantencionHTML(pendientes);
  } catch (e) {
    console.error('Error cargando Pendientes de Mantención:', e);
    content.innerHTML = getPendientesMantencionErrorHTML();
  }

  content.scrollTop = 0;
}

// Resumen: bloques por grupo_original (agrupación por primera
// aparición, preservando el orden real del service). Los
// registros NO se renderizan aquí: se ven al entrar a un grupo
// (rendimiento con 198 registros).
function getPendientesMantencionHTML(pendientes) {
  const lista = pendientes || [];

  const grupos = agruparPendientesPorGrupo(lista);

  return `
    <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
      <div>
        <span class="text-xs font-extrabold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-md uppercase">
          Bitácora de pendientes
        </span>
        <h3 class="text-lg font-extrabold text-slate-900 dark:text-white mt-2">Pendientes de Mantención</h3>
      </div>
      <button onclick="closeModal('modal-improvement-detail')" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl font-bold p-1">&times;</button>
    </div>

    <div class="mt-3 inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">
      <span>${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}</span>
      <span class="text-slate-400 dark:text-slate-500">·</span>
      <span>${grupos.length} ${grupos.length === 1 ? 'grupo' : 'grupos'}</span>
    </div>

    <div class="mt-4">
      ${lista.length === 0 ? `
        <div class="p-6 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400">No hay pendientes de mantención registrados.</p>
        </div>
      ` : `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${grupos.map((g, i) => `
            <div data-grupo-index="${i}" onclick="openPendientesMantencionDetallePorIndice(${i})" class="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm cursor-pointer hover:border-amber-300 dark:hover:border-amber-800 transition-colors text-xs flex items-center justify-between gap-2">
              <div>
                <p class="font-extrabold text-slate-800 dark:text-white leading-snug">${g.grupo || 'Sin grupo registrado'}</p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mt-0.5">${g.pendientes.length} ${g.pendientes.length === 1 ? 'pendiente' : 'pendientes'}</p>
              </div>

            </div>
          `).join('')}
        </div>
      `}
    </div>

    <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
      <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
        Cerrar
      </button>
    </div>
  `;
}

// Agrupación por primera aparición, preservando el orden real
// que entrega MejorasService. Es la MISMA agrupación para el
// resumen y para el detalle (se identifica el grupo por índice).
function agruparPendientesPorGrupo(lista) {
  const grupos = [];
  const indiceGrupo = {};

  (lista || []).forEach(p => {
    const clave = p.grupo_original || null;
    if (!(clave in indiceGrupo)) {
      indiceGrupo[clave] = grupos.length;
      grupos.push({ grupo: clave, pendientes: [] });
    }
    grupos[indiceGrupo[clave]].pendientes.push(p);
  });

  return grupos;
}

// Detalle: pendientes de UN grupo, en el mismo modal.
// Se identifica el grupo por ÍNDICE (evita incrustar textos de
// datos en atributos onclick). Reutiliza la caché de
// getPendientes(): sin consulta nueva.
async function openPendientesMantencionDetallePorIndice(indice) {
  const content = mejModalContent();
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-col items-center justify-center py-20 space-y-4">
      <span class="animate-spin text-4xl text-amber-600">⏳</span>
      <span class="text-sm font-bold text-slate-500 dark:text-slate-400">Cargando pendientes de mantención...</span>
    </div>
  `;
  content.scrollTop = 0;

  try {
    if (!window.MejorasService) throw new Error('MejorasService no está disponible.');
    const pendientes = await window.MejorasService.getPendientes();
    const grupos = agruparPendientesPorGrupo(pendientes);

    const grupo = grupos[indice];
    if (!grupo) throw new Error('Grupo de pendientes no encontrado.');

    content.innerHTML = getPendientesMantencionDetalleHTML(grupo.grupo, grupo.pendientes);
  } catch (e) {
    console.error('Error cargando los pendientes del grupo:', e);
    content.innerHTML = getPendientesMantencionErrorHTML();
  }

  content.scrollTop = 0;
}

function getPendientesMantencionDetalleHTML(grupo, pendientes) {
  const lista = pendientes || [];

  return `
    <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
      <div>
        <button onclick="openPendientesMantencionModal()" class="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-950 border border-amber-200 dark:border-amber-900 px-2.5 py-1 rounded-xl flex items-center space-x-1 transition-colors mb-2">
          <span>← Volver a Pendientes de Mantención</span>
        </button>
        <span class="text-xs font-extrabold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-md uppercase">
          Grupo
        </span>
        <h3 class="text-lg font-extrabold text-slate-900 dark:text-white mt-2">${grupo || 'Sin grupo registrado'}</h3>
      </div>
      <button onclick="closeModal('modal-improvement-detail')" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl font-bold p-1">&times;</button>
    </div>

    <div class="mt-3 inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">
      <span>${lista.length} ${lista.length === 1 ? 'pendiente' : 'pendientes'}</span>
    </div>

    <div class="mt-4 space-y-2">
      ${lista.length === 0 ? `
        <div class="p-6 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400">No hay pendientes registrados en este grupo.</p>
        </div>
      ` : lista.map(p => getPendienteCardHTML(p)).join('')}
    </div>

    <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
      <button onclick="openPendientesMantencionModal()" class="px-4 py-2 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900 rounded-xl text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-950 transition-colors">
        ← Volver a Pendientes de Mantención
      </button>
      <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
        Cerrar
      </button>
    </div>
  `;
}

// Tarjeta individual de un pendiente. Cada evidencia se
// muestra POR SEPARADO: fecha de idea, fecha de realización e
// indicador de color no se combinan ni se derivan entre sí.
function getPendienteCardHTML(p) {
  const idea = formatFechaPendiente(p.fecha_idea_original, p.fecha_idea, 'Sin fecha de idea registrada', p.fecha_idea_precision);
  const realizado = formatFechaPendiente(p.fecha_realizado_original, p.fecha_realizado, 'Sin fecha de realización registrada', p.fecha_realizado_precision);

  // Indicador de color: evidencia propia, sin convertirse en
  // "Completado"/"Realizado"/"Finalizado".
  let indicadorColor;
  if (p.realizado_por_color === true) indicadorColor = 'Sí';
  else if (p.realizado_por_color === false) indicadorColor = 'No';
  else indicadorColor = 'Sin indicador de color registrado';

  const trazabilidad = [
    p.celda_titulo_origen ? `Título: ${p.celda_titulo_origen}` : null,
    p.celda_fecha_idea_origen ? `Idea: ${p.celda_fecha_idea_origen}` : null,
    p.celda_fecha_realizado_origen ? `Realizado: ${p.celda_fecha_realizado_origen}` : null,
    p.fila_origen ? `Fila: ${p.fila_origen}` : null
  ].filter(Boolean);

  return `
    <div class="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
      <p class="font-extrabold text-slate-800 dark:text-white leading-relaxed">${p.titulo_original || 'Sin título registrado'}</p>

      <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        <div>
          <span class="text-slate-400 dark:text-slate-500 block">Fecha de idea</span>
          <span class="font-bold text-slate-700 dark:text-slate-200">${idea.texto}</span>
          ${idea.precision ? `<span class="text-[10px] text-slate-400 dark:text-slate-500 block">Precisión: ${idea.precision}</span>` : ''}
        </div>
        <div>
          <span class="text-slate-400 dark:text-slate-500 block">Fecha de realización</span>
          <span class="font-bold text-slate-700 dark:text-slate-200">${realizado.texto}</span>
          ${realizado.precision ? `<span class="text-[10px] text-slate-400 dark:text-slate-500 block">Precisión: ${realizado.precision}</span>` : ''}
        </div>
        <div>
          <span class="text-slate-400 dark:text-slate-500 block">Indicador de color</span>
          <span class="font-bold text-slate-700 dark:text-slate-200">${indicadorColor}</span>
        </div>
        <div>
          <span class="text-slate-400 dark:text-slate-500 block">Color original</span>
          <span class="font-bold text-slate-700 dark:text-slate-200">${p.color_original || 'Sin color registrado'}</span>
        </div>
      </div>

      ${p.comentario_original ? `
        <div class="mt-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">${p.comentario_original}</p>
          ${p.comentario_autor_original ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-1">Autor: ${p.comentario_autor_original}</p>` : ''}
          ${p.comentario_celda_origen ? `<p class="text-[10px] text-slate-300 dark:text-slate-600 font-medium mt-1">Origen del comentario: ${p.comentario_celda_origen}</p>` : ''}
        </div>
      ` : ''}

      ${p.observaciones ? `
        <div class="mt-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">${p.observaciones}</p>
        </div>
      ` : ''}

      ${trazabilidad.length ? `
        <p class="text-[10px] text-slate-300 dark:text-slate-600 font-medium mt-2">Origen: ${trazabilidad.join(' · ')}</p>
      ` : ''}
    </div>
  `;
}

function getPendientesMantencionErrorHTML() {
  return `
    <div class="flex flex-col items-center justify-center py-16 space-y-4 text-center">
      <p class="text-3xl">⚠️</p>
      <p class="text-sm font-bold text-red-700 dark:text-red-400">No fue posible cargar los pendientes de mantención.</p>
      <p class="text-xs text-slate-500 dark:text-slate-400">Revisa tu conexión e intenta nuevamente.</p>
      <div class="flex items-center space-x-2">
        <button onclick="openPendientesMantencionModal()" class="px-4 py-2 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900 rounded-xl text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-950 transition-colors">
          ← Volver a Pendientes de Mantención
        </button>
        <button onclick="closeModal('modal-improvement-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
          Cerrar
        </button>
      </div>
    </div>
  `;
}
