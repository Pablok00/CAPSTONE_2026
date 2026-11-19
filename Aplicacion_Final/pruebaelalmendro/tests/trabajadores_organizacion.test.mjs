import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// FIX-04 permite comprobar también el servicio y la vista de Mantención reales de raíz.
const workerRootFiles = new Set(['views/trabajadores.js','services/trabajadores.service.js','views/gestionTareas.js','services/gestionTareas.service.js','services/mantenciones.service.js','views/mantenciones.js']);
const source = name => readFileSync(new URL('../' + (process.env.TRABAJADORES_VISTA_RAIZ === '1' && workerRootFiles.has(name) ? '' : 'publicacion/') + 'js/' + name, import.meta.url), 'utf8');
const id = '11111111-1111-4111-8111-111111111111';
const another = '22222222-2222-4222-8222-222222222222';
function contenidoFicha() {
  const nodes = new Map();
  return { innerHTML: '', querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', textContent: '', hidden: false, tabIndex: -1,
      attributes: {}, setAttribute(k, v) { this.attributes[k] = v; } });
    return nodes.get(selector);
  } };
}
test('último ajuste: etiqueta Activo solo para estado booleano real y tarjetas adaptables', () => {
  const f = fixture();
  f.c.accounts = [true, false, null, 'true'].map((estado, i) => ({ id: id + i, nombre: 'Cuenta ' + i,
    estado, trabajador_id: another + i, roles: { nombre: 'Técnico' } }));
  vm.runInContext('trabajadoresCuentasVista=accounts', f.c);
  const html = f.c.trabajadoresCuentasHTML();
  assert.equal((html.match(/data-cuenta-activa/g)||[]).length, 1);
  assert.equal((html.match(/>Ver ficha</g)||[]).length, 4);
  assert.doesNotMatch(html, /Cuenta habilitada|Ficha vinculada:|Ver ficha de cuenta/);
  const css = readFileSync(new URL('../publicacion/css/ui-system.css', import.meta.url), 'utf8');
  assert.match(css, /trabajadores-cuentas-grid[^}]*auto-fit[^}]*minmax/);
  assert.doesNotMatch(css, /\.trabajador-cuenta-activo\s*\{/);
  const badge = html.match(/<span data-cuenta-activa[^>]*>/)[0];
  const laboral = f.c.trabajadoresTarjetaHTML({ id, nombre: 'Fixture', estado: 'Activo' });
  for (const clase of ['rounded-full','bg-emerald-100','dark:bg-emerald-950/70','text-emerald-800','dark:text-emerald-300']) {
    assert(badge.includes(clase)); assert(laboral.includes(clase));
  }
});
test('último ajuste: columnas equilibradas, móvil en una columna y observaciones intactas', () => {
  const f = fixture();
  f.c.worker = { id, nombre: 'Nombre único', cargo: 'Cargo', estado: 'Activo', observaciones: 'Observación extensa '.repeat(20) };
  const html = vm.runInContext('trabajadorFichaContenidoHTML(worker)', f.c);
  assert.equal((html.match(/Nombre único/g)||[]).length, 1);
  assert.match(html, /class="trabajador-ficha-datos"/);
  assert.equal((html.match(/class="trabajador-ficha-campo"/g)||[]).length, 2);
  assert.match(html, /<details class="trabajador-observaciones">/);
  assert(html.includes(f.c.worker.observaciones.trim()));
  assert.equal(f.c.worker.observaciones, 'Observación extensa '.repeat(20));
  assert.match(html, /trabajador-ficha-ancho pt-3[^]*trabajador-documentos-lista/);
  const css = readFileSync(new URL('../publicacion/css/ui-system.css', import.meta.url), 'utf8');
  assert.match(css, /trabajador-ficha-datos[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 640px\)[^]*trabajador-ficha-datos \{ grid-template-columns: minmax\(0, 1fr\)/);
});
test('Información: correo y verificación solo con datos explícitos, sin consultas ni inferencias', () => {
  const f = fixture();
  for (const verificado of [undefined, false, true, 'true']) {
    f.c.account = { id, nombre: 'Cuenta de prueba', estado: true, roles: { nombre: 'Administrador' },
      email: '<correo>@example.invalid', correo_verificado: verificado };
    const html = vm.runInContext('cuentaTrabajadorFichaHTML(account)', f.c);
    assert.match(html, /Correo electrónico/);
    assert.match(html, /&lt;correo&gt;@example.invalid/);
    if (typeof verificado === 'boolean') assert(html.includes(verificado ? '>Verificado<' : '>No verificado<'));
    else assert.doesNotMatch(html, /Verificación de correo/);
  }
  f.c.account = { id, nombre: 'Cuenta sin esos campos', roles: { nombre: 'Técnico' }, estado: true };
  const html = vm.runInContext('cuentaTrabajadorFichaHTML(account)', f.c);
  assert.doesNotMatch(html, /Correo electrónico|Verificación de correo/);
  assert.equal(f.calls.length, 0);
});
test('trabajador de prueba: tarjeta y ficha usan los valores recibidos sin renombrar ni truncar', () => {
  const f = fixture();
  f.c.worker = { id, nombre: 'Trabajador prueba', cargo: 'Cargo prueba',
    observaciones: 'Registro ficticio para probar la gestión de trabajadores.', estado: 'Activo' };
  const original = JSON.stringify(f.c.worker);
  const tarjeta = f.c.trabajadoresTarjetaHTML(f.c.worker);
  const ficha = vm.runInContext('trabajadorFichaContenidoHTML(worker)', f.c);
  for (const texto of [f.c.worker.nombre,f.c.worker.cargo,f.c.worker.observaciones]) {
    assert(tarjeta.includes(texto)); assert(ficha.includes(texto));
  }
  assert.doesNotMatch(ficha.match(/<h3[^]*?<\/h3>/)[0], /\btruncate\b/);
  assert.equal(JSON.stringify(f.c.worker), original);
  assert.equal(f.writes.length, 0); assert.equal(f.calls.length, 0);
});
test('documentos Administrador: usa el contrato de cuentas ampliado sin subir por el origen laboral', () => {
  const f = fixture({ escritura: true });
  f.c.account = { id, nombre: 'Administrador de prueba', estado: true, roles: { nombre: 'Administrador' }, trabajador_id: another };
  const html = vm.runInContext('cuentaTrabajadorFichaHTML(account)', f.c);
  assert.doesNotMatch(html, /pendiente de habilitación segura/);
  assert.match(html, /cuenta-documentos-lista/);
  assert.match(html, /onclick="cuentaTrabajadorSubirDocumento/);
  assert.doesNotMatch(html, /onclick="trabajadorSubirDocumento/);
  const service = source('services/trabajadores.service.js');
  assert.match(service, /!\['administrador','recepcion','tecnico'\]\.includes\(rol\)/);
  assert.match(service, /client\.from\('cuentas_documentos'\)\.insert/);
  assert.match(service, /client\.storage\.from\('documentos-cuentas'\)/);
});
function prepararTrabajos(f, leer) {
  const root = contenidoFicha();
  f.c.document.getElementById = key => key === 'trabajador-ficha-contenido' ? root : null;
  f.c.calendarioFechaCivilLocal = () => '2026-11-12';
  vm.runInContext(source('views/gestionTareas.js').match(/function gestionIndicadorLaboral\([^]*?\n}/)[0], f.c);
  f.c.window.GestionTareas = { puede: () => true, contexto: () => ({}), comprobar() {}, historialLaboral: leer };
  f.c.trabajadorFichaPrepararPestanas(id, false);
  return root.querySelector('[data-trabajador-trabajos]');
}
test('ajuste final: cuatro filas por página, carga por lote y sin duplicar asignaciones', async () => {
  const f = fixture(), calls = [];
  const rows = Array.from({length: 12}, (_, i) => ({ id: 'asignacion-' + i, tarea_id: 'tarea-' + i,
    estado: ['pendiente','en_proceso','completada','pendiente'][i % 4], progreso: [0,50,100,0][i % 4],
    tarea: { titulo: 'Trabajo ' + i, fecha_limite: i % 4 === 3 ? '2026-11-01' : '2026-12-01' } }));
  const host = prepararTrabajos(f, async (worker, cursor) => {
    calls.push([worker,cursor]); return cursor == null
      ? {items: rows.slice(0,10),hay_mas:true,siguiente_cursor:'10'}
      : {items:rows.slice(9),hay_mas:false};
  });
  assert.equal(calls.length, 0);
  f.c.trabajadorFichaCambiarPestana('trabajos'); await new Promise(setImmediate);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], id);
  assert.equal((host.innerHTML.match(/trabajador-trabajo-fila/g)||[]).length,4);
  assert.doesNotMatch(host.innerHTML, /<details|Historial de trabajos/);
  for (const color of ['pendiente','en-proceso','completada','vencida']) assert(host.innerHTML.includes('gestion-trabajo-'+color));
  await f.c.trabajadorFichaCargarTrabajos(1); assert.equal(calls.length,1);
  assert.match(host.innerHTML,/Página 2/);
  await f.c.trabajadorFichaCargarTrabajos(1); assert.equal(calls.length,2);
  assert.match(host.innerHTML,/Página 3/);
  assert.equal((host.innerHTML.match(/trabajador-trabajo-fila/g)||[]).length,4);
  assert.equal(vm.runInContext('trabajadorFichaTrabajosContexto.items.length', f.c),12);
  await f.c.trabajadorFichaCargarTrabajos(-1); assert.equal(calls.length,2);
  f.c.trabajadorFichaCambiarPestana('informacion'); f.c.trabajadorFichaCambiarPestana('trabajos');
  assert.equal(calls.length,2);
});
test('ajuste final: vacío, carga, error y respuestas tardías permanecen diferenciados', async () => {
  for (const error of [false,true]) {
    const f=fixture(); let finish;
    const host=prepararTrabajos(f, () => new Promise((resolve,reject) => {finish=()=>error?reject(Error('red')):resolve({items:[],hay_mas:false});}));
    f.c.trabajadorFichaCambiarPestana('trabajos');
    assert.match(host.innerHTML,/Cargando trabajos/); assert.doesNotMatch(host.innerHTML,/Todavía no hay/);
    finish(); await new Promise(setImmediate);
    if(error){assert.match(host.innerHTML,/No fue posible/);assert.doesNotMatch(host.innerHTML,/Todavía no hay/);}
    else assert.match(host.innerHTML,/Todavía no hay trabajos asignados/);
  }
  const f=fixture(); let finish;
  const host=prepararTrabajos(f,()=>new Promise(resolve=>{finish=resolve;}));
  f.c.trabajadorFichaCambiarPestana('trabajos'); f.c.state.currentUser.id='otro';
  finish({items:[],hay_mas:false}); await new Promise(setImmediate);
  assert.doesNotMatch(host.innerHTML,/Todavía no hay/);
});
test('documentos: una lista visual preserva handlers de cada origen, sin migración ni subida laboral en cuenta', () => {
  const f=fixture({escritura:true});const box={innerHTML:''};
  f.c.document.getElementById=key=>key==='cuenta-documentos-lista'?box:null;
  f.c.ctx={id,version:0,actor:'actor',cuentaCargada:true,laboralCargada:true,
    documentos:[{id,estado_reserva:'disponible',retiro:null,nombre_original:'Cuenta.pdf',mime_type_verificado:'application/pdf',tamano_bytes_verificado:10}],
    laborales:[{id:another,nombre_original:'Historico.pdf',mime_type:'application/pdf',tamano_bytes:10}]};
  vm.runInContext('cuentaDocumentalContexto=ctx',f.c);
  f.c.cuentaTrabajadorPintarDocumentos();
  assert.match(box.innerHTML,/Cuenta.pdf/);assert.match(box.innerHTML,/Historico.pdf/);
  assert.match(box.innerHTML,/cuentaTrabajadorVerDocumento/);assert.match(box.innerHTML,/trabajadorVerDocumento/);
  assert.doesNotMatch(box.innerHTML,/Subir documento|Ficha laboral|Cuenta de acceso/);
  f.c.account={id,nombre:'Cuenta',estado:true,trabajador_id:another,roles:{nombre:'Técnico'}};
  const html=vm.runInContext('cuentaTrabajadorFichaHTML(account)',f.c);
  assert.equal((html.match(/Subir documento/g)||[]).length,1);
  assert.doesNotMatch(html,/onclick="trabajadorSubirDocumento|trabajador-documentos-lista/);
  f.c.ctx.errorLaboral=true;f.c.cuentaTrabajadorPintarDocumentos();
  assert.match(box.innerHTML,/No fue posible/);assert.doesNotMatch(box.innerHTML,/Sin documentos registrados/);
  assert.equal(f.writes.length,0);
});
test('documentos: ficha vinculada no permite subir al origen laboral aunque se invoque su handler', async () => {
  const f=fixture();f.c.worker={id,nombre:'Fixture',estado:'Activo'};
  vm.runInContext('trabajadoresFichaActual=worker',f.c);
  f.service.getCuentasSistema=async()=>[{id:another,trabajador_id:id}];
  await assert.rejects(f.c.trabajadorValidarOrigenDocumental(f.c.worker),/cuenta/);
  assert.equal(f.writes.length,0);
});
test('fichas: pestañas compartidas, una sección Documentos y conservación de ambas fuentes', () => {
  const f = fixture({ workers: [{ id, nombre: 'Ficha de prueba', cargo: 'Cargo', estado: 'Activo' }] });
  f.c.worker = { id, nombre: 'Ficha de prueba', cargo: 'Cargo', estado: 'Activo' };
  f.c.account = { id: another, nombre: 'Cuenta de prueba', trabajador_id: id, estado: true, roles: { nombre: 'Técnico' } };
  vm.runInContext('trabajadoresVistaDatos = [worker]', f.c);
  const worker = vm.runInContext('trabajadorFichaContenidoHTML(worker)', f.c);
  const account = vm.runInContext('cuentaTrabajadorFichaHTML(account)', f.c);
  for (const html of [worker, account]) {
    assert.equal((html.match(/role="tab"/g) || []).length, 2);
    assert.match(html, /aria-selected="true"[^>]*>Información/);
    assert.match(html, /aria-selected="false"[^>]*>Mis trabajos/);
    assert.match(html, /id="trabajador-panel-trabajos"[^>]*hidden/);
    assert.equal((html.match(/>Documentos</g) || []).length, 1);

  }
  assert.match(account, /cuenta-documentos-lista/);
  assert.doesNotMatch(account, /cuentaTrabajadorSubirDocumento/);
  assert.match(worker, /trabajador-documentos-lista/);
  assert.doesNotMatch(account, /trabajador-documentos-lista/);
  assert.match(worker, /trabajadorCambiarEstado/);
  assert.match(worker, /abrirTrabajadorFormulario/);
  assert.doesNotMatch(account, /trabajadorCambiarEstado|abrirTrabajadorFormulario/);
});
test('ficha sin cuenta: apertura sin historial, cambio de pestaña único y reapertura limpia', async () => {
  const f = fixture({ workers: [{ id, nombre: 'Ficha sin cuenta', estado: 'Activo' }] });
  const content = contenidoFicha(); let opened = 0, mounts = 0, documents = 0;
  f.c.document.getElementById = key => key === 'modal-trabajador-ficha' ? {} : key === 'trabajador-ficha-contenido' ? content : null;
  f.c.openModal = () => opened++; f.c.closeModal = () => {};
  f.c.trabajadoresCargarDocumentos = () => documents++;
  f.c.window.GestionTareas = { puede: () => true, contexto: () => ({}), comprobar() {}, historialLaboral: async uuid => { mounts++; assert.equal(uuid,id); return {items:[],hay_mas:false}; } };
  await f.c.abrirTrabajadorFicha(id);
  assert.equal(opened, 1); assert.equal(documents, 1); assert.equal(mounts, 0);
  assert.equal(content.querySelector('#trabajador-panel-trabajos').hidden, true);
  f.c.trabajadorFichaCambiarPestana('trabajos');
  assert.equal(mounts, 1);
  assert.equal(content.querySelector('#trabajador-panel-informacion').hidden, true);
  assert.equal(content.querySelector('#trabajador-tab-trabajos').attributes['aria-selected'], 'true');
  f.c.trabajadorFichaCambiarPestana('informacion'); f.c.trabajadorFichaCambiarPestana('trabajos');
  assert.equal(mounts, 1); assert.equal(documents, 1);
  f.c.cerrarTrabajadorFicha();
  assert.equal(vm.runInContext('trabajadorFichaTrabajosContexto', f.c), null);
  await f.c.abrirTrabajadorFicha(id);
  assert.equal(content.querySelector('#trabajador-panel-trabajos').hidden, true);
  assert.equal(mounts, 1);
  f.c.trabajadorFichaCambiarPestana('trabajos'); assert.equal(mounts, 2);
});
test('pestaña de trabajos: sin ficha, sin autorización o con actor cambiado no consulta trabajos', () => {
  for (const mode of ['sin-ficha','sin-permiso','actor-cambiado']) {
    const f = fixture(); const content = contenidoFicha(); let mounts = 0;
    f.c.document.getElementById = key => key === 'trabajador-ficha-contenido' ? content : null;
    f.c.window.GestionTareas = { puede: () => mode !== 'sin-permiso' };
    f.c.gestionFichaLaboral = () => mounts++;
    f.c.trabajadorFichaPrepararPestanas(mode === 'sin-ficha' ? null : id, false);
    if (mode === 'actor-cambiado') f.c.state.currentUser.id = 'otro';
    f.c.trabajadorFichaCambiarPestana('trabajos');
    assert.equal(mounts, 0); assert.equal(f.calls.length, 0);
    if (mode === 'sin-ficha') assert.match(content.querySelector('[data-trabajador-trabajos]').textContent, /no tiene.*ficha/);
  }
});
test('presentación acotada: scroll adaptativo, colores de tema y ocultación real de paneles', () => {
  const css = readFileSync(new URL('../publicacion/css/ui-system.css', import.meta.url), 'utf8');
  assert.match(css, /trabajador-ficha-shell\s*\{[^}]*height:[^}]*100dvh[^}]*overflow:\s*hidden/s);
  assert.match(css, /trabajador-ficha-panel\[hidden\][^}]*display:\s*none/);
  assert.match(css, /trabajador-ficha-tabs[^}]*var\(--alm-border\)/);
  assert.match(css, /trabajador-ficha-panel \[data-gestion-laboral-lista\][^}]*overflow-y:\s*auto/);
  const gestion = source('views/gestionTareas.js');
  assert.match(gestion, /detalle\.ontoggle[^\n]*detalle.open && !inicio/);
  assert.match(gestion, /servicio\.historialLaboral\(id, cursor\)/);
  assert.doesNotMatch(gestion.match(/function gestionFichaLaboral\([^]*?\n}/)[0], /<details[^>]*\bopen\b/);
});
test('pestañas: flechas, Inicio y Fin actualizan selección y foco sin cargar historial', () => {
  const f = fixture(), content = contenidoFicha(); let focus = '', prevented = 0;
  f.c.document.getElementById = key => key === 'trabajador-ficha-contenido' ? content : { focus() { focus = key; } };
  f.c.trabajadorFichaPrepararPestanas(null, false);
  const event = (key, id) => ({ key, target: { id, getAttribute: () => 'tab' }, preventDefault() { prevented++; } });
  f.c.trabajadorFichaTecladoPestanas(event('ArrowRight', 'trabajador-tab-informacion'));
  assert.equal(focus, 'trabajador-tab-trabajos');
  f.c.trabajadorFichaTecladoPestanas(event('Home', 'trabajador-tab-trabajos'));
  assert.equal(focus, 'trabajador-tab-informacion');
  f.c.trabajadorFichaTecladoPestanas(event('End', 'trabajador-tab-informacion'));
  assert.equal(focus, 'trabajador-tab-trabajos');
  assert.equal(prevented, 3); assert.equal(f.calls.length, 0);
});
function fixture({ permanent = true, allowed = true, accounts = [], workers = [], escritura = false, retiro = false, root = process.env.TRABAJADORES_DOCUMENTOS_RAIZ === '1', rootView = false } = {}) {
  const calls = [], writes = [], messages = [], confirmations = [];
  let remoteAllowed = true;
  const container = { innerHTML: '', querySelector() { return null; }, classList: { add() {}, remove() {} } };
  const c = vm.createContext({ Blob, File, FormData, URL, crypto, btoa, setTimeout, clearTimeout,
    console: { error() {} }, state: { currentUser: { id: 'actor' } },
    esAdminPermanenteActual: () => permanent, esAdminOperativoActual: () => allowed,
    revalidarPrivilegioParaEscritura: async () => allowed,
    uiEncabezadoSeccion: (title, subtitle, icon, actions) => title + actions,
    document: { getElementById: key => key === 'trabajadores-content' ? container : null },
    window: { confirm: message => { confirmations.push(message); return true; }, supabaseClient: {
      async rpc(name, ...args) {
        assert.equal(name, 'trabajadores_listar_cuentas_sistema_v1');
        assert.equal(args.length, 0, 'Sin identificadores ni roles enviados por el cliente');
        calls.push({ rpc: name });
        return remoteAllowed ? { data: accounts } : { error: { code: '42501' } };
      },
      from(table) {
        assert(['trabajadores', 'cuentas_documentos'].includes(table));
        const call = { table, filters: [] }; calls.push(call);
        const query = {
          select(columns) { call.columns = columns; return this; },
          order() { return this; }, eq(k, v) { call.filters.push([k, v]); return this; },
          not(k,op,v) { call.not=[k,op,v];return this; }, is(k,v) {call.is=[k,v];return this;},
          neq(k, v) { call.excluded = [k, v]; return this; },
          update(payload) { call.payload = payload; return this; },
          then(resolve) { return Promise.resolve({ data: table === 'cuentas_documentos' ? [] : workers }).then(resolve); },
          async single() {
            const row = workers.find(w => w.id === call.filters.find(([k]) => k === 'id')?.[1]);
            if (!row || call.excluded && row[call.excluded[0]] === call.excluded[1]) return { error: new Error('Sin fila editable') };
            if (call.payload) { writes.push(structuredClone(call)); Object.assign(row, call.payload); }
            return { data: structuredClone(row) };
          },
        }; return query;
      },
    } } });
  const fixtureService = root ? readFileSync(new URL('../js/services/trabajadores.service.js', import.meta.url), 'utf8') : source('services/trabajadores.service.js');
  const fechas=readFileSync(new URL('../js/state.js',import.meta.url),'utf8');
  vm.runInContext(fechas.slice(fechas.indexOf('function formatearFechaCL('),fechas.indexOf('function calculateWarrantyStatus(')),c);
  vm.runInContext(fixtureService.replace(/(const TRABAJADORES_DOCUMENTOS_CUENTAS_ESCRITURA_HABILITADA = )(?:true|false);/, (_, declaracion) => declaracion + escritura + ';').replace(/(const TRABAJADORES_DOCUMENTOS_CUENTAS_ELIMINACION_HABILITADA = )(?:true|false);/, (_, declaracion) => declaracion + retiro + ';'), c);
  vm.runInContext(rootView ? readFileSync(new URL('../js/views/trabajadores.js', import.meta.url), 'utf8') : source('views/trabajadores.js'), c);
  c.mostrarAvisoTrabajador = message => messages.push(message);
  return { c, service: c.window.TrabajadoresService, calls, writes, messages, confirmations, container,
    setRemoteAllowed: value => { remoteAllowed = value; } };
}

