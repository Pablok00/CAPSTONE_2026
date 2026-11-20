const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');let total=0;const check=(n,v)=>{assert.ok(v,n);total++;console.log('PASS '+n);};
const read=p=>fs.readFileSync(p,'utf8');
const state={areas:[]};for(const k of ['notifications','requests','maintenances','renovations'])Object.defineProperty(state,k,{get(){throw Error('No consumir datos locales: '+k);}});
const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',outerHTML:'',classList:{add(){},remove(){}}});return nodes.get(id);};
const timers=[];const c=vm.createContext({state,document:{getElementById:node},setTimeout:f=>timers.push(f),console:{error(){}},window:{},formatDate:x=>x});
for(const f of ['notificaciones','solicitudes','importar','remodelaciones'])vm.runInContext(read('js/views/'+f+'.js'),c);
async function main(){
for(const [fn,title,msg] of [['renderNotificationsView','Notificaciones','La gestión de notificaciones estará disponible'],['renderRequestsView','Solicitudes','El módulo de solicitudes estará disponible'],['renderImportView','Importar Excel / CSV','pendiente de implementación']]){const h=c[fn]();check(title+' aviso compartido sin acciones simuladas',h.includes(title)&&h.includes(msg)&&h.includes('alm-ui')&&!/<button|<form/.test(h));}
c.renderTopbarNotifications();check('Campana sin mensajes ni contadores locales',node('topbar-notif-list').innerHTML.includes('próximas actualizaciones'));
const index=read('index.html'),app=read('js/app.js');check('Campana dirige al apartado informativo',index.includes('onclick="navigateTo(\'notificaciones\')" aria-label="Abrir Notificaciones"'));
check('Sin acción marcar leídas ni contador inicial',!index.includes('markAllNotificationsRead')&&index.includes('id="topbar-notif-badge" style="display:none"'));
check('Accesos laterales conservados',index.includes('id="nav-solicitudes"')&&index.includes('id="nav-notificaciones"'));
check('Contador superior no consume notificaciones locales',!app.includes('state.notifications'));
c.window.RemodelacionesService={getProyectos:async()=>{throw Error('fallo en memoria');}};await c.fetchAndRenderRenovations();check('Error de lista Remodelación no presenta mocks',node('renovations-grid-container').innerHTML.includes('No se pudieron consultar'));
const real=c.getRenovationsGridHTML([{id:'real',name:'Trabajador Prueba',description:'Descripción original',status:'Pausado',es_historico:true}]);check('Proyecto recibido conserva nombre, histórico y estado',real.includes('Trabajador Prueba')&&real.includes('HISTÓRICO')&&real.includes('Pausado'));
const modals=read('js/modals.js');const start=modals.indexOf('async function openRenovationDetail('),end=modals.indexOf('\nfunction ',start+1);vm.runInContext(modals.slice(start,end),c);c.openModal=()=>{};await c.openRenovationDetail('real');check('Error de detalle Remodelación visible sin fallback',node('renovation-detail-content').innerHTML.includes('No se pudo consultar')||[...nodes.values()].some(n=>n.innerHTML.includes('No se pudo consultar el proyecto')));
check('Archivo histórico de mocks conservado sin cargarlo en la SPA',fs.existsSync('data/mockData.js')&&!index.includes('./data/mockData.js'));
check('Vista y carga de Fechas Próximas retiradas',!fs.existsSync('js/views/fechasProximas.js')&&!index.includes('./js/views/fechasProximas.js'));
check('Ruta retirada de router y permisos locales',!app.includes("case 'fechas-proximas':")&&!read('js/state.js').includes("'fechas-proximas'"));
const nav=app.slice(app.indexOf('function navigateTo('),app.indexOf('function renderCurrentView('));
const nc=vm.createContext({currentView:'dashboard',hasAccess:()=>true,toggleMobileSidebar(){throw Error('Ruta retirada no debe avanzar');}});
vm.runInContext(nav,nc);nc.navigateTo('fechas-proximas');
check('Ruta retirada bloqueada aun con permisos personalizados antiguos',nc.currentView==='dashboard');
console.log(total+'/'+total+' PASS — PRE-VERCEL-0 (solo memoria)');}
main().catch(e=>{console.error(e);process.exitCode=1;});
