'use strict';
const fs=require('fs'),assert=require('assert/strict'),path=require('path');
const {chromium}=require('playwright');
const fuente=p=>fs.readFileSync(p,'utf8');
async function preparar(browser,width,dark,{contexto=null,pagina=null,cuenta='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',notificaciones=[]}={}){
 const p=pagina || (contexto ? await contexto.newPage() : await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'})),errores=[];
 if(!pagina){await p.route('**/*',r=>r.request().url()==='http://127.0.0.1:7898/'?r.fulfill({body:'<html></html>',contentType:'text/html'}):r.abort());await p.goto('http://127.0.0.1:7898/');}p.on('pageerror',e=>errores.push(e.message));p.setDefaultTimeout(6000);
 if(!pagina)await p.clock.install();
 const html=fuente('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'').replace('auth-pending','');
 await p.setContent(html);
 for(const f of ['css/tailwind.css','css/styles.css','css/ui-system.css'])await p.addStyleTag({content:fuente(f).replace(/@import[^;]+;/g,'')});
 await p.evaluate(({dark,cuenta,notificaciones})=>{
  document.documentElement.classList.toggle('dark',dark);
  window.state={currentUser:{id:cuenta,role:'RECEPCION'}};window.currentView='solicitudes';
  window.esCuentaSinRol=()=>false;window.esAdminOperativoActual=()=>false;window.esAdminPermanenteActual=()=>false;window.hasAccess=()=>true;
  window.uiEncabezadoSeccion=(titulo)=>'<h2>'+titulo+'</h2>';window.openModal=()=>{};
  window.escrituras=[];window.datosNotificaciones=notificaciones;window.canales=[];window.authEventos=[];window.detalles=[];
  window.SolicitudesService={listar:async()=>({registros:[{id:'solicitud',tipo_problema:'Filtración en cocina',ubicacion:'Cocina',estado:'pendiente',urgencia:'alta',creador_nombre_snapshot:'Recepción',descripcion:'Problema registrado por Recepción.',created_at:'2026-10-29T12:00:00Z'}],total:1})};
  window.NotificacionesRevisionService={listar:async()=>structuredClone(datosNotificaciones),marcar:async id=>{escrituras.push(id);datosNotificaciones.find(f=>f.id===id).leida_en='fecha-simulada';}};
  window.supabaseClient={supabaseUrl:'https://proyecto-local.supabase.co',auth:{onAuthStateChange:fn=>authEventos.push(fn)},channel:()=>{const c={on(tipo,f,fn){this.evento=fn;return this;},subscribe(fn){this.estado=fn;fn('SUBSCRIBED');return this;}};canales.push(c);return c;},removeChannel:async()=>{}};
  window.AvisosSolicitudes={abrirCampana:()=>NotificacionesRevision.abrirCampana()};
  window.nueva=(id,motivo,resultado='rechazada')=>({id,solicitud_id:'solicitud-'+id,resultado,motivo,leida_en:null,revisada_en:'2026-10-29T12:00:00Z',solicitud:{tipo_problema:'Filtración en cocina',ubicacion:'Cocina'}});
 },{dark,cuenta,notificaciones});
 await p.addScriptTag({content:fuente('js/views/solicitudes.js')});
 await p.evaluate(()=>{document.getElementById('view-container').innerHTML=renderRequestsView();window.solicitudesAbrirDetalle=(b,i,id)=>detalles.push(id);window.solicitudesSincronizarRevision=async()=>{};});
 await p.clock.runFor(20);
 const s=fuente('js/avisosSolicitudes.js'),inicio=s.indexOf('window.NotificacionesRevision =');
 await p.addScriptTag({content:s.slice(inicio,s.indexOf('// Broadcast público:',inicio))});
 await p.evaluate(()=>NotificacionesRevision.actualizarSesion());await p.clock.runFor(120);
 return {p,errores};
}
async function comprobar(browser,width,dark){
 const {p,errores}=await preparar(browser,width,dark),aviso=p.locator('#revision-solicitud-aviso');
 for(const resultado of ['aprobada','rechazada']){
  await p.evaluate(async resultado=>{datosNotificaciones.unshift(nueva('toast-'+resultado,'Motivo conservado en la campana',resultado));await NotificacionesRevision.sincronizar();},resultado);await p.clock.runFor(40);
  assert.equal(await aviso.getAttribute('role'),'status');assert.equal(await aviso.getAttribute('aria-modal'),null);
  assert.match(await aviso.textContent(),/Filtración en cocina/);assert.match(await aviso.textContent(),/Administración/);
  assert.equal(await aviso.evaluate(el=>el.classList.contains('alm-revision-toast-rechazo')),resultado==='rechazada');
  assert.equal(await p.evaluate(()=>document.getElementById('app').inert),false);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.clock.runFor(1800);assert.equal(await aviso.count(),1);await p.clock.runFor(250);assert.equal(await aviso.count(),0);
  assert.equal(await p.evaluate(()=>escrituras.length),0);
 }
 assert.equal(await p.locator('#topbar-notif-badge').textContent(),'2');
 assert.equal(await p.evaluate(()=>datosNotificaciones.filter(f=>f.leida_en===null).length),2);
 assert.equal(errores.length,0);await p.close();
 console.log('PASS toast no intrusivo,2 segundos,campana intacta '+width+' '+(dark?'oscuro':'claro'));
}
async function persistencia(browser){
 const cuentaA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',cuentaB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const id=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
 const fila=n=>({id:id(n),solicitud_id:'misma-solicitud',resultado:'rechazada',motivo:'Motivo confidencial de prueba',leida_en:null,solicitud:{tipo_problema:'Nombre privado'}});
 const clave=u=>'hotel-rechazos-mostrados-v1:proyecto-local.supabase.co:'+u;
 let contexto=await browser.newContext({viewport:{width:393,height:900}});
 let {p}=await preparar(browser,393,false,{contexto,cuenta:cuentaA,notificaciones:[fila(1)]});
 async function recargar(datos,cuenta=cuentaA){await p.reload();await preparar(browser,393,false,{pagina:p,cuenta,notificaciones:datos});}
 async function nueva(n){await p.evaluate(async f=>{datosNotificaciones.unshift(f);await NotificacionesRevision.sincronizar();},fila(n));await p.clock.runFor(40);}
 async function noAviso(){assert.equal(await p.locator('#revision-solicitud-aviso').count(),0);}
 assert.equal(await p.locator('#revision-solicitud-aviso').count(),1);
 const registro=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),clave(cuentaA));
 assert.deepEqual(registro.map(f=>f[0]),[id(1)]);assert(registro.every(f=>f.length===2&&typeof f[1]==='number'));
 await p.locator('[data-revision-cerrar]').click();await recargar([fila(1)]);await noAviso();
 assert.equal(await p.locator('#topbar-notif-badge').textContent(),'1');assert.equal(await p.evaluate(()=>datosNotificaciones[0].leida_en),null);assert.equal(await p.evaluate(()=>escrituras.length),0);
 await nueva(2);assert.equal(await p.locator('#revision-solicitud-aviso').count(),1);await p.clock.runFor(2100);await noAviso();await recargar([fila(2),fila(1)]);await noAviso();
 await nueva(3);await p.getByRole('button',{name:'Ver solicitud',exact:true}).click();await p.clock.runFor(40);assert.deepEqual(await p.evaluate(()=>escrituras),[id(3)]);await recargar([fila(3),fila(2),fila(1)]);await noAviso();
 await p.evaluate(async()=>{currentView='configuracion';NotificacionesRevision.actualizarSesion();currentView='solicitudes';await NotificacionesRevision.sincronizar();window.dispatchEvent(new Event('online'));authEventos.forEach(fn=>fn('TOKEN_REFRESHED',{user:{id:state.currentUser.id}}));canales.at(-1).estado('CHANNEL_ERROR');});await p.clock.runFor(3500);await noAviso();
 // Otro usuario del mismo navegador no hereda las supresiones de A.
 await recargar([fila(1)],cuentaB);assert.equal(await p.locator('#revision-solicitud-aviso').count(),1);await p.locator('[data-revision-cerrar]').click();assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).length,clave(cuentaB)),1);
 await recargar([fila(3),fila(2),fila(1)]);await noAviso();
 // Esperar detrás de otro modal nunca persiste el ID antes de verlo.
 await p.evaluate(()=>{const el=document.createElement('div');el.id='modal-persistencia';el.setAttribute('role','dialog');el.style.cssText='position:fixed;inset:0';document.body.appendChild(el);});await nueva(4);await p.clock.runFor(8000);await noAviso();
 assert(!(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).map(f=>f[0]),clave(cuentaA))).includes(id(4)));
 await recargar([fila(4),fila(3),fila(2),fila(1)]);assert.equal(await p.locator('#revision-solicitud-aviso').count(),1);await p.locator('[data-revision-cerrar]').click();await recargar([fila(4),fila(3),fila(2),fila(1)]);await noAviso();
 // Reapertura de contexto con almacenamiento durable, sin sesiones reales.
 const almacen=await contexto.storageState();await contexto.close();contexto=await browser.newContext({storageState:almacen,viewport:{width:393,height:900}});
 ({p}=await preparar(browser,393,false,{contexto,cuenta:cuentaA,notificaciones:[fila(4),fila(3),fila(2),fila(1)]}));await noAviso();await contexto.close();
 console.log('PASS persistencia: X/F5, 2 s/F5, detalle, navegación/reconexión, evento nuevo de misma solicitud, cuentas aisladas, espera y reapertura');
 // Datos dañados, cuota/bloqueo y límite no rompen la presentación ni la campana.
 contexto=await browser.newContext();({p}=await preparar(browser,393,false,{contexto,cuenta:cuentaA}));
 await p.evaluate(k=>localStorage.setItem(k,'{dañado'),clave(cuentaA));await nueva(5);assert.equal(await p.locator('#revision-solicitud-aviso').count(),1);await p.locator('[data-revision-cerrar]').click();assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k))[0][0],clave(cuentaA)),id(5));
 const exceso=Array.from({length:2005},(_,n)=>['22222222-2222-4222-8222-'+String(n).padStart(12,'0'),Date.now()-100000+n]);
 await p.evaluate(({k,datos})=>localStorage.setItem(k,JSON.stringify(datos)),{k:clave(cuentaA),datos:exceso});await nueva(6);await p.locator('[data-revision-cerrar]').click();
 const acotado=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),clave(cuentaA));assert.equal(acotado.length,2000);assert(acotado.some(f=>f[0]===id(6)));assert(!acotado.some(f=>f[0]===exceso[0][0]));
 await p.evaluate(()=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(k){if(k.startsWith('hotel-rechazos'))throw new DOMException('Bloqueado');return get.call(this,k);};Storage.prototype.setItem=function(k,v){if(k.startsWith('hotel-rechazos'))throw new DOMException('Cuota');return set.call(this,k,v);};});
 await nueva(7);await p.locator('[data-revision-cerrar]').click();await p.evaluate(()=>NotificacionesRevision.sincronizar());await p.clock.runFor(40);await noAviso();assert.equal(await p.evaluate(()=>escrituras.length),0);await contexto.close();
 console.log('PASS almacenamiento: JSON inválido recuperado, 2000 IDs máximos, depuración y fallo de lectura/escritura con fallback en memoria');
}
async function main(){const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{await persistencia(b);for(const w of [393,1440])for(const d of [false,true])await comprobar(b,w,d);}finally{await b.close();}}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

module.exports={preparar};
