// UX-02: las ventanas solo se cierran con controles explícitos o tras guardar.
// Esta regla sustituye las referencias históricas a cierre por fondo o Escape.
// ==========================================================
// MODALES Y ACCIONES INTERACTIVAS - HOTEL EL ALMENDRO
// ==========================================================

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('hidden');


  modal.scrollTop = 0;


  const scrollables = modal.querySelectorAll('.overflow-y-auto, [id$="-modal-content"], form');
  scrollables.forEach(el => {
    el.scrollTop = 0;
  });

  // Asegurar scroll al tope tras renderizado en el siguiente cuadro de animación
  requestAnimationFrame(() => {
    modal.scrollTop = 0;
    scrollables.forEach(el => {
      el.scrollTop = 0;
    });
  });
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add('hidden');

  // Dejar reseteado el scroll a 0 para la próxima apertura
  modal.scrollTop = 0;
  const scrollables = modal.querySelectorAll('.overflow-y-auto, [id$="-modal-content"], form');
  scrollables.forEach(el => {
    el.scrollTop = 0;
  });

  // Limpiar cualquier referencia residual de navegación para cerrar completamente
  openedFromAreaDetail = null;
}

function handleModalBackdropClick(event, modalId) {
  // UX-02: el fondo no es un control de cierre.

}

function populateSelectAreas() {
  const select = document.getElementById('req-area');
  if (select) {
    select.innerHTML = state.areas.map(a => `<option value="${a.id}">${a.icon} ${a.name}</option>`).join('');
  }
  const reqRequester = document.getElementById('req-requester');
  if (reqRequester && state.currentUser) {
    reqRequester.value = `${state.currentUser.name} (${state.currentUser.title})`;
  }
}

function openNewRequestModal() {
  populateSelectAreas();
  openModal('modal-new-request');
}

function handleCreateRequest(e) {
  e.preventDefault();
  const title = document.getElementById('req-title').value;
  const areaId = document.getElementById('req-area').value;
  const location = document.getElementById('req-location').value;
  const description = document.getElementById('req-description').value;
  const priority = document.getElementById('req-priority').value;
  const requester = document.getElementById('req-requester').value;

  const areaObj = state.areas.find(a => a.id === areaId);

  const newReq = {
    id: `req_${Date.now()}`,
    title,
    areaId,
    areaName: areaObj ? areaObj.name : 'General',
    location,
    description,
    priority,
    requesterName: requester,
    requesterEmail: state.currentUser ? state.currentUser.email : 'contacto@elalmendro.cl',
    createdDate: '2026-08-28 ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    photo: null,
    status: 'Pendiente',
    convertedTo: null
  };

  state.requests.unshift(newReq);

  state.notifications.unshift({
    id: `notif_${Date.now()}`,
    type: 'info',
    title: `Nueva Solicitud: ${title}`,
    message: `${requester} ingresó solicitud en ${newReq.areaName} (${location}).`,
    timestamp: 'Recién',
    linkModule: 'solicitudes',
    read: false
  });

  saveState();
  closeModal('modal-new-request');
  document.getElementById('form-new-request').reset();
  alert("✅ Solicitud ingresada correctamente.");
}

function openConvertRequestModal(reqId) {
  activeConvertingRequestId = reqId;
  const req = state.requests.find(r => r.id === reqId);
  if (req) {
    document.getElementById('convert-req-title').textContent = req.title;
    openModal('modal-convert-request');
  }
}

function executeConversion(targetType) {
  if (!activeConvertingRequestId) return;
  const req = state.requests.find(r => r.id === activeConvertingRequestId);
  if (!req) return;

  if (targetType === 'Preventiva' || targetType === 'Correctiva' || targetType === 'Esporádica') {
    const newMnt = {
      id: `mnt_${Date.now()}`,
      title: req.title,
      description: req.description + ` (Originado desde solicitud de ${req.requesterName} en ${req.location})`,
      areaId: req.areaId,
      areaName: req.areaName,
      assetId: null,
      assetName: req.location,
      type: targetType,
      priority: req.priority,
      responsible: "Manuel Pérez",
      createdDate: "2026-08-28",
      startDate: "2026-08-29",
      limitDate: "2026-08-30",
      completedDate: null,
      status: "Pendiente",
      estimatedCost: 30000,
      actualCost: 0,
      photosBefore: [],
      photosAfter: [],
      documents: [],
      observations: "Solicitud convertida."
    };
    state.maintenances.unshift(newMnt);
  } else if (targetType === 'Mejora') {
    // FASE 4G-5B: se eliminó la creación de mejoras FICTICIAS en
    // state.improvements (budget hardcodeado de $1.000.000, fechas y
    // responsable inventados) que además se persistían en localStorage.
    // La creación REAL de proyectos de Mejora requiere una fase posterior de
    // CRUD con permisos de escritura (INSERT) en Supabase; aquí NO se escribe
    // nada. La solicitud queda SIN convertir: no se marca 'Convertida', no se
    // ejecuta saveState() ni alert de éxito.
    alert('Conversión a Proyecto de Mejora no disponible temporalmente.\nEsta función requiere habilitar la creación real en Supabase.');
    return;
  } else if (targetType === 'Remodelacion') {
    const newRen = {
      id: `ren_${Date.now()}`,
      name: req.title,
      space: req.location,
      areaId: req.areaId,
      areaName: req.areaName,
      description: req.description,
      responsible: state.currentUser?.name || "Administración",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      status: "Planificación",
      budget: 2000000,
      progressPercent: 0,
      materials: []
    };
    state.renovations.unshift(newRen);
  }

  req.status = 'Convertida';
  req.convertedTo = { type: targetType, id: `gen_${Date.now()}` };

  saveState();
  closeModal('modal-convert-request');
  alert(`✅ Solicitud convertida exitosamente a ${targetType}.`);
}

let openedFromAreaDetail = null;

function returnToAreaDetail() {
  const areaId = openedFromAreaDetail;
  closeModal('modal-maintenance-detail');
  closeModal('modal-renovation-detail');
  closeModal('modal-improvement-detail');
  if (areaId) {
    setTimeout(() => {
      openAreaDetail(areaId);
    }, 50);
  }
}

function closeMaintenanceModalWithReturn() {
  closeModal('modal-maintenance-detail');
}

