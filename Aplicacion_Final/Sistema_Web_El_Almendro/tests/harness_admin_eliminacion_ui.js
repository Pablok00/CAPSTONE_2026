'use strict';
// Chrome real con perfil aislado, archivo local, servicios simulados y resolución de red bloqueada.
// No carga la configuración Supabase ni usa sesiones/cuentas reales. No instala dependencias.
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { spawn } = require('child_process');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
assert(fs.existsSync(chrome), 'Chrome no disponible en la ruta esperada');
const output = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'almendro-ui179-'));
fs.mkdirSync(output, { recursive: true });
const read = p => fs.readFileSync(p, 'utf8');
const script = code => '<script>' + code.replace(/<\/script/gi, '<\\/script') + '</script>';
const css = ['css/tailwind.css', 'css/ui-system.css'].map(p => read(p).replace(/@import[^;]+;/g, '')).join('\n');
const setup = `
window.currentView='admin'; window.permanente=true; window.escrituras=0; window.errores=[];
window.addEventListener('error',e=>errores.push(e.message));
window.state={currentUser:{id:'actor',role:'ADMINISTRADOR'}};
window.adminAccesoVigente=()=>permanente;
window.esAdminPermanenteActual=()=>permanente;
window.alert=()=>{throw new Error('alert no permitido en la interfaz de eliminación')};
window.supabaseClient={auth:{onAuthStateChange(){}}};
window.usuarioUI={id:'objetivo',nombre:'Cuenta de prueba',estado:true,rol_id:'recepcion',roles:{nombre:'Recepción'}};
window.previewRequests=[];
window.previewData=id=>({contrato:'usuario-eliminacion-previsualizar/v1',modo:'solo_lectura',usuario_id:id,
  comprobado_en:'2026-11-02T12:00:00Z',puede_eliminar:false,eliminacion_habilitada:false,validacion_integral_completa:false,
  perfil_existe:true,auth_existe:true,cuenta_propia:false,administrador_permanente:false,ultimo_administrador_permanente:false,
  administradores_permanentes_habilitados:2,asignaciones:{mantenciones:0,tareas:0,alcance:'todas_las_filas_sin_inferir_vigencia'},
  storage:{total:0,por_owner_id:0,por_owner:0,total_sin_duplicar:true},
  documentos_conservables:{prevencion:0,trabajadores:0,accion:'conservar_sin_modificar'},
  historial_solicitudes:{solicitudes_creadas:1,avisos_asociados:1,accion:'conservar_sin_modificar'},
  referencias_fk_detectadas:[],bloqueos:['ELIMINACION_NO_IMPLEMENTADA'],verificaciones_pendientes:['REAUTENTICACION_DE_SERVIDOR']});
window.UsuariosService={getContextoGestion:async id=>({usuario:{...usuarioUI,id},revision_gestion:'0'}),
  previsualizarEliminacion:id=>new Promise((resolve,reject)=>previewRequests.push({id,resolve,reject})),
  getRoles:async()=>[{id:'recepcion',nombre:'Recepción'}],gestionarUsuario:async()=>{escrituras++;throw new Error('Escritura no permitida')}};
`;
const scenario = `
(async()=>{
  const results=[]; const check=(label,value)=>{if(!value)throw new Error(label);results.push(label)};
  const field=id=>document.getElementById(id);
  const fila=getAdminFilasHTML([usuarioUI]);
  check('botón visible al permanente',fila.includes('Eliminar cuenta'));
  check('sin acción visible de desactivar',!fila.includes('Desactivar cuenta'));
  field('admin-content').innerHTML='<div style="overflow-x:auto"><table><tbody>'+fila+'</tbody></table></div>';
  const acciones=[...field('admin-content').querySelectorAll('button')];
  const eliminar=acciones.find(b=>b.textContent==='Eliminar cuenta'), cambiar=acciones.find(b=>b.textContent==='Cambiar rol');
  const estilo=getComputedStyle(eliminar), base=getComputedStyle(cambiar);
  check('mismo estilo base de acción',['padding','borderRadius','borderWidth','borderColor','backgroundColor','fontSize'].every(k=>estilo[k]===base[k]));
  const rgb=estilo.color.match(/[0-9]+/g).map(Number);
  check('texto rojo sin fondo rojo',rgb[0]>rgb[1]+20&&estilo.backgroundColor===base.backgroundColor);
  for(const role of ['ADMINISTRADOR_TEMPORAL','TECNICO','RECEPCION']){
    permanente=false; state.currentUser.role=role;
    check('sin botón '+role,getAdminFilasHTML([usuarioUI])==='');
    await adminAbrirGestion('objetivo','ELIMINAR_UI');check('sin ventana '+role,!field('admin-gestion-dialog'));
  }
  permanente=true;state.currentUser.role='ADMINISTRADOR';
  await adminAbrirGestion('objetivo','ELIMINAR_UI');
  check('un diálogo reutilizado',document.querySelectorAll('#admin-gestion-dialog').length===1);
  check('título y botón renombrados',field('admin-gestion-titulo').textContent==='Eliminar cuenta'&&field('ag-enviar').textContent==='Eliminar cuenta');
  check('sin errores antes de interactuar',['ag-error','ag-nombre-error','ag-motivo-error','ag-confirmar-error'].every(id=>field(id).textContent===''));
  check('aviso breve junto al botón',field('ag-nohabil').textContent==='La eliminación todavía no está disponible'&&field('ag-nohabil').tagName==='P');
  check('nombre y rol reales del servicio simulado',field('admin-gestion-dialog').textContent.includes('Cuenta de prueba · Recepción'));
  check('dependencias cargando sin conteos inventados',field('ag-dependencias').getAttribute('aria-busy')==='true'&&field('ag-dependencias').textContent.includes('Consultando'));
  check('carga inmediata sin ocultar campos',!!field('ag-dependencias').querySelector('[data-carga-asociada]')&&field('ag-dependencias').textContent.includes('Consultando información asociada...')&&!!field('ag-nombre-exacto')&&!!field('ag-motivo')&&field('ag-enviar').disabled);
  check('una sola consulta por apertura',previewRequests.length===1);
  const alturaPendiente=field('ag-dependencias').getBoundingClientRect().height;
  const posicionCampo=field('ag-nombre-exacto').getBoundingClientRect().top;
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  previewRequests.at(-1).resolve(previewData('objetivo'));await tick();
  check('dependencias recibidas del servicio simulado',field('ag-dependencias').textContent.includes('Solicitudes creadas: 1')&&field('ag-dependencias').getAttribute('aria-busy')==='false');
  check('espacio reservado sin salto al completar',Math.abs(field('ag-dependencias').getBoundingClientRect().height-alturaPendiente)<1&&Math.abs(field('ag-nombre-exacto').getBoundingClientRect().top-posicionCampo)<1);
  check('carga retirada al completar',!field('ag-dependencias').querySelector('[data-carga-asociada]'));
  check('sin consulta automática adicional',previewRequests.length===1);
  check('aviso obligatorio sin prometer conservación',field('admin-gestion-dialog').textContent.includes('Esta acción es irreversible. El historial y los archivos asociados deben conservarse.')&&!field('ag-dependencias').textContent.includes('Consultado:'));
  const detalles=field('ag-dependencias').querySelector('details');
  check('desplegable cerrado inicialmente',!!detalles&&!detalles.open);
  detalles.querySelector('summary').click();check('desplegable abre',detalles.open);
  detalles.querySelector('summary').click();check('desplegable cierra',!detalles.open);
  check('lenguaje sencillo y resumen real',field('ag-dependencias').textContent.includes('1 solicitud · 1 aviso · Sin archivos detectados'));
  check('sin tecnicismos ni conteo administrador',!/(Storage|owner_id|referencias FK|UUID|RLS|Administradores permanentes habilitados)/.test(field('ag-dependencias').textContent));

  check('bloqueado inicial',field('ag-enviar').disabled);
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  field('admin-gestion-dialog').click();check('Escape y fondo no cierran',!!field('admin-gestion-dialog'));
  const set=(id,value)=>{field(id).value=value;field(id).dispatchEvent(new Event('input',{bubbles:true}))};
  set('ag-nombre-exacto','cuenta de prueba');check('nombre exacto requerido',field('ag-nombre-exacto').getAttribute('aria-invalid')==='true'&&field('ag-nombre-error').textContent.includes('coincidir exactamente'));
  set('ag-nombre-exacto','Cuenta de prueba ');check('espacio extra rechazado',field('ag-nombre-exacto').getAttribute('aria-invalid')==='true');
  set('ag-nombre-exacto','Cuenta de prueba');check('nombre exacto válido',field('ag-nombre-exacto').getAttribute('aria-invalid')==='false');
  set('ag-motivo','corto');check('motivo corto',field('ag-motivo').getAttribute('aria-invalid')==='true'&&field('ag-motivo-error').textContent.includes('10 y 1000'));
  set('ag-motivo','x'.repeat(1001));check('motivo largo',field('ag-motivo').getAttribute('aria-invalid')==='true');
  set('ag-motivo','Motivo de prueba de interfaz');field('ag-confirmar').dispatchEvent(new Event('blur'));check('falta confirmación',field('ag-confirmar').getAttribute('aria-invalid')==='true'&&field('ag-confirmar-error').textContent.includes('Marca'));
  field('ag-confirmar').click();check('válido sigue bloqueado',field('ag-enviar').disabled&&['ag-error','ag-nombre-error','ag-motivo-error','ag-confirmar-error'].every(id=>field(id).textContent===''));
  check('errores junto a campos',field('ag-nombre-exacto').getAttribute('aria-describedby')==='ag-nombre-error'&&field('ag-motivo').getAttribute('aria-describedby')==='ag-motivo-error');
  field('ag-enviar').disabled=false;
  field('admin-gestion-dialog').querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  check('submit forzado bloqueado',escrituras===0&&field('ag-enviar').disabled);
  field('admin-gestion-dialog').querySelector('[data-cerrar]').click();check('cierra sin cambios',!field('admin-gestion-dialog')&&escrituras===0);
  await adminAbrirGestion('objetivo','ELIMINAR_UI');check('reabre limpio',field('ag-nombre-exacto').value===''&&field('ag-motivo').value===''&&!field('ag-confirmar').checked);
  field('admin-gestion-dialog').querySelectorAll('[data-cerrar]')[1].click();check('Cancelar cierra',!field('admin-gestion-dialog'));
  const original=UsuariosService.getContextoGestion;
  UsuariosService.getContextoGestion=async()=>{throw new Error('error simulado')};await adminAbrirGestion('objetivo','ELIMINAR_UI');
  check('error de lectura inline',!!field('admin-eliminacion-error')&&!field('admin-gestion-dialog'));
  UsuariosService.getContextoGestion=original;await adminAbrirGestion('objetivo','ELIMINAR_UI');
  check('recuperación de lectura',!field('admin-eliminacion-error')&&!!field('admin-gestion-dialog'));
  previewRequests.at(-1).reject(new Error('detalle interno simulado'));await tick();
  check('carga retirada al fallar',!field('ag-dependencias').querySelector('[data-carga-asociada]')&&field('ag-dependencias').getAttribute('aria-busy')==='false'&&field('ag-enviar').disabled);
  check('error de servicio sin detalles internos',field('ag-dependencias').textContent.includes('No fue posible consultar las dependencias')&&!field('ag-dependencias').textContent.includes('detalle interno'));
  adminCerrarGestion();await adminAbrirGestion('objetivo','ELIMINAR_UI');
  previewRequests.at(-1).resolve({usuario_id:'objetivo',storage:{total:0}});await tick();
  check('respuesta incompleta no muestra ceros',field('ag-dependencias').textContent.includes('No fue posible consultar las dependencias')&&!field('ag-dependencias').textContent.includes('Storage (total'));
  adminCerrarGestion();await adminAbrirGestion('objetivo','ELIMINAR_UI');const anterior=previewRequests.at(-1);
  await adminAbrirGestion('otra-cuenta','ELIMINAR_UI');const nueva=previewRequests.at(-1);
  const obsoleta=previewData('objetivo');obsoleta.historial_solicitudes.solicitudes_creadas=999;
  anterior.resolve(obsoleta);await tick();
  check('cambio de cuenta descarta respuesta previa',field('ag-dependencias').getAttribute('aria-busy')==='true'&&!field('ag-dependencias').textContent.includes('999'));
  nueva.resolve(previewData('otra-cuenta'));await tick();check('nueva cuenta recibe su respuesta',field('ag-dependencias').textContent.includes('Información asociada a esta cuenta'));
  adminCerrarGestion();await adminAbrirGestion('objetivo','ELIMINAR_UI');const cerrada=previewRequests.at(-1);
  adminCerrarGestion();cerrada.resolve(previewData('objetivo'));await tick();
  check('cerrar durante consulta no reabre ventana',!field('admin-gestion-dialog'));
  await adminAbrirGestion('objetivo','ELIMINAR_UI');previewRequests.at(-1).resolve(previewData('objetivo'));await tick();

  adminCerrarGestion();await adminAbrirGestion('objetivo','ELIMINAR_UI');
  const asociados=previewData('objetivo');asociados.storage={total:3,por_owner_id:3,por_owner:3,total_sin_duplicar:true};
  asociados.documentos_conservables.prevencion=2;asociados.documentos_conservables.trabajadores=1;
  asociados.asignaciones.tareas=4;asociados.asignaciones.mantenciones=5;
  asociados.bloqueos.push('OBJETOS_STORAGE_CON_PROPIETARIO','BLOQUEO_NUEVO_TECNICO');
  previewRequests.at(-1).resolve(asociados);await tick();
  check('conteos exactos sin sumar propietarios ni documentos',field('ag-dependencias').textContent.includes('Archivos asociados (sin duplicar): 3')&&field('ag-dependencias').textContent.includes('Documentos de Prevención: 2')&&field('ag-dependencias').textContent.includes('Tareas asignadas: 4')&&field('ag-dependencias').textContent.includes('Mantenciones asignadas: 5'));
  check('bloqueos comprensibles sin códigos internos',field('ag-dependencias').textContent.includes('Hay archivos asociados')&&!field('ag-dependencias').textContent.includes('BLOQUEO_NUEVO_TECNICO'));
  adminCerrarGestion();await adminAbrirGestion('objetivo','ELIMINAR_UI');
  const ultima=previewData('objetivo');ultima.administrador_permanente=true;ultima.ultimo_administrador_permanente=true;ultima.administradores_permanentes_habilitados=1;ultima.bloqueos.push('ULTIMO_ADMIN_PERMANENTE');
  previewRequests.at(-1).resolve(ultima);await tick();
  check('advertencia de última cuenta administradora',field('ag-dependencias').textContent.includes('última cuenta administradora permanente')&&field('ag-enviar').disabled);
  const panel=field('admin-gestion-dialog').firstElementChild;panel.scrollTop=panel.scrollHeight;
  check('botón final accesible al desplazar y siempre bloqueado',field('ag-enviar').getBoundingClientRect().bottom<=panel.getBoundingClientRect().bottom&&field('ag-enviar').disabled);panel.scrollTop=0;
  check('sin desbordamiento horizontal',document.documentElement.scrollWidth<=innerWidth);
  check('sin escrituras',escrituras===0);check('sin errores JS',errores.length===0);
  document.documentElement.dataset.result='ok';
  field('test-result').textContent=JSON.stringify(results);
})().catch(e=>{document.documentElement.dataset.result='failed';document.getElementById('test-result').textContent=e.stack});
`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => { for (const [width, dark] of [[393, false], [1440, true]]) {
  const name = `admin-eliminacion-${width}-${dark ? 'oscuro' : 'claro'}`;
  const file = path.join(output, name + '.html');
  fs.writeFileSync(file, `<!doctype html><html class="${dark ? 'dark' : ''}"><meta charset="utf-8"><style>${css}</style><body class="alm-ui"><p>PRUEBA LOCAL: servicios simulados, sin Supabase</p><div id="admin-content"></div><pre id="test-result" hidden></pre>${script(read('js/services/usuarios.service.js'))}${script(setup)}${script(read('js/views/admin.js'))}${script(scenario)}</body></html>`);
  const profile = fs.mkdtempSync(path.join(output, 'perfil-aislado-'));
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    '--disable-sync', '--host-resolver-rules=MAP * ~NOTFOUND', '--no-proxy-server',
    '--user-data-dir=' + profile, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
    '--hide-scrollbars', 'about:blank'];
  const child = spawn(chrome, args, { windowsHide: true, stdio: 'ignore' }); let ws;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await pause(100);
    assert(fs.existsSync(portFile), 'Chrome no abrió DevTools local');
    const port = Number(read(portFile).split('\n')[0]); assert(port > 0);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0; const pending = new Map();
    ws.onmessage = event => { const message = JSON.parse(event.data); const p = pending.get(message.id);
      if (p) { pending.delete(message.id); message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result); } };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const current = ++id; pending.set(current, { resolve, reject }); ws.send(JSON.stringify({ id: current, method, params }));
    });
    await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/') });
    let result;
    for (let i = 0; i < 100; i++) {
      result = (await send('Runtime.evaluate', { expression: 'JSON.stringify({status:document.documentElement.dataset.result,results:document.getElementById("test-result")?.textContent,width:innerWidth,rect:document.getElementById("admin-gestion-dialog")?.firstElementChild.getBoundingClientRect().toJSON()})' })).result.value;
      if (result && JSON.parse(result).status) break;
      await pause(100);
    }
    const actual = JSON.parse(result); assert.equal(actual.status, 'ok', actual.results);
    assert.equal(actual.width, width); assert(actual.rect.left >= 0 && actual.rect.right <= width, 'Diálogo fuera del viewport');
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(shot.data, 'base64'));
    console.log('PASS Chrome ' + name + ': ' + (JSON.parse(actual.results).length + 2) + ' verificaciones; captura ' + path.join(output, name + '.png'));
    await send('Browser.close').catch(() => {});
  } finally { ws?.close(); child.kill(); }
} })().catch(error => { console.error(error); process.exitCode = 1; });
