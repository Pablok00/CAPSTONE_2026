// ==========================================================
// VISTA: REMODELACIONES & CALCULADORA - HOTEL EL ALMENDRO
// ==========================================================

function renderRenovationsView() {
  // Disparar carga asíncrona de los datos
  setTimeout(fetchAndRenderRenovations, 0);

  return `
    <div class="alm-ui alm-main-page alm-module-page alm-project-page alm-renovations space-y-6 max-w-7xl mx-auto pb-10" id="renovations-main-container">
      
      ${uiEncabezadoSeccion('Remodelaciones & Cómputo de Materiales','Gestión de partidas, insumos y cálculo automático del costo total del proyecto.','folder')}

      <div id="renovations-grid-container">${uiCargandoHTML()}</div>

    </div>
  `;
}

async function fetchAndRenderRenovations() {
  const container = document.getElementById('renovations-grid-container');
  if (!container) return;

  try {
    let renovaciones;
    let complementarios = [];
    if (window.RemodelacionesService) {
      renovaciones = await window.RemodelacionesService.getProyectos();
      complementarios = await window.RemodelacionesService.getRegistrosComplementarios();
    } else {
      throw new Error("Servicio de Remodelaciones no cargado.");
    }
    const gridHtml = getRenovationsGridHTML(renovaciones);
    const compHtml = getComplementariosHTML(complementarios);
    container.outerHTML = `<div class="w-full">${gridHtml}${compHtml}</div>`;
  } catch (error) {
    console.error("Error al obtener remodelaciones de Supabase:", error);
    container.innerHTML = '<div role="alert" class="col-span-full p-4 bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-900">No se pudieron consultar los proyectos en Supabase. Vuelve a abrir Remodelaciones para reintentar.</div>';
  }
}

