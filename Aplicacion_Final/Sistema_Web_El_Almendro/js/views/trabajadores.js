// ==========================================================
// VISTA: TRABAJADORES - HOTEL EL ALMENDRO
// ==========================================================

//
// Patrón: js/views/areas.js (loader #xxx-loader + #xxx-content
// oculto; setTimeout(async ...) carga datos y reemplaza).
//
// Personal y proyección mínima de cuentas: window.TrabajadoresService.
//   READ    -> getTrabajadores()
//   CREATE  -> createTrabajador()
//   UPDATE  -> updateTrabajador()
// NO se usan mocks (data/mockData.js), NO se usa
// localStorage. Los datos reales NO se copian a state ni a
// localStorage (Ley 21.719: minimización de datos personales).
//
// Tarjetas (preferencia del cliente, no listas). Por trabajador se
// muestra ÚNICAMENTE: nombre, estado y observaciones si existen.
// NO se muestran UUID, created_at ni updated_at en la tarjeta.
// Cargo opcional confirmado en UX-05.
// NO se inventan RUT, email, teléfono, foto, área ni
// documentos: esos campos no existen confirmados.
//
// C1A agrega:
//   - Botón "+ Nuevo Trabajador" (encabezado).
//   - Botón "Editar" en cada tarjeta.
//   - Formulario Crear / Editar con ÚNICAMENTE nombre, estado y
//     observaciones (las 3 únicas columnas editables reales).
//
// BAJA LÓGICA: NO hay DELETE físico. La service NO expone
// deleteTrabajador() y este archivo tampoco lo llama. Desactivar es
// un UPDATE de estado.
//
// MODAL: se construye de forma DINÁMICA y se inyecta una sola vez en
// <body> (patrón ya usado por js/views/mantenciones.js con su modal
// de subapartado). Así NO se toca index.html ni ningún otro módulo.
//
// FASE C1B-C: la sección "Documentos" de la ficha es REAL y usa
// EXCLUSIVAMENTE window.TrabajadoresDocumentosService (bucket
// privado documentos-trabajadores + public.trabajadores_documentos).
// Todas las acciones trabajan por docId; el storage_path NUNCA se
// muestra ni se toma del DOM. NO se usan mocks, localStorage ni
// getPublicUrl (sólo signed URL de 60 segundos).
// La autoridad de permisos sigue siendo RLS + Storage Policies del
// backend: lo que hace esta vista es UX, no autorización.

