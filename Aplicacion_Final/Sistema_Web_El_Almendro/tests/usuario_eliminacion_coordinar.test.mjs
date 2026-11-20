import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createDeletionCoordinator, createIntegralDeletionCoordinator } from '../supabase/functions/usuario-eliminacion-previsualizar/eliminacion-coordinar.mjs';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const T = '33333333-3333-4333-8333-333333333333';
const R = '44444444-4444-4444-8444-444444444444';
const S = '55555555-5555-4555-8555-555555555555';
const attempt = '66666666-6666-4666-8666-666666666666';
const input = (target = T, id = R) => ({ usuario_id: target, operacion_id: id,
  nombre_confirmacion: 'Cuenta sintética', motivo: 'Motivo sintético suficiente', confirmacion: true });
const clone = value => structuredClone(value);
test('375K.5 modal: cierre y actualización solo tras COMPLETADA; fallos conservan ventana y operación',async()=>{
  for(const base of ['', 'publicacion/'])for(const recovery of [false,true])for(const status of ['ok','uncertain','error']){
    const all=[],events=[];
    class El {
      constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.isConnected=true;this.value='';all.push(this);}
      append(...x){this.children.push(...x);}setAttribute(){}focus(){}
      addEventListener(k,f){this.listeners[k]=f;}
      insertAdjacentHTML(){const eye=new El('button');eye.type='button';this.append(eye);}
      querySelector(){return this.children.find(x=>x.tag==='button');}
      showModal(){this.open=true;}close(){this.open=false;events.push('close');}
      remove(){this.isConnected=false;events.push('remove');}
      replaceChildren(){this.children=[];}
    }
    const op={operacion_id:S,request_id:R,objetivo_id:T,nombre:'Nombre original',motivo:'Motivo suficiente de prueba',fingerprint:'a'.repeat(64),
      estado:recovery?'AUTH_EN_CURSO':'PREPARADA',intentos_auth:recovery?1:0,
      habilitacion:{efectiva:true,verificada:true,servidor:true,sql:true}};
    const ctx=vm.createContext({state:{currentUser:{id:A}},adminAccesoVigente:()=>true,
      adminPasswordEyeHTML:()=>'',togglePasswordVisibility:()=>{},adminMostrarToast:message=>{events.push('toast');assert(!message.includes('PRIVADO'));},
      cargarPanelAdminDatos:async()=>{events.push('reload');assert.equal(all.find(x=>x.id==='admin-elimination-continuation-dialog').isConnected,false);},
      document:{body:new El('body'),createElement:tag=>new El(tag),createTextNode:t=>({textContent:t}),getElementById:id=>all.find(x=>x.id===id&&x.isConnected)},
      window:{UsuariosService:{consultarEliminacionesPendientes:async id=>{assert.equal(id,S);return [op];},
        [recovery?'recuperarEliminacionIniciada':'continuarEliminacionPreparada']:async(original,password,name,confirm)=>{
          events.push('execute');assert.equal(original.operacion_id,S);assert.equal(original.request_id,R);
          assert.equal(password,'SINTETICA');assert.equal(name,op.nombre);assert.equal(confirm,true);
          if(status==='error')throw Error('PRIVADO');return {resultado:'COMPLETADA',eliminacion_ejecutada:status==='ok',operacion_id:S};
        }}}});
    const source=readFileSync(new URL('../'+base+'js/views/admin.js',import.meta.url),'utf8');
    const constants=source.match(/const ADMIN_ELIMINACION_HABILITADA = true;[^]*?function adminObjetivoPermitidoEliminacion\([^]*?\n}/)[0];
    vm.runInContext(constants+'\n'+source.match(/function adminTextoEliminacionConfirmada\([^]*?\n}/)[0]+'\n'+source.match(/function adminConfirmarContinuacionEliminacion\([^]*?\n}/)[0],ctx);
    ctx.adminConfirmarContinuacionEliminacion(op);await new Promise(setImmediate);
    const button=all.find(x=>x.type==='submit');assert.equal(button.disabled,false);
    all.find(x=>x.tag==='input'&&x.type==='text').value=op.nombre;
    all.find(x=>x.type==='password').value='SINTETICA';all.find(x=>x.type==='checkbox').checked=true;
    await all.find(x=>x.tag==='form').listeners.submit({preventDefault(){}});
    const dialog=all.find(x=>x.id==='admin-elimination-continuation-dialog');
    assert.equal(dialog.isConnected,status!=='ok');
    assert.equal(events.filter(e=>e==='toast').length,status==='ok'?1:0);
    assert.equal(events.filter(e=>e==='reload').length,status==='ok'?1:0);
    assert.equal(all.find(x=>x.id==='admin-continuacion-password').value,'');
    if(status==='ok')assert(events.indexOf('remove')<events.indexOf('reload'));
    assert(source.includes('getUsuarios(true)'));assert(source.includes('getRoles(true)'));
    assert(source.includes('void adminConsultarEliminacionesPendientes()'));
    assert(source.includes('<summary class="font-bold">Información que se conservará</summary>'));
    vm.runInContext(source.match(/function adminEliminacionCamposHTML\([^]*?\n}/)[0],ctx);
    const html=ctx.adminEliminacionCamposHTML();
    assert.equal((html.match(/<details\b/g)||[]).length,1);assert.equal((html.match(/<\/details>/g)||[]).length,1);
    for(const id of ['ag-nombre-exacto','ag-motivo','ag-password','ag-confirmar'])assert(html.includes(id));
  }
});
test('375K.5 sin operaciones pendientes retira el acceso de revisión sin ejecutar nada',async()=>{
  for(const base of ['', 'publicacion/']){
    const host={isConnected:true,children:['boton previo'],replaceChildren(){this.children=[];}};
    const c=vm.createContext({state:{currentUser:{id:A}},adminAccesoVigente:()=>true,
      document:{getElementById:()=>host},window:{UsuariosService:{consultarEliminacionesPendientes:async()=>[]}}});
    const s=readFileSync(new URL('../'+base+'js/views/admin.js',import.meta.url),'utf8');
    vm.runInContext(s.match(/async function adminConsultarEliminacionesPendientes\([^]*?\n}/)[0],c);
    await c.adminConsultarEliminacionesPendientes();assert.equal(host.children.length,0);
  }
});
test('375K.5 frontend: habilitación general válida sin autorización irreversible',async()=>{
  const pilot='ad695ef5-91de-40b1-87a4-4a9962ae5e8b';
  for(const base of ['', 'publicacion/'])for(const scenario of ['ok','sql','servidor','unknown','missing','tipo','incoherente','otro','fecha','extra','autorizacion','red','certificado']){
    const h={contrato:'usuario-eliminacion-habilitacion/v2',objetivo_id:pilot,servidor:true,sql:true,
      comprobada_en:new Date().toISOString(),verificada:true,efectiva:true,autoriza_auth:false};
    if(scenario==='sql'){h.sql=false;h.efectiva=false;}
    if(scenario==='servidor'){h.servidor=false;h.efectiva=false;}
    if(scenario==='unknown'){h.sql=null;h.verificada=false;h.comprobada_en=null;h.efectiva=false;}
    if(scenario==='tipo')h.efectiva='true';if(scenario==='incoherente')h.sql=false;
    if(scenario==='otro')h.objetivo_id=T;if(scenario==='fecha')h.comprobada_en='invalida';
    if(scenario==='extra')h.privado='NO_ADMITIDO';if(scenario==='autorizacion')h.autoriza_auth=true;
    const g={actor:A,operacion:'ELIMINAR_UI',contexto:{usuario:{id:pilot,rol_id:R,roles:{nombre:'recepcion'}}}};
    const c=vm.createContext({window:{supabaseClient:{auth:{getUser:async()=>({data:{user:{id:A}}})},functions:{invoke:async()=>{
      if(scenario==='red')return {error:Error('privado')};
      return {data:{contrato:'usuario-eliminacion-resumen/v2',usuario_id:pilot,eliminacion_ejecutada:false,
        eliminacion_habilitada:false,puede_eliminar:false,conservacion_certificada:scenario==='certificado',verificacion_fisica:'pendiente',
        comprobado_en:new Date().toISOString(),registros:Object.keys(c.window.UsuariosService.etiquetasConservacionV2).map(tabla=>({tabla,cantidad:0})),
        archivos_propiedad_individual:0,retiros_pendientes:0,migraciones_pendientes:0,ficha_laboral:null,
        ...(scenario==='missing'?{}:{habilitacion:h})},error:null};
    }}}},adminGestion:g,state:{currentUser:{id:A}},adminAccesoVigente:()=>true,
      adminNombreRolNormalizado:s=>s,document:{getElementById:()=>({isConnected:true})}});
    vm.runInContext(readFileSync(new URL('../'+base+'js/services/usuarios.service.js',import.meta.url),'utf8'),c);
    c.window.UsuariosService.getMiEstadoAdministrativo=async()=>({es_admin_permanente:true});
    let data;try{data=await c.window.UsuariosService.consultarResumenConservacion(pilot);}catch{data=null;}
    g.previsualizacionEliminacion={estado:data?'lista':'error',usuarioId:pilot,sinBloqueos:true,habilitacion:data?.habilitacion};
    const view=readFileSync(new URL('../'+base+'js/views/admin.js',import.meta.url),'utf8');
    const constants=view.match(/const ADMIN_ELIMINACION_HABILITADA = true;[^]*?function adminObjetivoPermitidoEliminacion\([^]*?\n}/)[0];
    const previous=view.match(/function adminObjetivoEliminacionPermitido\([^]*?\n}/)?.[0]||'';
    vm.runInContext(constants+'\n'+previous+'\n'+view.match(/function adminPuedeEnviarEliminacion\([^]*?\n}/)[0],c);
    assert.equal(c.adminPuedeEnviarEliminacion(g,true),scenario==='ok',base+scenario);
    assert.equal(c.adminPuedeEnviarEliminacion(g,false),false);
    g.contexto.usuario.id=T;assert.equal(c.adminPuedeEnviarEliminacion(g,true),false);
    assert(view.includes('Este resumen no autoriza eliminar'));assert(view.includes('submit.disabled = true; // Cerrado'));
    assert(view.includes('habilitacion?.efectiva!==true'));assert(!view.includes('La eliminación real y su continuación siguen deshabilitadas.'));
  }
});
test('375B continuación/recuperación: reconsulta UUID original y bloquea respuestas cerradas o inválidas',async()=>{
  const pilot='ad695ef5-91de-40b1-87a4-4a9962ae5e8b',originalOperation='65684d2c-174d-4e81-84dd-0dabfa3cccad',originalRequest='b79d5c8f-a13f-499e-ac24-e5baddbf6c2f';
  for(const base of ['', 'publicacion/'])for(const recovery of [false,true])for(const scenario of ['ok','sql','missing','incoherente','red','nombre','confirmacion','password']){
    const op={operacion_id:originalOperation,request_id:originalRequest,objetivo_id:pilot,nombre:'Jose Cueto',motivo:'Motivo suficiente de ensayo',fingerprint:'a'.repeat(64),estado:recovery?'AUTH_EN_CURSO':'PREPARADA',intentos_auth:recovery?1:0};
    let lecturas=0,envios=0;
    const h={contrato:'usuario-eliminacion-habilitacion/v2',objetivo_id:pilot,servidor:true,sql:scenario!=='sql',
      comprobada_en:new Date().toISOString(),verificada:true,efectiva:scenario!=='sql',autoriza_auth:false};
    if(scenario==='incoherente')h.sql=false;
    const c=vm.createContext({window:{supabaseClient:{auth:{getUser:async()=>({data:{user:{id:A}}})},functions:{invoke:async(_, {body})=>{
      if(body.accion==='CONSULTAR_OPERACION'){lecturas++;assert.equal(body.operacion_id,originalOperation);
        if(scenario==='red')return {error:Error('privado')};
        return {data:{resultado:'CONSULTA_OK',eliminacion_ejecutada:false,operaciones:[op],...(scenario==='missing'?{}:{habilitacion:h})}};}
      envios++;assert(!('request_id'in body));
      if(recovery){assert.equal(body.accion,undefined);assert.equal(body.operacion_id,originalRequest);assert.equal(body.usuario_id,pilot);}
      else {assert.equal(body.accion,'CONTINUAR_PREPARADA');assert.equal(body.operacion_id,originalOperation);assert(!('usuario_id'in body));}
      return {data:{resultado:'COMPLETADA',eliminacion_ejecutada:true,operacion_id:originalOperation}};
    }}}}});
    vm.runInContext(readFileSync(new URL('../'+base+'js/services/usuarios.service.js',import.meta.url),'utf8'),c);
    const s=c.window.UsuariosService;s.getMiEstadoAdministrativo=async()=>({es_admin_permanente:true});
    const accion=()=>s[recovery?'recuperarEliminacionIniciada':'continuarEliminacionPreparada'](op,scenario==='password'?'':'SINTETICA',scenario==='nombre'?'Otro':op.nombre,scenario!=='confirmacion');
    if(scenario==='ok')assert.equal((await accion()).resultado,'COMPLETADA');else await assert.rejects(accion());
    assert.equal(envios,scenario==='ok'?1:0);assert.equal(lecturas,1);
  }
});
test('364 UI: recuperación reconsulta y conserva UUID; respuesta sin confirmación nunca es éxito',async()=>{
 for(const base of ['', 'publicacion/'])for(const scenario of ['ok','changed','wrongReceipt','uncertain']){
  const op={operacion_id:S,request_id:R,objetivo_id:T,nombre:'Cuenta sintética',motivo:'Motivo suficiente para revisión',fingerprint:'a'.repeat(64),estado:'AUTH_EN_CURSO',intentos_auth:1};
  let reads=0,sends=0,sent;
  const c=vm.createContext({window:{supabaseClient:{auth:{getUser:async()=>({data:{user:{id:A}}})},functions:{invoke:async(name,{body})=>{
   if(body.accion==='CONSULTAR_OPERACION'){reads++;return {data:{resultado:'CONSULTA_OK',eliminacion_ejecutada:false,operaciones:[{...op,...(scenario==='changed'?{estado:'REQUIERE_REVISION'}:{})}]}};}
   sends++;sent=body;assert.equal(body.usuario_id,T);assert.equal(body.operacion_id,R);assert(!('accion'in body));
   return {data:scenario==='uncertain'?{error:'REQUIERE_REVISION',operacion_id:S}:{resultado:'COMPLETADA',eliminacion_ejecutada:true,operacion_id:scenario==='wrongReceipt'?B:S}};
  }}}}});
  vm.runInContext(readFileSync(new URL('../'+base+'js/services/usuarios.service.js',import.meta.url),'utf8'),c);
  const service=c.window.UsuariosService;service.getMiEstadoAdministrativo=async()=>({es_admin_permanente:true});
  if(scenario==='ok')assert.equal((await service.recuperarEliminacionIniciada(op,'CLAVE_SINTETICA',op.nombre,true)).operacion_id,S);
  else await assert.rejects(()=>service.recuperarEliminacionIniciada(op,'CLAVE_SINTETICA',op.nombre,true));
  assert.equal(reads,1);assert.equal(sends,scenario==='changed'?0:1);if(sent)assert.equal(sent.password,'');
 }
});
test('364 UI: etiqueta histórica solo tras COMPLETADA exacta y formularios deshabilitados en ambos temas',()=>{
 for(const base of ['', 'publicacion/']){
  const source=readFileSync(new URL('../'+base+'js/views/admin.js',import.meta.url),'utf8');
  const c=vm.createContext({});vm.runInContext(source.match(/function adminTextoEliminacionConfirmada\([^]*?\n}/)[0],c);
  const op={operacion_id:S,nombre:'Nombre original'};
  assert.equal(c.adminTextoEliminacionConfirmada(op,{resultado:'COMPLETADA',eliminacion_ejecutada:true,operacion_id:S}),'Nombre original (cuenta eliminada)');
  for(const response of [{estado:'AUTH_ELIMINADA'}, {resultado:'COMPLETADA',eliminacion_ejecutada:false,operacion_id:S},
    {resultado:'COMPLETADA',eliminacion_ejecutada:true,operacion_id:B}, {resultado:'COMPLETADA',eliminacion_ejecutada:true}])
    assert.throws(()=>c.adminTextoEliminacionConfirmada(op,response));
  assert(source.includes('const ADMIN_ELIMINACION_HABILITADA = false;'));
  assert(source.includes('submit.disabled = !ADMIN_ELIMINACION_HABILITADA'));
  assert(source.includes('continueButton.disabled = !ADMIN_ELIMINACION_HABILITADA'));
  assert(source.includes('reason.readOnly = true'));assert(source.includes('Este resumen no autoriza eliminar'));
  assert(source.includes('dark:bg-slate-900'));assert(source.includes('max-h-[90vh]'));assert(source.includes('dialog.addEventListener(\'cancel\''));
 }
});
function integralFixture363({ existing = null, closed = false, breakAt = '', invalidSeal = false, noAdmin = false, recoveryReview = null } = {}) {
  const calls = []; let deletes = 0;
  const row = { id:S, estado:'PREPARADA', intentos_auth:0,
    dependencias_resumen:{conservacion_integral_v2:{version:2},paso191:{attempt_id:attempt}} };
  const final = {id:S,state:'COMPLETADA',audit_verified:true,execution_authorized:true,conservacion_historica_certificada:true};
  const integral = {};
  for (const name of ['leer','preparar','certificar','verificarArchivos','iniciar','verificarInicio','confirmar','recuperar','finalizar','revisar']) {
    integral[name] = async (...args) => {
      calls.push(name==='verificarArchivos'?name+':'+args[2]:name);
      if (breakAt === name || breakAt === name+':'+args[2]) throw new Error('fallo SQL/HTTP simulado');
      if (name==='leer') return clone(existing);
      if (name==='iniciar') return {...clone(row),estado:'AUTH_EN_CURSO',intentos_auth:1};
      if (name==='verificarInicio') return {id:S,attempt_id:attempt,state:'AUTH_EN_CURSO',actor_id:A,target_id:invalidSeal?B:T,
        request_id:R,execution_authorized:true,conservacion_historica_certificada:true};
      if (name==='finalizar') return clone(final);
      if (name==='recuperar') return recoveryReview?{...clone(row),estado:recoveryReview,intentos_auth:1,requiere_revision:true}:{...clone(row),estado:'AUTH_ELIMINADA',intentos_auth:1};
      if (name==='revisar') return {persisted:true};
      return clone(row);
    };
  }
  const coordinator = createIntegralDeletionCoordinator({enabled:()=>!closed, adapter:{integral},
    authenticate:async()=>({id:A,permanent:!noAdmin}), reauthenticate:async({purpose})=>{calls.push('reauth:'+purpose);return {};},
    deleteAuth:async()=>{deletes++;calls.push('auth');return {outcome:'acknowledged'};}});
  return {run:()=>coordinator.execute({authorization:'Bearer prueba',input:input()}),calls,deletes:()=>deletes};
}
test('374L recuperación en revisión no finaliza, no reintenta Auth y conserva operación original',async()=>{
  for(const estado of ['REQUIERE_REVISION','AUTH_EN_CURSO']){
    const f=integralFixture363({existing:{id:S,estado:'AUTH_EN_CURSO',intentos_auth:1,
      dependencias_resumen:{conservacion_integral_v2:{version:2}}},recoveryReview:estado});
    const r=await f.run();assert.equal(r.error,'REQUIERE_REVISION');assert.equal(r.operacion_id,S);
    assert.equal(r.eliminacion_ejecutada,false);assert.equal(f.deletes(),0);assert(!f.calls.includes('finalizar'));
    assert(!f.calls.includes('revisar'));
  }
  const failure=integralFixture363({breakAt:'confirmar'});const r=await failure.run();
  assert.equal(r.revision_registrada,true);
});
test('363 V2: compuerta y autorización cierran antes de SQL/Auth',async()=>{
  const closed=integralFixture363({closed:true});assert.equal((await closed.run()).error,'ELIMINACION_REAL_DESHABILITADA');assert.deepEqual(closed.calls,[]);
  const denied=integralFixture363({noAdmin:true});assert.equal((await denied.run()).eliminacion_ejecutada,false);assert.deepEqual(denied.calls,[]);
});
test('363 V2: preparación, física, SQL, Auth único, posterior y auditoría en orden',async()=>{
  const f=integralFixture363();assert.equal((await f.run()).resultado,'COMPLETADA');assert.equal(f.deletes(),1);
  assert.deepEqual(f.calls,['leer','reauth:inicio','preparar','certificar','verificarArchivos:antes','iniciar','verificarInicio','auth','verificarArchivos:despues','confirmar','finalizar']);
});
test('363 V2: PREPARADA original reutiliza solicitud, inicio cerrado y sello alterado no borran',async()=>{
  const existing={id:S,estado:'PREPARADA',intentos_auth:0};
  for(const options of [{existing,breakAt:'iniciar'},{existing,invalidSeal:true},{existing,breakAt:'verificarArchivos:antes'}]){
    const f=integralFixture363(options),r=await f.run();assert.equal(r.operacion_id,S);assert.equal(r.eliminacion_ejecutada,false);
    assert.equal(f.deletes(),0);assert(!f.calls.includes('revisar'));
  }
});
test('363 V2: recuperación AUTH_EN_CURSO/REVISION nunca repite Auth ni preparación',async()=>{
  for(const estado of ['AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION']){
    const f=integralFixture363({existing:{id:S,estado,intentos_auth:1,dependencias_resumen:{conservacion_integral_v2:{version:2}}}});
    assert.equal((await f.run()).resultado,'COMPLETADA');assert.equal(f.deletes(),0);
    assert.deepEqual(f.calls,['leer','reauth:recuperacion','verificarArchivos:despues','recuperar','finalizar']);
  }
});
test('363 V2: pérdida posterior, física o auditoría fallida conservan revisión sin éxito falso',async()=>{
  for(const breakAt of ['verificarArchivos:despues','confirmar','finalizar']){
    const f=integralFixture363({breakAt}),r=await f.run();assert.equal(r.error,'REQUIERE_REVISION');assert.equal(r.eliminacion_ejecutada,false);
    assert.equal(f.deletes(),1);assert(f.calls.includes('revisar'));
  }
});
test('363 V2: COMPLETADA valida recibo SQL sin GET, contraseña ni Auth',async()=>{
  const f=integralFixture363({existing:{id:S,estado:'COMPLETADA',intentos_auth:1}});assert.equal((await f.run()).resultado,'COMPLETADA');
  assert.deepEqual(f.calls,['leer','finalizar']);assert.equal(f.deletes(),0);
});
function world() {
  return { users: new Set([A, B, T]), admins: new Set([A, B]), operations: new Map(),
    audits: new Set(), auditDetails: new Map(), reserved: new Set(), deleted: [], events: [], history: {
      solicitudes: [{ id: S, creada_por: T, creador_nombre_snapshot: 'Pablo Gamboa', estado: 'pendiente',
        tipo_problema: 'Prueba sintética', ubicacion: 'Ubicación sintética', descripcion: 'Sin datos reales',
        urgencia: 'baja', observaciones: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
        revisada_por: null, revisada_en: null, motivo_decision: null }],
      avisos: [{ solicitud_id: S, visto_en: null, pospuesto_en: null }],
      documentos: [], archivos: [], mantenciones: [], tareas: [], eventos: [], auditoriasPrevias: [{ id: 'auditoria-sintetica' }],
    } };
}
function harness(w = world(), options = {}) {
  const actor = options.actor || A; let failedAudit = false;
  const baseline = clone(w.history);
  const coordinator = createDeletionCoordinator({
    authenticate: async () => ({ id: actor, permanent: options.permanent !== false && w.users.has(actor) }),
    verifyRecentIdentity: async () => options.reauthenticated !== false,
    verifyBeforeIrreversible: options.omitFinalGuard ? undefined : async () => options.finalGuard !== false,
    inspect: async () => ({ callerPermanent: w.users.has(actor), targetExists: true, authExists: true,
      targetName: 'Cuenta sintética', targetPermanent: options.targetAdmin === true, permanentCount: w.admins.size,
      assignments: { mantenciones: options.assignment || 0, tareas: 0 }, storage: { total: options.storage || 0 },
      historicalProtectionVerified: options.certified !== false }),
  });
  // Único consumidor de intenciones: mocks en tests. Sin fetch, clientes o sockets.
  async function dispatch({ kind, payload, simulacion }) {
    assert.equal(simulacion, true); w.events.push(kind);
    if (kind === options.failAt) throw new Error('detalle-privado');
    const op = payload.operation ? w.operations.get(payload.operation.request_id) : null;
    switch (kind) {
      case 'LEER_OPERACION': return clone(w.operations.get(payload.request_id) || null);
      case 'PREPARAR_SQL': {
        if (!w.operations.has(payload.request_id)) w.operations.set(payload.request_id,
          { ...payload, id: payload.request_id, state: 'PREPARADA', conservacion_historica_certificada: false });
        return clone(w.operations.get(payload.request_id));
      }
      case 'CERTIFICAR_Y_AUTORIZAR_INICIO_SQL': {
        if (op.state !== 'PREPARADA' || !w.users.has(actor) || w.reserved.has(op.actor_id) || w.reserved.has(op.target_id)) throw new Error('conflicto');
        if (w.admins.has(op.target_id) && w.admins.size <= 1) throw new Error('ultimo');
        w.reserved.add(op.actor_id); w.reserved.add(op.target_id);
        Object.assign(op, { state: 'AUTH_EN_CURSO', conservacion_historica_certificada: true,
          execution_authorized: true, attempt_id: attempt });
        if (options.afterAuthorize) await options.afterAuthorize();
        return clone(op);
      }
      case 'ELIMINAR_AUTH_SIMULADO':
        if (options.beforeAuth) await options.beforeAuth();
        w.deleted.push(op.target_id);
        if (options.authUncertain) return { outcome: 'uncertain' };
        w.users.delete(op.target_id); w.admins.delete(op.target_id);
        return { outcome: 'acknowledged' };
      case 'VERIFICAR_AUSENCIA': return { auth_absent: !w.users.has(op.target_id), profile_absent: !w.users.has(op.target_id), history_preserved: isDeepStrictEqual(w.history, baseline) };
      case 'MARCAR_AUTH_ELIMINADA_SQL': op.state = 'AUTH_ELIMINADA'; return clone(op);
      case 'FINALIZAR_SQL_ENDURECIDA':
        assert.equal(op.conservacion_historica_certificada, true);
        assert.equal(op.execution_authorized, true); assert.equal(op.state, 'AUTH_ELIMINADA');
        assert(!w.users.has(op.target_id));
        if (options.auditFailure && !failedAudit) { failedAudit = true; throw new Error('detalle-privado'); }
        // Commit simulado conjunto: auditoría única + COMPLETADA.
        w.audits.add(op.id); w.auditDetails.set(op.id, { actor_id: op.actor_id, actor_nombre_snapshot: 'Administrador sintético',
          objetivo_id: op.target_id, objetivo_nombre_snapshot: op.nombre, motivo: op.motivo,
          fecha: '2026-11-02T12:00:00Z', verificaciones: { historial_preservado: isDeepStrictEqual(w.history, baseline) } });
        op.state = 'COMPLETADA'; op.audit_verified = true;
        w.reserved.delete(op.actor_id); w.reserved.delete(op.target_id); return clone(op);
      case 'REGISTRAR_REVISION_SQL': op.state = 'REQUIERE_REVISION'; return { persisted: true };
      case 'RECONCILIAR_SQL':
        if (!op.execution_authorized || !op.conservacion_historica_certificada) return clone(op);
        op.state = w.users.has(op.target_id) ? 'REQUIERE_REVISION' : 'AUTH_ELIMINADA'; return clone(op);
      default: throw new Error('intencion-desconocida');
    }
  }
  async function run(body = input()) {
    const flow = coordinator.simulate({ authorization: 'Bearer sesion-sintetica', input: body });
    let step = await flow.next();
    while (!step.done) {
      try { step = await flow.next(await dispatch(step.value)); }
      catch (error) { step = await flow.throw(error); }
    }
    for (const key of ['puede_eliminar', 'eliminacion_habilitada', 'eliminacion_ejecutada', 'validacion_integral_completa']) assert.equal(step.value[key], false);
    assert(!JSON.stringify(step.value).includes('detalle-privado'));
    return step.value;
  }
  return { coordinator, run, w };
}
test('flujo simulado: preparación, certificación, Auth, verificación, auditoría y conservación', async () => {
  const h = harness(); const history = clone(h.w.history); const result = await h.run();
  assert.equal(result.resultado_simulado, 'COMPLETADA'); assert.equal(h.w.audits.size, 1);
  assert.deepEqual(h.w.deleted, [T]); assert.deepEqual(h.w.history, history);
  assert.deepEqual(h.w.events, ['LEER_OPERACION', 'PREPARAR_SQL', 'CERTIFICAR_Y_AUTORIZAR_INICIO_SQL',
    'ELIMINAR_AUTH_SIMULADO', 'VERIFICAR_AUSENCIA', 'MARCAR_AUTH_ELIMINADA_SQL', 'FINALIZAR_SQL_ENDURECIDA']);
});
test('temporal, reautenticación pendiente, dependencias y certificado pendiente bloquean', async () => {
  for (const options of [{ permanent: false }, { reauthenticated: false }, { assignment: 1 }, { certified: false }]) {
    const h = harness(undefined, options); const r = await h.run();
    assert.equal(r.error, 'PRECONDICIONES_NO_ACREDITADAS'); assert.equal(h.w.deleted.length, 0); assert.equal(h.w.audits.size, 0);
  }
});
test('fallo antes de Auth o en autorización no ejecuta borrado', async () => {
  const h = harness(undefined, { failAt: 'CERTIFICAR_Y_AUTORIZAR_INICIO_SQL' });
  assert.equal((await h.run()).error, 'REQUIERE_REVISION'); assert.equal(h.w.deleted.length, 0);
});
test('Auth incierta no reintenta ni finaliza por ausencia no acreditada', async () => {
  const h = harness(undefined, { authUncertain: true });
  assert.equal((await h.run()).error, 'REQUIERE_REVISION');
  assert.equal((await h.run()).error, 'REQUIERE_REVISION'); assert.equal(h.w.deleted.length, 1); assert.equal(h.w.audits.size, 0);
});
test('Auth lanza error y no registra éxito', async () => {
  const h = harness(undefined, { failAt: 'ELIMINAR_AUTH_SIMULADO' });
  assert.equal((await h.run()).error, 'REQUIERE_REVISION'); assert.equal(h.w.audits.size, 0);
});
test('Auth eliminada y auditoría fallida: recuperación finaliza sin doble eliminación', async () => {
  const h = harness(undefined, { auditFailure: true });
  const first = await h.run(); assert.equal(first.error, 'REQUIERE_REVISION'); assert.equal(h.w.audits.size, 0);
  const recovered = await h.run(); assert.equal(recovered.resultado_simulado, 'COMPLETADA');
  assert.equal(h.w.deleted.length, 1); assert.equal(h.w.audits.size, 1);
  const repeated = await h.run(); assert.equal(repeated.repetida, true);
  assert.equal(h.w.deleted.length, 1); assert.equal(h.w.audits.size, 1);
});
test('operación repetida con contenido distinto bloquea', async () => {
  const h = harness(); await h.run(); const r = await h.run({ ...input(), motivo: 'Otro motivo que cambia' });
  assert.equal(r.error, 'PRECONDICIONES_NO_ACREDITADAS'); assert.equal(h.w.deleted.length, 1);
});
test('ausencia Auth no certifica operación con historial false', async () => {
  const h = harness(undefined, { auditFailure: true }); await h.run();
  h.w.operations.get(R).conservacion_historica_certificada = false;
  assert.equal((await h.run()).error, 'REQUIERE_REVISION'); assert.equal(h.w.audits.size, 0);
});
test('dos administradores intentan eliminarse: reserva simulada protege ambos papeles', async () => {
  const w = world(); let release; const gate = new Promise(resolve => { release = resolve; });
  let arrived; const started = new Promise(resolve => { arrived = resolve; });
  const a = harness(w, { actor: A, targetAdmin: true, beforeAuth: async () => { arrived(); await gate; } });
  const b = harness(w, { actor: B, targetAdmin: true });
  const first = a.run(input(B)); await started;
  const second = await b.run(input(A, S)); assert.equal(second.error, 'REQUIERE_REVISION');
  release(); assert.equal((await first).resultado_simulado, 'COMPLETADA');
  assert.deepEqual(w.deleted, [B]); assert.equal(w.admins.size, 1);
});
test('fallo al persistir revisión se informa sin inventar registro', async () => {
  const h = harness(undefined, { authUncertain: true, failAt: 'REGISTRAR_REVISION_SQL' });
  const r = await h.run(); assert.equal(r.error, 'REQUIERE_REVISION'); assert.equal(r.revision_registrada, false);
});
test('execute real bloquea incondicionalmente, sin invocar dependencias', async () => {
  const forbidden = async () => { throw new Error('no llamar'); };
  const c = createDeletionCoordinator({ authenticate: forbidden, inspect: forbidden, verifyRecentIdentity: forbidden, enabled: true });
  const r = await c.execute({ input: input(), enabled: true });
  assert.equal(r.error, 'ELIMINACION_REAL_DESHABILITADA'); assert.equal(r.eliminacion_ejecutada, false);
});
test('AUTH_ELIMINADA sin certificado no puede finalizar aunque ambas cuentas estén ausentes', async () => {
  const h = harness(undefined, { auditFailure: true }); await h.run();
  const op = h.w.operations.get(R); op.state = 'AUTH_ELIMINADA'; op.conservacion_historica_certificada = false;
  const before = h.w.events.filter(event => event === 'FINALIZAR_SQL_ENDURECIDA').length;
  assert.equal((await h.run()).error, 'REQUIERE_REVISION');
  assert.equal(h.w.events.filter(event => event === 'FINALIZAR_SQL_ENDURECIDA').length, before);
  assert.equal(h.w.audits.size, 0);
});
test('una operación de otro actor no permite ni finalizar ni marcar su revisión', async () => {
  const h = harness(undefined, { authUncertain: true }); await h.run();
  h.w.operations.get(R).actor_id = B;
  const before = h.w.events.filter(event => event === 'REGISTRAR_REVISION_SQL').length;
  assert.equal((await h.run()).error, 'PRECONDICIONES_NO_ACREDITADAS');
  assert.equal(h.w.events.filter(event => event === 'REGISTRAR_REVISION_SQL').length, before);
  assert.equal(h.w.deleted.length, 1);
});
test('Paso 172: rechazo de certificado por snapshot o referencia desconocida no llega a inicio/Auth', async () => {
  // Se simula la respuesta NEGATIVA del verificador SQL pendiente, no se ejecuta su SQL.
  for (const escenario of ['snapshot faltante', 'snapshot distinto', 'referencia desconocida']) {
    const h = harness(undefined, { certified: false }); const before = clone(h.w.history);
    const r = await h.run(); assert.equal(r.error, 'PRECONDICIONES_NO_ACREDITADAS', escenario);
    assert(!h.w.events.includes('CERTIFICAR_Y_AUTORIZAR_INICIO_SQL'), escenario);
    assert.equal(h.w.deleted.length, 0); assert.deepEqual(h.w.history, before);
  }
});
test('Paso 172: Storage y administrador fuera del alcance inicial no autorizan inicio', async () => {
  for (const options of [{ storage: 1 }, { targetAdmin: true, certified: false }]) {
    const h = harness(undefined, options); const r = await h.run(input(options.targetAdmin ? B : T));
    assert.equal(r.error, 'PRECONDICIONES_NO_ACREDITADAS');
    assert(!h.w.events.includes('ELIMINAR_AUTH_SIMULADO')); assert.equal(h.w.audits.size, 0);
  }
});