function aprobacionFixture(options = {}) {
  const f = fixture({root:options.root===true}), storage = options.storage || new Map(), eventos = [], solicitudes = new Map();
  const rolId = '44444444-4444-4444-8444-444444444444';
  const workerId = '33333333-3333-4333-8333-333333333333';
  const usuario = { id: another, nombre: 'Persona de prueba', estado: true, rol_id: null,
    trabajador_id: options.vinculada ? workerId : null };
  const trabajadores = options.trabajadores || (options.vinculada ? [{id:workerId,nombre:usuario.nombre,estado:'Activo'}] : []);
  let falloVinculo = options.falloVinculo, falloAprobacion = options.falloAprobacion;
  f.c.sessionStorage = { getItem: k => storage.get(k) ?? null, setItem(k,v) { storage.set(k,v); }, removeItem: k => storage.delete(k) };
  f.c.window.supabaseClient.auth = { getUser: async () => ({data:{user:{id:'actor'}}}) };
  f.c.window.UsuariosService = {
    getMiEstadoAdministrativo: async () => ({es_admin_permanente:options.permanente !== false}),
    getRoles: async () => [{id:rolId,nombre:'Técnico'},{id, nombre:'Administrador'}],
    getUsuario: async () => ({...usuario}),
    getCorreosVerificados: async () => new Set(options.verificado === false ? [] : [another]),
    aprobarUsuario: async (uuid, p) => {
      eventos.push(['aprobar', uuid]); assert.equal(uuid, another); assert(usuario.trabajador_id);
      if(falloAprobacion==='rechazo'){falloAprobacion=null;throw Error('rechazado');}
      usuario.rol_id=p.rol_id;
      if(falloAprobacion==='incierto'){falloAprobacion=null;throw Error('respuesta perdida');}
      return {...usuario};
    }
  };
  f.service.getTrabajadores = async () => trabajadores.map(t=>({...t}));
  f.service.listarVinculosCuentas = async () => options.cuentas || [];
  f.service.getTrabajador = async uuid => trabajadores.find(t=>t.id===uuid);
  f.c.window.supabaseClient.rpc = async (rpc,p) => {
    assert.equal(rpc,'usuarios_trabajadores_gestionar_v1');
    eventos.push(['vincular', structuredClone(p)]);
    assert(!Object.hasOwn(p,'devolverDetalle'));assert(!Object.hasOwn(p,'rol_id'));
    const anterior=solicitudes.get(p.p_solicitud_id);
    if(anterior){assert.equal(anterior.huella,JSON.stringify(p));return {data:{...anterior.recibo,resultado:'YA_REGISTRADA'}};}
    if(falloVinculo==='auditoria')return {error:{code:'P0001',message:'Auditoría rechazada; rollback simulado'}};
    if(usuario.trabajador_id)return {error:{code:'P0001',message:'CUENTA_YA_VINCULADA'}};
    if(p.p_accion==='CREAR_Y_VINCULAR'){
      if(trabajadores.some(t=>t.nombre.toLowerCase().trim()===p.p_nombre_laboral.toLowerCase().trim()))
        return {error:{code:'P0001',message:'POSIBLE_FICHA_EXISTENTE_REQUIERE_REVISION'}};
      trabajadores.push({id:workerId,nombre:p.p_nombre_laboral,estado:'Activo'});
    }
    usuario.trabajador_id=p.p_trabajador_id||workerId;
    const recibo={resultado:'REGISTRADA',usuario_id:another,trabajador_id:usuario.trabajador_id,solicitud_id:p.p_solicitud_id};
    solicitudes.set(p.p_solicitud_id,{huella:JSON.stringify(p),recibo});
    if(falloVinculo){falloVinculo=false;throw Error('respuesta de red incierta');}
    return {data:recibo};
  };
  const aprobar = confirmar => f.service.aprobarCuentaConFicha({usuarioId:another,rolId,confirmar});
  return {...f, usuario, trabajadores, storage, eventos, solicitudes, rolId, workerId, aprobar};
}
test('aprobación laboral: coincidencia exacta exige elección y vincula antes de aprobar', async () => {
  const w={id:'33333333-3333-4333-8333-333333333333',nombre:'Persona de prueba',estado:'Activo'};
  const f=aprobacionFixture({trabajadores:[w]});
  const r=await f.aprobar(async plan=>{assert.equal(plan.coincidencias.length,1);assert.equal(f.eventos.length,0);return {accion:'VINCULAR',trabajadorId:w.id};});
  assert.equal(r.trabajador_id,w.id);assert.deepEqual(f.eventos.map(e=>e[0]),['vincular','aprobar']);
  assert.equal(f.trabajadores.length,1);assert.equal(f.solicitudes.size,1);
});
test('aprobación laboral: sin coincidencias crea una sola ficha y reutiliza asociación previa', async () => {
  const f=aprobacionFixture();await f.aprobar(async plan=>{assert.equal(plan.coincidencias.length,0);return {accion:'CREAR_Y_VINCULAR'};});
  assert.equal(f.trabajadores.length,1);assert.deepEqual(f.eventos.map(e=>e[0]),['vincular','aprobar']);
  const vinculada=aprobacionFixture({vinculada:true});
  await vinculada.aprobar(async()=>{throw Error('No debe volver a preguntar ni crear');});
  assert.deepEqual(vinculada.eventos.map(e=>e[0]),['aprobar']);
});
test('aprobación laboral: cancelar, homónimos, inactivos y selección ajena no aprueban', async () => {
  const w={id:'33333333-3333-4333-8333-333333333333',nombre:'Persona de prueba',estado:'Activo'};
  const cancel=aprobacionFixture({trabajadores:[w]});assert.equal(await cancel.aprobar(async()=>null),null);assert.equal(cancel.eventos.length,0);
  const homonimos=aprobacionFixture({trabajadores:[w,{...w,id:'55555555-5555-4555-8555-555555555555'}]});
  await assert.rejects(homonimos.aprobar(async plan=>{assert.equal(plan.coincidencias.length,2);return {accion:'CREAR_Y_VINCULAR'};}));
  assert.equal(homonimos.eventos.length,0);
  const inactivo=aprobacionFixture({trabajadores:[{...w,estado:'Inactivo'}]});
  await assert.rejects(inactivo.aprobar(async()=>({accion:'VINCULAR',trabajadorId:w.id})));
  assert.equal(inactivo.eventos.length,0);
});
test('aprobación laboral: vinculación incierta detiene aprobación y reenvía el mismo UUID manualmente', async () => {
  const f=aprobacionFixture({falloVinculo:true});
  await assert.rejects(f.aprobar(async()=>({accion:'CREAR_Y_VINCULAR'})),/Vinculación no confirmada/);
  assert.equal(f.eventos.filter(e=>e[0]==='aprobar').length,0);
  assert(f.service.solicitudAprobacionLaboral(another));
  await f.aprobar(async plan=>{assert.equal(plan.recuperacion,true);return true;});
  const envios=f.eventos.filter(e=>e[0]==='vincular');
  assert.equal(envios.length,2);assert.deepEqual(envios[0][1],envios[1][1]);
  assert.equal(f.trabajadores.length,1);assert.equal(f.solicitudes.size,1);
});
test('aprobación laboral: fallo tras vincular conserva ficha y recupera sin volver a vincular', async () => {
  for(const falloAprobacion of ['rechazo','incierto']){
    const f=aprobacionFixture({falloAprobacion});
    await assert.rejects(f.aprobar(async()=>({accion:'CREAR_Y_VINCULAR'})),/ficha está vinculada/);
    const worker=f.usuario.trabajador_id;
    await f.aprobar(async()=>{throw Error('No debe reconstruir solicitud');});
    assert.equal(f.usuario.trabajador_id,worker);assert.equal(f.trabajadores.length,1);
    assert.equal(f.eventos.filter(e=>e[0]==='vincular').length,1);
    assert.equal(f.eventos.filter(e=>e[0]==='aprobar').length,falloAprobacion==='incierto'?1:2);
  }
});
test('aprobación laboral: correo, permanente, rol especial y doble envío no se eluden', async () => {
  for(const options of [{permanente:false},{verificado:false}]){
    const f=aprobacionFixture(options);await assert.rejects(f.aprobar(async()=>({accion:'CREAR_Y_VINCULAR'})));assert.equal(f.eventos.length,0);
  }
  const f=aprobacionFixture();
  await assert.rejects(f.service.aprobarCuentaConFicha({usuarioId:another,rolId:id,confirmar:async()=>true}),/procedimiento especial/);
  let finish;
  const pendiente=f.aprobar(()=>new Promise(resolve=>{finish=resolve;}));
  await new Promise(setImmediate);
  await assert.rejects(f.aprobar(async()=>true),/EN_CURSO/);
  finish({accion:'CREAR_Y_VINCULAR'});await pendiente;
  assert.equal(f.eventos.filter(e=>e[0]==='vincular').length,1);
});
test('aprobación laboral: recuperación tras recarga reutiliza solicitud y estado durable del backend', async () => {
  const primera=aprobacionFixture({falloVinculo:true});
  await assert.rejects(primera.aprobar(async()=>({accion:'CREAR_Y_VINCULAR'})));
  const recarga=aprobacionFixture({storage:primera.storage});
  recarga.c.window.UsuariosService=primera.c.window.UsuariosService;
  recarga.c.window.supabaseClient.rpc=primera.c.window.supabaseClient.rpc;
  recarga.service.getTrabajador=primera.service.getTrabajador;
  await recarga.aprobar(async plan=>{assert.equal(plan.recuperacion,true);return true;});
  const envios=primera.eventos.filter(e=>e[0]==='vincular');
  assert.equal(envios.length,2);assert.deepEqual(envios[0][1],envios[1][1]);
  assert.equal(primera.trabajadores.length,1);assert.equal(primera.solicitudes.size,1);
});
test('aprobación laboral: fallo de auditoría no aprueba y cierre tras vínculo conserva estado parcial', async () => {
  const audit=aprobacionFixture({falloVinculo:'auditoria'});
  await assert.rejects(audit.aprobar(async()=>({accion:'CREAR_Y_VINCULAR'})));
  assert.equal(audit.trabajadores.length,0);assert.equal(audit.solicitudes.size,0);
  assert.equal(audit.eventos.filter(e=>e[0]==='aprobar').length,0);
  const f=aprobacionFixture();let abierta=true;
  const original=f.service.gestionarVinculoCuenta.bind(f.service);
  f.service.gestionarVinculoCuenta=async datos=>{const r=await original(datos);abierta=false;return r;};
  await assert.rejects(f.service.aprobarCuentaConFicha({usuarioId:another,rolId:f.rolId,
    confirmar:async()=>({accion:'CREAR_Y_VINCULAR'}),continuar:()=>abierta}),/ficha está vinculada/);
  assert.equal(f.trabajadores.length,1);assert(f.usuario.trabajador_id);
  assert.equal(f.eventos.filter(e=>e[0]==='aprobar').length,0);
});
test('aprobación laboral: SQL conserva bloqueo de homónimos no idénticos y ticket no cambia de cuenta', async () => {
  const w={id:'33333333-3333-4333-8333-333333333333',nombre:'PERSONA DE PRUEBA',estado:'Activo'};
  const f=aprobacionFixture({trabajadores:[w]});
  await assert.rejects(f.aprobar(async plan=>{assert.equal(plan.coincidencias.length,0);return {accion:'CREAR_Y_VINCULAR'};}));
  assert.equal(f.trabajadores.length,1);assert.equal(f.eventos.filter(e=>e[0]==='aprobar').length,0);
  const key=[...f.storage.keys()].find(k=>k.startsWith('hotel.aprobacion-laboral.'));
  const ticket=JSON.parse(f.storage.get(key));ticket.datos.usuarioId=id;f.storage.set(key,JSON.stringify(ticket));
  const antes=f.eventos.length;
  await assert.rejects(f.aprobar(async()=>true),/incompatible/);
  assert.equal(f.eventos.length,antes);
});
test('confirmación de aprobación: tres opciones y selección explícita, sin coincidencias automáticas', async () => {
  const view=source('views/admin.js'),f=fixture();
  f.c.adminAccesoVigente=()=>true;f.c.adminEscapeHTML=x=>String(x).replaceAll('<','&lt;');
  let ultimo;
  f.c.document.body={appendChild(){}};
  f.c.document.createElement=()=>{
    const eventos={},nodes=new Map();
    ultimo={innerHTML:'',setAttribute(){},showModal(){},remove(){},close(){eventos.close?.();},
      addEventListener(k,fn){eventos[k]=fn;},querySelector(k){if(!nodes.has(k))nodes.set(k,{value:'',disabled:false,textContent:'',focus(){}});return nodes.get(k);}};
    return ultimo;
  };
  vm.runInContext(view.match(/function adminConfirmarFichaAprobacion\([^]*?\n}/)[0],f.c);
  const worker={id,nombre:'Persona de prueba',estado:'Activo'};
  const unica=f.c.adminConfirmarFichaAprobacion({usuario:{nombre:'Persona de prueba'},coincidencias:[worker],elegibles:[worker]});
  assert.match(ultimo.innerHTML,/Ya existe una ficha de Persona de prueba\. ¿Es esta persona\?/);
  for(const texto of ['Vincular ficha','Es otra persona','Cancelar'])assert(ultimo.innerHTML.includes(texto));
  ultimo.querySelector('[data-otra]').onclick();
  assert.equal(ultimo.querySelector('[data-confirmar]').disabled,true);
  ultimo.querySelector('[data-cancelar]').onclick();assert.equal(await unica,null);
  const varias=f.c.adminConfirmarFichaAprobacion({usuario:{nombre:'Persona de prueba'},coincidencias:[worker,{...worker,id:another}],elegibles:[worker,{...worker,id:another}]});
  assert.match(ultimo.innerHTML,/option value=""/);
  ultimo.querySelector('[data-confirmar]').onclick();
  assert.match(ultimo.querySelector('[data-mensaje]').textContent,/Selecciona/);
  ultimo.querySelector('[data-ficha]').value=another;ultimo.querySelector('[data-confirmar]').onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(await varias)),{accion:'VINCULAR',trabajadorId:another});
  const nueva=f.c.adminConfirmarFichaAprobacion({usuario:{nombre:'Nueva persona'},coincidencias:[],elegibles:[]});
  ultimo.querySelector('[data-confirmar]').onclick();
  assert.equal((await nueva).accion,'CREAR_Y_VINCULAR');
});

test('cuentas: RPC mínima para permanente/temporal, agrupa concurrencia sin emparejar nombres', async () => {
  const f = fixture({ accounts: [
    { id, nombre: 'Mismo nombre', estado: true, rol: 'Recepción' },
    { id: another, nombre: 'Mismo nombre', estado: false, rol: 'Técnico' },
  ] });
  const [result] = await Promise.all([f.service.getCuentasSistema(), f.service.getCuentasSistema()]);
  assert.deepEqual(Array.from(result, u => u.id), [id, another]);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].rpc, 'trabajadores_listar_cuentas_sistema_v1');
  const temporal = fixture({ permanent: false, accounts: [{ id, nombre: 'Cuenta', rol: 'Recepción', estado: true }] });
  assert.equal((await temporal.service.getCuentasSistema()).length, 1);
  assert(!temporal.c.trabajadoresCuentasHTML().includes("navigateTo('admin')"));
  temporal.setRemoteAllowed(false); // Delegación vencida o revocada según servidor.
  await assert.rejects(temporal.service.getCuentasSistema());
  assert.equal(temporal.calls.length, 2, 'No reutilizar autorización de una respuesta anterior');
  for (const role of ['TECNICO', 'RECEPCION']) {
    const denied = fixture({ permanent: false, allowed: false });
    denied.c.state.currentUser.role = role;
    await assert.rejects(denied.service.getCuentasSistema());
    assert.equal(denied.calls.length, 0);
  }
});

test('cuentas: errores, roles inesperados, columnas extra y cambio de identidad fallan cerrados', async () => {
  for (const row of [{ id, nombre: 'Administrador', rol: 'Administrador', estado: true },
    { id, nombre: 'Cuenta', rol: 'Recepción', estado: true, email: 'dato-no-permitido@example.test' }]) {
    await assert.rejects(fixture({ accounts: [row] }).service.getCuentasSistema());
  }
  const f = fixture();
  f.setRemoteAllowed(false);
  await assert.rejects(f.service.getCuentasSistema());
  assert.equal(f.writes.length, 0);
  f.setRemoteAllowed(true);
  const pending = f.service.getCuentasSistema();
  f.c.state.currentUser.id = 'otra-identidad';
  await assert.rejects(pending);
});

