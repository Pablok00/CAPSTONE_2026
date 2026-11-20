// ==========================================================
// VISTA: ÁREAS DE TRABAJO - HOTEL EL ALMENDRO
// ==========================================================

// AREAS-2A: resumen de lectura existente; independiente del estado operativo local.
let areaGeneralCarga = { estado: 'cargando', resumen: null };
let areaGeneralPeticion = 0;

async function areaGeneralCargarResumen(force = false) {
  const peticion = ++areaGeneralPeticion;
  areaGeneralCarga = { estado: 'cargando', resumen: null };
  try {
    if (!window.MantencionesService) throw new Error('Servicio no disponible');
    const resumen = await window.MantencionesService.getResumen(force);
    const valores = [resumen?.elementos, resumen?.mantenciones, resumen?.inventarios,
      resumen?.subapartados?.conDatos];
    if (!valores.every(v => Number.isInteger(v) && v >= 0)) throw new Error('Resumen incompleto');
    if (!Array.isArray(resumen.subapartados.detalle)) throw new Error('Resumen incompleto');
    const visiblesConDatos = resumen.subapartados.detalle.filter(s => s.id !== 'jardineria' && s.cantidad > 0).length;
    if (peticion === areaGeneralPeticion) {
      areaGeneralCarga = { estado: [resumen.elementos, resumen.mantenciones, resumen.inventarios, visiblesConDatos].every(v => v === 0) ? 'vacio' : 'listo', resumen };
    }
  } catch (_) {
    if (peticion === areaGeneralPeticion) areaGeneralCarga = { estado: 'error', resumen: null };
  }
  return areaGeneralCarga;
}

