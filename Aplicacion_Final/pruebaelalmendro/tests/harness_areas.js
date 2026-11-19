// AREAS-2A: ejecuta vistas reales con lecturas simuladas exclusivamente en memoria.
// Sin conexión, persistencia, correos ni escrituras en Supabase.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const leer = archivo => fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8');
const vista = leer('js/views/areas.js');
const modales = leer('js/modals.js');
let total = 0;
function check(nombre, valor) { assert.ok(valor, nombre); total++; console.log('[PASS] ' + nombre); }
const resumen = {elementos:66, mantenciones:64, inventarios:29, subapartados:{conDatos:9,detalle:['elementos','inventario','banos','pilas','tv','engrase','fosas','guia','jardineria'].map(id=>({id,cantidad:1}))}};

function escenario() {
  const nodos = new Map();
  let doc;
  const nodo = id => {
    if (!nodos.has(id)) {
      const clases = new Set();
      const atributos=new Map();
      nodos.set(id, {id,innerHTML:'',style:{overflow:''},inert:false,scrollTop:0,isConnected:true,
        setAttribute(k,v){atributos.set(k,String(v));},getAttribute(k){return atributos.get(k);},
        focus(opciones){doc.activeElement=this;this.opcionesFoco=opciones;},
        contains(n){return n===nodo('jda-detalle-cerrar')||n===nodo('jda-summary');},
        querySelectorAll(){return [nodo('jda-detalle-cerrar'),nodo('jda-summary')];},
        classList:{add(c){clases.add(c);},remove(c){clases.delete(c);},contains(c){return clases.has(c);}}});
    }
    return nodos.get(id);
  };
  const llamadas = [], estadisticas = [], navegacion = [], timers = [];
  const listeners=new Map();
  doc={activeElement:null,
    getElementById(id){return id==='jda-detalle-overlay' ? nodos.get(id)||null : nodo(id);},
    createElement(){return nodo('modal-creado');},
    body:{style:{overflow:''},appendChild(n){nodos.set(n.id,n);}},
    addEventListener(tipo,fn,captura){listeners.set(fn,{tipo,captura});},removeEventListener(tipo,fn){listeners.delete(fn);}
  };
  const areas = ['general','reactiva','mejoras','remodelacion','maquinas','jardineria'].map(id => ({id:'workarea_'+id, name:id,icon:'',description:'Descripción',responsible:'NO MOSTRAR RESPONSABLE LOCAL'}));
  const state = {workAreas:areas};
  Object.defineProperty(state, 'maintenances', {get(){throw Error('No consumir tareas locales');}});
  const ctx = vm.createContext({
    window:{MantencionesService:{async getResumen(force){llamadas.push(force);return resumen;}}},
    document:doc, state, DEFAULT_WORK_AREAS:areas, setTimeout(fn){timers.push(fn);},
    console:{error(){}}, areaSubVista:null, setProyectosMejorasReales(){},
    getWorkAreaStats(id){
      if(id==='workarea_general')throw Error('No calcular estadísticas locales de General');
      estadisticas.push(id);
      return {active:0,pending:0,completed:0,delayed:0,totalActualCost:null};
    },
    formatCLP(){throw Error('No calcular costos de General');},
    closeModal(id){navegacion.push(['cerrar',id]);nodo(id).classList.add('hidden');},
    openModal(id){navegacion.push(['abrir',id]);nodo(id).classList.remove('hidden');},
    navigateTo(id){navegacion.push(['navegar',id]);}
  });
  vm.runInContext(vista,ctx);
  vm.runInContext(leer('js/views/jardineriaArea.js'),ctx);
  // Extraer solo la función real del enrutamiento de fichas; ninguna otra modal se ejecuta.
  const inicio = modales.indexOf('function openAreaDetail(');
  const fin = modales.indexOf('\n}\n', inicio) + 2;
  vm.runInContext(modales.slice(inicio, fin),ctx);
  return {ctx,nodo,nodos,llamadas,estadisticas,navegacion,timers,doc,listeners};
}

