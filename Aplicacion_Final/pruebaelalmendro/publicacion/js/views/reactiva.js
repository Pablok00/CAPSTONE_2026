const reactivaContextos = new WeakMap();
let reactivaDetalle = null;
function reactivaEscape(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function reactivaFecha(valor) {
  return formatearFechaCL(valor,{vacio:'Sin fecha registrada'});
}
function reactivaEstado(valor) {
  if (!valor) return 'Sin estado registrado';
  if (valor === 'pendiente_asignacion') return 'Pendiente de asignación';
  const texto = String(valor).replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
function reactivaResponsable(registro) {
  if (registro.responsable_trabajador_id === null) return 'Sin asignar';
  return registro.responsable?.nombre?.trim() || 'Responsable asignado; nombre no disponible';
}
function reactivaSolicitante(registro) {
  return registro.solicitud?.creador_nombre_snapshot?.trim() || 'Usuario no disponible';
}
function reactivaVistaActual(raiz) {
  return raiz?.isConnected && document.getElementById('reactiva-vista') === raiz && currentView === 'areas' && activeAreaFilter === 'workarea_reactiva' && !areaSubVista;
}
function reactivaTarjetaHTML(r, indice) {
  const solicitud = r.solicitud;
  const etiqueta = 'display:inline-flex;align-items:center;border:1px solid var(--alm-border);border-radius:999px;padding:4px 10px;font-size:.75rem;line-height:1.4;background:var(--alm-inset);color:var(--alm-text)';
  return `<article class="alm-record-card" style="gap:12px">
    <div class="flex items-center justify-between gap-3"><span class="alm-module-icon"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span><span style="${etiqueta}">${reactivaEscape(reactivaEstado(r.estado))}</span></div>
    <div><h4 class="alm-record-title">${reactivaEscape(solicitud?.tipo_problema || 'Solicitud original no visible')}</h4><p class="text-sm alm-muted mt-1" style="overflow-wrap:anywhere">${reactivaEscape(solicitud?.ubicacion || 'Ubicación no disponible')}</p></div>
    <p class="text-sm alm-muted" style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;overflow-wrap:anywhere;line-height:1.6;min-height:4.8em">${reactivaEscape(solicitud?.descripcion || 'Descripción no disponible por permisos o solicitud no visible')}</p>
    <p class="text-sm alm-muted" style="overflow-wrap:anywhere">Solicitante: ${reactivaEscape(reactivaSolicitante(r))}</p><p class="text-xs alm-muted">Fecha de registro: ${reactivaEscape(reactivaFecha(r.created_at))}</p>
    <div style="margin-top:auto;border-top:1px solid var(--alm-border);padding-top:14px;display:flex;flex-direction:column;gap:12px">
      <p class="text-sm" style="overflow-wrap:anywhere"><span class="alm-muted">Responsable</span><br><strong>${reactivaEscape(reactivaResponsable(r))}</strong></p>
      <div class="flex flex-wrap items-center justify-between gap-3"><span style="${etiqueta}">Urgencia: ${reactivaEscape(solicitud?.urgencia === 'critica' ? 'Crítica' : solicitud?.urgencia || 'No disponible')}</span><button type="button" class="alm-btn-primary px-3 py-2" onclick="reactivaAbrirFicha(this,${indice})">Ver ficha</button></div>
    </div></article>`;
}
function reactivaFinalizadaHTML(r, indice) {
  return `<article class="alm-record-card reactiva-finalizada">
    <div style="min-width:0"><h4 class="alm-record-title" style="overflow-wrap:anywhere">${reactivaEscape(r.solicitud?.tipo_problema || 'Solicitud original no visible')}</h4><p class="text-sm alm-muted mt-1" style="overflow-wrap:anywhere">${reactivaEscape(r.solicitud?.ubicacion || 'Ubicación no disponible')}</p><p class="text-xs alm-muted mt-2">Fecha de registro: ${reactivaEscape(reactivaFecha(r.created_at))}</p></div>
    <span class="text-xs font-semibold px-3 py-1 rounded-full" style="border:1px solid var(--alm-border);background:var(--alm-inset);color:var(--alm-text)">Cerrada</span>
    <button type="button" class="alm-btn-primary px-3 py-2" onclick="reactivaAbrirFicha(this,${indice})">Ver ficha</button>
  </article>`;
}
function renderMantencionesReactivasView() {
  if (!hasAccess('areas', state.currentUser?.role)) return '<div class="alm-ui alm-panel p-5">No tienes acceso a Mantención Reactiva.</div>';
  setTimeout(() => {
    const raiz = document.getElementById('reactiva-vista');
    if (!reactivaVistaActual(raiz) || reactivaContextos.has(raiz)) return;
    reactivaContextos.set(raiz, { pagina: 0, grupo: 'activas', busqueda: '', secuencia: 0, cargando: false, registros: [], usuarioId: state.currentUser.id });
    reactivaCargar(raiz);
  }, 0);
  const boton = 'class="px-3 py-2 rounded-xl text-sm" style="border:1px solid var(--alm-border);background:var(--alm-inset);color:var(--alm-text)"';
  return `<div id="reactiva-vista" class="alm-ui alm-main-page alm-module-page space-y-4 pb-10">
    ${uiEncabezadoSeccion('Mantención Reactiva','Mantenciones registradas a partir de solicitudes aprobadas.','wrench')}
    <div role="tablist" aria-label="Estado de las mantenciones" class="flex flex-wrap gap-2"><button type="button" role="tab" data-reactiva-grupo="activas" aria-selected="true" aria-controls="reactiva-registros" onclick="reactivaCambiarGrupo(this,'activas')" class="alm-btn-primary px-4 py-2">Mantenciones activas</button><button type="button" role="tab" data-reactiva-grupo="finalizadas" aria-selected="false" aria-controls="reactiva-registros" onclick="reactivaCambiarGrupo(this,'finalizadas')" class="alm-btn-secondary px-4 py-2">Mantenciones finalizadas</button></div>
    <section id="reactiva-registros" class="alm-panel p-5 sm:p-6 space-y-4"><div class="flex flex-wrap items-center justify-between gap-3"><div class="flex flex-wrap items-center gap-3"><h3 class="text-lg font-bold">Mantenciones registradas</h3><span data-reactiva-total class="text-sm alm-muted" aria-live="polite"></span></div><button type="button" data-reactiva-actualizar onclick="reactivaActualizar(this)" ${boton}>Actualizar</button></div>
    <div data-reactiva-buscador hidden style="display:none"><label for="reactiva-busqueda" class="block text-sm font-medium mb-2">Buscar finalizadas por nombre o ubicación</label><input id="reactiva-busqueda" type="search" autocomplete="off" oninput="reactivaBuscar(this)" class="w-full rounded-xl px-3 py-2 text-sm" style="border:1px solid var(--alm-border);background:var(--alm-inset);color:var(--alm-text)" placeholder="Nombre de la mantención o ubicación"></div>
    <div data-reactiva-estado role="status" aria-live="polite">${uiCargandoHTML()}</div><div data-reactiva-lista class="alm-module-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))"></div>
    <div class="flex items-center justify-between gap-3"><button type="button" data-reactiva-anterior disabled onclick="reactivaPagina(this,-1)" ${boton}>Anterior</button><span data-reactiva-pagina class="text-sm alm-muted"></span><button type="button" data-reactiva-siguiente disabled onclick="reactivaPagina(this,1)" ${boton}>Siguiente</button></div></section></div>`;
}
function reactivaClaveCarga(contexto) {
  const u=state.currentUser;
  return JSON.stringify([u?.id,u?.role,u?.esAdminPermanente===true,u?.esAdminTemporal===true,u?.adminTemporalHasta||null,u?.permissions,contexto.pagina,contexto.grupo,contexto.busqueda]);
}
async function reactivaCargar(raiz, { remota = false } = {}) {
  const c=reactivaContextos.get(raiz);
  if (!c || !reactivaVistaActual(raiz) || c.usuarioId !== state.currentUser?.id || !hasAccess('areas',state.currentUser?.role)) return;
  const clave=reactivaClaveCarga(c), marca=window.SolicitudesSincronizacion?.marcaLectura?.() ?? null;
  const actual=c.peticion;
  if (remota && actual?.clave===clave) {
    if (marca!==null && actual.marca===marca) return actual.promesa;
    // Una lectura iniciada antes de la señal no cubre el hueco de suscripción.
    if (c.refrescoRemoto?.clave===clave) return c.refrescoRemoto.promesa;
    const espera={clave};c.refrescoRemoto=espera;
    espera.promesa=actual.promesa.then(()=>{
      if (c.refrescoRemoto===espera)c.refrescoRemoto=null;
      if (reactivaVistaActual(raiz) && reactivaClaveCarga(c)===clave) return reactivaCargar(raiz,{remota:true});
    });
    return espera.promesa;
  }
  if (remota && marca!==null && c.cobertura?.clave===clave && c.cobertura.marca===marca) return true;
  const peticion={clave,marca};
  c.peticion=peticion;
  c.cobertura=null;
  peticion.promesa=reactivaEjecutarCarga(raiz,remota).then(resultado=>{
    if (resultado===true && c.peticion===peticion && reactivaVistaActual(raiz) && reactivaClaveCarga(c)===clave) c.cobertura={clave,marca};
    return resultado;
  }).finally(()=>{if(c.peticion===peticion)c.peticion=null;});
  return peticion.promesa;
}
async function reactivaEjecutarCarga(raiz, remota) {
  const contexto = reactivaContextos.get(raiz);
  if (!contexto || !reactivaVistaActual(raiz)) return;
  clearTimeout(contexto.busquedaTimer);
  const secuencia = ++contexto.secuencia;
  const firmaPermisos = () => JSON.stringify([state.currentUser?.id,state.currentUser?.role,state.currentUser?.esAdminPermanente===true,state.currentUser?.esAdminTemporal===true,state.currentUser?.adminTemporalHasta||null,state.currentUser?.permissions]);
  const permisos = firmaPermisos();
  const vigente = () => reactivaVistaActual(raiz) && contexto.secuencia === secuencia && contexto.usuarioId === state.currentUser?.id && permisos === firmaPermisos() && hasAccess('areas', state.currentUser.role);
  contexto.cargando = true;
  const conservar = remota && contexto.claveVisible === reactivaClaveCarga(contexto);
  if (!conservar) contexto.registros = [];
  const nodo = selector => raiz.querySelector(selector);
  const anterior = nodo('[data-reactiva-anterior]'), siguiente = nodo('[data-reactiva-siguiente]'), actualizar = nodo('[data-reactiva-actualizar]');
  anterior.disabled = siguiente.disabled = actualizar.disabled = true;
  if (!conservar) {
  nodo('[data-reactiva-estado]').innerHTML = uiCargandoHTML();
  nodo('[data-reactiva-total]').textContent = '';
  nodo('[data-reactiva-lista]').innerHTML = '';
  nodo('[data-reactiva-pagina]').textContent = '';
  }
  try {
    const { registros, total } = await window.MantencionesReactivasService.listar(contexto.pagina, { grupo: contexto.grupo, busqueda: contexto.busqueda });
    if (!vigente()) return;
    if (contexto.pagina > 0 && !registros.length && total > 0) {
      contexto.pagina = Math.max(0, Math.ceil(total / 20) - 1);
      return await reactivaCargar(raiz);
    }
    if (!total) contexto.pagina = 0;
    contexto.claveVisible = reactivaClaveCarga(contexto);
    contexto.registros = registros;
    contexto.total = total;
    nodo('[data-reactiva-estado]').textContent = total ? `${total} mantenciones ${contexto.grupo} visibles para tu cuenta.` : contexto.busqueda && contexto.grupo === 'finalizadas' ? 'No hay mantenciones finalizadas que coincidan con la búsqueda.' : `No hay mantenciones ${contexto.grupo} disponibles para tu cuenta.`;
    nodo('[data-reactiva-total]').textContent = `${total} ${total === 1 ? 'mantención' : 'mantenciones'}`;
    nodo('[data-reactiva-lista]').style.gridTemplateColumns = contexto.grupo === 'finalizadas' ? 'minmax(0,1fr)' : 'repeat(auto-fit,minmax(min(100%,280px),1fr))';
    nodo('[data-reactiva-lista]').innerHTML = registros.map(contexto.grupo === 'finalizadas' ? reactivaFinalizadaHTML : reactivaTarjetaHTML).join('');
    nodo('[data-reactiva-pagina]').textContent = `Página ${contexto.pagina + 1} de ${Math.max(1, Math.ceil(total / 20))}`;
    anterior.disabled = contexto.pagina === 0;
    siguiente.disabled = (contexto.pagina + 1) * 20 >= total;
    return true;
  } catch (error) {
    if (vigente()) nodo('[data-reactiva-estado]').textContent = 'No se pudieron consultar las mantenciones. ' + (error.message || 'Error de conexión.');
    return false;
  } finally {
    if (contexto.secuencia === secuencia) {
      contexto.cargando = false;
      if (reactivaVistaActual(raiz)) actualizar.disabled = false;
    }
  }
}
function reactivaCambiarGrupo(boton, grupo) {
  const raiz = boton.closest('#reactiva-vista'), contexto = reactivaContextos.get(raiz);
  if (!contexto || !['activas', 'finalizadas'].includes(grupo) || contexto.grupo === grupo) return;
  contexto.grupo = grupo;
  contexto.pagina = 0;
  raiz.querySelectorAll('[data-reactiva-grupo]').forEach(tab => {
    const elegida = tab.dataset.reactivaGrupo === grupo;
    tab.setAttribute('aria-selected', String(elegida));
    tab.className = (elegida ? 'alm-btn-primary' : 'alm-btn-secondary') + ' px-4 py-2';
  });
  const buscador = raiz.querySelector('[data-reactiva-buscador]');
  buscador.hidden = grupo !== 'finalizadas';
  buscador.style.display = grupo === 'finalizadas' ? '' : 'none';
  reactivaCargar(raiz);
}
function reactivaBuscar(campo) {
  const raiz = campo.closest('#reactiva-vista'), contexto = reactivaContextos.get(raiz);
  if (!contexto || contexto.grupo !== 'finalizadas') return;
  clearTimeout(contexto.busquedaTimer);
  contexto.busqueda = campo.value;
  contexto.pagina = 0;
  ++contexto.secuencia; // Invalidar también respuestas recibidas durante el debounce.
  contexto.registros = [];
  contexto.cargando = true;
  raiz.querySelector('[data-reactiva-lista]').innerHTML = '';
  raiz.querySelector('[data-reactiva-total]').textContent = '';
  raiz.querySelector('[data-reactiva-pagina]').textContent = '';
  raiz.querySelector('[data-reactiva-estado]').textContent = 'Buscando mantenciones finalizadas…';
  ['anterior', 'siguiente', 'actualizar'].forEach(accion => { raiz.querySelector('[data-reactiva-' + accion + ']').disabled = true; });
  contexto.busquedaTimer = setTimeout(() => reactivaCargar(raiz), 300);
}
function reactivaActualizar(boton) {
  const raiz = boton.closest('#reactiva-vista'), contexto = reactivaContextos.get(raiz);
  if (!contexto || contexto.cargando) return;
  contexto.pagina = 0;
  reactivaCargar(raiz);
}
function reactivaPagina(boton, cambio) {
  const raiz = boton.closest('#reactiva-vista'), contexto = reactivaContextos.get(raiz);
  if (!contexto || contexto.cargando) return;
  const pagina = contexto.pagina + cambio;
  if (pagina < 0 || pagina * 20 >= contexto.total) return;
  contexto.pagina = pagina;
  reactivaCargar(raiz);
}
function reactivaCerrarFicha() {
  if (reactivaDetalle?.ocupada || reactivaDetalle?.trabajadorAbierto) return;
  const anterior = reactivaDetalle;
  reactivaDetalle = null;
  if (anterior) {
    anterior.invalidada = true;
    anterior.asignacion = anterior.borradorEstado = null;
    anterior.historialSecuencia = (anterior.historialSecuencia || 0) + 1;
  }
  document.getElementById('reactiva-ficha-modal')?.remove();
  document.removeEventListener('keydown', reactivaFichaTeclado, true);
  if (anterior) document.body.style.overflow = anterior.overflow;
  if (anterior?.foco?.isConnected) anterior.foco.focus();
}
function reactivaFichaTeclado(event) {
  if (solicitudesEliminacion) return;
  // UX-02: la ficha se cierra únicamente mediante controles explícitos.
  if (!reactivaDetalle || event.key !== 'Tab') return;
  const dialogo = reactivaDetalle.trabajadorAbierto ? document.getElementById('modal-trabajador-form') : reactivaDetalle.dialogo;
  const botones = [...dialogo.querySelectorAll('button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),summary')].filter(el => el.getClientRects().length);
  const primero = botones[0], ultimo = botones[botones.length - 1];
  if (!primero) { event.preventDefault(); return; }
  if (event.shiftKey && document.activeElement === primero) { event.preventDefault(); ultimo.focus(); }
  else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primero.focus(); }
}
async function reactivaAbrirFicha(boton, indice, mantencionId = null, solicitudId = null) {
  if (mantencionId && (!esAdminOperativoActual() || !hasAccess('areas',state.currentUser?.role))) return;
  if (reactivaDetalle?.ocupada || reactivaDetalle?.trabajadorAbierto) return;
  const raiz = boton.closest('#reactiva-vista'), contexto = reactivaContextos.get(raiz);
  const registro = mantencionId ? { id:mantencionId } : contexto?.registros[indice];
  if (!registro || !reactivaVistaActual(raiz)) return;
  reactivaCerrarFicha();
  const dialogo = document.createElement('div');
  dialogo.id = 'reactiva-ficha-modal';
  dialogo.className = 'alm-ui hidden fixed inset-0 z-50 flex items-center justify-center p-4';
  dialogo.style.background = 'rgba(2,6,23,0.7)';
  dialogo.setAttribute('role','dialog');
  dialogo.setAttribute('aria-modal','true');
  dialogo.setAttribute('aria-labelledby','reactiva-ficha-titulo');
  dialogo.innerHTML = `<section class="alm-panel reactiva-ficha-panel"><header style="flex-shrink:0" class="flex items-center justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-700"><h2 id="reactiva-ficha-titulo" class="alm-title">Ficha de mantención reactiva</h2><button type="button" onclick="reactivaCerrarFicha()" aria-label="Cerrar ficha" class="px-3 py-2 rounded-xl">✕</button></header><div data-reactiva-ficha-contenido class="reactiva-ficha-contenido"><p role="status">Cargando ficha…</p></div><footer style="flex-shrink:0" class="p-3 border-t border-slate-200 dark:border-slate-700"><button type="button" onclick="reactivaCerrarFicha()" class="px-4 py-2 rounded-xl" style="border:1px solid var(--alm-border)">Cerrar</button></footer></section>`;
  const detalle = { id: registro.id, dialogo, raiz, foco: boton, overflow: document.body.style.overflow, usuarioId: state.currentUser.id, ocupada: false };
  reactivaDetalle = detalle;
  document.body.appendChild(dialogo);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown',reactivaFichaTeclado,true);
  openModal(dialogo.id);
  dialogo.querySelector('button').focus();
  try {
    const fila = await window.MantencionesReactivasService.obtener(registro.id);
    if (reactivaDetalle !== detalle || !reactivaVistaActual(raiz) || detalle.usuarioId !== state.currentUser?.id || !hasAccess('areas',state.currentUser?.role)) {
      if (reactivaDetalle === detalle) reactivaCerrarFicha();
      return;
    }
    if (mantencionId && (!esAdminOperativoActual() || fila.id !== mantencionId || fila.solicitud_id !== solicitudId)) throw new Error('La mantención vinculada ya no está disponible o tu autorización cambió.');
    detalle.registro = fila;
    reactivaMostrarFicha(detalle,fila);
  } catch (error) {
    if (reactivaDetalle === detalle) {
      if (!reactivaVistaActual(raiz) || detalle.usuarioId !== state.currentUser?.id) reactivaCerrarFicha();
      else dialogo.querySelector('[data-reactiva-ficha-contenido]').textContent = 'No se pudo consultar la ficha. ' + (error.message || 'Error de conexión.');
    }
  }
}
function reactivaPermiteAsignacion(r) {
  return !!r && !r.resuelta_en && !r.cerrada_en && !/^(resuelt[ao]|cerrad[ao])$/.test(r.estado);
}
function reactivaIconoMetadato(tipo) {
  const trazos={editar:'<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/>',desplegar:'<path d="m6 9 6 6 6-6"/>',ubicacion:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',urgencia:'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/>',responsable:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',fecha:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',solicitante:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m2-13h5m-5 4h5"/>'};
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(trazos[tipo]||'')+'</svg>';
}
function reactivaFichaHTML(r, pestana = 'gestion') {
  if(!['gestion','solicitud','historial'].includes(pestana))pestana='gestion';
  const s=r.solicitud;
  const dato=(etiqueta,valor)=>'<div><dt>'+etiqueta+'</dt><dd>'+reactivaEscape(valor??'Sin dato registrado')+'</dd></div>';
  const fecha=(etiqueta,valor)=>dato(etiqueta,reactivaFecha(valor));
  const meta=(icono,etiqueta,valor,clase='')=>'<div class="reactiva-meta-item"><dt>'+reactivaIconoMetadato(icono)+'<span>'+etiqueta+'</span></dt><dd><span'+(clase?' class="'+clase+'"':'')+'>'+reactivaEscape(valor??'No disponible')+'</span></dd></div>';
  const urgencia={baja:'Baja',media:'Media',alta:'Alta',critica:'Crítica'}[s?.urgencia]||'No disponible';
  const responsable=reactivaResponsable(r)+(r.responsable?.cargo?' — '+r.responsable.cargo:'');
  const tabs=[['gestion','Gestión'],['solicitud','Solicitud'],['historial','Historial']];
  const visible=id=>id===pestana?'':' hidden style="display:none"';
  const tono=r.estado==='cerrada'?'cerrada':r.estado==='resuelta'?'resuelta':r.estado==='en_proceso'?'proceso':'pendiente';
  const trabajo=r.detalle_ejecucion&&(r.estado!=='en_proceso'||!esAdminOperativoActual())?dato('Trabajo realizado',r.detalle_ejecucion):'';
  const cierre=r.observaciones_cierre&&(r.estado!=='resuelta'||!esAdminOperativoActual())?dato('Observaciones de cierre',r.observaciones_cierre):'';
  return '<header class="reactiva-resumen" aria-label="Resumen de la mantención"><span class="reactiva-estado reactiva-estado-'+tono+'">'+reactivaEscape(reactivaEstado(r.estado))+'</span><h3>'+reactivaEscape(s?.tipo_problema||'Solicitud no visible')+'</h3><p class="reactiva-ubicacion">'+reactivaIconoMetadato('ubicacion')+'<span>'+reactivaEscape(s?.ubicacion||'Ubicación no disponible')+'</span></p><dl class="reactiva-meta">'+meta('urgencia','Urgencia',urgencia,['alta','critica'].includes(s?.urgencia)?'reactiva-urgencia-alta':'')+meta('responsable','Responsable',responsable)+meta('fecha','Fecha de registro',reactivaFecha(r.created_at))+meta('solicitante','Solicitante',reactivaSolicitante(r))+'</dl></header>'+
    '<nav class="reactiva-ficha-tabs" role="tablist" aria-label="Información de mantención">'+tabs.map(([id,titulo])=>'<button id="reactiva-tab-'+id+'" type="button" role="tab" data-reactiva-tab="'+id+'" aria-controls="reactiva-panel-'+id+'" aria-selected="'+(id===pestana)+'" aria-pressed="'+(id===pestana)+'" tabindex="'+(id===pestana?'0':'-1')+'" onclick="reactivaCambiarPestana(\''+id+'\')" onkeydown="reactivaTecladoPestanas(event)">'+titulo+'</button>').join('')+'</nav>'+
    '<div data-reactiva-paneles><section id="reactiva-panel-gestion" role="tabpanel" aria-labelledby="reactiva-tab-gestion" data-reactiva-panel="gestion"'+visible('gestion')+' class="reactiva-gestion">'+
    '<section data-reactiva-asignacion-bloque class="reactiva-gestion-bloque"><h3'+(esAdminOperativoActual()&&reactivaPermiteAsignacion(r)?'':' hidden')+'><button type="button" data-reactiva-asignar class="alm-btn-secondary reactiva-cambiar-responsable" aria-controls="reactiva-paso-responsable" aria-expanded="false" onclick="reactivaAbrirPasoResponsable()"'+(esAdminOperativoActual()&&reactivaPermiteAsignacion(r)?'':' disabled')+'>Asignación'+'</button></h3><p data-reactiva-asignacion-resumen class="text-sm alm-muted"></p><div id="reactiva-paso-responsable" data-reactiva-paso="responsable" hidden style="display:none"><div data-reactiva-asignacion></div></div><p data-reactiva-gestion-mensaje role="status" aria-live="polite" class="text-sm alm-muted"></p></section>'+
    '<section class="reactiva-gestion-bloque" data-reactiva-seguimiento-bloque><h3 data-reactiva-seguimiento-titulo>2. Seguimiento</h3><p data-reactiva-paso-ayuda class="reactiva-ayuda" hidden>Guarda un responsable o justifica la no asignación antes de iniciar.</p><div id="reactiva-paso-seguimiento" data-reactiva-paso="seguimiento">'+reactivaAccionEstadoHTML(r)+'</div><p data-reactiva-estado-mensaje role="status" aria-live="polite" class="text-sm alm-muted"></p></section>'+
    '<button type="button" data-reactiva-refrescar hidden class="hidden alm-btn-secondary px-3 py-2" onclick="reactivaActualizarFicha()">Actualizar ficha antes de continuar</button>'+
    (trabajo||cierre?'<dl class="reactiva-datos reactiva-registro-trabajo">'+trabajo+cierre+'</dl>':'')+
    '</section>'+
    '<section id="reactiva-panel-solicitud" role="tabpanel" aria-labelledby="reactiva-tab-solicitud" data-reactiva-panel="solicitud"'+visible('solicitud')+'><dl class="reactiva-datos">'+(s?dato('Descripción del problema',s.descripcion||'Sin descripción registrada')+dato('Estado de solicitud',reactivaEstado(s.estado))+dato('Observaciones de la solicitud',s.observaciones||'Sin observaciones registradas')+fecha('Fecha de solicitud',s.created_at)+fecha('Actualización de solicitud',s.updated_at):dato('Antecedentes','Solicitud no visible por permisos o relación no disponible.'))+'</dl></section>'+
    '<section id="reactiva-panel-historial" role="tabpanel" aria-labelledby="reactiva-tab-historial" data-reactiva-panel="historial"'+visible('historial')+'><div data-reactiva-historial><p role="status" class="text-sm alm-muted">Cargando historial real…</p></div></section>'+
    (esAdminPermanenteActual() ? '<button type="button" class="alm-btn-danger alm-delete-entry" onclick="reactivaEliminarActual()"><svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg><span>Eliminar solicitud y mantención</span></button>' : '') +
    '</div>';
}
function reactivaCambiarPestana(nombre) {
  const d = reactivaDetalle;
  if (!d || d.ocupada || d.trabajadorAbierto || !['gestion','solicitud','historial'].includes(nombre)) return;
  const contenedor = d.dialogo.querySelector('[data-reactiva-ficha-contenido]');
  d.pestanaActiva=nombre;
  const actual = d.dialogo.querySelector('[data-reactiva-tab][aria-selected="true"]')?.dataset.reactivaTab || 'gestion';
  d.scrollPestanas ||= {};
  d.scrollPestanas[actual] = contenedor.scrollTop;
  reactivaCerrarOpciones();
  d.dialogo.querySelectorAll('[data-reactiva-tab]').forEach(boton => {
    const activa = boton.dataset.reactivaTab === nombre;
    boton.setAttribute('aria-selected',String(activa));
    boton.setAttribute('aria-pressed',String(activa));
    boton.tabIndex = activa ? 0 : -1;
  });
  d.dialogo.querySelectorAll('[data-reactiva-panel]').forEach(panel => {
    const activo = panel.dataset.reactivaPanel === nombre;
    panel.hidden = !activo;
    panel.style.display = activo ? 'block' : 'none';
  });
  contenedor.scrollTop = d.scrollPestanas[nombre] || 0;
}
function reactivaTecladoPestanas(event) {
  const nombres = ['gestion','solicitud','historial'];
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || reactivaDetalle?.ocupada || reactivaDetalle?.trabajadorAbierto) return;
  event.preventDefault();
  const actual = nombres.indexOf(event.currentTarget.dataset.reactivaTab);
  const indice = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (actual + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
  reactivaCambiarPestana(nombres[indice]);
  reactivaDetalle.dialogo.querySelector('[data-reactiva-tab="' + nombres[indice] + '"]').focus();
}
function reactivaContextoGestion(detalle) {
  return detalle && !detalle.invalidada && reactivaDetalle === detalle && reactivaVistaActual(detalle.raiz) && detalle.usuarioId === state.currentUser?.id && esAdminOperativoActual();
}
function reactivaMensajeGestion(detalle, mensaje, operacion = detalle.operacionVisual || 'asignacion') {
  detalle.operacionVisual = operacion;
  const selector = operacion === 'estado' ? '[data-reactiva-estado-mensaje]' : '[data-reactiva-gestion-mensaje]';
  detalle.dialogo.querySelectorAll('[data-reactiva-gestion-mensaje],[data-reactiva-estado-mensaje]').forEach(el => { el.textContent = ''; });
  const destino = detalle.dialogo.querySelector(selector);
  if (destino) destino.textContent = mensaje;
}
function reactivaBloquearGestion(detalle, bloquear) {
  detalle.ocupada = bloquear;
  detalle.dialogo.querySelectorAll('button,input,select,textarea').forEach(el => {
    el.disabled = bloquear || detalle.invalidada || (el.matches('[data-reactiva-confirmar]') && (detalle.requiereActualizar || !detalle.trabajadoresDisponibles)) || (el.matches('[data-reactiva-estado-enviar]') && detalle.requiereActualizar);
  });
  reactivaActualizarMotivoAsignacion(detalle);
  const refrescar=detalle.dialogo.querySelector('[data-reactiva-refrescar]');
  if(refrescar){refrescar.hidden=!detalle.requiereActualizar;if(refrescar.hidden)refrescar.classList.add('hidden');else refrescar.classList.remove('hidden');}
}
// Evidencia de lectura autorizada, ligada a la revisión y al ciclo de esta ficha.
function reactivaAsignacionAcreditada(d) {
  const r=d?.registro;if(!r)return false;
  if (!['pendiente_asignacion','asignada'].includes(r.estado)) return true;
  if (typeof r.responsable_trabajador_id==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.responsable_trabajador_id)) return true;
  const e=d.evidenciaAsignacion;
  return !!e && e.id===r.id && e.usuarioId===state.currentUser?.id && e.revision===String(r.revision) && e.ciclo===r.ciclo_actual && e.justificada===true;
}
function reactivaEvidenciaAsignacion(d,historial) {
  const r=d.registro,eventos=historial.eventos||[];
  const propios=eventos.filter(e=>e.mantencion_reactiva_id===r.id && e.solicitud_id===r.solicitud_id);
  const reaperturas=propios.filter(e=>e.evento==='reabierta');
  const tiempos=reaperturas.map(e=>Date.parse(e.created_at));
  let frontera=Date.parse(r.created_at);
  if (tiempos.length) frontera=Math.max(...tiempos);
  const cicloVerificable=Number(r.ciclo_actual)===1 || reaperturas.some(e=>String(e.detalle?.ciclo_nuevo)===String(r.ciclo_actual));
  const cronologiaValida=propios.filter(e=>['reabierta','asignada','reasignada','asignacion_retirada','sin_asignar_justificada'].includes(e.evento)).every(e=>Number.isFinite(Date.parse(e.created_at)));
  const justificada=cronologiaValida && cicloVerificable && Number.isFinite(frontera) && propios.some(e=>{
    if(!['sin_asignar_justificada','asignacion_retirada'].includes(e.evento))return false;
    const longitud=Array.from(String(e.motivo||'').trim()).length,fecha=Date.parse(e.created_at);
    const posterior=propios.some(otro=>otro!==e && ['asignada','reasignada','asignacion_retirada','sin_asignar_justificada'].includes(otro.evento) && Date.parse(otro.created_at)>=fecha);
    return !posterior && longitud>=5 && longitud<=1000 && Number.isFinite(fecha) && (reaperturas.length ? fecha>frontera : fecha>=frontera);
  });
  return {id:r.id,usuarioId:d.usuarioId,revision:String(r.revision),ciclo:r.ciclo_actual,justificada};
}
function reactivaActualizarRequisito(d) {
  const inicial=['pendiente_asignacion','asignada'].includes(d.registro.estado);
  const acreditada=reactivaAsignacionAcreditada(d);
  const resumen=d.dialogo.querySelector('[data-reactiva-asignacion-resumen]');
  if(resumen)resumen.textContent=!inicial ? (d.registro.responsable_trabajador_id ? 'Responsable guardado: '+reactivaResponsable(d.registro) : d.evidenciaAsignacion?.justificada ? 'Sin asignar: justificación registrada.' : 'Sin responsable asignado.') : acreditada ? (d.registro.responsable_trabajador_id ? 'Responsable guardado: '+reactivaResponsable(d.registro) : 'Sin asignar: justificación registrada.') : d.requiereActualizar || d.historialAsignacionError ? 'Actualiza la ficha para verificar la asignación.' : d.historialCargando ? 'Verificando asignación guardada…' : 'Guarda un responsable o justifica la no asignación antes de iniciar.';
  d.dialogo.querySelector('[data-reactiva-asignar]').innerHTML=(acreditada?reactivaIconoMetadato('editar'):'')+'<span>'+(acreditada?'Cambiar responsable':'Asignación')+'</span>';
  resumen.hidden=!!d.registro.responsable_trabajador_id;
  if(resumen.hidden)resumen.textContent='';
  const editable=esAdminOperativoActual()&&reactivaPermiteAsignacion(d.registro);
  d.dialogo.querySelector('[data-reactiva-asignacion-bloque]').hidden=!editable&&resumen.hidden;
  if(!inicial)return;
  if(acreditada && d.asignacion?.sinConfirmar && !d.dialogo.querySelector('[data-reactiva-buscar]').value.trim() && !d.dialogo.querySelector('[data-reactiva-motivo]').value.trim()) {
    d.asignacion=null;d.dialogo.querySelector('[data-reactiva-asignacion]').innerHTML='';
  }
  d.dialogo.querySelector('#reactiva-paso-seguimiento').innerHTML=reactivaAccionEstadoHTML(d.registro);
  const iniciar=d.dialogo.querySelector('[data-reactiva-estado-enviar]');
  if(iniciar)iniciar.disabled=!!d.ocupada||!!d.requiereActualizar||!!d.invalidada;
  reactivaMostrarPaso(d.asignacion?'responsable':acreditada?'seguimiento':'responsable');
}
function reactivaMostrarPaso(paso) {
  const d = reactivaDetalle;
  if (!d) return;
  if (paso==='seguimiento' && !reactivaAsignacionAcreditada(d)) paso='responsable';
  d.pasoGestion = paso;
  d.dialogo.querySelectorAll('[data-reactiva-paso]').forEach(panel => {
    const abierto = panel.dataset.reactivaPaso === paso;
    panel.hidden = !abierto;
    panel.style.display = abierto ? 'block' : 'none';
  });
  d.dialogo.querySelector('[data-reactiva-asignar]').setAttribute('aria-expanded', String(paso === 'responsable'));
  const ayuda = d.dialogo.querySelector('[data-reactiva-paso-ayuda]');
  ayuda.hidden = true;
  ayuda.style.display = 'none';
  const seguimiento=d.dialogo.querySelector('[data-reactiva-seguimiento-bloque]');
  if(seguimiento)seguimiento.hidden=paso==='responsable';
  d.dialogo.querySelector('[data-reactiva-seguimiento-titulo]').style.color = paso === 'seguimiento' ? 'var(--alm-text)' : 'var(--alm-muted)';
}
function reactivaAbrirPasoResponsable() {
  const d = reactivaDetalle;
  if (!reactivaContextoGestion(d) || d.ocupada || d.trabajadorAbierto || d.requiereActualizar || !reactivaPermiteAsignacion(d.registro)) return;
  reactivaConservarBorradorEstado();
  reactivaMostrarPaso('responsable');
  reactivaAbrirAsignacion();
}
function reactivaContinuarSinAsignar() {
  const d = reactivaDetalle;
  if (!reactivaContextoGestion(d) || d.ocupada || d.trabajadorAbierto || d.registro.responsable_trabajador_id) return;
  reactivaCancelarAsignacion();
}
async function reactivaAbrirAsignacion() {
  const d = reactivaDetalle;
  if (!reactivaContextoGestion(d) || d.ocupada || d.trabajadorAbierto || d.requiereActualizar || !reactivaPermiteAsignacion(d.registro)) return;
  if (d.asignacion) return;
  reactivaMensajeGestion(d,'','asignacion');
  d.asignacion = { base: Object.freeze({ ...d.registro }), elegido: d.registro.responsable_trabajador_id, sinConfirmar: d.registro.responsable_trabajador_id === null, trabajadores: [] };
  d.dialogo.querySelector('[data-reactiva-asignacion]').innerHTML = `<div class="reactiva-asignacion-form space-y-3"><div data-reactiva-combo><label for="reactiva-responsable" class="block text-sm font-medium">Trabajador responsable</label><div class="reactiva-selector-control"><input id="reactiva-responsable" data-reactiva-buscar type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="reactiva-responsables-opciones" aria-describedby="reactiva-responsables-ayuda" autocomplete="off" placeholder="Despliega para elegir un responsable" oninput="reactivaEscribirTrabajador(this.value)" onfocus="reactivaMostrarOpciones();this.select()" onclick="if(this.getAttribute('aria-expanded')!=='true')reactivaMostrarOpciones()" onblur="reactivaSalirOpciones()" onkeydown="reactivaTecladoOpciones(event)" class="w-full rounded-xl px-3 py-2 mt-1" style="border:1px solid var(--alm-border);background:var(--alm-inset);color:var(--alm-text)"><button type="button" data-reactiva-desplegar aria-label="Abrir o cerrar opciones de responsables" aria-haspopup="listbox" aria-controls="reactiva-responsables-opciones" aria-expanded="false" onpointerdown="event.preventDefault()" onclick="reactivaAlternarOpciones()" onkeydown="reactivaTecladoDesplegable(event)" onblur="reactivaSalirOpciones()">${reactivaIconoMetadato('desplegar')}</button></div><div id="reactiva-responsables-opciones" data-reactiva-opciones role="listbox" aria-label="Trabajadores y opciones" hidden style="display:none;max-height:220px;overflow-y:auto;border:1px solid var(--alm-border);background:var(--alm-surface);border-radius:10px;margin-top:4px"></div></div><p id="reactiva-responsables-ayuda" data-reactiva-trabajadores-estado class="text-sm alm-muted" role="status">Cargando trabajadores…</p><div data-reactiva-motivo-grupo hidden><label class="block text-sm font-medium"><span data-reactiva-motivo-etiqueta>Motivo obligatorio</span><textarea data-reactiva-motivo rows="2" minlength="5" maxlength="1000" oninput="reactivaActualizarMotivoAsignacion(reactivaDetalle)" class="w-full rounded-xl px-3 py-2 mt-1" style="border:1px solid var(--alm-border);background:var(--alm-inset);color:var(--alm-text)"></textarea></label></div><div class="flex flex-wrap gap-3">${reactivaAsignacionAcreditada(d)?'<button type="button" onclick="reactivaCancelarAsignacion()" class="alm-btn-secondary px-4 py-2">Cancelar</button>':''}<button type="button" data-reactiva-confirmar onclick="reactivaGuardarAsignacion()" class="alm-btn-primary px-4 py-2">Guardar</button></div></div>`;
  await reactivaCargarTrabajadores(d);
}
async function reactivaCargarTrabajadores(d, elegidoNuevo) {
  const asignacion = d.asignacion;
  reactivaBloquearGestion(d,true);
  try {
    const trabajadores = await window.TrabajadoresService.getTrabajadores(true);
    if (!reactivaContextoGestion(d) || d.asignacion !== asignacion) return;
    asignacion.trabajadores = trabajadores.filter(t => t.estado === 'Activo');
    if (elegidoNuevo) {
      if (!asignacion.trabajadores.some(t => t.id === elegidoNuevo)) {
        const nuevo = await window.TrabajadoresService.getTrabajador(elegidoNuevo,true);
        if (!reactivaContextoGestion(d) || d.asignacion !== asignacion) return;
        if (nuevo?.id !== elegidoNuevo || nuevo.estado !== 'Activo') throw new Error('El trabajador creado no está disponible para asignación.');
        asignacion.trabajadores.push(nuevo);
      }
      asignacion.elegido = elegidoNuevo;
      asignacion.sinConfirmar = false;
    }
    asignacion.trabajadores.sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es',{sensitivity:'base',numeric:true})||String(a.id).localeCompare(String(b.id)));
    d.trabajadoresDisponibles = true;
    reactivaTextoSeleccionado(d);
    reactivaCerrarOpciones();
    d.dialogo.querySelector('[data-reactiva-trabajadores-estado]').textContent = '';
    return true;
  } catch (error) {
    d.trabajadoresDisponibles = false;
    d.dialogo.querySelector('[data-reactiva-trabajadores-estado]').textContent='';
    reactivaMensajeGestion(d,'No se pudieron consultar los trabajadores. ' + (error.message || 'Error de conexión.'));
    return false;
  } finally {
    if (reactivaDetalle === d) {
      reactivaBloquearGestion(d,false);

    }
  }
}
function reactivaActualizarMotivoAsignacion(d) {
  const a=d?.asignacion;if(!a)return;
  const sinCambio=a.elegido===a.base.responsable_trabajador_id;
  const justificacionSinAsignar=a.base.responsable_trabajador_id===null&&a.elegido===null&&a.base.estado==='pendiente_asignacion';
  const grupo=d.dialogo.querySelector('[data-reactiva-motivo-grupo]');
  const campo=d.dialogo.querySelector('[data-reactiva-motivo]');
  const exigeMotivo=!a.sinConfirmar&&(a.elegido===null||(!!a.base.responsable_trabajador_id&&!sinCambio));
  grupo.hidden=!exigeMotivo;campo.hidden=false;campo.required=exigeMotivo;
  d.dialogo.querySelector('[data-reactiva-motivo-etiqueta]').textContent=a.elegido===null?(a.base.responsable_trabajador_id?'Motivo del retiro (obligatorio)':'Motivo de no asignación'):'Motivo del cambio (obligatorio)';
  const longitud=Array.from(campo.value.trim()).length;
  const motivoValido=!exigeMotivo||(longitud>=5&&longitud<=1000);
  const destinoValido=a.elegido===null||a.trabajadores.some(t=>t.id===a.elegido);
  d.dialogo.querySelector('[data-reactiva-confirmar]').disabled=!!d.ocupada||!!d.invalidada||!!d.requiereActualizar||!!d.trabajadorAbierto||!d.trabajadoresDisponibles||!!a.sinConfirmar||(sinCambio&&!justificacionSinAsignar)||!destinoValido||!motivoValido;
  const flecha=d.dialogo.querySelector('[data-reactiva-desplegar]');
  if(flecha)flecha.disabled=!!d.ocupada||!!d.invalidada||!!d.trabajadorAbierto||!d.trabajadoresDisponibles;
}
function reactivaCancelarAsignacion() {
  const d = reactivaDetalle;
  if (!d || d.ocupada || d.trabajadorAbierto || !reactivaAsignacionAcreditada(d)) return;
  d.asignacion = null;
  d.dialogo.querySelector('[data-reactiva-asignacion]').innerHTML = '';
  reactivaMensajeGestion(d,'');
  reactivaMostrarPaso('seguimiento');
}
async function reactivaNuevoTrabajador() {
  const d = reactivaDetalle;
  if (!reactivaContextoGestion(d) || d.ocupada || d.trabajadorAbierto || !d.asignacion) return;
  reactivaMensajeGestion(d,'','asignacion');
  reactivaCerrarOpciones();
  reactivaBloquearGestion(d,true);
  try {
    if (!await revalidarPrivilegioParaEscritura() || !reactivaContextoGestion(d)) throw new Error('No tienes autorización administrativa vigente.');
    d.trabajadorAbierto = true;
    d.dialogo.inert = true;
    const terminar = () => {
      d.trabajadorAbierto = false; d.dialogo.inert = false;
      const modal = document.getElementById('modal-trabajador-form');
      if (modal) modal.style.zIndex = '';
      if (reactivaDetalle === d) d.dialogo.querySelector('[data-reactiva-buscar]')?.focus();
    };
    abrirTrabajadorFormulario('nuevo',null,{
      alCerrar: terminar,
      alGuardar: async trabajador => {
        if (!reactivaContextoGestion(d) || !d.asignacion) return;
        if (!trabajador?.id) {
          reactivaMensajeGestion(d,'El registro no devolvió el identificador del trabajador. Actualiza los datos antes de continuar; no se seleccionará una coincidencia solo por nombre.');
          return;
        }
        if (await reactivaCargarTrabajadores(d,trabajador.id)) {
          reactivaMensajeGestion(d,'Trabajador registrado. Pulsa Guardar para asignarlo.');
        }
      }
    });
    const modal = document.getElementById('modal-trabajador-form');
    modal.style.zIndex = '60';
    document.getElementById('tform-nombre').focus();
  } catch (error) {
    d.trabajadorAbierto = false; d.dialogo.inert = false;
    reactivaMensajeGestion(d,error.message || 'No se pudo abrir el formulario de trabajador.');
  } finally {
    if (reactivaDetalle === d) reactivaBloquearGestion(d,false);
  }
}
async function reactivaGuardarAsignacion() {
  const d = reactivaDetalle;
  if (!reactivaContextoGestion(d) || d.ocupada || d.trabajadorAbierto || d.requiereActualizar || !d.asignacion || !d.trabajadoresDisponibles) return;
  reactivaMensajeGestion(d,'','asignacion');
  const a = d.asignacion;
  if (a.sinConfirmar) { reactivaMensajeGestion(d,'Selecciona un trabajador de las sugerencias o elige Sin asignar. Escribir un nombre no confirma una selección.'); return; }
  const motivo = a.base.responsable_trabajador_id||a.elegido===null?d.dialogo.querySelector('[data-reactiva-motivo]').value.trim():'';
  const justificacionSinAsignar=a.base.responsable_trabajador_id===null&&a.elegido===null&&a.base.estado==='pendiente_asignacion';
  if (a.elegido === a.base.responsable_trabajador_id&&!justificacionSinAsignar) { reactivaMensajeGestion(d,'La asignación no ha cambiado. Puedes cancelar y conservarla.'); return; }
  if ((a.base.responsable_trabajador_id||a.elegido===null) && (Array.from(motivo).length<5||Array.from(motivo).length>1000)) { reactivaMensajeGestion(d,'El motivo debe tener entre 5 y 1000 caracteres.'); return; }
  if (a.elegido && !a.trabajadores.some(t => t.id === a.elegido)) { reactivaMensajeGestion(d,'Selecciona un trabajador activo disponible.'); return; }
  reactivaBloquearGestion(d,true);
  reactivaMensajeGestion(d,'Guardando asignación…');
  let confirmado = false;
  d.escrituraEnCurso = true;
  d.resultadoEscritura = 'pendiente';
  try {
    await window.MantencionesReactivasService.asignar(a.base,a.elegido,motivo);
    confirmado = true;
    d.resultadoEscritura = 'confirmada';
    const [registro] = await Promise.all([window.MantencionesReactivasService.obtener(a.base.id),reactivaCargar(d.raiz)]);
    if (!reactivaContextoGestion(d)) return;
    d.registro = registro; d.asignacion = null; d.requiereActualizar = false; d.pasoGestion = 'seguimiento';
    reactivaMostrarFicha(d,registro);
    if(typeof pvToastExito==='function')pvToastExito(justificacionSinAsignar?'Motivo de no asignación registrado.':'Asignación guardada.',2000);
  } catch (error) {
    d.resultadoEscritura = confirmado ? 'confirmada' : 'incierta';
    if (reactivaDetalle !== d) return;
    d.requiereActualizar = true;
    const conflicto = /CONFLICTO|REVISION|REVISIÓN|VERSION|VERSIÓN/i.test(error.message || '');
    reactivaMensajeGestion(d, (confirmado ? 'La asignación fue guardada, pero no se pudo actualizar la ficha. ' : conflicto ? 'Los datos cambiaron. No se sobrescribieron cambios ajenos. ' : 'No se pudo confirmar la asignación. ') + (error.message || 'Error de conexión.') + ' Actualiza la ficha y revisa los datos antes de una nueva confirmación.');
    d.dialogo.querySelector('[data-reactiva-refrescar]').classList.remove('hidden');
  } finally {
    d.escrituraEnCurso = false;
    if (reactivaDetalle === d) reactivaBloquearGestion(d,false);
  }
}
async function reactivaActualizarFicha() {
  const d = reactivaDetalle;
  if (!reactivaContextoGestion(d) || d.ocupada || d.trabajadorAbierto) return;
  reactivaBloquearGestion(d,true);
  try {
    const [registro] = await Promise.all([window.MantencionesReactivasService.obtener(d.registro.id),reactivaCargar(d.raiz)]);
    if (!reactivaContextoGestion(d)) return;
    d.registro = registro; d.asignacion = null; d.requiereActualizar = false; d.pasoGestion = 'seguimiento';
    reactivaMostrarFicha(d,registro);
    reactivaMensajeGestion(d,'Datos actualizados. Abre la asignación y confirma nuevamente si corresponde.');
  } catch (error) {
    if (reactivaDetalle === d) reactivaMensajeGestion(d,'No se pudo actualizar la ficha. ' + (error.message || 'Error de conexión.'));
  } finally {
    if (reactivaDetalle === d) reactivaBloquearGestion(d,false);
  }
}

