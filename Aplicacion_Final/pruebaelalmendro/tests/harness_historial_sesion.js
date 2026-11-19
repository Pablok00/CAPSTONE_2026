const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');let n=0;const check=(s,v)=>{assert.ok(v,s);n++;console.log('PASS '+s);};
const source=fs.readFileSync('js/controlSesion.js','utf8');
function fixture(page,options={}){
 const classes=new Set(['auth-pending']),events={},calls=[],redirects=[],body={innerHTML:'PROTEGIDO',children:[],appendChild(v){this.children.push(v);}},status={hidden:true,textContent:''};let authListener,reloads=0;
 const auth={getSession:async()=>{calls.push('session');if(options.sessionError)throw Error('network');return {data:{session:options.anon?null:{user:{id:'u'}}},error:null};},getUser:async()=>{calls.push('user');return options.userError?{data:null,error:options.userError}:{data:{user:{id:'u'}},error:null};},onAuthStateChange(fn){authListener=fn;}};
 const c=vm.createContext({window:{supabaseClient:{auth,from(table){calls.push(table);return {select(){return this;},eq(k,v){assert.equal(v,'u');return this;},maybeSingle:async()=>options.profileError?{data:null,error:{message:'network'}}:{data:options.noProfile?null:{id:'u',estado:options.disabled!==true,rol_id:options.pending?null:'rol'},error:null}};}},location:{replace(v){redirects.push(v);},reload(){reloads++;}},addEventListener(k,fn){events[k]=fn;}},document:{documentElement:{dataset:{authPage:page,authRecovery:options.recovery?'true':undefined},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}},readyState:'complete',body,createElement(){return {style:{},setAttribute(){},appendChild(){},addEventListener(){}};},getElementById(){return status;},addEventListener(){throw Error('No se espera DOM pendiente');}}});
 vm.runInContext(source,c);return {c,classes,events,calls,redirects,body,status,signedOut(){authListener('SIGNED_OUT');},get reloads(){return reloads;}};
}
async function main(){
 const active=fixture('login');check('login oculto durante verificación',active.classes.has('auth-pending'));await active.c.window.hotelSesionLista;check('login con sesión habilitada reemplaza por Dashboard',active.redirects[0]==='index.html#dashboard'&&active.classes.has('auth-pending'));check('verificación usa servidor y perfil propio',active.calls.join(',')==='session,user,usuarios');
 for(const [o,name]of [[{anon:true},'anónimo'],[{disabled:true},'inactivo'],[{noProfile:true},'sin perfil'],[{userError:{status:401}},'sesión inválida']]){const f=fixture('login',o);await f.c.window.hotelSesionLista;check('login disponible sin bucle para '+name,f.redirects.length===0&&!f.classes.has('auth-pending'));}
 const pending=fixture('login',{pending:true});await pending.c.window.hotelSesionLista;check('cuenta pendiente se entrega al guard de la SPA',pending.redirects[0]==='index.html#dashboard');
 const app=fixture('app');check('contenido protegido oculto inicialmente',app.classes.has('auth-pending'));check('SPA espera sesión real y no se muestra antes de resolver rol',await app.c.window.hotelSesionLista===true&&app.classes.has('auth-pending')&&!app.calls.includes('usuarios'));
 const anon=fixture('app',{anon:true});await anon.c.window.hotelSesionLista;check('sin sesión reemplaza login sin mostrar contenido',anon.redirects[0]==='login.html'&&anon.classes.has('auth-pending'));
 const invalid=fixture('app',{userError:{status:401}});await invalid.c.window.hotelSesionLista;check('sesión local con token rechazado no abre SPA',invalid.redirects[0]==='login.html');
 const net=fixture('app',{sessionError:true});await net.c.window.hotelSesionLista;check('error de red bloquea datos sin cerrar sesión',net.body.innerHTML===''&&net.body.children.length===1&&net.redirects.length===0);
 const loginNet=fixture('login',{profileError:true});await loginNet.c.window.hotelSesionLista;check('error de perfil login sin bucle ni cierre',loginNet.redirects.length===0&&loginNet.status.hidden===false&&loginNet.status.textContent.includes('No se pudo verificar'));
 app.classes.delete('auth-pending');app.events.pagehide();check('salir oculta documento antes de caché',app.classes.has('auth-pending'));app.events.pageshow({persisted:false});check('carga normal no recarga en bucle',app.reloads===0);app.events.pageshow({persisted:true});check('restaurar documento protegido fuerza revalidación sin nueva entrada',app.reloads===1&&app.classes.has('auth-pending'));
 active.events.pageshow({persisted:true});check('login restaurado también revalida',active.reloads===1);
 app.signedOut();check('logout invalida documento protegido inmediatamente',app.redirects[0]==='login.html'&&app.classes.has('auth-pending'));
 const rec=fixture('app',{recovery:true});check('guard no intercepta recuperación',rec.calls.length===0&&Object.keys(rec.events).length===0&&!rec.c.window.hotelSesionLista);
 const index=fs.readFileSync('index.html','utf8'),login=fs.readFileSync('login.html','utf8'),code=fs.readFileSync('js/app.js','utf8'),recover=fs.readFileSync('recuperar-password.html','utf8');
 check('HTML ocultos y guard compartido cargado',index.includes('data-auth-page="app"')&&login.includes('data-auth-page="login"')&&[index,login].every(h=>h.includes('./js/controlSesion.js')&&h.includes('html.auth-pending body')));
 check('sin temporizador que muestre la SPA sin validar',!index.includes('3000'));
 check('SPA espera guard antes del perfil',code.indexOf('await window.hotelSesionLista')<code.indexOf('const resultado = await cargarPerfilReal()'));
 check('recuperación mantiene cliente aislado sin guard nuevo',recover.includes('data-auth-recovery="true"')&&!recover.includes('controlSesion.js'));
 check('navegación interna conserva hashes y restaura contexto al volver',code.includes("window.history.pushState(contexto, '', `#${viewName}`)")&&code.includes("window.addEventListener('popstate', restaurarNavegacionHistorial)")&&code.includes("window.addEventListener('hashchange', restaurarNavegacionHistorial)"));
 console.log(n+'/'+n+' PASS — historial y guard de sesión (solo memoria)');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