test('Paso 186: solicitud pendiente y aviso sobreviven íntegros al flujo exclusivamente simulado', async () => {
  const h = harness(); const before = clone(h.w.history);
  assert.equal((await h.run()).resultado_simulado, 'COMPLETADA');
  assert(!h.w.users.has(T)); assert.deepEqual(h.w.history, before);
  assert.equal(h.w.history.solicitudes[0].estado, 'pendiente');
  assert.equal(h.w.history.solicitudes[0].creada_por, T);
  assert.equal(h.w.history.solicitudes[0].creador_nombre_snapshot, 'Pablo Gamboa');
  assert.equal(h.w.history.avisos[0].solicitud_id, S);
  assert.equal(h.w.audits.size, 1);
});

test('Paso 186: pérdida del aviso o cambio automático de estado impiden finalizar en la simulación', async () => {
  for (const corrupt of [w => { w.history.avisos = []; }, w => { w.history.solicitudes[0].estado = 'aprobada'; },
    w => { w.history.solicitudes[0].creador_nombre_snapshot = ''; }, w => { w.history.auditoriasPrevias = []; }]) {
    const w = world(); const h = harness(w, { beforeAuth: async () => corrupt(w) });
    assert.equal((await h.run()).error, 'REQUIERE_REVISION'); assert.equal(w.audits.size, 0);
    assert(!w.events.includes('FINALIZAR_SQL_ENDURECIDA'));
  }
});

