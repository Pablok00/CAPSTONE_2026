// AUTH-1: ejecuta los scripts reales de login.html con Supabase simulado.
// No se crean cuentas ni se consulta la red.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const base = path.join(__dirname, '..', process.argv.includes('--publicacion') ? 'publicacion' : '');
const html = fs.readFileSync(path.join(base, 'login.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m => !/\bsrc\s*=/i.test(m[1])).map(m => m[2]);
let total = 0;
function check(nombre, condicion) { assert.ok(condicion, nombre); total++; console.log('[PASS] ' + nombre); }
function preparar(auth) {
  const nodos = new Map(), timers = [], logs = [], storage = new Map();
  function nodo(id) {
    if (!nodos.has(id)) {
      const clases = new Set(), atributos = new Map();
      nodos.set(id, { value:'', textContent:'', innerHTML:'', disabled:false, style:{},
        classList: { add(...args) { args.forEach(c=>clases.add(c)); }, remove(...args) { args.forEach(c=>clases.delete(c)); },
          contains(c) { return clases.has(c); }, toggle(c, valor) { if (valor) clases.add(c); else clases.delete(c); } },
        setAttribute(k,v) { atributos.set(k,String(v)); }, getAttribute(k) { return atributos.get(k) ?? null; }, focus() {}, querySelector() { return null; }, closest() { return null; } });
    }
    return nodos.get(id);
  }
  const window = { supabaseClient:{auth}, location:{href:'login.html',replace(url){this.href=url;}}  };
  const contexto = vm.createContext({window,URL,URLSearchParams,document:{getElementById:nodo,addEventListener(){},removeEventListener(){}},
    localStorage:{removeItem(){}},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=> '10000000-0000-4000-8000-000000000099'},
    clearTimeout(){}, setTimeout(fn) {timers.push(fn);return timers.length;}, console:{warn(...args){logs.push(args.join(' '));},error(...args){logs.push(args.join(' '));}} });
  vm.runInContext(fs.readFileSync(path.join(base,'js/config/supabaseClient.js'),'utf8').split('// Destino público documentado;')[1].replace(/^/, '// Destino público documentado;'),contexto);
  const registroPublicoPorDefecto=window.REGISTRO_PUBLICO_UI_HABILITADO;
  // Solo los casos legacy de esta VM habilitan el handler anterior explícitamente.
  window.REGISTRO_PUBLICO_UI_HABILITADO=true;
  vm.runInContext(scripts.find(s=>s.includes('function handleLoginSubmit')),contexto);
  nodo('login-email').value='persona@example.test'; nodo('login-password').value='secreto-solo-memoria';
  return {contexto,nodo,timers,window,logs,storage,registroPublicoPorDefecto};
}
const evento = {preventDefault(){}};
async function main() {
  scripts.forEach((s,i)=>new vm.Script(s,{filename:'login.html:inline-'+i}));
  check('sintaxis de todos los scripts inline',scripts.length>0);
  check('sin scripts, widgets, claves públicas ni referencias CAPTCHA', !/turnstile|captcha|challenges\.cloudflare\.com/i.test(html));
  check('Supabase Auth y cliente existente conservados',html.includes('supabase-js@2')&&html.includes('./js/config/supabaseClient.js'));
  let llamadas=[], resolver;
  const a=preparar({signInWithPassword:args=>{llamadas.push(args);return new Promise(r=>resolver=r);}});
  const p=a.contexto.handleLoginSubmit(evento); await a.contexto.handleLoginSubmit(evento);
  check('login sin token: una solicitud y bloqueo simultáneo',llamadas.length===1&&a.nodo('btn-submit-login').disabled);
  check('login envía exclusivamente correo y contraseña',Object.keys(llamadas[0]).sort().join(',')==='email,password');
  resolver({data:{session:{}},error:null}); await p;
  await a.contexto.handleLoginSubmit(evento);
  check('login mantiene bloqueo hasta redirección',llamadas.length===1&&a.nodo('btn-submit-login').disabled);
  a.timers.forEach(fn=>fn()); check('login redirige al guard existente de index',a.window.location.href==='index.html#dashboard');
  for (const caso of [
    {error:{code:'invalid_credentials',message:'NO EXPONER secreto-solo-memoria'}, esperado:'Revisa tus credenciales'},
    {error:{code:'email_not_confirmed'},esperado:'Confirma tu correo'},
    {error:{status:429},esperado:'Demasiados intentos'},
    {excepcion:true,esperado:'No fue posible conectar'}
  ]) {
    let intentos=0;
    const x=preparar({signInWithPassword:async()=>{intentos++;if(caso.excepcion)throw Error('NO EXPONER secreto-solo-memoria');return {data:null,error:caso.error};}});
    await x.contexto.handleLoginSubmit(evento);
    check('login: error claro '+caso.esperado,x.nodo('auth-alert-text').textContent.includes(caso.esperado)&&!x.nodo('auth-alert-text').textContent.includes('NO EXPONER'));
    await x.contexto.handleLoginSubmit(evento);
    check('login permite reintentar tras error '+caso.esperado,intentos===2&&!x.nodo('btn-submit-login').disabled);
  }
  const invalido=preparar({signUp:()=>{throw Error('No debe llamarse');}});
  check('login sin formulario ni pestaña de registro público', !/id="(?:form-register|tab-register|register-name|register-password)"/.test(html));
  for (const nombre of ['handleRegisterSubmit','ejecutarSignUp','validarFormularioRegistro','switchAuthTab'])
    check('eliminado handler público '+nombre,typeof invalido.contexto[nombre]==='undefined');
  check('login no contiene llamadas signUp', !/\.signUp\s*\(/.test(html));
  invalido.contexto.showRecoverInfo();
  check('recuperación abre formulario real sin mensaje simulado',!invalido.nodo('form-recover').classList.contains('hidden')&&invalido.nodo('form-login').classList.contains('hidden')&&!html.includes('estará disponible próximamente'));
  if (!process.argv.includes('--correo')) {
    await probarCambioPasswordPersonal();
    await probarRecuperacion();
  }
  const destino='https://pruebaelalmendro.vercel.app/login.html';
  let envios=[], resolverCorreo;
  const correo=preparar({resend:args=>{envios.push(args);return new Promise(r=>resolverCorreo=r);}});
  const enviar=()=>correo.window.reenviarCorreoVerificacion('persona@example.test',correo.nodo('reenviar'),correo.nodo('mensaje'));
  const solicitud=enviar();await enviar();
  check('reenvío sin sesión bloquea doble envío y espera confirmación',envios.length===1&&correo.nodo('reenviar').disabled);
  check('reenvío signup usa destino HTTPS público exacto',envios[0].type==='signup'&&envios[0].options.emailRedirectTo===destino);
  resolverCorreo({data:{},error:null});await solicitud;await enviar();
  check('reenvío confirmado es neutral y conserva enfriamiento',envios.length===1&&correo.nodo('mensaje').textContent.includes('Espera'));
  for(const error of [{status:429},{code:'unexpected',message:'NO EXPONER'}]){
    const r=preparar({resend:async()=>({error})});
    await r.window.reenviarCorreoVerificacion('persona@example.test',r.nodo('b'),r.nodo('m'));
    check('error de reenvío sin secretos ni falso éxito '+JSON.stringify(error),!r.nodo('m').textContent.includes('NO EXPONER')&&!r.nodo('m').textContent.includes('recibirás')&&r.nodo('b').disabled);
  }
  const pending={window:{}};vm.createContext(pending);vm.runInContext(fs.readFileSync(path.join(base,'js/views/pendingAccount.js'),'utf8'),pending);
  const sin=pending.window.PendingAccountView.render('persona@example.test',{correoVerificado:false});
  const con=pending.window.PendingAccountView.render('persona@example.test',{correoVerificado:true});
  check('pendiente distingue verificación y aprobación, sin árbol/puerta',sin.includes('Verifica tu correo electrónico')&&sin.includes('Volver a enviar enlace')&&!con.includes('Volver a enviar enlace')&&con.includes('Cuenta pendiente de aprobación')&&!sin.includes('🌳')&&!sin.includes('🚪'));
  let reenviados=0;const mensaje={textContent:''},boton={disabled:false};
  pending.document={getElementById:()=>mensaje};
  pending.window.supabaseClient={auth:{getUser:async()=>({data:{user:{email:'persona@example.test',email_confirmed_at:'2026-11-12'}}})}};
  pending.window.reenviarCorreoVerificacion=async()=>reenviados++;
  await pending.window.PendingAccountView.reenviar(boton);
  check('sesión ya verificada no reenvía y conserva acceso al cierre',reenviados===0&&!boton.disabled&&mensaje.textContent.includes('ya está verificado'));
  const red=preparar({resend:async()=>{throw Error('NO EXPONER');}});
  await red.window.reenviarCorreoVerificacion('persona@example.test',red.nodo('b'),red.nodo('m'));
  check('fallo de red conserva mensaje neutral sin datos internos',red.nodo('m').textContent.includes('conexión')&&!red.nodo('m').textContent.includes('NO EXPONER'));
  check('pendiente conserva estilos para ambos temas y edificio',sin.includes('dark:bg-slate-900')&&sin.includes('rect x="4"'));
  check('errores del enlace se manejan sin imprimir descripción del proveedor',html.includes("fragmento.has('error')")&&html.includes('window.history.replaceState'));
  check('contador visible conserva 60 s y botón bloqueado',correo.nodo('reenviar').disabled&&correo.nodo('reenviar').textContent.includes('01:00'));
  const soloParametro=preparar({resend:async()=>{throw Error('No enviar');}});
  const futuro=Date.now()+61000;vm.runInContext('Date.now = () => '+futuro,soloParametro.contexto);
  let manual=0;soloParametro.window.supabaseClient.auth.resend=async()=>{manual++;return {error:null};};
  await soloParametro.window.reenviarCorreoVerificacion('persona@example.test',soloParametro.nodo('b'),soloParametro.nodo('m'));
  vm.runInContext('Date.now = () => '+(futuro+61000),soloParametro.contexto);soloParametro.window.actualizarContadorCorreo();
  check('contador termina sin reenvío automático',manual===1&&!soloParametro.nodo('b').disabled&&soloParametro.nodo('b').textContent==='Volver a enviar enlace');
  const invitada=pending.window.PendingAccountView.render('persona@example.test',{correoVerificado:false,esInvitacion:true});
  check('invitación pendiente pide administrador sin ofrecer signup resend',invitada.includes('Solicita al Administrador')&&!invitada.includes('data-reenvio-signup'));
  pending.window.supabaseClient.auth.getUser=async()=>({data:{user:{email:'persona@example.test',invited_at:'2026-11-12'}}});
  await pending.window.PendingAccountView.reenviar(boton);
  check('invitado no usa resend signup aunque se invoque el handler',reenviados===0&&mensaje.textContent.includes('No se ha enviado'));
  await probarRegistroInvitado();
  console.log(total+'/'+total+' PASS — AUTH-1 / AUTH-3B / AUTH-2B (solo memoria)');
}

async function probarCambioPasswordPersonal() {
  const fuente = fs.readFileSync(path.join(__dirname, '../js/seguridadPersonal.js'), 'utf8');
  new vm.Script(fuente);
  function escenario(opciones = {}) {
    const correos=[],cambios=[];let listener;
    const identidad=opciones.identidad||'usuario-propio';
    const auth={
      getSession:async()=>({data:{session:opciones.sinSesion?null:{user:{id:identidad}}},error:null}),
      getUser:async()=>opciones.errorUsuario?{data:null,error:opciones.errorUsuario}:{data:{user:{id:identidad,email:Object.hasOwn(opciones,'email')?opciones.email:'auth@example.test'}},error:null},
      resetPasswordForEmail:async(...args)=>{correos.push(args);return opciones.enviar?opciones.enviar(...args):{error:null};},
      updateUser:async(...args)=>{cambios.push(args);throw Error('No actualizar desde Configuración');},
      onAuthStateChange(fn){listener=fn;}
    };
    const r=preparar(auth);r.window.location.href=opciones.url||'https://pruebaelalmendro.vercel.app/index.html#configuracion';
    r.contexto.state={currentUser:{id:'usuario-propio',role:opciones.rol||'TECNICO',email:'local-no-usar@example.test'}};
    vm.runInContext(fuente,r.contexto);r.correos=correos;r.cambios=cambios;r.eventoAuth=(e,v)=>listener(e,v);return r;
  }
  const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const configuracion=fs.readFileSync(path.join(__dirname,'../js/views/configuracion.js'),'utf8');
  check('Configuración solicita por correo sin formulario de contraseñas',configuracion.includes('Cambiar contraseña por correo')&&!fuente.includes('updateUser')&&!fuente.includes('type="password"')&&!configuracion.includes('type="password"'));
  check('sin logs, almacenamiento de secretos ni API administrativa',!/localStorage|sessionStorage|console\.|auth\.admin|service_role|\.from\(/.test(fuente));
  check('barra superior no incorpora acceso de contraseña',!index.includes('btn-personal-password'));
  for(const rol of ['ADMINISTRADOR','TECNICO','RECEPCION','SOLICITANTE','OTRO_AUTORIZADO']){
    const r=escenario({rol});await r.contexto.abrirCambioPasswordPersonal();
    check(rol+': usa exclusivamente correo Auth sin cambiar contraseña',r.correos.length===1&&r.correos[0][0]==='auth@example.test'&&r.cambios.length===0);
    check(rol+': informa procesamiento sin afirmar entrega o actualización',r.nodo('password-personal-mensaje').textContent==='Solicitud procesada. Revisa tu correo para continuar. Tu contraseña todavía no se ha cambiado.');
  }
  for(const [url,destino] of [['http://127.0.0.1:5500/index.html#configuracion','http://127.0.0.1:5500/recuperar-password.html'],['https://pruebaelalmendro.vercel.app/index.html?redirectTo=https://evil.test','https://pruebaelalmendro.vercel.app/recuperar-password.html']]){
    const r=escenario({url});await r.contexto.abrirCambioPasswordPersonal();check('destino exacto autorizado '+url,r.correos[0]?.[1].redirectTo===destino);
  }
  for(const url of ['file:///hotel/index.html','http://localhost:5500/index.html','https://otro.vercel.app/index.html','https://pruebaelalmendro.vercel.app.evil.test/index.html','http://127.0.0.1:5501/index.html']){
    const r=escenario({url});await r.contexto.abrirCambioPasswordPersonal();check('origen desconocido no envía '+url,r.correos.length===0&&r.nodo('password-personal-mensaje').textContent.includes('dirección autorizada'));
  }
  for(const opciones of [{sinSesion:true},{identidad:'otra-cuenta'},{errorUsuario:{status:401}},{email:null},{email:''},{email:'invalido'}]){
    const r=escenario(opciones);await r.contexto.abrirCambioPasswordPersonal();check('sesión o correo inválido no envía '+JSON.stringify(opciones),r.correos.length===0&&r.cambios.length===0&&!r.nodo('password-personal-guardar').disabled);
  }
  const sinRol=escenario({rol:'SIN_ROL'});await sinRol.contexto.abrirCambioPasswordPersonal();check('cuenta sin rol no solicita enlace',sinRol.correos.length===0);
  for(const caso of [{error:{status:429},texto:'Demasiadas solicitudes'},{error:{code:'over_email_send_rate_limit'},texto:'Demasiadas solicitudes'},{error:{message:'NO REVELAR'},texto:'No fue posible'},{red:true,texto:'No fue posible'}]){
    const r=escenario({enviar:async()=>{if(caso.red)throw Error('NO REVELAR');return {error:caso.error};}});await r.contexto.abrirCambioPasswordPersonal();check('error visible sin éxito falso '+JSON.stringify(caso),r.nodo('password-personal-mensaje').textContent.includes(caso.texto)&&!r.nodo('password-personal-mensaje').textContent.includes('Solicitud procesada')&&!r.nodo('password-personal-mensaje').textContent.includes('NO REVELAR')&&r.logs.length===0);
  }
  let resolver;const doble=escenario({enviar:()=>new Promise(r=>resolver=r)});const pendiente=doble.contexto.abrirCambioPasswordPersonal();for(let i=0;i<8;i++)await Promise.resolve();await doble.contexto.abrirCambioPasswordPersonal();check('doble solicitud bloqueada durante envío',doble.correos.length===1&&doble.nodo('password-personal-guardar').disabled);resolver({error:null});await pendiente;check('botón disponible tras respuesta',!doble.nodo('password-personal-guardar').disabled);
  let resolverSalida;const salida=escenario({enviar:()=>new Promise(r=>resolverSalida=r)});const tarea=salida.contexto.abrirCambioPasswordPersonal();for(let i=0;i<8;i++)await Promise.resolve();salida.eventoAuth('SIGNED_OUT',null);resolverSalida({error:null});await tarea;check('respuesta tardía tras logout no confirma solicitud',!salida.nodo('password-personal-mensaje').textContent.includes('Solicitud procesada'));
  const previa=escenario();previa.contexto.window.supabaseClient.auth.getUser=async()=>{previa.eventoAuth('SIGNED_OUT',null);return {data:{user:{id:'usuario-propio',email:'auth@example.test'}},error:null};};await previa.contexto.abrirCambioPasswordPersonal();check('logout durante verificación impide correo',previa.correos.length===0);
  // Comprobar páginas operativas; supabase-test.html es local, ignorado y no es una dependencia.
  for (const pagina of ['index.html','login.html','registrar.html','recuperar-password.html']) {
    const contenido=fs.readFileSync(path.join(base,pagina),'utf8');
    check('SDK uniforme fijado en '+pagina,contenido.includes('@supabase/supabase-js@2.102.0"')&&!contenido.includes('@supabase/supabase-js@2"'));
  }
  const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
  const acceso=app.slice(app.indexOf('function hasAccess('),app.indexOf('function hasActionPermission('));
  for (const perfil of [
    {rol:'ADMINISTRADOR',admin:true,esperado:true},
    {rol:'TECNICO',admin:true,esperado:true}, // delegación temporal vigente
    {rol:'TECNICO',admin:false,esperado:false},
    {rol:'RECEPCION',admin:false,esperado:false},
    {rol:'RECEPCION',admin:false,configAnterior:true,esperado:false},
    {rol:'OTRO_AUTORIZADO',admin:false,esperado:false},
    {rol:'ADMINISTRADOR',admin:true,personalizado:true,esperado:false}
  ]) {
    const r=escenario({rol:perfil.rol});
    r.window.SYSTEM_ROLES=[{id:'ADMINISTRADOR',permissions:['configuracion','admin']},{id:'TECNICO',permissions:['dashboard']},{id:'RECEPCION',permissions:['dashboard']}];
    r.contexto.esAdminOperativoActual=()=>perfil.admin;
    r.contexto.esAdminPermanenteActual=()=>perfil.admin && perfil.rol==='ADMINISTRADOR';
    r.contexto.renderCurrentView=()=>{};
    if(perfil.personalizado)r.contexto.state.currentUser.permissions={modules:['dashboard']};
    if(perfil.configAnterior)r.contexto.state.currentUser.permissions={modules:['configuracion']};
    r.contexto.sesionEnReconexion=false;
    r.contexto.sesionNoVerificable=false;
    vm.runInContext(acceso,r.contexto);
    vm.runInContext(app.slice(app.indexOf('function uiEncabezadoSeccion('),app.indexOf('function navigateTo(')),r.contexto);
    vm.runInContext(configuracion,r.contexto);
    check('navegación personal sin ampliar administración '+JSON.stringify(perfil),
      r.contexto.hasAccess('configuracion',perfil.rol)===true&&r.contexto.configuracionPuedeAdministrar()===perfil.esperado&&r.contexto.hasAccess('admin',perfil.rol)===(perfil.admin && perfil.rol==='ADMINISTRADOR'));
    vm.runInContext("activeConfigTab='seguridad'",r.contexto);
    const contenido=r.contexto.renderSettingsView();
    check('render personal o administrativo correcto '+JSON.stringify(perfil),contenido.includes('Seguridad de mi cuenta')&&!contenido.includes('Parámetros Hotel')&&!contenido.includes('Cuenta y Perfil'));
    if(!perfil.esperado){
      const antes=JSON.stringify(r.contexto.state);
      check('acciones simuladas retiradas '+perfil.rol,['selectAvatar','handleSaveProfile','toggle2FA','handleExportData','handleClearCache','handleDeleteAccountPrompt'].every(k=>typeof r.contexto[k]==='undefined'));
      r.contexto.resetToFactoryData=()=>{throw Error('Restablecimiento no autorizado');};

      r.contexto.switchConfigTab('hotel');
      check('invocación directa no ejecuta acciones administrativas '+perfil.rol,JSON.stringify(r.contexto.state)===antes&&r.contexto.renderActiveConfigSection('hotel',{})===''&&typeof r.contexto.renderSectionHotelParams==='undefined');
    }
  }

}
async function probarRecuperacion() {
  for(const direccion of ['http://127.0.0.1:5500/login.html','http://localhost:8123/hotel/login.html','https://hotel.example.test/login.html']) {
    let resolve, llamadas=[];
    const r=preparar({resetPasswordForEmail:(...args)=>{llamadas.push(args);return new Promise(res=>resolve=res);}});
    r.window.location.href=direccion;
    r.nodo('recover-email').value='correo-invalido';await r.contexto.solicitarRecuperacion(evento);
    check('correo inválido no envía recuperación '+direccion,llamadas.length===0&&r.nodo('recover-message').textContent.includes('válido'));
    r.nodo('recover-email').value=' persona@example.test ';
    const p=r.contexto.solicitarRecuperacion(evento);await r.contexto.solicitarRecuperacion(evento);
    check('recuperación usa URL relativa real y bloquea duplicados '+direccion,llamadas.length===1&&llamadas[0][0]==='persona@example.test'&&llamadas[0][1].redirectTo===new URL('./recuperar-password.html',direccion).href&&r.nodo('recover-submit').disabled);
    resolve({error:null});await p;
    check('mensaje genérico y permite volver al login '+direccion,r.nodo('recover-message').textContent.includes('Si el correo está registrado')&&!r.nodo('recover-submit').disabled);
    r.contexto.volverDeRecuperacion();check('volver desde solicitud muestra login '+direccion,!r.nodo('form-login').classList.contains('hidden')&&r.nodo('form-recover').classList.contains('hidden'));
  }
  for(const caso of [{error:{code:'user_not_found',message:'NO EXPONER'}},{error:{status:429},texto:'Demasiados intentos'},{error:{code:'unexpected_failure',status:500},texto:'No fue posible'},{error:{name:'AuthRetryableFetchError'},texto:'No fue posible'},{red:true,texto:'No fue posible'}]) {
    const r=preparar({resetPasswordForEmail:async()=>{if(caso.red)throw Error('NO EXPONER');return {error:caso.error};}});
    r.window.location.href='https://hotel.example.test/login.html';r.nodo('recover-email').value='persona@example.test';
    await r.contexto.solicitarRecuperacion(evento);
    check('solicitud maneja error sin revelar cuentas '+JSON.stringify(caso),r.nodo('recover-message').textContent.includes(caso.texto||'Si el correo está registrado')&&!r.nodo('recover-message').textContent.includes('NO EXPONER')&&r.logs.length===0&&!r.nodo('recover-submit').disabled);
  }
  const archivo=preparar({resetPasswordForEmail:async()=>{throw Error('No debe enviar desde file');}});
  archivo.window.location.href='file:///hotel/login.html';archivo.nodo('recover-email').value='persona@example.test';
  await archivo.contexto.solicitarRecuperacion(evento);
  check('file no se usa como destino de recuperación',archivo.nodo('recover-message').textContent.includes('HTTP o HTTPS')&&!archivo.nodo('recover-submit').disabled);
  const pagina=fs.readFileSync(path.join(__dirname,'../recuperar-password.html'),'utf8');
  const fuente=fs.readFileSync(path.join(__dirname,'../js/recuperarPassword.js'),'utf8');
  const config=fs.readFileSync(path.join(base,'js/config/supabaseClient.js'),'utf8');
  new vm.Script(fuente);
  for(const s of pagina.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=/.test(s[1]))new vm.Script(s[2]);
  check('página independiente con SDK uniforme, sin SPA',pagina.includes('@supabase/supabase-js@2.102.0')&&!pagina.includes('js/app.js')&&pagina.includes('name="referrer" content="no-referrer"'));
  check('ojos de recuperación son botones de teclado sin submit',
    ['recovery-password-eye','recovery-confirm-eye'].every(id=>new RegExp('id="'+id+'" type="button"[^>]*aria-controls=[^>]*aria-label=').test(pagina)));
  check('tokens se retiran de URL antes de cargar recursos',pagina.indexOf('history.replaceState')>=0&&[...pagina.matchAll(/<(?:link|script)\b[^>]*(?:href|src)=["'][^"']+["'][^>]*>/g)].every(m=>pagina.indexOf('history.replaceState')<m.index));
  const entrada=[...pagina.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)][0][2];
  let reemplazo;
  const ventana={};
  vm.runInNewContext(entrada,{window:ventana,location:{hash:'#access_token=solo-stub',search:'?token_hash=solo-stub',pathname:'/hotel/recuperar-password.html'},history:{replaceState(a,b,c){reemplazo=c;}},localStorage:{getItem(){return 'dark';}},document:{documentElement:{classList:{add(){}}}}});
  check('limpieza de URL ejecutada sin perder contexto de procesamiento',reemplazo==='/hotel/recuperar-password.html'&&ventana.hotelRecoveryLink.hash.includes('solo-stub'));
  for(const recovery of [false,true]) {
    let opciones;
    vm.runInNewContext(config,{window:{supabase:{createClient(a,b,c){opciones=c;return {};}}},document:{documentElement:{dataset:{authRecovery:String(recovery)}}}});
    check('configuración cliente aislada sin afectar cliente normal '+recovery,recovery?opciones.auth.persistSession===false&&opciones.auth.detectSessionInUrl===false&&opciones.auth.autoRefreshToken===false:opciones===undefined);
  }
  function escenario(opciones={}) {
    let sesion=null, salidas=0, sets=0, renovaciones=0, otps=[];
    const cambios=[];
    const user={id:'recuperacion-propia'};
    const auth={
      setSession:async()=>{sets++;if(opciones.enlaceError)return {data:{},error:{code:opciones.enlaceError}};sesion={user,access_token:'solo-stub'};return {data:{session:sesion},error:null};},
      verifyOtp:async args=>{otps.push(args);return auth.setSession();},
      refreshSession:async()=>{renovaciones++;return {data:{session:sesion},error:opciones.revocada?{code:'refresh_token_not_found'}:null};},
      getSession:async()=>({data:{session:sesion},error:null}),
      getClaims:async()=>({data:{claims:{sub:opciones.sub||user.id,exp:opciones.vencida?1:Math.floor(Date.now()/1000)+3600,amr:[{method:opciones.metodo||'otp'}]}},error:opciones.firma?{code:'bad_jwt'}:null}),
      getUser:async()=>({data:{user},error:opciones.usuarioError?{code:'session_not_found'}:null}),
      updateUser:async args=>{cambios.push(args);if(opciones.update)return opciones.update(args);return {data:{user},error:null};},
      signOut:async args=>{assert.equal(args.scope,'local');salidas++;if(opciones.logoutError)return {error:{code:'network'}};sesion=null;return {error:null};}
    };
    const r=preparar(auth);
    r.window.hotelRecoveryLink=opciones.directo?{hash:'',search:''}:opciones.query?{hash:'',search:'?type=recovery&token_hash=solo-stub'}:{hash:'#type=recovery&access_token=solo-stub&refresh_token=solo-stub',search:''};
    if(opciones.link)r.window.hotelRecoveryLink=opciones.link;
    r.window.location.replace=destino=>{r.destino=destino;};
    r.nodo('recovery-form').classList.add('hidden');
    vm.runInContext(fuente,r.contexto);
    r.campos=(a='Clave-recuperada-solo-memoria',b=a)=>{r.nodo('recovery-password').value=a;r.nodo('recovery-confirm').value=b;};
    r.cambios=cambios;r.salidas=()=>salidas;r.sets=()=>sets;r.renovaciones=()=>renovaciones;r.otps=otps;r.opciones=opciones;
    return r;
  }
  for(const metodo of ['otp','recovery','magiclink']) {
    const r=escenario({metodo});await r.contexto.iniciarRecuperacion();
    check('sesión oficial de recuperación habilita formulario '+metodo,!r.nodo('recovery-password').disabled&&!r.nodo('recovery-form').classList.contains('hidden')&&r.renovaciones()===1&&!r.window.hotelRecoveryLink);
  }
  for(const opciones of [{directo:true},{metodo:'password'},{firma:true},{vencida:true},{revocada:true},{usuarioError:true},{sub:'otra-cuenta'},{enlaceError:'otp_expired'},{enlaceError:'otp_disabled'}, {link:{hash:'#error=access_denied&error_code=otp_expired',search:''}}]) {
    const r=escenario(opciones);await r.contexto.iniciarRecuperacion();r.campos();await r.contexto.guardarPasswordRecuperada(evento);
    check('acceso directo, sesión normal o enlace inválido/vencido/reutilizado bloqueado '+JSON.stringify(opciones),r.cambios.length===0&&r.nodo('recovery-password').disabled&&r.nodo('recovery-form').classList.contains('hidden')&&r.nodo('recovery-message').textContent.includes('enlace'));
  }
  const otp=escenario({query:true});await otp.contexto.iniciarRecuperacion();
  check('token_hash se verifica con tipo recovery en Supabase',otp.otps.length===1&&otp.otps[0].type==='recovery'&&!otp.nodo('recovery-password').disabled);
  const r=escenario();await r.contexto.iniciarRecuperacion();
  check('ambas contraseñas ocultas por defecto',r.nodo('recovery-password').type==='password'&&r.nodo('recovery-confirm').type==='password');
  r.contexto.alternarPasswordRecuperada('recovery-password');
  check('ojo de nueva contraseña independiente y accesible',r.nodo('recovery-password').type==='text'&&r.nodo('recovery-confirm').type==='password'&&r.nodo('recovery-password-eye').getAttribute('aria-pressed')==='true');
  r.contexto.alternarPasswordRecuperada('recovery-confirm');r.contexto.alternarPasswordRecuperada('recovery-password');
  check('ojo de confirmación independiente y reversibilidad',r.nodo('recovery-confirm').type==='text'&&r.nodo('recovery-password').type==='password');
  r.campos('12345');await r.contexto.guardarPasswordRecuperada(evento);
  check('rechaza nueva contraseña inferior al mínimo',r.cambios.length===0&&r.nodo('recovery-message').textContent.includes('6 caracteres'));
  r.campos('Clave-nueva','Otra-clave');await r.contexto.guardarPasswordRecuperada(evento);
  check('rechaza confirmación distinta',r.cambios.length===0&&r.nodo('recovery-message').textContent.includes('no coinciden'));
  r.campos();await r.contexto.guardarPasswordRecuperada(evento);
  check('cambio confirmado envía solo password y cierra sesión temporal',r.cambios.length===1&&Object.keys(r.cambios[0]).join(',')==='password'&&r.salidas()===1&&r.nodo('recovery-message').textContent.includes('actualizó correctamente'));
  check('éxito limpia y oculta campos e impide nuevo envío',r.nodo('recovery-password').value===''&&r.nodo('recovery-confirm').value===''&&r.nodo('recovery-form').classList.contains('hidden')&&r.nodo('recovery-save').disabled);
  await r.contexto.volverLoginRecuperacion();check('retorno seguro al login sin módulos internos',r.destino==='./login.html');
  let resolver;
  const doble=escenario({update:()=>new Promise(resolve=>resolver=resolve)});await doble.contexto.iniciarRecuperacion();doble.campos();
  const pendiente=doble.contexto.guardarPasswordRecuperada(evento);await new Promise(resolve=>setImmediate(resolve));
  await doble.contexto.guardarPasswordRecuperada(evento);await doble.contexto.volverLoginRecuperacion();
  check('doble envío bloqueado y sin éxito anticipado',doble.cambios.length===1&&doble.nodo('recovery-save').disabled&&doble.nodo('recovery-back').disabled&&!doble.destino&&!doble.nodo('recovery-message').textContent.includes('actualizó'));
  resolver({data:{user:{id:'recuperacion-propia'}},error:null});await pendiente;
  for(const caso of [{code:'weak_password',texto:'política'},{code:'same_password',texto:'diferente'},{status:429,texto:'Demasiados'},{red:true,texto:'No fue posible'},{invalido:true,texto:'No fue posible'}]) {
    const r=escenario({update:async()=>{if(caso.red)throw Error('NO EXPONER');return caso.invalido?{data:{user:{id:'otra-cuenta'}},error:null}:{data:{},error:{...caso,message:'NO EXPONER'}};}});
    await r.contexto.iniciarRecuperacion();r.campos();await r.contexto.guardarPasswordRecuperada(evento);
    check('error de actualización sin falso éxito ni secretos '+JSON.stringify(caso),r.nodo('recovery-message').textContent.includes(caso.texto)&&!r.nodo('recovery-message').textContent.includes('NO EXPONER')&&r.nodo('recovery-password').value===''&&r.logs.length===0);
  }
  const revocada=escenario();await revocada.contexto.iniciarRecuperacion();revocada.opciones.revocada=true;revocada.campos();await revocada.contexto.guardarPasswordRecuperada(evento);
  check('sesión revocada entre apertura y envío impide escritura',revocada.cambios.length===0);
  const cierre=escenario({logoutError:true});await cierre.contexto.iniciarRecuperacion();cierre.campos();await cierre.contexto.guardarPasswordRecuperada(evento);await cierre.contexto.volverLoginRecuperacion();
  check('error de cierre no se oculta ni redirige con sesión temporal',!cierre.destino&&cierre.nodo('recovery-save').disabled&&cierre.nodo('recovery-message').textContent.includes('cierre'));
  check('recuperación sin logs, tablas propias, almacenamiento o API admin',!/console\.|localStorage|sessionStorage|\.from\(|service_role|auth\.admin/.test(fuente));
}

(process.argv.includes('--recuperacion') ? probarRecuperacion().then(()=>console.log(total+'/'+total+' PASS — recuperación (solo memoria)')) : main()).catch(e=>{console.error(e);process.exitCode=1;});

async function probarRegistroInvitado() {
  const pagina=fs.readFileSync(path.join(base,'registrar.html'),'utf8');
  const fuente=fs.readFileSync(path.join(base,'js/registrar.js'),'utf8');new vm.Script(fuente);
  [...pagina.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/src=/.test(m[1])).forEach(m=>new vm.Script(m[2]));
  check('registro invitado sin signUp y correo readonly',!fuente.includes('.signUp(')&&pagina.includes('id="invitation-email" readonly')&&pagina.includes('id="invitation-save" disabled'));
  check('URL capturada y limpia antes de recursos, sin storage de tokens',pagina.indexOf('history.replaceState')<pagina.indexOf('stylesheet')&&!/localStorage|console\./.test(fuente)&&fuente.includes('JSON.stringify(ticket)'));
  async function escenario(op={}) {
    const r=preparar({});const id='usuario-invitado';let updates=0,otps=[],sesiones=[],names=[],configured=!!op.configured,nameCalls=0,signedOut=false,logoutCalls=0;
    const user={id,email:'persona@example.test',email_confirmed_at:'2026-11-12',invited_at:'2026-11-12',...op.user};
    const session={user,access_token:'solo-memoria'};
    if(op.storage){r.contexto.sessionStorage={getItem:k=>op.storage.get(k)||null,setItem:(k,v)=>op.storage.set(k,String(v)),removeItem:k=>op.storage.delete(k)};r.storage=op.storage;}
    const auth={verifyOtp:async p=>{otps.push(p);return {data:{session},error:op.error};},setSession:async p=>{sesiones.push(p);return {data:{session},error:op.error};},
      refreshSession:async()=>({data:{session},error:null}),getClaims:async()=>({data:{claims:{sub:op.otroActor?'otro':id,exp:Math.ceil(Date.now()/1000)+3600}},error:null}),
      getSession:async()=>({data:{session:signedOut?null:session},error:null}),getUser:async()=>({data:{user},error:null}),signOut:async()=>{logoutCalls++;if(op.logoutError||op.logoutFailsOnce&&logoutCalls===1)return {error:{message:'NO EXPONER'}};signedOut=!op.keepSession;return {error:null};},
      signInWithPassword:async()=>{signedOut=false;return {data:{session},error:op.loginError};},updateUser:async p=>{updates++;check('password se envía solo a Auth',Object.keys(p).join(',')==='password');
        if(op.delayPassword)await op.delayPassword();
        if(op.passwordFailsOnce&&updates===1)return {error:{code:'weak_password'}};
        configured=true;if(op.passwordUncertain&&updates===1)throw Error('NO EXPONER');return {data:{user},error:null};}};
    r.window.supabaseClient={auth,functions:{invoke:async(name,options)=>{
      assert.equal(name,'usuario-invitaciones');assert.equal(options.headers.Authorization,'Bearer solo-memoria');
      assert.equal(Object.keys(options.body).sort().join(','),'accion,nombre');names.push({...options.body});nameCalls++;
      if(op.nameFailsOnce&&nameCalls===1)throw Error('NO EXPONER');
      if(op.backendClosed)return {data:{ok:false,error:'INVITACIONES_DESHABILITADAS'},error:null};
      if(!configured)return {data:{ok:false,error:'CONTRASENA_NO_CONFIGURADA'},error:null};
      return {data:{ok:true,estado:'NOMBRE_CONFIRMADO',usuario_id:id,nombre:options.body.nombre},error:null};
    }},from:tabla=>{assert.equal(tabla,'usuarios');return {select:campos=>{assert.equal(campos,'id,nombre,estado,rol_id,trabajador_id');return {eq:(col,valor)=>{assert.equal(col,'id');assert.equal(valor,id);return {maybeSingle:async()=>({data:{id,nombre:null,estado:true,rol_id:null,trabajador_id:null,...op.perfil},error:op.perfilError})};}};}};}};
    r.window.INVITACIONES_UI_HABILITADA=!!op.habilitada;
    r.window.hotelInvitationLink=op.hash?{hash:'#type=invite&access_token=solo-memoria&refresh_token=solo-memoria'}:{search:op.parametroSolo?'?type=invite':'?type=invite&token_hash=solo-memoria'};
    vm.runInContext(fuente,r.contexto);await r.contexto.iniciarRegistroInvitado();
    return {...r,updates:()=>updates,otps,sesiones,names,campos(){r.nodo('invitation-name').value='Ana Persona';r.nodo('invitation-password').value='Clave-prueba';r.nodo('invitation-password-confirm').value='Clave-prueba';}};
  }
  for(const hash of [false,true]) {
    const r=await escenario({hash});
    check('sesión invitada validada sin escrituras '+hash,r.nodo('invitation-email').value==='persona@example.test'&&!r.nodo('invitation-form').classList.contains('hidden')&&r.nodo('invitation-save').disabled&&r.nodo('invitation-message').textContent.includes('todavía no está autorizada'));
    check('enlace tratado por Auth, no solo type '+hash,hash?r.sesiones.length===1:r.otps[0].type==='invite');
    r.nodo('invitation-password').value='No enviar';r.contexto.completarRegistroInvitado(evento);
    check('submit manipulado no escribe contraseña ni nombre '+hash,r.updates()===0&&r.nodo('invitation-password').value===''&&r.nodo('invitation-save').disabled);
  }
  for(const op of [{parametroSolo:true},{error:{code:'otp_expired'}},{otroActor:true},{user:{invited_at:null}},{user:{email_confirmed_at:null}},{perfil:{rol_id:'tecnico'}},{perfil:{trabajador_id:'ficha'}},{perfil:{estado:false}},{perfilError:{message:'NO EXPONER'}}]){
    const r=await escenario(op);check('registro rechaza condición incompatible '+JSON.stringify(op),r.nodo('invitation-form').classList.contains('hidden')&&r.nodo('invitation-save').disabled&&r.updates()===0&&!r.nodo('invitation-message').textContent.includes('NO EXPONER'));
  }
  const integrada=await escenario({habilitada:true});integrada.campos();
  await integrada.contexto.completarRegistroInvitado(evento);
  check('registro conectado confirma password y nombre antes de pendiente',integrada.updates()===1&&integrada.names.length===1&&integrada.nodo('invitation-message').textContent.includes('registro se completó correctamente'));
  check('recibo no conserva contraseña ni tokens',[...integrada.storage.values()].every(v=>!v.includes('Clave-prueba')&&!v.includes('solo-memoria')));
  const parcial=await escenario({habilitada:true,nameFailsOnce:true});parcial.campos();await parcial.contexto.completarRegistroInvitado(evento);
  check('nombre incierto no declara registro completo',parcial.updates()===1&&!parcial.nodo('invitation-message').textContent.includes('registro se completó correctamente'));
  const recibo=[...parcial.storage.values()][0];await parcial.contexto.completarRegistroInvitado(evento);
  check('reintento nombre conserva UUID y no repite contraseña',parcial.updates()===1&&parcial.names.length===2&&JSON.parse(recibo).solicitudId===JSON.parse([...parcial.storage.values()][0]).solicitudId&&parcial.names[0].nombre===parcial.names[1].nombre);
  const incierta=await escenario({habilitada:true,passwordUncertain:true});incierta.campos();await incierta.contexto.completarRegistroInvitado(evento);
  await incierta.contexto.completarRegistroInvitado(evento);
  check('password incierta se reconcilia por backend sin repetir Auth',incierta.updates()===1&&incierta.names.length===1&&incierta.nodo('invitation-message').textContent.includes('registro se completó correctamente'));
  const pendiente=await escenario({habilitada:true,passwordFailsOnce:true});pendiente.campos();await pendiente.contexto.completarRegistroInvitado(evento);await pendiente.contexto.completarRegistroInvitado(evento);
  check('backend sin contraseña requiere otro envío explícito',pendiente.updates()===1&&pendiente.nodo('invitation-message').textContent.includes('nuevo intento explícito')&&!pendiente.nodo('invitation-password-fields').classList.contains('hidden'));
  pendiente.campos();await pendiente.contexto.completarRegistroInvitado(evento);check('reintento explícito posterior completa',pendiente.updates()===2&&pendiente.nodo('invitation-message').textContent.includes('registro se completó correctamente'));
  const deshabilitada=await escenario({habilitada:true,backendClosed:true});deshabilitada.campos();await deshabilitada.contexto.completarRegistroInvitado(evento);
  check('Edge cerrada no produce éxito falso y conserva parcial',deshabilitada.updates()===1&&deshabilitada.nodo('invitation-message').textContent.includes('deshabilitado')&&deshabilitada.storage.size>0);
  const continuacion=await escenario({habilitada:true,parametroSolo:true,configured:true,storage:parcial.storage});
  continuacion.nodo('invitation-resume-email').value='persona@example.test';continuacion.nodo('invitation-resume-password').value='Clave-prueba';
  await continuacion.contexto.continuarRegistroInvitado(evento);await continuacion.contexto.completarRegistroInvitado(evento);
  check('recarga permite continuar con login aislado, sin segunda identidad/password',continuacion.updates()===0&&continuacion.names.length===1&&continuacion.nodo('invitation-email').value==='persona@example.test'&&continuacion.nodo('invitation-resume-password').value==='');
  const libre=await escenario({habilitada:true,parametroSolo:true,user:{invited_at:null}});libre.nodo('invitation-resume-email').value='persona@example.test';libre.nodo('invitation-resume-password').value='Clave-prueba';await libre.contexto.continuarRegistroInvitado(evento);
  check('continuación rechaza cuenta de registro público no invitada',libre.nodo('invitation-message').textContent.includes('No se pudo continuar')&&libre.updates()===0&&libre.names.length===0);
  const invalid=await escenario({habilitada:true});invalid.campos();invalid.nodo('invitation-password-confirm').value='diferente';await invalid.contexto.completarRegistroInvitado(evento);
  check('validación de contraseña impide toda escritura',invalid.updates()===0&&invalid.names.length===0&&invalid.storage.size===0);
  let permitir,notificar;const iniciada=new Promise(r=>notificar=r);
  const doble=await escenario({habilitada:true,delayPassword:async()=>{notificar();await new Promise(r=>permitir=r);}});doble.campos();
  const primera=doble.contexto.completarRegistroInvitado(evento);await iniciada;await doble.contexto.completarRegistroInvitado(evento);
  check('registro bloquea doble submit mientras Auth responde',doble.updates()===1&&doble.names.length===0);
  permitir();await primera;check('doble submit conserva una sola finalización',doble.updates()===1&&doble.names.length===1);
  const alterado=await escenario({habilitada:true});alterado.campos();alterado.nodo('invitation-email').value='tercero@example.test';await alterado.contexto.completarRegistroInvitado(evento);
  check('correo del DOM no se utiliza como identidad o destino',alterado.names.length===1&&Object.keys(alterado.names[0]).join(',')==='accion,nombre');
  const cerrado=preparar({signUp:async()=>{throw Error('No debe llamar');}});
  cerrado.window.REGISTRO_PUBLICO_UI_HABILITADO=true;
  check('ni abrir bandera antigua recupera formulario eliminado',!html.includes('id="form-register"'));
  check('sin handler signUp invocable desde login',typeof cerrado.contexto.handleRegisterSubmit==='undefined'&&typeof cerrado.contexto.ejecutarSignUp==='undefined');
  check('éxito completo cierra sesión y redirige a login con aviso pendiente',integrada.window.location.href==='./login.html'&&integrada.storage.get('hotel.registro-finalizado')==='COMPLETO_PENDIENTE_V1');
  for(const op of [{logoutError:true},{keepSession:true}]){
    const r=await escenario({habilitada:true,...op});r.campos();await r.contexto.completarRegistroInvitado(evento);
    check('cierre fallido no redirige ni fabrica aviso '+JSON.stringify(op),r.window.location.href==='login.html'&&!r.storage.has('hotel.registro-finalizado')&&r.nodo('invitation-message').textContent.includes('no se confirmó el cierre'));
  }
  const retryClose=await escenario({habilitada:true,logoutFailsOnce:true});retryClose.campos();await retryClose.contexto.completarRegistroInvitado(evento);await retryClose.contexto.volverDesdeInvitacion();
  check('reintento de cierre no repite password ni nombre',retryClose.updates()===1&&retryClose.names.length===1&&retryClose.window.location.href==='./login.html');
  const sinNombre=await escenario({habilitada:true,backendClosed:true});sinNombre.campos();await sinNombre.contexto.completarRegistroInvitado(evento);
  check('registro parcial no redirige ni anuncia éxito en login',sinNombre.window.location.href==='login.html'&&!sinNombre.storage.has('hotel.registro-finalizado'));
  const loginFinal=preparar({});check('registro público cerrado por defecto en código real',loginFinal.registroPublicoPorDefecto===false);
  check('pestaña pública eliminada del HTML',!html.includes('id="tab-register"'));
  loginFinal.storage.set('hotel.registro-finalizado','COMPLETO_PENDIENTE_V1');loginFinal.contexto.mostrarAvisoRegistroFinalizado();
  check('login muestra mensaje exacto y consume aviso',loginFinal.nodo('auth-alert-text').textContent==='Tu registro se completó correctamente. Tu cuenta está pendiente de aprobación por el administrador'&&!loginFinal.storage.has('hotel.registro-finalizado'));
  loginFinal.nodo('auth-alert-text').textContent='';loginFinal.contexto.mostrarAvisoRegistroFinalizado();check('aviso de finalización no se repite',loginFinal.nodo('auth-alert-text').textContent==='');
  check('recuperación mantiene exclusivamente recovery',fs.readFileSync(path.join(base,'js/recuperarPassword.js'),'utf8').includes("query.get('type') === 'recovery'")&&!fs.readFileSync(path.join(base,'js/recuperarPassword.js'),'utf8').includes("type: 'invite'"));
  const admin=fs.readFileSync(path.join(base,'js/views/admin.js'),'utf8');const corte=admin.slice(admin.indexOf('function adminInvitacionPreparadaHTML'),admin.indexOf('function getAdminPanelHTML'));
  const c={adminAccesoVigente:()=>false};vm.createContext(c);vm.runInContext(corte,c);
  check('acción invitación oculta a temporal/no autorizado',c.adminInvitacionPreparadaHTML()==='');c.adminAccesoVigente=()=>true;
  // La acción manual independiente usa invoke detrás de su propia compuerta.
  // Mantener la prohibición original sobre todo el circuito de invitaciones.
  const soloInvitacion=corte.replace(/async function adminEnviarCreacionManual[\s\S]*?(?=function adminCerrarNuevoUsuario)/,'');
  check('acción permanente visible pero envío bloqueado',c.adminInvitacionPreparadaHTML().includes('Invitar trabajador')&&c.adminInvitacionPreparadaHTML().includes('type="submit" disabled')&&!/\.invoke|auth\.admin|fetch\(/.test(soloInvitacion));
}
