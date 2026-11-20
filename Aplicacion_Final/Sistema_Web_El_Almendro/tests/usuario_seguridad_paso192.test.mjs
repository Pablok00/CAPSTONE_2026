// Inspección estática de SQL e inventario; no ejecuta PostgreSQL ni certifica políticas reales.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createHandler } from '../supabase/functions/usuario-eliminacion-previsualizar/handler.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('docs/sql-propuestas/instalador_historico_inicio_general_recepcion_tecnico.sql');
const pilot = read('docs/sql-propuestas/instalador_historico_piloto_recepcion.sql');
const recovery = read('docs/sql-propuestas/fuente_historica_recuperacion_manual_general.sql');
const clean = sql => sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
test('AF.2: compuerta servidor antes de reauth y nuevamente antes del único DELETE de Auth', () => {
  const edge = read('supabase/functions/usuario-eliminacion-ejecutar/index.ts');
  const firstGate = edge.indexOf('assertExceptionalGate(input.usuario_id');
  assert(firstGate > 0 && firstGate < edge.indexOf('reauth.reauthenticate('));
  const lastGate = edge.indexOf('assertExceptionalGate(persisted.target_id');
  assert(lastGate > edge.indexOf("kind: 'VERIFICAR_INICIO_AUTH'"));
  assert(lastGate < edge.indexOf('admin.auth.admin.deleteUser('));
  assert.equal((edge.match(/admin\.auth\.admin\.deleteUser\(/g) || []).length, 1);
  const adapter = read('supabase/functions/usuario-eliminacion-previsualizar/adaptador-sql-instalado.mjs');
  assert(adapter.indexOf('usuario_eliminacion_compuerta_excepcional_v1') < adapter.indexOf('SELECT public.usuario_eliminacion_iniciar_general_v1'));
});

test('SQL212/215: seis guardas, bloqueo209 antes de filas y ACL cerradas preservan historial', () => {
  for (const text of [pilot, source, recovery]) {
    const sql = clean(text);
    assert(sql.trim().startsWith('BEGIN;'));
    assert(!/\bGRANT\b|\bDELETE\s+FROM|\bTRUNCATE\b|auth\.admin|deleteUser/i.test(sql));
    assert(!/\b(?:UPDATE|INSERT\s+INTO)\s+public\.(solicitudes_reactivas|solicitudes_reactivas_avisos)\b/i.test(sql));
  }
  // SQL212 instala las guardas; SQL215 conserva las de sentencia y reemplaza las de fila.
  assert.equal((pilot.match(/CREATE TRIGGER /g) || []).length, 6);
  for (const [table, event] of [['usuarios', 'UPDATE OR DELETE'], ['solicitudes_reactivas', 'INSERT OR UPDATE OR DELETE'], ['solicitudes_reactivas_avisos', 'INSERT OR UPDATE OR DELETE']]) {
    for (const granularity of ['STATEMENT', 'ROW'])
      assert(clean(pilot).includes('BEFORE ' + event + ' ON public.' + table + ' FOR EACH ' + granularity));
  }
  assert(clean(pilot).includes('pg_advisory_xact_lock_shared(209, 1)'));
  const guard = clean(source.split('AS $guard$')[1].split('$guard$;')[0]);
  assert(guard.includes("current_setting('transaction_isolation') <> 'read committed'"));
  assert(guard.includes("o.estado IN ('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION')"));
  assert(guard.includes('o.actor_id = ANY(v_ids)')); assert(guard.includes('o.objetivo_id = ANY(v_ids)'));
  assert(guard.includes('CUENTA_O_HISTORIAL_EN_ELIMINACION'));
  assert(guard.includes('NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = OLD.id)'));
  for (const sql of [clean(source.split('AS $inicio$')[1].split('$inicio$;')[0]), clean(recovery.split('AS $recuperar$')[1].split('$recuperar$;')[0])]) {
    const lock = sql.indexOf('pg_advisory_xact_lock(209,1)');
    assert(lock >= 0 && lock < sql.indexOf('FOR UPDATE'));
    assert(sql.includes("'read committed'"));
  }
  for (const name of ['piloto_entrada_v1()', 'piloto_guard_v1()'])
    assert(clean(pilot).includes('REVOKE ALL ON FUNCTION public.usuario_eliminacion_' + name));
  assert(clean(source).includes('REVOKE ALL ON FUNCTION public.usuario_eliminacion_iniciar_general_v1(uuid)'));
  assert(clean(recovery).includes('REVOKE ALL ON FUNCTION public.usuario_eliminacion_recuperar_general_v1(uuid,uuid,uuid,text)'));
});

test('SQL215: certificación y consumo único de reauth vinculada preceden al inicio irreversible', () => {
  const body = clean(source.split('AS $inicio$')[1].split('$inicio$;')[0]);
  const update = body.indexOf("SET estado='AUTH_EN_CURSO'");
  assert(update > 0);
  for (const guard of ['OPERACION_NO_INICIABLE', 'SOLO_ADMIN_PERMANENTE', 'PRIVILEGIO_CAMBIO', 'ROL_O_NOMBRE_NO_ADMITIDO',
    'RESERVA_EXISTENTE', 'GUARDAS_NO_ACREDITADAS', 'DEPENDENCIAS_NO_ADMITIDAS', 'COBERTURA_EVALUADOR_CAMBIO',
    'HISTORIAL_CAMBIO', 'REGISTROS_PERSONALES_PENDIENTES', 'PETICION_NO_VINCULADA', 'REAUTENTICACION_NO_ACREDITADA'])
    assert(body.indexOf(guard) >= 0 && body.indexOf(guard) < update, guard);
  for (const field of ['actor_id','target_id','operation_id','request_id','fingerprint','session_id','proof_id','purpose','method','verified_at','expires_at','consumed_at'])
    assert(body.includes("v_reauth->" + (['verified_at','expires_at','consumed_at'].includes(field) ? '' : '>') + "'" + field + "'"), field);
  assert(body.includes("v_reauth->'consumed_at' IS DISTINCT FROM 'null'::jsonb"));
  assert(body.includes("(v_reauth->>'verified_at')::numeric > v_ms"));
  assert(body.includes("(v_reauth->>'expires_at')::numeric <= v_ms"));
  assert(body.includes("(v_reauth->>'expires_at')::numeric - (v_reauth->>'verified_at')::numeric <> 120000"));
  assert(body.includes("pg_catalog.jsonb_build_object('consumed_at',v_ms)"));
  assert(body.includes('intentos_auth=1')); assert(!body.includes('intentos_auth+1'));
  assert(body.includes("WHERE id=v_op.id AND estado='PREPARADA' AND intentos_auth=0"));
  assert(body.includes("'puede_eliminar',false")); assert(body.includes("'eliminacion_habilitada',false"));
});

test('SQL233: recuperación manual verifica ausencia, huellas, reauth original y auditoría sin repetir Auth', () => {
  const body = clean(recovery.split('AS $recuperar$')[1].split('$recuperar$;')[0]);
  for (const guard of ['CONTEXTO_RECUPERACION_NO_ADMITIDO', 'OPERACION_RECUPERACION_NO_VINCULADA',
    'ADMINISTRADOR_ORIGINAL_NO_HABILITADO', 'OTRA_OPERACION_INCOMPATIBLE', 'CERTIFICACION_ORIGINAL_NO_VERIFICABLE',
    'CONTEOS_CERTIFICADOS_INCONSISTENTES', 'VINCULO_ORIGINAL_NO_VERIFICABLE', 'INICIO_ORIGINAL_NO_VERIFICABLE',
    'AUTH_O_PERFIL_TODAVIA_EXISTE', 'AUDITORIA_O_RECUPERACION_PREVIA_INCONSISTENTE', 'GUARDAS_HISTORICAS_NO_ACREDITADAS',
    'HISTORIAL_CERTIFICADO_CAMBIO', 'REFERENCIAS_NO_CUBIERTAS_O_INCONSISTENTES'])
    assert(body.indexOf(guard) >= 0 && body.indexOf(guard) < body.indexOf('SET dependencias_resumen='), guard);
  assert(body.includes('FROM auth.users WHERE id=v_op.objetivo_id'));
  assert(body.includes('FROM public.usuarios WHERE id=v_op.objetivo_id'));
  assert(body.includes("v_s IS DISTINCT FROM v_e->'huellas_solicitudes' OR v_a IS DISTINCT FROM v_e->'huellas_avisos'"));
  // Sustituye nueva reauth del borrador192: la recuperación manual valida el consumo original.
  assert(body.includes("v_op.dependencias_resumen->'paso192'->'reauth'"));
  assert(body.includes("(v_reauth->>'verified_at')::numeric>(v_reauth->>'consumed_at')::numeric"));
  assert(body.includes("(v_reauth->>'consumed_at')::numeric>=(v_reauth->>'expires_at')::numeric"));
  assert(body.includes("usuario_eliminacion_registrar_resultado_auth_v1(v_op.id,'CONFIRMADA',NULL)"));
  assert(body.includes('usuario_eliminacion_finalizar_v1(v_op.id)'));
  assert(body.includes("'ultimo_error_codigo_previo',v_op.ultimo_error_codigo"));
  assert(body.includes("'resultado','YA_COMPLETADA'"));
  assert(body.includes('AUDITORIA_FINAL_NO_VERIFICABLE'));
  assert(body.includes('v_audit.dependencias_resumen IS DISTINCT FROM v_expected_audit'));
  assert(!/intentos_auth\s*=|INSERT INTO public.del_registro|DELETE FROM|deleteUser|auth\.admin|\bEXCEPTION WHEN\b/i.test(body));
  assert(clean(recovery).trim().endsWith('ROLLBACK;'));
});

test('Paso 192: inventario incluye rutas dinámicas como pendientes y SQL de faltantes es solo lectura', () => {
  const inventory = JSON.parse(read('docs/inventario_estatico_rutas_protegidas.json'));
  assert.equal(inventory.cobertura_certificada, false); assert(inventory.rutas.length > 0);
  assert(inventory.rutas.some(r => r.dinamica && r.revision_backend === 'PENDIENTE'));
  assert(inventory.referencias_sql_versionadas.includes('public.solicitudes_reactivas_avisos'));
  const query = read('docs/sql-propuestas/inspeccionar_metadatos_rutas_solo_lectura.sql').replace(/--[^\n]*/g, '').replace(/'(?:''|[^'])*'/g, "''");
  assert.equal(query.split(';').filter(s => s.trim()).length, 1);
  assert(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|CALL|DO)\b/i.test(query));
});
test('Paso 192: manifiesto candidato sigue bloqueado y vinculado a la fuente SQL real', () => {
  const manifest = JSON.parse(read('docs/manifiesto_historico_recepcion_no_acreditado.json'));
  assert.equal(manifest.estado, 'NO_ACREDITADO'); assert.equal(manifest.conservacion_historica_certificada, false);
  assert.equal(manifest.puede_eliminar, false); assert.equal(manifest.eliminacion_habilitada, false);
  assert.equal(manifest.referencias_bloqueadas_por_evaluador.length, 25);
  assert(manifest.referencias_bloqueadas_por_evaluador.every(r => r.tratamiento === 'bloquear_si_existe'));
  const hash = createHash('sha256').update(readFileSync(new URL('../docs/sql-propuestas/captura_historica_contratos_instalados.json', import.meta.url))).digest('hex');
  assert.equal(manifest.fuente_sha256, hash);
  assert(manifest.pendientes.some(r => r?.relacion === 'public.alertas' && r.columna_de_vinculo === null));
});
test('Paso 192: JWT anterior con sesión inválida o perfil no autorizado no accede a inspección', async () => {
  // Auth/RPC simulados: NO es una prueba de RLS del hotel ni de firma/expiración real del JWT.
  for (const actor of [null, { id: '11111111-1111-4111-8111-111111111111', permanent: false }]) {
    let calls = 0;
    const handler = createHandler({ authenticate: async () => actor, inspect: async () => { calls++; } });
    const response = await handler(new Request('http://localhost/preview', { method: 'POST',
      headers: { authorization: 'Bearer token-anterior-sintetico', 'content-type': 'application/json' },
      body: JSON.stringify({ usuario_id: '22222222-2222-4222-8222-222222222222' }) }));
    assert([401,403].includes(response.status)); const body = await response.json();
    assert.equal(body.puede_eliminar, false); assert.equal(body.eliminacion_habilitada, false);
    assert.equal(body.etapa_fallida, undefined); assert.equal(calls, 0);
  }
});