test('Paso 186: servicios reales listan, buscan, abren y envían revisión tras desaparición simulada del creador', async () => {
  for (const aprobar of [true, false]) {
    const h = harness(); await h.run(); const before = clone(h.w.history); const calls = [];
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: A } } }) },
      from(table) {
        assert.equal(table, 'solicitudes_reactivas');
        let filtered = h.w.history.solicitudes;
        const q = {
          select(columns) { assert(!columns.includes('usuarios!')); return q; },
          eq(key, value) { filtered = filtered.filter(r => r[key] === value); return q; },
          or(filter) { assert(filter.includes('creador_nombre_snapshot.imatch.')); calls.push(filter); return q; },
          order() { return q; },
          async range() { return { data: clone(filtered), count: filtered.length, error: null }; },
          async single() { return { data: clone(filtered[0]), error: null }; },
        }; return q;
      },
      async rpc(name, params) {
        calls.push({ name, params });
        if (name === 'listar_avisos_solicitudes') return { data: h.w.history.avisos.map(a => ({ ...a,
          solicitado_por: h.w.history.solicitudes[0].creador_nombre_snapshot, estado_solicitud: 'pendiente' })), error: null };
        assert.equal(name, 'solicitud_reactiva_decidir');
        // Contrato RPC simulado, no ejecución ni prueba de su SQL/RLS/notificación real.
        return { data: [{ solicitud_id: S, estado_solicitud: aprobar ? 'aprobada' : 'rechazada',
          mantencion_reactiva_id: aprobar ? R : null }], error: null };
      },
    };
    const context = vm.createContext({ window: { supabaseClient: client }, state: { currentUser: { id: A, role: 'ADMINISTRADOR' } },
      esAdminOperativoActual: () => true, revalidarPrivilegioParaEscritura: async () => true });
    for (const file of ['js/services/solicitudes.service.js', 'js/services/avisosSolicitudes.service.js'])
      vm.runInContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
    const service = context.window.SolicitudesService;
    const listed = await service.listar(0, { estado: 'pendiente', busqueda: 'Pablo Gamboa' });
    assert.equal(listed.total, 1); assert.equal((await service.obtener(S)).creador_nombre_snapshot, 'Pablo Gamboa');
    const view = readFileSync(new URL('../js/views/solicitudes.js', import.meta.url), 'utf8');
    vm.runInContext(view.slice(view.indexOf('function solicitudesNombre('), view.indexOf('\n}', view.indexOf('function solicitudesNombre(')) + 2), context);
    assert.equal(context.solicitudesNombre(listed.registros[0]), 'Pablo Gamboa');
    const avisos = await context.window.AvisosSolicitudesService.listar();
    assert.equal(avisos.length, 1); assert.equal(avisos[0].solicitado_por, 'Pablo Gamboa');
    assert.deepEqual(h.w.history, before); // Lecturas no cambian solicitud/aviso ni su estado.
    await service.decidir(S, aprobar, aprobar ? '' : 'Rechazo exclusivamente simulado');
    const decision = calls.find(c => c.name === 'solicitud_reactiva_decidir');
    assert.equal(decision.params.p_solicitud_id, S); assert.equal(decision.params.p_aprobar, aprobar);
    assert(!Object.values(decision.params).includes(T)); // Revisa el administrador, no exige perfil creador en JS.
    assert.deepEqual(h.w.history, before);
  }
});