function reactivaEtiquetaTrabajador(trabajador) {
  return trabajador.nombre + (trabajador.cargo ? ' — ' + trabajador.cargo : '');
}
function reactivaTextoSeleccionado(d) {
  const a = d.asignacion;
  const trabajador = a.trabajadores.find(t => t.id === a.elegido);
  d.dialogo.querySelector('[data-reactiva-buscar]').value = a.sinConfirmar ? '' : a.elegido ? (trabajador ? reactivaEtiquetaTrabajador(trabajador) : reactivaResponsable(a.base)) : 'Sin asignar';
  reactivaActualizarMotivoAsignacion(d);
}
function reactivaAlternarOpciones() {
  const d=reactivaDetalle;
  if(!reactivaContextoGestion(d)||!d.asignacion||d.ocupada||d.trabajadorAbierto||!d.trabajadoresDisponibles)return;
  const lista=d.dialogo.querySelector('[data-reactiva-opciones]');
  const abierta=!lista.hidden;
  d.dialogo.querySelector('[data-reactiva-buscar]').focus();
  if(abierta)reactivaCerrarOpciones();else if(lista.hidden)reactivaMostrarOpciones();
}
function reactivaTecladoDesplegable(event) {
  if(['ArrowDown','ArrowUp'].includes(event.key)){
    reactivaDetalle?.dialogo.querySelector('[data-reactiva-buscar]')?.focus();
    reactivaTecladoOpciones(event);
  }else if(event.key==='Escape')reactivaTecladoOpciones(event);
}
function reactivaCerrarOpciones() {
  const d = reactivaDetalle;
  if (!d?.asignacion) return;
  const lista = d.dialogo.querySelector('[data-reactiva-opciones]');
  const campo = d.dialogo.querySelector('[data-reactiva-buscar]');
  if (!lista || !campo) return;
  lista.hidden = true;
  lista.style.display = 'none';
  campo.setAttribute('aria-expanded','false');
  d.dialogo.querySelector('[data-reactiva-desplegar]')?.setAttribute('aria-expanded','false');
  campo.removeAttribute('aria-activedescendant');
  d.dialogo.querySelector('[data-reactiva-trabajadores-estado]').textContent='';
  d.asignacion.indiceActivo = -1;
}
function reactivaMostrarOpciones() {
  const d = reactivaDetalle;
  if (!reactivaContextoGestion(d) || !d.asignacion || d.ocupada || d.trabajadorAbierto || !d.trabajadoresDisponibles) return;
  const a = d.asignacion;
  const campo = d.dialogo.querySelector('[data-reactiva-buscar]');
  const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const texto = a.sinConfirmar ? normalizar(campo.value.trim()) : '';
  const resultados = a.trabajadores.filter(t => normalizar(t.nombre).includes(texto));
  a.opciones = [...resultados.map(t => ({ tipo:'trabajador', trabajador:t })), { tipo:'sin_asignar' }, { tipo:'registrar' }];
  a.indiceActivo = -1;
  const lista = d.dialogo.querySelector('[data-reactiva-opciones]');
  lista.innerHTML = a.opciones.map((opcion, indice) => {
    const titulo = opcion.tipo === 'trabajador' ? reactivaEtiquetaTrabajador(opcion.trabajador) : opcion.tipo === 'sin_asignar' ? 'Sin asignar' : '+ Registrar nuevo trabajador';
    const seleccionado = opcion.tipo === 'trabajador' ? !a.sinConfirmar && opcion.trabajador.id === a.elegido : opcion.tipo === 'sin_asignar' && !a.sinConfirmar && a.elegido === null;
    return `<button id="reactiva-opcion-${indice}" type="button" role="option" tabindex="-1" aria-selected="${seleccionado}" onpointerdown="event.preventDefault()" onclick="reactivaElegirOpcion(${indice})" style="display:block;width:100%;text-align:left;padding:10px 12px;color:var(--alm-text);border-top:1px solid var(--alm-border)">${reactivaEscape(titulo)}</button>`;
  }).join('');
  lista.hidden = false;
  lista.style.display = 'block';
  campo.setAttribute('aria-expanded','true');
  d.dialogo.querySelector('[data-reactiva-desplegar]')?.setAttribute('aria-expanded','true');
  campo.removeAttribute('aria-activedescendant');
  d.dialogo.querySelector('[data-reactiva-trabajadores-estado]').textContent = resultados.length ? `${resultados.length} coincidencias. Flechas y Enter para seleccionar.` : 'Sin coincidencias. Puedes elegir Sin asignar o registrar un nuevo trabajador.';
}
function reactivaEscribirTrabajador() {
  const d = reactivaDetalle;
  if (!reactivaContextoGestion(d) || !d.asignacion || d.ocupada || d.trabajadorAbierto) return;
  if (!d.requiereActualizar) reactivaMensajeGestion(d,'','asignacion');
  d.asignacion.sinConfirmar = true;
  reactivaActualizarMotivoAsignacion(d);
  reactivaMostrarOpciones();
}
function reactivaElegirOpcion(indice) {
  const d = reactivaDetalle;
  if (!reactivaContextoGestion(d) || !d.asignacion || d.ocupada || d.trabajadorAbierto) return;
  const opcion = d.asignacion.opciones?.[indice];
  if (!opcion) return;
  if (!d.requiereActualizar) reactivaMensajeGestion(d,'','asignacion');
  reactivaCerrarOpciones();
  if (opcion.tipo === 'registrar') { reactivaNuevoTrabajador(); return; }
  d.asignacion.elegido = opcion.tipo === 'trabajador' ? opcion.trabajador.id : null;
  d.asignacion.sinConfirmar = false;
  reactivaTextoSeleccionado(d);
  d.dialogo.querySelector('[data-reactiva-trabajadores-estado]').textContent = '';
  d.dialogo.querySelector('[data-reactiva-buscar]').focus();
  // El foco puede abrir la lista; una selección explícita la deja cerrada.
  reactivaCerrarOpciones();
}
function reactivaTecladoOpciones(event) {
  const d = reactivaDetalle;
  if (!d?.asignacion || d.ocupada || d.trabajadorAbierto) return;
  const lista = d.dialogo.querySelector('[data-reactiva-opciones]');
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation(); reactivaCerrarOpciones(); return;
  }
  if (event.key === 'Tab') { reactivaCerrarOpciones(); return; }
  if (event.key === 'Enter') {
    event.preventDefault();
    if (!lista.hidden) {
      const indice = d.asignacion.indiceActivo >= 0 ? d.asignacion.indiceActivo : d.asignacion.opciones?.[0]?.tipo === 'trabajador' ? 0 : -1;
      if (indice >= 0) reactivaElegirOpcion(indice);
    }
    return;
  }
  if (!['ArrowDown','ArrowUp'].includes(event.key)) return;
  event.preventDefault();
  if (lista.hidden) reactivaMostrarOpciones();
  const a = d.asignacion;
  if (!a.opciones?.length) return;
  a.indiceActivo = event.key === 'ArrowDown' ? (a.indiceActivo + 1) % a.opciones.length : a.indiceActivo < 0 ? a.opciones.length - 1 : (a.indiceActivo - 1 + a.opciones.length) % a.opciones.length;
  const botones = lista.querySelectorAll('[role="option"]');
  botones.forEach((boton, i) => {
    boton.style.background = i === a.indiceActivo ? 'var(--alm-inset)' : 'transparent';
    boton.style.boxShadow = i === a.indiceActivo ? 'inset 3px 0 var(--alm-accent)' : 'none';
  });
  const activo = botones[a.indiceActivo];
  if (activo) {
    d.dialogo.querySelector('[data-reactiva-buscar]').setAttribute('aria-activedescendant',activo.id);
    activo.scrollIntoView({ block:'nearest' });
  }
}
function reactivaSalirOpciones() {
  const d = reactivaDetalle;
  setTimeout(() => {
    if (reactivaDetalle === d && d?.asignacion && !d.dialogo.querySelector('[data-reactiva-combo]')?.contains(document.activeElement)) reactivaCerrarOpciones();
  },0);
}

