import test from 'node:test';
import assert from 'node:assert/strict';
import { captureConservation, verifyConservation, conserveDocumentStorage, verifyAfterAuth, CONSERVATION_CATEGORIES, PERSISTENT_HISTORY_TABLES, createPhysicalStorageReader, measurePhysicalStorage, measureIntegralPhysicalStorage, normalizePhysicalInventory } from
  '../supabase/functions/usuario-eliminacion-previsualizar/conservacion-previa.mjs';
const A='11111111-1111-4111-8111-111111111111', T='22222222-2222-4222-8222-222222222222';
const O='33333333-3333-4333-8333-333333333333', R='44444444-4444-4444-8444-444444444444';
test('363 V2 físico: comparación SHA/tamaño previa y posterior sin certificado V1',async()=>{
  const inventory=[{id:O,bucket_id:'documentos-cuentas',storage_path:'cuentas/'+T+'/'+O,version:'v1',tamano_bytes:3,sha256_documental:'f'.repeat(64)}];
  const reader={read:async()=>({tamano_bytes:3,sha256:'f'.repeat(64)})};
  const before=await measureIntegralPhysicalStorage(reader,'Bearer sintético',inventory);
  assert.deepEqual(await measureIntegralPhysicalStorage(reader,'Bearer sintético',inventory,before),before);
  await assert.rejects(()=>measureIntegralPhysicalStorage({read:async()=>({tamano_bytes:3,sha256:'a'.repeat(64)})},'Bearer sintético',inventory,before),/CONTENIDO_CAMBIO/);
  await assert.rejects(()=>measureIntegralPhysicalStorage({read:async()=>null},'Bearer sintético',inventory),/CONTENIDO_CAMBIO/);
});
test('363 V2 físico: límites 128 archivos, 16 MiB individual y 64 MiB total antes de GET',async()=>{
  let gets=0;const reader={read:async o=>{gets++;return {tamano_bytes:o.tamano_bytes,sha256:'f'.repeat(64)};}};
  const objects=(count,size)=>Array.from({length:count},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
    bucket_id:'documentos-trabajadores',storage_path:'ensayo/'+i,version:'v1',tamano_bytes:size}));
  for(const inv of [objects(129,1),objects(1,16777217),objects(5,16777216)])await assert.rejects(()=>measureIntegralPhysicalStorage(reader,'Bearer sintético',inv));
  assert.equal(gets,0);assert.equal((await measureIntegralPhysicalStorage(reader,'Bearer sintético',objects(4,16777216))).length,4);
});
const row=()=>({id:O,actor_id:A,objetivo_id:T,estado:'PREPARADA',intentos_auth:0,
  dependencias_resumen:{paso191:{request_id:R,fingerprint:'a'.repeat(64)}}});