function areaGeneralResumenHTML() {
  if (areaGeneralCarga.estado === 'cargando') {
    return uiCargandoHTML();
  }
  if (areaGeneralCarga.estado === 'error') {
    return `<div role="alert" class="py-4 space-y-3"><p class="text-xs font-bold text-rose-600 dark:text-rose-400">No se pudo consultar el resumen de Mantención General en Supabase.</p>
      <button type="button" onclick="event.stopPropagation(); areaGeneralReintentar()" class="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">Reintentar</button></div>`;
  }
  if (areaGeneralCarga.estado === 'vacio') {
    return '<p role="status" class="py-5 text-xs text-slate-500 dark:text-slate-400">Sin registros en el resumen consultado de Mantención General.</p>';
  }
  const resumen = areaGeneralCarga.resumen;
  const conDatos = resumen.subapartados.detalle.filter(s => s.id !== 'jardineria' && s.cantidad > 0).length;
  return `<div class="alm-mini-stats grid grid-cols-3 gap-2 mt-3 pt-4 border-t border-slate-100 dark:border-slate-800">
      ${[['Elementos del catálogo', resumen.elementos], ['Mantenciones históricas del catálogo', resumen.mantenciones], ['Fichas de bodegas', resumen.inventarios]].map(([etiqueta, valor]) => `
        <div class="alm-mini-stat bg-slate-50 dark:bg-slate-800 rounded-xl p-2.5 text-center border border-slate-100 dark:border-slate-700"><p class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">${etiqueta}</p><p class="text-base font-black text-slate-900 dark:text-white">${valor}</p></div>`).join('')}
    </div><p class="mt-3 text-[11px] text-slate-500 dark:text-slate-400">${conDatos} subapartados con datos. Los registros históricos no representan tareas activas ni trabajos recién completados.</p>`;
}

async function areaGeneralReintentar() {
  const contenedor = document.getElementById('area-general-resumen');
  if (!contenedor || areaGeneralCarga.estado === 'cargando') return;
  const consulta = areaGeneralCargarResumen(true);
  contenedor.innerHTML = areaGeneralResumenHTML();
  await consulta;
  if (document.getElementById('area-general-resumen') === contenedor) contenedor.innerHTML = areaGeneralResumenHTML();
}


// AREAS-2A.1: definiciones descriptivas, sin responsables ni datos operativos locales.
const AREA_FICHAS = [
  { id: 'workarea_general', nombre: 'Mantención General', icono: '🛠️', descripcion: 'Conservación de las instalaciones del hotel y consulta de sus catálogos, fichas e historiales.' },
  { id: 'workarea_reactiva', nombre: 'Mantención Reactiva', icono: '⚡', descripcion: 'Atención de averías, fallas e imprevistos que requieren intervención.' },
  { id: 'workarea_mejoras', nombre: 'Mejoras', icono: '🌿', descripcion: 'Proyectos y trabajos destinados a mejorar las instalaciones del hotel.' },
  { id: 'workarea_remodelacion', nombre: 'Remodelación', icono: '🏗️', descripcion: 'Renovación y modificación de espacios, con sus proyectos y registros asociados.' },
  { id: 'workarea_maquinas', nombre: 'Mantención de Máquinas', icono: '⚙️', descripcion: 'Consulta de equipos, sus históricos y las mantenciones registradas desde el sistema.' },
  { id: 'workarea_jardineria', nombre: 'Mantención de Jardinería', icono: '🌳', descripcion: 'Sectores, trabajos definidos, riego y labores de cuidado de jardines y áreas verdes.' }
];
const areaFuentes = Object.create(null);
const areaConsultas = Object.create(null);
const areaTareas = Object.create(null);
const areaTareasSecuencia = Object.create(null);
let areaFichaSecuencia = 0;
let areaFichaSeleccionada = null;

function areaEsc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function areaTexto(valor, vacio = 'Sin dato registrado') {
  return areaEsc(valor === null || valor === undefined || String(valor).trim() === '' ? vacio : valor);
}
function areaFecha(valor) {
  return formatearFechaCL(valor,{vacio:'Sin fecha registrada',invalida:areaTexto(valor,'Sin fecha registrada'),civil:true});
}
function areaFuente(id) {
  if (id === 'workarea_general') return areaGeneralCarga;
  if (id === 'workarea_maquinas') return { estado: mqaCarga.estado, datos: mqaCarga };
  return areaFuentes[id] || { estado: 'cargando' };
}
async function areaCargarFuente(id, force = false) {
  if (areaConsultas[id]) return areaConsultas[id];
  if (!force && id !== 'workarea_reactiva' && ['listo','vacio','no_conectado'].includes(areaFuente(id).estado)) return areaFuente(id);
  areaConsultas[id] = (async () => {
    if (id === 'workarea_general') return areaGeneralCargarResumen(force);
    if (id === 'workarea_maquinas') return mqaCargarCatalogo(force);
    areaFuentes[id] = { estado: 'cargando' };
    try {
      let datos;
      if (id === 'workarea_reactiva') {
        const total = await window.MantencionesReactivasService.contar();
        if (!Number.isInteger(total) || total < 0) throw Error('Conteo incompleto');
        datos = { total };
      } else if (id === 'workarea_jardineria') {
        datos = await window.MantencionesService.getJardineria(force);
        if (!datos || !['sectores','trabajos','riegoProgramacion','riegoZonas','riegoNotas','laboresComplementarias'].every(k => Array.isArray(datos[k]))) throw Error('Respuesta incompleta');
      } else {
        const servicio = id === 'workarea_mejoras' ? window.MejorasService : window.RemodelacionesService;
        datos = await servicio.getProyectos(force);
        if (!Array.isArray(datos) || datos.some(p => !p || typeof p.id !== 'string')) throw Error('Respuesta incompleta');
        if (id === 'workarea_mejoras' && typeof setProyectosMejorasReales === 'function') setProyectosMejorasReales(datos);
      }
      areaFuentes[id] = { estado: 'listo', datos };
      delete areaTareas[id];
      areaTareasSecuencia[id] = (areaTareasSecuencia[id] || 0) + 1;
    } catch (_) {
      areaFuentes[id] = { estado: 'error' };
      if (id === 'workarea_mejoras' && typeof setProyectosMejorasReales === 'function') setProyectosMejorasReales(null);
    }
    return areaFuente(id);
  })();
  try { return await areaConsultas[id]; } finally { delete areaConsultas[id]; }
}
async function areaCargarFuentes(force = false) {
  await Promise.all(AREA_FICHAS.map(a => areaCargarFuente(a.id, force)));
}
function areaMensajeFuente(id) {
  const fuente = areaFuente(id);
  if (fuente.estado === 'error') return '<p role="alert" class="text-rose-600 dark:text-rose-400">Error al consultar Supabase. No se puede determinar la información disponible.</p>';
  if (fuente.estado === 'cargando') return '<p role="status">Cargando información…</p>';
  return '';
}
function areaActivos(lista) { return lista.filter(x => x && x.activo !== false && !x.es_fila_vacia_original); }
function areaIndicadoresHTML(id) {
  const fallo = areaMensajeFuente(id);
  if (fallo) return fallo;
  const fuente = areaFuente(id);
  if (id === 'workarea_general') return areaGeneralResumenHTML();
  if (id === 'workarea_reactiva') return '<p>Mantenciones registradas: <strong>' + fuente.datos.total + '</strong></p>';
  let metricas;
  if (id === 'workarea_maquinas') metricas = [['Equipos', mqaCarga.equipos.length], ['Mantenciones históricas', mqaCarga.mantenciones.length]];
  else if (id === 'workarea_jardineria') metricas = [['Sectores', areaActivos(fuente.datos.sectores).length], ['Trabajos definidos', areaActivos(fuente.datos.trabajos).length], ['Labores complementarias', areaActivos(fuente.datos.laboresComplementarias).length]];
  else metricas = [['Proyectos registrados', fuente.datos.length]];
  return `${metricas.every(([,v]) => v === 0) ? '<p>Sin registros en los grupos consultados.</p>' : ''}<div class="alm-mini-stats grid grid-cols-2 gap-2">${metricas.map(([etiqueta,valor]) => `<div class="alm-mini-stat bg-slate-50 dark:bg-slate-800 rounded-xl p-3"><p class="text-[10px] font-bold uppercase">${etiqueta}</p><p class="text-xl font-black text-slate-900 dark:text-white">${valor}</p></div>`).join('')}</div>`;
}
function areaTarjetaMetricasHTML(id) {
  const fallo = areaMensajeFuente(id);
  if (fallo) return fallo;
  const fuente = areaFuente(id);
  let metricas;
  if (id === 'workarea_general') {
    const r = fuente.resumen;
    metricas = [['Elementos del catálogo', r.elementos], ['Mantenciones históricas', r.mantenciones], ['Fichas de bodegas', r.inventarios]];
  } else if (id === 'workarea_reactiva') metricas = [['Mantenciones', fuente.datos.total]];
  else if (id === 'workarea_maquinas') metricas = [['Equipos', mqaCarga.equipos.length], ['Mantenciones históricas', mqaCarga.mantenciones.length]];
  else if (id === 'workarea_jardineria') metricas = [['Sectores', areaActivos(fuente.datos.sectores).length], ['Trabajos definidos', areaActivos(fuente.datos.trabajos).length], ['Labores complementarias', areaActivos(fuente.datos.laboresComplementarias).length]];
  else metricas = [['Proyectos registrados', fuente.datos.length]];
  return '<dl class="alm-area-metrics">' + metricas.map(([etiqueta, valor]) => '<div class="alm-area-metric"><dt>' + areaEsc(etiqueta) + '</dt><dd>' + valor + '</dd></div>').join('') + '</dl>';
}
function areaAbrirResumen(id) {
  if (id === 'workarea_general') navigateTo('mantenciones');
  else if (id === 'workarea_reactiva') navigateTo('areas', 'workarea_reactiva');
  else if (id === 'workarea_mejoras') navigateTo('mejoras');
  else if (id === 'workarea_remodelacion') navigateTo('remodelaciones');
  else if (id === 'workarea_maquinas') openAreaMaquinas();
  else if (id === 'workarea_jardineria') openAreaJardineria();
}
function areaTarjetasHTML() {
  const descripciones = {
    workarea_general: 'Catálogos, fichas e historiales de las instalaciones del hotel.',
    workarea_reactiva: 'Mantenciones registradas para atender fallas e imprevistos del hotel.',
    workarea_mejoras: 'Proyectos documentados para mejorar las instalaciones del hotel.',
    workarea_remodelacion: 'Proyectos y registros de renovación de los espacios del hotel.',
    workarea_maquinas: 'Equipos registrados y sus antecedentes de mantención.',
    workarea_jardineria: 'Sectores, trabajos definidos y labores de cuidado de jardines.'
  };
  return '<div class="alm-module-grid alm-area-summary-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">' + AREA_FICHAS.map(area =>
    '<article class="alm-module-card alm-area-summary"><span class="alm-module-icon" aria-hidden="true">' + area.icono + '</span>' +
    '<h4>' + areaEsc(area.nombre) + '</h4><p class="alm-area-description">' + descripciones[area.id] + '</p>' +
    '<div class="alm-area-values" aria-live="polite">' + areaTarjetaMetricasHTML(area.id) + '</div>' +
    '<footer><button type="button" data-area="' + area.id + '" onclick="areaAbrirResumen(this.dataset.area)" aria-label="Abrir ' + areaEsc(area.nombre) + '">Ir al módulo</button></footer></article>'
  ).join('') + '</div>';
}
function areaSeccionHTML(titulo, contenido) {
  return `<section class="space-y-3 pt-5 border-t border-slate-200 dark:border-slate-700"><h3 class="text-base font-black text-slate-900 dark:text-white">${titulo}</h3><div class="text-sm text-slate-600 dark:text-slate-300 space-y-3">${contenido}</div></section>`;
}
function areaBotonModulo(modulo, titulo) {
  return `<button type="button" data-modulo="${modulo}" onclick="areaAbrirModulo(this.dataset.modulo)" class="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">${titulo}</button>`;
}
function areaAbrirModulo(modulo) {
  if (!['mantenciones','mejoras','remodelaciones'].includes(modulo)) return;
  closeModal('modal-area-detail'); navigateTo(modulo);
}
function areaAbrirMaquinas() { closeModal('modal-area-detail'); openAreaMaquinas(); }
function areaAbrirReactiva() { closeModal('modal-area-detail'); navigateTo('areas', 'workarea_reactiva'); }
function areaAbrirProyecto(areaId, proyectoId) {
  const fuente = areaFuente(areaId);
  if (!['workarea_mejoras','workarea_remodelacion'].includes(areaId) || fuente.estado !== 'listo' || !fuente.datos.some(p => p.id === proyectoId)) return;
  closeModal('modal-area-detail');
  openTaskFromArea(areaId === 'workarea_mejoras' ? 'mejoras' : 'remodelaciones', proyectoId, areaId);
}
function areaProyectoBotonHTML(areaId, proyecto) {
  return `<button type="button" data-area="${areaEsc(areaId)}" data-proyecto="${areaEsc(proyecto.id)}" onclick="areaAbrirProyecto(this.dataset.area,this.dataset.proyecto)" class="text-xs font-bold text-blue-600 dark:text-blue-400 underline">Ver proyecto: ${areaTexto(proyecto.nombre ?? proyecto.name, 'Sin nombre registrado')}</button>`;
}
async function areaCargarTareas(id, force) {
  if (!['workarea_mejoras','workarea_remodelacion'].includes(id) || areaFuente(id).estado !== 'listo') return;
  if (!force && areaTareas[id]?.estado === 'listo') return;
  const secuencia = (areaTareasSecuencia[id] || 0) + 1;
  areaTareasSecuencia[id] = secuencia;
  try {
    const proyectos = areaFuente(id).datos;
    const ids = new Set(proyectos.map(p => p.id));
    const filas = id === 'workarea_mejoras'
      ? (await Promise.all(proyectos.map(p => window.MejorasService.getTareas(p.id, force)))).flat()
      : (proyectos.length ? await window.RemodelacionesService.getTareasRemodelaciones() : []);
    if (!Array.isArray(filas) || filas.some(t => !t || !ids.has(t.proyecto_id))) throw Error('Asociación de tareas no verificada');
    if (areaTareasSecuencia[id] === secuencia) areaTareas[id] = { estado:'listo', lista:filas };
  } catch (_) { if (areaTareasSecuencia[id] === secuencia) areaTareas[id] = { estado:'error' }; }
}
function areaTareasHTML(id, planificacion = false) {
  const consulta = areaTareas[id];
  if (consulta?.estado === 'error') return `<p role="alert" class="text-rose-600 dark:text-rose-400">Error al consultar las tareas asociadas en Supabase. No se puede determinar si hay planificación disponible.</p><button type="button" onclick="areaAbrirFicha('${id}',true)" class="px-4 py-2 rounded-xl bg-blue-600 text-white">Reintentar consulta</button>`;
  if (!consulta || !consulta.lista.length) return `<p>${planificacion ? 'No hay planificación asociada disponible en esta ficha.' : 'Sin tareas operativas conectadas a esta ficha. Los históricos y catálogos no se cuentan como tareas activas.'}</p>`;
  return `<p class="text-xs">Tareas asociadas a proyectos reales; se conserva su estado registrado, sin inferir atrasos ni porcentajes.</p><div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${consulta.lista.map(t => {
    const proyecto = areaFuente(id).datos.find(p => p.id === t.proyecto_id);
    const progreso = t.progreso !== null && t.progreso !== undefined && String(t.progreso).trim() !== '' ? Number(t.progreso) : NaN;
    return `<article class="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"><h4 class="font-bold">${areaTexto(t.titulo)}</h4><p>Estado: ${areaTexto(t.estado, 'Sin estado registrado')}</p>
      ${planificacion ? `<p>Inicio: ${areaFecha(t.fecha_inicio)} · Vencimiento: ${areaFecha(t.fecha_vencimiento)}</p><p>${Number.isFinite(progreso) && progreso >= 0 && progreso <= 100 ? 'Progreso registrado: '+progreso+'%' : 'Sin progreso registrado'}</p>` : `<p>${areaTexto(t.descripcion, 'Sin descripción registrada')}</p><p>Responsable: ${areaTexto(t.responsable_texto, 'Responsable no asignado')}</p>`}
      ${areaProyectoBotonHTML(id,proyecto)}</article>`;
  }).join('')}</div>`;
}
function areaContenidoFichaHTML(area) {
  const id = area.id, fuente = areaFuente(id), fallo = areaMensajeFuente(id);
  const proyectos = ['workarea_mejoras','workarea_remodelacion'].includes(id) && fuente.estado === 'listo' ? fuente.datos : [];
  let descripcion = `<p>${area.descripcion}</p>${fallo || areaIndicadoresHTML(id)}`;

  if (fallo) descripcion += `<button type="button" onclick="areaAbrirFicha('${id}',true)" class="px-4 py-2 rounded-xl bg-blue-600 text-white">Reintentar consulta</button>`;
  let tareas = fallo || areaTareasHTML(id);
  let plan = fallo || areaTareasHTML(id,true);
  let costos = fallo || '<p>Sin costos ni materiales operativos conectados a esta ficha. No se derivan importes de catálogos o históricos.</p>';
  let historial = fallo || '<p>Responsable del área no asignado mediante una fuente verificada.</p>';
  if (!fallo && proyectos.length) {
    descripcion += `<div class="space-y-3"><h4 class="font-bold">Proyectos registrados (no equivalen a tareas)</h4>${proyectos.map(p => `<article class="p-3 rounded-xl border border-slate-200 dark:border-slate-700">${areaProyectoBotonHTML(id,p)}<p>Estado: ${areaTexto(p.estado ?? p.status, 'Sin estado registrado')}</p></article>`).join('')}</div>`;
    historial += proyectos.map(p => `<div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700"><h4 class="font-bold">${areaTexto(p.nombre ?? p.name)}</h4>${Object.hasOwn(p,'responsable_texto') ? `<p>Responsable del proyecto: ${areaTexto(p.responsable_texto, 'Responsable no asignado')}</p><p>Inicio: ${areaFecha(p.fecha_inicio)} · Fin estimado: ${areaFecha(p.fecha_fin_estimada)}</p>` : '<p>Responsable y fechas: consultar la ficha existente del proyecto.</p>'}${areaProyectoBotonHTML(id,p)}</div>`).join('');
    if (id === 'workarea_remodelacion') {
      costos = '<p>Presupuestos registrados por proyecto. No representan automáticamente gastos reales. Los gastos y materiales se consultan en la ficha existente de cada proyecto.</p>';
      costos += proyectos.map(p => `<div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700">${areaProyectoBotonHTML(id,p)}${(p.presupuestosResumen || []).map(pr => `<p>Presupuesto ${areaTexto(pr.tipo)}: ${areaTexto(pr.total_con_iva, 'Sin importe registrado')}</p>`).join('') || '<p>Sin presupuesto registrado.</p>'}</div>`).join('');
    } else costos = '<p>Sin costos registrados a nivel de proyecto en la fuente conectada. No se sustituyen por presupuestos de otros registros.</p>';
  }
  if (!fallo && id === 'workarea_general') {
    historial += '<p>Los históricos importados y los registros operativos se consultan por separado en las fichas existentes, con su autoría y procedencia.</p>';
  }
  if (!fallo && id === 'workarea_maquinas') {
    historial += '<p>Catálogo real de equipos, históricos importados y mantenciones operativas separados, sin duplicar registros.</p>';
  }
  if (!fallo && id === 'workarea_jardineria') {
    const d=fuente.datos;
    tareas = `<p>${areaActivos(d.trabajos).length} trabajos definidos y ${areaActivos(d.laboresComplementarias).length} labores complementarias: contenido maestro, no ejecución ni tareas completadas.</p><p>Su detalle se consulta en la vista dedicada.</p>`;
    plan = `<p>Riego: ${areaActivos(d.riegoProgramacion).length} registros de programación, ${areaActivos(d.riegoZonas).length} zonas y ${areaActivos(d.riegoNotas).length} notas. Programación documental; no acredita riegos ejecutados ni avance operativo.</p>`;
    historial += '<p>Los registros originales permanecen en sus fuentes. La vista dedicada separa los movimientos históricos de Remo-cabaña sol, la tarea importada de aplicaciones y sus metadatos. Se conservan los accesos originales hasta validar visualmente la cobertura.</p>';
  }
  const accesos = {
    workarea_general: areaBotonModulo('mantenciones','Abrir Mantención General, subapartados y fichas'),
    workarea_mejoras: areaBotonModulo('mejoras','Ir a Mejoras'),
    workarea_remodelacion: areaBotonModulo('remodelaciones','Ir a Remodelaciones'),
    workarea_maquinas: '<button type="button" onclick="areaAbrirMaquinas()">Abrir catálogo de máquinas e historial</button>',
    workarea_jardineria: '<button type="button" onclick="openAreaJardineria()">Abrir Mantención de Jardinería</button>',
    workarea_reactiva: '<button type="button" onclick="areaAbrirReactiva()" class="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">Ir a Mantención Reactiva</button>'
  };
  return '<div class="alm-ui alm-area-actions">'+accesos[id]+'</div>'+areaSeccionHTML('Descripción del área y su objetivo',descripcion)+areaSeccionHTML('Tareas activas y su estado',tareas)+areaSeccionHTML('Línea de tiempo / Carta Gantt',plan)+areaSeccionHTML('Costos y materiales asociados',costos)+areaSeccionHTML('Responsable e historial',historial);
}
async function areaAbrirFicha(id, force = false) {
  const area=AREA_FICHAS.find(a => a.id === id);
  if (!area) return;
  const contenido=document.getElementById('area-modal-content');
  if (!contenido) return;
  const secuencia=++areaFichaSecuencia;
  areaFichaSeleccionada=id;
  contenido.innerHTML=`<header class="alm-ui alm-area-detail-header rounded-t-3xl p-6 flex justify-between gap-3"><div class="flex items-start gap-3 min-w-0"><span class="alm-area-detail-icon" aria-hidden="true">${area.icono}</span><div class="min-w-0"><h2 class="text-xl font-black">Ficha de Área: ${area.nombre}</h2><p class="text-sm mt-1">${area.descripcion}</p></div></div><button type="button" onclick="closeModal('modal-area-detail')" aria-label="Cerrar ficha" class="text-2xl">×</button></header><div id="area-ficha-cuerpo" class="p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-b-3xl space-y-6"><p role="status">Cargando información del área…</p></div>`;
  openModal('modal-area-detail'); contenido.scrollTop=0;
  await areaCargarFuente(id,force);
  await areaCargarTareas(id,force);
  const overlay=document.getElementById('modal-area-detail');
  if (secuencia !== areaFichaSecuencia || document.getElementById('area-modal-content') !== contenido || overlay?.classList.contains('hidden')) return;
  document.getElementById('area-ficha-cuerpo').innerHTML=areaContenidoFichaHTML(area);
  const tarjetas=document.getElementById('area-tarjetas');
  if(tarjetas)tarjetas.innerHTML=areaTarjetasHTML();
}