// Escape de salida HTML. El proyecto usa innerHTML con template
// literals; los datos reales de Supabase deben escaparse antes de
// inyectarse (prevención XSS).
function trabajadoresEscapeHTML(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ----------------------------------------------------------
// VOCABULARIO DE ESTADO
// La columna trabajadores.estado es TEXT NOT NULL (ver cabecera de
// js/services/trabajadores.service.js:12). NO es booleana.
// ESTÁNDAR DEL PROYECTO: "Activo" / "Inactivo" (con mayúscula inicial).
// Verificado en Supabase: trabajadores.estado es text NOT NULL, sin
// CHECK, y el valor real existente es "Activo".
// 'Activo' es el único estado que la tarjeta pinta como activo
// (trabajadoresTarjetaHTML).
// 'Inactivo' es la baja lógica: misma columna, sin DELETE.
// La lista es acotada y NO se libre: evita estados inventados.
// ----------------------------------------------------------
const TRABAJADOR_ESTADOS = [
  { valor: 'Activo', etiqueta: 'Activo' },
  { valor: 'Inactivo', etiqueta: 'Inactivo' }
];

function trabajadoresEstadoEsActivo(estado) {
  // Comparación EXACTA de mayúsculas/minúsculas según el estándar del
  // proyecto: debe coincidir con "Activo" tal cual. Sin toLowerCase().
  return String(estado || '').trim() === 'Activo';
}

// ----------------------------------------------------------
// Formateo de presentación compartido en state.js. Timestamps en America/Santiago;
// fechas civiles sin desplazamiento. No modifica datos ni inventa fechas ilegibles.
function trabajadoresFormatoFecha(valor) {
  return formatearFechaCL(valor,{hora:true,vacio:'Sin fecha registrada',invalida:String(valor)});
}

// ==========================================================
// CARGA DE LA VISTA
// ==========================================================
// Extraída a función propia para poder re-ejecutarla tras un
// CREATE/UPDATE con force = true (reconsulta real + re-render).
let trabajadoresMostrarEliminados = false;
let trabajadoresVistaDatos = [];
let trabajadoresCuentasVista = null;
let trabajadoresCuentasError = false;
let trabajadoresCargaVersion = 0;
const trabajadoresPuedeGestionar = () => typeof esAdminOperativoActual === 'function' && esAdminOperativoActual();
const trabajadorEstaEliminado = t => String(t?.estado || '').trim() === 'Eliminado';

function trabajadoresFiltrarEliminados(mostrar) {
  if (!trabajadoresPuedeGestionar()) return;
  trabajadoresMostrarEliminados = mostrar === true;
  const contenedor = document.getElementById('trabajadores-content');
  if (contenedor) contenedor.innerHTML = getTrabajadoresHTML(trabajadoresVistaDatos);
  contenedor?.querySelector('[data-trabajadores-eliminados]')?.focus();
}

function trabajadoresMensajeVinculo(error) {
  const codigo = String(error?.code || '');
  const detalle = String(error?.message || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (codigo === '42501' || /AUTORIZ|PERMIS|DELEGACION|ADMINISTRADOR/.test(detalle))
    return 'No tienes autorización administrativa vigente.';
  if (/ELIMINACION|ELIMINADO|PENDIENTE/.test(detalle))
    return 'Hay una eliminación pendiente o el registro ya no está disponible. Actualiza el listado.';
  if (/INACTIV|NO_ACTIV/.test(detalle)) return 'La ficha laboral debe estar activa.';
  if (/SOLICITUD.*(DUPLIC|REUTILIZ|CONFLICT)|IDEMPOT|OPERACION.*DUPLIC/.test(detalle))
    return 'La solicitud ya se utilizó con otros datos. Revisa el vínculo actual antes de continuar.';
  if (codigo === '23505' || /VINCULAD|ASOCIAD|OCUPAD/.test(detalle))
    return 'La cuenta o ficha ya tiene un vínculo. Actualiza el listado antes de continuar.';
  if (detalle === 'VINCULO_MOTIVO_INVALIDO') return 'Escribe un motivo de 10 a 1000 caracteres.';
  if (detalle === 'VINCULO_DATOS_INVALIDOS') return 'Completa los datos del vínculo.';
  if (detalle === 'VINCULO_EN_CURSO') return 'Ya hay una operación en curso.';
  return 'No se pudo confirmar el vínculo. Si reintentas, conserva los mismos datos.';
}

function abrirGestionVinculoTrabajador(accion, id) {
  if (!trabajadoresPuedeGestionar() || document.getElementById('trabajadores-vinculo-dialog')) return;
  const cuenta = trabajadoresCuentasVista?.find(u => u.id === id);
  if (!cuenta || (accion === 'DESVINCULAR' ? !cuenta.trabajador_id :
      cuenta.trabajador_id || !['VINCULAR', 'CREAR_Y_VINCULAR'].includes(accion))) return;
  const contenedor = document.getElementById('trabajadores-content');
  if (!contenedor) return;
  const actor = state.currentUser?.id;
  const vigente = () => trabajadoresPuedeGestionar() && state.currentUser?.id === actor && contenedor.isConnected;
  const escapar = trabajadoresEscapeHTML;
  const crear = accion === 'CREAR_Y_VINCULAR';
  const desvincular = accion === 'DESVINCULAR';
  const ocupados = new Set(trabajadoresCuentasVista.map(u => u.trabajador_id).filter(Boolean));
  const elegibles = trabajadoresVistaDatos.filter(t => t.estado === 'Activo' && !ocupados.has(t.id));
  const titulo = crear ? 'Crear y vincular ficha' : desvincular ? 'Desvincular ficha' : 'Vincular ficha existente';
  const dialogo = document.createElement('dialog');
  dialogo.id = 'trabajadores-vinculo-dialog';
  dialogo.className = 'alm-panel alm-tarea-dialog fixed inset-0 m-auto overflow-y-auto rounded-2xl p-5';
  dialogo.style.width = 'min(32rem, calc(100% - 2rem))';
  dialogo.style.maxHeight = 'calc(100vh - 2rem)';
  dialogo.setAttribute('aria-labelledby', 'trabajadores-vinculo-titulo');
  dialogo.innerHTML = `<form class="space-y-4">
    <h2 id="trabajadores-vinculo-titulo" class="alm-title">${titulo}</h2>
    <p class="text-sm break-words">Cuenta: ${escapar(cuenta.nombre)}</p>
    ${desvincular ? `<p class="text-sm break-words">Ficha: ${escapar(cuenta.trabajador_nombre || 'Ficha vinculada')}</p>
      <p class="text-sm">La ficha, su documentación y su historial se conservan.</p>
      <label class="block"><input name="confirmar" type="checkbox" required> Confirmo la desvinculación.</label>`
      : crear ? `<label class="block">Nombre laboral real<input name="nombre" required class="block w-full rounded-xl border px-3 py-2"></label>
        <p class="text-sm alm-muted" data-coincidencia>Si ya existe una ficha de esta persona, revisa la opción Vincular ficha existente.</p>
        <label class="block">Cargo (opcional)<input name="cargo" class="block w-full rounded-xl border px-3 py-2"></label>
        <label class="block">Observaciones (opcional)<textarea name="observaciones" class="block w-full rounded-xl border px-3 py-2"></textarea></label>`
      : `<label class="block">Ficha laboral<select name="trabajador" required class="block w-full rounded-xl border px-3 py-2">
        <option value="">${elegibles.length ? 'Selecciona una ficha activa' : 'No hay fichas activas disponibles'}</option>
        ${elegibles.map(t => `<option value="${escapar(t.id)}">${escapar([t.nombre,t.cargo,t.id].filter(Boolean).join(' · '))}</option>`).join('')}
      </select></label>`}
    <label class="block">Motivo<textarea name="motivo" required minlength="10" maxlength="1000" class="block w-full rounded-xl border px-3 py-2"></textarea></label>
    <p role="status" data-vinculo-mensaje></p>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="alm-btn-secondary" data-cancelar>Cancelar</button>
      <button type="submit" class="alm-btn-primary" ${accion === 'VINCULAR' && !elegibles.length ? 'disabled' : ''}>${titulo}</button>
    </div>
  </form>`;
  contenedor.append(dialogo);
  const form = dialogo.querySelector('form');
  const mensaje = form.querySelector('[data-vinculo-mensaje]');
  const confirmar = form.querySelector('[type="submit"]');
  const cancelar = form.querySelector('[data-cancelar]');
  let ocupada = false;
  dialogo.addEventListener('cancel', event => event.preventDefault());
  dialogo.addEventListener('close', () => dialogo.remove(), { once: true });
  cancelar.onclick = () => { if (!ocupada) dialogo.close(); };
  if (crear) {
    const normal = valor => String(valor || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const aviso = form.querySelector('[data-coincidencia]');
    const inicial = aviso.textContent;
    form.elements.nombre.oninput = () => {
      const nombre = normal(form.elements.nombre.value);
      aviso.textContent = nombre && trabajadoresVistaDatos.some(t => normal(t.nombre) === nombre)
        ? 'Existe una ficha con un nombre similar. Cancela y revísala antes de crear otra.'
        : inicial;
    };
  }
  form.onsubmit = async event => {
    event.preventDefault();
    if (ocupada || !vigente() || !dialogo.open || !form.reportValidity()) return;
    const campos = form.elements;
    const trabajadorId = desvincular ? cuenta.trabajador_id : campos.trabajador?.value ?? null;
    if (accion === 'VINCULAR' && !elegibles.some(t => t.id === trabajadorId)) return;
    const datos = { accion, usuarioId: id, trabajadorId, motivo: campos.motivo.value,
      nombre: campos.nombre?.value, cargo: campos.cargo?.value, observaciones: campos.observaciones?.value };
    ocupada = true;
    confirmar.disabled = cancelar.disabled = true;
    mensaje.textContent = 'Guardando…';
    try {
      if (!await revalidarPrivilegioParaEscritura() || !vigente()) throw new Error('VINCULO_NO_AUTORIZADO');
      const resultado = await window.TrabajadoresService.gestionarVinculoCuenta(datos);
      if (!vigente()) return;
      dialogo.close();
      await cargarTrabajadoresEnVista(true, true);
      if (vigente()) mostrarAvisoTrabajador(resultado === 'YA_REGISTRADA'
        ? 'La operación ya estaba registrada. Se actualizó el listado.'
        : desvincular ? 'Ficha desvinculada.' : 'Ficha vinculada.');
    } catch (error) {
      if (vigente()) mensaje.textContent = trabajadoresMensajeVinculo(error);
    } finally {
      ocupada = false;
      confirmar.disabled = cancelar.disabled = false;
    }
  };
  dialogo.showModal();
}

function rolCuentaDocumental(cuenta) {
  return String(cuenta?.roles?.nombre || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function trabajadoresCuentasHTML() {
  if (!trabajadoresPuedeGestionar()) return '';
  if (trabajadoresCuentasError) return '<p class="text-sm alm-muted" role="alert">No se pudieron consultar las cuentas. No se muestra un listado parcial.</p>';
  const cuentas = (trabajadoresCuentasVista || []).filter(u => u.trabajador_id &&
    typeof u.nombre === 'string' && u.nombre.trim() && ['administrador','tecnico','recepcion'].includes(rolCuentaDocumental(u)));
  return `<div class="trabajadores-cuentas-grid">${cuentas.map(u => `
    <article class="alm-panel trabajador-cuenta-card">
      <div class="trabajador-cuenta-nombre"><h4 class="text-base font-extrabold">${trabajadoresEscapeHTML(u.nombre)}</h4>
        ${u.estado === true ? '<span data-cuenta-activa class="text-[10px] font-extrabold px-2.5 py-1 rounded-full border whitespace-nowrap flex-shrink-0 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">Activo</span>' : ''}</div>
      <p class="text-sm alm-muted">${trabajadoresEscapeHTML(u.roles?.nombre)}</p>
      <div class="trabajador-cuenta-accion">${['administrador', 'recepcion', 'tecnico'].includes(rolCuentaDocumental(u)) ? `<button type="button" class="alm-btn-secondary" onclick="abrirCuentaTrabajadorFicha('${trabajadoresEscapeHTML(u.id)}')">Ver ficha</button>` : ''}</div>
    </article>`).join('') || '<p class="text-sm alm-muted">No hay cuentas vinculadas.</p>'}</div>`;

}

// Solo presentación administrativa: las cuentas pendientes permanecen en Administración.
function trabajadoresAvisoVinculosHTML(trabajadores) {
  if (!trabajadoresPuedeGestionar() || trabajadoresCuentasError) return '';
  const cuentas = trabajadoresCuentasVista || [], ids = new Set(trabajadores.map(t => t.id));
  const sinFicha = cuentas.filter(u => !u.trabajador_id && ['tecnico','recepcion'].includes(rolCuentaDocumental(u)));
  const administrativas = cuentas.filter(u => !u.trabajador_id && rolCuentaDocumental(u) === 'administrador');
  const referencias = new Set();
  let inconsistente = false;
  for (const cuenta of cuentas) {
    if (!cuenta.trabajador_id) continue;
    if (!ids.has(cuenta.trabajador_id) || referencias.has(cuenta.trabajador_id) || !cuenta.roles?.nombre || !cuenta.nombre?.trim()) inconsistente = true;
    referencias.add(cuenta.trabajador_id);
  }
  return (sinFicha.length || inconsistente ? '<p class="text-sm alm-muted" role="alert">Hay cuentas aprobadas sin ficha laboral o vínculos que requieren revisión. Comprueba la identidad y el vínculo por UUID en Administración; no se asociarán personas automáticamente.</p>' : '') +
    (administrativas.length ? '<p class="text-sm alm-muted" role="status">Hay cuentas administrativas sin ficha laboral. Revisa en Administración si corresponde conservarlas sin vínculo; no se crearán fichas automáticamente.</p>' : '');
}

async function cargarTrabajadoresEnVista(force = true, recargarCuentas = false) {
  const loader = document.getElementById('trabajadores-loader');
  const container = document.getElementById('trabajadores-content');
  if (!container) return;
  const version = ++trabajadoresCargaVersion;
  const actor = state.currentUser?.id;
  if (!trabajadoresPuedeGestionar()) {
    container.innerHTML = '<p role="alert">No tienes autorización administrativa vigente.</p>';
    if (loader) loader.classList.add('hidden');
    container.classList.remove('hidden');
    return;
  }

  let trabajadores = null;

  try {
    if (!window.TrabajadoresService) {
      throw new Error('TrabajadoresService no está disponible.');
    }
    trabajadores = await window.TrabajadoresService.getTrabajadores(force);
    if ((force || recargarCuentas || (trabajadoresCuentasVista === null && !trabajadoresCuentasError)) && trabajadoresPuedeGestionar()) {
      try {
        const cuentas = await window.TrabajadoresService.listarVinculosCuentas();
        if (version === trabajadoresCargaVersion) {
          trabajadoresCuentasVista = cuentas;
          trabajadoresCuentasError = false;
        }
      } catch (_) {
        if (version === trabajadoresCargaVersion) {
          trabajadoresCuentasVista = null;
          trabajadoresCuentasError = true;
        }
      }
    }
  } catch (e) {
    if (version !== trabajadoresCargaVersion || document.getElementById('trabajadores-content') !== container) return;
    // Error real de Supabase/permisos: se muestra y se propaga.
    // NUNCA fallback a mocks ni a localStorage.
    console.error('Error cargando trabajadores desde Supabase:', e);
    container.innerHTML = trabajadoresErrorHTML();
    if (loader) loader.classList.add('hidden');
    container.classList.remove('hidden');
    return;
  }

  if (version !== trabajadoresCargaVersion || document.getElementById('trabajadores-content') !== container || state.currentUser?.id !== actor || !trabajadoresPuedeGestionar()) return;
  trabajadoresVistaDatos = trabajadores || [];
  container.innerHTML = getTrabajadoresHTML(trabajadoresVistaDatos);
  if (loader) loader.classList.add('hidden');
  container.classList.remove('hidden');
}

function renderTrabajadoresView() {
  ++trabajadoresCargaVersion;
  trabajadoresMostrarEliminados = false;
  trabajadoresCuentasVista = null;
  trabajadoresCuentasError = false;
  setTimeout(() => {
    cargarTrabajadoresEnVista(true);
  }, 0);

  return `
    ${uiCargandoHTML("trabajadores-loader")}
    <div id="trabajadores-content" class="hidden w-full"></div>
  `;
}

// Contenido principal: encabezado + cuadrícula de tarjetas o vacío.
function getTrabajadoresHTML(trabajadores) {
  const vinculados = new Set((trabajadoresCuentasVista || []).map(u => u.trabajador_id).filter(Boolean));
  const sinCuenta = trabajadores.filter(t => !vinculados.has(t.id));
  const visibles = sinCuenta.filter(t => !trabajadorEstaEliminado(t) || trabajadoresMostrarEliminados)
    .sort((a, b) => Number(trabajadorEstaEliminado(a)) - Number(trabajadorEstaEliminado(b)));
  const total = visibles.length;

  const cuerpo = trabajadoresCuentasError
    ? '<p class="text-sm alm-muted" role="alert">No se pudieron verificar los vínculos laborales.</p>'
    : total === 0
    ? trabajadoresVacioHTML(sinCuenta.length > 0)
    : trabajadoresTarjetasHTML(visibles);

  return `
    <div class="alm-ui alm-main-page alm-module-page alm-workers space-y-6 max-w-7xl mx-auto pb-12">

      ${uiEncabezadoSeccion('Trabajadores','Cuentas de acceso y fichas laborales del Hotel El Almendro.','users',
        trabajadoresPuedeGestionar() ? `<button type="button" data-nuevo-trabajador class="alm-btn-primary" onclick="abrirTrabajadorFormulario('nuevo')">+ Nuevo trabajador</button>` : '')}

      <section aria-labelledby="trabajadores-cuentas-titulo" class="alm-panel rounded-3xl border border-slate-200 dark:border-slate-800 p-5 space-y-6">
        <header class="pb-4 border-b border-slate-200 dark:border-slate-800">
          <h3 id="trabajadores-cuentas-titulo" class="text-base font-extrabold text-slate-800 dark:text-white">Personal con cuenta</h3>
        </header>
        ${trabajadoresCuentasHTML()}
      </section>
      ${trabajadoresAvisoVinculosHTML(trabajadores)}
      <section aria-labelledby="trabajadores-personal-titulo" class="alm-panel rounded-3xl border border-slate-200 dark:border-slate-800 p-5 space-y-6" style="margin-top:2rem">
        <header class="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div><h3 id="trabajadores-personal-titulo" class="text-base font-extrabold text-slate-800 dark:text-white">Personal registrado sin cuenta</h3>
            <p class="text-sm alm-muted mt-2">Fichas laborales sin vínculo con ninguna cuenta del sistema.</p></div>
          ${trabajadoresPuedeGestionar() ? `<label class="flex items-center gap-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2"><input type="checkbox" data-trabajadores-eliminados onchange="trabajadoresFiltrarEliminados(this.checked)" ${trabajadoresMostrarEliminados ? 'checked' : ''}> Mostrar eliminados</label>` : ''}
        </header>
        ${cuerpo}
      </section>

    </div>
  `;
}

// Cuadrícula de tarjetas: una por trabajador.
function trabajadoresTarjetasHTML(trabajadores) {
  return `
    <div class="alm-record-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      ${trabajadores.map(t => trabajadoresTarjetaHTML(t)).join('')}
    </div>
  `;
}

function trabajadoresTarjetaHTML(t) {
  // Estado: la lista de valores es acotada (TRABAJADOR_ESTADOS).
  // Solo 'Activo' recibe color; cualquier otro estado se muestra
  // neutro, sin inventar significados.
  const estadoTexto = (t && t.estado !== null && t.estado !== undefined) ? String(t.estado) : '';
  const esActivo = trabajadoresEstadoEsActivo(estadoTexto);
  const estadoClase = esActivo
    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';

  const cargo = String(t?.cargo ?? '').trim();

  // Observaciones: solo se muestran si existen (NULL no se convierte
  // en texto inventado; la UI decide presentar o no).
  const obs = (t && t.observaciones !== null && t.observaciones !== undefined && String(t.observaciones).trim() !== '')
    ? String(t.observaciones).trim()
    : null;

  return `
    <div onclick="abrirTrabajadorFicha('${trabajadoresEscapeHTML(t.id)}')"
      class="alm-worker-card bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col cursor-pointer">
      <div class="p-5 flex-1 flex flex-col justify-between">
        <div>
          <div class="flex items-start justify-between gap-3 mb-2">
            <h4 class="text-base font-extrabold text-slate-800 dark:text-white leading-snug">
              ${trabajadoresEscapeHTML(t.nombre)}
            </h4>
            <span class="text-[10px] font-extrabold px-2.5 py-1 rounded-full border whitespace-nowrap ${estadoClase}">
              ${trabajadoresEscapeHTML(estadoTexto || 'Sin estado')}
            </span>
          </div>

          ${cargo ? `<p class="text-sm font-semibold alm-muted break-words">Cargo: ${trabajadoresEscapeHTML(cargo)}</p>` : ''}
          ${obs ? `
            <div class="mt-2 space-y-1">
              <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Observaciones</p>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">${trabajadoresEscapeHTML(obs)}</p>
            </div>
          ` : ''}
        </div>

        <div class="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap justify-end gap-3">
          <!-- stopPropagation: el clic en Editar NO debe abrir la ficha
               (la tarjeta completa es clickeable). -->
          ${trabajadorEstaEliminado(t) || !trabajadoresPuedeGestionar() ? '' : `<button type="button"
            onclick="event.stopPropagation(); abrirTrabajadorFormulario('editar', '${trabajadoresEscapeHTML(t.id)}')"
            class="alm-btn-secondary">
            Editar
          </button>
          <button type="button" onclick="event.stopPropagation(); trabajadorCambiarEstado('${trabajadoresEscapeHTML(t.id)}', 'Eliminado')" class="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-rose-700 dark:text-rose-300">Eliminar</button>`}
        </div>
      </div>
    </div>
  `;
}

// Estado vacío: mensaje neutro. NO se crean ejemplos automáticos.
function trabajadoresVacioHTML(hayRegistrosOcultos = false) {
  return `
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-12 border border-slate-200 dark:border-slate-800 shadow-sm text-center">
      <span class="text-5xl block mb-3">👥</span>
      <p class="text-sm font-bold text-slate-600 dark:text-slate-300">${hayRegistrosOcultos ? 'No hay trabajadores en este listado. Activa Mostrar eliminados para consultar los registros conservados.' : 'No hay trabajadores registrados sin cuenta.'}</p>
    </div>
  `;
}

// Estado de error: mensaje visible. Sin mocks, sin localStorage.
function trabajadoresErrorHTML() {
  return `
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-12 border border-rose-200 dark:border-rose-900/60 shadow-sm text-center">
      <span class="text-5xl block mb-3">⚠️</span>
      <p class="text-sm font-bold text-rose-700 dark:text-rose-300">No se pudieron cargar los trabajadores.</p>
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Revisa la conexión con Supabase o los permisos de tu sesión.</p>
    </div>
  `;
}

// ==========================================================
// MODAL CREAR / EDITAR TRABAJADOR
// ==========================================================
// Se inyecta una sola vez en <body>. Reutiliza openModal() /
// closeModal() de js/modals.js y las clases visuales del proyecto
// (mismo patrón que modal-user-form en index.html).
// ==========================================================
const TRABAJADOR_MODAL_ID = 'modal-trabajador-form';
let trabajadorFormularioContexto = null;
let trabajadorFormularioGuardando = false;

function asegurarModalTrabajador() {
  if (document.getElementById(TRABAJADOR_MODAL_ID)) return;

  const envoltorio = document.createElement('div');
  envoltorio.innerHTML = trabajadorFormularioModalHTML();
  document.body.appendChild(envoltorio.firstElementChild);
}

function trabajadorFormularioModalHTML() {
  const opcionesEstado = TRABAJADOR_ESTADOS
    .map(e => `<option value="${trabajadoresEscapeHTML(e.valor)}">${trabajadoresEscapeHTML(e.etiqueta)}</option>`)
    .join('');

  return `
    <div id="${TRABAJADOR_MODAL_ID}" role="dialog" aria-modal="true" aria-labelledby="tform-modal-title" onclick="handleModalBackdropClick(event, '${TRABAJADOR_MODAL_ID}')"
      class="alm-ui alm-personnel-dialog hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto cursor-pointer">
      <div onclick="event.stopPropagation()"
        class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 cursor-default my-auto text-slate-800 dark:text-slate-100">

        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div class="flex items-center space-x-2.5">
            <span class="text-2xl">👥</span>
            <div>
              <h3 id="tform-modal-title" class="text-base font-bold text-slate-800 dark:text-white">Nuevo Trabajador</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">Hotel & Centro de Eventos El Almendro</p>
            </div>
          </div>
          <button type="button" onclick="cerrarTrabajadorFormulario()"
            class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold">&times;</button>
        </div>

        <form id="form-trabajador" onsubmit="handleTrabajadorFormSubmit(event)" class="mt-4 space-y-3.5">
          <input type="hidden" id="tform-id">

          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Nombre Completo *</label>
            <input type="text" id="tform-nombre" required
              placeholder="Ej: Manuel Pérez"
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>

          <div>
            <label for="tform-cargo" class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Cargo (opcional)</label>
            <input type="text" id="tform-cargo"
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>

          <div id="tform-estado-grupo" class="hidden">
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Estado *</label>
            <select id="tform-estado" required disabled
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500">
              ${opcionesEstado}
            </select>
            <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
              Cambiar el estado no elimina el trabajador ni su historial.
            </p>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Observaciones (opcional)</label>
            <textarea id="tform-observaciones" rows="3"
              placeholder="Información adicional del trabajador (opcional)"
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
          </div>

          <!-- Mensaje inline de error. NO se muestra éxito salvo que
               Supabase confirme la operación. -->
          <div id="tform-error"
            class="hidden rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
          </div>

          <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-2.5">
            <button type="button" onclick="cerrarTrabajadorFormulario()"
              class="alm-btn-secondary">
              Cancelar
            </button>
            <button type="submit" id="tform-submit"
              class="alm-btn-primary">
              <span id="tform-submit-label">Guardar</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  `;
}

function trabajadorCampoError(mensaje) {
  const caja = document.getElementById('tform-error');
  if (!caja) return;
  caja.textContent = mensaje || '';
  caja.classList.toggle('hidden', !mensaje);
}

function abrirTrabajadorFormulario(modo, id, contexto = null) {
  if (trabajadorFormularioGuardando) return;
  if (!trabajadoresPuedeGestionar()) return;
  trabajadorFormularioContexto = contexto;
  asegurarModalTrabajador();
  const form = document.getElementById('form-trabajador');
  if (form) form.dataset.modo = modo === 'editar' ? 'editar' : 'nuevo';

  const titulo = document.getElementById('tform-modal-title');
  const campoId = document.getElementById('tform-id');
  const campoNombre = document.getElementById('tform-nombre');
  const campoCargo = document.getElementById('tform-cargo');
  const campoEstado = document.getElementById('tform-estado');
  const campoObs = document.getElementById('tform-observaciones');
  const grupoEstado = document.getElementById('tform-estado-grupo');
  if (grupoEstado) grupoEstado.classList.toggle('hidden', modo !== 'editar');
  if (campoEstado) campoEstado.disabled = modo !== 'editar';

  trabajadorCampoError('');
  if (campoId) campoId.value = '';
  if (campoNombre) campoNombre.value = '';
  if (campoCargo) campoCargo.value = '';
  if (campoObs) campoObs.value = '';
  if (campoEstado) campoEstado.value = 'Activo';

  if (modo === 'editar') {
    if (!id) return;
    if (titulo) titulo.textContent = 'Editar Trabajador';

    // Rellena desde los datos YA CARGADOS en la vista. NO se consulta
    // de nuevo ni se toca localStorage: la lista en memoria es real.
    window.TrabajadoresService.getTrabajadores(true)
      .then(lista => {
        const t = (lista || []).find(x => x && x.id === id);
        if (!t) {
          trabajadorCampoError('No se encontró el trabajador solicitado.');
          return;
        }
        if (trabajadorEstaEliminado(t)) {
          trabajadorCampoError('Este trabajador está eliminado. Su ficha se conserva solo para consulta.');
          return;
        }
        if (campoId) campoId.value = t.id;
        if (campoNombre) campoNombre.value = t.nombre === null || t.nombre === undefined ? '' : String(t.nombre);
        if (campoCargo) campoCargo.value = t.cargo == null ? '' : String(t.cargo);
        if (campoObs) campoObs.value = t.observaciones === null || t.observaciones === undefined ? '' : String(t.observaciones);
        // Estado: si el registro trae un valor fuera de la lista
        // acotada, se muestra igual para no ocultar el dato real.
        if (campoEstado) {
          const estadoActual = String(t.estado || '').trim();
          const existe = TRABAJADOR_ESTADOS.some(e => e.valor === estadoActual);
          if (!existe && estadoActual !== '') {
            const extra = document.createElement('option');
            extra.value = estadoActual;
            extra.textContent = estadoActual;
            campoEstado.appendChild(extra);
          }
          campoEstado.value = estadoActual || TRABAJADOR_ESTADOS[0].valor;
        }
      })
      .catch(e => {
        console.error('Error cargando trabajador para editar:', e);
        trabajadorCampoError('No se pudo cargar el trabajador. Revisa la conexión o los permisos.');
      });
  } else {
    if (titulo) titulo.textContent = 'Nuevo Trabajador';
  }

  openModal(TRABAJADOR_MODAL_ID);
}

function cerrarTrabajadorFormulario() {
  if (trabajadorFormularioGuardando) return;
  const contexto = trabajadorFormularioContexto;
  trabajadorFormularioContexto = null;
  closeModal(TRABAJADOR_MODAL_ID);
  trabajadorCampoError('');
  if (contexto?.alCerrar) contexto.alCerrar();
}

function trabajadorBotonGuardando(ocupado) {
  const boton = document.getElementById('tform-submit');
  const etiqueta = document.getElementById('tform-submit-label');
  if (boton) boton.disabled = !!ocupado;
  if (etiqueta) etiqueta.textContent = ocupado ? 'Guardando...' : 'Guardar';
  const form = document.getElementById('form-trabajador');
  if (form) {
    form.querySelectorAll('input,textarea').forEach(campo => { campo.disabled = !!ocupado; });
    const estado = document.getElementById('tform-estado');
    if (estado) estado.disabled = !!ocupado || form.dataset.modo !== 'editar';
  }
}

async function handleTrabajadorFormSubmit(event) {
  if (event && event.preventDefault) event.preventDefault();
  if (trabajadorFormularioGuardando) return;
  if (!trabajadoresPuedeGestionar()) return;

  const campoId = document.getElementById('tform-id');
  const campoNombre = document.getElementById('tform-nombre');
  const campoCargo = document.getElementById('tform-cargo');
  const campoEstado = document.getElementById('tform-estado');
  const campoObs = document.getElementById('tform-observaciones');

  const id = campoId ? String(campoId.value || '').trim() : '';
  const nombre = campoNombre ? String(campoNombre.value || '').trim() : '';
  const cargo = campoCargo ? String(campoCargo.value || '').trim() || null : null;
  const editando = document.getElementById('form-trabajador')?.dataset.modo === 'editar' || !!id;
  const estado = editando ? (campoEstado ? String(campoEstado.value || '').trim() : '') : 'Activo';
  const observaciones = campoObs ? String(campoObs.value || '').trim() : '';

  trabajadorCampoError('');
  if (editando && !id) {
    trabajadorCampoError('Espera a que se cargue el trabajador antes de guardar.');
    return;
  }

  // Validación local mínima (la service también valida).
  if (!nombre) {
    trabajadorCampoError('El nombre es obligatorio.');
    return;
  }
  if (!estado) {
    trabajadorCampoError('El estado es obligatorio.');
    return;
  }
  if (editando && estado !== 'Activo' && trabajadoresCuentasVista?.some(u => u.trabajador_id === id)) {
    trabajadorCampoError('Primero desvincula la ficha de su cuenta para cambiarla a un estado no activo.');
    return;
  }
  if (!window.TrabajadoresService) {
    trabajadorCampoError('El servicio de trabajadores no está disponible.');
    return;
  }

  trabajadorFormularioGuardando = true;
  trabajadorBotonGuardando(true);

  try {
    if (trabajadorFormularioContexto && !await revalidarPrivilegioParaEscritura()) {
      throw new Error('No tienes autorización administrativa vigente.');
    }
    let resultado = null;

    if (id) {
      // UPDATE real (incluye la baja lógica cuando estado = 'Inactivo').
      resultado = await window.TrabajadoresService.updateTrabajador(id, {
        nombre,
        cargo,
        estado,
        observaciones
      });
    } else {
      // CREATE real.
      resultado = await window.TrabajadoresService.createTrabajador({
        nombre,
        cargo,
        estado,
        observaciones
      });
    }

    // Éxito SOLO aquí: significa que Supabase confirmó la operación
    // (la service relanza el error si falla).
    if (!resultado) {
      throw new Error('Supabase no devolvió el registro.');
    }

    const contexto = trabajadorFormularioContexto;
    trabajadorFormularioGuardando = false;
    trabajadorBotonGuardando(false);
    cerrarTrabajadorFormulario();
    if (contexto?.alGuardar) {
      await contexto.alGuardar(resultado);
      return;
    }

    // Invalidar caché y re-leer datos REALES antes de repintar.
    // La service ya limpia su caché interna en create/update; aquí se
    // fuerza la reconsulta para garantizar que la vista refleje
    // exactamente lo que quedó persistido en Supabase.
    await window.TrabajadoresService.getTrabajadores(true);
    await cargarTrabajadoresEnVista(true);

    mostrarAvisoTrabajador('✅ Trabajador guardado correctamente.');
  } catch (e) {
    trabajadorFormularioGuardando = false;
    trabajadorBotonGuardando(false);
    // Mensaje amigable. NO se expone UUID, SQL ni policies.
    trabajadorCampoError(mensajeErrorTrabajador(e));
  }
}

// Mensaje amigable a partir del error real. Sin inventar éxito y sin
// filtrar detalle interno del backend.
function mensajeErrorTrabajador(e) {
  const codigo = e && (e.code || (e.message || '').includes('duplicate')) ? String(e.code || '') : '';
  const texto = e && e.message ? String(e.message) : '';
  if (/VINCUL|ASOCI/i.test(texto) && /TRABAJADOR|FICHA|CUENTA/i.test(texto))
    return 'Primero desvincula la ficha de su cuenta para cambiarla a un estado no activo.';

  if (codigo === '42501' || /row-level security|permission denied/i.test(texto)) {
    return 'No tienes permisos para realizar esta operación. Contacta al administrador.';
  }
  if (codigo === '23505' || /duplicate key|unique constraint/i.test(texto)) {
    return 'Ya existe un registro con esos datos.';
  }
  if (codigo === '23502' || /null value|not-null/i.test(texto)) {
    return 'Faltan datos obligatorios.';
  }
  if (/Failed to fetch|NetworkError|fetch/i.test(texto)) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión.';
  }
  return 'No se pudo guardar el trabajador. Intenta nuevamente.';
}

// Aviso breve de éxito (toast). Se usa SOLO tras confirmación real.
function mostrarAvisoTrabajador(texto) {
  let toast = document.getElementById('trabajadores-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'trabajadores-toast';
    toast.className = 'fixed bottom-6 right-6 z-[100] px-4 py-3 rounded-2xl shadow-2xl text-xs font-bold bg-emerald-600 text-white transition-all';
    document.body.appendChild(toast);
  }
  toast.textContent = texto;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// ==========================================================
// FICHA DETALLADA DEL TRABAJADOR
// ==========================================================
// Se abre al hacer clic en la tarjeta. Muestra ÚNICAMENTE datos
// reales ya existentes en Supabase: nombre, estado, observaciones,
// created_at y updated_at. NO se inventan campos.
// NO usa mocks ni localStorage.
//
// Acciones:
//   - Editar      -> abre el formulario de edición existente.
//   - Desactivar  -> solo si estado === "Activo"  (estado = "Inactivo")
//   - Reactivar   -> solo si estado === "Inactivo" (estado = "Activo")
// Ambas exigen confirmación previa. NO hay DELETE físico.
// ==========================================================
const TRABAJADOR_FICHA_ID = 'modal-trabajador-ficha';
let trabajadorFichaVersion = 0;
let trabajadorFichaTrabajosContexto = null;
function trabajadorFichaPestanasHTML() {
  return `<div class="trabajador-ficha-tabs" role="tablist" aria-label="Contenido de la ficha" onkeydown="trabajadorFichaTecladoPestanas(event)">
    <button type="button" id="trabajador-tab-informacion" role="tab" aria-selected="true" aria-controls="trabajador-panel-informacion" onclick="trabajadorFichaCambiarPestana('informacion')">Información</button>
    <button type="button" id="trabajador-tab-trabajos" role="tab" aria-selected="false" tabindex="-1" aria-controls="trabajador-panel-trabajos" onclick="trabajadorFichaCambiarPestana('trabajos')">Mis trabajos</button>
  </div>`;
}
function trabajadorFichaTrabajosHTML() {
  return `<section id="trabajador-panel-trabajos" class="trabajador-ficha-panel" role="tabpanel" aria-labelledby="trabajador-tab-trabajos" hidden>
    <p class="trabajador-historial-leyenda" aria-label="Leyenda de estados">
      <span class="gestion-trabajo-estado gestion-trabajo-pendiente">Pendiente dentro de plazo</span>
      <span class="gestion-trabajo-estado gestion-trabajo-en-proceso">En proceso</span>
      <span class="gestion-trabajo-estado gestion-trabajo-completada">Completado</span>
      <span class="gestion-trabajo-estado gestion-trabajo-vencida">Vencido sin completar</span>
    </p>
    <details class="trabajador-historial" data-trabajador-historial>
      <summary>Ver historial laboral</summary>
      <div data-trabajador-trabajos><p class="text-sm alm-muted">Selecciona esta pestaña para consultar los trabajos disponibles.</p></div>
    </details>
  </section>`;
}
function trabajadorFichaPrepararPestanas(id, propia) {
  trabajadorFichaTrabajosContexto = { id, propia, version: trabajadorFichaVersion, actor: state.currentUser?.id, montado: false };
  trabajadorFichaCambiarPestana('informacion');
}
function trabajadorFichaCambiarPestana(nombre) {
  if (!['informacion', 'trabajos'].includes(nombre)) return;
  const root = document.getElementById('trabajador-ficha-contenido');
  if (!root) return;
  for (const tipo of ['informacion', 'trabajos']) {
    const tab = root.querySelector('#trabajador-tab-' + tipo);
    const panel = root.querySelector('#trabajador-panel-' + tipo);
    tab?.setAttribute('aria-selected', String(tipo === nombre));
    if (tab) tab.tabIndex = tipo === nombre ? 0 : -1;
    if (panel) panel.hidden = tipo !== nombre;
  }
  const c = trabajadorFichaTrabajosContexto;
  if (nombre !== 'trabajos' || !c || c.version !== trabajadorFichaVersion || c.actor !== state.currentUser?.id || c.montado) return;
  const host = root.querySelector('[data-trabajador-trabajos]');
  if (!host) return;
  c.montado = true;
  host.innerHTML = '';
  if (!c.id) host.textContent = 'Esta cuenta todavía no tiene una ficha laboral vinculada.';
  else if (!window.GestionTareas?.puede() || !esAdminOperativoActual()) host.textContent = 'No tienes autorización vigente para consultar estos trabajos.';
  else { c.items = []; c.pagina = 0; c.hayMas = true; c.cursores = new Set(); void trabajadorFichaCargarTrabajos(); }
}
function trabajadorFichaTecladoPestanas(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || event.target?.getAttribute('role') !== 'tab') return;
  event.preventDefault();
  const nombre = event.key === 'Home' ? 'informacion' : event.key === 'End' ? 'trabajos'
    : event.target.id === 'trabajador-tab-informacion' ? 'trabajos' : 'informacion';
  trabajadorFichaCambiarPestana(nombre);
  document.getElementById('trabajador-tab-' + nombre)?.focus();
}
function trabajadorFichaPintarTrabajos(c, host, error = '', direccion = 0) {
  const filas = c.items.slice(c.pagina * 4, c.pagina * 4 + 4);
  host.innerHTML = `<h4 class="alm-title">Trabajos asignados</h4>
    ${error ? `<p role="alert" class="text-sm">No fue posible consultar los trabajos. Comprueba la conexión y tus permisos.</p><button type="button" class="alm-btn-secondary" onclick="trabajadorFichaCargarTrabajos(${direccion})">Reintentar carga</button>` : ''}
    ${!filas.length && !error ? '<p class="text-sm alm-muted">Todavía no hay trabajos asignados</p>' : ''}
    <ul class="trabajador-trabajos-lista">${filas.map(a => {
      const [tono, etiqueta] = gestionIndicadorLaboral(a);
      return `<li class="alm-panel trabajador-trabajo-fila"><p class="font-semibold">${trabajadoresEscapeHTML(a.tarea.titulo)}</p>
        ${[a,a.tarea].some(f=>f.lectura_historica?.estado==='NO_DISPONIBLE')?'<p class="text-xs alm-muted" role="status">Etiquetas históricas no disponibles; se muestran los nombres originales.</p>':''}
        <p class="text-sm alm-muted">${trabajadoresEscapeHTML(a.tarea.fecha_limite ? formatDate(a.tarea.fecha_limite) : 'Sin fecha')} <span class="gestion-trabajo-estado gestion-trabajo-${tono}">${etiqueta}${a.retirada_en ? ' · Asignación retirada' : ''}</span></p>
        <p class="text-sm">Avance individual: ${trabajadoresEscapeHTML(a.progreso ?? 'Sin dato')}${a.progreso == null ? '' : ' %'}</p>
        ${a.tarea.retirada_en ? `<p class="text-sm alm-muted">Retiro de tarea: ${trabajadoresEscapeHTML(a.tarea.retirada_en)}${(window.UsuariosService?.nombreParaMostrar?.(a.tarea,'retirada_por_nombre_snapshot') ?? a.tarea.retirada_por_nombre_snapshot) ? ' · ' + trabajadoresEscapeHTML((window.UsuariosService?.nombreParaMostrar?.(a.tarea,'retirada_por_nombre_snapshot') ?? a.tarea.retirada_por_nombre_snapshot)) : ''}</p>` : ''}</li>`;
    }).join('')}</ul>
    ${c.items.length ? `<nav class="trabajador-trabajos-paginacion" aria-label="Páginas de trabajos">
      <button type="button" class="alm-btn-secondary" onclick="trabajadorFichaCargarTrabajos(-1)" ${c.pagina === 0 ? 'disabled' : ''}>Anterior</button>
      <span class="text-sm">Página ${c.pagina + 1}</span>
      <button type="button" class="alm-btn-secondary" onclick="trabajadorFichaCargarTrabajos(1)" ${!c.hayMas && (c.pagina + 1) * 4 >= c.items.length ? 'disabled' : ''}>Siguiente</button>
    </nav>` : ''}`;
}
async function trabajadorFichaCargarTrabajos(direccion = 0) {
  const c = trabajadorFichaTrabajosContexto;
  if (!c || c.cargando || !Array.isArray(c.items)) return;
  const vigente = () => c === trabajadorFichaTrabajosContexto && c.version === trabajadorFichaVersion &&
    c.actor === state.currentUser?.id && esAdminOperativoActual() && window.GestionTareas?.puede();
  if (!vigente()) return;
  const host = document.getElementById('trabajador-ficha-contenido')?.querySelector('[data-trabajador-trabajos]');
  if (!host) return;
  c.cargando = true;
  const pagina = Math.max(0, c.pagina + (direccion === 1 ? 1 : direccion === -1 ? -1 : 0));
  host.innerHTML = '<p class="text-sm alm-muted" role="status">Cargando trabajos…</p>';
  try {
    const servicio = window.GestionTareas, contexto = servicio.contexto();
    servicio.comprobar(contexto);
    let lecturas = 0;
    while (c.items.length < (pagina + 1) * 4 && c.hayMas) {
      if (++lecturas > 2) throw Error('Página incompleta');
      const r = await servicio.historialLaboral(c.id, c.cursor);
      if (!vigente()) return;
      servicio.comprobar(contexto);
      if (!r || !Array.isArray(r.items) || typeof r.hay_mas !== 'boolean' || r.items.some(a => !a.id || !a.tarea)) throw Error('Respuesta incompleta');
      if (r.hay_mas && (r.siguiente_cursor == null || c.cursores.has(String(r.siguiente_cursor)))) throw Error('Cursor no válido');
      const ids = new Set(c.items.map(a => a.id));
      c.items.push(...r.items.filter(a => { if (ids.has(a.id)) return false; ids.add(a.id); return true; }));
      r.enriquecimientoHistorico?.then(enriquecido=>{
        if(!vigente()||!host.isConnected)return;
        servicio.comprobar(contexto);
        const nuevas=new Map(enriquecido.items.map(a=>[a.id,a]));
        c.items=c.items.map(a=>nuevas.get(a.id)||a);
        if(!c.cargando)trabajadorFichaPintarTrabajos(c,host);
      }).catch(()=>{});
      c.hayMas = r.hay_mas; c.cursor = r.siguiente_cursor;
      if (r.hay_mas) c.cursores.add(String(r.siguiente_cursor));
    }
    if (pagina === 0 || pagina * 4 < c.items.length) c.pagina = pagina;
    if (vigente()) trabajadorFichaPintarTrabajos(c, host);
  } catch (_) {
    if (vigente()) trabajadorFichaPintarTrabajos(c, host, 'error', direccion);
  } finally { c.cargando = false; }
}
let cuentaDocumentalContexto = null;
const cuentaDocumentoUrls = new Map();

function cuentaDocumentalLimpiarLecturas() {
  cuentaDocumentalContexto = null;
  for (const [url,timer] of cuentaDocumentoUrls) { clearTimeout(timer); URL.revokeObjectURL(url); }
  cuentaDocumentoUrls.clear();
}

function cuentaTrabajadorFichaHTML(cuenta) {
  const permiteSubida = ['administrador', 'recepcion', 'tecnico'].includes(rolCuentaDocumental(cuenta)) && window.TrabajadoresService?.subidaDocumentosCuentaHabilitada === true;
  const disponibilidad = window.TrabajadoresService?.subidaDocumentosCuentaHabilitada === true
    ? 'Selecciona un PDF, JPG, PNG o WEBP de hasta 10 MB.'
    : 'Solo selección y validación local. El archivo NO se guardará.';
  return `<div class="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
    <div class="min-w-0"><h3 class="text-base font-bold text-slate-800 dark:text-white" style="overflow-wrap:anywhere">${trabajadoresEscapeHTML(cuenta.nombre)}</h3>
      </div>
    <button type="button" onclick="cerrarTrabajadorFicha()" aria-label="Cerrar ficha" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold flex-shrink-0">&times;</button>
  </div>
  ${trabajadorFichaPestanasHTML()}
  <section id="trabajador-panel-informacion" class="trabajador-ficha-panel" role="tabpanel" aria-labelledby="trabajador-tab-informacion">
  <dl class="trabajador-ficha-datos text-sm">
    <div><dt class="text-[10px] font-bold uppercase tracking-wider alm-muted">Rol permanente</dt><dd class="font-semibold">${trabajadoresEscapeHTML(cuenta.roles?.nombre)}</dd></div>
    <div><dt class="text-[10px] font-bold uppercase tracking-wider alm-muted">Estado de cuenta</dt><dd>${cuenta.estado === true ? 'Cuenta habilitada' : cuenta.estado === false ? 'Cuenta deshabilitada' : 'Estado no disponible'}</dd></div>
    ${typeof cuenta.email === 'string' && cuenta.email.trim() ? `<div><dt class="text-[10px] font-bold uppercase tracking-wider alm-muted">Correo electrónico</dt><dd>${trabajadoresEscapeHTML(cuenta.email)}</dd></div>` : ''}
    ${typeof cuenta.correo_verificado === 'boolean' ? `<div><dt class="text-[10px] font-bold uppercase tracking-wider alm-muted">Verificación de correo</dt><dd>${cuenta.correo_verificado ? 'Verificado' : 'No verificado'}</dd></div>` : ''}
  </dl>
  <section class="pt-3 mt-4 border-t border-slate-100 dark:border-slate-800">
    <h4 class="alm-title">Documentos</h4>
    <div class="pt-3">
    <div class="flex items-center justify-between gap-3 mb-2">

      ${permiteSubida ? trabajadorBotonSubirDocumentoHTML(true, true) : ''}
    </div>
    ${permiteSubida && trabajadoresPuedeGestionar() ? '<input type="file" id="cuenta-documento-archivo" class="hidden" hidden tabindex="-1" aria-hidden="true" accept=".pdf,.jpg,.jpeg,.png,.webp" onchange="cuentaTrabajadorSubirDocumento(this)"><p id="cuenta-documentos-disponibilidad" class="text-[11px] text-slate-500 dark:text-slate-400 mb-2">' + trabajadoresEscapeHTML(disponibilidad) + '</p>' : ''}
    <div id="cuenta-documentos-estado" class="text-xs alm-muted" role="status"></div>
    <div id="cuenta-documentos-lista" tabindex="-1" class="space-y-2" role="status">${trabajadoresPuedeGestionar() ? '<p class="text-[11px] text-slate-500 dark:text-slate-400 text-center py-3">Cargando documentos...</p>' : 'Solo un administrador con autorización vigente puede consultar los documentos de esta cuenta.'}</div>
    </div>
  </section></section>${trabajadorFichaTrabajosHTML()}`;
}

function abrirCuentaTrabajadorFicha(id) {
  if (!trabajadoresPuedeGestionar() || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) return;
  const cuenta = trabajadoresCuentasVista?.find(u => u.id === id);
  if (!['administrador', 'recepcion', 'tecnico'].includes(rolCuentaDocumental(cuenta))) return;
  cuentaDocumentalLimpiarLecturas();
  const version = ++trabajadorFichaVersion;
  cuentaDocumentalContexto = { id, version, actor: state.currentUser?.id, documentos: [], laborales: [],
    cuentaCargada: false, laboralCargada: !cuenta.trabajador_id };
  trabajadoresFichaActual = cuenta.trabajador_id ? {
    id: cuenta.trabajador_id, estado: cuenta.trabajador_estado, nombre: cuenta.trabajador_nombre
  } : null;
  asegurarModalTrabajadorFicha();
  const contenido = document.getElementById('trabajador-ficha-contenido');
  if (!contenido) return;
  contenido.innerHTML = cuentaTrabajadorFichaHTML(cuenta);
  trabajadorFichaPrepararPestanas(cuenta.trabajador_id, true);
  openModal(TRABAJADOR_FICHA_ID);
  if (trabajadoresPuedeGestionar())
    cuentaTrabajadorCargarDocumentos(id, version);
  if (trabajadoresFichaActual) trabajadoresCargarDocumentos(true);
}

async function cuentaTrabajadorCargarDocumentos(id, version) {
  const actor = state.currentUser?.id;
  const vigente = () => version === trabajadorFichaVersion && state.currentUser?.id === actor &&
    trabajadoresPuedeGestionar();
  try {
    const documentos = await window.TrabajadoresService.getDocumentosCuenta(id);
    if (!vigente()) return;
    const caja = document.getElementById('cuenta-documentos-lista');
    if (!caja) return;
    if (cuentaDocumentalContexto?.id === id && cuentaDocumentalContexto.version === version)
      cuentaDocumentalContexto.documentos = documentos;
    if (cuentaDocumentalContexto?.id === id && cuentaDocumentalContexto.version === version) {
      cuentaDocumentalContexto.cuentaCargada = true;
      cuentaDocumentalContexto.errorCuenta = false;
      cuentaTrabajadorPintarDocumentos();
      cuentaTrabajadorPintarSubidasPendientes(cuentaDocumentalContexto);
    }
  } catch (_) {
    if (!vigente()) return;
    if (cuentaDocumentalContexto?.id === id && cuentaDocumentalContexto.version === version) {
      cuentaDocumentalContexto.errorCuenta = true;
      cuentaDocumentalContexto.documentos = []; // No mantener acciones de un listado que dejó de verificarse.
      cuentaDocumentalContexto.cuentaCargada = true;
      cuentaTrabajadorPintarDocumentos();
    }
  }
}
function cuentaTrabajadorPintarDocumentos() {
  const c = cuentaDocumentalContexto;
  if (!cuentaDocumentalVigente(c)) return;
  const caja = document.getElementById('cuenta-documentos-lista');
  if (!caja) return;
  // Una lista visual; cada origen conserva sus handlers y UUID originales.
  const cuentas = (c.documentos || []).map(d => {
    const estado=window.TrabajadoresService.estadoDocumentoCuenta(d);
    if (estado.estado==='RETIRADO') return '';
    return trabajadorDocumentoFilaHTML({
      id: d.id, nombre_original: d.nombre_original, mime_type: d.mime_type_verificado,
      tamano_bytes: d.tamano_bytes_verificado, created_at: d.created_at, retiro: estado.retiro,
      estado_efectivo:estado.estado
    }, estado.estado!=='INCIERTO' && /^[0-9a-f-]{36}$/i.test(d.id || ''), true)+
      (estado.estado==='INCIERTO' ? '<p role="alert" class="text-xs alm-muted">Estado documental sin verificar. Requiere revisión.</p>' : '');
  }).join('');
  const historicos = (c.laborales || []).map(d => trabajadorDocumentoFilaHTML(d)).join('');
  caja.innerHTML = cuentas + historicos +
    (c.errorCuenta || c.errorLaboral ? '<p role="alert" class="text-sm">No fue posible consultar todos los documentos. Comprueba los permisos y la conexión.</p>' : '') +
    (!c.cuentaCargada || !c.laboralCargada ? '<p role="status" class="text-sm alm-muted">Cargando documentos…</p>' : '') +
    (c.cuentaCargada && c.laboralCargada && !c.errorCuenta && !c.errorLaboral && !cuentas && !historicos ? trabajadoresDocumentosVacioHTML() : '');
}

function cuentaDocumentalVigente(contexto) {
  return contexto && cuentaDocumentalContexto === contexto && contexto.version === trabajadorFichaVersion &&
    contexto.actor === state.currentUser?.id && trabajadoresPuedeGestionar();
}

function cuentaDocumentalMensaje(contexto, mensaje) {
  if (!cuentaDocumentalVigente(contexto)) return;
  const caja = document.getElementById('cuenta-documentos-estado');
  if (caja) caja.textContent = mensaje;
  cuentaTrabajadorPintarSubidasPendientes(contexto);
}

function cuentaTrabajadorPintarSubidasPendientes(contexto) {
  if(!cuentaDocumentalVigente(contexto))return;
  const caja=document.getElementById('cuenta-documentos-estado');if(!caja||typeof caja.appendChild!=='function')return;
  caja.querySelectorAll?.('[data-revisar-subida]').forEach(b=>b.remove());
  try{for(const id of window.TrabajadoresService.getSubidasCuentaPendientes(contexto.id)){
    const boton=document.createElement('button');boton.type='button';boton.dataset.revisarSubida=id;
    boton.className='text-xs underline mt-2';boton.textContent='Revisar subida pendiente';
    boton.setAttribute?.('aria-label','Revisar subida pendiente '+id);
    boton.disabled=contexto.enviando===true||window.TrabajadoresService.subidaDocumentosCuentaHabilitada!==true;
    boton.onclick=()=>cuentaTrabajadorRevisarSubidaPendiente(id);caja.appendChild(boton);
  }}catch(_){caja.textContent='Las referencias de subidas pendientes requieren revisión.';}
}
async function cuentaTrabajadorRevisarSubidaPendiente(id) {
  const contexto=cuentaDocumentalContexto;if(!cuentaDocumentalVigente(contexto)||contexto.enviando)return;
  contexto.enviando=true;cuentaDocumentalMensaje(contexto,'Revisando la subida pendiente…');
  try{
    await window.TrabajadoresService.revisarSubidaDocumentoCuenta(contexto.id,id);
    if(!cuentaDocumentalVigente(contexto))return;
    await cuentaTrabajadorCargarDocumentos(contexto.id,contexto.version);
    cuentaDocumentalMensaje(contexto,'Documento guardado.');
  }catch(error){cuentaDocumentalMensaje(contexto,error.message+' Referencia documental: '+id);}
  finally{contexto.enviando=false;cuentaTrabajadorPintarSubidasPendientes(contexto);}
}

async function cuentaTrabajadorSubirDocumento(input) {
  const contexto = cuentaDocumentalContexto;
  if (!cuentaDocumentalVigente(contexto)) return;
  if (contexto.enviando) return;
  if (!input) {
    const selector = document.getElementById('cuenta-documento-archivo');
    if (selector) { selector.value = ''; selector.click(); }
    return;
  }
  const archivo = input.files?.[0];
  if (!archivo) { cuentaDocumentalMensaje(contexto, 'La subida de documentos de cuentas todavía no está habilitada.'); return; }
  const seleccion = Symbol(); contexto.seleccion = seleccion; contexto.preparacion = null;
  cuentaDocumentalMensaje(contexto, 'Comprobando archivo local, sin subirlo...');
  try {
    const preparacion = await window.TrabajadoresService.prepararDocumentoCuenta(contexto.id, archivo);
    if (!cuentaDocumentalVigente(contexto) || contexto.seleccion !== seleccion) return;
    contexto.preparacion = preparacion;
    if (window.TrabajadoresService.subidaDocumentosCuentaHabilitada !== true) {
      cuentaDocumentalMensaje(contexto, 'Archivo seleccionado: ' + preparacion.nombre_original + '. La subida sigue deshabilitada; no se ha enviado ni registrado el documento.');
      return;
    }
    contexto.enviando = true;
    cuentaDocumentalMensaje(contexto, 'Subiendo y comprobando documento...');
    await window.TrabajadoresService.subirDocumentoCuenta(preparacion);
    if (!cuentaDocumentalVigente(contexto)) return;
    cuentaDocumentalMensaje(contexto, 'Documento guardado.');
    await cuentaTrabajadorCargarDocumentos(contexto.id, contexto.version);
  } catch (error) {
    if (cuentaDocumentalVigente(contexto) && contexto.seleccion === seleccion)
      cuentaDocumentalMensaje(contexto, error.message + (error.documentoId ? ' Referencia documental: ' + error.documentoId : ''));
  } finally { if (contexto.seleccion === seleccion) { contexto.enviando = false; cuentaTrabajadorPintarSubidasPendientes(contexto); } }
}

let trabajadoresDocumentosConservados = null;
async function cuentaTrabajadorAbrirArchivo(id, descargar, conservado = false) {
  const contexto = conservado ? trabajadoresDocumentosConservados : cuentaDocumentalContexto;
  const vigente = () => conservado
    ? !!contexto && trabajadoresDocumentosConservados===contexto && trabajadoresFichaActual===contexto.ficha &&
      !cuentaDocumentalContexto && state.currentUser?.id===contexto.actor && trabajadoresPuedeGestionar()
    : cuentaDocumentalVigente(contexto);
  if (!vigente()) return;
  const documento = contexto.documentos.find(d => d.id === id);
  if (!documento) return;
  const ventana = descargar ? null : window.open('about:blank','_blank');
  if (!descargar && !ventana) {
    if(conservado) mostrarErrorTrabajador('Permite la ventana emergente para ver el documento.');
    else cuentaDocumentalMensaje(contexto, 'Permite la ventana emergente para ver el documento.');
    return;
  }
  if (ventana) { try { ventana.opener = null; } catch (_) { /* sin opener */ } }
  try {
    const blob = await window.TrabajadoresService.obtenerArchivoCuenta(id);
    if (!vigente()) { if (ventana && !ventana.closed) ventana.close(); return; }
    const url = URL.createObjectURL(blob);
    const timer = setTimeout(() => { URL.revokeObjectURL(url); cuentaDocumentoUrls.delete(url); }, 60000);
    cuentaDocumentoUrls.set(url,timer);
    if (descargar) {
      const ancla = document.createElement('a'); ancla.href = url;
      ancla.download = documento.nombre_original; ancla.rel = 'noopener';
      document.body.appendChild(ancla); ancla.click(); ancla.remove();
    } else if (!ventana.closed) ventana.location.href = url;
  } catch (error) {
    if (ventana && !ventana.closed) ventana.close();
    if(conservado) mostrarErrorTrabajador(mensajeErrorDocumento(error));
    else cuentaDocumentalMensaje(contexto, error.message);
  }
}
async function cuentaTrabajadorRetirarDocumento(id, reautorizar = false, conservado = false) {
  const contexto = conservado ? trabajadoresDocumentosConservados : cuentaDocumentalContexto;
  const servicio = window.TrabajadoresService;
  const vigente = () => conservado
    ? !!contexto && trabajadoresFichaActual===contexto.ficha && !cuentaDocumentalContexto &&
      state.currentUser?.id===contexto.actor && trabajadoresPuedeGestionar()
    : cuentaDocumentalVigente(contexto);
  let documento = contexto?.documentos?.find(d => d.id === id);
  if (!documento ||
      !vigente() || contexto.retirando || document.getElementById('trabajador-estado-dialog')) return;
  // El destinatario original procede de la lectura histórica autorizada.
  // Nunca usar el UUID de la ficha como sustituto del UUID de la cuenta.
  const cuentaId = conservado ? documento.cuenta_id : contexto.id;
  if (conservado && (documento.origen_cuenta_conservada!==true ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cuentaId || ''))) return;
  const recargar = () => conservado ? trabajadoresCargarDocumentos(true)
    : cuentaTrabajadorCargarDocumentos(contexto.id, contexto.version);
  const informar = (texto, exito = false) => conservado
    ? (exito ? mostrarAvisoTrabajador(texto) : mostrarErrorTrabajador(texto))
    : cuentaDocumentalMensaje(contexto, texto);

  contexto.retirando=true;
  const habilitada = servicio?.eliminacionDocumentosCuentaHabilitada === true;
  const origen = document.activeElement;
  const dialog = document.createElement('dialog');
  try {
    documento=await servicio.revalidarDocumentoCuenta(id,cuentaId);
    if (!vigente()) return;
    if (documento.estado_efectivo==='RETIRADO') throw new Error('El documento ya está retirado. Actualiza la ficha.');
    const operacionId=documento.retiro_efectivo?.id??null;
    const accion=operacionId?(reautorizar?'reautorizar':'revisar'):'reservar';
    const revisar=habilitada&&accion==='revisar';
    const confirmado = await trabajadorConfirmarEstado(null, false, dialog, {
      titulo: revisar ? 'Revisar retiro' : 'Eliminar documento',
      mensaje: revisar
        ? `¿Deseas verificar si el documento «${documento.nombre_original}» sigue en Storage?`
        : `¿Deseas eliminar definitivamente el documento «${documento.nombre_original}»? El archivo se eliminará y dejará de aparecer en la ficha. Esta acción no se puede deshacer desde la aplicación.`,
      destructivo: !revisar,
      bloqueado: !habilitada
    });
    if (!confirmado || !habilitada || servicio.eliminacionDocumentosCuentaHabilitada !== true ||
        !vigente()) return;

    const { resultado, operacionId: operacion, eliminacionDefinitiva } = await servicio.retirarDocumentoCuenta({
      cuentaId, documentoId: id, accion, operacionId, confirmacion: true
    });
    if (!vigente()) return;
    await recargar();
    if (!vigente()) return;
    const mensajes = {
      AUSENCIA_CONFIRMADA: eliminacionDefinitiva === true
        ? 'Documento eliminado correctamente'
        : 'La eliminación definitiva no está confirmada. Revisa la operación original.',
      OBJETO_ORIGINAL_PRESENTE: 'El archivo original sigue presente. Si la reserva venció, puedes autorizar un nuevo intento.',
      IDENTIDAD_STORAGE_DISTINTA: 'El archivo ya no coincide con la reserva. Solicita revisión.',
      AUTORIZACION_VIGENTE: 'Ya existe una autorización vigente. Revisa el retiro antes de volver a enviarlo.',
      REQUIERE_REAUTORIZACION_EXPLICITA: 'La reserva venció. Revisa el retiro o autoriza un nuevo intento.'
    };
    const exito = resultado === 'AUSENCIA_CONFIRMADA' && eliminacionDefinitiva === true;
    informar(mensajes[resultado] + (exito ? '' : ' Operación: ' + operacion), exito);
  } catch (error) {
    if (vigente()) {
      await recargar();
      if (vigente()) informar(error.message + (error.operacionId ? ' Operación: ' + error.operacionId : ''));
    }
    if (dialog.open) await trabajadorConfirmarEstado(null, false, dialog, {
      titulo: 'Revisar retiro',
      mensaje: `Documento: ${documento.nombre_original}. ` + error.message +
        (error.operacionId ? ' Operación: ' + error.operacionId : '') +
        ' Cancela y revisa el retiro original antes de volver a enviarlo.',
      bloqueado: true, error: true, destructivo: true
    });
  } finally {
    contexto.retirando=false;
    if (dialog.open) dialog.close();
    dialog.remove();
    if (origen?.isConnected) origen.focus();
    else if (vigente())
      document.getElementById(conservado ? 'trabajador-documentos-lista' : 'cuenta-documentos-lista')?.focus();
  }
}

function cuentaTrabajadorVerDocumento(id) { return cuentaTrabajadorAbrirArchivo(id,false); }
function cuentaTrabajadorDescargarDocumento(id) { return cuentaTrabajadorAbrirArchivo(id,true); }

function asegurarModalTrabajadorFicha() {
  if (document.getElementById(TRABAJADOR_FICHA_ID)) return;

  const envoltorio = document.createElement('div');
  envoltorio.innerHTML = trabajadorFichaModalHTML();
  document.body.appendChild(envoltorio.firstElementChild);
}

function trabajadorFichaModalHTML() {
  return `
    <div id="${TRABAJADOR_FICHA_ID}" onclick="handleModalBackdropClick(event, '${TRABAJADOR_FICHA_ID}')"
      class="alm-ui alm-personnel-dialog hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto cursor-pointer">
      <div onclick="event.stopPropagation()"
        class="trabajador-ficha-shell bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 overflow-y-auto custom-scrollbar cursor-default my-auto text-slate-800 dark:text-slate-100">
        <!-- Rellenado dinámicamente por abrirTrabajadorFicha() -->
        <div id="trabajador-ficha-contenido"></div>
      </div>
    </div>
  `;
}

// Estado de carga / error de la ficha.
function trabajadorFichaCargandoHTML() {
  return `
    <div class="flex flex-col items-center justify-center py-10 space-y-3">
      <span class="animate-spin text-3xl text-blue-600">⏳</span>
      <span class="text-xs font-bold text-slate-500">Cargando ficha...</span>
    </div>
  `;
}

function trabajadorFichaErrorHTML() {
  return `
    <div class="text-center py-8">
      <span class="text-4xl block mb-3">⚠️</span>
      <p class="text-sm font-bold text-rose-700 dark:text-rose-300">No se pudo cargar la ficha.</p>
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Revisa la conexión con Supabase o los permisos de tu sesión.</p>
      <button type="button" onclick="cerrarTrabajadorFicha()"
        class="mt-4 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
        Cerrar
      </button>
    </div>
  `;
}

// Cuerpo de la ficha: solo datos reales del trabajador.
function trabajadorFichaContenidoHTML(t) {
  const estadoTexto = (t && t.estado !== null && t.estado !== undefined) ? String(t.estado) : '';
  const esActivo = trabajadoresEstadoEsActivo(estadoTexto);
  const estadoClase = esActivo
    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';

  // Requisito 4: si observaciones es NULL/vacío se muestra el texto
  // indicado. NO se inventa contenido.
  const obsTexto = (t && t.observaciones !== null && t.observaciones !== undefined && String(t.observaciones).trim() !== '')
    ? trabajadoresEscapeHTML(String(t.observaciones).trim())
    : '<span class="italic text-slate-400 dark:text-slate-500">Sin observaciones registradas</span>';

  // Fechas amigables. created_at/updated_at son timestamptz reales.
  const creada = trabajadoresFormatoFecha(t && t.created_at);
  const actualizada = trabajadoresFormatoFecha(t && t.updated_at);

  // Acción de estado según el valor REAL. Lista acotada: solo se
  // ofrece Desactivar (si "Activo") o Reactivar (si "Inactivo").
  const accionEstado = trabajadorEstaEliminado(t) || !trabajadoresPuedeGestionar() ? '' : esActivo
    ? `<button type="button" id="trabajador-accion-estado" onclick="trabajadorCambiarEstado('${trabajadoresEscapeHTML(t.id)}', 'Inactivo')"
        class="flex-1 px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-950/70 transition-colors">
        Desactivar trabajador
      </button>`
    : `<button type="button" id="trabajador-accion-estado" onclick="trabajadorCambiarEstado('${trabajadoresEscapeHTML(t.id)}', 'Activo')"
        class="flex-1 px-4 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950/70 transition-colors">
        Reactivar trabajador
      </button>`;

  return `
    <!-- ENCABEZADO DE LA FICHA -->
    <div class="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center space-x-2.5 min-w-0">
        <span class="text-2xl">👥</span>
        <div class="min-w-0">
          <h3 class="text-base font-bold text-slate-800 dark:text-white break-words">${trabajadoresEscapeHTML(t.nombre)}</h3>

        </div>
      </div>
      <button type="button" onclick="cerrarTrabajadorFicha()"
        class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 text-xl font-bold flex-shrink-0">&times;</button>
    </div>

    ${trabajadorFichaPestanasHTML()}
    <section id="trabajador-panel-informacion" class="trabajador-ficha-panel" role="tabpanel" aria-labelledby="trabajador-tab-informacion">
    <!-- DATOS -->
    <div class="trabajador-ficha-datos">


      <div class="trabajador-ficha-campo">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Cargo</span>
        <span class="text-xs font-bold text-slate-800 dark:text-slate-100 text-right">${trabajadoresEscapeHTML(t.cargo == null ? '' : t.cargo)}</span>
      </div>

      <div class="trabajador-ficha-campo">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Estado</span>
        <span class="text-[10px] font-extrabold px-2.5 py-1 rounded-full border whitespace-nowrap ${estadoClase}">
          ${trabajadoresEscapeHTML(estadoTexto || 'Sin estado')}
        </span>
      </div>

      <div class="trabajador-ficha-ancho space-y-1">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Observaciones</span>
        ${String(t.observaciones || '').length > 180 ? `<details class="trabajador-observaciones"><summary>Ver observaciones completas</summary><p class="text-sm">${obsTexto}</p></details>` : `<p class="text-sm">${obsTexto}</p>`}
      </div>

      <div class="trabajador-ficha-ancho pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Creado</span>
          <span class="text-xs text-slate-700 dark:text-slate-300">${trabajadoresEscapeHTML(creada)}</span>
        </div>
        <div class="space-y-1">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Última actualización</span>
          <span class="text-xs text-slate-700 dark:text-slate-300">${trabajadoresEscapeHTML(actualizada)}</span>
        </div>
      </div>

      <!-- SECCIÓN DOCUMENTOS (FASE C1B-C): REAL sobre Supabase
           Storage privado + public.trabajadores_documentos.
           Nada de simulación: lista, subida, ver, descargar y
           eliminar operan con datos reales bajo RLS. -->
      ${trabajadorSeccionDocumentosHTML(t)}

    </div>

    <!-- ACCIONES -->
    <div class="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
      ${trabajadorEstaEliminado(t) || !trabajadoresPuedeGestionar() ? '' : `<button type="button" onclick="cerrarTrabajadorFicha(); abrirTrabajadorFormulario('editar', '${trabajadoresEscapeHTML(t.id)}')"
        class="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-600 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all">
        Editar
      </button>`}
      ${accionEstado}
    </div>
    </section>${trabajadorFichaTrabajosHTML()}
  `;
}

function trabajadorSeccionDocumentosHTML(t, titulo = 'Documentos') {
  const activo = trabajadoresEstadoEsActivo(t.estado);
  return `<div class="trabajador-ficha-ancho pt-3 border-t border-slate-100 dark:border-slate-800">
    <div class="flex items-center justify-between gap-3 mb-2">
      <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">${titulo}</span>
      ${trabajadorBotonSubirDocumentoHTML(activo)}
    </div>
    ${activo ? '' : `<div class="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 mb-2">
      <p class="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">Este trabajador está ${trabajadorEstaEliminado(t) ? 'eliminado' : 'inactivo'}. Puedes consultar o eliminar sus documentos, pero no agregar nuevos.</p>
    </div>`}
    <div id="trabajador-documentos-lista" class="space-y-2">
      <p class="text-[11px] text-slate-500 dark:text-slate-400 text-center py-3">Cargando documentos...</p>
    </div>
  </div>`;
}

function cerrarTrabajadorFicha() {
  trabajadorFichaTrabajosContexto = null;
  cuentaDocumentalLimpiarLecturas();
  ++trabajadorFichaVersion;
  closeModal(TRABAJADOR_FICHA_ID);
  // La ficha ya no está abierta: se olvida el contexto de documentos
  // para que ninguna carga/acción en curso pinte sobre otro modal.
  trabajadoresFichaActual = null;
}

// Pinta la ficha y arranca la carga REAL de documentos. Único punto
// de entrada del render de la ficha (apertura y cambio de estado),
// así el contexto de documentos siempre queda sincronizado.
function pintarFichaTrabajador(trabajador) {
  const contenedor = document.getElementById('trabajador-ficha-contenido');
  if (!contenedor || !trabajador) return;

  trabajadoresFichaActual = {
    id: trabajador.id,
    estado: trabajador.estado,
    nombre: trabajador.nombre
  };

  contenedor.innerHTML = trabajadorFichaContenidoHTML(trabajador);
  const propia = (trabajadoresCuentasVista || []).some(cuenta =>
    cuenta.id === state.currentUser?.id && cuenta.trabajador_id === trabajador.id);
  trabajadorFichaPrepararPestanas(trabajador.id, propia);

  // Carga de la lista real (fire and forget: maneja sus propios
  // errores y pinta el estado "Error al cargar" dentro de la sección).
  trabajadoresCargarDocumentos(true);
}

// Abre la ficha y carga los datos REALES del trabajador desde
// Supabase. NO se lee de mocks ni de localStorage.
async function abrirTrabajadorFicha(id) {
  if (!id) return;
  if (!window.TrabajadoresService) return;
  cuentaDocumentalLimpiarLecturas();
  const version = ++trabajadorFichaVersion;

  asegurarModalTrabajadorFicha();

  const contenedor = document.getElementById('trabajador-ficha-contenido');
  if (!contenedor) return;

  contenedor.innerHTML = trabajadorFichaCargandoHTML();
  openModal(TRABAJADOR_FICHA_ID);
  // Se limpia el contexto de documentos previo: si la carga falla,
  // ninguna acción pendiente debe operar sobre la ficha anterior.
  trabajadoresFichaActual = null;

  try {
    // Fuerza lectura real. getTrabajador(id) usa .single() y relanza
    // el error si el registro no existe o no hay permisos.
    const trabajador = await window.TrabajadoresService.getTrabajador(id, true);
    if (version !== trabajadorFichaVersion) return;
    if (!trabajador) {
      contenedor.innerHTML = trabajadorFichaErrorHTML();
      return;
    }
    // Pinta la ficha y carga la lista REAL de documentos.
    pintarFichaTrabajador(trabajador);
  } catch (e) {
    if (version !== trabajadorFichaVersion) return;
    console.error('Error cargando ficha de trabajador desde Supabase:', e);
    contenedor.innerHTML = trabajadorFichaErrorHTML();
  }
}

// ----------------------------------------------------------
// Cambio de estado desde la ficha (Desactivar / Reactivar).
// Requiere confirmación. NO hay DELETE físico.
//   Desactivar -> updateTrabajador(id, { estado: "Inactivo" })
//   Reactivar  -> updateTrabajador(id, { estado: "Activo" })
// Tras confirmar: se reconsulta Supabase, se actualiza la vista de
// tarjetas y se repinta la ficha con el valor persistido.
// ----------------------------------------------------------
let trabajadorEstadoGuardando = false;
function trabajadorConfirmarEstado(actual, esDesactivar, dialog, retiro = null) {
  const titulo = retiro?.titulo ?? (esDesactivar ? 'Desactivar trabajador' : 'Reactivar trabajador');
  dialog.id = 'trabajador-estado-dialog';
  dialog.className = 'fixed inset-0 m-auto w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-slate-800 dark:text-white shadow-xl';
  dialog.setAttribute('aria-labelledby', 'trabajador-estado-titulo');
  dialog.setAttribute('aria-describedby', 'trabajador-estado-mensaje');
  dialog.setAttribute('aria-busy', 'false');
  dialog.innerHTML = `
    ${retiro?.mostrarCerrar ? '<button type="button" data-cerrar aria-label="Cerrar" class="absolute right-4 top-4 rounded-lg px-2 text-lg">×</button>' : ''}
    <h2 id="trabajador-estado-titulo" class="text-lg font-bold">${titulo}</h2>
    ${actual ? `<div class="mt-3 text-sm font-bold break-words">${trabajadoresEscapeHTML(actual.nombre)}</div>` : ''}
    <p id="trabajador-estado-mensaje" ${retiro?.error ? 'role="alert"' : ''} class="my-4 text-sm alm-muted"></p>
    <div class="flex flex-wrap justify-end gap-2">
      <button type="button" data-cancelar autofocus class="px-4 py-2 rounded-xl border text-sm font-bold">Cancelar</button>
      <button type="button" data-confirmar class="px-4 py-2 rounded-xl text-sm font-bold text-white ${(esDesactivar || retiro?.destructivo) ? 'bg-rose-600' : 'bg-blue-600'}">${titulo}</button>
    </div>`;
  dialog.querySelector('p').textContent = retiro?.mensaje ?? (esDesactivar
    ? `¿Deseas desactivar a ${actual.nombre}? Su información y documentos se conservarán. No podrá recibir nuevos documentos mientras esté inactivo.`
    : `¿Deseas reactivar a ${actual.nombre}? Su ficha volverá a estar activa y podrá recibir nuevos documentos.`);
  if (retiro?.bloqueado && !retiro?.error) dialog.querySelector('p').textContent += ' La eliminación todavía no está habilitada.';
  const cancelar = dialog.querySelector('[data-cancelar]');
  const confirmar = dialog.querySelector('[data-confirmar]');
  const cerrar = retiro?.mostrarCerrar ? dialog.querySelector('[data-cerrar]') : null;
  cancelar.disabled = false;
  if (cerrar) cerrar.disabled = false;
  confirmar.disabled = retiro?.bloqueado === true;
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(false), { once: true });
    dialog.addEventListener('cancel', event => event.preventDefault());
    cancelar.onclick = () => dialog.close();
    if (cerrar) cerrar.onclick = cancelar.onclick;
    confirmar.onclick = () => {
      if (!dialog.open || confirmar.disabled || retiro?.bloqueado) return;
      confirmar.disabled = cancelar.disabled = true;
      if (cerrar) cerrar.disabled = true;
      dialog.setAttribute('aria-busy', 'true');
      if (retiro) confirmar.textContent = 'Procesando…';
      resolve(true);
    };
    if (!dialog.open) {
      document.body.appendChild(dialog);
      dialog.showModal();
    } else cancelar.focus?.();
  });
}

