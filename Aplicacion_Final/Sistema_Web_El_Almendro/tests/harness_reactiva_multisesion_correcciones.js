'use strict';
const assert=require('assert/strict'),vm=require('vm');
const {cliente,drenar}=require('./harness_reactiva_broadcast');
const {entorno,fuente,solicitudId,mantencionId,usuarioId}=require('./harness_reactiva_eliminacion');
async function probarCola(){
 const a=cliente(),b=cliente();b.c.state.currentUser.id='44444444-4444-4444-8444-444444444444';b.ficha.usuarioId=b.c.state.currentUser.id;b.sync.actualizarSesion();await drenar();
 const filas=new Map();const base=id=>({solicitud_id:id,estado_solicitud:'pendiente',visto_en:null,pospuesto_en:null,fecha_aviso:'2026-11-18T12:00:00Z',tipo_problema:'Prueba',ubicacion:'Local'});
 function instalar(e){
  const c=e.c,elementos=[];c.uiCargandoHTML=()=>'Cargando...';c.Date.parse=Date.parse;c.document.documentElement={classList:{contains:()=>false}};
  c.document.body.children=[];const crear=c.document.createElement;
  c.document.createElement=()=>{const n=crear();elementos.push(n);return n;};
  c.document.querySelectorAll=()=>[];c.requestAnimationFrame=fn=>c.setTimeout(fn,0);
  c.window.NotificacionesRevision={disponible:()=>false,actualizarSesion(){},detener(){}};
  c.window.UsuariosService={getMiEstadoAdministrativo:async()=>({es_admin_permanente:c.permanente,es_admin_temporal:!c.permanente&&c.vigente})};
  c.esAdminOperativoActual=()=>c.vigente;
  c.window.supabaseClient.rpc=async(nombre,args)=>{
   if(nombre==='listar_avisos_solicitudes')return {data:[...filas.values()].slice(args.p_offset,args.p_offset+args.p_limite)};
   if(nombre==='marcar_aviso_solicitud'){const f=filas.get(args.p_solicitud_id);f[args.p_accion==='ver'?'visto_en':'pospuesto_en']='fecha';return {error:null};}
   return {data:[{solicitud_id:solicitudId,estado_solicitud:args.p_aprobar?'aprobada':'rechazada',mantencion_reactiva_id:args.p_aprobar?mantencionId:null}]};
  };
  vm.runInContext(fuente('js/services/avisosSolicitudes.service.js'),c);
  const src=fuente('js/avisosSolicitudes.js');vm.runInContext(src.slice(0,src.indexOf('// SOL-07C:')),c);
  c.window.AvisosSolicitudes.actualizarSesion();
  return {cola:c.window.AvisosSolicitudes,modales:()=>elementos.filter(n=>n.id==='aviso-solicitud-modal'&&n.isConnected)};
 }
 filas.set(solicitudId,base(solicitudId));filas.set('antigua',{...base('antigua'),estado_solicitud:'aprobada'});
 const ua=instalar(a),ub=instalar(b);await Promise.all([ua.cola.sincronizar(),ub.cola.sincronizar()]);await drenar();assert.equal(ub.modales().length,1,ub.cola.contenidoLista());
 assert(ub.cola.contenidoLista().includes(solicitudId));assert(!ub.cola.contenidoLista().includes('antigua'));
 filas.get(solicitudId).estado_solicitud='rechazada';await a.servicio.decidir(solicitudId,false,'Rechazo simulado');await drenar();
 assert.equal(ub.modales().length,0);assert(!ub.cola.contenidoLista().includes(solicitudId));assert(!ua.cola.contenidoLista().includes(solicitudId));
 filas.set(solicitudId,base(solicitudId));await ub.cola.sincronizar();await drenar();
 filas.get(solicitudId).estado_solicitud='aprobada';await a.servicio.decidir(solicitudId,true,'');await drenar();assert(!ub.cola.contenidoLista().includes(solicitudId));
 filas.set('pospuesto',base('pospuesto'));await ub.cola.sincronizar();await drenar();assert.equal(ub.modales().length,1);
 await ub.cola.responder('posponer');await drenar();assert.equal(ub.modales().length,0);assert(ub.cola.contenidoLista().includes('Pospuesto'));
 await b.c.window.AvisosSolicitudesService.marcar('pospuesto','ver');await ub.cola.sincronizar();await drenar();assert(!ub.cola.contenidoLista().includes('pospuesto'));
 b.c.vigente=false;ub.cola.actualizarSesion();assert.equal(ub.modales().length,0);
 filas.set('anterior',{...base('anterior'),estado_solicitud:'rechazada'});filas.set('nueva',base('nueva'));
 b.c.permanente=false;b.c.vigente=true;ub.cola.actualizarSesion();await ub.cola.sincronizar();await drenar();assert(ub.cola.contenidoLista().includes('nueva'));assert(!ub.cola.contenidoLista().includes('anterior'));assert.equal(ub.modales().length,1);
 b.c.state.currentUser.id='55555555-5555-4555-8555-555555555555';ub.cola.actualizarSesion();await ub.cola.sincronizar();await drenar();b.c.vigente=false;ub.cola.actualizarSesion();assert.equal(ub.modales().length,0);
 for(const e of [a,b]){e.c.window.AvisosSolicitudes.detener();e.sync.detener();}await drenar();
 console.log('PASS cola real en dos contextos/actores: pendiente, aprobar/rechazar, cierre obsoleto, posponer/visto, temporal, cambio de actor y pérdida de permisos');
}
async function main(){
 const e=entorno();vm.runInContext(fuente('js/services/avisosSolicitudes.service.js'),e.c);const offsets=[];
 e.c.window.supabaseClient.rpc=async(_nombre,args)=>{offsets.push(args.p_offset);return {data:args.p_offset===0?Array.from({length:100},(_,i)=>({solicitud_id:'resuelta-'+i,estado_solicitud:'aprobada',visto_en:null,pospuesto_en:null})):[{solicitud_id:'vigente',estado_solicitud:'pendiente',visto_en:null,pospuesto_en:null},{solicitud_id:'vista',estado_solicitud:'pendiente',visto_en:'fecha',pospuesto_en:null},{solicitud_id:'sin-estado',visto_en:null,pospuesto_en:null}]};};
 const cola=await e.c.window.AvisosSolicitudesService.listar();assert.deepEqual(offsets,[0,100]);assert.equal(cola.length,1);assert.equal(cola[0].solicitud_id,'vigente');
 console.log('PASS paginación completa filtra resueltas/vistas/desconocidas sin perder pendientes de otra página');
 await probarCola();
 const a=cliente(),b=cliente('reactiva');await drenar();
 const datos={tipo_problema:'Prueba local',ubicacion:'Local',descripcion:'Registro simulado',urgencia:'media'};
 let escrituras=0;
 a.c.window.supabaseClient.rpc=async(nombre,args)=>{escrituras++;return {data:[nombre==='solicitud_reactiva_decidir'?{solicitud_id:solicitudId,estado_solicitud:args.p_aprobar?'aprobada':'rechazada',mantencion_reactiva_id:args.p_aprobar?mantencionId:null}:{solicitud_id:solicitudId,estado_solicitud:'aprobada',mantencion_reactiva_id:mantencionId}]};};
 let base=b.conteos().listados;
 await a.servicio.crearAprobada(usuarioId,datos);await drenar();assert.equal(b.conteos().listados,base+1);assert.equal(escrituras,1);
 console.log('PASS creación autoaprobada emite y B relee una vez, sin segunda escritura');
 base=b.conteos().listados;
 await a.servicio.decidir(solicitudId,true,'');await drenar();assert.equal(b.conteos().listados,base+1);assert.equal(escrituras,2);
 console.log('PASS aprobación confirmada notifica; no crea mediante otra ruta');
 const antesRechazo=a.envios.length, antesAvisos=b.conteos().avisos;await a.servicio.decidir(solicitudId,false,'Motivo de rechazo');await drenar();assert.equal(a.envios.length,antesRechazo+1);assert.equal(b.conteos().avisos,antesAvisos+1);const senales=a.envios.length;
 a.c.window.supabaseClient.rpc=async()=>({data:[{estado_solicitud:'aprobada'}]});
 await assert.rejects(a.servicio.crearAprobada(usuarioId,datos));await drenar();assert.equal(a.envios.length,senales);
 console.log('PASS rechazo invalida cola remota; resultado incompleto no emite señal');
 a.c.permanente=false;a.c.window.supabaseClient.rpc=async()=>({data:[{solicitud_id:solicitudId,estado_solicitud:'aprobada',mantencion_reactiva_id:mantencionId}]});
 await a.servicio.crearAprobada(usuarioId,datos);await drenar();assert.equal(a.envios.length,senales+1);
 console.log('PASS administración temporal conserva creación existente y puede emitir invalidación genérica');
 // El servicio avisa antes de cualquier refresco del llamador; fallar esa lectura no reenvía la creación.
 const anteriores=a.envios.length;await a.servicio.crearAprobada(usuarioId,datos);await assert.rejects(Promise.reject(new Error('Refresco local fallido')));await drenar();assert.equal(a.envios.length,anteriores+1);
 a.sync.detener();b.sync.detener();await drenar();
 console.log('PASS aviso independiente de un refresco local fallido');
 for(const entrada of ['ELIMINAR DEFINITIVAMENTE','eliminar definitivamente','Eliminar Definitivamente','  ELIMINAR DEFINITIVAMENTE','ELIMINAR DEFINITIVAMENTE  ','ELIMINAR   DEFINITIVAMENTE','\teliminar\n definitivamente  ']){
  const e=entorno();await e.servicio.eliminarDefinitiva(e.contexto,'Motivo de prueba válido',entrada,false);
  assert.equal(e.llamadas.length,1);assert.equal(e.llamadas[0].args.p_confirmacion,'ELIMINAR DEFINITIVAMENTE');
 }
 for(const entrada of ['ELIMINAR','ELIMINAR DEFINITIVAMENT','ELIMINAR DEFINITIVAMENTE AHORA','']){
  const e=entorno();await assert.rejects(e.servicio.eliminarDefinitiva(e.contexto,'Motivo de prueba válido',entrada,false));assert.equal(e.llamadas.length,0);
 }
 console.log('PASS siete variantes válidas envían literal canónico; cuatro frases inválidas no envían RPC');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
