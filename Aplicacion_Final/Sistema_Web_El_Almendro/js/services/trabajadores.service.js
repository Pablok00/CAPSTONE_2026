// ==========================================================
// SERVICIO: TRABAJADORES - HOTEL EL ALMENDRO
// ==========================================================
// FASE 5A-3: Service real de Supabase para el módulo Trabajadores.
//
// Patrón técnico: js/services/mejoras.service.js y
// js/services/remodelaciones.service.js.
// Acceso a datos reales vía window.supabaseClient. NO se crea otro
// cliente Supabase.
//
// Tabla real: public.trabajadores
// Columnas: id (uuid), nombre (text NOT NULL), cargo (text NULL), estado (text NOT NULL),
//           observaciones (text NULL), created_at (timestamptz NOT NULL
//           DEFAULT now()), updated_at (timestamptz NOT NULL DEFAULT now()).
//
// Existe trigger trabajadores_set_updated_at (BEFORE UPDATE) que
// actualiza updated_at automáticamente. Por tanto NUNCA se envía
// updated_at desde el frontend.
//
// Seguridad (RLS real): policies trabajadores_select_admin,
// trabajadores_insert_admin y trabajadores_update_admin, todas
// verifican public.es_administrador_actual(). Permisos de
// PostgreSQL para authenticated: SELECT, INSERT y UPDATE.
// NO existe DELETE: la eliminación física está prohibida y este
// service NO expone deleteTrabajador().
//
// Convenciones:
// - Caché interna por método (force = true fuerza recarga).
// - SELECT con columnas explícitas; NUNCA SELECT *.
// - NULL se devuelve tal cual: el service NO convierte NULL en '' ni
//   en cero. Los textos neutros ("Sin observaciones") los agrega la
//   presentación, no el service.
// - Errores: console.error con contexto y re-lanzamiento. NUNCA se
//   devuelven mocks ni se usa localStorage como fallback.
// - Los datos NO se guardan en localStorage (Ley 21.719: minimización
//   y tratamiento responsable de datos personales).
// - Cargo: columna text opcional confirmada para UX-05.
// - Esquema mínimo: NO existen RUT, email, teléfono,
//   dirección ni fecha de ingreso. No agregarlos sin requerimiento.

// Activar solo después de instalar/verificar el SQL y autorizar una prueba real.
const TRABAJADORES_DOCUMENTOS_CUENTAS_ESCRITURA_HABILITADA = true;
const TRABAJADORES_DOCUMENTOS_CUENTAS_ELIMINACION_HABILITADA = true;
let retiroDocumentoCuentaEnCurso = false;
let subidaDocumentoCuentaEnCurso = false;
const CUENTA_DOCUMENTO_LISTADO = 'id,cuenta_id,cuenta_nombre_snapshot,cuenta_rol_snapshot,nombre_original,mime_type_verificado,tamano_bytes_verificado,estado_reserva,created_at';
const CUENTA_DOCUMENTO_COLUMNAS = 'id,cuenta_id,cuenta_nombre_snapshot,cuenta_rol_snapshot,creado_por,creado_por_nombre_snapshot,bucket_id,storage_path,nombre_original,mime_type_verificado,tamano_bytes_verificado,estado_reserva,storage_object_id,storage_version,sha256_verificado,propiedad_institucional,created_at';
const CUENTA_DOCUMENTO_RETIRO = 'retiro:cuentas_documentos_retiros(id,autorizado_hasta,confirmado_en)';
// Ruta derivada únicamente de metadatos autorizados; RLS/guardas validan la asociación real.
function cuentaDocumentoRutaValida(d) {
  const base='cuentas/'+d.cuenta_id+'/'+d.id;
  return d.storage_path===base || d.propiedad_institucional===true &&
    new RegExp('^'+base+'/institucional/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$','i').test(d.storage_path||'');
}
function cuentaDocumentoEstadoEfectivo(doc) {
  const incierto = { estado: 'INCIERTO', retiro: null };
  if (!doc || doc.estado_reserva !== 'disponible' || !Object.prototype.hasOwnProperty.call(doc,'retiro')) return incierto;
  const rows = doc.retiro === null ? [] : Array.isArray(doc.retiro) ? doc.retiro : [doc.retiro];
  if (!rows.length) return { estado: 'DISPONIBLE', retiro: null };
  if (rows.length !== 1) return incierto;
  const r=rows[0];
  if (!r || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.id || '') ||
      !Number.isFinite(Date.parse(r.autorizado_hasta)) || !Object.prototype.hasOwnProperty.call(r,'confirmado_en')) return incierto;
  if (r.confirmado_en === null) return { estado:'RETIRO_PENDIENTE', retiro:r };
  return typeof r.confirmado_en==='string' && Number.isFinite(Date.parse(r.confirmado_en))
    ? { estado:'RETIRADO', retiro:r } : incierto;
}