function renderReactivaView() {
  return renderMantencionesReactivasView();
}

function renderAreasView() {
  if (typeof areaSubVista !== 'undefined' && areaSubVista === 'jardineria') return renderJardineriaAreaView();
  if (typeof areaSubVista !== 'undefined' && areaSubVista === 'maquinas') return renderMaquinasView();
  // La entrada antigua se resuelve en el router; nunca renderizar su cuadrícula.
  return renderMaintenancesView();
}

// ==========================================================
// MANTENCIÓN DE MÁQUINAS (catálogo de Supabase)
// ==========================================================
// La tarjeta "Mantención de Máquinas" ya NO muestra tareas del mock
// global (state.maintenances / data/mockData.js) ni KPIs, gastos,
// responsables ni alertas simulados: abre una VISTA INTERNA de pantalla
// completa dentro de Áreas de Trabajo (sin opción nueva en la barra
// lateral) con el catálogo REAL de la hoja MAQUINAS de
// LISTA DE MANTENCIONES.xlsx (48 equipos y 110 mantenciones históricas;
// cifras derivadas de la carga, NUNCA hardcodeadas). El Catálogo General
// de Mantención General excluye esa misma hoja, por lo que no hay
// duplicación de vistas.
//
// REGLAS DE ESTA SECCIÓN:
// - Solo LECTURA de Supabase (métodos dedicados del service):
//   getElementosMaquinas / getMantencionesMaquinas /
//   getElementoDetalleMaquinas. No se mueven ni copian registros: los UUID
//   y relaciones existentes se preservan tal cual.
// - Navegación con el mecanismo EXISTENTE de la SPA: navigateTo() →
//   renderCurrentView() → renderAreasView() con la sub-vista
//   areaSubVista === 'maquinas' (js/state.js). Nada de rutas nuevas ni
//   modales encadenadas.
// - Estado AISLADO con prefijo mqa_ para no colisionar con los módulos
//   mutables del Catálogo General (mntElementosBase,
//   mntResumenHistorialElementos, mantencionFiltrosElementos,
//   mantencionElementoSeleccionado).
// - Se reutilizan SOLO componentes puros de js/views/mantenciones.js
//   (mntEsc, mntSinDato, mntEtiquetaCategoria, mntNombreUbicacion,
//   mntEtiquetaCodigo, mntFormatoFechaCorta, mntCampoFichaHTML,
//   mntFichaElementoHTML, mntResumenHistorialPorElemento): todos reciben
//   sus datos por parámetro y no leen estado global. mntTarjetaElementoHTML
//   NO se reutiliza porque usa el estado global del Catálogo General y su
//   onclick abre la ficha de ese subapartado.
// - Reglas NULL: texto → "Sin dato registrado", fecha → "Sin fecha
//   registrada", responsable → "Sin responsable registrado". Nunca NULL→0.