function reactivaAccionEstadoHTML(registro) {
  if (registro.estado === 'cerrada') return '<p class="text-sm alm-muted">Mantención cerrada.</p>' + (esAdminOperativoActual() ? '<button type="button" data-reactiva-estado-enviar onclick="reactivaMostrarReapertura(true)" class="alm-btn-primary w-full px-4 py-3">Reabrir mantención</button><form data-reactiva-reapertura hidden style="display:none" class="space-y-3" onsubmit="event.preventDefault();reactivaReabrir()"><p class="text-sm alm-muted">Se conservará la intervención cerrada y comenzará un nuevo ciclo de esta misma mantención.</p><label class="block text-sm font-medium">Motivo de reapertura *<textarea data-reactiva-motivo-reapertura rows="3" minlength="10" maxlength="2000" required class="w-full rounded-xl px-3 py-2 mt-1" style="border:1px solid var(--alm-border);background:var(--alm-inset);color:var(--alm-text)"></textarea></label><div class="flex flex-wrap gap-3"><button type="submit" data-reactiva-estado-enviar class="alm-btn-primary px-4 py-2">Confirmar reapertura</button><button type="button" onclick="reactivaMostrarReapertura(false)" class="px-4 py-2 rounded-xl" style="border:1px solid var(--alm-border)">Cancelar</button></div></form>' : '');
  if (!esAdminOperativoActual()) return '';
  if (['pendiente_asignacion','asignada'].includes(registro.estado) && !reactivaAsignacionAcreditada(reactivaDetalle?.registro?.id===registro.id?reactivaDetalle:{registro})) return '<p class="text-sm alm-muted">Guarda un responsable o justifica la no asignación antes de iniciar.</p>';
  const acciones = { pendiente_asignacion: 'Iniciar mantención', asignada: 'Iniciar mantención', en_proceso: 'Registrar trabajo y marcar como resuelta', resuelta: 'Revisar y cerrar mantención' };
  const accion = acciones[registro.estado];
  if (!accion) return '';
  const borrador = reactivaDetalle?.registro?.id === registro.id && reactivaDetalle.borradorEstado?.estadoOrigen === registro.estado ? reactivaDetalle.borradorEstado : null;
  const estilo = 'style="border:1px solid var(--alm-border);background:var(--alm-inset);color:var(--alm-text)"';
  let campos = '';
  if (registro.estado === 'en_proceso') {
    campos = `<label class="block text-sm font-medium">¿Qué trabajo se realizó? *<textarea data-reactiva-detalle-ejecucion placeholder="Ejemplo: Se reparó la unión de la tubería, se selló la filtración y se comprobó que no hubiera fugas." rows="3" minlength="10" maxlength="4000" required oninput="reactivaConservarBorradorEstado()" class="w-full rounded-xl px-3 py-2 mt-1" ${estilo}>${reactivaEscape(borrador?.detalle ?? registro.detalle_ejecucion ?? '')}</textarea></label><p class="text-xs alm-muted">Describe las acciones realizadas, reparaciones y resultado de las pruebas. Entre 10 y 4000 caracteres.</p>`;
  } else if (registro.estado === 'resuelta') {
    campos = `<p class="text-sm alm-muted">Verifica el trabajo realizado y el resultado de las pruebas antes de cerrar la mantención. Registra tus observaciones de revisión.</p><label class="block text-sm font-medium">Observaciones de revisión y cierre *<textarea data-reactiva-observaciones-cierre rows="3" minlength="5" required oninput="reactivaConservarBorradorEstado()" class="w-full rounded-xl px-3 py-2 mt-1" ${estilo}>${reactivaEscape(borrador?.observaciones ?? registro.observaciones_cierre ?? '')}</textarea></label><label class="flex items-start gap-3 text-sm"><input type="checkbox" data-reactiva-confirmar-cierre required onchange="if(!reactivaDetalle.requiereActualizar)reactivaMensajeGestion(reactivaDetalle,'','estado')"><span>He revisado el trabajo realizado y confirmo el cierre de esta mantención.</span></label>`;
  }
  return `<section data-reactiva-operacion-estado class="space-y-3">${campos}<button type="button" data-reactiva-estado-enviar onclick="reactivaGuardarEstado()" class="alm-btn-primary w-full px-4 py-3">${accion}</button></section>`;
}
function reactivaMostrarReapertura(abrir) {
  const d = reactivaDetalle;
  if (!reactivaContextoGestion(d) || d.ocupada || d.requiereActualizar || d.registro.estado !== 'cerrada') return;
  const formulario = d.dialogo.querySelector('[data-reactiva-reapertura]');
  formulario.hidden = !abrir;
  formulario.style.display = abrir ? 'block' : 'none';
  const boton = d.dialogo.querySelector('[onclick="reactivaMostrarReapertura(true)"]');
  boton.hidden = abrir;
  boton.style.display = abrir ? 'none' : '';
  reactivaMensajeGestion(d, '', 'estado');
  if (abrir) formulario.querySelector('textarea').focus();
}
async function reactivaReabrir() {
  const d = reactivaDetalle;
  if (!reactivaContextoGestion(d) || d.ocupada || d.trabajadorAbierto || d.requiereActualizar || d.registro.estado !== 'cerrada') return;
  const motivo = d.dialogo.querySelector('[data-reactiva-motivo-reapertura]').value.trim();
  if (motivo.length < 10 || motivo.length > 2000) { reactivaMensajeGestion(d, 'El motivo debe tener entre 10 y 2000 caracteres.', 'estado'); return; }
  const base = Object.freeze({ ...d.registro });
  reactivaBloquearGestion(d, true);
  reactivaMensajeGestion(d, 'Registrando reapertura…', 'estado');
  let confirmado = false, actualizado = false;
  d.escrituraEnCurso = true;
  d.resultadoEscritura = 'pendiente';
  try {
    await window.MantencionesReactivasService.reabrir(base, motivo);
    confirmado = true;
    d.resultadoEscritura = 'confirmada';
    const [registro] = await Promise.all([window.MantencionesReactivasService.obtener(base.id), reactivaCargar(d.raiz)]);
    if (!reactivaContextoGestion(d)) return;
    d.registro = registro; d.borradorEstado = null; d.asignacion = null; d.pasoGestion = null; d.requiereActualizar = false;
    reactivaMostrarFicha(d, registro);
    actualizado = true;
    reactivaMensajeGestion(d, 'Reapertura confirmada. Intervención ' + registro.ciclo_actual + ': ' + reactivaEstado(registro.estado) + '.', 'asignacion');
  } catch (error) {
    d.resultadoEscritura = confirmado ? 'confirmada' : 'incierta';
    if (reactivaDetalle !== d) return;
    d.requiereActualizar = true;
    reactivaMensajeGestion(d, (confirmado ? 'Reapertura confirmada, pero no se pudo actualizar la ficha. ' : 'No se pudo confirmar la reapertura. ') + (error.message || 'Error de conexión.') + ' El motivo se conserva. Actualiza la ficha y revisa los datos antes de confirmar nuevamente.', 'estado');
    d.dialogo.querySelector('[data-reactiva-refrescar]').classList.remove('hidden');
  } finally {
    d.escrituraEnCurso = false;
    if (reactivaDetalle === d) {
      reactivaBloquearGestion(d, false);
      if (actualizado && d.pasoGestion === 'responsable') reactivaAbrirPasoResponsable();
    }
  }
}
function reactivaConservarBorradorEstado() {
  const d = reactivaDetalle;
  if (!d?.registro || !['en_proceso','resuelta'].includes(d.registro.estado)) return;
  if (!d.requiereActualizar) reactivaMensajeGestion(d,'','estado');
  d.borradorEstado = {
    estadoOrigen: d.registro.estado,
    detalle: d.dialogo.querySelector('[data-reactiva-detalle-ejecucion]')?.value ?? '',
    observaciones: d.dialogo.querySelector('[data-reactiva-observaciones-cierre]')?.value ?? ''
  };
}
async function reactivaGuardarEstado() {
  const d = reactivaDetalle;
  if (!reactivaContextoGestion(d) || d.ocupada || d.trabajadorAbierto || d.requiereActualizar || !d.registro) return;
  reactivaMensajeGestion(d,'','estado');
  if (!reactivaAsignacionAcreditada(d)) { reactivaMensajeGestion(d,'Guarda un responsable o justifica la no asignación antes de iniciar.','estado');return; }
  if (d.asignacion) {
    reactivaMensajeGestion(d,'Guarda o cancela la selección de responsable antes de cambiar el estado.');
    return;
  }
  const siguientes = { pendiente_asignacion: 'en_proceso', asignada: 'en_proceso', en_proceso: 'resuelta', resuelta: 'cerrada' };
  const nuevoEstado = siguientes[d.registro.estado];
  if (!nuevoEstado) return;
  const detalle = d.dialogo.querySelector('[data-reactiva-detalle-ejecucion]')?.value.trim() || '';
  const observaciones = d.dialogo.querySelector('[data-reactiva-observaciones-cierre]')?.value.trim() || '';
  reactivaConservarBorradorEstado();
  if (nuevoEstado === 'resuelta' && (Array.from(detalle).length < 10 || Array.from(detalle).length > 4000)) {
    reactivaMensajeGestion(d,'El detalle del trabajo debe tener entre 10 y 4000 caracteres.');
    d.dialogo.querySelector('[data-reactiva-detalle-ejecucion]').focus();
    return;
  }
  if (nuevoEstado === 'cerrada') {
    if (observaciones.length < 5) {
      reactivaMensajeGestion(d,'Las observaciones de cierre deben tener al menos 5 caracteres.');
      d.dialogo.querySelector('[data-reactiva-observaciones-cierre]').focus();
      return;
    }
    if (!d.dialogo.querySelector('[data-reactiva-confirmar-cierre]')?.checked) {
      reactivaMensajeGestion(d,'Confirma explícitamente que revisaste el trabajo y deseas cerrar la mantención.');
      d.dialogo.querySelector('[data-reactiva-confirmar-cierre]').focus();
      return;
    }
  }
  const base = Object.freeze({ ...d.registro });
  reactivaBloquearGestion(d,true);
  reactivaMensajeGestion(d,'Registrando cambio de estado…');
  let confirmado = false;
  d.escrituraEnCurso = true;
  d.resultadoEscritura = 'pendiente';
  try {
    await window.MantencionesReactivasService.cambiarEstado(base,nuevoEstado,detalle,observaciones);
    confirmado = true;
    d.resultadoEscritura = 'confirmada';
    const [registro] = await Promise.all([window.MantencionesReactivasService.obtener(base.id),reactivaCargar(d.raiz)]);
    if (!reactivaContextoGestion(d)) return;
    d.registro = registro;
    d.borradorEstado = null;
    d.requiereActualizar = false;
    reactivaMostrarFicha(d,registro);
    if(typeof pvToastExito==='function')pvToastExito('Cambio de estado confirmado.');
  } catch (error) {
    d.resultadoEscritura = confirmado ? 'confirmada' : 'incierta';
    if (reactivaDetalle !== d) return;
    d.requiereActualizar = true;
    const conflicto = /CONFLICTO|REVISION|REVISIÓN|VERSION|VERSIÓN/i.test(error.message || '');
    reactivaMensajeGestion(d,(confirmado ? 'El cambio fue confirmado, pero no se pudo actualizar la ficha. ' : conflicto ? 'Los datos cambiaron; no se sobrescribieron cambios ajenos. ' : 'No se pudo confirmar el cambio de estado. ') + (error.message || 'Error de conexión.') + ' El contenido se conserva. Actualiza la ficha antes de confirmar otra operación.');
    d.dialogo.querySelector('[data-reactiva-refrescar]').classList.remove('hidden');
  } finally {
    d.escrituraEnCurso = false;
    if (reactivaDetalle === d) reactivaBloquearGestion(d,false);
  }
}

