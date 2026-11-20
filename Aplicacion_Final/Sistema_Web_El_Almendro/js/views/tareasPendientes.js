function renderTareasPendientesView() {
  return `<section id="tareas-pendientes" class="alm-ui alm-main-page alm-module-page space-y-4 max-w-7xl mx-auto pb-10">
    ${uiEncabezadoSeccion('Gestión de Tareas', 'Trabajos pendientes y finalizados del hotel.', 'clipboard',
      '<button type="button" data-nueva class="alm-btn-primary px-4 py-2">+ Nueva tarea</button>')}
    <div class="flex flex-wrap gap-2" aria-label="Estado de las tareas">
      <button type="button" data-filtro="pendiente" class="px-4 py-2">Pendientes</button>
      <button type="button" data-filtro="completada" class="px-4 py-2">Completadas</button>
      <button type="button" data-filtro="calendario" class="px-4 py-2">Calendario</button>
    </div>
    <p role="status" data-mensaje></p>
    <section data-calendario hidden class="alm-panel p-4 space-y-3" aria-label="Calendario mensual">
      <div class="tareas-calendario-encabezado">
        <div class="tareas-calendario-periodo">
          <button type="button" data-anterior class="alm-btn-secondary px-3 py-2" aria-label="Mes anterior">←</button>
          <div class="tareas-calendario-selector">
            <h2 data-mes-titulo class="alm-title" aria-live="polite"></h2>
            <input type="month" data-mes min="0001-01" max="9999-12" aria-label="Ir a mes y año" title="Ir a mes y año">
          </div>
          <button type="button" data-siguiente class="alm-btn-secondary px-3 py-2" aria-label="Mes siguiente">→</button>
        </div>
        <button type="button" data-hoy class="alm-btn-secondary px-3 py-2">Ir a hoy</button>
      </div>
      <div data-dias class="tareas-calendario-grid"></div>
    </section>
    <div data-lista class="space-y-2"></div>
    <dialog class="alm-panel p-5" aria-labelledby="tareas-pendientes-dialogo-titulo">
      <form class="space-y-4">
        <h2 id="tareas-pendientes-dialogo-titulo" class="alm-title"></h2>
        <p data-advertencia hidden>Esta tarea se eliminará definitivamente y no se podrá recuperar.</p>
        <p data-nombre hidden class="break-words"></p>
        <fieldset class="space-y-3">
          <label class="block">Título<input name="titulo" required maxlength="160" class="block w-full mt-1 rounded-xl px-3 py-2" style="background:var(--alm-inset);color:var(--alm-text);border:1px solid var(--alm-border)"></label>
          <label class="block">Descripción<textarea name="descripcion" rows="3" maxlength="2000" class="block w-full mt-1 rounded-xl px-3 py-2" style="background:var(--alm-inset);color:var(--alm-text);border:1px solid var(--alm-border)"></textarea></label>
          <label class="block">Fecha límite (obligatoria)<input name="fecha_limite" type="date" required class="block w-full mt-1 rounded-xl px-3 py-2" style="background:var(--alm-inset);color:var(--alm-text);border:1px solid var(--alm-border)"></label>
        </fieldset>
        <p data-error role="status"></p>
        <div class="flex flex-wrap gap-2">
          <button type="button" data-cancelar class="alm-btn-secondary px-4 py-2">Cancelar</button>
          <button type="submit" class="alm-btn-primary px-4 py-2">Guardar</button>
        </div>
      </form>
      <section data-fecha-vencida hidden class="space-y-4">
        <h2 id="tareas-pendientes-fecha-titulo" class="alm-title">La fecha límite ya pasó</h2>
        <p data-fecha-mensaje></p>
        <div class="flex flex-wrap gap-2">
          <button type="button" data-volver-fecha class="alm-btn-secondary px-4 py-2">Volver a editar</button>
          <button type="button" data-confirmar-fecha class="alm-btn-primary px-4 py-2">Guardar de todas formas</button>
        </div>
      </section>
    </dialog>
  </section>`;
}