// Estado del catálogo de Máquinas (aislado de Mantención General).
let mqaCarga = { estado: 'cargando', equipos: [], mantenciones: [] };
let mqaResumen = Object.create(null);
let mqaFiltro = { texto: '', ubicacion: '' };
let mqaActualizarCalendario = null;
let mqaTareas = null;

function mqaPuedeVerTareas(carga = mqaTareas) {
  return Boolean(carga?.contenedor.isConnected && carga.actor &&
    carga.actor === state.currentUser?.id && (window.GestionTareas?.habilitada
      ? window.GestionTareas.puede() : esAdminOperativoActual()));
}

async function mqaCargarTareas() {
  const carga = mqaTareas;
  if (!mqaPuedeVerTareas(carga) || mqaCarga.estado !== 'listo' ||
      carga.estado === 'cargando' || carga.estado === 'listo') return;
  carga.estado = 'cargando';
  try {
    const ids = mqaCarga.equipos.map(equipo => equipo.id);
    const filas = window.GestionTareas?.habilitada
      ? await gestionTareasDeMaquinas(ids)
      : await window.TareasPendientesService.listarDeMaquinas(ids);
    if (!mqaPuedeVerTareas(carga) || mqaTareas !== carga) {
      carga.estado = 'idle';
      return;
    }
    carga.filas = filas;
    carga.estado = 'listo';
  } catch {
    carga.estado = 'error';
  } finally {
    if (mqaTareas === carga && carga.contenedor.isConnected) {
      mqaActualizarCalendario?.();
      const seccion = carga.contenedor.querySelector('[data-mqa-tareas-ficha]');
      if (seccion) seccion.innerHTML = mqaTareasFichaHTML();
      if (carga.recargar) {
        carga.recargar = false;
        carga.estado = 'idle';
        mqaCargarTareas();
      }
    }
  }
}

function mqaProgramarTarea(id) {
  const carga = mqaTareas;
  const equipo = mqaCarga.equipos.find(fila => fila.id === id);
  if (!mqaPuedeVerTareas(carga) || !esAdminOperativoActual() || mqaSeleccionado !== id || !equipo) return;
  gestionAbrirDesdeEquipo(equipo.id, equipo.nombre_original || equipo.nombre);
}

function mqaTareasVisibles() {
  return mqaPuedeVerTareas() ? mqaTareas.filas : [];
}

function mqaTareaHTML(tarea) {
  const estado = window.GestionTareas?.habilitada ? gestionEstado(tarea)
    : tarea.estado === 'completada' ? 'Tarea completada' : 'Tarea pendiente';
  return `
    <p class="text-xs font-semibold alm-muted">${estado}</p>
    <h4 class="font-bold break-words">${mntEsc(tarea.titulo)}</h4>
    <p class="text-sm alm-muted">Fecha límite: ${mntEsc(formatDate(tarea.fecha_limite))}</p>
    ${tarea.descripcion ? `<p class="text-sm whitespace-pre-wrap break-words">${mntEsc(tarea.descripcion)}</p>` : ''}`;
}

function mqaTareasFichaHTML() {
  if (!mqaPuedeVerTareas()) return '';
  const filas = mqaTareasVisibles().filter(tarea => tarea.equipo_id === mqaSeleccionado);
  const aviso = mqaTareas.estado === 'error' ? 'No se pudieron cargar las tareas vinculadas.'
    : mqaTareas.estado === 'listo' ? 'Este equipo no tiene tareas vinculadas.' : 'Cargando tareas vinculadas…';
  return `<section class="space-y-2 mt-4">
    <h3 class="alm-title">Tareas vinculadas</h3>
    ${filas.length ? filas.map(tarea => `<article class="alm-panel p-4 space-y-2">${mqaTareaHTML(tarea)}</article>`).join('')
      : `<p class="alm-muted" role="status">${aviso}</p>`}
  </section>`;
}

