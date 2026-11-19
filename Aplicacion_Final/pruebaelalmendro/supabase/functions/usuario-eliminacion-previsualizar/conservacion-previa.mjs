// DEL-FIX-21. Evidencia previa de servidor; nunca es autorización de Auth Delete.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
export const CONSERVATION_CATEGORIES = Object.freeze([
  'identidad', 'documentos', 'storage', 'trabajos', 'auditorias', 'delegaciones', 'operativas', 'contratos',
]);
const error = code => { throw new Error(code); };
function canonical(value) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return error('CERTIFICADO_FORMATO_INVALIDO');
}
async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function binding(row) {
  const b = { operacion_id: row?.id, actor_id: row?.actor_id, objetivo_id: row?.objetivo_id,
    request_id: row?.dependencias_resumen?.paso191?.request_id,
    fingerprint: row?.dependencias_resumen?.paso191?.fingerprint };
  if (![b.operacion_id, b.actor_id, b.objetivo_id, b.request_id].every(x => UUID.test(x || '')) ||
      !SHA.test(b.fingerprint || '') || b.actor_id === b.objetivo_id || row.estado !== 'PREPARADA' || row.intentos_auth !== 0)
    error('CERTIFICADO_OPERACION_INVALIDA');
  return b;
}
function validate(snapshot, b) {
  if (!snapshot || Object.keys(snapshot).sort().join(',') !==
      'archivos_verificados,auth_presente,catalogo_sha256,categorias,delegaciones_cerradas,documentos_integros,fk_preservadas,identidad_integra,ledger_laboral,propiedad_neutralizada,propietarios_originales,version,vinculo' ||
      snapshot.version !== 1 || canonical(snapshot.vinculo) !== canonical(b) ||
      snapshot.identidad_integra !== true || snapshot.documentos_integros !== true || snapshot.fk_preservadas !== true || snapshot.auth_presente !== true ||
      snapshot.delegaciones_cerradas !== true || !snapshot.ledger_laboral ||
      Object.getPrototypeOf(snapshot.ledger_laboral) !== Object.prototype ||
      Object.keys(snapshot.ledger_laboral).length === 0 || !SHA.test(snapshot.catalogo_sha256 || '') ||
      snapshot.archivos_verificados !== false || snapshot.propiedad_neutralizada !== false ||
      !Array.isArray(snapshot.propietarios_originales) || snapshot.propietarios_originales.length > 10000 ||
      !snapshot.categorias || Object.keys(snapshot.categorias).length !== CONSERVATION_CATEGORIES.length)
    error('CERTIFICADO_EVIDENCIA_INCOMPLETA');
  for (const key of CONSERVATION_CATEGORIES) {
    const c = snapshot.categorias[key];
    if (!c || Object.keys(c).sort().join(',') !== 'filas,sha256' ||
        !Number.isSafeInteger(c.filas) || c.filas < 0 || !SHA.test(c.sha256 || ''))
      error('CERTIFICADO_EVIDENCIA_INCOMPLETA');
  }
  const ledger = snapshot.ledger_laboral;
  if (Object.keys(ledger).sort().join(',') !== 'eventos,sha256,trabajador_actual,usuario_id,version' ||
      ledger.version !== 1 || ledger.usuario_id !== b.objetivo_id || !SHA.test(ledger.sha256 || '') ||
      !Number.isSafeInteger(ledger.eventos) || ledger.eventos < 0 ||
      (ledger.trabajador_actual !== null && !UUID.test(ledger.trabajador_actual || '')))
    error('CERTIFICADO_LEDGER_INVALIDO');
  // No cuerpos de archivos ni credenciales: solo identidad técnica original de cada objeto.
  for (const o of snapshot.propietarios_originales) {
    if (!o || Object.keys(o).sort().join(',') !== 'id,owner,owner_id' || !UUID.test(o.id || '') ||
        (o.owner !== null && !UUID.test(o.owner || '')) ||
        (o.owner_id !== null && !UUID.test(o.owner_id || ''))) error('CERTIFICADO_STORAGE_INVALIDO');
  }
}

