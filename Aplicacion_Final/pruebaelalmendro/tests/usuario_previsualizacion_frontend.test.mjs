import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHandler } from '../supabase/functions/usuario-eliminacion-previsualizar/handler.mjs';
import { validInput } from '../supabase/functions/usuario-eliminacion-previsualizar/eliminacion-preparar.mjs';
const actor = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
const source = readFileSync(new URL('../publicacion/js/services/usuarios.service.js', import.meta.url), 'utf8');
async function report() {
  const handler = createHandler({ authenticate: async () => ({ id: actor, permanent: true }), inspect: async () => ({
    callerPermanent: true, targetExists: true, authExists: true, targetPermanent: false, permanentCount: 2,
    checkedAt: '2026-11-02T12:00:00Z', assignments: { mantenciones: 0, tareas: 0, alcance: 'todas_las_filas_sin_inferir_vigencia' },
    storage: { total: 0, por_owner_id: 0, por_owner: 0, total_sin_duplicar: true },
    documents: { prevencion: 0, trabajadores: 0, accion: 'conservar_sin_modificar' },
    historial_solicitudes: { solicitudes_creadas: 1, avisos_asociados: 1, accion: 'conservar_sin_modificar' }, references: [],
  }) });
  return await (await handler(new Request('http://localhost/preview', { method: 'POST',
    headers: { authorization: 'Bearer sesion-sintetica', 'content-type': 'application/json' }, body: JSON.stringify({ usuario_id: target }) }))).json();
}
function fixture(data, options = {}) {
  const calls = []; let authCalls = 0;
  const context = vm.createContext({ window: { supabaseClient: {
    auth: { getUser: async () => { authCalls++; return { data: { user: { id: options.switchUser && authCalls > 1 ? target : actor } }, error: options.authError || null }; } },
    functions: { invoke: async (...args) => { calls.push(args); return { data, error: options.error || null }; } },
  } } });
  vm.runInContext(source, context);
  context.window.UsuariosService.getMiEstadoAdministrativo = async force => {
    assert.equal(force, true); return { es_admin_permanente: options.permanent !== false };
  };
  return { calls, service: context.window.UsuariosService };
}

test('AE.2: listado administrativo incluye solo los dos pendientes excepcionales elegibles sin exigir correo verificado', async () => {
  const rows = ['43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4','d642838d-19df-4fd5-994a-77c6b63795ad',target]
    .map(id => ({ id, nombre: 'Fixture', estado: true, rol_id: null, trabajador_id: null }));
  const f = fixture(null);
  f.service.getCorreosVerificados = async () => new Set();
  let columns;
  f.service._usuariosCache = null;
  // Lectura simulada de public.usuarios; nunca conexión real.
  const client = { from: () => ({ select: cols => { columns = cols; return {
    order() { return this; }, then(resolve) { resolve({ data: rows, error: null }); }
  }; } }) };
  const context = vm.createContext({ window: { supabaseClient: client } }); vm.runInContext(source, context);
  const service = context.window.UsuariosService; service.getCorreosVerificados = async () => new Set();
  assert.deepEqual(Array.from(await service.getUsuarios(true), u => u.id), rows.slice(0, 2).map(u => u.id));
  assert(columns.includes('trabajador_id'));
  rows[0].trabajador_id = actor; rows[1].estado = false;
  assert.equal((await service.getUsuarios(true)).length, 0);
});

