// Configuración personal: sin herramientas administrativas ni preferencias simuladas.
let activeConfigTab = 'apariencia';
const CONFIG_PERSONAL_TABS=[['apariencia','Apariencia'],['seguridad','Seguridad de mi cuenta'],['faq','Preguntas frecuentes'],['reportar','Reportar problema']];
function configuracionPuedeConsultar(){return typeof passwordPersonalCuentaActual==='function'&&!!passwordPersonalCuentaActual();}
function configuracionPuedeAdministrar(){return configuracionPuedeConsultar()&&typeof esAdminOperativoActual==='function'&&esAdminOperativoActual()&&typeof hasAccess==='function'&&hasAccess('configuracion',state.currentUser.role,false);}
function switchConfigTab(tab){if(!configuracionPuedeConsultar()||!CONFIG_PERSONAL_TABS.some(([id])=>id===tab))return;activeConfigTab=tab;renderCurrentView();}
function renderSeguridadMiCuenta(){
  if(!configuracionPuedeConsultar())return '';
  return '<h3 class="text-lg font-black text-slate-900 dark:text-white">Seguridad de mi cuenta</h3><p class="text-sm text-slate-500 dark:text-slate-400">Solicita un enlace al correo registrado de tu cuenta. Abre el enlace seguro para establecer una nueva contraseña; solicitarlo no cambia tu contraseña actual.</p><button id="password-personal-guardar" type="button" onclick="abrirCambioPasswordPersonal()" class="alm-btn-primary px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">Cambiar contraseña por correo</button><p id="password-personal-mensaje" role="status" aria-live="polite" class="text-sm text-slate-500 dark:text-slate-400"></p>';
}
function renderSettingsView(){
  if(!configuracionPuedeConsultar())return '';
  const iconos={apariencia:'◐',seguridad:'🔒',faq:'?',reportar:'✉'};
  const descripciones={apariencia:'Tema de la aplicación',seguridad:'Tu contraseña personal',faq:'Ayuda para usar el sistema',reportar:'Información para soporte'};
  return `<div class="alm-ui alm-main-page alm-module-page alm-settings w-full max-w-5xl mx-auto space-y-4 pb-10">${uiEncabezadoSeccion('Configuración','Preferencias y seguridad de tu cuenta.','settings')}<div class="alm-settings-layout"><nav aria-label="Configuración personal" class="alm-panel alm-settings-nav">${CONFIG_PERSONAL_TABS.map(([id,titulo])=>`<button type="button" onclick="switchConfigTab('${id}')" aria-pressed="${activeConfigTab===id}" aria-controls="config-personal-contenido" class="alm-settings-option"><span aria-hidden="true" class="alm-settings-nav-icon">${iconos[id]}</span><span><span class="block font-bold text-sm">${titulo}</span><span class="alm-settings-option-help">${descripciones[id]}</span></span></button>`).join('')}</nav><section id="config-personal-contenido" class="alm-panel alm-settings-content p-5 sm:p-6 space-y-4">${renderActiveConfigSection(activeConfigTab)}</section></div></div>`;

}
function renderActiveConfigSection(tab){
  if(!configuracionPuedeConsultar())return '';
  if(tab==='seguridad')return renderSeguridadMiCuenta();
  if(tab==='apariencia')return renderSectionAppearance();
  if(tab==='faq')return renderConfigFaq();
  if(tab==='reportar')return renderConfigReportar();
  return '';
}
function renderSectionAppearance(){
  if(!configuracionPuedeConsultar())return '';
  const oscuro=document.documentElement.classList.contains('dark');
  return `<h3 class="text-lg font-black text-slate-900 dark:text-white">Apariencia</h3><p class="text-sm alm-muted">Elige el tema de la aplicación. Se conservará en este navegador.</p><div class="alm-theme-options">${[['light','Modo claro'],['dark','Modo oscuro']].map(([valor,titulo])=>`<button type="button" onclick="setThemePreference('${valor}')" aria-pressed="${oscuro===(valor==='dark')}" class="alm-theme-option"><span aria-hidden="true" class="alm-theme-preview alm-preview-${valor}"><span class="alm-preview-sidebar"></span><span class="alm-preview-body"><span></span><span></span><span></span></span></span><span class="flex items-center justify-between gap-2 p-3"><span class="text-sm font-bold">${titulo}</span><span class="alm-theme-choice" aria-hidden="true">${oscuro===(valor==='dark')?'✓':'○'}</span></span></button>`).join('')}</div>`;

}
function setThemePreference(tema){
  if(!configuracionPuedeConsultar()||!['light','dark'].includes(tema))return;
  localStorage.setItem('hotel_theme',tema);
  if(state.settings?.appearance)state.settings.appearance.theme=tema;
  document.documentElement.classList.toggle('dark',tema==='dark');
  if(typeof saveState==='function')saveState();
  if(typeof renderCurrentView==='function')renderCurrentView();
}
function renderConfigFaq(){
  if(!configuracionPuedeConsultar())return '';
  const preguntas=[
    ['¿Cómo inicio sesión?','Abre el login e ingresa el correo y la contraseña de tu cuenta habilitada. Si no puedes acceder, consulta al administrador.'],
    ['¿Cómo cambio o recupero mi contraseña?','En Configuración → Seguridad de mi cuenta puedes cambiarla con tu contraseña actual. Si la olvidaste, utiliza ¿Olvidaste tu contraseña? en el login y sigue el enlace recibido por correo.'],
    ['¿Cómo consulto Mantenciones?','Abre Mantenciones y selecciona un subapartado disponible para tu rol. Las fichas distinguen los registros históricos de los trabajos registrados en el sistema.'],
    ['¿Cómo consulto Áreas de Trabajo?','Abre Áreas de Trabajo y selecciona el área. Utiliza sus accesos internos para consultar los registros conectados. La ausencia de información conectada se indica en la ficha.'],
    ['¿Dónde reviso los históricos?','Consulta los apartados históricos disponibles dentro de cada módulo y abre sus fichas para ver la procedencia. Un registro histórico no acredita una operación actual.'],
    ['¿Cómo utilizo Inventario?','Administradores permanentes y temporales vigentes pueden registrar productos y operaciones. Los técnicos tienen consulta. Los demás roles no acceden al módulo. Las cantidades históricas no son existencias actuales.'],
    ['¿Cómo consulto las Cartas Gantt?','Abre Línea de Tiempo, filtra el contexto y selecciona una carta agrupada por año. El gráfico muestra las fechas registradas; cuando faltan datos se informa expresamente.'],
    ['¿Cómo funcionan los permisos?','El acceso depende del rol y de las autorizaciones vigentes. Configuración personal no concede herramientas administrativas. Contacta al administrador si necesitas revisar tu acceso.']
  ];
  return '<h3 class="text-lg font-black text-slate-900 dark:text-white">Preguntas frecuentes</h3><div class="space-y-3">'+preguntas.map(([q,a])=>`<details class="rounded-2xl border border-slate-200 dark:border-slate-800 p-4"><summary class="text-sm font-bold cursor-pointer">${q}</summary><p class="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">${a}</p></details>`).join('')+'</div>';
}
function renderConfigReportar(){
  if(!configuracionPuedeConsultar())return '';
  const css='block mt-1 w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm';
  return `<h3 class="text-lg font-black text-slate-900 dark:text-white">Reportar problema</h3><p role="status" class="text-sm text-amber-800 dark:text-amber-300">Envío pendiente de habilitación: faltan los destinatarios y un servicio seguro de envío. Este formulario no envía ni almacena reportes.</p><form onsubmit="handleReportIssue(event)" class="space-y-4 max-w-2xl"><label class="block text-sm font-bold">Asunto<input name="asunto" required maxlength="160" class="${css}" /></label><label class="block text-sm font-bold">Descripción<textarea name="descripcion" required rows="4" class="${css}"></textarea></label><label class="block text-sm font-bold">Información adicional (opcional)<textarea name="adicional" rows="2" class="${css}"></textarea></label><p class="text-sm text-slate-500 dark:text-slate-400">No incluyas contraseñas ni información sensible.</p><button type="submit" disabled class="px-4 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-500 rounded-xl text-sm font-bold cursor-not-allowed">Envío no disponible</button></form>`;
}
function handleReportIssue(evento){evento?.preventDefault();}
