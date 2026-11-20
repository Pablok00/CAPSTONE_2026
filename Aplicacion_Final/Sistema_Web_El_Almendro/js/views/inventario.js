// UX-02: las ventanas solo se cierran con controles explícitos o tras guardar.
// Esta regla sustituye las referencias históricas a cierre por fondo o Escape.
// ==========================================================
// VISTA: INVENTARIO — HOTEL EL ALMENDRO (INV-4 / INV-4.1 / INV-5)
// ==========================================================
// Módulo principal de Inventario: encabezado "Inventario" con el total
// real, catálogo en tarjetas compactas (nombre protagonista) con buscador
// por nombre, filtro por bodega (EXCLUSIVAMENTE ubicaciones con
// tipo = 'BODEGA') y paginación de 12 en 12; ficha de producto en modal
// (patrón de modales del proyecto: overlay z-[70] con backdrop, cierre por
// ✕, clic fuera y tecla Escape).
//
// Arquitectura de datos:
// - Todo dato viene de las RPC de lectura de A3 vía InventarioService
//   para el catálogo operativo. INV-6 usa lecturas históricas separadas.
//   (inventario_buscar_productos, inventario_obtener_existencias,
//   inventario_obtener_movimientos, inventario_obtener_bodegas_historicas).
// - INV-5 (escritura operativa): creación de producto, línea base por
//   bodega, entrada y salida. SIEMPRE vía RPC server-side del servicio
//   (inventario_crear_producto, inventario_confirmar_linea_base,
//   inventario_registrar_entrada, inventario_registrar_salida). CERO
//   escrituras directas desde el navegador; autoría y fecha las fija el
//   servidor. Los botones de escritura se muestran sólo si el helper
//   efectivo esAdminOperativoActual() habilita el perfil (Administrador
//   permanente o temporal vigente); eso es comodidad de interfaz, NUNCA
//   seguridad: quien autoriza cada escritura es Supabase. Técnico y demás
//   perfiles quedan en modo consulta.
// - Tras cada escritura exitosa se re-consultan Supabase (existencias,
//   movimientos y catálogo con force); el estado de filtros, búsqueda y
//   página NUNCA se altera.
// - El estado (búsqueda, filtro, página) vive SOLO en memoria
//   (invEstado): NO se usa localStorage como fuente de verdad. Se conserva
//   al abrir/cerrar la ficha y al navegar fuera y volver.
// - NULL siempre se muestra con texto neutro ("Sin dato registrado",
//   "Sin unidad registrada", "Cantidad sin registrar"); jamás se convierte
//   en 0 ni en un valor inventado.
// - Los conteos del Excel histórico se muestran únicamente como "registros
//   en archivo histórico" (procedencia), NUNCA como stock actual. Las
//   cifras de existencia provienen solo de inventario_existencias.
// - INV-5.1 (autocompletado del alta): mientras se escribe el nombre se
//   sugieren productos EXISTENTES reales vía inventario_buscar_productos
//   (p_ubicacion_id null, p_limite 8, p_offset 0) con debounce de 250 ms;
//   si no hay coincidencias por subcadena y el texto es suficiente, se
//   ofrecen nombres parecidos ("¿Buscabas…?") con el catálogo en caché
//   temporal del servicio. Elegir una sugerencia NO crea ni modifica nada:
//   ofrece "Ver ficha existente"; la validación definitiva de duplicados
//   sigue siendo inventario_crear_producto con confirmación explícita.

// ---------------------------------------------------------
// Estado de la vista (en memoria; persiste entre renderizados)
// ---------------------------------------------------------
const invEstado = {
  texto: '',
  ubicacionId: '',
  pagina: 0,
  cargando: false,
  error: null,
  productos: [],
  total: 0,
  bodegas: [],
  bodegasError: null,
  enVuelo: false
};

// Tamaños de página: se leen de las constantes del servicio (una sola
// fuente de verdad) con fallback local por si el orden de carga cambia.
const INV_TAMANO_PAGINA = (window.InventarioService && window.InventarioService.TAMANO_PAGINA_CATALOGO) || 12;
const INV_TAMANO_MOVIMIENTOS = (window.InventarioService && window.InventarioService.TAMANO_PAGINA_FICHA) || 20;

let invBusquedaTimer = null;
let invCatalogoRevision = 0;
let invFichaSolicitada = null;
let invFichaApertura = 0;
// Solo solicitudes pendientes: se retiran al terminar, incluso si fallan.
const invFichaPendientes = Object.create(null);
let invFichaActual = null;
const invFichaPaneles = Object.create(null);
let invHistorialContenedor = null;
let invHistorialObserver = null;
let invFichaMovimientos = { items: [], total: 0, limite: INV_TAMANO_MOVIMIENTOS, cargando: false, error: null };

// INV-5: ficha de productos de la sesión en memoria (solo memoria). Reúne
// los recién creados (resultado CREADO con producto_id) y, desde INV-5.1,
// los productos elegidos como sugerencia del autocompletado (datos REALES
// devueltos por inventario_buscar_productos). Si el catálogo filtrado aún
// no pagina el producto, la ficha usa estos datos reales. Jamás localStorage.
const invProductosRecientes = {};

// INV-5: estado de los modales de escritura (en memoria).
let invNuevoEstado = null;  // alta de producto (form → confirmar → duplicado/homonimo → exito)
let invOpEstado = null;     // línea base / entrada / salida por bodega (form → confirmar)

// Sugerencias bajo demanda, con un resultado reutilizable para el nombre actual.
const INV_SUG_LIMITE = 4;
const INV_SUG_PALABRAS_COMUNES = new Set(['de', 'del', 'la', 'las', 'los', 'para', 'por', 'con', 'sin', 'una', 'uno']);
let invSugToken = 0;
let invSugTexto = '';
let invSugItems = [];
let invSugAbierto = false;
let invSugCargando = false;
let invSugError = false;

// ---------------------------------------------------------
// INV-5: permisos efectivos (mecanismo existente de app.js)
// ---------------------------------------------------------
// Escritura permitida = esAdminOperativoActual() → Administrador permanente
// O Administrador temporal vigente (reloj del servidor). Técnico y otros
// perfiles: falso (solo lectura). Fail closed: si el helper no existe o
// lanza, se asume SIN escritura. Supabase autoriza cada RPC igualmente.
function invPuedeEscribir() {
  try {
    return (typeof esAdminOperativoActual === 'function') && esAdminOperativoActual() === true;
  } catch (e) {
    return false;
  }
}

// Helper de administración permanente; no condiciona la creación de homónimos.
function invEsAdminPermanente() {
  try {
    return (typeof esAdminPermanenteActual === 'function') && esAdminPermanenteActual() === true;
  } catch (e) {
    return false;
  }
}

// Traduce el código de contrato del backend (err.codigo) a un mensaje
// claro; si no hay código conocido, se muestra el mensaje real.
function invMensajeError(e) {
  const codigo = (e && e.codigo) ? String(e.codigo) : null;
  const mapa = {
    INVENTARIO_ACCESO_DENEGADO: 'No tiene permisos para realizar esta operación. Consulte con un administrador.',
    CANTIDAD_INVALIDA: 'La cantidad indicada no es válida.',
    UNIDAD_NO_COINCIDE: 'La unidad elegida no coincide con la registrada en el producto. Revise su ficha; no convierta cantidades para continuar.',
    UNIDAD_REQUERIDA: 'Debe indicar la unidad de medida.',
    UNIDAD_INVALIDA: 'La unidad de medida indicada no es válida.',
    UNIDAD_BLOQUEADA_HISTORIAL: 'La unidad de este producto ya quedó bloqueada por movimientos registrados.',
    LINEA_BASE_EXISTENTE: 'Este producto ya tiene una línea base confirmada en esa bodega.',
    SIN_LINEA_BASE: 'Primero confirme la existencia inicial (línea base) en esa bodega.',
    STOCK_INSUFICIENTE: 'Saldo insuficiente en esa bodega para la salida solicitada.',
    PRODUCTO_DUPLICADO: 'Ya existe un producto con un nombre similar en el catálogo.',
    HOMONIMO_FUERA_CATALOGO: 'El nombre coincide con un registro fuera del catálogo inicial de bodegas.',
    NOMBRE_REQUERIDO: 'Debe indicar el nombre del producto.',
    IDENTIFICADOR_INVALIDO: 'Falta identificar el producto o la bodega. Cierre y vuelva a intentar.'
  };
  if (codigo && mapa[codigo]) return mapa[codigo];
  return (e && e.message) ? String(e.message) : 'No fue posible completar la operación.';
}

// Lectura de un campo del formulario activo (mini-DOM compatible).
function invValor(idCampo) {
  const el = document.getElementById(idCampo);
  return el ? String(el.value || '') : '';
}

// ---------------------------------------------------------
// Render principal (patrón renderPrevencionistaView: setTimeout(..., 0))
// ---------------------------------------------------------
function renderInventarioView() {
  invHistSeccion = 'catalogo';
  // La carga se dispara DESPUÉS de que app.js fije el HTML del contenedor.
  setTimeout(function () {
    invCargarBodegas(true);
    invCargarCatalogo(true);
    invRecuperacionIniciar();
    invRecepcionesActualizar();
  }, 0);

  return `
    <!-- INV-4 / INV-4.1: catálogo de Inventario (solo lectura) -->
    <div class="alm-ui alm-main-page alm-module-page alm-inventory space-y-4 md:space-y-5">

      <!-- INV-4.1: encabezado del módulo: título claro + total real
           SIEMPRE visible (sin duplicarlo luego en la barra de filtros). -->
      ${uiEncabezadoSeccion('Inventario','Consulta el catálogo de productos, revisa sus fichas y filtra por bodega.','box','<span id="inv-total" class="text-sm font-semibold alm-muted">' + invTotalHTML() + '</span>')}

      <div id="inv-entradas-pendientes" aria-live="polite"></div>
      <nav aria-label="Secciones de Inventario" class="alm-catalog-tabs flex flex-wrap gap-2">
        <button id="inv-tab-catalogo" aria-pressed="true" onclick="invCambiarSeccion('catalogo')" class="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-bold bg-blue-600 text-white">Catálogo de productos</button>
        ${invHistPuedeConsultar() ? '<button id="inv-tab-historico" aria-pressed="false" onclick="invCambiarSeccion(\'historico\')" class="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-bold">Histórico y trazabilidad</button>' : ''}
      </nav>
      <div id="inv-seccion-catalogo" class="space-y-4">
      <div class="alm-panel alm-filter-panel bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-5 shadow-sm">
        <div class="alm-inv-filtros">
          <div class="min-w-0">
            <label for="inv-busqueda" class="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Buscar producto</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">🔍</span>
              <input id="inv-busqueda" type="search" autocomplete="off"
                placeholder="Escriba un nombre de producto…"
                value="${invEsc(invEstado.texto)}"
                oninput="invOnBuscar(this.value)"
                class="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60" />
            </div>
          </div>
          <div class="min-w-0">
            <label for="inv-filtro-bodega" class="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Bodega</label>
            <select id="inv-filtro-bodega" onchange="invOnFiltrarBodega(this.value)"
              ${invEstado.bodegas.length === 0 ? 'disabled' : ''}
              class="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/60 disabled:opacity-60 disabled:cursor-not-allowed">
              ${invOpcionesBodegasHTML()}
            </select>
          </div>
          ${invPuedeEscribir() ? `
          <div class="alm-inv-acciones">
            <button type="button" onclick="mntAbrirAltaUbicacion('inventario')" class="alm-btn-primary px-4 py-2">Agregar bodega</button>
            <button type="button" id="inv-nuevo-producto" onclick="invAbrirModalNuevo()"
              title="Crear un producto nuevo en el catálogo del Inventario"
              class="alm-btn-primary px-4 py-2">Agregar producto</button>
          </div>` : ''}
        </div>
        <div id="inv-contador" class="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">${invContadorHTML()}</div>
      </div>

      <div id="inv-listado">${invListadoHTML()}</div>
      <div id="inv-paginacion">${invPaginacionHTML()}</div>
      </div>
      <div id="inv-seccion-historico" class="hidden"></div>
    </div>`;
}

