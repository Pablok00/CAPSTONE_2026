'use strict';
const assert=require('assert/strict'),vm=require('vm');
const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');
const {fuente,solicitudId}=require('./harness_reactiva_eliminacion');
let reloj=10000,secuencia=0;const timers=new Map(),canales=[];
const timeout=(fn,ms)=>{const id=++secuencia;timers.set(id,{fn,cuando:reloj+ms});return id;};
async function flush(){for(let i=0;i<50;i++)await Promise.resolve();}
async function drenar(){for(let i=0;i<30&&timers.size;i++){const [id,t]=[...timers].sort((a,b)=>a[1].cuando-b[1].cuando)[0];timers.delete(id);reloj=t.cuando;t.fn();await flush();}assert(timers.size===0,'Sin polling permanente');}
function cliente(origen='solicitudes', { suscripcionDiferida = false } = {}) {
 const e=crearEntorno(origen),c=e.c,ventana={},documento={};let observador;
 e.ficha.id=e.ficha.registro.id;c.formatearFechaCL=v=>String(v||'');
 const originalGet=c.document.getElementById;
 c.document.getElementById=id=>/^(reactiva-ficha-modal|solicitudes-detalle-modal)$/.test(id)?c.fichaPrueba.dialogo:originalGet(id);
 c.document.querySelector=()=>null;c.document.visibilityState='visible';
 c.document.addEventListener=(n,fn)=>documento[n]=fn;
 c.window.addEventListener=(n,fn)=>ventana[n]=fn;
 c.setTimeout=timeout;c.clearTimeout=id=>timers.delete(id);c.Date={now:()=>reloj};c.esCuentaSinRol=()=>false;
 c.MutationObserver=class {constructor(fn){observador=fn;}observe(){}disconnect(){}};
 let auth;const envios=[],propios=[];let listados=0,consultas=0,avisos=0;
 c.window.supabaseClient.auth.onAuthStateChange=fn=>auth=fn;
 c.window.supabaseClient.channel=(topic,opciones)=>{
   const canal={topic,opciones,quitado:false,on(tipo,filtro,fn){this.receptores ||= {};this.receptores[filtro.event]=fn;this.recibir=m=>this.receptores[m.event||'invalidate']?.(m);return this;},subscribe(fn){this.estado=fn;if(!suscripcionDiferida)fn('SUBSCRIBED');return this;},async send(m){envios.push(m);for(const otro of canales)if(otro!==this&&!otro.quitado&&otro.topic===topic)otro.recibir(m);return 'ok';}};
   canales.push(canal);propios.push(canal);return canal;
 };
 c.window.supabaseClient.removeChannel=async canal=>{canal.quitado=true;canal.estado('CLOSED');};
 c.window.AvisosSolicitudes={sincronizar:async()=>{avisos++;return true;}};
 c.window.NotificacionesRevision={sincronizar:async()=>true};
 c.solicitudesCargar=async()=>{listados++;return true;};c.reactivaCargar=async()=>{listados++;return true;};
 const obtener=e.servicio.obtener.bind(e.servicio);
 e.servicio.obtener=async(...args)=>{consultas++;if(e.errorLectura)throw new Error('Conexión perdida');return e.ausente?null:obtener(...args);};
 const obtenerReactiva=c.window.MantencionesReactivasService.obtener;
 c.window.MantencionesReactivasService.obtener=async()=>{consultas++;if(e.errorLectura)throw new Error('Conexión perdida');return e.ausente?null:obtenerReactiva();};
 const src=fuente('js/avisosSolicitudes.js');vm.runInContext(src.slice(src.indexOf('window.SolicitudesSincronizacion =')),c);
 const sync=c.window.SolicitudesSincronizacion;sync.actualizarSesion();
 return {...e,sync,envios,ventana,documento,canal:()=>propios.filter(x=>!x.quitado).at(-1),auth:(...a)=>auth(...a),mutar:()=>observador(),conteos:()=>({listados,consultas,avisos}),datos:e};
}
async function probarCargaInicialReactiva(){
 function preparar(diferida=false){
  const e=cliente('reactiva',{suscripcionDiferida:diferida}),c=e.c,src=fuente('js/views/reactiva.js');
  vm.runInContext(src.slice(src.indexOf('function reactivaClaveCarga('),src.indexOf('function reactivaCambiarGrupo(')),c);
  let consultas=0,cargas=0,fallar=false,espera=null;
  c.uiCargandoHTML=()=>{cargas++;return 'Cargando...';};c.window.MantencionesReactivasService.listar=async()=>{consultas++;if(fallar)throw Error('Fallo de red');if(espera)return espera;return {registros:[],total:0};};
  c.raizMedida=e.raiz;vm.runInContext('reactivaContextos.set(raizMedida,{pagina:0,grupo:"activas",busqueda:"",secuencia:0,usuarioId:state.currentUser.id,registros:[]})',c);
  return {...e,medidas:()=>({consultas,cargas}),error:v=>fallar=v,esperar:p=>espera=p};
 }
 const a=preparar();await a.c.reactivaCargar(a.raiz);await drenar();assert.deepEqual(a.medidas(),{consultas:1,cargas:1});
 a.canal().estado('SUBSCRIBED');await drenar();assert.deepEqual(a.medidas(),{consultas:1,cargas:1});
 a.canal().recibir({payload:{v:1}});await drenar();assert.deepEqual(a.medidas(),{consultas:2,cargas:1});
 a.canal().estado('CHANNEL_ERROR');await drenar();assert.deepEqual(a.medidas(),{consultas:3,cargas:1});
 a.error(true);a.canal().recibir({payload:{v:1}});await drenar();assert(a.raiz.querySelector('[data-reactiva-estado]').textContent.includes('No se pudo'));assert.equal(a.medidas().cargas,1);
 a.error(false);await a.c.reactivaCargar(a.raiz);assert.equal(a.medidas().cargas,2);assert.equal(a.raiz.querySelector('[data-reactiva-actualizar]').disabled,false);
 a.sync.detener();await drenar();
 console.log('PASS 38L.14 suscripción previa:1consulta/1loader; broadcast/reconexión silenciosos, error y Actualizar conservados');
 const b=preparar(true);await b.c.reactivaCargar(b.raiz);b.canal().estado('SUBSCRIBED');await drenar();assert.deepEqual(b.medidas(),{consultas:2,cargas:1});b.sync.detener();await drenar();
 console.log('PASS 38L.14 lectura anterior a suscripción: revalidación necesaria2consultas/1loader cubre ventana perdida');
 const d=preparar();let resolver;d.esperar(new Promise(r=>resolver=r));const inicial=d.c.reactivaCargar(d.raiz);await drenar();
 const compartida=d.c.reactivaCargar(d.raiz,{remota:true});assert.equal(d.medidas().consultas,1);
 d.canal().recibir({payload:{v:1}});await drenar();assert.equal(d.medidas().consultas,1);
 d.esperar(null);resolver({registros:[],total:0});await inicial;await compartida;await flush();await drenar();assert.deepEqual(d.medidas(),{consultas:2,cargas:1});
 const antes=d.medidas().consultas;d.c.state.currentUser.id='otra-cuenta';d.canal().recibir({payload:{v:1}});await drenar();assert.equal(d.medidas().consultas,antes);d.sync.actualizarSesion();await drenar();assert.equal(d.medidas().consultas,antes);d.sync.detener();await drenar();
 console.log('PASS 38L.14 comparte petición vigente, conserva invalidación durante carga y no comparte entre usuarios');
 const v=preparar();await v.c.reactivaCargar(v.raiz);await drenar();v.raiz.querySelector('[data-reactiva-lista]').innerHTML='Tarjetas vigentes';let completar;v.esperar(new Promise(r=>completar=r));v.canal().recibir({payload:{v:1}});await drenar();assert.equal(v.raiz.querySelector('[data-reactiva-lista]').innerHTML,'Tarjetas vigentes');assert.equal(v.medidas().cargas,1);v.esperar(null);completar({registros:[],total:0});await flush();await drenar();
 v.raiz.querySelector('[data-reactiva-lista]').innerHTML='Solo permisos anteriores';v.c.state.currentUser={...v.c.state.currentUser,permissions:{modules:['areas'],actions:[]}};const permiso=v.c.reactivaCargar(v.raiz,{remota:true});assert.equal(v.raiz.querySelector('[data-reactiva-lista]').innerHTML,'');await permiso;assert.equal(v.medidas().cargas,2);v.sync.detener();await drenar();
 console.log('PASS 38L.14 tarjetas permanecen durante refresco remoto; cambio de permisos descarta presentación previa');

}

