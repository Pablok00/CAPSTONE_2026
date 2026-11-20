'use strict';
// Fase 3: mocks sin red; no carga configuración ni credenciales Supabase.
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict'), path = require('path');
const raiz = path.resolve(__dirname,'..');
const fuente = archivo => fs.readFileSync(path.join(raiz,process.env.SOLICITUDES_ESPEJO==='1'&&archivo.startsWith('js/')?'publicacion':'',archivo),'utf8');
const solicitudId = '11111111-1111-1111-1111-111111111111';
const mantencionId = '22222222-2222-2222-2222-222222222222';
const usuarioId = '33333333-3333-3333-3333-333333333333';
const literal = 'ELIMINAR DEFINITIVAMENTE';
const motivo = 'Motivo de prueba local';
function entorno(origen = 'solicitudes') {
  const llamadas = [];
  const c = vm.createContext({ window: {}, state: { currentUser: { id: usuarioId, role:'ADMINISTRADOR' } },
    permanente:true, vigente:true, hasAccess:()=>true, esAdminOperativoActual:()=>true,
    esAdminPermanenteActual:()=>c.permanente,
    revalidarPrivilegioParaEscritura:async()=>c.vigente,
    WeakMap, Set, Map, setTimeout, clearTimeout, console });
  c.window.supabaseClient = { auth: { getUser:async()=>({data:{user:{id:c.state.currentUser.id}}}) }, rpc:async(nombre,args)=>{
    llamadas.push({nombre,args});
    return c.respuesta || {data:[{solicitud_eliminada:solicitudId,mantencion_eliminada:origen === 'reactiva' ? mantencionId : null}],error:null};
  }};
  vm.runInContext(fuente('js/services/solicitudes.service.js'),c);
  const servicio = c.window.SolicitudesService;
  c.solicitud = {id:solicitudId,estado:origen === 'reactiva' ? 'aprobada' : 'pendiente',tipo_problema:'Prueba',ubicacion:'Local'};
  servicio.obtener = async()=>c.solicitud;
  servicio.vinculo = async()=>c.vinculo || null;
  c.registro = {id:mantencionId,solicitud_id:solicitudId,estado:'pendiente_asignacion',asignada_en:null,iniciada_en:null,resuelta_en:null,cerrada_en:null,detalle_ejecucion:null,responsable_trabajador_id:null,solicitud:c.solicitud};
  c.historial = {ciclos:[]};
  c.window.MantencionesReactivasService = { obtener:async()=>c.registro,historial:async()=>{if(c.errorHistorial)throw new Error('Error de ciclos');return c.historial;} };
  const contexto = {origen,usuarioId,solicitudId,mantencionId:origen === 'reactiva' ? mantencionId : null};
  return {c,servicio,contexto,llamadas,enviar:(trabajo=false)=>servicio.eliminarDefinitiva(contexto,'  '+motivo+'  ',literal,trabajo)};
}
let grupos = 0;
async function prueba(nombre,fn) { if(process.env.SOLICITUDES_PRUEBAS_FILTRO&&!nombre.includes(process.env.SOLICITUDES_PRUEBAS_FILTRO))return; await fn(); grupos++; console.log('PASS '+nombre); }
async function main() {
  await prueba('orígenes, UUID original, cinco parámetros y motivo trim exacto',async()=>{
    for(const origen of ['solicitudes','reactiva']) {
      const e=entorno(origen);await e.enviar();assert.equal(e.llamadas.length,1);
      assert.equal(e.llamadas[0].nombre,'solicitud_reactiva_eliminar_definitiva');
      assert.deepEqual(JSON.parse(JSON.stringify(e.llamadas[0].args)),{p_solicitud_id:solicitudId,p_motivo:motivo,p_origen:origen,p_confirmacion:literal,p_confirmar_trabajo_realizado:false});
    }
  });
  await prueba('temporales, Recepción y Técnico sin RPC; revocación y cambio de cuenta',async()=>{
    for(const role of ['ADMINISTRADOR','RECEPCION','TECNICO']) {const e=entorno();e.c.permanente=false;e.c.state.currentUser.role=role;await assert.rejects(e.enviar(),/permanente/);assert.equal(e.llamadas.length,0);}
    const e=entorno();e.c.revalidarPrivilegioParaEscritura=async()=>{e.c.permanente=false;return true;};await assert.rejects(e.enviar(),/permanente/);
    const f=entorno();f.c.revalidarPrivilegioParaEscritura=async()=>{f.c.state.currentUser.id=mantencionId;return true;};await assert.rejects(f.enviar(),/sesión cambió/);assert.equal(f.llamadas.length,0);
    const g=entorno();g.c.window.supabaseClient.auth.getUser=async()=>({data:{user:null},error:new Error('Sesión expirada')});await assert.rejects(g.enviar(),/expirada/);
  });
  await prueba('validaciones locales y vínculos incoherentes bloquean antes de RPC',async()=>{
    for(const cambio of [{solicitudId:'mal'},{origen:'otro'},{mantencionId:mantencionId}]) {const e=entorno();Object.assign(e.contexto,cambio);await assert.rejects(e.enviar());assert.equal(e.llamadas.length,0);}
    for(const texto of ['corto','x'.repeat(1001)]) {const e=entorno();await assert.rejects(e.servicio.eliminarDefinitiva(e.contexto,texto,literal,false),/motivo/);}
    const e=entorno();await assert.rejects(e.servicio.eliminarDefinitiva(e.contexto,motivo,literal+' AHORA',false),/ELIMINAR DEFINITIVAMENTE/);
    e.c.solicitud.estado='aprobada';await assert.rejects(e.enviar(),/Reactiva/);
    const f=entorno('reactiva');f.c.solicitud.estado='rechazada';await assert.rejects(f.enviar(),/Solicitudes/);
    const g=entorno();g.c.vinculo=mantencionId;await assert.rejects(g.enviar(),/vinculada/);
    const h=entorno('reactiva');h.c.registro.solicitud_id=usuarioId;await assert.rejects(h.enviar(),/corresponde/);
  });
  await prueba('trabajo por estados, fechas, detalle vacío, responsable y ciclos de reapertura',async()=>{
    const casos=[...['asignada','en_proceso','resuelta','cerrada'].map(estado=>({estado})),...['asignada_en','iniciada_en','resuelta_en','cerrada_en','detalle_ejecucion','responsable_trabajador_id'].map(k=>({[k]:''})),{ciclos:[{numero_ciclo:1}]}];
    for(const caso of casos) {
      const e=entorno('reactiva');Object.assign(e.c.registro,caso);if(caso.ciclos)e.c.historial.ciclos=caso.ciclos;
      await assert.rejects(e.enviar(),/reforzada/);assert.equal(e.llamadas.length,0);
      await e.enviar(true);assert.equal(e.llamadas[0].args.p_confirmar_trabajo_realizado,true);
    }
    const e=entorno('reactiva');await e.enviar(true);assert.equal(e.llamadas[0].args.p_confirmar_trabajo_realizado,false);
  });
  await prueba('historial desconocido y errores de lectura bloquean; relectura antes del envío',async()=>{
    const e=entorno('reactiva');e.c.errorHistorial=true;await assert.rejects(e.enviar(),/ciclos/);assert.equal(e.llamadas.length,0);
    const f=entorno('reactiva');delete f.c.registro.detalle_ejecucion;await assert.rejects(f.enviar(),/comprobar/);
    const g=entorno('reactiva');await g.servicio.prepararEliminacion(g.contexto);g.c.historial.ciclos=[{}];await assert.rejects(g.enviar(),/reforzada/);assert.equal(g.llamadas.length,0);
  });
  await prueba('retorno vacío, múltiple, sin IDs, IDs distintos y null incorrecto: inciertos sin reintento',async()=>{
    for(const data of [null,[],[{},{}],[{}],[{solicitud_eliminada:usuarioId,mantencion_eliminada:null}],[{solicitud_eliminada:solicitudId}],[{solicitud_eliminada:solicitudId,mantencion_eliminada:mantencionId}]]) {
      const e=entorno();e.c.respuesta={data,error:null};await assert.rejects(e.enviar(),err=>err.incierto===true);await assert.rejects(e.enviar(),/bloqueada/);assert.equal(e.llamadas.length,1);
    }
    const e=entorno('reactiva');e.c.respuesta={data:[{solicitud_eliminada:solicitudId,mantencion_eliminada:usuarioId}]};await assert.rejects(e.enviar(),/inconsistente/);
  });
  await prueba('error de autorización y pérdida de conexión nunca producen éxito',async()=>{
    for(const error of [new Error('Acceso denegado por RPC'),new Error('Failed to fetch')]) {
      const e=entorno();e.c.window.supabaseClient.rpc=async()=>{e.llamadas.push({});throw error;};await assert.rejects(e.enviar(),err=>err.incierto===true);assert.equal(e.llamadas.length,1);
    }
    const e=entorno();e.c.respuesta={data:null,error:{message:'Permiso permanente requerido'}};await assert.rejects(e.enviar(),/Permiso permanente/);
  });
  await prueba('concurrencia, vista cambiada y pérdida de permiso durante consultas',async()=>{
    const e=entorno();let resolver;const esperar=new Promise(r=>resolver=r);e.c.window.supabaseClient.rpc=async()=>{e.llamadas.push({});await esperar;return {data:[{solicitud_eliminada:solicitudId,mantencion_eliminada:null}]};};
    const primera=e.enviar();await assert.rejects(e.enviar(),/bloqueada/);resolver();await primera;assert.equal(e.llamadas.length,1);
    const f=entorno();f.contexto.vigente=()=>false;await assert.rejects(f.enviar(),/vista/);assert.equal(f.llamadas.length,0);
    const g=entorno();g.servicio.obtener=async()=>{g.c.permanente=false;return g.c.solicitud;};await assert.rejects(g.enviar(),/permanente/);
  });
  await prueba('visibilidad de ficha por rol, aprobadas sin eliminación y funciones existentes',async()=>{
    const e=entorno();vm.runInContext(fuente('js/views/solicitudes.js'),e.c);vm.runInContext(fuente('js/views/mantenciones.js'),e.c);vm.runInContext(fuente('js/views/reactiva.js'),e.c);
    const pintar=()=>{const nodo={innerHTML:''};e.c.solicitudesDetalleContenido({registro:e.c.solicitud,dialogo:{querySelector:()=>nodo}});return nodo.innerHTML;};
    e.c.solicitud.creador_nombre_snapshot='  Nombre <histórico>  ';
    e.c.solicitud.created_at='2026-10-28T12:00:00Z';
    assert.equal(e.c.solicitudesNombre(e.c.solicitud),'Nombre <histórico>');
    assert.equal(e.c.reactivaSolicitante(e.c.registro),'Nombre <histórico>');
    assert.match(pintar(),/Nombre &lt;histórico&gt;/);
    const h=e.c.reactivaHistorialHTML(e.c.registro,{eventos:[{id:'evento',actor_id:usuarioId,actor_nombre_snapshot:'Autor <histórico>',evento:'aprobada',created_at:'2026-10-28T13:00:00Z'}],ciclos:[]});
    assert.match(h,/Nombre &lt;histórico&gt;/);assert.match(h,/Autor &lt;histórico&gt;/);assert.doesNotMatch(h,/cuenta eliminada/);
    e.c.solicitud.creador_nombre_snapshot=null;
    assert.equal(e.c.solicitudesNombre(e.c.solicitud),'Usuario no disponible');
    assert.equal(e.c.reactivaSolicitante(e.c.registro),'Usuario no disponible');
    assert.match(pintar(),/Eliminar solicitud/);e.c.solicitud.estado='rechazada';assert.match(pintar(),/Eliminar solicitud/);
    e.c.solicitud.estado='aprobada';assert.doesNotMatch(pintar(),/onclick="solicitudesEliminarActual/);assert.match(pintar(),/Por seguridad/);
    for(const permanente of [true,false]) {e.c.permanente=permanente;assert.equal(e.c.reactivaFichaHTML(e.c.registro).includes('Eliminar solicitud y mantención'),permanente);}
    for(const nombre of ['solicitudesGuardar','solicitudesDecidir','solicitudesGuardarAdministrativa','solicitudesVerMantencion','reactivaCargar','reactivaBuscar','reactivaPagina','reactivaAbrirFicha','reactivaCerrarFicha','reactivaGuardarAsignacion','reactivaGuardarEstado','reactivaReabrir','reactivaCargarHistorial'])assert.equal(typeof e.c[nombre],'function',nombre);
    assert.doesNotMatch(fuente('js/services/solicitudes.service.js')+fuente('js/services/mantencionesReactivas.service.js'),/usuarios!|busqueda_solicitante/);
    const reactivaFuente=fuente('js/services/mantencionesReactivas.service.js');
    assert.match(reactivaFuente,/solicitud:solicitudes_reactivas!solicitud_id/);
    assert.match(reactivaFuente,/responsable:trabajadores!responsable_trabajador_id\(id,nombre,cargo\)/);
    assert.match(reactivaFuente,/actor_id, evento, motivo, detalle, created_at, actor_nombre_snapshot/);
    assert.equal((fuente('js/services/solicitudes.service.js').match(/rpc\('solicitud_reactiva_eliminar_definitiva'/g)||[]).length,1);
    assert.doesNotMatch(fuente('js/views/solicitudes.js')+fuente('js/views/reactiva.js'),/\.delete\(/);
  });
  await prueba('regresión con mocks: crear, aprobar, rechazar, autoaprobar, asignar, estados y reabrir',async()=>{
    const e=entorno(),datos={tipo_problema:'Problema local',ubicacion:'Local',descripcion:'Descripción local',urgencia:'media'};
    e.c.state.currentUser.role='RECEPCION';let insercion;
    e.c.window.supabaseClient.from=tabla=>({insert:async payload=>{insercion={tabla,payload};return {error:null};}});
    await e.servicio.crear(datos);assert.equal(insercion.tabla,'solicitudes_reactivas');
    e.c.state.currentUser.role='ADMINISTRADOR';const llamadas=[];
    e.c.window.supabaseClient.rpc=async(nombre,args)=>{
      llamadas.push({nombre,args});
      if(nombre==='solicitud_reactiva_decidir')return {data:[{solicitud_id:solicitudId,estado_solicitud:args.p_aprobar?'aprobada':'rechazada',mantencion_reactiva_id:args.p_aprobar?mantencionId:null}]};
      if(nombre==='solicitud_reactiva_crear_aprobada')return {data:[{solicitud_id:solicitudId,estado_solicitud:'aprobada',mantencion_reactiva_id:mantencionId}]};
      return {error:null};
    };
    await e.servicio.decidir(solicitudId,true,'');await e.servicio.decidir(solicitudId,false,'Motivo rechazo');await e.servicio.crearAprobada(usuarioId,datos);
    vm.runInContext(fuente('js/services/mantencionesReactivas.service.js'),e.c);
    const r=e.c.registro;r.revision=1;
    await e.c.window.MantencionesReactivasService.asignar(r,usuarioId,'Asignación');
    await e.c.window.MantencionesReactivasService.cambiarEstado(r,'en_proceso','','');
    r.estado='en_proceso';
    await e.c.window.MantencionesReactivasService.cambiarEstado(r,'resuelta','Trabajo realizado localmente','');
    r.estado='resuelta';
    await e.c.window.MantencionesReactivasService.cambiarEstado(r,'cerrada','Trabajo realizado localmente','Revisado correctamente');
    r.estado='cerrada';await e.c.window.MantencionesReactivasService.reabrir(r,'Motivo de reapertura local');
    assert.deepEqual(llamadas.map(l=>l.nombre),['solicitud_reactiva_decidir','solicitud_reactiva_decidir','solicitud_reactiva_crear_aprobada','mantencion_reactiva_asignar','mantencion_reactiva_cambiar_estado','mantencion_reactiva_cambiar_estado','mantencion_reactiva_cambiar_estado','mantencion_reactiva_reabrir']);
  });
  await prueba('sincronizadores reales con mocks: resultado de refresco y limpieza ante fallo',async()=>{
    const e=entorno();e.c.esCuentaSinRol=()=>false;
    e.c.document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{},removeEventListener:()=>{},documentElement:{}};
    e.c.MutationObserver=class {observe(){}};
    e.c.window.addEventListener=()=>{};
    e.c.window.supabaseClient.auth.onAuthStateChange=()=>{};
    e.c.window.supabaseClient.removeChannel=async()=>{};
    e.c.window.supabaseClient.channel=()=>({on(){return this;},subscribe(){return this;}});
    e.c.window.AvisosSolicitudesService={autorizado:async()=>true,listar:async()=>[{solicitud_id:solicitudId,tipo_problema:'Aviso local',estado_solicitud:'pendiente',visto_en:null,pospuesto_en:'fecha'}]};
    e.c.window.NotificacionesRevisionService={listar:async()=>[]};
    vm.runInContext(fuente('js/avisosSolicitudes.js'),e.c);
    assert.equal(await e.c.window.AvisosSolicitudes.sincronizar(),true);
    assert.match(e.c.window.AvisosSolicitudes.contenidoLista(),/Aviso local/);
    e.c.window.AvisosSolicitudesService.listar=async()=>{throw new Error('Error de refresco');};
    assert.equal(await e.c.window.AvisosSolicitudes.sincronizar(),false);
    assert.doesNotMatch(e.c.window.AvisosSolicitudes.contenidoLista(),/Aviso local/);
    e.c.state.currentUser.role='RECEPCION';e.c.esAdminOperativoActual=()=>false;
    e.c.window.NotificacionesRevision.actualizarSesion();
    assert.equal(await e.c.window.NotificacionesRevision.sincronizar(),true);
    e.c.window.NotificacionesRevisionService.listar=async()=>{throw new Error('Error personal');};
    assert.equal(await e.c.window.NotificacionesRevision.sincronizar(),false);
    e.c.window.AvisosSolicitudes.detener();e.c.window.NotificacionesRevision.detener();
  });
  await prueba('38I consultas habituales conservan snapshots sin invocar Edge; etiquetas explícitas siguen verificadas',async()=>{
    const e=entorno(),c=e.c;vm.runInContext(fuente('js/services/usuarios.service.js'),c);
    vm.runInContext(fuente('js/services/solicitudes.service.js'),c);const servicio=c.window.SolicitudesService;
    let invocaciones=0,autoriza=true,cambiar=false;const consultas=[];
    c.esAdminOperativoActual=()=>autoriza;c.state.currentUser.role='RECEPCION';autoriza=false;
    const fila={id:solicitudId,creada_por:usuarioId,creador_nombre_snapshot:'Nombre histórico original',revisada_por:mantencionId,revisor_nombre_snapshot:'Administrador histórico',estado:'aprobada'};
    const eventos=[{id:solicitudId,actor_id:mantencionId,actor_nombre_snapshot:'Autor histórico',detalle:{}}];
    const ciclos=[{id:mantencionId,responsable_trabajador_id:solicitudId}];
    c.window.supabaseClient.functions={invoke:async()=>{invocaciones++;throw Error('No debe invocarse en operaciones habituales');}};
    c.window.supabaseClient.from=tabla=>{
      const filtros=[];consultas.push({tabla,filtros});
      const respuesta=singular=>{if(cambiar)c.state.currentUser.id='otra-sesion';const data=tabla==='solicitudes_reactivas'?(singular?{...fila}:[{...fila}]):tabla==='solicitudes_reactivas_eventos'?eventos:ciclos;return {data,count:1,error:null};};
      const q={select(){return this;},eq(k,v){filtros.push([k,v]);return this;},order(){return this;},range(){return Promise.resolve(respuesta(false));},or(){return this;},in(){return this;},single(){return Promise.resolve(respuesta(true));},maybeSingle(){return Promise.resolve(respuesta(true));},insert(datos){return Promise.resolve({error:null});}};return q;
    };
    await servicio.crear({tipo_problema:'Filtración',ubicacion:'Local',descripcion:'Descripción simulada',urgencia:'media'});
    const listar=()=>servicio.listar(0),obtener=()=>servicio.obtener(solicitudId);
    for(let i=0;i<2;i++){const r=await listar();assert.equal(r.registros[0].creador_nombre_snapshot,fila.creador_nombre_snapshot);assert(!r.registros[0].nombres_historicos);assert.equal((await obtener()).revisor_nombre_snapshot,fila.revisor_nombre_snapshot);}
    assert(consultas.filter(x=>x.tabla==='solicitudes_reactivas').slice(1).every(x=>x.filtros.some(([k,v])=>k==='creada_por'&&v===usuarioId)));
    autoriza=true;c.state.currentUser.role='ADMINISTRADOR';assert.equal((await listar()).total,1);assert.equal((await obtener()).id,solicitudId);
    vm.runInContext(fuente('js/services/mantencionesReactivas.service.js'),c);
    const registro={id:mantencionId,solicitud_id:solicitudId,responsable:{id:solicitudId,nombre:'Trabajador conservado'}};
    const h=await c.window.MantencionesReactivasService.historial(registro);assert.equal(h.eventos[0].actor_nombre_snapshot,'Autor histórico');assert.equal(h.trabajadores.get(solicitudId).nombre,'Trabajador conservado');assert.equal(invocaciones,0);
    cambiar=true;await assert.rejects(listar(),/sesión cambió/);c.state.currentUser.id=usuarioId;cambiar=false;
    autoriza=false;c.state.currentUser.role='TECNICO';await assert.rejects(listar(),/autorización/);
    autoriza=true;c.state.currentUser.role='ADMINISTRADOR';
    c.window.supabaseClient.functions.invoke=async(nombre,{body})=>{invocaciones++;assert.equal(nombre,'usuario-eliminacion-ejecutar');assert.equal(body.accion,'CONSULTAR_IDENTIDADES_HISTORICAS');return {data:{contrato:'usuario-identidades-historicas/v2',modulo:body.modulo,eliminacion_ejecutada:false,registros_autorizados:body.registros,identidades:[{registro_id:solicitudId,origen_id:solicitudId,referencia_id:usuarioId,tipo:'cuenta',cuenta_eliminada:true,nombre_snapshot: fila.creador_nombre_snapshot}]}};};
    const historica=await servicio.obtener(solicitudId,{historicos:true});assert.equal(c.window.UsuariosService.nombreParaMostrar(historica,'creador_nombre_snapshot'),'Nombre histórico original (cuenta eliminada)');assert.equal(historica.creador_nombre_snapshot,fila.creador_nombre_snapshot);assert.equal(invocaciones,1);
    c.window.supabaseClient.functions.invoke=async()=>({error:true});await assert.rejects(servicio.obtener(solicitudId,{historicos:true}),/etiquetas históricas/);
    assert.equal((await obtener()).creador_nombre_snapshot,fila.creador_nombre_snapshot);
  });
  await prueba('38K aprobar abre Reactiva por UUID sin segunda mantención; rechazo cancela y filtra',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');
    function preparar(){
      const f=crearEntorno(),c=f.c,creados=[],navegaciones=[],aperturas=[];f.ficha.id=solicitudId;c.formatearFechaCL=v=>String(v||'');
      const crear=c.document.createElement;
      c.document.createElement=()=>{const n=crear();n.dataset={};n.showModal=()=>{n.open=true;};n.close=()=>{n.open=false;};n.addEventListener=()=>{};const q=n.querySelector;n.querySelector=selector=>{const el=q(selector);el.reportValidity=()=>true;return el;};creados.push(n);return n;};
      const raiz=f.raiz;const q=raiz.querySelector;raiz.querySelector=selector=>{const el=q(selector);el.closest=()=>raiz;return el;};
      const destino={querySelector:()=>({})};c.document.getElementById=key=>key==='solicitudes-vista'?raiz:key==='solicitudes-detalle-modal'?f.ficha.dialogo:key==='reactiva-vista'?destino:null;
      c.contexto38={pagina:0,estado:'pendiente',revision:0};vm.runInContext('solicitudesContextos.set(fichaPrueba.raiz,contexto38)',c);
      const view=fuente('js/views/solicitudes.js');vm.runInContext(view.slice(view.indexOf('function solicitudesCerrarDetalle()'),view.indexOf('function solicitudesDetalleTeclado')),c);
      c.revalidarEstadoAdministrativo=async()=>{};c.navigateTo=(v,area)=>{navegaciones.push([v,area]);c.currentView=v;c.activeAreaFilter=area;};c.reactivaAbrirFicha=async(_b,_i,id,sid)=>aperturas.push([id,sid]);
      c.solicitudesCargar=async()=>{f.recargas=(f.recargas||0)+1;};
      c.respuesta={data:[{solicitud_id:solicitudId,estado_solicitud:'aprobada',mantencion_reactiva_id:mantencionId}]};
      return {f,c,creados,navegaciones,aperturas};
    }
    const a=preparar();await a.c.solicitudesDecidir(true);assert.deepEqual(a.aperturas,[[mantencionId,solicitudId]]);assert.equal(a.f.llamadas.length,1);assert.equal(vm.runInContext('solicitudesDetalle',a.c),null);
    const b=preparar();b.c.solicitudesAbrirRechazo({focus(){}});assert.equal(b.f.ficha.dialogo.inert,true);b.c.solicitudesCancelarRechazo();assert.equal(b.f.llamadas.length,0);assert.equal(vm.runInContext('solicitudesDetalle',b.c),b.f.ficha);assert.equal(b.f.ficha.dialogo.inert,false);
    b.c.solicitudesAbrirRechazo({focus(){}});b.f.ficha.rechazo.dialogo.querySelector('[data-solicitudes-motivo]').value='Motivo real simulado';
    b.c.respuesta={data:[{solicitud_id:solicitudId,estado_solicitud:'rechazada',mantencion_reactiva_id:null}]};await b.c.solicitudesDecidir(false);
    assert.equal(b.f.llamadas.length,1);assert.equal(b.c.contexto38.estado,'rechazada');assert.equal(b.aperturas.length,0);assert.equal(vm.runInContext('solicitudesDetalle',b.c),null);
    for(const resultado of [{error:Error('Red incierta')},{data:[]}]){const e=preparar();e.c.respuesta=resultado;await e.c.solicitudesDecidir(true);assert.equal(e.aperturas.length,0);assert.equal(e.navegaciones.length,0);assert.equal(vm.runInContext('solicitudesDetalle',e.c),e.f.ficha);}
    const lenta=preparar();let resolver,envios=0;lenta.c.window.supabaseClient.rpc=()=>{envios++;return new Promise(r=>{resolver=r;});};
    const pendiente=lenta.c.solicitudesDecidir(true);await new Promise(setImmediate);await lenta.c.solicitudesDecidir(true);assert.equal(envios,1);
    lenta.c.state.currentUser.id='otra-sesion';resolver({data:[{solicitud_id:solicitudId,estado_solicitud:'aprobada',mantencion_reactiva_id:mantencionId}]});await pendiente;assert.equal(lenta.navegaciones.length,0);
    const lecturaFallida=preparar();lecturaFallida.c.reactivaAbrirFicha=async()=>{throw Error('Sin conexión');};await lecturaFallida.c.solicitudesDecidir(true);assert.equal(lecturaFallida.navegaciones.length,1);
    const denegada=preparar();denegada.c.esAdminOperativoActual=()=>false;denegada.c.solicitudesAbrirRechazo({});await denegada.c.solicitudesDecidir(true);assert.equal(denegada.f.llamadas.length,0);
    const contenido=fuente('js/views/solicitudes.js').split('function solicitudesDetalleContenido')[1].split('function solicitudesCancelarRechazo')[0];assert(!contenido.includes('Eliminar solicitud'));assert(!contenido.includes('textarea'));assert(contenido.includes('solicitudesAbrirRechazo'));
  });
  await prueba('38K actor personal solo con resultado, fecha y snapshot coincidentes',async()=>{
    const e=entorno();vm.runInContext(fuente('js/services/avisosSolicitudes.service.js'),e.c);
    const fecha='2026-11-18T12:00:00Z',notificacion={id:mantencionId,solicitud_id:solicitudId,destinatario_id:usuarioId,resultado:'aprobada',revisada_en:fecha,leida_en:null};
    const solicitud={id:solicitudId,estado:'aprobada',revisada_en:fecha,revisada_por:usuarioId,revisor_nombre_snapshot:'Andrés acreditado'};
    e.servicio.resumenesPropios=async()=>new Map([[solicitudId,solicitud]]);
    e.c.window.supabaseClient.from=()=>({select(){return this;},eq(){return this;},order(){return this;},range:async()=>({data:[notificacion],count:1})});
    assert.equal((await e.c.window.NotificacionesRevisionService.listar())[0].revisor_nombre_acreditado,'Andrés acreditado');
    for(const cambio of [{estado:'rechazada'},{revisada_en:'2026-11-17T12:00:00Z'},{revisada_por:null},{revisor_nombre_snapshot:null}]){const original={...solicitud};Object.assign(solicitud,cambio);assert.equal((await e.c.window.NotificacionesRevisionService.listar())[0].revisor_nombre_acreditado,null);Object.assign(solicitud,original);}
  });
  await prueba('38K toast verde/rojo,2 segundos, sin foco ni marcado de lectura',async()=>{
    for(const resultado of ['aprobada','rechazada'])for(const actor of [null,'Andrés acreditado']){
      const e=entorno(),c=e.c,nodos=new Map(),temporizadores=[],attrs={};let focos=0;
      c.document={visibilityState:'visible',activeElement:null,getElementById:id=>nodos.get(id),createElement:()=>({dataset:{},style:{},setAttribute(k,v){attrs[k]=v;},contains:()=>false,remove(){nodos.delete(this.id);},querySelector(){return {};},focus(){focos++;}}),body:{appendChild(n){nodos.set(n.id,n);}}};
      Object.assign(c,{generacion:1,usuario:usuarioId,avisoModal:null,focoAviso:null,rechazoPendiente:null,toastTimer:null,accion:false,mostradas:new Set(),esc:v=>String(v??''),actualizarRechazosMostrados(){},rechazoYaMostrado:()=>false,puedeMostrarRechazo:()=>true,posponerRechazo(){},dejarDeEsperar(){},registrarRechazoMostrado(){},vigente:()=>true,requestAnimationFrame:fn=>fn(),clearTimeout(){},setTimeout(fn,ms){temporizadores.push({fn,ms});},actuar(){throw Error('No hay acción automática');}});
      const fuenteAvisos=fuente('js/avisosSolicitudes.js');const cierre=fuenteAvisos.indexOf('  function cerrarAviso(');vm.runInContext(fuenteAvisos.slice(cierre,fuenteAvisos.indexOf('  function tecladoRechazo',cierre)),c);
      const inicio=fuenteAvisos.indexOf('  function programarCierreAviso(');vm.runInContext(fuenteAvisos.slice(inicio,fuenteAvisos.indexOf('  function detener(limpiar',inicio)),c);
      const f={id:mantencionId,resultado,leida_en:null,revisor_nombre_acreditado:actor,solicitud:{tipo_problema:'Filtración de agua'}};c.avisar([f]);const nodo=nodos.get('revision-solicitud-aviso');
      assert(nodo.innerHTML.includes('Filtración de agua'));assert(nodo.innerHTML.includes(actor||'Administración'));assert.equal(nodo.className.includes('toast-rechazo'),resultado==='rechazada');assert.equal(attrs.role,'status');assert.equal(focos,0);assert.equal(temporizadores.at(-1).ms,2000);temporizadores.at(-1).fn();assert.equal(nodos.size,0);assert.equal(f.leida_en,null);
    }
  });
  await prueba('38L ficha compacta por estado/rol, datos únicos y eliminación única conservada',async()=>{
    const e=entorno('reactiva');e.c.formatearFechaCL=v=>String(v||'Sin fecha');vm.runInContext(fuente('js/views/reactiva.js'),e.c);
    const original={...e.c.registro,revision:7,created_at:'2026-11-18T12:00:00Z',ciclo_actual:2,solicitud:{...e.c.solicitud,tipo_problema:'Filtración puntual',ubicacion:'Sala única',descripcion:'Descripción única',urgencia:'alta',creador_nombre_snapshot:'Solicitante original'}};
    for(const estado of ['pendiente_asignacion','asignada','en_proceso','resuelta','cerrada'])for(const admin of [true,false]){
      e.c.esAdminOperativoActual=()=>admin;e.c.permanente=admin;const r={...original,estado,...(estado==='pendiente_asignacion'?{}:{responsable_trabajador_id:usuarioId,responsable:{id:usuarioId,nombre:'Responsable real'}}),...(estado==='resuelta'||estado==='cerrada'?{resuelta_en:'fecha',detalle_ejecucion:'Trabajo conservado'}:{}),...(estado==='cerrada'?{cerrada_en:'fecha',observaciones_cierre:'Cierre conservado'}:{})};
      const previo=JSON.stringify(r),html=e.c.reactivaFichaHTML(r,'historial');assert.equal(JSON.stringify(r),previo);
      for(const dato of ['Filtración puntual','Sala única','Descripción única','Solicitante original'])assert.equal(html.split(dato).length-1,1);
      assert(html.includes('id="reactiva-tab-historial"'));assert(html.includes('id="reactiva-panel-historial"'));assert(!html.includes('Identificadores técnicos'));assert(!html.includes('Detalle y observaciones registradas'));assert(!html.includes('overflow-y:auto'));
      assert.equal((html.match(/reactivaEliminarActual()/g)||[]).length,admin?1:0);
      if(estado==='cerrada')assert.equal(html.includes('Reabrir mantención'),admin);
      if(!admin)assert(!html.includes('onclick="reactivaGuardarEstado()"'));
      if(estado==='resuelta'||estado==='cerrada')assert(html.includes('Trabajo conservado'));if(estado==='cerrada')assert(html.includes('Cierre conservado'));
      if(estado==='pendiente_asignacion')assert(!html.includes('onclick="reactivaContinuarSinAsignar()"'));
    }
    const historial=e.c.reactivaHistorialHTML({...original,estado:'cerrada'}, {eventos:[{id:usuarioId,evento:'reabierta',created_at:'2026-11-18T14:00:00Z',actor_nombre_snapshot:'Actor original',detalle:{ciclo_anterior:1,ciclo_nuevo:2,revision_anterior:7},motivo:'Reapertura conservada'}],ciclos:[{numero_ciclo:1,cerrada_en:'2026-11-18',detalle_ejecucion:'Ciclo histórico conservado'}],trabajadores:new Map()});
    for(const dato of ['Actor original','Reapertura conservada','Ciclo histórico conservado','Actualizar historial','Referencias del evento'])assert(historial.includes(dato));assert(historial.includes('reactiva-linea-tiempo'));assert(!historial.includes('alm-historial-scroll'));
    const css=fuente('css/ui-system.css').split('/* 375K.38L:')[1];assert(css.includes('overflow-y:auto'));assert(css.includes('[aria-selected="true"]'));assert(css.includes('.dark'));assert(css.includes('@media(max-width:480px)'));assert(css.includes(':focus-visible'));
  });
  await prueba('38L pestañas/teclado conservan formulario, pestaña activa y número de consultas',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');const f=crearEntorno('reactiva'),c=f.c;c.formatearFechaCL=v=>String(v||'');
    const nodos=new Map(),tabs=['gestion','solicitud','historial'].map(tipo=>({dataset:{reactivaTab:tipo},setAttribute(k,v){this[k]=v;},focus(){this.foco=true;}})),panels=tabs.map(t=>({dataset:{reactivaPanel:t.dataset.reactivaTab},style:{}}));
    f.ficha.dialogo.querySelector=q=>{if(q.includes('aria-selected'))return tabs.find(t=>t['aria-selected']==='true')||tabs[0];if(q.startsWith('[data-reactiva-tab="'))return tabs.find(t=>q.includes(t.dataset.reactivaTab));if(!nodos.has(q))nodos.set(q,{style:{},innerHTML:'',scrollTop:12,setAttribute(){}});return nodos.get(q);};
    f.ficha.dialogo.querySelectorAll=q=>q==='[data-reactiva-tab]'?tabs:q==='[data-reactiva-panel]'?panels:[];
    c.reactivaCerrarOpciones=()=>{};f.ficha.registro={...c.registro,estado:'asignada',responsable_trabajador_id:usuarioId};f.ficha.pestanaActiva='solicitud';let lecturas=0;
    c.window.MantencionesReactivasService.historial=async()=>{lecturas++;return {eventos:[],ciclos:[],trabajadores:new Map()};};
    c.reactivaMostrarFicha(f.ficha,f.ficha.registro);await new Promise(setImmediate);assert.equal(lecturas,1);
    assert(nodos.get('[data-reactiva-ficha-contenido]').innerHTML.includes('id="reactiva-tab-solicitud"'));const formulario={valor:'Borrador sin cambios'};f.ficha.asignacion=formulario;
    c.reactivaCambiarPestana('historial');c.reactivaCambiarPestana('gestion');assert.equal(lecturas,1);assert.equal(f.ficha.asignacion,formulario);assert.equal(f.ficha.pestanaActiva,'gestion');
    c.reactivaTecladoPestanas({key:'End',currentTarget:tabs[0],preventDefault(){}});assert.equal(f.ficha.pestanaActiva,'historial');assert.equal(tabs[2].foco,true);
    f.ficha.ocupada=true;c.reactivaCambiarPestana('gestion');assert.equal(f.ficha.pestanaActiva,'historial');
    const v=fuente('js/views/reactiva.js');assert(v.includes("if (!reactivaDetalle || event.key !== 'Tab') return;"));assert(!v.slice(v.indexOf('function reactivaFichaTeclado'),v.indexOf('async function reactivaAbrirFicha')).includes("event.key === 'Escape'"));
  });
  await prueba('38L.2 cabecera sin descripción, motivo condicional y Sin asignar sin persistencia ficticia',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');const f=crearEntorno('reactiva'),c=f.c,d=f.ficha;c.formatearFechaCL=v=>String(v||'');
    d.registro={...d.registro,revision:7,responsable_trabajador_id:null,solicitud:{...d.registro.solicitud,descripcion:'Descripción larga conservada',observaciones:'Observaciones originales'}};
    const html=c.reactivaFichaHTML(d.registro);assert(!html.split('</header>')[0].includes('Descripción larga conservada'));assert(html.split('id="reactiva-panel-solicitud"')[1].includes('Descripción larga conservada'));assert.equal(html.split('Observaciones originales').length-1,1);assert(!html.includes('onclick="reactivaContinuarSinAsignar()"'));
    const campos=d.dialogo.querySelector;d.dialogo.querySelector=q=>{const n=campos(q);n.classList.remove=()=>{};n.removeAttribute=()=>{};return n;};
    c.window.TrabajadoresService={getTrabajadores:async()=>[{id:usuarioId,nombre:'Trabajador real',estado:'Activo'}]};
    await c.reactivaAbrirAsignacion();assert.equal(d.asignacion.elegido,null);assert.equal(d.dialogo.querySelector('[data-reactiva-confirmar]').disabled,true);assert.equal(d.dialogo.querySelector('[data-reactiva-motivo-grupo]').hidden,true);
    await c.reactivaGuardarAsignacion();assert.equal(f.llamadas.length,0);c.reactivaCancelarAsignacion();assert(d.asignacion);assert.notEqual(d.pasoGestion,'seguimiento');assert.equal(f.llamadas.length,0);d.asignacion=null;
    await c.reactivaAbrirAsignacion();d.asignacion.elegido=usuarioId;d.asignacion.sinConfirmar=false;c.reactivaTextoSeleccionado(d);assert.equal(d.dialogo.querySelector('[data-reactiva-motivo-grupo]').hidden,true);assert.equal(d.dialogo.querySelector('[data-reactiva-confirmar]').disabled,false);
    d.asignacion.sinConfirmar=true;c.reactivaActualizarMotivoAsignacion(d);assert.equal(d.dialogo.querySelector('[data-reactiva-confirmar]').disabled,true);d.asignacion.sinConfirmar=false;
    d.asignacion.base={...d.registro,responsable_trabajador_id:usuarioId};d.asignacion.elegido=null;c.reactivaTextoSeleccionado(d);assert.equal(d.dialogo.querySelector('[data-reactiva-motivo]').required,true);assert.equal(d.dialogo.querySelector('[data-reactiva-motivo]').hidden,false);
    c.esAdminOperativoActual=()=>false;await c.reactivaGuardarAsignacion();assert.equal(f.llamadas.length,0);
  });
  await prueba('38L.2 guardar, retiro, doble envío y errores conservan revisión/recuperación',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');
    function preparar(retirar=false){
      const f=crearEntorno('reactiva'),c=f.c,d=f.ficha,envios=[];let lecturas=0;
      const q=d.dialogo.querySelector;d.dialogo.querySelector=s=>{const n=q(s);n.classList.remove=()=>{};return n;};
      d.registro={...d.registro,revision:7,responsable_trabajador_id:retirar?usuarioId:null};d.trabajadoresDisponibles=true;
      d.asignacion={base:Object.freeze({...d.registro}),elegido:retirar?null:usuarioId,trabajadores:[{id:usuarioId,nombre:'Nombre real'}],sinConfirmar:false};
      d.dialogo.querySelector('[data-reactiva-motivo]').value=retirar?'Retiro justificado':'';
      vm.runInContext(fuente('js/services/mantencionesReactivas.service.js'),c);
      c.window.supabaseClient.rpc=async(n,args)=>{envios.push([n,args]);return {error:null};};
      const servidor={...d.registro,responsable_trabajador_id:retirar?null:usuarioId,revision:8};
      c.window.MantencionesReactivasService.obtener=async()=>{lecturas++;return servidor;};c.reactivaCargar=async()=>true;
      c.reactivaMostrarFicha=()=>c.reactivaMostrarPaso('seguimiento');
      return {f,c,d,envios,servidor,lecturas:()=>lecturas};
    }
    for(const retirar of [false,true]){const e=preparar(retirar);await e.c.reactivaGuardarAsignacion();assert.equal(e.envios.length,1);assert.equal(e.envios[0][1].p_revision_esperada,7);assert.equal(e.envios[0][1].p_trabajador_id,retirar?null:usuarioId);assert.equal(e.envios[0][1].p_motivo,retirar?'Retiro justificado':null);assert.equal(e.d.registro.revision,8);assert.equal(e.d.pasoGestion,retirar?'responsable':'seguimiento');assert.equal(e.d.requiereActualizar,false);assert.equal(e.lecturas(),1);}
    const lenta=preparar();let resolver,envios=0;lenta.c.window.supabaseClient.rpc=()=>{envios++;return new Promise(r=>{resolver=r;});};const pendiente=lenta.c.reactivaGuardarAsignacion();await new Promise(setImmediate);await lenta.c.reactivaGuardarAsignacion();assert.equal(envios,1);resolver({error:null});await pendiente;
    for(const mensaje of ['REVISION_CONFLICTO','Conexión perdida']){const e=preparar();e.c.window.supabaseClient.rpc=async()=>({error:Error(mensaje)});await e.c.reactivaGuardarAsignacion();assert.equal(e.d.requiereActualizar,true);assert.equal(e.d.registro.revision,7);assert(e.d.asignacion);await e.c.reactivaGuardarAsignacion();assert.equal(e.envios.length,0);await e.c.reactivaActualizarFicha();assert.equal(e.d.requiereActualizar,false);assert.equal(e.d.registro.revision,8);}
    const lecturaFallida=preparar();lecturaFallida.c.window.MantencionesReactivasService.obtener=async()=>{throw Error('Fallo lectura posterior');};await lecturaFallida.c.reactivaGuardarAsignacion();assert.equal(lecturaFallida.envios.length,1);assert.equal(lecturaFallida.d.resultadoEscritura,'confirmada');assert.equal(lecturaFallida.d.requiereActualizar,true);
  });
  await prueba('38L.4 metadatos 2x2 con iconos, urgencia y descripción solo en Solicitud',async()=>{
    const e=entorno('reactiva'),c=e.c;c.formatearFechaCL=v=>String(v||'');vm.runInContext(fuente('js/views/reactiva.js'),c);
    for(const estado of ['pendiente_asignacion','asignada','en_proceso','resuelta','cerrada']){
      const r={...c.registro,estado,created_at:'2026-11-18T12:00:00Z',updated_at:'2026-11-18T12:00:00Z',solicitud:{...c.solicitud,ubicacion:'Sala larga sin desbordamiento',urgencia:'alta',descripcion:'Descripción conservada única',creador_nombre_snapshot:'Solicitante original'}};
      const html=c.reactivaFichaHTML(r),cabecera=html.split('</header>')[0];assert.equal((cabecera.match(/class="reactiva-meta-item"/g)||[]).length,4);assert.equal((cabecera.match(/aria-hidden="true"/g)||[]).length,5);
      for(const etiqueta of ['Urgencia','Responsable','Fecha de registro','Solicitante'])assert(cabecera.includes(etiqueta));assert(cabecera.includes('reactiva-urgencia-alta'));assert(!cabecera.includes('Descripción conservada única'));assert.equal(html.split('Descripción conservada única').length-1,1);assert(!html.includes('Última actualización'));
      assert(html.includes('>Asignación</button>'));r.updated_at='2026-11-19T12:00:00Z';assert(!c.reactivaFichaHTML(r).includes('Última actualización'));assert(c.reactivaHistorialHTML(r,{eventos:[],ciclos:[]}).includes('Última actualización'));
      r.solicitud.urgencia='baja';assert(!c.reactivaFichaHTML(r).includes('class="reactiva-urgencia-alta"'));
    }
    const css=fuente('css/ui-system.css').split('/* 375K.38L.4:')[1];for(const regla of ['repeat(2,minmax(0,1fr))','[data-reactiva-refrescar][hidden]','display:none!important','.dark','@media(max-width:480px)'])assert(css.includes(regla));
  });
  await prueba('38L.4 ayudas de búsqueda contextuales y actualización solo con condición real',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');const f=crearEntorno('reactiva'),c=f.c,d=f.ficha;
    const q=d.dialogo.querySelector;d.dialogo.querySelector=s=>{const n=q(s);n.removeAttribute=()=>{};n.classList.remove=()=>{};return n;};
    d.registro={...d.registro,revision:7};let catalogos=0;c.window.TrabajadoresService={getTrabajadores:async()=>{catalogos++;return [{id:usuarioId,nombre:'Trabajador real',estado:'Activo'}];}};
    await c.reactivaAbrirAsignacion();assert.equal(d.dialogo.querySelector('[data-reactiva-trabajadores-estado]').textContent,'');assert.equal(d.dialogo.querySelector('[data-reactiva-refrescar]').hidden,true);
    c.reactivaMostrarOpciones();assert(d.dialogo.querySelector('[data-reactiva-trabajadores-estado]').textContent.includes('coincidencias'));c.reactivaCerrarOpciones();assert.equal(d.dialogo.querySelector('[data-reactiva-trabajadores-estado]').textContent,'');assert.equal(catalogos,1);
    d.requiereActualizar=true;c.reactivaBloquearGestion(d,false);assert.equal(d.dialogo.querySelector('[data-reactiva-refrescar]').hidden,false);assert.equal(d.dialogo.querySelector('[data-reactiva-confirmar]').disabled,true);
    await c.reactivaGuardarAsignacion();assert.equal(f.llamadas.length,0);d.requiereActualizar=false;c.reactivaBloquearGestion(d,false);assert.equal(d.dialogo.querySelector('[data-reactiva-refrescar]').hidden,true);assert.equal(catalogos,1);
  });
  await prueba('38L.7 selector por clic/teclado y motivo solo en transiciones reales',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');const f=crearEntorno('reactiva'),c=f.c,d=f.ficha;
    const q=d.dialogo.querySelector;d.dialogo.querySelector=s=>{const n=q(s);n.removeAttribute=()=>{};n.classList.remove=()=>{};n.attrs||={};n.setAttribute=(k,v)=>{n.attrs[k]=v;};return n;};
    d.registro={...d.registro,revision:7};let catalogos=0;c.window.TrabajadoresService={getTrabajadores:async()=>{catalogos++;return [{id:usuarioId,nombre:'Trabajador uno',estado:'Activo'},{id:mantencionId,nombre:'Trabajador dos',estado:'Activo'}];}};
    await c.reactivaAbrirAsignacion();const motivo=d.dialogo.querySelector('[data-reactiva-motivo]'),grupo=d.dialogo.querySelector('[data-reactiva-motivo-grupo]'),guardar=d.dialogo.querySelector('[data-reactiva-confirmar]');
    assert(grupo.hidden);assert(guardar.disabled);await c.reactivaGuardarAsignacion();assert.equal(f.llamadas.length,0);
    d.asignacion.elegido=usuarioId;d.asignacion.sinConfirmar=false;c.reactivaTextoSeleccionado(d);assert(grupo.hidden);assert.equal(guardar.disabled,false);assert.equal(motivo.value,'');
    d.asignacion.base={...d.registro,responsable_trabajador_id:usuarioId};c.reactivaActualizarMotivoAsignacion(d);assert(grupo.hidden);assert(guardar.disabled);
    for(const elegido of [mantencionId,null]){d.asignacion.elegido=elegido;for(const [texto,valido] of [['',false],['1234',false],['12345',true],['x'.repeat(1000),true],['x'.repeat(1001),false],['     ',false],['😀'.repeat(5),true]]){motivo.value=texto;c.reactivaActualizarMotivoAsignacion(d);assert.equal(grupo.hidden,false);assert.equal(motivo.required,true);assert.equal(guardar.disabled,!valido);if(!valido)await c.reactivaGuardarAsignacion();}assert.equal(f.llamadas.length,0);}
    const buscador=d.dialogo.querySelector('[data-reactiva-buscar]');buscador.focus=()=>{c.reactivaMostrarOpciones();};c.reactivaCerrarOpciones();
    c.reactivaAlternarOpciones();assert.equal(d.dialogo.querySelector('[data-reactiva-opciones]').hidden,false);assert.equal(d.dialogo.querySelector('[data-reactiva-desplegar]').attrs['aria-expanded'],'true');
    c.reactivaAlternarOpciones();assert.equal(d.dialogo.querySelector('[data-reactiva-opciones]').hidden,true);
    c.reactivaTecladoDesplegable({key:'ArrowDown',preventDefault(){}});assert.equal(d.asignacion.indiceActivo,0);
    c.reactivaTecladoOpciones({key:'Enter',preventDefault(){}});assert.equal(d.asignacion.elegido,d.asignacion.trabajadores[0].id);assert.equal(motivo.value,'😀'.repeat(5));
    let detenida=false;c.reactivaTecladoDesplegable({key:'Escape',preventDefault(){},stopPropagation(){detenida=true;}});assert(detenida);assert.equal(vm.runInContext('reactivaDetalle',c),d);assert.equal(catalogos,1);
    c.reactivaCancelarAsignacion();assert.notEqual(d.pasoGestion,'seguimiento');assert.equal(f.llamadas.length,0);
    const v=fuente('js/views/reactiva.js');assert(v.includes('minlength="5" maxlength="1000"'));assert(v.includes('aria-label="Abrir o cerrar opciones de responsables"'));assert(!v.includes('data-reactiva-motivo-limite'));
  });
  await prueba('38L.7 servicio respeta RPC, revisión y límites5/1000 sin guardado inexistente',async()=>{
    const e=entorno('reactiva');vm.runInContext(fuente('js/services/mantencionesReactivas.service.js'),e.c);const servicio=e.c.window.MantencionesReactivasService,envios=[];
    e.c.window.supabaseClient.rpc=async(n,args)=>{envios.push([n,args]);return {error:null};};const base={...e.c.registro,revision:7,responsable_trabajador_id:usuarioId};
    for(const motivo of ['', '1234','x'.repeat(1001),'     '])await assert.rejects(servicio.asignar(base,mantencionId,motivo),/5 y 1000/);assert.equal(envios.length,0);
    await assert.rejects(servicio.asignar({...base,responsable_trabajador_id:null},null,''),/5 y 1000/);assert.equal(envios.length,0);
    await servicio.asignar({...base,responsable_trabajador_id:null},mantencionId,'');await servicio.asignar(base,mantencionId,'12345');await servicio.asignar(base,null,'x'.repeat(1000));
    assert.equal(envios.length,3);assert(envios.every(([n,p])=>n==='mantencion_reactiva_asignar'&&p.p_revision_esperada===7));assert.equal(envios[0][1].p_motivo,null);assert.equal(envios[1][1].p_motivo,'12345');assert.equal(envios[2][1].p_trabajador_id,null);
    e.c.esAdminOperativoActual=()=>false;await assert.rejects(servicio.asignar(base,mantencionId,'12345'),/autorización/);assert.equal(envios.length,3);
  });
  await prueba('38L.8D justificación real pendiente, catálogo alfabético, doble envío y errores',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');
    async function preparar(){
      const f=crearEntorno('reactiva'),c=f.c,d=f.ficha;const q=d.dialogo.querySelector;d.dialogo.querySelector=s=>{const n=q(s);n.removeAttribute=()=>{};n.classList.remove=()=>{};return n;};
      d.registro={...d.registro,revision:7};let catalogos=0,lecturas=0,envios=0;c.toastsAsignacion=[];c.pvToastExito=(mensaje,duracion)=>c.toastsAsignacion.push({mensaje,duracion});
      c.window.TrabajadoresService={getTrabajadores:async()=>{catalogos++;return [{id:usuarioId,nombre:'Zulma',estado:'Activo',cuenta_id:null},{id:mantencionId,nombre:'Ana',estado:'Activo',cuenta_id:usuarioId},{id:solicitudId,nombre:'A inactiva',estado:'Inactivo'}];}};
      vm.runInContext(fuente('js/services/mantencionesReactivas.service.js'),c);c.window.supabaseClient.rpc=async()=>{envios++;return {error:null};};
      c.window.MantencionesReactivasService.obtener=async()=>{lecturas++;return {...d.registro,revision:8,responsable_trabajador_id:null};};c.reactivaCargar=async()=>true;c.reactivaMostrarFicha=()=>c.reactivaMostrarPaso('seguimiento');
      await c.reactivaAbrirAsignacion();c.reactivaMostrarOpciones();c.reactivaElegirOpcion(d.asignacion.opciones.findIndex(o=>o.tipo==='sin_asignar'));return {f,c,d,catalogos:()=>catalogos,lecturas:()=>lecturas,envios:()=>envios};
    }
    const e=await preparar(),motivo=e.d.dialogo.querySelector('[data-reactiva-motivo]'),guardar=e.d.dialogo.querySelector('[data-reactiva-confirmar]');
    assert.deepEqual(Array.from(e.d.asignacion.trabajadores,t=>t.nombre),['Ana','Zulma']);assert.equal(e.catalogos(),1);assert.equal(e.d.dialogo.querySelector('[data-reactiva-motivo-etiqueta]').textContent,'Motivo de no asignación');assert(motivo.required);
    for(const invalido of ['', '1234', 'x'.repeat(1001)]){motivo.value=invalido;e.c.reactivaActualizarMotivoAsignacion(e.d);assert(guardar.disabled);await e.c.reactivaGuardarAsignacion();}assert.equal(e.envios(),0);
    motivo.value='Justificación registrada';e.c.reactivaActualizarMotivoAsignacion(e.d);assert.equal(guardar.disabled,false);
    let resolver,envios=0;e.c.window.supabaseClient.rpc=(n,p)=>{envios++;assert.equal(n,'mantencion_reactiva_asignar');assert.equal(p.p_trabajador_id,null);assert.equal(p.p_revision_esperada,7);assert.equal(p.p_motivo,'Justificación registrada');return new Promise(r=>{resolver=r;});};
    const pendiente=e.c.reactivaGuardarAsignacion();await new Promise(setImmediate);await e.c.reactivaGuardarAsignacion();assert.equal(envios,1);resolver({error:null});await pendiente;
    assert.equal(e.d.registro.responsable_trabajador_id,null);assert.equal(e.d.registro.estado,'pendiente_asignacion');assert.equal(e.d.registro.revision,8);assert.equal(e.lecturas(),1);assert.equal(e.catalogos(),1);assert(!e.d.dialogo.querySelector('[data-reactiva-gestion-mensaje]').textContent.includes('Motivo de no asignación registrado'));assert.equal(e.c.toastsAsignacion.length,1);assert.equal(e.c.toastsAsignacion[0].duracion,2000);
    for(const error of ['REVISION_CONFLICTO','Respuesta incierta']){const x=await preparar();x.d.dialogo.querySelector('[data-reactiva-motivo]').value='Justificación válida';let llamados=0;x.c.window.supabaseClient.rpc=async()=>{llamados++;return {error:Error(error)};};await x.c.reactivaGuardarAsignacion();assert.equal(x.d.requiereActualizar,true);assert.equal(x.d.registro.revision,7);assert(x.d.asignacion);await x.c.reactivaGuardarAsignacion();assert.equal(llamados,1);}
  });
  await prueba('38L.8D excepción solo pendiente y nuevo evento conserva motivo/autor/fecha',async()=>{
    const e=entorno('reactiva');vm.runInContext(fuente('js/services/mantencionesReactivas.service.js'),e.c);const svc=e.c.window.MantencionesReactivasService,base={...e.c.registro,revision:7};let llamadas=0;e.c.window.supabaseClient.rpc=async()=>{llamadas++;return {error:null};};
    await svc.asignar(base,null,'12345');assert.equal(llamadas,1);
    for(const estado of ['asignada','en_proceso','resuelta','cerrada'])await assert.rejects(svc.asignar({...base,estado},null,'12345'));assert.equal(llamadas,1);
    await assert.rejects(svc.asignar({...base,responsable_trabajador_id:usuarioId},usuarioId,'12345'));assert.equal(llamadas,1);
    e.c.formatearFechaCL=v=>String(v||'');vm.runInContext(fuente('js/views/reactiva.js'),e.c);
    const fecha='2026-11-18T14:00:00Z',historial={eventos:[{id:mantencionId,evento:'sin_asignar_justificada',created_at:fecha,actor_id:usuarioId,actor_nombre_snapshot:'Administrador original',motivo:'Motivo histórico conservado',detalle:{revision_anterior:7}}],ciclos:[],trabajadores:new Map()};
    const antes=JSON.stringify(historial.eventos),html=e.c.reactivaHistorialHTML(base,historial);for(const texto of ['Sin responsable: motivo registrado','Administrador original','Motivo histórico conservado',fecha])assert(html.includes(texto));assert.equal(JSON.stringify(historial.eventos),antes);assert(html.includes('Actualizar historial'));
  });
  await prueba('38L.9 selector inicial no es NULL confirmado y conserva asignación al cancelar',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');
    for(const responsable of [null,usuarioId]){
      const f=crearEntorno('reactiva'),c=f.c,d=f.ficha,q=d.dialogo.querySelector;d.dialogo.querySelector=s=>{const n=q(s);n.removeAttribute=()=>{};n.classList.remove=()=>{};return n;};
      d.registro={...d.registro,responsable_trabajador_id:responsable,revision:7};c.window.TrabajadoresService={getTrabajadores:async()=>[{id:usuarioId,nombre:'Nombre real',estado:'Activo'}]};
      await c.reactivaAbrirAsignacion();const input=d.dialogo.querySelector('[data-reactiva-buscar]');
      assert.equal(input.value,responsable?'Nombre real':'');assert.equal(d.asignacion.sinConfirmar,!responsable);assert.equal(d.dialogo.querySelector('[data-reactiva-motivo-grupo]').hidden,true);assert(d.dialogo.querySelector('[data-reactiva-confirmar]').disabled);
      await c.reactivaGuardarAsignacion();assert.equal(f.llamadas.length,0);assert.equal(d.registro.responsable_trabajador_id,responsable);
      c.reactivaMostrarOpciones();c.reactivaElegirOpcion(d.asignacion.opciones.findIndex(o=>o.tipo==='sin_asignar'));assert.equal(input.value,'Sin asignar');assert.equal(d.asignacion.sinConfirmar,false);assert.equal(d.dialogo.querySelector('[data-reactiva-motivo-grupo]').hidden,false);assert(d.dialogo.querySelector('[data-reactiva-motivo]').required);
      c.reactivaCancelarAsignacion();assert.equal(d.registro.responsable_trabajador_id,responsable);assert.equal(f.llamadas.length,0);
    }
    const html=fuente('js/views/reactiva.js');assert(html.includes('placeholder="Despliega para elegir un responsable"'));assert(!html.includes('Trabajador responsable (opcional)'));
  });
  await prueba('38L.9 F5 restaura ruta con un solo montaje y sin reutilizar datos',async()=>{
    const app=fuente('js/app.js'),inicio=app.indexOf('function inicializarInterfazSesion() {'),fin=app.indexOf('// ==========================================================',inicio),codigo=app.slice(inicio,fin);
    for(const hash of ['#areas','#dashboard','','#invalida']){
      let renders=0,navegaciones=0;const nod={classList:{remove(){},add(){}},contains(){return false;}};
      const c=vm.createContext({interfazSesionInicializada:false,cuentaPendiente:false,currentView:'dashboard',state:{currentUser:{id:usuarioId}},esRecepcionRestringida:()=>false,syncCurrentUserUI(){},toggleMobileSidebar(){},syncMaintenanceAlertNotifications(){},iniciarRevalidacionEstadoAdministrativo(){},renderCurrentView(){renders++;},navigateTo(v,f,s,h){navegaciones++;assert.equal(h,true);if(v==='areas')assert.equal(f,'workarea_reactiva');renders++;},initThemeMode(){},restaurarNavegacionHistorial(){},document:{documentElement:nod,addEventListener(){},getElementById:()=>nod},window:{location:{hash},history:{state:{areaFicha:'workarea_reactiva'}},addEventListener(){}}});
      vm.runInContext(codigo,c);c.inicializarInterfazSesion();assert.equal(renders,1);assert.equal(navegaciones,['#areas','#dashboard'].includes(hash)?1:0);c.inicializarInterfazSesion();assert.equal(renders,1);
    }
  });
  await prueba('38L.9 carga, actualización manual, error recuperable y respuestas fuera de contexto',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');const f=crearEntorno('reactiva'),c=f.c,raiz=f.ficha.raiz;c.clearTimeout=()=>{};c.uiCargandoHTML=()=>'<cargando>';c.raizPrueba=raiz;
    vm.runInContext("reactivaContextos.set(raizPrueba,{pagina:0,grupo:'activas',busqueda:'',secuencia:0,usuarioId:state.currentUser.id,registros:[]})",c);
    let llamadas=0,fallar=false,resolver;c.window.MantencionesReactivasService={listar:async()=>{llamadas++;if(fallar)throw Error('Red no disponible');return {registros:[],total:0};}};
    await c.reactivaCargar(raiz);assert.equal(llamadas,1);const boton={closest:()=>raiz};c.reactivaActualizar(boton);await new Promise(setImmediate);assert.equal(llamadas,2);
    fallar=true;await c.reactivaCargar(raiz);assert(raiz.querySelector('[data-reactiva-estado]').textContent.includes('Red no disponible'));assert.equal(raiz.querySelector('[data-reactiva-actualizar]').disabled,false);
    fallar=false;c.reactivaActualizar(boton);await new Promise(setImmediate);assert.equal(llamadas,4);assert(!raiz.querySelector('[data-reactiva-estado]').textContent.includes('Red no disponible'));
    c.window.MantencionesReactivasService.listar=()=>new Promise(r=>resolver=r);const pendiente=c.reactivaCargar(raiz);raiz.isConnected=false;resolver({registros:[],total:99});await pendiente;assert.notEqual(raiz.querySelector('[data-reactiva-total]').textContent,'99 mantenciones');
    raiz.isConnected=true;const perdida=c.reactivaCargar(raiz);c.state.currentUser={...c.state.currentUser,esAdminTemporal:true};resolver({registros:[],total:99});await perdida;assert.notEqual(raiz.querySelector('[data-reactiva-total]').textContent,'99 mantenciones');
    const otra=c.reactivaCargar(raiz);c.state.currentUser={...c.state.currentUser,id:mantencionId};resolver({registros:[],total:99});await otra;assert.notEqual(raiz.querySelector('[data-reactiva-total]').textContent,'99 mantenciones');
  });
  await prueba('38L.11 contenido visible permanece tras Auth y suscripción con permisos idénticos',async()=>{
    const app=fuente('js/app.js'),codigo=app.slice(app.indexOf('window.SesionCambios = (function () {'));
    let auth,sub,lecturas=0,renders=0,reemplazos=0;const timers=new Map();let timer=0;
    const previo={id:usuarioId,role:'ADMINISTRADOR',esAdminPermanente:true,esAdminTemporal:false,adminTemporalHasta:null};
    const contenido={innerHTML:'Contenido Reactiva visible',classList:{remove(){},add(){}},replaceWith(){reemplazos++;}};
    const canal={on(){return this;},subscribe(fn){sub=fn;return this;}};
    const c=vm.createContext({state:{currentUser:previo},currentView:'areas',cuentaPendiente:false,interfazSesionInicializada:true,sesionNoVerificable:false,sesionEnReconexion:false,sidebarSesionVersion:0,delegacionesSesionPropias:[],
      setTimeout(fn){const id=++timer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},clearInterval(){},cancelarTimerExpiracionAdmin(){},programarTimerExpiracionAdmin(){},invalidarSidebarConteos(){},hasAccess:()=>true,construirPerfilUI:()=>({...previo}),syncCurrentUserUI(){},updateSidebarVisibility(){},renderCurrentView(){renders++;contenido.innerHTML='Cargando...';},
      document:{documentElement:contenido,body:{style:{}},getElementById:id=>id==='view-container'?contenido:null,querySelectorAll:()=>[]},
      window:{addEventListener(){},supabaseClient:{channel:()=>canal,removeChannel:async()=>{},auth:{onAuthStateChange(fn){auth=fn;}}},UsuariosService:{getSesionActual:async()=>{lecturas++;return {perfil:{estado:true},administrativo:{es_admin_permanente:true,es_admin_temporal:false},delegaciones:[]};}}}});
    vm.runInContext(codigo,c);c.window.SesionCambios.iniciar();await c.window.SesionCambios.revalidar();
    const vaciar=async()=>{for(const [id,fn]of [...timers]){timers.delete(id);await fn();}await new Promise(setImmediate);};
    for(const evento of ['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED']){auth(evento,{user:{id:usuarioId}});await vaciar();assert.equal(contenido.innerHTML,'Contenido Reactiva visible');}
    sub('SUBSCRIBED');await vaciar();assert(lecturas>=2);assert.equal(renders,0);assert.equal(reemplazos,0);assert.equal(contenido.innerHTML,'Contenido Reactiva visible');c.window.SesionCambios.detener();
  });
  await prueba('38M.1 evidencia persistida exige mantención, motivo y ciclo vigentes',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');const f=crearEntorno('reactiva'),c=f.c,d=f.ficha;
    d.registro={...d.registro,revision:8,ciclo_actual:1,created_at:'2026-11-19T10:00:00Z'};
    const evento={id:usuarioId,solicitud_id:solicitudId,mantencion_reactiva_id:mantencionId,evento:'sin_asignar_justificada',motivo:'Motivo persistido',created_at:'2026-11-19T11:00:00Z'};
    assert.equal(c.reactivaAsignacionAcreditada(d),false);
    d.evidenciaAsignacion=c.reactivaEvidenciaAsignacion(d,{eventos:[evento]});assert.equal(c.reactivaAsignacionAcreditada(d),true);
    for(const cambio of [{motivo:'1234'},{mantencion_reactiva_id:usuarioId},{solicitud_id:usuarioId},{created_at:null}]){d.evidenciaAsignacion=c.reactivaEvidenciaAsignacion(d,{eventos:[{...evento,...cambio}]});assert.equal(c.reactivaAsignacionAcreditada(d),false);}
    d.registro={...d.registro,ciclo_actual:2};const reapertura={...evento,id:solicitudId,evento:'reabierta',created_at:'2026-11-19T12:00:00Z',detalle:{ciclo_nuevo:2}};
    d.evidenciaAsignacion=c.reactivaEvidenciaAsignacion(d,{eventos:[evento,reapertura]});assert.equal(c.reactivaAsignacionAcreditada(d),false);
    d.evidenciaAsignacion=c.reactivaEvidenciaAsignacion(d,{eventos:[reapertura,{...evento,created_at:'2026-11-19T13:00:00Z'}]});assert.equal(c.reactivaAsignacionAcreditada(d),true);
    d.registro={...d.registro,revision:9};assert.equal(c.reactivaAsignacionAcreditada(d),false);
    d.registro={...d.registro,responsable_trabajador_id:usuarioId};assert.equal(c.reactivaAsignacionAcreditada(d),true);
    for(const estado of ['en_proceso','resuelta','cerrada']){d.registro={...d.registro,estado,responsable_trabajador_id:null};assert.equal(c.reactivaAsignacionAcreditada(d),true);}
  });
  await prueba('38M.1 no salta asignación y guardar habilita desde lectura existente sin consultas nuevas',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');
    for(const trabajador of [null,usuarioId]){
      const f=crearEntorno('reactiva'),c=f.c,d=f.ficha,q=d.dialogo.querySelector;d.dialogo.querySelector=s=>{const n=q(s);n.removeAttribute=()=>{};n.classList.remove=()=>{};return n;};c.formatearFechaCL=v=>String(v||'');
      d.registro={...d.registro,revision:7,ciclo_actual:1,created_at:'2026-11-19T10:00:00Z'};let lecturas=0,envios=0,historias=0;const eventos=[];
      c.window.TrabajadoresService={getTrabajadores:async()=>[{id:usuarioId,nombre:'Trabajador real',estado:'Activo'}]};
      vm.runInContext(fuente('js/services/mantencionesReactivas.service.js'),c);
      c.window.MantencionesReactivasService.obtener=async()=>{lecturas++;return {...d.registro,responsable_trabajador_id:trabajador,revision:8,responsable:trabajador?{id:trabajador,nombre:'Trabajador real'}:null};};
      c.window.MantencionesReactivasService.historial=async()=>{historias++;return {eventos,ciclos:[],trabajadores:new Map()};};c.reactivaCargar=async()=>true;
      c.window.supabaseClient.rpc=async(n)=>{assert.equal(n,'mantencion_reactiva_asignar');envios++;if(!trabajador)eventos.push({id:usuarioId,solicitud_id:solicitudId,mantencion_reactiva_id:mantencionId,evento:'sin_asignar_justificada',motivo:'No asignación justificada',created_at:'2026-11-19T11:00:00Z'});return {error:null};};
      await c.reactivaAbrirAsignacion();assert(!d.dialogo.querySelector('[data-reactiva-asignacion]').innerHTML.includes('>Cancelar</button>'));c.reactivaMostrarPaso('seguimiento');assert.equal(d.pasoGestion,'responsable');c.reactivaCancelarAsignacion();assert(d.asignacion);await c.reactivaGuardarEstado();assert.equal(envios,0);
      c.reactivaMostrarOpciones();c.reactivaElegirOpcion(d.asignacion.opciones.findIndex(o=>trabajador?o.tipo==='trabajador':o.tipo==='sin_asignar'));
      assert.equal(c.reactivaAsignacionAcreditada(d),false);if(!trabajador)d.dialogo.querySelector('[data-reactiva-motivo]').value='No asignación justificada';
      await c.reactivaGuardarAsignacion();await new Promise(setImmediate);assert.equal(envios,1);assert.equal(lecturas,1);assert.equal(historias,1);assert.equal(d.pasoGestion,'seguimiento');assert.equal(c.reactivaAsignacionAcreditada(d),true);assert(d.dialogo.querySelector('#reactiva-paso-seguimiento').innerHTML.includes('Iniciar mantención'));
      d.evidenciaAsignacion=null;await c.reactivaCargarHistorial(d);assert.equal(c.reactivaAsignacionAcreditada(d),true);assert.equal(envios,1);
      await c.reactivaAbrirAsignacion();assert(d.dialogo.querySelector('[data-reactiva-asignacion]').innerHTML.includes('>Cancelar</button>'));c.reactivaCancelarAsignacion();assert.equal(d.pasoGestion,'seguimiento');
    }
  });
  await prueba('38M.1 montaje y reapertura reconstruyen evidencia sin memoria del modal',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');
    for(const justificada of [false,true]){
      const f=crearEntorno('reactiva'),c=f.c,d=f.ficha,q=d.dialogo.querySelector;d.dialogo.querySelector=s=>{const n=q(s);n.removeAttribute=()=>{};n.classList.remove=()=>{};return n;};c.formatearFechaCL=v=>String(v||'');
      d.registro={...d.registro,revision:8,ciclo_actual:1,created_at:'2026-11-19T10:00:00Z'};let historias=0;
      c.window.TrabajadoresService={getTrabajadores:async()=>[]};c.window.MantencionesReactivasService.historial=async()=>{historias++;return {eventos:justificada?[{id:usuarioId,solicitud_id:solicitudId,mantencion_reactiva_id:mantencionId,evento:'sin_asignar_justificada',motivo:'Motivo guardado',created_at:'2026-11-19T11:00:00Z'}]:[],ciclos:[],trabajadores:new Map()};};
      c.reactivaMostrarFicha(d,d.registro);await new Promise(setImmediate);assert.equal(historias,1);assert.equal(c.reactivaAsignacionAcreditada(d),justificada);assert.equal(d.pasoGestion,justificada?'seguimiento':'responsable');assert.equal(!!d.asignacion,!justificada);
      if(justificada){c.window.MantencionesReactivasService.historial=async()=>{throw Error('Historial no disponible');};await c.reactivaCargarHistorial(d);assert.equal(c.reactivaAsignacionAcreditada(d),false);assert.equal(d.pasoGestion,'responsable');assert(d.dialogo.querySelector('[data-reactiva-asignacion-resumen]').textContent.includes('Actualiza'));}
      assert.equal(f.llamadas.length,0);
    }
  });
  await prueba('38M.5 Gestión sin fechas y resumen contextual sin alterar formularios',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');const f=crearEntorno('reactiva'),c=f.c,d=f.ficha;c.formatearFechaCL=v=>String(v||'');
    for(const estado of ['pendiente_asignacion','asignada','en_proceso','resuelta','cerrada']){
      d.registro={...d.registro,estado,revision:8,responsable_trabajador_id:usuarioId,responsable:{id:usuarioId,nombre:'Nombre real'},asignada_en:'2026-11-19T10:00:00Z',iniciada_en:'2026-11-19T11:00:00Z'};
      const html=c.reactivaFichaHTML(d.registro);assert(!html.includes('Fechas de seguimiento'));if(['resuelta','cerrada'].includes(estado))assert(html.includes('<h3 hidden><button'));
      d.dialogo.querySelector('#reactiva-paso-seguimiento').innerHTML='Formulario vigente';c.reactivaActualizarRequisito(d);assert.equal(d.dialogo.querySelector('[data-reactiva-asignacion-resumen]').textContent,'');assert.equal(d.dialogo.querySelector('[data-reactiva-asignacion-resumen]').hidden,true);
      if(['en_proceso','resuelta','cerrada'].includes(estado))assert.equal(d.dialogo.querySelector('#reactiva-paso-seguimiento').innerHTML,'Formulario vigente');
    }
    d.registro={...d.registro,estado:'en_proceso',responsable_trabajador_id:null};d.evidenciaAsignacion=null;c.reactivaActualizarRequisito(d);assert.equal(d.dialogo.querySelector('[data-reactiva-asignacion-resumen]').textContent,'Sin responsable asignado.');
    d.evidenciaAsignacion={justificada:true};c.reactivaActualizarRequisito(d);assert.equal(d.dialogo.querySelector('[data-reactiva-asignacion-resumen]').textContent,'Sin asignar: justificación registrada.');
    const fuenteVista=fuente('js/views/reactiva.js');assert(fuenteVista.includes('minlength="10" maxlength="4000" required'));assert(!fuenteVista.includes("reactivaMensajeGestion(d,'Cambio de estado confirmado.')"));
  });
  await prueba('38M.5 fechas históricas deduplicadas por tipo e instante con fallback íntegro',async()=>{
    const f=entorno('reactiva'),c=f.c;c.formatearFechaCL=v=>String(v||'');vm.runInContext(fuente('js/views/reactiva.js'),c);
    const r={...c.registro,ciclo_actual:1,asignada_en:'2026-11-19T10:00:00Z',iniciada_en:'2026-11-19T11:00:00Z',resuelta_en:'2026-11-19T12:00:00Z',cerrada_en:'2026-11-19T13:00:00Z'};
    const eventos=['asignada','iniciada','resuelta','cerrada'].map((evento,i)=>({id:usuarioId,evento,mantencion_reactiva_id:r.id,solicitud_id:r.solicitud_id,created_at:[r.asignada_en,r.iniciada_en,r.resuelta_en,r.cerrada_en][i],actor_nombre_snapshot:'Actor original',motivo:'Motivo original'}));
    const antes=JSON.stringify({r,eventos});const html=c.reactivaHistorialHTML(r,{eventos,ciclos:[]}),ciclos=html.split('Intervenciones de esta mantención')[1].split('</details>')[0];
    for(const etiqueta of ['Asignación','Inicio','Resolución','Cierre'])assert(!ciclos.includes('>'+etiqueta+'</dt>'));assert(html.includes('Actor original'));assert(html.includes('Motivo original'));assert.equal(JSON.stringify({r,eventos}),antes);
    const sinEventos=c.reactivaHistorialHTML(r,{eventos:[],ciclos:[]});for(const etiqueta of ['Asignación','Inicio','Resolución','Cierre'])assert(sinEventos.includes('>'+etiqueta+'</dt>'));
  });
  await prueba('38M.5 detalle10–4000 y éxito temporal solo tras confirmación y recarga',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');
    for(const largo of [9,10,4000,4001]){
      const f=crearEntorno('reactiva'),c=f.c,d=f.ficha;d.registro={...d.registro,estado:'en_proceso',revision:7};let escrituras=0,toasts=0;
      d.dialogo.querySelector('[data-reactiva-detalle-ejecucion]').value='x'.repeat(largo);c.pvToastExito=()=>toasts++;
      c.window.MantencionesReactivasService.cambiarEstado=async()=>{escrituras++;};c.window.MantencionesReactivasService.obtener=async()=>({...d.registro,estado:'resuelta',revision:8});c.reactivaCargar=async()=>true;c.reactivaMostrarFicha=()=>{d.dialogo.querySelector('[data-reactiva-gestion-mensaje]').textContent='';};
      await c.reactivaGuardarEstado();const valido=largo>=10&&largo<=4000;assert.equal(escrituras,valido?1:0);assert.equal(toasts,valido?1:0);if(valido)assert.equal(d.dialogo.querySelector('[data-reactiva-gestion-mensaje]').textContent,'');
    }
    const f=crearEntorno('reactiva'),c=f.c,d=f.ficha,q=d.dialogo.querySelector;d.dialogo.querySelector=s=>{const n=q(s);n.classList.remove=()=>{};return n;};d.registro={...d.registro,estado:'en_proceso',revision:7};d.dialogo.querySelector('[data-reactiva-detalle-ejecucion]').value='Detalle válido conservado';let exitos=0;c.pvToastExito=()=>exitos++;c.window.MantencionesReactivasService.cambiarEstado=async()=>{throw Error('Respuesta incierta');};await c.reactivaGuardarEstado();assert.equal(exitos,0);assert.equal(d.requiereActualizar,true);assert.equal(d.registro.revision,7);assert.equal(d.dialogo.querySelector('[data-reactiva-detalle-ejecucion]').value,'Detalle válido conservado');

  });
  await prueba('38M.6 textos de trabajo/revisión, placeholder no guardable y acción compacta',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');const f=crearEntorno('reactiva'),c=f.c,d=f.ficha;
    d.registro={...d.registro,estado:'en_proceso',responsable_trabajador_id:usuarioId,responsable:{id:usuarioId,nombre:'Persona real'},detalle_ejecucion:''};
    const html=c.reactivaAccionEstadoHTML(d.registro);assert(html.includes('¿Qué trabajo se realizó?'));assert(html.includes('Describe las acciones realizadas, reparaciones y resultado de las pruebas'));assert(html.includes('minlength="10" maxlength="4000" required'));assert(html.includes('placeholder="Ejemplo: Se reparó'));
    assert.equal(html.match(/<textarea[^>]*data-reactiva-detalle-ejecucion[^>]*>([\s\S]*?)<\/textarea>/)[1],'');
    d.borradorEstado={estadoOrigen:'en_proceso',detalle:'Borrador real conservado'};assert(c.reactivaAccionEstadoHTML(d.registro).includes('>Borrador real conservado</textarea>'));
    c.reactivaActualizarRequisito(d);assert(d.dialogo.querySelector('[data-reactiva-asignar]').innerHTML.includes('<svg'));assert(d.dialogo.querySelector('[data-reactiva-asignar]').innerHTML.includes('Cambiar responsable'));assert(d.dialogo.querySelector('[data-reactiva-asignacion-resumen]').hidden);
    const resuelta=c.reactivaAccionEstadoHTML({...d.registro,estado:'resuelta'});for(const texto of ['Verifica el trabajo realizado','Observaciones de revisión y cierre','minlength="5" required','data-reactiva-confirmar-cierre','Revisar y cerrar mantención'])assert(resuelta.includes(texto));
    c.esAdminOperativoActual=()=>false;assert.equal(c.reactivaAccionEstadoHTML(d.registro),'');assert.equal(f.llamadas.length,0);
  });
  await prueba('38M.6 Finalizadas alineadas y pestañas descriptivas sin cambiar navegación',async()=>{
    const e=entorno('reactiva'),c=e.c;c.formatearFechaCL=v=>String(v||'');vm.runInContext(fuente('js/views/reactiva.js'),c);
    const html=c.reactivaFinalizadaHTML({...c.registro,solicitud:{tipo_problema:'Título muy largo '.repeat(20),ubicacion:'Ubicación real'}},3);assert(html.includes('reactiva-finalizada'));assert(html.includes('reactivaAbrirFicha(this,3)'));assert(html.includes('Cerrada'));
    const vista=fuente('js/views/reactiva.js');assert(vista.includes('>Mantenciones activas</button>'));assert(vista.includes('>Mantenciones finalizadas</button>'));
    const css=fuente('css/ui-system.css').split('/* 375K.38M.6:')[1];for(const regla of ['grid-template-columns:minmax(0,1fr) auto auto','margin:0;padding:8px 12px','align-self:center','@media(max-width:640px)','grid-column:1/-1','var(--alm-border)']){if(regla==='var(--alm-border)')continue;assert(css.includes(regla));}assert.equal(e.llamadas.length,0);
  });
  await prueba('38O.2 toast existente configurable conserva duración anterior por defecto',async()=>{
    const fuenteToast=fuente('js/views/prevencionista.js'),inicio=fuenteToast.indexOf('function pvToast('),fin=fuenteToast.indexOf('function pvToastError',inicio);const nodos=new Map(),tiempos=[];
    const c=vm.createContext({document:{getElementById:id=>nodos.get(id),createElement:()=>({classList:{remove(){},add(){}},textContent:''}),body:{appendChild:n=>nodos.set(n.id,n)}},setTimeout:(fn,ms)=>tiempos.push(ms)});
    vm.runInContext(fuenteToast.slice(inicio,fin),c);c.pvToastExito('Asignación guardada.',2000);c.pvToastExito('Otra operación');assert.deepEqual(tiempos,[2000,4000]);
    const vista=fuente('js/views/reactiva.js');assert(!vista.includes("reactivaMensajeGestion(d,justificacionSinAsignar?"));assert(vista.includes("'Asignación guardada.',2000"));
  });
  await prueba('38O.2 notificaciones distinguen lectura y mantienen confirmación de RPC',async()=>{
    const nodos=new Map(),nodo=()=>({innerHTML:'',textContent:'',style:{},classList:{toggle(){},add(){}},setAttribute(){}});const filas=[{id:solicitudId,resultado:'aprobada',leida_en:null,solicitud:{tipo_problema:'Problema real'}},{id:mantencionId,resultado:'rechazada',leida_en:'2026-11-19',motivo:'Razón real'}];
    const c=vm.createContext({disponible:()=>true,filas,error:'',lectura:null,accion:false,esc:v=>String(v??''),fecha:v=>String(v??''),document:{getElementById:id=>{if(!nodos.has(id))nodos.set(id,nodo());return nodos.get(id);},querySelector:()=>null}});
    const src=fuente('js/avisosSolicitudes.js'),inicio=src.indexOf('  const iconoAccion =');vm.runInContext(src.slice(inicio,src.indexOf('  function dejarDeEsperar()',inicio)),c);c.pintar();const html=nodos.get('topbar-notif-list').innerHTML;
    for(const texto of ['revision-notificacion-pendiente','No leída','<svg','Ver solicitud','Marcar leída','alm-btn-secondary'])assert(html.includes(texto));assert(!html.includes('revision-notificacion-leida'));assert.equal(nodos.get('topbar-notif-badge').textContent,'1');assert(html.includes('class="revision-notificacion-acciones"'));assert.equal((html.match(/onclick="NotificacionesRevision.marcar/g)||[]).length,1);const css=fuente('css/ui-system.css').split('/* 375K.38O.3:')[1];assert(css.includes('flex-wrap:nowrap'));assert(css.includes('@media(max-width:360px)'));assert(css.includes('flex-wrap:wrap'));
    const e=entorno();vm.runInContext(fuente('js/services/avisosSolicitudes.service.js'),e.c);let respuesta=false,envios=0;e.c.window.supabaseClient.rpc=async(n,p)=>{envios++;assert.equal(n,'marcar_notificacion_revision_leida');assert.equal(p.p_notificacion_id,solicitudId);return {data:respuesta,error:null};};await assert.rejects(e.c.window.NotificacionesRevisionService.marcar(solicitudId),/No se confirmó/);assert.equal(filas[0].leida_en,null);respuesta=true;await e.c.window.NotificacionesRevisionService.marcar(solicitudId);assert.equal(envios,2);
    filas[0]={...filas[0],leida_en:'lectura-confirmada-por-servidor'};c.pintar();assert.equal(nodos.get('topbar-notif-badge').textContent,'');assert(!nodos.get('topbar-notif-list').innerHTML.includes('Marcar leída'));
  });
  await prueba('38O.2 orden existente conserva fechas y desempate sin consultar mantenciones',async()=>{
    const e=entorno(),ordenes=[];let consultas=0;e.c.window.supabaseClient.from=tabla=>{consultas++;assert.equal(tabla,'solicitudes_reactivas');return {select(){return this;},eq(){return this;},order(k,o){ordenes.push([k,o.ascending]);return this;},range:async()=>({data:[],count:0,error:null})};};
    await e.servicio.listar(0,{orden:'recientes'});await e.servicio.listar(0,{orden:'antiguas'});assert.deepEqual(ordenes,[['created_at',false],['id',false],['created_at',true],['id',true]]);assert.equal(consultas,2);
    const v=fuente('js/views/solicitudes.js');const opciones=v.match(/<select data-solicitudes-orden[\s\S]*?<\/select>/)[0];assert.equal((opciones.match(/<option /g)||[]).length,2);assert(opciones.indexOf('value="recientes"')<opciones.indexOf('value="antiguas"'));assert(v.includes("orden:'recientes'"));for(const etiqueta of ['Más recientes','Más antiguas','data-solicitudes-actualizar'])assert(v.includes(etiqueta));
  });
  await prueba('38P.1A campana personal retira solo tras confirmar y persiste al remontar',async()=>{
    const bd=[{id:solicitudId,destinatario_id:usuarioId,resultado:'aprobada',leida_en:null,solicitud_id:solicitudId},{id:mantencionId,destinatario_id:usuarioId,resultado:'rechazada',leida_en:null,solicitud_id:mantencionId},{id:'ya-leida',destinatario_id:usuarioId,resultado:'aprobada',leida_en:'persistida'}];
    function montar(){
      const nodos=new Map(),eventos={},nodo=()=>({innerHTML:'',textContent:'',style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){}});for(const id of ['topbar-notif-list','topbar-notif-badge','badge-nav-notif-count','btn-notification-dropdown'])nodos.set(id,nodo());let fallo=false,falloLectura=false,esperar=false,resolver,marcas=0;
      const c=vm.createContext({state:{currentUser:{id:usuarioId,role:'RECEPCION'}},esCuentaSinRol:()=>false,esAdminOperativoActual:()=>false,formatearFechaCL:v=>String(v||''),setTimeout:()=>1,clearTimeout(){},document:{getElementById:id=>nodos.get(id)||null,querySelector:()=>null,removeEventListener(){},addEventListener(){}},window:{addEventListener(){},supabaseClient:{auth:{onAuthStateChange:fn=>eventos.auth=fn},channel:()=>({on(){return this;},subscribe(fn){fn('SUBSCRIBED');return this;}}),removeChannel:async()=>{}},NotificacionesRevisionService:{listar:async()=>{if(falloLectura)throw Error('Red');const filas=bd.filter(f=>f.destinatario_id===c.state.currentUser.id).map(f=>({...f}));if(esperar)return new Promise(r=>resolver=()=>r(filas));return filas;},marcar:async id=>{marcas++;if(fallo)throw Error('No confirmado');const f=bd.find(f=>f.id===id&&f.destinatario_id===c.state.currentUser.id);if(!f)throw Error('No autorizado');f.leida_en='confirmada-en-servidor-mock';}}},solicitudesSincronizarRevision:async()=>{}});
      const src=fuente('js/avisosSolicitudes.js'),inicio=src.indexOf('window.NotificacionesRevision =');let codigo=src.slice(inicio,src.indexOf('// Broadcast público:',inicio));codigo=codigo.replace('function avisar(nuevas, preparada = false) {','function avisar(nuevas, preparada = false) { return; // Toast cubierto por pruebas38K.\n');vm.runInContext(codigo,c);const n=c.window.NotificacionesRevision;n.actualizarSesion();return {c,n,nodos,eventos,fallar:v=>fallo=v,fallarLectura:v=>falloLectura=v,esperar:v=>esperar=v,resolver:()=>resolver(),marcas:()=>marcas};
    }
    const e=montar();await e.n.sincronizar();const panel=e.nodos.get('topbar-notif-list'),badge=e.nodos.get('topbar-notif-badge');assert.equal(badge.textContent,'2');assert(!panel.innerHTML.includes('ya-leida'));
    e.fallar(true);await e.n.marcar(solicitudId);assert(panel.innerHTML.includes(solicitudId));assert(panel.innerHTML.includes('No se pudo confirmar la lectura'));assert.equal(badge.textContent,'2');e.fallar(false);
    e.esperar(true);const lecturaAntigua=e.n.sincronizar();await new Promise(setImmediate);const accion=e.n.marcar(solicitudId);await new Promise(setImmediate);assert(!panel.innerHTML.includes('data-notificacion="'+solicitudId+'"'));assert.equal(badge.textContent,'1');await e.n.marcar(solicitudId);assert.equal(e.marcas(),2);e.esperar(false);e.resolver();await lecturaAntigua;await accion;assert(!panel.innerHTML.includes('data-notificacion="'+solicitudId+'"'));
    e.fallarLectura(true);await e.n.sincronizar();assert(panel.innerHTML.includes(mantencionId));assert.equal(badge.textContent,'1');e.fallarLectura(false);
    await e.n.marcar(mantencionId);assert.equal(badge.textContent,'');assert(panel.innerHTML.includes('No tienes notificaciones pendientes'));assert(!panel.innerHTML.includes('data-notificacion='));
    const recarga=montar();await recarga.n.sincronizar();assert(recarga.nodos.get('topbar-notif-list').innerHTML.includes('No tienes notificaciones pendientes'));
    recarga.c.state.currentUser={id:'otra-cuenta',role:'RECEPCION'};recarga.n.actualizarSesion();await recarga.n.sincronizar();assert(!recarga.nodos.get('topbar-notif-list').innerHTML.includes(solicitudId));recarga.c.state.currentUser.role='TECNICO';recarga.n.actualizarSesion();assert.equal(recarga.n.disponible(),false);
  });
  await prueba('38P.3 emisores solo tras confirmar siete operaciones y fallo de aviso no reescribe',async()=>{
    const e=entorno('reactiva'),c=e.c;vm.runInContext(fuente('js/services/mantencionesReactivas.service.js'),c);const svc=c.window.MantencionesReactivasService;let senales=0,rpcs=0;c.window.SolicitudesSincronizacion={emitirReactivaConfirmada:async()=>{senales++;return true;}};c.window.supabaseClient.rpc=async()=>{rpcs++;return {error:null};};const base={...c.registro,revision:7};
    await svc.asignar(base,usuarioId,'');await svc.asignar({...base,responsable_trabajador_id:usuarioId},solicitudId,'Cambio justificado');await svc.asignar(base,null,'No asignación justificada');
    await svc.cambiarEstado(base,'en_proceso','','');await svc.cambiarEstado({...base,estado:'en_proceso'},'resuelta','Trabajo realizado completo','');await svc.cambiarEstado({...base,estado:'resuelta'},'cerrada','','Revisión aprobada');await svc.reabrir({...base,estado:'cerrada'},'Motivo suficiente para reabrir');await new Promise(setImmediate);assert.equal(senales,7);assert.equal(rpcs,7);
    c.window.supabaseClient.rpc=async()=>({error:Error('Conflicto de revisión')});await assert.rejects(svc.asignar(base,usuarioId,''));assert.equal(senales,7);
    c.window.supabaseClient.rpc=async()=>{throw Error('Respuesta incierta');};await assert.rejects(svc.cambiarEstado(base,'en_proceso','',''));assert.equal(senales,7);
    c.window.SolicitudesSincronizacion.emitirReactivaConfirmada=async()=>{throw Error('Canal no disponible');};c.window.supabaseClient.rpc=async()=>{rpcs++;return {error:null};};await svc.asignar(base,usuarioId,'');await new Promise(setImmediate);assert.equal(rpcs,8);
    c.window.SolicitudesSincronizacion.emitirReactivaConfirmada=async()=>{senales++;};c.window.supabaseClient.rpc=async()=>{c.state.currentUser={...c.state.currentUser,id:solicitudId};return {error:null};};await svc.asignar(base,usuarioId,'');await new Promise(setImmediate);assert.equal(senales,7);
  });
  await prueba('38P.3B decisión concurrente simulada A/A y A/R conserva estado y rechazo',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');
    function preparar(){const f=crearEntorno('solicitudes'),c=f.c,d=f.ficha;d.id=solicitudId;d.registro={...d.registro};c.formatearFechaCL=v=>String(v||'');c.toasts=[];c.pvToastExito=(t,ms)=>c.toasts.push([t,ms]);c.solicitudesCargar=async()=>true;c.solicitudesVerMantencion=async()=>{};const dialogo=c.document.createElement('dialog');d.rechazo={dialogo};dialogo.querySelector('[data-solicitudes-motivo]').value='Motivo del segundo administrador';dialogo.querySelector('[type="submit"]').type='submit';return {f,c,d};}
    for(const segunda of [true,false]){
      const a=preparar(),b=preparar();b.c.state.currentUser={...b.c.state.currentUser,id:mantencionId};b.d.usuarioId=mantencionId;
      const bd={...a.d.registro};let escrituras=0,aceptadas=0;
      for(const e of [a,b]){e.c.window.SolicitudesService.obtener=async()=>({...bd});e.c.window.supabaseClient.rpc=async(n,args)=>{escrituras++;if(bd.estado!=='pendiente')return {error:Error('Ya decidida')};bd.estado=args.p_aprobar?'aprobada':'rechazada';aceptadas++;return {data:[{solicitud_id:solicitudId,estado_solicitud:bd.estado,mantencion_reactiva_id:args.p_aprobar?mantencionId:null}]};};}
      await Promise.all([a.c.solicitudesDecidir(true),b.c.solicitudesDecidir(segunda)]);assert.equal(escrituras,2);assert.equal(aceptadas,1);assert.equal(b.d.registro.estado,'aprobada');assert.equal(b.d.rechazo.dialogo.querySelector('[data-solicitudes-motivo]').value,'Motivo del segundo administrador');assert.equal(b.d.rechazo.dialogo.querySelector('[type="submit"]').disabled,true);assert.equal(b.c.toasts.length,1);assert.equal(b.c.toasts[0][1],2000);assert(!b.d.dialogo.querySelector('[data-solicitudes-detalle-contenido]').innerHTML.includes('solicitudesDecidir(true)'));await b.c.solicitudesDecidir(false);assert.equal(escrituras,2);
    }
    const e=preparar();e.c.window.SolicitudesService.obtener=async()=>({...e.d.registro,estado:'rechazada'});await e.c.solicitudesRevalidarFicha(e.d);await e.c.solicitudesRevalidarFicha(e.d);assert.equal(e.c.toasts.length,1);assert.equal(e.c.toasts[0][0],'Esta solicitud ya fue rechazada');assert.equal(e.d.registro.estado,'rechazada');
  });
  await prueba('38P.3B lectura fallida no rehabilita submit; reintento preserva texto y sesión',async()=>{
    const {crearEntorno}=require('./harness_reactiva_eliminacion_sesion');const f=crearEntorno('solicitudes'),c=f.c,d=f.ficha;d.id=solicitudId;d.registro={...d.registro};c.formatearFechaCL=v=>String(v||'');c.solicitudesCargar=async()=>true;
    d.rechazo={dialogo:c.document.createElement('dialog')};const form=d.rechazo.dialogo;form.querySelector('[data-solicitudes-motivo]').value='Motivo escrito y no enviado';form.querySelector('[type="submit"]').type='submit';let envios=0,lecturas=0;
    c.window.supabaseClient.rpc=async()=>{envios++;return {error:Error('Resultado incierto')};};c.window.SolicitudesService.obtener=async()=>{lecturas++;throw Error('Red no disponible');};await c.solicitudesDecidir(false);assert.equal(envios,1);assert.equal(d.decisionNoVerificable,true);assert(form.querySelector('[type="submit"]').disabled);assert.equal(form.querySelector('[data-solicitudes-revalidar]').hidden,false);await c.solicitudesDecidir(false);assert.equal(envios,1);
    let resolver;c.window.SolicitudesService.obtener=()=>{lecturas++;return new Promise(r=>resolver=r);};const antes=lecturas,p=c.solicitudesActualizarDetalle(),duplicada=c.solicitudesActualizarDetalle();assert.equal(lecturas,antes+1);assert(form.querySelector('[type="submit"]').disabled);await c.solicitudesDecidir(false);assert.equal(envios,1);resolver({...d.registro,estado:'pendiente'});await p;await duplicada;assert.equal(d.decisionNoVerificable,false);assert.equal(form.querySelector('[type="submit"]').disabled,false);assert.equal(form.querySelector('[data-solicitudes-motivo]').value,'Motivo escrito y no enviado');
    const tardia=c.solicitudesActualizarDetalle();c.state.currentUser={...c.state.currentUser,id:mantencionId};resolver({...d.registro,estado:'aprobada'});await tardia;assert.equal(d.registro.estado,'pendiente');assert(form.querySelector('[type="submit"]').disabled);
    c.state.currentUser={...c.state.currentUser,id:usuarioId};const perdida=c.solicitudesActualizarDetalle();c.esAdminOperativoActual=()=>false;resolver({...d.registro,estado:'aprobada'});await perdida;assert.equal(d.registro.estado,'pendiente');assert(form.querySelector('[type="submit"]').disabled);
  });
  console.log(`${grupos} grupos correctos; exclusivamente mocks locales.`);
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={entorno,fuente,solicitudId,mantencionId,usuarioId};
