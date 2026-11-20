// ==========================================================
// SERVICIO: DOCUMENTOS DE PREVENCIONISTA - HOTEL EL ALMENDRO
// ==========================================================
// FASE C2P-5C: Frontend REAL de documentos de Prevencionista
// (biblioteca de documentos: generales o asociados a una Carta
// Gantt). SIN UI todavía; la interfaz llega en C2P-5D.
//
// Patrón técnico: js/services/trabajadoresDocumentos.service.js
// (patrón REAL ya aprobado del proyecto, fase C1B-C). Acceso a
// datos reales vía window.supabaseClient. NO se crea otro cliente
// Supabase. Sin ES modules: objeto global
// window.PrevencionDocumentosService.
//
// Bucket: documentos-prevencionista (PRIVADO, máx. 10 MB,
// MIME: application/pdf, image/jpeg, image/png, image/webp).
// Tabla real: public.prevencion_documentos
// Columnas: id, plan_id, storage_path, nombre_original,
//           mime_type, tamano_bytes, creado_por, created_at.
//
// RLS y Storage Policies YA EXISTEN en backend y NO se tocan desde
// aquí. La AUTORIZACIÓN real (sólo Administrador PERMANENTE
// gestiona estos documentos, vía
// public.puede_gestionar_documentos_prevencionista()) vive en esas
// policies. Este service sólo agrega validaciones UX previas:
// nada de lo que envíe el navegador modifica las reglas del
// backend.
//
// Reglas de este archivo:
// - SIN mocks, SIN localStorage, SIN service_role, SIN secretos,
//   SIN alert().
// - SELECT con columnas explícitas; NUNCA SELECT *.
// - El listado sale de la TABLA (no de storage.list()).
// - NO se usa ningún join embebido (consistente con el resto de
//   servicios del proyecto): un documento con plan_id = NULL debe
//   cargarse correctamente y el título de la Carta Gantt se
//   resolverá en la vista (C2P-5D) si lo necesita.
// - NUNCA getPublicUrl(): el bucket es privado, sólo signed URL de
//   60 segundos (createSignedUrl(..., 60)), exactamente igual que
//   TrabajadoresDocumentosService.
// - Upload con upsert: false. El path es SIEMPRE
//   prevencionista/{crypto.randomUUID()}; el nombre_original NUNCA
//   entra en el path (evita colisiones, inyección de path y
//   problemas de encoding).
// - El INSERT de metadata envía ÚNICAMENTE plan_id, storage_path,
//   nombre_original, mime_type y tamano_bytes. NO se envía id,
//   creado_por ni created_at (los decide el backend:
//   gen_random_uuid() / auth.uid() / DEFAULT now()).
// - plan_id: NULL real para documento general; UUID exacto y
//   validado si viene de una Carta Gantt. Nunca se elige ni inventa
//   un plan implícitamente.
// - Compensación: si el INSERT de metadata falla después de un
//   upload exitoso, se retira el archivo con storage.remove([path])
//   y se propaga EL ERROR ORIGINAL del INSERT.
// - DELETE: primero Storage, y SÓLO si Storage confirma se elimina
//   la fila (mismo orden seguro que TrabajadoresDocumentosService).
// - Caché interna: se invalida tras subir y eliminar (la fuente de
//   verdad siempre es Supabase).
// - Errores: console.error con contexto y re-lanzamiento; los
//   errores pensados para la persona usuaria llevan
//   error.mensajeUsuario. Nunca se registran signed URLs en consola.
// - Los datos NO se guardan en localStorage (Ley 21.719).
//
// NOTAS DE DISEÑO (decisiones C2P-5C):
// 1) Los identificadores de este archivo van PREFIJADOS con
//    PREVENCION_DOCUMENTOS_ / prevencionDocumentos porque
//    index.html carga scripts clásicos en un MISMO ámbito global y
//    trabajadoresDocumentos.service.js ya declara
//    DOCUMENTOS_BUCKET, DOCUMENTOS_MIME_PERMITIDOS,
//    DOCUMENTOS_TAMANO_MAXIMO_BYTES, DOCUMENTOS_REGEX_UUID y
//    documentosErrorUsuario. Redeclararlos rompería la carga.
// 2) Diferencia deliberada con Trabajadores: allí
//    crearUrlTemporal/eliminarDocumento reciben un docId y vuelven
//    a leer la tabla para obtener storage_path porque SU listado no
//    expone storage_path. En C2P-5C el spec pide traer storage_path
//    en listarDocumentos() y pasar el objeto documento; por eso
//    crearUrlFirmada/eliminarDocumento usan EXCLUSIVAMENTE
//    documento.storage_path (validado como texto no vacío) y
//    documento.id. En ningún caso se reconstruye la ruta desde
//    nombre_original, plan_id ni título.
// 3) Orden de eliminación idéntico a Trabajadores: Storage PRIMERO;
//    si Storage falla NO se elimina la metadata (evita huérfanos
//    visibles).