// Evidencia histórica persistente: no incluye public.usuarios ni Auth. Tabla/columnas fijas, valores parametrizados.
export const PERSISTENT_HISTORY_TABLES=Object.freeze(["usuarios_identidades_historicas","trabajadores","cuentas_documentos","cuentas_documentos_retiros","trabajadores_documentos","prevencion_documentos","storage.objects","storage.buckets","tareas","mantenciones","tareas_pendientes","tareas_pendientes_asignaciones","tareas_pendientes_operaciones","mantenciones_operativas","mantenciones_operativas_responsables","mantenciones_reactivas","mantencion_historial","mantencion_historial_anulaciones","mantenciones_operativas_anulaciones","usuarios_gestion_auditoria","del_registro_eliminaciones","usuarios_eliminaciones_operaciones","guia_contenido_auditoria","inventario_catalogo_auditoria","inventario_entradas_formatos","inventario_movimientos","inventario_movimientos_anulaciones","inventario_productos","bodegas_inventariados","jardineria_contenido_auditoria","prevencion_gantt_contenido_auditoria","administraciones_temporales","solicitudes_reactivas","solicitudes_reactivas_avisos","solicitudes_reactivas_avisos_estado","solicitudes_notificaciones_revision","solicitudes_reactivas_eliminaciones_auditoria","solicitudes_reactivas_eventos","alertas","usuarios_correos_verificados","usuarios_sesion_cambios"]);
function validatePersistentHistory(h) {
  if (!h || Object.keys(h).sort().join(',')!=='catalogo_sha256,operacion_presente,tablas,version' ||
      h.version!==1 || h.operacion_presente!==true || !SHA.test(h.catalogo_sha256 || '') ||
      !h.tablas || Object.keys(h.tablas).sort().join(',')!==[...PERSISTENT_HISTORY_TABLES].sort().join(','))
    error('EVIDENCIA_HISTORICA_INCOMPLETA');
  for(const t of PERSISTENT_HISTORY_TABLES) {
    const x=h.tablas[t];
    if(!x || Object.keys(x).sort().join(',')!=='bytes,filas,sha256' || !SHA.test(x.sha256 || '') ||
       !Number.isSafeInteger(x.filas) || x.filas<0 || x.filas>10000 ||
       !Number.isSafeInteger(x.bytes) || x.bytes<0 || x.bytes>16777216) error('EVIDENCIA_HISTORICA_INCOMPLETA');
  }
  if(h.tablas.usuarios_identidades_historicas.filas<1) error('EVIDENCIA_HISTORICA_INCOMPLETA');
}
async function capturePersistentHistory(tx,row) {
  const rows=await tx`WITH _operacion AS (SELECT * FROM public.usuarios_eliminaciones_operaciones
      WHERE id=${row.id}::uuid AND actor_id=${row.actor_id}::uuid AND objetivo_id=${row.objetivo_id}::uuid),
    fuentes AS (
      SELECT 'usuarios_identidades_historicas' AS tabla,(to_jsonb(t)-'operacion_id'-'auth_eliminado_en')::text AS fila FROM (SELECT * FROM public.usuarios_identidades_historicas LIMIT 10001) t
      UNION ALL SELECT 'trabajadores' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.trabajadores LIMIT 10001) t
      UNION ALL SELECT 'cuentas_documentos' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.cuentas_documentos LIMIT 10001) t
      UNION ALL SELECT 'cuentas_documentos_retiros' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.cuentas_documentos_retiros LIMIT 10001) t
      UNION ALL SELECT 'trabajadores_documentos' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.trabajadores_documentos LIMIT 10001) t
      UNION ALL SELECT 'prevencion_documentos' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.prevencion_documentos LIMIT 10001) t
      UNION ALL SELECT 'storage.objects' AS tabla,(to_jsonb(t)||coalesce((SELECT jsonb_build_object('owner',x->'owner','owner_id',x->'owner_id','updated_at',x->'updated_at') FROM _operacion o,LATERAL jsonb_array_elements(coalesce(o.dependencias_resumen->'conservacion_documental_v1'->'objetos','[]'::jsonb)) x WHERE x->>'id'=t.id::text),'{}'::jsonb))::text AS fila FROM (SELECT * FROM storage.objects LIMIT 10001) t
      UNION ALL SELECT 'storage.buckets' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM storage.buckets LIMIT 10001) t
      UNION ALL SELECT 'tareas' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.tareas LIMIT 10001) t
      UNION ALL SELECT 'mantenciones' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.mantenciones LIMIT 10001) t
      UNION ALL SELECT 'tareas_pendientes' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.tareas_pendientes LIMIT 10001) t
      UNION ALL SELECT 'tareas_pendientes_asignaciones' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.tareas_pendientes_asignaciones LIMIT 10001) t
      UNION ALL SELECT 'tareas_pendientes_operaciones' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.tareas_pendientes_operaciones LIMIT 10001) t
      UNION ALL SELECT 'mantenciones_operativas' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.mantenciones_operativas LIMIT 10001) t
      UNION ALL SELECT 'mantenciones_operativas_responsables' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.mantenciones_operativas_responsables LIMIT 10001) t
      UNION ALL SELECT 'mantenciones_reactivas' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.mantenciones_reactivas LIMIT 10001) t
      UNION ALL SELECT 'mantencion_historial' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.mantencion_historial LIMIT 10001) t
      UNION ALL SELECT 'mantencion_historial_anulaciones' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.mantencion_historial_anulaciones LIMIT 10001) t
      UNION ALL SELECT 'mantenciones_operativas_anulaciones' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.mantenciones_operativas_anulaciones LIMIT 10001) t
      UNION ALL SELECT 'usuarios_gestion_auditoria' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.usuarios_gestion_auditoria LIMIT 10001) t
      UNION ALL SELECT 'del_registro_eliminaciones' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.del_registro_eliminaciones t WHERE NOT EXISTS(SELECT 1 FROM _operacion o WHERE t.id=o.auditoria_id AND t.accion='ELIMINACION_PERMANENTE' AND t.modulo='Administración de Usuarios' AND t.entidad_tipo='usuario' AND t.entidad_id=o.objetivo_id AND t.ejecutado_por=o.actor_id AND t.entidad_referencia=o.objetivo_nombre_snapshot AND t.ejecutado_por_nombre_snapshot=o.actor_nombre_snapshot AND t.motivo=o.motivo AND t.dependencias_resumen->>'operacion_id'=o.id::text) LIMIT 10001) t
      UNION ALL SELECT 'usuarios_eliminaciones_operaciones' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.usuarios_eliminaciones_operaciones t WHERE t.id <> ${row.id}::uuid LIMIT 10001) t
      UNION ALL SELECT 'guia_contenido_auditoria' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.guia_contenido_auditoria LIMIT 10001) t
      UNION ALL SELECT 'inventario_catalogo_auditoria' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.inventario_catalogo_auditoria LIMIT 10001) t
      UNION ALL SELECT 'inventario_entradas_formatos' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.inventario_entradas_formatos LIMIT 10001) t
      UNION ALL SELECT 'inventario_movimientos' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.inventario_movimientos LIMIT 10001) t
      UNION ALL SELECT 'inventario_movimientos_anulaciones' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.inventario_movimientos_anulaciones LIMIT 10001) t
      UNION ALL SELECT 'inventario_productos' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.inventario_productos LIMIT 10001) t
      UNION ALL SELECT 'bodegas_inventariados' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.bodegas_inventariados LIMIT 10001) t
      UNION ALL SELECT 'jardineria_contenido_auditoria' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.jardineria_contenido_auditoria LIMIT 10001) t
      UNION ALL SELECT 'prevencion_gantt_contenido_auditoria' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.prevencion_gantt_contenido_auditoria LIMIT 10001) t
      UNION ALL SELECT 'administraciones_temporales' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.administraciones_temporales LIMIT 10001) t
      UNION ALL SELECT 'solicitudes_reactivas' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.solicitudes_reactivas LIMIT 10001) t
      UNION ALL SELECT 'solicitudes_reactivas_avisos' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.solicitudes_reactivas_avisos LIMIT 10001) t
      UNION ALL SELECT 'solicitudes_reactivas_avisos_estado' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.solicitudes_reactivas_avisos_estado LIMIT 10001) t
      UNION ALL SELECT 'solicitudes_notificaciones_revision' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.solicitudes_notificaciones_revision LIMIT 10001) t
      UNION ALL SELECT 'solicitudes_reactivas_eliminaciones_auditoria' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.solicitudes_reactivas_eliminaciones_auditoria LIMIT 10001) t
      UNION ALL SELECT 'solicitudes_reactivas_eventos' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.solicitudes_reactivas_eventos LIMIT 10001) t
      UNION ALL SELECT 'alertas' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.alertas LIMIT 10001) t
      UNION ALL SELECT 'usuarios_correos_verificados' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.usuarios_correos_verificados LIMIT 10001) t
      UNION ALL SELECT 'usuarios_sesion_cambios' AS tabla,(to_jsonb(t))::text AS fila FROM (SELECT * FROM public.usuarios_sesion_cambios LIMIT 10001) t
    ), requeridas(tabla) AS (VALUES ('usuarios_identidades_historicas'),('trabajadores'),('cuentas_documentos'),('cuentas_documentos_retiros'),('trabajadores_documentos'),('prevencion_documentos'),('storage.objects'),('storage.buckets'),('tareas'),('mantenciones'),('tareas_pendientes'),('tareas_pendientes_asignaciones'),('tareas_pendientes_operaciones'),('mantenciones_operativas'),('mantenciones_operativas_responsables'),('mantenciones_reactivas'),('mantencion_historial'),('mantencion_historial_anulaciones'),('mantenciones_operativas_anulaciones'),('usuarios_gestion_auditoria'),('del_registro_eliminaciones'),('usuarios_eliminaciones_operaciones'),('guia_contenido_auditoria'),('inventario_catalogo_auditoria'),('inventario_entradas_formatos'),('inventario_movimientos'),('inventario_movimientos_anulaciones'),('inventario_productos'),('bodegas_inventariados'),('jardineria_contenido_auditoria'),('prevencion_gantt_contenido_auditoria'),('administraciones_temporales'),('solicitudes_reactivas'),('solicitudes_reactivas_avisos'),('solicitudes_reactivas_avisos_estado'),('solicitudes_notificaciones_revision'),('solicitudes_reactivas_eliminaciones_auditoria'),('solicitudes_reactivas_eventos'),('alertas'),('usuarios_correos_verificados'),('usuarios_sesion_cambios')),
    huellas AS (SELECT r.tabla,count(f.fila) AS filas,coalesce(sum(octet_length(f.fila)),0) AS bytes,
      encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(f.fila,'UTF8')),'hex'),'' ORDER BY f.fila),''),'UTF8')),'hex') AS sha256
      FROM requeridas r LEFT JOIN fuentes f ON f.tabla=r.tabla GROUP BY r.tabla),
    estructura AS (
      SELECT jsonb_build_array('FK',oid,pg_get_constraintdef(oid),convalidated) AS j FROM pg_constraint WHERE contype='f'
      UNION ALL SELECT jsonb_build_array('TRIGGER',oid,pg_get_triggerdef(oid),tgenabled) FROM pg_trigger WHERE NOT tgisinternal
      UNION ALL SELECT jsonb_build_array('POLICY',oid,to_jsonb(p)) FROM pg_policy p
      UNION ALL SELECT jsonb_build_array('REL',c.oid,c.relrowsecurity,c.relforcerowsecurity,c.relacl,
        (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped))
        FROM pg_class c WHERE c.relnamespace IN ('public'::regnamespace,'storage'::regnamespace)
      UNION ALL SELECT jsonb_build_array('FUNC',p.oid,p.proacl,md5(pg_get_functiondef(p.oid))) FROM pg_proc p
        WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p'))
    SELECT jsonb_build_object('version',1,'operacion_presente',(SELECT count(*)=1 FROM _operacion),
      'tablas',(SELECT jsonb_object_agg(tabla,jsonb_build_object('filas',filas,'bytes',bytes,'sha256',sha256)) FROM huellas),
      'catalogo_sha256',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(j ORDER BY j::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM estructura)) AS historia_persistente`;
  const h=rows.length===1?rows[0]?.historia_persistente:null;
  validatePersistentHistory(h);
  return structuredClone(h);
}

