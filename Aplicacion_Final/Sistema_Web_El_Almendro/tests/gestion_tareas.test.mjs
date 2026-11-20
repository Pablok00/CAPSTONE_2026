import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const frontend = process.env.GESTION_TAREAS_TEST_RAIZ === '1' ? '' : 'publicacion/';
const service = fs.readFileSync(frontend + 'js/services/gestionTareas.service.js', 'utf8');
const view = fs.readFileSync(frontend + 'js/views/gestionTareas.js', 'utf8');
const estadoFechas = fs.readFileSync(frontend+'js/state.js','utf8');
const fechasPresentacion = estadoFechas.slice(estadoFechas.indexOf('function formatearFechaCL('),estadoFechas.indexOf('function calculateWarrantyStatus('));

function preparar({ activa = true, almacen = new Map() } = {}) {
  const llamadas = [];
  let serial = 0;
  const c = vm.createContext({
    state: { currentUser: { id: 'actor-a', role: 'ADMINISTRADOR' } },
    admin: true, permanente: true, sesionEnReconexion: false,
    esAdminOperativoActual: () => c.admin,
    esAdminPermanenteActual: () => c.permanente,
    crypto: { randomUUID: () => 'solicitud-' + ++serial },
    sessionStorage: {
      getItem: k => almacen.get(k) ?? null,
      setItem: (k, v) => almacen.set(k, v),
      removeItem: k => almacen.delete(k)
    },
    calendarioFechaCivilLocal: () => '2026-11-10',
    window: { supabaseClient: { auth:{onAuthStateChange:fn=>{c.authListener=fn;}},async rpc(nombre, args) {
      llamadas.push([nombre, structuredClone(args)]);
      return c.respuesta(nombre, args);
    } } }
  });
  c.respuesta = (_, args) => ({ data: {
    solicitud_id: args.p_solicitud_id, tarea_id: 'tarea-1', revision: 2
  } });
  vm.runInContext(fechasPresentacion,c);
  vm.runInContext(service.replace(
    /GESTION_TAREAS_RPC_HABILITADA = (?:true|false)/, 'GESTION_TAREAS_RPC_HABILITADA = ' + activa
  ), c);
  vm.runInContext(view, c);
  return { c, s: c.window.GestionTareas, llamadas, almacen };
}

test('la vista administrativa respeta ambos estados de la bandera RPC', async () => {
  const { c, s, llamadas, almacen } = preparar({ activa: false });
  assert.equal(s.habilitada, false);
  assert.equal(s.puede(), true);
  for (const accion of [() => s.pagina('TAREAS'), () => s.todas('TAREAS'),
    () => s.mutar('crear', {}), () => s.reintentar()]) {
    await assert.rejects(accion, /Disponible al activar/);
  }
  assert.equal(llamadas.length, 0);
  assert.equal(almacen.size, 0);
  c.admin = false;
  c.state.currentUser.role = 'RECEPCION';
  assert.equal(s.puede(), false);
  c.admin = true;
  assert.equal(s.puede(), true);
  const habilitada = preparar({ activa: true });
  assert.equal(habilitada.s.habilitada, true);
  habilitada.c.respuesta = () => ({ data: { items: [], hay_mas: false } });
  await habilitada.s.pagina('TAREAS');
  assert.equal(habilitada.llamadas.length, 1);

  const f = 'js/components/calendarioMensual.js';
  const sha = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  assert.equal(sha(f), sha('publicacion/' + f), f);
});

test('index y ruta seleccionados renderizan solo el módulo nuevo', () => {
  const { c } = preparar({ activa: true });
  const html = fs.readFileSync(frontend + 'index.html', 'utf8');
  const app = fs.readFileSync(frontend + 'js/app.js', 'utf8');
  assert.match(html, /js\/views\/gestionTareas\.js/);
  assert.doesNotMatch(html, /js\/views\/tareasPendientes\.js/);
  const ruta = app.match(/case 'tareas-pendientes':([\s\S]*?)break;/)[1];
  c.pageTitle = {};
  c.pageSubtitle = {};
  c.pageIcon = {};
  c.container = {};
  let inicializaciones = 0;
  c.iniciarGestionTareas = () => inicializaciones++;
  c.uiEncabezadoSeccion = (titulo, _descripcion, _icono, acciones) => titulo + acciones;
  vm.runInContext(ruta, c);
  assert.equal(c.pageTitle.textContent, 'Gestión de Tareas');
  assert.match(c.container.innerHTML, /Gestión de Tareas/);
  assert.match(c.container.innerHTML, /data-gestion-nueva/);
  for (const titulo of ['Pendientes', 'Completadas', 'Calendario']) assert.ok(c.container.innerHTML.includes(titulo));
  assert.doesNotMatch(c.container.innerHTML, /Volver a consultar|Consultar tarea por UUID|data-gestion-ver-uuid/);
  assert.equal(inicializaciones, 1);
});

test('Máquinas navega a Gestión con la máquina aun cuando las RPC están cerradas', () => {
  const { c, llamadas } = preparar({ activa: false });
  let entrada;
  c.navigateTo = ruta => { entrada = [ruta, vm.runInContext('gestionEntrada.equipo.id', c)]; };
  c.mqaTareas = {};
  c.mqaCarga = { equipos: [{ id: 'maq-1' }] };
  c.mqaSeleccionado = 'maq-1';
  c.mqaPuedeVerTareas = () => true;
  const areas = fs.readFileSync(frontend + 'js/views/areas.js', 'utf8');
  const funcion = areas.slice(areas.indexOf('function mqaProgramarTarea('), areas.indexOf('function mqaTareasVisibles('));
  vm.runInContext(funcion + "mqaProgramarTarea('maq-1')", c);
  assert.deepEqual(entrada, ['tareas-pendientes', 'maq-1']);
  assert.doesNotMatch(funcion, /tareasFormularioHTML|iniciarTareasPendientes/);
  assert.deepEqual(llamadas, []);
});

test('mutaciones mapean los contratos instalados y envían una solicitud por operación', async () => {
  const { s, llamadas } = preparar();
  const tarea = { p_tarea_id: 'tarea-1', p_revision_esperada: 1 };
  const campos = { p_titulo: 'Tarea', p_descripcion: null, p_fecha_limite: '2026-11-15', p_equipo_id: 'maq-1' };
  const casos = [
    ['crear', 'crear', { ...campos, p_trabajador_ids: ['a','b'] }],
    ['editar', 'editar', { ...tarea, ...campos }],
    ['responsables', 'responsables', { ...tarea, p_accion: 'ASIGNAR', p_incorporar: ['c'],
      p_retirar: null, p_asignacion_id: null, p_progreso: null }],
    ['responsables', 'responsables', { ...tarea, p_accion: 'REASIGNAR', p_incorporar: ['c'],
      p_retirar: ['b'], p_asignacion_id: null, p_progreso: null }],
    ['responsables', 'responsables', { ...tarea, p_accion: 'AVANCE', p_incorporar: null,
      p_retirar: null, p_asignacion_id: 'asig-1', p_progreso: 33.25 }],
    ['ciclo', 'ciclo', { ...tarea, p_accion: 'REABRIR', p_asignacion_id: 'asig-1' }],
    ['ciclo', 'ciclo', { ...tarea, p_accion: 'RETIRAR', p_asignacion_id: 'asig-1' }],
    ['retirar', 'retirar', tarea]
  ];
  for (const [i, [op, rpc, datos]] of casos.entries()) {
    await s.mutar(op, datos);
    assert.deepEqual(llamadas[i], ['tareas_pendientes_' + rpc + '_v1',
      { ...datos, p_solicitud_id: 'solicitud-' + (i + 1) }]);
  }
  assert.equal(s.tienePendiente(), false);
});

test('transporte incierto conserva el payload exacto tras recargar y aísla por actor', async () => {
  const { s, c, llamadas, almacen } = preparar();
  const datos = { p_titulo: 'Tarea', p_trabajador_ids: ['a', 'b', 'c'] };
  c.respuesta = () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(s.mutar('crear', datos), /Failed to fetch/);
  await assert.rejects(s.mutar('crear', { p_titulo: 'otra' }), /operación pendiente/);
  assert.equal(llamadas.length, 1);
  const reinicio = preparar({ almacen });
  reinicio.c.state.currentUser.id = 'actor-b';
  await assert.rejects(reinicio.s.reintentar(), /No hay/);
  reinicio.c.state.currentUser.id = 'actor-a';
  await reinicio.s.reintentar();
  assert.deepEqual(reinicio.llamadas[0], llamadas[0]);
  assert.equal(reinicio.s.tienePendiente(), false);
});

test('bloquea dobles envíos y libera solicitudes rechazadas por revisión', async () => {
  const { s, c, llamadas } = preparar();
  let resolver;
  c.respuesta = () => new Promise(r => { resolver = r; });
  const primera = s.mutar('editar', { p_tarea_id: '1', p_revision_esperada: 1 });
  await assert.rejects(s.reintentar(), /en curso/);
  assert.equal(llamadas.length, 1);
  resolver({ error: { code: '40001', message: 'TAREA_EDITAR_REVISION_DESACTUALIZADA' } });
  await assert.rejects(primera, { code: '40001' });
  assert.equal(s.tienePendiente(), false);
});

test('protege retiro, acciones administrativas y lecturas durante un cambio de sesión', async () => {
  const { s, c, llamadas } = preparar();
  const app = fs.readFileSync(frontend + 'js/app.js', 'utf8');
  c.sesionNoVerificable = false;
  vm.runInContext(app.slice(app.indexOf('function hasAccess('), app.indexOf('function hasActionPermission(')), c);
  c.permanente = false;
  await assert.rejects(s.mutar('retirar', {}), /permanente/);
  c.admin = false;
  c.state.currentUser.role = 'RECEPCION';
  await assert.rejects(s.pagina('TAREAS'), /no disponible/);
  c.state.currentUser.role = 'TECNICO';
  c.state.currentUser.permissions = { modules: ['dashboard', 'areas', 'tareas-pendientes'] };
  assert.equal(s.puede(), false);
  assert.equal(c.hasAccess('tareas-pendientes', 'TECNICO'), false);
  assert.equal(c.hasAccess('dashboard', 'TECNICO'), true);
  assert.equal(c.hasAccess('areas', 'TECNICO'), true);
  assert.equal(c.hasAccess('inventario', 'TECNICO'), false);
  await assert.rejects(s.pagina('TAREAS'), /no disponible/);
  await assert.rejects(s.mutar('editar', {}), /no disponible/);
  await assert.rejects(s.mutar('responsables', {
    p_accion: 'AVANCE', p_asignacion_id: 'propia', p_progreso: 100
  }), /no disponible/);
  await assert.rejects(s.reintentar(), /no disponible/);
  assert.equal(llamadas.length, 0);
  c.admin = true;
  assert.equal(c.hasAccess('tareas-pendientes', 'TECNICO'), true);
  await s.mutar('responsables', { p_accion: 'AVANCE', p_asignacion_id: 'asignacion', p_progreso: 100 });
  c.permanente = true;
  c.state.currentUser.role = 'ADMINISTRADOR';
  assert.equal(c.hasAccess('tareas-pendientes', 'ADMINISTRADOR'), true);
  c.respuesta = () => {
    c.state.currentUser.id = 'actor-b';
    return { data: { items: [], hay_mas: false } };
  };
  await assert.rejects(s.pagina('TAREAS'), /Cambió tu acceso/);
  assert.equal(llamadas.length, 2);
  c.sesionEnReconexion = true;
  assert.equal(s.puede(), false);
});

test('paginación y calendario usan cursores separados, filtros y fechas civiles', async () => {
  const { s, c, llamadas } = preparar();
  c.respuesta = (_, a) => ({ data: a.p_cursor_id
    ? { items: [{ id: 'b' }], hay_mas: false, siguiente_cursor: null }
    : { items: [{ id: 'a' }], hay_mas: true, siguiente_cursor: 'a' } });
  assert.deepEqual([...await s.todas('TAREAS', { p_equipo_id: 'maq' })].map(t => t.id), ['a', 'b']);
  assert.equal(llamadas[1][1].p_cursor_id, 'a');
  assert.equal(llamadas[1][1].p_equipo_id, 'maq');
  c.respuesta = (_, a) => ({ data: a.p_cursor_revision
    ? { items: [{ revision: 6 }], hay_mas: false }
    : { items: [{ revision: 7 }], hay_mas: true, siguiente_cursor: 7 } });
  assert.equal((await s.todas('HISTORIAL')).length, 2);
  assert.equal(llamadas[3][1].p_cursor_revision, 7);
  assert.equal(s.mes('2028-02-01').p_hasta, '2028-02-29');
  assert.equal(s.mes('2026-02-01').p_hasta, '2026-02-28');
  assert.equal(vm.runInContext("gestionEstado({ estado:'pendiente',fecha_limite:'2026-11-09' })", c), 'Vencida');
  assert.match(vm.runInContext("gestionTareaResumen({ titulo:'<img>',estado:'pendiente' })", c), /&lt;img&gt;/);
});

test('navegación contextual prepara una sola entrada de Gestión y nunca crea desde Máquinas', () => {
  const { c, llamadas } = preparar();
  let entrada;
  c.navigateTo = ruta => { entrada = [ruta, vm.runInContext('gestionEntrada.equipo.id', c)]; };
  vm.runInContext("gestionAbrirDesdeEquipo('maq-1')", c);
  assert.deepEqual(entrada, ['tareas-pendientes', 'maq-1']);
  assert.equal(vm.runInContext('gestionEntrada', c), null);
  assert.equal(llamadas.length, 0);
  c.admin = false;
  c.state.currentUser.role = 'TECNICO';
  c.navigateTo = () => { throw Error('No corresponde navegar para crear'); };
  vm.runInContext("gestionAbrirDesdeEquipo('maq-2')", c);
});

test('el servicio anterior seleccionado conserva solo lectura de Máquinas', async () => {
  const { c } = preparar();
  c.window.supabaseClient.from = () => { throw Error('Se intentó acceso directo'); };
  vm.runInContext(fs.readFileSync(frontend + 'js/services/tareasPendientes.service.js', 'utf8'), c);
  const legacy = c.window.TareasPendientesService;
  for (const metodo of ['guardar', 'eliminar', 'cambiarEstado', 'tabla']) {
    assert.equal(typeof legacy[metodo], 'undefined');
  }
  await assert.rejects(legacy.listarDeMaquinas(['maq']), /ruta anterior de tareas está cerrada/);
});

test('un intento incierto administrativo se conserva si vence la delegación', async () => {
  const { s, c, llamadas } = preparar();
  c.permanente = false;
  c.state.currentUser.role = 'TECNICO';
  c.respuesta = () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(s.mutar('crear', { p_titulo: 'Tarea' }), /Failed to fetch/);
  c.admin = false;
  await assert.rejects(s.reintentar(), /no disponible/);
  assert.equal(s.tienePendiente(), false);
  assert.equal(llamadas.length, 1);
  c.admin = true;
  assert.equal(s.tienePendiente(), true);
  c.respuesta = (_, args) => ({ data: {
    solicitud_id: args.p_solicitud_id, tarea_id: 'tarea-1', revision: 1
  } });
  await s.reintentar();
  assert.equal(llamadas.length, 2);
  assert.deepEqual(llamadas[1], llamadas[0]);
  assert.equal(s.tienePendiente(), false);
});

test('una tarea confirmada se actualiza por UUID y su retiro limpia la lista sin duplicarla', () => {
  const { c } = preparar();
  const valores = vm.runInContext(`
    const inicial = [{ id: 'a', revision: 1 }, { id: 'b', revision: 1 }];
    const actualizada = gestionAplicarTarea(inicial, { id: 'a', revision: 2 });
    const retirada = gestionAplicarTarea(actualizada, { id: 'a', retirada_en: 'fecha' });
    JSON.stringify({ inicial, actualizada, retirada })
  `, c);
  assert.deepEqual(JSON.parse(valores), {
    inicial: [{ id: 'a', revision: 1 }, { id: 'b', revision: 1 }],
    actualizada: [{ id: 'b', revision: 1 }, { id: 'a', revision: 2 }],
    retirada: [{ id: 'b', revision: 1 }]
  });
});

