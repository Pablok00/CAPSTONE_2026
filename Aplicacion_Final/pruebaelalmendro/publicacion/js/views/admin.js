// PASO 364: presentación basada en respuestas verificadas; no inferir borrado por ausencia.
function adminTextoEliminacionConfirmada(op, respuesta) {
  if (respuesta?.resultado !== 'COMPLETADA' || respuesta.eliminacion_ejecutada !== true ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(respuesta.operacion_id || '') ||
      respuesta.operacion_id !== op?.operacion_id || typeof op.nombre !== 'string' || !op.nombre.trim())
    throw new Error('El servidor no confirmó la eliminación de esta operación.');
  return op.nombre + ' (cuenta eliminada)';
}
function adminEstadoEliminacionTexto(estado) {
  return ({PREPARADA:'Preparada: todavía no se confirmó el borrado',
    AUTH_EN_CURSO:'Inicio registrado: falta verificar el resultado del borrado',
    AUTH_ELIMINADA:'Borrado registrado: falta completar la conservación y finalizar',
    REQUIERE_REVISION:'Requiere revisión: no repitas el borrado ni abras otra solicitud'})[estado] || 'Estado no verificado';
}
// DEL-FIX-08: abrir o consultar no ejecuta la continuación.
function adminConfirmarContinuacionEliminacion(op) {
  const recuperacion = op?.intentos_auth === 1 && ['AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION'].includes(op.estado);
  if (!adminAccesoVigente() || !(op?.estado === 'PREPARADA' && op.intentos_auth === 0 || recuperacion) ||
      document.getElementById('admin-elimination-continuation-dialog')) return;
  const actor = state.currentUser?.id;
  let enviada = false, ocupada = false, habilitacion = null;
  const dialog = document.createElement('dialog'); dialog.id = 'admin-elimination-continuation-dialog';
  dialog.className = 'alm-ui alm-panel w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100';
  dialog.setAttribute('aria-labelledby','admin-continuacion-titulo');
  const title = document.createElement('h2'); title.id = 'admin-continuacion-titulo'; title.textContent = recuperacion ? 'Revisar recuperación de la cuenta' : 'Confirmar eliminación permanente';
  const warning = document.createElement('p'); warning.textContent = recuperacion ? 'Se revisará la operación original sin repetir el borrado de la cuenta. Si la conservación no puede comprobarse, la solicitud seguirá pendiente de revisión.' : 'Eliminar la cuenta es permanente: la persona dejará de poder iniciar sesión. La ficha laboral, los trabajos, documentos e historiales solo podrán conservarse mediante la certificación del servidor. No es una consulta.';
  const summary = document.createElement('p'); summary.className = 'font-bold break-words';
  summary.textContent = op.nombre + '. Motivo registrado: ' + op.motivo;
  const form = document.createElement('form'); form.className = 'space-y-4';
  const label = document.createElement('label'); label.className = 'block'; label.textContent = 'Escribe el nombre exacto';
  const name = document.createElement('input'); name.type = 'text'; name.required = true; name.maxLength = 1000; name.className = 'alm-field w-full'; label.append(name);
  const reasonLabel = document.createElement('label'); reasonLabel.className = 'block'; reasonLabel.textContent = 'Motivo original (no modificable)';
  const reason = document.createElement('textarea'); reason.readOnly = true; reason.value = op.motivo; reason.className = 'alm-field w-full'; reasonLabel.append(reason);
  const passLabel = document.createElement('label'); passLabel.className = 'block'; passLabel.textContent = 'Tu contraseña de Administrador';
  const password = document.createElement('input'); password.id = 'admin-continuacion-password'; password.type = 'password'; password.autocomplete = 'current-password'; password.required = true; password.maxLength = 4096; password.className = 'alm-field block w-full p-3 pr-12';
  const passwordWrap = document.createElement('div'); passwordWrap.className = 'relative mt-2';
  passwordWrap.append(password);
  passwordWrap.insertAdjacentHTML('beforeend', adminPasswordEyeHTML(password.id, 'admin-continuacion-password-eye'));
  const eye = passwordWrap.querySelector('button');
  passLabel.append(passwordWrap);
  const confirmLabel = document.createElement('label'); confirmLabel.className = 'block';
  const confirm = document.createElement('input'); confirm.type = 'checkbox'; confirm.required = true;
  confirmLabel.append(confirm, document.createTextNode(' Confirmo la continuación irreversible de esta operación.'));
  const result = document.createElement('p'); result.setAttribute('role','status'); result.className = 'break-words';
  const actions = document.createElement('div'); actions.className = 'flex flex-wrap gap-4';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'alm-btn-secondary px-4 py-2'; cancel.textContent = 'Cancelar';
  const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'alm-btn-danger px-4 py-2'; submit.textContent = recuperacion ? 'Revisar solicitud original' : 'Eliminar cuenta permanentemente';
  submit.disabled = true; // Cerrado hasta consultar la habilitación del servidor.
  result.textContent = !ADMIN_ELIMINACION_HABILITADA ? 'La eliminación está deshabilitada en esta interfaz.' : !adminObjetivoPermitidoEliminacion(op.objetivo_id) ? 'Esta cuenta no admite eliminación.' : 'Verificando disponibilidad del servidor…';
  cancel.addEventListener('click',()=>{ if(ocupada)return; password.value='';password.type='password';dialog.close();dialog.remove(); });
  dialog.addEventListener('cancel',e=>e.preventDefault());
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(enviada || ocupada || !adminAccesoVigente() || state.currentUser?.id !== actor) return;
    if (!ADMIN_ELIMINACION_HABILITADA || !adminObjetivoPermitidoEliminacion(op.objetivo_id) || habilitacion?.efectiva!==true) { result.textContent = 'La eliminación no está habilitada para esta cuenta en esta sesión.'; return; }
    if(name.value !== op.nombre || !confirm.checked || !password.value){result.textContent='Revisa el nombre, la confirmación y tu contraseña.';return;}
    if (password.type === 'text') togglePasswordVisibility(password.id, 'admin-continuacion-password-eye');
    eye.disabled=true;
    enviada=true;ocupada=true;submit.disabled=true;cancel.disabled=true;name.disabled=true;confirm.disabled=true;password.disabled=true;
    result.textContent='Verificando la operación original y la identidad…';
    try {
      const response = recuperacion
        ? await window.UsuariosService.recuperarEliminacionIniciada(op,password.value,name.value,confirm.checked)
        : await window.UsuariosService.continuarEliminacionPreparada(op,password.value,name.value,confirm.checked);
      if(!dialog.isConnected)return;
      if(response?.resultado !== 'COMPLETADA' || response.eliminacion_ejecutada !== true || response.operacion_id !== op.operacion_id || state.currentUser?.id !== actor)throw new Error();
      adminTextoEliminacionConfirmada(op,response);
      password.value='';password.type='password';dialog.close();dialog.remove();
      const pendientes=document.getElementById('admin-eliminaciones-lectura-dialog');if(pendientes){pendientes.close();pendientes.remove();}
      adminMostrarToast('Cuenta eliminada correctamente. Los registros certificados se conservaron.');
      try{await cargarPanelAdminDatos();}catch{adminMostrarToast('La cuenta se eliminó, pero no se pudo actualizar el panel. Vuelve a abrir Administración.','error');}
    } catch(error) {
      if(dialog.isConnected){
        result.textContent='No se confirmó la eliminación. No vuelvas a enviarla. Consulta el estado de la operación original.';
        result.textContent+=' Utiliza Revisar eliminaciones pendientes para consultar la misma solicitud.';
      }
    } finally {password.value='';password.type='password';ocupada=false;cancel.disabled=false;cancel.textContent='Cerrar';}
  });
  actions.append(cancel,submit);form.append(label,reasonLabel,passLabel,confirmLabel,result,actions);dialog.append(title,warning,summary,form);document.body.append(dialog);dialog.showModal();name.focus();
  if(ADMIN_ELIMINACION_HABILITADA&&adminObjetivoPermitidoEliminacion(op.objetivo_id)){
    window.UsuariosService.consultarEliminacionesPendientes(op.operacion_id).then(operaciones=>{
      if(!dialog.isConnected||!adminAccesoVigente()||state.currentUser?.id!==actor)return;
      const actual=operaciones.length===1?operaciones[0]:null;
      if(!actual||['operacion_id','request_id','objetivo_id','nombre','motivo','fingerprint','estado','intentos_auth'].some(k=>actual[k]!==op[k]))throw new Error();
      habilitacion=actual.habilitacion;
      submit.disabled=habilitacion?.efectiva!==true;
      result.textContent=!habilitacion||!habilitacion.verificada?'No se pudo verificar la disponibilidad del servidor. Cierra y vuelve a consultar.':
        !habilitacion.servidor?'La eliminación está deshabilitada en el servidor.':habilitacion.sql!==true?'La eliminación está desactivada por seguridad en el servidor. No se permite continuar.':
        habilitacion.efectiva?'Eliminación disponible. Completa los campos y confirma; el servidor verificará nuevamente todos los requisitos.':'La continuación no está disponible.';
    }).catch(()=>{if(dialog.isConnected){habilitacion=null;submit.disabled=true;result.textContent='No se pudo verificar la disponibilidad. No se permite continuar.';}});
  }
}

// DEL-FIX-07: consultar no ejecuta; DEL-FIX-08 abre una confirmación separada y explícita.
async function adminConsultarEliminacionesPendientes() {
  const host = document.getElementById('admin-eliminaciones-pendientes');
  if (!host || !adminAccesoVigente()) return;
  const actor = state.currentUser?.id;
  const vigente = () => host.isConnected && document.getElementById('admin-eliminaciones-pendientes') === host && adminAccesoVigente() && state.currentUser?.id === actor;
  try {
    const operaciones = await window.UsuariosService.consultarEliminacionesPendientes();
    if (!vigente()) return;
    host.replaceChildren();
    if (!operaciones.length) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'alm-btn-secondary px-4 py-2';
    button.textContent = 'Revisar eliminación pendiente';
    button.addEventListener('click', () => adminMostrarEliminacionesPendientes());
    host.append(button);
  } catch (_) {
    if (vigente()) host.textContent = 'No se pudo consultar el estado. Conserva la solicitud original y no repitas el borrado.';
  }
}
async function adminMostrarEliminacionesPendientes() {
  if (!adminAccesoVigente() || document.getElementById('admin-eliminaciones-lectura-dialog')) return;
  const actor = state.currentUser?.id;
  const dialog = document.createElement('dialog'); dialog.id = 'admin-eliminaciones-lectura-dialog';
  dialog.className = 'alm-ui alm-panel w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100';
  dialog.setAttribute('aria-labelledby','admin-eliminaciones-lectura-titulo');
  const title = document.createElement('h2'); title.id = 'admin-eliminaciones-lectura-titulo'; title.textContent = 'Eliminaciones pendientes — solo consulta';
  const content = document.createElement('div'); content.className = 'space-y-4 break-words'; content.setAttribute('aria-live','polite'); content.textContent = 'Consultando estado actual…';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'alm-btn-secondary px-4 py-2'; close.textContent = 'Cerrar';
  const focus = document.activeElement;
  close.addEventListener('click', () => { dialog.close(); dialog.remove(); focus?.focus(); });
  dialog.addEventListener('cancel', e => e.preventDefault());
  dialog.append(title, content, close); document.body.append(dialog); dialog.showModal(); close.focus();
  try {
    const operaciones = await window.UsuariosService.consultarEliminacionesPendientes();
    if (!dialog.isConnected) return;
    if (!adminAccesoVigente() || state.currentUser?.id !== actor) throw new Error();
    content.replaceChildren();
    const notice = document.createElement('p'); notice.textContent = 'Esta consulta no continúa ni confirma ninguna eliminación. No hay una operación seleccionada.'; content.append(notice);
    if (!operaciones.length) { const empty = document.createElement('p'); empty.textContent = 'No hay operaciones pendientes verificadas.'; content.append(empty); }
    for (const op of operaciones) {
      const card = document.createElement('section'); card.className = 'border rounded-xl p-4 space-y-2 break-words';
      for (const [label,value] of [['Estado',adminEstadoEliminacionTexto(op.estado)],['Cuenta',op.nombre],['Motivo original',op.motivo],['Referencia para revisión',op.operacion_id]]) {
        const line = document.createElement('p'); line.textContent = label + ': ' + value; card.append(line);
      }
      if (op.estado === 'PREPARADA' && op.intentos_auth === 0 || op.intentos_auth === 1 && ['AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION'].includes(op.estado)) {
        const continueButton = document.createElement('button'); continueButton.type = 'button'; continueButton.className = 'alm-btn-danger px-4 py-2';
        continueButton.textContent = op.estado === 'PREPARADA' ? 'Revisar y confirmar…' : 'Revisar recuperación…';
        continueButton.disabled = true;
        const closed = document.createElement('p'); closed.className = 'text-sm';
        closed.textContent=!ADMIN_ELIMINACION_HABILITADA?'La continuación está deshabilitada en esta interfaz.':!adminObjetivoPermitidoEliminacion(op.objetivo_id)?'Esta cuenta no admite eliminación.':'Verificando disponibilidad del servidor…';
        card.append(closed);
        if(ADMIN_ELIMINACION_HABILITADA&&adminObjetivoPermitidoEliminacion(op.objetivo_id)){
          const consulta=op.habilitacion?Promise.resolve([op]):window.UsuariosService.consultarEliminacionesPendientes(op.operacion_id);
          consulta.then(operaciones=>{
            if(!dialog.isConnected||!adminAccesoVigente()||state.currentUser?.id!==actor)return;
            const actual=operaciones.length===1?operaciones[0]:null;
            if(!actual||['operacion_id','request_id','objetivo_id','nombre','motivo','fingerprint','estado','intentos_auth'].some(k=>actual[k]!==op[k]))throw new Error();
            const h=actual.habilitacion;continueButton.disabled=h?.efectiva!==true;
            closed.textContent=!h||!h.verificada?'Disponibilidad no verificable. Conserva la operación y vuelve a consultar.':!h.servidor?'La eliminación está deshabilitada en el servidor.':h.sql!==true?'La eliminación está desactivada por seguridad en el servidor.':h.efectiva?'Eliminación disponible. Abrir la confirmación no elimina la cuenta.':'La continuación no está disponible.';
          }).catch(()=>{continueButton.disabled=true;closed.textContent='No se pudo verificar la disponibilidad. No se permite continuar.';});
        }
        continueButton.addEventListener('click', () => { if (!continueButton.disabled && adminAccesoVigente() && state.currentUser?.id === actor) adminConfirmarContinuacionEliminacion(op); });
        card.append(continueButton);
      }
      content.append(card);
    }
  } catch (_) { if (dialog.isConnected) content.textContent = 'No se pudo verificar el estado. No se ha continuado ninguna eliminación.'; }
}

// UX-02: las ventanas solo se cierran con controles explícitos o tras guardar.
// Esta regla sustituye las referencias históricas a cierre por fondo o Escape.
// ==========================================================
// VISTA: PANEL DE ADMINISTRACIÓN & ROLES - HOTEL EL ALMENDRO
// ==========================================================
// CAMBIO 6B: rol y estado se gestionan por RPC con contexto
// capturado, confirmación y reintentos inmutables. Creación,
// eliminación y permisos personalizados continúan deshabilitados.
// FASE S3B-3: LECTURA REAL desde Supabase.
//
// Patrón: js/views/trabajadores.js (loader #admin-loader +
// #admin-content oculto; setTimeout(async ...) consulta y reemplaza).
//
// Fuente EXCLUSIVA: window.UsuariosService (public.usuarios +
// public.roles). NO se usa localStorage como fuente de usuarios. Los
// datos reales NO se copian a state ni a localStorage (Ley 21.719:
// minimización de datos personales). El store legacy de usuarios mock
// (mockData.users / state.users / getHotelUsers()) fue eliminado en
// S3B-4.
//
// RLS real (única autorización): un usuario normal ve únicamente su
// propio perfil; un Administrador ve todos. Esta vista NO decide
// permisos, sólo presenta lo que Supabase devuelve.
//
// Campos mostrados (todos existentes en Supabase): id, nombre, email,
// estado, rol_id y roles.nombre. NO se muestran ni se inventan
// "Cargo / Área", "Último Acceso", avatar ni contraseñas: esas
// columnas no existen.
//
// FASE S3B-3: TODA gestión sigue DESHABILITADA (crear, editar
// nombre, cambiar rol, activar/desactivar, eliminar, permisos,
// invitaciones). Sólo se lee.
//
// FASE S3C-1A: se RECONOCEN las cuentas PENDIENTES DE APROBACIÓN
// (estado = true y rol_id = NULL) con badge, filtro y estadística
// propios. Sólo lectura + presentación.
//
// FASE S3C-1C/1D: se ACTIVA la aprobación de cuentas pendientes desde
// este panel. Única escritura de la fase:
//   UsuariosService.aprobarUsuario(id, { rol_id })
//   → UPDATE de public.usuarios con { rol_id, estado: true }
// FASE S3C-1D: nombre y correo son SOLO LECTURA (el nombre lo escribió
// el propio usuario al registrarse: trigger handle_new_auth_user →
// public.usuarios.nombre). Sin nombre real de registro NO hay
// aprobación normal. El selector de roles se pobla EXCLUSIVAMENTE
// desde UsuariosService.getRoles() (public.roles) y EXCLUYE el rol
// Administrador: ese acceso se gestiona en un proceso de
// autorización independiente (fase posterior). NO hay roles
// hardcodeados ni UUIDs escritos a mano. NO se implementa creación
// de cuentas, invitaciones, administrador temporal, edición completa
// de usuarios aprobados ni eliminación: esas acciones siguen
// deshabilitadas.
// La autorización real es RLS (administrador_actualiza_usuarios);
// esta vista sólo presenta el flujo y MINIMIZA el payload.
//
// FASE S3C-2C: ADMINISTRACIÓN TEMPORAL.
// - Lectura del ledger public.administraciones_temporales (vía
//   UsuariosService.getAdministracionesTemporales, sólo para
//   administrador operativo; la RLS además filtra las filas).
// - Botones "Otorgar administración temporal" y "Revocar acceso":
//   visibles ÚNICAMENTE para Administrador PERMANENTE
//   (adminAccesoVigente()). El Panel y las aprobaciones también
//   exigen Administrador permanente; las delegaciones conservan sus
//   permisos operativos en los demás módulos.
// - Escrituras EXCLUSIVAMENTE vía RPCs seguras del backend
//   (otorgar_administracion_temporal / revocar_administracion_temporal).
//   NO hay INSERT/UPDATE/DELETE directo sobre
//   administraciones_temporales; usuarios.rol_id NUNCA se modifica.
// - Modal #modal-admin-temporal: fechas/horas en hora de Chile,
//   convertidas a ISO-8601 UTC antes de enviar. La vigencia la
//   decide el backend con now() de PostgreSQL, no el navegador.