// Lee SIEMPRE del tx autenticado por el adaptador, nunca del body HTTP.
export async function captureConservation(tx, row) {
  const b = binding(row);
  const rows = await tx`SELECT public.usuario_eliminacion_conservacion_previa_v1(${row.id}::uuid) AS evidencia`;
  if (rows.length !== 1) error('CERTIFICADO_EVIDENCIA_INCOMPLETA');
  const snapshot = structuredClone(rows[0]?.evidencia);
  validate(snapshot, b);
  const manifest = { version: 1, alcance: 'EVIDENCIA_PREVIA_NO_AUTORIZANTE', vinculo: b,
    evidencia: snapshot, historia_persistente: await capturePersistentHistory(tx,row), habilita_auth: false };
  if(manifest.historia_persistente.catalogo_sha256!==snapshot.catalogo_sha256) error('CERTIFICADO_DESACTUALIZADO');
  return { ...manifest, sha256: await hash(manifest) };
}
export async function verifyConservation(tx, row, certificate) {
  if (!certificate || Object.keys(certificate).sort().join(',') !== 'alcance,evidencia,habilita_auth,historia_persistente,sha256,version,vinculo' ||
      certificate.version !== 1 || certificate.habilita_auth !== false ||
      certificate.alcance !== 'EVIDENCIA_PREVIA_NO_AUTORIZANTE' || !SHA.test(certificate.sha256 || ''))
    error('CERTIFICADO_MANIPULADO');
  const { sha256, ...manifest } = certificate;
  if (await hash(manifest) !== sha256) error('CERTIFICADO_MANIPULADO');
  // La huella no es firma ni autoridad: incluso una huella recalculada debe coincidir con SQL actual.
  const current = await captureConservation(tx, row);
  if (current.sha256 !== sha256) error('CERTIFICADO_DESACTUALIZADO');
  return { evidencia_vigente: true, habilita_auth: false };
}

