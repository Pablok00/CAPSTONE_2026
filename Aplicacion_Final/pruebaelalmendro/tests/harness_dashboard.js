// PRE-VERCEL-2B: Dashboard real mediante servicios simulados solo en memoria.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');let total=0;
function check(n,v){assert.ok(v,n);total++;console.log('[PASS] '+n);}
const baseFrontend=process.env.DASHBOARD_TEST_ESPEJO==='1'?'publicacion/':'';
const utilidades=fs.readFileSync(baseFrontend+'js/state.js','utf8');
const cargaCompartida=utilidades.slice(utilidades.indexOf('function uiCargandoHTML('),utilidades.indexOf('function calculateWarrantyStatus('));
const codigo=fs.readFileSync((process.env.DASHBOARD_TEST_ESPEJO==='1'?'publicacion/':'')+'js/views/dashboard.js','utf8');
function preparar(){
 const nodos=new Map(),timers=[],llamadas=[],fuentes={};
 const datos={mejoras:[{id:'m',nombre:'Mejora documentada'}],remodelaciones:[{id:'r1',name:'Habitación real'},{id:'r2',name:'Proyecto sin tareas'},{id:'r3',name:'Otra renovación'}],tm:[{id:'t1',proyecto_id:'m',estado:'Histórico'},{id:'t2',proyecto_id:'m'}],tr:[{id:'t3',proyecto_id:'r1'},{id:'t4',proyecto_id:'r1'},{id:'t5',proyecto_id:'r1'},{id:'t6',proyecto_id:'r3'},{id:'huerfana',proyecto_id:null},{id:'ajena',proyecto_id:'no-existe'}],equipos:[{id:'e1'},{id:'e2'}],bodegas:[{id:'b1'},{id:'b2'},{id:'b3'}],ubicaciones:[
 {id:'u10',nombre:'Habitación 10',tipo:'HABITACION'},
 {id:'u2',nombre:'Habitación 2',tipo:'HABITACION'},
 {id:'u3',nombre:'Habitación 3',tipo:'HABITACION'},
 {id:'u4',nombre:'Bodega principal',tipo:'BODEGA'},
 {id:'u5',nombre:'<Sin clasificación>',tipo:null}],pendientes:{pendiente:7,aprobada:2,rechazada:1}};let falla='';
 const nodo=id=>{if(!nodos.has(id))nodos.set(id,{innerHTML:'',classList:{add(){},remove(){}}});return nodos.get(id);};
 const leer=(nombre,clave)=>async(...args)=>{llamadas.push([nombre,...args]);if(falla===nombre)throw Error('Fallo de consulta');return structuredClone(datos[clave]);};
 const eventos={}; const c={window:{addEventListener:(nombre,fn)=>{eventos[nombre]=fn;},SolicitudesService:{contarSolicitudesAdministrativas:leer('pendientes','pendientes')},MejorasService:{getProyectos:leer('proyectosMejoras','mejoras'),getTareas:leer('tareasMejoras','tm')},RemodelacionesService:{getProyectos:leer('proyectosRemodelacion','remodelaciones'),getTareasRemodelaciones:leer('tareasRemodelacion','tr')},MantencionesService:{getElementosMaquinas:leer('equipos','equipos'),getInventarios:leer('bodegas','bodegas'),getUbicacionesTV:async(tipo,opciones)=>{const rows=await leer('ubicaciones','ubicaciones')();return opciones?.soloCantidad?rows.length:rows;}}},document:{getElementById:nodo},clearTimeout(){},calendarioFechaCivilLocal:()=> '2026-11-10',setTimeout:fn=>timers.push(fn),async areaCargarFuentes(){llamadas.push(['areas']);},areaTarjetasHTML:()=>'<div data-seis-areas="reales">TARJETAS EXISTENTES</div>',areaEsc:v=>String(v??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k])),getSystemDate(){throw Error('No usar reloj fijo');},syncMaintenanceAlertNotifications(){throw Error('No crear alertas locales');},state:{currentUser:{role:'ADMINISTRADOR'}},currentView:'dashboard',esAdminOperativoActual:()=>true,hasAccess:()=>true,navigateTo(v){c.currentView=v;llamadas.push(['navegar',v]);},abrirMantencionSubapartado:id=>llamadas.push(['modal',id])};
 for(const k of ['assets','maintenances','requests','improvements','renovations'])Object.defineProperty(c.state,k,{get(){throw Error('Datos locales prohibidos');}});
 vm.createContext(c);vm.runInContext(cargaCompartida,c);vm.runInContext(codigo,c);return {c,nodo,nodos,timers,datos,llamadas,eventos,set falla(v){falla=v;}};
}
const resumen=c=>vm.runInContext('dashboardResumen',c);
async function probarModalYConteos() {
 const fuente=fs.readFileSync('js/views/mantenciones.js','utf8');
 const extraer=(inicio,fin)=>fuente.slice(fuente.indexOf(inicio),fuente.indexOf(fin,fuente.indexOf(inicio)));
 const c=vm.createContext({window:{esAdminOperativoActual:()=>true},mntEsc:preparar().c.areaEsc});
 vm.runInContext(extraer('function mntBuscarUbicacionesHotel','const MNT_ERRORES_ALTA_UBICACION')+
   extraer('function mntPanelUbicacionesHotelHTML','function getPanelSubapartadoHTML'),c);
 const {ubicaciones}=preparar().datos;
 const html=c.mntPanelUbicacionesHotelHTML(ubicaciones);
 check('modal: orden natural, sin tipo y total',html.indexOf('Habitación 2</p>')<html.indexOf('Habitación 10</p>')&&html.includes('Sin tipo</option>')&&html.includes('Resultados: 5')&&html.includes('5 ubicaciones registradas'));
 check('modal: alta vigente, filtros fijos y resumen por tipo',html.includes('Agregar ubicación')&&html.indexOf('mnt-ubicaciones-filtros')<html.indexOf('mnt-ubicaciones-listado')&&html.includes('Habitaciones</span><strong>3</strong>')&&html.includes('🛏️')&&html.includes('aria-pressed="false"'));
 check('modal: tipo evidente no se repite',!html.includes('>Habitación</p>'));
 c.window.esAdminOperativoActual=()=>false;
 check('modal: alta oculta sin autorización',!c.mntPanelUbicacionesHotelHTML(ubicaciones).includes('Agregar ubicación'));
 const grupos=Array.from(html.matchAll(/data-ubicaciones-grupo="([^"]*)"[\s\S]*?<\/section>/g),([bloque,ubicacionesGrupo])=>({
   dataset:{ubicacionesGrupo},
   querySelectorAll:()=>Array.from(bloque.matchAll(/data-ubicacion-nombre="([^"]*)"/g),([,ubicacionNombre])=>({dataset:{ubicacionNombre}}))
 }));
 for(const grupo of grupos) grupo.filas=grupo.querySelectorAll(),grupo.querySelectorAll=()=>grupo.filas;
 const [busqueda,filtro,resultados,vacio]=[{value:'habitacion 2'},{value:''},{},{}];
 const selectores={'[data-ubicaciones-busqueda]':busqueda,'[data-ubicaciones-filtro]':filtro,'[data-ubicaciones-resultados]':resultados,'[data-ubicaciones-vacio]':vacio};
 const volver={dataset:{},hidden:true};
 selectores['[data-ubicaciones-volver]']=volver;
 const tarjetas=grupos.map(g=>({dataset:{ubicacionesCategoria:g.dataset.ubicacionesGrupo},setAttribute(k,v){this[k]=v;},focus(){this.enfocada=true;}}));
 const panel={dataset:{},querySelector:s=>selectores[s]??tarjetas.find(t=>s.endsWith('="'+t.dataset.ubicacionesCategoria+'"]')),querySelectorAll:s=>s==='[data-ubicaciones-categoria]'?tarjetas:grupos};
 busqueda.value='';
 c.mntBuscarUbicacionesHotel({closest:()=>panel});
 check('modal: apertura solo con categorías',grupos.every(g=>g.hidden)&&volver.hidden&&resultados.textContent==='Resultados: 5'&&(html.match(/aria-labelledby="mnt-ubicacion-tipo-\d+" hidden/g)||[]).length===grupos.length);
 const tarjeta=tarjetas[0];
 c.mntElegirCategoriaUbicaciones({...tarjeta,closest:()=>panel});
 check('modal: elegir categoría sincroniza el filtro y abre solo su listado',filtro.value===tarjeta.dataset.ubicacionesCategoria&&tarjeta['aria-pressed']==='true'&&!grupos[0].hidden&&grupos.slice(1).every(g=>g.hidden)&&!volver.hidden);
 c.mntElegirCategoriaUbicaciones({...volver,closest:()=>panel});
 check('modal: volver restaura categorías y foco',filtro.value===''&&grupos.every(g=>g.hidden)&&volver.hidden&&tarjeta.enfocada);
 busqueda.value='habitacion 2';
 const filtrar=()=>c.mntBuscarUbicacionesHotel({closest:()=>panel});
 filtro.value=grupos.find(g=>g.filas.some(f=>f.dataset.ubicacionNombre==='Habitación 2')).dataset.ubicacionesGrupo;
 filtrar();check('modal: búsqueda sin tilde combinada con tipo y vista plana',resultados.textContent==='Resultados: 1'&&panel.dataset.busquedaActiva==='true'&&grupos.filter(g=>!g.hidden).length===1);
 filtro.value=grupos.find(g=>g.filas.some(f=>f.dataset.ubicacionNombre.includes('clasificación'))).dataset.ubicacionesGrupo;
 filtrar();check('modal: ningún resultado para filtros incompatibles',resultados.textContent==='Resultados: 0'&&!vacio.hidden);
 busqueda.value='';filtrar();check('modal: filtro Sin tipo y regreso a grupos',resultados.textContent==='Resultados: 1'&&vacio.hidden&&panel.dataset.busquedaActiva==='false');
 const siete=c.mntPanelUbicacionesHotelHTML(Array.from({length:7},(_,i)=>({nombre:'Habitación '+(i+1),tipo:'HABITACION'})));
 const css=fs.readFileSync('css/ui-system.css','utf8');
 check('modal: seis visibles inicialmente y búsqueda sin límite de grupo',(siete.match(/data-ubicacion-adicional/g)||[]).length===1&&siete.includes('Ver más (1)')&&css.includes(':not([data-busqueda-activa="true"]) .mnt-ubicaciones-grupo:not([data-expandido="true"]) [data-ubicacion-adicional]'));
 const grupo=grupos[0], boton={dataset:{adicionales:'1'},closest:()=>grupo,setAttribute(k,v){this[k]=v;}};
 c.mntAlternarGrupoUbicaciones(boton);
 check('modal: expansión local actualiza accesibilidad',grupo.dataset.expandido==='true'&&boton['aria-expanded']==='true'&&boton.textContent==='Ver menos');
 c.mntAlternarGrupoUbicaciones(boton);
 check('modal: volver a seis sin modificar otros grupos',grupo.dataset.expandido==='false'&&grupos[1].dataset.expandido===undefined&&boton.textContent==='Ver más (1)');

 let admin=true,count=4,lecturas=0,usuario='admin';
 const peticiones=[];
 const api=vm.createContext({state:{currentUser:{id:'admin'}},esAdminOperativoActual:()=>admin,window:{supabaseClient:{
   auth:{getUser:async()=>{lecturas++;return {data:{user:{id:usuario}}};}},
   from:tabla=>({select:(columna,opts)=>({eq:async(campo,estado)=>{peticiones.push([tabla,columna,opts,campo,estado]);return {count};}})})
 }}});
 vm.runInContext(fs.readFileSync('js/services/solicitudes.service.js','utf8'),api);
 const servicio=api.window.SolicitudesService;
 const resumen=await servicio.contarSolicitudesAdministrativas();
 check('servicio: identidad única y conteo HEAD exacto de los tres estados',lecturas===1&&peticiones.length===3&&
   peticiones.every(([tabla,columna,opts,campo])=>tabla==='solicitudes_reactivas'&&columna==='id'&&opts.head&&opts.count==='exact'&&campo==='estado')&&
   Object.keys(resumen).join(',')==='pendiente,aprobada,rechazada'&&resumen.rechazada===4);
 admin=false;check('servicio: sin permiso no consulta filas',await servicio.contarSolicitudesAdministrativas()===null&&peticiones.length===3);
 admin=true;usuario='otra';await assert.rejects(servicio.contarSolicitudesAdministrativas(),/sesión no es válida/);
 check('servicio: sesión de otra identidad no consulta filas',peticiones.length===3);
 usuario='admin';count=null;await assert.rejects(servicio.contarSolicitudesAdministrativas(),/conteo.*no está disponible/);
 check('servicio: conteo ausente se rechaza',peticiones.length===6);
}

