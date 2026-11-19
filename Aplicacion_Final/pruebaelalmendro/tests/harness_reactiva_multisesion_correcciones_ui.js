'use strict';
const {chromium}=require('playwright'),assert=require('assert/strict');
const {preparar}=require('./harness_reactiva_eliminacion_ui');
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  {
   const a=await preparar(browser,{origen:'solicitudes'}),b=await preparar(browser,{origen:'reactiva',estado:'asignada'});
   await a.page.evaluate(()=>{solicitudesCerrarEliminacion();solicitudesCerrarDetalle();});
   await b.page.evaluate(()=>{
    solicitudesCerrarEliminacion();reactivaCerrarFicha();window.filasServidor=[registro];
    MantencionesReactivasService.listar=async()=>({registros:filasServidor,total:filasServidor.length});
    window.esCuentaSinRol=()=>false;supabaseClient.auth.onAuthStateChange=()=>{};supabaseClient.removeChannel=async()=>{};
    supabaseClient.channel=()=>({on(t,f,fn){window.recibirBroadcast=fn;return this;},subscribe(fn){fn('SUBSCRIBED');return this;},send:async()=> 'ok'});
   });
   const fuente=require('./harness_reactiva_eliminacion').fuente('js/avisosSolicitudes.js');
   await b.page.addScriptTag({content:fuente.slice(fuente.indexOf('window.SolicitudesSincronizacion ='))});
   await b.page.evaluate(()=>SolicitudesSincronizacion.actualizarSesion());
   await a.page.exposeFunction('crearBackendSimulado',()=>b.page.evaluate(()=>filasServidor.push({...registro,id:'55555555-5555-5555-5555-555555555555',solicitud_id:'44444444-4444-4444-4444-444444444444'})));
   await a.page.exposeFunction('avisarOtraSesion',()=>b.page.evaluate(()=>{recibirBroadcast({payload:{v:1}});return true;}));
   await a.page.evaluate(()=>{
    Object.defineProperty(crypto,'randomUUID',{value:()=> '66666666-6666-6666-6666-666666666666',configurable:true});
    window.creaciones=0;window.SolicitudesSincronizacion={emitirConfirmada:async()=>{await avisarOtraSesion();return true;}};
    supabaseClient.rpc=async()=>{creaciones++;await crearBackendSimulado();return {data:[{estado_solicitud:'aprobada',solicitud_id:'44444444-4444-4444-4444-444444444444',mantencion_reactiva_id:'55555555-5555-5555-5555-555555555555'}]};};
    SolicitudesService.listar=async()=>{throw Error('Refresco local fallido simulado');};
   });
   await a.page.getByRole('button',{name:'Nueva solicitud',exact:true}).click();
   const form=a.page.locator('#solicitudes-nueva-modal form');
   for(const [campo,valor] of Object.entries({tipo_problema:'Prueba local',ubicacion:'Local',descripcion:'Creación simulada'}))await form.locator('[name="'+campo+'"]').fill(valor);
   await form.locator('[name="urgencia"]').selectOption('media');await form.getByRole('button',{name:'Registrar y aprobar',exact:true}).click();
   await b.page.waitForFunction(()=>document.querySelectorAll('[data-reactiva-lista] article').length===2);
   assert.equal(await a.page.evaluate(()=>creaciones),1);assert.match(await a.page.locator('[data-solicitudes-estado]').textContent(),/No se pudieron consultar/);
   await b.page.evaluate(()=>{for(let i=0;i<5;i++)recibirBroadcast({payload:{v:1}});});
   assert.equal(await b.page.locator('[data-reactiva-lista] article').count(),2);
   assert.equal(await b.page.evaluate(()=>reactivaContextos.get(document.getElementById('reactiva-vista')).grupo),'activas');
   assert.deepEqual(a.errores,[]);assert.deepEqual(b.errores,[]);
   await b.page.evaluate(()=>SolicitudesSincronizacion.detener());await a.page.close();await b.page.close();
   console.log('PASS A crea una vez, falla su refresco local y B recibe dos tarjetas sin duplicar ni cambiar grupo');
  }
  for(const tardia of [false,true]){
   const {page,errores}=await preparar(browser,{origen:'reactiva',estado:'asignada'});
   await page.getByRole('button',{name:'Cancelar',exact:true}).last().click();
   await page.evaluate(async tardia=>{
    window.TrabajadoresService={getTrabajadores:()=>tardia?new Promise(r=>window.resolverTrabajadores=r):Promise.resolve([])};
    reactivaMostrarPaso('responsable');window.abrirAsignacion=reactivaAbrirAsignacion();if(!tardia)await abrirAsignacion;
    MantencionesReactivasService.obtener=async()=>null;MantencionesReactivasService.listar=async()=>({registros:[],total:0});
    await solicitudesRevalidarInterfazRemota(state.currentUser.id,()=>true);
   },tardia);
   assert.equal(await page.locator('#reactiva-ficha-modal').count(),0);
   assert.equal(await page.evaluate(()=>reactivaDetalle),null);
   assert.equal(await page.locator('[data-reactiva-estado]').textContent(),'La ficha ya no está disponible. Los datos fueron actualizados');
   if(tardia)await page.evaluate(async()=>{resolverTrabajadores([]);await abrirAsignacion;});
   assert.equal(await page.locator('#reactiva-ficha-modal').count(),0);assert.equal(await page.evaluate(()=>llamadas.length),0);assert.deepEqual(errores,[]);await page.close();
   console.log('PASS ficha ausente cierra asignación '+(tardia?'con lectura tardía sin reconstrucción':'abierta sin RPC'));
  }
  for(const incierta of [false,true]){
   const {page,errores}=await preparar(browser,{origen:'reactiva',estado:'asignada'});await page.getByRole('button',{name:'Cancelar',exact:true}).last().click();
   await page.evaluate(async()=>{window.TrabajadoresService={getTrabajadores:async()=>[]};reactivaMostrarPaso('responsable');await reactivaAbrirAsignacion();await solicitudesRevalidarInterfazRemota(state.currentUser.id,()=>true);});
   assert.equal(await page.locator('#reactiva-ficha-modal').isVisible(),true);assert.equal(await page.locator('[data-reactiva-asignacion] textarea').isVisible(),true);
   // Escritura real del flujo, pero servicio simulado y diferido.
   await page.evaluate(incierta=>{
    window.incierta=incierta;window.escriturasAsignacion=0;
    reactivaDetalle.asignacion.elegido='44444444-4444-4444-4444-444444444444';reactivaDetalle.asignacion.trabajadores=[{id:reactivaDetalle.asignacion.elegido}];
    MantencionesReactivasService.asignar=()=>{escriturasAsignacion++;return new Promise((r,j)=>window.resolverEscritura=()=>incierta?j(Error('Respuesta incierta simulada')):r());};
    window.guardarPendiente=reactivaGuardarAsignacion();
   },incierta);
   await page.evaluate(()=>{
    MantencionesReactivasService.obtener=async()=>null;window.esCuentaSinRol=()=>false;
    supabaseClient.auth.onAuthStateChange=()=>{};supabaseClient.removeChannel=async()=>{};
    supabaseClient.channel=()=>({on(t,f,fn){window.recibirPendiente=fn;return this;},subscribe(fn){fn('SUBSCRIBED');return this;},send:async()=> 'ok'});
   });
   const fuentePendiente=require('./harness_reactiva_eliminacion').fuente('js/avisosSolicitudes.js');
   await page.addScriptTag({content:fuentePendiente.slice(fuentePendiente.indexOf('window.SolicitudesSincronizacion ='))});
   await page.evaluate(()=>SolicitudesSincronizacion.actualizarSesion());
   await page.waitForFunction(()=>reactivaDetalle?.invalidada);
   assert.equal(await page.locator('#reactiva-ficha-modal').isVisible(),true);assert.equal(await page.evaluate(()=>reactivaDetalle.invalidada&&reactivaDetalle.escrituraEnCurso),true);
   await page.evaluate(()=>reactivaGuardarAsignacion());assert.equal(await page.evaluate(()=>escriturasAsignacion),1);
   await page.evaluate(async()=>{resolverEscritura();await guardarPendiente;});
   await page.waitForFunction(()=>!document.getElementById('reactiva-ficha-modal'));
   await page.evaluate(()=>SolicitudesSincronizacion.detener());
   assert.equal(await page.locator('#reactiva-ficha-modal').count(),0);
   if(incierta)assert.match(await page.locator('[data-reactiva-estado]').textContent(),/no quedó confirmado/);
   assert.deepEqual(errores,[]);await page.close();
   console.log('PASS ficha existente conserva formulario; ausencia durante RPC bloquea acciones y cierra al terminar ('+(incierta?'incierta':'confirmada')+')');
  }
  {
   const {page,errores}=await preparar(browser,{origen:'solicitudes'});
   await page.getByRole('button',{name:'Cancelar',exact:true}).last().click();
   await page.locator('[data-solicitudes-motivo]').fill('Borrador local de decisión');
   await page.evaluate(async()=>{SolicitudesService.obtener=async()=>null;SolicitudesService.listar=async()=>({registros:[],total:0});await solicitudesRevalidarInterfazRemota(state.currentUser.id,()=>true);});
   assert.equal(await page.locator('#solicitudes-detalle-modal').count(),0);assert.equal(await page.evaluate(()=>llamadas.length),0);
   assert.deepEqual(errores,[]);await page.close();
   console.log('PASS solicitud ausente descarta formulario local sin escritura');
  }
  {
   const {page,errores}=await preparar(browser,{origen:'solicitudes'});
   const entrada='  eliminar   definitivamente  ';
   await page.locator('[name="motivo"]').fill('Motivo focalizado válido');await page.locator('[name="confirmacion"]').fill(entrada);
   assert.equal(await page.getByRole('button',{name:'Eliminar definitivamente',exact:true}).isEnabled(),true);
   assert.equal(await page.locator('[name="confirmacion"]').inputValue(),entrada);
   await page.getByRole('button',{name:'Eliminar definitivamente',exact:true}).click();await page.waitForFunction(()=>llamadas.length===1);
   assert.equal(await page.evaluate(()=>llamadas[0].args.p_confirmacion),'ELIMINAR DEFINITIVAMENTE');assert.deepEqual(errores,[]);await page.close();
   console.log('PASS validación flexible no reescribe input y RPC recibe literal canónico');
  }
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