function fixture() {
  const r=row();
  const evidence={version:1,vinculo:{operacion_id:O,actor_id:A,objetivo_id:T,request_id:R,fingerprint:'a'.repeat(64)},
    identidad_integra:true,documentos_integros:true,fk_preservadas:true,auth_presente:true,delegaciones_cerradas:true,ledger_laboral:{version:1,usuario_id:T,trabajador_actual:null,eventos:0,sha256:'f'.repeat(64)},
    catalogo_sha256:'b'.repeat(64),categorias:Object.fromEntries(CONSERVATION_CATEGORIES.map(k=>[k,{filas:0,sha256:'c'.repeat(64)}])),
    propietarios_originales:[{id:R,owner:T,owner_id:T}],archivos_verificados:false,propiedad_neutralizada:false};
  const history={version:1,operacion_presente:true,catalogo_sha256:'b'.repeat(64),
    tablas:Object.fromEntries(PERSISTENT_HISTORY_TABLES.map(t=>[t,{filas:t==='usuarios_identidades_historicas'?1:0,bytes:8,sha256:'e'.repeat(64)}]))};
  const calls=[];
  const tx=async(parts,...values)=>{calls.push({sql:parts.join('?'),values});return parts.join('?').includes('AS historia_persistente')?[{historia_persistente:structuredClone(history)}]:[{evidencia:structuredClone(evidence)}]};
  return {r,evidence,history,tx,calls};
}
test('DEL-FIX-21: captura de SQL vinculada a misma operación; nunca autoriza Auth ni neutraliza Storage',async()=>{
  const f=fixture(), c=await captureConservation(f.tx,f.r);
  assert.equal(c.habilita_auth,false);assert.equal(c.evidencia.archivos_verificados,false);
  assert.deepEqual(c.evidencia.propietarios_originales,f.evidence.propietarios_originales);
  assert.deepEqual(await verifyConservation(f.tx,f.r,c),{evidencia_vigente:true,habilita_auth:false});
  assert(f.calls.every(c=>c.sql.startsWith('SELECT')||c.sql.startsWith('WITH')));
  assert(f.calls.filter(c=>c.sql.startsWith('SELECT public.')).every(c=>c.values.length===1&&c.values[0]===O));
});
test('DEL-FIX-21: certificado serializado o claves reordenadas verifican contra lectura nueva',async()=>{
  const f=fixture(),c=JSON.parse(JSON.stringify(await captureConservation(f.tx,f.r)));
  c.evidencia.categorias=Object.fromEntries(Object.entries(c.evidencia.categorias).reverse());
  await verifyConservation(f.tx,f.r,c);
});
for(const key of CONSERVATION_CATEGORIES) test(`DEL-FIX-21: cambio en ${key} invalida, aunque el conteo coincida`,async()=>{
  const f=fixture(),c=await captureConservation(f.tx,f.r);
  f.evidence.categorias[key].sha256='d'.repeat(64);
  await assert.rejects(verifyConservation(f.tx,f.r,c),/CERTIFICADO_DESACTUALIZADO/);
});
test('DEL-FIX-21: rechaza categorías ausentes, formatos manipulados y confirmaciones no acreditadas',async()=>{
  for(const mutate of [e=>delete e.categorias.storage,e=>e.categorias.trabajos.filas=-1,
    e=>e.identidad_integra=false,e=>e.documentos_integros=false,e=>e.fk_preservadas=false,e=>e.auth_presente=false,e=>e.delegaciones_cerradas=false,
    e=>e.ledger_laboral={},e=>e.archivos_verificados=true,e=>e.propiedad_neutralizada=true,
    e=>e.categorias.storage.sha256='invalido',e=>e.password='dato ajeno']){
    const f=fixture();mutate(f.evidence);
    await assert.rejects(captureConservation(f.tx,f.r),/^Error: CERTIFICADO_/);
  }
});
test('DEL-FIX-21: certificado alterado, otro UUID/actor/request y estado incompatible se rechazan',async()=>{
  const f=fixture(),c=await captureConservation(f.tx,f.r);
  for(const mutate of [v=>v.habilita_auth=true,v=>v.evidencia.categorias.storage.filas++,v=>v.extra=true]){
    const v=structuredClone(c);mutate(v);await assert.rejects(verifyConservation(f.tx,f.r,v),/CERTIFICADO_MANIPULADO/);
  }
  for(const mutate of [r=>r.id=R,r=>r.actor_id=R,r=>r.objetivo_id=R,
    r=>r.dependencias_resumen.paso191.request_id=O,r=>r.estado='AUTH_EN_CURSO',r=>r.intentos_auth=1]){
    const r=row();mutate(r);await assert.rejects(captureConservation(f.tx,r),/^Error: CERTIFICADO_/);
  }
});
test('DEL-FIX-21: huella recalculada por cliente no sustituye evidencia SQL',async()=>{
  const f=fixture(),c=await captureConservation(f.tx,f.r);
  f.evidence.categorias.documentos.sha256='d'.repeat(64);
  const forged=await captureConservation(f.tx,f.r); // Simula atacante capaz de recalcular la huella.
  f.evidence.categorias.documentos.sha256=c.evidencia.categorias.documentos.sha256;
  await assert.rejects(verifyConservation(f.tx,f.r,forged),/CERTIFICADO_DESACTUALIZADO/);
});
test('DEL-FIX-21: pérdida de conexión o respuesta incompleta no produce certificado',async()=>{
  for(const tx of [async()=>[],async()=>[{evidencia:null}],async()=>{throw Error('fallo simulado')}])
    await assert.rejects(captureConservation(tx,row()));
});


