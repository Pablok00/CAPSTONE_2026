// Paso 189. Comparador de evidencia de servidor; no consulta ni modifica datos.
// NO es un certificado de cobertura de esquema/RLS. No importar en frontend.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = () => { throw new Error('EVIDENCIA_HISTORICA_NO_VERIFICABLE'); };
const evidencias = new WeakMap();
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Array.from({ length: value.length }, (_, i) => i).some(i => !Object.hasOwn(value, i))) return fail();
    return '[' + value.map(canonical).join(',') + ']';
  }
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return fail(); // Nunca omitir undefined u otros valores no serializables.
}
function snapshot(manifest, categories) {
  if (!Array.isArray(manifest) || !manifest.length || !categories || typeof categories !== 'object') return fail();
  const names = manifest.map(rule => rule?.name);
  if (names.some(name => typeof name !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(name)) || new Set(names).size !== names.length ||
      Object.keys(categories).sort().join('\n') !== [...names].sort().join('\n')) return fail();
  return canonical(manifest.map(rule => {
    if (!Array.isArray(rule.key) || !rule.key.length || rule.key.some(k => typeof k !== 'string' || !k) ||
        !['conservar', 'bloquear_si_existe'].includes(rule.action)) return fail();
    const category = categories[rule.name];
    if (category?.complete !== true || !Array.isArray(category.rows) ||
        !Number.isSafeInteger(category.count) || category.count !== category.rows.length) return fail();
    // Incluye categorías CASCADE cuyo tratamiento histórico aún no esté aprobado.
    if (rule.action === 'bloquear_si_existe' && category.count !== 0) return fail();
    if (Array.from({ length: category.rows.length }, (_, i) => i).some(i => !Object.hasOwn(category.rows, i))) return fail();
    const keys = new Set();
    const rows = category.rows.map(row => {
      if (!row || Object.getPrototypeOf(row) !== Object.prototype ||
          rule.key.some(k => row[k] === undefined || row[k] === null)) return fail();
      const key = canonical(rule.key.map(k => row[k]));
      if (keys.has(key)) return fail();
      keys.add(key);
      return { key, row };
    }).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    return { name: rule.name, rows };
  }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
export function capturarEvidenciaHistorica({ actorId, targetId, operationId, manifestVersion,
  manifest, categories, previewAt, now = Date.now() }) {
  if (![actorId, targetId, operationId].every(id => typeof id === 'string' && UUID.test(id)) ||
      actorId.toLowerCase() === targetId.toLowerCase() || typeof manifestVersion !== 'string' || !manifestVersion ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(previewAt) || now < previewAt || now - previewAt > 60000) return fail();
  const baseline = snapshot(manifest, categories);
  const proof = Object.freeze({}); // No devolver filas, UUID, nombres, hashes o estado certificante.
  evidencias.set(proof, { actorId, targetId, operationId, manifestVersion,
    manifest: structuredClone(manifest), baseline, previewAt });
  return proof;
}
export function compararEvidenciaHistorica(proof, { actorId, targetId, operationId, manifestVersion,
  categories, now = Date.now() }) {
  const original = evidencias.get(proof);
  if (!original || !Number.isSafeInteger(now) || now < original.previewAt || now - original.previewAt > 60000 ||
      Object.entries({ actorId, targetId, operationId, manifestVersion }).some(([k, v]) => original[k] !== v)) return fail();
  if (snapshot(original.manifest, categories) !== original.baseline) return fail();
  return Object.freeze({ comparacion_coincide: true, conservacion_historica_certificada: false,
    puede_eliminar: false, eliminacion_habilitada: false });
}
