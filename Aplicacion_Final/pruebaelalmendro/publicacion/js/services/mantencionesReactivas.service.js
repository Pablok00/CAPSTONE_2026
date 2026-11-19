window.MantencionesReactivasService = {
  columnas: 'id, solicitud_id, estado, creada_por, creador_nombre_snapshot, created_at, updated_at, responsable_trabajador_id, asignada_en, iniciada_en, resuelta_en, cerrada_en, detalle_ejecucion, observaciones_cierre, revision, ciclo_actual, solicitud:solicitudes_reactivas!solicitud_id(id,tipo_problema,ubicacion,descripcion,urgencia,observaciones,estado,creada_por,created_at,updated_at,revisada_por,anulada_por,creador_nombre_snapshot,revisor_nombre_snapshot,anulador_nombre_snapshot), responsable:trabajadores!responsable_trabajador_id(id,nombre,cargo)',
  async validarLectura() {
    await window.SolicitudesService.usuarioActual();
    if (!hasAccess('areas', state.currentUser.role)) throw new Error('No tienes autorización para consultar Mantención Reactiva.');
  },
  async contar() {
    await this.validarLectura();
    const { count, error } = await window.supabaseClient.from('mantenciones_reactivas')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    if (!Number.isInteger(count) || count < 0) throw new Error('El conteo de mantenciones está incompleto.');
    return count;
  },
  async listar(pagina = 0, { grupo = 'activas', busqueda = '' } = {}) {
    await this.validarLectura();
    if (!['activas', 'finalizadas'].includes(grupo) || !Number.isSafeInteger(pagina) || pagina < 0) throw new Error('El filtro de mantenciones no es válido.');
    const texto = grupo === 'finalizadas' ? String(busqueda).trim() : '';
    // !inner hace que la búsqueda de la solicitud filtre también las mantenciones,
    // antes del conteo y de range; sin búsqueda se conserva la relación opcional.
    const columnas = texto ? this.columnas.replace('!solicitud_id(', '!solicitud_id!inner(') : this.columnas;
    let consulta = window.supabaseClient.from('mantenciones_reactivas').select(columnas, { count: 'exact' });
    consulta = grupo === 'finalizadas' ? consulta.eq('estado', 'cerrada') : consulta.neq('estado', 'cerrada');
    if (texto) {
      const patron = JSON.stringify('%' + texto.replace(/[\\%_]/g, '\\$&') + '%');
      consulta = consulta.or('tipo_problema.ilike.' + patron + ',ubicacion.ilike.' + patron, { referencedTable: 'solicitud' });
    }
    const { data, count, error } = await consulta.order('created_at', { ascending: false })
      .order('id', { ascending: false }).range(pagina * 20, pagina * 20 + 19);
    if (error) throw error;
    if (!Array.isArray(data) || !Number.isInteger(count)) throw new Error('La respuesta de mantenciones está incompleta.');
    return { registros: data, total: count };
  },
  async obtener(id, { permitirAusente = false } = {}) {
    await this.validarLectura();
    const consulta = window.supabaseClient.from('mantenciones_reactivas').select(this.columnas).eq('id', id);
    const { data, error } = await (permitirAusente ? consulta.maybeSingle() : consulta.single());
    if (error) throw error;
    if (!data && !permitirAusente) throw new Error('La mantención no está disponible.');
    return data;
  },
  async historial(registro, { historicos = false } = {}) {
    await this.validarLectura();
    const actorHistorico = state.currentUser?.id;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(registro.id) || !uuid.test(registro.solicitud_id)) throw new Error('Los identificadores del historial no son válidos.');
    const eventos = [];
    for (let desde = 0; ;) {
      const { data, count, error } = await window.supabaseClient.from('solicitudes_reactivas_eventos')
        .select('id, solicitud_id, mantencion_reactiva_id, actor_id, evento, motivo, detalle, created_at, actor_nombre_snapshot', { count: 'exact' })
        .eq('solicitud_id', registro.solicitud_id)
        .or('mantencion_reactiva_id.eq.' + registro.id + ',mantencion_reactiva_id.is.null')
        .order('created_at', { ascending: true }).order('id', { ascending: true }).range(desde, desde + 199);
      if (error) throw error;
      if (!Array.isArray(data) || !Number.isInteger(count)) throw new Error('La respuesta del historial está incompleta.');
      eventos.push(...data);
      if (eventos.length >= count) break;
      if (!data.length) throw new Error('El historial cambió durante la consulta. Actualiza para volver a leerlo.');
      desde += data.length;
    }
    const ciclos = [];
    for (let desde = 0; ;) {
      const { data, count, error } = await window.supabaseClient.from('mantenciones_reactivas_ciclos')
        .select('id,mantencion_id,numero_ciclo,responsable_trabajador_id,asignada_en,iniciada_en,resuelta_en,cerrada_en,detalle_ejecucion,observaciones_cierre,revision_al_cerrar,archivado_en', { count: 'exact' })
        .eq('mantencion_id', registro.id).order('numero_ciclo', { ascending: true }).order('id', { ascending: true }).range(desde, desde + 199);
      if (error) throw error;
      if (!Array.isArray(data) || !Number.isInteger(count)) throw new Error('La respuesta de ciclos está incompleta.');
      ciclos.push(...data);
      if (ciclos.length >= count) break;
      if (!data.length) throw new Error('Los ciclos cambiaron durante la consulta. Actualiza el historial.');
      desde += data.length;
    }
    const trabajadores = new Map();
    if (registro.responsable?.id) trabajadores.set(registro.responsable.id, registro.responsable);
    const ids = [...new Set([...eventos.flatMap(e => [e.detalle?.trabajador_anterior, e.detalle?.trabajador_nuevo]), ...ciclos.map(c => c.responsable_trabajador_id)])]
      .filter(id => typeof id === 'string' && uuid.test(id) && !trabajadores.has(id));
    let avisoTrabajadores = '';
    for (let desde = 0; desde < ids.length; desde += 100) {
      const { data, error } = await window.supabaseClient.from('trabajadores')
        .select('id,nombre,cargo').in('id', ids.slice(desde, desde + 100));
      if (error || !Array.isArray(data)) {
        avisoTrabajadores = 'No se pudieron consultar algunos nombres de trabajadores. ' + (error?.message || 'Respuesta incompleta.');
        continue;
      }
      data.forEach(t => trabajadores.set(t.id,t));
    }
    // Snapshots y nombres laborales autorizados no necesitan consultar la Edge de eliminación.
    const eventosVisibles = historicos === true && window.UsuariosService?.anotarNombresHistoricos
      ? await window.UsuariosService.anotarNombresHistoricos('REACTIVAS_EVENTOS', eventos) : eventos;
    const ciclosVisibles = historicos === true && window.UsuariosService?.anotarNombresHistoricos
      ? await window.UsuariosService.anotarNombresHistoricos('REACTIVAS_CICLOS', ciclos) : ciclos;
    if (!actorHistorico || state.currentUser?.id !== actorHistorico) throw new Error('La sesión cambió durante la consulta.');
    return { eventos: eventosVisibles, ciclos: ciclosVisibles, trabajadores, avisoTrabajadores };
  },
  async notificarCambioConfirmado(usuarioId) {
    try {
      if(state.currentUser?.id!==usuarioId)return false;
      return await window.SolicitudesSincronizacion?.emitirReactivaConfirmada?.() ?? false;
    } catch (_) { return false; } // El fallo del aviso nunca reenvía la escritura.
  },
  async reabrir(registro, motivo) {
    const usuario = await window.SolicitudesService.usuarioActual();
    if (!esAdminOperativoActual() || !await revalidarPrivilegioParaEscritura() || state.currentUser?.id !== usuario.id) throw new Error('No tienes autorización administrativa vigente.');
    if (registro.estado !== 'cerrada') throw new Error('Solo se puede reabrir una mantención cerrada.');
    if (registro.revision == null || !/^\d+$/.test(String(registro.revision)) || (typeof registro.revision === 'number' && !Number.isSafeInteger(registro.revision))) throw new Error('La revisión no es válida. Actualiza la ficha.');
    const texto = String(motivo || '').trim();
    if (texto.length < 10 || texto.length > 2000) throw new Error('El motivo debe tener entre 10 y 2000 caracteres.');
    const { error } = await window.supabaseClient.rpc('mantencion_reactiva_reabrir', {
      p_mantencion_id: registro.id, p_revision_esperada: registro.revision, p_motivo: texto
    });
    if (error) throw error;
    this.notificarCambioConfirmado(usuario.id);
  },
  async cambiarEstado(registro, estadoNuevo, detalleEjecucion, observacionesCierre) {
    const usuario = await window.SolicitudesService.usuarioActual();
    if (!esAdminOperativoActual() || !await revalidarPrivilegioParaEscritura() || state.currentUser?.id !== usuario.id) {
      throw new Error('No tienes autorización administrativa vigente.');
    }
    const transiciones = { pendiente_asignacion: 'en_proceso', asignada: 'en_proceso', en_proceso: 'resuelta', resuelta: 'cerrada' };
    if (transiciones[registro.estado] !== estadoNuevo || registro.cerrada_en) throw new Error('La transición no está permitida. Actualiza la ficha.');
    if (registro.revision == null || !/^\d+$/.test(String(registro.revision)) || (typeof registro.revision === 'number' && !Number.isSafeInteger(registro.revision))) throw new Error('La revisión no es válida. Actualiza la ficha.');
    const detalle = String(detalleEjecucion || '').trim();
    const observaciones = String(observacionesCierre || '').trim();
    if (estadoNuevo === 'resuelta' && detalle.length < 10) throw new Error('El detalle de ejecución debe tener al menos 10 caracteres.');
    if (estadoNuevo === 'cerrada' && observaciones.length < 5) throw new Error('Las observaciones de cierre deben tener al menos 5 caracteres.');
    const { error } = await window.supabaseClient.rpc('mantencion_reactiva_cambiar_estado', {
      p_mantencion_id: registro.id,
      p_estado_nuevo: estadoNuevo,
      p_revision_esperada: registro.revision,
      p_detalle_ejecucion: estadoNuevo === 'resuelta' ? detalle : registro.detalle_ejecucion ?? null,
      p_observaciones_cierre: estadoNuevo === 'cerrada' ? observaciones : registro.observaciones_cierre ?? null
    });
    if (error) throw error;
    this.notificarCambioConfirmado(usuario.id);
  },
  async asignar(registro, trabajadorId, motivo) {
    const usuario = await window.SolicitudesService.usuarioActual();
    if (!esAdminOperativoActual() || !await revalidarPrivilegioParaEscritura() || state.currentUser?.id !== usuario.id) {
      throw new Error('No tienes autorización administrativa vigente.');
    }
    if (registro.resuelta_en || registro.cerrada_en || /^(resuelt[ao]|cerrad[ao])$/.test(registro.estado)) throw new Error('No se puede cambiar el responsable de una mantención resuelta o cerrada.');
    if (registro.revision == null || !/^\d+$/.test(String(registro.revision)) || (typeof registro.revision === 'number' && !Number.isSafeInteger(registro.revision))) throw new Error('La revisión no es válida. Actualiza la ficha.');
    const justificacionSinAsignar=registro.responsable_trabajador_id===null&&trabajadorId===null&&registro.estado==='pendiente_asignacion';
    if (trabajadorId === registro.responsable_trabajador_id&&!justificacionSinAsignar) throw new Error('La asignación no ha cambiado.');
    const texto = String(motivo || '').trim();
    if ((registro.responsable_trabajador_id || trabajadorId===null || texto) && (Array.from(texto).length < 5 || Array.from(texto).length > 1000)) throw new Error('El motivo debe tener entre 5 y 1000 caracteres.');
    const { error } = await window.supabaseClient.rpc('mantencion_reactiva_asignar', {
      p_mantencion_id: registro.id,
      p_trabajador_id: trabajadorId,
      p_revision_esperada: registro.revision,
      p_motivo: texto || null
    });
    if (error) throw error;
    this.notificarCambioConfirmado(usuario.id);
  }
};
