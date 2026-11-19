import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leerContratosInstalados } from './contratos-instalados.mjs';
// Metadatos SINTÉTICOS: prueban el formato, no reproducen ni certifican funciones instaladas.
const signatures = {
  usuario_eliminacion_preparar_v1: 'p_objetivo_id uuid, p_nombre_exacto text, p_motivo text, p_confirmacion boolean',
  usuario_eliminacion_registrar_resultado_auth_v1: 'p_operacion_id uuid, p_resultado text, p_error_codigo text',
  usuario_eliminacion_finalizar_v1: 'p_operacion_id uuid',
  usuario_eliminacion_evaluar_recepcion_v1: 'p_objetivo_id uuid',
  es_administrador_permanente_actual: '', mi_estado_administrativo: '',
};
function fixture() {
  return { funciones_no_encontradas: [], relaciones_no_encontradas: [],
    funciones: Object.entries(signatures).map(([nombre, identidad_argumentos]) => ({ esquema: 'public', nombre,
      identidad_argumentos, argumentos: identidad_argumentos, retorno: 'jsonb', propietario: 'postgres',
      security_definer: true, acl: '{postgres=X/postgres}', definicion: '-- TEXTO SINTÉTICO PARA PRUEBA DE FORMATO' })),
    relaciones: ['usuarios_eliminaciones_operaciones', 'del_registro_eliminaciones', 'usuarios'].map(nombre =>
      ({ esquema: 'public', nombre, columnas: [{ nombre: 'id', tipo: 'uuid' }] })) };
}
test('Paso 191: copia de la consulta no se confunde con resultados, sin exponer su contenido', () => {
  const sql = readFileSync(new URL('../docs/sql-propuestas/recuperar_contratos_instalados_solo_lectura.sql', import.meta.url), 'utf8');
  assert.throws(() => leerContratosInstalados(sql), e => e.message === 'CONTRATOS_SQL_FORMATO_INVALIDO');
});
test('Paso 191: celda JSON o fila exportada se aceptan solo para revisión, nunca habilitan eliminación', () => {
  const source = fixture();
  for (const input of [source, [{ contratos_paso189: source }], [{ contratos_paso189: JSON.stringify(source) }]]) {
    const result = leerContratosInstalados(JSON.stringify(input));
    assert.equal(result.revision_semantica_pendiente, true);
    assert.equal(result.conservacion_historica_certificada, false);
    assert.equal(result.puede_eliminar, false); assert.equal(result.eliminacion_habilitada, false);
    result.contratos.funciones.length = 0; assert.equal(source.funciones.length, 6);
  }
});
test('Paso 191: cuerpos ausentes, overloads, nombres o tipos incompatibles bloquean', () => {
  for (const mutate of [s => s.funciones.pop(), s => s.funciones.push({ ...s.funciones[0] }),
    s => s.funciones[0].identidad_argumentos = 'objetivo uuid', s => s.funciones[1].identidad_argumentos += ', otro boolean',
    s => s.funciones[0].definicion = '', s => s.funciones[0].retorno = '']) {
    const source = fixture(); mutate(source); assert.throws(() => leerContratosInstalados(JSON.stringify(source)), /CONTRATOS_SQL_FIRMA_INCOMPATIBLE/);
  }
});
test('Paso 191: permisos ampliados/default, propietario distinto o ausencia de SECURITY DEFINER bloquean', () => {
  for (const change of [{ acl: null }, { acl: '{postgres=X/postgres,authenticated=X/postgres}' },
    { acl: '{postgres=X/postgres,anon=X/postgres}' }, { acl: '{postgres=X/postgres,service_role=X/postgres}' },
    { propietario: 'otro' }, { security_definer: false }]) {
    const source = fixture(); Object.assign(source.funciones[0], change);
    assert.throws(() => leerContratosInstalados(JSON.stringify(source)), /CONTRATOS_SQL_PRIVILEGIOS_NO_ACREDITADOS/);
  }
});
test('Paso 191: relaciones/columnas ausentes o catálogo incompleto no se interpretan como contrato válido', () => {
  for (const mutate of [s => s.funciones_no_encontradas.push('funcion'), s => s.relaciones_no_encontradas.push('tabla'),
    s => s.relaciones.pop(), s => s.relaciones[0].columnas = []]) {
    const source = fixture(); mutate(source); assert.throws(() => leerContratosInstalados(JSON.stringify(source)), /CONTRATOS_SQL_INCOMPLETOS/);
  }
});
test('Paso 191: entrada malformada usa códigos seguros y no refleja errores ni datos originales', () => {
  for (const input of ['secreto-sintetico postgres://privado', '{}', '[]', 'null']) {
    assert.throws(() => leerContratosInstalados(input), e => /^CONTRATOS_SQL_[A-Z_]+$/.test(e.message));
  }
});
