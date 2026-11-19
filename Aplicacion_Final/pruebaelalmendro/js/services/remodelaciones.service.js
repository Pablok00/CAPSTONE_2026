// js/services/remodelaciones.service.js

window.RemodelacionesService = {
  _proyectosCache: null,

  // Obtener proyectos (vista general)
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
      const { data: proyectos, error } = await window.supabaseClient
        .from('proyectos')
        .select('id, nombre, estado, es_historico, ubicacion_id, fecha_inicio, fecha_fin_estimada, responsable_texto, observaciones, ubicaciones(id, nombre)')
        .or('nombre.ilike.%remodelación%,nombre.ilike.%renovación%,nombre.ilike.%transformación%,nombre.ilike.%remodelacion%,nombre.ilike.%renovacion%,nombre.ilike.%transformacion%');

      if (error) throw error;
      if (!proyectos || proyectos.length === 0) return [];

      const projectIds = proyectos.map(p => p.id);

      const { data: presupuestos, error: errPresup } = await window.supabaseClient
        .from('presupuestos')
        .select('proyecto_id, tipo, total_con_iva, total_sin_iva')
        .in('proyecto_id', projectIds);

      if (errPresup) throw errPresup;

      // 1. Origen_registros e Importaciones para los proyectos
      const { data: origenes, error: errOrig } = await window.supabaseClient
        .from('origen_registros')
        .select('registro_id, importacion_id')
        .eq('tabla_destino', 'proyectos')
        .in('registro_id', projectIds);

      if (errOrig) throw errOrig;

      let importaciones = [];
      if (origenes && origenes.length > 0) {
        const importacionIds = [...new Set(origenes.map(o => o.importacion_id))];
        const { data: imps, error: errImps } = await window.supabaseClient
          .from('importaciones_excel')
          .select('id, archivo_origen, hoja_origen, total_con_iva, total_sin_iva, observaciones')
          .in('id', importacionIds);
        if (errImps) throw errImps;
        importaciones = imps;
      }

      return proyectos.map(p => {
        const pPresup = presupuestos.filter(pr => pr.proyecto_id === p.id);
        const presupuestoEstimado = pPresup.find(pr => pr.tipo === 'ESTIMADO');
        const presupuestoReal = pPresup.find(pr => pr.tipo === 'REAL');

        const budgetEstimado = presupuestoEstimado ? presupuestoEstimado.total_con_iva : null;
        const budgetReal = presupuestoReal ? presupuestoReal.total_con_iva : null;

        const pOrigenes = origenes ? origenes.filter(o => o.registro_id === p.id) : [];
        const pImportaciones = pOrigenes.map(o => importaciones.find(i => i.id === o.importacion_id)).filter(i => i);

        const ubicacionTexto = p.ubicaciones?.nombre || null;

        return {
          id: p.id,
          name: p.nombre,
          space: ubicacionTexto,
          status: p.estado,
          es_historico: p.es_historico,
          description: p.observaciones,
          budgetEstimado: budgetEstimado,
          budgetReal: budgetReal,
          presupuestosResumen: pPresup,
          importacionesResumen: pImportaciones
        };
      });

      return result;

    } catch (e) {
      console.error("Error completo Supabase en getProyectos:", e);
      throw e;
    }
  },

  // Obtener detalle de un proyecto
  async getDetalle(proyectoId) {
    try {
      // 1. Proyecto
      const { data: proyecto, error: errP } = await window.supabaseClient
        .from('proyectos')
        .select('id, nombre, estado, es_historico, observaciones, responsable_texto, fecha_inicio, fecha_fin_estimada, ubicacion_id, ubicaciones(id, nombre)')
        .eq('id', proyectoId)
        .single();
      
      if (errP) throw errP;

      // 2. Presupuestos
      const { data: presupuestos, error: errPr } = await window.supabaseClient
        .from('presupuestos')
        .select('id, proyecto_id, nombre_version, tipo, fecha_creacion, total_con_iva, total_sin_iva, observaciones, archivo_origen, hoja_origen')
        .eq('proyecto_id', proyectoId);
      
      if (errPr) throw errPr;

      // 3. Items de Presupuesto
      let items = [];
      const presupuestoIds = presupuestos.map(p => p.id);
      if (presupuestoIds.length > 0) {
        const { data: pItems, error: errI } = await window.supabaseClient
          .from('presupuesto_items')
          .select('id, presupuesto_id, proveedor_id, categoria, material_id, descripcion, cantidad, precio_unitario, costo_total, cantidad_original, observaciones')
          .in('presupuesto_id', presupuestoIds);
        if (errI) throw errI;
        items = pItems;
      }

      // 4. Gastos
      const { data: gastos, error: errG } = await window.supabaseClient
        .from('gastos')
        .select('id, proveedor_id, fecha, concepto, monto, observaciones, cantidad, cantidad_original, costo_unitario')
        .eq('proyecto_id', proyectoId);

      if (errG) throw errG;

      // 5. Proveedores
      const proveedorIds = [...new Set([...gastos.map(g => g.proveedor_id), ...items.map(i => i.proveedor_id)].filter(id => id))];
      let proveedores = [];
      if (proveedorIds.length > 0) {
        const { data: provData, error: errProv } = await window.supabaseClient
          .from('proveedores')
          .select('id, nombre_original, nombre_normalizado')
          .in('id', proveedorIds);
        if (!errProv && provData) proveedores = provData;
      }

      // 6. Tareas
      const { data: tareas, error: errT } = await window.supabaseClient
        .from('tareas')
        .select('id, titulo, descripcion, prioridad, estado, responsable_texto, fecha_inicio, fecha_vencimiento, fecha_finalizacion, frecuencia, hora_inicio, hora_fin, duracion_original, progreso, grupo_origen')
        .eq('proyecto_id', proyectoId);

      if (errT) throw errT;

      // 7. Origen Registros e Importaciones
      const { data: origenes, error: errOrig } = await window.supabaseClient
        .from('origen_registros')
        .select('registro_id, importacion_id')
        .eq('tabla_destino', 'proyectos')
        .eq('registro_id', proyectoId);

      if (errOrig) throw errOrig;

      let importaciones = [];
      if (origenes && origenes.length > 0) {
        const importacionIds = [...new Set(origenes.map(o => o.importacion_id))];
        const { data: imps, error: errImps } = await window.supabaseClient
          .from('importaciones_excel')
          .select('id, archivo_origen, hoja_origen, total_con_iva, total_sin_iva, observaciones')
          .in('id', importacionIds);
        if (errImps) throw errImps;
        importaciones = imps;
      }

      return {
        id: proyecto.id,
        name: proyecto.nombre,
        space: proyecto.ubicaciones?.nombre || null,
        status: proyecto.estado,
        es_historico: proyecto.es_historico,
        description: proyecto.observaciones,
        responsible: proyecto.responsable_texto,
        fechaInicio: proyecto.fecha_inicio,
        fechaFin: proyecto.fecha_fin_estimada,
        presupuestos: presupuestos,
        items: items,
        gastos: gastos,
        proveedores: proveedores,
        tareas: tareas,
        importaciones: importaciones
      };
      
    } catch (e) {
      console.error("Error completo Supabase en getDetalle:", e);
      throw e;
    }
  },

  async updateEstado(proyectoId, nuevoEstado) {
    const estadosPermitidos = ['Pendiente de inicio', 'En proceso', 'Pausado', 'Finalizado'];
    const estadoGuardar = nuevoEstado === 'Estado no definido' ? null : nuevoEstado;

    if (estadoGuardar !== null && !estadosPermitidos.includes(estadoGuardar)) {
      throw new Error("Estado no permitido.");
    }

    try {
      const { data, error } = await window.supabaseClient
        .from('proyectos')
        .update({ estado: estadoGuardar })
        .eq('id', proyectoId)
        .select('id, estado')
        .single();

      if (error) throw error;
      
      // Update cache
      if (this._proyectosCache) {
        const cachedProj = this._proyectosCache.find(p => p.id === proyectoId);
        if (cachedProj) {
          cachedProj.status = data.estado;
        }
      }

      return data;
    } catch (error) {
      console.error("Error completo al actualizar estado:", error);
      throw error;
    }
  },

  archivosComplementarios: [
    'EN BODEGA.xlsx',
    'Gastos StanD.xlsx',
    'INSUMOS -NUEVA BODEGA OESTE.xlsx',
    'INSUMOS JARDINERIA.xlsx',
    'PROVEEDORES REMODELACIONES.xlsx'
  ],

  async getRegistrosComplementarios() {
    try {
      const { data: importaciones, error } = await window.supabaseClient
        .from('importaciones_excel')
        .select('archivo_origen, hoja_origen, total_con_iva, total_sin_iva')
        .in('archivo_origen', this.archivosComplementarios);
      if (error) throw error;
      
      const agrupado = {};
      this.archivosComplementarios.forEach(arch => {
        agrupado[arch] = { archivo_origen: arch, importaciones: [] };
      });

      if (importaciones) {
        importaciones.forEach(imp => {
          if (agrupado[imp.archivo_origen]) {
            agrupado[imp.archivo_origen].importaciones.push(imp);
          }
        });
      }

      return Object.values(agrupado);
    } catch (e) {
      console.error("Error al obtener registros complementarios:", e);
      throw e;
    }
  },

  async getDetalleRegistroComplementario(archivoOrigen) {
    try {
      const { data: importaciones, error: errI } = await window.supabaseClient
        .from('importaciones_excel')
        .select('id, archivo_origen, hoja_origen, total_con_iva, total_sin_iva, observaciones')
        .eq('archivo_origen', archivoOrigen);
      if (errI) throw errI;

      const { data: gastos, error: errG } = await window.supabaseClient
        .from('gastos')
        .select('id, fecha, concepto, cantidad_original, cantidad, costo_unitario, monto, observaciones, proveedor_id')
        .eq('archivo_origen', archivoOrigen);
      if (errG) throw errG;

      const { data: movimientos, error: errM } = await window.supabaseClient
        .from('movimientos_inventario')
        .select('tipo_movimiento, producto_original, cantidad_original, cantidad, costo_unitario, costo_total, proveedor_original, hoja_origen, seccion_origen, categoria_origen, observaciones, valor_auxiliar_fuente')
        .eq('archivo_origen', archivoOrigen);
      if (errM) throw errM;

      const { data: proveedores, error: errP } = await window.supabaseClient
        .from('proveedores')
        .select('nombre_original, nombre_normalizado, rut, contacto, email, telefono, productos_ofrecidos, direccion, sitio_web, observaciones')
        .eq('archivo_origen', archivoOrigen);
      if (errP) throw errP;
      
      const provIds = [...new Set(gastos.map(g => g.proveedor_id).filter(id => id))];
      let provsGastos = [];
      if (provIds.length > 0) {
        const { data: provData } = await window.supabaseClient
          .from('proveedores')
          .select('id, nombre_original, nombre_normalizado')
          .in('id', provIds);
        if (provData) provsGastos = provData;
      }
      
      if (provsGastos.length > 0) {
        gastos.forEach(g => {
          if (g.proveedor_id) {
            const p = provsGastos.find(x => x.id === g.proveedor_id);
            if (p) g.proveedor_nombre = p.nombre_original ?? p.nombre_normalizado;
          }
        });
      }

      return {
        archivo_origen: archivoOrigen,
        importaciones: importaciones || [],
        gastos: gastos || [],
        movimientos: movimientos || [],
        proveedores: proveedores || []
      };
    } catch (e) {
      console.error("Error al obtener detalle de registro complementario:", e);
      throw e;
    }
  },

  async getTareasRemodelaciones() {
    try {
      const proyectos = await this.getProyectos();
      if (!proyectos || proyectos.length === 0) return [];
      
      const projectIds = proyectos.map(p => p.id);
      
      const { data, error } = await window.supabaseClient
        .from('tareas')
        .select(`
            id,
            proyecto_id,
            titulo,
            descripcion,
            prioridad,
            estado,
            responsable_texto,
            fecha_inicio,
            fecha_vencimiento,
            fecha_finalizacion,
            frecuencia,
            hora_inicio,
            hora_fin,
            duracion_original,
            progreso,
            grupo_origen
        `)
        .in('proyecto_id', projectIds);

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error("Error al obtener tareas de remodelaciones:", e);
      throw e;
    }
  }
};