function getRenovationsGridHTML(renovaciones) {
  return `
    <div class="alm-record-grid grid grid-cols-1 md:grid-cols-2 gap-6">
      ${renovaciones.map(ren => {
        let budgetBlock = '';
        if (ren._isFallback) {
          // Fallback old behavior
          let budgetEstimadoText = 'Sin presupuesto estimado';
          if (ren.budgetEstimado != null) budgetEstimadoText = formatCLP(ren.budgetEstimado);
          else if (ren.budget != null) budgetEstimadoText = formatCLP(ren.budget); 

          let budgetRealText = 'Sin total real';
          if (ren.budgetReal != null) budgetRealText = formatCLP(ren.budgetReal);
          else if (ren.actualCost != null) budgetRealText = formatCLP(ren.actualCost); 

          budgetBlock = `
              <div class="grid grid-cols-2 gap-3 mt-5 p-3.5 bg-purple-50/50 rounded-2xl border border-purple-100">
                <div>
                  <p class="text-[10px] text-purple-900 font-bold uppercase">Total Real</p>
                  <p class="text-base font-black text-purple-700">${budgetRealText}</p>
                </div>
                <div>
                  <p class="text-[10px] text-slate-600 font-bold uppercase">Presupuesto Estimado</p>
                  <p class="text-base font-black text-slate-800">${budgetEstimadoText}</p>
                </div>
              </div>
          `;
        } else {
          // Real Data Rendering
          const pres = ren.presupuestosResumen || [];
          const imps = ren.importacionesResumen || [];
          
          if (pres.length === 0 && imps.length === 0) {
            budgetBlock = `
              <div class="mt-5 p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100 text-center">
                <p class="text-xs font-bold text-slate-500">Sin información de totales registrada</p>
              </div>
            `;
          } else if (pres.length > 0) {
            const hasEstimado = pres.some(p => p.tipo === 'ESTIMADO');
            const hasReal = pres.some(p => p.tipo === 'REAL');

            if (hasEstimado || hasReal) {
              const est = pres.find(p => p.tipo === 'ESTIMADO');
              const real = pres.find(p => p.tipo === 'REAL');
              budgetBlock = `
                <div class="grid grid-cols-2 gap-3 mt-5 p-3.5 bg-purple-50/50 rounded-2xl border border-purple-100">
                  <div>
                    <p class="text-[10px] text-purple-900 font-bold uppercase">Total Real</p>
                    <p class="text-base font-black text-purple-700">${real && real.total_con_iva != null ? formatCLP(real.total_con_iva) : 'Sin total real'}</p>
                  </div>
                  <div>
                    <p class="text-[10px] text-slate-600 font-bold uppercase">Presupuesto Estimado</p>
                    <p class="text-base font-black text-slate-800">${est && est.total_con_iva != null ? formatCLP(est.total_con_iva) : 'Sin presupuesto estimado'}</p>
                  </div>
                </div>
              `;
            } else {
              // Only other types (like PRESUPUESTO_HISTORICO or something else)
              // We take the first one 
              const firstPres = pres[0];
              const friendlyType = (firstPres.tipo || 'GENERAL').replace(/_/g, ' ');
              budgetBlock = `
                <div class="mt-5 p-3.5 bg-purple-50/50 rounded-2xl border border-purple-100 flex flex-col justify-center items-center text-center">
                  <p class="text-[10px] text-purple-900 font-bold uppercase">${friendlyType}</p>
                  <p class="text-lg font-black text-purple-700">${firstPres.total_con_iva != null ? formatCLP(firstPres.total_con_iva) : 'Sin total registrado'}</p>
                  ${firstPres.total_sin_iva != null ? `<p class="text-[10px] text-slate-600 font-bold mt-1">Sin IVA: ${formatCLP(firstPres.total_sin_iva)}</p>` : ''}
                </div>
              `;
            }
          } else if (imps.length > 0) {
            const firstImp = imps[0];
            budgetBlock = `
              <div class="mt-5 p-3.5 bg-purple-50/50 rounded-2xl border border-purple-100 flex flex-col justify-center items-center text-center">
                <p class="text-[10px] text-purple-900 font-bold uppercase">TOTAL REGISTRADO</p>
                <p class="text-lg font-black text-purple-700">${firstImp.total_con_iva != null ? formatCLP(firstImp.total_con_iva) : 'Sin total registrado'}</p>
                ${firstImp.total_sin_iva != null ? `<p class="text-[10px] text-slate-600 font-bold mt-1">Sin IVA: ${formatCLP(firstImp.total_sin_iva)}</p>` : ''}
              </div>
            `;
          }
        }

        const badgeHistorico = ren.es_historico ? `<span class="text-[10px] font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full">HISTÓRICO</span>` : '';
        
        const estadoOpciones = ['Pendiente de inicio', 'En proceso', 'Pausado', 'Finalizado'];
        const currentStatus = ren.status || 'Estado no definido';
        const selectHtml = `
          <div class="mt-3" onclick="event.stopPropagation()">
            <label class="text-[10px] font-bold text-slate-500 uppercase block mb-1">Estado:</label>
            <select data-proyecto-id="${ren.id}" data-prev="${currentStatus}" onchange="handleChangeEstado(this, '${ren.id}', event)" class="w-full text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer hover:bg-slate-100 transition-colors">
              ${!ren.status ? `<option value="Estado no definido">Estado no definido</option>` : ''}
              ${estadoOpciones.map(opt => `<option value="${opt}" ${ren.status === opt ? 'selected' : ''}>${opt}</option>`).join('')}
            </select>
          </div>
        `;

        return `
          <div onclick="openRenovationDetail('${ren.id}')" class="alm-project-card bg-white rounded-3xl p-6 border-2 border-slate-200 hover:border-purple-500 shadow-sm hover:shadow-xl transition-all cursor-pointer card-hover flex flex-col justify-between group">
            
            <div>
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-extrabold bg-purple-100 text-purple-800 px-3 py-1 rounded-lg">
                  🏗️ ${ren.space || 'Ubicación no registrada'}
                </span>
                ${badgeHistorico}
              </div>

              <h4 class="text-xl font-extrabold text-slate-800 group-hover:text-purple-700 transition-colors">
                ${ren.name || 'Sin nombre'}
              </h4>

              ${selectHtml}

              <p class="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                ${ren.description || 'Sin descripción'}
              </p>

              ${budgetBlock}
            </div>

            <div class="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-purple-700 group-hover:text-purple-900">
              <span>Abrir Ficha de Remodelación</span>

            </div>

          </div>
        `;
      }).join('')}
    </div>
  `;
}