async function trabajadorCambiarEstado(id, nuevoEstado) {
  if (!id || !nuevoEstado) return;
  if (!window.TrabajadoresService) return;
  if (trabajadorEstadoGuardando || !trabajadoresPuedeGestionar() || !['Activo','Inactivo','Eliminado'].includes(nuevoEstado)) return;

  const esDesactivar = String(nuevoEstado) === 'Inactivo';
  const esEliminar = nuevoEstado === 'Eliminado';
  const origen = document.activeElement;
  let dialog;
  let actual;
  trabajadorEstadoGuardando = true;
  try {
    actual = await window.TrabajadoresService.getTrabajador(id, true);
    if (!actual || actual.id !== id) throw new Error('No se pudo verificar el trabajador.');
    if (trabajadorEstaEliminado(actual)) {
      mostrarAvisoTrabajador('Este trabajador está eliminado y se conserva para consulta.');
      return;
    }

    if (nuevoEstado !== 'Activo' && trabajadoresCuentasVista?.some(u => u.trabajador_id === id)) {
      mostrarAvisoTrabajador('Primero desvincula la ficha de su cuenta para cambiarla a un estado no activo.');
      return;
    }
    dialog = document.createElement('dialog');
    if (!await trabajadorConfirmarEstado(actual, esDesactivar, dialog, esEliminar ? {
      titulo: 'Eliminar trabajador', destructivo: true,
      mensaje: `Se retirará a ${actual.nombre} del listado principal y de nuevas asignaciones. Se conservarán su ficha, documentos, trabajos, historial y asignaciones existentes. No se borrará el registro.`
    } : null)) return;

    if (!trabajadoresPuedeGestionar() || !await revalidarPrivilegioParaEscritura()) throw new Error('No tienes autorización administrativa vigente.');
    // UPDATE real. Solo se envía el campo estado; nombre y
    // observaciones no cambian.
    const resultado = esEliminar
      ? await window.TrabajadoresService.eliminarTrabajadorLogicamente(id)
      : await window.TrabajadoresService.updateTrabajador(id, { estado: nuevoEstado });

    if (!resultado || resultado.id !== id || resultado.estado !== nuevoEstado) {
      throw new Error('Supabase no devolvió el registro.');
    }

    // Reconsulta real + actualización de la vista de tarjetas.
    trabajadoresVistaDatos = trabajadoresVistaDatos.map(t => t.id === id ? resultado : t);
    const lista = document.getElementById('trabajadores-content');
    if (lista) lista.innerHTML = getTrabajadoresHTML(trabajadoresVistaDatos);
    await cargarTrabajadoresEnVista(true);

    // Repinta la ficha con el estado persistido (valor devuelto por
    // Supabase, no el que asumimos). El render decide si ofrece
    // subida (Activo) y recarga la lista real de documentos.
    const contenedor = document.getElementById('trabajador-ficha-contenido');
    if (contenedor && trabajadoresFichaActual?.id === id && !document.getElementById(TRABAJADOR_FICHA_ID).classList.contains('hidden')) {
      pintarFichaTrabajador(resultado);
    }

    mostrarAvisoTrabajador(esEliminar ? '✅ Trabajador eliminado del listado. Se conserva su información e historial.' : esDesactivar
      ? '✅ Trabajador desactivado correctamente.'
      : '✅ Trabajador reactivado correctamente.');
  } catch (e) {
    // Mensaje amigable. NO se expone UUID, SQL ni policies.
    mostrarAvisoTrabajador('⚠️ ' + mensajeErrorTrabajador(e));
    if (dialog?.open) await trabajadorConfirmarEstado(actual || null, false, dialog, {
      titulo: esEliminar ? 'Eliminar trabajador' : esDesactivar ? 'Desactivar trabajador' : 'Reactivar trabajador',
      mensaje: mensajeErrorTrabajador(e) + ' Cancela y revisa el estado antes de volver a intentarlo.',
      bloqueado: true, error: true, destructivo: esEliminar || esDesactivar
    });
  } finally {
    if (dialog) {
      if (dialog.open) dialog.close();
      dialog.remove();
      if (origen?.isConnected) origen.focus();
      else if (trabajadoresFichaActual?.id === id) document.getElementById('trabajador-accion-estado')?.focus();
    }
    trabajadorEstadoGuardando = false;
  }
}