test('AE.2: render y filtro Pendientes limitan acción por UUID, perfil y administrador permanente', () => {
  const view = readFileSync(new URL('../publicacion/js/views/admin.js', import.meta.url), 'utf8');
  let permanent = true;
  const c = vm.createContext({ window: {}, state: { currentUser: { id: actor } },
    adminSearchQuery: '', adminRoleFilter: 'PENDIENTES', ADMIN_FILTRO_PENDIENTES: 'PENDIENTES',
    adminAccesoVigente: () => permanent, adminNombreVisible: u => u.nombre,
    adminRolClaveUI: u => u.roles?.nombre || '', adminRolBadgeClasses: () => '',
    adminIniciales: () => 'F', adminEscapeHTML: s => String(s),
    adminDelegacionVigentePara: () => null, adminDelegacionProgramadaPara: () => null,
    adminDelegacionesCerradasPara: () => 0 });
  vm.runInContext(source, c);
  for (const name of ['adminEsPendiente','adminNombreRolNormalizado','adminObjetivoEliminacionPermitido','getAdminFilasHTML'])
    vm.runInContext(view.match(new RegExp('function ' + name + '\\([^]*?\\n}'))[0], c);
  const users = ['43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4','d642838d-19df-4fd5-994a-77c6b63795ad',target]
    .map(id => ({ id, nombre: 'Fixture', estado: true, rol_id: null, trabajador_id: null, correo_verificado: false }));
  const html = c.getAdminFilasHTML(users);
  assert.equal((html.match(/Eliminar cuenta de prueba/g) || []).length, 2);
  assert(!html.includes(target));
  c.adminRoleFilter = 'ALL';
  for (const name of ['Técnico','Recepción']) {
    const normal = { ...users[2], rol_id: actor, roles: { nombre: name } };
    assert(c.getAdminFilasHTML([normal]).includes('Eliminar cuenta'));
    assert(c.adminObjetivoEliminacionPermitido(normal));
  }
  for (const delta of [{ estado: false }, { rol_id: actor, roles: { nombre: 'Técnico' } }, { trabajador_id: actor }])
    assert(!c.getAdminFilasHTML([{ ...users[0], ...delta }]).includes('Eliminar cuenta'));
  assert(!c.adminObjetivoEliminacionPermitido({ ...users[2], id: 'fad894e5-0fd5-4637-ad0f-31ffa41dc6cf', rol_id: actor, roles: { nombre: 'Técnico' } }));
  permanent = false;
  assert.equal(c.getAdminFilasHTML(users), '');
});

test('AE.2: backend excepcional no confirmado muestra instalación pendiente sin éxito ni reenvío automático', async () => {
  for (const code of ['SQL_EXCEPCIONAL_NO_ACREDITADO','OPERACION_NO_VERIFICABLE','REQUIERE_REVISION']) {
    const f = fixture({ error: code });
    const body = f.service.construirEntradaEliminacion({ usuario: { id: '43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4', nombre: 'Fixture' },
      operacionId: target, nombre: 'Fixture', motivo: 'Motivo de prueba suficiente', confirmacion: true });
    await assert.rejects(f.service.ejecutarEliminacion(body, 'password-sintetica'), e =>
      /revisión manual/i.test(e.message) && (code === 'REQUIERE_REVISION' || /SQL excepcionales/.test(e.message)));
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0][1].body.password, '');
    assert.equal(body.operacion_id, target);
    assert.deepEqual(Object.keys(body).sort(), ['confirmacion','motivo','nombre_confirmacion','operacion_id','usuario_id']);
  }
});
test('AF.2: cierre explícito muestra mensaje seguro sin reenvío ni contraseña persistida', async () => {
  const f = fixture({ error: 'COMPUERTA_EXCEPCIONAL_CERRADA' });
  const body = f.service.construirEntradaEliminacion({ usuario: { id: '43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4', nombre: 'Fixture' },
    operacionId: target, nombre: 'Fixture', motivo: 'Motivo de prueba suficiente', confirmacion: true });
  await assert.rejects(f.service.ejecutarEliminacion(body, 'password-sintetica'), /compuerta.*cerrada/i);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][1].body.password, '');
});

