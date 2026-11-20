// ==========================================================
// SERVICIO: MANTENCIÓN GENERAL - HOTEL EL ALMENDRO
// ==========================================================
// Patrón: js/services/remodelaciones.service.js
// Acceso a datos reales vía window.supabaseClient (RLS: authenticated).
//
// Convenciones:
// - Caché simple por función (force = true fuerza recarga).
// - Consultas agrupadas con Promise.all (evita N+1).
// - SELECT con columnas explícitas documentadas en HANDOFF_MANTENCION_GENERAL.md.
// - NULL nunca se convierte a 0; la vista lo muestra como "Sin dato registrado".
// - Escritura: SOLO mediante RPCs server-side (Fase C2G-5 — Guía
//   Preventiva). NUNCA .insert() / .update() / .delete() desde el cliente:
//   las tablas de guía tienen RLS de solo lectura para authenticated y las
//   RPCs exigen Administrador permanente server-side + auditoría server-side.
//   El resto de los apartados sigue siendo de solo lectura.

// Archivo de origen operacional de Puertas / Engrase.
// Su Hoja2 también importada desde _LISTA FOSAS DE ALCANTARILLADOS.xlsx
// se conserva en la base por trazabilidad, pero se excluye de la vista
// operacional de Puertas / Engrase (ver getResumen y getEngraseAceitado).
const ARCHIVO_ENGRASE_ACEITADO = 'LISTA DE PUERTAS POR ENGRASAR Y ACEITAR.xlsx';

// Fuente operacional de Baños (Fase 2.3).
// La identificación de Baños se hace por TRAZABILIDAD REAL
// (archivo_origen + hoja_origen), NUNCA por texto del nombre:
// el filtro anterior por nombre_original ILIKE '%baño%' traía 6 falsos
// positivos (baños de otros archivos) y perdía 6 baños públicos reales
// cuyo nombre no contenía "baño". Ambos criterios daban 32 por casualidad,
// pero no eran los mismos 32 registros.
const ARCHIVO_BANOS = 'MANTENCION DE BAÑOS.xlsx';
const HOJA_BANOS = 'Hoja1';

// C2E-2/3 — Fuente EXCLUSIVA del subapartado "Catálogo General e Historial".
// Solo los elementos de este archivo pertenecen a este catálogo: los otros
// archivos (pilas, TV, puertas, fosas, baños) tienen subapartado propio y
// están CERRADOS. El filtrado se hace EN SUPABASE (.eq), nunca solo visual.
const ARCHIVO_CATALOGO_GENERAL = 'LISTA DE MANTENCIONES.xlsx';

// C2E-4C — Hojas PERMITIDAS en el Catálogo General (decisión aprobada).
// MAQUINAS (48 equipos / 110 mantenciones) sale de este subapartado y se
// muestra EXCLUSIVAMENTE en Áreas de Trabajo → Mantención de Máquinas.
// Resultado: 66 elementos (LUGAR 15 + RADIADORES 32 + REFRIGERADOR 19) y
// 64 mantenciones históricas (15 + 30 + 19).
// El filtrado es EN SUPABASE (.in), nunca solo visual, y NO mueve ni copia
// ningún registro: los UUID y relaciones siguen intactos.
const HOJAS_CATALOGO_GENERAL = ['LUGAR', 'RADIADORES', 'REFRIGERADOR'];

// Hoja EXCLUSIVA de Áreas de Trabajo → Mantención de Máquinas.
const HOJA_MAQUINAS = 'MAQUINAS';

// Fuente operacional de Pilas y Controles (Fase 2.4).
// La identificación se hace por TRAZABILIDAD REAL (archivo_origen +
// hoja_origen), NUNCA por texto del nombre, el grupo ni el nemotécnico:
// el criterio anterior grupo_origen/nemotecnico ILIKE '%CONTROL%' coincidía
// hoy con los mismos 56 registros (verificado: 0 falsos positivos y
// 0 falsos negativos), pero depende de un texto que puede cambiar.
// El archivo define 28 HAB; cada HAB produjo 1 CONTROL TV + 1 CONTROL DECO
// = 56 elementos y 0 mantenciones (columnas C/E vacías en el Excel).
const ARCHIVO_PILAS = 'MANTENCION DE PILAS.xlsx';
const HOJA_PILAS = 'Hoja1';

// ------------------------------------------------------------
// GUÍA PREVENTIVA — AYUDAS DE ESCRITURA (Fase C2G-5)
// ------------------------------------------------------------
// Extrae el token de error de la RPC desde el objeto de error de PostgREST
// (message / details / hint). Devuelve null si no hay.
// Mismo enfoque que historialExtraerCodigoErrorRPC en
// js/services/historial.service.js, pero SIN lista fija de tokens: el
// backend de Guía Preventiva es nuevo y un token desconocido no debe
// quedar oculto. Se reconoce el formato "TOKEN: mensaje" del backend.
function guiaExtraerCodigoErrorRPC(err) {
  if (!err || typeof err !== 'object') return null;
  if (err.codigo) return err.codigo; // ya asignado por validaciones locales

  const texto = [err.message, err.details, err.hint]
    .filter(v => typeof v === 'string' && v !== '')
    .join(' ');

  if (!texto) return null;

  // Palabra en mayúsculas seguida de ":" (inicio de texto o tras ". " /
  // " "), sin capturar SQLSTATE ni palabras normales de la oración.
  const coincidencia = texto.match(/(?:^|[\.\s])([A-Z][A-Z0-9_]{3,})(?=:)/);
  return (coincidencia && coincidencia[1]) ? coincidencia[1] : null;
}

// Envuelve un error REAL de Supabase conservando su mensaje original y
// agregando .codigo (token del backend, si existe) y .detalle. NUNCA se
// inventan mensajes silenciosos ni se convierte el error en un fallback
// local: el error se relanza siempre.
function guiaErrorRPC(contexto, error) {
  const mensaje = (error && typeof error.message === 'string' && error.message)
    ? error.message
    : 'Error de Supabase al guardar el contenido de la guía.';
  const err = new Error(mensaje);
  err.codigo = guiaExtraerCodigoErrorRPC(error);
  err.detalle = (error === undefined || error === null) ? null : error;
  console.error('Error de RPC en ' + contexto + ':', error);
  return err;
}

// C2P-4B — Prevencionista. Mismo enfoque que guiaErrorRPC: conserva el
// mensaje REAL de Supabase (nunca se oculta ni se sustituye por un
// fallback local) y agrega .codigo (token "TOKEN: mensaje" del backend si
// existe) + .detalle para que la vista pueda mostrarlo junto al formulario
// sin perder el detalle. El error se relanza siempre: sin éxito NO hay
// window.location.reload().
function prevencionErrorRPC(contexto, error) {
  const mensaje = (error && typeof error.message === 'string' && error.message)
    ? error.message
    : 'Error de Supabase al guardar en Prevencionista.';
  const err = new Error(mensaje);
  err.codigo = guiaExtraerCodigoErrorRPC(error);
  err.detalle = (error === undefined || error === null) ? null : error;
  console.error('Error de RPC en ' + contexto + ':', error);
  return err;
}

// ------------------------------------------------------------
// JARDINERÍA — AYUDA DE ESCRITURA (C2J-4)
// ------------------------------------------------------------
// Mismo enfoque que guiaErrorRPC: conserva el mensaje REAL de Supabase y
// agrega .codigo (token "TOKEN: mensaje" del backend, si existe) y
// .detalle. El error SIEMPRE se relanza; nunca se inventa un fallback.
function jardineriaErrorRPC(contexto, error) {
  const mensaje = (error && typeof error.message === 'string' && error.message)
    ? error.message
    : 'Error de Supabase al guardar el contenido de jardinería.';
  const err = new Error(mensaje);
  err.codigo = guiaExtraerCodigoErrorRPC(error);
  err.detalle = (error === undefined || error === null) ? null : error;
  console.error('Error de RPC en ' + contexto + ':', error);
  return err;
}

// C2E-4E4 / F2 — Mantenciones operativas. Mismo enfoque que guiaErrorRPC:
// conserva el mensaje REAL de Supabase (nunca se oculta ni se sustituye por
// un fallback local) y agrega .codigo (token "TOKEN: mensaje" del backend,
// si existe) + .detalle para que la vista pueda mostrarlo. El error se
// relanza SIEMPRE: sin éxito no hay ninguna actualización local.
function operativaErrorRPC(contexto, error) {
  const mensaje = (error && typeof error.message === 'string' && error.message)
    ? error.message
    : 'Error de Supabase al registrar la mantención operativa.';
  const err = new Error(mensaje);
  err.codigo = guiaExtraerCodigoErrorRPC(error);
  err.detalle = (error === undefined || error === null) ? null : error;
  console.error('Error de RPC en ' + contexto + ':', error);
  return err;
}

// 38I.3: compartir solo verificaciones simultáneas del MISMO lote en memoria.
// No conservar resultados, permisos ni tokens. Auth separa incluso sesiones del mismo usuario.
const mantencionesEtiquetasEnCurso = (() => {
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
    entrada.promesa=Promise.resolve().then(()=>{if(firma()!==contexto)throw Error('La sesión o los permisos cambiaron durante la consulta.');return window.UsuariosService.anotarNombresHistoricos('MANTENCIONES',filas);})
      .then(resultado=>{if(firma()!==contexto)throw Error('La sesión o los permisos cambiaron durante la consulta.');return resultado;});
    mapa.set(filas,entrada);
    const limpiar=()=>{if(mapa.get(filas)===entrada)mapa.delete(filas);};
    entrada.promesa.then(limpiar,limpiar);
    return entrada.promesa;
  };
})();

