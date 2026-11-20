// MANT-BAÑOS-2: pruebas sin conexión ni escrituras persistentes.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
let auxiliares = fs.readFileSync(path.join(__dirname, 'harness_c2e3.js'), 'utf8').replace(/\r\n/g, '\n').split('async function main()')[0];
const marcador = '  MNT_SUBAPARTADOS,\n';
const exportaciones = `  mntPanelBanosHTML, abrirFichaBano, cerrarFichaBano, mntRefrescarOperativasBano,
  mntFichaBanoHTML, mantencionFiltrosBanos, mntHistorialBanosBase, cerrarMantencionSubapartado,
`;
assert.ok(auxiliares.includes(marcador));
auxiliares = auxiliares.replace(marcador, exportaciones + marcador);
const h = new Function('require', '__dirname', auxiliares + '\nreturn { crearDB, cargarServicio, cargarVista, rpcPermitidas, escrituras };')(require, __dirname);
let total = 0;
function verificar(nombre, condicion) { assert.ok(condicion, nombre); total++; console.log('[PASS] ' + nombre); }
const htmlFicha = v => v._doc.getElementById('mnt-modal-subapartado-body').innerHTML;
function campos(v, fecha = '2026-10-19', responsable = 'Responsable legítimo', detalle = 'Trabajo de prueba en memoria') {
  v._doc.getElementById('mnt-registrar-mantencion-fecha').value = fecha;
  v._doc.getElementById('mnt-registrar-mantencion-responsable').value = responsable;
  v._doc.getElementById('mnt-registrar-mantencion-detalle').value = detalle;
}
async function main() {
  const db = h.crearDB();
  const banos = Array.from({ length: 32 }, (_, i) => ({ id: 'bano-' + i, nombre_original: 'Baño ' + i,
    archivo_origen: 'MANTENCION DE BAÑOS.xlsx', hoja_origen: 'Hoja1', fila_origen: i + 2,
    grupo_origen: i < 16 ? 'Grupo A' : 'Grupo B', ubicacion_original: null }));
  const historicos = Array.from({ length: 30 }, (_, i) => ({ id: 'hist-bano-' + i,
    elemento_id: 'bano-' + Math.floor(i / 2), archivo_origen: 'MANTENCION DE BAÑOS.xlsx', hoja_origen: 'Hoja1',
    fila_origen: i + 2, celda_origen: 'B' + (i + 2), detalle_trabajo: 'Trabajo importado ' + i,
    fecha_realizacion: i % 2 ? null : '2024-10-15', fecha_original: i % 2 ? '31-04-2023' : '15-10-2024', responsable_texto: null }));
  const originales = JSON.stringify(historicos);
  const svc = h.cargarServicio(db);
  const v = h.cargarVista(db, true);
  v._window.MantencionesService = svc;
  v._window.esAdminOperativoActual = () => true;
  v._window.esAdminPermanenteActual = () => true;
  v.mntPanelBanosHTML({}, banos, historicos);
  v.mantencionFiltrosBanos.texto = 'Baño';
  v.mantencionFiltrosBanos.grupo = 'Grupo A';
  const filtros = JSON.stringify(v.mantencionFiltrosBanos);
  await v.abrirFichaBano('bano-0');
  verificar('contexto propio de Baños con elemento verdadero', v.mntContextoOperativas().origen === 'banos' && v.mntContextoOperativas().elementoId === 'bano-0');
  let html = htmlFicha(v);
  verificar('dos historiales separados, sistema primero', html.indexOf('Historial del sistema') < html.indexOf('Historial importado del Excel'));
  verificar('vacío operativo explícito y registro habilitado', html.includes('Todavía no hay mantenciones') && html.includes('abrirModalRegistrarMantencion'));
  verificar('históricos originales y fecha inválida conservados', html.includes('Trabajo importado 0') && html.includes('31-04-2023') && html.includes('15/10/2024'));
  verificar('sin edición, eliminación ni anulación nueva', !html.includes('abrirModalAnularMantencion') && !html.includes('Eliminar mantención'));
  v.abrirModalRegistrarMantencion('bano-1');
  verificar('no permite registrar para otro baño', !v._doc.getElementById('mnt-registrar-mantencion-contenido').innerHTML);
  for (const perfil of ['permanente', 'temporal']) {
    v._window.esAdminPermanenteActual = () => perfil === 'permanente';
    v.abrirModalRegistrarMantencion('bano-0');
    verificar(perfil + ': formulario compartido contextual', v._doc.getElementById('mnt-registrar-mantencion-contenido').innerHTML.includes('Baño 0'));
    const antes = h.rpcPermitidas.length;
    for (const valores of [['', 'Persona', 'Trabajo'], ['2026-10-19', '', 'Trabajo'], ['2026-10-19', 'Persona', '']]) {
      campos(v, ...valores); await v.mntEnviarRegistrarMantencion();
      verificar(perfil + ': campos obligatorios sin RPC ' + valores.join('|'), h.rpcPermitidas.length === antes);
    }
    campos(v);
    let resolver;
    const originalRegistrar = svc.registrarMantencionOperativa.bind(svc);
    svc.registrarMantencionOperativa = datos => new Promise(resolve => { resolver = () => originalRegistrar(datos).then(resolve); });
    const promesa = v.mntEnviarRegistrarMantencion();
    await v.mntEnviarRegistrarMantencion();
    verificar(perfil + ': botón bloqueado mientras espera', v._doc.getElementById('mnt-registrar-mantencion-submit').disabled);
    await resolver(); await promesa;
    svc.registrarMantencionOperativa = originalRegistrar;
    verificar(perfil + ': una RPC con parámetros exactos', h.rpcPermitidas.length === antes + 1 && Object.keys(h.rpcPermitidas.at(-1).params).sort().join(',') === 'p_detalle_trabajo,p_elemento_id,p_fecha_realizacion,p_responsable_texto');
    verificar(perfil + ': destino obtenido de ficha', h.rpcPermitidas.at(-1).params.p_elemento_id === 'bano-0');
    html = htmlFicha(v);
    verificar(perfil + ': historial releído con auditoría y fechas', html.includes('Usuario Stub') && html.includes('Trabajo de prueba en memoria') && html.includes('19/10/2026') && html.includes('Fecha de registro: 18/10/2026') && !html.includes('T12:00:00'));
    verificar(perfil + ': filtros conservados', JSON.stringify(v.mantencionFiltrosBanos) === filtros);
  }
  verificar('dos registros operativos, sin duplicación en vista', db.mantenciones_operativas.filter(r => r.elemento_id === 'bano-0').length === 2 && htmlFicha(v).split('Detalle: Trabajo de prueba en memoria').length - 1 === 2);
  verificar('30 históricos y 32 elementos intactos', JSON.stringify(historicos) === originales && banos.length === 32);
  v._window.esAdminOperativoActual = () => false;
  await v.abrirFichaBano('bano-0');
  verificar('Técnico consulta sin botón de registro', htmlFicha(v).includes('Usuario Stub') && !htmlFicha(v).includes('abrirModalRegistrarMantencion'));
  v.cerrarModalRegistrarMantencion(); v.abrirModalRegistrarMantencion('bano-0');
  verificar('Técnico no abre formulario', v._doc.getElementById('mnt-modal-registrar-mantencion').classList.contains('hidden'));
  v._window.esAdminOperativoActual = () => true;
  const leer = svc.getMantencionesOperativasPorElemento.bind(svc);
  svc.getMantencionesOperativasPorElemento = async () => { throw new Error('Fallo de lectura simulado'); };
  await v.abrirFichaBano('bano-0');
  verificar('error de lectura no se muestra como vacío', htmlFicha(v).includes('Reintentar') && !htmlFicha(v).includes('Todavía no hay mantenciones') && htmlFicha(v).includes('Trabajo importado 0'));
  svc.getMantencionesOperativasPorElemento = leer;
  await v.mntReintentarHistorialOperativo('bano-0');
  verificar('reintento recupera historial del baño', htmlFicha(v).includes('Usuario Stub') && !htmlFicha(v).includes('No se mostraron las mantenciones'));
  v.abrirModalRegistrarMantencion('bano-0'); campos(v);
  const registrar = svc.registrarMantencionOperativa;
  svc.registrarMantencionOperativa = async () => { throw new Error('Permiso rechazado simulado'); };
  await v.mntEnviarRegistrarMantencion();
  verificar('rechazo conserva formulario y muestra error sin fila nueva', v._doc.getElementById('mnt-registrar-mantencion-error').textContent.includes('Permiso rechazado') && db.mantenciones_operativas.filter(r => r.elemento_id === 'bano-0').length === 2 && v._doc.getElementById('mnt-registrar-mantencion-detalle').value === 'Trabajo de prueba en memoria');
  svc.registrarMantencionOperativa = registrar;
  v.cerrarModalRegistrarMantencion();
  let resolverLectura;
  svc.getMantencionesOperativasPorElemento = id => id === 'bano-0' ? new Promise(r => { resolverLectura = r; }) : leer(id, true);
  const vieja = v.abrirFichaBano('bano-0');
  await v.abrirFichaBano('bano-1');
  resolverLectura([{ id: 'tardio', detalle_trabajo: 'NO DEBE APARECER' }]); await vieja;
  verificar('respuesta de baño anterior descartada', v.mntContextoOperativas().elementoId === 'bano-1' && !htmlFicha(v).includes('NO DEBE APARECER'));
  const pendiente = v.abrirFichaBano('bano-0');
  v.cerrarFichaBano();
  const listado = htmlFicha(v);
  resolverLectura([]); await pendiente;
  verificar('cerrar ficha invalida respuesta pendiente y contexto', htmlFicha(v) === listado && v.mntContextoOperativas() === null);
  verificar('regreso conserva filtros', JSON.stringify(v.mantencionFiltrosBanos) === filtros);
  verificar('cero escrituras directas, solo RPC permitida', h.escrituras.length === 0 && h.rpcPermitidas.every(r => r.nombre === 'mantencion_registrar_mantencion'));
  console.log(total + '/' + total + ' PASS — BAÑOS (solo memoria)');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
