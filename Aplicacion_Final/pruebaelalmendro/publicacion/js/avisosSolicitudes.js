// Realtime solo invalida la lectura: datos y lectura individual proceden de las RPC.
window.AvisosSolicitudes = (function () {
  'use strict';
  let usuario = null, canal = null, generacion = 0, avisos = [], error = '', sincronizando = null;
  let repetir = false, modal = null, accion = false, mostrando = false, abriendoFicha = false;
  let temporizador = null, reconexion = null, preparado = false, mostrarProgramado = false;
  const mostrados = new Set();
  const vistosConfirmados = new Set();
  const escape = valor => String(valor ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const vigenteUI = () => !!state.currentUser?.id && !esCuentaSinRol() && esAdminOperativoActual();
  const vigente = token => usuario && generacion === token && usuario === state.currentUser?.id && vigenteUI();
  const pendientesAutomaticos = () => avisos.filter(a => a.estado_solicitud === 'pendiente' && a.visto_en === null && a.pospuesto_en === null && !mostrados.has(a.solicitud_id));

  function contenidoLista() {
    if (!vigenteUI()) return '<p class="text-sm alm-muted">No hay avisos administrativos disponibles para tu cuenta.</p>';
    const avisoError = error ? '<p role="status" class="text-sm alm-muted">' + escape(error) + '</p><button type="button" onclick="AvisosSolicitudes.sincronizar()" class="text-sm font-bold mt-2">Volver a consultar</button>' : '';
    if (!usuario || sincronizando && !avisos.length) return avisoError + (error ? '' : uiCargandoHTML());
    if (!avisos.length) return avisoError + (error ? '' : '<p role="status" class="text-sm alm-muted">No tienes notificaciones pendientes.</p>');
    return avisoError + avisos.map(a => `<article class="p-3 rounded-xl space-y-1" style="border:1px solid var(--alm-border,#dce4ee);overflow-wrap:anywhere"><h3 class="text-sm font-bold">${escape(a.tipo_problema)}</h3><p class="text-sm">${escape(a.ubicacion)}</p><p class="text-xs alm-muted">Solicitante: ${escape(a.solicitado_por || 'Usuario no disponible')}</p><p class="text-xs alm-muted">Urgencia: ${escape(a.urgencia === 'critica' ? 'Crítica' : a.urgencia)} · Estado: ${escape(a.estado_solicitud)}</p>${a.pospuesto_en !== null ? '<p class="text-xs alm-muted">Pospuesto · pendiente de revisión</p>' : ''}<button type="button" data-solicitud-id="${escape(a.solicitud_id)}" onclick="AvisosSolicitudes.abrirAviso(this.dataset.solicitudId)" ${accion ? 'disabled' : ''} class="text-sm font-bold" style="color:var(--alm-link,#2563eb)">Ir a Solicitudes</button></article>`).join('');
  }
  function pintar() {
    const personal = window.NotificacionesRevision?.disponible();
    document.querySelector('#notification-dropdown > div:last-child')?.classList.toggle('hidden', !!personal);
    if (personal) { window.NotificacionesRevision.pintar(); return; }
    const habilitado = vigenteUI();
    const cantidad = habilitado ? avisos.length : 0;
    const lista = document.getElementById('topbar-notif-list');
    if (lista) lista.innerHTML = contenidoLista();
    const completa = document.getElementById('avisos-solicitudes-lista');
    if (completa) completa.innerHTML = contenidoLista();
    for (const id of ['topbar-notif-badge','badge-nav-notif-count']) {
      const badge = document.getElementById(id);
      if (!badge) continue;
      badge.textContent = cantidad ? String(cantidad) : '';
      badge.classList.toggle('hidden',!cantidad);
      badge.style.display = cantidad ? 'inline-flex' : 'none';
    }
    const boton = document.getElementById('btn-notification-dropdown');
    if (boton) boton.setAttribute('aria-label',habilitado ? (error ? 'Avisos: consulta no disponible' : `Avisos de solicitudes: ${cantidad} pendientes`) : 'Abrir Notificaciones');
  }
  function quitarModal() {
    if (!modal) return;
    const anterior = modal;
    modal = null;
    anterior.elemento.remove();
    document.removeEventListener('keydown',teclado,true);
    anterior.fondos.forEach(({el,inert}) => { el.inert = inert; });
    document.body.style.overflow = anterior.overflow;
    if (anterior.foco?.isConnected) anterior.foco.focus({preventScroll:true});
  }
  function detener(mensaje = '') {
    if (esCuentaSinRol() || state.currentUser?.role !== 'RECEPCION') window.NotificacionesRevision?.detener();
    generacion++;
    usuario = null; avisos = []; error = mensaje; repetir = false; sincronizando = null;
    accion = false; mostrando = false; abriendoFicha = false; mostrados.clear(); vistosConfirmados.clear();
    clearTimeout(temporizador); clearTimeout(reconexion); temporizador = reconexion = null;
    const anterior = canal; canal = null;
    if (anterior) Promise.resolve(window.supabaseClient.removeChannel(anterior)).catch(() => {});
    quitarModal(); pintar();
  }
  function programarConsulta() {
    if (!usuario || temporizador) return;
    temporizador = setTimeout(() => { temporizador = null; sincronizar(); },100);
  }
  async function sincronizar() {
    if (!usuario) { if (vigenteUI()) { actualizarSesion(); return sincronizando; } return; }
    if (!vigenteUI()) { detener(); return; }
    if (sincronizando) { repetir = true; return sincronizando; }
    const token = generacion;
    const tarea = (async () => {
      do {
        repetir = false;
        try {
          if (!await window.AvisosSolicitudesService.autorizado()) { if (vigente(token)) detener('No tienes autorización administrativa vigente para consultar avisos.'); return; }
          if (!vigente(token)) return;
          const filas = await window.AvisosSolicitudesService.listar();
          if (!vigente(token)) return;
          // La lectura autorizada acredita el estado; una señal remota solo invalida.
          avisos = filas.filter(a => a.estado_solicitud === 'pendiente' && a.visto_en === null && !vistosConfirmados.has(a.solicitud_id)); error = '';
          if (modal && !accion) {
            const actual = avisos.find(a => a.solicitud_id === modal.aviso.solicitud_id);
            if (!actual || actual.pospuesto_en !== null) quitarModal();
            else modal.elemento.querySelector('[data-aviso-error]').textContent = '';
          }
        } catch (e) {
          if (!vigente(token)) return;
          error = 'No se pudieron sincronizar los avisos. ' + (e.message || 'Error de conexión.');
          if (modal && !accion) quitarModal();
        }
        if (vigente(token)) pintar();
      } while (repetir && vigente(token));
      return vigente(token) && !error;
    })();
    sincronizando = tarea;
    try { return await tarea; } finally {
      if (sincronizando === tarea) sincronizando = null;
      if (vigente(token)) { pintar(); programarMostrar(); }
    }
  }
  function abrirCanal() {
    if (!usuario || canal || !vigenteUI()) return;
    const token = generacion;
    const nuevo = window.supabaseClient.channel('solicitudes-avisos-' + usuario);
    canal = nuevo;
    nuevo.on('postgres_changes', { event:'INSERT', schema:'public', table:'solicitudes_reactivas_avisos' }, () => {
      if (vigente(token) && canal === nuevo) programarConsulta();
    }).subscribe(estado => {
      if (!vigente(token) || canal !== nuevo) return;
      if (estado === 'SUBSCRIBED') sincronizar();
      else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(estado)) {
        error = 'Conexión de avisos interrumpida. Se sincronizará automáticamente al reconectar.';
        if (modal) modal.elemento.querySelector('[data-aviso-error]').textContent = error;
        pintar();
        if (estado === 'CLOSED' && !reconexion) reconexion = setTimeout(() => {
          reconexion = null;
          if (!vigente(token) || canal !== nuevo) return;
          canal = null;
          Promise.resolve(window.supabaseClient.removeChannel(nuevo)).finally(() => { if (vigente(token)) abrirCanal(); }).catch(() => {});
        },1500);
      }
    });
  }
  function actualizarSesion() {
    preparar();
    if (!vigenteUI()) { if (usuario || canal || modal) detener(); else pintar(); window.NotificacionesRevision?.actualizarSesion(); return; }
    window.NotificacionesRevision?.actualizarSesion();
    if (usuario === state.currentUser.id && canal) { pintar(); return; }
    detener(); usuario = state.currentUser.id;
    abrirCanal(); sincronizar();
  }
  function hayOtroModal() {
    if (document.documentElement.classList.contains('auth-pending')) return true;
    return [...document.querySelectorAll('[role="dialog"],[aria-modal="true"],[id^="modal-"],.fixed.inset-0,dialog[open]')].some(el => {
      if (el === modal?.elemento || modal?.elemento.contains(el) || el.hidden || el.classList.contains('hidden')) return false;
      const estilo = getComputedStyle(el);
      return estilo.display !== 'none' && estilo.visibility !== 'hidden' && el.getClientRects().length > 0;
    });
  }
  function programarMostrar() {
    if (mostrarProgramado || modal || mostrando || accion || abriendoFicha || error || !usuario || !pendientesAutomaticos().length) return;
    mostrarProgramado = true;
    requestAnimationFrame(() => { mostrarProgramado = false; mostrarSiguiente(); });
  }
  async function mostrarSiguiente() {
    if (!usuario || modal || mostrando || accion || abriendoFicha || error || !vigenteUI() || hayOtroModal()) return;
    const aviso = pendientesAutomaticos()[0];
    if (!aviso) return;
    const token = generacion;
    mostrando = true;
    try {
      if (!await window.AvisosSolicitudesService.autorizado()) { if (vigente(token)) detener('No tienes autorización administrativa vigente para consultar avisos.'); return; }
      if (!vigente(token) || modal || accion || abriendoFicha || error || hayOtroModal()) return;
      const actual = avisos.find(a => a.solicitud_id === aviso.solicitud_id && a.visto_en === null && a.pospuesto_en === null);
      if (!actual || mostrados.has(actual.solicitud_id)) return;
      mostrarModal(actual);
    } catch (e) {
      if (vigente(token)) { error = 'No se pudo verificar la autorización de avisos. ' + (e.message || 'Error de conexión.'); pintar(); }
    } finally { if (generacion === token) mostrando = false; }
  }
  function mostrarModal(aviso) {
    const elemento = document.createElement('div');
    elemento.id = 'aviso-solicitud-modal';
    elemento.className = 'alm-ui fixed inset-0 flex items-center justify-center p-4';
    elemento.style.cssText = 'z-index:1000;background:rgba(2,6,23,.75)';
    elemento.setAttribute('role','dialog'); elemento.setAttribute('aria-modal','true');
    elemento.setAttribute('aria-labelledby','aviso-solicitud-titulo'); elemento.tabIndex = -1;
    elemento.innerHTML = `<section class="alm-panel w-full max-w-lg p-5 sm:p-6 space-y-4" style="max-height:90vh;overflow-y:auto"><h2 id="aviso-solicitud-titulo" class="alm-title">Nueva solicitud de Mantención Reactiva</h2><dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl" style="border:1px solid var(--alm-border);background:var(--alm-inset)">${[['Problema',aviso.tipo_problema],['Ubicación',aviso.ubicacion],['Solicitante',aviso.solicitado_por || 'Usuario no disponible'],['Urgencia',aviso.urgencia === 'critica' ? 'Crítica' : aviso.urgencia]].map(([titulo,valor])=>`<div style="${titulo === 'Problema' ? 'grid-column:1/-1' : ''}"><dt class="text-xs font-bold alm-muted">${titulo}</dt><dd class="text-sm" style="margin-top:4px;overflow-wrap:anywhere;font-weight:${titulo === 'Problema' ? '600' : '400'}">${escape(valor)}</dd></div>`).join('')}</dl><p data-aviso-error role="status" aria-live="polite" class="text-sm alm-muted"></p><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><button type="button" onclick="AvisosSolicitudes.responder('posponer')" class="px-4 py-2 rounded-xl" style="border:1px solid var(--alm-border)">Ver más tarde</button><button type="button" onclick="AvisosSolicitudes.responder('ver')" class="alm-btn-primary px-4 py-2">Ir a Solicitudes</button></div></section>`;
    const fondos = [...document.body.children].filter(el => !['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el => ({el,inert:el.inert}));
    modal = {aviso,elemento,fondos,foco:document.activeElement,overflow:document.body.style.overflow};
    document.body.appendChild(elemento); fondos.forEach(({el})=>{el.inert=true;}); document.body.style.overflow='hidden';
    mostrados.add(aviso.solicitud_id); document.addEventListener('keydown',teclado,true);
    elemento.querySelector('button').focus();
  }
  function teclado(e) {
    if (!modal) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }
    if (e.key !== 'Tab') return;
    const botones = [...modal.elemento.querySelectorAll('button:not(:disabled)')];
    if (!botones.length) { e.preventDefault(); modal.elemento.focus(); return; }
    const primero=botones[0],ultimo=botones[botones.length-1];
    if (!modal.elemento.contains(document.activeElement) || e.shiftKey && document.activeElement===primero || !e.shiftKey && document.activeElement===ultimo) {e.preventDefault();(e.shiftKey?ultimo:primero).focus();}
  }
  async function marcar(id,tipo) {
    if (accion || !usuario || !vigenteUI()) return;
    const token = generacion; accion=true;
    const actual = modal;
    actual?.elemento.querySelectorAll('button').forEach(el=>{el.disabled=true;});
    pintar();
    try {
      if (!await window.AvisosSolicitudesService.autorizado()) { if (vigente(token)) detener('No tienes autorización administrativa vigente para consultar avisos.'); return; }
      if (!vigente(token)) return;
      await window.AvisosSolicitudesService.marcar(id,tipo);
      if (!vigente(token)) return;
      if(tipo==='ver'){vistosConfirmados.add(id);avisos=avisos.filter(a=>a.solicitud_id!==id);pintar();}
      mostrados.add(id); quitarModal();
      if (tipo==='ver') {
        abriendoFicha=true;
        document.getElementById('notification-dropdown')?.classList.add('hidden');
        navigateTo('solicitudes');
        requestAnimationFrame(()=>{
          try {
            const boton=document.getElementById('solicitudes-vista')?.querySelector('[data-solicitudes-actualizar]');
            if (vigente(token) && currentView==='solicitudes' && boton) solicitudesAbrirDetalle(boton,-1,id);
          } finally {abriendoFicha=false;programarMostrar();}
        });
      }
      await sincronizar();
    } catch(e) {
      if (!vigente(token)) return;
      const texto='No se pudo confirmar la acción del aviso. '+(e.message||'Error de conexión.');
      if(actual && modal===actual)actual.elemento.querySelector('[data-aviso-error]').textContent=texto;
      else error=texto;
    } finally {
      if(generacion===token){accion=false;modal?.elemento.querySelectorAll('button').forEach(el=>{el.disabled=false;});pintar();programarMostrar();}
    }
  }
  function responder(tipo) { if(modal && ['posponer','ver'].includes(tipo)) return marcar(modal.aviso.solicitud_id,tipo); }
  function abrirAviso(id) {
    if (!avisos.some(a=>a.solicitud_id===id) || hayOtroModal()) return;
    return marcar(id,'ver');
  }
  function abrirCampana() {
    if (window.NotificacionesRevision?.disponible()) { window.NotificacionesRevision.abrirCampana(); return; }
    if(!vigenteUI()){navigateTo('notificaciones');return;}
    const dropdown=document.getElementById('notification-dropdown');
    dropdown?.classList.toggle('hidden'); pintar(); sincronizar();
  }
  function preparar() {
    if(preparado)return; preparado=true;
    window.supabaseClient.auth.onAuthStateChange((evento,sesion)=>{
      if(evento==='SIGNED_OUT' || usuario && sesion?.user?.id!==usuario){detener();return;}
      if(['SIGNED_IN','TOKEN_REFRESHED'].includes(evento))setTimeout(()=>{actualizarSesion();if(usuario)programarConsulta();},0);
    });
    window.addEventListener('online',()=>{actualizarSesion();if(usuario){abrirCanal();sincronizar();}});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){actualizarSesion();if(usuario){abrirCanal();sincronizar();}}});
    window.addEventListener('pagehide',()=>detener());
    window.addEventListener('pageshow',()=>actualizarSesion());
    new MutationObserver(()=>programarMostrar()).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','open']});
  }
  return {actualizarSesion,detener,sincronizar,pintar,contenidoLista,abrirCampana,abrirAviso,responder};
})();