async function main(){
 await probarModalYConteos();
 const r=preparar(),c=r.c;await c.dashboardCargarResumen();let d=resumen(c),html=c.getDashboardHTML();
 check('cuatro métricas dinámicas de servicios existentes',d.proyectos===4&&d.ubicacionesTotal===5&&d.solicitudes?.pendiente===7&&d.equipos===2&&d.bodegas===null);
 check('cuatro tarjetas con títulos documentales exactos',(c.dashboardIndicadoresHTML().match(/<article /g)||[]).length===4&&['Proyectos registrados','Solicitudes','Equipos registrados de Mantención de Máquinas','Ubicaciones del hotel'].every(t=>html.includes(t)));
 const lecturasKpi=r.llamadas.length;
 for(const habilitada of [true,false]){
   c.window.GestionTareas={habilitada,puede:()=>false};const kpi=c.dashboardIndicadoresHTML();
   check('Ubicaciones permanece como cuarto KPI sin consultas, bandera '+habilitada,(kpi.match(/<article /g)||[]).length===4&&kpi.includes('Ubicaciones registradas.')&&kpi.includes('Habitaciones, bodegas, salones y otras áreas.')&&!kpi.includes('Fichas históricas de bodegas')&&r.llamadas.length===lecturasKpi);
 }
 delete c.window.GestionTareas;
 check('resumen ya no consulta las tareas de proyectos',!r.llamadas.some(([n])=>n.startsWith('tareas'))&&!html.includes('Tareas registradas por proyecto'));
 c.dashboardAbrirUbicaciones();check('acceso directo abre el mismo modal desde Mantención General',JSON.stringify(r.llamadas.slice(-2))===JSON.stringify([['navegar','mantenciones'],['modal','ubicaciones']]));
 c.hasAccess=()=>false;const antes=r.llamadas.length;c.dashboardAbrirUbicaciones();check('ruta denegada oculta el acceso e impide abrir el modal',r.llamadas.length===antes&&!c.dashboardUbicacionesHTML().includes('Gestionar ubicaciones'));c.hasAccess=()=>true;
 check('Dashboard retira solo tarjeta visual; catálogo de ubicaciones intacto',!html.includes('id="dashboard-ubicaciones"')&&c.dashboardAgruparUbicaciones(r.datos.ubicaciones).find(g=>g.tipo==='HABITACION').cantidad===3);
 check('tarjetas compactas sin expansión y una sola consulta',!html.includes('<details')&&!html.includes('Habitación 10')&&!html.includes('id="dashboard-ubicaciones"')&&r.llamadas.filter(([n])=>n==='ubicaciones').length===1);
 check('solicitudes por tres estados',html.includes('Pendientes <span')&&html.includes('Aprobadas: 2')&&html.includes('Rechazadas: 1'));
 check('Ubicaciones permanece en Mantención y no ocupa Dashboard',(html.match(/Gestionar ubicaciones/g)||[]).length===0&&!c.dashboardIndicadoresHTML().includes('Gestionar ubicaciones'));
 const tecnico=preparar();tecnico.c.esAdminOperativoActual=()=>false;await tecnico.c.dashboardCargarResumen();
 check('sin permiso se conserva el KPI sin consultar solicitudes',!tecnico.llamadas.some(([n])=>n==='pendientes')&&tecnico.c.dashboardIndicadoresHTML().includes('Sin acceso'));
 const alta=preparar();await alta.c.dashboardCargarResumen();alta.datos.ubicaciones.push({id:'nueva',nombre:'Bodega nueva',tipo:'BODEGA'});
 const primera=alta.eventos['hotel:ubicaciones-actualizadas']();const repetida=alta.eventos['hotel:ubicaciones-actualizadas']();await primera;
 check('el evento de alta refresca solo ubicaciones y agrupa avisos simultáneos',repetida===undefined&&alta.llamadas.filter(([n])=>n==='ubicaciones').length===2&&alta.llamadas.filter(([n])=>n==='pendientes').length===1&&resumen(alta.c).ubicacionesTotal===6&&alta.nodo('dashboard-kpis').outerHTML.includes('dashboard-indicadores'));
 alta.c.currentView='inventario';await alta.eventos['hotel:ubicaciones-actualizadas']();await alta.c.dashboardCargarResumen();
 check('fuera de Dashboard el evento no lee y la navegación actualiza',alta.llamadas.filter(([n])=>n==='ubicaciones').length===3);
 check('seis tarjetas originales se reutilizan sin cambios',html.includes(c.areaTarjetasHTML()));
 check('orden conserva encabezado, cuatro tarjetas y áreas',html.indexOf('Hotel &')<html.indexOf('id="dashboard-indicadores"')&&html.indexOf('id="dashboard-indicadores"')<html.indexOf('id="area-tarjetas"'));
 check('Dashboard sin acceso redundante y Gantt conserva su ruta lateral',!html.includes("navigateTo('gantt')")&&/id="nav-gantt"[\s\S]*?Línea de Tiempo \/ Gantt/.test(fs.readFileSync('index.html','utf8'))&&html.includes('dark:bg-slate-900')&&html.includes('xl:grid-cols-4'));
 check('retira mensajes antiguos solo del resumen reemplazado',!html.includes('Indicadores generales pendientes')&&!html.includes('Sin datos')&&!html.includes('Nueva Solicitud'));
 check('sin cifras de referencia hardcodeadas ni reloj fijo',!/\b(217|95|39|48|29|21)\b/.test(codigo)&&!codigo.includes('getSystemDate('));
 r.datos.mejoras.push({id:'m',nombre:'Mejora documentada'});r.datos.tr.push({id:'t3',proyecto_id:'r1'});r.datos.equipos.push({id:'e1'});await c.dashboardCargarResumen();d=resumen(c);check('IDs duplicados de proyectos y equipos cuentan una vez',d.proyectos===4&&d.ubicacionesTotal===5&&d.solicitudes?.pendiente===7&&d.equipos===2);
 for(const fallo of ['proyectosMejoras','proyectosRemodelacion','ubicaciones','pendientes','equipos']){
   const e=preparar();e.falla=fallo;await e.c.dashboardCargarResumen();const ed=resumen(e.c);
   check('consulta fallida muestra No disponible: '+fallo,(fallo==='bodegas'||e.c.getDashboardHTML().includes('No disponible'))&&(fallo==='equipos'?ed.equipos===null:fallo==='bodegas'?ed.bodegas===null:fallo==='ubicaciones'?ed.ubicacionesTotal===null:fallo==='pendientes'?ed.solicitudes===null:ed.proyectos===null));
   check('fallo no borra métricas independientes: '+fallo,fallo==='equipos'?ed.bodegas===null:ed.equipos===2);
 }
 const vacio=preparar();for(const k of Object.keys(vacio.datos))vacio.datos[k]=[];vacio.datos.pendientes={pendiente:0,aprobada:0,rechazada:0};await vacio.c.dashboardCargarResumen();check('consulta vacía válida conserva ceros reales',resumen(vacio.c).proyectos===0&&resumen(vacio.c).ubicacionesTotal===0&&resumen(vacio.c).solicitudes?.pendiente===0&&resumen(vacio.c).equipos===0&&resumen(vacio.c).bodegas===null);
 const incompleto=preparar();incompleto.datos.equipos=null;await incompleto.c.dashboardCargarResumen();check('respuesta incompleta no se transforma en cero',resumen(incompleto.c).equipos===null);
 const carga=preparar();check('carga inicial explícita',carga.c.renderDashboardView().includes('Cargando...'));await carga.timers[0]();check('vista carga áreas y resumen antes de mostrar valores',carga.llamadas.some(x=>x[0]==='areas')&&carga.nodo('dashboard-content').innerHTML.includes('id="area-tarjetas"')&&resumen(carga.c).ubicacionesTotal===5);
 const tarde=preparar();let resolver;tarde.c.areaCargarFuentes=()=>new Promise(r=>resolver=r);tarde.c.renderDashboardView();const pendiente=tarde.timers[0]();await new Promise(setImmediate);tarde.nodos.set('dashboard-content',{innerHTML:'Otra vista'});resolver();await pendiente;check('respuesta tardía no pisa otra pantalla',tarde.nodo('dashboard-content').innerHTML==='Otra vista');
 const sec=preparar();let resolverVieja;const base=sec.c.window.MejorasService.getProyectos;sec.c.window.MejorasService.getProyectos=()=>new Promise(r=>resolverVieja=r);const anterior=sec.c.dashboardCargarResumen();await Promise.resolve();sec.c.window.MejorasService.getProyectos=base;await sec.c.dashboardCargarResumen();resolverVieja([{id:'vieja'}]);await anterior;check('resumen anterior no sobrescribe una lectura más reciente',resumen(sec.c).proyectos===4);
 check('sin escrituras, consultas directas, librerías ni almacenamiento',!/\.rpc\(|\.from\(|\.insert\(|localStorage|sessionStorage|fetch\(|<script/.test(codigo));
 for(const permitido of [true,false]){
   const f=preparar(),montajes=[];f.c.window.GestionTareas={habilitada:true,puede:()=>permitido,mes:()=>({p_desde:'2026-11-01',p_hasta:'2026-11-30'}),todas:async()=>[]};
   f.c.gestionMontarCalendario=(panel,titulo,equipos,opciones)=>montajes.push({panel,titulo,equipos,opciones});
   f.c.renderDashboardView();await f.timers[0]();const html=f.nodo('dashboard-content').innerHTML;
   check('calendario único, automático y por permiso: '+permitido,montajes.length===Number(permitido)&&!html.includes('id="dashboard-ubicaciones"'));
   if(permitido){
     check('posición entre indicadores y áreas',html.indexOf('dashboard-indicadores')<html.indexOf('dashboard-calendario')&&html.indexOf('dashboard-calendario')<html.indexOf('dashboard-areas-titulo'));
     check('montaje en su propio destino, abierto sin duplicar calendario final',montajes[0].panel===f.nodo('dashboard-calendario')&&montajes[0].opciones.abierto===true&&montajes[0].opciones.enlaceGestion===true);
   }else check('sin permiso no muestra calendario',!html.includes('dashboard-calendario'));
 }
 // Instrumentación determinista: retener Áreas y observar qué carga puede empezar.
 const opt=preparar();let liberarAreas;opt.c.areaCargarFuentes=()=>new Promise(r=>{liberarAreas=r});
 opt.c.window.GestionTareas={habilitada:true,puede:()=>true,mes:()=>({p_desde:'2026-11-01',p_hasta:'2026-11-30'}),todas:async()=>{opt.llamadas.push(['tareasMes']);return []}};let montajesOpt=0;opt.c.gestionMontarCalendario=()=>{montajesOpt++};
 opt.c.renderDashboardView();const cargaOpt=opt.timers[0]();await new Promise(setImmediate);
 check('30H precarga tareas, ubicaciones y solicitudes en paralelo sin mostrar contenido',['tareasMes','ubicaciones','pendientes'].every(n=>opt.llamadas.some(x=>x[0]===n))&&montajesOpt===0&&opt.nodo('dashboard-content').innerHTML==='');
 check('30F catálogos compartidos esperan Áreas para reutilizar su carga',!opt.llamadas.some(x=>['proyectosMejoras','proyectosRemodelacion','equipos'].includes(x[0])));
 liberarAreas();await cargaOpt;
 check('30H seis lecturas y un montaje tras carga integrada, sin duplicadas',opt.llamadas.length===6&&new Set(opt.llamadas.map(x=>x[0])).size===6&&montajesOpt===1);
 const sinTareas=preparar();await sinTareas.c.dashboardCargarResumen();
 check('30F sin descarga de bodegas ajena a los cuatro KPI',!sinTareas.llamadas.some(x=>x[0]==='bodegas')&&sinTareas.llamadas.length===5);
 console.log('MÉTRICAS 30H — 6 lecturas simuladas, 0 equivalentes duplicadas; 1 montaje completo al finalizar, sin contenido parcial.');
 for(const escenario of ['perfil_equivalente','privilegio_cambiado','timeout','error_areas']){
   const f=preparar();let release;f.c.areaCargarFuentes=()=>new Promise((r,j)=>{release=escenario==='error_areas'?()=>j(Error('red')):r});
   f.c.renderDashboardView();const carga=f.timers[0]();await new Promise(setImmediate);
   check('30H estado inicial integrado sin contenido parcial: '+escenario,f.nodo('dashboard-content').innerHTML==='');
   if(escenario==='perfil_equivalente')f.c.state.currentUser={...f.c.state.currentUser,esAdminPermanente:false,esAdminTemporal:false};
   if(escenario==='privilegio_cambiado')f.c.state.currentUser={role:'RECEPCION'};
   if(escenario==='timeout')f.timers[1]();else release();
   await carga;
   if(['perfil_equivalente','error_areas'].includes(escenario))check('30H finaliza y muestra Dashboard completo: '+escenario,f.nodo('dashboard-content').innerHTML.includes('dashboard-kpis')&&resumen(f.c).estado==='listo'&&!f.nodo('dashboard-content').innerHTML.includes('Cargando áreas'));
   else check('30H error explícito y sin reintento continuo: '+escenario,f.nodo('dashboard-loader').innerHTML.includes('Volver a cargar')&&f.nodo('dashboard-content').innerHTML==='');
   if(escenario==='timeout'){release();await new Promise(setImmediate);check('30H respuesta después del timeout no publica datos',f.nodo('dashboard-content').innerHTML==='');}
 }
 const fuentes=preparar();const almacen={};
 fuentes.c.areaCargarFuentes=async()=>{for(const [id,servicio]of [['workarea_mejoras','MejorasService'],['workarea_remodelacion','RemodelacionesService']]){
   try{almacen[id]={estado:'listo',datos:await fuentes.c.window[servicio].getProyectos()}}catch(_){almacen[id]={estado:'error'}}
 }};
 fuentes.c.areaFuente=id=>almacen[id];fuentes.c.renderDashboardView();await fuentes.timers[0]();
 check('30H proyectos reutilizados por UUID sin repetir método tras Áreas',fuentes.llamadas.filter(x=>x[0]==='proyectosMejoras').length===1&&fuentes.llamadas.filter(x=>x[0]==='proyectosRemodelacion').length===1&&resumen(fuentes.c).proyectos===4);
 const sinProyecto=preparar();sinProyecto.c.areaFuente=()=>({estado:'error'});sinProyecto.c.renderDashboardView();await sinProyecto.timers[0]();
 check('30H fuente fallida no se repite ni se convierte en cero',resumen(sinProyecto.c).proyectos===null&&!sinProyecto.llamadas.some(x=>x[0]==='proyectosMejoras'||x[0]==='proyectosRemodelacion'));
 await probarCargaYMenu();
 console.log(total+'/'+total+' PASS — Dashboard (solo memoria)');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

async function probarCargaYMenu(){
 const app=fs.readFileSync(baseFrontend+'js/app.js','utf8');
 const nodos=new Map();
 const el=id=>{if(!nodos.has(id))nodos.set(id,{textContent:'',title:'',classList:{hidden:true,add(){this.hidden=true;},toggle(k,v){this.hidden=v;}}});return nodos.get(id);};
 let pendientes=[],consultas=0;
 const servicio={_proyectosCache:null,invalidarProyectos(){this._proyectosCache=null;},getProyectos(){consultas++;return this._proyectosCache||new Promise(resolve=>pendientes.push(rows=>{this._proyectosCache=rows;resolve(rows);}));}};
 const c={Map,Promise,state:{currentUser:{id:'actor-a',role:'ADMINISTRADOR',permissions:{modules:['mejoras','remodelaciones']}}},sesionNoVerificable:false,sesionEnReconexion:false,
 window:{MejorasService:servicio,RemodelacionesService:servicio},document:{getElementById:el},esCuentaSinRol:()=>false,esRecepcionRestringida:()=>false};
 c.hasAccess=(v,role)=>role===c.state.currentUser.role&&c.state.currentUser.permissions.modules.includes(v);
 vm.createContext(c);vm.runInContext(cargaCompartida,c);
 vm.runInContext(app.slice(app.indexOf('// Los conteos verificados permanecen'),app.indexOf('function handleGlobalSearch')),c);
 check('31C carga compartida uniforme, accesible y sin temporizador',c.uiCargandoHTML('prueba').includes('id="prueba"')&&c.uiCargandoHTML().includes('Cargando...')&&c.uiCargandoHTML().includes('aria-hidden="true"')&&!cargaCompartida.includes('setTimeout'));
 check('31C identificador no confiable no se interpola',!c.uiCargandoHTML('" onclick="x').includes('onclick'));
 c.updateSidebarBadges();c.updateSidebarBadges();await Promise.resolve();
 check('31C navegación simultánea agrupa cada conteo',consultas===2);
 pendientes.splice(0).forEach(fn=>fn([{id:'real-1',estado:'Activo'},{id:'real-2',estado:'Finalizado'}]));await new Promise(setImmediate);
 check('31C ambos conteos provienen de datos reales',el('badge-nav-mejoras').textContent==='1'&&el('badge-nav-remodelaciones').textContent==='2');
 c.updateSidebarBadges();
 check('31C navegación no borra el valor visible',el('badge-nav-remodelaciones').textContent==='2'&&!el('badge-nav-remodelaciones').classList.hidden);
 await new Promise(setImmediate);
 servicio._proyectosCache=[{id:'nueva',estado:'Activo'}];c.updateSidebarBadges();await new Promise(setImmediate);
 check('31C cambio real actualiza los conteos',el('badge-nav-remodelaciones').textContent==='1');
 servicio._proyectosCache=null;c.updateSidebarBadges();await Promise.resolve();
 c.state.currentUser={id:'actor-b',role:'RECEPCION',permissions:{modules:[]}};c.updateSidebarBadges();
 pendientes.splice(0).forEach(fn=>fn([{id:'dato-anterior',estado:'Activo'}]));await new Promise(setImmediate);
 check('31C cuenta sin permiso no conserva ni recibe respuesta anterior',el('badge-nav-remodelaciones').textContent===''&&el('badge-nav-remodelaciones').classList.hidden);
 c.state.currentUser={id:'actor-a',role:'ADMINISTRADOR',permissions:{modules:['remodelaciones']}};c.updateSidebarBadges();await Promise.resolve();
 c.sesionNoVerificable=true;c.updateSidebarBadges();pendientes.splice(0).forEach(fn=>fn([]));await new Promise(setImmediate);
 check('31C pérdida de verificación limpia contador y descarta respuesta',el('badge-nav-remodelaciones').textContent==='');
 for(const nombre of ['mejoras','remodelaciones']){
  const x={window:{},console};vm.createContext(x);vm.runInContext(fs.readFileSync(baseFrontend+'js/services/'+nombre+'.service.js','utf8'),x);
  const real=x.window[nombre==='mejoras'?'MejorasService':'RemodelacionesService'];let n=0,terminar;
  real._consultarProyectos=()=>{n++;return new Promise(resolve=>terminar=resolve);};
  const a=real.getProyectos(),b=real.getProyectos();terminar([]);await Promise.all([a,b]);await real.getProyectos();
  check('31C '+nombre+': una consulta concurrente y vacío cacheado',n===1);
  real.invalidarProyectos();const vieja=real.getProyectos();const terminarVieja=terminar;real.invalidarProyectos();const nueva=real.getProyectos();terminar([{id:'vigente'}]);await nueva;terminarVieja([{id:'vieja'}]);await vieja;
  check('31C '+nombre+': invalidación descarta caché de otra sesión',real._proyectosCache[0].id==='vigente');
  real.invalidarProyectos();real._consultarProyectos=async()=>{throw Error('sin acceso');};await assert.rejects(real.getProyectos());
  check('31C '+nombre+': errores no se cachean como cero',real._proyectosCache===null&&real._proyectosEnCurso===null);
 }
 for(const vista of ['dashboard','gantt','admin','mejoras','remodelaciones','trabajadores','mantenciones','areas','prevencionista','inventario','gestionTareas','solicitudes','reactiva','jardineriaArea']){
  check('31C '+vista+': carga inicial usa componente compartido',fs.readFileSync(baseFrontend+'js/views/'+vista+'.js','utf8').includes('uiCargandoHTML('));
 }
 const html=fs.readFileSync(baseFrontend+'index.html','utf8'),jardin=html.match(/<button[^>]*id="nav-jardineria"[\s\S]*?<\/button>/)[0];
 check('31C Jardinería mantiene nombre, trunca y fija icono',jardin.includes('min-w-0 truncate')&&jardin.includes('title="Mantención de Jardinería"')&&jardin.includes('shrink-0'));
 const css=fs.readFileSync(baseFrontend+'css/ui-system.css','utf8');
 check('31C carga respeta ocultación y contraste de ambos temas',css.includes('.alm-carga-inicial:not(.hidden)')&&css.includes('.dark .alm-carga-inicial'));
}