test('DEL-FIX-22: puerto Storage conserva certificado/propietario histórico y retorna solo estados sin Auth',async()=>{
  const f=fixture();f.r.dependencias_resumen.conservacion_previa_v1=await captureConservation(f.tx,f.r);
  const before=structuredClone(f.r);const calls=[];
  const tx=async(parts,...values)=>{
    calls.push({sql:parts.join('?'),values});
    if(parts.join('?').includes('usuario_eliminacion_conservar_storage_v1'))return [{resultado:{operacion_id:O,
      objetos_neutralizados:1,documentos_conservados:true,propiedad_neutralizada:true,archivos_verificados:false,habilita_auth:false}}];
    return f.tx(parts,...values);
  };
  const result=await conserveDocumentStorage(tx,f.r);
  assert.equal(result.habilita_auth,false);assert.equal(result.archivos_verificados,false);
  assert.equal(result.propiedad_neutralizada,true);assert.deepEqual(f.r,before);
  const neutral=calls.filter(c=>c.sql.includes('conservar_storage_v1'));assert.equal(neutral.length,1);assert.equal(neutral[0].values[0],O);
  assert.equal(neutral[0].values[1],before.dependencias_resumen.conservacion_previa_v1.sha256);
  assert(calls.every(c=>c.sql.startsWith('SELECT')||c.sql.startsWith('WITH')));
});
test('DEL-FIX-22: certificado obsoleto no llega a la neutralización',async()=>{
  const f=fixture();f.r.dependencias_resumen.conservacion_previa_v1=await captureConservation(f.tx,f.r);
  f.evidence.categorias.documentos.sha256='e'.repeat(64);
  await assert.rejects(conserveDocumentStorage(f.tx,f.r),/CERTIFICADO_DESACTUALIZADO/);
  assert(f.calls.every(c=>!c.sql.includes('conservar_storage')));
});
test('DEL-FIX-22: respuesta incierta/incompleta o éxito falso no se acepta',async()=>{
  for(const result of [null,{}, {operacion_id:O,habilita_auth:true},
    {operacion_id:O,objetos_neutralizados:1,documentos_conservados:true,propiedad_neutralizada:true,archivos_verificados:true,habilita_auth:false},
    {operacion_id:R,objetos_neutralizados:1,documentos_conservados:true,propiedad_neutralizada:true,archivos_verificados:false,habilita_auth:false}]){
    const f=fixture();f.r.dependencias_resumen.conservacion_previa_v1=await captureConservation(f.tx,f.r);
    const tx=async(parts,...v)=>parts.join('?').includes('conservar_storage')?[{resultado:result}]:f.tx(parts,...v);
    await assert.rejects(conserveDocumentStorage(tx,f.r),/CONSERVACION_DOCUMENTAL_NO_ACREDITADA/);
  }
});
test('DEL-FIX-22: cambios ajenos a propiedad técnica después de neutralizar invalidan la conservación',async()=>{
  for(const key of ['storage','documentos','contratos']){
    const f=fixture();f.r.dependencias_resumen.conservacion_previa_v1=await captureConservation(f.tx,f.r);
    const tx=async(parts,...v)=>{
      if(parts.join('?').includes('conservar_storage')){
        f.evidence.categorias[key].sha256='e'.repeat(64);
        return [{resultado:{operacion_id:O,objetos_neutralizados:1,documentos_conservados:true,propiedad_neutralizada:true,
          archivos_verificados:false,habilita_auth:false}}];
      }
      return f.tx(parts,...v);
    };
    await assert.rejects(conserveDocumentStorage(tx,f.r),/CERTIFICADO_DESACTUALIZADO/);
  }
});