// ---------------------------------------------------------
// Escape de toda cadena proveniente de datos (patrón mntEsc)
// ---------------------------------------------------------
function invEsc(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Fecha/hora del evento → texto local (patrón mntFechaHoraRevisionTexto):
// created_at/fecha salen del servidor; si es ilegible → texto neutro.
function invFechaHora(iso) {
  return formatearFechaCL(iso,{hora:true,vacio:'Fecha no registrada'});
}

// ---------------------------------------------------------
// Filtros y paginación (eventos de la barra de catálogo)
// ---------------------------------------------------------
function invOnBuscar(valor) {
  if (invBusquedaTimer) clearTimeout(invBusquedaTimer);
  // Debounce de 350 ms: evita una RPC por tecla presionada.
  invBusquedaTimer = setTimeout(function () {
    invBusquedaTimer = null;
    const texto = ((valor === null || valor === undefined) ? '' : String(valor)).trim();
    if (texto === invEstado.texto) return;
    invEstado.texto = texto;
    invEstado.pagina = 0;
    invCargarCatalogo();
  }, 350);
}

function invOnFiltrarBodega(valor) {
  const id = (valor === null || valor === undefined) ? '' : String(valor);
  if (id === invEstado.ubicacionId) return;
  invEstado.ubicacionId = id;
  invEstado.pagina = 0;
  invCargarCatalogo();
}

function invCambiarPagina(delta) {
  const totalPaginas = invTotalPaginas();
  const nueva = invEstado.pagina + (Number(delta) || 0);
  if (nueva < 0 || nueva >= totalPaginas || nueva === invEstado.pagina) return;
  invEstado.pagina = nueva;
  invCargarCatalogo();
}

function invTotalPaginas() {
  const total = Number(invEstado.total) || 0;
  return Math.max(1, Math.ceil(total / INV_TAMANO_PAGINA));
}

function invLimpiarFiltros() {
  if (invBusquedaTimer) { clearTimeout(invBusquedaTimer); invBusquedaTimer = null; }
  invEstado.texto = '';
  invEstado.ubicacionId = '';
  invEstado.pagina = 0;
  const inp = document.getElementById('inv-busqueda');
  if (inp) inp.value = '';
  invPintarFiltroBodegas();
  invCargarCatalogo(true);
}

function invReintentarCatalogo() {
  invCargarCatalogo(true);
}

// ---------------------------------------------------------
// Carga del catálogo (anti doble clic / anti carriles)
// ---------------------------------------------------------
async function invCargarCatalogo(force) {
  if (invEstado.enVuelo) {
    if (force === true) ++invCatalogoRevision;
    return;
  }
  const revision = invCatalogoRevision;
  invEstado.enVuelo = true;
  invEstado.cargando = true;
  invEstado.error = null;
  invPintarListado();

  let paginaCorregida = false;
  try {
    if (!window.InventarioService) throw new Error('InventarioService no está disponible.');
    const res = await window.InventarioService.buscarProductos({
      texto: invEstado.texto,
      ubicacionId: invEstado.ubicacionId,
      limite: INV_TAMANO_PAGINA,
      offset: invEstado.pagina * INV_TAMANO_PAGINA
    }, force === true);

    if (revision !== invCatalogoRevision) {
      paginaCorregida = true;
    } else if (res.productos.length === 0 && res.total > 0 && invEstado.pagina > 0) {
      // La página quedó fuera de rango (p. ej. el catálogo cambió tras un
      // refresco): se vuelve a la primera página en vez de mostrar un
      // vacío engañoso.
      invEstado.pagina = 0;
      paginaCorregida = true;
    } else {
      invEstado.productos = res.productos;
      invEstado.total = res.total;
    }
  } catch (e) {
    invEstado.error = (e && e.message) ? e.message : 'No fue posible cargar el catálogo de productos.';
    invEstado.productos = [];
    invEstado.total = 0;
  } finally {
    invEstado.enVuelo = false;
    invEstado.cargando = false;
  }

  if (revision !== invCatalogoRevision) return invCargarCatalogo(true);
  invPintarListado();
  if (paginaCorregida) return invCargarCatalogo(force);
}

async function invCargarBodegas(force) {
  try {
    if (!window.InventarioService) return;
    const bodegas = await window.InventarioService.getBodegas(force === true);
    invEstado.bodegas = Array.isArray(bodegas) ? bodegas : [];
    invEstado.bodegasError = null;
  } catch (e) {
    // INV-4.1: SIN degradación a "todas las ubicaciones". El filtro queda
    // deshabilitado con estado de error; el catálogo sigue operando.
    invEstado.bodegas = [];
    invEstado.bodegasError = (e && e.message) ? e.message : 'No fue posible cargar las bodegas.';
    console.warn('INV-4: no fue posible cargar el desplegable de bodegas:', e);
  }
  invPintarFiltroBodegas();
}

// ---------------------------------------------------------
// Repintado por zonas (el buscador NO se re-renderiza: conserva el foco)
// ---------------------------------------------------------
function invPintarListado() {
  const listado = document.getElementById('inv-listado');
  if (listado) listado.innerHTML = invListadoHTML();
  const paginacion = document.getElementById('inv-paginacion');
  if (paginacion) paginacion.innerHTML = invPaginacionHTML();
  const contador = document.getElementById('inv-contador');
  if (contador) contador.innerHTML = invContadorHTML();
  const total = document.getElementById('inv-total');
  if (total) total.innerHTML = invTotalHTML();
}

function invPintarFiltroBodegas() {
  const sel = document.getElementById('inv-filtro-bodega');
  if (!sel) return;
  const lista = Array.isArray(invEstado.bodegas) ? invEstado.bodegas : [];
  const ids = lista.map(function (b) { return String(b.id); });
  // INV-4.1: una selección que ya no corresponde a una bodega registrada
  // se limpia (el filtro solo admite ubicaciones con tipo = 'BODEGA').
  if (invEstado.ubicacionId && !invEstado.bodegasError && ids.indexOf(String(invEstado.ubicacionId)) === -1) {
    invEstado.ubicacionId = '';
    invEstado.pagina = 0;
    sel.innerHTML = invOpcionesBodegasHTML();
    invCargarCatalogo();
    return;
  }
  sel.innerHTML = invOpcionesBodegasHTML();
  // INV-4.1: filtro inhabilitado ante error de carga o ausencia de bodegas
  // (sin degradar a "todas las ubicaciones").
  const inactivo = Boolean(invEstado.bodegasError) || lista.length === 0;
  sel.disabled = inactivo;
  sel.title = invEstado.bodegasError
    ? 'No fue posible cargar las bodegas: ' + invEstado.bodegasError
    : (inactivo ? 'Sin bodegas registradas' : '');
}

// ---------------------------------------------------------
// HTML puro del listado (probable por el harness INV-4)
// ---------------------------------------------------------
function invOpcionesBodegasHTML() {
  // INV-4.1: solo bodegas reales (ubicaciones.tipo = 'BODEGA'). Sin
  // degradación a otras ubicaciones ni opciones fuera de la lista.
  if (invEstado.bodegasError) {
    return '<option value="" selected>Bodegas no disponibles (error de carga)</option>';
  }
  const lista = Array.isArray(invEstado.bodegas) ? invEstado.bodegas : [];
  if (lista.length === 0) {
    return '<option value="">Sin bodegas registradas</option>';
  }
  let opciones = '<option value="">Todas las bodegas</option>';
  lista.forEach(function (b) {
    if (!b || !b.id) return;
    const esSeleccion = String(b.id) === String(invEstado.ubicacionId);
    opciones += '<option value="' + invEsc(b.id) + '"' + (esSeleccion ? ' selected' : '') + '>' +
      invEsc(b.nombre) + '</option>';
  });
  return opciones;
}

// INV-4.1: el total REAL vive en el encabezado (#inv-total); la línea de
// contador solo aporta contexto (página, búsqueda y bodega), sin duplicar.
function invTotalHTML() {
  if (invEstado.cargando) return 'Cargando catálogo…';
  if (invEstado.error) return 'Total no disponible';
  const total = Number(invEstado.total) || 0;
  return total + (total === 1 ? ' producto' : ' productos');
}

function invContadorHTML() {
  if (invEstado.cargando) return 'Cargando catálogo…';
  if (invEstado.error) return 'Sin información por un error de carga.';
  const partes = [];
  if (Number(invEstado.total) > INV_TAMANO_PAGINA) {
    partes.push('Página ' + (invEstado.pagina + 1) + ' de ' + invTotalPaginas());
  }
  if (invEstado.texto) partes.push('Búsqueda: “' + invEsc(invEstado.texto) + '”');
  if (invEstado.ubicacionId) {
    const bodega = (invEstado.bodegas || []).find(function (b) {
      return b && String(b.id) === String(invEstado.ubicacionId);
    });
    partes.push('Bodega: ' + (bodega ? invEsc(bodega.nombre) : 'seleccionada'));
  }
  if (partes.length === 0) return ' ';
  return partes.join(' · ');
}

function invEsqueletoHTML() {
  return uiCargandoHTML();
}

function invListadoHTML() {
  if (invEstado.cargando) return invEsqueletoHTML();

  if (invEstado.error) {
    return `
      <div class="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-8 text-center">
        <div class="text-3xl mb-2">⚠️</div>
        <p class="text-sm font-semibold text-rose-700 dark:text-rose-300">No fue posible cargar el catálogo</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${invEsc(invEstado.error)}</p>
        <button type="button" onclick="invReintentarCatalogo()"
          class="mt-3 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">Reintentar</button>
      </div>`;
  }

  if (!invEstado.productos || invEstado.productos.length === 0) {
    const hayFiltros = Boolean(invEstado.texto || invEstado.ubicacionId);
    return `
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
        <div class="text-3xl mb-2">📦</div>
        <p class="text-sm font-semibold text-slate-600 dark:text-slate-300">No se encontraron productos</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Ajuste la búsqueda o el filtro de bodega.</p>
        ${hayFiltros ? `<button type="button" onclick="invLimpiarFiltros()"
          class="mt-3 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">Limpiar filtros</button>` : ''}
      </div>`;
  }

  return `<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">` +
    invEstado.productos.map(invTarjetaHTML).join('') + `</div>`;
}

// Una tarjeta por producto (una sola fila por producto aunque esté en
// varias bodegas: la RPC de buscar ya agrega por producto).
// INV-4.1: nombre protagonista (texto mayor, 2 líneas, título completo en
// tooltip sin modificar el texto original de Supabase); SIN badges de
// procedencia ni "Histórico" ni "Sin unidad registrada" (la procedencia
// detallada vive en la ficha); la unidad solo se muestra si está registrada.
function invTarjetaHTML(p) {
  const prod = p || {};
  const id = (prod.producto_id === null || prod.producto_id === undefined) ? '' : String(prod.producto_id);
  const nombreTexto = (prod.nombre && String(prod.nombre).trim() !== '')
    ? String(prod.nombre) : 'Sin nombre registrado';
  const conUnidad = (prod.unidad_medida !== null && prod.unidad_medida !== undefined &&
    String(prod.unidad_medida).trim() !== '');
  const unidad = conUnidad ? 'Unidad: ' + invEsc(prod.unidad_medida) : '';
  // Único chip informativo: distingue productos con conteo operativo
  // verificado (no es una etiqueta repetitiva por producto del catálogo).
  const chipExistencia = (prod.tiene_existencia_operativa === true)
    ? '<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">Con existencia verificada</span>'
    : '';

  return `
    <button type="button" onclick="invAbrirFicha('${invEsc(id)}')" ${id ? '' : 'disabled'}
      title="${invEsc(nombreTexto)}"
      class="alm-record-card text-left flex flex-col h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 hover:border-blue-400 dark:hover:border-blue-700 hover:shadow-md transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
      <h3 class="font-semibold text-[15px] leading-snug text-slate-800 dark:text-slate-100 line-clamp-2">${invEsc(nombreTexto)}</h3>
      ${unidad ? `<p class="text-xs text-slate-400 dark:text-slate-500 mt-1.5">${unidad}</p>` : ''}
      ${invPresentacionHTML(prod)}
      ${chipExistencia ? `<div class="flex flex-wrap gap-1.5 mt-2">${chipExistencia}</div>` : ''}
      <span class="inline-block mt-auto pt-3 text-xs font-bold text-blue-600 dark:text-blue-400">Ver ficha</span>
    </button>`;
}

function invEtiquetaOrigen(origen) {
  if (origen === 'CATALOGO_INICIAL') {
    return {
      texto: 'Catálogo inicial',
      clases: 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
    };
  }
  if (origen === 'SISTEMA') {
    return {
      texto: 'Creado en sistema',
      clases: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
    };
  }
  return {
    texto: 'Origen no registrado',
    clases: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
  };
}

function invPaginacionHTML() {
  if (invEstado.cargando || invEstado.error) return '';
  if (!invEstado.productos || invEstado.productos.length === 0) return '';

  const totalPaginas = invTotalPaginas();
  const enPrimera = invEstado.pagina <= 0;
  const enUltima = invEstado.pagina >= totalPaginas - 1;
  const clasesBase = 'px-4 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800';

  return `
    <div class="flex items-center justify-between gap-3">
      <button type="button" onclick="invCambiarPagina(-1)" ${enPrimera ? 'disabled' : ''}
        class="${clasesBase}">‹ Anterior</button>
      <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">Página ${invEstado.pagina + 1} de ${totalPaginas}</span>
      <button type="button" onclick="invCambiarPagina(1)" ${enUltima ? 'disabled' : ''}
        class="${clasesBase}">Siguiente ›</button>
    </div>`;
}

// ---------------------------------------------------------
// Modal de ficha del producto (patrón overlay del proyecto)
// ---------------------------------------------------------
function invCrearModalFicha() {
  let overlay = document.getElementById('inv-modal-ficha');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'inv-modal-ficha';
  overlay.className = 'hidden fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[70] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto cursor-pointer';
  overlay.innerHTML = `
    <div id="inv-ficha-contenido" onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-3xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto custom-scrollbar cursor-default my-auto text-slate-800 dark:text-slate-100">
    </div>`;
  overlay.addEventListener('click', function (ev) {
    // UX-02: fondo sin cierre.

  });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', invManejarTeclaFicha);
  return overlay;
}

function invManejarTeclaFicha(ev) {
  if (!ev || ev.key !== 'Escape') return;
  // Las sugerencias son un desplegable, no un modal.
  if (invSugAbierto) invSugCerrar();
  // UX-02: ni formularios, ni avisos de descarte, ni fichas se cierran.

}

function invCerrarFicha() {
  invHistorialLiberar();
  if (invPreviewContexto?.tipo === 'producto') invCerrarPrevisualizacion();
  ++invFichaApertura;
  invFichaSolicitada = null;
  const overlay = document.getElementById('inv-modal-ficha');
  if (overlay) overlay.classList.add('hidden');
  // El catálogo de detrás NO se repinta: conserva búsqueda, filtro y página.
}

async function invAbrirFicha(productoId, force) {
  const id = String(productoId || '').trim();
  if (!id) return;
  if (invPreviewContexto?.tipo === 'producto') invCerrarPrevisualizacion();
  const apertura = ++invFichaApertura;

  invFichaSolicitada = id;
  invFichaActual = null;
  invFichaMovimientos = { items: [], total: 0, limite: INV_TAMANO_MOVIMIENTOS, cargando: false, error: null };

  const overlay = invCrearModalFicha();
  if (!overlay) return;
  overlay.classList.remove('hidden');
  invPintarFichaCargando();

  try {
    if (!window.InventarioService) throw new Error('InventarioService no está disponible.');
    // La recuperación puede abrir un UUID fuera de la página del catálogo.
    // No renderizar la ausencia de carga como ausencia real de sus atributos.
    const producto = (invEstado.productos || []).find(function (p) {
      return p && String(p.producto_id) === id;
    }) || invProductosRecientes[id] || null;

    let carga = !force && invFichaPendientes[id];
    if (!carga) {
      carga = { historialListo: false, fallida: false };
      carga.principales = Promise.all([
        window.InventarioService.obtenerExistencias(id, force === true),
        window.InventarioService.obtenerBodegasHistoricas(id, force === true),
        (producto && ['nombre', 'unidad_medida', 'presentacion', 'origen_registro'].every(campo => Object.prototype.hasOwnProperty.call(producto, campo))
          ? Promise.resolve(producto)
          : window.InventarioService.obtenerProductoActual(id)).then(function (actualizado) {
          if (!actualizado || actualizado.producto_id !== id || !['nombre', 'unidad_medida', 'presentacion', 'origen_registro'].every(campo => Object.prototype.hasOwnProperty.call(actualizado, campo))) {
            throw new Error('No se pudieron comprobar los datos del producto. Reintente cargar la ficha.');
          }
          return actualizado;
        })
      ]);
      carga.movimientos = window.InventarioService.obtenerMovimientos(
        id, { limite: INV_TAMANO_MOVIMIENTOS, offset: 0 }, force === true
      ).then(function (res) { carga.historialListo = true; return res; });
      invFichaPendientes[id] = carga;
      const limpiar = function () {
        if (invFichaPendientes[id] === carga) delete invFichaPendientes[id];
      };
      // Adjuntar ambos manejadores inmediatamente también evita rechazos
      // sin manejar si el historial falla antes de las otras lecturas.
      Promise.all([carga.principales, carga.movimientos]).then(limpiar, function () {
        carga.fallida = true;
        limpiar();
      });
    }
    const principales = carga.principales.then(function (datos) {
      if (apertura === invFichaApertura && invFichaSolicitada === id) invProductosRecientes[id] = datos[2];
      if (apertura === invFichaApertura && invFichaSolicitada === id && !carga.historialListo && !carga.fallida) {
        invFichaActual = { producto_id: id, producto: datos[2],
          existencias: datos[0], bodegasHistoricas: datos[1] };
        invFichaMovimientos.cargando = true;
        invFichaMovimientos.inicial = true;
        invPintarFicha();
      }
      return datos;
    });
    const datos = await Promise.all([principales, carga.movimientos]);
    const resultados = [datos[0][0], datos[0][1], datos[1]];

    if (invFichaSolicitada !== id || apertura !== invFichaApertura) return;

    invFichaActual = {
      producto_id: id,
      producto: datos[0][2],
      existencias: resultados[0],
      bodegasHistoricas: resultados[1]
    };
    invFichaMovimientos = {
      items: resultados[2].movimientos,
      total: resultados[2].total,
      limite: INV_TAMANO_MOVIMIENTOS,
      cargando: false,
      error: null,
      formatosError: resultados[2].formatosError || null
    };
    invPintarFicha();
  } catch (e) {
    if (invFichaSolicitada !== id || apertura !== invFichaApertura) return;
    invPintarFichaError(id, (e && e.message) || 'No fue posible cargar la ficha del producto.');
  }
}

async function invCargarMasMovimientos() {
  const actual = invFichaActual;
  if (!actual || invFichaMovimientos.cargando) return;
  const id = String(actual.producto_id);
  const apertura = invFichaApertura;
  const desde = invFichaMovimientos.items.length;

  invFichaMovimientos.cargando = true;
  invFichaMovimientos.error = null;
  invPintarFicha();

  try {
    if (!window.InventarioService) throw new Error('InventarioService no está disponible.');
    const res = await window.InventarioService.obtenerMovimientos(id, { limite: INV_TAMANO_MOVIMIENTOS, offset: desde }, true);
    if (invFichaSolicitada !== id || apertura !== invFichaApertura) return;
    const ids = new Set(invFichaMovimientos.items.map(m => m.movimiento_id));
    if (res.total !== invFichaMovimientos.total || res.movimientos.some(m => ids.has(m.movimiento_id))) {
      await invAbrirFicha(id, true); // El historial cambió: reiniciar antes de mezclar páginas.
      return;
    }
    invFichaMovimientos.items = invFichaMovimientos.items.concat(res.movimientos);
    invFichaMovimientos.total = res.total;
    invFichaMovimientos.formatosError = res.formatosError || invFichaMovimientos.formatosError || null;
  } catch (e) {
    if (invFichaSolicitada !== id || apertura !== invFichaApertura) return;
    invFichaMovimientos.error = (e && e.message) || 'No fue posible cargar más movimientos.';
  } finally {
    if (apertura === invFichaApertura) invFichaMovimientos.cargando = false;
  }
  if (invFichaSolicitada === id && apertura === invFichaApertura) invPintarFicha();
}

function invPintarFichaCargando() {
  const cont = document.getElementById('inv-ficha-contenido');
  if (!cont) return;
  cont.innerHTML = `
    <div class="flex items-start justify-between gap-3 mb-4">
      <div class="h-6 w-2/3 rounded bg-slate-200 dark:bg-slate-800 animate-pulse"></div>
      <button type="button" onclick="invCerrarFicha()"
        class="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none" title="Cerrar">✕</button>
    </div>
    <div class="space-y-3">
      <p role="status" class="text-sm text-slate-500 dark:text-slate-400">Cargando ficha del producto…</p>
      <div class="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-800 animate-pulse"></div>
      <div class="h-20 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse"></div>
      <div class="h-20 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse"></div>
      <div class="h-24 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse"></div>
    </div>`;
}

function invPintarFichaError(productoId, mensaje) {
  const cont = document.getElementById('inv-ficha-contenido');
  if (!cont) return;
  cont.innerHTML = `
    <div class="flex items-start justify-between gap-3 mb-4">
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Ficha del producto</h2>
      <button type="button" onclick="invCerrarFicha()"
        class="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none" title="Cerrar">✕</button>
    </div>
    <div class="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl p-6 text-center">
      <div class="text-2xl mb-2">⚠️</div>
      <p class="text-sm font-semibold text-rose-700 dark:text-rose-300">No fue posible cargar la ficha</p>
      <p class="text-xs text-rose-600/80 dark:text-rose-300/80 mt-1">${invEsc(mensaje)}</p>
      <button type="button" onclick="invAbrirFicha('${invEsc(productoId)}', true)"
        class="mt-3 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">Reintentar</button>
    </div>`;
}

function invPintarFicha() {
  const cont = document.getElementById('inv-ficha-contenido');
  if (!cont || !invFichaActual) return;
  const actual = invFichaActual;
  const prod = actual.producto || {};
  cont.innerHTML = invFichaHTML({
    producto_id: actual.producto_id,
    nombre: (prod.nombre === undefined || prod.nombre === null || String(prod.nombre).trim() === '')
      ? 'Sin nombre registrado' : prod.nombre,
    unidad_medida: (prod.unidad_medida === undefined) ? null : prod.unidad_medida,
    presentacion: prod.presentacion ?? null,
    origen_registro: (prod.origen_registro === undefined) ? null : prod.origen_registro,
    material_id: (prod.material_id === undefined) ? null : prod.material_id,
    asociado_historico: prod.asociado_historico,
    tiene_existencia_operativa: prod.tiene_existencia_operativa,
    existencias: actual.existencias,
    bodegasHistoricas: actual.bodegasHistoricas,
    movimientos: invFichaMovimientos.items,
    movimientosTotal: invFichaMovimientos.total,
    movimientosCargando: invFichaMovimientos.cargando,
    movimientosInicialCargando: invFichaMovimientos.inicial === true,
    movimientosError: invFichaMovimientos.error,
    formatosError: invFichaMovimientos.formatosError
  });
  invHistorialPreparar(cont);
}

function invSeccionFichaHTML(titulo, contenidoHTML) {
  return `
    <section class="mb-4">
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">${titulo}</h3>
      ${contenidoHTML}
    </section>`;
}

function invEtiquetaTipoMovimiento(tipo) {
  const clasesBase = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700';
  if (tipo === 'LINEA_BASE') {
    return { texto: 'Línea base', clases: 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60' };
  }
  if (tipo === 'ENTRADA') {
    return { texto: 'Entrada', clases: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60' };
  }
  if (tipo === 'SALIDA') {
    return { texto: 'Salida', clases: 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60' };
  }
  if (tipo === 'AJUSTE') {
    return { texto: 'Ajuste', clases: 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60' };
  }
  if (tipo === null || tipo === undefined || String(tipo).trim() === '') {
    return { texto: 'Movimiento sin tipo', clases: clasesBase };
  }
  return { texto: invEsc(String(tipo)), clases: clasesBase };
}

// ---------------------------------------------------------
// INV-5: bodegas de la ficha y acciones por bodega
// ---------------------------------------------------------
// Unión de las bodegas relevantes del producto para la sección de
// existencias/acciones: filas con existencia verificada + bodegas
// históricas + bodegas reales del filtro (tipo = 'BODEGA'). Sin uuid
// fijos; deduplicado por id. El orden conserva primero las históricas.
function invUnirBodegasFicha(bodegasHistoricas, existencias) {
  const lista = [];
  const indices = {};

  function agregar(id, nombre, existencia, historica) {
    const llave = (id !== null && id !== undefined && String(id) !== '')
      ? String(id) : ('sin-id-' + lista.length);
    if (indices[llave] !== undefined) {
      const previa = lista[indices[llave]];
      if (existencia && !previa.existencia) previa.existencia = existencia;
      if (historica) previa.historica = true;
      if (!previa.nombre && nombre) previa.nombre = nombre;
      return;
    }
    indices[llave] = lista.length;
    lista.push({
      ubicacion_id: (id === null || id === undefined) ? null : id,
      ubicacion_nombre: nombre || '',
      existencia: existencia || null,
      historica: historica === true
    });
  }

  (Array.isArray(bodegasHistoricas) ? bodegasHistoricas : []).forEach(function (b) {
    agregar((b && b.ubicacion_id) || null, (b && b.ubicacion_nombre) || '', null, true);
  });
  (Array.isArray(existencias) ? existencias : []).forEach(function (e) {
    agregar((e && e.ubicacion_id) || null, (e && e.ubicacion_nombre) || '', e, false);
  });
  (Array.isArray(invEstado.bodegas) ? invEstado.bodegas : []).forEach(function (b) {
    agregar((b && b.id) || null, (b && b.nombre) || '', null, false);
  });
  return lista.sort((a,b) => Number(b.existencia?.linea_base_confirmada === true) - Number(a.existencia?.linea_base_confirmada === true));
}

// Fila por bodega de la ficha (INV-5.2: botones según estado de línea base):
// - Línea base CONFIRMADA (fila de existencia con linea_base_confirmada
//   === true) → cantidad real (0 incluido, que NO altera la línea base) +
//   chip "Con línea base" + botones "＋ Entrada" y "− Salida" (solo perfiles
//   con escritura). La línea base NUNCA se vuelve a ofrecer.
// - Sin línea base confirmada (sin fila de existencia, o fila con
//   linea_base_confirmada en false/null/u otro valor no booleano) → chips de
//   estado + ÚNICAMENTE "Confirmar existencia inicial" (conteo físico real,
//   0 incluido; jamás cantidades del Excel histórico).
// La condición es estricta: NULL, 0, false o cadenas de texto NO habilitan
// entradas/salidas. Los botones abren el modal de operación; la RPC del
// servidor valida y autoriza cada escritura (la UI solo evita callejones
// sin salida).
function invFilaBodegaHTML(productoId, bodega, unidad, puedeEscribir) {
  const b = bodega || {};
  const e = b.existencia;
  const idB = (b.ubicacion_id === null || b.ubicacion_id === undefined) ? '' : String(b.ubicacion_id);
  const nombreBruto = (b.ubicacion_nombre && String(b.ubicacion_nombre).trim() !== '')
    ? String(b.ubicacion_nombre) : '';
  const nombreB = nombreBruto ? invEsc(nombreBruto) : 'Sin bodega registrada';

  // INV-5.2: única condición que gobierna los botones de la fila.
  const baseConfirmada = !!(e && e.linea_base_confirmada === true);
  const botonConfirmar = (puedeEscribir && idB)
    ? `<button type="button" onclick="invAbrirOperacion('linea_base','${invEsc(productoId)}','${invEsc(idB)}','${invEsc(nombreBruto)}')"
        class="shrink-0 text-sm font-bold px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">Confirmar existencia inicial</button>`
    : '';

  if (!e) {
    return `<li class="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5">
        <span class="text-sm font-semibold text-slate-700 dark:text-slate-200">${nombreB}</span>
        <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">Sin línea base registrada</span>
        ${botonConfirmar}
      </li>`;
  }

  const cantidad = (e.cantidad === null || e.cantidad === undefined)
    ? '<span class="text-sm text-slate-500 dark:text-slate-400">Cantidad sin registrar</span>'
    : baseConfirmada
      ? '<div><p class="text-xs font-bold tracking-wider text-slate-500 dark:text-slate-400 mb-1">STOCK ACTUAL</p><p class="flex flex-wrap items-center gap-2"><span class="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">' + invEsc(String(e.cantidad)) + '</span><span class="text-base font-semibold text-slate-600 dark:text-slate-300">' + invEsc(invUnidadCantidadTexto(unidad, e.cantidad)) + '</span></p></div>'
      : '<span class="text-sm text-slate-500 dark:text-slate-400">Cantidad informada (sin confirmar): ' + invEsc(String(e.cantidad)) + ' · ' + invEsc(unidad || 'Sin unidad registrada') + '</span>';
  const chipBase = baseConfirmada
    ? '<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">Línea base confirmada</span>'
    : '<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">Sin línea base registrada</span>';
  const actualizado = e.actualizado_at ? ' · Actualizado: ' + invFechaHora(e.actualizado_at) : '';
  const acciones = !baseConfirmada
    // Sin línea base confirmada: SOLO se puede confirmar la existencia
    // inicial (nunca entrada/salida contra un saldo inexistente).
    ? botonConfirmar
    : (puedeEscribir && idB)
      ? `<span class="flex flex-wrap items-center gap-1.5">
          <button type="button" onclick="invAbrirOperacion('entrada','${invEsc(productoId)}','${invEsc(idB)}','${invEsc(nombreBruto)}')"
            class="text-sm font-bold px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">+ Entrada</button>
          <button type="button" onclick="invAbrirOperacion('salida','${invEsc(productoId)}','${invEsc(idB)}','${invEsc(nombreBruto)}')"
            class="text-sm font-bold px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors">− Salida</button>
        </span>`
      : '';
  return `<li class="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
      <div class="w-full"><span class="text-base font-semibold text-slate-800 dark:text-slate-100">${nombreB}</span></div>
      ${cantidad}
      <div class="flex flex-wrap items-center gap-2">${acciones}</div>
      <div class="w-full flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">${chipBase}${actualizado ? invEsc(actualizado) : ''}</div>
    </li>`;
}
// ---------------------------------------------------------
// Contenido puro de la ficha (probable por el harness INV-4)
// ---------------------------------------------------------
function invFichaHTML(datos) {
  const d = datos || {};
  const nombre = (d.nombre && String(d.nombre).trim() !== '')
    ? invEsc(d.nombre) : 'Sin nombre registrado';
  const unidad = (d.unidad_medida !== null && d.unidad_medida !== undefined && String(d.unidad_medida).trim() !== '')
    ? invEsc(String(d.unidad_medida).trim()) : null;
  const origen = invEtiquetaOrigen(d.origen_registro);

  const bodegasHist = Array.isArray(d.bodegasHistoricas) ? d.bodegasHistoricas : [];
  const existencias = Array.isArray(d.existencias) ? d.existencias : [];
  const movimientos = Array.isArray(d.movimientos) ? d.movimientos : [];
  const movTotal = Number(d.movimientosTotal) || 0;

  // --- Sección 1: bodegas asociadas históricamente (solo procedencia)
  let htmlHistorico = '';
  if (bodegasHist.length > 0) {
    const chips = bodegasHist.map(function (b) {
      const nombreB = (b.ubicacion_nombre && String(b.ubicacion_nombre).trim() !== '')
        ? invEsc(b.ubicacion_nombre) : 'Sin bodega registrada';
      const regs = Number(b.registros_historicos) || 0;
      const archivo = b.archivo_origen ? ' · ' + invEsc(b.archivo_origen) : '';
      return `<span class="inline-flex flex-wrap items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
          ${nombreB} <span class="font-medium opacity-70">· ${regs} ${regs === 1 ? 'registro' : 'registros'} en archivo histórico${archivo}</span>
        </span>`;
    }).join('');
    htmlHistorico = `<div class="flex flex-wrap gap-1.5">${chips}</div>
      <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-2">Los conteos del archivo histórico indican filas importadas; NO representan stock actual.</p>`;
  } else {
    htmlHistorico = '<p class="text-xs text-slate-500 dark:text-slate-400">Sin bodegas asociadas en el histórico.</p>';
  }

  // --- Sección 2: existencias verificadas y acciones por bodega (INV-5)
  // Unión de bodegas relevantes del producto: las que ya tienen existencia
  // verificada, las históricas (procedencia) y las bodegas reales del
  // filtro (tipo = 'BODEGA'), sin duplicados ni uuid fijos.
  const bodegasFicha = invUnirBodegasFicha(bodegasHist, existencias);
  const puedeEscribir = invPuedeEscribir();
  let htmlExistencias = '';
  if (bodegasFicha.length === 0) {
    htmlExistencias = '<p class="text-xs text-slate-500 dark:text-slate-400">Sin existencias verificadas ni bodegas históricas registradas.</p>';
  } else {
    if (existencias.length === 0) {
      htmlExistencias += '<p class="text-xs text-slate-500 dark:text-slate-400">Este producto aún no tiene existencias verificadas: falta registrar la línea base en cada bodega.</p>';
    }
    const filas = bodegasFicha.map(function (b) {
      return invFilaBodegaHTML(d.producto_id, b, d.unidad_medida, puedeEscribir);
    }).join('');
    htmlExistencias += `<ul class="space-y-2 mt-2">${filas}</ul>`;
    if (!puedeEscribir) {
      htmlExistencias += '<p class="text-[11px] text-slate-400 dark:text-slate-500 mt-2">Modo consulta: las acciones de línea base, entrada y salida requieren un administrador vigente.</p>';
    }
  }

  // --- Sección 3: historial de movimientos operativos
  let htmlMovimientos = '';
  if (d.movimientosInicialCargando) {
    htmlMovimientos = '<p role="status" class="text-sm text-slate-500 dark:text-slate-400">Cargando historial de movimientos…</p>';
  } else if (movimientos.length > 0) {
    const ordenados = movimientos.slice().sort(function (a, b) {
      const fa = Date.parse(a.fecha), fb = Date.parse(b.fecha);
      if (Number.isFinite(fa) && Number.isFinite(fb) && fa !== fb) return fb - fa;
      if (Number.isFinite(fa) !== Number.isFinite(fb)) return Number.isFinite(fa) ? -1 : 1;
      const ia = String(a.movimiento_id || ''), ib = String(b.movimiento_id || '');
      return ia === ib ? 0 : ia < ib ? 1 : -1;
    });
    const items = ordenados.map(invMovimientoOperativoHTML).join('');
    const lista = movimientos.length > 2
      ? `<div data-inv-historial="ux071" class="inv-history-scroll custom-scrollbar" style="max-height:24rem;overflow-y:auto;min-height:0" tabindex="0" role="region" aria-label="Movimientos de inventario; desplácese para ver más"><ul class="space-y-2">${items}</ul></div>`
      : `<ul class="space-y-2">${items}</ul>`;
    const restantes = movTotal - movimientos.length;
    const verMas = (restantes > 0)
      ? `<button type="button" onclick="invCargarMasMovimientos()" ${d.movimientosCargando ? 'disabled' : ''}
          class="mt-3 w-full px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
          ${d.movimientosCargando ? 'Cargando…' : 'Ver más movimientos (' + restantes + ' restantes)'}</button>`
      : '';
    const errorMov = d.movimientosError
      ? `<p class="text-[11px] text-rose-600 dark:text-rose-400 mt-2">${invEsc(d.movimientosError)}</p>` : '';
    htmlMovimientos = `${invMovimientosAdvertenciaHTML(movimientos)}<p class="text-xs text-slate-500 dark:text-slate-400 mb-2">Mostrando ${movimientos.length} de ${movTotal} movimientos. ${restantes > 0 ? 'Más recientes entre los consultados; hay movimientos adicionales por consultar.' : 'Más recientes primero.'}</p>${lista}${errorMov}${verMas}`;
  } else if (d.movimientosError) {
    htmlMovimientos = `<p class="text-xs text-rose-600 dark:text-rose-400">${invEsc(d.movimientosError)}</p>
      <button type="button" onclick="invCargarMasMovimientos()" class="mt-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">Reintentar</button>`;
  } else {
    htmlMovimientos = '<p class="text-xs text-slate-500 dark:text-slate-400">Sin movimientos operativos registrados.</p>';
  }

  if (d.formatosError) htmlMovimientos += '<p role="alert" class="text-xs text-amber-700 dark:text-amber-300 mt-2">No se pudo consultar el formato original: ' + invEsc(d.formatosError) + '</p>';

  // --- Sección 4: procedencia del catálogo
  const descripcionOrigen = (d.origen_registro === 'CATALOGO_INICIAL')
    ? 'Producto del catálogo inicial importado desde las bodegas.'
    : (d.origen_registro === 'SISTEMA')
      ? 'Producto creado desde el sistema.'
      : 'Origen no registrado.';
  const vinculoHistorico = (d.material_id || d.asociado_historico === true)
    ? 'Vinculado al histórico de bodegas del Excel.'
    : 'Sin vínculo con el histórico del Excel.';
  const htmlProcedencia = `
    <div class="bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5 space-y-1">
      <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">${origen.texto}</p>
      <p class="text-[11px] text-slate-500 dark:text-slate-400">${descripcionOrigen} ${invEsc(vinculoHistorico)}</p>
    </div>`;

  // --- Cabecera + cierre
  return `
    <div class="sticky top-0 z-10 bg-white dark:bg-slate-900 flex items-start justify-between gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
      <div class="min-w-0">
        <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 leading-snug break-words">${nombre}</h2>
        <div class="flex flex-wrap items-center gap-2 mt-1.5">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${origen.clases}">${origen.texto}</span>
          <span class="text-[11px] text-slate-500 dark:text-slate-400">${unidad ? 'Unidad: ' + unidad : 'Sin unidad registrada'}</span>
        </div>
        ${invPresentacionHTML(d)}
        ${invFichaStockResumenHTML(existencias)}
      </div>
      <button type="button" onclick="invCerrarFicha()"
        class="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none" title="Cerrar">✕</button>
    </div>

    <details data-producto="${invEsc(d.producto_id)}" ontoggle="invFichaPanelCambiar(this,'stock')" ${invFichaPaneles[d.producto_id]?.stock === true ? 'open' : ''} class="mb-3 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
      <summary class="font-bold text-sm cursor-pointer">Stock actual</summary><div class="mt-3">
      ${invSeccionFichaHTML('Existencias operativas verificadas', htmlExistencias)}
      ${invSeccionFichaHTML('Bodegas asociadas históricamente · no son stock actual', htmlHistorico)}
      ${invSeccionFichaHTML('Procedencia del catálogo', htmlProcedencia)}</div>
    </details>
    <details data-producto="${invEsc(d.producto_id)}" ontoggle="invFichaPanelCambiar(this,'historial')" ${invFichaPaneles[d.producto_id]?.historial === true ? 'open' : ''} class="mb-3 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
      <summary class="font-bold text-sm cursor-pointer">Historial</summary><div class="mt-3">${htmlMovimientos}</div>
    </details>
    ${invEsAdminPermanente() && d.origen_registro === 'SISTEMA' ? '<div class="mt-3"><button type="button" data-producto="' + invEsc(d.producto_id) + '" onclick="invAbrirPrevisualizacion(&quot;producto&quot;,this.dataset.producto)" class="text-xs font-bold text-rose-600 dark:text-rose-400 underline py-2">Eliminar producto</button></div>' : ''}

    <div class="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
      <p class="text-[11px] text-slate-400 dark:text-slate-500">${invPuedeEscribir()
        ? 'Las operaciones se registran en el servidor con su usuario como autor.'
        : 'Módulo en modo consulta para su perfil: las acciones de escritura requieren un administrador vigente.'}</p>
      <button type="button" onclick="invCerrarFicha()"
        class="shrink-0 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors">Cerrar</button>
    </div>`;
}

// ---------------------------------------------------------
// INV-5: modal de ALTA DE PRODUCTO (solo perfiles con escritura)
// Flujo: form → confirmar → (duplicado | homónimo) → exito.
// La escritura es SOLO la RPC inventario_crear_producto del servicio;
// el backend detecta duplicados y autoriza con es_administrador_actual().
// La UI conduce la confirmación expresa para ambos tipos de administrador.
// ---------------------------------------------------------
// INV-5.3: guardia de cierre accidental compartida por los formularios de
// alta y de operación. Un clic fuera del panel —incluido el soltar el ratón
// fuera tras comenzar una selección de texto dentro— NUNCA cierra el
// formulario: el cierre es intencional (✕, Cancelar o Escape). Así se evita
// perder lo que el usuario estaba escribiendo.
function invFormNoCierreFuera() { /* deliberadamente vacío */ }

function invCrearModalNuevo() {
  let overlay = document.getElementById('inv-modal-nuevo');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'inv-modal-nuevo';
  overlay.className = 'hidden fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[80] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto';
  overlay.innerHTML = `
    <div id="inv-nuevo-contenido" onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto custom-scrollbar cursor-default my-auto text-slate-800 dark:text-slate-100">
    </div>`;
  // INV-5.3: el clic fuera (o el soltar tras una selección de texto) ya NO
  // cierra el formulario.
  overlay.addEventListener('click', invFormNoCierreFuera);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', invManejarTeclaFicha);
  return overlay;
}

function invAbrirModalNuevo() {
  // UX, no seguridad: el backend autoriza cada RPC igualmente.
  if (!invPuedeEscribir()) return;
  invSugResetear();
  invNuevoEstado = {
    paso: 'form', nombre: '', unidad: '', presentacion: '', productoId: null, registrarInicial:true, cantidadPendiente:false,
    coincidencias: [], error: null, enviando: false, sugerencia: null,
    confirmandoDescarte: false
  };
  const overlay = invCrearModalNuevo();
  if (!overlay) return;
  document.addEventListener('pointerdown', invSugCerrarFuera, true);
  document.addEventListener('focusin', invSugCerrarFuera, true);
  overlay.classList.remove('hidden');
  invNuevoPintar();
  if (!invEstado.bodegas.length || invEstado.bodegasError) invNuevoCambiarInicial();
}

// INV-5.3: cierre forzado (sin confirmación). Se usa cuando no hay nada que
// descartar o cuando la acción ya se completó (p. ej. "Ver ficha" tras crear
// el producto o tras elegir una sugerencia existente).
function invCerrarModalNuevoForzado() {
  document.removeEventListener('pointerdown', invSugCerrarFuera, true);
  document.removeEventListener('focusin', invSugCerrarFuera, true);
  const overlay = document.getElementById('inv-modal-nuevo');
  if (overlay) overlay.classList.add('hidden');
  invNuevoEstado = null;
  invSugResetear(); // INV-5.1: cierra el desplegable y anula consultas en vuelo
}

// INV-5.3: ¿hay datos sin guardar en el alta? El paso de éxito no cuenta (el
// producto ya quedó creado: nada que descartar). Si el formulario está
// visible se sincroniza primero lo tecleado en los inputs (que recién viaja
// a est.nombre/unidad al pulsar "Revisar"), para no dar por vacío un texto
// escrito y cerrar sin avisar.
function invNuevoSucio(est) {
  if (!est) return false;
  if (est.paso === 'exito') return false;
  if (est.paso === 'form') invNuevoLeerFormulario();
  return String(est.nombre || '').trim() !== '' ||
    String(est.unidad || '').trim() !== '' || String(est.presentacion || '').trim() !== '' ||
    est.paso !== 'form' ||
    est.sugerencia != null || est.cantidadPendiente === true || String(est.cantidadInicial || '') !== '';
}

// INV-5.3: cierre intencional protegido (✕, Cancelar o Escape). Si el
// formulario tiene cambios sin guardar pide confirmación antes de descartar
// (nunca cierra directo); si no, cierra. Jamás cierra durante un envío.
function invCerrarModalNuevo() {
  const est = invNuevoEstado;
  if (est && est.enviando) return; // operación en curso: no cerrar
  if (!est || !invNuevoSucio(est)) { invCerrarModalNuevoForzado(); return; }
  est.confirmandoDescarte = true;
  invNuevoPintar(); // muestra el aviso conservando lo escrito en `est`
}

// INV-5.3: "Seguir editando" / Escape con el aviso activo: se conserva
// exactamente lo escrito (est.nombre y est.unidad) y se repinta el formulario.
function invNuevoSeguirEditando() {
  const est = invNuevoEstado;
  if (!est) return;
  est.confirmandoDescarte = false;
  invNuevoPintar();
}

// INV-5.3: "Descartar": cierre confirmado por el usuario.
function invNuevoDescartar() {
  const est = invNuevoEstado;
  if (est && est.enviando) return;
  invCerrarModalNuevoForzado();
}

function invNuevoPintar() {
  const cont = document.getElementById('inv-nuevo-contenido');
  if (cont) cont.innerHTML = invNuevoHTML();
}

function invNuevoLeerFormulario() {
  const est = invNuevoEstado;
  if (!est) return;
  est.nombre = invValor('inv-nuevo-nombre');
  est.presentacion = invValor('inv-nuevo-presentacion');
  invUnidadLeer(est, 'inv-nuevo');
  est.cantidadPendiente = document.getElementById('inv-nuevo-pendiente')?.checked === true;
  est.registrarInicial = !est.cantidadPendiente;
  est.bodegaInicial = invValor('inv-nuevo-bodega');
  est.cantidadInicial = invValor('inv-nuevo-cantidad');
}

function invNuevoPasoConfirmar() {
  const est = invNuevoEstado;
  if (!est || est.enviando) return;
  invSugCerrar(); // INV-5.1: al pasar a confirmar se retira el desplegable
  invNuevoLeerFormulario();
  est.error = null;
  if (!String(est.nombre || '').trim()) {
    est.error = 'Debe indicar el nombre del producto.';
    invNuevoPintar();
    return;
  }
  if (!String(est.unidad || '').trim()) {
    est.error = 'Seleccione una unidad de medida para el producto.';
    invNuevoPintar();
    return;
  }
  if (invUnidadNumerica(est.unidad)) {
    est.error = 'La unidad de medida no puede ser solamente un número. Indique, por ejemplo, Tubo o Unidad.';
    invNuevoPintar();
    return;
  }
  if (Array.from(String(est.presentacion || '').trim()).length > 160) {
    est.error = 'La presentación admite hasta 160 caracteres.'; invNuevoPintar(); return;
  }
  est.confirmacionVariante = false;
  if (est.registrarInicial) {
    if (invEstado.bodegasError || !invEstado.bodegas.some(b => b.id === est.bodegaInicial)) est.error = 'Seleccione una bodega disponible.';
    else if (invCantidadInicial(est.cantidadInicial) === null) est.error = 'Indique una cantidad inicial no negativa. Puede registrar cero.';
    if (!est.error) est.error = invCantidadErrorUnidad(invCantidadInicial(est.cantidadInicial), est.unidad);
    if (est.error) { invNuevoPintar(); return; }
  }
  est.paso = 'confirmar';
  invNuevoPintar();
}

function invNuevoVolver() {
  const est = invNuevoEstado;
  if (!est || est.enviando) return;
  est.paso = 'form';
  est.error = null;
  invNuevoPintar();
}

// Envío a la RPC de creación. confirmarDistinto=true SOLO tras confirmación
// explícita del usuario cuando el backend advirtió DUPLICADO u
// HOMONIMO_FUERA_CATALOGO.
async function invNuevoEnviar(confirmarDistinto) {
  const est = invNuevoEstado;
  if (!est || est.enviando || !invPuedeEscribir()) return;
  if (est.paso !== 'confirmar') return;
  // La primera revisión siempre consulta sin confirmar. Esta guardia es UX;
  // una llamada directa al servicio sigue estando autorizada por la RPC.
  const confirmado = confirmarDistinto === true && est.confirmacionVariante === true && est.respuestaDuplicado?.continuar_permitido === true;
  if (confirmarDistinto === true && !confirmado) return;
  if (est.registrarInicial) {
    est.error = invCantidadErrorUnidad(invCantidadInicial(est.cantidadInicial), est.unidad);
    if (est.error) { invNuevoPintar(); return; }
  }
  est.enviando = true;
  est.error = null;
  invNuevoPintar();
  try {
    if (!window.InventarioService) throw new Error('InventarioService no está disponible.');
    const res = await window.InventarioService.crearProducto({
      nombre: est.nombre,
      unidadMedida: est.unidad,
      confirmarDistinto: confirmado,
      presentacion: String(est.presentacion || '').trim() || null
    });
    if (invNuevoEstado !== est) return; // carril: se cerró/reabrió el modal
    est.enviando = false;
    if (res.resultado === 'CREADO' && res.productoId) {
      est.productoId = res.productoId;
      const unidad = String(est.unidad || '').trim();
      // Respaldo en memoria para la ficha del producto recién creado
      // (datos reales del formulario aceptados por el backend; el origen
      // es SISTEMA por contrato de A4). Jamás localStorage.
      invProductosRecientes[res.productoId] = {
        producto_id: res.productoId,
        nombre: String(est.nombre || '').trim(),
        unidad_medida: unidad === '' ? null : unidad,
        presentacion: String(est.presentacion || '').trim() || null,
        origen_registro: 'SISTEMA',
        material_id: null,
        asociado_historico: false,
        tiene_existencia_operativa: false
      };
      est.paso = 'exito';
      if (est.registrarInicial) await invNuevoGuardarInicial(est);
      if (invNuevoEstado !== est) return;
      // Reconsulta Supabase tras la escritura (conserva filtros y página).
      invCargarCatalogo(true);
    } else if (res.resultado === 'DUPLICADO') {
      est.coincidencias = res.coincidencias;
      est.respuestaDuplicado = res;
      est.confirmacionVariante = false;
      est.paso = 'duplicado';
    } else if (res.resultado === 'HOMONIMO_FUERA_CATALOGO') {
      est.coincidencias = res.coincidencias;
      est.respuestaDuplicado = res;
      est.confirmacionVariante = false;
      est.paso = 'homonimo';
    } else {
      est.error = 'El servidor no devolvió un resultado reconocido' +
        (res.resultado ? ' (' + String(res.resultado) + ').' : '.');
    }
    invNuevoPintar();
  } catch (e) {
    if (invNuevoEstado !== est) return;
    est.enviando = false;
    est.error = invMensajeError(e);
    invNuevoPintar();
  }
}

// "Continuar: es un producto distinto" / "Continuar" del homónimo.
function invNuevoContinuarDistinto() {
  const est = invNuevoEstado;
  if (!est || est.enviando || !['duplicado','homonimo'].includes(est.paso)) return;
  if (est.respuestaDuplicado?.continuar_permitido !== true) return;
  est.confirmacionVariante = true;
  est.paso = 'confirmar';
  est.error = null;
  invNuevoPintar();
}

function invNuevoVerFicha() {
  const est = invNuevoEstado;
  if (est?.enviando) return;
  const id = est && est.productoId;
  invCerrarModalNuevoForzado(); // INV-5.3: el producto ya se creó
  if (!id) return;
  invCargarCatalogo(true);
  invAbrirFicha(id, true);
}

// Coincidencias devueltas por el backend (jsonb): forma defensiva, sin
// inventar campos que el servidor no envía.
function invCoincidenciasHTML(coincidencias) {
  if (!Array.isArray(coincidencias) || coincidencias.length === 0) {
    return '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-2">Sin coincidencias detalladas disponibles.</p>';
  }
  const items = coincidencias.map(function (c) {
    let nombre = 'Sin nombre registrado';
    let extra = '';
    if (typeof c === 'string') {
      nombre = c;
    } else if (c && typeof c === 'object') {
      if (c.nombre) nombre = String(c.nombre);
      else if (c.nombre_producto) nombre = String(c.nombre_producto);
      const id = (c.producto_id || c.id) ? String(c.producto_id || c.id) : '';
      if (id) extra = ' · id: ' + id;
    }
    return `<li class="text-xs font-semibold text-slate-700 dark:text-slate-200">${invEsc(nombre)}<span class="font-medium text-slate-500 dark:text-slate-400">${invEsc(extra)}</span></li>`;
  }).join('');
  return `<ul class="mt-2 space-y-1">${items}</ul>`;
}

// ---------------------------------------------------------
// INV-5.1: AUTOCOMPLETADO DEL ALTA DE PRODUCTO
// ---------------------------------------------------------
// La búsqueda es informativa. La RPC de alta sigue validando duplicados.

// Normaliza mayúsculas y tildes para comparar (el backend también las ignora).
function invNormalizarTexto(valor) {
  const texto = (valor === null || valor === undefined) ? '' : String(valor);
  const minusculas = texto.toLowerCase();
  return (typeof minusculas.normalize === 'function')
    ? minusculas.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    : minusculas.trim();
}

// Distancia de Levenshtein clásica (dos filas; memoria O(largo de b)).
function invDistanciaLevenshtein(a, b) {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let anterior = new Array(lb + 1);
  let actual = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) anterior[j] = j;
  for (let i = 1; i <= la; i++) {
    actual[0] = i;
    for (let j = 1; j <= lb; j++) {
      const costo = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      actual[j] = Math.min(actual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + costo);
    }
    const tmp = anterior; anterior = actual; actual = tmp;
  }
  return anterior[lb];
}

// Similitud 0..1 de dos cadenas YA normalizadas, con filtro de longitud
// (comparación limitada: se descartan de inmediato pares incompatibles).
function _similitudPar(na, nb) {
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (Math.abs(na.length - nb.length) > 4) return 0;
  return 1 - invDistanciaLevenshtein(na, nb) / Math.max(na.length, nb.length);
}

function invSimilitud(a, b) {
  return _similitudPar(invNormalizarTexto(a), invNormalizarTexto(b));
}

function invSimilares(catalogo, texto, limite = INV_SUG_LIMITE) {
  const consulta = invNormalizarTexto(texto).replace(/\s+/g, ' ');
  if (!consulta) return [];
  const palabras = nombre => new Set(nombre.split(/[^\p{L}\p{N}]+/u)
    .filter(p => p.length >= 3 && !INV_SUG_PALABRAS_COMUNES.has(p)));
  const buscadas = palabras(consulta);
  return (Array.isArray(catalogo) ? catalogo : []).flatMap(producto => {
    if (!producto?.producto_id || !producto.nombre) return [];
    const nombre = invNormalizarTexto(producto.nombre).replace(/\s+/g, ' ');
    const similitud = consulta.length >= 5 ? invSimilitud(consulta, nombre) : 0;
    const encontradas = palabras(nombre);
    const comunes = [...buscadas].filter(p => encontradas.has(p)).length;
    const prioridad = nombre === consulta ? 4 : similitud >= 0.85 ? 3
      : nombre.startsWith(consulta) ? 2 : comunes >= 2 && comunes / buscadas.size >= 2 / 3 ? 1 : 0;
    return prioridad ? [{ producto, prioridad, similitud, comunes }] : [];
  }).sort((a, b) => b.prioridad - a.prioridad || b.comunes - a.comunes || b.similitud - a.similitud)
    .slice(0, limite).map(candidato => candidato.producto);
}

function invSugTextoValido(texto) {
  return (texto.match(/[\p{L}\p{N}]/gu) || []).length >= 3;
}

function invSugPintar() {
  const cont = document.getElementById('inv-sug-container');
  const boton = document.getElementById('inv-sug-accion');
  if (boton) {
    boton.disabled = !invSugTextoValido(invNuevoEstado?.nombre ?? '');
    boton.textContent = invSugAbierto ? 'Ocultar similares' : 'Ver similares';
    boton.setAttribute('aria-expanded', String(invSugAbierto));
  }
  if (!cont) return;
  cont.innerHTML = invSugHTML();
  cont.hidden = !invSugAbierto;
}

function invSugHTML() {
  if (!invSugAbierto) return '';
  const mensaje = 'px-3 py-2 text-xs text-slate-600 dark:text-slate-300';
  if (invSugCargando) return '<p role="status" class="' + mensaje + '">Buscando…</p>';
  if (invSugError) return '<p role="status" class="' + mensaje + '">No se pudo consultar. <button type="button" onclick="invSugConsultar(invSugTexto)" class="font-semibold underline">Reintentar</button></p>';
  if (!invSugItems.length) return '<p role="status" class="' + mensaje + '">No encontramos productos similares. Puedes continuar</p>';
  return invSugItems.map(p => `<button type="button" data-producto="${invEsc(p.producto_id)}"
    onclick="invSugSeleccionar(this.dataset.producto)" class="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
    <span class="block break-words font-semibold text-slate-800 dark:text-slate-100">${invEsc(p.nombre)}</span>
    <span class="text-xs text-slate-500 dark:text-slate-400">Producto existente</span>
  </button>`).join('');
}

function invSugOnInput(valor) {
  const est = invNuevoEstado;
  if (!est) return;
  est.nombre = String(valor ?? '');
  if (est.sugerencia) {
    est.sugerencia = null;
    const panel = document.getElementById('inv-sug-panel');
    if (panel) panel.innerHTML = '';
  }
  invSugResetear();
}

async function invSugConsultar(texto) {
  if (!invSugAbierto || invSugCargando || !invSugTextoValido(texto)) return;
  const token = ++invSugToken;
  invSugTexto = texto;
  invSugCargando = true;
  invSugError = false;
  invSugPintar();
  try {
    const { productos } = await window.InventarioService.buscarProductos({
      texto, ubicacionId: '', limite: 8, offset: 0
    });
    if (token !== invSugToken) return;
    invSugItems = invSimilares(productos, texto);
  } catch (e) {
    if (token !== invSugToken) return;
    invSugError = true;
  }
  invSugCargando = false;
  invSugPintar();
}

function invSugResetear() {
  ++invSugToken;
  invSugTexto = '';
  invSugItems = [];
  invSugCargando = false;
  invSugError = false;
  invSugCerrar();
}

function invSugCerrar() {
  invSugAbierto = false;
  invSugPintar();
}

function invSugCerrarFuera(evento) {
  if (invSugAbierto && !evento.target?.closest?.('[data-inv-sugerencias]')) invSugCerrar();
}

function invSugReabrir() {
  if (!invNuevoEstado || invNuevoEstado.paso !== 'form' || invNuevoEstado.enviando) return;
  if (invSugAbierto) { invSugCerrar(); return; }
  const texto = invNuevoEstado.nombre.trim();
  if (!invSugTextoValido(texto)) return;
  invSugAbierto = true;
  invSugPintar();
  if (texto !== invSugTexto) return invSugConsultar(texto);
}

function invSugTeclado(ev) {
  if (ev.key !== 'Escape' || !invSugAbierto) return;
  ev.stopPropagation();
  ev.preventDefault();
  invSugCerrar();
  document.getElementById('inv-sug-accion')?.focus();
}

// Selección de una sugerencia: NO crea ni modifica NADA. Se rellena el
// nombre REAL de Supabase y se ofrece reutilizar la ficha existente.
function invSugSeleccionar(productoId) {
  const id = String(productoId || '').trim();
  const est = invNuevoEstado;
  const prod = est
    ? invSugItems.find(function (p) { return p && String(p.producto_id) === id; })
    : null;
  invSugCerrar();
  if (!est || !prod) return;
  invNuevoLeerFormulario();
  est.nombre = String(prod.nombre);
  est.sugerencia = prod;
  invSugResetear();
  // Respaldo en memoria con los datos REALES leídos de la propia RPC de
  // lectura, por si la ficha no está en la página visible. Jamás localStorage.
  invProductosRecientes[prod.producto_id] = {
    producto_id: prod.producto_id,
    nombre: String(prod.nombre),
    unidad_medida: (prod.unidad_medida === null || prod.unidad_medida === undefined) ? null : prod.unidad_medida,
    presentacion: prod.presentacion ?? null,
    origen_registro: (prod.origen_registro === null || prod.origen_registro === undefined) ? null : prod.origen_registro,
    material_id: prod.material_id || null,
    asociado_historico: prod.asociado_historico === true,
    tiene_existencia_operativa: prod.tiene_existencia_operativa === true
  };
  invNuevoPintar();
}

// Panel bajo el campo cuando hay una sugerencia seleccionada.
function invSugPanelHTML(prod) {
  if (!prod || !prod.producto_id) return '';
  return `
    <div class="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl px-3 py-3 mt-3">
      <p class="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Producto existente</p>
      <p class="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1">${invEsc(prod.nombre)}</p>
      ${invPresentacionHTML(prod)}
      <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Reutilice la ficha existente o siga creando un producto nuevo: el servidor validará los duplicados al confirmar.</p>
      <div class="flex flex-wrap gap-2 mt-2.5">
        <button type="button" onclick="invSugVerFicha()" class="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors">Ver ficha existente</button>
        <button type="button" onclick="invSugLimpiarSugerencia()" class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors">Seguir creando</button>
      </div>
    </div>`;
}

// "Ver ficha existente": se reutiliza la ficha del producto real elegido.
function invSugVerFicha() {
  const est = invNuevoEstado;
  const prod = est && est.sugerencia;
  invCerrarModalNuevoForzado(); // INV-5.3: navegación explícita a la ficha existente
  if (!prod || !prod.producto_id) return;
  invCargarCatalogo(true);
  invAbrirFicha(prod.producto_id, true);
}

// "Seguir creando": se descarta la selección y el alta continúa con el
// flujo normal (el duplicado lo seguirá validando el backend en la RPC).
function invSugLimpiarSugerencia() {
  const est = invNuevoEstado;
  if (!est) return;
  est.sugerencia = null;
  invNuevoPintar();
}

function invNuevoHTML() {
  const est = invNuevoEstado || {
    paso: 'form', nombre: '', unidad: '', productoId: null,
    coincidencias: [], error: null, enviando: false, sugerencia: null,
    confirmandoDescarte: false
  };
  const clasesBotonSec = 'px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50';
  const clasesBotonPri = 'px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50';
  const clasesInput = 'w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60';

  let titulo = 'Agregar producto';
  let cuerpo = '';
  let pie = '';

  if (est.confirmandoDescarte) {
    // INV-5.3: aviso de descarte. Lo escrito sigue en `est`; el usuario
    // decide entre seguir editando o descartar explícitamente.
    titulo = 'Descartar cambios';
    cuerpo = `
      <div class="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl px-3 py-3">
        <p class="text-sm font-semibold text-amber-800 dark:text-amber-300">Tiene información sin guardar en este formulario.</p>
        <p class="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-1">Si descarta, se perderá lo que acaba de escribir. Esta acción no se puede deshacer.</p>
      </div>`;
    pie = `
      <button type="button" onclick="invNuevoSeguirEditando()" class="${clasesBotonSec}">Seguir editando</button>
      <button type="button" onclick="invNuevoDescartar()" class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors">Descartar</button>`;
  } else if (est.paso === 'form') {
    cuerpo = `
      <div class="mb-3">
        <label for="inv-nuevo-nombre" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Nombre del producto *</label>
        <div class="relative" data-inv-sugerencias onkeydown="invSugTeclado(event)">
          <input id="inv-nuevo-nombre" type="text" autocomplete="off" value="${invEsc(est.nombre)}" placeholder="Ej.: Agorex PL 500"
            class="${clasesInput}"
            oninput="invSugOnInput(this.value)" />
          <button id="inv-sug-accion" type="button" onclick="invSugReabrir()" aria-controls="inv-sug-container"
            aria-expanded="${invSugAbierto}" ${invSugTextoValido(est.nombre) ? '' : 'disabled'}
            class="text-xs font-semibold text-blue-600 dark:text-blue-400 py-1.5 disabled:opacity-60">${invSugAbierto ? 'Ocultar similares' : 'Ver similares'}</button>
          <div id="inv-sug-container" ${invSugAbierto ? '' : 'hidden'} class="mt-1 border border-slate-200 dark:border-slate-700 rounded-xl overflow-y-auto" style="max-height: 10rem">${invSugHTML()}</div>
        </div>
        <div id="inv-sug-panel">${est.sugerencia ? invSugPanelHTML(est.sugerencia) : ''}</div>
      </div>
      <div>
        <label for="inv-nuevo-unidad-texto" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Unidad de medida *</label>
        ${invUnidadSelectorHTML("inv-nuevo", est, clasesInput)}
      </div>
      <div class="mt-3"><label for="inv-nuevo-presentacion" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Presentación (opcional)</label><input id="inv-nuevo-presentacion" type="text" maxlength="160" oninput="if(invNuevoEstado) invNuevoEstado.presentacion=this.value" value="${invEsc(est.presentacion || '')}" placeholder="Ej.: 300 mL, caja de 12, 1 litro" class="${clasesInput}" /></div>
      ${invNuevoInicialHTML(est, clasesInput)}`;
    pie = `
      <button type="button" onclick="invCerrarModalNuevo()" class="${clasesBotonSec}">Cancelar</button>
      <button type="button" onclick="invNuevoPasoConfirmar()" ${est.enviando ? "disabled" : ""} class="${clasesBotonPri}">Crear producto</button>`;
  } else if (est.paso === 'confirmar') {
    titulo = 'Confirmar creación';
    const nombre = String(est.nombre || '').trim();
    const unidad = String(est.unidad || '').trim();
    cuerpo = `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-3 space-y-1.5">
        <p class="text-sm"><span class="text-slate-500 dark:text-slate-400">Nombre:</span> <span class="font-semibold text-slate-800 dark:text-slate-100">${invEsc(nombre)}</span></p>
        <p class="text-sm"><span class="text-slate-500 dark:text-slate-400">Unidad:</span> <span class="font-semibold text-slate-800 dark:text-slate-100">${unidad ? invEsc(unidad) : 'Sin unidad registrada'}</span></p>
      </div>
      ${invPresentacionHTML(est)}
      ${est.confirmacionVariante ? '<p class="text-xs font-bold mt-3">Confirme que la presentación es realmente diferente. La cantidad disponible no distingue productos.</p>' : ''}
      ${invNuevoInicialResumenHTML(est)}
      <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-3">Al confirmar, el producto quedará creado en el catálogo con su usuario como autor (registro en el servidor).</p>`;
    pie = `
      <button type="button" onclick="invNuevoVolver()" ${est.enviando ? 'disabled' : ''} class="${clasesBotonSec}">← Volver a editar</button>
      <button type="button" onclick="invNuevoEnviar(${est.confirmacionVariante === true})" ${est.enviando ? 'disabled' : ''} class="${clasesBotonPri}">${est.enviando ? 'Guardando…' : est.confirmacionVariante ? 'Confirmar presentación diferente y crear' : 'Confirmar creación'}</button>`;
  } else if (est.paso === 'duplicado' || est.paso === 'homonimo') {
    titulo = 'Producto existente o similar';
    cuerpo = '<p role="status" class="text-sm mb-3">' + invEsc(invNuevoMensajeDuplicado(est.respuestaDuplicado)) + '</p>' + invNuevoCoincidenciasAccionesHTML(est.coincidencias);
    pie = '<button type="button" onclick="invCerrarModalNuevo()" class="' + clasesBotonSec + '">Cancelar</button>' + (est.respuestaDuplicado?.continuar_permitido === true ? '<button type="button" onclick="invNuevoContinuarDistinto()" class="' + clasesBotonSec + '">Es una presentación diferente</button>' : '') + '<button type="button" onclick="invNuevoVolver()" class="' + clasesBotonSec + '">Volver a editar</button>';
  } else if (est.paso === 'exito') {
    titulo = 'Producto creado';
    cuerpo = `
      <div class="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl px-3 py-3">
        <p class="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Producto creado correctamente.</p>
        <p class="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-1">${invNuevoInicialEstadoHTML(est)}</p>
      </div>`;
    pie = `
      <button type="button" onclick="invCerrarModalNuevo()" ${est.enviando ? "disabled" : ""} class="${clasesBotonSec}">Cerrar</button>
      <button type="button" onclick="invNuevoVerFicha()" ${est.enviando ? "disabled" : ""} class="${clasesBotonPri}">Ver ficha</button>`;
  }

  if (est.paso === 'exito' && est.baseError) {
    cuerpo += '<p role="alert" class="text-xs text-rose-600 dark:text-rose-400 mt-3">' + invEsc(est.baseError) + '</p><button type="button" onclick="invNuevoGuardarInicial()" ' + (est.enviando ? 'disabled' : '') + ' class="text-xs font-bold underline mt-3">Volver a comprobar y registrar existencia inicial</button>';
  }
  const errorHTML = (est.error && est.paso !== 'exito' && !est.confirmandoDescarte)
    ? `<div class="mt-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl px-3 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300">${invEsc(est.error)}</div>`
    : '';

  return `
    <div class="flex items-start justify-between gap-3 mb-4">
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">${titulo}</h2>
      <button type="button" onclick="invCerrarModalNuevo()" ${est.enviando ? 'disabled' : ''}
        class="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none disabled:opacity-40" title="Cerrar">✕</button>
    </div>
    ${cuerpo}
    ${errorHTML}
    <div class="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">${pie}</div>`;
}

// ---------------------------------------------------------
// INV-5: modal de OPERACIÓN POR BODEGA (línea base / entrada / salida)
// Flujo: form → confirmar → RPC → se cierra y se re-consultan ficha y
// catálogo contra Supabase. Errores del backend (p. ej.
// STOCK_INSUFICIENTE) se muestran sin inventar saldos ni cantidades.
// ---------------------------------------------------------
const INV_OPE_TITULOS = {
  linea_base: { form: 'Confirmar existencia inicial', confirmar: 'Confirmar línea base', accion: 'línea base', operacion: 'Línea base (existencia inicial)' },
  entrada: { form: 'Registrar entrada', confirmar: 'Confirmar entrada', accion: 'entrada', operacion: 'Entrada' },
  salida: { form: 'Registrar salida', confirmar: 'Confirmar salida', accion: 'salida', operacion: 'Salida' }
};

function invCrearModalOperacion() {
  let overlay = document.getElementById('inv-modal-operacion');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'inv-modal-operacion';
  overlay.className = 'hidden fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[80] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto';
  overlay.innerHTML = `
    <div id="inv-op-contenido" onclick="event.stopPropagation()"
      class="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-md p-4 sm:p-6 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto custom-scrollbar cursor-default my-auto text-slate-800 dark:text-slate-100">
    </div>`;
  // INV-5.3: el clic fuera (o el soltar tras una selección de texto) ya NO
  // cierra el formulario.
  overlay.addEventListener('click', invFormNoCierreFuera);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', invManejarTeclaFicha);
  return overlay;
}

let invOperacionApertura = 0;
async function invAbrirOperacion(tipo, productoId, ubicacionId, bodegaNombre) {
  // UX, no seguridad: el backend autoriza cada RPC igualmente.
  if (!invPuedeEscribir()) return;
  const t = String(tipo || '');
  if (!INV_OPE_TITULOS[t]) return;
  const idP = String(productoId || '').trim();
  const idU = String(ubicacionId || '').trim();
  if (!idP || !idU) return;
  const apertura = ++invOperacionApertura, ficha = invFichaActual;
  let cuenta = null;
  if (t === 'entrada') {
    try {
      cuenta = await window.InventarioService.listarEntradasPendientes();
      if (apertura !== invOperacionApertura || invFichaActual !== ficha) return;
      if (cuenta.indeterminados || cuenta.bloqueos?.some(b => b.producto_id === idP && b.ubicacion_id === idU)) throw new Error('Hay una entrada pendiente que necesita revisión. No se enviará otra relacionada hasta comprobarla.');
      const pendiente = cuenta.registros.find(r => r.parametros.p_producto_id === idP && r.parametros.p_ubicacion_id === idU);
      if (pendiente) { await invRecuperarEntrada(pendiente.parametros.p_solicitud_id); return; }
    } catch (e) { pvToastError(invEntradaError(e)); invRecepcionesActualizar(); return; }
  }

  const prod = (invFichaActual && invFichaActual.producto) || {};
  const existencias = (invFichaActual && Array.isArray(invFichaActual.existencias))
    ? invFichaActual.existencias : [];
  const fila = existencias.find(function (e) {
    return e && String(e.ubicacion_id) === idU;
  }) || null;
  const unidadProd = (prod.unidad_medida !== null && prod.unidad_medida !== undefined &&
    String(prod.unidad_medida).trim() !== '') ? String(prod.unidad_medida).trim() : '';

  invOpEstado = {
    tipo: t,
    productoId: idP,
    ubicacionId: idU,
    bodegaNombre: (bodegaNombre && String(bodegaNombre).trim() !== '')
      ? String(bodegaNombre).trim() : 'Bodega sin nombre',
    unidad: unidadProd,
    // INV-5.3: valor inicial de la unidad (viene prellenada del producto) para
    // distinguir un formulario intacto de uno realmente modificado.
    unidadInicial: unidadProd,
    usuarioRecepcionId: cuenta?.usuario_id ?? null,
    productoNombre: prod.nombre || 'Producto del Inventario',
    unidadOriginal: prod.unidad_medida ?? '',
    formatoEntrada: '', envases: '', contenidoEnvase: '', otroFormato: '',
    // Saldo actual real de la bodega (null si no existe fila); nunca 0 inventado.
    saldoActual: (fila && fila.cantidad !== null && fila.cantidad !== undefined)
      ? Number(fila.cantidad) : null,
    cantidad: '',
    responsable: '',
    paso: 'form',
    error: null,
    enviando: false,
    confirmandoDescarte: false
  };
  const overlay = invCrearModalOperacion();
  if (!overlay) return;
  overlay.classList.remove('hidden');
  invOpPintar();
}

// INV-5.3: cierre forzado (sin confirmación). Se usa tras registrar la
// operación con éxito (no hay nada que descartar).
function invCerrarOperacionForzado() {
  ++invOperacionApertura;
  const overlay = document.getElementById('inv-modal-operacion');
  if (overlay) overlay.classList.add('hidden');
  invOpEstado = null;
}

// INV-5.3: ¿hay datos sin guardar en la operación? Si el formulario está
// visible se sincroniza primero lo tecleado en los inputs (que recién viaja
// a est al pulsar "Revisar"), para no dar por vacía una cantidad escrita.
function invOpSucio(est) {
  if (!est) return false;
  if (est.paso === 'form') invOpLeerFormulario();
  if (est.paso !== 'form') return true; // paso de revisión: hay datos que proteger
  const unidadCampo = String(est.unidad || '').trim();
  const unidadIni = String(est.unidadInicial || '').trim();
  return String(est.cantidad || '').trim() !== '' ||
    String(est.responsable || '').trim() !== '' ||
    (est.tipo === 'entrada' && !!(est.formatoEntrada || est.envases || est.contenidoEnvase || est.otroFormato)) ||
    (est.tipo === 'linea_base' && unidadCampo !== unidadIni);
}

// INV-5.3: cierre intencional protegido (✕, Cancelar o Escape). Pide
// confirmación si hay cambios sin guardar; nunca cierra durante un envío.
function invCerrarOperacion() {
  const est = invOpEstado;
  if (est && est.enviando) return; // operación en curso: no cerrar
  if (!est || !invOpSucio(est)) { invCerrarOperacionForzado(); return; }
  est.confirmandoDescarte = true;
  invOpPintar();
}

// INV-5.3: "Seguir editando" / Escape con el aviso activo: conserva lo
// escrito y repinta el formulario.
function invOpSeguirEditando() {
  const est = invOpEstado;
  if (!est) return;
  est.confirmandoDescarte = false;
  invOpPintar();
}

// INV-5.3: "Descartar": cierre confirmado por el usuario.
function invOpDescartar() {
  const est = invOpEstado;
  if (est && est.enviando) return;
  invCerrarOperacionForzado();
}

function invOpPintar() {
  const cont = document.getElementById('inv-op-contenido');
  if (cont) cont.innerHTML = invOpHTML();
}

const INV_UNIDADES = [
  ['Unidades y herramientas', ['Unidad', 'Pieza', 'Par', 'Juego', 'Docena']],
  ['Envases y presentación', ['Caja', 'Paquete', 'Bolsa', 'Saco', 'Rollo', 'Botella', 'Bidón', 'Lata', 'Tubo', 'Cartucho', 'Bobina', 'Tambor', 'Pallet']],
  ['Longitud', ['Metro', 'Centímetro', 'Milímetro']],
  ['Superficie', ['Metro cuadrado']],
  ['Volumen', ['Litro', 'Mililitro', 'Metro cúbico', 'Galón']],
  ['Masa', ['Kilogramo', 'Gramo', 'Tonelada']]
];
function invOpUnidadHTML(est, clasesInput) {
  return invUnidadSelectorHTML('inv-op', est, clasesInput);
}
function invOpCambiarUnidad() {
  if (!invOpEstado || invOpEstado.enviando || invOpEstado.paso !== 'form') return;
  invOpLeerFormulario();
  invOpPintar();
  const destino = document.getElementById(invOpEstado.unidadOpcion === '__otra__' ? 'inv-op-unidad-personalizada' : 'inv-op-unidad-texto');
  if (destino) destino.focus();
}

function invOpLeerFormulario() {
  const est = invOpEstado;
  if (!est) return;
  est.cantidad = invValor('inv-op-cantidad');
  est.responsable = invValor('inv-op-responsable');
  if (est.tipo === 'entrada') {
    est.formatoEntrada = invValor('inv-op-formato');
    if (est.formatoEntrada) {
      est.envases = invValor('inv-op-envases');
      est.contenidoEnvase = invValor('inv-op-contenido-envase');
      est.otroFormato = invValor('inv-op-otro-formato');
    }
  }
  if (est.tipo === 'linea_base') {
    invUnidadLeer(est, 'inv-op');
  }
}

function invOpPasoConfirmar() {
  const est = invOpEstado;
  if (!est || est.enviando) return;
  invOpLeerFormulario();
  est.error = null;
  if (est.tipo === 'entrada') {
    try { est.cantidad = est.formatoEntrada ? invEntradaCalcular(est).cantidad : window.InventarioService.calcularEntradaFormato('1', est.cantidad).cantidad; } catch (e) { est.error = invEntradaError(e); invOpPintar(); return; }
  }
  const crudo = String(est.cantidad || '').trim().replace(',', '.');
  const numero = crudo === '' ? NaN : Number(crudo);
  if (!Number.isFinite(numero)) {
    est.error = 'Debe indicar una cantidad válida.';
    invOpPintar();
    return;
  }
  if (est.tipo === 'linea_base') {
    // El cero es un conteo físico verificado: está permitido.
    if (numero < 0) {
      est.error = 'La cantidad del conteo no puede ser negativa.';
      invOpPintar();
      return;
    }
    if (!String(est.unidad || '').trim()) {
      est.error = 'Debe indicar la unidad de medida.';
      invOpPintar();
      return;
    }
    if (invUnidadNumerica(est.unidad)) {
      est.error = 'La unidad de medida no puede ser solamente un número.';
      invOpPintar();
      return;
    }
  } else if (numero <= 0) {
    est.error = 'La cantidad debe ser mayor a cero.';
    invOpPintar();
    return;
  }
  est.error = invCantidadErrorUnidad(numero, est.unidad);
  if (est.error) { invOpPintar(); return; }
  est.paso = 'confirmar';
  invOpPintar();
}

function invOpVolver() {
  const est = invOpEstado;
  if (!est || est.enviando || est.recepcionIncierta) return;
  if (est.tipo === 'entrada') est.recepcionSolicitud = null;
  est.paso = 'form';
  est.error = null;
  invOpPintar();
}

async function invOpEnviar() {
  const est = invOpEstado;
  if (!est || est.enviando || est.paso !== 'confirmar') return;
  const fichaApertura = invFichaApertura;
  est.error = est.recuperando ? null : invCantidadErrorUnidad(Number(String(est.cantidad).replace(',', '.')), est.unidad);
  if (est.error) { invOpPintar(); return; }
  est.enviando = true;
  est.error = null;
  invOpPintar();
  const productoId = est.productoId;
  try {
    if (!window.InventarioService) throw new Error('InventarioService no está disponible.');
    if (est.recuperando) {
      await window.InventarioService.recuperarEntradaFormato(est.pendiente.parametros.p_solicitud_id);
    } else if (est.tipo === 'linea_base') {
      await window.InventarioService.confirmarLineaBase({
        productoId: productoId,
        ubicacionId: est.ubicacionId,
        cantidadContada: est.cantidad,
        unidadMedida: est.unidad,
        responsableTexto: est.responsable
      });
    } else if (est.tipo === 'entrada') {
      if (est.formatoEntrada) {
        const solicitud = invEntradaSolicitud(est);
        await window.InventarioService.registrarEntradaFormato(solicitud, { producto:est.productoNombre, bodega:est.bodegaNombre, usuarioId:est.usuarioRecepcionId });
        est.recepcionIncierta = false;
      } else {
        const pendientes = await window.InventarioService.listarEntradasPendientes();
        if (invOpEstado !== est) return;
        if (pendientes.usuario_id !== est.usuarioRecepcionId || pendientes.indeterminados || pendientes.bloqueos?.some(b => b.producto_id === productoId && b.ubicacion_id === est.ubicacionId) || pendientes.registros.some(r => r.parametros.p_producto_id === productoId && r.parametros.p_ubicacion_id === est.ubicacionId)) throw new Error('Comprueba primero la entrada pendiente de este producto y bodega.');
        await window.InventarioService.registrarEntrada({ productoId, ubicacionId:est.ubicacionId, cantidad:est.cantidad, responsableTexto:est.responsable });
      }
    } else if (est.tipo === 'salida') {
      await window.InventarioService.registrarSalida({
        productoId: productoId,
        ubicacionId: est.ubicacionId,
        cantidad: est.cantidad,
        responsableTexto: est.responsable
      });
    } else {
      throw new Error('Tipo de operación no reconocido.');
    }
    if (invOpEstado !== est) return;
    if (est.tipo === 'entrada') invRecepcionesActualizar();
    // La ficha carga sus atributos independientemente de la página del catálogo.
    // No reabrirla si se cerró o se seleccionó otro producto durante el envío.
    invCerrarOperacionForzado(); // INV-5.3: la escritura ya se completó
    const catalogo = invCargarCatalogo(true);
    if (fichaApertura === invFichaApertura) await invAbrirFicha(productoId, true);
    await catalogo;
  } catch (e) {
    if (invOpEstado !== est) return; // carril: se cerró/reabrió el modal
    est.enviando = false;
    if (est.tipo === 'entrada' && (est.recuperando || est.formatoEntrada) && (e.resultadoIncierto || e.pendienteGuardada || est.recepcionIncierta)) {
      est.recepcionIncierta = true;
      est.error = e.resultadoIncierto ? 'No pudimos confirmar si la entrada se guardó. Puedes intentar recuperarla sin duplicar el registro.' : invEntradaError(e) + ' La entrada pendiente se conserva.';
    } else est.error = invEntradaError(e);
    invOpPintar();
    if (est.tipo === 'entrada') invRecepcionesActualizar();
  }
}

function invOpHTML() {
  const est = invOpEstado || {
    tipo: 'entrada', productoId: '', ubicacionId: '', bodegaNombre: '',
    unidad: '', saldoActual: null, cantidad: '', responsable: '',
    paso: 'form', error: null, enviando: false, confirmandoDescarte: false
  };
  const t = INV_OPE_TITULOS[est.tipo] || INV_OPE_TITULOS.entrada;
  const esLineaBase = est.tipo === 'linea_base';
  const clasesBotonSec = 'px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50';
  const clasesBotonPri = 'px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50';
  const clasesInput = 'w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60';

  let titulo = t.form;
  let cuerpo = '';
  let pie = '';

  if (est.confirmandoDescarte) {
    // INV-5.3: aviso de descarte. Lo escrito sigue en `est`; el usuario
    // decide entre seguir editando o descartar explícitamente.
    titulo = 'Descartar cambios';
    cuerpo = `
      <div class="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl px-3 py-3">
        <p class="text-sm font-semibold text-amber-800 dark:text-amber-300">Tiene información sin guardar en este formulario.</p>
        <p class="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-1">Si descarta, se perderá lo que acaba de escribir. Esta acción no se puede deshacer.</p>
      </div>`;
    pie = `
      <button type="button" onclick="invOpSeguirEditando()" class="${clasesBotonSec}">Seguir editando</button>
      <button type="button" onclick="invOpDescartar()" class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors">Descartar</button>`;
  } else if (est.recuperando) {
    titulo = 'Recuperar entrada';
    cuerpo = invRecuperacionDetalleHTML(est.pendiente) + '<p class="text-sm mt-3">Comprobaremos la entrada original. Si ya se guardó, no se registrará otra.</p>';
    pie = '<button type="button" onclick="invCerrarOperacion()" ' + (est.enviando ? 'disabled' : '') + ' class="' + clasesBotonSec + '">Cancelar</button><button type="button" onclick="invOpEnviar()" ' + (est.enviando ? 'disabled' : '') + ' class="' + clasesBotonPri + '">' + (est.enviando ? 'Comprobando…' : 'Confirmar recuperación') + '</button>';
  } else if (est.paso === 'form') {
    cuerpo = `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5 mb-3 space-y-1">
        <p class="text-sm"><span class="text-slate-500 dark:text-slate-400">Bodega:</span> <span class="font-semibold text-slate-800 dark:text-slate-100">${invEsc(est.bodegaNombre)}</span></p>
        ${(!esLineaBase && est.saldoActual !== null)
          ? `<p class="text-[11px] text-slate-500 dark:text-slate-400">Saldo actual en esta bodega: ${invEsc(String(est.saldoActual))}${est.unidad ? ' ' + invEsc(est.unidad) : ''}</p>`
          : ''}
      </div>
      ${est.tipo === 'entrada' ? invEntradaCamposHTML(est, clasesInput) : `
      <div class="mb-3">
        <label for="inv-op-cantidad" class="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">${esLineaBase ? 'Conteo físico verificado *' : 'Cantidad *'}</label>
        <input id="inv-op-cantidad" type="number" step="${invUnidadEntera(est.unidad) ? '1' : 'any'}" min="${esLineaBase ? '0' : invUnidadEntera(est.unidad) ? '1' : '0.01'}" inputmode="${invUnidadEntera(est.unidad) ? 'numeric' : 'decimal'}"
          value="${invEsc(est.cantidad)}" placeholder="0" class="${clasesInput}" />
        <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">${esLineaBase
          ? 'Puede confirmar 0 si el conteo verificó que no queda existencia en esta bodega.'
          : 'La cantidad se registra en la unidad del producto.'}</p>
      </div>
      `}
      ${esLineaBase ? `
      <div class="mb-3">
        <label for="inv-op-unidad-texto" class="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Unidad de medida *</label>
        ${invOpUnidadHTML(est, clasesInput)}
      </div>` : ''}
      <div>
        <label for="inv-op-responsable" class="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Responsable (opcional)</label>
        <input id="inv-op-responsable" type="text" autocomplete="off" value="${invEsc(est.responsable)}" placeholder="Nombre de quien realiza la operación" class="${clasesInput}" />
      </div>`;
    pie = `
      <button type="button" onclick="invCerrarOperacion()" class="${clasesBotonSec}">Cancelar</button>
      <button type="button" onclick="invOpPasoConfirmar()" class="${clasesBotonPri}">Revisar</button>`;
  } else {
    titulo = t.confirmar;
    const cantidad = String(est.cantidad || '').trim().replace(',', '.');
    const responsable = String(est.responsable || '').trim();
    cuerpo = `
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-3 space-y-1.5">
        <p class="text-sm"><span class="text-slate-500 dark:text-slate-400">Operación:</span> <span class="font-semibold text-slate-800 dark:text-slate-100">${t.operacion}</span></p>
        <p class="text-sm"><span class="text-slate-500 dark:text-slate-400">Bodega:</span> <span class="font-semibold text-slate-800 dark:text-slate-100">${invEsc(est.bodegaNombre)}</span></p>
        <p class="text-sm"><span class="text-slate-500 dark:text-slate-400">Cantidad:</span> <span class="font-semibold text-slate-800 dark:text-slate-100">${invEsc(cantidad)}${est.unidad ? ' ' + invEsc(est.unidad) : ''}</span></p>
        <p class="text-sm"><span class="text-slate-500 dark:text-slate-400">Responsable:</span> <span class="font-semibold text-slate-800 dark:text-slate-100">${responsable ? invEsc(responsable) : 'Sin responsable registrado'}</span></p>
      </div>
      ${est.tipo === 'entrada' && est.formatoEntrada ? invEntradaResumenHTML(est) : ''}
      <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-3">Al confirmar, el registro quedará guardado en el servidor con su usuario como autor.</p>`;
    pie = `
      <button type="button" onclick="invOpVolver()" ${est.enviando || est.recepcionIncierta ? 'disabled' : ''} class="${clasesBotonSec}">← Volver</button>
      <button type="button" onclick="invOpEnviar()" ${est.enviando ? 'disabled' : ''} class="${clasesBotonPri}">${est.enviando ? 'Guardando…' : est.recepcionIncierta ? 'Recuperar entrada' : 'Confirmar ' + t.accion}</button>`;
  }

  const errorHTML = (est.error && !est.confirmandoDescarte)
    ? `<div class="mt-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl px-3 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300">${invEsc(est.error)}</div>`
    : '';

  return `
    <div class="flex items-start justify-between gap-3 mb-4">
      <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">${titulo}</h2>
      <button type="button" onclick="invCerrarOperacion()" ${est.enviando ? 'disabled' : ''}
        class="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none disabled:opacity-40" title="Cerrar">✕</button>
    </div>
    ${cuerpo}
    ${errorHTML}
    <div class="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">${pie}</div>`;
}

// INV-6: estado aislado del catálogo y de los formularios operativos.
let invHistSeccion = 'catalogo';
let invHistFuente = null;
let invHistSolicitud = 0;
let invHistBodegas = [];
const invHistEstados = {};

function invHistPuedeConsultar() {
  if (typeof state === 'undefined' || !state.currentUser || typeof hasAccess !== 'function') return false;
  const u = state.currentUser;
  return hasAccess('inventario', u.role) && (u.role === 'TECNICO' || invPuedeEscribir());
}

function invCambiarSeccion(seccion) {
  if (seccion !== 'catalogo' && seccion !== 'historico') return;
  if (!invHistPuedeConsultar()) return;
  invHistSeccion = seccion;
  if (seccion === 'catalogo') invHistCerrarDetalle();
  document.getElementById('inv-seccion-catalogo').classList[seccion === 'catalogo' ? 'remove' : 'add']('hidden');
  document.getElementById('inv-seccion-historico').classList[seccion === 'historico' ? 'remove' : 'add']('hidden');
  document.getElementById('inv-tab-catalogo').setAttribute('aria-pressed', String(seccion === 'catalogo'));
  document.getElementById('inv-tab-historico').setAttribute('aria-pressed', String(seccion === 'historico'));
  ['catalogo', 'historico'].forEach(function (nombre) {
    const tab = document.getElementById('inv-tab-' + nombre);
    ['bg-blue-600', 'text-white'].forEach(function (clase) { tab.classList[nombre === seccion ? 'add' : 'remove'](clase); });
  });
  if (seccion === 'historico') return invHistCargar();
}

async function invHistCargar() {
  if (!invHistPuedeConsultar()) return;
  const ticket = ++invHistSolicitud;
  const archivos = window.InventarioService.ARCHIVOS_HISTORICOS;
  archivos.forEach(function (archivo) {
    const est = invHistEstados[archivo] || { texto: '', ubicacion: '', responsable: '', hoja: '', pagina: 1, filas: null };
    est.cargando = true; est.error = null;
    invHistEstados[archivo] = est;
  });
  invHistPintar();
  await Promise.all(archivos.map(async function (archivo) {
    try {
      const filas = await window.InventarioService.obtenerHistorico(archivo);
      if (ticket !== invHistSolicitud || !invHistPuedeConsultar()) return;
      invHistEstados[archivo].filas = filas;
    } catch (e) {
      if (ticket !== invHistSolicitud || !invHistPuedeConsultar()) return;
      invHistEstados[archivo].error = invMensajeError(e);
      invHistEstados[archivo].filas = null;
    } finally {
      if (ticket === invHistSolicitud && invHistPuedeConsultar()) {
        invHistEstados[archivo].cargando = false;
        invHistPintar();
      }
    }
  }));
  try {
    const bodegas = await window.InventarioService.getBodegas();
    if (ticket !== invHistSolicitud || !invHistPuedeConsultar()) return;
    invHistBodegas = bodegas;
  } catch (e) { if (ticket === invHistSolicitud) invHistBodegas = []; }
  if (ticket === invHistSolicitud) invHistPintar();
}

function invHistUbicacion(r) {
  if (r.ubicacion_original) return String(r.ubicacion_original);
  const b = invHistBodegas.find(function (u) { return u.id === r.ubicacion_id; });
  return b ? b.nombre : '';
}

function invHistFiltrar(est) {
  const texto = est.texto.toLocaleLowerCase('es');
  return (est.filas || []).filter(function (r) {
    const campos = [r.nombre_original, r.producto_original, r.numero_original, r.nemotecnico_original,
      invHistUbicacion(r), r.responsable_texto, r.proveedor_original, r.hoja_origen, r.fila_origen, r.categoria_origen];
    return (!texto || campos.some(function (v) { return v != null && String(v).toLocaleLowerCase('es').includes(texto); })) &&
      (!est.ubicacion || invHistUbicacion(r) === est.ubicacion) &&
      (!est.responsable || r.responsable_texto === est.responsable) &&
      (!est.hoja || r.hoja_origen === est.hoja);
  });
}

function invHistAbrirFuente(indice) {
  if (!invHistPuedeConsultar()) return;
  const archivo = window.InventarioService.ARCHIVOS_HISTORICOS[indice];
  if (!archivo) return;
  invHistFuente = archivo;
  invHistPintar();
}

function invHistVolver() {
  if (!invHistPuedeConsultar()) return;
  invHistFuente = null;
  invHistPintar();
}

function invHistFiltrarCampo(campo, valor) {
  if (!invHistPuedeConsultar() || !invHistFuente || !['texto', 'ubicacion', 'responsable', 'hoja'].includes(campo)) return;
  const est = invHistEstados[invHistFuente];
  est[campo] = String(valor); est.pagina = 1;
  // Mantener el input de búsqueda y su foco mientras se escribe.
  invHistPintarListado();
}

function invHistPagina(delta) {
  if (!invHistPuedeConsultar() || !invHistFuente) return;
  const est = invHistEstados[invHistFuente];
  const total = Math.max(1, Math.ceil(invHistFiltrar(est).length / 12));
  est.pagina = Math.max(1, Math.min(total, est.pagina + delta));
  invHistPintarListado();
}

function invHistListadoHTML(est) {
  const filas = invHistFiltrar(est);
  const paginas = Math.max(1, Math.ceil(filas.length / 12));
  est.pagina = Math.min(est.pagina, paginas);
  const tarjetas = filas.slice((est.pagina - 1) * 12, est.pagina * 12).map(function (r) {
    const indice = est.filas.indexOf(r);
    return `<button onclick="invHistDetalle(${indice})" class="alm-record-card text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <span class="block font-bold">${invEsc(r.nombre_original || r.producto_original || 'Sin nombre registrado')}</span>
      <span class="block text-xs mt-2 text-slate-500">${invEsc(invHistUbicacion(r) || 'Ubicación sin dato registrado')}</span>
      ${r.cantidad_original != null && String(r.cantidad_original).trim() !== ''
        ? `<span class="block text-xs mt-1">Cantidad histórica: ${invHistDato(r.cantidad_original)}</span>`
        : r.cantidad != null && String(r.cantidad).trim() !== '' ? `<span class="block text-xs mt-1">Cantidad histórica: ${invHistDato(r.cantidad)}</span>` : ''}
      ${r.costo_unitario != null && String(r.costo_unitario).trim() !== '' ? `<span class="block text-xs mt-1">Costo unitario histórico: ${invHistDato(r.costo_unitario)}</span>` : ''}
      <span class="block text-xs mt-2 text-blue-600">Ver información histórica</span></button>`;
  }).join('');
  return `<p class="text-xs text-slate-500 mb-3">${filas.length} de ${est.filas.length} registros históricos</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">${tarjetas || '<p>No se encontraron registros.</p>'}</div>
    <div class="flex items-center justify-between gap-3 mt-4">
      <button onclick="invHistPagina(-1)" ${est.pagina <= 1 ? 'disabled' : ''} class="px-3 py-2 border rounded-xl disabled:opacity-40">Anterior</button>
      <span class="text-xs">Página ${est.pagina} de ${paginas}</span>
      <button onclick="invHistPagina(1)" ${est.pagina >= paginas ? 'disabled' : ''} class="px-3 py-2 border rounded-xl disabled:opacity-40">Siguiente</button></div>`;
}

function invHistDato(v) {
  return v === null || v === undefined || v === '' ? 'Sin dato registrado' : invEsc(String(v));
}

// Fecha del archivo original: leer su parte calendario sin convertir a
// Date ni a la zona horaria del navegador (medianoche UTC conserva su día).
function invHistFecha(valor) {
  return formatearFechaCL(valor,{civil:true,vacio:'Sin fecha registrada'});
}

function invHistOpciones(est, campo, obtener) {
  const valores = [...new Set(est.filas.map(obtener).filter(function (v) { return v != null && v !== ''; }))].sort();
  return '<option value="">Todas</option>' + valores.map(function (v) {
    return `<option value="${invEsc(v)}" ${est[campo] === v ? 'selected' : ''}>${invEsc(v)}</option>`;
  }).join('');
}

function invHistPintarListado() {
  if (!invHistPuedeConsultar() || !invHistFuente) return;
  const cont = document.getElementById('inv-hist-listado');
  if (cont) cont.innerHTML = invHistListadoHTML(invHistEstados[invHistFuente]);
}

function invHistPintar() {
  if (!invHistPuedeConsultar()) return;
  const cont = document.getElementById('inv-seccion-historico');
  if (!cont) return;
  const archivos = window.InventarioService.ARCHIVOS_HISTORICOS;
  const aviso = '<p class="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-3">Archivo histórico: sus cantidades no representan stock disponible. Los costos históricos no son precios actuales; no se presupone moneda ni se suman filas.</p>';
  let html = `<div class="space-y-4"><h3 class="text-lg font-bold">Histórico y trazabilidad</h3>${aviso}`;
  if (!invHistFuente) {
    html += '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">' + archivos.map(function (archivo, i) {
      const est = invHistEstados[archivo];
      const estado = !est || est.cargando ? 'Consultando…' : est.error ? 'No disponible: ' + est.error : est.filas.length + ' registros históricos';
      return `<button onclick="invHistAbrirFuente(${i})" class="p-5 text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm"><span class="block font-bold">${invEsc(archivo)}</span><span class="block text-sm mt-3">${invEsc(estado)}</span></button>`;
    }).join('') + '</div>';
  } else {
    const est = invHistEstados[invHistFuente];
    html += `<button onclick="invHistVolver()" class="text-blue-600 text-sm font-bold">← Volver a los archivos</button><h4 class="font-bold">${invEsc(invHistFuente)}</h4>`;
    if (!est || est.cargando) html += '<p>Consultando registros…</p>';
    else if (est.error) html += `<p role="alert">${invEsc(est.error)}</p>`;
    else {
      const input = 'w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900';
      html += `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label class="text-xs">Buscar<input type="search" value="${invEsc(est.texto)}" oninput="invHistFiltrarCampo('texto', this.value)" class="${input}" /></label>
        <label class="text-xs">Ubicación<select onchange="invHistFiltrarCampo('ubicacion', this.value)" class="${input}">${invHistOpciones(est, 'ubicacion', invHistUbicacion)}</select></label>
        <label class="text-xs">Hoja<select onchange="invHistFiltrarCampo('hoja', this.value)" class="${input}">${invHistOpciones(est, 'hoja', function (r) { return r.hoja_origen; })}</select></label>
        </div><div id="inv-hist-listado">${invHistListadoHTML(est)}</div>`;
    }
  }
  cont.innerHTML = html + '<button onclick="invHistCargar()" class="px-3 py-2 border rounded-xl text-sm">↻ Actualizar históricos</button></div>';
}

function invHistCerrarDetalle() {
  const overlay = document.getElementById('inv-modal-historico');
  if (overlay) overlay.classList.add('hidden');
}

function invHistDetalle(indice) {
  if (!invHistPuedeConsultar() || !invHistFuente) return;
  const est = invHistEstados[invHistFuente];
  const r = est && est.filas && est.filas[indice];
  if (!r) return;
  let overlay = document.getElementById('inv-modal-historico');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'inv-modal-historico';
    overlay.className = 'hidden fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[70] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto';
    overlay.addEventListener('click', function (ev) { // UX-02: fondo sin cierre.
 });
    document.body.appendChild(overlay);
    document.addEventListener('keydown', invManejarTeclaFicha);
  }
  const campos = [['Producto original', r.producto_original], ['Cantidad original', r.cantidad_original], ['Cantidad numérica histórica', r.cantidad], ['COSTO HISTÓRICO · Unitario', r.costo_unitario], ['COSTO HISTÓRICO · Total', r.costo_total], ['Fecha registrada en el histórico', invHistFecha(r.fecha)], ['Tipo de movimiento histórico', r.tipo_movimiento], ['Proveedor original', r.proveedor_original], ['Sección original', r.seccion_origen], ['Categoría original', r.categoria_origen], ['Observaciones', r.observaciones], ['Valor auxiliar de la fuente', r.valor_auxiliar_fuente]];
  campos.push(['Ubicación vinculada / original', invHistUbicacion(r)], ['Archivo', invHistFuente], ['Hoja', r.hoja_origen], ['Fila de origen', r.fila_origen]);
  overlay.innerHTML = `<div onclick="event.stopPropagation()" class="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-2xl shadow-2xl w-full max-w-2xl p-5 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto custom-scrollbar my-auto">
    <div class="flex justify-between gap-3"><h3 class="text-lg font-bold">Información histórica</h3><button onclick="invHistCerrarDetalle()" title="Cerrar" aria-label="Cerrar información histórica">✕</button></div>
    <p class="text-xs text-amber-700 dark:text-amber-300 my-3">Registro de archivo histórico. No representa stock ni precios actuales. Moneda no confirmada.</p>
    <dl class="space-y-3">${campos.map(function ([label, valor]) { return `<div><dt class="text-xs text-slate-500">${label}</dt><dd class="text-sm whitespace-pre-wrap break-words">${invHistDato(valor)}</dd></div>`; }).join('')}</dl></div>`;
  overlay.classList.remove('hidden');
}

// Modal compartida de consulta y confirmación de movimientos.
let invPreviewContexto = null;
let invPreviewSecuencia = 0;
function invCerrarPrevisualizacion() {
  if (invPreviewContexto?.enviando) return;
  ++invPreviewSecuencia;
  const contexto = invPreviewContexto;
  invPreviewContexto = null;
  document.getElementById('inv-modal-preview')?.remove();
  if (contexto) {
    contexto.ficha.inert = contexto.inert;
    document.body.style.overflow = contexto.overflow;
    if (contexto.foco?.isConnected) contexto.foco.focus();
  }
}
async function invAbrirPrevisualizacion(tipo, id) {
  if (!invEsAdminPermanente() || invPreviewContexto || !invFichaActual) return;
  const actual = invFichaActual;
  const movimiento = invFichaMovimientos.items.find(m => m.movimiento_id === id);
  if (tipo === 'producto') {
    if (id !== actual.producto_id || actual.producto?.origen_registro !== 'SISTEMA') return;
  } else if (!['eliminar_movimiento','corregir_movimiento'].includes(tipo) || !movimiento) return;
  if (tipo === 'corregir_movimiento' && (!['ENTRADA','SALIDA'].includes(movimiento.tipo) || movimiento.movimiento_corregido === true || movimiento.ajuste_compensatorio === true)) return;
  const ficha = document.getElementById('inv-modal-ficha');
  if (!ficha) return;
  const secuencia = ++invPreviewSecuencia;
  invPreviewContexto = { tipo, fichaActual:actual, ficha, inert:ficha.inert, overflow:document.body.style.overflow, foco:document.activeElement };
  ficha.inert = true;
  document.body.style.overflow = 'hidden';
  const modal = document.createElement('div');
  modal.id = 'inv-modal-preview';
  modal.className = 'fixed inset-0 bg-slate-900/70 z-[90] flex items-center justify-center p-4';
  const titulos = {producto:'Previsualización de eliminación del producto', eliminar_movimiento:'Previsualización de eliminación individual', corregir_movimiento:'Corregir movimiento'};
  modal.innerHTML = '<section role="dialog" aria-modal="true" aria-labelledby="inv-preview-titulo" class="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col"><header class="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3"><h2 id="inv-preview-titulo" class="font-bold">' + titulos[tipo] + '</h2><button type="button" onclick="invCerrarPrevisualizacion()" aria-label="Cerrar previsualización" class="p-2">✕</button></header><div id="inv-preview-cuerpo" class="p-4 overflow-y-auto text-sm" aria-live="polite"><p role="status">Cargando registros…</p></div><footer class="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end"><button type="button" onclick="invCerrarPrevisualizacion()" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs">Cerrar</button></footer></section>';
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); }
    if (e.key !== 'Tab') return;
    const botones = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary')];
    const primero = botones[0], ultimo = botones[botones.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  });
  document.body.appendChild(modal);
  modal.querySelector('button').focus();
  try {
    const servicio = window.InventarioService;
    const datos = tipo === 'producto' ? await servicio.previsualizarEliminacion(id) : tipo === 'corregir_movimiento' ? await servicio.previsualizarAnulacion(id) : await servicio.previsualizarEliminacionMovimiento(id);
    if (secuencia !== invPreviewSecuencia || !invPreviewContexto) return;
    if (!invEsAdminPermanente()) throw new Error('La autorización de Administrador permanente ya no está vigente.');
    if (datos.producto_id !== actual.producto_id || (tipo !== 'producto' && datos.movimiento_id !== id)) throw new Error('La respuesta no corresponde al registro consultado.');
    if (tipo === 'producto') {
      if (invFichaActual !== actual || actual.producto?.origen_registro !== 'SISTEMA') throw new Error('La ficha del producto cambió. Abra nuevamente la previsualización.');
      invPreviewContexto.datos = Object.freeze({ ...datos });
      invPreviewContexto.confirmacionValida = false;
      document.getElementById('inv-preview-cuerpo').innerHTML = invPreviewProductoHTML(datos) + (invProductoConfirmacionElegible(datos) ? invProductoConfirmacionHTML(datos) : '');
      return;
    }
    if (tipo === 'corregir_movimiento') {
      if (datos.ubicacion_id !== movimiento.ubicacion_id || datos.tipo !== movimiento.tipo) throw new Error('La respuesta no corresponde al movimiento seleccionado.');
      const c = invPreviewContexto;
      c.datos = Object.freeze({ ...datos });
      c.bodega = movimiento.ubicacion_nombre;
      document.getElementById('inv-preview-cuerpo').innerHTML = invCorreccionHTML(c);
      modal.querySelector('footer').hidden = true;
      return;
    }
    if (tipo === 'eliminar_movimiento') {
      if (datos.ubicacion_id !== movimiento.ubicacion_id) throw new Error('La respuesta no corresponde a la bodega del movimiento.');
      if (datos.tipo === 'LINEA_BASE') document.getElementById('inv-preview-titulo').textContent = 'Restablecer inventario inicial';
      invPreviewContexto.tipo = tipo;
      invPreviewContexto.datos = Object.freeze({ ...datos });
      invPreviewContexto.bodega = movimiento.ubicacion_nombre;
      invPreviewContexto.origen = actual.producto?.origen_registro;
      document.getElementById('inv-preview-cuerpo').innerHTML = invPreviewEliminacionMovimientoHTML(datos, movimiento.ubicacion_nombre, actual.producto?.origen_registro) + (invMovimientoConfirmable(datos) ? '<button type="button" onclick="invMovimientoConfirmarAbrir()" class="mt-4 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs">Preparar confirmación administrativa</button>' : '');
      return;
    }
  } catch (e) {
    if (secuencia !== invPreviewSecuencia || !invPreviewContexto) return;
    document.getElementById('inv-preview-cuerpo').innerHTML = '<p role="alert" class="text-sm text-rose-600 dark:text-rose-400">' + invEsc(invMensajeError(e)) + '</p><p class="text-xs mt-3">No se pudo determinar la elegibilidad. No se realizó ninguna modificación.</p>';
  }
}

