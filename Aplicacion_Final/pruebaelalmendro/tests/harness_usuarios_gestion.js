'use strict';
// Solo VM y memoria: ninguna conexión ni cuenta real.
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
let total = 0;
function check(nombre, valor) { assert.ok(valor, nombre); total++; console.log('PASS ' + nombre); }
const prefijo = process.argv.includes('--publicacion') ? 'publicacion/' : '';
const servicio = fs.readFileSync(prefijo + 'js/services/usuarios.service.js', 'utf8');
const vista = fs.readFileSync(prefijo + 'js/views/admin.js', 'utf8');
const usuario = { id: 'objetivo', nombre: 'Nombre de prueba', estado: true, rol_id: 'tecnico', roles: { nombre: 'Técnico' } };
function servicioMock() {
  const orden = [], llamadas = [];
  let resultado = { data: { ok: true, auditoria: { id: 8 } }, error: null };
  const c = vm.createContext({ console, window: { supabaseClient: {
    from(tabla) {
      orden.push(tabla);
      const q = { select(){return q;}, eq(){return q;}, order(){return q;},
        limit:async()=>({data:[{id:7}],error:null}), single:async()=>({data:{...usuario},error:null}) };
      return q;
    }, rpc:async(nombre, p)=>{ llamadas.push({nombre,p}); return resultado; }
  } } });
  vm.runInContext(servicio, c);
  return { c, s: c.window.UsuariosService, llamadas, orden, resultado:r=>{resultado=r;} };
}
function nodo() {
  return { value:'',checked:false,disabled:false,textContent:'',isConnected:true,style:{},
    classList:{toggle(){},add(){},remove(){}},addEventListener(){},focus(){},
    setAttribute(){},remove(){},querySelector(){},querySelectorAll(){return [];} };
}
function interfaz() {
  const elementos = Object.fromEntries(['ag-error','ag-enviar','ag-motivo','ag-rol','ag-confirmar','ag-confirmacion','ag-nombre-exacto','ag-dependencias','ag-password'].map(id=>[id,nodo()]));
  elementos['ag-password'].value='password-sintetica';
  for (const id of ['ag-nombre-error','ag-motivo-error','ag-confirmar-error','ag-password-error']) elementos[id]=nodo();
  for (const [id, el] of Object.entries(elementos)) el.id=id;
  const cierres=[nodo(),nodo()]; const dialogo=nodo();
  dialogo.querySelectorAll=s=>s==='[data-cerrar]'?cierres:[...Object.values(elementos),...cierres];
  dialogo.querySelector=s=>s==='form'?nodo():elementos[s.slice(1)];
  elementos['admin-gestion-dialog']=dialogo;
  let escrituras=[],recargas=0,exitos=0,permanente=true;
  const c=vm.createContext({console,state:{currentUser:{id:'actor'}},window:{crypto:{randomUUID:()=> 'uuid-solicitud'},UsuariosService:{},addEventListener(){},supabaseClient:{auth:{onAuthStateChange(){}}}},
    document:{activeElement:nodo(),body:{style:{overflow:''},appendChild(){}},
      createElement:()=>dialogo,getElementById:id=>elementos[id]||null,addEventListener(){},removeEventListener(){}},
    esAdminPermanenteActual:()=>permanente,adminAccesoVigente:()=>permanente,adminPasswordEyeHTML:()=>'',alert(){},setTimeout(){}});
  vm.runInContext(servicio,c);vm.runInContext(vista,c);
  c.adminPanelVisible=()=>true;c.cargarPanelAdminDatos=async()=>{recargas++;};c.adminMostrarToast=()=>{exitos++;};
  c.revalidarPrivilegioParaEscritura=async()=>true;
  c.window.UsuariosService={getContextoGestion:async()=>({usuario:{...usuario},revision_gestion:'7'}),
    getRoles:async()=>[{id:'administrador',nombre:'Administrador'},{id:'tecnico',nombre:'Técnico'},{id:'recepcion',nombre:'Recepción'}],
    gestionarUsuario:async(op,p)=>{escrituras.push({op,p});return {ok:true,auditoria:{}};}};
  return {c,elementos,escrituras,recargas:()=>recargas,exitos:()=>exitos,permanente:v=>{permanente=v;}};
}
(async()=>{
  const r=servicioMock();const contexto=await r.s.getContextoGestion('objetivo');
  check('lee auditoría antes del perfil',r.orden.join(',')==='usuarios_gestion_auditoria,usuarios');
  check('revisión real y contexto inmutable',contexto.revision_gestion==='7'&&Object.isFrozen(contexto)&&Object.isFrozen(contexto.usuario));
  const p={p_solicitud_id:'uuid',p_usuario_id:'objetivo',p_rol_esperado:'tecnico',p_estado_esperado:true,p_revision_esperada:'7',p_motivo:'Motivo válido documentado',p_confirmar_administrador:false};
  for(const [op,nombre] of [['CAMBIAR_ROL','usuario_cambiar_rol'],['DESACTIVAR','usuario_desactivar'],['REACTIVAR','usuario_reactivar']]) {
    const params={...p,...(op==='CAMBIAR_ROL'?{p_rol_nuevo:'recepcion'}:{})};
    await r.s.gestionarUsuario(op,params);
    check('RPC y parámetros exactos '+op,r.llamadas.at(-1).nombre===nombre&&JSON.stringify(r.llamadas.at(-1).p)===JSON.stringify(params));
  }
  for(const motivo of ['', 'corto', 'x'.repeat(1001)]) {
    const n=r.llamadas.length;await assert.rejects(r.s.gestionarUsuario('DESACTIVAR',{...p,p_motivo:motivo}));check('motivo inválido no llama RPC '+motivo.length,r.llamadas.length===n);
  }
  r.resultado({data:null,error:{code:'42501',message:'permission denied'}});
  await assert.rejects(r.s.gestionarUsuario('DESACTIVAR',p));check('permiso pendiente se propaga sin éxito',true);
  r.resultado({data:null,error:null});await assert.rejects(r.s.gestionarUsuario('DESACTIVAR',p));check('respuesta vacía no es éxito',true);
  r.resultado({data:[{id:'delegacion'}],error:null});
  await r.s.otorgarAdministracionTemporal({usuario_id:'objetivo',vigente_desde:'inicio',vigente_hasta:'fin',motivo:'motivo',rol_esperado:'tecnico',revision_esperada:'7'});
  check('otorgamiento incluye rol y revisión obligatorios',JSON.stringify(r.llamadas.at(-1))===JSON.stringify({nombre:'otorgar_administracion_temporal',p:{p_usuario_id:'objetivo',p_vigente_desde:'inicio',p_vigente_hasta:'fin',p_motivo:'motivo',p_rol_esperado:'tecnico',p_revision_esperada:'7'}}));
  const n=r.llamadas.length;await assert.rejects(r.s.otorgarAdministracionTemporal({usuario_id:'objetivo',vigente_desde:'inicio',vigente_hasta:'fin'}));check('no usa contrato antiguo como fallback',r.llamadas.length===n);
  const u=interfaz();await u.c.adminAbrirGestion('objetivo','CAMBIAR_ROL');
  u.elementos['ag-motivo'].value='corto';u.elementos['ag-rol'].value='recepcion';
  await u.c.adminEnviarGestion({preventDefault(){}});check('formulario exige motivo',u.escrituras.length===0);
  u.elementos['ag-motivo'].value='Cambio de función autorizado';u.elementos['ag-rol'].value='administrador';u.c.adminActualizarConfirmacionGestion();
  await u.c.adminEnviarGestion({preventDefault(){}});check('promoción exige confirmación explícita',u.escrituras.length===0);
  u.elementos['ag-confirmar'].checked=true;
  let liberar;u.c.window.UsuariosService.gestionarUsuario=(op,p)=>{u.escrituras.push({op,p});return new Promise(resolve=>{liberar=resolve;});};
  const guardando=u.c.adminEnviarGestion({preventDefault(){}});await Promise.resolve();await Promise.resolve();
  await u.c.adminEnviarGestion({preventDefault(){}});check('doble envío bloqueado y sin éxito anticipado',u.escrituras.length===1&&u.exitos()===0);
  u.c.adminCerrarGestion();check('no cierra mientras guarda',vm.runInContext('adminGestion !== null',u.c));
  liberar({ok:true,auditoria:{}});await guardando;check('éxito solo confirmado y refresca',u.exitos()===1&&u.recargas()===1);
  const t=interfaz();await t.c.adminAbrirGestion('objetivo','DESACTIVAR');t.elementos['ag-motivo'].value='Desactivación solicitada';
  t.c.window.UsuariosService.gestionarUsuario=async(op,p)=>{t.escrituras.push({op,p});throw new Error('red');};
  await t.c.adminEnviarGestion({preventDefault(){}});t.elementos['ag-motivo'].value='Otro motivo que no debe viajar';
  await t.c.adminEnviarGestion({preventDefault(){}});
  check('reintento conserva UUID y todos los parámetros',JSON.stringify(t.escrituras[0])===JSON.stringify(t.escrituras[1])&&t.escrituras[0].p.p_motivo==='Desactivación solicitada');
  t.c.window.UsuariosService.gestionarUsuario=async()=>{throw {message:'CONFLICTO_VERSION: cambió'};};
  await t.c.adminEnviarGestion({preventDefault(){}});check('conflicto bloquea y actualiza',vm.runInContext('adminGestion.bloqueada',t.c)&&t.recargas()===1&&t.elementos['ag-enviar'].disabled);
  check('conflicto no indica éxito',t.exitos()===0);
  const denegado=interfaz();denegado.permanente(false);await denegado.c.adminAbrirGestion('objetivo','DESACTIVAR');check('temporal sin modal de gestión',vm.runInContext('adminGestion === null',denegado.c));
  const propia=interfaz();await propia.c.adminAbrirGestion('actor','CAMBIAR_ROL');check('sin autoedición',vm.runInContext('adminGestion === null',propia.c));
  const admin=interfaz();admin.c.window.UsuariosService.getContextoGestion=async()=>({usuario:{...usuario,rol_id:'administrador',roles:{nombre:'Administrador'}},revision_gestion:'9'});
  await admin.c.adminAbrirGestion('objetivo','DESACTIVAR');admin.elementos['ag-motivo'].value='Desactivación de cuenta autorizada';
  await admin.c.adminEnviarGestion({preventDefault(){}});check('desactivar Administrador exige confirmación',admin.escrituras.length===0);
  admin.elementos['ag-confirmar'].checked=true;await admin.c.adminEnviarGestion({preventDefault(){}});
  check('desactivación captura rol, estado y revisión originales',admin.escrituras[0].p.p_rol_esperado==='administrador'&&admin.escrituras[0].p.p_estado_esperado===true&&admin.escrituras[0].p.p_revision_esperada==='9'&&admin.escrituras[0].p.p_confirmar_administrador===true);
  const re=interfaz();re.c.window.UsuariosService.getContextoGestion=async()=>({usuario:{...usuario,estado:false},revision_gestion:'12'});
  await re.c.adminAbrirGestion('objetivo','REACTIVAR');re.elementos['ag-motivo'].value='Reactivación de cuenta autorizada';await re.c.adminEnviarGestion({preventDefault(){}});
  check('reactivación envía estado falso sin rol nuevo',re.escrituras[0].op==='REACTIVAR'&&re.escrituras[0].p.p_estado_esperado===false&&!('p_rol_nuevo' in re.escrituras[0].p));
  const revocado=interfaz();await revocado.c.adminAbrirGestion('objetivo','DESACTIVAR');revocado.elementos['ag-motivo'].value='Desactivación de cuenta autorizada';
  revocado.c.revalidarPrivilegioParaEscritura=async()=>{revocado.permanente(false);return true;};await revocado.c.adminEnviarGestion({preventDefault(){}});
  check('pérdida de privilegio antes del guardado impide RPC',revocado.escrituras.length===0&&revocado.exitos()===0);
  const nueva=interfaz();let consecutivo=0;nueva.c.window.crypto.randomUUID=()=> 'uuid-'+(++consecutivo);
  nueva.c.window.UsuariosService.gestionarUsuario=async(op,p)=>{nueva.escrituras.push({op,p});throw Error('red');};
  await nueva.c.adminAbrirGestion('objetivo','DESACTIVAR');nueva.elementos['ag-motivo'].value='Desactivación de cuenta autorizada';await nueva.c.adminEnviarGestion({preventDefault(){}});nueva.c.adminCerrarGestion();
  await nueva.c.adminAbrirGestion('objetivo','DESACTIVAR');nueva.elementos['ag-motivo'].value='Una operación nueva y autorizada';await nueva.c.adminEnviarGestion({preventDefault(){}});
  check('una nueva operación genera otro UUID',nueva.escrituras[0].p.p_solicitud_id!==nueva.escrituras[1].p.p_solicitud_id);
  const temp=interfaz();const refs={id:{value:'objetivo'},nombre:nodo(),email:nodo(),rol:nodo(),desdeFecha:{value:'2026-10-20'},desdeHora:{value:'10:00'},hastaFecha:{value:'2026-10-21'},hastaHora:{value:'10:00'},motivo:{value:'Motivo'},error:nodo(),submit:nodo(),submitLabel:nodo()};
  temp.c.adminRefsAdminTemporal=()=>refs;temp.c.openModal=()=>{};temp.c.closeModal=()=>{};
  await temp.c.abrirModalAdministracionTemporal('objetivo');
  temp.c.construirTimestampISOChile=(fecha,hora)=>fecha+'T'+hora+':00Z';refs.desdeFecha.value='2026-10-20';refs.desdeHora.value='10:00';refs.hastaFecha.value='2026-10-21';refs.hastaHora.value='10:00';
  vm.runInContext("adminUsuariosReales=[{id:'objetivo',estado:true,rol_id:'tecnico',roles:{nombre:'Técnico'}}]",temp.c);
  let otorgamiento;temp.c.window.UsuariosService.otorgarAdministracionTemporal=async p=>{otorgamiento=p;throw {message:'CONFLICTO_VERSION: cambió'};};
  await temp.c.handleAdminTemporalSubmit({preventDefault(){}});
  check('formulario temporal conserva contexto al abrir',otorgamiento.rol_esperado==='tecnico'&&otorgamiento.revision_esperada==='7');
  check('conflicto temporal exige reapertura y actualiza listado',vm.runInContext('adminTemporalContexto === null',temp.c)&&refs.submit.disabled&&temp.recargas()===1&&temp.exitos()===0);
  const bad=servicioMock();bad.c.window.supabaseClient.from=()=>({select(){return this;},eq(){return this;},order(){return this;},limit:async()=>({data:null,error:{message:'falló lectura'}})});
  await assert.rejects(bad.s.getContextoGestion('objetivo'));check('error de auditoría no se sustituye por revisión cero',true);
  bad.c.window.supabaseClient.from=()=>({select(){return this;},eq(){return this;},order(){return this;},limit:async()=>({data:[{id:Number.MAX_SAFE_INTEGER+1}],error:null})});
  await assert.rejects(bad.s.getContextoGestion('objetivo'));check('revisión bigint sin precisión bloquea operación',true);
  check('fuente sin escrituras directas en usuarios',!servicio.split('\n').filter(l=>!l.trim().startsWith('//')).join('\n').match(/\.(update|upsert|insert)\(/));
  const d=interfaz(); await d.c.adminAbrirGestion('objetivo','ELIMINAR_UI');
  check('eliminación reutiliza diálogo y muestra carga de dependencias',
    d.elementos['admin-gestion-dialog'].innerHTML.includes('Consultando información asociada')&&d.elementos['admin-gestion-dialog'].innerHTML.includes('ag-password'));
  check('botón irreversible inicialmente bloqueado',d.elementos['ag-enviar'].disabled);
  d.elementos['ag-password'].value='password-sintetica';
  d.elementos['ag-nombre-exacto'].value=usuario.nombre.toLowerCase(); d.elementos['ag-motivo'].value='Motivo suficientemente largo';d.elementos['ag-confirmar'].checked=true;
  check('nombre con diferencias de caso rechazado',!d.c.adminValidarEliminacionUI());
  d.elementos['ag-nombre-exacto'].value=usuario.nombre+' ';check('nombre con espacio adicional rechazado',!d.c.adminValidarEliminacionUI());
  d.elementos['ag-nombre-exacto'].value=usuario.nombre;
  for(const motivo of ['corto','x'.repeat(1001)]){d.elementos['ag-motivo'].value=motivo;check('motivo rechazado '+motivo.length,!d.c.adminValidarEliminacionUI());}
  d.elementos['ag-motivo'].value='x'.repeat(10);d.elementos['ag-confirmar'].checked=false;
  check('confirmación explícita obligatoria',!d.c.adminValidarEliminacionUI());
  d.elementos['ag-confirmar'].checked=true;
  check('campos válidos no habilitan ejecución',d.c.adminValidarEliminacionUI()&&d.elementos['ag-enviar'].disabled);
  d.elementos['ag-enviar'].disabled=false;await d.c.adminEnviarGestion({preventDefault(){}});
  check('submit forzado no escribe ni muestra éxito',d.elementos['ag-enviar'].disabled&&d.escrituras.length===0&&d.recargas()===0&&d.exitos()===0);
  d.c.adminCerrarGestion();check('cerrar descarta contexto sin cambios',vm.runInContext('adminGestion===null',d.c)&&d.escrituras.length===0);
  d.elementos['ag-nombre-exacto'].value='';d.elementos['ag-motivo'].value='';d.elementos['ag-confirmar'].checked=false;
  await d.c.adminAbrirGestion('objetivo','ELIMINAR_UI');check('reabre ventana bloqueada',d.elementos['ag-enviar'].disabled&&vm.runInContext('adminGestion.operacion==="ELIMINAR_UI"',d.c));
  d.c.adminGestionTeclado({key:'Escape'});check('Escape conserva ventana',vm.runInContext('adminGestion!==null',d.c));
  d.c.adminCerrarGestion();d.permanente(false);await d.c.adminAbrirGestion('objetivo','ELIMINAR_UI');
  check('rol no permanente no abre ni renderiza acciones',vm.runInContext('adminGestion===null',d.c)&&d.c.getAdminFilasHTML([usuario])==='');
  console.log(total+'/'+total+' PASS — gestión de usuarios (solo memoria)');
})().catch(e=>{console.error(e);process.exitCode=1;});