function openMaintenanceDetail(mntId, fromAreaId = null) {
  const mnt = state.maintenances.find(m => m.id === mntId);
  if (!mnt) return;

  openedFromAreaDetail = (fromAreaId && fromAreaId !== 'null' && fromAreaId !== 'undefined') ? fromAreaId : null;

  const alert = getMaintenanceAlert(mnt);
  const content = document.getElementById('maintenance-modal-content');
  if (content) content.scrollTop = 0;

  content.innerHTML = `
    <div class="flex items-center justify-between pb-4 border-b border-slate-100">
      <div>
        <div class="flex items-center space-x-2 flex-wrap gap-y-1">
          <span class="text-xs font-extrabold px-2.5 py-1 rounded-md uppercase bg-blue-100 text-blue-800">
            Mantención ${mnt.type}
          </span>
          ${alert ? `
            <span class="text-xs font-extrabold px-2.5 py-0.5 rounded-md ${alert.badgeClass}">
              🔔 ${alert.badge} • ${alert.text}
            </span>
          ` : ''}
          ${openedFromAreaDetail ? `
            <button onclick="returnToAreaDetail()" class="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-xl flex items-center space-x-1 transition-colors">
              <span>← Volver a Ficha de Área</span>
            </button>
          ` : ''}
        </div>
        <h3 class="text-xl font-extrabold text-slate-900 mt-2">${mnt.title}</h3>
      </div>
      <button onclick="closeModal('modal-maintenance-detail')" class="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1">&times;</button>
    </div>

    <div class="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="space-y-4">
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase">Descripción</p>
          <p class="text-xs text-slate-700 mt-1 leading-relaxed">${mnt.description}</p>
        </div>

        <div class="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
          <div>
            <p class="text-[10px] text-slate-400 uppercase font-bold">Área de Trabajo</p>
            <p class="font-bold text-slate-800">${mnt.workAreaName || 'Mantención General'}</p>
          </div>
          <div>
            <p class="text-[10px] text-slate-400 uppercase font-bold">Ubicación Hotel / Activo</p>
            <p class="font-bold text-blue-700">${mnt.areaName} (${mnt.assetName || 'Instalación General'})</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p class="text-[10px] text-slate-400 uppercase font-bold">Fecha Inicio</p>
            <p class="font-bold text-slate-800">${formatDate(mnt.startDate)}</p>
          </div>
          <div>
            <p class="text-[10px] text-slate-400 uppercase font-bold">Fecha Límite</p>
            <p class="font-bold text-slate-800">${formatDate(mnt.limitDate)}</p>
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Estado de la Mantención</label>
          <select onchange="updateMaintenanceStatus('${mnt.id}', this.value)" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800">
            <option value="Pendiente" ${mnt.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
            <option value="Programada" ${mnt.status === 'Programada' ? 'selected' : ''}>Programada</option>
            <option value="En proceso" ${mnt.status === 'En proceso' ? 'selected' : ''}>En proceso</option>
            <option value="Completada" ${mnt.status === 'Completada' ? 'selected' : ''}>Completada</option>
            <option value="Atrasada" ${mnt.status === 'Atrasada' ? 'selected' : ''}>Atrasada</option>
            <option value="Cancelada" ${mnt.status === 'Cancelada' ? 'selected' : ''}>Cancelada</option>
          </select>
        </div>

        <div>
          <p class="text-xs font-bold text-slate-400 uppercase mb-1">Observaciones Técnicas</p>
          <p class="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
            ${mnt.observations || 'Sin observaciones adicionales.'}
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <!-- Calculadora y Registro de Materiales Reutilizable -->
        ${renderMaterialsManager({
          parentType: 'mantencion',
          parentId: mnt.id,
          materials: mnt.materials || [],
          budget: mnt.estimatedCost || 0,
          actualCost: mnt.actualCost || 0,
          title: 'Materiales & Costos de la Mantención'
        })}

        ${mnt.photosBefore && mnt.photosBefore.length > 0 ? `
          <div>
            <p class="text-xs font-bold text-slate-400 uppercase mb-1">Fotografías del Trabajo</p>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <p class="text-[10px] text-slate-500 font-bold mb-0.5">Antes:</p>
                <img src="${mnt.photosBefore[0]}" class="rounded-xl h-24 w-full object-cover border border-slate-200">
              </div>
              ${mnt.photosAfter && mnt.photosAfter.length > 0 ? `
                <div>
                  <p class="text-[10px] text-slate-500 font-bold mb-0.5">Después:</p>
                  <img src="${mnt.photosAfter[0]}" class="rounded-xl h-24 w-full object-cover border border-slate-200">
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    </div>

    <div class="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
      <span class="text-xs text-slate-500">Responsable asignado: <strong>${mnt.responsible}</strong></span>
      <div class="flex items-center space-x-2">
        ${openedFromAreaDetail ? `
          <button onclick="returnToAreaDetail()" class="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors">
            ← Volver a Ficha de Área
          </button>
        ` : ''}
        <button onclick="closeModal('modal-maintenance-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
          Cerrar Ficha
        </button>
      </div>
    </div>
  `;
  openModal('modal-maintenance-detail');
}

function updateMaintenanceStatus(mntId, newStatus) {
  const mnt = state.maintenances.find(m => m.id === mntId);
  if (mnt) {
    mnt.status = newStatus;
    if (newStatus === 'Completada') {
      mnt.completedDate = '2026-08-28';
    }
    saveState();
    openMaintenanceDetail(mntId);
  }
}

function openAssetDetail(assetId, tab = 'ficha') {
  selectedAssetTab = tab;
  const asset = state.assets.find(a => a.id === assetId);
  if (!asset) return;

  const wInfo = calculateWarrantyStatus(asset.warranty);
  const content = document.getElementById('asset-modal-content');
  if (content) content.scrollTop = 0;

  content.innerHTML = `
    <div class="flex items-center justify-between pb-4 border-b border-slate-100">
      <div class="flex items-center space-x-3">
        <div class="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center text-2xl font-bold">
          🏷️
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <h3 class="text-lg font-extrabold text-slate-900">${asset.name}</h3>
            <span class="text-xs font-bold px-2.5 py-0.5 rounded-full ${wInfo.status === 'Vigente' ? 'bg-emerald-100 text-emerald-800' : wInfo.status === 'Proxima' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}">
              ${wInfo.badge}
            </span>
          </div>
          <p class="text-xs text-slate-500">${asset.brand} • Modelo ${asset.model} • N° Serie: ${asset.serialNumber}</p>
        </div>
      </div>
      <button onclick="closeModal('modal-asset-detail')" class="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1">&times;</button>
    </div>

    <div class="flex items-center space-x-2 border-b border-slate-200 mt-4 pb-2">
      <button onclick="openAssetDetail('${asset.id}', 'ficha')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${selectedAssetTab === 'ficha' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}">
        📋 Ficha Técnica
      </button>
      <button onclick="openAssetDetail('${asset.id}', 'garantia')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${selectedAssetTab === 'garantia' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}">
        🛡️ Garantía & Documentos
      </button>
      <button onclick="openAssetDetail('${asset.id}', 'plan')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${selectedAssetTab === 'plan' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}">
        🔄 Plan de Mantenimiento
      </button>
      <button onclick="openAssetDetail('${asset.id}', 'historial')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${selectedAssetTab === 'historial' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}">
        📜 Historial Cronológico
      </button>
    </div>

    <div class="mt-5">
      ${renderAssetTabContent(asset, selectedAssetTab, wInfo)}
    </div>

    <!-- FOOTER DE CIERRE -->
    <div class="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
      <span class="text-xs text-slate-500">Activo: <strong>${asset.name}</strong> • Hotel El Almendro</span>
      <button onclick="closeModal('modal-asset-detail')" class="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
        Cerrar Ficha
      </button>
    </div>
  `;
  openModal('modal-asset-detail');
  if (content) content.scrollTop = 0;
}

function renderAssetTabContent(asset, tab, wInfo) {
  if (tab === 'ficha') {
    return `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="space-y-3 text-xs">
          <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
            <div class="flex justify-between">
              <span class="text-slate-500 font-bold">Categoría:</span>
              <span class="font-bold text-slate-800">${asset.category}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500 font-bold">Ubicación:</span>
              <span class="font-bold text-slate-800">${asset.areaName} (${asset.location})</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500 font-bold">Proveedor:</span>
              <span class="font-bold text-slate-800">${asset.provider}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500 font-bold">Fecha de Compra:</span>
              <span class="font-bold text-slate-800">${formatDate(asset.purchaseDate)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500 font-bold">Valor de Adquisición:</span>
              <span class="font-extrabold text-blue-700">${formatCLP(asset.purchaseValue)}</span>
            </div>
          </div>
        </div>
        <div>
          <img src="${asset.photo}" alt="${asset.name}" class="w-full h-48 object-cover rounded-2xl border border-slate-200">
        </div>
      </div>
    `;
  } else if (tab === 'garantia') {
    return `
      <div class="space-y-4 text-xs">
        <div class="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl">
          <h4 class="font-extrabold text-amber-900 text-sm">Estado de Garantía: ${wInfo.badge}</h4>
          <p class="text-slate-700 mt-1">${wInfo.text}</p>
          <div class="mt-3 grid grid-cols-2 gap-2 text-slate-700">
            <div>Proveedor: <strong>${asset.warranty.provider || asset.provider}</strong></div>
            <div>Póliza / Ref: <strong>${asset.warranty.referenceDoc || 'S/N'}</strong></div>
          </div>
          <p class="mt-2 text-slate-600"><em>${asset.warranty.notes || ''}</em></p>
        </div>

        <div>
          <h4 class="font-bold text-slate-800 mb-2">Documentos Adjuntos (Facturas, Manuales, Pólizas)</h4>
          <div class="space-y-2">
            ${(asset.documents || []).map(doc => `
              <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div class="flex items-center space-x-2">
                  <span class="text-base">📄</span>
                  <div>
                    <p class="font-bold text-slate-800">${doc.name}</p>
                    <p class="text-[10px] text-slate-500">${doc.size} • Subido el ${formatDate(doc.date)}</p>
                  </div>
                </div>
                <button class="text-xs font-bold text-blue-600 hover:underline">Descargar</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  } else if (tab === 'plan') {
    return `
      <div class="space-y-4 text-xs">
        <div class="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl">
          <h4 class="font-extrabold text-blue-900 text-sm">Pauta Preventiva: ${asset.maintenancePlan.type}</h4>
          <div class="mt-3 grid grid-cols-2 gap-3 text-slate-700">
            <div>Frecuencia: <strong>${asset.maintenancePlan.frequencyLabel}</strong></div>
            <div>Responsable: <strong>${asset.maintenancePlan.responsible}</strong></div>
            <div>Última Mantención: <strong>${formatDate(asset.maintenancePlan.lastDate)}</strong></div>
            <div class="text-blue-800 font-bold">Próxima Mantención: <strong>${formatDate(asset.maintenancePlan.nextDate)}</strong></div>
          </div>
          <p class="mt-2 text-slate-600"><em>Instrucciones: ${asset.maintenancePlan.notes}</em></p>
        </div>
      </div>
    `;
  } else if (tab === 'historial') {
    return `
      <div class="space-y-3">
        <h4 class="text-xs font-bold text-slate-400 uppercase">Línea de Tiempo del Activo (Historial Perpetuo)</h4>
        <div class="space-y-3 pl-2 border-l-2 border-slate-200">
          ${(asset.history || []).map(h => `
            <div class="relative pl-4 text-xs">
              <div class="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-blue-600 border-2 border-white"></div>
              <div class="flex items-center justify-between">
                <span class="font-extrabold text-slate-800">${h.type}</span>
                <span class="text-slate-500 font-semibold">${formatDate(h.date)}</span>
              </div>
              <p class="text-slate-600 mt-0.5">${h.description}</p>
              <div class="mt-1 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Registrado por: ${h.user}</span>
                ${h.cost > 0 ? `<span class="font-bold text-slate-800">Costo: ${formatCLP(h.cost)}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}

// ==========================================================
// COMPONENTE REUTILIZABLE: GESTOR DE MATERIALES Y COSTOS
// ==========================================================
function renderMaterialsManager(options) {
  const { parentType, parentId, materials = [], budget = 0, actualCost = 0, title = "Cómputo y Control de Materiales" } = options;

  // Cálculo automático del total general: suma de subtotales
  const calculatedTotal = materials.reduce((acc, m) => {
    const sub = (Number(m.quantity) || 0) * (Number(m.unitCost) || 0);
    m.subtotal = sub; // asegurar sincronización
    return acc + sub;
  }, 0);

  const effectiveCost = actualCost > 0 ? actualCost : calculatedTotal;
  const difference = budget - effectiveCost;

  return `
    <div class="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
        <div>
          <h4 class="text-xs font-black text-slate-900 uppercase tracking-tight flex items-center space-x-1.5">
            <span>📦</span>
            <span>${title}</span>
          </h4>
          <p class="text-[11px] text-slate-500">Cálculo automático de subtotales (Cantidad × Costo Unitario) y costo total del proyecto.</p>
        </div>
        <div class="flex items-center space-x-3 text-xs self-start sm:self-auto">
          <div>
            <span class="text-slate-500 font-bold block text-[10px] uppercase">Total Materiales:</span>
            <span class="font-black text-slate-900 text-sm">${formatCLP(calculatedTotal)}</span>
          </div>
        </div>
      </div>

      <!-- Resumen de Costos y Presupuesto -->
      ${budget > 0 ? `
        <div class="grid grid-cols-3 gap-2 p-3 bg-white rounded-xl border border-slate-200 text-xs text-center shadow-xs">
          <div>
            <p class="text-[10px] text-slate-500 uppercase font-bold">Presupuesto Estimado</p>
            <p class="font-extrabold text-slate-800 text-sm">${formatCLP(budget)}</p>
          </div>
          <div>
            <p class="text-[10px] text-slate-500 uppercase font-bold">Gasto / Total Real</p>
            <p class="font-extrabold text-blue-700 text-sm">${formatCLP(effectiveCost)}</p>
          </div>
          <div>
            <p class="text-[10px] text-slate-500 uppercase font-bold">Diferencia</p>
            <p class="font-extrabold text-sm ${difference >= 0 ? 'text-emerald-700' : 'text-rose-700'}">
              ${difference >= 0 ? '+' : ''}${formatCLP(difference)}
            </p>
          </div>
        </div>
      ` : ''}

      <!-- Lista de Materiales / Cuadrícula de Ítems -->
      <div class="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
        ${materials.length === 0 ? `
          <div class="p-4 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
            No se han registrado materiales todavía. Ingresa insumos en el formulario inferior.
          </div>
        ` : materials.map((mat, index) => {
          const subtotal = (Number(mat.quantity) || 0) * (Number(mat.unitCost) || 0);
          return `
            <div class="p-3 bg-white rounded-xl border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs hover:border-blue-300 transition-colors">
              <div class="flex-1 min-w-0">
                <p class="font-extrabold text-slate-800 truncate">${mat.name}</p>
                <div class="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
                  <span>${mat.quantity} ${mat.unit || 'unid'}</span>
                  <span>×</span>
                  <span class="font-semibold text-slate-700">${formatCLP(mat.unitCost)}</span>
                  <span class="text-slate-300">•</span>
                  <span class="font-black text-blue-800">Subtotal: ${formatCLP(subtotal)}</span>
                </div>
              </div>

              <!-- Controles de Edición Rápida y Eliminación -->
              <div class="flex items-center space-x-2 self-end sm:self-auto flex-shrink-0">
                <input type="number" min="0.1" step="any" value="${mat.quantity}" title="Editar Cantidad"
                  onchange="handleUpdateMaterialQty('${parentType}', '${parentId}', '${mat.id || index}', this.value)"
                  class="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 text-center">
                <button type="button" onclick="handleDeleteMaterial('${parentType}', '${parentId}', '${mat.id || index}')"
                  class="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1.5 rounded-lg text-xs font-bold transition-colors" title="Eliminar Insumo">
                  🗑️
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Formulario para Agregar Nuevo Material -->
      <form onsubmit="handleAddMaterialGeneric(event, '${parentType}', '${parentId}')" 
            class="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 bg-white p-3 rounded-xl border border-slate-200">
        <div class="sm:col-span-5">
          <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre Insumo *</label>
          <input type="text" id="mat-input-name-${parentId}" required placeholder="Ej: Pintura, Tubo PVC..."
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 focus:bg-white">
        </div>
        <div class="sm:col-span-2">
          <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cantidad *</label>
          <input type="number" id="mat-input-qty-${parentId}" required min="0.1" step="any" value="1"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 text-center focus:ring-1 focus:ring-blue-500 focus:bg-white">
        </div>
        <div class="sm:col-span-2">
          <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Unidad</label>
          <input type="text" id="mat-input-unit-${parentId}" placeholder="unid / m2" value="unid"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 text-center focus:ring-1 focus:ring-blue-500 focus:bg-white">
        </div>
        <div class="sm:col-span-3">
          <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Costo Unitario ($) *</label>
          <input type="number" id="mat-input-price-${parentId}" required min="0" step="any" placeholder="0"
            class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 text-right focus:ring-1 focus:ring-blue-500 focus:bg-white">
        </div>
        <div class="sm:col-span-12 flex items-center justify-between pt-1">
          <span class="text-[11px] text-slate-500 font-medium">El subtotal se calculará automáticamente al ingresar.</span>
          <button type="submit" 
            class="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm">
            + Agregar Material
          </button>
        </div>
      </form>
    </div>
  `;
}

function findParentContainer(parentType, parentId) {
  if (parentType === 'mantencion') {
    return state.maintenances.find(m => m.id === parentId);
  } else if (parentType === 'remodelacion') {
    return state.renovations.find(r => r.id === parentId);
  }
  // FASE 4G-5B: se eliminó la rama 'mejora' (buscaba en state.improvements,
  // mock). Mantención y Remodelación conservan intacta su gestión de materiales.
  return null;
}

function refreshParentModal(parentType, parentId) {
  if (parentType === 'mantencion') openMaintenanceDetail(parentId);
  else if (parentType === 'remodelacion') openRenovationDetail(parentId);
  // FASE 4G-5B: se eliminó la rama 'mejora' (llamaba al modal MOCK
  // openImprovementDetail, huérfano). Mantención/Remodelación intactas.
}

function handleAddMaterialGeneric(e, parentType, parentId) {
  e.preventDefault();
  const nameInput = document.getElementById(`mat-input-name-${parentId}`);
  const qtyInput = document.getElementById(`mat-input-qty-${parentId}`);
  const unitInput = document.getElementById(`mat-input-unit-${parentId}`);
  const priceInput = document.getElementById(`mat-input-price-${parentId}`);

  if (!nameInput || !qtyInput || !priceInput) return;

  const name = nameInput.value.trim();
  const qty = parseFloat(qtyInput.value) || 1;
  const unit = unitInput ? unitInput.value.trim() || 'unid' : 'unid';
  const price = parseFloat(priceInput.value) || 0;

  const parent = findParentContainer(parentType, parentId);
  if (parent) {
    if (!parent.materials) parent.materials = [];
    const subtotal = qty * price;
    parent.materials.push({
      id: `mat_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name,
      quantity: qty,
      unit,
      unitCost: price,
      subtotal
    });

    // Actualizar gasto real si es remodelación o mantención
    parent.actualCost = parent.materials.reduce((acc, m) => acc + (m.subtotal || 0), 0);

    saveState();
    refreshParentModal(parentType, parentId);
  }
}

function handleUpdateMaterialQty(parentType, parentId, matId, newQty) {
  const qty = parseFloat(newQty) || 1;
  const parent = findParentContainer(parentType, parentId);
  if (parent && parent.materials) {
    const mat = parent.materials.find((m, idx) => m.id === matId || String(idx) === String(matId));
    if (mat) {
      mat.quantity = qty;
      mat.subtotal = qty * (Number(mat.unitCost) || 0);
      parent.actualCost = parent.materials.reduce((acc, m) => acc + (m.subtotal || 0), 0);
      saveState();
      refreshParentModal(parentType, parentId);
    }
  }
}

function handleDeleteMaterial(parentType, parentId, matId) {
  const parent = findParentContainer(parentType, parentId);
  if (parent && parent.materials) {
    parent.materials = parent.materials.filter((m, idx) => m.id !== matId && String(idx) !== String(matId));
    parent.actualCost = parent.materials.reduce((acc, m) => acc + (m.subtotal || 0), 0);
    saveState();
    refreshParentModal(parentType, parentId);
  }
}

async function openRenovationDetail(renId, fromAreaId = null) {
  openModal('modal-renovation-detail');
  const content = document.getElementById('renovation-modal-content');
  
  if (content) {
    content.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 space-y-4">
        <span class="animate-spin text-4xl text-purple-600">⏳</span>
        <span class="text-sm font-bold text-slate-500">Cargando registros…</span>
      </div>
    `;
  }

  let ren;
  try {
    if (window.RemodelacionesService) {
      ren = await window.RemodelacionesService.getDetalle(renId);
    } else {
      throw new Error("Servicio de Remodelaciones no cargado");
    }
  } catch (error) {
    console.error("Error cargando detalle:", error);
    if (content) content.innerHTML = '<div role="alert" class="p-5 text-rose-600 dark:text-rose-300 font-bold">No se pudo consultar el proyecto en Supabase. Cierra la ficha y vuelve a intentarlo.</div>';
    return;
  }

  if (!ren) {
    if (content) {
      content.innerHTML = `<div class="p-5 text-rose-500 font-bold">Proyecto no encontrado.</div>`;
    }
    return;
  }

  openedFromAreaDetail = (fromAreaId && fromAreaId !== 'null' && fromAreaId !== 'undefined') ? fromAreaId : null;

  if (content) content.scrollTop = 0;

  if (content) {
    let importacionesHTML = '';
    if (!ren._isFallback && ren.importaciones && ren.importaciones.length > 0) {
      importacionesHTML += `<div class="mt-8 mb-6">
        <h3 class="text-lg font-black text-slate-800 border-b-2 border-slate-100 pb-2">RESUMEN DEL ARCHIVO DE ORIGEN</h3>
      </div>`;
      ren.importaciones.forEach(imp => {
        importacionesHTML += `
          <div class="mt-4 bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200">
            <div class="flex items-center justify-between mb-2">
              <div>
                <h4 class="text-sm font-black text-slate-900">${imp.archivo_origen}</h4>
                ${imp.hoja_origen ? `<p class="text-[10px] font-bold text-slate-500 uppercase mt-1">${imp.hoja_origen}</p>` : ''}
              </div>
            </div>
            <div class="mt-3 flex gap-4">
              <div>
                <p class="text-[10px] font-bold text-slate-500 uppercase">Total con IVA</p>
                <p class="text-sm font-black text-slate-800">${imp.total_con_iva != null ? formatCLP(imp.total_con_iva) : 'Sin valor registrado'}</p>
              </div>
              <div>
                <p class="text-[10px] font-bold text-slate-500 uppercase">Total sin IVA</p>
                <p class="text-sm font-black text-slate-800">${imp.total_sin_iva != null ? formatCLP(imp.total_sin_iva) : 'Sin valor registrado'}</p>
              </div>
            </div>
            ${imp.observaciones ? `<p class="text-xs text-slate-600 mt-3">${imp.observaciones}</p>` : ''}
          </div>
        `;
      });
    }

    let presupuestosHTML = '';
    if (ren._isFallback) {
      // Fallback a renderMaterialsManager para los mocks antiguos
      presupuestosHTML = renderMaterialsManager({
        parentType: 'remodelacion',
        parentId: ren.id,
        materials: ren.materials || [],
        budget: ren.budget || 0,
        actualCost: ren.actualCost || 0,
        title: 'Cómputo Automatizado de Materiales'
      });
    } else {
      // 1. Presupuestos Reales
      if (ren.presupuestos && ren.presupuestos.length > 0) {
        ren.presupuestos.forEach(pres => {
          const items = ren.items.filter(i => i.presupuesto_id === pres.id);
          const friendlyType = (pres.tipo || 'GENERAL').replace(/_/g, ' ');
          presupuestosHTML += `
            <div class="mt-6 bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200">
              <div class="flex items-center justify-between mb-1">
                <h4 class="text-sm font-black text-slate-900 uppercase">PRESUPUESTO ${friendlyType}</h4>
                <span class="text-sm font-black text-purple-700">${pres.total_con_iva != null ? formatCLP(pres.total_con_iva) : 'Sin total registrado'}</span>
              </div>
              ${pres.nombre_version ? `<p class="text-[10px] font-bold text-slate-500 uppercase mb-4">${pres.nombre_version}</p>` : '<div class="mb-4"></div>'}
              ${items.length > 0 ? `
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr class="border-b border-slate-200 text-slate-500 uppercase">
                        <th class="py-2 pr-2 font-bold whitespace-nowrap">Categoría</th>
                        <th class="py-2 pr-2 font-bold w-full">Descripción</th>
                        <th class="py-2 pr-2 font-bold whitespace-nowrap">Cantidad</th>
                        <th class="py-2 pr-2 text-right font-bold whitespace-nowrap">Valor con IVA</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${items.map(item => `
                        <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-100/50">
                          <td class="py-2 pr-2 text-slate-600 whitespace-nowrap">${item.categoria || '-'}</td>
                          <td class="py-2 pr-2 font-bold text-slate-800">${item.descripcion || '-'}</td>
                          <td class="py-2 pr-2 text-slate-600 whitespace-nowrap">${item.cantidad_original || item.cantidad || '-'}</td>
                          <td class="py-2 pr-2 text-right font-bold text-slate-900 whitespace-nowrap">${item.costo_total === null ? 'Sin valor registrado' : (item.costo_total === 0 ? '$0' : formatCLP(item.costo_total))}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              ` : '<p class="text-xs text-slate-500">No hay ítems registrados en este presupuesto.</p>'}
            </div>
          `;
        });
      } else {
        presupuestosHTML = '';
      }
    }

    // 2. Gastos Reales
    let gastosHTML = '';
    if (!ren._isFallback && ren.gastos && ren.gastos.length > 0) {
      gastosHTML = `
        <div class="mt-6 bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200">
          <h4 class="text-sm font-black text-slate-900 uppercase mb-4">Gastos Registrados</h4>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-slate-200 text-slate-500 uppercase">
                  <th class="py-2 pr-2 font-bold whitespace-nowrap">Fecha</th>
                  <th class="py-2 pr-2 font-bold w-full">Concepto</th>
                  <th class="py-2 pr-2 font-bold whitespace-nowrap">Proveedor</th>
                  <th class="py-2 pr-2 text-right font-bold whitespace-nowrap">Monto</th>
                </tr>
              </thead>
              <tbody>
                ${ren.gastos.map(gasto => {
                  const proveedor = ren.proveedores?.find(p => p.id === gasto.proveedor_id);
                  const nombreProv = proveedor ? (proveedor.nombre_original ?? proveedor.nombre_normalizado) : '-';
                  return `
                  <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-100/50">
                    <td class="py-2 pr-2 text-slate-600 whitespace-nowrap">${gasto.fecha ? formatDate(gasto.fecha) : '-'}</td>
                    <td class="py-2 pr-2 font-bold text-slate-800">${gasto.concepto || '-'}</td>
                    <td class="py-2 pr-2 text-slate-600 whitespace-nowrap">${nombreProv}</td>
                    <td class="py-2 pr-2 text-right font-bold text-slate-900 whitespace-nowrap">${gasto.monto != null ? formatCLP(gasto.monto) : '-'}</td>
                  </tr>
                `}).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // 3. Tareas
    let tareasHTML = '';
    if (!ren._isFallback && ren.tareas && ren.tareas.length > 0) {
      tareasHTML = `
        <div class="mt-6 bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200">
          <h4 class="text-sm font-black text-slate-900 uppercase mb-4">Tareas Registradas</h4>
          <div class="space-y-3">
            ${ren.tareas.map(tarea => `
              <div class="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <h5 class="text-xs font-bold text-slate-800">${tarea.titulo || '-'}</h5>
                  <p class="text-[10px] text-slate-500">${tarea.responsable_texto || 'No asignado'} • ${tarea.fecha_inicio ? formatDate(tarea.fecha_inicio) : '-'} al ${tarea.fecha_fin_estimada || tarea.fecha_vencimiento ? formatDate(tarea.fecha_fin_estimada || tarea.fecha_vencimiento) : '-'}</p>
                </div>
                <span class="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">${tarea.estado || 'Sin estado'}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    const estadoOpciones = ['Pendiente de inicio', 'En proceso', 'Pausado', 'Finalizado'];
    const currentStatus = ren.status || 'Estado no definido';

    content.innerHTML = `
      <div class="flex items-center justify-between pb-4 border-b border-slate-100">
        <div class="w-full pr-4">
          <div class="flex items-center space-x-2 flex-wrap gap-y-1 mb-2">
            <span class="text-xs font-extrabold bg-purple-100 text-purple-800 px-2.5 py-1 rounded-md uppercase border border-purple-200">
              Remodelación: ${ren.space || 'Ubicación no registrada'}
            </span>
            ${ren.es_historico ? `<span class="text-[10px] font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-md uppercase border border-amber-200">HISTÓRICO</span>` : ''}
            ${ren._isFallback ? `<span class="text-xs font-extrabold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-md">⚠️ Fallback Mocks</span>` : ''}
            ${openedFromAreaDetail ? `
              <button onclick="returnToAreaDetail()" class="text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-xl flex items-center space-x-1 transition-colors">
                <span>← Volver a Ficha de Área</span>
              </button>
            ` : ''}
          </div>
          <div class="flex items-center justify-between mt-2">
            <h3 class="text-xl font-extrabold text-slate-900">${ren.name || 'Sin nombre'}</h3>
            <div class="flex items-center gap-2">
              <label class="text-[10px] font-bold text-slate-500 uppercase">Estado:</label>
              <select data-proyecto-id="${ren.id}" data-prev="${currentStatus}" onchange="handleChangeEstado(this, '${ren.id}', event)" class="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer hover:bg-slate-100 transition-colors">
                ${!ren.status ? `<option value="Estado no definido">Estado no definido</option>` : ''}
                ${estadoOpciones.map(opt => `<option value="${opt}" ${ren.status === opt ? 'selected' : ''}>${opt}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
        <button onclick="closeModal('modal-renovation-detail')" class="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 self-start">&times;</button>
      </div>

      <div class="mt-4">
        <p class="text-xs text-slate-700 leading-relaxed mb-2">${ren.description || 'Sin descripción'}</p>
        ${!ren._isFallback ? `<p class="text-[11px] text-slate-500 font-bold uppercase mt-3 tracking-wide">Inicio: <span class="text-slate-800">${ren.fechaInicio ? formatDate(ren.fechaInicio) : '-'}</span> • Fin estimado: <span class="text-slate-800">${ren.fechaFin ? formatDate(ren.fechaFin) : '-'}</span></p>` : ''}
      </div>

      ${presupuestosHTML}
      ${gastosHTML}
      ${tareasHTML}

      <div class="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
        <span class="text-xs text-slate-500">Responsable: <strong>${ren.responsible || 'No asignado'}</strong></span>
        <div class="flex items-center space-x-2">
          ${openedFromAreaDetail ? `
            <button onclick="returnToAreaDetail()" class="px-4 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold hover:bg-purple-100 transition-colors">
              ← Volver a Ficha de Área
            </button>
          ` : ''}
          <button onclick="closeModal('modal-renovation-detail')" class="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800">
            Cerrar Ficha
          </button>
        </div>
      </div>
    `;
  }
}

// FASE 4G-5B: se eliminó openImprovementDetail() — modal MOCK huérfano que
// leía state.improvements (presupuesto/avance ficticios y gestión de materiales
// mock). La ficha REAL de Mejoras / Obras usa openImprovementProjectDetail()
// (js/views/mejoras.js) sobre el mismo contenedor #modal-improvement-detail.

// ==========================================================
// REQUISITO 5, 3 & 15: FICHA DE ÁREA REUTILIZABLE (AreaDetail)
// Estructura única para las 6 áreas con encabezado oscuro,
// apartados estructurados y 100% cuadrícula de cuadros.
// ==========================================================

function openTaskFromArea(module, id, areaId) {
  openedFromAreaDetail = areaId;
  if (module === 'mejoras') {
    // FASE 4G-4B: ficha REAL del proyecto (UUID de Supabase). El modal mock
    // openImprovementDetail() buscaba en state.improvements y fallaba en
    // silencio con UUID real. openedFromAreaDetail ya quedó seteado arriba,
    // por lo que returnToAreaDetail() sigue siendo compatible con el flujo
    // actual de navegación. NO reintroducir datos mock.
    openImprovementProjectDetail(id);
  } else if (module === 'remodelaciones') {
    openRenovationDetail(id, areaId);
  } else {
    openMaintenanceDetail(id, areaId);
  }
}

function goToGanttForArea(areaId) {
  closeModal('modal-area-detail');
  navigateTo('gantt');
  ganttAreaFilter = areaId;
  renderCurrentView();
}

function openAreaDetail(areaId) {
  // AREAS-2A.1: las seis entradas comparten la misma ficha y fuentes reales.
  return areaAbrirFicha(areaId);
}


// S2B: Se eliminaron renderRoleDropdown(), toggleRoleDropdown() y
// switchRole(). Estaban huerfanas (no existia el elemento #role-dropdown
// en el HTML) y switchRole sobrescribia state.currentUser con una
// identidad ficticia basada en los antiguos usuarios mock (ya
// eliminados junto con state.users en S3B-4). La identidad y el rol
// reales vienen de Supabase (app.js -> cargarPerfilReal).


function toggleNotificationDropdown(event) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  const dropdown = document.getElementById('notification-dropdown');
  if (!dropdown) return;

  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    dropdown.classList.remove('hidden');
    if (typeof renderTopbarNotifications === 'function') renderTopbarNotifications();
  } else {
    dropdown.classList.add('hidden');
  }
}

// S2B (SEGURIDAD): Se elimino por completo el modal de verificacion de
// administrador (PIN maestro 1234 hardcodeado y verificacion por contrasena
// mock). El acceso al Panel de Administracion depende unicamente del rol
// real ADMINISTRADOR (hasAccess sobre state.currentUser de Supabase).
// Se eliminaron: currentPinBuffer, adminPinSuccessCallback, adminAuthMode,
// setAdminAuthMode, toggleAdminAuthMode, toggleAdminPasswordVisibility,
// handleAdminPasswordSubmit, openAdminPinModal, updatePinDisplay,
// inputPinDigit, backspacePinDigit, clearPinBuffer, handlePhysicalPinKey
// y verifyEnteredPin. Tambien se elimino el HTML del modal en index.html.


// ==========================================================
// GESTIÓN DE USUARIOS (PANEL DE ADMINISTRACIÓN) — DESHABILITADA
// ==========================================================
// S2B: estas acciones escribían ÚNICAMENTE en localStorage (usuarios
// falsos que nunca existieron en Supabase Auth). Se deshabilitaron sin
// migrar aún. S3B-4: el store de usuarios mock (mockData.users /
// state.users / getHotelUsers()) fue eliminado por completo; la única
// fuente es Supabase (public.usuarios + public.roles). La DEFINICIÓN
// ÚNICA de openUserFormModal() vive aquí (admin.js ya no la declara).
// El formulario #modal-user-form se conserva en index.html y su
// onsubmit apunta a handleUserFormSubmit() (js/views/admin.js), que
// en modo 'nuevo' sigue cayendo en este stub y en modo 'aprobar'
// ejecuta el flujo real S3C-1C de aprobación de cuentas pendientes.
// Se usa sin contraseñas ni datos mock. La creación/invitación real
// llegará con una Edge Function server-side.
const MSG_GESTION_USUARIOS_DESHABILITADA =
  'Gestión de usuarios temporalmente deshabilitada. Se está migrando a Supabase. ' +
  'Los usuarios reales serán creados/invitados por el administrador del sistema.';

function openUserFormModal(userId = null) {
  alert(MSG_GESTION_USUARIOS_DESHABILITADA);
}

function handleSaveUserForm(e) {
  e.preventDefault();
  alert(MSG_GESTION_USUARIOS_DESHABILITADA);
}

window.openComplementarioDetail = async function (archivoOrigen) {
  try {
    const detail = await window.RemodelacionesService.getDetalleRegistroComplementario(archivoOrigen);
    
    let html = `
      <div class="mb-6 flex justify-between items-start">
        <div>
          <span class="text-xs font-extrabold bg-slate-100 text-slate-600 px-3 py-1 rounded-lg border border-slate-200 mb-3 inline-block">REGISTRO COMPLEMENTARIO</span>
          <h2 class="text-2xl font-black text-slate-900">${detail.archivo_origen}</h2>
        </div>
        <button onclick="closeModal('modal-renovation-detail')" class="bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 p-2 rounded-xl transition-colors font-bold w-10 h-10 flex items-center justify-center">
          ✕
        </button>
      </div>
    `;

    // Importaciones
    if (detail.importaciones && detail.importaciones.length > 0) {
      html += `<div class="mb-8">
        <h3 class="text-lg font-black text-slate-800 mb-4 border-b-2 border-slate-100 pb-2">Resumen de Archivo</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      `;
      detail.importaciones.forEach(imp => {
        html += `
          <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200">
            <h4 class="text-sm font-black text-slate-900">${imp.hoja_origen || 'GENERAL'}</h4>
            <div class="mt-3 flex gap-4">
              <div>
                <p class="text-[10px] font-bold text-slate-500 uppercase">Total con IVA</p>
                <p class="text-sm font-black text-slate-800">${imp.total_con_iva != null ? formatCLP(imp.total_con_iva) : 'Sin valor registrado'}</p>
              </div>
              <div>
                <p class="text-[10px] font-bold text-slate-500 uppercase">Total sin IVA</p>
                <p class="text-sm font-black text-slate-800">${imp.total_sin_iva != null ? formatCLP(imp.total_sin_iva) : 'Sin valor registrado'}</p>
              </div>
            </div>
            ${imp.observaciones ? `<p class="text-xs text-slate-600 mt-3 leading-relaxed">${imp.observaciones}</p>` : ''}
          </div>
        `;
      });
      html += `</div></div>`;
    }

    // Gastos
    if (detail.gastos && detail.gastos.length > 0) {
      html += `<div class="mb-8">
        <h3 class="text-lg font-black text-slate-800 mb-4 border-b-2 border-slate-100 pb-2">Gastos Registrados</h3>
        <div class="overflow-x-auto bg-slate-50 rounded-2xl border border-slate-200 p-4">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 text-slate-500 uppercase">
                <th class="py-2 pr-2 font-bold whitespace-nowrap">Fecha</th>
                <th class="py-2 pr-2 font-bold w-full">Concepto</th>
                <th class="py-2 pr-2 font-bold whitespace-nowrap">Proveedor</th>
                <th class="py-2 pr-2 font-bold whitespace-nowrap">Cantidad</th>
                <th class="py-2 pr-2 font-bold whitespace-nowrap">Costo Unit.</th>
                <th class="py-2 pr-2 text-right font-bold whitespace-nowrap">Monto Total</th>
              </tr>
            </thead>
            <tbody>
      `;
      detail.gastos.forEach(g => {
        const cant = g.cantidad_original || g.cantidad || '-';
        const costU = g.costo_unitario != null ? formatCLP(g.costo_unitario) : '-';
        const monto = g.monto === 0 ? '$0' : (g.monto ? formatCLP(g.monto) : 'Sin valor registrado');
        html += `
          <tr class="border-b border-slate-100 hover:bg-slate-100/50">
            <td class="py-2 pr-2 text-slate-600">${g.fecha ? formatDate(g.fecha) : '-'}</td>
            <td class="py-2 pr-2 font-bold text-slate-800">${g.concepto || '-'}</td>
            <td class="py-2 pr-2 text-slate-600">${g.proveedor_nombre || '-'}</td>
            <td class="py-2 pr-2 text-slate-600">${cant}</td>
            <td class="py-2 pr-2 text-slate-600">${costU}</td>
            <td class="py-2 pr-2 font-bold text-slate-900 text-right">${monto}</td>
          </tr>
        `;
      });
      html += `</tbody></table></div></div>`;
    }

    // Movimientos
    if (detail.movimientos && detail.movimientos.length > 0) {
      html += `<div class="mb-8">
        <h3 class="text-lg font-black text-slate-800 mb-4 border-b-2 border-slate-100 pb-2">Movimientos / Insumos / Bodega</h3>
        <div class="overflow-x-auto bg-slate-50 rounded-2xl border border-slate-200 p-4">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 text-slate-500 uppercase">
                <th class="py-2 pr-2 font-bold w-full">Producto</th>
                <th class="py-2 pr-2 font-bold whitespace-nowrap">Tipo</th>
                <th class="py-2 pr-2 font-bold whitespace-nowrap">Hoja / Sección</th>
                <th class="py-2 pr-2 font-bold whitespace-nowrap">Cantidad</th>
                <th class="py-2 pr-2 text-right font-bold whitespace-nowrap">Costo Total</th>
              </tr>
            </thead>
            <tbody>
      `;
      detail.movimientos.forEach(m => {
        const cant = m.cantidad_original || m.cantidad || '-';
        const monto = m.costo_total === 0 ? '$0' : (m.costo_total != null ? formatCLP(m.costo_total) : 'Sin valor registrado');
        const ubicacionInfo = [m.hoja_origen, m.seccion_origen].filter(Boolean).join(' / ') || '-';
        
        html += `
          <tr class="border-b border-slate-100 hover:bg-slate-100/50">
            <td class="py-2 pr-2 font-bold text-slate-800">${m.producto_original || '-'}</td>
            <td class="py-2 pr-2 text-slate-600 whitespace-nowrap">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${m.tipo_movimiento === 'INGRESO' ? 'bg-emerald-100 text-emerald-800' : (m.tipo_movimiento === 'EGRESO' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600')}">
                ${m.tipo_movimiento || '-'}
              </span>
            </td>
            <td class="py-2 pr-2 text-slate-600 whitespace-nowrap">${ubicacionInfo}</td>
            <td class="py-2 pr-2 text-slate-600 whitespace-nowrap">${cant}</td>
            <td class="py-2 pr-2 font-bold text-slate-900 text-right whitespace-nowrap">${monto}</td>
          </tr>
        `;
      });
      html += `</tbody></table></div></div>`;
    }

    // Proveedores
    if (detail.proveedores && detail.proveedores.length > 0) {
      html += `<div class="mb-8">
        <h3 class="text-lg font-black text-slate-800 mb-4 border-b-2 border-slate-100 pb-2">Proveedores</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      `;
      detail.proveedores.forEach(p => {
        const nombre = p.nombre_original || p.nombre_normalizado || 'Sin nombre';
        html += `
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
            <h4 class="text-sm font-bold text-slate-900 break-words">${nombre}</h4>
            <div class="mt-3 text-xs text-slate-600 space-y-2">
              ${p.rut ? `<p><span class="font-bold text-slate-400">RUT:</span> ${p.rut}</p>` : ''}
              ${p.email ? `<p><span class="font-bold text-slate-400">Email:</span> ${p.email}</p>` : ''}
              ${p.telefono ? `<p><span class="font-bold text-slate-400">Tel:</span> ${p.telefono}</p>` : ''}
              ${p.productos_ofrecidos ? `<p><span class="font-bold text-slate-400">Productos:</span> ${p.productos_ofrecidos}</p>` : ''}
            </div>
          </div>
        `;
      });
      html += `</div></div>`;
    }

    if (
      (!detail.importaciones || detail.importaciones.length === 0) && 
      (!detail.gastos || detail.gastos.length === 0) && 
      (!detail.movimientos || detail.movimientos.length === 0) && 
      (!detail.proveedores || detail.proveedores.length === 0)
    ) {
      html += `
        <div class="bg-slate-50 p-8 rounded-3xl border border-slate-200 text-center">
          <p class="text-sm font-bold text-slate-500">No hay detalles registrados para este archivo complementario.</p>
        </div>
      `;
    }

    html += `
      <div class="mt-8 pt-4 border-t border-slate-100 flex justify-end">
        <button onclick="closeModal('modal-renovation-detail')" class="px-6 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors shadow-md">
          Cerrar Registro
        </button>
      </div>
    `;

    document.getElementById('renovation-modal-content').innerHTML = html;
    openModal('modal-renovation-detail');

  } catch (error) {
    console.error("Error al abrir detalle complementario:", error);
    alert("No fue posible cargar este registro desde Supabase.");
  }
};

