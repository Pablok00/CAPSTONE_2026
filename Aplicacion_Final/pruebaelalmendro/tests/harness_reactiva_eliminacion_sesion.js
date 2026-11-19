'use strict';
const assert=require('assert/strict'),vm=require('vm');
const {entorno,fuente,solicitudId,usuarioId}=require(process.cwd()+'/tests/harness_reactiva_eliminacion');
function crearEntorno(origen='solicitudes'){
 const e=entorno(origen),c=e.c;const nodos=[],escuchas=new Set();
 function nodo(role='dialog'){
  const hijos=new Map();
  const n={id:'',isConnected:true,inert:false,disabled:false,value:'',style:{},classList:{add(){}},setAttribute(){},
   getAttribute:a=>a==='role'?role:null,remove(){this.isConnected=false;},focus(){},
   querySelector(s){if(!hijos.has(s))hijos.set(s,nodo(''));return hijos.get(s);},
   querySelectorAll(){return [];},appendChild(x){x.isConnected=true;nodos.push(x);}};
  n.elements={motivo:{value:'Motivo de prueba local'},confirmacion:{value:'ELIMINAR DEFINITIVAMENTE'},trabajo:{checked:false}};
  return n;
 }
 const raiz=nodo(''),ficha={registro:origen==='reactiva'?c.registro:c.solicitud,usuarioId,raiz,dialogo:nodo(),ocupada:false};
 nodos.push(ficha.dialogo);
 c.document={body:{style:{overflow:''},appendChild:n=>{n.isConnected=true;nodos.push(n);}},activeElement:null,
  createElement:()=>nodo(),addEventListener:(t,f)=>escuchas.add(f),removeEventListener:(t,f)=>escuchas.delete(f),
  getElementById:id=>id===(origen==='reactiva'?'reactiva-vista':'solicitudes-vista')?raiz:null,querySelectorAll:()=>nodos.filter(n=>n.isConnected)};
 c.currentView=origen==='reactiva'?'areas':'solicitudes';c.activeAreaFilter='workarea_reactiva';c.areaSubVista=null;
 vm.runInContext(fuente('js/views/solicitudes.js'),c);
 vm.runInContext(fuente('js/views/reactiva.js'),c);
 // Usar la ficha real como contexto, sin renderizar listados ajenos a esta prueba.
 const variable=origen==='reactiva'?'reactivaDetalle':'solicitudesDetalle';
 c.fichaPrueba=ficha;vm.runInContext(variable+'=fichaPrueba',c);
 c.solicitudesCerrarDetalle=()=>{ficha.dialogo.remove();vm.runInContext('solicitudesDetalle=null',c);};
 const app=fuente('js/app.js'),desde=app.indexOf('  function retirarFormularios('),hasta=app.indexOf('  async function aplicar(',desde);
 vm.runInContext(app.slice(desde,hasta),c);
 return {...e,ficha,raiz,escuchas,estado:()=>vm.runInContext('solicitudesEliminacion',c),nuevo(){const f={...ficha,dialogo:nodo(),ocupada:false};nodos.push(f.dialogo);c.fichaPrueba=f;vm.runInContext(variable+'=fichaPrueba',c);return f;}};
}
async function principal(){
 const e=crearEntorno();await e.c.solicitudesAbrirEliminacion('solicitudes',e.ficha);
 const anterior=e.estado();assert(anterior&&anterior.dialogo.isConnected);
 e.c.permanente=false;e.c.retirarFormularios(true,true,true);
 assert.equal(anterior.dialogo.isConnected,false);
 const nueva=e.nuevo();e.c.permanente=true;
 await e.c.solicitudesAbrirEliminacion('solicitudes',nueva);

 assert(e.estado()!==anterior&&e.estado().dialogo.isConnected);
 console.log('PASS revocación retira referencia; recuperación permanente permite abrir otra vez');
 const reactiva=crearEntorno('reactiva');await reactiva.c.solicitudesAbrirEliminacion('reactiva',reactiva.ficha);
 const referenciaReactiva=reactiva.estado();reactiva.c.permanente=false;reactiva.c.retirarFormularios(true,true,true);
 assert.equal(reactiva.estado(),null);reactiva.c.permanente=true;
 await reactiva.c.solicitudesAbrirEliminacion('reactiva',reactiva.nuevo());
 assert(reactiva.estado()!==referenciaReactiva&&reactiva.estado().dialogo.isConnected);
 assert.equal(reactiva.llamadas.length,0);
 console.log('PASS recuperación del diálogo compartido desde Reactiva, sin RPC de eliminación');
 assert.equal(anterior.ficha.ocupada,false);assert.equal(anterior.ficha.dialogo.inert,false);
 e.c.solicitudesCerrarEliminacion();
 for(const role of ['ADMINISTRADOR','RECEPCION','TECNICO']){
  e.c.permanente=false;e.c.state.currentUser.role=role;
  await e.c.solicitudesAbrirEliminacion('solicitudes',nueva);assert.equal(e.estado(),null);
 }
 assert.equal(e.llamadas.length,0);
 console.log('PASS sin permiso permanente (incluido temporal operativo), Recepción y Técnico no reabren ni envían');
 const p=crearEntorno(),preparar=p.servicio.prepararEliminacion.bind(p.servicio);let resolverLectura;
 p.servicio.prepararEliminacion=()=>new Promise(r=>resolverLectura=r);
 const lectura=p.c.solicitudesAbrirEliminacion('solicitudes',p.ficha);
 const retirado=p.estado();p.c.permanente=false;p.c.retirarFormularios(true,true,true);
 assert.equal(p.estado(),null);
 const fichaActual=p.nuevo();p.c.permanente=true;p.servicio.prepararEliminacion=preparar;
 await p.c.solicitudesAbrirEliminacion('solicitudes',fichaActual);const actual=p.estado();
 resolverLectura({solicitud:p.c.solicitud,reforzada:false,mantencion:null});await lectura;
 assert.equal(p.estado(),actual);assert.notEqual(actual,retirado);
 console.log('PASS lectura tardía del diálogo retirado no reemplaza el nuevo');
 const r=crearEntorno();await r.c.solicitudesAbrirEliminacion('solicitudes',r.ficha);let rechazar;
 r.c.window.supabaseClient.rpc=async()=>{r.llamadas.push({});return new Promise((a,b)=>rechazar=b);};
 const envio=r.c.solicitudesConfirmarEliminacion({preventDefault(){}});
 for(let i=0;i<30&&!rechazar;i++)await Promise.resolve();
 assert(rechazar);const enviando=r.estado();assert(enviando.ocupada);
 r.c.permanente=false;r.c.retirarFormularios(true,true,true);
 assert.equal(r.estado(),enviando);assert(r.servicio.eliminacionesEnCurso.has(solicitudId));
 r.c.permanente=true;
 await r.c.solicitudesAbrirEliminacion('solicitudes',r.ficha);assert.equal(r.estado(),enviando);
 rechazar(new Error('Conexión incierta simulada'));await envio;
 assert.equal(r.estado(),null);assert(r.servicio.eliminacionesInciertas.has(solicitudId));
 const fichaRecuperada=r.nuevo();await r.c.solicitudesAbrirEliminacion('solicitudes',fichaRecuperada);
 assert(r.estado().dialogo.isConnected);
 await r.c.solicitudesConfirmarEliminacion({preventDefault(){}});
 assert.equal(r.llamadas.length,1);assert(r.servicio.eliminacionesInciertas.has(solicitudId));
 console.log('PASS envío en curso bloqueado hasta resolver; incertidumbre sigue impidiendo otra RPC');
}
if(require.main===module)principal().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={crearEntorno};

