window.SolicitudesService = {
  columnas: 'id, tipo_problema, ubicacion, descripcion, urgencia, observaciones, estado, creada_por, created_at, updated_at, revisada_por, revisada_en, motivo_decision, anulada_por, creador_nombre_snapshot, revisor_nombre_snapshot, anulador_nombre_snapshot',
  async usuarioActual() {
    const { data, error } = await window.supabaseClient.auth.getUser();
    if (error) throw error;
    if (!data?.user || data.user.id !== state.currentUser?.id) throw new Error('La sesión no es válida. Vuelve a iniciar sesión.');
    return data.user;
  },
  async contarSolicitudesAdministrativas() {
    const usuario = await this.usuarioActual();
    if (!esAdminOperativoActual()) return null;
    const estados = ['pendiente', 'aprobada', 'rechazada'];
    const resultados = await Promise.all(estados.map(estado => window.supabaseClient.from('solicitudes_reactivas')
      .select('id', { count: 'exact', head: true }).eq('estado', estado)));
    if (state.currentUser?.id !== usuario.id || !esAdminOperativoActual()) return null;
    return Object.fromEntries(resultados.map(({ count, error }, indice) => {
      if (error) throw error;
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('El conteo de solicitudes no está disponible.');
      return [estados[indice], count];
    }));
  },
  async listar(pagina = 0, { estado = '', busqueda = '', orden = 'recientes', historicos = false } = {}) {
    const usuario = await this.usuarioActual();
    const administrador = esAdminOperativoActual();
    if (!administrador && state.currentUser.role !== 'RECEPCION') throw new Error('No tienes autorización para consultar solicitudes.');
    if (!Number.isSafeInteger(pagina) || pagina < 0 || !['','pendiente','aprobada','rechazada'].includes(estado) || !['recientes','antiguas'].includes(orden)) throw new Error('Los filtros de solicitudes no son válidos.');
    const texto = String(busqueda).trim().replace(/\s+/g, ' ');
    // El nombre histórico se consulta en la propia solicitud, sin depender del perfil.
    let consulta = window.supabaseClient.from('solicitudes_reactivas').select(this.columnas, { count:'exact' });
    if (!administrador) consulta = consulta.eq('creada_por', usuario.id);
    if (estado) consulta = consulta.eq('estado', estado);
    if (texto) {
      // Regex literal, sin operadores introducidos por el usuario; tolera espacios
      // repetidos en los datos. imatch es la comparación sin distinción de caja.
      const patron = texto.split(' ').map(parte => parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
      consulta = consulta.or('tipo_problema.imatch.' + JSON.stringify(patron) + ',ubicacion.imatch.' + JSON.stringify(patron) + ',creador_nombre_snapshot.imatch.' + JSON.stringify(patron));
    }
    const ascendente = orden === 'antiguas';
    const { data, count, error } = await consulta.order('created_at', { ascending:ascendente })
      .order('id', { ascending:ascendente }).range(pagina * 20, pagina * 20 + 19);
    if (error) throw error;
    if (!Array.isArray(data) || !Number.isInteger(count) || count < 0) throw new Error('La respuesta de solicitudes está incompleta.');
    // La consulta ordinaria ya tiene snapshots autorizados. Etiquetar una baja es una lectura adicional explícita.
    const presentacion=historicos === true && window.UsuariosService?.anotarNombresHistoricos ? await window.UsuariosService.anotarNombresHistoricos('SOLICITUDES',data) : data;
    if(state.currentUser?.id!==usuario.id)throw Error('La sesión cambió durante la consulta.');
    return { registros:presentacion, total:count };
  },
  async obtener(id, { permitirAusente = false, historicos = false } = {}) {
    const usuario = await this.usuarioActual();
    const administrador = esAdminOperativoActual();
    if (!administrador && state.currentUser.role !== 'RECEPCION') throw new Error('No tienes autorización para consultar solicitudes.');
    let consulta = window.supabaseClient.from('solicitudes_reactivas').select(this.columnas).eq('id', id);
    if (!administrador) consulta = consulta.eq('creada_por', usuario.id);
    const { data, error } = await (permitirAusente ? consulta.maybeSingle() : consulta.single());
    if (error) throw error;
    if (!data && !permitirAusente) throw new Error('La solicitud no está disponible.');
    const presentacion=data&&historicos === true && window.UsuariosService?.anotarNombresHistoricos ? (await window.UsuariosService.anotarNombresHistoricos('SOLICITUDES',[data]))[0] : data;
    if(state.currentUser?.id!==usuario.id)throw Error('La sesión cambió durante la consulta.');
    return presentacion;
  },
  async resumenesPropios(ids) {
    const usuario = await this.usuarioActual();
    const resultado = new Map();
    const unicos = [...new Set(ids)];
    for (let desde = 0; desde < unicos.length; desde += 100) {
      const { data, error } = await window.supabaseClient.from('solicitudes_reactivas')
        .select('id,tipo_problema,ubicacion,estado,revisada_por,revisada_en,revisor_nombre_snapshot').eq('creada_por',usuario.id).in('id',unicos.slice(desde,desde + 100));
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('La respuesta de solicitudes está incompleta.');
      data.forEach(fila => resultado.set(fila.id,fila));
    }
    return resultado;
  },
  async vinculos(ids) {
    await this.usuarioActual();
    if (!esAdminOperativoActual() || !hasAccess('areas',state.currentUser?.role)) throw new Error('No tienes autorización para consultar las mantenciones vinculadas.');
    const unicos = [...new Set(ids)];
    const resultado = new Map();
    for (let desde = 0; desde < unicos.length; desde += 100) {
      const { data, error } = await window.supabaseClient.from('mantenciones_reactivas')
        .select('id,solicitud_id').in('solicitud_id',unicos.slice(desde,desde + 100));
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('No se pudo comprobar la vinculación de las mantenciones.');
      data.forEach(fila => { if (fila.id && unicos.includes(fila.solicitud_id)) resultado.set(fila.solicitud_id,fila.id); });
    }
    return resultado;
  },
  async vinculo(id) {
    await this.usuarioActual();
    if (!esAdminOperativoActual()) throw new Error('No tienes autorización para consultar la mantención vinculada.');
    const { data, error } = await window.supabaseClient.from('mantenciones_reactivas')
      .select('id').eq('solicitud_id', id).maybeSingle();
    if (error) throw error;
    return data?.id || null;
  },
  async decidir(id, aprobar, motivo) {
    const usuario = await this.usuarioActual();
    if (typeof aprobar !== 'boolean') throw new Error('La decisión no es válida.');
    const texto = String(motivo || '').trim();
    if (!aprobar && !texto) throw new Error('Indica el motivo del rechazo.');
    if (!await revalidarPrivilegioParaEscritura() || state.currentUser?.id !== usuario.id) {
      throw new Error('No tienes autorización administrativa vigente. Actualiza la información.');
    }
    const { data, error } = await window.supabaseClient.rpc('solicitud_reactiva_decidir', {
      p_solicitud_id: id, p_aprobar: aprobar, p_motivo: texto || null
    });
    if (error) throw error;
    const resultado = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!resultado || resultado.solicitud_id !== id ||
        resultado.estado_solicitud !== (aprobar ? 'aprobada' : 'rechazada') ||
        (aprobar ? !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resultado.mantencion_reactiva_id || '') : resultado.mantencion_reactiva_id !== null)) {
      throw new Error('La respuesta de la decisión está incompleta. Actualiza la solicitud antes de continuar.');
    }
    this.notificarMantencionConfirmada(usuario.id);
    return resultado;
  },
  notificarMantencionConfirmada(usuarioId) {
    // Invalidación genérica de una decisión/creación confirmada; nunca otra escritura.
    // Refrescar la propia cola y avisar a otras sesiones son independientes.
    return Promise.allSettled([
      Promise.resolve().then(() => state.currentUser?.id === usuarioId ? window.AvisosSolicitudes?.sincronizar() : false),
      Promise.resolve().then(() => state.currentUser?.id === usuarioId ? window.SolicitudesSincronizacion?.emitirConfirmada() : false)
    ]);
  },
  normalizarConfirmacion(valor) {
    return String(valor ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  },
  eliminacionesEnCurso: new Set(),
  eliminacionesInciertas: new Set(),
  requiereConfirmacionTrabajo(r, historial) {
    const campos = ['asignada_en','iniciada_en','resuelta_en','cerrada_en','detalle_ejecucion','responsable_trabajador_id'];
    if (!['pendiente_asignacion','asignada','en_proceso','resuelta','cerrada'].includes(r.estado) ||
        campos.some(c => !Object.prototype.hasOwnProperty.call(r,c) || r[c] === undefined) || !Array.isArray(historial?.ciclos)) throw new Error('No se pudo comprobar el estado o los ciclos. Reconsulta antes de eliminar.');
    return ['asignada','en_proceso','resuelta','cerrada'].includes(r.estado) || campos.some(c => r[c] !== null) || historial.ciclos.length > 0;
  },
  async prepararEliminacion({ solicitudId, mantencionId, origen, usuarioId }) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(solicitudId || '') || !['solicitudes','reactiva'].includes(origen) ||
        (origen === 'reactiva' ? !uuid.test(mantencionId || '') : mantencionId !== null)) throw new Error('Identificadores u origen inválidos.');
    const comprobar = async () => {
      const usuario = await this.usuarioActual();
      if (usuario.id !== usuarioId) throw new Error('La sesión cambió. Cierra y vuelve a consultar.');
      if (!esAdminPermanenteActual()) throw new Error('Solo un Administrador permanente puede eliminar definitivamente.');
    };
    await comprobar();
    if (!await revalidarPrivilegioParaEscritura()) throw new Error('No tienes autorización administrativa vigente.');
    await comprobar();
    const solicitud = await this.obtener(solicitudId);
    if (solicitud.id !== solicitudId) throw new Error('La solicitud no está disponible.');
    let mantencion = null, reforzada = false;
    if (origen === 'solicitudes') {
      if (!['pendiente','rechazada'].includes(solicitud.estado)) throw new Error('La solicitud aprobada debe eliminarse desde su ficha en Mantención Reactiva.');
      if (await this.vinculo(solicitudId)) throw new Error('La solicitud tiene una mantención vinculada. Actualiza y verifica su estado.');
    } else {
      if (solicitud.estado !== 'aprobada') throw new Error('La solicitud no aprobada debe eliminarse desde Solicitudes.');
      mantencion = await window.MantencionesReactivasService.obtener(mantencionId);
      if (mantencion.id !== mantencionId || mantencion.solicitud_id !== solicitudId) throw new Error('La mantención no está disponible o no corresponde a la solicitud.');
      reforzada = this.requiereConfirmacionTrabajo(mantencion, await window.MantencionesReactivasService.historial(mantencion));
    }
    await comprobar();
    return { solicitud, mantencion, reforzada };
  },
  async eliminarDefinitiva(contexto, motivo, confirmacion, confirmarTrabajo) {
    const { solicitudId, mantencionId, origen } = contexto;
    const texto = String(motivo || '').trim();
    if (texto.length < 10 || texto.length > 1000) throw new Error('El motivo debe tener entre 10 y 1000 caracteres después de quitar espacios exteriores.');
    if (this.normalizarConfirmacion(confirmacion) !== 'ELIMINAR DEFINITIVAMENTE') throw new Error('Escribe ELIMINAR DEFINITIVAMENTE, sin palabras adicionales.');
    if (typeof confirmarTrabajo !== 'boolean') throw new Error('Confirmación reforzada inválida.');
    if (this.eliminacionesEnCurso.has(solicitudId) || this.eliminacionesInciertas.has(solicitudId)) throw new Error('Operación bloqueada. Actualiza y verifica el estado real antes de continuar.');
    this.eliminacionesEnCurso.add(solicitudId);
    let enviada = false;
    try {
      const actual = await this.prepararEliminacion(contexto);
      if (contexto.vigente && !contexto.vigente()) throw new Error('La vista o sesión cambió. Cierra y vuelve a consultar.');
      if (actual.reforzada && !confirmarTrabajo) throw new Error('Se requiere confirmación reforzada. Cierra y vuelve a abrir el diálogo para consultar su trabajo e historial.');
      enviada = true;
      const { data, error } = await window.supabaseClient.rpc('solicitud_reactiva_eliminar_definitiva', {
        p_solicitud_id: solicitudId, p_motivo: texto, p_origen: origen,
        p_confirmacion: 'ELIMINAR DEFINITIVAMENTE', p_confirmar_trabajo_realizado: actual.reforzada && confirmarTrabajo
      });
      if (error) throw error;
      const fila = Array.isArray(data) && data.length === 1 ? data[0] : null;
      if (!fila || fila.solicitud_eliminada !== solicitudId || fila.mantencion_eliminada !== (origen === 'reactiva' ? mantencionId : null)) throw new Error('Respuesta RPC incompleta o inconsistente.');
      return fila;
    } catch (error) {
      if (!enviada) throw error;
      this.eliminacionesInciertas.add(solicitudId);
      const incierto = new Error((error.message || 'Error de conexión o autorización.') + ' No se pudo confirmar la eliminación. Actualiza y verifica el estado real antes de intentar otra operación. No se reenviará automáticamente.');
      incierto.incierto = true;
      throw incierto;
    } finally { this.eliminacionesEnCurso.delete(solicitudId); }
  },
  validarDatos(datos) {
    const payload = {};
    for (const campo of ['tipo_problema', 'ubicacion', 'descripcion']) {
      payload[campo] = String(datos[campo] || '').trim();
      if (!payload[campo]) throw new Error('Completa tipo de problema, ubicación y descripción.');
    }
    if (!['baja', 'media', 'alta', 'critica'].includes(datos.urgencia)) throw new Error('Selecciona una urgencia válida.');
    payload.urgencia = datos.urgencia;
    payload.observaciones = String(datos.observaciones || '').trim() || null;
    return payload;
  },
  async crearAprobada(operacionId, datos) {
    const usuario = await this.usuarioActual();
    if (!esAdminOperativoActual() || !await revalidarPrivilegioParaEscritura() || !esAdminOperativoActual() || state.currentUser?.id !== usuario.id) throw new Error('No tienes autorización administrativa vigente.');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(operacionId || '')) throw new Error('No se pudo identificar la operación de registro.');
    const payload = this.validarDatos(datos);
    const { data, error } = await window.supabaseClient.rpc('solicitud_reactiva_crear_aprobada', {
      p_operacion_id: operacionId,
      p_tipo_problema: payload.tipo_problema,
      p_ubicacion: payload.ubicacion,
      p_descripcion: payload.descripcion,
      p_urgencia: payload.urgencia,
      p_observaciones: payload.observaciones
    });
    if (error) throw error;
    const fila = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data;
    if (!fila || fila.estado_solicitud !== 'aprobada' || !uuid.test(fila.solicitud_id || '') || !uuid.test(fila.mantencion_reactiva_id || '')) throw new Error('La respuesta del registro está incompleta. Reintenta la misma operación para comprobarla sin duplicarla.');
    this.notificarMantencionConfirmada(usuario.id);
    return fila;
  },
  async crear(datos) {
    await this.usuarioActual();
    if (state.currentUser.role !== 'RECEPCION') throw new Error('La creación de solicitudes está disponible para Recepción.');
    const payload = this.validarDatos(datos);
    const { error } = await window.supabaseClient.from('solicitudes_reactivas').insert(payload);
    if (error) throw error;
  }
};