async function postFixture(changes={}) {
  const f=fixture();const certificate=await captureConservation(f.tx,f.r);
  f.r.objetivo_nombre_snapshot='Persona sintética';f.r.auditoria_id=null;f.r.estado='AUTH_EN_CURSO';f.r.intentos_auth=1;
  f.r.dependencias_resumen.conservacion_previa_v1=certificate;
  f.r.dependencias_resumen.conservacion_documental_v1={version:1,vinculo:certificate.vinculo,
    certificado_sha256:certificate.sha256,habilita_auth:false,archivos_verificados:false,propiedad_neutralizada:true,
    objetos:[{id:R,owner:T,owner_id:T,neutralizado:true,bucket_id:'documentos-cuentas',sha256_inmutable:'a'.repeat(64)}],documentos:[]};
  const calls=[];
  const tx=async(parts,...values)=>{
    const q=parts.join('?');calls.push(q);
    if(q.includes('AS historia_persistente'))return [{historia_persistente:structuredClone(f.history)}];
    if(q.includes('AS auth_ausente'))return [{auth_ausente:true,perfil_ausente:true,ficha_presente:true,
      identidad:{cuenta_id:T,nombre_snapshot:f.r.objetivo_nombre_snapshot,trabajador_id:null,operacion_id:null},
      ledger_actual:certificate.evidencia.ledger_laboral,auditoria:null,...changes.identity}];
    if(q.includes('AS sin_propiedad'))return [{sin_propiedad:true,objetos_conservados:true,...changes.storage}];
    if(q.includes('AS documentos_conservados'))return [{documentos_conservados:true,...changes.documents}];
    throw Error('Consulta inesperada');
  };
  return {...f,tx,calls};
}
test('POST Auth: verifica ausencia/identidad/ledger/Storage/documentos solo mediante SELECT; sin habilitar Auth ni afirmar bytes',async()=>{
  const f=await postFixture();const before=structuredClone(f.r);
  const r=await verifyAfterAuth(f.tx,f.r);
  assert.equal(r.habilita_auth,false);assert.equal(r.conservacion_integral_verificada,false);
  assert.equal(r.requiere_revision,true);assert.equal(r.historia_persistente_verificada,true);assert.equal(r.bloqueo,'VERIFICACION_FISICA_PENDIENTE');
  assert.deepEqual(f.r,before);assert.equal(f.calls.length,4);
  assert(f.calls.every(q=>q.startsWith('SELECT')||q.startsWith('WITH')));
});
test('POST Auth: Auth presente, perfil presente, pérdida de ficha/ledger/documentos/objeto bloquean sin escrituras',async()=>{
  for(const changes of [{identity:{auth_ausente:false}},{identity:{perfil_ausente:false}},
    {identity:{ficha_presente:false}},{identity:{ledger_actual:{}}},{storage:{objetos_conservados:false}},
    {storage:{sin_propiedad:false}},{documents:{documentos_conservados:false}}]){
    const f=await postFixture(changes),before=structuredClone(f.r);
    await assert.rejects(verifyAfterAuth(f.tx,f.r));assert.deepEqual(f.r,before);
  }
});
test('POST Auth: recibo omitido/manipulado, identidad distinta o estado PREPARADA nunca certifican',async()=>{
  for(const mutate of [r=>r.estado='PREPARADA',r=>r.intentos_auth=0,r=>r.objetivo_id=O,
    r=>r.dependencias_resumen.conservacion_previa_v1.habilita_auth=true,
    r=>delete r.dependencias_resumen.conservacion_documental_v1,
    r=>r.dependencias_resumen.conservacion_documental_v1.objetos=[],
    r=>r.dependencias_resumen.conservacion_documental_v1.certificado_sha256='f'.repeat(64)]){
    const f=await postFixture();mutate(f.r);await assert.rejects(verifyAfterAuth(f.tx,f.r));
  }
});
test('POST Auth: interrupción no devuelve éxito ni modifica la operación',async()=>{
  const f=await postFixture(),before=structuredClone(f.r);
  await assert.rejects(verifyAfterAuth(async()=>{throw Error('conexión perdida')},f.r));
  assert.deepEqual(f.r,before);
});