window.TrabajadoresService = {
  estadoDocumentoCuenta: cuentaDocumentoEstadoEfectivo,
  async revalidarDocumentoCuenta(documentoId, cuentaId = null) {
    const actor=state.currentUser?.id;
    const autorizado=()=>actor && state.currentUser?.id===actor && typeof esAdminOperativoActual==='function' && esAdminOperativoActual();
    if (!autorizado()) throw new Error('Se requiere autorización administrativa vigente.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentoId || '')) throw new Error('Identificador documental inválido.');
    const {data,error}=await window.supabaseClient.from('cuentas_documentos')
      .select(CUENTA_DOCUMENTO_COLUMNAS+','+CUENTA_DOCUMENTO_RETIRO).eq('id',documentoId).single();
    if (error || !data || data.id!==documentoId || !autorizado() || (cuentaId!==null && data.cuenta_id!==cuentaId))
      throw new Error('No fue posible verificar los metadatos y permisos del documento.');
    const efectivo=cuentaDocumentoEstadoEfectivo(data);
    if (efectivo.estado==='INCIERTO') throw new Error('No fue posible verificar el estado del documento. Requiere revisión.');
    return {...data,estado_efectivo:efectivo.estado,retiro_efectivo:efectivo.retiro};
  },
  _trabajadoresCache: null,          // lista completa
  _trabajadoresDetalleCache: {},     // clave: id (uuid)
  _cuentasLectura: null,
  eliminacionDocumentosCuentaHabilitada: TRABAJADORES_DOCUMENTOS_CUENTAS_ELIMINACION_HABILITADA,
  subidaDocumentosCuentaHabilitada: TRABAJADORES_DOCUMENTOS_CUENTAS_ESCRITURA_HABILITADA,
  _documentosCuentaIntentos: new Map(), // Recibos locales; la fila PostgreSQL conserva el UUID durable.

  _vinculosEnCurso: false,
  _intencionesVinculo: new Map(),

  async listarVinculosCuentas() {
    const actor = state.currentUser?.id;
    if (!actor || !esAdminOperativoActual()) throw new Error('VINCULO_NO_AUTORIZADO');
    const { data, error } = await window.supabaseClient.rpc('usuarios_trabajadores_listar_cuentas_v1');
    if (!esAdminOperativoActual() || state.currentUser?.id !== actor) throw new Error('VINCULO_NO_AUTORIZADO');
    if (error) throw error;
    if (!Array.isArray(data) || !data.every(u => u && typeof u.usuario_id === 'string' &&
        // Auth invitado crea primero un perfil sin nombre, rol ni ficha. No es una fila malformada.
        (typeof u.nombre === 'string' || u.nombre === null && u.rol === null && u.trabajador_id === null) &&
        (u.rol === null || typeof u.rol === 'string') && typeof u.cuenta_activa === 'boolean' &&
        (u.trabajador_id === null || typeof u.trabajador_id === 'string'))) throw new Error('VINCULO_LECTURA_INVALIDA');
    return data.map(u => ({
      id: u.usuario_id, nombre: u.nombre, roles: { nombre: u.rol }, estado: u.cuenta_activa,
      trabajador_id: u.trabajador_id, trabajador_nombre: u.trabajador_nombre, trabajador_estado: u.trabajador_estado
    }));
  },

  async gestionarVinculoCuenta(datos) {
    const actor = state.currentUser?.id;
    if (!actor || !esAdminOperativoActual()) throw new Error('VINCULO_NO_AUTORIZADO');
    if (this._vinculosEnCurso) throw new Error('VINCULO_EN_CURSO');
    const { accion, usuarioId, trabajadorId, motivo, nombre, cargo, observaciones } = datos;
    const uuid = valor => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(valor || '');
    const crear = accion === 'CREAR_Y_VINCULAR';
    const limpiar = valor => String(valor ?? '').trim() || null;
    const payload = {
      p_accion: accion, p_usuario_id: usuarioId, p_trabajador_id: crear ? null : trabajadorId ?? null,
      p_motivo: limpiar(motivo), p_nombre_laboral: crear ? limpiar(nombre) : null,
      p_cargo: crear ? limpiar(cargo) : null, p_observaciones: crear ? limpiar(observaciones) : null
    };
    if (!['VINCULAR', 'DESVINCULAR', 'CREAR_Y_VINCULAR'].includes(accion) || !uuid(usuarioId) ||
        (!crear && !uuid(trabajadorId)) || (crear && !payload.p_nombre_laboral)) throw new Error('VINCULO_DATOS_INVALIDOS');
    if (!payload.p_motivo || payload.p_motivo.length < 10 || payload.p_motivo.length > 1000)
      throw new Error('VINCULO_MOTIVO_INVALIDO');

    const clave = JSON.stringify([actor, payload]);
    this._vinculosEnCurso = true;
    let claveSesion = null;
    try {
      let persistido = null;
      try {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clave));
        claveSesion = 'hotel.vinculo.' + Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
        persistido = sessionStorage.getItem(claveSesion);
      } catch (_) { /* La memoria de la página sigue disponible. */ }
      if (!esAdminOperativoActual() || state.currentUser?.id !== actor) throw new Error('VINCULO_NO_AUTORIZADO');
      if (datos.solicitudId != null && (!uuid(datos.solicitudId) ||
          uuid(persistido) && persistido !== datos.solicitudId ||
          this._intencionesVinculo.has(clave) && this._intencionesVinculo.get(clave) !== datos.solicitudId))
        throw Error('SOLICITUD_VINCULO_INCOMPATIBLE');
      const solicitud = datos.solicitudId || this._intencionesVinculo.get(clave) || (uuid(persistido) ? persistido : crypto.randomUUID());
      this._intencionesVinculo.set(clave, solicitud);
      try { if (claveSesion) sessionStorage.setItem(claveSesion, solicitud); } catch (_) { /* Memoria local. */ }
      const limpiarIntencion = () => {
        this._intencionesVinculo.delete(clave);
        try { if (claveSesion) sessionStorage.removeItem(claveSesion); } catch (_) { /* Memoria local. */ }
      };
      const { data, error } = await window.supabaseClient.rpc('usuarios_trabajadores_gestionar_v1', {
        ...payload, p_solicitud_id: solicitud
      });
      if (error) {
        // Una respuesta de error PostgreSQL acredita que la operación se rechazó.
        if (/^(?:22|23|42|P0)[0-9A-Z]{3}$/.test(error.code || '')) limpiarIntencion();
        throw error;
      }
      const fila = Array.isArray(data) && data.length === 1 ? data[0] : data;
      const resultado = typeof fila === 'string' ? fila : fila?.resultado ?? fila?.estado;
      if (!['REGISTRADA', 'YA_REGISTRADA'].includes(resultado)) throw new Error('VINCULO_NO_CONFIRMADO');
      if (datos.devolverDetalle === true && (fila?.usuario_id !== usuarioId ||
          fila.solicitud_id !== solicitud || !uuid(fila.trabajador_id) ||
          !crear && fila.trabajador_id !== trabajadorId || state.currentUser?.id !== actor || !esAdminOperativoActual()))
        throw Error('VINCULO_NO_CONFIRMADO');
      limpiarIntencion();
      this._trabajadoresCache = null;
      this._trabajadoresDetalleCache = {};
      return datos.devolverDetalle === true ? Object.freeze({ resultado, usuario_id: fila.usuario_id,
        trabajador_id: fila.trabajador_id, solicitud_id: fila.solicitud_id }) : resultado;
    } finally {
      this._vinculosEnCurso = false;
    }
  },

  // Flujo administrativo explícito. Dos operaciones, nunca se presenta como
  // transacción única. El ticket conserva la petición ante incertidumbre/recarga.
  solicitudAprobacionLaboral(usuarioId) {
    try {
      const t = JSON.parse(sessionStorage.getItem(`hotel.aprobacion-laboral.${state.currentUser?.id}.${usuarioId}`));
      return t?.version === 1 && t.actor === state.currentUser?.id && t.usuarioId === usuarioId && typeof t.rolId === 'string'
        ? { rolId: t.rolId } : null;
    } catch (_) { return null; }
  },
  async aprobarCuentaConFicha({ usuarioId, rolId, confirmar, continuar = () => true }) {
    this._aprobacionesLaboralesEnCurso ||= new Set();
    if (this._aprobacionesLaboralesEnCurso.has(usuarioId)) throw Error('APROBACION_EN_CURSO');
    this._aprobacionesLaboralesEnCurso.add(usuarioId);
    const actor = state.currentUser?.id;
    const key = `hotel.aprobacion-laboral.${actor}.${usuarioId}`;
    let ticket = null;
    const fallo = mensaje => {
      if (ticket?.fase === 'vinculada' && !mensaje.toLowerCase().includes('ficha'))
        mensaje = 'La ficha está vinculada, pero la aprobación no está confirmada. ' + mensaje;
      const e = Error(mensaje); e.codigo = 'APROBACION_FICHA_REQUIERE_REVISION'; throw e;
    };
    const guardar = () => {
      try { sessionStorage.setItem(key, JSON.stringify(ticket)); }
      catch (_) { fallo('No se pudo conservar la solicitud. No se continuará con la aprobación.'); }
    };
    const vigente = () => actor && state.currentUser?.id === actor && esAdminOperativoActual() && continuar();
    const autorizar = async () => {
      if (!vigente()) fallo('La sesión administrativa cambió.');
      const auth = await window.supabaseClient.auth.getUser();
      const permiso = await window.UsuariosService.getMiEstadoAdministrativo(true);
      if (auth.error || auth.data?.user?.id !== actor || permiso?.es_admin_permanente !== true || !vigente())
        fallo('Se requiere Administrador permanente vigente para aprobar.');
    };
    try {
      await autorizar();
      if (typeof confirmar !== 'function' || actor === usuarioId) fallo('Solicitud administrativa no válida.');
      const roles = await window.UsuariosService.getRoles(true);
      const rol = roles.find(r => r.id === rolId);
      const normal = String(rol?.nombre || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (!['tecnico','recepcion'].includes(normal)) fallo('El rol Administrador conserva su procedimiento especial.');
      let usuario = await window.UsuariosService.getUsuario(usuarioId, true);
      const verificados = await window.UsuariosService.getCorreosVerificados();
      if (!vigente() || usuario?.id !== usuarioId || usuario.estado !== true || !verificados.has(usuarioId))
        fallo('La cuenta debe estar habilitada y tener correo verificado.');
      try { const raw = sessionStorage.getItem(key); ticket = raw ? JSON.parse(raw) : null; }
      catch (_) { fallo('No se pudo leer la solicitud previa. Requiere revisión antes de continuar.'); }
      if (ticket && (ticket.version !== 1 || ticket.actor !== actor || ticket.usuarioId !== usuarioId ||
          ticket.rolId !== rolId || ticket.nombre !== usuario.nombre ||
          !['preparada','vinculo_enviado','vinculada'].includes(ticket.fase) ||
          (!ticket.existente && !ticket.datos?.solicitudId) ||
          (!ticket.existente && (ticket.datos.usuarioId !== usuarioId ||
            !['VINCULAR','CREAR_Y_VINCULAR'].includes(ticket.datos.accion) ||
            ticket.datos.motivo !== 'Confirmación administrativa de identidad laboral durante aprobación de cuenta.' ||
            (ticket.datos.accion === 'CREAR_Y_VINCULAR' && ticket.datos.nombre !== ticket.nombre))) ||
          (ticket.existente && (ticket.fase !== 'vinculada' || !ticket.trabajadorId))))
        fallo('Existe una solicitud previa incompatible. No se generará otra solicitud.');
      if (usuario.rol_id != null && (!ticket || usuario.rol_id !== rolId))
        fallo('La cuenta ya no está pendiente en el estado esperado.');

      if (!ticket && usuario.trabajador_id) {
        ticket = { version: 1, actor, usuarioId, rolId, nombre: usuario.nombre,
          fase: 'vinculada', existente: true, trabajadorId: usuario.trabajador_id };
        guardar();
      }

      if (!ticket && !usuario.trabajador_id) {
        const [trabajadores, cuentas] = await Promise.all([this.getTrabajadores(true), this.listarVinculosCuentas()]);
        if (!vigente()) fallo('La sesión administrativa cambió.');
        const vinculados = new Set(cuentas.map(c => c.trabajador_id).filter(Boolean));
        const coincidencias = trabajadores.filter(t => t.estado !== 'Eliminado' && t.nombre === usuario.nombre);
        const elegibles = coincidencias.filter(t => t.estado === 'Activo' && !vinculados.has(t.id));
        const decision = await confirmar({ usuario, coincidencias, elegibles });
        if (!decision) return null;
        const crear = decision.accion === 'CREAR_Y_VINCULAR';
        if (crear ? coincidencias.length > 0 : decision.accion !== 'VINCULAR' || !elegibles.some(t => t.id === decision.trabajadorId))
          fallo('Hay una posible ficha existente. Revisa la identidad; no se creará un duplicado.');
        ticket = { version: 1, actor, usuarioId, rolId, nombre: usuario.nombre, fase: 'preparada', datos: {
          accion: decision.accion, usuarioId, trabajadorId: crear ? null : decision.trabajadorId,
          nombre: crear ? usuario.nombre : null, cargo: null, observaciones: null,
          motivo: 'Confirmación administrativa de identidad laboral durante aprobación de cuenta.',
          solicitudId: crypto.randomUUID()
        } };
        guardar();
      }
      if (ticket) {
        if (ticket.fase !== 'vinculada') {
          if (ticket.fase === 'preparada' && (usuario.trabajador_id || usuario.rol_id != null))
            fallo('El perfil cambió sin una auditoría coincidente. No se continuará.');
          if (ticket.fase !== 'preparada' && !await confirmar({ recuperacion: true, usuario, solicitudId: ticket.datos.solicitudId })) return null;
          await autorizar();
          ticket.fase = 'vinculo_enviado'; guardar();
          try {
            const recibo = await this.gestionarVinculoCuenta({ ...ticket.datos, devolverDetalle: true });
            ticket.trabajadorId = recibo.trabajador_id;
            ticket.fase = 'vinculada'; guardar();
          }
          catch (_) { fallo('Vinculación no confirmada. No se aprobó la cuenta. Conserva la solicitud para revisar o reenviar el mismo UUID.'); }
        }
        usuario = await window.UsuariosService.getUsuario(usuarioId, true);
        if (!ticket.trabajadorId || usuario.trabajador_id !== ticket.trabajadorId)
          fallo('La ficha actual no coincide con la auditoría. Se requiere revisión.');
        ticket.fase = 'vinculada'; guardar();
      }
      // Una asociación previa se reutiliza; nunca se crea otra ficha.
      const ficha = await this.getTrabajador(usuario.trabajador_id, true);
      if (!ficha || ficha.id !== usuario.trabajador_id || ficha.estado !== 'Activo')
        fallo('La ficha vinculada no está activa o no pudo verificarse.');
      await autorizar();
      if (usuario.rol_id == null) {
        try { await window.UsuariosService.aprobarUsuario(usuarioId, { rol_id: rolId }); }
        catch (_) { fallo('La ficha está vinculada, pero la aprobación no quedó confirmada. No se desvinculó. Revisa el estado antes de continuar.'); }
      } else if (usuario.rol_id !== rolId) fallo('El rol de la cuenta cambió. Se requiere revisión.');
      const actual = await window.UsuariosService.getUsuario(usuarioId, true);
      await autorizar();
      if (actual.estado !== true || actual.rol_id !== rolId || actual.trabajador_id !== ficha.id)
        fallo('No se pudo confirmar el estado final de la cuenta y su ficha. Revisa la solicitud original.');
      if (ticket) { try { sessionStorage.removeItem(key); } catch (_) { /* Estado real ya confirmado, conservar ticket no autoriza escrituras. */ } }
      return actual;
    } catch (error) {
      if (error?.codigo === 'APROBACION_FICHA_REQUIERE_REVISION') throw error;
      fallo(ticket?.fase === 'vinculada'
        ? 'La ficha está vinculada, pero la aprobación o su verificación no quedó confirmada. Revisa el estado y conserva la solicitud original.'
        : 'No se pudo confirmar el proceso. No se continuará automáticamente; revisa la solicitud laboral original.');
    } finally { this._aprobacionesLaboralesEnCurso.delete(usuarioId); }
  },

  // Una RPC mínima revalida en servidor al permanente o temporal vigente.
  // Solo agrupa solicitudes simultáneas; no reutiliza una autorización cacheada.
  async getCuentasSistema() {
    if (typeof esAdminOperativoActual !== 'function' || !esAdminOperativoActual())
      throw new Error('No tienes autorización administrativa vigente.');
    const actor = state.currentUser?.id;
    if (!actor) throw new Error('Sesión no disponible.');
    if (this._cuentasLectura?.actor === actor) return this._cuentasLectura.promise;
    const lectura = { actor, promise: null };
    lectura.promise = (async () => {
      const { data, error } = await window.supabaseClient.rpc('trabajadores_listar_cuentas_sistema_v1');
      if (error) throw new Error('No se pudieron consultar las cuentas. Comprueba que la RPC de lectura esté instalada y autorizada.');
      const normal = nombre => String(nombre || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!Array.isArray(data) || state.currentUser?.id !== actor || !esAdminOperativoActual() ||
          !data.every(u => u && typeof u.id === 'string' && typeof u.nombre === 'string' && typeof u.estado === 'boolean' &&
            ['recepcion', 'tecnico'].includes(normal(u.rol)) &&
            Object.keys(u).length === 4 && ['id','nombre','rol','estado'].every(k => Object.hasOwn(u, k))))
        throw new Error('No se pudo verificar el listado de cuentas.');
      return data.map(u => ({ id: u.id, nombre: u.nombre, estado: u.estado, roles: { nombre: u.rol } }));
    })();
    this._cuentasLectura = lectura;
    try { return await lectura.promise; }
    finally { if (this._cuentasLectura === lectura) this._cuentasLectura = null; }
  },

  // Lectura histórica sin depender de la existencia del perfil destinatario.
  async getDocumentosCuenta(cuentaId, { trabajadorHistorico = false } = {}) {
    const autorizado = () => typeof esAdminOperativoActual === 'function' && esAdminOperativoActual() === true;
    if (!autorizado()) throw new Error('Consulta documental reservada al administrador con autorización vigente.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cuentaId || ''))
      throw new Error('Identificador de cuenta inválido.');
    const actor = state.currentUser?.id;
    if (!actor) throw new Error('Sesión no disponible.');
    if (trabajadorHistorico) {
      const id=cuentaId.toLowerCase();
      const {data,error}=await window.supabaseClient.functions.invoke('usuario-eliminacion-ejecutar',{
        body:{accion:'CONSULTAR_IDENTIDADES_HISTORICAS',modulo:'DOCUMENTOS_FICHA',registros:[id]}});
      const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if(error||!autorizado()||state.currentUser?.id!==actor||data?.contrato!=='usuario-identidades-historicas/v2'||
        data.modulo!=='DOCUMENTOS_FICHA'||data.eliminacion_ejecutada!==false||
        !Array.isArray(data.registros_autorizados)||data.registros_autorizados.length!==1||data.registros_autorizados[0]!==id||
        !Array.isArray(data.cuentas_documentales)||!Array.isArray(data.identidades)||
        data.cuentas_documentales.some(r=>r.trabajador_id!==id||!uuid.test(r.cuenta_id||'')||
          !data.identidades.some(h=>h.registro_id===id&&h.origen_id===id&&h.referencia_id===id&&h.tipo==='trabajador'&&h.cuenta_eliminada===true))||
        new Set(data.cuentas_documentales.map(r=>r.cuenta_id)).size!==data.cuentas_documentales.length)
        throw new Error('No fue posible verificar los documentos conservados de esta ficha.');
      const grupos=await Promise.all(data.cuentas_documentales.map(r=>this.getDocumentosCuenta(r.cuenta_id)));
      if(!autorizado()||state.currentUser?.id!==actor)throw new Error('La sesión cambió durante la consulta.');
      const vistos=new Set();
      return grupos.flat().filter(d=>!vistos.has(d.id)&&vistos.add(d.id)).map(d=>({...d,
        mime_type:d.mime_type_verificado,tamano_bytes:d.tamano_bytes_verificado,
        estado_efectivo:cuentaDocumentoEstadoEfectivo(d).estado,origen_cuenta_conservada:true}));
    }
    const { data, error } = await window.supabaseClient.from('cuentas_documentos')
      .select(CUENTA_DOCUMENTO_LISTADO+','+CUENTA_DOCUMENTO_RETIRO+',retiro_confirmado:cuentas_documentos_retiros(confirmado_en)')
      .eq('cuenta_id', cuentaId).eq('estado_reserva', 'disponible')
      .not('retiro_confirmado.confirmado_en','is',null).is('retiro_confirmado',null)
      .order('created_at', { ascending: false }).order('id', { ascending: true });
    if (error) throw new Error('No fue posible consultar los documentos. Comprueba los permisos y la conexión.');
    if (!autorizado() || state.currentUser?.id !== actor || !Array.isArray(data) ||
        !data.every(d => d && d.cuenta_id === cuentaId && d.estado_reserva === 'disponible' && typeof d.nombre_original === 'string'))
      throw new Error('No fue posible verificar los documentos de la cuenta.');
    if (data.some(d=>cuentaDocumentoEstadoEfectivo(d).estado==='INCIERTO'))
      throw new Error('No fue posible verificar el estado documental. Requiere revisión.');
    return data.filter(d => cuentaDocumentoEstadoEfectivo(d).estado!=='RETIRADO');
  },

  async retirarDocumentoCuenta({ cuentaId, documentoId, accion, operacionId = null, confirmacion } = {}) {
    if (!TRABAJADORES_DOCUMENTOS_CUENTAS_ELIMINACION_HABILITADA)
      throw new Error('La eliminación de documentos de cuentas está deshabilitada.');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(cuentaId || '') || !uuid.test(documentoId || '') ||
        !['reservar', 'revisar', 'reautorizar'].includes(accion) || confirmacion !== true ||
        (accion === 'reservar' ? operacionId !== null : !uuid.test(operacionId || '')))
      throw new Error('La confirmación documental no es válida.');
    if (retiroDocumentoCuentaEnCurso) throw new Error('Ya hay un retiro documental en curso.');

    const client = window.supabaseClient;
    const actor = state.currentUser?.id;
    const vigente = () => !!actor && state.currentUser?.id === actor &&
      typeof esAdminOperativoActual === 'function' && esAdminOperativoActual() === true;
    const autorizar = async () => {
      if (!vigente()) throw new Error('Se requiere autorización administrativa vigente.');
      const sesion = await client.auth.getUser();
      if (sesion.error || sesion.data?.user?.id !== actor || !vigente())
        throw new Error('No fue posible verificar la sesión administrativa.');
      const permiso = await client.rpc('es_administrador_actual');
      if (permiso.error || permiso.data !== true || !vigente())
        throw new Error('Se requiere autorización administrativa vigente.');
    };

    retiroDocumentoCuentaEnCurso = true;
    let reservaSolicitada = false;
    try {
      await autorizar();
      const actual=await this.revalidarDocumentoCuenta(documentoId,cuentaId);
      if (actual.estado_efectivo==='RETIRADO') throw new Error('El documento ya tiene un retiro confirmado. Requiere revisión antes de continuar.');
      if ((accion==='reservar' && actual.estado_efectivo!=='DISPONIBLE') ||
          (accion!=='reservar' && (actual.estado_efectivo!=='RETIRO_PENDIENTE' || actual.retiro_efectivo.id!==operacionId)))
        throw new Error('El retiro cambió. Actualiza la ficha y revisa la solicitud original.');
      if (accion !== 'revisar') {
        reservaSolicitada = true;
        const { data, error } = await client.rpc('cuentas_documentos_reservar_retiro_v1', {
          p_cuenta_id: cuentaId, p_documento_id: documentoId, p_confirmacion: true,
          p_reautorizar_operacion_id: operacionId
        });
        if (error || !uuid.test(data?.operacion_id || '') ||
            (operacionId !== null && data.operacion_id !== operacionId))
          throw new Error('No se pudo verificar la reserva documental.');
        operacionId = data.operacion_id;

        if (data.autoriza_envio === true) {
          const resultadoEsperado = accion === 'reservar' ? 'RESERVADO' : 'REAUTORIZADO';
          if (data.resultado !== resultadoEsperado || data.bucket_id !== 'documentos-cuentas' ||
              data.storage_path !== actual.storage_path || !cuentaDocumentoRutaValida(actual) ||
              !(Date.parse(data.autorizado_hasta) > Date.now()))
            throw new Error('La reserva no coincide con el documento o ha vencido.');
          await autorizar();
          const vigenteDocumento=await this.revalidarDocumentoCuenta(documentoId,cuentaId);
          if (vigenteDocumento.estado_efectivo!=='RETIRO_PENDIENTE' || vigenteDocumento.retiro_efectivo.id!==operacionId)
            throw new Error('No fue posible verificar la autorización de retiro del documento.');
          if (!(Date.parse(data.autorizado_hasta) > Date.now()))
            throw new Error('La reserva documental ha vencido.');
          // Un solo envío. La RPC posterior resuelve el estado del catálogo incluso si se pierde la respuesta.
          try {
            await client.storage.from('documentos-cuentas').remove([data.storage_path]);
          } catch (_) {
            // El resultado de Storage es incierto. Continuar exclusivamente a confirmación.
          }
        } else if (data.autoriza_envio !== false) {
          throw new Error('La reserva no tiene un estado verificable.');
        } else if (data.resultado !== 'PENDIENTE_CONFIRMAR_AUSENCIA') {
          if (!['AUTORIZACION_VIGENTE', 'REQUIERE_REAUTORIZACION_EXPLICITA',
                'IDENTIDAD_STORAGE_DISTINTA', 'AUSENCIA_CONFIRMADA'].includes(data.resultado))
            throw new Error('La reserva no tiene un resultado reconocido.');
          if (data.resultado !== 'AUSENCIA_CONFIRMADA') return { resultado: data.resultado, operacionId };
        }
      }

      await autorizar();
      const { data, error } = await client.rpc('cuentas_documentos_confirmar_retiro_v1', {
        p_operacion_id: operacionId
      });
      if (!vigente() || error || data?.operacion_id !== operacionId ||
          !['AUSENCIA_CONFIRMADA', 'OBJETO_ORIGINAL_PRESENTE', 'IDENTIDAD_STORAGE_DISTINTA'].includes(data.resultado))
        throw new Error('No fue posible confirmar el retiro documental.');
      if (data.resultado === 'AUSENCIA_CONFIRMADA' && data.eliminacion_definitiva !== true)
        throw new Error('La eliminación definitiva no está confirmada.');
      return { resultado: data.resultado, operacionId,
        eliminacionDefinitiva: data.resultado === 'AUSENCIA_CONFIRMADA' && data.eliminacion_definitiva === true };
    } catch (error) {
      if (reservaSolicitada || operacionId) {
        const pendiente = new Error('No se pudo confirmar el retiro. Actualiza la ficha y revisa la operación antes de volver a enviarla.');
        pendiente.operacionId = operacionId;
        throw pendiente;
      }
      throw error;
    } finally {
      retiroDocumentoCuentaEnCurso = false;
    }
  },

  // Prepara exclusivamente en memoria. No reserva filas ni envía archivos.
  // El hash identifica bytes locales; NO constituye certificación del servidor.
  async prepararDocumentoCuenta(cuentaId, archivo) {
    this._recuperarSubidasCuenta();
    const actor = state.currentUser?.id;
    const autorizado = () => typeof esAdminOperativoActual === 'function' && esAdminOperativoActual() === true;
    if (!actor || !autorizado()) throw new Error('Solo un administrador con autorización vigente puede preparar documentos.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cuentaId || ''))
      throw new Error('Identificador de cuenta inválido.');
    if (!(archivo instanceof File) || archivo.size < 1 || archivo.size > 10485760 ||
        !archivo.name.trim() || archivo.name.length > 255 || /[\\/\x00-\x1f\x7f]/.test(archivo.name) ||
        !['application/pdf','image/jpeg','image/png','image/webp'].includes(archivo.type))
      throw new Error('Selecciona un PDF, JPG, PNG o WEBP de hasta 10 MB y con nombre válido.');
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const firma = archivo.type === 'application/pdf' ? [37,80,68,70,45].every((v,i)=>bytes[i]===v) :
      archivo.type === 'image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255 :
      archivo.type === 'image/png' ? [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v) :
      [82,73,70,70].every((v,i)=>bytes[i]===v) && [87,69,66,80].every((v,i)=>bytes[i+8]===v);
    if (!firma) throw new Error('El contenido no coincide con el formato declarado del archivo.');
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      byte => byte.toString(16).padStart(2,'0')).join('');
    if (state.currentUser?.id !== actor || !autorizado()) throw new Error('La sesión administrativa cambió.');
    // Cambiar la selección no debe convertir un envío incierto en otro UUID.
    // Recibo local: tras recargar se requiere revisión manual de la fila durable.
    for (const [key, intento] of this._documentosCuentaIntentos) {
      if (key.startsWith(actor + ':') && intento.cuenta === cuentaId &&
          intento.hash === sha && intento.fase !== 'completada') {
        const error = new Error('Este archivo tiene un envío pendiente de revisión. No vuelvas a subirlo.');
        error.code = 'DOCUMENTO_REQUIERE_REVISION';
        error.documentoId = key.slice(actor.length + 1);
        throw error;
      }
    }
    const id = crypto.randomUUID();
    return Object.freeze({ id, cuenta_id: cuentaId, actor_id: actor, archivo,
      bucket_id: 'documentos-cuentas', storage_path: 'cuentas/' + cuentaId + '/' + id,
      nombre_original: archivo.name, mime_type_declarado: archivo.type,
      tamano_bytes_declarado: bytes.length, sha256_calculado_cliente: sha });
  },

  // Referencias locales, nunca autoridad: servidor y UUID durable deciden el resultado.
  _recuperarSubidasCuenta() {
    const actor=state.currentUser?.id;if(!actor)return;
    let raw;try{raw=window.sessionStorage?.getItem('alm.documentos.institucionales.v1:'+actor);}catch{return;}
    if(!raw)return;
    let refs;try{refs=JSON.parse(raw);}catch{throw new Error('No se pudieron verificar las referencias pendientes. Solicita revisión.');}
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!Array.isArray(refs)||refs.length>500||refs.some(r=>!r||!uuid.test(r.id||'')||!uuid.test(r.cuenta||'')||
      !(r.hash===null||/^[0-9a-f]{64}$/.test(r.hash||''))||Object.keys(r).sort().join(',')!=='cuenta,hash,id')||new Set(refs.map(r=>r.id)).size!==refs.length)
      throw new Error('Las referencias pendientes requieren revisión. No se iniciará otra subida.');
    for(const r of refs)if(!this._documentosCuentaIntentos.has(actor+':'+r.id))this._documentosCuentaIntentos.set(actor+':'+r.id,
      {cuenta:r.cuenta,hash:r.hash,ruta:'cuentas/'+r.cuenta+'/'+r.id,fase:'requiere_revision'});
  },
  _guardarSubidasCuenta(actor=state.currentUser?.id) {
    if(!actor||state.currentUser?.id!==actor)return;
    const refs=[];for(const [key,r]of this._documentosCuentaIntentos)if(key.startsWith(actor+':')&&r.fase!=='completada')
      refs.push({id:key.slice(actor.length+1),cuenta:r.cuenta,hash:r.hash||null});
    try{window.sessionStorage?.setItem('alm.documentos.institucionales.v1:'+actor,JSON.stringify(refs));}catch{/* Mantener referencia en memoria y en el aviso, sin reintentar. */}
  },
  getSubidasCuentaPendientes(cuentaId) {
    if(!state.currentUser?.id||!esAdminOperativoActual())return [];
    this._recuperarSubidasCuenta();const actor=state.currentUser.id;
    return Array.from(this._documentosCuentaIntentos).filter(([key,r])=>key.startsWith(actor+':')&&r.cuenta===cuentaId&&r.fase==='requiere_revision')
      .map(([key])=>key.slice(actor.length+1));
  },
  async _invocarDocumentoInstitucional(body,actor) {
    if (!TRABAJADORES_DOCUMENTOS_CUENTAS_ESCRITURA_HABILITADA) {
      const e=new Error('La subida institucional todavía no está habilitada.');e.sinEnvio=true;throw e;
    }
    const client=window.supabaseClient;let enviada=false;
    const vigente=()=>actor&&state.currentUser?.id===actor&&esAdminOperativoActual()===true;
    try{
      if(!vigente())throw new Error();
      const sesion=await client.auth.getSession(),auth=await client.auth.getUser();
      if(sesion.error||auth.error||!sesion.data?.session?.access_token||sesion.data.session.user?.id!==actor||auth.data?.user?.id!==actor||!vigente())throw new Error();
      const permiso=await client.rpc('es_administrador_actual');
      if(permiso.error||permiso.data!==true||!vigente())throw new Error();
      enviada=true;
      const r=await client.functions.invoke('usuario-invitaciones/documentos',{
        body,headers:{Authorization:'Bearer '+sesion.data.session.access_token}
      });
      let data=r.data;
      if(!data&&r.error?.context?.clone){try{data=await r.error.context.clone().json();}catch{/* Resultado incierto. */}}
      if(data?.error==='DOCUMENTO_BLOQUEADO_POR_ELIMINACION'){
        const e=new Error('La subida está bloqueada por una eliminación pendiente relacionada. Conserva la referencia y revisa esa operación antes de continuar; no vuelvas a subir el archivo.');e.bloqueoEliminacion=true;throw e;
      }
      if(data?.error==='DOCUMENTOS_INSTITUCIONALES_DESHABILITADOS'){
        const e=new Error('La subida institucional todavía no está habilitada en el servidor.');e.sinEnvio=true;throw e;
      }
      if(r.error||data?.ok!==true||data.estado!=='DOCUMENTO_DISPONIBLE'||data.documento_id!==body.documento_id||data.habilita_auth!==false)throw new Error();
      const actual=await client.auth.getUser();if(actual.error||actual.data?.user?.id!==actor||!vigente())throw new Error();
      return data;
    }catch(cause){
      const e=new Error(cause?.bloqueoEliminacion||cause?.sinEnvio?cause.message:enviada?'No se confirmó la subida institucional. Revisa la referencia original; no vuelvas a enviarla.':'No se pudo verificar la sesión o autorización documental.');
      e.bloqueoEliminacion=cause?.bloqueoEliminacion===true;
      e.sinEnvio=cause?.sinEnvio===true||!enviada;throw e;
    }
  },
  async _confirmarSubidaInstitucional(cuentaId,documentoId,actor,hash=null) {
    const row=await this.revalidarDocumentoCuenta(documentoId,cuentaId);
    if(state.currentUser?.id!==actor||!esAdminOperativoActual()||row.estado_efectivo!=='DISPONIBLE'||row.propiedad_institucional!==true||
      row.creado_por!==actor||!row.cuenta_nombre_snapshot?.trim()||!row.creado_por_nombre_snapshot?.trim()||
      !['administrador','recepcion','tecnico'].includes(String(row.cuenta_rol_snapshot||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))||
      !/^[0-9a-f]{64}$/.test(row.sha256_verificado||'')||(hash!==null&&row.sha256_verificado!==hash))
      throw new Error('No se pudo verificar el documento institucional confirmado.');
    return Object.freeze(row);
  },
  async subirDocumentoCuenta(p) {
    if (!TRABAJADORES_DOCUMENTOS_CUENTAS_ESCRITURA_HABILITADA) {
      const error=new Error('La subida institucional todavía no está habilitada.');error.code='SUBIDA_DOCUMENTAL_BLOQUEADA';throw error;
    }
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const actor=state.currentUser?.id;
    if(!p||p.actor_id!==actor||!uuid.test(p.id||'')||!uuid.test(p.cuenta_id||'')||p.bucket_id!=='documentos-cuentas'||
      p.storage_path!=='cuentas/'+p.cuenta_id+'/'+p.id||!(p.archivo instanceof File)||p.archivo.size<1||p.archivo.size>10485760||
      p.archivo.name!==p.nombre_original||p.archivo.type!==p.mime_type_declarado||p.archivo.size!==p.tamano_bytes_declarado)
      throw new Error('Preparación documental inválida.');
    if(subidaDocumentoCuentaEnCurso)throw new Error('Ya hay una subida o revisión documental en curso.');
    subidaDocumentoCuentaEnCurso=true;let recibo,key=actor+':'+p.id;
    try{
      this._recuperarSubidasCuenta();
      const previo=this._documentosCuentaIntentos.get(key);
      if(previo){
        if(previo.cuenta!==p.cuenta_id||previo.hash!==p.sha256_calculado_cliente)throw new Error('Referencia documental distinta.');
        if(previo.fase==='completada')return await this._confirmarSubidaInstitucional(p.cuenta_id,p.id,actor,previo.hash);
        const e=new Error('Este documento tiene una subida pendiente. Utiliza Revisar subida pendiente.');e.documentoId=p.id;throw e;
      }
      for(const [k,r]of this._documentosCuentaIntentos)if(k.startsWith(actor+':')&&r.cuenta===p.cuenta_id&&r.hash===p.sha256_calculado_cliente&&r.fase!=='completada'){
        const e=new Error('Este archivo tiene una subida pendiente. Revisa la referencia original.');e.documentoId=k.slice(actor.length+1);throw e;
      }
      const bytes=new Uint8Array(await p.archivo.arrayBuffer());
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==p.sha256_calculado_cliente)throw new Error('El archivo cambió desde su preparación.');
      let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
      recibo={cuenta:p.cuenta_id,ruta:p.storage_path,hash,fase:'enviando'};this._documentosCuentaIntentos.set(key,recibo);this._guardarSubidasCuenta(actor);
      await this._invocarDocumentoInstitucional({accion:'SUBIR_DOCUMENTO_INSTITUCIONAL',documento_id:p.id,cuenta_id:p.cuenta_id,
        nombre:p.nombre_original,mime:p.mime_type_declarado,contenido_base64:btoa(binary)},actor);
      const row=await this._confirmarSubidaInstitucional(p.cuenta_id,p.id,actor,hash);
      recibo.fase='completada';recibo.resultado=row;this._guardarSubidasCuenta(actor);return row;
    }catch(cause){
      if(recibo){if(cause?.sinEnvio)this._documentosCuentaIntentos.delete(key);else recibo.fase='requiere_revision';this._guardarSubidasCuenta(actor);}
      const e=new Error(cause?.bloqueoEliminacion||cause?.sinEnvio?cause.message:recibo||cause?.documentoId?'No se confirmó la subida. Utiliza Revisar subida pendiente, sin volver a enviarla.':cause.message);
      e.code=recibo||cause?.documentoId?'DOCUMENTO_REQUIERE_REVISION':'DOCUMENTO_NO_AUTORIZADO';e.documentoId=cause?.documentoId||p.id;throw e;
    }finally{subidaDocumentoCuentaEnCurso=false;}
  },
  async revisarSubidaDocumentoCuenta(cuentaId,documentoId) {
    if (!TRABAJADORES_DOCUMENTOS_CUENTAS_ESCRITURA_HABILITADA) throw new Error('La subida institucional todavía no está habilitada.');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cuentaId||'')||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentoId||''))throw new Error('Referencia documental inválida.');
    if(subidaDocumentoCuentaEnCurso)throw new Error('Ya hay una subida o revisión documental en curso.');
    const actor=state.currentUser?.id;subidaDocumentoCuentaEnCurso=true;
    try{
      this._recuperarSubidasCuenta();
      const key=actor+':'+documentoId,previo=this._documentosCuentaIntentos.get(key);
      if(previo&&previo.cuenta!==cuentaId)throw new Error('Referencia de otra cuenta.');
      await this._invocarDocumentoInstitucional({accion:'REVISAR_DOCUMENTO_INSTITUCIONAL',documento_id:documentoId},actor);
      const row=await this._confirmarSubidaInstitucional(cuentaId,documentoId,actor,previo?.hash||null);
      this._documentosCuentaIntentos.set(key,{cuenta:cuentaId,hash:row.sha256_verificado,ruta:row.storage_path,fase:'completada',resultado:row});
      this._guardarSubidasCuenta(actor);return row;
    }catch(cause){const e=new Error(cause?.bloqueoEliminacion?cause.message:'No se confirmó la revisión. Conserva la referencia; no vuelvas a subir el archivo.');e.documentoId=documentoId;throw e;}
    finally{subidaDocumentoCuentaEnCurso=false;}
  },

  // Metadatos y bytes bajo la sesión actual y las políticas RLS/Storage.
  async obtenerArchivoCuenta(documentoId) {
    const autorizado = () => typeof esAdminOperativoActual === 'function' && esAdminOperativoActual() === true;
    const actor = state.currentUser?.id;
    if (!actor || !autorizado()) throw new Error('Solo un administrador con autorización vigente puede consultar estos documentos.');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(documentoId || '')) throw new Error('Identificador documental inválido.');
    const columns = 'id,cuenta_id,bucket_id,storage_path,estado_reserva,storage_object_id,storage_version,mime_type_verificado,tamano_bytes_verificado,sha256_verificado';
    const leer = () => this.revalidarDocumentoCuenta(documentoId);
    const d = await leer();
    if (d.estado_efectivo!=='DISPONIBLE') throw new Error('El documento está retirado o pendiente de revisión; no se puede abrir ni descargar.');
    if (!d || d.id !== documentoId || !uuid.test(d.cuenta_id || '') ||
        d.bucket_id !== 'documentos-cuentas' || !cuentaDocumentoRutaValida(d) ||
        d.estado_reserva !== 'disponible' || !uuid.test(d.storage_object_id || '') ||
        typeof d.storage_version !== 'string' || !d.storage_version ||
        !['application/pdf','image/jpeg','image/png','image/webp'].includes(d.mime_type_verificado) ||
        !Number.isSafeInteger(d.tamano_bytes_verificado) || d.tamano_bytes_verificado < 1 || d.tamano_bytes_verificado > 10485760 ||
        !/^[0-9a-f]{64}$/.test(d.sha256_verificado || ''))
      throw new Error('No fue posible verificar los metadatos del documento.');
    if (!autorizado() || state.currentUser?.id !== actor) throw new Error('La sesión administrativa cambió.');
    const result = await window.supabaseClient.storage.from('documentos-cuentas').download(d.storage_path);
    if (result.error || !(result.data instanceof Blob))
      throw new Error('No fue posible descargar el documento. Comprueba los permisos y la conexión.');
    const blob = result.data;
    if (blob.size !== d.tamano_bytes_verificado || blob.type !== d.mime_type_verificado)
      throw new Error('El contenido del documento no coincide con su información verificada.');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
      byte => byte.toString(16).padStart(2, '0')).join('');
    const after = await leer();
    if (hash !== d.sha256_verificado || after.estado_efectivo!=='DISPONIBLE' ||
        columns.split(',').some(key => after[key] !== d[key]))
      throw new Error('El documento cambió o no coincide con su contenido verificado.');
    if (!autorizado() || state.currentUser?.id !== actor) throw new Error('La sesión administrativa cambió.');
    return blob;
  },

  async eliminarTrabajadorLogicamente(id) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || ''))
      throw new Error('Identificador de trabajador inválido.');
    if (typeof esAdminOperativoActual !== 'function' || !esAdminOperativoActual() ||
        !await revalidarPrivilegioParaEscritura()) throw new Error('No tienes autorización administrativa vigente.');
    return this.updateTrabajador(id, { estado: 'Eliminado' });
  },

  // ----------------------------------------------------------
  // getTrabajadores(force = false)
  // Todos los trabajadores reales, ordenados por nombre ASC.
  // Columnas explícitas. Devuelve los valores TAL CUAL (observaciones
  // puede ser NULL y se devuelve NULL, no '' vacío).
  // ----------------------------------------------------------
  async getTrabajadores(force = false) {
    if (!force && this._trabajadoresCache) return this._trabajadoresCache;

    try {
      const { data: trabajadores, error } = await window.supabaseClient
        .from('trabajadores')
        .select('id, nombre, cargo, estado, observaciones, created_at, updated_at')
        .order('nombre', { ascending: true })
        .order('id', { ascending: true }); // desempate estable

      if (error) throw error;

      this._trabajadoresCache = trabajadores || [];
      return this._trabajadoresCache;
    } catch (e) {
      console.error('Error completo Supabase en TrabajadoresService.getTrabajadores:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // getTrabajador(id, force = false)
  // Un trabajador real por UUID. NO busca en localStorage ni usa mocks.
  // Si el UUID no existe, .single() devuelve error y se lanza.
  // ----------------------------------------------------------
  async getTrabajador(id, force = false) {
    if (!id) {
      throw new Error('TrabajadoresService.getTrabajador: falta el id del trabajador.');
    }
    if (!force && this._trabajadoresDetalleCache[id]) {
      return this._trabajadoresDetalleCache[id];
    }

    try {
      const { data: trabajador, error } = await window.supabaseClient
        .from('trabajadores')
        .select('id, nombre, cargo, estado, observaciones, created_at, updated_at')
        .eq('id', id)
        .single();

      if (error) throw error;

      this._trabajadoresDetalleCache[id] = trabajador || null;
      return this._trabajadoresDetalleCache[id];
    } catch (e) {
      console.error('Error completo Supabase en TrabajadoresService.getTrabajador:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // createTrabajador(datos)
  // Inserta un trabajador. Acepta ÚNICAMENTE: nombre, cargo, estado y
  // observaciones. NO acepta id, created_at ni updated_at: los
  // controla Supabase (gen_random_uuid() y now()).
  // Devuelve el registro creado (con las 7 columnas).
  // ----------------------------------------------------------
  async createTrabajador(datos = {}) {
    const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
    const estado = typeof datos.estado === 'string' ? datos.estado.trim() : '';

    if (!nombre) {
      throw new Error('TrabajadoresService.createTrabajador: el nombre es obligatorio.');
    }
    if (!estado) {
      throw new Error('TrabajadoresService.createTrabajador: el estado es obligatorio.');
    }

    // observaciones: puede ser NULL. Un string vacío se normaliza a
    // NULL para no guardar basura; NUNCA se convierte NULL en ''.
    let observaciones = null;
    if (datos.observaciones !== undefined && datos.observaciones !== null) {
      const obs = String(datos.observaciones).trim();
      observaciones = obs === '' ? null : obs;
    }

    // Payload mínimo: solo campos editables. Sin id/created_at/updated_at.
    const cargo = datos.cargo == null ? null : String(datos.cargo).trim() || null;
    const payload = { nombre, cargo, estado, observaciones };

    try {
      const { data: creado, error } = await window.supabaseClient
        .from('trabajadores')
        .insert([payload])
        .select('id, nombre, cargo, estado, observaciones, created_at, updated_at')
        .single();

      if (error) throw error;

      // Invalida la lista: hay un registro nuevo.
      this._trabajadoresCache = null;
      if (creado && creado.id) {
        this._trabajadoresDetalleCache[creado.id] = creado;
      }

      return creado;
    } catch (e) {
      console.error('Error completo Supabase en TrabajadoresService.createTrabajador:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // updateTrabajador(id, datos)
  // Editar ÚNICAMENTE: nombre, cargo, estado y observaciones.
  // NO se envía updated_at: el trigger trabajadores_set_updated_at
  // lo actualiza automáticamente (BEFORE UPDATE).
  // Devuelve el registro actualizado (con las 7 columnas).
  // ----------------------------------------------------------
  async updateTrabajador(id, datos = {}) {
    if (!id) {
      throw new Error('TrabajadoresService.updateTrabajador: falta el id del trabajador.');
    }

    // Solo se envían los campos presentes en datos (edición parcial).
    const payload = {};

    if (datos.nombre !== undefined) {
      const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
      if (!nombre) {
        throw new Error('TrabajadoresService.updateTrabajador: el nombre no puede quedar vacío.');
      }
      payload.nombre = nombre;
    }

    if (datos.cargo !== undefined) {
      payload.cargo = datos.cargo === null ? null : String(datos.cargo).trim() || null;
    }

    if (datos.estado !== undefined) {
      const estado = typeof datos.estado === 'string' ? datos.estado.trim() : '';
      if (!estado) {
        throw new Error('TrabajadoresService.updateTrabajador: el estado no puede quedar vacío.');
      }
      payload.estado = estado;
    }

    if (datos.observaciones !== undefined) {
      // '' → NULL. NULL real se respeta como ausencia de dato.
      const obs = datos.observaciones === null
        ? null
        : String(datos.observaciones).trim();
      payload.observaciones = obs === '' ? null : obs;
    }

    if (Object.keys(payload).length === 0) {
      throw new Error('TrabajadoresService.updateTrabajador: no hay campos para actualizar.');
    }

    try {
      const { data: actualizado, error } = await window.supabaseClient
        .from('trabajadores')
        .update(payload)
        .eq('id', id)
        .neq('estado', 'Eliminado') // Evita edición/reactivación accidental, incluso desde una ficha antigua.
        .select('id, nombre, cargo, estado, observaciones, created_at, updated_at')
        .single();

      if (error) throw error;

      // Invalida lista y detalle afectado.
      this._trabajadoresCache = null;
      delete this._trabajadoresDetalleCache[id];

      return actualizado;
    } catch (e) {
      throw e;
    }
  },

  // ----------------------------------------------------------
  // clearCache()
  // Vacía toda la caché interna del service.
  // ----------------------------------------------------------
  clearCache() {
    this._trabajadoresCache = null;
    this._trabajadoresDetalleCache = {};
    this._cuentasLectura = null;
  }
};
