// ==========================================================
// SERVICIO: HISTORIAL DE REVISIONES - HOTEL EL ALMENDRO
// ==========================================================
// FASE C2C-2A: Service real de Supabase para el motor de
// revisiones/estado operacional (Capa 3 — mantencion_historial).
// PILOTO: TV Habitaciones / Control Deco funciona.
// Fase C2D-2D1: se soportan DOS tipos de entidad reales:
//   - 'televisor' → revisiones de estado (estado_operativo y el piloto
//     control_deco_funciona) sobre televisores_habitaciones;
//   - 'control'   → revisión del estado operativo y EVENTOS
//     (cambio_pilas) sobre las 56 filas del dominio Pilas/Controles en
//     elementos_mantenibles.
//
// Patrón técnico: js/services/trabajadores.service.js y
// js/services/usuarios.service.js.
// Acceso a datos real vía window.supabaseClient. NO se crea otro
// cliente Supabase.
//
// Tabla real de LECTURA: public.mantencion_historial
// (append-only, inmutable; SELECT condicionado por RLS
// public.usuario_habilitado_actual()).
// C2D-2E4: segunda lectura por LOTE a
// public.mantencion_historial_anulaciones (append-only, inmutable)
// para anotar cada evento con `anulacion` (null u objeto). Un registro
// anulado SIGUE en el historial: la anulación es información adicional.
//
// Escritura: EXCLUSIVAMENTE vía RPC transaccional, según el caso:
//   - revisarEstado(...) → public.mantencion_revisar_estado
//     (validación + UPDATE operacional + INSERT del historial en UNA
//     transacción);
//   - registrarEvento(...) → public.mantencion_registrar_evento
//     (SOLO INSERT append-only del evento; SIN UPDATE operacional);
//   - anularHistorial(...) → public.mantencion_anular_historial
//     (C2D-2E4: crea la anulación server-side; exige Administrador
//     PERMANENTE; NO recibe autor/fecha/entidad/estado desde cliente).
// Ambas resuelven el autor desde auth.uid() server-side.
// - NO hay .update() a ninguna tabla.
// - NO hay .insert() a mantencion_historial.
// - NO hay escritura directa a televisores_habitaciones ni a
//   elementos_mantenibles.
// El cliente JAMÁS envía tabla, columna, autor ni fecha.
//
// Seguridad (backend real, fase C2B):
// - Los errores llegan como tokens "TOKEN: mensaje legible"
//   (patrón de public.aprobar_usuario_normal). Este service los
//   traduce a un .codigo usable por la vista, sin exponer SQL.
// - La autorización REAL vive en la RPC (usuario habilitado +
//   es_administrador_actual). La UI solo es presentación.
//
// Convenciones:
// - Caché interna por método/clave (force = true fuerza recarga).
//   NUNCA localStorage (los datos no se guardan en el navegador).
// - SELECT con columnas explícitas; NUNCA SELECT *.
// - Los valores llegan tal cual: valor_anterior/valor_nuevo son
//   escalares jsonb (true/false/null/string/number) y el service NO
//   los convierte. observacion puede ser NULL y se devuelve NULL;
//   el texto neutro lo agrega la presentación.
// - Errores: console.error con contexto y re-lanzamiento. NUNCA se
//   devuelven mocks ni se usa fallback local.

// Tokens de error del backend (formato "TOKEN: mensaje").
// Se usan para traducir el error de PostgreSQL al campo .codigo
// que consume la vista, sin exponer SQL ni policies al usuario.
const HISTORIAL_CODIGOS_ERROR_RPC = [
  'SESION_INVALIDA',
  'NO_AUTORIZADO',
  'CAMPO_NO_PERMITIDO',
  'CONFIG_INCOMPLETA',
  'ENTIDAD_NO_ENCONTRADA',
  'TIPO_NO_IMPLEMENTADO',
  'VALOR_INVALIDO',
  'VALOR_NO_PERMITIDO',
  // C2D-2E4: doble anulación detectada por la RPC
  // public.mantencion_anular_historial (UNIQUE historial_id + locks).
  'REGISTRO_YA_ANULADO'
];

