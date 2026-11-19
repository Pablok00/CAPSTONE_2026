// ==========================================================
// SERVICIO: MEJORAS / OBRAS - HOTEL EL ALMENDRO
// ==========================================================
// FASE 4B-1: Proyecto + Carta Gantt (Carta_Gantt.xlsx) — validado.
// FASE 4B-2: Plan Anual (planes_anuales, plan_anual_items,
// plan_anual_pendientes) + Metas (metas_area) + Pendientes
// (pendientes_mantencion) — esquemas verificados en Supabase.
//
// Patrón técnico: js/services/mantenciones.service.js y
// js/services/remodelaciones.service.js.
// Acceso a datos reales vía window.supabaseClient (RLS: authenticated).
//
// Convenciones:
// - Caché interna por método (force = true fuerza recarga).
// - SELECT con columnas explícitas; NUNCA SELECT *.
// - Identificación por TRAZABILIDAD REAL (archivo_origen +
//   hoja_origen + proyecto_id), NUNCA por nombre del proyecto.
// - NULL nunca se convierte a 0 ni a fecha/responsable inventado:
//   el valor real se devuelve tal cual; los textos neutros los
//   agrega la presentación, no el service.
// - Los datos reales NO se guardan en state.improvements ni en
//   localStorage; viven solo en la caché interna del objeto.
// - SOLO LECTURA: sin INSERT / UPDATE / DELETE / UPSERT.

// Trazabilidad del archivo origen de esta fase (verificado en Supabase).
const ARCHIVO_MEJORAS = 'Carta_Gantt.xlsx';
const HOJA_MEJORAS = 'Carta Gantt';

