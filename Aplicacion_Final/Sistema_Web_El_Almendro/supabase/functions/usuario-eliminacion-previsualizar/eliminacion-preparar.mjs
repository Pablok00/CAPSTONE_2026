// Paso 164: validación local preparatoria. No es un endpoint ni un ejecutor de borrado.
// Reutiliza authenticate/inspect mediante inyección de servidor; nunca toma su resultado del body.
// No importa clientes, lee secretos, escribe auditoría ni llama a Auth administrativo.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Política de servidor; nunca se acepta un alcance aportado por el navegador.
export const EXCEPTION_SCOPE = 'DOS_CUENTAS_SIN_ROL_21F13J_V1';
export const isExceptionalTarget = id => [
  '43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4',
  'd642838d-19df-4fd5-994a-77c6b63795ad',
].includes(typeof id === 'string' ? id.toLowerCase() : id);
// Configuración exclusiva de servidor: un solo UUID exacto, nunca booleanos,
// listas, comodines o valores del body. Ausencia/error => cerrada.
/** @param {string} target @param {(name: string) => unknown} [readSetting] */
export function assertExceptionalGate(target, readSetting = () => undefined) {
  if (target === 'fad894e5-0fd5-4637-ad0f-31ffa41dc6cf') throw new Error('CUENTA_PROTEGIDA');
  if (!isExceptionalTarget(target)) return;
  let configured;
  try { configured = readSetting('USUARIO_ELIMINACION_EXCEPCIONAL_UUID'); }
  catch { throw new Error('COMPUERTA_EXCEPCIONAL_CERRADA'); }
  if (!isExceptionalTarget(configured) || configured !== target)
    throw new Error('COMPUERTA_EXCEPCIONAL_CERRADA');
}
export function exceptionalProfile(profile, authExists) {
  return isExceptionalTarget(profile?.id) && profile.estado === true &&
    profile.rol_id === null && profile.trabajador_id === null && authExists === true;
}
// Solo filas leídas desde PostgreSQL con visibilidad completa. No constituye
// una autorización independiente: el adaptador comprueba además petición y actor.
export function assertExceptionalOperation(row) {
  const d = row?.dependencias_resumen;
  const exceptional = isExceptionalTarget(row?.objetivo_id);
  if (!exceptional) {
    if (d?.preparacion_excepcional || d?.alcance_eliminacion === EXCEPTION_SCOPE ||
        d?.paso176_evidencia?.alcance === EXCEPTION_SCOPE) throw new Error('ALCANCE_EXCEPCIONAL_INVALIDO');
    return false;
  }
  const markerValid = m => m?.version === 1 && m.alcance === EXCEPTION_SCOPE &&
    m.objetivo_id === row.objetivo_id && m.actor_id === row.actor_id &&
    m.estado_original === true && m.rol_id_original === null && m.trabajador_id_original === null &&
    m.auth_presente === true && m.nombre_original === row.objetivo_nombre_snapshot;
  if (!markerValid(d?.preparacion_excepcional)) throw new Error('SQL_EXCEPCIONAL_NO_ACREDITADO');
  if (row.estado === 'PREPARADA') {
    if (row.intentos_auth !== 0 || row.auditoria_id !== null ||
        d.conservacion_historica_certificada !== false || d.autorizacion_irreversible_confirmada === true)
      throw new Error('INICIO_EXCEPCIONAL_INVALIDO');
    return true;
  }
  const e = d.paso176_evidencia, evaluation = e?.evaluacion;
  const historical = evaluation?.detalle_otras_referencias;
  const additional = evaluation?.detalle_referencias_adicionales;
  const reauth = d.paso192?.reauth, request = d.paso191;
  if (d.alcance_eliminacion !== EXCEPTION_SCOPE || e?.alcance !== EXCEPTION_SCOPE ||
      e.objetivo_id !== row.objetivo_id || e.rol !== null || !markerValid(e.preparacion_excepcional) ||
      d.conservacion_historica_certificada !== true || d.autorizacion_irreversible_confirmada !== true ||
      row.intentos_auth !== 1 || !UUID.test(request?.attempt_id || '') ||
      evaluation?.objetivo_id !== row.objetivo_id || evaluation.alcance_excepcional !== EXCEPTION_SCOPE ||
      evaluation.apto_preliminar !== true || evaluation.otras_referencias_detectadas !== false ||
      !historical || Object.keys(historical).length !== 25 || Object.values(historical).some(v => v !== false) ||
      evaluation.referencias_adicionales_detectadas !== false ||
      !additional || Object.keys(additional).length !== 4 ||
      !['cuentas_documentos','tareas_pendientes','tareas_pendientes_asignaciones','tareas_pendientes_operaciones']
        .every(k => additional[k] === false) ||
      !UUID.test(reauth?.proof_id || '') || reauth.actor_id !== row.actor_id ||
      reauth.target_id !== row.objetivo_id || reauth.operation_id !== row.id ||
      reauth.request_id !== request.request_id || reauth.fingerprint !== request.fingerprint ||
      !UUID.test(reauth.session_id || '') || reauth.method !== 'password' || reauth.purpose !== 'inicio' ||
      !Number.isFinite(reauth.verified_at) || !Number.isFinite(reauth.expires_at) ||
      !Number.isFinite(reauth.consumed_at) || reauth.consumed_at < reauth.verified_at ||
      reauth.consumed_at >= reauth.expires_at)
    throw new Error('CERTIFICACION_EXCEPCIONAL_INVALIDA');
  return true;
}
export function assertConsumedProof(row, record) {
  if (!isExceptionalTarget(row?.objetivo_id)) return;
  assertExceptionalOperation(row);
  const saved = row.dependencias_resumen.paso192.reauth;
  if (!record || Object.keys(record).filter(k => k !== 'consumed_at').some(k => saved[k] !== record[k]))
    throw new Error('REAUTENTICACION_NO_VINCULADA');
}
const KEYS = ['usuario_id', 'operacion_id', 'nombre_confirmacion', 'motivo', 'confirmacion'];
const unavailable = Object.freeze([
  'EJECUCION_NO_IMPLEMENTADA', 'REAUTENTICACION_SERVIDOR_PENDIENTE',
  'AUDITORIA_DURABLE_Y_RECUPERACION_NO_ACREDITADAS', 'CONCURRENCIA_DISTRIBUIDA_NO_ACREDITADA',
]);
const result = (status, body) => ({ status, ...body,
  puede_eliminar: false, eliminacion_habilitada: false,
  validacion_integral_completa: false, eliminacion_ejecutada: false,
});
export function validInput(input) {
  return input && typeof input === 'object' && !Array.isArray(input) &&
    Object.keys(input).length === KEYS.length && KEYS.every(key => Object.hasOwn(input, key)) &&
    typeof input.usuario_id === 'string' && UUID.test(input.usuario_id) &&
    typeof input.operacion_id === 'string' && UUID.test(input.operacion_id) &&
    typeof input.nombre_confirmacion === 'string' && input.nombre_confirmacion.length > 0 &&
    input.nombre_confirmacion.length <= 1000 && input.confirmacion === true &&
    typeof input.motivo === 'string' && [...input.motivo.trim()].length >= 10 &&
    [...input.motivo.trim()].length <= 1000;
}
const count = value => Number.isSafeInteger(value) && value >= 0;

