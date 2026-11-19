'use strict';
// ==========================================================
// HARNESS INV-4 / INV-5 / INV-5.1 — FRONTEND DE INVENTARIO
// CATÁLOGO, FICHAS, OPERACIONES DE ESCRITURA Y AUTOCOMPLETADO
// (sin red, sin Supabase real; SIN ESCRITURAS DIRECTAS)
// ==========================================================
// Cubre:
//   A) Servicio js/services/inventario.service.js
//      A1 argumentos/mapeo de inventario_buscar_productos
//      A2 caché por clave (force recarga)
//      A3 paginación y normalización de texto/ubicación
//      A4 mapeo de inventario_obtener_existencias (NULL preservado)
//      A5 mapeo de inventario_obtener_movimientos (NULL preservado)
//      A6 mapeo de inventario_obtener_bodegas_historicas
//      A7 filtro de bodegas por ubicaciones.tipo = 'BODEGA' (case-insensitive)
//      A8 fallo de la consulta de bodegas → el error se propaga (sin degradar)
//      A9 sin filas tipo BODEGA → lista vacía (jamás todas las ubicaciones)
//      A10 lista blanca: 4 RPC lectura + 4 RPC escritura, solo from('ubicaciones')
//   B) Vista js/views/inventario.js (lectura INV-4/4.1, conservada)
//      B1 render + encabezado "Inventario" + total real + 12 tarjetas + paginación 1/15
//      B2 tarjeta simplificada (INV-4.1): nombre protagonista, tooltip con el
//        nombre completo, sin badges repetitivos, escape de HTML
//      B3/B4 matemática y estados de paginación
//      B5 buscador (debounce, reset de página)
//      B6 filtro por bodega
//      B7 estados de error con Reintentar
//      B8 estado vacío con Limpiar filtros
//      B9 ficha completa (histórico vs. existencias vs. movimientos)
//      B10 ficha sin datos (textos neutros)
//      B11 NULLs neutros en movimientos y unidad
//      B12 "Ver más movimientos" (paginación interna de la ficha)
//      B13 la ficha NO altera búsqueda, filtro ni página del catálogo
//      B14 guardia de carriles al cambiar de ficha rápidamente
//      B15 cero escrituras directas en todas las interacciones
//      B16 filtro de bodegas con error de consulta → deshabilitado (sin degradar)
//      B17 filtro sin bodegas tipo BODEGA → deshabilitado (sin ubicaciones ajenas)
//      B18 selección de bodega obsoleta → se limpia y el catálogo se recarga
//      B19 cero escrituras globales en todos los escenarios
//   D) INV-5: escritura operativa (solo vía RPC de la lista blanca)
//      D1 botones de escritura condicionados al permiso efectivo
//      D2 creación de producto (CREADO): args, recarga y "Ver ficha"
//      D3 duplicados: advierte con coincidencias y reintenta con confirmar_distinto
//      D4 homónimo fuera del catálogo: administrador operativo confirma
//      D5 línea base CERO permitida + reconsulta tras el éxito
//      D6 validaciones locales (unidad requerida, negativos, cantidad 0 en entrada)
//      D7 entrada: args, reconsulta y conservación de filtros
//      D8 salida con STOCK_INSUFICIENTE: error claro, sin éxito falso
//      D9 INVENTARIO_ACCESO_DENEGADO del backend → mensaje claro
//      D10 servicio: contrato jsonb, códigos de error, whitelists y caché
//      D11 cero escrituras directas en todos los escenarios INV-5
//   E) INV-5.1: autocompletado del alta de producto (sugerencias reales)
//      E1 sugerencias desde el primer carácter (p_texto, ubicación null,
//        límite 8, offset 0; sin paginar el catálogo para una sola letra)
//      E2 coincidencias progresivas y sin repetir la RPC con texto igual
//      E3 sin resultados: texto corto no pide el catálogo; texto largo sí (una vez)
//      E4 error de escritura → sugerencias aproximadas ("¿Buscabas…?") con caché
//      E5 selección de una ficha existente ("Ver ficha existente", sin escrituras)
//      E6 teclado: flechas, Enter y Escape (desplegable antes que el modal)
//      E7 respuestas fuera de orden: la respuesta vieja NO pisa la nueva
//      E8 la validación definitiva de duplicados sigue siendo la RPC
//        (p_confirmar_distinto solo con confirmación explícita)
//      E9 servicio: catálogo paginado en caché temporal (TTL e invalidación)
//      E10 similitud de nombres (Levenshtein por palabras) y tope de sugerencias
//      E11 cero escrituras directas en todos los escenarios INV-5.1
//   F) INV-5.2: botones por estado de línea base en la ficha
//      F1 sin línea base confirmada → SOLO "Confirmar existencia inicial"
//        (fila existente no confirmada + bodega histórica sin fila)
//      F2 línea base 0 → entrada/salida con permiso; Técnico → ninguna acción
//      F3 línea base positiva → entrada/salida y NO se re-ofrece la línea base
//      F4 administrador temporal vigente → mismas acciones que el permanente
//      F5 caché invalidada y ficha actualizada tras confirmar línea base
//   G) INV-5.3: cierre intencional y protección de datos escritos en los
//      formularios (alta y operación). El clic/soltar fuera NO cierra;
//      ✕, Cancelar o Escape piden confirmación si hay cambios.
//      G1 clic fuera (o soltar tras selección) → el formulario NO se cierra
//      G2 con datos escritos, clic en el fondo → sigue abierto y conservado
//      G3 cerrar con ✕/Cancelar con datos → aviso de descarte (sin cierre)
//      G4 "Descartar" cierra; "Seguir editando" conserva exactamente lo escrito
//      G5 Escape con sugerencias abiertas → cierra SOLO el desplegable
//      G6 Escape con formulario modificado → aviso (no cierra directo)
//      G7 Escape con el aviso activo → lo retira y conserva lo escrito
//      G8 seleccionar una sugerencia NO cierra el formulario
//      G9 operación en curso (enviando) → no se cierra ni se envía dos veces
//      G10 desplegable: scroll interno (no queda cortado) y navegación intacta
//      G11 pantallas pequeñas: contenedor del desplegable con desbordamiento
//        manejado y sin romper el modal
//      G12 cero escrituras directas en todos los escenarios INV-5.3
//   C) Registro estático de navegación (index.html / app.js / state.js)
//      y ausencia total de escrituras/localStorage en el código nuevo.
//
// Convención de mini-DOM: getElementById crea nodos bajo demanda (mismo
// enfoque que tests/harness_c2e3.js). En el navegador real los contenedores
// vienen del HTML devuelto por renderInventarioView(); aquí se pinta sobre
// los nodos equivalentes, lo que ejercita exactamente las mismas rutas.
// ==========================================================

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

// Lista blanca del módulo: 4 RPC de lectura (A3) + 4 de escritura (A4/A5).
// El stub marca como "escritura" cualquier RPC fuera de esta lista y
// cualquier from() que no sea el SELECT permitido de ubicaciones.
const RPC_PERMITIDAS = [
  'inventario_buscar_productos',
  'inventario_obtener_existencias',
  'inventario_obtener_movimientos',
  'inventario_obtener_bodegas_historicas',
  'inventario_crear_producto',
  'inventario_confirmar_linea_base',
  'inventario_registrar_entrada',
  'inventario_registrar_salida'
];

// ----------------------------------------------------------
// 1) Motor de aserciones
// ----------------------------------------------------------
const resultados = [];
function check(letra, nombre, cond, detalle) {
  resultados.push({ letra, nombre, ok: !!cond, detalle: detalle || '' });
}
function contiene(html, texto) { return String(html).indexOf(texto) !== -1; }
function noContiene(html, texto) { return String(html).indexOf(texto) === -1; }
function cuenta(haystack, texto) { return String(haystack).split(texto).length - 1; }
// Para el escaneo estático se ignoran comentarios: los encabezados de los
// archivos documentan literalmente que NO se usan .insert()/.delete()/
// localStorage, y esas menciones no son código ejecutable.
function sinComentarios(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
async function flush(n) {
  const veces = n || 2;
  for (let i = 0; i < veces; i++) {
    await new Promise(function (r) { setImmediate(r); });
  }
}

// ----------------------------------------------------------
// 2) Cliente Supabase stub (registra llamadas y marca escrituras)
// ----------------------------------------------------------
function crearClienteStub(config) {
  const cfg = config || {};
  const escrituras = [];
  const llamadas = { rpc: [], from: [] };

  const cliente = {
    rpc(nombre, args) {
      llamadas.rpc.push({ nombre: nombre, args: args || {} });
      if (RPC_PERMITIDAS.indexOf(nombre) === -1) {
        escrituras.push('rpc fuera de lista blanca: ' + nombre);
      }
      let respuesta;
      if (cfg.rpc && typeof cfg.rpc[nombre] === 'function') {
        respuesta = cfg.rpc[nombre](args || {});
      } else {
        respuesta = { data: [], error: null };
      }
      return Promise.resolve(respuesta).then(function (r) {
        if (r && Object.prototype.hasOwnProperty.call(r, 'error')) return r;
        return { data: (r === undefined ? [] : r), error: null };
      });
    },
    from(tabla) {
      llamadas.from.push({ tabla: tabla });
      if (tabla !== 'ubicaciones' && !(tabla === 'movimientos_inventario' && cfg.historicos)) {
        escrituras.push('from() sobre tabla no permitida: ' + tabla);
      }
      const q = {
        _select: '',
        _filtros: {},
        _order: null,
        _range: null,
        select(cols) { q._select = cols; return q; },
        eq(col, val) { q._filtros[col] = val; return q; },
        order(col, opts) { q._order = { col: col, opts: opts }; return q; },
        range(desde, hasta) { q._range = [desde, hasta]; return q; },
        then(resol, rech) {
          const promesa = Promise.resolve().then(function () {
            if (tabla === 'movimientos_inventario' && cfg.historicos) return cfg.historicos(q);
            return cfg.ubicaciones ? cfg.ubicaciones(q) : { data: [], error: null };
          });
          return promesa.then(resol, rech);
        },
        catch(rech) { return q.then(undefined, rech); }
      };
      return q;
    }
  };

  cliente._escrituras = escrituras;
  cliente._llamadas = llamadas;
  return cliente;
}

// ----------------------------------------------------------
// 3) Mini-DOM stub (patrón tests/harness_c2e3.js)
// ----------------------------------------------------------
function crearDocStub() {
  const nodos = {};
  function crearNodo(id) {
    const clases = new Set();
    const escuchas = {};
    return {
      id: id,
      _html: '',
      get innerHTML() { return this._html; },
      set innerHTML(html) {
        this._html = String(html);
        // Repintar un formulario reemplaza sus inputs y sus valores.
        const inputs = this._html.match(/<input\b[^>]*>/g) || [];
        inputs.forEach(function (tag) {
          const id = tag.match(/\bid="([^"]+)"/);
          if (!id) return;
          const n = crearNodo(id[1]);
          const val = tag.match(/\bvalue="([^"]*)"/);
          n.value = val ? val[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';
          nodos[id[1]] = n;
        });
        const selects = [...this._html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)];
        selects.forEach(function (select) {
          const id=select[1].match(/\bid="([^"]+)"/);if(!id)return;
          const n=crearNodo(id[1]);
          const options=select[2].match(/<option\b[^>]*>/g)||[];
          const opcion=options.find(o=>/\bselected\b/.test(o))||options[0]||'';
          const valor=opcion.match(/\bvalue="([^"]*)"/);
          n.value=valor?valor[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'):'';
          n.disabled=/\bdisabled\b/.test(select[1]);nodos[id[1]]=n;
        });
      },
      textContent: '',
      value: '',
      disabled: false,
      style: {},
      classList: {
        add(c) { clases.add(c); },
        remove(c) { clases.delete(c); },
        contains(c) { return clases.has(c); }
      },
      get className() { return Array.from(clases).join(' '); },
      set className(v) {
        clases.clear();
        String(v || '').split(/\s+/).forEach(function (c) { if (c) clases.add(c); });
      },
      setAttribute() {},
      getAttribute() { return null; },
      appendChild(n) { return n; },
      // INV-5.3: registro real de escuchas (deduplicado como el navegador:
      // añadir dos veces la MISMA función al mismo tipo no duplica) para
      // poder despachar clic/tecla y afirmar el cierre en los tests.
      addEventListener(tipo, fn) {
        const lista = (escuchas[tipo] = escuchas[tipo] || []);
        if (lista.indexOf(fn) === -1) lista.push(fn);
      },
      removeEventListener() {},
      querySelectorAll() { return []; },
      focus() {},
      _escuchas: escuchas,
      _dispatch(tipo, ev) {
        (escuchas[tipo] || []).slice().forEach(function (f) { f(ev || {}); });
      }
    };
  }
  const escuchasDoc = {};
  const doc = {
    getElementById(id) {
      const clave = String(id);
      if (!nodos[clave] && /^inv-modal-/.test(clave)) return null;
      if (!nodos[clave]) nodos[clave] = crearNodo(clave);
      return nodos[clave];
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(tipo, fn) {
      const lista = (escuchasDoc[tipo] = escuchasDoc[tipo] || []);
      if (lista.indexOf(fn) === -1) lista.push(fn);
    },
    removeEventListener() {},
    createElement() { return crearNodo('creado-' + Object.keys(nodos).length); },
    body: { appendChild(n) { nodos[n.id] = n; return n; } },
    _escuchas: escuchasDoc,
    _dispatch(tipo, ev) {
      (escuchasDoc[tipo] || []).slice().forEach(function (f) { f(ev || {}); });
    }
  };
  doc._nodos = nodos;
  return doc;
}

// ----------------------------------------------------------
// 4) Carga de los archivos reales del proyecto (eval con stubs)
// ----------------------------------------------------------
function leerArchivo(rel) {
  return fs.readFileSync(path.join(RAIZ, rel), 'utf8');
}

function cargarServicio(cliente, mantenciones) {
  const src = leerArchivo('js/services/inventario.service.js');
  const win = { supabaseClient: cliente, MantencionesService: mantenciones };
  const doc = { getElementById() { return null; }, querySelector() { return null; }, addEventListener() {} };
  const fn = new Function('window', 'document', src + '\n;return window.InventarioService;');
  return fn(win, doc);
}

function cargarVista(cliente, svc, permisos) {
  const src = leerArchivo('js/views/inventario.js');
  const doc = crearDocStub();
  const win = { supabaseClient: cliente, InventarioService: svc };
  // Permisos efectivos: en el navegador son helpers globales de app.js; aquí
  // se inyectan como parámetros (por defecto SIN escritura = perfil
  // consulta, p. ej. Técnico). { operativo, permanente }.
  const p = permisos || {};
  // setTimeout inmediato (sin espera de 350 ms): el harness controla los
  // flush de microtareas para afirmar tras la carga asíncrona.
  const inmediato = function (cb) { try { cb(); } catch (e) { /* la vista maneja sus errores */ } return 0; };
  const cola = `
;window.__inv = {
  renderInventarioView, invListadoHTML, invTarjetaHTML, invPaginacionHTML, invContadorHTML,
  invTotalHTML, invOpcionesBodegasHTML, invTotalPaginas, invEstado, invOnBuscar, invOnFiltrarBodega,
  invCambiarPagina, invCargarCatalogo, invCargarBodegas, invLimpiarFiltros,
  invPintarFiltroBodegas, invAbrirFicha, invCerrarFicha, invFichaHTML, invCargarMasMovimientos,
  invEtiquetaOrigen, invEtiquetaTipoMovimiento, invFechaHora, invEsc,
  invPuedeEscribir, invEsAdminPermanente, invMensajeError, invUnirBodegasFicha, invFilaBodegaHTML,
  invAbrirModalNuevo, invCerrarModalNuevo, invNuevoPintar, invNuevoPasoConfirmar, invNuevoVolver,
  invNuevoEnviar, invNuevoContinuarDistinto, invNuevoVerFicha, invNuevoHTML, invCoincidenciasHTML,
  invCerrarModalNuevoForzado, invNuevoSucio, invNuevoSeguirEditando, invNuevoDescartar, invFormNoCierreFuera,
  invSugOnInput, invSugTeclado, invSugSeleccionar, invSugVerFicha, invSugLimpiarSugerencia,
  invSugCerrar, invSugResetear, invSugHTML, invSugPanelHTML,
  invSimilitud, invSimilares, invDistanciaLevenshtein, invNormalizarTexto, invManejarTeclaFicha,
  invAbrirOperacion, invCerrarOperacion, invOpPasoConfirmar, invOpVolver, invOpEnviar, invOpHTML, invOpCambiarUnidad,
  invCerrarOperacionForzado, invOpSucio, invOpSeguirEditando, invOpDescartar,
  invHistPuedeConsultar, invCambiarSeccion, invHistCargar, invHistEstados,
  invHistUbicacion, invHistFiltrar, invHistAbrirFuente, invHistVolver,
  invHistFiltrarCampo, invHistPagina, invHistListadoHTML, invHistDato,
  invHistPintar, invHistDetalle, invHistCerrarDetalle
};`;
  const fn = new Function('window', 'document', 'setTimeout', 'console',
    'esAdminOperativoActual', 'esAdminPermanenteActual', 'state', 'hasAccess',
    src + cola + '\n;return window.__inv;');
  const api = fn(win, doc, inmediato, console,
    function () { return p.operativo === true; },
    function () { return p.permanente === true; },
    { currentUser: { role: p.role || (p.operativo ? 'ADMINISTRADOR' : 'TECNICO') } },
    function (modulo, rol) { return modulo === 'inventario' && p.acceso !== false && (p.operativo || rol === 'TECNICO'); });
  api._win = win;
  api._doc = doc;
  return api;
}

// ----------------------------------------------------------
// 5) Datos stub (NUNCA inventados en el producto: solo para el harness)
// ----------------------------------------------------------
function filasBuscar(total, desde, cantidad) {
  const filas = [];
  for (let i = 0; i < cantidad; i++) {
    const n = desde + i;
    filas.push({
      producto_id: 'prod-' + String(n).padStart(3, '0'),
      nombre: 'Producto ' + n,
      unidad_medida: (n % 3 === 0) ? null : 'Unidad',
      origen_registro: (n % 2 === 0) ? 'CATALOGO_INICIAL' : 'SISTEMA',
      material_id: (n % 2 === 0) ? ('mat-' + n) : null,
      asociado_historico: (n % 2 === 0),
      tiene_existencia_operativa: (n % 5 === 0),
      total: total
    });
  }
  return filas;
}

const UBICACIONES_STUB = [
  { id: 'ub-1', nombre: 'EN BODEGA', tipo: 'BODEGA' },
  { id: 'ub-2', nombre: 'BODEGA OESTE', tipo: 'Bodega' },
  { id: 'ub-9', nombre: 'HABITACIÓN 101', tipo: 'HABITACION' }
];

function clienteCatalogo(total, rpcExtra, ubicacionesFn) {
  const cfg = {
    rpc: Object.assign({
      inventario_buscar_productos: function (args) {
        const total_ = total;
        const offset = Number(args.p_offset) || 0;
        const limite = Number(args.p_limite) || 12;
        const desde = Math.min(offset + 1, total_ + 1);
        const cantidad = Math.max(0, Math.min(limite, total_ - offset));
        return { data: filasBuscar(total_, desde, cantidad), error: null };
      }
    }, rpcExtra || {}),
    ubicaciones: ubicacionesFn || function () { return { data: UBICACIONES_STUB.slice(), error: null }; }
  };
  return crearClienteStub(cfg);
}

