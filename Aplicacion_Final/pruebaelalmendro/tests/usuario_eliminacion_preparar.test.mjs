import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeletionPreparation, EXCEPTION_SCOPE, isExceptionalTarget, exceptionalProfile,
  assertExceptionalOperation, assertConsumedProof, assertExceptionalGate } from '../supabase/functions/usuario-eliminacion-previsualizar/eliminacion-preparar.mjs';
const actor = '11111111-1111-4111-8111-111111111111';
const exceptionalIds = ['43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4', 'd642838d-19df-4fd5-994a-77c6b63795ad'];
test('AF.2: compuerta Edge cerrada por defecto, un UUID exacto y ningún cambio en Técnico/Recepción', () => {
  for (const id of exceptionalIds) {
    assert.throws(() => assertExceptionalGate(id), /CERRADA/);
    assert.throws(() => assertExceptionalGate(id, () => { throw Error('config'); }), /CERRADA/);
    for (const value of ['', 'true', true, '*', exceptionalIds.join(','), ' '+id, id.toUpperCase(),
      exceptionalIds.find(x => x !== id), 'fad894e5-0fd5-4637-ad0f-31ffa41dc6cf'])
      assert.throws(() => assertExceptionalGate(id, () => value), /CERRADA/);
    assert.doesNotThrow(() => assertExceptionalGate(id, name => {
      assert.equal(name, 'USUARIO_ELIMINACION_EXCEPCIONAL_UUID'); return id;
    }));
  }
  assert.doesNotThrow(() => assertExceptionalGate(actor, () => { throw Error('No debe leer configuración para flujo normal'); }));
  assert.throws(() => assertExceptionalGate('fad894e5-0fd5-4637-ad0f-31ffa41dc6cf', () => exceptionalIds[0]), /PROTEGIDA/);
});
function exceptionalRow(id = exceptionalIds[0]) {
  const marker = { version: 1, alcance: EXCEPTION_SCOPE, objetivo_id: id, actor_id: actor,
    estado_original: true, rol_id_original: null, trabajador_id_original: null,
    auth_presente: true, nombre_original: 'Fixture excepcional' };
  return { id: actor, objetivo_id: id, actor_id: actor, objetivo_nombre_snapshot: marker.nombre_original,
    estado: 'PREPARADA', intentos_auth: 0, auditoria_id: null,
    dependencias_resumen: { preparacion_excepcional: marker, conservacion_historica_certificada: false } };
}
function certifyExceptional(row) {
  row.estado = 'AUTH_EN_CURSO'; row.intentos_auth = 1;
  const d = row.dependencias_resumen;
  Object.assign(d, { alcance_eliminacion: EXCEPTION_SCOPE, conservacion_historica_certificada: true,
    autorizacion_irreversible_confirmada: true,
    paso191: { request_id: actor, fingerprint: 'huella-sintetica', attempt_id: actor },
    paso192: { reauth: { proof_id: actor, actor_id: actor, target_id: row.objetivo_id,
      operation_id: row.id, request_id: actor, fingerprint: 'huella-sintetica', session_id: actor,
      verified_at: 1000, consumed_at: 1100, expires_at: 121000, method: 'password', purpose: 'inicio' } },
    paso176_evidencia: { alcance: EXCEPTION_SCOPE, objetivo_id: row.objetivo_id, rol: null,
      preparacion_excepcional: structuredClone(d.preparacion_excepcional),
      evaluacion: { objetivo_id: row.objetivo_id, alcance_excepcional: EXCEPTION_SCOPE,
        apto_preliminar: true, otras_referencias_detectadas: false,
        detalle_otras_referencias: Object.fromEntries(Array.from({ length: 25 }, (_, i) => ['fixture_' + i, false])),
        referencias_adicionales_detectadas: false, detalle_referencias_adicionales: {
          cuentas_documentos: false, tareas_pendientes: false,
          tareas_pendientes_asignaciones: false, tareas_pendientes_operaciones: false } } } });
  return row;
}
test('AE.1: solo los dos UUID y perfiles activos sin rol/ficha son candidatos', () => {
  for (const id of exceptionalIds) {
    assert(isExceptionalTarget(id));
    const profile = { id, estado: true, rol_id: null, trabajador_id: null };
    assert(exceptionalProfile(profile, true));
    for (const delta of [{ estado: false }, { rol_id: actor }, { trabajador_id: actor }])
      assert.equal(exceptionalProfile({ ...profile, ...delta }, true), false);
    assert.equal(exceptionalProfile(profile, false), false);
  }
  assert.equal(isExceptionalTarget(actor), false);
  assert.equal(isExceptionalTarget('fad894e5-0fd5-4637-ad0f-31ffa41dc6cf'), false);
});
test('AE.1: SQL antiguo, marcador alterado y alcance excepcional para tercero son rechazados', () => {
  for (const id of exceptionalIds) {
    assert.equal(assertExceptionalOperation(exceptionalRow(id)), true);
    const old = exceptionalRow(id); delete old.dependencias_resumen.preparacion_excepcional;
    assert.throws(() => assertExceptionalOperation(old), /NO_ACREDITADO/);
  }
  for (const field of ['actor_id','objetivo_id','nombre_original','estado_original','rol_id_original','trabajador_id_original','auth_presente']) {
    const row = exceptionalRow(); row.dependencias_resumen.preparacion_excepcional[field] = 'alterado';
    assert.throws(() => assertExceptionalOperation(row));
  }
  assert.throws(() => assertExceptionalOperation(exceptionalRow(actor)), /ALCANCE_EXCEPCIONAL/);
});
test('AE.1: evidencia durable exige 25+4 controles, intento, alcance y reauth consumida vinculada', () => {
  const valid = certifyExceptional(exceptionalRow());
  assert.equal(assertExceptionalOperation(valid), true);
  const proof = { ...valid.dependencias_resumen.paso192.reauth, consumed_at: null };
  delete proof.operation_id;
  assert.doesNotThrow(() => assertConsumedProof(valid, proof));
  for (const key of ['actor_id','target_id','request_id','fingerprint','session_id','proof_id','purpose'])
    assert.throws(() => assertConsumedProof(valid, { ...proof, [key]: 'ajeno' }));
  for (const mutate of [
    r => r.intentos_auth = 2,
    r => r.dependencias_resumen.paso191.attempt_id = null,
    r => r.dependencias_resumen.paso192.reauth.consumed_at = null,
    r => r.dependencias_resumen.paso192.reauth.consumed_at = 121000,
    r => r.dependencias_resumen.paso176_evidencia.evaluacion.detalle_otras_referencias.fixture_0 = true,
    r => r.dependencias_resumen.paso176_evidencia.evaluacion.detalle_referencias_adicionales.tareas_pendientes = true,
  ]) { const row = structuredClone(valid); mutate(row); assert.throws(() => assertExceptionalOperation(row)); }
  // La evidencia histórica no depende de releer el perfil ni Auth ya eliminados.
  assert.equal(assertExceptionalOperation({ ...valid, estado: 'AUTH_ELIMINADA' }), true);
});
const target = '22222222-2222-4222-8222-222222222222';
const input = () => ({ usuario_id: target, operacion_id: '33333333-3333-4333-8333-333333333333',
  nombre_confirmacion: 'Cuenta sintética', motivo: 'Motivo sintético suficiente', confirmacion: true });