// DEL-FIX-22. Solo dentro del tx autenticado del adaptador. Nunca mueve/borrar archivos.
// La función SQL propone guardar el recibo inmutable y neutralizar metadatos atómicamente.
export async function conserveDocumentStorage(tx, row) {
  const certificate = row?.dependencias_resumen?.conservacion_previa_v1;
  await verifyConservation(tx, row, certificate);
  const rows = await tx`SELECT public.usuario_eliminacion_conservar_storage_v1(${row.id}::uuid, ${certificate.sha256}::text) AS resultado`;
  const r = rows.length === 1 ? rows[0]?.resultado : null;
  if (!r || Object.keys(r).sort().join(',') !==
      'archivos_verificados,documentos_conservados,habilita_auth,objetos_neutralizados,operacion_id,propiedad_neutralizada' ||
      r.operacion_id !== row.id || r.habilita_auth !== false || r.archivos_verificados !== false ||
      r.documentos_conservados !== true || r.propiedad_neutralizada !== true ||
      !Number.isSafeInteger(r.objetos_neutralizados) || r.objetos_neutralizados < 0 || r.objetos_neutralizados > 10000)
    error('CONSERVACION_DOCUMENTAL_NO_ACREDITADA');
  // La proyección SQL restaura SOLO los campos técnicos del recibo para comparar
  // contra la huella original; verifica previamente el objeto neutral real completo.
  await verifyConservation(tx, row, certificate);
  return { ...r };
}

