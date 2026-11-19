// ==========================================================
// SERVICIO: USUARIOS Y ROLES REALES - HOTEL EL ALMENDRO
// ==========================================================
// CAMBIO 6B: gestión de rol/estado exclusivamente por RPC, con
// revisión, valores esperados e idempotencia. El otorgamiento usa
// el nuevo contrato obligatorio; nunca recurre a la firma antigua.
// FASE S3B-2: Service real de Supabase para el Panel de
// Administración (lectura de usuarios y roles reales).
//
// Patrón técnico: js/services/trabajadores.service.js y
// js/services/mejoras.service.js.
// Acceso a datos reales vía window.supabaseClient. NO se crea otro
// cliente Supabase.
//
// Tablas reales:
// - public.usuarios: id (uuid PK -> auth.users.id), rol_id (uuid NULL
//   -> public.roles.id), nombre (varchar NULL), email (varchar NULL),
//   estado (boolean DEFAULT true).
// - public.roles: id (uuid PK), nombre (varchar NOT NULL).
//
// Seguridad (RLS real):
// - public.usuarios: policy usuario_lee_su_perfil (auth.uid() = id) y
//   policy administrador_lee_todos_los_usuarios
//   (public.es_administrador_permanente_actual()). El service NO decide quién es
//   Administrador: la autorización real es RLS.
// - public.roles: SELECT permitido a authenticated.
// - FASE S3C-1C/1D/1E: aprobación de cuentas pendientes:
//   aprobarUsuario(id, { rol_id }) → RPC SEGURA
//   public.aprobar_usuario_normal(p_usuario_id, p_rol_id)
//   (SECURITY DEFINER + SET search_path; authenticated sólo tiene
//   EXECUTE, NO UPDATE sobre usuarios.rol_id). El nombre NO se
//   reescribe: proviene del registro público (trigger
//   handle_new_auth_user → public.usuarios.nombre) y se valida que
//   no esté vacío. El rol Administrador está RECHAZADO en el flujo
//   normal (normalización de mayúsculas/tildes): ese acceso se
//   gestiona en un proceso de autorización independiente.
//   La autorización real (es_administrador_permanente_actual y todas las
//   reglas de la solicitud) vive DENTRO de la RPC; el service sólo
//   agrega validaciones UX previas. NO hay UPDATE directo, create /
//   delete, ni admin API, service_role, inviteUserByEmail ni
//   passwords.
// - FASE S3C-2C: administración temporal (SÓLO lectura + RPCs):
//   getMiEstadoAdministrativo() → RPC mi_estado_administrativo();
//   getAdministracionesTemporales() → SELECT RLS del ledger
//   public.administraciones_temporales (created_at DESC);
//   otorgarAdministracionTemporal(datos) → RPC
//   otorgar_administracion_temporal (sólo Administrador PERMANENTE);
//   revocarAdministracionTemporal(id) → RPC
//   revocar_administracion_temporal (sólo Administrador PERMANENTE).
//   NUNCA hay INSERT/UPDATE/DELETE directo sobre
//   administraciones_temporales ni modificación de usuarios.rol_id.
// - PostgreSQL: authenticated conserva SELECT sobre usuarios/roles.
//   El UPDATE directo sobre public.usuarios.rol_id fue REVOGADO en
//   el backend (S3C-1E): ninguna escritura de este service pasa por
//   .from('usuarios').update(...). La única vía de aprobación es la
//   RPC mencionada arriba.
// - NO se lee auth.users desde frontend (requiere privilegios de
//   servidor). Todo lo que se muestra viene de public.usuarios.
//
// Convenciones:
// - Caché interna por método (force = true fuerza recarga).
// - SELECT con columnas explícitas; NUNCA SELECT *.
// - NULL se devuelve tal cual: nombre puede ser NULL (usuario
//   recién invitado) y el service NO lo rellena. La decisión visual
//   nombre -> email -> "Usuario" la toma la vista, no el service.
// - Errores: console.error con contexto y re-lanzamiento. NUNCA se
//   devuelven mocks, usuarios ficticios ni se usa localStorage como
//   fallback.
// - Los datos NO se guardan en localStorage (Ley 21.719: minimización
//   y tratamiento responsable de datos personales).
// - Este service reemplazará a state.users / getHotelUsers() /
//   mockData.users en una fase posterior, pero NO los elimina todavía.
// - Los ids son UUID reales de Supabase; los ids legacy (usr_1, usr_3,
//   usr_4) no existen aquí y simplemente no devuelven resultados.

// Normaliza el nombre de un rol para comparaciones robustas:
// minúsculas + sin tildes/acentos.
//   "Administración" -> "administracion"
//   "Administrador"  -> "administrador"
//   "  Técnico  "    -> "tecnico"
// Se usa para identificar el rol Administrador SIN depender de la
// escritura exacta (evita que "ADMINISTRADOR", "Administrador " o
// "Administración" eviten la restricción del flujo normal).
function normalizarNombreRol(nombreRol) {
  if (nombreRol === null || nombreRol === undefined) return '';
  return String(nombreRol)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // elimina diacríticos (tildes)
}

// Allowlist de roles NORMALES del flujo de aprobación (S3C-1E).
// Nombres NORMALIZADOS (ver normalizarNombreRol) de los roles que la
// aprobación normal puede otorgar. NO se hardcodean UUIDs: la
// comparación se hace contra public.roles resuelto por getRoles().
// El rol Administrador queda fuera a propósito: su asignación es un
// proceso de autorización independiente (fases posteriores).
const USUARIOS_ROLES_NORMALES = ['recepcion', 'tecnico'];

// Elegibilidad visual exclusivamente; SQL y Edge autorizan la operación real.
function usuarioEsExcepcionalEliminacion(usuario) {
  return !!usuario && ['43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4',
    'd642838d-19df-4fd5-994a-77c6b63795ad'].includes(usuario.id) &&
    usuario.estado === true && usuario.rol_id === null && usuario.trabajador_id === null;
}

// Tokens de error que lanza la RPC public.aprobar_usuario_normal()
// (formato "TOKEN: mensaje legible"). Se usan para traducir el error
// de PostgreSQL al campo .codigo que ya consume la UI (admin.js),
// sin exponer SQL ni policies al usuario final.
const USUARIOS_CODIGOS_ERROR_RPC = [
  'CONFLICTO_VERSION', 'SOLICITUD_REUTILIZADA', 'AUTOEDICION_PROHIBIDA',
  'ULTIMO_ADMINISTRADOR', 'CONFIRMACION_ADMINISTRADOR_REQUERIDA',
  'MOTIVO_INVALIDO', 'TRANSICION_INVALIDA', 'SIN_CAMBIOS',
  'ROL_NUEVO_NO_PERMITIDO', 'CATALOGO_ROLES_INCOMPATIBLE',
  'SESION_INVALIDA',
  'NO_AUTORIZADO',
  'PARAMETROS_INVALIDOS',
  'ROL_ADMINISTRADOR',
  'ROL_NO_PERMITIDO',
  'SOLICITUD_SIN_NOMBRE',
  'SOLICITUD_NO_PENDIENTE',
  // S3C-2C: tokens de las RPC de administración temporal
  // (otorgar_administracion_temporal / revocar_administracion_temporal).
  'OBJETIVO_INVALIDO',
  'USUARIO_NO_ENCONTRADO',
  'USUARIO_NO_VIGENTE',
  'USUARIO_SIN_ROL',
  'OBJETIVO_ES_ADMIN_PERMANENTE',
  'DELEGACION_SOLAPADA',
  'DELEGACION_NO_ENCONTRADA'
];

// Extrae el token de error de la RPC desde el objeto de error de
// PostgREST (message / details / hint). Devuelve null si no hay.
function extraerCodigoErrorRPC(err) {
  if (!err || typeof err !== 'object') return null;
  if (err.codigo) return err.codigo; // ya asignado por validaciones locales

  const texto = [err.message, err.details, err.hint]
    .filter(v => typeof v === 'string' && v !== '')
    .join(' ');

  if (!texto) return null;

  for (let i = 0; i < USUARIOS_CODIGOS_ERROR_RPC.length; i++) {
    const token = USUARIOS_CODIGOS_ERROR_RPC[i];
    // Coincidencia como palabra completa, con o sin ": " posterior.
    if (new RegExp('\\b' + token + '\\b').test(texto)) return token;
  }
  return null;
}