test('Historia persistente: queda incluida en SHA previo, sin necesitar reconstruir public.usuarios',async()=>{
  const f=fixture(),c=await captureConservation(f.tx,f.r);
  assert.deepEqual(c.historia_persistente,f.history);
  assert(PERSISTENT_HISTORY_TABLES.includes('trabajadores'));
  assert(PERSISTENT_HISTORY_TABLES.includes('usuarios_identidades_historicas'));
  assert(!PERSISTENT_HISTORY_TABLES.includes('usuarios'));
  const q=f.calls.find(c=>c.sql.includes('AS historia_persistente')).sql;
  assert(!/FROM public\.usuarios\b/.test(q));
  const altered=structuredClone(c);altered.historia_persistente.tablas.trabajadores.sha256='a'.repeat(64);
  await assert.rejects(verifyConservation(f.tx,f.r,altered),/CERTIFICADO_MANIPULADO/);
});
test('Historia persistente: evidencia ausente, vacía o fuente incompleta bloquea captura',async()=>{
  for(const mutate of [h=>delete h.tablas.trabajadores,h=>h.operacion_presente=false,
    h=>h.tablas.usuarios_identidades_historicas.filas=0,h=>h.tablas.cuentas_documentos.filas=10001]){
    const f=fixture();mutate(f.history);await assert.rejects(captureConservation(f.tx,f.r),/EVIDENCIA_HISTORICA_INCOMPLETA/);
  }
});
test('Historia persistente POST: cambios en ficha/trabajos/auditorías/delegaciones se rechazan aun con mismo conteo',async()=>{
  for(const table of ['trabajadores','usuarios_identidades_historicas','tareas','mantenciones',
    'usuarios_gestion_auditoria','administraciones_temporales','storage.objects','cuentas_documentos']){
    const f=await postFixture();f.history.tablas[table].sha256='a'.repeat(64);
    await assert.rejects(verifyAfterAuth(f.tx,f.r),/EVIDENCIA_HISTORICA_ALTERADA/);
  }
});
test('Historia persistente POST: certificado antiguo o sin prueba durable nunca se completa retroactivamente',async()=>{
  const f=await postFixture();delete f.r.dependencias_resumen.conservacion_previa_v1.historia_persistente;
  await assert.rejects(verifyAfterAuth(f.tx,f.r));
});
test('Historia persistente POST: auditoría final de otra identidad no se acepta',async()=>{
  const f=await postFixture();f.r.estado='COMPLETADA';f.r.auditoria_id=R;
  await assert.rejects(verifyAfterAuth(f.tx,f.r),/AUDITORIA_NO_VERIFICABLE/);
});


test('Historia persistente POST: auditoría final correcta mantiene la validación histórica sin habilitar Auth',async()=>{
  const f=await postFixture();f.r.estado='COMPLETADA';f.r.auditoria_id=R;
  f.r.actor_nombre_snapshot='Administrador sintético';f.r.motivo='Motivo original';
  const base=f.tx;
  const tx=async(parts,...v)=>{
    const rows=await base(parts,...v);
    if(parts.join('?').includes('AS auth_ausente')) rows[0].auditoria={id:R,modulo:'Administración de Usuarios',
      entidad_tipo:'usuario',accion:'ELIMINACION_PERMANENTE',entidad_id:T,ejecutado_por:A,
      entidad_referencia:f.r.objetivo_nombre_snapshot,ejecutado_por_nombre_snapshot:f.r.actor_nombre_snapshot,
      motivo:f.r.motivo,dependencias_resumen:{operacion_id:O}};
    return rows;
  };
  const r=await verifyAfterAuth(tx,f.r);
  assert.equal(r.historia_persistente_verificada,true);assert.equal(r.habilita_auth,false);
  assert.equal(r.bloqueo,'VERIFICACION_FISICA_PENDIENTE');
});


const fileBytes=new TextEncoder().encode('archivo');
const physicalObject=()=>({id:R,bucket_id:'documentos-cuentas',storage_path:'cuentas/'+T+'/'+R,
  version:'version-sintetica',tamano_bytes:fileBytes.length,sha256_documental:null,completa:true});