// ==========================================================
// DOCUMENTOS DEL TRABAJADOR
// ==========================================================
// Sección REAL dentro de la ficha. Fuente EXCLUSIVA:
// window.TrabajadoresDocumentosService (bucket privado
// documentos-trabajadores + public.trabajadores_documentos).
//
//   LISTAR     -> getDocumentos(trabajadorId, force)
//   SUBIR      -> subirDocumento(trabajadorId, file)
//   VER        -> crearUrlTemporal(docId)              (60 segundos)
//   DESCARGAR  -> crearUrlTemporal(docId, { descargar: true })
//   ELIMINAR   -> eliminarDocumento(docId)   (Storage primero, luego
//                                            metadata, con confirmación)
//
// La UI trabaja SIEMPRE por docId: nunca recibe ni muestra
// storage_path desde atributos manipulables del DOM. Tampoco se usa
// getPublicUrl ni se registran signed URLs / nombres de archivo en
// consola. NO mocks, NO localStorage, NO service_role.
// Los permisos reales los decide RLS + Storage Policies (backend).
// ==========================================================

// Contexto de la ficha abierta: { id, estado, nombre }.
// Sólo evita depender de atributos manipulables del DOM para saber
// sobre qué trabajador se está actuando. NO es autorización.
let trabajadoresFichaActual = null;