// Escape de salida HTML. El proyecto usa innerHTML con template
// literals; los datos reales de Supabase (email, nombre de rol)
// deben escaparse antes de inyectarse (prevención XSS).
function adminEscapeHTML(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Filtros de la vista (en memoria de la vista, no en localStorage).
let adminSearchQuery = '';
// 'ALL' | rol_id (uuid real de public.roles) | ADMIN_FILTRO_PENDIENTES
// (Pendientes de aprobación: NO es un rol ficticio, es una vista de
// filtros; los roles normales siguen viniendo SOLO de
// UsuariosService.getRoles() → public.roles).
const ADMIN_FILTRO_PENDIENTES = '__PENDIENTES__';
let adminRoleFilter = 'ALL';

// Datos reales cargados desde Supabase (no hay fallback a mocks).
let adminUsuariosReales = null;
let adminRolesReales = null;
// S3C-2C: ledger real de public.administraciones_temporales (sólo
// lectura; la RLS decide la visibilidad). Null = no cargado todavía.
let adminDelegacionesReales = null;

// ==========================================================
// S3C-2E — TIMER DE TRANSICIONES DEL PANEL (delegaciones ajenas)
// ==========================================================
// El Panel Admin muestra bloques "Activa"/"Programada" de las
// delegaciones de otros usuarios. Esos bloques se clasifican con el
// reloj del navegador, así que al vencer/programar una delegación la
// vista queda STALE hasta que algo la refresque. Este timer garantiza
// que, cuando #admin está visible, la vista se actualice SOLA en el
// instante exacto en que ocurre la próxima transición (sin F5).
// Invariante: a lo sumo UN setTimeout de transición y UN intervalo de
// fallback, ambos cancelados al salir de #admin.
// La AUTORIZACIÓN sigue siendo del backend (RLS/RPC con now()); esto
// es SOLO presentación.
let adminPanelTimerId = null;     // handle del setTimeout de transición
let adminPanelTimerTs = null;     // timestamp (ms) al que apunta ese timer
let adminPanelFallbackId = null;  // handle del intervalo liviano de rescate
const ADMIN_PANEL_FALLBACK_MS = 30 * 1000;      // fallback 30 s (30–60 s)
const ADMIN_PANEL_MAX_DELAY_MS = 2147483647;    // límite técnico setTimeout (~24.8 d)

// ==========================================================
// S3C-2C — ADMINISTRACIÓN TEMPORAL: HELPERS DE PRESENTACIÓN
// ==========================================================
// IMPORTANTE: estas funciones clasifican el estado de una delegación
// para MOSTRARLA (Activa / Programada). Usan el reloj del navegador
// SÓLO como presentación. La AUTORIZACIÓN real (acceso del temporal,
// posibilidad de revocar, etc.) vive en el backend con now() de
// PostgreSQL. Si la UI y el backend difieren, manda el backend.
function adminAhoraMs() {
  return Date.now();
}

function adminDelegacionVigentePara(usuarioId) {
  if (!Array.isArray(adminDelegacionesReales) || !usuarioId) return null;
  const ahora = adminAhoraMs();
  return adminDelegacionesReales.find(d =>
    d && d.usuario_id === usuarioId &&
    (d.revocado_at === null || d.revocado_at === undefined) &&
    new Date(d.vigente_desde).getTime() <= ahora &&
    new Date(d.vigente_hasta).getTime() > ahora
  ) || null;
}

function adminDelegacionProgramadaPara(usuarioId) {
  if (!Array.isArray(adminDelegacionesReales) || !usuarioId) return null;
  const ahora = adminAhoraMs();
  return adminDelegacionesReales.find(d =>
    d && d.usuario_id === usuarioId &&
    (d.revocado_at === null || d.revocado_at === undefined) &&
    new Date(d.vigente_desde).getTime() > ahora
  ) || null;
}

function adminDelegacionesCerradasPara(usuarioId) {
  if (!Array.isArray(adminDelegacionesReales) || !usuarioId) return 0;
  const ahora = adminAhoraMs();
  return adminDelegacionesReales.filter(d =>
    d && d.usuario_id === usuarioId &&
    (d.revocado_at !== null && d.revocado_at !== undefined ||
     new Date(d.vigente_hasta).getTime() <= ahora)
  ).length;
}

// Formatea un timestamptz a es-CL / America/Santiago. Reutiliza el
// helper global de app.js si existe; si no, cae a un formateo neutro.
function adminFormatearFechaHora(iso) {
  return formatearFechaCL(iso,{hora:true,vacio:'—'});
}

// Nombre visible: 1) public.usuarios.nombre, 2) email real,
// 3) "Usuario". El service devuelve el NULL tal cual; este fallback
// es SOLO visual y NUNCA se escribe en base de datos.
function adminNombreVisible(usuario) {
  if (usuario && typeof usuario.nombre === 'string' && usuario.nombre.trim() !== '') {
    return usuario.nombre.trim();
  }
  if (usuario && typeof usuario.email === 'string' && usuario.email.trim() !== '') {
    return usuario.email.trim();
  }
  return 'Usuario';
}

// ==========================================================
// FASE S3C-1A — CUENTA PENDIENTE DE APROBACIÓN
// ==========================================================
// Criterio EXACTO de pendiente (idéntico al modelo del backend y al
// de la pantalla #pending-account del frontend):
//     public.usuarios.estado = true
//     AND public.usuarios.rol_id IS NULL
// AND correo_verificado = true (tabla protegida usuarios_correos_verificados).
// No se inventa un rol ni un estado: una cuenta con
// estado = false es INACTIVA (no pendiente) y una cuenta con rol
// asignado es APROBADA.
function adminEsPendiente(usuario) {
  return !!usuario
    && usuario.estado === true
    && usuario.correo_verificado === true
    && (usuario.rol_id === null || usuario.rol_id === undefined);
}

// Conteo real de cuentas pendientes (sin mocks ni roles ficticios).
function adminContarPendientes(usuarios) {
  return (usuarios || []).filter(adminEsPendiente).length;
}

// Iniciales del colaborador (no existe avatar real en Supabase).
// Reutiliza el helper global calcularIniciales() de app.js si está
// disponible; si no, usa el emoji neutro.
function adminIniciales(usuario) {
  const nombre = adminNombreVisible(usuario);
  if (typeof window.calcularIniciales === 'function') {
    return window.calcularIniciales(nombre) || '👤';
  }
  if (typeof calcularIniciales === 'function') {
    return calcularIniciales(nombre) || '👤';
  }
  return '👤';
}

// Adaptador visual: nombre real del rol (p.ej. "Recepción") → clave
// de color usada por la UI. Es SOLO traducción de presentación; la
// fuente de verdad sigue siendo public.roles.nombre.
function adminRolClaveUI(usuario) {
  const nombreRol = (usuario && usuario.roles && usuario.roles.nombre) || null;
  if (typeof mapearRolRealAUI === 'function') {
    return mapearRolRealAUI(nombreRol);
  }
  return 'SIN_ROL';
}

// Paleta de badges por clave de rol (conservada del diseño original).
function adminRolBadgeClasses(claveUI) {
  if (claveUI === 'ADMINISTRADOR') {
    return 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
  }
  if (claveUI === 'TECNICO') {
    return 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
  }
  if (claveUI === 'RECEPCION') {
    return 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
  }
  // SIN_ROL (rol NULL o aún no mapeado): badge neutro, sin inventar.
  return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
}

// ==========================================================
// ==========================================================
// S3C-2E — TIMER DE TRANSICIONES DEL PANEL (funciones)
// ==========================================================
// Clasificación de delegaciones para PRESENTACIÓN. La autorización
// sigue siendo exclusivamente del backend.

// Próxima transición (en ms epoch) entre vigente_desde/vigente_hasta
// de las delegaciones NO revocadas que estén en el futuro. Devuelve
// null si no hay ninguna transición futura conocida.
function adminProximaTransicionPanel() {
  if (!Array.isArray(adminDelegacionesReales)) return null;
  const ahora = adminAhoraMs();
  let min = Infinity;

  for (const d of adminDelegacionesReales) {
    if (!d) continue;
    // Revocadas: nunca generan transición futura (ya cerradas).
    if (d.revocado_at !== null && d.revocado_at !== undefined) continue;

    const desde = Date.parse(d.vigente_desde);
    const hasta = Date.parse(d.vigente_hasta);

    // Programada → Activa (su vigente_desde aún no llegó).
    if (Number.isFinite(desde) && desde > ahora && desde < min) min = desde;
    // Activa → Vencida (su vigente_hasta aún no llegó).
    if (Number.isFinite(hasta) && hasta > ahora && hasta < min) min = hasta;
  }

  return min === Infinity ? null : min;
}

// ¿El panel admin sigue siendo la vista activa y existe en el DOM?
function adminPanelVisible() {
  return adminAccesoVigente() && currentView === 'admin' && !!document.getElementById('admin-content');
}

// Recarga SÓLO el ledger de delegaciones (force=true) y re-renderiza
// el panel con los datos de usuarios/roles ya cargados. No repide
// usuarios ni roles (son datos pesados que no cambian por una
// transición de vigencia).
async function refrescarLedgerPanel() {
  if (!adminAccesoVigente()) return;
  if (!adminPanelVisible()) return;
  if (!esAdminOperativoActual()) return;
  const contenedorVisita = document.getElementById('admin-content');

  try {
    if (!window.UsuariosService ||
        typeof window.UsuariosService.getAdministracionesTemporales !== 'function') {
      throw new Error('UsuariosService.getAdministracionesTemporales no está disponible.');
    }
    // force = true: consulta REAL del ledger (la RLS filtra las filas).
    const delegaciones = await window.UsuariosService.getAdministracionesTemporales(true);
    if (!adminPanelVisible() || document.getElementById('admin-content') !== contenedorVisita) return;
    adminDelegacionesReales = delegaciones || [];
  } catch (e) {
    // No se rompe el panel: se conserva el estado previo y se loguea.
    console.error('S3C-2E: error refrescando el ledger de delegaciones:', e);
    return;
  }

  // Re-render sólo si el panel sigue visible y hay datos base.
  if (adminPanelVisible() && adminUsuariosReales && adminRolesReales) {
    const container = document.getElementById('admin-content');
    if (container) {
      if (!adminAccesoVigente() || document.getElementById('admin-content') !== container) return;
  adminRenderizarPanelConInvitacion(container, getAdminPanelHTML(adminUsuariosReales, adminRolesReales));
    }
  }
}

// Cancela timer de transición y fallback (evita duplicados).
function cancelarPanelDelegaciones() {
  if (adminPanelTimerId !== null) {
    clearTimeout(adminPanelTimerId);
    adminPanelTimerId = null;
  }
  adminPanelTimerTs = null;
  if (adminPanelFallbackId !== null) {
    clearInterval(adminPanelFallbackId);
    adminPanelFallbackId = null;
  }
}

// Programa UN SOLO setTimeout para la próxima transición conocida.
// Se llama tras cada carga/refresco del ledger. Cancela el timer
// anterior antes de crear el nuevo (sin duplicados).
function programarTransicionPanel() {
  if (adminPanelTimerId !== null) {
    clearTimeout(adminPanelTimerId);
    adminPanelTimerId = null;
  }
  adminPanelTimerTs = null;

  if (!adminPanelVisible()) return;

  const ts = adminProximaTransicionPanel();
  if (ts === null) return; // sin transiciones futuras: nada que programar

  let delay = ts - adminAhoraMs();
  if (delay < 0) delay = 0;
  if (delay > ADMIN_PANEL_MAX_DELAY_MS) delay = ADMIN_PANEL_MAX_DELAY_MS;

  adminPanelTimerTs = ts;
  adminPanelTimerId = setTimeout(dispararTransicionPanel, delay);
}

// Disparo del timer de transición: refresca el ledger, re-renderiza
// y recalcula la SIGUIENTE transición.
async function dispararTransicionPanel() {
  adminPanelTimerId = null;

  // Si el panel ya no está visible, no se hace nada (y no se
  // reprograma): la limpieza también la hace el fallback.
  if (!adminPanelVisible()) return;

  await refrescarLedgerPanel();
  programarTransicionPanel();
}

// Inicia timer de transición + fallback liviano. Idempotente: siempre
// cancela lo anterior antes de (re)crear, para no duplicar timers.
function iniciarPanelDelegaciones() {
  cancelarPanelDelegaciones();

  if (!adminPanelVisible()) return;

  // Timer exacto de la próxima transición.
  programarTransicionPanel();

  // Fallback liviano (30 s): rescata caso de navegador suspendido,
  // throttling de timers o cambio de reloj. Además auto-limpia los
  // timers si el usuario salió de #admin (máx. 30 s después).
  adminPanelFallbackId = setInterval(() => {
    if (!adminPanelVisible()) {
      cancelarPanelDelegaciones();
      return;
    }
    refrescarLedgerPanel();
    // Tras refrescar, reprograma por si el ledger cambió el mínimo.
    programarTransicionPanel();
  }, ADMIN_PANEL_FALLBACK_MS);

  // S3C-2E: cancelación PROPTA al salir de #admin. El panel se entra
  // vía hash de la URL (#admin); al cambiar de hash se cancelan timer
  // y fallback de inmediato (sin esperar al próximo tick del fallback).
  // Se registra una sola vez por sesión.
  if (!window.__s3c2eHashHook) {
    window.__s3c2eHashHook = true;
    window.addEventListener('hashchange', () => {
      const hashActual = (window.location.hash || '').replace('#', '');
      if (hashActual !== 'admin') {
        cancelarPanelDelegaciones();
      }
    });
  }
}

// PUNTO DE ENTRADA DE LA VISTA (patrón loader + contenido)
// ==========================================================
function adminAccesoDenegadoHTML() {
  return '<div class="p-8 text-center" role="status">Acceso reservado a Administradores permanentes.</div>';
}

function renderAdminView() {
  if (!adminAccesoVigente()) { window.AdminAcceso?.solicitar(); return ''; }
  setTimeout(() => { cargarPanelAdminDatos(); }, 0);

  return `
    ${uiCargandoHTML("admin-loader")}
    <div id="admin-content" class="hidden w-full"></div>
  `;
}

// Consulta Supabase (usuarios + roles). Siempre force = true al
// entrar al módulo: la vista siempre refleja lo real.
async function cargarPanelAdminDatos() {
  if (!adminAccesoVigente()) return;
  const loader = document.getElementById('admin-loader');
  const container = document.getElementById('admin-content');
  if (!loader || !container) return;

  try {
    if (!window.UsuariosService) {
      throw new Error('UsuariosService no está disponible.');
    }

    // S3C-2C: además de usuarios y roles se lee el ledger de
    // administraciones temporales. Sólo se pide cuando la sesión es
    // administrador OPERATIVO (la RLS además restringiría las filas:
    // el permanente ve todo; el temporal sólo la propia).
    const cargas = [
      window.UsuariosService.getUsuarios(true),
      window.UsuariosService.getRoles(true)
    ];
    if (esAdminOperativoActual()) {
      cargas.push(window.UsuariosService.getAdministracionesTemporales(true));
    } else {
      cargas.push(Promise.resolve([]));
    }

    const [usuarios, roles, delegaciones] = await Promise.all(cargas);
    if (!adminAccesoVigente() || document.getElementById('admin-content') !== container || currentView !== 'admin') return;

    adminUsuariosReales = usuarios || [];
    adminRolesReales = roles || [];
    adminDelegacionesReales = delegaciones || [];
  } catch (e) {
    // Error real de Supabase/RLS/red: se muestra y se propaga.
    // NUNCA fallback a mocks ni a localStorage.
    if (!adminAccesoVigente() || document.getElementById('admin-content') !== container) return;
    console.error('Error cargando usuarios/roles reales desde Supabase:', e);
    adminUsuariosReales = null;
    adminRolesReales = null;
    adminDelegacionesReales = null;
    container.innerHTML = adminErrorHTML();
    loader.classList.add('hidden');
    container.classList.remove('hidden');
    return;
  }

  adminRenderizarPanelConInvitacion(container, getAdminPanelHTML(adminUsuariosReales, adminRolesReales));
  window.AdminCorreosVerificados?.reflejarListado(adminUsuariosReales);
  void adminConsultarEliminacionesPendientes();
  loader.classList.add('hidden');
  container.classList.remove('hidden');

  // S3C-2E: con el panel ya visible, armar el timer de transiciones
  // (y su fallback). Idempotente y sin duplicados. Esto garantiza que
  // una delegación que venza/empiece se refresque SOLA en #admin.
  iniciarPanelDelegaciones();
}

// ==========================================================
// PANEL: encabezado + estadísticas + filtros + tabla
// ==========================================================

// INV-07: integración preparada; no hay invocación mientras la compuerta local esté cerrada.
// Mantener la isla interactiva conectada: no recrear su input, mensaje ni botones.
function adminRenderizarPanelConInvitacion(container, html) {
  const actual = container.querySelector('#admin-invitacion-panel');
  if (!actual) {
    const abiertos=[...(container.querySelectorAll?.('details') || [])].map(el=>el.open);
    container.innerHTML=html;
    [...(container.querySelectorAll?.('details') || [])].forEach((el,i)=>{if(i<abiertos.length)el.open=abiertos[i];});
    return;
  }
  const buffer = document.createElement('div'); buffer.innerHTML = html;
  const nuevo = buffer.querySelector('#admin-invitacion-panel');
  if (!nuevo || actual.parentNode !== container.firstElementChild || nuevo.parentNode !== buffer.firstElementChild) {
    container.innerHTML = html; return;
  }
  const raiz = actual.parentNode, siguientes = [...raiz.childNodes];
  // Conservar apertura de otros desplegables; los datos sí se actualizan.
  const abiertos = [...container.querySelectorAll('details')].map(el => el.open);
  [...buffer.querySelectorAll('details')].forEach((el,i) => { if (i < abiertos.length) el.open = abiertos[i]; });
  let ancla = actual;
  for (const nodo of [...nuevo.parentNode.childNodes]) {
    if (nodo === nuevo) { ancla = actual.nextSibling; continue; }
    raiz.insertBefore(nodo, ancla);
  }
  for (const nodo of siguientes) if (nodo !== actual) nodo.remove();
}

let adminInvitacionEnCurso = false, adminInvitacionEstado = null, adminInvitacionTimer = null, adminInvitacionRestaurada = false, adminInvitacionConsultaTimer = null, adminInvitacionConsultaVersion = 0, adminInvitacionConsultando = false;
function adminInvitacionTicket(email = document.getElementById('admin-invitacion-email')?.value.trim().toLowerCase()) {
  const actor = state.currentUser?.id;
  if (!actor) return null;
  try {
    const raw = sessionStorage.getItem(adminInvitacionClave(email || '')) || sessionStorage.getItem('hotel.invitar.' + actor);
    if (!raw) return null;
    const ticket = JSON.parse(raw); if (ticket.email !== email) return null;
    if (ticket.version !== 1 || ticket.actor !== actor || typeof ticket.email !== 'string' || typeof ticket.solicitudId !== 'string' || !['ENVIANDO','INCIERTO','REQUIERE_REVISION','CONFIRMADA','RECHAZADA'].includes(ticket.estado)) throw Error();
    return ticket;
  } catch (_) { return { estado: 'REQUIERE_REVISION' }; }
}
function adminInvitacionPreparadaHTML() {
  if (!adminAccesoVigente()) return '';
  return `<div id="admin-invitacion-panel" class="space-y-4">
    <h2 id="admin-invitacion-titulo" class="text-lg font-bold">Invitar trabajador</h2>
    <form onsubmit="adminEnviarInvitacion(event); return false;" class="space-y-3">
      <label for="admin-invitacion-email" class="block text-sm font-bold">Correo electrónico</label>
      <input id="admin-invitacion-email" type="email" autocomplete="email" required maxlength="254" oninput="adminProgramarConsultaInvitacion()" class="alm-field w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
      <p id="admin-invitacion-estado" role="status" aria-live="polite" class="text-sm text-slate-600 dark:text-slate-400">Envío protegido por compuertas locales y de servidor. No se enviará ningún correo sin habilitación autorizada.</p>
      <p class="text-xs text-slate-600 dark:text-slate-300">Si el trabajador no puede utilizar su enlace, podrás solicitar otro después de al menos 60 segundos, siempre que la invitación siga pendiente y permita reenvío.</p>
      <div class="flex flex-wrap items-center justify-end gap-4 pt-4">
        <button id="admin-invitacion-cancelar" type="button" onclick="adminCerrarInvitacion()" class="alm-btn-secondary px-4 py-2">Cancelar</button>
        <button id="admin-invitacion-enviar" type="submit" disabled class="alm-btn-primary px-4 py-2" aria-describedby="admin-invitacion-estado">Enviar invitación</button>
      </div>
    </form>
  </div>`;
}

// INV-36: interfaz permanente; el servidor conserva autorización y compuerta propias.
const ADMIN_CREACION_MANUAL_UI_HABILITADA = true;
function adminCreacionManualUIHabilitada() {
  return ADMIN_CREACION_MANUAL_UI_HABILITADA && adminAccesoVigente();
}
function adminAbrirInvitacion() {
  if (!adminAccesoVigente()) return;
  if(document.getElementById('admin-nuevo-usuario-dialog')?.open)return;
  let dialogo = document.getElementById('admin-invitacion-dialog');
  if (dialogo && dialogo.dataset.actor !== state.currentUser?.id) { dialogo.close(); dialogo.remove(); dialogo=null; }
  if (!dialogo) {
    dialogo=document.createElement('dialog');dialogo.id='admin-invitacion-dialog';dialogo.dataset.actor=state.currentUser?.id;
    dialogo.className='alm-ui alm-panel w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700';
    dialogo.setAttribute('aria-labelledby','admin-invitacion-titulo');
    dialogo.innerHTML=adminInvitacionPreparadaHTML();
    dialogo.addEventListener('cancel',evento=>evento.preventDefault());
    dialogo.addEventListener('close',()=>{adminCancelarConsultaInvitacion();if(adminInvitacionTimer!==null){clearTimeout(adminInvitacionTimer);adminInvitacionTimer=null;}
      document.getElementById('admin-abrir-invitacion')?.focus();});
    document.body.appendChild(dialogo);
  }
  if (!dialogo.open) dialogo.showModal();
  adminProgramarConsultaInvitacion(0);document.getElementById('admin-invitacion-email')?.focus();
}
function adminCerrarInvitacion() {
  if (adminInvitacionEnCurso) return;
  document.getElementById('admin-invitacion-dialog')?.close();
}
let adminManualPlan = null, adminManualVersion = 0, adminManualPlanEnCurso = false, adminManualEnCurso = false;
function adminInvalidarFichaManual() {
  ++adminManualVersion;adminManualPlan=null;adminManualPlanEnCurso=false;
  const mensaje=document.getElementById('admin-manual-ficha');if(mensaje)mensaje.textContent='La ficha se comprobará al terminar el nombre. No se vinculará automáticamente.';
}
async function adminPlanificarFichaManual() {
  if(!adminAccesoVigente()||adminManualPlanEnCurso)return;
  const dialogo=document.getElementById('admin-nuevo-usuario-dialog'),campo=document.getElementById('admin-manual-nombre'),mensaje=document.getElementById('admin-manual-ficha');
  const nombre=String(campo?.value||'').normalize('NFC').trim().replace(/\s+/gu,' ');
  if(!dialogo||!campo||!mensaje||nombre.length<3)return;
  const actor=state.currentUser?.id,version=++adminManualVersion;
  const vigente=()=>adminAccesoVigente()&&state.currentUser?.id===actor&&document.getElementById('admin-nuevo-usuario-dialog')===dialogo&&
    version===adminManualVersion&&String(campo.value).normalize('NFC').trim().replace(/\s+/gu,' ')===nombre;
  adminManualPlanEnCurso=true;mensaje.textContent='Comprobando fichas laborales…';
  try{
    const permiso=await window.UsuariosService.getMiEstadoAdministrativo(true);
    if(!vigente())return;
    if(permiso?.es_admin_permanente!==true)throw Error('NO_AUTORIZADO');
    const [trabajadores,cuentas]=await Promise.all([window.TrabajadoresService.getTrabajadores(true),window.TrabajadoresService.listarVinculosCuentas()]);
    if(!vigente())return;
    const ocupados=new Set(cuentas.map(u=>u.trabajador_id).filter(Boolean));
    const coincidencias=trabajadores.filter(t=>t.estado!=='Eliminado'&&t.nombre===nombre);
    const elegibles=coincidencias.filter(t=>t.estado==='Activo'&&!ocupados.has(t.id));
    const decision=await adminConfirmarFichaAprobacion({usuario:{nombre},coincidencias,elegibles});
    if(!vigente())return;
    if(!decision){mensaje.textContent='Confirmación cancelada. No se creó ni vinculó ninguna ficha.';return;}
    const crear=decision.accion==='CREAR_Y_VINCULAR';
    if(crear?coincidencias.length>0:decision.accion!=='VINCULAR'||!elegibles.some(t=>t.id===decision.trabajadorId))throw Error('IDENTIDAD_REQUIERE_REVISION');
    adminManualPlan={nombre,accion:decision.accion,trabajadorId:crear?null:decision.trabajadorId};
    mensaje.textContent=crear?'Has confirmado crear y vincular una ficha nueva al habilitar la creación. Todavía no se ha creado.':
      'Ficha confirmada para esta persona: '+decision.trabajadorId+'. Todavía no se ha vinculado.';
  }catch(_){if(vigente())mensaje.textContent='No se pudo confirmar la ficha. Revisa identidad, disponibilidad y autorización; no se creó ni vinculó nada.';}
  finally{if(version===adminManualVersion)adminManualPlanEnCurso=false;}
}
function adminCampoPasswordManualHTML(id,titulo) {
  const ojo=adminPasswordEyeHTML(id,'eye-'+id).replace('<button type="button"','<button type="button" disabled');
  return '<div><label for="'+id+'" class="block text-sm font-bold">'+titulo+'</label>'+
    '<div class="relative admin-manual-password mt-2"><input id="'+id+'" type="password" disabled autocomplete="new-password" '+
    'class="alm-field block w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700" />'+ojo+'</div></div>';
}
function adminValidarPasswordsManual() {
  const a=document.getElementById('admin-manual-password')?.value,b=document.getElementById('admin-manual-password-confirm')?.value;
  return typeof a==='string'&&a.length>0&&a===b;
}
function adminLimpiarPasswordsManual() {
  for(const id of ['admin-manual-password','admin-manual-password-confirm']){const campo=document.getElementById(id);if(campo){
    campo.value='';if(campo.type==='text')togglePasswordVisibility(id,'eye-'+id);campo.type='password';
  }}
}
function adminCrearUsuarioManual(evento) {
  evento?.preventDefault();
  if(adminCreacionManualUIHabilitada()&&adminAccesoVigente()){
    void adminEnviarCreacionManual(false);return false;
  }
  const coinciden=adminValidarPasswordsManual();
  adminLimpiarPasswordsManual();
  if(!coinciden){const mensaje=document.getElementById('admin-manual-ficha');if(mensaje)mensaje.textContent='La contraseña inicial y su confirmación deben coincidir. La creación sigue bloqueada.';return false;}
  if (!adminAccesoVigente() || !adminCreacionManualUIHabilitada()) return false;
  // Fallo cerrado incluso si se modifica la bandera en una versión posterior sin conectar el backend.
  return false;
}
function adminClaveCreacionManual(){return 'hotel.creacion-manual.'+state.currentUser?.id;}
function adminActualizarRecuperacionManual() {
  const boton=document.getElementById('admin-manual-recuperar');if(!boton)return;
  let pendiente=false;
  try{
    const ticket=JSON.parse(sessionStorage.getItem(adminClaveCreacionManual())||'null');
    pendiente=ticket?.version===1&&ticket.actor===state.currentUser?.id&&ticket.body?.accion==='CREAR_USUARIO_MANUAL'&&
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ticket.body.solicitud_id||'');
  }catch(_){/* No borrar recibos ilegibles ni inventar una recuperación. */}
  boton.hidden=!pendiente;
  boton.disabled=!pendiente||adminManualEnCurso||!adminAccesoVigente()||!adminCreacionManualUIHabilitada();
}
function adminMensajeCreacionManual(data) {
  const etapas={AUTORIZAR:'autorización',SESION_SQL:'conexión PostgreSQL',RESERVAR:'reserva',PREPARAR_AUTH:'preparación de Auth',
    RECONCILIAR_AUTH:'reconciliación de Auth',TRANSICION_AUTH_CONFIRMADA:'registro del UUID Auth',
    VERIFICAR_PENDIENTE:'validación del perfil',VERIFICAR_VINCULO:'verificación del vínculo',
    TRANSICION_VINCULO_EN_CURSO:'reserva de vinculación',TRANSICION_VINCULADA:'registro del vínculo',
    VERIFICAR_APROBACION:'verificación de aprobación',TRANSICION_APROBACION_EN_CURSO:'reserva de aprobación',
    VERIFICAR_FINAL:'verificación final',TRANSICION_COMPLETADA:'finalización durable'};
  const mensajes={
    CREACION_MANUAL_DESHABILITADA:'La creación manual todavía no está disponible. Esta petición fue bloqueada; conserva cualquier solicitud anterior.',
    CREACION_MANUAL_ENSAYO_SIN_CONFIGURAR:'El ensayo no está configurado en el servidor. La creación permanece bloqueada.',
    CREACION_MANUAL_MODO_INCOMPATIBLE:'La configuración del ensayo requiere revisión. La creación permanece bloqueada.',
    CREACION_MANUAL_MODO_INVALIDO:'La configuración del ensayo requiere revisión. La creación permanece bloqueada.',
    CREACION_MANUAL_CORREO_NO_PERMITIDO:'Este correo no está autorizado para el ensayo. No cambies el correo de una solicitud existente.',
    CREACION_MANUAL_CORREO_EXISTENTE:'El correo ya pertenece a una cuenta. No vuelvas a crearla; revisa la cuenta y conserva esta solicitud.',
    CREACION_MANUAL_PASSWORD_INVALIDA:'Introduce una contraseña inicial válida y su confirmación. No se inició una creación desde esta petición.',
    CREACION_MANUAL_DATOS_INVALIDOS:'Los datos de creación no son válidos. Revisa los campos y la ficha confirmada.',
    SOLO_ADMIN_PERMANENTE:'Operación no autorizada: se requiere Administrador permanente vigente. Conserva cualquier solicitud pendiente.',
    SESION_INVALIDA:'La sesión no es válida. Inicia sesión como Administrador permanente y conserva la solicitud original.'
  };
  if(typeof data?.error==='string'&&Object.hasOwn(mensajes,data.error))return mensajes[data.error];
  if(typeof data?.etapa==='string'&&Object.hasOwn(etapas,data.etapa)){
    const sqlstate=/^[0-9A-Z]{5}$/.test(data.sqlstate||'')?' (SQLSTATE '+data.sqlstate+')':'';
    return 'No pudimos terminar de comprobar la cuenta. Usa Revisar solicitud en esta ventana; no crees otra cuenta.'+
      ' Referencia para soporte: '+data.etapa+sqlstate+'.';
  }
  if(data?.estado==='REVISION_AUTH'&&data.codigo_error==='PASSWORD_RECHAZADA')
    return 'Supabase rechazó la contraseña inicial. Usa Revisar solicitud antes de volver a intentarlo.';
  if(data?.estado==='REVISION_AUTH'&&data.codigo_error==='CORREO_EXISTENTE_AUTH')
    return 'Auth indicó que el correo ya existe. No se adoptará esa cuenta. Conserva la solicitud para revisión.';
  if(['VINCULADA','APROBACION_EN_CURSO','REVISION_APROBACION'].includes(data?.estado))
    return 'La ficha laboral quedó vinculada; la aprobación todavía no está confirmada. Usa Revisar solicitud, sin crear otra cuenta.';
  if(['AUTH_CONFIRMADA','VINCULO_EN_CURSO','REVISION_VINCULO'].includes(data?.estado))
    return 'La cuenta está creada, pero falta confirmar su ficha laboral. Usa Revisar solicitud; no crees otra cuenta.';
  return 'No pudimos confirmar que el proceso haya terminado. Usa Revisar solicitud; no crees otra cuenta.';
}
async function adminEnviarCreacionManual(recuperar) {
  if(!adminCreacionManualUIHabilitada()||!adminAccesoVigente()||adminManualEnCurso)return;
  const actor=state.currentUser?.id,mensaje=document.getElementById('admin-manual-ficha');
  let ticket,password,enviado=false;
  adminManualEnCurso=true;
  for(const id of ['admin-manual-crear','admin-manual-recuperar']){const el=document.getElementById(id);if(el)el.disabled=true;}
  try{
    const permiso=await window.UsuariosService.getMiEstadoAdministrativo(true);
    if(permiso?.es_admin_permanente!==true||state.currentUser?.id!==actor||!adminAccesoVigente())throw Error('PERMISO');
    const previo=sessionStorage.getItem(adminClaveCreacionManual());
    if(recuperar){
      ticket=previo?JSON.parse(previo):null;
      if(ticket?.actor!==actor||!ticket?.body?.solicitud_id)throw Error('RECIBO');
    }else if(previo){
      ticket=JSON.parse(previo);
      if(ticket?.actor!==actor||ticket.preparada!==true||!adminValidarPasswordsManual()||
          !document.getElementById('admin-manual-confirmacion')?.checked)throw Error('SOLICITUD_PREVIA');
      password=document.getElementById('admin-manual-password').value;
      ticket.preparada=false;
      sessionStorage.setItem(adminClaveCreacionManual(),JSON.stringify(ticket));
    }else{
      const nombre=String(document.getElementById('admin-manual-nombre')?.value||'').normalize('NFC').trim().replace(/\s+/gu,' ');
      const email=document.getElementById('admin-manual-email')?.value.trim().toLowerCase();
      const rol=document.getElementById('admin-manual-rol')?.value;
      if(!adminManualPlan||adminManualPlan.nombre!==nombre||!adminValidarPasswordsManual()||
        !document.getElementById('admin-manual-confirmacion')?.checked||!['Técnico','Recepción'].includes(rol)||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||''))throw Error('DATOS');
      password=document.getElementById('admin-manual-password').value;
      ticket={version:1,actor,body:{accion:'CREAR_USUARIO_MANUAL',solicitud_id:crypto.randomUUID(),nombre,email,rol,
        ficha_accion:adminManualPlan.accion,trabajador_id:adminManualPlan.trabajadorId,confirmacion:true}};
      // Escribir únicamente la intención no secreta ANTES de cualquier envío.
      sessionStorage.setItem(adminClaveCreacionManual(),JSON.stringify(ticket));
    }
    adminLimpiarPasswordsManual();
    adminActualizarRecuperacionManual();
    if(state.currentUser?.id!==actor||!adminAccesoVigente())throw Error('SESION');
    mensaje.textContent=recuperar?'Revisando la solicitud original…':'Creando cuenta y verificando su ficha…';
    let result;
    enviado=true;
    try{result=await window.supabaseClient.functions.invoke('usuario-invitaciones',{
      body:{...ticket.body,recuperar:recuperar===true,...(!recuperar?{password}:{})}
    });}finally{password=undefined;}
    if(state.currentUser?.id!==actor||!adminAccesoVigente())return;
    let data=result.data;
    if(result.error?.context&&typeof result.error.context.clone==='function'){
      try{data=await result.error.context.clone().json();}catch(_){data=null;}
    }
    if(!result.error&&data?.solicitud_id===ticket.body.solicitud_id&&data.estado==='PREPARADA'&&recuperar){
      ticket.preparada=true;sessionStorage.setItem(adminClaveCreacionManual(),JSON.stringify(ticket));
      mensaje.textContent='La cuenta de '+ticket.body.nombre+' ('+ticket.body.email+') todavía no se ha creado. Introduce de nuevo la contraseña y confirma el correo para continuar la solicitud guardada.';return;
    }
    const uuidManual=valor=>/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(valor||'');
    if(result.error||data?.solicitud_id!==ticket.body.solicitud_id||data?.ok!==true||data?.completada!==true||data.estado!=='COMPLETADA'||
        !uuidManual(data.cuenta_id)||!uuidManual(data.trabajador_id)||
        ticket.body.ficha_accion==='VINCULAR'&&data.trabajador_id!==ticket.body.trabajador_id){
      mensaje.textContent=adminMensajeCreacionManual(data?.solicitud_id===ticket.body.solicitud_id?data:
        {error:data?.error,etapa:data?.etapa,sqlstate:data?.sqlstate});return;
    }
    sessionStorage.removeItem(adminClaveCreacionManual());
    adminActualizarRecuperacionManual();
    mensaje.textContent='Cuenta, ficha laboral y rol confirmados. La persona ya puede iniciar sesión.';
    window.UsuariosService._usuariosCache=null;
    window.TrabajadoresService._trabajadoresCache=null;
    if(typeof cargarPanelAdminDatos==='function')void cargarPanelAdminDatos();
  }catch(error){if(mensaje&&state.currentUser?.id===actor){
    mensaje.textContent=enviado?adminMensajeCreacionManual(null):
      error?.message==='PERMISO'||error?.message==='SESION'?adminMensajeCreacionManual({error:'SOLO_ADMIN_PERMANENTE'}):
      error?.message==='SOLICITUD_PREVIA'?'Existe una solicitud anterior. Usa Revisar solicitud; no generes otra creación.':
      'Solicitud no enviada. Revisa nombre, correo, rol, ficha laboral, confirmación y que ambas contraseñas coincidan.';
  }}
  finally{
    password=undefined;adminLimpiarPasswordsManual();adminManualEnCurso=false;
    adminActualizarRecuperacionManual();
    const crear=document.getElementById('admin-manual-crear');if(crear){
      try{const raw=sessionStorage.getItem(adminClaveCreacionManual());crear.disabled=!adminCreacionManualUIHabilitada()||!!raw&&JSON.parse(raw).preparada!==true;}catch(_){crear.disabled=true;}
    }
  }
}
function adminCerrarNuevoUsuario() {
  if(adminManualEnCurso)return;
  const dialogo=document.getElementById('admin-nuevo-usuario-dialog');if(!dialogo)return;
  adminLimpiarPasswordsManual();
  if(adminManualPlanEnCurso){const confirmacion=document.getElementById('admin-aprobacion-ficha-dialog');confirmacion?.close();confirmacion?.remove();}
  adminInvalidarFichaManual();
  dialogo.close();dialogo.remove();document.getElementById('admin-abrir-nuevo')?.focus();
}
function adminAbrirNuevoUsuario() {
  if (!adminAccesoVigente()) return;
  if (document.getElementById('admin-nuevo-usuario-dialog') || document.getElementById('admin-invitacion-dialog')?.open) return;
  const dialogo=document.createElement('dialog');dialogo.id='admin-nuevo-usuario-dialog';
  dialogo.className='alm-ui alm-panel w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700';
  dialogo.setAttribute('aria-labelledby','admin-manual-titulo');dialogo.setAttribute('aria-describedby','admin-manual-bloqueo');
  dialogo.innerHTML='<h2 id="admin-manual-titulo" class="text-lg font-bold">Nuevo usuario</h2>'+
    '<p id="admin-manual-bloqueo" role="status" class="text-sm text-slate-600 dark:text-slate-300">'+(adminCreacionManualUIHabilitada()?'Confirma la identidad laboral y el correo antes de activar la cuenta. El servidor comprobará si la creación está disponible.':'Creación aún bloqueada. Puedes revisar la ficha laboral, pero todavía no guardar una cuenta.')+'</p>'+
    '<form onsubmit="return adminCrearUsuarioManual(event)"><fieldset class="space-y-4">'+
    '<label class="block text-sm font-bold">Nombre completo<input id="admin-manual-nombre" type="text" autocomplete="off" oninput="adminInvalidarFichaManual()" onchange="adminPlanificarFichaManual()" class="alm-field block w-full mt-2 p-3 rounded-xl border border-slate-300 dark:border-slate-700" /></label>'+
    '<p id="admin-manual-ficha" role="status" class="text-sm text-slate-600 dark:text-slate-300">La ficha se comprobará al terminar el nombre. No se vinculará automáticamente.</p>'+
    '<label class="block text-sm font-bold">Correo electrónico<input id="admin-manual-email" type="email" autocomplete="off" class="alm-field block w-full mt-2 p-3 rounded-xl border border-slate-300 dark:border-slate-700" /></label>'+
    '<label class="block text-sm font-bold">Rol<select id="admin-manual-rol" class="alm-field block w-full mt-2 p-3 rounded-xl border border-slate-300 dark:border-slate-700"><option value="">Selecciona un rol</option><option>Técnico</option><option>Recepción</option></select></label>'+
    adminCampoPasswordManualHTML('admin-manual-password','Contraseña inicial')+
    adminCampoPasswordManualHTML('admin-manual-password-confirm','Confirmar contraseña')+
    '<label class="flex items-start gap-2 text-sm"><input id="admin-manual-confirmacion" type="checkbox" disabled />Confirmo que he verificado el correo y asumo la activación de esta cuenta.</label></fieldset>'+
    '<div class="flex flex-wrap justify-between gap-4 pt-5"><button type="button" onclick="adminCerrarNuevoUsuario()" class="alm-btn-secondary px-4 py-2">Cancelar</button><button id="admin-manual-recuperar" type="button" hidden disabled onclick="adminEnviarCreacionManual(true)" class="alm-btn-secondary px-4 py-2">Revisar solicitud</button><button id="admin-manual-crear" type="submit" disabled class="alm-btn-primary px-4 py-2">Crear usuario</button></div></form>';
  adminInvalidarFichaManual();
  dialogo.addEventListener('cancel',evento=>evento.preventDefault());document.body.appendChild(dialogo);dialogo.showModal();
  if(adminCreacionManualUIHabilitada()){
    for(const el of dialogo.querySelectorAll('input,select,button'))el.disabled=false;
    try{document.getElementById('admin-manual-crear').disabled=!!sessionStorage.getItem(adminClaveCreacionManual());}
    catch(_){document.getElementById('admin-manual-crear').disabled=true;}
  }
  try{
    const ticket=JSON.parse(sessionStorage.getItem(adminClaveCreacionManual())||'null');
    if(ticket?.version===1&&ticket.actor===state.currentUser?.id&&ticket.body?.accion==='CREAR_USUARIO_MANUAL'&&
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ticket.body.solicitud_id||'')){
      document.getElementById('admin-manual-ficha').textContent='Solicitud original guardada: '+ticket.body.solicitud_id+
        '. Usa Revisar solicitud para comprobar cómo quedó. No crees otra cuenta.';
    }
  }catch(_){document.getElementById('admin-manual-ficha').textContent='No se pudo leer la solicitud guardada. Conserva sus datos y solicita revisión; no inicies otra creación.';}
  adminActualizarRecuperacionManual();
  dialogo.querySelector('button[type="button"]')?.focus();
}

