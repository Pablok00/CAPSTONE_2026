'use strict';
// ==========================================================
// HARNESS C2E-2/3 + C2E-4C + C2E-4D + C2E-4E4/F2
// CATÁLOGO GENERAL Y VISTA INTERNA DE MANTENCIÓN DE MÁQUINAS
// (solo lectura, sin red, sin Supabase real, SIN ESCRITURAS)
// ==========================================================
// C2E-4C — Mantención de Máquinas:
//   A dataset filtrado → LISTA DE MANTENCIONES.xlsx SIN la hoja MAQUINAS
//   B categorías visibles LUGAR / RADIADORES / REFRIGERADOR
//   B3 dominio MAQUINAS con sus propios métodos dedicados (48 / 110)
//   C 0 elementos de subáreas cerradas y 0 de MAQUINAS visibles
//   D contador de tarjeta derivado del dataset filtrado
//   E KPI con conteos filtrados (NO hardcodear 66 / 64 / 48 / 110)
//   F búsqueda por nombre / código / ubicación
//   G filtros de categoría
//   H elemento con historial → contador correcto
//   I elemento sin historial → "Sin historial registrado"
//   J última fecha usa fecha_realizacion real
//   K historial en TARJETAS (no tabla horizontal)
//   L detalle_trabajo NULL → sin bloque vacío
//   M fecha NULL → "Sin fecha registrada"
//   N responsable NULL → "Sin responsable registrado"
//   O historial ordenado fecha_realizacion DESC + desempate estable
//   P trazabilidad preservada
//   Q cero escrituras (insert / update / delete / upsert / rpc no
//     permitidas; las dos RPC de F2 quedan en RPC_PERMITIDAS_F2)
//   OP mantenciones operativas (C2E-4E4 / F2, solo el service): lectura
//     por elemento con merge de anulaciones, registro y anulación SOLO por
//     RPC, validaciones locales, caché aislada e históricos intactos
//   UI componentes del historial operativo (C2E-4E4 / F3, solo vistas):
//     bloque, tarjeta vigente/anulada, estado vacío, NULLs neutros, escape
//     HTML y saltos de línea por CSS; aún sin integrar en las fichas
//   X vista de Áreas de Trabajo (C2E-4D): catálogo real, SIN datos
//     simulados; navegación interna Áreas → Máquinas → ficha → volver
//     conservando filtros; sin ruta nueva en el sidebar
// Uso: node tests/harness_c2e3.js
// ==========================================================

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ARCHIVO_CAT = 'LISTA DE MANTENCIONES.xlsx';
const ARCHIVO_PILAS = 'MANTENCION DE PILAS.xlsx';
const ARCHIVO_TV = 'TV-Habitaciones.xlsx';
const ARCHIVO_PUERTAS = 'LISTA DE PUERTAS POR ENGRASAR Y ACEITAR.xlsx';
const ARCHIVO_FOSAS = '_LISTA FOSAS DE ALCANTARILLADOS.xlsx';
const ARCHIVO_BANOS = 'MANTENCION DE BAÑOS.xlsx';

// ----------------------------------------------------------
// 1) Stub de supabaseClient (SELECT / EQ / IN / ORDER / SINGLE / COUNT)
// ----------------------------------------------------------
const escrituras = [];

// C2E-4E4 / F2 — Lista PERMITIDA de RPC (solo las dos de mantenciones
// operativas). Las llamadas se registran en `rpcPermitidas` y el stub
// devuelve una respuesta SIMULADA en memoria: el harness jamás toca
// Supabase real ni produce escrituras. Cualquier otra RPC, INSERT, UPDATE,
// UPSERT o DELETE sigue registrándose en `escrituras` y rompe el test Q.
const RPC_PERMITIDAS_F2 = ['mantencion_registrar_mantencion', 'mantencion_anular_mantencion'];
const rpcPermitidas = [];

