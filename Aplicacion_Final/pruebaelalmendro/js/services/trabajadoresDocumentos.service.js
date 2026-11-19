// ==========================================================
// SERVICIO: DOCUMENTOS DE TRABAJADORES - HOTEL EL ALMENDRO
// ==========================================================
// FASE C1B-C: Frontend REAL de documentos de trabajadores.
//
// Patrón técnico: js/services/trabajadores.service.js y
// js/services/usuarios.service.js.
// Acceso a datos reales vía window.supabaseClient. NO se crea otro
// cliente Supabase.
//
// Bucket: documentos-trabajadores (PRIVADO, máx. 10 MB,
// MIME: application/pdf, image/jpeg, image/png, image/webp).
// Tabla real: public.trabajadores_documentos
// Columnas: id, trabajador_id, storage_path, nombre_original,
//           mime_type, tamano_bytes, creado_por, created_at.
//
// RLS y Storage Policies YA EXISTEN en backend y NO se tocan desde
// aquí. La AUTORIZACIÓN real (sólo Administrador PERMANENTE
// gestiona; trabajador "Activo" puede subir, "Inactivo" NO) vive en
// esas policies. Este service sólo agrega validaciones UX previas:
// nada de lo que envíe el navegador modifica las reglas del backend.
//
// Reglas de este archivo:
// - SIN mocks, SIN localStorage, SIN service_role, SIN secretos.
// - SELECT con columnas explícitas; NUNCA SELECT *.
// - El listado sale de la TABLA (no de storage.list()).
// - Lectura/escritura de archivos siempre por storage_path real
//   obtenido bajo RLS desde la tabla; la UI trabaja sólo por docId.
// - NUNCA getPublicUrl(): el bucket es privado, sólo signed URL de
//   60 segundos (createSignedUrl(..., 60)).
// - Upload con upsert: false. El path es SIEMPRE
//   trabajadores/{trabajador_id}/{crypto.randomUUID()}; el
//   nombre_original NUNCA entra en el path (evita colisiones,
//   inyección de path y problemas de encoding).
// - El INSERT de metadata NO envía creado_por ni created_at:
//   los decide el backend (auth.uid() / DEFAULT now()).
// - Compensación: si el INSERT de metadata falla después de un
//   upload exitoso, se retira el archivo con storage.remove([path])
//   para no dejar archivos huérfanos.
// - DELETE: primero Storage, y SÓLO si Storage confirma se elimina
//   la fila de trabajadores_documentos.
// - Caché interna por trabajador: se invalida tras subir y eliminar
//   (la fuente de verdad siempre es Supabase).
// - Errores: console.error con contexto y re-lanzamiento. Nunca se
//   registran signed URLs ni nombres de archivos en consola.
// - Los datos NO se guardan en localStorage (Ley 21.719).

// Bucket privado de documentos (ya creado y validado en backend).
const DOCUMENTOS_BUCKET = 'documentos-trabajadores';

// Límite del bucket (10 MB). Sólo validación UX: la autoridad es
// la política de tamaño del Storage.
const DOCUMENTOS_TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

// MIME permitidos por el bucket (minúsculas, sin parámetros).
const DOCUMENTOS_MIME_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
];