test('contrato de lectura: solo RPC sin argumentos, sin fallback a tablas ni rutas de eliminación', async () => {
  // No inspecciona SQL remoto: las guardas/ACL deben validarse al instalar la RPC.
  const code = source('services/trabajadores.service.js');
  const body = code.slice(code.indexOf('async getCuentasSistema()'), code.indexOf('async getDocumentosCuenta'));
  assert(body.includes(".rpc('trabajadores_listar_cuentas_sistema_v1')"));
  assert(!/\.from\(|\.functions\.|\.auth\.|\.storage\b|email|password/.test(body));
  assert(body.includes("['id','nombre','rol','estado']"));
  assert(body.includes('state.currentUser?.id !== actor'));
  assert(body.includes('!esAdminOperativoActual()'));
  const f = fixture({ permanent: false });
  f.setRemoteAllowed(false);
  await assert.rejects(f.service.getCuentasSistema());
  assert.equal(f.calls.length, 1);
  assert.equal(f.writes.length, 0);
  f.c.esAdminOperativoActual = () => false;
  await assert.rejects(f.service.getCuentasSistema());
  assert.equal(f.calls.length, 1, 'No continuar si la delegación local dejó de estar autorizada');
});

test('baja lógica permanente y temporal: solo estado por UUID, sin pérdida de campos/relaciones', async () => {
  for (const permanent of [true, false]) {
    const worker = { id, nombre: 'Original', cargo: 'Cargo', estado: 'Activo', observaciones: null, created_at: 'fecha', updated_at: 'fecha' };
    const f = fixture({ permanent, workers: [worker] });
    const result = await f.service.eliminarTrabajadorLogicamente(id);
    assert.equal(result.estado, 'Eliminado');
    assert.equal(f.writes.length, 1);
    assert.deepEqual(f.writes[0].payload, { estado: 'Eliminado' });
    assert.deepEqual(f.writes[0].filters, [['id', id]]);
    assert.deepEqual(f.writes[0].excluded, ['estado', 'Eliminado']);
    assert.deepEqual(worker, { id, nombre: 'Original', cargo: 'Cargo', estado: 'Eliminado', observaciones: null, created_at: 'fecha', updated_at: 'fecha' });
    await assert.rejects(f.service.updateTrabajador(id, { estado: 'Activo' }));
    await assert.rejects(f.service.updateTrabajador(id, { nombre: 'Cambiado' }));
    assert.equal(f.writes.length, 1);
  }
});

test('UUID inválido, privilegio perdido y actualización rechazada no eliminan ni presentan éxito', async () => {
  const f = fixture({ allowed: false, workers: [{ id, estado: 'Activo' }] });
  await assert.rejects(f.service.eliminarTrabajadorLogicamente('nombre'));
  await assert.rejects(f.service.eliminarTrabajadorLogicamente(id));
  assert.equal(f.writes.length, 0);
  const denied = fixture({ workers: [{ id, estado: 'Activo' }] });
  denied.c.revalidarPrivilegioParaEscritura = async () => false;
  await assert.rejects(denied.service.eliminarTrabajadorLogicamente(id));
  assert.equal(denied.writes.length, 0);
});

test('listado: dos secciones independientes, filtro de eliminados y ficha histórica sin editar/reactivar', () => {
  const f = fixture();
  const rows = [{ id, nombre: 'Activo original', estado: 'Activo' },
    { id: another, nombre: 'Inactivo original', estado: 'Inactivo' },
    { id: 'eliminado', nombre: 'Histórico conservado', estado: 'Eliminado' }];
  let html = f.c.getTrabajadoresHTML(rows);
  for (const text of ['Personal con cuenta', 'Personal registrado sin cuenta', 'Activo original', 'Inactivo original', 'Mostrar eliminados']) assert(html.includes(text));
  assert(!html.includes('Histórico conservado'));
  f.c.rows = rows; vm.runInContext('trabajadoresVistaDatos = rows', f.c);
  f.c.trabajadoresFiltrarEliminados(true);
  html = f.container.innerHTML;
  assert(html.includes('Histórico conservado'));
  assert(html.indexOf('Inactivo original') < html.indexOf('Histórico conservado'));
  const card = f.c.trabajadoresTarjetaHTML(rows[2]);
  assert(card.includes('Eliminado')); assert(!card.includes('abrirTrabajadorFormulario')); assert(!card.includes('trabajadorCambiarEstado'));
  const detail = f.c.trabajadorFichaContenidoHTML(rows[2]);
  assert(detail.includes('Histórico conservado')); assert(!detail.includes('Reactivar trabajador')); assert(!detail.includes('abrirTrabajadorFormulario'));
  assert(detail.includes('trabajador-documentos-lista'), 'Conservar consulta de documentos');
  const temporal = fixture({ permanent: false });
  assert(!temporal.c.trabajadoresCuentasHTML().includes("navigateTo('admin')"));
});

test('confirmación con nombre, cancelar y concurrencia: una actualización y retirada tras confirmación real simulada', async () => {
  const f = fixture({ workers: [{ id, nombre: 'Nombre original', estado: 'Activo' }] });
  f.c.window.confirm = message => { f.confirmations.push(message); return false; };
  await f.c.trabajadorCambiarEstado(id, 'Eliminado');
  assert.equal(f.writes.length, 0);
  f.c.window.confirm = message => { f.confirmations.push(message); return true; };
  await Promise.all([f.c.trabajadorCambiarEstado(id, 'Eliminado'), f.c.trabajadorCambiarEstado(id, 'Eliminado')]);
  assert.equal(f.writes.length, 1);
  assert(f.confirmations.every(m => m.includes('Nombre original') && m.includes('historial')));
  assert(!f.container.innerHTML.includes('Nombre original'));
  await f.c.trabajadorCambiarEstado(id, 'Activo');
  assert.equal(f.writes.length, 1, 'No reactivar un eliminado desde una ficha antigua');
});

test('Reactiva conserva selección solo Activo y lectura histórica por UUID; no se conecta eliminación Auth', () => {
  assert(source('views/reactiva.js').includes("trabajadores.filter(t => t.estado === 'Activo')"));
  assert(source('services/mantencionesReactivas.service.js').includes(".select('id,nombre,cargo').in('id'"));
  for (const name of ['views/trabajadores.js', 'services/trabajadores.service.js'])
    assert(!/usuario-eliminacion-ejecutar|deleteUser|\.delete\(|\.functions\./.test(source(name).replaceAll('cuentaDocumentoUrls.delete(url)', '').replaceAll('this._intencionesVinculo.delete(clave)', '').replaceAll('this._aprobacionesLaboralesEnCurso.delete(usuarioId)', '')));
  assert.equal((source('services/trabajadores.service.js').match(/\.rpc\(/g) || []).length, 7);
});

test('ficha de cuenta por UUID: solo lectura, modal reutilizado y lectura documental según autorización vigente', () => {
  for (const [permanent, allowed, escritura] of [[true, true, false], [true, true, true], [false, true, true], [false, false, false]]) {
    const f = fixture({ permanent, allowed, escritura });
    const content = contenidoFicha(), modal = {};
    f.c.document.getElementById = key => key === 'modal-trabajador-ficha' ? modal : key === 'trabajador-ficha-contenido' ? content : null;
    let opens = 0;
    f.c.openModal = name => { assert.equal(name, 'modal-trabajador-ficha'); opens++; };
    f.c.accounts = [{ id, trabajador_id: another, nombre: '<Nombre original>', estado: true, roles: { nombre: 'Recepción' } }];
    vm.runInContext('trabajadoresCuentasVista = accounts', f.c);
    f.c.abrirCuentaTrabajadorFicha(id);
    if (!allowed) { assert.equal(opens, 0); assert.equal(f.calls.length, 0); continue; }
    assert.equal(opens, 1);
    assert(content.innerHTML.includes('&lt;Nombre original&gt;'));
    assert(content.innerHTML.includes('Rol permanente') && content.innerHTML.includes('Recepción'));
    assert(content.innerHTML.includes('Cuenta habilitada'));
    assert(!content.innerHTML.includes('Datos de cuenta · Solo lectura'));
    if (allowed && escritura) {
      assert(content.innerHTML.includes('Subir documento'));
      assert(/<button type="button" onclick="cuentaTrabajadorSubirDocumento\(\)" aria-describedby="cuenta-documentos-disponibilidad"/.test(content.innerHTML));
      assert(!content.innerHTML.includes('onclick="trabajadorSubirDocumento'));
    } else assert(!content.innerHTML.includes('Subir documento'));
    assert(content.innerHTML.includes('Documentos') && (content.innerHTML.includes('Cargando documentos') || content.innerHTML.includes('Solo un administrador con autorización vigente')));
    const fileInputs = content.innerHTML.match(/<input type="file"[^>]*>/g) || [];
    assert.equal(fileInputs.length, allowed && escritura ? 1 : 0);
    assert(!/<(?:input|select|textarea)\b/.test(content.innerHTML.replace(/<input type="file"[^>]*>/g, '')));
    if (allowed && escritura) {
      assert(fileInputs[0].includes('cuentaTrabajadorSubirDocumento(this)'));
      assert(fileInputs[0].includes(' hidden '));
      assert(fileInputs[0].includes('class="hidden"'));
      assert(content.innerHTML.includes('Selecciona un PDF'));
      assert(!content.innerHTML.includes('Seleccionar archivo (solo preparación local)'));
    } 
    assert(!/trabajadorVerDocumento|trabajadorDescargarDocumento|trabajadorSubir|trabajadorCambiarEstado|abrirTrabajadorFormulario/.test(content.innerHTML));
    assert.equal(f.calls.length, allowed ? 1 : 0, 'Solo administración vigente consulta metadatos, nunca crea trabajadores');
    assert.equal(f.writes.length, 0);
    const cards = f.c.trabajadoresCuentasHTML();
    assert(cards.includes('abrirCuentaTrabajadorFicha'));
    assert(!cards.includes("navigateTo('admin')"));
    f.c.abrirCuentaTrabajadorFicha(another);
    assert.equal(opens, 1, 'No buscar por nombre ni abrir UUID ajeno al listado');
    f.c.esAdminOperativoActual = () => false;
    f.c.abrirCuentaTrabajadorFicha(id);
    if (!allowed) { assert.equal(opens, 0); assert.equal(f.calls.length, 0); continue; }
    assert.equal(opens, 1);
  }
});

test('cambiar de ficha laboral a cuenta descarta respuestas laborales atrasadas, sin cargar documentos', async () => {
  const f = fixture(), content = contenidoFicha();
  f.c.document.getElementById = key => key === 'modal-trabajador-ficha' ? {} : key === 'trabajador-ficha-contenido' ? content : null;
  f.c.openModal = () => {};
  f.c.accounts = [{ id: another, nombre: 'Cuenta seleccionada', estado: false, roles: { nombre: 'Técnico' } }];
  vm.runInContext('trabajadoresCuentasVista = accounts', f.c);
  let resolveWorker, documents = 0;
  f.service.getTrabajador = () => new Promise(resolve => { resolveWorker = resolve; });
  f.c.trabajadoresCargarDocumentos = () => { documents++; };
  const pending = f.c.abrirTrabajadorFicha(id);
  f.c.abrirCuentaTrabajadorFicha(another);
  resolveWorker({ id, nombre: 'Trabajador anterior', estado: 'Activo' });
  await pending;
  assert(content.innerHTML.includes('Cuenta seleccionada'));
  assert(!content.innerHTML.includes('Trabajador anterior'));
  assert.equal(documents, 0);
  assert.equal(vm.runInContext('trabajadoresFichaActual', f.c), null);
});


test('documentos de cuenta: UUID histórico, disponible, vacío/error y respuestas atrasadas', async () => {
  const f = fixture();
  assert.equal((await f.service.getDocumentosCuenta(id)).length, 0);
  const query = f.calls[0];
  assert.equal(query.table, 'cuentas_documentos');
  assert.deepEqual(Array.from(query.not),['retiro_confirmado.confirmado_en','is',null]);
  assert.deepEqual(Array.from(query.is),['retiro_confirmado',null]);
  assert.deepEqual(query.filters, [['cuenta_id', id], ['estado_reserva', 'disponible']]);
  assert(!/usuarios|trabajador_id|storage_path/.test(query.columns));
  await assert.rejects(fixture({ permanent: false, allowed: false }).service.getDocumentosCuenta(id));
  await assert.rejects(f.service.getDocumentosCuenta('invalido'));
  const box = { innerHTML: '', textContent: '' };
  f.c.document.getElementById = key => key === 'cuenta-documentos-lista' ? box : null;
  f.c.pruebaCuenta = { id, version: 0, actor: 'actor', documentos: [], laborales: [], cuentaCargada: false, laboralCargada: true };
  vm.runInContext('cuentaDocumentalContexto = pruebaCuenta', f.c);
  await f.c.cuentaTrabajadorCargarDocumentos(id, 0);
  assert(box.innerHTML.includes('Sin documentos registrados'));
  f.service.getDocumentosCuenta = async () => [{ nombre_original: '<archivo>.pdf', mime_type_verificado: 'application/pdf', tamano_bytes_verificado: 52 }];
  await f.c.cuentaTrabajadorCargarDocumentos(id, 0);
  assert(box.innerHTML.includes('&lt;archivo&gt;.pdf'));
  assert(!/<button|onclick|href=/.test(box.innerHTML));
  assert(box.innerHTML.includes('PDF') && box.innerHTML.includes('52 B'));
  const laboral = f.c.trabajadorDocumentoFilaHTML({ id, nombre_original: 'Laboral', mime_type: 'application/pdf', tamano_bytes: 52 });
  for (const accion of ['trabajadorVerDocumento', 'trabajadorDescargarDocumento', 'trabajadorEliminarDocumento']) assert(laboral.includes(accion));
  f.service.getDocumentosCuenta = async () => { throw new Error('permiso/red'); };
  await f.c.cuentaTrabajadorCargarDocumentos(id, 0);
  assert(box.innerHTML.includes('No fue posible consultar'));
  let finish;
  f.service.getDocumentosCuenta = () => new Promise(resolve => { finish = resolve; });
  const pending = f.c.cuentaTrabajadorCargarDocumentos(id, 0);
  vm.runInContext('++trabajadorFichaVersion', f.c); // cierre/cambio de ficha
  box.innerHTML = 'Ficha nueva';
  finish([]); await pending;
  assert.equal(box.innerHTML, 'Ficha nueva');
  const denied = fixture();
  denied.c.window.supabaseClient.from = () => ({ select() { return this; }, eq() { return this; }, not(){return this;},is(){return this;},order() { return this; }, then(resolve) { return Promise.resolve({ error: { code: '42501' } }).then(resolve); } });
  await assert.rejects(denied.service.getDocumentosCuenta(id));
});

test('documentos directos: RLS, hash, errores y bloqueo de toda subida incluso con indicador alterado', async () => {
  const f = fixture(); const blob = new Blob(['PDF'], { type:'application/pdf' });
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())), b=>b.toString(16).padStart(2,'0')).join('');
  const row = { id, cuenta_id:another, bucket_id:'documentos-cuentas', storage_path:'cuentas/'+another+'/'+id,
    estado_reserva:'disponible',retiro:null,storage_object_id:id, storage_version:'v1', mime_type_verificado:'application/pdf',
    tamano_bytes_verificado:3,sha256_verificado:hash };
  let reads=0,downloads=0;
  f.c.window.supabaseClient.from = table => { assert.equal(table,'cuentas_documentos'); return {
    select(){return this;}, eq(){return this;}, async single(){reads++;return {data:{...row}};}
  }; };
  f.c.window.supabaseClient.storage = { from(bucket) { assert.equal(bucket,'documentos-cuentas');return {
    async download(path){ assert.equal(path,row.storage_path); downloads++;return {data:blob}; }
  }; } };
  assert.equal(await f.service.obtenerArchivoCuenta(id),blob);
  assert.equal(reads,2);assert.equal(downloads,1);
  f.service.subidaDocumentosCuentaHabilitada=true;
  await assert.rejects(f.service.subirDocumentoCuenta(id, new File(['PDF'], 'prueba.pdf', {type:'application/pdf'}), another), /no está habilitada/);
  assert.equal(reads,2,'La subida bloqueada tampoco reserva metadatos');
  assert.equal(downloads,1); assert.equal(f.writes.length,0);
  row.sha256_verificado='0'.repeat(64);
  await assert.rejects(f.service.obtenerArchivoCuenta(id),/no coincide/);
  row.sha256_verificado=hash;
  f.c.window.supabaseClient.storage.from=()=>({download:async()=>({error:{message:'privado'}})});
  await assert.rejects(f.service.obtenerArchivoCuenta(id),e=>/permisos/.test(e.message)&&!e.message.includes('privado'));
  row.storage_path='otro-bucket/ruta';
  await assert.rejects(f.service.obtenerArchivoCuenta(id),/metadatos/);
  const temporal=fixture({permanent:false,allowed:false});
  await assert.rejects(temporal.service.obtenerArchivoCuenta(id),/autorización vigente/);
  assert.equal(temporal.calls.length,0);
});

test('documentos directos: cambio de identidad no entrega bytes ni crea rutas de escritura', async () => {
  const f=fixture(); let finish;
  f.c.window.supabaseClient.from=()=>({ select(){return this;},eq(){return this;},single:()=>new Promise(r=>{finish=r;}) });
  const pending=f.service.obtenerArchivoCuenta(id);
  f.c.state.currentUser.id='otra-identidad';finish({error:{code:'42501'}});
  await assert.rejects(pending);
  assert(!/functions\.invoke/.test(source('services/trabajadores.service.js')));
  assert.equal((source('services/trabajadores.service.js').match(/\.upload\(/g)||[]).length,1);
  assert(source('services/trabajadores.service.js').includes('upsert: false'));
  assert(!/cuentaDocumentoEnvios|cuentaTrabajadorRecuperarDocumento/.test(source('views/trabajadores.js')));
});

test('ficha documental: Ver/Descargar por documento; contexto antiguo no descarga ni deja URLs', async () => {
  const f = fixture(), content = contenidoFicha(), list = { innerHTML: '' }, status = { textContent: '' };
  let links = 0, created = 0, revoked = 0;
  f.c.document.getElementById = key => key === 'modal-trabajador-ficha' ? {} :
    key === 'trabajador-ficha-contenido' ? content : key === 'cuenta-documentos-lista' ? list :
    key === 'cuenta-documentos-estado' ? status : null;
  f.c.document.createElement = tag => ({ tag, click() { links++; }, remove() {}, setAttribute() {} });
  f.c.document.body = { appendChild() {} };
  f.c.URL = { createObjectURL() { created++; return 'blob:local-mock'; }, revokeObjectURL() { revoked++; } };
  f.c.openModal = () => {}; f.c.closeModal = () => {};
  f.c.accounts = [{ id, nombre: 'Cuenta', estado: true, roles: { nombre: 'Recepción' } }];
  vm.runInContext('trabajadoresCuentasVista = accounts',f.c);
  const metadata = { id: another, cuenta_id: id, nombre_original: '<archivo>.pdf', mime_type_verificado: 'application/pdf',
    tamano_bytes_verificado: 10, estado_reserva: 'disponible', retiro:null };
  f.service.getDocumentosCuenta = async () => [metadata];
  f.c.abrirCuentaTrabajadorFicha(id);
  await f.c.cuentaTrabajadorCargarDocumentos(id,1);
  assert(list.innerHTML.includes('cuentaTrabajadorVerDocumento'));
  assert(list.innerHTML.includes('cuentaTrabajadorDescargarDocumento'));
  assert(!list.innerHTML.includes('trabajadorEliminarDocumento'));
  assert(list.innerHTML.includes('&lt;archivo&gt;.pdf'));
  f.service.obtenerArchivoCuenta = async doc => { assert.equal(doc,another); return new Blob(['PDF'],{ type:'application/pdf' }); };
  await f.c.cuentaTrabajadorDescargarDocumento(another);
  assert.equal(links,1); assert.equal(created,1);
  f.c.cerrarTrabajadorFicha(); assert.equal(revoked,1);
  f.c.abrirCuentaTrabajadorFicha(id);
  await f.c.cuentaTrabajadorCargarDocumentos(id,3);
  let finish;
  f.service.obtenerArchivoCuenta = () => new Promise(resolve => { finish = resolve; });
  const pending = f.c.cuentaTrabajadorDescargarDocumento(another);
  f.c.cerrarTrabajadorFicha(); finish(new Blob(['PDF'],{ type:'application/pdf' })); await pending;
  assert.equal(links,1); assert.equal(created,1,'No crear URL para una ficha cerrada');
});


test('preparación local: UUID/ruta únicos, firma, SHA de cliente y cero operaciones remotas', async () => {
  const f=fixture();
  const file=new File(['%PDF-1.7 prueba'],'prueba.pdf',{type:'application/pdf'});
  const a=await f.service.prepararDocumentoCuenta(id,file);
  const b=await f.service.prepararDocumentoCuenta(id,file);
  assert.notEqual(a.id,b.id);assert.equal(a.storage_path,'cuentas/'+id+'/'+a.id);
  assert.equal(a.bucket_id,'documentos-cuentas');assert.equal(a.archivo,file);
  assert.match(a.sha256_calculado_cliente,/^[0-9a-f]{64}$/);
  assert(!Object.hasOwn(a,'sha256_verificado'));
  assert(Object.isFrozen(a));assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);
  await assert.rejects(f.service.subirDocumentoCuenta(id,file),/no está habilitada/);
  await assert.rejects(f.service.prepararDocumentoCuenta(id,new File(['falso'],'x.pdf',{type:'application/pdf'})),/contenido/);
  await assert.rejects(f.service.prepararDocumentoCuenta(id,new File(['%PDF-'], '../x.pdf',{type:'application/pdf'})),/nombre válido/);
  await assert.rejects(f.service.prepararDocumentoCuenta(id,new File([],'vacio.pdf',{type:'application/pdf'})));
  await assert.rejects(fixture({permanent:false,allowed:false}).service.prepararDocumentoCuenta(id,file),/autorización vigente/);
});

test('selección de cuenta: cerrar o cambiar de archivo descarta preparaciones atrasadas', async () => {
  const f=fixture(),status={textContent:''};
  f.c.document.getElementById=key=>key==='cuenta-documentos-estado'?status:null;
  f.c.ctx={id,version:0,actor:'actor',documentos:[]};
  vm.runInContext('cuentaDocumentalContexto=ctx',f.c);
  let finish;f.service.prepararDocumentoCuenta=()=>new Promise(r=>{finish=r;});
  const pending=f.c.cuentaTrabajadorSubirDocumento({files:[new File(['%PDF-'],'x.pdf',{type:'application/pdf'})]});
  vm.runInContext('cuentaDocumentalLimpiarLecturas()',f.c);
  status.textContent='Ficha cerrada';finish({nombre_original:'x.pdf'});await pending;
  assert.equal(status.textContent,'Ficha cerrada');assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);
});


test('cierre Trabajadores: creación y edición usan solo tabla laboral y campos editables; errores RLS se propagan', async () => {
  const f=fixture(); let createdPayload, denied=false;
  f.c.window.supabaseClient.from=table=>{assert.equal(table,'trabajadores');return {
    insert(rows){createdPayload=rows;return this;},select(){return this;},
    async single(){return denied?{error:{code:'42501'}}:{data:{id,...createdPayload[0]}};}
  };};
  const created=await f.service.createTrabajador({id:another,nombre:'  Personal  ',cargo:'  Cargo  ',estado:'Activo',observaciones:' ',created_at:'no-enviar'});
  assert.equal(created.id,id);
  assert.deepEqual(JSON.parse(JSON.stringify(createdPayload)),[{nombre:'Personal',cargo:'Cargo',estado:'Activo',observaciones:null}]);
  denied=true;await assert.rejects(f.service.createTrabajador({nombre:'Personal',estado:'Activo'}),e=>e.code==='42501');
  const row={id,nombre:'Original',cargo:'Cargo',estado:'Activo',observaciones:null,created_at:'fecha'};
  const edit=fixture({workers:[row]});
  const updated=await edit.service.updateTrabajador(id,{nombre:' Corregido ',cargo:'Otro',estado:'Inactivo',observaciones:' Nota ',id:another,created_at:'no-enviar'});
  assert.equal(updated.id,id);assert.equal(updated.created_at,'fecha');
  assert.deepEqual(edit.writes[0].payload,{nombre:'Corregido',cargo:'Otro',estado:'Inactivo',observaciones:'Nota'});
  assert.deepEqual(edit.writes[0].filters,[['id',id]]);
  assert.deepEqual(edit.writes[0].excluded,['estado','Eliminado']);
});


test('cabeceras documentales compartidas: botón idéntico, selector oculto y sin mezcla de servicios', async () => {
  const f=fixture();let clicks=0;
  const selector={value:'anterior',click(){clicks++;}};
  f.c.document.getElementById=key=>key==='cuenta-documento-archivo'?selector:null;
  f.c.ctx={id,version:0,actor:'actor',documentos:[]};
  vm.runInContext('cuentaDocumentalContexto=ctx',f.c);
  const laboral=f.c.trabajadorBotonSubirDocumentoHTML(true);
  const cuenta=f.c.trabajadorBotonSubirDocumentoHTML(true,true);
  assert.equal(laboral.match(/class="([^"]*)"/)[1],cuenta.match(/class="([^"]*)"/)[1]);
  assert(laboral.includes('onclick="trabajadorSubirDocumento()"'));
  assert.equal(fixture({ permanent: false }).c.trabajadorBotonSubirDocumentoHTML(true), laboral);
  assert.equal(fixture({ permanent: false, allowed: false }).c.trabajadorBotonSubirDocumentoHTML(true), '');
  assert(cuenta.includes('onclick="cuentaTrabajadorSubirDocumento()"'));
  await f.c.cuentaTrabajadorSubirDocumento();
  assert.equal(clicks,1);assert.equal(selector.value,'');
  assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);
  f.c.esAdminOperativoActual=()=>false;
  await f.c.cuentaTrabajadorSubirDocumento();assert.equal(clicks,1);
  assert.equal(f.c.trabajadorBotonSubirDocumentoHTML(true,true),'');
});


test('361B: inserción, upload y confirmación son inalcanzables aun con indicador manipulado y envíos repetidos', async () => {
  const f=fixture();let remote=0;
  const forbidden=()=>{remote++;throw Error('No debe ejecutarse');};
  f.c.window.supabaseClient.from=forbidden;
  f.c.window.supabaseClient.rpc=forbidden;
  f.c.window.supabaseClient.storage={from:forbidden};
  f.c.window.supabaseClient.functions={invoke:forbidden};
  f.service.subidaDocumentosCuentaHabilitada=true;
  const file=new File(['%PDF-1.7 prueba'],'prueba.pdf',{type:'application/pdf'});
  const draft=await f.service.prepararDocumentoCuenta(id,file);
  const results=await Promise.allSettled([
    f.service.subirDocumentoCuenta(draft), f.service.subirDocumentoCuenta(draft),
    f.service.subirDocumentoCuenta({...draft,estado_reserva:'disponible',sha256_verificado:draft.sha256_calculado_cliente})
  ]);
  for(const result of results){assert.equal(result.status,'rejected');assert.equal(result.reason.code,'SUBIDA_DOCUMENTAL_BLOQUEADA');}
  assert.equal(remote,0);assert.equal(f.writes.length,0);
});

test('361B: fallo tras descargar o cambio de versión no entrega un archivo como confirmado', async () => {
  for(const mode of ['version','permiso']) {
    const f=fixture();const blob=new Blob(['PDF'],{type:'application/pdf'});
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
    const row={id,cuenta_id:another,bucket_id:'documentos-cuentas',storage_path:'cuentas/'+another+'/'+id,
      estado_reserva:'disponible',retiro:null,storage_object_id:id,storage_version:'v1',mime_type_verificado:'application/pdf',tamano_bytes_verificado:3,sha256_verificado:hash};
    let reads=0,downloads=0;
    f.c.window.supabaseClient.from=()=>({select(){return this;},eq(){return this;},async single(){
      reads++;return reads===1?{data:{...row}}:mode==='version'?{data:{...row,storage_version:'v2'}}:{error:{code:'42501',message:'INTERNO_NO_MOSTRAR'}};
    }});
    f.c.window.supabaseClient.storage={from:()=>({download:async()=>{downloads++;return {data:blob};}})};
    await assert.rejects(f.service.obtenerArchivoCuenta(id),e=>!e.message.includes('INTERNO_NO_MOSTRAR'));
    assert.equal(reads,2);assert.equal(downloads,1);assert.equal(f.writes.length,0);
  }
});