// Extrae el token de error de la RPC desde el objeto de error de
// PostgREST (message / details / hint). Devuelve null si no hay.
function historialExtraerCodigoErrorRPC(err) {
  if (!err || typeof err !== 'object') return null;
  if (err.codigo) return err.codigo; // ya asignado por validaciones locales

  const texto = [err.message, err.details, err.hint]
    .filter(v => typeof v === 'string' && v !== '')
    .join(' ');

  if (!texto) return null;

  for (let i = 0; i < HISTORIAL_CODIGOS_ERROR_RPC.length; i++) {
    const token = HISTORIAL_CODIGOS_ERROR_RPC[i];
    // Coincidencia como palabra completa, con o sin ": " posterior.
    if (new RegExp('\\b' + token + '\\b').test(texto)) return token;
  }
  return null;
}

// 38I.3: compartir solo verificaciones simultáneas del MISMO lote en memoria.
// No conservar resultados, permisos ni tokens. Auth separa incluso sesiones del mismo usuario.
const historialEtiquetasEnCurso = (() => {
  let pendientes=new WeakMap();
  window.supabaseClient?.auth?.onAuthStateChange?.(()=>{pendientes=new WeakMap();});
  const normalizar=v=>Array.isArray(v)?v.map(normalizar).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalizar(v[k])])):v;
  const firma=()=>JSON.stringify([state.currentUser?.id,state.currentUser?.role,
    state.currentUser?.esAdminPermanente,state.currentUser?.esAdminTemporal,state.currentUser?.adminTemporalHasta,
    state.currentUser?.trabajador_id,normalizar(state.currentUser?.permissions??null),
    typeof sesionNoVerificable==='undefined'?false:sesionNoVerificable,
    typeof sesionEnReconexion==='undefined'?false:sesionEnReconexion,
    typeof esAdminOperativoActual==='function'?esAdminOperativoActual():null]);
  return async filas=>{
    if(!filas.length||!window.UsuariosService?.anotarNombresHistoricos)return filas;
    const perfil=state.currentUser, contexto=firma(), mapa=pendientes;
    const anterior=mapa.get(filas);
    if(anterior&&anterior.perfil===perfil&&anterior.contexto===contexto)return anterior.promesa;
    const entrada={perfil,contexto};
    entrada.promesa=Promise.resolve().then(()=>{if(firma()!==contexto)throw Error('La sesión o los permisos cambiaron durante la consulta.');return window.UsuariosService.anotarNombresHistoricos('HISTORIAL',filas);})
      .then(resultado=>{if(firma()!==contexto)throw Error('La sesión o los permisos cambiaron durante la consulta.');return resultado;});
    mapa.set(filas,entrada);
    const limpiar=()=>{if(mapa.get(filas)===entrada)mapa.delete(filas);};
    entrada.promesa.then(limpiar,limpiar);
    return entrada.promesa;
  };
})();