function invUnidadNumerica(valor) {
  const texto = String(valor ?? '').trim();
  return texto !== '' && Number.isFinite(Number(texto.replace(',', '.')));
}
function invMovimientosAdvertenciaHTML(movimientos) {
  const unidades = [...new Set(movimientos.map(m => m.unidad_medida).filter(invUnidadNumerica))];
  return unidades.length ? '<p role="alert" class="text-xs text-amber-700 dark:text-amber-300 mb-3">Unidad registrada inválida (solo numérica): ' + unidades.map(invEsc).join(', ') + '. Se conserva el dato original; no se convirtió ninguna cantidad.</p>' : '';
}
function invMovimientoOperativoHTML(m) {
  const tipo = invEtiquetaTipoMovimiento(m.tipo);
  const numero = v => typeof v === 'number' && Number.isFinite(v);
  const mostrar = v => numero(v) ? invEsc(String(v)) : 'Sin dato registrado';
  const cantidad = m.cantidad, saldo = m.saldo_resultante;
  let cambio;
  if (m.tipo === 'LINEA_BASE') {
    cambio = 'Inventario inicial: ' + mostrar(saldo);
  } else {
    const direccion = m.tipo === 'ENTRADA' ? '+' : m.tipo === 'SALIDA' ? '-' : m.tipo === 'AJUSTE' && ['+','-'].includes(m.direccion) ? m.direccion : null;
    if (direccion && numero(cantidad) && cantidad >= 0 && numero(saldo)) {
      const anterior = Number((direccion === '+' ? saldo - cantidad : saldo + cantidad).toPrecision(15));
      cambio = (direccion === '+' ? '+' : '−') + mostrar(cantidad) + ' | Cantidad anterior: ' + mostrar(anterior) + ' → Cantidad nueva: ' + mostrar(saldo);
      if (m.tipo === 'AJUSTE') cambio = (direccion === '+' ? 'Ajuste: aumento · ' : 'Ajuste: disminución · ') + cambio;
    } else {
      cambio = 'Cantidad registrada: ' + mostrar(cantidad) + ' | Cantidad nueva: ' + mostrar(saldo) + '. No se puede determinar la cantidad anterior con los datos registrados.';
    }
  }
  const unidad = m.unidad_medida !== null && m.unidad_medida !== undefined && String(m.unidad_medida).trim() !== '' ? String(m.unidad_medida) : null;
  const secundaria = [invFechaHora(m.fecha), 'Bodega: ' + (m.ubicacion_nombre || 'Sin dato registrado'), 'Responsable: ' + (m.responsable_texto || 'Sin dato registrado'), 'Registrado por: ' + (m.registrado_por_nombre_snapshot || 'Sin dato registrado')];
  return '<li class="bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-3 space-y-2"><span class="inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full ' + tipo.clases + '">' + invEsc(tipo.texto) + '</span><p class="text-sm font-semibold break-words">' + cambio + '</p><p class="text-xs text-slate-500 dark:text-slate-400">Unidad: ' + (unidad === null ? 'Sin unidad registrada' : invEsc(unidad) + (invUnidadNumerica(unidad) ? ' (dato inválido; ver advertencia)' : '')) + '</p><p class="text-xs text-slate-500 dark:text-slate-400 break-words">' + secundaria.map(invEsc).join(' · ') + '</p>' +
    (numero(cantidad) && cantidad < 0 ? '<p class="text-xs text-amber-700 dark:text-amber-300">Cantidad registrada negativa: revise el dato original. No se invirtió el signo automáticamente.</p>' : '') +
    (m.tipo === 'AJUSTE' && !['+','-'].includes(m.direccion) ? '<p class="text-xs">Dirección registrada: ' + invEsc(m.direccion ?? 'Sin dato registrado') + '</p>' : '') +
    invMovimientoFormatoHTML(m) +
    (m.motivo ? '<details class="text-xs"><summary class="cursor-pointer">Motivo</summary><p class="mt-2 break-words">' + invEsc(m.motivo) + '</p></details>' : '') + invMovimientoCorreccionHTML(m) + '</li>';
}