function adminInvitacionClave(email) { return 'hotel.invitar.' + state.currentUser?.id + '.' + encodeURIComponent(email); }
function adminActualizarInvitacion() {
  if (adminInvitacionTimer !== null) { clearTimeout(adminInvitacionTimer); adminInvitacionTimer=null; }
  const input=document.getElementById('admin-invitacion-email'), button=document.getElementById('admin-invitacion-enviar');
  const message=document.getElementById('admin-invitacion-estado');
  if(!input||!button)return;
  if (!adminInvitacionRestaurada) {
    adminInvitacionRestaurada=true;
    try { const ultimo=sessionStorage.getItem('hotel.invitar.ultimo.'+state.currentUser?.id);
      if (!input.value && typeof ultimo==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ultimo)) input.value=ultimo;
    } catch (_) {}
  }
  const email=input.value.trim().toLowerCase();
  if(adminInvitacionEstado && (adminInvitacionEstado.email!==email||adminInvitacionEstado.actor!==state.currentUser?.id)){
    adminInvitacionEstado=null;message.textContent='Correo cambiado. Revisa su estado antes de reenviar.';
  }
  const ticket=adminInvitacionTicket(email), pendiente=ticket&&['ENVIANDO','INCIERTO','REQUIERE_REVISION'].includes(ticket.estado);
  const waiting=Math.max(0,Math.ceil(((adminInvitacionEstado?.hasta||0)-Date.now())/1000)), estado=adminInvitacionEstado?.estado;
  input.disabled=adminInvitacionEnCurso;
  const cancelar=document.getElementById('admin-invitacion-cancelar'); if(cancelar)cancelar.disabled=adminInvitacionEnCurso;
  button.textContent=waiting?'Podrás reenviar en '+String(Math.floor(waiting/60)).padStart(2,'0')+':'+String(waiting%60).padStart(2,'0'):estado==='INVITACION_PENDIENTE'?'Reenviar invitación':'Enviar invitación';
  button.disabled=!!(adminInvitacionEnCurso||adminInvitacionConsultando||!estado||adminInvitacionEstado?.envio_habilitado!==true||pendiente||!adminAccesoVigente()||window.INVITACIONES_UI_HABILITADA!==true||
    estado==='INVITACION_PENDIENTE'&&adminInvitacionEstado?.reenvio_permitido!==true||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||waiting>0||estado&&!['CORREO_NUEVO','INVITACION_PENDIENTE'].includes(estado));
  if(pendiente)message.textContent='Hay un envío de este correo sin resultado confirmado. Requiere revisión; no se reenviará automáticamente.';
  if(window.INVITACIONES_UI_HABILITADA!==true)message.textContent='Las invitaciones no están habilitadas en esta página.';
  if(adminInvitacionEstado?.refrescarAlTerminar && !waiting && !adminInvitacionEnCurso && !adminInvitacionConsultando){
    adminInvitacionEstado.refrescarAlTerminar=false;adminProgramarConsultaInvitacion(0);return;
  }
  if(waiting&&!adminInvitacionEnCurso)adminInvitacionTimer=setTimeout(adminActualizarInvitacion,1000);
}
function adminMostrarEstadoInvitacion(info) {
  const mensajes={CORREO_NUEVO:'Correo sin cuenta. Puedes enviar la invitación.',
    INVITACION_PENDIENTE:'Invitación sin confirmar. Puedes solicitar otro correo al terminar la espera. No se garantiza que el enlace anterior quede invalidado.',
    REGISTRO_INCOMPLETO:'Correo confirmado, registro incompleto. La persona debe continuar en registrar.html con su contraseña o usar Recuperar contraseña. No reenvíes una invitación.',
    PENDIENTE_APROBACION:'Registro completo, pendiente de aprobación. Revisa la solicitud y su ficha laboral; no reenvíes.',
    CUENTA_APROBADA:'Cuenta con rol asignado. Debe iniciar sesión o recuperar contraseña; no reenvíes.',
    REQUIERE_REVISION:'Estado que requiere revisión administrativa. No se enviará ninguna invitación.'};
  document.getElementById('admin-invitacion-estado').textContent=info.envio_habilitado===true?(info.estado==='INVITACION_PENDIENTE'&&!info.reenvio_permitido&&!info.espera_segundos?'La invitación sigue pendiente, pero el servidor no permite reenviarla en este momento.':mensajes[info.estado]):'El envío de invitaciones está deshabilitado en el servidor. No se enviará ningún correo.';
}
async function adminConsultarCorreoInvitacion(email,actor,version=adminInvitacionConsultaVersion) {
  const info=await window.invocarUsuarioInvitaciones({accion:'CONSULTAR_INVITACION',email},actor);
  if(version!==adminInvitacionConsultaVersion)return null;
  if(!adminAccesoVigente()||state.currentUser?.id!==actor||document.getElementById('admin-invitacion-email')?.value.trim().toLowerCase()!==email)
    throw Object.assign(Error(),{codigo:'SESION_CAMBIO_REVISAR'});
  adminInvitacionEstado={...info,actor,hasta:Date.now()+info.espera_segundos*1000,refrescarAlTerminar:info.espera_segundos>0};adminMostrarEstadoInvitacion(info);return info;
}
async function adminEnviarInvitacion(evento) {
  evento?.preventDefault();
  if(adminInvitacionEnCurso||!adminAccesoVigente()||window.INVITACIONES_UI_HABILITADA!==true)return;
  const input=document.getElementById('admin-invitacion-email'),message=document.getElementById('admin-invitacion-estado');if(!input||!message)return;
  const actor=state.currentUser?.id,email=input.value.trim().toLowerCase(),previous=adminInvitacionTicket(email);
  if(previous&&['ENVIANDO','INCIERTO','REQUIERE_REVISION'].includes(previous.estado)){adminActualizarInvitacion();return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){message.textContent='Ingresa un correo electrónico válido.';return;}
  const revisada=adminInvitacionEstado?.email===email&&adminInvitacionEstado.actor===actor;
  adminCancelarConsultaInvitacion();
  adminInvitacionEnCurso=true;adminActualizarInvitacion();let ticket=null;
  try{
    const permiso=await window.UsuariosService.getMiEstadoAdministrativo(true);
    if(!adminAccesoVigente()||state.currentUser?.id!==actor||permiso?.es_admin_permanente!==true)throw Object.assign(Error(),{codigo:'SOLO_ADMIN_PERMANENTE'});
    const info=await adminConsultarCorreoInvitacion(email,actor);
    if(!info || info.envio_habilitado!==true)return;
    if(info.estado!=='CORREO_NUEVO'&&!(revisada&&info.reenvio_permitido))return;
    if(info.estado==='INVITACION_PENDIENTE'&&!info.identidad_id)return;
    ticket={version:1,actor,email,solicitudId:crypto.randomUUID(),estado:'ENVIANDO',identidadId:info.identidad_id};
    sessionStorage.setItem(adminInvitacionClave(email),JSON.stringify(ticket));
    sessionStorage.setItem('hotel.invitar.ultimo.'+actor,email);
    message.textContent=info.estado==='CORREO_NUEVO'?'Solicitando invitación…':'Solicitando reenvío…';
    const body=info.estado==='CORREO_NUEVO'?{accion:'INVITAR',email}:{accion:'REENVIAR_INVITACION',email,identidad_id:info.identidad_id};
    const result=await window.invocarUsuarioInvitaciones(body,actor);
    ticket.estado='CONFIRMADA';ticket.identidadId=result.identidad_id;
    adminInvitacionEstado={email,actor,estado:'INVITACION_PENDIENTE',identidad_id:result.identidad_id,hasta:Date.now()+60000,envio_habilitado:true,refrescarAlTerminar:true};
    message.textContent='Supabase confirmó la solicitud. Revisa la recepción; la entrega en bandeja no está acreditada. No se reenviará automáticamente.';
  }catch(error){
    const incierto=error?.incierto===true||!error?.codigo;if(ticket)ticket.estado=incierto?'INCIERTO':'RECHAZADA';
    const mensajes={INVITACIONES_DESHABILITADAS:'El servidor rechazó este intento: la compuerta general está cerrada.',
      ENVIO_INVITACION_DESHABILITADO:'El envío está cerrado en el servidor.',SOLO_ADMIN_PERMANENTE:'Se requiere Administrador permanente vigente.',
      CUENTA_EXISTENTE_REVISAR:'La cuenta ya existe o cambió. Revisa el correo antes de otro intento.',
      REENVIO_NO_AUTORIZADO_REVISAR:'El estado cambió o aún no permite reenvío. Revisa el correo antes de continuar.',
      CONEXION_INVITACION_SIN_AFINIDAD:'Conexión del servidor incompatible. Envío bloqueado.'};
    message.textContent=incierto&&ticket?'Resultado incierto: el correo podría haberse enviado. Conserva la solicitud y solicita revisión; no reenvíes a ciegas.':mensajes[error.codigo]||'No se pudo verificar el estado. No se solicitó un envío desde esta acción; conserva cualquier solicitud anterior para revisión.';
    adminInvitacionEstado=null;
  }finally{
    if(ticket){try{sessionStorage.setItem(adminInvitacionClave(email),JSON.stringify(ticket));}catch(_){message.textContent='No se pudo conservar el resultado. Revisión manual obligatoria; no reenvíes.';}}
    adminInvitacionEnCurso=false;adminActualizarInvitacion();
  }
}
function adminCancelarConsultaInvitacion() {
  if(adminInvitacionConsultaTimer!==null){clearTimeout(adminInvitacionConsultaTimer);adminInvitacionConsultaTimer=null;}
  ++adminInvitacionConsultaVersion;adminInvitacionConsultando=false;
}
function adminProgramarConsultaInvitacion(espera=700) {
  adminCancelarConsultaInvitacion();adminInvitacionEstado=null;
  const input=document.getElementById('admin-invitacion-email'),message=document.getElementById('admin-invitacion-estado');
  adminActualizarInvitacion();
  if(!input||!message||adminInvitacionEnCurso||!adminAccesoVigente()||window.INVITACIONES_UI_HABILITADA!==true)return;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())){message.textContent='Introduce un correo electrónico válido.';return;}
  adminInvitacionConsultando=true;message.textContent='Comprobando el correo…';adminActualizarInvitacion();
  const version=adminInvitacionConsultaVersion;
  adminInvitacionConsultaTimer=setTimeout(()=>{adminInvitacionConsultaTimer=null;return adminRevisarInvitacion(version);},espera);
}
// Consulta de solo lectura. Nunca envía una invitación ni reintenta después de un error.
async function adminRevisarInvitacion(version) {
  if(version===undefined){adminCancelarConsultaInvitacion();version=adminInvitacionConsultaVersion;}
  if(version!==adminInvitacionConsultaVersion||adminInvitacionEnCurso||!adminAccesoVigente()||window.INVITACIONES_UI_HABILITADA!==true)return;
  const input=document.getElementById('admin-invitacion-email'),message=document.getElementById('admin-invitacion-estado');
  const email=input?.value.trim().toLowerCase(),actor=state.currentUser?.id;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||''))return;
  adminInvitacionConsultando=true;adminActualizarInvitacion();
  try{await adminConsultarCorreoInvitacion(email,actor,version);}
  catch(error){if(version!==adminInvitacionConsultaVersion)return;
    adminInvitacionEstado=null;
    message.textContent=error?.codigo==='INVITACIONES_DESHABILITADAS'?'Las invitaciones están deshabilitadas en el servidor. No se enviará ningún correo.'
      :'No se pudo comprobar el correo. El envío permanece bloqueado; puedes cerrar y volver a abrir el modal para revisarlo. No se enviará ni reintentará automáticamente.';
  }finally{if(version===adminInvitacionConsultaVersion){adminInvitacionConsultando=false;adminActualizarInvitacion();}}
}