test('Paso 189: guarda final ausente o negativa bloquea antes de Auth y conserva revisión', async () => {
  for (const options of [{ omitFinalGuard: true }, { finalGuard: false }]) {
    const h = harness(undefined, options); const before = clone(h.w.history);
    assert.equal((await h.run()).error, 'REQUIERE_REVISION');
    assert.equal(h.w.deleted.length, 0); assert.deepEqual(h.w.history, before);
    assert(!h.w.events.includes('ELIMINAR_AUTH_SIMULADO'));
  }
});

test('Paso 189: revocación del actor inmediatamente antes de Auth impide el intento', async () => {
  const w = world(); const h = harness(w, { afterAuthorize: async () => w.users.delete(A) });
  assert.equal((await h.run()).error, 'REQUIERE_REVISION');
  assert.equal(w.deleted.length, 0); assert(!w.events.includes('ELIMINAR_AUTH_SIMULADO'));
});


test('Paso 189: auditoría simulada conserva actor/objetivo/motivo/evidencia y no se duplica al recuperar', async () => {
  const h = harness(undefined, { auditFailure: true }); const request = input();
  assert.equal((await h.run(request)).error, 'REQUIERE_REVISION'); assert.equal(h.w.auditDetails.size, 0);
  assert.equal((await h.run(request)).resultado_simulado, 'COMPLETADA');
  assert.equal((await h.run(request)).repetida, true); assert.equal(h.w.auditDetails.size, 1);
  const audit = h.w.auditDetails.get(R);
  assert.equal(audit.actor_id, A); assert.equal(audit.objetivo_id, T); assert.equal(audit.motivo, request.motivo);
  assert.equal(audit.verificaciones.historial_preservado, true); assert.equal(h.w.deleted.length, 1);
  assert(!JSON.stringify(audit).includes('sesion-sintetica'));
});