window.HistorialService = {
  // Caché por clave: tipoEntidad + '|' + entidadId + '|' + (campo || '')
  _revisionesCache: {},

  // Clave estable de caché (misma fórmula en getRevisiones y en la
  // invalidación tras una revisión).
  _claveRevisiones(tipoEntidad, entidadId, campo) {
    return String(tipoEntidad) + '|' + String(entidadId) + '|' + (campo === null || campo === undefined ? '' : String(campo));
  },

  // ----------------------------------------------------------
  // getRevisiones(tipoEntidad, entidadId, campo = null, force = false)
  // Eventos de mantencion_historial de UNA entidad, ordenados por
  // created_at DESC (lo más reciente primero).
  // Columnas explícitas (sin select('*')). Devuelve los valores tal
  // cual: valor_anterior/valor_nuevo pueden ser null; observacion y
  // autor_nombre_snapshot pueden ser null. El service NO rellena nada.
  //
  // C2D-2E4 — enriquecimiento con anulaciones:
  // - Un registro anulada NO se elimina ni se oculta: sigue apareciendo
  //   en el historial con TODOS sus campos originales intactos.
  // - Segunda consulta ÚNICA por lote (NUNCA N+1) a
  //   public.mantencion_historial_anulaciones con historial_id IN (ids).
  // - Cada evento agrega el campo adicional `anulacion` (null u objeto).
  // - FAIL CLOSED: si la lectura de anulaciones falla, se propaga el
  //   error (console.error + throw). NO se devuelve el historial con
  //   anulacion = null porque eso podría mostrar una revisión anulada
  //   como válida.
  // - La caché SOLO se llena después del merge (resultado enriquecido).
  // ----------------------------------------------------------
  async getRevisiones(tipoEntidad, entidadId, campo = null, force = false) {
    if (!tipoEntidad || typeof tipoEntidad !== 'string') {
      throw new Error('HistorialService.getRevisiones: falta el tipoEntidad.');
    }
    if (!entidadId) {
      throw new Error('HistorialService.getRevisiones: falta el entidadId.');
    }

    const clave = this._claveRevisiones(tipoEntidad, entidadId, campo);
    if (!force && this._revisionesCache[clave]) {
      return historialEtiquetasEnCurso(this._revisionesCache[clave]);
    }

    try {
      let consulta = window.supabaseClient
        .from('mantencion_historial')
        .select('id, tipo_entidad, entidad_id, campo, accion, valor_anterior, valor_nuevo, observacion, revisado_por, autor_nombre_snapshot, created_at')
        .eq('tipo_entidad', tipoEntidad)
        .eq('entidad_id', entidadId);

      if (campo !== null && campo !== undefined && campo !== '') {
        consulta = consulta.eq('campo', campo);
      }

      const { data, error } = await consulta
        .order('created_at', { ascending: false });

      if (error) throw error;

      const revisiones = data || [];

      // Sin registros: nada que anotar, se devuelve [] normalmente
      // (sin consulta extra a anulaciones).
      if (revisiones.length === 0) {
        this._revisionesCache[clave] = revisiones;
        return revisiones;
      }

      // SEGUNDA CONSULTA POR LOTE (una sola) a anulaciones.
      const ids = revisiones.map(r => r.id);
      const { data: anulaciones, error: errorAnulaciones } = await window.supabaseClient
        .from('mantencion_historial_anulaciones')
        .select('historial_id, motivo, anulado_por, autor_nombre_snapshot, created_at')
        .in('historial_id', ids);

      // FAIL CLOSED: lectura de anulaciones fallida ⇒ propagar.
      if (errorAnulaciones) {
        console.error('Error leyendo mantencion_historial_anulaciones en HistorialService.getRevisiones:', errorAnulaciones);
        throw errorAnulaciones;
      }

      const porHistorialId = new Map();
      (anulaciones || []).forEach(a => {
        porHistorialId.set(a.historial_id, {
          historial_id: a.historial_id,
          motivo: a.motivo,
          anulado_por: a.anulado_por,
          autor_nombre_snapshot: a.autor_nombre_snapshot,
          created_at: a.created_at
        });
      });

      // MERGE: conserva TODOS los campos originales y agrega `anulacion`.
      const enriquecidas = revisiones.map(r => Object.assign({}, r, {
        anulacion: porHistorialId.has(r.id) ? porHistorialId.get(r.id) : null
      }));

      this._revisionesCache[clave] = enriquecidas;
      return await historialEtiquetasEnCurso(enriquecidas);
    } catch (e) {
      console.error('Error completo Supabase en HistorialService.getRevisiones:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // revisarEstado({ tipoEntidad, entidadId, campo, valorNuevo, observacion })
  // ÚNICA escritura del service: llama a la RPC transaccional
  // public.mantencion_revisar_estado. El backend valida sesión,
  // habilitación, administración, campo configurado, tipo de valor y
  // existencia de la entidad, hace el UPDATE operacional (solo si hace
  // falta) y registra SIEMPRE el evento de historial, todo en una
  // sola transacción (TODO o NADA).
  // NO se envía autor: la RPC lo resuelve desde auth.uid().
  // Devuelve el jsonb de la RPC: { ok, valor_anterior, valor_nuevo,
  // cambio, created_at }.
  // Tras el éxito invalida: la caché de historial de esa
  // entidad/campo y la caché de televisores de MantencionesService.
  // ----------------------------------------------------------
  async revisarEstado(datos = {}) {
    const tipoEntidad = typeof datos.tipoEntidad === 'string' ? datos.tipoEntidad.trim() : '';
    const entidadId = datos.entidadId || null;
    const campo = typeof datos.campo === 'string' ? datos.campo.trim() : '';

    if (!tipoEntidad) {
      throw new Error('HistorialService.revisarEstado: falta el tipoEntidad.');
    }
    if (!entidadId) {
      throw new Error('HistorialService.revisarEstado: falta el entidadId.');
    }
    if (!campo) {
      throw new Error('HistorialService.revisarEstado: falta el campo.');
    }
    // valorNuevo puede ser boolean/string/number/null según el campo
    // configurado en backend; aquí solo se rechaza la ausencia total
    // (undefined), que no es un valor revisable.
    if (datos.valorNuevo === undefined) {
      throw new Error('HistorialService.revisarEstado: falta el valorNuevo.');
    }

    const observacion = (datos.observacion === null || datos.observacion === undefined)
      ? null
      : String(datos.observacion).trim() || null;

    try {
      const { data, error } = await window.supabaseClient.rpc(
        'mantencion_revisar_estado',
        {
          p_tipo_entidad: tipoEntidad,
          p_entidad_id: entidadId,
          p_campo: campo,
          p_valor_nuevo: datos.valorNuevo,
          p_observacion: observacion
        }
      );

      if (error) {
        // Traduce el token backend a un campo .codigo utilizable por la
        // vista; conserva el mensaje original para consola y UI.
        const err = new Error(error.message || 'Error al registrar la revisión.');
        err.codigo = historialExtraerCodigoErrorRPC(error);
        err.detalle = error;
        console.error('Error de RPC en HistorialService.revisarEstado:', error);
        throw err;
      }

      // 1) Invalida la caché de historial de ESTA entidad/campo
      //    (el backend acaba de registrar un evento nuevo).
      delete this._revisionesCache[this._claveRevisiones(tipoEntidad, entidadId, campo)];
      // También cualquier variante sin filtro de campo de la misma entidad.
      delete this._revisionesCache[this._claveRevisiones(tipoEntidad, entidadId, null)];

      // 2) Invalida SOLO la caché de la colección operacional que cambió,
      //    según el tipo de entidad revisada. La fuente de verdad sigue
      //    siendo Supabase; este service NO inventa estado local.
      //    - 'televisor' (piloto TV): se mantiene EXACTAMENTE la
      //      invalidación original de televisores (estado_operativo_actual
      //      / control_deco_funciona_actual).
      //    - 'control' (Pilas y Controles, C2D-2D1): invalida únicamente
      //      la caché real de pilas/controles, vía su método público.
      //    - Cualquier otro tipo futuro: sin invalidación de colecciones.
      if (window.MantencionesService) {
        if (tipoEntidad === 'televisor' &&
            typeof window.MantencionesService.invalidarCacheTelevisores === 'function') {
          window.MantencionesService.invalidarCacheTelevisores();
        } else if (tipoEntidad === 'control' &&
            typeof window.MantencionesService.invalidarCachePilasControles === 'function') {
          window.MantencionesService.invalidarCachePilasControles();
        }
      }

      return data;
    } catch (e) {
      if (!e || !e.codigo) {
        console.error('Error completo en HistorialService.revisarEstado:', e);
      }
      throw e;
    }
  },

  // ----------------------------------------------------------
  // registrarEvento({ tipoEntidad, entidadId, campo, observacion })
  // Fase C2D-2D1 — ÚNICA escritura de EVENTOS (append-only): llama a la
  // RPC transaccional public.mantencion_registrar_evento. El backend
  // valida sesión, habilitación, administración, config del campo
  // (accion='evento') y dominio de la entidad, y registra el evento en
  // mantencion_historial con autor y created_at SIEMPRE server-side.
  // La RPC NO hace UPDATE de ninguna tabla operacional: un evento nunca
  // modifica columnas de estado (a diferencia de revisarEstado).
  // Caso de uso real (vista futura de Pilas y Controles):
  //   tipoEntidad 'control' + campo 'cambio_pilas'.
  // NO hay .insert() a mantencion_historial, NI .update(), NI fecha ni
  // autor desde el cliente. El cliente JAMÁS envía tabla ni columna.
  // Devuelve el jsonb de la RPC: { ok, evento_id, created_at }.
  // Tras el éxito invalida la caché de historial de ESA
  // entidad/campo (y la variante sin filtro). NO invalida colecciones
  // operacionales: el evento no cambia ninguna columna.
  // Errores: mismo patrón que revisarEstado (tokens "TOKEN: mensaje"
  // traducidos a .codigo); los desconocidos van a console.error y se
  // re-lanzan sin ocultarlos.
  // ----------------------------------------------------------
  async registrarEvento(datos = {}) {
    const tipoEntidad = typeof datos.tipoEntidad === 'string' ? datos.tipoEntidad.trim() : '';
    const entidadId = datos.entidadId || null;
    const campo = typeof datos.campo === 'string' ? datos.campo.trim() : '';

    if (!tipoEntidad) {
      throw new Error('HistorialService.registrarEvento: falta el tipoEntidad.');
    }
    if (!entidadId) {
      throw new Error('HistorialService.registrarEvento: falta el entidadId.');
    }
    if (!campo) {
      throw new Error('HistorialService.registrarEvento: falta el campo.');
    }

    const observacion = (datos.observacion === null || datos.observacion === undefined)
      ? null
      : String(datos.observacion).trim() || null;

    try {
      const { data, error } = await window.supabaseClient.rpc(
        'mantencion_registrar_evento',
        {
          p_tipo_entidad: tipoEntidad,
          p_entidad_id: entidadId,
          p_campo: campo,
          p_observacion: observacion
        }
      );

      if (error) {
        // Traduce el token backend a .codigo utilizable por la vista;
        // conserva el mensaje original para consola y UI. Sin SQL expuesto.
        const err = new Error(error.message || 'No fue posible registrar el evento.');
        err.codigo = historialExtraerCodigoErrorRPC(error);
        err.detalle = error;
        console.error('Error de RPC en HistorialService.registrarEvento:', error);
        throw err;
      }

      // Invalida la caché de historial de ESTA entidad/campo (el backend
      // acaba de registrar el evento nuevo) y cualquier variante sin
      // filtro de campo de la misma entidad.
      delete this._revisionesCache[this._claveRevisiones(tipoEntidad, entidadId, campo)];
      delete this._revisionesCache[this._claveRevisiones(tipoEntidad, entidadId, null)];

      return data;
    } catch (e) {
      if (!e || !e.codigo) {
        console.error('Error completo en HistorialService.registrarEvento:', e);
      }
      throw e;
    }
  },

  // ----------------------------------------------------------
  // anularHistorial({ historialId, motivo })
  // C2D-2E4 — ÚNICA escritura de anulación: llama a la RPC
  // public.mantencion_anular_historial.
  // NO borra nada: el registro original en mantencion_historial se
  // conserva; el backend crea un registro append-only en
  // mantencion_historial_anulaciones y (si corresponde) recalcula el
  // estado operacional server-side.
  // El cliente envía EXCLUSIVAMENTE p_historial_id y p_motivo.
  // NO envía: tipo_entidad, entidad_id, campo, accion, anulado_por,
  // autor_nombre_snapshot, created_at, estado resultante, tabla ni
  // columna. La autorización (usuario habilitado + Administrador
  // permanente) es responsabilidad 100% de la RPC.
  // NO hay .insert() / .update() / .delete() ni SQL: solo .rpc().
  // Validación local mínima: historialId obligatorio; motivo
  // obligatorio después de trim (vacío ⇒ falla ANTES de la RPC).
  // Sin límite de longitud inventado.
  // Devuelve el jsonb de la RPC: { ok, historial_id, anulacion_id,
  // tipo_entidad, entidad_id, campo, accion, recalculado,
  // valor_resultante, created_at }.
  // Tras el éxito:
  //   A) vacía COMPLETAMENTE _revisionesCache (invalidación global
  //      segura; no se infieren claves parciales desde historialId);
  //   B) si accion === 'revision', invalida la colección operacional
  //      SEGÚN respuesta.tipo_entidad (selector explícito del backend,
  //      NUNCA inferido desde campo/historialId/UUID/estado resultante):
  //        - 'control'   → invalidarCachePilasControles();
  //        - 'televisor' → invalidarCacheTelevisores();
  //        - cualquier otro tipo futuro ⇒ sin invalidación operacional
  //          (console.warn técnico; la anulación ya está confirmada);
  //   C) si accion === 'evento' NO invalida ninguna colección
  //      operacional (cambio de pilas no modifica estado).
  // La RPC recalcula estado_operativo_actual server-side cuando
  // accion = revision; este service NUNCA recalcula estado.
  // NO hay actualización optimista: este service no toca
  // estado_operativo_actual ni marca objetos como anulados; la vista
  // futura deberá releer Supabase.
  // ----------------------------------------------------------
  async anularHistorial(datos = {}) {
    const historialId = datos.historialId || null;
    const motivo = typeof datos.motivo === 'string' ? datos.motivo.trim() : '';

    if (!historialId) {
      throw new Error('HistorialService.anularHistorial: falta el historialId.');
    }
    if (!motivo) {
      const err = new Error('HistorialService.anularHistorial: el motivo es obligatorio.');
      err.codigo = 'MOTIVO_REQUERIDO';
      throw err;
    }

    try {
      const { data, error } = await window.supabaseClient.rpc(
        'mantencion_anular_historial',
        {
          p_historial_id: historialId,
          p_motivo: motivo
        }
      );

      if (error) {
        // Traduce el token backend (p. ej. REGISTRO_YA_ANULADO,
        // NO_AUTORIZADO) a .codigo utilizable por la vista; conserva el
        // mensaje original para consola y UI. Sin SQL expuesto.
        const err = new Error(error.message || 'No fue posible anular el registro.');
        err.codigo = historialExtraerCodigoErrorRPC(error);
        err.detalle = error;
        console.error('Error de RPC en HistorialService.anularHistorial:', error);
        throw err;
      }

      const respuesta = Array.isArray(data) ? (data[0] || null) : data;

      // A) Invalidación GLOBAL de la caché de historial: segura y simple
      //    para esta primera versión (no se infiere por historialId).
      this._revisionesCache = {};

      // B)/C) Solo una REVISIÓN cambia estado operacional, y la colección
      //    a invalidar depende del TIPO DE ENTIDAD explícito que devuelve
      //    el backend (respuesta.tipo_entidad). NUNCA se infiere desde
      //    campo, historialId, texto, UUID ni estado resultante.
      //    - 'control' (Pilas y Controles) → invalida SOLO la caché de
      //      pilas/controles.
      //    - 'televisor' (TV Habitaciones, C2D-3C) → invalida SOLO la
      //      caché de televisores (estado_operativo_actual recalculado
      //      server-side por la RPC).
      //    - accion === 'evento' (p. ej. cambio de pilas) → NO invalida
      //      ninguna colección operacional: un evento no cambia estado.
      //    - Tipo de entidad FUTURO/DESCONOCIDO con accion 'revision' →
      //      sin invalidación operacional (console.warn técnico). NO se
      //      lanza error tras una RPC ya exitosa solo porque el frontend
      //      aún no conozca el tipo: la anulación ya quedó confirmada.
      if (respuesta && respuesta.accion === 'revision' && window.MantencionesService) {
        if (respuesta.tipo_entidad === 'control' &&
            typeof window.MantencionesService.invalidarCachePilasControles === 'function') {
          window.MantencionesService.invalidarCachePilasControles();
        } else if (respuesta.tipo_entidad === 'televisor' &&
            typeof window.MantencionesService.invalidarCacheTelevisores === 'function') {
          window.MantencionesService.invalidarCacheTelevisores();
        } else if (respuesta.tipo_entidad !== 'control' && respuesta.tipo_entidad !== 'televisor') {
          console.warn('HistorialService.anularHistorial: tipo_entidad sin caché operacional conocida tras la anulación:', respuesta.tipo_entidad);
        }
      }

      return respuesta;
    } catch (e) {
      if (!e || !e.codigo) {
        console.error('Error completo en HistorialService.anularHistorial:', e);
      }
      throw e;
    }
  },

  // ----------------------------------------------------------
  // clearCache()
  // Vacía toda la caché interna de revisiones.
  // ----------------------------------------------------------
  clearCache() {
    this._revisionesCache = {};
  }
};