async function probarRealtimeReactiva(){
 const a=cliente('reactiva'),b=cliente('reactiva');await drenar();b.ficha.registro={...b.ficha.registro,estado:'en_proceso',revision:7};let lecturas=0,renders=0;let revision=8;
 b.c.window.MantencionesReactivasService.obtener=async()=>{lecturas++;return {...b.ficha.registro,revision};};b.c.reactivaMostrarFicha=()=>renders++;b.c.reactivaBloquearGestion=()=>{};
 const inicial=b.conteos();await a.sync.emitirReactivaConfirmada();await drenar();assert.equal(b.conteos().listados,inicial.listados+1);assert.equal(b.conteos().avisos,inicial.avisos);assert.equal(renders,1);assert.equal(b.envios.length,0);assert.deepEqual(JSON.parse(JSON.stringify(a.envios[0])),{type:'broadcast',event:'reactiva-invalidate',payload:{v:1}});
 b.ficha.borradorEstado={estadoOrigen:'en_proceso',detalle:'No perder este borrador'};revision=9;await a.sync.emitirReactivaConfirmada();await drenar();assert.equal(renders,1);assert.equal(b.ficha.borradorEstado.detalle,'No perder este borrador');assert.equal(b.ficha.requiereActualizar,true);
 b.c.currentView='solicitudes';const fuera=b.conteos().listados,antesLecturas=lecturas;await a.sync.emitirReactivaConfirmada();await drenar();assert.equal(b.conteos().listados,fuera);assert.equal(lecturas,antesLecturas);b.c.currentView='areas';
 let resolver,cargas=0;b.c.reactivaCargar=async()=>{cargas++;if(cargas===1)await new Promise(r=>resolver=r);return true;};await a.sync.emitirReactivaConfirmada();await drenar();await a.sync.emitirReactivaConfirmada();await drenar();assert.equal(cargas,1);resolver();await flush();await drenar();assert.equal(cargas,2);
 const actual=b.canal();actual.recibir({event:'reactiva-invalidate',payload:{v:1,motivo:'NO_ADMITIDO'}});await drenar();assert.equal(cargas,2);
 const protegida=cargas;b.ficha.escrituraEnCurso=true;await a.sync.emitirReactivaConfirmada();await drenar();assert.equal(cargas,protegida);b.ficha.escrituraEnCurso=false;b.mutar();await drenar();assert.equal(cargas,protegida+1);
 b.c.state.currentUser.role='TECNICO';b.c.esAdminOperativoActual=()=>false;b.ficha.borradorEstado=null;b.ficha.requiereActualizar=false;const tecnico=cargas;await a.sync.emitirReactivaConfirmada();await drenar();assert.equal(cargas,tecnico+1);assert.equal(await b.sync.emitirReactivaConfirmada(),false);
 const generica=cargas;await a.sync.emitirConfirmada();await drenar();assert.equal(cargas,generica);
 b.c.state.currentUser.role='RECEPCION';b.sync.actualizarSesion();await a.sync.emitirReactivaConfirmada();await drenar();assert.equal(cargas,generica);
 a.sync.detener();b.sync.detener();await drenar();console.log('PASS 38P.3 Reactiva específica:2sesiones,solo vistas abiertas,borradores,señales en curso,roles y ausencia de bucles');
}