function mqaEventosTareas(equipos, tareas) {
  const porEquipo = new Map(equipos.map(equipo => [equipo.id, equipo]));
  const eventos = new Map();
  for (const tarea of tareas) {
    const equipo = porEquipo.get(tarea.equipo_id);
    if (!tarea.id || !equipo || !/^\d{4}-\d{2}-\d{2}$/.test(tarea.fecha_limite)) continue;
    eventos.set(tarea.id, { fecha: tarea.fecha_limite, equipo, tarea });
  }
  return [...eventos.values()];
}
let mqaSeleccionado = null;
let mqaDetalle = { estado: 'idle', dato: null };

// Carga (o reutiliza la caché) del catálogo real. force = true fuerza una
// nueva lectura de Supabase (botón "Reintentar").
async function mqaCargarCatalogo(force = false) {
  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está disponible.');
    }

    if (!force && mqaCarga.estado === 'listo') return mqaCarga;

    mqaCarga = { estado: 'cargando', equipos: [], mantenciones: [] };

    const [equipos, mantenciones] = await Promise.all([
      window.MantencionesService.getElementosMaquinas(force),
      window.MantencionesService.getMantencionesMaquinas(force)
    ]);

    mqaCarga = {
      estado: 'listo',
      equipos: Array.isArray(equipos) ? equipos : [],
      mantenciones: Array.isArray(mantenciones) ? mantenciones : []
    };

    // Resumen derivado (cantidad y última fecha REALES por equipo).
    mqaResumen = mntResumenHistorialPorElemento(mqaCarga.mantenciones);

    return mqaCarga;

  } catch (e) {
    console.error('Error cargando catálogo de Máquinas:', e);
    mqaCarga = { estado: 'error', equipos: [], mantenciones: [], error: e };
    mqaResumen = Object.create(null);
    return mqaCarga;
  }
}

