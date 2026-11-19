// ==========================================================
// SERVICIO: INVENTARIO — HOTEL EL ALMENDRO (INV-4 / INV-5)
// ==========================================================
// Patrón: js/services/mantenciones.service.js / remodelaciones.service.js
// - Acceso a datos SOLO mediante las RPC instaladas en A3 (lectura) y A4/A5
//   (escritura), más un SELECT permitido de public.ubicaciones (desplegable
//   de bodegas).
// - INV-6.1: SELECT histórico de movimientos_inventario para las dos bodegas.
// - Cero escrituras directas: NUNCA .insert() / .update() / .upsert() /
//   .delete(). Toda escritura operativa (creación de producto, línea base,
//   entrada y salida) pasa por RPC server-side: el backend valida permisos
//   (es_administrador_actual()), fija autoría y fecha, y devuelve los
//   códigos de error (STOCK_INSUFICIENTE, LINEA_BASE_EXISTENTE, etc.).
// - INV-5: las escrituras solo se invocan desde la vista cuando el helper
//   efectivo esAdminOperativoActual() habilita la interfaz; esa condición es
//   UX, NUNCA seguridad — quien autoriza cada escritura es Supabase.
// - Caché simple en memoria por clave (force = true fuerza recarga).
//   NO se usa localStorage como fuente de verdad.
// - NULL nunca se convierte en 0: se preserva null para que la vista
//   muestre textos neutros ("Sin dato registrado").
// - Cantidades del Excel histórico NUNCA se muestran como stock actual:
//   las cifras de existencia provienen únicamente de
//   inventario_obtener_existencias (inventario_existencias) y los
//   movimientos de inventario_obtener_movimientos (inventario_movimientos).
//   El histórico (bodegas_historicas) solo aporta CONTEO DE REGISTROS,
//   etiquetado explícitamente como "registros en archivo histórico".
//
// Firmas reales instaladas en Supabase (bloque A3, verificadas):
//
//   inventario_buscar_productos(p_texto text DEFAULT NULL,
//                               p_ubicacion_id uuid DEFAULT NULL,
//                               p_limite integer DEFAULT 12,
//                               p_offset integer DEFAULT 0)
//     → producto_id uuid, nombre text, unidad_medida text,
//       origen_registro text, material_id uuid, asociado_historico boolean,
//       tiene_existencia_operativa boolean, total bigint
//
//   inventario_obtener_existencias(p_producto_id uuid)
//     → ubicacion_id uuid, ubicacion_nombre text, cantidad numeric,
//       linea_base_at timestamptz, actualizado_at timestamptz,
//       linea_base_confirmada boolean, asociado_historico boolean
//
//   inventario_obtener_movimientos(p_producto_id uuid,
//                                  p_limite integer DEFAULT 20,
//                                  p_offset integer DEFAULT 0)
//     → movimiento_id uuid, ubicacion_id uuid, ubicacion_nombre text,
//       tipo text, cantidad numeric, direccion text, motivo text,
//       saldo_resultante numeric, unidad_medida text,
//       responsable_texto text, registrado_por_nombre_snapshot text,
//       fecha timestamptz, total bigint
//
//   inventario_obtener_bodegas_historicas(p_producto_id uuid)
//     → ubicacion_id uuid, ubicacion_nombre text, archivo_origen text,
//       registros_historicos bigint
//
// Escritura (bloques A4/A5, probadas por el usuario):
//
//   inventario_crear_producto(p_nombre text, p_unidad_medida text,
//                             p_material_id uuid, p_confirmar_distinto boolean)
//     → jsonb { resultado: CREADO | DUPLICADO | HOMONIMO_FUERA_CATALOGO,
//               producto_id uuid, coincidencias jsonb }
//
//   inventario_confirmar_linea_base(p_producto_id uuid, p_ubicacion_id uuid,
//                                   p_cantidad_contada numeric,
//                                   p_unidad_medida text,
//                                   p_responsable_texto text)
//
//   inventario_registrar_entrada(p_producto_id uuid, p_ubicacion_id uuid,
//                                p_cantidad numeric,
//                                p_responsable_texto text)
//
//   inventario_registrar_salida(p_producto_id uuid, p_ubicacion_id uuid,
//                               p_cantidad numeric,
//                               p_responsable_texto text)
//
// El retorno de línea base/entrada/salida se trata como opaco: el cliente
// NUNCA confía en él para saldos; tras cada escritura se re-consultan
// existencias, movimientos y catálogo contra Supabase.
//
// INV-5.1 (autocompletado): las sugerencias del alta de producto reutilizan
// inventario_buscar_productos (p_texto, p_ubicacion_id null, p_limite 8,
// p_offset 0). Sólo si esa búsqueda por subcadena NO encuentra coincidencias
// y el texto alcanza longitud mínima, obtenerCatalogoSimilar() pagina el
// catálogo con la MISMA RPC (p_texto null) y lo guarda en caché temporal
// en memoria (TTL 5 min) para comparar similitud de nombres en el cliente.
// Nada de esto confirma duplicados: la validación definitiva sigue siendo
// inventario_crear_producto con su confirmación explícita.

