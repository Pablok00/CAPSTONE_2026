'use strict';
const {chromium}=require('playwright'),assert=require('assert/strict');
const {preparar,completar}=require('./harness_reactiva_eliminacion_ui');
const {fuente}=require('./harness_reactiva_eliminacion');
async function main(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {
  for(const origen of ['solicitudes','reactiva']) {
   const {page,errores}=await preparar(browser,{origen,estado:'cerrada'});
   await page.getByRole('button',{name:'Cancelar',exact:true}).last().click();
   await page.evaluate(origen=>{
    window.lecturas=0;window.paginas=[];
    supabaseClient.auth.onAuthStateChange=()=>{};supabaseClient.removeChannel=async()=>{};
    supabaseClient.channel=()=>({on(tipo,filtro,fn){window.recibir=fn;return this;},subscribe(fn){fn('SUBSCRIBED');return this;},send:async()=> 'ok'});
    window.esCuentaSinRol=()=>false;
    const raiz=document.getElementById(origen==='solicitudes'?'solicitudes-vista':'reactiva-vista');
    const c=origen==='solicitudes'?solicitudesContextos.get(raiz):reactivaContextos.get(raiz);
    c.pagina=1;
    if(origen==='reactiva'){c.grupo='finalizadas';c.busqueda='Filtración';document.getElementById('reactiva-busqueda').value='Filtración';}
    const fila=origen==='solicitudes'?solicitud:registro;
    const listar=async(pagina,opciones)=>{paginas.push({pagina,opciones});return {registros:[{...fila,id:'44444444-4444-4444-4444-444444444444'}],total:40};};
    const obtener=async(id,opciones)=>{lecturas++;if(window.errorRed)throw Error('Red simulada');return window.ausente?null:fila;};
    if(origen==='solicitudes'){SolicitudesService.listar=listar;SolicitudesService.obtener=obtener;}
    else {MantencionesReactivasService.listar=listar;MantencionesReactivasService.obtener=obtener;}
   },origen);
   const fuenteSync=fuente('js/avisosSolicitudes.js');await page.addScriptTag({content:fuenteSync.slice(fuenteSync.indexOf('window.SolicitudesSincronizacion ='))});
   await page.evaluate(()=>SolicitudesSincronizacion.actualizarSesion());await page.waitForFunction(()=>lecturas===1);
   assert.equal(await page.locator(origen==='solicitudes'?'#solicitudes-detalle-modal':'#reactiva-ficha-modal').isVisible(),true);
   // No cerrar una ficha distinta ni inferir ausencia de errores de lectura.
   await page.evaluate(()=>{window.errorRed=true;recibir({payload:{v:1}});});await page.waitForFunction(()=>lecturas===2);
   assert.equal(await page.locator(origen==='solicitudes'?'#solicitudes-detalle-modal':'#reactiva-ficha-modal').isVisible(),true);
   await page.evaluate(()=>{window.errorRed=false;window.ausente=true;recibir({payload:{v:1}});});
   await page.waitForFunction(origen=>!document.getElementById(origen==='solicitudes'?'solicitudes-detalle-modal':'reactiva-ficha-modal'),origen);
   const consultas=await page.evaluate(()=>paginas);
   assert(consultas.every(p=>p.pagina===1));
   if(origen==='reactiva')assert(consultas.every(p=>p.opciones.grupo==='finalizadas'&&p.opciones.busqueda==='Filtración'));
   const aviso=page.locator(origen==='solicitudes'?'[data-solicitudes-confirmacion]':'[data-reactiva-estado]');assert.match(await aviso.textContent(),/La ficha ya no está disponible/);
   assert.equal(await page.evaluate(()=>llamadas.length),0);assert.deepEqual(errores,[]);
   await page.evaluate(()=>SolicitudesSincronizacion.detener());await page.close();
   console.log('PASS '+origen+': lectura fiable, error sin cierre, cierre por ausencia, página/filtros conservados, cero eliminaciones');
  }
  const {page,errores}=await preparar(browser,{origen:'solicitudes'});
  await page.evaluate(()=>{window.senales=0;window.SolicitudesSincronizacion={emitirConfirmada:async()=>{senales++;return false;}};});
  await completar(page);await page.getByRole('button',{name:'Eliminar definitivamente',exact:true}).click();
  await page.waitForFunction(()=>document.body.textContent.includes('no se pudo avisar'));
  assert.equal(await page.evaluate(()=>llamadas.length),1);assert.equal(await page.evaluate(()=>senales),1);
  assert.match(await page.locator('[data-solicitudes-confirmacion]').textContent(),/Eliminación definitiva confirmada/);
  assert.deepEqual(errores,[]);await page.close();
  console.log('PASS eliminación simulada confirmada con Broadcast fallido conserva éxito, refresco y una sola RPC');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