// Botón [Subir documento]: SÓLO si el trabajador está Activo y la
// sesión es Administrador PERMANENTE (estado real que app.js mantiene
// en state.currentUser con fail closed). Es una defensa UX extra:
// aunque alguien manipule la UI, el backend rechaza el INSERT.
function trabajadorBotonSubirDocumentoHTML(trabajadorActivo, cuenta = false) {
  if (!trabajadorActivo) return '';

  if (!trabajadoresPuedeGestionar()) return '';

  return `
    <button type="button" onclick="${cuenta ? 'cuentaTrabajadorSubirDocumento' : 'trabajadorSubirDocumento'}()"${cuenta ? ' aria-describedby="cuenta-documentos-disponibilidad"' : ''}
      class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-600 text-white text-[11px] font-bold shadow-lg shadow-blue-600/30 transition-all whitespace-nowrap">
      Subir documento
    </button>
  `;
}

// Tipo legible a partir del mime_type REAL. Tipos fuera de la
// allowlist del bucket se muestran neutros ("Archivo"): no se
// inventan categorías.
function trabajadoresTipoDocumentoLegible(mimeType) {
  const mime = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
  if (mime === 'application/pdf') return 'PDF';
  if (mime === 'image/jpeg') return 'Imagen JPG';
  if (mime === 'image/png') return 'Imagen PNG';
  if (mime === 'image/webp') return 'Imagen WEBP';
  return 'Archivo';
}