// Cliente completo para los escenarios INV-5: catálogo + ficha de
// prod-101 (existencia en ub-1, histórico en ub-1 y ub-2) + handlers de
// escritura configurables (por defecto: éxito silencioso o CREADO).
function clienteInv5(escrituras) {
  const w = escrituras || {};
  return clienteCatalogo(177, {
    inventario_obtener_existencias: function (args) {
      if (args.p_producto_id === 'prod-101') {
        return {
          data: [{ ubicacion_id: 'ub-1', ubicacion_nombre: 'EN BODEGA', cantidad: 5, linea_base_at: '2026-01-05T10:00:00+00:00', actualizado_at: '2026-02-01T09:30:00+00:00', linea_base_confirmada: true, asociado_historico: true }],
          error: null
        };
      }
      return { data: [], error: null };
    },
    inventario_obtener_bodegas_historicas: function (args) {
      if (args.p_producto_id !== 'prod-101') return { data: [], error: null };
      return {
        data: [
          { ubicacion_id: 'ub-1', ubicacion_nombre: 'EN BODEGA', archivo_origen: 'EN BODEGA.xlsx', registros_historicos: 174 },
          { ubicacion_id: 'ub-2', ubicacion_nombre: 'BODEGA OESTE', archivo_origen: 'INSUMOS -NUEVA BODEGA OESTE.xlsx', registros_historicos: 10 }
        ],
        error: null
      };
    },
    inventario_obtener_movimientos: function (args) {
      if (args.p_producto_id !== 'prod-101') return { data: [], error: null };
      return {
        data: [{ movimiento_id: 'mov-1', ubicacion_id: 'ub-1', ubicacion_nombre: 'EN BODEGA', tipo: 'ENTRADA', cantidad: 5, direccion: 'ENTRADA', motivo: null, saldo_resultante: 12, unidad_medida: 'Unidad', responsable_texto: null, registrado_por_nombre_snapshot: 'Admin', fecha: '2026-02-01T09:30:00+00:00', total: 1 }],
        error: null
      };
    },
    inventario_crear_producto: w.crear || function () {
      return { data: { resultado: 'CREADO', producto_id: 'prod-nuevo', coincidencias: [] }, error: null };
    },
    inventario_confirmar_linea_base: w.lineaBase || function () { return { data: null, error: null }; },
    inventario_registrar_entrada: w.entrada || function () { return { data: null, error: null }; },
    inventario_registrar_salida: w.salida || function () { return { data: null, error: null }; }
  });
}

// ----------------------------------------------------------
// 6) INV-5.1: datos y cliente del autocompletado (solo harness)
// ----------------------------------------------------------
// Catálogo de nombres reales de prueba para las sugerencias. Estos datos
// NUNCA existen en el producto: viven solo en este harness.
const CATALOGO_SUG = [
  'Clavo 2 pulgadas', 'Clavo largo', 'Candado grande',
  'Destornillador', 'Destornillador plano', 'Llave inglesa'
].map(function (nombre, i) {
  return {
    producto_id: 'sug-' + String(i + 1).padStart(3, '0'),
    nombre: nombre,
    unidad_medida: 'Unidad',
    origen_registro: i < 4 ? 'CATALOGO_INICIAL' : 'SISTEMA',
    material_id: null,
    asociado_historico: i < 4,
    tiene_existencia_operativa: false
  };
});

// Cliente INV-5.1: inventario_buscar_productos con búsqueda por subcadena
// insensible a mayúsculas (como el backend) y, para p_texto null,
// paginación del catálogo (como hace obtenerCatalogoSimilar).
// - buscadorExtra(args): intercepta un escenario concreto (p. ej. devolver
//   una promesa pendiente para simular respuestas fuera de orden).
// - rpcExtra: agrega otras RPC de la lista blanca (p. ej. crear producto).
function clienteSug(buscadorExtra, rpcExtra) {
  const cfg = {
    rpc: Object.assign({
      inventario_buscar_productos: function (args) {
        if (typeof buscadorExtra === 'function') {
          const interceptado = buscadorExtra(args);
          if (interceptado) return interceptado;
        }
        const offset = Number(args.p_offset) || 0;
        const limite = Number(args.p_limite) || 12;
        const texto = (args.p_texto === null || args.p_texto === undefined)
          ? null : String(args.p_texto).toLowerCase();
        if (texto === null) {
          const pagina = CATALOGO_SUG.slice(offset, offset + limite);
          return {
            data: pagina.map(function (f) { return Object.assign({}, f, { total: CATALOGO_SUG.length }); }),
            error: null
          };
        }
        const coincidencias = CATALOGO_SUG.filter(function (p) {
          return p.nombre.toLowerCase().indexOf(texto) !== -1;
        });
        return {
          data: coincidencias.slice(offset, offset + limite).map(function (f) {
            return Object.assign({}, f, { total: coincidencias.length });
          }),
          error: null
        };
      }
    }, rpcExtra || {})
  };
  return crearClienteStub(cfg);
}

// Páginas del catálogo que pide obtenerCatalogoSimilar (p_limite 50),
// distinguibles de la carga principal del listado (p_limite 12).
function paginasCatalogoSimilar(cli) {
  return cli._llamadas.rpc.filter(function (l) {
    return l.nombre === 'inventario_buscar_productos' &&
      (l.args.p_texto === null || l.args.p_texto === undefined) &&
      Number(l.args.p_limite) === 50;
  });
}