// Verificación POSTERIOR, exclusivamente SELECT. Nunca usa el capturador PREPARADA/Auth presente.
// Usa exclusivamente evidencia persistente capturada antes del borrado; los certificados antiguos incompletos se rechazan.
// Se verifican hechos conservables, pero NO se certifica cobertura integral ni se autoriza finalizar.
export async function verifyAfterAuth(tx, row) {
  const c = row?.dependencias_resumen?.conservacion_previa_v1;
  if (!['AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION','COMPLETADA'].includes(row?.estado) || row.intentos_auth !== 1 ||
      !c || c.version !== 1 || c.alcance !== 'EVIDENCIA_PREVIA_NO_AUTORIZANTE' || c.habilita_auth !== false ||
      Object.keys(c).sort().join(',') !== 'alcance,evidencia,habilita_auth,historia_persistente,sha256,version,vinculo')
    error('CONSERVACION_POSTERIOR_NO_ACREDITADA');
  const b = { operacion_id: row.id, actor_id: row.actor_id, objetivo_id: row.objetivo_id,
    request_id: row.dependencias_resumen.paso191?.request_id, fingerprint: row.dependencias_resumen.paso191?.fingerprint };
  if (![b.operacion_id,b.actor_id,b.objetivo_id,b.request_id].every(v=>UUID.test(v || '')) ||
      !SHA.test(b.fingerprint || '') || b.actor_id === b.objetivo_id || canonical(c.vinculo) !== canonical(b))
    error('CONSERVACION_POSTERIOR_NO_ACREDITADA');
  const {sha256,...manifest}=c;
  if (!SHA.test(sha256 || '') || await hash(manifest)!==sha256) error('CERTIFICADO_MANIPULADO');
  validate(c.evidencia,b);
  validatePersistentHistory(c.historia_persistente);
  if(c.historia_persistente.catalogo_sha256!==c.evidencia.catalogo_sha256)
    error('EVIDENCIA_HISTORICA_INCOMPLETA');
  const persistent=await capturePersistentHistory(tx,row);
  if(canonical(persistent)!==canonical(c.historia_persistente)) error('EVIDENCIA_HISTORICA_ALTERADA');
  const d=row.dependencias_resumen.conservacion_documental_v1;
  if (!d || d.version!==1 || d.habilita_auth!==false || d.archivos_verificados!==false ||
      d.propiedad_neutralizada!==true || d.certificado_sha256!==sha256 || canonical(d.vinculo)!==canonical(b) ||
      !Array.isArray(d.objetos) || !Array.isArray(d.documentos) || d.objetos.length>10000 || d.documentos.length>10000)
    error('CONSERVACION_POSTERIOR_NO_ACREDITADA');
  const ids=new Set(), docs=new Set();
  for (const x of d.objetos) {
    if (!x || !UUID.test(x.id || '') || ids.has(x.id) || typeof x.neutralizado!=='boolean' ||
        !SHA.test(x.sha256_inmutable || '') ||
        !['documentos-cuentas','documentos-trabajadores','documentos-prevencionista'].includes(x.bucket_id))
      error('CONSERVACION_POSTERIOR_NO_ACREDITADA');
    ids.add(x.id);
  }
  const originals=d.objetos.filter(x=>x.neutralizado).map(x=>({id:x.id,owner:x.owner,owner_id:x.owner_id}));
  const sort=a=>[...a].sort((x,y)=>x.id.localeCompare(y.id));
  if (canonical(sort(originals))!==canonical(sort(c.evidencia.propietarios_originales)))
    error('CONSERVACION_POSTERIOR_NO_ACREDITADA');
  for (const x of d.documentos) {
    if (!x || !UUID.test(x.id || '') || !SHA.test(x.sha256 || '') ||
        !['cuentas_documentos','trabajadores_documentos','prevencion_documentos'].includes(x.tabla) || docs.has(x.tabla+':'+x.id))
      error('CONSERVACION_POSTERIOR_NO_ACREDITADA');
    docs.add(x.tabla+':'+x.id);
  }
  const ledger=c.evidencia.ledger_laboral;
  const rows=await tx`SELECT
    NOT EXISTS(SELECT 1 FROM auth.users WHERE id=${b.objetivo_id}::uuid) AS auth_ausente,
    NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=${b.objetivo_id}::uuid) AS perfil_ausente,
    (SELECT to_jsonb(h) FROM public.usuarios_identidades_historicas h WHERE cuenta_id=${b.objetivo_id}::uuid) AS identidad,
    (${ledger.trabajador_actual}::uuid IS NULL OR EXISTS(SELECT 1 FROM public.trabajadores WHERE id=${ledger.trabajador_actual}::uuid)) AS ficha_presente,
    public.usuarios_trabajadores_certificar_ledger_v1(${b.objetivo_id}::uuid,${ledger.trabajador_actual}::uuid) AS ledger_actual,
    (SELECT to_jsonb(a) FROM public.del_registro_eliminaciones a WHERE a.id=${row.auditoria_id}::uuid) AS auditoria`;
  const r=rows.length===1?rows[0]:null;
  if (!r || r.auth_ausente!==true || r.perfil_ausente!==true || r.ficha_presente!==true ||
      r.identidad?.cuenta_id!==b.objetivo_id || r.identidad.nombre_snapshot!==row.objetivo_nombre_snapshot ||
      r.identidad.trabajador_id!==ledger.trabajador_actual ||
      (r.identidad.operacion_id!==null && r.identidad.operacion_id!==b.operacion_id) ||
      canonical(r.ledger_actual)!==canonical(ledger)) error('CONSERVACION_POSTERIOR_NO_ACREDITADA');
  if (row.estado==='COMPLETADA') {
    const a=r.auditoria;
    if (!UUID.test(row.auditoria_id || '') || !a || a.id!==row.auditoria_id ||
        a.modulo!=='Administración de Usuarios' || a.entidad_tipo!=='usuario' || a.accion!=='ELIMINACION_PERMANENTE' ||
        a.entidad_id!==b.objetivo_id || a.ejecutado_por!==b.actor_id || a.entidad_referencia!==row.objetivo_nombre_snapshot ||
        a.ejecutado_por_nombre_snapshot!==row.actor_nombre_snapshot || a.motivo!==row.motivo ||
        a.dependencias_resumen?.operacion_id!==b.operacion_id) error('AUDITORIA_NO_VERIFICABLE');
  } else if (row.auditoria_id!==null || r.auditoria!==null || r.identidad.auth_eliminado_en!=null)
    error('AUDITORIA_NO_VERIFICABLE');
  // No dar por conservado Storage por la mera ausencia de Auth ni por un recibo existente.
  const [objects]=await tx`WITH esperados AS (SELECT value AS j FROM jsonb_array_elements(${JSON.stringify(d.objetos)}::text::jsonb))
    SELECT NOT EXISTS(SELECT 1 FROM storage.objects WHERE owner=${b.objetivo_id}::uuid OR owner_id=${b.objetivo_id}::text) AS sin_propiedad,
      NOT EXISTS(SELECT 1 FROM esperados e LEFT JOIN storage.objects s ON s.id=(e.j->>'id')::uuid
        WHERE s.id IS NULL OR to_jsonb(s)->'owner' IS DISTINCT FROM CASE WHEN e.j->'neutralizado'='true'::jsonb THEN 'null'::jsonb ELSE e.j->'owner' END
          OR to_jsonb(s)->'owner_id' IS DISTINCT FROM CASE WHEN e.j->'neutralizado'='true'::jsonb THEN 'null'::jsonb ELSE e.j->'owner_id' END
          OR to_jsonb(s)->'updated_at' IS DISTINCT FROM e.j->'updated_at_neutral'
          OR encode(sha256(convert_to((to_jsonb(s)-'owner'-'owner_id'-'updated_at')::text,'UTF8')),'hex') IS DISTINCT FROM e.j->>'sha256_inmutable') AS objetos_conservados`;
  const [documents]=await tx`WITH esperados AS (SELECT value AS j FROM jsonb_array_elements(${JSON.stringify(d.documentos)}::text::jsonb)),
    actuales AS (
      SELECT 'cuentas_documentos' AS tabla,id::text,encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS sha FROM public.cuentas_documentos t
      UNION ALL SELECT 'trabajadores_documentos',id::text,encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') FROM public.trabajadores_documentos t
      UNION ALL SELECT 'prevencion_documentos',id::text,encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') FROM public.prevencion_documentos t)
    SELECT NOT EXISTS(SELECT 1 FROM esperados e LEFT JOIN actuales a ON a.tabla=e.j->>'tabla' AND a.id=e.j->>'id'
      WHERE a.id IS NULL OR a.sha IS DISTINCT FROM e.j->>'sha256') AS documentos_conservados`;
  if (objects?.sin_propiedad!==true || objects.objetos_conservados!==true || documents?.documentos_conservados!==true)
    error('CONSERVACION_POSTERIOR_NO_ACREDITADA');
  // La comparación histórica ya no necesita el perfil. La verificación física de bytes sigue pendiente.
  return { auth_ausente:true, perfil_ausente:true, historia_persistente_verificada:true,
    conservacion_integral_verificada:false, requiere_revision:true,
    bloqueo:'VERIFICACION_FISICA_PENDIENTE', habilita_auth:false };
}