async function probarFichaSolicitudDecidida(){
 const a=cliente(),b=cliente();await drenar();let lecturas=0,toasts=0;b.c.pvToastExito=()=>toasts++;
 b.servicio.obtener=async()=>{lecturas++;return {...b.ficha.registro,estado:'aprobada'};};
 await a.sync.emitirConfirmada();await drenar();assert.equal(b.ficha.registro.estado,'aprobada');assert.equal(toasts,1);assert(!b.ficha.dialogo.querySelector('[data-solicitudes-detalle-contenido]').innerHTML.includes('solicitudesDecidir(true)'));
 await a.sync.emitirConfirmada();await drenar();assert.equal(toasts,1);assert.equal(lecturas,2);a.sync.detener();b.sync.detener();await drenar();console.log('PASS 38P.3B invalidación real simulada actualiza ficha y no duplica toast ni lectura por señal');
}

async function main(){
 await probarFichaSolicitudDecidida();
 await probarRealtimeReactiva();
 await probarCargaInicialReactiva();
 const a=cliente(),b=cliente('reactiva');await drenar();
 const base=b.conteos().listados;
 await a.sync.emitirConfirmada();await drenar();assert.equal(b.conteos().listados,base+1);
 assert.deepEqual(JSON.parse(JSON.stringify(a.envios[0])),{type:'broadcast',event:'invalidate',payload:{v:1}});
 console.log('PASS segunda sesión recibe señal genérica y reconsulta desde Supabase');
 b.datos.ausente=true;await a.sync.emitirConfirmada();await drenar();
 assert.equal(vm.runInContext('reactivaDetalle',b.c),null);
 assert.match(b.raiz.querySelector('[data-reactiva-estado]').textContent,/La ficha ya no está disponible/);
 console.log('PASS cierre únicamente después de confirmar ausencia por lectura');
 const otra=cliente();await drenar();await a.sync.emitirConfirmada();await drenar();
 assert(otra.c.fichaPrueba.dialogo.isConnected);assert.equal(vm.runInContext('solicitudesDetalle',otra.c),otra.c.fichaPrueba);
 otra.datos.errorLectura=true;await a.sync.emitirConfirmada();await drenar();assert(otra.c.fichaPrueba.dialogo.isConnected);
 console.log('PASS registro presente y fallo de red conservan la ficha');
 const antes=otra.conteos().listados;
 const canal=otra.canal();for(let i=0;i<10;i++)canal.recibir({payload:{v:1}});
 canal.recibir({payload:{v:1,solicitud_id:solicitudId}});await drenar();assert.equal(otra.conteos().listados,antes+1);
 const sinCambios=otra.conteos().listados;canal.recibir({payload:{v:2}});await drenar();assert.equal(otra.conteos().listados,sinCambios);
 console.log('PASS ráfagas agrupadas; mensajes malformados/no confiables no cierran fichas');
 otra.documento.visibilitychange();await drenar();assert.equal(otra.conteos().listados,sinCambios+1);
 otra.ventana.online();await drenar();assert.equal(otra.conteos().listados,sinCambios+2);
 otra.canal().estado('CHANNEL_ERROR');await drenar();assert(otra.canal()!==canal);assert(canal.quitado);
 console.log('PASS regreso, conexión y reconexión revalidan sin polling');
 const protegida=cliente();protegida.ficha.ocupada=true;protegida.ficha.escrituraEnCurso=true;protegida.datos.ausente=true;await drenar();
 assert(protegida.ficha.dialogo.isConnected);protegida.ficha.ocupada=false;protegida.ficha.escrituraEnCurso=false;protegida.mutar();await drenar();
 assert.equal(vm.runInContext('solicitudesDetalle',protegida.c),null);
 console.log('PASS operación protegida aplaza el cierre hasta terminar');
 const cambio=cliente();await drenar();const viejo=cambio.canal();cambio.c.state.currentUser.id='otra-cuenta';cambio.sync.actualizarSesion();await drenar();assert(viejo.quitado);
 const nuevo=cambio.canal();cambio.c.esAdminOperativoActual=()=>false;cambio.sync.actualizarSesion();await drenar();assert(nuevo.quitado);assert.equal(await cambio.sync.emitirConfirmada(),false);
 cambio.auth('SIGNED_OUT');console.log('PASS cambio de cuenta, pérdida de permisos y logout liberan el canal');
 const enviar=a.canal().send;a.canal().send=async()=>{throw Error('Broadcast no disponible');};
 assert.equal(await a.sync.emitirConfirmada(),false);a.canal().send=enviar;
 console.log('PASS error de transporte se informa sin lanzar error de eliminación');
 for(const x of [a,b,otra,protegida,cambio])x.sync.detener();await drenar();
 // Ejercitar el flujo real de confirmación: resultado incierto no llega al emisor.
 const fallo=crearEntorno();await fallo.c.solicitudesAbrirEliminacion('solicitudes',fallo.ficha);let senales=0;
 fallo.c.window.SolicitudesSincronizacion={emitirConfirmada:async()=>{senales++;return true;}};
 fallo.c.window.supabaseClient.rpc=async()=>{throw new Error('Respuesta incierta');};
 await fallo.c.solicitudesConfirmarEliminacion({preventDefault(){}});assert.equal(senales,0);
 assert(fallo.servicio.eliminacionesInciertas.has(solicitudId));
 console.log('PASS RPC incierta no emite éxito y mantiene su bloqueo');
 const lectura=crearEntorno();
 const consulta={select(){return this;},eq(){return this;},single:async()=>({data:null,error:null}),maybeSingle:async()=>({data:null,error:null})};
 lectura.c.window.supabaseClient.from=()=>consulta;
 vm.runInContext(fuente('js/services/solicitudes.service.js'),lectura.c);
 vm.runInContext(fuente('js/services/mantencionesReactivas.service.js'),lectura.c);
 for(const svc of [lectura.c.window.SolicitudesService,lectura.c.window.MantencionesReactivasService]){
  assert.equal(await svc.obtener(solicitudId,{permitirAusente:true}),null);
  await assert.rejects(svc.obtener(solicitudId),/disponible/);
  consulta.maybeSingle=async()=>({data:null,error:new Error('Error de lectura')});
  await assert.rejects(svc.obtener(solicitudId,{permitirAusente:true}),/lectura/);
  consulta.maybeSingle=async()=>({data:null,error:null});
 }
 console.log('PASS ausencia opcional explícita; errores y lectura estricta no se confunden con ausencia');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={cliente,drenar};