export function createDeletionPreparation({ authenticate, inspect }) {
  let busy = false;
  return async ({ authorization, input }) => {
    if (busy) return result(429, { error: 'PREPARACION_OCUPADA' });
    busy = true;
    try {
      if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))
        return result(401, { error: 'SESION_REQUERIDA' });
      let actor;
      try { actor = await authenticate(authorization); }
      catch { return result(503, { error: 'AUTENTICACION_NO_VERIFICABLE' }); }
      if (!actor) return result(401, { error: 'SESION_INVALIDA' });
      if (typeof actor.id !== 'string' || !UUID.test(actor.id) || actor.permanent !== true)
        return result(403, { error: 'SOLO_ADMIN_PERMANENTE' });
      if (!validInput(input)) return result(400, { error: 'CONFIRMACION_INVALIDA' });
      const target = input.usuario_id.toLowerCase();
      if (actor.id.toLowerCase() === target) return result(403, { error: 'CUENTA_PROPIA' });
      let data;
      try { data = await inspect(actor.id, target); }
      catch { return result(503, { error: 'DEPENDENCIAS_NO_VERIFICABLES' }); }
      if (data?.callerPermanent !== true) return result(403, { error: 'PRIVILEGIO_CAMBIO' });
      if (data.targetExists === false || data.authExists === false)
        return result(409, { error: 'CUENTA_AUSENTE_O_ESTADO_PARCIAL_NO_REINTENTAR' });
      if (data.targetExists !== true || data.authExists !== true || typeof data.targetPermanent !== 'boolean' ||
          !count(data.permanentCount) || !count(data.assignments?.mantenciones) ||
          !count(data.assignments?.tareas) || !count(data.storage?.total))
        return result(503, { error: 'DEPENDENCIAS_NO_VERIFICABLES' });
      const blockers = [...unavailable];
      if (data.targetPermanent && data.permanentCount <= 1) blockers.push('ULTIMO_ADMIN_PERMANENTE');
      if (data.assignments.mantenciones || data.assignments.tareas) blockers.push('ASIGNACIONES_INCOMPATIBLES');
      if (data.storage.total) blockers.push('OBJETOS_STORAGE_CON_PROPIETARIO');
      // Extensión necesaria de inspect, aún no conectada ni acreditada en SQL real.
      if (typeof data.targetName !== 'string' || !data.targetName.trim()) blockers.push('NOMBRE_SERVIDOR_NO_VERIFICABLE');
      else if (input.nombre_confirmacion !== data.targetName) blockers.push('NOMBRE_NO_COINCIDE');
      // El informe actual es incompleto: ceros y snapshots mencionados no prueban preservación.
      if (data.historicalProtectionVerified !== true) blockers.push('DEPENDENCIAS_HISTORICAS_NO_ACREDITADAS');
      return result(409, { contrato: 'usuario-eliminacion-preparacion/v1',
        modo: 'preparacion_local_sin_ejecucion', operacion_id: input.operacion_id.toLowerCase(),
        usuario_id: target, bloqueos: blockers });
    } finally { busy = false; }
  };
}
