// UX-02: las ventanas solo se cierran con controles explícitos o tras guardar.
// Esta regla sustituye las referencias históricas a cierre por fondo o Escape.
// JARD-1: consulta dedicada de las fuentes existentes; sin escrituras ni stock.
const jdaEstado = { tab:'sectores', texto:'', sector:'', prioridad:'', temporada:'', ambito:'', hoja:'', tipo:'insumos_movimientos', pagina:1, detalle:null };
let jdaInsumos = { estado:'idle', datos:null };
let jdaInsumosConsulta = null;
const JDA_PAGINA = 12;
const JDA_TABS = [['sectores','Sectores y trabajos'],['riego','Programación de riego'],['labores','Labores complementarias'],['insumos','Historial de insumos']];
let jdaModalContexto = null;

function openAreaJardineria() {
  jdaCerrarDetalle();
  closeModal('modal-area-detail');
  jdaEstado.detalle = null;
  navigateTo('areas', null, 'jardineria');
}
function jdaVolverAAreas() { jdaCerrarDetalle(); navigateTo('mantenciones'); }
function renderJardineriaAreaView() {
  setTimeout(async () => {
    const contenedor=document.getElementById('jda-contenido');
    if (!contenedor) return;
    await Promise.all([areaCargarFuente('workarea_jardineria'),jdaCargarInsumos()]);
    if (document.getElementById('jda-contenido') === contenedor) contenedor.innerHTML=jdaCuerpoHTML();
  },0);
  return `<div class="alm-ui alm-main-page alm-module-page alm-gardening w-full pb-12 space-y-4">
    ${uiEncabezadoSeccion('Mantención de Jardinería','Consulta de trabajos, riego e historial.','tree','<button type="button" onclick="jdaRecargar()" class="alm-btn-secondary">Actualizar</button>')}<div id="jda-contenido" class="alm-panel bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">${uiCargandoHTML()}</div></div>`;
}
async function jdaRecargar() {
  const nodo=document.getElementById('jda-contenido');
  if (!nodo) return;
  const carga=Promise.all([areaCargarFuente('workarea_jardineria',true),jdaCargarInsumos(true)]);
  nodo.innerHTML=uiCargandoHTML();
  await carga;
  if (document.getElementById('jda-contenido') === nodo) nodo.innerHTML=jdaCuerpoHTML();
}
function jdaDatos() { return areaFuente('workarea_jardineria').datos; }
async function jdaCargarInsumos(force = false) {
  if (jdaInsumosConsulta) return jdaInsumosConsulta;
  if (!force && jdaInsumos.estado === 'listo') { jdaRepintar(); return; }
  const contenedor=document.getElementById('jda-contenido');
  jdaInsumos={estado:'cargando',datos:null};jdaRepintar();
  jdaInsumosConsulta=(async()=>{
    try {
      const datos=await window.MantencionesService.getInsumosJardineria(force);
      if(!datos || !['movimientos','tareas','importaciones'].every(k=>Array.isArray(datos[k]))) throw Error('Respuesta incompleta');
      jdaInsumos={estado:'listo',datos};
    } catch (_) { jdaInsumos={estado:'error',datos:null}; }
    if(document.getElementById('jda-contenido')===contenedor)jdaRepintar();
  })();
  try { await jdaInsumosConsulta; } finally { jdaInsumosConsulta=null; }
}
function jdaRegistros() {
  if(jdaEstado.tab==='insumos') {
    if(jdaInsumos.estado!=='listo')return [];
    return ['movimientos','tareas','importaciones'].flatMap(k=>jdaInsumos.datos[k].map(registro=>({grupo:'insumos_'+k,registro,clave:'insumos_'+k+':'+registro.id})));
  }
  const datos=jdaDatos();
  if (!datos) return [];
  const grupos=jdaEstado.tab === 'riego' ? ['riegoProgramacion','riegoZonas','riegoNotas'] : jdaEstado.tab === 'labores' ? ['laboresComplementarias'] : ['sectores','trabajos'];
  return grupos.flatMap(grupo => areaActivos(datos[grupo]).map(registro=>({grupo,registro,clave:grupo+':'+registro.id})));
}
function jdaTitulo(item) {
  const r=item.registro;
  return [r.titulo_original,r.titulo,r.producto_original,r.nombre_original,r.nombre,r.zona,r.contenido_original,r.contenido,r.hoja_origen].find(v=>v!==null&&v!==undefined&&String(v).trim()!=='') ?? 'Sin título registrado';
}
function jdaTipo(grupo) {
  return {sectores:'Sector',trabajos:'Trabajo definido — no ejecutado',riegoProgramacion:'Programación de riego',riegoZonas:'Zona de riego',riegoNotas:'Nota de riego',laboresComplementarias:'Labor complementaria — contenido maestro',insumos_movimientos:'Movimiento histórico — no es stock actual',insumos_tareas:'Tarea importada — estado original',insumos_importaciones:'Metadatos del archivo — no es un evento'}[grupo];
}
function jdaSectorNombre(id) {
  const sector=areaActivos(jdaDatos()?.sectores || []).find(s=>s.id===id);
  return sector ? sector.nombre : 'Sin sector identificado en los datos consultados';
}
function jdaFiltrados() {
  const buscar=jdaEstado.texto.trim().toLocaleLowerCase('es');
  return jdaRegistros().filter(({registro:r,grupo})=>{
    if(jdaEstado.tab==='insumos' && ((jdaEstado.hoja && r.hoja_origen!==jdaEstado.hoja) || (grupo!==(jdaEstado.tipo||'insumos_movimientos'))))return false;
    if (jdaEstado.tab==='sectores') {
      if(!jdaEstado.sector && grupo!=='sectores')return false;
      if(jdaEstado.sector && (grupo!=='trabajos' || (jdaEstado.sector==='__sin_sector__' ? jdaSectorVerificado(r.sector_id) : r.sector_id!==jdaEstado.sector)))return false;
      if (jdaEstado.prioridad && String(r.prioridad ?? '')!==jdaEstado.prioridad) return false;
      if (jdaEstado.temporada==='invierno' && r.invierno_otono!==true) return false;
      if (jdaEstado.temporada==='verano' && r.verano_primavera!==true) return false;
    }
    if(jdaEstado.tab==='labores' && jdaEstado.ambito && jdaAmbito(r).clave!==jdaEstado.ambito)return false;
    return !buscar || (jdaEstado.tab==='labores'&&jdaAmbito(r).nombre.toLocaleLowerCase('es').includes(buscar)) || Object.values(r).some(valor=>valor!==null && String(valor).toLocaleLowerCase('es').includes(buscar));
  });
}
async function jdaCambiarTab(tab) {
  if (!JDA_TABS.some(([id])=>id===tab)) return;
  jdaCerrarDetalle();
  jdaEstado.tab=tab; jdaEstado.pagina=1; jdaEstado.detalle=null; jdaEstado.texto='';
  if(tab==='insumos')await jdaCargarInsumos();
  else jdaRepintar();
}
function jdaBuscar(texto) { jdaEstado.texto=texto; jdaEstado.pagina=1; jdaRepintarResultados(); }
function jdaFiltrar(campo,valor) {
  if(campo==='sector'){if(valor)jdaAbrirSector(valor);else jdaVolverSectores();return;}
  if (!['prioridad','temporada','ambito','hoja','tipo'].includes(campo)) return;
  if(campo==='tipo'){if(!['insumos_movimientos','insumos_tareas','insumos_importaciones'].includes(valor))return;jdaEstado.tipo=valor;jdaEstado.hoja='';jdaEstado.texto='';jdaEstado.pagina=1;jdaRepintar();return;}
  jdaEstado[campo]=valor; jdaEstado.pagina=1; jdaRepintarResultados();
}
function jdaIrPagina(pagina) {
  const total=Math.max(1,Math.ceil(jdaFiltrados().length/JDA_PAGINA));
  if (!Number.isInteger(pagina) || pagina<1 || pagina>total) return;
  jdaEstado.pagina=pagina; jdaRepintarResultados();
}
function jdaRepintar() { const nodo=document.getElementById('jda-contenido'); if(nodo)nodo.innerHTML=jdaCuerpoHTML(); }
function jdaRepintarResultados() { const nodo=document.getElementById('jda-resultados'); if(nodo)nodo.innerHTML=jdaResultadosHTML(); }
function jdaAbrirDetalle(clave) {
  if (!jdaRegistros().some(item=>item.clave===clave)) return;
  let modal=document.getElementById('jda-detalle-overlay');
  if(!modal) {
    modal=document.createElement('div');modal.id='jda-detalle-overlay';
    modal.className='alm-ui alm-garden-dialog hidden fixed inset-0 z-[90] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overscroll-contain';
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','jda-detalle-titulo');
    document.body.appendChild(modal);
  }
  if(!jdaModalContexto) {
    const fondo=document.getElementById('view-container');
    jdaModalContexto={ foco:document.activeElement, overflow:document.body.style.overflow,
      fondo, fondoOverflow:fondo?.style.overflow, fondoInert:fondo?.inert, scroll:fondo?.scrollTop };
    document.body.style.overflow='hidden';
    if(fondo){fondo.style.overflow='hidden';fondo.inert=true;}
    document.addEventListener('keydown',jdaTeclaDetalle,true);
  }
  jdaEstado.detalle=clave;
  modal.innerHTML=`<div class="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
    <header class="flex items-center justify-between gap-4 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 shrink-0"><h2 id="jda-detalle-titulo" class="text-lg font-black">Información de Jardinería</h2><button id="jda-detalle-cerrar" type="button" onclick="jdaCerrarDetalle()" aria-label="Cerrar información de Jardinería" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500 text-xl">✕</button></header>
    <div class="p-4 sm:p-5 overflow-y-auto overscroll-contain custom-scrollbar">${jdaDetalleHTML()}</div></div>`;
  openModal('jda-detalle-overlay');
  document.getElementById('jda-detalle-cerrar').focus({preventScroll:true});
}
function jdaCerrarDetalle() {
  const modal=document.getElementById('jda-detalle-overlay');
  if(modal && !modal.classList.contains('hidden'))closeModal('jda-detalle-overlay');
  jdaEstado.detalle=null;
  if(!jdaModalContexto)return;
  const previo=jdaModalContexto;jdaModalContexto=null;
  document.removeEventListener('keydown',jdaTeclaDetalle,true);
  document.body.style.overflow=previo.overflow;
  if(previo.fondo){previo.fondo.style.overflow=previo.fondoOverflow;previo.fondo.inert=previo.fondoInert;previo.fondo.scrollTop=previo.scroll;}
  if(previo.foco?.isConnected)previo.foco.focus({preventScroll:true});
}
function jdaTeclaDetalle(evento) {
  if(!jdaModalContexto)return;
  if(evento.key==='Escape')return; // UX-02: cierre únicamente explícito.
  if(evento.key!=='Tab')return;
  const modal=document.getElementById('jda-detalle-overlay');
  const focos=Array.from(modal.querySelectorAll('button:not([disabled]), summary, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
  if(!focos.length)return;
  const primero=focos[0],ultimo=focos[focos.length-1],actual=document.activeElement;
  if(!modal.contains(actual) || (evento.shiftKey && actual===primero) || (!evento.shiftKey && actual===ultimo)) {
    evento.preventDefault();(evento.shiftKey?ultimo:primero).focus({preventScroll:true});
  }
}
function jdaVolverListado() { jdaCerrarDetalle(); }
function jdaAbrirSector(id) {
  if(id==='__sin_sector__' ? !jdaSinSector().length : !jdaSectorVerificado(id))return;
  jdaEstado.sector=id; jdaEstado.pagina=1; jdaEstado.detalle=null;jdaEstado.texto='';jdaEstado.prioridad='';jdaEstado.temporada='';jdaRepintar();
}
function jdaVolverSectores() { jdaCerrarDetalle();jdaEstado.sector='';jdaEstado.texto='';jdaEstado.prioridad='';jdaEstado.temporada='';jdaEstado.pagina=1;jdaRepintar(); }
function jdaSectorVerificado(id) { return areaActivos(jdaDatos()?.sectores || []).find(s=>s.id===id); }
function jdaSinSector() { return areaActivos(jdaDatos()?.trabajos || []).filter(t=>!jdaSectorVerificado(t.sector_id)); }
function jdaAmbito(r) {
  const sector=jdaSectorVerificado(r.sector_id);
  if(sector)return {clave:'sector:'+sector.id,nombre:'Sector: '+sector.nombre};
  const bloque=[r.bloque,r.bloque_original,r.subapartado].find(v=>v!==null&&v!==undefined&&String(v).trim()!=='');
  return bloque!==undefined ? {clave:'ambito:'+bloque,nombre:'Ámbito documental: '+bloque} : {clave:'sin-ambito',nombre:'Sin ámbito registrado'};
}
function jdaOpciones(lista,valorActual) {
  return lista.map(([valor,titulo])=>`<option value="${areaEsc(valor)}" ${String(valor)===valorActual?'selected':''}>${areaEsc(titulo)}</option>`).join('');
}
function jdaFiltrosHTML() {
  const datos=jdaDatos() || {trabajos:[],sectores:[]};
  const prioridad=[...new Set(areaActivos(datos.trabajos).map(t=>t.prioridad).filter(v=>v!==null&&v!==undefined))].sort();
  const css='w-full min-w-0 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:border-blue-500 focus:outline-none';
  return `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-end gap-3 my-4 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60"><label class="text-xs font-bold">Buscar<input type="search" value="${areaEsc(jdaEstado.texto)}" oninput="jdaBuscar(this.value)" class="${css}" /></label>
    ${jdaEstado.tab==='labores'?`<label class="text-xs font-bold">Sector o ámbito<select onchange="jdaFiltrar('ambito',this.value)" class="${css}">${jdaOpciones([['','Todos los ámbitos'],...[...new Map(areaActivos(datos.laboresComplementarias).map(r=>{const a=jdaAmbito(r);return [a.clave,[a.clave,a.nombre]];})).values()]],jdaEstado.ambito)}</select></label>`:''}
    ${jdaEstado.tab==='insumos'?`<label class="text-xs font-bold">Hoja original<select onchange="jdaFiltrar('hoja',this.value)" class="${css}">${jdaOpciones([['','Todas las hojas'],...[...new Set(jdaRegistros().filter(i=>i.grupo===(jdaEstado.tipo||'insumos_movimientos')).map(i=>i.registro.hoja_origen).filter(Boolean))].sort().map(h=>[h,h])],jdaEstado.hoja)}</select></label>`:''}
    ${jdaEstado.tab==='sectores'&&jdaEstado.sector?`<label class="text-xs font-bold">Sector<select onchange="jdaFiltrar('sector',this.value)" class="${css}">${jdaOpciones([['','Todos los sectores'],...areaActivos(datos.sectores).map(s=>[s.id,s.nombre]),...(jdaSinSector().length?[['__sin_sector__','Sin sector asignado']]:[])],jdaEstado.sector)}</select></label>
    <label class="text-xs font-bold">Prioridad documental<select onchange="jdaFiltrar('prioridad',this.value)" class="${css}">${jdaOpciones([['','Todas'],...prioridad.map(p=>[String(p),'Prioridad '+p])],jdaEstado.prioridad)}</select></label>
    <label class="text-xs font-bold">Temporada documental<select onchange="jdaFiltrar('temporada',this.value)" class="${css}">${jdaOpciones([['','Todas'],['invierno','Invierno / otoño'],['verano','Verano / primavera']],jdaEstado.temporada)}</select></label>`:''}</div>`;
}
function jdaDia(valor) { return String(valor??'').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function jdaRiegoHTML() {
  const dias=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'],todos=jdaRegistros(),filtrados=jdaFiltrados();
  const coincide=(i,d)=>i.grupo==='riegoProgramacion'&&jdaDia(i.registro.dia_semana)===jdaDia(d);
  const enlace=i=>`<button type="button" data-clave="${areaEsc(i.clave)}" onclick="jdaAbrirDetalle(this.dataset.clave)" aria-label="Ver información y procedencia: ${areaEsc(jdaTitulo(i))}" class="text-blue-600 dark:text-blue-400 hover:underline text-sm font-bold shrink-0">Ver detalle</button>`;
  const fila=i=>`<div class="flex items-start justify-between gap-3 py-2 min-w-0"><div class="min-w-0"><p class="text-sm font-semibold break-words">${areaEsc(jdaTitulo(i))}</p>${['orden_dia','horario'].filter(k=>i.registro[k]!==null&&i.registro[k]!==undefined&&String(i.registro[k]).trim()!=='').map(k=>`<span class="text-sm text-slate-500 dark:text-slate-400 mr-3">${k==='orden_dia'?'Orden documental':'Horario'}: ${areaEsc(i.registro[k])}</span>`).join('')}</div>${enlace(i)}</div>`;
  const dia=(d,items,vacio)=>`<section class="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 px-3 py-2 border-b last:border-b-0 border-slate-100 dark:border-slate-800"><h3 class="text-base font-bold py-2">${d}</h3><div class="sm:col-span-2 min-w-0 divide-y divide-slate-100 dark:divide-slate-800">${items.map(fila).join('')||`<p class="text-sm text-slate-500 dark:text-slate-400 py-2">${vacio}</p>`}</div></section>`;
  let semana=dias.map(d=>dia(d,filtrados.filter(i=>coincide(i,d)).sort((a,b)=>(a.registro.orden_dia??Infinity)-(b.registro.orden_dia??Infinity)),todos.some(i=>coincide(i,d))?'Sin coincidencias para la búsqueda.':'Sin programación registrada')).join('');
  const sinDia=i=>i.grupo==='riegoProgramacion'&&!dias.some(d=>coincide(i,d));
  if(todos.some(sinDia))semana+=dia('Sin día especificado',filtrados.filter(sinDia),'Sin coincidencias para la búsqueda.');
  const secundario=(titulo,g)=>{const items=filtrados.filter(i=>i.grupo===g);return `<details class="border border-slate-200 dark:border-slate-800 rounded-2xl p-3 min-w-0"><summary class="cursor-pointer text-sm font-bold">${titulo} · ${items.length}</summary><div class="mt-2 divide-y divide-slate-100 dark:divide-slate-800">${items.map(fila).join('')||'<p class="text-xs py-2">Sin registros para la búsqueda actual.</p>'}</div></details>`;};
  return '<h3 class="font-bold text-sm mb-2">Programación documental por día</h3><p class="text-xs text-slate-500 dark:text-slate-400 mb-3">El día indica programación documental; no confirma que se haya regado.</p><div class="alm-irrigation w-full border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">'+semana+'</div><div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">'+secundario('Zonas de riego','riegoZonas')+secundario('Notas de riego','riegoNotas')+'</div>';
}
function jdaResultadosHTML() {
  if(jdaEstado.tab==='riego')return jdaRiegoHTML();
  const todos=jdaFiltrados(), paginas=Math.max(1,Math.ceil(todos.length/JDA_PAGINA));
  jdaEstado.pagina=Math.min(jdaEstado.pagina,paginas);
  let pagina=todos.slice((jdaEstado.pagina-1)*JDA_PAGINA,jdaEstado.pagina*JDA_PAGINA);
  if(jdaEstado.tab==='labores')pagina=pagina.slice().sort((a,b)=>jdaAmbito(a.registro).nombre.localeCompare(jdaAmbito(b.registro).nombre,'es'));
  if(jdaEstado.tab==='insumos')pagina=pagina.slice().sort((a,b)=>a.grupo.localeCompare(b.grupo));
  let grupoAnterior='';
  return `<p role="status" class="text-xs text-slate-500 dark:text-slate-400 mb-3">${todos.length} registros · Página ${jdaEstado.pagina} de ${paginas}</p>
    <div class="alm-record-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 items-stretch gap-3">${pagina.map(item=>{
      const r=item.registro;
      const grupo=jdaEstado.tab==='labores'?jdaAmbito(r).nombre:jdaEstado.tab==='insumos'?'': '';
      const tituloGrupo=grupo&&grupo!==grupoAnterior?'<h3 class="col-span-full font-bold mt-3">'+areaEsc(grupo)+'</h3>':'';grupoAnterior=grupo;
      return `${tituloGrupo}<article class="alm-record-card min-w-0 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:border-blue-400 dark:hover:border-blue-700 transition-colors space-y-2"><h3 class="text-sm font-black text-slate-900 dark:text-white break-words">${areaEsc(jdaTitulo(item))}</h3>
        ${item.grupo.startsWith('insumos_')?`<p class="text-xs">Hoja original: ${areaTexto(r.hoja_origen)}</p>`:''}
        ${item.grupo==='insumos_movimientos'?`${r.cantidad_original!==null&&r.cantidad_original!==undefined&&String(r.cantidad_original).trim()!==''||r.cantidad!==null&&r.cantidad!==undefined?`<p class="text-sm">Cantidad histórica: ${areaTexto(r.cantidad_original ?? r.cantidad)}</p>`:''}`:''}
        ${item.grupo==='insumos_tareas'?`<p class="text-xs">Estado original: ${areaTexto(r.estado, 'Sin estado registrado')} · Grupo original: ${areaTexto(r.grupo_origen)}</p>`:''}
        ${item.grupo==='trabajos'?`${r.invierno_otono===true?'<p class="text-xs">Invierno / otoño</p>':''}${r.verano_primavera===true?'<p class="text-xs">Verano / primavera</p>':''}<p class="text-xs">${areaEsc(jdaSectorNombre(r.sector_id))} · ${r.prioridad===null||r.prioridad===undefined?'Sin prioridad registrada':'Prioridad '+areaEsc(r.prioridad)}</p>`:''}
        ${item.grupo==='laboresComplementarias'?`<p class="text-xs">${areaEsc(jdaAmbito(r).nombre)}</p>`:''}
        <button type="button" data-clave="${areaEsc(item.clave)}" onclick="jdaAbrirDetalle(this.dataset.clave)" class="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">${item.grupo==='sectores'?'Información del sector':'Ver detalle'}</button>
        ${item.grupo==='sectores'?`<p class="text-sm font-bold text-slate-600 dark:text-slate-300">${areaActivos(jdaDatos().trabajos).filter(t=>t.sector_id===r.id).length} trabajos definidos</p><button type="button" data-sector="${areaEsc(r.id)}" onclick="jdaAbrirSector(this.dataset.sector)" class="inline-flex px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition-colors shadow-sm">Abrir sector</button>`:''}</article>`;
    }).join('')||'<p class="col-span-full p-8 text-center text-slate-500 dark:text-slate-400">Sin registros para los filtros seleccionados.</p>'}</div>
    ${jdaEstado.tab==='sectores'&&!jdaEstado.sector&&jdaSinSector().length?`<button type="button" onclick="jdaAbrirSector('__sin_sector__')" class="text-blue-600 dark:text-blue-400 underline">Sin sector asignado · ${jdaSinSector().length} trabajos definidos</button>`:''}<div class="flex justify-between gap-3 mt-5"><button type="button" onclick="jdaIrPagina(${jdaEstado.pagina-1})" ${jdaEstado.pagina===1?'disabled':''} class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-40">Anterior</button><button type="button" onclick="jdaIrPagina(${jdaEstado.pagina+1})" ${jdaEstado.pagina===paginas?'disabled':''} class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-40">Siguiente</button></div>`;
}
function jdaDetalleHTML() {
  const item=jdaRegistros().find(i=>i.clave===jdaEstado.detalle);
  if(!item)return '<p>El registro ya no está disponible en la consulta actual.</p>';
  const r=item.registro, presente=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
  const titulo=[r.titulo_original,r.nombre_original,jdaTitulo(item)].find(presente);
  const campos=[['Tipo de registro',jdaTipo(item.grupo)]];
  if(r.sector_id && jdaDatos())campos.push(['Sector',jdaSectorNombre(r.sector_id)]);
  const etiquetas={zona:'Zona',ubicacion_original:'Ubicación original',prioridad:'Prioridad documental',estado:'Estado original',responsable_texto:'Responsable registrado',dia_semana:'Día de riego',frecuencia:'Frecuencia documental',dias_semana:'Días documentales',momento:'Momento programado',grupo_origen:'Grupo original',descripcion:'Descripción',contenido:'Contenido',observaciones:'Observaciones',cantidad_original:'Cantidad histórica original',cantidad:'Cantidad histórica numérica',costo_unitario:'Costo unitario histórico',costo_total:'Costo total histórico',total_con_iva:'Importe histórico con IVA',total_sin_iva:'Importe histórico sin IVA',proveedor_original:'Proveedor original',archivo_origen:'Archivo de procedencia',hoja_origen:'Hoja de procedencia'};
  Object.entries(etiquetas).forEach(([campo,etiqueta])=>{if(presente(r[campo]))campos.push([etiqueta,r[campo]]);});
  ['fecha','fecha_inicio','fecha_vencimiento','fecha_finalizacion'].forEach(campo=>{if(presente(r[campo]))campos.push([{fecha:'Fecha histórica',fecha_inicio:'Fecha de inicio registrada',fecha_vencimiento:'Vencimiento registrado',fecha_finalizacion:'Finalización registrada'}[campo],areaFecha(r[campo])]);});
  if(r.invierno_otono===true)campos.push(['Temporada documental','Invierno / otoño']);
  if(r.verano_primavera===true)campos.push(['Temporada documental','Verano / primavera']);
  const valorHTML=valor=>areaTexto(typeof valor==='object'&&valor!==null?JSON.stringify(valor):valor);
  return `<article class="space-y-5"><h3 class="text-xl font-black break-words">${areaEsc(titulo)}</h3><p class="text-xs text-slate-500 dark:text-slate-400">Se conserva su significado y estado original; no se presume ejecución terminada ni stock disponible.</p>
    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3">${campos.map(([nombre,valor])=>`<div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 break-words"><dt class="text-xs font-bold text-slate-500 dark:text-slate-400">${nombre}</dt><dd class="text-sm whitespace-pre-wrap">${valorHTML(valor)}</dd></div>`).join('')}</dl>
    ${['costo_unitario','costo_total','total_con_iva','total_sin_iva'].some(c=>presente(r[c]))?'<p class="text-xs">Importes históricos. Moneda no confirmada; no representan precios actuales.</p>':''}
    <details class="border border-slate-200 dark:border-slate-700 rounded-xl p-4"><summary class="cursor-pointer font-bold focus-visible:ring-2 focus-visible:ring-blue-500">Información técnica y trazabilidad · Ver datos originales</summary>
    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">${Object.entries(r).map(([campo,valor])=>`<div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 break-words"><dt class="text-xs font-bold text-slate-500 dark:text-slate-400">${item.grupo.startsWith('insumos_') && /costo|total_con_iva|total_sin_iva/.test(campo)?'IMPORTE HISTÓRICO · ':''}${areaEsc(campo.replaceAll('_',' '))}</dt><dd class="text-sm whitespace-pre-wrap">${valor===true?'Sí':valor===false?'No':valorHTML(valor)}</dd></div>`).join('')}</dl></details></article>`;
}
function jdaCuerpoHTML() {
  const fuente=areaFuente('workarea_jardineria');
  const datos=jdaDatos();
  const metricas=[['Sectores',datos?.sectores],['Trabajos definidos',datos?.trabajos],['Labores complementarias',datos?.laboresComplementarias]];
  const indicador=(titulo,valor)=>`<div class="alm-mini-stat alm-summary-card bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 text-center min-w-0"><p class="alm-summary-value text-xl font-black text-slate-900 dark:text-white">${valor}</p><p class="alm-summary-label text-xs text-slate-500 dark:text-slate-400 mt-1">${titulo}</p></div>`;
  const tabs=`<div class="alm-summary-grid grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">${metricas.map(([t,filas])=>indicador(t,fuente.estado==='listo'?areaActivos(filas).length:fuente.estado==='error'?'No disponible':'Consultando…')).join('')}${indicador('Movimientos históricos',jdaInsumos.estado==='listo'?jdaInsumos.datos.movimientos.length:jdaInsumos.estado==='error'?'No disponible':'Consultando…')}</div><nav aria-label="Apartados de Jardinería" class="alm-catalog-tabs flex flex-wrap gap-2 border-t border-slate-200 dark:border-slate-800 pt-4 mb-4">${JDA_TABS.map(([id,titulo])=>`<button type="button" onclick="jdaCambiarTab('${id}')" aria-pressed="${jdaEstado.tab===id}" class="px-3 py-2 rounded-xl text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 ${jdaEstado.tab===id?'bg-blue-600 text-white':'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700'}">${titulo}</button>`).join('')}</nav>`;
  if(jdaEstado.tab==='insumos') {
    if(jdaInsumos.estado==='error')return tabs+'<div role="alert" class="space-y-3"><p>No se pudo consultar el archivo histórico en Supabase. No se puede determinar su cobertura.</p><button type="button" onclick="jdaCargarInsumos(true)" class="px-4 py-2 rounded-xl bg-blue-600 text-white">Reintentar históricos</button></div>';
    if(jdaInsumos.estado!=='listo')return tabs+'<p role="status">Cargando históricos de insumos…</p>';
    const categorias=[['insumos_movimientos','Movimientos del archivo','movimientos'],['insumos_tareas','Aplicaciones registradas','tareas'],['insumos_importaciones','Información del archivo','importaciones']];
    return tabs+`<section class="space-y-3"><h3 class="text-base font-black text-slate-900 dark:text-white">Historial de insumos</h3><nav aria-label="Categorías del historial de insumos" class="alm-catalog-tabs flex flex-wrap gap-2">${categorias.map(([id,titulo,clave])=>`<button type="button" onclick="jdaFiltrar('tipo','${id}')" aria-pressed="${(jdaEstado.tipo||'insumos_movimientos')===id}" class="px-4 py-2.5 rounded-xl text-sm font-bold ${(jdaEstado.tipo||'insumos_movimientos')===id?'bg-blue-600 text-white':'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">${titulo} <span class="ml-1 font-black">${jdaInsumos.datos[clave].length}</span></button>`).join('')}</nav><p class="text-sm text-slate-500 dark:text-slate-400">${jdaEstado.tipo==='insumos_tareas'?'Tarea importada de aplicaciones; su estado original no confirma una ejecución.':jdaEstado.tipo==='insumos_importaciones'?'Procedencia documental de INSUMOS JARDINERIA.xlsx; no representa trabajos ni movimientos.':'Estos registros corresponden al archivo histórico y no representan existencias actuales'}</p><button type="button" onclick="openComplementarioDetail('INSUMOS JARDINERIA.xlsx')" class="text-sm text-blue-600 dark:text-blue-400 hover:underline">Consultar registro complementario original</button></section>${jdaFiltrosHTML()}<div id="jda-resultados">${jdaResultadosHTML()}</div>`;

  }
  if(fuente.estado==='error')return tabs+'<div role="alert" class="text-center py-8 space-y-3"><p>No se pudo consultar Jardinería en Supabase. No se puede determinar si hay registros.</p><button type="button" onclick="jdaRecargar()" class="px-4 py-2 bg-blue-600 text-white rounded-xl">Reintentar</button></div>';
  if(fuente.estado!=='listo')return tabs+'<p role="status">Cargando Jardinería…</p>';
  const total=jdaRegistros().length;
  const cabecera=jdaEstado.tab==='sectores'&&jdaEstado.sector?`<div class="space-y-2"><button type="button" onclick="jdaVolverSectores()" class="text-blue-600 dark:text-blue-400 underline">← Volver a sectores</button><p class="text-xs text-slate-500 dark:text-slate-400">Sectores → Trabajos</p><h3 class="font-black">Trabajos de: ${jdaEstado.sector==='__sin_sector__'?'Sin sector asignado':areaEsc(jdaSectorNombre(jdaEstado.sector))}</h3></div>`:'';
  const documental=jdaEstado.tab==='sectores'&&jdaEstado.sector?'Trabajos definidos — no ejecutados':jdaEstado.tab==='labores'?'Labores complementarias · contenido maestro':'';
  return tabs+cabecera+`<p class="text-xs text-slate-500 dark:text-slate-400 mt-2">${documental}</p>${total?'':'<p role="status" class="p-5">Sin registros documentales disponibles en este apartado.</p>'}${jdaFiltrosHTML()}<div id="jda-resultados">${jdaResultadosHTML()}</div>`;
}