function invPreviewEliminacionMovimientoHTML(d, bodega, origen) {
  const campo = (etiqueta, valor) => '<div><dt class="text-xs text-slate-500 dark:text-slate-400">' + etiqueta + '</dt><dd class="font-semibold break-words">' + invEsc(valor === null || valor === undefined ? 'Sin dato registrado / no corresponde' : valor) + '</dd></div>';
  let explicacion = 'La previsualización no permite la eliminación individual en las condiciones actuales.';
  if (d.eliminacion_individual_posible === true) {
    explicacion = 'El backend informa que la eliminación individual es potencialmente posible.';
    if (d.tipo === 'SALIDA' && typeof d.saldo_actual === 'number' && typeof d.saldo_previsto === 'number' && d.saldo_previsto >= d.saldo_actual) explicacion += ' Se recuperarían ' + Number((d.saldo_previsto - d.saldo_actual).toPrecision(15)) + ' de stock.';
    if (d.tipo === 'ENTRADA' && typeof d.saldo_actual === 'number' && typeof d.saldo_previsto === 'number' && d.saldo_actual >= d.saldo_previsto) explicacion += ' Se descontarían ' + Number((d.saldo_actual - d.saldo_previsto).toPrecision(15)) + ' del stock.';
    if (d.tipo === 'LINEA_BASE') explicacion += ' La bodega quedaría sin línea base confirmada; esto no equivale a una línea base de cero.';
  }
  if (d.movimientos_posteriores > 0) explicacion += ' Existen ' + d.movimientos_posteriores + ' movimientos posteriores que deben resolverse primero para no alterar la secuencia del inventario.';
  const procedencia = origen === 'CATALOGO_INICIAL' ? 'Producto histórico del catálogo inicial. Esta consulta no autoriza borrar el producto ni sus históricos importados.' : origen === 'SISTEMA' ? 'Producto creado en el sistema, según la ficha consultada.' : 'Origen del producto no disponible en la ficha; no se presume que sea un producto del sistema.';
  return '<p class="font-bold mb-2">Estado informado: ' + invEsc(d.estado.replace(/_/g, ' ')) + '</p><p class="text-xs mb-3">' + invEsc(explicacion) + '</p><p class="text-xs text-slate-500 dark:text-slate-400 mb-3">' + invEsc(procedencia) + '</p><dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">' +
    campo('Producto',d.producto) + campo('Bodega',bodega || d.ubicacion_id) + campo('Tipo',invEtiquetaTipoMovimiento(d.tipo).texto) + campo('Fecha y hora',invFechaHora(d.fecha)) + campo(d.tipo === 'LINEA_BASE' ? 'Cantidad inicial' : 'Cantidad registrada',d.cantidad) + campo('Unidad registrada',d.unidad) + campo(d.tipo === 'LINEA_BASE' ? 'Existencia actual' : 'Saldo actual',d.saldo_actual) + campo('Saldo anterior informado',d.saldo_anterior) + campo(d.tipo === 'LINEA_BASE' ? 'Situación después del restablecimiento' : 'Saldo previsto',d.tipo === 'LINEA_BASE' && d.saldo_previsto === null ? 'Sin línea base confirmada; existencia operativa retirada, no cantidad cero' : d.saldo_previsto) + campo('Movimientos posteriores',d.movimientos_posteriores) + campo('Otros movimientos de la bodega',d.otros_movimientos_bodega) + '</dl><p class="text-xs font-bold mt-4">' + (d.ejecucion_habilitada === true ? 'El backend informa ejecución habilitada. Una operación elegible requiere confirmación administrativa adicional.' : 'Ejecución no habilitada. Esta consulta no elimina registros ni modifica el stock.') + '</p>' + (invUnidadNumerica(d.unidad) ? '<p class="text-xs text-amber-700 dark:text-amber-300 mt-2">Unidad numérica inválida: se muestra el valor original sin convertir cantidades.</p>' : '');
}

