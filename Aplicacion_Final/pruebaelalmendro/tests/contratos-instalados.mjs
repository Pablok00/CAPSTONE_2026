// Paso 191: validación de la exportación de catálogo, sin SQL, red, env ni evaluación de código.
// Solo servidor/herramientas locales. Una fuente válida NO autoriza ni certifica eliminación.
const firmas = Object.freeze({
  usuario_eliminacion_preparar_v1: 'p_objetivo_id uuid, p_nombre_exacto text, p_motivo text, p_confirmacion boolean',
  usuario_eliminacion_registrar_resultado_auth_v1: 'p_operacion_id uuid, p_resultado text, p_error_codigo text',
  usuario_eliminacion_finalizar_v1: 'p_operacion_id uuid',
  usuario_eliminacion_evaluar_recepcion_v1: 'p_objetivo_id uuid',
  es_administrador_permanente_actual: '',
  mi_estado_administrativo: '',
});
const fail = codigo => { throw new Error(codigo); };
const normalize = text => text.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');
export function leerContratosInstalados(text) {
  if (typeof text !== 'string') return fail('CONTRATOS_SQL_FORMATO_INVALIDO');
  let source;
  try { source = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { return fail('CONTRATOS_SQL_FORMATO_INVALIDO'); }
  // Exportación de una fila del SQL Editor o copia directa de su única celda JSON.
  if (Array.isArray(source)) {
    if (source.length !== 1 || !source[0] || !Object.hasOwn(source[0], 'contratos_paso189'))
      return fail('CONTRATOS_SQL_FORMATO_INVALIDO');
    source = source[0].contratos_paso189;
  }
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { return fail('CONTRATOS_SQL_FORMATO_INVALIDO'); }
  }
  if (!source || Array.isArray(source) || typeof source !== 'object' ||
      !Array.isArray(source.funciones) || !Array.isArray(source.relaciones) ||
      !Array.isArray(source.funciones_no_encontradas) || source.funciones_no_encontradas.length ||
      !Array.isArray(source.relaciones_no_encontradas) || source.relaciones_no_encontradas.length)
    return fail('CONTRATOS_SQL_INCOMPLETOS');
  for (const [nombre, firma] of Object.entries(firmas)) {
    const matches = source.funciones.filter(f => f?.esquema === 'public' && f.nombre === nombre);
    // No escoger arbitrariamente un overload ni interpretar argumentos del texto CREATE.
    if (matches.length !== 1) return fail('CONTRATOS_SQL_FIRMA_INCOMPATIBLE');
    const f = matches[0];
    if (typeof f.identidad_argumentos !== 'string' || normalize(f.identidad_argumentos) !== firma ||
        typeof f.argumentos !== 'string' || typeof f.retorno !== 'string' || !f.retorno.trim() ||
        typeof f.definicion !== 'string' || !f.definicion.trim())
      return fail('CONTRATOS_SQL_FIRMA_INCOMPATIBLE');
    if (nombre.startsWith('usuario_eliminacion_') &&
        (f.propietario !== 'postgres' || f.security_definer !== true || f.acl !== '{postgres=X/postgres}'))
      return fail('CONTRATOS_SQL_PRIVILEGIOS_NO_ACREDITADOS');
  }
  for (const name of ['usuarios_eliminaciones_operaciones', 'del_registro_eliminaciones', 'usuarios']) {
    const matches = source.relaciones.filter(r => r?.esquema === 'public' && r.nombre === name);
    if (matches.length !== 1 || !Array.isArray(matches[0].columnas) || !matches[0].columnas.length)
      return fail('CONTRATOS_SQL_INCOMPLETOS');
  }
  // Copia para revisión: no ejecutar el DDL, no generar certificados a partir de metadatos.
  return { contratos: structuredClone(source), revision_semantica_pendiente: true,
    conservacion_historica_certificada: false, puede_eliminar: false, eliminacion_habilitada: false };
}
