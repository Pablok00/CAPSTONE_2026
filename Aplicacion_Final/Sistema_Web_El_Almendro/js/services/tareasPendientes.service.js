window.TareasPendientesService = {
  columnas: 'id,titulo,descripcion,fecha_limite,estado,creada_en,completada_en,equipo_id',
  // Solo conserva la lectura que usa el calendario existente de Máquinas.
  async listarDeMaquinas(equipos) {
    if (window.GestionTareas?.habilitada) throw Error('La ruta anterior de tareas está cerrada.');
    if (!esAdminOperativoActual()) throw new Error('Tu permiso administrativo ya no está vigente.');
    const ids = [...new Set(equipos)];
    const tareas = [];
    const porPagina = 200;
    if (!ids.length) return tareas;
    for (let inicio = 0; ; inicio += porPagina) {
      const { data, error } = await window.supabaseClient.from('tareas_pendientes').select(this.columnas)
        .in('equipo_id', ids).order('fecha_limite').order('id')
        .range(inicio, inicio + porPagina - 1);
      if (error) throw error;
      tareas.push(...data);
      if (data.length < porPagina) return tareas;
    }
  }
};
