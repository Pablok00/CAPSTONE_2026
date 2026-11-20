// PRE-VERCEL-2B: resumen documental de fuentes reales; no son tareas activas.
let dashboardCargaAreas = 'idle';
let dashboardResumen={estado:'idle',proyectos:null,solicitudes:null,ubicaciones:null,ubicacionesTotal:null,equipos:null,bodegas:null};
let dashboardResumenSecuencia=0;
let dashboardRenderSecuencia=0;
// Una revalidación puede reemplazar el objeto de perfil sin cambiar su acceso.
function dashboardFirmaAcceso() {
  const u=state.currentUser||{};
  const normalizar=v=>Array.isArray(v)?v.map(normalizar).sort((a,b)=>String(JSON.stringify(a)).localeCompare(String(JSON.stringify(b))))
    :v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalizar(v[k])])):v;
  return JSON.stringify([u.id,u.role,normalizar(u.permissions),u.esAdminPermanente===true,u.esAdminTemporal===true,u.adminTemporalHasta||null,esAdminOperativoActual(),
    typeof sesionNoVerificable!=='undefined'&&sesionNoVerificable,typeof sesionEnReconexion!=='undefined'&&sesionEnReconexion]);
}
function renderDashboardView() {
  dashboardCargaAreas='cargando';
  const render=++dashboardRenderSecuencia;
  setTimeout(async()=>{
    const loader=document.getElementById('dashboard-loader'),container=document.getElementById('dashboard-content');
    if(!loader||!container||render!==dashboardRenderSecuencia||currentView!=='dashboard')return;
    const acceso=dashboardFirmaAcceso();let caducada=false,timer;
    const montada=()=>render===dashboardRenderSecuencia&&currentView==='dashboard'&&document.getElementById('dashboard-content')===container;
    const vigente=()=>!caducada&&montada()&&dashboardFirmaAcceso()===acceso;
    dashboardResumen={estado:'cargando',proyectos:null,solicitudes:null,ubicaciones:null,ubicacionesTotal:null,equipos:null,bodegas:null};
    try {
      const areas=Promise.resolve().then(()=>vigente()?areaCargarFuentes():undefined).then(()=> 'listo',()=> 'error');
      const resumen=dashboardCargarResumen(areas,vigente);
      const servicio=window.GestionTareas;
      const puedeCalendario=servicio?.habilitada&&servicio.puede()&&hasAccess('tareas-pendientes',state.currentUser?.role);
      // Precarga autorizada; el montaje reutiliza la caché mensual existente, no otra RPC.
      const calendario=puedeCalendario?servicio.todas('TAREAS',servicio.mes(calendarioFechaCivilLocal())):Promise.resolve();
      const resultados=await Promise.race([
        Promise.all([areas,resumen,calendario]),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('CARGA_AGOTADA')),15000);})
      ]);
      if(!montada())return;
      if(!vigente())throw Error('ACCESO_CAMBIO');
      dashboardCargaAreas=resultados[0];
      container.innerHTML=getDashboardHTML();
      if(puedeCalendario){const panel=document.getElementById('dashboard-calendario');
        if(panel)gestionMontarCalendario(panel,'Calendario general de tareas',null,{abierto:true,enlaceGestion:true});}
      loader.classList.add('hidden');container.classList.remove('hidden');
    } catch (_) {
      caducada=true;
      if(!montada())return;
      container.innerHTML='';container.classList.add('hidden');
      loader.innerHTML='<div role="alert" class="alm-panel p-5 space-y-3"><p>No se pudo completar la carga del Dashboard. Comprueba tu conexión y el acceso de tu sesión.</p><button type="button" class="alm-btn-primary px-3 py-2" onclick="navigateTo(&quot;dashboard&quot;,null,null,true)">Volver a cargar</button></div>';
      loader.classList.remove('hidden');
    } finally { if(typeof clearTimeout==='function')clearTimeout(timer); }
  },0);
  return uiCargandoHTML('dashboard-loader') + '<div id="dashboard-content" class="hidden w-full"></div>';
}
function dashboardRegistrosUnicos(registros){
  if(!Array.isArray(registros)||registros.some(r=>!r||typeof r.id!=='string'||!r.id.trim()))throw Error('Respuesta incompleta');
  return [...new Map(registros.map(r=>[r.id,r])).values()];
}
async function dashboardCargarResumen(esperarAreas,vigente){
  const secuencia=++dashboardResumenSecuencia;
  const acceso=dashboardFirmaAcceso();
  const resumen={estado:'cargando',proyectos:null,solicitudes:null,ubicaciones:null,ubicacionesTotal:null,equipos:null,bodegas:null};dashboardResumen=resumen;
  const trasAreas=(fn,fuente)=>Promise.resolve(esperarAreas).then(()=>{
    if(vigente&&!vigente())throw Error('Vista desmontada.');
    if(esperarAreas && fuente && typeof areaFuente==='function'){
      const resultado=areaFuente(fuente);
      // Reutilizar también el fallo: no volver a pedir proyectos tras fallar Áreas.
      if(resultado?.estado!=='listo'||!Array.isArray(resultado.datos))throw Error('Fuente de proyectos no disponible.');
      return resultado.datos;
    }
    return fn();
  }).then(dashboardRegistrosUnicos);
  const consultas=await Promise.allSettled([
    trasAreas(()=>window.MejorasService.getProyectos(),'workarea_mejoras'),
    trasAreas(()=>window.RemodelacionesService.getProyectos(),'workarea_remodelacion'),
    trasAreas(()=>window.MantencionesService.getElementosMaquinas()),
    // Bodegas ya no es un KPI; no descargar su catálogo por una bandera cerrada.
    Promise.resolve(null),
    Promise.resolve().then(()=>window.MantencionesService.getUbicacionesTV(true,{soloCantidad:true})).then(total=>{if(!Number.isSafeInteger(total)||total<0)throw Error('Conteo no verificable.');return total;}),
    Promise.resolve().then(()=>dashboardPuedeConsultarSolicitudes()
      ? window.SolicitudesService.contarSolicitudesAdministrativas() : null)
  ]);
  if(consultas[2].status==='fulfilled')resumen.equipos=consultas[2].value.length;
  if(consultas[3].status==='fulfilled')resumen.bodegas=consultas[3].value?.length ?? null;
  if(consultas[0].status==='fulfilled'&&consultas[1].status==='fulfilled'){
    const mejoras=consultas[0].value,remodelaciones=consultas[1].value;
    const proyectos=new Map([...mejoras,...remodelaciones].map(p=>[p.id,p]));resumen.proyectos=proyectos.size;

  }
  if(consultas[4].status==='fulfilled')resumen.ubicacionesTotal=consultas[4].value;
  if(consultas[5].status==='fulfilled')resumen.solicitudes=consultas[5].value;
  resumen.estado='listo';if(secuencia===dashboardResumenSecuencia && dashboardFirmaAcceso()===acceso && (!vigente||vigente()))dashboardResumen=resumen;
}
function dashboardValor(valor) {
  return valor ?? (dashboardResumen.estado === 'listo' ? 'No disponible' : 'Cargando…');
}