// Contrato del handler local existente; nunca convertir campos ausentes en ceros.
function validarRespuestaPrevisualizacionUsuario(data, id) {
  const count = n => Number.isSafeInteger(n) && n >= 0;
  const codes = values => Array.isArray(values) && values.every(v => typeof v === 'string' && /^[A-Z0-9_]+$/.test(v));
  const bools = ['perfil_existe','auth_existe','cuenta_propia','administrador_permanente','ultimo_administrador_permanente'];
  if (!data || data.contrato !== 'usuario-eliminacion-previsualizar/v1' || data.modo !== 'solo_lectura' ||
      data.usuario_id !== id.toLowerCase() || data.puede_eliminar !== false || data.eliminacion_habilitada !== false ||
      data.validacion_integral_completa !== false || typeof data.comprobado_en !== 'string' || !Number.isFinite(Date.parse(data.comprobado_en)) ||
      !bools.every(key => typeof data[key] === 'boolean') || !count(data.administradores_permanentes_habilitados) ||
      !count(data.asignaciones?.mantenciones) || !count(data.asignaciones?.tareas) ||
      data.asignaciones.alcance !== 'todas_las_filas_sin_inferir_vigencia' ||
      !count(data.storage?.total) || !count(data.storage?.por_owner_id) || !count(data.storage?.por_owner) || data.storage.total_sin_duplicar !== true ||
      data.storage.por_owner_id > data.storage.total || data.storage.por_owner > data.storage.total ||
      data.storage.total - data.storage.por_owner_id > data.storage.por_owner ||
      !count(data.documentos_conservables?.prevencion) || !count(data.documentos_conservables?.trabajadores) ||
      data.documentos_conservables.accion !== 'conservar_sin_modificar' ||
      !count(data.historial_solicitudes?.solicitudes_creadas) || !count(data.historial_solicitudes?.avisos_asociados) ||
      data.historial_solicitudes.accion !== 'conservar_sin_modificar' ||
      !codes(data.bloqueos) || !data.bloqueos.includes('ELIMINACION_NO_IMPLEMENTADA') || !codes(data.verificaciones_pendientes) ||
      !Array.isArray(data.referencias_fk_detectadas) || !data.referencias_fk_detectadas.every(r =>
        r && ['esquema','tabla','restriccion'].every(key => typeof r[key] === 'string'))) {
    const error = new Error('Respuesta de previsualización incompleta o incompatible.');
    error.codigo = 'PREVISUALIZACION_INCOMPLETA'; throw error;
  }
  return data;
}

