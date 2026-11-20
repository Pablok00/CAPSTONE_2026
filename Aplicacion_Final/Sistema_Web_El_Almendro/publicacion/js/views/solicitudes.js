const solicitudesContextos = new WeakMap();
// Diálogo compartido por ambas fichas; el servicio es la única entrada a la RPC.
let solicitudesEliminacion = null;
let solicitudesUltimoRefresco = null;
function solicitudesEliminarActual() { return solicitudesAbrirEliminacion('solicitudes', solicitudesDetalle); }
function reactivaEliminarActual() { return solicitudesAbrirEliminacion('reactiva', reactivaDetalle); }
async function solicitudesAbrirEliminacion(origen, ficha) {
  if (solicitudesEliminacion || !ficha?.registro || ficha.invalidada || ficha.ocupada || ficha.trabajadorAbierto || !esAdminPermanenteActual()) return;
  const vigente = () => !ficha.invalidada && ficha.usuarioId === state.currentUser?.id && esAdminPermanenteActual() &&
    (origen === 'solicitudes' ? solicitudesDetalle === ficha && solicitudesVistaActual(ficha.raiz) : reactivaDetalle === ficha && reactivaVistaActual(ficha.raiz));
  if (!vigente()) return;
  const contexto = { origen, usuarioId: ficha.usuarioId, solicitudId: origen === 'reactiva' ? ficha.registro.solicitud_id : ficha.registro.id, mantencionId: origen === 'reactiva' ? ficha.registro.id : null, vigente };
  const dialogo = document.createElement('div');
  dialogo.className = 'alm-ui fixed inset-0 flex items-center justify-center p-4';
  dialogo.style.cssText = 'z-index:70;background:rgba(2,6,23,.7)';
  dialogo.setAttribute('role','dialog'); dialogo.setAttribute('aria-modal','true');
  dialogo.setAttribute('aria-labelledby','solicitudes-eliminacion-titulo');
  dialogo.innerHTML = '<section class="alm-panel w-full max-w-2xl p-5 space-y-4" style="max-height:90vh;overflow-y:auto;overflow-wrap:anywhere"><h2 id="solicitudes-eliminacion-titulo" class="alm-title">Eliminación definitiva</h2><div data-eliminacion-datos></div><p>Esta eliminación es definitiva. Los registros vinculados serán eliminados y no podrán recuperarse desde la aplicación.</p><form onsubmit="solicitudesConfirmarEliminacion(event)" class="space-y-4 alm-delete-form"><fieldset disabled class="space-y-4"><label class="block text-sm">Motivo de eliminación (10 a 1000 caracteres)<textarea name="motivo" required maxlength="1000" rows="3" oninput="solicitudesValidarEliminacion()" class="w-full rounded-xl px-3 py-2" style="background:var(--alm-inset);color:var(--alm-text);border:1px solid var(--alm-border)"></textarea></label><label class="block text-sm">Escribe exactamente ELIMINAR DEFINITIVAMENTE<input name="confirmacion" required autocomplete="off" oninput="solicitudesValidarEliminacion()" class="w-full rounded-xl px-3 py-2" style="background:var(--alm-inset);color:var(--alm-text);border:1px solid var(--alm-border)"></label><div data-eliminacion-reforzada hidden><p>Esta mantención tiene o ha tenido asignaciones, ejecución o historial de trabajo. Su eliminación definitiva también eliminará los registros operativos vinculados.</p><label class="block text-sm mt-3"><input name="trabajo" type="checkbox" onchange="solicitudesValidarEliminacion()"> Confirmo que comprendo que se eliminará una mantención con trabajo asignado, realizado o registrado históricamente.</label></div><button type="submit" disabled class="alm-btn-danger"><svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg><span>Eliminar definitivamente</span></button></fieldset><p data-eliminacion-mensaje role="status" aria-live="polite"><span style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0">Consultando estado e historial…</span></p><button type="button" hidden data-eliminacion-reintentar onclick="solicitudesReintentarLecturaEliminacion()" class="alm-btn-secondary">Volver a consultar</button><button type="button" data-eliminacion-cancelar onclick="solicitudesCerrarEliminacion()" class="alm-btn-secondary">Cancelar</button></form></section>';
  const d = { contexto, ficha, vigente, dialogo, foco: document.activeElement, cargando: false, ocupada: false, incierta: false };
  solicitudesEliminacion = d;
  ficha.ocupada = true; ficha.dialogo.inert = true;
  document.body.appendChild(dialogo);
  document.addEventListener('keydown',solicitudesEliminacionTeclado,true);
  dialogo.querySelector('[data-eliminacion-cancelar]').focus();
  return solicitudesConsultarEliminacion(d);
}
function solicitudesReintentarLecturaEliminacion() {
  return solicitudesConsultarEliminacion(solicitudesEliminacion);
}
async function solicitudesConsultarEliminacion(d) {
  if (!d || solicitudesEliminacion !== d || !d.dialogo.isConnected || d.cargando || d.ocupada || d.incierta || d.lista) return;
  const { dialogo, contexto } = d;
  const mensaje = dialogo.querySelector('[data-eliminacion-mensaje]');
  const reintentar = dialogo.querySelector('[data-eliminacion-reintentar]');
  d.cargando = true;
  dialogo.querySelector('fieldset').disabled = true;
  dialogo.querySelector('[type="submit"]').disabled = true;
  reintentar.hidden = true;
  mensaje.innerHTML = '<span style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0">Consultando estado e historial…</span>';
  try {
    if (!d.vigente()) throw new Error('La sesión o la vista cambió. Cierra y vuelve a consultar.');
    const datos = await window.SolicitudesService.prepararEliminacion(contexto);
    if (solicitudesEliminacion !== d || !dialogo.isConnected) return;
    if (!d.vigente()) throw new Error('La sesión o la vista cambió. Cierra y vuelve a consultar.');
    if (!datos?.solicitud || typeof datos.reforzada !== 'boolean') throw new Error('No se pudo comprobar el estado o el historial. Vuelve a consultar.');
    d.reforzada = datos.reforzada;
    const r = datos.solicitud;
    dialogo.querySelector('[data-eliminacion-datos]').innerHTML = '<p><strong>' + solicitudesEscape(r.tipo_problema) + '</strong></p><p>' + solicitudesEscape(r.ubicacion) + '</p><p>Solicitud: ' + solicitudesEscape(r.estado) + (datos.mantencion ? ' · Mantención: ' + solicitudesEscape(datos.mantencion.estado) : '') + '</p>';
    dialogo.querySelector('[data-eliminacion-reforzada]').hidden = !d.reforzada;
    dialogo.querySelector('fieldset').disabled = false;
    d.lista = true;
    solicitudesValidarEliminacion();
    dialogo.querySelector('textarea').focus();
  } catch (error) {
    if (solicitudesEliminacion === d && dialogo.isConnected) {
      d.lista = false;
      dialogo.querySelector('fieldset').disabled = true;
      dialogo.querySelector('[type="submit"]').disabled = true;
      mensaje.textContent = 'No se puede iniciar la eliminación. ' + (error.message || 'Error de conexión.') + ' Puedes volver a consultar sin eliminar ningún registro.';
      reintentar.hidden = false;
    }
  } finally { d.cargando = false; }
}
function solicitudesEliminacionTeclado(event) {
  const d = solicitudesEliminacion;
  if (!d) return;
  if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); return; }
  if (event.key !== 'Tab') return;
  event.stopImmediatePropagation();
  const elementos = [...d.dialogo.querySelectorAll('button,input,textarea')].filter(el => !el.disabled && !el.closest('fieldset:disabled') && el.getClientRects().length);
  const primero = elementos[0], ultimo = elementos[elementos.length - 1];
  if (!primero) { event.preventDefault(); return; }
  if (event.shiftKey && document.activeElement === primero) { event.preventDefault(); ultimo.focus(); }
  else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primero.focus(); }
}
function solicitudesValidarEliminacion() {
  const d = solicitudesEliminacion;
  if (!d?.lista || d.ocupada || d.incierta) return false;
  const form = d.dialogo.querySelector('form'), motivo = form.elements.motivo.value.trim();
  const mensaje = !d.vigente() ? 'La sesión o los permisos cambiaron. Cierra y vuelve a consultar.' : motivo.length < 10 || motivo.length > 1000 ? 'El motivo debe tener entre 10 y 1000 caracteres después de quitar espacios exteriores.' : window.SolicitudesService.normalizarConfirmacion(form.elements.confirmacion.value) !== 'ELIMINAR DEFINITIVAMENTE' ? 'Escribe exactamente ELIMINAR DEFINITIVAMENTE.' : d.reforzada && !form.elements.trabajo.checked ? 'Confirma que comprendes la eliminación del trabajo y su historial.' : '';
  d.dialogo.querySelector('[type="submit"]').disabled = !!mensaje;
  d.dialogo.querySelector('[data-eliminacion-mensaje]').textContent = mensaje;
  return !mensaje;
}
function solicitudesLimpiarEliminacionRetirada(elemento) {
  const d = solicitudesEliminacion;
  // Una operación enviada conserva su bloqueo hasta resolver, aunque se retire la UI.
  if (!d || d.dialogo !== elemento || elemento.isConnected || d.ocupada) return;
  solicitudesEliminacion = null;
  document.removeEventListener('keydown',solicitudesEliminacionTeclado,true);
  d.ficha.dialogo.inert = false;
  d.ficha.ocupada = false;
}
function solicitudesCerrarEliminacion() {
  const d = solicitudesEliminacion;
  if (!d || d.ocupada) return;
  solicitudesEliminacion = null;
  document.removeEventListener('keydown',solicitudesEliminacionTeclado,true);
  d.dialogo.remove(); d.ficha.dialogo.inert = false; d.ficha.ocupada = false;
  if (d.incierta || !d.vigente()) {
    if (d.contexto.origen === 'solicitudes') solicitudesCerrarDetalle(); else reactivaCerrarFicha();
    if (d.incierta && d.contexto.usuarioId === state.currentUser?.id && d.ficha.raiz.isConnected) {
      const selector = d.contexto.origen === 'solicitudes' ? '[data-solicitudes-lista]' : '[data-reactiva-lista]';
      const lista = d.ficha.raiz.querySelector(selector);
      if (lista) lista.innerHTML = '';
      const c = d.contexto.origen === 'solicitudes' ? solicitudesContextos.get(d.ficha.raiz) : reactivaContextos.get(d.ficha.raiz);
      if (c) { c.registros = []; c.secuencia++; c.cargando = false; }
      const actualizar = d.ficha.raiz.querySelector(d.contexto.origen === 'solicitudes' ? '[data-solicitudes-actualizar]' : '[data-reactiva-actualizar]');
      if (actualizar) { actualizar.disabled = false; actualizar.focus(); }
      const estado = d.ficha.raiz.querySelector(d.contexto.origen === 'solicitudes' ? '[data-solicitudes-estado]' : '[data-reactiva-estado]');
      if (estado) estado.textContent = 'Resultado incierto. Pulsa Actualizar y verifica el estado real antes de continuar. Esta solicitud permanece bloqueada para nuevos envíos hasta recargar la página.';
    }
  } else if (d.foco?.isConnected) d.foco.focus();
}
async function solicitudesConfirmarEliminacion(event) {
  event.preventDefault();
  const d = solicitudesEliminacion;
  if (!d || !solicitudesValidarEliminacion()) return;
  const form = d.dialogo.querySelector('form');
  const motivo = form.elements.motivo.value, confirmacion = form.elements.confirmacion.value;
  const trabajo = d.reforzada && form.elements.trabajo.checked;
  d.ocupada = true;
  form.querySelector('fieldset').disabled = true;
  form.querySelector('[data-eliminacion-cancelar]').disabled = true;
  form.querySelector('[data-eliminacion-mensaje]').textContent = 'Procesando eliminación definitiva…';
  try {
    await window.SolicitudesService.eliminarDefinitiva(d.contexto,motivo,confirmacion,trabajo);
  } catch (error) {
    d.ocupada = false; d.incierta = !!error.incierto;
    form.querySelector('[data-eliminacion-cancelar]').disabled = false;
    form.querySelector('fieldset').disabled = d.incierta;
    form.querySelector('[data-eliminacion-mensaje]').textContent = error.message || 'No se pudo confirmar la operación. Cierra y reconsulta.';
    // No volver a ofrecer operaciones sobre una ficha potencialmente eliminada.
    if (d.incierta) form.querySelector('[data-eliminacion-cancelar]').textContent = 'Cerrar y verificar el estado';
    else form.querySelector('[type="submit"]').disabled = true;
    solicitudesLimpiarEliminacionRetirada(d.dialogo);
    return;
  }
  d.ocupada = false;
  solicitudesCerrarEliminacion();
  if (d.contexto.origen === 'solicitudes') solicitudesCerrarDetalle(); else reactivaCerrarFicha();
  if (d.contexto.usuarioId !== state.currentUser?.id) return;
  // Solo se alcanza después de validar el retorno; un fallo del aviso no reenvía la RPC.
  const avisoRemoto = window.SolicitudesSincronizacion?.emitirConfirmada();
  solicitudesUltimoRefresco = d;
  await solicitudesRefrescarEliminacion();
  if (avisoRemoto && await avisoRemoto === false && d.contexto.usuarioId === state.currentUser?.id && d.ficha.raiz.isConnected) {
    const mensaje = d.ficha.raiz.querySelector(d.contexto.origen === 'solicitudes' ? '[data-solicitudes-confirmacion]' : '[data-reactiva-estado]');
    if (mensaje) mensaje.append(' La eliminación ocurrió, pero no se pudo avisar a las otras sesiones. Se reconsultará al volver o reconectar.');
  }
}
function solicitudesFichaProtegidaSincronizacion() {
  const s = solicitudesDetalle, r = typeof reactivaDetalle === 'undefined' ? null : reactivaDetalle;
  return !!solicitudesEliminacion?.ocupada || !!s?.escrituraEnCurso || !!r?.escrituraEnCurso ||
    !!(r?.trabajadorAbierto && typeof trabajadorFormularioGuardando !== 'undefined' && trabajadorFormularioGuardando);
}
function solicitudesCerrarFichaInvalidada(ficha, deSolicitud) {
  if (solicitudesFichaProtegidaSincronizacion()) return false;
  const resultado = solicitudesEliminacion?.ficha === ficha && solicitudesEliminacion.incierta ? 'incierta' : ficha.resultadoEscritura;
  if (solicitudesEliminacion?.ficha === ficha) solicitudesCerrarEliminacion();
  if (!deSolicitud && ficha.trabajadorAbierto) {
    if (typeof cerrarTrabajadorFormulario === 'function') cerrarTrabajadorFormulario();
    ficha.trabajadorAbierto = false;
  }
  ficha.ocupada = false;
  if (deSolicitud) { if (solicitudesDetalle === ficha) solicitudesCerrarDetalle(); }
  else if (reactivaDetalle === ficha) reactivaCerrarFicha();
  const aviso = ficha.raiz.querySelector(deSolicitud ? '[data-solicitudes-confirmacion]' : '[data-reactiva-estado]');
  if (aviso) aviso.textContent = 'La ficha ya no está disponible. Los datos fueron actualizados';
  if (aviso && resultado === 'incierta') aviso.append(' El resultado de la operación anterior no quedó confirmado; no se reintentó automáticamente.');
  return true;
}
function solicitudesDecisionBloqueada(d) {
  return !d || d.invalidada || d.ocupada || d.revalidandoDecision || d.decisionNoVerificable || d.usuarioId!==state.currentUser?.id || !esAdminOperativoActual() || !solicitudesVistaActual(d.raiz) || !solicitudesPendiente(d.registro);
}
function solicitudesActualizarBloqueoDecision(d) {
  if(!d)return;
  const bloqueo=!!solicitudesDecisionBloqueada(d);
  d.dialogo.querySelector('[data-solicitudes-decision]')?.querySelectorAll('button').forEach(b=>b.disabled=bloqueo);
  const submit=d.rechazo?.dialogo.querySelector('[type="submit"]');if(submit)submit.disabled=bloqueo;
  for(const contenedor of [d.dialogo,d.rechazo?.dialogo]) {
    const boton=contenedor?.querySelector('[data-solicitudes-revalidar]');
    if(boton){boton.hidden=!d.decisionNoVerificable;boton.style.display=boton.hidden?'none':'';boton.disabled=!!d.revalidandoDecision||!!d.ocupada;}
  }
}
async function solicitudesRevalidarFicha(d, { trasDecision = false } = {}) {
  if(!d || solicitudesDetalle!==d || d.usuarioId!==state.currentUser?.id || !solicitudesVistaActual(d.raiz) || !esAdminOperativoActual())return false;
  if(!d.registro){d.revalidarAlAbrir=true;return true;}
  if(d.revalidacionDecision)return d.revalidacionDecision;
  if(d.escrituraEnCurso&&!trasDecision)return false;
  const firma=()=>JSON.stringify([state.currentUser?.id,state.currentUser?.role,state.currentUser?.esAdminPermanente,state.currentUser?.esAdminTemporal,state.currentUser?.adminTemporalHasta,state.currentUser?.permissions]);
  const permisos=firma();
  const vigente=()=>solicitudesDetalle===d && d.dialogo.isConnected && d.usuarioId===state.currentUser?.id && firma()===permisos && solicitudesVistaActual(d.raiz) && esAdminOperativoActual();
  d.revalidandoDecision=true;solicitudesActualizarBloqueoDecision(d);
  const tarea=(async()=>{
    try {
      const r=await window.SolicitudesService.obtener(d.id,{permitirAusente:true});
      if(!vigente())return false;
      if(r===null){d.invalidada=true;solicitudesCerrarFichaInvalidada(d,true);return false;}
      if(r.id!==d.id||!['pendiente','aprobada','rechazada'].includes(r.estado))throw Error('Respuesta incompleta');
      const anterior=d.registro.estado;
      const vinculo=d.dialogo.querySelector('[data-solicitudes-vinculo]')?.textContent||'';
      d.registro=r;d.decisionNoVerificable=false;
      solicitudesDetalleContenido(d);
      if(anterior===r.estado)d.dialogo.querySelector('[data-solicitudes-vinculo]').textContent=vinculo;
      if(!solicitudesPendiente(r)) {
        const texto=r.estado==='aprobada'?'Esta solicitud ya fue aprobada':'Esta solicitud ya fue rechazada';
        d.dialogo.querySelector('[data-solicitudes-decision-mensaje]').textContent='';
        if(d.rechazo)d.rechazo.dialogo.querySelector('[data-solicitudes-rechazo-error]').textContent=texto+'. Tu texto se conserva; cierra esta confirmación para consultar la ficha.';
        if(anterior==='pendiente' && typeof pvToastExito==='function')pvToastExito(texto,2000);
      }
      return true;
    } catch (_) {
      if(vigente()) {
        d.decisionNoVerificable=true;
        const texto='No se pudo verificar el estado de la solicitud. Actualiza antes de decidir; tu texto se conserva.';
        d.dialogo.querySelector('[data-solicitudes-decision-mensaje]').textContent=texto;
        if(d.rechazo)d.rechazo.dialogo.querySelector('[data-solicitudes-rechazo-error]').textContent=texto;
      }
      return false;
    } finally {d.revalidandoDecision=false;if(vigente())solicitudesActualizarBloqueoDecision(d);}
  })();
  d.revalidacionDecision=tarea;
  try{return await tarea;}finally{if(d.revalidacionDecision===tarea)d.revalidacionDecision=null;}
}
function solicitudesActualizarDetalle(){return solicitudesRevalidarFicha(solicitudesDetalle);}
async function solicitudesRevalidarInterfazRemota(usuarioId, vigente) {
  const solicitudes = document.getElementById('solicitudes-vista'), reactiva = document.getElementById('reactiva-vista');
  const tareas = [];
  const fichaSolicitudInicial=solicitudesDetalle;
  if(fichaSolicitudInicial && !fichaSolicitudInicial.escrituraEnCurso && fichaSolicitudInicial.usuarioId===usuarioId && solicitudesVistaActual(fichaSolicitudInicial.raiz))tareas.push(solicitudesRevalidarFicha(fichaSolicitudInicial));
  if (solicitudesVistaActual(solicitudes)) {
    const c = solicitudesContextos.get(solicitudes);
    if (c?.cargando) c.reconsultar = true;
    else tareas.push(solicitudesCargar(solicitudes));
  }
  if (reactivaVistaActual(reactiva)) tareas.push(reactivaCargar(reactiva, { remota: true }));
  const resumen = document.querySelector('#area-tarjetas [data-area="workarea_reactiva"]')?.closest('article')?.querySelector('.alm-area-values');
  if (resumen?.getClientRects().length && typeof areaCargarFuente === 'function') tareas.push((async () => {
    await areaCargarFuente('workarea_reactiva', true);
    if (vigente() && resumen.isConnected) resumen.innerHTML = areaTarjetaMetricasHTML('workarea_reactiva');
  })());
  if (window.AvisosSolicitudes) tareas.push(window.AvisosSolicitudes.sincronizar());
  if (window.NotificacionesRevision) tareas.push(window.NotificacionesRevision.sincronizar());
  const resultados = await Promise.allSettled(tareas);
  if (!vigente()) return false;
  const fallo = resultados.some(r => r.status === 'rejected' || r.value === false);
  if (fallo) {
    const aviso = solicitudesVistaActual(solicitudes) ? solicitudes.querySelector('[data-solicitudes-confirmacion]') :
      reactivaVistaActual(reactiva) ? reactiva.querySelector('[data-reactiva-estado]') : null;
    if (aviso) aviso.textContent = 'No se pudo actualizar toda la información de otras sesiones. Usa Actualizar para volver a consultar.';
  }
  // Un formulario abierto no equivale a una escritura en curso.
  const s = solicitudesDetalle, r = typeof reactivaDetalle === 'undefined' ? null : reactivaDetalle;
  const ficha = s?.dialogo.isConnected && solicitudesVistaActual(s.raiz) ? s :
    r?.dialogo.isConnected && reactivaVistaActual(r.raiz) ? r : null;
  if (!ficha || ficha.usuarioId !== usuarioId) return false;
  const deSolicitud = ficha === s, id = ficha.registro?.id || ficha.id;
  if (!id) return false;
  const fichaVigente = () => vigente() && ficha.dialogo.isConnected && (deSolicitud ?
    solicitudesDetalle === ficha && solicitudesVistaActual(ficha.raiz) : reactivaDetalle === ficha && reactivaVistaActual(ficha.raiz));
  if (ficha.invalidada) return !solicitudesCerrarFichaInvalidada(ficha, deSolicitud);
  if(deSolicitud)return solicitudesFichaProtegidaSincronizacion();
  try {
    const registro = deSolicitud ? await window.SolicitudesService.obtener(id, { permitirAusente: true }) :
      await window.MantencionesReactivasService.obtener(id, { permitirAusente: true });
    if (!fichaVigente()) return false;
    if (registro === null) {
      ficha.invalidada = true;
      ficha.dialogo.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = true; });
      return !solicitudesCerrarFichaInvalidada(ficha, deSolicitud);
    }
    if (!deSolicitud && String(registro.revision)!==String(ficha.registro.revision)) {
      ficha.evidenciaAsignacion=null;
      ficha.requiereActualizar=true;
      reactivaActualizarRequisito(ficha);
      reactivaBloquearGestion(ficha,false);
    }
    return solicitudesFichaProtegidaSincronizacion();
  } catch (error) {
    if (fichaVigente()) {
      const aviso = ficha.dialogo.querySelector(deSolicitud ? '[data-solicitudes-decision-mensaje]' : '[data-reactiva-gestion-mensaje]');
      if (aviso) aviso.textContent = 'No se pudo comprobar el cambio de otra sesión. La ficha se conserva; actualiza para verificar su estado.';
    }
  }
  return false;
}
async function solicitudesRefrescarEliminacion() {
  const d = solicitudesUltimoRefresco;
  if (!d || d.refrescando || d.contexto.usuarioId !== state.currentUser?.id) return;
  d.refrescando = true;
  const tareas = [];
  const solicitudes = document.getElementById('solicitudes-vista'), reactiva = document.getElementById('reactiva-vista');
  if (solicitudesVistaActual(solicitudes)) {
    const c = solicitudesContextos.get(solicitudes);
    if (c?.cargando) { c.secuencia++; c.cargando = false; }
    tareas.push(solicitudesCargar(solicitudes));
  }
  if (reactivaVistaActual(reactiva)) tareas.push(reactivaCargar(reactiva));
  if (window.AvisosSolicitudes) tareas.push(window.AvisosSolicitudes.sincronizar());
  if (window.NotificacionesRevision) tareas.push(window.NotificacionesRevision.sincronizar());
  const resultados = await Promise.allSettled(tareas);
  d.refrescando = false;
  if (d !== solicitudesUltimoRefresco || d.contexto.usuarioId !== state.currentUser?.id || !d.ficha.raiz.isConnected) return;
  const fallo = resultados.some(r => r.status === 'rejected' || r.value === false);
  const destino = d.ficha.raiz.querySelector(d.contexto.origen === 'solicitudes' ? '[data-solicitudes-confirmacion]' : '[data-reactiva-estado]');
  if (destino) {
    destino.textContent = fallo ? 'La eliminación fue confirmada, pero no se pudo actualizar toda la información. ' : 'Eliminación definitiva confirmada. ';
    const boton = document.createElement('button'); boton.type = 'button'; boton.className = 'text-sm font-bold';
    boton.textContent = 'Volver a consultar'; boton.onclick = solicitudesRefrescarEliminacion; destino.appendChild(boton);
  }
}
function solicitudesEscape(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function solicitudesVistaActual(raiz) {
  return raiz?.isConnected && currentView === 'solicitudes' && document.getElementById('solicitudes-vista') === raiz;
}
function solicitudesNombre(registro) {
  return (window.UsuariosService?.nombreParaMostrar?.(registro,'creador_nombre_snapshot') ?? registro.creador_nombre_snapshot)?.trim() || 'Usuario no disponible';
}
function solicitudesFormularioHTML(administrativa = false) {
  const campo = 'w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-3 py-2 mt-1';
  return `      <form onsubmit="${administrativa ? 'solicitudesGuardarAdministrativa(event)' : 'solicitudesGuardar(event)'}" class="mt-4 space-y-4">
        <fieldset class="space-y-4"><div class="grid gap-4 sm:grid-cols-2">
          <label class="block text-sm font-medium">Tipo de problema *<input name="tipo_problema" required class="${campo}"></label>
          <label class="block text-sm font-medium">Ubicación *<input name="ubicacion" required class="${campo}"></label>
        </div>
        <label class="block text-sm font-medium">Descripción del problema *<textarea name="descripcion" required rows="3" class="${campo}"></textarea></label>
        <label class="block text-sm font-medium">Urgencia *<select name="urgencia" required class="${campo}"><option value="">Selecciona la urgencia</option><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
        <label class="block text-sm font-medium">Observaciones (opcional)<textarea name="observaciones" rows="2" class="${campo}"></textarea></label>
        <button type="submit" class="alm-btn-primary px-4 py-2.5">${administrativa ? 'Registrar y aprobar' : 'Registrar solicitud'}</button>${administrativa ? '<button type="button" onclick="solicitudesCerrarNueva()" class="px-4 py-2.5 rounded-xl" style="border:1px solid var(--alm-border)">Cancelar</button>' : ''}</fieldset>
        <p data-solicitud-mensaje role="status" aria-live="polite" class="text-sm alm-muted"></p>
      </form>`;
}
function renderRequestsView() {
  const recepcion = state.currentUser?.role === 'RECEPCION';
  if (!recepcion && !esAdminOperativoActual()) return '<div class="alm-ui alm-panel p-5"><p role="status">No tienes autorización para consultar solicitudes.</p></div>';
  setTimeout(() => {
    const raiz = document.getElementById('solicitudes-vista');
    if (!solicitudesVistaActual(raiz) || solicitudesContextos.has(raiz)) return;
    solicitudesContextos.set(raiz, { pagina:0, secuencia:0, revision:0, estado:'', busqueda:'', orden:'recientes', cargando:false, guardando:false });
    solicitudesCargar(raiz);
  }, 0);
  return `<div id="solicitudes-vista" class="alm-ui alm-main-page alm-module-page space-y-4 pb-10">
    ${uiEncabezadoSeccion('Solicitudes',esAdminOperativoActual() ? 'Consulta de todas las solicitudes registradas.' : 'Registra un problema y consulta tus solicitudes.','clipboard')}
    ${recepcion && !esAdminOperativoActual() ? `<section class="alm-panel p-5 sm:p-6"><h3 class="text-lg font-bold">Nueva solicitud</h3>
      ${solicitudesFormularioHTML(false)}</section>` : ''}
    <section class="alm-panel p-5 sm:p-6 space-y-4"><div class="flex flex-wrap items-center justify-between gap-3"><h3 class="text-lg font-bold">${esAdminOperativoActual() ? 'Solicitudes registradas' : 'Mis solicitudes'}</h3><div class="flex flex-wrap items-center gap-3">${esAdminOperativoActual() ? '<button type="button" onclick="solicitudesAbrirNueva(this)" class="alm-btn-primary px-3 py-2 text-sm">Nueva solicitud</button>' : ''}<button type="button" data-solicitudes-actualizar onclick="solicitudesActualizar(this)" class="alm-btn-secondary px-3 py-2 rounded-xl text-sm" style="border:1px solid var(--alm-border);background:var(--alm-inset);color:var(--alm-text)">Actualizar</button></div></div>
      <p data-solicitudes-confirmacion role="status" aria-live="polite" class="text-sm alm-muted"></p>
      <div class="alm-solicitudes-filtros">
        <div class="alm-solicitudes-estados" role="group" aria-label="Filtrar solicitudes por estado">${[['','Todas'],['pendiente','Pendientes'],['aprobada','Aprobadas'],['rechazada','Rechazadas']].map(([valor,texto]) => `<button type="button" data-solicitudes-filtro="${valor}" aria-pressed="${valor === ''}" onclick="solicitudesFiltrarEstado(this)">${texto}</button>`).join('')}</div>
        <div class="alm-solicitudes-herramientas">
          <label class="alm-solicitudes-buscador"><span class="alm-muted">Buscar solicitudes</span><input type="search" data-solicitudes-busqueda placeholder="Buscar por problema, ubicación o solicitante..." oninput="solicitudesBuscar(this)"></label>
          <label><span class="alm-muted">Ordenar por fecha</span><select data-solicitudes-orden onchange="solicitudesOrdenar(this)"><option value="recientes">Más recientes</option><option value="antiguas">Más antiguas</option></select></label>
        </div>
      </div>
      <div data-solicitudes-estado role="status" aria-live="polite">${uiCargandoHTML()}</div>
      <div data-solicitudes-lista class="alm-solicitudes-lista"></div>
      <div class="flex items-center justify-between gap-3"><button type="button" data-solicitudes-anterior disabled onclick="solicitudesPagina(this,-1)" class="px-3 py-2 rounded-xl text-sm" style="border:1px solid var(--alm-border);background:var(--alm-inset);color:var(--alm-text)">Anterior</button><span data-solicitudes-pagina class="text-sm alm-muted"></span><button type="button" data-solicitudes-siguiente disabled onclick="solicitudesPagina(this,1)" class="px-3 py-2 rounded-xl text-sm" style="border:1px solid var(--alm-border);background:var(--alm-inset);color:var(--alm-text)">Siguiente</button></div>
    </section></div>`;
}
async function solicitudesCargar(raiz) {
  const contexto = solicitudesContextos.get(raiz);
  if (!contexto || !solicitudesVistaActual(raiz)) return;
  if (contexto.cargando) { contexto.reconsultar = true; return; }
  clearTimeout(contexto.busquedaTimer); contexto.busquedaTimer = null;
  contexto.reconsultar = false;
  contexto.cargando = true;
  const secuencia = ++contexto.secuencia;
  const revision = contexto.revision || 0;
  const filtros = { estado:contexto.estado || '', busqueda:contexto.busqueda || '', orden:contexto.orden || 'recientes' };
  const usuarioId = state.currentUser?.id;
  const actual = () => solicitudesVistaActual(raiz) && secuencia === contexto.secuencia && usuarioId === state.currentUser?.id;
  const vigente = () => actual() && revision === (contexto.revision || 0);
  const estado = raiz.querySelector('[data-solicitudes-estado]');
  const lista = raiz.querySelector('[data-solicitudes-lista]');
  const anterior = raiz.querySelector('[data-solicitudes-anterior]');
  const siguiente = raiz.querySelector('[data-solicitudes-siguiente]');
  const actualizar = raiz.querySelector('[data-solicitudes-actualizar]');
  anterior.disabled = siguiente.disabled = actualizar.disabled = true;
  lista.setAttribute('aria-busy','true');
  if (contexto.registros) estado.textContent = 'Actualizando solicitudes…';
  else estado.innerHTML = uiCargandoHTML();
  try {
    const { registros, total } = await window.SolicitudesService.listar(contexto.pagina, filtros);
    if (!vigente()) return false;
    let vinculos = new Map(), errorVinculos = '';
    if (registros.some(r => r.estado === 'aprobada') && esAdminOperativoActual() && hasAccess('areas',state.currentUser?.role)) {
      try { vinculos = await window.SolicitudesService.vinculos(registros.filter(r => r.estado === 'aprobada').map(r => r.id)); }
      catch (error) { errorVinculos = ' No se pudieron comprobar las mantenciones vinculadas. ' + (error.message || 'Error de conexión.'); }
    }
    if (!vigente()) return false;
    if (contexto.pagina > 0 && !registros.length) {
      contexto.pagina = Math.max(0, Math.ceil(total / 20) - 1);
      contexto.cargando = false;
      return await solicitudesCargar(raiz);
    }
    contexto.total = total;
    contexto.paginaMostrada = contexto.pagina;
    contexto.revisionMostrada = revision;
    contexto.registros = registros;
    estado.textContent = (total ? `${total} solicitudes encontradas.` : filtros.estado || filtros.busqueda ? 'No hay solicitudes que coincidan con los filtros.' : 'Todavía no hay solicitudes registradas.') + errorVinculos;
    lista.innerHTML = registros.map((r, indice) => {
      const fecha = /^(\d{4})-(\d{2})-(\d{2})/.exec(r.created_at || '');
      const descripcion = String(r.descripcion ?? '');
      const etiquetaEstado = ({ pendiente:'Pendiente', aprobada:'Aprobada', rechazada:'Rechazada' })[r.estado] || r.estado || 'Sin estado registrado';
      const claseEstado = ['pendiente','aprobada','rechazada'].includes(r.estado) ? r.estado : 'desconocida';
      return `<article class="alm-solicitud-tarjeta">
        <div class="alm-solicitud-cabecera"><h4>${solicitudesEscape(r.tipo_problema)}</h4><span class="alm-solicitud-badge" data-estado="${claseEstado}">${solicitudesEscape(etiquetaEstado)}</span></div>
        <dl class="alm-solicitud-datos"><div><dt>Ubicación</dt><dd>${solicitudesEscape(r.ubicacion)}</dd></div><div><dt>Solicitante</dt><dd>${solicitudesEscape(solicitudesNombre(r))}</dd></div><div><dt>Fecha</dt><dd>${solicitudesEscape(solicitudesFecha(r.created_at))}</dd></div><div><dt>Urgencia</dt><dd>${solicitudesEscape(r.urgencia === 'critica' ? 'Crítica' : r.urgencia)}</dd></div></dl>
        <p class="alm-solicitud-descripcion alm-muted">${solicitudesEscape(descripcion.slice(0, 240))}${descripcion.length > 240 ? '…' : ''}</p>
        <div class="alm-solicitud-acciones"><button type="button" class="alm-btn-primary px-3 py-2" onclick="solicitudesAbrirDetalle(this,${indice})">Ver solicitud</button>${r.estado === 'aprobada' && vinculos.has(r.id) && esAdminOperativoActual() && hasAccess('areas',state.currentUser?.role) ? '<button type="button" class="px-3 py-2 rounded-xl text-sm font-medium" style="border:1px solid var(--alm-border);background:var(--alm-inset);color:var(--alm-text)" onclick="solicitudesVerMantencion(this,' + indice + ')">Ver mantención</button>' : ''}</div>
      </article>`;
    }).join('');
    raiz.querySelector('[data-solicitudes-pagina]').textContent = `Página ${contexto.pagina + 1} de ${Math.max(1, Math.ceil(total / 20))}`;
    anterior.disabled = contexto.pagina === 0;
    siguiente.disabled = (contexto.pagina + 1) * 20 >= total;
    return true;
  } catch (error) {
    if (vigente()) {
      contexto.pagina = contexto.paginaMostrada || 0;
      estado.textContent = 'No se pudieron consultar las solicitudes. ' + (error.message || 'Error de conexión. Intenta actualizar.') + (contexto.registros ? ' Se conserva el último resultado; usa Actualizar para reintentar.' : '');
    }
    return false;
  } finally {
    if (contexto.secuencia === secuencia) contexto.cargando = false;
    if (actual()) {
      lista.setAttribute('aria-busy','false');
      actualizar.disabled = false;
      const coincide = contexto.revisionMostrada === (contexto.revision || 0);
      anterior.disabled = !coincide || contexto.pagina === 0;
      siguiente.disabled = !coincide || (contexto.pagina + 1) * 20 >= contexto.total;
      if (contexto.reconsultar && !contexto.busquedaTimer) { contexto.reconsultar = false; solicitudesCargar(raiz); }
    }
  }
}
function solicitudesCambiarFiltro(control, cambio, espera = 0) {
  const raiz = control.closest('#solicitudes-vista'), contexto = solicitudesContextos.get(raiz);
  if (!contexto || !solicitudesVistaActual(raiz) || contexto.guardando) return;
  if (Object.entries(cambio).every(([clave,valor]) => contexto[clave] === valor)) return;
  Object.assign(contexto, cambio); contexto.pagina = 0; contexto.revision = (contexto.revision || 0) + 1;
  clearTimeout(contexto.busquedaTimer); contexto.busquedaTimer = null;
  raiz.querySelector('[data-solicitudes-anterior]').disabled = true;
  raiz.querySelector('[data-solicitudes-siguiente]').disabled = true;
  raiz.querySelectorAll('[data-solicitudes-filtro]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.solicitudesFiltro === contexto.estado)));
  contexto.reconsultar = true;
  if (espera) contexto.busquedaTimer = setTimeout(() => {
    contexto.busquedaTimer = null;
    if (solicitudesVistaActual(raiz)) solicitudesCargar(raiz);
  }, espera);
  else solicitudesCargar(raiz);
}
function solicitudesFiltrarEstado(boton) {
  solicitudesCambiarFiltro(boton, { estado:boton.dataset.solicitudesFiltro });
}
function solicitudesBuscar(input) {
  solicitudesCambiarFiltro(input, { busqueda:input.value.trim().replace(/\s+/g, ' ') }, 300);
}
function solicitudesOrdenar(select) {
  solicitudesCambiarFiltro(select, { orden:select.value });
}
function solicitudesActualizar(boton) {
  const raiz = boton.closest('#solicitudes-vista');
  const contexto = solicitudesContextos.get(raiz);
  if (!contexto || contexto.cargando || contexto.guardando) return;
  solicitudesCargar(raiz);
}
function solicitudesPagina(boton, cambio) {
  const raiz = boton.closest('#solicitudes-vista');
  const contexto = solicitudesContextos.get(raiz);
  if (!contexto || contexto.cargando || contexto.guardando) return;
  const pagina = contexto.pagina + cambio;
  if (pagina < 0 || pagina * 20 >= contexto.total) return;
  contexto.pagina = pagina;
  solicitudesCargar(raiz);
}
async function solicitudesGuardar(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const raiz = form.closest('#solicitudes-vista');
  const contexto = solicitudesContextos.get(raiz);
  if (!contexto || contexto.guardando || !solicitudesVistaActual(raiz)) return;
  if (contexto.cargando) {
    form.querySelector('[data-solicitud-mensaje]').textContent = 'Espera a que termine la consulta y vuelve a presionar Registrar solicitud.';
    return;
  }
  if (!form.reportValidity()) return;
  const datos = Object.fromEntries(new FormData(form));
  const mensaje = form.querySelector('[data-solicitud-mensaje]');
  const campos = form.querySelector('fieldset');
  const boton = form.querySelector('[type="submit"]');
  contexto.guardando = true;
  campos.disabled = true;
  boton.textContent = 'Guardando…';
  mensaje.textContent = 'Guardando solicitud…';
  try {
    await window.SolicitudesService.crear(datos);
    if (!solicitudesVistaActual(raiz)) return;
    form.reset();
    mensaje.textContent = 'Solicitud registrada correctamente.';
    contexto.pagina = 0;
    await solicitudesCargar(raiz);
  } catch (error) {
    if (solicitudesVistaActual(raiz)) mensaje.textContent = 'No se pudo confirmar el registro. ' + (error.message || 'Error de conexión.') + ' Los campos se conservaron. Si se perdió la conexión, actualiza la lista antes de volver a enviar.';
  } finally {
    contexto.guardando = false;
    if (solicitudesVistaActual(raiz)) {
      campos.disabled = false;
      boton.textContent = 'Registrar solicitud';
    }
  }
}

let solicitudesDetalle = null;
function solicitudesPendiente(registro) {
  return String(registro?.estado || '').toLowerCase() === 'pendiente';
}
function solicitudesFecha(valor) {
  return formatearFechaCL(valor,{vacio:'Sin fecha registrada'});
}
function solicitudesCerrarDetalle() {
  if (solicitudesDetalle?.ocupada) return;
  const anterior = solicitudesDetalle;
  solicitudesCancelarRechazo();
  solicitudesDetalle = null;
  document.getElementById('solicitudes-detalle-modal')?.remove();
  document.removeEventListener('keydown', solicitudesDetalleTeclado, true);
  if (anterior) document.body.style.overflow = anterior.overflow;
  if (anterior?.foco?.isConnected) anterior.foco.focus();
}
function solicitudesDetalleTeclado(event) {
  if (solicitudesEliminacion || solicitudesDetalle?.rechazo) return;
  // UX-02: Escape y el fondo no cierran esta ficha.
  if (!solicitudesDetalle || event.key !== 'Tab') return;
  const elementos = [...document.getElementById('solicitudes-detalle-modal').querySelectorAll('button:not(:disabled), textarea:not(:disabled)')];
  const primero = elementos[0], ultimo = elementos[elementos.length - 1];
  if (!primero) { event.preventDefault(); return; }
  if (event.shiftKey && document.activeElement === primero) { event.preventDefault(); ultimo.focus(); }
  else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primero.focus(); }
}
async function solicitudesAbrirDetalle(boton, indice, solicitudId = null) {
  if (solicitudesDetalle?.ocupada) return;
  const raiz = boton.closest('#solicitudes-vista');
  const contexto = solicitudesContextos.get(raiz);
  const registro = solicitudId ? { id: solicitudId } : contexto?.registros?.[indice];
  if (!registro || !solicitudesVistaActual(raiz)) return;
  solicitudesCerrarDetalle();
  const dialogo = document.createElement('div');
  dialogo.id = 'solicitudes-detalle-modal';
  dialogo.className = 'alm-ui hidden fixed inset-0 z-50 flex items-center justify-center p-4';
  dialogo.style.background = 'rgba(2, 6, 23, 0.7)';
  dialogo.setAttribute('role', 'dialog');
  dialogo.setAttribute('aria-modal', 'true');
  dialogo.setAttribute('aria-labelledby', 'solicitudes-detalle-titulo');
  dialogo.innerHTML = `<section class="alm-panel w-full max-w-2xl flex flex-col" style="max-height:90vh"><header class="flex items-center justify-between gap-3 p-5 border-b border-slate-200 dark:border-slate-700"><h2 id="solicitudes-detalle-titulo" class="alm-title">Detalle de solicitud</h2><button type="button" onclick="solicitudesCerrarDetalle()" aria-label="Cerrar ficha" class="px-3 py-2 rounded-xl">✕</button></header><div data-solicitudes-detalle-contenido class="overflow-y-auto p-5 space-y-4"><p role="status">Cargando solicitud…</p></div><footer class="p-4 border-t border-slate-200 dark:border-slate-700"><button type="button" onclick="solicitudesCerrarDetalle()" class="px-4 py-2 rounded-xl" style="border:1px solid var(--alm-border)">Cerrar</button></footer></section>`;
  const detalle = { raiz, dialogo, id: registro.id, ocupada: false, foco: boton, overflow: document.body.style.overflow, usuarioId: state.currentUser.id };
  solicitudesDetalle = detalle;
  document.body.appendChild(dialogo);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', solicitudesDetalleTeclado, true);
  openModal(dialogo.id);
  dialogo.querySelector('button').focus();
  try {
    const fila = await window.SolicitudesService.obtener(registro.id);
    if (solicitudesDetalle !== detalle) return;
    detalle.registro = fila;
    solicitudesDetalleContenido(detalle);
    if(detalle.revalidarAlAbrir){detalle.revalidarAlAbrir=false;await solicitudesRevalidarFicha(detalle);}
    if (esAdminOperativoActual() && detalle.registro.estado === 'aprobada') {
      try {
        const id = await window.SolicitudesService.vinculo(fila.id);
        if (solicitudesDetalle === detalle) dialogo.querySelector('[data-solicitudes-vinculo]').textContent = id ? 'Mantención reactiva vinculada: ' + id : 'No se encontró una mantención vinculada visible.';
      } catch (error) {
        if (solicitudesDetalle === detalle) dialogo.querySelector('[data-solicitudes-vinculo]').textContent = 'No se pudo consultar la vinculación. ' + (error.message || 'Error de consulta.');
      }
    }
  } catch (error) {
    if (solicitudesDetalle === detalle) dialogo.querySelector('[data-solicitudes-detalle-contenido]').textContent = 'No se pudo consultar la solicitud. ' + (error.message || 'Error de conexión.');
  }
}
function solicitudesDetalleContenido(detalle) {
  const r = detalle.registro;
  const dato = (titulo, valor) => `<div><dt class="text-sm font-bold">${titulo}</dt><dd class="text-sm alm-muted" style="white-space:pre-wrap;overflow-wrap:anywhere">${solicitudesEscape(valor)}</dd></div>`;
  detalle.dialogo.querySelector('[data-solicitudes-detalle-contenido]').innerHTML = `<dl class="space-y-3">
    ${dato('Solicitante', solicitudesNombre(r))}${dato('Tipo de problema', r.tipo_problema)}${dato('Ubicación', r.ubicacion)}${dato('Descripción', r.descripcion)}${dato('Urgencia', r.urgencia === 'critica' ? 'Crítica' : r.urgencia)}${dato('Observaciones', r.observaciones || 'Sin observaciones registradas')}${dato('Fecha de registro', solicitudesFecha(r.created_at))}${dato('Última actualización', solicitudesFecha(r.updated_at))}${dato('Estado', r.estado || 'Sin estado registrado')}${r.revisada_en ? dato('Fecha de revisión', formatearFechaCL(r.revisada_en,{hora:true,vacio:'Sin fecha registrada'})) : ''}${r.estado === 'rechazada' ? dato('Motivo del rechazo', r.motivo_decision || 'Sin motivo registrado') : ''}</dl>
    ${r.estado === 'aprobada' && esAdminOperativoActual() ? '<p class="text-sm alm-muted">Por seguridad, esta solicitud debe eliminarse desde su ficha en Mantención Reactiva.</p>' : ''}
    <p data-solicitudes-vinculo class="text-sm alm-muted" style="overflow-wrap:anywhere"></p>
    <p data-solicitudes-decision-mensaje role="status" aria-live="polite" class="text-sm alm-muted"></p>
    <button type="button" data-solicitudes-revalidar hidden style="display:none" onclick="solicitudesActualizarDetalle()" class="alm-btn-secondary px-3 py-2">Actualizar solicitud</button>
    <div data-solicitudes-decision>${esAdminOperativoActual() && solicitudesPendiente(r) ? `<div class="flex flex-wrap gap-3"><button type="button" onclick="solicitudesDecidir(true)" class="alm-btn-primary px-4 py-2">Aprobar</button><button type="button" onclick="solicitudesAbrirRechazo(this)" class="alm-btn-danger px-4 py-2">Rechazar</button></div>` : ''}</div>`;
}
function solicitudesCancelarRechazo() {
  const d=solicitudesDetalle;if(!d?.rechazo||d.ocupada)return;
  const r=d.rechazo;d.rechazo=null;r.dialogo.close();r.dialogo.remove();d.dialogo.inert=false;r.foco?.focus();
}
function solicitudesAbrirRechazo(boton) {
  const d=solicitudesDetalle;
  if(d?.rechazo||solicitudesDecisionBloqueada(d))return;
  const dialogo=document.createElement('dialog');dialogo.className='alm-ui alm-panel solicitudes-rechazo-dialog';
  dialogo.setAttribute('aria-labelledby','solicitudes-rechazo-titulo');
  dialogo.innerHTML='<form class="space-y-4"><h2 id="solicitudes-rechazo-titulo" class="alm-title">Rechazar solicitud</h2><p class="text-sm alm-muted">Indica el motivo del rechazo. Recepción podrá consultarlo.</p><label class="block text-sm">Motivo obligatorio<textarea data-solicitudes-motivo required rows="3" class="w-full mt-1 px-3 py-2 rounded-xl" style="border:1px solid var(--alm-border);background:var(--alm-inset);color:var(--alm-text)"></textarea></label><p data-solicitudes-rechazo-error role="status" aria-live="polite" class="text-sm alm-muted"></p><button type="button" data-solicitudes-revalidar hidden style="display:none" onclick="solicitudesActualizarDetalle()" class="alm-btn-secondary px-3 py-2">Actualizar solicitud</button><div class="flex flex-wrap gap-3"><button type="button" data-cancelar class="alm-btn-secondary px-4 py-2">Cancelar</button><button type="submit" class="alm-btn-danger px-4 py-2">Confirmar rechazo</button></div></form>';
  d.rechazo={dialogo,foco:boton};d.dialogo.inert=true;document.body.appendChild(dialogo);
  dialogo.addEventListener('cancel',e=>e.preventDefault());
  dialogo.querySelector('[data-cancelar]').onclick=solicitudesCancelarRechazo;
  dialogo.querySelector('form').onsubmit=e=>{e.preventDefault();if(dialogo.querySelector('form').reportValidity())solicitudesDecidir(false);};
  dialogo.showModal();dialogo.querySelector('textarea').focus();
}

async function solicitudesDecidir(aprobar) {
  const detalle = solicitudesDetalle;
  if (solicitudesDecisionBloqueada(detalle)) return;
  const dialogo = detalle.dialogo;
  const mensaje = detalle.rechazo?.dialogo.querySelector('[data-solicitudes-rechazo-error]') || dialogo.querySelector('[data-solicitudes-decision-mensaje]');
  let confirmada=null;
  if (!esAdminOperativoActual()) {
    mensaje.textContent = 'Ya no tienes autorización administrativa vigente. Cierra y actualiza la ficha.';
    dialogo.querySelector('[data-solicitudes-decision]').innerHTML = '';
    return;
  }
  if (!solicitudesVistaActual(detalle.raiz) || detalle.usuarioId !== state.currentUser?.id) {
    mensaje.textContent = 'El contexto cambió. Cierra la ficha y vuelve a abrir la solicitud.';
    return;
  }
  if(!aprobar&&!detalle.rechazo)return;
  const motivo = aprobar?'':detalle.rechazo.dialogo.querySelector('[data-solicitudes-motivo]').value.trim();
  if (!aprobar && !motivo) {
    mensaje.textContent = 'Indica el motivo del rechazo.';
    detalle.rechazo.dialogo.querySelector('[data-solicitudes-motivo]').focus();
    return;
  }
  detalle.ocupada = true;
  detalle.escrituraEnCurso = true;
  detalle.resultadoEscritura = 'pendiente';
  dialogo.querySelectorAll('button,textarea').forEach(el => { el.disabled = true; });
  detalle.rechazo?.dialogo.querySelectorAll('button,textarea').forEach(el=>{el.disabled=true;});
  mensaje.textContent = 'Registrando decisión…';
  try {
    const resultado = await window.SolicitudesService.decidir(detalle.id, aprobar, motivo);
    detalle.resultadoEscritura = 'confirmada';
    if (detalle.invalidada) return;
    if(detalle.usuarioId!==state.currentUser?.id||!solicitudesVistaActual(detalle.raiz)||!esAdminOperativoActual())return;
    detalle.registro.estado = resultado.estado_solicitud;
    confirmada=resultado;
    dialogo.querySelector('[data-solicitudes-decision]').innerHTML = '';
    // El estado y el vínculo proceden de la RPC; no se inserta otra mantención.
    solicitudesDetalleContenido(detalle);
    dialogo.querySelector('[data-solicitudes-decision-mensaje]').textContent = aprobar ? 'Solicitud aprobada. La mantención reactiva fue creada por el servidor.' : 'Solicitud rechazada. No se creó una mantención reactiva.';
    dialogo.querySelector('[data-solicitudes-vinculo]').textContent = resultado.mantencion_reactiva_id ? 'Mantención reactiva vinculada: ' + resultado.mantencion_reactiva_id : '';
  } catch (error) {
    if (detalle.resultadoEscritura !== 'confirmada') detalle.resultadoEscritura = 'incierta';
    if (detalle.invalidada || detalle.usuarioId!==state.currentUser?.id || !solicitudesVistaActual(detalle.raiz)) return;
    mensaje.textContent = 'No se pudo confirmar la decisión. ' + (error.message || 'Error de conexión.');
    detalle.decisionNoVerificable=true;
    await solicitudesRevalidarFicha(detalle,{trasDecision:true});
  } finally {
    detalle.escrituraEnCurso = false;
    detalle.ocupada = false;
    dialogo.querySelectorAll('button,textarea').forEach(el => { el.disabled = detalle.invalidada || el.dataset.bloqueado === 'true'; });
    detalle.rechazo?.dialogo.querySelectorAll('button,textarea').forEach(el=>{el.disabled=detalle.invalidada||(el.type==='submit'&&!solicitudesPendiente(detalle.registro));});
    solicitudesActualizarBloqueoDecision(detalle);
    if(confirmada&&detalle.usuarioId===state.currentUser?.id&&esAdminOperativoActual()&&solicitudesVistaActual(detalle.raiz)){
      solicitudesCerrarDetalle();
      if(aprobar){
        const boton=detalle.raiz.querySelector('[data-solicitudes-actualizar]');
        if(boton)await solicitudesVerMantencion(boton,-1,confirmada);
        else detalle.raiz.querySelector('[data-solicitudes-confirmacion]').textContent='Solicitud aprobada. Abre Mantención Reactiva para consultar su ficha.';
      }else{
        const c=solicitudesContextos.get(detalle.raiz);
        if(c){c.estado='rechazada';c.pagina=0;c.busqueda='';c.orden='recientes';c.revision=(c.revision||0)+1;}
        const busqueda=detalle.raiz.querySelector('[data-solicitudes-busqueda]');if(busqueda)busqueda.value='';
        const orden=detalle.raiz.querySelector('[data-solicitudes-orden]');if(orden)orden.value='recientes';
        detalle.raiz.querySelectorAll('[data-solicitudes-filtro]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.solicitudesFiltro==='rechazada')));
        const aviso=detalle.raiz.querySelector('[data-solicitudes-confirmacion]');
        aviso.textContent='Solicitud rechazada: '+detalle.registro.tipo_problema+'. ';
        const ver=document.createElement('button');ver.type='button';ver.className='alm-btn-secondary px-3 py-2';ver.textContent='Ver solicitud rechazada';
        ver.onclick=()=>solicitudesAbrirDetalle(ver,-1,detalle.id);aviso.appendChild(ver);
        await solicitudesCargar(detalle.raiz);
      }
    }else if(solicitudesVistaActual(detalle.raiz))await solicitudesCargar(detalle.raiz);
  }
}

let solicitudesNueva = null;
function solicitudesAbrirNueva(boton) {
  if (!esAdminOperativoActual()) return;
  const raiz = boton.closest('#solicitudes-vista');
  const contexto = solicitudesContextos.get(raiz);
  if (!contexto || !solicitudesVistaActual(raiz) || solicitudesDetalle?.ocupada) return;
  if (solicitudesNueva?.dialogo.isConnected) { solicitudesNueva.dialogo.querySelector('button').focus(); return; }
  if (!window.crypto?.randomUUID) {
    raiz.querySelector('[data-solicitudes-confirmacion]').textContent = 'No se pudo generar un identificador seguro. Abre la aplicación mediante HTTPS o el entorno local autorizado.';
    return;
  }
  solicitudesCerrarDetalle();
  const operacionId = window.crypto.randomUUID();
  const dialogo = document.createElement('div');
  dialogo.id = 'solicitudes-nueva-modal';
  dialogo.className = 'alm-ui fixed inset-0 z-50 flex items-center justify-center p-4';
  dialogo.style.background = 'rgba(2,6,23,.7)';
  dialogo.setAttribute('role','dialog'); dialogo.setAttribute('aria-modal','true');
  dialogo.setAttribute('aria-labelledby','solicitudes-nueva-titulo');
  dialogo.innerHTML = '<section class="alm-panel w-full max-w-2xl flex flex-col" style="max-height:90vh"><header class="flex items-center justify-between gap-3 p-5 border-b border-slate-200 dark:border-slate-700"><h2 id="solicitudes-nueva-titulo" class="alm-title">Nueva solicitud</h2><button type="button" onclick="solicitudesCerrarNueva()" aria-label="Cerrar formulario" class="px-3 py-2 rounded-xl">✕</button></header><div class="overflow-y-auto p-5"><p class="text-sm alm-muted">Se aprobará automáticamente y generará una mantención reactiva pendiente de asignación.</p>' + solicitudesFormularioHTML(true) + '</div></section>';
  solicitudesNueva = { raiz, contexto, dialogo, operacionId, usuarioId:state.currentUser.id, foco:boton, overflow:document.body.style.overflow, ocupada:false, peticion:null, descartar:false, confirmada:false };
  document.body.appendChild(dialogo); document.body.style.overflow = 'hidden';
  raiz.querySelector('[data-solicitudes-confirmacion]').textContent = '';
  document.addEventListener('keydown',solicitudesNuevaTeclado,true);
  dialogo.querySelector('input').focus();
}
function solicitudesNuevaTeclado(event) {
  const d = solicitudesNueva;
  if (!d?.dialogo.isConnected || event.key !== 'Tab') return;
  const focos = [...d.dialogo.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];
  const primero = focos[0], ultimo = focos[focos.length - 1];
  if (!primero) { event.preventDefault(); return; }
  if (!d.dialogo.contains(document.activeElement) || event.shiftKey && document.activeElement === primero || !event.shiftKey && document.activeElement === ultimo) {
    event.preventDefault(); (event.shiftKey ? ultimo : primero).focus();
  }
}
function solicitudesCerrarNueva(confirmada = false) {
  const d = solicitudesNueva;
  if (!d || d.ocupada) return;
  if (!confirmada && d.peticion && !d.confirmada && !d.descartar && d.dialogo.isConnected) {
    d.descartar = true;
    d.dialogo.querySelector('[data-solicitud-mensaje]').textContent = 'El registro podría haberse procesado. Puedes reintentar esta misma operación sin duplicarla. Si decides descartar el formulario, pulsa nuevamente Cancelar o X y revisa el listado antes de iniciar otro registro.';
    return;
  }
  solicitudesNueva = null;
  document.removeEventListener('keydown',solicitudesNuevaTeclado,true);
  d.dialogo.remove(); document.body.style.overflow = d.overflow;
  if (d.foco?.isConnected) d.foco.focus();
}
async function solicitudesGuardarAdministrativa(event) {
  event.preventDefault();
  const d = solicitudesNueva;
  if (!d || d.ocupada || !d.dialogo.isConnected || !solicitudesVistaActual(d.raiz)) return;
  const form = event.currentTarget;
  const mensaje = form.querySelector('[data-solicitud-mensaje]');
  if (state.currentUser?.id !== d.usuarioId || !esAdminOperativoActual()) { mensaje.textContent = 'Ya no tienes autorización administrativa vigente.'; return; }
  if (!d.peticion) {
    if (!form.reportValidity()) return;
    try {
      const datos = window.SolicitudesService.validarDatos(Object.fromEntries(new FormData(form)));
      d.peticion = Object.freeze({ operacionId:d.operacionId, datos:Object.freeze(datos) });
    } catch (error) { mensaje.textContent = error.message || 'Revisa los campos obligatorios.'; return; }
  }
  d.ocupada = true; d.contexto.guardando = true; d.descartar = false;
  d.dialogo.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = true; });
  mensaje.textContent = 'Registrando y aprobando solicitud…';
  try {
    await window.SolicitudesService.crearAprobada(d.peticion.operacionId, d.peticion.datos);
    d.confirmada = true;
    if (solicitudesNueva !== d || !d.dialogo.isConnected || !solicitudesVistaActual(d.raiz) || state.currentUser?.id !== d.usuarioId || !esAdminOperativoActual()) return;
    d.ocupada = false;
    solicitudesCerrarNueva(true);
    d.raiz.querySelector('[data-solicitudes-confirmacion]').textContent = 'Solicitud registrada y aprobada. La mantención reactiva fue creada por el servidor.';
    d.contexto.pagina = 0;
    if (d.contexto.cargando) d.contexto.reconsultar = true;
    else await solicitudesCargar(d.raiz);
  } catch (error) {
    if (solicitudesNueva === d && d.dialogo.isConnected) mensaje.textContent = 'No se pudo confirmar el resultado. ' + (error.message || 'Error de conexión.') + ' Conservamos los datos y el identificador de operación. Reintenta con Registrar y aprobar; los campos quedan bloqueados para no reenviar contenidos distintos.';
  } finally {
    d.ocupada = false; d.contexto.guardando = false;
    if (solicitudesNueva === d && d.dialogo.isConnected) {
      // El reintento conserva exactamente el mismo UUID y contenido.
      d.dialogo.querySelectorAll('button').forEach(el => { el.disabled = false; });
    }
  }
}