// Backend institucional simulado; no acredita SQL, Storage ni Edge alojados.
async function escenarioSubidaCuenta(fallo,rolDestinatario='Recepción', options={}) {
 const f=fixture({escritura:true,...options});
 const file=new File(['%PDF-1.7 documento local'],'local.pdf',{type:'application/pdf'});
 const prep=await f.service.prepararDocumentoCuenta(id,file),events=[];let row=null,authCalls=0;
 f.c.window.supabaseClient.auth={getSession:async()=>({data:{session:{access_token:'jwt-real-simulado',user:{id:'actor'}}}}),
  getUser:async()=>{authCalls++;return fallo==='sesion'?{error:{}}:{data:{user:{id:'actor'}}}}};
 f.c.window.supabaseClient.rpc=async name=>{assert.equal(name,'es_administrador_actual');return {data:!['tecnico','recepcion','temporal'].includes(fallo)&&!(fallo==='revocado'&&authCalls>=1)}};
 f.c.window.supabaseClient.from=()=>assert.fail('No debe escribir metadatos ni usar ruta personal');
 f.c.window.supabaseClient.storage={from:()=>assert.fail('No debe subir directamente a Storage')};
 f.c.window.supabaseClient.functions={invoke:async(name,{body,headers})=>{
  assert.equal(name,'usuario-invitaciones/documentos');assert.equal(headers.Authorization,'Bearer jwt-real-simulado');
  assert.equal(body.documento_id,prep.id);events.push(body.accion);
  assert(!Object.hasOwn(body,'actor_id'));assert(!Object.hasOwn(body,'creado_por'));assert(!Object.hasOwn(body,'propiedad_institucional'));
  if(body.accion==='SUBIR_DOCUMENTO_INSTITUCIONAL'){
   assert.equal(body.cuenta_id,id);assert.equal(body.nombre,file.name);assert.equal(atob(body.contenido_base64),'%PDF-1.7 documento local');
   row={id:prep.id,cuenta_id:id,creado_por:'actor',cuenta_nombre_snapshot:'Nombre PostgreSQL',cuenta_rol_snapshot:rolDestinatario,creado_por_nombre_snapshot:'Autor PostgreSQL',
    propiedad_institucional:true,estado_efectivo:'DISPONIBLE',estado_reserva:'disponible',sha256_verificado:prep.sha256_calculado_cliente,
    bucket_id:'documentos-cuentas',storage_path:prep.storage_path,storage_object_id:another,storage_version:'v1'};
   if(fallo==='desconexion')throw Error('NETWORK_PRIVADO');
  }
  if(['destino_inactivo','correo_no_verificado','duplicado','confirmar'].includes(fallo))return {error:{message:'SQL_PRIVADO'}};
  if(fallo==='deshabilitada')return {error:{context:{clone:()=>({json:async()=>({error:'DOCUMENTOS_INSTITUCIONALES_DESHABILITADOS'})})}}};
  if(fallo==='eliminacion_pendiente')return {error:{context:{clone:()=>({json:async()=>({error:'DOCUMENTO_BLOQUEADO_POR_ELIMINACION'})})}}};
  if(fallo==='confirmacion_invalida')return {data:{ok:true,estado:'DOCUMENTO_DISPONIBLE',documento_id:another,habilita_auth:false}};
  return {data:{ok:true,estado:'DOCUMENTO_DISPONIBLE',documento_id:prep.id,habilita_auth:false}};
 }};
 f.service.revalidarDocumentoCuenta=async(uuid,cuenta)=>{assert.equal(uuid,prep.id);assert.equal(cuenta,id);if(!row||fallo==='ausente')throw Error('RLS_PRIVADO');return {...row};};
 return {...f,prep,events,getRow:()=>row};
}
test('375K.5 documental: mensaje comprensible conserva recibo y revisión sin otra subida',async()=>{
 const f=await escenarioSubidaCuenta('eliminacion_pendiente');
 await assert.rejects(f.service.subirDocumentoCuenta(f.prep),e=>{
  assert.match(e.message,/eliminación pendiente/);assert.equal(e.documentoId,f.prep.id);return true;
 });
 assert.deepEqual(Array.from(f.service.getSubidasCuentaPendientes(id)),[f.prep.id]);
 await assert.rejects(f.service.revisarSubidaDocumentoCuenta(id,f.prep.id),e=>{
  assert.match(e.message,/eliminación pendiente/);assert.equal(e.documentoId,f.prep.id);return true;
 });
 assert.deepEqual(f.events,['SUBIR_DOCUMENTO_INSTITUCIONAL','REVISAR_DOCUMENTO_INSTITUCIONAL']);
});
test('241 institucional: nueva subida solo por backend, UUID y snapshots permanentes; sin ruta personal',async()=>{
 for(const rol of ['Administrador','Técnico','Recepción']){
  const f=await escenarioSubidaCuenta(undefined,rol);const r=await f.service.subirDocumentoCuenta(f.prep);
  assert.equal(r.cuenta_rol_snapshot,rol);assert.equal(r.propiedad_institucional,true);assert.equal(r.id,f.prep.id);
  assert.deepEqual(f.events,['SUBIR_DOCUMENTO_INSTITUCIONAL']);await f.service.subirDocumentoCuenta(f.prep);assert.equal(f.events.length,1);
 }
});
test('241 institucional: envío incierto conserva UUID y revisión explícita recupera sin reenviar bytes',async()=>{
 const f=await escenarioSubidaCuenta('desconexion');
 await assert.rejects(f.service.subirDocumentoCuenta(f.prep),e=>e.documentoId===f.prep.id&&!/PRIVADO/.test(e.message));
 await assert.rejects(f.service.subirDocumentoCuenta(f.prep));assert.equal(f.events.length,1);
 const r=await f.service.revisarSubidaDocumentoCuenta(id,f.prep.id);assert.equal(r.id,f.prep.id);
 assert.deepEqual(f.events,['SUBIR_DOCUMENTO_INSTITUCIONAL','REVISAR_DOCUMENTO_INSTITUCIONAL']);
 assert.equal(f.service.getSubidasCuentaPendientes(id).length,0);
});
test('241 institucional: gate, permisos, errores y respuesta incompleta no ejecutan fallback ni éxito falso',async()=>{
 for(const fallo of ['destino_inactivo','correo_no_verificado','duplicado','confirmar','ausente','confirmacion_invalida','deshabilitada','sesion','tecnico','recepcion','revocado']){
  const f=await escenarioSubidaCuenta(fallo);await assert.rejects(f.service.subirDocumentoCuenta(f.prep),e=>!/PRIVADO/.test(e.message));
  const count=f.events.length;if(fallo!=='deshabilitada')await assert.rejects(f.service.subirDocumentoCuenta(f.prep));
  assert.equal(f.events.length,count);if(['sesion','tecnico','recepcion','revocado'].includes(fallo))assert.equal(count,0);
 }
});
test('241 institucional: doble clic emite una sola solicitud; administrador temporal mantiene rol permanente',async()=>{
 const f=await escenarioSubidaCuenta(undefined,'Técnico');f.c.state.currentUser.role='TECNICO';f.c.esAdminPermanenteActual=()=>false;
 const r=await Promise.allSettled([f.service.subirDocumentoCuenta(f.prep),f.service.subirDocumentoCuenta(f.prep)]);
 assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.events.length,1);assert.equal(f.c.state.currentUser.role,'TECNICO');
});

test('362: ficha conecta selector con servicio y refresca listado solo tras confirmación', async () => {
  const f=fixture({escritura:true});const status={textContent:''},list={innerHTML:''};let uploads=0,loads=0;
  f.c.document.getElementById=key=>key==='cuenta-documentos-estado'?status:key==='cuenta-documentos-lista'?list:null;
  f.c.ctx={id,version:0,actor:'actor',documentos:[]};vm.runInContext('cuentaDocumentalContexto=ctx',f.c);
  f.service.subirDocumentoCuenta=async prep=>{assert.equal(prep.cuenta_id,id);uploads++;return {estado_reserva:'disponible'};};
  f.service.getDocumentosCuenta=async cuenta=>{assert.equal(cuenta,id);loads++;return [];};
  await f.c.cuentaTrabajadorSubirDocumento({files:[new File(['%PDF-1.7 prueba'],'x.pdf',{type:'application/pdf'})]});
  assert.equal(uploads,1);assert.equal(loads,1);assert.equal(status.textContent,'Documento guardado.');
  assert.equal(f.c.ctx.enviando,false);
});

test('362: validaciones locales aceptan las cuatro firmas y rechazan formato falsificado', async () => {
  const f=fixture();
  for(const [mime,name,bytes] of [['application/pdf','x.pdf',[37,80,68,70,45]],['image/jpeg','x.jpg',[255,216,255]],['image/png','x.png',[137,80,78,71,13,10,26,10]],['image/webp','x.webp',[82,73,70,70,0,0,0,0,87,69,66,80]]]){
    const p=await f.service.prepararDocumentoCuenta(id,new File([new Uint8Array(bytes)],name,{type:mime}));
    assert.equal(p.mime_type_declarado,mime);
    await assert.rejects(f.service.prepararDocumentoCuenta(id,new File(['falso'],name,{type:mime})));
  }
  assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);
});

test('362: una validación antigua no libera el cupo de un envío más reciente', async () => {
  const f=fixture({escritura:true});const status={textContent:''};
  f.c.document.getElementById=key=>key==='cuenta-documentos-estado'?status:null;
  f.c.ctx={id,version:0,actor:'actor',documentos:[]};vm.runInContext('cuentaDocumentalContexto=ctx',f.c);
  const finish=[];f.service.prepararDocumentoCuenta=()=>new Promise(r=>finish.push(r));
  let sent;f.service.subirDocumentoCuenta=()=>new Promise(r=>{sent=r;});f.service.getDocumentosCuenta=async()=>[];
  const file=new File(['%PDF-1.7'],'x.pdf',{type:'application/pdf'});
  const old=f.c.cuentaTrabajadorSubirDocumento({files:[file]});const current=f.c.cuentaTrabajadorSubirDocumento({files:[file]});
  finish[1]({nombre_original:'nuevo.pdf'});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.c.ctx.enviando,true);
  finish[0]({nombre_original:'viejo.pdf'});await old;assert.equal(f.c.ctx.enviando,true);
  sent({estado_reserva:'disponible'});await current;assert.equal(f.c.ctx.enviando,false);
});


test('363: reseleccionar un archivo con envío incierto conserva el UUID anterior y no crea otro envío', async () => {
  const f=await escenarioSubidaCuenta('desconexion');
  await assert.rejects(f.service.subirDocumentoCuenta(f.prep));
  const previous=f.events.length;
  await assert.rejects(f.service.prepararDocumentoCuenta(id,f.prep.archivo),e=>e.code==='DOCUMENTO_REQUIERE_REVISION'&&e.documentoId===f.prep.id);
  await assert.rejects(f.service.subirDocumentoCuenta({...f.prep,id:another,storage_path:'cuentas/'+id+'/'+another}),e=>e.code==='DOCUMENTO_REQUIERE_REVISION'&&e.documentoId===f.prep.id);
  assert.equal(f.events.length,previous);
  assert.deepEqual(f.events,['SUBIR_DOCUMENTO_INSTITUCIONAL']);
});

test('379: diálogo de estado cancela, confirma una sola vez y libera el bloqueo tras un error', async () => {
  for (const accion of ['cancelar', 'escape', 'cerrar', 'Activo', 'Inactivo', 'Eliminado', 'error', 'errorEliminar']) {
    const f = fixture();
    const cancelar = {}, confirmar = {}, mensaje = {};
    const eventos = {};
    const origen = { isConnected: true, focus() { this.enfocado = true; } };
    const dialog = {
      setAttribute() {},
      addEventListener(nombre, fn) { eventos[nombre] = fn; },
      querySelector(selector) { return selector === 'p' ? mensaje : selector === '[data-cancelar]' ? cancelar : confirmar; },
      showModal() { this.open = true; },
      close() { this.open = false; eventos.close(); },
      remove() { this.retirado = true; }
    };
    Object.assign(f.c.document, {
      activeElement: origen, createElement: () => dialog,
      body: { appendChild() {} }
    });
    f.c.window.confirm = () => assert.fail('No usar confirm nativo para cambios de actividad');
    f.c.window.TrabajadoresService.getTrabajador = async () => ({
      id, nombre: '<Bruno>', estado: accion === 'Activo' ? 'Inactivo' : 'Activo'
    });
    f.c.revalidarPrivilegioParaEscritura = async () => true;
    let escrituras = 0;
    f.c.window.TrabajadoresService.updateTrabajador = async (uuid, datos) => {
      escrituras++;
      assert.equal(uuid, id);
      if (accion === 'error') throw new Error('fallo simulado');
      return { id, estado: datos.estado };
    };
    f.service.eliminarTrabajadorLogicamente=async uuid=>{
      escrituras++;assert.equal(uuid,id);
      if(accion==='errorEliminar')throw Error('fallo simulado');
      return {id,estado:'Eliminado'};
    };
    const operacion = f.c.trabajadorCambiarEstado(id, ['Eliminado','errorEliminar'].includes(accion)?'Eliminado':accion === 'Activo' ? 'Activo' : 'Inactivo');
    await new Promise(setImmediate);
    assert(dialog.open);
    assert(mensaje.textContent.includes('<Bruno>'));
    assert(dialog.innerHTML.includes('&lt;Bruno&gt;'));assert(!dialog.innerHTML.includes('<Bruno>'));
    if(['Eliminado','errorEliminar'].includes(accion)){
      assert(dialog.innerHTML.includes('Eliminar trabajador'));assert(dialog.innerHTML.includes('bg-rose-600'));
      assert.match(mensaje.textContent,/ficha, documentos, trabajos, historial/);
    }
    if (accion === 'cancelar') cancelar.onclick();
    else if (accion === 'cerrar') dialog.close();
    else if (accion === 'escape') {
      let bloqueado=false;eventos.cancel({preventDefault(){bloqueado=true}});assert(bloqueado);
      cancelar.onclick();
    } else {
      confirmar.onclick();
      confirmar.onclick();
      assert(confirmar.disabled && cancelar.disabled);
      let escapeBloqueado = false;
      eventos.cancel({ preventDefault() { escapeBloqueado = true; } });
      assert(escapeBloqueado);
    }
    if(['error','errorEliminar'].includes(accion)){
      await new Promise(setImmediate);
      assert(dialog.open);assert(confirmar.disabled);assert.equal(cancelar.disabled,false);
      assert(mensaje.textContent.includes('revisa el estado'));
      cancelar.onclick();
    }
    await operacion;
    assert.equal(escrituras, ['Activo', 'Inactivo', 'Eliminado', 'error', 'errorEliminar'].includes(accion) ? 1 : 0);
    assert(dialog.retirado && origen.enfocado);
    assert.equal(vm.runInContext('trabajadorEstadoGuardando', f.c), false);
  }
});

test('387: retiro bloqueado, reserva exacta, resultado incierto y recuperación sin repetir Storage', async () => {
  const args = { cuentaId: another, documentoId: id, accion: 'reservar', confirmacion: true };
  await assert.rejects(fixture().service.retirarDocumentoCuenta(args), /deshabilitada/);
  const ruta = 'cuentas/' + another + '/' + id;
  for (const caso of ['normal', 'duplicado', 'vencido', 'reautorizar', 'revisar', 'presente', 'cambio', 'incierto', 'revocado', 'ruta', 'doble', 'sin_confirmacion', 'confirmacion_falsa']) {
    const f = fixture({ retiro: true, permanent: false });
    const client = f.c.window.supabaseClient;
    let envios = 0, confirmaciones = 0, reservas = 0;
    client.auth = { getUser: async () => ({ data: { user: { id: 'actor' } } }) };
    client.rpc = async (nombre, p) => {
      if (nombre === 'es_administrador_actual') return { data: caso !== 'revocado' };
      if (nombre === 'cuentas_documentos_confirmar_retiro_v1') {
        confirmaciones++;
        assert.equal(p.p_operacion_id, id);
        return caso === 'incierto' ? { error: {} } :
          { data: { operacion_id: id, resultado: caso === 'presente' ? 'OBJETO_ORIGINAL_PRESENTE' : 'AUSENCIA_CONFIRMADA',
            eliminacion_definitiva: caso === 'sin_confirmacion' ? undefined : caso !== 'confirmacion_falsa' } };
      }
      assert.equal(nombre, 'cuentas_documentos_reservar_retiro_v1');
      reservas++;
      assert.equal(p.p_reautorizar_operacion_id, caso === 'reautorizar' ? id : null);
      const bloqueos = { duplicado: 'AUTORIZACION_VIGENTE', vencido: 'REQUIERE_REAUTORIZACION_EXPLICITA', cambio: 'IDENTIDAD_STORAGE_DISTINTA' };
      return { data: { operacion_id: id, resultado: bloqueos[caso] || (caso === 'reautorizar' ? 'REAUTORIZADO' : 'RESERVADO'),
        autoriza_envio: !bloqueos[caso], bucket_id: 'documentos-cuentas',
        storage_path: caso === 'ruta' ? 'otra/ruta' : ruta, autorizado_hasta: new Date(Date.now() + 60000).toISOString() } };
    };
    f.service.revalidarDocumentoCuenta=async()=>{
      const pendiente=reservas>0 || ['revisar','reautorizar'].includes(caso);
      return {id,cuenta_id:another,storage_path:ruta,estado_efectivo:pendiente?'RETIRO_PENDIENTE':'DISPONIBLE',retiro_efectivo:pendiente?{id}:null};
    };
    client.storage = { from(bucket) {
      assert.equal(bucket, 'documentos-cuentas');
      return { async remove(paths) {
        envios++;
        assert.deepEqual(Array.from(paths), [ruta]);
        if (caso === 'incierto') throw new Error('desconexión');
        return { data: [] };
      } };
    } };
    const input = ['revisar', 'reautorizar'].includes(caso) ? { ...args, accion: caso, operacionId: id } : args;
    const envio = f.service.retirarDocumentoCuenta(input);
    if (caso === 'doble') await assert.rejects(f.service.retirarDocumentoCuenta(input), /en curso/);
    if (['incierto', 'revocado', 'ruta', 'sin_confirmacion', 'confirmacion_falsa'].includes(caso)) {
      await assert.rejects(envio, error => caso === 'revocado' ? /vigente/.test(error.message) : error.operacionId === id);
    } else {
      const r = await envio;
      assert.equal(r.operacionId, id);
      assert.equal(r.resultado, ({ duplicado: 'AUTORIZACION_VIGENTE', vencido: 'REQUIERE_REAUTORIZACION_EXPLICITA',
        cambio: 'IDENTIDAD_STORAGE_DISTINTA', presente: 'OBJETO_ORIGINAL_PRESENTE' })[caso] || 'AUSENCIA_CONFIRMADA');
    }
    assert.equal(envios, Number(['normal', 'reautorizar', 'presente', 'incierto', 'doble', 'sin_confirmacion', 'confirmacion_falsa'].includes(caso)));
    assert.equal(reservas, Number(!['revocado', 'revisar'].includes(caso)));
    assert.equal(confirmaciones, envios + Number(caso === 'revisar'));
  }
});


test('390: tarjeta real abre diálogo bloqueado, permite Cancelar y bloquea Escape', async () => {
  const f = fixture();
  const botones = [{}, {}], mensaje = {}, eventos = {};
  const dialog = {
    setAttribute() {},
    addEventListener(nombre, fn) { eventos[nombre] = fn; },
    querySelector(selector) { return selector === 'p' ? mensaje : botones[Number(selector === '[data-confirmar]')]; },
    showModal() { this.open = true; },
    close() { this.open = false; eventos.close(); },
    remove() {}
  };
  Object.assign(f.c.document, {
    getElementById: () => null, createElement: () => dialog, body: { appendChild() {} }
  });
  f.c.doc = { id, nombre_original: '<documento>.pdf' };
  vm.runInContext("cuentaDocumentalContexto = { id: '" + another + "', actor: 'actor', version: 0, documentos: [doc] }", f.c);
  f.service.retirarDocumentoCuenta = () => assert.fail('Cancelar no debe solicitar retiro');
  f.service.revalidarDocumentoCuenta=async()=>({id,nombre_original:'<documento>.pdf',estado_efectivo:'DISPONIBLE',retiro_efectivo:null});
  assert(f.c.trabajadorDocumentoFilaHTML(f.c.doc, true, true).includes('cuentaTrabajadorRetirarDocumento'));

  for (const escape of [false, true]) {
    const operacion = f.c.cuentaTrabajadorRetirarDocumento(id);
    await new Promise(setImmediate);
    assert(dialog.open);
    assert(mensaje.textContent.includes('<documento>.pdf'));
    assert.match(mensaje.textContent, /todavía no está habilitada/);
    assert.equal(botones[1].disabled, true);
    botones[1].onclick();
    assert.equal(dialog.open, true);
    if (escape) {
      let bloqueado=false;eventos.cancel({preventDefault(){bloqueado=true}});assert(bloqueado);
      botones[0].onclick();
    } else botones[0].onclick();
    await operacion;
  }
});

test('399: la modal laboral cancela sin borrar y confirma una sola vez', async () => {
  for (const accion of ['cancelar', 'escape', 'cerrar', 'confirmar']) {
    const f = fixture();
    const botones = { '[data-cancelar]': {}, '[data-confirmar]': {}, '[data-cerrar]': {}, p: {} };
    const eventos = {};
    const origen = { dataset: { nombreDocumento: '<archivo>.pdf' }, isConnected: true, focus() { this.enfocado = true; } };
    const dialog = {
      setAttribute() {},
      addEventListener(nombre, fn) { eventos[nombre] = fn; },
      querySelector(selector) { return botones[selector]; },
      showModal() { this.open = true; },
      close() { this.open = false; eventos.close(); },
      remove() {}
    };
    Object.assign(f.c.document, { getElementById: () => null, createElement: () => dialog, body: { appendChild() {} } });
    let eliminaciones = 0;
    f.c.window.confirm = () => assert.fail('Confirmación nativa');
    f.c.window.TrabajadoresDocumentosService = { async eliminarDocumento(uuid) {
      assert.equal(uuid, id);
      eliminaciones++;
    } };
    const tarjeta = f.c.trabajadorDocumentoFilaHTML({ id, nombre_original: '<archivo>.pdf' });
    assert.match(tarjeta, /data-nombre-documento="&lt;archivo&gt;\.pdf"/);
    const operacion = f.c.trabajadorEliminarDocumento(id, origen);
    assert(dialog.open);
    assert.match(botones.p.textContent, /<archivo>\.pdf/);
    if (accion === 'escape') {
      let bloqueado=false;eventos.cancel({preventDefault(){bloqueado=true}});assert(bloqueado);
      botones['[data-cancelar]'].onclick();
    } else {
      botones['[data-' + accion + ']'].onclick();
      if (accion === 'confirmar') {
        botones['[data-confirmar]'].onclick();
        assert(botones['[data-cerrar]'].disabled);
        assert.equal(botones['[data-confirmar]'].textContent, 'Procesando…');
      }
    }
    await operacion;
    assert.equal(eliminaciones, accion === 'confirmar' ? 1 : 0);
    assert(origen.enfocado);
  }
});


test('20A: contrato de las tres acciones, sesión administrativa y lectura mínima', async () => {
  const f = fixture({ permanent: false });
  const operaciones = [];
  const fila = { usuario_id: id, nombre: 'Alias', rol: 'Técnico', cuenta_activa: true,
    trabajador_id: another, trabajador_nombre: 'Nombre laboral', trabajador_estado: 'Activo' };
  f.c.window.supabaseClient.rpc = async (rpc, ...args) => {
    if (rpc === 'usuarios_trabajadores_listar_cuentas_v1') {
      assert.equal(args.length, 0);
      return { data: [fila] };
    }
    assert.equal(rpc, 'usuarios_trabajadores_gestionar_v1');
    operaciones.push(structuredClone(args[0]));
    return { data: [{ resultado: 'REGISTRADA' }] };
  };
  const [cuenta] = await f.service.listarVinculosCuentas();
  assert.equal(cuenta.id, id);
  assert.equal(cuenta.trabajador_id, another);
  for (const accion of ['VINCULAR', 'DESVINCULAR', 'CREAR_Y_VINCULAR']) {
    assert.equal(await f.service.gestionarVinculoCuenta({ accion, usuarioId: id, trabajadorId: another,
      motivo: '  Motivo explícito  ', nombre: '  Nombre real  ', cargo: ' ', observaciones: 'Observación' }), 'REGISTRADA');
    const crear = accion === 'CREAR_Y_VINCULAR';
    const { p_solicitud_id, ...payload } = operaciones.at(-1);
    assert.match(p_solicitud_id, /^[a-f0-9-]{36}$/);
    assert.deepEqual(payload, { p_accion: accion, p_usuario_id: id, p_trabajador_id: crear ? null : another,
      p_motivo: 'Motivo explícito', p_nombre_laboral: crear ? 'Nombre real' : null,
      p_cargo: null, p_observaciones: crear ? 'Observación' : null });
  }
  assert.equal(new Set(operaciones.map(o => o.p_solicitud_id)).size, 3);
  const sinPermiso = fixture({ allowed: false });
  await assert.rejects(sinPermiso.service.listarVinculosCuentas(), /NO_AUTORIZADO/);
  await assert.rejects(sinPermiso.service.gestionarVinculoCuenta({}), /NO_AUTORIZADO/);
  assert.equal(sinPermiso.calls.length, 0);
});