// Tamaño legible desde tamano_bytes REAL. Sin inventar: si el valor
// no es numérico se indica que no está disponible.
function trabajadoresTamanoLegible(bytes) {
  const valor = Number(bytes);
  if (!isFinite(valor) || valor < 0) return 'Tamaño no disponible';
  if (valor < 1024) return `${valor} B`;
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;
  return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
}

// Fila de la lista: SOLO nombre_original, tipo, tamaño y fecha real.
// NUNCA storage_path, id ni creador.
function trabajadorDocumentoFilaHTML(doc, mostrarAcciones = true, cuenta = false) {
  const docId = trabajadoresEscapeHTML(doc && doc.id ? doc.id : '');
  const conservado = !cuenta && doc.origen_cuenta_conservada===true;
  const retiro = conservado ? window.TrabajadoresService?.estadoDocumentoCuenta(doc)?.retiro : doc.retiro;
  const eliminarConservado = conservado && trabajadoresPuedeGestionar() &&
    window.TrabajadoresService?.eliminacionDocumentosCuentaHabilitada===true &&
    ['DISPONIBLE','RETIRO_PENDIENTE'].includes(doc.estado_efectivo);

  // nombre_original SIEMPRE escapado antes de inyectarlo en HTML.
  const nombre = trabajadoresEscapeHTML(
    doc && doc.nombre_original !== null && doc.nombre_original !== undefined
      ? doc.nombre_original
      : 'Documento sin nombre'
  );
  const tipo = trabajadoresEscapeHTML(trabajadoresTipoDocumentoLegible(doc && doc.mime_type));
  const tamano = trabajadoresEscapeHTML(trabajadoresTamanoLegible(doc && doc.tamano_bytes));
  const fecha = trabajadoresEscapeHTML(trabajadoresFormatoFecha(doc && doc.created_at));

  return `
    <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
      <div class="min-w-0">
        <p class="text-xs font-bold text-slate-800 dark:text-slate-100 break-all leading-snug">${nombre}</p>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">${tipo} · ${tamano} · Subido el ${fecha}</p>
      </div>
      ${(cuenta || conservado) && doc.estado_efectivo==='RETIRO_PENDIENTE' ? '<p class="mt-1 text-xs alm-muted">Retiro pendiente de revisión</p>' : ''}
      ${mostrarAcciones ? `<div class="flex ${cuenta ? 'flex-wrap ' : ''}items-center justify-end gap-2 mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
        ${(!cuenta && !conservado) || doc.estado_efectivo==='DISPONIBLE' ? `
        <button type="button" onclick="${conservado ? `cuentaTrabajadorAbrirArchivo('${docId}', false, true)` : `${cuenta ? 'cuentaTrabajadorVerDocumento' : 'trabajadorVerDocumento'}('${docId}')` }"
          class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors">
          Ver
        </button>
        <button type="button" onclick="${conservado ? `cuentaTrabajadorAbrirArchivo('${docId}', true, true)` : `${cuenta ? 'cuentaTrabajadorDescargarDocumento' : 'trabajadorDescargarDocumento'}('${docId}')` }"
          class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors">
          Descargar
        </button>
        ` : ''}
        ${!conservado || eliminarConservado ? `<button type="button" onclick="${conservado ? `cuentaTrabajadorRetirarDocumento('${docId}', false, true)` : `${cuenta ? 'cuentaTrabajadorRetirarDocumento' : 'trabajadorEliminarDocumento'}('${docId}'${cuenta ? '' : ', this'})`}"${cuenta || conservado ? '' : ` data-nombre-documento="${nombre}"`}
          class="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70 transition-colors">
          ${(cuenta || conservado) && retiro && window.TrabajadoresService?.eliminacionDocumentosCuentaHabilitada ? 'Revisar retiro' : 'Eliminar'}
        </button>` : ''}
        ${(cuenta || eliminarConservado) && retiro && window.TrabajadoresService?.eliminacionDocumentosCuentaHabilitada &&
          Date.parse(retiro.autorizado_hasta) <= Date.now() ? `<button type="button"
          onclick="cuentaTrabajadorRetirarDocumento('${docId}', true${conservado ? ', true' : ''})"
          class="px-3 py-1.5 rounded-lg border border-rose-200 text-[11px] font-bold text-rose-700 dark:text-rose-300">Autorizar nuevo intento</button>` : ''}
      </div>` : ''}
    </div>
  `;
}