function crearClienteStub(db) {
  class Consulta {
    constructor(tabla) {
      this.tabla = tabla;
      this.eqList = [];
      this.inList = [];
      this.ordenes = [];
      this.opciones = {};
      this.esSingle = false;
    }
    select(cols, opciones) { this.cols = cols; this.opciones = opciones || {}; return this; }
    eq(col, val) { this.eqList.push([col, val]); return this; }
    in(col, vals) { this.inList.push([col, vals || []]); return this; }
    order(col, opts) { this.ordenes.push([col, opts || {}]); return this; }
    single() { this.esSingle = true; return this; }
    // Métodos de ESCRITURA: se registran y fallan (Q: cero escrituras).
    insert() { escrituras.push({ tipo: 'insert', tabla: this.tabla }); return this; }
    update() { escrituras.push({ tipo: 'update', tabla: this.tabla }); return this; }
    upsert() { escrituras.push({ tipo: 'upsert', tabla: this.tabla }); return this; }
    delete() { escrituras.push({ tipo: 'delete', tabla: this.tabla }); return this; }
    then(res, rej) { return Promise.resolve(this._ejecutar()).then(res, rej); }
    catch(fn) { return this.then(x => x, fn); }

    _ejecutar() {
      let filas = (db[this.tabla] || []).slice();
      filas = filas.filter(f =>
        this.eqList.every(([c, v]) => f[c] === v) &&
        this.inList.every(([c, vals]) => vals.indexOf(f[c]) !== -1)
      );

      // Orden multi-clave con estabilidad (comparador encadenado).
      const comparadores = this.ordenes.map(([col, opts]) => {
        const asc = opts.ascending !== false;
        const nullsFirst = (opts.nullsFirst === undefined) ? asc : !!opts.nullsFirst;
        return (a, b) => {
          const va = a[col]; const vb = b[col];
          const na = (va === null || va === undefined);
          const nb = (vb === null || vb === undefined);
          if (na && nb) return 0;
          if (na) return nullsFirst ? -1 : 1;
          if (nb) return nullsFirst ? 1 : -1;
          if (va < vb) return asc ? -1 : 1;
          if (va > vb) return asc ? 1 : -1;
          return 0;
        };
      });
      if (comparadores.length) {
        filas.sort((a, b) => {
          for (let i = 0; i < comparadores.length; i++) {
            const r = comparadores[i](a, b);
            if (r !== 0) return r;
          }
          return 0;
        });
      }

      // Embed simulado de ubicaciones(nombre) en elementos_mantenibles.
      if (this.tabla === 'elementos_mantenibles' && String(this.cols).indexOf('ubicacion:ubicaciones(nombre)') !== -1) {
        filas = filas.map(f => Object.assign({}, f, {
          ubicacion: (db.ubicaciones || []).find(u => u.id === f.ubicacion_id) || null
        }));
      }

      if (this.opciones && this.opciones.count) {
        return { data: null, error: null, count: filas.length };
      }
      if (this.esSingle) {
        return filas.length
          ? { data: filas[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      }
      return { data: filas, error: null };
    }
  }

  return {
    from(tabla) { return new Consulta(tabla); },
    rpc(nombre, params) {
      // Lista PERMITIDA de F2: cualquier otra RPC sigue siendo un fallo.
      if (RPC_PERMITIDAS_F2.indexOf(nombre) === -1) {
        escrituras.push({ tipo: 'rpc', nombre });
        throw new Error('rpc no permitido en harness read-only: ' + nombre);
      }
      rpcPermitidas.push({ nombre, params: params || {} });
      return Promise.resolve(rpcRespuestaStub(nombre, params || {}, db));
    }
  };
}

// Respuesta SIMULADA en memoria de las dos RPC permitidas, replicando el
// comportamiento ya verificado del backend: asigna autoría server-side,
// rechaza parámetros faltantes y bloquea la doble anulación.
function rpcRespuestaStub(nombre, params, db) {
  if (nombre === 'mantencion_registrar_mantencion') {
    const faltantes = ['p_elemento_id', 'p_fecha_realizacion', 'p_responsable_texto', 'p_detalle_trabajo']
      .filter(k => !params[k]);
    if (faltantes.length) {
      return { data: null, error: { message: 'PARAMETROS_INVALIDOS: faltan ' + faltantes.join(', ') } };
    }
    const id = 'op-' + (db.mantenciones_operativas.length + 1);
    const creado = '2026-10-18T12:00:00+00:00';
    db.mantenciones_operativas.push({
      id: id,
      elemento_id: params.p_elemento_id,
      fecha_realizacion: params.p_fecha_realizacion,
      responsable_texto: params.p_responsable_texto,
      detalle_trabajo: params.p_detalle_trabajo,
      registrado_por: 'uuid-usuario-stub',          // asignado por el "backend"
      autor_nombre_snapshot: 'Usuario Stub',         // asignado por el "backend"
      created_at: creado                             // asignado por el "backend"
    });
    return { data: { ok: true, mantencion_id: id, created_at: creado }, error: null };
  }

  // mantencion_anular_mantencion
  if (!params.p_motivo) {
    return { data: null, error: { message: 'MOTIVO_REQUERIDO: el motivo es obligatorio.' } };
  }
  const fila = db.mantenciones_operativas.find(m => m.id === params.p_mantencion_id);
  if (!fila) {
    return { data: null, error: { message: 'REGISTRO_NO_ENCONTRADO: no existe la mantención.' } };
  }
  const yaAnulada = db.mantenciones_operativas_anulaciones.find(a => a.mantencion_id === fila.id);
  if (yaAnulada) {
    return { data: null, error: { message: 'MANTENCION_YA_ANULADA: la mantención ya fue anulada.' } };
  }
  const id = 'ano-' + (db.mantenciones_operativas_anulaciones.length + 1);
  const creado = '2026-10-18T13:00:00+00:00';
  db.mantenciones_operativas_anulaciones.push({
    id: id,
    mantencion_id: fila.id,
    motivo: params.p_motivo,
    anulado_por: 'uuid-admin-permanente-stub',       // asignado por el "backend"
    autor_nombre_snapshot: 'Admin Permanente Stub',  // asignado por el "backend"
    created_at: creado                               // asignado por el "backend"
  });
  return { data: { ok: true, anulacion_id: id, mantencion_id: fila.id, created_at: creado }, error: null };
}

// ----------------------------------------------------------
// 2) Base de datos simulada (295 elementos / 275 mantenciones)
// ----------------------------------------------------------
function crearDB() {
  const db = {
    ubicaciones: [
      { id: 'ub-1', nombre: 'Sala de Caldera' },
      { id: 'ub-2', nombre: 'Bodega Central' },
      { id: 'ub-3', nombre: 'Pasillo Norte' },
      { id: 'ub-4', nombre: 'Terraza' },
      { id: 'ub-5', nombre: 'Local Técnico' }
    ],
    elementos_mantenibles: [],
    mantenciones: [],
    // C2E-4E4 / F2 — tablas operativas del backend (vacías en producción).
    mantenciones_operativas: [],
    mantenciones_operativas_anulaciones: [],
    inventarios_elementos: [],
    televisores_habitaciones: [],
    listado_engrase_aceitado: [],
    fosas_alcantarillado: [],
    guias_mantencion: [],
    jardineria_sectores: [],
    importaciones_excel: []
  };

  const HOJAS_CAT = { LUGAR: 15, MAQUINAS: 48, RADIADORES: 32, REFRIGERADOR: 19 };
  Object.keys(HOJAS_CAT).forEach(hoja => {
    for (let i = 1; i <= HOJAS_CAT[hoja]; i++) {
      const nombre = (hoja === 'MAQUINAS' && i === 1) ? 'CALDERA A GAS ACV' : `${hoja} ${i}`;
      // C2E-4C: los RADIADORES llevan código con prefijo R para poder
      // probar la búsqueda POR CÓDIGO sin que coincida con el nombre.
      const codigo = (hoja === 'RADIADORES') ? `R${i}`
        : (i % 3 === 0) ? null : (hoja === 'MAQUINAS' && i === 1 ? 4 : i);
      db.elementos_mantenibles.push({
        id: `cat-${hoja}-${i}`,
        nombre_original: nombre,
        observaciones: null,
        ubicacion_id: `ub-${(i % 5) + 1}`,
        area_id: null,
        codigo: codigo,
        nemotecnico: (i % 4 === 0) ? null : `NT-${hoja}-${i}`,
        grupo_origen: null,
        estado_original: null,
        hoja_origen: hoja,
        archivo_origen: ARCHIVO_CAT,
        fila_origen: i,
        ubicacion_original: (i % 2 === 0) ? `Ubicacion original ${hoja} ${i}` : null,
        celda_origen: `C${i}`,
        estado_operativo_actual: null,
        es_activo_fijo: false
      });
    }
  });

  // 181 elementos de subáreas CERRADAS (no deben aparecer en el catálogo).
  const cerradas = [
    { archivo: ARCHIVO_PILAS, hoja: 'Hoja1', n: 56, prefijo: 'PILA' },
    { archivo: ARCHIVO_TV, hoja: 'Hoja1', n: 28, prefijo: 'TV' },
    { archivo: ARCHIVO_PUERTAS, hoja: 'Hoja1', n: 47, prefijo: 'PUERTA' },
    { archivo: ARCHIVO_FOSAS, hoja: 'Hoja1', n: 18, prefijo: 'FOSA' },
    { archivo: ARCHIVO_BANOS, hoja: 'Hoja1', n: 32, prefijo: 'BANO' }
  ];
  cerradas.forEach(c => {
    for (let i = 1; i <= c.n; i++) {
      db.elementos_mantenibles.push({
        id: `${c.prefijo}-${i}`,
        nombre_original: `${c.prefijo} ${i}`,
        observaciones: null,
        ubicacion_id: 'ub-1',
        area_id: null,
        codigo: i,
        nemotecnico: null,
        grupo_origen: null,
        estado_original: null,
        hoja_origen: c.hoja,
        archivo_origen: c.archivo,
        fila_origen: i,
        ubicacion_original: null,
        celda_origen: null,
        estado_operativo_actual: null,
        es_activo_fijo: false
      });
    }
  });

  let mid = 0;
  function pushMantencion(elementoId, hoja, archivo, fila, campos) {
    mid++;
    db.mantenciones.push(Object.assign({
      id: `m-${mid}`, area_id: null, elemento_id: elementoId,
      tipo: null, estado: null, fecha_programada: null,
      fecha_realizacion: null, fecha_original: null,
      responsable_texto: null, responsable_id: null, costo_total: null,
      detalle_trabajo: null, hoja_origen: hoja, archivo_origen: archivo,
      fila_origen: fila, fecha_precision: null, fecha_anio: null,
      fecha_mes: null, celda_origen: `C${fila}`
    }, campos));
  }

  // LUGAR: 15 elementos / 15 mantenciones; 100% fecha + responsable; 0 detalle.
  for (let i = 1; i <= 15; i++) {
    pushMantencion(`cat-LUGAR-${i}`, 'LUGAR', ARCHIVO_CAT, i, {
      fecha_realizacion: `2024-${String((i % 9) + 1).padStart(2, '0')}-15`,
      responsable_texto: 'Técnico Lugar'
    });
  }

  // MAQUINAS: 110 mantenciones sobre 40 de 48 elementos.
  // 105 con fecha_realizacion / 5 SIN_FECHA; 108 responsable / 2 SIN;
  // 107 con detalle / 3 SIN.
  let sinFechaMaq = 0; let sinResponsableMaq = 0; let sinDetalleMaq = 0;
  for (let i = 1; i <= 40; i++) {
    if (i === 31) continue; // 31 se carga aparte (fechado + SIN_FECHA)
    const repeticiones = i <= 30 ? 3 : 2;
    for (let r = 1; r <= repeticiones; r++) {
      const esUltimoDeBloque = (i >= 37 && i <= 40 && r === repeticiones);
      const conFecha = !esUltimoDeBloque; // 4 registros SIN_FECHA (+ 1 abajo = 5)
      if (esUltimoDeBloque) sinFechaMaq++;
      const sinResp = (i === 29 && r === 1) || (i === 30 && r === 1); // 2
      if (sinResp) sinResponsableMaq++;
      const sinDet = (i === 33 && r === 1) || (i === 34 && r === 1) || (i === 35 && r === 1); // 3
      if (sinDet) sinDetalleMaq++;
      pushMantencion(`cat-MAQUINAS-${i}`, 'MAQUINAS', ARCHIVO_CAT, i * 10 + r, {
        // Caso documentado "Paneles Solares": registro fechado + SIN_FECHA.
        fecha_realizacion: conFecha ? `202${3 + (r % 3)}-${String((i % 12) + 1).padStart(2, '0')}-${String((r * 7) % 27 + 1).padStart(2, '0')}` : null,
        fecha_original: conFecha ? null : 'Sin dato en origen',
        responsable_texto: sinResp ? null : `Técnico Máquinas ${i}`,
        detalle_trabajo: sinDet ? null : `Revisión de máquina ${i}, turno ${r}`
      });
    }
  }
  // Elemento 31: un registro fechado (27/03/2025) + un SIN_FECHA con fila mayor.
  pushMantencion('cat-MAQUINAS-31', 'MAQUINAS', ARCHIVO_CAT, 311, {
    fecha_realizacion: '2025-03-27',
    responsable_texto: 'Técnico Máquinas 31',
    detalle_trabajo: 'Cambio de sello'
  });
  pushMantencion('cat-MAQUINAS-31', 'MAQUINAS', ARCHIVO_CAT, 312, {
    fecha_realizacion: null,
    fecha_original: 'Sin dato en origen',
    responsable_texto: null,
    detalle_trabajo: null
  });
  // Con i=31 fuera del bucle: MAQUINAS = 90 + 18 + 2 = 110 registros,
  // de los cuales 105 con fecha_realizacion y 5 SIN_FECHA.

  // RADIADORES: 30 mantenciones sobre 30 de 32 elementos (1 c/u), 100% completos.
  for (let i = 1; i <= 30; i++) {
    pushMantencion(`cat-RADIADORES-${i}`, 'RADIADORES', ARCHIVO_CAT, 300 + i, {
      fecha_realizacion: `2024-${String((i % 12) + 1).padStart(2, '0')}-10`,
      responsable_texto: 'Técnico Radiadores',
      detalle_trabajo: `Purga de radiador ${i}`
    });
  }

  // REFRIGERADOR: 19 mantenciones sobre 19 elementos, 100% completos.
  for (let i = 1; i <= 19; i++) {
    pushMantencion(`cat-REFRIGERADOR-${i}`, 'REFRIGERADOR', ARCHIVO_CAT, 400 + i, {
      fecha_realizacion: `2023-${String((i % 12) + 1).padStart(2, '0')}-05`,
      responsable_texto: 'Técnico Refrigerador',
      detalle_trabajo: `Carga de gas refrigerador ${i}`
    });
  }

  // 101 mantenciones de otras fuentes (NO del catálogo).
  const otras = [
    { archivo: ARCHIVO_BANOS, hoja: 'Hoja1', prefijo: 'BANO', n: 30 },
    { archivo: ARCHIVO_PILAS, hoja: 'Hoja1', prefijo: 'PILA', n: 25 },
    { archivo: ARCHIVO_TV, hoja: 'Hoja1', prefijo: 'TV', n: 20 },
    { archivo: ARCHIVO_PUERTAS, hoja: 'Hoja1', prefijo: 'PUERTA', n: 16 },
    { archivo: ARCHIVO_FOSAS, hoja: 'Hoja1', prefijo: 'FOSA', n: 10 }
  ];
  otras.forEach(o => {
    for (let i = 1; i <= o.n; i++) {
      pushMantencion(`${o.prefijo}-${Math.min(i, 10)}`, o.hoja, o.archivo, i, {
        fecha_realizacion: '2024-01-10',
        responsable_texto: 'Otra fuente',
        detalle_trabajo: 'Registro fuera del catálogo'
      });
    }
  });

  // C2E-4E4 / F2 — Mantenciones OPERATIVAS de prueba (backend simulado):
  // dos registros para cat-MAQUINAS-1 (uno vigente y uno ANULADO) y uno
  // para cat-LUGAR-1, para probar el filtrado por elemento, el merge de
  // anulaciones y el aislamiento respecto de los históricos importados.
  db.mantenciones_operativas.push(
    {
      id: 'op-1', elemento_id: 'cat-MAQUINAS-1',
      fecha_realizacion: '2025-05-10',
      responsable_texto: 'Técnico Operativo',
      detalle_trabajo: 'Revisión de bomba de circulación',
      registrado_por: 'uuid-usuario-stub',
      autor_nombre_snapshot: 'Usuario Stub',
      created_at: '2025-05-10T15:30:00+00:00'
    },
    {
      id: 'op-2', elemento_id: 'cat-MAQUINAS-1',
      fecha_realizacion: null,
      responsable_texto: 'Técnico Operativo',
      detalle_trabajo: 'Registro anulado por error de captura',
      registrado_por: 'uuid-usuario-stub',
      autor_nombre_snapshot: 'Usuario Stub',
      created_at: '2025-03-02T09:00:00+00:00'
    },
    {
      id: 'op-3', elemento_id: 'cat-LUGAR-1',
      fecha_realizacion: '2025-04-01',
      responsable_texto: 'Técnico Lugar Op',
      detalle_trabajo: 'Pintura de pasillo',
      registrado_por: 'uuid-usuario-stub',
      autor_nombre_snapshot: 'Usuario Stub',
      created_at: '2025-04-01T10:00:00+00:00'
    }
  );
  db.mantenciones_operativas_anulaciones.push({
    id: 'ano-1', mantencion_id: 'op-2',
    motivo: 'Captura duplicada',
    anulado_por: 'uuid-admin-permanente-stub',
    autor_nombre_snapshot: 'Admin Permanente Stub',
    created_at: '2025-03-03T11:00:00+00:00'
  });

  db._conteoEsperado = {
    elementosTotal: db.elementos_mantenibles.length,
    elementosCatalogo: 66,        // C2E-4C: LUGAR 15 + RADIADORES 32 + REFRIGERADOR 19
    mantencionesTotal: db.mantenciones.length,
    mantencionesCatalogo: 64,     // 15 + 30 + 19
    conHistorial: 64,
    sinHistorial: 2,              // los 2 radiadores sin mantención
    elementosMaquinas: 48,
    mantencionesMaquinas: 110,
    sinFechaMaq, sinResponsableMaq, sinDetalleMaq
  };
  return db;
}

// ----------------------------------------------------------
// 3) Carga de los archivos reales del proyecto (eval con stubs)
// ----------------------------------------------------------
function cargarServicio(db) {
  const src = fs.readFileSync(path.join(RAIZ, 'js', 'services', 'mantenciones.service.js'), 'utf8');
  const win = { supabaseClient: crearClienteStub(db) };
  const doc = { getElementById() { return null; }, querySelector() { return null; }, addEventListener() {} };
  const fn = new Function('window', 'document', src + '\n;return window.MantencionesService;');
  return fn(win, doc);
}

// Mini-DOM SOLO para las pruebas de F4 (modal + repintado de la ficha).
// Registran los nodos creados por id para poder inspeccionar innerHTML,
// textContent, value y disabled. `className` sincroniza con classList para
// que el patrón overlay.className = 'hidden ...' + classList.remove('hidden')
// se comporte como en el navegador.
function crearDocStub() {
  const nodos = {};
  function crearNodo(id) {
    const clases = new Set();
    return {
      id: id,
      innerHTML: '',
      textContent: '',
      value: '',
      disabled: false,
      scrollTop: 0,
      style: {},
      classList: {
        add(c) { clases.add(c); },
        remove(c) { clases.delete(c); },
        contains(c) { return clases.has(c); }
      },
      get className() { return Array.from(clases).join(' '); },
      set className(v) {
        clases.clear();
        String(v || '').split(/\s+/).forEach(c => { if (c) clases.add(c); });
      },
      setAttribute() {},
      getAttribute() { return null; },
      appendChild(n) { return n; },
      addEventListener() {},
      removeEventListener() {},
      querySelectorAll() { return []; },
      focus() {},
      // Simulación mínima del DOM real (usada por los avisos transitorios
      // de la ficha: role="status" insertado al inicio del contenedor).
      insertAdjacentHTML(posicion, html) {
        const texto = String(html || '');
        if (posicion === 'afterbegin') this.innerHTML = texto + this.innerHTML;
        else if (posicion === 'beforeend') this.innerHTML = this.innerHTML + texto;
        else this.innerHTML = this.innerHTML + texto;
      }
    };
  }
  const doc = {
    getElementById(id) {
      const clave = String(id);
      if (!nodos[clave]) nodos[clave] = crearNodo(clave);
      return nodos[clave];
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
    createElement() { return crearNodo('creado-' + Object.keys(nodos).length); },
    body: { appendChild(n) { return n; } }
  };
  doc._nodos = nodos;
  return doc;
}

function cargarVista(db, conDOM = false) {
  const src = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'mantenciones.js'), 'utf8');
  const win = { supabaseClient: crearClienteStub(db) };
  const doc = conDOM ? crearDocStub() : {
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement() { return { style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {} }; }
  };
  const cola = `
;window.__mnt = {
  MNT_SUBAPARTADOS,
  getMantencionesHTML,
  MNT_CARGADORES_SUBAPARTADO,
  mantencionFiltrosElementos,
  mntPanelElementosHTML,
  mntFiltrarElementos,
  mntOpcionesFiltrosElementos,
  mntCuadriculaElementosHTML,
  mntTarjetaElementoHTML,
  mntHistorialElementoHTML,
  mntTarjetaHistorialHTML,
  mntBloqueOperativasHTML,
  mntTarjetaOperativaHTML,
  mntChipAnuladoOperativaHTML,
  mntFichaElementoHTML,
  mntEtiquetaCategoria,
  mntEtiquetaCodigo,
  mntFormatoFechaCorta,
  mntResumenHistorialPorElemento,
  mntResetFiltrosElementos,
  mntEsc,
  mntSinDato,
  mntNombreUbicacion,
  mntPrimerValor,
  mntCargarFichaElemento,
  mntRepintarFichaOperativa,
  mntContenidoModalRegistrarMantencionHTML,
  abrirModalRegistrarMantencion,
  cerrarModalRegistrarMantencion,
  mntEnviarRegistrarMantencion,
  mntAvisoOperativasHTML,
  mntReintentarHistorialOperativo,
  mntContenidoModalAnularMantencionHTML,
  abrirModalAnularMantencion,
  cerrarModalAnularMantencion,
  mntEnviarAnularMantencion,
  mntOperativaFichaActual,
  mntGuardarOperativasFichaActual,
  mntLimpiarOperativasFichaActual,
  mntCargarEstadoOperativasFicha,
  mntFijarContextoOperativas,
  mntLimpiarContextoOperativas,
  mntContextoOperativas,
  mntRepintarFichaContextoOperativa,
  mntInsertarAvisoFichaOperativa,
  mntSetElementoSeleccionado: v => { mantencionElementoSeleccionado = v; },
  mntGetElementoSeleccionado: () => mantencionElementoSeleccionado,
  mntSetElementosBase: v => { mntElementosBase = v; }
};`;
  const fn = new Function('window', 'document', src + cola + '\n;return window.__mnt;');
  const api = fn(win, doc);
  api._window = win;
  api._doc = doc;
  return api;
}

// Vista de Áreas de Trabajo con stubs mínimos de state.js / app.js /
// modals.js y los helpers puros de mantenciones.js inyectados como
// parámetros (en el navegador son globales; aquí se inyectan
// explícitamente para no depender del orden de los <script>).
// `areaSubVista` simula el sub-estado real de js/state.js para poder
// renderizar tanto las seis tarjetas como la sub-vista de Máquinas.
// `docExterno` (opcional) permite compartir UN MISMO mini-DOM entre la
// instancia de mantenciones.js y la de áreas (como en el navegador, donde
// ambas cargan como <script> clásicos sobre el mismo document), necesario
// para probar el F6 con contextos compartidos.
function cargarAreas(db, svc, mnt, areaSubVista = null, navegaciones = [], docExterno = null) {
  const src = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'areas.js'), 'utf8');
  const win = { supabaseClient: crearClienteStub(db), MantencionesService: svc };
  const doc = docExterno || { getElementById() { return null; }, querySelector() { return null; }, addEventListener() {} };

  // Stubs del mecanismo de navegación REAL de la SPA (app.js.navigateTo).
  // Solo registran la llamada para poder asertar la sub-vista.
  const navigateTo = (vista, filtro = null, sub = null) => { navegaciones.push([vista, filtro, sub]); };

  const DEFAULT_WORK_AREAS = [
    { id: 'workarea_general', name: 'Mantención General', icon: '🔧', description: 'x', bullets: [], isPrincipal: true, responsible: 'Roberto Silva' },
    { id: 'workarea_maquinas', name: 'Mantención de Máquinas', icon: '⚙️', description: 'Revisión técnica sistemática de maquinaria.', bullets: ['Revisión y mantenimiento de equipos y maquinaria.'], color: 'blue', isPrincipal: false, responsible: 'Manuel Pérez' },
    { id: 'workarea_reactiva', name: 'Mantención Reactiva', icon: '⚡', description: 'x', bullets: [], isPrincipal: false, responsible: 'x' },
    { id: 'workarea_jardineria', name: 'Jardinería', icon: '🌳', description: 'x', bullets: [], isPrincipal: false, responsible: 'x' },
    { id: 'workarea_mejoras', name: 'Mejoras', icon: '🌿', description: 'x', bullets: [], isPrincipal: false, responsible: 'x' },
    { id: 'workarea_remodelacion', name: 'Remodelación', icon: '🏗️', description: 'x', bullets: [], isPrincipal: false, responsible: 'x' }
  ];
  const state = { workAreas: DEFAULT_WORK_AREAS, currentUser: null };
  const getWorkAreaStats = () => ({
    active: 3, pending: 2, completed: 1, delayed: 1,
    totalActualCost: 1000, totalEstimatedCost: 500, tasks: []
  });
  const formatCLP = v => '$' + v;
  const setProyectosMejorasReales = () => {};

  const cola = `
;window.__areas = {
  renderAreasView,
  getAreasHTML,
  openAreaMaquinas,
  mqaVolverAAreas,
  renderMaquinasView,
  mqaVistaHTML,
  mqaTarjetaAreaHTML,
  mqaListadoHTML,
  mqaCuadriculaHTML,
  mqaTarjetaEquipoHTML,
  mqaFichaHTML,
  mqaVolverAlListado,
  mqaAbrirFichaEquipo,
  mqaRepintarFichaOperativa,
  mqaFiltrar,
  mqaOpcionesUbicacionHTML,
  mqaCargarCatalogo,
  mqaEstado: () => ({ carga: mqaCarga, resumen: mqaResumen, filtro: mqaFiltro, seleccionado: mqaSeleccionado, detalle: mqaDetalle }),
  mqaSetEstado: (sel, det, carga, filtro) => {
    if (sel !== undefined) mqaSeleccionado = sel;
    if (det !== undefined) mqaDetalle = det;
    if (carga !== undefined) mqaCarga = carga;
    if (filtro !== undefined) mqaFiltro = filtro;
  }
};`;

  const fn = new Function(
    'window', 'document', 'state', 'DEFAULT_WORK_AREAS', 'getWorkAreaStats', 'formatCLP', 'setProyectosMejorasReales',
    'areaSubVista', 'navigateTo',
    'mntEsc', 'mntSinDato', 'mntNombreUbicacion', 'mntEtiquetaCodigo', 'mntPrimerValor',
    'mntEtiquetaCategoria', 'mntFormatoFechaCorta', 'mntResumenHistorialPorElemento', 'mntFichaElementoHTML',
    'mntCargarEstadoOperativasFicha', 'mntFijarContextoOperativas', 'mntLimpiarContextoOperativas',
    'mntGuardarOperativasFichaActual', 'mntLimpiarOperativasFichaActual',
    src + cola + '\n;return window.__areas;'
  );

  const api = fn(
    win, doc, state, DEFAULT_WORK_AREAS, getWorkAreaStats, formatCLP, setProyectosMejorasReales,
    areaSubVista, navigateTo,
    mnt.mntEsc, mnt.mntSinDato, mnt.mntNombreUbicacion, mnt.mntEtiquetaCodigo, mnt.mntPrimerValor,
    mnt.mntEtiquetaCategoria, mnt.mntFormatoFechaCorta, mnt.mntResumenHistorialPorElemento, mnt.mntFichaElementoHTML,
    mnt.mntCargarEstadoOperativasFicha, mnt.mntFijarContextoOperativas, mnt.mntLimpiarContextoOperativas,
    mnt.mntGuardarOperativasFichaActual, mnt.mntLimpiarOperativasFichaActual
  );
  api._areas = DEFAULT_WORK_AREAS;
  api._navegaciones = navegaciones;
  return api;
}

// ----------------------------------------------------------
// 4) Motor de aserciones
// ----------------------------------------------------------
const resultados = [];
function check(letra, nombre, cond, detalle) {
  resultados.push({ letra, nombre, ok: !!cond, detalle: detalle || '' });
}
function contiene(html, texto) { return String(html).indexOf(texto) !== -1; }
function noContiene(html, texto) { return String(html).indexOf(texto) === -1; }

