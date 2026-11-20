window.AvisosSolicitudesService = {
  async autorizado() {
    const { data, error } = await window.supabaseClient.auth.getUser();
    if (error) throw error;
    if (!data?.user || data.user.id !== state.currentUser?.id || esCuentaSinRol()) return false;
    const permisos = await window.UsuariosService.getMiEstadoAdministrativo(true);
    return permisos.es_admin_permanente === true || permisos.es_admin_temporal === true;
  },
  async listar() {
    const avisos = new Map();
    for (let offset = 0; ;) {
      const { data, error } = await window.supabaseClient.rpc('listar_avisos_solicitudes', { p_limite: 100, p_offset: offset });
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('La respuesta de avisos está incompleta.');
      data.forEach(aviso => {
        if (!aviso.solicitud_id || !Object.prototype.hasOwnProperty.call(aviso,'visto_en') || !Object.prototype.hasOwnProperty.call(aviso,'pospuesto_en')) throw new Error('El aviso recibido está incompleto.');
        if (aviso.estado_solicitud === 'pendiente' && aviso.visto_en === null) avisos.set(aviso.solicitud_id,aviso);
      });
      if (data.length < 100) break;
      offset += data.length;
    }
    return [...avisos.values()].sort((a,b) => (Date.parse(a.fecha_aviso) - Date.parse(b.fecha_aviso)) || String(a.solicitud_id).localeCompare(String(b.solicitud_id)));
  },
  async marcar(id, accion) {
    if (!['posponer','ver'].includes(accion)) throw new Error('La acción del aviso no es válida.');
    const { error } = await window.supabaseClient.rpc('marcar_aviso_solicitud', { p_solicitud_id:id, p_accion:accion });
    if (error) throw error;
  }
};

// Lectura personal independiente de las RPC de avisos administrativos.
window.NotificacionesRevisionService = {
  async listar() {
    const usuario = await window.SolicitudesService.usuarioActual();
    const filas = new Map();
    for (let desde = 0; ;) {
      const { data, count, error } = await window.supabaseClient.from('solicitudes_notificaciones_revision')
        .select('id,solicitud_id,destinatario_id,resultado,motivo,revisada_en,created_at,leida_en', { count:'exact' })
        .eq('destinatario_id',usuario.id).order('created_at',{ ascending:false }).order('id',{ ascending:false }).range(desde,desde + 199);
      if (error) throw error;
      if (!Array.isArray(data) || !Number.isInteger(count)) throw new Error('La respuesta de notificaciones personales está incompleta.');
      for (const fila of data) {
        if (fila.destinatario_id !== usuario.id || !fila.id || !fila.solicitud_id || !['aprobada','rechazada'].includes(fila.resultado) || !Object.prototype.hasOwnProperty.call(fila,'leida_en')) throw new Error('La notificación personal no es válida.');
        filas.set(fila.id,fila);
      }
      if (desde + data.length >= count) break;
      if (!data.length) throw new Error('Las notificaciones cambiaron durante la consulta. Vuelve a intentarlo.');
      desde += data.length;
    }
    const solicitudes = await window.SolicitudesService.resumenesPropios([...filas.values()].map(f => f.solicitud_id));
    return [...filas.values()].map(f => {
      const solicitud=solicitudes.get(f.solicitud_id)||null;
      const coincide=solicitud?.id===f.solicitud_id&&solicitud.estado===f.resultado&&Number.isFinite(Date.parse(f.revisada_en))&&Date.parse(solicitud.revisada_en)===Date.parse(f.revisada_en);
      const actor=coincide&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(solicitud.revisada_por||'')&&typeof solicitud.revisor_nombre_snapshot==='string'?solicitud.revisor_nombre_snapshot.trim():'';
      return {...f,solicitud,revisor_nombre_acreditado:actor||null};
    });
  },
  async marcar(id) {
    await window.SolicitudesService.usuarioActual();
    const { data, error } = await window.supabaseClient.rpc('marcar_notificacion_revision_leida', { p_notificacion_id:id });
    if (error) throw error;
    if (data !== true) throw new Error('No se confirmó la lectura de esta notificación.');
  }
};
