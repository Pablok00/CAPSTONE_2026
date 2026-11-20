'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const app=fs.readFileSync('js/app.js','utf8');
const admin=fs.readFileSync('js/views/admin.js','utf8');
let total=0;
function check(name,ok){assert.ok(ok,name);total++;console.log('PASS '+name);}
(async()=>{
 for(const perfil of [
  {role:'ADMINISTRADOR',esAdminPermanente:true},
  {role:'TECNICO',esAdminTemporal:true},
  {role:'TECNICO'}, {role:'RECEPCION'}, {role:'ADMINISTRADOR'}, {role:'SIN_ROL',esAdminPermanente:true}
 ]){
  let lecturas=0,timers=0;
  const nav={id:'nav-admin',classList:{add(){this.hidden=true;},remove(){this.hidden=false;}}};
  const c=vm.createContext({console,state:{currentUser:{id:'propio',...perfil,permissions:{modules:['admin','trabajadores']}}},window:{SYSTEM_ROLES:[{id:'ADMINISTRADOR',permissions:['admin','trabajadores']}]},document:{querySelectorAll:()=>[nav],getElementById:()=>{throw Error('No debe acceder al DOM');}},setTimeout:()=>timers++,alert:()=>{},cuentaPendiente:false});
  vm.runInContext(app.slice(app.indexOf('function esCuentaSinRol()'),app.indexOf('function toggleMobileSidebar(')),c);
  vm.runInContext(admin,c);
  const permitido=perfil.role!=='SIN_ROL'&&perfil.esAdminPermanente===true;
  check('ruta admin '+JSON.stringify(perfil),c.hasAccess('admin',perfil.role)===permitido);
  c.updateSidebarVisibility();check('menú admin '+perfil.role,nav.classList.hidden===!permitido);
  if(!perfil.esAdminPermanente){
   c.window.UsuariosService={getUsuarios:()=>lecturas++,getRoles:()=>lecturas++};
   check('render directo denegado '+perfil.role,c.renderAdminView().includes('Acceso reservado')&&timers===0);
   await c.cargarPanelAdminDatos();c.revisarSolicitudPendiente('ajeno');await c.abrirModalAprobacion({id:'ajeno'});
   let prevenido=false;await c.adminConfirmarAprobacion({preventDefault(){prevenido=true;}});
   check('acciones directas bloqueadas '+perfil.role,lecturas===0&&prevenido);
   check('HTML de cuentas denegado '+perfil.role,c.getAdminPanelHTML([],[]).includes('Acceso reservado')&&c.getAdminFilasHTML([])==='');
  }
  if(perfil.esAdminTemporal)check('delegación operativa conservada',c.hasAccess('trabajadores',perfil.role)&&c.esAdminOperativoActual());
 }
 const c=vm.createContext({console,state:{currentUser:{id:'propio'}},esAdminPermanenteActual:()=>true,window:{UsuariosService:{}},document:{getElementById:()=>null},setTimeout:()=>{},alert:()=>{}});
 vm.runInContext(admin,c);
 const refs={id:{value:'ajeno'},rol:{value:'rol'}};
 c.adminRefsFormulario=()=>refs;c.adminMostrarErrorFormulario=()=>{};c.adminEstadoGuardando=()=>{};
 c.adminNombreRolNormalizado=()=> 'tecnico';c.adminEsPendiente=()=>true;
 let escrituras=0;c.window.UsuariosService={getRoles:async()=>[{id:'rol',nombre:'Técnico'}],aprobarUsuario:async()=>escrituras++};
 vm.runInContext("adminUsuariosReales=[{id:'ajeno',nombre:'Nombre real'}]",c);
 c.revalidarPrivilegioParaEscritura=async()=>{c.esAdminPermanenteActual=()=>false;return true;};
 await c.adminConfirmarAprobacion({preventDefault(){}});
 check('pérdida de privilegio permanente antes de RPC impide aprobación',escrituras===0);
 console.log(total+'/'+total+' PASS (sin red ni escrituras reales)');
})().catch(e=>{console.error(e);process.exitCode=1;});