function invBaseConfirmable(d) {
  return invEsAdminPermanente() && d?.tipo === 'LINEA_BASE' && d.estado === 'LINEA_BASE_ELIMINABLE' && d.eliminacion_individual_posible === true && d.movimientos_posteriores === 0 && typeof d.saldo_actual === 'number' && Number.isFinite(d.saldo_actual) && d.saldo_previsto === null;
}
function invMovimientoConfirmable(d) {
  if (d?.tipo === 'LINEA_BASE') return invBaseConfirmable(d);
  return invEsAdminPermanente() && d?.eliminacion_individual_posible === true && ['ENTRADA','SALIDA'].includes(d.tipo) && d.movimientos_posteriores === 0 && typeof d.saldo_actual === 'number' && Number.isFinite(d.saldo_actual) && typeof d.saldo_previsto === 'number' && Number.isFinite(d.saldo_previsto);
}
function invMovimientoConfirmarAbrir() {
  const c = invPreviewContexto;
  if (!c || c.tipo !== 'eliminar_movimiento' || c.enviando || !invMovimientoConfirmable(c.datos)) return;
  c.confirmandoMovimiento = true;
  c.desactualizada = false;
  const esBase = c.datos.tipo === 'LINEA_BASE';
  document.getElementById('inv-preview-titulo').textContent = esBase ? 'Restablecer inventario inicial' : 'Confirmar eliminación del movimiento';
  document.getElementById('inv-preview-cuerpo').innerHTML = invPreviewEliminacionMovimientoHTML(c.datos, c.bodega, c.origen) + '<p class="text-sm font-bold text-rose-600 dark:text-rose-400 my-3">La eliminación del movimiento es irreversible. Revise el stock actual y el stock previsto antes de confirmar.</p><label for="inv-mov-eliminar-motivo" class="block text-xs font-bold">Motivo obligatorio (10 a 1000 caracteres)</label><textarea id="inv-mov-eliminar-motivo" maxlength="1000" oninput="invMovimientoConfirmarValidar()" class="w-full border rounded-xl p-2 bg-white dark:bg-slate-800 mt-2 mb-3"></textarea><label class="flex items-start gap-2 text-sm"><input id="inv-mov-eliminar-aceptar" type="checkbox" onchange="invMovimientoConfirmarValidar()" />Confirmo la eliminación irreversible del movimiento seleccionado y el cambio de stock previsto.</label><p id="inv-mov-eliminar-error" role="alert" class="text-xs text-rose-600 dark:text-rose-400 mt-3"></p><p id="inv-mov-eliminar-progreso" role="status" class="text-xs mt-2"></p><div class="flex flex-wrap gap-3 mt-4"><button id="inv-mov-eliminar-final" disabled type="button" onclick="invMovimientoEliminarEnviar()" class="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold disabled:opacity-50">Eliminar movimiento definitivamente</button><button type="button" onclick="invMovimientoPreviewActualizar()" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">Actualizar consulta</button></div>';
  if (esBase) {
    const cuerpo = document.getElementById('inv-preview-cuerpo');
    cuerpo.innerHTML = cuerpo.innerHTML.replace('La eliminación del movimiento es irreversible. Revise el stock actual y el stock previsto antes de confirmar.', 'La bodega quedará sin línea base confirmada y se retirará su existencia operativa. No quedará un inventario inicial confirmado con cantidad cero. El producto y su evidencia administrativa se conservan.').replace('Confirmo la eliminación irreversible del movimiento seleccionado y el cambio de stock previsto.', 'Confirmo el restablecimiento del inventario inicial y que la bodega quedará sin línea base confirmada.').replace('Eliminar movimiento definitivamente', 'Restablecer inventario inicial');
  }
  document.getElementById('inv-mov-eliminar-motivo').focus();
}
function invMovimientoConfirmarValidar() {
  const c = invPreviewContexto, boton = document.getElementById('inv-mov-eliminar-final');
  if (!boton) return false;
  const motivo = invValor('inv-mov-eliminar-motivo').trim();
  const valido = !!c && c.confirmandoMovimiento === true && !c.enviando && !c.desactualizada && invMovimientoConfirmable(c.datos) && c.datos.ejecucion_habilitada === true && motivo.length >= 10 && motivo.length <= 1000 && document.getElementById('inv-mov-eliminar-aceptar')?.checked === true;
  boton.disabled = !valido;
  return valido;
}
async function invMovimientoPreviewActualizar() {
  const c = invPreviewContexto;
  if (!c || c.enviando || c.tipo !== 'eliminar_movimiento') return;
  const id = c.datos.movimiento_id;
  invCerrarPrevisualizacion();
  await invAbrirPrevisualizacion('eliminar_movimiento', id);
}
async function invMovimientoEliminarEnviar() {
  const c = invPreviewContexto;
  if (!invMovimientoConfirmarValidar()) return;
  const datos = c.datos, motivo = invValor('inv-mov-eliminar-motivo').trim();
  c.enviando = true;
  const modal = document.getElementById('inv-modal-preview');
  modal.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = true; });
  document.getElementById('inv-mov-eliminar-error').textContent = '';
  document.getElementById('inv-mov-eliminar-progreso').textContent = datos.tipo === 'LINEA_BASE' ? 'Procesando restablecimiento…' : 'Procesando eliminación…';
  try {
    const resultado = datos.tipo === 'LINEA_BASE' ? await window.InventarioService.restablecerLineaBase(datos, motivo) : await window.InventarioService.eliminarMovimiento(datos, motivo);
    if (datos.tipo === 'LINEA_BASE' ? !['LINEA_BASE_RESTABLECIDA','BASE_CERO_RESTABLECIDA'].includes(resultado?.resultado) : resultado?.resultado !== 'MOVIMIENTO_ELIMINADO') throw new Error(datos.tipo === 'LINEA_BASE' ? 'El restablecimiento no fue confirmado por Supabase.' : 'La eliminación no fue confirmada por Supabase.');
  } catch (e) {
    c.enviando = false;
    c.desactualizada = true;
    modal.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = false; });
    invMovimientoConfirmarValidar();
    document.getElementById('inv-mov-eliminar-progreso').textContent = '';
    document.getElementById('inv-mov-eliminar-error').textContent = invMensajeError(e) + (datos.tipo === 'LINEA_BASE' ? ' Actualice la previsualización y confirme nuevamente; no se confirmó el restablecimiento.' : ' Actualice la previsualización y confirme nuevamente; no se confirmó la eliminación.');
    return;
  }
  c.enviando = false;
  invCerrarPrevisualizacion();
  if (datos.tipo === 'LINEA_BASE') {
    delete invProductosRecientes[datos.producto_id];
    try {
      const producto = await window.InventarioService.obtenerProductoActual(datos.producto_id, datos.producto);
      invProductosRecientes[datos.producto_id] = producto;
      invEstado.productos = invEstado.productos.map(p => p.producto_id === datos.producto_id ? producto : p);
    } catch (e) {
      invFichaActual = null;
      invPintarFichaError(datos.producto_id, 'Restablecimiento confirmado, pero no se pudo releer el producto: ' + invMensajeError(e));
      await invCargarCatalogo(true);
      return;
    }
  }
  await invAbrirFicha(datos.producto_id, true);
  await invCargarCatalogo(true);
}