test('DEL-FIX-06: servicios filtran diagnóstico sin reintentos ni persistencia', async () => {
  for (const base of ['', 'publicacion/']) {
    for (const escenario of ['valido','incompleto','ajeno','conexion','sin-permiso']) {
      let llamadas = 0;
      const diagnostico = { etapa:'RPC_INICIAR', codigo:'CONTRATOS_SQL_NO_VERIFICABLES', tipo:'POSTGRESQL',
        sqlstate:'P0001', correlacion:R, password:'NO_EXPONER', jwt:'NO_EXPONER', sql:'NO_EXPONER' };
      if(escenario==='incompleto')delete diagnostico.correlacion;
      if(escenario==='ajeno')diagnostico.etapa='SQL_PRIVADO';
      const context=vm.createContext({window:{supabaseClient:{auth:{getUser:async()=>({data:{user:{id:A}}})},functions:{
        invoke:async(name,args)=>{llamadas++;assert.equal(name,'usuario-eliminacion-ejecutar');assert.equal(args.body.operacion_id,R);
          if(escenario==='conexion')throw Error('NO_EXPONER');
          return {data:{error:'REQUIERE_REVISION',operacion_id:S,diagnostico},error:null};}
      }}},console:{log:()=>{throw Error('No logs');}},localStorage:{setItem:()=>{throw Error('No persistir');}},sessionStorage:{setItem:()=>{throw Error('No persistir');}}});
      vm.runInContext(readFileSync(new URL('../'+base+'js/services/usuarios.service.js',import.meta.url),'utf8'),context);
      const service=context.window.UsuariosService;
      service.getMiEstadoAdministrativo=async()=>({es_admin_permanente:escenario!=='sin-permiso'});
      await assert.rejects(service.ejecutarEliminacion(input(),'PASSWORD_SINTETICO'),e=>{
        if(escenario==='valido'){
          assert.deepEqual(Object.keys(e.diagnostico).sort(),['codigo','correlacion','etapa','sqlstate','tipo']);
          assert.equal(e.diagnostico.sqlstate,'P0001');assert.equal(e.operacion_id,S);
        }else assert.equal(e.diagnostico,undefined);
        assert(!JSON.stringify(e).includes('NO_EXPONER'));assert(!JSON.stringify(e).includes('PASSWORD_SINTETICO'));return true;
      });
      assert.equal(llamadas,escenario==='sin-permiso'?0:1);
    }
    const view=readFileSync(new URL('../'+base+'js/views/admin.js',import.meta.url),'utf8');
    assert(view.includes('if (adminGestion === g && err?.diagnostico)'));
    assert(view.includes('error.textContent += ` Diagnóstico:'));
  }
});