async function main() {
  new vm.Script(vista); new vm.Script(modales);
  const r = escenario();
  check('carga explícita sin ceros ni métricas locales',r.ctx.areaGeneralResumenHTML().includes('Cargando información')&&!r.ctx.areaGeneralResumenHTML().includes('>0<'));
  await r.ctx.areaGeneralCargarResumen();
  check('reutiliza getResumen existente',r.llamadas.length===1&&r.llamadas[0]===false);
  const html=r.ctx.areaGeneralTarjetaHTML();
  check('conteos del resumen con etiquetas de elementos, históricos y bodegas',html.includes('>66<')&&html.includes('>64<')&&html.includes('>29<')&&html.includes('Elementos del catálogo')&&html.includes('Mantenciones históricas del catálogo')&&html.includes('Fichas de bodegas'));
  check('distingue históricos de actividad y muestra ocho subapartados visibles',html.includes('8 subapartados con datos')&&html.includes('no representan tareas activas'));
  check('sin responsable, gasto, al día, avance ni contadores operativos ficticios',!html.includes('NO MOSTRAR')&&!/Responsable:|Gasto:|Al día|Activas<|Pendientes<|Completadas<|Atrasadas<|Progreso|15%|50%|100%/.test(html));
  check('tarjeta conserva jerarquía principal y destino existente',html.includes('Área Principal')&&html.includes("openAreaDetail('workarea_general')"));
  await r.ctx.openAreaDetail('workarea_general');
  check('detalle recupera ficha intermedia con acceso al módulo sin estado local',r.navegacion.some(n=>n[0]==='abrir'&&n[1]==='modal-area-detail')&&!r.navegacion.some(n=>n[0]==='navegar')&&r.nodo('area-ficha-cuerpo').innerHTML.includes('Abrir Mantención General, subapartados y fichas'));
  check('no se creó otro catálogo ni formulario operativo',!html.includes('openMaintenanceDetail')&&!html.includes('Registrar mantención'));

  r.ctx.window.MantencionesService.getResumen=async()=>({elementos:0,mantenciones:0,inventarios:0,subapartados:{conDatos:0,detalle:[]}});
  await r.ctx.areaGeneralCargarResumen();
  check('vacío real distinto de error y estado operativo',r.ctx.areaGeneralResumenHTML().includes('Sin registros')&&!r.ctx.areaGeneralResumenHTML().includes('No se pudo')&&!r.ctx.areaGeneralResumenHTML().includes('Al día'));
  r.ctx.window.MantencionesService.getResumen=async()=>({elementos:0,mantenciones:0,inventarios:0,subapartados:{conDatos:1,detalle:[{id:'banos',cantidad:1}]}});
  await r.ctx.areaGeneralCargarResumen();
  check('otros subapartados con datos no se declaran vacíos',!r.ctx.areaGeneralResumenHTML().includes('Sin registros')&&r.ctx.areaGeneralResumenHTML().includes('1 subapartados con datos'));
  r.ctx.window.MantencionesService.getResumen=async()=>({elementos:0,mantenciones:0,inventarios:0,subapartados:{conDatos:1,detalle:[{id:'jardineria',cantidad:5}]}});
  await r.ctx.areaGeneralCargarResumen();
  check('Jardinería independiente no cuenta como subapartado de General',r.ctx.areaGeneralResumenHTML().includes('Sin registros'));
  r.ctx.window.MantencionesService.getResumen=async()=>{throw Error('Lectura denegada simulada');};
  await r.ctx.areaGeneralCargarResumen();
  check('error visible sin ceros, números anteriores ni al día',r.ctx.areaGeneralResumenHTML().includes('No se pudo consultar')&&r.ctx.areaGeneralResumenHTML().includes('Reintentar')&&!/>\d+</.test(r.ctx.areaGeneralResumenHTML())&&!r.ctx.areaGeneralResumenHTML().includes('Al día'));
  let resolver;
  r.ctx.window.MantencionesService.getResumen=force=>{r.llamadas.push(force);return new Promise(resolve=>resolver=resolve);};
  const reintento=r.ctx.areaGeneralReintentar();
  check('reintento fuerza relectura y muestra cargando',r.llamadas.at(-1)===true&&r.nodo('area-general-resumen').innerHTML.includes('Cargando información'));
  resolver(resumen);await reintento;
  check('reintento recupera resumen real',r.nodo('area-general-resumen').innerHTML.includes('>66<'));
  for(const dato of [null,{}, {...resumen,elementos:null},{...resumen,mantenciones:-1}]) {
    r.ctx.window.MantencionesService.getResumen=async()=>dato;
    await r.ctx.areaGeneralCargarResumen();
    check('resumen inválido no simula cero '+JSON.stringify(dato),r.ctx.areaGeneralResumenHTML().includes('No se pudo consultar'));
  }
  delete r.ctx.window.MantencionesService;
  await r.ctx.areaGeneralCargarResumen();
  check('servicio ausente muestra error sin fallback',r.ctx.areaGeneralResumenHTML().includes('No se pudo consultar'));

  const carrera=escenario();
  let antigua;
  carrera.ctx.window.MantencionesService.getResumen=()=>new Promise(resolve=>antigua=resolve);
  const antes=carrera.ctx.areaGeneralCargarResumen();
  carrera.ctx.window.MantencionesService.getResumen=async()=>{throw Error('Error más reciente');};
  await carrera.ctx.areaGeneralCargarResumen();antigua(resumen);await antes;
  check('respuesta anterior no sobrescribe consulta más reciente',carrera.ctx.areaGeneralResumenHTML().includes('No se pudo consultar'));

  const grid=escenario();
  await grid.ctx.areaGeneralCargarResumen();
  const tarjetas=grid.ctx.getAreasHTML(null);
  check('seis tarjetas evitan todas las estadísticas locales anteriores',(tarjetas.match(/class="alm-module-card /g)||[]).length===6&&grid.estadisticas.length===0);
  check('las otras cinco áreas conservan entrada a su ficha',tarjetas.includes("openAreaDetail('workarea_reactiva')")&&tarjetas.includes("openAreaDetail('workarea_mejoras')")&&tarjetas.includes("openAreaDetail('workarea_remodelacion')")&&tarjetas.includes("openAreaDetail('workarea_maquinas')")&&tarjetas.includes("openAreaDetail('workarea_jardineria')"));
  grid.ctx.mqaCargarCatalogo=async()=>{};
  const carga=grid.ctx.renderAreasView();await grid.timers[0]();
  check('loader real integra resumen sin duplicar su carga',carga.includes('areas-loader')&&grid.llamadas.length===1&&!grid.nodo('areas-content').innerHTML.includes('Datos consultados en Supabase')&&grid.nodo('areas-loader').classList.contains('hidden'));
  check('sin escrituras ni almacenamiento en nuevas funciones',!vista.slice(vista.indexOf('// AREAS-2A'),vista.indexOf('function renderAreasView')).match(/localStorage|\.from\(|\.rpc\(|\.insert\(|\.update\(/));
  await probarSeisFichas();
  await probarVistaJardineria();
  await probarInsumosJardineria();
  await probarModalesJardineria();
  console.log(`${total}/${total} PASS — AREAS-2A / AREAS-2A.1 / JARD-1 (solo memoria, sin escrituras reales)`);
}

async function probarSeisFichas() {
  const dashboard=leer('js/views/dashboard.js');new vm.Script(dashboard);
  function conectado() {
    const r=escenario(), lecturas=[];
    const proyectoMej={id:'proyecto-mej-stub',nombre:'Mejora trazable',estado:'Pausado',responsable_texto:null,fecha_inicio:'2024-10-15T00:00:00+00:00',fecha_fin_estimada:null};
    const proyectoRen={id:'proyecto-ren-stub',name:'Remodelación trazable',status:'Pausado',presupuestosResumen:[{tipo:'PRESUPUESTO_HISTORICO',total_con_iva:123}]};
    const tarea=(proyecto_id)=>({id:'tarea-'+proyecto_id,proyecto_id,titulo:'Tarea trazable',estado:'Pausado',responsable_texto:null,fecha_inicio:'2024-10-15',fecha_vencimiento:null,progreso:37});
    r.ctx.window.MantencionesService.getJardineria=async()=>{lecturas.push('jardineria');return {
      sectores:[{nombre:'Sector trazable',activo:true}],
      trabajos:[{titulo:'Trabajo definido',activo:true},{titulo:'FILA VACIA NO MOSTRAR',es_fila_vacia_original:true},{titulo:'INACTIVO NO MOSTRAR',activo:false}],
      laboresComplementarias:[{titulo:'Labor definida'}],riegoProgramacion:[{zona:'Zona trazable',dia_semana:'Lunes'}],riegoZonas:[],riegoNotas:[{contenido:'Nota trazable'}]
    };};
    r.ctx.window.MantencionesService.getElementosMaquinas=async()=>{lecturas.push('maquinas');return [{id:'equipo-a'},{id:'equipo-b'}];};
    r.ctx.window.MantencionesService.getMantencionesMaquinas=async()=>[{elemento_id:'equipo-a'}];
    r.ctx.mntResumenHistorialPorElemento=()=>({});
    r.ctx.window.MejorasService={getProyectos:async()=>{lecturas.push('mejoras');return [proyectoMej];},getTareas:async id=>{lecturas.push('tareas-mejoras');return [tarea(id)];}};
    r.ctx.window.RemodelacionesService={getProyectos:async()=>{lecturas.push('remodelaciones');return [proyectoRen];},getTareasRemodelaciones:async()=>{lecturas.push('tareas-remodelaciones');return [tarea(proyectoRen.id)];}};
    r.ctx.openTaskFromArea=(...args)=>r.navegacion.push(['proyecto',...args]);
    r.ctx.openAreaMaquinas=()=>r.navegacion.push(['catalogo-maquinas']);
    // Impedir KPI locales; conservar la llamada previa de alertas sin efectos reales.
    r.ctx.getDashboardKPIs=()=>{throw Error('No usar KPI locales');};
    r.ctx.syncMaintenanceAlertNotifications=()=>{lecturas.push('flujo-alertas-existente');};
    vm.runInContext(dashboard,r.ctx);
    r.lecturas=lecturas;return r;
  }
  const r=conectado();await r.ctx.areaCargarFuentes();
  check('fuentes existentes por dominio sin llamadas para Reactiva', ['jardineria','maquinas','mejoras','remodelaciones'].every(x=>r.lecturas.includes(x))&&r.llamadas.length===1);
  const cuadrilla=r.ctx.areaTarjetasHTML();
  check('Dashboard y Áreas comparten exactamente el mismo HTML de tarjetas',r.ctx.getDashboardHTML().includes(cuadrilla)&&r.ctx.getAreasHTML().includes(cuadrilla.replace('Ver Mantención General y sus fichas →','Ver ficha del área →')));
  check('tarjetas reales sin estado al día, responsables fijos ni gastos agregados',!cuadrilla.includes('Al día')&&!cuadrilla.includes('NO MOSTRAR')&&!cuadrilla.includes('Gasto:')&&cuadrilla.includes('Proyectos registrados')&&cuadrilla.includes('Trabajos definidos'));
  check('Dashboard conserva resumen documental sin indicadores operativos inventados',!r.ctx.getDashboardHTML().includes('Datos en Vivo')&&!r.ctx.getDashboardHTML().includes('Control en tiempo real')&&!/al día|Cero trabajos|0 urgentes/i.test(r.ctx.getDashboardHTML())&&r.ctx.getDashboardHTML().includes('Resumen de registros del hotel')&&r.ctx.getDashboardHTML().includes('Tareas registradas por proyecto'));
  for(const id of ['general','reactiva','mejoras','remodelacion','maquinas','jardineria'].map(x=>'workarea_'+x)) {
    await r.ctx.openAreaDetail(id);
    const cuerpo=r.nodo('area-ficha-cuerpo').innerHTML;
    check(id+': conserva cinco secciones y ficha intermedia', ['Descripción del área y su objetivo','Tareas activas y su estado','Línea de tiempo / Carta Gantt','Costos y materiales asociados','Responsable e historial'].every(t=>cuerpo.includes(t))&&r.nodo('area-modal-content').innerHTML.includes('Ficha de Área:')&&!r.navegacion.some(n=>n[0]==='navegar'));
    check(id+': modo claro/oscuro y sin progreso automático ni responsables locales',cuerpo.includes('dark:')&&!cuerpo.includes('NO MOSTRAR')&&!/15%|50%|100%/.test(cuerpo));
    check('Acceso común antes de secciones '+id,cuerpo.indexOf('alm-area-actions')<cuerpo.indexOf('Descripción del área y su objetivo')&&(cuerpo.match(/alm-area-actions/g)||[]).length===1);
    check('Cabecera neutra compartida '+id,r.nodo('area-modal-content').innerHTML.includes('alm-area-detail-header')&&!r.nodo('area-modal-content').innerHTML.includes('bg-gradient'));
    if(id==='workarea_reactiva')check('Reactiva mantiene ausencia explícita de conexión sin inventar solicitudes',cuerpo.includes('Sin fuente operativa validada')&&cuerpo.includes('Sin tareas operativas conectadas'));
    if(id==='workarea_mejoras')check('Mejoras separa proyectos/tareas, fechas originales, progreso registrado y NULL',cuerpo.includes('Proyectos registrados (no equivalen a tareas)')&&cuerpo.includes('Tarea trazable')&&cuerpo.includes('15/10/2024')&&cuerpo.includes('37%')&&cuerpo.includes('Responsable no asignado')&&cuerpo.includes('Sin costos registrados'));
    if(id==='workarea_remodelacion')check('Remodelación usa los mismos proyectos reales, Pausado no es atraso y presupuesto no es gasto',cuerpo.includes('Remodelación trazable')&&cuerpo.includes('Tarea trazable')&&cuerpo.includes('Pausado')&&!cuerpo.includes('Atrasada')&&cuerpo.includes('PRESUPUESTO_HISTORICO')&&cuerpo.includes('No representan automáticamente gastos reales'));
    if(id==='workarea_maquinas')check('Máquinas conserva conteos de equipos/históricos y enlace al catálogo existente',cuerpo.includes('Equipos')&&cuerpo.includes('Mantenciones históricas')&&cuerpo.includes('areaAbrirMaquinas()')&&!cuerpo.includes('Tarea trazable'));
    if(id==='workarea_jardineria')check('Jardinería resume definiciones/riego sin listas y enlaza su vista dedicada',cuerpo.includes('trabajos definidos')&&cuerpo.includes('labores complementarias')&&cuerpo.includes('registros de programación')&&cuerpo.includes('no ejecución')&&cuerpo.includes('openAreaJardineria()')&&!cuerpo.includes('Trabajo definido')&&!cuerpo.includes('Labor definida')&&!cuerpo.includes('Zona trazable')&&!cuerpo.includes('FILA VACIA')&&!cuerpo.includes('INACTIVO'));
  }
  for (const [id,modulo,titulo] of [['workarea_mejoras','mejoras','Ir a Mejoras'],['workarea_remodelacion','remodelaciones','Ir a Remodelaciones']]) {
    await r.ctx.openAreaDetail(id);
    const ficha=r.nodo('area-ficha-cuerpo').innerHTML;
    check(titulo+' aparece una sola vez con destino real',(ficha.split(titulo).length-1)===1&&ficha.includes('data-modulo="'+modulo+'"'));
    const inicio=r.navegacion.length;
    r.ctx.areaAbrirModulo(modulo);
    check(titulo+' cierra ficha antes de navegar',JSON.stringify(r.navegacion.slice(inicio))===JSON.stringify([['cerrar','modal-area-detail'],['navegar',modulo]]));
  }
  await r.ctx.openAreaDetail('workarea_reactiva');
  check('Reactiva informa próxima implementación sin destino ficticio',r.nodo('area-ficha-cuerpo').innerHTML.includes('Disponible en próximas actualizaciones')&&!r.nodo('area-ficha-cuerpo').innerHTML.includes('data-modulo='));
  r.ctx.areaAbrirModulo('mantenciones');
  check('General conserva navegación al módulo y permisos de navigateTo',r.navegacion.some(n=>n[0]==='navegar'&&n[1]==='mantenciones'));
  r.ctx.areaAbrirMaquinas();
  check('Máquinas abre catálogo aprobado sin duplicación',r.navegacion.some(n=>n[0]==='catalogo-maquinas'));
  r.ctx.areaAbrirProyecto('workarea_mejoras','proyecto-mej-stub');r.ctx.areaAbrirProyecto('workarea_remodelacion','proyecto-ren-stub');
  check('fichas reales de proyectos mantienen módulo, UUID y retorno al área',r.navegacion.some(n=>JSON.stringify(n)===JSON.stringify(['proyecto','mejoras','proyecto-mej-stub','workarea_mejoras']))&&r.navegacion.some(n=>JSON.stringify(n)===JSON.stringify(['proyecto','remodelaciones','proyecto-ren-stub','workarea_remodelacion'])));
  const antes=r.navegacion.length;r.ctx.areaAbrirProyecto('workarea_mejoras','no-asociado');
  check('no abre proyectos ajenos a la fuente del área',r.navegacion.length===antes);
  for(const id of ['workarea_mejoras','workarea_remodelacion']) {
    const error=conectado();
    const svc=id==='workarea_mejoras'?error.ctx.window.MejorasService:error.ctx.window.RemodelacionesService;
    svc.getProyectos=async()=>{throw Error('Lectura fallida');};
    await error.ctx.openAreaDetail(id);
    const html=error.nodo('area-ficha-cuerpo').innerHTML;
    check(id+': error de proyectos no es vacío, cero, costo ni al día',html.includes('Error al consultar Supabase')&&!html.includes('>0<')&&!html.includes('Sin tareas operativas')&&!html.includes('Al día'));
  }
  const tareasError=conectado();tareasError.ctx.window.MejorasService.getTareas=async()=>{throw Error('Error tareas');};
  await tareasError.ctx.openAreaDetail('workarea_mejoras');
  check('error de tareas conserva proyectos y no se presenta como planificación vacía',tareasError.nodo('area-ficha-cuerpo').innerHTML.includes('Mejora trazable')&&tareasError.nodo('area-ficha-cuerpo').innerHTML.includes('Error al consultar las tareas')&&!tareasError.nodo('area-ficha-cuerpo').innerHTML.includes('No hay planificación'));
  for(const [id,metodo] of [['workarea_jardineria','getJardineria'],['workarea_maquinas','getElementosMaquinas']]) {
    const error=conectado();error.ctx.window.MantencionesService[metodo]=async()=>{throw Error('Lectura fallida');};
    await error.ctx.openAreaDetail(id);
    check(id+': error de fuente sin cero ni estado al día',error.nodo('area-ficha-cuerpo').innerHTML.includes('Error al consultar Supabase')&&!error.nodo('area-ficha-cuerpo').innerHTML.includes('>0<')&&!error.nodo('area-ficha-cuerpo').innerHTML.includes('Al día'));
  }
  const progreso=conectado();progreso.ctx.window.MejorasService.getTareas=async id=>[{id:'cero-stub',proyecto_id:id,titulo:'Progreso cero registrado',estado:null,progreso:0,fecha_inicio:null,fecha_vencimiento:null}];
  await progreso.ctx.openAreaDetail('workarea_mejoras');
  check('cero de progreso real se conserva y NULL no inventa estado ni fecha',progreso.nodo('area-ficha-cuerpo').innerHTML.includes('Progreso registrado: 0%')&&progreso.nodo('area-ficha-cuerpo').innerHTML.includes('Sin estado registrado')&&progreso.nodo('area-ficha-cuerpo').innerHTML.includes('Sin fecha registrada'));
  const cambiado=conectado();await cambiado.ctx.openAreaDetail('workarea_mejoras');cambiado.ctx.window.MejorasService.getProyectos=async()=>[];await cambiado.ctx.areaAbrirFicha('workarea_mejoras',true);
  check('reconsulta de proyectos invalida tareas previas sin asociaciones obsoletas',!cambiado.nodo('area-ficha-cuerpo').innerHTML.includes('Tarea trazable')&&cambiado.nodo('area-ficha-cuerpo').innerHTML.includes('Sin registros en los grupos consultados'));
  const ajena=conectado();ajena.ctx.window.MejorasService.getTareas=async()=>[{proyecto_id:'otro-proyecto',titulo:'NO MOSTRAR TAREA AJENA'}];await ajena.ctx.openAreaDetail('workarea_mejoras');
  check('asociación de tareas falla cerrada',ajena.nodo('area-ficha-cuerpo').innerHTML.includes('Error al consultar las tareas')&&!ajena.nodo('area-ficha-cuerpo').innerHTML.includes('NO MOSTRAR TAREA AJENA'));
  const vacio=conectado();vacio.ctx.window.MejorasService.getProyectos=async()=>[];await vacio.ctx.openAreaDetail('workarea_mejoras');
  check('vacío real distingue proyectos y tareas',vacio.nodo('area-ficha-cuerpo').innerHTML.includes('Sin registros en los grupos consultados')&&vacio.nodo('area-ficha-cuerpo').innerHTML.includes('Sin tareas operativas conectadas')&&!vacio.nodo('area-ficha-cuerpo').innerHTML.includes('Error al consultar'));
  const tarde=conectado();let resolver;
  tarde.ctx.window.MejorasService.getProyectos=()=>new Promise(resolve=>resolver=resolve);
  const pendiente=tarde.ctx.openAreaDetail('workarea_mejoras');await tarde.ctx.openAreaDetail('workarea_reactiva');resolver([]);await pendiente;
  check('respuesta tardía no cambia la ficha seleccionada después',tarde.nodo('area-modal-content').innerHTML.includes('Mantención Reactiva')&&tarde.nodo('area-ficha-cuerpo').innerHTML.includes('Sin fuente operativa validada'));
  const cerrar=conectado();let fin;
  cerrar.ctx.window.MejorasService.getProyectos=()=>new Promise(resolve=>fin=resolve);
  const cargando=cerrar.ctx.openAreaDetail('workarea_mejoras');cerrar.ctx.closeModal('modal-area-detail');fin([]);await cargando;
  check('respuesta tardía no reabre una ficha cerrada',cerrar.nodo('modal-area-detail').classList.contains('hidden'));
  const escapar=conectado();escapar.ctx.window.MejorasService.getProyectos=async()=>[{id:'id-stub',nombre:'<img src=x onerror=alert(1)>',estado:'<script>no</script>'}];escapar.ctx.window.MejorasService.getTareas=async()=>[];
  await escapar.ctx.openAreaDetail('workarea_mejoras');
  check('textos de Supabase se escapan en fichas',escapar.nodo('area-ficha-cuerpo').innerHTML.includes('&lt;img')&&!escapar.nodo('area-ficha-cuerpo').innerHTML.includes('<img'));
  check('las nuevas fuentes son solo lectura y no alteran reloj o estado global',!vista.slice(vista.indexOf('// AREAS-2A.1'),vista.indexOf('function renderAreasView')).match(/localStorage|\.rpc\(|\.from\(|getSystemDate\(|state\.maintenances|state\.renovations/));
}
async function probarVistaJardineria() {
  const fuente=leer('js/views/jardineriaArea.js');new vm.Script(fuente);
  function datos() {
    return {
      sectores:Array.from({length:5},(_,i)=>({id:'sector-'+i,nombre:'Sector '+i,orden:i,activo:true,hoja_origen:'Sector '+i,importacion_id:'importacion-stub'})),
      trabajos:[...Array.from({length:27},(_,i)=>({id:'trabajo-'+i,titulo:'Trabajo definido '+i,titulo_original:'Título original '+i,sector_id:i<20?'sector-0':'sector-'+(i%5),prioridad:i%3+1,invierno_otono:i%2===0,verano_primavera:i%2===1,es_fila_vacia_original:false,activo:true,hoja_origen:'Sector '+(i%5),fila_origen:i+2,celda_origen:'A'+(i+2),importacion_id:'importacion-stub'})),{id:'fila-vacia',titulo:'VACIA NO MOSTRAR',es_fila_vacia_original:true},{id:'inactivo',titulo:'INACTIVO NO MOSTRAR',activo:false}],
      riegoProgramacion:[{id:'riego',dia_semana:'Lunes',zona:'Zona documentada',zona_original:'Zona original',importacion_id:'importacion-stub',celda_origen:'B2'}],
      riegoZonas:[{id:'zona',zona:'Zona documentada',fila_origen:4,observaciones:null}],
      riegoNotas:[{id:'nota',contenido:'Nota original de riego',contenido_original:'Nota original de riego',hoja_origen:'Riego',celda_origen:'C2'}],
      laboresComplementarias:[{id:'labor',titulo:'Labor documental',titulo_original:'Labor original',bloque:'Hotel',frecuencia_original:'Semanal',importacion_id:'doc-stub'}]
    };
  }
  function preparado() {
    const r=escenario();r.datos=datos();r.lecturas=0;
    r.ctx.window.MantencionesService.getJardineria=async()=>{r.lecturas++;return r.datos;};
    return r;
  }
  const r=preparado(),original=JSON.stringify(r.datos);
  r.ctx.openAreaJardineria();
  check('Jardinería usa sub-vista de Áreas, cierra ficha y conserva el sidebar',JSON.stringify(r.navegacion)===JSON.stringify([['cerrar','modal-area-detail'],['navegar','areas']]));
  // La navegación stub conserva todos los argumentos para comprobar el contrato real.
  let destino;r.ctx.navigateTo=(...args)=>{destino=args;};r.ctx.openAreaJardineria();
  check('ruta dedicada exacta sin nueva opción lateral',JSON.stringify(destino)===JSON.stringify(['areas',null,'jardineria']));
  vm.runInContext("areaSubVista='jardineria'",r.ctx);
  const entrada=r.ctx.renderAreasView();
  check('vista dedicada con carga y enlace de retorno',entrada.includes('id="jda-contenido"')&&entrada.includes('Cargando Jardinería')&&entrada.includes('Volver a Áreas de Trabajo'));
  await r.timers.at(-1)();
  check('fuente getJardineria reutilizada una vez, sin nuevas consultas propias',r.lecturas===1&&r.nodo('jda-contenido').innerHTML.includes('Sectores y trabajos'));
  const cuerpo=r.ctx.jdaCuerpoHTML();
  check('cuatro apartados diferenciados y etiquetas documentales', ['Sectores y trabajos','Programación de riego','Labores complementarias','Historial de insumos'].every(x=>cuerpo.includes(x))&&cuerpo.includes('Abrir sector →'));
  check('entrada muestra solo cinco sectores sin mezclar trabajos',(r.ctx.jdaResultadosHTML().match(/<article /g)||[]).length===5&&r.ctx.jdaResultadosHTML().includes('22 trabajos definidos')&&!r.ctx.jdaResultadosHTML().includes('Título original'));
  check('filas vacías e inactivos se conservan pero no se presentan como trabajos',r.ctx.jdaFiltrados().length===5&&!r.ctx.jdaResultadosHTML().includes('VACIA NO MOSTRAR')&&!r.ctx.jdaResultadosHTML().includes('INACTIVO NO MOSTRAR')&&r.datos.trabajos.length===29);
  r.ctx.jdaAbrirSector('sector-0');check('sector pagina hasta doce trabajos',(r.ctx.jdaResultadosHTML().match(/<article /g)||[]).length===12&&r.ctx.jdaResultadosHTML().includes('Página 1 de 2'));
  r.ctx.jdaIrPagina(2);r.ctx.jdaAbrirDetalle('trabajos:trabajo-13');
  check('detalle emergente conserva campos originales y trazabilidad',r.nodo('jda-detalle-overlay').innerHTML.includes('Título original 13')&&r.nodo('jda-detalle-overlay').innerHTML.includes('fila origen')&&r.nodo('jda-detalle-overlay').innerHTML.includes('celda origen')&&r.nodo('jda-detalle-overlay').innerHTML.includes('importacion-stub'));
  r.ctx.jdaVolverListado();check('volver conserva página',r.ctx.jdaResultadosHTML().includes('Página 2 de 2'));
  r.ctx.jdaBuscar('Trabajo definido 25');
  check('buscador filtra y reinicia página',r.ctx.jdaFiltrados().length===1&&r.ctx.jdaResultadosHTML().includes('Página 1 de 1')&&r.ctx.jdaResultadosHTML().includes('Título original 25'));
  r.ctx.jdaBuscar('');r.ctx.jdaAbrirSector('sector-0');
  check('sector usa FK exacta sin deducir por palabras del título',r.ctx.jdaFiltrados().every(i=>i.grupo==='sectores'?i.registro.id==='sector-0':i.registro.sector_id==='sector-0'));
  r.ctx.jdaFiltrar('prioridad','1');r.ctx.jdaFiltrar('temporada','invierno');
  check('prioridad y temporada usan valores documentales reales',r.ctx.jdaFiltrados().length>0&&r.ctx.jdaFiltrados().every(i=>i.grupo==='trabajos'&&i.registro.prioridad===1&&i.registro.invierno_otono===true));
  r.ctx.jdaAbrirDetalle(r.ctx.jdaFiltrados()[0].clave);r.ctx.jdaVolverListado();
  check('detalle conserva filtros al volver',r.ctx.jdaFiltrosHTML().includes('value="sector-0" selected')&&r.ctx.jdaFiltrosHTML().includes('value="1" selected')&&r.ctx.jdaFiltrosHTML().includes('value="invierno" selected'));
  r.ctx.jdaBuscar('NO EXISTE');check('sin coincidencias es distinto de error de Supabase',r.ctx.jdaResultadosHTML().includes('Sin registros para los filtros')&&!r.ctx.jdaResultadosHTML().includes('No se pudo consultar'));
  r.ctx.jdaCambiarTab('riego');
  check('riego conserva programación, zonas y notas separadas',r.ctx.jdaRegistros().length===3&&r.ctx.jdaCuerpoHTML().includes('Nota original de riego')&&r.ctx.jdaCuerpoHTML().includes('Programación de riego')&&r.ctx.jdaCuerpoHTML().includes('Zonas de riego'));
  r.ctx.jdaAbrirDetalle('riegoZonas:zona');
  check('NULL en detalle permanece ausente, sin convertirlo a cero',r.ctx.jdaDetalleHTML().includes('Sin dato registrado'));
  r.ctx.jdaCambiarTab('labores');
  check('labores conservan ámbito documental, no ejecución',r.ctx.jdaCuerpoHTML().includes('Hotel')&&r.ctx.jdaCuerpoHTML().includes('contenido maestro'));
  r.ctx.window.MantencionesService.getInsumosJardineria=async()=>({movimientos:[],tareas:[],importaciones:[]});
  await r.ctx.jdaCambiarTab('insumos');
  check('históricos separados con acceso original y sin asumir stock',r.ctx.jdaCuerpoHTML().includes('Movimientos del archivo')&&r.ctx.jdaCuerpoHTML().includes("openComplementarioDetail('INSUMOS JARDINERIA.xlsx')")&&r.ctx.jdaCuerpoHTML().includes('Aplicaciones registradas')&&r.ctx.jdaCuerpoHTML().includes('no representan existencias actuales'));
  check('consulta no muta registros originales ni añade copias',JSON.stringify(r.datos)===original);
  r.ctx.jdaVolverAAreas();check('retorno limpia la sub-vista por navegación existente',JSON.stringify(destino)===JSON.stringify(['areas']));
  const error=preparado();error.ctx.window.MantencionesService.getJardineria=async()=>{throw Error('Error de lectura');};
  await error.ctx.areaCargarFuente('workarea_jardineria');
  check('error explícito no se presenta como cero o vacío',error.ctx.jdaCuerpoHTML().includes('No se pudo consultar Jardinería')&&!error.ctx.jdaCuerpoHTML().includes('Sin registros documentales')&&error.ctx.jdaCuerpoHTML().includes('Reintentar'));
  error.ctx.window.MantencionesService.getJardineria=async()=>error.datos;await error.ctx.jdaRecargar();
  check('reintento recupera datos reales de la fuente',error.nodo('jda-contenido').innerHTML.includes('Sectores y trabajos'));
  const vacio=preparado();Object.keys(vacio.datos).forEach(k=>vacio.datos[k]=[]);await vacio.ctx.areaCargarFuente('workarea_jardineria');
  check('vacío documental verdadero distinto de error',vacio.ctx.jdaCuerpoHTML().includes('Sin registros documentales disponibles')&&!vacio.ctx.jdaCuerpoHTML().includes('No se pudo consultar'));
  const tarde=preparado();let resolver;tarde.ctx.window.MantencionesService.getJardineria=()=>new Promise(resolve=>resolver=resolve);tarde.ctx.renderJardineriaAreaView();const carga=tarde.timers.at(-1)();
  tarde.nodos.set('jda-contenido',{innerHTML:'Otra pantalla'});resolver(tarde.datos);await carga;
  check('respuesta tardía no sobrescribe otra pantalla',tarde.nodo('jda-contenido').innerHTML==='Otra pantalla');
  const inseguro=preparado();inseguro.datos.sectores[0].nombre='<img src=x onerror=alert(1)>';await inseguro.ctx.areaCargarFuente('workarea_jardineria');
  check('textos históricos escapados y estilos claros/oscuros',inseguro.ctx.jdaCuerpoHTML().includes('&lt;img')&&!inseguro.ctx.jdaCuerpoHTML().includes('<img')&&inseguro.ctx.jdaCuerpoHTML().includes('dark:'));
  const nuevo=preparado();nuevo.ctx.window.MantencionesService.getInsumosJardineria=async()=>({movimientos:[{id:'historico'}],tareas:[],importaciones:[]});
  await nuevo.ctx.areaCargarFuente('workarea_jardineria');await nuevo.ctx.jdaCargarInsumos();
  check('resumen calcula conteos desde datos consultados sin constantes hoteleras',nuevo.ctx.jdaCuerpoHTML().includes('>27</p>')&&nuevo.ctx.jdaCuerpoHTML().includes('>5</p>')&&nuevo.ctx.jdaCuerpoHTML().includes('>1</p>')&&!nuevo.ctx.jdaCuerpoHTML().includes('>101</p>'));
  nuevo.datos.trabajos.push({id:'huerfano',titulo:'Sector 0 en título no acredita asociación',sector_id:'inexistente',activo:true});
  check('trabajo sin FK válida permanece accesible sin convertirse en sector',nuevo.ctx.jdaFiltrados().length===5&&nuevo.ctx.jdaResultadosHTML().includes('Sin sector asignado · 1'));
  nuevo.ctx.jdaAbrirSector('__sin_sector__');check('categoría sin sector contiene solo trabajos sin asociación verificada',nuevo.ctx.jdaFiltrados().length===1&&nuevo.ctx.jdaFiltrados()[0].registro.id==='huerfano'&&nuevo.ctx.jdaCuerpoHTML().includes('Volver a sectores'));
  nuevo.ctx.jdaVolverSectores();check('volver restaura listado exclusivo de sectores',nuevo.ctx.jdaFiltrados().length===5&&nuevo.ctx.jdaFiltrados().every(i=>i.grupo==='sectores'));
  nuevo.datos.riegoProgramacion.push({id:'domingo',zona:'Última zona',dia_semana:' domingo ',orden_dia:1},{id:'miercoles',zona:'Zona media',dia_semana:'MIERCOLES',orden_dia:0},{id:'sin-dia',zona:'Lunes en nombre no acredita día',dia_semana:null},{id:'ambiguo',zona:'Zona sin clasificación',dia_semana:'Lunes y martes'});
  await nuevo.ctx.jdaCambiarTab('riego');let semana=nuevo.ctx.jdaResultadosHTML();
  check('semana conserva orden lunes a domingo independientemente de origen',['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].every((d,i,arr)=>i===0||semana.indexOf('>'+arr[i-1]+'</h3>')<semana.indexOf('>'+d+'</h3>')));
  check('normalización exacta admite acentos y espacios sin deducir días',nuevo.ctx.jdaDia(' MIÉRCOLES ')==='miercoles'&&semana.includes('Zona media')&&semana.includes('Sin día especificado')&&semana.indexOf('Sin día especificado')<semana.indexOf('Lunes en nombre no acredita día'));
  check('días sin programación muestran ausencia explícita',semana.includes('Sin programación registrada')&&semana.includes('Zonas de riego')&&semana.includes('Notas de riego'));
  nuevo.ctx.jdaBuscar('Última zona');semana=nuevo.ctx.jdaResultadosHTML();check('búsqueda distingue programación filtrada de programación ausente',semana.includes('Sin coincidencias para la búsqueda.')&&semana.includes('Última zona')&&!semana.includes('Zona media'));
  nuevo.datos.laboresComplementarias.push({id:'labor-sector',titulo:'Labor del sector',sector_id:'sector-0'},{id:'labor-sin',titulo:'Labor sin asociación',sector_id:'uuid-no-visible'});
  await nuevo.ctx.jdaCambiarTab('labores');let labores=nuevo.ctx.jdaResultadosHTML();
  check('labores agrupadas por sector real, ámbito documental o ausencia explícita',labores.includes('Sector: Sector 0')&&labores.includes('Ámbito documental: Hotel')&&labores.includes('Sin ámbito registrado')&&!labores.includes('uuid-no-visible'));
  nuevo.ctx.jdaFiltrar('ambito','sector:sector-0');check('filtro de ámbito utiliza relación exacta',nuevo.ctx.jdaFiltrados().length===1&&nuevo.ctx.jdaFiltrados()[0].registro.id==='labor-sector');
  nuevo.ctx.jdaFiltrar('ambito','');nuevo.ctx.jdaBuscar('Hotel');check('búsqueda de labores encuentra ámbito documental',nuevo.ctx.jdaFiltrados().length===1&&nuevo.ctx.jdaFiltrados()[0].registro.id==='labor');
  await nuevo.ctx.jdaCambiarTab('insumos');check('historial ofrece tres accesos de clase sin confundir tareas y movimientos',nuevo.ctx.jdaCuerpoHTML().includes('Información del archivo')&&nuevo.ctx.jdaCuerpoHTML().includes('Aplicaciones registradas')&&nuevo.ctx.jdaCuerpoHTML().includes('Movimientos del archivo'));
  check('error del resumen histórico no se convierte en cero',error.ctx.jdaCuerpoHTML().includes('No disponible'));
  await nuevo.ctx.jdaCambiarTab('sectores');nuevo.ctx.jdaVolverSectores();
  const compacto=nuevo.ctx.jdaCuerpoHTML(),navCompacto=compacto.match(/<nav[^>]*>[\s\S]*?<\/nav>/)[0];
  check('navegación compacta conserva cuatro destinos y estado accesible',(navCompacto.match(/<button /g)||[]).length===4&&navCompacto.includes('flex flex-wrap')&&navCompacto.includes('aria-pressed="true"')&&!navCompacto.includes('Elegir sector'));
  check('indicadores alineados en cuatro columnas de escritorio con adaptación móvil',compacto.includes('grid-cols-2 lg:grid-cols-4 gap-3')&&compacto.includes('dark:bg-slate-800/60'));
  nuevo.datos.sectores.push({id:'sector-vacio',nombre:'Sector sin trabajos',activo:true});
  check('sector con cero trabajos conserva ficha y acción de entrada',nuevo.ctx.jdaResultadosHTML().includes('Sector sin trabajos')&&nuevo.ctx.jdaResultadosHTML().includes('0 trabajos definidos'));
  nuevo.ctx.jdaAbrirSector('sector-vacio');
  check('sector vacío conserva contexto y regreso sin inventar tareas',nuevo.ctx.jdaCuerpoHTML().includes('Trabajos de: Sector sin trabajos')&&nuevo.ctx.jdaCuerpoHTML().includes('Volver a sectores')&&nuevo.ctx.jdaFiltrados().length===0);
  nuevo.ctx.jdaAbrirSector('sector-0');const listaCompacta=nuevo.ctx.jdaResultadosHTML();
  check('carácter documental se comunica en sección sin repetición por tarjeta',nuevo.ctx.jdaCuerpoHTML().includes('Trabajos definidos — no ejecutados')&&!listaCompacta.includes('Trabajo definido — no ejecutado')&&listaCompacta.includes('Ver detalle'));
  await nuevo.ctx.jdaCambiarTab('riego');const riegoCompacto=nuevo.ctx.jdaResultadosHTML();
  check('semana usa filas responsivas y no tarjetas grandes por programación',riegoCompacto.includes('sm:grid-cols-3')&&!riegoCompacto.includes('<article')&&riegoCompacto.includes('no confirma que se haya regado'));
  check('zonas y notas quedan en dos bloques plegables independientes',(riegoCompacto.match(/<details /g)||[]).length===2&&riegoCompacto.includes('Zonas de riego')&&riegoCompacto.includes('Notas de riego'));
  check('filas de riego conservan apertura accesible de ficha completa',riegoCompacto.includes('jdaAbrirDetalle(this.dataset.clave)')&&riegoCompacto.includes('aria-label="Ver información y procedencia:'));
  await nuevo.ctx.jdaCambiarTab('insumos');const historicoCompacto=nuevo.ctx.jdaCuerpoHTML();
  check('historial reúne filtros en una sola zona sin botones redundantes',!historicoCompacto.includes('Clase de registro')&&historicoCompacto.includes('Hoja original')&&historicoCompacto.includes('Categorías del historial de insumos'));
  const index=leer('index.html'),app=leer('js/app.js'),remodelaciones=leer('js/services/remodelaciones.service.js'),mantenciones=leer('js/views/mantenciones.js');
  check('dependencia y título integrados sin tocar navegación de Máquinas',index.includes('./js/views/jardineriaArea.js')&&app.includes("areaSubVista === 'jardineria'")&&app.includes("areaSubVista === 'maquinas'")&&vista.includes("areaSubVista === 'maquinas'"));
  check('accesos originales de Jardinería y archivos complementarios permanecen',mantenciones.includes('function mntPanelJardineriaHTML')&&['INSUMOS JARDINERIA.xlsx','EN BODEGA.xlsx','INSUMOS -NUEVA BODEGA OESTE.xlsx'].every(x=>remodelaciones.includes(x)));
  // Array.from del manejo de foco no es una consulta a tablas.
  check('nueva vista sin escritura, stock, reimportación ni servicio paralelo',!/\.from\(|\.rpc\(|localStorage|\.insert\(|\.update\(|afecta_stock|registrarEntrada|registrarSalida/.test(fuente.replaceAll('Array.from(', 'Array_from(')));
}
async function probarInsumosJardineria() {
  const archivo='INSUMOS JARDINERIA.xlsx',consultas=[],escrituras=[];
  const tablas={
    movimientos_inventario:Array.from({length:51},(_,i)=>({id:'mov-'+String(i).padStart(4,'0'),archivo_origen:archivo,hoja_origen:'Remo-cabaña sol',fila_origen:i+2,producto_original:'Insumo histórico '+i,cantidad_original:i===0?null:'3 cajas',cantidad:i===0?null:3,costo_unitario:i===0?null:i===1?0:'12.50',costo_total:i===0?null:37.50,fecha:'2024-10-15',afecta_stock:false,observaciones:'Observación original'})),
    tareas:[{id:'tarea-aplicaciones',archivo_origen:archivo,hoja_origen:'aplicaciones',grupo_origen:'QUINCHO TERRAZA',titulo:'Se fumiga',estado:'Pausado',progreso:null,responsable_texto:null,fecha_inicio:null,fecha_vencimiento:null}],
    importaciones_excel:[{id:'imp-remo',archivo_origen:archivo,hoja_origen:'Remo-cabaña sol',total_con_iva:null,observaciones:'Metadatos originales'},{id:'imp-aplicaciones',archivo_origen:archivo,hoja_origen:'aplicaciones',total_con_iva:null}]
  };
  let fallar='';
  const cliente={from(tabla){
    const q={tabla};return {
      select(columnas){q.columnas=columnas;return this;},eq(campo,valor){q.campo=campo;q.valor=valor;return this;},order(campo){q.orden=campo;return this;},
      async range(desde,hasta){consultas.push({...q,desde,hasta});if(fallar===tabla)return {data:null,error:Error('Error simulado')};return {data:tablas[tabla].filter(r=>r[q.campo]===q.valor).slice(desde,hasta+1),error:null};},
      insert(){escrituras.push('insert');throw Error('Prohibido');},update(){escrituras.push('update');throw Error('Prohibido');},delete(){escrituras.push('delete');throw Error('Prohibido');},upsert(){escrituras.push('upsert');throw Error('Prohibido');}
    };
  },rpc(){escrituras.push('rpc');throw Error('Prohibido');}};
  const ventana={supabaseClient:cliente};vm.runInNewContext(leer('js/services/mantenciones.service.js'),{window:ventana,console:{error(){}}});
  const svc=ventana.MantencionesService;
  const hist=await svc.getInsumosJardineria();
  check('servicio existente lee 51 movimientos, una tarea y dos metadatos separados',hist.movimientos.length===51&&hist.tareas.length===1&&hist.importaciones.length===2&&consultas.length===3);
  check('lecturas con archivo literal, PK estable, rangos y trazabilidad',consultas.every(q=>q.campo==='archivo_origen'&&q.valor===archivo&&q.orden==='id'&&q.desde===0&&q.hasta===499)&&consultas.find(q=>q.tabla==='movimientos_inventario').columnas.includes('fila_origen')&&consultas.find(q=>q.tabla==='tareas').columnas.includes('grupo_origen'));
  const cantidad=consultas.length;await svc.getInsumosJardineria();check('caché de lectura sin duplicar filas ni solicitudes',consultas.length===cantidad);
  const r=escenario();r.ctx.window.MantencionesService.getInsumosJardineria=force=>svc.getInsumosJardineria(force);
  await r.ctx.jdaCambiarTab('insumos');
  check('ambas hojas visibles aun si aplicaciones no tiene movimientos',r.ctx.jdaFiltrosHTML().includes('Remo-cabaña sol')&&r.ctx.jdaCuerpoHTML().includes('Aplicaciones registradas')&&r.ctx.jdaCuerpoHTML().includes('Movimientos del archivo')&&r.ctx.jdaCuerpoHTML().includes('>51</span>')&&r.ctx.jdaCuerpoHTML().includes('>1</span>')&&r.ctx.jdaCuerpoHTML().includes('>2</span>'));
  check('histórico funciona independientemente de la carga del contenido maestro',r.ctx.jdaCuerpoHTML().includes('INSUMOS JARDINERIA.xlsx')&&!r.ctx.jdaCuerpoHTML().includes('Cargando Jardinería'));
  r.ctx.jdaFiltrar('hoja','Remo-cabaña sol');r.ctx.jdaFiltrar('tipo','insumos_movimientos');
  check('hoja de movimientos conserva los 51 IDs únicos',r.ctx.jdaFiltrados().length===51&&new Set(r.ctx.jdaFiltrados().map(i=>i.registro.id)).size===51);
  check('listado histórico identifica cantidades/costos históricos y NULL',!r.ctx.jdaResultadosHTML().includes('Cantidad histórica: Sin dato registrado')&&!r.ctx.jdaResultadosHTML().includes('Costo unitario histórico:')&&r.ctx.jdaResultadosHTML().includes('Cantidad histórica: 3 cajas')&&!r.ctx.jdaResultadosHTML().includes('$'));
  r.ctx.jdaAbrirDetalle('insumos_movimientos:mov-0050');
  check('detalle de último movimiento conserva hoja, fila, ID, archivo y valores',r.ctx.jdaDetalleHTML().includes('Remo-cabaña sol')&&r.ctx.jdaDetalleHTML().includes('mov-0050')&&r.ctx.jdaDetalleHTML().includes('fila origen')&&r.ctx.jdaDetalleHTML().includes(archivo)&&r.ctx.jdaDetalleHTML().includes('IMPORTE HISTÓRICO')&&r.ctx.jdaDetalleHTML().includes('Observación original'));
  r.ctx.jdaVolverListado();r.ctx.jdaFiltrar('tipo','insumos_tareas');r.ctx.jdaFiltrar('hoja','aplicaciones');
  check('aplicaciones no se pierde al carecer de movimientos',r.ctx.jdaFiltrados().length===1&&r.ctx.jdaCuerpoHTML().includes('su estado original no confirma una ejecución')&&r.ctx.jdaResultadosHTML().includes('QUINCHO TERRAZA')&&r.ctx.jdaResultadosHTML().includes('Pausado'));
  r.ctx.jdaAbrirDetalle('insumos_tareas:tarea-aplicaciones');
  check('tarea conserva estado y NULL sin inferir ejecución ni stock',r.ctx.jdaDetalleHTML().includes('Pausado')&&r.ctx.jdaDetalleHTML().includes('Sin dato registrado')&&r.ctx.jdaDetalleHTML().includes('no se presume ejecución terminada ni stock disponible')&&!r.ctx.jdaDetalleHTML().includes('100%'));
  r.ctx.jdaVolverListado();check('histórico conserva hoja y clase al volver',r.ctx.jdaFiltrosHTML().includes('value="aplicaciones" selected')&&vm.runInContext("jdaEstado.tipo==='insumos_tareas'",r.ctx));
  r.ctx.jdaFiltrar('tipo','insumos_importaciones');r.ctx.jdaFiltrar('hoja','aplicaciones');
  check('metadatos de aplicaciones consultables como metadata, no como tarea',r.ctx.jdaFiltrados().length===1&&r.ctx.jdaCuerpoHTML().includes('Procedencia documental')&&r.ctx.jdaResultadosHTML().includes('aplicaciones'));
  r.ctx.jdaFiltrar('tipo','insumos_movimientos');
  check('movimientos son categoría inicial y excluyen tareas/metadatos',r.ctx.jdaFiltrados().length===51&&r.ctx.jdaFiltrados().every(i=>i.grupo==='insumos_movimientos'));
  check('cambiar categoría limpia filtros incompatibles sin nuevas consultas',vm.runInContext("jdaEstado.hoja===''&&jdaEstado.texto===''&&jdaEstado.pagina===1",r.ctx)&&consultas.length===cantidad);
  check('categorías muestran conteos consultados y no requieren clase técnica',r.ctx.jdaCuerpoHTML().includes('Movimientos del archivo')&&r.ctx.jdaCuerpoHTML().includes('Aplicaciones registradas')&&r.ctx.jdaCuerpoHTML().includes('Información del archivo')&&!r.ctx.jdaFiltrosHTML().includes('Clase de registro'));
  r.ctx.jdaAbrirDetalle('insumos_movimientos:mov-0000');check('costo NULL permanece en detalle técnico',r.ctx.jdaDetalleHTML().includes('costo unitario')&&r.ctx.jdaDetalleHTML().includes('Sin dato registrado'));r.ctx.jdaCerrarDetalle();
  r.ctx.jdaAbrirDetalle('insumos_movimientos:mov-0001');check('costo cero conserva significado histórico en detalle',r.ctx.jdaDetalleHTML().includes('Costo unitario histórico')&&r.ctx.jdaDetalleHTML().includes('>0</dd>')&&r.ctx.jdaDetalleHTML().includes('Moneda no confirmada'));r.ctx.jdaCerrarDetalle();
  r.ctx.jdaFiltrar('tipo','insumos_tareas');check('aplicación conserva título real y no se presenta como ejecución',r.ctx.jdaFiltrados().length===1&&r.ctx.jdaResultadosHTML().includes('Se fumiga')&&r.ctx.jdaResultadosHTML().includes('Pausado')&&r.ctx.jdaCuerpoHTML().includes('no confirma una ejecución'));
  r.ctx.jdaFiltrar('tipo','insumos_importaciones');check('información del archivo contiene ambas procedencias sin movimientos',r.ctx.jdaFiltrados().length===2&&r.ctx.jdaFiltrados().every(i=>i.grupo==='insumos_importaciones')&&r.ctx.jdaResultadosHTML().includes('Remo-cabaña sol')&&r.ctx.jdaResultadosHTML().includes('aplicaciones'));
  fallar='tareas';await r.ctx.jdaCargarInsumos(true);
  check('fallo de tarea impide presentar cobertura completa o cero',r.ctx.jdaCuerpoHTML().includes('No se pudo consultar el archivo histórico')&&!r.ctx.jdaCuerpoHTML().includes('0 tareas importadas')&&r.ctx.jdaCuerpoHTML().includes('Reintentar históricos'));
  fallar='';await r.ctx.jdaCargarInsumos(true);check('reintento recupera también la tarea de aplicaciones',r.ctx.jdaCuerpoHTML().includes('>51</span>')&&r.ctx.jdaCuerpoHTML().includes('>1</span>'));
  const original=tablas.movimientos_inventario;
  tablas.movimientos_inventario=Array.from({length:1003},(_,i)=>({...original[1],id:'mov-stress-'+String(i).padStart(4,'0')}));
  const antes=consultas.length;const mayor=await svc.getInsumosJardineria(true);
  check('paginación de servidor supera 1000 filas sin truncar ni duplicar',mayor.movimientos.length===1003&&new Set(mayor.movimientos.map(x=>x.id)).size===1003&&consultas.slice(antes).filter(q=>q.tabla==='movimientos_inventario').map(q=>q.desde).join(',')==='0,500,1000');
  tablas.movimientos_inventario=original;
  check('cero escrituras, RPC, cambios de stock o importaciones nuevas',escrituras.length===0&&original.every(x=>x.afecta_stock===false));
}
async function probarModalesJardineria() {
  const r=escenario();
  r.ctx.requestAnimationFrame=fn=>fn();
  // Ejercitar openModal/closeModal reales sin modificar sus contratos compartidos.
  vm.runInContext(modales.slice(modales.indexOf('function openModal('),modales.indexOf('function handleModalBackdropClick(')),r.ctx);
  const datos={sectores:[{id:'sector',nombre:'Sector original',hoja_origen:'Sectores'}],trabajos:[{id:'trabajo',titulo:'Título actual',titulo_original:'Título original legible',sector_id:'sector',prioridad:2,observaciones:'Observación original',fila_origen:12,created_at:'2024-10-15T00:00:00Z'}],riegoProgramacion:[{id:'programacion',zona:'Zona original',dia_semana:'Lunes'}],riegoZonas:[{id:'zona',zona:'Zona original'}],riegoNotas:[{id:'nota',contenido:'Nota original'}],laboresComplementarias:[{id:'labor',titulo:'Labor original',frecuencia:'Semanal'}]};
  let lecturas=0;
  r.ctx.window.MantencionesService.getJardineria=async()=>{lecturas++;return datos;};
  r.ctx.window.MantencionesService.getInsumosJardineria=async()=>{lecturas++;return {movimientos:[{id:'movimiento',producto_original:'Insumo original',archivo_origen:'INSUMOS JARDINERIA.xlsx',hoja_origen:'Remo-cabaña sol',fila_origen:7,cantidad_original:'2 cajas',costo_unitario:0,costo_total:null}],tareas:[{id:'aplicacion',titulo:'Aplicación original',estado:'Pausado',grupo_origen:'QUINCHO TERRAZA',hoja_origen:'aplicaciones'}],importaciones:[{id:'importacion',archivo_origen:'INSUMOS JARDINERIA.xlsx',hoja_origen:'aplicaciones'}]};};
  await r.ctx.areaCargarFuente('workarea_jardineria');
  const fondo=r.nodo('view-container');fondo.scrollTop=735;fondo.style.overflow='auto';
  r.doc.body.style.overflow='clip';
  const origen=r.nodo('boton-origen');origen.focus();
  r.nodo('jda-contenido').innerHTML=r.ctx.jdaCuerpoHTML();
  const listado=r.nodo('jda-contenido').innerHTML;
  const estado=vm.runInContext("JSON.stringify({...jdaEstado,detalle:null})",r.ctx);
  r.ctx.jdaAbrirDetalle('trabajos:trabajo');
  const modal=r.doc.getElementById('jda-detalle-overlay');
  check('modal única con semántica accesible y cabecera fija sobre detalle desplazable',modal.getAttribute('role')==='dialog'&&modal.getAttribute('aria-modal')==='true'&&modal.getAttribute('aria-labelledby')==='jda-detalle-titulo'&&modal.innerHTML.includes('shrink-0')&&modal.innerHTML.includes('overflow-y-auto')&&!modal.classList.contains('hidden'));
  check('abrir detalle no sustituye listado ni cambia pestaña/filtros/página',r.nodo('jda-contenido').innerHTML===listado&&vm.runInContext("JSON.stringify({...jdaEstado,detalle:null})",r.ctx)===estado);
  check('fondo bloqueado sin perder posición y foco inicial en X',r.doc.body.style.overflow==='hidden'&&fondo.style.overflow==='hidden'&&fondo.inert===true&&fondo.scrollTop===735&&r.doc.activeElement===r.nodo('jda-detalle-cerrar'));
  const antes=modal.innerHTML.split('<details')[0],tecnica=modal.innerHTML.split('<details')[1];
  check('información comprensible primero y todos los campos originales en sección secundaria',antes.includes('Título original legible')&&antes.includes('Sector original')&&antes.includes('Prioridad documental')&&antes.includes('Observación original')&&!antes.includes('created at')&&!antes.includes('fila origen')&&tecnica.includes('Información técnica y trazabilidad')&&tecnica.includes('fila origen')&&tecnica.includes('created at')&&tecnica.includes('Título actual'));
  let prevenido=false;
  r.nodo('jda-summary').focus();r.ctx.jdaTeclaDetalle({key:'Tab',shiftKey:false,preventDefault(){prevenido=true;}});
  check('Tab cíclico mantiene foco dentro de la modal',prevenido&&r.doc.activeElement===r.nodo('jda-detalle-cerrar'));
  prevenido=false;r.ctx.jdaTeclaDetalle({key:'Tab',shiftKey:true,preventDefault(){prevenido=true;}});
  check('Shift+Tab cíclico llega al último control',prevenido&&r.doc.activeElement===r.nodo('jda-summary'));
  let detenido=false;r.ctx.jdaTeclaDetalle({key:'Escape',preventDefault(){},stopImmediatePropagation(){detenido=true;}});
  check('Escape conserva la modal y sus listeners',!detenido&&!modal.classList.contains('hidden')&&r.listeners.has(r.ctx.jdaTeclaDetalle));
  r.ctx.jdaCerrarDetalle();
  check('X explícita cierra y elimina su listener',modal.classList.contains('hidden')&&!r.listeners.has(r.ctx.jdaTeclaDetalle));
  check('cierre restaura scroll, overflow, inert y foco sin recrear lista',fondo.scrollTop===735&&fondo.style.overflow==='auto'&&fondo.inert===false&&r.doc.body.style.overflow==='clip'&&r.doc.activeElement===origen&&origen.opcionesFoco.preventScroll===true&&r.nodo('jda-contenido').innerHTML===listado);
  const veces=lecturas;
  for(const [tab,claves] of [['sectores',['sectores:sector','trabajos:trabajo']],['riego',['riegoProgramacion:programacion','riegoZonas:zona','riegoNotas:nota']],['labores',['laboresComplementarias:labor']],['insumos',['insumos_movimientos:movimiento','insumos_tareas:aplicacion','insumos_importaciones:importacion']]]) {
    await r.ctx.jdaCambiarTab(tab);
    for(const clave of claves) {
      r.ctx.jdaAbrirDetalle(clave);
      check('ventana emergente para '+clave,!modal.classList.contains('hidden')&&r.doc.getElementById('jda-detalle-overlay')===modal&&modal.innerHTML.includes('Ver datos originales'));
      r.ctx.jdaCerrarDetalle();
      check('X restaura el listado para '+clave,modal.classList.contains('hidden')&&fondo.inert===false&&vm.runInContext('jdaEstado.detalle===null',r.ctx));
    }
  }
  check('abrir y cerrar no vuelve a consultar Supabase',lecturas===veces+1);
  await r.ctx.jdaCambiarTab('sectores');r.ctx.jdaAbrirDetalle('sectores:sector');r.ctx.jdaAbrirDetalle('trabajos:trabajo');
  check('aperturas sucesivas reutilizan una sola modal y un solo listener',[...r.nodos.keys()].filter(k=>k==='jda-detalle-overlay').length===1&&r.listeners.size===1&&modal.innerHTML.includes('Título original legible'));
  r.ctx.jdaCerrarDetalle();r.ctx.jdaCerrarDetalle();
  check('cierre repetido no altera estilos originales ni deja listeners',r.listeners.size===0&&r.doc.body.style.overflow==='clip'&&fondo.style.overflow==='auto');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