function invPreviewProductoHTML(d) {
  const estados = {
    ELIMINABLE_SIN_OPERACIONES: ['Eliminable sin operaciones', 'El producto no registra movimientos ni existencias.'],
    ELIMINABLE_CON_OPERACIONES: ['Eliminable con operaciones', 'La previsualización contempla eliminar también los movimientos y las existencias vinculadas.'],
    HISTORICO_PROTEGIDO: ['Histórico protegido', 'El producto pertenece al catálogo histórico y no puede eliminarse por esta vía.'],
    REQUIERE_CORRECCION_OPERATIVA: ['Requiere corrección operativa', 'Las operaciones vinculadas requieren revisión antes de eliminar el producto.'],
    REQUIERE_RESOLVER_AUDITORIA: ['Requiere resolver la auditoría', 'Los registros de auditoría requieren revisión previa.'],
    PENDIENTE_VERIFICAR_DEPENDENCIAS: ['Pendiente de verificar dependencias', 'El backend requiere verificar las dependencias antes de permitir la operación.']
  };
  const estado = estados[d.estado] || ['Estado informado', d.estado];
  const favorable = ['ELIMINABLE_SIN_OPERACIONES','ELIMINABLE_CON_OPERACIONES'].includes(d.estado) && d.eliminacion_permanente_habilitada === true && d.origen_registro === 'SISTEMA';
  const campo = (etiqueta, valor) => '<div><dt class="text-xs text-slate-500 dark:text-slate-400">' + etiqueta + '</dt><dd class="font-semibold break-words">' + invEsc(valor) + '</dd></div>';
  return '<h3 class="font-bold mb-2">' + invEsc(estado[0]) + '</h3><p class="text-xs mb-3">' + invEsc(estado[1]) + '</p><p class="text-xs mb-4">' + (favorable ? 'La previsualización es favorable. La eliminación requiere completar y aceptar la confirmación administrativa.' : 'Eliminación bloqueada o no habilitada por el backend. No se puede proceder desde esta pantalla.') + '</p><dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">' +
    campo('Producto', d.nombre) + campo('UUID del producto', d.producto_id) + campo('Origen del registro', d.origen_registro) + campo('Unidad de medida', d.unidad_medida === null ? 'Sin unidad definida' : d.unidad_medida) + (estados[d.estado] ? '' : campo('Estado recibido', d.estado)) + campo('Movimientos vinculados', d.movimientos) + campo('Registros de existencias', d.existencias) + campo('Auditorías del catálogo', d.auditorias) + campo('Anulaciones', d.anulaciones) + '</dl>' +
    (invUnidadNumerica(d.unidad_medida) ? '<p class="text-xs text-amber-700 dark:text-amber-300 mt-3">La unidad registrada es numérica. Se muestra su valor original sin convertir ni corregir datos.</p>' : '') +
    '<p class="text-xs font-bold text-rose-600 dark:text-rose-400 mt-4">Eliminar la ficha operativa y sus dependencias sería irreversible. Debe conservarse la evidencia administrativa y respetarse la protección de históricos.</p><p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Las operaciones administrativas anteriores conservan su evidencia independiente. Esta previsualización no presenta el recuento de esa bitácora. La elegibilidad de la previsualización no ejecuta por sí sola el borrado. Debe confirmar expresamente la eliminación del producto identificado por UUID.</p>';
}

function invProductoConfirmacionElegible(d) {
  return invEsAdminPermanente() && d?.origen_registro === 'SISTEMA' && d.eliminacion_permanente_habilitada === true && ['ELIMINABLE_SIN_OPERACIONES','ELIMINABLE_CON_OPERACIONES'].includes(d.estado) && typeof d.revision_confirmacion === 'string' && d.revision_confirmacion.trim() !== '';
}
function invProductoConfirmacionHTML(datos) {
  return '<section class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700"><h3 class="text-sm font-bold mb-3">Preparar confirmación administrativa</h3><label for="inv-producto-confirmar-nombre" class="block text-xs font-bold">Nombre exacto del producto</label><input id="inv-producto-confirmar-nombre" autocomplete="off" oninput="invProductoConfirmacionValidar()" class="w-full border rounded-xl p-2 bg-white dark:bg-slate-800 mt-2 mb-3" /><label for="inv-producto-confirmar-motivo" class="block text-xs font-bold">Motivo obligatorio (10 a 1000 caracteres)</label><textarea id="inv-producto-confirmar-motivo" maxlength="1000" oninput="invProductoConfirmacionValidar()" class="w-full border rounded-xl p-2 bg-white dark:bg-slate-800 mt-2 mb-3"></textarea><label class="flex items-start gap-2 text-sm"><input id="inv-producto-confirmar-aceptar" type="checkbox" onchange="invProductoConfirmacionValidar()" />Reconozco que la eliminación será irreversible y retirará la ficha y las dependencias operativas permitidas, conservando la evidencia administrativa independiente.</label><p id="inv-producto-confirmar-mensaje" role="status" class="text-xs mt-3"></p><p class="text-xs font-bold text-amber-700 dark:text-amber-300 mt-3">' + (window.InventarioService.eliminacionProductoHabilitada?.(datos?.producto_id) === true ? 'La ejecución está habilitada para productos elegibles. Revise los datos antes de solicitar una eliminación irreversible.' : 'La eliminación completa permanece deshabilitada. Puede consultar la previsualización y preparar la confirmación, sin ejecutar cambios.') + '</p><div class="flex flex-wrap gap-3 mt-3"><button id="inv-producto-confirmar-final" type="button" disabled onclick="invProductoEliminarEnviar()" class="px-4 py-2 rounded-xl bg-rose-600 text-white font-bold text-xs disabled:opacity-50">Eliminar producto definitivamente</button><button type="button" onclick="invProductoConfirmacionActualizar()" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">Actualizar previsualización</button></div></section>';
}
function invProductoConfirmacionRequisitos(d, nombre, motivo, aceptado) {
  if (!invProductoConfirmacionElegible(d)) return 'La previsualización no permite preparar esta confirmación.';
  if (nombre !== d.nombre) return 'Escriba exactamente el nombre del producto, respetando mayúsculas, espacios y caracteres.';
  const largo = motivo.trim().length;
  if (largo < 10 || largo > 1000) return 'El motivo debe contener entre 10 y 1000 caracteres, sin contar espacios al inicio o al final.';
  if (aceptado !== true) return 'Debe marcar la confirmación explícita de las consecuencias.';
  return '';
}
function invProductoConfirmacionValidar() {
  const c = invPreviewContexto, boton = document.getElementById('inv-producto-confirmar-final');
  if (!boton) return false;
  boton.disabled = true;
  const vigente = c?.tipo === 'producto' && c.datos && !c.enviando && !c.desactualizada && invFichaActual === c.fichaActual && invFichaActual?.producto_id === c.datos.producto_id && invFichaActual?.producto?.origen_registro === 'SISTEMA';
  const error = vigente ? invProductoConfirmacionRequisitos(c.datos, invValor('inv-producto-confirmar-nombre'), invValor('inv-producto-confirmar-motivo'), document.getElementById('inv-producto-confirmar-aceptar')?.checked) : 'La referencia al producto cambió. Actualice la previsualización y confirme nuevamente.';
  if (c) c.confirmacionValida = vigente && error === '';
  const habilitado = !!c?.confirmacionValida && window.InventarioService.eliminacionProductoHabilitada?.(c.datos.producto_id) === true;
  boton.disabled = !habilitado;
  const mensaje = document.getElementById('inv-producto-confirmar-mensaje');
  if (mensaje) mensaje.textContent = error || (habilitado ? 'Confirmación válida para este producto identificado por UUID. Revise los datos antes de solicitar la eliminación irreversible.' : 'La eliminación completa permanece deshabilitada. No se enviará ninguna solicitud de borrado.');
  return habilitado;
}
async function invProductoConfirmacionActualizar() {
  const c = invPreviewContexto;
  if (!c || c.tipo !== 'producto' || !c.datos || c.enviando) return;
  const id = c.datos.producto_id;
  c.confirmacionValida = false;
  c.desactualizada = true;
  invCerrarPrevisualizacion();
  await invAbrirPrevisualizacion('producto', id);
}

