// BOD-3: pruebas con datos exclusivamente en memoria, sin conexión a Supabase.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
let fuente = fs.readFileSync(path.join(__dirname, 'harness_c2e3.js'), 'utf8').replace(/\r\n/g, '\n').split('async function main()')[0];
const marcador = '  MNT_SUBAPARTADOS,\n';
assert.ok(fuente.includes(marcador));
fuente = fuente.replace(marcador, `  mntPanelInventarioHTML, abrirFichaInventario, cerrarFichaInventario,
  mntBodAbrirFormulario, mntBodCerrarFormulario, mntBodEnviar, mntBodCargar,
  mantencionFiltrosInventario, cerrarMantencionSubapartado,
` + marcador);
const h = new Function('require', '__dirname', fuente + '\nreturn {crearDB,cargarVista};')(require, __dirname);
let total = 0;
const verificar = (nombre, condicion) => { assert.ok(condicion, nombre); total++; console.log('[PASS] ' + nombre); };
async function main() {
  const fichas = Array.from({ length: 29 }, (_, i) => ({ id: '10000000-0000-4000-8000-' + String(i + 1).padStart(12,'0'),
    elemento_id: '20000000-0000-4000-8000-' + String(i + 1).padStart(12,'0'),
    nombre_original: i ? 'Bodega Piscina' : 'Bodega Container', numero_original: 1, nemotecnico_original: 'BOD',
    ubicacion_original: i % 2 ? 'Hotel' : 'Centro de Eventos', fecha_inventario: i ? null : '2024-10-15',
    responsable_texto: i ? null : 'Responsable original', hoja_origen: 'Hoja1', fila_origen: i + 2,
    importacion: {archivo_origen: 'LISTA DE BODEGAS.xlsx'}, observaciones: 'Nota de migración' }));
  const originales = JSON.stringify(fichas);
  const registros = [], llamadas = [], lecturas = [];
  let falloLectura = false, modo = 'ok', resolverRpc = null, pendienteLectura = null;
  const respuesta = args => {
    if (modo === 'error') return { data: null, error: { message: 'Permiso rechazado por RPC' } };
    if (modo === 'invalida') return { data: {ok: false}, error: null };
    const id = '30000000-0000-4000-8000-' + String(registros.length + 1).padStart(12,'0');
    registros.push({ id, inventario_elemento_id: args.p_inventario_elemento_id, fecha_inventariado: args.p_fecha_inventariado,
      responsable_texto: args.p_responsable_texto, registrado_por: 'autor-servidor', autor_nombre_snapshot: 'Autor servidor', created_at: '2026-10-19T00:00:00+00:00' });
    return { data: { ok: true, inventariado_id: id, created_at: '2026-10-19T00:00:00+00:00' }, error: null };
  };
  const cliente = {
    from(tabla) {
      assert.equal(tabla, 'bodegas_inventariados');
      const consulta = { tabla, orden: [] }; lecturas.push(consulta);
      const q = { select(campos) { consulta.campos = campos; return q; },
        eq(campo, valor) { consulta.campo = campo; consulta.id = valor; return q; },
        order(campo) { consulta.orden.push(campo); return q; },
        then(resolve, reject) {
          if (pendienteLectura && consulta.id === fichas[0].id) return new Promise(r => { pendienteLectura.resolver = r; }).then(resolve,reject);
          return Promise.resolve(falloLectura ? {data:null,error:{message:'Lectura denegada'}} : {data:registros.filter(r => r.inventario_elemento_id === consulta.id), error:null}).then(resolve,reject);
        } };
      return q;
    },
    rpc(nombre, args) {
      assert.equal(nombre, 'bodega_registrar_inventariado'); llamadas.push({nombre,args});
      if (modo === 'pendiente') return new Promise(r => { resolverRpc = () => r(respuesta(args)); });
      return Promise.resolve(respuesta(args));
    }
  };
  const win = {supabaseClient: cliente};
  const svc = new Function('window', fs.readFileSync(path.join(__dirname,'../js/services/mantenciones.service.js'),'utf8') + '\nreturn window.MantencionesService;')(win);
  const v = h.cargarVista(h.crearDB(), true);
  v._window.MantencionesService = svc;
  v._window.esAdminOperativoActual = () => true;
  const html = () => v._doc.getElementById('mnt-modal-subapartado-body').innerHTML;
  const campos = (fecha = '2026-10-18', responsable = 'Persona <verificada>') => {
    v._doc.getElementById('mnt-bod-fecha').value = fecha;
    v._doc.getElementById('mnt-bod-responsable').value = responsable;
  };
  v.mntPanelInventarioHTML({},fichas);
  v.mantencionFiltrosInventario.texto = 'Bodega'; v.mantencionFiltrosInventario.ubicacion = 'Centro de Eventos';
  const filtros = JSON.stringify(v.mantencionFiltrosInventario);
  await v.abrirFichaInventario(fichas[0].id);
  verificar('lectura asociada al UUID histórico, no al elemento vinculado', lecturas[0].campo === 'inventario_elemento_id' && lecturas[0].id === fichas[0].id && lecturas[0].id !== fichas[0].elemento_id);
  verificar('solo columnas confirmadas de inventariados', lecturas[0].campos === 'id, inventario_elemento_id, fecha_inventariado, responsable_texto, registrado_por, autor_nombre_snapshot, created_at');
  verificar('estado vacío y dos bloques separados', html().includes('Todavía no hay inventariados') && html().includes('Registro histórico del Excel') && html().includes('Inventariados registrados en el sistema'));
  verificar('Container conserva datos originales', html().includes('Bodega Container') && html().includes('15/10/2024') && html().includes('Responsable original') && html().includes('Nota de migración'));
  for (const perfil of ['permanente','temporal']) {
    v._window.esAdminPermanenteActual = () => perfil === 'permanente';
    v.mntBodAbrirFormulario();
    const form = v._doc.getElementById('mnt-modal-registrar-inventariado').innerHTML;
    verificar(perfil + ': formulario propio sin observaciones, stock ni identificador editable', form.includes('Bodega Container') && !form.includes('textarea') && !form.includes('cantidad') && !form.includes('type="hidden"'));
    const antes = llamadas.length;
    campos('', 'Persona'); await v.mntBodEnviar();
    verificar(perfil + ': fecha obligatoria sin RPC', llamadas.length === antes);
    campos('2026-10-18','  '); await v.mntBodEnviar();
    verificar(perfil + ': responsable obligatorio sin RPC', llamadas.length === antes);
    campos(); modo = 'pendiente';
    const envio = v.mntBodEnviar(); await v.mntBodEnviar();
    v.mntBodCerrarFormulario();
    verificar(perfil + ': doble envío y cierre bloqueados', llamadas.length === antes + 1 && v._doc.getElementById('mnt-bod-submit').disabled && !v._doc.getElementById('mnt-modal-registrar-inventariado').classList.contains('hidden'));
    resolverRpc(); await envio; modo = 'ok';
    verificar(perfil + ': RPC exacta sin autoría del navegador', Object.keys(llamadas.at(-1).args).sort().join(',') === 'p_fecha_inventariado,p_inventario_elemento_id,p_responsable_texto' && llamadas.at(-1).args.p_inventario_elemento_id === fichas[0].id);
    verificar(perfil + ': éxito real del stub, refresco y fechas sin desplazamiento', html().includes('Inventariado registrado correctamente') && html().includes('Fecha del inventariado: 18/10/2026') && html().includes('Fecha de registro: 19/10/2026') && html().includes('Autor servidor'));
    verificar(perfil + ': responsable escapado y filtros conservados', html().includes('Persona &lt;verificada&gt;') && JSON.stringify(v.mantencionFiltrosInventario) === filtros);
  }
  verificar('sin duplicación ni controles de editar/eliminar', registros.length === 2 && html().split('Fecha del inventariado: 18/10/2026').length - 1 === 2 && !html().includes('Eliminar inventariado'));
  v._window.esAdminOperativoActual = () => false;
  await v.abrirFichaInventario(fichas[0].id); v.mntBodAbrirFormulario();
  const antesTecnico = llamadas.length;
  await v.mntBodEnviar();
  verificar('Técnico consulta sin botón ni envío directo de interfaz', html().includes('Autor servidor') && !html().includes('+ Registrar inventariado') && llamadas.length === antesTecnico);
  v._window.esAdminOperativoActual = () => true;
  v.mntBodAbrirFormulario(); campos(); modo = 'error'; await v.mntBodEnviar();
  verificar('error RPC conserva formulario y datos sin falso éxito', v._doc.getElementById('mnt-bod-error').textContent.includes('Permiso rechazado') && v._doc.getElementById('mnt-bod-responsable').value === 'Persona <verificada>' && registros.length === 2);
  modo = 'invalida'; await v.mntBodEnviar();
  verificar('respuesta no confirmada no anuncia guardado', v._doc.getElementById('mnt-bod-error').textContent.includes('No se pudo confirmar') && !v._doc.getElementById('mnt-modal-registrar-inventariado').classList.contains('hidden'));
  modo = 'ok'; falloLectura = true; await v.mntBodEnviar();
  verificar('guardado confirmado con fallo de refresco distingue ambos resultados', html().includes('Inventariado registrado correctamente') && html().includes('Lectura denegada') && !html().includes('Todavía no hay inventariados'));
  falloLectura = false; await v.mntBodCargar(fichas[0].id);
  verificar('reintento solo lee y recupera tres registros', registros.length === 3 && html().split('Fecha del inventariado: 18/10/2026').length - 1 === 3);
  v.mntBodAbrirFormulario(); campos();
  await v.abrirFichaInventario(fichas[1].id);
  const antesCambio = llamadas.length; await v.mntBodEnviar();
  verificar('cambio de ficha impide guardar con contexto anterior', llamadas.length === antesCambio && v._doc.getElementById('mnt-bod-error').textContent.includes('ficha cambió'));
  v.mntBodCerrarFormulario();
  verificar('Piscina conserva campos ausentes sin inventarlos', html().includes('Bodega Piscina') && html().includes('Sin fecha registrada') && html().includes('Sin responsable registrado'));
  pendienteLectura = {};
  const vieja = v.abrirFichaInventario(fichas[0].id); await new Promise(r=>setImmediate(r));
  await v.abrirFichaInventario(fichas[1].id);
  pendienteLectura.resolver({data:[{fecha_inventariado:'2026-10-18',responsable_texto:'NO DEBE APARECER'}],error:null}); await vieja;
  verificar('lectura tardía no sobrescribe otra ficha', html().includes('Bodega Piscina') && !html().includes('NO DEBE APARECER'));
  const pendiente = v.abrirFichaInventario(fichas[0].id); await new Promise(r=>setImmediate(r));
  v.cerrarFichaInventario(); const listado = html(); pendienteLectura.resolver({data:[],error:null}); await pendiente;
  verificar('cerrar invalida lecturas pendientes y conserva filtros', html() === listado && JSON.stringify(v.mantencionFiltrosInventario) === filtros);
  pendienteLectura = null;
  verificar('29 originales intactos', JSON.stringify(fichas) === originales);
  let invalido = false; const antesInvalidos = llamadas.length;
  try { await svc.registrarInventariadoBodega({inventarioElementoId:'1',fechaInventariado:'2026-10-18',responsableTexto:'Persona'}); } catch(e) { invalido = true; }
  verificar('servicio rechaza número original como identificador', invalido && llamadas.length === antesInvalidos);
  verificar('solo SELECT del dominio y RPC específica', lecturas.every(l=>l.tabla === 'bodegas_inventariados') && llamadas.every(l=>l.nombre === 'bodega_registrar_inventariado'));
  console.log(total + '/' + total + ' PASS — BODEGAS (solo memoria)');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
