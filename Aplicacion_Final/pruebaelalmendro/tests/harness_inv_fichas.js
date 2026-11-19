'use strict';
// Reutiliza el DOM y cargador del harness de Inventario, sin ejecutar su suite.
const fs=require('fs'),assert=require('assert/strict');
const base=fs.readFileSync(__dirname+'/harness_inv4.js','utf8');
const {cargarVista}=new Function('require','__dirname',base.slice(0,base.indexOf('async function main()'))+'\nreturn {cargarVista};')(require,__dirname);
let total=0;
function check(n,v){assert.ok(v,n);total++;console.log('PASS '+n);}
function diferida(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<14;i++)await Promise.resolve();}
function entorno(){
  const llamadas=[];const colas={existencias:[],bodegas:[],movimientos:[]};
  const svc={};
  for(const [metodo,tipo] of [['obtenerExistencias','existencias'],['obtenerBodegasHistoricas','bodegas'],['obtenerMovimientos','movimientos']]){
    svc[metodo]=(id,...args)=>{const d=diferida();llamadas.push({tipo,id,args});colas[tipo].push(d);return d.promise;};
  }
  const v=cargarVista(null,svc);v.invEstado.productos=[{producto_id:'a',nombre:'Producto A',unidad_medida:'Unidad'},{producto_id:'b',nombre:'Producto B',unidad_medida:'Litro'}];
  return {v,llamadas,colas,html:()=>v._doc.getElementById('inv-ficha-contenido').innerHTML};
}
const existencia=[{ubicacion_id:'bodega',ubicacion_nombre:'Bodega real',cantidad:0,linea_base_confirmada:true}];
const historico=[{ubicacion_id:'bodega',ubicacion_nombre:'Bodega real',archivo_origen:'EN BODEGA.xlsx',registros_historicos:1}];
const movimientos=nombre=>({movimientos:[{movimiento_id:nombre,ubicacion_nombre:'Bodega real',tipo:'ENTRADA',cantidad:2,fecha:null,responsable_texto:nombre}],total:1});
function resolver(r,i,nombre){r.colas.existencias[i].resolve(existencia);r.colas.bodegas[i].resolve(historico);r.colas.movimientos[i].resolve(movimientos(nombre));}
(async()=>{
  const r=entorno(),p=r.v.invAbrirFicha('a');
  check('modal inmediato con estado de carga',r.html().includes('Cargando ficha del producto')&&!r.v._doc.getElementById('inv-modal-ficha').classList.contains('hidden'));
  check('exactamente tres consultas paralelas del producto elegido',r.llamadas.length===3&&r.llamadas.every(x=>x.id==='a'));
  r.colas.existencias[0].resolve(existencia);r.colas.bodegas[0].resolve(historico);await flush();
  check('existencias y procedencia visibles antes del historial',r.html().includes('Producto A')&&r.html().includes('Bodega real')&&r.html().includes('Cargando historial de movimientos'));
  check('cero verificado conservado, sin afirmar historial vacío',r.html().includes('>0</span>')&&r.html().includes('Con línea base')&&!r.html().includes('Sin movimientos operativos registrados.'));
  await r.v.invCargarMasMovimientos();check('no pagina mientras carga el historial inicial',r.llamadas.length===3);
  r.colas.movimientos[0].resolve(movimientos('Autor real'));await p;
  check('historial completo reemplaza únicamente su espera',r.html().includes('Autor real')&&!r.html().includes('Cargando historial de movimientos'));
  const p2=r.v.invAbrirFicha('a');check('no guarda resultados en la deduplicación al terminar',r.llamadas.length===6);resolver(r,1,'Relectura');await p2;
  const d=entorno(),d1=d.v.invAbrirFicha('a'),d2=d.v.invAbrirFicha('a');
  check('doble apertura comparte tres solicitudes, no seis',d.llamadas.length===3);resolver(d,0,'Compartido');await Promise.all([d1,d2]);check('doble apertura presenta datos completos',d.html().includes('Compartido'));
  const f=entorno(),f1=f.v.invAbrirFicha('a'),f2=f.v.invAbrirFicha('b'),f3=f.v.invAbrirFicha('a',true);
  resolver(f,2,'Respuesta vigente');await f3;resolver(f,1,'Respuesta B');await f2;resolver(f,0,'Respuesta antigua A');await f1;
  check('carrera A → B → A no acepta una respuesta antigua del mismo UUID',f.html().includes('Respuesta vigente')&&!f.html().includes('Respuesta antigua A')&&!f.html().includes('Respuesta B'));
  check('actualización forzada conserva la lectura explícita',f.llamadas.length===9&&f.llamadas.slice(-3).every(x=>x.args.at(-1)===true));
  const cerrado=entorno(),c1=cerrado.v.invAbrirFicha('a');cerrado.v.invCerrarFicha();const antes=cerrado.html();resolver(cerrado,0,'No pintar');await c1;
  check('cerrar durante carga evita reapertura y render tardío',cerrado.html()===antes&&cerrado.v._doc.getElementById('inv-modal-ficha').classList.contains('hidden'));
  const e=entorno(),e1=e.v.invAbrirFicha('a');e.colas.movimientos[0].reject(Error('Fallo real de lectura'));await e1;const error=e.html();
  e.colas.existencias[0].resolve(existencia);e.colas.bodegas[0].resolve(historico);await flush();
  check('error temprano no queda reemplazado por carga parcial tardía',e.html()===error&&e.html().includes('Fallo real de lectura'));
  const e2=e.v.invAbrirFicha('a',true);resolver(e,1,'Recuperado');await e2;check('reintento tras error vuelve a consultar y recupera la ficha',e.llamadas.length===6&&e.html().includes('Recuperado'));
  const orden=entorno(),o1=orden.v.invAbrirFicha('a');orden.colas.movimientos[0].resolve(movimientos('Historial primero'));await flush();
  check('historial rápido no simula existencias vacías',orden.html().includes('Cargando ficha del producto'));
  orden.colas.existencias[0].resolve(existencia);orden.colas.bodegas[0].resolve(historico);await o1;check('orden inverso conserva todos los datos',orden.html().includes('Historial primero')&&orden.html().includes('Bodega real'));
  const pag=entorno(),pa=pag.v.invAbrirFicha('a');resolver(pag,0,'Primer historial');await pa;
  const mas=pag.v.invCargarMasMovimientos(),pb=pag.v.invAbrirFicha('b');
  pag.colas.existencias[1].resolve(existencia);pag.colas.bodegas[1].resolve(historico);await flush();
  pag.colas.movimientos[1].resolve(movimientos('Página antigua'));await mas;
  check('página tardía de A no contamina el historial pendiente de B',pag.html().includes('Producto B')&&pag.html().includes('Cargando historial de movimientos')&&!pag.html().includes('Página antigua'));
  await pag.v.invCargarMasMovimientos();check('página tardía no libera el bloqueo de carga inicial de B',pag.llamadas.length===7);
  pag.colas.movimientos[2].resolve(movimientos('Historial B'));await pb;check('B termina con su propio historial',pag.html().includes('Historial B')&&!pag.html().includes('Página antigua'));
  r.v._doc._dispatch('keydown',{key:'Escape'});check('UX-02 Escape conserva ficha',!r.v._doc.getElementById('inv-modal-ficha').classList.contains('hidden'));
  const overlay=r.v._doc.getElementById('inv-modal-ficha');overlay._dispatch('click',{target:overlay});check('UX-02 fondo conserva ficha',!overlay.classList.contains('hidden'));
  r.v.invCerrarFicha();check('X explícita sigue cerrando',overlay.classList.contains('hidden'));
  console.log(total+'/'+total+' PASS — UX-03 (sin red ni escrituras)');
})().catch(e=>{console.error(e);process.exitCode=1;});
