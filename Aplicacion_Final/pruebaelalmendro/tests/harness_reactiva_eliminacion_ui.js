'use strict';
// Navegador local aislado: todo el backend es mock, toda red está bloqueada.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const {fuente,solicitudId,mantencionId,usuarioId}=require('./harness_reactiva_eliminacion');
async function verificarBoton(page,boton,destructivo=true) {
  await page.mouse.move(0,0);
  const estilo=await boton.evaluate(el=>{const s=getComputedStyle(el);return {fondo:s.backgroundColor,color:s.color,padding:s.padding,radio:s.borderRadius,alto:el.getBoundingClientRect().height,peso:s.fontWeight};});
  assert.equal(estilo.radio,'12px');assert(estilo.alto>=44);assert.equal(estilo.padding,'12px 18px');assert.equal(estilo.peso,'600');
  if(destructivo){assert.equal(estilo.fondo,'rgb(220, 38, 38)');assert.equal(estilo.color,'rgb(255, 255, 255)');}
  await boton.hover();
  if(destructivo)await page.waitForFunction(el=>getComputedStyle(el).backgroundColor==='rgb(185, 28, 28)',await boton.elementHandle());
  else assert.notEqual(await boton.evaluate(el=>getComputedStyle(el).backgroundColor),estilo.fondo);
  await page.keyboard.press('Tab');await boton.focus();
  assert.equal(await boton.evaluate(el=>el.matches(':focus-visible')),true);
  assert.equal(await boton.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
  await boton.evaluate(el=>el.disabled=true);
  assert.equal(await boton.evaluate(el=>getComputedStyle(el).opacity),'0.5');
  assert.equal(await boton.evaluate(el=>getComputedStyle(el).cursor),'not-allowed');
  await boton.evaluate(el=>el.disabled=false);
  await page.mouse.move(0,0);
  if(destructivo)await page.waitForFunction(el=>getComputedStyle(el).backgroundColor==='rgb(220, 38, 38)'&&getComputedStyle(el).borderColor==='rgb(220, 38, 38)',await boton.elementHandle());
}
async function preparar(browser,{origen='solicitudes',width=393,dark=false,estado='pendiente_asignacion',estadoSolicitud='pendiente',ciclos=[],modo='exito',permanente=true}={}) {
  const page=await browser.newPage({viewport:{width,height:900}}),errores=[];
  page.setDefaultTimeout(8000);
  page.on('pageerror',e=>{errores.push(e.message);console.error('BROWSER',e.message);});
  await page.route('**/*',r=>r.abort());
  await page.setContent('<!doctype html><html><head></head><body><main id="app"></main></body></html>');
  for(const archivo of ['css/tailwind.css','css/styles.css','css/ui-system.css'])await page.addStyleTag({content:fuente(archivo).replace(/@import[^;]+;/g,'')});
  await page.evaluate(({origen,dark,estado,estadoSolicitud,ciclos,modo,permanente,solicitudId,mantencionId,usuarioId})=>{
    document.documentElement.classList.toggle('dark',dark);
    window.state={currentUser:{id:usuarioId,role:'ADMINISTRADOR'}};
    window.currentView=origen==='solicitudes'?'solicitudes':'areas';
    window.activeAreaFilter='workarea_reactiva';window.areaSubVista=null;
    window.permanente=permanente;window.esAdminPermanenteActual=()=>window.permanente;
    window.esAdminOperativoActual=()=>true;window.hasAccess=()=>true;
    window.revalidarPrivilegioParaEscritura=async()=>true;
    window.uiEncabezadoSeccion=(t)=>'<h1>'+t+'</h1>';
    window.openModal=id=>document.getElementById(id).classList.remove('hidden');
    window.solicitud={id:solicitudId,tipo_problema:'Filtración de agua en salón principal',ubicacion:'Hotel · Centro de eventos · Sector de cocina',estado:origen==='reactiva'?'aprobada':estadoSolicitud,creada_por:usuarioId,creador_nombre_snapshot:'Cuenta de prueba',descripcion:'Descripción local sin datos reales',urgencia:'alta',created_at:'2026-10-28T12:00:00Z'};
    window.registro={id:mantencionId,solicitud_id:solicitudId,solicitud:window.solicitud,estado,revision:1,ciclo_actual:1,creada_por:usuarioId,created_at:'2026-10-28T12:00:00Z',asignada_en:null,iniciada_en:null,resuelta_en:null,cerrada_en:null,detalle_ejecucion:null,responsable_trabajador_id:null};
    window.ciclos=ciclos;window.modo=modo;window.eliminada=false;window.llamadas=[];window.refrescos=[];
    window.supabaseClient={auth:{getUser:async()=>({data:{user:{id:state.currentUser.id}}})},rpc:async(nombre,args)=>{
      llamadas.push({nombre,args});await new Promise(r=>setTimeout(r,80));
      if(window.modo==='incierto')throw new Error('Conexión perdida simulada');
      window.eliminada=true;return {data:[{solicitud_eliminada:solicitudId,mantencion_eliminada:origen==='reactiva'?mantencionId:null}],error:null};
    }};
    window.AvisosSolicitudes={sincronizar:async()=>{refrescos.push('avisos');return window.modo!=='refresco';}};
    window.NotificacionesRevision={sincronizar:async()=>{refrescos.push('notificaciones');return true;}};
  },{origen,dark,estado,estadoSolicitud,ciclos,modo,permanente,solicitudId,mantencionId,usuarioId});
  for(const archivo of ['js/services/solicitudes.service.js','js/views/solicitudes.js','js/views/reactiva.js'])await page.addScriptTag({content:fuente(archivo)});
  await page.evaluate(()=>{
    SolicitudesService.obtener=async()=>solicitud;SolicitudesService.vinculo=async()=>null;SolicitudesService.vinculos=async()=>new Map([[solicitud.id,registro.id]]);
    SolicitudesService.listar=async()=>{if(eliminada&&modo==='refresco')throw new Error('Lectura fallida');return {registros:eliminada?[]:[solicitud],total:eliminada?0:1};};
    window.MantencionesReactivasService={
      obtener:async()=>registro,
      historial:async()=>{if(modo==='historial')throw new Error('No se pudieron consultar los ciclos');return {ciclos,eventos:[],trabajadores:new Map()};},
      listar:async()=>({registros:eliminada?[]:[registro],total:eliminada?0:1}),
      trabajadores:async()=>[]
    };
    document.getElementById('app').innerHTML=currentView==='solicitudes'?renderRequestsView():renderMantencionesReactivasView();
  });
  await page.waitForFunction(()=>document.querySelector('[data-solicitudes-lista] article,[data-reactiva-lista] article'));
  if(origen==='reactiva' && estado==='cerrada')await page.getByRole('tab',{name:'Finalizadas',exact:true}).click();
  if(origen==='solicitudes')await page.getByRole('button',{name:'Ver solicitud',exact:true}).click();
  else await page.evaluate(()=>reactivaAbrirFicha(document.querySelector('[data-reactiva-lista] button'),0));
  const boton=page.getByRole('button',{name:origen==='solicitudes'?'Eliminar solicitud':'Eliminar solicitud y mantención',exact:true});
  if(permanente) {
    await verificarBoton(page,boton);
    assert.equal(await boton.locator('svg[aria-hidden="true"]').count(),1);
    if(origen==='reactiva')assert.equal(await boton.evaluate(el=>!!([...el.parentElement.querySelectorAll('summary')].find(s=>s.textContent==='Detalle y observaciones registradas')?.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING) && el.nextElementSibling.querySelector('summary')?.textContent==='Identificadores técnicos'),true);
    if(process.env.FASE3_CAPTURAS)await page.screenshot({path:path.join(process.env.FASE3_CAPTURAS,`ficha-${origen}-${width}-${dark?'oscuro':'claro'}.png`)});
    await boton.click();await page.waitForFunction(()=>!solicitudesEliminacion.cargando);
  }
  return {page,errores,boton};
}
async function completar(page,trabajo=false) {
  await page.locator('[name="motivo"]').fill('  Motivo focalizado de prueba  ');
  await page.locator('[name="confirmacion"]').fill('ELIMINAR DEFINITIVAMENTE');
  if(trabajo)await page.locator('[name="trabajo"]').check();
}
async function main() {
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const salida=process.env.FASE3_CAPTURAS||path.join(os.tmpdir(),'hotel-fase3-capturas');fs.mkdirSync(salida,{recursive:true});
  let grupos=0;
  const estilosReferencia=new Map();
  const variantes=[
    {nombre:'pendiente',origen:'solicitudes',estadoSolicitud:'pendiente',reforzada:false},
    {nombre:'rechazada',origen:'solicitudes',estadoSolicitud:'rechazada',reforzada:false},
    {nombre:'activa-sin-trabajo',origen:'reactiva',estado:'pendiente_asignacion',reforzada:false},
    {nombre:'asignada',origen:'reactiva',estado:'asignada',reforzada:true},
    {nombre:'cerrada',origen:'reactiva',estado:'cerrada',reforzada:true},
    {nombre:'reabierta',origen:'reactiva',estado:'pendiente_asignacion',ciclos:[{numero_ciclo:1}],reforzada:true}
  ];
  try {
    for(const width of [393,1440])for(const dark of [false,true])for(const variante of variantes) {
      const {origen,nombre,reforzada}=variante;
      console.log('UI',width,dark,nombre);
      const {page,errores}=await preparar(browser,{...variante,width,dark});
      const modal=page.getByRole('dialog',{name:'Eliminación definitiva'});
      assert.equal(await modal.isVisible(),true);
      assert.equal(await modal.getByRole('button',{name:'Eliminar definitivamente',exact:true}).isDisabled(),true);
      await page.keyboard.press('Escape');await page.mouse.click(1,1);assert.equal(await modal.isVisible(),true);
      await page.locator('[name="motivo"]').fill('         ');await page.locator('[name="confirmacion"]').fill('ELIMINAR DEFINITIVAMENTE');
      assert.equal(await modal.getByRole('button',{name:'Eliminar definitivamente',exact:true}).isDisabled(),true);
      await completar(page,reforzada);
      assert.equal(await modal.getByRole('button',{name:'Eliminar definitivamente',exact:true}).isEnabled(),true);
      const eliminar=modal.getByRole('button',{name:'Eliminar definitivamente',exact:true}),cancelar=modal.getByRole('button',{name:'Cancelar',exact:true});
      await verificarBoton(page,eliminar);await verificarBoton(page,cancelar,false);
      const medidas=await modal.evaluate(el=>{
        const etiquetas=[...el.querySelectorAll('.alm-delete-form > fieldset > label')];
        const caja=n=>n.getBoundingClientRect();
        const cancelar=caja(el.querySelector('[data-eliminacion-cancelar]')),eliminar=caja(el.querySelector('[type="submit"]'));
        return {separacion:etiquetas.map(l=>{const rango=document.createRange();rango.selectNodeContents(l.firstChild);return caja(l.control).top-rango.getBoundingClientRect().bottom;}),grupos:caja(etiquetas[1]).top-caja(etiquetas[0]).bottom,asociadas:etiquetas.every(l=>l.control?.labels[0]===l),acciones:[cancelar.x,cancelar.y,cancelar.bottom,eliminar.x,eliminar.y],original:!!el.querySelector('fieldset > [type="submit"]') && !!el.querySelector('fieldset + [data-eliminacion-mensaje] + [data-eliminacion-reintentar][hidden] + [data-eliminacion-cancelar]')};
      });
      assert(medidas.separacion.every(n=>n>=8));assert.equal(medidas.grupos,16);assert(medidas.asociadas);assert(medidas.original);
      assert(medidas.acciones[1]>medidas.acciones[4]);
      const diseno=await modal.evaluate(el=>{
        const propiedades=['fontFamily','fontSize','fontWeight','lineHeight','color','backgroundColor','borderColor','borderRadius','padding','marginTop','marginBottom'];
        const selectores=['section','h2','[data-eliminacion-datos]','form','fieldset','textarea','input[name="confirmacion"]','[type="submit"]','[data-eliminacion-mensaje]','[data-eliminacion-cancelar]'];
        const nodos=selectores.map(s=>el.querySelector(s));
        const orden=[el.querySelector('h2'),el.querySelector('[data-eliminacion-datos]'),el.querySelector('section > p'),el.querySelector('fieldset > label'),el.querySelector('textarea'),el.querySelectorAll('fieldset > label')[1],el.querySelector('[name="confirmacion"]'),el.querySelector('[data-eliminacion-reforzada]'),el.querySelector('[type="submit"]'),el.querySelector('[data-eliminacion-mensaje]'),el.querySelector('[data-eliminacion-cancelar]')];
        return {estilos:nodos.map(n=>Object.fromEntries(propiedades.map(p=>[p,getComputedStyle(n)[p]]))),orden:orden.every((n,i)=>i===0||!!(orden[i-1].compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING))};
      });
      assert(diseno.orden,'Orden definitivo de contenido y botones');
      const clave=width+'-'+dark;
      if(estilosReferencia.has(clave))assert.deepEqual(diseno.estilos,estilosReferencia.get(clave),'Mismos estilos compartidos para '+nombre);else estilosReferencia.set(clave,diseno.estilos);
      const estadoVisible=await modal.locator('[data-eliminacion-datos]').textContent();
      assert(estadoVisible.includes('Filtración de agua en salón principal'));assert(estadoVisible.includes('Hotel · Centro de eventos · Sector de cocina'));
      assert(estadoVisible.includes('Solicitud: '+(origen==='reactiva'?'aprobada':variante.estadoSolicitud)));
      assert.equal(estadoVisible.includes('Mantención:'),origen==='reactiva');
      if(origen==='reactiva')assert(estadoVisible.includes('Mantención: '+variante.estado));
      assert.equal(await modal.locator('[name="trabajo"]').isVisible(),reforzada);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
      await page.screenshot({path:path.join(salida,`${nombre}-${width}-${dark?'oscuro':'claro'}-sin-mensaje.png`)});
      await page.locator('[name="confirmacion"]').fill('CONFIRMACIÓN INVÁLIDA');
      assert.match(await modal.locator('[data-eliminacion-mensaje]').textContent(),/Escribe exactamente/);
      const posiciones=await modal.evaluate(el=>['[type="submit"]','[data-eliminacion-mensaje]','[data-eliminacion-cancelar]'].map(s=>{const r=el.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
      assert(posiciones[0].bottom<=posiciones[1].top&&posiciones[1].bottom<=posiciones[2].top,'Mensaje entre Eliminar y Cancelar');
      await page.screenshot({path:path.join(salida,`${nombre}-${width}-${dark?'oscuro':'claro'}-con-mensaje.png`)});
      await page.locator('[name="confirmacion"]').fill('ELIMINAR DEFINITIVAMENTE');
      await page.evaluate(()=>{const b=solicitudesEliminacion.dialogo.querySelector('[type="submit"]');b.click();b.click();});
      await page.waitForFunction(()=>llamadas.length===1);
      assert.equal(await modal.getByRole('button',{name:'Cancelar',exact:true}).isDisabled(),true);
      await page.waitForFunction(()=>!solicitudesEliminacion);
      await page.waitForFunction(()=>document.body.textContent.includes('Eliminación definitiva confirmada'));
      assert.equal(await page.evaluate(()=>llamadas.length),1);
      assert.equal(await page.evaluate(()=>llamadas[0].args.p_confirmar_trabajo_realizado),reforzada);
      assert.deepEqual(await page.evaluate(()=>refrescos.sort()),['avisos','notificaciones']);
      assert.equal(await page.locator('[role="dialog"]').count(),0);
      assert.deepEqual(errores,[]);await page.close();grupos++;
    }
    for(const width of [393,1440])for(const dark of [false,true])for(const caso of ['sin-trabajo','asignada','reabierta']) {
      const reforzada=caso!=='sin-trabajo';
      const {page,errores}=await preparar(browser,{origen:'reactiva',width,dark,estado:caso==='asignada'?'asignada':'pendiente_asignacion',ciclos:caso==='reabierta'?[{numero_ciclo:1}]:[]});
      const modal=page.getByRole('dialog',{name:'Eliminación definitiva'}),checkbox=modal.locator('[name="trabajo"]');
      const contenido=await modal.textContent();
      for(const texto of ['Eliminación definitiva','Filtración de agua en salón principal','Hotel · Centro de eventos · Sector de cocina','Solicitud: aprobada','Mantención:','Esta eliminación es definitiva. Los registros vinculados serán eliminados y no podrán recuperarse desde la aplicación.','Motivo de eliminación (10 a 1000 caracteres)','Escribe exactamente ELIMINAR DEFINITIVAMENTE'])assert(contenido.includes(texto),texto);
      assert.equal(await checkbox.isVisible(),reforzada);
      if(reforzada) {
        assert.equal(await modal.locator('[data-eliminacion-reforzada] p').textContent(),'Esta mantención tiene o ha tenido asignaciones, ejecución o historial de trabajo. Su eliminación definitiva también eliminará los registros operativos vinculados.');
        assert.equal((await checkbox.locator('..').textContent()).trim(),'Confirmo que comprendo que se eliminará una mantención con trabajo asignado, realizado o registrado históricamente.');
      }
      await completar(page);assert.equal(await modal.locator('[type="submit"]').isDisabled(),reforzada);
      if(reforzada)await checkbox.check();
      assert.equal(await modal.locator('[type="submit"]').isEnabled(),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(salida,`confirmacion-${caso}-${width}-${dark?'oscuro':'claro'}.png`)});
      await modal.getByRole('button',{name:'Eliminar definitivamente',exact:true}).click();
      await page.waitForFunction(()=>llamadas.length===1);
      assert.equal(await page.evaluate(()=>llamadas[0].args.p_confirmar_trabajo_realizado),reforzada);
      await page.waitForFunction(()=>!solicitudesEliminacion);
      assert.deepEqual(errores,[]);await page.close();grupos++;
    }
    for(const modo of ['incierto','refresco','historial']) {
      const {page,errores}=await preparar(browser,{origen:modo==='historial'?'reactiva':'solicitudes',modo});
      if(modo==='historial') {assert.match(await page.locator('[data-eliminacion-mensaje]').textContent(),/No se puede iniciar/);assert.equal(await page.evaluate(()=>llamadas.length),0);}
      else {
        await completar(page);await page.getByRole('button',{name:'Eliminar definitivamente',exact:true}).click();
        if(modo==='incierto') {
          await page.waitForFunction(()=>solicitudesEliminacion.incierta);
          assert.match(await page.locator('[data-eliminacion-mensaje]').textContent(),/verifica el estado real/);
          assert.equal(await page.locator('[type="submit"]').last().isDisabled(),true);
          await page.getByRole('button',{name:'Cerrar y verificar el estado'}).click();
          assert.equal(await page.locator('[data-solicitudes-lista] article').count(),0);
        } else {
          await page.waitForFunction(()=>document.body.textContent.includes('La eliminación fue confirmada, pero'));
          await page.getByRole('button',{name:'Volver a consultar',exact:true}).click();
        }
        assert.equal(await page.evaluate(()=>llamadas.length),1);
      }
      assert.deepEqual(errores,[]);await page.close();grupos++;
    }
    {const {page,boton}=await preparar(browser,{permanente:false});assert.equal(await boton.count(),0);await page.close();grupos++;}
    for(const origen of ['solicitudes','reactiva']) {
      const {page,errores}=await preparar(browser,{origen,estado:'cerrada'});
      await page.evaluate(origen=>{
        window.paginas=[];
        const raiz=document.getElementById(origen==='solicitudes'?'solicitudes-vista':'reactiva-vista');
        const c=origen==='solicitudes'?solicitudesContextos.get(raiz):reactivaContextos.get(raiz);
        c.pagina=1;if(origen==='reactiva'){c.grupo='finalizadas';c.busqueda='Filtración';}
        const otro={...(origen==='solicitudes'?solicitud:registro),id:'44444444-4444-4444-4444-444444444444'};
        const listar=async(pagina,opciones)=>{paginas.push({pagina,opciones});return {registros:pagina===1?[]:[otro],total:20};};
        if(origen==='solicitudes')SolicitudesService.listar=listar;else MantencionesReactivasService.listar=listar;
      },origen);
      await completar(page,origen==='reactiva');await page.getByRole('button',{name:'Eliminar definitivamente',exact:true}).click();
      await page.waitForFunction(()=>document.body.textContent.includes('Eliminación definitiva confirmada'));
      assert.deepEqual(await page.evaluate(()=>paginas.map(p=>p.pagina)),[1,0]);
      if(origen==='reactiva')assert.deepEqual(await page.evaluate(()=>paginas[1].opciones),{grupo:'finalizadas',busqueda:'Filtración'});
      assert.deepEqual(errores,[]);await page.close();grupos++;
    }
    console.log(`PASS ${grupos} escenarios Chrome aislado; capturas: ${salida}`);
  } finally {await browser.close();}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={preparar,completar};
