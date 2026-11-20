// GANTT-1: catálogo de cartas reales y presentación compartida con Prevencionista.
let ganttCartas = [];
let ganttFuentes = {};
let ganttConsulta = null;
let ganttSelectedProjectId = null;
let ganttFiltroFuente = '';
let gtPrevDatos=null;
let gtAviso='';
let gtEditando=null;
let gtGuardando=false;
const gtBackendConsultas = new Map();
const gtEsc = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function gtDia(valor) {
  if(valor&&typeof valor.getFullYear==='function'&&Number.isFinite(valor.getTime()))return String(valor.getFullYear()).padStart(4,'0')+'-'+String(valor.getMonth()+1).padStart(2,'0')+'-'+String(valor.getDate()).padStart(2,'0');
  const m=String(valor??'').match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if(!m)return null;
  const iso=m.slice(1).join('-'), d=new Date(iso+'T12:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:null;
}
function gtFecha(valor) { const d=gtDia(valor);return d?formatearFechaCL(d,{civil:true,vacio:'Sin fecha registrada'}):'Sin fecha registrada'; }
function gtModelo(t,fuente,fases=[]) {
  const pv=fuente==='Prevencionista', fase=fases.find(f=>f.id===t.fase_id);
  const bruto=pv?t.progreso_porcentaje:t.progreso;
  const progreso=bruto===null||bruto===undefined||String(bruto).trim()===''?null:Number(bruto);
  const modelo={id:t.id,titulo:t.titulo,faseId:t.fase_id??null,faseNombre:pv?(fase?.nombre||'Sin fase registrada'):(t.grupo_origen||'Sin fase registrada'),responsable:pv?t.responsable:t.responsable_texto,fechaInicio:gtDia(t.fecha_inicio),fechaFin:gtDia(pv?t.fecha_termino:(t.fecha_finalizacion||t.fecha_vencimiento)),progreso:Number.isFinite(progreso)?progreso:null,activo:t.activo!==false};
  if(!pv)modelo.estado=t.estado;
  return modelo;
}
function gtCarta(fuente,p,tareas,error=null,fases=[]) {
  const modelo=tareas.map(t=>gtModelo(t,fuente,fases));
  const fechas=[...modelo.flatMap(t=>[t.fechaInicio,t.fechaFin]),gtDia(p.fecha_inicio),gtDia(p.fecha_fin_estimada)].filter(Boolean).sort();
  const inicio=fechas[0]||gtDia(p.fecha_documento);
  const fin=fechas.at(-1)||null;
  const anio=inicio?inicio.slice(0,4):/^\d{4}$/.test(String(p.anio??''))?String(p.anio):'Sin fecha registrada';
  return {clave:fuente+':'+p.id,fuente,id:p.id,titulo:p.titulo||p.nombre||p.name||'Sin título registrado',estado:p.estado||p.status||null,historico:p.es_historico===true||!!p.importacion_id||p.origen_registro==='importado',contexto:p.space||p.empresa||p.titulo_proyecto||null,inicio,fin,anio,modelo,error,original:p,tareas};
}
async function gtCargar(force=false) {
  if(ganttConsulta)return ganttConsulta;
  if(!force&&Object.keys(ganttFuentes).length&&Object.values(ganttFuentes).every(v=>v==='listo')&&!ganttCartas.some(c=>c.error))return;
  ganttCartas=[];ganttFuentes={Remodelación:'cargando',Mejoras:'cargando',Prevencionista:'cargando'};
  ganttConsulta=(async()=>{
    await Promise.all(Object.keys(ganttFuentes).map(async fuente=>{
      try {
        let cartas;
        if(fuente==='Prevencionista') {
          const d=await window.MantencionesService.getPrevencionGantt(force);
          if(!d||!['planes','items','fases'].every(k=>Array.isArray(d[k])))throw Error('Respuesta incompleta');
          gtPrevDatos=d;
          cartas=gtCartasPrevencion(d);
        } else if(fuente==='Remodelación') {
          const servicio=window.RemodelacionesService;
          const proyectos=await servicio.getProyectos(force), tareas=await servicio.getTareasRemodelaciones();
          if(!Array.isArray(proyectos)||!Array.isArray(tareas))throw Error('Respuesta incompleta');
          cartas=proyectos.map(p=>gtCarta(fuente,p,tareas.filter(t=>t.proyecto_id===p.id)));
        } else {
          const servicio=window.MejorasService, proyectos=await servicio.getProyectos(force);
          if(!Array.isArray(proyectos))throw Error('Respuesta incompleta');
          cartas=await Promise.all(proyectos.map(async p=>{
            try {const tareas=await servicio.getTareas(p.id,force);if(!Array.isArray(tareas))throw Error('Respuesta incompleta');return gtCarta(fuente,p,tareas);}
            catch(_){return gtCarta(fuente,p,[],'No se pudieron consultar las tareas.');}
          }));
        }

        ganttCartas.push(...cartas);ganttFuentes[fuente]='listo';
      } catch(_){ganttFuentes[fuente]='error';}
    }));
  })();
  try{await ganttConsulta;}finally{ganttConsulta=null;}
}
function renderGanttView() {
  setTimeout(async()=>{
    const nodo=document.getElementById('gantt-content');if(!nodo)return;
    await gtCargar();if(document.getElementById('gantt-content')!==nodo)return;
    nodo.innerHTML=getGanttHTML();nodo.classList.remove('hidden');document.getElementById('gantt-loader')?.classList.add('hidden');
  },0);
  return uiCargandoHTML('gantt-loader') + '<div id="gantt-content" class="hidden w-full"></div>';
}
async function gtActualizar() {
  const nodo=document.getElementById('gantt-content');if(!nodo)return;
  nodo.innerHTML='<p role="status">Cargando registros…</p>';await gtCargar(true);
  if(document.getElementById('gantt-content')!==nodo)return;
  const carta=gtActual();
  if(carta){const lectura=gtLeerBackend(carta,true);nodo.innerHTML=getGanttHTML();await lectura;}
  if(document.getElementById('gantt-content')===nodo)nodo.innerHTML=getGanttHTML();
}
function gtFiltrar(valor){ganttFiltroFuente=valor;gtRepintar();}
function gtRepintar(conservar=false){
  const nodo=document.getElementById('gantt-content');if(!nodo)return;
  const posiciones=conservar?(window.GanttCarta?.capturarScroll?.(nodo)||[]):[];
  nodo.innerHTML=getGanttHTML();
  if(conservar)window.GanttCarta?.restaurarScroll?.(nodo,posiciones);
}
async function selectGanttProject(clave){
  const carta=ganttCartas.find(c=>c.clave===clave);if(!carta)return;
  ganttSelectedProjectId=clave;
  const nodo=document.getElementById('gantt-content');
  const lectura=gtLeerBackend(carta);gtRepintar();await lectura;
  if(nodo&&document.getElementById('gantt-content')===nodo&&ganttSelectedProjectId===clave)gtRepintar();
}
async function gtLeerBackend(carta,force=false){
  if(carta.fuente==='Prevencionista'||!window.GanttProyectosService)return;
  let entrada=gtBackendConsultas.get(carta.clave);
  if(!entrada||(force&&!entrada.promesa)){
    entrada={estado:'cargando',datos:null,error:null,promesa:null};
    gtBackendConsultas.set(carta.clave,entrada);
    entrada.promesa=(async()=>{
      try{entrada.datos=await window.GanttProyectosService.leer(carta.id);entrada.estado='listo';}
      catch(e){
        const noHabilitada=e?.code==='P0001'&&String(e.message||'').trim()==='ENTIDAD_NO_ENCONTRADA: carta no habilitada';
        entrada.estado=noHabilitada?'no_habilitada':'error';
        entrada.error=e?.message||'No se pudo consultar la administración de esta carta.';
      }
    })().finally(()=>{entrada.promesa=null;});
  }
  carta.backend=null;carta.backendError=null;carta.backendEstado=entrada.estado;
  if(entrada.promesa)await entrada.promesa;
  if(entrada.datos)gtAplicarBackend(carta,entrada.datos);
  else carta.backendError=entrada.error;
  carta.backendEstado=entrada.estado;
}

function backToGanttProjects(){ganttSelectedProjectId=null;gtRepintar();}
function gtOrdenadas(){return ganttCartas.filter(c=>(c.error||c.modelo.length>0||c.inicio||c.fin)&&(!ganttFiltroFuente||c.fuente===ganttFiltroFuente)).slice().sort((a,b)=>{
  if(a.anio==='Sin fecha registrada'&&b.anio!=='Sin fecha registrada')return 1;
  if(b.anio==='Sin fecha registrada'&&a.anio!=='Sin fecha registrada')return -1;
  return b.anio.localeCompare(a.anio)||(b.inicio||'').localeCompare(a.inicio||'')||a.titulo.localeCompare(b.titulo,'es');
});}
function gtTarjeta(c){return `<article class="alm-record-card bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 min-w-0"><div class="flex flex-wrap gap-2"><span class="text-xs font-bold text-purple-700 dark:text-purple-300">${gtEsc(c.fuente)}</span>${c.historico?'<span class="text-xs rounded-full px-2 bg-slate-100 dark:bg-slate-800">Histórico importado</span>':''}</div><h3 class="text-sm font-black text-slate-900 dark:text-white break-words">${gtEsc(c.titulo)}</h3>${c.contexto?`<p class="text-sm">${gtEsc(c.contexto)}</p>`:''}<p class="text-sm">${c.error?'Cantidad de tareas no disponible':c.modelo.length+' tareas registradas'}</p><p class="text-xs text-slate-500 dark:text-slate-400">${gtFecha(c.inicio)} → ${gtFecha(c.fin)}</p><p class="text-xs">${gtEsc(c.estado||'Sin estado registrado')}</p><div class="alm-gantt-card-action"><button type="button" data-clave="${gtEsc(c.clave)}" onclick="selectGanttProject(this.dataset.clave)" class="alm-btn-primary px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black">Abrir Carta Gantt</button></div></article>`;}
function gtDetalle(c){
  const grafico=c.error?'<p role="alert">No se pudieron consultar las tareas. Utiliza Actualizar para reintentar.</p>':window.GanttCarta?.render?window.GanttCarta.render({tareas:c.modelo,formatearFecha:gtFecha,textos:{vacio:'Esta carta no tiene tareas registradas.',sinFechas:'No hay fechas registradas para construir la línea temporal.',sinBarra:'Sin fechas suficientes para dibujar la barra',notaEscala:dias=>`Escala diaria · ${dias} días derivados de las fechas reales. Vista de solo lectura.`}}):'<p role="alert">El componente GanttCarta no está disponible.</p>';
  return `<section class="alm-panel bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm min-w-0"><button type="button" onclick="backToGanttProjects()" class="text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-900 px-3 py-2 rounded-xl mb-3">← Volver a Cartas Gantt</button><div class="pb-4 border-b border-slate-100 dark:border-slate-800"><span class="text-xs font-extrabold text-purple-700 dark:text-purple-300">Carta Gantt · ${gtEsAdmin()&&(c.backend||c.fuente==='Prevencionista')?'administración':'solo lectura'} · ${gtEsc(c.fuente)}</span><h2 class="text-lg font-black text-slate-900 dark:text-white mt-2">${gtEsc(c.titulo)}</h2></div><p class="text-sm my-3">${c.error?'Tareas no disponibles':c.modelo.length+' tareas registradas'} · ${gtFecha(c.inicio)} → ${gtFecha(c.fin)}</p>${gtControles(c)}${grafico}</section>`;
}
function getGanttHTML(){
  const errores=(gtAviso?`<p role="status" class="text-sm text-amber-800 dark:text-amber-300">${gtEsc(gtAviso)}</p>`:'')+Object.entries(ganttFuentes).filter(([,v])=>v==='error').map(([k])=>`<p role="alert" class="text-sm text-rose-700 dark:text-rose-300">${gtEsc(k)}: no se pudo consultar Supabase; cobertura no disponible.</p>`).join('');
  const cabecera=uiEncabezadoSeccion('Línea de Tiempo / Carta Gantt','Planificación y registros reales, agrupados por año.','calendar','<button type="button" onclick="gtActualizar()" class="alm-btn-secondary">Actualizar</button>');
  const seleccion=ganttCartas.find(c=>c.clave===ganttSelectedProjectId);
  if(seleccion)return `<div class="alm-ui alm-main-page alm-module-page alm-gantt-page w-full space-y-4 pb-10">${cabecera}${errores}${gtDetalle(seleccion)}</div>`;
  const cartas=gtOrdenadas(),grupos=new Map();cartas.forEach(c=>{if(!grupos.has(c.anio))grupos.set(c.anio,[]);grupos.get(c.anio).push(c);});
  return `<div class="alm-ui alm-main-page alm-module-page alm-gantt-page w-full space-y-4 pb-10 text-slate-700 dark:text-slate-200">${cabecera}${errores}<label class="block text-sm font-bold">Contexto<select onchange="gtFiltrar(this.value)" class="block mt-1 w-full sm:w-72 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">${['','Prevencionista','Mejoras','Remodelación'].map(v=>`<option value="${v}" ${ganttFiltroFuente===v?'selected':''}>${v||'Todas las fuentes'}</option>`).join('')}</select></label>${[...grupos].map(([anio,items])=>`<section class="space-y-3"><h3 class="text-base font-black">${anio}</h3><div class="alm-record-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">${items.map(gtTarjeta).join('')}</div></section>`).join('')||'<p role="status">Sin cartas disponibles en las fuentes consultadas. Los errores se indican por separado.</p>'}</div>`;
}

// GANTT-2: administración con contratos por módulo; el renderer no escribe.
function gtEsAdmin(){return typeof esAdminPermanenteActual==='function'&&esAdminPermanenteActual()===true;}
function gtAplicarBackend(c,d){
  const tareas=d.tareas.slice().sort((a,b)=>{
    const fa=d.fases.find(f=>f.id===a.asignacion?.fase_id),fb=d.fases.find(f=>f.id===b.asignacion?.fase_id);
    return (fa?.orden??Infinity)-(fb?.orden??Infinity)||(a.asignacion?.orden??Infinity)-(b.asignacion?.orden??Infinity)||String(a.registro.fecha_inicio||'').localeCompare(String(b.registro.fecha_inicio||''));
  });
  const base=gtCarta(c.fuente,c.original,tareas.map(t=>t.registro));Object.assign(c,base);
  c.backend=d;c.backendError=null;c.backendEstado='listo';gtBackendConsultas.set(c.clave,{estado:'listo',datos:d,error:null,promesa:null});c.titulo=d.carta.titulo||c.titulo;
  c.modelo=tareas.map(t=>{const m=gtModelo(t.registro,c.fuente),f=d.fases.find(f=>f.id===t.asignacion?.fase_id);m.faseId=f?.id||null;m.faseNombre=f?.nombre||'Sin fase asignada';return m;});
}
function gtBoton(texto,accion,datos=''){return `<button type="button" ${datos} onclick="${accion}" class="px-3 py-2 rounded-xl text-xs font-bold border border-purple-200 dark:border-purple-900 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60">${texto}</button>`;}
function gtControles(c){
  if(c.fuente==='Prevencionista')return gtEsAdmin()?`<div class="flex flex-wrap gap-2 mb-4">${gtBoton('Administrar carta','gtAbrirPrevencion()')}</div>`:'';
  if(c.backendEstado==='cargando')return '<p role="status" class="text-sm mb-3">Consultando información de la carta…</p>';
  if(c.backendEstado==='no_habilitada')return '<p role="status" class="text-sm text-slate-500 dark:text-slate-400 mb-3">Edición backend no habilitada para esta carta. Se conserva su información histórica.</p>';
  if(!c.backend)return `<p role="${c.backendEstado==='error'?'alert':'status'}" class="text-sm mb-3">Administración no disponible: ${gtEsc(c.backendError||'no se pudo verificar la carta habilitada.')}</p>`;
  const nota='<p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Las tareas con línea base histórica son de solo lectura. Sin asignación, se muestran como «Sin fase asignada».</p>';
  if(!gtEsAdmin())return nota;
  return nota+`<div class="flex flex-wrap gap-2 mb-4">${gtBoton('+ Agregar fase',"gtAbrirFormulario('fase')")}${gtBoton('+ Agregar tarea',"gtAbrirFormulario('tarea')")}${gtBoton('Editar información',"gtAbrirFormulario('carta')")}${gtBoton('Administrar estructura','gtAbrirEstructura()')}</div>`;
}
function gtActual(){return ganttCartas.find(c=>c.clave===ganttSelectedProjectId);}
function gtAbrirPrevencion(){
  const c=gtActual();if(!gtEsAdmin()||c?.fuente!=='Prevencionista'||!gtPrevDatos)return;
  pvPlanes=gtPrevDatos.planes;pvFases=gtPrevDatos.fases;pvItems=gtPrevDatos.items;
  const clave=c.clave,contenedor=document.getElementById('gantt-content');
  pvTrasGuardarExterno=async()=>{
    const d=await window.MantencionesService.getPrevencionGantt(true);
    if(!d||!['planes','fases','items'].every(k=>Array.isArray(d[k])))throw Error('Relectura incompleta');
    gtPrevDatos=d;ganttCartas=ganttCartas.filter(c=>c.fuente!=='Prevencionista').concat(gtCartasPrevencion(d));
    ganttFuentes.Prevencionista='listo';
    pvPlanes=d.planes;pvFases=d.fases;pvItems=d.items;
    if(document.getElementById('gantt-content')!==contenedor||ganttSelectedProjectId!==clave)return false;
    gtRepintar(true);if(pvPlanes.some(p=>p.id===c.id&&p.activo!==false))pvAbrirCartaGantt(c.id);else {pvCerrarAdmin();pvCerrarCartaGantt();}
  };
  pvAbrirCartaGantt(c.id);
}
function gtCampo(id,titulo,valor,op={}){return pvCampoTexto('gt-f-'+id,titulo,valor,op);}
function gtAbrirFormulario(tipo,id=null){
  const c=gtActual();if(gtGuardando||!gtEsAdmin()||!c?.backend)return;
  const d=c.backend;let valores={},campos='',titulo='';
  if(tipo==='fase'){
    valores=id?d.fases.find(f=>f.id===id):{};if(!valores)return;
    titulo=id?'Editar fase':'Agregar fase';campos=gtCampo('nombre',id?'Nombre de la fase':'Nombre de la nueva fase',valores.nombre,{obligatorio:true})+gtCampo('descripcion','Descripción de la fase (opcional)',valores.descripcion);
  }else if(tipo==='carta'){
    titulo='Editar información de la carta';campos=gtCampo('titulo','Título',d.carta.titulo||c.titulo,{obligatorio:true})+gtCampo('descripcion','Descripción (opcional)',d.carta.descripcion);
  }else if(tipo==='tarea'){
    const t=id?d.tareas.find(t=>t.registro.id===id):null;if(id&&(!t||t.linea_base!==null))return;
    valores=t?.registro||{};titulo=id?'Editar tarea':'Agregar tarea';
    campos=gtCampo('titulo',id?'Nombre de la tarea':'Nombre de la nueva tarea',valores.titulo,{obligatorio:true})+gtCampo('descripcion','Descripción de la tarea (opcional)',valores.descripcion)+`<label class="block text-xs font-bold">Fase a la que pertenece *<select id="gt-f-fase" class="w-full mt-1 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"><option value="">Selecciona una fase</option>${d.fases.map(f=>`<option value="${gtEsc(f.id)}" ${t?.asignacion?.fase_id===f.id?'selected':''}>${gtEsc(f.nombre)}</option>`).join('')}</select></label>`+gtCampo('responsable','Responsable de la tarea (opcional)',valores.responsable_texto)+gtCampo('inicio','Fecha de inicio de la tarea (opcional)',gtDia(valores.fecha_inicio),{tipo:'date'})+gtCampo('fin','Fecha de término de la tarea (opcional)',gtDia(valores.fecha_vencimiento),{tipo:'date'})+gtCampo('progreso','Porcentaje de avance (opcional)',valores.progreso,{tipo:'number',min:0,max:100})+'<p class="text-sm">Deja el porcentaje vacío si no hay avance registrado. El valor 0 indica un avance registrado de 0 %.</p>';
    if(!d.fases.length)campos+='<p class="text-sm">Primero agrega una fase para crear o asociar tareas nuevas.</p>';
  }else return;
  gtEditando={clave:c.clave,tipo,id,datos:d,version:d.carta.version};
  pvFormPreparar('externo',null,null,null);
  pvFormularioExterno={guardar:gtGuardarFormulario,cerrar:()=>{gtEditando=null;}};
  pvFormOcupado(false);pvAbrirForm(titulo,campos);document.addEventListener('keydown',pvTeclaEscape,true);
}
async function gtGuardarFormulario(){
  const ctx=gtEditando;if(gtGuardando||!gtEsAdmin()||!ctx||gtActual()?.clave!==ctx.clave)return;
  const texto=id=>{const v=document.getElementById('gt-f-'+id)?.value;return v?.trim()||null;};
  let valores={id:ctx.id};
  if(ctx.tipo==='fase')valores={...valores,nombre:texto('nombre'),descripcion:texto('descripcion')};
  else valores={...valores,titulo:texto('titulo'),descripcion:texto('descripcion')};
  if(!(valores.nombre||valores.titulo)){pvFormError('Completa el nombre o título obligatorio.');return;}
  if(ctx.tipo==='tarea'){
    const bruto=texto('progreso');valores={...valores,faseId:texto('fase'),responsable:texto('responsable'),inicio:texto('inicio'),fin:texto('fin'),progreso:bruto===null?null:Number(bruto)};
    if([valores.inicio,valores.fin].some(v=>v&&gtDia(v)!==v)){pvFormError('Introduce fechas válidas.');return;}
  }
  await gtEjecutar(ctx,ctx.tipo,valores);
}
async function gtEjecutar(ctx,tipo,valores){
  if(gtGuardando||!gtEsAdmin()||gtActual()?.clave!==ctx.clave)return;
  gtGuardando=true;pvFormOcupado(true);pvFormError(null);let confirmado=false;
  const nodo=document.getElementById('gantt-content');
  const c=ganttCartas.find(c=>c.clave===ctx.clave);
  let actualizado=false;
  try{
    await window.GanttProyectosService.guardar(ctx.datos,tipo,valores);confirmado=true;
    // Impedir reenvíos con versión antigua si la relectura falla.
    if(c){c.backend=null;c.backendEstado='cargando';gtBackendConsultas.delete(c.clave);}
    if(c?.fuente==='Mejoras'&&window.MejorasService?._tareasCache)delete window.MejorasService._tareasCache[c.id];
    pvFormOcupado(false);pvCerrarForm();
    if(document.getElementById('gantt-content')===nodo&&ganttSelectedProjectId===ctx.clave){gtAviso='Guardado confirmado. Actualizando la carta…';gtRepintar(true);}
    const d=await window.GanttProyectosService.leer(ctx.datos.proyecto.id);if(c)gtAplicarBackend(c,d);
    actualizado=true;
    if(ganttSelectedProjectId===ctx.clave)gtAviso='';
  }catch(e){
    if(!confirmado){pvFormError((e.message||'No se pudo guardar.')+' Si la versión cambió, cancela y actualiza la carta antes de reintentar.');return;}
    if(c){c.backendEstado='error';c.backendError='No se pudo actualizar la carta.';}
    if(ganttSelectedProjectId===ctx.clave)gtAviso='Guardado confirmado. Falló la relectura; actualiza desde Supabase antes de continuar.';
  }finally{
    gtGuardando=false;pvFormOcupado(false);
    if(confirmado&&document.getElementById('gantt-content')===nodo&&ganttSelectedProjectId===ctx.clave){gtRepintar(true);if(actualizado)window.GanttCarta?.avisarGuardado?.();}
  }
}
function gtAbrirEstructura(){
  const c=gtActual();if(gtGuardando||!gtEsAdmin()||!c?.backend)return;
  const d=c.backend,botonEditar=(tipo,id)=>gtBoton('Editar',`gtAbrirFormulario('${tipo}',this.dataset.id)`,`data-id="${gtEsc(id)}"`);
  const flechas=(tipo,id,fase)=>[-1,1].map(delta=>gtBoton(delta===-1?'↑':'↓',`gtMover('${tipo}',this.dataset.id,${delta},this.dataset.fase)`,`aria-label="${delta===-1?'Subir':'Bajar'} registro" data-id="${gtEsc(id)}" data-fase="${gtEsc(fase||'')}"`)).join('');
  const fases=d.fases.slice().sort((a,b)=>(a.orden??0)-(b.orden??0));
  const campos=`<h4 class="font-bold">Fases</h4>${fases.map(f=>`<div class="flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-slate-800 py-2"><span class="flex-1 text-sm">${gtEsc(f.nombre)}</span>${botonEditar('fase',f.id)}${flechas('FASES',f.id,null)}</div>`).join('')||'<p>Sin fases registradas.</p>'}<h4 class="font-bold mt-4">Tareas</h4>${d.tareas.map(t=>{const r=t.registro,f=d.fases.find(f=>f.id===t.asignacion?.fase_id),historico=t.linea_base!==null;const bloqueado=d.tareas.some(x=>x.asignacion?.fase_id===f?.id&&x.linea_base!==null);return `<div class="border-b border-slate-100 dark:border-slate-800 py-2 space-y-2"><p class="text-sm font-bold">${gtEsc(r.titulo)}</p><p class="text-xs">${gtEsc(f?.nombre||'Sin fase asignada')} · ${historico?'Histórico — solo lectura':'Creada en el sistema'}</p>${historico?'':botonEditar('tarea',r.id)+(f&&!bloqueado?flechas('TAREAS',r.id,f.id):'')}</div>`;}).join('')||'<p>Sin tareas registradas.</p>'}`;
  pvFormPreparar('externo',null,null,null);
  pvFormularioExterno={guardar:()=>{},cerrar:()=>{}};pvAbrirForm('Administrar estructura',campos);document.getElementById('pv-form-guardar').classList.add('hidden');document.addEventListener('keydown',pvTeclaEscape,true);
}
async function gtMover(tipo,id,delta,faseId){
  const c=gtActual();if(gtGuardando||!gtEsAdmin()||!c?.backend)return;const d=c.backend;
  let registros=tipo==='FASES'?d.fases:d.tareas.filter(t=>t.asignacion?.fase_id===faseId).map(t=>({id:t.registro.id,orden:t.asignacion.orden}));
  registros=registros.slice().sort((a,b)=>(a.orden??0)-(b.orden??0));const ids=registros.map(r=>r.id),i=ids.indexOf(id),j=i+delta;if(i<0||j<0||j>=ids.length)return;[ids[i],ids[j]]=[ids[j],ids[i]];
  await gtEjecutar({clave:c.clave,datos:d},'orden',{tipo,faseId,ids});
}

function gtCartasPrevencion(d){const fuente='Prevencionista';return d.planes.filter(p=>p.activo!==false).map(p=>gtCarta(fuente,p,d.items.filter(t=>t.plan_id===p.id&&t.activo!==false&&t.es_grupo!==true&&String(t.titulo??'').trim()).sort((a,b)=>{const fa=d.fases.find(f=>f.id===a.fase_id),fb=d.fases.find(f=>f.id===b.fase_id);return (fa?.orden??Infinity)-(fb?.orden??Infinity)||(a.orden??a.fila_origen??Infinity)-(b.orden??b.fila_origen??Infinity);}),null,d.fases));}