// PASO 197. Solo GET autenticado de Storage; nunca SQL de escritura sobre storage.objects.
const PHYSICAL_BUCKETS=Object.freeze(['documentos-cuentas','documentos-trabajadores','documentos-prevencionista']);
const FILE_LIMIT=16*1024*1024, TOTAL_LIMIT=64*1024*1024;
export function createPhysicalStorageReader({projectUrl,publicKey,fetchImpl=globalThis.fetch}) {
  if(projectUrl!=='https://hgveesryfmcjxpeumzbp.supabase.co' || typeof publicKey!=='function' || typeof fetchImpl!=='function')
    error('STORAGE_FISICO_CONFIGURACION_INVALIDA');
  return Object.freeze({async read(object,authorization) {
    if(!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization || '')) error('STORAGE_FISICO_NO_AUTORIZADO');
    const key=publicKey();let publicOnly=typeof key==='string'&&/^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
    if(!publicOnly&&typeof key==='string')try{publicOnly=JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).role==='anon';}catch{ /* rechazo cerrado */ }
    if(!publicOnly) error('STORAGE_FISICO_CONFIGURACION_INVALIDA');
    const [validated]=normalizePhysicalInventory([object]);
    const url=projectUrl+'/storage/v1/object/authenticated/'+validated.bucket_id+'/'+validated.storage_path.split('/').map(encodeURIComponent).join('/');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    let reader;
    const guarded=async promise=>{
      let listener;
      try{return await Promise.race([promise,new Promise((_,reject)=>{
        listener=()=>reject(new Error('STORAGE_FISICO_TIEMPO_AGOTADO'));
        if(controller.signal.aborted)listener();else controller.signal.addEventListener('abort',listener,{once:true});
      })]);}finally{if(listener)controller.signal.removeEventListener('abort',listener);}
    };
    try {
      const response=await guarded(fetchImpl(new Request(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
        signal:controller.signal,headers:{apikey:key,Authorization:authorization,'Cache-Control':'no-cache'}})));
      if(response.status!==200 || response.redirected || (response.url&&response.url!==url)) error('STORAGE_FISICO_LECTURA_NO_CONFIRMADA');
      const length=response.headers.get('content-length');
      if(length!==null&&(!/^[0-9]+$/.test(length)||Number(length)!==validated.tamano_bytes)) error('STORAGE_FISICO_TAMANO_CAMBIO');
      const chunks=[];let size=0;
      if(response.body){
        reader=response.body.getReader();
        while(true){
          const chunk=await guarded(reader.read());if(chunk.done)break;
          if(!(chunk.value instanceof Uint8Array)) error('STORAGE_FISICO_LECTURA_NO_CONFIRMADA');
          size+=chunk.value.byteLength;
          if(size>validated.tamano_bytes||size>FILE_LIMIT) error('STORAGE_FISICO_TAMANO_CAMBIO');
          chunks.push(chunk.value);
        }
      }
      if(size!==validated.tamano_bytes) error('STORAGE_FISICO_TAMANO_CAMBIO');
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      return {tamano_bytes:size,sha256:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')};
    } catch {error('STORAGE_FISICO_NO_ACREDITADO');}
    finally {clearTimeout(timer);controller.abort();if(reader)void reader.cancel().catch(()=>{});}
  }});
}
export function normalizePhysicalInventory(rows) {
  if(!Array.isArray(rows)||rows.length>10000) error('STORAGE_FISICO_INVENTARIO_INVALIDO');
  const objects=new Map(),paths=new Map();
  for(const x of rows){
    if(!x||x.completa===false||!UUID.test(x.id || '')||!PHYSICAL_BUCKETS.includes(x.bucket_id)||
      typeof x.storage_path!=='string'||!x.storage_path||x.storage_path.length>1024||x.storage_path.includes(String.fromCharCode(92))||x.storage_path.includes(String.fromCharCode(0))||
      x.storage_path.split('/').some(s=>!s||s==='.'||s==='..')||typeof x.version!=='string'||!x.version||
      !Number.isSafeInteger(x.tamano_bytes)||x.tamano_bytes<0||x.tamano_bytes>FILE_LIMIT||
      (x.id_esperado!=null&&x.id_esperado!==x.id)||(x.version_esperada!=null&&x.version_esperada!==x.version)||
      (x.tamano_esperado!=null&&x.tamano_esperado!==x.tamano_bytes)||
      (x.sha256_documental!=null&&!SHA.test(x.sha256_documental))) error('STORAGE_FISICO_INVENTARIO_INVALIDO');
    const o={id:x.id,bucket_id:x.bucket_id,storage_path:x.storage_path,version:x.version,
      tamano_bytes:x.tamano_bytes,sha256_documental:x.sha256_documental??null};
    const prior=objects.get(o.id),path=o.bucket_id+'/'+o.storage_path;
    if(paths.has(path)&&paths.get(path)!==o.id) error('STORAGE_FISICO_INVENTARIO_INVALIDO');
    if(prior){
      if(prior.bucket_id!==o.bucket_id||prior.storage_path!==o.storage_path||prior.version!==o.version||prior.tamano_bytes!==o.tamano_bytes||
        (prior.sha256_documental&&o.sha256_documental&&prior.sha256_documental!==o.sha256_documental)) error('STORAGE_FISICO_INVENTARIO_INVALIDO');
      if(o.sha256_documental)prior.sha256_documental=o.sha256_documental;
    }else{objects.set(o.id,o);paths.set(path,o.id);}
  }
  const result=[...objects.values()].sort((a,b)=>a.id.localeCompare(b.id));
  if(result.length>128||result.reduce((n,o)=>n+o.tamano_bytes,0)>TOTAL_LIMIT) error('STORAGE_FISICO_LIMITE');
  return result;
}
export async function measurePhysicalStorage(reader,authorization,inventory,certificate,phase,previous=null) {
  if(!reader||typeof reader.read!=='function'||!['antes','despues'].includes(phase)) error('STORAGE_FISICO_NO_IMPLEMENTADO');
  const {sha256,...manifest}=certificate??{};
  if(!SHA.test(sha256 || '')||certificate?.habilita_auth!==false||certificate.version!==1||
    certificate.alcance!=='EVIDENCIA_PREVIA_NO_AUTORIZANTE'||await hash(manifest)!==sha256) error('CERTIFICADO_MANIPULADO');
  validate(certificate.evidencia,certificate.vinculo);
  validatePersistentHistory(certificate.historia_persistente);
  const objects=normalizePhysicalInventory(inventory),inventoryHash=await hash(objects.map(({sha256_documental,...identity})=>identity));
  const known=certificate.evidencia?.propietarios_originales;
  if(!Array.isArray(known)||known.some(o=>!objects.some(x=>x.id===o.id))) error('STORAGE_FISICO_INVENTARIO_INCOMPLETO');
  if(phase==='despues'||previous!==null){
    if(!previous||Object.keys(previous).sort().join(',')!=='archivos_verificados,certificado_sha256,fase,habilita_auth,inventario_sha256,objetos,sha256,version,vinculo'||
       previous.version!==1||previous.fase!=='antes'||previous.habilita_auth!==false||previous.archivos_verificados!==false||
       previous.certificado_sha256!==sha256||canonical(previous.vinculo)!==canonical(certificate.vinculo)||
       previous.inventario_sha256!==inventoryHash||!Array.isArray(previous.objetos)||previous.objetos.length!==objects.length)
      error('STORAGE_FISICO_EVIDENCIA_PREVIA_REQUERIDA');
    const {sha256:proof,...receipt}=previous;
    if(!SHA.test(proof || '')||await hash(receipt)!==proof) error('STORAGE_FISICO_EVIDENCIA_ALTERADA');
  }
  const measured=[];
  // Sin paralelismo, reintentos, enlaces firmados, copias locales ni transacción SQL abierta.
  const deadline=Date.now()+45000;
  for(const o of objects){
    if(Date.now()>deadline) error('STORAGE_FISICO_TIEMPO_AGOTADO');
    const m=await reader.read(o,authorization);
    if(!m||m.tamano_bytes!==o.tamano_bytes||!SHA.test(m.sha256 || '')||
      (o.sha256_documental&&o.sha256_documental!==m.sha256)) error('STORAGE_FISICO_CONTENIDO_CAMBIO');
    measured.push({id:o.id,bucket_id:o.bucket_id,storage_path:o.storage_path,version:o.version,tamano_bytes:m.tamano_bytes,sha256:m.sha256});
  }
  if(previous!==null&&canonical(measured)!==canonical(previous.objetos)) error('STORAGE_FISICO_CONTENIDO_CAMBIO');
  const receipt={version:1,fase:phase,vinculo:structuredClone(certificate.vinculo),certificado_sha256:sha256,
    inventario_sha256:inventoryHash,objetos:measured,archivos_verificados:phase==='despues',habilita_auth:false};
  return {...receipt,sha256:await hash(receipt)};
}
export function samePhysicalReceipt(a,b) { return canonical(a)===canonical(b); }

// V2: SQL valida su certificado nativo y vinculación. Este puerto mide bytes,
// sin convertir el certificado SQL en un certificado V1 ni inventar su hash.
export async function measureIntegralPhysicalStorage(reader, authorization, inventory, previous = null) {
  if (!reader || typeof reader.read !== 'function') error('STORAGE_FISICO_NO_IMPLEMENTADO');
  const objects = normalizePhysicalInventory(inventory), measured = [];
  for (const object of objects) {
    const result = await reader.read(object, authorization);
    if (!result || result.tamano_bytes !== object.tamano_bytes || !SHA.test(result.sha256 || '') ||
        (object.sha256_documental && result.sha256 !== object.sha256_documental))
      error('STORAGE_FISICO_CONTENIDO_CAMBIO');
    measured.push({ id: object.id, bucket_id: object.bucket_id, storage_path: object.storage_path,
      version: object.version, tamano_bytes: result.tamano_bytes, sha256: result.sha256 });
  }
  if (previous !== null && !samePhysicalReceipt(previous, measured)) error('STORAGE_FISICO_CONTENIDO_CAMBIO');
  return measured;
}