window.MejorasService = {
  _proyectosCache: null,
  _detalleCache: {},   // clave: proyectoId
  _tareasCache: {},    // clave: proyectoId
  _metasCache: null,
  _pendientesCache: null,
  _planesAnualesCache: null,
  _planAnualDetalleCache: {},  // clave: planId
  _planAnualPendientesCache: null,

  // ----------------------------------------------------------
  // getProyectos(force = false)
  // Proyectos reales asociados a Carta_Gantt.xlsx.
  // Estrategia: partir desde las tareas con trazabilidad verificada
  // (archivo_origen + hoja_origen + proyecto_id no nulo) y luego
  // cargar los proyectos correspondientes. Así NO se identifica el
  // proyecto por su nombre y NO entran proyectos mock ni de otros
  // archivos.
  // ----------------------------------------------------------
  _versionProyectos: 0,
  _proyectosEnCurso: null,
  invalidarProyectos() {
    this._versionProyectos++;
    this._proyectosCache=null;
    this._proyectosEnCurso=null;
  },
  async getProyectos(force = false) {
    if (!force && this._proyectosCache) return this._proyectosCache;
    if (this._proyectosEnCurso) return this._proyectosEnCurso;
    const version=this._versionProyectos;
    const consulta=this._consultarProyectos().then(filas=>{
      if(version===this._versionProyectos)this._proyectosCache=filas;
      return filas;
    }).finally(()=>{if(this._proyectosEnCurso===consulta)this._proyectosEnCurso=null;});
    this._proyectosEnCurso=consulta;
    return consulta;
  },
  async _consultarProyectos() {
    try {
      // 1. Ids de proyectos que tienen tareas trazables a Carta_Gantt.xlsx.
      const { data: tareasOrigen, error: errTareas } = await window.supabaseClient
        .from('tareas')
        .select('proyecto_id')
        .eq('archivo_origen', ARCHIVO_MEJORAS)
        .eq('hoja_origen', HOJA_MEJORAS)
        .not('proyecto_id', 'is', null);

      if (errTareas) throw errTareas;

      const proyectoIds = [...new Set((tareasOrigen || []).map(t => t.proyecto_id))];

      if (proyectoIds.length === 0) {
        return [];
      }

      // 2. Proyectos reales (columnas explícitas de la tabla proyectos).
      const { data: proyectos, error: errProy } = await window.supabaseClient
        .from('proyectos')
        .select('id, nombre, estado, es_historico, area_id, ubicacion_id, fecha_inicio, fecha_fin_estimada, responsable_texto, observaciones')
        .in('id', proyectoIds);

      if (errProy) throw errProy;

      return proyectos || [];
    } catch (e) {
      console.error('Error completo Supabase en MejorasService.getProyectos:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // getProyectoDetalle(proyectoId, force = false)
  // Registro real del proyecto. Columnas explícitas.
  // ----------------------------------------------------------
  async getProyectoDetalle(proyectoId, force = false) {
    if (!force && this._detalleCache[proyectoId]) return this._detalleCache[proyectoId];

    try {
      const { data: proyecto, error } = await window.supabaseClient
        .from('proyectos')
        .select('id, nombre, estado, es_historico, area_id, ubicacion_id, fecha_inicio, fecha_fin_estimada, responsable_texto, observaciones')
        .eq('id', proyectoId)
        .single();

      if (error) throw error;

      this._detalleCache[proyectoId] = proyecto || null;
      return this._detalleCache[proyectoId];
    } catch (e) {
      console.error('Error completo Supabase en MejorasService.getProyectoDetalle:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // getTareas(proyectoId, force = false)
  // Tareas vinculadas al proyecto, incluidas las creadas en el sistema.
  // Archivo y hoja se conservan como procedencia, sin atribuirlos a tareas nuevas.
  //
  // ORDEN: la tabla tareas NO tiene campo de orden explícito.
  // Se ordena por fecha_inicio ASC, con id como criterio
  // secundario para que el orden sea estable entre llamadas.
  // Es el mismo criterio de inicio que usa la Carta Gantt del
  // Excel (columna "Inicio" de izquierda a derecha).
  // ----------------------------------------------------------
  async getTareas(proyectoId, force = false) {
    if (!force && this._tareasCache[proyectoId]) return this._tareasCache[proyectoId];

    try {
      const { data: tareas, error } = await window.supabaseClient
        .from('tareas')
        .select('id, area_id, ubicacion_id, proyecto_id, elemento_id, titulo, descripcion, prioridad, estado, responsable_id, responsable_texto, fecha_inicio, fecha_vencimiento, fecha_finalizacion, frecuencia, hora_inicio, hora_fin, duracion_original, progreso, archivo_origen, hoja_origen, grupo_origen')
        .eq('proyecto_id', proyectoId)
        .order('fecha_inicio', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true });

      if (error) throw error;

      this._tareasCache[proyectoId] = tareas || [];
      return this._tareasCache[proyectoId];
    } catch (e) {
      console.error('Error completo Supabase en MejorasService.getTareas:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // getMetas(force = false)
  // Metas reales de la tabla metas_area (fuente: POR HACER- Area
  // Mantenciones.xlsx). Se conservan textos originales tal cual;
  // este method NO normaliza ni interpreta nada.
  // Orden estable: created_at ASC + id ASC (no existe campo de
  // orden explícito en la tabla).
  // ----------------------------------------------------------
  async getMetas(force = false) {
    if (!force && this._metasCache) return this._metasCache;

    try {
      const { data: metas, error } = await window.supabaseClient
        .from('metas_area')
        .select('id, importacion_id, area_original, equipo_original, mes_original, tarea_original, responsable_original, frecuencia_original, estado_original, celda_tarea_origen, fila_origen, tarea_id, observaciones, created_at')
        .order('created_at', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true });

      if (error) throw error;

      this._metasCache = metas || [];
      return this._metasCache;
    } catch (e) {
      console.error('Error completo Supabase en MejorasService.getMetas:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // getMetasPorArea(areaOriginal, force = false)
  // Filtra por el texto ORIGINAL del área (columna area_original),
  // sin normalizar. NO genera una consulta nueva: reutiliza la
  // caché de getMetas() para evitar consultas redundantes.
  // ----------------------------------------------------------
  async getMetasPorArea(areaOriginal, force = false) {
    const metas = await this.getMetas(force);
    return metas.filter(m => m.area_original === areaOriginal);
  },

  // ----------------------------------------------------------
  // getPendientes(force = false)
  // Pendientes reales de la tabla pendientes_mantencion (fuente:
  // POR HACER- Area Mantenciones.xlsx). Fechas imprecisas: se
  // devuelven los campos tal cual (fecha_idea_original,
  // fecha_idea, fecha_idea_anio/mes/precision, e ídem realizado);
  // NUNCA se inventa un día cuando solo existe año/mes/texto.
  // realizado_por_color y color_original se conservan como vienen.
  // Orden estable: created_at ASC + id ASC.
  // ----------------------------------------------------------
  async getPendientes(force = false) {
    if (!force && this._pendientesCache) return this._pendientesCache;

    try {
      const { data: pendientes, error } = await window.supabaseClient
        .from('pendientes_mantencion')
        .select('id, importacion_id, grupo_original, titulo_original, fecha_idea_original, fecha_idea, fecha_idea_anio, fecha_idea_mes, fecha_idea_precision, fecha_realizado_original, fecha_realizado, fecha_realizado_anio, fecha_realizado_mes, fecha_realizado_precision, realizado_por_color, color_original, comentario_original, comentario_autor_original, comentario_celda_origen, celda_titulo_origen, celda_fecha_idea_origen, celda_fecha_realizado_origen, fila_origen, proyecto_id, tarea_id, observaciones, created_at')
        .order('created_at', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true });

      if (error) throw error;

      this._pendientesCache = pendientes || [];
      return this._pendientesCache;
    } catch (e) {
      console.error('Error completo Supabase en MejorasService.getPendientes:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // getPendientesPorGrupo(grupoOriginal, force = false)
  // Filtra por el texto ORIGINAL del grupo (grupo_original),
  // sin normalizar. Reutiliza la caché de getPendientes() para
  // no duplicar consultas.
  // ----------------------------------------------------------
  async getPendientesPorGrupo(grupoOriginal, force = false) {
    const pendientes = await this.getPendientes(force);
    return pendientes.filter(p => p.grupo_original === grupoOriginal);
  },

  // ----------------------------------------------------------
  // getPlanesAnuales(force = false)
  // Planes anuales reales (fuente: PLAN ANUAL DE TRABAJO.xlsx).
  // Esquema verificado directamente en Supabase:
  // planes_anuales(id, importacion_id, anio, contexto,
  //                nombre_original, created_at)
  // Orden: anio ASC, contexto ASC, id ASC (desempate estable).
  // ----------------------------------------------------------
  async getPlanesAnuales(force = false) {
    if (!force && this._planesAnualesCache) return this._planesAnualesCache;

    try {
      const { data: planes, error } = await window.supabaseClient
        .from('planes_anuales')
        .select('id, importacion_id, anio, contexto, nombre_original, created_at')
        .order('anio', { ascending: true })
        .order('contexto', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;

      this._planesAnualesCache = planes || [];
      return this._planesAnualesCache;
    } catch (e) {
      console.error('Error completo Supabase en MejorasService.getPlanesAnuales:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // getPlanAnualDetalle(planId, force = false)
  // Devuelve { plan, items } de UN solo plan.
  // - plan: registro real de planes_anuales por id.
  // - items: plan_anual_items WHERE plan_id = planId (nunca se
  //   mezclan items de otros planes).
  // Los items conservan texto_original, mes/mes_original,
  // comentarios (*_original), celda_origen, proyecto_id y
  // tarea_id tal cual, incluso si son NULL.
  // No se separan textos con varias actividades ni se infieren
  // fechas desde el texto.
  // Orden de items: mes ASC, area_original ASC, celda_origen ASC.
  // ----------------------------------------------------------
  async getPlanAnualDetalle(planId, force = false) {
    if (!force && this._planAnualDetalleCache[planId]) return this._planAnualDetalleCache[planId];

    try {
      const { data: plan, error: errPlan } = await window.supabaseClient
        .from('planes_anuales')
        .select('id, importacion_id, anio, contexto, nombre_original, created_at')
        .eq('id', planId)
        .single();

      if (errPlan) throw errPlan;

      const { data: items, error: errItems } = await window.supabaseClient
        .from('plan_anual_items')
        .select('id, plan_id, area_original, mes, mes_original, texto_original, comentario_original, comentario_autor_original, comentario_metadato_original, celda_origen, proyecto_id, tarea_id, observaciones, created_at')
        .eq('plan_id', planId)
        .order('mes', { ascending: true, nullsFirst: false })
        .order('area_original', { ascending: true, nullsFirst: false })
        .order('celda_origen', { ascending: true, nullsFirst: false });

      if (errItems) throw errItems;

      const resultado = { plan: plan || null, items: items || [] };
      this._planAnualDetalleCache[planId] = resultado;
      return resultado;
    } catch (e) {
      console.error('Error completo Supabase en MejorasService.getPlanAnualDetalle:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // getPlanAnualPendientes(force = false)
  // Pendientes del plan anual (fuente: PLAN ANUAL DE TRABAJO.xlsx).
  // Esquema verificado:
  // plan_anual_pendientes(id, importacion_id, anio, nombre_original,
  //   monto_original, monto_normalizado, celda_nombre_origen,
  //   celda_monto_origen, proyecto_id, observaciones, created_at)
  //
  // REGLA ECONÓMICA: monto_original se devuelve LITERAL
  // ("40M", "700 mil", "1,5M", texto, NULL). monto_normalizado se
  // devuelve tal cual (normalmente NULL). NO se asume moneda,
  // NO se interpretan abreviaturas, NO se convierte NULL a 0.
  // Orden: anio ASC, nombre_original ASC, id ASC (desempate).
  // ----------------------------------------------------------
  async getPlanAnualPendientes(force = false) {
    if (!force && this._planAnualPendientesCache) return this._planAnualPendientesCache;

    try {
      const { data: pendientes, error } = await window.supabaseClient
        .from('plan_anual_pendientes')
        .select('id, importacion_id, anio, nombre_original, monto_original, monto_normalizado, celda_nombre_origen, celda_monto_origen, proyecto_id, observaciones, created_at')
        .order('anio', { ascending: true, nullsFirst: false })
        .order('nombre_original', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true });

      if (error) throw error;

      this._planAnualPendientesCache = pendientes || [];
      return this._planAnualPendientesCache;
    } catch (e) {
      console.error('Error completo Supabase en MejorasService.getPlanAnualPendientes:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // getPlanAnualPendientesPorAnio(anio, force = false)
  // Filtra por año EXACTO. NO hace consulta nueva: reutiliza la
  // caché de getPlanAnualPendientes() y filtra en memoria.
  // ----------------------------------------------------------
  async getPlanAnualPendientesPorAnio(anio, force = false) {
    const pendientes = await this.getPlanAnualPendientes(force);
    return pendientes.filter(p => p.anio === anio);
  },

  // ----------------------------------------------------------
  // clearCache()
  // Vacia toda la caché interna del service.
  // ----------------------------------------------------------
  clearCache() {
    this.invalidarProyectos();
    this._detalleCache = {};
    this._tareasCache = {};
    this._metasCache = null;
    this._pendientesCache = null;
    this._planesAnualesCache = null;
    this._planAnualDetalleCache = {};
    this._planAnualPendientesCache = null;
  }
};
