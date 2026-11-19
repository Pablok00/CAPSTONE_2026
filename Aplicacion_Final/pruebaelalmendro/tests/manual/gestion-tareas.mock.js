(() => {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ||
      !['http:', 'https:'].includes(location.protocol)) return;

  // Vista de prueba autónoma. Datos en memoria y CSP con connect-src 'none'.
  // No carga el cliente ni el servicio productivos.
  const app = document.getElementById('vista-local-app');
  const aviso = document.getElementById('vista-local-aviso');
  const actor = 'preview-admin';
  const trabajadores = [
    { id: 'demo-1', nombre: 'Administradora de muestra', cargo: 'Administración', estado: 'Activo' },
    { id: 'demo-2', nombre: 'Trabajador sin cuenta', cargo: 'Mantención', estado: 'Activo' },
    { id: 'demo-3', nombre: 'Operaria de muestra', cargo: 'Servicios', estado: 'Activo' },
    { id: 'demo-4', nombre: 'Trabajador inactivo', estado: 'Inactivo' }
  ];
  const maquinas = [{ id: 'demo-equipo', nombre_original: 'Caldera de muestra' }];
  const tareas = [];
  const asignaciones = [];
  const historial = [];
  let falloLectura = false;
  let perderRespuesta = false;
  let recibo;
  const hoy = calendarioFechaCivilLocal();
  const error = (message, code) => Object.assign(new Error(message), { code });
  const copia = value => structuredClone(value);

  window.state = { currentUser: { id: actor, role: 'ADMINISTRADOR' } };
  window.esAdminOperativoActual = () => true;
  window.esAdminPermanenteActual = () => true;
  window.uiEncabezadoSeccion = (titulo, descripcion, icono, acciones) => `
    <header class="alm-panel p-4 flex flex-wrap gap-3 items-center justify-between">
      <div><h1 class="alm-title text-xl">${titulo}</h1><p class="alm-muted">${descripcion}</p></div>
      ${acciones}
    </header>`;
  window.TrabajadoresService = {
    getTrabajadores: async () => copia(trabajadores),
    listarVinculosCuentas: async () => [{ id: actor, trabajador_id: 'demo-1', estado: true }]
  };
  window.MantencionesService = { getElementosMaquinas: async () => copia(maquinas) };

  function asignar(t, ids) {
    for (const id of ids) {
      asignaciones.push({
        id: crypto.randomUUID(), tarea_id: t.id, trabajador_id: id,
        trabajador_nombre: trabajadores.find(w => w.id === id).nombre,
        estado: 'pendiente', progreso: 0, retirada_en: null
      });
    }
  }

  function guardar(op, args) {
    let t = tareas.find(x => x.id === args.p_tarea_id);
    if (op !== 'crear' && (!t || t.revision !== args.p_revision_esperada)) {
      throw error('TAREA_EDITAR_REVISION_DESACTUALIZADA', '40001');
    }
    const anteriores = asignaciones.filter(a => a.tarea_id === t?.id);
    const antes = { tarea: copia(t), asignaciones: copia(anteriores) };
    if (op === 'crear') {
      t = { id: crypto.randomUUID(), revision: 0, estado: 'pendiente', creada_en: new Date().toISOString() };
      tareas.push(t);
      asignar(t, args.p_trabajador_ids);
    }
    if (op === 'crear' || op === 'editar') {
      Object.assign(t, { titulo: args.p_titulo, descripcion: args.p_descripcion,
        fecha_limite: args.p_fecha_limite, equipo_id: args.p_equipo_id });
    }
    const a = anteriores.find(x => x.id === args.p_asignacion_id);
    const fecha = new Date().toISOString();
    if (op === 'responsables') {
      if (args.p_accion === 'AVANCE') {
        a.progreso = args.p_progreso;
        a.estado = a.progreso === 100 ? 'completada' : a.progreso ? 'en_proceso' : 'pendiente';
      } else {
        for (const x of anteriores.filter(x => !x.retirada_en && args.p_retirar?.includes(x.trabajador_id))) {
          x.retirada_en = fecha;
        }
        asignar(t, args.p_incorporar);
      }
    }
    if (op === 'ciclo') {
      if (args.p_accion === 'REABRIR') Object.assign(a, { estado: 'pendiente', progreso: 0 });
      else a.retirada_en = fecha;
    }
    if (op === 'retirar') {
      t.retirada_en = fecha;
      t.retirada_por_nombre_snapshot = 'Administradora de muestra';
    } else {
      const vigentes = asignaciones.filter(x => x.tarea_id === t.id && !x.retirada_en);
      const completada = vigentes.length && vigentes.every(x => x.progreso === 100);
      t.estado = completada ? 'completada' : 'pendiente';
      t.completada_en = completada ? t.completada_en || fecha : null;
    }
    t.revision++;
    historial.push({
      tarea_id: t.id, revision: t.revision,
      accion: args.p_accion || (op === 'retirar' ? 'RETIRAR' : op.toUpperCase()),
      registrada_en: fecha, actor_nombre: 'Administradora de muestra', antes,
      despues: { tarea: copia(t), asignaciones: copia(asignaciones.filter(x => x.tarea_id === t.id)) }
    });
    return { tarea_id: t.id, revision: t.revision, solicitud_id: crypto.randomUUID(), reenvio: false };
  }

  async function pagina(vista, f = {}) {
    if (falloLectura) {
      falloLectura = false;
      throw new TypeError('Failed to fetch');
    }
    const visibles = new Set(tareas.filter(t => !t.retirada_en || f.p_tarea_id === t.id).map(t => t.id));
    const filas = vista === 'HISTORIAL'
      ? historial.filter(o => o.tarea_id === f.p_tarea_id).filter(o => f.p_cursor_revision == null ||
          o.revision < f.p_cursor_revision).sort((a, b) => b.revision - a.revision)
      : (vista === 'ASIGNACIONES' ? asignaciones : tareas).filter(t =>
        visibles.has(t.tarea_id || t.id) &&
        (!f.p_tarea_id || (t.tarea_id || t.id) === f.p_tarea_id) &&
        (!f.p_equipo_id || t.equipo_id === f.p_equipo_id) &&
        (!f.p_desde || t.fecha_limite >= f.p_desde) && (!f.p_hasta || t.fecha_limite <= f.p_hasta) &&
        (!f.p_cursor_id || t.id > f.p_cursor_id)).sort((a, b) => a.id.localeCompare(b.id));
    const limite = f.p_limite || 10;
    const items = filas.slice(0, limite);
    return copia({ items, hay_mas: filas.length > limite,
      siguiente_cursor: filas.length > limite ? items.at(-1)[vista === 'HISTORIAL' ? 'revision' : 'id'] : null });
  }

  window.GestionTareas = {
    puede: () => true, contexto: () => ({ id: actor, admin: true }), comprobar() {},
    pagina, todas: async (vista, f) => (await pagina(vista, { ...f, p_limite: Infinity })).items,
    mes(fecha) {
      const [y, m] = fecha.split('-').map(Number);
      return { p_desde: fecha.slice(0, 7) + '-01',
        p_hasta: fecha.slice(0, 7) + '-' + new Date(y, m, 0).getDate() };
    },
    tienePendiente: () => Boolean(recibo),
    async mutar(op, args) {
      if (recibo) throw Error('Reintenta primero la operación pendiente.');
      const resultado = guardar(op, args);
      if (perderRespuesta) {
        perderRespuesta = false;
        recibo = resultado;
        aviso.textContent = 'Respuesta perdida en la simulación. Usa el reenvío para recuperar la misma tarea.';
        throw new TypeError('Failed to fetch');
      }
      return resultado;
    },
    async reintentar() {
      if (!recibo) throw Error('No hay una operación pendiente.');
      const resultado = { ...recibo, reenvio: true };
      recibo = null;
      aviso.textContent = 'Reenvío simulado recuperado. Se conservó la misma tarea.';
      return resultado;
    }
  };

  guardar('crear', { p_titulo: 'Ordenar bodega de muestra', p_descripcion: 'Fixture de inspección visual.',
    p_fecha_limite: hoy, p_equipo_id: null, p_trabajador_ids: ['demo-2'] });
  function montar() {
    app.innerHTML = renderGestionTareas();
    iniciarGestionTareas();
  }
  document.getElementById('vista-local-controles').hidden = false;
  document.getElementById('vista-local-fallo').onclick = () => {
    falloLectura = true;
    montar();
  };
  document.getElementById('vista-local-incierta').onclick = () => {
    perderRespuesta = true;
    aviso.textContent = 'La próxima escritura simulada perderá su respuesta.';
  };
  aviso.textContent = 'Vista local con datos ficticios en memoria. Sin Supabase ni credenciales.';
  montar();
})();