test('DEL-FIX-07: frontend descubre sin contraseña ni request nuevo y rechaza respuesta parcial', async()=>{
  for(const base of ['', 'publicacion/']){
    for(const scenario of ['ok','multiple','empty','incomplete','network','unauthorized']){
      let calls=0;
      const op={operacion_id:S,request_id:R,objetivo_id:T,nombre:'Cuenta sintética',motivo:'Motivo suficiente de prueba',fingerprint:'a'.repeat(64),estado:'PREPARADA',intentos_auth:0};
      const context=vm.createContext({window:{supabaseClient:{auth:{getUser:async()=>({data:{user:{id:A}}})},functions:{invoke:async(name,{body})=>{
        calls++;assert.deepEqual(Object.keys(body),['accion']);assert.equal(body.accion,'CONSULTAR_OPERACION');
        if(scenario==='network')throw Error('privado');
        return {data:{resultado:'CONSULTA_OK',eliminacion_ejecutada:false,operaciones:scenario==='empty'?[]:scenario==='multiple'?[op,{...op,operacion_id:B}]:[scenario==='incomplete'?{...op,request_id:null}:op]},error:null};
      }}}}});
      vm.runInContext(readFileSync(new URL('../'+base+'js/services/usuarios.service.js',import.meta.url),'utf8'),context);
      const service=context.window.UsuariosService;service.getMiEstadoAdministrativo=async()=>({es_admin_permanente:scenario!=='unauthorized'});
      if(['incomplete','network','unauthorized'].includes(scenario))await assert.rejects(service.consultarEliminacionesPendientes());
      else {const result=await service.consultarEliminacionesPendientes();assert.equal(result.length,scenario==='multiple'?2:scenario==='empty'?0:1);}
      assert.equal(calls,scenario==='unauthorized'?0:1);
    }
    const view=readFileSync(new URL('../'+base+'js/views/admin.js',import.meta.url),'utf8');
    const readonly=view.slice(view.indexOf('async function adminConsultarEliminacionesPendientes'),view.indexOf('// =================================================='));
    assert(readonly.includes('dialog.showModal()'));assert(readonly.includes('line.textContent'));
    assert(!readonly.includes('ejecutarEliminacion'));assert(!readonly.includes('randomUUID'));assert(!readonly.includes('sessionStorage'));
  }
});