// ----------------------------------------------------------
// 5) Ejecución
// ----------------------------------------------------------
async function main() {
  const db = crearDB();
  const svc = cargarServicio(db);
  const mnt = cargarVista(db);
  const navegaciones = [];
  const areas = cargarAreas(db, svc, mnt, null, navegaciones);
  const META = mnt.MNT_SUBAPARTADOS.find(s => s.id === 'elementos');
  const HOJAS_CAT = ['LUGAR', 'RADIADORES', 'REFRIGERADOR'];

  // --- Servicio: dataset filtrado (Catálogo General sin MAQUINAS) -----
  const elems = await svc.getElementosGenerales(true);
  const mantCat = await svc.getMantencionesGenerales(true);

  const archivosVistos = Array.from(new Set(elems.map(e => e.archivo_origen)));
  check('A', 'solo LISTA DE MANTENCIONES.xlsx, 66 elementos (LUGAR+RAD+REFR)',
    elems.length === 66 && archivosVistos.length === 1 && archivosVistos[0] === ARCHIVO_CAT,
    `filas=${elems.length}, archivos=${JSON.stringify(archivosVistos)}`);

  const hojas = Array.from(new Set(elems.map(e => e.hoja_origen))).sort();
  const etiquetas = Array.from(new Set(elems.map(e => mnt.mntEtiquetaCategoria(e.hoja_origen)))).sort();
  check('B', 'categorías LUGAR/RADIADORES/REFRIGERADOR + labels (sin "Máquinas")',
    JSON.stringify(hojas) === JSON.stringify(HOJAS_CAT.slice().sort()) &&
    etiquetas.join('|') === 'Lugar|Radiadores|Refrigerador',
    `hojas=${JSON.stringify(hojas)}, etiquetas=${JSON.stringify(etiquetas)}`);

  check('B2', 'historial del catálogo = 64',
    mantCat.length === 64 && mantCat.every(m => m.archivo_origen === ARCHIVO_CAT && m.hoja_origen !== 'MAQUINAS'),
    `mantenciones=${mantCat.length}`);

  // --- Dominio MAQUINAS con métodos dedicados --------------------------
  const elemsMaq = await svc.getElementosMaquinas(true);
  const mantMaq = await svc.getMantencionesMaquinas(true);
  check('B3', 'dominio MAQUINAS: 48 equipos y 110 mantenciones (métodos dedicados)',
    elemsMaq.length === 48 && elemsMaq.every(e => e.hoja_origen === 'MAQUINAS' && e.archivo_origen === ARCHIVO_CAT) &&
    mantMaq.length === 110 && mantMaq.every(m => m.hoja_origen === 'MAQUINAS' && m.archivo_origen === ARCHIVO_CAT),
    `equipos=${elemsMaq.length}, mantenciones=${mantMaq.length}`);

  // Las dos colecciones tienen cachés INDEPENDIENTES (sin colisión).
  const elemsMaq2 = await svc.getElementosMaquinas();
  check('B4', 'caché propia del dominio MAQUINAS (sin compartir con el catálogo)',
    elemsMaq2 === elemsMaq && elemsMaq2 !== elems, 'cachés separadas');

  // --- Regresión: métodos compartidos intactos ------------------------
  const elemsTodos = await svc.getElementos(true);
  const mantTodas = await svc.getMantenciones(true);
  check('R1', 'getElementos() sigue devolviendo las 295 (subáreas cerradas intactas)',
    elemsTodos.length === 295, `getElementos=${elemsTodos.length}`);
  check('R2', 'getMantenciones() sigue devolviendo las 275 (Baños intacto)',
    mantTodas.length === 275, `getMantenciones=${mantTodas.length}`);

  // --- Panel / tarjetas ----------------------------------------------
  const htmlPanel = mnt.mntPanelElementosHTML(META, elems, mantCat);
  check('D', 'cabecera derivada 66 · 64 · 2 (sin hardcodear)',
    contiene(htmlPanel, '66 elementos · 64 con historial · 2 sin historial'),
    'cabecera=' + (htmlPanel.match(/\d+ elementos · \d+ con historial · \d+ sin historial/) || ['NO'])[0]);

  // Prueba de no-hardcode: dataset más pequeño → la cabecera cambia.
  const elemsMini = elems.slice(0, 5);
  const htmlMini = mnt.mntPanelElementosHTML(META, elemsMini, mantCat);
  check('D2', 'cabecera DERIVADA (con 5 elementos ya no dice 66)',
    contiene(htmlMini, '5 elementos ·') && noContiene(htmlMini, '66 elementos'),
    'cabeceraMini=' + (htmlMini.match(/\d+ elementos · \d+ con historial · \d+ sin historial/) || ['NO'])[0]);

  const idsCerradas = db.elementos_mantenibles
    .filter(e => e.archivo_origen !== ARCHIVO_CAT).map(e => e.id);
  const nombresCerradas = db.elementos_mantenibles
    .filter(e => e.archivo_origen !== ARCHIVO_CAT).map(e => e.nombre_original);
  const fugas = idsCerradas.filter(id => contiene(htmlPanel, id))
    .concat(nombresCerradas.filter(n => contiene(htmlPanel, n)));
  check('C', '0 elementos de pilas / TV / puertas / fosas / baños visibles',
    fugas.length === 0, `fugas=${fugas.slice(0, 5).join(',')}`);
  const archivosCerrados = [ARCHIVO_PILAS, ARCHIVO_TV, ARCHIVO_PUERTAS, ARCHIVO_FOSAS, ARCHIVO_BANOS];
  check('C2', 'ningún archivo de subárea cerrada en el HTML del catálogo',
    archivosCerrados.every(a => noContiene(htmlPanel, a)),
    'archivos cerrados ausentes');
  check('C7', 'cero elementos de MAQUINAS en el Catálogo General',
    elems.every(e => e.hoja_origen !== 'MAQUINAS') && mantCat.every(m => m.hoja_origen !== 'MAQUINAS') &&
    noContiene(htmlPanel, 'CALDERA A GAS ACV') && noContiene(htmlPanel, 'cat-MAQUINAS'),
    'sin rastro de MAQUINAS en el catálogo');

  // --- KPI / resumen (service) ----------------------------------------
  let resumen = await svc.getResumen(true);
  const kpiElems = resumen.subapartados.detalle.find(s => s.id === 'elementos');
  check('E', 'KPI filtrados: 66 elementos / 64 mantenciones / tarjeta 66',
    resumen.elementos === 66 && resumen.mantenciones === 64 && kpiElems.cantidad === 66,
    `elementos=${resumen.elementos}, mantenciones=${resumen.mantenciones}, tarjeta=${kpiElems.cantidad}`);
  check('E2', 'subapartados dinámicos 9 / conDatos calculado',
    resumen.subapartados.total === 9 &&
    resumen.subapartados.detalle.filter(s => s.cantidad > 0).length === resumen.subapartados.conDatos,
    `total=${resumen.subapartados.total}, conDatos=${resumen.subapartados.conDatos}`);

  // UX-3.1: el servicio conserva las fuentes; solo cambia la navegación visible.
  const idsVisibles = mnt.MNT_SUBAPARTADOS.filter(s => s.id !== 'jardineria').map(s => s.id);
  const resumenVisible = {...resumen, subapartados:{total:9,conDatos:9,
    detalle:mnt.MNT_SUBAPARTADOS.map(s => ({id:s.id,cantidad:1}))}};
  const principal = mnt.getMantencionesHTML(resumenVisible);
  check('UX3.1a', 'ocho accesos originales sin tarjeta Jardinería',
    (principal.match(/onclick="abrirMantencionSubapartado/g)||[]).length === 8 &&
    idsVisibles.every(id => principal.includes("abrirMantencionSubapartado('"+id+"')")) &&
    !principal.includes("abrirMantencionSubapartado('jardineria')"), 'solo se excluye Jardinería');
  check('UX3.1b', 'contador calculado de la lista visible 8/8',
    /8\s*<span[^>]*>\/ 8<\/span>/.test(principal), 'no usa el total 9 del servicio');
  resumenVisible.subapartados.detalle.forEach(s => {s.cantidad = s.id === 'jardineria' ? 5 : 0;});
  check('UX3.1c', 'Jardinería no infla el contador cuando los ocho están vacíos',
    /0\s*<span[^>]*>\/ 8<\/span>/.test(mnt.getMantencionesHTML(resumenVisible)), '0/8 dinámico');
  check('UX3.1d', 'metadatos y cargador de Jardinería conservados',
    mnt.MNT_SUBAPARTADOS.some(s => s.id === 'jardineria') &&
    typeof mnt.MNT_CARGADORES_SUBAPARTADO.jardineria === 'function', 'sin borrar servicios');

  // KPI sin hardcodear: mutamos la base y volvemos a contar.
  const fueraCatalogo = db.elementos_mantenibles.filter(e =>
    e.archivo_origen !== ARCHIVO_CAT || e.hoja_origen === 'MAQUINAS');
  const fueraCatalogoMant = db.mantenciones.filter(m =>
    m.archivo_origen !== ARCHIVO_CAT || m.hoja_origen === 'MAQUINAS');
  db.elementos_mantenibles = db.elementos_mantenibles
    .filter(e => e.archivo_origen === ARCHIVO_CAT && e.hoja_origen !== 'MAQUINAS')
    .slice(0, 5).concat(fueraCatalogo);
  db.mantenciones = db.mantenciones
    .filter(m => m.archivo_origen === ARCHIVO_CAT && m.hoja_origen !== 'MAQUINAS')
    .slice(0, 7).concat(fueraCatalogoMant);
  resumen = await svc.getResumen(true);
  check('E3', 'KPI NO hardcodeado (5 elementos / 7 mantenciones simulados)',
    resumen.elementos === 5 && resumen.mantenciones === 7,
    `elementos=${resumen.elementos}, mantenciones=${resumen.mantenciones}`);
  // Restauramos la base completa para el resto de las pruebas de render.
  const dbLimpio = crearDB();
  db.elementos_mantenibles = dbLimpio.elementos_mantenibles;
  db.mantenciones = dbLimpio.mantenciones;

  // --- Filtros y búsqueda ---------------------------------------------
  mnt.mntResetFiltrosElementos();
  const porLugar = mnt.mntFiltrarElementos(elems).filter(e => e.hoja_origen === 'LUGAR');
  const porRad = mnt.mntFiltrarElementos(elems).filter(e => e.hoja_origen === 'RADIADORES');
  const porRefr = mnt.mntFiltrarElementos(elems).filter(e => e.hoja_origen === 'REFRIGERADOR');
  const porMaq = mnt.mntFiltrarElementos(elems).filter(e => e.hoja_origen === 'MAQUINAS');
  check('G', 'filtros: LUGAR 15 / RADIADORES 32 / REFRIGERADOR 19 / MAQUINAS 0',
    mnt.mntFiltrarElementos(elems).length === 66 &&
    porLugar.length === 15 && porRad.length === 32 && porRefr.length === 19 && porMaq.length === 0,
    `lugar=${porLugar.length}, rad=${porRad.length}, refr=${porRefr.length}, maq=${porMaq.length}`);

  mnt.mantencionFiltrosElementos.texto = 'radiadores 7';
  const porNombre = mnt.mntFiltrarElementos(elems);
  mnt.mantencionFiltrosElementos.texto = 'r7';
  const porCodigo = mnt.mntFiltrarElementos(elems);
  mnt.mantencionFiltrosElementos.texto = 'terraza';
  const porUbicacion = mnt.mntFiltrarElementos(elems);
  mnt.mantencionFiltrosElementos.texto = '';
  check('F', 'búsqueda por nombre / código / ubicación',
    porNombre.length >= 1 && porNombre.some(e => e.id === 'cat-RADIADORES-7') &&
    porCodigo.length >= 1 && porCodigo.some(e => e.id === 'cat-RADIADORES-7') &&
    porCodigo.every(e => String(e.codigo).toLowerCase().indexOf('r7') !== -1) &&
    porUbicacion.length >= 1 && porUbicacion.every(e => {
      const u = e.ubicacion && e.ubicacion.nombre;
      return u === 'Terraza' || e.ubicacion_original === 'Terraza';
    }) && porNombre.every(e => e.archivo_origen === ARCHIVO_CAT),
    `nombre=${porNombre.length}, codigo=${porCodigo.length}, ubicacion=${porUbicacion.length}`);

  // --- Tarjetas de elemento -------------------------------------------
  const conHist = elems.find(e => e.id === 'cat-RADIADORES-1');
  const sinHist = elems.find(e => e.id === 'cat-RADIADORES-31');
  const tarjetaCon = mnt.mntTarjetaElementoHTML(conHist);
  const tarjetaSin = mnt.mntTarjetaElementoHTML(sinHist);
  check('H', 'elemento con historial → contador real',
    contiene(tarjetaCon, '1 mantención') && contiene(tarjetaCon, 'N.º original: R1') &&
    contiene(tarjetaCon, 'RADIADORES 1') && contiene(tarjetaCon, 'Bodega Central') &&
    contiene(tarjetaCon, 'Última: 10/02/2024'),
    'tarjeta de RADIADORES 1 con ubicación, código, contador y última fecha');
  check('I', 'elemento sin historial → "Sin historial registrado"',
    contiene(tarjetaSin, '0 mantenciones') && contiene(tarjetaSin, 'Sin historial registrado') &&
    noContiene(tarjetaSin, 'Última:'), 'tarjetaSinHistorial OK');
  check('C3', 'sin estado_operativo_actual ni es_activo_fijo ni proveedor en la tarjeta',
    noContiene(htmlPanel, 'estado_operativo_actual') && noContiene(htmlPanel, 'Activo fijo') &&
    noContiene(htmlPanel, 'Proveedor'), 'sin campos fuera de alcance');

  // --- Última fecha real ----------------------------------------------
  const tarjetaUltima = elems.filter(e => e.hoja_origen === 'REFRIGERADOR').map(mnt.mntTarjetaElementoHTML).join('');
  check('J', 'última fecha usa fecha_realizacion real (dd/mm/yyyy)',
    /Última: \d{2}\/\d{2}\/\d{4}/.test(tarjetaUltima) && noContiene(tarjetaUltima, 'Sin fecha registrada'),
    'tarjetaRefrigerador con última fecha');

  // --- Historial (dominio MAQUINAS): tarjetas + orden + NULL ----------
  const lista31 = mantMaq.filter(m => m.elemento_id === 'cat-MAQUINAS-31');
  const fechas = lista31.map(m => m.fecha_realizacion);
  check('O', 'orden fecha_realizacion DESC con SIN_FECHA al final (estable)',
    fechas[0] === '2025-03-27' && fechas[1] === null && lista31.length === 2,
    `fechas=${JSON.stringify(fechas)}`);

  const noNulas = mantMaq.filter(m => m.fecha_realizacion !== null).map(m => m.fecha_realizacion);
  const nulas = mantMaq.filter(m => m.fecha_realizacion === null);
  const descendente = noNulas.every((f, i) => i === 0 || noNulas[i - 1] >= f);
  const nulasOrdenadas = nulas.map(m => m.fila_origen).every((f, i, arr) => i === 0 || arr[i - 1] <= f);
  check('O2', 'histórico MAQUINAS: fechas desc, luego SIN_FECHA por fila_origen asc',
    descendente && nulasOrdenadas && nulas.length === 5,
    `descendente=${descendente}, sinFecha=${nulas.length}, filaAsc=${nulasOrdenadas}`);

  const htmlHist = mnt.mntHistorialElementoHTML(lista31);
  check('K', 'historial en TARJETAS, no tabla horizontal',
    noContiene(htmlHist, '<table') && noContiene(htmlHist, '<thead') &&
    contiene(htmlHist, 'Sin fecha registrada') && noContiene(htmlHist, 'Sin detalle'),
    'sin <table>, con tarjetas');
  check('M', 'fecha NULL → "Sin fecha registrada"',
    contiene(htmlHist, 'Sin fecha registrada'), 'presente');
  check('P', 'trazabilidad discreta preservada',
    contiene(htmlHist, 'Origen: LISTA DE MANTENCIONES.xlsx · MAQUINAS · fila 312 · celda C312') &&
    contiene(htmlHist, 'Última mantención:'), 'origen + última mantención');

  const regSinResponsable = mantMaq.find(m => m.elemento_id === 'cat-MAQUINAS-29' && m.responsable_texto === null);
  const htmlSinResp = mnt.mntTarjetaHistorialHTML(regSinResponsable);
  check('N', 'responsable NULL → "Sin responsable registrado"',
    contiene(htmlSinResp, 'Sin responsable registrado'), 'presente');

  // --- Ficha (Catálogo General) ----------------------------------------
  const detalleLugar = await svc.getElementoDetalle('cat-LUGAR-1');
  const fichaLugar = mnt.mntFichaElementoHTML(detalleLugar, []);
  check('L', 'detalle_trabajo NULL → sin bloque vacío ("Sin detalle")',
    noContiene(fichaLugar, 'Sin detalle') && noContiene(fichaLugar, 'Detalle del trabajo'),
    'LUGAR sin detalle no renderizado');
  check('P2', 'ficha con trazabilidad (archivo / hoja / fila / celda)',
    contiene(fichaLugar, 'Origen / trazabilidad') && contiene(fichaLugar, 'LISTA DE MANTENCIONES.xlsx') &&
    contiene(fichaLugar, 'Fila origen') && contiene(fichaLugar, 'Celda origen'),
    'trazabilidad presente');
  check('P3', 'ficha sin campos NULL innecesarios',
    noContiene(fichaLugar, 'Estado original') && noContiene(fichaLugar, 'Grupo / origen') &&
    noContiene(fichaLugar, 'Sin dato registrado'),
    'sin campos siempre NULL');

  // --- Ficha (dominio MAQUINAS, carga independiente) --------------------
  const detalleMaq = await svc.getElementoDetalleMaquinas('cat-MAQUINAS-31');
  const fichaMaq = mnt.mntFichaElementoHTML(detalleMaq, []);
  check('O3', 'ficha MAQUINAS: historial con fechado + SIN_FECHA visibles',
    detalleMaq.mantenciones.length === 2 &&
    contiene(fichaMaq, '27/03/2025') && contiene(fichaMaq, 'Sin fecha registrada') &&
    contiene(fichaMaq, '2 registros'), 'ambos registros visibles');

  // Ficha de un elemento ajeno → el service lo rechaza (fail-closed).
  const detalleAjeno = await svc.getElementoDetalle('PILA-1').catch(() => ({ elemento: null }));
  check('C4', 'ficha fail-closed para elemento de subárea cerrada',
    !detalleAjeno.elemento, 'elemento=null');

  const detalleAjenoMaq = await svc.getElementoDetalleMaquinas('cat-LUGAR-1').catch(() => ({ elemento: null }));
  check('C6', 'ficha de Máquinas fail-closed para un LUGAR del catálogo',
    !detalleAjenoMaq.elemento, 'elemento=null');

  // --- Estructura del subapartado --------------------------------------
  check('C5', 'nombre/descripción "Catálogo General e Historial"',
    META.nombre === 'Catálogo General e Historial' &&
    contiene(META.descripcion, 'Lugares, máquinas, radiadores y refrigeradores'),
    META.nombre + ' / ' + META.descripcion);

  const fuentes = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'mantenciones.js'), 'utf8');
  check('E4', 'KPI "Elementos generales" (no "Elementos registrados")',
    contiene(fuentes, "mntKPIHTML('🧰', 'Elementos generales', resumen.elementos)") &&
    noContiene(fuentes, "'Elementos registrados'"), 'etiqueta KPI actualizada');

  // --- X: vista interna de Áreas de Trabajo → Mantención de Máquinas ----
  const carga = await areas.mqaCargarCatalogo(true);
  const estado = areas.mqaEstado();
  check('X1', 'catálogo de Máquinas cargado con datos REALES (48 / 110)',
    carga.estado === 'listo' && carga.equipos.length === 48 && carga.mantenciones.length === 110 &&
    estado.resumen['cat-MAQUINAS-1'].cantidad === 3,
    `estado=${carga.estado}, equipos=${carga.equipos.length}, mantenciones=${carga.mantenciones.length}, resumen1=${estado.resumen['cat-MAQUINAS-1'] && estado.resumen['cat-MAQUINAS-1'].cantidad}`);

  const areaMaq = areas._areas.find(a => a.id === 'workarea_maquinas');
  const tarjetaArea = areas.mqaTarjetaAreaHTML(areaMaq, carga);
  check('X2', 'tarjeta: SIN datos simulados y entrada a ficha de área con acceso al catálogo',
    noContiene(tarjetaArea, 'Manuel Pérez') && noContiene(tarjetaArea, 'Caldera Ferroli') &&
    noContiene(tarjetaArea, 'Generador Eléctrico') && noContiene(tarjetaArea, 'Gasto:') &&
    noContiene(tarjetaArea, 'Atrasadas') && noContiene(tarjetaArea, 'Presupuesto') &&
    noContiene(tarjetaArea, 'openTaskFromArea') && noContiene(tarjetaArea, 'goToGanttForArea') &&
    noContiene(tarjetaArea, 'openMaintenanceDetail') && contiene(tarjetaArea, "openAreaDetail('workarea_maquinas')") &&
    noContiene(tarjetaArea, 'openModal') &&
    noContiene(tarjetaArea, 'onclick="openAreaMaquinas()"') &&
    contiene(tarjetaArea, 'acceso al catálogo de máquinas') && contiene(tarjetaArea, '48') &&
    contiene(tarjetaArea, '110'), 'tarjeta real → ficha del área');

  // AREAS-2A.1: las seis tarjetas abren ficha y dejan de mostrar métricas locales.
  const htmlAreas = areas.getAreasHTML(null);
  check('X3', 'seis fichas de área, sin estadísticas locales ni equipos duplicados',
    contiene(htmlAreas, 'Ver ficha del área') &&
    contiene(htmlAreas, 'Jardinería') &&
    contiene(htmlAreas, 'Mantención Reactiva') &&
    contiene(htmlAreas, 'Remodelación') &&
    noContiene(htmlAreas, 'Activas</') && noContiene(htmlAreas, 'Gasto:') &&
    contiene(htmlAreas, "openAreaDetail('workarea_general')") &&
    contiene(htmlAreas, "openAreaDetail('workarea_maquinas')") &&
    noContiene(htmlAreas, 'Caldera Ferroli'), 'comportamiento preservado');

  // Navegación Áreas → Máquinas con el mecanismo REAL de la SPA.
  areas.mqaSetEstado(null, null, carga, { texto: '', ubicacion: '' });
  areas.openAreaMaquinas();
  check('X4', 'navegación Áreas → Máquinas vía navigateTo(areas, null, maquinas)',
    navegaciones.length === 1 &&
    JSON.stringify(navegaciones[0]) === JSON.stringify(['areas', null, 'maquinas']),
    JSON.stringify(navegaciones));

  // renderAreasView decide por el sub-estado areaSubVista (js/state.js).
  const areasMaq = cargarAreas(db, svc, mnt, 'maquinas', navegaciones);
  const htmlEnMaquinas = areasMaq.renderAreasView();
  const htmlSeisTarjetas = areas.renderAreasView();
  check('X5', 'renderAreasView: sub-vista de Máquinas o seis tarjetas según areaSubVista',
    contiene(htmlEnMaquinas, 'areas-maq-content') && noContiene(htmlEnMaquinas, 'id="areas-content"') &&
    contiene(htmlSeisTarjetas, 'id="areas-content"') && noContiene(htmlSeisTarjetas, 'areas-maq-content'),
    `maquinas=${contiene(htmlEnMaquinas, 'areas-maq-content')}, tarjetas=${contiene(htmlSeisTarjetas, 'id="areas-content"')}`);

  // Vista completa: encabezado, botón de volver, contadores reales, cuerpo.
  const htmlVista = areas.mqaVistaHTML();
  check('X6', 'vista de pantalla completa: volver + contadores reales, sin simulados',
    contiene(htmlVista, 'Volver a Áreas de Trabajo') && contiene(htmlVista, 'mqaVolverAAreas()') &&
    contiene(htmlVista, 'Mantención de Máquinas') && contiene(htmlVista, 'Catálogo real (Supabase)') &&
    contiene(htmlVista, 'id="mqa-cuerpo"') && contiene(htmlVista, '>48<') && contiene(htmlVista, '>110<') &&
    noContiene(htmlVista, 'Caldera Ferroli') && noContiene(htmlVista, 'Manuel Pérez') &&
    noContiene(htmlVista, 'Gasto:') && noContiene(htmlVista, 'modal-area-detail') &&
    noContiene(htmlVista, 'max-w-7xl'), 'ancho completo de #view-container');

  // Listado con buscador, filtros y contadores sobre datos reales.
  const htmlListado = areas.mqaListadoHTML();
  check('X7', 'listado con buscador, filtro de ubicación, contador y equipos reales',
    contiene(htmlListado, 'Buscar por nombre, ubicación o número original') &&
    contiene(htmlListado, 'Todas las ubicaciones') &&
    contiene(htmlListado, '48 de 48 equipos') &&
    contiene(htmlListado, 'CALDERA A GAS ACV') &&
    noContiene(htmlListado, 'Manuel Pérez') && noContiene(htmlListado, 'Atrasadas') &&
    noContiene(htmlListado, 'modal-area-detail'), 'listado real');

  // Filtros del catálogo de máquinas (estado aislado mqaFiltro).
  const porTexto = carga.equipos.filter(e =>
    (e.nombre_original || '').toLowerCase().includes('caldera'));
  const porUbicacionMaq = areas.mqaFiltrar(carga.equipos).length;
  check('X8', 'buscador y filtros del catálogo de máquinas sobre datos reales',
    porTexto.length >= 1 && porTexto.every(e => e.hoja_origen === 'MAQUINAS') &&
    porUbicacionMaq === 48, `porTexto=${porTexto.length}, filtrados=${porUbicacionMaq}`);

  // Ficha individual DENTRO de la misma vista (sin modal) + historial propio.
  const detalleCaldera = await svc.getElementoDetalleMaquinas('cat-MAQUINAS-1');
  areas.mqaSetEstado(null, null, carga, { texto: 'caldera a gas', ubicacion: '' });
  areas.mqaSetEstado('cat-MAQUINAS-1', { estado: 'listo', dato: detalleCaldera }, undefined);
  const htmlFicha = areas.mqaVistaHTML();
  check('X9', 'ficha dentro de la vista con historial importado (sin modal)',
    detalleCaldera.mantenciones.length === 3 &&
    contiene(htmlFicha, 'Ficha del elemento') && contiene(htmlFicha, '← Volver al catálogo') &&
    contiene(htmlFicha, 'mqaVolverAlListado()') &&
    contiene(htmlFicha, 'Origen / trazabilidad') && contiene(htmlFicha, 'LISTA DE MANTENCIONES.xlsx') &&
    contiene(htmlFicha, 'MAQUINAS') && noContiene(htmlFicha, '<table') &&
    noContiene(htmlFicha, 'modal-area-detail'), 'ficha en tarjetas dentro de la vista');

  // Volver al catálogo → conserva la búsqueda y la ubicación.
  areas.mqaVolverAlListado();
  const estadoVuelta = areas.mqaEstado();
  const htmlTrasVolver = areas.mqaListadoHTML();
  check('X10', 'volver al catálogo conserva los filtros (texto y ubicación)',
    estadoVuelta.seleccionado === null && estadoVuelta.filtro.texto === 'caldera a gas' &&
    estadoVuelta.filtro.ubicacion === '' &&
    contiene(htmlTrasVolver, 'value="caldera a gas"') &&
    contiene(htmlTrasVolver, '1 de 48 equipos') &&
    contiene(htmlTrasVolver, 'CALDERA A GAS ACV'),
    `sel=${estadoVuelta.seleccionado}, texto="${estadoVuelta.filtro.texto}", contador=${(htmlTrasVolver.match(/\d+ de \d+ equipos/) || ['NO'])[0]}`);

  // Botón "← Volver a Áreas de Trabajo" → seis tarjetas (sin sub-vista).
  areas.mqaVolverAAreas();
  check('X11', 'botón "Volver a Áreas" → navigateTo(areas) y ficha limpiada',
    JSON.stringify(navegaciones[navegaciones.length - 1]) === JSON.stringify(['areas', null, null]) &&
    areas.mqaEstado().seleccionado === null,
    JSON.stringify(navegaciones));

  // Integración con la SPA y ausencia de rutas nuevas / modales.
  const htmlIndex = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const srcApp = fs.readFileSync(path.join(RAIZ, 'js', 'app.js'), 'utf8');
  const srcModals = fs.readFileSync(path.join(RAIZ, 'js', 'modals.js'), 'utf8');
  const srcAreasFuente = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'areas.js'), 'utf8');
  const srcState = fs.readFileSync(path.join(RAIZ, 'js', 'state.js'), 'utf8');
  check('X12', 'sin ruta nueva en el sidebar; sub-vista integrada en state/app/modals',
    noContiene(htmlIndex, 'nav-areas-maquinas') &&
    noContiene(htmlIndex, "navigateTo('areas', null, 'maquinas')") &&
    noContiene(srcModals, 'openAreaMaquinasCatalogo') &&
    noContiene(srcAreasFuente, 'openAreaMaquinasCatalogo') &&
    contiene(srcModals, 'return areaAbrirFicha(areaId)') &&
    contiene(srcAreasFuente, "function areaAbrirMaquinas()") && contiene(srcAreasFuente, 'openAreaMaquinas();') &&
    contiene(srcState, 'let areaSubVista = null') &&
    contiene(srcApp, 'subVista = null') &&
    contiene(srcApp, "areaSubVista === 'maquinas'") &&
    contiene(srcApp, "case 'areas':"), 'integración SPA completa');

  // --- OP: mantenciones operativas (C2E-4E4 / F2, solo el SERVICE) -------
  // Lectura por elemento, merge de anulaciones, registro y anulación SOLO
  // por RPC, caché aislada e históricos intactos. Nada de interfaz (F3+).
  const opsCaldera = await svc.getMantencionesOperativasPorElemento('cat-MAQUINAS-1');
  check('OP1', 'operativas: lectura por elemento (filtrado .eq en Supabase, fecha DESC)',
    opsCaldera.length === 2 &&
    opsCaldera.every(o => o.elemento_id === 'cat-MAQUINAS-1') &&
    opsCaldera[0].id === 'op-1' && opsCaldera[1].id === 'op-2' &&
    noContiene(JSON.stringify(opsCaldera), 'op-3'),
    `ids=${opsCaldera.map(o => o.id).join(',')}`);

  check('OP2', 'operativas: anulación mergeada en una sola consulta por lote (sin N+1)',
    opsCaldera[0].anulada === false && opsCaldera[0].anulacion === null &&
    opsCaldera[1].anulada === true &&
    opsCaldera[1].anulacion.motivo === 'Captura duplicada' &&
    opsCaldera[1].anulacion.autor_nombre_snapshot === 'Admin Permanente Stub' &&
    typeof opsCaldera[1].anulacion.created_at === 'string' &&
    typeof opsCaldera[1].anulacion.id === 'string',
    JSON.stringify(opsCaldera.map(o => ({ id: o.id, anulada: o.anulada }))));

  const opsCache = svc._operativasPorElementoCache['cat-MAQUINAS-1'];
  const opsSegunda = await svc.getMantencionesOperativasPorElemento('cat-MAQUINAS-1');
  check('OP3', 'operativas: caché AISLADA por elemento (misma referencia al releer)',
    opsSegunda === opsCache && opsSegunda.length === 2 &&
    svc._operativasPorElementoCache['cat-LUGAR-1'] === undefined,
    'caché por clave de elemento');

  const opsForce = await svc.getMantencionesOperativasPorElemento('cat-MAQUINAS-1', true);
  check('OP4', 'operativas: force = true relee Supabase y repuebla la caché',
    opsForce !== opsCache && opsForce.length === 2 &&
    svc._operativasPorElementoCache['cat-MAQUINAS-1'] === opsForce,
    'relectura confirmada');

  const erroresOp = {};
  await svc.registrarMantencionOperativa({ fechaRealizacion: '2026-01-01', responsableTexto: 'T', detalleTrabajo: 'D' }).catch(e => { erroresOp.elemento = e.codigo; });
  await svc.registrarMantencionOperativa({ elementoId: 'cat-MAQUINAS-1', responsableTexto: 'T', detalleTrabajo: 'D' }).catch(e => { erroresOp.fecha = e.codigo; });
  await svc.registrarMantencionOperativa({ elementoId: 'cat-MAQUINAS-1', fechaRealizacion: '2026-01-01', detalleTrabajo: 'D' }).catch(e => { erroresOp.responsable = e.codigo; });
  await svc.registrarMantencionOperativa({ elementoId: 'cat-MAQUINAS-1', fechaRealizacion: '2026-01-01', responsableTexto: 'T' }).catch(e => { erroresOp.detalle = e.codigo; });
  await svc.anularMantencionOperativa({ motivo: 'x' }).catch(e => { erroresOp.registro = e.codigo; });
  await svc.anularMantencionOperativa({ mantencionId: 'op-1' }).catch(e => { erroresOp.motivo = e.codigo; });
  check('OP5', 'operativas: validaciones locales (los 3 campos + motivo) SIN llamar a la RPC',
    erroresOp.elemento === 'ELEMENTO_REQUERIDO' && erroresOp.fecha === 'FECHA_REQUERIDA' &&
    erroresOp.responsable === 'RESPONSABLE_REQUERIDO' && erroresOp.detalle === 'DETALLE_REQUERIDO' &&
    erroresOp.registro === 'REGISTRO_REQUERIDO' && erroresOp.motivo === 'MOTIVO_REQUERIDO' &&
    rpcPermitidas.length === 0,
    `${JSON.stringify(erroresOp)} rpc=${rpcPermitidas.length}`);

  const respRegistro = await svc.registrarMantencionOperativa({
    elementoId: 'cat-MAQUINAS-1',
    fechaRealizacion: '2026-02-01',
    responsableTexto: 'Técnico Nuevo',
    detalleTrabajo: 'Cambio de filtro de gas'
  });
  const llamadaReg = rpcPermitidas[0];
  check('OP6', 'operativas: registro SOLO por RPC con los 4 parámetros del trabajo (sin autoría)',
    respRegistro && respRegistro.ok === true && respRegistro.mantencion_id === 'op-4' &&
    typeof respRegistro.created_at === 'string' &&
    llamadaReg.nombre === 'mantencion_registrar_mantencion' &&
    JSON.stringify(Object.keys(llamadaReg.params).sort()) ===
      JSON.stringify(['p_detalle_trabajo', 'p_elemento_id', 'p_fecha_realizacion', 'p_responsable_texto']) &&
    llamadaReg.params.p_elemento_id === 'cat-MAQUINAS-1',
    `resp=${JSON.stringify(respRegistro)} params=${JSON.stringify(llamadaReg.params)}`);

  check('OP7', 'operativas: invalida SOLO la caché del elemento registrado',
    !svc._operativasPorElementoCache['cat-MAQUINAS-1'], 'caché de cat-MAQUINAS-1 vaciada');

  const opsTrasRegistro = await svc.getMantencionesOperativasPorElemento('cat-MAQUINAS-1');
  check('OP8', 'operativas: la relectura posterior ya muestra el registro nuevo',
    opsTrasRegistro.length === 3 && opsTrasRegistro[0].id === 'op-4' &&
    opsTrasRegistro[0].detalle_trabajo === 'Cambio de filtro de gas' &&
    opsTrasRegistro[0].autor_nombre_snapshot === 'Usuario Stub' &&
    opsTrasRegistro[0].anulada === false,
    `ids=${opsTrasRegistro.map(o => o.id).join(',')}`);

  const respAnul = await svc.anularMantencionOperativa({ mantencionId: 'op-1', motivo: 'Registro de prueba' });
  const llamadaAnul = rpcPermitidas[1];
  check('OP9', 'operativas: anulación SOLO por RPC (2 parámetros) e invalidación global operativa',
    respAnul && respAnul.ok === true && respAnul.mantencion_id === 'op-1' &&
    typeof respAnul.anulacion_id === 'string' &&
    llamadaAnul.nombre === 'mantencion_anular_mantencion' &&
    JSON.stringify(Object.keys(llamadaAnul.params).sort()) ===
      JSON.stringify(['p_mantencion_id', 'p_motivo']) &&
    Object.keys(svc._operativasPorElementoCache).length === 0,
    `params=${JSON.stringify(llamadaAnul.params)}`);

  const opsTrasAnul = await svc.getMantencionesOperativasPorElemento('cat-MAQUINAS-1');
  const op1TrasAnul = opsTrasAnul.find(o => o.id === 'op-1');
  check('OP10', 'operativas: tras anular, el registro se conserva COMPLETO con motivo, autor y fecha',
    opsTrasAnul.length === 3 && op1TrasAnul.anulada === true &&
    op1TrasAnul.anulacion.motivo === 'Registro de prueba' &&
    op1TrasAnul.anulacion.autor_nombre_snapshot === 'Admin Permanente Stub' &&
    typeof op1TrasAnul.anulacion.created_at === 'string' &&
    op1TrasAnul.detalle_trabajo === 'Revisión de bomba de circulación' &&
    op1TrasAnul.responsable_texto === 'Técnico Operativo',
    JSON.stringify({ anulada: op1TrasAnul.anulada, motivo: op1TrasAnul.anulacion && op1TrasAnul.anulacion.motivo }));

  const dobleAnul = await svc.anularMantencionOperativa({ mantencionId: 'op-1', motivo: 'Duplicado' }).catch(e => e);
  // C2E-4E4 / F3 — revisión del token: el BACKEND REAL de esta RPC devuelve
  // MANTENCION_YA_ANULADA (no REGISTRO_YA_ANULADO, que corresponde a la RPC
  // del historial mantencion_anular_historial). El servicio NO hardcodea
  // tokens: guiaExtraerCodigoErrorRPC() los extrae del mensaje, por lo que
  // la corrección es SOLO del fixture/assertion del harness.
  check('OP11', 'operativas: la doble anulación la decide el BACKEND (token real MANTENCION_YA_ANULADA)',
    dobleAnul && dobleAnul.codigo === 'MANTENCION_YA_ANULADA',
    `codigo=${dobleAnul && dobleAnul.codigo}`);

  check('OP12', 'operativas: aislamiento total de los históricos importados',
    (await svc.getMantenciones()).length === 275 &&
    (await svc.getElementosGenerales()).length === 66 &&
    (await svc.getMantencionesGenerales()).length === 64 &&
    (await svc.getMantencionesMaquinas()).length === 110 &&
    db.mantenciones.length === 275 && db.mantenciones_operativas.length === 4,
    `mantenciones=${db.mantenciones.length}, operativas=${db.mantenciones_operativas.length}`);

  check('OP13', 'operativas: SOLO se usaron las dos RPC permitidas (nada de escritura directa)',
    rpcPermitidas.length === 3 &&
    rpcPermitidas.every(l => RPC_PERMITIDAS_F2.indexOf(l.nombre) !== -1) &&
    escrituras.length === 0,
    `rpc=${rpcPermitidas.map(l => l.nombre).join(',')} escrituras=${escrituras.length}`);

  // --- UI: componentes del historial operativo (C2E-4E4 / F3) ------------
  // Renderizadores PUROS: cero escrituras, cero integración en fichas
  // (esa conexión es de F4/F5).
  const opVigente = {
    id: 'op-ui-1', elemento_id: 'cat-MAQUINAS-1',
    fecha_realizacion: '2025-05-10',
    responsable_texto: 'Técnico Operativo',
    detalle_trabajo: 'Revisión de bomba de circulación',
    registrado_por: 'uuid-usuario-stub',
    autor_nombre_snapshot: 'Usuario Stub',
    created_at: '2025-05-10T15:30:00+00:00',
    anulada: false, anulacion: null
  };
  const opAnulada = {
    id: 'op-ui-2', elemento_id: 'cat-MAQUINAS-1',
    fecha_realizacion: null,
    responsable_texto: 'Técnico Operativo',
    detalle_trabajo: 'Registro anulado por error de captura',
    registrado_por: 'uuid-usuario-stub',
    autor_nombre_snapshot: 'Usuario Stub',
    created_at: '2025-03-02T09:00:00+00:00',
    anulada: true,
    anulacion: {
      id: 'ano-ui-1', mantencion_id: 'op-ui-2',
      motivo: 'Captura duplicada',
      anulado_por: 'uuid-admin-permanente-stub',
      autor_nombre_snapshot: 'Admin Permanente Stub',
      created_at: '2025-03-03T11:00:00+00:00'
    }
  };

  const htmlBloqueVacio = mnt.mntBloqueOperativasHTML([]);
  check('UI1', 'operativas UI: bloque vacío SIEMPRE visible (listo para registrar en F4)',
    contiene(htmlBloqueVacio, 'Historial del sistema') &&
    contiene(htmlBloqueVacio, 'Todavía no hay mantenciones registradas desde el sistema.') &&
    noContiene(htmlBloqueVacio, '<ul'),
    'estado vacío renderizado');

  const htmlVigente = mnt.mntBloqueOperativasHTML([opVigente]);
  check('UI2', 'operativas UI: vigente con fecha (DATE sin desplazamiento), responsable, detalle, autor y registro',
    contiene(htmlVigente, '10/05/2025') && noContiene(htmlVigente, '09/05/2025') &&
    contiene(htmlVigente, 'Responsable: Técnico Operativo') &&
    contiene(htmlVigente, 'Detalle: Revisión de bomba de circulación') &&
    contiene(htmlVigente, 'Registrada por: Usuario Stub') &&
    contiene(htmlVigente, 'Registrada en el sistema') &&
    noContiene(htmlVigente, 'ANULADA') && noContiene(htmlVigente, 'Motivo:'),
    'tarjeta vigente');

  const htmlAnulada = mnt.mntBloqueOperativasHTML([opAnulada]);
  check('UI3', 'operativas UI: anulada conserva TODO el contenido y agrega chip + motivo + autor + fecha',
    contiene(htmlAnulada, 'ANULADA') &&
    contiene(htmlAnulada, 'Registro anulado por error de captura') &&
    contiene(htmlAnulada, 'Responsable: Técnico Operativo') &&
    contiene(htmlAnulada, 'Motivo: Captura duplicada') &&
    contiene(htmlAnulada, 'Anulado por: Admin Permanente Stub') &&
    contiene(htmlAnulada, 'Fecha de anulación:') &&
    contiene(htmlAnulada, 'Sin fecha registrada') &&
    noContiene(htmlAnulada, 'uuid-'),
    'tarjeta anulada (sin UUID)');

  const htmlVarios = mnt.mntBloqueOperativasHTML([opVigente, opAnulada]);
  check('UI4', 'operativas UI: varias mantenciones con contador derivado (2 registros · 1 anulada)',
    contiene(htmlVarios, '2 registros · 1 anulada') &&
    (htmlVarios.match(/Registrada en el sistema/g) || []).length === 2 &&
    (htmlVarios.match(/>ANULADA</g) || []).length === 1,
    'lista multi-registro');

  const htmlNulos = mnt.mntTarjetaOperativaHTML({
    id: 'op-ui-3', elemento_id: 'cat-LUGAR-1',
    fecha_realizacion: null, responsable_texto: null, detalle_trabajo: null,
    registrado_por: null, autor_nombre_snapshot: null, created_at: null,
    anulada: false, anulacion: null
  });
  check('UI5', 'operativas UI: NULL → textos neutros (nunca 0 ni datos inventados)',
    contiene(htmlNulos, 'Sin fecha registrada') &&
    contiene(htmlNulos, 'Sin responsable registrado') &&
    contiene(htmlNulos, 'Sin detalle registrado') &&
    contiene(htmlNulos, 'Autor no registrado') &&
    contiene(htmlNulos, 'Fecha no registrada') &&
    noContiene(htmlNulos, '>0<'),
    'nulos neutros');

  const htmlXss = mnt.mntBloqueOperativasHTML([{
    id: 'op-ui-4', elemento_id: 'cat-MAQUINAS-1',
    fecha_realizacion: '2025-01-01',
    responsable_texto: '<img src=x onerror=alert(1)>',
    detalle_trabajo: 'Línea 1\nLínea 2"><script>alert("x")</script>',
    autor_nombre_snapshot: "O'Neil & <b>Compañía</b>",
    created_at: '2025-01-01T10:00:00+00:00',
    anulada: true,
    anulacion: {
      id: 'ano-ui-2', mantencion_id: 'op-ui-4',
      motivo: '</div><script>x</script>', anulado_por: 'uuid-x',
      autor_nombre_snapshot: 'Admin <script>', created_at: '2025-01-02T10:00:00+00:00'
    }
  }]);
  check('UI6', 'operativas UI: escape HTML de todo texto de BD (sin inyección)',
    noContiene(htmlXss, '<img') && noContiene(htmlXss, '<script>') &&
    noContiene(htmlXss, '</div><script') && noContiene(htmlXss, '<b>') &&
    contiene(htmlXss, '&lt;img src=x onerror=alert(1)&gt;') &&
    contiene(htmlXss, '&lt;script&gt;') &&
    contiene(htmlXss, 'O&#39;Neil &amp;'),
    'todo escapado');

  check('UI7', 'operativas UI: saltos de línea del detalle preservados con CSS (sin <br> no confiable)',
    contiene(htmlXss, 'whitespace-pre-line') &&
    contiene(htmlXss, 'Línea 1\nLínea 2') &&
    noContiene(htmlXss, '<br'),
    'nuevas líneas por CSS');

  const opsLugar = await svc.getMantencionesOperativasPorElemento('cat-LUGAR-1');
  const htmlBloqueLugar = mnt.mntBloqueOperativasHTML(opsLugar);
  check('UI8', 'operativas UI: el bloque renderiza la lectura REAL del service (1 vigente)',
    opsLugar.length === 1 && opsLugar[0].id === 'op-3' &&
    contiene(htmlBloqueLugar, 'Pintura de pasillo') &&
    contiene(htmlBloqueLugar, 'Técnico Lugar Op') &&
    contiene(htmlBloqueLugar, '1 registro') &&
    noContiene(htmlBloqueLugar, 'ANULADA'),
    `ids=${opsLugar.map(o => o.id).join(',')}`);

  const htmlFichaSinIntegrar = mnt.mntFichaElementoHTML(detalleCaldera, []);
  const htmlHistorialImportado = mnt.mntHistorialElementoHTML(detalleCaldera.mantenciones);
  check('UI9', 'operativas UI: aún NO integrado en fichas; el historial importado queda intacto',
    noContiene(htmlFichaSinIntegrar, 'Historial del sistema') &&
    noContiene(htmlFichaSinIntegrar, 'Registrada en el sistema') &&
    contiene(htmlHistorialImportado, 'Revisión de máquina 1, turno 1') &&
    (htmlHistorialImportado.match(/rounded-2xl p-4/g) || []).length === 3,
    `tarjetas importadas=${(htmlHistorialImportado.match(/rounded-2xl p-4/g) || []).length}`);

  // --- F4: integración del historial operativo + registro (Catálogo) ------
  // Nueva INSTANCIA de la vista con mini-DOM para probar la integración de
  // la ficha, el modal de registro y el repintado, sin tocar los 70 checks
  // previos. La seguridad del harness sigue intacta: la lista
  // RPC_PERMITIDAS_F2 y la detección de escrituras directas NO se tocaron.
  const mntF4 = cargarVista(db, true);
  const docF4 = mntF4._doc;
  mntF4._window.MantencionesService = svc;   // en el navegador es global
  mntF4._window.esAdminOperativoActual = () => true;
  mntF4.mntSetElementosBase(
    db.elementos_mantenibles.filter(e => e.archivo_origen === ARCHIVO_CAT && e.hoja_origen !== 'MAQUINAS')
  );
  mntF4.mntSetElementoSeleccionado('cat-LUGAR-1');

  // W1: la ficha del Catálogo emite el bloque del sistema ANTES del
  // historial importado, con los datos REALES del service (op-3 vigente).
  const opsLugarF4 = await svc.getMantencionesOperativasPorElemento('cat-LUGAR-1', true);
  const detalleLugarF4 = await svc.getElementoDetalle('cat-LUGAR-1');
  const fichaIntegrada = mntF4.mntFichaElementoHTML(detalleLugarF4, [], opsLugarF4);
  check('W1', 'F4: ficha del Catálogo con «Historial del sistema» ANTES del importado y datos reales',
    contiene(fichaIntegrada, 'Historial del sistema') &&
    fichaIntegrada.indexOf('Historial del sistema') < fichaIntegrada.indexOf('Historial de mantenciones') &&
    contiene(fichaIntegrada, '1 registro') &&
    contiene(fichaIntegrada, 'Pintura de pasillo') &&
    contiene(fichaIntegrada, 'Responsable: Técnico Lugar Op') &&
    contiene(fichaIntegrada, 'Registrada en el sistema') &&
    contiene(fichaIntegrada, 'Registrada por: Usuario Stub') &&
    noContiene(fichaIntegrada, 'ANULADA') &&
    contiene(fichaIntegrada, 'Historial de mantenciones'),
    `ops=${opsLugarF4.length}`);

  // W2: Máquinas sigue SIN integrar (operativas = null ⇒ sin bloque), y el
  // historial importado de esa ficha no cambia.
  const fichaMaquinasSinOp = mntF4.mntFichaElementoHTML(detalleCaldera, []);
  check('W2', 'F4: con operativas = null (Máquinas) NO se emite el bloque; sin cambios respecto de F3',
    noContiene(fichaMaquinasSinOp, 'Historial del sistema') &&
    noContiene(fichaMaquinasSinOp, 'Registrar mantención') &&
    contiene(fichaMaquinasSinOp, 'Historial de mantenciones'),
    'bloque ausente');

  // W3: bloque habilitado pero VACÍO ([] ⇒ integración activa sin filas),
  // con el botón visible para un administrador operativo vigente.
  const htmlVacioConBoton = mntF4.mntBloqueOperativasHTML([], { conBotonRegistro: true, elementoId: 'cat-LUGAR-1' });
  check('W3', 'F4: bloque vacío habilitado muestra el estado vacío Y el botón «Registrar mantención»',
    contiene(htmlVacioConBoton, 'Historial del sistema') &&
    contiene(htmlVacioConBoton, 'Todavía no hay mantenciones registradas desde el sistema.') &&
    contiene(htmlVacioConBoton, 'Registrar mantención') &&
    contiene(htmlVacioConBoton, "abrirModalRegistrarMantencion('cat-LUGAR-1')") &&
    noContiene(htmlVacioConBoton, '<ul'),
    'vacío + botón');

  // W4: permisos VISUALES. Sin administración operativa vigente, o sin el
  // helper (contexto no cargado), NO se emite el botón. El historial
  // consultable se mantiene igual para todos.
  mntF4._window.esAdminOperativoActual = () => false;
  const htmlSinPermiso = mntF4.mntBloqueOperativasHTML([], { conBotonRegistro: true, elementoId: 'cat-LUGAR-1' });
  delete mntF4._window.esAdminOperativoActual;
  const htmlSinHelper = mntF4.mntBloqueOperativasHTML([], { conBotonRegistro: true, elementoId: 'cat-LUGAR-1' });
  const htmlSinHabilitacion = mntF4.mntBloqueOperativasHTML([], { elementoId: 'cat-LUGAR-1' });
  mntF4._window.esAdminOperativoActual = () => true;
  check('W4', 'F4: el botón exige habilitación de la vista Y admin operativo vigente (UX, no seguridad)',
    noContiene(htmlSinPermiso, 'Registrar mantención') &&
    noContiene(htmlSinHelper, 'Registrar mantención') &&
    noContiene(htmlSinHabilitacion, 'Registrar mantención') &&
    contiene(htmlSinPermiso, 'Todavía no hay mantenciones registradas desde el sistema.'),
    '3 combinaciones sin botón');

  // W5: el modal contiene exactamente los 3 campos obligatorios, el
  // contexto real del elemento (desde mntElementosBase) y NINGÚN campo de
  // autoría ni de fecha de registro (los asigna el backend).
  const elemLugar1 = db.elementos_mantenibles.find(e => e.id === 'cat-LUGAR-1');
  mntF4.abrirModalRegistrarMantencion('cat-LUGAR-1');
  const contenidoModal = docF4.getElementById('mnt-registrar-mantencion-contenido').innerHTML;
  check('W5', 'F4: modal con los 3 campos obligatorios, contexto real y SIN campos de autoría',
    contiene(contenidoModal, 'Registrar mantención') &&
    contiene(contenidoModal, 'type="date"') &&
    contiene(contenidoModal, 'id="mnt-registrar-mantencion-responsable"') &&
    contiene(contenidoModal, 'id="mnt-registrar-mantencion-detalle"') &&
    contiene(contenidoModal, mntF4.mntEsc(String(elemLugar1.nombre_original))) &&
    contiene(contenidoModal, 'El autor y la fecha de registro se asignan automáticamente') &&
    contiene(contenidoModal, 'Cancelar') &&
    noContiene(contenidoModal, 'registrado_por') &&
    noContiene(contenidoModal, 'autor_nombre_snapshot') &&
    noContiene(contenidoModal, 'created_at') &&
    docF4.getElementById('mnt-modal-registrar-mantencion').classList.contains('hidden') === false,
    'modal abierta con formulario');

  // W6: validación local de los 3 campos (trim ANTES de la RPC): mensaje
  // claro por campo faltante y CERO llamadas a la RPC.
  const rpcAntesValidacion = rpcPermitidas.length;
  const mensajesValidacion = [];
  docF4.getElementById('mnt-registrar-mantencion-fecha').value = '';
  docF4.getElementById('mnt-registrar-mantencion-responsable').value = '   ';
  docF4.getElementById('mnt-registrar-mantencion-detalle').value = 'Detalle cargado';
  await mntF4.mntEnviarRegistrarMantencion({ preventDefault() {} });
  mensajesValidacion.push(docF4.getElementById('mnt-registrar-mantencion-error').textContent);
  docF4.getElementById('mnt-registrar-mantencion-fecha').value = '2026-03-15';
  await mntF4.mntEnviarRegistrarMantencion({ preventDefault() {} });
  mensajesValidacion.push(docF4.getElementById('mnt-registrar-mantencion-error').textContent);
  docF4.getElementById('mnt-registrar-mantencion-responsable').value = 'Técnico F4';
  docF4.getElementById('mnt-registrar-mantencion-detalle').value = '';
  await mntF4.mntEnviarRegistrarMantencion({ preventDefault() {} });
  mensajesValidacion.push(docF4.getElementById('mnt-registrar-mantencion-error').textContent);
  check('W6', 'F4: formulario incompleto ⇒ 3 mensajes claros, sin RPC y botón restaurado',
    contiene(mensajesValidacion[0], 'Indica la fecha') &&
    contiene(mensajesValidacion[1], 'Indica quién realizó') &&
    contiene(mensajesValidacion[2], 'Describe el trabajo realizado') &&
    rpcPermitidas.length === rpcAntesValidacion &&
    docF4.getElementById('mnt-registrar-mantencion-submit').disabled === false &&
    docF4.getElementById('mnt-modal-registrar-mantencion').classList.contains('hidden') === false,
    `rpc=${rpcPermitidas.length - rpcAntesValidacion}`);

  // W7: rechazo del backend (servicio rechaza la RPC) ⇒ la modal PERMANECE
  // ABierta con el formulario conservado, el error es visible y NO hay
  // fila nueva: cero falso éxito.
  const registrarReal = mntF4._window.MantencionesService.registrarMantencionOperativa;
  mntF4._window.MantencionesService.registrarMantencionOperativa = () =>
    Promise.reject(new Error('NO_AUTORIZADO: requiere administrador actual.'));
  const dbAntesRechazo = db.mantenciones_operativas.length;
  docF4.getElementById('mnt-registrar-mantencion-detalle').value = 'Registro que debe ser rechazado';
  await mntF4.mntEnviarRegistrarMantencion({ preventDefault() {} });
  const fichaTrasRechazo = docF4.getElementById('mnt-ficha-elemento').innerHTML;
  check('W7', 'F4: rechazo del backend ⇒ error visible, modal abierta, formulario conservado y sin fila nueva',
    contiene(docF4.getElementById('mnt-registrar-mantencion-error').textContent, 'NO_AUTORIZADO') &&
    docF4.getElementById('mnt-modal-registrar-mantencion').classList.contains('hidden') === false &&
    docF4.getElementById('mnt-registrar-mantencion-detalle').value === 'Registro que debe ser rechazado' &&
    docF4.getElementById('mnt-registrar-mantencion-submit').disabled === false &&
    db.mantenciones_operativas.length === dbAntesRechazo &&
    noContiene(fichaTrasRechazo, 'Registro que debe ser rechazado'),
    `filas=${db.mantenciones_operativas.length - dbAntesRechazo}`);
  mntF4._window.MantencionesService.registrarMantencionOperativa = registrarReal;

  // W8: registro exitoso por la ÚNICA vía permitida, con el envío duplicado
  // (doble clic) bloqueado: UNA sola RPC, UNA sola fila, y solo los 4
  // parámetros de negocio (sin autoría ni origen).
  docF4.getElementById('mnt-registrar-mantencion-detalle').value = 'Cambio de sello de la bomba de presión';
  const rpcAntesRegistro = rpcPermitidas.length;
  const dbAntesRegistro = db.mantenciones_operativas.length;
  const envio1 = mntF4.mntEnviarRegistrarMantencion({ preventDefault() {} });
  const envio2 = mntF4.mntEnviarRegistrarMantencion({ preventDefault() {} });
  await envio1;
  await envio2;
  const llamadaRegistroF4 = rpcPermitidas[rpcPermitidas.length - 1];
  check('W8', 'F4: registro por RPC única con doble envío bloqueado y sin campos de autoría',
    rpcPermitidas.length === rpcAntesRegistro + 1 &&
    db.mantenciones_operativas.length === dbAntesRegistro + 1 &&
    llamadaRegistroF4.nombre === 'mantencion_registrar_mantencion' &&
    JSON.stringify(Object.keys(llamadaRegistroF4.params).sort()) ===
      JSON.stringify(['p_detalle_trabajo', 'p_elemento_id', 'p_fecha_realizacion', 'p_responsable_texto']) &&
    llamadaRegistroF4.params.p_elemento_id === 'cat-LUGAR-1' &&
    llamadaRegistroF4.params.p_fecha_realizacion === '2026-03-15' &&
    llamadaRegistroF4.params.p_responsable_texto === 'Técnico F4' &&
    llamadaRegistroF4.params.p_detalle_trabajo === 'Cambio de sello de la bomba de presión',
    `rpc=${rpcPermitidas.length - rpcAntesRegistro} params=${JSON.stringify(llamadaRegistroF4.params)}`);

  // W9: tras el éxito se cierra la modal y se repinta SOLO la ficha
  // afectada, con el registro nuevo y su auditoría REAL asignada por el
  // "backend" (nunca inventada por la vista).
  const fichaTrasRegistro = docF4.getElementById('mnt-ficha-elemento').innerHTML;
  check('W9', 'F4: la ficha se repinta con el registro nuevo, su auditoría y el historial importado intacto',
    contiene(fichaTrasRegistro, 'Cambio de sello de la bomba de presión') &&
    contiene(fichaTrasRegistro, 'Responsable: Técnico F4') &&
    contiene(fichaTrasRegistro, '15/03/2026') &&
    contiene(fichaTrasRegistro, 'Registrada en el sistema') &&
    contiene(fichaTrasRegistro, 'Registrada por: Usuario Stub') &&
    contiene(fichaTrasRegistro, 'Pintura de pasillo') &&
    contiene(fichaTrasRegistro, 'Historial del sistema') &&
    docF4.getElementById('mnt-modal-registrar-mantencion').classList.contains('hidden') === true,
    'ficha repintada, modal cerrada');

  // W10: guard anti-carrera: si el usuario abrió OTRA ficha mientras la
  // RPC estaba en vuelo, la respuesta NO se pinta sobre ella.
  const fichaAntesCarrera = docF4.getElementById('mnt-ficha-elemento').innerHTML;
  mntF4.mntSetElementoSeleccionado('cat-RADIADORES-1');
  await mntF4.mntRepintarFichaOperativa('cat-LUGAR-1');
  check('W10', 'F4: la respuesta de una ficha anterior NO sobreescribe la ficha abierta',
    docF4.getElementById('mnt-ficha-elemento').innerHTML === fichaAntesCarrera,
    'sin sobrescritura');
  mntF4.mntSetElementoSeleccionado('cat-LUGAR-1');

  // W11: las anuladas del backend siguen mostrándose dentro del bloque del
  // sistema con TODO su contenido y su auditoría de anulación.
  const opsMaqConAnuladas = await svc.getMantencionesOperativasPorElemento('cat-MAQUINAS-1', true);
  const fichaConAnuladas = mntF4.mntFichaElementoHTML(detalleCaldera, [], opsMaqConAnuladas);
  check('W11', 'F4: anuladas visibles en la ficha con chip, motivo, autor y fecha de anulación (sin UUID)',
    contiene(fichaConAnuladas, '3 registros · 2 anuladas') &&
    contiene(fichaConAnuladas, 'ANULADA') &&
    contiene(fichaConAnuladas, 'Motivo: Registro de prueba') &&
    contiene(fichaConAnuladas, 'Motivo: Captura duplicada') &&
    contiene(fichaConAnuladas, 'Anulado por: Admin Permanente Stub') &&
    contiene(fichaConAnuladas, 'Fecha de anulación:') &&
    noContiene(fichaConAnuladas, 'uuid-') &&
    contiene(fichaConAnuladas, 'Revisión de máquina 1, turno 1'),
    `ops=${opsMaqConAnuladas.length}`);

  // W12: aislamiento total. Los históricos importados, sus contadores y el
  // estado operativo del elemento NO cambian por registrar desde F4.
  check('W12', 'F4: histórico de Excel, contadores y estado operativo intactos tras los registros',
    (await svc.getMantenciones()).length === 275 &&
    (await svc.getElementosGenerales()).length === 66 &&
    (await svc.getMantencionesGenerales()).length === 64 &&
    (await svc.getMantencionesMaquinas()).length === 110 &&
    db.mantenciones.length === 275 &&
    db.mantenciones_operativas.length === 5 &&
    // 2 = 1 del fixture (ano-1 sobre op-2) + 1 del bloque OP (ano-2 sobre
    // op-1). F4 no debe haber creado NINGUNA anulación.
    db.mantenciones_operativas_anulaciones.length === 2 &&
    elemLugar1.estado_operativo_actual === null,
    JSON.stringify({
      mantTotal: (await svc.getMantenciones()).length,
      elemsCat: (await svc.getElementosGenerales()).length,
      mantCat: (await svc.getMantencionesGenerales()).length,
      mantMaq: (await svc.getMantencionesMaquinas()).length,
      operativas: db.mantenciones_operativas.length,
      anulaciones: db.mantenciones_operativas_anulaciones.length,
      estadoOp: elemLugar1.estado_operativo_actual
    }));

  // --- F5: anulación de mantenciones operativas (Catálogo General) --------
  // Misma instancia con mini-DOM de F4. El backend simulado sigue tras la
  // lista RPC_PERMITIDAS_F2 y la detección de escrituras directas NO se
  // tocó: F5 solo agrega la segunda RPC ya permitida.
  mntF4._window.esAdminPermanenteActual = () => true;

  // V1: el botón existe SOLO en tarjetas VIGENTES; una anulada nunca lo
  // vuelve a ofrecer.
  const opsLugarF5 = await svc.getMantencionesOperativasPorElemento('cat-LUGAR-1', true);
  const opVigenteF5 = opsLugarF5.find(o => o.anulada !== true);
  const opsMaqF5 = await svc.getMantencionesOperativasPorElemento('cat-MAQUINAS-1', true);
  const opAnuladaF5 = opsMaqF5.find(o => o.anulada === true);
  const tarjVigenteF5 = mntF4.mntTarjetaOperativaHTML(opVigenteF5, { conBotonAnulacion: true });
  const tarjAnuladaF5 = mntF4.mntTarjetaOperativaHTML(opAnuladaF5, { conBotonAnulacion: true });
  check('V1', 'F5: «Anular mantención» SOLO en tarjetas vigentes (una anulada nunca lo ofrece)',
    contiene(tarjVigenteF5, 'Anular mantención') &&
    contiene(tarjVigenteF5, `abrirModalAnularMantencion('${opVigenteF5.id}')`) &&
    noContiene(tarjAnuladaF5, 'Anular mantención') &&
    noContiene(tarjAnuladaF5, 'abrirModalAnularMantencion'),
    `vigente=${opVigenteF5.id} anulada=${opAnuladaF5.id}`);

  // V2: permisos VISUALES. Un administrador TEMPORAL (o un usuario sin
  // helper) puede registrar pero NO anular; sin habilitación de la vista
  // (tarjeta aislada, como en F3 o en Máquinas) tampoco se emite.
  mntF4._window.esAdminPermanenteActual = () => false;
  const tarjSinPermisoF5 = mntF4.mntTarjetaOperativaHTML(opVigenteF5, { conBotonAnulacion: true });
  delete mntF4._window.esAdminPermanenteActual;
  const tarjSinHelperF5 = mntF4.mntTarjetaOperativaHTML(opVigenteF5, { conBotonAnulacion: true });
  const tarjSinHabilitacionF5 = mntF4.mntTarjetaOperativaHTML(opVigenteF5, {});
  const tarjSoloRegistroF5 = mntF4.mntTarjetaOperativaHTML(opVigenteF5, { conBotonRegistro: true });
  mntF4._window.esAdminPermanenteActual = () => true;
  check('V2', 'F5: el botón exige admin PERMANENTE vigente + habilitación de la vista (temporal: no)',
    noContiene(tarjSinPermisoF5, 'Anular mantención') &&
    noContiene(tarjSinHelperF5, 'Anular mantención') &&
    noContiene(tarjSinHabilitacionF5, 'Anular mantención') &&
    noContiene(tarjSoloRegistroF5, 'Anular mantención'),
    '4 combinaciones sin botón');

  // V3: la ficha real del Catálogo (mini-DOM) pinta las operativas con el
  // botón de anulación en las vigentes, y Máquinas sigue SIN integración
  // F5 (sin bloque, sin ningún botón).
  mntF4.mntSetElementoSeleccionado('cat-LUGAR-1');
  await mntF4.mntCargarFichaElemento('cat-LUGAR-1');
  const fichaF5 = docF4.getElementById('mnt-ficha-elemento').innerHTML;
  const fichaMaquinasF5 = mntF4.mntFichaElementoHTML(detalleCaldera, []);
  check('V3', 'F5: ficha del Catálogo con anulación en las vigentes y Máquinas sin integración F5',
    contiene(fichaF5, 'Historial del sistema') &&
    contiene(fichaF5, '2 registros') &&
    (fichaF5.match(/Anular mantención/g) || []).length === 2 &&
    contiene(fichaF5, 'Pintura de pasillo') &&
    noContiene(fichaMaquinasF5, 'Historial del sistema') &&
    noContiene(fichaMaquinasF5, 'Anular mantención') &&
    noContiene(fichaMaquinasF5, 'Registrar mantención'),
    `botones=${(fichaF5.match(/Anular mantención/g) || []).length}`);

  // V4: modal con el contexto REAL de la ficha, la advertencia de que la
  // anulación CONSERVA el historial, el motivo obligatorio y ningún UUID.
  // Un id que no pertenece a la ficha NO abre nada (defensa en profundidad).
  mntF4.abrirModalAnularMantencion('id-que-no-pertenece-a-la-ficha');
  const contenidoInvalidoF5 = docF4.getElementById('mnt-anular-mantencion-contenido').innerHTML;
  mntF4.abrirModalAnularMantencion(opVigenteF5.id);
  const contenidoAnulF5 = docF4.getElementById('mnt-anular-mantencion-contenido').innerHTML;
  check('V4', 'F5: modal con contexto real, advertencia de conservación, motivo obligatorio y sin UUID',
    contenidoInvalidoF5 === '' &&
    docF4.getElementById('mnt-modal-anular-mantencion').classList.contains('hidden') === false &&
    contiene(contenidoAnulF5, 'Mantención registrada en el sistema') &&
    contiene(contenidoAnulF5, 'Fecha de realización: 15/03/2026') &&
    contiene(contenidoAnulF5, 'Responsable: Técnico F4') &&
    contiene(contenidoAnulF5, 'Detalle: Cambio de sello de la bomba de presión') &&
    contiene(contenidoAnulF5, 'Registrada por: Usuario Stub') &&
    contiene(contenidoAnulF5, 'NO borra ni modifica el registro') &&
    contiene(contenidoAnulF5, 'id="mnt-anular-mantencion-motivo"') &&
    contiene(contenidoAnulF5, 'Cancelar') &&
    contiene(contenidoAnulF5, 'Confirmar anulación') &&
    noContiene(contenidoAnulF5, 'uuid-'),
    'modal de anulación');

  // V5: motivo vacío (con espacios) ⇒ validación local, CERO llamadas.
  const rpcAntesAnulF5 = rpcPermitidas.length;
  docF4.getElementById('mnt-anular-mantencion-motivo').value = '   ';
  await mntF4.mntEnviarAnularMantencion({ preventDefault() {} });
  check('V5', 'F5: motivo vacío ⇒ error local claro, sin RPC y botón restaurado',
    contiene(docF4.getElementById('mnt-anular-mantencion-error').textContent, 'Indica el motivo') &&
    rpcPermitidas.length === rpcAntesAnulF5 &&
    docF4.getElementById('mnt-anular-mantencion-submit').disabled === false &&
    docF4.getElementById('mnt-modal-anular-mantencion').classList.contains('hidden') === false,
    `rpc=${rpcPermitidas.length - rpcAntesAnulF5}`);

  // V6: anulación exitosa por la ÚNICA vía permitida, con el envío
  // duplicado (doble clic) bloqueado: UNA sola RPC con SOLO 2 parámetros.
  docF4.getElementById('mnt-anular-mantencion-motivo').value = 'Registro duplicado en el sistema';
  const rpcAntesDobleF5 = rpcPermitidas.length;
  const anulEnvio1 = mntF4.mntEnviarAnularMantencion({ preventDefault() {} });
  const anulEnvio2 = mntF4.mntEnviarAnularMantencion({ preventDefault() {} });
  await anulEnvio1;
  await anulEnvio2;
  const llamadaAnulF5 = rpcPermitidas[rpcPermitidas.length - 1];
  check('V6', 'F5: anulación por RPC única (2 parámetros, sin autoría) con doble envío bloqueado',
    rpcPermitidas.length === rpcAntesDobleF5 + 1 &&
    llamadaAnulF5.nombre === 'mantencion_anular_mantencion' &&
    JSON.stringify(Object.keys(llamadaAnulF5.params).sort()) ===
      JSON.stringify(['p_mantencion_id', 'p_motivo']) &&
    llamadaAnulF5.params.p_mantencion_id === opVigenteF5.id &&
    llamadaAnulF5.params.p_motivo === 'Registro duplicado en el sistema',
    `rpc=${rpcPermitidas.length - rpcAntesDobleF5} params=${JSON.stringify(llamadaAnulF5.params)}`);

  // V7: tras el éxito la ficha se repinta con el registro CONSERVADO,
  // marcado ANULADA, con motivo/autor/fecha reales y sin poder anularlo
  // otra vez (la otra vigente conserva su botón).
  const fichaTrasAnulF5 = docF4.getElementById('mnt-ficha-elemento').innerHTML;
  check('V7', 'F5: ficha repintada con el registro conservado como ANULADA + auditoría real',
    contiene(fichaTrasAnulF5, 'ANULADA') &&
    contiene(fichaTrasAnulF5, 'Cambio de sello de la bomba de presión') &&
    contiene(fichaTrasAnulF5, 'Responsable: Técnico F4') &&
    contiene(fichaTrasAnulF5, 'Motivo: Registro duplicado en el sistema') &&
    contiene(fichaTrasAnulF5, 'Anulado por: Admin Permanente Stub') &&
    contiene(fichaTrasAnulF5, 'Fecha de anulación:') &&
    (fichaTrasAnulF5.match(/Anular mantención/g) || []).length === 1 &&
    contiene(fichaTrasAnulF5, 'Pintura de pasillo') &&
    noContiene(fichaTrasAnulF5, 'uuid-') &&
    docF4.getElementById('mnt-modal-anular-mantencion').classList.contains('hidden') === true,
    `botones=${(fichaTrasAnulF5.match(/Anular mantención/g) || []).length}`);

  // V8: rechazo del backend ⇒ sin falso éxito, el motivo se CONSERVA y la
  // modal permanece abierta para reintentar.
  const anularRealF5 = mntF4._window.MantencionesService.anularMantencionOperativa;
  mntF4._window.MantencionesService.anularMantencionOperativa = () =>
    Promise.reject(Object.assign(new Error('REGISTRO_NO_ENCONTRADO: no existe la mantención.'), { codigo: 'REGISTRO_NO_ENCONTRADO' }));
  const opRestanteF5 = opsLugarF5.find(o => o.anulada !== true && o.id !== opVigenteF5.id);
  const dbAnulAntesV8 = db.mantenciones_operativas_anulaciones.length;
  mntF4.abrirModalAnularMantencion(opRestanteF5.id);
  docF4.getElementById('mnt-anular-mantencion-motivo').value = 'Motivo que debe conservarse';
  await mntF4.mntEnviarAnularMantencion({ preventDefault() {} });
  check('V8', 'F5: error de RPC ⇒ sin falso éxito, motivo conservado y modal abierta',
    contiene(docF4.getElementById('mnt-anular-mantencion-error').textContent, 'REGISTRO_NO_ENCONTRADO') &&
    docF4.getElementById('mnt-anular-mantencion-motivo').value === 'Motivo que debe conservarse' &&
    docF4.getElementById('mnt-modal-anular-mantencion').classList.contains('hidden') === false &&
    docF4.getElementById('mnt-anular-mantencion-submit').disabled === false &&
    db.mantenciones_operativas_anulaciones.length === dbAnulAntesV8,
    `anulaciones=${db.mantenciones_operativas_anulaciones.length - dbAnulAntesV8}`);

  // V9 — AJUSTE F6 §6 (aplicado también al Catálogo): token REAL de doble
  // anulación de ESTA RPC (MANTENCION_YA_ANULADA, nunca REGISTRO_YA_ANULADO):
  // se CIERRA el formulario obsoleto (ya no sirve), se informa en la propia
  // ficha como aviso transitorio (role="status"), se repinta la ficha y NO
  // se crea ninguna anulación ni se simula éxito.
  mntF4._window.MantencionesService.anularMantencionOperativa = () =>
    Promise.reject(Object.assign(new Error('MANTENCION_YA_ANULADA: la mantención ya fue anulada.'), { codigo: 'MANTENCION_YA_ANULADA' }));
  const dbAnulAntesV9 = db.mantenciones_operativas_anulaciones.length;
  docF4.getElementById('mnt-anular-mantencion-motivo').value = 'Motivo de un registro ya anulado';
  await mntF4.mntEnviarAnularMantencion({ preventDefault() {} });
  const fichaTrasV9 = docF4.getElementById('mnt-ficha-elemento').innerHTML;
  const avisoV9 = (fichaTrasV9.match(/<div role="status"[\s\S]*?<\/div>/) || [])[0] || '';
  check('V9', 'F5+F6: MANTENCION_YA_ANULADA ⇒ formulario cerrado, aviso en la ficha, ficha actualizada y sin anulación nueva',
    docF4.getElementById('mnt-modal-anular-mantencion').classList.contains('hidden') === true &&
    contiene(avisoV9, 'ya fue anulado por otra persona o proceso') &&
    noContiene(avisoV9, 'REGISTRO_YA_ANULADO') &&
    noContiene(fichaTrasV9, 'REGISTRO_YA_ANULADO') &&
    contiene(fichaTrasV9, 'Historial del sistema') &&
    contiene(fichaTrasV9, 'Pintura de pasillo') &&
    db.mantenciones_operativas_anulaciones.length === dbAnulAntesV9,
    `anulaciones=${db.mantenciones_operativas_anulaciones.length - dbAnulAntesV9} | modalHidden=${docF4.getElementById('mnt-modal-anular-mantencion').classList.contains('hidden')} | aviso="${avisoV9.slice(0, 120)}"`);
  mntF4._window.MantencionesService.anularMantencionOperativa = anularRealF5;

  // V10: corrección de F4 — un FALLO de lectura NO es "cero registros": la
  // ficha y el historial de Excel siguen completos, con aviso y reintento.
  const leerRealF5 = mntF4._window.MantencionesService.getMantencionesOperativasPorElemento;
  mntF4._window.MantencionesService.getMantencionesOperativasPorElemento = () =>
    Promise.reject(new Error('Fallo simulado de lectura operativa'));
  await mntF4.mntCargarFichaElemento('cat-LUGAR-1');
  const fichaErrorLecturaF5 = docF4.getElementById('mnt-ficha-elemento').innerHTML;
  check('V10', 'F5: error de lectura ⇒ aviso + reintento con ficha e historial Excel intactos (nunca "0 registros")',
    contiene(fichaErrorLecturaF5, 'No fue posible cargar el historial del sistema') &&
    contiene(fichaErrorLecturaF5, 'Reintentar') &&
    contiene(fichaErrorLecturaF5, 'historial importado de Excel se muestra completo más abajo') &&
    noContiene(fichaErrorLecturaF5, 'Todavía no hay mantenciones registradas desde el sistema.') &&
    noContiene(fichaErrorLecturaF5, 'Anular mantención') &&
    noContiene(fichaErrorLecturaF5, 'Registrar mantención') &&
    // Historial importado de Excel COMPLETO debajo del aviso (LUGAR: fecha y
    // responsable reales; el detalle NULL se omite, nunca se inventa).
    contiene(fichaErrorLecturaF5, 'Historial de mantenciones') &&
    contiene(fichaErrorLecturaF5, '15/02/2024') &&
    contiene(fichaErrorLecturaF5, 'Técnico Lugar') &&
    mntF4.mntOperativaFichaActual(opVigenteF5.id) === null,
    JSON.stringify({
      aviso: fichaErrorLecturaF5.indexOf('No fue posible cargar el historial del sistema') !== -1,
      reintento: fichaErrorLecturaF5.indexOf('Reintentar') !== -1,
      contexto: fichaErrorLecturaF5.indexOf('historial importado de Excel se muestra completo más abajo') !== -1,
      sinVacio: fichaErrorLecturaF5.indexOf('Todavía no hay mantenciones registradas desde el sistema.') === -1,
      sinAnular: fichaErrorLecturaF5.indexOf('Anular mantención') === -1,
      sinRegistrar: fichaErrorLecturaF5.indexOf('Registrar mantención') === -1,
      importado: fichaErrorLecturaF5.indexOf('Historial de mantenciones') !== -1 &&
        fichaErrorLecturaF5.indexOf('Técnico Lugar') !== -1,
      mapVacio: mntF4.mntOperativaFichaActual(opVigenteF5.id) === null,
      largo: fichaErrorLecturaF5.length
    }));
  mntF4._window.MantencionesService.getMantencionesOperativasPorElemento = leerRealF5;
  await mntF4.mntReintentarHistorialOperativo('cat-LUGAR-1');
  const fichaTrasReintentoF5 = docF4.getElementById('mnt-ficha-elemento').innerHTML;
  check('V11', 'F5: el reintento retira el aviso y repuebla el historial operativo',
    noContiene(fichaTrasReintentoF5, 'No fue posible cargar el historial del sistema') &&
    noContiene(fichaTrasReintentoF5, 'Reintentar') &&
    contiene(fichaTrasReintentoF5, 'Historial del sistema') &&
    contiene(fichaTrasReintentoF5, 'ANULADA') &&
    contiene(fichaTrasReintentoF5, 'Pintura de pasillo'),
    'reintento correcto');

  // V12: aislamiento total. Los históricos de Excel, sus KPIs, el estado
  // operativo y la vista de Máquinas no se afectan por F5. La única
  // anulación NUEVA de esta fase es la del V6 (3 en total con fixture y OP).
  const elemLugar1F5 = db.elementos_mantenibles.find(e => e.id === 'cat-LUGAR-1');
  check('V12', 'F5: históricos Excel, KPIs, estado operativo y Máquinas intactos tras la anulación',
    (await svc.getMantenciones()).length === 275 &&
    (await svc.getElementosGenerales()).length === 66 &&
    (await svc.getMantencionesGenerales()).length === 64 &&
    (await svc.getMantencionesMaquinas()).length === 110 &&
    db.mantenciones.length === 275 &&
    db.mantenciones_operativas.length === 5 &&
    db.mantenciones_operativas_anulaciones.length === 3 &&
    elemLugar1F5.estado_operativo_actual === null &&
    noContiene(fichaMaquinasF5, 'Anular mantención') &&
    contiene(fichaMaquinasF5, 'Historial de mantenciones'),
    JSON.stringify({ operativas: db.mantenciones_operativas.length, anulaciones: db.mantenciones_operativas_anulaciones.length }));

  // --- Y: C2E-4E4 / F6 — historial operativo en Mantención de Máquinas ----
  // Instancia COMPARTIDA: la vista de Áreas y la de Mantención usan el MISMO
  // mini-DOM y la MISMA instancia de mantenciones.js (en el navegador ambas
  // cargan como <script> clásicos sobre el mismo document), para probar el
  // aislamiento REAL de contextos entre Catálogo General y Máquinas. La
  // seguridad del harness sigue intacta: lista RPC_PERMITIDAS_F2 y detección
  // de escrituras directas NO se tocaron.
  const mntY = cargarVista(db, true);
  const docY = mntY._doc;
  mntY._window.MantencionesService = svc;      // en el navegador es global
  mntY._window.esAdminOperativoActual = () => true;
  mntY._window.esAdminPermanenteActual = () => true;
  const navY = [];
  const areasY = cargarAreas(db, svc, mntY, 'maquinas', navY, docY);
  mntY.mntSetElementosBase(
    db.elementos_mantenibles.filter(e => e.archivo_origen === ARCHIVO_CAT && e.hoja_origen !== 'MAQUINAS')
  );
  const cargaY = await areasY.mqaCargarCatalogo(true);
  const elemMaqY = db.elementos_mantenibles.find(e => e.id === 'cat-MAQUINAS-1');
  const estadoMaqAntesY = elemMaqY.estado_operativo_actual;

  // Y1: ficha de la máquina con el historial del sistema ANTES del importado,
  // los 3 registros reales de esa máquina (2 anulados) y su histórico de
  // Excel intacto. El contexto de la ficha queda aislado en Máquinas.
  const opsMaqY1 = await svc.getMantencionesOperativasPorElemento('cat-MAQUINAS-1', true);
  await areasY.mqaAbrirFichaEquipo('cat-MAQUINAS-1');
  const cuerpoY1 = docY.getElementById('mqa-cuerpo').innerHTML;
  const ctxY1 = mntY.mntContextoOperativas();
  check('Y1', 'F6: ficha de Máquinas con «Historial del sistema» antes del importado (48/110 y contexto aislado)',
    cargaY.estado === 'listo' && cargaY.equipos.length === 48 && cargaY.mantenciones.length === 110 &&
    cuerpoY1.indexOf('Historial del sistema') !== -1 &&
    cuerpoY1.indexOf('Historial del sistema') < cuerpoY1.indexOf('Historial de mantenciones') &&
    contiene(cuerpoY1, opsMaqY1.length + ' registro') &&
    contiene(cuerpoY1, 'Revisión de bomba de circulación') &&
    contiene(cuerpoY1, 'Cambio de filtro de gas') &&
    contiene(cuerpoY1, 'ANULADA') &&
    contiene(cuerpoY1, 'Registrar mantención') &&
    contiene(cuerpoY1, 'Anular mantención') &&
    contiene(cuerpoY1, '← Volver al catálogo') &&
    contiene(cuerpoY1, 'Origen / trazabilidad') &&
    noContiene(cuerpoY1, 'uuid-') &&
    !!ctxY1 && ctxY1.origen === 'maquinas' && ctxY1.elementoId === 'cat-MAQUINAS-1' &&
    ctxY1.contenedorId === 'mqa-cuerpo' && !!ctxY1.elemento,
    `equipos=${cargaY.equipos.length} mantenciones=${cargaY.mantenciones.length} ops=${opsMaqY1.length} ctx=${ctxY1 ? ctxY1.origen + '/' + ctxY1.elementoId : 'null'}`);

  // Y2: máquina SIN operativas ⇒ el bloque del sistema se muestra VACÍO (no
  // desaparece), con su botón de registro y el histórico de Excel intacto.
  await areasY.mqaAbrirFichaEquipo('cat-MAQUINAS-31');
  const cuerpoVacioY = docY.getElementById('mqa-cuerpo').innerHTML;
  check('Y2', 'F6: máquina SIN operativas ⇒ bloque del sistema vacío visible con «Registrar mantención» e histórico intacto',
    db.mantenciones_operativas.every(o => o.elemento_id !== 'cat-MAQUINAS-31') &&
    contiene(cuerpoVacioY, 'Historial del sistema') &&
    contiene(cuerpoVacioY, 'Todavía no hay mantenciones registradas desde el sistema.') &&
    contiene(cuerpoVacioY, "abrirModalRegistrarMantencion('cat-MAQUINAS-31')") &&
    noContiene(cuerpoVacioY, 'Anular mantención') &&
    contiene(cuerpoVacioY, 'Historial de mantenciones') &&
    contiene(cuerpoVacioY, 'Sin fecha registrada') &&
    mntY.mntContextoOperativas().elementoId === 'cat-MAQUINAS-31',
    'bloque vacío + histórico Excel (2 registros, SIN_FECHA)');

  // Y3: registro DESDE Máquinas por la ÚNICA RPC permitida, con doble envío
  // bloqueado, contexto real del apartado (nunca etiqueta la máquina como
  // "Elemento del catálogo") y repintado SOLO de #mqa-cuerpo.
  await areasY.mqaAbrirFichaEquipo('cat-MAQUINAS-1');
  mntY.abrirModalRegistrarMantencion('cat-MAQUINAS-1');
  const contenidoRegY = docY.getElementById('mnt-registrar-mantencion-contenido').innerHTML;
  docY.getElementById('mnt-registrar-mantencion-fecha').value = '2026-05-12';
  docY.getElementById('mnt-registrar-mantencion-responsable').value = 'Técnico Máquinas';
  docY.getElementById('mnt-registrar-mantencion-detalle').value = 'Revisión de válvula de seguridad';
  const rpcAntesY3 = rpcPermitidas.length;
  const envio1Y = mntY.mntEnviarRegistrarMantencion({ preventDefault() {} });
  const envio2Y = mntY.mntEnviarRegistrarMantencion({ preventDefault() {} });
  await envio1Y;
  await envio2Y;
  const cuerpoTrasRegY = docY.getElementById('mqa-cuerpo').innerHTML;
  const fichaCatalogoY = docY.getElementById('mnt-ficha-elemento').innerHTML;
  const nuevaOpY = db.mantenciones_operativas.find(o => o.detalle_trabajo === 'Revisión de válvula de seguridad');
  const llamadaRegY = rpcPermitidas[rpcPermitidas.length - 1];
  check('Y3', 'F6: registro desde Máquinas por RPC única (doble envío bloqueado) repintando SOLO #mqa-cuerpo',
    rpcPermitidas.length === rpcAntesY3 + 1 &&
    llamadaRegY.nombre === 'mantencion_registrar_mantencion' &&
    JSON.stringify(Object.keys(llamadaRegY.params).sort()) ===
      JSON.stringify(['p_detalle_trabajo', 'p_elemento_id', 'p_fecha_realizacion', 'p_responsable_texto']) &&
    llamadaRegY.params.p_elemento_id === 'cat-MAQUINAS-1' &&
    !!nuevaOpY &&
    contiene(contenidoRegY, mntY.mntEsc(String(elemMaqY.nombre_original))) &&
    noContiene(contenidoRegY, 'Elemento del catálogo') &&
    noContiene(contenidoRegY, 'registrado_por') &&
    noContiene(contenidoRegY, 'autor_nombre_snapshot') &&
    docY.getElementById('mnt-modal-registrar-mantencion').classList.contains('hidden') === true &&
    contiene(cuerpoTrasRegY, 'Revisión de válvula de seguridad') &&
    contiene(cuerpoTrasRegY, 'Técnico Máquinas') &&
    contiene(cuerpoTrasRegY, 'Registrada por: Usuario Stub') &&
    contiene(cuerpoTrasRegY, 'Origen / trazabilidad') &&
    fichaCatalogoY === '',
    `rpc=${rpcPermitidas.length - rpcAntesY3} id=${nuevaOpY ? nuevaOpY.id : 'NO'} fichaCatalogo=${fichaCatalogoY.length}`);

  // Y4: permisos VISUALES en Máquinas (mismos gates que en el Catálogo):
  // usuario NORMAL nada; temporal registra pero NO anula; sin helper (sesión
  // sin cargar) nada; permanente ambas. El historial se consulta igual para
  // todos y nunca se oculta por permisos.
  mntY._window.esAdminOperativoActual = () => false;
  mntY._window.esAdminPermanenteActual = () => false;
  const htmlMaqNormal = areasY.mqaFichaHTML();
  mntY._window.esAdminOperativoActual = () => true;
  mntY._window.esAdminPermanenteActual = () => false;
  const htmlMaqTemporal = areasY.mqaFichaHTML();
  delete mntY._window.esAdminOperativoActual;
  delete mntY._window.esAdminPermanenteActual;
  const htmlMaqSinHelper = areasY.mqaFichaHTML();
  mntY._window.esAdminOperativoActual = () => true;
  mntY._window.esAdminPermanenteActual = () => true;
  const htmlMaqPerm = areasY.mqaFichaHTML();
  check('Y4', 'F6: permisos visuales en Máquinas (normal / temporal / sin helper / permanente) sin ocultar historial',
    noContiene(htmlMaqNormal, 'Registrar mantención') && noContiene(htmlMaqNormal, 'Anular mantención') &&
    contiene(htmlMaqTemporal, 'Registrar mantención') && noContiene(htmlMaqTemporal, 'Anular mantención') &&
    noContiene(htmlMaqSinHelper, 'Registrar mantención') && noContiene(htmlMaqSinHelper, 'Anular mantención') &&
    contiene(htmlMaqPerm, 'Registrar mantención') && contiene(htmlMaqPerm, 'Anular mantención') &&
    contiene(htmlMaqSinHelper, 'Historial del sistema') &&
    contiene(htmlMaqSinHelper, 'Historial de mantenciones') &&
    contiene(htmlMaqSinHelper, 'Revisión de válvula de seguridad') &&
    noContiene(htmlMaqSinHelper, 'uuid-'),
    '4 combinaciones con historial visible');

  // Y5: anulación DESDE Máquinas por la ÚNICA RPC (2 parámetros), con el
  // registro CONSERVADO como ANULADA + su auditoría real, y sin tocar el
  // estado operativo del elemento.
  const opsMaqY5 = await svc.getMantencionesOperativasPorElemento('cat-MAQUINAS-1', true);
  const opVigenteY5 = opsMaqY5.find(o => o.anulada !== true);
  mntY.abrirModalAnularMantencion(opVigenteY5.id);
  const contenidoAnulY = docY.getElementById('mnt-anular-mantencion-contenido').innerHTML;
  docY.getElementById('mnt-anular-mantencion-motivo').value = 'Se reparó fuera del sistema';
  const rpcAntesY5 = rpcPermitidas.length;
  await mntY.mntEnviarAnularMantencion({ preventDefault() {} });
  const cuerpoTrasAnulY = docY.getElementById('mqa-cuerpo').innerHTML;
  const llamadaAnulY = rpcPermitidas[rpcPermitidas.length - 1];
  check('Y5', 'F6: anulación desde Máquinas por RPC única (2 parámetros) con registro conservado y estado operativo intacto',
    rpcPermitidas.length === rpcAntesY5 + 1 &&
    llamadaAnulY.nombre === 'mantencion_anular_mantencion' &&
    JSON.stringify(Object.keys(llamadaAnulY.params).sort()) ===
      JSON.stringify(['p_mantencion_id', 'p_motivo']) &&
    llamadaAnulY.params.p_mantencion_id === opVigenteY5.id &&
    llamadaAnulY.params.p_motivo === 'Se reparó fuera del sistema' &&
    db.mantenciones_operativas.length === 6 &&
    !!db.mantenciones_operativas.find(o => o.id === opVigenteY5.id) &&
    contiene(contenidoAnulY, 'Detalle: Revisión de válvula de seguridad') &&
    contiene(contenidoAnulY, 'NO borra ni modifica el registro') &&
    noContiene(contenidoAnulY, 'uuid-') &&
    contiene(cuerpoTrasAnulY, 'ANULADA') &&
    contiene(cuerpoTrasAnulY, 'Revisión de válvula de seguridad') &&
    contiene(cuerpoTrasAnulY, 'Motivo: Se reparó fuera del sistema') &&
    contiene(cuerpoTrasAnulY, 'Anulado por: Admin Permanente Stub') &&
    contiene(cuerpoTrasAnulY, 'Fecha de anulación:') &&
    (cuerpoTrasAnulY.match(/Anular mantención/g) || []).length === 1 &&
    docY.getElementById('mnt-modal-anular-mantencion').classList.contains('hidden') === true &&
    noContiene(cuerpoTrasAnulY, 'uuid-') &&
    elemMaqY.estado_operativo_actual === estadoMaqAntesY,
    `rpc=${rpcPermitidas.length - rpcAntesY5} operativas=${db.mantenciones_operativas.length} botones=${(cuerpoTrasAnulY.match(/Anular mantención/g) || []).length}`);

  // Y6: MANTENCION_YA_ANULADA desde Máquinas por el camino COMPLETO (service
  // → RPC stub, token REAL). Otra persona anuló el registro mientras estaba
  // el formulario ⇒ se cierra el formulario obsoleto, se informa en la ficha,
  // ésta se actualiza y NO se crea ninguna anulación (sin falso éxito).
  const opsMaqY6 = await svc.getMantencionesOperativasPorElemento('cat-MAQUINAS-1', true);
  const opConcurrenteY6 = opsMaqY6.find(o => o.anulada !== true);
  mntY.abrirModalAnularMantencion(opConcurrenteY6.id);
  docY.getElementById('mnt-anular-mantencion-motivo').value = 'Motivo que no debe aplicarse';
  db.mantenciones_operativas_anulaciones.push({
    id: 'ano-concurrente-y6',
    mantencion_id: opConcurrenteY6.id,
    motivo: 'Anulado por otra persona',
    anulado_por: 'uuid-otra-persona',
    autor_nombre_snapshot: 'Otra Persona',
    created_at: '2026-05-12T09:00:00+00:00'
  });
  const anulAntesY6 = db.mantenciones_operativas_anulaciones.length;
  await mntY.mntEnviarAnularMantencion({ preventDefault() {} });
  const cuerpoTrasY6 = docY.getElementById('mqa-cuerpo').innerHTML;
  const avisoY6 = (cuerpoTrasY6.match(/<div role="status"[\s\S]*?<\/div>/) || [])[0] || '';
  check('Y6', 'F6: MANTENCION_YA_ANULADA en Máquinas ⇒ formulario cerrado, aviso en la ficha, ficha actualizada y sin anulación nueva',
    docY.getElementById('mnt-modal-anular-mantencion').classList.contains('hidden') === true &&
    contiene(avisoY6, 'ya fue anulado por otra persona o proceso') &&
    noContiene(avisoY6, 'REGISTRO_YA_ANULADO') &&
    noContiene(cuerpoTrasY6, 'Motivo: Motivo que no debe aplicarse') &&
    contiene(cuerpoTrasY6, 'ANULADA') &&
    contiene(cuerpoTrasY6, 'Motivo: Anulado por otra persona') &&
    contiene(cuerpoTrasY6, 'Anulado por: Otra Persona') &&
    db.mantenciones_operativas_anulaciones.length === anulAntesY6 &&
    contiene(cuerpoTrasY6, 'Historial de mantenciones'),
    `anulaciones=${db.mantenciones_operativas_anulaciones.length - anulAntesY6} aviso=${avisoY6.slice(0, 70)}`);

  // Y7: error de lectura en Máquinas ⇒ el aviso y el Reintentar aparecen
  // DENTRO de #mqa-cuerpo (el reintento despacha por contexto a Máquinas),
  // el histórico de Excel queda completo, el Map queda vacío (sin anulación
  // posible) y el contenedor del Catálogo NO se toca.
  const leerRealY = svc.getMantencionesOperativasPorElemento;
  svc.getMantencionesOperativasPorElemento = () => Promise.reject(new Error('red no disponible'));
  await mntY.mntReintentarHistorialOperativo('cat-MAQUINAS-1');
  const cuerpoErrorY = docY.getElementById('mqa-cuerpo').innerHTML;
  const fichaCatErrorY = docY.getElementById('mnt-ficha-elemento').innerHTML;
  check('Y7', 'F6: error de lectura en Máquinas ⇒ aviso + Reintentar en #mqa-cuerpo, Excel completo, Map vacío y Catálogo intacto',
    contiene(cuerpoErrorY, 'No fue posible cargar el historial del sistema') &&
    contiene(cuerpoErrorY, 'Reintentar') &&
    contiene(cuerpoErrorY, 'Historial de mantenciones') &&
    contiene(cuerpoErrorY, 'Origen / trazabilidad') &&
    contiene(cuerpoErrorY, 'Revisión de máquina 1, turno') &&
    noContiene(cuerpoErrorY, 'Revisión de bomba de circulación') &&
    noContiene(cuerpoErrorY, 'uuid-') &&
    mntY.mntOperativaFichaActual(opVigenteY5.id) === null &&
    fichaCatErrorY === '' &&
    docY.getElementById('mnt-modal-anular-mantencion').classList.contains('hidden') === true,
    `aviso=${contiene(cuerpoErrorY, 'No fue posible cargar el historial del sistema')} mapa=${mntY.mntOperativaFichaActual(opVigenteY5.id) === null}`);

  // Y8: reintento EXITOSO ⇒ se retira el aviso, se repuebla el historial
  // operativo de Máquinas y el contexto sigue siendo el de esta vista.
  svc.getMantencionesOperativasPorElemento = leerRealY;
  await mntY.mntReintentarHistorialOperativo('cat-MAQUINAS-1');
  const cuerpoOkY = docY.getElementById('mqa-cuerpo').innerHTML;
  check('Y8', 'F6: reintento exitoso ⇒ aviso retirado, historial operativo repoblado y contexto de Máquinas vigente',
    noContiene(cuerpoOkY, 'No fue posible cargar el historial del sistema') &&
    noContiene(cuerpoOkY, 'Reintentar') &&
    contiene(cuerpoOkY, 'Historial del sistema') &&
    contiene(cuerpoOkY, 'ANULADA') &&
    contiene(cuerpoOkY, 'Revisión de válvula de seguridad') &&
    !!mntY.mntOperativaFichaActual(opVigenteY5.id) &&
    !!mntY.mntContextoOperativas() && mntY.mntContextoOperativas().origen === 'maquinas',
    `ctx=${mntY.mntContextoOperativas() ? mntY.mntContextoOperativas().origen : 'null'}`);

  // Y9: AISLAMIENTO entre apartados en la MISMA instancia: al pintar la
  // ficha del Catálogo el contexto y el Map pasan a ser del Catálogo; al
  // volver a Máquinas vuelven a ser de Máquinas. Un registro del Catálogo
  // nunca queda disponible en Máquinas ni al revés.
  mntY.mntSetElementoSeleccionado('cat-LUGAR-1');
  await mntY.mntCargarFichaElemento('cat-LUGAR-1');
  const ctxTrasCatalogoY = mntY.mntContextoOperativas();
  const fichaCatY9 = docY.getElementById('mnt-ficha-elemento').innerHTML;
  const opsLugarY9 = await svc.getMantencionesOperativasPorElemento('cat-LUGAR-1', true);
  const opLugarY9 = opsLugarY9[0];
  await areasY.mqaAbrirFichaEquipo('cat-MAQUINAS-1');
  const opsMaqY9 = await svc.getMantencionesOperativasPorElemento('cat-MAQUINAS-1', true);
  const opMaqY9 = opsMaqY9[0];
  check('Y9', 'F6: el contexto y el Map corresponden SIEMPRE a la última ficha pintada (Catálogo ⇄ Máquinas)',
    !!ctxTrasCatalogoY && ctxTrasCatalogoY.origen === 'catalogo' && ctxTrasCatalogoY.elementoId === 'cat-LUGAR-1' &&
    ctxTrasCatalogoY.contenedorId === 'mnt-ficha-elemento' &&
    contiene(fichaCatY9, 'Historial del sistema') &&
    !!mntY.mntContextoOperativas() && mntY.mntContextoOperativas().origen === 'maquinas' &&
    mntY.mntContextoOperativas().elementoId === 'cat-MAQUINAS-1' &&
    mntY.mntContextoOperativas().contenedorId === 'mqa-cuerpo' &&
    mntY.mntOperativaFichaActual(opLugarY9.id) === null &&
    !!mntY.mntOperativaFichaActual(opMaqY9.id) &&
    noContiene(docY.getElementById('mqa-cuerpo').innerHTML, opLugarY9.detalle_trabajo),
    `cat=${ctxTrasCatalogoY ? ctxTrasCatalogoY.origen : 'null'} maq=${mntY.mntContextoOperativas().origen} opLugar=${opLugarY9.id}`);

  // Y10: PROCEDENCIA controlada con los modales compartidos: desde Máquinas
  // no se puede anular un registro del Catálogo ni abrir el registro "para"
  // otro elemento; con el elemento de la ficha activa sí se abre.
  mntY.cerrarModalAnularMantencion();
  mntY.abrirModalAnularMantencion(opLugarY9.id);
  const abrioAnulAjenaY = docY.getElementById('mnt-modal-anular-mantencion').classList.contains('hidden') === false;
  mntY.cerrarModalRegistrarMantencion();
  mntY.abrirModalRegistrarMantencion('cat-LUGAR-1');
  const abrioRegAjenaY = docY.getElementById('mnt-modal-registrar-mantencion').classList.contains('hidden') === false;
  mntY.abrirModalRegistrarMantencion('cat-MAQUINAS-1');
  const abrioRegPropiaY = docY.getElementById('mnt-modal-registrar-mantencion').classList.contains('hidden') === false;
  mntY.cerrarModalRegistrarMantencion();
  check('Y10', 'F6: procedencia — ni anular un registro del Catálogo desde Máquinas ni registrar "para" otro elemento',
    abrioAnulAjenaY === false && abrioRegAjenaY === false && abrioRegPropiaY === true,
    `anulAjena=${abrioAnulAjenaY} regAjena=${abrioRegAjenaY} regPropia=${abrioRegPropiaY}`);

  // Y11: salir de la ficha limpia SU contexto y SU Map (sin tocar el del
  // otro apartado ni la navegación) y conserva los filtros del listado.
  // Con la ficha cerrada ya no se puede abrir ninguna anulación.
  const navAntesY11 = navY.length;
  areasY.mqaSetEstado(undefined, undefined, undefined, { texto: 'caldera', ubicacion: '' });
  areasY.mqaVolverAlListado();
  const opsLugarY11 = await svc.getMantencionesOperativasPorElemento('cat-LUGAR-1', true);
  const opVigenteLugarY11 = opsLugarY11.find(o => o.anulada !== true);
  mntY.cerrarModalAnularMantencion();
  mntY.abrirModalAnularMantencion(opVigenteLugarY11.id);
  const abrioTrasCerrarY = docY.getElementById('mnt-modal-anular-mantencion').classList.contains('hidden') === false;
  const estadoFinalY = areasY.mqaEstado();
  check('Y11', 'F6: al volver se limpia el contexto de Máquinas, se conservan filtros/navegación y no se anula con ficha cerrada',
    estadoFinalY.seleccionado === null &&
    estadoFinalY.filtro.texto === 'caldera' &&
    navY.length === navAntesY11 &&
    mntY.mntContextoOperativas() === null &&
    mntY.mntOperativaFichaActual(opMaqY9.id) === null &&
    abrioTrasCerrarY === false,
    `sel=${estadoFinalY.seleccionado} filtro="${estadoFinalY.filtro.texto}" nav=${navY.length - navAntesY11} ctx=${mntY.mntContextoOperativas() === null} anulo=${abrioTrasCerrarY}`);

  // Y12: SIN DUPLICACIÓN — Máquinas reutiliza los modales, el bloque y los
  // helpers compartidos de mantenciones.js y no define ninguna
  // implementación propia de registro, anulación o reintento.
  check('Y12', 'F6: sin duplicación — Máquinas usa los MISMOS modales y helpers compartidos (cero implementación propia)',
    noContiene(srcAreasFuente, 'function abrirModal') &&
    noContiene(srcAreasFuente, 'function asegurarModal') &&
    noContiene(srcAreasFuente, 'function mntEnviar') &&
    noContiene(srcAreasFuente, 'function mnt') &&
    noContiene(srcAreasFuente, 'function mqaReintentarHistorialOperativo') &&
    noContiene(srcAreasFuente, 'registrarMantencionOperativa(') &&
    noContiene(srcAreasFuente, 'anularMantencionOperativa(') &&
    noContiene(fuentes, 'mqaAbrirFichaEquipo') &&
    contiene(srcAreasFuente, 'mntCargarEstadoOperativasFicha') &&
    contiene(srcAreasFuente, 'mntFijarContextoOperativas') &&
    contiene(cuerpoY1, "abrirModalRegistrarMantencion('cat-MAQUINAS-1')") &&
    contiene(cuerpoY1, 'abrirModalAnularMantencion('),
    'areas.js sin modales/RPC propios');

  // Y13: integridad global tras F6 — catálogo 66/64, máquinas 48/110, los
  // 275 históricos y el estado operativo intactos.
  check('Y13', 'F6: integridad global (66/64 catálogo, 48/110 máquinas, 275 históricos y estado operativo intactos)',
    (await svc.getElementosGenerales()).length === 66 &&
    (await svc.getMantencionesGenerales()).length === 64 &&
    (await svc.getMantencionesMaquinas()).length === 110 &&
    (await svc.getMantenciones()).length === 275 &&
    db.mantenciones.length === 275 &&
    db.elementos_mantenibles.length === db._conteoEsperado.elementosTotal &&
    elemMaqY.estado_operativo_actual === estadoMaqAntesY &&
    db.mantenciones_operativas.length === 6,
    `elem=${db.elementos_mantenibles.length} operativas=${db.mantenciones_operativas.length}`);

  // --- Q: cero escrituras ------------------------------------------------
  // C2E-4E4 / F2: las DOS RPC de mantenciones operativas quedan en la lista
  // PERMITIDA explícita RPC_PERMITIDAS_F2 y se prueban en OP1–OP13 con una
  // respuesta simulada en memoria. Cualquier otra RPC, INSERT, UPDATE,
  // UPSERT o DELETE sigue registrándose en `escrituras` y rompe este test:
  // la detección de escrituras directas NO se desactivó ni se debilitó.
  check('Q', 'cero escrituras (insert/update/delete/upsert/rpc no permitidas)',
    escrituras.length === 0, `escrituras=${JSON.stringify(escrituras)}`);

  // --- Reporte ------------------------------------------------------------
  let fallos = 0;
  console.log('\n======== HARNESS C2E-2/3 + C2E-4C + C2E-4D + C2E-4E4/F2–F6 ========');
  resultados.forEach(r => {
    if (!r.ok) fallos++;
    console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.letra} — ${r.nombre}${r.ok ? '' : '  → ' + r.detalle}`);
  });
  console.log('---------------------------------------------------------');
  console.log(`${resultados.length - fallos}/${resultados.length} PASS`);
  console.log(`Escrituras detectadas: ${escrituras.length}`);
  console.log('=========================================================\n');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(e => { console.error('ERROR EN HARNESS:', e); process.exit(2); });