function getAdminPanelHTML(usuarios, roles) {
  if (!adminAccesoVigente()) return adminAccesoDenegadoHTML();
  const total = usuarios.length;

  const adminCount = usuarios.filter(u => adminRolClaveUI(u) === 'ADMINISTRADOR').length;
  const tecCount = usuarios.filter(u => adminRolClaveUI(u) === 'TECNICO').length;
  const recCount = usuarios.filter(u => adminRolClaveUI(u) === 'RECEPCION').length;
  // FASE S3C-1A: pendientes = estado = true y rol_id = NULL.
  const pendCount = adminContarPendientes(usuarios);
  // "Activas" = cuentas CON ROL y estado = true (aprobadas y en uso).
  // Se separa de Pendientes para no duplicar información.
  const activeCount = usuarios.filter(u => u && u.estado === true && !adminEsPendiente(u)).length;
  const inactiveCount = usuarios.filter(u => u && u.estado !== true).length;

  // Filtro de roles: construido con los roles REALES de public.roles.
  const opcionesRoles = (roles || []).map(r => `
    <option value="${adminEscapeHTML(r.id)}" ${adminRoleFilter === r.id ? 'selected' : ''}>
      ${adminEscapeHTML(r.nombre)}
    </option>`).join('');

  return `
    <div class="alm-ui alm-main-page alm-module-page alm-admin space-y-6 max-w-7xl mx-auto pb-12">

      ${uiEncabezadoSeccion('Panel de Administración & Roles','Consulta y gestiona las cuentas y sus permisos.','shield','<div class="flex flex-wrap gap-2"><button id="admin-abrir-invitacion" type="button" onclick="adminAbrirInvitacion()" class="alm-btn-primary px-4 py-2">Invitar trabajador</button><button id="admin-abrir-nuevo" type="button" onclick="adminAbrirNuevoUsuario()" class="alm-btn-secondary px-4 py-2">Nuevo usuario</button></div>')}

      <div id="admin-eliminaciones-pendientes" role="status" class="text-sm break-words"></div>

      <!-- TARJETAS DE ESTADÍSTICAS (derivadas de usuarios reales) -->
      <div class="alm-summary-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">

        <!-- Total Cuentas -->
        <div class="alm-summary-card bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm card-hover">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Cuentas</span>
            <span class="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm font-bold">👥</span>
          </div>
          <div class="text-2xl sm:text-3xl font-black text-slate-800 dark:text-white" data-admin-total-cantidad>${total}</div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Cuentas registradas</p>
        </div>

        <!-- Administradores -->
        <div class="alm-summary-card bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm card-hover">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Administradores</span>
            <span class="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm">👨‍💼</span>
          </div>
          <div class="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">${adminCount}</div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Acceso irrestricto</p>
        </div>

        <!-- Técnicos -->
        <div class="alm-summary-card bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm card-hover">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Técnicos</span>
            <span class="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center text-sm">👷‍♂️</span>
          </div>
          <div class="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">${tecCount}</div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Operación y terreno</p>
        </div>

        <!-- Recepción -->
        <div class="alm-summary-card bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm card-hover">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Recepción</span>
            <span class="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center text-sm">👩‍💼</span>
          </div>
          <div class="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400">${recCount}</div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Atención y solicitudes</p>
        </div>

        <!-- FASE S3C-1A: Cuentas Pendientes de Aprobación -->
        <div class="alm-summary-card bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-amber-200 dark:border-amber-900/60 shadow-sm card-hover">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Pendientes</span>
            <span class="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center text-sm">⏳</span>
          </div>
          <div class="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400" data-admin-pendientes-cantidad>${pendCount}</div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Sin rol asignado</p>
        </div>

        <!-- Cuentas Activas (aprobadas: con rol y estado = true) -->
        <div class="alm-summary-card bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm card-hover col-span-2 sm:col-span-1">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Activas</span>
            <span class="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">✓</span>
          </div>
          <div class="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">${activeCount} <span class="text-xs text-slate-400 font-normal">/ ${total}</span></div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Con rol asignado${inactiveCount > 0 ? ` · ${inactiveCount} inactiva(s)` : ''}</p>
        </div>

      </div>

      <!-- SECCIÓN: TABLA DE USUARIOS -->
      <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 class="text-base sm:text-lg font-black text-slate-800 dark:text-white flex items-center space-x-2">
              <span>👥</span>
              <span>Usuarios del Sistema Hotelero</span>
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">Cuentas registradas</p>
          </div>

          <!-- Filtros y Buscador Rápido -->
          <div class="flex items-center space-x-2.5">
            <!-- Buscador -->
            <div class="relative w-44 sm:w-60">
              <input type="text" id="admin-search-input" value="${adminEscapeHTML(adminSearchQuery)}" oninput="handleAdminSearch(this.value)"
                placeholder="Buscar por nombre o correo..."
                class="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <span class="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
            </div>

            <!-- Filtro de Rol (roles REALES desde public.roles) -->
            <select onchange="handleAdminRoleFilter(this.value)"
              class="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="ALL" ${adminRoleFilter === 'ALL' ? 'selected' : ''}>Todos los roles</option>
              ${opcionesRoles}
              <!-- FASE S3C-1A: opción de vista, NO un rol ficticio.
                   Filtra por estado = true y rol_id = NULL. -->
              <option value="${ADMIN_FILTRO_PENDIENTES}" ${adminRoleFilter === ADMIN_FILTRO_PENDIENTES ? 'selected' : ''}>Pendientes de aprobación</option>
            </select>
          </div>
        </div>

        <!-- Tabla Responsiva de Usuarios -->
        <div class="overflow-x-auto custom-scrollbar -mx-2 sm:mx-0">
          <table class="w-full text-left border-collapse min-w-[560px]">
            <thead>
              <tr class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <th class="py-3 px-4 rounded-l-xl">Colaborador</th>
                <th class="py-3 px-3">Rol</th>
                <th class="py-3 px-3">Estado</th>
                <th class="py-3 px-4 text-right rounded-r-xl">Acciones</th>
              </tr>
            </thead>
            <tbody data-admin-usuarios-lista class="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              ${getAdminFilasHTML(usuarios)}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}

// Filas filtradas por búsqueda (nombre visible / email) y por rol_id
// real seleccionado, o por la vista "Pendientes de aprobación"
// (estado = true y rol_id = NULL).
function getAdminFilasHTML(usuarios) {
  if (!adminAccesoVigente()) return '';
  const query = (adminSearchQuery || '').trim().toLowerCase();

  const filtrados = usuarios.filter(u => {
    if (!u) return false;

    const coincideBusqueda = !query ||
      adminNombreVisible(u).toLowerCase().includes(query) ||
      (u.email && String(u.email).toLowerCase().includes(query));

    let coincideRol;
    if (adminRoleFilter === 'ALL') {
      coincideRol = true;
    } else if (adminRoleFilter === ADMIN_FILTRO_PENDIENTES) {
      // FASE S3C-1A: vista de pendientes (NO es un rol).
      coincideRol = adminEsPendiente(u) || usuarioEsExcepcionalEliminacion(u);
    } else {
      coincideRol = u.rol_id === adminRoleFilter;
    }

    return coincideBusqueda && coincideRol;
  });

  if (filtrados.length === 0) {
    return `
      <tr>
        <td colspan="4" class="py-8 text-center text-slate-400">
          No se encontraron usuarios con el criterio de búsqueda.
        </td>
      </tr>
    `;
  }

  return filtrados.map(u => {
    const nombreVisible = adminNombreVisible(u);
    const esActual = state.currentUser && state.currentUser.id === u.id; // ambos UUID reales
    const claveUI = adminRolClaveUI(u);
    // FASE S3C-1A: el nombre del rol real solo existe si hay rol_id.
    // Para una cuenta pendiente se muestra literalmente
    // "Sin rol asignado"; NUNCA se inventa un rol.
    const esPendiente = adminEsPendiente(u);
    const nombreRolReal = (u.roles && u.roles.nombre) || 'Sin rol asignado';
    const esActivo = u.estado === true;

    // FASE S3C-1A: el badge principal de ESTADO distingue pendiente
    // de activa. Una cuenta pendiente NO se muestra como "Activo".
    let estadoBadge;
    let estadoTexto;
    if (esPendiente) {
      estadoBadge = 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      estadoTexto = typeof u.nombre === 'string' && u.nombre.trim() ? '⏳ Pendiente de aprobación' : 'Registro incompleto';
    } else if (esActivo) {
      estadoBadge = 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      estadoTexto = 'Activo';
    } else {
      estadoBadge = 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      estadoTexto = 'Inactivo';
    }

    // Badge del ROL: pendiente usa un estilo propio (ámbar); los
    // roles reales conservan su color por clave de UI.
    const rolBadgeClases = esPendiente
      ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
      : adminRolBadgeClasses(claveUI);

    // S3C-2C: bloque de administración temporal en la fila.
    // Reglas de VISIBILIDAD (defensa UX; la autorización real vive en
    // la RPC del backend):
    //   - puedeGestionarDelegaciones: SÓLO Administrador PERMANENTE
    //     (adminAccesoVigente()). Un Administrador TEMPORAL jamás
    //     ve otorgar/revocar.
    //   - elegibleOtorgar: cuenta APROBADA (no pendiente), NO
    //     Administrador permanente y NO la propia cuenta.
    const puedeGestionarDelegaciones = adminAccesoVigente();
    const esAdminPermanenteFila = claveUI === 'ADMINISTRADOR';
    const elegibleOtorgar = esActivo && !!u.rol_id && !esPendiente && !esActual && !esAdminPermanenteFila;

    // S3C-2C: estado de la delegación para esta fila (sólo se calcula
    // si la cuenta es elegible: un Admin permanente o una cuenta
    // pendiente jamás tendrían bloque de delegación).
    const delegacionActiva = elegibleOtorgar ? adminDelegacionVigentePara(u.id) : null;
    const delegacionProgramada = (elegibleOtorgar && !delegacionActiva) ? adminDelegacionProgramadaPara(u.id) : null;
    const delegacionesCerradas = elegibleOtorgar ? adminDelegacionesCerradasPara(u.id) : 0;

    let delegacionHTML = '';
    if (!esPendiente) {
      if (delegacionActiva) {
        delegacionHTML = `
          <div class="mt-2 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-2 text-left">
            <p class="text-[10px] font-extrabold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              🛡️ Administración temporal · Activa
            </p>
            <p class="text-[11px] text-emerald-800 dark:text-emerald-200 mt-0.5">
              Hasta: <strong>${adminEscapeHTML(adminFormatearFechaHora(delegacionActiva.vigente_hasta))}</strong>
            </p>
            ${delegacionActiva.motivo ? `
              <p class="text-[10px] text-emerald-700 dark:text-emerald-300 mt-0.5 truncate">
                Motivo: ${adminEscapeHTML(delegacionActiva.motivo)}
              </p>` : ''}
            ${puedeGestionarDelegaciones ? `
              <button type="button" data-nombre="${adminEscapeHTML(adminNombreVisible(u))}" onclick="revocarAdministracionTemporalConfirmada('${adminEscapeHTML(delegacionActiva.id)}', this.dataset.nombre)"
                class="mt-1.5 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-[11px] font-bold transition-all inline-flex items-center space-x-1"
                title="Revocar el acceso administrativo temporal ahora">
                <span>⛔</span>
                <span>Revocar acceso</span>
              </button>` : ''}
          </div>`;
      } else if (delegacionProgramada) {
        delegacionHTML = `
          <div class="mt-2 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-2 text-left">
            <p class="text-[10px] font-extrabold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              🛡️ Administración temporal · Programada
            </p>
            <p class="text-[11px] text-blue-800 dark:text-blue-200 mt-0.5">
              Desde: <strong>${adminEscapeHTML(adminFormatearFechaHora(delegacionProgramada.vigente_desde))}</strong>
            </p>
            <p class="text-[11px] text-blue-800 dark:text-blue-200">
              Hasta: <strong>${adminEscapeHTML(adminFormatearFechaHora(delegacionProgramada.vigente_hasta))}</strong>
            </p>
            ${delegacionProgramada.motivo ? `
              <p class="text-[10px] text-blue-700 dark:text-blue-300 mt-0.5 truncate">
                Motivo: ${adminEscapeHTML(delegacionProgramada.motivo)}
              </p>` : ''}
            ${puedeGestionarDelegaciones ? `
              <button type="button" data-nombre="${adminEscapeHTML(adminNombreVisible(u))}" onclick="revocarAdministracionTemporalConfirmada('${adminEscapeHTML(delegacionProgramada.id)}', this.dataset.nombre)"
                class="mt-1.5 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-[11px] font-bold transition-all inline-flex items-center space-x-1"
                title="Cancelar la administración temporal programada">
                <span>⛔</span>
                <span>Revocar acceso</span>
              </button>` : ''}
          </div>`;
      } else if (elegibleOtorgar) {
        // Sin delegación vigente ni programada. El historial cerrado
        // (expirada / revocada) sólo se menciona, nunca como activa.
        const historialHTML = delegacionesCerradas > 0
          ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 mt-1 text-left">Historial: ${delegacionesCerradas} delegación(ones) cerrada(s).</p>`
          : '';
        delegacionHTML = `
          <div class="mt-2 flex flex-col items-end">
            ${puedeGestionarDelegaciones ? `
              <button onclick="abrirModalAdministracionTemporal('${adminEscapeHTML(u.id)}')"
                class="px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[11px] font-bold transition-all inline-flex items-center space-x-1 shadow-sm"
                title="Otorgar privilegios administrativos por un período limitado">
                <span>⏱️</span>
                <span>Otorgar administración temporal</span>
              </button>` : ''}
            ${historialHTML}
          </div>`;
      }
    }
    let accionesHTML = esPendiente
      ? (esActual
        ? `
          <button disabled
            class="px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-bold transition-all inline-flex items-center space-x-1 shadow-sm opacity-60 cursor-not-allowed"
            title="No es posible aprobar tu propia cuenta.">
            <span>📄</span>
            <span class="hidden sm:inline">Revisar solicitud</span>
          </button>`
        : `
          <button onclick="revisarSolicitudPendiente('${adminEscapeHTML(u.id)}')"
            class="px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-xs font-bold transition-all inline-flex items-center space-x-1 shadow-sm"
            title="Revisar solicitud y aprobar cuenta">
            <span>📄</span>
            <span class="hidden sm:inline">Revisar solicitud</span>
          </button>`)
      : (esActual || !u.rol_id ? '' : `
          <button type="button" onclick="changeUserRole('${adminEscapeHTML(u.id)}')" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold">Cambiar rol</button>
          ${u.estado === false ? `<button type="button" onclick="toggleUserStatus('${adminEscapeHTML(u.id)}')" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold">Reactivar cuenta</button>` : ''}
          ${adminObjetivoEliminacionPermitido(u) ? `<button type="button" onclick="adminAbrirGestion('${adminEscapeHTML(u.id)}','ELIMINAR_UI')" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-700 dark:text-rose-300 text-xs font-bold">Eliminar cuenta</button>` : ''}
        `);

    if (!esActual && usuarioEsExcepcionalEliminacion(u)) accionesHTML += `
      <button type="button" onclick="adminAbrirGestion('${adminEscapeHTML(u.id)}','ELIMINAR_UI')" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-700 dark:text-rose-300 text-xs font-bold">Eliminar cuenta de prueba</button>`;
    if (!esActual && u.rol_id && window.TrabajadoresService?.solicitudAprobacionLaboral(u.id)) accionesHTML += `
      <button type="button" class="alm-btn-secondary" onclick="adminRevisarAprobacionLaboral('${adminEscapeHTML(u.id)}',this)">Revisar aprobación pendiente</button>`;
    return `
      <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
        <td class="py-3.5 px-4">
          <div class="flex items-center space-x-3">
            <div class="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300 flex-shrink-0">
              ${adminEscapeHTML(adminIniciales(u))}
            </div>
            <div class="min-w-0">
              <p class="font-bold text-slate-800 dark:text-slate-100 truncate flex items-center space-x-1.5">
                <span>${adminEscapeHTML(nombreVisible)}</span>
                ${esActual ? '<span class="px-1.5 py-0.2 rounded bg-blue-600 text-white text-[9px] font-black uppercase">TÚ</span>' : ''}
              </p>
              <p class="text-[11px] text-slate-400 dark:text-slate-500 truncate">${adminEscapeHTML(u.email || 'Sin correo')}</p>
            </div>
          </div>
        </td>
        <td class="py-3.5 px-3">
          <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${rolBadgeClases}">
            ${adminEscapeHTML(nombreRolReal)}
          </span>
        </td>
        <td class="py-3.5 px-3">
          <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${estadoBadge}">
            <span class="w-1.5 h-1.5 rounded-full ${esPendiente ? 'bg-amber-500' : (esActivo ? 'bg-emerald-500' : 'bg-rose-500')}"></span>
            <span>${estadoTexto}</span>
          </span>
        </td>
        <td class="py-3.5 px-4 text-right">
            ${accionesHTML}
            <!-- S3C-2C: estado/botones de administración temporal -->
            ${delegacionHTML}
          </td>
      </tr>
    `;
  }).join('');
}