window.MantencionesService = {
  _resumenCache: null,
  _elementosCache: null,
  // C2E-2/3 — Catálogo General e Historial: colecciones DEDICADAS con su
  // propia caché. getElementos() / getMantenciones() siguen intactos para
  // los subáreas cerradas (Pilas, TV, Engrase, Fosas y Baños).
  _elementosGeneralesCache: null,
  _mantencionesGeneralesCache: null,
  // C2E-4C — Mantención de Máquinas (Áreas de Trabajo): colecciones y
  // detalle DEDICADOS con caché propia, independientes del Catálogo
  // General para evitar colisiones de estado entre pantallas.
  _elementosMaquinasCache: null,
  _mantencionesMaquinasCache: null,
  // C2E-4E4 / F2 — Mantenciones OPERATIVAS (trabajos registrados desde la
  // aplicación en public.mantenciones_operativas). Caché AISLADA y
  // asociada a CADA elemento: no se comparte con los históricos importados
  // (public.mantenciones) y su invalidación no toca ningún otro módulo.
  _operativasPorElementoCache: {},
  _mantencionesCache: null,
  _inventariosCache: null,
  _banosCache: null,
  _pilasCache: null,
  _televisoresCache: null,
  _engraseCache: null,
  _fosasCache: null,
  _guiasCache: null,
  _jardineriaCache: null,
  _prevencionCache: null,

  // Conteo eficiente sin descargar filas (head + count exact).
  // No depende de nombres de columna, por lo que es seguro para resúmenes.
  async _contar(tabla, aplicarFiltro) {
    try {
      let consulta = window.supabaseClient
        .from(tabla)
        .select('*', { count: 'exact', head: true });

      if (typeof aplicarFiltro === 'function') {
        consulta = aplicarFiltro(consulta);
      }

      const { count, error } = await consulta;
      if (error) throw error;
      return typeof count === 'number' ? count : 0;
    } catch (e) {
      console.error(`Error al contar en tabla ${tabla}:`, e);
      throw e;
    }
  },

  // Ids de importaciones_excel para un archivo de origen dado.
  // Permite filtrar registros por su importación real (trazabilidad),
  // mediante la relación importacion_id → importaciones_excel.archivo_origen.
  async _importacionIdsPorArchivo(archivoOrigen) {
    try {
      const { data, error } = await window.supabaseClient
        .from('importaciones_excel')
        .select('id')
        .eq('archivo_origen', archivoOrigen);

      if (error) throw error;
      return (data || []).map(i => i.id).filter(id => id);
    } catch (e) {
      console.error(`Error al buscar importaciones de ${archivoOrigen}:`, e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // RESUMEN REAL de Mantención General
  // ------------------------------------------------------------
  async getResumen(force = false) {
    if (!force && this._resumenCache) return this._resumenCache;

    try {
      // Ids de la importación operacional de Puertas / Engrase.
      const importacionIdsEngrase = await this._importacionIdsPorArchivo(ARCHIVO_ENGRASE_ACEITADO);

      const [
        elementos,
        mantenciones,
        inventarios,
        banos,
        pilasControles,
        televisores,
        engraseAceitado,
        fosas,
        guias,
        jardineria,
        ubicaciones
      ] = await Promise.all([
        // C2E-2/3 — KPI "Elementos generales": SOLO los elementos del
        // Catálogo General (archivo_origen = LISTA DE MANTENCIONES.xlsx,
        // hojas LUGAR / RADIADORES / REFRIGERADOR según C2E-4C; la hoja
        // MAQUINAS cuenta en su propia vista de Áreas de Trabajo).
        // El total de la tabla (295) ya NO representa este subapartado.
        // El conteo es real (head + count); NO se hardcodea ningún número.
        this._contar('elementos_mantenibles', q => q.eq('archivo_origen', ARCHIVO_CATALOGO_GENERAL).in('hoja_origen', HOJAS_CATALOGO_GENERAL)),
        // C2E-2/3 — KPI "Mantenciones históricas": SOLO las mantenciones del
        // mismo archivo de origen y hojas permitidas (histórico real de
        // este catálogo). El conteo es real; NO se hardcodea ningún número.
        this._contar('mantenciones', q => q.eq('archivo_origen', ARCHIVO_CATALOGO_GENERAL).in('hoja_origen', HOJAS_CATALOGO_GENERAL)),
        this._contar('inventarios_elementos'),
        // Baños: derivado de elementos_mantenibles (estructura definida
        // por la migración; no existe tabla dedicada).
        // Fase 2.3: mismo criterio de trazabilidad que getBanos()
        // (archivo_origen + hoja_origen), NUNCA por nombre del elemento.
        // El conteo es real; NO se hardcodea el número 32.
        this._contar('elementos_mantenibles', q => q.eq('archivo_origen', ARCHIVO_BANOS).eq('hoja_origen', HOJA_BANOS)),
        // Pilas y Controles: Fase 2.4. Mismo criterio de trazabilidad que
        // getPilasControles() (archivo_origen + hoja_origen), NUNCA por
        // texto "%CONTROL%". El conteo es real; NO se hardcodea el 56.
        this._contar('elementos_mantenibles', q => q.eq('archivo_origen', ARCHIVO_PILAS).eq('hoja_origen', HOJA_PILAS)),
        this._contar('televisores_habitaciones'),
        // Puertas / Engrase: solo registros cuya importación corresponde a
        // LISTA DE PUERTAS POR ENGRASAR Y ACEITAR.xlsx (Hoja1 + Hoja2).
        // La Hoja2 proveniente de _LISTA FOSAS DE ALCANTARILLADOS.xlsx se
        // conserva en la base por trazabilidad, pero no se cuenta aquí.
        importacionIdsEngrase.length > 0
          ? this._contar('listado_engrase_aceitado', q => q.in('importacion_id', importacionIdsEngrase))
          : Promise.resolve(0),
        this._contar('fosas_alcantarillado'),
        this._contar('guias_mantencion'),
        this._contar('jardineria_sectores'),
        this.contarUbicacionesHotel().catch(() => null)
        // C2P-4C: se retiró _contar('prevencion_gantt_items'). Prevencionista
        // ya NO es subapartado de Mantención General: es un módulo principal
        // con sus propias cartas, tareas y contador (js/views/
        // prevencionista.js). Su lectura getPrevencionGantt() sigue intacta.
      ]);

      const detalleSubapartados = [
        { id: 'elementos', nombre: 'Catálogo General e Historial', cantidad: elementos },
        { id: 'inventario', nombre: 'Inventario / Bodegas', cantidad: inventarios },
        { id: 'banos', nombre: 'Baños', cantidad: banos },
        { id: 'pilas', nombre: 'Pilas y Controles', cantidad: pilasControles },
        { id: 'tv', nombre: 'TV Habitaciones', cantidad: televisores },
        { id: 'engrase', nombre: 'Puertas / Engrase', cantidad: engraseAceitado },
        { id: 'fosas', nombre: 'Fosas y Alcantarillado', cantidad: fosas },
        { id: 'guia', nombre: 'Guía Preventiva', cantidad: guias },
        { id: 'ubicaciones', nombre: 'Ubicaciones del hotel', cantidad: ubicaciones },
        { id: 'jardineria', nombre: 'Jardinería', cantidad: jardineria }
      ];

      const resumen = {
        elementos: elementos,
        mantenciones: mantenciones,
        inventarios: inventarios,
        subapartados: {
          total: detalleSubapartados.length,
          conDatos: detalleSubapartados.filter(s => s.cantidad > 0).length,
          detalle: detalleSubapartados
        }
      };

      this._resumenCache = resumen;
      return resumen;

    } catch (e) {
      console.error('Error completo Supabase en getResumen:', e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // ELEMENTOS MANTENIBLES
  // ------------------------------------------------------------
  async getElementos(force = false) {
    if (!force && this._elementosCache) return this._elementosCache;

    try {
      // Ubicación canónica mediante relación FK embebida
      // (elementos_mantenibles.ubicacion_id → ubicaciones.id).
      // Una sola consulta; sin N+1 y sin consultar ubicaciones por elemento.
      const { data, error } = await window.supabaseClient
        .from('elementos_mantenibles')
        .select('id, nombre_original, observaciones, ubicacion_id, area_id, codigo, nemotecnico, grupo_origen, estado_original, hoja_origen, archivo_origen, fila_origen, ubicacion_original, ubicacion:ubicaciones(nombre), es_activo_fijo')
        .order('nombre_original', { ascending: true });

      if (error) throw error;

      const elementos = data || [];
      this._elementosCache = elementos;
      return elementos;

    } catch (e) {
      console.error('Error completo Supabase en getElementos:', e);
      throw e;
    }
  },

  // Detalle de un elemento del CATÁLOGO GENERAL + su historial de
  // mantenciones (agrupado, sin N+1). C2E-2/3: método EXCLUSIVO de este
  // subapartado (único call site: mntCargarFichaElemento). Se le añade el
  // filtro de archivo de origen para que una ficha jamás pueda mostrar un
  // elemento de una subárea cerrada (fail-closed), y se AGREGA celda_origen
  // al final del select (append-only) para la trazabilidad de la ficha.
  async getElementoDetalle(id) {
    try {
      const [{ data: elemento, error: errElemento }, mantenciones] = await Promise.all([
        window.supabaseClient
          .from('elementos_mantenibles')
          .select('id, nombre_original, observaciones, ubicacion_id, area_id, codigo, nemotecnico, grupo_origen, estado_original, hoja_origen, archivo_origen, fila_origen, ubicacion_original, ubicacion:ubicaciones(nombre), celda_origen')
          .eq('id', id)
          .eq('archivo_origen', ARCHIVO_CATALOGO_GENERAL)
          // C2E-4C: fail-closed también por HOJA. Un id de la hoja MAQUINAS
          // jamás debe resolverse desde la ficha del Catálogo General.
          .in('hoja_origen', HOJAS_CATALOGO_GENERAL)
          .single(),
        // Historial DEDICADO del catálogo (solo LISTA DE MANTENCIONES.xlsx,
        // sin la hoja MAQUINAS), ya ordenado por fecha_realizacion DESC con
        // desempate estable.
        this.getMantencionesGenerales()
      ]);

      if (errElemento) throw errElemento;

      return {
        elemento: elemento || null,
        mantenciones: (mantenciones || []).filter(m => m.elemento_id === id)
      };

    } catch (e) {
      console.error('Error completo Supabase en getElementoDetalle:', e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // CATÁLOGO GENERAL E HISTORIAL (C2E-2/3) — métodos DEDICADOS
  // ------------------------------------------------------------
  // Ambos filtran EN SUPABASE por archivo_origen Y hoja_origen para
  // descargar SOLO el alcance real del subapartado (C2E-4C: 66 elementos /
  // 64 mantenciones) en lugar de las 295 / 275 filas de las tablas
  // completas. La hoja MAQUINAS (48 / 110) queda EXCLUIDA aquí porque se
  // muestra en Áreas de Trabajo → Mantención de Máquinas.
  // getElementos() y getMantenciones() NO cambian: los siguen usando los
  // subáreas CERRADAS (Pilas, TV, Engrase, Fosas y Baños).
  async getElementosGenerales(force = false) {
    if (!force && this._elementosGeneralesCache) return this._elementosGeneralesCache;

    try {
      // Mismo select que getElementos() (append-only de celda_origen).
      // Orden maestro estable: categoría (hoja_origen) → fila_origen →
      // nombre_original; NUNCA por fechas de historial.
      const { data, error } = await window.supabaseClient
        .from('elementos_mantenibles')
        .select('id, nombre_original, observaciones, ubicacion_id, area_id, codigo, nemotecnico, grupo_origen, estado_original, hoja_origen, archivo_origen, fila_origen, ubicacion_original, ubicacion:ubicaciones(nombre), celda_origen')
        .eq('archivo_origen', ARCHIVO_CATALOGO_GENERAL)
        // C2E-4C: el Catálogo General permite SOLO LUGAR / RADIADORES /
        // REFRIGERADOR (filtros de categoría y KPIs quedan dinámicos).
        .in('hoja_origen', HOJAS_CATALOGO_GENERAL)
        .order('hoja_origen', { ascending: true })
        .order('fila_origen', { ascending: true })
        .order('nombre_original', { ascending: true });

      if (error) throw error;

      const elementos = data || [];
      this._elementosGeneralesCache = elementos;
      return elementos;

    } catch (e) {
      console.error('Error completo Supabase en getElementosGenerales:', e);
      throw e;
    }
  },

  async getMantencionesGenerales(force = false) {
    if (!force && this._mantencionesGeneralesCache) return this._mantencionesGeneralesCache;

    try {
      // Mismo select que getMantenciones() (las 21 columnas confirmadas).
      // Orden del historial C2E-2/3:
      //   1) fecha_realizacion DESC con NULLS FINAL (los registros SIN_FECHA
      //      quedan al final, nunca se excluyen);
      //   2) fila_origen ASC y celda_origen ASC como desempate estable
      //      (orden real del Excel) para los que no tienen fecha.
      // NO se usa fecha_programada: en las 174 mantenciones generales es
      // NULL en el 100% de los casos.
      const { data, error } = await window.supabaseClient
        .from('mantenciones')
        .select('id, area_id, elemento_id, tipo, estado, fecha_programada, fecha_realizacion, fecha_original, responsable_texto, responsable_id, costo_total, detalle_trabajo, hoja_origen, archivo_origen, fila_origen, fecha_precision, fecha_anio, fecha_mes, celda_origen')
        .eq('archivo_origen', ARCHIVO_CATALOGO_GENERAL)
        // C2E-4C: sin la hoja MAQUINAS (su historial vive en la vista de
        // Áreas de Trabajo → Mantención de Máquinas).
        .in('hoja_origen', HOJAS_CATALOGO_GENERAL)
        .order('fecha_realizacion', { ascending: false, nullsFirst: false })
        .order('fila_origen', { ascending: true })
        .order('celda_origen', { ascending: true });

      if (error) throw error;

      const mantenciones = data || [];
      this._mantencionesGeneralesCache = mantenciones;
      return mantenciones;

    } catch (e) {
      console.error('Error completo Supabase en getMantencionesGenerales:', e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // MANTENCIÓN DE MÁQUINAS (Áreas de Trabajo) — C2E-4C
  // ------------------------------------------------------------
  // Métodos DEDICADOS para la hoja MAQUINAS del mismo archivo de origen
  // (48 equipos / 110 mantenciones). Son espejos de los métodos del
  // Catálogo General con otro filtro de hoja y OTRA caché: no se comparte
  // estado mutable entre la vista de Mantención General y la de Áreas de
  // Trabajo. Solo lectura; no mueve ni copia registros.
  async getElementosMaquinas(force = false) {
    if (!force && this._elementosMaquinasCache) return this._elementosMaquinasCache;

    try {
      // Mismo select que getElementos() (append-only de celda_origen).
      // Orden estable: fila_origen → nombre_original (orden real del Excel).
      const { data, error } = await window.supabaseClient
        .from('elementos_mantenibles')
        .select('id, nombre_original, observaciones, ubicacion_id, area_id, codigo, nemotecnico, grupo_origen, estado_original, hoja_origen, archivo_origen, fila_origen, ubicacion_original, ubicacion:ubicaciones(nombre), celda_origen')
        .eq('archivo_origen', ARCHIVO_CATALOGO_GENERAL)
        .eq('hoja_origen', HOJA_MAQUINAS)
        .order('fila_origen', { ascending: true })
        .order('nombre_original', { ascending: true });

      if (error) throw error;

      const elementos = data || [];
      this._elementosMaquinasCache = elementos;
      return elementos;

    } catch (e) {
      console.error('Error completo Supabase en getElementosMaquinas:', e);
      throw e;
    }
  },

  async getMantencionesMaquinas(force = false) {
    if (!force && this._mantencionesMaquinasCache) return this._mantencionesMaquinasCache;

    try {
      // Mismo select y mismo orden del historial del Catálogo General
      // (fecha_realizacion DESC con NULLS FINAL + fila_origen/celda_origen
      // como desempate estable).
      const { data, error } = await window.supabaseClient
        .from('mantenciones')
        .select('id, area_id, elemento_id, tipo, estado, fecha_programada, fecha_realizacion, fecha_original, responsable_texto, responsable_id, costo_total, detalle_trabajo, hoja_origen, archivo_origen, fila_origen, fecha_precision, fecha_anio, fecha_mes, celda_origen')
        .eq('archivo_origen', ARCHIVO_CATALOGO_GENERAL)
        .eq('hoja_origen', HOJA_MAQUINAS)
        .order('fecha_realizacion', { ascending: false, nullsFirst: false })
        .order('fila_origen', { ascending: true })
        .order('celda_origen', { ascending: true });

      if (error) throw error;

      const mantenciones = data || [];
      this._mantencionesMaquinasCache = mantenciones;
      return mantenciones;

    } catch (e) {
      console.error('Error completo Supabase en getMantencionesMaquinas:', e);
      throw e;
    }
  },

  // Detalle de una máquina + su historial (agrupado, sin N+1). Espejo de
  // getElementoDetalle() para el dominio MAQUINAS, con carga INDEPENDIENTE
  // y fail-closed por archivo + hoja: una ficha de máquina jamás puede
  // resolver un elemento de otra hoja/archivo.
  async getElementoDetalleMaquinas(id) {
    try {
      const [{ data: elemento, error: errElemento }, mantenciones] = await Promise.all([
        window.supabaseClient
          .from('elementos_mantenibles')
          .select('id, nombre_original, observaciones, ubicacion_id, area_id, codigo, nemotecnico, grupo_origen, estado_original, hoja_origen, archivo_origen, fila_origen, ubicacion_original, ubicacion:ubicaciones(nombre), celda_origen')
          .eq('id', id)
          .eq('archivo_origen', ARCHIVO_CATALOGO_GENERAL)
          .eq('hoja_origen', HOJA_MAQUINAS)
          .single(),
        this.getMantencionesMaquinas()
      ]);

      if (errElemento) throw errElemento;

      return {
        elemento: elemento || null,
        mantenciones: (mantenciones || []).filter(m => m.elemento_id === id)
      };

    } catch (e) {
      console.error('Error completo Supabase en getElementoDetalleMaquinas:', e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // MANTENCIONES OPERATIVAS (C2E-4E4 / F2)
  // ------------------------------------------------------------
  // Los trabajos registrados desde la aplicación viven en
  // public.mantenciones_operativas (tabla nueva del backend), SEPARADOS de
  // los 174 históricos importados del Excel, que siguen en
  // public.mantenciones y aquí no se leen ni se escriben jamás.
  //
  // Estas tablas NO tienen archivo_origen / hoja_origen: no hay
  // procedencia Excel que inventar. Que el elemento pertenezca al catálogo
  // autorizado lo valida el BACKEND (RLS + RPC SECURITY DEFINER).
  //
  // Escritura EXCLUSIVA por RPC (nunca INSERT / UPDATE / DELETE directos):
  // los triggers del backend bloquean UPDATE/DELETE sobre la tabla
  // operativa y asignan autor, autor_nombre_snapshot y created_at
  // SERVER-SIDE. El frontend solo envía el contenido del trabajo. El
  // backend es la ÚNICA autoridad de permisos (administrador actual para
  // registrar; administrador permanente para anular): este servicio NO
  // duplica ni inventa lógica de roles.
  //
  // Métodos:
  //   getMantencionesOperativasPorElemento(elementoId, force)
  //   registrarMantencionOperativa({ elementoId, fechaRealizacion,
  //                                  responsableTexto, detalleTrabajo })
  //   anularMantencionOperativa({ mantencionId, motivo })
  //   invalidarCacheMantencionesOperativas(elementoId = null)

  // Lectura de UN elemento. El filtrado es EN SUPABASE por elemento_id
  // (.eq), nunca una descarga completa filtrada en JavaScript: escala con
  // el volumen total de registros operativos.
  async getMantencionesOperativasPorElemento(elementoId, force = false) {
    const id = (elementoId === null || elementoId === undefined) ? '' : String(elementoId);
    if (!id) {
      throw new Error('MantencionesService.getMantencionesOperativasPorElemento: falta el elementoId.');
    }

    const actor = state.currentUser?.id;
    if (!actor) throw Error('Sesión no disponible para consultar mantenciones.');
    const contexto = JSON.stringify([actor,state.currentUser?.role,esAdminOperativoActual()]);
    if (this._operativasLecturaContexto !== contexto) { this._operativasPorElementoCache = Object.create(null); this._operativasLecturaContexto = contexto; }
    if (!force && this._operativasPorElementoCache[id]) {
      return mantencionesEtiquetasEnCurso(this._operativasPorElementoCache[id]);
    }

    try {
      // 1) Mantenciones del elemento. Orden: fecha_realizacion DESC con
      //    NULLS FINAL (los SIN_FECHA quedan al final y nunca se excluyen)
      //    y created_at DESC como desempate estable (lo registrado más
      //    reciente primero entre iguales fechas o sin fecha).
      const { data: operativas, error } = await window.supabaseClient
        .from('mantenciones_operativas')
        .select('id, elemento_id, fecha_realizacion, trabajador_id, responsable_texto, detalle_trabajo, registrado_por, autor_nombre_snapshot, created_at')
        .eq('elemento_id', id)
        .order('fecha_realizacion', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const filas = operativas || [];

      // 2) Anulaciones de ESOS registros en UNA sola consulta por lote
      //    (.in con los ids), nunca N+1. Con cero registros no se consulta
      //    la tabla de anulaciones.
      const anulaciones = Object.create(null);
      const ids = filas.map(f => f.id);
      if (ids.length > 0) {
        const { data: anuladas, error: errAnul } = await window.supabaseClient
          .from('mantenciones_operativas_anulaciones')
          .select('id, mantencion_id, motivo, anulado_por, autor_nombre_snapshot, created_at')
          .in('mantencion_id', ids)
          .order('created_at', { ascending: true });

        if (errAnul) throw errAnul;
        (anuladas || []).forEach(a => { anulaciones[a.mantencion_id] = a; });
      }

      // Relaciones y nombres por UUID, sin emparejar nombres ni ocultar fallos de lectura.
      const responsables = new Map(), nombres = new Map();
      for (let i = 0; i < ids.length; i += 100) {
        for (let desde = 0; ; desde += 200) {
          const r = await window.supabaseClient.from('mantenciones_operativas_responsables')
            .select('mantencion_id,trabajador_id,orden').in('mantencion_id', ids.slice(i, i + 100))
            .order('mantencion_id').order('orden').order('trabajador_id').range(desde, desde + 199);
          if (r.error || !Array.isArray(r.data)) throw Error('No se pudieron consultar los responsables de las mantenciones.');
          for (const a of r.data) {
            if (!ids.includes(a.mantencion_id) || !a.trabajador_id || !Number.isInteger(a.orden)) throw Error('Relación laboral no verificada.');
            const lista = responsables.get(a.mantencion_id) || [];
            if (lista.some(x => x.trabajador_id === a.trabajador_id || x.orden === a.orden)) throw Error('Relación laboral duplicada.');
            lista.push(a); responsables.set(a.mantencion_id, lista);
          }
          if (r.data.length < 200) break;
        }
      }
      // La RPC solo entrega nombres de responsables de mantenciones autorizadas.
      for (let i = 0; i < ids.length; i += 100) {
        const lote = ids.slice(i,i+100);
        const datosResponsables = [];
        for (let desde = 0; ; desde += 200) {
          const r = await window.supabaseClient.rpc('mantencion_responsables_consultar_v1', { p_mantencion_ids: lote })
            .order('mantencion_id').order('orden').range(desde,desde+199);
          if (r.error || !Array.isArray(r.data)) throw Error('No se pudieron consultar los responsables mediante la lectura autorizada. Comprueba que la RPC esté instalada y permitida.');
          datosResponsables.push(...r.data);
          if (r.data.length < 200) break;
        }
        const recibidos = new Map();
        for (const a of datosResponsables) {
          if (!a || !lote.includes(a.mantencion_id) || typeof a.trabajador_id !== 'string' ||
              !Number.isInteger(a.orden) || typeof a.nombre !== 'string' || !a.nombre.trim() ||
              Object.keys(a).sort().join(',') !== 'mantencion_id,nombre,orden,trabajador_id') throw Error('Respuesta de responsables no verificada.');
          const lista = recibidos.get(a.mantencion_id) || [];
          if (lista.some(x=>x.trabajador_id===a.trabajador_id || x.orden===a.orden)) throw Error('Respuesta de responsables duplicada.');
          lista.push(a); recibidos.set(a.mantencion_id,lista); nombres.set(a.trabajador_id,a.nombre);
        }
        for (const f of filas.filter(f=>lote.includes(f.id))) {
          const esperados = responsables.get(f.id) || (f.trabajador_id ? [{trabajador_id:f.trabajador_id,orden:1}] : []);
          const recibo = recibidos.get(f.id) || [];
          if (recibo.length !== esperados.length || esperados.some(a=>!recibo.some(b=>b.trabajador_id===a.trabajador_id && b.orden===a.orden)))
            throw Error('No se pudieron verificar todos los responsables.');
        }
      }

      // 3) Merge: cada registro deja EXPLÍCITO si está vigente o anulado y
      //    qué anulación lo cubre (motivo, autor y fecha de anulación). Los
      //    UUID (registrado_por, anulado_por) viajan en los datos por
      //    trazabilidad pero NUNCA se muestran al usuario.
      const resultado = filas.map(f => Object.assign({}, f, {
        responsables: (responsables.get(f.id) || (f.trabajador_id ? [{ trabajador_id: f.trabajador_id, orden: 1 }] : []))
          .sort((a,b) => a.orden - b.orden).map(a => ({ ...a, nombre: nombres.get(a.trabajador_id) })),
        anulada: !!anulaciones[f.id],
        anulacion: anulaciones[f.id] || null
      }));

      if (this._operativasLecturaContexto !== contexto || state.currentUser?.id !== actor) throw Error('La sesión cambió durante la consulta.');
      this._operativasPorElementoCache[id] = resultado;
      const presentacion = await mantencionesEtiquetasEnCurso(resultado);
      if (this._operativasLecturaContexto !== contexto || state.currentUser?.id !== actor) throw Error('La sesión cambió durante la consulta.');
      return presentacion;

    } catch (e) {
      console.error('Error completo Supabase en getMantencionesOperativasPorElemento:', e);
      throw e;
    }
  },

  // Alta de una mantención operativa. Los TRES campos del trabajo son
  // obligatorios (mismas reglas del backend): la validación local solo
  // evita un viaje inútil, la RPC vuelve a validar server-side.
  async registrarMantencionOperativa(datos = {}) {
    if (Object.hasOwn(datos, 'trabajadoresIds')) return this.registrarMantencionOperativaV3(datos);
    const elementoId = datos.elementoId || null;
    const fechaRealizacion = (datos.fechaRealizacion === null || datos.fechaRealizacion === undefined)
      ? '' : String(datos.fechaRealizacion).trim();
    const usaTrabajador = Object.hasOwn(datos, 'trabajadorId');
    const trabajadorId = String(datos.trabajadorId || '').trim();
    const responsableTexto = (datos.responsableTexto === null || datos.responsableTexto === undefined)
      ? '' : String(datos.responsableTexto).trim();
    const detalleTrabajo = (datos.detalleTrabajo === null || datos.detalleTrabajo === undefined)
      ? '' : String(datos.detalleTrabajo).trim();

    if (!elementoId) {
      const err = new Error('Falta el elemento intervenido.');
      err.codigo = 'ELEMENTO_REQUERIDO';
      throw err;
    }
    if (!fechaRealizacion) {
      const err = new Error('Falta la fecha de realización del trabajo.');
      err.codigo = 'FECHA_REQUERIDA';
      throw err;
    }
    if (usaTrabajador ? !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(trabajadorId) : !responsableTexto) {
      const err = new Error('Falta el responsable del trabajo.');
      err.codigo = 'RESPONSABLE_REQUERIDO';
      throw err;
    }
    if (!detalleTrabajo) {
      const err = new Error('Falta el detalle del trabajo.');
      err.codigo = 'DETALLE_REQUERIDO';
      throw err;
    }

    try {
      // ÚNICA vía de escritura. El cliente envía SOLO el contenido del
      // trabajo: jamás autor, registrado_por ni created_at (los asignan los
      // triggers del backend), ni nombres de tabla/columna.
      const { data, error } = await window.supabaseClient.rpc(usaTrabajador ? 'mantencion_registrar_mantencion_v2' : 'mantencion_registrar_mantencion', {
        p_elemento_id: elementoId,
        p_fecha_realizacion: fechaRealizacion,
        ...(usaTrabajador ? { p_trabajador_id: trabajadorId } : { p_responsable_texto: responsableTexto }),
        p_detalle_trabajo: detalleTrabajo
      });

      if (error) throw operativaErrorRPC('registrarMantencionOperativa', error);

      const respuesta = Array.isArray(data) ? (data[0] || null) : data;

      // Invalida SOLO la caché operativa de ESE elemento. Las cachés de los
      // históricos importados y los contadores existentes no se tocan.
      this.invalidarCacheMantencionesOperativas(elementoId);

      return respuesta;
    } catch (e) {
      if (!e || !e.codigo) {
        console.error('Error completo en registrarMantencionOperativa:', e);
      }
      throw e;
    }
  },

  _operativasV3EnCurso: new Set(),
  _operativasV3Inciertas: new Set(),
  async registrarMantencionOperativaV3(datos) {
    const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
    const actor = state.currentUser?.id, ids = datos.trabajadoresIds;
    if (!actor || !esAdminOperativoActual()) throw Error('No tienes autorización administrativa vigente.');
    if (!uuid(datos.elementoId) || !datos.fechaRealizacion || !datos.detalleTrabajo?.trim() ||
        !Array.isArray(ids) || !ids.length || ids.some(id => !uuid(id)) ||
        new Set(ids.map(id => id.toLowerCase())).size !== ids.length) throw Error('Revisa los trabajadores seleccionados y evita duplicados.');
    const payload = { p_elemento_id: datos.elementoId, p_fecha_realizacion: datos.fechaRealizacion,
      p_trabajadores_ids: [...ids], p_detalle_trabajo: datos.detalleTrabajo.trim() };
    if (this._operativasV3EnCurso.has(actor)) throw Error('Ya hay una mantención en curso.');
    this._operativasV3EnCurso.add(actor);
    try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([actor,payload])));
    const clave = 'hotel.mantencion-v3.' + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2,'0')).join('');
    const incierto = () => Object.assign(Error('Resultado no confirmado. Revisa el historial antes de volver a registrar esta mantención.'), { resultadoIncierto: true });
    let previa;
    try { previa = sessionStorage.getItem(clave); } catch { throw Error('No se puede proteger el envío. Habilita el almacenamiento de esta sesión.'); }
    if (previa || this._operativasV3Inciertas.has(clave)) throw incierto();
    try {
      if (state.currentUser?.id !== actor || !esAdminOperativoActual()) throw Error('La sesión administrativa cambió.');
      sessionStorage.setItem(clave,'PENDIENTE');
      this._operativasV3Inciertas.add(clave);
      const { data, error } = await window.supabaseClient.rpc('mantencion_registrar_mantencion_v3',payload);
      if (error) {
        // Un error PostgreSQL reconocido revierte la transacción; transporte incierto no autoriza repetir.
        if (/^(?:P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501)$/.test(error.code || '')) {
          sessionStorage.removeItem(clave); this._operativasV3Inciertas.delete(clave);
          throw operativaErrorRPC('registrarMantencionOperativaV3',error);
        }
        throw incierto();
      }
      if (data?.ok !== true || !uuid(data.mantencion_id) || typeof data.created_at !== 'string' || !Number.isFinite(Date.parse(data.created_at)) ||
          data.responsables_total !== ids.length || state.currentUser?.id !== actor || !esAdminOperativoActual()) throw incierto();
      sessionStorage.removeItem(clave); this._operativasV3Inciertas.delete(clave);
      this.invalidarCacheMantencionesOperativas(datos.elementoId);
      return data;
    } catch (e) {
      if (this._operativasV3Inciertas.has(clave)) throw incierto();
      throw e;
    }
    } finally { this._operativasV3EnCurso.delete(actor); }
  },

  // Anulación AUDITADA de una mantención operativa: sin borrado físico (los
  // triggers del backend bloquean UPDATE/DELETE y registran motivo, autor y
  // fecha en public.mantenciones_operativas_anulaciones). El backend decide
  // los permisos (administrador permanente) y rechaza una doble anulación.
  async anularMantencionOperativa(datos = {}) {
    const mantencionId = datos.mantencionId || null;
    const motivo = (datos.motivo === null || datos.motivo === undefined)
      ? '' : String(datos.motivo).trim();

    if (!mantencionId) {
      const err = new Error('Falta la mantención operativa a anular.');
      err.codigo = 'REGISTRO_REQUERIDO';
      throw err;
    }
    if (!motivo) {
      const err = new Error('El motivo de la anulación es obligatorio.');
      err.codigo = 'MOTIVO_REQUERIDO';
      throw err;
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('mantencion_anular_mantencion', {
        p_mantencion_id: mantencionId,
        p_motivo: motivo
      });

      if (error) throw operativaErrorRPC('anularMantencionOperativa', error);

      const respuesta = Array.isArray(data) ? (data[0] || null) : data;

      // La respuesta NO incluye el elemento_id, por lo que se invalida
      // TODA la caché operativa (nunca la de los históricos importados).
      this.invalidarCacheMantencionesOperativas(null);

      return respuesta;
    } catch (e) {
      if (!e || !e.codigo) {
        console.error('Error completo en anularMantencionOperativa:', e);
      }
      throw e;
    }
  },

  // Invalidación de la caché operativa. Con elementoId limpia SOLO ese
  // elemento; sin elementoId limpia toda la caché (se usa cuando la
  // respuesta no permite saber qué elemento cambió).
  invalidarCacheMantencionesOperativas(elementoId = null) {
    if (elementoId === null || elementoId === undefined) {
      this._operativasPorElementoCache = {};
      return;
    }
    delete this._operativasPorElementoCache[String(elementoId)];
  },

  // ------------------------------------------------------------
  // MANTENCIONES (historial real)
  // ------------------------------------------------------------
  async getMantenciones(force = false) {
    if (!force && this._mantencionesCache) return this._mantencionesCache;

    try {
      const { data, error } = await window.supabaseClient
        .from('mantenciones')
        // Fase 2.3 (Baños): se AGREGAN al final fecha_precision, fecha_anio,
        // fecha_mes y celda_origen (append-only, sin romper Elementos e
        // Historial ni el resto de subapartados). Todos los campos previos se
        // conservan. Sin select('*').
        .select('id, area_id, elemento_id, tipo, estado, fecha_programada, fecha_realizacion, fecha_original, responsable_texto, responsable_id, costo_total, detalle_trabajo, hoja_origen, archivo_origen, fila_origen, fecha_precision, fecha_anio, fecha_mes, celda_origen')
        .order('fecha_programada', { ascending: false });

      if (error) throw error;

      const mantenciones = data || [];
      this._mantencionesCache = mantenciones;
      return mantenciones;

    } catch (e) {
      console.error('Error completo Supabase en getMantenciones:', e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // INVENTARIOS / BODEGAS
  // ------------------------------------------------------------
  async getInventarios(force = false) {
    if (!force && this._inventariosCache) return this._inventariosCache;

    try {
      // Fase 2.2 — Inventario / Bodegas.
      // Una sola consulta (sin N+1): columnas de inventarios_elementos +
      // embeds FK del elemento vinculado y de la importación de origen.
      // Orden estable que respeta el origen del archivo: en LISTA DE BODEGAS.xlsx
      // el N.º (columna A / NUM) vuelve a comenzar desde 1 en cada ubicación
      // (Centro de Eventos y Hotel), por lo que NO se ordena únicamente por
      // numero_original. Se usa ubicacion_original y luego fila_origen para
      // reproducir el orden del archivo.
      // Fecha: fecha_inventario es EXCLUSIVAMENTE fecha de inventario.
      // Jamás se usa como fecha de mantención/programación/realización.
      const { data, error } = await window.supabaseClient
        .from('inventarios_elementos')
        .select('id, importacion_id, elemento_id, numero_original, nemotecnico_original, nombre_original, ubicacion_original, fecha_inventario, responsable_texto, hoja_origen, fila_origen, celda_origen, observaciones, elemento:elementos_mantenibles(id, nombre_original, nemotecnico, ubicacion_original, ubicacion:ubicaciones(nombre)), importacion:importaciones_excel(archivo_origen)')
        .order('ubicacion_original', { ascending: true })
        .order('fila_origen', { ascending: true });

      if (error) throw error;

      const inventarios = data || [];
      this._inventariosCache = inventarios;
      return inventarios;

    } catch (e) {
      console.error('Error completo Supabase en getInventarios:', e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // BOD-3: dominio propio; no son mantenciones ni movimientos de stock.
  async getInventariadosBodega(inventarioElementoId) {
    const id = String(inventarioElementoId || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error('Identificador de ficha de bodega inválido.');
    }
    const { data, error } = await window.supabaseClient.from('bodegas_inventariados')
      .select('id, inventario_elemento_id, fecha_inventariado, responsable_texto, registrado_por, autor_nombre_snapshot, created_at')
      .eq('inventario_elemento_id', id)
      .order('fecha_inventariado', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Respuesta de inventariados inválida.');
    return data;
  },

  async registrarInventariadoBodega(datos = {}) {
    const id = String(datos.inventarioElementoId || '').trim();
    const fecha = String(datos.fechaInventariado || '').trim();
    const responsable = String(datos.responsableTexto || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificador de ficha de bodega inválido.');
    if (!fecha) throw new Error('Indica la fecha del inventariado.');
    if (!responsable) throw new Error('Indica quién realizó el inventariado.');
    const { data, error } = await window.supabaseClient.rpc('bodega_registrar_inventariado', {
      p_inventario_elemento_id: id,
      p_fecha_inventariado: fecha,
      p_responsable_texto: responsable
    });
    if (error) throw error;
    const resultado = Array.isArray(data) ? data[0] : data;
    if (!resultado || resultado.ok !== true || !resultado.inventariado_id) {
      throw new Error('No se pudo confirmar el resultado del registro. Revisa el historial antes de reintentar para evitar repetirlo.');
    }
    return resultado;
  },

  // BAÑOS (Fase 2.3 — derivado de elementos_mantenibles; sin tabla dedicada)
  // ------------------------------------------------------------
  // Identificación por TRAZABILIDAD REAL (archivo_origen + hoja_origen),
  // NUNCA por texto del nombre. El filtro anterior por
  // nombre_original ILIKE '%baño%' traía 6 falsos positivos y perdía
  // 6 baños públicos reales (daban 32 por casualidad, pero no eran los
  // mismos 32 registros).
  // Se agrega ubicacion_id + embed ubicaciones(nombre) para la ubicación
  // canónica (patrón de getElementos()). Para baños públicos
  // ubicacion_id puede ser NULL: NO se infiere piso ni habitación.
  // Orden por fila_origen ASC para preservar el orden real del Excel
  // (bloques 101-108, 201-208, 301-308 y cabañas).
  async getBanos(force = false) {
    if (!force && this._banosCache) return this._banosCache;

    try {
      const { data, error } = await window.supabaseClient
        .from('elementos_mantenibles')
        .select('id, nombre_original, observaciones, codigo, nemotecnico, grupo_origen, estado_original, ubicacion_original, ubicacion_id, ubicacion:ubicaciones(nombre), hoja_origen, archivo_origen, fila_origen')
        .eq('archivo_origen', ARCHIVO_BANOS)
        .eq('hoja_origen', HOJA_BANOS)
        .order('fila_origen', { ascending: true });

      if (error) throw error;

      const banos = data || [];
      this._banosCache = banos;
      return banos;

    } catch (e) {
      console.error('Error completo Supabase en getBanos:', e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // PILAS Y CONTROLES (CONTROL TV / CONTROL DECO, HANDOFF §8)
  // ------------------------------------------------------------
  // Fase 2.4 — identificación por TRAZABILIDAD REAL (archivo_origen +
  // hoja_origen), sustituyendo el filtro textual
  // grupo_origen/nemotecnico ILIKE '%CONTROL%'. Ambos criterios daban hoy
  // los mismos 56 registros, pero el textual depende de un valor de texto
  // que puede cambiar; la trazabilidad es la fuente semánticamente correcta.
  //
  // Mapeo real de MANTENCION DE PILAS.xlsx (Hoja1):
  // - codigo            ← columna A (HAB), literal.
  // - ubicacion_original ← mismo valor de HAB.
  // - grupo_origen      ← 'CONTROL TV' (columna B) o 'CONTROL DECO' (D).
  // - nombre_original   ← DERIVADO en migración (tipo + HAB); no es un
  //                       nombre literal del Excel.
  // - celda_origen      ← B<n> para CONTROL TV, D<n> para CONTROL DECO.
  // - nemotecnico y estado_original: NULL en los 56.
  // - observaciones: texto generado por la migración (no del cliente).
  // - mantenciones: 0 (las columnas C/E FECHA MANTENCION estaban vacías).
  //
  // Se AGREGAN al final del select celda_origen, ubicacion_id y el embed
  // ubicaciones(nombre) (append-only, patrón de Fase 2.3; no se usa select('*')).
  // Orden fila_origen ASC, celda_origen ASC: preserva el orden real del
  // Excel (por cada HAB: B → CONTROL TV, D → CONTROL DECO).
  //
  // Fase C2D-2D1 — Capa operacional de controles: se AGREGA al FINAL del
  // select estado_operativo_actual (boolean NULL; NULL = "Sin revisión
  // registrada") para los 56 controles reales del dominio. Append-only:
  // NO se quita ni altera ningún dato original/importado del Excel
  // (codigo, grupo_origen, ubicacion_original, nombre_original,
  // observaciones, estado_original, trazabilidad, ubicación canónica).
  // estado_original NO se reutiliza como estado operacional.
  async getPilasControles(force = false) {
    if (!force && this._pilasCache) return this._pilasCache;

    try {
      const { data, error } = await window.supabaseClient
        .from('elementos_mantenibles')
        .select('id, nombre_original, observaciones, codigo, nemotecnico, grupo_origen, estado_original, ubicacion_original, hoja_origen, archivo_origen, fila_origen, celda_origen, ubicacion_id, ubicacion:ubicaciones(nombre), estado_operativo_actual')
        .eq('archivo_origen', ARCHIVO_PILAS)
        .eq('hoja_origen', HOJA_PILAS)
        .order('fila_origen', { ascending: true })
        .order('celda_origen', { ascending: true });

      if (error) throw error;

      const pilas = data || [];
      this._pilasCache = pilas;
      return pilas;

    } catch (e) {
      console.error('Error completo Supabase en getPilasControles:', e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // TV HABITACIONES
  // ------------------------------------------------------------
  async getTelevisores(force = false) {
    if (!force && this._televisoresCache) return this._televisoresCache;

    try {
      // Fase 2.1.1 — Enriquecimiento de fichas (TV / Control TV / Control Deco).
      // Se agregan elemento_id (para la ficha del televisor) y los campos de
      // origen al FINAL del select, para no alterar el orden de las columnas
      // que ya consume la preview genérica del subapartado TV Habitaciones.
      // Sin embeds hacia elementos_mantenibles: televisores_habitaciones tiene
      // TRES FK distintas hacia esa tabla y no se necesitan relaciones
      // PostgREST ambiguas; el cruce se hace en cliente con los IDs y los
      // elementos ya cargados (getElementos()).
      //
      // Fase 2.5 — TV Habitaciones (append-only, retrocompatible):
      // - Se AGREGAN al FINAL del select importacion_id y celda_origen
      //   (trazabilidad confirmada) y el embed no ambiguo
      //   importacion:importaciones_excel(archivo_origen, hoja_origen)
      //   (hacia OTRA tabla; sin ambigüedad de las 3 FK de elementos).
      // - Se agrega .order('fila_origen', ASC) para respetar el orden real
      //   del Excel. Los consumidores existentes (Pilas y Controles y el
      //   enriquecimiento de fichas de Fase 2.1.1) usan .find() por id/FK,
      //   por lo que no dependen del orden de filas ni de estas columnas.
      // - No se usa select('*'). Caché _televisoresCache intacta.
      //
      // Fase C2C-2A — Capa 2 operacional (piloto TV / Control Deco):
      // se AGREGA al FINAL del select control_deco_funciona_actual
      // (boolean NULL; NULL = "Sin revisión registrada"). Append-only:
      // no se altera ninguna columna previa, ni filtros, ni orden.
      // Los consumidores actuales (TV, Pilas, ficha de Elementos) usan
      // .find() por id/FK y no dependen del orden de columnas.
      //
      // Fase C2D-1B — Estado operativo del televisor: se AGREGA al FINAL del
      // select estado_operativo_actual (boolean NULL; NULL = "Sin revisión
      // registrada"). Append-only: NO se altera ninguna columna previa, ni
      // filtros, ni orden. control_deco_funciona_actual SE CONSERVA: sigue
      // siendo un campo real (piloto Control Deco) y sus revisiones en BD
      // permanecen intactas; solo deja de ser el estado principal de la ficha.
      const { data, error } = await window.supabaseClient
        .from('televisores_habitaciones')
        .select('id, control_tv_original_texto, control_tv_original, control_deco_funciona_texto, control_deco_funciona, control_tv_elemento_id, control_deco_elemento_id, tamano_original, tamano_pulgadas, marca_original, marca_normalizada, elemento_id, ubicacion_id, ubicacion_original, hoja_origen, fila_origen, observaciones, importacion_id, celda_origen, importacion:importaciones_excel(archivo_origen, hoja_origen), control_deco_funciona_actual, estado_operativo_actual, modelo, origen_registro, retirado_en, reemplaza_a_id, control_tv_original_declarado, control_deco_funciona_declarado')
        .order('fila_origen', { ascending: true });

      if (error) throw error;

      const televisores = data || [];
      this._televisoresCache = televisores;
      return televisores;

    } catch (e) {
      console.error('Error completo Supabase en getTelevisores:', e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // invalidarCacheTelevisores()
  // Fase C2C-2A — ÚNICA vía pública para vaciar la caché interna de
  // televisores después de una escritura operacional (RPC de revisión).
  // Las vistas/services NO deben tocar _televisoresCache directamente.
  // Solo invalida esta caché; no consulta Supabase ni inventa estado.
  // ------------------------------------------------------------

  async crearUbicacion(nombre, tipo) {
    if (!window.esAdminOperativoActual?.()) throw new Error('UBICACION_GESTION_NO_AUTORIZADA');
    const { data, error } = await window.supabaseClient.rpc('ubicaciones_crear_v1', {
      p_nombre: nombre, p_tipo: tipo
    });
    if (error) throw error;
    const fila = Array.isArray(data) && data.length === 1 ? data[0] : data;
    if (typeof fila?.id !== 'string' || !fila.id || typeof fila.nombre !== 'string' ||
        !fila.nombre.trim() || fila.tipo !== tipo) throw new Error('UBICACION_RESULTADO_INCIERTO');
    return fila;
  },

  invalidarCatalogoUbicaciones(tipo) {
    this._resumenCache = null;
    if (tipo === 'BODEGA') window.InventarioService?.invalidarCacheBodegas();
    window.dispatchEvent(new Event('hotel:ubicaciones-actualizadas'));
  },

  async contarUbicacionesHotel() {
    const { count, error } = await window.supabaseClient.from('ubicaciones')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    if (!Number.isInteger(count)) throw new Error('Conteo de ubicaciones no disponible');
    return count;
  },

  async getUbicacionesTV(incluirTipo = false, { soloCantidad = false } = {}) {
    if (soloCantidad) {
      const { count, error } = await window.supabaseClient.from('ubicaciones').select('id', { count: 'exact', head: true });
      if (error) throw error;
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Conteo de ubicaciones no verificable.');
      return count;
    }
    const ubicaciones = [];
    for (let desde = 0; ; desde += 200) {
      const { data, error } = await window.supabaseClient.from('ubicaciones')
        .select(incluirTipo ? 'id,nombre,tipo' : 'id,nombre').order('nombre').order('id').range(desde, desde + 199);
      if (error) throw error;
      ubicaciones.push(...data);
      if (data.length < 200) return ubicaciones;
    }
  },

  async getUbicacionesOcupadasTV() {
    const ocupadas = new Set();
    const limite = 200;
    for (let desde = 0; ; desde += limite) {
      const { data, error } = await window.supabaseClient.from('televisores_habitaciones')
        .select('ubicacion_id').is('retirado_en', null).not('ubicacion_id', 'is', null)
        .order('id').range(desde, desde + limite - 1);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('TV_OCUPACION_NO_VERIFICADA');
      for (const tv of data) ocupadas.add(tv.ubicacion_id);
      if (data.length < limite) return ocupadas;
    }
  },

  async gestionarTelevisor(rpc, parametros) {
    if (!window.esAdminOperativoActual?.()) throw new Error('TV_GESTION_NO_AUTORIZADA');
    const alta = ['tv_habitaciones_crear_o_reemplazar_v1', 'tv_habitaciones_crear_o_reemplazar_v2'].includes(rpc);
    const controles = rpc === 'tv_habitaciones_guardar_controles_v1';
    const edicion = ['tv_habitaciones_editar_o_trasladar_v1', 'tv_habitaciones_editar_o_trasladar_v2'].includes(rpc);
    if (!alta && !controles && !edicion) throw new Error('TV_OPERACION_INVALIDA');
    const { data, error } = await window.supabaseClient.rpc(rpc, parametros);
    if (error) throw error;

    const accion = alta ? (parametros.p_predecesor_id ? 'REEMPLAZO' : 'ALTA') : controles ? 'CONTROLES' : parametros.p_accion;
    const esperado = alta ? parametros.p_predecesor_id : parametros.p_televisor_id;
    const uuid = valor => typeof valor === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
    if (data?.operacion_id !== parametros.p_operacion_id || data.accion !== accion ||
        typeof data.reenvio !== 'boolean' || !uuid(data.televisor_id) ||
        (esperado && data.televisor_id !== esperado) ||
        (accion === 'REEMPLAZO' && (!uuid(data.sucesor_id) || data.sucesor_id === esperado))) {
      throw new Error('TV_RESULTADO_NO_VERIFICADO');
    }

    this.invalidarCacheTelevisores();
    if (!controles) {
      this._elementosCache = null;
      this._resumenCache = null;
    }
    return data;
  },

  async eliminarTelevisor(parametros) {
    if (window.esAdminPermanenteActual?.() !== true) throw new Error('TV_ELIMINACION_NO_AUTORIZADA');
    const { p_operacion_id, p_televisor_id } = parametros;
    const { data, error } = await window.supabaseClient.rpc('tv_habitaciones_eliminar_v1', {
      p_operacion_id, p_televisor_id
    });
    if (error && error.message !== 'TV_YA_ELIMINADO') throw error;
    if (!error && (data?.estado !== 'ELIMINADO' ||
        data.operacion_id !== p_operacion_id || data.televisor_id !== p_televisor_id)) {
      throw new Error('TV_RESULTADO_NO_VERIFICADO');
    }

    this.invalidarCacheTelevisores();
    this._elementosCache = null;
    this._resumenCache = null;
    return error ? 'TV_YA_ELIMINADO' : data.estado;
  },

  invalidarCacheTelevisores() {
    this._televisoresCache = null;
  },

  // ------------------------------------------------------------
  // invalidarCachePilasControles()
  // Fase C2D-2D1 — ÚNICA vía pública para vaciar la caché interna de
  // Pilas y Controles después de una escritura operacional sobre el
  // tipo de entidad 'control' (RPC de revisión del estado operativo).
  // Las vistas/services NO deben tocar _pilasCache directamente.
  // Solo invalida esta caché; no afecta la de TV, Elementos ni ningún
  // otro apartado; no consulta Supabase ni inventa estado.
  // ------------------------------------------------------------
  invalidarCachePilasControles() {
    this._pilasCache = null;
  },

  // ------------------------------------------------------------
  // PUERTAS / ENGRASE Y ACEITADO
  // ------------------------------------------------------------
  async getEngraseAceitado(force = false) {
    if (!force && this._engraseCache) return this._engraseCache;

    try {
      // Fuente operacional: solo registros cuya importación corresponde a
      // LISTA DE PUERTAS POR ENGRASAR Y ACEITAR.xlsx (Hoja1 + Hoja2).
      // La Hoja2 proveniente de _LISTA FOSAS DE ALCANTARILLADOS.xlsx se
      // conserva en la base por trazabilidad, pero queda excluida del
      // listado operacional de Puertas / Engrase.
      // Fase 2.6 — Puertas / Engrase y Aceitado.
      // El filtro operacional NO cambia: sigue siendo por trazabilidad real
      // (importacion_id → importaciones_excel.archivo_origen), por lo que se
      // traen las 47 filas de LISTA DE PUERTAS POR ENGRASAR Y ACEITAR.xlsx
      // (Hoja1 = 32, Hoja2 = 15) y se siguen excluyendo las 15 filas de
      // _LISTA FOSAS DE ALCANTARILLADOS.xlsx (conservadas en la base por
      // trazabilidad). El número 47 NUNCA se hardcodea.
      //
      // Mapeo real del Excel (Hoja1 y Hoja2 tienen la MISMA estructura):
      // - numero_original          ← columna A (NUM), literal.
      // - nombre_original          ← columna B (Nombre completo), literal.
      // - ubicacion_original       ← columna C (Ubicación), literal.
      // - ultima_mantencion_fecha  ← columna D (ULTIMA MANTENCION FECHA),
      //                              normalizada como DATE cuando es válida.
      // - ultima_mantencion_fecha_original ← columna D como texto fuente,
      //                              cuando corresponde conservarlo.
      // - ultima_mantencion_fecha_precision ← metadata de migración (ej. DIA).
      // - responsable_original     ← columna F (Quien lo Hizo), literal.
      // - elemento_id              ← FK creada durante la migración; NO es
      //                              una columna del Excel y puede ser NULL
      //                              (una fila de Hoja1 tiene NUM=8 y nombre
      //                              vacío: se conserva sin elemento).
      // - celda_nombre_origen      ← celda de la columna B correspondiente.
      // - observaciones            ← NO existe columna Observaciones en el
      //                              Excel: los valores poblados son notas
      //                              generadas por la migración.
      //
      // Se AGREGAN al FINAL del select (append-only, sin select('*')):
      // ultima_mantencion_fecha, ultima_mantencion_fecha_original,
      // ultima_mantencion_fecha_precision y celda_nombre_origen, más el
      // embed no ambiguo importacion:importaciones_excel(archivo_origen,
      // hoja_origen) (existe una sola FK importacion_id hacia esa tabla).
      //
      // Orden estable por TRAZABILIDAD del archivo (nunca por nombre):
      // primero Hoja1 en su orden real, luego Hoja2 en su orden real.
      const importacionIds = await this._importacionIdsPorArchivo(ARCHIVO_ENGRASE_ACEITADO);

      let engrase = [];
      if (importacionIds.length > 0) {
        const { data, error } = await window.supabaseClient
          .from('listado_engrase_aceitado')
          .select('id, created_at, nombre_original, observaciones, elemento_id, importacion_id, hoja_origen, fila_origen, responsable_original, ubicacion_original, numero_original, ultima_mantencion_fecha, ultima_mantencion_fecha_original, ultima_mantencion_fecha_precision, celda_nombre_origen, importacion:importaciones_excel(archivo_origen, hoja_origen)')
          .in('importacion_id', importacionIds)
          .order('hoja_origen', { ascending: true })
          .order('fila_origen', { ascending: true });

        if (error) throw error;
        engrase = data || [];
      }

      this._engraseCache = engrase;
      return engrase;

    } catch (e) {
      console.error('Error completo Supabase en getEngraseAceitado:', e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // FOSAS Y ALCANTARILLADO (Fase 2.7)
  // ------------------------------------------------------------
  // Fuente: _LISTA FOSAS DE ALCANTARILLADOS.xlsx.
  // Cuatro consultas en TOTAL (Promise.all de 3 + 1 adicional), sin N+1 y
  // sin consultas por ficha:
  //   1) fosas_mantencion_fuente  → historial fuente de TODAS las fosas;
  //   2) fosas_alcantarillado     → los registros principales;
  //   3) contactos_servicio_fosas → contactos GENERALES del subapartado;
  //   4) comentarios_excel        → comentarios del Excel filtrados por los
  //      elemento_id + importacion_id REALES de las fosas ya obtenidas
  //      (una sola consulta; NUNCA por fosa ni por mantención).
  //
  // IMPORTANTE:
  // - NO se llama getMantenciones(): fosas_mantencion_fuente ya contiene
  //   todo el historial (56 de 56 fechas válidas vinculadas). No se construye
  //   un segundo historial desde public.mantenciones.
  // - NO se consulta listado_engrase_aceitado: las 15 filas Hoja2 del archivo
  //   de Fosas viven allí por trazabilidad y pertenecen a Puertas / Engrase.
  // - getResumen() NO cambia: sigue contando 19 registros principales con
  //   this._contar('fosas_alcantarillado'); los 57 fuente / 56 mantenciones /
  //   50 comentarios / 3 contactos NUNCA se suman al contador principal.
  // - Caché única: _fosasCache guarda el objeto completo
  //   { fosas, contactos, fuente, comentarios }.
  async getFosas(force = false) {
    if (!force && this._fosasCache) return this._fosasCache;

    try {
      const [
        { data: fuente, error: errFuente },
        { data: fosas, error: errFosas },
        { data: contactos, error: errContactos }
      ] = await Promise.all([
        // 1) Historial fuente. Columnas fijas + append al final
        //    (importacion_id, elemento_id, mantencion_id, hoja_origen,
        //    fila_origen, observaciones, created_at). Sin select('*').
        //    Orden estable: fila_origen ASC, celda_origen ASC.
        window.supabaseClient
          .from('fosas_mantencion_fuente')
          .select('id, anio_cabecera_original, valor_original, fecha_realizacion, fecha_precision, es_fecha_valida, celda_origen, importacion_id, elemento_id, mantencion_id, hoja_origen, fila_origen, observaciones, created_at')
          .order('fila_origen', { ascending: true })
          .order('celda_origen', { ascending: true }),
        // 2) Registros principales. Se AGREGAN al FINAL categoria_original,
        //    capacidad_litros, capacidad_aproximada y celda_origen, más el
        //    embed seguro importacion:importaciones_excel(archivo_origen,
        //    hoja_origen) (hacia OTRA tabla; sin ambigüedad). Orden por
        //    fila_origen ASC = orden real del Excel. Sin select('*').
        window.supabaseClient
          .from('fosas_alcantarillado')
          .select('id, created_at, observaciones, elemento_id, importacion_id, hoja_origen, fila_origen, ubicacion_original, capacidad_original, categoria_original, capacidad_litros, capacidad_aproximada, celda_origen, importacion:importaciones_excel(archivo_origen, hoja_origen)')
          .order('fila_origen', { ascending: true }),
        // 3) Contactos de servicio GENERALES del subapartado (sin elemento_id
        //    ni fosa_id: se muestran una sola vez, debajo de la cuadrícula).
        //    Se AGREGAN al FINAL proveedor_id, linea_original y celda_origen.
        //    Orden fila_origen ASC. Sin select('*').
        window.supabaseClient
          .from('contactos_servicio_fosas')
          .select('id, created_at, nombre_original, hoja_origen, fila_origen, importacion_id, telefono_original, contacto_original, detalle_original, proveedor_id, linea_original, celda_origen')
          .order('fila_origen', { ascending: true })
      ]);

      if (errFuente) throw errFuente;
      if (errFosas) throw errFosas;
      if (errContactos) throw errContactos;

      const listaFosas = fosas || [];

      // 4) Comentarios del Excel de ESTE archivo: se derivan los filtros de
      //    los arrays reales ya obtenidos (elemento_id e importacion_id de
      //    las propias fosas). Dos filtros .in() simultáneos en UNA sola
      //    consulta = los 50 comentarios de Fosas. Sin N+1.
      const elementoIds = listaFosas.map(f => f && f.elemento_id).filter(Boolean);
      const importacionIds = [...new Set(listaFosas.map(f => f && f.importacion_id).filter(Boolean))];

      let comentarios = [];
      if (elementoIds.length > 0 && importacionIds.length > 0) {
        const { data, error } = await window.supabaseClient
          .from('comentarios_excel')
          .select('id, importacion_id, hoja_origen, celda_origen, fila_origen, autor_original, comentario_original, elemento_id, mantencion_id')
          .in('elemento_id', elementoIds)
          .in('importacion_id', importacionIds)
          .order('hoja_origen', { ascending: true })
          .order('fila_origen', { ascending: true })
          .order('celda_origen', { ascending: true });

        if (error) throw error;
        comentarios = data || [];
      }

      const resultado = {
        fosas: listaFosas,
        contactos: contactos || [],
        fuente: fuente || [],
        comentarios: comentarios
      };
      this._fosasCache = resultado;
      return resultado;

    } catch (e) {
      console.error('Error completo Supabase en getFosas:', e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // GUÍA PREVENTIVA (documentación, NO cuenta como mantención ejecutada)
  // ------------------------------------------------------------
  async getGuias(force = false) {
    if (!force && this._guiasCache) return this._guiasCache;

    try {
      // Fase 2.8 — Guía Preventiva (documentación; NO es historial de
      // mantenciones ejecutadas).
      // - guias_mantencion: APPEND ONLY al final del select (se conservan en
      //   su orden actual id, titulo, descripcion, area_id, tipo, fuente,
      //   temporada, orden, archivo_origen, activo) → frecuencia_recomendada
      //   y archivo_url. Sin select('*'). El orden por `orden` se mantiene.
      // - secciones: se AGREGA .order('orden', ASC) para preservar el orden
      //   documental 1 → 6 (antes venía sin orden explícito).
      //   Fase C2G-5: se AGREGAN al FINAL del select, append-only,
      //   `activo` y `updated_at` (columnas nuevas de la migración de
      //   contenido maestro). Sin select('*'); las columnas previas
      //   quedan intactas y en su mismo orden.
      // - items: se AGREGA .order('orden', ASC) por la misma razón; la vista
      //   además re-ordena defensivamente en cliente por item.orden.
      //   Nunca orden alfabético por contenido.
      // 3 queries en UN Promise.all (sin N+1). Caché _guiasCache intacta.
      const [
        { data: guias, error: errGuias },
        { data: secciones, error: errSecciones },
        { data: items, error: errItems }
      ] = await Promise.all([
        window.supabaseClient
          .from('guias_mantencion')
          .select('id, titulo, descripcion, area_id, tipo, fuente, temporada, orden, archivo_origen, activo, frecuencia_recomendada, archivo_url')
          .order('orden', { ascending: true }),
        window.supabaseClient
          .from('guia_mantencion_secciones')
          .select('id, created_at, titulo, guia_id, codigo, orden, activo, updated_at')
          .order('orden', { ascending: true }),
        window.supabaseClient
          .from('guia_mantencion_items')
          .select('id, created_at, updated_at, seccion_id, orden, activo, contenido')
          .order('orden', { ascending: true })
      ]);

      if (errGuias) throw errGuias;
      if (errSecciones) throw errSecciones;
      if (errItems) throw errItems;

      const resultado = { guias: guias || [], secciones: secciones || [], items: items || [] };
      this._guiasCache = resultado;
      return resultado;

    } catch (e) {
      console.error('Error completo Supabase en getGuias:', e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // invalidarCacheGuias()
  // Fase C2G-5 — ÚNICA vía pública para vaciar la caché interna de
  // Guía Preventiva después de una escritura exitosa vía RPC. Las
  // vistas/services NO deben tocar _guiasCache directamente.
  // Solo invalida esta caché; NO consulta Supabase, NO recarga y NO
  // inventa datos: el refresco (getGuias(true)) lo decide la vista.
  // ------------------------------------------------------------
  invalidarCacheGuias() {
    this._guiasCache = null;
  },

  // ------------------------------------------------------------
  // ESCRITURA de Guía Preventiva — Fase C2G-5 (contenido maestro).
  // EXCLUSIVAMENTE vía RPC server-side:
  //   guia_contenido_guardar_guia / guia_contenido_guardar_seccion /
  //   guia_contenido_guardar_item / guia_contenido_reordenar
  // (SECURITY DEFINER; solo Administrador permanente server-side;
  //  auditoría server-side; sin DELETE físico).
  // NUNCA se usa .insert() / .update() / .delete() sobre
  // guias_mantencion, guia_mantencion_secciones ni guia_mantencion_items.
  // El cliente solo valida presencia mínima de ids/tipos; el trim, la
  // validación de textos, la pertenencia real guía/sección/ítem, el
  // código de sección y el reordenamiento transaccional son server-side.
  // En éxito: invalida ÚNICAMENTE _guiasCache (sin recarga automática).
  // En error: se conserva el mensaje real de Supabase + .codigo + .detalle.
  // ------------------------------------------------------------

  // Editar datos permitidos de la guía. `fuente`, `archivo_origen` y
  // `archivo_url` NUNCA se envían: la trazabilidad documental no es
  // editable desde la UI.
  // RPC: guia_contenido_guardar_guia(p_guia_id, p_titulo, p_descripcion,
  //                                  p_tipo, p_temporada,
  //                                  p_frecuencia_recomendada)
  async guardarGuia(datos) {
    const d = (datos && typeof datos === 'object') ? datos : {};

    if (!d.guiaId) {
      throw new Error('MantencionesService.guardarGuia: falta guiaId.');
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('guia_contenido_guardar_guia', {
        p_guia_id: d.guiaId,
        p_titulo: (d.titulo === undefined) ? null : d.titulo,
        p_descripcion: (d.descripcion === undefined) ? null : d.descripcion,
        p_tipo: (d.tipo === undefined) ? null : d.tipo,
        p_temporada: (d.temporada === undefined) ? null : d.temporada,
        p_frecuencia_recomendada: (d.frecuenciaRecomendada === undefined) ? null : d.frecuenciaRecomendada
      });

      if (error) throw error;

      this.invalidarCacheGuias();
      return data;
    } catch (e) {
      throw guiaErrorRPC('MantencionesService.guardarGuia', e);
    }
  },

  // Crear sección (seccionId = null) o editar / activar-desactivar una
  // existente. El `codigo` de sección lo genera el backend al crear
  // (dato técnico); NUNCA se envía ni se modifica desde el cliente.
  // RPC: guia_contenido_guardar_seccion(p_seccion_id, p_guia_id,
  //                                     p_titulo, p_activo)
  async guardarSeccion(datos) {
    const d = (datos && typeof datos === 'object') ? datos : {};

    if (!d.guiaId) {
      throw new Error('MantencionesService.guardarSeccion: falta guiaId.');
    }
    if (!d.seccionId && (d.titulo === null || d.titulo === undefined || !String(d.titulo).trim())) {
      throw new Error('MantencionesService.guardarSeccion: falta titulo al crear la sección.');
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('guia_contenido_guardar_seccion', {
        p_seccion_id: (d.seccionId === undefined) ? null : d.seccionId,
        p_guia_id: d.guiaId,
        p_titulo: (d.titulo === undefined) ? null : d.titulo,
        // activo = true por defecto (compatibilidad con el dato actual:
        // las 6 secciones existentes son vigentes).
        p_activo: (d.activo === undefined) ? true : !!d.activo
      });

      if (error) throw error;

      this.invalidarCacheGuias();
      return data;
    } catch (e) {
      throw guiaErrorRPC('MantencionesService.guardarSeccion', e);
    }
  },

  // Crear ítem (itemId = null) o editar / activar-desactivar uno existente.
  // La unicidad (seccion_id, orden) y el texto se validan server-side.
  // RPC: guia_contenido_guardar_item(p_item_id, p_seccion_id,
  //                                  p_contenido, p_activo)
  async guardarItemGuia(datos) {
    const d = (datos && typeof datos === 'object') ? datos : {};

    if (!d.seccionId) {
      throw new Error('MantencionesService.guardarItemGuia: falta seccionId.');
    }
    if (!d.itemId && (d.contenido === null || d.contenido === undefined || !String(d.contenido).trim())) {
      throw new Error('MantencionesService.guardarItemGuia: falta contenido al crear el ítem.');
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('guia_contenido_guardar_item', {
        p_item_id: (d.itemId === undefined) ? null : d.itemId,
        p_seccion_id: d.seccionId,
        p_contenido: (d.contenido === undefined) ? null : d.contenido,
        p_activo: (d.activo === undefined) ? true : !!d.activo
      });

      if (error) throw error;

      this.invalidarCacheGuias();
      return data;
    } catch (e) {
      throw guiaErrorRPC('MantencionesService.guardarItemGuia', e);
    }
  },

  // Reordenar secciones ('seccion', padreId = guiaId) o ítems
  // ('item', padreId = seccionId).
  // `ordenes` = array de UUIDs en el orden definitivo 1..n. La colisión
  // de UNIQUE (seccion_id, orden) / (guia_id, orden) se resuelve
  // ÚNICAMENTE server-side dentro de UNA transacción de la RPC; el
  // cliente NUNCA emite updates sueltos por cada posición.
  // RPC: guia_contenido_reordenar(p_tipo, p_padre_id, p_ordenes)
  async reordenarContenidoGuia(datos) {
    const d = (datos && typeof datos === 'object') ? datos : {};

    const tipo = (d.tipo === null || d.tipo === undefined) ? '' : String(d.tipo).trim();
    if (tipo !== 'seccion' && tipo !== 'item') {
      throw new Error('MantencionesService.reordenarContenidoGuia: tipo debe ser "seccion" o "item".');
    }
    if (!d.padreId) {
      throw new Error('MantencionesService.reordenarContenidoGuia: falta padreId.');
    }

    const ordenes = Array.isArray(d.ordenes)
      ? d.ordenes.map(o => (o === null || o === undefined) ? '' : String(o).trim())
      : [];
    if (ordenes.length === 0 || ordenes.some(o => !o)) {
      throw new Error('MantencionesService.reordenarContenidoGuia: ordenes debe ser un array no vacío de UUIDs.');
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('guia_contenido_reordenar', {
        p_tipo: tipo,
        p_padre_id: d.padreId,
        p_ordenes: ordenes
      });

      if (error) throw error;

      this.invalidarCacheGuias();
      return data;
    } catch (e) {
      throw guiaErrorRPC('MantencionesService.reordenarContenidoGuia', e);
    }
  },

  // ------------------------------------------------------------
  // JARDINERÍA (subapartado: plantillas recurrentes, NO inflan KPIs)
  // ------------------------------------------------------------
  // Fase 2.9 — Jardinería.
  // Se MANTIENE la estructura general: _jardineriaCache, UN único
  // Promise.all de 6 queries (sin N+1, sin consultas por ficha) y el mismo
  // retorno de 6 arrays { sectores, trabajos, riegoProgramacion,
  // riegoZonas, riegoNotas, laboresComplementarias }.
  //
  // Selects APPEND-ONLY (sin select('*')): cada select conserva sus
  // columnas actuales AL INICIO y en el mismo orden, y AGREGA al final las
  // columnas que la vista de Fase 2.9 necesita. getJardineria() solo lo
  // consume Jardinería, por lo que ningún otro subapartado se afecta.
  //
  // Órdenes estables AÑADIDOS (nunca se ordena por título):
  // - sectores:                orden ASC (orden 1 → 5 del archivo).
  // - trabajos:                hoja_origen ASC, fila_origen ASC (orden
  //                            real del Excel).
  // - riego_programacion:      orden_dia ASC (1 Lunes → 7 Domingo).
  // - riego_zonas:             fila_origen ASC.
  // - riego_notas:             orden ASC.
  // - labores_complementarias: bloque ASC, orden ASC (se re-ordena además
  //                            defensivamente en cliente).
  //
  // Sin filtros .eq(): la vista filtra en cliente sobre los registros
  // activos (hoy todos activo = true) sin volver a Supabase. Solo lectura:
  // sin INSERT/UPDATE/DELETE.
  // JARD-1: lecturas del archivo confirmado; no reutilizar lecturas de stock.
  // El lector de Complementarios no incluye la tarea de aplicaciones ni todos
  // los identificadores/fila de los movimientos. Se amplía este servicio existente.
  async getInsumosJardineria(force = false) {
    if (!force && this._insumosJardineriaCache) return this._insumosJardineriaCache;
    const archivo = 'INSUMOS JARDINERIA.xlsx';
    const consultas = [
      ['movimientos', 'movimientos_inventario', 'id, material_id, ubicacion_id, tipo_movimiento, cantidad, cantidad_original, fecha, costo_unitario, costo_total, producto_original, proveedor_original, archivo_origen, hoja_origen, fila_origen, seccion_origen, categoria_origen, observaciones, valor_auxiliar_fuente, afecta_stock'],
      ['tareas', 'tareas', 'id, area_id, ubicacion_id, proyecto_id, elemento_id, titulo, descripcion, prioridad, estado, responsable_id, responsable_texto, fecha_inicio, fecha_vencimiento, fecha_finalizacion, frecuencia, hora_inicio, hora_fin, duracion_original, progreso, archivo_origen, hoja_origen, grupo_origen'],
      ['importaciones', 'importaciones_excel', 'id, archivo_origen, hoja_origen, total_con_iva, total_sin_iva, observaciones']
    ];
    try {
      const pares = await Promise.all(consultas.map(async ([clave, tabla, columnas]) => {
        const filas = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await window.supabaseClient.from(tabla)
            .select(columnas).eq('archivo_origen', archivo)
            .order('id', { ascending: true }).range(offset, offset + 499);
          if (error) throw error;
          if (!Array.isArray(data) || data.some(r => !r || !r.id || r.archivo_origen !== archivo)) throw new Error('Respuesta histórica inválida.');
          filas.push(...data);
          if (data.length < 500) break;
        }
        return [clave, filas];
      }));
      this._insumosJardineriaCache = Object.fromEntries(pares);
      return this._insumosJardineriaCache;
    } catch (error) {
      this._insumosJardineriaCache = null;
      throw error;
    }
  },

  async getJardineria(force = false) {
    if (!force && this._jardineriaCache) return this._jardineriaCache;

    try {
      const [
        { data: sectores, error: errSectores },
        { data: trabajos, error: errTrabajos },
        { data: riegoProgramacion, error: errRiegoProg },
        { data: riegoZonas, error: errRiegoZonas },
        { data: riegoNotas, error: errRiegoNotas },
        { data: laboresComplementarias, error: errLabores }
      ] = await Promise.all([
        window.supabaseClient
          .from('jardineria_sectores')
          .select('id, created_at, updated_at, nombre, observaciones, area_id, importacion_id, codigo, orden, hoja_origen, activo')
          .order('orden', { ascending: true }),
        window.supabaseClient
          .from('jardineria_trabajos')
          // 4 columnas originales AL INICIO y en su mismo orden + 15
          // columnas agregadas al final (append-only). Sin select('*').
          .select('id, prioridad, invierno_otono, verano_primavera, sector_id, titulo, titulo_original, prioridad_original, invierno_otono_original, verano_primavera_original, es_fila_vacia_original, hoja_origen, fila_origen, celda_origen, importacion_id, activo, observaciones, created_at, updated_at')
          .order('hoja_origen', { ascending: true })
          .order('fila_origen', { ascending: true }),
        window.supabaseClient
          .from('jardineria_riego_programacion')
          .select('id, created_at, updated_at, importacion_id, zona, zona_original, dia_semana, hoja_origen, activo, orden_dia, celda_origen')
          .order('orden_dia', { ascending: true }),
        window.supabaseClient
          .from('jardineria_riego_zonas')
          .select('id, importacion_id, zona, zona_original, hoja_origen, fila_origen, activo, celda_origen')
          .order('fila_origen', { ascending: true }),
        window.supabaseClient
          .from('jardineria_riego_notas')
          .select('id, created_at, updated_at, importacion_id, tipo, orden, hoja_origen, activo, contenido, contenido_original, celda_origen')
          .order('orden', { ascending: true }),
        window.supabaseClient
          .from('jardineria_labores_complementarias')
          .select('id, created_at, updated_at, titulo, titulo_original, observaciones, area_id, sector_id, importacion_id, frecuencia, frecuencia_original, orden, dias_semana, dias_semana_original, momento, momento_original, activo, subapartado, bloque_original, bloque')
          .order('bloque', { ascending: true })
          .order('orden', { ascending: true })
      ]);

      if (errSectores) throw errSectores;
      if (errTrabajos) throw errTrabajos;
      if (errRiegoProg) throw errRiegoProg;
      if (errRiegoZonas) throw errRiegoZonas;
      if (errRiegoNotas) throw errRiegoNotas;
      if (errLabores) throw errLabores;

      const resultado = {
        sectores: sectores || [],
        trabajos: trabajos || [],
        riegoProgramacion: riegoProgramacion || [],
        riegoZonas: riegoZonas || [],
        riegoNotas: riegoNotas || [],
        laboresComplementarias: laboresComplementarias || []
      };
      this._jardineriaCache = resultado;
      return resultado;

    } catch (e) {
      console.error('Error completo Supabase en getJardineria:', e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // JARDINERÍA — ADMINISTRACIÓN MÍNIMA (C2J-4)
  // ------------------------------------------------------------
  // Contenido maestro administrable para Administrador permanente.
  // Escritura EXCLUSIVAMENTE vía estas RPCs server-side (SECURITY DEFINER,
  // auth.uid(), usuario_habilitado_actual(), es_administrador_permanente_actual(),
  // auditoría server-side en jardineria_contenido_auditoria).
  // NUNCA .insert()/.update()/.delete() directos ni supabase.rpc desde la vista.
  //
  // Los campos *_original, es_fila_vacia_original, importacion_id,
  // hoja/fila/celda_origen y los ids NUNCA se envían: son inmutables y las
  // RPCs no los reciben. Cada método valida localmente su id y, tras una
  // escritura exitosa, invalida _jardineriaCache para que la próxima lectura
  // vuelva a Supabase.
  invalidarCacheJardineria() {
    this._jardineriaCache = null;
  },

  // RPC: jardineria_sector_actualizar(p_sector_id, p_activo)
  // Solo activo: nombre/codigo/orden/observaciones NO se editan.
  async actualizarSectorJardineria(datos) {
    const d = (datos && typeof datos === 'object') ? datos : {};
    if (!d.sectorId) {
      throw new Error('MantencionesService.actualizarSectorJardineria: falta sectorId.');
    }
    if (typeof d.activo !== 'boolean') {
      throw new Error('MantencionesService.actualizarSectorJardineria: falta activo (boolean).');
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('jardineria_sector_actualizar', {
        p_sector_id: d.sectorId,
        p_activo: d.activo
      });

      if (error) throw error;

      this.invalidarCacheJardineria();
      return data;
    } catch (e) {
      throw jardineriaErrorRPC('MantencionesService.actualizarSectorJardineria', e);
    }
  },

  // RPC: jardineria_trabajo_actualizar(p_trabajo_id, p_titulo, p_prioridad,
  //                                     p_invierno_otono, p_verano_primavera,
  //                                     p_activo)
  // prioridad: 1 | 2 | 3 | null ("Sin prioridad"). p_prioridad es smallint.
  // titulo vacío → null (el backend y la vista ya distinguen NULL de '').
  async actualizarTrabajoJardineria(datos) {
    const d = (datos && typeof datos === 'object') ? datos : {};
    if (!d.trabajoId) {
      throw new Error('MantencionesService.actualizarTrabajoJardineria: falta trabajoId.');
    }
    if (typeof d.activo !== 'boolean') {
      throw new Error('MantencionesService.actualizarTrabajoJardineria: falta activo (boolean).');
    }

    const titulo = (d.titulo === null || d.titulo === undefined)
      ? null
      : String(d.titulo).trim();

    let prioridad = null;
    if (d.prioridad !== null && d.prioridad !== undefined && String(d.prioridad).trim() !== '') {
      const n = Number(d.prioridad);
      if (!Number.isInteger(n)) {
        throw new Error('MantencionesService.actualizarTrabajoJardineria: prioridad inválida (use 1, 2, 3 o null).');
      }
      prioridad = n;
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('jardineria_trabajo_actualizar', {
        p_trabajo_id: d.trabajoId,
        p_titulo: titulo,
        p_prioridad: prioridad,
        p_invierno_otono: !!d.inviernoOtono,
        p_verano_primavera: !!d.veranoPrimavera,
        p_activo: d.activo
      });

      if (error) throw error;

      this.invalidarCacheJardineria();
      return data;
    } catch (e) {
      throw jardineriaErrorRPC('MantencionesService.actualizarTrabajoJardineria', e);
    }
  },

  // RPC: jardineria_riego_programacion_actualizar(p_id, p_zona, p_activo)
  // dia_semana y orden_dia NO se envían (solo lectura en esta fase).
  async actualizarRiegoProgramacionJardineria(datos) {
    const d = (datos && typeof datos === 'object') ? datos : {};
    if (!d.id) {
      throw new Error('MantencionesService.actualizarRiegoProgramacionJardineria: falta id.');
    }
    if (typeof d.activo !== 'boolean') {
      throw new Error('MantencionesService.actualizarRiegoProgramacionJardineria: falta activo (boolean).');
    }

    const zona = (d.zona === null || d.zona === undefined) ? null : String(d.zona).trim();

    try {
      const { data, error } = await window.supabaseClient.rpc('jardineria_riego_programacion_actualizar', {
        p_id: d.id,
        p_zona: zona,
        p_activo: d.activo
      });

      if (error) throw error;

      this.invalidarCacheJardineria();
      return data;
    } catch (e) {
      throw jardineriaErrorRPC('MantencionesService.actualizarRiegoProgramacionJardineria', e);
    }
  },

  // RPC: jardineria_riego_zona_actualizar(p_id, p_zona, p_activo)
  async actualizarRiegoZonaJardineria(datos) {
    const d = (datos && typeof datos === 'object') ? datos : {};
    if (!d.id) {
      throw new Error('MantencionesService.actualizarRiegoZonaJardineria: falta id.');
    }
    if (typeof d.activo !== 'boolean') {
      throw new Error('MantencionesService.actualizarRiegoZonaJardineria: falta activo (boolean).');
    }

    const zona = (d.zona === null || d.zona === undefined) ? null : String(d.zona).trim();

    try {
      const { data, error } = await window.supabaseClient.rpc('jardineria_riego_zona_actualizar', {
        p_id: d.id,
        p_zona: zona,
        p_activo: d.activo
      });

      if (error) throw error;

      this.invalidarCacheJardineria();
      return data;
    } catch (e) {
      throw jardineriaErrorRPC('MantencionesService.actualizarRiegoZonaJardineria', e);
    }
  },

  // RPC: jardineria_riego_nota_actualizar(p_id, p_contenido, p_activo)
  async actualizarRiegoNotaJardineria(datos) {
    const d = (datos && typeof datos === 'object') ? datos : {};
    if (!d.id) {
      throw new Error('MantencionesService.actualizarRiegoNotaJardineria: falta id.');
    }
    if (typeof d.activo !== 'boolean') {
      throw new Error('MantencionesService.actualizarRiegoNotaJardineria: falta activo (boolean).');
    }

    const contenido = (d.contenido === null || d.contenido === undefined)
      ? null
      : String(d.contenido).trim();

    try {
      const { data, error } = await window.supabaseClient.rpc('jardineria_riego_nota_actualizar', {
        p_id: d.id,
        p_contenido: contenido,
        p_activo: d.activo
      });

      if (error) throw error;

      this.invalidarCacheJardineria();
      return data;
    } catch (e) {
      throw jardineriaErrorRPC('MantencionesService.actualizarRiegoNotaJardineria', e);
    }
  },

  // RPC: jardineria_labor_actualizar(p_id, p_bloque, p_titulo, p_frecuencia,
  //                                   p_dias_semana, p_momento, p_activo)
  // p_dias_semana es text[] REAL (nunca un string JSON). Vacío → null.
  // area_id / sector_id NO se envían: una labor no cambia de sector/área.
  async actualizarLaborJardineria(datos) {
    const d = (datos && typeof datos === 'object') ? datos : {};
    if (!d.id) {
      throw new Error('MantencionesService.actualizarLaborJardineria: falta id.');
    }
    if (typeof d.activo !== 'boolean') {
      throw new Error('MantencionesService.actualizarLaborJardineria: falta activo (boolean).');
    }

    const aTexto = v => (v === null || v === undefined) ? null : String(v).trim();

    let dias = null;
    if (Array.isArray(d.diasSemana)) {
      const arr = d.diasSemana
        .map(v => (v === null || v === undefined) ? '' : String(v).trim())
        .filter(v => v !== '');
      dias = arr.length > 0 ? arr : null;
    } else if (d.diasSemana !== null && d.diasSemana !== undefined && String(d.diasSemana).trim() !== '') {
      const arr = String(d.diasSemana)
        .split(/\s*[·,;]\s*/)
        .map(v => v.trim())
        .filter(v => v !== '');
      dias = arr.length > 0 ? arr : null;
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('jardineria_labor_actualizar', {
        p_id: d.id,
        p_bloque: aTexto(d.bloque),
        p_titulo: aTexto(d.titulo),
        p_frecuencia: aTexto(d.frecuencia),
        p_dias_semana: dias,
        p_momento: aTexto(d.momento),
        p_activo: d.activo
      });

      if (error) throw error;

      this.invalidarCacheJardineria();
      return data;
    } catch (e) {
      throw jardineriaErrorRPC('MantencionesService.actualizarLaborJardineria', e);
    }
  },

  // ------------------------------------------------------------
  // PREVENCIONISTA (subapartado: planificación Gantt, NO son realizadas)
  // ------------------------------------------------------------
  async getPrevencionGantt(force = false) {
    if (!force && this._prevencionCache) return this._prevencionCache;

    try {
      const [
        { data: planes, error: errPlanes },
        { data: fases, error: errFases },
        { data: items, error: errItems },
        { data: segmentos, error: errSegmentos }
      ] = await Promise.all([
        window.supabaseClient
          .from('prevencion_gantt_planes')
          .select('id, created_at, updated_at, titulo, titulo_original, observaciones, area_id, importacion_id, empresa, empresa_original, activo, anio, subapartado, titulo_proyecto_original, titulo_proyecto, gerente_proyecto_original, gerente_proyecto, fecha_documento, origen_registro'),
        window.supabaseClient
          .from('prevencion_gantt_fases')
          .select('id, created_at, updated_at, nombre, nombre_original, plan_id, orden, semana_inicio, semana_fin, activo, origen_registro')
          .order('orden', { ascending: true }),
        window.supabaseClient
          .from('prevencion_gantt_items')
          .select('id, created_at, updated_at, titulo, titulo_original, observaciones, plan_id, fecha_inicio, fecha_inicio_original, responsable, responsable_original, identificacion, identificacion_original, fecha_pendiente, fecha_pendiente_original, duracion_dias, duracion_dias_original, progreso_porcentaje, progreso_porcentaje_original, es_placeholder, fila_origen, activo, progreso_excel_original, es_grupo, celda_identificacion_origen, fase_id, fecha_termino, orden, origen_registro')
          .order('fila_origen', { ascending: true }),
        window.supabaseClient
          .from('prevencion_gantt_segmentos')
          .select('id, created_at, plan_id, item_id, identificacion_original, celda_inicio_original, celda_fin_original, semana_inicio_original, dia_inicio_original, semana_fin_original, dia_fin_original, color_grupo_original')
      ]);

      if (errPlanes) throw errPlanes;
      if (errFases) throw errFases;
      if (errItems) throw errItems;
      if (errSegmentos) throw errSegmentos;

      const resultado = {
        planes: planes || [],
        fases: fases || [],
        items: items || [],
        segmentos: segmentos || []
      };
      this._prevencionCache = resultado;
      return resultado;

    } catch (e) {
      console.error('Error completo Supabase en getPrevencionGantt:', e);
      throw e;
    }
  },

  // ------------------------------------------------------------
  // PREVENCIONISTA — ESCRITURAS VÍA RPC (C2P-4B)
  // ------------------------------------------------------------
  // Toda escritura pasa por RPC server-side (SECURITY DEFINER con
  // auth.uid() + usuario_habilitado_actual() +
  // es_administrador_permanente_actual() + auditoría propia). En el
  // frontend NUNCA hay .insert() / .update() / .delete() directo.
  //
  // Campos NO enviados por diseño: *_original, fila_origen,
  // celda_identificacion_origen, es_placeholder, es_grupo, importacion_id,
  // segmentos históricos y origen_registro: la trazabilidad del Excel es
  // inmutable desde la UI (el backend no los modifica).
  //
  // En éxito: solo invalida _prevencionCache (el F5 / window.location.reload()
  // lo decide SIEMPRE la capa de vista, nunca el service). En error: se
  // relanza el mensaje real de Supabase + .codigo + .detalle.
  //
  // ADVERTENCIA (validar antes del primer E2E de escritura): los nombres
  // de los parámetros p_* son el patrón del proyecto
  // (js/services/mantenciones.service.js → guia_contenido_*) aplicado a las
  // RPC prevencion_gantt_*; el repo NO contiene el SQL de esas RPC. Si la
  // firma real difiere, Supabase devolverá error "function ... does not
  // exist" / parámetro faltante SIN escribir nada (misma red de seguridad
  // que cualquier error de RPC: no hay reload ni escritura parcial).

  // Invalida SOLO la caché de Prevencionista. Las demás cachés del
  // service (_guiasCache, jardinería, fosas…) quedan intactas.
  invalidarCachePrevencion() {
    this._prevencionCache = null;
  },

  // Normaliza "texto libre u opcional": vacío/null ⇒ null (la DB guarda
  // NULL y la vista muestra "Sin … registrado"), con valor ⇒ string
  // recortado. Nunca convierte null en '' ni '' en null silencioso.
  _prevencionTexto(valor) {
    if (valor === null || valor === undefined) return null;
    const texto = String(valor).trim();
    return texto === '' ? null : texto;
  },

  // Normaliza fecha 'YYYY-MM-DD' (input type="date") u opcional.
  _prevencionFecha(valor) {
    if (valor === null || valor === undefined) return null;
    const texto = String(valor).trim();
    return texto === '' ? null : texto;
  },

  // Normaliza progreso: null (Sin progreso registrado) o número 0–100.
  _prevencionProgreso(valor) {
    if (valor === null || valor === undefined) return null;
    const texto = String(valor).trim();
    if (texto === '') return null;
    const numero = Number(valor);
    if (Number.isNaN(numero)) return NaN;
    return numero;
  },

  // ------------------------------------------------------------
  // RPC: prevencion_gantt_guardar_plan
  // Crea (p_plan_id null) o edita la información general del plan.
  // NO envía importacion_id ni origen_registro: un plan creado desde la
  // web nace CREADO_EN_SISTEMA (lo asigna el backend).
  // ------------------------------------------------------------
  async guardarPlanPrevencion(datos) {
    const d = (datos && typeof datos === 'object') ? datos : {};
    const titulo = this._prevencionTexto(d.titulo);

    if (!titulo) {
      throw new Error('Prevencionista: el título de la Carta Gantt es obligatorio.');
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('prevencion_gantt_guardar_plan', {
        p_plan_id: d.planId || null,
        p_titulo: titulo,
        p_titulo_proyecto: this._prevencionTexto(d.tituloProyecto),
        p_empresa: this._prevencionTexto(d.empresa),
        p_gerente_proyecto: this._prevencionTexto(d.gerenteProyecto),
        p_anio: (d.anio === null || d.anio === undefined || String(d.anio).trim() === '')
          ? null
          : Number(d.anio),
        p_activo: d.activo === undefined ? true : !!d.activo
      });
      if (error) throw error;

      this.invalidarCachePrevencion();
      return data;
    } catch (e) {
      throw prevencionErrorRPC('MantencionesService.guardarPlanPrevencion', e);
    }
  },

  // ------------------------------------------------------------
  // RPC: prevencion_gantt_guardar_fase
  // Crea (p_fase_id null) o edita una fase. NUNCA envía nombre_original
  // (trazabilidad del Excel inmutable) ni p_ordenes: el orden se cambia
  // SOLO con reordenarPrevencion().
  // ------------------------------------------------------------
  async guardarFasePrevencion(datos) {
    const d = (datos && typeof datos === 'object') ? datos : {};
    const nombre = this._prevencionTexto(d.nombre);

    if (!nombre) {
      throw new Error('Prevencionista: el nombre de la fase es obligatorio.');
    }
    if (!d.planId) {
      throw new Error('Prevencionista: falta planId para guardar la fase.');
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('prevencion_gantt_guardar_fase', {
        p_fase_id: d.faseId || null,
        p_plan_id: d.planId,
        p_nombre: nombre,
        p_activo: d.activo === undefined ? true : !!d.activo
      });
      if (error) throw error;

      this.invalidarCachePrevencion();
      return data;
    } catch (e) {
      throw prevencionErrorRPC('MantencionesService.guardarFasePrevencion', e);
    }
  },

  // ------------------------------------------------------------
  // RPC: prevencion_gantt_guardar_item
  // Crea (p_item_id null) o edita una tarea REAL. Valida en frontend lo
  // mismo que el backend: título obligatorio, fase obligatoria, progreso
  // 0–100 o NULL y fecha_termino >= fecha_inicio.
  // NUNCA envía: titulo_original, fecha_inicio_original,
  // responsable_original, identificacion_original, es_placeholder,
  // es_grupo, fila_origen, celda_identificacion_origen, segmentos.
  // ------------------------------------------------------------
  async guardarItemPrevencion(datos) {
    const d = (datos && typeof datos === 'object') ? datos : {};
    const titulo = this._prevencionTexto(d.titulo);
    const fechaInicio = this._prevencionFecha(d.fechaInicio);
    const fechaTermino = this._prevencionFecha(d.fechaTermino);
    const progreso = this._prevencionProgreso(d.progreso);

    if (!titulo) {
      throw new Error('Prevencionista: el nombre de la tarea es obligatorio.');
    }
    if (!d.planId) {
      throw new Error('Prevencionista: falta planId para guardar la tarea.');
    }
    if (!d.faseId) {
      throw new Error('Prevencionista: la fase de la tarea es obligatoria.');
    }
    if (Number.isNaN(progreso)) {
      throw new Error('Prevencionista: el progreso debe ser un número entre 0 y 100.');
    }
    if (progreso !== null && (progreso < 0 || progreso > 100)) {
      throw new Error('Prevencionista: el progreso debe estar entre 0 y 100.');
    }
    if (fechaInicio && fechaTermino && fechaTermino < fechaInicio) {
      throw new Error('Prevencionista: la fecha de término no puede ser anterior a la fecha de inicio.');
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('prevencion_gantt_guardar_item', {
        p_item_id: d.itemId || null,
        p_plan_id: d.planId,
        p_fase_id: d.faseId,
        p_titulo: titulo,
        p_responsable: this._prevencionTexto(d.responsable),
        p_fecha_inicio: fechaInicio,
        p_fecha_termino: fechaTermino,
        p_progreso_porcentaje: progreso,
        p_activo: d.activo === undefined ? true : !!d.activo
      });
      if (error) throw error;

      this.invalidarCachePrevencion();
      return data;
    } catch (e) {
      throw prevencionErrorRPC('MantencionesService.guardarItemPrevencion', e);
    }
  },

  // ------------------------------------------------------------
  // RPC: prevencion_gantt_reordenar
  // p_tipo = 'FASES' (p_padre_id = plan_id) o 'TAREAS' (p_padre_id =
  // fase_id). Se envía SIEMPRE la lista COMPLETA de IDs del padre en su
  // nuevo orden (no solo el par movido). Sin drag & drop: ↑ / ↓ en la
  // vista. En éxito invalida la caché; NO recarga la página.
  // ------------------------------------------------------------
  async reordenarPrevencion(datos) {
    const d = (datos && typeof datos === 'object') ? datos : {};
    const tipo = String(d.tipo || '').toUpperCase();

    if (tipo !== 'FASES' && tipo !== 'TAREAS') {
      throw new Error("Prevencionista: tipo de reordenamiento inválido (use 'FASES' o 'TAREAS').");
    }
    if (!d.padreId) {
      throw new Error('Prevencionista: falta padreId para reordenar.');
    }
    if (!Array.isArray(d.ordenes) || d.ordenes.length === 0) {
      throw new Error('Prevencionista: la lista de IDs del padre está vacía.');
    }

    try {
      const { data, error } = await window.supabaseClient.rpc('prevencion_gantt_reordenar', {
        p_tipo: tipo,
        p_padre_id: d.padreId,
        p_ordenes: d.ordenes
      });
      if (error) throw error;

      this.invalidarCachePrevencion();
      return data;
    } catch (e) {
      throw prevencionErrorRPC('MantencionesService.reordenarPrevencion', e);
    }
  }
};