function reactivaMostrarFicha(detalle, registro) {
  detalle.historialSecuencia = (detalle.historialSecuencia || 0) + 1;
  detalle.historialCargando = false;
  detalle.evidenciaAsignacion=null;
  detalle.dialogo.querySelector('[data-reactiva-ficha-contenido]').innerHTML = reactivaFichaHTML(registro,detalle.pestanaActiva||'gestion');
  const inicial = !detalle.pasoGestion && registro.estado === 'pendiente_asignacion' && !registro.responsable_trabajador_id && esAdminOperativoActual();
  reactivaMostrarPaso(inicial ? 'responsable' : (detalle.pasoGestion || 'seguimiento'));
  reactivaActualizarRequisito(detalle);
  if (inicial) reactivaAbrirPasoResponsable();
  reactivaCargarHistorial(detalle);
}
async function reactivaCargarHistorial(detalle) {
  if (!detalle || reactivaDetalle !== detalle || detalle.historialCargando || !detalle.registro || !reactivaVistaActual(detalle.raiz)) return;
  const nodo = detalle.dialogo.querySelector('[data-reactiva-historial]');
  if (!nodo) return;
  const secuencia = detalle.historialSecuencia = (detalle.historialSecuencia || 0) + 1;
  detalle.historialCargando = true;
  detalle.historialAsignacionError=false;
  detalle.evidenciaAsignacion=null;
  reactivaActualizarRequisito(detalle);
  nodo.innerHTML = reactivaHistorialHTML(detalle.registro, { cargando: true });
  try {
    const registro=detalle.registro;
    const historial = await window.MantencionesReactivasService.historial(registro);
    if (detalle.registro!==registro) return;
    if (reactivaDetalle !== detalle || detalle.historialSecuencia !== secuencia || !reactivaVistaActual(detalle.raiz) || detalle.usuarioId !== state.currentUser?.id || !hasAccess('areas',state.currentUser.role)) return;
    detalle.historialCargando=false;
    detalle.evidenciaAsignacion=reactivaEvidenciaAsignacion(detalle,historial);
    nodo.innerHTML = reactivaHistorialHTML(detalle.registro, historial);
    reactivaActualizarRequisito(detalle);
  } catch (error) {
    if (reactivaDetalle === detalle && detalle.historialSecuencia === secuencia && reactivaVistaActual(detalle.raiz)) {
      detalle.historialCargando=false;detalle.historialAsignacionError=true;
      nodo.innerHTML = reactivaHistorialHTML(detalle.registro, { error: error.message || 'Error de conexión.' });
      reactivaActualizarRequisito(detalle);
    }
  } finally {
    if (detalle.historialSecuencia === secuencia) detalle.historialCargando = false;
  }
}
function reactivaFechaHoraChile(valor) {
  return formatearFechaCL(valor,{hora:true,vacio:'Sin fecha registrada',invalida:'Fecha registrada no válida'});
}
function reactivaHistorialHTML(registro, historial) {
  const etiquetas = { sin_asignar_justificada:'Sin responsable: motivo registrado', aprobada:'Solicitud aprobada', rechazada:'Solicitud rechazada', asignada:'Trabajador asignado', reasignada:'Trabajador cambiado', asignacion_retirada:'Asignación retirada', iniciada:'Mantención iniciada', resuelta:'Mantención resuelta', cerrada:'Mantención cerrada', reabierta:'Mantención reabierta' };
  const esPropio = (objeto, clave) => Object.prototype.hasOwnProperty.call(objeto,clave);
  const valorTexto = valor => valor === null ? 'Sin dato registrado' : typeof valor === 'object' ? JSON.stringify(valor,null,2) : String(valor);
  const par = (titulo, valor) => `<div><dt class="text-xs font-bold">${reactivaEscape(titulo)}</dt><dd class="text-sm alm-muted" style="white-space:pre-wrap;overflow-wrap:anywhere">${reactivaEscape(valor)}</dd></div>`;
  const desplegable = (titulo, contenido) => `<details class="mt-2"><summary class="text-xs font-bold cursor-pointer">${reactivaEscape(titulo)}</summary><div class="space-y-2 mt-2">${contenido}</div></details>`;
  const nota = (titulo, valor) => {
    if (valor === null || valor === undefined || valor === '') return '';
    const contenido = valorTexto(valor);
    return contenido.length > 160 || contenido.includes('\n') ? desplegable(titulo,par(titulo,contenido)) : par(titulo,contenido);
  };
  const trabajador = id => id === null ? 'Sin asignar' : historial.trabajadores?.get(id)?.nombre?.trim() || 'Trabajador no disponible';
  const eventos = Array.isArray(historial.eventos) ? historial.eventos : [];
  const elementos = eventos.map(evento => ({ ...evento, original:false }));
  if (registro.solicitud?.created_at) elementos.push({ id:registro.solicitud_id, created_at:registro.solicitud.created_at, original:true });
  elementos.sort((a,b) => {
    const tiempo = valor => Number.isFinite(Date.parse(valor)) ? Date.parse(valor) : Infinity;
    const diferencia = tiempo(a.created_at) - tiempo(b.created_at);
    if (diferencia && !Number.isNaN(diferencia)) return diferencia;
    if (a.original !== b.original) return a.original ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });
  const tarjetas = elementos.map(e => {
    let contenido;
    if (e.original) {
      contenido = `<h4 class="text-sm font-bold">Creación de la solicitud</h4><p class="text-xs alm-muted">Origen: ficha original de la solicitud; no es una fila de la tabla de eventos.</p><p class="text-sm alm-muted">Solicitante: ${reactivaEscape(reactivaSolicitante(registro))}</p>`;
    } else {
      const detalle = e.detalle && typeof e.detalle === 'object' && !Array.isArray(e.detalle) ? e.detalle : {};
      const claves = ['estado_anterior','estado_nuevo','trabajador_anterior','trabajador_nuevo','revision_anterior','ciclo_anterior','ciclo_nuevo'];
      contenido = `<h4 class="text-sm font-bold">${reactivaEscape(etiquetas[e.evento] || 'Evento registrado: ' + e.evento)}</h4><p class="text-sm alm-muted">Registrado por: ${reactivaEscape((window.UsuariosService?.nombreParaMostrar?.(e,'actor_nombre_snapshot') ?? e.actor_nombre_snapshot)?.trim() || 'Usuario no disponible')}</p><dl class="space-y-2">`;
      if (esPropio(detalle,'ciclo_anterior')) contenido += par('Intervención anterior',detalle.ciclo_anterior);
      if (esPropio(detalle,'ciclo_nuevo')) contenido += par('Nueva intervención',detalle.ciclo_nuevo);
      if (esPropio(detalle,'estado_anterior')) contenido += par('Estado anterior',reactivaEstado(detalle.estado_anterior));
      if (esPropio(detalle,'estado_nuevo')) contenido += par('Estado nuevo',reactivaEstado(detalle.estado_nuevo));
      if (esPropio(detalle,'trabajador_anterior')) contenido += par('Trabajador anterior',trabajador(detalle.trabajador_anterior));
      if (esPropio(detalle,'trabajador_nuevo')) contenido += par('Trabajador nuevo',trabajador(detalle.trabajador_nuevo));
      contenido += nota('Motivo',e.motivo) + '</dl>';
      const adicionales = Object.entries(detalle).filter(([clave]) => !claves.includes(clave));
      if (adicionales.length) contenido += desplegable('Observaciones e información adicional', '<dl class="space-y-2">' + adicionales.map(([clave,valor]) => par(clave.replace(/_/g,' '),valorTexto(valor))).join('') + '</dl>');
      if (e.detalle !== null && e.detalle !== undefined && (typeof e.detalle !== 'object' || Array.isArray(e.detalle))) contenido += desplegable('Información adicional',par('Detalle registrado',valorTexto(e.detalle)));
      const referencias = [['Evento',e.id],['Usuario que registró',e.actor_id],['Solicitud',e.solicitud_id],['Mantención',e.mantencion_reactiva_id]];
      for (const clave of ['trabajador_anterior','trabajador_nuevo','revision_anterior']) if (esPropio(detalle,clave)) referencias.push([clave.replace(/_/g,' '),detalle[clave]]);
      contenido += desplegable('Referencias del evento','<dl class="space-y-2">' + referencias.map(([etiqueta,valor]) => par(etiqueta,valorTexto(valor ?? null))).join('') + '</dl>');
    }
    return `<li style="position:relative;margin-bottom:12px;padding:12px;border:1px solid var(--alm-border);border-radius:12px;background:var(--alm-inset)"><span aria-hidden="true" style="position:absolute;left:-23px;top:17px;width:8px;height:8px;border-radius:50%;background:var(--alm-muted)"></span><time datetime="${reactivaEscape(e.created_at)}" class="text-xs alm-muted">${reactivaEscape(reactivaFechaHoraChile(e.created_at))}</time><div class="space-y-2 mt-1">${contenido}</div></li>`;
  }).join('');
  const ciclos = [...(historial.ciclos || []).map(c => ({ ...c, actual: false })), { ...registro, numero_ciclo: registro.ciclo_actual, actual: true }];
  const resumenCiclos = !historial.cargando && !historial.error ? '<section class="space-y-3"><h3 class="text-sm font-bold">Intervenciones de esta mantención</h3>' + ciclos.map(c => {
    let datos = par('Responsable', c.actual ? reactivaResponsable(registro) : (c.nombres_historicos?.responsable_nombre || trabajador(c.responsable_trabajador_id)));
    for (const [titulo,clave,tipo] of [['Asignación','asignada_en','asignada'],['Inicio','iniciada_en','iniciada'],['Resolución','resuelta_en','resuelta'],['Cierre','cerrada_en','cerrada']]) {
      const instante=Date.parse(c[clave]);
      const representada=Number.isFinite(instante) && eventos.some(e=>e.mantencion_reactiva_id===registro.id && (e.evento===tipo || clave==='asignada_en' && e.evento==='reasignada') && Date.parse(e.created_at)===instante);
      if(c[clave]&&!representada)datos+=par(titulo,reactivaFechaHoraChile(c[clave]));
    }
    if(c.actual && c.updated_at && Date.parse(c.updated_at)!==Date.parse(c.created_at) && !['asignada_en','iniciada_en','resuelta_en','cerrada_en'].some(k=>Date.parse(c[k])===Date.parse(c.updated_at)) && !eventos.some(e=>Date.parse(e.created_at)===Date.parse(c.updated_at)))datos+=par('Última actualización',reactivaFechaHoraChile(c.updated_at));
    datos += nota('Trabajo realizado', c.detalle_ejecucion) + nota('Observaciones de cierre', c.observaciones_cierre);
    if (c.archivado_en) datos += par('Archivada al reabrir',reactivaFechaHoraChile(c.archivado_en));
    return '<details class="p-3 rounded-xl" style="border:1px solid var(--alm-border);background:var(--alm-inset)"><summary class="text-sm font-bold cursor-pointer">Intervención ' + reactivaEscape(c.numero_ciclo ?? 'no disponible') + (c.actual ? ' · Ciclo actual · ' + reactivaEscape(reactivaEstado(registro.estado)) : ' · Archivada') + '</summary><dl class="space-y-2 mt-3">' + datos + '</dl></details>';
  }).join('') + '<p class="text-xs alm-muted">Los motivos de reapertura y sus ciclos anterior y nuevo aparecen en la línea de tiempo, sin repetir los eventos.</p></section>' : '';
  const estado = historial.cargando ? '<p role="status" class="text-sm alm-muted">Cargando eventos reales…</p>' : historial.error ? `<p role="alert" class="text-sm alm-muted">No se pudo consultar el historial. ${reactivaEscape(historial.error)}</p>` : !eventos.length ? '<p role="status" class="text-sm alm-muted">No hay eventos registrados visibles para tu cuenta.</p>' : '';
  return `<div class="space-y-3"><div class="flex flex-wrap items-center justify-between gap-3"><h3 class="text-sm font-bold">Historial cronológico</h3><button type="button" onclick="reactivaCargarHistorial(reactivaDetalle)" ${historial.cargando ? 'disabled' : ''} class="px-3 py-2 rounded-xl text-sm" style="border:1px solid var(--alm-border)">Actualizar historial</button></div><p class="text-xs alm-muted">Fecha y hora de Chile · America/Santiago.</p>${resumenCiclos}${estado}${!registro.solicitud?.created_at ? '<p class="text-sm alm-muted">La fecha original de la solicitud no está disponible para tu cuenta.</p>' : ''}${historial.avisoTrabajadores ? `<p role="status" class="text-sm alm-muted">${reactivaEscape(historial.avisoTrabajadores)}</p>` : ''}${tarjetas ? '<ol class="reactiva-linea-tiempo">' + tarjetas + '</ol>' : ''}</div>`;
}