test('20A: concurrencia, reintento incierto tras recarga y conflictos', async () => {
  const almacen = new Map(), solicitudes = [];
  const datos = { accion: 'VINCULAR', usuarioId: id, trabajadorId: another, motivo: 'Motivo de la asociación' };
  let terminar;
  const f = fixture();
  function simular(f, responder) {
    f.c.TextEncoder = TextEncoder;
    f.c.sessionStorage = { getItem: k => almacen.get(k), setItem: (k,v) => almacen.set(k,v), removeItem: k => almacen.delete(k) };
    f.c.window.supabaseClient.rpc = (_, p) => { solicitudes.push(p.p_solicitud_id); return responder(); };
  }
  simular(f, () => new Promise(resolve => { terminar = resolve; }));
  const intento = f.service.gestionarVinculoCuenta(datos);
  await assert.rejects(f.service.gestionarVinculoCuenta(datos), /EN_CURSO/);
  while (!terminar) await new Promise(setImmediate);
  terminar({ error: { message: 'Failed to fetch' } });
  await assert.rejects(intento, { message: 'Failed to fetch' });
  assert.equal(almacen.size, 1);
  assert(![...almacen.keys()].some(k => k.includes(datos.motivo)));
  const recarga = fixture();
  simular(recarga, async () => ({ data: { estado: 'YA_REGISTRADA' } }));
  assert.equal(await recarga.service.gestionarVinculoCuenta(datos), 'YA_REGISTRADA');
  assert.equal(solicitudes[1], solicitudes[0]);
  assert.equal(almacen.size, 0);
  simular(recarga, async () => ({ error: { code: '23505', message: 'TRABAJADOR_YA_VINCULADO' } }));
  await assert.rejects(recarga.service.gestionarVinculoCuenta({ ...datos, motivo: 'Una intención diferente' }), { code: '23505', message: 'TRABAJADOR_YA_VINCULADO' });
  assert.notEqual(solicitudes[2], solicitudes[1]);
  assert.equal(almacen.size, 0);
  assert.match(recarga.c.trabajadoresMensajeVinculo({ code: '42501' }), /autorización/);
  assert.match(recarga.c.trabajadoresMensajeVinculo({ message: 'TRABAJADOR_INACTIVO' }), /activa/);
  assert.match(recarga.c.trabajadoresMensajeVinculo({ message: 'SOLICITUD_DUPLICADA' }), /otros datos/);
  assert.match(recarga.c.trabajadoresMensajeVinculo({ message: 'ELIMINACION_PENDIENTE' }), /eliminación pendiente/);
});

test('20A: la relectura actualiza la asociación y la baja lógica protege la ficha vinculada', async () => {
  const laboral = { id: another, nombre: 'Nombre laboral', estado: 'Activo' };
  const demo = { id: '33333333-3333-4333-8333-333333333333', nombre: 'Trabajador de ejemplo', estado: 'Activo' };
  const f = fixture({ workers: [laboral, demo] });
  const pendientes = ['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555']
    .map(usuario_id => ({ usuario_id, nombre: 'andres', rol: null, cuenta_activa: true, trabajador_id: null }));
  let vinculado = false;
  f.c.window.supabaseClient.rpc = async rpc => {
    assert.equal(rpc, 'usuarios_trabajadores_listar_cuentas_v1');
    return { data: [{ usuario_id: id, nombre: 'Alias', rol: 'Técnico', cuenta_activa: true,
      trabajador_id: vinculado ? another : null, trabajador_nombre: vinculado ? laboral.nombre : null,
      trabajador_estado: vinculado ? 'Activo' : null }, ...pendientes] };
  };
  await f.c.cargarTrabajadoresEnVista(true);
  assert.doesNotMatch(f.container.innerHTML, /Ficha vinculada:/);
  vinculado = true;
  await f.c.cargarTrabajadoresEnVista(true, true);
  assert.doesNotMatch(f.container.innerHTML, /Ficha vinculada:/);
  assert.equal((f.container.innerHTML.match(/Ver ficha/g) || []).length, 1);
  const [cuentas, fichas] = f.container.innerHTML.split('Personal registrado sin cuenta');
  assert.equal((cuentas.match(/>andres<\/h4>/g) || []).length, 0);
  assert.doesNotMatch(cuentas, /Cuentas sin ficha vinculada/);
  assert.doesNotMatch(fichas, /Nombre laboral|andres/);
  assert.match(fichas, /Trabajador de ejemplo/);
  assert.match(fichas, new RegExp("abrirTrabajadorFicha\\('" + demo.id));
  assert.doesNotMatch(f.container.innerHTML, /Desvincular|Vincular ficha existente|Crear y vincular ficha/);
  const contenido = contenidoFicha();
  const panelLaboral = contenido.querySelector('[data-trabajador-trabajos]');
  f.c.document.getElementById = key => key === 'trabajador-ficha-contenido' ? contenido : null;
  f.c.asegurarModalTrabajadorFicha = () => {};
  f.c.openModal = () => {};
  f.c.cuentaTrabajadorCargarDocumentos = () => {};
  const documentosLaborales = [];
  f.c.trabajadoresCargarDocumentos = () => documentosLaborales.push(vm.runInContext('trabajadoresFichaActual.id', f.c));
  f.c.window.GestionTareas = { puede: () => true };
  const fichasAbiertas = [];
  f.c.window.GestionTareas = { puede: () => true, contexto: () => ({}), comprobar() {}, historialLaboral: async uuid => { fichasAbiertas.push([panelLaboral, uuid, true]); return {items:[],hay_mas:false}; } };
  f.c.abrirCuentaTrabajadorFicha(id);
  assert.doesNotMatch(contenido.innerHTML, />Ficha laboral</);
  assert.doesNotMatch(contenido.innerHTML, /Documentos laborales/);
  assert.equal((contenido.innerHTML.match(/>Documentos</g) || []).length, 1);
  assert.doesNotMatch(contenido.innerHTML, /abrirTrabajadorFormulario|trabajadorCambiarEstado/);
  assert.deepEqual(fichasAbiertas, []);
  f.c.trabajadorFichaCambiarPestana('trabajos');
  assert.deepEqual(fichasAbiertas, [[panelLaboral, another, true]]);
  assert.deepEqual(documentosLaborales, [another]);
  f.c.document.getElementById = key => key === 'trabajadores-content' ? f.container : null;
  await f.c.trabajadorCambiarEstado(another, 'Eliminado');
  assert.equal(f.writes.length, 0);
  assert.match(f.messages.at(-1), /Primero desvincula/);
  vinculado = false;
  await f.c.cargarTrabajadoresEnVista(true, true);
  assert.doesNotMatch(f.container.innerHTML, /Vincular ficha existente|Crear y vincular ficha|Ver ficha laboral/);
  assert.doesNotMatch(f.container.innerHTML, /Ficha vinculada:/);
  assert.match(f.container.innerHTML, /Nombre laboral/);
});

test('20A: Mantención v2 utiliza el UUID laboral y no el UUID de la cuenta', async () => {
  const f = fixture();
  vm.runInContext(source('services/mantenciones.service.js'), f.c);
  f.c.window.supabaseClient.rpc = async (rpc, datos) => {
    assert.equal(rpc, 'mantencion_registrar_mantencion_v2');
    assert.equal(datos.p_trabajador_id, another);
    assert.notEqual(datos.p_trabajador_id, id);
    assert(!Object.hasOwn(datos, 'p_responsable_texto'));
    return { data: [{ id: 'mantencion-existente' }] };
  };
  await f.c.window.MantencionesService.registrarMantencionOperativa({
    elementoId: id, fechaRealizacion: '2026-11-09', trabajadorId: another, detalleTrabajo: 'Trabajo efectuado'
  });
});

test('cuenta administrativa sin ficha conserva excepción y contrato documental sin tarjeta laboral', async () => {
  const f = fixture();
  f.c.window.supabaseClient.rpc = async () => ({ data: [
    { usuario_id: id, nombre: 'Administrador de prueba', rol: 'Administrador', cuenta_activa: true,
      trabajador_id: null, trabajador_nombre: null, trabajador_estado: null }
  ] });
  await f.c.cargarTrabajadoresEnVista(true);
  assert.doesNotMatch(f.container.innerHTML, /Ver ficha/);
  assert.match(f.container.innerHTML, /cuentas administrativas sin ficha laboral/);
  assert.doesNotMatch(f.container.innerHTML, /role="alert"/);
  assert.doesNotMatch(f.container.innerHTML, /Ver ficha laboral/);
  f.c.cuentaPrueba = { nombre: 'Administrador de prueba', roles: { nombre: 'Administrador' }, estado: true };
  const html = vm.runInContext('cuentaTrabajadorFichaHTML(cuentaPrueba)', f.c);
  assert.match(html, /cuenta-documentos-lista/);
  assert.doesNotMatch(html, /type="file"|cuenta-documento-archivo/);
});

// Regresión de invitación provisional: ninguna ficha existente desaparece por nombre NULL.
test('vínculos: cuenta invitada sin nombre/rol/ficha conserva ambos listados completos',async()=>{
  const linked={usuario_id:id,nombre:'Cuenta vinculada',rol:'Administrador',cuenta_activa:true,
    trabajador_id:another,trabajador_nombre:'Ficha vinculada',trabajador_estado:'Activo'};
  const provisional={usuario_id:another,nombre:null,rol:null,cuenta_activa:true,trabajador_id:null};
  const f=fixture({workers:[{id:another,nombre:'Ficha vinculada',estado:'Activo'},
    {id:'33333333-3333-4333-8333-333333333333',nombre:'Ficha sin cuenta',estado:'Activo'}]});
  let calls=0;f.c.window.supabaseClient.rpc=async name=>{assert.equal(name,'usuarios_trabajadores_listar_cuentas_v1');calls++;return {data:[linked,provisional]};};
  const cuentas=await f.service.listarVinculosCuentas();assert.equal(cuentas.length,2);assert.equal(cuentas[1].nombre,null);
  await f.c.cargarTrabajadoresEnVista(true,true);
  const html=f.c.document.getElementById('trabajadores-content').innerHTML;
  assert.match(html,/Cuenta vinculada/);assert.match(html,/Ficha sin cuenta/);
  assert.doesNotMatch(html,/No se pudieron consultar las cuentas|No se pudieron verificar los vínculos/);
  assert.equal(calls,2);assert.equal(f.writes.length,0);
});
test('vínculos: nombre NULL solo para provisional sin rol ni ficha, nunca filtrar filas inválidas',async()=>{
  const base={usuario_id:id,nombre:null,rol:null,cuenta_activa:true,trabajador_id:null};
  for(const invalid of [{...base,rol:'Administrador'},{...base,trabajador_id:another},{...base,nombre:42},
    {...base,nombre:undefined},{...base,cuenta_activa:'true'},{...base,usuario_id:null}]){
    const f=fixture();f.c.window.supabaseClient.rpc=async()=>({data:[{...base,nombre:'Válida'},invalid]});
    await assert.rejects(f.service.listarVinculosCuentas(),/VINCULO_LECTURA_INVALIDA/);
    await f.c.cargarTrabajadoresEnVista(true,true);
    const html=f.c.document.getElementById('trabajadores-content').innerHTML;
    assert.match(html,/No se pudieron consultar las cuentas/);assert.match(html,/No se pudieron verificar los vínculos/);
  }
});
test('vínculos: errores RPC, falta de autorización y cambio de sesión siguen rechazando',async()=>{
  const f=fixture();f.c.window.supabaseClient.rpc=async()=>({error:{code:'42501'}});
  await assert.rejects(f.service.listarVinculosCuentas(),e=>e.code==='42501');
  f.c.window.supabaseClient.rpc=async()=>{f.c.state.currentUser.id='otro';return {data:[]};};
  await assert.rejects(f.service.listarVinculosCuentas(),/VINCULO_NO_AUTORIZADO/);
  const denied=fixture({allowed:false});await assert.rejects(denied.service.listarVinculosCuentas(),/VINCULO_NO_AUTORIZADO/);
  assert.equal(denied.calls.length,0);
});

// INV-16: pendientes fuera de Trabajadores y advertencias sin automatizar vínculos.
test('INV-16: provisional y pendiente no generan tarjetas ni alertas laborales',async()=>{
  const f=fixture({workers:[{id:another,nombre:'Laboral sin cuenta',estado:'Activo'}]});
  const rows=[{usuario_id:id,nombre:null,rol:null,cuenta_activa:true,trabajador_id:null},
    {usuario_id:another,nombre:'Pendiente con nombre',rol:null,cuenta_activa:true,trabajador_id:null}];
  f.c.window.supabaseClient.rpc=async()=>({data:rows});await f.c.cargarTrabajadoresEnVista(true,true);
  const html=f.container.innerHTML;
  assert.match(html,/Personal con cuenta/);assert.match(html,/Personal registrado sin cuenta/);assert.match(html,/Laboral sin cuenta/);
  assert.doesNotMatch(html,/Cuentas sin ficha vinculada|Pendiente con nombre|data-cuenta-activa|role="alert"/);
  assert.equal((await f.service.listarVinculosCuentas()).length,2,'Conservar cuentas en lectura, no filtrar en backend');
  assert.equal(f.writes.length,0);
});
test('INV-16: inconsistencias aprobadas alertan y se resuelven visualmente al recargar vínculo real',async()=>{
  const worker={id:another,nombre:'Ficha existente',estado:'Activo'},f=fixture({workers:[worker]});
  let target=null;
  f.c.window.supabaseClient.rpc=async()=>({data:[{usuario_id:id,nombre:'Aprobada',rol:'Técnico',cuenta_activa:true,
    trabajador_id:target,trabajador_nombre:target?worker.nombre:null,trabajador_estado:target?worker.estado:null}]});
  await f.c.cargarTrabajadoresEnVista(true,true);assert.match(f.container.innerHTML,/role="alert"/);
  assert.doesNotMatch(f.container.innerHTML,/Cuentas sin ficha vinculada|>Aprobada<|data-cuenta-activa/);
  target='33333333-3333-4333-8333-333333333333';await f.c.cargarTrabajadoresEnVista(true,true);
  assert.match(f.container.innerHTML,/vínculos que requieren revisión/);
  target=another;await f.c.cargarTrabajadoresEnVista(true,true);
  assert.doesNotMatch(f.container.innerHTML,/role="alert"/);assert.match(f.container.innerHTML,/>Aprobada</);
  const bottom=f.container.innerHTML.split('Personal registrado sin cuenta')[1];assert.doesNotMatch(bottom,/Ficha existente/);
  assert.equal(f.writes.length,0);
});
test('INV-16: vínculos duplicados se advierten, administración temporal no cambia el rol permanente',()=>{
  const f=fixture({permanent:false});f.c.accounts=[{id,nombre:'A',roles:{nombre:'Técnico'},estado:true,trabajador_id:another},
    {id:another,nombre:'B',roles:{nombre:'Recepción'},estado:true,trabajador_id:another}];
  vm.runInContext('trabajadoresCuentasVista=accounts',f.c);
  assert.match(f.c.trabajadoresAvisoVinculosHTML([{id:another}]),/role="alert"/);
  f.c.esAdminOperativoActual=()=>false;assert.equal(f.c.trabajadoresAvisoVinculosHTML([{id:another}]),'');
  assert.equal(f.c.accounts[0].roles.nombre,'Técnico');assert.equal(f.writes.length,0);
});

// INV-21: mismo contrato de aprobación auditada en raíz y publicacion.
test('INV-21: ambas rutas vinculan ficha elegida por UUID antes de aprobar, sin duplicarla',async()=>{
  for(const root of [false,true]){
    const w={id:'33333333-3333-4333-8333-333333333333',nombre:'Persona de prueba',estado:'Activo'};
    const f=aprobacionFixture({root,trabajadores:[w]});
    const result=await f.aprobar(async plan=>{assert.equal(f.eventos.length,0);assert.equal(plan.elegibles[0].id,w.id);return {accion:'VINCULAR',trabajadorId:w.id};});
    assert.deepEqual(f.eventos.map(e=>e[0]),['vincular','aprobar']);assert.equal(result.trabajador_id,w.id);assert.equal(f.trabajadores.length,1);
    const cancel=aprobacionFixture({root,trabajadores:[w]});assert.equal(await cancel.aprobar(async()=>null),null);assert.equal(cancel.eventos.length,0);
    const other=aprobacionFixture({root,trabajadores:[w]});await assert.rejects(other.aprobar(async()=>({accion:'VINCULAR',trabajadorId:id})));assert.equal(other.eventos.length,0);
  }
});
test('INV-21: ambas rutas conservan UUID en incertidumbre y recuperan aprobación parcial',async()=>{
  for(const root of [false,true]){
    const f=aprobacionFixture({root,falloVinculo:true});await assert.rejects(f.aprobar(async()=>({accion:'CREAR_Y_VINCULAR'})),/Vinculación no confirmada/);
    assert.equal(f.eventos.filter(e=>e[0]==='aprobar').length,0);await f.aprobar(async plan=>{assert.equal(plan.recuperacion,true);return true;});
    const requests=f.eventos.filter(e=>e[0]==='vincular');assert.equal(requests.length,2);assert.deepEqual(requests[0][1],requests[1][1]);assert.equal(f.trabajadores.length,1);
    const partial=aprobacionFixture({root,falloAprobacion:'rechazo'});await assert.rejects(partial.aprobar(async()=>({accion:'CREAR_Y_VINCULAR'})),/ficha está vinculada/);
    const laboral=partial.usuario.trabajador_id;await partial.aprobar(async()=>{throw Error('No debe volver a crear/vincular');});
    assert.equal(partial.usuario.trabajador_id,laboral);assert.equal(partial.trabajadores.length,1);assert.equal(partial.eventos.filter(e=>e[0]==='vincular').length,1);
  }
});
test('INV-21: permanente y correo verificado obligatorios; homónimos no autorizan creación',async()=>{
  for(const root of [false,true]){
    for(const flags of [{permanente:false},{verificado:false}]){const f=aprobacionFixture({root,...flags});await assert.rejects(f.aprobar(async()=>({accion:'CREAR_Y_VINCULAR'})));assert.equal(f.eventos.length,0);}
    const w={id:'33333333-3333-4333-8333-333333333333',nombre:'Persona de prueba',estado:'Activo'};
    const f=aprobacionFixture({root,trabajadores:[w,{...w,id:'55555555-5555-4555-8555-555555555555'}]});
    await assert.rejects(f.aprobar(async()=>({accion:'CREAR_Y_VINCULAR'})));assert.equal(f.eventos.length,0);
  }
});
test('INV-21: UI real de confirmación exige UUID elegible; conserva Cancelar y rechaza sin acceso',async()=>{
  for(const root of [false,true]){
    const file=root?'../js/views/admin.js':'../publicacion/js/views/admin.js';const source=readFileSync(new URL(file,import.meta.url),'utf8');
    const start=source.indexOf('function adminConfirmarFichaAprobacion'),end=source.indexOf('function adminMensajeErrorAprobacion',start);
    const nodes=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{value:'',textContent:'',disabled:false,focus(){}});return nodes.get(key);};
    let opens=0,allowed=true,dialog;
    const c={state:{currentUser:{id:'actor'}},adminAccesoVigente:()=>allowed,adminEscapeHTML:x=>String(x),
      document:{body:{appendChild(){}},createElement(){dialog={setAttribute(){},addEventListener(){},showModal(){opens++;},close(){},remove(){},querySelector:node};return dialog;}}};
    vm.createContext(c);vm.runInContext(source.slice(start,end),c);
    const plan={usuario:{nombre:'Persona de prueba'},coincidencias:[{id:another,nombre:'Persona de prueba',estado:'Activo'}],elegibles:[{id:another}]};
    const answer=c.adminConfirmarFichaAprobacion(plan);assert.equal(opens,1);assert.match(dialog.innerHTML,/¿Es esta persona/);assert.ok(dialog.innerHTML.includes(another));
    node('[data-ficha]').value=id;node('[data-confirmar]').onclick();assert.match(node('[data-mensaje]').textContent,/Selecciona la ficha correcta/);
    node('[data-ficha]').value=another;node('[data-confirmar]').onclick();const choice=await answer;assert.equal(choice.accion,'VINCULAR');assert.equal(choice.trabajadorId,another);
    const cancel=c.adminConfirmarFichaAprobacion(plan);node('[data-cancelar]').onclick();assert.equal(await cancel,null);
    allowed=false;assert.equal(await c.adminConfirmarFichaAprobacion(plan),null);assert.equal(opens,2);
  }
});
test('INV-21: fragmentos de aprobación equivalentes, proyecciones completas y sin excepción de eliminación en raíz',()=>{
  const a=readFileSync(new URL('../js/views/admin.js',import.meta.url),'utf8'),b=source('views/admin.js');
  for(const [start,end] of [['async function adminRevisarAprobacionLaboral','function adminMensajeErrorAprobacion'],['async function adminConfirmarAprobacion(e)','function toggleUserStatus(id)']])
    assert.equal(a.slice(a.indexOf(start),a.indexOf(end,a.indexOf(start))),b.slice(b.indexOf(start),b.indexOf(end,b.indexOf(start))));
  assert.doesNotMatch(a,/usuarioEsExcepcionalEliminacion|adminObjetivoEliminacionPermitido|43fbf4dc|d642838d/);
  const users=readFileSync(new URL('../js/services/usuarios.service.js',import.meta.url),'utf8');
  assert.equal(users.split(".select('id, nombre, email, estado, rol_id, trabajador_id, roles(nombre)')").length-1,2);
  // El código de error puede figurar en la lista blanca del diagnóstico; no es autorización excepcional.
  assert.doesNotMatch(users,/usuarioEsExcepcionalEliminacion|43fbf4dc|d642838d/);
});