// SOL-07C: el mismo desplegable tiene un modo personal, sin avisos administrativos.
window.NotificacionesRevision = (function () {
  let usuario = null, identidad = null, canal = null, generacion = 0, filas = [], error = '';
  let lectura = null, repetir = false, accion = false, programada = null, reconexion = null, toastTimer = null;
  const mostradas = new Set();
  const lecturasConfirmadas = new Set();
  // Solo controla el emergente local; nunca representa lectura ni autorización.
  const LIMITE_RECHAZOS_MOSTRADOS = 2000;
  let rechazosMostrados = new Map();
  function claveRechazosMostrados() {
    if (!usuario || usuario !== state.currentUser?.id) return null;
    const url = window.supabaseClient?.supabaseUrl || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : window.location.origin);
    return 'hotel-rechazos-mostrados-v1:' + new URL(url).host + ':' + usuario;
  }
  function leerRechazosMostrados() {
    try {
      const clave = claveRechazosMostrados();
      const datos = clave ? JSON.parse(localStorage.getItem(clave) || '[]') : [];
      if (!Array.isArray(datos)) return new Map();
      return new Map(datos.filter(f => Array.isArray(f) && f.length === 2 && typeof f[0] === 'string' && f[0].length > 0 && f[0].length <= 128 && Number.isFinite(f[1]) && f[1] > 0)
        .sort((a,b) => a[1] - b[1]).slice(-LIMITE_RECHAZOS_MOSTRADOS));
    } catch (_) { return new Map(); }
  }
  function actualizarRechazosMostrados() {
    // Incorporar registros de otras pestañas antes de decidir o escribir.
    for (const [id,fecha] of leerRechazosMostrados()) rechazosMostrados.set(id,fecha);
    rechazosMostrados = new Map([...rechazosMostrados].sort((a,b) => a[1] - b[1]).slice(-LIMITE_RECHAZOS_MOSTRADOS));
  }
  function rechazoYaMostrado(id) {
    return mostradas.has(id) || rechazosMostrados.has(id);
  }
  function registrarRechazoMostrado(id) {
    if (typeof id !== 'string' || !id || id.length > 128) { mostradas.add(id); return; }
    actualizarRechazosMostrados();
    mostradas.add(id); rechazosMostrados.set(id,Date.now());
    rechazosMostrados = new Map([...rechazosMostrados].sort((a,b) => a[1] - b[1]).slice(-LIMITE_RECHAZOS_MOSTRADOS));
    try {
      const clave = claveRechazosMostrados();
      if (clave) localStorage.setItem(clave,JSON.stringify([...rechazosMostrados]));
    } catch (_) { /* Almacenamiento bloqueado/lleno: mantener deduplicación en memoria. */ }
  }
  let focoAviso = null, rechazoPendiente = null, avisoModal = null, observadorAviso = null, mostrarProgramado = false;
  const destinataria = () => !!state.currentUser?.id && !esCuentaSinRol() && state.currentUser.role === 'RECEPCION';
  const disponible = () => destinataria() && !esAdminOperativoActual();
  const vigente = token => token === generacion && usuario === state.currentUser?.id && destinataria();
  const esc = valor => String(valor ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fecha = valor => formatearFechaCL(valor,{hora:true,vacio:'Fecha no disponible'});
  const iconoAccion = tipo => '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(tipo==='ver'?'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>':'<path d="m5 12 4 4L19 6"/>')+'</svg>';
  function pintar() {
    if (!disponible()) return;
    const pendientes=filas.filter(f=>f.leida_en===null);
    const lista = document.getElementById('topbar-notif-list');
    if (lista) lista.innerHTML = (error ? '<p role="status" class="text-sm alm-muted">' + esc(error) + '</p><button type="button" onclick="NotificacionesRevision.sincronizar()" class="text-sm font-bold">Reintentar consulta</button>' : '') + (!pendientes.length ? '<p class="text-sm alm-muted">' + (error ? '' : lectura ? 'Cargando notificaciones…' : 'No tienes notificaciones pendientes.') + '</p>' : pendientes.map(f => '<article class="revision-notificacion p-3 rounded-xl space-y-2 ' + (f.leida_en===null?'revision-notificacion-pendiente':'revision-notificacion-leida') + '" style="border:1px solid var(--alm-border);overflow-wrap:anywhere"><h3 class="text-sm font-bold">Solicitud ' + esc(f.resultado) + '</h3><span class="revision-notificacion-lectura">' + (f.leida_en===null?'No leída':'Leída') + '</span><p class="text-sm">' + esc(f.solicitud?.tipo_problema || 'Problema no disponible') + ' · ' + esc(f.solicitud?.ubicacion || 'Ubicación no disponible') + '</p><p class="text-xs alm-muted">Revisada: ' + esc(fecha(f.revisada_en)) + '</p>' + (f.revisor_nombre_acreditado ? '<p class="text-xs alm-muted">Revisada por ' + esc(f.revisor_nombre_acreditado) + '</p>' : '') + (f.resultado === 'rechazada' ? '<p class="text-sm" style="white-space:pre-wrap">Motivo: ' + esc(f.motivo || 'Sin motivo registrado') + '</p>' : '') + '<div class="revision-notificacion-acciones"><button type="button" data-notificacion="' + esc(f.id) + '" onclick="NotificacionesRevision.abrir(this.dataset.notificacion)" ' + (accion ? 'disabled' : '') + ' class="alm-btn-primary revision-notificacion-accion">' + iconoAccion('ver') + '<span>Ver solicitud</span></button>' + (f.leida_en === null ? '<button type="button" data-notificacion="' + esc(f.id) + '" onclick="NotificacionesRevision.marcar(this.dataset.notificacion)" ' + (accion ? 'disabled' : '') + ' class="alm-btn-secondary revision-notificacion-accion">' + iconoAccion('leida') + '<span>Marcar leída</span></button>' : '') + '</div></article>').join(''));
    const cantidad = pendientes.length;
    const badge = document.getElementById('topbar-notif-badge');
    if (badge) { badge.textContent = cantidad ? String(cantidad) : ''; badge.style.display = cantidad ? 'inline-flex' : 'none'; badge.classList.toggle('hidden',!cantidad); }
    const lateral = document.getElementById('badge-nav-notif-count');
    if (lateral) { lateral.textContent = ''; lateral.classList.add('hidden'); }
    document.getElementById('btn-notification-dropdown')?.setAttribute('aria-label', error ? 'Notificaciones personales: error de consulta' : cantidad + ' notificaciones personales sin leer');
    document.querySelector('#notification-dropdown > div:last-child')?.classList.add('hidden');
  }
  function dejarDeEsperar() {
    observadorAviso?.disconnect(); observadorAviso = null;
    for (const evento of ['input','change','reset','focusout']) document.removeEventListener(evento, programarRechazo, true);
  }
  function cerrarAviso(descartarPendiente = true) {
    const pendiente = descartarPendiente ? null : rechazoPendiente;
    clearTimeout(toastTimer); toastTimer = null;
    rechazoPendiente = null; dejarDeEsperar();
    const nodo = document.getElementById('revision-solicitud-aviso');
    const devolverFoco = nodo?.contains(document.activeElement);
    nodo?.remove();
    if (avisoModal) {
      avisoModal.fondos.forEach(({el,inert}) => { el.inert = inert; });
      document.body.style.overflow = avisoModal.overflow;
      document.removeEventListener('keydown', tecladoRechazo, true);
      avisoModal = null;
    }
    if (devolverFoco && focoAviso?.isConnected) focoAviso.focus();
    focoAviso = null;
    if (pendiente) posponerRechazo(pendiente);
  }
  function tecladoRechazo(e) {
    if (!avisoModal) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key !== 'Tab') return;
    const controles = [...avisoModal.nodo.querySelectorAll('button:not(:disabled),[tabindex="0"]')];
    const primero = controles[0], ultimo = controles.at(-1);
    if (!avisoModal.nodo.contains(document.activeElement) || e.shiftKey && document.activeElement === primero || !e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault(); (e.shiftKey ? ultimo : primero).focus();
    }
  }
  function puedeMostrarRechazo() {
    if (document.visibilityState !== 'visible' || document.documentElement.classList.contains('auth-pending') || accion) return false;
    const visible = el => !el.hidden && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0;
    if ([...document.querySelectorAll('[role="dialog"],[aria-modal="true"],[id^="modal-"],.fixed.inset-0,dialog[open]')].some(visible)) return false;
    return ![...document.querySelectorAll('#view-container form')].filter(visible).some(form => {
      if (form.contains(document.activeElement) || form.querySelector('fieldset:disabled,[aria-busy="true"]')) return true;
      return [...form.querySelectorAll('input,textarea,select')].filter(el => !el.disabled).some(el => {
        if (['submit','button','reset','hidden'].includes(el.type)) return false;
        if (['checkbox','radio'].includes(el.type)) return el.checked !== el.defaultChecked;
        if (el.type === 'file') return el.files.length > 0;
        if (el.tagName === 'SELECT') {
          const originales = [...el.options].filter(o => o.defaultSelected).map(o => o.value);
          if (!originales.length && el.options.length && !el.multiple) originales.push(el.options[0].value);
          return JSON.stringify([...el.selectedOptions].map(o => o.value)) !== JSON.stringify(originales);
        }
        return el.value !== el.defaultValue;
      });
    });
  }
  function programarRechazo() {
    if (!rechazoPendiente || mostrarProgramado || avisoModal) return;
    mostrarProgramado = true;
    requestAnimationFrame(() => {
      mostrarProgramado = false;
      if (!rechazoPendiente || !puedeMostrarRechazo() || !usuario || !destinataria()) return;
      const f = filas.find(f => f.id === rechazoPendiente.id && f.leida_en === null);
      rechazoPendiente = null; dejarDeEsperar();
      actualizarRechazosMostrados();
      if (f && !rechazoYaMostrado(f.id)) avisar([f], true);
    });
  }
  function posponerRechazo(f) {
    rechazoPendiente = f; // Solo el más reciente pendiente; el resto sigue en la campana.
    if (!observadorAviso) {
      observadorAviso = new MutationObserver(programarRechazo);
      observadorAviso.observe(document.body,{ childList:true, subtree:true, attributes:true, attributeFilter:['class','hidden','open','style','disabled'] });
      for (const evento of ['input','change','reset','focusout']) document.addEventListener(evento, programarRechazo, true);
    }
    programarRechazo();
  }
  function programarCierreAviso(milisegundos) {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => cerrarAviso(false), milisegundos);
  }
  function avisar(nuevas, preparada = false) {
    if (!nuevas.length) return;
    // Un solo aviso visible; el resto permanece en la campana, sin otra cola.
    const f = nuevas.find(f => f.resultado === 'rechazada') || nuevas[0];
    actualizarRechazosMostrados();
    if (f.resultado === 'rechazada' && rechazoYaMostrado(f.id)) return;
    if (avisoModal) return;
    if (f.resultado === 'rechazada' && !preparada && !puedeMostrarRechazo()) { posponerRechazo(f); return; }
    let nodo = document.getElementById('revision-solicitud-aviso');
    if(!nodo){nodo=document.createElement('div');nodo.id='revision-solicitud-aviso';document.body.appendChild(nodo);}
    clearTimeout(toastTimer);toastTimer=null;
    nodo.dataset.notificacion=f.id;
    nodo.className='alm-ui alm-panel alm-revision-toast'+(f.resultado==='rechazada'?' alm-revision-toast-rechazo':'');
    nodo.style.cssText='';nodo.setAttribute('role','status');nodo.setAttribute('aria-live','polite');nodo.setAttribute('aria-atomic','true');
    const titulo=f.resultado==='rechazada'?'Solicitud rechazada':'Solicitud aprobada';
    const actor=f.revisor_nombre_acreditado || 'Administración';
    nodo.innerHTML='<div><strong>'+esc(titulo)+'</strong><p>'+esc(f.solicitud?.tipo_problema||'Consulta tu solicitud')+'</p><p class="alm-muted text-xs">Revisada por '+esc(actor)+'</p></div><button type="button" data-revision-cerrar aria-label="Cerrar aviso">✕</button><button type="button" data-revision-consultar class="alm-btn-secondary">Ver solicitud</button>';
    nodo.querySelector('[data-revision-cerrar]').onclick=()=>cerrarAviso();
    nodo.querySelector('[data-revision-consultar]').onclick=()=>{const id=nodo.dataset.notificacion;cerrarAviso();actuar(id,true);};
    // No foco, inert ni bloqueo de la página. Cerrar nunca marca la campana como leída.
    const token=generacion;
    requestAnimationFrame(()=>{
      if(!vigente(token)||document.getElementById('revision-solicitud-aviso')!==nodo||nodo.dataset.notificacion!==f.id)return;
      if(document.visibilityState!=='visible'){cerrarAviso();if(f.resultado==='rechazada')posponerRechazo(f);return;}
      if(f.resultado==='rechazada')registrarRechazoMostrado(f.id);
      programarCierreAviso(2000);
    });
  }

  function detener(limpiar = false) {
    generacion++; usuario = null; filas = []; error = ''; lectura = null; repetir = false; accion = false;
    clearTimeout(programada); clearTimeout(reconexion); clearTimeout(toastTimer); programada = reconexion = toastTimer = null;
    cerrarAviso();
    const anterior = canal; canal = null;
    if (anterior) Promise.resolve(window.supabaseClient.removeChannel(anterior)).catch(() => {});
    if (limpiar) { identidad = null; mostradas.clear(); rechazosMostrados.clear(); lecturasConfirmadas.clear(); }
  }
  function programar() { if (usuario && !programada) programada = setTimeout(() => { programada = null; sincronizar(); },100); }
  async function sincronizar() {
    if (!usuario || !destinataria()) return;
    if (lectura) { repetir = true; return lectura; }
    const token = generacion;
    const tarea = (async () => {
      do {
        repetir = false;
        try {
          const anteriores = new Map(filas.map(f => [f.id,JSON.stringify([f.resultado,f.revisada_en,f.motivo])]));
          const actuales = await window.NotificacionesRevisionService.listar();
          if (!vigente(token)) return;
          filas = actuales.filter(f=>!lecturasConfirmadas.has(f.id)); error = '';
          const cambios = filas.filter(f => anteriores.get(f.id) !== JSON.stringify([f.resultado,f.revisada_en,f.motivo])).map(f => f.solicitud_id);
          actualizarRechazosMostrados();
          const nuevas = filas.filter(f => f.leida_en === null && (f.resultado === 'rechazada' ? !rechazoYaMostrado(f.id) : !mostradas.has(f.id)));
          filas.filter(f => f.resultado !== 'rechazada').forEach(f => mostradas.add(f.id));
          pintar(); avisar(nuevas);
          if (cambios.length && typeof solicitudesSincronizarRevision === 'function') await solicitudesSincronizarRevision(cambios);
        } catch (e) { if (vigente(token)) { error = 'No se pudieron consultar las notificaciones personales. ' + (e.message || 'Error de conexión.'); pintar(); } }
      } while (repetir && vigente(token));
      return vigente(token) && !error;
    })();
    lectura = tarea;
    try { return await tarea; } finally { if (lectura === tarea) { lectura = null; if (vigente(token)) pintar(); } }
  }
  function conectar() {
    if (!usuario || canal || !destinataria()) return;
    const token = generacion, nuevo = window.supabaseClient.channel('revision-solicitudes-' + usuario);
    canal = nuevo;
    nuevo.on('postgres_changes',{ event:'INSERT',schema:'public',table:'solicitudes_notificaciones_revision',filter:'destinatario_id=eq.' + usuario }, () => { if (vigente(token)) programar(); })
      .subscribe(estado => {
        if (!vigente(token) || canal !== nuevo) return;
        if (estado === 'SUBSCRIBED') { clearTimeout(reconexion); reconexion = null; programar(); }
        else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(estado) && !reconexion) {
          error = 'Conexión de notificaciones personales interrumpida; reconectando.'; pintar();
          reconexion = setTimeout(() => {
            reconexion = null;
            if (!vigente(token) || canal !== nuevo) return;
            canal = null;
            Promise.resolve(window.supabaseClient.removeChannel(nuevo)).catch(() => {}).finally(() => { if (vigente(token)) conectar(); });
          },3000);
        }
      });
  }
  function actualizarSesion() {
    if (!destinataria()) { if (usuario) detener(); return; }
    if (identidad !== state.currentUser.id) { detener(true); identidad = state.currentUser.id; }
    if (usuario === state.currentUser.id) { pintar(); return; }
    usuario = state.currentUser.id; conectar(); programar();
  }
  function detalleNoDisponible() {
    const raiz = document.getElementById('view-container');
    if (!raiz) return;
    let mensaje = raiz.querySelector('[data-solicitudes-confirmacion],[data-revision-detalle-error]');
    if (!mensaje) { mensaje = document.createElement('p'); mensaje.dataset.revisionDetalleError = ''; mensaje.className = 'alm-ui p-4'; mensaje.setAttribute('role','status'); raiz.prepend(mensaje); }
    mensaje.textContent = 'No se pudo abrir el detalle. La notificación sigue disponible en la campana.';
  }
  async function actuar(id, abrirSolicitud, desdeRechazo = false) {
    if (accion || !usuario || !destinataria()) return;
    const f = filas.find(f => f.id === id);
    if (!f) return;
    const token = generacion; accion = true; error = ''; pintar();
    try {
      if (f.leida_en === null) await window.NotificacionesRevisionService.marcar(id);
      if (!vigente(token)) return;
      // Solo retirar tras confirmación persistida; una lectura anterior en vuelo no debe reinsertarla.
      lecturasConfirmadas.add(id);filas=filas.filter(f=>f.id!==id);pintar();
      if (abrirSolicitud) {
        document.getElementById('notification-dropdown')?.classList.add('hidden');
        if (currentView !== 'solicitudes') navigateTo('solicitudes');
        requestAnimationFrame(() => {
          const boton = document.getElementById('solicitudes-vista')?.querySelector('[data-solicitudes-actualizar]');
          if (!vigente(token)) return;
          if (!desdeRechazo) { if (boton) solicitudesAbrirDetalle(boton,-1,f.solicitud_id); return; }
          try {
            if (!boton || typeof solicitudesAbrirDetalle !== 'function') { detalleNoDisponible(); return; }
            Promise.resolve(solicitudesAbrirDetalle(boton,-1,f.solicitud_id)).catch(() => { if (vigente(token)) detalleNoDisponible(); });
          } catch (_) { if (vigente(token)) detalleNoDisponible(); }
        });
      }
      await sincronizar();
    } catch (e) { if (vigente(token)) { error = 'No se pudo confirmar la lectura. ' + (e.message || 'Error de conexión.'); pintar(); if (desdeRechazo) detalleNoDisponible(); } }
    finally { if (vigente(token)) { accion = false; pintar(); } }
  }
  function abrirCampana() {
    if (!disponible()) return;
    cerrarAviso();
    document.getElementById('notification-dropdown')?.classList.toggle('hidden');
    pintar(); sincronizar();
  }
  window.supabaseClient.auth.onAuthStateChange((evento,sesion) => {
    if (evento === 'SIGNED_OUT' || identidad && sesion?.user?.id && identidad !== sesion.user.id) detener(true);
  });
  window.addEventListener('online', () => { actualizarSesion(); programar(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { actualizarSesion(); programar(); programarRechazo(); } });
  window.addEventListener('pagehide', () => detener());
  window.addEventListener('pageshow', () => { actualizarSesion(); programar(); });
  return { disponible, actualizarSesion, detener, pintar, sincronizar, cerrarAviso, abrirCampana, abrir:id=>actuar(id,true), marcar:id=>actuar(id,false) };
})();