// Lectura autorizada tras señal específica, sin despertar colas de Solicitudes.
async function reactivaRevalidarInterfazRemota(usuarioId, vigente) {
  const raiz=document.getElementById('reactiva-vista');
  if(!reactivaVistaActual(raiz)||state.currentUser?.id!==usuarioId||!hasAccess('areas',state.currentUser?.role))return false;
  const firma=()=>JSON.stringify([state.currentUser?.id,state.currentUser?.role,state.currentUser?.esAdminPermanente,state.currentUser?.esAdminTemporal,state.currentUser?.adminTemporalHasta,state.currentUser?.permissions]);
  const permisos=firma();
  const vigenteActual=()=>vigente() && firma()===permisos && hasAccess('areas',state.currentUser?.role);
  const d=reactivaDetalle;
  if(d?.escrituraEnCurso)return true;
  const fichaVigente=()=>vigenteActual() && reactivaVistaActual(raiz) && state.currentUser?.id===usuarioId && reactivaDetalle===d && d?.dialogo.isConnected && !d.invalidada;
  const [listado,registro]=await Promise.all([reactivaCargar(raiz,{remota:true}),d && fichaVigente()?window.MantencionesReactivasService.obtener(d.registro.id,{permitirAusente:true}):null]);
  if(!vigenteActual()||!reactivaVistaActual(raiz))return false;
  if(d && fichaVigente()) {
    if(d.escrituraEnCurso)return true;
    if(registro===null){d.invalidada=true;solicitudesCerrarFichaInvalidada(d,false);return false;}
    if(String(registro.revision)!==String(d.registro.revision)) {
      const reapertura=d.dialogo.querySelector('[data-reactiva-reapertura]');
      const editando=d.asignacion || d.borradorEstado || d.trabajadorAbierto || d.requiereActualizar || d.resultadoEscritura==='incierta' || (d.registro.estado==='cerrada' && reapertura && !reapertura.hidden && reapertura.style.display!=='none');
      d.evidenciaAsignacion=null;
      if(editando) {
        d.requiereActualizar=true;reactivaBloquearGestion(d,false);
        reactivaMensajeGestion(d,'La ficha cambió en otra sesión. Tu borrador se conserva. Actualiza la ficha antes de guardar.');
      } else {
        d.registro=registro;reactivaMostrarFicha(d,registro);reactivaBloquearGestion(d,false);
      }
    }
  }
  if(listado===false)raiz.querySelector('[data-reactiva-estado]').textContent='No se pudo actualizar la información remota. Usa Actualizar para volver a consultar.';
  return false;
}