async function solicitudesSincronizarRevision(ids) {
  if (currentView !== 'solicitudes') return;
  const raiz = document.getElementById('solicitudes-vista');
  const contexto = solicitudesContextos.get(raiz);
  if (!contexto || !solicitudesVistaActual(raiz)) return;
  if (contexto.cargando) contexto.reconsultar = true;
  else solicitudesCargar(raiz);
  const d = solicitudesDetalle;
  if (!d || d.ocupada || !ids.includes(d.id) || !d.dialogo.isConnected || d.usuarioId !== state.currentUser?.id) return;
  try {
    const fila = await window.SolicitudesService.obtener(d.id);
    if (solicitudesDetalle !== d || !d.dialogo.isConnected || !solicitudesVistaActual(raiz) || d.usuarioId !== state.currentUser?.id || d.ocupada) return;
    d.registro = fila;
    solicitudesDetalleContenido(d);
  } catch (error) {
    if (solicitudesDetalle === d && d.dialogo.isConnected) d.dialogo.querySelector('[data-solicitudes-decision-mensaje]').textContent = 'No se pudo actualizar la revisión. ' + (error.message || 'Error de conexión.');
  }
}

async function solicitudesVerMantencion(boton, indice, confirmada = null) {
  const raiz = boton.closest('#solicitudes-vista'), contexto = solicitudesContextos.get(raiz);
  const solicitud = confirmada ? {id:confirmada.solicitud_id,estado:confirmada.estado_solicitud} : contexto?.registros?.[indice];
  if (!contexto || contexto.abriendoMantencion || !solicitudesVistaActual(raiz) || solicitud?.estado !== 'aprobada' || solicitudesDetalle?.ocupada || solicitudesNueva?.dialogo.isConnected) return;
  const usuarioId = state.currentUser?.id;
  const estado = raiz.querySelector('[data-solicitudes-estado]');
  contexto.abriendoMantencion = true; boton.disabled = true;
  try {
    // Esta revalidación solo consulta el estado; no ejecuta escrituras.
    await revalidarEstadoAdministrativo();
    if (!solicitudesVistaActual(raiz) || usuarioId !== state.currentUser?.id) return;
    if (!esAdminOperativoActual() || !hasAccess('areas',state.currentUser?.role)) throw new Error('Ya no tienes autorización para acceder a Mantención Reactiva.');
    const id = confirmada ? confirmada.mantencion_reactiva_id : await window.SolicitudesService.vinculo(solicitud.id);
    if (!solicitudesVistaActual(raiz) || usuarioId !== state.currentUser?.id) return;
    if (!esAdminOperativoActual() || !hasAccess('areas',state.currentUser?.role)) throw new Error('Tu autorización cambió. Vuelve a consultar tus permisos.');
    if (!id) { boton.hidden = true; throw new Error('No hay una mantención vinculada disponible para esta solicitud.'); }
    solicitudesCerrarDetalle();
    navigateTo('areas','workarea_reactiva');
    const destino = document.getElementById('reactiva-vista')?.querySelector('[data-reactiva-actualizar]');
    if (!destino || currentView !== 'areas' || activeAreaFilter !== 'workarea_reactiva') throw new Error('No se pudo abrir el apartado Mantención Reactiva.');
    await reactivaAbrirFicha(destino,-1,id,solicitud.id);
  } catch (error) {
    const aviso = solicitudesVistaActual(raiz) ? estado : document.getElementById('reactiva-vista')?.querySelector('[data-reactiva-estado]');
    if (aviso) aviso.textContent = 'No se pudo abrir la mantención. ' + (error.message || 'Error de conexión.');
  } finally {
    contexto.abriendoMantencion = false;
    if (boton.isConnected) boton.disabled = false;
  }
}