// Validación de UUID (trabajadores.id y trabajadores_documentos.id
// son uuid). Se usa además como DEFENSA contra path traversal: el
// id del trabajador forma parte del path dentro del bucket.
const DOCUMENTOS_REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Error con mensaje pensado para la persona usuaria (sin SQL, sin
// policies, sin paths, sin UUID internos ni detalles sensibles).
// La vista usa e.mensajeUsuario si existe; si no, traduce el error.
function documentosErrorUsuario(mensaje) {
  const error = new Error(mensaje);
  error.mensajeUsuario = mensaje;
  return error;
}

window.TrabajadoresDocumentosService = {
  // Caché interna: clave = trabajador_id (uuid) -> array de filas.
  // Sólo acelera la lectura; NUNCA es la fuente de verdad.
  _documentosCache: {},

  // ----------------------------------------------------------
  // _validarId(valor, mensaje)
  // Exige un UUID real. Además protege el armado del path de
  // storage (nunca se concatena texto libre).
  // ----------------------------------------------------------
  _validarId(valor, mensaje) {
    const id = typeof valor === 'string' ? valor.trim() : '';
    if (!id || !DOCUMENTOS_REGEX_UUID.test(id)) {
      throw documentosErrorUsuario(mensaje);
    }
    return id;
  },

  // ----------------------------------------------------------
  // _validarDocId(valor, mensaje)
  // docId SÓLO se usa en .eq('id', ...) (nunca en un path de
  // storage), por lo que basta con exigir un identificador no
  // vacío de tipo texto. Si el valor no existe, PostgREST lo
  // rechaza igualmente bajo RLS.
  // ----------------------------------------------------------
  _validarDocId(valor, mensaje) {
    const id = typeof valor === 'string' ? valor.trim() : '';
    if (!id) {
      throw documentosErrorUsuario(mensaje);
    }
    return id;
  },

  // ----------------------------------------------------------
  // getDocumentos(trabajadorId, force = false)
  // Lista REAL desde public.trabajadores_documentos filtrando por
  // trabajador_id, ordenada created_at DESC (desempate id ASC).
  // Columnas explícitas; NO se selecciona storage_path porque la
  // lista no lo necesita ni lo muestra. NO se usa storage.list().
  // ----------------------------------------------------------
  async getDocumentos(trabajadorId, force = false) {
    const id = this._validarId(
      trabajadorId,
      'No se identificó el trabajador. Cierra y vuelve a abrir la ficha.'
    );

    if (!force && this._documentosCache[id]) return this._documentosCache[id];

    try {
      const { data: documentos, error } = await window.supabaseClient
        .from('trabajadores_documentos')
        .select('id, nombre_original, mime_type, tamano_bytes, created_at')
        .eq('trabajador_id', id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true }); // desempate estable

      if (error) throw error;

      this._documentosCache[id] = documentos || [];
      return this._documentosCache[id];
    } catch (e) {
      console.error('Error completo Supabase en TrabajadoresDocumentosService.getDocumentos:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // subirDocumento(trabajadorId, file)
  // Flujo: validaciones UX -> upload Storage -> INSERT metadata.
  // Éxito SOLO si upload + INSERT funcionan.
  //
  // Si el upload falla: se DETIENE (no se inserta nada).
  // Si el INSERT falla tras un upload exitoso: COMPENSACIÓN con
  // storage.remove([path]) para no dejar archivo huérfano.
  //
  // Path EXACTO: trabajadores/{trabajador_id}/{crypto.randomUUID()}
  // El nombre_original NUNCA forma parte del path.
  //
  // El INSERT envía ÚNICAMENTE: trabajador_id, storage_path,
  // nombre_original, mime_type y tamano_bytes. NO se envía
  // creado_por ni created_at (los decide el backend).
  //
  // Devuelve { trabajadorId, nombreOriginal, mimeType, tamanoBytes }
  // (NUNCA storage_path).
  // ----------------------------------------------------------
  async subirDocumento(trabajadorId, file) {
    const id = this._validarId(
      trabajadorId,
      'No se identificó el trabajador. Cierra y vuelve a abrir la ficha.'
    );

    // ---- Validaciones UX (la seguridad real es Storage/RLS) ----
    if (!file) {
      throw documentosErrorUsuario('Debes seleccionar un archivo.');
    }

    const nombreOriginal = typeof file.name === 'string' ? file.name.trim() : '';
    if (!nombreOriginal) {
      throw documentosErrorUsuario('El archivo seleccionado no tiene nombre.');
    }

    const tamano = typeof file.size === 'number' ? file.size : 0;
    if (tamano <= 0) {
      throw documentosErrorUsuario('El archivo está vacío.');
    }
    if (tamano > DOCUMENTOS_TAMANO_MAXIMO_BYTES) {
      throw documentosErrorUsuario('El archivo supera el máximo permitido de 10 MB.');
    }

    const mimeType = typeof file.type === 'string' ? file.type.trim().toLowerCase() : '';
    if (DOCUMENTOS_MIME_PERMITIDOS.indexOf(mimeType) === -1) {
      throw documentosErrorUsuario('Formato no permitido. Usa PDF, JPG, PNG o WEBP.');
    }

    // ---- Path del archivo: uuid generado en el navegador ----
    if (!window.crypto || typeof window.crypto.randomUUID !== 'function') {
      throw documentosErrorUsuario(
        'Tu navegador no permite generar identificadores seguros. Usa HTTPS y vuelve a intentar.'
      );
    }
    const archivoUuid = window.crypto.randomUUID();
    const storagePath = `trabajadores/${id}/${archivoUuid}`;

    // ---- 1. UPLOAD real (bucket privado, sin sobrescritura) ----
    const { error: errorUpload } = await window.supabaseClient.storage
      .from(DOCUMENTOS_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false
      });

    // Upload falló: DETENER. No se inserta metadata.
    if (errorUpload) {
      console.error('Error subiendo archivo a Storage en TrabajadoresDocumentosService.subirDocumento:', errorUpload);
      throw errorUpload;
    }

    // ---- 2. INSERT de metadata (sin creado_por ni created_at) ----
    // Se inserta SIN .select()/RETURNING: el éxito lo define el
    // error de PostgREST (42501 si RLS lo rechaza). Así un INSERT
    // correcto no puede confundirse con un fallo por no poder
    // releer la fila recién creada.
    let errorInsert = null;
    try {
      const resultado = await window.supabaseClient
        .from('trabajadores_documentos')
        .insert([{
          trabajador_id: id,
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
        'Error insertando metadata de documento; se intenta compensar el archivo subido:',
        errorInsert
      );
      try {
        const { error: errorCompensacion } = await window.supabaseClient.storage
          .from(DOCUMENTOS_BUCKET)
          .remove([storagePath]);
        if (errorCompensacion) {
          // No se puede hacer más: se informa sin fingir éxito.
          console.error('No fue posible retirar el archivo tras el fallo del INSERT:', errorCompensacion);
        }
      } catch (eCompensacion) {
        console.error('No fue posible retirar el archivo tras el fallo del INSERT:', eCompensacion);
      }
      throw errorInsert;
    }

    // Éxito real: upload + metadata confirmados por Supabase.
    // Se invalida la caché de este trabajador para releer desde
    // Supabase en la siguiente consulta.
    this.clearCache(id);
    return {
      trabajadorId: id,
      nombreOriginal: nombreOriginal,
      mimeType: mimeType,
      tamanoBytes: tamano
    };
  },

  // ----------------------------------------------------------
  // crearUrlTemporal(docId, opciones = {})
  // Flujo SIEMPRE por docId (nunca por storage_path de la UI):
  //   docId -> metadata real bajo RLS -> storage_path -> signed URL.
  // Nunca getPublicUrl(): el bucket es privado.
  //
  // La signed URL dura 60 segundos.
  // opciones.descargar = true agrega el nombre_original como nombre
  // de descarga (soportado por supabase-js createSignedUrl).
  //
  // Devuelve { url, nombreOriginal, mimeType, expiraEnSegundos }.
  // ----------------------------------------------------------
  async crearUrlTemporal(docId, opciones = {}) {
    const id = this._validarDocId(
      docId,
      'No se identificó el documento. Actualiza la lista e intenta nuevamente.'
    );

    // Metadata real (bajo RLS). De aquí sale el storage_path: la UI
    // jamás lo aporta.
    const { data: documento, error } = await window.supabaseClient
      .from('trabajadores_documentos')
      .select('id, trabajador_id, storage_path, nombre_original, mime_type')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!documento || !documento.storage_path) {
      throw documentosErrorUsuario('El documento ya no está disponible. Actualiza la lista.');
    }

    const quiereDescargar = !!(opciones && opciones.descargar);
    const opcionesFirma = (quiereDescargar && documento.nombre_original)
      ? { download: documento.nombre_original }
      : undefined;

    // Signed URL PRIVADA de 60 segundos. NUNCA getPublicUrl().
    const { data: firma, error: errorFirma } = await window.supabaseClient.storage
      .from(DOCUMENTOS_BUCKET)
      .createSignedUrl(documento.storage_path, 60, opcionesFirma);

    if (errorFirma) throw errorFirma;
    if (!firma || !firma.signedUrl) {
      throw documentosErrorUsuario('No se pudo generar el enlace temporal del documento.');
    }

    return {
      url: firma.signedUrl,
      nombreOriginal: documento.nombre_original,
      mimeType: documento.mime_type,
      expiraEnSegundos: 60
    };
  },

  // ----------------------------------------------------------
  // eliminarDocumento(docId)
  // Orden OBLIGATORIO:
  //   1. metadata real por docId (bajo RLS)
  //   2. Storage PRIMERO  -> storage.remove([storage_path])
  //   3. sólo si Storage confirma -> DELETE de la fila
  //   4. invalidar caché del trabajador
  //
  // Si Storage falla: NO se borra la metadata.
  // Si Storage responde pero el DELETE no afecta filas (RLS): se
  // lanza error claro; NO se finge éxito.
  // ----------------------------------------------------------
  async eliminarDocumento(docId) {
    const id = this._validarDocId(
      docId,
      'No se identificó el documento. Actualiza la lista e intenta nuevamente.'
    );

    // 1. Metadata real: el storage_path sale SIEMPRE de la tabla.
    const { data: documento, error } = await window.supabaseClient
      .from('trabajadores_documentos')
      .select('id, trabajador_id, storage_path, nombre_original, mime_type')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!documento || !documento.storage_path) {
      throw documentosErrorUsuario('El documento ya no está disponible. Actualiza la lista.');
    }

    // 2. STORAGE PRIMERO.
    let errorStorage = null;
    try {
      const resultado = await window.supabaseClient.storage
        .from(DOCUMENTOS_BUCKET)
        .remove([documento.storage_path]);
      errorStorage = resultado.error;
    } catch (e) {
      errorStorage = e;
    }

    if (errorStorage) {
      // Storage NO confirmó: se aborta y la fila queda intacta.
      console.error('Error eliminando archivo de Storage en TrabajadoresDocumentosService.eliminarDocumento:', errorStorage);
      throw errorStorage;
    }

    // 3. SÓLO AHORA se elimina la fila de metadata.
    let filasBorradas = null;
    let errorDelete = null;
    try {
      const resultado = await window.supabaseClient
        .from('trabajadores_documentos')
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
      throw documentosErrorUsuario(
        'El archivo se retiró del almacenamiento, pero no se pudo eliminar el registro del documento. Intenta nuevamente.'
      );
    }

    // Bajo RLS, un DELETE sin permiso no da error: devuelve 0 filas.
    // Eso NO es éxito.
    if (!Array.isArray(filasBorradas) || filasBorradas.length === 0) {
      throw documentosErrorUsuario(
        'El archivo se retiró del almacenamiento, pero no se pudo eliminar el registro del documento. Contacta al administrador.'
      );
    }

    // 4. Éxito real: se invalida la caché de ese trabajador.
    this.clearCache(documento.trabajador_id);
    return { id: documento.id, trabajadorId: documento.trabajador_id };
  },

  // ----------------------------------------------------------
  // clearCache(trabajadorId)
  // Sin argumento: limpia toda la caché. Con argumento: limpia sólo
  // la de ese trabajador (usado tras subir/eliminar).
  // ----------------------------------------------------------
  clearCache(trabajadorId) {
    if (trabajadorId === undefined || trabajadorId === null || trabajadorId === '') {
      this._documentosCache = {};
      return;
    }
    delete this._documentosCache[String(trabajadorId)];
  }
};
