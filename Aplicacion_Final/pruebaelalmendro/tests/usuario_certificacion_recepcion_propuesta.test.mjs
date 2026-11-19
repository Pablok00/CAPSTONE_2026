// Regresión estática sobre fuentes vigentes; NO ejecuta ni certifica PostgreSQL real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leerContratosInstalados } from './contratos-instalados.mjs';
const read = name => readFileSync(new URL('../docs/sql-propuestas/' + name, import.meta.url), 'utf8');
const source = read('instalador_historico_inicio_general_recepcion_tecnico.sql');
const body = source.split('AS $inicio$')[1]?.split('$inicio$;')[0];
const recovery = read('fuente_historica_recuperacion_manual_general.sql');
const actual = text => text.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');

test('certificación vigente: operación preparada, evaluador JSONB estricto y evidencia por fila antes de autorizar', () => {
  assert(body);
  const sql = actual(body);
  const authorization = sql.indexOf("'conservacion_historica_certificada',true");
  assert(authorization > 0);
  // Sustituye la certificación siempre negativa: ahora solo es positiva TRAS estas guardas.
  for (const guard of [
    "v_actor := auth.uid()", 'public.es_administrador_permanente_actual() IS DISTINCT FROM true',
    'WHERE id = p_operacion_id FOR UPDATE', 'v_op.actor_id IS DISTINCT FROM v_actor',
    "v_actor = v_target OR v_op.estado <> 'PREPARADA'", 'v_op.intentos_auth <> 0',
    'v_op.auditoria_id IS NOT NULL', "IS DISTINCT FROM 'false'::jsonb",
    "NOT IN ('recepcion','recepción','tecnico','técnico')", 'public.es_rol_administrador(u.rol_id) IS FALSE',
    'SELECT public.usuario_eliminacion_evaluar_recepcion_v1(v_target) INTO v_eval;',
    "pg_catalog.jsonb_typeof(v_eval) IS DISTINCT FROM 'object'",
    "v_eval->>'objetivo_id' IS DISTINCT FROM v_target::text", "v_eval->>'nombre' IS DISTINCT FROM v_nombre",
    "v_eval->>'rol' IS DISTINCT FROM v_rol", "v_eval->'cuenta_auth_existe' IS DISTINCT FROM 'true'::jsonb",
    "v_eval->'otras_referencias_detectadas' IS DISTINCT FROM 'false'::jsonb",
    "v_eval->'solicitudes_snapshot_incorrecto' IS DISTINCT FROM '0'::jsonb",
    "v_eval->'objetos_storage' IS DISTINCT FROM '0'::jsonb",
    "v_eval->'mantenciones_asignadas' IS DISTINCT FROM '0'::jsonb",
    "v_eval->'tareas_asignadas' IS DISTINCT FROM '0'::jsonb",
    "v_eval->'solicitudes_creadas' IS DISTINCT FROM pg_catalog.to_jsonb(v_solicitudes)",
    "v_eval->'avisos_asociados' IS DISTINCT FROM pg_catalog.to_jsonb(v_avisos)",
    "pg_catalog.jsonb_typeof(v_eval->'detalle_otras_referencias') IS DISTINCT FROM 'object'",
    'IF v_ref_count <> 25 THEN', 'v_alertas <> 0 OR v_estados <> 0', 'EVIDENCIA_SUPERA_LIMITE',
    'REAUTENTICACION_NO_ACREDITADA',
  ]) assert(sql.indexOf(guard) >= 0 && sql.indexOf(guard) < authorization, guard);
  assert(!/jsonb_agg\(to_jsonb\(e\)\)|v_evals\b|v_num_evals\b|v_catalogo\b|catalogo_observado/.test(sql));
  for (const alias of ['s', 'a']) assert(sql.includes('pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.to_jsonb(' + alias + ")::text,'UTF8'))"));
  for (const field of ["'huellas_solicitudes',v_huellas_s", "'huellas_avisos',v_huellas_a", "'id',s.id,'estado',s.estado", "'paso176_evidencia'", "'evaluacion',v_eval"])
    assert(sql.includes(field), field);
  // El evaluador real versionado conserva la comparación de snapshot, sin reescribirlo.
  const contracts = leerContratosInstalados(read('captura_historica_contratos_instalados.json')).contratos;
  const evaluator = contracts.funciones.find(f => f.nombre === 'usuario_eliminacion_evaluar_recepcion_v1').definicion;
  assert(/creador_nombre_snapshot\s+IS DISTINCT FROM v_nombre/.test(evaluator), 'snapshot comparado exactamente con el nombre original');
  assert(/btrim\(s\.creador_nombre_snapshot\)/.test(evaluator), 'snapshot vacío también bloqueado');
  // Revalidación independiente posterior: igualdad de conteos no sustituye huellas.
  const restore = actual(recovery);
  assert(restore.includes("v_s IS DISTINCT FROM v_e->'huellas_solicitudes' OR v_a IS DISTINCT FROM v_e->'huellas_avisos'"));
  assert(restore.includes('HISTORIAL_CERTIFICADO_CAMBIO'));
});

test('fuentes vigentes: sin borrado histórico/Auth ni permisos abiertos; evidencia y transiciones acotadas', () => {
  for (const text of [source, recovery]) {
    const sql = actual(text);
    assert(!/\b(?:DELETE\s+FROM|INSERT\s+INTO|TRUNCATE|GRANT\b)|auth\.admin|deleteUser/i.test(sql));
    assert(!/\bUPDATE\s+public\.(?:solicitudes_reactivas|solicitudes_reactivas_avisos|prevencion_documentos|trabajadores_documentos)\b/i.test(sql));
    assert(!/SET\s+creador_nombre_snapshot\s*=|intentos_auth\s*=\s*intentos_auth\s*\+/i.test(sql));
    assert(sql.includes('FROM PUBLIC, anon, authenticated, service_role'));
  }
  const sql = actual(body);
  assert.equal((sql.match(/UPDATE public\.usuarios_eliminaciones_operaciones /g) || []).length, 1);
  assert(sql.includes("WHERE id=v_op.id AND estado='PREPARADA' AND intentos_auth=0"));
  assert(sql.includes("SET estado='AUTH_EN_CURSO', intentos_auth=1"));
  assert(sql.includes("UPDATE public.usuarios SET estado = false WHERE id = v_target AND estado IS TRUE"));
  // Estado/perfil sí cambian en el inicio vigente; nunca se modifican las solicitudes/avisos.
  assert(sql.includes("'puede_eliminar',false")); assert(sql.includes("'eliminacion_habilitada',false"));
  assert(actual(recovery).trim().endsWith('ROLLBACK;'));
  assert.match(source, /REVOKE ALL ON FUNCTION public\.usuario_eliminacion_iniciar_general_v1\(uuid\)/);
  assert.match(recovery, /REVOKE ALL ON FUNCTION public\.usuario_eliminacion_recuperar_general_v1\(uuid,uuid,uuid,text\)/);
});
