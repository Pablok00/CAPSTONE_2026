'use strict';
// Chrome aislado, Auth/servicios simulados; no se conecta a Supabase.
const fs=require('fs'),assert=require('assert/strict');
const {chromium}=require('playwright');
const fuente=p=>fs.readFileSync(p,'utf8');
function funcion(nombre){const s=fuente('js/app.js'),i=s.indexOf('function '+nombre+'(');return s.slice(i,s.indexOf('\n}',i)+2);}
async function preparar(browser,{modo='ok',width=393,dark=false,pagina=null}={}){
  const page=pagina||await browser.newPage({viewport:{width,height:900}}),errores=[];page.setDefaultTimeout(6000);
  await page.route('**/*',r=>r.request().url()==='http://127.0.0.1:7899/'?r.fulfill({body:'<html></html>',contentType:'text/html'}):r.abort());page.on('pageerror',e=>errores.push(e.message));
  await page.goto('http://127.0.0.1:7899');
  await page.setContent('<html><body class="alm-ui"><button id="nav-admin" onclick="navigateTo(\'admin\')">Panel de Admin</button><div id="page-icon"></div><h1 id="page-title"></h1><p id="page-subtitle"></p><main id="view-container">Vista previa</main></body></html>');
  for(const p of ['css/tailwind.css','css/ui-system.css'])await page.addStyleTag({content:fuente(p).replace(/@import[^;]+;/g,'')});
  await page.evaluate(({modo,dark})=>{
    document.documentElement.classList.toggle('dark',dark);
    window.currentView='dashboard';window.areaSubVista=null;window.activeAreaFilter=null;window.sesionNoVerificable=false;
    window.state={currentUser:{id:'admin-a',name:'Administrador de prueba',role:'ADMINISTRADOR',esAdminPermanente:true}};
    window.modo=modo;window.principalToken='principal-original';window.eventosAuth=[];
    window.lecturas=0;window.intentos=0;window.limpiezas=[];window.opciones=[];window.credenciales=[];
    window.esAdminPermanenteActual=()=>!sesionNoVerificable&&state.currentUser.esAdminPermanente;
    window.esAdminOperativoActual=esAdminPermanenteActual;window.esCuentaSinRol=()=>false;window.esRecepcionRestringida=()=>false;
    window.hasAccess=v=>v!=='admin'||esAdminPermanenteActual();
    window.alert=()=>{};window.toggleMobileSidebar=()=>{};window.updateSidebarBadges=()=>{};window.populateSelectAreas=()=>{};window.updateSidebarVisibility=()=>{};window.closeModal=()=>{};
    window.uiEncabezadoSeccion=()=>'<h2>Panel</h2>';window.renderDashboardView=()=>'<p>Dashboard</p>';
    window.revalidarPrivilegioParaEscritura=async()=>esAdminPermanenteActual();
    window.usuario=()=>({id:state.currentUser.id,email:'cuenta-propia@example.test',app_metadata:{providers:window.modo==='google'?['google']:['email']}});
    window.supabase={createClient:(url,key,opts)=>{
      if(!opts?.auth?.storageKey?.startsWith('hotel-admin-verificacion-'))return window.supabaseClient;
      opciones.push(opts);return {auth:{signInWithPassword:async args=>{
        intentos++;credenciales.push({email:args.email});
        if(window.modo==='lenta')await new Promise(r=>window.resolver=r);
        if(['incorrecta','google'].includes(window.modo))return {error:{code:'invalid_credentials'}};
        if(window.modo==='red')throw new TypeError('Failed to fetch');
        if(window.modo==='limite')return {error:{status:429}};
        const id=window.modo==='otra'?'admin-b':'admin-a';return {data:{user:{id},session:{user:{id}}}};
      },signOut:async opts=>{limpiezas.push(opts.scope);},stopAutoRefresh(){}}};
    }};
    window.supabaseClient={auth:{getUser:async()=>({data:{user:usuario()}}),getSession:async()=>({data:{session:{user:usuario(),access_token:principalToken}}}),
      onAuthStateChange:fn=>{eventosAuth.push(fn);},signInWithPassword:()=>{throw Error('Cliente principal alterado');},signOut:()=>{throw Error('Sesión principal cerrada');}},
      channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel:async()=>{}};
    window.UsuariosService={getUsuarios:async()=>{lecturas++;return [];},getRoles:async()=>{lecturas++;return [];},getAdministracionesTemporales:async()=>{lecturas++;return [];},getMiEstadoAdministrativo:async()=>({es_admin_permanente:true})};
  },{modo,dark});
  await page.addScriptTag({content:fuente('js/config/supabaseClient.js')});
  await page.addScriptTag({content:fuente('js/adminAcceso.js')});
  await page.addScriptTag({content:fuente('js/views/admin.js')});
  await page.addScriptTag({content:funcion('navigateTo')+'\n'+funcion('renderCurrentView')+'\n'+funcion('restaurarNavegacionHistorial')+";window.addEventListener('popstate',restaurarNavegacionHistorial);window.addEventListener('hashchange',restaurarNavegacionHistorial);"});
  return {page,errores};
}
async function abrir(page){await page.evaluate(()=>navigateTo('admin'));await page.locator('#admin-acceso-dialog').waitFor();}
async function enviar(page,password='contraseña-simulada'){await page.locator('[name=password]').fill(password);await page.getByRole('button',{name:'Verificar acceso',exact:true}).click();}
async function main(){
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});let casos=0;
  async function caso(nombre,fn,opts){const {page,errores}=await preparar(browser,opts);try{await fn(page);assert.deepEqual(errores,[]);casos++;console.log('PASS '+nombre);}finally{await page.close();}}
  try{
    await caso('correcta, identidad propia, cliente aislado, sesión principal intacta y sin precarga',async p=>{
      await p.evaluate(()=>{AdminCorreosVerificados.actualizarSesion();cargarPanelAdminDatos();getAdminPanelHTML([],[]);});
      assert.equal(await p.evaluate(()=>lecturas),0);await abrir(p);assert.equal(await p.evaluate(()=>lecturas),0);
      await p.locator('[name=password]').fill('contraseña-simulada');await p.locator('[name=password]').press('Enter');await p.waitForFunction(()=>AdminAcceso.vigente()&&!!document.querySelector('[data-admin-usuarios-lista]'));
      assert.equal(await p.evaluate(()=>principalToken),'principal-original');assert.deepEqual(await p.evaluate(()=>limpiezas),['local']);
      const op=await p.evaluate(()=>opciones[0].auth);assert.equal(op.persistSession,false);assert.equal(op.autoRefreshToken,false);assert.equal(op.detectSessionInUrl,false);
      assert.deepEqual(await p.evaluate(()=>credenciales),[{email:'cuenta-propia@example.test'}]);
      await p.evaluate(()=>renderCurrentView());assert.equal(await p.locator('#admin-acceso-dialog').count(),0);
    });
    for(const [modo,texto] of [['incorrecta','Contraseña incorrecta'],['otra','sesión'],['red','conexión'],['google','solo Google'],['limite','Demasiados intentos']])await caso(modo,async p=>{
      await abrir(p);await enviar(p);await p.waitForFunction(()=>!document.querySelector('[type=submit]').disabled);
      assert.match(await p.locator('[data-acceso-error]').textContent(),new RegExp(texto));assert.equal(await p.evaluate(()=>lecturas),0);assert.equal(await p.evaluate(()=>AdminAcceso.vigente()),false);
    },{modo});
    await caso('vacía, mostrar contraseña, Escape/fondo y cancelación',async p=>{
      await abrir(p);await p.evaluate(()=>document.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true})));
      assert.equal(await p.evaluate(()=>intentos),0);await p.locator('[data-acceso-mostrar]').check();assert.equal(await p.locator('[name=password]').getAttribute('type'),'text');
      await p.keyboard.press('Escape');await p.locator('#admin-acceso-dialog').click({position:{x:2,y:2}});assert.equal(await p.locator('#admin-acceso-dialog').count(),1);
      await p.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(await p.evaluate(()=>currentView),'dashboard');assert.equal(await p.evaluate(()=>lecturas),0);
    });
    await caso('salida, regreso y entrada directa/render bloqueados',async p=>{
      await abrir(p);await enviar(p);await p.waitForFunction(()=>AdminAcceso.vigente());await p.evaluate(()=>navigateTo('dashboard'));await abrir(p);assert.equal(await p.evaluate(()=>AdminAcceso.vigente()),false);
      await p.getByRole('button',{name:'Cancelar',exact:true}).click();await p.evaluate(()=>{currentView='admin';renderCurrentView();});assert.equal(await p.locator('#admin-acceso-dialog').count(),1);
    });
    for(const cambio of ['cancelar','cuenta','privilegio','logout','sesion-misma-cuenta'])await caso('respuesta tardía: '+cambio,async p=>{
      await abrir(p);await enviar(p);await p.waitForFunction(()=>!!window.resolver);
      await p.evaluate(()=>document.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true})));assert.equal(await p.evaluate(()=>intentos),1);
      if(cambio==='cancelar'){await p.getByRole('button',{name:'Cancelar',exact:true}).click();await abrir(p);}
      else await p.evaluate(c=>{if(c==='cuenta'){state.currentUser.id='admin-b';eventosAuth.forEach(fn=>fn('SIGNED_IN',{user:{id:'admin-b'},access_token:'otra-sesion'}));}if(c==='privilegio'){state.currentUser.esAdminPermanente=false;AdminAcceso.revisar();}if(c==='sesion-misma-cuenta')principalToken='sesion-diferente';if(c==='logout')eventosAuth.forEach(fn=>fn('SIGNED_OUT',null));},cambio);
      await p.evaluate(()=>{modo='ok';resolver();});await p.waitForFunction(()=>limpiezas.length===1);assert.equal(await p.evaluate(()=>AdminAcceso.vigente()),false);assert.equal(await p.evaluate(()=>lecturas),0);
    },{modo:'lenta'});
    await caso('sesión expirada',async p=>{await p.evaluate(()=>supabaseClient.auth.getUser=async()=>({error:{status:401}}));await abrir(p);await enviar(p);await p.waitForFunction(()=>!document.querySelector('[type=submit]').disabled);assert.equal(await p.evaluate(()=>intentos),0);assert.equal(await p.evaluate(()=>lecturas),0);});
    await caso('entrada inicial por hash y Atrás/Adelante',async p=>{await p.evaluate(()=>{history.replaceState(null,'','#admin');navigateTo('admin',null,null,true);});assert.equal(await p.evaluate(()=>lecturas),0);await enviar(p);await p.waitForFunction(()=>AdminAcceso.vigente());await p.evaluate(()=>navigateTo('dashboard'));await p.evaluate(()=>history.back());await p.locator('#admin-acceso-dialog').waitFor();assert.equal(await p.evaluate(()=>AdminAcceso.vigente()),false);});
    await caso('recarga descarta el desbloqueo',async p=>{await abrir(p);await enviar(p);await p.waitForFunction(()=>AdminAcceso.vigente());await p.reload();await preparar(browser,{pagina:p});await abrir(p);assert.equal(await p.evaluate(()=>AdminAcceso.vigente()),false);assert.equal(await p.evaluate(()=>lecturas),0);});
    await caso('temporal bloqueado',async p=>{await p.evaluate(()=>{state.currentUser.esAdminPermanente=false;navigateTo('admin');renderAdminView();cargarPanelAdminDatos();AdminCorreosVerificados.actualizarSesion();});assert.equal(await p.locator('#admin-acceso-dialog').count(),0);assert.equal(await p.evaluate(()=>lecturas),0);});
    await caso('renovación normal conserva visita; pérdida de privilegios la limpia',async p=>{await abrir(p);await enviar(p);await p.waitForFunction(()=>AdminAcceso.vigente());await p.evaluate(()=>{principalToken='renovado';eventosAuth.forEach(fn=>fn('TOKEN_REFRESHED',{user:{id:'admin-a'},access_token:principalToken}));});assert.equal(await p.evaluate(()=>AdminAcceso.vigente()),true);await p.evaluate(()=>{state.currentUser.esAdminPermanente=false;AdminAcceso.revisar();});assert.equal(await p.locator('#admin-content').count(),0);assert.equal(await p.evaluate(()=>AdminAcceso.vigente()),false);});
    for(const width of [393,1440])for(const dark of [false,true])await caso(`responsive ${width} ${dark?'oscuro':'claro'}`,async p=>{await abrir(p);const m=await p.locator('#admin-acceso-dialog form').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,w:innerWidth,scroll:el.scrollWidth,client:el.clientWidth};});assert(m.left>=0&&m.right<=m.w&&m.scroll<=m.client);if(process.env.ADMIN_CAPTURAS)await p.screenshot({path:require('path').join(process.env.ADMIN_CAPTURAS,`admin-acceso-${width}-${dark?'oscuro':'claro'}.png`)});await p.locator('[name=password]').focus();assert.equal(await p.locator('[name=password]').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');},{width,dark});
    console.log(`${casos} pruebas focalizadas correctas; cero conexiones backend.`);
  }finally{await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={preparar};