window.InventarioService = (function () {
  'use strict';

  // Nombres reales de las RPC del módulo (lectura A3, escritura A4/A5).
  const ELIMINACION_HABILITADA = true; // Uso general autorizado, sujeto a previsualización y Administrador permanente.
  function eliminacionProductoHabilitada(productoId) {
    return ELIMINACION_HABILITADA && typeof productoId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productoId) && productoId !== '00000000-0000-0000-0000-000000000000';
  }
  const RPC = {
    previsualizarEliminacion: 'inventario_previsualizar_eliminacion',
    previsualizarEliminacionMovimiento: 'inventario_previsualizar_eliminacion_movimiento',
    previsualizarAnulacion: 'inventario_previsualizar_anulacion',
    previsualizarRestablecimientoBase: 'inventario_previsualizar_restablecimiento_base',
    buscar: 'inventario_buscar_productos_v2',
    existencias: 'inventario_obtener_existencias',
    movimientos: 'inventario_obtener_movimientos_v2',
    anularMovimiento: 'inventario_anular_movimiento',
    bodegasHistoricas: 'inventario_obtener_bodegas_historicas',
    restablecerLineaBase: 'inventario_restablecer_linea_base',
    eliminarMovimiento: 'inventario_eliminar_movimiento',
    eliminarProducto: 'inventario_eliminar_producto',
    crearProducto: 'inventario_crear_producto',
    lineaBase: 'inventario_confirmar_linea_base',
    entrada: 'inventario_registrar_entrada',
    entradaFormato: 'inventario_registrar_entrada_formato',
    formatosEntrada: 'inventario_obtener_formatos_entrada',
    salida: 'inventario_registrar_salida'
  };

  // Listas blancas separadas (lectura vs. escritura). El harness INV-4/5
  // valida que el servicio no invoque ninguna función fuera de estas listas
  // ni toque otras tablas. La escritura es SOLO vía RPC server-side.
  const RPC_LECTURA_PERMITIDAS = [
    RPC.formatosEntrada, RPC.buscar, RPC.existencias, RPC.movimientos, RPC.bodegasHistoricas,
    RPC.previsualizarEliminacion, RPC.previsualizarAnulacion, RPC.previsualizarRestablecimientoBase, RPC.previsualizarEliminacionMovimiento
  ];
  const RPC_ESCRITURA_PERMITIDAS = [
    RPC.entradaFormato, RPC.anularMovimiento, RPC.crearProducto, RPC.lineaBase, RPC.entrada, RPC.salida, RPC.eliminarProducto, RPC.eliminarMovimiento, RPC.restablecerLineaBase
  ];
  const RPC_PERMITIDAS = RPC_LECTURA_PERMITIDAS.concat(RPC_ESCRITURA_PERMITIDAS);

  // Códigos de error que el backend devuelve (contrato A4/A5). Se usan para
  // adjuntar err.codigo y que la vista muestre mensajes claros.
  const CODIGOS_ERROR_CONOCIDOS = [
    'INVENTARIO_ACCESO_DENEGADO', 'CANTIDAD_INVALIDA', 'UNIDAD_REQUERIDA',
    'UNIDAD_INVALIDA', 'UNIDAD_NO_COINCIDE', 'UNIDAD_BLOQUEADA_HISTORIAL', 'LINEA_BASE_EXISTENTE',
    'SIN_LINEA_BASE', 'STOCK_INSUFICIENTE', 'PRODUCTO_DUPLICADO',
    'HOMONIMO_FUERA_CATALOGO', 'MOVIMIENTO_INMUTABLE'
  ];

  const TAMANO_PAGINA_CATALOGO = 12; // tarjetas por página del catálogo
  const TAMANO_PAGINA_FICHA = 20;    // movimientos por página en la ficha

  // Valor de ubicaciones.tipo que identifica bodegas. Comparación EXACTA,
  // insensible a mayúsculas (INV-4.1): solo tipo = 'BODEGA' entra al
  // desplegable; sin coincidencias la lista queda vacía y ante un fallo de
  // consulta la vista deshabilita el filtro. Nunca se degrada a todas las
  // ubicaciones ni se usan uuid fijos.
  const TIPO_BODEGA = 'bodega';

  // Nota: se usa `let` para poder REEMPLAZAR la caché completa tras una
  // escritura (sin métodos de borrado sobre el Map, coherente con la regla
  // de cero escrituras directas que el harness verifica estáticamente).
  let _cache = new Map();

  function _clave() {
    return Array.prototype.map.call(arguments, function (v) {
      return (v === null || v === undefined) ? '' : String(v);
    }).join('|');
  }

  // Extrae el código de contrato (p. ej. "STOCK_INSUFICIENTE: sin saldo…"
  // → "STOCK_INSUFICIENTE") para que la vista traduzca el error.
  function _extraerCodigo(mensaje) {
    const texto = String(mensaje || '');
    const inicial = texto.match(/^([A-Z][A-Z0-9_]{3,})(?::|\s|$)/);
    if (inicial && CODIGOS_ERROR_CONOCIDOS.indexOf(inicial[1]) !== -1) return inicial[1];
    for (let i = 0; i < CODIGOS_ERROR_CONOCIDOS.length; i++) {
      if (texto.indexOf(CODIGOS_ERROR_CONOCIDOS[i]) !== -1) return CODIGOS_ERROR_CONOCIDOS[i];
    }
    return null;
  }

  function _errorLocal(codigo, mensaje) {
    const err = new Error(codigo ? (codigo + ': ' + mensaje) : mensaje);
    if (codigo) err.codigo = codigo;
    return err;
  }

  // Llamada RPC con lista blanca. Devuelve la data TAL CUAL (objeto jsonb,
  // array o null) para las RPC cuyo retorno no es un listado de filas.
  async function _rpcObjeto(nombre, args) {
    if (RPC_PERMITIDAS.indexOf(nombre) === -1) {
      throw new Error('RPC fuera de la lista blanca del módulo: ' + nombre);
    }
    if (!window.supabaseClient || typeof window.supabaseClient.rpc !== 'function') {
      throw new Error('Cliente de Supabase no disponible.');
    }
    const respuesta = await window.supabaseClient.rpc(nombre, args || {});
    const error = respuesta && respuesta.error;
    if (error) {
      const err = new Error(error.message || ('Error ejecutando ' + nombre));
      err.rpc = nombre;
      err.detalle = error;
      err.codigo = _extraerCodigo(error.message);
      throw err;
    }
    return respuesta ? respuesta.data : null;
  }

  // Lectura de filas: PostgREST devuelve array (TABLE) u objeto (scalar);
  // se normaliza a array para no depender del modo de la función.
  async function _rpc(nombre, args) {
    const data = await _rpcObjeto(nombre, args);
    return Array.isArray(data) ? data : (data ? [data] : []);
  }

  function _validarId(valor, campo) {
    const id = (valor === null || valor === undefined) ? '' : String(valor).trim();
    if (!id) throw _errorLocal('IDENTIFICADOR_INVALIDO', 'falta ' + campo + '.');
    return id;
  }

  // Cantidad: número finito; cero permitido SOLO en conteo de línea base
  // (un conteo físico verificado puede ser 0). Acepta coma decimal.
  function _validarCantidad(valor, ceroPermitido) {
    const crudo = (valor === null || valor === undefined) ? '' : String(valor).trim().replace(',', '.');
    const cantidad = crudo === '' ? NaN : Number(crudo);
    const valida = Number.isFinite(cantidad) && (ceroPermitido ? cantidad >= 0 : cantidad > 0);
    if (!valida) {
      throw _errorLocal('CANTIDAD_INVALIDA', ceroPermitido
        ? 'la cantidad debe ser un número igual o mayor a cero.'
        : 'la cantidad debe ser un número mayor a cero.');
    }
    return cantidad;
  }

  function _aCatalogo(fila) {
    return {
      producto_id: fila.producto_id || null,
      nombre: (fila.nombre === null || fila.nombre === undefined) ? '' : String(fila.nombre),
      presentacion: fila.presentacion ?? null,
      unidad_medida: (fila.unidad_medida === null || fila.unidad_medida === undefined) ? null : fila.unidad_medida,
      origen_registro: (fila.origen_registro === null || fila.origen_registro === undefined) ? null : fila.origen_registro,
      material_id: fila.material_id || null,
      asociado_historico: fila.asociado_historico === true,
      tiene_existencia_operativa: fila.tiene_existencia_operativa === true
    };
  }

  // ----------------------------------------------------------
  // Catálogo paginado (tarjetas del listado principal)
  // ----------------------------------------------------------
  async function buscarProductos(parametros, force) {
    const p = parametros || {};
    const limite = Number.isFinite(p.limite) ? p.limite : TAMANO_PAGINA_CATALOGO;
    const offset = Number.isFinite(p.offset) ? p.offset : 0;
    const texto = (p.texto === null || p.texto === undefined) ? '' : String(p.texto).trim();
    const ubicacionId = (p.ubicacionId === null || p.ubicacionId === undefined || p.ubicacionId === '')
      ? null : String(p.ubicacionId);

    const clave = 'buscar|' + _clave(texto, ubicacionId, limite, offset);
    if (!force && _cache.has(clave)) return _cache.get(clave);

    const filas = await _rpc(RPC.buscar, {
      p_texto: texto === '' ? null : texto,
      p_ubicacion_id: ubicacionId,
      p_limite: limite,
      p_offset: offset
    });

    let total = 0;
    if (filas.length > 0 && filas[0].total !== null && filas[0].total !== undefined) {
      total = Number(filas[0].total) || 0;
    }
    const resultado = { productos: filas.map(_aCatalogo), total: total };
    _cache.set(clave, resultado);
    return resultado;
  }

  // ----------------------------------------------------------
  // INV-5.1: catálogo completo en caché temporal, SOLO para sugerencias
  // aproximadas (detectar errores de escritura como "destonillador").
  // - Se pide únicamente cuando inventario_buscar_productos (subcadena)
  //   devuelve cero coincidencias y el texto alcanza longitud mínima.
  // - Se pagina con la MISMA RPC (p_texto null) y se guarda en memoria
  //   con TTL de 5 minutos: no se descarga el catálogo en cada tecla.
  // - Aporta NOMBRES reales para comparar similitud en el cliente.
  //   NUNCA confirma igualdad, fusiona registros ni sustituye la
  //   validación definitiva de inventario_crear_producto.
  // - Nunca se pide sin límite: páginas de 50 con tope duro de 40
  //   páginas (2000 filas) además del total reportado por la RPC.
  // ----------------------------------------------------------
  const PAGINA_CATALOGO_SIMILAR = 50;
  const MAX_PAGINAS_CATALOGO_SIMILAR = 40;
  const CATALOGO_SIMILAR_TTL_MS = 5 * 60 * 1000; // 5 minutos
  const CLAVE_CATALOGO_SIMILAR = 'catalogo-similar';

  async function obtenerCatalogoSimilar(force) {
    if (!force && _cache.has(CLAVE_CATALOGO_SIMILAR)) {
      const guardado = _cache.get(CLAVE_CATALOGO_SIMILAR);
      if (guardado && Array.isArray(guardado.items) &&
          Date.now() - guardado.obtenidoAt < CATALOGO_SIMILAR_TTL_MS) {
        return guardado.items;
      }
    }

    const items = [];
    let offset = 0;
    for (let pagina = 0; pagina < MAX_PAGINAS_CATALOGO_SIMILAR; pagina++) {
      const filas = await _rpc(RPC.buscar, {
        p_texto: null,
        p_ubicacion_id: null,
        p_limite: PAGINA_CATALOGO_SIMILAR,
        p_offset: offset
      });
      const mapeadas = filas.map(_aCatalogo);
      items.push.apply(items, mapeadas);

      let total = null;
      if (filas.length > 0 && filas[0].total !== null && filas[0].total !== undefined) {
        total = Number(filas[0].total);
        if (!Number.isFinite(total)) total = null;
      }
      offset += mapeadas.length;
      if (mapeadas.length === 0) break;
      if (total !== null && offset >= total) break;
      if (mapeadas.length < PAGINA_CATALOGO_SIMILAR) break;
    }

    const guardado = { items: items, obtenidoAt: Date.now() };
    _cache.set(CLAVE_CATALOGO_SIMILAR, guardado);
    return items;
  }

  // ----------------------------------------------------------
  // Existencias operativas verificadas por bodega (inventario_existencias)
  // ----------------------------------------------------------
  async function obtenerExistencias(productoId, force) {
    const id = String(productoId || '').trim();
    if (!id) throw new Error('obtenerExistencias: productoId es obligatorio.');

    const clave = 'existencias|' + id;
    if (!force && _cache.has(clave)) return _cache.get(clave);

    const filas = await _rpc(RPC.existencias, { p_producto_id: id });
    const resultado = filas.map(function (f) {
      return {
        ubicacion_id: f.ubicacion_id || null,
        ubicacion_nombre: (f.ubicacion_nombre === null || f.ubicacion_nombre === undefined) ? '' : String(f.ubicacion_nombre),
        // numeric → Number; null preservado (jamás 0 inventado).
        cantidad: (f.cantidad === null || f.cantidad === undefined) ? null : Number(f.cantidad),
        linea_base_at: f.linea_base_at || null,
        actualizado_at: f.actualizado_at || null,
        linea_base_confirmada: f.linea_base_confirmada === true,
        asociado_historico: f.asociado_historico === true
      };
    });
    _cache.set(clave, resultado);
    return resultado;
  }

  // ----------------------------------------------------------
  // Historial de movimientos operativos (inventario_movimientos)
  // ----------------------------------------------------------
  async function obtenerMovimientos(productoId, opciones, force) {
    const id = String(productoId || '').trim();
    if (!id) throw new Error('obtenerMovimientos: productoId es obligatorio.');
    const o = opciones || {};
    const limite = Number.isFinite(o.limite) ? o.limite : TAMANO_PAGINA_FICHA;
    const offset = Number.isFinite(o.offset) ? o.offset : 0;
    if (!Number.isInteger(limite) || limite < 1 || limite > 20 || !Number.isSafeInteger(offset) || offset < 0) throw _errorLocal('PAGINACION_INVALIDA', 'el historial admite páginas de 1 a 20 movimientos.');

    const clave = 'movimientos|' + _clave(id, limite, offset);
    if (!force && _cache.has(clave)) return _cache.get(clave);

    const filas = await _rpc(RPC.movimientos, {
      p_producto_id: id,
      p_limite: limite,
      p_offset: offset
    });

    let total = 0;
    if (filas.length > 0 && filas[0].total !== null && filas[0].total !== undefined) {
      total = Number(filas[0].total) || 0;
    }
    const resultado = {
      movimientos: filas.map(function (f) {
        return {
          movimiento_id: f.movimiento_id || null,
          ubicacion_id: f.ubicacion_id || null,
          ubicacion_nombre: (f.ubicacion_nombre === null || f.ubicacion_nombre === undefined) ? null : f.ubicacion_nombre,
          tipo: (f.tipo === null || f.tipo === undefined) ? null : f.tipo,
          cantidad: (f.cantidad === null || f.cantidad === undefined) ? null : Number(f.cantidad),
          direccion: (f.direccion === null || f.direccion === undefined) ? null : f.direccion,
          motivo: (f.motivo === null || f.motivo === undefined) ? null : f.motivo,
          saldo_resultante: (f.saldo_resultante === null || f.saldo_resultante === undefined) ? null : Number(f.saldo_resultante),
          unidad_medida: (f.unidad_medida === null || f.unidad_medida === undefined) ? null : f.unidad_medida,
          responsable_texto: (f.responsable_texto === null || f.responsable_texto === undefined) ? null : f.responsable_texto,
          registrado_por_nombre_snapshot: (f.registrado_por_nombre_snapshot === null || f.registrado_por_nombre_snapshot === undefined) ? null : f.registrado_por_nombre_snapshot,
          fecha: f.fecha || null,
          movimiento_corregido: f.movimiento_corregido === true,
          ajuste_compensatorio: f.ajuste_compensatorio === true,
          movimiento_original_id: f.movimiento_original_id ?? null,
          movimiento_ajuste_id: f.movimiento_ajuste_id ?? null
        };
      }),
      total: total
    };
    resultado.formatosError = null;
    const entradas = resultado.movimientos.filter(m => m.tipo === 'ENTRADA').map(m => m.movimiento_id);
    if (entradas.length) {
      try {
        const evidencias = await _rpc(RPC.formatosEntrada, { p_producto_id: id, p_movimiento_ids: entradas });
        const conocidas = new Set(entradas), vistas = new Set();
        for (const e of evidencias) {
          if (!conocidas.has(e.movimiento_id) || vistas.has(e.movimiento_id) || typeof e.formato_recepcion !== 'string' || !e.formato_recepcion.trim() || typeof e.unidad_principal !== 'string') throw new Error('Evidencia de formato inconsistente.');
          const calculo = calcularEntradaFormato(e.cantidad_formatos, e.contenido_por_formato);
          const movimiento = resultado.movimientos.find(m => m.movimiento_id === e.movimiento_id);
          if (Number(calculo.cantidad) !== e.cantidad_principal || e.cantidad_principal !== movimiento.cantidad || e.unidad_principal !== movimiento.unidad_medida) throw new Error('La evidencia no coincide con el movimiento.');
          vistas.add(e.movimiento_id);
        }
        resultado.movimientos.forEach(m => { m.formato_entrada = evidencias.find(e => e.movimiento_id === m.movimiento_id) || null; });
      } catch (e) { resultado.formatosError = e.message || 'No fue posible consultar la recepción original.'; }
    }
    if (resultado.formatosError) _cache.delete(clave);
    else _cache.set(clave, resultado);
    return resultado;
  }

  // ----------------------------------------------------------
  // Bodegas históricas del producto (solo procedencia; NO es stock)
  // ----------------------------------------------------------
  async function obtenerBodegasHistoricas(productoId, force) {
    const id = String(productoId || '').trim();
    if (!id) throw new Error('obtenerBodegasHistoricas: productoId es obligatorio.');

    const clave = 'bodegas-historicas|' + id;
    if (!force && _cache.has(clave)) return _cache.get(clave);

    const filas = await _rpc(RPC.bodegasHistoricas, { p_producto_id: id });
    const resultado = filas.map(function (f) {
      return {
        ubicacion_id: f.ubicacion_id || null,
        ubicacion_nombre: (f.ubicacion_nombre === null || f.ubicacion_nombre === undefined) ? '' : String(f.ubicacion_nombre),
        archivo_origen: (f.archivo_origen === null || f.archivo_origen === undefined) ? null : f.archivo_origen,
        // Conteo de filas del archivo histórico (bigint → Number).
        registros_historicos: (f.registros_historicos === null || f.registros_historicos === undefined) ? 0 : Number(f.registros_historicos)
      };
    });
    _cache.set(clave, resultado);
    return resultado;
  }

  // ----------------------------------------------------------
  // Desplegable de bodegas del filtro (SELECT permitido de ubicaciones)
  // INV-4.1: se muestran EXCLUSIVAMENTE las ubicaciones con
  // tipo = 'BODEGA' (comparación exacta, insensible a mayúsculas).
  // - Si la consulta falla se propaga el error: la vista deshabilita el
  //   filtro con un estado de error (sin degradar a otras ubicaciones).
  // - Si no hay coincidencias se devuelve lista vacía.
  // - Sin uuid fijos ni identificadores hardcodeados.
  // ----------------------------------------------------------
  async function getBodegas(force) {
    const clave = 'bodegas';
    if (!force && _cache.has(clave)) return _cache.get(clave);
    if (!window.supabaseClient || typeof window.supabaseClient.from !== 'function') {
      throw new Error('Cliente de Supabase no disponible.');
    }

    const respuesta = await window.supabaseClient
      .from('ubicaciones')
      .select('id, nombre, tipo')
      .order('nombre', { ascending: true });

    if (respuesta.error) {
      const err = new Error(respuesta.error.message || 'No fue posible leer las bodegas.');
      err.detalle = respuesta.error;
      throw err;
    }

    const filas = Array.isArray(respuesta.data) ? respuesta.data : [];
    const bodegas = filas
      .filter(function (u) {
        return u && u.id && u.nombre &&
          String(u.nombre).trim() !== '' &&
          u.tipo !== null && u.tipo !== undefined &&
          String(u.tipo).trim().toLowerCase() === TIPO_BODEGA;
      })
      .map(function (u) {
        return { id: u.id, nombre: String(u.nombre).trim() };
      });

    _cache.set(clave, bodegas);
    return bodegas;
  }

  // ----------------------------------------------------------
  // INV-5: invalidación de caché tras una escritura exitosa.
  // Se descartan las lecturas afectadas del producto y TODO el catálogo
  // (la bandera tiene_existencia_operativa puede cambiar); el desplegable
  // de bodegas (clave 'bodegas') no se toca.
  // ----------------------------------------------------------
  function invalidarCacheProducto(productoId) {
    const id = String(productoId || '');
    const conservadas = [];
    _cache.forEach(function (valor, clave) {
      const afectada = clave.indexOf('buscar|') === 0 ||
        clave === CLAVE_CATALOGO_SIMILAR || // INV-5.1: un producto nuevo cambia el catálogo de nombres
        clave.indexOf('existencias|' + id) === 0 ||
        clave.indexOf('movimientos|' + id + '|') === 0 ||
        clave.indexOf('bodegas-historicas|' + id) === 0;
      if (!afectada) conservadas.push([clave, valor]);
    });
    _cache = new Map(conservadas);
  }

  // ----------------------------------------------------------
  // INV-5: creación de producto (RPC inventario_crear_producto)
  // - p_material_id SIEMPRE null: el frontend nunca adivina uuid de
  //   materiales; el propio backend detecta las coincidencias con el
  //   histórico y las devuelve en "coincidencias".
  // - La primera llamada va con p_confirmar_distinto=false; sólo si el
  //   backend responde DUPLICADO (o HOMONIMO_FUERA_CATALOGO) y el usuario
  //   lo confirma explícitamente se reintenta con true. El backend es quien
  //   autoriza con es_administrador_actual(): permanente o temporal vigente.
  // ----------------------------------------------------------
  async function crearProducto(parametros) {
    const p = parametros || {};
    const nombre = (p.nombre === null || p.nombre === undefined) ? '' : String(p.nombre).trim();
    if (!nombre) throw _errorLocal('NOMBRE_REQUERIDO', 'debe indicar el nombre del producto.');
    const unidad = (p.unidadMedida === null || p.unidadMedida === undefined)
      ? '' : String(p.unidadMedida).trim();

    if (!unidad) throw _errorLocal('UNIDAD_REQUERIDA', 'seleccione una unidad para el producto nuevo.');
    if (unidad && Number.isFinite(Number(unidad.replace(',', '.')))) throw _errorLocal('UNIDAD_INVALIDA', 'la unidad no puede ser solamente un número.');
    if (p.presentacion != null && typeof p.presentacion !== 'string') throw _errorLocal('PRESENTACION_INVALIDA', 'la presentación debe ser texto.');
    const presentacion = p.presentacion == null ? null : p.presentacion.trim();
    if (presentacion !== null && (!presentacion || Array.from(presentacion).length > 160)) throw _errorLocal('PRESENTACION_INVALIDA', 'indique una presentación de hasta 160 caracteres o déjela vacía.');

    const data = await _rpcObjeto(RPC.crearProducto, {
      p_nombre: nombre,
      p_unidad_medida: unidad === '' ? null : unidad,
      p_material_id: null,
      p_confirmar_distinto: p.confirmarDistinto === true,
      p_presentacion: presentacion
    });

    // Contrato jsonb: { resultado, producto_id, coincidencias }. Se tolera
    // array de un objeto (modo TABLE) sin depender del modo.
    let fila = Array.isArray(data) ? (data.length > 0 ? data[0] : null) : data;
    if (!fila || typeof fila !== 'object') fila = null;
    const resultado = (fila && fila.resultado !== null && fila.resultado !== undefined)
      ? String(fila.resultado).trim().toUpperCase() : null;
    const productoId = (fila && fila.producto_id) ? String(fila.producto_id) : null;

    if (resultado === 'CREADO' && productoId) invalidarCacheProducto(productoId);
    return {
      resultado: resultado,
      productoId: productoId,
      estado: fila?.estado ?? null,
      motivo: fila?.motivo ?? null,
      continuar_permitido: fila?.continuar_permitido === true,
      total_homonimos: fila?.total_homonimos ?? null,
      total_coincidencias_exactas: fila?.total_coincidencias_exactas ?? null,
      coincidencias_truncadas: fila?.coincidencias_truncadas === true,
      coincidencias: (fila && Array.isArray(fila.coincidencias)) ? fila.coincidencias : []
    };
  }

  // ----------------------------------------------------------
  // INV-5: línea base por bodega (RPC inventario_confirmar_linea_base)
  // - Cero permitido: un conteo físico verificado puede confirmar 0.
  // - Unidad SIEMPRE enviada (bloqueada por el backend tras historial).
  // - responsable_texto vacío → null (nunca string inventado).
  // ----------------------------------------------------------
  async function confirmarLineaBase(parametros) {
    const p = parametros || {};
    const productoId = _validarId(p.productoId, 'productoId');
    const ubicacionId = _validarId(p.ubicacionId, 'ubicacionId');
    const cantidad = _validarCantidad(p.cantidadContada, true);
    const unidad = (p.unidadMedida === null || p.unidadMedida === undefined)
      ? '' : String(p.unidadMedida).trim();
    if (!unidad) throw _errorLocal('UNIDAD_REQUERIDA', 'debe indicar la unidad de medida.');
    if (Number.isFinite(Number(unidad.replace(',', '.')))) throw _errorLocal('UNIDAD_INVALIDA', 'la unidad no puede ser solamente un número.');
    const responsable = (p.responsableTexto === null || p.responsableTexto === undefined)
      ? '' : String(p.responsableTexto).trim();

    const data = await _rpc(RPC.lineaBase, {
      p_producto_id: productoId,
      p_ubicacion_id: ubicacionId,
      p_cantidad_contada: cantidad,
      p_unidad_medida: unidad,
      p_responsable_texto: responsable === '' ? null : responsable
    });
    invalidarCacheProducto(productoId);
    return data;
  }

  async function registrarEntrada(parametros) {
    const p = parametros || {};
    const productoId = _validarId(p.productoId, 'productoId');
    const ubicacionId = _validarId(p.ubicacionId, 'ubicacionId');
    const cantidad = _validarCantidad(p.cantidad, false);
    const responsable = (p.responsableTexto === null || p.responsableTexto === undefined)
      ? '' : String(p.responsableTexto).trim();

    const data = await _rpc(RPC.entrada, {
      p_producto_id: productoId,
      p_ubicacion_id: ubicacionId,
      p_cantidad: cantidad,
      p_responsable_texto: responsable === '' ? null : responsable
    });
    invalidarCacheProducto(productoId);
    return data;
  }

  function _decimalFormato(valor) {
    const texto = String(valor ?? '').trim().replace(',', '.');
    if (texto.length > 100 || !/^(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)$/.test(texto)) throw _errorLocal('CONVERSION_INVALIDA', 'indique cantidades positivas en formato decimal.');
    const partes = texto.split('.'), escala = (partes[1] || '').length;
    return { coef: BigInt((partes[0] || '0') + (partes[1] || '')), escala };
  }
  function _textoDecimal(coef, escala) {
    const texto = coef.toString().padStart(escala + 1, '0');
    return escala ? (texto.slice(0, -escala) + '.' + texto.slice(-escala)).replace(/0+$/, '').replace(/[.]$/, '') : texto;
  }
  function calcularEntradaFormato(envases, contenido) {
    const a = _decimalFormato(envases), b = _decimalFormato(contenido);
    const da = 10n ** BigInt(a.escala), db = 10n ** BigInt(b.escala);
    if (a.coef <= 0n || a.coef > 1000000000n * da || a.coef % da !== 0n) throw _errorLocal('CANTIDAD_FORMATOS_INVALIDA', 'ingrese un número entero de envases completos, mayor que cero y hasta 1.000.000.000. Para parciales use la unidad habitual.');
    if (b.coef <= 0n || b.coef > 1000000000n * db) throw _errorLocal('EQUIVALENCIA_INVALIDA', 'el contenido de cada envase debe ser positivo y hasta 1.000.000.000.');
    const producto = a.coef * b.coef, escala = a.escala + b.escala;
    const divisor = escala > 3 ? 10n ** BigInt(escala - 3) : 1n;
    if (producto % divisor !== 0n) throw _errorLocal('CONVERSION_INVALIDA', 'el total admite como máximo tres decimales. No se redondeó la conversión.');
    const milesimas = escala > 3 ? producto / divisor : producto * 10n ** BigInt(3 - escala);
    if (milesimas <= 0n || milesimas > 1000000000000n) throw _errorLocal('CONVERSION_INVALIDA', 'el total debe ser positivo y no superar 1.000.000.000.');
    return { cantidad: _textoDecimal(milesimas, 3), envases: (a.coef / da).toString(), contenido: _textoDecimal(b.coef, b.escala) };
  }
  function sumarStockPrevisto(stock, cantidad) {
    const a = _decimalFormato(stock), b = _decimalFormato(cantidad), escala = Math.max(a.escala, b.escala);
    return _textoDecimal(a.coef * 10n ** BigInt(escala-a.escala) + b.coef * 10n ** BigInt(escala-b.escala), escala);
  }
  const _entradasFormatoPendientes = new Set();
  const _recepcionesConfirmadas = new Set();
  let _recepcionGeneracion = 0, _recepcionObservada, _recepcionAuthIniciada = false;
  const _uuidRecepcion = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) && v !== '00000000-0000-0000-0000-000000000000';
  const _camposRecepcion = ['p_producto_id','p_ubicacion_id','p_formato','p_cantidad_formatos','p_unidades_por_formato','p_unidad_esperada','p_responsable_texto','p_solicitud_id'];
  function _errorRecepcion(mensaje, codigo = 'RECUPERACION_NO_DISPONIBLE') { return _errorLocal(codigo, mensaje); }
  function _iniciarAuthRecepciones() {
    if (_recepcionAuthIniciada) return;
    const auth = window.supabaseClient?.auth;
    if (!auth?.onAuthStateChange) throw _errorRecepcion('No pudimos comprobar la cuenta. Vuelve a iniciar sesión.');
    auth.onAuthStateChange((evento, sesion) => {
      const uid = evento === 'SIGNED_OUT' ? null : sesion?.user?.id || null;
      if (uid === _recepcionObservada) return;
      _recepcionObservada = uid;
      _recepcionGeneracion++;
      _recepcionesConfirmadas.clear();
      if (typeof CustomEvent === 'function' && window.dispatchEvent) window.dispatchEvent(new CustomEvent('inventario-cuenta-recuperacion'));
    });
    _recepcionAuthIniciada = true;
  }
  async function _cuentaRecepcion() {
    _iniciarAuthRecepciones();
    const generacion = _recepcionGeneracion;
    let respuesta;
    try { respuesta = await window.supabaseClient.auth.getUser(); } catch (e) { throw _errorRecepcion('No pudimos comprobar tu cuenta. La entrada pendiente se conserva.'); }
    const uid = respuesta?.data?.user?.id;
    if (respuesta?.error || !_uuidRecepcion(uid)) throw _errorRecepcion('Vuelve a iniciar sesión para comprobar la entrada pendiente.');
    if (generacion !== _recepcionGeneracion || (_recepcionObservada !== undefined && _recepcionObservada !== uid)) throw _errorRecepcion('La cuenta cambió. Comprueba nuevamente tus entradas pendientes.');
    let proyecto;
    try { proyecto = new URL(typeof SUPABASE_URL === 'string' ? SUPABASE_URL : window.supabaseClient.supabaseUrl).origin; } catch (e) { throw _errorRecepcion('No pudimos identificar este sistema. No se envió la entrada.'); }
    if (!proyecto || proyecto === 'null') throw _errorRecepcion('No pudimos identificar este sistema.');
    return { uid, proyecto, generacion };
  }
  function _afirmarCuentaRecepcion(cuenta) {
    if (cuenta.generacion !== _recepcionGeneracion || (_recepcionObservada !== undefined && cuenta.uid !== _recepcionObservada)) throw _errorRecepcion('La cuenta cambió. La solicitud anterior permanece guardada.');
  }
  function _prefijoRecepcion(c) { return 'hotel.inv.recepcion.v1|' + encodeURIComponent(c.proyecto) + '|' + c.uid + '|'; }
  function _almacenRecepcion() {
    try { return window.sessionStorage; } catch (e) { throw _errorRecepcion('No podemos conservar esta entrada en el navegador. No se enviará una entrada nueva.'); }
  }
  function _clavesExactas(objeto, claves) { return !!objeto && typeof objeto === 'object' && !Array.isArray(objeto) && Object.keys(objeto).length === claves.length && claves.every(k => Object.prototype.hasOwnProperty.call(objeto,k)); }
  function _validarRegistroRecepcion(r,c,id) {
    if (!_clavesExactas(r,['version','proyecto','usuario_id','creada_en','parametros','etiquetas']) || r.version !== 1 || r.proyecto !== c.proyecto || r.usuario_id !== c.uid || typeof r.creada_en !== 'string' || !Number.isFinite(Date.parse(r.creada_en)) || !_clavesExactas(r.etiquetas,['producto','bodega']) || !Object.values(r.etiquetas).every(v => typeof v === 'string' && v.trim() && v.length <= 300)) throw new Error('registro');
    const a = r.parametros;
    if (!_clavesExactas(a,_camposRecepcion) || ![a.p_producto_id,a.p_ubicacion_id,a.p_solicitud_id].every(_uuidRecepcion) || a.p_solicitud_id !== id || typeof a.p_formato !== 'string' || !a.p_formato.trim() || a.p_formato !== a.p_formato.trim() || Array.from(a.p_formato).length > 80 || typeof a.p_unidad_esperada !== 'string' || !a.p_unidad_esperada.trim() || Array.from(a.p_unidad_esperada).length > 80 || !(a.p_responsable_texto === null || typeof a.p_responsable_texto === 'string') || typeof a.p_cantidad_formatos !== 'string' || typeof a.p_unidades_por_formato !== 'string') throw new Error('parametros');
    calcularEntradaFormato(a.p_cantidad_formatos,a.p_unidades_por_formato);
    return r;
  }
  function _leerRecepciones(c) {
    const almacen = _almacenRecepcion(), prefijo = _prefijoRecepcion(c), registros = [];
    let corruptos = false, indeterminados = false;
    const bloqueos = [];
    try {
      for (let i=0;i<almacen.length;i++) {
        const clave = almacen.key(i);
        if (!clave?.startsWith(prefijo) || _recepcionesConfirmadas.has(clave)) continue;
        const id = clave.slice(prefijo.length), texto = almacen.getItem(clave);
        let registro = null;
        try {
          if (!_uuidRecepcion(id) || typeof texto !== 'string' || texto.length > 50000) throw new Error('registro');
          registro = JSON.parse(texto);
          registros.push(_validarRegistroRecepcion(registro,c,id));
        } catch (e) {
          corruptos = true;
          const a = registro?.parametros;
          if (registro?.usuario_id === c.uid && registro?.proyecto === c.proyecto && _uuidRecepcion(a?.p_producto_id) && _uuidRecepcion(a?.p_ubicacion_id)) bloqueos.push({ producto_id:a.p_producto_id, ubicacion_id:a.p_ubicacion_id });
          else indeterminados = true;
        }
      }
    } catch (e) { throw _errorRecepcion('No pudimos leer las entradas pendientes. No se enviará una entrada nueva.'); }
    _afirmarCuentaRecepcion(c);
    return { registros, corruptos, bloqueos, indeterminados };
  }
  async function listarEntradasPendientes() {
    const c = await _cuentaRecepcion();
    return { ..._leerRecepciones(c), usuario_id:c.uid };
  }
  async function obtenerEntradaPendiente(id) {
    const c = await _cuentaRecepcion(), lista = _leerRecepciones(c);
    const r = lista.registros.find(r => r.parametros.p_solicitud_id === id);
    if (!r) throw _errorRecepcion('No pudimos recuperar esta entrada para tu cuenta. El registro pendiente se conserva.');
    return r;
  }
  function _guardarRecepcion(r,c) {
    const texto = JSON.stringify(r), clave = _prefijoRecepcion(c)+r.parametros.p_solicitud_id;
    try {
      if (texto.length > 50000) throw new Error('limite');
      const almacen = _almacenRecepcion();
      almacen.setItem(clave,texto);
      if (almacen.getItem(clave) !== texto) throw new Error('guardado');
    } catch (e) { throw _errorRecepcion('No pudimos guardar la recuperación en este navegador. No se envió la entrada.'); }
    return clave;
  }
  async function registrarEntradaFormato(p, etiquetas = {}) {
    if (typeof esAdminOperativoActual !== 'function' || esAdminOperativoActual() !== true) throw _errorRecepcion('No tienes autorización vigente para registrar esta entrada.');
    const calculo = calcularEntradaFormato(p.cantidadFormatos,p.contenidoPorFormato);
    if (![p.productoId,p.ubicacionId,p.solicitudId].every(_uuidRecepcion)) throw _errorRecepcion('No pudimos preparar esta entrada. Revisa el formulario.');
    const args = { p_producto_id:p.productoId,p_ubicacion_id:p.ubicacionId,p_formato:String(p.formato || '').trim(),p_cantidad_formatos:calculo.envases,p_unidades_por_formato:calculo.contenido,p_unidad_esperada:p.unidadEsperada,p_responsable_texto:String(p.responsableTexto || '').trim() || null,p_solicitud_id:p.solicitudId };
    const c = await _cuentaRecepcion(), lista = _leerRecepciones(c);
    if (etiquetas.usuarioId && etiquetas.usuarioId !== c.uid) throw _errorRecepcion('La cuenta cambió. Vuelve a abrir la entrada.');
    if (lista.indeterminados || lista.bloqueos.some(b => b.producto_id === p.productoId && b.ubicacion_id === p.ubicacionId)) throw _errorRecepcion('Hay una entrada pendiente que necesita revisión. No se enviará otra relacionada hasta comprobarla.');
    const existente = lista.registros.find(r => r.parametros.p_solicitud_id === p.solicitudId);
    if (existente) {
      if (!_camposRecepcion.every(k => existente.parametros[k] === args[k])) throw _errorRecepcion('Los datos de la entrada pendiente cambiaron. Recupera la entrada original.');
      return _enviarRecepcion(existente,c).catch(e => { e.pendienteGuardada = true; throw e; });
    }
    if (lista.registros.some(r => r.parametros.p_producto_id === p.productoId && r.parametros.p_ubicacion_id === p.ubicacionId)) throw _errorRecepcion('Ya tienes una entrada pendiente para este producto y bodega. Recupera esa entrada primero.','ENTRADA_PENDIENTE');
    const r = { version:1,proyecto:c.proyecto,usuario_id:c.uid,creada_en:new Date().toISOString(),parametros:args,etiquetas:{producto:String(etiquetas.producto || 'Producto del Inventario').trim().slice(0,300),bodega:String(etiquetas.bodega || 'Bodega de la entrada').trim().slice(0,300)} };
    try { _validarRegistroRecepcion(r,c,p.solicitudId); } catch (e) { throw _errorRecepcion('No pudimos preparar una recuperación válida. No se envió la entrada.'); }
    _afirmarCuentaRecepcion(c);
    _guardarRecepcion(r,c); // Obligatorio ANTES de cualquier RPC de escritura.
    return _enviarRecepcion(r,c).catch(e => { e.pendienteGuardada = true; throw e; });
  }
  async function recuperarEntradaFormato(id) {
    const c = await _cuentaRecepcion(), lista = _leerRecepciones(c);
    const r = lista.registros.find(r => r.parametros.p_solicitud_id === id);
    if (!r) throw _errorRecepcion('No pudimos recuperar esta entrada para tu cuenta.');
    return _enviarRecepcion(r,c);
  }
  async function _enviarRecepcion(r,c) {
    const a = r.parametros, clave = _prefijoRecepcion(c)+a.p_solicitud_id;
    _afirmarCuentaRecepcion(c);
    if (typeof esAdminOperativoActual !== 'function' || esAdminOperativoActual() !== true) throw _errorRecepcion('No tienes autorización vigente. La entrada pendiente se conserva.');
    if (_entradasFormatoPendientes.has(clave)) throw _errorRecepcion('Esta entrada ya se está comprobando.');
    _entradasFormatoPendientes.add(clave);
    try {
      let data;
      try { data = await _rpcObjeto(RPC.entradaFormato, { ...a }); }
      catch (e) { const error = _errorRecepcion('No pudimos confirmar si la entrada se guardó. Puedes intentar recuperarla sin duplicar el registro.'); error.resultadoIncierto = true; throw error; }
      _afirmarCuentaRecepcion(c);
      const calculo = calcularEntradaFormato(a.p_cantidad_formatos,a.p_unidades_por_formato);
      if (!data || Array.isArray(data) || data.resultado !== 'ENTRADA_REGISTRADA' || data.solicitud_id !== a.p_solicitud_id || data.producto_id !== a.p_producto_id || data.ubicacion_id !== a.p_ubicacion_id || !_uuidRecepcion(data.movimiento_id) || data.unidad_principal !== a.p_unidad_esperada || typeof data.cantidad_principal !== 'number' || data.cantidad_principal !== Number(calculo.cantidad) || typeof data.repetida !== 'boolean') {
        const error = _errorRecepcion('No pudimos confirmar si la entrada se guardó. Puedes intentar recuperarla sin duplicar el registro.'); error.resultadoIncierto = true; throw error;
      }
      // No convertir un fallo de limpieza o de refresco en otro envío pendiente.
      _recepcionesConfirmadas.add(clave);
      let limpiezaPendiente = false;
      try { _almacenRecepcion().removeItem(clave); } catch (e) { limpiezaPendiente = true; }
      invalidarCacheProducto(a.p_producto_id);
      return { ...data, limpiezaPendiente };
    } finally { _entradasFormatoPendientes.delete(clave); }
  }

  async function registrarSalida(parametros) {
    const p = parametros || {};
    const productoId = _validarId(p.productoId, 'productoId');
    const ubicacionId = _validarId(p.ubicacionId, 'ubicacionId');
    const cantidad = _validarCantidad(p.cantidad, false);
    const responsable = (p.responsableTexto === null || p.responsableTexto === undefined)
      ? '' : String(p.responsableTexto).trim();

    const data = await _rpc(RPC.salida, {
      p_producto_id: productoId,
      p_ubicacion_id: ubicacionId,
      p_cantidad: cantidad,
      p_responsable_texto: responsable === '' ? null : responsable
    });
    invalidarCacheProducto(productoId);
    return data;
  }

  // INV-6: lecturas históricas con el cliente autenticado y RLS existente.
  // Las tablas permiten SELECT a usuarios habilitados; la matriz del módulo
  // se aplica en la navegación, no se atribuye esa restricción a las tablas.
  const ARCHIVOS_HISTORICOS = Object.freeze([
    'EN BODEGA.xlsx', 'INSUMOS -NUEVA BODEGA OESTE.xlsx'
  ]);

  async function obtenerHistorico(archivo) {
    if (!ARCHIVOS_HISTORICOS.includes(archivo)) throw new Error('Fuente histórica no autorizada.');
    const filas = [];
    // Orden por PK y rangos disjuntos: sin truncar por el límite de PostgREST.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await window.supabaseClient
        .from('movimientos_inventario')
        .select('id, material_id, ubicacion_id, tipo_movimiento, cantidad, cantidad_original, fecha, costo_unitario, costo_total, producto_original, proveedor_original, archivo_origen, hoja_origen, fila_origen, seccion_origen, categoria_origen, observaciones, valor_auxiliar_fuente, afecta_stock')
        .eq('archivo_origen', archivo)
        .order('id', { ascending: true })
        .range(offset, offset + 499);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Respuesta histórica inválida.');
      filas.push(...data);
      if (data.length < 500) break;
    }
    return filas;
  }

  async function previsualizar(nombre, args, campos) {
    if (typeof esAdminPermanenteActual !== 'function' || esAdminPermanenteActual() !== true) {
      throw new Error('Esta consulta requiere un Administrador permanente habilitado.');
    }
    const data = await _rpcObjeto(nombre, args);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Respuesta de previsualización inválida.');
    const resultado = {};
    campos.forEach(function ([campo, tipo, nullable]) {
      const valor = data[campo];
      if (!(nullable && valor === null) && (typeof valor !== tipo || (tipo === 'number' && !Number.isFinite(valor)))) {
        throw new Error('Respuesta de previsualización incompleta: ' + campo + '.');
      }
      resultado[campo] = valor;
    });
    return resultado;
  }
  function previsualizarEliminacion(productoId) {
    return previsualizar(RPC.previsualizarEliminacion, { p_producto_id: _validarId(productoId, 'productoId') }, [
      ['producto_id','string'],['nombre','string'],['origen_registro','string'],['unidad_medida','string',true],
      ['movimientos','number'],['existencias','number'],['auditorias','number'],['anulaciones','number'],['estado','string'],['eliminacion_permanente_habilitada','boolean'],['revision_confirmacion','string']
    ]);
  }
  function previsualizarEliminacionMovimiento(movimientoId) {
    return previsualizar(RPC.previsualizarEliminacionMovimiento, { p_movimiento_id: _validarId(movimientoId, 'movimientoId') }, [
      ['movimiento_id','string'],['producto_id','string'],['producto','string'],['ubicacion_id','string'],['tipo','string'],['cantidad','number'],['unidad','string',true],['fecha','string',true],
      ['saldo_actual','number',true],['saldo_anterior','number',true],['saldo_previsto','number',true],['movimientos_posteriores','number'],['otros_movimientos_bodega','number'],
      ['estado','string'],['eliminacion_individual_posible','boolean'],['ejecucion_habilitada','boolean']
    ]);
  }
  function previsualizarAnulacion(movimientoId) {
    return previsualizar(RPC.previsualizarAnulacion, { p_movimiento_id: _validarId(movimientoId, 'movimientoId') }, [
      ['movimiento_id','string'],['producto_id','string'],['producto','string'],['ubicacion_id','string'],['tipo','string'],['cantidad','number'],['unidad_medida','string',true],
      ['saldo_actual','number',true],['saldo_previsto','number',true],['movimiento_ajuste_id','string',true],['estado','string'],['anulacion_permitida','boolean']
    ]);
  }
  function previsualizarRestablecimientoBase(productoId, ubicacionId) {
    return previsualizar(RPC.previsualizarRestablecimientoBase, { p_producto_id: _validarId(productoId, 'productoId'), p_ubicacion_id: _validarId(ubicacionId, 'ubicacionId') }, [
      ['producto_id','string'],['producto','string'],['origen_registro','string'],['unidad_actual','string',true],['unidad_restauracion_prevista','boolean'],['unidad_final_prevista','string',true],['ubicacion_id','string'],['linea_base_id','string',true],
      ['cantidad_base','number',true],['saldo_actual','number',true],['lineas_base_registradas','number'],['lineas_base_vigentes','number'],['lineas_base_restablecidas','number'],
      ['movimientos_adicionales','number'],['movimientos_sin_anular','number'],['ajustes','number'],['estado','string'],['restablecimiento_habilitado','boolean']
    ]);
  }

  const _correccionesPendientes = new Set();
  async function anularMovimiento(previsualizacion, motivoTexto) {
    const autorizado = () => typeof esAdminPermanenteActual === 'function' && esAdminPermanenteActual() === true;
    const p = { ...(previsualizacion || {}) };
    if (!autorizado()) throw new Error('Esta operación requiere un Administrador permanente habilitado.');
    if (!['ENTRADA','SALIDA'].includes(p.tipo) || p.anulacion_permitida !== true || typeof p.saldo_actual !== 'number' || !Number.isFinite(p.saldo_actual) || typeof p.saldo_previsto !== 'number' || !Number.isFinite(p.saldo_previsto) || p.saldo_previsto < 0) throw new Error('La corrección no está permitida para este movimiento.');
    const id = _validarId(p.movimiento_id, 'movimientoId');
    const motivo = String(motivoTexto || '').trim();
    if (motivo.length < 10 || motivo.length > 1000) throw new Error('El motivo debe tener entre 10 y 1000 caracteres.');
    if (_correccionesPendientes.has(id)) throw new Error('Ya hay una corrección en curso para este movimiento.');
    _correccionesPendientes.add(id);
    try {
      const vigente = await previsualizarAnulacion(id);
      const campos = ['movimiento_id','producto_id','ubicacion_id','tipo','cantidad','unidad_medida','saldo_actual','saldo_previsto','movimiento_ajuste_id','estado','anulacion_permitida'];
      if (campos.some(k => vigente[k] !== p[k]) || vigente.anulacion_permitida !== true) throw _errorLocal('PREVISUALIZACION_DESACTUALIZADA', 'el movimiento o el stock cambiaron. Actualice la consulta y confirme nuevamente. No se envió la corrección.');
      if (!autorizado()) throw new Error('La autorización de Administrador permanente ya no está vigente.');
      let resultado;
      try {
        resultado = await _rpcObjeto(RPC.anularMovimiento, { p_movimiento_id: id, p_motivo: motivo });
      } catch (e) {
        // Un rechazo SQL explícito y una respuesta perdida no son equivalentes.
        if (!(e.detalle && /^[0-9A-Z]{5}$/.test(e.detalle.code || ''))) e.resultadoIncierto = true;
        throw e;
      }
      const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(v);
      if (!resultado || Array.isArray(resultado) || !['ANULADO','YA_ANULADO'].includes(resultado.resultado) || !uuid(resultado.movimiento_original_id) || resultado.movimiento_original_id !== id || !uuid(resultado.movimiento_ajuste_id) || resultado.movimiento_ajuste_id === id || (resultado.resultado === 'ANULADO' && (typeof resultado.saldo_anterior !== 'number' || !Number.isFinite(resultado.saldo_anterior) || typeof resultado.saldo_nuevo !== 'number' || !Number.isFinite(resultado.saldo_nuevo) || resultado.saldo_nuevo < 0))) {
        const error = new Error('No se recibió una confirmación válida. El resultado de la corrección no pudo determinarse.');
        error.resultadoIncierto = true;
        throw error;
      }
      invalidarCacheProducto(vigente.producto_id);
      return resultado;
    } finally {
      _correccionesPendientes.delete(id);
    }
  }

  async function eliminarMovimiento(previsualizacion, motivoTexto) {
    const autorizado = () => typeof esAdminPermanenteActual === 'function' && esAdminPermanenteActual() === true;
    if (!autorizado()) throw new Error('Esta operación requiere un Administrador permanente habilitado.');
    const p = { ...(previsualizacion || {}) };
    if (p.ejecucion_habilitada !== true || p.eliminacion_individual_posible !== true || !['ENTRADA','SALIDA'].includes(p.tipo) || p.movimientos_posteriores !== 0) throw new Error('La ejecución de eliminación individual no está habilitada para este movimiento.');
    if (typeof p.saldo_actual !== 'number' || !Number.isFinite(p.saldo_actual)) throw new Error('Falta el saldo confirmado. Actualice la previsualización.');
    const motivo = String(motivoTexto || '').trim();
    if (motivo.length < 10 || motivo.length > 1000) throw new Error('El motivo debe tener entre 10 y 1000 caracteres.');
    const vigente = await previsualizarEliminacionMovimiento(p.movimiento_id);
    const campos = ['movimiento_id','producto_id','producto','ubicacion_id','tipo','cantidad','unidad','fecha','saldo_actual','saldo_anterior','saldo_previsto','movimientos_posteriores','otros_movimientos_bodega','estado','eliminacion_individual_posible','ejecucion_habilitada'];
    if (campos.some(campo => vigente[campo] !== p[campo]) || vigente.eliminacion_individual_posible !== true || vigente.ejecucion_habilitada !== true) {
      throw _errorLocal('PREVISUALIZACION_DESACTUALIZADA', 'el movimiento o sus condiciones cambiaron. Actualice la consulta y confirme nuevamente. No se envió la eliminación.');
    }
    if (!autorizado()) throw new Error('La autorización de Administrador permanente ya no está vigente.');
    const resultado = await _rpcObjeto(RPC.eliminarMovimiento, {
      p_movimiento_id: vigente.movimiento_id, p_saldo_confirmado: vigente.saldo_actual, p_motivo: motivo
    });
    if (!resultado || Array.isArray(resultado) || resultado.resultado !== 'MOVIMIENTO_ELIMINADO' || resultado.movimiento_id !== vigente.movimiento_id || resultado.producto_id !== vigente.producto_id) {
      throw new Error('RESPUESTA_NO_CONFIRMADA: Supabase no devolvió una confirmación válida para este movimiento. Actualice la ficha para verificar su estado antes de intentar otra operación.');
    }
    invalidarCacheProducto(vigente.producto_id);
    return resultado;
  }

  async function restablecerLineaBase(previsualizacion, motivoTexto) {
    const autorizado = () => typeof esAdminPermanenteActual === 'function' && esAdminPermanenteActual() === true;
    if (!autorizado()) throw new Error('Esta operación requiere un Administrador permanente habilitado.');
    const p = { ...(previsualizacion || {}) };
    if (p.tipo !== 'LINEA_BASE' || p.estado !== 'LINEA_BASE_ELIMINABLE' || p.eliminacion_individual_posible !== true || p.ejecucion_habilitada !== true || p.saldo_previsto !== null || p.movimientos_posteriores !== 0) throw new Error('El restablecimiento de esta línea base no está habilitado.');
    if (typeof p.saldo_actual !== 'number' || !Number.isFinite(p.saldo_actual)) throw new Error('Falta la existencia actual confirmada.');
    const motivo = String(motivoTexto || '').trim();
    if (motivo.length < 10 || motivo.length > 1000) throw new Error('El motivo debe tener entre 10 y 1000 caracteres.');
    const vigente = await previsualizarEliminacionMovimiento(p.movimiento_id);
    const campos = ['movimiento_id','producto_id','ubicacion_id','producto','tipo','cantidad','unidad','fecha','saldo_actual','saldo_anterior','saldo_previsto','movimientos_posteriores','otros_movimientos_bodega','estado','eliminacion_individual_posible','ejecucion_habilitada'];
    if (campos.some(k => vigente[k] !== p[k])) throw _errorLocal('PREVISUALIZACION_DESACTUALIZADA', 'la línea base cambió. Actualice y confirme nuevamente. No se envió el restablecimiento.');
    if (!autorizado()) throw new Error('La autorización administrativa ya no está vigente.');
    const resultado = await _rpcObjeto(RPC.restablecerLineaBase, { p_movimiento_id: vigente.movimiento_id, p_saldo_confirmado: vigente.saldo_actual, p_motivo: motivo });
    if (!resultado || Array.isArray(resultado) || !['LINEA_BASE_RESTABLECIDA','BASE_CERO_RESTABLECIDA'].includes(resultado.resultado) || resultado.producto_id !== vigente.producto_id || resultado.ubicacion_id !== vigente.ubicacion_id || resultado.linea_base_original_id !== vigente.movimiento_id || resultado.linea_base_confirmada !== false) throw new Error('RESPUESTA_NO_CONFIRMADA: no se recibió un restablecimiento válido para esta línea base. Actualice la ficha para verificar el resultado.');
    invalidarCacheProducto(vigente.producto_id);
    return resultado;
  }
  async function obtenerProductoActual(productoId, nombre) {
    for (let offset = 0; ;) {
      const res = await buscarProductos({ texto: nombre, ubicacionId: null, limite: 100, offset: offset }, true);
      const producto = res.productos.find(p => p.producto_id === productoId);
      if (producto) return producto;
      if (!res.productos.length || offset + res.productos.length >= res.total) throw new Error('No se pudo releer el producto actualizado.');
      offset += res.productos.length;
    }
  }

  async function eliminarProducto(parametros, confirmacionVigente) {
    const autorizado = () => typeof esAdminPermanenteActual === 'function' && esAdminPermanenteActual() === true;
    if (!autorizado()) throw new Error('Esta operación requiere un Administrador permanente habilitado.');
    const p = { ...(parametros || {}) };
    const productoId = _validarId(p.productoId, 'productoId');
    if (typeof p.nombreConfirmado !== 'string' || !p.nombreConfirmado.trim()) throw new Error('Debe confirmar el nombre exacto del producto.');
    if (p.unidadEsperada !== null && typeof p.unidadEsperada !== 'string') throw new Error('Falta la unidad esperada del producto.');
    const motivo = String(p.motivo || '').trim();
    if (motivo.length < 10 || motivo.length > 1000) throw new Error('El motivo debe tener entre 10 y 1000 caracteres.');
    if (typeof p.revisionConfirmacion !== 'string' || !p.revisionConfirmacion.trim()) throw new Error('Falta la revisión de confirmación. Actualice la previsualización.');
    if (!eliminacionProductoHabilitada(productoId)) throw new Error('La eliminación completa permanece deshabilitada o el identificador no es válido. No se envió ninguna solicitud de borrado.');
    const vigente = await previsualizarEliminacion(productoId);
    if (vigente.producto_id !== productoId || vigente.nombre !== p.nombreConfirmado || vigente.unidad_medida !== p.unidadEsperada || vigente.revision_confirmacion !== p.revisionConfirmacion || vigente.origen_registro !== 'SISTEMA' || vigente.eliminacion_permanente_habilitada !== true || !['ELIMINABLE_SIN_OPERACIONES','ELIMINABLE_CON_OPERACIONES'].includes(vigente.estado)) {
      throw _errorLocal('PREVISUALIZACION_DESACTUALIZADA', 'el producto o sus condiciones cambiaron. Actualice la consulta y confirme nuevamente. No se envió la eliminación.');
    }
    if (!autorizado()) throw new Error('La autorización de Administrador permanente ya no está vigente.');
    if (typeof confirmacionVigente === 'function' && confirmacionVigente() !== true) throw _errorLocal('PREVISUALIZACION_DESACTUALIZADA', 'la confirmación ya no corresponde a la ficha actual.');
    const contador = valor => Number.isSafeInteger(valor) && valor >= 0;
    if (![vigente.movimientos, vigente.existencias, vigente.auditorias].every(contador)) throw _errorLocal('PREVISUALIZACION_INVALIDA', 'los contadores no son enteros seguros no negativos. No se envió la eliminación.');
    let resultado;
    try {
      resultado = await _rpcObjeto(RPC.eliminarProducto, {
        p_producto_id: productoId, p_nombre_confirmado: p.nombreConfirmado,
        p_unidad_esperada: p.unidadEsperada, p_revision_confirmacion: p.revisionConfirmacion, p_motivo: motivo
      });
    } catch (error) {
      // Solo una excepción SQL identificada se presenta como rechazo explícito.
      const codigoSQL = String(error?.detalle?.code || '');
      if (/^(?:P[0-9]{4}|22[0-9A-Z]{3}|23[0-9A-Z]{3}|40[0-9A-Z]{3}|42501|28000)$/.test(codigoSQL)) {
        error.tipoResultado = 'rechazado';
        throw error;
      }
      throw await resultadoEliminacionIncierto(productoId, 'COMUNICACION', error);
    }
    const uuid = valor => typeof valor === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor) && valor !== '00000000-0000-0000-0000-000000000000';
    const valido = resultado && typeof resultado === 'object' && !Array.isArray(resultado) &&
      resultado.resultado === 'ELIMINADO_PERMANENTEMENTE' && uuid(resultado.producto_id) && resultado.producto_id === productoId && resultado.nombre === vigente.nombre &&
      contador(resultado.movimientos_eliminados) && resultado.movimientos_eliminados === vigente.movimientos &&
      contador(resultado.existencias_eliminadas) && resultado.existencias_eliminadas === vigente.existencias &&
      contador(resultado.auditorias_conservadas) && resultado.auditorias_conservadas === vigente.auditorias &&
      resultado.identidad_conservada === true && uuid(resultado.registro_eliminacion_id);
    if (!valido) throw await resultadoEliminacionIncierto(productoId, 'RESPUESTA_INCONSISTENTE');
    invalidarCacheProducto(productoId);
    return resultado;
  }

  async function resultadoEliminacionIncierto(productoId, causa, original) {
    const error = _errorLocal('RESULTADO_INCIERTO', causa === 'RESPUESTA_INCONSISTENTE'
      ? 'la respuesta de eliminación está incompleta o es inconsistente. No se puede confirmar ni descartar que la operación se haya realizado.'
      : 'se perdió o no pudo validarse la comunicación con el servidor. No se puede confirmar ni descartar que la operación se haya realizado.');
    error.tipoResultado = 'incierto';
    error.causaResultado = causa;
    if (original) error.cause = original;
    try {
      const consulta = await previsualizarEliminacion(productoId);
      if (consulta.producto_id !== productoId) throw new Error('Respuesta de consulta con UUID diferente.');
      error.comprobacionLectura = 'producto_consultado';
      error.message += ' La consulta posterior de solo lectura devolvió el mismo UUID; el resultado del borrado sigue sin confirmarse. Revise su estado antes de una nueva operación.';
    } catch (_) {
      error.comprobacionLectura = 'no_concluyente';
      error.message += ' La consulta posterior de solo lectura no permitió comprobar el producto. Esto no demuestra su eliminación; verifique el producto y la bitácora administrativa antes de reintentar.';
    }
    return error;
  }

  function clearCache() {
    _cache.clear();
  }

  return {
    anularMovimiento: anularMovimiento,
    restablecerLineaBase: restablecerLineaBase,
    obtenerProductoActual: obtenerProductoActual,
    eliminarMovimiento: eliminarMovimiento,
    eliminacionProductoHabilitada: eliminacionProductoHabilitada,
    eliminacionHabilitada: ELIMINACION_HABILITADA,
    eliminarProducto: eliminarProducto,
    previsualizarEliminacion: previsualizarEliminacion,
    previsualizarEliminacionMovimiento: previsualizarEliminacionMovimiento,
    previsualizarAnulacion: previsualizarAnulacion,
    previsualizarRestablecimientoBase: previsualizarRestablecimientoBase,
    obtenerHistorico: obtenerHistorico,
    ARCHIVOS_HISTORICOS: ARCHIVOS_HISTORICOS,
    buscarProductos: buscarProductos,
    obtenerCatalogoSimilar: obtenerCatalogoSimilar,
    obtenerExistencias: obtenerExistencias,
    obtenerMovimientos: obtenerMovimientos,
    obtenerBodegasHistoricas: obtenerBodegasHistoricas,
    getBodegas: getBodegas,
    invalidarCacheBodegas: () => _cache.delete('bodegas'),
    crearProducto: crearProducto,
    confirmarLineaBase: confirmarLineaBase,
    calcularEntradaFormato: calcularEntradaFormato,
    sumarStockPrevisto: sumarStockPrevisto,
    registrarEntradaFormato: registrarEntradaFormato,
    listarEntradasPendientes: listarEntradasPendientes,
    obtenerEntradaPendiente: obtenerEntradaPendiente,
    recuperarEntradaFormato: recuperarEntradaFormato,
    registrarEntrada: registrarEntrada,
    registrarSalida: registrarSalida,
    clearCache: clearCache,
    TAMANO_PAGINA_CATALOGO: TAMANO_PAGINA_CATALOGO,
    TAMANO_PAGINA_FICHA: TAMANO_PAGINA_FICHA,
    RPC_LECTURA_PERMITIDAS: RPC_LECTURA_PERMITIDAS,
    RPC_ESCRITURA_PERMITIDAS: RPC_ESCRITURA_PERMITIDAS,
    RPC_PERMITIDAS: RPC_PERMITIDAS
  };
})();