test('la vista aislada carga la vista real y bloquea red, Auth y cliente productivo', () => {
  const html = fs.readFileSync('tests/manual/gestion-tareas.html', 'utf8');
  const mock = fs.readFileSync('tests/manual/gestion-tareas.mock.js', 'utf8');
  assert.match(html, /connect-src 'none'; form-action 'none'/);
  assert.match(html, /src="\.\.\/\.\.\/js\/views\/gestionTareas\.js"/);
  assert.doesNotMatch(html, /supabase|gestionTareas\.service|https?:/i);
  assert.match(mock, /includes\(location\.hostname\)/);
  assert.doesNotMatch(mock, /fetch\(|XMLHttpRequest|supabaseClient|localStorage|sessionStorage/);
});

test('un fallo de carga se distingue de permisos y de una lista vacía', () => {
  const { c } = preparar();
  assert.match(vm.runInContext("gestionErrorLectura(new TypeError('Failed to fetch'))", c), /cargar.*conexión/);
  assert.match(vm.runInContext("gestionErrorLectura({code:'42501'})", c), /permiso/);
  assert(view.includes('No hay tareas de esta categoría entre las cargadas.'));assert(view.includes('Sin tareas en esta vista.'));
  const app = fs.readFileSync('js/app.js', 'utf8');
  const i = app.indexOf('function clasificarErrorVerificacionSesion(');
  const fn = vm.runInNewContext('(' + app.slice(i, app.indexOf('\n}', i) + 2) + ')');
  assert.equal(fn({ message: 'Failed to fetch' }), 'transitoria');
  assert.equal(fn({ message: 'net::ERR_CONNECTION_CLOSED' }), 'transitoria');
  assert.equal(fn({ code: 'session_expired' }), 'invalida');
});

test('Nueva tarea permite agregar y quitar responsables, evita duplicados y omite filas vacías', async () => {
  const { c } = preparar({ activa: false });
  const filas = {
    children: [],
    get childElementCount() { return this.children.length; },
    querySelectorAll() { return this.children.map(f => f.select); },
    append(f) { this.children.push(f); }
  };
  const mas = {};
  const campos = {
    querySelector(s) {
      return ({ '[data-gestion-responsables]': filas,
        '[data-gestion-agregar]': mas, '[data-gestion-sin-personal]': {} })[s];
    }
  };
  c.document = {
    createElement() {
      const fila = {
        select: { value: '', options: [] }, boton: {},
        set innerHTML(html) {
          this.select.options = [...html.matchAll(/<option value="([^"]*)"\s*(selected)?/g)]
            .map(([, value, selected]) => ({ value, disabled: false, selected: Boolean(selected) }));
          this.select.value = this.select.options.find(o => o.selected)?.value || '';
        },
        querySelector(s) { return s === 'select' ? this.select : this.boton; },
        insertAdjacentHTML() {},
        remove() { filas.children.splice(filas.children.indexOf(this), 1); }
      };
      return fila;
    }
  };
  c.window.MantencionesService = { getElementosMaquinas: async () => { throw Error('No consultar máquinas'); } };
  c.window.TrabajadoresService = {
    listarVinculosCuentas: async () => { throw Error('No consultar cuentas para asignar'); },
    getTrabajadores: async () => [
      { id: 'yo', nombre: 'Mi ficha', estado: 'Activo' },
      { id: 'dos', nombre: 'Ficha dos', estado: 'Activo' },
      { id: 'tres', nombre: 'Ficha tres', estado: 'Activo' },
      { id: 'cuatro', nombre: 'Ficha cuatro', estado: 'Activo' },
      { id: 'inactivo', nombre: 'Inactivo', estado: 'Inactivo' }
    ]
  };
  c.sigue = () => true;
  c.campos = campos;
  c.contexto = { id: 'actor-a' };
  let contenido, enviar;
  c.abrir = (_titulo, html, fn) => { contenido = html; enviar = fn; filas.children.length = 0; };
  c.form = { elements: { fecha: { value: '2026-11-12' }, titulo: { value: 'Tarea' }, descripcion: { value: '' } } };
  c.mutar = (_op, _t, args) => args;
  const consulta = campos.querySelector.bind(campos);
  campos.querySelector = s => s === '[data-gestion-vencida]' ? { dataset: {} } : consulta(s);
  campos.querySelectorAll = () => filas.querySelectorAll();
  const trabajadores = view.slice(view.indexOf('  function opciones('), view.indexOf('  function mutar('));
  await vm.runInContext('let catalogo, maquinas, cuentas, versionDetalle = 0, seleccion;\n'
    + trabajadores + '\nformulario()', c);

  assert.match(contenido, /Responsables \(obligatorio\)/);
  assert.doesNotMatch(contenido, /name="equipo"|Asignarme|Sin máquina/);
  assert.equal(filas.children.length, 1);
  assert.deepEqual(filas.children[0].select.options.map(o => o.value), ['', 'yo', 'dos', 'tres', 'cuatro', '__registrar_trabajador__']);
  const seleccionar = (indice, id) => {
    const selector = filas.children[indice].select;
    selector.value = id;
    selector.onchange();
  };
  assert.equal(mas.disabled, true);
  mas.onclick();
  assert.equal(filas.children.length, 1);
  assert.throws(enviar, /Selecciona al menos un responsable/);
  seleccionar(0, 'yo');
  assert.equal(mas.disabled, false);
  assert.deepEqual([...enviar().p_trabajador_ids], ['yo']);
  mas.onclick();
  assert.equal(filas.children.length, 2);
  assert.equal(mas.disabled, true);
  assert.deepEqual([...enviar().p_trabajador_ids], ['yo']);
  assert.equal(filas.children[1].select.options.find(o => o.value === 'yo').disabled, true);
  filas.children[1].select.value = 'yo';
  assert.throws(enviar, /evita duplicados/);
  seleccionar(1, 'dos');
  assert.deepEqual([...enviar().p_trabajador_ids], ['yo', 'dos']);
  mas.onclick();
  seleccionar(2, 'tres');
  assert.deepEqual([...enviar().p_trabajador_ids], ['yo', 'dos', 'tres']);
  mas.onclick();
  seleccionar(3, 'cuatro');
  assert.deepEqual([...enviar().p_trabajador_ids], ['yo', 'dos', 'tres', 'cuatro']);
  assert.equal(mas.hidden, true);
  mas.onclick();
  assert.equal(filas.children.length, 4);
  filas.children[1].boton.onclick();
  assert.equal(filas.children.length, 3);
  assert.equal(mas.hidden, false);
  assert.equal(mas.disabled, false);
  assert.equal(enviar().p_equipo_id, null);
  await vm.runInContext("formulario(null,{ id:'maq-1', nombre:'Caldera' })", c);
  assert.match(contenido, /Máquina vinculada: Caldera/);
  assert.doesNotMatch(contenido, /name="equipo"/);
  filas.children[0].select.value = 'yo';
  assert.equal(enviar().p_equipo_id, 'maq-1');
});

test('373F carga principal sobrevive al enriquecimiento fallido; calendario e historial conservan snapshots',async()=>{
  const {c,s}=preparar();
  c.window.supabaseClient.auth={getUser:async()=>({data:{user:{id:'actor-a'}}})};
  c.window.supabaseClient.functions={invoke:async()=>({error:{message:'SQL PRIVADO'}})};
  vm.runInContext(fs.readFileSync(frontend+'js/services/usuarios.service.js','utf8'),c);
  c.respuesta=(_,args)=>({data:{items:args.p_vista==='ASIGNACIONES'
    ?[{id:'11111111-1111-4111-8111-111111111111',tarea_id:'22222222-2222-4222-8222-222222222222',trabajador_nombre:'Original'}]
    :[{id:'22222222-2222-4222-8222-222222222222',titulo:'Trabajo',retirada_por:'33333333-3333-4333-8333-333333333333',retirada_por_nombre_snapshot:'Autor original'}],hay_mas:false,siguiente_cursor:null}});
  const principal=await s.todas('TAREAS',s.mes('2026-11-01'));
  assert.equal(principal[0].lectura_historica,undefined);
  const [tarea]=await principal.enriquecimientoHistorico;
  assert.equal(tarea.titulo,'Trabajo');assert.equal(tarea.retirada_por_nombre_snapshot,'Autor original');
  assert.equal(tarea.lectura_historica.estado,'NO_DISPONIBLE');assert(!JSON.stringify(tarea).includes('SQL PRIVADO'));
  assert(!tarea.nombres_historicos);
  const laboral=await s.historialLaboral('trabajador');assert.equal(laboral.items[0].tarea.titulo,'Trabajo');
  c.respuesta=()=>({error:Error('LECTURA_PRINCIPAL_DENEGADA')});
  await assert.rejects(s.pagina('TAREAS'),/LECTURA_PRINCIPAL_DENEGADA/);
  assert.match(view,/Etiquetas históricas no disponibles/);
});
test('374G tareas activas, asignaciones e historial sin claves no llaman a Edge ni consultan sesión adicional',async()=>{
  const {c,s,llamadas}=preparar();let auth=0,edge=0;
  c.window.supabaseClient.auth.getUser=async()=>{auth++;throw Error('consulta innecesaria');};
  c.window.supabaseClient.functions={invoke:async()=>{edge++;throw Error('Edge innecesaria');}};
  vm.runInContext(fs.readFileSync(frontend+'js/services/usuarios.service.js','utf8'),c);
  c.respuesta=()=>({data:{items:[{id:'tarea-1',titulo:'Trabajo'}],hay_mas:false,siguiente_cursor:null}});
  await s.todas('TAREAS');await s.pagina('ASIGNACIONES',{p_tarea_id:'tarea-1'});await s.pagina('HISTORIAL',{p_tarea_id:'tarea-1'});
  for(const modulo of ['TAREAS','TAREAS_OPERACIONES','TAREAS_REGISTROS'])await c.window.UsuariosService.anotarNombresHistoricos(modulo,[{id:'tarea-1',trabajador_nombre:'Original'}]);
  assert.equal(llamadas.length,3);assert.equal(auth,0);assert.equal(edge,0);
});
test('374G render principal no espera etiquetas; duplicados en curso comparten RPC y enriquecimiento',async()=>{
  const {c,s,llamadas}=preparar();let liberarPrincipal,liberarExtra,extras=0;
  c.respuesta=()=>new Promise(r=>{liberarPrincipal=r;});
  c.window.UsuariosService={anotarNombresHistoricos:()=>{extras++;return new Promise(r=>{liberarExtra=r;});}};
  const a=s.pagina('TAREAS'),b=s.pagina('TAREAS');assert.equal(llamadas.length,1);
  const fila={id:'tarea-1',titulo:'Original',revision:1,retirada_por:'actor'};
  liberarPrincipal({data:{items:[fila],hay_mas:false,siguiente_cursor:null}});
  const [primero,segundo]=await Promise.all([a,b]);assert.equal(extras,1);
  assert.equal(primero.items[0].titulo,'Original');assert(!primero.items[0].nombres_historicos);
  let actualizado=0;
  c.gestionCompletarHistoricos(primero,()=>false,()=>{actualizado++;});
  c.gestionCompletarHistoricos(segundo,()=>true,()=>{actualizado++;});
  liberarExtra([{...fila,nombres_historicos:{retirada_por_nombre_snapshot:'Confirmado (cuenta eliminada)'}}]);
  const enriquecido=await primero.enriquecimientoHistorico;
  await new Promise(setImmediate);
  assert(enriquecido.items[0].nombres_historicos);assert.equal(actualizado,1);
  c.respuesta=()=>({data:{items:[],hay_mas:false}});await s.pagina('TAREAS');
  assert.equal(llamadas.length,2); // No caché de resultados/autorizaciones resueltas.
});
test('374G invalidación por sesión, permisos o mutación impide reutilizar una lectura antigua',async()=>{
  for(const motivo of ['sesion','permisos','mutacion']){
    const {c,s}=preparar();let liberar;
    c.respuesta=(nombre,args)=>nombre==='tareas_pendientes_consultar_v1'?new Promise(r=>{liberar=r;}):
      {data:{solicitud_id:args.p_solicitud_id,tarea_id:'tarea-1',revision:2}};
    const lectura=s.pagina('TAREAS');
    if(motivo==='sesion')c.authListener('SIGNED_OUT',null);
    if(motivo==='permisos')c.state.currentUser.role='TECNICO';
    if(motivo==='mutacion')await s.mutar('editar',{p_tarea_id:'tarea-1',p_revision_esperada:1});
    liberar({data:{items:[],hay_mas:false}});
    await assert.rejects(lectura,/lectura cambió|Cambió tu acceso/);
  }
});
test('374G Mis trabajos consulta tareas distintas en paralelo y deduplica las repetidas',async()=>{
  const {c,s,llamadas}=preparar();const pendientes=new Map();
  c.respuesta=(_,args)=>args.p_vista==='ASIGNACIONES'?{data:{items:[
    {id:'a',tarea_id:'t1'},{id:'b',tarea_id:'t2'},{id:'c',tarea_id:'t1'}],hay_mas:false}}:
    new Promise(r=>pendientes.set(args.p_tarea_id,r));
  const carga=s.historialLaboral('trabajador');await new Promise(setImmediate);
  assert.equal(pendientes.size,2);assert.equal(llamadas.length,3);
  for(const [id,resolver]of pendientes)resolver({data:{items:[{id,titulo:id}],hay_mas:false}});
  const r=await carga;assert.deepEqual(Array.from(r.items,a=>a.tarea.titulo),['t1','t2','t1']);
});
test('373F historial laboral usa RPC autorizada para asignaciones y tareas, sin SELECT directo', async () => {
  const { c, s, llamadas } = preparar();
  c.respuesta = (_,args) => ({ data: args.p_vista==='TAREAS'
    ? {items:[{id:'tarea-1',titulo:'Tarea',fecha_limite:'2026-11-09'}],hay_mas:false,siguiente_cursor:null}
    : { items: [
    { id: 'asig-1', tarea_id: 'tarea-1', estado: 'en_proceso', retirada_en: null },
    { id: 'asig-2', tarea_id: 'tarea-1', estado: 'pendiente', retirada_en: 'fecha' }
  ], hay_mas: true, siguiente_cursor: 'asig-2' } });
  c.window.supabaseClient.from=()=>{throw Error('SELECT directo no permitido');};
  const pagina = await s.historialLaboral('trabajador', 'anterior');
  assert.equal(pagina.siguiente_cursor, 'asig-2');
  assert.equal(pagina.items[1].retirada_en, 'fecha');
  assert.equal(pagina.items[0].tarea.titulo, 'Tarea');
  assert.deepEqual(llamadas, [['tareas_pendientes_consultar_v1', {
    p_vista: 'ASIGNACIONES', p_trabajador_id: 'trabajador', p_limite: 10, p_cursor_id: 'anterior'
  }], ['tareas_pendientes_consultar_v1',{p_vista:'TAREAS',p_tarea_id:'tarea-1',p_limite:1}]]);
  c.filaRetirada = { estado: 'pendiente', tarea: { fecha_limite: '2026-11-09', retirada_en: '2026-11-10' } };
  assert.equal(vm.runInContext('gestionIndicadorLaboral(filaRetirada)[1]', c), 'Tarea retirada');
  assert.match(view, /Avance individual:/);
  assert.match(view, /<summary>Historial de trabajos<\/summary>/);
  assert.match(view, /if \(detalle.open && !inicio\) cargar\(\)/);
  for (const [estado, fecha, tono] of [
    ['pendiente', '2026-11-12', 'pendiente'], ['en_proceso', '2026-11-12', 'en-proceso'],
    ['completada', '2026-11-09', 'completada'], ['pendiente', '2026-11-09', 'vencida']
  ]) {
    c.fila = { estado, tarea: { fecha_limite: fecha } };
    assert.equal(vm.runInContext('gestionIndicadorLaboral(fila)[0]', c), tono);
  }
});

test('FIX-01: configuración real activa, contrato alineado y sin CRUD antiguo publicado',()=>{
  assert.match(service,/const GESTION_TAREAS_RPC_HABILITADA = true;/);
  const legacy=fs.readFileSync(frontend+'js/services/tareasPendientes.service.js','utf8');
  assert.doesNotMatch(legacy,/\.(?:insert|update|upsert|delete)\s*\(/);
  const html=fs.readFileSync(frontend+'index.html','utf8');
  assert.equal((html.match(/js\/components\/calendarioMensual\.js/g)||[]).length,1);
  assert(html.indexOf('js/components/calendarioMensual.js')<html.indexOf('js/views/areas.js'));
  assert.doesNotMatch(html,/js\/views\/tareasPendientes\.js/);
  assert.equal(service,fs.readFileSync('publicacion/js/services/gestionTareas.service.js','utf8'));
  assert.equal(view,fs.readFileSync('publicacion/js/views/gestionTareas.js','utf8'));
});
test('FIX-01: ficha Máquina conserva histórico y ofrece programación solo con administración',()=>{
  const source=fs.readFileSync(frontend+'js/views/areas.js','utf8');
  const start=source.indexOf('function mqaFichaHTML()');
  const end=source.indexOf('\nfunction ',start+1);
  const fn=source.slice(start,end);
  assert.match(fn,/mntFichaElementoHTML/);assert.match(fn,/mqaTareasFichaHTML/);
  if(!frontend)assert.match(fn,/mqaPuedeVerTareas\(\) && esAdminOperativoActual\(\)[^]*mqaProgramarTarea/);
  assert.doesNotMatch(source,/usuarioEsExcepcionalEliminacion|USUARIO_ELIMINACION_EXCEPCIONAL/);
});

test('FIX-01: calendario de Máquinas separa tareas e histórico y no inventa fechas',()=>{
  const source=fs.readFileSync(frontend+'js/views/areas.js','utf8');
  const c=vm.createContext({calendarioFechaCivilLocal:d=>d.toISOString().slice(0,10)});
  for(const [name,next] of [['mqaEventosHistoricos','mqaIniciarPestanas'],['mqaEventosTareas',null]]){
    const start=source.indexOf('function '+name+'(');
    const end=next?source.indexOf('function '+next+'(',start):source.indexOf('let mqaSeleccionado',start);
    vm.runInContext(source.slice(start,end),c);
  }
  const equipos=[{id:'maq-1',nombre_original:'Máquina'}];
  const filas=[{id:'hist-1',elemento_id:'maq-1',fecha_realizacion:'2026-11-10',fecha_precision:'DIA'},
    {id:'hist-2',elemento_id:'maq-1',fecha_realizacion:'2026-11-01',fecha_precision:'MES'},
    {id:'hist-3',elemento_id:'otro',fecha_realizacion:'2026-11-10',fecha_precision:'DIA'}];
  const tareas=[{id:'tarea-1',equipo_id:'maq-1',fecha_limite:'2026-11-12'},
    {id:'tarea-2',equipo_id:'otro',fecha_limite:'2026-11-12'}];
  const before=JSON.stringify({equipos,filas,tareas});
  assert.equal(c.mqaEventosHistoricos(equipos,filas).length,1);
  assert.equal(c.mqaEventosTareas(equipos,tareas).length,1);
  assert.equal(c.mqaEventosTareas(equipos,tareas)[0].tarea.id,'tarea-1');
  assert.equal(JSON.stringify({equipos,filas,tareas}),before);
});

test('FIX-VERCEL-01: CSS común cubre calendario de Máquinas con siete columnas y navegación',()=>{
  const css=fs.readFileSync(frontend+'css/ui-system.css','utf8');
  const component=fs.readFileSync(frontend+'js/components/calendarioMensual.js','utf8');
  assert.match(component,/section data-calendario/);
  assert.match(css,/:is\(#tareas-pendientes, \[data-calendario\]\) \.tareas-calendario-grid\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(7,/);
  assert.match(css,/:is\(#tareas-pendientes, \[data-calendario\]\) \.tareas-calendario-encabezado[^{}]*\{[^}]*display:\s*flex/);
  assert(!css.includes('[data-gestion-cal-host]'));
});

// DOM mínimo del componente existente; sin red ni servidor de pruebas adicional.
function calendarioDashboardFixture(){
  const f=preparar(),c=f.c;
  c.Date=class extends Date {constructor(...args){super(...(args.length?args:['2026-11-10T12:00:00']));}};
  const node=()=>({children:[],attributes:{},append(n){this.children.push(n)},replaceChildren(){this.children=[]},
    setAttribute(k,v){this.attributes[k]=v},focus(){this.focused=true}});
  const nodes=Object.fromEntries(['data-mes','data-mes-titulo','data-anterior','data-siguiente','data-hoy','data-dias'].map(k=>['['+k+']',node()]));
  const cal={querySelector:s=>nodes[s]},day={children:[],append(n){this.children.push(n);},innerHTML:'',textContent:'',querySelectorAll(){return this.buttons=[...this.innerHTML.matchAll(/data-gestion-cal="(\d+)"/g)].map(m=>({dataset:{gestionCal:m[1]}}))}};
  const panel={isConnected:true,querySelector:s=>s==='[data-calendario]'?cal:day,setAttribute(){}};
  const go={},open={},host={isConnected:true,querySelector:s=>s==='[data-gestion-cal-panel]'?panel:s==='[data-gestion-ir]'?go:open};
  const box={html:'',lastElementChild:host,querySelector(){return this.html?host:null},insertAdjacentHTML(_,html){this.html+=html}};
  c.document={createElement:node,querySelectorAll:()=>[]};
  vm.runInContext(fs.readFileSync(frontend+'js/components/calendarioMensual.js','utf8'),c);
  const navigation=[],details=[];c.hasAccess=()=>c.admin;c.navigateTo=route=>navigation.push(route);c.gestionAbrirFicha=id=>details.push(id);
  return {...f,nodes,day,panel,box,host,go,open,navigation,details};
}

test('375K.30A calendario abierto: componente real, período/hoy/días, consulta mensual única y permisos',async()=>{
  const f=calendarioDashboardFixture(),{c,s,box,nodes,day}=f;const reads=[];
  s.todas=async(v,p)=>{reads.push([v,p]);const row={id:'uno',titulo:'Trabajo autorizado',fecha_limite:p.p_desde.slice(0,7)+'-10',estado:'pendiente'};return [row,row]};
  c.gestionMontarCalendario(box,'Calendario general',null,{abierto:true,enlaceGestion:true});
  c.gestionMontarCalendario(box,'Calendario general',null,{abierto:true,enlaceGestion:true});
  await new Promise(setImmediate);
  assert.equal(reads.length,1);assert.equal((box.html.match(/data-gestion-cal-host/g)||[]).length,1);
  assert(!box.html.includes('Consultar calendario'));assert(box.html.includes('alm-btn-primary'));assert(box.html.includes('Gestión de tareas'));
  assert(day.innerHTML.includes('Trabajo autorizado'));assert.equal((day.innerHTML.match(/<article/g)||[]).length,1);
  assert.equal(nodes['[data-dias]'].children.filter(n=>n.type==='button').length,30);
  assert(nodes['[data-dias]'].children.find(n=>n.type==='button'&&n.textContent===10).children[0].children[0].className.includes('tarea-pendiente-proxima'));
  day.buttons[0].onclick();assert.deepEqual(f.details,['uno']);
  const abrirAnterior=day.buttons[0].onclick;
  nodes['[data-dias]'].children.find(n=>n.type==='button'&&n.textContent===11).onclick();await new Promise(setImmediate);
  assert.equal(reads.length,1);assert(day.innerHTML.includes('Sin tareas'));
  nodes['[data-siguiente]'].onclick();await new Promise(setImmediate);assert.equal(reads.length,2);assert.equal(nodes['[data-mes]'].value,'2026-12');
  nodes['[data-anterior]'].onclick();await new Promise(setImmediate);assert.equal(reads.length,2);assert.equal(nodes['[data-mes]'].value,'2026-11');
  nodes['[data-mes]'].value='2027-02';nodes['[data-mes]'].onchange();await new Promise(setImmediate);
  assert.equal(reads.length,3);assert.equal(reads[2][1].p_hasta,'2027-02-28');
  nodes['[data-hoy]'].onclick();await new Promise(setImmediate);assert.equal(reads.length,3);assert(day.innerHTML.includes('Trabajo autorizado'));
  f.go.onclick();assert.deepEqual(f.navigation,['tareas-pendientes']);
  c.admin=false;f.go.onclick();nodes['[data-hoy]'].onclick();await new Promise(setImmediate);
  abrirAnterior();assert.equal(f.details.length,1);
  assert.equal(reads.length,3);assert.equal(f.navigation.length,1);assert(!day.textContent.includes('Trabajo autorizado'));
  assert(nodes['[data-dias]'].children.filter(n=>n.type==='button').every(n=>n.children.length===0));
  const denied=calendarioDashboardFixture();denied.c.admin=false;
  denied.s.todas=()=>assert.fail('Sin acceso no consulta');denied.c.gestionMontarCalendario(denied.box,'No',null,{abierto:true,enlaceGestion:true});assert.equal(denied.box.html,'');
  denied.c.admin=true;denied.c.hasAccess=()=>false;
  denied.c.gestionMontarCalendario(denied.box,'No',null,{abierto:true,enlaceGestion:true});assert.equal(denied.box.html,'');
});

test('375K.30A calendario: respuestas antiguas/desmontadas no pintan y modo cerrado original se conserva',async()=>{
  const f=calendarioDashboardFixture();const pending=[];
  f.s.todas=()=>new Promise(resolve=>pending.push(resolve));
  f.c.gestionMontarCalendario(f.box,'General',null,{abierto:true,enlaceGestion:true});
  f.nodes['[data-siguiente]'].onclick();
  pending[1]([{id:'nueva',titulo:'Mes nuevo',fecha_limite:'2026-12-01'}]);await new Promise(setImmediate);
  const html=f.day.innerHTML;
  pending[0]([{id:'vieja',titulo:'No pintar',fecha_limite:'2026-11-10'}]);await new Promise(setImmediate);assert.equal(f.day.innerHTML,html);
  f.nodes['[data-siguiente]'].onclick();f.panel.isConnected=false;
  pending[2]([{id:'desmontada',titulo:'No mostrar',fecha_limite:'2027-01-01'}]);await new Promise(setImmediate);assert(!f.day.innerHTML.includes('No mostrar'));
  const count=pending.length;f.nodes['[data-hoy]'].onclick();assert.equal(pending.length,count);
  const original=calendarioDashboardFixture();let reads=0;original.s.todas=async()=>{reads++;return []};
  original.c.gestionMontarCalendario(original.box,'Original');assert(original.box.html.includes('Consultar calendario'));assert.equal(reads,0);
  original.open.onclick();await new Promise(setImmediate);assert.equal(reads,1);
  const revocada=calendarioDashboardFixture();let resolve;
  revocada.s.todas=()=>new Promise(r=>{resolve=r});
  revocada.c.gestionMontarCalendario(revocada.box,'General',null,{abierto:true,enlaceGestion:true});
  revocada.c.admin=false;resolve([{id:'secreto',titulo:'No mostrar',fecha_limite:'2026-11-10'}]);
  await new Promise(setImmediate);assert(!revocada.day.innerHTML.includes('No mostrar'));
});

test('375K.30C Dashboard: botón dentro de tarjeta compacta, UUID hacia detalle y ninguna consulta de asignaciones',async()=>{
  const f=calendarioDashboardFixture();const reads=[];
  f.s.todas=async(v)=>{reads.push(v);return [{id:'uuid-tarea-correcta',titulo:'Título <largo> '+ 'x'.repeat(180),estado:'pendiente',fecha_limite:'2026-11-10'}]};
  vm.runInContext(view.slice(view.indexOf('function gestionAbrirFicha('),view.indexOf('function gestionMontarCalendario(')),f.c);
  const navigation=[];f.c.navigateTo=route=>navigation.push([route,vm.runInContext('gestionEntrada.tarea',f.c)]);
  f.c.gestionMontarCalendario(f.box,'Calendario general',null,{abierto:true,enlaceGestion:true});
  await new Promise(setImmediate);
  const html=f.day.innerHTML;
  assert.match(html,/<article[^]*Ver tarea[^]*<\/article>$/);assert.equal((html.match(/<article/g)||[]).length,1);
  assert(html.includes('flex items-center gap-3'));assert(html.includes('shrink-0'));assert(html.includes('break-words'));
  assert(html.includes('&lt;largo&gt;'));assert(html.includes('Responsables: consultar en Ver tarea.'));assert(!html.includes('progreso'));
  f.day.buttons[0].onclick();assert.deepEqual(navigation,[['tareas-pendientes','uuid-tarea-correcta']]);
  assert.equal(vm.runInContext('gestionEntrada',f.c),null);assert.deepEqual(reads,['TAREAS']);
});

test('375K.30C Gestión: responsables reales, avance individual, caché por día y respuesta tardía protegida',async()=>{
  const f=calendarioDashboardFixture(),reads=[];let resolve;
  f.s.todas=async(v,p)=>{
    reads.push([v,p]);if(v==='TAREAS')return [
      {id:'tarea-real',titulo:'Trabajo del día',estado:'pendiente',fecha_limite:'2026-11-10'},
      {id:'otra-fecha',titulo:'No consultar aún',estado:'pendiente',fecha_limite:'2026-11-11'}];
    assert.equal(p.p_tarea_id,'tarea-real');return new Promise(r=>{resolve=r});
  };
  const details=[];
  f.c.gestionCalendario(f.panel,t=>details.push(t.id),null,{detallado:true});
  await new Promise(setImmediate);
  assert(f.day.innerHTML.includes('Trabajo del día'));assert(f.day.innerHTML.includes('Responsables: consultar'));
  assert.match(f.day.innerHTML,/<article[^]*Ver tarea[^]*<\/article>$/);
  f.nodes['[data-hoy]'].onclick();await new Promise(setImmediate);assert.equal(reads.length,2);
  resolve([
    {id:'a1',tarea_id:'tarea-real',trabajador_nombre:'Persona <uno>',progreso:35,retirada_en:null},
    {id:'a2',tarea_id:'tarea-real',trabajador_nombre:'Persona dos',progreso:100,retirada_en:null},
    {id:'a3',tarea_id:'tarea-real',trabajador_nombre:'Retirado',progreso:10,retirada_en:'2026-11-01'}
  ]);
  await new Promise(setImmediate);
  assert(f.day.innerHTML.includes('Persona &lt;uno&gt;'));assert(!f.day.innerHTML.includes('35 %'));assert(!f.day.innerHTML.includes('100 %'));
  assert(f.day.innerHTML.includes('Fecha límite: 10-11-2026'));assert(!f.day.innerHTML.includes('Retirado'));
  f.day.buttons[0].onclick();assert.deepEqual(details,['tarea-real']);
  f.nodes['[data-hoy]'].onclick();await new Promise(setImmediate);assert.equal(reads.length,2);
  f.c.admin=false;f.nodes['[data-hoy]'].onclick();await new Promise(setImmediate);assert.equal(reads.length,2);
  assert(!f.day.textContent.includes('Persona'));
});

test('375K.30C Gestión: datos secundarios ausentes/ajenos no fabrican responsables ni porcentaje',async()=>{
  for(const caso of ['error','ajena','vacio','sin_progreso','desmontada']){
    const f=calendarioDashboardFixture();let resolve;
    f.s.todas=async(v)=>{
      if(v==='TAREAS')return [{id:'t1',titulo:'Trabajo visible',estado:'pendiente',fecha_limite:'2026-11-10'}];
      if(caso==='error')throw Error('Sin acceso');
      if(caso==='desmontada')return new Promise(r=>{resolve=r});
      return caso==='vacio'?[]:[{id:'a1',tarea_id:caso==='ajena'?'otra':'t1',trabajador_nombre:'Nombre real',progreso:null}];
    };
    f.c.gestionCalendario(f.panel,()=>{},null,{detallado:true});await new Promise(setImmediate);
    if(caso==='desmontada'){
      f.panel.isConnected=false;const html=f.day.innerHTML;
      resolve([{id:'a1',tarea_id:'t1',trabajador_nombre:'No pintar',progreso:5}]);await new Promise(setImmediate);
      assert.equal(f.day.innerHTML,html);continue;
    }
    assert(f.day.innerHTML.includes('Trabajo visible'));
    assert(f.day.innerHTML.includes(caso==='vacio'?'Sin responsables vigentes':caso==='sin_progreso'?'Nombre real':'Responsables no disponibles'));
    assert(!f.day.innerHTML.includes('null %'));assert(!f.day.innerHTML.includes('0 %'));
  }
});

test('375K.30E indicadores: completada tiene prioridad, estados mixtos, leyenda y fechas civiles locales',()=>{
  const f=calendarioDashboardFixture();
  const panel=f.panel.querySelector('[data-calendario]');
  const cal=f.c.iniciarCalendarioMensual(panel,{fechaRegistro:t=>t.fecha_limite,etiquetaCantidad:n=>n+' tareas',alSeleccionar(){}});
  const filas=[...Array.from({length:3},()=>({fecha_limite:'2026-11-09',estado:'pendiente'})),
    ...Array.from({length:2},()=>({fecha_limite:'2026-11-09',estado:'completada'})),
    {fecha_limite:'2026-11-10',estado:'pendiente'},{fecha_limite:'2026-11-11',estado:'pendiente'},
    {fecha_limite:'2026-11-12',estado:'pendiente'},{fecha_limite:'2026-10-01',estado:'completada'}];
  cal.pintar(filas,'2026-11-10');
  const dia=n=>f.nodes['[data-dias]'].children.find(x=>x.type==='button'&&x.textContent===n);
  const badges=n=>dia(n).children[0]?.children||[];
  assert.deepEqual(badges(9).map(b=>[b.className,b.textContent]),[['tareas-calendario-cantidad tarea-completada',2],['tareas-calendario-cantidad tarea-pendiente-vencida',3]]);
  assert(dia(9).attributes['aria-label'].includes('2 completadas'));assert(dia(9).attributes['aria-label'].includes('3 vencidas'));
  for(const n of [10,11])assert(badges(n)[0].className.includes('tarea-pendiente-proxima'));
  assert(badges(12)[0].className.includes('tarea-pendiente-plazo'));
  const html=f.c.calendarioMensualHTML();assert(html.includes('tareas-calendario-leyenda'));
  for(const texto of ['Pendiente en plazo','Vence hoy o mañana','Completada','Vencida sin completar'])assert(html.includes(texto));
  const c=vm.createContext({});vm.runInContext(fs.readFileSync(frontend+'js/components/calendarioMensual.js','utf8'),c);
  // Fecha con representación UTC distinta: se leen sus componentes civiles, no ISO.
  assert.equal(c.calendarioFechaCivilLocal({getFullYear:()=>2026,getMonth:()=>10,getDate:()=>10,toISOString:()=>{throw Error('No UTC')}}),'2026-11-10');
});

test('375K.30E Máquinas comparte estados sin convertir históricos completados en vencidos',()=>{
  const f=calendarioDashboardFixture();const source=fs.readFileSync(frontend+'js/views/areas.js','utf8');
  const start=source.indexOf('  const mensual = iniciarCalendarioMensual('),end=source.indexOf('\n  for (const boton',start);
  f.c.calendario=f.panel.querySelector('[data-calendario]');f.c.pintarDia=()=>{};
  vm.runInContext(source.slice(start,end),f.c);
  f.c.eventos=[{fecha:'2026-11-09',fila:{id:'historico'}},{fecha:'2026-11-09',tarea:{estado:'pendiente'}},
    {fecha:'2026-11-09',tarea:{estado:'completada'}}];
  vm.runInContext("mensual.pintar(eventos,'2026-11-10')",f.c);
  const b=f.nodes['[data-dias]'].children.find(n=>n.textContent===9).children[0].children;
  assert.equal(b.find(n=>n.className.includes('tarea-completada')).textContent,2);
  assert.equal(b.find(n=>n.className.includes('tarea-pendiente-vencida')).textContent,1);
});

test('375K.30E contraste de números AA en las ocho combinaciones claro/oscuro',()=>{
  const lum=hex=>{const rgb=hex.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
  const css=fs.readFileSync(frontend+'css/ui-system.css','utf8').split('/* 375K.30E:')[1];
  const pairs=[...css.matchAll(/background:#([a-f0-9]{6}); color:#([a-f0-9]{6})/g)];assert.equal(pairs.length,8);
  for(const [,bg,fg]of pairs){const a=lum(bg),b=lum(fg);assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5);}
  assert(css.includes('border-radius:999px'));assert(css.includes('font-weight:800'));assert(css.includes('flex-wrap:wrap'));
});

test('375K.30F medición: dos lecturas mensuales iguales pasan de 2 RPC/1 duplicada a 1 RPC/0 duplicadas',async()=>{
  const {s,c,llamadas}=preparar();c.respuesta=()=>({data:{items:[{id:'t1',titulo:'Original'}],hay_mas:false}});
  const mes={p_desde:'2026-11-01',p_hasta:'2026-11-30'};
  const a=await s.todas('TAREAS',mes);a[0].titulo='No contaminar caché';
  const b=await s.todas('TAREAS',mes);assert.equal(b[0].titulo,'Original');assert.equal(llamadas.length,1);
  s.invalidarLecturas();await s.todas('TAREAS',mes);assert.equal(llamadas.length,2);
});

test('375K.30F caché mensual: caducidad, sesión, permisos, actor, parámetros y fallos aislados',async()=>{
  const p={p_desde:'2026-11-01',p_hasta:'2026-11-30'};
  for(const cambio of ['ttl','sesion','permisos','actor','parametros','mutacion']){
    const {s,c,llamadas}=preparar();let ahora=1000;c.Date=class extends Date{static now(){return ahora}};
    c.respuesta=()=>({data:{items:[],hay_mas:false}});await s.todas('TAREAS',p);
    if(cambio==='ttl')ahora+=15001;
    if(cambio==='sesion')c.authListener('SIGNED_OUT');
    if(cambio==='permisos')c.state.currentUser.permissions={modules:['tareas-pendientes']};
    if(cambio==='actor')c.state.currentUser.id='otro-actor';
    if(cambio==='mutacion')s.invalidarLecturas();
    await s.todas('TAREAS',cambio==='parametros'?{p_desde:'2026-12-01',p_hasta:'2026-12-31'}:p);assert.equal(llamadas.length,2,cambio);
    if(cambio==='permisos'){
      delete c.state.currentUser.permissions;await s.todas('TAREAS',p);assert.equal(llamadas.length,3);
    }
    const antes=llamadas.length;c.admin=false;await assert.rejects(s.todas('TAREAS',p));assert.equal(llamadas.length,antes);
  }
  const f=preparar();f.c.respuesta=()=>({error:{code:'42501'}});
  await assert.rejects(f.s.todas('TAREAS',p));await assert.rejects(f.s.todas('TAREAS',p));assert.equal(f.llamadas.length,2);
});

test('375K.31 fechas civiles y valores nulos/ilegibles: sin desplazamiento UTC ni fechas inventadas',()=>{
  const {c}=preparar();
  for(const [input,esperado]of [['2026-01-02','02-01-2026'],['2024-02-29','29-02-2024'],['2026-12-31','31-12-2026'],['1/2/2026','01-02-2026']])assert.equal(c.formatDate(input),esperado);
  for(const input of [null,undefined,'','2026-02-29','2026-02-30','2026-13-01','texto','2026-01-02xx'])
    assert.equal(c.formatearFechaCL(input,{vacio:'Sin fecha'}),'Sin fecha');
  assert.equal(c.formatearFechaCL('febrero 2026',{civil:true,invalida:'febrero 2026'}),'febrero 2026');
  assert.equal(c.formatearFechaCL('2026-01-02texto',{civil:true,vacio:null}),null);
});

test('375K.31 timestamps operativos: America/Santiago, cambio de año y 24 horas sin segundos',()=>{
  const {c}=preparar();
  for(const [input,expected]of [['2026-11-10T01:15:45Z','09-11-2026 22:15'],['2026-01-01T02:30:00Z','31-12-2025 23:30'],
    ['2026-06-01T04:05:00Z','01-06-2026 00:05'],['2026-11-10T00:15:00-03:00','10-11-2026 00:15']])
    assert.equal(c.formatearFechaCL(input,{hora:true}),expected);
  assert.equal(c.formatearFechaCL('2026-11-10T01:15:00Z'),'09-11-2026');
  assert.equal(c.formatearFechaCL('2026-11-10 01:15:00+00',{hora:true}),'09-11-2026 22:15');
  assert.equal(c.formatearFechaCL('2026-11-10T01:15:00+0000',{hora:true}),'09-11-2026 22:15');
  assert.equal(c.formatearFechaCL('2026-11-10T01:15:00Z',{civil:true}),'10-11-2026');
  for(const input of ['2026-01-02T24:00:00Z','2026-01-02T12:61:00Z','2026-01-02T12:00:00'])
    assert.equal(c.formatearFechaCL(input,{hora:true,vacio:'Fecha no válida'}),'Fecha no válida');
});

test('375K.31 adaptadores reales de vistas y documentos usan formato central con sus mensajes originales',()=>{
  const c=vm.createContext({window:{},areaTexto:(v,f)=>v??f});vm.runInContext(fechasPresentacion,c);
  const cases=[['views/trabajadores.js','trabajadoresFormatoFecha',true,'Sin fecha registrada'],['views/mantenciones.js','mntFormatoFechaCorta',false,null],
    ['views/mantenciones.js','mntFechaHoraRevisionTexto',true,'Fecha no registrada'],['views/inventario.js','invFechaHora',true,'Fecha no registrada'],
    ['views/inventario.js','invHistFecha',false,'Sin fecha registrada'],['views/solicitudes.js','solicitudesFecha',false,'Sin fecha registrada'],
    ['views/reactiva.js','reactivaFecha',false,'Sin fecha registrada'],['views/reactiva.js','reactivaFechaHoraChile',true,'Sin fecha registrada'],
    ['views/prevencionista.js','pvFecha',false,null],['views/prevencionista.js','pvFechaSubida',false,null],['views/admin.js','adminFormatearFechaHora',true,'—'],
    ['app.js','formatearFechaHoraCL',true,'—'],['views/areas.js','areaFecha',false,'Sin fecha registrada']];
  for(const [file,name,hora,vacio]of cases){
    const code=fs.readFileSync(frontend+'js/'+file,'utf8'),re=new RegExp('function '+name+'\\([^]*?\\n\\}'),fn=code.match(re)?.[0];assert(fn,name);
    vm.runInContext(fn,c);assert.equal(c[name]('2026-11-10'),'10-11-2026',name);assert.equal(c[name](null),vacio,name);
    if(hora)assert.equal(c[name]('2026-11-10T01:15:00Z'),'09-11-2026 22:15',name);
  }
});

test('375K.31 representación no cambia valores ISO de formularios, RPC, filtros ni vencimientos',()=>{
  const {s,c}=preparar();assert.equal(s.mes('2026-11-10').p_desde,'2026-11-01');assert.equal(s.mes('2026-11-10').p_hasta,'2026-11-30');
  assert.match(view,/type="date" required value="\$\{gestionEsc\(t\?\.fecha_limite\)\}/);
  assert.match(view,/p_fecha_limite: fecha/);assert.match(view,/fecha_limite < calendarioFechaCivilLocal\(\)/);
  const html=c.gestionTareaResumen({titulo:'Trabajo',estado:'pendiente',fecha_limite:'2026-11-10'});assert(html.includes('10-11-2026'));assert(!html.includes('2026-11-10'));
  const htmlIndex=fs.readFileSync(frontend+'index.html','utf8');assert(htmlIndex.indexOf('./js/state.js')<htmlIndex.indexOf('./js/views/gestionTareas.js'));
});

test('375K.30H KPI ubicaciones: contador exacto HEAD conserva alcance y evita descargar filas',async()=>{
  const code=fs.readFileSync(frontend+'js/services/mantenciones.service.js','utf8');
  const method=code.slice(code.indexOf('  async getUbicacionesTV('),code.indexOf('  async getUbicacionesOcupadasTV(',code.indexOf('  async getUbicacionesTV(')));
  let gets=0,heads=0,filas=0,count=501,error=null;
  const query={order(){return this},async range(desde,hasta){gets++;const data=Array.from({length:Math.max(0,Math.min(501-desde,hasta-desde+1))},(_,i)=>({id:desde+i,nombre:'Ubicación simulada'}));filas+=data.length;return {data}}};
  const c=vm.createContext({window:{supabaseClient:{from:tabla=>{assert.equal(tabla,'ubicaciones');return {select:(fields,options)=>{
    if(options?.head){heads++;assert.equal(fields,'id');assert.equal(options.count,'exact');return Promise.resolve({count,error});}return query;
  }}}}}});
  vm.runInContext('var servicio={'+method+'};',c);
  assert.equal((await c.servicio.getUbicacionesTV(true)).length,501);assert.equal(gets,3);assert.equal(filas,501);
  assert.equal(await c.servicio.getUbicacionesTV(true,{soloCantidad:true}),501);assert.equal(heads,1);assert.equal(gets,3);
  count=0;assert.equal(await c.servicio.getUbicacionesTV(true,{soloCantidad:true}),0);
  count=null;await assert.rejects(c.servicio.getUbicacionesTV(true,{soloCantidad:true}));
  error={code:'42501'};await assert.rejects(c.servicio.getUbicacionesTV(true,{soloCantidad:true}));
});


test('375K.32C pestañas, tarjetas y consulta conservan acciones sin eliminación ficticia',()=>{
 const {c}=preparar();c.uiEncabezadoSeccion=()=>'';
 const html=c.renderGestionTareas();
 assert(html.indexOf('data-gestion-filtro="calendario"')<html.indexOf('data-gestion-filtro="pendiente"'));
 assert(html.indexOf('data-gestion-filtro="pendiente"')<html.indexOf('data-gestion-filtro="completada"'));
 assert(view.includes("let tareas = [], filtro = 'calendario'"));
 assert(view.includes("accion: gestionBoton('Ver tarea', 'data-gestion-tarea="));
 const card=c.gestionTareaResumen({id:'t1',titulo:'Título largo <seguro>',estado:'pendiente',fecha_limite:'2026-11-10'},{accion:vm.runInContext("gestionBoton('Ver tarea','data-gestion-tarea=\"0\"')",c)});
 assert(card.indexOf('Ver tarea')<card.indexOf('</article>'));assert.match(card,/data-gestion-acciones/);
 assert.match(card,/10-11-2026/);assert.match(card,/&lt;seguro&gt;/);assert.doesNotMatch(card,/Eliminar/);
 assert.match(view,/guardar.hidden = !fn/);assert(view.includes('if (admin && entrada?.equipo)'));assert(view.includes('if (entrada?.tarea)'));
});

test('375K.34B detalle con pestañas conserva permisos y solo lee historial bajo demanda',async()=>{
 const {c}=preparar();const llamadas=[];let titulo,contenido,confirmacion,paginaHistoria=0;const cursoresHistoria=[];
 const tabs=['responsables','historial'].map(tipo=>({dataset:{gestionTab:tipo},setAttribute(k,v){this[k]=v;},focus(){this.focused=true;}}));
 const panels=['responsables','historial'].map(tipo=>({dataset:{gestionPanel:tipo},hidden:tipo!=='responsables'}));
 const nodos=new Map();const nodo=selector=>{if(!nodos.has(selector))nodos.set(selector,{disabled:false,hidden:false,open:false,isConnected:true,insertAdjacentHTML(_pos,html){this.html=(this.html||'')+html;}});return nodos.get(selector);};
 Object.assign(c,{seleccion:null,versionDetalle:0,admin:true,edicion:false,modal:{open:true},sigue:()=>true,
  ocupada:false,ejecutar:fn=>Promise.resolve().then(fn),abrir(t,html){titulo=t;contenido=html;confirmacion=arguments[2];},
  campos:{replaceChildren(){},querySelector:q=>contenido.includes(q.slice(1,-1))?nodo(q):null,querySelectorAll:q=>q==='[data-gestion-tab]'?tabs:q==='[data-gestion-panel]'?panels:[]},
  servicio:{pagina:async(v,filtros)=>{llamadas.push(v);if(v==='HISTORIAL'){cursoresHistoria.push(filtros.p_cursor_revision);paginaHistoria++;return {items:paginaHistoria===1?[{accion:'EDITAR',revision:3,registrada_en:'2026-11-10T15:00:00Z'},{accion:'CREAR',revision:4,registrada_en:'2026-11-10T16:00:00Z'}]:[{accion:'AVANCE',revision:2,registrada_en:'2026-11-10T14:00:00Z'}],hay_mas:paginaHistoria===1,siguiente_cursor:paginaHistoria===1?3:null};}return {items:v==='TAREAS'?[{id:'t1',titulo:'Tarea real',descripcion:'Descripción',estado:'pendiente',fecha_limite:'2026-11-12',revision:3}]:[],hay_mas:false};},
    todas:async()=>{llamadas.push('ASIGNACIONES');return [{id:'a1',trabajador_id:'w1',trabajador_nombre:'Ana',progreso:20,estado:'pendiente'},{id:'a2',trabajador_id:'w2',trabajador_nombre:'Bea',progreso:100,estado:'completada'}];}}});
 vm.runInContext(view.slice(view.indexOf('  async function detalle('),view.indexOf('  async function accionDetalle(')),c);
 await c.detalle('t1');assert.equal(titulo,'Tarea real');assert.deepEqual(llamadas,['TAREAS','ASIGNACIONES']);
 assert.equal((contenido.match(/gestion-responsable-avatar/g)||[]).length,2);assert.equal((contenido.match(/data-gestion-accion="RETIRAR"/g)||[]).length,2);
 const primeraTarjeta=contenido.slice(contenido.indexOf('<article class="alm-panel gestion-responsable-tarjeta"'),contenido.indexOf('</article>'));assert(primeraTarjeta.indexOf('data-gestion-accion="RETIRAR"')<primeraTarjeta.indexOf('gestion-responsable-acciones'));
assert.equal((contenido.match(/data-gestion-accion="COMPLETAR"/g)||[]).length,1);
 for(const label of ['Descripción','Responsables','Historial de actividad','Avanzar','Reasignar','Agregar responsable','Retirar asignación','Retirar tarea'])assert(contenido.includes(label),label);
 assert.match(contenido,/role="tablist"/);assert.doesNotMatch(contenido,/<details|Eliminar tarea/);
 assert.match(contenido,/value="60"/);assert.match(contenido,/1 de 2 responsables completados/);
 tabs[1].onclick();tabs[1].onclick();await new Promise(setImmediate);
 assert.equal(llamadas.filter(v=>v==='HISTORIAL').length,1);assert.equal(panels[1].hidden,false);assert.equal(panels[0].hidden,true);
 tabs[0].onclick();tabs[1].onclick();tabs[1].onclick();await new Promise(setImmediate);
 assert.equal(llamadas.filter(v=>v==='HISTORIAL').length,1);assert.equal(llamadas.length,3);assert.equal(titulo,'Tarea real');
 const historialNodo=nodo('[data-gestion-historial-lista]');assert(!contenido.includes('data-gestion-historial hidden'));
 assert(historialNodo.html.indexOf('Tarea creada')<historialNodo.html.indexOf('Tarea editada'));
 const scroll=nodo('[data-gestion-panel="historial"]');scroll.scrollHeight=700;scroll.clientHeight=200;scroll.scrollTop=490;
 scroll.onscroll();await new Promise(setImmediate);assert.equal(llamadas.filter(v=>v==='HISTORIAL').length,1);
 scroll.onwheel();scroll.scrollTop=500;scroll.onscroll();await new Promise(setImmediate);
 assert.deepEqual(cursoresHistoria,[undefined,3]);assert(historialNodo.html.includes('Avance registrado'));
 scroll.onwheel();scroll.scrollTop=510;scroll.onscroll();await new Promise(setImmediate);assert.equal(llamadas.filter(v=>v==='HISTORIAL').length,2);
 assert(!/Revisión|<pre|Ver avances registrados|Ver cambios/.test(historialNodo.html));
 tabs[1].onkeydown({key:'Home',preventDefault(){}});assert.equal(tabs[0]['aria-selected'],'true');assert(tabs[0].focused);
 tabs[0].onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(tabs[1]['aria-selected'],'true');
 c.ocupada=true;tabs[1].onclick();assert.equal(tabs[1]['aria-selected'],'true');c.ocupada=false;
 c.sigue=()=>false;tabs[0].onclick();assert.equal(tabs[1]['aria-selected'],'true');c.sigue=()=>true;
 c.permanente=false;await c.detalle('t1');assert(!contenido.includes('data-gestion-retirar'));
 c.servicio.pagina=async()=>({items:[{id:'t1',titulo:'Finalizada',estado:'completada',fecha_limite:'2026-11-12'}]});
 await c.detalle('t1');assert(contenido.includes('Reabrir'));assert(!contenido.includes('data-gestion-accion="AVANCE"'));
 assert(!contenido.includes('data-gestion-editar'));assert(!contenido.includes('data-gestion-retirar'));
 const mutaciones=[];c.form={elements:{reabrir_asignacion:{value:''}}};c.mutar=(nombre,t,datos)=>mutaciones.push([nombre,datos]);
 await nodo('[data-gestion-reabrir]').onclick();assert(contenido.includes('Selecciona responsable'));
 assert.equal(mutaciones.length,0);assert.throws(()=>confirmacion(),/Selecciona una asignación/);
 c.form.elements.reabrir_asignacion.value='a2';confirmacion();assert.equal(mutaciones[0][1].p_asignacion_id,'a2');assert.equal(mutaciones[0][1].p_accion,'REABRIR');
 c.gestionHoyChile=()=> '2026-11-17';
 c.servicio.todas=async()=>[{id:'a-unica',trabajador_id:'w-unico',trabajador_nombre:'Técnico demo',progreso:25,estado:'en_proceso'}];
 c.servicio.pagina=async()=>({items:[{id:'t1',titulo:'Tarea individual',descripcion:'Descripción individual',estado:'pendiente',fecha_limite:'2026-11-12'}]});
 await c.detalle('t1');assert.equal((contenido.match(/gestion-responsable-avatar/g)||[]).length,1);assert(contenido.includes('25 % de avance'));assert(contenido.includes('TD'));assert(contenido.includes('gestion-fecha-vencida'));assert(!contenido.includes('data-gestion-accion="RETIRAR"'));
 c.admin=false;await c.detalle('t1');assert(!contenido.includes('data-gestion-editar'));assert(!contenido.includes('data-gestion-retirar'));c.admin=true;
 c.servicio.pagina=async()=>({items:[{id:'t1',titulo:'Retirada',estado:'pendiente',fecha_limite:'2026-11-12',retirada_en:'fecha'}]});await c.detalle('t1');assert(!contenido.includes('data-gestion-editar'));assert(!contenido.includes('data-gestion-retirar'));
});

test('375K.32C asignaciones del calendario y detalle reutilizan una lectura sin mutarse entre sí',async()=>{
 const {c,s,llamadas}=preparar();let resolver;
 c.respuesta=()=>new Promise(r=>resolver=r);
 const p={p_tarea_id:'t1'},a=s.todas('ASIGNACIONES',p),b=s.todas('ASIGNACIONES',p);
 resolver({data:{items:[{id:'a1',tarea_id:'t1',progreso:20}],hay_mas:false,siguiente_cursor:null}});
 const [x,y]=await Promise.all([a,b]);x[0].progreso=99;
 assert.equal(y[0].progreso,20);assert.equal((await s.todas('ASIGNACIONES',p))[0].progreso,20);assert.equal(llamadas.length,1);
 s.invalidarLecturas();c.respuesta=()=>({data:{items:[],hay_mas:false,siguiente_cursor:null}});
 await s.todas('ASIGNACIONES',p);assert.equal(llamadas.length,2);
});

test('375K.32C caché de asignaciones respeta TTL, sesión, actor, permisos, parámetros y errores',async()=>{
 for(const cambio of ['ttl','sesion','actor','permisos','mutacion','parametros']){
  const {c,s,llamadas}=preparar();let ahora=1000;c.Date={now:()=>ahora};
  c.respuesta=()=>({data:{items:[],hay_mas:false,siguiente_cursor:null}});const p={p_tarea_id:'t1'};
  await s.todas('ASIGNACIONES',p);await s.todas('ASIGNACIONES',p);assert.equal(llamadas.length,1);
  if(cambio==='ttl')ahora+=15001;if(cambio==='sesion')c.authListener('SIGNED_OUT');if(cambio==='actor')c.state.currentUser.id='actor-b';
  if(cambio==='permisos')c.state.currentUser.permissions={modules:['tareas-pendientes']};if(cambio==='mutacion')s.invalidarLecturas();
  await s.todas('ASIGNACIONES',cambio==='parametros'?{p_tarea_id:'t2'}:p);assert.equal(llamadas.length,2,cambio);
  c.admin=false;await assert.rejects(s.todas('ASIGNACIONES',p));assert.equal(llamadas.length,2);
 }
 const {c,s,llamadas}=preparar();c.respuesta=()=>({error:{code:'42501'}});
 await assert.rejects(s.todas('ASIGNACIONES',{p_tarea_id:'t1'}));await assert.rejects(s.todas('ASIGNACIONES',{p_tarea_id:'t1'}));assert.equal(llamadas.length,2);
});


test('375K.33B Completar requiere confirmación y usa AVANCE=100 con UUID y revisión existentes',async()=>{
 const {c,s,llamadas}=preparar();let confirmar,html;
 Object.assign(c,{abrir(t,contenido,fn,texto){assert.equal(t,'Completar responsable');assert.equal(texto,'Completar');html=contenido;confirmar=fn;},
   mutar:(nombre,t,datos)=>s.mutar(nombre,{p_tarea_id:t.id,p_revision_esperada:t.revision,...datos})});
 vm.runInContext(view.slice(view.indexOf('  async function accionDetalle('),view.indexOf('  async function guardarOperacion(')),c);
 const tarea={id:'tarea-1',revision:9,estado:'pendiente'},a={id:'a-1',trabajador_nombre:'Ana <seguro>',estado:'pendiente'};
 await c.accionDetalle(tarea,'COMPLETAR',a,[]);assert.equal(llamadas.length,0);assert.match(html,/Ana &lt;seguro&gt;/);
 await confirmar();assert.equal(llamadas.length,1);
 const [rpc,args]=llamadas[0];assert.equal(rpc,'tareas_pendientes_responsables_v1');
 assert.equal(args.p_accion,'AVANCE');assert.equal(args.p_progreso,100);assert.equal(args.p_asignacion_id,'a-1');
 assert.equal(args.p_revision_esperada,9);assert.equal(args.p_solicitud_id,'solicitud-1');assert.equal(args.p_tarea_id,'tarea-1');
 assert.equal(args.p_incorporar,null);assert.equal(args.p_retirar,null);assert.equal(tarea.estado,'pendiente');
 for(const [t,w]of [[{...tarea,estado:'completada'},a],[{...tarea,retirada_en:'fecha'},a],[tarea,{...a,retirada_en:'fecha'}],[tarea,{...a,estado:'completada'}]])
   await assert.rejects(c.accionDetalle(t,'COMPLETAR',w,[]));
 assert.equal(llamadas.length,1);
});

test('375K.33B avance completo incierto se recupera con mismo UUID y payload sin doble envío',async()=>{
 const almacen=new Map(),f=preparar({almacen});let resolver;
 f.c.respuesta=()=>new Promise(r=>resolver=r);
 const args={p_tarea_id:'t1',p_revision_esperada:4,p_accion:'AVANCE',p_asignacion_id:'a1',p_progreso:100,p_incorporar:null,p_retirar:null};
 const primera=f.s.mutar('responsables',args);
 await assert.rejects(f.s.mutar('responsables',args));assert.equal(f.llamadas.length,1);
 resolver({error:{code:'NETWORK_ERROR'}});await assert.rejects(primera);assert(f.s.tienePendiente());
 const rec=preparar({almacen});await rec.s.reintentar();assert.deepEqual(rec.llamadas[0],f.llamadas[0]);assert(!rec.s.tienePendiente());
});

test('375K.33B Completar comparte condición de avance y actualización confirmada existente',()=>{
 assert.match(view,/puedeCambiar && a.estado !== 'completada' \? gestionBoton\('Completar'/);
 const inicio=view.indexOf('  async function guardarOperacion('),fin=view.indexOf('  form.onsubmit',inicio),guardar=view.slice(inicio,fin);
 for(const trozo of ["servicio.pagina('TAREAS'",'gestionAplicarTarea(tareas, actual)','gestionActualizarCalendarios(actual)','pintarLista()','detalle(actual.id, actual)'])assert(guardar.includes(trozo),trozo);
 assert(guardar.includes('if (ocupada || !sigue()) return;'));
 assert(service.includes('invalidarLecturas();'));
 const css=fs.readFileSync(frontend+'css/ui-system.css','utf8');assert(css.includes('.alm-ui .alm-btn-completar'));assert(css.includes('.dark .alm-ui .alm-btn-completar'));
});


test('375K.34B resumen real excluye retirados y no inventa progreso ausente o inválido',()=>{
 const {c}=preparar();
 const filas=[{estado:'en_proceso',progreso:25},{estado:'completada',progreso:100},{retirada_en:'fecha',estado:'completada',progreso:100}];
 const copia=JSON.stringify(filas),r=c.gestionProgresoResumen(filas);
 assert.equal(r.porcentaje,62.5);assert.equal(r.total,2);assert.equal(r.completados,1);assert.equal(JSON.stringify(filas),copia);
 for(const progreso of [null,undefined,'100',NaN,Infinity,-1,101])assert.equal(c.gestionProgresoResumen([{estado:'pendiente',progreso}]).porcentaje,null);
 assert.equal(c.gestionProgresoResumen([]).porcentaje,null);
 assert.equal(c.gestionProgresoResumen([{estado:'completada',progreso:100}]).porcentaje,100);
});

test('375K.34B pestañas conservan DOM, formularios, UX02 y cabecera con scroll interno',()=>{
 const cambiar=view.slice(view.indexOf('    const tabs=[...campos.querySelectorAll'),view.indexOf('  async function accionDetalle('));
 assert.doesNotMatch(cambiar,/innerHTML|modal\.close|servicio\.pagina|servicio\.todas/);
 assert.match(cambiar,/panel.hidden=panel.dataset.gestionPanel!==tipo/);
 assert.match(view,/modal.addEventListener\('cancel', e => e.preventDefault\(\)\)/);
 assert.match(view,/guardar.hidden = !fn/);
 const css=fs.readFileSync(frontend+'css/ui-system.css','utf8');
 for(const parte of ['.gestion-detalle-panel[hidden]','.gestion-detalle-tabs[open]','.gestion-detalle-cabecera,.gestion-detalle-pestanas','overflow-y:auto'])assert(css.includes(parte));
});


test('375K.34D tarjetas horizontales excluyen retirados y resumen adicional exacto',()=>{
 const {c}=preparar();const a=[{id:'1',trabajador_nombre:'Ana'},{id:'2',trabajador_nombre:'Bea'},{id:'3',trabajador_nombre:'Cata'},{id:'4',trabajador_nombre:'Retirada',retirada_en:'fecha'}];
 const html=c.gestionTareaResumen({titulo:'Trabajo',estado:'pendiente',fecha_limite:'2026-11-10'},{detallado:true,asignaciones:a,accion:'<button>Ver tarea</button>'});
 for(const n of ['Ana','Bea','+1','10-11-2026','Ver tarea'])assert(html.includes(n));
 assert(!html.includes('Retirada'));assert(!html.includes('Cata'));assert(!html.includes('avance individual'));
 assert(!view.includes('Promedio de avances de responsables vigentes.</p>'));
 assert(view.includes('guardar.hidden = !cambio()'));
});

test('375K.34D nombres de operaciones solo afirman el significado acreditado',()=>{
 const {c}=preparar();
 for(const [accion,label]of Object.entries({CREAR:'Tarea creada',EDITAR:'Tarea editada',ASIGNAR:'Responsable agregado',REASIGNAR:'Responsable reasignado',REABRIR:'Tarea reabierta'}))assert.equal(c.gestionNombreOperacion({accion}),label);
 assert.equal(c.gestionNombreOperacion({accion:'AVANCE',despues:{progreso:100}}),'Responsable completado');
 assert.equal(c.gestionNombreOperacion({accion:'AVANCE',despues:{progreso:50}}),'Avance registrado');
 assert.equal(c.gestionNombreOperacion({accion:'AVANCE',antes:{asignaciones:[{id:'a',progreso:20}]},despues:{asignaciones:[{id:'a',progreso:100}]}}),'Responsable completado');
 assert.equal(c.gestionNombreOperacion({accion:'RETIRAR',antes:{tarea:{retirada_en:null}},despues:{tarea:{retirada_en:'fecha'}}}),'Tarea retirada');
 assert.equal(c.gestionNombreOperacion({accion:'RETIRAR'}),'Retiro registrado');
 assert.equal(c.gestionNombreOperacion({accion:'DESCONOCIDA'}),'DESCONOCIDA');
 assert(view.includes('gestionPaginaHistorial(pagina,cursor,vistas,cursores)'));assert(view.includes('hayMas=control.hayMas'));
 const ordinario=view.slice(view.indexOf("historial.insertAdjacentHTML('beforeend'"),view.indexOf('for(const o of control.items)'));assert(!ordinario.includes('JSON.stringify'));assert(!ordinario.includes('Revisión'));
});

test('375K.34D tarjetas reutilizan asignaciones cargadas sin consultas ni autorizaciones cacheadas',async()=>{
 const {c,s,llamadas}=preparar();let ahora=10;c.Date={now:()=>ahora};
 assert.equal(s.asignacionesDisponibles('t1'),undefined);assert.equal(llamadas.length,0);
 c.respuesta=()=>({data:{items:[{id:'a1',tarea_id:'t1',trabajador_nombre:'Ana'}],hay_mas:false,siguiente_cursor:null}});
 await s.todas('ASIGNACIONES',{p_tarea_id:'t1'});const x=s.asignacionesDisponibles('t1');assert.equal(x[0].trabajador_nombre,'Ana');x[0].trabajador_nombre='Modificada';
 assert.equal(s.asignacionesDisponibles('t1')[0].trabajador_nombre,'Ana');assert.equal(llamadas.length,1);
 ahora+=15001;assert.equal(s.asignacionesDisponibles('t1'),undefined);assert.equal(llamadas.length,1);
 c.admin=false;assert.throws(()=>s.asignacionesDisponibles('t1'));assert.equal(llamadas.length,1);
});


test('375K.34F SIGNED_IN/focus y refresh de la misma sesión no invalidan contextos ni RPC pendientes',async()=>{
 const {c,s,llamadas}=preparar();c.atob=atob;
 const sesion=(sid,exp=1)=>({user:{id:'actor-a'},access_token:'x.'+Buffer.from(JSON.stringify({session_id:sid,exp})).toString('base64url')+'.x'});
 c.authListener('INITIAL_SESSION',sesion('sesion-a'));
 const contexto=s.contexto();let resolver;c.respuesta=()=>new Promise(r=>resolver=r);
 const lectura=s.pagina('TAREAS');c.authListener('SIGNED_IN',sesion('sesion-a'));c.authListener('TOKEN_REFRESHED',sesion('sesion-a',2));
 assert.doesNotThrow(()=>s.comprobar(contexto));resolver({data:{items:[{id:'t1'}],hay_mas:false,siguiente_cursor:null}});
 assert.equal((await lectura).items[0].id,'t1');assert.equal(llamadas.length,1);
 c.authListener('SIGNED_IN',sesion('sesion-b'));assert.throws(()=>s.comprobar(contexto),e=>e.code==='GESTION_CONTEXTO_CAMBIO');
 const nuevo=s.contexto();c.authListener('SIGNED_OUT',null);assert.throws(()=>s.comprobar(nuevo));
});

test('375K.34F perfil nuevo y permisos equivalentes mantienen identidad semántica',()=>{
 const {c,s}=preparar();c.state.currentUser={id:'actor-a',role:'ADMINISTRADOR',permissions:{modules:['a','b'],flags:{uno:true,dos:false}}};
 const contexto=s.contexto();c.state.currentUser={id:'actor-a',role:'ADMINISTRADOR',esAdminPermanente:false,esAdminTemporal:false,adminTemporalHasta:null,trabajador_id:null,permissions:{flags:{dos:false,uno:true},modules:['b','a']}};
 assert.doesNotThrow(()=>s.comprobar(contexto));
 c.state.currentUser.permissions.modules=['b'];assert.throws(()=>s.comprobar(contexto));
 c.state.currentUser.id='actor-b';assert.throws(()=>s.comprobar(contexto));
});

test('375K.34F sesión y lecturas invalidadas no se presentan como fallos de conexión',async()=>{
 const {c,s}=preparar();let resolver;c.respuesta=()=>new Promise(r=>resolver=r);const consulta=s.pagina('TAREAS');s.invalidarLecturas();
 resolver({data:{items:[],hay_mas:false,siguiente_cursor:null}});
 await assert.rejects(consulta,e=>e.code==='GESTION_LECTURA_INVALIDADA'&&!c.gestionErrorLectura(e).includes('conexión'));
 for(const code of ['GESTION_CONTEXTO_CAMBIO','GESTION_SESION_NO_DISPONIBLE','PGRST301','42501'])assert(!c.gestionErrorLectura({code}).includes('conexión'));
 const contexto=s.contexto();c.sesionEnReconexion=true;assert.throws(()=>s.comprobar(contexto),e=>e.code==='GESTION_SESION_NO_DISPONIBLE');
 c.sesionEnReconexion=false;assert.doesNotThrow(()=>s.comprobar(contexto));
 assert(c.gestionErrorLectura({code:'NETWORK_ERROR'}).includes('conexión'));
});

test('375K.34F calendario caduca, vuelve a consultar manualmente y nunca pinta después de desmontar',async()=>{
 const f=calendarioDashboardFixture();let ahora=1,fallo=true;f.c.Date.now=()=>ahora;let llamadas=0;
 f.s.todas=async()=>{llamadas++;if(fallo)throw Error('Red caída');return [{id:'t1',titulo:'Recuperada',estado:'pendiente',fecha_limite:'2026-11-10'}];};
 f.c.gestionCalendario(f.panel,()=>{});await new Promise(setImmediate);
 assert(f.day.textContent.includes('conexión'));assert.equal(llamadas,1);
 fallo=false;f.day.children.at(-1).onclick();await new Promise(setImmediate);assert(f.day.innerHTML.includes('Recuperada'));assert.equal(llamadas,2);
 f.nodes['[data-hoy]'].onclick();await new Promise(setImmediate);assert.equal(llamadas,2);
 ahora+=15001;f.nodes['[data-hoy]'].onclick();await new Promise(setImmediate);assert.equal(llamadas,3);
 f.panel.isConnected=false;f.nodes['[data-hoy]'].onclick();await new Promise(setImmediate);assert.equal(llamadas,3);
});


test('375K.34H progreso 25/50/75/100 y cierre reflejan datos del servidor simulado',async()=>{
 const {c,s}=preparar();let revision=1;const avances={a:0,b:0};
 c.respuesta=(nombre,args)=>{
   if(nombre==='tareas_pendientes_responsables_v1'){assert.equal(args.p_accion,'AVANCE');avances[args.p_asignacion_id]=args.p_progreso;return {data:{solicitud_id:args.p_solicitud_id,tarea_id:'t1',revision:++revision}};}
   const completada=Object.values(avances).every(n=>n===100);
   return {data:{items:args.p_vista==='TAREAS'?[{id:'t1',estado:completada?'completada':'pendiente',revision}]:Object.entries(avances).map(([id,progreso])=>({id,tarea_id:'t1',progreso,estado:progreso===100?'completada':'en_proceso'})),hay_mas:false,siguiente_cursor:null}};
 };
 for(const [id,progreso,esperado]of [['a',50,25],['b',50,50],['a',100,75],['b',100,100]]){
   await s.mutar('responsables',{p_tarea_id:'t1',p_revision_esperada:revision,p_accion:'AVANCE',p_asignacion_id:id,p_progreso:progreso,p_incorporar:null,p_retirar:null});
   const asignaciones=await s.todas('ASIGNACIONES',{p_tarea_id:'t1'}),tarea=(await s.pagina('TAREAS',{p_tarea_id:'t1',p_limite:1})).items[0];
   assert.equal(c.gestionProgresoResumen(asignaciones).porcentaje,esperado);
   assert.equal(tarea.estado,esperado===100?'completada':'pendiente');
 }
});

test('375K.34H actividad humana y dos pestañas no exponen información técnica',()=>{
 const {c}=preparar();
 assert.equal(c.gestionActividadEvento({accion:'AVANCE',despues:{progreso:50}}),'Avance registrado: 50 %');
 assert.equal(c.gestionActividadEvento({accion:'AVANCE',antes:{asignaciones:[{id:'a',progreso:0}]},despues:{asignaciones:[{id:'a',progreso:50}]}}),'Avance registrado: 50 %');
 assert.equal(c.gestionActividadEvento({accion:'AVANCE',despues:{progreso:100}}),'Responsable completado');
 assert.equal(c.gestionActividadEvento({accion:'NO_ACREDITADA'}),'Actividad registrada');
 assert(!view.includes('gestion-panel-general'));assert(view.includes("[['responsables','Responsables'],['historial','Historial de actividad']]"));
 const render=view.slice(view.indexOf("historial.insertAdjacentHTML('beforeend'"),view.indexOf('for(const o of control.items)'));
 assert(!/JSON.stringify|<pre|Revisión|o\.actor_id/.test(render));
 const comp=fs.readFileSync(frontend+'js/components/calendarioMensual.js','utf8');assert(comp.includes('Ir al día actual'));assert(!comp.includes('Ir a hoy'));
});

test('375K.34H edición conserva campos y permite máquina con p_equipo_id existente',async()=>{
 const {c}=preparar();let confirmar,contenido,lecturas=0;const escritos=[];
 c.window.MantencionesService={getElementosMaquinas:async()=>{lecturas++;return [{id:'m1',nombre_original:'Equipo A'},{id:'m2',nombre_original:'Equipo B'}];}};
 Object.assign(c,{versionDetalle:0,seleccion:null,edicion:false,admin:true,ocupada:false,backendDisponible:true,sigue:()=>true,guardar:{},
  form:{elements:{titulo:{value:'Título'},descripcion:{value:'Descripción'},fecha:{value:'2026-11-10'},equipo:{value:'m1'}}},
  campos:{querySelector:()=>({dataset:{}})},abrir(t,html,fn){contenido=html;confirmar=fn;},mutar:(tipo,t,args)=>escritos.push([tipo,t,args])});
 vm.runInContext(view.slice(view.indexOf('  async function formulario('),view.indexOf('  function mutar(',view.indexOf('  async function formulario('))),c);
 const t={id:'t1',titulo:'Título',descripcion:'Descripción',fecha_limite:'2026-11-10',equipo_id:'m1',revision:2};
 await c.formulario(t);assert.equal(lecturas,1);assert(contenido.includes('name="equipo"'));assert.equal(c.guardar.hidden,true);
 c.form.elements.equipo.value='m2';c.form.oninput();assert.equal(c.guardar.hidden,false);confirmar();assert.equal(escritos[0][0],'editar');assert.equal(escritos[0][2].p_equipo_id,'m2');
 c.form.elements.equipo.value='no-autorizada';assert.throws(()=>confirmar(),/catálogo autorizado/);assert.equal(escritos.length,1);
});

test('375K.34N historial recupera red por online/gesto sin botón y bloquea contexto anterior',async()=>{
 const {c}=preparar();let fallo=true,lecturas=0,vigente=true;
 const panel={hidden:false,scrollHeight:100,clientHeight:200,scrollTop:0},estado={textContent:''},historial={insertAdjacentHTML(){}};
 const ctrl=c.gestionMontarHistorial({id:'t1',panel,estado,historial,vigente:()=>vigente,servicio:{pagina:async()=>{lecturas++;if(fallo)throw {code:'NETWORK_ERROR'};return {items:[],hay_mas:false};}}});
 await ctrl.abrir();assert(estado.textContent.includes('interrumpió'));assert.equal(lecturas,1);
 fallo=false;await ctrl.online();assert.equal(lecturas,2);assert.equal(estado.textContent,'');
 await ctrl.online();await ctrl.abrir();assert.equal(lecturas,2);
 vigente=false;panel.onwheel({deltaY:30});await new Promise(setImmediate);assert.equal(lecturas,2);
});

test('375K.34J historial deduplica revisiones reales y bloquea bucles/conflictos de cursor',()=>{
 const {c}=preparar(),vistas=new Map(),cursores=new Set();
 const r4={revision:4,accion:'CREAR',actor_nombre:'Ana'},r5={revision:5,accion:'AVANCE',despues:{progreso:50}};
 const primera=c.gestionPaginaHistorial({items:[r4,r5,{...r4}],hay_mas:true,siguiente_cursor:4},undefined,vistas,cursores);
 assert.deepEqual(Array.from(primera.items,o=>o.revision),[5,4]);
 for(const o of primera.items)vistas.set(String(o.revision),o);cursores.add('4');
 const segunda=c.gestionPaginaHistorial({items:[r4,{revision:3,accion:'EDITAR'}],hay_mas:true,siguiente_cursor:3},4,vistas,cursores);
 assert.deepEqual(Array.from(segunda.items,o=>o.revision),[3]);
 assert.throws(()=>c.gestionPaginaHistorial({items:[r4],hay_mas:true,siguiente_cursor:4},4,vistas,cursores));
 assert.throws(()=>c.gestionPaginaHistorial({items:[{...r4,accion:'AVANCE'}],hay_mas:false},4,vistas,cursores));
 assert.throws(()=>c.gestionPaginaHistorial({items:[],hay_mas:true,siguiente_cursor:2},3,vistas,cursores));
 const distintas=c.gestionPaginaHistorial({items:[{revision:3,accion:'CREAR'},{revision:2,accion:'CREAR'},{revision:1,accion:'CREAR'}],hay_mas:false},undefined,new Map(),new Set());
 assert.equal(distintas.items.length,3);assert(distintas.items.every(o=>c.gestionActividadEvento(o)==='Tarea creada'));
});

test('375K.34J avance discreto mantiene actual, exige confirmación y rechaza valores no disponibles',async()=>{
 const {c}=preparar();let confirmar,html;const cambios=[];
 Object.assign(c,{ocupada:false,backendDisponible:true,guardar:{},form:{elements:{progreso:{value:''}}},
 abrir(_titulo,contenido,fn,texto){html=contenido;confirmar=fn;assert.equal(texto,'Registrar avance');},
 mutar:(tipo,t,args)=>cambios.push([tipo,t,args])});
 vm.runInContext(view.slice(view.indexOf('  async function accionDetalle('),view.indexOf('  async function guardarOperacion(')),c);
 const t={id:'t1',estado:'pendiente',revision:3},a={id:'a1',estado:'pendiente',progreso:0};
 await c.accionDetalle(t,'AVANCE',a,[]);assert(html.includes('Avance actual: <strong>0 %'));assert(html.includes('<select name="progreso"'));assert(!html.includes('type="number"'));
 for(const n of [25,50,75,100])assert(html.includes('value="'+n+'"'));
 for(const n of [25,50,75,100]){c.form.elements.progreso.value=String(n);c.form.oninput();assert.equal(c.guardar.disabled,false);assert.equal(cambios.length,[25,50,75,100].indexOf(n));confirmar();assert.equal(cambios.at(-1)[2].p_progreso,n);assert.equal(cambios.at(-1)[2].p_accion,'AVANCE');}
 const antes=cambios.length;
 for(const n of ['','0','26','101','NaN']){c.form.elements.progreso.value=n;c.form.oninput();assert(c.guardar.disabled);assert.throws(()=>confirmar());}assert.equal(cambios.length,antes);
 await c.accionDetalle(t,'AVANCE',{...a,progreso:50},[]);assert(!html.includes('value="25" disabled'));assert(html.includes('value="50" disabled'));
 c.form.elements.progreso.value='50';assert.throws(()=>confirmar());
 await assert.rejects(c.accionDetalle({...t,estado:'completada'},'AVANCE',a,[]));
 await assert.rejects(c.accionDetalle(t,'AVANCE',{...a,retirada_en:'fecha'},[]));
 await assert.rejects(c.accionDetalle(t,'AVANCE',{...a,progreso:null},[]));
});

test('375K.34Y paginado intacto y acciones globales sin sección inferior',()=>{
 const historia=view.slice(view.indexOf('function gestionMontarHistorial('),view.indexOf('function gestionRevisionClave('));assert(!historia.includes('Cargar más actividad'));assert(!historia.includes('Ver anteriores'));
 const header=view.slice(view.indexOf('<header class="gestion-detalle-cabecera'),view.indexOf('</header>',view.indexOf('<header class="gestion-detalle-cabecera')));
 assert(!header.includes('data-gestion-editar'));assert(!header.includes('data-gestion-retirar'));
 assert(!view.includes('gestion-tarea-acciones-secundarias'));assert(view.includes('data-gestion-acciones-tarea-cabecera'));assert(!historia.includes('button'));assert(view.includes('data-gestion-historial-estado'));
 assert(view.includes("error=gestionTipoErrorHistoria(e)"));
 assert(view.includes('guardar.hidden = !cambio()'));assert(view.includes('guardar.hidden = !fn'));
});


test('375K.34N historial corto pagina solo por gesto; bloquea cursado y fallos de acceso',async()=>{
 const {c}=preparar();let lecturas=0;
 const panel={hidden:false,scrollHeight:100,clientHeight:200,scrollTop:0},estado={},filas=[];
 const ctrl=c.gestionMontarHistorial({id:'t1',panel,estado,historial:{insertAdjacentHTML(_p,h){filas.push(h);}},vigente:()=>true,
 servicio:{pagina:async()=>{lecturas++;return lecturas===1?{items:[{revision:2,accion:'CREAR'}],hay_mas:true,siguiente_cursor:2}:{items:[{revision:1,accion:'EDITAR'}],hay_mas:false};}}});
 await ctrl.abrir();panel.onscroll();await new Promise(setImmediate);assert.equal(lecturas,1);
 panel.onwheel({deltaY:30});await new Promise(setImmediate);assert.equal(lecturas,2);assert.equal(filas.length,2);
 panel.onwheel({deltaY:30});await ctrl.online();assert.equal(lecturas,2);
 for(const [code,tipo]of [['42501','ACCESO'],['GESTION_CONTEXTO_CAMBIO','ACCESO'],['GESTION_HISTORIAL_CONTRATO','CONTRATO'],['GESTION_HISTORIAL_CURSOR','CURSOR'],['GESTION_RESPUESTA_INCOMPLETA','CONTRATO'],['GESTION_LECTURA_INVALIDADA','CAMBIO'],['NETWORK_ERROR','RED']])assert.equal(c.gestionTipoErrorHistoria({code}),tipo);
});

test('375K.34L Dashboard y Gestión producen tarjetas idénticas con las mismas asignaciones disponibles',async()=>{
 const filas=[{id:'t1',titulo:'Tarea <larga>',fecha_limite:'2026-11-10',estado:'pendiente'}];
 const asignaciones=[{id:'a1',tarea_id:'t1',trabajador_nombre:'Ana',progreso:50,retirada_en:null},{id:'a2',tarea_id:'t1',trabajador_nombre:'Bea',progreso:0,retirada_en:null},{id:'a3',tarea_id:'t1',trabajador_nombre:'Cata',progreso:0,retirada_en:null}];
 const montar=async detallado=>{
   const f=calendarioDashboardFixture(),consultas=[],abiertas=[];
   f.s.asignacionesDisponibles=id=>{assert.equal(id,'t1');return structuredClone(asignaciones);};
   f.s.todas=async(v)=>{consultas.push(v);return structuredClone(v==='TAREAS'?filas:asignaciones);};
   f.c.gestionCalendario(f.panel,t=>abiertas.push(t.id),null,{detallado});await new Promise(setImmediate);
   f.day.buttons[0].onclick();return {f,consultas,abiertas};
 };
 const dashboard=await montar(false),gestion=await montar(true);
 assert.equal(dashboard.f.day.innerHTML,gestion.f.day.innerHTML);
 for(const valor of ['Ana','Bea','+1','10-11-2026','tarea-pendiente-proxima','Ver tarea','gestion-tarea-tarjeta'])assert(dashboard.f.day.innerHTML.includes(valor));
 assert.deepEqual(dashboard.consultas,['TAREAS']);assert.deepEqual(dashboard.abiertas,['t1']);assert.deepEqual(gestion.abiertas,['t1']);
 assert.deepEqual(gestion.consultas,['TAREAS','ASIGNACIONES']);
});

test('375K.34L sin asignaciones Dashboard conserva datos reales y no incorpora consultas por tarjeta',async()=>{
 const f=calendarioDashboardFixture(),consultas=[];
 f.s.asignacionesDisponibles=()=>undefined;
 f.s.todas=async(v)=>{consultas.push(v);return [{id:'t1',titulo:'Sin asignaciones cargadas',estado:'completada',fecha_limite:'2026-11-10'},{id:'t2',titulo:'Otra tarea',estado:'pendiente',fecha_limite:'2026-11-10'}];};
 f.c.gestionCalendario(f.panel,()=>{});await new Promise(setImmediate);
 assert.deepEqual(consultas,['TAREAS']);assert.equal((f.day.innerHTML.match(/<article/g)||[]).length,2);assert(f.day.innerHTML.includes('Responsables: consultar'));
 const css=fs.readFileSync(frontend+'css/ui-system.css','utf8');
 assert(css.includes('.alm-ui .gestion-tarea-tarjeta>div:first-child{display:flex;flex-direction:column;gap:7px;}'));
 const paletas=css.split('\n').filter(l=>l.includes(':is(#tareas-pendientes, [data-calendario], .gestion-tarea-tarjeta)')&&l.includes('background:#'));
 assert.equal(paletas.length,8);assert(paletas.some(l=>l.startsWith('.dark ')));
});


test('375K.34N categorías excluyentes con fecha de Chile y completadas fuera de plazo',()=>{
 const {c}=preparar(),hoy='2026-11-17';
 const tareas=[{id:'a',estado:'pendiente',fecha_limite:'2026-11-16'},{id:'b',estado:'pendiente',fecha_limite:hoy},{id:'c',estado:'pendiente',fecha_limite:'2026-11-18'},{id:'d',estado:'completada',fecha_limite:'2026-01-01'},{id:'e',estado:'completada',fecha_limite:null},{id:'f',estado:'pendiente',fecha_limite:hoy,retirada_en:'fecha'}];
 assert.deepEqual(Array.from(tareas,t=>c.gestionCategoriaTarea(t,hoy)),['vencida','pendiente','pendiente','completada','completada',null]);
 assert.deepEqual(JSON.parse(JSON.stringify(c.gestionContadoresTareas(tareas,true,hoy))),{vencida:1,pendiente:2,completada:2});
 assert.equal(c.gestionContadoresTareas(tareas,false,hoy),null);
 assert.equal(c.gestionContadoresTareas([{id:'x',estado:'pendiente',fecha_limite:'no-fecha'}],true,hoy),null);
 assert.equal(c.gestionHoyChile(new Date('2026-11-18T02:59:59Z')),'2026-11-17');
 assert.equal(c.gestionHoyChile(new Date('2026-11-18T03:00:00Z')),'2026-11-18');
 const html=(()=>{c.uiEncabezadoSeccion=()=>'';return c.renderGestionTareas();})();
 assert(html.indexOf('data-gestion-filtro="calendario"')<html.indexOf('data-gestion-filtro="vencida"'));
 assert(html.indexOf('data-gestion-filtro="vencida"')<html.indexOf('data-gestion-filtro="pendiente"'));
 assert(!view.includes('data-gestion-historial hidden'));
});

test('375K.34N cambio de día Chile usa un timer, sin red/polling, y se desmonta con la vista',()=>{
 const {c}=preparar();let ahora=Date.parse('2026-11-18T02:59:59Z'),cambios=0,online=0,desconectado=0,observer;
 c.Date=class extends Date{constructor(...args){super(...(args.length?args:[ahora]));}};
 const timers=new Map(),eventos=new Map();let serial=0;
 c.setTimeout=(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;};c.clearTimeout=id=>timers.delete(id);
 c.window.addEventListener=(k,fn)=>eventos.set('w:'+k,fn);c.window.removeEventListener=k=>eventos.delete('w:'+k);
 c.document={visibilityState:'visible',addEventListener:(k,fn)=>eventos.set('d:'+k,fn),removeEventListener:k=>eventos.delete('d:'+k)};
 c.MutationObserver=class{constructor(fn){observer=fn;}observe(){}disconnect(){desconectado++;}};
 const root={isConnected:true,parentNode:{parentNode:{}}};
 c.gestionVigilarDia(root,()=>{cambios++;},()=>online++);
 assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,1050);
 ahora+=1100;[...timers.values()][0].fn();assert.equal(cambios,1);assert.equal(timers.size,1);
 eventos.get('w:focus')();eventos.get('d:visibilitychange')();assert.equal(cambios,1);
 eventos.get('w:online')();assert.equal(online,1);
 root.isConnected=false;observer();assert.equal(timers.size,0);assert.equal(eventos.size,0);assert.equal(desconectado,1);
});

test('375K.34N carga una sola página inicial; contadores desconocidos hasta completar lectura',async()=>{
 const {c,s,llamadas}=preparar();let fecha=Date.parse('2026-11-17T15:00:00Z'),cambioDia;
 c.Date=class extends Date{constructor(...args){super(...(args.length?args:[fecha]));}};
 const nodo=()=>({innerHTML:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){}},setAttribute(k,v){this[k]=v;},append(){},insertAdjacentHTML(_p,h){this.innerHTML+=h;},querySelectorAll(){return [];},querySelector(){return null;}});
 const mas=nodo(),lista=nodo(),panel=nodo(),estado=nodo(),reintentar=nodo(),campos=nodo(),aviso=nodo(),guardar=nodo(),cerrar=nodo(),h2=nodo();
 lista.querySelector=q=>q==='[data-gestion-mas]'&&lista.innerHTML.includes('data-gestion-mas')?mas:null;
 const form={querySelector:q=>({'[data-gestion-campos]':campos,'[data-gestion-error]':aviso,'[type=submit]':guardar,'[data-gestion-cerrar]':cerrar,h2})[q]};
 const modal={open:false,querySelector:()=>form,addEventListener(){},close(){this.open=false;}};
 const filtros=['calendario','vencida','pendiente','completada'].map(tipo=>Object.assign(nodo(),{dataset:{gestionFiltro:tipo}}));
 const root={isConnected:true,querySelector:q=>({'[data-gestion-lista]':lista,'[data-gestion-calendario]':panel,'[data-gestion-estado]':estado,'[data-gestion-reintentar]':reintentar,dialog:modal})[q]||null,querySelectorAll:q=>q==='[data-gestion-filtro]'?filtros:[]};
 c.gestionCalendario=()=>({pintar(){}});c.gestionVigilarDia=(_root,fn)=>{cambioDia=fn;};
 c.respuesta=(_nombre,args)=>({data:args.p_cursor_id?{items:[{id:'04',titulo:'Finalizada sin fecha',estado:'completada',fecha_limite:null},{id:'05',titulo:'Retirada',estado:'pendiente',fecha_limite:'2026-11-16',retirada_en:'fecha'}],hay_mas:false,siguiente_cursor:null}:{items:[{id:'01',titulo:'Antes',estado:'pendiente',fecha_limite:'2026-11-16'},{id:'02',titulo:'Hoy',estado:'pendiente',fecha_limite:'2026-11-17'},{id:'03',titulo:'Completada tarde',estado:'completada',fecha_limite:'2026-11-01'}],hay_mas:true,siguiente_cursor:'03'}});
 c.iniciarGestionTareas(root);await new Promise(setImmediate);
 assert.equal(llamadas.length,1);assert.equal(llamadas[0][1].p_limite,10);assert.equal(filtros[1]['aria-pressed'],'false');
 assert.equal(filtros[1].textContent,'Vencidas (—)');assert.equal(filtros[2].textContent,'Pendientes (—)');
 filtros[1].onclick();assert(lista.innerHTML.includes('Antes'));assert(!lista.innerHTML.includes('Hoy'));
 await mas.onclick();assert.equal(llamadas.length,2);assert.equal(llamadas[1][1].p_cursor_id,'03');
 assert.equal(filtros[1].textContent,'Vencidas (1)');assert.equal(filtros[2].textContent,'Pendientes (1)');assert.equal(filtros[3].textContent,'Completadas (2)');
 fecha+=86400000;cambioDia();assert.equal(filtros[1].textContent,'Vencidas (2)');assert.equal(filtros[2].textContent,'Pendientes (0)');assert.equal(llamadas.length,2);
});

test('375K.34N cursor erróneo de historial conserva primera página y no reintenta infinitamente',async()=>{
 const {c}=preparar();let llamadas=0;const estado={},html=[];const panel={hidden:false,scrollHeight:100,clientHeight:200,scrollTop:0};
 const ctrl=c.gestionMontarHistorial({id:'t1',panel,estado,historial:{insertAdjacentHTML(_p,h){html.push(h);}},vigente:()=>true,
 servicio:{pagina:async()=>{llamadas++;return {items:[{revision:1,accion:'CREAR'}],hay_mas:true,siguiente_cursor:1};}}});
 await ctrl.abrir();panel.onwheel({deltaY:30});await new Promise(setImmediate);
 assert.equal(llamadas,2);assert.equal(html.length,1);assert(estado.textContent.includes('no es verificable'));
 panel.onwheel({deltaY:30});await ctrl.online();await ctrl.abrir();assert.equal(llamadas,2);
});


test('375K.34N historial diferencia acceso, limpia error recuperado y descarta respuesta anterior',async()=>{
 const {c}=preparar();let vigente=true,resolver,lecturas=0,modo='acceso';const panel={hidden:false,scrollHeight:100,clientHeight:200,scrollTop:0},estado={},filas=[];
 const ctrl=c.gestionMontarHistorial({id:'t1',panel,estado,historial:{insertAdjacentHTML(_p,h){filas.push(h);}},vigente:()=>vigente,
 servicio:{pagina:async()=>{lecturas++;if(modo==='acceso')throw {code:'42501'};if(modo==='lenta')return new Promise(r=>resolver=r);return {items:[{revision:1,accion:'CREAR'}],hay_mas:false};}}});
 await ctrl.abrir();assert(estado.textContent.includes('sesión o permisos'));await ctrl.online();assert.equal(lecturas,1);
 modo='valida';await ctrl.abrir();assert.equal(lecturas,2);assert.equal(estado.textContent,'');assert.equal(filas.length,1);
 const siguiente=c.gestionMontarHistorial({id:'t2',panel,estado,historial:{insertAdjacentHTML(){throw Error('No pintar');}},vigente:()=>vigente,servicio:{pagina:async()=>new Promise(r=>resolver=r)}});
 const pendiente=siguiente.abrir();vigente=false;resolver({items:[{revision:1,accion:'CREAR'}],hay_mas:false});await pendiente;assert.equal(filas.length,1);
});

test('375K.34N lista paginada conserva UUID sin duplicar y rechaza cursor repetido',()=>{
 const {c}=preparar();const anterior=[{id:'a',estado:'pendiente',fecha_limite:'2026-11-17'}];
 const siguiente=c.gestionPaginaLista(anterior,{items:[{id:'a',estado:'completada'},{id:'b',estado:'pendiente',fecha_limite:'2026-11-16'},{id:'c',retirada_en:'fecha'}],hay_mas:false},'a',new Set());
 assert.deepEqual(Array.from(siguiente,t=>t.id),['a','b']);assert.equal(siguiente[0].estado,'completada');
 assert.throws(()=>c.gestionPaginaLista(anterior,{items:[],hay_mas:true,siguiente_cursor:'a'},'a',new Set()));
 assert.throws(()=>c.gestionPaginaLista(anterior,{items:[],hay_mas:true,siguiente_cursor:'b'},'a',new Set(['b'])));
 assert(view.includes('if (entrada?.tarea) ejecutar(() => detalle(entrada.tarea), estado)'));
});


test('375K.34Q vencimiento visual usa Chile, prioridad completada y fechas reales',()=>{
 const {c}=preparar(),hoy='2026-11-17';
 for(const [fecha,clase,texto]of [['2026-11-16','vencida','Vencida ayer'],['2026-11-17','proxima','Vence hoy'],['2026-11-18','proxima','Vence mañana'],['2026-11-19','plazo','Faltan 2 días'],[null,'neutra','Fecha no disponible'],['invalida','neutra','Fecha no disponible']]){
   const t={estado:'pendiente',fecha_limite:fecha},antes=JSON.stringify(t),r=c.gestionFechaContexto(t,hoy);
   assert.equal(r.clase,clase);assert.equal(r.texto,texto);assert.equal(JSON.stringify(t),antes);
 }
 assert.equal(c.gestionFechaContexto({estado:'completada',fecha_limite:'2026-01-01'},hoy).clase,'completada');
 assert.equal(c.gestionFechaContexto({estado:'pendiente',fecha_limite:hoy,retirada_en:'fecha'},hoy).estado,'Retirada');
 assert.equal(c.gestionFechaContexto({estado:'pendiente',fecha_limite:'2027-01-01'},'2026-12-31').texto,'Vence mañana');
 assert.equal(c.gestionInicialesResponsable('Trabajador prueba'),'TP');assert.equal(c.gestionInicialesResponsable('  José   Cueto '),'JC');assert.equal(c.gestionInicialesResponsable(''),'—');
});

test('375K.34Q cabecera y cierre superior reutilizan diálogo y no alteran modo edición',()=>{
 const {c}=preparar(),estado={hidden:true,innerHTML:''},superior={hidden:true},h2={};
 Object.assign(c,{campos:{querySelector:()=>null},aviso:{},guardar:{},ocupada:false,backendDisponible:true,recuperarHistorialOnline:null,accion:null,edicion:false,
   form:{querySelector:q=>({'h2':h2,'[data-gestion-estado-cabecera]':estado,'[data-gestion-cerrar-superior]':superior})[q]},
   modal:{open:false,classList:{toggle(_clase,valor){this.detalle=valor;}},showModal(){this.open=true;}}});
 vm.runInContext(view.slice(view.indexOf('  function abrir('),view.indexOf('  function opciones(')),c);
 c.abrir('Nombre <seguro>','<div data-gestion-detalle></div>',null,'Guardar',{estado:'completada',fecha_limite:'2026-11-17'});
 assert.equal(h2.textContent,'Nombre <seguro>');assert.equal(superior.hidden,false);assert.equal(estado.hidden,false);assert(estado.innerHTML.includes('Completada'));assert.equal(c.guardar.hidden,true);
 c.abrir('Editar tarea','<input name="titulo">',()=>{},'Guardar cambios');
 assert.equal(superior.hidden,true);assert.equal(estado.hidden,true);assert.equal(c.guardar.hidden,false);assert.equal(c.modal.classList.detalle,false);
 assert(view.includes("cerrarSuperior.onclick=()=>form.querySelector('[data-gestion-cerrar]').onclick()"));
 assert(view.includes("modal.addEventListener('cancel', e => e.preventDefault())"));
 assert(view.includes('if (ocupada || !sigue()) return;'));
});

test('375K.34Q estilos solo de presentación: ancho útil, sin altura fija, móvil y ambos temas',()=>{
 const css=fs.readFileSync(frontend+'css/ui-system.css','utf8').split('/* 375K.34Q:')[1];
 for(const regla of ['width:min(49rem','height:auto','max-height:calc(100dvh','@media(max-width:600px)','@media(max-height:600px)','gestion-responsable-acciones','grid-template-columns:repeat(3','gestion-detalle-progreso','gestion-modal-cerrar-superior','[hidden]{display:none!important;}','.dark .gestion-fecha-proxima','.dark .gestion-detalle-tabs .gestion-retirar-tarea'])assert(css.includes(regla),regla);
 const d=view.slice(view.indexOf('    abrir(t.titulo,'),view.indexOf('    const editar =',view.indexOf('    abrir(t.titulo,')));
 for(const clase of ['gestion-fecha-tarjeta','gestion-responsable-avatar','gestion-responsable-tarjeta','gestion-progreso-etiqueta','gestion-responsables-cabecera'])assert(d.includes(clase));
 assert(d.includes("gestionBoton('Avanzar'"));assert(d.includes('Retirar tarea'));assert(!d.includes('Eliminar'));
});


test('375K.34T pestañas con iconos accesibles conservan identidad y navegación',()=>{
 const {c}=preparar();
 for(const tipo of ['usuarios','historial']){const svg=c.gestionIconoDetalle(tipo);assert(svg.includes('aria-hidden="true"'));assert(svg.includes('focusable="false"'));assert(!svg.includes('http'));}
 const inicio=view.indexOf('<div class="trabajador-ficha-tabs gestion-detalle-pestanas"'),fin=view.indexOf('      <section id="gestion-panel-responsables"',inicio),tabs=view.slice(inicio,fin);
 assert(tabs.includes('role="tablist"'));assert(tabs.includes('role="tab"'));assert(tabs.includes('aria-selected'));assert(tabs.includes('aria-controls'));assert(tabs.includes('tabindex'));
 assert(tabs.includes("gestionIconoDetalle(tipo==='responsables'?'usuarios':'historial')"));assert(tabs.includes('<span>\u0024{nombre}</span>'));
 assert(view.includes("if(tipo==='historial')actividad.abrir()"));
 const cambiar=view.slice(view.indexOf('    const tabs=[...campos.querySelectorAll'),view.indexOf('  async function accionDetalle('));
 assert(!/innerHTML|modal\.close|servicio\.pagina/.test(cambiar));
 assert(cambiar.includes("['ArrowLeft','ArrowRight','Home','End']"));
});

test('375K.34T pestañas minimalistas con subrayado activo, foco y área táctil',()=>{
 const css=fs.readFileSync(frontend+'css/ui-system.css','utf8');
 assert(css.includes('[role="tab"][aria-selected="true"]{background:transparent;color:var(--alm-link);font-weight:600;}'));
 assert(css.includes('border-bottom:1px solid var(--alm-border)'));
 assert(css.includes('[role="tab"][aria-selected="true"]::after{content:"";'));
 assert(css.includes('height:3px;background:var(--alm-link)'));
 assert(css.includes('[role="tab"]:focus-visible{outline:2px solid var(--alm-link);outline-offset:-3px;}'));
 assert(css.includes('@media(pointer:coarse){.gestion-detalle-tabs .gestion-detalle-pestanas [role="tab"]{min-height:44px;}}'));
 assert(css.includes('.gestion-detalle-pestanas svg{width:16px;height:16px;flex-shrink:0;}'));
 assert(!css.includes('[role="tab"][aria-selected="true"]{background:var(--alm-accent);color:#fff'));
});


test('375K.34V retiro por UUID protege último vigente sin depender del porcentaje',async()=>{
 const {c}=preparar(),t={id:'t1',estado:'pendiente'},a={id:'a1',trabajador_id:'w1',progreso:100,estado:'completada'},b={id:'a2',trabajador_id:'w2',progreso:25};
 assert.equal(c.gestionPuedeRetirarAsignacion(t,a,[a],true),false);
 assert.equal(c.gestionPuedeRetirarAsignacion(t,a,[a,{...b,retirada_en:'fecha'}],true),false);
 assert.equal(c.gestionPuedeRetirarAsignacion(t,a,[a,b],true),true);
 assert.equal(c.gestionPuedeRetirarAsignacion({...t,estado:'completada'},a,[a,b],true),true);
 assert.equal(c.gestionPuedeRetirarAsignacion(t,a,[a,b,{id:'a3',progreso:0}],true),true);
 assert.equal(c.gestionPuedeRetirarAsignacion(t,a,[a,b],false),false);
 assert.equal(c.gestionPuedeRetirarAsignacion({...t,retirada_en:'fecha'},a,[a,b],true),false);
 assert.equal(c.gestionPuedeRetirarAsignacion(t,{...a,id:'otra'},[a,b],true),false);
 let confirmar,html;const envios=[];
 Object.assign(c,{admin:true,abrir(_titulo,contenido,fn){html=contenido;confirmar=fn;},mutar:(nombre,tarea,datos)=>envios.push([nombre,tarea,datos])});
 vm.runInContext(view.slice(view.indexOf('  async function accionDetalle('),view.indexOf('  async function guardarOperacion(')),c);
 await c.accionDetalle(t,'RETIRAR',a,[a,b]);assert.equal(envios.length,0);assert(html.includes('historial se conservarán'));
 confirmar();assert.equal(envios[0][0],'ciclo');assert.equal(envios[0][2].p_accion,'RETIRAR');assert.equal(envios[0][2].p_asignacion_id,'a1');
 await assert.rejects(c.accionDetalle(t,'RETIRAR',a,[a]));c.admin=false;await assert.rejects(c.accionDetalle(t,'RETIRAR',a,[a,b]));assert.equal(envios.length,1);
});

test('375K.34V retiro compacto tiene tooltip/contexto accesible y estilos táctiles sin cambiar pestañas',()=>{
 assert(view.includes('title="Retirar asignación" aria-label="Retirar asignación de '));
 assert(view.includes('gestionIconoDetalle(\'retirarUsuario\')'));
 assert(view.includes('aria-label="Retirar tarea del listado activo, conservando su historial"'));
 const css=fs.readFileSync(frontend+'css/ui-system.css','utf8').split('/* 375K.34V:')[1];
 for(const token of ['gestion-responsable-estado-acciones','gestion-retirar-asignacion-texto{display:none','gestion-retirar-asignacion-texto{display:inline','min-height:44px',':focus-visible','.dark .gestion-detalle-tabs .gestion-retirar-asignacion'])assert(css.includes(token),token);
 assert(!css.includes('gestion-detalle-pestanas'));assert(!css.includes('gestion-progreso'));
});


test('375K.34Y acciones reubicadas conservan los mismos botones, handlers y limpieza de modo',()=>{
 const {c}=preparar();let eliminada=false;const invocadas=[];
 const editar={onclick(){invocadas.push('editar');}},retirar={onclick(){invocadas.push('retirar');}};
 const destino={hidden:true,children:[],replaceChildren(...n){this.children=n;}},fuente={querySelectorAll:q=>{assert.equal(q,'button');return [editar,retirar];},remove(){eliminada=true;}};
 const modal={querySelector:q=>q==='[data-gestion-acciones-tarea-cabecera]'?destino:null},campos={querySelector:q=>q==='[data-gestion-globales-fuente]'?fuente:null};
 c.gestionSubirAccionesTarea(modal,campos);assert.equal(eliminada,true);assert.equal(destino.hidden,false);assert.equal(destino.children[0],editar);assert.equal(destino.children[1],retirar);
 destino.children[0].onclick();destino.children[1].onclick();assert.deepEqual(invocadas,['editar','retirar']);
 c.gestionLimpiarAccionesCabecera(modal);assert.equal(destino.hidden,true);assert.equal(destino.children.length,0);
 c.gestionSubirAccionesTarea(modal,{querySelector:()=>null});assert.equal(destino.hidden,true);
 const d=view.slice(view.indexOf('    const editar ='),view.indexOf("campos.querySelectorAll('[data-gestion-accion]')",view.indexOf('    const editar =')));
 assert(d.indexOf('editar.onclick')<d.indexOf('gestionSubirAccionesTarea'));assert(d.indexOf('retirar.onclick')<d.indexOf('gestionSubirAccionesTarea'));
 assert(d.includes("() => mutar('retirar', t)"));assert(d.includes('formulario(t)'));
});

test('375K.34Y cabecera comparte acciones con cierre, sin duplicar modal y con nombres móviles',()=>{
 const {c}=preparar();c.uiEncabezadoSeccion=()=>'';const html=c.renderGestionTareas();
 assert.equal((html.match(/data-gestion-acciones-tarea-cabecera/g)||[]).length,1);assert.equal((html.match(/<dialog/g)||[]).length,1);
 const inicio=html.indexOf('gestion-modal-titulo'),fin=html.indexOf('data-gestion-campos',inicio),cabecera=html.slice(inicio,fin);
 assert(cabecera.includes('gestion-modal-controles'));assert(cabecera.includes('data-gestion-acciones-tarea-cabecera'));assert(cabecera.includes('data-gestion-cerrar-superior'));
 assert(view.includes('aria-label="Editar tarea"'));assert(view.includes('aria-label="Retirar tarea del listado activo, conservando su historial"'));
 assert(!view.includes('Acciones sobre la tarea'));assert(!view.includes('gestion-tarea-acciones-secundarias'));
 const css=fs.readFileSync(frontend+'css/ui-system.css','utf8').split('/* 375K.34Y:')[1];
 for(const regla of ['grid-template-columns:minmax(0,1fr) auto','position:static','@media(max-width:600px),(pointer:coarse)','min-height:44px',':focus-visible','[data-gestion-globales-fuente][hidden]{display:none!important;}'])assert(css.includes(regla),regla);
});


test('375K.34Z cancelar restaura nodos, pestaña, acciones, scroll y contexto sin lecturas ni escrituras',()=>{
 const {c}=preparar();let version,consultas=0,cierres=0;
 const tarjeta={tab:'historial',remove(){}},boton={onclick(){consultas++;},remove(){}};
 const campos={childNodes:[tarjeta],querySelector:()=>tarjeta,replaceChildren(...n){this.childNodes=n;}};
 const titulo={textContent:'Tarea original'},insignia={innerHTML:'Pendiente'},acciones={childNodes:[boton],replaceChildren(...n){this.childNodes=n;}},superior={};
 const cerrar={};const form={querySelector:q=>({'h2':titulo,'[data-gestion-estado-cabecera]':insignia,'[data-gestion-acciones-tarea-cabecera]':acciones,'[data-gestion-cerrar-superior]':superior,'[data-gestion-cerrar]':cerrar})[q]};
 const modal={open:true,scrollTop:88,classList:{add(){}},gestionReactivarDetalle:v=>{version=v;},gestionDetalleOnline:()=>{},close(){cierres++;}};
 const aviso={},guardar={};Object.assign(c,{modal,form,campos,aviso,guardar,ocupada:false,seleccion:'t1',versionDetalle:7,edicion:false,accion:()=>{consultas++;},recuperarHistorialOnline:null,sigue:()=>true,servicio:{tienePendiente:()=>false},ejecutar:fn=>fn(),detalle:()=>{consultas++;}});
 c.gestionSuspenderFicha(modal,form,campos,aviso);titulo.textContent='Completar';
 vm.runInContext(view.slice(view.indexOf("  form.querySelector('[data-gestion-cerrar]').onclick ="),view.indexOf('  function sincronizarReintento()')),c);
 cerrar.onclick();assert.equal(cierres,0);assert.equal(consultas,0);assert.equal(c.seleccion,'t1');assert.equal(titulo.textContent,'Tarea original');assert.equal(campos.childNodes[0],tarjeta);assert.equal(tarjeta.tab,'historial');assert.equal(acciones.childNodes[0],boton);assert.equal(version,8);assert.equal(guardar.hidden,true);assert.equal(c.accion,null);assert.equal(modal.scrollTop,88);
 c.ocupada=true;cerrar.onclick();assert.equal(cierres,0);c.ocupada=false;c.sigue=()=>false;cerrar.onclick();assert.equal(cierres,0);
 c.sigue=()=>true;cerrar.onclick();assert.equal(cierres,1);assert.equal(c.seleccion,null);
});

test('375K.34Z confirmación actualiza ficha por UUID incluso al completar; error conserva recuperación',()=>{
 const guardar=view.slice(view.indexOf('  async function guardarOperacion('),view.indexOf('  form.onsubmit'));
 assert(guardar.includes('modal.gestionRetorno.actualizar=true'));
 assert(guardar.includes('else if (conservarFicha) await detalle(actual.id, actual)'));
 assert(guardar.includes('servicio.tienePendiente()'));assert(guardar.includes('servicio.reintentar()'));
 const cierre=view.slice(view.indexOf("  form.querySelector('[data-gestion-cerrar]').onclick ="),view.indexOf('  function sincronizarReintento()'));
 assert(cierre.includes('if(retorno.actualizar){ejecutar(()=>detalle(seleccion));return;}'));
 assert(!cierre.includes('mutar('));assert(!cierre.includes('invalidar'));
});


test('375K.34Z completar último responsable conserva ficha confirmada y bloquea doble envío',async()=>{
 const {c}=preparar();const ficha=[],envios=[];let liberar;
 const actual={id:'t1',revision:9,estado:'completada'};
 Object.assign(c,{ocupada:false,sigue:()=>true,backendDisponible:true,guardar:{},reintentar:{},aviso:{},estado:{},modal:{open:true,gestionRetorno:{actualizar:false},close(){throw Error('No debe cerrar');}},edicion:false,seleccion:'t1',estadoLista:'listo',tareas:[{id:'t1',revision:8,estado:'pendiente'}],servicio:{pagina:async()=>({items:[actual]}),tienePendiente:()=>false},pintarLista(){},gestionActualizarCalendarios(){},detalle:async(id,t)=>ficha.push([id,t]),form:{},sincronizarReintento(){}});
 vm.runInContext(view.slice(view.indexOf('  async function guardarOperacion('),view.indexOf('  form.onsubmit')),c);
 const fn=()=>{envios.push('confirmar');return new Promise(r=>{liberar=r;});};
 const pendiente=c.guardarOperacion(fn);await c.guardarOperacion(fn);assert.equal(envios.length,1);
 liberar({revision:9,tarea_id:'t1'});await pendiente;assert.equal(ficha.length,1);assert.equal(ficha[0][0],'t1');assert.equal(ficha[0][1].estado,'completada');assert.equal(c.modal.open,true);assert.equal(c.ocupada,false);
});


test('375K.34AB días civiles relativos: meses, años, bisiesto y cambios DST Santiago',()=>{
 const {c}=preparar();
 for(const [hoy,limite,texto] of [
 ['2026-11-17','2026-11-15','Vencida hace 2 días'],
 ['2026-11-30','2026-12-02','Faltan 2 días'],
 ['2026-12-31','2027-01-02','Faltan 2 días'],
 ['2028-02-28','2028-03-01','Faltan 2 días'],
 ['2026-09-05','2026-09-07','Faltan 2 días'],
 ['2026-04-04','2026-04-06','Faltan 2 días'],
 ['2027-01-02','2026-12-31','Vencida hace 2 días']]){
  assert.equal(c.gestionFechaContexto({estado:'pendiente',fecha_limite:limite},hoy).texto,texto);
 }
 for(const instante of ['2026-09-06T03:59:59Z','2026-09-06T04:00:00Z','2026-04-05T02:59:59Z','2026-04-05T03:00:00Z','2026-04-05T04:00:00Z']){
  const hoy=c.gestionHoyChile(new Date(instante));
  assert.equal(c.gestionFechaContexto({estado:'pendiente',fecha_limite:hoy},hoy).texto,'Vence hoy');
 }
 const final=c.gestionFechaContexto({estado:'completada',fecha_limite:'2020-01-01'},'2026-11-17');
 assert.equal(final.texto,'Tarea completada');assert.equal(final.clase,'completada');
 assert(view.includes('modal.gestionActualizarFecha?.();return true;'));
 assert(view.includes('reactivar?.(version);modal.gestionActualizarFecha?.()'));
});


test('375K.34AB indicador se actualiza sin reconstruir ficha ni consultar servicios',()=>{
 const {c}=preparar();const indicador={isConnected:true};
 Object.assign(c,{campos:{querySelector:()=>indicador},modal:{},t:{estado:'pendiente',fecha_limite:'2026-09-07'},version:2,versionDetalle:2,sigue:()=>true});
 vm.runInContext(view.slice(view.indexOf('    const indicadorFecha='),view.indexOf('    const editar =')),c);
 c.gestionHoyChile=()=> '2026-09-05';c.modal.gestionActualizarFecha();assert.equal(indicador.textContent,'Faltan 2 días');
 c.gestionHoyChile=()=> '2026-09-06';c.modal.gestionActualizarFecha();assert.equal(indicador.textContent,'Vence mañana');assert(indicador.className.endsWith('proxima'));
 c.t.estado='completada';c.modal.gestionActualizarFecha();assert.equal(indicador.textContent,'Tarea completada');assert(indicador.className.endsWith('completada'));
 indicador.isConnected=false;c.t.estado='pendiente';c.modal.gestionActualizarFecha();assert.equal(indicador.textContent,'Tarea completada');
 indicador.isConnected=true;c.sigue=()=>false;c.modal.gestionActualizarFecha();assert.equal(indicador.textContent,'Tarea completada');
});