// Broadcast público: únicamente invalidación genérica, nunca datos ni autoridad de borrado.
// No hay políticas privadas confirmadas; no se usan postgres_changes de tablas no publicadas.
window.SolicitudesSincronizacion = (function () {
  let usuario = null, canal = null, generacion = 0, listo = false, conexionIniciada = false, revisionLectura = 0;
  let temporizador = null, reconexion = null, trabajo = null, pendiente = false, pendienteReactiva = false, diferida = false, diferidaReactiva = false, ultimoInicio = 0, observador = null;
  const habilitado = () => !!state.currentUser?.id && !esCuentaSinRol() && (esAdminOperativoActual() || state.currentUser.role==='TECNICO' && hasAccess('areas',state.currentUser.role));
  const vigente = token => generacion === token && usuario === state.currentUser?.id && habilitado();
  function detener() {
    generacion++; usuario = null; listo = false; conexionIniciada = false; revisionLectura = 0; pendiente = pendienteReactiva = diferida = diferidaReactiva = false; trabajo = null; ultimoInicio = 0;
    clearTimeout(temporizador); clearTimeout(reconexion); temporizador = reconexion = null;
    observador?.disconnect(); observador = null;
    const anterior = canal; canal = null;
    if (anterior) Promise.resolve(window.supabaseClient.removeChannel(anterior)).catch(() => {});
  }
  function programar(motivo = 'cambio', soloReactiva = false) {
    if (!habilitado() || usuario !== state.currentUser?.id) { detener(); return; }
    if (motivo !== 'pendiente') revisionLectura++;
    if(soloReactiva)pendienteReactiva=true;else pendiente=true;
    if (document.visibilityState === 'hidden' || trabajo || temporizador) return;
    // Agrupa ráfagas y limita el coste de señales públicas no confiables.
    const espera = Math.max(200, 1500 - (Date.now() - ultimoInicio));
    temporizador = setTimeout(() => { temporizador = null; revalidar(); }, espera);
  }
  async function revalidar() {
    if ((!pendiente && !pendienteReactiva) || trabajo || !habilitado() || document.visibilityState === 'hidden') return;
    const token = generacion, id = usuario;
    const soloReactiva=(!pendiente && pendienteReactiva) || !esAdminOperativoActual();
    diferida=false;
    pendiente = pendienteReactiva = false; ultimoInicio = Date.now();
    const tarea = (async () => {
      let autorizado = false;
      try {
        if(soloReactiva && !reactivaVistaActual(document.getElementById('reactiva-vista')))return;
        const auth = await window.SolicitudesService.usuarioActual();
        if (!vigente(token) || auth.id !== id) return;
        autorizado = soloReactiva && state.currentUser?.role==='TECNICO' ? hasAccess('areas',state.currentUser.role) : await revalidarPrivilegioParaEscritura();
        if (!vigente(token)) return;
        if (!autorizado || !habilitado()) { detener(); return; }
        const aplazada = await (soloReactiva ? reactivaRevalidarInterfazRemota(id, () => vigente(token)) : solicitudesRevalidarInterfazRemota(id, () => vigente(token)));
        if (vigente(token)) {diferida = aplazada;diferidaReactiva=soloReactiva;}
      } catch (error) {
        // No inferir ausencia ante red/Auth/RLS; los controles existentes permiten reconsulta.
        if (vigente(token)) {
          if (!autorizado) detener();
          const mensaje = document.querySelector('[data-solicitudes-confirmacion]') || document.querySelector('[data-reactiva-estado]');
          if (mensaje) mensaje.textContent = 'No se pudo verificar el cambio de otra sesión. Actualiza la información al recuperar la conexión.';
        }
      }
    })();
    trabajo = tarea;
    try { await tarea; } finally {
      if (trabajo === tarea) {
        trabajo = null;
        if (vigente(token) && diferida && !solicitudesFichaProtegidaSincronizacion()) { diferida = false; if(diferidaReactiva)pendienteReactiva=true;else pendiente=true; }
        if (vigente(token) && (pendiente || pendienteReactiva)) programar('pendiente',!pendiente);
      }
    }
  }
  function conectar() {
    if (!habilitado() || !usuario || canal) return;
    const token = generacion;
    const nuevo = window.supabaseClient.channel('hotel-solicitudes-invalidacion-v1', {
      config: { private: false, broadcast: { ack: true, self: false } }
    });
    canal = nuevo;
    nuevo.on('broadcast', { event: 'invalidate' }, mensaje => {
      if (!esAdminOperativoActual() || !vigente(token) || canal !== nuevo) return;
      const p = mensaje?.payload;
      if (!p || p.v !== 1 || Object.keys(p).length !== 1) return;
      programar();
    }).on('broadcast', {event:'reactiva-invalidate'}, mensaje=>{
      if(!vigente(token)||canal!==nuevo)return;
      const p=mensaje?.payload;
      if(!p||p.v!==1||Object.keys(p).length!==1)return;
      programar('cambio',true);
    }).subscribe(estado => {
      if (!vigente(token) || canal !== nuevo) return;
      const estabaListo = listo;
      listo = estado === 'SUBSCRIBED';
      if (listo) {
        clearTimeout(reconexion); reconexion = null;
        if (estabaListo) return;
        const motivo = conexionIniciada ? 'reconexion' : 'inicial';
        conexionIniciada = true;
        programar(motivo);
      }
      else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(estado) && !reconexion) {
        reconexion = setTimeout(() => {
          reconexion = null;
          if (!vigente(token) || canal !== nuevo) return;
          canal = null;
          Promise.resolve(window.supabaseClient.removeChannel(nuevo)).catch(() => {}).finally(() => { if (vigente(token)) conectar(); });
        }, 3000);
      }
    });
  }
  function actualizarSesion() {
    if (!habilitado()) { detener(); return; }
    if (usuario === state.currentUser.id && canal) return;
    detener(); usuario = state.currentUser.id; conectar();
    // Solo despierta una lectura aplazada cuando termina una escritura en curso.
    observador = new MutationObserver(() => {
      if (diferida && !trabajo && !solicitudesFichaProtegidaSincronizacion()) { diferida = false; programar('cambio',diferidaReactiva); }
    });
    observador.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled','hidden','class'] });
  }
  async function emitirConfirmada(evento = 'invalidate') {
    if(!['invalidate','reactiva-invalidate'].includes(evento))return false;
    try {
      if (!habilitado() || !esAdminOperativoActual()) return false;
      actualizarSesion();
      if (!listo || !canal) return false;
      const token = generacion, actual = canal;
      const resultado = await actual.send({ type: 'broadcast', event: evento, payload: { v: 1 } });
      return vigente(token) && canal === actual && resultado === 'ok';
    } catch (error) { return false; }
  }
  function recuperar() { actualizarSesion(); if (usuario) programar(); }
  window.supabaseClient.auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'SIGNED_OUT' || usuario && sesion?.user?.id && sesion.user.id !== usuario) detener();
    else if (['SIGNED_IN','TOKEN_REFRESHED'].includes(evento)) setTimeout(recuperar, 0);
  });
  window.addEventListener('online', recuperar);
  window.addEventListener('pageshow', recuperar);
  window.addEventListener('pagehide', detener);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recuperar(); });
  // Marca efímera de cobertura, sin datos ni autoridad de permisos.
  function marcaLectura() { return listo && usuario === state.currentUser?.id && habilitado() ? `${generacion}:${revisionLectura}` : null; }
  return { actualizarSesion, detener, emitirConfirmada, emitirReactivaConfirmada:()=>emitirConfirmada('reactiva-invalidate'), marcaLectura };
})();