// Flujo general por UUID; autorización, previsualización y confirmación obligatorias.
async function invProductoEliminarEnviar() {
  const c = invPreviewContexto;
  if (!invProductoConfirmacionValidar()) return;
  if (window.InventarioService.eliminacionProductoHabilitada?.(c.datos.producto_id) !== true) {
    document.getElementById('inv-producto-confirmar-mensaje').textContent = 'La ejecución sigue deshabilitada. No se envió ninguna solicitud de eliminación.';
    return;
  }
  const datos = c.datos;
  const parametros = Object.freeze({ productoId:datos.producto_id, nombreConfirmado:invValor('inv-producto-confirmar-nombre'), unidadEsperada:datos.unidad_medida, revisionConfirmacion:datos.revision_confirmacion, motivo:invValor('inv-producto-confirmar-motivo').trim() });
  c.enviando = true;
  c.confirmacionValida = false;
  const modal = document.getElementById('inv-modal-preview');
  modal.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = true; });
  const vigente = () => invPreviewContexto === c && c.tipo === 'producto' && !c.desactualizada && c.datos === datos && invFichaActual === c.fichaActual && invFichaSolicitada === datos.producto_id && invFichaActual?.producto_id === datos.producto_id && invFichaActual?.producto?.origen_registro === 'SISTEMA' && invEsAdminPermanente();
  try {
    const resultado = await window.InventarioService.eliminarProducto(parametros, vigente);
    if (resultado?.resultado !== 'ELIMINADO_PERMANENTEMENTE' || resultado.producto_id !== datos.producto_id) {
      const error = new Error('El resultado de la eliminación no pudo confirmarse. Verifique el producto y la bitácora antes de reintentar.');
      error.tipoResultado = 'incierto';
      throw error;
    }
  } catch (e) {
    c.enviando = false;
    c.desactualizada = true;
    c.confirmacionValida = false;
    if (invPreviewContexto !== c) return;
    modal.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = false; });
    invProductoConfirmacionValidar();
    document.getElementById('inv-producto-confirmar-mensaje').textContent = invMensajeError(e) + (e?.tipoResultado === 'incierto' ? ' No se mostrará éxito ni se retirará la ficha con este resultado incierto. No reintente el borrado sin comprobar el estado real.' : e?.tipoResultado === 'rechazado' ? ' El backend rechazó la operación. Actualice la previsualización y confirme nuevamente.' : ' No se confirmó la eliminación. Actualice la previsualización antes de preparar otra operación.');
    return;
  }
  c.enviando = false;
  ++invCatalogoRevision;
  delete invProductosRecientes[datos.producto_id];
  delete invFichaPendientes[datos.producto_id];
  invEstado.productos = invEstado.productos.filter(p => p.producto_id !== datos.producto_id);
  invSugResetear();
  if (invPreviewContexto === c) invCerrarPrevisualizacion();
  if (invFichaSolicitada === datos.producto_id) {
    invCerrarFicha();
    invFichaActual = null;
    invFichaMovimientos = { items:[], total:0, limite:INV_TAMANO_MOVIMIENTOS, cargando:false, error:null };
  }
  invProductoEliminadoAvisar();
  await invCargarCatalogo(true);
}

function invProductoEliminadoAvisar() {
  // Reutiliza el toast existente; no añade otro sistema de notificaciones.
  pvToast('inv-producto-eliminado-aviso', 'Producto eliminado correctamente\nLa ficha fue retirada del Inventario.', 'bg-emerald-600');
  const aviso = document.getElementById('inv-producto-eliminado-aviso');
  aviso.setAttribute('role', 'status');
  aviso.setAttribute('aria-live', 'polite');
  aviso.setAttribute('aria-atomic', 'true');
  aviso.style.whiteSpace = 'pre-line';
  aviso.style.maxWidth = 'calc(100vw - 3rem)';
  aviso.style.pointerEvents = 'none';
}

