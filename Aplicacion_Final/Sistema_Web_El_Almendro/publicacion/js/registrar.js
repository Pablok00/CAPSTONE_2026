// INV-36: registro exclusivo de invitaciones; sesión Auth y compuertas servidor obligatorias.
let invitacionUsuarioId = null, invitacionOcupada = false, invitacionSoloNombre = false, invitacionTerminada = false;
function invitacionMensaje(texto) { document.getElementById('invitation-message').textContent = texto; }
function invitacionBloquear() {
  const boton = document.getElementById('invitation-save');
  boton.disabled = window.INVITACIONES_UI_HABILITADA !== true || invitacionOcupada || !invitacionUsuarioId || invitacionTerminada;
  boton.textContent = invitacionSoloNombre ? 'Verificar y completar nombre' : 'Completar mi registro';
  document.getElementById('invitation-back').disabled = invitacionOcupada;
  document.getElementById('invitation-name').disabled = invitacionOcupada;
  for (const id of ['invitation-password','invitation-password-confirm']) document.getElementById(id).disabled = invitacionOcupada || invitacionSoloNombre;
  for (const id of ['invitation-resume-email','invitation-resume-password']) document.getElementById(id).disabled = invitacionOcupada;
  document.getElementById('invitation-resume-submit').disabled = invitacionOcupada || window.INVITACIONES_UI_HABILITADA !== true;
}
function invitacionNombre(valor) {
  const nombre = String(valor || '').normalize('NFC').trim().replace(/\s+/gu,' ');
  if (nombre.length > 320 || [...nombre].length < 3 || [...nombre].length > 160 || /[\p{C}<>]/u.test(nombre) || (nombre.match(/\p{L}/gu) || []).length < 2) throw Error('NOMBRE_INVALIDO');
  return nombre;
}
function invitacionLeerTicket() {
  const raw = sessionStorage.getItem('hotel.registro-invitado.' + invitacionUsuarioId);
  if (!raw) return null;
  const t = JSON.parse(raw);
  if (t.version !== 1 || t.usuarioId !== invitacionUsuarioId || typeof t.solicitudId !== 'string' ||
      !['PASSWORD_ENVIADA','PASSWORD_CONFIRMADA','NOMBRE_ENVIADO','COMPLETO','PASSWORD_PENDIENTE'].includes(t.etapa) || invitacionNombre(t.nombre) !== t.nombre) throw Error('SOLICITUD_REQUIERE_REVISION');
  return t;
}
function invitacionGuardarTicket(ticket) {
  // Solo identidad/nombre/etapa. Nunca contraseña, JWT ni enlace de invitación.
  sessionStorage.setItem('hotel.registro-invitado.' + invitacionUsuarioId, JSON.stringify(ticket));
}
function invitacionCampos() {
  document.getElementById('invitation-password-fields').classList.toggle('hidden', invitacionSoloNombre);
  for (const id of ['invitation-password','invitation-password-confirm']) document.getElementById(id).disabled = invitacionSoloNombre || invitacionOcupada;
}
async function invitacionValidarSesion(identidad) {
  const auth = window.supabaseClient.auth;
  const renovada = await auth.refreshSession();
  if (renovada.error || renovada.data?.session?.user?.id !== identidad) throw Error('INVITACION_INVALIDA');
  const claims = await auth.getClaims(renovada.data.session.access_token), jwt = claims.data?.claims;
  if (claims.error || jwt?.sub !== identidad || !jwt.exp || jwt.exp * 1000 <= Date.now()) throw Error('INVITACION_INVALIDA');
  const result = await auth.getUser(), user = result.data?.user;
  if (result.error || user?.id !== identidad || !user.invited_at || !user.email_confirmed_at || !user.email) throw Error('INVITACION_INVALIDA');
  return user;
}
async function invitacionPrepararCuenta(user, continuacion) {
  const perfil = await window.supabaseClient.from('usuarios').select('id,nombre,estado,rol_id,trabajador_id').eq('id', user.id).maybeSingle();
  if (perfil.error) throw Error('PERFIL_NO_VERIFICABLE');
  if (!perfil.data || perfil.data.id !== user.id || perfil.data.estado !== true || perfil.data.rol_id !== null || perfil.data.trabajador_id !== null) throw Error('PERFIL_NO_PENDIENTE');
  invitacionUsuarioId = user.id;
  const ticket = invitacionLeerTicket();
  if (ticket && perfil.data.nombre && perfil.data.nombre !== ticket.nombre) throw Error('SOLICITUD_REQUIERE_REVISION');
  document.getElementById('invitation-email').value = user.email;
  document.getElementById('invitation-name').value = ticket?.nombre || perfil.data.nombre || '';
  document.getElementById('invitation-name').readOnly = !!ticket || !!perfil.data.nombre;
  invitacionSoloNombre = ticket ? ticket.etapa !== 'PASSWORD_PENDIENTE' : continuacion || !!perfil.data.nombre;
  document.getElementById('invitation-form').classList.remove('hidden');
  document.getElementById('invitation-resume').classList.add('hidden');
  invitacionCampos();
  invitacionMensaje(window.INVITACIONES_UI_HABILITADA !== true
    ? 'Sesión invitada verificada. La prueba de guardado todavía no está autorizada; no se ha cambiado tu contraseña.'
    : invitacionSoloNombre ? 'Continúa o verifica tu registro. Se comprobará el nombre en servidor sin cambiar otra vez tu contraseña.'
    : 'Correo verificado mediante Supabase. Ingresa tu nombre y establece tu contraseña; después quedarás pendiente de aprobación.');
}
async function iniciarRegistroInvitado() {
  if (invitacionOcupada) return;
  invitacionOcupada = true; invitacionUsuarioId = null; invitacionTerminada = false; invitacionBloquear();
  ['invitation-email','invitation-name','invitation-password','invitation-password-confirm'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('invitation-form').classList.add('hidden');
  const enlace = window.hotelInvitationLink; delete window.hotelInvitationLink;
  try {
    const hash = new URLSearchParams(enlace?.hash?.replace(/^#/, '')), query = new URLSearchParams(enlace?.search);
    if (hash.has('error') || query.has('error')) throw Error('INVITACION_INVALIDA');
    const auth = window.supabaseClient.auth; let result;
    if (query.get('type') === 'invite' && query.get('token_hash')) result = await auth.verifyOtp({type:'invite',token_hash:query.get('token_hash')});
    else if (hash.get('type') === 'invite' && hash.get('access_token') && hash.get('refresh_token')) result = await auth.setSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token')});
    else throw Error('INVITACION_INVALIDA');
    if (result.error || !result.data?.session?.user?.id) throw Error('INVITACION_INVALIDA');
    await invitacionPrepararCuenta(await invitacionValidarSesion(result.data.session.user.id), false);
  } catch (error) {
    invitacionUsuarioId = null; document.getElementById('invitation-form').classList.add('hidden');
    document.getElementById('invitation-email').value = '';
    document.getElementById('invitation-resume').classList.remove('hidden');
    try { await window.supabaseClient.auth.signOut({scope:'local'}); } catch (_) {}
    invitacionMensaje(error?.message === 'PERFIL_NO_VERIFICABLE' ? 'No se pudo verificar tu perfil. Comprueba la conexión y consulta al Administrador.'
      : error?.message === 'PERFIL_NO_PENDIENTE' ? 'La cuenta ya no está pendiente de registro. Consulta al Administrador o inicia sesión si ya fue aprobada.'
      : 'El enlace no es válido, ha vencido o ya se utilizó. Solicita revisión al Administrador. Si ya estableciste contraseña, puedes continuar abajo sin reutilizar el enlace.');
  } finally { invitacionOcupada = false; invitacionBloquear(); }
}
async function continuarRegistroInvitado(evento) {
  evento?.preventDefault();
  if (invitacionOcupada || window.INVITACIONES_UI_HABILITADA !== true) { invitacionMensaje('La continuación del registro todavía no está habilitada.'); return; }
  const email = document.getElementById('invitation-resume-email').value.trim(), password = document.getElementById('invitation-resume-password');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password.value) { invitacionMensaje('Ingresa correo y contraseña para continuar.'); return; }
  invitacionOcupada = true; document.getElementById('invitation-resume-submit').disabled = true; invitacionBloquear();
  try {
    const result = await window.supabaseClient.auth.signInWithPassword({email,password:password.value});
    if (result.error || !result.data?.session?.user?.id) throw Error('SESION_INVALIDA');
    await invitacionPrepararCuenta(await invitacionValidarSesion(result.data.session.user.id), true);
  } catch (_) {
    invitacionUsuarioId = null;
    try { await window.supabaseClient.auth.signOut({scope:'local'}); } catch (_) {}
    invitacionMensaje('No se pudo continuar con esas credenciales o la cuenta no es una invitación pendiente. Revisa los datos o utiliza la recuperación de contraseña desde Ingresar.');
  } finally {
    password.value = ''; invitacionOcupada = false; document.getElementById('invitation-resume-submit').disabled = false; invitacionBloquear();
  }
}
async function completarRegistroInvitado(evento) {
  evento?.preventDefault();
  if (invitacionOcupada || invitacionTerminada) return;
  if (!invitacionUsuarioId || window.INVITACIONES_UI_HABILITADA !== true) {
    document.getElementById('invitation-password').value = ''; document.getElementById('invitation-password-confirm').value = '';
    invitacionMensaje('El guardado sigue bloqueado. No se guardaron nombre ni contraseña.'); invitacionBloquear(); return;
  }
  let ticket;
  try {
    const nombre = invitacionNombre(document.getElementById('invitation-name').value);
    ticket = invitacionLeerTicket();
    if (ticket && ticket.nombre !== nombre) throw Error('SOLICITUD_REQUIERE_REVISION');
    const password = document.getElementById('invitation-password').value, confirm = document.getElementById('invitation-password-confirm').value;
    if (!invitacionSoloNombre && (password.length < 6 || password !== confirm)) { invitacionMensaje('La contraseña debe tener al menos 6 caracteres y ambas deben coincidir.'); return; }
    ticket ||= {version:1,usuarioId:invitacionUsuarioId,nombre,solicitudId:crypto.randomUUID(),etapa:invitacionSoloNombre?'NOMBRE_ENVIADO':'PASSWORD_PENDIENTE'};
    invitacionGuardarTicket(ticket);
    invitacionOcupada = true; invitacionBloquear();
    const user = await window.supabaseClient.auth.getUser();
    if (user.error || user.data?.user?.id !== invitacionUsuarioId || !user.data.user.invited_at || !user.data.user.email_confirmed_at) throw Error('SESION_INVALIDA');
    if (!invitacionSoloNombre) {
      ticket.etapa = 'PASSWORD_ENVIADA'; invitacionGuardarTicket(ticket);
      const result = await window.supabaseClient.auth.updateUser({password});
      if (result.error || result.data?.user?.id !== invitacionUsuarioId) throw Error('PASSWORD_SIN_CONFIRMAR');
      ticket.etapa = 'PASSWORD_CONFIRMADA'; invitacionGuardarTicket(ticket); invitacionSoloNombre = true;
    }
    ticket.etapa = 'NOMBRE_ENVIADO'; invitacionGuardarTicket(ticket);
    invitacionMensaje('Verificando y completando el nombre…');
    await window.invocarUsuarioInvitaciones({accion:'COMPLETAR_NOMBRE',nombre:ticket.nombre}, invitacionUsuarioId);
    ticket.etapa = 'COMPLETO'; invitacionGuardarTicket(ticket); invitacionTerminada = true;
    document.getElementById('invitation-form').classList.add('hidden');
    invitacionMensaje('Tu registro se completó correctamente. Tu cuenta está pendiente de aprobación por el administrador. Cerrando sesión temporal…');
    await invitacionCerrarYRedirigir(true);
  } catch (error) {
    if (ticket?.etapa === 'COMPLETO' && invitacionTerminada) {
      invitacionMensaje('El registro quedó completo, pero no se confirmó el cierre de sesión o la redirección. Pulsa Volver a Ingresar para reintentar solo ese paso.');
    } else if (error?.codigo === 'CONTRASENA_NO_CONFIGURADA' && ticket) {
      ticket.etapa = 'PASSWORD_PENDIENTE';
      try { invitacionGuardarTicket(ticket); } catch (_) { invitacionMensaje('No se pudo conservar la revisión. No continúes sin verificar el estado.'); return; }
      invitacionSoloNombre = false;
      invitacionMensaje('El servidor no acredita una contraseña configurada. Ingresa y confirma una para un nuevo intento explícito; no se ha reenviado ninguna solicitud.');
    } else {
      if (ticket && ticket.etapa !== 'PASSWORD_PENDIENTE') invitacionSoloNombre = true;
      const mensajes = {NOMBRE_INVALIDO:'Ingresa un nombre válido de 3 a 160 caracteres.',INVITACIONES_DESHABILITADAS:'El backend sigue deshabilitado. Conserva la solicitud para continuar después.',
        NOMBRE_DISTINTO_REQUIERE_REVISION:'Ya existe otro nombre confirmado. Requiere revisión administrativa; no se sobrescribirá.'};
      invitacionMensaje(mensajes[error?.codigo || error?.message] || (ticket && ticket.etapa !== 'PASSWORD_PENDIENTE'
        ? 'El registro no quedó confirmado por completo. La contraseña puede estar configurada; conserva esta solicitud y pulsa Verificar y completar nombre. No se cambiará otra vez la contraseña automáticamente.'
        : 'No se pudo validar o conservar la solicitud. No continúes sin revisar el estado.'));
    }
  } finally {
    document.getElementById('invitation-password').value = ''; document.getElementById('invitation-password-confirm').value = '';
    document.getElementById('invitation-name').readOnly = !!ticket;
    invitacionOcupada = false; invitacionCampos(); invitacionBloquear();
  }
}
async function invitacionCerrarYRedirigir(completo) {
  const auth = window.supabaseClient.auth;
  const salida = await auth.signOut({scope:'local'});
  if (salida.error) throw Error('CIERRE_NO_CONFIRMADO');
  const restante = await auth.getSession();
  if (restante.error || restante.data?.session) throw Error('CIERRE_NO_CONFIRMADO');
  // Solo después de éxito backend y cierre comprobado. Nunca se pone en la URL.
  if (completo) sessionStorage.setItem('hotel.registro-finalizado', 'COMPLETO_PENDIENTE_V1');
  else sessionStorage.removeItem('hotel.registro-finalizado');
  window.location.replace('./login.html');
}
async function volverDesdeInvitacion() {
  if (invitacionOcupada) return;
  invitacionOcupada = true; invitacionBloquear();
  try {
    await invitacionCerrarYRedirigir(invitacionTerminada);
  } catch (_) {
    invitacionMensaje(invitacionTerminada ? 'El registro está completo. No se pudo confirmar el cierre temporal. Pulsa Volver a Ingresar para reintentar el cierre.'
      : 'No se pudo confirmar el cierre de la sesión temporal. Reintenta Volver a Ingresar; no se anunció un registro completo.');
  } finally { invitacionOcupada = false; invitacionBloquear(); }
}

function alternarPasswordInvitado(id) {
  const campo = document.getElementById(id);
  campo.type = campo.type === 'password' ? 'text' : 'password';
  const visible = campo.type === 'text';
  const boton = document.getElementById(id + '-toggle');
  boton.setAttribute('aria-pressed', String(visible));
  const etiqueta = (visible ? 'Ocultar ' : 'Mostrar ') + (id === 'invitation-password' ? 'contraseña' : 'confirmación de contraseña');
  boton.setAttribute('aria-label', etiqueta);
  boton.setAttribute('title', etiqueta);
  const mostrar = boton.querySelector('[data-eye-icon="show"]');
  const ocultar = boton.querySelector('[data-eye-icon="hide"]');
  if (mostrar) mostrar.style.display = visible ? 'none' : '';
  if (ocultar) ocultar.style.display = visible ? '' : 'none';
}


document.addEventListener('DOMContentLoaded', iniciarRegistroInvitado);
