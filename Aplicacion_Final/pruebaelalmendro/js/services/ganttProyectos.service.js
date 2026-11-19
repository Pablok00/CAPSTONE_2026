// GANTT-2: contratos confirmados; sin escrituras directas a tablas.
window.GanttProyectosService = {
  async leer(id) {
    const {data,error}=await window.supabaseClient.rpc('gantt_proyecto_leer',{p_proyecto_id:id});
    if(error)throw error;
    if(!data||!data.carta||data.proyecto?.id!==id||!/^\d+$/.test(String(data.carta.version))||!Array.isArray(data.fases)||!Array.isArray(data.tareas)||data.tareas.some(t=>!t.registro?.id||t.registro.proyecto_id!==id||!Object.prototype.hasOwnProperty.call(t,'linea_base')||!Object.prototype.hasOwnProperty.call(t,'asignacion')))throw Error('Respuesta de carta incompleta o ajena al proyecto.');
    return data;
  },
  async guardar(datos,tipo,valores) {
    if(typeof esAdminPermanenteActual!=='function'||esAdminPermanenteActual()!==true)throw Error('Se requiere administrador permanente habilitado.');
    if(!datos?.carta||!datos.proyecto?.id||!/^\d+$/.test(String(datos.carta.version)))throw Error('Releer la carta antes de guardar.');
    const p={p_proyecto_id:datos.proyecto.id,p_version:datos.carta.version},v=valores;
    let nombre;
    if(tipo==='carta'){nombre='gantt_proyecto_guardar_carta';Object.assign(p,{p_titulo:v.titulo,p_descripcion:v.descripcion});}
    else if(tipo==='fase'){
      if(v.id&&!datos.fases.some(f=>f.id===v.id))throw Error('Fase ajena al proyecto.');
      nombre='gantt_proyecto_guardar_fase';Object.assign(p,{p_fase_id:v.id||null,p_nombre:v.nombre,p_descripcion:v.descripcion});
    }else if(tipo==='tarea'){
      if(!datos.fases.some(f=>f.id===v.faseId))throw Error('Selecciona una fase de esta carta.');
      if(v.id){const t=datos.tareas.find(t=>t.registro.id===v.id);if(!t||t.linea_base!==null)throw Error('Los registros históricos son de solo lectura.');}
      if(!String(v.titulo||'').trim())throw Error('El título es obligatorio.');
      if(v.progreso!==null&&(!Number.isFinite(v.progreso)||v.progreso<0||v.progreso>100))throw Error('El progreso debe estar entre 0 y 100.');
      if(v.inicio&&v.fin&&v.fin<v.inicio)throw Error('El vencimiento no puede ser anterior al inicio.');
      nombre='gantt_proyecto_guardar_tarea';Object.assign(p,{p_fase_id:v.faseId,p_tarea_id:v.id||null,p_titulo:v.titulo,p_descripcion:v.descripcion,p_responsable_texto:v.responsable,p_fecha_inicio:v.inicio,p_fecha_vencimiento:v.fin,p_progreso:v.progreso});
    }else if(tipo==='orden'){
      const fases=v.tipo==='FASES';if(!fases&&v.tipo!=='TAREAS')throw Error('Tipo de orden no válido.');
      if(!fases&&!datos.fases.some(f=>f.id===v.faseId))throw Error('Fase ajena al proyecto.');
      const tareas=datos.tareas.filter(t=>t.asignacion?.fase_id===v.faseId);
      if(!fases&&tareas.some(t=>t.linea_base!==null))throw Error('No se reordenan tareas históricas.');
      const ids=fases?datos.fases.map(f=>f.id):tareas.map(t=>t.registro.id);
      if(!Array.isArray(v.ids)||new Set(v.ids).size!==ids.length||v.ids.length!==ids.length||ids.some(id=>!v.ids.includes(id)))throw Error('El orden debe incluir todos los registros asociados.');
      nombre='gantt_proyecto_reordenar';Object.assign(p,{p_tipo:v.tipo,p_fase_id:fases?null:v.faseId,p_ids:v.ids});
    }else throw Error('Operación no válida.');
    const {data,error}=await window.supabaseClient.rpc(nombre,p);if(error)throw error;
    if(data?.ok===false)throw Error(data.message||'El servidor rechazó el guardado.');
    return data;
  }
};