// ==========================================================
// HANDLERS DE FILTRO (re-render SIN volver a consultar Supabase)
// ==========================================================
function handleAdminSearch(valor) {
  adminSearchQuery = valor;
  refrescarContenidoAdmin();
}

function handleAdminRoleFilter(rolId) {
  adminRoleFilter = rolId;
  refrescarContenidoAdmin();
}

function refrescarContenidoAdmin() {
  if (!adminAccesoVigente()) return;
  const container = document.getElementById('admin-content');
  if (!container || currentView !== 'admin') return;
  if (!adminUsuariosReales || !adminRolesReales) return;

  adminRenderizarPanelConInvitacion(container, getAdminPanelHTML(adminUsuariosReales, adminRolesReales));

  // Restaurar foco en el buscador (el re-render recrea el input).
  const input = document.getElementById('admin-search-input');
  if (input) {
    input.focus();
    const largo = input.value.length;
    input.setSelectionRange(largo, largo);
  }
}

// ==========================================================
// ACCIONES DE GESTIÓN — DESHABILITADAS (S3B-3)
// ==========================================================
// Todas siguen sin escribir en Supabase. El mensaje existe desde S2B
// y se conserva hasta que la escritura real esté implementada.
// IMPORTANTE: modals.js ya declara a nivel global la constante
// MSG_GESTION_USUARIOS_DESHABILITADA. Declararla también aquí rompía
// la carga de modals.js (SyntaxError: Identifier already declared) y
// por arrastre app.js (ReferenceError: populateSelectAreas is not
// defined). Se usa un nombre EXCLUSIVO de este archivo.
const ADMIN_MSG_GESTION_DESHABILITADA =
  'Gestión de usuarios temporalmente deshabilitada. Se está migrando a Supabase. ' +
  'Los usuarios reales serán creados/invitados por el administrador del sistema.';

// openUserFormModal(): NO se declara aquí. La definición única vive
// en js/modals.js (junto al stub handleSaveUserForm) y sigue siendo
// un stub deshabilitado. ANTES estaba duplicada en admin.js y
// modals.js (S3B-4: se deja UNA sola para no duplicar la declaración
// global). El onsubmit del #modal-user-form apunta ahora a
// handleUserFormSubmit() (definida más abajo, en este archivo), que
// despacha al flujo real de aprobación (S3C-1C) o al stub legado.

function changeUserRole(id) { return adminAbrirGestion(id, 'CAMBIAR_ROL'); }

const ADMIN_ELIMINACION_HABILITADA = true;
// Elegibilidad visual; la autorización y conservación se verifican en servidor.
function adminObjetivoPermitidoEliminacion(id) {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) && id.toLowerCase() !== state.currentUser?.id?.toLowerCase() && id.toLowerCase() !== 'fad894e5-0fd5-4637-ad0f-31ffa41dc6cf';
}
let adminGestion = null;
let adminGestionApertura = 0;

function adminMensajeGestion(error) {
  const codigo = extraerCodigoErrorRPC(error);
  const mensajes = {
    CONFLICTO_VERSION: 'El usuario cambió. Se actualizará el listado; cierra esta ventana y abre una nueva operación para revisar y confirmar.',
    ULTIMO_ADMINISTRADOR: 'Debe conservarse al menos un Administrador permanente activo.',
    AUTOEDICION_PROHIBIDA: 'No puedes modificar tu propia cuenta.',
    NO_AUTORIZADO: 'Se requiere un Administrador permanente activo.',
    SESION_INVALIDA: 'La sesión ya no es válida. Vuelve a iniciar sesión.',
    SOLICITUD_REUTILIZADA: 'La solicitud no coincide con la operación original. Abre una nueva operación.',
    CONFIRMACION_ADMINISTRADOR_REQUERIDA: 'Debes confirmar expresamente el cambio de la cuenta Administrador.',
    TRANSICION_INVALIDA: 'El estado de la cuenta no permite esta operación.',
    SIN_CAMBIOS: 'Selecciona un rol diferente.',
    ROL_NUEVO_NO_PERMITIDO: 'El rol seleccionado no está permitido.',
    MOTIVO_INVALIDO: 'El motivo debe tener entre 10 y 1000 caracteres.'
  };
  if (mensajes[codigo]) return mensajes[codigo];
  if (error?.code === '42501' || error?.code === 'PGRST202')
    return 'La operación no está habilitada para esta versión. No se confirmó ningún cambio; consulta al administrador.';
  if (codigo) return adminMensajeErrorAdminTemporal(error);
  return 'No se pudo confirmar el resultado. Puedes reintentar la misma solicitud. Si ya enviaste una gestión, conserva esta ventana para mantener su identificador.';
}

function adminCerrarGestion() {
  if (adminGestion?.ocupada) return;
  ++adminGestionApertura;
  const anterior = adminGestion;
  if (anterior?.operacion === 'ELIMINAR_UI') anterior.previsualizacionEliminacion = null;
  const password = document.getElementById('ag-password');
  if (password) password.value = '';
  document.getElementById('admin-gestion-dialog')?.remove();
  document.removeEventListener('keydown', adminGestionTeclado, true);
  if (anterior) document.body.style.overflow = anterior.overflow;
  adminGestion = null;
  if (anterior?.foco?.isConnected) anterior.foco.focus();
}

function adminGestionTeclado(e) {
  if (!adminGestion) return;
  if (e.key === 'Escape') {
    return; // UX-02: Escape conserva el formulario.
  }
  if (e.key === 'Tab') {
    const lista = [...document.getElementById('admin-gestion-dialog')
      .querySelectorAll('button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled), summary')];
    const primero = lista[0], ultimo = lista[lista.length - 1];
    if (!primero) { e.preventDefault(); return; }
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  }
}

// El botón solo permite solicitar el proceso; el servidor conserva todas las guardas.
function adminEliminacionCamposHTML() {
  return `<div class="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm">
      <p class="text-rose-700 dark:text-rose-300">La cuenta perderá el acceso definitivamente. Su ficha laboral e historial se conservarán mediante la verificación del servidor.</p>
    </div>
    <details class="text-sm"><summary class="font-bold">Información que se conservará</summary><div id="ag-dependencias" class="mt-2" role="status" aria-live="polite" aria-busy="true">
      <p class="font-bold">Información asociada a esta cuenta</p>
      <p class="text-slate-600 dark:text-slate-300" style="min-height:2.5rem"><span data-carga-asociada aria-hidden="true">⏳</span> Consultando información asociada...</p>
      <div aria-hidden="true" class="rounded-lg border border-slate-200 dark:border-slate-700" style="height:2.75rem"></div>
    </div></details>
    <label class="block text-sm" for="ag-nombre-exacto">Escribe exactamente el nombre del usuario
      <input id="ag-nombre-exacto" style="display:block;margin-top:.5rem" type="text" required autocomplete="off" aria-describedby="ag-nombre-error" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2">
      <span id="ag-nombre-error" class="block text-sm text-rose-700 dark:text-rose-300" aria-live="polite"></span>
    </label>
    <label class="block text-sm" for="ag-motivo">Motivo (10 a 1000 caracteres)
      <textarea id="ag-motivo" style="display:block;margin-top:.5rem" required rows="3" aria-describedby="ag-motivo-error" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2"></textarea>
      <span id="ag-motivo-error" class="block text-sm text-rose-700 dark:text-rose-300" aria-live="polite"></span>
    </label>
    <label class="block text-sm" for="ag-password">Tu contraseña para confirmar tu identidad
      <span class="relative" style="display:block;margin-top:.5rem">
        <input id="ag-password" style="display:block;padding-right:2.75rem" type="password" required autocomplete="current-password" maxlength="4096" aria-describedby="ag-password-error" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2">
        ${adminPasswordEyeHTML('ag-password', 'eye-admin-eliminacion')}
      </span>
      <span id="ag-password-error" class="block text-sm text-rose-700 dark:text-rose-300" aria-live="polite"></span>
    </label>
    <label class="block text-sm" style="padding-top:.25rem;line-height:1.6"><input id="ag-confirmar" style="margin-right:.5rem" type="checkbox" required aria-describedby="ag-confirmar-error"> Confirmo que comprendo que una eliminación definitiva sería permanente.<span id="ag-confirmar-error" class="block text-sm text-rose-700 dark:text-rose-300" aria-live="polite"></span></label>`;
}

function adminObjetivoEliminacionPermitido(u) {
  if (!u || u.id === 'fad894e5-0fd5-4637-ad0f-31ffa41dc6cf') return false;
  // Un objetivo excepcional que obtuvo rol o ficha nunca cae a la rama normal.
  if (['43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4','d642838d-19df-4fd5-994a-77c6b63795ad'].includes(u.id))
    return usuarioEsExcepcionalEliminacion(u);
  return !!u.rol_id && ['recepcion', 'tecnico'].includes(adminNombreRolNormalizado(u.roles?.nombre));
}
function adminPuedeEnviarEliminacion(g, formularioValido) {
  const preview = g?.previsualizacionEliminacion;
  return ADMIN_ELIMINACION_HABILITADA && adminObjetivoPermitidoEliminacion(g?.contexto?.usuario?.id) && formularioValido === true && g === adminGestion &&
    g.operacion === 'ELIMINAR_UI' && !g.ocupada && !g.bloqueada && !g.errorEliminacion &&
    adminAccesoVigente() && state.currentUser?.id === g.actor && g.contexto.usuario.id !== g.actor &&
    adminObjetivoEliminacionPermitido(g.contexto.usuario) &&
    document.getElementById('admin-gestion-dialog')?.isConnected === true &&
    preview?.estado === 'lista' && preview.usuarioId === g.contexto.usuario.id && preview.sinBloqueos === true &&
    preview.habilitacion?.efectiva === true && preview.habilitacion.objetivo_id === g.contexto.usuario.id;
}
function adminValidarEliminacionUI(evento) {
  const g = adminGestion;
  if (!g || g.operacion !== 'ELIMINAR_UI') return false;
  const nombre = document.getElementById('ag-nombre-exacto');
  const motivo = document.getElementById('ag-motivo');
  const confirmacion = document.getElementById('ag-confirmar');
  const password = document.getElementById('ag-password');
  const passwordValido = typeof password?.value === 'string' && password.value.length > 0 && password.value.length <= 4096;
  const esperado = g.contexto.usuario.nombre;
  const nombreValido = typeof esperado === 'string' && esperado.trim() !== '' && nombre.value === esperado;
  const longitud = [...motivo.value.trim()].length;
  const motivoValido = longitud >= 10 && longitud <= 1000;
  g.camposRevisados ||= new Set();
  if (evento?.target) g.camposRevisados.add(evento.target.id);
  const campos = [
    [nombre, nombreValido, 'ag-nombre-error', typeof esperado === 'string' && esperado.trim() ? 'El nombre debe coincidir exactamente, incluidas mayúsculas, tildes y espacios.' : 'Esta cuenta no tiene un nombre verificable.'],
    [motivo, motivoValido, 'ag-motivo-error', `El motivo debe tener entre 10 y 1000 caracteres (actualmente ${longitud}).`],
    [confirmacion, confirmacion.checked, 'ag-confirmar-error', 'Marca la confirmación explícita.'],
    [password, passwordValido, 'ag-password-error', 'Escribe tu contraseña para verificar tu identidad.'],
  ];
  campos.forEach(([campo, valido, errorId, texto]) => {
    const mostrar = g.camposRevisados.has(campo.id) && !valido;
    campo.setAttribute('aria-invalid', String(mostrar));
    document.getElementById(errorId).textContent = mostrar ? texto : '';
  });
  if (!g.errorEliminacion) document.getElementById('ag-error').textContent = '';
  const formularioValido = nombreValido && motivoValido && confirmacion.checked && passwordValido;
  const boton = document.getElementById('ag-enviar');
  boton.disabled = !adminPuedeEnviarEliminacion(g, formularioValido);
  boton.style.opacity = boton.disabled ? '.55' : '';
  boton.style.cursor = boton.disabled ? 'not-allowed' : '';
  const disponibilidad=document.getElementById('ag-nohabil'),h=g.previsualizacionEliminacion?.habilitacion;
  if(disponibilidad)disponibilidad.textContent=!ADMIN_ELIMINACION_HABILITADA?'La eliminación está deshabilitada en esta interfaz.':!h||!h.verificada?'No se pudo verificar la disponibilidad del servidor.':!h.efectiva?'La eliminación está desactivada por seguridad en el servidor.':'Completa todos los campos para solicitar la eliminación. El servidor verificará nuevamente los requisitos.';
  return formularioValido;
}

async function adminCargarDependenciasEliminacion(g, div) {
  const vigente = () => adminGestion === g && div.isConnected && adminAccesoVigente() && state.currentUser?.id === g.actor;
  const zona = div.querySelector('#ag-dependencias');
  g.previsualizacionEliminacion = {estado:'cargando',usuarioId:g.contexto.usuario.id,sinBloqueos:false};
  adminValidarEliminacionUI();
  try {
    const data=await window.UsuariosService.consultarResumenConservacion(g.contexto.usuario.id);
    if(!vigente())return;
    const filas=data.registros.filter(r=>r.cantidad>0);
    const categoriasSinRegistros=data.registros.length-filas.length;
    g.previsualizacionEliminacion={estado:'lista',usuarioId:data.usuario_id,habilitacion:data.habilitacion,
      sinBloqueos:data.archivos_propiedad_individual===0&&data.retiros_pendientes===0&&data.migraciones_pendientes===0};
    const ficha=data.ficha_laboral;
    zona.innerHTML='<p class="font-bold">Información verificada en el servidor</p>'
      +'<p>Estos registros deberán conservarse. El servidor comprobará su integridad y los archivos antes de confirmar la eliminación.</p>'
      +'<p class="mt-2">'+(ficha?'Se conservará la ficha laboral de '+adminEscapeHTML(ficha.nombre)+'. Tras la confirmación podrá consultarse como trabajador sin cuenta.':'Esta cuenta no tiene ficha laboral vinculada en la consulta.')+'</p>'
      +'<p class="text-sm mt-2">Verificación física de archivos: pendiente. Este resumen no autoriza eliminar.</p>'
      +'<p class="font-bold mt-2">Registros que se conservarán</p>'
      +'<ul class="mt-2 space-y-1">'+filas.map(r=>'<li>'+adminEscapeHTML(window.UsuariosService.etiquetasConservacionV2[r.tabla])+': '+r.cantidad+'</li>').join('')+'</ul>'
      +(categoriasSinRegistros?'<p class="text-sm mt-2">Sin registros en '+categoriasSinRegistros+' categorías consultadas.</p>':'')
      +(data.archivos_propiedad_individual?'<p class="mt-2">Hay '+data.archivos_propiedad_individual+' archivos con propiedad individual. Debe resolverse su conservación institucional antes de eliminar.</p>':'')
      +(data.retiros_pendientes?'<p class="mt-2">Hay retiros documentales pendientes. La eliminación permanece bloqueada.</p>':'')
      +(data.migraciones_pendientes?'<p class="mt-2">Hay migraciones documentales pendientes. La eliminación permanece bloqueada.</p>':'')
      +'<p class="text-sm mt-2">'+(!ADMIN_ELIMINACION_HABILITADA?'La eliminación está deshabilitada en esta interfaz.':!adminObjetivoPermitidoEliminacion(data.usuario_id)?'Esta cuenta no admite eliminación.':!data.habilitacion||!data.habilitacion.verificada?'No se pudo verificar la disponibilidad del servidor. La eliminación permanece bloqueada.':!data.habilitacion.servidor?'La eliminación está deshabilitada en el servidor.':data.habilitacion.sql!==true?'La eliminación está desactivada por seguridad en el servidor. La eliminación permanece bloqueada.':data.habilitacion.efectiva?'Eliminación disponible. Se requiere reautenticación y certificación del servidor antes de cualquier eliminación.':'La eliminación no está disponible.')+'</p>';
  } catch (_) {
    if(!vigente())return;
    g.previsualizacionEliminacion={estado:'error',usuarioId:g.contexto.usuario.id,sinBloqueos:false};
    zona.textContent='No se pudo verificar el resumen de conservación. No se permite eliminar ni se muestran conteos parciales.';
  } finally {if(vigente()){zona.setAttribute('aria-busy','false');adminValidarEliminacionUI();}}
}