// Bucket privado de documentos (ya creado y validado en backend).
const PREVENCION_DOCUMENTOS_BUCKET = 'documentos-prevencionista';

// Límite del bucket (10 MB). Sólo validación UX: la autoridad es
// la política de tamaño del Storage.
const PREVENCION_DOCUMENTOS_TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

// MIME permitidos por el bucket (minúsculas, sin parámetros).
const PREVENCION_DOCUMENTOS_MIME_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
];

// Validación de UUID (plan_id y documentos.id son uuid).
const PREVENCION_DOCUMENTOS_REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Duración de la signed URL privada, igual que Trabajadores.
const PREVENCION_DOCUMENTOS_URL_SEGUNDOS = 60;

// Error con mensaje pensado para la persona usuaria (sin SQL, sin
// policies, sin paths, sin UUID internos ni detalles sensibles).
// La vista usa e.mensajeUsuario si existe; si no, traduce el error.
function prevencionDocumentosErrorUsuario(mensaje) {
  const error = new Error(mensaje);
  error.mensajeUsuario = mensaje;
  return error;
}

window.PrevencionDocumentosService = {
  // Caché interna: única "colección" (la biblioteca es global, no
  // por entidad). Sólo acelera la lectura; NUNCA es la fuente de
  // verdad.
  _documentosCache: null,

  // ----------------------------------------------------------
  // _validarDocId(valor, mensaje)
  // docId/documento.id SÓLO se usa en .eq('id', ...) (nunca en un
  // path de storage), por lo que basta con exigir un identificador
  // no vacío de tipo texto. Si el valor no existe, PostgREST lo
  // rechaza igualmente bajo RLS.
  // ----------------------------------------------------------
  _validarDocId(valor, mensaje) {
    const id = typeof valor === 'string' ? valor.trim() : '';
    if (!id) {
      throw prevencionDocumentosErrorUsuario(mensaje);
    }
    return id;
  },

  // ----------------------------------------------------------
  // _validarStoragePath(documento)
  // Exige un storage_path TEXT no vacío proveniente del objeto
  // documento (traído desde la tabla). NO valida forma con regex ni
  // reconstruye nada: es dato almacenado bajo RLS.
  // ----------------------------------------------------------
  _validarStoragePath(documento, mensaje) {
    const storagePath = documento && typeof documento.storage_path === 'string'
      ? documento.storage_path.trim()
      : '';
    if (!storagePath) {
      throw prevencionDocumentosErrorUsuario(mensaje);
    }
    return storagePath;
  },

  // ----------------------------------------------------------
  // _normalizarPlanId(planId)
  // - null / undefined / '' -> NULL real (documento general).
  // - UUID válido -> se conserva EXACTAMENTE (recortado de
  //   espacios accidentales).
  // - Cualquier otro valor -> error: no se inventa ni se elige una
  //   Carta Gantt implícitamente.
  // ----------------------------------------------------------
  _normalizarPlanId(planId) {
    if (planId === null || planId === undefined) return null;
    const limpio = typeof planId === 'string' ? planId.trim() : '';
    if (!limpio) return null;
    if (!PREVENCION_DOCUMENTOS_REGEX_UUID.test(limpio)) {
      throw prevencionDocumentosErrorUsuario(
        'La Carta Gantt seleccionada no es válida. Selecciona ninguna o una Carta Gantt existente.'
      );
    }
    return limpio;
  },

  // ----------------------------------------------------------
  // listarDocumentos(force = false)
  // Lista REAL desde public.prevencion_documentos, ordenada
  // created_at DESC (desempate id ASC). Columnas explícitas.
  // NO usa storage.list() y NO usa joins: plan_id = NULL se
  // conserva como NULL real (documento general) sin transformarlo.
  // ----------------------------------------------------------
  async listarDocumentos(force = false) {
    if (!force && this._documentosCache) return this._documentosCache;

    try {
      const { data: documentos, error } = await window.supabaseClient
        .from('prevencion_documentos')
        .select('id, plan_id, storage_path, nombre_original, mime_type, tamano_bytes, creado_por, created_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true }); // desempate estable

      if (error) throw error;

      this._documentosCache = documentos || [];
      return this._documentosCache;
    } catch (e) {
      console.error('Error completo Supabase en PrevencionDocumentosService.listarDocumentos:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // subirDocumento({ archivo, planId = null })
  // Flujo: validaciones UX -> upload Storage -> INSERT metadata.
  // Éxito SOLO si upload + INSERT funcionan.
  //
  // Si el upload falla: se DETIENE (no se inserta nada).
  // Si el INSERT falla tras un upload exitoso: COMPENSACIÓN con
  // storage.remove([path]) y se propaga EL ERROR ORIGINAL.
  //
  // Path EXACTO: prevencionista/{crypto.randomUUID()}
  // El nombre_original NUNCA forma parte del path.
  //
  // planId: null/undefined/'' -> NULL (documento general);
  // UUID válido -> se envía exacto. NO se elige Carta Gantt ni se
  // asocia a la Carta abierta implícitamente.
  //
  // El INSERT envía ÚNICAMENTE: plan_id, storage_path,
  // nombre_original, mime_type y tamano_bytes. NO se envía id,
  // creado_por ni created_at (los decide el backend).
  //
  // Devuelve { planId, nombreOriginal, mimeType, tamanoBytes }
  // (NUNCA storage_path).
  // ----------------------------------------------------------
  async subirDocumento({ archivo, planId = null } = {}) {
    // ---- Validaciones UX (la seguridad real es Storage/RLS) ----
    if (!archivo) {
      throw prevencionDocumentosErrorUsuario('Debes seleccionar un archivo.');
    }

    const nombreOriginal = typeof archivo.name === 'string' ? archivo.name.trim() : '';
    if (!nombreOriginal) {
      throw prevencionDocumentosErrorUsuario('El archivo seleccionado no tiene nombre.');
    }

    const tamano = typeof archivo.size === 'number' ? archivo.size : 0;
    if (tamano <= 0) {
      throw prevencionDocumentosErrorUsuario('El archivo está vacío.');
    }
    if (tamano > PREVENCION_DOCUMENTOS_TAMANO_MAXIMO_BYTES) {
      throw prevencionDocumentosErrorUsuario('El archivo supera el máximo permitido de 10 MB.');
    }

    const mimeType = typeof archivo.type === 'string' ? archivo.type.trim().toLowerCase() : '';
    if (PREVENCION_DOCUMENTOS_MIME_PERMITIDOS.indexOf(mimeType) === -1) {
      throw prevencionDocumentosErrorUsuario('Formato no permitido. Usa PDF, JPG, PNG o WEBP.');
    }

    // plan_id: NULL real o UUID exacto. Nunca implícito.
    const planIdNormalizado = this._normalizarPlanId(planId);

    // ---- Path del archivo: uuid generado en el navegador ----
    if (!window.crypto || typeof window.crypto.randomUUID !== 'function') {
      throw prevencionDocumentosErrorUsuario(
        'Tu navegador no permite generar identificadores seguros. Usa HTTPS y vuelve a intentar.'
      );
    }
    const archivoUuid = window.crypto.randomUUID();
    const storagePath = `prevencionista/${archivoUuid}`;

    // ---- 1. UPLOAD real (bucket privado, sin sobrescritura) ----
    const { error: errorUpload } = await window.supabaseClient.storage
      .from(PREVENCION_DOCUMENTOS_BUCKET)
      .upload(storagePath, archivo, {
        contentType: archivo.type,
        upsert: false
      });

    // Upload falló: DETENER. No se inserta metadata.
    if (errorUpload) {
      console.error('Error subiendo archivo a Storage en PrevencionDocumentosService.subirDocumento:', errorUpload);
      throw errorUpload;
    }

    // ---- 2. INSERT de metadata (sin id, creado_por ni created_at) ----
    // Se inserta SIN .select()/RETURNING: el éxito lo define el
    // error de PostgREST (42501 si RLS lo rechaza). Así un INSERT
    // correcto no puede confundirse con un fallo por no poder
    // releer la fila recién creada.
    let errorInsert = null;
    try {
      const resultado = await window.supabaseClient
        .from('prevencion_documentos')
        .insert([{
          plan_id: planIdNormalizado,
          storage_path: storagePath,
          nombre_original: nombreOriginal,
          mime_type: mimeType,
          tamano_bytes: tamano
        }]);
      errorInsert = resultado.error;
    } catch (e) {
      errorInsert = e;
    }

    // ---- 3. COMPENSACIÓN: si el INSERT falló, se retira el ----
    // ---- archivo recién subido para no dejar huérfanos     ----
    if (errorInsert) {
      console.error(
        'Error insertando metadata de documento de prevencionista; se intenta compensar el archivo subido:',
        errorInsert
      );
      try {
        const { error: errorCompensacion } = await window.supabaseClient.storage
          .from(PREVENCION_DOCUMENTOS_BUCKET)
          .remove([storagePath]);
        if (errorCompensacion) {
          // No se puede hacer más: se informa sin fingir éxito.
          console.error('No fue posible retirar el archivo tras el fallo del INSERT:', errorCompensacion);
        }
      } catch (eCompensacion) {
        console.error('No fue posible retirar el archivo tras el fallo del INSERT:', eCompensacion);
      }
      // Se propaga EL ERROR ORIGINAL del INSERT (nunca el de limpieza).
      throw errorInsert;
    }

    // Éxito real: upload + metadata confirmados por Supabase.
    // Se invalida la caché para releer desde Supabase en la
    // siguiente consulta.
    this.clearCache();
    return {
      planId: planIdNormalizado,
      nombreOriginal: nombreOriginal,
      mimeType: mimeType,
      tamanoBytes: tamano
    };
  },

  // ----------------------------------------------------------
  // crearUrlFirmada(documento, opciones = {})
  // Usa EXCLUSIVAMENTE documento.storage_path (traído desde la
  // tabla en listarDocumentos). NO se reconstruye la ruta desde
  // nombre_original, plan_id ni título.
  //
  // Nunca getPublicUrl(): el bucket es privado.
  // La signed URL dura 60 segundos (mismo valor que
  // TrabajadoresDocumentosService).
  // opciones.descargar = true agrega el nombre_original como nombre
  // de descarga (soportado por supabase-js createSignedUrl).
  //
  // Devuelve { url, nombreOriginal, mimeType, expiraEnSegundos }.
  // ----------------------------------------------------------
  async crearUrlFirmada(documento, opciones = {}) {
    if (!documento || typeof documento !== 'object') {
      throw prevencionDocumentosErrorUsuario(
        'No se identificó el documento. Actualiza la lista e intenta nuevamente.'
      );
    }

    const storagePath = this._validarStoragePath(
      documento,
      'El documento ya no está disponible. Actualiza la lista.'
    );

    const quiereDescargar = !!(opciones && opciones.descargar);
    const opcionesFirma = (quiereDescargar && documento.nombre_original)
      ? { download: documento.nombre_original }
      : undefined;

    // Signed URL PRIVADA de 60 segundos. NUNCA getPublicUrl().
    const { data: firma, error: errorFirma } = await window.supabaseClient.storage
      .from(PREVENCION_DOCUMENTOS_BUCKET)
      .createSignedUrl(storagePath, PREVENCION_DOCUMENTOS_URL_SEGUNDOS, opcionesFirma);

    if (errorFirma) throw errorFirma;
    if (!firma || !firma.signedUrl) {
      throw prevencionDocumentosErrorUsuario('No se pudo generar el enlace temporal del documento.');
    }

    return {
      url: firma.signedUrl,
      nombreOriginal: documento.nombre_original || null,
      mimeType: documento.mime_type || null,
      expiraEnSegundos: PREVENCION_DOCUMENTOS_URL_SEGUNDOS
    };
  },

  // ----------------------------------------------------------
  // eliminarDocumento(documento)
  // Usa EXCLUSIVAMENTE documento.storage_path y documento.id.
  // NO se reconstruye la ruta y NO se borra por filtros amplios.
  //
  // Orden OBLIGATORIO (idéntico a TrabajadoresDocumentosService):
  //   1. Storage PRIMERO -> storage.remove([documento.storage_path])
  //   2. sólo si Storage confirma -> DELETE por documento.id
  //
  // Si Storage falla: NO se borra la metadata (evita que la fila
  // apunte a un archivo que ya no existe).
  // Si Storage responde pero el DELETE no afecta filas (RLS): se
  // lanza error claro; NO se finge éxito.
  // ----------------------------------------------------------
  async eliminarDocumento(documento) {
    if (!documento || typeof documento !== 'object') {
      throw prevencionDocumentosErrorUsuario(
        'No se identificó el documento. Actualiza la lista e intenta nuevamente.'
      );
    }

    const id = this._validarDocId(
      documento.id,
      'No se identificó el documento. Actualiza la lista e intenta nuevamente.'
    );

    const storagePath = this._validarStoragePath(
      documento,
      'El documento ya no está disponible. Actualiza la lista.'
    );

    // 1. STORAGE PRIMERO.
    let errorStorage = null;
    try {
      const resultado = await window.supabaseClient.storage
        .from(PREVENCION_DOCUMENTOS_BUCKET)
        .remove([storagePath]);
      errorStorage = resultado.error;
    } catch (e) {
      errorStorage = e;
    }

    if (errorStorage) {
      // Storage NO confirmó: se aborta y la fila queda intacta.
      console.error('Error eliminando archivo de Storage en PrevencionDocumentosService.eliminarDocumento:', errorStorage);
      throw errorStorage;
    }

    // 2. SÓLO AHORA se elimina la fila de metadata, por id exacto.
    let filasBorradas = null;
    let errorDelete = null;
    try {
      const resultado = await window.supabaseClient
        .from('prevencion_documentos')
        .delete()
        .eq('id', id)
        .select('id');
      errorDelete = resultado.error;
      filasBorradas = resultado.data;
    } catch (e) {
      errorDelete = e;
    }

    if (errorDelete) {
      console.error('Error eliminando metadata del documento (el archivo ya fue retirado):', errorDelete);
      throw prevencionDocumentosErrorUsuario(
        'El archivo se retiró del almacenamiento, pero no se pudo eliminar el registro del documento. Intenta nuevamente.'
      );
    }

    // Bajo RLS, un DELETE sin permiso no da error: devuelve 0 filas.
    // Eso NO es éxito.
    if (!Array.isArray(filasBorradas) || filasBorradas.length === 0) {
      throw prevencionDocumentosErrorUsuario(
        'El archivo se retiró del almacenamiento, pero no se pudo eliminar el registro del documento. Contacta al administrador.'
      );
    }

    // Éxito real: se invalida la caché para releer la biblioteca.
    this.clearCache();
    return { id: id };
  },

  // ----------------------------------------------------------
  // clearCache()
  // La biblioteca es global: sin argumento limpia la única caché.
  // Se invoca automáticamente tras subir y eliminar.
  // ----------------------------------------------------------
  clearCache() {
    this._documentosCache = null;
  }
};
