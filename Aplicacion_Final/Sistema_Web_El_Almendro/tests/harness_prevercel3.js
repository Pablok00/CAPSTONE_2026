// PRE-VERCEL-3: Activos y contadores laterales; sin red ni escrituras.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');let total=0;
function check(n,v){assert.ok(v,n);total++;console.log('[PASS] '+n);}
const activos=fs.readFileSync('js/views/activos.js','utf8'),app=fs.readFileSync('js/app.js','utf8'),index=fs.readFileSync('index.html','utf8');
const estado={};for(const k of ['assets','maintenances','requests','renovations','improvements'])Object.defineProperty(estado,k,{get(){throw Error('Datos simulados prohibidos: '+k);}});estado.notifications=[];
const ac={state:estado,calculateWarrantyStatus(){throw Error('Garantías ficticias');}};vm.createContext(ac);vm.runInContext(activos,ac);const html=ac.renderAssetsView();
check('activos muestra pendiente y validación con Andrés',html.includes('Activos Fijos')&&html.includes('Pendiente de configuración y validación con Andrés'));
check('no consume datos locales ni genera equipos, conteos o movimientos',!activos.includes('state.')&&!html.includes('openAssetDetail')&&!html.includes('Mostrando')&&!html.includes('<img'));
check('pantalla clara, oscura y responsive',html.includes('dark:bg-slate-900')&&html.includes('sm:flex-row')&&html.includes('role="status"'));
const ids=['mantenciones','activos','solicitudes','notif-count','mejoras','remodelaciones'].map(x=>'badge-nav-'+x);
check('ningún contador lateral muestra cifras iniciales hardcodeadas',ids.every(id=>{const m=index.match(new RegExp('<span id="'+id+'"\\s+class="([^"]*)">([^<]*)</span>'));return m&&m[1].split(' ').includes('hidden')&&m[2]==='';}));
check('enlaces de navegación existentes conservados',['mantenciones','activos','solicitudes','mejoras','remodelaciones'].every(v=>index.includes("navigateTo('"+v+"'")));
const bloque=app.slice(app.indexOf('let sidebarConteoSecuencia='),app.indexOf('function handleGlobalSearch('));
function contexto(){const nodos=new Map();let sinRol=false;const nodo=id=>{if(!nodos.has(id)){const clases=new Set();nodos.set(id,{textContent:'ejemplo',style:{},classList:{add:c=>clases.add(c),toggle(c,on){on?clases.add(c):clases.delete(c);},contains:c=>clases.has(c)}});}return nodos.get(id);};const c={document:{getElementById:nodo},state:estado,window:{},esCuentaSinRol:()=>sinRol};vm.createContext(c);vm.runInContext(bloque,c);return {c,nodo,set sinRol(v){sinRol=v;}};}
const terminar=()=>new Promise(resolve=>setImmediate(resolve));
async function main(){
 const r=contexto();r.c.window.MejorasService={async getProyectos(){return [{id:'m1',estado:'En proceso'},{id:'m2',estado:'Finalizado'},{id:'m3',estado:null}];}};r.c.window.RemodelacionesService={async getProyectos(){return [{id:'r1'},{id:'r2'}];}};r.c.updateSidebarBadges();await terminar();
 check('oculta contadores sin fuente verificada',ids.slice(0,4).every(id=>r.nodo(id).textContent===''&&r.nodo(id).classList.contains('hidden')));
 check('conserva conteo real de Mejoras con significado explícito',r.nodo('badge-nav-mejoras').textContent==='2'&&!r.nodo('badge-nav-mejoras').classList.contains('hidden')&&r.nodo('badge-nav-mejoras').title.includes('no finalizados'));
 check('conserva conteo real de proyectos Remodelación',r.nodo('badge-nav-remodelaciones').textContent==='2'&&r.nodo('badge-nav-remodelaciones').title.includes('registrados'));
 r.c.window.RemodelacionesService.getProyectos=async()=>{throw Error('Sin conexión');};r.c.updateSidebarBadges();await terminar();check('error de Remodelación oculta sin fallback local',r.nodo('badge-nav-remodelaciones').textContent===''&&r.nodo('badge-nav-remodelaciones').classList.contains('hidden'));
 r.c.window.MejorasService.getProyectos=async()=>null;r.c.updateSidebarBadges();await terminar();check('respuesta incompleta oculta contador',r.nodo('badge-nav-mejoras').classList.contains('hidden'));
 let llamadas=0;r.sinRol=true;r.c.window.MejorasService.getProyectos=async()=>{llamadas++;return [];};r.c.updateSidebarBadges();await terminar();check('cuenta sin rol no consulta fuentes operativas',llamadas===0&&ids.every(id=>r.nodo(id).classList.contains('hidden')));
 const tarde=contexto();let resolver;tarde.c.window.RemodelacionesService={getProyectos:()=>new Promise(r=>resolver=r)};tarde.c.updateSidebarBadges();await Promise.resolve();tarde.sinRol=true;tarde.c.updateSidebarBadges();resolver([{id:'viejo'}]);await terminar();check('respuesta tardía no revive contador de sesión anterior',tarde.nodo('badge-nav-remodelaciones').classList.contains('hidden')&&tarde.nodo('badge-nav-remodelaciones').textContent==='');
 check('sin escrituras en activos ni bloque modificado',!/\.rpc\(|\.insert\(|\.update\(|localStorage/.test(activos+bloque));
 console.log(total+'/'+total+' PASS — PRE-VERCEL-3 (solo memoria)');
}main().catch(e=>{console.error(e);process.exitCode=1;});