function dashboardPuedeConsultarSolicitudes() {
  return esAdminOperativoActual() && hasAccess('solicitudes', state.currentUser?.role);
}

function dashboardSolicitudesValor() {
  if (!dashboardPuedeConsultarSolicitudes()) return 'Sin acceso';
  const solicitudes = dashboardResumen.solicitudes;
  return solicitudes ? solicitudes.pendiente : dashboardValor(null);
}

function dashboardSolicitudesDetalle() {
  const solicitudes = dashboardResumen.solicitudes;
  if (!dashboardPuedeConsultarSolicitudes() || !solicitudes) return '';
  return `Pendientes <span class="block mt-1">Aprobadas: ${solicitudes.aprobada} · Rechazadas: ${solicitudes.rechazada}</span>`;
}

function dashboardIndicadoresHTML(){
  const indicadores=[
    ['Proyectos registrados','proyectos','Mejoras y Remodelación; proyectos únicos.','🏗️'],
    ['Solicitudes','solicitudes','','📋'],
    ['Equipos registrados de Mantención de Máquinas','equipos','Registros del catálogo de Máquinas.','⚙️'],
    ['Ubicaciones del hotel','lugares','Ubicaciones registradas.<span class="block mt-1">Habitaciones, bodegas, salones y otras áreas.</span>','📍']
  ];
  return `<section id="dashboard-kpis" aria-labelledby="dashboard-indicadores" class="space-y-3"><h3 id="dashboard-indicadores" class="alm-section-title text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Resumen de registros del hotel</h3><div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">${indicadores.map(([titulo,clave,detalle,icono])=>`<article class="alm-panel alm-metric bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm min-w-0"><div class="flex items-start gap-2"><span aria-hidden="true" class="alm-metric-icon text-blue-600 dark:text-blue-400">${icono}</span><h4 class="text-sm font-bold text-slate-700 dark:text-slate-200">${titulo}</h4></div><p class="alm-metric-value text-2xl font-black text-slate-900 dark:text-white mt-3">${clave==='solicitudes' ? dashboardSolicitudesValor() : dashboardValor(clave === 'lugares' ? dashboardResumen.ubicacionesTotal : dashboardResumen[clave])}</p><p class="alm-metric-description text-xs leading-relaxed text-slate-500 dark:text-slate-400 mt-2">${clave==='solicitudes' ? dashboardSolicitudesDetalle() : detalle}</p></article>`).join('')}</div></section>`;
}
const DASHBOARD_TIPOS_UBICACION = {
  HABITACION: ['Habitaciones', '🛏️'], BODEGA: ['Bodegas', '📦'], 'CABAÑA': ['Cabañas', '🏡'],
  CASA: ['Casas', '🏠'], COCINA: ['Cocinas', '🍽️'], Hotel: ['Hotel', '🏨'],
  OFICINA: ['Oficinas', '🗄️'], PASILLO: ['Pasillos', '🚪'], SALON: ['Salones', '🪑'], SECTOR: ['Sectores', '📍']
};
const dashboardOrdenUbicaciones = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