const INV_UNIDADES_ALIAS = {
  Unidad:'un unidades ud uds unid', Pieza:'pza piezas', Par:'pares', Juego:'set juegos', Docena:'doc docenas', Caja:'cajas', Paquete:'paq paquetes', Bolsa:'bolsas', Saco:'sacos', Rollo:'rollos', Botella:'bot botellas', Bidón:'bidon bidones', Lata:'latas', Tubo:'tubos', Cartucho:'cartuchos', Bobina:'bobinas', Tambor:'tambores', Pallet:'palet pallets',
  Litro:'l lt lts litros', Mililitro:'ml mililitros', 'Metro cúbico':'m3 metros cubicos', Galón:'gal galon galones', Kilogramo:'kg kilo kilos kilogramos', Gramo:'g gr gramos', Tonelada:'t ton toneladas', Metro:'m mt metros', Centímetro:'cm centimetros', Milímetro:'mm milimetros', 'Metro cuadrado':'m2 metros cuadrados'
};
function invUnidadNormalizar(texto) { return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
function invUnidadSelectorHTML(prefijo, est, clases) {
  const conocida = INV_UNIDADES.some(([,lista]) => lista.includes(est.unidad));
  const opcion = est.unidadOpcion ?? (est.unidad ? (conocida ? est.unidad : '__otra__') : '');
  const texto = opcion === '__otra__' ? 'Otra unidad…' : opcion;
  return '<div data-unidad-control="' + prefijo + '" class="relative" onfocusout="invUnidadSalir(event,this)"><input id="' + prefijo + '-unidad" type="hidden" value="' + invEsc(opcion) + '" /><input id="' + prefijo + '-unidad-texto" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="' + prefijo + '-unidad-lista" autocomplete="off" required placeholder="Seleccionar unidad" value="' + invEsc(texto) + '" data-prefijo="' + prefijo + '" onclick="invUnidadMostrar(this,true)" oninput="invUnidadFiltrar(this)" onkeydown="invUnidadTecla(event,this)" class="' + clases + '" /><div id="' + prefijo + '-unidad-lista" role="listbox" aria-label="Unidades de medida" hidden class="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm shadow-lg">' +
    INV_UNIDADES.map(([grupo,lista],g) => '<div role="group" aria-label="' + invEsc(grupo) + '"><p class="text-xs font-bold text-slate-500 dark:text-slate-400 px-3 py-2">' + invEsc(grupo) + '</p>' + lista.map((u,i) => invUnidadOpcionHTML(prefijo, u, u, g + '-' + i)).join('') + '</div>').join('') + invUnidadOpcionHTML(prefijo,'__otra__','Otra unidad…','otra') + '</div><div id="' + prefijo + '-unidad-otra" class="mt-3" ' + (opcion === '__otra__' ? '' : 'hidden') + '><label for="' + prefijo + '-unidad-personalizada" class="block text-xs font-bold mb-2">Especifique la unidad *</label><input id="' + prefijo + '-unidad-personalizada" type="text" oninput="invCantidadActualizarControl(this)" value="' + invEsc(est.unidadPersonalizada ?? (conocida ? '' : est.unidad || '')) + '" ' + (opcion === '__otra__' ? 'required' : 'disabled') + ' class="' + clases + '" /></div></div>';
}
function invUnidadOpcionHTML(prefijo, valor, texto, indice) {
  return '<button type="button" role="option" aria-selected="false" tabindex="-1" id="' + prefijo + '-unidad-op-' + indice + '" data-unidad="' + invEsc(valor) + '" data-busqueda="' + invEsc(invUnidadNormalizar(texto + ' ' + (INV_UNIDADES_ALIAS[valor] || ''))) + '" onmousedown="event.preventDefault()" onclick="invUnidadElegir(this)" class="block w-full text-left px-3 py-2">' + invEsc(texto) + '</button>';
}
function invUnidadMostrar(input, restablecer) {
  const lista = document.getElementById(input.dataset.prefijo + '-unidad-lista');
  if (!lista) return;
  if (restablecer) {
    input.removeAttribute('aria-activedescendant');
    [...lista.querySelectorAll('[role="option"]')].forEach(op => { op.hidden = false; op.setAttribute('aria-selected','false'); op.classList.remove('bg-blue-50','dark:bg-slate-800'); });
    [...lista.querySelectorAll('[role="group"]')].forEach(grupo => { grupo.hidden = false; });
  }
  lista.hidden = false;
  input.setAttribute('aria-expanded','true');
}
function invUnidadFiltrar(input) {
  const prefijo = input.dataset.prefijo, lista = document.getElementById(prefijo + '-unidad-lista');
  if (!lista) return;
  document.getElementById(prefijo + '-unidad').value = '';
  input.removeAttribute('aria-activedescendant');
  invUnidadMostrar(input);
  const consulta = invUnidadNormalizar(input.value);
  [...lista.querySelectorAll('[role="option"]')].forEach(op => { op.hidden = op.dataset.unidad !== '__otra__' && consulta !== '' && !op.dataset.busqueda.includes(consulta); op.setAttribute('aria-selected','false'); op.classList.remove('bg-blue-50','dark:bg-slate-800'); });
  [...lista.querySelectorAll('[role="group"]')].forEach(grupo => { grupo.hidden = [...grupo.querySelectorAll('[role="option"]')].every(op => op.hidden); });
  document.getElementById(prefijo + '-unidad-otra').hidden = true;
  document.getElementById(prefijo + '-unidad-personalizada').disabled = true;
}
function invUnidadTecla(evento, input) {
  const lista = document.getElementById(input.dataset.prefijo + '-unidad-lista');
  if (!lista) return;
  if (evento.key === 'Escape' || evento.key === 'Tab') {
    lista.hidden = true; input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant');
    if (evento.key === 'Escape') { evento.stopPropagation(); evento.preventDefault(); }
    return;
  }
  if (!['ArrowDown','ArrowUp','Enter'].includes(evento.key)) return;
  if (evento.key === 'Enter' && lista.hidden) return;
  evento.preventDefault(); invUnidadMostrar(input, lista.hidden);
  const opciones = [...lista.querySelectorAll('[role="option"]')].filter(op => !op.hidden);
  if (!opciones.length) return;
  const actual = opciones.findIndex(op => op.id === input.getAttribute('aria-activedescendant'));
  if (evento.key === 'Enter') { if (actual >= 0) invUnidadElegir(opciones[actual]); return; }
  const indice = evento.key === 'ArrowDown' ? (actual + 1) % opciones.length : (actual <= 0 ? opciones.length - 1 : actual - 1);
  opciones.forEach((op,i) => { op.setAttribute('aria-selected',String(i === indice)); op.classList.toggle('bg-blue-50',i === indice); op.classList.toggle('dark:bg-slate-800',i === indice); });
  input.setAttribute('aria-activedescendant',opciones[indice].id);
  opciones[indice].scrollIntoView?.({block:'nearest'});
}
function invUnidadElegir(boton) {
  const contenedor = boton.closest('[data-unidad-control]'), prefijo = contenedor.dataset.unidadControl;
  const valor = boton.dataset.unidad;
  if (valor !== '__otra__' && !INV_UNIDADES.some(([,lista]) => lista.includes(valor))) return;
  document.getElementById(prefijo + '-unidad').value = valor;
  const input = document.getElementById(prefijo + '-unidad-texto');
  input.value = valor === '__otra__' ? 'Otra unidad…' : valor;
  const otra = document.getElementById(prefijo + '-unidad-personalizada');
  otra.disabled = valor !== '__otra__';
  document.getElementById(prefijo + '-unidad-otra').hidden = valor !== '__otra__';
  document.getElementById(prefijo + '-unidad-lista').hidden = true;
  input.setAttribute('aria-expanded','false');
  if (prefijo === 'inv-nuevo') invNuevoCambiarUnidad(); else invOpCambiarUnidad();
  document.getElementById(prefijo + (valor === '__otra__' ? '-unidad-personalizada' : '-unidad-texto'))?.focus();
}
function invUnidadSalir(evento, contenedor) {
  if (contenedor.contains(evento.relatedTarget)) return;
  const prefijo = contenedor.dataset.unidadControl;
  const lista = document.getElementById(prefijo + '-unidad-lista'), input = document.getElementById(prefijo + '-unidad-texto');
  if (lista) lista.hidden = true;
  if (input) input.setAttribute('aria-expanded','false');
}
function invUnidadLeer(est, prefijo) {
  const opcion = invValor(prefijo + '-unidad'), texto = invValor(prefijo + '-unidad-texto');
  const valida = opcion === '__otra__' ? texto === 'Otra unidad…' : INV_UNIDADES.some(([,lista]) => lista.includes(opcion)) && texto === opcion;
  est.unidadOpcion = valida ? opcion : '';
  est.unidadPersonalizada = invValor(prefijo + '-unidad-personalizada');
  est.unidad = !valida ? '' : opcion === '__otra__' ? est.unidadPersonalizada : opcion;
}
function invNuevoCambiarUnidad() {
  if (!invNuevoEstado || invNuevoEstado.enviando) return;
  invNuevoLeerFormulario();
  invNuevoPintar();
}
async function invNuevoCambiarInicial() {
  const est = invNuevoEstado;
  if (!est || est.enviando) return;
  invNuevoLeerFormulario();
  if (est.registrarInicial && !invEstado.bodegas.length) {
    est.enviando = true;
    invNuevoPintar();
    await invCargarBodegas(false);
    if (invNuevoEstado !== est) return;
    if (est.paso === 'form') invNuevoLeerFormulario();
    est.enviando = false;
  }
  invNuevoPintar();
}
function invCantidadInicial(valor) {
  const texto = String(valor ?? '').trim().replace(',', '.');
  const numero = texto === '' ? NaN : Number(texto);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}
function invNuevoInicialHTML(est, clases) {
  const pendiente = est.cantidadPendiente === true;
  const unidad = est.unidad ? ' (' + invEsc(est.unidad) + ')' : '';
  const etiqueta = 'block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2';
  return '<div class="mt-3"><label for="inv-nuevo-cantidad" class="' + etiqueta + '">Cantidad disponible' + unidad + (pendiente ? '' : ' *') + '</label><input id="inv-nuevo-cantidad" type="number" min="0" step="' + (invUnidadEntera(est.unidad) ? '1' : 'any') + '" inputmode="' + (invUnidadEntera(est.unidad) ? 'numeric' : 'decimal') + '" value="' + invEsc(est.cantidadInicial ?? '') + '" ' + (pendiente ? 'disabled' : 'required') + ' class="' + clases + '" /><p class="text-sm text-slate-500 dark:text-slate-400 mt-1.5">Si no hay unidades, escribe 0</p><div class="mt-3"><label for="inv-nuevo-bodega" class="' + etiqueta + '">Bodega' + (pendiente ? '' : ' *') + '</label><select id="inv-nuevo-bodega" ' + (pendiente ? 'disabled' : 'required') + ' class="' + clases + '"><option value="">Seleccione una bodega</option>' + invEstado.bodegas.map(b => '<option value="' + invEsc(b.id) + '" ' + (est.bodegaInicial === b.id ? 'selected' : '') + '>' + invEsc(b.nombre) + '</option>').join('') + '</select></div>' + (invEstado.bodegasError && !pendiente ? '<p role="alert" class="text-sm text-rose-600 dark:text-rose-400 mt-2">' + invEsc(invEstado.bodegasError) + '</p>' : '') + '<label class="flex gap-2 items-start text-sm text-slate-600 dark:text-slate-300 mt-3"><input id="inv-nuevo-pendiente" type="checkbox" ' + (pendiente ? 'checked' : '') + ' onchange="invNuevoCambiarInicial()" />Aún no conozco la cantidad</label></div>';
}
function invNuevoInicialResumenHTML(est) {
  if (!est.registrarInicial) return '<p class="text-xs mt-3">Sin línea base registrada. Solo se creará la ficha; no se registrará cantidad.</p>';
  const bodega = invEstado.bodegas.find(b => b.id === est.bodegaInicial);
  return '<p class="text-sm mt-3">Existencia inicial: <strong>' + invEsc(est.cantidadInicial) + '</strong> · Unidad: <strong>' + invEsc(est.unidad) + '</strong> · Bodega: <strong>' + invEsc(bodega?.nombre || 'Bodega no disponible') + '</strong></p><p class="text-xs mt-2">Primero se creará la ficha y después se confirmará la línea base. Si el segundo paso falla, la ficha permanecerá creada.</p>';
}
function invNuevoInicialEstadoHTML(est) {
  if (!est.registrarInicial) return 'Stock inicial pendiente. No se registraron cantidades.';
  if (est.baseEstado === 'confirmada') return 'Existencia inicial confirmada: ' + invEsc(est.baseCantidadConfirmada) + ' · ' + invEsc(est.unidad);
  if (est.baseEstado === 'existente') return 'La bodega ya tiene una línea base confirmada. No se registró otra; revise la ficha.';
  return est.enviando ? 'Ficha creada. Consultando y registrando la existencia inicial…' : 'Ficha creada; la existencia inicial todavía no pudo completarse.';
}
async function invNuevoGuardarInicial(estado) {
  const est = estado || invNuevoEstado;
  if (!est || invNuevoEstado !== est || est.paso !== 'exito' || !est.productoId || !est.registrarInicial || est.enviando || !invPuedeEscribir() || ['confirmada','existente'].includes(est.baseEstado)) return;
  const cantidad = invCantidadInicial(est.cantidadInicial);
  const errorUnidad = invCantidadErrorUnidad(cantidad, est.unidad);
  if (errorUnidad) { est.baseError = errorUnidad; invNuevoPintar(); return; }
  if (cantidad === null || !invEstado.bodegas.some(b => b.id === est.bodegaInicial)) { est.baseError = 'Revise la bodega y el conteo inicial; la ficha ya está creada.'; invNuevoPintar(); return; }
  est.enviando = true;
  est.baseError = null;
  invNuevoPintar();
  try {
    const servicio = window.InventarioService;
    const producto = await servicio.obtenerProductoActual(est.productoId, est.nombre);
    if (invNuevoEstado !== est) return;
    invProductosRecientes[est.productoId] = producto;
    if (producto.unidad_medida !== est.unidad) throw new Error('UNIDAD_NO_COINCIDE: la unidad guardada no coincide con la confirmada. Revise la ficha antes de continuar.');
    let existencias = await servicio.obtenerExistencias(est.productoId, true);
    if (invNuevoEstado !== est) return;
    const previa = existencias.find(e => e.ubicacion_id === est.bodegaInicial && e.linea_base_confirmada === true);
    if (previa) { est.baseEstado = 'existente'; return; }
    if (!invPuedeEscribir()) throw new Error('No tiene autorización vigente para registrar la existencia inicial.');
    await servicio.confirmarLineaBase({ productoId:est.productoId, ubicacionId:est.bodegaInicial, cantidadContada:cantidad, unidadMedida:producto.unidad_medida, responsableTexto:null });
    if (invNuevoEstado !== est) return;
    existencias = await servicio.obtenerExistencias(est.productoId, true);
    const confirmada = existencias.find(e => e.ubicacion_id === est.bodegaInicial && e.linea_base_confirmada === true);
    if (!confirmada) throw new Error('No se pudo verificar la línea base. Consulte la ficha antes de reintentar.');
    est.baseEstado = 'confirmada';
    est.baseCantidadConfirmada = confirmada.cantidad;
  } catch (e) {
    if (invNuevoEstado === est) { est.baseEstado = 'pendiente'; est.baseError = invMensajeError(e) + ' La ficha permanece creada. El estado de la existencia inicial debe verificarse antes de volver a confirmar.'; }
  } finally {
    if (invNuevoEstado === est) {
      est.enviando = false;
      invNuevoPintar();
      if (!estado) invCargarCatalogo(true);
    }
  }
}

function invFichaPanelCambiar(elemento, panel) {
  const id = elemento.dataset.producto;
  if (!id || invFichaActual?.producto_id !== id || !['stock','historial'].includes(panel)) return;
  if (!invFichaPaneles[id]) invFichaPaneles[id] = { stock:false, historial:false };
  invFichaPaneles[id][panel] = elemento.open;
  if (panel === 'historial' && elemento.open) invHistorialRecalcular();
}

function invHistorialLiberar() {
  invHistorialObserver?.disconnect();
  invHistorialObserver = null;
  invHistorialContenedor = null;
  window.removeEventListener('resize', invHistorialRecalcular);
}

function invHistorialPreparar(contenedor) {
  invHistorialLiberar();
  invHistorialContenedor = contenedor.querySelector('[data-inv-historial]');
  if (!invHistorialContenedor) return;
  if (typeof ResizeObserver === 'function') {
    invHistorialObserver = new ResizeObserver(invHistorialRecalcular);
    invHistorialObserver.observe(invHistorialContenedor);
    [...invHistorialContenedor.querySelectorAll('ul > li')].slice(0, 2).forEach(tarjeta => invHistorialObserver.observe(tarjeta));
  }
  window.addEventListener('resize', invHistorialRecalcular);
  invHistorialRecalcular();
}

function invHistorialRecalcular() {
  const caja = invHistorialContenedor;
  if (!caja?.isConnected) return;
  const tarjetas = caja.querySelectorAll('ul > li');
  if (tarjetas.length <= 2) return;
  const primera = tarjetas[0].getBoundingClientRect();
  const segunda = tarjetas[1].getBoundingClientRect();
  if (!primera.height || !segunda.height) return; // Acordeón cerrado.
  const estilo = getComputedStyle(caja);
  const dosTarjetas = segunda.bottom - primera.top + (parseFloat(estilo.paddingTop) || 0) + (parseFloat(estilo.paddingBottom) || 0);
  const altura = Math.ceil(Math.min(dosTarjetas, Math.max(160, window.innerHeight * 0.55)));
  const limite = altura + 'px';
  if (caja.style.maxHeight !== limite) caja.style.maxHeight = limite;
}
function invFichaStockResumenHTML(existencias) {
  const verificadas = existencias.filter(e => e.linea_base_confirmada === true && typeof e.cantidad === 'number' && Number.isFinite(e.cantidad));
  if (!verificadas.length) return '<p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Sin stock operativo verificado. Consulte el estado de la línea base por bodega.</p>';
  if (verificadas.length === 1) return '<p class="text-xs font-semibold mb-3">Stock actual verificado · ' + invEsc(verificadas[0].ubicacion_nombre || 'Bodega sin nombre') + ': ' + invEsc(verificadas[0].cantidad) + (verificadas[0].cantidad === 0 ? ' (cantidad cero confirmada)' : ' (cantidad confirmada)') + '. Unidad indicada en la cabecera.</p>';
  return '<p class="text-xs font-semibold mb-3">Stock operativo verificado en ' + verificadas.length + ' bodegas. Consulte las cantidades por bodega; no se suman registros históricos.</p>';
}

function invNuevoCoincidenciasAccionesHTML(coincidencias) {
  if (!Array.isArray(coincidencias) || !coincidencias.length) return '<p class="text-xs">El servidor no devolvió identificadores de coincidencias. Consulte el catálogo; no se abrirá una ficha por nombre.</p>';
  return '<div class="space-y-3">' + coincidencias.map((c,i) => {
    const nombre = typeof c === 'string' ? c : c?.nombre || c?.nombre_producto || 'Sin nombre registrado';
    const id = c && typeof c === 'object' ? c.producto_id || c.id : null;
    const uuid = typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    return '<div class="border border-slate-200 dark:border-slate-700 rounded-xl p-3"><p class="font-bold text-sm">' + invEsc(nombre) + '</p>' + invPresentacionHTML(c) + '<p class="text-xs text-slate-500 dark:text-slate-400">Unidad: ' + invEsc(c?.unidad_medida ?? 'Sin unidad definida') + ' · Procedencia: ' + invEsc(c?.origen_registro ? invEtiquetaOrigen(c.origen_registro).texto : c?.material_id ? 'Material histórico sin ficha' : 'No disponible') + '</p>' + (uuid ? '<p class="text-xs break-words text-slate-500 dark:text-slate-400">UUID: ' + invEsc(id) + '</p><button type="button" onclick="invNuevoUsarCoincidencia(' + i + ')" class="text-xs font-bold text-blue-600 dark:text-blue-400 py-2">Es el mismo producto, quiero agregar cantidad</button>' : '<p class="text-xs">Sin UUID de producto verificable. Consulte el catálogo.</p>') + '</div>';
  }).join('') + '</div>';
}
async function invNuevoUsarCoincidencia(indice) {
  const est = invNuevoEstado;
  if (!est || est.enviando || !invPuedeEscribir() || !['duplicado','homonimo'].includes(est.paso)) return;
  const c = est.coincidencias?.[indice];
  const id = c && typeof c === 'object' ? c.producto_id || c.id : null;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
  est.enviando = true;
  est.error = null;
  invNuevoPintar();
  try {
    const producto = await window.InventarioService.obtenerProductoActual(id, c.nombre || c.nombre_producto || est.nombre);
    if (invNuevoEstado !== est) return;
    if (producto.producto_id !== id) throw new Error('La respuesta no corresponde al UUID seleccionado.');
    invProductosRecientes[id] = producto;
    est.enviando = false;
    invCerrarModalNuevoForzado();
    await invAbrirFicha(id, true);
  } catch (e) {
    if (invNuevoEstado !== est) return;
    est.enviando = false;
    est.error = invMensajeError(e);
    invNuevoPintar();
  }
}

function invPresentacionHTML(producto) {
  const texto = producto?.presentacion;
  return typeof texto === 'string' && texto.trim() ? '<p class="text-xs text-slate-500 dark:text-slate-400 mt-1.5 break-words">Presentación: ' + invEsc(texto) + '</p>' : '';
}
function invNuevoMensajeDuplicado(respuesta) {
  const mensajes = {
    COINCIDENCIA_EXACTA: 'Ya existe esa combinación de nombre, unidad y presentación. Puede abrir la ficha indicada; no se creó otro producto.',
    COINCIDENCIAS_EXACTAS_MULTIPLES: 'Existen varias fichas con los mismos datos. No se seleccionó ninguna automáticamente. Revise los UUID antes de abrir una ficha.',
    PRESENTACION_NO_DETERMINADA: 'La presentación de alguno de los productos se desconoce. No puede confirmarse otra variante. Use un nombre comercial diferenciado solo si corresponde a una característica verificable.',
    PRESENTACION_NO_DIFERENCIADA: 'Cambiar solo la unidad no acredita una presentación diferente. Revise las fichas existentes.',
    REQUIERE_CONFIRMAR_PRESENTACION: 'Existen productos del mismo nombre con presentaciones diferentes. Revise los candidatos y confirme expresamente si corresponde crear otra variante.',
    PRESENTACION_HISTORICA_NO_DETERMINADA: 'Existe un material histórico sin presentación conocida ni ficha vinculada. No se creará ni vinculará automáticamente otro producto.'
  };
  return mensajes[respuesta?.estado || respuesta?.motivo] || 'El servidor detectó coincidencias. Seleccione expresamente una ficha por UUID o revise los datos. La cantidad no distingue productos.';
}

// Solo unidades reconocidas de conteo; no inferir reglas de textos históricos.
const INV_UNIDADES_ENTERAS = ['Unidad','Pieza','Par','Juego','Docena','Caja','Paquete','Bolsa','Botella','Bidón','Lata','Tubo','Cartucho','Tambor','Pallet'];
function invUnidadEntera(unidad) {
  const clave = invUnidadNormalizar(unidad);
  return INV_UNIDADES_ENTERAS.some(u => invUnidadNormalizar(u) === clave || String(INV_UNIDADES_ALIAS[u] || '').split(' ').some(alias => invUnidadNormalizar(alias) === clave));
}
function invCantidadErrorUnidad(cantidad, unidad) {
  return Number.isFinite(cantidad) && invUnidadEntera(unidad) && !Number.isSafeInteger(cantidad)
    ? 'Para la unidad «' + unidad + '» debes ingresar un número entero válido.' : null;
}
function invUnidadCantidadTexto(unidad, cantidad) {
  const plurales = {Unidad:'unidades',Pieza:'piezas',Par:'pares',Juego:'juegos',Docena:'docenas',Caja:'cajas',Paquete:'paquetes',Bolsa:'bolsas',Botella:'botellas',Bidón:'bidones',Lata:'latas',Tubo:'tubos',Cartucho:'cartuchos',Tambor:'tambores',Pallet:'pallets'};
  if (!unidad) return 'Sin unidad registrada';
  const clave = invUnidadNormalizar(unidad);
  const canonica = INV_UNIDADES_ENTERAS.find(u => invUnidadNormalizar(u) === clave || String(INV_UNIDADES_ALIAS[u] || '').split(' ').some(alias => invUnidadNormalizar(alias) === clave));
  return canonica ? (cantidad === 1 ? canonica.toLowerCase() : plurales[canonica]) : unidad;
}
function invCantidadActualizarControl(input) {
  const prefijo = input.closest('[data-unidad-control]')?.dataset.unidadControl;
  if (!prefijo) return;
  const cantidad = document.getElementById(prefijo + '-cantidad');
  if (!cantidad) return;
  const entera = invUnidadEntera(input.value);
  cantidad.step = entera ? '1' : 'any';
  cantidad.inputMode = entera ? 'numeric' : 'decimal';
  cantidad.min = prefijo === 'inv-nuevo' || invOpEstado?.tipo === 'linea_base' ? '0' : entera ? '1' : '0.01';
}

function invMovimientoCorreccionHTML(m) {
  const vinculo = (m.movimiento_corregido === true || m.ajuste_compensatorio === true)
    ? '<p class="text-xs font-bold text-amber-700 dark:text-amber-300">' + (m.ajuste_compensatorio === true ? 'Corrección de movimiento' : 'Movimiento corregido') + '</p><details class="text-xs"><summary class="cursor-pointer">Ver vínculo de corrección</summary><p class="mt-2 break-words">Original: ' + invEsc(m.movimiento_original_id ?? 'No disponible') + '</p><p class="break-words">Ajuste: ' + invEsc(m.movimiento_ajuste_id ?? 'No disponible') + '</p></details>' : '';
  if (!invEsAdminPermanente() || !m.movimiento_id) return vinculo;
  const base = m.tipo === 'LINEA_BASE';
  if (!base && (!['ENTRADA','SALIDA'].includes(m.tipo) || m.movimiento_corregido === true || m.ajuste_compensatorio === true)) return vinculo;
  return vinculo + '<button type="button" data-id="' + invEsc(m.movimiento_id) + '" onclick="invAbrirPrevisualizacion(&quot;' + (base ? 'eliminar_movimiento' : 'corregir_movimiento') + '&quot;,this.dataset.id)" class="text-xs font-bold text-blue-600 dark:text-blue-400 underline py-2">' + (base ? 'Restablecer inventario inicial' : 'Corregir movimiento') + '</button>';
}
function invCorreccionPermitida(d) {
  return invEsAdminPermanente() && d?.anulacion_permitida === true && ['ENTRADA','SALIDA'].includes(d.tipo) && typeof d.saldo_actual === 'number' && Number.isFinite(d.saldo_actual) && typeof d.saldo_previsto === 'number' && Number.isFinite(d.saldo_previsto) && d.saldo_previsto >= 0;
}
function invCorreccionHTML(c, motivo = '') {
  const d = c.datos;
  const campo = (nombre, valor) => '<div><dt class="text-xs text-slate-500 dark:text-slate-400">' + nombre + '</dt><dd class="font-semibold break-words">' + invEsc(valor ?? 'Sin dato disponible') + '</dd></div>';
  const ya = !!d.movimiento_ajuste_id;
  const permitido = invCorreccionPermitida(d);
  const texto = ya ? 'Este movimiento ya tiene una corrección vinculada. No se registrará otra.' : permitido ? (d.tipo === 'SALIDA' ? 'La corrección devolverá al stock la cantidad retirada por error.' : 'La corrección descontará del stock la cantidad ingresada por error.') : d.saldo_previsto < 0 || String(d.estado).includes('STOCK_INSUFICIENTE') ? 'No hay stock suficiente para compensar esta entrada. No se modificará el movimiento.' : 'Supabase no permite esta corrección. Revise el estado y el stock disponible.';
  return '<p class="mb-3">' + texto + ' El movimiento original se conserva; la corrección se registra como un ajuste compensatorio.</p><dl class="grid grid-cols-1 sm:grid-cols-2 gap-3">' + campo('Producto', d.producto) + campo('Bodega', c.bodega || d.ubicacion_id) + campo('Movimiento', invEtiquetaTipoMovimiento(d.tipo).texto) + campo('Cantidad', d.cantidad) + campo('Unidad', d.unidad_medida) + campo('Stock actual', d.saldo_actual) + campo('Stock previsto', d.saldo_previsto) + campo('Estado informado', d.estado) + '</dl>' + (permitido && !ya ? '<label for="inv-corregir-motivo" class="block text-sm font-semibold mt-4">Motivo obligatorio (10 a 1000 caracteres)</label><textarea id="inv-corregir-motivo" maxlength="1000" oninput="invCorreccionValidar()" class="w-full border rounded-xl p-2 bg-white dark:bg-slate-800 mt-2">' + invEsc(motivo) + '</textarea>' : '') + '<p id="inv-corregir-mensaje" role="status" class="text-sm mt-3"></p><div class="flex flex-wrap justify-end gap-3 mt-4"><button type="button" onclick="invCerrarPrevisualizacion()" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancelar</button><button type="button" onclick="invCorreccionActualizar()" class="text-sm font-bold underline">Actualizar consulta</button>' + (permitido && !ya ? '<button id="inv-corregir-confirmar" type="button" disabled onclick="invCorreccionEnviar()" class="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50">Confirmar corrección</button>' : '') + '</div>';
}
function invCorreccionValidar() {
  const c = invPreviewContexto, boton = document.getElementById('inv-corregir-confirmar');
  const motivo = invValor('inv-corregir-motivo').trim();
  const valido = !!c && c.tipo === 'corregir_movimiento' && !c.enviando && !c.desactualizada && !c.completada && invFichaActual === c.fichaActual && invCorreccionPermitida(c.datos) && !c.datos.movimiento_ajuste_id && motivo.length >= 10 && motivo.length <= 1000;
  if (boton) boton.disabled = !valido;
  return valido;
}
async function invCorreccionActualizar() {
  const c = invPreviewContexto;
  if (!c || c.tipo !== 'corregir_movimiento' || c.enviando || c.completada || !invEsAdminPermanente()) return;
  const motivo = invValor('inv-corregir-motivo');
  c.enviando = true;
  invCorreccionValidar();
  try {
    const datos = await window.InventarioService.previsualizarAnulacion(c.datos.movimiento_id);
    if (invPreviewContexto !== c) return;
    if (datos.movimiento_id !== c.datos.movimiento_id || datos.producto_id !== c.datos.producto_id || datos.ubicacion_id !== c.datos.ubicacion_id) throw new Error('La respuesta no corresponde al movimiento seleccionado.');
    c.datos = Object.freeze({ ...datos }); c.desactualizada = false;
    document.getElementById('inv-preview-cuerpo').innerHTML = invCorreccionHTML(c, motivo);
    if (datos.movimiento_ajuste_id && invFichaActual === c.fichaActual && invFichaSolicitada === datos.producto_id) {
      await invAbrirFicha(datos.producto_id, true);
      c.fichaActual = invFichaActual;
      await invCargarCatalogo(true);
    }
  } catch (e) {
    c.desactualizada = true;
    if (invPreviewContexto === c) document.getElementById('inv-corregir-mensaje').textContent = invMensajeError(e);
  } finally { c.enviando = false; invCorreccionValidar(); }
}
async function invCorreccionEnviar() {
  if (!invCorreccionValidar()) return;
  const c = invPreviewContexto, datos = c.datos, motivo = invValor('inv-corregir-motivo').trim();
  c.enviando = true;
  const modal = document.getElementById('inv-modal-preview');
  modal.querySelectorAll('button,textarea').forEach(el => { el.disabled = true; });
  document.getElementById('inv-corregir-mensaje').textContent = 'Procesando corrección…';
  let resultado;
  try {
    resultado = await window.InventarioService.anularMovimiento(datos, motivo);
  } catch (e) {
    c.enviando = false; c.desactualizada = true;
    if (invPreviewContexto !== c) return;
    modal.querySelectorAll('button,textarea').forEach(el => { el.disabled = false; });
    document.getElementById('inv-corregir-mensaje').textContent = e.resultadoIncierto ? 'No se pudo confirmar el resultado. La operación pudo haberse realizado. Actualice la consulta antes de volver a actuar; no se reenviará automáticamente.' : invMensajeError(e) + ' Actualice la consulta antes de confirmar nuevamente.';
    invCorreccionValidar();
    return;
  }
  if (invPreviewContexto !== c) return;
  c.completada = true;
  let actualizada = false;
  try {
    if (invFichaActual === c.fichaActual && invFichaSolicitada === datos.producto_id) {
      await invAbrirFicha(datos.producto_id, true);
      actualizada = invFichaActual?.producto_id === datos.producto_id;
      await invCargarCatalogo(true);
    }
  } catch (e) { actualizada = false; }
  c.enviando = false;
  if (invPreviewContexto !== c) return;
  const mensaje = resultado.resultado === 'YA_ANULADO' ? 'Este movimiento ya estaba corregido. No se registró otra corrección.' : 'Corrección registrada. El movimiento original y su ajuste se conservan.';
  document.getElementById('inv-preview-cuerpo').innerHTML = '<p role="status" class="text-sm">' + mensaje + (actualizada ? ' Stock e historial actualizados.' : ' Vuelva a consultar la ficha para comprobar el stock y el historial.') + '</p><button type="button" onclick="invCerrarPrevisualizacion()" class="mt-4 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cerrar</button>';
  modal.querySelectorAll('header button').forEach(el => { el.disabled = false; });
}

const INV_FORMATOS_ENTRADA = ['Caja','Paquete','Bolsa','Saco','Bidón','Rollo'];
function invEntradaError(e) { return invMensajeError(e).replace(/^(CONVERSION_INVALIDA|CANTIDAD_FORMATOS_INVALIDA|EQUIVALENCIA_INVALIDA|RECUPERACION_NO_DISPONIBLE|ENTRADA_PENDIENTE):\s*/, ''); }
function invEntradaFormatoTexto(formato, cantidad) {
  const plurales = {Caja:'cajas',Paquete:'paquetes',Bolsa:'bolsas',Saco:'sacos',Bidón:'bidones',Rollo:'rollos'};
  return Number(cantidad) === 1 ? formato.toLowerCase() : plurales[formato] || formato;
}
function invEntradaCalcular(est) {
  if (!String(est.unidad || '').trim()) throw new Error('Este producto no tiene una unidad principal definida. Revise su ficha antes de registrar formatos.');
  const formato = est.formatoEntrada === '__otro__' ? String(est.otroFormato || '').trim() : est.formatoEntrada;
  if (!(INV_FORMATOS_ENTRADA.includes(est.formatoEntrada) || est.formatoEntrada === '__otro__') || !formato || Array.from(formato).length > 80) throw new Error('Indique un formato de recepción válido, de hasta 80 caracteres.');
  const calculo = window.InventarioService.calcularEntradaFormato(est.envases, est.contenidoEnvase);
  const error = invCantidadErrorUnidad(Number(calculo.cantidad), est.unidad);
  if (error) throw new Error(error);
  return { ...calculo, formato };
}
function invEntradaResumenHTML(est) {
  if (!est.envases || !est.contenidoEnvase || (est.formatoEntrada === '__otro__' && !String(est.otroFormato || '').trim())) return '<p class="text-sm text-slate-500 dark:text-slate-400 mt-3">Completa las cantidades para revisar la equivalencia.</p>';
  try {
    const c = invEntradaCalcular(est);
    const previsto = typeof est.saldoActual === 'number' && Number.isFinite(est.saldoActual) ? window.InventarioService.sumarStockPrevisto(est.saldoActual, c.cantidad) : null;
    return '<div class="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-sm" role="status"><p>' + invEsc(c.envases) + ' ' + invEsc(invEntradaFormatoTexto(c.formato,c.envases)) + ' × ' + invEsc(c.contenido) + ' ' + invEsc(invUnidadCantidadTexto(est.unidad,Number(c.contenido))) + ' = <strong>' + invEsc(c.cantidad) + ' ' + invEsc(invUnidadCantidadTexto(est.unidad,Number(c.cantidad))) + '</strong></p><p class="mt-2">Se agregarán ' + invEsc(c.cantidad) + ' ' + invEsc(invUnidadCantidadTexto(est.unidad,Number(c.cantidad))) + '.</p>' + (previsto !== null ? '<p>Stock previsto: <strong>' + invEsc(previsto) + ' ' + invEsc(invUnidadCantidadTexto(est.unidad,Number(previsto))) + '</strong></p>' : '') + '<p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Cálculo previo. El stock se confirmará al guardar.</p></div>';
  } catch (e) { return '<p role="alert" class="text-sm text-rose-600 dark:text-rose-400 mt-3">' + invEsc(invEntradaError(e)) + '</p>'; }
}
function invEntradaCamposHTML(est, clases) {
  const convertido = !!est.formatoEntrada;
  return '<div class="mb-3"><label for="inv-op-formato" class="block text-sm font-semibold mb-2">¿Cómo recibiste este producto?</label><select id="inv-op-formato" onchange="invEntradaCambiarFormato()" class="' + clases + '"><option value="">En su unidad habitual (' + invEsc(est.unidad || 'Sin unidad definida') + ')</option>' + INV_FORMATOS_ENTRADA.map(f => '<option value="' + f + '" ' + (est.formatoEntrada === f ? 'selected' : '') + '>' + f + '</option>').join('') + '<option value="__otro__" ' + (est.formatoEntrada === '__otro__' ? 'selected' : '') + '>Otro formato</option></select></div>' + (convertido ? (est.formatoEntrada === '__otro__' ? '<label for="inv-op-otro-formato" class="block text-sm font-semibold mb-2">Nombre del formato *</label><input id="inv-op-otro-formato" maxlength="80" value="' + invEsc(est.otroFormato || '') + '" oninput="invEntradaActualizar()" class="' + clases + '" />' : '') + '<label for="inv-op-envases" class="block text-sm font-semibold mt-3 mb-2">¿Cuántos envases recibiste? *</label><input id="inv-op-envases" type="number" min="1" max="1000000000" step="1" inputmode="numeric" value="' + invEsc(est.envases || '') + '" oninput="invEntradaActualizar()" class="' + clases + '" /><label for="inv-op-contenido-envase" class="block text-sm font-semibold mt-3 mb-2">¿Cuánto contiene cada envase? (' + invEsc(est.unidad) + ') *</label><input id="inv-op-contenido-envase" type="text" inputmode="decimal" value="' + invEsc(est.contenidoEnvase || '') + '" oninput="invEntradaActualizar()" class="' + clases + '" /><div id="inv-op-conversion" class="mb-3">' + invEntradaResumenHTML(est) + '</div>' : '<label for="inv-op-cantidad" class="block text-sm font-semibold mb-2">Cantidad recibida (' + invEsc(est.unidad) + ') *</label><input id="inv-op-cantidad" type="number" step="' + (invUnidadEntera(est.unidad) ? '1' : '0.001') + '" min="' + (invUnidadEntera(est.unidad) ? '1' : '0.001') + '" inputmode="' + (invUnidadEntera(est.unidad) ? 'numeric' : 'decimal') + '" value="' + invEsc(est.cantidad) + '" class="' + clases + '" />');
}
function invEntradaCambiarFormato() {
  if (!invOpEstado || invOpEstado.tipo !== 'entrada' || invOpEstado.enviando || invOpEstado.recepcionIncierta) return;
  invOpLeerFormulario(); invOpPintar();
}
function invEntradaActualizar() {
  if (!invOpEstado || invOpEstado.enviando) return;
  invOpLeerFormulario();
  const resumen = document.getElementById('inv-op-conversion');
  if (resumen) resumen.innerHTML = invEntradaResumenHTML(invOpEstado);
}
function invEntradaSolicitud(est) {
  const c = invEntradaCalcular(est);
  const base = { productoId:est.productoId, ubicacionId:est.ubicacionId, formato:c.formato, cantidadFormatos:c.envases, contenidoPorFormato:c.contenido, unidadEsperada:est.unidadOriginal ?? est.unidad, responsableTexto:String(est.responsable || '').trim() || null };
  if (est.recepcionSolicitud) {
    const anterior = { ...est.recepcionSolicitud }; delete anterior.solicitudId;
    if (JSON.stringify(anterior) !== JSON.stringify(base)) throw new Error('Los datos de esta recepción cambiaron. No se reenviará con otra equivalencia.');
    return est.recepcionSolicitud;
  }
  if (!globalThis.crypto?.randomUUID) throw new Error('No se pudo generar un identificador seguro para la recepción.');
  est.recepcionSolicitud = Object.freeze({ ...base, solicitudId:globalThis.crypto.randomUUID() });
  return est.recepcionSolicitud;
}
function invMovimientoFormatoHTML(m) {
  const e = m.formato_entrada;
  if (m.tipo !== 'ENTRADA' || !e) return '';
  return '<p class="text-xs text-slate-600 dark:text-slate-300 break-words">Entrada de ' + invEsc(e.cantidad_principal) + ' ' + invEsc(invUnidadCantidadTexto(e.unidad_principal,e.cantidad_principal)) + ' — recibida en ' + invEsc(e.cantidad_formatos) + ' ' + invEsc(invEntradaFormatoTexto(e.formato_recepcion,e.cantidad_formatos)) + ' de ' + invEsc(e.contenido_por_formato) + ' ' + invEsc(e.unidad_principal) + ' por envase.</p>';
}

let invPendientesRevision = 0, invPendientesSuscrito = false;
function invRecuperacionIniciar() {
  if (invPendientesSuscrito) return;
  window.addEventListener('inventario-cuenta-recuperacion', () => {
    ++invPendientesRevision;
    const caja = document.getElementById('inv-entradas-pendientes');
    if (caja) caja.textContent = '';
    if (invOpEstado?.tipo === 'entrada' && (invOpEstado.usuarioRecepcionId || invOpEstado.recepcionSolicitud || invOpEstado.recuperando)) invCerrarOperacionForzado();
    setTimeout(invRecepcionesActualizar,0);
  });
  invPendientesSuscrito = true;
}
async function invRecepcionesActualizar() {
  const caja = document.getElementById('inv-entradas-pendientes');
  if (!caja) return;
  const revision = ++invPendientesRevision;
  caja.textContent = '';
  try {
    const lista = await window.InventarioService.listarEntradasPendientes();
    if (revision !== invPendientesRevision || document.getElementById('inv-entradas-pendientes') !== caja) return;
    caja.innerHTML = (lista.corruptos ? '<p role="alert" class="alm-panel p-4 text-sm">Hay una entrada pendiente que no pudimos leer. No se enviará automáticamente. Solicita revisión antes de registrar otra entrada relacionada.</p>' : '') + lista.registros.map(r => '<section class="alm-panel p-4 border border-amber-200 dark:border-amber-800 rounded-xl"><p class="font-semibold text-sm">Tienes una entrada pendiente de comprobar</p>' + invRecuperacionDetalleHTML(r) + '<button type="button" data-solicitud="' + invEsc(r.parametros.p_solicitud_id) + '" onclick="invRecuperarEntrada(this.dataset.solicitud)" ' + (invPuedeEscribir() ? '' : 'disabled') + ' class="mt-3 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">Recuperar entrada</button></section>').join('');
  } catch (e) {
    if (revision === invPendientesRevision && document.getElementById('inv-entradas-pendientes') === caja) caja.innerHTML = '<p role="status" class="alm-panel p-4 text-sm">' + invEsc(invEntradaError(e)) + '<button type="button" onclick="invRecepcionesActualizar()" class="ml-2 font-semibold underline">Volver a comprobar</button></p>';
  }
}
function invRecuperacionDetalleHTML(r) {
  const a = r.parametros;
  const c = window.InventarioService.calcularEntradaFormato(a.p_cantidad_formatos,a.p_unidades_por_formato);
  return '<div class="text-sm space-y-1 mt-2"><p><strong>' + invEsc(r.etiquetas.producto) + '</strong></p><p>Bodega: ' + invEsc(r.etiquetas.bodega) + '</p><p>' + invEsc(a.p_cantidad_formatos) + ' ' + invEsc(invEntradaFormatoTexto(a.p_formato,a.p_cantidad_formatos)) + ' × ' + invEsc(a.p_unidades_por_formato) + ' ' + invEsc(a.p_unidad_esperada) + '</p><p>Total de la entrada: <strong>' + invEsc(c.cantidad) + ' ' + invEsc(invUnidadCantidadTexto(a.p_unidad_esperada,Number(c.cantidad))) + '</strong></p>' + (a.p_responsable_texto ? '<p>Responsable: ' + invEsc(a.p_responsable_texto) + '</p>' : '') + '</div>';
}
async function invRecuperarEntrada(id) {
  if (!invPuedeEscribir()) { pvToastError('Necesitas autorización vigente para recuperar esta entrada. La solicitud se conserva.'); return; }
  const revision = invPendientesRevision;
  if (invOpEstado?.enviando) return;
  try {
    const r = await window.InventarioService.obtenerEntradaPendiente(id);
    if (revision !== invPendientesRevision) return;
    const a = r.parametros;
    invOpEstado = { tipo:'entrada',productoId:a.p_producto_id,ubicacionId:a.p_ubicacion_id,bodegaNombre:r.etiquetas.bodega,productoNombre:r.etiquetas.producto,unidad:a.p_unidad_esperada,usuarioRecepcionId:r.usuario_id,recuperando:true,recepcionIncierta:true,pendiente:r,paso:'confirmar',enviando:false,error:null };
    const overlay = invCrearModalOperacion();
    overlay.classList.remove('hidden');
    invOpPintar();
  } catch (e) { pvToastError(invEntradaError(e)); }
}