async function adminAbrirGestion(id, operacion) {
  if (!adminAccesoVigente() || id === state.currentUser?.id || adminGestion?.ocupada) return;
  if (!['CAMBIAR_ROL', 'DESACTIVAR', 'REACTIVAR', 'ELIMINAR_UI'].includes(operacion)) return;
  adminCerrarGestion();
  const apertura = ++adminGestionApertura;
  try {
    const contexto = await window.UsuariosService.getContextoGestion(id);
    const roles = await window.UsuariosService.getRoles(true);
    if (apertura !== adminGestionApertura || !adminAccesoVigente() || !adminPanelVisible()) return;
    const u = contexto.usuario;
    if (!u || u.id === state.currentUser.id ||
        (operacion === 'ELIMINAR_UI' ? !adminObjetivoEliminacionPermitido(u) : !u.rol_id)) throw new Error('Objetivo no válido.');
    if ((operacion === 'DESACTIVAR' && u.estado !== true) ||
        (operacion === 'REACTIVAR' && u.estado !== false)) throw new Error('Transición no válida.');
    const permitidos = roles.filter(r => ['administrador', 'recepcion', 'tecnico'].includes(adminNombreRolNormalizado(r.nombre)));
    const eliminacionUI = operacion === 'ELIMINAR_UI';
    if (eliminacionUI) document.getElementById('admin-eliminacion-error')?.remove();
    const titulo = { CAMBIAR_ROL: 'Cambiar rol', DESACTIVAR: 'Desactivar cuenta', REACTIVAR: 'Reactivar cuenta', ELIMINAR_UI: 'Eliminar cuenta' }[operacion];
    const div = document.createElement('div');
    div.id = 'admin-gestion-dialog';
    div.className = 'fixed inset-0 z-[100] bg-slate-900/60 flex items-center justify-center p-4';
    div.setAttribute('role', 'dialog'); div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-labelledby', 'admin-gestion-titulo');
    div.innerHTML = `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div class="flex justify-between items-center"><h3 id="admin-gestion-titulo" class="font-bold text-slate-800 dark:text-white">${titulo}</h3><button type="button" data-cerrar aria-label="Cerrar">×</button></div>
      <p class="text-sm text-slate-600 dark:text-slate-300 mt-2">${adminEscapeHTML(adminNombreVisible(u))} · ${adminEscapeHTML(u.roles?.nombre || 'Sin rol')}</p>
      ${eliminacionUI && usuarioEsExcepcionalEliminacion(u) ? '<p class="text-sm mt-2">Cuenta de prueba excepcional. SQL y Edge deben estar instalados coordinadamente antes de ejecutar; esta pantalla no autoriza el borrado.</p>' : ''}
      <form class="mt-4 space-y-4" ${eliminacionUI ? 'novalidate' : ''}>
      ${eliminacionUI ? adminEliminacionCamposHTML() : `
      ${operacion === 'CAMBIAR_ROL' ? `<label class="block text-sm">Nuevo rol<select id="ag-rol" required class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2"><option value="">Seleccionar rol</option>${permitidos.filter(r => r.id !== u.rol_id).map(r => `<option value="${adminEscapeHTML(r.id)}">${adminEscapeHTML(r.nombre)}</option>`).join('')}</select></label>` : ''}
      <p class="text-sm text-slate-600 dark:text-slate-300">${operacion === 'REACTIVAR' ? 'Las administraciones temporales revocadas no se restaurarán.' : 'Esta operación revocará las administraciones temporales activas y futuras. Su historial se conservará.'}</p>
      <label class="block text-sm">Motivo (10 a 1000 caracteres)<textarea id="ag-motivo" required rows="3" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2"></textarea></label>
      <label id="ag-confirmacion" class="hidden text-sm"><input id="ag-confirmar" type="checkbox"> Confirmo expresamente esta operación sobre una cuenta Administrador.</label>
      `}
      <p id="ag-error" role="alert" ${eliminacionUI ? 'style="white-space:pre-line"' : ''} class="text-sm text-rose-700 dark:text-rose-300"></p>
      ${eliminacionUI ? '<p id="ag-nohabil" class="text-sm text-slate-600 dark:text-slate-300">Consultando disponibilidad del servidor…</p>' : ''}
      <div class="flex justify-end gap-3" ${eliminacionUI ? 'style="flex-wrap:wrap"' : ''}><button type="button" data-cerrar class="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700">Cancelar</button><button id="ag-enviar" type="submit" ${eliminacionUI ? 'disabled aria-describedby="ag-nohabil" style="opacity:.55;cursor:not-allowed"' : ''} class="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold">${titulo}</button></div>
      </form></div>`;
    adminGestion = { contexto, operacion, roles: permitidos, ocupada: false, solicitud: null,
      bloqueada: false, foco: document.activeElement, overflow: document.body.style.overflow, actor: state.currentUser.id };
    document.body.appendChild(div); document.body.style.overflow = 'hidden';
    div.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', adminCerrarGestion));
    div.querySelector('form').addEventListener('submit', adminEnviarGestion);
    div.querySelector('#ag-rol')?.addEventListener('change', adminActualizarConfirmacionGestion);
    document.addEventListener('keydown', adminGestionTeclado, true);
    if (eliminacionUI) {
      for (const selector of ['#ag-nombre-exacto', '#ag-motivo', '#ag-confirmar', '#ag-password']) {
        div.querySelector(selector).addEventListener('input', adminValidarEliminacionUI);
        div.querySelector(selector).addEventListener('change', adminValidarEliminacionUI);
        div.querySelector(selector).addEventListener('blur', adminValidarEliminacionUI);
      }
      adminValidarEliminacionUI();
      void adminCargarDependenciasEliminacion(adminGestion, div);
    } else adminActualizarConfirmacionGestion();
    (div.querySelector('#ag-nombre-exacto') || div.querySelector('#ag-rol') || div.querySelector('#ag-motivo')).focus();
  } catch (e) {
    if (apertura !== adminGestionApertura) return;
    if (operacion === 'ELIMINAR_UI') {
      const contenedor = document.getElementById('admin-content');
      if (!adminAccesoVigente() || !contenedor) return;
      document.getElementById('admin-eliminacion-error')?.remove();
      const mensaje = document.createElement('p'); mensaje.id = 'admin-eliminacion-error'; mensaje.setAttribute('role', 'alert');
      mensaje.textContent = 'No se pudo leer la cuenta para abrir la confirmación. Actualiza el panel e inténtalo nuevamente. No se realizó ningún cambio.';
      contenedor.prepend(mensaje);
    } else alert(adminMensajeGestion(e));
  }
}

function adminActualizarConfirmacionGestion() {
  if (!adminGestion) return;
  const actual = adminNombreRolNormalizado(adminGestion.contexto.usuario.roles?.nombre) === 'administrador';
  const nuevo = adminGestion.roles.find(r => r.id === document.getElementById('ag-rol')?.value);
  const requiere = actual || adminNombreRolNormalizado(nuevo?.nombre) === 'administrador';
  document.getElementById('ag-confirmacion').classList.toggle('hidden', !requiere);
  document.getElementById('ag-confirmar').checked = false;
  adminGestion.confirmacionRequerida = requiere;
}

async function adminEnviarGestion(e) {
  e.preventDefault();
  const g = adminGestion;
  if (!g || g.ocupada || g.bloqueada || !adminAccesoVigente()) return;
  if (g.operacion === 'ELIMINAR_UI') {
    g.camposRevisados = new Set(['ag-nombre-exacto', 'ag-motivo', 'ag-confirmar', 'ag-password']);
    if (!adminValidarEliminacionUI() || !adminPuedeEnviarEliminacion(g, true)) return;
    const error = document.getElementById('ag-error');
    const password = document.getElementById('ag-password');
    if (!password) return;
    const div = document.getElementById('admin-gestion-dialog');
    try {
      g.ocupada = true; g.bloqueada = true;
      div.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = true; });
      const actualizado = await window.UsuariosService.getContextoGestion(g.contexto.usuario.id);
      if (adminGestion !== g || !adminAccesoVigente() || state.currentUser?.id !== g.actor ||
          actualizado.usuario.id !== g.contexto.usuario.id ||
          actualizado.usuario.nombre !== g.contexto.usuario.nombre || !adminObjetivoEliminacionPermitido(actualizado.usuario))
        throw new Error('La cuenta cambió. Cierra la confirmación y actualiza el panel.');
      g.contexto = actualizado;
      await adminCargarDependenciasEliminacion(g, div);
      if (adminGestion !== g || !adminAccesoVigente() || state.currentUser?.id !== g.actor ||
          g.previsualizacionEliminacion?.estado !== 'lista' || g.previsualizacionEliminacion.sinBloqueos !== true)
        throw new Error('Las dependencias no permiten continuar.');
      if (!g.solicitud) g.solicitud = window.UsuariosService.construirEntradaEliminacion({
        usuario: g.contexto.usuario, operacionId: window.crypto.randomUUID(),
        nombre: document.getElementById('ag-nombre-exacto').value,
        motivo: document.getElementById('ag-motivo').value, confirmacion: document.getElementById('ag-confirmar').checked,
      });
      g.ocupada = true; g.bloqueada = true; // Un envío por apertura; jamás reintentar automáticamente.
      div.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = true; });
      const result = await window.UsuariosService.ejecutarEliminacion(g.solicitud, password.value);
      if (result?.resultado !== 'COMPLETADA' || result.eliminacion_ejecutada !== true) throw new Error('No se pudo confirmar la eliminación. Requiere revisión manual.');
      adminTextoEliminacionConfirmada({nombre:g.solicitud.nombre_confirmacion,operacion_id:result.operacion_id},result);
      g.ocupada = false;
      adminCerrarGestion();
      adminMostrarToast('Cuenta eliminada correctamente. Los registros certificados se conservaron.');
      try { await cargarPanelAdminDatos(); } catch (_) { adminMostrarToast('La cuenta se eliminó, pero no se pudo actualizar el panel. Vuelve a abrir Administración.','error'); }
    } catch (err) {
      g.errorEliminacion = true;
      if (adminGestion === g) error.textContent = err?.codigo
        ? err.message : 'No se pudo confirmar la eliminación. Solicita una revisión manual; no vuelvas a enviarla.';
      if (adminGestion === g && g.solicitud) {
        // No confundir el ID SQL con la referencia de envío del cliente.
        error.textContent += err?.operacion_id
          ? ` Referencia para revisión: ${err.operacion_id}.`
          : ` Referencia de la solicitud: ${g.solicitud.operacion_id}. Conserva esta referencia para la revisión.`;
      }
    } finally {
      password.value = ''; g.ocupada = false;
      if (adminGestion === g) div.querySelectorAll('[data-cerrar]').forEach(el => { el.disabled = false; });
    }
    return;
  }
  const error = document.getElementById('ag-error');
  error.textContent = '';
  if (!g.solicitud) {
    const motivo = document.getElementById('ag-motivo').value.trim();
    const rol = document.getElementById('ag-rol')?.value;
    const confirmar = document.getElementById('ag-confirmar').checked;
    if ([...motivo].length < 10 || [...motivo].length > 1000) { error.textContent = 'El motivo debe tener entre 10 y 1000 caracteres.'; return; }
    if (g.operacion === 'CAMBIAR_ROL' && !g.roles.some(r => r.id === rol)) { error.textContent = 'Selecciona un rol válido.'; return; }
    if (g.confirmacionRequerida && !confirmar) { error.textContent = 'Confirma expresamente la operación sobre la cuenta Administrador.'; return; }
    if (!window.crypto?.randomUUID) { error.textContent = 'No se pudo crear un identificador seguro. Utiliza HTTPS o el servidor local autorizado.'; return; }
    const u = g.contexto.usuario;
    g.solicitud = Object.freeze({ p_solicitud_id: window.crypto.randomUUID(), p_usuario_id: u.id,
      p_rol_esperado: u.rol_id, p_estado_esperado: u.estado,
      p_revision_esperada: g.contexto.revision_gestion, p_motivo: motivo,
      p_confirmar_administrador: g.confirmacionRequerida && confirmar,
      ...(g.operacion === 'CAMBIAR_ROL' ? { p_rol_nuevo: rol } : {}) });
  }
  g.ocupada = true;
  const div = document.getElementById('admin-gestion-dialog');
  const boton = document.getElementById('ag-enviar');
  div.querySelectorAll('input, select, textarea, button').forEach(el => { el.disabled = true; });
  boton.textContent = 'Guardando…';
  let guardado = false;
  try {
    if (!await revalidarPrivilegioParaEscritura() || !adminAccesoVigente()) throw { codigo: 'NO_AUTORIZADO' };
    await window.UsuariosService.gestionarUsuario(g.operacion, g.solicitud);
    guardado = true;
  } catch (err) {
    error.textContent = adminMensajeGestion(err);
    if (extraerCodigoErrorRPC(err) === 'CONFLICTO_VERSION') {
      g.bloqueada = true;
      try { await cargarPanelAdminDatos(); } catch (_) { error.textContent += ' No se pudo actualizar el listado.'; }
    }
  } finally {
    g.ocupada = false;
    div.querySelectorAll('[data-cerrar]').forEach(el => { el.disabled = false; });
    boton.disabled = g.bloqueada;
    boton.textContent = g.bloqueada ? 'Abre una nueva operación' : 'Reintentar la misma solicitud';
  }
  if (guardado) {
    adminCerrarGestion();
    adminMostrarToast('Operación confirmada.');
    try { await cargarPanelAdminDatos(); }
    catch (_) { alert('La operación se confirmó, pero no se pudo actualizar el listado. Vuelve a abrir el Panel.'); }
  }
}

// ==========================================================
// FASE S3C-1C — APROBACIÓN DE CUENTA PENDIENTE DESDE PANEL ADMIN
// ==========================================================
// Este flujo es ÚNICAMENTE para cuentas pendientes AJENAS
// (estado = true y rol_id = NULL, y id <> auth.uid()). NO implementa
// creación de cuentas, invitaciones, edición de usuarios ya
// aprobados ni eliminación.
//
// Estado del modal en memoria de vista (NO se usa localStorage:
// Ley 21.719, minimización de datos personales).
let adminFormMode = 'nuevo';        // 'nuevo' (stub legado) | 'aprobar'
let adminAprobacionId = null;       // uuid real de la cuenta pendiente en revisión
let adminAprobandoEnCurso = false;  // guarda anti doble submit

// Referencias a los elementos del modal #modal-user-form (reutilizado).
function adminRefsFormulario() {
  const form = document.getElementById('form-user-management');
  if (!form) return null;

  return {
    form,
    id: document.getElementById('uform-id'),
    mode: document.getElementById('uform-mode'),
    nombre: document.getElementById('uform-name'),
    email: document.getElementById('uform-email'),
    emailField: document.getElementById('uform-email-field'),
    rol: document.getElementById('uform-role'),
    grid: document.getElementById('uform-role-title-grid'),
    titleField: document.getElementById('uform-title-field'),
    adminNote: document.getElementById('uform-admin-note'),
    error: document.getElementById('uform-error'),
    submit: document.getElementById('uform-submit'),
    submitLabel: document.getElementById('uform-submit-label'),
    titulo: document.getElementById('user-form-modal-title'),
    subtitle: document.getElementById('user-form-modal-subtitle')
  };
}

// Mensaje inline de error del modal. Nunca expone UUIDs, SQL,
// policies ni el detalle técnico completo (ese va a console.error).
function adminMostrarErrorFormulario(refs, mensaje) {
  if (!refs || !refs.error) return;
  if (!mensaje) {
    refs.error.textContent = '';
    refs.error.classList.add('hidden');
    return;
  }
  refs.error.textContent = mensaje;
  refs.error.classList.remove('hidden');
}

// Estado de carga del formulario (evita doble clic / doble petición).
function adminEstadoGuardando(refs, guardando) {
  adminAprobandoEnCurso = !!guardando;
  if (!refs) return;

  if (refs.submit) refs.submit.disabled = !!guardando;
  if (refs.nombre) refs.nombre.disabled = !!guardando;
  if (refs.rol) refs.rol.disabled = !!guardando;
  if (refs.submitLabel) {
    refs.submitLabel.textContent = guardando
      ? 'Aprobando…'
      : (adminFormMode === 'aprobar' ? 'Aprobar usuario' : 'Guardar Colaborador');
  }
}

// Toast efímero (patrón visual de js/views/remodelaciones.js).
function adminMostrarToast(mensaje, tipo) {
  const idToast = 'admin-toast-' + Date.now();
  const div = document.createElement('div');
  div.id = idToast;
  div.className = tipo === 'error'
    ? 'fixed bottom-4 right-4 bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-900/60 px-4 py-3 rounded-xl shadow-lg text-sm font-bold flex items-center gap-2 z-[100] transition-all'
    : 'fixed bottom-4 right-4 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900/60 px-4 py-3 rounded-xl shadow-lg text-sm font-bold flex items-center gap-2 z-[100] transition-all';
  div.textContent = (tipo === 'error' ? '⚠️ ' : '✅ ') + mensaje;
  document.body.appendChild(div);

  setTimeout(() => {
    const toast = document.getElementById(idToast);
    if (toast) {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }
  }, 3000);
}

// Punto de entrada: botón "Revisar solicitud" de una fila pendiente.
// Guardas defensivas (la RLS real es la barrera efectiva).
function revisarSolicitudPendiente(id) {
  if (!adminAccesoVigente()) return;
  if (!id || typeof id !== 'string' || id.trim() === '') return;

  // 9. El Administrador NO puede usar este modal sobre su propia cuenta.
  if (state.currentUser && state.currentUser.id === id) {
    alert('No es posible revisar tu propia cuenta desde este panel.');
    return;
  }

  const usuario = (adminUsuariosReales || []).find(u => u && u.id === id);
  if (!usuario) return;

  if (!adminEsPendiente(usuario)) {
    alert('Esta cuenta no está pendiente de aprobación.');
    return;
  }

  abrirModalAprobacion(usuario);
}

// Abre #modal-user-form en modo "Revisar solicitud de acceso":
// nombre real SOLO LECTURA (escrito por el propio usuario al
// registrarse), correo real SOLO LECTURA, y select de roles REALES
// SIN el rol Administrador (acceso gestionado de forma independiente).
// Sin contraseña, sin cargo/área inventado y sin selector de estado.
async function abrirModalAprobacion(usuario) {
  if (!adminAccesoVigente()) return;
  const refs = adminRefsFormulario();
  if (!refs || !usuario) return;

  // Catálogo de roles: EXCLUSIVAMENTE desde UsuariosService.getRoles()
  // (public.roles). NO se hardcodean UUIDs ni nombres de rol.
  let roles = [];
  try {
    roles = await window.UsuariosService.getRoles(true);
  } catch (e) {
    console.error('Error cargando roles reales para revisar solicitud:', e);
    alert('No fue posible cargar los roles disponibles.');
    return;
  }

  if (!adminAccesoVigente()) return;

  // FASE S3C-1D: el flujo normal NO puede otorgar Administrador.
  // Se excluye del catálogo normalizado (mayúsculas + tildes) y se
  // muestra una nota discreta explicándolo.
  const rolesNormales = (roles || []).filter(r =>
    r && r.id && adminNombreRolNormalizado(r.nombre) !== 'administrador');

  if (rolesNormales.length === 0) {
    alert('No hay roles disponibles para la aprobación normal.');
    return;
  }

  // Nombre REAL del registro (public.usuarios.nombre). NO se usa el
  // fallback visual (email → "Usuario"): si el nombre real está
  // vacío, la aprobación normal queda BLOQUEADA.
  const nombreReal = (typeof usuario.nombre === 'string') ? usuario.nombre.trim() : '';

  adminFormMode = 'aprobar';
  adminAprobacionId = usuario.id;
  adminEstadoGuardando(refs, false);

  if (refs.titulo) refs.titulo.textContent = 'Revisar solicitud de acceso';
  if (refs.subtitle) {
    refs.subtitle.textContent = 'Revisa los datos del registro y asigna un rol de acceso';
  }
  if (refs.mode) refs.mode.value = 'aprobar';

  // id real (uuid) de la cuenta pendiente en revisión.
  if (refs.id) refs.id.value = usuario.id;

  // Nombre: SOLO LECTURA. Viene del registro público; NO se edita
  // en esta fase.
  if (refs.nombre) {
    refs.nombre.value = nombreReal;
    refs.nombre.readOnly = true;
  }

  // Correo REAL y SOLO LECTURA: se muestra como contexto de la
  // solicitud y NUNCA viaja en el UPDATE.
  if (refs.email) {
    refs.email.value = usuario.email || '';
    refs.email.readOnly = true;
  }
  if (refs.emailField) refs.emailField.classList.remove('hidden');

  // Rol: select poblado con las options REALES permitidas
  // (value = rol.id, texto = rol.nombre). Sin preselección.
  if (refs.rol) {
    refs.rol.innerHTML = '<option value="">Seleccione un rol…</option>' +
      rolesNormales.map(r => `<option value="${adminEscapeHTML(r.id)}">${adminEscapeHTML(r.nombre)}</option>`).join('');
    refs.rol.value = '';
  }

  // Nota sobre el rol Administrador (sólo en este flujo).
  if (refs.adminNote) refs.adminNote.classList.remove('hidden');

  // Cargo / Departamento: NO existe en Supabase → oculto en este flujo.
  if (refs.titleField) refs.titleField.classList.add('hidden');
  if (refs.grid) {
    refs.grid.classList.remove('grid-cols-2');
    refs.grid.classList.add('grid-cols-1');
  }

  adminMostrarErrorFormulario(refs, null);

  // Solicitud legacy/manual SIN nombre válido: NO se permite la
  // aprobación normal (el nombre debe venir del registro público).
  if (!nombreReal) {
    adminMostrarErrorFormulario(refs,
      'Esta solicitud no contiene un nombre válido. No es posible aprobarla mediante el flujo normal.');
    if (refs.submit) refs.submit.disabled = true;
    if (refs.rol) refs.rol.disabled = true;
  }

  openModal('modal-user-form');
}