// ------------------------------------------------------------
// TARJETA DE ÁREA (sin datos simulados)
// ------------------------------------------------------------
// Mantiene el estilo visual de las otras tarjetas de Áreas de Trabajo,
// pero en lugar de KPIs/gastos/alertas del mock muestra el catálogo real.
function mqaTarjetaAreaHTML(area, carga) {
  const listo = carga && carga.estado === 'listo';

  const resumenReal = listo ? `
    <div class="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
      <div class="bg-slate-50 dark:bg-slate-800/90 group-hover:bg-blue-50/50 rounded-xl p-2.5 text-center border border-slate-100 dark:border-slate-700/80 transition-colors">
        <p class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">Equipos</p>
        <p class="text-base font-black text-slate-900 dark:text-white">${carga.equipos.length}</p>
      </div>
      <div class="bg-slate-50 dark:bg-slate-800/90 group-hover:bg-blue-50/50 rounded-xl p-2.5 text-center border border-slate-100 dark:border-slate-700/80 transition-colors">
        <p class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">Mantenciones históricas</p>
        <p class="text-base font-black text-emerald-600 dark:text-emerald-400">${carga.mantenciones.length}</p>
      </div>
    </div>
  ` : carga && carga.estado === 'error' ? `
    <div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
      <p class="text-[11px] font-bold text-rose-600 dark:text-rose-400">No se pudo cargar el catálogo real desde Supabase.</p>
    </div>
  ` : `
    <div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
      <p class="text-[11px] font-bold text-slate-500 dark:text-slate-400">Cargando catálogo real...</p>
    </div>
  `;

  return `
    <div onclick="openAreaDetail('workarea_maquinas')"
         class="bg-white rounded-3xl p-6 border-2 border-slate-200 hover:border-blue-500 transition-all cursor-pointer card-hover flex flex-col justify-between group relative overflow-hidden shadow-sm hover:shadow-xl">

      <div>
        <div class="flex items-center justify-between mb-3">
          <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-inner transition-transform group-hover:scale-110 bg-slate-100 group-hover:bg-blue-50">
            ${area.icon}
          </div>

          <span class="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-extrabold px-2.5 py-1 rounded-full">
            📋 Catálogo real
          </span>
        </div>

        <h4 class="text-xl font-extrabold text-slate-900 mt-4 group-hover:text-blue-600 transition-colors flex items-center justify-between">
          <span>${area.name}</span>
          <span class="text-slate-400 group-hover:text-blue-600 transition-colors text-base">↗</span>
        </h4>

        <p class="text-xs text-slate-800 dark:text-slate-300 font-semibold mt-1.5 leading-relaxed">
          ${area.description}
        </p>

        ${area.bullets && area.bullets.length > 0 ? `
          <ul class="mt-2.5 space-y-1 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/90 group-hover:bg-blue-50/40 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-700/80 transition-colors">
            ${area.bullets.map(b => `
              <li class="flex items-start space-x-1.5">
                <span class="text-blue-600 dark:text-blue-400 font-bold text-[11px] leading-tight">•</span>
                <span class="text-[11px] font-medium text-slate-700 dark:text-slate-200">${b}</span>
              </li>
            `).join('')}
          </ul>
        ` : ''}

        ${resumenReal}
      </div>

      <div class="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:text-blue-700">
        <span>Ver ficha del área y acceso al catálogo de máquinas</span>

      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// VISTA INTERNA (PANTALLA COMPLETA) DEL CATÁLOGO DE MÁQUINAS
// ------------------------------------------------------------
// C2E-4D: reemplaza la modal de C2E-4C. Usa el MISMO mecanismo de
// navegación de la SPA (navigateTo → renderCurrentView → renderAreasView
// con la sub-vista areaSubVista === 'maquinas'), sin modal y sin opción
// nueva en la barra lateral: la barra sigue marcando "Áreas de Trabajo".
// Se entra desde la tarjeta de Mantención de Máquinas (y desde el acceso
// rápido de Mantención General) y se sale con "← Volver a Áreas".
function openAreaMaquinas() {
  // Se parte SIEMPRE del listado (la ficha no se hereda entre visitas);
  // los FILTROS se conservan en mqaFiltro.
  mqaSeleccionado = null;
  mqaDetalle = { estado: 'idle', dato: null };
  // C2E-4E4 / F6: se descarta el contexto operativo de Máquinas para que
  // no quede disponible ninguna mantención de una ficha ya cerrada.
  mntLimpiarOperativasFichaActual();
  mntLimpiarContextoOperativas('maquinas');
  navigateTo('areas', null, 'maquinas');
}

// Botón "← Volver a Áreas de Trabajo": devuelve las seis tarjetas.
function mqaVolverAAreas() {
  mqaSeleccionado = null;
  mqaDetalle = { estado: 'idle', dato: null };
  mntLimpiarOperativasFichaActual();
  mntLimpiarContextoOperativas('maquinas');
  navigateTo('mantenciones');
}

// Render de la sub-vista (mismo patrón loader + carga asíncrona que
// renderAreasView; ids propios para no interferir con las tarjetas).
function renderMaquinasView() {
  setTimeout(async () => {
    const loader = document.getElementById('areas-maq-loader');
    const container = document.getElementById('areas-maq-content');
    if (!loader || !container) return;

    const actor = state.currentUser?.id;
    await mqaCargarCatalogo();
    if (document.getElementById('areas-maq-content') !== container || actor !== state.currentUser?.id) return;
    mqaTareas = { contenedor: container, actor, estado: 'idle', filas: [] };
    container.innerHTML = mqaVistaHTML();
    mqaIniciarPestanas(container);
    mqaCargarTareas();
    loader.classList.add('hidden');
    container.classList.remove('hidden');
  }, 0);

  return `
    ${uiCargandoHTML("areas-maq-loader")}
    <div id="areas-maq-content" class="hidden w-full"></div>
  `;
}

// Encabezado de la sub-vista + contenedor del cuerpo (listado o ficha).
// Ancho COMPLETO del contenido principal (sin max-w-7xl, a diferencia de
// la cuadrícula de las áreas).
function mqaVistaHTML() {
  const area = (state.workAreas || DEFAULT_WORK_AREAS).find(a => a.id === 'workarea_maquinas')
    || DEFAULT_WORK_AREAS.find(a => a.id === 'workarea_maquinas');

  let contadores;
  if (mqaCarga.estado === 'listo') {
    // Conteos REALES derivados de la carga (nunca hardcodeados).
    contadores = `
      <div class="alm-summary-grid grid grid-cols-2 gap-3">
        <div class="alm-mini-stat alm-summary-card bg-slate-50 rounded-2xl border border-slate-200 p-3.5 text-center">
          <p class="alm-summary-label text-[10px] font-bold text-slate-500 uppercase">Equipos</p>
          <p class="alm-summary-value text-2xl font-black text-slate-900 mt-0.5">${mqaCarga.equipos.length}</p>
        </div>
        <div class="alm-mini-stat alm-summary-card bg-slate-50 rounded-2xl border border-slate-200 p-3.5 text-center">
          <p class="alm-summary-label text-[10px] font-bold text-slate-500 uppercase">Mantenciones históricas</p>
          <p class="alm-summary-value text-2xl font-black text-emerald-600 mt-0.5">${mqaCarga.mantenciones.length}</p>
        </div>
      </div>`;
  } else if (mqaCarga.estado === 'error') {
    contadores = `
      <div class="w-full sm:w-auto sm:min-w-[260px] bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-center">
        <p class="text-xs font-bold text-rose-700">No se pudo cargar el catálogo real desde Supabase.</p>
        <button onclick="mqaRecargar()" class="mt-2 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[11px] font-bold transition-colors">Reintentar</button>
      </div>`;
  } else {
    contadores = `
      <div class="w-full sm:w-auto sm:min-w-[260px] bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-center space-x-2">
        <span class="animate-spin text-sm text-blue-600">⏳</span>
        <span class="text-xs font-bold text-slate-500">Cargando datos reales...</span>
      </div>`;
  }

  return `
    <div class="alm-ui alm-main-page alm-module-page alm-machines w-full pb-12 space-y-5">

      ${uiEncabezadoSeccion('Mantención de Máquinas',area && area.description ? area.description : '', 'settings')}
      <div class="flex flex-wrap gap-2" aria-label="Vistas de Mantención de Máquinas">
        <button type="button" data-mqa-pestana="calendario" aria-pressed="true" aria-controls="mqa-vista-calendario" class="alm-btn-primary px-4 py-2">Calendario</button>
        <button type="button" data-mqa-pestana="equipos" aria-pressed="false" aria-controls="mqa-vista-equipos" class="alm-btn-secondary px-4 py-2">Equipos e historial</button>
      </div>
      <section id="mqa-vista-calendario" class="w-full max-w-7xl mx-auto space-y-2">
        ${calendarioMensualHTML({ oculto: true })}
        <div data-mqa-eventos class="space-y-2"></div>
      </section>
      <section id="mqa-vista-equipos" class="space-y-5" hidden>
        ${contadores}
        <div class="alm-panel bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <div id="mqa-cuerpo">${mqaCuerpoHTML()}</div>
        </div>
      </section>
    </div>
  `;
}

function mqaEventosHistoricos(equipos, mantenciones) {
  const porEquipo = new Map(equipos.map(equipo => [equipo.id, equipo]));
  const eventos = new Map();
  for (const fila of mantenciones) {
    const equipo = porEquipo.get(fila.elemento_id);
    const fecha = fila.fecha_realizacion;
    if (!fila.id || !equipo || eventos.has(fila.id) || fila.fecha_precision !== 'DIA' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
        calendarioFechaCivilLocal(new Date(fecha + 'T12:00:00')) !== fecha) continue;
    eventos.set(fila.id, { fecha, equipo, fila });
  }
  return [...eventos.values()];
}

function mqaIniciarPestanas(contenedor) {
  const vistaCalendario = contenedor.querySelector('#mqa-vista-calendario');
  const vistaEquipos = contenedor.querySelector('#mqa-vista-equipos');
  const pestanas = contenedor.querySelectorAll('[data-mqa-pestana]');
  const calendario = vistaCalendario.querySelector('[data-calendario]');
  const lista = vistaCalendario.querySelector('[data-mqa-eventos]');
  const formatoDia = new Intl.DateTimeFormat('es-CL', { dateStyle: 'full' });
  let eventos = [];

  function activar(vista) {
    vistaCalendario.hidden = vista !== 'calendario';
    vistaEquipos.hidden = vista !== 'equipos';
    for (const boton of pestanas) {
      const activa = boton.dataset.mqaPestana === vista;
      boton.setAttribute('aria-pressed', String(activa));
      boton.classList.toggle('alm-btn-primary', activa);
      boton.classList.toggle('alm-btn-secondary', !activa);
    }
  }

  function pintarDia() {
    const dia = mensual.dia;
    const actividades = [...eventos, ...mqaEventosTareas(mqaCarga.equipos, mqaTareasVisibles())];
    mensual.pintar(actividades, calendarioFechaCivilLocal());
    const filas = actividades.filter(evento => evento.fecha === dia);
    const aviso = mqaPuedeVerTareas() && mqaTareas.estado === 'error'
      ? '<p class="alm-muted" role="status">No se pudieron cargar las tareas vinculadas. <button type="button" class="alm-btn-secondary px-3 py-2" onclick="mqaCargarTareas()">Reintentar</button></p>' : '';
    lista.innerHTML = `<h3 class="alm-title">${mntEsc(formatDate(dia))}</h3>
      ${aviso}
      ${filas.length ? filas.map(({ equipo, fila, tarea }) => `<article class="alm-panel p-4 space-y-2">
        ${tarea ? `${mqaTareaHTML(tarea)}
          <p class="text-sm alm-muted break-words">Equipo: ${mntEsc(mntSinDato(equipo.nombre_original))}</p>` : `
        <p class="text-xs font-semibold alm-muted">Mantención histórica realizada</p>
        <h4 class="font-bold break-words">${mntEsc(mntSinDato(equipo.nombre_original))}</h4>
        ${fila.detalle_trabajo ? `<p class="text-sm break-words">${mntEsc(fila.detalle_trabajo)}</p>` : ''}
        ${fila.responsable_texto ? `<p class="text-sm alm-muted break-words">Responsable: ${mntEsc(fila.responsable_texto)}</p>` : ''}
        `}
        <button type="button" class="alm-btn-secondary px-3 py-2" data-mqa-equipo="${mntEsc(equipo.id)}">Ver ficha del equipo</button>
      </article>`).join('') : '<p class="alm-panel p-5 alm-muted">No hay actividades registradas para este día.</p>'}`;
  }

  const mensual = iniciarCalendarioMensual(calendario, {
    fechaRegistro: evento => evento.fecha,
    etiquetaCantidad: cantidad => cantidad +
      (cantidad === 1 ? ' actividad de Máquinas' : ' actividades de Máquinas'),
    alSeleccionar: pintarDia,
    colorearVencimientos: false,
    // La tarea aporta su estado; una mantención con fecha de realización es histórica completada.
    estadoRegistro: evento => evento.tarea ? evento.tarea.estado : evento.fila ? 'completada' : null
  });

  for (const boton of pestanas) boton.onclick = () => {
    const vista = boton.dataset.mqaPestana;
    if (vista === 'equipos' && !vistaCalendario.hidden && mqaSeleccionado) mqaVolverAlListado();
    activar(vista);
    if (vista === 'calendario') mqaActualizarCalendario?.();
  };
  lista.onclick = evento => {
    const id = evento.target.closest('[data-mqa-equipo]')?.dataset.mqaEquipo;
    if (!id || !mqaCarga.equipos.some(equipo => equipo.id === id)) return;
    activar('equipos');
    mqaAbrirFichaEquipo(id);
    [...pestanas].find(boton => boton.dataset.mqaPestana === 'equipos')?.focus();
  };

  mqaActualizarCalendario = () => {
    if (!contenedor.isConnected) return;
    calendario.hidden = mqaCarga.estado !== 'listo';
    if (calendario.hidden) {
      lista.innerHTML = '<div class="alm-panel p-5 space-y-2"><p role="status">No se pudo cargar el historial de Máquinas.</p><button type="button" class="alm-btn-secondary px-3 py-2" onclick="mqaRecargar()">Reintentar</button></div>';
      return;
    }
    eventos = mqaEventosHistoricos(mqaCarga.equipos, mqaCarga.mantenciones);
    pintarDia();
  };
  mqaActualizarCalendario();
}

function mqaRepintarCuerpo() {
  const cont = document.getElementById('mqa-cuerpo');
  if (!cont) return;
  cont.innerHTML = mqaCuerpoHTML();
}

// Cuerpo: listado (con filtros) o ficha individual si hay selección.
function mqaCuerpoHTML() {
  return mqaSeleccionado ? mqaFichaHTML() : mqaListadoHTML();
}

function mqaListadoHTML() {
  if (mqaCarga.estado === 'error') {
    return `
      <div class="text-center py-10 space-y-3">
        <span class="text-4xl block">⚠️</span>
        <p class="text-sm font-bold text-slate-700">No se pudo cargar el catálogo de máquinas desde Supabase.</p>
        <p class="text-xs text-slate-500">Verifica la conexión e intenta nuevamente.</p>
        <button onclick="mqaRecargar()" class="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors">Reintentar</button>
      </div>
    `;
  }

  if (mqaCarga.estado !== 'listo') {
    return `
      ${uiCargandoHTML()}
    `;
  }

  const filtrados = mqaFiltrar(mqaCarga.equipos);

  return `
    <!-- TÍTULO DEL LISTADO -->
    <div class="flex items-center space-x-2 mb-4">
      <span class="text-xl">📋</span>
      <div>
        <h4 class="text-base font-black text-slate-900">Catálogo de equipos</h4>
        <p class="text-xs text-slate-500">Nombre real, ubicación, identificador original e historial importado del Excel.</p>
      </div>
    </div>

    <!-- BUSCADOR Y FILTROS -->
    <div class="flex flex-col sm:flex-row gap-3 mb-5">
      <div class="flex-1">
        <label class="block text-[10px] font-black uppercase tracking-wide text-slate-500 mb-1">Buscar equipo</label>
        <input id="mqa-buscar" type="text" value="${mntEsc(mqaFiltro.texto)}"
               placeholder="Buscar por nombre, ubicación o número original..."
               oninput="mqaOnBuscar(this.value)"
               class="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none text-sm font-semibold bg-slate-50" />
      </div>
      <div class="sm:w-56">
        <label class="block text-[10px] font-black uppercase tracking-wide text-slate-500 mb-1">Ubicación</label>
        <select id="mqa-ubicacion" onchange="mqaOnFiltrarUbicacion(this.value)"
                class="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none text-sm font-semibold bg-slate-50">
          ${mqaOpcionesUbicacionHTML()}
        </select>
      </div>
      <div class="flex items-end">
        <button onclick="mqaLimpiarFiltros()" class="px-4 py-2.5 rounded-xl border-2 border-slate-200 hover:border-blue-400 text-xs font-bold text-slate-600 transition-colors">Limpiar filtros</button>
      </div>
    </div>

    <!-- CONTADOR -->
    <p id="mqa-contador" class="text-xs font-bold text-slate-500 mb-4">
      ${filtrados.length} de ${mqaCarga.equipos.length} equipos
    </p>

    <!-- LISTADO (cuadrícula de tarjetas) -->
    <div id="mqa-listado" class="alm-record-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${mqaCuadriculaHTML(filtrados)}
    </div>
  `;
}

function mqaCuadriculaHTML(lista) {
  if (!lista || lista.length === 0) {
    return `
      <div class="col-span-full text-center py-8 bg-slate-50 rounded-2xl border border-slate-200">
        <span class="text-3xl block mb-2">🔍</span>
        <p class="text-sm font-bold text-slate-600">No se encontraron equipos con esos criterios.</p>
      </div>
    `;
  }
  return lista.map(mqaTarjetaEquipoHTML).join('');
}

// Tarjeta de un equipo del catálogo (nombre real, ubicación, número
// original, cantidad de mantenciones y última fecha; todo REAL).
function mqaTarjetaEquipoHTML(e) {
  const ubicacion = mntNombreUbicacion(e);
  const codigo = mntPrimerValor(e.codigo, e.nemotecnico);
  const reg = mqaResumen[e.id] || { cantidad: 0, ultimaFecha: null };
  const ultima = reg.ultimaFecha ? mntFormatoFechaCorta(reg.ultimaFecha) : null;

  return `
    <div onclick="mqaAbrirFichaEquipo('${e.id}')"
         class="alm-record-card p-4 bg-white rounded-2xl border border-slate-200 hover:border-blue-500 hover:shadow-md cursor-pointer transition-all group">
      <div class="flex items-start justify-between mb-2">
        <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-xl flex-shrink-0">⚙️</div>
        <span class="bg-slate-100 text-slate-600 text-[10px] font-black px-2 py-1 rounded-full truncate max-w-[60%]">${mntEsc(mntEtiquetaCategoria(e.hoja_origen))}</span>
      </div>
      <p class="alm-record-title text-sm font-extrabold text-slate-900 group-hover:text-blue-600" title="${mntEsc(mntSinDato(e.nombre_original))}">${mntEsc(mntSinDato(e.nombre_original))}</p>
      <p class="text-[11px] text-slate-500 font-semibold truncate">📍 ${mntEsc(mntSinDato(ubicacion))}</p>
      ${codigo !== null && codigo !== undefined && codigo !== '' ? `<p class="text-[11px] text-slate-500 font-semibold mt-0.5">${mntEsc(mntEtiquetaCodigo(e))}: <strong>${mntEsc(codigo)}</strong></p>` : ''}
      <div class="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold">
        <span class="text-slate-600">${reg.cantidad} ${reg.cantidad === 1 ? 'mantención' : 'mantenciones'}</span>
        <span class="${ultima ? 'text-slate-500' : 'text-slate-400'}">${ultima ? `Última: ${mntEsc(ultima)}` : 'Sin historial'}</span>
      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// FICHA INDIVIDUAL DE EQUIPO
// ------------------------------------------------------------
// Se pinta DENTRO de la misma vista interna (patrón "catálogo → ficha →
// volver", repintando #mqa-cuerpo), reutilizando mntFichaElementoHTML
// (puro) con su historial importado. Al volver se conservan los filtros.
//
// C2E-4E4 / F6 — se le entrega además el historial OPERATIVO con los
// mismos cuatro estados del Catálogo (sin integración / vacío / con datos
// / error con aviso y reintento), reutilizando el MISMO componente
// mntBloqueOperativasHTML y los MISMOS modales compartidos de F4/F5: no
// existe una segunda implementación de registro ni de anulación.
function mqaFichaHTML() {
  // Datos operativos de ESTA ficha; null solo si aún no se cargaron (por
  // ejemplo, durante la primera carga, donde se muestra el spinner).
  const operativas = (mqaDetalle.operativasOk === true && Array.isArray(mqaDetalle.operativas))
    ? mqaDetalle.operativas
    : null;
  const avisoOperativas = mqaDetalle.avisoOperativas || null;
  if (mqaDetalle.estado === 'error') {
    return `
      <div class="mb-4">
        <button onclick="mqaVolverAlListado()" class="text-xs font-bold text-blue-600 hover:text-blue-800">← Volver al catálogo</button>
      </div>
      <div class="text-center py-10 space-y-3">
        <span class="text-4xl block">⚠️</span>
        <p class="text-sm font-bold text-slate-700">No se pudo cargar el equipo desde Supabase.</p>
        <button onclick="mqaAbrirFichaEquipo('${mntEsc(mqaSeleccionado)}')" class="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors">Reintentar</button>
      </div>
    `;
  }

  if (mqaDetalle.estado !== 'listo' || !mqaDetalle.dato || !mqaDetalle.dato.elemento) {
    return `
      <div class="mb-4">
        <button onclick="mqaVolverAlListado()" class="text-xs font-bold text-blue-600 hover:text-blue-800">← Volver al catálogo</button>
      </div>
      <div class="flex flex-col items-center justify-center py-12 space-y-3">
        <span class="animate-spin text-3xl text-blue-600">⏳</span>
        <p class="text-xs font-bold text-slate-500">Cargando ficha del equipo...</p>
      </div>
    `;
  }

  return `
    <div class="mb-4">
      <button onclick="mqaVolverAlListado()" class="text-xs font-bold text-blue-600 hover:text-blue-800">← Volver al catálogo</button>
    </div>
    ${mntFichaElementoHTML(mqaDetalle.dato, [], operativas, avisoOperativas, { programarTarea: mqaPuedeVerTareas() && esAdminOperativoActual() })}
    <div data-mqa-tareas-ficha>${mqaTareasFichaHTML()}</div>
  `;
}

async function mqaAbrirFichaEquipo(id) {
  mqaSeleccionado = id;
  mqaDetalle = { estado: 'cargando', dato: null };
  // C2E-4E4 / F6: mientras carga la ficha NO hay historial operativo
  // disponible: se limpia el contexto de Máquinas para que no quede
  // anulable nada de la ficha anterior.
  mntLimpiarOperativasFichaActual();
  mntLimpiarContextoOperativas('maquinas');
  mqaRepintarCuerpo();

  try {
    if (!window.MantencionesService) {
      throw new Error('MantencionesService no está disponible.');
    }

    // C2E-4E4 / F6 — en paralelo: detalle histórico (sin cambios) y
    // historial OPERATIVO de ESTE equipo, con los tres resultados
    // explícitos del helper compartido (ok vacío / ok con datos / error).
    // Un fallo de lectura NO oculta la ficha ni el historial de Excel.
    const [detalle, resOperativas] = await Promise.all([
      window.MantencionesService.getElementoDetalleMaquinas(id),
      mntCargarEstadoOperativasFicha(id)
    ]);

    // El usuario pudo volver al listado mientras cargaba.
    if (mqaSeleccionado !== id) return;
    mqaDetalle = {
      estado: 'listo',
      dato: detalle,
      operativasOk: resOperativas.ok,
      operativas: resOperativas.lista,
      avisoOperativas: resOperativas.aviso
    };

    // Contexto DEFENSIVO de Máquinas: el Map de operativas refleja SOLO lo
    // que se está mostrando en ESTA ficha, y esta ficha pasa a ser la
    // operativa ACTIVA (los modales compartidos repintarán #mqa-cuerpo y
    // este equipo, nunca los del Catálogo).
    if (resOperativas.ok) {
      mntGuardarOperativasFichaActual(resOperativas.lista);
    } else {
      mntLimpiarOperativasFichaActual();
    }
    mntFijarContextoOperativas({
      origen: 'maquinas',
      elementoId: id,
      contenedorId: 'mqa-cuerpo',
      elemento: (detalle && detalle.elemento) ? detalle.elemento : null,
      repintar: () => mqaRepintarFichaOperativa(id, true)
    });
  } catch (e) {
    console.error('Error cargando ficha de equipo:', e);
    if (mqaSeleccionado !== id) return;
    mqaDetalle = { estado: 'error', dato: null };
  }

  mqaRepintarCuerpo();
}

// C2E-4E4 / F6 — repintado PROPIO de Máquinas tras una escritura (registro
// o anulación) o tras un reintento de lectura. Relee SOLO el historial
// operativo (el detalle histórico y los contadores no cambian) y aplica el
// guard anti-carrera de Máquinas: si el usuario ya salió de esta ficha, la
// respuesta NO se pinta.
async function mqaRepintarFichaOperativa(id, force = true) {
  const equipoId = (id === null || id === undefined) ? '' : String(id);
  if (!equipoId || mqaSeleccionado !== equipoId) return;

  const cont = document.getElementById('mqa-cuerpo');
  if (!cont) return;

  const resOperativas = await mntCargarEstadoOperativasFicha(equipoId, force);
  if (mqaSeleccionado !== equipoId) return;

  mqaDetalle = Object.assign({}, mqaDetalle, {
    operativasOk: resOperativas.ok,
    operativas: resOperativas.lista,
    avisoOperativas: resOperativas.aviso
  });

  if (resOperativas.ok) {
    mntGuardarOperativasFichaActual(resOperativas.lista);
  } else {
    mntLimpiarOperativasFichaActual();
  }
  mntFijarContextoOperativas({
    origen: 'maquinas',
    elementoId: equipoId,
    contenedorId: 'mqa-cuerpo',
    elemento: (mqaDetalle.dato && mqaDetalle.dato.elemento) ? mqaDetalle.dato.elemento : null,
    repintar: () => mqaRepintarFichaOperativa(equipoId, true)
  });

  mqaRepintarCuerpo();
}

// C2E-4E4 / F6 — el reintento del historial operativo NO tiene una versión
// propia de Máquinas: el botón del aviso invoca al compartido
// mntReintentarHistorialOperativo, que despacha por CONTEXTO al repintado
// de esta vista (con el guard anti-carrera de Máquinas). Así no existen dos
// implementaciones del mismo reintento.

// Conserva los filtros del listado (búsqueda y ubicación) al volver.
function mqaVolverAlListado() {
  mqaSeleccionado = null;
  mqaDetalle = { estado: 'idle', dato: null };
  mntLimpiarOperativasFichaActual();
  mntLimpiarContextoOperativas('maquinas');
  mqaRepintarCuerpo();
}

// ------------------------------------------------------------
// FILTROS (estado aislado mqaFiltro; sin colisión con Catálogo General)
// ------------------------------------------------------------
function mqaFiltrar(lista) {
  const texto = (mqaFiltro.texto || '').trim().toLowerCase();
  const ubicacion = mqaFiltro.ubicacion || '';

  return (Array.isArray(lista) ? lista : []).filter(e => {
    if (!e) return false;
    if (ubicacion && (mntNombreUbicacion(e) || '') !== ubicacion) return false;
    if (!texto) return true;

    // Busca por nombre, ubicación, código o nemotécnico (mismo criterio
    // que el Catálogo General, sin reinterpretar los valores).
    const campos = [e.nombre_original, e.codigo, e.nemotecnico, mntNombreUbicacion(e)];
    return campos.some(c => (c === null || c === undefined) ? false : String(c).toLowerCase().includes(texto));
  });
}

function mqaOnBuscar(valor) {
  mqaFiltro.texto = valor || '';
  const cont = document.getElementById('mqa-listado');
  if (!cont) return;
  cont.innerHTML = mqaCuadriculaHTML(mqaFiltrar(mqaCarga.equipos));
  const contador = document.getElementById('mqa-contador');
  if (contador) contador.textContent = `${mqaFiltrar(mqaCarga.equipos).length} de ${mqaCarga.equipos.length} equipos`;
}

function mqaOnFiltrarUbicacion(valor) {
  mqaFiltro.ubicacion = valor || '';
  mqaOnBuscar(mqaFiltro.texto);
}

function mqaLimpiarFiltros() {
  mqaFiltro = { texto: '', ubicacion: '' };
  mqaRepintarCuerpo();
}

// Opciones del selector de ubicación, derivadas de los datos reales.
function mqaOpcionesUbicacionHTML() {
  const ubicaciones = new Set();
  (Array.isArray(mqaCarga.equipos) ? mqaCarga.equipos : []).forEach(e => {
    const ub = mntNombreUbicacion(e);
    if (ub) ubicaciones.add(String(ub));
  });

  const opciones = Array.from(ubicaciones).sort((a, b) => a.localeCompare(b, 'es'));
  const actual = mqaFiltro.ubicacion || '';

  return `
    <option value="" ${actual === '' ? 'selected' : ''}>Todas las ubicaciones</option>
    ${opciones.map(o => `<option value="${mntEsc(o)}" ${actual === o ? 'selected' : ''}>${mntEsc(o)}</option>`).join('')}
  `;
}

// Reintenta la carga del catálogo (botón de error).
function mqaRecargar() {
  mqaCargarCatalogo(true).then(() => {
    mqaRepintarCuerpo();
    mqaActualizarCalendario?.();
    mqaCargarTareas();
  });
}


