'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
// El modo --solo-servicio no requiere Playwright.
// El fixture de navegador se carga solo al ejecutar interfaz().
const {usuarioId}=require('./harness_reactiva_eliminacion');
const fuente=p=>fs.readFileSync(p,'utf8');
const filas=Array.from({length:245},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,estado:['pendiente','aprobada','rechazada'][i%3],tipo_problema:i%5===0?`Tubería   norte ${i}`:`Problema ${i}`,ubicacion:i%7===0?'Bodega norte':'Recepción',creador_nombre_snapshot:i%11===0?null:i%4===0?'Ana   Pérez':'Luis Rojas',descripcion:'Descripción de prueba local. '.repeat(15),urgencia:'alta',created_at:new Date(Date.UTC(2026,0,1+Math.floor(i/2))).toISOString(),creada_por:i%2===0?usuarioId:'otro-usuario'}));
// Modelo PostgREST únicamente de lectura: registra la consulta y aplica filtros
// antes de count/range sobre 245 filas. No certifica SQL/RLS del servidor real.
function backend(datos){
 const e={datos,consultas:[],pausa:false,fallo:false,pendientes:[]};
 e.from=tabla=>{const q={tabla,eqs:[],orden:[]};return {
  select(columnas,opciones){q.columnas=columnas;q.count=opciones?.count;return this;},
  eq(c,v){q.eqs.push([c,v]);return this;},filter(c,op,v){q.filtro={c,op,v};return this;},or(v){q.or=v;return this;},order(c,o){q.orden.push([c,o.ascending]);return this;},
  async range(a,b){q.range=[a,b];e.consultas.push(q);let registros=e.datos.filter(r=>q.eqs.every(([c,v])=>r[c]===v));
   if(q.or){if(q.columnas.includes('usuarios!'))throw Error('Dependencia de usuarios inesperada');
    const partes=/^tipo_problema\.imatch\.("(?:\\.|[^"\\])*"),ubicacion\.imatch\.("(?:\\.|[^"\\])*"),creador_nombre_snapshot\.imatch\.("(?:\\.|[^"\\])*")$/.exec(q.or);
    if(!partes)throw Error('Sintaxis no esperada');
    const re=new RegExp(JSON.parse(partes[1]),'i'),reNombre=new RegExp(JSON.parse(partes[3]),'i');
    registros=registros.filter(r=>re.test(r.tipo_problema)||re.test(r.ubicacion)||reNombre.test(r.creador_nombre_snapshot||''));
   }
   registros.sort((a,b)=>{for(const [c,asc]of q.orden){const dif=String(a[c]).localeCompare(String(b[c]));if(dif)return asc?dif:-dif;}return 0;});
   const resultado={data:registros.slice(a,b+1),count:registros.length,error:null};
   if(e.pausa)await new Promise(r=>e.pendientes.push(r));if(e.fallo)throw Error('Red simulada');return resultado;
  }
 };};return e;
}
async function servicio(){
 const b=backend(filas),c=vm.createContext({window:{supabaseClient:{from:b.from,auth:{getUser:async()=>({data:{user:{id:usuarioId}}})}}},state:{currentUser:{id:usuarioId,role:'ADMINISTRADOR'}},esAdminOperativoActual:()=>true});
 vm.runInContext(fuente('js/services/solicitudes.service.js'),c);const s=c.window.SolicitudesService;
 const ids=rs=>Array.from(rs,r=>r.id),normal=v=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
 for(const estado of ['','pendiente','aprobada','rechazada'])for(const busqueda of ['','  TUBERÍA   NORTE  ','bodega',' ANA   PÉREZ '])for(const orden of ['recientes','antiguas']){
  const esperado=filas.filter(r=>(!estado||r.estado===estado)&&(!normal(busqueda)||[r.tipo_problema,r.ubicacion,r.creador_nombre_snapshot].some(v=>normal(v).includes(normal(busqueda))))).sort((a,b)=>(orden==='antiguas'?1:-1)*(a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)));
  for(const pagina of [0,1]){const r=await s.listar(pagina,{estado,busqueda,orden});assert.equal(r.total,esperado.length);assert.deepEqual(ids(r.registros),ids(esperado.slice(pagina*20,pagina*20+20)));}
 }
 for(const busqueda of ['.*','x,y)"\\','[a-z]','100%_','a|b'])assert.equal((await s.listar(0,{busqueda})).total,0);
 assert(b.consultas.every(q=>q.range[1]-q.range[0]===19&&q.count==='exact'));
 c.esAdminOperativoActual=()=>false;c.state.currentUser.role='RECEPCION';const propias=await s.listar();assert.equal(propias.total,123);assert(b.consultas.at(-1).eqs.some(([k,v])=>k==='creada_por'&&v===usuarioId));
 await assert.rejects(s.listar(-1));await assert.rejects(s.listar(0,{estado:'inventado'}));
 console.log('PASS servicio: combinaciones globales, páginas de 20, orden estable, espacios/caja, solicitante, literales y filtro propio');
}
async function interfaz(browser,width=1440,dark=false){
 const {preparar}=require('./harness_reactiva_eliminacion_ui'); const {page:p,errores}=await preparar(browser,{origen:'solicitudes',width,dark});
 await p.evaluate(()=>{solicitudesCerrarEliminacion();solicitudesCerrarDetalle();});
 await p.addScriptTag({content:fuente('js/services/solicitudes.service.js')});
 await p.addScriptTag({content:'window.crearBackendPrueba='+backend.toString()});
 await p.evaluate(datos=>{window.b=crearBackendPrueba(datos);supabaseClient.from=b.from;SolicitudesService.vinculos=async ids=>new Map(ids.map(id=>[id,'mantencion-prueba']));SolicitudesService.obtener=async id=>b.datos.find(r=>r.id===id);SolicitudesService.vinculo=async()=>null;solicitudesCargar(document.getElementById('solicitudes-vista'));},filas);
 const esperar=()=>p.waitForFunction(()=>{const c=solicitudesContextos.get(document.getElementById('solicitudes-vista'));return !c.cargando&&!c.busquedaTimer&&!c.reconsultar;});
 await esperar();
 const lista=p.locator('[data-solicitudes-lista]');assert.equal(await lista.locator('article').count(),20);
 await p.locator('[data-solicitudes-filtro="pendiente"]').click();await esperar();
 assert.equal(await lista.locator('[data-estado="pendiente"]').count(),20);
 const input=p.locator('[data-solicitudes-busqueda]'),antes=await p.evaluate(()=>b.consultas.length);
 await input.fill('  ANA');await input.fill(' ANA   PÉ');await input.fill(' ANA   PÉREZ ');await esperar();
 assert.equal(await p.evaluate(()=>b.consultas.length),antes+1);assert((await lista.textContent()).includes('Ana'));
 await p.locator('[data-solicitudes-orden]').selectOption('antiguas');await esperar();
 const base=await p.evaluate(()=>{const c=solicitudesContextos.get(document.getElementById('solicitudes-vista'));return {f:c.estado,b:c.busqueda,o:c.orden,ids:c.registros.map(r=>r.id)};});
 await p.getByRole('button',{name:'Ver solicitud',exact:true}).first().click();await p.getByRole('button',{name:'Cerrar ficha',exact:true}).click();
 assert.deepEqual(await p.evaluate(()=>{const c=solicitudesContextos.get(document.getElementById('solicitudes-vista'));return {f:c.estado,b:c.busqueda,o:c.orden,ids:c.registros.map(r=>r.id)};}),base);
 await input.fill('norte');await esperar();await p.getByRole('button',{name:'Siguiente',exact:true}).click();await esperar();
 assert.match(await p.locator('[data-solicitudes-pagina]').textContent(),/Página 2/);
 await p.evaluate(()=>{supabaseClient.auth.onAuthStateChange=()=>{};supabaseClient.removeChannel=async()=>{};supabaseClient.channel=()=>({on(tipo,f,fn){window.recibirBroadcast=fn;return this;},subscribe(fn){fn('SUBSCRIBED');return this;}});window.esCuentaSinRol=()=>false;});
 const sync=fuente('js/avisosSolicitudes.js');await p.addScriptTag({content:sync.slice(sync.indexOf('window.SolicitudesSincronizacion ='))});
 await p.evaluate(()=>SolicitudesSincronizacion.actualizarSesion());await p.waitForFunction(()=>b.consultas.length>0);await esperar();
 const n=await p.evaluate(()=>b.consultas.length),html=await lista.innerHTML();
 await p.evaluate(()=>{b.pausa=true;recibirBroadcast({payload:{v:1}});});await p.waitForFunction(()=>b.pendientes.length>0);
 assert.equal(await lista.innerHTML(),html);assert.equal(await lista.getAttribute('aria-busy'),'true');
 await p.evaluate(()=>{b.pausa=false;b.pendientes.splice(0).forEach(r=>r());});await esperar();
 assert.match(await p.locator('[data-solicitudes-pagina]').textContent(),/Página 2/);
 const ultima=await p.evaluate(()=>b.consultas.at(-1));assert(ultima.eqs.some(([k,v])=>k==='estado'&&v==='pendiente'));assert.equal(ultima.filtro.v,'norte');assert.equal(ultima.orden[0][1],true);assert.equal(ultima.range[0],20);assert((await p.evaluate(()=>b.consultas.length))>n);
 await p.evaluate(()=>SolicitudesSincronizacion.detener());
 // Cambiar filtros durante una lectura lenta: la respuesta anterior no se pinta.
 const anterior=await lista.innerHTML();await p.evaluate(()=>{b.pausa=true;solicitudesCargar(document.getElementById('solicitudes-vista'));});await p.waitForFunction(()=>b.pendientes.length>0);
 await p.locator('[data-solicitudes-filtro="rechazada"]').click();assert.equal(await lista.innerHTML(),anterior);
 await p.evaluate(()=>{b.pausa=false;b.pendientes.splice(0).forEach(r=>r());});await esperar();assert.equal(await lista.locator('[data-estado="rechazada"]').count(),20);
 const preservado=await lista.innerHTML();await p.evaluate(()=>{b.fallo=true;solicitudesCargar(document.getElementById('solicitudes-vista'));});await esperar();assert.equal(await lista.innerHTML(),preservado);assert.match(await p.locator('[data-solicitudes-estado]').textContent(),/conserva el último/);
 await p.evaluate(()=>{b.fallo=false;solicitudesCargar(document.getElementById('solicitudes-vista'));});await esperar();
 const medidas=await lista.evaluate(el=>({columnas:getComputedStyle(el).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth}));assert.equal(medidas.columnas,width===1440?2:1);assert.equal(medidas.overflow,false);
 await input.focus();assert.equal(await input.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');assert.deepEqual(errores,[]);
 if(process.env.SOLICITUDES_CAPTURAS)await p.screenshot({path:require('path').join(process.env.SOLICITUDES_CAPTURAS,`solicitudes-${width}-${dark?'oscuro':'claro'}.png`),fullPage:false});
 console.log(`PASS Chrome ${width} ${dark?'oscuro':'claro'}: debounce, filtros, ficha, paginación, Broadcast, lectura lenta/tardía, error y responsive`);await p.close();
}
async function main(){await servicio();if(process.argv.includes('--solo-servicio'))return;const {chromium}=require('playwright');const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{for(const width of [393,1440])for(const dark of [false,true])await interfaz(b,width,dark);}finally{await b.close();}}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

module.exports={interfaz,servicio};
