'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let total=0;
function check(n,v){assert.ok(v,n);total++;console.log('PASS '+n);}
function leer(p){return fs.readFileSync(p,'utf8');}
function funcion(s,n){const a=s.indexOf('function '+n+'('),b=s.indexOf('\n}',a);assert.ok(a>=0&&b>a,n);return s.slice(a,b+2);}
const modals=leer('js/modals.js'),app=leer('js/app.js');
let cierres=0;
const modal={scrollTop:0,classList:{add(){cierres++;}},querySelectorAll:()=>[]};
const c=vm.createContext({document:{getElementById:()=>modal},openedFromAreaDetail:null});
vm.runInContext(funcion(modals,'handleModalBackdropClick')+'\n'+funcion(modals,'closeModal'),c);
for(const id of [...leer('index.html').matchAll(/id="(modal-[^"]+)" onclick="handleModalBackdropClick/g)].map(m=>m[1])){
  c.handleModalBackdropClick({target:{id}},id);check('fondo compartido conserva '+id,cierres===0);
}
c.closeModal('modal-area-detail');check('cierre explícito compartido conservado',cierres===1);
const nodos={formulario:{value:'Datos escritos',seleccion:'bodega',fecha:'2026-10-23'}};
const mnt=leer('js/views/mantenciones.js'),pv=leer('js/views/prevencionista.js');
for(const [s,nombres] of [[mnt,[...mnt.matchAll(/function (mntTeclaEscape\w+|mntBodEscape)\(/g)].map(m=>m[1])],[pv,['pvTeclaEscape']]]){
  for(const nombre of nombres){
    const contexto=vm.createContext({document:{getElementById:()=>nodos.formulario}});
    vm.runInContext(funcion(s,nombre),contexto);const antes=JSON.stringify(nodos);
    contexto[nombre]({key:'Escape'});check('Escape conserva '+nombre,JSON.stringify(nodos)===antes);
  }
}
for(const p of ['js/views/mantenciones.js','js/views/prevencionista.js','js/views/inventario.js']){
  const s=leer(p);
  const callbacks=[...s.matchAll(/(?:overlay\.onclick = function \(ev\)|overlay\.addEventListener\('click', (?:function \(ev\)|\(ev\) =>)) \{([\s\S]*?)\n\s*\}[);]*/g)];
  check('manejadores locales de fondo revisados '+p,callbacks.length>0);
  for(const [i,m] of callbacks.entries()){
    const contexto=vm.createContext({overlay:{id:'exterior'},ev:{target:null},document:{getElementById:()=>nodos.formulario}});
    vm.runInContext('ev.target=overlay;'+m[1],contexto);check('fondo sin cierre '+p+' #'+i,nodos.formulario.value==='Datos escritos');
  }
}
const inv=vm.createContext({invSugAbierto:true});
inv.invSugCerrar=()=>{inv.invSugAbierto=false;};
vm.runInContext(funcion(leer('js/views/inventario.js'),'invManejarTeclaFicha'),inv);
inv.invManejarTeclaFicha({key:'Escape'});check('Escape conserva funcionalidad no modal del autocompletado',!inv.invSugAbierto);
inv.invManejarTeclaFicha({key:'Escape'});check('Escape posterior no intenta cerrar una ficha',true);
for(const [p,n,estado] of [['js/views/admin.js','adminGestionTeclado','adminGestion'],['js/views/jardineriaArea.js','jdaTeclaDetalle','jdaModalContexto'],['js/app.js','teclaCierreSesion','cierreSesionContexto']]){
  const contexto=vm.createContext({[estado]:{}});vm.runInContext(funcion(leer(p),n),contexto);
  contexto[n]({key:'Escape'});check('Escape conserva modal y no toca foco '+n,contexto[estado]!==null);
}
const listeners={};const global=vm.createContext({document:{addEventListener:(k,f)=>{listeners[k]=f;},getElementById:()=>null},closeModal:()=>{throw Error('cierre accidental');},toggleMobileSidebar(){}});
const a=app.indexOf("  // Escape conserva las ventanas"),b=app.indexOf('  // Inicializar Tema y Enrutamiento por Hash',a);
vm.runInContext(app.slice(a,b),global);listeners.keydown({key:'Escape'});listeners.click({target:{id:'modal-anidado'}});
check('listeners globales no cierran modal padre ni hijo',true);
check('UX-01 conserva etiquetas Gantt',pv.includes("itemId ? 'Nombre de la tarea' : 'Nombre de la nueva tarea'")&&leer('js/views/gantt.js').includes("id?'Nombre de la fase':'Nombre de la nueva fase'"));
console.log(total+'/'+total+' PASS — UX-02 (solo memoria)');