const report = () => ({ callerPermanent: true, targetExists: true, authExists: true,
  targetPermanent: false, permanentCount: 2, targetName: 'Cuenta sintética',
  assignments: { mantenciones: 0, tareas: 0 }, storage: { total: 0 },
  historial_solicitudes: { solicitudes_creadas: 1, avisos_asociados: 1 }, historicalProtectionVerified: true });
function fixture(options = {}) {
  const calls = [];
  const prepare = createDeletionPreparation({
    authenticate: options.authenticate || (async () => ({ id: actor, permanent: true })),
    inspect: async (...args) => { calls.push(args); return options.inspect ? await options.inspect(...args) : report(); },
  });
  return { calls, run: (body = input()) => prepare({ authorization: 'Bearer sesion-sintetica', input: body }) };
}
function disabled(r) {
  for (const key of ['puede_eliminar', 'eliminacion_habilitada', 'validacion_integral_completa', 'eliminacion_ejecutada']) assert.equal(r[key], false);
  assert(!JSON.stringify(r).includes('detalle-privado'));
}
test('permanente pasa validaciones pero ninguna configuración habilita ejecución', async () => {
  const f = fixture(); const r = await f.run(); disabled(r);
  assert.equal(r.status, 409); assert(r.bloqueos.includes('EJECUCION_NO_IMPLEMENTADA'));
  assert.deepEqual(f.calls, [[actor, target]]);
});
test('temporal, Técnico y Recepción no inspeccionan cuentas', async () => {
  for (const role of ['temporal', 'Técnico', 'Recepción']) {
    const f = fixture({ authenticate: async () => ({ id: actor, permanent: false, role }) });
    const r = await f.run(); disabled(r); assert.equal(r.status, 403); assert.equal(f.calls.length, 0);
  }
});
test('autoeliminación y último permanente protegidos', async () => {
  const own = fixture(); const r = await own.run({ ...input(), usuario_id: actor }); disabled(r);
  assert.equal(r.error, 'CUENTA_PROPIA'); assert.equal(own.calls.length, 0);
  const last = await fixture({ inspect: async () => ({ ...report(), targetPermanent: true, permanentCount: 1 }) }).run();
  disabled(last); assert(last.bloqueos.includes('ULTIMO_ADMIN_PERMANENTE'));
});
test('confirmación exacta, motivo 10–1000 caracteres y cuerpo cerrado', async () => {
  for (const changes of [{ motivo: 'corto' }, { motivo: 'x'.repeat(1001) }, { confirmacion: 'true' },
    { confirmacion: false }, { usuario_id: 'mal' }, { operacion_id: 'mal' }, { rol: 'Administrador' }]) {
    const f = fixture(); const r = await f.run({ ...input(), ...changes }); disabled(r);
    assert.equal(r.status, 400); assert.equal(f.calls.length, 0);
  }
  for (const name of ['cuenta sintética', ' Cuenta sintética', 'Cuenta sintética ']) {
    const r = await fixture().run({ ...input(), nombre_confirmacion: name }); disabled(r);
    assert(r.bloqueos.includes('NOMBRE_NO_COINCIDE'));
  }
  for (const size of [10, 1000]) disabled(await fixture().run({ ...input(), motivo: 'x'.repeat(size) }));
});
test('cuenta inexistente o Auth/perfil parcial no significa éxito ni reintento', async () => {
  for (const patch of [{ targetExists: false }, { authExists: false }]) {
    const r = await fixture({ inspect: async () => ({ ...report(), ...patch }) }).run(); disabled(r);
    assert.equal(r.error, 'CUENTA_AUSENTE_O_ESTADO_PARCIAL_NO_REINTENTAR');
  }
});
test('historial con solicitudes y avisos se conserva; protección no acreditada bloquea', async () => {
  const historical = report(); const original = structuredClone(historical);
  const r = await fixture({ inspect: async () => historical }).run(); disabled(r); assert.deepEqual(historical, original);
  const missing = await fixture({ inspect: async () => ({ ...report(), historicalProtectionVerified: undefined, targetName: undefined }) }).run();
  disabled(missing); assert(missing.bloqueos.includes('DEPENDENCIAS_HISTORICAS_NO_ACREDITADAS'));
  assert(missing.bloqueos.includes('NOMBRE_SERVIDOR_NO_VERIFICABLE'));
});
test('Storage y asignaciones bloquean; conteos ausentes nunca se toman como cero', async () => {
  const r = await fixture({ inspect: async () => ({ ...report(), storage: { total: 1 }, assignments: { mantenciones: 1, tareas: 0 } }) }).run();
  disabled(r); assert(r.bloqueos.includes('OBJETOS_STORAGE_CON_PROPIETARIO')); assert(r.bloqueos.includes('ASIGNACIONES_INCOMPATIBLES'));
  const missing = await fixture({ inspect: async () => ({ ...report(), storage: {} }) }).run(); disabled(missing); assert.equal(missing.status, 503);
});
test('fallos Auth/lectura y revocación fallan cerrados sin errores internos', async () => {
  for (const options of [{ authenticate: async () => { throw new Error('detalle-privado'); } },
    { inspect: async () => { throw new Error('detalle-privado'); } }, { authenticate: async () => null },
    { inspect: async () => ({ callerPermanent: false }) }]) disabled(await fixture(options).run());
});
test('auditoría no acreditada bloquea siempre: no existe callback de escritura ni éxito simulado', async () => {
  const r = await fixture().run(); disabled(r);
  assert(r.bloqueos.includes('AUDITORIA_DURABLE_Y_RECUPERACION_NO_ACREDITADAS'));
  assert(r.bloqueos.includes('REAUTENTICACION_SERVIDOR_PENDIENTE'));
});
test('repetición relee, no ejecuta ni inventa idempotencia durable', async () => {
  const f = fixture(); const first = await f.run(); const second = await f.run();
  disabled(first); disabled(second); assert.deepEqual(first, second); assert.equal(f.calls.length, 2);
});
test('concurrencia local acotada y recuperación tras fallo', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; }); let first = true;
  const f = fixture({ inspect: async () => { if (first) { first = false; await gate; throw new Error('detalle-privado'); } return report(); } });
  const pending = f.run(); await new Promise(resolve => setTimeout(resolve, 5));
  const busy = await f.run(); disabled(busy); assert.equal(busy.status, 429);
  release(); disabled(await pending); disabled(await f.run()); assert.equal(f.calls.length, 2);
});