test('DEL-FIX-08: continuación frontend conserva UUID, reconsulta y no reintenta ante red/estado cambiado',async()=>{
  for(const base of ['', 'publicacion/'])for(const scenario of ['ok','network','changed','started','unauthorized']){
    let consults=0,executions=0;
    const op={operacion_id:S,request_id:R,objetivo_id:T,nombre:'Cuenta sintética',motivo:'Motivo suficiente de prueba',fingerprint:'a'.repeat(64),estado:'PREPARADA',intentos_auth:0};
    const c=vm.createContext({window:{supabaseClient:{auth:{getUser:async()=>({data:{user:{id:A}}})},functions:{invoke:async(name,{body})=>{
      if(body.accion==='CONSULTAR_OPERACION'){consults++;return {data:{resultado:'CONSULTA_OK',eliminacion_ejecutada:false,operaciones:[{...op,...(scenario==='changed'?{motivo:'Motivo diferente de prueba'}:scenario==='started'?{estado:'AUTH_EN_CURSO',intentos_auth:1}:{})}]},error:null};}
      executions++;assert.equal(body.accion,'CONTINUAR_PREPARADA');assert.equal(body.operacion_id,S);assert.equal(body.fingerprint,op.fingerprint);
      assert(!('usuario_id'in body));assert(!('motivo'in body));assert(!('request_id'in body));
      if(scenario==='network')throw Error('privado');return {data:{resultado:'COMPLETADA',eliminacion_ejecutada:true,operacion_id:S},error:null};
    }}}}});
    vm.runInContext(readFileSync(new URL('../'+base+'js/services/usuarios.service.js',import.meta.url),'utf8'),c);
    const service=c.window.UsuariosService;service.getMiEstadoAdministrativo=async()=>({es_admin_permanente:scenario!=='unauthorized'});
    if(scenario==='ok')assert.equal((await service.continuarEliminacionPreparada(op,'SINTETICA',op.nombre,true)).resultado,'COMPLETADA');
    else await assert.rejects(service.continuarEliminacionPreparada(op,'SINTETICA',op.nombre,true));
    assert.equal(executions,['ok','network'].includes(scenario)?1:0);assert.equal(consults,scenario==='unauthorized'?0:1);
    const view=readFileSync(new URL('../'+base+'js/views/admin.js',import.meta.url),'utf8');
    const form=view.slice(view.indexOf('function adminConfirmarContinuacionEliminacion'),view.indexOf('// DEL-FIX-07:'));
    assert(form.includes('if(enviada || ocupada'));assert(form.includes("password.value=''"));assert(!form.includes('randomUUID'));
  }
});

test('DEL-FIX-11: frontend muestra solo rechazo SQL permitido y conserva 409 como fallo',async()=>{
  for(const base of ['', 'publicacion/'])for(const rejection of ['REAUTENTICACION_NO_ACREDITADA','P0001_NO_CLASIFICADO','REAUTENTICACION_NO_ACREDITADA\nSQL_PRIVADO']){
    let calls=0;
    const response={error:'REQUIERE_REVISION',operacion_id:S,diagnostico:{etapa:'RPC_INICIAR',codigo:'CONTRATOS_SQL_NO_VERIFICABLES',tipo:'POSTGRESQL',sqlstate:'P0001',correlacion:R,rechazo_sql:rejection,detail:'SQL_PRIVADO',context:'JWT_PRIVADO'}};
    const c=vm.createContext({window:{supabaseClient:{auth:{getUser:async()=>({data:{user:{id:A}}})},functions:{invoke:async()=>{calls++;return {data:null,error:{context:{json:async()=>response}}};}}}}});
    vm.runInContext(readFileSync(new URL('../'+base+'js/services/usuarios.service.js',import.meta.url),'utf8'),c);
    c.window.UsuariosService.getMiEstadoAdministrativo=async()=>({es_admin_permanente:true});
    await assert.rejects(c.window.UsuariosService.ejecutarEliminacion(input(),'SINTETICA'),e=>{
      assert.equal(e.codigo,'REQUIERE_REVISION');assert.equal(e.diagnostico.sqlstate,'P0001');
      assert.equal(e.diagnostico.correlacion,R);assert.equal(e.diagnostico.rechazo_sql,rejection.includes('\n')?undefined:rejection);
      assert(!JSON.stringify(e).includes('PRIVADO'));return true;
    });assert.equal(calls,1);
    const view=readFileSync(new URL('../'+base+'js/views/admin.js',import.meta.url),'utf8');
    assert.equal((view.match(/Rechazo SQL/g)||[]).length,2);
  }
});

