import { detalleConfiguracion } from './database-safety.mjs';
import { isExceptionalTarget } from './eliminacion-preparar.mjs';
// Sin cliente privilegiado ni escrituras en este módulo. Dependencias inyectadas.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 256;
const BODY_TIMEOUT_MS = 5000;
// Un trabajo admitido por handler/worker: coincide con max:1 del pool, sin cola local.
const MAX_IN_FLIGHT = 1;
// Diagnóstico TEMPORAL 185.4E: retirar al resolver el fallo. Nunca copiar propiedades del error.
const ETAPAS_DIAGNOSTICO = new Set([
  'CONFIGURACION_DATABASE_URL', 'INICIO_TRANSACCION', 'VERIFICACION_VISIBILIDAD',
  'CONSULTA_ROL_ADMINISTRADOR', 'CONSULTA_DEPENDENCIAS', 'CONSULTA_STORAGE',
  'CONSULTA_REFERENCIAS_FK', 'CONSTRUCCION_RESPUESTA',
]);
const etapasErrores = new WeakMap();
export function errorInspeccionPorEtapa(etapa, causa) {
  const error = new Error('DEPENDENCIAS_NO_VERIFICABLES');
  if (ETAPAS_DIAGNOSTICO.has(etapa)) etapasErrores.set(error, { etapa, detalle: etapa === 'CONFIGURACION_DATABASE_URL' ? detalleConfiguracion(causa) : undefined });
  return error;
}
async function readBody(req) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error('CUERPO_INVALIDO');
  let timer; let abort;
  try {
    const interrupted = new Promise((_, reject) => {
      abort = () => reject(new Error('SOLICITUD_CANCELADA'));
      req.signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => reject(new Error('TIEMPO_CUERPO_AGOTADO')), BODY_TIMEOUT_MS);
      if (req.signal.aborted) abort();
    });
    const reading = (async () => {
      let size = 0; const chunks = [];
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length; if (size > MAX_BODY) throw new Error('CUERPO_INVALIDO');
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return bytes;
    })();
    // Solo lectura HTTP: el finally cancela el stream. Nunca compite con PostgreSQL.
    return await Promise.race([reading, interrupted]);
  } finally {
    clearTimeout(timer);
    req.signal.removeEventListener('abort', abort);
    // cancel() puede depender del transporte: no esperar su promesa indefinidamente.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
const pending = [
  'REAUTENTICACION_DE_SERVIDOR', 'ESQUEMA_FK_TRIGGERS_RLS_COMPLETO',
  'PRESERVACION_SNAPSHOTS_UUID_DOCUMENTOS', 'PROPIEDAD_STORAGE_RESUELTA',
  'CONCURRENCIA_ULTIMO_ADMINISTRADOR', 'SESIONES_Y_DELEGACIONES',
];
export function createHandler({ authenticate, inspect, origins = /** @type {string[]} */ ([]) }) {
  let inFlight = 0;
  return async function handler(req) {
    const origin = req.headers.get('origin');
    const allowed = !origin || origins.includes(origin);
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (origin && allowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    }
    // Incluso errores/métodos rechazados declaran eliminación deshabilitada.
    const reply = (status, body) => new Response(JSON.stringify({
      ...body, puede_eliminar: false, eliminacion_habilitada: false,
    }), { status, headers });
    if (!allowed) return reply(403, { error: 'ORIGEN_NO_PERMITIDO' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return reply(405, { error: 'SOLO_PREVISUALIZACION_POST' });
    if (inFlight >= MAX_IN_FLIGHT) {
      if (req.body) void req.body.cancel().catch(() => {});
      return reply(429, { error: 'PREVISUALIZACION_OCUPADA' });
    }
    inFlight++;
    try {
    if (req.signal.aborted) return reply(499, { error: 'SOLICITUD_CANCELADA' });
    const bearer = req.headers.get('authorization');
    if (!bearer || !/^Bearer [A-Za-z0-9_.-]+$/.test(bearer)) return reply(401, { error: 'SESION_REQUERIDA' });
    let actor;
    try { actor = await authenticate(bearer); }
    catch { return reply(503, { error: 'AUTENTICACION_NO_VERIFICABLE' }); }
    if (!actor) return reply(401, { error: 'SESION_INVALIDA' });
    if (!UUID.test(actor.id) || actor.permanent !== true) return reply(403, { error: 'SOLO_ADMIN_PERMANENTE' });
    if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return reply(415, { error: 'JSON_REQUERIDO' });
    }
    let target;
    try {
      const bytes = await readBody(req);
      const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || !UUID.test(body.usuario_id || '')) throw new Error();
      target = body.usuario_id.toLowerCase();
    } catch (error) {
      if (error.message === 'TIEMPO_CUERPO_AGOTADO') return reply(408, { error: 'TIEMPO_CUERPO_AGOTADO' });
      if (req.signal.aborted) return reply(499, { error: 'SOLICITUD_CANCELADA' });
      return reply(400, { error: 'SOLO_USUARIO_ID_UUID' });
    }
    if (req.signal.aborted) return reply(499, { error: 'SOLICITUD_CANCELADA' });
    let inspeccionCompletada = false;
    try {
      const data = await inspect(actor.id, target);
      inspeccionCompletada = true;
      // Si se desconecta durante SQL, conservar cupo hasta que inspect termine realmente.
      if (req.signal.aborted) return reply(499, { error: 'SOLICITUD_CANCELADA' });
      if (!data.callerPermanent) return reply(403, { error: 'PRIVILEGIO_CAMBIO' });
      const blockers = ['ELIMINACION_NO_IMPLEMENTADA'];
      if (isExceptionalTarget(target) && data.exceptionalEligible !== true) blockers.push('EXCEPCION_NO_ELEGIBLE');
      if (isExceptionalTarget(target) && data.exceptionalGateOpen !== true) blockers.push('COMPUERTA_EXCEPCIONAL_CERRADA');
      if (!data.targetExists) blockers.push('PERFIL_OBJETIVO_AUSENTE');
      if (!data.authExists) blockers.push('CUENTA_AUTH_OBJETIVO_AUSENTE');
      if (actor.id.toLowerCase() === target) blockers.push('CUENTA_PROPIA');
      const last = data.targetPermanent && data.permanentCount <= 1;
      if (last) blockers.push('ULTIMO_ADMIN_PERMANENTE');
      if (data.assignments.mantenciones > 0) blockers.push('ASIGNACIONES_MANTENCIONES');
      if (data.assignments.tareas > 0) blockers.push('ASIGNACIONES_TAREAS');
      if (data.storage.total > 0) blockers.push('OBJETOS_STORAGE_CON_PROPIETARIO');
      return reply(200, {
        contrato: 'usuario-eliminacion-previsualizar/v1', modo: 'solo_lectura',
        eliminacion_habilitada: false, puede_eliminar: false, usuario_id: target,
        comprobado_en: data.checkedAt, perfil_existe: data.targetExists, auth_existe: data.authExists,
        cuenta_propia: actor.id.toLowerCase() === target,
        administrador_permanente: data.targetPermanent, ultimo_administrador_permanente: last,
        administradores_permanentes_habilitados: data.permanentCount,
        asignaciones: data.assignments, storage: data.storage, documentos_conservables: data.documents,
        historial_solicitudes: data.historial_solicitudes,
        // Inventario estructural mínimo: no exponer SQL ni propiedades internas del driver.
        referencias_fk_detectadas: data.references.map(({ esquema, tabla, restriccion }) => ({ esquema, tabla, restriccion })),
        bloqueos: blockers, validacion_integral_completa: false, verificaciones_pendientes: pending,
      });
    } catch (error) {
      // Este bloque solo se alcanza tras Auth + permanente verificados. Sin logs ni excepción original.
      const diagnostico = etapasErrores.get(error);
      const etapa = inspeccionCompletada ? 'RESPUESTA_INVALIDA' : diagnostico?.etapa;
      const detalle = inspeccionCompletada ? undefined : diagnostico?.detalle;
      return reply(503, { error: 'DEPENDENCIAS_NO_VERIFICABLES', eliminacion_habilitada: false, puede_eliminar: false,
        ...(etapa ? { etapa_fallida: etapa } : {}),
        ...(detalle ? { detalle_configuracion: detalle } : {}),
      });
    }
    } finally {
      inFlight--;
    }
  };
}