test('AE.2: actualización previa al envío bloquea cambios de perfil y dependencias nuevas sin invocar ejecución', async () => {
  const view = readFileSync(new URL('../publicacion/js/views/admin.js', import.meta.url), 'utf8');
  const start = view.indexOf('async function adminEnviarGestion(e)');
  const code = view.slice(start, view.indexOf('// ==========================================================', start));
  const user = { id: '43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4', nombre: 'Fixture', estado: true, rol_id: null, trabajador_id: null };
  for (const change of [{ estado: false }, { rol_id: actor }, { trabajador_id: actor }, { nombre: 'Otro' }, { dependencia: true }]) {
    let executions = 0, previews = 0;
    const elements = { 'ag-error': { textContent: '' }, 'ag-password': { value: 'password-sintetica' },
      'admin-gestion-dialog': { querySelectorAll: () => [] } };
    const g = { operacion: 'ELIMINAR_UI', contexto: { usuario: user }, actor, ocupada: false, bloqueada: false };
    const c = vm.createContext({ window: { UsuariosService: {} }, state: { currentUser: { id: actor } }, adminGestion: g,
      adminAccesoVigente: () => true, adminValidarEliminacionUI: () => true, adminPuedeEnviarEliminacion: () => true,
      document: { getElementById: id => elements[id] },
      adminCargarDependenciasEliminacion: async () => { previews++; g.previsualizacionEliminacion = { estado: 'lista', sinBloqueos: !change.dependencia }; } });
    vm.runInContext(source, c);
    c.window.UsuariosService.getContextoGestion = async () => ({ usuario: { ...user, ...change } });
    c.window.UsuariosService.ejecutarEliminacion = async () => { executions++; throw Error('No debe llegar'); };
    vm.runInContext(view.match(/function adminObjetivoEliminacionPermitido\([^]*?\n}/)[0] + '\n' + code, c);
    await c.adminEnviarGestion({ preventDefault() {} });
    await c.adminEnviarGestion({ preventDefault() {} });
    assert.equal(executions, 0); assert.equal(g.bloqueada, true); assert.equal(elements['ag-password'].value, '');
    assert.equal(previews, change.dependencia ? 1 : 0);
  }
});
test('Paso 189: entrada local reutiliza contrato del coordinador sin solicitudes ni secretos', () => {
  const f = fixture(null);
  const input = { usuario: { id: target, nombre: 'Pablo Gamboa' }, operacionId: actor,
    nombre: 'Pablo Gamboa', motivo: '  Motivo de prueba local  ', confirmacion: true };
  const body = f.service.construirEntradaEliminacion(input);
  assert.equal(validInput(body), true); assert.equal(Object.isFrozen(body), true);
  assert.equal(body.motivo, 'Motivo de prueba local'); assert.equal(f.calls.length, 0);
  for (const change of [{ nombre: 'Pablo Gamboa ' }, { motivo: 'corto' }, { confirmacion: false }, { operacionId: 'invalido' }])
    assert.throws(() => f.service.construirEntradaEliminacion({ ...input, ...change }));
  assert.equal(f.calls.length, 0);
});

test('contrato real del handler con datos simulados: invoca solo lectura por UUID sin headers privilegiados', async () => {
  const data = await report(); const f = fixture(data);
  const actual = await f.service.previsualizarEliminacion(target);
  assert.equal(actual.historial_solicitudes.solicitudes_creadas, 1);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], 'usuario-eliminacion-previsualizar');
  assert.equal(JSON.stringify(f.calls[0][1]), JSON.stringify({ body: { usuario_id: target } }));
  assert.equal(actual.puede_eliminar, false);
});
test('errores de función, sesión o cuenta cambiada fallan sin exponer detalles', async () => {
  for (const options of [{ error: { message: 'detalle privado' } }, { authError: new Error('detalle privado') }, { switchUser: true }]) {
    const f = fixture(await report(), options);
    await assert.rejects(f.service.previsualizarEliminacion(target), error => error.message === 'No fue posible consultar las dependencias');
  }
});
test('temporales/no permanentes no invocan la Edge Function', async () => {
  const f = fixture(await report(), { permanent: false });
  await assert.rejects(f.service.previsualizarEliminacion(target)); assert.equal(f.calls.length, 0);
});
test('respuesta incompleta o de otro objetivo nunca se convierte en cero', async () => {
  const original = await report();
  for (const change of [d => { delete d.historial_solicitudes; }, d => { delete d.storage.total; },
    d => { d.documentos_conservables.prevencion = null; }, d => { d.asignaciones.mantenciones = '0'; },
    d => { d.usuario_id = actor; }, d => { d.comprobado_en = 'fecha inválida'; },
    d => { d.bloqueos = []; }, d => { d.storage.por_owner_id = 1; }, d => { d.eliminacion_habilitada = true; }]) {
    const data = structuredClone(original); change(data);
    await assert.rejects(fixture(data).service.previsualizarEliminacion(target), e => e.codigo === 'PREVISUALIZACION_INCOMPLETA');
  }
});
test('UUID inválido no inicia consulta ni intento destructivo', async () => {
  const f = fixture(await report()); await assert.rejects(f.service.previsualizarEliminacion('incorrecto'));
  assert.equal(f.calls.length, 0);
});