function dashboardAgruparUbicaciones(ubicaciones) {
  const grupos = new Map();
  for (const ubicacion of ubicaciones) {
    const tipo = ubicacion.tipo ?? null;
    if (!grupos.has(tipo)) {
      const [titulo, icono] = tipo === null ? ['Sin tipo', '📍']
        : Object.hasOwn(DASHBOARD_TIPOS_UBICACION, tipo) ? DASHBOARD_TIPOS_UBICACION[tipo] : [tipo, '📍'];
      grupos.set(tipo, { tipo, titulo, icono, cantidad: 0 });
    }
    grupos.get(tipo).cantidad++;
  }
  return [...grupos.values()].sort((a,b) => Number(a.tipo === null) - Number(b.tipo === null) ||
    dashboardOrdenUbicaciones.compare(a.titulo, b.titulo));
}

function dashboardUbicacionesHTML() {
  const ubicaciones = dashboardResumen.ubicaciones;
  return `<div id="dashboard-ubicaciones">
    <section aria-labelledby="dashboard-ubicaciones-titulo" class="alm-panel p-4 sm:p-6 space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="dashboard-ubicaciones-titulo" class="alm-section-title text-lg font-black">Ubicaciones del hotel</h3>
          <p class="alm-muted text-sm">${ubicaciones === null ? 'No disponible' : ubicaciones.length + ' ubicaciones registradas'}</p>
          <p class="alm-muted text-sm">Habitaciones, salones y sectores del hotel, incluidas nuevas ampliaciones.</p>
        </div>
        ${hasAccess('mantenciones', state.currentUser?.role) ? '<button type="button" onclick="dashboardAbrirUbicaciones()" class="alm-btn-primary px-3 py-2">Gestionar ubicaciones</button>' : ''}
      </div>
      ${ubicaciones?.length ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${dashboardAgruparUbicaciones(ubicaciones).map(grupo => `
          <article class="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <span aria-hidden="true">${grupo.icono}</span>
            <h4 class="min-w-0 flex-1 break-words text-sm font-bold">${areaEsc(grupo.titulo)}</h4>
            <span class="shrink-0 font-bold">${grupo.cantidad}</span>
          </article>`).join('')}
      </div>` : ubicaciones ? '<p class="alm-muted text-sm">No hay ubicaciones registradas.</p>' : ''}
    </section>
  </div>`;
}

let dashboardLecturaUbicaciones = null;
function dashboardActualizarUbicaciones() {
  const panel = document.getElementById('dashboard-kpis');
  if (currentView !== 'dashboard' || !panel || dashboardLecturaUbicaciones === panel) return;
  const actor = state.currentUser?.id;
  dashboardLecturaUbicaciones = panel;
  const aplicar = total => {
    if (currentView !== 'dashboard' || state.currentUser?.id !== actor ||
        document.getElementById('dashboard-kpis') !== panel) return;
    dashboardResumen.ubicacionesTotal = total;
    panel.outerHTML = dashboardIndicadoresHTML();
  };
  return Promise.resolve().then(() => window.MantencionesService.getUbicacionesTV(true,{soloCantidad:true}))
    .then(total=>{if(!Number.isSafeInteger(total)||total<0)throw Error('Conteo no verificable.');return total;}).then(aplicar, () => aplicar(null))
    .finally(() => { if (dashboardLecturaUbicaciones === panel) dashboardLecturaUbicaciones = null; });
}
window.addEventListener('hotel:ubicaciones-actualizadas', dashboardActualizarUbicaciones);

function dashboardAbrirUbicaciones(){
  if(!hasAccess('mantenciones',state.currentUser?.role))return;
  navigateTo('mantenciones');
  if(currentView==='mantenciones' && document.getElementById('mantenciones-content')){
    abrirMantencionSubapartado('ubicaciones');
  }
}
function dashboardCalendarioHTML() {
  return window.GestionTareas?.habilitada && window.GestionTareas.puede() && hasAccess('tareas-pendientes', state.currentUser?.role)
    ? '<div id="dashboard-calendario" class="min-w-0"></div>' : '';
}
function getDashboardHTML(){
  return `<div class="alm-ui alm-dashboard space-y-5 max-w-7xl mx-auto pb-10"><header class="alm-panel alm-dashboard-header bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-sm border border-slate-800"><div class="flex items-center gap-3 min-w-0"><span aria-hidden="true" class="alm-brand-mark w-12 h-12 shrink-0 rounded-2xl bg-amber-300 text-slate-950 flex items-center justify-center text-2xl"><svg xmlns="http://www.w3.org/2000/svg" width="1.15em" height="1.15em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 22v-6.57M12 11h.01M12 7h.01M14 15.43V22M15 16a5 5 0 0 0-6 0M16 11h.01M16 7h.01M8 11h.01M8 7h.01"/><rect x="4" y="2" width="16" height="20" rx="2"/></svg></span><div class="min-w-0"><h2 class="text-lg font-black">Hotel & Centro de Eventos El Almendro</h2><p class="text-sm text-slate-300 mt-1">Panel principal · Consulta de información disponible</p></div></div></header>${dashboardIndicadoresHTML()}${dashboardCalendarioHTML()}<section aria-labelledby="dashboard-areas-titulo" class="space-y-4"><div class="border-b border-slate-200 dark:border-slate-800 pb-3"><h3 id="dashboard-areas-titulo" class="text-lg font-black text-slate-900 dark:text-white">Áreas de Trabajo</h3><p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Selecciona un área para consultar sus fichas y registros.</p></div>${dashboardCargaAreas==='error'?'<p role="alert" class="text-sm text-rose-600 dark:text-rose-400">No se pudo completar la consulta de áreas. Vuelve a abrir el panel para reintentar.</p>':''}<div id="area-tarjetas">${dashboardCargaAreas==='cargando'?'<p class="alm-muted" role="status">Cargando áreas…</p>':areaTarjetasHTML()}</div></section></div>`;
}
