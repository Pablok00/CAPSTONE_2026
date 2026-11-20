// GANTT-1: pruebas en memoria; no conexiones ni escrituras reales.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let total=0;function check(nombre,cond){assert.ok(cond,nombre);total++;console.log('[PASS] '+nombre);}
const base=process.env.GANTT_TEST_ESPEJO==='1'?'publicacion/':'';
const script=fs.readFileSync(base+'js/views/gantt.js','utf8');
const fechas=fs.readFileSync(base+'js/state.js','utf8');
const utilidad=fechas.slice(fechas.indexOf('function formatearFechaCL('),fechas.indexOf('function calculateWarrantyStatus('));
function escenario(){
  const nodos=new Map(),timers=[],llamadas=[],modelos=[];
  const nodo=id=>{if(!nodos.has(id))nodos.set(id,{innerHTML:'',classList:{add(){},remove(){}}});return nodos.get(id);};
  const r={uiEncabezadoSeccion:(titulo,subtitulo)=>'<header>'+titulo+' '+subtitulo+'</header>',window:{GanttCarta:{render(op){modelos.push(op);return '<div>Gantt compartido</div>';}}},document:{getElementById:nodo},setTimeout:fn=>timers.push(fn),state:{}};
  Object.defineProperty(r.state,'maintenances',{get(){throw Error('Datos locales prohibidos');}});
  r.window.RemodelacionesService={async getProyectos(){llamadas.push('rem');return [{id:'r',name:'Histórico real',es_historico:true,status:'Pausado'}];},async getTareasRemodelaciones(){return [{id:'tr',proyecto_id:'r',titulo:'Trabajo antiguo',fecha_inicio:'2022-04-12',fecha_vencimiento:'2022-04-18',progreso:null,estado:'Pausado'}];}};
  r.window.MejorasService={async getProyectos(){llamadas.push('mej');return [{id:'m',nombre:'Plan nuevo',fecha_inicio:'2026-02-01',estado:'Programado'},{id:'s',nombre:'Sin fechas'}];},async getTareas(id){return id==='m'?[{id:'tm',titulo:'Tarea real',fecha_inicio:'2026-02-01',fecha_vencimiento:'2026-02-10',progreso:0}]:[];}};
  r.window.MantencionesService={async getPrevencionGantt(){llamadas.push('pv');return {planes:[{id:'p',titulo:'Prevención',anio:2024},{id:'i',titulo:'Inactivo',activo:false}],fases:[{id:'f',nombre:'Planificación'}],items:[{id:'tp',plan_id:'p',fase_id:'f',titulo:'Inspección',fecha_inicio:'2024-01-02',fecha_termino:'2024-01-03',progreso_porcentaje:null},{id:'grupo',plan_id:'p',es_grupo:true,titulo:'Encabezado'},{id:'vacio',plan_id:'p',titulo:null}]};}};
  vm.createContext(r);vm.runInContext(utilidad,r);vm.runInContext(script,r);return {ctx:r,nodo,nodos,timers,llamadas,modelos};
}
async function main(){
  const r=escenario(),c=r.ctx;await c.gtCargar();let html=c.getGanttHTML();
  check('solo cartas de tres servicios existentes',r.llamadas.length===3&&vm.runInContext('ganttCartas.length',c)===4);
  check('agrupación descendente por años reales',html.indexOf('>2026</h3>')<html.indexOf('>2024</h3>')&&html.indexOf('>2024</h3>')<html.indexOf('>2022</h3>'));
  check('histórico conserva año y estado sin convertirlo en completado',html.includes('Histórico importado')&&html.includes('Pausado')&&!html.includes('Completada'));
  check('carta sin tareas ni fechas se oculta solo del listado',!c.gtOrdenadas().some(x=>x.titulo==='Sin fechas')&&vm.runInContext("ganttCartas.some(x=>x.titulo==='Sin fechas')",c));
  check('no muestra inactivos ni encabezados como cartas/tareas',!html.includes('Inactivo')&&vm.runInContext("ganttCartas.find(c=>c.id==='p').modelo.length",c)===1);
  check('cantidades reales, cero registrado y estado desconocido',!html.includes('Sin fechas</h3>')&&html.includes('Sin estado registrado'));
  check('sin dependencias de mocks, almacenamiento o semanas superiores',!/state\.|localStorage|getSystemDate|Ago Sem|Sep Medio/.test(script));
  c.selectGanttProject('Remodelación:r');html=c.getGanttHTML();check('detalle reutiliza GanttCarta con formato de solo lectura',html.includes('Gantt compartido')&&html.includes('Carta Gantt · solo lectura')&&r.modelos.at(-1).tareas[0].titulo==='Trabajo antiguo');
  check('NULL no se transforma en progreso cero',r.modelos.at(-1).tareas[0].progreso===null);
  c.backToGanttProjects();c.selectGanttProject('Mejoras:m');c.getGanttHTML();check('cero real se conserva',r.modelos.at(-1).tareas[0].progreso===0);
  check('fechas ISO conservan día sin conversión horaria',c.gtFecha('2024-10-15T23:30:00-12:00')==='15-10-2024');
  check('fechas inválidas no crean cronología',c.gtDia('2024-02-31')===null&&c.gtFecha(null)==='Sin fecha registrada');
  check('formateador soporta Date del componente compartido',c.gtFecha(new Date(2024,9,15))==='15-10-2024');
  const antes=r.llamadas.length;await c.gtCargar();check('abrir/volver y caché no recargan fuentes',r.llamadas.length===antes);
  c.backToGanttProjects();c.gtFiltrar('Prevencionista');check('filtro exacto de fuente',c.gtOrdenadas().length===1&&c.getGanttHTML().includes('selected>Prevencionista'));
  c.selectGanttProject('no-existe');check('identificador ajeno no abre ficha',vm.runInContext('ganttSelectedProjectId',c)===null);
  check('valores reales escapados',c.gtTarjeta(c.gtCarta('Mejoras',{id:'x',nombre:'<img src=x>'},[])).includes('&lt;img'));
  vm.runInContext("ganttCartas.push(gtCarta('Mejoras',{id:'sinfecha',nombre:'Con tarea sin fechas'},[{id:'sf',titulo:'Tarea sin fechas'}]),gtCarta('Mejoras',{id:'solofecha',nombre:'Plan sin tareas fechado',fecha_inicio:'2025-05-01'},[]),gtCarta('Mejoras',{id:'multianual',nombre:'Cruza años'},[{id:'multi',titulo:'Período completo',fecha_inicio:'2022-12-01',fecha_vencimiento:'2026-01-01'}]))",c);c.gtFiltrar('Mejoras');
  check('tareas sin fechas permanecen visibles',c.gtOrdenadas().some(x=>x.titulo==='Con tarea sin fechas'));
  check('plan fechado sin tareas permanece visible',c.gtOrdenadas().some(x=>x.titulo==='Plan sin tareas fechado'));
  const multianual=c.gtOrdenadas().find(x=>x.id==='multianual');check('carta multianual agrupada por inicio conserva término',multianual.anio==='2022'&&multianual.fin==='2026-01-01');
  const fallo=escenario();fallo.ctx.window.RemodelacionesService.getProyectos=async()=>{throw Error('fallo');};await fallo.ctx.gtCargar();check('error de una fuente conserva otras y no simula vacío',fallo.ctx.getGanttHTML().includes('cobertura no disponible')&&fallo.ctx.getGanttHTML().includes('Plan nuevo'));
  const tareaError=escenario();tareaError.ctx.window.MejorasService.getTareas=async()=>{throw Error('fallo');};await tareaError.ctx.gtCargar();check('error de tareas no se presenta como cero',tareaError.ctx.getGanttHTML().includes('Cantidad de tareas no disponible'));tareaError.ctx.selectGanttProject('Mejoras:m');check('detalle con error no dibuja tareas vacías',tareaError.ctx.getGanttHTML().includes('No se pudieron consultar las tareas'));
  const tarde=escenario();tarde.ctx.renderGanttView();const carga=tarde.timers[0]();tarde.nodos.set('gantt-content',{innerHTML:'Otra vista'});await carga;check('respuesta tardía no pisa otra pantalla',tarde.nodo('gantt-content').innerHTML==='Otra vista');
  const vacio=escenario();vacio.ctx.window.RemodelacionesService.getProyectos=async()=>[];vacio.ctx.window.MejorasService.getProyectos=async()=>[];vacio.ctx.window.MantencionesService.getPrevencionGantt=async()=>({planes:[],items:[],fases:[]});await vacio.ctx.gtCargar();check('vacío verdadero visible sin cartas simuladas',vacio.ctx.getGanttHTML().includes('Sin cartas disponibles')&&vacio.ctx.gtOrdenadas().length===0);
  // Renderer real: comprueba el contrato del adaptador y el tratamiento de NULL.
  const real={window:{}};vm.createContext(real);vm.runInContext(fs.readFileSync('js/components/ganttCarta.js','utf8'),real);const grafico=real.window.GanttCarta.render(r.modelos[0]);check('componente real dibuja modelo sin modificarlo',typeof grafico==='string'&&grafico.includes('Trabajo antiguo'));
  // Lectura backend bajo demanda: RPC simulada; nunca conecta con Supabase.
  function bajoDemanda(){
    const e=escenario(),rpc=[];let respuesta=null;
    e.ctx.window.supabaseClient={rpc:async(nombre,args)=>{
      rpc.push({nombre,id:args.p_proyecto_id});
      if(respuesta)return respuesta(nombre,args);
      return {data:{carta:{titulo:'Carta habilitada',version:9},proyecto:{id:args.p_proyecto_id},fases:[],tareas:[{registro:{id:'backend-tarea',proyecto_id:args.p_proyecto_id,titulo:'Histórico conservado',fecha_inicio:'2022-01-02'},asignacion:null,linea_base:{titulo:'Original'}}]},error:null};
    }};
    vm.runInContext(fs.readFileSync('js/services/ganttProyectos.service.js','utf8'),e.ctx);
    return {...e,rpc,set respuesta(fn){respuesta=fn;}};
  }
  const demanda=bajoDemanda();await demanda.ctx.gtCargar();
  check('listado no llama a gantt_proyecto_leer',demanda.rpc.length===0);
  let liberarLectura;const rpcValida=demanda.ctx.window.supabaseClient.rpc;
  demanda.ctx.window.supabaseClient.rpc=async(...args)=>{await new Promise(resolve=>liberarLectura=resolve);return rpcValida(...args);};
  const apertura1=demanda.ctx.selectGanttProject('Remodelación:r');const apertura2=demanda.ctx.selectGanttProject('Remodelación:r');
  check('carta pendiente muestra carga y sin edición',demanda.ctx.getGanttHTML().includes('Consultando información de la carta')&&!demanda.ctx.getGanttHTML().includes('+ Agregar tarea'));
  liberarLectura();await Promise.all([apertura1,apertura2]);
  check('dos aperturas comparten una sola RPC',demanda.rpc.length===1&&demanda.rpc[0].id==='r');
  check('carta habilitada aplica datos y versión',demanda.ctx.gtActual().backend.carta.version===9&&demanda.ctx.gtActual().modelo.some(t=>t.titulo==='Histórico conservado'));
  demanda.ctx.esAdminPermanenteActual=()=>true;check('lectura bajo demanda habilita controles solo al administrador autorizado',demanda.ctx.gtControles(demanda.ctx.gtActual()).includes('+ Agregar tarea'));
  demanda.ctx.window.supabaseClient.rpc=rpcValida;
  demanda.ctx.backToGanttProjects();await demanda.ctx.selectGanttProject('Remodelación:r');
  check('reapertura reutiliza caché',demanda.rpc.length===1);
  const rechazada=bajoDemanda();rechazada.respuesta=async()=>({data:null,error:{code:'P0001',message:'ENTIDAD_NO_ENCONTRADA: carta no habilitada'}});
  await rechazada.ctx.gtCargar();await rechazada.ctx.selectGanttProject('Remodelación:r');
  check('no habilitada conserva histórico y aviso discreto',rechazada.ctx.gtActual().modelo.some(t=>t.titulo==='Trabajo antiguo')&&rechazada.ctx.getGanttHTML().includes('Edición backend no habilitada')&&!rechazada.ctx.gtControles(rechazada.ctx.gtActual()).includes('role="alert"'));
  rechazada.ctx.backToGanttProjects();await rechazada.ctx.selectGanttProject('Remodelación:r');rechazada.ctx.gtFiltrar('Remodelación');
  check('no habilitada no se reintenta al reabrir ni filtrar',rechazada.rpc.length===1);
  await rechazada.ctx.gtActualizar();check('actualización explícita relee solo la carta seleccionada',rechazada.rpc.length===2&&rechazada.rpc.every(x=>x.id==='r'));
  rechazada.ctx.backToGanttProjects();const antesActualizar=rechazada.rpc.length;await rechazada.ctx.gtActualizar();check('actualizar listado no consulta backends',rechazada.rpc.length===antesActualizar);
  const habilitar=bajoDemanda();rechazada.respuesta=async(nombre,args)=>habilitar.ctx.window.supabaseClient.rpc(nombre,args);await rechazada.ctx.selectGanttProject('Remodelación:r');
  check('carta no habilitada sigue en caché hasta petición explícita',!rechazada.ctx.gtActual().backend);
  await rechazada.ctx.gtActualizar();check('actualización descubre una habilitación posterior',rechazada.ctx.gtActual().backend?.carta.version===9);
  for(const error of [{code:'P0001',message:'OTRO_ERROR: fallo real'},{code:'42501',message:'Permiso denegado'},{code:'P0001',message:'ENTIDAD_NO_ENCONTRADA: otro motivo'},{code:'XX000',message:'ENTIDAD_NO_ENCONTRADA: carta no habilitada'}]){
    const e=bajoDemanda();e.respuesta=async()=>({data:null,error});await e.ctx.gtCargar();await e.ctx.selectGanttProject('Remodelación:r');
    check('error real visible sin clasificar como no habilitada '+error.code+error.message,e.ctx.gtActual().backendEstado==='error'&&e.ctx.gtControles(e.ctx.gtActual()).includes('role="alert"')&&e.ctx.getGanttHTML().includes(error.message));
    await e.ctx.selectGanttProject('Remodelación:r');check('error no genera reintento automático '+error.message,e.rpc.length===1);
  }
  const red=bajoDemanda();red.respuesta=async()=>{throw Error('Red no disponible');};await red.ctx.gtCargar();await red.ctx.selectGanttProject('Mejoras:m');check('error de red visible con histórico conservado',red.ctx.getGanttHTML().includes('Red no disponible')&&red.ctx.gtActual().modelo.some(t=>t.titulo==='Tarea real'));
  const salir=bajoDemanda();let resolverSalida;salir.respuesta=()=>new Promise(resolve=>resolverSalida=resolve);await salir.ctx.gtCargar();const pendienteSalir=salir.ctx.selectGanttProject('Remodelación:r');salir.nodos.set('gantt-content',{innerHTML:'Otra vista intacta'});resolverSalida({data:null,error:{code:'P0001',message:'ENTIDAD_NO_ENCONTRADA: carta no habilitada'}});await pendienteSalir;
  check('lectura tardía no modifica otra vista',salir.nodo('gantt-content').innerHTML==='Otra vista intacta');
  const volver=bajoDemanda();let resolverVolver;volver.respuesta=()=>new Promise(resolve=>resolverVolver=resolve);await volver.ctx.gtCargar();const pendienteVolver=volver.ctx.selectGanttProject('Remodelación:r');volver.ctx.backToGanttProjects();const listaAnterior=volver.nodo('gantt-content').innerHTML;resolverVolver({data:null,error:{code:'P0001',message:'ENTIDAD_NO_ENCONTRADA: carta no habilitada'}});await pendienteVolver;
  check('volver al listado durante carga no reabre la ficha',volver.nodo('gantt-content').innerHTML===listaAnterior&&vm.runInContext('ganttSelectedProjectId===null',volver.ctx));
  for(const fuente of ['Prevencionista','Mejoras','Remodelación']){
    const carta=c.gtCarta(fuente,{id:'solo-memoria',nombre:'Carta original',titulo:'Carta original',es_historico:true},[{id:'t',titulo:'Tarea conservada',fecha_inicio:'2022-01-01',fecha_vencimiento:'2022-01-03'}]);
    carta.backend={carta:{version:1},datosInternos:'conservar'};const antes=JSON.stringify(carta);const ficha=c.gtDetalle(carta);
    check('sin desplegable técnico en '+fuente,!ficha.includes('Información original y trazabilidad')&&!ficha.includes('<pre')&&!ficha.includes('<details')&&!ficha.includes('datosInternos'));
    check('Gantt y datos internos conservados en '+fuente,ficha.includes('Gantt compartido')&&ficha.includes('Carta original')&&JSON.stringify(carta)===antes);
  }
  console.log(total+'/'+total+' PASS — GANTT-1 (solo memoria)');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