// TRAB-01: ejecutar la vista real de cada carpeta, no solo el servicio raíz.
for (const root of [true, false]) {
  test('TRAB-01: separación UUID conserva roles, cuentas deshabilitadas y homónimos — '+(root?'raíz':'espejo'), () => {
    const f=fixture({root,rootView:root});
    const workers=[{id:another,nombre:'Mismo nombre',estado:'Activo'},{id:'33333333-3333-4333-8333-333333333333',nombre:'Mismo nombre',estado:'Activo'}];
    for(const rol of ['Administrador','Técnico','Recepción'])for(const estado of [true,false]){
      f.c.accounts=[{id,nombre:'Mismo nombre',estado,roles:{nombre:rol},trabajador_id:another,esAdminTemporal:true}];
      vm.runInContext('trabajadoresCuentasVista=accounts;trabajadoresCuentasError=false',f.c);
      const html=f.c.getTrabajadoresHTML(workers),lower=html.split('<section aria-labelledby="trabajadores-personal-titulo"')[1];
      assert.match(html,/abrirCuentaTrabajadorFicha/);assert(html.includes(id));
      assert(!lower.includes("abrirTrabajadorFicha('"+another+"')"));
      assert(lower.includes("abrirTrabajadorFicha('"+workers[1].id+"')"));
      assert.match(lower,/Personal registrado sin cuenta/);
      assert.deepEqual(workers.map(w=>w.id),[another,workers[1].id]);
    }
  });
  test('TRAB-01: recarga fuerza vínculos actuales al vincular, desvincular o crear ficha — '+(root?'raíz':'espejo'), async()=>{
    const workers=[{id:another,nombre:'Ficha existente',estado:'Activo'}],f=fixture({root,rootView:root,workers});
    let accounts=[],reads=0;f.service.getTrabajadores=async()=>workers;
    f.service.listarVinculosCuentas=async()=>{reads++;return accounts;};
    const lower=()=>f.container.innerHTML.split('<section aria-labelledby="trabajadores-personal-titulo"')[1];
    await f.c.cargarTrabajadoresEnVista(true);assert(lower().includes("abrirTrabajadorFicha('"+another+"')"));
    accounts=[{id,nombre:'Cuenta',estado:true,roles:{nombre:'Técnico'},trabajador_id:another}];
    await f.c.cargarTrabajadoresEnVista(true);assert(!lower().includes("abrirTrabajadorFicha('"+another+"')"));assert.match(lower(),/No hay trabajadores registrados sin cuenta/);
    accounts=[{...accounts[0],estado:false,roles:{nombre:'Recepción'}}];
    await f.c.cargarTrabajadoresEnVista(true);assert(!lower().includes("abrirTrabajadorFicha('"+another+"')"));
    accounts=[{...accounts[0],trabajador_id:null}];
    await f.c.cargarTrabajadoresEnVista(true);assert(lower().includes("abrirTrabajadorFicha('"+another+"')"));
    const nuevo={id:'33333333-3333-4333-8333-333333333333',nombre:'Nueva ficha',estado:'Activo'};workers.push(nuevo);
    accounts=[{...accounts[0],trabajador_id:nuevo.id}];
    await f.c.cargarTrabajadoresEnVista(true);assert(!lower().includes("abrirTrabajadorFicha('"+nuevo.id+"')"));assert(lower().includes("abrirTrabajadorFicha('"+another+"')"));
    assert.equal(reads,5);assert.equal(workers.length,2);assert.equal(f.writes.length,0);
  });
  test('TRAB-01: fallo de vínculos no presenta fichas como libres; recupera al reconsultar — '+(root?'raíz':'espejo'),async()=>{
    const f=fixture({root,rootView:root});f.service.getTrabajadores=async()=>[{id:another,nombre:'Ficha',estado:'Activo'}];
    f.service.listarVinculosCuentas=async()=>{throw Error('lectura rechazada');};
    await f.c.cargarTrabajadoresEnVista(true);assert.match(f.container.innerHTML,/No se pudieron verificar los vínculos laborales/);assert(!f.container.innerHTML.includes("abrirTrabajadorFicha('"+another+"')"));
    f.service.listarVinculosCuentas=async()=>[];await f.c.cargarTrabajadoresEnVista(true);assert(f.container.innerHTML.includes("abrirTrabajadorFicha('"+another+"')"));assert.equal(f.writes.length,0);
  });
}