// Estado vacío de la sección.
function trabajadoresDocumentosVacioHTML() {
  return `
    <div class="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-3 text-center">
      <p class="text-[11px] text-slate-500 dark:text-slate-400">Sin documentos registrados</p>
    </div>
  `;
}

// Estado de error de la sección (con reintento). Sin mocks.
function trabajadoresDocumentosErrorHTML() {
  return `
    <div class="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-3 text-center">
      <p class="text-[11px] font-bold text-rose-700 dark:text-rose-300">Error al cargar los documentos</p>
      <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Revisa la conexión con Supabase o los permisos de tu sesión.</p>
      <button type="button" onclick="trabajadoresCargarDocumentos(true)"
        class="mt-2 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70 transition-colors">
        Reintentar
      </button>
    </div>
  `;
}

// Lista: Cargando... -> lista real / vacío / error.
async function trabajadoresCargarDocumentos(force = true) {
  const ficha = trabajadoresFichaActual;
  if (!ficha || !ficha.id) return;
  const cuenta = cuentaDocumentalContexto;
  trabajadoresDocumentosConservados = null;
  const actor = state.currentUser?.id;

  const cajaInicial = document.getElementById('trabajador-documentos-lista');
  if (cajaInicial) {
    cajaInicial.innerHTML = '<p class="text-[11px] text-slate-500 dark:text-slate-400 text-center py-3">Cargando documentos...</p>';
  }

  try {
    if (!window.TrabajadoresDocumentosService) {
      throw new Error('TrabajadoresDocumentosService no está disponible.');
    }

    const [documentos, conservados] = await Promise.all([
      window.TrabajadoresDocumentosService.getDocumentos(ficha.id, force),
      cuenta ? [] : window.TrabajadoresService.getDocumentosCuenta(ficha.id,{trabajadorHistorico:true})
    ]);

    // La ficha pudo cerrarse o cambiar mientras cargaba.
    if (trabajadoresFichaActual !== ficha || state.currentUser?.id !== actor) return;
    if (cuenta) {
      if (!cuentaDocumentalVigente(cuenta)) return;
      cuenta.laborales = documentos || []; cuenta.laboralCargada = true; cuenta.errorLaboral = false;
      cuentaTrabajadorPintarDocumentos(); return;
    }
    const caja = document.getElementById('trabajador-documentos-lista');
    if (!caja) return;

    trabajadoresDocumentosConservados = {ficha,actor,documentos:conservados};
    const lista = [...(documentos || []),...conservados];
    caja.innerHTML = lista.length === 0
      ? trabajadoresDocumentosVacioHTML()
      : lista.map(doc => trabajadorDocumentoFilaHTML(doc)).join('');
  } catch (e) {
    // Error real (conexión/permisos): se muestra y se propaga.
    // NUNCA fallback a mocks ni a localStorage.
    console.error('Error cargando documentos del trabajador desde Supabase:', e);
    if (!trabajadoresFichaActual || trabajadoresFichaActual.id !== ficha.id) return;
    if (cuenta) {
      if (!cuentaDocumentalVigente(cuenta)) return;
      cuenta.laboralCargada = true; cuenta.errorLaboral = true; cuentaTrabajadorPintarDocumentos(); return;
    }
    const caja = document.getElementById('trabajador-documentos-lista');
    if (!caja) return;
    caja.innerHTML = trabajadoresDocumentosErrorHTML();
  }
}