function apiReader(fetchImpl,key='sb_publishable_sintetica'){
  return createPhysicalStorageReader({projectUrl:'https://hgveesryfmcjxpeumzbp.supabase.co',publicKey:()=>key,fetchImpl});
}
test('PASO197: Storage API GET antes/después, tamaño/SHA idénticos; ninguna credencial o contenido en recibo',async()=>{
  const f=fixture(),c=await captureConservation(f.tx,f.r),requests=[];
  const reader=apiReader(async req=>{requests.push(req);return new Response(fileBytes,{status:200,headers:{'content-length':String(fileBytes.length)}})});
  const before=await measurePhysicalStorage(reader,'Bearer token-sintetico',[physicalObject()],c,'antes');
  const after=await measurePhysicalStorage(reader,'Bearer token-sintetico',[physicalObject()],c,'despues',before);
  assert.equal(after.archivos_verificados,true);assert.equal(after.habilita_auth,false);
  assert.deepEqual(before.objetos,after.objetos);assert.equal(requests.length,2);
  assert(requests.every(r=>r.method==='GET'&&r.redirect==='error'&&r.credentials==='omit'&&r.cache==='no-store'));
  assert(!JSON.stringify(after).includes('token-sintetico'));assert(!JSON.stringify(after).includes('sb_publishable'));
  assert(!JSON.stringify(after).includes('"archivo"'));
});
test('PASO197: mismo tamaño con bytes distintos, SHA documental distinto o stream truncado se rechazan',async()=>{
  const f=fixture(),c=await captureConservation(f.tx,f.r),obj=physicalObject();
  const before=await measurePhysicalStorage(apiReader(async()=>new Response(fileBytes)),'Bearer token',[obj],c,'antes');
  await assert.rejects(measurePhysicalStorage(apiReader(async()=>new Response('archivX')),'Bearer token',[obj],c,'despues',before),/STORAGE_FISICO_CONTENIDO_CAMBIO/);
  await assert.rejects(measurePhysicalStorage(apiReader(async()=>new Response(fileBytes)),'Bearer token',[{...obj,sha256_documental:'0'.repeat(64)}],c,'antes'),/STORAGE_FISICO_CONTENIDO_CAMBIO/);
  await assert.rejects(measurePhysicalStorage(apiReader(async()=>new Response(fileBytes.slice(1))),'Bearer token',[obj],c,'antes'),/STORAGE_FISICO_NO_ACREDITADO/);
});
test('PASO197: 401/403/404/500/parcial/redirect/aborto/red nunca reintentan ni generan prueba',async()=>{
  const f=fixture(),c=await captureConservation(f.tx,f.r);
  for(const status of [401,403,404,500,206,307,'network','abort']){
    let calls=0;const reader=apiReader(async()=>{calls++;if(typeof status==='string')throw Error(status);return new Response(fileBytes,{status});});
    await assert.rejects(measurePhysicalStorage(reader,'Bearer token',[physicalObject()],c,'antes'));
    assert.equal(calls,1);
  }
});
test('PASO197: lista/version/ruta alterada o prueba previa ausente/manipulada bloquea antes de GET',async()=>{
  const f=fixture(),c=await captureConservation(f.tx,f.r);let calls=0;
  const reader=apiReader(async()=>{calls++;return new Response(fileBytes)}),obj=physicalObject();
  const before=await measurePhysicalStorage(reader,'Bearer token',[obj],c,'antes');calls=0;
  for(const inventory of [[],[{...obj,version:'otra'}],[{...obj,storage_path:'cuentas/otra'}]])
    await assert.rejects(measurePhysicalStorage(reader,'Bearer token',inventory,c,'despues',before));
  await assert.rejects(measurePhysicalStorage(reader,'Bearer token',[obj],c,'despues'));
  const bad=structuredClone(before);bad.objetos[0].sha256='0'.repeat(64);
  await assert.rejects(measurePhysicalStorage(reader,'Bearer token',[obj],c,'despues',bad));
  assert.equal(calls,0);
});
test('PASO197: buckets ajenos, rutas peligrosas, metadatos ausentes, límites y service_role se rechazan',async()=>{
  const o=physicalObject();
  for(const x of [{...o,id:null},{...o,completa:false},{...o,bucket_id:'otro'},{...o,storage_path:'../otra'},
    {...o,version:''},{...o,tamano_bytes:16*1024*1024+1},{...o,tamano_bytes:null}])assert.throws(()=>normalizePhysicalInventory([x]));
  assert.equal(normalizePhysicalInventory([o,o]).length,1);
  assert.throws(()=>normalizePhysicalInventory([o,{...o,version:'otra'}]));
  let calls=0;await assert.rejects(apiReader(async()=>{calls++;return new Response(fileBytes)},'sb_secret_inadmisible').read(o,'Bearer token'));
  assert.equal(calls,0);
});