test('365 frontend: identidad confirmada anota sin alterar snapshot; evidencia incompleta o ajena se rechaza',async()=>{
  for(const base of ['', 'publicacion/'])for(const scenario of ['ok','active','partial','manipulated','session']){
    let gets=0;
    const c=vm.createContext({window:{supabaseClient:{auth:{getUser:async()=>({data:{user:{id:scenario==='session'&&++gets>1?T:A}}})},functions:{invoke:async()=>({data:{
      contrato:'usuario-identidades-historicas/v2',modulo:'HISTORIAL',eliminacion_ejecutada:false,
      registros_autorizados:scenario==='partial'?[]:[R],identidades:scenario==='active'?[]:[{
        registro_id:R,origen_id:R,referencia_id:T,tipo:'cuenta',nombre_snapshot:'Nombre certificado',cuenta_eliminada:scenario!=='manipulated'}]},error:null})}}}});
    vm.runInContext(readFileSync(new URL('../'+base+'js/services/usuarios.service.js',import.meta.url),'utf8'),c);
    const s=c.window.UsuariosService,row={id:R,revisado_por:T,autor_nombre_snapshot:'Nombre original'};
    if(['partial','manipulated','session'].includes(scenario))await assert.rejects(s.anotarNombresHistoricos('HISTORIAL',[row]));
    else {const [out]=await s.anotarNombresHistoricos('HISTORIAL',[row]);assert.equal(s.nombreParaMostrar(out,'autor_nombre_snapshot'),scenario==='ok'?'Nombre original (cuenta eliminada)':'Nombre original');}
    assert.equal(row.autor_nombre_snapshot,'Nombre original');assert(!row.nombres_historicos);
  }
});
test('365 resumen: exige 46 categorías verificadas y nunca afirma certificación física o permiso',async()=>{
  for(const base of ['', 'publicacion/'])for(const scenario of ['ok','partial','physical','authorized','role']){
    const c=vm.createContext({window:{supabaseClient:{auth:{getUser:async()=>({data:{user:{id:A}}})},functions:{invoke:async()=>{
      const names=Object.keys(c.window.UsuariosService.etiquetasConservacionV2);
      return {data:{contrato:'usuario-eliminacion-resumen/v2',usuario_id:T,comprobado_en:new Date().toISOString(),
        registros:names.slice(0,scenario==='partial'?45:46).map(tabla=>({tabla,cantidad:0})),ficha_laboral:null,
        archivos_propiedad_individual:0,retiros_pendientes:0,migraciones_pendientes:0,
        eliminacion_ejecutada:false,eliminacion_habilitada:scenario==='authorized',puede_eliminar:false,
        conservacion_certificada:false,verificacion_fisica:scenario==='physical'?'confirmada':'pendiente'},error:null};
    }}}}});
    vm.runInContext(readFileSync(new URL('../'+base+'js/services/usuarios.service.js',import.meta.url),'utf8'),c);
    const s=c.window.UsuariosService;s.getMiEstadoAdministrativo=async()=>({es_admin_permanente:scenario!=='role'});
    if(scenario==='ok')assert.equal((await s.consultarResumenConservacion(T)).registros.length,46);
    else await assert.rejects(s.consultarResumenConservacion(T));
  }
});
test('365 compuertas: consultas preceden cierre, ejecución permanece bloqueada y SQL no concede lectura API',()=>{
  const edge=readFileSync(new URL('../supabase/functions/usuario-eliminacion-ejecutar/index.ts',import.meta.url),'utf8');
  const gate=edge.indexOf('if (!ELIMINACION_HABILITADA)');
  for(const action of ['CONSULTAR_OPERACION','CONSULTAR_IDENTIDADES_HISTORICAS','RESUMEN_CONSERVACION_V2'])assert(edge.indexOf("raw.accion === '"+action+"'")<gate);
  assert(edge.includes('ELIMINACION_HABILITADA: boolean = false'));assert(edge.includes('if (occupiedHere) occupied = false'));
  const sql=readFileSync(new URL('../supabase/sql-propuestas/20261113_conservacion_cuentas_revision.sql',import.meta.url),'utf8');
  for(const name of ['usuario_eliminacion_resumen_v2','usuario_eliminacion_identidades_consultar_v2']){
    assert(sql.includes('CREATE FUNCTION public.'+name+'('));assert(sql.includes("'"+name+"'"));
  }
  assert(sql.trimEnd().endsWith('ROLLBACK;')||sql.includes('\nROLLBACK;'));
  for(const base of ['', 'publicacion/']){
    const view=readFileSync(new URL('../'+base+'js/views/admin.js',import.meta.url),'utf8');
    assert(view.includes('consultarResumenConservacion'));assert(view.includes('ADMIN_ELIMINACION_HABILITADA = false'));
  }
});
test('DEL-FIX-12: ojo de continuación reutiliza helper accesible sin perder ni persistir contraseña',()=>{
  for(const base of ['', 'publicacion/']){
    const input={type:'password',value:'CLAVE_SOLO_MEMORIA'};const attrs={};const show={style:{}},hide={style:{}};
    const icon={querySelector:s=>s.includes('show')?show:hide,closest:()=>({setAttribute:(k,v)=>{attrs[k]=v;}})};
    const c=vm.createContext({document:{getElementById:id=>id==='campo'?input:icon}});
    const access=readFileSync(new URL('../'+base+'js/adminAcceso.js',import.meta.url),'utf8');
    vm.runInContext(access.slice(access.indexOf('function togglePasswordVisibility')),c);
    const html=c.adminPasswordEyeHTML('campo','ojo');assert(html.includes('type="button"'));assert(html.includes('aria-controls="campo"'));assert(!html.includes(input.value));
    c.togglePasswordVisibility('campo','ojo');assert.equal(input.type,'text');assert.equal(input.value,'CLAVE_SOLO_MEMORIA');assert.equal(attrs['aria-pressed'],'true');
    c.togglePasswordVisibility('campo','ojo');assert.equal(input.type,'password');assert.equal(attrs['aria-label'],'Mostrar contraseña');assert.equal(input.value,'CLAVE_SOLO_MEMORIA');
    const view=readFileSync(new URL('../'+base+'js/views/admin.js',import.meta.url),'utf8');const start=view.indexOf('function adminConfirmarContinuacionEliminacion');const end=view.indexOf('// DEL-FIX-07:',start);const form=view.slice(start,end);
    assert(form.includes("adminPasswordEyeHTML(password.id, 'admin-continuacion-password-eye')"));
    assert(form.includes("if (password.type === 'text') togglePasswordVisibility"));assert(form.includes('eye.disabled=true'));
    assert(!form.includes('localStorage'));assert(!form.includes('sessionStorage'));assert(form.includes("finally {password.value='';password.type='password'"));
    const css=readFileSync(new URL('../'+base+'css/tailwind.css',import.meta.url),'utf8');assert(css.includes('.pr-12'));
  }
});