// ----------------------------------------------------------
// 7) Ejecución
// ----------------------------------------------------------
async function main() {

  // ===== A) SERVICIO =======================================
  const cliA = crearClienteStub({
    rpc: {
      inventario_buscar_productos: function (args) {
        const offset = Number(args.p_offset) || 0;
        const limite = Number(args.p_limite) || 12;
        const cantidad = Math.max(0, Math.min(limite, 177 - offset));
        return { data: filasBuscar(177, offset + 1, cantidad), error: null };
      },
      inventario_obtener_existencias: function () {
        return {
          data: [
            { ubicacion_id: 'ub-1', ubicacion_nombre: 'EN BODEGA', cantidad: '3.00', linea_base_at: '2026-01-05T10:00:00+00:00', actualizado_at: '2026-02-01T09:30:00+00:00', linea_base_confirmada: true, asociado_historico: true },
            { ubicacion_id: 'ub-2', ubicacion_nombre: 'BODEGA OESTE', cantidad: null, linea_base_at: null, actualizado_at: null, linea_base_confirmada: false, asociado_historico: true }
          ],
          error: null
        };
      },
      inventario_obtener_movimientos: function () {
        return {
          data: [
            { movimiento_id: 'mov-1', ubicacion_id: 'ub-1', ubicacion_nombre: 'EN BODEGA', tipo: 'ENTRADA', cantidad: '5', direccion: 'ENTRADA', motivo: 'Compra proveedor', saldo_resultante: '12', unidad_medida: 'Unidad', responsable_texto: 'Juan Pérez', registrado_por_nombre_snapshot: 'Admin', fecha: '2026-02-01T09:30:00+00:00', total: 45 },
            { movimiento_id: 'mov-2', ubicacion_id: 'ub-1', ubicacion_nombre: 'EN BODEGA', tipo: 'SALIDA', cantidad: null, direccion: 'SALIDA', motivo: null, saldo_resultante: null, unidad_medida: null, responsable_texto: null, registrado_por_nombre_snapshot: null, fecha: null, total: 45 }
          ],
          error: null
        };
      },
      inventario_obtener_bodegas_historicas: function () {
        return {
          data: [
            { ubicacion_id: 'ub-1', ubicacion_nombre: 'EN BODEGA', archivo_origen: 'EN BODEGA.xlsx', registros_historicos: '174' },
            { ubicacion_id: 'ub-2', ubicacion_nombre: 'BODEGA OESTE', archivo_origen: 'INSUMOS -NUEVA BODEGA OESTE.xlsx', registros_historicos: '10' }
          ],
          error: null
        };
      }
    },
    ubicaciones: function (q) {
      // El stub distingue el primer intento (con tipo) del reintento.
      if (String(q._select).indexOf('tipo') !== -1) {
        return { data: UBICACIONES_STUB.slice(), error: null };
      }
      return {
        data: UBICACIONES_STUB.map(function (u) { return { id: u.id, nombre: u.nombre }; }),
        error: null
      };
    }
  });
  const svc = cargarServicio(cliA);

  // A1: argumentos y mapeo de buscarProductos
  const resA1 = await svc.buscarProductos({});
  const argsA1 = cliA._llamadas.rpc[0].args;
  check('A1a', 'buscar: p_texto null, p_ubicacion_id null, p_limite 12, p_offset 0',
    argsA1.p_texto === null && argsA1.p_ubicacion_id === null && argsA1.p_limite === 12 && argsA1.p_offset === 0,
    JSON.stringify(argsA1));
  check('A1b', 'buscar: 12 productos y total 177',
    resA1.productos.length === 12 && resA1.total === 177,
    `productos=${resA1.productos.length} total=${resA1.total}`);
  check('A1c', 'buscar: unidad NULL preservada (no se vuelve 0 ni string)',
    resA1.productos[2].unidad_medida === null,
    JSON.stringify(resA1.productos[2].unidad_medida));
  check('A1d', 'buscar: origen_registro y banderas mapeados',
    resA1.productos[0].origen_registro === 'SISTEMA' &&
    resA1.productos[0].asociado_historico === false &&
    resA1.productos[1].origen_registro === 'CATALOGO_INICIAL' &&
    resA1.productos[1].asociado_historico === true);

  // A2: caché por clave
  const rpcsAntesA2 = cliA._llamadas.rpc.length;
  await svc.buscarProductos({});
  check('A2a', 'buscar: la caché evita repetir la RPC con la misma clave',
    cliA._llamadas.rpc.length === rpcsAntesA2,
    `antes=${rpcsAntesA2} después=${cliA._llamadas.rpc.length}`);
  await svc.buscarProductos({}, true);
  check('A2b', 'buscar: force=true fuerza la recarga',
    cliA._llamadas.rpc.length === rpcsAntesA2 + 1);

  // A3: paginación y normalización
  await svc.buscarProductos({ texto: '  clavo  ', ubicacionId: 'ub-1', offset: 12 });
  const argsA3 = cliA._llamadas.rpc[cliA._llamadas.rpc.length - 1].args;
  check('A3a', 'buscar: texto recortado y ubicación pasada como p_ubicacion_id',
    argsA3.p_texto === 'clavo' && argsA3.p_ubicacion_id === 'ub-1' && argsA3.p_offset === 12,
    JSON.stringify(argsA3));

  // A4: existencias (NULL preservado, numeric → Number)
  const exist = await svc.obtenerExistencias('prod-001');
  check('A4a', 'existencias: cantidad "3.00" → 3 (number)',
    exist[0].cantidad === 3, JSON.stringify(exist[0].cantidad));
  check('A4b', 'existencias: cantidad NULL se preserva como null (jamás 0)',
    exist[1].cantidad === null, JSON.stringify(exist[1].cantidad));
  check('A4c', 'existencias: linea_base_confirmada y fechas mapeadas',
    exist[0].linea_base_confirmada === true && exist[1].linea_base_confirmada === false &&
    exist[0].actualizado_at === '2026-02-01T09:30:00+00:00' && exist[1].actualizado_at === null);

  // A5: movimientos
  const movs = await svc.obtenerMovimientos('prod-001', { limite: 20, offset: 0 });
  check('A5a', 'movimientos: total 45 y primer movimiento mapeado',
    movs.total === 45 && movs.movimientos[0].tipo === 'ENTRADA' &&
    movs.movimientos[0].cantidad === 5 && movs.movimientos[0].saldo_resultante === 12,
    JSON.stringify(movs.movimientos[0]));
  check('A5b', 'movimientos: NULLs preservados (cantidad, saldo, unidad, responsable, autor, fecha)',
    movs.movimientos[1].cantidad === null && movs.movimientos[1].saldo_resultante === null &&
    movs.movimientos[1].unidad_medida === null && movs.movimientos[1].responsable_texto === null &&
    movs.movimientos[1].registrado_por_nombre_snapshot === null && movs.movimientos[1].fecha === null);

  // A6: bodegas históricas
  const bhist = await svc.obtenerBodegasHistoricas('prod-001');
  check('A6', 'bodegas históricas: registros_historicos como número y archivo_origen preservado',
    bhist.length === 2 && bhist[0].registros_historicos === 174 && bhist[1].registros_historicos === 10 &&
    bhist[0].archivo_origen === 'EN BODEGA.xlsx' &&
    bhist[1].archivo_origen === 'INSUMOS -NUEVA BODEGA OESTE.xlsx',
    JSON.stringify(bhist));

  // A7: filtro de bodegas por tipo (case-insensitive)
  const bodegas = await svc.getBodegas();
  check('A7', 'getBodegas: solo filas con tipo BODEGA (insensible a mayúsculas), sin HABITACIÓN',
    bodegas.length === 2 && bodegas[0].id === 'ub-1' && bodegas[1].id === 'ub-2',
    JSON.stringify(bodegas));

  // A8: fallo de la consulta de bodegas → el error se propaga (INV-4.1:
  // sin reintento ni degradación; la vista deshabilita el filtro)
  const cliA8 = crearClienteStub({
    ubicaciones: function () {
      return { data: null, error: { message: 'column ubicaciones.tipo does not exist' } };
    }
  });
  let errorA8 = null;
  try { await cargarServicio(cliA8).getBodegas(); } catch (e) { errorA8 = e; }
  check('A8', 'getBodegas: si la consulta FALLA se propaga el error (la vista deshabilita el filtro; sin degradar)',
    errorA8 !== null && contiene(String(errorA8.message), 'tipo'),
    String(errorA8 && errorA8.message));

  // A9: sin filas tipo BODEGA → lista vacía (nunca todas las ubicaciones)
  const cliA9 = crearClienteStub({
    ubicaciones: function () {
      return {
        data: [
          { id: 'ub-1', nombre: 'EN BODEGA', tipo: 'OTRO' },
          { id: 'ub-2', nombre: 'BODEGA OESTE', tipo: 'OTRO' }
        ],
        error: null
      };
    }
  });
  const bodegasA9 = await cargarServicio(cliA9).getBodegas();
  check('A9', 'getBodegas: sin filas tipo BODEGA → lista vacía (jamás todas las ubicaciones)',
    Array.isArray(bodegasA9) && bodegasA9.length === 0, JSON.stringify(bodegasA9));

  // A10: lista blanca del módulo en el servicio (4 lectura + 4 escritura)
  const nombresRpcA = cliA._llamadas.rpc.map(function (l) { return l.nombre; });
  const tablasA = cliA._llamadas.from.map(function (l) { return l.tabla; });
  check('A10a', 'servicio: toda RPC invocada está en la lista blanca del módulo (lectura + escritura)',
    nombresRpcA.every(function (n) { return RPC_PERMITIDAS.indexOf(n) !== -1; }),
    JSON.stringify(nombresRpcA));
  check('A10b', 'servicio: from() solo sobre ubicaciones (SELECT)',
    tablasA.every(function (t) { return t === 'ubicaciones'; }), JSON.stringify(tablasA));

  // ===== B) VISTA ==========================================
  const cliB = clienteCatalogo(177, {
    inventario_obtener_existencias: function (args) {
      if (args.p_producto_id === 'prod-101') {
        return {
          data: [{ ubicacion_id: 'ub-1', ubicacion_nombre: 'EN BODEGA', cantidad: 5, linea_base_at: '2026-01-05T10:00:00+00:00', actualizado_at: '2026-02-01T09:30:00+00:00', linea_base_confirmada: true, asociado_historico: true }],
          error: null
        };
      }
      return { data: [], error: null };
    },
    inventario_obtener_bodegas_historicas: function (args) {
      if (args.p_producto_id !== 'prod-101') return { data: [], error: null };
      return {
        data: [
          { ubicacion_id: 'ub-1', ubicacion_nombre: 'EN BODEGA', archivo_origen: 'EN BODEGA.xlsx', registros_historicos: 174 },
          { ubicacion_id: 'ub-2', ubicacion_nombre: 'BODEGA OESTE', archivo_origen: 'INSUMOS -NUEVA BODEGA OESTE.xlsx', registros_historicos: 10 }
        ],
        error: null
      };
    },
    inventario_obtener_movimientos: function (args) {
      if (args.p_producto_id !== 'prod-101') return { data: [], error: null };
      const offset = Number(args.p_offset) || 0;
      const filas = [];
      if (offset === 0) {
        filas.push({ movimiento_id: 'mov-1', ubicacion_id: 'ub-1', ubicacion_nombre: 'EN BODEGA', tipo: 'ENTRADA', cantidad: 5, direccion: 'ENTRADA', motivo: 'Compra proveedor', saldo_resultante: 12, unidad_medida: 'Unidad', responsable_texto: 'Juan Pérez', registrado_por_nombre_snapshot: 'Admin', fecha: '2026-02-01T09:30:00+00:00', total: 27 });
        filas.push({ movimiento_id: 'mov-2', ubicacion_id: 'ub-2', ubicacion_nombre: 'BODEGA OESTE', tipo: 'SALIDA', cantidad: 1, direccion: 'SALIDA', motivo: 'Uso en obra', saldo_resultante: 11, unidad_medida: 'Unidad', responsable_texto: 'María Soto', registrado_por_nombre_snapshot: 'Admin', fecha: '2026-02-01T15:00:00+00:00', total: 27 });
      } else {
        for (let i = offset + 1; i <= 27; i++) {
          filas.push({ movimiento_id: 'mov-' + i, ubicacion_id: 'ub-1', ubicacion_nombre: 'EN BODEGA', tipo: 'SALIDA', cantidad: 1, direccion: 'SALIDA', motivo: null, saldo_resultante: 11, unidad_medida: 'Unidad', responsable_texto: 'María Soto', registrado_por_nombre_snapshot: 'Admin', fecha: '2026-02-02T10:00:00+00:00', total: 27 });
        }
      }
      return { data: filas, error: null };
    }
  });
  const vista = cargarVista(cliB, cargarServicio(cliB));
  const est = vista.invEstado;

  // B1: render + tarjetas + paginación
  const htmlRender = vista.renderInventarioView();
  check('B1a', 'render: buscador, filtro de bodega y contenedores presentes',
    contiene(htmlRender, 'id="inv-busqueda"') && contiene(htmlRender, 'id="inv-filtro-bodega"') &&
    contiene(htmlRender, 'id="inv-listado"') && contiene(htmlRender, 'id="inv-paginacion"'));
  await flush();
  const nodoListado = vista._doc.getElementById('inv-listado').innerHTML;
  check('B1b', 'catálogo: 12 tarjetas en la primera página (no 177)',
    cuenta(nodoListado, 'invAbrirFicha(') === 12, `tarjetas=${cuenta(nodoListado, 'invAbrirFicha(')}`);
  check('B1c', 'catálogo: paginación "Página 1 de 15" para 177 productos',
    contiene(vista._doc.getElementById('inv-paginacion').innerHTML, 'Página 1 de 15'),
    vista._doc.getElementById('inv-paginacion').innerHTML.slice(0, 200));
  check('B1d', 'encabezado: total real en #inv-total (177 productos) sin duplicarlo en el contador',
    contiene(vista._doc.getElementById('inv-total').innerHTML, '177 productos') &&
    noContiene(vista._doc.getElementById('inv-contador').innerHTML, '177 productos'),
    'total=' + vista._doc.getElementById('inv-total').innerHTML + ' contador=' + vista._doc.getElementById('inv-contador').innerHTML);
  check('B1f', 'encabezado: título claro "Inventario" dentro de la vista',
    contiene(htmlRender, '>Inventario</h2>'));
  check('B1e', 'filtro de bodega: opciones reales (EN BODEGA, BODEGA OESTE) sin HABITACIÓN',
    contiene(vista._doc.getElementById('inv-filtro-bodega').innerHTML, 'EN BODEGA') &&
    contiene(vista._doc.getElementById('inv-filtro-bodega').innerHTML, 'BODEGA OESTE') &&
    noContiene(vista._doc.getElementById('inv-filtro-bodega').innerHTML, 'HABITACIÓN 101'));

  // B2: tarjeta simplificada (INV-4.1) y escape
  const tarjeta = vista.invTarjetaHTML({
    producto_id: 'p-1',
    nombre: '<script>alert(1)</script>',
    unidad_medida: null,
    origen_registro: null,
    asociado_historico: false,
    tiene_existencia_operativa: false
  });
  check('B2a', 'tarjeta: nombre con <script> escapado',
    noContiene(tarjeta, '<script>') && contiene(tarjeta, '&lt;script&gt;'));
  check('B2b', 'tarjeta INV-4.1: sin "Sin unidad registrada" ni badges repetitivos de procedencia',
    noContiene(tarjeta, 'Sin unidad registrada') && noContiene(tarjeta, 'Catálogo inicial') &&
    noContiene(tarjeta, 'Creado en sistema') && noContiene(tarjeta, 'Origen no registrado') &&
    noContiene(tarjeta, '>Histórico<'));
  check('B2c', 'tarjeta INV-4.1: nombre protagonista (2 líneas, texto mayor) + tooltip con el nombre COMPLETO',
    contiene(tarjeta, 'line-clamp-2') && contiene(tarjeta, 'text-[15px]') &&
    contiene(tarjeta, 'title="&lt;script&gt;alert(1)&lt;/script&gt;"'));
  const tarjeta2 = vista.invTarjetaHTML({
    producto_id: 'p-2',
    nombre: 'Clavo largo galvanizado',
    unidad_medida: 'Unidad',
    origen_registro: 'CATALOGO_INICIAL',
    material_id: 'm-1',
    asociado_historico: true,
    tiene_existencia_operativa: true
  });
  check('B2d', 'tarjeta INV-4.1: unidad SOLO si está registrada; chip de existencia verificada conservado',
    contiene(tarjeta2, 'Unidad: Unidad') && contiene(tarjeta2, 'Con existencia verificada') &&
    noContiene(tarjeta2, 'Catálogo inicial') && noContiene(tarjeta2, '>Histórico<'));

  // B3: matemática de paginación
  est.total = 177;
  check('B3a', 'paginación: 177 productos → 15 páginas', vista.invTotalPaginas() === 15);
  est.total = 0;
  check('B3b', 'paginación: 0 productos → 1 página (sin división por cero)', vista.invTotalPaginas() === 1);
  est.total = 13;
  check('B3c', 'paginación: 13 productos → 2 páginas', vista.invTotalPaginas() === 2);
  est.total = 177;

  // B4: cambio de página
  est.pagina = 0;
  vista.invCambiarPagina(1);
  await flush();
  const argsB4 = cliB._llamadas.rpc[cliB._llamadas.rpc.length - 1].args;
  check('B4a', 'paginación: página 2 consulta p_offset 12',
    argsB4.p_offset === 12, JSON.stringify(argsB4));
  check('B4b', 'paginación: "Página 2 de 15" tras avanzar',
    contiene(vista._doc.getElementById('inv-paginacion').innerHTML, 'Página 2 de 15'));
  est.pagina = 14;
  vista.invCambiarPagina(1);
  check('B4c', 'paginación: en la última página "Siguiente" queda deshabilitado (sin salto)',
    est.pagina === 14 && contiene(vista._doc.getElementById('inv-paginacion').innerHTML, 'disabled'));
  est.pagina = 0;
  await flush();

  // B5: buscador con debounce y reset de página
  est.pagina = 1;
  vista.invOnBuscar('clavo');
  await flush();
  const argsB5 = cliB._llamadas.rpc[cliB._llamadas.rpc.length - 1].args;
  check('B5', 'buscador: nueva búsqueda envía el texto y vuelve a la página 1',
    argsB5.p_texto === 'clavo' && est.pagina === 0, JSON.stringify(argsB5));

  // B6: filtro por bodega
  vista.invOnFiltrarBodega('ub-2');
  await flush();
  const argsB6 = cliB._llamadas.rpc[cliB._llamadas.rpc.length - 1].args;
  check('B6a', 'filtro bodega: envía p_ubicacion_id con el id seleccionado',
    argsB6.p_ubicacion_id === 'ub-2', JSON.stringify(argsB6));
  check('B6b', 'filtro bodega: el contador nombra la bodega activa',
    contiene(vista._doc.getElementById('inv-contador').innerHTML, 'Bodega: BODEGA OESTE'),
    vista._doc.getElementById('inv-contador').innerHTML);

  // B7: estado de error con Reintentar
  const cliB7 = crearClienteStub({
    rpc: {
      inventario_buscar_productos: function () {
        return { data: null, error: { message: 'inventario_puede_consultar() denegó el acceso' } };
      }
    }
  });
  const vistaB7 = cargarVista(cliB7, cargarServicio(cliB7));
  vistaB7.renderInventarioView();
  await flush();
  const htmlB7 = vistaB7._doc.getElementById('inv-listado').innerHTML;
  check('B7a', 'error: mensaje visible con el detalle del backend',
    contiene(htmlB7, 'No fue posible cargar el catálogo') &&
    contiene(htmlB7, 'inventario_puede_consultar() denegó el acceso'));
  check('B7b', 'error: botón Reintentar presente',
    contiene(htmlB7, 'Reintentar'));

  // B8: estado vacío con Limpiar filtros
  const cliB8 = clienteCatalogo(0);
  const vistaB8 = cargarVista(cliB8, cargarServicio(cliB8));
  vistaB8.invEstado.texto = 'inexistente';
  vistaB8.renderInventarioView();
  await flush();
  const htmlB8 = vistaB8._doc.getElementById('inv-listado').innerHTML;
  check('B8', 'vacío: mensaje "No se encontraron productos" + Limpiar filtros con filtro activo',
    contiene(htmlB8, 'No se encontraron productos') && contiene(htmlB8, 'Limpiar filtros'));

  // B9: ficha completa
  est.productos = [
    { producto_id: 'prod-101', nombre: 'Clavo 2 pulgadas', unidad_medida: 'Unidad', origen_registro: 'CATALOGO_INICIAL', material_id: 'mat-101', asociado_historico: true, tiene_existencia_operativa: true }
  ];
  await vista.invAbrirFicha('prod-101');
  const htmlFicha = vista._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('B9a', 'ficha: nombre, unidad y origen del catálogo',
    contiene(htmlFicha, 'Clavo 2 pulgadas') && contiene(htmlFicha, 'Unidad: Unidad') &&
    contiene(htmlFicha, 'Catálogo inicial'));
  check('B9b', 'ficha: bodegas históricas con conteo etiquetado como registros del archivo (no stock)',
    contiene(htmlFicha, 'EN BODEGA') && contiene(htmlFicha, '174 registros en archivo histórico') &&
    contiene(htmlFicha, 'BODEGA OESTE') && contiene(htmlFicha, '10 registros en archivo histórico') &&
    contiene(htmlFicha, 'NO representan stock actual'));
  check('B9c', 'ficha: existencia verificada de EN BODEGA y bodega histórica sin línea base (BODEGA OESTE)',
    contiene(htmlFicha, 'Con línea base') && contiene(htmlFicha, 'BODEGA OESTE') &&
    contiene(htmlFicha, 'Sin línea base'));
  check('B9d', 'ficha: movimiento operativo con tipo, saldo, responsable y autor',
    contiene(htmlFicha, '>Entrada</span>') && contiene(htmlFicha, 'Saldo resultante: 12 Unidad') &&
    contiene(htmlFicha, 'Responsable: Juan Pérez') && contiene(htmlFicha, 'Registrado por: Admin'));
  check('B9e', 'ficha: paginación interna de movimientos (2 de 27 → "Ver más" con restantes)',
    contiene(htmlFicha, 'Ver más movimientos (25 restantes)'));
  check('B9f', 'ficha: procedencia con vínculo histórico',
    contiene(htmlFicha, 'Procedencia del catálogo') && contiene(htmlFicha, 'Vinculado al histórico'));
  check('B9g', 'ficha INV-5 (modo consulta): pie indica que las acciones requieren administrador vigente',
    contiene(htmlFicha, 'modo consulta para su perfil'));
  check('B9h', 'ficha INV-5 (modo consulta): SIN botones ni formularios de escritura',
    noContiene(htmlFicha, 'invAbrirOperacion(') && noContiene(htmlFicha, 'Confirmar existencia inicial') &&
    noContiene(htmlFicha, '＋ Entrada') && noContiene(htmlFicha, '<form'));

  // B10: ficha sin datos (textos neutros)
  await vista.invAbrirFicha('prod-999');
  const htmlFichaVacia = vista._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('B10a', 'ficha sin existencias: aviso "falta registrar la línea base" + neutros (histórico y movimientos)',
    contiene(htmlFichaVacia, 'Sin bodegas asociadas en el histórico.') &&
    contiene(htmlFichaVacia, 'Este producto aún no tiene existencias verificadas') &&
    contiene(htmlFichaVacia, 'Sin movimientos operativos registrados.'));
  check('B10c', 'ficha sin existencias: las bodegas reales del filtro quedan listas como "Sin línea base" (INV-5)',
    contiene(htmlFichaVacia, 'EN BODEGA') && contiene(htmlFichaVacia, 'BODEGA OESTE') &&
    contiene(htmlFichaVacia, 'Sin línea base'));
  check('B10b', 'ficha vacía: nombre ausente → "Sin nombre registrado" y unidad → "Sin unidad registrada"',
    contiene(htmlFichaVacia, 'Sin nombre registrado') && contiene(htmlFichaVacia, 'Sin unidad registrada'));

  // B11: NULLs neutros en movimientos (fila mov-2 del escenario A5 no aplica
  // aquí; se valida con el primer movimiento sin datos usando un cliente propio)
  const cliB11 = crearClienteStub({
    rpc: {
      inventario_obtener_existencias: function () { return { data: [], error: null }; },
      inventario_obtener_bodegas_historicas: function () { return { data: [], error: null }; },
      inventario_obtener_movimientos: function () {
        return {
          data: [{ movimiento_id: 'mov-x', ubicacion_id: null, ubicacion_nombre: null, tipo: null, cantidad: null, direccion: null, motivo: null, saldo_resultante: null, unidad_medida: null, responsable_texto: null, registrado_por_nombre_snapshot: null, fecha: null, total: 1 }],
          error: null
        };
      }
    }
  });
  const vistaB11 = cargarVista(cliB11, cargarServicio(cliB11));
  vistaB11.invEstado.productos = [{ producto_id: 'prod-x', nombre: 'Sin datos', unidad_medida: null, origen_registro: null }];
  await vistaB11.invAbrirFicha('prod-x');
  const htmlB11 = vistaB11._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('B11a', 'movimientos NULL: "Cantidad sin registrar" y "Movimiento sin tipo" (no 0)',
    contiene(htmlB11, 'Cantidad sin registrar') && contiene(htmlB11, 'Movimiento sin tipo') &&
    noContiene(htmlB11, '>0<'));
  check('B11b', 'movimientos NULL: "Sin responsable registrado", "Sin autor registrado", "Fecha no registrada"',
    contiene(htmlB11, 'Sin responsable registrado') &&
    contiene(htmlB11, 'Sin autor registrado') &&
    contiene(htmlB11, 'Fecha no registrada'));
  check('B11c', 'movimientos NULL: "Sin bodega registrada" para ubicación ausente',
    contiene(htmlB11, 'Sin bodega registrada'));

  // B12: "Ver más movimientos"
  await vista.invAbrirFicha('prod-101');
  await vista.invCargarMasMovimientos();
  const argsB12 = cliB._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_obtener_movimientos'; });
  const ultimoArgsB12 = argsB12[argsB12.length - 1].args;
  const htmlB12 = vista._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('B12a', 'ver más: reanuda con p_offset = 2 (filas ya mostradas) y p_limite 20',
    ultimoArgsB12.p_offset === 2 && ultimoArgsB12.p_limite === 20, JSON.stringify(ultimoArgsB12));
  check('B12b', 'ver más: los 27 movimientos quedan listados y el botón desaparece',
    cuenta(htmlB12, 'Registrado por: Admin') === 27 && noContiene(htmlB12, 'Ver más movimientos'),
    `listados=${cuenta(htmlB12, 'Registrado por: Admin')}`);

  // B13: la ficha no altera búsqueda, filtro ni página del catálogo
  est.texto = 'clavo';
  est.ubicacionId = 'ub-2';
  est.pagina = 1;
  await vista.invAbrirFicha('prod-101');
  vista.invCerrarFicha();
  check('B13a', 'ficha: al cerrar se conservan búsqueda, filtro y página del catálogo',
    est.texto === 'clavo' && est.ubicacionId === 'ub-2' && est.pagina === 1);
  const overlay = vista._doc.getElementById('inv-modal-ficha');
  check('B13b', 'ficha: el overlay queda oculto al cerrar', overlay.classList.contains('hidden'));
  check('B13c', 'listado: el HTML del catálogo detrás de la modal sigue intacto',
    cuenta(vista._doc.getElementById('inv-listado').innerHTML, 'invAbrirFicha(') === 12);
  est.texto = '';
  est.ubicacionId = '';
  est.pagina = 0;

  // B14: guardia de carriles al abrir dos fichas seguidas
  let resolverMovA = null;
  const promesaMovA = new Promise(function (r) { resolverMovA = r; });
  const cliB14 = crearClienteStub({
    rpc: {
      inventario_obtener_existencias: function () { return { data: [], error: null }; },
      inventario_obtener_bodegas_historicas: function () { return { data: [], error: null }; },
      inventario_obtener_movimientos: function (args) {
        if (args.p_producto_id === 'prod-a') return promesaMovA.then(function (d) { return d; });
        return { data: [{ movimiento_id: 'mov-b', ubicacion_id: null, ubicacion_nombre: 'EN BODEGA', tipo: 'ENTRADA', cantidad: 2, direccion: 'ENTRADA', motivo: null, saldo_resultante: 2, unidad_medida: 'Unidad', responsable_texto: 'Carla Ruiz', registrado_por_nombre_snapshot: 'Admin', fecha: '2026-03-01T08:00:00+00:00', total: 1 }], error: null };
      }
    }
  });
  const vistaB14 = cargarVista(cliB14, cargarServicio(cliB14));
  vistaB14.invEstado.productos = [
    { producto_id: 'prod-a', nombre: 'Producto A (no debe aparecer)', unidad_medida: null, origen_registro: 'SISTEMA' },
    { producto_id: 'prod-b', nombre: 'Producto B (ficha final)', unidad_medida: null, origen_registro: 'SISTEMA' }
  ];
  vistaB14.invAbrirFicha('prod-a'); // queda pendiente (RPC diferida)
  await vistaB14.invAbrirFicha('prod-b'); // gana la carrera
  resolverMovA({ data: [{ movimiento_id: 'mov-a', ubicacion_id: null, ubicacion_nombre: 'EN BODEGA', tipo: 'SALIDA', cantidad: 9, direccion: 'SALIDA', motivo: null, saldo_resultante: 0, unidad_medida: 'Unidad', responsable_texto: 'Tardío', registrado_por_nombre_snapshot: 'Admin', fecha: '2026-03-02T08:00:00+00:00', total: 1 }], error: null });
  await flush();
  const htmlB14 = vistaB14._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('B14', 'carriles: la respuesta tardía de la ficha A NO pisa a la ficha B',
    contiene(htmlB14, 'Producto B (ficha final)') && noContiene(htmlB14, 'Producto A (no debe aparecer)') &&
    noContiene(htmlB14, 'Tardío'));

  // B15: cero escrituras en todas las interacciones de la vista
  const escriturasTotales = [cliA, cliA8, cliA9, cliB, cliB7, cliB8, cliB11, cliB14]
    .reduce(function (acc, c) { return acc.concat(c._escrituras); }, []);
  check('B15', 'cero escrituras directas en todas las interacciones (insert/update/delete/rpc extrañas)',
    escriturasTotales.length === 0, JSON.stringify(escriturasTotales));

  // B16: filtro de bodegas con error de consulta (INV-4.1: sin degradar)
  const cliB16 = clienteCatalogo(177, null, function () {
    return { data: null, error: { message: 'permission denied for table ubicaciones' } };
  });
  const vistaB16 = cargarVista(cliB16, cargarServicio(cliB16));
  vistaB16.renderInventarioView();
  await flush();
  const selB16 = vistaB16._doc.getElementById('inv-filtro-bodega');
  check('B16a', 'filtro con error: desplegable DESHABILITADO con estado de error',
    selB16.disabled === true && contiene(selB16.innerHTML, 'Bodegas no disponibles (error de carga)'),
    selB16.innerHTML);
  check('B16b', 'filtro con error: el catálogo sigue operativo (12 tarjetas)',
    cuenta(vistaB16._doc.getElementById('inv-listado').innerHTML, 'invAbrirFicha(') === 12);
  check('B16c', 'filtro con error: sin degradación (no se listan ubicaciones ajenas)',
    noContiene(selB16.innerHTML, 'HABITACIÓN') && noContiene(selB16.innerHTML, 'ub-9'));

  // B17: sin filas tipo BODEGA (INV-4.1: lista vacía + filtro inhabilitado)
  const cliB17 = clienteCatalogo(177, null, function () {
    return { data: [{ id: 'ub-9', nombre: 'HABITACIÓN 101', tipo: 'HABITACION' }], error: null };
  });
  const vistaB17 = cargarVista(cliB17, cargarServicio(cliB17));
  vistaB17.renderInventarioView();
  await flush();
  const selB17 = vistaB17._doc.getElementById('inv-filtro-bodega');
  check('B17a', 'filtro sin bodegas: deshabilitado con "Sin bodegas registradas"',
    selB17.disabled === true && contiene(selB17.innerHTML, 'Sin bodegas registradas'),
    selB17.innerHTML);
  check('B17b', 'filtro sin bodegas: nunca lista ubicaciones que no son tipo BODEGA',
    noContiene(selB17.innerHTML, 'HABITACIÓN 101') && noContiene(selB17.innerHTML, 'ub-9'));

  // B18: selección de bodega obsoleta (ya no es una bodega) → se limpia
  // y el catálogo se recarga sin esa ubicación.
  est.texto = 'clavo';
  est.ubicacionId = 'ub-9'; // ubicación que ya no está en el filtro de bodegas
  vista._win.InventarioService.clearCache();
  vista.invPintarFiltroBodegas();
  await flush();
  const argsB18 = cliB._llamadas.rpc
    .filter(function (l) { return l.nombre === 'inventario_buscar_productos'; })
    .pop().args;
  check('B18a', 'filtro: la selección obsoleta se limpia (ubicacionId y página)',
    est.ubicacionId === '' && est.pagina === 0,
    JSON.stringify({ ubicacionId: est.ubicacionId, pagina: est.pagina }));
  check('B18b', 'filtro: el catálogo se recarga SIN la ubicación obsoleta',
    argsB18.p_ubicacion_id === null && argsB18.p_texto === 'clavo',
    JSON.stringify(argsB18));
  est.texto = '';
  est.pagina = 0;

  // B19: cero escrituras globales, incluyendo los escenarios INV-4.1
  const escriturasGlobales = [cliA, cliA8, cliA9, cliB, cliB7, cliB8, cliB11, cliB14, cliB16, cliB17]
    .reduce(function (acc, c) { return acc.concat(c._escrituras); }, []);
  check('B19', 'INV-4.1: cero escrituras globales en todos los escenarios (incl. filtros de bodegas)',
    escriturasGlobales.length === 0, JSON.stringify(escriturasGlobales));

  // ===== D) INV-5: ESCRITURA OPERATIVA =====================
  // Todos los escenarios pasan por las 4 RPC de escritura de la lista
  // blanca; el stub marca cualquier escritura directa o RPC ajena.

  // D1: botones de escritura condicionados al permiso efectivo
  const cliD1 = clienteInv5();
  const vistaD1r = cargarVista(cliD1, cargarServicio(cliD1)); // sin escritura (Técnico)
  const htmlD1r = vistaD1r.renderInventarioView();
  await flush();
  check('D1a', 'INV-5: sin permiso de escritura NO aparece "+ Nuevo producto"',
    noContiene(htmlD1r, '+ Nuevo producto') && noContiene(htmlD1r, 'inv-nuevo-producto'));
  await vistaD1r.invAbrirFicha('prod-101');
  const htmlFichaD1r = vistaD1r._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('D1b', 'INV-5: sin permiso, la ficha NO ofrece acciones por bodega',
    noContiene(htmlFichaD1r, 'invAbrirOperacion(') && noContiene(htmlFichaD1r, '＋ Entrada') &&
    noContiene(htmlFichaD1r, 'Confirmar existencia inicial'));

  const cliD1w = clienteInv5();
  const vistaD1w = cargarVista(cliD1w, cargarServicio(cliD1w), { operativo: true });
  const htmlD1w = vistaD1w.renderInventarioView();
  await flush();
  check('D1c', 'INV-5: con admin operativo SÍ aparece "+ Nuevo producto" (id inv-nuevo-producto)',
    contiene(htmlD1w, '+ Nuevo producto') && contiene(htmlD1w, 'id="inv-nuevo-producto"'));
  await vistaD1w.invAbrirFicha('prod-101');
  const htmlFichaD1w = vistaD1w._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('D1d', 'INV-5: con permiso, la ficha ofrece acciones por bodega reales',
    contiene(htmlFichaD1w, 'invAbrirOperacion(') &&
    contiene(htmlFichaD1w, 'Confirmar existencia inicial') &&
    contiene(htmlFichaD1w, '＋ Entrada') && contiene(htmlFichaD1w, '− Salida'));

  // D2: creación de producto (resultado CREADO)
  const cliD2 = clienteInv5({
    crear: function () {
      return { data: { resultado: 'CREADO', producto_id: 'prod-nuevo-1', coincidencias: [] }, error: null };
    }
  });
  const vistaD2 = cargarVista(cliD2, cargarServicio(cliD2), { operativo: true });
  vistaD2.renderInventarioView();
  await flush();
  const buscarAntesD2 = cliD2._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_buscar_productos'; }).length;
  vistaD2.invAbrirModalNuevo();
  vistaD2._doc.getElementById('inv-nuevo-nombre').value = 'Clavo 3 pulgadas';
  vistaD2._doc.getElementById('inv-nuevo-unidad').value = 'Unidad';
  vistaD2.invNuevoPasoConfirmar();
  const htmlD2conf = vistaD2._doc.getElementById('inv-nuevo-contenido').innerHTML;
  check('D2a', 'alta: el paso de confirmación muestra nombre y unidad ANTES de guardar',
    contiene(htmlD2conf, 'Clavo 3 pulgadas') && contiene(htmlD2conf, 'Confirmar creación') &&
    contiene(htmlD2conf, 'Unidad'));
  await vistaD2.invNuevoEnviar(false);
  const argsD2 = cliD2._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_crear_producto'; }).pop().args;
  check('D2b', 'alta: p_nombre, p_unidad_medida, p_material_id NULL y p_confirmar_distinto false',
    argsD2.p_nombre === 'Clavo 3 pulgadas' && argsD2.p_unidad_medida === 'Unidad' &&
    argsD2.p_material_id === null && argsD2.p_confirmar_distinto === false,
    JSON.stringify(argsD2));
  check('D2c', 'alta: CREADO → pantalla de éxito y catálogo re-consultado (force)',
    contiene(vistaD2._doc.getElementById('inv-nuevo-contenido').innerHTML, 'Producto creado correctamente') &&
    cliD2._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_buscar_productos'; }).length > buscarAntesD2);
  vistaD2.invNuevoVerFicha();
  await flush();
  check('D2d', 'alta: "Ver ficha" abre la ficha del producto creado con su nombre real (respaldo en memoria)',
    contiene(vistaD2._doc.getElementById('inv-ficha-contenido').innerHTML, 'Clavo 3 pulgadas') &&
    contiene(vistaD2._doc.getElementById('inv-ficha-contenido').innerHTML, 'Creado en sistema'));

  // D3: duplicados (advante del backend + confirmación explícita)
  const cliD3 = clienteInv5({
    crear: function (args) {
      if (args.p_confirmar_distinto === true) {
        return { data: { resultado: 'CREADO', producto_id: 'prod-nuevo-2', coincidencias: [] }, error: null };
      }
      return { data: { resultado: 'DUPLICADO', producto_id: null, coincidencias: [{ producto_id: 'prod-101', nombre: 'Clavo 2 pulgadas' }] }, error: null };
    }
  });
  const vistaD3 = cargarVista(cliD3, cargarServicio(cliD3), { operativo: true });
  vistaD3.invAbrirModalNuevo();
  vistaD3._doc.getElementById('inv-nuevo-nombre').value = 'Clavo 2 pulgadas';
  vistaD3.invNuevoPasoConfirmar();
  await vistaD3.invNuevoEnviar(false);
  const htmlD3dup = vistaD3._doc.getElementById('inv-nuevo-contenido').innerHTML;
  check('D3a', 'duplicados: el backend advierte y la UI lista las COINCIDENCIAS reales (sin inventar)',
    contiene(htmlD3dup, 'Posible producto duplicado') && contiene(htmlD3dup, 'Clavo 2 pulgadas') &&
    contiene(htmlD3dup, 'Continuar: es un producto distinto'));
  await vistaD3.invNuevoContinuarDistinto();
  const llamadasD3 = cliD3._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_crear_producto'; });
  check('D3b', 'duplicados: solo tras confirmar, el reintento lleva p_confirmar_distinto true',
    llamadasD3.length === 2 && llamadasD3[0].args.p_confirmar_distinto === false &&
    llamadasD3[1].args.p_confirmar_distinto === true,
    JSON.stringify(llamadasD3.map(function (l) { return l.args.p_confirmar_distinto; })));
  check('D3c', 'duplicados: con confirmación explícita el backend crea y la UI muestra éxito',
    contiene(vistaD3._doc.getElementById('inv-nuevo-contenido').innerHTML, 'Producto creado correctamente'));

  // D4: homónimo fuera del catálogo (permanente o temporal vigente).
  const crearD4 = function (args) {
    if (args.p_confirmar_distinto === true) {
      return { data: { resultado: 'CREADO', producto_id: 'prod-nuevo-3', coincidencias: [] }, error: null };
    }
    return { data: { resultado: 'HOMONIMO_FUERA_CATALOGO', producto_id: null, coincidencias: [{ nombre: 'Pintura blanca (histórico)' }] }, error: null };
  };
  const cliD4 = clienteInv5({ crear: crearD4 });
  const vistaD4 = cargarVista(cliD4, cargarServicio(cliD4), { operativo: true }); // NO permanente
  vistaD4.invAbrirModalNuevo();
  vistaD4._doc.getElementById('inv-nuevo-nombre').value = 'Pintura blanca';
  vistaD4.invNuevoPasoConfirmar();
  await vistaD4.invNuevoEnviar(true); // llamada directa: la primera solicitud sigue siendo false
  const htmlD4 = vistaD4._doc.getElementById('inv-nuevo-contenido').innerHTML;
  check('D4a', 'homónimo: temporal vigente recibe explicación y confirmación expresa',
    contiene(htmlD4, 'fuera del catálogo inicial') && contiene(htmlD4, 'Pintura blanca (histórico)') &&
    contiene(htmlD4, 'invNuevoContinuarDistinto'));
  check('D4b', 'homónimo: primera solicitud false y ninguna confirmación automática del temporal',
    cliD4._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_crear_producto'; })
      .length === 1 && cliD4._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_crear_producto'; })
      .every(function (l) { return l.args.p_confirmar_distinto === false && l.args.p_material_id === null; }));
  await vistaD4.invNuevoContinuarDistinto();
  check('D4b-confirmar', 'temporal: acción expresa envía true sin vínculo histórico',
    cliD4._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_crear_producto'; }).length === 2 &&
    cliD4._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_crear_producto'; }).pop().args.p_confirmar_distinto === true &&
    cliD4._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_crear_producto'; }).pop().args.p_material_id === null);

  const cliD4p = clienteInv5({ crear: crearD4 });
  const vistaD4p = cargarVista(cliD4p, cargarServicio(cliD4p), { operativo: true, permanente: true });
  vistaD4p.invAbrirModalNuevo();
  vistaD4p._doc.getElementById('inv-nuevo-nombre').value = 'Pintura blanca';
  vistaD4p.invNuevoPasoConfirmar();
  await vistaD4p.invNuevoEnviar(false);
  check('D4c', 'homónimo: el admin permanente recibe el botón para continuar',
    contiene(vistaD4p._doc.getElementById('inv-nuevo-contenido').innerHTML, 'invNuevoContinuarDistinto'));
  await vistaD4p.invNuevoContinuarDistinto();
  check('D4d', 'homónimo: la confirmación del admin permanente reintenta con p_confirmar_distinto true',
    cliD4p._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_crear_producto'; })
      .pop().args.p_confirmar_distinto === true);
  check('D4-advertencias', 'duplicado y homónimo advierten ficha independiente, sin vinculación automática',
    [htmlD3dup, htmlD4].every(function (html) {
      return contiene(html, 'ficha independiente') && contiene(html, 'no se modificará ni vinculará automáticamente ningún material histórico');
    }) && contiene(htmlD3dup, 'abrir la ficha existente'));
  check('D4-permanente-inicial', 'permanente: primera solicitud false y material null en ambas llamadas',
    cliD4p._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_crear_producto'; })[0].args.p_confirmar_distinto === false &&
    cliD4p._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_crear_producto'; }).every(function (l) { return l.args.p_material_id === null; }));

  const cliD4t = clienteInv5({ crear: function () { return { data: null, error: { message: 'INVENTARIO_ACCESO_DENEGADO' } }; } });
  const svcD4t = cargarServicio(cliD4t);
  const permisosD4t = { operativo: true };
  const vistaD4t = cargarVista(cliD4t, svcD4t, permisosD4t);
  vistaD4t.invAbrirModalNuevo();
  vistaD4t._doc.getElementById('inv-nuevo-nombre').value = 'Producto de prueba';
  vistaD4t.invNuevoPasoConfirmar();
  await vistaD4t.invNuevoContinuarDistinto();
  check('D4-prematuro', 'confirmar distinto antes de advertencia no envía ninguna RPC', cliD4t._llamadas.rpc.length === 0);
  permisosD4t.operativo = false; // Técnico / autorización administrativa ya no vigente.
  await vistaD4t.invNuevoEnviar(false);
  await vistaD4t.invNuevoContinuarDistinto();
  check('D4-tecnico', 'sin permiso operativo las funciones de interfaz no crean productos', cliD4t._llamadas.rpc.length === 0);
  const vistaD4soloLectura = cargarVista(cliD4t, svcD4t, { role: 'TECNICO' });
  vistaD4soloLectura.invAbrirModalNuevo();
  await vistaD4soloLectura.invNuevoEnviar(true);
  check('D4-tecnico-abrir', 'Técnico no puede abrir alta ni crear invocando sus funciones',
    vistaD4soloLectura._doc.getElementById('inv-modal-nuevo') === null && cliD4t._llamadas.rpc.length === 0);
  let rechazoD4t = false;
  try { await svcD4t.crearProducto({ nombre: 'Producto de prueba', confirmarDistinto: true }); }
  catch (e) { rechazoD4t = e.codigo === 'INVENTARIO_ACCESO_DENEGADO'; }
  check('D4-rpc-seguridad', 'llamada directa al servicio depende de rechazo RPC, sin ocultamiento como seguridad',
    rechazoD4t && cliD4t._llamadas.rpc.length === 1 &&
    cliD4t._llamadas.rpc[0].args.p_confirmar_distinto === true && cliD4t._llamadas.rpc[0].args.p_material_id === null);

  // D5: línea base con conteo CERO y reconsulta tras el éxito
  const cliD5 = clienteInv5();
  const vistaD5 = cargarVista(cliD5, cargarServicio(cliD5), { operativo: true });
  vistaD5.invEstado.productos = [
    { producto_id: 'prod-101', nombre: 'Clavo 2 pulgadas', unidad_medida: 'Unidad', origen_registro: 'CATALOGO_INICIAL', material_id: 'mat-101', asociado_historico: true, tiene_existencia_operativa: true }
  ];
  await vistaD5.invAbrirFicha('prod-101');
  vistaD5.invAbrirOperacion('linea_base', 'prod-101', 'ub-2', 'BODEGA OESTE');
  const htmlD5form = vistaD5._doc.getElementById('inv-op-contenido').innerHTML;
  check('D5a', 'línea base: formulario con bodega fija, conteo mínimo 0 y unidad requerida',
    contiene(htmlD5form, 'BODEGA OESTE') && contiene(htmlD5form, 'min="0"') &&
    contiene(htmlD5form, 'Conteo físico verificado') && contiene(htmlD5form, 'Unidad de medida'));
  vistaD5._doc.getElementById('inv-op-cantidad').value = '0';
  vistaD5._doc.getElementById('inv-op-unidad').value = 'Unidad';
  vistaD5._doc.getElementById('inv-op-responsable').value = '';
  vistaD5.invOpPasoConfirmar();
  const existAntesD5 = cliD5._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_obtener_existencias'; }).length;
  const movsAntesD5 = cliD5._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_obtener_movimientos'; }).length;
  await vistaD5.invOpEnviar();
  const argsD5 = cliD5._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_confirmar_linea_base'; }).pop().args;
  check('D5b', 'línea base CERO: el conteo 0 viaja tal cual (p_cantidad_contada === 0)',
    argsD5.p_cantidad_contada === 0, JSON.stringify(argsD5));
  check('D5c', 'línea base: responsable vacío → null; unidad y bodegas correctas',
    argsD5.p_responsable_texto === null && argsD5.p_unidad_medida === 'Unidad' &&
    argsD5.p_producto_id === 'prod-101' && argsD5.p_ubicacion_id === 'ub-2',
    JSON.stringify(argsD5));
  const existTrasD5 = cliD5._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_obtener_existencias'; }).length;
  const movsTrasD5 = cliD5._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_obtener_movimientos'; }).length;
  check('D5d', 'línea base: tras el éxito se re-consultan existencias y movimientos (force)',
    existTrasD5 > existAntesD5 && movsTrasD5 > movsAntesD5,
    `existencias ${existAntesD5}→${existTrasD5}, movimientos ${movsAntesD5}→${movsTrasD5}`);
  check('D5e', 'línea base: el modal de operación queda cerrado tras el éxito',
    vistaD5._doc.getElementById('inv-modal-operacion').classList.contains('hidden') === true);

  // D6: validaciones locales (sin llamada al backend)
  const cliD6 = clienteInv5();
  const vistaD6 = cargarVista(cliD6, cargarServicio(cliD6), { operativo: true });
  vistaD6.invEstado.productos = [
    { producto_id: 'prod-101', nombre: 'Clavo 2 pulgadas', unidad_medida: null, origen_registro: 'CATALOGO_INICIAL' }
  ];
  await vistaD6.invAbrirFicha('prod-101');
  const lineasBaseAntesD6 = cliD6._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_confirmar_linea_base'; }).length;
  vistaD6.invAbrirOperacion('linea_base', 'prod-101', 'ub-2', 'BODEGA OESTE');
  vistaD6._doc.getElementById('inv-op-cantidad').value = '3';
  vistaD6._doc.getElementById('inv-op-unidad').value = '';
  vistaD6.invOpPasoConfirmar();
  check('D6a', 'línea base sin unidad: rechazo local "Debe indicar la unidad" SIN invocar RPC',
    contiene(vistaD6._doc.getElementById('inv-op-contenido').innerHTML, 'Debe indicar la unidad de medida.') &&
    cliD6._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_confirmar_linea_base'; }).length === lineasBaseAntesD6);
  vistaD6._doc.getElementById('inv-op-cantidad').value = '-1';
  vistaD6._doc.getElementById('inv-op-unidad').value = 'Unidad';
  vistaD6.invOpPasoConfirmar();
  check('D6b', 'línea base negativa: rechazo local (el 0 sí está permitido)',
    contiene(vistaD6._doc.getElementById('inv-op-contenido').innerHTML, 'no puede ser negativa') &&
    cliD6._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_confirmar_linea_base'; }).length === lineasBaseAntesD6);
  vistaD6.invCerrarOperacion();
  const entradasAntesD6 = cliD6._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_registrar_entrada'; }).length;
  vistaD6.invAbrirOperacion('entrada', 'prod-101', 'ub-1', 'EN BODEGA');
  vistaD6._doc.getElementById('inv-op-cantidad').value = '0';
  vistaD6.invOpPasoConfirmar();
  check('D6c', 'entrada con cantidad 0: rechazo local "mayor a cero" SIN invocar RPC',
    contiene(vistaD6._doc.getElementById('inv-op-contenido').innerHTML, 'mayor a cero') &&
    cliD6._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_registrar_entrada'; }).length === entradasAntesD6);

  // D7: entrada exitosa, reconsulta y conservación de filtros
  const cliD7 = clienteInv5();
  const vistaD7 = cargarVista(cliD7, cargarServicio(cliD7), { operativo: true });
  vistaD7.invEstado.productos = [
    { producto_id: 'prod-101', nombre: 'Clavo 2 pulgadas', unidad_medida: 'Unidad', origen_registro: 'CATALOGO_INICIAL' }
  ];
  vistaD7.invEstado.texto = 'clavo';
  vistaD7.invEstado.ubicacionId = 'ub-2';
  vistaD7.invEstado.pagina = 1;
  await vistaD7.invAbrirFicha('prod-101');
  const buscarAntesD7 = cliD7._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_buscar_productos'; }).length;
  vistaD7.invAbrirOperacion('entrada', 'prod-101', 'ub-1', 'EN BODEGA');
  vistaD7._doc.getElementById('inv-op-cantidad').value = '3';
  vistaD7._doc.getElementById('inv-op-responsable').value = 'Juan Pérez';
  vistaD7.invOpPasoConfirmar();
  await vistaD7.invOpEnviar();
  const argsD7 = cliD7._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_registrar_entrada'; }).pop().args;
  check('D7a', 'entrada: p_cantidad 3, p_responsable_texto "Juan Pérez" y bodegas correctas',
    argsD7.p_cantidad === 3 && argsD7.p_responsable_texto === 'Juan Pérez' &&
    argsD7.p_producto_id === 'prod-101' && argsD7.p_ubicacion_id === 'ub-1',
    JSON.stringify(argsD7));
  check('D7b', 'entrada: tras el éxito se re-consulta el catálogo (force, conservando filtros)',
    cliD7._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_buscar_productos'; }).length > buscarAntesD7);
  check('D7c', 'INV-5: la operación NO altera búsqueda, filtro ni página del catálogo',
    vistaD7.invEstado.texto === 'clavo' && vistaD7.invEstado.ubicacionId === 'ub-2' &&
    vistaD7.invEstado.pagina === 1,
    JSON.stringify({ texto: vistaD7.invEstado.texto, ubicacionId: vistaD7.invEstado.ubicacionId, pagina: vistaD7.invEstado.pagina }));

  // D8: salida con STOCK_INSUFICIENTE (error claro, sin éxito falso)
  const cliD8 = clienteInv5({
    salida: function () { return { data: null, error: { message: 'STOCK_INSUFICIENTE: saldo insuficiente en la bodega' } }; }
  });
  const vistaD8 = cargarVista(cliD8, cargarServicio(cliD8), { operativo: true });
  vistaD8.invEstado.productos = [
    { producto_id: 'prod-101', nombre: 'Clavo 2 pulgadas', unidad_medida: 'Unidad', origen_registro: 'CATALOGO_INICIAL' }
  ];
  await vistaD8.invAbrirFicha('prod-101');
  const buscarAntesD8 = cliD8._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_buscar_productos'; }).length;
  const movsAntesD8 = cliD8._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_obtener_movimientos'; }).length;
  vistaD8.invAbrirOperacion('salida', 'prod-101', 'ub-1', 'EN BODEGA');
  check('D8a', 'salida: el formulario muestra el saldo actual REAL de la bodega (dato de Supabase)',
    contiene(vistaD8._doc.getElementById('inv-op-contenido').innerHTML, 'Saldo actual en esta bodega: 5'));
  vistaD8._doc.getElementById('inv-op-cantidad').value = '999';
  vistaD8.invOpPasoConfirmar();
  await vistaD8.invOpEnviar();
  const htmlD8 = vistaD8._doc.getElementById('inv-op-contenido').innerHTML;
  check('D8b', 'STOCK_INSUFICIENTE: mensaje claro del backend y el formulario sigue abierto',
    contiene(htmlD8, 'Saldo insuficiente en esa bodega') &&
    vistaD8._doc.getElementById('inv-modal-operacion').classList.contains('hidden') === false);
  check('D8c', 'STOCK_INSUFICIENTE: sin éxito falso — no se re-consultan ficha ni catálogo',
    cliD8._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_buscar_productos'; }).length === buscarAntesD8 &&
    cliD8._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_obtener_movimientos'; }).length === movsAntesD8);

  // D9: el backend deniega (INVENTARIO_ACCESO_DENEGADO) → mensaje claro
  const cliD9 = clienteInv5({
    lineaBase: function () { return { data: null, error: { message: 'INVENTARIO_ACCESO_DENEGADO: no autorizado' } }; }
  });
  const vistaD9 = cargarVista(cliD9, cargarServicio(cliD9), { operativo: true });
  vistaD9.invEstado.productos = [
    { producto_id: 'prod-101', nombre: 'Clavo 2 pulgadas', unidad_medida: 'Unidad', origen_registro: 'CATALOGO_INICIAL' }
  ];
  await vistaD9.invAbrirFicha('prod-101');
  vistaD9.invAbrirOperacion('linea_base', 'prod-101', 'ub-2', 'BODEGA OESTE');
  vistaD9._doc.getElementById('inv-op-cantidad').value = '2';
  vistaD9._doc.getElementById('inv-op-unidad').value = 'Unidad';
  vistaD9.invOpPasoConfirmar();
  await vistaD9.invOpEnviar();
  check('D9', 'permisos: denegación del backend → mensaje claro, sin éxito falso',
    contiene(vistaD9._doc.getElementById('inv-op-contenido').innerHTML, 'No tiene permisos para realizar esta operación'));

  // D10: servicio — contrato jsonb, códigos, whitelists y caché
  const cliD10 = crearClienteStub({
    rpc: {
      inventario_crear_producto: function () {
        return { data: [{ resultado: 'CREADO', producto_id: 'p-array', coincidencias: [] }], error: null };
      }
    }
  });
  const svcD10 = cargarServicio(cliD10);
  const resD10 = await svcD10.crearProducto({ nombre: 'Tornillo largo', unidadMedida: '' });
  check('D10a', 'servicio crear: tolera el jsonb como array de un objeto (modo TABLE)',
    resD10.resultado === 'CREADO' && resD10.productoId === 'p-array', JSON.stringify(resD10));
  const argsD10 = cliD10._llamadas.rpc[0].args;
  check('D10b', 'servicio crear: unidad vacía → null; p_material_id SIEMPRE null',
    argsD10.p_unidad_medida === null && argsD10.p_material_id === null &&
    argsD10.p_confirmar_distinto === false, JSON.stringify(argsD10));

  const cliD10c = crearClienteStub({});
  const svcD10c = cargarServicio(cliD10c);
  let errD10c = null;
  try { await svcD10c.registrarEntrada({ productoId: 'p1', ubicacionId: 'u1', cantidad: 'x' }); } catch (e) { errD10c = e; }
  check('D10c', 'servicio entrada: cantidad no numérica → codigo CANTIDAD_INVALIDA sin invocar RPC',
    errD10c !== null && errD10c.codigo === 'CANTIDAD_INVALIDA' && cliD10c._llamadas.rpc.length === 0,
    String(errD10c && errD10c.message));

  check('D10d', 'servicio: whitelist con 4 RPC de lectura + 4 de escritura (unión de 8)',
    svcD10.RPC_LECTURA_PERMITIDAS.length === 4 && svcD10.RPC_ESCRITURA_PERMITIDAS.length === 4 &&
    svcD10.RPC_PERMITIDAS.length === 8);

  const cliD10e = crearClienteStub({
    rpc: {
      inventario_buscar_productos: function () { return { data: filasBuscar(2, 1, 2), error: null }; },
      inventario_registrar_entrada: function () { return { data: null, error: null }; }
    }
  });
  const svcD10e = cargarServicio(cliD10e);
  await svcD10e.buscarProductos({});
  await svcD10e.buscarProductos({});
  const lecturasD10e = cliD10e._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_buscar_productos'; }).length;
  check('D10e1', 'caché: antes de escribir, la repetición NO vuelve a llamar (lecturas=' + lecturasD10e + ')',
    lecturasD10e === 1);
  await svcD10e.registrarEntrada({ productoId: 'p1', ubicacionId: 'u1', cantidad: 2 });
  await svcD10e.buscarProductos({});
  check('D10e2', 'caché: tras la escritura el catálogo se re-consulta (caché invalidada)',
    cliD10e._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_buscar_productos'; }).length === 2);

  // D11: cero escrituras directas en todos los escenarios INV-5
  const clientesInv5 = [cliD1, cliD1w, cliD2, cliD3, cliD4, cliD4p, cliD4t, cliD5, cliD6, cliD7, cliD8, cliD9, cliD10, cliD10c, cliD10e];
  const escriturasInv5 = clientesInv5.reduce(function (acc, c) { return acc.concat(c._escrituras); }, []);
  check('D11', 'INV-5: cero escrituras directas en todos los escenarios (solo RPC de la lista blanca)',
    escriturasInv5.length === 0, JSON.stringify(escriturasInv5));

  // ===== E) INV-5.1: AUTOCOMPLETADO DEL ALTA DE PRODUCTO ========
  // Las sugerencias son AYUDA preventiva: jamás escriben por sí solas ni
  // sustituyen la validación definitiva de inventario_crear_producto.

  // E1: sugerencias desde el primer carácter
  const cliE1 = clienteSug();
  const vistaE1 = cargarVista(cliE1, cargarServicio(cliE1), { operativo: true });
  vistaE1.renderInventarioView();
  await flush();
  vistaE1.invAbrirModalNuevo();
  vistaE1.invSugOnInput('c');
  await flush();
  const contE1 = vistaE1._doc.getElementById('inv-sug-container');
  check('E1a', 'autocompletado: desde el primer carácter sugiere productos reales con "Producto existente"',
    contiene(contE1.innerHTML, 'Producto existente') && contiene(contE1.innerHTML, 'Clavo 2 pulgadas') &&
    contiene(contE1.innerHTML, 'Candado grande'));
  const argsE1 = cliE1._llamadas.rpc
    .filter(function (l) { return l.nombre === 'inventario_buscar_productos'; }).pop().args;
  check('E1b', 'autocompletado: inventario_buscar_productos con p_texto, ubicación null, límite 8 y offset 0',
    argsE1.p_texto === 'c' && argsE1.p_ubicacion_id === null &&
    argsE1.p_limite === 8 && argsE1.p_offset === 0, JSON.stringify(argsE1));
  check('E1c', 'autocompletado: una sola letra NO pagina el catálogo completo (sin p_texto null de similares)',
    paginasCatalogoSimilar(cliE1).length === 0);
  check('E1d', 'autocompletado: máximo 8 sugerencias visibles (aquí 3 de "c")',
    cuenta(contE1.innerHTML, 'Producto existente') === 3 &&
    cuenta(contE1.innerHTML, 'Producto existente') <= 8);

  // E2: coincidencias progresivas y sin repetir la RPC con el mismo texto
  const buscarAntesE2 = cliE1._llamadas.rpc
    .filter(function (l) { return l.nombre === 'inventario_buscar_productos'; }).length;
  vistaE1.invSugOnInput('clav');
  await flush();
  check('E2a', 'autocompletado: las coincidencias se actualizan al seguir escribiendo ("clav")',
    contiene(contE1.innerHTML, 'Clavo 2 pulgadas') && noContiene(contE1.innerHTML, 'Candado grande'));
  vistaE1.invSugOnInput('clav'); // mismo texto
  await flush();
  check('E2b', 'autocompletado: si el texto no cambió NO se vuelve a consultar',
    cliE1._llamadas.rpc
      .filter(function (l) { return l.nombre === 'inventario_buscar_productos'; }).length === buscarAntesE2 + 1);

  // E3: sin resultados (texto corto no pide el catálogo; texto largo sí)
  vistaE1.invSugOnInput('qqq');
  await flush();
  check('E3a', 'sin resultados y texto corto: sugiere escribir más caracteres',
    contiene(contE1.innerHTML, 'Escriba más caracteres'));
  check('E3b', 'texto corto sin coincidencias: NO se pagina el catálogo de similitud',
    paginasCatalogoSimilar(cliE1).length === 0);
  vistaE1.invSugOnInput('qqqqqq');
  await flush();
  const paginasE3 = paginasCatalogoSimilar(cliE1);
  check('E3c', 'sin resultados y texto largo: se pide el catálogo UNA vez (p_limite 50) y avisa sin similares',
    contiene(contE1.innerHTML, 'Sin productos similares') &&
    paginasE3.length === 1 && paginasE3[0].args.p_limite === 50 && paginasE3[0].args.p_offset === 0 &&
    paginasE3[0].args.p_texto === null && paginasE3[0].args.p_ubicacion_id === null,
    JSON.stringify(paginasE3.map(function (l) { return l.args; })));

  // E4: error de escritura → sugerencias aproximadas (caché de catálogo)
  const cliE4 = clienteSug();
  const vistaE4 = cargarVista(cliE4, cargarServicio(cliE4), { operativo: true });
  vistaE4.renderInventarioView();
  await flush();
  vistaE4.invAbrirModalNuevo();
  vistaE4.invSugOnInput('destonillador'); // "destornillador" sin la "r"
  await flush();
  const contE4 = vistaE4._doc.getElementById('inv-sug-container');
  check('E4a', 'typo "destonillador": ofrece "¿Buscabas Destornillador?" como parecido',
    contiene(contE4.innerHTML, '¿Buscabas') && contiene(contE4.innerHTML, 'Destornillador') &&
    contiene(contE4.innerHTML, 'Producto existente') && contiene(contE4.innerHTML, 'Sin coincidencias exactas'));
  check('E4b', 'aproximadas: subcadena fallida + catálogo paginado por la MISMA RPC (sin datos simulados)',
    cliE4._llamadas.rpc
      .filter(function (l) { return l.nombre === 'inventario_buscar_productos' && l.args.p_texto === 'destonillador'; }).length === 1 &&
    paginasCatalogoSimilar(cliE4).length === 1);
  vistaE4.invSugOnInput('destonilador'); // otro typo
  await flush();
  check('E4c', 'otro typo: reutiliza el catálogo en caché (sin volver a paginarlo)',
    paginasCatalogoSimilar(cliE4).length === 1 &&
    contiene(vistaE4._doc.getElementById('inv-sug-container').innerHTML, 'Destornillador'));

  // E5: selección de una ficha existente (sin escrituras)
  const cliE5 = clienteSug();
  const vistaE5 = cargarVista(cliE5, cargarServicio(cliE5), { operativo: true });
  vistaE5.invAbrirModalNuevo();
  vistaE5.invSugOnInput('candado');
  await flush();
  vistaE5.invSugSeleccionar('sug-003'); // "Candado grande" (existente)
  const htmlE5 = vistaE5._doc.getElementById('inv-nuevo-contenido').innerHTML;
  check('E5a', 'seleccionar una sugerencia ofrece "Ver ficha existente" (no crea otra ficha)',
    contiene(htmlE5, 'Producto existente') && contiene(htmlE5, 'Candado grande') &&
    contiene(htmlE5, 'Ver ficha existente') && contiene(htmlE5, 'Seguir creando'));
  check('E5b', 'seleccionar una sugerencia NO invoca inventario_crear_producto',
    cliE5._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_crear_producto'; }).length === 0);
  vistaE5.invSugVerFicha();
  await flush();
  const htmlFichaE5 = vistaE5._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('E5c', '"Ver ficha existente" abre la ficha real del producto elegido y cierra el alta',
    contiene(htmlFichaE5, 'Candado grande') &&
    vistaE5._doc.getElementById('inv-modal-nuevo').classList.contains('hidden') === true);
  check('E5d', 'flujo de selección: cero escrituras directas',
    cliE5._escrituras.length === 0 &&
    cliE5._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_crear_producto'; }).length === 0);

  // E6: teclado (flechas, Enter y Escape)
  const cliE6 = clienteSug();
  const vistaE6 = cargarVista(cliE6, cargarServicio(cliE6), { operativo: true });
  vistaE6.invAbrirModalNuevo();
  vistaE6.invSugOnInput('clavo');
  await flush();
  const contE6 = vistaE6._doc.getElementById('inv-sug-container');
  check('E6a', 'teclado: al abrir aún no hay ítem resaltado',
    noContiene(contE6.innerHTML, 'inv-sug-item-activa') && cuenta(contE6.innerHTML, 'Producto existente') === 2);
  const evAbajoE6 = { key: 'ArrowDown', preventDefault: function () { this.preventido = true; } };
  const retE6b = vistaE6.invSugTeclado(evAbajoE6);
  check('E6b', 'teclado: ArrowDown resalta la 1ª sugerencia y cancela el movimiento nativo',
    retE6b === false && evAbajoE6.preventido === true &&
    cuenta(contE6.innerHTML, 'inv-sug-item-activa') === 1);
  vistaE6.invSugTeclado({ key: 'ArrowDown' }); // índice 1 (último)
  vistaE6.invSugTeclado({ key: 'ArrowUp' });   // índice 0
  vistaE6.invSugTeclado({ key: 'ArrowUp' });   // índice -1 (sin resaltar)
  check('E6c', 'teclado: las flechas suben/bajan y vuelven al estado sin resaltar',
    noContiene(contE6.innerHTML, 'inv-sug-item-activa'));
  check('E6d', 'teclado: Enter SIN resaltar no selecciona nada',
    vistaE6.invSugTeclado({ key: 'Enter' }) === true &&
    noContiene(vistaE6._doc.getElementById('inv-nuevo-contenido').innerHTML, 'Ver ficha existente'));
  vistaE6.invSugTeclado({ key: 'ArrowDown' });
  const retE6e = vistaE6.invSugTeclado({ key: 'Enter', preventDefault: function () { this.preventido = true; } });
  const htmlE6sel = vistaE6._doc.getElementById('inv-nuevo-contenido').innerHTML;
  check('E6e', 'teclado: ArrowDown + Enter selecciona la 1ª opción ("Clavo 2 pulgadas")',
    retE6e === false && contiene(htmlE6sel, 'Ver ficha existente') &&
    contiene(htmlE6sel, 'value="Clavo 2 pulgadas"'));
  vistaE6.invSugOnInput('clavo'); // reabrir con el MISMO texto
  await flush();
  check('E6f', 'reabrir con el mismo texto repinta el desplegable SIN nueva consulta',
    contiene(contE6.innerHTML, 'Producto existente') &&
    cliE6._llamadas.rpc
      .filter(function (l) { return l.nombre === 'inventario_buscar_productos' && l.args.p_texto === 'clavo'; }).length === 1);
  vistaE6.invSugTeclado({ key: 'ArrowDown' });
  vistaE6.invSugTeclado({ key: 'ArrowDown' }); // índice 1
  vistaE6.invSugTeclado({ key: 'Enter' });
  const htmlE6seg = vistaE6._doc.getElementById('inv-nuevo-contenido').innerHTML;
  check('E6g', 'teclado: la 2ª flecha abajo + Enter selecciona la 2ª opción ("Clavo largo")',
    contiene(htmlE6seg, 'Ver ficha existente') && contiene(htmlE6seg, 'value="Clavo largo"') &&
    noContiene(htmlE6seg, 'value="Clavo 2 pulgadas"'));
  vistaE6.invSugOnInput('clavo'); // reabrir para probar Escape
  await flush();
  vistaE6.invManejarTeclaFicha({ key: 'Escape' });
  check('E6h', 'Escape con desplegable abierto: se cierra SOLO el desplegable y el modal sigue abierto',
    vistaE6._doc.getElementById('inv-sug-container').innerHTML === '' &&
    vistaE6._doc.getElementById('inv-modal-nuevo').classList.contains('hidden') === false &&
    cliE6._llamadas.rpc
      .filter(function (l) { return l.nombre === 'inventario_buscar_productos' && l.args.p_texto === 'clavo'; }).length === 1);
  vistaE6.invManejarTeclaFicha({ key: 'Escape' });
  check('E6i', 'siguiente Escape: conserva el alta sin iniciar descarte',
    vistaE6._doc.getElementById('inv-modal-nuevo').classList.contains('hidden') === false &&
    !contiene(vistaE6.invNuevoHTML(), 'Descartar cambios'));

  // E7: respuestas fuera de orden (una respuesta vieja NO pisa la nueva)
  let resolverClE7 = null;
  const pendienteClE7 = new Promise(function (r) { resolverClE7 = r; });
  const cliE7 = clienteSug(function (args) {
    if (args.p_texto === 'cl') return pendienteClE7; // queda en vuelo
    return null; // resto: flujo normal del stub
  });
  const vistaE7 = cargarVista(cliE7, cargarServicio(cliE7), { operativo: true });
  vistaE7.invAbrirModalNuevo();
  vistaE7.invSugOnInput('cl');    // consulta 1 (pendiente)
  vistaE7.invSugOnInput('clavo'); // consulta 2 (se resuelve primero)
  await flush();
  const contE7 = vistaE7._doc.getElementById('inv-sug-container');
  check('E7a', 'fuera de orden: el desplegable muestra la búsqueda más reciente ("clavo")',
    contiene(contE7.innerHTML, 'Clavo 2 pulgadas'));
  resolverClE7({
    data: [Object.assign({}, CATALOGO_SUG[0], { producto_id: 'sug-viejo', nombre: 'Clavo antiguo de prueba', total: 1 })],
    error: null
  });
  await flush();
  check('E7b', 'fuera de orden: la respuesta tardía se DESCARTA y no sobrescribe la vigente',
    contiene(vistaE7._doc.getElementById('inv-sug-container').innerHTML, 'Clavo 2 pulgadas') &&
    noContiene(vistaE7._doc.getElementById('inv-sug-container').innerHTML, 'Clavo antiguo de prueba'));

  // E8: la validación definitiva de duplicados sigue siendo la RPC
  const cliE8 = clienteSug(null, {
    inventario_crear_producto: function (args) {
      if (args.p_confirmar_distinto === true) {
        return { data: { resultado: 'CREADO', producto_id: 'sug-nuevo', coincidencias: [] }, error: null };
      }
      return {
        data: { resultado: 'DUPLICADO', producto_id: null, coincidencias: [{ producto_id: 'sug-002', nombre: 'Clavo largo' }] },
        error: null
      };
    }
  });
  const vistaE8 = cargarVista(cliE8, cargarServicio(cliE8), { operativo: true });
  vistaE8.invAbrirModalNuevo();
  vistaE8.invSugOnInput('clavo');
  await flush();
  vistaE8.invSugSeleccionar('sug-002'); // "Clavo largo" (existente)
  check('E8a', 'selección: cero llamadas a inventario_crear_producto y panel "Ver ficha existente" visible',
    cliE8._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_crear_producto'; }).length === 0 &&
    contiene(vistaE8._doc.getElementById('inv-nuevo-contenido').innerHTML, 'Ver ficha existente'));
  vistaE8.invSugOnInput('Clavo largo'); // el usuario sigue escribiendo
  // El mini-DOM no enlaza #inv-sug-panel con la plantilla: el repintado
  // posterior demuestra que el estado de selección quedó limpio (en el
  // navegador el panel se retira sin repintar para conservar el foco).
  vistaE8.invNuevoPintar();
  check('E8b', 'escribir tras seleccionar anula la selección existente (no queda panel)',
    noContiene(vistaE8._doc.getElementById('inv-nuevo-contenido').innerHTML, 'Ver ficha existente'));
  // En el navegador el campo ya lleva el nombre real; el mini-DOM no
  // reconstruye value al repintar, así que se fija igual que en D.
  vistaE8._doc.getElementById('inv-nuevo-nombre').value = 'Clavo largo';
  vistaE8.invNuevoPasoConfirmar();
  await vistaE8.invNuevoEnviar(false);
  const llamadasE8 = cliE8._llamadas.rpc
    .filter(function (l) { return l.nombre === 'inventario_crear_producto'; });
  check('E8c', 'la validación definitiva sigue en la RPC: 1ª llamada con p_confirmar_distinto false',
    llamadasE8.length === 1 && llamadasE8[0].args.p_confirmar_distinto === false &&
    llamadasE8[0].args.p_nombre === 'Clavo largo',
    JSON.stringify(llamadasE8.map(function (l) { return l.args; })));
  check('E8d', 'el backend advierte el duplicado: la ayuda preventiva NO sustituye al servidor',
    contiene(vistaE8._doc.getElementById('inv-nuevo-contenido').innerHTML, 'Posible producto duplicado') &&
    noContiene(vistaE8._doc.getElementById('inv-nuevo-contenido').innerHTML, 'Producto creado correctamente'));

  // E9: servicio — catálogo paginado en caché temporal para similitud
  const cliE9 = crearClienteStub({
    rpc: {
      inventario_buscar_productos: function (args) {
        const offset = Number(args.p_offset) || 0;
        const limite = Number(args.p_limite) || 12;
        const total = 120;
        return {
          data: filasBuscar(total, offset + 1, Math.max(0, Math.min(limite, total - offset))),
          error: null
        };
      }
    }
  });
  const svcE9 = cargarServicio(cliE9);
  const catE9 = await svcE9.obtenerCatalogoSimilar();
  const paginasE9 = cliE9._llamadas.rpc
    .filter(function (l) { return l.nombre === 'inventario_buscar_productos'; });
  check('E9a', 'catálogo de similitud: se pagina por la MISMA RPC (p_texto null, límite 50, offset 0,50,100)',
    paginasE9.length === 3 &&
    paginasE9.every(function (l) {
      return l.args.p_texto === null && l.args.p_ubicacion_id === null && l.args.p_limite === 50;
    }) &&
    paginasE9.map(function (l) { return l.args.p_offset; }).join(',') === '0,50,100',
    JSON.stringify(paginasE9.map(function (l) { return l.args; })));
  check('E9b', 'catálogo de similitud: 120 nombres reales leídos y cacheados en memoria',
    catE9.length === 120 && catE9[0].nombre === 'Producto 1');
  await svcE9.obtenerCatalogoSimilar();
  check('E9c', 'catálogo de similitud: la repetición NO vuelve a paginar (TTL de la caché)',
    cliE9._llamadas.rpc
      .filter(function (l) { return l.nombre === 'inventario_buscar_productos'; }).length === paginasE9.length);
  await svcE9.registrarEntrada({ productoId: 'p1', ubicacionId: 'u1', cantidad: 2 });
  await svcE9.obtenerCatalogoSimilar();
  check('E9d', 'catálogo de similitud: una escritura invalida la caché (se vuelve a pedir)',
    cliE9._llamadas.rpc
      .filter(function (l) { return l.nombre === 'inventario_buscar_productos'; }).length > paginasE9.length);

  // E10: similitud de nombres (unidad pura, sin RPC)
  const simTypoE10 = vistaE1.invSimilitud('destonillador', 'destornillador');
  const simSinRelE10 = vistaE1.invSimilitud('clavo', 'destornillador');
  const simPalabraE10 = vistaE1.invSimilitud('Destornillador plano', 'destonillador');
  check('E10a', 'similitud: "destonillador" ≈ "destornillador" (≥ umbral) con mayúsculas ignoradas',
    simTypoE10 >= 0.75 && vistaE1.invSimilitud('DESTORNILLADOR', 'destornillador') === 1,
    'sim=' + simTypoE10.toFixed(3));
  check('E10b', 'similitud: nombres sin relación quedan BAJO el umbral (no se sugieren)',
    simSinRelE10 < 0.75, 'sim=' + simSinRelE10.toFixed(3));
  check('E10c', 'similitud por palabras: "destonillador" se parece a "Destornillador plano"',
    simPalabraE10 >= 0.75, 'sim=' + simPalabraE10.toFixed(3));
  const similaresE10 = vistaE1.invSimilares(CATALOGO_SUG, 'clavoo', 4);
  check('E10d', 'invSimilares: solo parecidos ≥ umbral (dos "Clavo…", nada ajeno)',
    similaresE10.length === 2 &&
    similaresE10.every(function (p) { return p.nombre.indexOf('Clavo') === 0; }),
    JSON.stringify(similaresE10.map(function (p) { return p.nombre; })));
  const muchosE10 = ['a', 'b', 'c', 'd', 'e', 'f'].map(function (letra, i) {
    return { producto_id: 'sim-' + i, nombre: 'clavo ' + letra };
  });
  check('E10e', 'invSimilares: respeta el tope (nunca una lista enorme)',
    vistaE1.invSimilares(muchosE10, 'clavoo', 4).length === 4);

  // E11: cero escrituras directas en todos los escenarios INV-5.1
  const clientesInv51 = [cliE1, cliE4, cliE5, cliE6, cliE7, cliE8, cliE9];
  const escriturasInv51 = clientesInv51.reduce(function (acc, c) { return acc.concat(c._escrituras); }, []);
  check('E11', 'INV-5.1: cero escrituras directas en todos los escenarios (solo RPC de la lista blanca)',
    escriturasInv51.length === 0, JSON.stringify(escriturasInv51));

  // ===== F) INV-5.2: BOTONES POR ESTADO DE LÍNEA BASE ============
  // Contrato de inventario_obtener_existencias: la acción de la fila se
  // decide SOLO con linea_base_confirmada === true (booleano estricto).
  // NULL, 0, false o cadenas NO habilitan entradas/salidas.

  // Marcadores de acción presentes en un HTML de ficha (huella comparable).
  function marcadoresAcciones(html) {
    return [
      'Confirmar existencia inicial', '＋ Entrada', '− Salida',
      "invAbrirOperacion('linea_base'", "invAbrirOperacion('entrada'",
      "invAbrirOperacion('salida'"
    ].map(function (t) { return contiene(html, t) ? '1' : '0'; }).join('');
  }

  // F1: SIN línea base confirmada → solo "Confirmar existencia inicial".
  // Caso reportado: "4 RUEDAS DE ANDAMIOS" con fila de existencia NO
  // confirmada en EN BODEGA (cantidad NULL) e histórica BODEGA OESTE sin fila.
  const cliF1 = clienteCatalogo(177, {
    inventario_obtener_existencias: function (args) {
      if (args.p_producto_id !== 'prod-101') return { data: [], error: null };
      return {
        data: [{ ubicacion_id: 'ub-1', ubicacion_nombre: 'EN BODEGA', cantidad: null, linea_base_at: null, actualizado_at: null, linea_base_confirmada: false, asociado_historico: true }],
        error: null
      };
    },
    inventario_obtener_bodegas_historicas: function (args) {
      if (args.p_producto_id !== 'prod-101') return { data: [], error: null };
      return {
        data: [{ ubicacion_id: 'ub-2', ubicacion_nombre: 'BODEGA OESTE', archivo_origen: 'INSUMOS -NUEVA BODEGA OESTE.xlsx', registros_historicos: 10 }],
        error: null
      };
    }
  });
  const vistaF1 = cargarVista(cliF1, cargarServicio(cliF1), { operativo: true });
  vistaF1.invEstado.productos = [
    { producto_id: 'prod-101', nombre: '4 RUEDAS DE ANDAMIOS', unidad_medida: 'Unidad', origen_registro: 'CATALOGO_INICIAL' }
  ];
  await vistaF1.invAbrirFicha('prod-101');
  const htmlF1 = vistaF1._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('F1a', 'sin línea base: SOLO "Confirmar existencia inicial" en ambas bodegas (0 entradas/salidas)',
    cuenta(htmlF1, 'Confirmar existencia inicial') === 2 &&
    noContiene(htmlF1, '＋ Entrada') && noContiene(htmlF1, '− Salida') &&
    noContiene(htmlF1, "invAbrirOperacion('entrada'") && noContiene(htmlF1, "invAbrirOperacion('salida'"),
    'confirmar=' + cuenta(htmlF1, 'Confirmar existencia inicial'));
  check('F1b', 'sin línea base: chips de estado reales (fila no confirmada y bodega histórica sin fila)',
    contiene(htmlF1, 'Sin línea base confirmada') && contiene(htmlF1, '>Sin línea base</span>') &&
    noContiene(htmlF1, 'Con línea base</span>'));
  check('F1c', 'sin línea base: cantidad neutra y el histórico NUNCA se ofrece como línea base',
    contiene(htmlF1, 'Cantidad sin registrar') &&
    contiene(htmlF1, 'NO representan stock actual'));

  // F1d: Técnico (sin escritura) → ninguna acción en ningún estado.
  const vistaF1r = cargarVista(cliF1, cargarServicio(cliF1)); // perfil consulta
  vistaF1r.invEstado.productos = vistaF1.invEstado.productos;
  await vistaF1r.invAbrirFicha('prod-101');
  const htmlF1r = vistaF1r._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('F1d', 'Técnico sin línea base: NINGUNA acción de escritura visible',
    noContiene(htmlF1r, 'invAbrirOperacion(') && noContiene(htmlF1r, 'Confirmar existencia inicial') &&
    noContiene(htmlF1r, '＋ Entrada') && noContiene(htmlF1r, '− Salida'));

  // F2/F3: línea base CONFIRMADA (cantidad 0 y cantidad positiva) →
  // entrada/salida habilitadas según permisos; nunca se re-ofrece la base.
  const cliF23 = clienteCatalogo(177, {
    inventario_obtener_existencias: function (args) {
      if (args.p_producto_id === 'prod-101') {
        return {
          data: [{ ubicacion_id: 'ub-1', ubicacion_nombre: 'EN BODEGA', cantidad: 0, linea_base_at: '2026-10-10T09:00:00+00:00', actualizado_at: '2026-10-17T09:00:00+00:00', linea_base_confirmada: true, asociado_historico: false }],
          error: null
        };
      }
      if (args.p_producto_id === 'prod-102') {
        return {
          data: [{ ubicacion_id: 'ub-2', ubicacion_nombre: 'BODEGA OESTE', cantidad: 5, linea_base_at: '2026-10-10T09:00:00+00:00', actualizado_at: '2026-10-17T09:00:00+00:00', linea_base_confirmada: true, asociado_historico: false }],
          error: null
        };
      }
      return { data: [], error: null };
    }
  });
  const vistaF23 = cargarVista(cliF23, cargarServicio(cliF23), { operativo: true });
  vistaF23.invEstado.productos = [
    { producto_id: 'prod-101', nombre: 'Producto con base cero', unidad_medida: 'Unidad', origen_registro: 'CATALOGO_INICIAL' },
    { producto_id: 'prod-102', nombre: 'Producto con base positiva', unidad_medida: 'Caja', origen_registro: 'CATALOGO_INICIAL' }
  ];
  await vistaF23.invAbrirFicha('prod-101');
  const htmlF2 = vistaF23._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('F2a', 'línea base 0: confirmada, muestra 0 y ofrece "＋ Entrada" y "− Salida" (sin re-ofrecer la base)',
    contiene(htmlF2, 'Con línea base') && contiene(htmlF2, '>0</span>') &&
    contiene(htmlF2, '＋ Entrada') && contiene(htmlF2, '− Salida') &&
    noContiene(htmlF2, 'Confirmar existencia inicial'));
  await vistaF23.invAbrirFicha('prod-102');
  const htmlF3 = vistaF23._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('F3a', 'línea base positiva: muestra la cantidad real con entrada/salida y sin "Confirmar existencia inicial"',
    contiene(htmlF3, 'Con línea base') && contiene(htmlF3, '>5</span>') &&
    contiene(htmlF3, '＋ Entrada') && contiene(htmlF3, '− Salida') &&
    noContiene(htmlF3, 'Confirmar existencia inicial'));

  const vistaF23r = cargarVista(cliF23, cargarServicio(cliF23)); // Técnico
  vistaF23r.invEstado.productos = vistaF23.invEstado.productos;
  await vistaF23r.invAbrirFicha('prod-101');
  const htmlF2r = vistaF23r._doc.getElementById('inv-ficha-contenido').innerHTML;
  await vistaF23r.invAbrirFicha('prod-102');
  const htmlF3r = vistaF23r._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('F2b', 'Técnico con línea base (0 y positiva): NINGUNA acción de escritura visible',
    noContiene(htmlF2r, 'invAbrirOperacion(') && noContiene(htmlF2r, '＋ Entrada') &&
    noContiene(htmlF2r, '− Salida') && noContiene(htmlF3r, 'invAbrirOperacion(') &&
    noContiene(htmlF3r, '＋ Entrada') && noContiene(htmlF3r, 'Confirmar existencia inicial'));

  // F4: administrador temporal vigente (operativo sin permanente) ⇒ las
  // MISMAS acciones operativas que el administrador permanente.
  const vistaF23p = cargarVista(cliF23, cargarServicio(cliF23), { operativo: true, permanente: true });
  vistaF23p.invEstado.productos = vistaF23.invEstado.productos;
  await vistaF23p.invAbrirFicha('prod-101');
  const htmlF2p = vistaF23p._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('F4a', 'admin temporal vigente = permanente en acciones (línea base 0 y positiva)',
    marcadoresAcciones(htmlF2p) === marcadoresAcciones(htmlF2) &&
    marcadoresAcciones(htmlF2p) === marcadoresAcciones(htmlF3) &&
    marcadoresAcciones(htmlF2).indexOf('011011') === 0,
    `temp=${marcadoresAcciones(htmlF2)} perm=${marcadoresAcciones(htmlF2p)}`);
  const vistaF1p = cargarVista(cliF1, cargarServicio(cliF1), { operativo: true, permanente: true });
  vistaF1p.invEstado.productos = vistaF1.invEstado.productos;
  await vistaF1p.invAbrirFicha('prod-101');
  const htmlF1p = vistaF1p._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('F4b', 'admin temporal vigente = permanente en acciones (sin línea base: solo confirmar)',
    marcadoresAcciones(htmlF1p) === marcadoresAcciones(htmlF1) &&
    marcadoresAcciones(htmlF1).indexOf('100100') === 0,
    `temp=${marcadoresAcciones(htmlF1)} perm=${marcadoresAcciones(htmlF1p)}`);

  // F5: caché invalidada y ficha actualizada tras confirmar línea base
  // (conteo físico 0 permitido; el estado real llega de la RPC re-consultada).
  let baseConfirmadaF5 = false;
  const cliF5 = clienteCatalogo(177, {
    inventario_obtener_existencias: function (args) {
      if (args.p_producto_id !== 'prod-f5') return { data: [], error: null };
      return {
        data: [{
          ubicacion_id: 'ub-1', ubicacion_nombre: 'EN BODEGA',
          cantidad: baseConfirmadaF5 === true ? 0 : null,
          linea_base_at: baseConfirmadaF5 === true ? '2026-10-18T10:00:00+00:00' : null,
          actualizado_at: baseConfirmadaF5 === true ? '2026-10-18T10:00:00+00:00' : null,
          linea_base_confirmada: baseConfirmadaF5 === true,
          asociado_historico: false
        }],
        error: null
      };
    },
    inventario_confirmar_linea_base: function () {
      baseConfirmadaF5 = true;
      return { data: null, error: null };
    }
  });
  const vistaF5 = cargarVista(cliF5, cargarServicio(cliF5), { operativo: true });
  vistaF5.invEstado.productos = [
    { producto_id: 'prod-f5', nombre: 'Producto de prueba de línea base', unidad_medida: 'Unidad', origen_registro: 'CATALOGO_INICIAL' }
  ];
  await vistaF5.invAbrirFicha('prod-f5');
  const htmlF5a = vistaF5._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('F5a', 'antes de confirmar: fila con existencia no confirmada → SOLO "Confirmar existencia inicial"',
    cuenta(htmlF5a, 'Confirmar existencia inicial') === 1 &&
    noContiene(htmlF5a, '＋ Entrada') && noContiene(htmlF5a, '− Salida'));
  const existF5antes = cliF5._llamadas.rpc
    .filter(function (l) { return l.nombre === 'inventario_obtener_existencias'; }).length;
  vistaF5.invAbrirOperacion('linea_base', 'prod-f5', 'ub-1', 'EN BODEGA');
  vistaF5._doc.getElementById('inv-op-cantidad').value = '0'; // conteo físico 0
  vistaF5._doc.getElementById('inv-op-unidad').value = 'Unidad';
  vistaF5.invOpPasoConfirmar();
  await vistaF5.invOpEnviar();
  const argsF5 = cliF5._llamadas.rpc
    .filter(function (l) { return l.nombre === 'inventario_confirmar_linea_base'; }).pop().args;
  check('F5b', 'confirmación con conteo 0: p_cantidad_contada === 0 viaja tal cual',
    argsF5.p_cantidad_contada === 0 && argsF5.p_unidad_medida === 'Unidad',
    JSON.stringify(argsF5));
  const htmlF5b = vistaF5._doc.getElementById('inv-ficha-contenido').innerHTML;
  check('F5c', 'después de confirmar: ficha re-consultada con "Con línea base" y acciones de entrada/salida',
    contiene(htmlF5b, 'Con línea base') && contiene(htmlF5b, '>0</span>') &&
    contiene(htmlF5b, '＋ Entrada') && contiene(htmlF5b, '− Salida') &&
    noContiene(htmlF5b, 'Sin línea base confirmada') &&
    cliF5._llamadas.rpc
      .filter(function (l) { return l.nombre === 'inventario_obtener_existencias'; }).length > existF5antes);

  // F5d: invalidación de CACHÉ a nivel de servicio (lectura SIN force).
  let baseConfirmadaF5d = false;
  const cliF5d = crearClienteStub({
    rpc: {
      inventario_obtener_existencias: function (args) {
        if (args.p_producto_id !== 'p-f5d') return { data: [], error: null };
        return {
          data: [{ ubicacion_id: 'u1', ubicacion_nombre: 'BODEGA', cantidad: baseConfirmadaF5d === true ? 0 : null, linea_base_at: null, actualizado_at: null, linea_base_confirmada: baseConfirmadaF5d === true, asociado_historico: false }],
          error: null
        };
      },
      inventario_confirmar_linea_base: function () {
        baseConfirmadaF5d = true;
        return { data: null, error: null };
      }
    }
  });
  const svcF5d = cargarServicio(cliF5d);
  const antesF5d = await svcF5d.obtenerExistencias('p-f5d'); // cachea el estado viejo
  check('F5d1', 'caché: la lectura inicial registra el estado real sin línea base',
    antesF5d[0].linea_base_confirmada === false && antesF5d[0].cantidad === null);
  await svcF5d.confirmarLineaBase({ productoId: 'p-f5d', ubicacionId: 'u1', cantidadContada: 0, unidadMedida: 'Unidad', responsableTexto: '' });
  const despuesF5d = await svcF5d.obtenerExistencias('p-f5d'); // SIN force
  const existF5d = cliF5d._llamadas.rpc
    .filter(function (l) { return l.nombre === 'inventario_obtener_existencias'; }).length;
  check('F5d2', 'caché invalidada tras confirmar: SIN force devuelve confirmada=true y cantidad 0 (no null)',
    despuesF5d[0].linea_base_confirmada === true && despuesF5d[0].cantidad === 0 &&
    existF5d === 2, 'lecturas=' + existF5d);

  // F6: cero escrituras directas en todos los escenarios INV-5.2
  const clientesF = [cliF1, cliF23, cliF5, cliF5d];
  const escriturasF = clientesF.reduce(function (acc, c) { return acc.concat(c._escrituras); }, []);
  check('F6', 'INV-5.2: cero escrituras directas en todos los escenarios (solo RPC de la lista blanca)',
    escriturasF.length === 0, JSON.stringify(escriturasF));

  // ===== G) INV-5.3: CIERRE INTENCIONAL Y PROTECCIÓN DE DATOS ======
  // El clic/soltar fuera de los formularios NO los cierra; ✕, Cancelar o
  // Escape cierran (con aviso si hay cambios sin guardar). El desplegable
  // de autocompletado se cierra antes que el modal (INV-5.1 conservado).

  // Simula un clic (o el soltar del ratón tras una selección) que aterriza
  // en el fondo del overlay: target === overlay.
  function clicFuera(vista, overlayId) {
    const ov = vista._doc.getElementById(overlayId);
    ov._dispatch('click', { target: ov });
    return ov;
  }
  // Escape real vía el listener de document (no invocando la función a mano).
  function escapeDoc(vista) {
    vista._doc._dispatch('keydown', { key: 'Escape' });
  }

  const cliG1 = clienteInv5();
  const vistaG1 = cargarVista(cliG1, cargarServicio(cliG1), { operativo: true });

  // G1a: alta con texto escrito; soltar el ratón fuera NO cierra.
  vistaG1.invAbrirModalNuevo();
  vistaG1._doc.getElementById('inv-nuevo-nombre').value = 'Martillo de goma';
  const ovG1a = clicFuera(vistaG1, 'inv-modal-nuevo');
  check('G1a', 'alta: soltar el ratón fuera (tras selección de texto) NO cierra el formulario',
    ovG1a.classList.contains('hidden') === false &&
    vistaG1._doc.getElementById('inv-nuevo-nombre').value === 'Martillo de goma');

  // G1b: operación con cantidad escrita; clic en el fondo NO cierra.
  vistaG1.invAbrirOperacion('entrada', 'prod-101', 'ub-1', 'EN BODEGA');
  vistaG1._doc.getElementById('inv-op-cantidad').value = '7';
  const ovG1b = clicFuera(vistaG1, 'inv-modal-operacion');
  check('G1b', 'operación: clic en el fondo con datos escritos NO cierra el formulario',
    ovG1b.classList.contains('hidden') === false &&
    vistaG1._doc.getElementById('inv-op-cantidad').value === '7');
  vistaG1.invCerrarOperacionForzado(); // limpieza

  // G2: cerrar con ✕/Cancelar con datos → aviso; "Descartar" cierra.
  vistaG1.invAbrirModalNuevo();
  vistaG1._doc.getElementById('inv-nuevo-nombre').value = 'Clavo nuevo';
  vistaG1.invCerrarModalNuevo(); // ✕ / Cancelar
  const contG2 = vistaG1._doc.getElementById('inv-nuevo-contenido').innerHTML;
  check('G2a', 'cerrar con ✕/Cancelar con datos → aviso de descarte y el modal SIGUE abierto',
    contiene(contG2, 'Descartar cambios') && contiene(contG2, 'Seguir editando') &&
    vistaG1._doc.getElementById('inv-modal-nuevo').classList.contains('hidden') === false);
  vistaG1.invNuevoSeguirEditando();
  check('G2a-datos', 'el nombre se conserva tras cancelar el descarte',
    contiene(vistaG1.invNuevoHTML(), 'value="Clavo nuevo"'));
  vistaG1.invCerrarModalNuevo();
  vistaG1.invNuevoDescartar();
  check('G2b', '"Descartar" cierra el alta tras la confirmación',
    vistaG1._doc.getElementById('inv-modal-nuevo').classList.contains('hidden') === true);

  // G3: cancelar el descarte → conserva exactamente lo escrito.
  vistaG1.invAbrirModalNuevo();
  vistaG1._doc.getElementById('inv-nuevo-nombre').value = 'Sierra manual';
  vistaG1._doc.getElementById('inv-nuevo-unidad').value = 'Unidad';
  vistaG1.invCerrarModalNuevo(); // aviso
  vistaG1.invNuevoSeguirEditando(); // "Seguir editando"
  const contG3 = vistaG1._doc.getElementById('inv-nuevo-contenido').innerHTML;
  check('G3', 'cancelar el descarte → vuelve al formulario y conserva EXACTAMENTE lo escrito',
    !contiene(contG3, 'Descartar cambios') &&
    contiene(contG3, 'Sierra manual') && contiene(contG3, 'Unidad') &&
    vistaG1._doc.getElementById('inv-modal-nuevo').classList.contains('hidden') === false);

  // G4: Escape con formulario modificado → aviso (no cierra directo).
  vistaG1._doc.getElementById('inv-nuevo-nombre').value = 'Destornillador';
  escapeDoc(vistaG1);
  check('G4', 'Escape conserva el formulario modificado sin pedir descarte',
    !contiene(vistaG1._doc.getElementById('inv-nuevo-contenido').innerHTML, 'Descartar cambios') &&
    vistaG1._doc.getElementById('inv-nuevo-nombre').value === 'Destornillador' &&
    vistaG1._doc.getElementById('inv-modal-nuevo').classList.contains('hidden') === false);
  vistaG1.invCerrarModalNuevo(); // cierre explícito mantiene la confirmación
  const avisoAntesEscape = vistaG1._doc.getElementById('inv-nuevo-contenido').innerHTML;
  // G4b: Escape con el aviso activo → lo retira y conserva lo escrito.
  escapeDoc(vistaG1);
  const contG4b = vistaG1._doc.getElementById('inv-nuevo-contenido').innerHTML;
  check('G4b', 'Escape conserva el aviso de descarte y los datos',
    contiene(contG4b, 'Descartar cambios') && contG4b === avisoAntesEscape &&
    vistaG1._doc.getElementById('inv-modal-nuevo').classList.contains('hidden') === false);

  vistaG1.invNuevoSeguirEditando();
  check('G4c', 'Seguir editando explícito recupera los datos tras Escape',
    vistaG1._doc.getElementById('inv-nuevo-nombre').value === 'Destornillador');
  // G5: Escape con formulario SIN cambios → cierra normal (sin aviso).
  vistaG1.invAbrirModalNuevo(); // estado limpio
  vistaG1._doc.getElementById('inv-nuevo-nombre').value = '';
  vistaG1._doc.getElementById('inv-nuevo-unidad').value = '';
  escapeDoc(vistaG1);
  check('G5', 'Escape con formulario SIN cambios lo conserva abierto',
    vistaG1._doc.getElementById('inv-modal-nuevo').classList.contains('hidden') === false);

  // G6: operación protegida igual que el alta (Cancelar/aviso/conservar/descartar).
  vistaG1.invAbrirOperacion('entrada', 'prod-101', 'ub-1', 'EN BODEGA');
  vistaG1._doc.getElementById('inv-op-cantidad').value = '5';
  vistaG1.invCerrarOperacion(); // Cancelar
  const contG6 = vistaG1._doc.getElementById('inv-op-contenido').innerHTML;
  check('G6a', 'operación: Cancelar con datos escritos → aviso de descarte, modal abierto',
    contiene(contG6, 'Descartar cambios') && contiene(contG6, '5') &&
    vistaG1._doc.getElementById('inv-modal-operacion').classList.contains('hidden') === false);
  vistaG1.invOpSeguirEditando();
  const contG6b = vistaG1._doc.getElementById('inv-op-contenido').innerHTML;
  check('G6b', 'operación: cancelar el descarte conserva la cantidad escrita',
    !contiene(contG6b, 'Descartar cambios') && contiene(contG6b, 'value="5"') &&
    vistaG1._doc.getElementById('inv-modal-operacion').classList.contains('hidden') === false);
  vistaG1.invCerrarOperacion(); // aviso otra vez
  vistaG1.invOpDescartar();
  check('G6c', 'operación: "Descartar" cierra tras la confirmación',
    vistaG1._doc.getElementById('inv-modal-operacion').classList.contains('hidden') === true);

  // G7: operación EN CURSO → no se cierra ni se envía dos veces.
  let resolverG7 = null;
  const cliG7 = clienteInv5({
    entrada: function () { return new Promise(function (res) { resolverG7 = res; }); }
  });
  const vistaG7 = cargarVista(cliG7, cargarServicio(cliG7), { operativo: true });
  vistaG7.invAbrirOperacion('entrada', 'prod-101', 'ub-1', 'EN BODEGA');
  vistaG7._doc.getElementById('inv-op-cantidad').value = '4';
  vistaG7.invOpPasoConfirmar(); // → paso confirmar (validación local OK)
  const enviosG7 = function () {
    return cliG7._llamadas.rpc.filter(function (l) { return l.nombre === 'inventario_registrar_entrada'; }).length;
  };
  const antesG7 = enviosG7();
  const promG7 = vistaG7.invOpEnviar(); // inicia el envío (queda a la espera)
  await flush(4);
  check('G7a', 'operación en curso: el cierre NO cierra el modal y se emitió UNA sola RPC',
    enviosG7() === antesG7 + 1 &&
    vistaG7._doc.getElementById('inv-modal-operacion').classList.contains('hidden') === false);
  vistaG7.invCerrarOperacion(); // intento de cierre durante el vuelo
  vistaG7.invOpEnviar();        // doble envío
  await flush(4);
  check('G7b', 'operación en curso: sin doble envío y el cierre sigue bloqueado',
    enviosG7() === antesG7 + 1 &&
    vistaG7._doc.getElementById('inv-modal-operacion').classList.contains('hidden') === false);
  if (typeof resolverG7 === 'function') {
    resolverG7({ data: null, error: { message: 'fallo simulado' } });
    await promG7;
  }
  check('G7c', 'con el envío detenido (error) no hay cierre falso: el modal queda abierto',
    vistaG7._doc.getElementById('inv-modal-operacion').classList.contains('hidden') === false);
  vistaG7.invCerrarOperacionForzado(); // limpieza

  // G8/G10: autocompletado (Escape y selección) + presentación.
  const cliG8 = clienteSug();
  const vistaG8 = cargarVista(cliG8, cargarServicio(cliG8), { operativo: true });
  vistaG8.invAbrirModalNuevo();
  vistaG8.invSugOnInput('clav');
  await flush();
  const contG8 = vistaG8._doc.getElementById('inv-sug-container');
  const sugVisibleG8 = !contG8.classList.contains('hidden') && contiene(contG8.innerHTML, 'Clavo');
  const htmlFormG8 = vistaG8._doc.getElementById('inv-nuevo-contenido').innerHTML;
  check('G10', 'desplegable: scroll interno (max-h+overflow) y contenido dentro del modal (pantallas pequeñas)',
    sugVisibleG8 && contiene(htmlFormG8, 'max-h-64 overflow-y-auto') &&
    contiene(htmlFormG8, 'hidden relative mt-1') && noContiene(htmlFormG8, 'absolute left-0 right-0 top-full') &&
    contiene(vistaG8._doc.getElementById('inv-modal-nuevo').innerHTML, 'max-h-[92vh] overflow-y-auto'));
  escapeDoc(vistaG8);
  check('G8a', 'Escape con sugerencias abiertas → cierra SOLO el desplegable; el formulario sigue abierto',
    contG8.classList.contains('hidden') === true &&
    vistaG8._doc.getElementById('inv-modal-nuevo').classList.contains('hidden') === false);

  vistaG8.invAbrirModalNuevo();
  vistaG8._doc.getElementById('inv-nuevo-nombre').value = 'clav';
  vistaG8.invSugOnInput('clav');
  await flush();
  vistaG8.invSugSeleccionar('sug-001'); // "Clavo 2 pulgadas" (existente)
  const contG8b = vistaG8._doc.getElementById('inv-nuevo-contenido').innerHTML;
  check('G8b', 'seleccionar una sugerencia NO cierra el formulario (ofrece ver la ficha existente)',
    vistaG8._doc.getElementById('inv-modal-nuevo').classList.contains('hidden') === false &&
    contiene(contG8b, 'Producto existente') && contiene(contG8b, 'Clavo 2 pulgadas'));

  // Matriz de los cuatro formularios: todos los caminos de cierre y guardado.
  const clientesMatriz = [];
  for (const tipo of ['nuevo', 'linea_base', 'entrada', 'salida']) {
    let resolver;
    const handler = function () { return new Promise(function (r) { resolver = r; }); };
    const clave = { nuevo: 'crear', linea_base: 'lineaBase', entrada: 'entrada', salida: 'salida' }[tipo];
    const cliente = clienteInv5({ [clave]: handler });
    clientesMatriz.push(cliente);
    const v = cargarVista(cliente, cargarServicio(cliente), { operativo: true });
    const nuevo = tipo === 'nuevo';
    const overlayId = nuevo ? 'inv-modal-nuevo' : 'inv-modal-operacion';
    const contenidoId = nuevo ? 'inv-nuevo-contenido' : 'inv-op-contenido';
    const cerrar = nuevo ? v.invCerrarModalNuevo : v.invCerrarOperacion;
    const seguir = nuevo ? v.invNuevoSeguirEditando : v.invOpSeguirEditando;
    const descartar = nuevo ? v.invNuevoDescartar : v.invOpDescartar;
    const enviar = nuevo ? v.invNuevoEnviar : v.invOpEnviar;
    if (nuevo) v.invAbrirModalNuevo();
    else v.invAbrirOperacion(tipo, 'prod-101', 'ub-1', 'EN BODEGA');
    const campos = nuevo
      ? { 'inv-nuevo-nombre': 'Producto de prueba & revisión', 'inv-nuevo-unidad': 'Caja' }
      : { 'inv-op-cantidad': '4', 'inv-op-responsable': 'Responsable & revisión', ...(tipo === 'linea_base' ? { 'inv-op-unidad': 'Caja' } : {}) };
    Object.entries(campos).forEach(function ([id, valor]) { v._doc.getElementById(id).value = valor; });
    const abierto = function () { return !v._doc.getElementById(overlayId).classList.contains('hidden'); };
    const conservados = function () { return Object.entries(campos).every(function ([id, valor]) { return v._doc.getElementById(id).value === valor; }); };
    const ov = v._doc.getElementById(overlayId);
    ov._dispatch('mousedown', { target: v._doc.getElementById(contenidoId) });
    ov._dispatch('mouseup', { target: ov });
    clicFuera(v, overlayId);
    check('GM-' + tipo + '-fuera', tipo + ': clic y selección soltada fuera conservan el formulario', abierto() && conservados());
    const html = v._doc.getElementById(contenidoId).innerHTML;
    const funcion = nuevo ? 'invCerrarModalNuevo' : 'invCerrarOperacion';
    check('GM-' + tipo + '-botones', tipo + ': X y Cancelar usan el cierre protegido',
      cuenta(html, 'onclick="' + funcion + '()"') === 2 && contiene(html, 'Cancelar'));
    for (const accion of ['X', 'Cancelar', 'Escape']) {
      if (accion === 'Escape') {
        escapeDoc(v);
        check('GM-' + tipo + '-Escape', tipo + ': Escape conserva sin aviso', abierto() && conservados() && noContiene(v._doc.getElementById(contenidoId).innerHTML, 'Descartar cambios'));
        escapeDoc(v);
        check('GM-' + tipo + '-Escape-datos', tipo + ': Escape repetido conserva todos los campos', abierto() && conservados());
        continue;
      }
      cerrar();
      check('GM-' + tipo + '-' + accion, tipo + ': ' + accion + ' solicita confirmación',
        abierto() && contiene(v._doc.getElementById(contenidoId).innerHTML, 'Descartar cambios'));
      if (accion === 'Escape') escapeDoc(v); else seguir();
      check('GM-' + tipo + '-' + accion + '-datos', tipo + ': seguir editando conserva todos los campos',
        abierto() && conservados() && noContiene(v._doc.getElementById(contenidoId).innerHTML, 'Descartar cambios'));
    }
    if (nuevo) v.invNuevoPasoConfirmar(); else v.invOpPasoConfirmar();
    const promesa = enviar();
    await flush(4);
    check('GM-' + tipo + '-guardando', tipo + ': muestra Guardando y deshabilita X',
      contiene(v._doc.getElementById(contenidoId).innerHTML, 'Guardando…') &&
      contiene(v._doc.getElementById(contenidoId).innerHTML, 'onclick="' + funcion + '()" disabled'));
    cerrar(); escapeDoc(v); descartar(); clicFuera(v, overlayId); enviar();
    await flush(4);
    check('GM-' + tipo + '-bloqueo', tipo + ': cierre y doble envío bloqueados durante guardado',
      abierto() && cliente._llamadas.rpc.filter(function (l) { return /^inventario_(crear_producto|confirmar_linea_base|registrar_entrada|registrar_salida)$/.test(l.nombre); }).length === 1);
    if (resolver) resolver({ data: null, error: { message: 'fallo simulado de guardado' } });
    await promesa;
    check('GM-' + tipo + '-error', tipo + ': error mantiene abierto y permite recuperar los campos', abierto());
    if (nuevo) v.invNuevoVolver(); else v.invOpVolver();
    check('GM-' + tipo + '-recuperar', tipo + ': conserva todos los campos tras error y volver', conservados());
    cerrar(); descartar();
    check('GM-' + tipo + '-descartar', tipo + ': descarte explícito cierra', !abierto());
  }

  // G11: cero escrituras directas en todos los escenarios INV-5.3
  const clientesG = [cliG1, cliG7, cliG8].concat(clientesMatriz);
  const escriturasG = clientesG.reduce(function (acc, c) { return acc.concat(c._escrituras); }, []);
  check('G11', 'INV-5.3: cero escrituras directas en todos los escenarios (solo RPC de la lista blanca)',
    escriturasG.length === 0, JSON.stringify(escriturasG));

  // ===== H) INV-6.1: fixtures exclusivamente en memoria para el harness =====
  const archivosH = ['EN BODEGA.xlsx', 'INSUMOS -NUEVA BODEGA OESTE.xlsx'];
  const listaH = Array.from({ length: 29 }, function (_, i) {
    return { id: 'lista-' + i, nombre_original: 'Bodega ' + i, numero_original: i + 1,
      nemotecnico_original: 'B-' + i, ubicacion_original: i % 2 ? 'Hotel' : 'Centro de Eventos',
      fecha_inventario: null, responsable_texto: i % 2 ? 'Persona A' : null,
      hoja_origen: 'Hoja1', fila_origen: i + 2, celda_origen: 'C' + (i + 2),
      observaciones: 'Nota de migración', importacion: { archivo_origen: 'LISTA DE BODEGAS.xlsx' } };
  });
  const movimientosH = function (archivo, total) {
    return Array.from({ length: total }, function (_, i) {
      return { id: archivo + '-' + String(i).padStart(4, '0'), archivo_origen: archivo,
        producto_original: i === 0 ? '<script>producto</script>' : 'Material repetido',
        ubicacion_id: archivo === archivosH[0] ? 'ub-1' : 'ub-2',
        material_id: 'material-' + i, cantidad_original: i === 0 ? null : '2 cajas',
        cantidad: i === 0 ? null : 2, costo_unitario: i === 0 ? null : '12.50',
        costo_total: i === 0 ? null : (i === 1 ? 0 : '25.00'), fecha: null,
        hoja_origen: i % 2 ? 'Hoja2' : 'Hoja1', fila_origen: i + 2,
        proveedor_original: 'Proveedor', observaciones: null };
    });
  };
  const datosH = { [archivosH[0]]: movimientosH(archivosH[0], 174), [archivosH[1]]: movimientosH(archivosH[1], 10) };
  const consultasH = [];
  let fallarH = false;
  const cliH = crearClienteStub({
    historicos: function (q) {
      consultasH.push({ archivo: q._filtros.archivo_origen, rango: q._range, select: q._select, orden: q._order });
      if (fallarH) return { data: null, error: { message: 'Lectura histórica denegada' } };
      return { data: datosH[q._filtros.archivo_origen].slice(q._range[0], q._range[1] + 1), error: null };
    },
    ubicaciones: function () { return { data: [{ id: 'ub-1', nombre: 'EN BODEGA', tipo: 'BODEGA' }, { id: 'ub-2', nombre: 'BODEGA OESTE', tipo: 'BODEGA' }], error: null }; }
  });
  let lecturasListaH = 0;
  const svcH = cargarServicio(cliH, { getInventarios: async function (force) {
    lecturasListaH++;
    return listaH.concat([{ id: 'ajeno', importacion: { archivo_origen: 'OTRO.xlsx' } }]);
  } });
  const vH = cargarVista(cliH, svcH, { operativo: true, permanente: true });
  const htmlInicialH = vH.renderInventarioView();
  await flush();
  const estadoCatalogoH = JSON.stringify(vH.invEstado);
  check('H-default', 'catálogo predeterminado y navegación secundaria',
    contiene(htmlInicialH, 'id="inv-seccion-historico" class="hidden"') && contiene(htmlInicialH, 'Histórico y trazabilidad'));
  await vH.invCambiarSeccion('historico');
  archivosH.forEach(function (archivo, i) {
    check('H-conteo-' + i, 'fuente filtrada y conteo consultado: ' + archivo,
      vH.invHistEstados[archivo].filas.length === [174, 10][i]);
  });
  const tarjetasH = vH._doc.getElementById('inv-seccion-historico').innerHTML;
  check('H-tarjetas', 'tarjetas con conteos derivados y sin Jardinería',
    contiene(tarjetasH, '174 registros históricos') && noContiene(tarjetasH, 'LISTA DE BODEGAS.xlsx') && cuenta(tarjetasH, 'onclick="invHistAbrirFuente(') === 2 && contiene(tarjetasH, '10 registros históricos') && noContiene(tarjetasH, 'JARDINERIA'));
  check('H-consultas', 'movimientos con filtro literal, PK estable y columnas verificadas de trazabilidad',
    consultasH.length === 2 && consultasH.every(function (q) {
      return archivosH.includes(q.archivo) && q.orden.col === 'id' && q.rango[0] === 0 && contiene(q.select, 'hoja_origen, fila_origen');
    }));
  for (let fuente = 0; fuente < 2; fuente++) {
    vH.invHistAbrirFuente(fuente);
    const est = vH.invHistEstados[archivosH[fuente]];
    check('H-fuente-' + fuente, 'abrir fuente muestra su listado', contiene(vH._doc.getElementById('inv-seccion-historico').innerHTML, archivosH[fuente]));
    const html = vH.invHistListadoHTML(est);
    check('H-tarjeta-simple-' + fuente, 'listado sin hoja/fila y con cantidades y costos históricos',
      noContiene(html, 'Hoja:') && noContiene(html, 'Fila:') &&
      contiene(html, 'Cantidad histórica: 2 cajas') && contiene(html, 'Costo unitario histórico: 12.50') &&
      contiene(html, 'Ver información histórica') && noContiene(html, '$'));
    const tarjetaNullH = html.split('</button>')[0];
    check('H-tarjeta-null-' + fuente, 'sin cantidad/costo no inventa valores en tarjeta y escapa producto',
      noContiene(tarjetaNullH, 'Cantidad histórica:') && noContiene(tarjetaNullH, 'Costo unitario histórico:') &&
      contiene(tarjetaNullH, '&lt;script&gt;producto&lt;/script&gt;'));
    check('H-pagina-' + fuente, 'página inicial limitada a 12 filas', cuenta(html, 'onclick="invHistDetalle(') === Math.min(12, est.filas.length));
    vH.invHistPagina(1);
    check('H-avance-' + fuente, 'paginación limitada según fuente', est.pagina === (fuente === 1 ? 1 : 2));
    vH.invHistFiltrarCampo('texto', 'Material repetido');
    check('H-buscar-' + fuente, 'búsqueda pertinente reinicia página', est.pagina === 1 && vH.invHistFiltrar(est).length === (est.filas.length - 1));
    vH.invHistFiltrarCampo('texto', '');
    vH.invHistFiltrarCampo('hoja', 'Hoja1');
    check('H-hoja-' + fuente, 'filtro por hoja real', vH.invHistFiltrar(est).every(function (r) { return r.hoja_origen === 'Hoja1'; }));
    vH.invHistFiltrarCampo('hoja', '');
    vH.invHistFiltrarCampo('ubicacion', fuente === 0 ? 'EN BODEGA' : 'BODEGA OESTE');
    check('H-ubicacion-' + fuente, 'ubicación original o vínculo por ID real', vH.invHistFiltrar(est).length > 0);

    vH.invHistPagina(1);
    const antes = JSON.stringify(est);
    vH.invHistDetalle(0);
    const detalle = vH._doc.getElementById('inv-modal-historico').innerHTML;
    check('H-traza-' + fuente, 'ficha conserva archivo, hoja, fila y NULL',
      contiene(detalle, archivosH[fuente]) && contiene(detalle, 'Hoja1') && contiene(detalle, 'Fila de origen') && contiene(detalle, 'Sin dato registrado'));
    if (fuente >= 0) {
      check('H-costo-null-' + fuente, 'costos NULL sin moneda ni stock calculado y HTML escapado',
        contiene(detalle, 'COSTO HISTÓRICO') && contiene(detalle, '&lt;script&gt;') && noContiene(detalle, '<script>') && noContiene(detalle, '$'));
      vH.invHistDetalle(1);
      const detalleConCosto = vH._doc.getElementById('inv-modal-historico').innerHTML;
      check('H-costo-valor-' + fuente, 'costo histórico conserva valores y cero real', contiene(detalleConCosto, '12.50') && contiene(detalleConCosto, '>0</dd>'));
      check('H-detalle-completo-' + fuente, 'ficha conserva campos históricos y procedencia',
        ['Archivo', 'Hoja', 'Fila de origen', 'Cantidad original', 'Cantidad numérica histórica',
          'COSTO HISTÓRICO · Unitario', 'COSTO HISTÓRICO · Total', 'Proveedor original', 'Observaciones',
          'Sección original', 'Categoría original', 'Valor auxiliar de la fuente'].every(function (campo) {
            return contiene(detalleConCosto, campo);
          }));
    }
    vH._doc._dispatch('keydown', { key: 'Escape' });
    check('H-escape-' + fuente, 'Escape conserva ficha histórica', !vH._doc.getElementById('inv-modal-historico').classList.contains('hidden'));
    vH.invHistVolver(); vH.invHistAbrirFuente(fuente);
    check('H-conservar-' + fuente, 'volver conserva búsqueda, filtros y página', JSON.stringify(est) === antes);
  }
  check('H-no-agregar', 'productos repetidos conservan filas separadas, sin agregación',
    vH.invHistEstados[archivosH[0]].filas.length === 174 && new Set(vH.invHistEstados[archivosH[0]].filas.map(function (r) { return r.id; })).size === 174);
  vH.invCambiarSeccion('catalogo');
  check('H-operativo', 'navegación histórica conserva todo el estado operativo', JSON.stringify(vH.invEstado) === estadoCatalogoH && !vH._doc.getElementById('inv-seccion-catalogo').classList.contains('hidden'));
  // Datos de estrés, solo para verificar los rangos de lectura, no persistidos.
  datosH[archivosH[1]] = movimientosH(archivosH[1], 1003);
  const paginadoH = await svcH.obtenerHistorico(archivosH[1]);
  check('H-rangos', 'lectura progresiva mayor a 1000 sin truncar ni duplicar', paginadoH.length === 1003 && new Set(paginadoH.map(function (r) { return r.id; })).size === 1003 && consultasH.slice(-3).map(function (q) { return q.rango[0]; }).join(',') === '0,500,1000');
  let rechazoFuenteH = false;
  try { await svcH.obtenerHistorico('INSUMOS JARDINERIA.xlsx'); } catch (e) { rechazoFuenteH = true; }
  check('H-whitelist', 'rechaza fuentes fuera del alcance sin consultarlas', rechazoFuenteH);
  fallarH = true;
  await vH.invCambiarSeccion('historico');
  vH.invHistVolver();
  const errorH = vH._doc.getElementById('inv-seccion-historico').innerHTML;
  check('H-error', 'error de lectura no se presenta como cero filas ni conserva conteo obsoleto',
    contiene(errorH, 'Lectura histórica denegada') && noContiene(errorH, '174 registros históricos'));
  for (const perfil of [
    { role: 'ADMINISTRADOR', operativo: true, permanente: true, esperado: true },
    { role: 'SOLICITANTE', operativo: true, esperado: true }, // temporal vigente, helper efectivo
    { role: 'TECNICO', esperado: true },
    { role: 'SOLICITANTE', esperado: false },
    { role: 'SIN_ROL', esperado: false },
    { role: 'TECNICO', acceso: false, esperado: false }
  ]) {
    let llamadas = 0;
    const servicio = { ARCHIVOS_HISTORICOS: archivosH, obtenerHistorico: async function () { llamadas++; return []; }, getBodegas: async function () { return []; } };
    const vista = cargarVista(cliH, servicio, perfil);
    check('H-permiso-' + JSON.stringify(perfil), 'navegación aplica matriz y permisos efectivos', vista.invHistPuedeConsultar() === perfil.esperado);
    await vista.invCambiarSeccion('historico');
    check('H-acceso-' + JSON.stringify(perfil), 'rol sin acceso no dispara lecturas históricas', llamadas === (perfil.esperado ? 2 : 0));
  }
  check('H-solo-lectura', 'históricos usan exclusivamente SELECT y servicio existente, sin RPC de escritura',
    cliH._escrituras.length === 0 && cliH._llamadas.rpc.every(function (l) { return svcH.RPC_LECTURA_PERMITIDAS.includes(l.nombre); }));
  for (const caso of [
    { cantidad_original: null, cantidad: 0, costo_unitario: 0, cantidadEsperada: '0', costo: true },
    { cantidad_original: '', cantidad: '3.5', costo_unitario: null, cantidadEsperada: '3.5', costo: false },
    { cantidad_original: 'varios', cantidad: 5, costo_unitario: '7.00', cantidadEsperada: 'varios', costo: true },
    { cantidad_original: ' ', cantidad: null, costo_unitario: '', cantidadEsperada: null, costo: false }
  ]) {
    const html = vH.invHistListadoHTML({ texto: '', ubicacion: '', responsable: '', hoja: '', pagina: 1,
      filas: [{ producto_original: 'Producto', ...caso }] });
    check('H-tarjeta-valores-' + JSON.stringify(caso), 'tarjeta respeta dato original, fallback numérico, cero y ausencias',
      (caso.cantidadEsperada === null ? noContiene(html, 'Cantidad histórica:') : contiene(html, 'Cantidad histórica: ' + caso.cantidadEsperada + '</span>')) &&
      contiene(html, 'Costo unitario histórico:') === caso.costo);
  }


  const consultasListaH = [];
  const winListaH = { supabaseClient: { from(tabla) {
    const consulta = { tabla, select: '', orden: [] };
    consultasListaH.push(consulta);
    const q = {
      select(campos) { consulta.select = campos; return q; },
      order(campo) { consulta.orden.push(campo); return q; },
      then(resolver, rechazar) { return Promise.resolve({ data: listaH, error: null }).then(resolver, rechazar); }
    };
    return q;
  } } };
  const mantencionesH = new Function('window', leerArchivo('js/services/mantenciones.service.js') + '\n;return window.MantencionesService;')(winListaH);
  const originalesH = await mantencionesH.getInventarios(true);
  check('H-lista-original', 'Mantenciones conserva la lectura original de los 29 registros y su trazabilidad',
    originalesH.length === 29 && originalesH[0].importacion.archivo_origen === 'LISTA DE BODEGAS.xlsx' &&
    consultasListaH[0].tabla === 'inventarios_elementos' && contiene(consultasListaH[0].select, 'hoja_origen, fila_origen, celda_origen') &&
    consultasListaH[0].orden.join(',') === 'ubicacion_original,fila_origen');
  check('H-lista-vista-original', 'Mantenciones mantiene su panel y ficha originales',
    contiene(leerArchivo('js/views/mantenciones.js'), 'function mntPanelInventarioHTML(') &&
    contiene(leerArchivo('js/views/mantenciones.js'), 'function mntFichaInventarioHTML('));
  const antesRechazoH = consultasH.length;
  let rechazoListaH = false;
  try { await svcH.obtenerHistorico('LISTA DE BODEGAS.xlsx'); } catch (e) { rechazoListaH = true; }
  check('H-lista-retirada', 'Inventario no consulta ni permite abrir LISTA DE BODEGAS',
    rechazoListaH && lecturasListaH === 0 && consultasH.length === antesRechazoH &&
    svcH.ARCHIVOS_HISTORICOS.join('|') === archivosH.join('|') &&
    noContiene(leerArchivo('js/services/inventario.service.js'), 'getInventarios('));
  // ===== C) REGISTRO ESTÁTICO ==============================
  const htmlIndex = leerArchivo('index.html');
  const srcApp = leerArchivo('js/app.js');
  const srcState = leerArchivo('js/state.js');
  const srcSvc = leerArchivo('js/services/inventario.service.js');
  const srcVista = leerArchivo('js/views/inventario.js');

  check('C1a', 'index.html: botón nav-inventario en el sidebar',
    contiene(htmlIndex, 'id="nav-inventario"') && contiene(htmlIndex, "navigateTo('inventario')"));
  check('C1b', 'index.html: scripts del servicio y la vista incluidos',
    contiene(htmlIndex, './js/services/inventario.service.js') && contiene(htmlIndex, './js/views/inventario.js'));
  check('C2a', 'app.js: case inventario renderiza renderInventarioView()',
    contiene(srcApp, "case 'inventario':") && contiene(srcApp, 'renderInventarioView()'));
  check('C2b', 'app.js: inventario admitido en el whitelist de hash inicial',
    (function () {
      const m = srcApp.match(/if \(initialHash && \[[^\]]+\]\.includes\(initialHash\)\)/);
      return m ? contiene(m[0], "'inventario'") : false;
    })());

  const bloqueAdmin = (srcState.match(/id: "ADMINISTRADOR"[\s\S]*?permissions: \[[^\]]*\]/) || [''])[0];
  const bloqueTecnico = (srcState.match(/id: "TECNICO"[\s\S]*?permissions: \[[^\]]*\]/) || [''])[0];
  const bloqueSolicitante = (srcState.match(/id: "SOLICITANTE"[\s\S]*?permissions: \[[^\]]*\]/) || [''])[0];
  const bloqueModulos = (srcState.match(/window\.SYSTEM_MODULES_CONFIG = \[[\s\S]*?\n\];/) || [''])[0];
  const bloqueTechEff = (srcState.match(/user\.role === 'TECNICO'[\s\S]*?modules: \[[^\]]*\]/) || [''])[0];

  check('C3a', 'state.js: ADMINISTRADOR incluye inventario', contiene(bloqueAdmin, "'inventario'"));
  check('C3b', 'state.js: TECNICO incluye inventario (solo consulta)',
    contiene(bloqueTecnico, "'inventario'") && contiene(bloqueTecnico, "'inventario',\n      'areas'"));
  check('C3c', 'state.js: SOLICITANTE NO incluye inventario (denegado por defecto)',
    bloqueSolicitante !== '' && noContiene(bloqueSolicitante, "'inventario'"));
  check('C3d', 'state.js: SYSTEM_MODULES_CONFIG registra el módulo inventario',
    contiene(bloqueModulos, "id: 'inventario'"));
  check('C3e', 'state.js: getUserEffectivePermissions(TECNICO) incluye inventario',
    contiene(bloqueTechEff, "'inventario'"));

  check('C4a', 'servicio: sin escrituras directas ni localStorage (código, sin comentarios)',
    noContiene(sinComentarios(srcSvc), '.insert(') && noContiene(sinComentarios(srcSvc), '.update(') &&
    noContiene(sinComentarios(srcSvc), '.upsert(') && noContiene(sinComentarios(srcSvc), '.delete(') &&
    noContiene(sinComentarios(srcSvc), 'localStorage'));
  check('C4b', 'vista: sin escrituras directas ni localStorage (código, sin comentarios)',
    noContiene(sinComentarios(srcVista), '.insert(') && noContiene(sinComentarios(srcVista), '.update(') &&
    noContiene(sinComentarios(srcVista), '.upsert(') && noContiene(sinComentarios(srcVista), '.delete(') &&
    noContiene(sinComentarios(srcVista), 'localStorage'));
  // INV-6 autoriza lectura histórica aislada. Las funciones operativas
  // continúan consultando exclusivamente sus RPC y ubicaciones.
  check('C5', 'INV-6: acceso histórico aislado de las funciones operativas',
    noContiene(srcSvc.split('// INV-6: lecturas históricas')[0], "from('movimientos_inventario')") &&
    noContiene(srcSvc + srcVista, "from('inventarios_elementos')") &&
    noContiene(srcSvc + srcVista, "from('materiales')"));

  // Selector de unidad: pruebas de contrato y conservación, solo en memoria.
  const cliUnidad=clienteInv5(),vUnidad=cargarVista(cliUnidad,cargarServicio(cliUnidad),{operativo:true});
  vUnidad.invEstado.productos=[{producto_id:'prod-101',nombre:'Producto de ensayo en memoria',unidad_medida:'Unidad'}];
  await vUnidad.invAbrirFicha('prod-101');vUnidad.invAbrirOperacion('linea_base','prod-101','ub-2','BODEGA OESTE');
  let hu=vUnidad._doc.getElementById('inv-op-contenido').innerHTML;
  check('U1','selector agrupado con todas las categorías y valores',hu.includes('<select id="inv-op-unidad"')&&(hu.match(/<optgroup /g)||[]).length===6&&['Docena','Pallet','Milímetro','Metro cuadrado','Metro cúbico','Tonelada'].every(x=>hu.includes(x)));
  check('U2','unidad existente seleccionada sin reemplazar',vUnidad._doc.getElementById('inv-op-unidad').value==='Unidad');
  vUnidad._doc.getElementById('inv-op-cantidad').value='0';vUnidad._doc.getElementById('inv-op-responsable').value='Responsable original';vUnidad._doc.getElementById('inv-op-unidad').value='Caja';vUnidad.invOpCambiarUnidad();
  check('U3','cambio conserva conteo cero y responsable',vUnidad._doc.getElementById('inv-op-cantidad').value==='0'&&vUnidad._doc.getElementById('inv-op-responsable').value==='Responsable original');
  vUnidad.invOpPasoConfirmar();await vUnidad.invOpEnviar();
  const pu=cliUnidad._llamadas.rpc.filter(x=>x.nombre==='inventario_confirmar_linea_base').at(-1).args;
  check('U4','opción Caja viaja como texto sin conversión de cantidad',pu.p_unidad_medida==='Caja'&&pu.p_cantidad_contada===0&&pu.p_responsable_texto==='Responsable original');
  vUnidad.invAbrirOperacion('linea_base','prod-101','ub-2','BODEGA OESTE');vUnidad._doc.getElementById('inv-op-cantidad').value='2';vUnidad._doc.getElementById('inv-op-unidad').value='__otra__';vUnidad.invOpCambiarUnidad();
  hu=vUnidad._doc.getElementById('inv-op-contenido').innerHTML;
  check('U5','otra unidad muestra campo personalizado obligatorio',hu.includes('Especifique la unidad')&&hu.includes('value="__otra__" selected')&&/id="inv-op-unidad-personalizada"[^>]*required/.test(hu));
  vUnidad._doc.getElementById('inv-op-unidad-personalizada').value='   ';vUnidad.invOpPasoConfirmar();
  check('U6','personalizada vacía rechazada sin RPC',vUnidad._doc.getElementById('inv-op-contenido').innerHTML.includes('Debe indicar la unidad de medida.')&&cliUnidad._llamadas.rpc.filter(x=>x.nombre==='inventario_confirmar_linea_base').length===1);
  vUnidad._doc.getElementById('inv-op-unidad-personalizada').value='kg por envase';vUnidad.invOpPasoConfirmar();vUnidad.invOpVolver();
  check('U7','revisión y regreso conservan personalizada y modo',vUnidad._doc.getElementById('inv-op-unidad').value==='__otra__'&&vUnidad._doc.getElementById('inv-op-unidad-personalizada').value==='kg por envase');
  vUnidad.invCerrarOperacion();vUnidad.invOpSeguirEditando();
  check('U8','cancelar descarte conserva personalizada',vUnidad._doc.getElementById('inv-op-unidad-personalizada').value==='kg por envase');
  vUnidad.invOpPasoConfirmar();await vUnidad.invOpEnviar();
  const personalizada=cliUnidad._llamadas.rpc.filter(x=>x.nombre==='inventario_confirmar_linea_base').at(-1).args;
  check('U9','personalizada se envía como texto original sin marcador interno',personalizada.p_unidad_medida==='kg por envase'&&personalizada.p_cantidad_contada===2);
  vUnidad.invEstado.productos=[{producto_id:'prod-101',nombre:'Producto original',unidad_medida:'m² antiguo & especial'}];await vUnidad.invAbrirFicha('prod-101');vUnidad.invAbrirOperacion('linea_base','prod-101','ub-2','BODEGA OESTE');
  check('U10','unidad antigua fuera de lista visible sin normalización',vUnidad._doc.getElementById('inv-op-unidad').value==='__otra__'&&vUnidad._doc.getElementById('inv-op-unidad-personalizada').value==='m² antiguo & especial');
  vUnidad.invCerrarOperacion();
  check('U11','unidad antigua intacta no exige descartar cambios',vUnidad._doc.getElementById('inv-modal-operacion').classList.contains('hidden'));
  vUnidad.invAbrirOperacion('entrada','prod-101','ub-1','EN BODEGA');
  check('U12','Entrada conserva unidad de producto sin selector editable',!vUnidad._doc.getElementById('inv-op-contenido').innerHTML.includes('<select id="inv-op-unidad"'));

  // --- Reporte ------------------------------------------------------------
  let fallos = 0;
  console.log('\n======== HARNESS INV-4 / INV-5 / INV-5.1 — FRONTEND DE INVENTARIO ========');
  resultados.forEach(function (r) {
    if (!r.ok) fallos++;
    console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.letra} — ${r.nombre}${r.ok ? '' : '  → ' + r.detalle}`);
  });
  console.log('---------------------------------------------------------');
  console.log(`${resultados.length - fallos}/${resultados.length} PASS`);
  console.log(`Escrituras detectadas: ${[cliA, cliA8, cliA9, cliB, cliB7, cliB8, cliB11, cliB14, cliB16, cliB17, cliH].concat(clientesInv5).concat(clientesInv51).concat(clientesF).concat(clientesG).reduce(function (a, c) { return a + c._escrituras.length; }, 0)}`);
  console.log('=====================================================================\n');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(function (e) { console.error('ERROR EN HARNESS:', e); process.exit(2); });
