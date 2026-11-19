'use strict';
// Solo seis casos de carga; fixture local existente, red bloqueada, sin eliminaciones.
const {chromium}=require('playwright'),assert=require('assert/strict');
const {preparar,completar}=require('./harness_reactiva_eliminacion_ui');
async function reabrirPendiente(page,origen) {
  await page.getByRole('button',{name:'Cancelar',exact:true}).last().click();
  await page.evaluate(origen=>{
    window.prepararOriginal=SolicitudesService.prepararEliminacion.bind(SolicitudesService);
    SolicitudesService.prepararEliminacion=async contexto=>{
      const datos=await prepararOriginal(contexto);
      return new Promise((resolve,reject)=>{window.resolverCarga=()=>resolve(datos);window.rechazarCarga=reject;});
    };
    window.lecturaPendiente=origen==='reactiva'?reactivaEliminarActual():solicitudesEliminarActual();
  },origen);
  await page.waitForFunction(()=>typeof resolverCarga==='function');
}
async function main() {
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const paginas=[];
  try {
    const a=await preparar(browser,{origen:'solicitudes'});paginas.push(a);
    await reabrirPendiente(a.page,'solicitudes');
    const aviso=await a.page.locator('[data-eliminacion-mensaje] span').evaluate(el=>({clip:getComputedStyle(el).clipPath,ancho:el.getBoundingClientRect().width,alto:el.getBoundingClientRect().height}));
    assert.equal(aviso.clip,'inset(50%)');assert(aviso.ancho<=1&&aviso.alto<=1);
    await a.page.evaluate(async()=>{resolverCarga();await lecturaPendiente;});
    assert.doesNotMatch(await a.page.locator('[data-eliminacion-mensaje]').textContent(),/Consultando/);
    console.log('PASS 1: carga normal solo accesible, sin texto visible');

    const b=await preparar(browser,{origen:'reactiva'});paginas.push(b);
    await reabrirPendiente(b.page,'reactiva');
    assert.equal(await b.page.getByRole('button',{name:'Cancelar',exact:true}).last().isEnabled(),true);
    assert.equal(await b.page.getByRole('button',{name:'Eliminar definitivamente',exact:true}).isDisabled(),true);
    await b.page.evaluate(()=>solicitudesConfirmarEliminacion({preventDefault(){}}));
    assert.equal(await b.page.evaluate(()=>llamadas.length),0);
    await b.page.keyboard.press('Escape');await b.page.mouse.click(1,1);
    assert.equal(await b.page.getByRole('dialog',{name:'Eliminación definitiva'}).isVisible(),true);
    console.log('PASS 2: consulta pendiente bloquea eliminación y conserva UX-02');
    await b.page.getByRole('button',{name:'Cancelar',exact:true}).last().click();
    assert.equal(await b.page.getByRole('dialog',{name:'Eliminación definitiva'}).count(),0);
    console.log('PASS 3: Cancelar funciona con conexión lenta');

    await a.page.getByRole('button',{name:'Cancelar',exact:true}).last().click();
    await a.page.evaluate(()=>{
      window.lecturas=0;
      SolicitudesService.prepararEliminacion=async contexto=>{
        lecturas++;
        if(lecturas===1)throw new Error('Historial desconocido simulado');
        return prepararOriginal(contexto);
      };
      window.lecturaFallida=solicitudesEliminarActual();
    });
    await a.page.evaluate(()=>lecturaFallida);
    assert.match(await a.page.locator('[data-eliminacion-mensaje]').textContent(),/Historial desconocido/);
    assert.equal(await a.page.getByRole('button',{name:'Eliminar definitivamente',exact:true}).isDisabled(),true);
    await a.page.getByRole('button',{name:'Volver a consultar',exact:true}).click();
    await a.page.waitForFunction(()=>solicitudesEliminacion.lista);
    assert.equal(await a.page.evaluate(()=>lecturas),2);
    assert.equal(await a.page.evaluate(()=>llamadas.length),0);
    assert.equal(await a.page.getByRole('button',{name:'Volver a consultar',exact:true}).isVisible(),false);
    console.log('PASS 4: fallo bloquea y reintento manual solo repite lectura');

    await b.page.evaluate(async()=>{
      SolicitudesService.prepararEliminacion=prepararOriginal;
      await reactivaEliminarActual();
      window.nuevoDialogo=solicitudesEliminacion.dialogo;
      window.htmlNuevo=nuevoDialogo.innerHTML;
      resolverCarga();await lecturaPendiente;
    });
    assert.equal(await b.page.evaluate(()=>solicitudesEliminacion.dialogo===nuevoDialogo&&nuevoDialogo.innerHTML===htmlNuevo),true);
    assert.equal(await b.page.evaluate(()=>llamadas.length),0);
    console.log('PASS 5: respuesta cancelada no modifica el nuevo diálogo');

    const c=await preparar(browser,{origen:'reactiva',ciclos:[{numero_ciclo:1}]});paginas.push(c);
    await completar(c.page);
    assert.equal(await c.page.locator('[name="trabajo"]').isVisible(),true);
    assert.equal(await c.page.getByRole('button',{name:'Eliminar definitivamente',exact:true}).isDisabled(),true);
    await c.page.locator('[name="trabajo"]').check();
    assert.equal(await c.page.getByRole('button',{name:'Eliminar definitivamente',exact:true}).isEnabled(),true);
    assert.equal(await c.page.evaluate(()=>llamadas.length),0);
    console.log('PASS 6: ciclos históricos conservan checkbox obligatorio');
    for(const p of paginas)assert.deepEqual(p.errores,[]);
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