test('247: raíz y espejo idénticos, compuerta local activa y contrato previo de descarga intacto',()=>{
 const root=readFileSync(new URL('../js/services/trabajadores.service.js',import.meta.url),'utf8');assert.equal(root,source('services/trabajadores.service.js'));
 assert.match(root,/const TRABAJADORES_DOCUMENTOS_CUENTAS_ESCRITURA_HABILITADA = true/);
 const upload=root.slice(root.indexOf('  async subirDocumentoCuenta(p)'),root.indexOf('  // Metadatos y bytes bajo'));
 assert.doesNotMatch(upload,/bucket\.upload|\.insert\(|\.update\(/);assert.match(root,/functions.invoke\('usuario-invitaciones\/documentos'/);
 assert.match(root,/rpc\('es_administrador_actual'\)/);assert.match(root,/row\.creado_por!==actor/);
 assert.match(root,/hash !== d\.sha256_verificado/);assert.doesNotMatch(root,/USUARIO_ELIMINACION_EXCEPCIONAL/);
});

test('FIX-03: ambas fichas ofrecen pestañas, leyenda y un historial inicialmente plegado',()=>{
  const f=fixture();
  const html=f.c.trabajadorFichaTrabajosHTML();
  assert.match(html,/aria-label="Leyenda de estados"/);
  for(const tone of ['pendiente','en-proceso','completada','vencida'])assert(html.includes('gestion-trabajo-'+tone));
  assert.match(html,/<details[^>]*data-trabajador-historial/);
  assert.doesNotMatch(html,/<details[^>]*\bopen(?:[\s=>])/);
  assert.match(html,/role="tabpanel"[^>]*hidden/);
  assert.equal(f.calls.length,0);
  assert.match(f.c.trabajadorFichaPestanasHTML(),/role="tablist"/);
  const service=source('services/gestionTareas.service.js');
  assert.match(service,/p_trabajador_id: trabajador, p_limite: 10/);
});
test('FIX-03: clasificación, historial y estilos coinciden sin migrar permisos ni documentos',()=>{
  assert.equal(readFileSync(new URL('../js/views/trabajadores.js',import.meta.url),'utf8'),readFileSync(new URL('../publicacion/js/views/trabajadores.js',import.meta.url),'utf8'));
  const view=source('views/trabajadores.js');
  assert.doesNotMatch(view,/usuarioEsExcepcionalEliminacion|USUARIO_ELIMINACION_EXCEPCIONAL/);
  assert.match(view,/if \(!window\.GestionTareas\?\.puede\(\) \|\| !esAdminOperativoActual\(\)\)/);
  assert.match(view,/c\.actor === state\.currentUser\?\.id/);
  for(const prefix of ['','publicacion/']){
    const css=readFileSync(new URL('../'+prefix+'css/ui-system.css',import.meta.url),'utf8');
    assert.match(css,/trabajador-ficha-panel\[hidden\]/);
    assert.match(css,/trabajador-historial-leyenda/);
  }
});

test('FIX-04: selector laboral conserva UUID y ofrece fichas activas con/sin cuenta',async()=>{
  const text=source('views/mantenciones.js');
  const start=text.indexOf('function mntIniciarSelectorResponsable('),end=text.indexOf('function abrirModalRegistrarMantencion(',start);
  const selector={options:[],value:'',disabled:false,replaceChildren(o){this.options=[o];},add(o){this.options.push(o);},focus(){}};
  const buscar={isConnected:true,value:''},aviso={},sumar={};
  const filas={querySelector:()=>selector,querySelectorAll:()=>[selector]};
  const overlay={classList:{contains(){return false;}},querySelector:q=>({'#mnt-buscar-responsable':buscar,'#mnt-registrar-mantencion-responsable':selector,'#mnt-responsable-aviso':aviso,'#mnt-responsables-filas':filas,'[data-mnt-agregar]':sumar})[q]};
  const c=vm.createContext({mntRegistroMantencionGuardando:false,state:{currentUser:{id:'actor'}},Option:class {constructor(text,value){this.text=text;this.value=value;}},window:{esAdminOperativoActual:()=>true,TrabajadoresService:{getTrabajadores:async()=>[
    {id,nombre:'Homónimo',estado:'Activo',cargo:'Con cuenta'},
    {id:another,nombre:'Homónimo',estado:'Activo',cargo:'Sin cuenta'},
    {id:'inactivo',nombre:'Inactivo',estado:'Inactivo'}]}},revalidarPrivilegioParaEscritura:async()=>true});
  vm.runInContext(text.slice(start,end),c);c.mntIniciarSelectorResponsable(overlay);await new Promise(setImmediate);
  assert(selector.options.some(o=>o.value===id));assert(selector.options.some(o=>o.value===another));
  assert(!selector.options.some(o=>o.value==='inactivo'));assert(selector.options.some(o=>o.value==='nuevo'));
  selector.value=another;await selector.onchange();buscar.value='Sin cuenta';buscar.oninput();assert.equal(selector.value,another);
});
test('FIX-04: contrato laboral unitario no acepta arrays ni duplica escrituras',async()=>{
  const f=fixture();vm.runInContext(source('services/mantenciones.service.js'),f.c);let writes=0;
  f.c.window.supabaseClient.rpc=async()=>{writes++;return {data:[{id}]};};
  await assert.rejects(f.c.window.MantencionesService.registrarMantencionOperativa({elementoId:id,fechaRealizacion:'2026-11-13',trabajadorId:[id,another],detalleTrabajo:'Trabajo'}));
  assert.equal(writes,0);
  const text=source('views/mantenciones.js');assert.match(text,/mntRegistroMantencionGuardando/);
  assert.match(text,/mntRegistroMantencionActorId !== state.currentUser\?\.id/);
});
test('FIX-04: historial compacto conserva todos los registros y trazabilidad, sin falsa paginación',()=>{
  const text=source('views/mantenciones.js');const start=text.indexOf('function mntHistorialCompactoHTML('),end=text.indexOf('if (typeof customElements',start);
  const c=vm.createContext({mntEsc:x=>String(x)});vm.runInContext(text.slice(start,end),c);
  const content='<ul><li>Uno</li><li>Dos</li><li>Tres</li></ul>';
  assert.equal(c.mntHistorialCompactoHTML(2,'Historial',content),content);
  const html=c.mntHistorialCompactoHTML(3,'Historial',content);assert(html.includes(content));assert.match(html,/alm-historial-scroll[^>]*tabindex="0"/);
  assert.match(text,/lista\?\.children\[1\]/);
  const root=readFileSync(new URL('../js/views/mantenciones.js',import.meta.url),'utf8');
  assert.match(root,/Origen \/ trazabilidad/);
});
test('FIX-04: TV mantiene autorización permanente y verifica recibo antes de invalidar cachés',async()=>{
  const f=fixture();vm.runInContext(source('services/mantenciones.service.js'),f.c);f.c.window.esAdminPermanenteActual=()=>false;let calls=0;
  f.c.window.supabaseClient.rpc=async()=>{calls++;return {data:{}};};
  await assert.rejects(f.c.window.MantencionesService.eliminarTelevisor({p_operacion_id:id,p_televisor_id:another}),/NO_AUTORIZADA/);assert.equal(calls,0);
  f.c.window.esAdminPermanenteActual=()=>true;
  await assert.rejects(f.c.window.MantencionesService.eliminarTelevisor({p_operacion_id:id,p_televisor_id:another}),/NO_VERIFICADO/);assert.equal(calls,1);
  assert.doesNotMatch(source('views/mantenciones.js'),/usuarioEsExcepcionalEliminacion|USUARIO_ELIMINACION_EXCEPCIONAL/);
});

function mantencionV3Fixture(respuesta) {
  const f=fixture(),storage=new Map(),calls=[];
  vm.runInContext(source('services/mantenciones.service.js'),f.c);
  f.c.TextEncoder=TextEncoder;
  f.c.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  f.c.window.supabaseClient.rpc=async(name,args)=>{calls.push([name,structuredClone(args)]);return respuesta?respuesta(name,args):{data:{ok:true,mantencion_id:'33333333-3333-4333-8333-333333333333',created_at:'2026-11-13T12:00:00Z',responsables_total:args.p_trabajadores_ids.length}};};
  const datos={elementoId:id,fechaRealizacion:'2026-11-13',trabajadoresIds:[id,another],detalleTrabajo:'Trabajo múltiple'};
  return {...f,storage,calls,datos,service:f.c.window.MantencionesService};
}
test('FIX-04C: uno o varios responsables usan una sola v3 y conservan orden',async()=>{
  for(const ids of [[another],[another,id]]){
    const f=mantencionV3Fixture();const data=await f.service.registrarMantencionOperativa({...f.datos,trabajadoresIds:ids});
    assert.equal(data.ok,true);assert.equal(f.calls.length,1);
    assert.equal(f.calls[0][0],'mantencion_registrar_mantencion_v3');
    assert.deepEqual(f.calls[0][1],{p_elemento_id:id,p_fecha_realizacion:'2026-11-13',p_trabajadores_ids:ids,p_detalle_trabajo:'Trabajo múltiple'});
    assert.equal(f.storage.size,0);
  }
  for(const ids of [[],[id,id],['Nombre'],[null]]){const f=mantencionV3Fixture();await assert.rejects(f.service.registrarMantencionOperativa({...f.datos,trabajadoresIds:ids}));assert.equal(f.calls.length,0);}
});
test('FIX-04C: trabajador rechazado por servidor conserva error, sin éxito falso ni reenvío',async()=>{
  const f=mantencionV3Fixture(()=>({error:{code:'P0001',message:'Trabajador inactivo o inexistente'}}));
  await assert.rejects(f.service.registrarMantencionOperativa(f.datos));assert.equal(f.calls.length,1);assert.equal(f.storage.size,0);
});
test('FIX-04C: incertidumbre bloquea mismo intento incluso tras recrear servicio; doble envío no duplica',async()=>{
  const f=mantencionV3Fixture(()=>{throw Error('red');});
  await assert.rejects(f.service.registrarMantencionOperativa(f.datos),e=>e.resultadoIncierto===true);
  await assert.rejects(f.service.registrarMantencionOperativa(f.datos));assert.equal(f.calls.length,1);assert.equal(f.storage.size,1);
  vm.runInContext(source('services/mantenciones.service.js'),vm.createContext({...f.c,window:f.c.window}));
  await assert.rejects(f.c.window.MantencionesService.registrarMantencionOperativa(f.datos));assert.equal(f.calls.length,1);
  let release;const d=mantencionV3Fixture(()=>new Promise(r=>release=r));const pending=d.service.registrarMantencionOperativa(d.datos);
  await assert.rejects(d.service.registrarMantencionOperativa(d.datos),/en curso/);
  while(!release)await new Promise(setImmediate);
  release({data:{ok:true,mantencion_id:id,created_at:'2026-11-13T12:00:00Z',responsables_total:2}});await pending;assert.equal(d.calls.length,1);
  const bad=mantencionV3Fixture(()=>({data:{ok:true}}));await assert.rejects(bad.service.registrarMantencionOperativa(bad.datos),e=>e.resultadoIncierto===true);
});
test('FIX-04C: historial nuevo ordenado y antiguo textual, con errores de relaciones visibles',async()=>{
  const f=mantencionLecturaFixture();const result=await f.service.getMantencionesOperativasPorElemento(id,true);
  assert.equal(result[0].responsable_texto,'Histórico textual');assert.equal(result[0].responsables.length,0);
  assert.deepEqual(Array.from(result[1].responsables,r=>r.nombre),['Principal','Segundo']);
  f.opciones.denegarRelaciones=true;await assert.rejects(f.service.getMantencionesOperativasPorElemento(id,true));
});

test('FIX-04C: filas adicionales excluyen duplicados, conservan orden y registro contextual',async()=>{
  const text=source('views/mantenciones.js'),start=text.indexOf('function mntIniciarSelectorResponsable('),end=text.indexOf('function abrirModalRegistrarMantencion(',start);
  const make=()=>({value:'',disabled:false,className:'selector',options:[],replaceChildren(o){this.options=[o];},add(o){this.options.push(o);},focus(){}});
  const rows=[{select:make()}],buscar={isConnected:true,value:''},aviso={},sumar={};
  const filas={querySelector:()=>rows[0].select,querySelectorAll:()=>rows.map(r=>r.select),appendChild:r=>rows.push(r)};
  const overlay={classList:{contains:()=>false},querySelector:q=>({'#mnt-buscar-responsable':buscar,'#mnt-responsables-filas':filas,'[data-mnt-agregar]':sumar,'#mnt-responsable-aviso':aviso})[q]};
  const c=vm.createContext({mntRegistroMantencionGuardando:false,state:{currentUser:{id:'actor'}},Option:class{constructor(text,value){this.text=text;this.value=value;}},revalidarPrivilegioParaEscritura:async()=>true,
    document:{getElementById:()=>null,createElement(){const row={select:make(),button:{},querySelector:q=>q==='select'?row.select:row.button,remove(){rows.splice(rows.indexOf(row),1);}};return row;}},
    window:{esAdminOperativoActual:()=>true,TrabajadoresService:{getTrabajadores:async()=>[{id,nombre:'Con cuenta',estado:'Activo'},{id:another,nombre:'Sin cuenta',estado:'Activo'},{id:'33333333-3333-4333-8333-333333333333',nombre:'Tercero',estado:'Activo'}]}}});
  let registro;c.abrirTrabajadorFormulario=(_modo,_id,ctx)=>registro=ctx;
  vm.runInContext(text.slice(start,end),c);c.mntIniciarSelectorResponsable(overlay);await new Promise(setImmediate);
  assert.equal(rows.length,1);assert.equal(sumar.disabled,true);
  rows[0].select.value=another;await rows[0].select.onchange();assert.equal(sumar.disabled,false);sumar.onclick();
  assert.equal(rows.length,2);assert(rows[1].select.options.find(o=>o.value===another).disabled);
  rows[1].select.value=id;await rows[1].select.onchange();assert.deepEqual(rows.map(r=>r.select.value),[another,id]);
  sumar.onclick();rows[2].select.value=id;await rows[2].select.onchange();assert.equal(rows[2].select.value,'');rows[2].button.onclick();assert.equal(rows.length,2);
  rows[1].select.value='nuevo';await rows[1].select.onchange();assert(registro);
  await registro.alGuardar({id:'44444444-4444-4444-8444-444444444444',nombre:'Nuevo sin cuenta',estado:'Activo'});
  assert.deepEqual(rows.map(r=>r.select.value),[another,'44444444-4444-4444-8444-444444444444']);
});
test('FIX-04C: error conserva formulario y selección; duplicados no llaman al servicio',async()=>{
  const text=source('views/mantenciones.js'),start=text.indexOf('async function mntEnviarRegistrarMantencion('),end=text.indexOf('async function mntRepintarFichaOperativa(',start);
  let calls=0,closed=0;const values=[{value:another},{value:id}],errors=[];
  const c=vm.createContext({mntRegistroMantencionGuardando:false,mntRegistroMantencionActorId:'actor',mntRegistroMantencionElementoId:id,state:{currentUser:{id:'actor'}},
    window:{esAdminOperativoActual:()=>true,MantencionesService:{registrarMantencionOperativa:async data=>{calls++;assert.deepEqual(Array.from(data.trabajadoresIds),[another,id]);throw Error('Trabajador inactivo');}}},
    document:{getElementById:key=>key==='mnt-responsables-filas'?{querySelectorAll:()=>values}:{value:key.includes('fecha')?'2026-11-13':'Trabajo'}},
    mntMostrarErrorRegistrarMantencion:m=>errors.push(m),mntMarcarSubmitRegistrarMantencionEnviando(){},mntRestaurarSubmitRegistrarMantencion(){c.mntRegistroMantencionGuardando=false;},cerrarModalRegistrarMantencion(){closed++;},mntRepintarFichaContextoOperativa(){}});
  vm.runInContext(text.slice(start,end),c);await c.mntEnviarRegistrarMantencion();assert.equal(calls,1);assert.equal(closed,0);assert(errors[0].includes('trabajador'));assert.deepEqual(values.map(v=>v.value),[another,id]);
  values[1].value=another;await c.mntEnviarRegistrarMantencion();assert.equal(calls,1);assert.equal(closed,0);
});

function historialPaginadoFixture() {
  const text=source('views/mantenciones.js'),start=text.indexOf('// FIX-04D:'),end=text.indexOf('function mntHistorialCompactoHTML(',start);
  let Tipo;const c=vm.createContext({Date,mntEsc:x=>String(x),HTMLElement:class {appendChild(n){this.nav=n;}},customElements:{define(name,type){assert.equal(name,'alm-historial-paginado');Tipo=type;}},
    document:{createElement(tag){return {tag,children:[],attributes:{},setAttribute(k,v){this.attributes[k]=v;},append(...nodes){this.children.push(...nodes);}};}}});
  vm.runInContext(text.slice(start,end),c);return {c,Tipo};
}
test('FIX-04D: dos registros por página, navegación acotada y accesible sin borrar históricos',()=>{
  const {Tipo}=historialPaginadoFixture();const element=new Tipo();const filas=Array.from({length:5},(_,i)=>({id:'registro-'+i,responsables:[id,another]}));
  element.firstElementChild={children:filas};element.connectedCallback();
  const [anterior,estado,siguiente]=element.nav.children;
  const visibles=()=>filas.filter(r=>!r.hidden).map(r=>r.id);
  assert.deepEqual(visibles(),['registro-0','registro-1']);assert.equal(anterior.disabled,true);assert.equal(siguiente.disabled,false);
  assert.equal(estado.attributes['aria-live'],'polite');assert.equal(element.nav.attributes['aria-label'],'Páginas del historial');
  siguiente.onclick();assert.deepEqual(visibles(),['registro-2','registro-3']);assert.equal(estado.textContent,'Página 2 de 3');
  siguiente.onclick();assert.deepEqual(visibles(),['registro-4']);assert.equal(siguiente.disabled,true);siguiente.onclick();assert.equal(estado.textContent,'Página 3 de 3');
  anterior.onclick();assert.deepEqual(visibles(),['registro-2','registro-3']);anterior.onclick();assert.deepEqual(visibles(),['registro-0','registro-1']);
  const nav=element.nav;element.connectedCallback();assert.equal(element.nav,nav);assert.equal(filas.length,5);assert.deepEqual(filas[0].responsables,[id,another]);
});
test('FIX-04D: orden reciente primero, sin mutar datos ni inventar fechas ausentes o inválidas',()=>{
  const {c}=historialPaginadoFixture();const rows=[{id:'antiguo',fecha_realizacion:'2024-01-01',responsable_texto:'Original'},
    {id:'sin-fecha',fecha_realizacion:null,created_at:'2026-11-13T12:00:00Z'},
    {id:'nuevo',fecha_realizacion:'2026-11-13',responsables:[{trabajador_id:id,nombre:'Persona'}]},
    {id:'invalido',fecha_realizacion:'2026-02-31'}];
  const before=JSON.stringify(rows),ordered=c.mntOrdenarHistorialReciente(rows);
  assert.deepEqual(Array.from(ordered,r=>r.id),['nuevo','antiguo','sin-fecha','invalido']);assert.equal(JSON.stringify(rows),before);
  assert.equal(c.mntHistorialPaginadoHTML(0,'Historial','Vacío'),'Vacío');assert.equal(c.mntHistorialPaginadoHTML(2,'Historial','Dos'),'Dos');
  assert.match(c.mntHistorialPaginadoHTML(3,'Historial','Tres'),/alm-historial-paginado/);
});
test('FIX-04D: solo Mantención cambia de componente; origen laboral sigue sujeto a lectura autorizada',()=>{
  const text=source('views/mantenciones.js');assert.equal((text.match(/mntHistorialCompactoHTML\(/g)||[]).length,1,'Se conserva helper antiguo, no llamadas de Mantención');
  assert.match(text,/function mntHistorialCompactoHTML/);assert.match(text,/customElements.define\('alm-historial-scroll'/);
  const service=source('services/mantenciones.service.js');assert.doesNotMatch(service,/from\('trabajadores'\)/);
  assert.match(service,/rpc\('mantencion_responsables_consultar_v1'/);
  assert.match(service,/recibo.length !== esperados.length/);
  for(const prefix of ['','publicacion/']){const css=readFileSync(new URL('../'+prefix+'css/ui-system.css',import.meta.url),'utf8');assert.match(css,/alm-historial-paginado[^]*?\[hidden\][^]*?display: none !important/);}
});

test('FIX-04D: lectura segura denegada no devuelve un historial parcial ni amplía permisos',async()=>{
  const f=mantencionLecturaFixture({errorRpc:true});await assert.rejects(f.service.getMantencionesOperativasPorElemento(id,true),/lectura autorizada/);assert.equal(f.opciones.directas,0);
});

test('FIX-04E: navegación distingue Técnico, Recepción y administración temporal en ambas rutas',()=>{
  const prefix=process.env.TRABAJADORES_VISTA_RAIZ==='1'?'':'publicacion/';
  const app=readFileSync(new URL('../'+prefix+'js/app.js',import.meta.url),'utf8');
  const stateSource=readFileSync(new URL('../'+prefix+'js/state.js',import.meta.url),'utf8');
  const roles=vm.runInNewContext('('+stateSource.match(/const SYSTEM_ROLES = (\[[^]*?\n\]);/)[1]+')');
  const code=app.slice(app.indexOf('function hasAccess('),app.indexOf('function hasActionPermission('));
  for(const [role,admin,custom,expected]of [['TECNICO',false,false,true],['RECEPCION',false,false,false],['ADMINISTRADOR',true,false,true],['TECNICO',true,false,true],['RECEPCION',true,false,true],['OTRO',false,true,true],['SIN_ROL',false,false,false]]){
    const c=vm.createContext({sesionNoVerificable:false,sesionEnReconexion:false,state:{currentUser:{id,role,...(custom?{permissions:{modules:['mantenciones']}}:{})}},esAdminOperativoActual:()=>admin,esAdminPermanenteActual:()=>admin&&role==='ADMINISTRADOR',window:{SYSTEM_ROLES:roles}});
    vm.runInContext(code,c);assert.equal(c.hasAccess('mantenciones',role),expected,role+' temporal='+admin);
  }
});
test('FIX-04E: nombres restringidos se resuelven solo mediante RPC autorizada',async()=>{
  const f=mantencionLecturaFixture({rol:'TECNICO'});const rows=await f.service.getMantencionesOperativasPorElemento(id,true);assert.equal(rows[0].responsable_texto,'Histórico textual');assert.equal(rows[1].responsables.length,2);assert.equal(f.opciones.directas,0);
});

function mantencionLecturaFixture(options={}) {
  const f=mantencionV3Fixture(),opciones={rol:'ADMINISTRADOR',habilitado:true,directas:0,rpcs:[],...options};
  f.c.state.currentUser.role=opciones.rol;
  f.c.esAdminOperativoActual=()=>opciones.rol==='ADMINISTRADOR'||opciones.temporal===true;
  const tablas={mantenciones_operativas:[{id,elemento_id:id,trabajador_id:null,responsable_texto:'Histórico textual'},
    {id:another,elemento_id:id,trabajador_id:another,responsable_texto:'Principal'}],mantenciones_operativas_anulaciones:[],mantenciones_operativas_responsables:[{mantencion_id:another,trabajador_id:id,orden:2},{mantencion_id:another,trabajador_id:another,orden:1}]};
  f.c.window.supabaseClient.from=table=>{if(table==='trabajadores'){opciones.directas++;throw Error('SELECT no permitido');}let data=tablas[table];assert(data,table);return {select(){return this;},eq(){return this;},order(){return this;},in(col,ids){data=data.filter(x=>ids.includes(x[col]));return this;},range(a,b){data=data.slice(a,b+1);return this;},then(resolve){return Promise.resolve(opciones.denegarRelaciones&&table==='mantenciones_operativas_responsables'?{error:{code:'42501'}}:{data}).then(resolve);}};};
  f.c.window.supabaseClient.rpc=(name,body)=>{
    assert.equal(name,'mantencion_responsables_consultar_v1');assert.deepEqual(Object.keys(body),['p_mantencion_ids']);opciones.rpcs.push(structuredClone(body));
    // Modelo del contrato propuesto, sin motor SQL ni RLS real.
    let result;
    if(opciones.errorRpc||!opciones.habilitado||!(opciones.rol==='ADMINISTRADOR'||opciones.rol==='TECNICO'||opciones.temporal))result={error:{code:'42501'}};
    else {
      let rows=[{mantencion_id:another,trabajador_id:another,orden:1,nombre:'Principal'},{mantencion_id:another,trabajador_id:id,orden:2,nombre:'Segundo'}];
      if(opciones.incompleta)rows.pop();if(opciones.ajena)rows.push({...rows[0],mantencion_id:'ajena'});if(opciones.extra)rows[0].email='no-debe-aparecer';if(opciones.duplicada)rows.push({...rows[0]});
      result={data:rows};
    }
    let desde=0,hasta=199;
    return {order(){return this;},range(a,b){desde=a;hasta=b;return this;},then(resolve){return Promise.resolve(result.error?result:{data:result.data.slice(desde,hasta+1)}).then(resolve);}};
  };
  return {...f,opciones};
}
test('FIX-04F: lectura autorizada para Administrador/Técnico y rechazo Recepción/deshabilitado',async()=>{
  for(const opts of [{rol:'ADMINISTRADOR'},{rol:'TECNICO'},{rol:'RECEPCION',temporal:true}]){
    const f=mantencionLecturaFixture(opts),r=await f.service.getMantencionesOperativasPorElemento(id,true);
    assert.equal(r.length,2);assert.equal(r[0].responsables.length,0);assert.equal(r[1].responsables[0].trabajador_id,another);assert.equal(f.opciones.directas,0);assert.equal(f.opciones.rpcs.length,1);
  }
  for(const opts of [{rol:'RECEPCION'},{rol:'TECNICO',habilitado:false},{errorRpc:true}]){const f=mantencionLecturaFixture(opts);await assert.rejects(f.service.getMantencionesOperativasPorElemento(id,true));assert.equal(f.opciones.directas,0);}
});
test('FIX-04F: respuesta incompleta, ajena, duplicada o con campos extra nunca se acepta',async()=>{
  for(const opts of [{incompleta:true},{ajena:true},{duplicada:true},{extra:true}]){const f=mantencionLecturaFixture(opts);await assert.rejects(f.service.getMantencionesOperativasPorElemento(id,true));assert.equal(f.opciones.directas,0);}
});
test('FIX-04F: cambio de actor no reutiliza caché administrativa',async()=>{
  const f=mantencionLecturaFixture();await f.service.getMantencionesOperativasPorElemento(id);f.c.state.currentUser.id='otro';f.opciones.errorRpc=true;
  await assert.rejects(f.service.getMantencionesOperativasPorElemento(id));assert.equal(f.opciones.rpcs.length,2);
});


const retiro213=(confirmado=null)=>({id:another,autorizado_hasta:'2026-11-14T20:00:00Z',confirmado_en:confirmado});
const documento213=(key=id,confirmed=null)=>({id:key,cuenta_id:id,nombre_original:'Documento <prueba>.pdf',
  estado_reserva:'disponible',cuenta_nombre_snapshot:'Nombre original',cuenta_rol_snapshot:'Recepción',
  retiro:[retiro213(confirmed)]});
test('213 documental: estado efectivo admite objeto/array sin alterar recibos y bloquea incertidumbre',()=>{
  const f=fixture(),classify=f.service.estadoDocumentoCuenta;
  for(const [retiro,estado] of [[null,'DISPONIBLE'],[[],'DISPONIBLE'],[retiro213(),'RETIRO_PENDIENTE'],
    [[retiro213()],'RETIRO_PENDIENTE'],[retiro213('2026-11-14T19:00:00Z'),'RETIRADO'],
    [[retiro213('2026-11-14T19:00:00Z')],'RETIRADO'],[[retiro213(),retiro213()],'INCIERTO'],[{},'INCIERTO'],
    [[null],'INCIERTO'],[{...retiro213(),confirmado_en:'fecha inválida'},'INCIERTO']]){
    const d={estado_reserva:'disponible',retiro},before=JSON.stringify(d);
    assert.equal(classify(d).estado,estado);assert.equal(JSON.stringify(d),before);
  }
  assert.equal(classify({estado_reserva:'disponible'}).estado,'INCIERTO');
});
test('213 documental: listado excluye confirmados con relación objeto/array y falla cerrado si es incompleta',async()=>{
  const f=fixture();let rows=[{...documento213(),retiro:null},documento213(another,'2026-11-14T19:00:00Z')];
  f.c.window.supabaseClient.from=()=>({select(){return this},eq(){return this},not(){return this},is(){return this},order(){return this},then(resolve){return Promise.resolve({data:rows}).then(resolve)}});
  assert.equal((await f.service.getDocumentosCuenta(id)).length,1);
  rows[1].retiro=rows[1].retiro[0];assert.equal((await f.service.getDocumentosCuenta(id)).length,1);
  rows[1].retiro={};await assert.rejects(f.service.getDocumentosCuenta(id),/estado documental/);
});
test('213 documental: descarga bloquea retirado/pendiente y retiro confirmado durante lectura, sin entregar bytes',async()=>{
  const f=fixture(),blob=new Blob(['PDF'],{type:'application/pdf'});let downloads=0;
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
  let row={...documento213(),cuenta_id:another,bucket_id:'documentos-cuentas',storage_path:'cuentas/'+another+'/'+id,
    storage_object_id:id,storage_version:'v1',tamano_bytes_verificado:3,mime_type_verificado:'application/pdf',sha256_verificado:sha};
  f.c.window.supabaseClient.from=()=>({select(){return this},eq(){return this},single:async()=>({data:structuredClone(row)})});
  f.c.window.supabaseClient.storage={from:()=>({download:async()=>{downloads++;row.retiro=[retiro213('2026-11-14T19:00:00Z')];return {data:blob}}})};
  await assert.rejects(f.service.obtenerArchivoCuenta(id),/retirado|revisión/);assert.equal(downloads,0);
  row.retiro=[retiro213('2026-11-14T19:00:00Z')];await assert.rejects(f.service.obtenerArchivoCuenta(id));assert.equal(downloads,0);
  row.retiro=null;await assert.rejects(f.service.obtenerArchivoCuenta(id),/cambió/);assert.equal(downloads,1);
});
test('213 documental: retirada se revalida antes de reserva y de Storage; confirmación concurrente impide borrar',async()=>{
  const f=fixture({retiro:true});let reservations=0,removes=0;
  const d={...documento213(),cuenta_id:another,retiro:null};
  const client=f.c.window.supabaseClient;
  client.auth={getUser:async()=>({data:{user:{id:'actor'}}})};
  client.from=()=>({select(){return this},eq(){return this},single:async()=>({data:structuredClone(d)})});
  client.rpc=async(name)=>{
    if(name==='es_administrador_actual')return {data:true};
    assert.equal(name,'cuentas_documentos_reservar_retiro_v1');reservations++;
    d.retiro=[{...retiro213('2026-11-14T19:00:00Z'),id}];
    return {data:{operacion_id:id,resultado:'RESERVADO',autoriza_envio:true,bucket_id:'documentos-cuentas',
      storage_path:'cuentas/'+another+'/'+id,autorizado_hasta:new Date(Date.now()+60000).toISOString()}};
  };
  client.storage={from:()=>({remove:async()=>{removes++;return {data:[]}}})};
  await assert.rejects(f.service.retirarDocumentoCuenta({cuentaId:another,documentoId:id,accion:'reservar',confirmacion:true}));
  assert.equal(reservations,1);assert.equal(removes,0);
  await assert.rejects(f.service.retirarDocumentoCuenta({cuentaId:another,documentoId:id,accion:'reservar',confirmacion:true}));
  assert.equal(reservations,1);assert.equal(removes,0);
});

test('229 documental: ficha sin historial retirado ni consultas exclusivas; conserva acciones pendientes',()=>{
 const f=fixture();f.c.account={id,nombre:'Cuenta',estado:true,roles:{nombre:'Técnico'}};
 const html=vm.runInContext('cuentaTrabajadorFichaHTML(account)',f.c);
 assert.doesNotMatch(html,/Historial de documentos retirados|cuenta-documentos-historial|cuentaTrabajadorHistorialDocumentos/);
 assert.equal(f.service.getHistorialDocumentosCuenta,undefined);
 assert.equal(typeof f.c.cuentaTrabajadorHistorialDocumentosAbrir,'undefined');
 assert.equal(typeof f.service.estadoDocumentoCuenta,'function');
 assert.equal(typeof f.service.revalidarDocumentoCuenta,'function');
 assert.equal(typeof f.c.cuentaTrabajadorRetirarDocumento,'function');
 assert.equal(f.calls.length,0);
});
test('229 documental: éxito visual solo con confirmación definitiva; revisión mantiene UUID sin otra solicitud',async()=>{
 for(const flag of [true,false,undefined]){
  const f=fixture({retiro:true}),box={textContent:''};let calls=0,loads=0;
  f.c.document.getElementById=key=>key==='cuenta-documentos-estado'?box:null;
  f.c.document.createElement=()=>({open:false,remove(){}});
  f.c.trabajadorConfirmarEstado=async()=>true;
  f.c.cuentaTrabajadorCargarDocumentos=async()=>{loads++};
  f.c.ctx={id:another,version:0,actor:'actor',documentos:[{id,nombre_original:'Documento.pdf'}]};
  vm.runInContext('cuentaDocumentalContexto=ctx',f.c);
  f.service.revalidarDocumentoCuenta=async()=>({id,nombre_original:'Documento.pdf',estado_efectivo:'RETIRO_PENDIENTE',retiro_efectivo:{id}});
  f.service.retirarDocumentoCuenta=async args=>{
   calls++;assert.equal(args.accion,'revisar');assert.equal(args.operacionId,id);assert.equal(args.confirmacion,true);
   return {resultado:'AUSENCIA_CONFIRMADA',operacionId:id,eliminacionDefinitiva:flag};
  };
  await f.c.cuentaTrabajadorRetirarDocumento(id);
  assert.equal(calls,1);assert.equal(loads,1);
  assert.equal(box.textContent.includes('Documento eliminado correctamente'),flag===true);
  if(flag!==true){assert.match(box.textContent,/no está confirmada/);assert(box.textContent.includes(id));}
 }
});

test('241 institucional: referencias persisten sin archivos/tokens, se aíslan por actor y recuperan el UUID tras recarga',async()=>{
 const f=await escenarioSubidaCuenta('desconexion'),storage=new Map();
 f.c.window.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 await assert.rejects(f.service.subirDocumentoCuenta(f.prep));
 const saved=storage.get('alm.documentos.institucionales.v1:actor');assert(saved.includes(f.prep.id));assert.doesNotMatch(saved,/jwt-real|contenido_base64|local.pdf|actor_id/);
 f.service._documentosCuentaIntentos.clear();assert.deepEqual(Array.from(f.service.getSubidasCuentaPendientes(id)),[f.prep.id]);
 await assert.rejects(f.service.prepararDocumentoCuenta(id,f.prep.archivo),e=>e.documentoId===f.prep.id);
 f.c.state.currentUser.id='otro';f.service._guardarSubidasCuenta('actor');assert.equal(storage.has('alm.documentos.institucionales.v1:otro'),false);
 f.c.state.currentUser.id='actor';await f.service.revisarSubidaDocumentoCuenta(id,f.prep.id);
 assert.equal(JSON.parse(storage.get('alm.documentos.institucionales.v1:actor')).length,0);
 assert.deepEqual(f.events,['SUBIR_DOCUMENTO_INSTITUCIONAL','REVISAR_DOCUMENTO_INSTITUCIONAL']);
});
test('241 institucional: recibo local corrupto bloquea nueva subida y se conserva para revisión',async()=>{
 const f=await escenarioSubidaCuenta();f.c.window.sessionStorage={getItem:()=>'{corrupto',setItem:()=>assert.fail('No borrar recibos inciertos')};
 await assert.rejects(f.service.prepararDocumentoCuenta(id,f.prep.archivo),/referencias pendientes/);assert.equal(f.events.length,0);
});
test('241 institucional: revisión UI es explícita, comparte bloqueo y conserva texto/diseño',async()=>{
 const f=fixture({escritura:true}),buttons=[],status={textContent:'',appendChild(b){buttons.push(b)},querySelectorAll(){return []}};
 f.c.document.getElementById=k=>k==='cuenta-documentos-estado'?status:null;
 f.c.document.createElement=()=>({dataset:{}});
 f.c.ctx={id,version:0,actor:'actor',documentos:[]};vm.runInContext('cuentaDocumentalContexto=ctx',f.c);
 f.service.getSubidasCuentaPendientes=()=>[another];let reviews=0,loads=0,finish;
 f.service.revisarSubidaDocumentoCuenta=async(cuenta,doc)=>{reviews++;assert.equal(cuenta,id);assert.equal(doc,another);await new Promise(resolve=>{finish=resolve});f.service.getSubidasCuentaPendientes=()=>[]};
 f.c.cuentaTrabajadorCargarDocumentos=async()=>{loads++};
 f.c.cuentaTrabajadorPintarSubidasPendientes(f.c.ctx);assert.equal(reviews,0);assert.equal(buttons[0].textContent,'Revisar subida pendiente');
 const pending=buttons[0].onclick();await f.c.cuentaTrabajadorRevisarSubidaPendiente(another);assert.equal(reviews,1);
 finish();await pending;assert.equal(loads,1);assert.equal(status.textContent,'Documento guardado.');assert.equal(f.c.ctx.enviando,false);
});

test('247: cabecera restaura Nuevo trabajador y fichas muestran Subir documento solo al administrador actual',()=>{
 for(const permanent of [true,false])for(const allowed of [true,false]){
  const f=fixture({permanent,allowed,escritura:true});
  f.c.account={id,nombre:'Cuenta',estado:true,roles:{nombre:'Administrador'}};
  const header=f.c.getTrabajadoresHTML([]);
  assert.equal(header.includes('data-nuevo-trabajador'),allowed);
  if(allowed)assert.match(header,/abrirTrabajadorFormulario\('nuevo'\)/);
  for(const role of ['Administrador','Técnico','Recepción']){
   f.c.account.roles.nombre=role;const html=vm.runInContext('cuentaTrabajadorFichaHTML(account)',f.c);
   assert.equal((html.match(/>\s*Subir documento\s*</g)||[]).length,Number(allowed));
   if(allowed)assert.match(html,/cuentaTrabajadorSubirDocumento\(\)/);
  }
 }
});

test('258 ruta: documento migrado usa ruta institucional bajo el mismo UUID, sin admitir otro destino',()=>{
 const f=fixture();f.c.d={id,cuenta_id:another,propiedad_institucional:true,storage_path:'cuentas/'+another+'/'+id+'/institucional/'+id};
 assert.equal(vm.runInContext('cuentaDocumentoRutaValida(d)',f.c),true);f.c.d.propiedad_institucional=false;assert.equal(vm.runInContext('cuentaDocumentoRutaValida(d)',f.c),false);
 f.c.d.propiedad_institucional=true;f.c.d.storage_path='cuentas/'+id+'/'+another+'/institucional/'+id;assert.equal(vm.runInContext('cuentaDocumentoRutaValida(d)',f.c),false);
});

test('375K.14 ficha documental: resuelve cuenta eliminada por servidor, sin inferir por nombre ni duplicar',async()=>{
  const f=fixture();let reads=0;
  const historical={contrato:'usuario-identidades-historicas/v2',modulo:'DOCUMENTOS_FICHA',eliminacion_ejecutada:false,
    registros_autorizados:[id],identidades:[{registro_id:id,origen_id:id,referencia_id:id,tipo:'trabajador',cuenta_eliminada:true}],
    cuentas_documentales:[{trabajador_id:id,cuenta_id:another}]};
  f.c.window.supabaseClient.functions={invoke:async(name,{body})=>{
    assert.equal(name,'usuario-eliminacion-ejecutar');assert.equal(body.modulo,'DOCUMENTOS_FICHA');
    assert.deepEqual(Array.from(body.registros),[id]);return {data:historical};}};
  f.c.window.supabaseClient.from=table=>{
    assert.equal(table,'cuentas_documentos');reads++;
    return {select(){return this},eq(k,v){if(k==='cuenta_id')assert.equal(v,another);return this},not(){return this},is(){return this},order(){return this},
      then(resolve){const doc={...documento213(),cuenta_id:another,retiro:null,mime_type_verificado:'application/pdf',tamano_bytes_verificado:52};
        return Promise.resolve({data:[doc,doc]}).then(resolve);}};
  };
  const docs=await f.service.getDocumentosCuenta(id,{trabajadorHistorico:true});
  assert.equal(docs.length,1);assert.equal(docs[0].origen_cuenta_conservada,true);assert.equal(docs[0].estado_efectivo,'DISPONIBLE');
  assert.equal(reads,1);
  historical.cuentas_documentales=[];historical.identidades=[];
  assert.equal((await f.service.getDocumentosCuenta(id,{trabajadorHistorico:true})).length,0);assert.equal(reads,1);
  historical.cuentas_documentales=[{trabajador_id:another,cuenta_id:another}];
  await assert.rejects(f.service.getDocumentosCuenta(id,{trabajadorHistorico:true}),/verificar/);
  historical.cuentas_documentales=[];historical.registros_autorizados=[];
  await assert.rejects(f.service.getDocumentosCuenta(id,{trabajadorHistorico:true}),/verificar/);
  const denied=fixture({allowed:false});await assert.rejects(denied.service.getDocumentosCuenta(id,{trabajadorHistorico:true}));
});

test('375K.14 ficha documental: combina orígenes y revalida descarga privada sin usar el borrado laboral',async()=>{
  const f=fixture();const box={innerHTML:''};let downloads=0;
  f.c.document.getElementById=key=>key==='trabajador-documentos-lista'?box:null;
  f.c.ficha={id,nombre:'Homónimo',estado:'Activo'};vm.runInContext('trabajadoresFichaActual=ficha',f.c);
  const doc={id:another,nombre_original:'Conservado.pdf',mime_type:'application/pdf',tamano_bytes:52,
    origen_cuenta_conservada:true,estado_efectivo:'DISPONIBLE'};
  f.c.window.TrabajadoresDocumentosService={getDocumentos:async()=>[{id,nombre_original:'Laboral.pdf',mime_type:'application/pdf',tamano_bytes:40}],
    crearUrlTemporal:()=>assert.fail('Un conservado nunca usa el bucket laboral')};
  f.service.getDocumentosCuenta=async(worker,options)=>{assert.equal(worker,id);assert.equal(options.trabajadorHistorico,true);return [doc];};
  await f.c.trabajadoresCargarDocumentos();
  assert(box.innerHTML.includes('Laboral.pdf'));assert(box.innerHTML.includes('Conservado.pdf'));
  assert(box.innerHTML.includes(`trabajadorEliminarDocumento('${id}'`));
  assert(!box.innerHTML.includes(`trabajadorEliminarDocumento('${another}'`));
  assert(box.innerHTML.includes(`cuentaTrabajadorAbrirArchivo('${another}', false, true)`));
  const popup={closed:false,location:{},close(){this.closed=true}};
  f.c.window.open=()=>popup;f.c.URL={createObjectURL:()=> 'blob:verificado',revokeObjectURL(){}};
  f.c.setTimeout=()=>1;
  f.service.obtenerArchivoCuenta=async key=>{assert.equal(key,another);downloads++;return new Blob(['contenido']);};
  await f.c.cuentaTrabajadorAbrirArchivo(another,false,true);
  assert.equal(downloads,1);assert.equal(popup.location.href,'blob:verificado');assert.equal(popup.opener,null);
  let clicked=false;f.c.document.createElement=()=>({click(){clicked=true},remove(){}});f.c.document.body={appendChild(){}};
  await f.c.cuentaTrabajadorAbrirArchivo(another,true,true);assert(clicked);assert.equal(downloads,2);
  vm.runInContext('trabajadoresFichaActual={id:ficha.id}',f.c);
  await f.c.cuentaTrabajadorAbrirArchivo(another,false,true);assert.equal(downloads,2);
  f.c.trabajadoresFichaActual=f.c.ficha;
  f.service.getDocumentosCuenta=async()=>{throw Error('Lectura no autorizada')};
  vm.runInContext('trabajadoresFichaActual=ficha',f.c);
  await f.c.trabajadoresCargarDocumentos();assert(box.innerHTML.includes('Error al cargar'));assert(!box.innerHTML.includes('Sin documentos'));
  const pending=f.c.trabajadorDocumentoFilaHTML({...doc,estado_efectivo:'RETIRO_PENDIENTE'});
  assert(!pending.includes('cuentaTrabajadorAbrirArchivo'));assert(pending.includes('Retiro pendiente'));
});

test('375K.22 histórico: eliminación institucional explícita con cuenta original, actualización y recuperación sin repetir Storage',async()=>{
  for(const incierto of [false,true]){
    const f=fixture({retiro:true}),client=f.c.window.supabaseClient;
    const worker='33333333-3333-4333-8333-333333333333';
    const ficha={id:worker,nombre:'Persona sin cuenta',estado:'Activo'};
    const doc={id,cuenta_id:another,nombre_original:'Institucional.pdf',origen_cuenta_conservada:true,
      estado_reserva:'disponible',estado_efectivo:'DISPONIBLE',retiro:null,
      propiedad_institucional:true,storage_path:'cuentas/'+another+'/'+id};
    f.c.ficha=ficha;f.c.ctx={ficha,actor:'actor',documentos:[doc]};
    vm.runInContext('trabajadoresFichaActual=ficha; trabajadoresDocumentosConservados=ctx',f.c);
    f.c.document.createElement=()=>({open:false,remove(){}});
    let confirms=0,reservations=0,removes=0,checks=0,reloads=0,pending=false,deleted=false;
    f.c.trabajadorConfirmarEstado=async()=>{confirms++;return true};
    const messages=[];f.c.mostrarErrorTrabajador=msg=>messages.push(msg);
    f.c.trabajadoresCargarDocumentos=async()=>{reloads++;};
    client.auth={getUser:async()=>({data:{user:{id:'actor'}}})};
    f.service.revalidarDocumentoCuenta=async(key,account)=>{
      assert.equal(key,id);assert.equal(account,another);assert.notEqual(account,worker);
      return {...doc,estado_efectivo:pending?'RETIRO_PENDIENTE':'DISPONIBLE',retiro_efectivo:pending?{id}:null};
    };
    client.rpc=async(name,args)=>{
      if(name==='es_administrador_actual')return {data:true};
      if(name==='cuentas_documentos_reservar_retiro_v1'){
        reservations++;pending=true;assert.equal(args.p_cuenta_id,another);assert.equal(args.p_documento_id,id);assert.equal(args.p_confirmacion,true);
        return {data:{operacion_id:id,resultado:'RESERVADO',autoriza_envio:true,bucket_id:'documentos-cuentas',
          storage_path:doc.storage_path,autorizado_hasta:new Date(Date.now()+60000).toISOString()}};
      }
      assert.equal(name,'cuentas_documentos_confirmar_retiro_v1','No RPC de eliminación de cuenta ni cambios de certificados');
      checks++;assert.equal(args.p_operacion_id,id);
      if(incierto&&checks===1)return {error:{code:'08006'}};
      deleted=true;return {data:{operacion_id:id,resultado:'AUSENCIA_CONFIRMADA',eliminacion_definitiva:true}};
    };
    client.storage={from(bucket){assert.equal(bucket,'documentos-cuentas');return {async remove(paths){
      removes++;assert.deepEqual(Array.from(paths),[doc.storage_path]);if(incierto)throw Error('respuesta perdida');return {data:[]};
    }}}};
    assert(f.c.trabajadorDocumentoFilaHTML(doc).includes(`cuentaTrabajadorRetirarDocumento('${id}', false, true)`));
    await f.c.cuentaTrabajadorRetirarDocumento(id,false,true);
    assert.equal(reservations,1);assert.equal(removes,1);assert.equal(confirms,1);assert.equal(reloads,1);
    if(incierto){
      assert.equal(deleted,false);assert(!f.messages.includes('Documento eliminado correctamente'));assert(messages[0].includes(id));
      await f.c.cuentaTrabajadorRetirarDocumento(id,false,true);
      assert.equal(reservations,1);assert.equal(removes,1);assert.equal(checks,2);assert.equal(confirms,2);
    }
    assert(deleted);assert(f.messages.includes('Documento eliminado correctamente'));
  }
});

test('375K.22 histórico: autorización, cancelación, UUID y ficha vigente bloquean el retiro; botones por origen',async()=>{
  for(const caso of ['sin_permiso','cancelar','cuenta_invalida','cuenta_distinta','documento_distinto','ficha_cambiada','compuerta_cerrada']){
    const f=fixture({retiro:caso!=='compuerta_cerrada',allowed:caso!=='sin_permiso'});
    const ficha={id:another},doc={id,cuenta_id:caso==='cuenta_invalida'?'invalido':another,origen_cuenta_conservada:true,
      nombre_original:'Histórico.pdf',estado_efectivo:'DISPONIBLE'};
    f.c.ficha=ficha;f.c.ctx={ficha,actor:'actor',documentos:[doc]};
    vm.runInContext('trabajadoresFichaActual=ficha;trabajadoresDocumentosConservados=ctx',f.c);
    f.c.document.createElement=()=>({open:false,remove(){}});
    f.c.trabajadorConfirmarEstado=async()=>caso!=='cancelar';
    f.c.mostrarErrorTrabajador=()=>{};f.c.trabajadoresCargarDocumentos=async()=>{};
    f.service.revalidarDocumentoCuenta=async(key,account)=>{
      if(caso==='cuenta_distinta')throw Error('Cuenta distinta');
      if(caso==='ficha_cambiada')vm.runInContext('trabajadoresFichaActual={id:ficha.id}',f.c);
      return {...doc,estado_efectivo:'DISPONIBLE',retiro_efectivo:null};
    };
    f.service.retirarDocumentoCuenta=()=>assert.fail('No debe enviar un retiro');
    await f.c.cuentaTrabajadorRetirarDocumento(caso==='documento_distinto'?another:id,false,true);
    if(['sin_permiso','compuerta_cerrada'].includes(caso))assert(!f.c.trabajadorDocumentoFilaHTML(doc).includes('cuentaTrabajadorRetirarDocumento'));
  }
  const f=fixture({retiro:true});
  const pendiente={id,cuenta_id:another,origen_cuenta_conservada:true,estado_reserva:'disponible',
    estado_efectivo:'RETIRO_PENDIENTE',retiro:[{id,confirmado_en:null,autorizado_hasta:'2020-01-01T00:00:00Z'}]};
  const html=f.c.trabajadorDocumentoFilaHTML(pendiente);
  assert(html.includes('Revisar retiro'));assert(html.includes(`cuentaTrabajadorRetirarDocumento('${id}', true, true)`));
  assert(f.c.trabajadorDocumentoFilaHTML({id,nombre_original:'Laboral.pdf'}).includes('trabajadorEliminarDocumento'));
  assert(f.c.trabajadorDocumentoFilaHTML({id,nombre_original:'Cuenta.pdf'},true,true).includes(`cuentaTrabajadorRetirarDocumento('${id}')`));
});

test('375K.22 contratos locales: operaciones completadas preservan recibos sin recertificar documentos posteriores',()=>{
  const sql=readFileSync(new URL('../supabase/sql-propuestas/20261113_conservacion_cuentas_revision.sql',import.meta.url),'utf8');
  const posterior=sql.slice(sql.indexOf('CREATE FUNCTION public.usuario_eliminacion_verificar_posterior_v2('),sql.indexOf('$posterior356$;',sql.indexOf('CREATE FUNCTION public.usuario_eliminacion_verificar_posterior_v2(')));
  assert.match(posterior,/IF o->>'estado'<>'COMPLETADA' THEN\s+PERFORM public.usuario_eliminacion_verificar_huellas_v2/);
  assert.match(posterior,/RECIBO_FINAL_V2_NO_ACREDITADO/);assert.match(posterior,/AUDITORIA_ARCHIVO_V2_NO_ACREDITADOS/);
  assert(!/\b(UPDATE|DELETE|INSERT)\s/i.test(posterior));
  const guard=sql.slice(sql.indexOf('CREATE FUNCTION public.usuario_eliminacion_guard_documentos_storage_v1()'),sql.indexOf('$guard22$;',sql.indexOf('CREATE FUNCTION public.usuario_eliminacion_guard_documentos_storage_v1()')));
  assert.equal((guard.match(/o.estado IN \('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION'\)/g)||[]).length,2);
  const f=fixture({retiro:true});
  f.c.window.supabaseClient.auth={getUser:()=>assert.fail('Identificador inválido no consulta sesión ni reserva')};
  return Promise.all([
    assert.rejects(f.service.retirarDocumentoCuenta({cuentaId:'incorrecto',documentoId:id,accion:'reservar',confirmacion:true})),
    assert.rejects(f.service.retirarDocumentoCuenta({cuentaId:another,documentoId:'incorrecto',accion:'reservar',confirmacion:true}))
  ]);
});

test('375K.27 confirmación documental: error mantiene modal abierto, cancelable y sin reenvío por origen',async()=>{
  for(const tipo of ['laboral','cuenta','historico']){
    const f=fixture({retiro:true});let writes=0;
    const buttons={p:{},'[data-cancelar]':{},'[data-confirmar]':{},'[data-cerrar]':{}};
    const events={};const dialog={open:false,setAttribute(){},addEventListener(k,v){events[k]=v},
      querySelector:k=>buttons[k],showModal(){this.open=true},close(){this.open=false;events.close()},remove(){this.removed=true}};
    f.c.document.getElementById=()=>null;f.c.document.querySelector=()=>null;
    f.c.document.createElement=()=>dialog;f.c.document.body={appendChild(){}};
    f.c.window.confirm=()=>assert.fail('No confirm nativo');
    f.c.trabajadoresCargarDocumentos=async()=>{};f.c.cuentaTrabajadorCargarDocumentos=async()=>{};
    f.c.mostrarErrorTrabajador=()=>{};
    f.c.window.TrabajadoresDocumentosService={eliminarDocumento:async()=>{writes++;throw Error('fallo controlado')}};
    f.c.doc={id,cuenta_id:another,nombre_original:'<Documento>.pdf',origen_cuenta_conservada:tipo==='historico'};
    f.c.ficha={id:another};
    f.service.revalidarDocumentoCuenta=async()=>({...f.c.doc,estado_efectivo:'DISPONIBLE',retiro_efectivo:null});
    f.service.retirarDocumentoCuenta=async()=>{writes++;throw Object.assign(Error('Revisa el retiro original'),{operacionId:id})};
    if(tipo==='historico')vm.runInContext('trabajadoresFichaActual=ficha; trabajadoresDocumentosConservados={ficha,actor:"actor",documentos:[doc]}',f.c);
    if(tipo==='cuenta')vm.runInContext('cuentaDocumentalContexto={id:doc.cuenta_id,actor:"actor",version:0,documentos:[doc]}',f.c);
    const op=tipo==='laboral'?f.c.trabajadorEliminarDocumento(id,{dataset:{nombreDocumento:'<Documento>.pdf'}})
      :f.c.cuentaTrabajadorRetirarDocumento(id,false,tipo==='historico');
    await new Promise(setImmediate);assert(dialog.open);
    buttons['[data-confirmar]'].onclick();buttons['[data-confirmar]'].onclick();
    await new Promise(setImmediate);
    assert.equal(writes,1);assert(dialog.open);assert.equal(buttons['[data-confirmar]'].disabled,true);
    assert.equal(buttons['[data-cancelar]'].disabled,false);assert(dialog.innerHTML.includes('role="alert"'));
    assert(buttons.p.textContent.includes('<Documento>.pdf'));
    buttons['[data-confirmar]'].onclick();assert.equal(writes,1);
    buttons['[data-cancelar]'].onclick();await op;assert(dialog.removed);
  }
});

test('375K.27 estilos del modal: centrado, blur, claro/oscuro y anchura móvil existentes',()=>{
  const code=source('views/trabajadores.js');
  assert(!/window\.confirm\s*\(/.test(code));
  assert(code.includes('fixed inset-0 m-auto w-full max-w-md overflow-y-auto rounded-2xl'));
  assert(code.includes('bg-white dark:bg-slate-900'));assert(code.includes('bg-rose-600'));
  const css=readFileSync(new URL('../css/ui-system.css',import.meta.url),'utf8');
  assert.match(css,/#trabajador-estado-dialog::backdrop,[^}]*backdrop-filter: blur\(3px\)/);
  assert.match(css,/#trabajador-estado-dialog\s*\{[^}]*width: calc\(100% - 2rem\)[^}]*max-height: 90vh/);
  assert(readFileSync(new URL('../css/tailwind.css',import.meta.url),'utf8').includes('.overflow-y-auto'));
});


function consumoEtiquetasFixture(tipo,previo=false) {
 const ruta='js/services/'+(tipo==='HISTORIAL'?'historial':'mantenciones')+'.service.js';
 const prefix=process.env.TRABAJADORES_VISTA_RAIZ==='1'?'':'publicacion/';
 let texto=readFileSync(new URL('../'+prefix+ruta,import.meta.url),'utf8');
 // Baseline: reconstruir únicamente la rama cacheada original, sin depender de HEAD ni escribir archivos.
 if(previo)texto=tipo==='HISTORIAL'
  ?texto.replace('return historialEtiquetasEnCurso(this._revisionesCache[clave]);',"return window.UsuariosService.anotarNombresHistoricos('HISTORIAL',this._revisionesCache[clave]);")
  :texto.replace('return mantencionesEtiquetasEnCurso(this._operativasPorElementoCache[id]);',"return window.UsuariosService.anotarNombresHistoricos('MANTENCIONES',this._operativasPorElementoCache[id]);");
 const eventos=[],respuestas=[],invocaciones=[];
 const c=vm.createContext({window:{},state:{currentUser:{id,role:'ADMINISTRADOR',esAdminPermanente:true}},esAdminOperativoActual:()=>true,console});
 c.window.supabaseClient={auth:{getUser:async()=>({data:{user:{id:c.state.currentUser?.id}}}),onAuthStateChange:fn=>eventos.push(fn)},
  from(){throw Error('No se admiten lecturas adicionales de tablas en este escenario de caché');},functions:{invoke:async(nombre,{body})=>{invocaciones.push([nombre,body]);return new Promise(resolve=>respuestas.push(()=>resolve({data:{contrato:'usuario-identidades-historicas/v2',modulo:body.modulo,eliminacion_ejecutada:false,registros_autorizados:body.registros,identidades:body.registros.map(registro_id=>({registro_id,origen_id:registro_id,referencia_id:another,tipo:'cuenta',cuenta_eliminada:true,nombre_snapshot:'Autor original'}))}})));}}};
 vm.runInContext(source('services/usuarios.service.js'),c);vm.runInContext(texto,c);
 const servicio=tipo==='HISTORIAL'?c.window.HistorialService:c.window.MantencionesService;
 const filas=[{id,autor_nombre_snapshot:'Autor original',...(tipo==='HISTORIAL'?{revisado_por:another}:{registrado_por:another})}];
 if(tipo==='HISTORIAL')servicio._revisionesCache[servicio._claveRevisiones('televisor',id,null)]=filas;
 else{servicio._operativasPorElementoCache[id]=filas;servicio._operativasLecturaContexto=JSON.stringify([id,'ADMINISTRADOR',true]);}
 const leer=()=>tipo==='HISTORIAL'?servicio.getRevisiones('televisor',id):servicio.getMantencionesOperativasPorElemento(id);
 return {c,leer,invocaciones,eventos,resolver(){respuestas.splice(0).forEach(fn=>fn());}};
}

test('38I.3 consumo medido: dos lecturas simultáneas del mismo lote pasan de 2 Edge a 1, sin TTL',async()=>{
 for(const tipo of ['HISTORIAL','MANTENCIONES']){
  const metricas=[];
  for(const previo of [true,false]){
   const f=consumoEtiquetasFixture(tipo,previo),a=f.leer(),b=f.leer();await new Promise(setImmediate);
   metricas.push(f.invocaciones.length);assert.equal(f.invocaciones.length,previo?2:1);f.resolver();
   const [r1,r2]=await Promise.all([a,b]);assert.equal(r1[0].autor_nombre_snapshot,'Autor original');assert.equal(r2[0].nombres_historicos.autor_nombre_snapshot,'Autor original (cuenta eliminada)');
   const siguiente=f.leer();await new Promise(setImmediate);assert.equal(f.invocaciones.length,previo?3:2);f.resolver();await siguiente;
   const antes=f.invocaciones.length;for(const fn of f.eventos)fn('TOKEN_REFRESHED',{});await new Promise(setImmediate);assert.equal(f.invocaciones.length,antes);
  }
  console.log('MOCK '+tipo+': paralelas cacheadas antes='+metricas[0]+', después='+metricas[1]+', secuencial nueva=1, evento Auth sin lectura=0');
 }
});

test('38I.3 no comparte entre eventos Auth, usuarios/permisos ni fallos; no inventa etiquetas',async()=>{
 for(const tipo of ['HISTORIAL','MANTENCIONES']){
  const f=consumoEtiquetasFixture(tipo);const a=f.leer();await new Promise(setImmediate);
  for(const fn of f.eventos)fn('SIGNED_IN',{});
  const b=f.leer();await new Promise(setImmediate);assert.equal(f.invocaciones.length,2);f.resolver();await Promise.all([a,b]);
  const p=f.leer();const rechazo=assert.rejects(p,/sesión|permisos/i);await new Promise(setImmediate);f.c.state.currentUser.permissions={modules:[]};f.resolver();await rechazo;
  const renovado=consumoEtiquetasFixture(tipo);renovado.c.state.currentUser.permissions={modules:['a','b'],acciones:true};
  const lectura=renovado.leer();await new Promise(setImmediate);renovado.c.state.currentUser={...renovado.c.state.currentUser,permissions:{acciones:true,modules:['b','a']}};renovado.resolver();await lectura;
  const caida=consumoEtiquetasFixture(tipo);let erroresEdge=0;
  caida.c.window.supabaseClient.functions.invoke=async()=>{erroresEdge++;return {error:true};};
  const fallos=await Promise.allSettled([caida.leer(),caida.leer()]);assert(fallos.every(r=>r.status==='rejected'));assert.equal(erroresEdge,1);
  await assert.rejects(caida.leer(),/etiquetas históricas/);assert.equal(erroresEdge,2);
  let intentos=0;f.c.window.UsuariosService.anotarNombresHistoricos=async()=>{intentos++;throw Error('Permiso denegado');};
  await assert.rejects(f.leer(),/Permiso denegado/);await assert.rejects(f.leer(),/Permiso denegado/);assert.equal(intentos,2);
 }
});


test('38I.3 métricas de entrada, Dashboard, invitación y eliminación explícitas (mocks, no E2E)',async()=>{
 const f=consumoEtiquetasFixture('HISTORIAL');assert.equal(f.invocaciones.length,0);
 for(const fn of f.eventos){fn('INITIAL_SESSION',{});fn('TOKEN_REFRESHED',{});}
 assert.equal(f.invocaciones.length,0);console.log('MOCK carga de servicios + eventos Auth (no login E2E): Edge=0');
 const harness=readFileSync(new URL('../tests/harness_dashboard.js',import.meta.url),'utf8');
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 const d=vm.runInNewContext(harness.slice(0,harness.indexOf('async function probarModalYConteos'))+';preparar();',{require,process,structuredClone,console});
 let dashboardEdge=0;d.c.window.supabaseClient={functions:{invoke:async()=>{dashboardEdge++;throw Error('Edge no prevista');}}};
 await d.c.dashboardCargarResumen(null,()=>true);await d.c.dashboardCargarResumen(null,()=>true);assert.equal(dashboardEdge,0);console.log('MOCK resumen Dashboard, entrada + recarga: Edge=0 (catálogos simulados)');
 const config=readFileSync(new URL('../js/config/supabaseClient.js',import.meta.url),'utf8');
 f.c.window.INVITACIONES_UI_HABILITADA=true;
 f.c.window.supabaseClient.auth.getSession=async()=>({data:{session:{access_token:'sesion-sintetica',user:{id}}}});
 let llamadas=0;f.c.window.supabaseClient.functions.invoke=async(nombre)=>{llamadas++;assert.equal(nombre,'usuario-invitaciones');return {data:{ok:true,estado:'INVITACION_CONFIRMADA',identidad_id:another}};};
 vm.runInContext(config.slice(config.indexOf('window.invocarUsuarioInvitaciones =')),f.c);
 await f.c.window.invocarUsuarioInvitaciones({accion:'INVITAR',email:'fixture@example.invalid'},id);assert.equal(llamadas,1);console.log('MOCK invitación explícita frontend: Edge=1 (sin enviar correo)');
 f.c.window.UsuariosService.getMiEstadoAdministrativo=async()=>({es_admin_permanente:true});
 f.c.window.supabaseClient.functions.invoke=async(nombre)=>{llamadas++;assert.equal(nombre,'usuario-eliminacion-ejecutar');return {data:{resultado:'COMPLETADA',eliminacion_ejecutada:true,operacion_id:id}};};
 const entrada=f.c.window.UsuariosService.construirEntradaEliminacion({usuario:{id:another,nombre:'Objetivo sintético'},operacionId:id,nombre:'Objetivo sintético',motivo:'Motivo sintético',confirmacion:true});
 const r=await f.c.window.UsuariosService.ejecutarEliminacion(entrada,'contraseña-sintetica');assert.equal(r.resultado,'COMPLETADA');assert.equal(llamadas,2);console.log('MOCK ejecución explícita con respuesta confirmada: Edge=1 (sin Auth Delete real)');
});