function getComplementariosHTML(complementarios) {
  if (!complementarios || complementarios.length === 0) return '';
  
  const labelMap = {
    'EN BODEGA.xlsx': 'Bodega / Inventario',
    'Gastos StanD.xlsx': 'Gastos',
    'INSUMOS -NUEVA BODEGA OESTE.xlsx': 'Insumos / Bodega',
    'INSUMOS JARDINERIA.xlsx': 'Insumos / Jardinería',
    'PROVEEDORES REMODELACIONES.xlsx': 'Proveedores'
  };

  return `
    <div class="mt-12 pt-10 border-t-2 border-slate-200 border-dashed">
      <div class="mb-6">
        <h3 class="text-xl font-black text-slate-800">Registros Complementarios de Remodelación</h3>
        <p class="text-xs text-slate-500 mt-1">Archivos y registros adicionales independientes de los proyectos formales.</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        ${complementarios.map(comp => {
          const file = comp.archivo_origen;
          const label = labelMap[file] || 'Registro';
          const count = comp.importaciones ? comp.importaciones.length : 0;
          return `
            <div onclick="openComplementarioDetail('${file}')" class="alm-project-card bg-white rounded-2xl p-5 border border-slate-200 hover:border-slate-400 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group">
              <div>
                <span class="text-[10px] font-extrabold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md uppercase border border-slate-200">
                  ${label}
                </span>
                <h4 class="text-sm font-bold text-slate-800 mt-3 group-hover:text-slate-900 break-all">
                  ${file}
                </h4>
                <p class="text-xs text-slate-500 mt-1">
                  ${count > 0 ? `${count} hojas registradas` : 'Sin hojas'}
                </p>
              </div>
              <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600 group-hover:text-slate-800">
                <span>VER REGISTRO</span>

              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

window.handleChangeEstado = async function(selectEl, proyectoId, event) {
  if (event) event.stopPropagation();
  
  const prevValue = selectEl.getAttribute('data-prev') || 'Estado no definido';
  const nuevoEstado = selectEl.value;
  
  // Disable all selects for this project temporarily
  const selects = document.querySelectorAll(`select[data-proyecto-id="${proyectoId}"]`);
  selects.forEach(s => s.disabled = true);
  
  try {
    if (window.RemodelacionesService) {
      await window.RemodelacionesService.updateEstado(proyectoId, nuevoEstado);
      
      // Update data-prev and value on all selects
      selects.forEach(s => {
        s.value = nuevoEstado;
        s.setAttribute('data-prev', nuevoEstado);
      });
      
      // Notify
      const alertId = 'toast-status-' + Date.now();
      const alertHtml = `
        <div id="${alertId}" class="fixed bottom-4 right-4 bg-emerald-100 text-emerald-800 px-4 py-3 rounded-xl shadow-lg border border-emerald-200 text-sm font-bold flex items-center gap-2 z-50 transition-all transform translate-y-0 opacity-100">
          <span>✅ Estado actualizado a "${nuevoEstado}"</span>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', alertHtml);
      setTimeout(() => {
        const toast = document.getElementById(alertId);
        if (toast) {
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 300);
        }
      }, 3000);
    }
  } catch (err) {
    console.error("Error al actualizar estado:", err);
    // Revert visual change
    selects.forEach(s => {
      s.value = prevValue;
    });
    alert("Error al actualizar el estado en Supabase.");
  } finally {
    selects.forEach(s => s.disabled = false);
  }
}