// Normalización local del nombre de un rol (minúsculas + sin tildes).
// Evita que "ADMINISTRADOR", "Administrador " o "Administración"
// salten la restricción del flujo normal. Usa la función global del
// service si está disponible (misma semántica).
function adminNombreRolNormalizado(nombreRol) {
  if (typeof normalizarNombreRol === 'function') return normalizarNombreRol(nombreRol);
  if (nombreRol === null || nombreRol === undefined) return '';
  return String(nombreRol).trim().toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Dispatcher del #modal-user-form. El onsubmit del formulario en
// index.html apunta aquí (la DEFINICIÓN ÚNICA del stub legado
// handleSaveUserForm sigue en js/modals.js).
function handleUserFormSubmit(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  if (adminFormMode === 'aprobar') {
    return adminConfirmarAprobacion(e);
  }

  // Modo legado 'nuevo': creación de cuentas SIN implementar en esta
  // fase (sin signUp, sin invitaciones). Se conserva el stub original.
  if (typeof handleSaveUserForm === 'function') return handleSaveUserForm(e);
  return false;
}

// Traduce los errores .codigo de UsuariosService.aprobarUsuario a
// mensajes formales para el usuario final. NUNCA se muestran UUIDs,
// SQL ni policies (el detalle técnico sólo va a console.error).
async function adminRevisarAprobacionLaboral(id, boton) {
  if (!adminAccesoVigente() || boton?.disabled) return;
  const previa = window.TrabajadoresService?.solicitudAprobacionLaboral(id);
  if (!previa) return;
  if (boton) boton.disabled = true;
  try {
    const actual = await window.TrabajadoresService.aprobarCuentaConFicha({ usuarioId: id,
      rolId: previa.rolId, confirmar: adminConfirmarFichaAprobacion, continuar: adminPanelVisible });
    if (actual && adminAccesoVigente()) {
      adminMostrarToast('Estado de cuenta y ficha laboral verificado.');
      await cargarPanelAdminDatos();
    }
  } catch (error) {
    if (adminAccesoVigente()) adminMostrarToast(adminMensajeErrorAprobacion(error));
  } finally { if (boton?.isConnected) boton.disabled = false; }
}
function adminConfirmarFichaAprobacion(plan) {
  const actor = state.currentUser?.id;
  if (!adminAccesoVigente()) return Promise.resolve(null);
  return new Promise(resolve => {
    const dialogo = document.createElement('dialog');
    dialogo.id = 'admin-aprobacion-ficha-dialog';
    dialogo.className = 'alm-ui alm-panel bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 max-w-lg';
    dialogo.setAttribute('aria-labelledby', 'admin-ficha-confirmacion-titulo');
    const coincidencias = plan.coincidencias || [], elegibles = plan.elegibles || [];
    const unica = coincidencias.length === 1 && elegibles.length === 1;
    const crear = !plan.recuperacion && coincidencias.length === 0;
    dialogo.innerHTML = `<h3 id="admin-ficha-confirmacion-titulo" class="alm-title">Confirmar ficha laboral</h3>
      <p class="text-sm">${plan.recuperacion ? 'Hay una solicitud laboral previa. Se conservarán su UUID y parámetros; el backend comprobará su auditoría antes de continuar.'
        : unica ? `Ya existe una ficha de ${adminEscapeHTML(plan.usuario.nombre)}. ¿Es esta persona?`
        : crear ? `No se encontró una ficha con el nombre exacto de ${adminEscapeHTML(plan.usuario.nombre)}. ¿Crear y vincular una ficha antes de aprobar?`
        : 'Hay coincidencias que requieren identificar expresamente a la persona. No se elegirá ninguna por su nombre.'}</p>
      ${!plan.recuperacion && !crear ? `<label class="block text-sm">Ficha laboral<select data-ficha class="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2">
        ${unica ? '' : '<option value="">Selecciona una ficha activa y disponible</option>'}
        ${coincidencias.map(t => `<option value="${adminEscapeHTML(t.id)}" ${elegibles.some(e => e.id === t.id) ? '' : 'disabled'}>${adminEscapeHTML([t.nombre,t.cargo,t.estado,t.id].filter(Boolean).join(' · '))}</option>`).join('')}
      </select></label>` : ''}
      <p data-mensaje role="status" class="text-sm"></p>
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" class="alm-btn-secondary" data-cancelar>Cancelar</button>
        ${!plan.recuperacion && !crear ? '<button type="button" class="alm-btn-secondary" data-otra>Es otra persona</button>' : ''}
        <button type="button" class="alm-btn-primary" data-confirmar ${!plan.recuperacion && !crear && !elegibles.length ? 'disabled' : ''}>${plan.recuperacion ? 'Revisar solicitud original' : crear ? 'Crear y vincular ficha' : 'Vincular ficha'}</button>
      </div>`;
    const terminar = decision => { resolve(decision); dialogo.close(); dialogo.remove(); };
    dialogo.addEventListener('cancel', e => e.preventDefault());
    dialogo.addEventListener('close', () => { resolve(null); dialogo.remove(); }, { once: true });
    dialogo.querySelector('[data-cancelar]').onclick = () => terminar(null);
    const otra = dialogo.querySelector('[data-otra]');
    if (otra) otra.onclick = () => {
      dialogo.querySelector('[data-mensaje]').textContent = 'La creación de otra ficha homónima está protegida por el backend. Cancela y solicita una revisión de identidad; no se aprobará la cuenta ni se crearán duplicados.';
      dialogo.querySelector('[data-confirmar]').disabled = true;
    };
    dialogo.querySelector('[data-confirmar]').onclick = () => {
      if (!adminAccesoVigente() || state.currentUser?.id !== actor) return terminar(null);
      if (plan.recuperacion) return terminar(true);
      if (crear) return terminar({ accion: 'CREAR_Y_VINCULAR' });
      const id = dialogo.querySelector('[data-ficha]').value;
      if (!elegibles.some(t => t.id === id)) {
        dialogo.querySelector('[data-mensaje]').textContent = 'Selecciona la ficha correcta o cancela para revisar la identidad.'; return;
      }
      terminar({ accion: 'VINCULAR', trabajadorId: id });
    };
    document.body.appendChild(dialogo);
    dialogo.showModal();
    dialogo.querySelector('[data-cancelar]').focus();
  });
}

function adminMensajeErrorAprobacion(err) {
  const codigo = err && err.codigo;
  if (codigo === 'APROBACION_FICHA_REQUIERE_REVISION') return err.message;
  if (codigo === 'ROL_ADMINISTRADOR') {
    return 'El rol Administrador requiere un proceso de autorización especial.';
  }
  if (codigo === 'SOLICITUD_SIN_NOMBRE') {
    return 'Esta solicitud no contiene un nombre válido. No es posible aprobarla mediante el flujo normal.';
  }
  if (codigo === 'SOLICITUD_NO_PENDIENTE') {
    return 'Esta solicitud ya fue aprobada o ya no está pendiente.';
  }
  if (codigo === 'ROL_NO_PERMITIDO') {
    return 'El rol seleccionado no está disponible para la aprobación normal.';
  }
  return 'No fue posible aprobar al usuario.';
}

// "Aprobar usuario": confirma el vínculo auditado antes de aprobar y recarga.
// el panel desde Supabase.
// FASE S3C-1D: el nombre NO se envía desde el DOM. Viaja SOLO
// { rol_id }; el servicio re-consulta en Supabase el usuario real,
// valida que siga pendiente y que su nombre de registro no esté
// vacío, y el UPDATE escribe únicamente { rol_id, estado: true }.
async function adminConfirmarAprobacion(e) {
  if (!adminAccesoVigente()) {
    if (e) e.preventDefault();
    return;
  }
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const refs = adminRefsFormulario();
  if (!refs) return;

  // Anti doble submit: si ya hay una petición en vuelo, se ignora.
  if (adminAprobandoEnCurso) return;

  adminMostrarErrorFormulario(refs, null);

  // ---- Validación cliente (antes de enviar) ----
  const id = (refs.id && refs.id.value) ? refs.id.value.trim() : '';
  const rolId = (refs.rol && refs.rol.value) ? refs.rol.value.trim() : '';

  if (!id) {
    adminMostrarErrorFormulario(refs, 'No fue posible aprobar al usuario.');
    return;
  }
  if (!rolId) {
    adminMostrarErrorFormulario(refs, 'Debes seleccionar un rol para la cuenta.');
    if (refs.rol) refs.rol.focus();
    return;
  }

  // El rol debe corresponder a un rol REAL (public.roles).
  let roles = null;
  try {
    roles = await window.UsuariosService.getRoles();
  } catch (err) {
    console.error('Error verificando el catálogo de roles antes de aprobar:', err);
  }
  if (adminAprobandoEnCurso) return;
  if (!Array.isArray(roles) || !roles.some(r => r && r.id === rolId)) {
    adminMostrarErrorFormulario(refs, 'El rol seleccionado no está disponible. Vuelve a intentarlo.');
    return;
  }

  // El flujo normal NUNCA otorga Administrador (aunque el service
  // también lo rechaza: esto sólo evita un envío inútil).
  const rolPedido = roles.find(r => r && r.id === rolId);
  if (adminNombreRolNormalizado(rolPedido && rolPedido.nombre) === 'administrador') {
    adminMostrarErrorFormulario(refs,
      'El rol Administrador requiere un proceso de autorización especial.');
    return;
  }

  // Sólo cuentas PENDIENTES ajenas: re-chequeo antes de enviar.
  const usuario = (adminUsuariosReales || []).find(u => u && u.id === id);
  if (!usuario || !adminEsPendiente(usuario)) {
    adminMostrarErrorFormulario(refs, 'Esta solicitud ya fue aprobada o ya no está pendiente.');
    return;
  }
  if (state.currentUser && state.currentUser.id === id) {
    adminMostrarErrorFormulario(refs, 'No es posible aprobar tu propia cuenta.');
    return;
  }

  // Nombre real del registro: sin nombre válido no hay aprobación
  // normal (cubre cuentas legacy/manuales creadas fuera del registro).
  const nombreReal = (typeof usuario.nombre === 'string') ? usuario.nombre.trim() : '';
  if (!nombreReal) {
    adminMostrarErrorFormulario(refs,
      'Esta solicitud no contiene un nombre válido. No es posible aprobarla mediante el flujo normal.');
    return;
  }

  // S3C-2D: revalidar el privilegio administrativo CONTRA el backend
  // antes de la escritura sensible (asigna rol_id permanente). Si la
  // delegación temporal venció o fue revocada mientras la UI estaba
  // stale, se bloquea aquí y se refresca la UI. La autorización final
  // sigue siendo la RPC/RLS de Supabase.
  adminEstadoGuardando(refs, true);
  let privilegioVigente = false;
  try {
    privilegioVigente = await revalidarPrivilegioParaEscritura();
  } catch (errReval) {
    console.error('S3C-2D: error revalidando privilegio antes de aprobar:', errReval);
    privilegioVigente = false; // fail closed
  }
  if (!privilegioVigente || !adminAccesoVigente()) {
    adminEstadoGuardando(refs, false);
    adminMostrarErrorFormulario(refs,
      'Se requiere Administrador permanente vigente para aprobar la cuenta.');
    return;
  }

  adminEstadoGuardando(refs, true);

  try {
    // Vínculo auditado primero; aprobación después. No son una transacción
    // única: cualquier incertidumbre conserva la solicitud y exige revisión.
    if (!window.TrabajadoresService?.aprobarCuentaConFicha) throw Error('Servicio laboral no disponible.');
    const aprobado = await window.TrabajadoresService.aprobarCuentaConFicha({
      usuarioId: id, rolId, confirmar: adminConfirmarFichaAprobacion,
      continuar: () => adminAccesoVigente() && adminFormMode === 'aprobar' && adminAprobacionId === id &&
        document.getElementById('modal-user-form')?.isConnected === true &&
        !document.getElementById('modal-user-form').classList.contains('hidden')
    });
    if (!aprobado) { adminEstadoGuardando(refs, false); return; }
  } catch (err) {
    // RLS / Supabase / red / restricciones del flujo: NO hay éxito aparente.
    console.error('Error al aprobar la cuenta pendiente:', err);
    adminEstadoGuardando(refs, false);
    adminMostrarErrorFormulario(refs, adminMensajeErrorAprobacion(err));
    return;
  }

  // ---- Éxito real (UPDATE aplicado) ----
  adminEstadoGuardando(refs, false);
  adminFormMode = 'nuevo';
  adminAprobacionId = null;

  closeModal('modal-user-form');
  adminMostrarToast('Usuario aprobado correctamente.');

  // Recarga el Panel Admin desde Supabase real: la fila pasa de
  // "Pendiente de aprobación" a nombre real + rol asignado + Activo,
  // y el contador "Pendientes" baja automáticamente.
  await cargarPanelAdminDatos();
}

function toggleUserStatus(id) {
  const u = (adminUsuariosReales || []).find(u => u.id === id);
  if (u && (u.estado === true || u.estado === false))
    return adminAbrirGestion(id, u.estado ? 'DESACTIVAR' : 'REACTIVAR');
}

// ==========================================================
// S3C-2C — ADMINISTRACIÓN TEMPORAL: MODAL Y ACCIONES
// ==========================================================
// Este flujo es EXCLUSIVO del Administrador PERMANENTE. La UI sólo
// MINIMIZA el payload y ofrece validaciones UX; la AUTORIZACIÓN real
// (caller permanente, objetivo con rol aprobado, no Administrador
// permanente, sin solapes, fechas coherentes) vive DENTRO de las RPC
// otorgar_administracion_temporal / revocar_administracion_temporal
// (SECURITY DEFINER). Nada de lo que envíe el navegador altera eso.
//
// El Administrador TEMPORAL no tiene acceso a estas funciones: no se
// le muestran los botones (puedeGestionarDelegaciones) y, si llamara
// las RPCs a mano, el backend responde NO_AUTORIZADO.
let adminTemporalContexto = null;
let adminTemporalApertura = 0;
let adminTemporalId = null;      // uuid del usuario objetivo en el modal
let adminTemporalEnCurso = false; // guarda anti doble submit

// Referencias a los elementos del modal #modal-admin-temporal.
function adminRefsAdminTemporal() {
  const form = document.getElementById('form-admin-temporal');
  if (!form) return null;

  return {
    form,
    id: document.getElementById('atemp-id'),
    nombre: document.getElementById('atemp-nombre'),
    email: document.getElementById('atemp-email'),
    rol: document.getElementById('atemp-rol'),
    desdeFecha: document.getElementById('atemp-desde-fecha'),
    desdeHora: document.getElementById('atemp-desde-hora'),
    hastaFecha: document.getElementById('atemp-hasta-fecha'),
    hastaHora: document.getElementById('atemp-hasta-hora'),
    motivo: document.getElementById('atemp-motivo'),
    error: document.getElementById('atemp-error'),
    submit: document.getElementById('atemp-submit'),
    submitLabel: document.getElementById('atemp-submit-label')
  };
}

function adminMostrarHoraTemporal(lado, valor) {
  const boton = document.getElementById('atemp-' + lado + '-hora-boton');
  if (!boton) return;
  const [hora, minuto] = valor.split(':').map(Number);
  boton.textContent = valor ? (hora % 12 || 12) + ':' + String(minuto).padStart(2, '0') + (hora < 12 ? ' a. m.' : ' p. m.') : 'Elegir hora';
  boton.setAttribute('aria-label', 'Hora vigente ' + lado + ': ' + boton.textContent);
}

function adminAbrirSelectorHoraTemporal(lado) {
  if (!['desde', 'hasta'].includes(lado) || adminTemporalEnCurso ||
      !adminAccesoVigente() || document.getElementById('admin-hora-dialog')) return;
  const campo = document.getElementById('atemp-' + lado + '-hora');
  const modal = document.getElementById('modal-admin-temporal');
  if (!campo || !modal || modal.classList.contains('hidden')) return;
  const apertura = adminTemporalApertura;
  const [hora, minuto] = (campo.value || adminValorCampoHora(new Date())).split(':').map(Number);
  const dialog = document.createElement('dialog');
  dialog.id = 'admin-hora-dialog';
  dialog.className = 'fixed inset-0 m-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-slate-800 dark:text-white';
  dialog.setAttribute('aria-labelledby', 'admin-hora-titulo');
  const opciones = (inicio, total) => Array.from({ length: total }, (_, i) => {
    const v = String(inicio + i).padStart(2, '0');
    return '<option value="' + v + '">' + v + '</option>';
  }).join('');
  const estilo = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2';
  dialog.innerHTML = `<form>
    <h3 id="admin-hora-titulo" class="font-bold">Hora vigente ${lado}</h3>
    <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Hora de Chile · America/Santiago</p>
    <div class="grid grid-cols-3 gap-2 mt-3 text-sm">
      <label>Hora<select name="hora" class="${estilo}" autofocus>${opciones(1, 12)}</select></label>
      <label>Minutos<select name="minuto" class="${estilo}">${opciones(0, 60)}</select></label>
      <label>Período<select name="periodo" class="${estilo}"><option value="am">a. m.</option><option value="pm">p. m.</option></select></label>
    </div>
    <div class="mt-4 flex flex-col sm:flex-row justify-end gap-2">
      <button type="button" data-cancelar class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold">Cancelar</button>
      <button type="submit" class="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">Aceptar hora</button>
    </div>
  </form>`;
  const form = dialog.querySelector('form');
  const campos = form.elements;
  campos.hora.value = String(hora % 12 || 12).padStart(2, '0');
  campos.minuto.value = String(minuto).padStart(2, '0');
  campos.periodo.value = hora < 12 ? 'am' : 'pm';
  dialog.querySelector('[data-cancelar]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  form.addEventListener('submit', evento => {
    evento.preventDefault();
    if (!dialog.open) return;
    if (apertura === adminTemporalApertura && !adminTemporalEnCurso &&
        adminAccesoVigente() && !modal.classList.contains('hidden')) {
      const hora24 = Number(campos.hora.value) % 12 + (campos.periodo.value === 'pm' ? 12 : 0);
      campo.value = String(hora24).padStart(2, '0') + ':' + campos.minuto.value;
      adminMostrarHoraTemporal(lado, campo.value);
    }
    dialog.close();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
}

function adminMostrarErrorAdminTemporal(refs, mensaje) {
  if (!refs || !refs.error) return;
  if (!mensaje) {
    refs.error.textContent = '';
    refs.error.classList.add('hidden');
    return;
  }
  refs.error.textContent = mensaje;
  refs.error.classList.remove('hidden');
}

// Estado de carga del modal (evita doble clic / doble petición).
function adminEstadoOtorgando(refs, guardando) {
  adminTemporalEnCurso = !!guardando;
  if (!refs) return;
  if (refs.submit) refs.submit.disabled = !!guardando;
  if (refs.desdeFecha) refs.desdeFecha.disabled = !!guardando;
  if (refs.desdeHora) refs.desdeHora.disabled = !!guardando;
  if (refs.hastaFecha) refs.hastaFecha.disabled = !!guardando;
  if (refs.hastaHora) refs.hastaHora.disabled = !!guardando;
  for (const lado of ['desde', 'hasta']) {
    const boton = document.getElementById('atemp-' + lado + '-hora-boton');
    if (boton) boton.disabled = !!guardando;
  }
  if (refs.motivo) refs.motivo.disabled = !!guardando;
  if (refs.submitLabel) {
    refs.submitLabel.textContent = guardando ? 'Otorgando…' : 'Otorgar acceso temporal';
  }
}

// Punto de entrada: botón "Otorgar administración temporal" de una
// fila. Guardas defensivas (la RPC y la RLS son la barrera real).
async function abrirModalAdministracionTemporal(id) {
  if (adminTemporalEnCurso) return;
  const apertura = ++adminTemporalApertura;
  adminTemporalContexto = null;
  // 1. SÓLO Administrador PERMANENTE.
  if (!adminAccesoVigente()) {
    alert('Sólo un Administrador permanente puede otorgar administración temporal.');
    return;
  }

  if (!id || typeof id !== 'string' || id.trim() === '') return;

  let contexto;
  try { contexto = await window.UsuariosService.getContextoGestion(id); }
  catch (e) { alert(adminMensajeGestion(e)); return; }
  if (apertura !== adminTemporalApertura || !adminAccesoVigente() || !adminPanelVisible()) return;
  const usuario = contexto.usuario;
  if (!usuario || usuario.estado !== true) { alert('La cuenta debe estar activa.'); return; }
  adminTemporalContexto = Object.freeze({ id, rol: usuario.rol_id, revision: contexto.revision_gestion });

  // 2. Sólo cuentas APROBADAS (no pendientes).
  if (adminEsPendiente(usuario)) {
    alert('Esta cuenta aún no tiene un rol aprobado. Apruébala primero.');
    return;
  }

  // 3. La propia cuenta del Administrador nunca recibe delegación.
  if (state.currentUser && state.currentUser.id === id) {
    alert('No es posible otorgar administración temporal a tu propia cuenta.');
    return;
  }

  // 4. Un Administrador permanente no necesita delegación.
  if (adminRolClaveUI(usuario) === 'ADMINISTRADOR') {
    alert('Esta cuenta ya es Administrador permanente.');
    return;
  }

  const refs = adminRefsAdminTemporal();
  if (!refs) return;

  adminTemporalId = usuario.id;
  adminEstadoOtorgando(refs, false);

  // id real (uuid) del usuario destino en el modal.
  if (refs.id) refs.id.value = usuario.id;

  // Datos de referencia SOLO LECTURA (vienen de Supabase, no del DOM).
  if (refs.nombre) refs.nombre.textContent = adminNombreVisible(usuario);
  if (refs.email) refs.email.textContent = usuario.email || 'Sin correo';
  if (refs.rol) refs.rol.textContent = (usuario.roles && usuario.roles.nombre) || 'Sin rol asignado';

  // Fechas: por defecto hoy/hora actual (hora de Chile) para
  // facilitar la entrada; el administrador puede ajustarlas.
  const ahora = new Date();
  if (refs.desdeFecha) refs.desdeFecha.value = adminValorCampoFecha(ahora);
  if (refs.desdeHora) refs.desdeHora.value = adminValorCampoHora(ahora);
  if (refs.hastaFecha) refs.hastaFecha.value = '';
  if (refs.hastaHora) refs.hastaHora.value = '';
  adminMostrarHoraTemporal('desde', refs.desdeHora?.value || '');
  adminMostrarHoraTemporal('hasta', '');
  if (refs.motivo) refs.motivo.value = '';

  adminMostrarErrorAdminTemporal(refs, null);
  openModal('modal-admin-temporal');
}

// Helpers para precargar los inputs [fecha][hora] con la hora LOCAL
// de Chile (America/Santiago). Sólo presentación.
function adminValorCampoFecha(fecha) {
  try {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(fecha);
    const v = t => (partes.find(p => p.type === t) || {}).value || '';
    return `${v('year')}-${v('month')}-${v('day')}`;
  } catch (e) {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

function adminValorCampoHora(fecha) {
  try {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Santiago',
      hour12: false,
      hour: '2-digit', minute: '2-digit'
    }).formatToParts(fecha);
    const v = t => (partes.find(p => p.type === t) || {}).value || '00';
    const hora = String(Number(v('hour')) % 24).padStart(2, '0');
    return `${hora}:${v('minute')}`;
  } catch (e) {
    const h = String(fecha.getHours()).padStart(2, '0');
    const m = String(fecha.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}

// Traduce los códigos de error de las RPCs de administración temporal
// a mensajes para el usuario final. NUNCA muestra UUIDs, SQL ni
// policies (el detalle completo va a console.error).
function adminMensajeErrorAdminTemporal(err) {
  const codigo = err && err.codigo;
  if (codigo === 'NO_AUTORIZADO') {
    return 'Sólo un Administrador permanente puede realizar esta acción.';
  }
  if (codigo === 'SESION_INVALIDA') {
    return 'Tu sesión no pudo verificarse. Cierra sesión e ingresa nuevamente.';
  }
  if (codigo === 'PARAMETROS_INVALIDOS') {
    return 'Las fechas de vigencia no son válidas. Revisa inicio y término.';
  }
  if (codigo === 'OBJETIVO_INVALIDO') {
    return 'No es posible otorgar administración temporal a tu propia cuenta.';
  }
  if (codigo === 'USUARIO_NO_ENCONTRADO') {
    return 'La cuenta destino no existe o ya no está disponible.';
  }
  if (codigo === 'USUARIO_NO_VIGENTE') {
    return 'La cuenta destino no está activa.';
  }
  if (codigo === 'USUARIO_SIN_ROL') {
    return 'La cuenta destino aún no tiene un rol aprobado.';
  }
  if (codigo === 'OBJETIVO_ES_ADMIN_PERMANENTE') {
    return 'Esta cuenta ya es Administrador permanente.';
  }
  if (codigo === 'DELEGACION_SOLAPADA') {
    return 'Ya existe una administración temporal que se solapa con ese período.';
  }
  if (codigo === 'DELEGACION_NO_ENCONTRADA') {
    return 'La administración temporal ya no existe.';
  }
  return 'No fue posible completar la operación de administración temporal.';
}

// "Otorgar acceso temporal": valida en cliente (defensa UX), convierte
// las fechas a ISO-8601 UTC inequívoco y ejecuta la RPC SEGURA.
async function handleAdminTemporalSubmit(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const refs = adminRefsAdminTemporal();
  if (!refs) return;

  // Anti doble submit.
  if (adminTemporalEnCurso) return;

  adminMostrarErrorAdminTemporal(refs, null);

  // ---- Validación cliente (antes de enviar) ----
  if (!adminAccesoVigente()) {
    adminMostrarErrorAdminTemporal(refs,
      'Sólo un Administrador permanente puede otorgar administración temporal.');
    return;
  }

  const id = (refs.id && refs.id.value) ? refs.id.value.trim() : adminTemporalId;
  if (!id || !adminTemporalContexto || adminTemporalContexto.id !== id) {
    adminMostrarErrorAdminTemporal(refs, 'Actualiza los datos abriendo nuevamente la operación.');
    return;
  }

  const desdeFecha = refs.desdeFecha ? refs.desdeFecha.value : '';
  const desdeHora = refs.desdeHora ? refs.desdeHora.value : '';
  const hastaFecha = refs.hastaFecha ? refs.hastaFecha.value : '';
  const hastaHora = refs.hastaHora ? refs.hastaHora.value : '';

  if (!desdeFecha || !desdeHora || !hastaFecha || !hastaHora) {
    adminMostrarErrorAdminTemporal(refs, 'Las fechas y horas de vigencia son obligatorias.');
    return;
  }

  // Fecha/hora LOCAL de Chile → ISO-8601 UTC inequívoco. La
  // autorización la hará el backend con now() de PostgreSQL.
  const isoDesde = construirTimestampISOChile(desdeFecha, desdeHora);
  const isoHasta = construirTimestampISOChile(hastaFecha, hastaHora);

  if (!isoDesde || !isoHasta) {
    adminMostrarErrorAdminTemporal(refs, 'Las fechas de vigencia no son válidas.');
    return;
  }

  if (new Date(isoHasta).getTime() <= new Date(isoDesde).getTime()) {
    adminMostrarErrorAdminTemporal(refs, 'La fecha de término debe ser posterior a la de inicio.');
    return;
  }

  // Motivo opcional (<= 1000 caracteres, validado también en service
  // y en backend).
  let motivo = null;
  if (refs.motivo && typeof refs.motivo.value === 'string') {
    const m = refs.motivo.value.trim();
    motivo = m === '' ? null : m;
  }
  if (motivo && motivo.length > 1000) {
    adminMostrarErrorAdminTemporal(refs, 'El motivo no puede superar los 1000 caracteres.');
    return;
  }

  // Re-chequeo UX: el destino sigue siendo elegible (el backend
  // vuelve a validar todo).
  const usuario = (adminUsuariosReales || []).find(u => u && u.id === id);
  if (!usuario || adminEsPendiente(usuario)) {
    adminMostrarErrorAdminTemporal(refs, 'Esta cuenta ya no está pendiente/aprobada como se esperaba.');
    return;
  }
  if (adminRolClaveUI(usuario) === 'ADMINISTRADOR') {
    adminMostrarErrorAdminTemporal(refs, 'Esta cuenta ya es Administrador permanente.');
    return;
  }
  if (state.currentUser && state.currentUser.id === id) {
    adminMostrarErrorAdminTemporal(refs, 'No es posible otorgar administración temporal a tu propia cuenta.');
    return;
  }

  // S3C-2D: revalidar el privilegio PERMANENTE contra el backend
  // antes de la escritura sensible. Otorgar delegación exige
  // Administrador PERMANENTE vigente; si el estado de la UI estaba
  // stale se bloquea aquí. La autorización final la da la RPC.
  adminEstadoOtorgando(refs, true);
  let privilegioVigente = false;
  try {
    privilegioVigente = await revalidarPrivilegioParaEscritura();
  } catch (errReval) {
    console.error('S3C-2D: error revalidando privilegio antes de otorgar:', errReval);
    privilegioVigente = false; // fail closed
  }
  if (!privilegioVigente || !adminAccesoVigente()) {
    adminEstadoOtorgando(refs, false);
    adminMostrarErrorAdminTemporal(refs,
      'Tu acceso de Administrador permanente ya no está vigente. No es posible otorgar la delegación.');
    return;
  }

  adminEstadoOtorgando(refs, true);

  try {
    // ÚNICA escritura: RPC SEGURA otorgar_administracion_temporal.
    // NO hay INSERT/UPDATE directo; usuarios.rol_id jamás se envía.
    await window.UsuariosService.otorgarAdministracionTemporal({
      usuario_id: id,
      vigente_desde: isoDesde,
      vigente_hasta: isoHasta,
      motivo: motivo,
      rol_esperado: adminTemporalContexto.rol,
      revision_esperada: adminTemporalContexto.revision
    });
  } catch (err) {
    console.error('Error al otorgar administración temporal:', err);
    adminEstadoOtorgando(refs, false);
    adminMostrarErrorAdminTemporal(refs, adminMensajeGestion(err));
    if (extraerCodigoErrorRPC(err) === 'CONFLICTO_VERSION') {
      adminTemporalContexto = null;
      if (refs.submit) refs.submit.disabled = true;
      await cargarPanelAdminDatos();
    }
    return;
  }

  // ---- Éxito real ----
  adminEstadoOtorgando(refs, false);
  adminTemporalId = null;
  closeModal('modal-admin-temporal');
  adminMostrarToast('Administración temporal otorgada correctamente.');

  // Recarga el panel: la fila ahora muestra el bloque "Activa".
  await cargarPanelAdminDatos();
}

// Revocación con confirmación explícita. SÓLO Administrador
// permanente (UI + RPC). NO borra el registro: la RPC escribe
// revocado_at/revocado_por (auditoría conservada).
function revocarAdministracionTemporalConfirmada(administracionId, nombre) {
  if (!adminAccesoVigente() || !administracionId || typeof administracionId !== 'string') return;
  if (document.getElementById('admin-revocar-dialog')) return;

  const actorId = state.currentUser?.id;
  if (!actorId) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'admin-revocar-dialog';
  dialog.className = 'fixed inset-0 m-auto w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-slate-800 dark:text-white';
  dialog.style.width = 'calc(100% - 2rem)';
  dialog.style.maxHeight = '90vh';
  dialog.setAttribute('aria-labelledby', 'admin-revocar-titulo');
  dialog.setAttribute('aria-describedby', 'admin-revocar-consecuencia');
  dialog.innerHTML = `<div class="flex justify-between items-center gap-3">
    <h3 id="admin-revocar-titulo" class="font-bold">Revocar acceso temporal</h3>
    <button type="button" data-cerrar aria-label="Cerrar">×</button>
  </div>
  <p class="mt-2 text-sm font-semibold" data-nombre></p>
  <p id="admin-revocar-consecuencia" class="mt-2 text-sm text-slate-600 dark:text-slate-300">
    Si el acceso está activo, el usuario volverá a su rol permanente en la siguiente revalidación.
    Si está programado, no se activará. El registro se conserva para auditoría.
  </p>
  <p class="mt-2 text-sm" role="status"></p>
  <p class="mt-2 text-sm text-rose-700 dark:text-rose-300" role="alert"></p>
  <div class="mt-4 flex flex-col sm:flex-row justify-end gap-2">
    <button type="button" data-cerrar autofocus class="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold">Cancelar</button>
    <button type="button" data-revocar class="px-4 py-2 rounded-xl bg-rose-700 text-white text-sm font-bold">Revocar acceso</button>
  </div>`;
  dialog.querySelector('[data-nombre]').textContent = nombre || 'Cuenta seleccionada';
  const cerrar = [...dialog.querySelectorAll('[data-cerrar]')];
  const confirmar = dialog.querySelector('[data-revocar]');
  const estado = dialog.querySelector('[role="status"]');
  const error = dialog.querySelector('[role="alert"]');
  let ocupado = false;
  const cerrarDialogo = () => { if (!ocupado) dialog.close(); };
  cerrar.forEach(boton => boton.addEventListener('click', cerrarDialogo));
  dialog.addEventListener('cancel', evento => {
    evento.preventDefault();
    cerrarDialogo();
  });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });

  confirmar.addEventListener('click', async () => {
    if (ocupado || !dialog.open) return;
    ocupado = true;
    error.textContent = '';
    estado.textContent = 'Revocando acceso…';
    [confirmar, ...cerrar].forEach(boton => { boton.disabled = true; });
    try {
      if (!adminAccesoVigente() || state.currentUser?.id !== actorId ||
          !await revalidarPrivilegioParaEscritura() ||
          !adminAccesoVigente() || state.currentUser?.id !== actorId) {
        error.textContent = 'Tu acceso de Administrador permanente ya no está vigente.';
        return;
      }
      await window.UsuariosService.revocarAdministracionTemporal(administracionId);
      adminMostrarToast('Acceso administrativo temporal revocado.');
      try {
        await cargarPanelAdminDatos();
      } catch (err) {
        console.error('Error actualizando el panel tras revocar acceso:', err);
        adminMostrarToast('Acceso revocado. Recarga el panel para actualizar los datos.');
      }
      dialog.close();
    } catch (err) {
      console.error('Error al revocar administración temporal:', err);
      error.textContent = adminMensajeErrorAdminTemporal(err);
    } finally {
      ocupado = false;
      estado.textContent = '';
      [confirmar, ...cerrar].forEach(boton => { boton.disabled = false; });
    }
  });

  document.body.appendChild(dialog);
  dialog.showModal();
}

function deleteUserConfirm() {
  alert(ADMIN_MSG_GESTION_DESHABILITADA);
}

// ==========================================================
// DRAWER DE PERMISOS — DESHABILITADO (S3B-3)
// ==========================================================
// Abrirlo sólo informa que la gestión llega en una fase posterior.
// El contenido del drawer se renderizará cuando existan permisos
// reales (public.permisos / public.roles_permisos).
function openUserPermissionsDrawer() {
  alert('Gestión de permisos disponible en una fase posterior.');
}

function closeUserPermissionsDrawer() {
  const drawer = document.getElementById('drawer-user-permissions');
  const panel = document.getElementById('drawer-user-permissions-panel');
  if (!drawer || !panel) return;

  drawer.classList.remove('opacity-100');
  drawer.classList.add('opacity-0');
  panel.classList.remove('translate-x-0');
  panel.classList.add('translate-x-full');

  setTimeout(() => {
    drawer.classList.add('hidden');
  }, 280);
}

function handleDrawerBackdropClick() {
  closeUserPermissionsDrawer();
}

// Estado de error: mensaje visible del fallo REAL. Sin mocks, sin
// localStorage, sin datos inventados.
function adminErrorHTML() {
  return `
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-12 border border-rose-200 dark:border-rose-900/60 shadow-sm text-center">
      <span class="text-5xl block mb-3">⚠️</span>
      <p class="text-sm font-bold text-rose-700 dark:text-rose-300">No se pudieron cargar los usuarios reales.</p>
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Revisa la conexión con Supabase o los permisos de tu sesión (RLS).</p>
    </div>
  `;
}

window.AdminCorreosVerificados = (function () {
  let usuario = null, canal = null, generacion = 0, leyendo = null;
  let repetir = false, programada = null, reconexion = null, cantidad = 0, fallo = '';
  const vigente = token => token === generacion && usuario === state.currentUser?.id && adminAccesoVigente();
  function pintarIndicador() {
    const enlace = document.getElementById('nav-admin');
    if (!enlace) return;
    let badge = document.getElementById('admin-correos-pendientes');
    if (!badge) {
      badge = document.createElement('span'); badge.id = 'admin-correos-pendientes';
      badge.className = 'text-xs font-bold rounded-full px-2 py-1';
      badge.style.cssText = 'background:var(--alm-inset,#1e293b);border:1px solid var(--alm-border,#475569);color:inherit';
      badge.setAttribute('role','status'); badge.setAttribute('aria-live','polite'); enlace.appendChild(badge);
    }
    const visible = !!usuario && adminAccesoVigente() && (!!fallo || cantidad > 0);
    badge.hidden = !visible; badge.style.display = visible ? 'inline-flex' : 'none';
    badge.textContent = fallo ? '!' : String(cantidad);
    badge.title = fallo || cantidad + ' cuentas con correo verificado pendientes de aprobación';
    badge.setAttribute('aria-label',badge.title);
  }
  function detener() {
    generacion++; usuario = null; leyendo = null; repetir = false; cantidad = 0; fallo = '';
    clearTimeout(programada); clearTimeout(reconexion); programada = reconexion = null;
    const anterior = canal; canal = null;
    if (anterior) Promise.resolve(window.supabaseClient.removeChannel(anterior)).catch(() => {});
    pintarIndicador();
  }
  function programar() {
    if (!usuario || programada) return;
    programada = setTimeout(() => { programada = null; sincronizar(); }, 120);
  }
  function reflejarListado(usuarios) {
    if (!usuario || !adminAccesoVigente()) return;
    cantidad = adminContarPendientes(usuarios); fallo = ''; pintarIndicador();
  }
  function actualizarListado(usuarios) {
    const lista = document.querySelector('[data-admin-usuarios-lista]');
    if (!adminAccesoVigente() || currentView !== 'admin' || !lista || !adminUsuariosReales || !adminRolesReales) return;
    adminUsuariosReales = usuarios;
    // Los formularios y valores esperados capturados permanecen intactos.
    lista.innerHTML = getAdminFilasHTML(usuarios);
    const contador = document.querySelector('[data-admin-pendientes-cantidad]');
    if (contador) contador.textContent = String(adminContarPendientes(usuarios));
    const total = document.querySelector('[data-admin-total-cantidad]');
    if (total) total.textContent = String(usuarios.length);
  }
  async function sincronizar() {
    if (!usuario) return;
    if (!adminAccesoVigente()) { detener(); return; }
    if (leyendo) { repetir = true; return leyendo; }
    const token = generacion;
    const tarea = (async () => {
      do {
        repetir = false;
        try {
          const auth = await window.supabaseClient.auth.getUser();
          if (!vigente(token)) return;
          if (auth.error) throw auth.error;
          if (auth.data?.user?.id !== usuario) { detener(); return; }
          const autorizacion = await window.UsuariosService.getMiEstadoAdministrativo(true);
          if (!vigente(token)) return;
          if (!autorizacion.es_admin_permanente) { detener(); return; }
          const usuarios = await window.UsuariosService.getUsuarios(true);
          if (!vigente(token)) return;
          cantidad = adminContarPendientes(usuarios); fallo = '';
          actualizarListado(usuarios); pintarIndicador();
        } catch (error) {
          if (!vigente(token)) return;
          fallo = 'No se pudieron sincronizar las cuentas verificadas. ' + (error.message || 'Error de conexión.');
          pintarIndicador();
        }
      } while (repetir && vigente(token));
    })();
    leyendo = tarea;
    try { await tarea; } finally { if (leyendo === tarea) leyendo = null; }
  }
  function conectar() {
    if (!usuario || canal) return;
    const token = generacion;
    const nuevo = window.supabaseClient.channel('admin-correos-verificados-' + usuario);
    canal = nuevo;
    nuevo.on('postgres_changes', { event:'INSERT', schema:'public', table:'usuarios_correos_verificados' }, () => {
      if (vigente(token)) programar();
    }).subscribe(estado => {
      if (!vigente(token) || canal !== nuevo) return;
      if (estado === 'SUBSCRIBED') { clearTimeout(reconexion); reconexion = null; programar(); }
      else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(estado) && !reconexion) {
        fallo = 'Conexión de cuentas verificadas interrumpida; reconectando.'; pintarIndicador();
        reconexion = setTimeout(() => {
          reconexion = null;
          if (!vigente(token) || canal !== nuevo) return;
          canal = null;
          Promise.resolve(window.supabaseClient.removeChannel(nuevo)).catch(() => {}).finally(() => {
            if (vigente(token)) conectar();
          });
        }, 3000);
      }
    });
  }
  function actualizarSesion() {
    if (!state.currentUser?.id || !adminAccesoVigente()) { if (usuario) detener(); return; }
    if (usuario === state.currentUser.id) { pintarIndicador(); return; }
    detener(); usuario = state.currentUser.id; conectar(); programar();
  }
  window.addEventListener('online', () => { actualizarSesion(); programar(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { actualizarSesion(); programar(); } });
  window.supabaseClient.auth.onAuthStateChange(evento => {
    if (evento === 'SIGNED_OUT') detener();
  });
  return { actualizarSesion, sincronizar, detener, reflejarListado };
})();

// Descartar datos y lectores de la visita; respuestas antiguas no remontan el panel.
function adminLimpiarVisita() {
  if(adminManualPlanEnCurso&&document.getElementById('admin-nuevo-usuario-dialog')){
    const confirmacion=document.getElementById('admin-aprobacion-ficha-dialog');confirmacion?.close();confirmacion?.remove();
  }
  adminLimpiarPasswordsManual(); adminInvalidarFichaManual();
  adminCancelarConsultaInvitacion();
  if (adminInvitacionTimer !== null) { clearTimeout(adminInvitacionTimer); adminInvitacionTimer=null; }
  for (const id of ['admin-invitacion-dialog','admin-nuevo-usuario-dialog']) {
    const dialogo=document.getElementById(id);if(!dialogo)continue;
    const password=dialogo.querySelector('input[type="password"]');if(password)password.value='';
    dialogo.close();dialogo.remove();
  }
  cancelarPanelDelegaciones();
  adminUsuariosReales = adminRolesReales = adminDelegacionesReales = null;
  ++adminGestionApertura; ++adminTemporalApertura;
  adminCerrarGestion();
  if (typeof closeModal === 'function') {
    for (const id of ['modal-user-form','modal-admin-temporal']) {
      const modal = document.getElementById(id);
      if (modal && !modal.classList.contains('hidden')) closeModal(id);
    }
  }
  if (currentView === 'admin') document.getElementById('view-container')?.replaceChildren();
}