window.UsuariosService = {
  // Paso 189: entrada del coordinador existente. Solo construye datos locales; NO envía,
  // prepara operaciones SQL, autoriza ni ejecuta eliminación. El modal sigue bloqueado.
  construirEntradaEliminacion({ usuario, operacionId, nombre, motivo, confirmacion }) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const texto = typeof motivo === 'string' ? motivo.trim() : '';
    if (!uuid.test(usuario?.id || '') || !uuid.test(operacionId || '') ||
        typeof usuario?.nombre !== 'string' || !usuario.nombre.trim() || usuario.nombre.length > 1000 ||
        nombre !== usuario.nombre || [...texto].length < 10 || [...texto].length > 1000 || confirmacion !== true) {
      throw new Error('Revisa el nombre exacto, el motivo y la confirmación de la cuenta.');
    }
    return Object.freeze({ usuario_id: usuario.id.toLowerCase(), operacion_id: operacionId.toLowerCase(),
      nombre_confirmacion: nombre, motivo: texto, confirmacion: true });
  },
  // DEL-FIX-07: consulta sin contraseña, creación de petición ni continuación.
  async consultarEliminacionesPendientes(operacionId=null) {
    if(operacionId!==null&&(typeof operacionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operacionId)))throw new Error('Operación no verificable.');
    const client = window.supabaseClient;
    const { data: auth, error: authError } = await client.auth.getUser();
    const actor = auth?.user?.id;
    if (authError || !actor || (await this.getMiEstadoAdministrativo(true)).es_admin_permanente !== true)
      throw new Error('Consulta disponible solo para Administrador permanente.');
    const { data, error } = await client.functions.invoke('usuario-eliminacion-ejecutar', { body: { accion: 'CONSULTAR_OPERACION',...(operacionId?{operacion_id:operacionId}:{}) } });
    if (error || data?.resultado !== 'CONSULTA_OK' || data.eliminacion_ejecutada !== false ||
        !Array.isArray(data.operaciones) || data.operaciones.length > 50)
      throw new Error('No se pudieron verificar las eliminaciones pendientes. No se realizó ninguna continuación.');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const keys = ['operacion_id','request_id','objetivo_id','nombre','motivo','fingerprint','estado','intentos_auth'];
    const seen = new Set();
    for (const op of data.operaciones) {
      if (!op || Object.keys(op).length !== keys.length || !keys.every(k => Object.hasOwn(op,k)) ||
          !['operacion_id','request_id','objetivo_id'].every(k => typeof op[k] === 'string' && uuid.test(op[k])) ||
          seen.has(op.operacion_id) || !['PREPARADA','AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION'].includes(op.estado) ||
          !Number.isSafeInteger(op.intentos_auth) || op.intentos_auth < 0 || (op.estado === 'PREPARADA' && op.intentos_auth !== 0) ||
          typeof op.nombre !== 'string' || !op.nombre.trim() || op.nombre.length > 1000 ||
          typeof op.motivo !== 'string' || [...op.motivo.trim()].length < 10 || [...op.motivo].length > 1000 ||
          typeof op.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(op.fingerprint))
        throw new Error('La respuesta de operaciones está incompleta. No se permite continuar.');
      seen.add(op.operacion_id);
    }
    const current = await client.auth.getUser();
    if (current.error || current.data?.user?.id !== actor ||
        (await this.getMiEstadoAdministrativo(true)).es_admin_permanente !== true)
      throw new Error('La sesión cambió durante la consulta.');
    if(operacionId&&(data.operaciones.length>1||data.operaciones.some(op=>op.operacion_id!==operacionId)))throw new Error('La operación consultada no coincide.');
    const objetivo=data.operaciones.length===1?data.operaciones[0].objetivo_id:null;
    const h=data.habilitacion;
    const habilitacionValida=!!h&&!Array.isArray(h)&&Object.keys(h).length===8&&
      h.contrato==='usuario-eliminacion-habilitacion/v2'&&h.objetivo_id===objetivo&&
      uuid.test(objetivo||'')&&typeof h.servidor==='boolean'&&
      typeof h.verificada==='boolean'&&typeof h.efectiva==='boolean'&&h.autoriza_auth===false&&
      (h.verificada?typeof h.sql==='boolean'&&typeof h.comprobada_en==='string'&&Number.isFinite(Date.parse(h.comprobada_en)):h.sql===null&&h.comprobada_en===null)&&
      h.efectiva===(h.verificada&&h.servidor&&h.sql===true);
    const habilitacion=habilitacionValida?Object.freeze({...h}):null;
    return data.operaciones.map(op => Object.freeze({ ...op,habilitacion:op.objetivo_id===objetivo?habilitacion:null }));
  },
  async continuarEliminacionPreparada(op, password, nombre, confirmacion) {
    const actuales = await this.consultarEliminacionesPendientes(op?.operacion_id);
    const original = actuales.find(item => item.operacion_id === op?.operacion_id);
    if (!original || original.habilitacion?.efectiva!==true || original.estado !== 'PREPARADA' || original.intentos_auth !== 0 ||
        ['request_id','objetivo_id','nombre','motivo','fingerprint'].some(k => original[k] !== op[k]) ||
        nombre !== original.nombre || confirmacion !== true)
      throw new Error('La operación cambió o no admite continuación. Vuelve a consultarla.');
    return this.ejecutarEliminacion(this.construirEntradaEliminacion({usuario:{id:original.objetivo_id,nombre:original.nombre},
      operacionId:original.request_id,nombre,motivo:original.motivo,confirmacion}), password,
      { operacion_id: original.operacion_id, fingerprint: original.fingerprint });
  },
  // La recuperación usa el protocolo ya existente de seis campos y la referencia
  // original. El backend V2 decide por estado durable; no hay un nuevo Auth Delete.
  async recuperarEliminacionIniciada(op, password, nombre, confirmacion) {
    const actuales = await this.consultarEliminacionesPendientes(op?.operacion_id);
    const original = actuales.find(item => item.operacion_id === op?.operacion_id);
    if (!original || original.habilitacion?.efectiva!==true || original.intentos_auth !== 1 || !['AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION'].includes(original.estado) ||
        ['request_id','objetivo_id','nombre','motivo','fingerprint','estado','intentos_auth'].some(k => original[k] !== op[k]) ||
        nombre !== original.nombre || confirmacion !== true)
      throw new Error('La operación cambió o requiere otra revisión. Vuelve a consultar su estado.');
    const entrada = this.construirEntradaEliminacion({ usuario: {id:original.objetivo_id,nombre:original.nombre},
      operacionId:original.request_id,nombre,motivo:original.motivo,confirmacion });
    return this.ejecutarEliminacion(entrada,password,null,original.operacion_id);
  },
  async ejecutarEliminacion(entrada, password, pendiente = null, operacionEsperada = null) {
    const keys = ['usuario_id', 'operacion_id', 'nombre_confirmacion', 'motivo', 'confirmacion'];
    if (!entrada || Object.keys(entrada).length !== keys.length || !keys.every(k => Object.hasOwn(entrada, k)) ||
        typeof password !== 'string' || !password || password.length > 4096)
      throw new Error('Revisa los campos y escribe tu contraseña de reautenticación.');
    const body = { ...this.construirEntradaEliminacion({ usuario: { id: entrada.usuario_id, nombre: entrada.nombre_confirmacion },
      operacionId: entrada.operacion_id, nombre: entrada.nombre_confirmacion, motivo: entrada.motivo,
      confirmacion: entrada.confirmacion }), password };
    const client = window.supabaseClient;
    try {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth?.user?.id || auth.user.id.toLowerCase() === body.usuario_id ||
          (await this.getMiEstadoAdministrativo(true)).es_admin_permanente !== true) throw new Error();
      const { data, error } = await client.functions.invoke('usuario-eliminacion-ejecutar', { body: pendiente ? {
        accion: 'CONTINUAR_PREPARADA', operacion_id: pendiente.operacion_id, fingerprint: pendiente.fingerprint,
        nombre_confirmacion: body.nombre_confirmacion, confirmacion: body.confirmacion, password: body.password,
      } : body });
      let response = data;
      if (error?.context && typeof error.context.json === 'function') {
        try { response = await error.context.json(); } catch (_) { response = null; }
      }
      if (!error && response?.resultado === 'COMPLETADA' && response.eliminacion_ejecutada === true &&
          typeof response.operacion_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(response.operacion_id) &&
          (!(pendiente?.operacion_id || operacionEsperada) || response.operacion_id === (pendiente?.operacion_id || operacionEsperada)))
        return { resultado: 'COMPLETADA', eliminacion_ejecutada: true, operacion_id: response.operacion_id };
      const code = response?.error;
      const safe = new Error(code === 'REQUIERE_REVISION'
        ? 'La operación requiere revisión manual. No vuelvas a intentar la eliminación.'
        : code === 'ELIMINACION_REAL_DESHABILITADA'
          ? 'La eliminación todavía no está disponible.'
          : 'No se pudo confirmar la eliminación. No vuelvas a enviarla; solicita una revisión manual.');
      if (['43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4','d642838d-19df-4fd5-994a-77c6b63795ad'].includes(body.usuario_id) &&
          code !== 'REQUIERE_REVISION') {
        safe.message = code === 'COMPUERTA_EXCEPCIONAL_CERRADA'
          ? 'La compuerta de eliminación excepcional está cerrada. No se autorizó la eliminación. No vuelvas a enviar la solicitud sin autorización administrativa.'
          : 'El backend no confirmó la eliminación excepcional. Debe verificarse la instalación coordinada de las funciones SQL excepcionales y las Edge Functions. La operación permanece bloqueada; no vuelvas a enviarla. Solicita revisión manual.';
      }
      // DEL-FIX-06: solo campos y valores autorizados; nunca copiar el objeto del servidor.
      const d = response?.diagnostico;
      if (d && ["VALIDACION_SOLICITUD","CONEXION_TRANSACCION","CONFIGURACION_CONTEXTO","VALIDACION_OPERACION","RPC_INICIAR","VALIDAR_RESPUESTA_INICIO","VERIFICAR_INICIO_DURABLE","COORDINACION_EJECUCION","RENOVAR_REAUTENTICACION","V2_LEER","V2_PREPARAR","V2_CERTIFICAR","V2_FISICA_PREVIA","V2_FISICA_POSTERIOR","V2_RPC_INICIAR","V2_VERIFICAR_INICIO","V2_CONFIRMAR_AUTH","V2_RECUPERAR","V2_FINALIZAR","V2_REGISTRAR_REVISION"].includes(d.etapa) &&
          ["SQL_EXCEPCIONAL_NO_ACREDITADO","OPERACION_NO_VINCULADA","CONFIRMACION_INVALIDA","SESION_REQUERIDA","SOLO_ADMIN_PERMANENTE","CUENTA_PROPIA","REAUTENTICACION_NO_ACREDITADA","CONTEXTO_SQL_NO_ACREDITADO","REFERENCIAS_SOBREVENIDAS","AUDITORIA_NO_VERIFICABLE","REAUTENTICACION_REUTILIZADA","INTENCION_NO_ADMITIDA","INICIO_IRREVERSIBLE_NO_IMPLEMENTADO","OPERACION_AMBIGUA","CONTRATO_SQL_INVALIDO","CONFLICTO_IDEMPOTENCIA","COMPUERTA_EXCEPCIONAL_CERRADA","INICIO_NO_ACREDITADO","REAUTENTICACION_NO_VINCULADA","OPERACION_CAMBIO","OBJETIVO_CAMBIO","HISTORIAL_NO_VERIFICABLE","RESULTADO_NO_VERIFICABLE","VERIFICACION_AUTH_PENDIENTE","CONTRATOS_SQL_NO_VERIFICABLES","RECUPERACION_NO_ACREDITADA","OPERACION_NO_VERIFICABLE","OPERACION_V2_NO_VERIFICABLE"].includes(d.codigo) &&
          ['VALIDACION_INTERNA','POSTGRESQL','NO_CLASIFICADO'].includes(d.tipo) && typeof d.correlacion === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.correlacion || '')) {
        safe.diagnostico = Object.freeze({ etapa: d.etapa, codigo: d.codigo, tipo: d.tipo,
          correlacion: d.correlacion,
          ...(d.tipo === 'POSTGRESQL' && d.sqlstate === 'P0001' && ["USUARIO_OBJETIVO_REQUERIDO","RELACION_NO_ADMITIDA","AISLAMIENTO_ELIMINACION_NO_CERTIFICADO","CONTEXTO_SQL_NO_ADMITIDO","SOLO_ADMIN_PERMANENTE","OPERACION_NO_INICIABLE","PRIVILEGIO_CAMBIO","ROL_O_NOMBRE_NO_ADMITIDO","AUTH_OBJETIVO_NO_EXISTE","RESERVA_EXISTENTE","GUARDAS_NO_ACREDITADAS","DEPENDENCIAS_NO_ADMITIDAS","COBERTURA_EVALUADOR_CAMBIO","REGISTROS_PERSONALES_PENDIENTES","HISTORIAL_CAMBIO","EVIDENCIA_SUPERA_LIMITE","PETICION_NO_VINCULADA","REAUTENTICACION_NO_ACREDITADA","OBJETIVO_CAMBIO","OPERACION_CAMBIO","RELACION_DOCUMENTAL_NO_ADMITIDA","SOLO_ADMINISTRADOR_PERMANENTE","IDENTIDADES_DOCUMENTALES_NO_AUTORIZADAS","INSERT_DOCUMENTAL_MANIPULADO","DECLARACION_DOCUMENTAL_INMUTABLE","DOCUMENTO_DISPONIBLE_INMUTABLE","REVISION_CON_EVIDENCIA_NO_ADMITIDA","TRANSICION_DOCUMENTAL_NO_ADMITIDA","OBJETO_STORAGE_NO_COINCIDE","EVENTO_DOCUMENTAL_NO_ADMITIDO","RELACION_LABORAL_NO_ADMITIDA","EVENTO_LABORAL_NO_ADMITIDO","P0001_NO_CLASIFICADO","ELIMINACION_INTEGRAL_V2_DESHABILITADA","CERTIFICADO_V2_DESACTUALIZADO","CERTIFICADO_V2_NO_ACREDITADO","REGISTROS_INDIVIDUALES_V2_CAMBIARON","MIGRACION_INSTITUCIONAL_REQUERIDA","RETIRO_O_MIGRACION_V2_PENDIENTE","FISICA_POSTERIOR_V2_PENDIENTE","AUSENCIA_AUTH_V2_NO_ACREDITADA","REAUTENTICACION_V2_NO_ACREDITADA","REAUTENTICACION_V2_VENCIDA_O_CONSUMIDA"].includes(d.rechazo_sql)
            ? { rechazo_sql: d.rechazo_sql } : {}),
          ...(d.tipo === 'POSTGRESQL' && ['P0001','42501','55000','55P03','57014','40001','40P01','23503','23505','23514','22P02','42883','42703','42P01','08006','08001'].includes(d.sqlstate)
            ? { sqlstate: d.sqlstate } : {}),
        });
      }
      safe.codigo = code === 'REQUIERE_REVISION' || code === 'ELIMINACION_REAL_DESHABILITADA' ? code : 'RESULTADO_NO_VERIFICABLE';
      if (typeof response?.operacion_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(response.operacion_id))
        safe.operacion_id = response.operacion_id;
      throw safe;
    } catch (error) {
      if (['REQUIERE_REVISION', 'ELIMINACION_REAL_DESHABILITADA', 'RESULTADO_NO_VERIFICABLE'].includes(error?.codigo)) throw error;
      const safe = new Error('No se pudo confirmar la eliminación. No vuelvas a enviarla; solicita una revisión manual.');
      safe.codigo = 'RESULTADO_NO_VERIFICABLE'; throw safe;
    } finally { body.password = ''; password = ''; }
  },
  // PASO365_LECTURAS_INICIO: contratos de lectura, sin claves privilegiadas.
  etiquetasConservacionV2: Object.freeze({
    'public.usuarios_identidades_historicas':'Identidad histórica','public.trabajadores':'Ficha laboral',
    'public.cuentas_documentos':'Documentos de cuentas','public.cuentas_documentos_retiros':'Retiros documentales',
    'public.trabajadores_documentos':'Documentos laborales','public.prevencion_documentos':'Documentos de Prevención',
    'storage.objects':'Archivos de Storage','storage.buckets':'Contenedores de archivos',
    'public.tareas':'Tareas anteriores','public.mantenciones':'Mantenciones anteriores','public.tareas_pendientes':'Trabajos',
    'public.tareas_pendientes_asignaciones':'Asignaciones de trabajos','public.tareas_pendientes_operaciones':'Historial de trabajos',
    'public.mantenciones_operativas':'Mantenciones generales','public.mantenciones_operativas_responsables':'Responsables de mantenciones',
    'public.mantenciones_reactivas':'Mantenciones reactivas','public.mantencion_historial':'Revisiones de mantención',
    'public.mantencion_historial_anulaciones':'Anulaciones de revisiones','public.mantenciones_operativas_anulaciones':'Anulaciones de mantenciones',
    'public.usuarios_gestion_auditoria':'Auditoría de cuentas','public.del_registro_eliminaciones':'Auditoría de eliminaciones',
    'public.usuarios_eliminaciones_operaciones':'Operaciones de eliminación','public.guia_contenido_auditoria':'Auditoría de guías',
    'public.inventario_catalogo_auditoria':'Auditoría del catálogo','public.inventario_entradas_formatos':'Formatos de entradas',
    'public.inventario_movimientos':'Movimientos de inventario','public.inventario_movimientos_anulaciones':'Anulaciones de movimientos',
    'public.inventario_productos':'Productos registrados','public.bodegas_inventariados':'Inventariados históricos',
    'public.jardineria_contenido_auditoria':'Auditoría de Jardinería','public.prevencion_gantt_contenido_auditoria':'Auditoría de Prevención',
    'public.administraciones_temporales':'Delegaciones administrativas','public.solicitudes_reactivas':'Solicitudes',
    'public.solicitudes_reactivas_avisos':'Avisos de solicitudes','public.solicitudes_reactivas_avisos_estado':'Estados de avisos',
    'public.solicitudes_notificaciones_revision':'Notificaciones de revisión','public.solicitudes_reactivas_eliminaciones_auditoria':'Auditoría de solicitudes',
    'public.solicitudes_reactivas_eventos':'Eventos de solicitudes','public.alertas':'Alertas',
    'public.usuarios_correos_verificados':'Constancias de correo','public.usuarios_sesion_cambios':'Señales de sesión',
    'public.usuarios_trabajadores_vinculos_auditoria':'Auditoría de vínculos laborales','public.mantenciones_reactivas_ciclos':'Ciclos de mantención reactiva',
    'public.televisores_habitaciones':'Televisores asociados','public.televisores_habitaciones_auditoria':'Auditoría de televisores',
    'public.usuarios_creaciones_manuales_operaciones':'Constancias de creación de cuentas',
  }),
  async consultarResumenConservacion(id) {
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!uuid.test(id||''))throw new Error('Cuenta no verificable.');
    const client=window.supabaseClient,auth=await client.auth.getUser();
    if(auth.error||!auth.data?.user?.id||(await this.getMiEstadoAdministrativo(true)).es_admin_permanente!==true)
      throw new Error('Se requiere Administrador permanente.');
    const {data,error}=await client.functions.invoke('usuario-eliminacion-ejecutar',{body:{accion:'RESUMEN_CONSERVACION_V2',usuario_id:id.toLowerCase()}});
    const count=n=>Number.isSafeInteger(n)&&n>=0;
    if(error||data?.contrato!=='usuario-eliminacion-resumen/v2'||data.usuario_id!==id.toLowerCase()||data.eliminacion_ejecutada!==false||
       data.eliminacion_habilitada!==false||data.puede_eliminar!==false||data.conservacion_certificada!==false||
       data.verificacion_fisica!=='pendiente'||!Number.isFinite(Date.parse(data.comprobado_en))||
       !Array.isArray(data.registros)||data.registros.length!==46||new Set(data.registros.map(r=>r.tabla)).size!==46||
       data.registros.some(r=>!Object.hasOwn(this.etiquetasConservacionV2,r.tabla)||!count(r.cantidad))||
       !['archivos_propiedad_individual','retiros_pendientes','migraciones_pendientes'].every(k=>count(data[k]))||
       (data.ficha_laboral!==null&&(!uuid.test(data.ficha_laboral?.id||'')||typeof data.ficha_laboral.nombre!=='string'||!data.ficha_laboral.nombre.trim())))
      throw new Error('No se pudo verificar el resumen de conservación. No se permite eliminar.');
    const current=await client.auth.getUser();
    if(current.error||current.data?.user?.id!==auth.data.user.id)throw new Error('La sesión cambió durante la consulta.');
    const objetivo=id.toLowerCase();
    const h=data.habilitacion;
    const habilitacionValida=!!h&&!Array.isArray(h)&&Object.keys(h).length===8&&
      h.contrato==='usuario-eliminacion-habilitacion/v2'&&h.objetivo_id===objetivo&&
      uuid.test(objetivo||'')&&typeof h.servidor==='boolean'&&
      typeof h.verificada==='boolean'&&typeof h.efectiva==='boolean'&&h.autoriza_auth===false&&
      (h.verificada?typeof h.sql==='boolean'&&typeof h.comprobada_en==='string'&&Number.isFinite(Date.parse(h.comprobada_en)):h.sql===null&&h.comprobada_en===null)&&
      h.efectiva===(h.verificada&&h.servidor&&h.sql===true);
    const habilitacion=habilitacionValida?Object.freeze({...h}):null;
    return {...data,habilitacion};
  },
  async consultarIdentidadesHistoricas(modulo,ids,{tareas=[]}={}) {
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const unicos=[...new Set(ids.map(id=>String(id).toLowerCase()))];
    if(unicos.some(id=>!uuid.test(id)))throw new Error('Registros históricos no verificables.');
    if(!unicos.length)return [];
    const client=window.supabaseClient,auth=await client.auth.getUser();
    if(auth.error||!auth.data?.user?.id)throw new Error('La sesión no es válida.');
    const result=[];
    for(let desde=0;desde<unicos.length;desde+=20){
      const lote=unicos.slice(desde,desde+20);
      let response;
      try { response=await client.functions.invoke('usuario-eliminacion-ejecutar',{body:{accion:'CONSULTAR_IDENTIDADES_HISTORICAS',modulo,registros:lote,...(modulo==='TAREAS'?{tareas}: {})}}); }
      catch { response={error:true}; }
      const {data,error}=response;
      const unavailable=()=>Object.assign(new Error('No se pudieron verificar las etiquetas históricas. Se conservan los nombres originales.'),{codigo:'LECTURA_HISTORICA_NO_DISPONIBLE',diagnostico:{etapa:'LECTURA_HISTORICA_V2',codigo:'LECTURA_HISTORICA_NO_DISPONIBLE'}});
      if(error||data?.contrato!=='usuario-identidades-historicas/v2'||data.modulo!==modulo||data.eliminacion_ejecutada!==false||
         !Array.isArray(data.registros_autorizados)||data.registros_autorizados.length!==lote.length||
         new Set(data.registros_autorizados).size!==lote.length||data.registros_autorizados.some(id=>!lote.includes(id))||!Array.isArray(data.identidades))
        throw unavailable();
      const seen=new Set();
      for(const r of data.identidades){
        const key=r.registro_id+'|'+r.origen_id+'|'+r.referencia_id+'|'+r.tipo;
        if(seen.has(key)||!lote.includes(r.registro_id)||!uuid.test(r.origen_id||'')||!uuid.test(r.referencia_id||'')||
           !['cuenta','trabajador'].includes(r.tipo)||r.cuenta_eliminada!==true||typeof r.nombre_snapshot!=='string'||!r.nombre_snapshot.trim()||
           (modulo==='TAREAS_OPERACIONES'&&(!Number.isSafeInteger(r.revision)||r.revision<0)))throw unavailable();
        seen.add(key);result.push(r);
      }
    }
    const current=await client.auth.getUser();
    if(current.error||current.data?.user?.id!==auth.data.user.id)throw new Error('La sesión cambió durante la consulta.');
    return result;
  },
  nombreParaMostrar(fila,campo) {
    return fila?.nombres_historicos?.[campo] ?? fila?.[campo];
  },
  async anotarNombresHistoricos(modulo,filas,{padreId=null}={}) {
    if(!Array.isArray(filas)||!filas.length)return filas;
    // Las proyecciones acreditadas no aportan claves para etiquetar estas filas.
    if(modulo==='TAREAS'||modulo==='TAREAS_OPERACIONES')return filas;
    const pertinentes=modulo==='TAREAS_REGISTROS'?filas.filter(f=>typeof f.retirada_por==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(f.retirada_por)):filas;
    if(!pertinentes.length)return filas;
    const ids=pertinentes.map(f=>f.id);
    let referencias;
    try { referencias=await this.consultarIdentidadesHistoricas(modulo,ids,{tareas:[...new Set(filas.map(f=>f.tarea_id).filter(Boolean))]}); }
    catch(error) {
      if(!['TAREAS','TAREAS_REGISTROS','TAREAS_OPERACIONES'].includes(modulo)||error.codigo!=='LECTURA_HISTORICA_NO_DISPONIBLE')throw error;
      // Solo falla el enriquecimiento: el consumidor ya comprobó su lectura
      // principal. No se reutilizan etiquetas antiguas ni se oculta ese error.
      return filas.map(f=>{const {nombres_historicos,...original}=f;return {...original,lectura_historica:{estado:'NO_DISPONIBLE',codigo:error.codigo}};});
    }
    const configs={
      TAREAS:[['asignada_por','asignada_por_nombre_snapshot'],['completada_por','completada_por_nombre_snapshot'],['retirada_por','retirada_por_nombre_snapshot'],['ejecutor_id','ejecutor_nombre_snapshot'],['trabajador_id','trabajador_nombre','trabajador']],
      TAREAS_REGISTROS:[['creada_por','creador_nombre_snapshot'],['completada_por','completada_por_nombre_snapshot'],['retirada_por','retirada_por_nombre_snapshot']],
      MANTENCIONES:[['registrado_por','autor_nombre_snapshot']],HISTORIAL:[['revisado_por','autor_nombre_snapshot']],
      REACTIVAS_EVENTOS:[['actor_id','actor_nombre_snapshot']],REACTIVAS_CICLOS:[['responsable_trabajador_id','responsable_nombre','trabajador']],
      SOLICITUDES:[['creada_por','creador_nombre_snapshot'],['revisada_por','revisor_nombre_snapshot'],['anulada_por','anulador_nombre_snapshot']],
      DOCUMENTOS_CUENTA:[['cuenta_id','cuenta_nombre_snapshot'],['creado_por','creado_por_nombre_snapshot']],
      DOCUMENTOS_TRABAJADOR:[['creado_por','creador_nombre_snapshot']],MANTENCIONES_ANTIGUAS:[['responsable_id','responsable_texto']],
    };
    const mark=(row,parent,fields,origin=row.id||parent)=>{
      const labels={};
      for(const [ref,field,tipo='cuenta']of fields){
        const verified=referencias.find(r=>r.registro_id===parent&&r.origen_id===origin&&r.referencia_id===row[ref]&&r.tipo===tipo);
        if(verified){const name=typeof row[field]==='string'&&row[field].trim()?row[field]:verified.nombre_snapshot;
          labels[field]=name.endsWith(' (cuenta eliminada)')?name:name+' (cuenta eliminada)';}
      }
      return Object.keys(labels).length?{...row,nombres_historicos:labels}:row;
    };
    return filas.map(f=>{
      if(modulo==='TAREAS_OPERACIONES'){
        const verified=referencias.find(r=>r.registro_id===padreId&&r.revision===f.revision&&r.tipo==='cuenta');
        return verified?{...f,nombres_historicos:{actor_nombre:(f.actor_nombre||verified.nombre_snapshot)+' (cuenta eliminada)'}}:f;
      }
      let row=mark(f,f.id,configs[modulo]||[]);
      if(row.anulacion)row={...row,anulacion:mark(row.anulacion,f.id,[['anulado_por','autor_nombre_snapshot']],f.id)};
      if(modulo==='MANTENCIONES'&&Array.isArray(row.responsables))row={...row,responsables:row.responsables.map(r=>mark(r,f.id,[['trabajador_id','nombre','trabajador']],f.id))};
      if(modulo==='TAREAS_REGISTROS'&&Array.isArray(row.asignaciones))row={...row,asignaciones:row.asignaciones.map(r=>mark(r,f.id,configs.TAREAS))};
      return row;
    });
  },
  // PASO365_LECTURAS_FIN
  // Solo invoca la Edge Function de lectura existente con el cliente/sesión actuales.
  // Su despliegue/configuración no se presupone; cualquier error se propaga sin datos internos.
  async previsualizarEliminacion(id) {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw new Error('Identificador de cuenta inválido.');
    const client = window.supabaseClient;
    try {
      const { data: auth, error } = await client.auth.getUser();
      if (error || !auth?.user?.id) throw new Error();
      const actor = auth.user.id;
      const estado = await this.getMiEstadoAdministrativo(true);
      if (estado.es_admin_permanente !== true) throw new Error();
      const { data, error: invocationError } = await client.functions.invoke('usuario-eliminacion-previsualizar', {
        body: { usuario_id: id.toLowerCase() },
      });
      if (invocationError) throw new Error();
      const { data: actual, error: sessionError } = await client.auth.getUser();
      if (sessionError || actual?.user?.id !== actor) throw new Error();
      return validarRespuestaPrevisualizacionUsuario(data, id);
    } catch (error) {
      const safe = new Error('No fue posible consultar las dependencias');
      safe.codigo = error?.codigo === 'PREVISUALIZACION_INCOMPLETA' ? error.codigo : 'PREVISUALIZACION_NO_DISPONIBLE';
      throw safe; // No registrar JWT, cabeceras ni errores internos de Functions.
    }
  },
  // Primero revisión, después perfil: nunca combinar un perfil antiguo
  // con una revisión nueva. No se usa caché para abrir una operación.
  async getContextoGestion(id) {
    const { data, error } = await window.supabaseClient
      .from('usuarios_gestion_auditoria').select('id')
      .eq('objetivo_id', id).order('id', { ascending: false }).limit(1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('No se pudo verificar la revisión de gestión.');
    if (typeof data?.[0]?.id === 'number' && !Number.isSafeInteger(data[0].id))
      throw new Error('La revisión supera la precisión disponible; no se abrirá la operación.');
    const revision = String(data?.[0]?.id ?? '0');
    if (!/^\d+$/.test(revision)) throw new Error('Revisión de gestión no válida.');
    const usuario = await this.getUsuario(id, true);
    if (!usuario || usuario.id !== id) throw new Error('Usuario no encontrado.');
    return Object.freeze({ usuario: Object.freeze({ ...usuario }), revision_gestion: revision });
  },

  async gestionarUsuario(operacion, parametros) {
    const nombres = {
      CAMBIAR_ROL: 'usuario_cambiar_rol',
      DESACTIVAR: 'usuario_desactivar', REACTIVAR: 'usuario_reactivar'
    };
    if (!nombres[operacion]) throw new Error('Operación no válida.');
    const p = { ...parametros };
    if (!p.p_solicitud_id || !p.p_usuario_id || !p.p_rol_esperado ||
        !/^\d+$/.test(String(p.p_revision_esperada)) ||
        (p.p_estado_esperado !== null && typeof p.p_estado_esperado !== 'boolean') ||
        typeof p.p_confirmar_administrador !== 'boolean' ||
        typeof p.p_motivo !== 'string' ||
        [...p.p_motivo.trim()].length < 10 || [...p.p_motivo.trim()].length > 1000) {
      throw new Error('Revisa los datos y el motivo de la operación.');
    }
    const { data, error } = await window.supabaseClient.rpc(nombres[operacion], p);
    if (error) throw error;
    if (!data?.ok || !data.auditoria) throw new Error('Respuesta de gestión no válida.');
    this.clearCache();
    return data;
  },
  _usuariosCache: null,             // lista completa de public.usuarios
  _usuarioDetalleCache: {},         // clave: id (uuid)
  _rolesCache: null,                // lista completa de public.roles
  _miEstadoAdminCache: null,        // S3C-2C: estado administrativo propio
  _administracionesCache: null,     // S3C-2C: ledger de administraciones temporales

  // ----------------------------------------------------------
  // getUsuarios(force = false)
  // Todos los usuarios reales visibles bajo las policies SELECT de
  // public.usuarios (un usuario normal verá únicamente su propio
  // perfil; un Administrador verá todos).
  // Orden estable: nombre ASC, email ASC, id ASC (desempate).
  // NO lee auth.users, localStorage, state.users ni mockData.
  // ----------------------------------------------------------
  async getSesionActual(usuarioId) {
    const { data: auth, error: errorAuth } = await window.supabaseClient.auth.getUser();
    if (errorAuth) throw errorAuth;
    if (!auth?.user || auth.user.id !== usuarioId) throw new Error('SESION_CAMBIADA: vuelve a iniciar sesión.');
    const señal = async () => {
      const { data, error } = await window.supabaseClient.from('usuarios_sesion_cambios')
        .select('usuario_id,revision').eq('usuario_id', usuarioId).maybeSingle();
      if (error) throw error;
      return data ? String(data.revision) : null;
    };
    const revisionAntes = await señal();
    const { data: perfil, error: errorPerfil } = await window.supabaseClient.from('usuarios')
      .select('id,rol_id,nombre,email,estado').eq('id', usuarioId).maybeSingle();
    if (errorPerfil) throw errorPerfil;
    let nombreRol = null, administrativo = { es_admin_permanente:false, es_admin_temporal:false, vigente_hasta:null }, delegaciones = [];
    if (perfil?.estado === true && perfil.rol_id) {
      const [rol, estado] = await Promise.all([
        window.supabaseClient.from('roles').select('nombre').eq('id', perfil.rol_id).maybeSingle(),
        window.supabaseClient.rpc('mi_estado_administrativo')
      ]);
      if (rol.error) throw rol.error;
      if (estado.error) throw estado.error;
      if (!rol.data?.nombre) throw new Error('No se pudo verificar el rol actual.');
      nombreRol = rol.data.nombre;
      const fila = Array.isArray(estado.data) ? estado.data[0] : estado.data;
      if (!fila || typeof fila.es_admin_permanente !== 'boolean' || typeof fila.es_admin_temporal !== 'boolean') throw new Error('El estado administrativo está incompleto.');
      administrativo = fila;
      // RLS y filtro propio; nunca se usa el reloj local para conceder acceso.
      for (let desde = 0; ;) {
        const { data, count, error } = await window.supabaseClient.from('administraciones_temporales')
          .select('id,usuario_id,vigente_desde,vigente_hasta,revocado_at', { count:'exact' })
          .eq('usuario_id', usuarioId).is('revocado_at', null)
          .order('vigente_desde', { ascending:true }).order('id', { ascending:true }).range(desde, desde + 199);
        if (error) throw error;
        if (!Array.isArray(data) || !Number.isInteger(count)) throw new Error('No se pudieron verificar las fechas de las delegaciones propias.');
        delegaciones.push(...data);
        if (desde + data.length >= count) break;
        if (!data.length) throw new Error('Las delegaciones cambiaron durante la consulta.');
        desde += data.length;
      }
    }
    const revisionDespues = await señal();
    if (revisionAntes !== revisionDespues) throw new Error('SESION_EN_TRANSICION: los permisos cambiaron durante la consulta.');
    return { authUser:auth.user, perfil, nombreRol, administrativo, delegaciones };
  },
  async getCorreosVerificados() {
    const ids = new Set();
    for (let desde = 0; ;) {
      const { data, count, error } = await window.supabaseClient.from('usuarios_correos_verificados')
        .select('usuario_id,verificado_en', { count: 'exact' }).order('usuario_id', { ascending: true }).range(desde, desde + 199);
      if (error) throw error;
      if (!Array.isArray(data) || !Number.isInteger(count)) throw new Error('La verificación de correos está incompleta.');
      data.forEach(fila => { if (fila.usuario_id) ids.add(fila.usuario_id); });
      if (desde + data.length >= count) return ids;
      if (!data.length) throw new Error('La verificación de correos cambió durante la consulta. Vuelve a intentarlo.');
      desde += data.length;
    }
  },
  async getUsuarios(force = false) {
    if (!force && this._usuariosCache) return this._usuariosCache;
    if (this._usuariosLecturaEnCurso) return this._usuariosLecturaEnCurso;
    const tarea = (async () => {
      const [respuesta, verificados] = await Promise.all([
        window.supabaseClient.from('usuarios')
          .select('id, nombre, email, estado, rol_id, trabajador_id, roles(nombre)')
          .order('nombre', { ascending: true }).order('email', { ascending: true }).order('id', { ascending: true }),
        this.getCorreosVerificados()
      ]);
      if (respuesta.error) throw respuesta.error;
      if (!Array.isArray(respuesta.data)) throw new Error('La respuesta de usuarios está incompleta.');
      // Las cuentas aprobadas conservan su gestión; ninguna cuenta sin rol
      // se presenta antes de comprobar su correo mediante la tabla protegida.
      const usuarios = respuesta.data.filter(u => u.rol_id != null || verificados.has(u.id) || usuarioEsExcepcionalEliminacion(u))
        .map(u => ({ ...u, correo_verificado: verificados.has(u.id) }));
      this._usuariosCache = usuarios;
      return usuarios;
    })();
    this._usuariosLecturaEnCurso = tarea;
    try { return await tarea; }
    finally { if (this._usuariosLecturaEnCurso === tarea) this._usuariosLecturaEnCurso = null; }
  },

  // ----------------------------------------------------------
  // getUsuario(id, force = false)
  // Un usuario real por UUID (public.usuarios con join a roles).
  // Mismas columnas explícitas que getUsuarios.
  // Si el UUID no existe (o RLS no permite leerlo), .single()
  // devuelve error y se re-lanza: NO se inventa un usuario.
  // ----------------------------------------------------------
  async getUsuario(id, force = false) {
    if (!id || typeof id !== 'string') {
      throw new Error('UsuariosService.getUsuario: falta el id (uuid) del usuario.');
    }
    if (!force && this._usuarioDetalleCache[id]) {
      return this._usuarioDetalleCache[id];
    }

    try {
      const { data: usuario, error } = await window.supabaseClient
        .from('usuarios')
        .select('id, nombre, email, estado, rol_id, trabajador_id, roles(nombre)')
        .eq('id', id)
        .single();

      if (error) throw error;

      this._usuarioDetalleCache[id] = usuario || null;
      return this._usuarioDetalleCache[id];
    } catch (e) {
      console.error('Error completo Supabase en UsuariosService.getUsuario:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // getRoles(force = false)
  // Los roles REALES desde public.roles (fuente única de verdad).
  // NO se hardcodean ADMINISTRADOR / TECNICO / RECEPCION /
  // SOLICITANTE: los nombres actuales (Administrador, Recepción,
  // Técnico) se leen desde la base de datos.
  // Orden estable: nombre ASC, id ASC.
  // ----------------------------------------------------------
  async getRoles(force = false) {
    if (!force && this._rolesCache) return this._rolesCache;

    try {
      const { data: roles, error } = await window.supabaseClient
        .from('roles')
        .select('id, nombre')
        .order('nombre', { ascending: true })
        .order('id', { ascending: true }); // desempate estable

      if (error) throw error;

      this._rolesCache = roles || [];
      return this._rolesCache;
    } catch (e) {
      console.error('Error completo Supabase en UsuariosService.getRoles:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // aprobarUsuario(id, datos)
  // FASE S3C-1E: aprueba una cuenta PENDIENTE (estado = true y
  // rol_id = NULL) asignándole UN ROL NORMAL (Recepción / Técnico).
  //
  // MECANISMO: RPC SEGURA de PostgreSQL (única vía de escritura):
  //   public.aprobar_usuario_normal(p_usuario_id uuid, p_rol_id uuid)
  // SECURITY DEFINER + SET search_path. authenticated YA NO tiene
  // UPDATE directo sobre public.usuarios.rol_id: el UPDATE directo
  // por REST fue revocado en S3C-1E (backend). Esta función NO hace
  // .from('usuarios').update(...) en ninguna rama.
  //
  // Acepta EXCLUSIVAMENTE:
  //   - rol_id  (string, obligatorio, DEBE existir en
  //              UsuariosService.getRoles() → public.roles)
  // datos.nombre es IGNORADO deliberadamente: el nombre lo escribió
  // el propio usuario al registrarse (trigger handle_new_auth_user →
  // public.usuarios.nombre) y NUNCA se reescribe.
  //
  // Validaciones UX previas (DEFENSA ADICIONAL, no autorización):
  //   1. El usuario real EXISTE (getUsuario(id, true)).
  //   2. public.usuarios.nombre real NO está vacío.
  //   3. estado === true (cuenta vigente).
  //   4. rol_id actual === null (solicitud aún no aprobada).
  //   5. id !== auth.uid() (nadie se aprueba a sí mismo).
  //   6. El rol existe, NO es Administrador y pertenece al allowlist
  //      de roles normales (normalización: mayúsculas + tildes).
  // La AUTORIZACIÓN REAL (es_administrador_actual, rol no
  // Administrador, solicitud pendiente, nombre no vacío, etc.) la
  // ejecuta PostgreSQL DENTRO de la RPC, antes de cualquier
  // escritura. Nada de lo que envíe el navegador cambia eso.
  //
  // Devuelve la fila aprobada ADAPTADA al formato del frontend:
  //   { id, nombre, email, estado, rol_id, roles: { nombre } }
  // Invalida la caché del service (clearCache) tras el éxito.
  // NO fallback mock, NO localStorage, NO service_role, NO auth.admin.
  // ----------------------------------------------------------
  async aprobarUsuario(id, datos = {}) {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new Error('UsuariosService.aprobarUsuario: falta el id (uuid) del usuario.');
    }
    const idUsuario = id.trim();

    if (!datos || typeof datos !== 'object') {
      throw new Error('UsuariosService.aprobarUsuario: faltan los datos de la aprobación.');
    }

    // Sólo interesa el rol: el nombre NO se envía ni se reescribe
    // (S3C-1D: nombre proveniente del registro público).
    const rolId = typeof datos.rol_id === 'string' ? datos.rol_id.trim() : '';
    if (!rolId) {
      throw new Error('UsuariosService.aprobarUsuario: falta el rol_id.');
    }

    // ---- 1-4. La solicitud real se vuelve a consultar en Supabase ----
    // Nada de esto se confía en el DOM de la vista.
    const usuario = await this.getUsuario(idUsuario, true);
    if (!usuario) {
      const errNoExiste = new Error(
        'UsuariosService.aprobarUsuario: la cuenta no existe o no es visible bajo RLS.'
      );
      errNoExiste.codigo = 'SOLICITUD_NO_PENDIENTE';
      throw errNoExiste;
    }

    const nombreReal = (typeof usuario.nombre === 'string') ? usuario.nombre.trim() : '';
    if (!nombreReal) {
      // Cuenta legacy/manual sin nombre: NO puede aprobarse en el
      // flujo normal (el nombre debe venir del registro público).
      const errSinNombre = new Error(
        'UsuariosService.aprobarUsuario: la solicitud no contiene un nombre válido.'
      );
      errSinNombre.codigo = 'SOLICITUD_SIN_NOMBRE';
      throw errSinNombre;
    }

    if (usuario.estado !== true) {
      const errInactiva = new Error(
        'UsuariosService.aprobarUsuario: la cuenta no está vigente (estado !== true).'
      );
      errInactiva.codigo = 'SOLICITUD_NO_PENDIENTE';
      throw errInactiva;
    }

    if (!(usuario.rol_id === null || usuario.rol_id === undefined)) {
      const errYaAprobada = new Error(
        'UsuariosService.aprobarUsuario: la cuenta ya tiene rol asignado.'
      );
      errYaAprobada.codigo = 'SOLICITUD_NO_PENDIENTE';
      throw errYaAprobada;
    }

    // ---- 5. Nadie se aprueba a sí mismo (defensa extra; RLS manda) ----
    let authUsuario = null;
    try {
      const { data: authData } = await window.supabaseClient.auth.getUser();
      authUsuario = (authData && authData.user) ? authData.user : null;
    } catch (e) {
      // Un fallo de red aquí no decide autorización: RLS es la
      // barrera real, por lo que sólo se informa y se continúa.
      console.warn('UsuariosService.aprobarUsuario: no se pudo verificar auth.uid() localmente.', e);
    }
    if (authUsuario && authUsuario.id === idUsuario) {
      const errPropia = new Error(
        'UsuariosService.aprobarUsuario: no es posible aprobar la propia cuenta.'
      );
      errPropia.codigo = 'SOLICITUD_NO_PENDIENTE';
      throw errPropia;
    }

    // ---- 6. El rol debe ser un rol REAL, NO Administrador y del ----
    // ---- allowlist de roles normales del flujo normal           ----
    const roles = await this.getRoles();
    if (!Array.isArray(roles) || !roles.some(r => r && r.id === rolId)) {
      const errRolInexistente = new Error(
        'UsuariosService.aprobarUsuario: el rol_id no corresponde a un rol real.'
      );
      errRolInexistente.codigo = 'ROL_NO_PERMITIDO';
      throw errRolInexistente;
    }

    const rolPedido = roles.find(r => r && r.id === rolId);
    const nombreRolNormalizado = normalizarNombreRol(rolPedido && rolPedido.nombre);

    if (nombreRolNormalizado === 'administrador') {
      // El flujo normal NUNCA puede otorgar Administrador.
      const errAdmin = new Error(
        'UsuariosService.aprobarUsuario: el rol Administrador requiere un proceso de autorización especial.'
      );
      errAdmin.codigo = 'ROL_ADMINISTRADOR';
      throw errAdmin;
    }

    // Allowlist de roles NORMALES (mismos que valida la RPC).
    // Sin UUIDs hardcodeados: se compara por nombre normalizado.
    if (USUARIOS_ROLES_NORMALES.indexOf(nombreRolNormalizado) === -1) {
      const errRolNoPermitido = new Error(
        'UsuariosService.aprobarUsuario: el rol no está permitido en la aprobación normal.'
      );
      errRolNoPermitido.codigo = 'ROL_NO_PERMITIDO';
      throw errRolNoPermitido;
    }

    // ---- ESCRITURA: EXCLUSIVAMENTE vía RPC SEGURA ----
    // public.aprobar_usuario_normal(p_usuario_id, p_rol_id).
    // NO hay .from('usuarios').update(...): authenticated ya no
    // tiene privilegio de UPDATE sobre usuarios.rol_id y la
    // autorización real vive dentro de la función (SECURITY DEFINER).
    try {
      const { data, error } = await window.supabaseClient
        .rpc('aprobar_usuario_normal', {
          p_usuario_id: idUsuario,
          p_rol_id: rolId
        });

      if (error) throw error;

      // La RPC devuelve un array (SETOF); se toma la primera fila.
      const fila = Array.isArray(data) ? data[0] : data;
      if (!fila || !fila.id) {
        throw new Error(
          'UsuariosService.aprobarUsuario: la RPC no devolvió la cuenta aprobada.'
        );
      }

      // Adaptador de respuesta: la RPC entrega `rol_nombre` plano y
      // el resto del frontend trabaja con roles: { nombre }.
      // Nada más cambia: id, nombre, email, estado y rol_id pasan
      // tal cual.
      const aprobado = {
        id: fila.id,
        nombre: fila.nombre,
        email: fila.email,
        estado: fila.estado,
        rol_id: fila.rol_id,
        roles: { nombre: fila.rol_nombre || null }
      };

      // Invalida usuarios, detalle y roles: la fila cambió de estado.
      this.clearCache();

      return aprobado;
    } catch (e) {
      // Traduce los tokens que lanza la RPC (p.ej.
      // "ROL_ADMINISTRADOR: el rol Administrador requiere...")
      // al campo .codigo que ya consume la UI actual (admin.js).
      const codigo = extraerCodigoErrorRPC(e);
      if (codigo && e && typeof e === 'object' && !e.codigo) e.codigo = codigo;

      console.error('Error completo Supabase en UsuariosService.aprobarUsuario:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // S3C-2C — getMiEstadoAdministrativo(force = false)
  // RPC public.mi_estado_administrativo() (SECURITY DEFINER en
  // backend; el reloj autoritativo es PostgreSQL now()). Devuelve
  // UNA fila que se normaliza SIEMPRE a:
  //   {
  //     es_admin_permanente: boolean,
  //     es_admin_temporal:   boolean,
  //     vigente_hasta:       string|null   // ISO timestamptz
  //   }
  // Caché interna (force = true obliga a revalidar). La revalidación
  // en app.js (visibilitychange / 5 min) usa force = true.
  // No se usa el reloj del navegador para decidir vigencia.
  // ----------------------------------------------------------
  async getMiEstadoAdministrativo(force = false) {
    if (!force && this._miEstadoAdminCache) return this._miEstadoAdminCache;

    try {
      const { data, error } = await window.supabaseClient
        .rpc('mi_estado_administrativo');

      if (error) throw error;

      // La RPC es de retorno simple (TABLE/SETOF de 1 fila).
      const fila = Array.isArray(data) ? data[0] : data;

      const estado = {
        es_admin_permanente: !!(fila && fila.es_admin_permanente),
        es_admin_temporal: !!(fila && fila.es_admin_temporal),
        vigente_hasta: (fila && fila.vigente_hasta) ? fila.vigente_hasta : null
      };

      this._miEstadoAdminCache = estado;
      return estado;
    } catch (e) {
      // Fail closed en el consumidor (app.js): aquí sólo se informa.
      console.error('Error completo Supabase en UsuariosService.getMiEstadoAdministrativo:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // S3C-2C — getAdministracionesTemporales(force = false)
  // Ledger público.administraciones_temporales (SOLO lectura).
  // La RLS del backend determina la visibilidad: un Administrador
  // PERMANENTE ve todo; un usuario normal sólo su propia fila.
  // Orden: created_at DESC (más reciente primero).
  // Columnas EXPLÍCITAS; nunca SELECT *. Sin INSERT/UPDATE/DELETE.
  // ----------------------------------------------------------
  async getAdministracionesTemporales(force = false) {
    if (!force && this._administracionesCache) return this._administracionesCache;

    try {
      const { data, error } = await window.supabaseClient
        .from('administraciones_temporales')
        .select('id, usuario_id, otorgado_por, vigente_desde, vigente_hasta, motivo, created_at, revocado_at, revocado_por')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true }); // desempate estable

      if (error) throw error;

      this._administracionesCache = data || [];
      return this._administracionesCache;
    } catch (e) {
      console.error('Error completo Supabase en UsuariosService.getAdministracionesTemporales:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // S3C-2C — otorgarAdministracionTemporal(datos)
  // RPC SEGURA public.otorgar_administracion_temporal(
  //   p_usuario_id, p_vigente_desde, p_vigente_hasta,
  //   p_rol_esperado, p_revision_esperada, p_motivo)
  // ÚNICA vía de escritura: NO hay .from('administraciones_temporales')
  // .insert(...). La autorización REAL (Administrador permanente,
  // estado del objetivo, sin solapes, sin autorodelegación) vive
  // DENTRO de la RPC; aquí sólo hay validaciones UX previas.
  //
  // Acepta EXCLUSIVAMENTE:
  //   usuario_id    (string uuid, obligatorio)
  //   vigente_desde (string ISO-8601 timestamptz, obligatorio)
  //   vigente_hasta (string ISO-8601 timestamptz, obligatorio)
  //   motivo        (string opcional, <= 1000 caracteres)
  // NO envía ni modifica usuarios.rol_id (ni ningún campo de usuarios).
  //
  // Devuelve la fila creada (id, usuario_id, otorgado_por,
  // vigente_desde, vigente_hasta, motivo, created_at, revocado_at,
  // revocado_por). Invalida la caché de administraciones.
  // ----------------------------------------------------------
  async otorgarAdministracionTemporal(datos = {}) {
    if (!datos || typeof datos !== 'object') {
      throw new Error('UsuariosService.otorgarAdministracionTemporal: faltan los datos.');
    }

    const usuarioId = typeof datos.usuario_id === 'string' ? datos.usuario_id.trim() : '';
    const desde = typeof datos.vigente_desde === 'string' ? datos.vigente_desde.trim() : '';
    const hasta = typeof datos.vigente_hasta === 'string' ? datos.vigente_hasta.trim() : '';

    if (!usuarioId) {
      throw new Error('UsuariosService.otorgarAdministracionTemporal: falta el usuario_id.');
    }
    if (!desde || !hasta) {
      throw new Error('UsuariosService.otorgarAdministracionTemporal: faltan las fechas de vigencia.');
    }
    if (!datos.rol_esperado || !/^\d+$/.test(String(datos.revision_esperada))) {
      throw new Error('Actualiza los datos del usuario antes de otorgar acceso.');
    }

    // Motivo opcional: '' → NULL (la RPC también lo normaliza).
    let motivo = null;
    if (datos.motivo !== undefined && datos.motivo !== null) {
      const m = String(datos.motivo).trim();
      motivo = m === '' ? null : m;
    }
    if (motivo && motivo.length > 1000) {
      throw new Error('UsuariosService.otorgarAdministracionTemporal: el motivo no puede superar 1000 caracteres.');
    }

    try {
      const { data, error } = await window.supabaseClient
        .rpc('otorgar_administracion_temporal', {
          p_usuario_id: usuarioId,
          p_vigente_desde: desde,
          p_vigente_hasta: hasta,
          p_motivo: motivo,
          p_rol_esperado: datos.rol_esperado,
          p_revision_esperada: datos.revision_esperada
        });

      if (error) throw error;

      const fila = Array.isArray(data) ? data[0] : data;
      if (!fila || !fila.id) {
        throw new Error(
          'UsuariosService.otorgarAdministracionTemporal: la RPC no devolvió la administración creada.'
        );
      }

      // La fila cambió: invalida el ledger cacheado.
      this._administracionesCache = null;

      return fila;
    } catch (e) {
      // Traduce los tokens "TOKEN: mensaje" al campo .codigo que
      // consume la UI (mismo patrón que aprobarUsuario).
      const codigo = extraerCodigoErrorRPC(e);
      if (codigo && e && typeof e === 'object' && !e.codigo) e.codigo = codigo;

      console.error('Error completo Supabase en UsuariosService.otorgarAdministracionTemporal:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // S3C-2C — revocarAdministracionTemporal(administracionId)
  // RPC SEGURA public.revocar_administracion_temporal(
  //   p_administracion_id)
  // Sólo Administrador PERMANENTE (lo decide la RPC). NO borra el
  // registro: escribe revocado_at/revocado_por (auditoría intacta).
  // Idempotente: si ya estaba revocada, la RPC responde seguro.
  // Devuelve la fila revocada. Invalida la caché de administraciones.
  // ----------------------------------------------------------
  async revocarAdministracionTemporal(administracionId) {
    const id = typeof administracionId === 'string' ? administracionId.trim() : '';
    if (!id) {
      throw new Error('UsuariosService.revocarAdministracionTemporal: falta el id de la administración.');
    }

    try {
      const { data, error } = await window.supabaseClient
        .rpc('revocar_administracion_temporal', {
          p_administracion_id: id
        });

      if (error) throw error;

      const fila = Array.isArray(data) ? data[0] : data;
      if (!fila || !fila.id) {
        throw new Error(
          'UsuariosService.revocarAdministracionTemporal: la RPC no devolvió la administración revocada.'
        );
      }

      this._administracionesCache = null;

      return fila;
    } catch (e) {
      const codigo = extraerCodigoErrorRPC(e);
      if (codigo && e && typeof e === 'object' && !e.codigo) e.codigo = codigo;

      console.error('Error completo Supabase en UsuariosService.revocarAdministracionTemporal:', e);
      throw e;
    }
  },

  // ----------------------------------------------------------
  // clearCache()
  // Vacía toda la caché interna del service (usuarios, detalle,
  // roles, estado administrativo propio y administraciones
  // temporales). NO toca localStorage.
  // ----------------------------------------------------------
  clearCache() {
    this._usuariosCache = null;
    this._usuarioDetalleCache = {};
    this._rolesCache = null;
    this._miEstadoAdminCache = null;
    this._administracionesCache = null;
  }
};