test('Paso 219: contrato de ejecución exige confirmación doble de éxito, sin reintentos ni secretos persistidos', async () => {
  const input = { usuario: { id: target, nombre: 'Cuenta de prueba' }, operacionId: actor,
    nombre: 'Cuenta de prueba', motivo: 'Motivo válido de prueba', confirmacion: true };
  for (const response of [
    { resultado: 'COMPLETADA', eliminacion_ejecutada: true, eliminacion_habilitada: false, operacion_id: target },
    { resultado: 'COMPLETADA', eliminacion_ejecutada: false },
    { error: 'REQUIERE_REVISION' }, { error: 'ELIMINACION_REAL_DESHABILITADA' },
  ]) {
    const f = fixture(response);
    const body = f.service.construirEntradaEliminacion(input);
    const execution = f.service.ejecutarEliminacion(body, 'contraseña-sintetica');
    if (response.eliminacion_ejecutada === true) assert.equal((await execution).resultado, 'COMPLETADA');
    else await assert.rejects(execution);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], 'usuario-eliminacion-ejecutar');
    const sent = f.calls[0][1].body;
    const { password, ...operation } = sent;
    assert.equal(validInput(operation), true);
    assert.equal(password, ''); // La referencia al cuerpo se limpia al terminar, sin guardar en entrada.
    assert(!Object.hasOwn(body, 'password'));
  }
});

test('Paso 364: formulario mantiene el cierre local y no envía ni declara éxito', async () => {
  const source = readFileSync(new URL('../publicacion/js/views/admin.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function adminEnviarGestion(e)');
  const end = source.indexOf('// ==========================================================', start);
  const f = fixture(null);
  const user = { id: target, nombre: 'Cuenta de prueba', rol_id: actor, roles: { nombre: 'Recepción' } };
  const elements = { 'ag-error': { textContent: '' }, 'ag-password': { value: 'contraseña-sintetica' },
    'ag-nombre-exacto': { value: user.nombre }, 'ag-motivo': { value: 'Motivo válido de prueba' },
    'ag-confirmar': { checked: true }, 'admin-gestion-dialog': { isConnected: true, querySelectorAll: () => [] } };
  const g = { operacion: 'ELIMINAR_UI', contexto: { usuario: user }, actor, ocupada: false, bloqueada: false,
    previsualizacionEliminacion: { estado: 'lista', usuarioId: target, sinBloqueos: true } };
  let calls = 0, toast = 0;
  const service = { construirEntradaEliminacion: f.service.construirEntradaEliminacion,
    getContextoGestion: async () => ({ usuario: user }),
    ejecutarEliminacion: async (input, password) => {
      calls++; assert.equal(validInput(input), true); assert.equal(password, 'contraseña-sintetica');
      const error = new Error('Revisión manual necesaria.'); error.codigo = 'REQUIERE_REVISION'; throw error;
    } };
  const context = vm.createContext({ adminGestion: g, state: { currentUser: { id: actor } }, adminAccesoVigente: () => true,
    adminValidarEliminacionUI: () => true, adminMostrarToast: () => toast++,
    adminCargarDependenciasEliminacion: async () => {},
    window: { UsuariosService: service, crypto: { randomUUID: () => actor } },
    document: { getElementById: id => elements[id] } });
  vm.runInContext([
    source.match(/const ADMIN_ELIMINACION_HABILITADA = (?:true|false);/)[0],
    source.match(/function adminNombreRolNormalizado\([^]*?\n}/)[0],
    source.match(/function adminObjetivoEliminacionPermitido\([^]*?\n}/)[0],
    source.match(/function adminPuedeEnviarEliminacion\([^]*?\n}/)[0],
    source.slice(start, end),
  ].join('\n'), context);
  await context.adminEnviarGestion({ preventDefault() {} });
  await context.adminEnviarGestion({ preventDefault() {} });
  assert.equal(calls, 0); assert.equal(toast, 0); assert.equal(g.bloqueada, false);
  assert.equal(g.solicitud, undefined);
  assert.match(source, /id="ag-enviar"[^\n]*disabled/);
});