// [Subir documento]: selector nativo de archivo + service real.
async function trabajadorValidarOrigenDocumental(ficha) {
  const actor = state.currentUser?.id;
  const cuentas = await window.TrabajadoresService.getCuentasSistema(true);
  if (!trabajadoresPuedeGestionar() || state.currentUser?.id !== actor || trabajadoresFichaActual !== ficha ||
      cuentaDocumentalContexto || cuentas.some(c => c.trabajador_id === ficha.id))
    throw Error('Los documentos de personas con cuenta deben gestionarse desde su ficha de cuenta.');
}
async function trabajadorSubirDocumento() {
  const ficha = trabajadoresFichaActual;
  if (!ficha || !ficha.id) return;
  if (cuentaDocumentalContexto || (trabajadoresCuentasVista || []).some(c => c.trabajador_id === ficha.id)) {
    mostrarErrorTrabajador('Los documentos de personas con cuenta se gestionan desde su ficha de cuenta.'); return;
  }

  // Defensa UX (NO autorización): trabajador Inactivo no ofrece
  // subida y se requiere autorización administrativa vigente.
  if (String(ficha.estado || '').trim() !== 'Activo') {
    mostrarErrorTrabajador('Este trabajador está inactivo. Puedes consultar o eliminar sus documentos, pero no agregar nuevos.');
    return;
  }
  if (!trabajadoresPuedeGestionar()) {
    mostrarErrorTrabajador('Solo un administrador con autorización vigente puede subir documentos.');
    return;
  }
  if (!window.TrabajadoresDocumentosService) {
    mostrarErrorTrabajador('El servicio de documentos no está disponible.');
    return;
  }
  try { await trabajadorValidarOrigenDocumental(ficha); }
  catch (_) { mostrarErrorTrabajador('No se pudo confirmar que esta ficha no tenga cuenta. No se subió ningún documento.'); return; }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';
  input.style.display = 'none';

  const limpiar = () => {
    if (input.parentNode) input.parentNode.removeChild(input);
  };

  input.onchange = async () => {
    const archivo = (input.files && input.files.length > 0) ? input.files[0] : null;
    limpiar();
    if (!archivo) return;

    try {
      await trabajadorValidarOrigenDocumental(ficha);
      // upload + INSERT de metadata; compensación si el INSERT falla.
      await window.TrabajadoresDocumentosService.subirDocumento(ficha.id, archivo);
      mostrarAvisoTrabajador('✅ Documento subido correctamente.');
    } catch (e) {
      console.error('Error subiendo documento del trabajador:', e);
      mostrarErrorTrabajador('⚠️ ' + mensajeErrorDocumento(e));
    }

    // Éxito o error: se relee Supabase (force) para mostrar el estado
    // real de la lista.
    await trabajadoresCargarDocumentos(true);
  };

  if ('oncancel' in input) {
    input.oncancel = limpiar;
  }

  document.body.appendChild(input);
  input.click();
}

// [Ver]: signed URL de 60 segundos abierta en pestaña nueva.
async function trabajadorVerDocumento(docId) {
  if (!docId) return;
  if (!window.TrabajadoresDocumentosService) return;

  // Se abre la pestaña de forma SÍNCRONA (gesto del usuario) para
  // que el navegador no la bloquee como emergente, y se limpia su
  // referencia a esta ventana antes de cargar la URL firmada.
  const ventana = window.open('about:blank', '_blank');
  if (!ventana) {
    mostrarErrorTrabajador('El navegador bloqueó la ventana emergente. Permítela para ver el documento.');
    return;
  }
  try { ventana.opener = null; } catch (eOpener) { /* sin opener */ }

  try {
    const enlace = await window.TrabajadoresDocumentosService.crearUrlTemporal(docId, { descargar: false });
    if (ventana.closed) return;
    ventana.location.href = enlace.url;
  } catch (e) {
    if (!ventana.closed) ventana.close();
    console.error('Error abriendo documento del trabajador:', e);
    mostrarErrorTrabajador('⚠️ ' + mensajeErrorDocumento(e));
  }
}

// [Descargar]: signed URL de 60 segundos con nombre de descarga
// (supabase-js agrega ?download={nombre_original} a la URL firmada).
async function trabajadorDescargarDocumento(docId) {
  if (!docId) return;
  if (!window.TrabajadoresDocumentosService) return;

  try {
    const enlace = await window.TrabajadoresDocumentosService.crearUrlTemporal(docId, { descargar: true });

    const ancla = document.createElement('a');
    ancla.href = enlace.url;
    ancla.target = '_blank';
    ancla.rel = 'noopener';
    if (enlace.nombreOriginal) ancla.download = enlace.nombreOriginal;
    document.body.appendChild(ancla);
    ancla.click();
    document.body.removeChild(ancla);
  } catch (e) {
    console.error('Error descargando documento del trabajador:', e);
    mostrarErrorTrabajador('⚠️ ' + mensajeErrorDocumento(e));
  }
}

// [Eliminar]: confirmación explícita y sólo después Storage primero
// y metadata después (lo hace el service).
async function trabajadorEliminarDocumento(docId, origen) {
  const servicio = window.TrabajadoresDocumentosService;
  if (!docId || !servicio || document.getElementById('trabajador-estado-dialog')) return;

  const nombre = origen?.dataset.nombreDocumento || 'Documento sin nombre';
  const dialog = document.createElement('dialog');
  try {
    const confirmado = await trabajadorConfirmarEstado(null, false, dialog, {
      titulo: 'Eliminar documento',
      mensaje: `¿Deseas eliminar «${nombre}»? El archivo se eliminará definitivamente de Storage.`,
      destructivo: true,
      mostrarCerrar: true
    });
    if (!confirmado) return;

    try {
      await servicio.eliminarDocumento(docId);
      mostrarAvisoTrabajador('✅ Documento eliminado correctamente.');
    } catch (e) {
      console.error('Error eliminando documento del trabajador:', e);
      mostrarErrorTrabajador('⚠️ ' + mensajeErrorDocumento(e));
      if (dialog.open) await trabajadorConfirmarEstado(null, false, dialog, {
        titulo: 'Eliminar documento',
        mensaje: `Documento: ${nombre}. ` + mensajeErrorDocumento(e) +
          ' Cancela y revisa el estado antes de volver a intentarlo.',
        bloqueado: true, error: true, destructivo: true, mostrarCerrar: true
      });
    }

    await trabajadoresCargarDocumentos(true);
  } finally {
    if (dialog.open) dialog.close();
    dialog.remove();
    if (origen?.isConnected) origen.focus();
    else document.querySelector('#trabajador-documentos-lista button, #' + TRABAJADOR_FICHA_ID + ' button')?.focus();
  }
}

// Traducción de errores a mensajes amigables. NUNCA se muestran SQL,
// policies, paths, UUID internos ni el texto crudo de Supabase.
// e.mensajeUsuario sólo lo define el service con mensajes propios ya
// seguros.
function mensajeErrorDocumento(e) {
  if (e && typeof e.mensajeUsuario === 'string' && e.mensajeUsuario.trim() !== '') {
    return e.mensajeUsuario;
  }

  const codigo = e && e.code ? String(e.code) : '';
  const texto = e && e.message ? String(e.message) : '';

  if (codigo === '42501' || /row-level security|permission denied|not authorized|forbidden|status code: 403|status code: 401/i.test(texto)) {
    return 'No tienes permisos para gestionar documentos de trabajadores. Contacta al administrador.';
  }
  if (codigo === 'PGRST116' || /no rows returned|not found|does not exist/i.test(texto)) {
    return 'El documento ya no está disponible. Actualiza la lista.';
  }
  if (/Failed to fetch|NetworkError|network/i.test(texto)) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión.';
  }
  return 'La operación con documentos no se pudo completar. Intenta nuevamente.';
}

// Aviso breve de error (toast rojo). Se usa sólo con mensajes ya
// traducidos: jamás se imprime el error crudo ni una signed URL.
function mostrarErrorTrabajador(texto) {
  let toast = document.getElementById('trabajadores-toast-error');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'trabajadores-toast-error';
    toast.className = 'fixed bottom-6 right-6 z-[100] px-4 py-3 rounded-2xl shadow-2xl text-xs font-bold bg-rose-600 text-white transition-all';
    document.body.appendChild(toast);
  }
  toast.textContent = texto;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}
