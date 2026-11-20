import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { capturarEvidenciaHistorica, compararEvidenciaHistorica } from './conservacion-historica.mjs';
// Manifiesto SINTÉTICO, no describe ni certifica el esquema instalado del hotel.
const manifest = ['solicitudes', 'avisos', 'eventos', 'documentos', 'archivos', 'auditorias'].map(name =>
  ({ name, key: ['id'], action: 'conservar' })).concat(['alertas', 'avisos_estado'].map(name =>
    ({ name, key: ['id'], action: 'bloquear_si_existe' })));
const binding = { actorId: '11111111-1111-4111-8111-111111111111', targetId: '22222222-2222-4222-8222-222222222222',
  operationId: '33333333-3333-4333-8333-333333333333', manifestVersion: 'fixture-p189/v1', previewAt: 100000, now: 100000 };
function fixture() {
  const categories = Object.fromEntries(manifest.map(rule => [rule.name, { complete: true, count: 0, rows: [] }]));
  categories.solicitudes.rows = [{ id: 'solicitud-sintetica', creada_por: binding.targetId, creador_nombre_snapshot: 'Pablo Gamboa',
    estado: 'pendiente', descripcion: 'Contenido sintético', created_at: 'fecha-1', updated_at: 'fecha-1' }];
  categories.avisos.rows = [{ id: 'aviso-sintetico', solicitud_id: 'solicitud-sintetica', visto_en: null, pospuesto_en: null }];
  categories.auditorias.rows = [{ id: 'auditoria-previa', nombre_snapshot: 'Nombre histórico' }];
  Object.values(categories).forEach(category => category.count = category.rows.length);
  return categories;
}
const capture = categories => capturarEvidenciaHistorica({ ...binding, manifest, categories });
const compare = (proof, categories, override = {}) => compararEvidenciaHistorica(proof, { ...binding, categories, ...override });

test('Paso 189: consulta de recuperación solo inspecciona definiciones y no invoca funciones de negocio', () => {
  const sql = readFileSync(new URL('../docs/sql-propuestas/recuperar_contratos_instalados_solo_lectura.sql', import.meta.url), 'utf8')
    .replace(/--[^\n]*/g, '');
  const statements = sql.replace(/'(?:''|[^'])*'/g, "''");
  assert.equal(statements.split(';').filter(part => part.trim()).length, 1);
  assert(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|CALL|DO)\b/i.test(statements));
  for (const name of ['preparar', 'registrar_resultado_auth', 'finalizar', 'evaluar_recepcion'])
    assert(sql.includes("'usuario_eliminacion_" + name + "_v1'"));
  assert(sql.includes('pg_catalog.pg_get_functiondef')); assert(!sql.includes('pg_authid'));
});

test('Paso 189: preservación exacta de pendiente/aviso/snapshot, sin emitir certificación ni datos', () => {
  const rows = fixture(); const before = structuredClone(rows); const proof = capture(rows);
  assert.deepEqual(compare(proof, rows), { comparacion_coincide: true, conservacion_historica_certificada: false,
    puede_eliminar: false, eliminacion_habilitada: false });
  assert.deepEqual(rows, before); assert.equal(JSON.stringify(proof), '{}');
});

test('Paso 189: rechaza cambios de estado, UUID, fechas, contenido, snapshot o aviso, aun con iguales conteos', () => {
  for (const mutate of [rows => rows.solicitudes.rows[0].estado = 'aprobada', rows => rows.solicitudes.rows[0].creada_por = null,
    rows => rows.solicitudes.rows[0].updated_at = 'otra-fecha', rows => rows.solicitudes.rows[0].descripcion = 'otro contenido',
    rows => rows.solicitudes.rows[0].creador_nombre_snapshot = '', rows => rows.avisos.rows[0].solicitud_id = 'otro-id',
    rows => rows.auditorias.rows[0].nombre_snapshot = 'otro nombre']) {
    const rows = fixture(); const proof = capture(rows); mutate(rows);
    assert.throws(() => compare(proof, rows), /EVIDENCIA_HISTORICA_NO_VERIFICABLE/);
  }
});

test('Paso 189: filas incompletas, desconocidas, faltantes, duplicadas o sin identidad bloquean', () => {
  for (const mutate of [r => r.solicitudes.complete = false, r => r.solicitudes.count++, r => delete r.avisos,
    r => r.desconocida = { complete: true, count: 0, rows: [] },
    r => { r.solicitudes.rows.push({ ...r.solicitudes.rows[0] }); r.solicitudes.count++; },
    r => delete r.solicitudes.rows[0].id, r => r.solicitudes.rows[0].estado = undefined]) {
    const rows = fixture(); mutate(rows); assert.throws(() => capture(rows), /EVIDENCIA_HISTORICA_NO_VERIFICABLE/);
  }
});

test('Paso 189: alertas/estados de aviso no aprobados bloquean si aparecen, incluso tras baseline', () => {
  for (const name of ['alertas', 'avisos_estado']) {
    const rows = fixture(); const proof = capture(rows);
    rows[name] = { complete: true, count: 1, rows: [{ id: 'registro-sintetico' }] };
    assert.throws(() => capture(rows), /EVIDENCIA_HISTORICA_NO_VERIFICABLE/);
    assert.throws(() => compare(proof, rows), /EVIDENCIA_HISTORICA_NO_VERIFICABLE/);
  }
});

test('Paso 189: prueba local no puede transportarse como JSON, cambiar vínculo ni reutilizar preview vencido', () => {
  const rows = fixture(); const proof = capture(rows);
  for (const candidate of [{}, JSON.parse(JSON.stringify(proof))]) assert.throws(() => compare(candidate, rows));
  for (const change of [{ operationId: binding.targetId }, { actorId: binding.targetId }, { manifestVersion: 'otra' },
    { now: 160001 }, { now: 99999 }]) assert.throws(() => compare(proof, rows, change));
  assert.throws(() => capturarEvidenciaHistorica({ ...binding, previewAt: 0, manifest, categories: rows }));
});

test('Paso 189: orden de filas no altera evidencia; una adición sí', () => {
  const rows = fixture(); rows.solicitudes.rows.push({ ...rows.solicitudes.rows[0], id: 'segunda' }); rows.solicitudes.count++;
  const proof = capture(rows); rows.solicitudes.rows.reverse(); assert.equal(compare(proof, rows).comparacion_coincide, true);
  rows.solicitudes.rows.push({ ...rows.solicitudes.rows[0], id: 'tercera' }); rows.solicitudes.count++;
  assert.throws(() => compare(proof, rows));
});