function ordenarTareasPendientes(tareas, estado) {
  return tareas.filter(tarea => tarea.estado === estado).sort((a, b) => {
    const porFecha = estado === 'pendiente'
      ? Number(!a.fecha_limite) - Number(!b.fecha_limite) ||
        (a.fecha_limite || '').localeCompare(b.fecha_limite || '')
      : Date.parse(b.completada_en) - Date.parse(a.completada_en);
    return porFecha || Date.parse(b.creada_en) - Date.parse(a.creada_en) || a.id.localeCompare(b.id);
  });
}

function tareasPendientesHoyLocal(ahora = new Date()) {
  return [ahora.getFullYear(), ahora.getMonth() + 1, ahora.getDate()]
    .map((parte, indice) => String(parte).padStart(indice === 0 ? 4 : 2, '0')).join('-');
}

function iniciarTareasPendientes() {
  const raiz = document.getElementById('tareas-pendientes');
  const servicio = window.TareasPendientesService;
  const lista = raiz.querySelector('[data-lista]');
  const calendario = raiz.querySelector('[data-calendario]');
  const mes = calendario.querySelector('[data-mes]');
  const dias = calendario.querySelector('[data-dias]');
  const mensaje = raiz.querySelector('[data-mensaje]');
  let errorLectura = false;
  const dialogo = raiz.querySelector('dialog');
  const formulario = dialogo.querySelector('form');
  const campos = formulario.querySelector('fieldset');
  const advertenciaFecha = dialogo.querySelector('[data-fecha-vencida]');
  const volverFecha = advertenciaFecha.querySelector('[data-volver-fecha]');
  const confirmarFecha = advertenciaFecha.querySelector('[data-confirmar-fecha]');
  const enviar = formulario.querySelector('[type="submit"]');
  const cancelar = formulario.querySelector('[data-cancelar]');
  const errorModal = formulario.querySelector('[data-error]');
  const actor = state.currentUser?.id;
  let tareas = [], filtro = 'pendiente', ocupada = false, cargando = false;
  let seleccion = null, borrando = false, guardadoPendiente = null;
  let edicionGuardada = false, confirmarDescarte = false;
  let dia = tareasPendientesHoyLocal(), limiteHistorial = 10;
  const formatoMes = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' });
  const formatoDia = new Intl.DateTimeFormat('es-CL', { dateStyle: 'full' });
  const fechaLocal = fecha => new Date(fecha + 'T12:00:00');
  const vigente = () => raiz.isConnected && actor === state.currentUser?.id && esAdminOperativoActual();
  const faltaFecha = 'Selecciona una fecha límite para continuar';
  const errorVisible = error => !vigente() || error?.code === '42501'
    ? 'Tu permiso administrativo ya no está vigente.'
    : error?.code === '23502' && /\bfecha_limite\b/.test(error.message || '') ? faltaFecha
    : 'No se pudo confirmar la operación. Comprueba la conexión y vuelve a consultar.';

  function cambiarMes(valor, salto = 0) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) return;
    const fecha = fechaLocal(valor + '-01');
    fecha.setMonth(fecha.getMonth() + salto);
    if (fecha.getFullYear() < 1 || fecha.getFullYear() > 9999) return;
    dia = tareasPendientesHoyLocal(fecha);
    pintar();
  }

  function pintarCalendario(pendientes, hoy, manana) {
    mes.value = dia.slice(0, 7);
    const inicio = fechaLocal(mes.value + '-01');
    const fin = new Date(inicio);
    fin.setMonth(fin.getMonth() + 1, 0);
    calendario.querySelector('[data-mes-titulo]').textContent = formatoMes.format(inicio);
    dias.replaceChildren();
    for (const nombre of ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']) {
      const etiqueta = document.createElement('span');
      etiqueta.className = 'alm-muted';
      etiqueta.textContent = nombre;
      dias.append(etiqueta);
    }
    const espacios = (inicio.getDay() + 6) % 7;
    for (let i = 0; i < espacios; i++) dias.append(document.createElement('span'));
    const cantidades = new Map();
    for (const tarea of pendientes) {
      const fecha = tarea.fecha_limite;
      if (fecha?.slice(0, 7) === mes.value) cantidades.set(fecha, (cantidades.get(fecha) || 0) + 1);
    }
    for (let numero = 1; numero <= fin.getDate(); numero++) {
      const fecha = mes.value + '-' + String(numero).padStart(2, '0');
      const cantidad = cantidades.get(fecha) || 0;
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'tareas-calendario-dia';
      boton.textContent = numero;
      boton.setAttribute('aria-pressed', String(fecha === dia));
      if (fecha === hoy) boton.setAttribute('aria-current', 'date');
      boton.setAttribute('aria-label', formatoDia.format(fechaLocal(fecha)) +
        ', ' + cantidad + (cantidad === 1 ? ' tarea pendiente' : ' tareas pendientes'));
      if (cantidad) {
        const indicador = document.createElement('span');
        indicador.className = 'tareas-calendario-cantidad ' +
          (fecha < hoy ? 'tarea-pendiente-vencida' : fecha <= manana ? 'tarea-pendiente-proxima' : '');
        indicador.textContent = cantidad;
        indicador.setAttribute('aria-hidden', 'true');
        boton.append(indicador);
      }
      boton.onclick = () => {
        dia = fecha;
        pintar();
        dias.children[6 + espacios + numero]?.focus();
      };
      dias.append(boton);
    }
  }

  function pintar() {
    for (const boton of raiz.querySelectorAll('[data-filtro]')) {
      const activo = boton.dataset.filtro === filtro;
      boton.classList.toggle('alm-btn-primary', activo);
      boton.classList.toggle('alm-btn-secondary', !activo);
      boton.setAttribute('aria-pressed', String(activo));
      const pendientes = boton.dataset.filtro === 'pendiente';
      const etiqueta = pendientes ? 'Pendientes' : boton.dataset.filtro === 'completada' ? 'Completadas' : 'Calendario';
      const cantidad = tareas.filter(t => t.estado === boton.dataset.filtro).length;
      boton.textContent = !vigente() || cargando || errorLectura || boton.dataset.filtro === 'calendario' ? etiqueta : etiqueta + ' (' + cantidad + ')';
    }
    lista.replaceChildren();
    const mostrar = vigente() && !cargando && !errorLectura;
    const esCalendario = filtro === 'calendario';
    calendario.hidden = !mostrar || !esCalendario;
    if (!mostrar) return;
    const completadas = filtro === 'completada';
    const ordenadas = ordenarTareasPendientes(tareas, completadas ? 'completada' : 'pendiente');
    const visibles = completadas ? ordenadas.slice(0, limiteHistorial)
      : esCalendario ? ordenadas.filter(tarea => tarea.fecha_limite === dia) : ordenadas;
    const ahora = new Date();
    const hoy = tareasPendientesHoyLocal(ahora);
    ahora.setDate(ahora.getDate() + 1);
    const manana = tareasPendientesHoyLocal(ahora);
    if (esCalendario) {
      pintarCalendario(ordenadas, hoy, manana);
      const encabezado = document.createElement('h3');
      encabezado.className = 'alm-title';
      encabezado.textContent = formatDate(dia);
      lista.append(encabezado);
    }
    if (!visibles.length) {
      const vacio = document.createElement('p');
      vacio.className = 'alm-panel p-5 alm-muted';
      vacio.textContent = filtro === 'pendiente' ? 'No hay tareas pendientes.' : completadas ? 'Todavía no hay tareas completadas.' : 'No hay tareas pendientes para este día.';
      lista.append(vacio);
    }
    const grupoDe = tarea => !tarea.fecha_limite ? 'Sin fecha límite'
      : tarea.fecha_limite < hoy ? 'Atrasadas' : 'Con fecha límite';
    const cantidades = new Map();
    if (filtro === 'pendiente') {
      for (const tarea of visibles) {
        const grupo = grupoDe(tarea);
        cantidades.set(grupo, (cantidades.get(grupo) || 0) + 1);
      }
    }
    let grupoActual;
    let destino = lista;
    for (const tarea of visibles) {
      const fechaLimite = tarea.fecha_limite;
      const alerta = !completadas && fechaLimite && fechaLimite <= manana
        ? fechaLimite < hoy ? 'Vencida' : fechaLimite === hoy ? 'Vence hoy' : 'Vence mañana' : '';
      if (filtro === 'pendiente') {
        const grupo = grupoDe(tarea);
        if (grupo !== grupoActual) {
          const encabezado = document.createElement('h3');
          encabezado.className = 'text-sm font-bold alm-muted';
          encabezado.textContent = grupo + ' (' + cantidades.get(grupo) + ')';
          destino = document.createElement('section');
          destino.className = 'tareas-pendientes-grupo space-y-2';
          destino.append(encabezado);
          lista.append(destino);
          grupoActual = grupo;
        }
      }
      const tarjeta = document.createElement('article');
      tarjeta.className = 'alm-panel tarea-pendiente-fila';
      const contenido = document.createElement('div');
      contenido.className = 'min-w-0';
      const cabecera = document.createElement('div');
      cabecera.className = 'flex flex-wrap items-center gap-2';
      const titulo = document.createElement(filtro === 'pendiente' ? 'h4' : 'h3');
      titulo.className = 'font-bold break-words';
      titulo.textContent = tarea.titulo;
      cabecera.append(titulo);
      if (alerta) {
        const etiqueta = document.createElement('span');
        etiqueta.className = (alerta === 'Vencida' ? 'tarea-pendiente-vencida' : 'tarea-pendiente-proxima') + ' text-xs font-bold';
        const icono = document.createElement('span');
        icono.textContent = '⚠ ';
        icono.setAttribute('aria-hidden', 'true');
        etiqueta.textContent = alerta;
        etiqueta.prepend(icono);
        cabecera.append(etiqueta);
      }
      contenido.append(cabecera);
      if (tarea.descripcion) {
        const descripcion = document.createElement('p');
        descripcion.className = 'tarea-pendiente-descripcion text-sm whitespace-pre-wrap break-words';
        descripcion.textContent = tarea.descripcion;
        contenido.append(descripcion);
      }
      if ((fechaLimite && (alerta === 'Vencida' || !alerta)) || (!fechaLimite && !completadas)) {
        const fecha = document.createElement('p');
        fecha.className = 'text-sm alm-muted';
        if (!tarea.fecha_limite) fecha.textContent = 'Sin plazo definido';
        else fecha.textContent = 'Fecha límite: ' + formatDate(tarea.fecha_limite);
        contenido.append(fecha);
      }
      if (tarea.estado === 'completada' && tarea.completada_en) {
        const fecha = document.createElement('p');
        fecha.className = 'text-sm alm-muted';
        fecha.textContent = 'Finalizada el ' + formatearFechaCL(tarea.completada_en,{vacio:'Sin fecha registrada'});
        contenido.append(fecha);
      }
      const acciones = document.createElement('div');
      acciones.className = 'flex flex-wrap gap-2';
      function agregar(texto, clase, accion) {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = clase + ' px-3 py-2 text-sm';
        boton.textContent = texto;
        boton.disabled = ocupada;
        boton.onclick = accion;
        acciones.append(boton);
      }
      const pendiente = tarea.estado === 'pendiente';
      agregar(pendiente ? 'Completar' : 'Reabrir', 'alm-btn-primary', () =>
        operar(() => servicio.cambiarEstado(tarea.id, tarea.estado),
          pendiente ? 'Tarea completada.' : 'Tarea reabierta.'));
      agregar('Editar', 'alm-btn-secondary', () => abrir(tarea));
      if (esAdminPermanenteActual()) agregar('Eliminar', 'alm-btn-danger', () => abrir(tarea, true));
      tarjeta.append(contenido, acciones);
      destino.append(tarjeta);
    }
    if (completadas && limiteHistorial < ordenadas.length) {
      const anteriores = document.createElement('button');
      anteriores.type = 'button';
      anteriores.className = 'alm-btn-secondary px-4 py-2';
      anteriores.textContent = 'Ver anteriores';
      anteriores.onclick = () => {
        const primeraNueva = limiteHistorial;
        limiteHistorial += 10;
        pintar();
        const tarjeta = lista.children[primeraNueva];
        tarjeta.tabIndex = -1;
        tarjeta.focus();
      };
      lista.append(anteriores);
    }
  }

  async function cargar(aviso = '') {
    if (!vigente() || cargando) return;
    cargando = true;
    errorLectura = false;
    mensaje.textContent = 'Cargando tareas…';
    pintar();
    try {
      const datos = await servicio.listar();
      if (!vigente()) throw new Error('Sesión administrativa no vigente.');
      tareas = datos;
      mensaje.textContent = aviso;
    } catch (error) {
      if (!raiz.isConnected) return;
      tareas = [];
      errorLectura = true;
      mensaje.textContent = error?.code === '42501' || !vigente()
        ? 'Tu permiso administrativo ya no está vigente.'
        : 'No se pudieron cargar las tareas. Comprueba la conexión.';
      if (vigente()) {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'alm-btn-secondary px-3 py-2';
        boton.textContent = 'Reintentar carga';
        boton.onclick = () => cargar();
        mensaje.append(' ', boton);
      }
    } finally {
      cargando = false;
      pintar();
    }
  }

  function rellenarCampos(tarea) {
    formulario.elements.titulo.value = tarea?.titulo || '';
    formulario.elements.descripcion.value = tarea?.descripcion || '';
    formulario.elements.fecha_limite.value = tarea?.fecha_limite || '';
  }

  function tieneCambios() {
    return seleccion && !borrando && ['titulo', 'descripcion', 'fecha_limite'].some(campo =>
      formulario.elements[campo].value.trim() !== (seleccion[campo] || '').trim());
  }

  function actualizarSalida() {
    enviar.disabled = ocupada || Boolean(seleccion && !borrando && !tieneCambios());
    cancelar.textContent = confirmarDescarte ? 'Descartar cambios'
      : edicionGuardada && !tieneCambios() ? 'Cerrar' : 'Cancelar';
  }

  function abrir(tarea = null, eliminar = false) {
    if (!vigente() || ocupada || cargando || (eliminar && !esAdminPermanenteActual())) return;
    seleccion = tarea;
    borrando = eliminar;
    edicionGuardada = confirmarDescarte = false;
    formulario.reset();
    campos.hidden = campos.disabled = eliminar;
    formulario.querySelector('[data-advertencia]').hidden = !eliminar;
    const nombre = formulario.querySelector('[data-nombre]');
    nombre.hidden = !eliminar;
    nombre.textContent = tarea?.titulo || '';
    dialogo.querySelector('h2').textContent = eliminar ? 'Eliminar tarea' : tarea ? 'Editar tarea' : 'Nueva tarea';
    rellenarCampos(tarea);
    actualizarSalida();
    enviar.textContent = eliminar ? 'Eliminar' : tarea ? 'Guardar cambios' : 'Guardar';
    enviar.className = (eliminar ? 'alm-btn-danger' : 'alm-btn-primary') + ' px-4 py-2';
    errorModal.textContent = '';
    errorModal.className = '';
    if (tarea && !eliminar) dialogo.querySelector('h2').after(errorModal);
    else campos.after(errorModal);
    dialogo.showModal();
    (eliminar ? cancelar : formulario.elements.titulo).focus();
  }

  async function operar(accion, exito, eliminar = false, editar = false) {
    if (!vigente() || ocupada || cargando) return;
    ocupada = true;
    enviar.disabled = cancelar.disabled = campos.disabled = true;
    errorModal.className = '';
    errorModal.textContent = dialogo.open ? 'Procesando…' : '';
    if (!dialogo.open) mensaje.textContent = 'Procesando…';
    try {
      const fila = await accion();
      if (!vigente()) throw new Error('Sesión administrativa no vigente.');
      if (!fila) {
        if (dialogo.open && !editar) dialogo.close();
        await cargar('La tarea cambió o ya no está disponible. Se actualizó el listado.');
        if (editar) {
          errorModal.className = 'rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800';
          errorModal.textContent = 'La tarea cambió o ya no está disponible. Tus cambios siguen en el formulario.';
        }
        return;
      }
      if (dialogo.open && !editar) dialogo.close();
      tareas = eliminar ? tareas.filter(t => t.id !== fila.id)
        : tareas.some(t => t.id === fila.id) ? tareas.map(t => t.id === fila.id ? fila : t)
        : [fila, ...tareas];
      if (editar) {
        seleccion = fila;
        rellenarCampos(fila);
        edicionGuardada = true;
        actualizarSalida();
        errorModal.className = 'rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800';
        errorModal.textContent = '✓ Cambios guardados correctamente.';
      } else mensaje.textContent = exito;
    } catch (error) {
      if (raiz.isConnected) {
        const texto = errorVisible(error);
        if (editar) errorModal.className = 'rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800';
        (dialogo.open ? errorModal : mensaje).textContent = editar && vigente() && error?.code !== '42501' && texto !== faltaFecha
          ? 'No se pudieron guardar los cambios. Inténtalo nuevamente.' : texto;
      }
    } finally {
      ocupada = false;
      cancelar.disabled = false;
      actualizarSalida();
      campos.disabled = borrando;
      if (raiz.isConnected) pintar();
    }
  }

  function guardarTarea(id, datos) {
    if (id && !tieneCambios()) return;
    confirmarDescarte = false;
    actualizarSalida();
    return operar(() => servicio.guardar(id, datos),
      'Tarea guardada.', false, Boolean(id));
  }

  function mostrarAdvertenciaFecha(mostrar) {
    formulario.hidden = mostrar;
    advertenciaFecha.hidden = !mostrar;
    dialogo.setAttribute('aria-labelledby', mostrar
      ? 'tareas-pendientes-fecha-titulo' : 'tareas-pendientes-dialogo-titulo');
  }

  volverFecha.onclick = () => {
    guardadoPendiente = null;
    mostrarAdvertenciaFecha(false);
    formulario.elements.fecha_limite.focus();
  };
  confirmarFecha.onclick = () => {
    if (!guardadoPendiente || ocupada || !dialogo.open) return;
    const { id, datos } = guardadoPendiente;
    guardadoPendiente = null;
    mostrarAdvertenciaFecha(false);
    errorModal.tabIndex = -1;
    errorModal.focus();
    guardarTarea(id, datos);
  };

  dialogo.addEventListener('cancel', event => event.preventDefault());
  formulario.oninput = () => {
    confirmarDescarte = false;
    actualizarSalida();
    errorModal.className = '';
    errorModal.textContent = '';
  };
  cancelar.onclick = () => {
    if (ocupada) return;
    if (tieneCambios() && !confirmarDescarte) {
      confirmarDescarte = true;
      actualizarSalida();
      errorModal.textContent = 'Hay cambios sin guardar. Puedes guardarlos o pulsar Descartar cambios.';
      return;
    }
    dialogo.close();
  };
  formulario.elements.fecha_limite.oninvalid = () => {
    if (formulario.elements.fecha_limite.validity.valueMissing) errorModal.textContent = faltaFecha;
  };
  formulario.onsubmit = event => {
    event.preventDefault();
    if (!dialogo.open || ocupada || guardadoPendiente) return;
    if (borrando) {
      operar(() => servicio.eliminar(seleccion.id), 'Tarea eliminada.', true);
      return;
    }
    const { titulo, descripcion, fecha_limite } = formulario.elements;
    if (!titulo.value.trim()) {
      errorModal.textContent = 'Escribe un título para la tarea.';
      titulo.focus();
      return;
    }
    if (!fecha_limite.value) {
      errorModal.textContent = faltaFecha;
      fecha_limite.focus();
      return;
    }
    if (seleccion && !tieneCambios()) return;
    const datos = {
      titulo: titulo.value, descripcion: descripcion.value, fecha_limite: fecha_limite.value
    };
    const fechaAnterior = seleccion?.fecha_limite || '';
    if (datos.fecha_limite && datos.fecha_limite < tareasPendientesHoyLocal() &&
        datos.fecha_limite !== fechaAnterior) {
      guardadoPendiente = { id: seleccion?.id, datos };
      const fecha = formatDate(datos.fecha_limite);
      advertenciaFecha.querySelector('[data-fecha-mensaje]').textContent =
        'La fecha seleccionada, ' + fecha + ', es anterior a la fecha actual. ¿Deseas guardar esta tarea con una fecha límite vencida?';
      mostrarAdvertenciaFecha(true);
      volverFecha.focus();
      return;
    }
    guardarTarea(seleccion?.id, datos);
  };
  raiz.querySelector('[data-nueva]').onclick = () => abrir();
  mes.onchange = () => cambiarMes(mes.value);
  calendario.querySelector('[data-anterior]').onclick = () => cambiarMes(mes.value, -1);
  calendario.querySelector('[data-siguiente]').onclick = () => cambiarMes(mes.value, 1);
  calendario.querySelector('[data-hoy]').onclick = () => {
    dia = tareasPendientesHoyLocal();
    pintar();
  };
  for (const boton of raiz.querySelectorAll('[data-filtro]')) boton.onclick = () => {
    filtro = boton.dataset.filtro;
    pintar();
  };
  cargar();
}
