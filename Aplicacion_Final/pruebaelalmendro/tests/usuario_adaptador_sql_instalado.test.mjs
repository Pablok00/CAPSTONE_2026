import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { createInstalledSqlAdapter, readDeletionDiagnostic } from '../supabase/functions/usuario-eliminacion-previsualizar/adaptador-sql-instalado.mjs';
import { leerContratosInstalados } from './contratos-instalados.mjs';
import { fingerprint } from '../supabase/functions/usuario-eliminacion-previsualizar/eliminacion-coordinar.mjs';
import { createServerReauthentication } from '../supabase/functions/usuario-eliminacion-previsualizar/reautenticacion-servidor.mjs';
import { PERSISTENT_HISTORY_TABLES } from '../supabase/functions/usuario-eliminacion-previsualizar/conservacion-previa.mjs';
import { EXCEPTION_SCOPE, validInput, isExceptionalTarget, assertExceptionalGate } from '../supabase/functions/usuario-eliminacion-previsualizar/eliminacion-preparar.mjs';
const A = '11111111-1111-4111-8111-111111111111', T = '22222222-2222-4222-8222-222222222222';
const R = '33333333-3333-4333-8333-333333333333', O = '44444444-4444-4444-8444-444444444444';
const ATTEMPT = '55555555-5555-4555-8555-555555555555', AUDIT = '66666666-6666-4666-8666-666666666666';
const input = { usuario_id: T, operacion_id: R, nombre_confirmacion: 'Cuenta sintética', motivo: 'Motivo suficiente de prueba', confirmacion: true };
const defaultInput = input;
test('375K.5 servidor: distintos objetivos elegibles, cuenta propia/permanente protegidas y destino sellado',async()=>{
  const pilot='ad695ef5-91de-40b1-87a4-4a9962ae5e8b',url='https://hgveesryfmcjxpeumzbp.supabase.co',origin='https://permitido.example';
  const originalOperation='65684d2c-174d-4e81-84dd-0dabfa3cccad',originalRequest='b79d5c8f-a13f-499e-ac24-e5baddbf6c2f';
  const original=readFileSync(new URL('../supabase/functions/usuario-eliminacion-ejecutar/index.ts',import.meta.url),'utf8');
  assert(original.includes('ELIMINACION_HABILITADA: boolean = true'));
  // Habilitación exclusivamente en memoria del ensayo; nunca cambia el archivo.
  for(const scenario of [
    {target:pilot,status:200}, {target:T,status:200},
    {target:'d8b25ca9-f970-40b8-8be0-0f163d7adff5',status:200},
    {target:pilot,continuation:true,status:200}, {target:T,continuation:true,status:200},
    {target:A,status:400},{target:'fad894e5-0fd5-4637-ad0f-31ffa41dc6cf',status:403},
    {target:pilot,spoof:T,status:503}, {target:pilot,closed:true,status:503},
    {target:pilot,sqlClosed:true,status:503},
    {target:pilot,noAdmin:true,status:403},
  ]){
    let reads=0,executions=0;const deleted=[];
    let ts=original.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replace('if (import.meta.main) Deno.serve(handler);','');
    if(scenario.closed)ts=ts.replace('ELIMINACION_HABILITADA: boolean = true','ELIMINACION_HABILITADA: boolean = false');
    const op={operacion_id:originalOperation,request_id:originalRequest,objetivo_id:scenario.target,nombre:'Jose Cueto',motivo:input.motivo,
      estado:'PREPARADA',intentos_auth:0,fingerprint:'a'.repeat(64)};
    const c=vm.createContext({Request,Response,URL,TextDecoder,Uint8Array,AbortSignal,setTimeout,clearTimeout,crypto:globalThis.crypto,
      validInput,isExceptionalTarget,assertExceptionalGate,readDeletionDiagnostic,
      Deno:{env:{get:name=>({SUPABASE_URL:url,SUPABASE_ANON_KEY:'PUBLICA_SINTETICA',SUPABASE_SERVICE_ROLE_KEY:'SERVIDOR_SINTETICO',PREVIEW_ALLOWED_ORIGINS:origin})[name]}},
      postgres:()=>assert.fail('sin conexión real'),createDatabaseProvider:()=>()=>assert.fail('sin conexión real'),
      createPhysicalStorageReader:()=>({}),createInstalledSqlAdapter:()=>({consultarOperaciones:async()=>{reads++;return [op];},
        consultarHabilitacion:async()=>({sql:!scenario.sqlClosed,comprobada_en:'2026-11-16T12:00:00.000Z'})}),
      createServerReauthentication:()=>({reauthenticate:async()=>({prueba:'solo mock'})}),readServerReauthenticationProof:async()=>({}),
      createClient:()=>({auth:{getUser:async()=>({data:{user:{id:A}}}),admin:{deleteUser:async(id)=>{deleted.push(id);return {};}}},
        rpc:async()=>({data:{es_admin_permanente:!scenario.noAdmin}})}),
      createIntegralDeletionCoordinator:ports=>({execute:async context=>{executions++;
        if(scenario.continuation){assert.equal(context.pendingOperationId,originalOperation);assert.equal(context.input.operacion_id,originalRequest);assert.equal(context.input.usuario_id,scenario.target);}
        await ports.reauthenticate({purpose:'inicio'});await ports.deleteAuth({target_id:scenario.spoof||scenario.target});
        return {resultado:'COMPLETADA',eliminacion_ejecutada:true,operacion_id:originalOperation};}})});
    vm.runInContext(stripTypeScriptTypes(ts,{mode:'strip'}),c);
    assert.throws(()=>c.assertDeletionTarget(T,pilot,A),/OBJETIVO_NO_ACREDITADO/);
    assert.throws(()=>c.assertDeletionTarget(A,A,A),/OBJETIVO_NO_ACREDITADO/);
    const body=scenario.continuation?{accion:'CONTINUAR_PREPARADA',operacion_id:originalOperation,fingerprint:op.fingerprint,
      nombre_confirmacion:op.nombre,confirmacion:true,password:'SINTETICA'}:{...input,usuario_id:scenario.target,nombre_confirmacion:op.nombre,password:'SINTETICA'};
    const response=await c.handler(new Request('https://edge.example',{method:'POST',headers:{origin,authorization:'Bearer sintetico',
      'content-type':'application/json'},body:JSON.stringify(body)}));
    assert.equal(response.status,scenario.status,JSON.stringify(scenario));
    assert.deepEqual(deleted,scenario.status===200?[scenario.target]:[]);
    if(scenario.status===400||scenario.status===403||scenario.closed||scenario.sqlClosed)assert.equal(executions,0);
    if(scenario.closed||scenario.noAdmin)assert.equal(reads,0);
  }
  assert.equal((original.match(/assertDeletionTarget\((?:operation|persisted)\.target_id,input\.usuario_id,actor\.id\);\s*const deletion = await admin\.auth\.admin\.deleteUser/g)||[]).length,2);
});
test('375K.5 habilitación general: SQL cerrada bloquea y resumen nunca autoriza',async()=>{
  const pilot='ad695ef5-91de-40b1-87a4-4a9962ae5e8b',url='https://hgveesryfmcjxpeumzbp.supabase.co',origin='https://permitido.example';
  const original=readFileSync(new URL('../supabase/functions/usuario-eliminacion-ejecutar/index.ts',import.meta.url),'utf8');
  assert(original.includes('ELIMINACION_HABILITADA: boolean = true'));
  for(const servidor of [false,true])for(const target of [pilot,T])for(const sql of [false,true,null]){
    let consultas=0;
    let ts=original.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replace('if (import.meta.main) Deno.serve(handler);','');
    if(!servidor)ts=ts.replace('ELIMINACION_HABILITADA: boolean = true','ELIMINACION_HABILITADA: boolean = false');
    const c=vm.createContext({Request,Response,URL,TextDecoder,Uint8Array,AbortSignal,setTimeout,clearTimeout,
      Deno:{env:{get:name=>({SUPABASE_URL:url,SUPABASE_ANON_KEY:'PUBLICA_SINTETICA',PREVIEW_ALLOWED_ORIGINS:origin})[name]}},
      postgres:()=>assert.fail('sin conexión real'),createDatabaseProvider:()=>()=>assert.fail('sin conexión real'),
      createInstalledSqlAdapter:()=>({consultarResumen:async()=>({contrato:'usuario-eliminacion-resumen/v2',usuario_id:target,
        conservacion_certificada:false,verificacion_fisica:'pendiente'}),consultarHabilitacion:async()=>{consultas++;
        if(sql===null)throw Error('mensaje SQL privado');return {sql,comprobada_en:'2026-11-16T12:00:00.000Z'};}}),
      createClient:()=>({auth:{getUser:async()=>({data:{user:{id:A}}})},rpc:async()=>({data:{es_admin_permanente:true}})})});
    vm.runInContext(stripTypeScriptTypes(ts,{mode:'strip'}),c);
    const response=await c.handler(new Request('https://edge.example',{method:'POST',headers:{origin,authorization:'Bearer sintetico',
      'content-type':'application/json'},body:JSON.stringify({accion:'RESUMEN_CONSERVACION_V2',usuario_id:target})}));
    assert.equal(response.status,200);const data=await response.json();assert.equal(data.eliminacion_habilitada,false);assert.equal(data.puede_eliminar,false);
    {assert.equal(data.habilitacion.efectiva,servidor&&sql===true);assert.equal(data.habilitacion.sql,sql);
      assert.equal(data.habilitacion.autoriza_auth,false);assert.equal(data.habilitacion.verificada,sql!==null);}
    assert.equal(consultas,1);
    assert.equal(c.estadoHabilitacion(pilot,false,true,'2026-11-16T12:00:00.000Z').efectiva,false);
    assert(!JSON.stringify(data).includes('privado'));
  }
  for(const base of ['', 'publicacion/']){
    const s=readFileSync(new URL('../'+base+'js/views/admin.js',import.meta.url),'utf8');
    assert(s.includes('ADMIN_ELIMINACION_HABILITADA = true'));assert(s.includes('Este resumen no autoriza eliminar'));
  }
});
test('375K.5 interfaz: distintos UUID elegibles; excluye propia, permanente y rol Administrador',()=>{
  const pilot='ad695ef5-91de-40b1-87a4-4a9962ae5e8b';
  for(const base of ['', 'publicacion/']){
    const source=readFileSync(new URL('../'+base+'js/views/admin.js',import.meta.url),'utf8');
    assert(source.includes('const ADMIN_ELIMINACION_HABILITADA = true;'));
    const constants=source.match(/const ADMIN_ELIMINACION_HABILITADA = true;[^]*?function adminObjetivoPermitidoEliminacion\([^]*?\n}/)[0];
    const allowed=source.match(/function adminPuedeEnviarEliminacion\([^]*?\n}/)[0];
    for(const target of [pilot,'d8b25ca9-f970-40b8-8be0-0f163d7adff5',T,A,'fad894e5-0fd5-4637-ad0f-31ffa41dc6cf',null]){
      const g={actor:A,operacion:'ELIMINAR_UI',contexto:{usuario:{id:target,rol_id:T,roles:{nombre:'recepcion'}}},
        previsualizacionEliminacion:{estado:'lista',usuarioId:target,sinBloqueos:true,habilitacion:{efectiva:true,objetivo_id:target}}};
      const c=vm.createContext({adminGestion:g,state:{currentUser:{id:A}},adminAccesoVigente:()=>true,
        adminNombreRolNormalizado:s=>s,document:{getElementById:()=>({isConnected:true})}});
      const existing=source.match(/function adminObjetivoEliminacionPermitido\([^]*?\n}/)?.[0]||'';
      vm.runInContext(constants.replace('ADMIN_ELIMINACION_HABILITADA = false','ADMIN_ELIMINACION_HABILITADA = true')+'\n'+existing+'\n'+allowed,c);
      assert.equal(c.adminPuedeEnviarEliminacion(g,true),!!target&&target!==A&&target!=='fad894e5-0fd5-4637-ad0f-31ffa41dc6cf');
      g.contexto.usuario.roles.nombre='administrador';assert.equal(c.adminPuedeEnviarEliminacion(g,true),false);
    }
    assert(source.includes('continueButton.disabled = true'));
    assert(source.includes('submit.disabled = true; // Cerrado'));
    assert(source.includes('habilitacion?.efectiva!==true'));
  }
});
// PASO365: puertos de lectura; SQL simulado, sin conexiones ni Auth Admin.
function lectura365(options={}) {
  const calls=[],modes=[],events=[]; let role='postgres',rls=false,mode='',authCalls=0;
  const authorization='Bearer e30.'+btoa(JSON.stringify({sub:A,role:'authenticated',session_id:R,
    iss:'https://hgveesryfmcjxpeumzbp.supabase.co/auth/v1',exp:Math.floor(Date.now()/1000)+600})).replaceAll('=','')+'.firma';
  const tx=async(parts,...values)=>{
    const q=parts.join('?');calls.push(q);
    if(options.failAt&&q.includes(options.failAt))throw Object.assign(Error('SQL JWT contraseña privados'),{code:options.sqlstate||'42501',detail:'privado'});
    if(q.includes('AS effective_role'))return [{effective_role:'postgres',login_role:'postgres',database_name:'postgres',
      read_only:mode.endsWith('read write')?'off':'on',bypass_rls:true,actor_id:A,
      estado:!options.disabled&&!(options.disabledAfterRPC&&modes.length>1),
      admin:options.admin!==false,permanent:options.admin!==false,role:options.role||'tecnico'}];
    if(q==='SET LOCAL ROLE authenticated'){role='authenticated';return [];}
    if(q==='SET LOCAL ROLE postgres'){role='postgres';return [];}
    if(q==='SET LOCAL row_security = on'){rls=true;return [];}
    if(q.includes('AS task_role'))return [{task_role:role,actor_id:A,isolation:'read committed',read_only:options.invalidReadContext?'on':'off',rls:rls?'on':'off',bypass:false}];
    if(q.includes('transaction_timestamp() AS comprobada_en'))return [{abierta:options.sqlGate??false,comprobada_en:'2026-11-16T12:00:00.000Z'}];
    if(q.includes('tareas_pendientes_consultar_v1')){
      assert.equal(role,'authenticated');assert(rls);assert(options.tasks);
      assert.equal(mode,'isolation level read committed read write');
      if(options.rpcDenied)throw Object.assign(Error('mensaje SQL privado'),{code:'42501'});
      if(q.includes("'TAREAS'::text"))return [{resultado:{items:[{id:R}],hay_mas:false,siguiente_cursor:null}}];
      const vista=values[0];
      return [{resultado: vista==='HISTORIAL'
        ? {items:[{revision:7,actor_id:T,actor_nombre:'Autor'}],hay_mas:false,siguiente_cursor:null}
        : vista==='TAREAS' ? {items:[{id:R,retirada_por:T}],hay_mas:false,siguiente_cursor:null}
        : {items:values[2]?[{id:O,tarea_id:R,trabajador_id:T}]:[{id:R,tarea_id:R,trabajador_id:T}],
          hay_mas:!values[2],siguiente_cursor:values[2]?null:R}}];
    }
    if(q.includes('row_security_active'))return [{role,actor_id:A,read_only:'on',active:!options.noRls&&rls,bypass:false}];
    if(q.includes('session_user::text AS login_role'))return [{role,login_role:'postgres',read_only:mode.endsWith('read write')?'off':'on'}];
    if(q.includes('usuario_eliminacion_identidades_consultar_v2')){
      assert.equal(mode,'isolation level repeatable read read only');
      if(options.documentFicha){
        assert.equal(role,'postgres');
        assert.deepEqual(JSON.parse(values[0]),[{registro_id:R,origen_id:R,referencia_id:R,tipo:'trabajador',tabla:'public.trabajadores'}]);
        return options.emptyIdentities?[]:[{registro_id:R,origen_id:R,referencia_id:R,tipo:'trabajador',cuenta_id:T,nombre_snapshot:'Original',cuenta_eliminada:true}];
      }
      assert.equal(role,'postgres');const contexts=JSON.parse(values[0]);assert.equal(contexts[0].referencia_id,T);
      if(options.emptyIdentities)return [];
      return [{registro_id:options.foreign?O:R,origen_id:R,referencia_id:T,tipo:'cuenta',cuenta_id:T,nombre_snapshot:'Nombre original',cuenta_eliminada:true}];
    }
    if(q.includes('SELECT id,cuenta_id FROM public.cuentas_documentos')){
      assert.equal(role,'authenticated');assert(rls);assert.deepEqual(values[0],[T]);
      return options.documentsDenied?[]:[{id:O,cuenta_id:options.foreignDocument?A:T}];
    }
    return [];
  };
  tx.unsafe=async(q,values)=>{calls.push(q);assert.equal(role,'authenticated');assert(rls);assert.deepEqual(values,[[R]]);
    if(options.documentFicha){assert(q.includes('FROM public.trabajadores '));return options.hidden?[]:[{id:R}];}
    return options.hidden?[]:[{id:R,revisado_por:T}];};
  const adapter=createInstalledSqlAdapter({database:()=>({begin:async(selected,fn)=>{
    assert.equal(selected,options.tasks&&modes.length===0?'isolation level read committed read write':'isolation level repeatable read read only');
    mode=selected;modes.push(mode);events.push('begin');role='postgres';rls=false;
    try {const result=await fn(tx);if(options.commitError)throw Object.assign(Error('privado cierre'),{code:'08006'});
      events.push('commit');return result;
    } catch(e){events.push('rollback');throw e;}
  }}),authenticate:async()=>{authCalls++;return options.invalid||(options.invalidAfterRPC&&authCalls>1)?null:{id:A,permanent:options.admin!==false};}});
  return {adapter,authorization,calls,modes,events};
}
test('373J tareas separa RPC READ WRITE y helper READ ONLY; revalida la sesión entre transacciones',async()=>{
  const f=lectura365({tasks:true,emptyIdentities:true});
  const r=await f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'TAREAS_REGISTROS',registros:[R]});
  assert.deepEqual(r.identidades,[]);assert.deepEqual(r.registros_autorizados,[R]);
  assert.deepEqual(f.modes,['isolation level read committed read write','isolation level repeatable read read only']);
  assert.deepEqual(f.events,['begin','commit','begin','commit']);
  assert(!f.calls.some(q=>/\b(INSERT|UPDATE|DELETE)\b/.test(q)));
});
test('373J sesión revocada o deshabilitada entre fases impide consultar identidades',async()=>{
  for(const option of ['invalidAfterRPC','disabledAfterRPC']){
    const f=lectura365({tasks:true,[option]:true});
    await assert.rejects(f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'TAREAS_REGISTROS',registros:[R]}));
    assert(!f.calls.some(q=>q.includes('usuario_eliminacion_identidades_consultar_v2')));
  }
});
test('373J errores no repiten RPC ni ejecutan helper en la fase READ WRITE',async()=>{
  const denied=lectura365({tasks:true,rpcDenied:true});
  await assert.rejects(denied.adapter.consultarIdentidades({authorization:denied.authorization,modulo:'TAREAS_REGISTROS',registros:[R]}));
  assert.deepEqual(denied.events,['begin','rollback']);assert.equal(denied.modes.length,1);
  const privateFailure=lectura365({tasks:true,failAt:'usuario_eliminacion_identidades_consultar_v2'});
  await assert.rejects(privateFailure.adapter.consultarIdentidades({authorization:privateFailure.authorization,modulo:'TAREAS_REGISTROS',registros:[R]}));
  assert.deepEqual(privateFailure.events,['begin','commit','begin','rollback']);
  assert.equal(privateFailure.calls.filter(q=>q.includes('tareas_pendientes_consultar_v1')).length,1);
  const other=lectura365({emptyIdentities:true});
  await other.adapter.consultarIdentidades({authorization:other.authorization,modulo:'HISTORIAL',registros:[R]});
  assert.deepEqual(other.modes,['isolation level repeatable read read only']);
});
test('373H identidad vacía: consulta autorizada con referencias a cuentas activas retorna sin etiquetas',async()=>{
  const f=lectura365({tasks:true,emptyIdentities:true});
  const result=await f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'TAREAS_REGISTROS',registros:[R]});
  assert.deepEqual(result.identidades,[]);assert.deepEqual(result.registros_autorizados,[R]);
  assert(f.calls.some(q=>q.includes('usuario_eliminacion_identidades_consultar_v2')));
});
test('373H HTTP simulado: 200 vacío y 503 diagnosticado; compuerta cerrada y cero operaciones Auth',async()=>{
  const url='https://hgveesryfmcjxpeumzbp.supabase.co',origin='https://permitido.example';
  const ts=readFileSync(new URL('../supabase/functions/usuario-eliminacion-ejecutar/index.ts',import.meta.url),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replace('if (import.meta.main) Deno.serve(handler);','');
  const js=stripTypeScriptTypes(ts,{mode:'strip'});
  for(const failed of [false,true]){
    const f=lectura365({tasks:true,emptyIdentities:true,...(failed?{failAt:'tareas_pendientes_consultar_v1',sqlstate:'25006'}:{})});
    const c=vm.createContext({Request,Response,URL,TextDecoder,Uint8Array,AbortSignal,setTimeout,clearTimeout,
      Deno:{env:{get:name=>({SUPABASE_URL:url,SUPABASE_ANON_KEY:'PUBLICA_SINTETICA',PREVIEW_ALLOWED_ORIGINS:origin})[name]}},
      postgres:()=>assert.fail('sin conexión real'),createDatabaseProvider:()=>()=>assert.fail('sin conexión real'),
      createInstalledSqlAdapter:()=>f.adapter,readDeletionDiagnostic,
      createClient:()=>({auth:{getUser:async()=>({data:{user:{id:A}}})},rpc:async()=>({data:{es_admin_permanente:true}})})});
    vm.runInContext(js,c);
    const response=await c.handler(new Request('https://edge.example',{method:'POST',headers:{origin,
      authorization:f.authorization,'content-type':'application/json'},body:JSON.stringify({
        accion:'CONSULTAR_IDENTIDADES_HISTORICAS',modulo:'TAREAS_REGISTROS',registros:[R]})}));
    assert.equal(response.status,failed?503:200);const body=await response.json();
    assert.equal(body.eliminacion_habilitada,false);assert.equal(body.eliminacion_ejecutada,false);
    if(!failed){assert.deepEqual(body.identidades,[]);assert.deepEqual(body.registros_autorizados,[R]);}
    else {assert.equal(body.diagnostico.subetapa,'RPC_TAREAS');assert.equal(body.diagnostico.sqlstate,'25006');
      assert.equal(body.diagnostico.tipo,'POSTGRESQL');assert(!JSON.stringify(body).includes('privad'));}
    assert(!f.calls.some(q=>/\b(INSERT|UPDATE|DELETE)\b/.test(q)));
  }
});
test('373H diagnóstico: distingue SQL por subetapa sin mensajes libres, incluso READ ONLY y cierre',async()=>{
  for(const [match,stage,code]of [
    ['set_config','CLAIMS','42501'],['AS effective_role','CONTEXTO_POSTGRES','42883'],
    ['SET LOCAL ROLE authenticated','CAMBIO_ROL_LECTURA','42501'],['AS task_role','CONTEXTO_LECTURA','42501'],
    ['tareas_pendientes_consultar_v1','RPC_TAREAS','25006'],
    ['SET LOCAL ROLE postgres','RESTAURAR_ROL','42501'],
    ['usuario_eliminacion_identidades_consultar_v2','RPC_IDENTIDADES','P0001'],
    [null,'CIERRE_TRANSACCION','08006']]){
    const f=lectura365({tasks:true,failAt:match,sqlstate:code,commitError:!match});
    await assert.rejects(f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'TAREAS_REGISTROS',registros:[R]}),e=>{
      const d=readDeletionDiagnostic(e,true);assert.equal(d.subetapa,stage);assert.equal(d.sqlstate,code);
      assert(!JSON.stringify(d).includes('privad'));assert.equal(readDeletionDiagnostic(e,false),undefined);return true;
    });
    assert(!f.calls.some(q=>/\b(INSERT|UPDATE|DELETE)\b/.test(q)));
  }
});
test('373H diagnóstico: validación interna distinta de PostgreSQL y código driver desconocido no se filtra',async()=>{
  const f=lectura365({tasks:true,invalidReadContext:true});
  await assert.rejects(f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'TAREAS_REGISTROS',registros:[R]}),e=>{
    const d=readDeletionDiagnostic(e,true);assert.equal(d.subetapa,'CONTEXTO_LECTURA');assert.equal(d.validacion,'CONTEXTO_SQL_NO_ACREDITADO');
    assert.equal(d.tipo,'VALIDACION_INTERNA');assert.equal(d.sqlstate,undefined);return true;
  });
  const unknown=lectura365({tasks:true,failAt:'tareas_pendientes_consultar_v1',sqlstate:'SQL_PRIVADO'});
  await assert.rejects(unknown.adapter.consultarIdentidades({authorization:unknown.authorization,modulo:'TAREAS_REGISTROS',registros:[R]}),e=>{
    const d=readDeletionDiagnostic(e,true);assert.equal(d.sqlstate,undefined);assert.equal(d.validacion,undefined);
    assert(!JSON.stringify(d).includes('PRIVADO'));return true;
  });
});
test('373F tareas: RPC con rol autenticado, READ COMMITTED y cursor de asignaciones',async()=>{
  const f=lectura365({tasks:true});const r=await f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'TAREAS',registros:[R,O],tareas:[R]});
  assert.deepEqual(r.registros_autorizados,[R,O]);assert.deepEqual(r.identidades,[]);
  assert.equal(f.calls.filter(q=>q.includes('tareas_pendientes_consultar_v1')).length,2);
  assert(!f.calls.some(q=>/FROM public.tareas_pendientes/.test(q)));
  assert(!f.calls.some(q=>q.includes('usuario_eliminacion_identidades_consultar_v2')));
});
test('373F historial: revision proyectada no se convierte en UUID ni marca responsables',async()=>{
  const f=lectura365({tasks:true});const r=await f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'TAREAS_OPERACIONES',registros:[R]});
  assert.deepEqual(r.registros_autorizados,[R]);assert.deepEqual(r.identidades,[]);
  assert(!f.calls.some(q=>q.includes('FROM public.tareas_pendientes_operaciones')));
});
test('373F tareas: retiro identificable y rechazo RPC sin lectura privilegiada alternativa',async()=>{
  const f=lectura365({tasks:true});const r=await f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'TAREAS_REGISTROS',registros:[R]});
  assert.equal(r.identidades[0].referencia_id,T);
  const denied=lectura365({tasks:true,rpcDenied:true});await assert.rejects(denied.adapter.consultarIdentidades({authorization:denied.authorization,modulo:'TAREAS_REGISTROS',registros:[R]}));
  assert(!denied.calls.some(q=>q.includes('usuario_eliminacion_identidades_consultar_v2')));
});
test('365 lectura histórica: RLS real por registro y salida mínima sin UUID privado de cuenta',async()=>{
  const f=lectura365({admin:false});const r=await f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'HISTORIAL',registros:[R]});
  assert.deepEqual(r.registros_autorizados,[R]);assert.equal(r.identidades[0].cuenta_eliminada,true);
  assert(!('cuenta_id'in r.identidades[0]));assert(!f.calls.some(q=>/\b(INSERT|UPDATE|DELETE)\b/.test(q)));
});
test('365 lectura histórica: roles, sesión, RLS ausente y evidencia ajena fallan cerrados',async()=>{
  for(const options of [{invalid:true},{disabled:true},{noRls:true},{foreign:true},{admin:false,role:'recepcion'}]){
    const f=lectura365(options);await assert.rejects(f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'HISTORIAL',registros:[R]}));
  }
  const f=lectura365({admin:false});await assert.rejects(f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'TAREAS',registros:[R]}));
  assert(!f.calls.some(q=>q.includes('FROM public.tareas')));
});
test('365 lectura histórica: registros ocultos por RLS no producen identidades ni se consultan con postgres',async()=>{
  const f=lectura365({hidden:true});const r=await f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'HISTORIAL',registros:[R]});
  assert.deepEqual(r.registros_autorizados,[]);assert.deepEqual(r.identidades,[]);
  assert(!f.calls.some(q=>q.includes('usuario_eliminacion_identidades_consultar_v2')));
});
async function fixture(options = {}) {
  const input = options.input || defaultInput;
  const T = input.usuario_id;
  const binding = { actor_id: A, target_id: T, request_id: R, fingerprint: await fingerprint(A, input) };
  const world = { row: null, audit: null, authExists: false, calls: [], context: null, connections: 0 };
  // Todo SQL se interpreta SOLO en memoria. No driver, conexión, fetch o credencial real.
  let tail = Promise.resolve();
  const database = () => { world.connections++; return { begin: async (mode, callback) => {
    const prior = tail; let release; tail = new Promise(r => release = r); await prior;
    const before = structuredClone({ row: world.row, audit: world.audit });
    const tx = async (parts, ...values) => {
      const query = parts.join('?'); world.calls.push({ query, values, mode });
      if (options.driverError) throw new Error('postgres://secreto-sintetico SQL privado');
      if (query.includes('set_config')) { world.context = { sub: values[0], claims: JSON.parse(values[1]) }; return []; }
      if (query.startsWith('SET LOCAL') || query.includes('pg_advisory_xact_lock')) return [];
      if(query.includes('AS inventario_fisico')) return [{inventario_fisico:options.physicalObjects??[],
        auth_presente:world.row.estado==='PREPARADA',perfil_presente:world.row.estado==='PREPARADA'}];
      if(query.includes('AS historia_persistente')) return [{historia_persistente:{version:1,operacion_presente:true,catalogo_sha256:'b'.repeat(64),
        tablas:Object.fromEntries(PERSISTENT_HISTORY_TABLES.map(t=>[t,{filas:t==='usuarios_identidades_historicas'?1:0,bytes:8,
          sha256:world.historyChanged?'d'.repeat(64):'e'.repeat(64)}]))}}];
      if (query.includes('AS auth_ausente')) return [{auth_ausente:!options.postAuthPresent,perfil_ausente:!options.postProfilePresent,
        ficha_presente:true,identidad:{cuenta_id:T,nombre_snapshot:input.nombre_confirmacion,trabajador_id:null,operacion_id:null},
        ledger_actual:{version:1,usuario_id:T,trabajador_actual:null,eventos:0,sha256:'f'.repeat(64)},auditoria:null}];
      if (query.includes('AS sin_propiedad')) return [{sin_propiedad:true,objetos_conservados:!options.postStorageChanged}];
      if (query.includes('AS documentos_conservados')) return [{documentos_conservados:!options.postDocumentsChanged}];
      if (query.includes('usuario_eliminacion_conservar_storage_v1')) {
        if (!world.row.dependencias_resumen.conservacion_documental_v1) {
          world.row.dependencias_resumen.conservacion_documental_v1={version:1,habilita_auth:false,
            certificado_sha256:values[1],objetos:[],propiedad_neutralizada:true,archivos_verificados:false};
          if (options.neutralFailure) throw new Error('fallo SQL privado sintético');
        }
        return [{resultado:{operacion_id:O,objetos_neutralizados:0,documentos_conservados:true,
          propiedad_neutralizada:true,archivos_verificados:false,habilita_auth:false}}];
      }
      if (query.includes('usuario_eliminacion_conservacion_previa_v1')) {
        if (options.certificateMissing) throw Object.assign(new Error('función sintética ausente'),{code:'42883'});
        return [{evidencia:{version:1,vinculo:{operacion_id:O,...Object.fromEntries([
          ['actor_id',A],['objetivo_id',T],['request_id',R],['fingerprint',binding.fingerprint]])},
          identidad_integra:true,documentos_integros:true,fk_preservadas:true,auth_presente:true,delegaciones_cerradas:!options.activeDelegation,
          ledger_laboral:{version:1,usuario_id:T,trabajador_actual:null,eventos:0,sha256:'f'.repeat(64)},catalogo_sha256:'b'.repeat(64),
          categorias:Object.fromEntries(['identidad','documentos','storage','trabajos','auditorias','delegaciones','operativas','contratos']
            .map(k=>[k,{filas:options.changedEvidence?1:0,sha256:'c'.repeat(64)}])),
          propietarios_originales:[],archivos_verificados:false,propiedad_neutralizada:false}}];
      }
      if (query.includes('usuario_eliminacion_compuerta_excepcional_v1')) {
        if (options.sqlGateError) throw new Error('helper ausente');
        return [{ abierta: options.sqlGate === undefined ? true : options.sqlGate }];
      }
      if (options.integral && query.includes('usuario_eliminacion_preparar_v2')) {
        world.row ||= {id:O,actor_id:A,objetivo_id:T,objetivo_nombre_snapshot:input.nombre_confirmacion,
          actor_nombre_snapshot:'Admin sintético',motivo:input.motivo,estado:'PREPARADA',intentos_auth:0,auditoria_id:null,
          dependencias_resumen:{conservacion_historica_certificada:false,paso191:{request_id:R,fingerprint:binding.fingerprint}}};
        return [{resultado:{operacion_id:O,request_id:R,estado:'PREPARADA',habilita_auth:false}}];
      }
      if (options.integral && query.includes('usuario_eliminacion_certificar_v2')) {
        const previous=structuredClone(world.row.dependencias_resumen.conservacion_integral_v2??null);
        if(options.renewCatalog&&previous&&(world.row.estado!=='PREPARADA'||world.row.intentos_auth!==0||world.row.dependencias_resumen.ejecucion_integral_v2))
          throw Object.assign(Error('RENOVACION_V2_NO_ADMITIDA'),{code:'P0001'});
        world.row.dependencias_resumen.conservacion_integral_v2={version:2,habilita_auth:false,sha256:'a'.repeat(64),
          vinculo:{operacion_id:O,actor_id:A,objetivo_id:T,request_id:R,fingerprint:binding.fingerprint},inventario:options.integralObjects??[],
          registros:Object.fromEntries([...PERSISTENT_HISTORY_TABLES,'usuarios_trabajadores_vinculos_auditoria',
            'mantenciones_reactivas_ciclos','televisores_habitaciones','televisores_habitaciones_auditoria',
            'usuarios_creaciones_manuales_operaciones'].map(k=>[k.includes('.')?k:'public.'+k,{total:0,registros:[]}]))};
        if(options.renewCatalog&&previous){
          // Solo modela la respuesta del contrato SQL de renovación existente.
          world.row.dependencias_resumen.certificados_anteriores_v2=[{certificado:previous,
            fisica:structuredClone(world.row.dependencias_resumen.fisica_integral_v2??null)}];
          Object.assign(world.row.dependencias_resumen.conservacion_integral_v2,{catalogo_sha256:'d'.repeat(64),
            revision:(previous.revision??1)+1,renovacion_de:previous.sha256,sha256:'b'.repeat(64)});
          delete world.row.dependencias_resumen.fisica_integral_v2;
        }
        return [{resultado:structuredClone(world.row.dependencias_resumen.conservacion_integral_v2)}];
      }
      if (options.integral && query.includes('usuario_eliminacion_iniciar_v2')) {
        if(!options.startV2)throw Object.assign(new Error('ELIMINACION_INTEGRAL_V2_DESHABILITADA'),{code:'P0001'});
        if(options.startInternalError)throw Error(options.startInternalError);
        world.row.estado='AUTH_EN_CURSO';world.row.intentos_auth=1;
        world.row.dependencias_resumen.paso191.attempt_id=ATTEMPT;
        world.row.dependencias_resumen.paso192.reauth.consumed_at=Date.now();
        if(options.badV2Row)world.row.intentos_auth=2;
        if(options.badV2Binding)world.row.objetivo_id=A;
        if(options.badV2Certificate)world.row.dependencias_resumen.conservacion_integral_v2.version=1;
        if(options.missingV2Attempt)delete world.row.dependencias_resumen.paso191.attempt_id;
        return [{resultado:{operacion_id:O,estado:'AUTH_EN_CURSO',habilita_auth:false,
          ...(options.missingV2Attempt?{}:{attempt_id:ATTEMPT})}}];
      }
      if(options.integral&&query.includes('usuario_eliminacion_recuperar_v2')){
        const estado=options.recoveryReview??'AUTH_ELIMINADA';world.row.estado=estado;
        world.row.dependencias_resumen.paso192.recovery_reauth.consumed_at=Date.now();
        return [{resultado:options.badRecovery?{estado:'INVALIDO'}:{estado,habilita_auth:false,
          ...(options.authStillPresent?{requiere_revision:true,codigo:'AUTH_TODAVIA_PRESENTE'}:{operacion_id:O})}}];
      }
      if (options.integral && query.includes('usuario_eliminacion_verificar_huellas_v2'))
        return [{resultado:{registros_conservados:true,habilita_auth:false,certificado_sha256:world.row.dependencias_resumen.conservacion_integral_v2.sha256},
          auth_presente:world.row.estado==='PREPARADA',perfil_presente:world.row.estado==='PREPARADA'}];
      if (options.integral && query.includes('usuario_eliminacion_registrar_fisica_v2')) {
        const objetos=JSON.parse(values[2]);world.row.dependencias_resumen.fisica_integral_v2??={};
        world.row.dependencias_resumen.fisica_integral_v2[values[1]]={objetos,certificado_sha256:world.row.dependencias_resumen.conservacion_integral_v2.sha256};
        return [{resultado:{fase:values[1],archivos:objetos.length,habilita_auth:false}}];
      }
      if (query.includes('usuario_eliminacion_iniciar_general_v1')) {
        if (options.startError) throw Object.assign(new Error(options.startMessage ?? 'SQL privado password JWT secreto'), { code: options.startError });
        if (options.badStart) return [{ resultado: {} }];
        // Solo mock: los indicadores se producen en la respuesta SQL, no en el adaptador.
        authorizeMock({ world });
        return [{ resultado: { operacion_id: O, estado: 'AUTH_EN_CURSO', attempt_id: ATTEMPT } }];
      }
      if (query.includes('AS requests_preserved')) return [{ auth_absent: !world.authExists,
        profile_absent: true, requests_preserved: !options.historyChanged, notices_preserved: !options.historyChanged }];
      if (query.includes('AS adicionales_ausentes')) return [{ adicionales_ausentes: !options.newReference }];
      if (query.includes('FROM public.usuarios u WHERE')) return [{ estado: false, rol_id: null,
        trabajador_id: null, auth_exists: true, ...options.targetChanges }];
      if (query.includes('FROM public.usuarios WHERE')) return [{ id: A }];
      if (query.includes('current_user::text')) return [{ actor_id: world.context?.sub, effective_role: options.wrongRole ? 'service_role' : 'postgres',
        login_role: 'postgres', database_name: 'postgres', bypass_rls: true, row_security: 'off',
        read_only: mode.endsWith('read only') ? 'on' : 'off', permanente: options.sqlDenied !== true }];
      if (query.includes("WHERE dependencias_resumen->'paso191'"))
        return world.row?.dependencias_resumen?.paso191?.request_id === values[0] ? [structuredClone(world.row)] : [];
      if (query.includes('usuario_eliminacion_preparar_v1')) {
        world.row ||= { id: O, actor_id: A, objetivo_id: T, objetivo_nombre_snapshot: input.nombre_confirmacion,
          actor_nombre_snapshot: 'Administrador sintético', motivo: input.motivo, estado: 'PREPARADA', intentos_auth: 0,
          auditoria_id: null, dependencias_resumen: { conservacion_historica_certificada: false,
            ...(options.exceptionalSql ? { preparacion_excepcional: {
              version: 1, alcance: EXCEPTION_SCOPE, objetivo_id: T, actor_id: A,
              estado_original: true, rol_id_original: null, trabajador_id_original: null,
              auth_presente: true, nombre_original: input.nombre_confirmacion } } : {}) } };
        return [{ resultado: { resultado: 'PREPARADA', estado: 'PREPARADA', operacion_id: O, eliminacion_habilitada: false } }];
      }
      if (query.includes('UPDATE public.usuarios_eliminaciones_operaciones')) {
        if (query.includes("jsonb_build_object('conservacion_fisica_v1'")) {
          if(options.blockPhysicalAfter&&world.row.estado!=='PREPARADA') throw Error('guarda PREPARADA/0 simulada');
          world.row.dependencias_resumen.conservacion_fisica_v1=JSON.parse(values[0]);
        } else if (query.includes("jsonb_build_object('conservacion_previa_v1'")) {
          world.row.dependencias_resumen.conservacion_previa_v1=JSON.parse(values[0]);
        } else if (query.includes("jsonb_build_object('recovery_reauth'")) {
          world.row.dependencias_resumen.paso192 ||= {};
          world.row.dependencias_resumen.paso192.recovery_reauth = JSON.parse(values[0]);
        } else if (query.includes("jsonb_build_object('reauth'")) {
          world.row.dependencias_resumen.paso192 ||= {};
          world.row.dependencias_resumen.paso192.reauth = JSON.parse(values[0]);
        } else world.row.dependencias_resumen.paso191 = JSON.parse(values[0]);
        return [structuredClone(world.row)];
      }
      if (query.includes('SELECT * FROM public.usuarios_eliminaciones_operaciones'))
        return world.row?.id === values[0] ? [structuredClone(world.row)] : [];
      if (query.includes('usuario_eliminacion_registrar_resultado_auth_v1')) {
        if (query.includes("'INCIERTA'")) {world.row.estado = 'REQUIERE_REVISION';world.row.ultimo_error_codigo='RESULTADO_NO_ACREDITADO';
          if(options.corruptReview)world.row.dependencias_resumen.autorizacion_irreversible_confirmada=false;
        }
        else {
          if (world.authExists) throw new Error('CUENTA_AUTH_TODAVIA_EXISTE');
          world.row.estado = 'AUTH_ELIMINADA'; world.row.dependencias_resumen.auth_eliminacion_verificada = true;
        }
        return [{ resultado: { resultado: world.row.estado, estado: world.row.estado, operacion_id: O } }];
      }
      if (query.includes('usuario_eliminacion_finalizar_v1')) {
        if (options.finalizeError) throw new Error('fallo de auditoría sintético');
        world.audit ||= { id: AUDIT, modulo: 'Administración de Usuarios', entidad_tipo: 'usuario', accion: 'ELIMINACION_PERMANENTE',
          entidad_id: T, ejecutado_por: A, entidad_referencia: world.row.objetivo_nombre_snapshot,
          ejecutado_por_nombre_snapshot: world.row.actor_nombre_snapshot, motivo: world.row.motivo, dependencias_resumen: { operacion_id: O } };
        world.row.estado = 'COMPLETADA'; world.row.auditoria_id = AUDIT;
        return [{ resultado: { resultado: 'COMPLETADA', operacion_id: O, auditoria_id: AUDIT } }];
      }
      if (query.includes('FROM public.del_registro_eliminaciones')) return world.audit ? [structuredClone(world.audit)] : [];
      assert.fail('Consulta inesperada en mock');
    };
    try { return await callback(tx); }
    catch (error) { world.row = before.row; world.audit = before.audit; throw error; }
    finally { world.context = null; release(); }
  } }; };
  const adapter = createInstalledSqlAdapter({ database, authenticate: async () => ({ id: A, permanent: !options.notPermanent }),
    physicalStorageReader: options.physicalStorageReader,
    readExceptionalSetting: options.edgeGate ? () => input.usuario_id : undefined,
    verifyRecentIdentity: async () => options.reauth !== false });
  const context = { authorization: 'Bearer token-sintetico', input };
  const call = (kind, payload) => adapter.dispatch({ simulacion: true, kind, payload }, context);
  const prepare = () => call('PREPARAR_SQL', binding);
  const f = { world, options, adapter, call, prepare, binding, context };
  if (options.reauth !== false) await attachProof(f);
  return f;
}
async function attachProof(f, purpose = 'inicio') {
  const token = 'e30.' + btoa(JSON.stringify({ sub: A, role: 'authenticated', aal: 'aal1',
    iss: 'https://hgveesryfmcjxpeumzbp.supabase.co/auth/v1', session_id: R,
    exp: Math.floor(Date.now() / 1000) + 600 })).replaceAll('=', '') + '.firma';
  f.context.authorization = 'Bearer ' + token;
  const service = createServerReauthentication({ authenticate: async () => ({ id: A, permanent: true }),
    publicKey: 'sb_publishable_sintetica', createClient: () => ({ auth: {
      getUser: async () => ({ data: { user: { id: A, email: 'sintetico@example.invalid' } } }),
      signInWithPassword: async () => ({ data: { user: { id: A }, session: { user: { id: A }, access_token: 'temporal' } } }),
      signOut: async () => ({}), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } }) },
    } }) });
  f.context.reauthProof = await service.reauthenticate({ authorization: f.context.authorization, input: f.context.input, password: 'password-sintetica', purpose });
}
test('374L recuperación V2: REQUIERE_REVISION confirma transacción y conserva evidencia SQL',async()=>{
  for(const options of [{recoveryReview:'REQUIERE_REVISION'},{recoveryReview:'AUTH_EN_CURSO',authStillPresent:true}]){
    const f=await fixture({integral:true,...options});await f.adapter.integral.preparar(f.context);authorizeMock(f);
    await attachProof(f,'recuperacion');const proof=f.context.reauthProof;
    const result=await f.adapter.integral.recuperar(f.context,O);
    assert.equal(result.estado,options.recoveryReview);assert.equal(result.requiere_revision,true);
    assert.equal(f.world.row.estado,options.recoveryReview);
    assert(f.world.row.dependencias_resumen.paso192.recovery_reauth.consumed_at!=null);
    assert(!f.world.calls.some(c=>c.query.includes('usuario_eliminacion_registrar_resultado_auth_v1')));
    assert(proof); // La prueba real del fixture sigue vinculada al mismo request.
  }
  const bad=await fixture({integral:true,badRecovery:true});await bad.adapter.integral.preparar(bad.context);authorizeMock(bad);
  await attachProof(bad,'recuperacion');const before=structuredClone(bad.world.row);
  await assert.rejects(bad.adapter.integral.recuperar(bad.context,O));assert.deepEqual(bad.world.row,before);
});
test('374L revisión V2 reutiliza solo INCIERTA V1, conserva certificados y revierte alteraciones',async()=>{
  for(const corruptReview of [false,true]){
    const f=await fixture({integral:true,corruptReview});await f.adapter.integral.preparar(f.context);
    await f.adapter.integral.certificar(f.context,O);authorizeMock(f);
    f.world.row.dependencias_resumen.ejecucion_integral_v2={version:2,attempt_id:ATTEMPT,
      certificado_sha256:f.world.row.dependencias_resumen.conservacion_integral_v2.sha256};
    const before=structuredClone(f.world.row);
    if(corruptReview){await assert.rejects(f.adapter.integral.revisar(f.context,O));assert.deepEqual(f.world.row,before);}
    else {const r=await f.adapter.integral.revisar(f.context,O);assert.equal(r.persisted,true);
      assert.equal(f.world.row.estado,'REQUIERE_REVISION');assert.deepEqual(f.world.row.dependencias_resumen,before.dependencias_resumen);}
    const calls=f.world.calls.filter(c=>c.query.includes('registrar_resultado_auth_v1'));
    assert.equal(calls.length,1);assert(calls[0].query.includes("'INCIERTA'"));assert(!calls[0].query.includes("'CONFIRMADA'"));
  }
});
test('374L compuerta SQL: lectura autenticada permanente READ ONLY sin reservas ni ejecución',async()=>{
  for(const abierta of [false,true]){
    const f=lectura365({sqlGate:abierta});const r=await f.adapter.consultarHabilitacion({authorization:f.authorization});
    assert.equal(r.sql,abierta);assert.deepEqual(f.modes,['isolation level repeatable read read only']);
    assert(!f.calls.some(q=>/\b(INSERT|UPDATE|DELETE)\b/.test(q)));
  }
  const denied=lectura365({admin:false});await assert.rejects(denied.adapter.consultarHabilitacion({authorization:denied.authorization}));
  assert.equal(denied.calls.length,0);
});
test('375J.4 cambio de catálogo: recertifica la misma operación preparada y exige nueva evidencia física',async()=>{
  const f=await fixture({integral:true,input:{...input,usuario_id:'ad695ef5-91de-40b1-87a4-4a9962ae5e8b',nombre_confirmacion:'Jose Cueto'},
    physicalStorageReader:{read:async()=>assert.fail('Inventario vacío, ningún archivo ni red')}});
  const original=await f.adapter.integral.preparar(f.context);await f.adapter.integral.certificar(f.context,O);
  f.world.row.dependencias_resumen.fisica_integral_v2={antes:{certificado_sha256:'a'.repeat(64),objetos:[]}};
  const previous=structuredClone(f.world.row.dependencias_resumen.conservacion_integral_v2);
  f.context.pendingOperationId=original.id;
  f.world.row.dependencias_resumen.paso192.reauth.verified_at-=1000;
  await attachProof(f);const reused=await f.adapter.integral.preparar(f.context);assert.equal(reused.id,original.id);
  f.options.renewCatalog=true;
  const renewed=await f.adapter.integral.certificar(f.context,original.id);
  const c=renewed.dependencias_resumen.conservacion_integral_v2;
  assert.equal(renewed.id,original.id);assert.equal(renewed.intentos_auth,0);assert.equal(c.revision,2);
  assert.equal(c.renovacion_de,previous.sha256);assert.equal(c.catalogo_sha256,'d'.repeat(64));
  assert.deepEqual(renewed.dependencias_resumen.certificados_anteriores_v2[0].certificado,previous);
  assert.equal(renewed.dependencias_resumen.fisica_integral_v2,undefined);
  await f.adapter.integral.verificarArchivos(f.context,original.id,'antes');
  assert.equal(f.world.row.dependencias_resumen.fisica_integral_v2.antes.certificado_sha256,c.sha256);
  f.world.row.estado='AUTH_EN_CURSO';f.world.row.intentos_auth=1;
  await assert.rejects(f.adapter.integral.certificar(f.context,original.id));
});
test('375H.5 inicio V2 admite contrato SQL válido y preserva el mismo UUID al renovar prueba y certificado',async()=>{
  const f=await fixture({integral:true,startV2:true});const original=await f.adapter.integral.preparar(f.context);
  await f.adapter.integral.certificar(f.context,O);
  // Prueba durable anterior caducada/no consumida; una nueva reautenticación
  // humana del fixture permite reutilizar la operación, no crear otra.
  const old=f.world.row.dependencias_resumen.paso192.reauth;
  old.proof_id=ATTEMPT;old.verified_at-=180000;old.expires_at-=180000;
  await attachProof(f);const reused=await f.adapter.integral.preparar(f.context);
  assert.equal(reused.id,original.id);assert.equal(reused.intentos_auth,0);
  await f.adapter.integral.certificar(f.context,O);
  const started=await f.adapter.integral.iniciar(f.context,O);
  assert.equal(started.id,original.id);assert.equal(started.estado,'AUTH_EN_CURSO');assert.equal(started.intentos_auth,1);
  assert.equal(started.dependencias_resumen.paso191.attempt_id,ATTEMPT);
  assert.equal(f.world.calls.filter(c=>c.query.includes('usuario_eliminacion_iniciar_v2')).length,1);
});
test('375H.5 validaciones posteriores distintas, intento ausente y mensaje manipulado revierten el inicio',async()=>{
  for(const [options,subetapa,validacion]of [
    [{missingV2Attempt:true},'VALIDAR_RESPUESTA_SQL','CONTRATO_SQL_INVALIDO'],
    [{badV2Row:true},'VALIDAR_ESTADO_POSTERIOR','CONTRATO_SQL_INVALIDO'],
    [{badV2Binding:true},'LEER_OPERACION_POSTERIOR','OPERACION_NO_VINCULADA'],
    [{badV2Certificate:true},'VALIDAR_CERTIFICADO_POSTERIOR','CONSERVACION_NO_ACREDITADA'],
    [{startInternalError:'CONTRATO_SQL_INVALIDO\nJWT PRIVADO SQL'},'EJECUTAR_INICIO_SQL',undefined],
  ]){
    const f=await fixture({integral:true,startV2:true,...options});await f.adapter.integral.preparar(f.context);
    await f.adapter.integral.certificar(f.context,O);const before=structuredClone(f.world.row);
    await assert.rejects(f.adapter.integral.iniciar(f.context,O),e=>{
      const d=readDeletionDiagnostic(e,true);assert.equal(d.etapa,'V2_RPC_INICIAR');assert.equal(d.subetapa,subetapa);
      assert.equal(d.tipo,options.startInternalError?'NO_CLASIFICADO':'VALIDACION_INTERNA');assert.equal(d.validacion,validacion);
      assert.equal(readDeletionDiagnostic(e,false),undefined);assert(!JSON.stringify(d).includes('PRIVADO'));return true;
    });
    assert.deepEqual(f.world.row,before);assert.equal(f.world.row.estado,'PREPARADA');assert.equal(f.world.row.intentos_auth,0);
  }
});
test('375H.5 distingue prueba expirada y prueba consumida sin llegar a SQL iniciar',async()=>{
  const f=await fixture({integral:true,startV2:true});await f.adapter.integral.preparar(f.context);
  const now=Date.now;Date.now=()=>now()+121000;
  try {await assert.rejects(f.adapter.integral.iniciar(f.context,O),e=>{
    const d=readDeletionDiagnostic(e,true);assert.equal(d.subetapa,'VALIDAR_REAUTENTICACION');assert.equal(d.validacion,'REAUTENTICACION_NO_ACREDITADA');return true;
  });}finally{Date.now=now;}
  f.world.row.dependencias_resumen.paso192.reauth.consumed_at=Date.now();
  await assert.rejects(f.adapter.integral.iniciar(f.context,O),e=>{
    const d=readDeletionDiagnostic(e,true);assert.equal(d.subetapa,'VALIDAR_REAUTENTICACION_PERSISTIDA');assert.equal(d.validacion,'REAUTENTICACION_REUTILIZADA');return true;
  });
  assert(!f.world.calls.some(c=>c.query.includes('usuario_eliminacion_iniciar_v2')));
});
test('363 adaptador V2: preparación nueva y reutilización de PREPARADA, contexto humano y SQL cerrado',async()=>{
  const f=await fixture({integral:true});
  const row=await f.adapter.integral.preparar(f.context);assert.equal(row.id,O);
  f.context.pendingOperationId=O;
  assert.equal((await f.adapter.integral.preparar(f.context)).id,O);
  assert.equal((await f.adapter.integral.certificar(f.context,O)).dependencias_resumen.conservacion_integral_v2.version,2);
  await assert.rejects(()=>f.adapter.integral.iniciar(f.context,O),e=>{
    const d=readDeletionDiagnostic(e,true);assert.equal(d.sqlstate,'P0001');assert.equal(d.rechazo_sql,'ELIMINACION_INTEGRAL_V2_DESHABILITADA');
    assert.equal(readDeletionDiagnostic(e,false),undefined);return true;
  });
  assert.equal(f.world.row.estado,'PREPARADA');assert.equal(f.world.row.intentos_auth,0);
  assert(!f.world.calls.some(c=>c.query.includes('usuario_eliminacion_iniciar_general_v1')));
  const claims=f.world.calls.filter(c=>c.query.includes('set_config')).map(c=>JSON.parse(c.values[1]));
  assert(claims.every(c=>c.sub===A&&c.role==='authenticated'&&c.session_id===R));
});
test('363 adaptador V2: otro UUID pendiente y administrador temporal bloquean sin preparar',async()=>{
  const f=await fixture({integral:true});await f.adapter.integral.preparar(f.context);f.context.pendingOperationId=ATTEMPT;
  const before=f.world.calls.filter(c=>c.query.includes('usuario_eliminacion_preparar_v2')).length;
  await assert.rejects(()=>f.adapter.integral.preparar(f.context));
  assert.equal(f.world.calls.filter(c=>c.query.includes('usuario_eliminacion_preparar_v2')).length,before);
  const denied=await fixture({integral:true,notPermanent:true});await assert.rejects(()=>denied.adapter.integral.leer(denied.context));
  assert.equal(denied.world.calls.length,0);
});
test('363 adaptador V2: GET fuera de transacción, recibos antes/después y certificado renovado durante GET',async()=>{
  let f;let renew=false;
  const object={id:ATTEMPT,bucket_id:'documentos-cuentas',storage_path:'cuentas/'+T+'/'+O,version:'v1',tamano_bytes:3};
  const options={integral:true,integralObjects:[object],physicalStorageReader:{read:async()=>{
    assert.equal(f.world.context,null);
    if(renew)f.world.row.dependencias_resumen.conservacion_integral_v2.sha256='b'.repeat(64);
    return {tamano_bytes:3,sha256:'f'.repeat(64)};
  }}};
  f=await fixture(options);await f.adapter.integral.preparar(f.context);await f.adapter.integral.certificar(f.context,O);
  await f.adapter.integral.verificarArchivos(f.context,O,'antes');
  f.world.row.estado='AUTH_EN_CURSO';f.world.row.intentos_auth=1;
  await f.adapter.integral.verificarArchivos(f.context,O,'despues');
  assert.deepEqual(f.world.row.dependencias_resumen.fisica_integral_v2.antes.objetos,f.world.row.dependencias_resumen.fisica_integral_v2.despues.objetos);
  f.world.row.estado='PREPARADA';f.world.row.intentos_auth=0;renew=true;
  const count=f.world.calls.filter(c=>c.query.includes('usuario_eliminacion_registrar_fisica_v2')).length;
  await assert.rejects(()=>f.adapter.integral.verificarArchivos(f.context,O,'antes'));
  assert.equal(f.world.calls.filter(c=>c.query.includes('usuario_eliminacion_registrar_fisica_v2')).length,count);
});
function authorizeMock(f) {
  // SOLO fixture: no representa certificación o transición SQL instalada.
  Object.assign(f.world.row, { estado: 'AUTH_EN_CURSO', intentos_auth: 1 });
  Object.assign(f.world.row.dependencias_resumen, { conservacion_historica_certificada: true, autorizacion_irreversible_confirmada: true });
  f.world.row.dependencias_resumen.paso191.attempt_id = ATTEMPT;
  f.world.row.dependencias_resumen.paso176_evidencia = { alcance: 'recepcion_tecnico_restringido',
    objetivo_id: T, huellas_solicitudes: [], huellas_avisos: [] };
  if (f.world.row.dependencias_resumen.preparacion_excepcional) {
    const row = f.world.row, d = row.dependencias_resumen;
    d.alcance_eliminacion = EXCEPTION_SCOPE;
    d.paso192.reauth.consumed_at = Date.now();
    Object.assign(d.paso176_evidencia, { alcance: EXCEPTION_SCOPE, objetivo_id: row.objetivo_id, rol: null,
      preparacion_excepcional: structuredClone(d.preparacion_excepcional),
      evaluacion: { objetivo_id: row.objetivo_id, alcance_excepcional: EXCEPTION_SCOPE,
        apto_preliminar: true, otras_referencias_detectadas: false,
        detalle_otras_referencias: Object.fromEntries(Array.from({ length: 25 }, (_, i) => ['fixture_' + i, false])),
        referencias_adicionales_detectadas: false, detalle_referencias_adicionales: {
          cuentas_documentos: false, tareas_pendientes: false,
          tareas_pendientes_asignaciones: false, tareas_pendientes_operaciones: false } } });
  }
}
test('Paso 191: exportación corregida real pasa lectura estructural, sin certificar conservación', () => {
  const result = leerContratosInstalados(readFileSync(new URL('../docs/sql-propuestas/captura_historica_contratos_instalados.json', import.meta.url), 'utf8'));
  assert.equal(result.revision_semantica_pendiente, true); assert.equal(result.eliminacion_habilitada, false);
  const byName = name => result.contratos.funciones.find(f => f.nombre === name).definicion;
  assert(byName('uid').includes("current_setting('request.jwt.claim.sub', true)"));
  assert(byName('es_administrador_permanente_actual').includes('u.id = auth.uid()'));
  assert(byName('es_administrador_permanente_actual').includes('u.estado IS TRUE'));
  assert(byName('mi_estado_administrativo').includes('JOIN public.usuarios u'));
  assert(byName('usuario_eliminacion_registrar_resultado_auth_v1').includes("estado <> 'AUTH_EN_CURSO'"));
  assert(byName('usuario_eliminacion_finalizar_v1').includes("estado <> 'AUTH_ELIMINADA'"));
});
test('Paso 191: preparar usa firma real, identidad validada LOCAL y UUID SQL distinto del cliente', async () => {
  const f = await fixture(); const operation = await f.prepare();
  assert.equal(operation.id, O); assert.equal(operation.request_id, R); assert.equal(operation.state, 'PREPARADA');
  const query = f.world.calls.find(c => c.query.includes('usuario_eliminacion_preparar_v1'));
  assert.deepEqual(query.values, [T, input.nombre_confirmacion, input.motivo, true]);
  const claim = f.world.calls.find(c => c.query.includes('set_config'));
  assert.deepEqual(claim.values, [A, JSON.stringify({ sub: A, role: 'authenticated', session_id: R })]);
  assert(!JSON.stringify(f.world.calls).includes('token-sintetico')); assert.equal(f.world.context, null);
  assert(!f.world.calls.some(c => /SET ROLE|GRANT|DELETE FROM|UPDATE.*solicitudes_reactivas/.test(c.query)));
});
test('Paso 191: repetición concurrente reutiliza operación vinculada sin segunda preparación', async () => {
  const f = await fixture(); const [a, b] = await Promise.all([f.prepare(), f.prepare()]);
  assert.equal(a.id, b.id); assert.equal(f.world.calls.filter(c => c.query.includes('usuario_eliminacion_preparar_v1')).length, 1);
  const read = await f.call('LEER_OPERACION', f.binding); assert.equal(read.id, O);
  assert(f.world.calls.at(-1).mode.endsWith('read only'));
});
test('Paso 191: actor temporal, reauth ausente, identidad SQL o permisos incorrectos impiden escrituras', async () => {
  for (const options of [{ notPermanent: true }, { reauth: false }, { wrongRole: true }, { sqlDenied: true }]) {
    const f = await fixture(options); await assert.rejects(f.prepare());
    assert.equal(f.world.row, null); assert.equal(f.world.context, null);
  }
});
test('Paso 191: body con identidad humana, payload ajeno o binding alterado no invocan v1', async () => {
  const f = await fixture();
  await assert.rejects(f.adapter.dispatch({ simulacion: true, kind: 'PREPARAR_SQL', payload: f.binding },
    { authorization: 'Bearer token-sintetico', input: { ...input, actor_id: A } }), /CONFIRMACION_INVALIDA/);
  assert.equal(f.world.connections, 0);
  await assert.rejects(f.call('PREPARAR_SQL', { ...f.binding, actor_id: T }), /OPERACION_NO_VINCULADA/);
  assert(!f.world.calls.some(c => c.query.includes('usuario_eliminacion_preparar_v1')));
  await f.prepare(); f.world.row.dependencias_resumen.paso191.fingerprint = 'otro';
  await assert.rejects(f.call('LEER_OPERACION', f.binding), /OPERACION_NO_VINCULADA/);
});
test('Paso 191: confirmación/finalización mapean v1 y verifican la auditoría real devuelta por el mock', async () => {
  const f = await fixture(); await f.prepare(); authorizeMock(f);
  let operation = await f.call('LEER_OPERACION', f.binding);
  operation = await f.call('MARCAR_AUTH_ELIMINADA_SQL', { operation }); assert.equal(operation.state, 'AUTH_ELIMINADA');
  operation = await f.call('FINALIZAR_SQL_ENDURECIDA', { operation }); assert.equal(operation.state, 'COMPLETADA'); assert(operation.audit_verified);
  const again = await f.call('FINALIZAR_SQL_ENDURECIDA', { operation }); assert.equal(again.state, 'COMPLETADA');
  f.world.audit.entidad_id = A;
  await assert.rejects(f.call('LEER_OPERACION', f.binding), /AUDITORIA_NO_VERIFICABLE/);
});
test('Paso 191: Auth incierta solo registra revisión, fallo de finalización preserva AUTH_ELIMINADA', async () => {
  const f = await fixture(); await f.prepare(); authorizeMock(f);
  let operation = await f.call('LEER_OPERACION', f.binding);
  assert.deepEqual(await f.call('REGISTRAR_REVISION_SQL', { operation }), { persisted: true });
  assert.equal(f.world.row.estado, 'REQUIERE_REVISION');
  const g = await fixture({ finalizeError: true }); await g.prepare(); authorizeMock(g);
  operation = await g.call('LEER_OPERACION', g.binding);
  operation = await g.call('MARCAR_AUTH_ELIMINADA_SQL', { operation });
  await assert.rejects(g.call('FINALIZAR_SQL_ENDURECIDA', { operation }), /CONTRATOS_SQL_NO_VERIFICABLES/);
  assert.equal(g.world.row.estado, 'AUTH_ELIMINADA'); assert.equal(g.world.audit, null);
});
test('Paso 217: inicio general respeta orden de locks, historia y bloqueo de Auth', async () => {
  const f = await fixture();
  for (const kind of ['ELIMINAR_AUTH_SIMULADO', 'RECONCILIAR_SQL'])
    await assert.rejects(f.call(kind, {}), /INICIO_IRREVERSIBLE_NO_IMPLEMENTADO/);
  assert.equal(f.world.connections, 0);
  assert.equal((await f.adapter.execute({ enabled: true })).eliminacion_habilitada, false);
  let op = await f.prepare();
  f.world.calls.length = 0;
  op = await f.call('CERTIFICAR_Y_AUTORIZAR_INICIO_SQL', { operation: op });
  assert.equal(op.state, 'AUTH_EN_CURSO'); assert.equal(op.attempt_id, ATTEMPT);
  const calls = f.world.calls.map(c => c.query);
  const lock = calls.findIndex(q => q.includes('pg_advisory_xact_lock(209,1)'));
  assert(lock >= 0 && lock < calls.findIndex(q => /FOR SHARE|FOR UPDATE/.test(q)));
  assert(!calls.some(q => q.includes('(192,1)')));
  assert.deepEqual(await f.call('VERIFICAR_AUSENCIA', { operation: op }),
    { auth_absent: true, profile_absent: true, history_preserved: true });
  f.options.historyChanged = true;
  await assert.rejects(f.call('MARCAR_AUTH_ELIMINADA_SQL', { operation: op }), /RESULTADO_NO_VERIFICABLE/);
  assert.equal(f.world.row.estado, 'AUTH_EN_CURSO'); assert.equal(f.world.audit, null);
  f.context.reauthProof = null; // La incertidumbre puede persistirse aun con reauth vencida.
  assert.equal((await f.call('REGISTRAR_REVISION_SQL', { operation: op })).persisted, true);
  assert.equal(f.world.row.estado, 'REQUIERE_REVISION');
  const bad = await fixture({ driverError: true });
  await assert.rejects(bad.prepare(), e => e.message === 'CONTRATOS_SQL_NO_VERIFICABLES');
  assert.equal(bad.world.context, null);
});
test('Paso 191: propuesta de idempotencia no instala nada ni concede permisos o certifica true', () => {
  const sql = readFileSync(new URL('../docs/sql-propuestas/propuesta_idempotencia_operaciones_no_acreditada.sql', import.meta.url), 'utf8')
    .replace(/--[^\n]*/g, '');
  assert(sql.trim().startsWith('BEGIN;')); assert(sql.trim().endsWith('ROLLBACK;'));
  assert(sql.includes('CREATE UNIQUE INDEX')); assert(sql.includes("->'paso191'->>'request_id'"));
  assert(!/\b(GRANT|CREATE FUNCTION|UPDATE|DELETE|INSERT)\b/.test(sql));
});
test('Paso 192: preparación persiste únicamente evidencia Auth verificada y rechaza reutilización consumida', async () => {
  const f = await fixture({ reauth: false }); await attachProof(f); await f.prepare();
  const record = f.world.row.dependencias_resumen.paso192.reauth;
  assert.equal(record.operation_id, O); assert.equal(record.actor_id, A); assert.equal(record.purpose, 'inicio');
  const text = JSON.stringify(f.world.row);
  assert(!text.includes('password-sintetica')); assert(!text.includes('Bearer')); assert(!text.includes('access_token'));
  f.world.row.dependencias_resumen.paso192.reauth.consumed_at = Date.now();
  await assert.rejects(f.prepare(), /REAUTENTICACION_REUTILIZADA/);
});
test('Paso 192: recuperación exige nueva reauth vinculada, no reinicia intentos ni borra', async () => {
  const f = await fixture(); await f.prepare(); authorizeMock(f);
  await attachProof(f, 'recuperacion');
  assert.equal((await f.adapter.prepareRecovery(f.context, { id: O })).preparada, true);
  assert.equal(f.world.row.intentos_auth, 1); assert.equal(f.world.row.estado, 'AUTH_EN_CURSO');
  f.world.row.dependencias_resumen.paso192.recovery_reauth.consumed_at = Date.now();
  await assert.rejects(f.adapter.prepareRecovery(f.context, { id: O }), /REAUTENTICACION_REUTILIZADA/);
  await new Promise(resolve => setTimeout(resolve, 3)); // Solo test: una nueva verificación posterior al consumo.
  await attachProof(f, 'recuperacion');
  assert.equal((await f.adapter.prepareRecovery(f.context, { id: O })).preparada, true);
  assert.equal(f.world.row.intentos_auth, 1);
});
test('Paso 192: callback booleano legado no sustituye prueba opaca de Auth para escribir', async () => {
  let connected = false;
  const adapter = createInstalledSqlAdapter({ database: () => { connected = true; throw new Error(); },
    authenticate: async () => ({ id: A, permanent: true }), verifyRecentIdentity: async () => true });
  await assert.rejects(adapter.dispatch({ simulacion: true, kind: 'PREPARAR_SQL', payload: {} },
    { authorization: 'Bearer token-sintetico', input }), /REAUTENTICACION_NO_ACREDITADA/);
  assert.equal(connected, false);
});
test('AE.1: adaptador revierte preparación excepcional con SQL original sin marcador', async () => {
  for (const target of ['43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4','d642838d-19df-4fd5-994a-77c6b63795ad']) {
    const f = await fixture({ input: { ...input, usuario_id: target } });
    await assert.rejects(f.prepare(), /SQL_EXCEPCIONAL_NO_ACREDITADO/);
    assert.equal(f.world.row, null); // rollback del mock, no PostgreSQL.
    assert(!f.world.calls.some(c => c.query.includes('UPDATE public.usuarios_eliminaciones_operaciones')));
  }
});
test('AE.1: preparación certificada conserva UUID y una lectura alterada no llega a Auth', async () => {
  const f = await fixture({ input: { ...input, usuario_id: '43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4' }, exceptionalSql: true });
  const a = await f.prepare(), b = await f.prepare();
  assert.equal(a.id, b.id); assert.equal(a.alcance_excepcional_verificado, true);
  f.world.row.dependencias_resumen.preparacion_excepcional.actor_id = T;
  await assert.rejects(f.call('LEER_OPERACION', f.binding), /SQL_EXCEPCIONAL_NO_ACREDITADO/);
  assert(!f.world.calls.some(c => c.query.includes('usuario_eliminacion_iniciar_general_v1')));
});
test('AE.1: antes de Auth se exige la prueba realmente consumida y perfil/reservas coherentes', async () => {
  for (const options of [{}, { newReference: true }, { targetChanges: { rol_id: A } },
    { targetChanges: { trabajador_id: T } }, { targetChanges: { estado: true } },
    { targetChanges: { auth_exists: false } }]) {
    const f = await fixture({ ...options, edgeGate: true, input: { ...input, usuario_id: '43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4' }, exceptionalSql: true });
    const prepared = await f.prepare();
    const started = await f.call('CERTIFICAR_Y_AUTORIZAR_INICIO_SQL', { operation: prepared });
    if (Object.keys(options).length)
      await assert.rejects(f.call('VERIFICAR_INICIO_AUTH', { operation: started }), /REFERENCIAS_SOBREVENIDAS|OBJETIVO_CAMBIO/);
    else {
      assert.equal((await f.call('VERIFICAR_INICIO_AUTH', { operation: started })).alcance_excepcional_verificado, true);
      await attachProof(f);
      await assert.rejects(f.call('VERIFICAR_INICIO_AUTH', { operation: started }), /REAUTENTICACION_NO_VINCULADA/);
    }
  }
});
test('AF.2: compuertas cerradas o incompatibles impiden inicio y llamada irreversible', async () => {
  for (const id of ['43fbf4dc-94ec-4bc0-a9f7-4b69959bc5d4','d642838d-19df-4fd5-994a-77c6b63795ad']) {
    for (const options of [{}, { edgeGate: true, sqlGate: false }, { edgeGate: true, sqlGate: null },
      { edgeGate: true, sqlGate: 'true' }, { edgeGate: true, sqlGateError: true }]) {
      const f = await fixture({ ...options, input: { ...input, usuario_id: id }, exceptionalSql: true });
      const prepared = await f.prepare();
      await assert.rejects(f.call('CERTIFICAR_Y_AUTORIZAR_INICIO_SQL', { operation: prepared }));
      assert(!f.world.calls.some(c => c.query.includes('usuario_eliminacion_iniciar_general_v1')));
      authorizeMock(f);
      const started = await f.call('LEER_OPERACION', f.binding);
      await assert.rejects(f.call('VERIFICAR_INICIO_AUTH', { operation: started }));
      assert.equal(f.world.row.estado, 'AUTH_EN_CURSO'); // No confirma Auth ni finalización.
    }
  }
});


test('DEL-FIX-04: SQLSTATE permitido y validación interna separados; rollback sin datos sensibles', async () => {
  for (const options of [{ startError: 'P0001' }, { startError: '55P03' }, { startError: 'codigo-privado' }, { badStart: true }]) {
    const f = await fixture(options); const prepared = await f.prepare();
    await assert.rejects(f.call('CERTIFICAR_Y_AUTORIZAR_INICIO_SQL', { operation: prepared }), error => {
      assert.equal(readDeletionDiagnostic(error, false), undefined);
      const d = readDeletionDiagnostic(error, true);
      assert.equal(d.etapa, options.badStart ? 'VALIDAR_RESPUESTA_INICIO' : 'RPC_INICIAR');
      assert.equal(d.codigo, options.badStart ? 'CONTRATO_SQL_INVALIDO' : 'CONTRATOS_SQL_NO_VERIFICABLES');
      assert.equal(d.sqlstate, ['P0001','55P03'].includes(options.startError) ? options.startError : undefined);
      assert(!JSON.stringify(d).match(/password|JWT|secreto|privado/)); return true;
    });
    assert.equal(f.world.row.estado, 'PREPARADA'); assert.equal(f.world.row.intentos_auth, 0);
  }
});
test('DEL-FIX-04: errores ajenos y autorización falsa no revelan diagnóstico', async () => {
  assert.equal(readDeletionDiagnostic(new Error('secreto'), true), undefined);
  const adapter = createInstalledSqlAdapter({ database: () => { throw Error('no debe conectar'); }, authenticate: async () => ({ id: A, permanent: false }) });
  await assert.rejects(adapter.dispatch({ simulacion: true, kind: 'LEER_OPERACION', payload: {} }, { authorization: 'Bearer sintetico', input }), error => {
    assert.equal(readDeletionDiagnostic(error, false), undefined);
    assert.equal(readDeletionDiagnostic(error, true).codigo, 'SOLO_ADMIN_PERMANENTE'); return true;
  });
  const edge = readFileSync(new URL('../supabase/functions/usuario-eliminacion-ejecutar/index.ts', import.meta.url), 'utf8');
  assert(edge.includes('administradorVerificado && falloDiagnostico'));
  assert(edge.includes('if (!falloDiagnostico && administradorVerificado)'));
  assert(edge.includes("resultado_simulado === 'COMPLETADA' && finalSqlOperationId"));
});

test('DEL-FIX-07: consulta durable solo lectura, actor propio y múltiples sin selección', async () => {
  const own = {id:O,actor_id:A,objetivo_id:T,objetivo_nombre_snapshot:input.nombre_confirmacion,motivo:input.motivo,
    estado:'PREPARADA',intentos_auth:0,request_id:R,fingerprint:await fingerprint(A,input)};
  const otherId='77777777-7777-4777-8777-777777777777';
  for(const scenario of ['own','multiple','other','missing','incomplete','wrong-actor','completed','in-course','network','expired-proof']){
    const calls=[];let connections=0;
    const rows=scenario==='multiple'?[own,{...own,id:otherId}]:['other','missing'].includes(scenario)?[]:
      [{...own,...(scenario==='incomplete'?{fingerprint:null}:scenario==='wrong-actor'?{actor_id:T}:scenario==='completed'?{estado:'COMPLETADA'}:scenario==='in-course'?{estado:'AUTH_EN_CURSO',intentos_auth:1}:{})}];
    const database=()=>{connections++;return {begin:async(mode,fn)=>{
      assert.equal(mode,'isolation level repeatable read read only');
      return fn(async(parts,...values)=>{
        const sql=parts.join('?');calls.push(sql);
        assert(!/\b(INSERT|UPDATE|DELETE|FOR UPDATE|pg_advisory|usuario_eliminacion_iniciar|usuario_eliminacion_recuperar)\b/i.test(sql));
        if(sql.startsWith('SET LOCAL')||sql.includes('set_config'))return [];
        if(sql.includes('current_user::text'))return [{effective_role:'postgres',login_role:'postgres',actor_id:A,read_only:'on',isolation:'repeatable read',row_security:'off',permanente:true}];
        assert(sql.includes('WHERE actor_id ='));assert.equal(values[0],A);
        if(scenario==='network')throw Error('driver privado');return rows;
      });
    }};};
    const adapter=createInstalledSqlAdapter({database,authenticate:async()=>({id:A,permanent:true})});
    const read=()=>adapter.consultarOperaciones({authorization:'Bearer sintetico',operacion_id:scenario==='other'?otherId:null});
    if(['incomplete','wrong-actor','completed','network'].includes(scenario))await assert.rejects(read());
    else {const result=await read();assert.equal(result.length,scenario==='multiple'?2:['other','missing'].includes(scenario)?0:1);
      for(const op of result){assert.equal(op.request_id,R);assert.equal(op.objetivo_id,T);assert(!('dependencias_resumen'in op));}}
    assert.equal(connections,1);assert(calls.length>0);
  }
});
test('DEL-FIX-07: sesión y permanente obligatorios antes de conectar; sin actor del navegador', async () => {
  for(const user of [null,{id:A,permanent:false},{id:A,permanent:false,temporal:true}]){
    const adapter=createInstalledSqlAdapter({database:()=>{throw Error('No debe conectar');},authenticate:async()=>user});
    await assert.rejects(adapter.consultarOperaciones({authorization:'Bearer sintetico'}),/SOLO_ADMIN_PERMANENTE/);
  }
  const adapter=createInstalledSqlAdapter({database:()=>{throw Error('No debe conectar');},authenticate:async()=>{throw Error('No debe autenticar');}});
  await assert.rejects(adapter.consultarOperaciones({authorization:''}),/SESION_REQUERIDA/);
  const edge=readFileSync(new URL('../supabase/functions/usuario-eliminacion-ejecutar/index.ts',import.meta.url),'utf8');
  const start=edge.indexOf("raw.accion === 'CONSULTAR_OPERACION'");
  const end=edge.indexOf('body = raw;',start);
  const branch=edge.slice(start,end);
  assert(start>0);assert(branch.includes("['accion','operacion_id']"));assert(branch.includes('reader.consultarOperaciones'));
  assert(!branch.includes('deleteUser'));assert(!branch.includes('reauthenticate('));
  assert(edge.indexOf('const actor = await authenticate(authorization)')<start);
  assert(edge.indexOf('const administrativeKey =',start)>end);
});

test('DEL-FIX-08: PREPARADA renueva prueba vencida bajo bloqueo conservando identidad original',async()=>{
  const f=await fixture();await f.prepare();
  const old={...f.world.row.dependencias_resumen.paso192.reauth,verified_at:Date.now()-300000,expires_at:Date.now()-180000};
  f.world.row.dependencias_resumen.paso192.reauth=old;
  f.context.pendingOperationId=O;
  await attachProof(f);
  const op=await f.call('LEER_OPERACION',f.binding);
  const beforeCalls=f.world.calls.length;
  const result=await f.call('CERTIFICAR_Y_AUTORIZAR_INICIO_SQL',{operation:op});
  assert.equal(result.id,O);assert.equal(result.request_id,R);assert.equal(result.state,'AUTH_EN_CURSO');
  assert.notEqual(f.world.row.dependencias_resumen.paso192.reauth.proof_id,old.proof_id);
  assert.equal(f.world.row.dependencias_resumen.paso192.reauth.request_id,R);
  assert.equal(f.world.row.dependencias_resumen.paso192.reauth.operation_id,O);
  assert.equal(f.world.row.dependencias_resumen.paso192.reauth.session_id,R);
  const queries=f.world.calls.slice(beforeCalls).map(c=>c.query);
  assert(queries.findIndex(q=>q.includes('UPDATE public.usuarios_eliminaciones_operaciones'))<queries.findIndex(q=>q.includes('usuario_eliminacion_iniciar_general_v1')));
  assert(!queries.some(q=>q.includes('usuario_eliminacion_preparar_v1')));
});
test('DEL-FIX-08: continuar no crea operación ausente, no acepta intención alterada ni estado iniciado',async()=>{
  for(const scenario of ['missing','other-operation','changed-intent','consumed','started']){
    const f=await fixture();const prepared=await f.prepare();f.context.pendingOperationId=O;
    if(scenario==='missing')f.world.row=null;
    if(scenario==='other-operation')f.context.pendingOperationId=A;
    if(scenario==='changed-intent')f.context.input={...input,motivo:'Intención distinta suficiente'};
    if(scenario==='consumed')f.world.row.dependencias_resumen.paso192.reauth.consumed_at=Date.now();
    if(scenario==='started')authorizeMock(f);
    const count=f.world.calls.filter(c=>c.query.includes('usuario_eliminacion_iniciar_general_v1')).length;
    if(['missing','other-operation','changed-intent'].includes(scenario))await assert.rejects(f.call('LEER_OPERACION',f.binding));
    else await assert.rejects(f.call('CERTIFICAR_Y_AUTORIZAR_INICIO_SQL',{operation:prepared}));
    await assert.rejects(f.call('PREPARAR_SQL',f.binding));
    assert.equal(f.world.calls.filter(c=>c.query.includes('usuario_eliminacion_iniciar_general_v1')).length,count);
  }
});

test('DEL-FIX-11: P0001 clasifica solo los 32 mensajes acreditados por igualdad exacta',async()=>{
  const source=readFileSync(new URL('../supabase/functions/usuario-eliminacion-previsualizar/adaptador-sql-instalado.mjs',import.meta.url),'utf8');
  const allowed=JSON.parse(source.match(/const safeP0001Rejections = new Set\((\[[^\n]+\])\);/)[1]);
  assert.equal(allowed.length,32);assert.equal(new Set(allowed).size,32);
  for(const message of allowed){
    const f=await fixture({startError:'P0001',startMessage:message});const op=await f.prepare();
    await assert.rejects(f.call('CERTIFICAR_Y_AUTORIZAR_INICIO_SQL',{operation:op}),error=>{
      const d=readDeletionDiagnostic(error,true);
      assert.equal(d.rechazo_sql,message);assert.equal(d.sqlstate,'P0001');assert.equal(d.codigo,'CONTRATOS_SQL_NO_VERIFICABLES');
      assert.equal(d.etapa,'RPC_INICIAR');assert.equal(error.message,'CONTRATOS_SQL_NO_VERIFICABLES');
      assert.equal(readDeletionDiagnostic(error,false),undefined);return true;
    });
    assert.equal(f.world.row.estado,'PREPARADA');assert.equal(f.world.row.intentos_auth,0);
  }
});
test('DEL-FIX-11: desconocidos y mensajes manipulados no revelan texto; otros SQLSTATE no se clasifican',async()=>{
  const known='REAUTENTICACION_NO_ACREDITADA';
  const cases=['DESCONOCIDO_PRIVADO',' '+known,known+' ',known+'\n',known+' SQL password JWT privado','ERROR: '+known,known.toLowerCase(),known+'\u0000'];
  for(const startMessage of cases){
    const f=await fixture({startError:'P0001',startMessage});const op=await f.prepare();
    await assert.rejects(f.call('CERTIFICAR_Y_AUTORIZAR_INICIO_SQL',{operation:op}),error=>{
      const d=readDeletionDiagnostic(error,true);assert.equal(d.rechazo_sql,'P0001_NO_CLASIFICADO');
      assert.equal(d.sqlstate,'P0001');assert(!JSON.stringify(d).includes('privado'));return true;
    });
  }
  const f=await fixture({startError:'42501',startMessage:known});const op=await f.prepare();
  await assert.rejects(f.call('CERTIFICAR_Y_AUTORIZAR_INICIO_SQL',{operation:op}),error=>{
    const d=readDeletionDiagnostic(error,true);assert.equal(d.sqlstate,'42501');assert.equal(d.rechazo_sql,undefined);return true;
  });
  await assert.rejects(f.call('INTENCION_AJENA',{}),error=>{
    const d=readDeletionDiagnostic(error,true);assert.equal(d.tipo,'VALIDACION_INTERNA');assert.equal(d.rechazo_sql,undefined);return true;
  });
});


test('DEL-FIX-21: evidencia durable en misma PREPARADA/0, repetición verifica y bloquea inicio sin RPC Auth',async()=>{
  const f=await fixture();await f.prepare();
  const previous=structuredClone(f.world.row);
  const result=await f.adapter.certificarConservacion(f.context,O);
  assert.equal(result.habilita_auth,false);assert.equal(result.evidencia_vigente,true);
  assert.equal(f.world.row.id,previous.id);assert.equal(f.world.row.estado,'PREPARADA');assert.equal(f.world.row.intentos_auth,0);
  assert.deepEqual(f.world.row.dependencias_resumen.paso191,previous.dependencias_resumen.paso191);
  assert.equal(f.world.row.dependencias_resumen.conservacion_historica_certificada,false);
  const writes=()=>f.world.calls.filter(c=>c.query.includes('UPDATE public.usuarios_eliminaciones_operaciones')).length;
  const before=writes();assert.deepEqual(await f.adapter.certificarConservacion(f.context,O),result);assert.equal(writes(),before);
  await assert.rejects(f.call('CERTIFICAR_Y_AUTORIZAR_INICIO_SQL',{operation:{id:O}}),/CONSERVACION_INTEGRAL_NO_HABILITADA/);
  assert.equal(f.world.calls.filter(c=>c.query.includes('usuario_eliminacion_iniciar_general_v1')).length,0);
  assert.equal(f.world.row.estado,'PREPARADA');assert.equal(f.world.row.intentos_auth,0);
});
test('DEL-FIX-21: evidencia obsoleta no se renueva ni cambia reserva; función ausente falla cerrada',async()=>{
  const f=await fixture();await f.prepare();await f.adapter.certificarConservacion(f.context,O);
  const before=structuredClone(f.world.row);f.options.changedEvidence=true;
  await assert.rejects(f.adapter.certificarConservacion(f.context,O),/CONSERVACION_NO_ACREDITADA/);
  assert.deepEqual(f.world.row,before);
  for(const options of [{certificateMissing:true},{activeDelegation:true}]){
    const g=await fixture(options);await g.prepare();const before=structuredClone(g.world.row);
    await assert.rejects(g.adapter.certificarConservacion(g.context,O),/CONSERVACION_NO_ACREDITADA/);
    assert.deepEqual(g.world.row,before);
  }
});
test('DEL-FIX-21: otro actor, temporal, prueba vencida/ausente y estado iniciado no certifican',async()=>{
  const f=await fixture();await f.prepare();
  f.world.row.actor_id=R;
  await assert.rejects(f.adapter.certificarConservacion(f.context,O),/CONSERVACION_NO_ACREDITADA/);
  f.world.row.actor_id=A;f.world.row.estado='AUTH_EN_CURSO';f.world.row.intentos_auth=1;
  await assert.rejects(f.adapter.certificarConservacion(f.context,O),/CONSERVACION_NO_ACREDITADA/);
  for(const options of [{notPermanent:true},{reauth:false}]){
    const g=await fixture(options);
    await assert.rejects(g.adapter.certificarConservacion(g.context,O),/CONSERVACION_NO_ACREDITADA/);
    assert.equal(g.world.connections,0);
  }
});

test('DEL-FIX-21: dos certificaciones concurrentes guardan una evidencia; no crean operación ni referencias',async()=>{
  const f=await fixture();await f.prepare();const calls=f.world.calls.length;
  const [a,b]=await Promise.all([f.adapter.certificarConservacion(f.context,O),f.adapter.certificarConservacion(f.context,O)]);
  assert.deepEqual(a,b);
  const after=f.world.calls.slice(calls);
  assert.equal(after.filter(c=>c.query.includes("jsonb_build_object('conservacion_previa_v1'")).length,1);
  assert.equal(after.filter(c=>c.query.includes('usuario_eliminacion_preparar_v1')||c.query.includes('usuario_eliminacion_iniciar_general_v1')).length,0);
});
test('DEL-FIX-21: verificación Auth y recuperación no aceptan alcance nuevo aunque se manipulen flags de autorización',async()=>{
  const f=await fixture();await f.prepare();await f.adapter.certificarConservacion(f.context,O);
  authorizeMock(f);const before=f.world.calls.length;
  await assert.rejects(f.call('VERIFICAR_INICIO_AUTH',{operation:{id:O}}),/CONSERVACION_INTEGRAL_NO_HABILITADA/);
  await attachProof(f,'recuperacion');
  await assert.rejects(f.adapter.prepareRecovery(f.context,{id:O}),/CONSERVACION_POSTERIOR_NO_ACREDITADA/);
  assert.equal(f.world.calls.slice(before).filter(c=>c.query.includes('UPDATE public.usuarios_eliminaciones_operaciones')||
    c.query.includes('usuario_eliminacion_recuperar_general_v1')).length,0);
});


test('DEL-FIX-22: neutralización interna idempotente y misma operación PREPARADA; cero inicio/Auth',async()=>{
  const f=await fixture();await f.prepare();await f.adapter.certificarConservacion(f.context,O);
  const cert=structuredClone(f.world.row.dependencias_resumen.conservacion_previa_v1);
  const a=await f.adapter.conservarDocumentos(f.context,O),b=await f.adapter.conservarDocumentos(f.context,O);
  assert.deepEqual(a,b);assert.equal(a.habilita_auth,false);assert.equal(a.archivos_verificados,false);
  assert.deepEqual(f.world.row.dependencias_resumen.conservacion_previa_v1,cert);
  assert.equal(f.world.row.estado,'PREPARADA');assert.equal(f.world.row.intentos_auth,0);
  assert.equal(f.world.row.dependencias_resumen.paso191.request_id,R);
  assert(!f.world.calls.some(c=>c.query.includes('usuario_eliminacion_iniciar_general_v1')));
});
test('DEL-FIX-22: error de neutralización revierte el recibo y conserva certificado original',async()=>{
  const f=await fixture({neutralFailure:true});await f.prepare();await f.adapter.certificarConservacion(f.context,O);
  const before=structuredClone(f.world.row);
  await assert.rejects(f.adapter.conservarDocumentos(f.context,O),e=>e.message==='CONSERVACION_DOCUMENTAL_NO_ACREDITADA');
  assert.deepEqual(f.world.row,before);
});
test('DEL-FIX-22: evidencia ausente u obsoleta no llama al neutralizador',async()=>{
  const f=await fixture();await f.prepare();
  await assert.rejects(f.adapter.conservarDocumentos(f.context,O),/CONSERVACION_DOCUMENTAL_NO_ACREDITADA/);
  await f.adapter.certificarConservacion(f.context,O);f.options.changedEvidence=true;
  await assert.rejects(f.adapter.conservarDocumentos(f.context,O),/CONSERVACION_DOCUMENTAL_NO_ACREDITADA/);
  assert(!f.world.calls.some(c=>c.query.includes('conservar_storage_v1')));
});
test('DEL-FIX-22: otro actor, temporal, estado iniciado y ausencia de reauth impiden neutralizar',async()=>{
  for(const options of [{notPermanent:true},{reauth:false}]){
    const f=await fixture(options);
    await assert.rejects(f.adapter.conservarDocumentos(f.context,O),/CONSERVACION_DOCUMENTAL_NO_ACREDITADA/);
    assert.equal(f.world.connections,0);
  }
  const f=await fixture();await f.prepare();await f.adapter.certificarConservacion(f.context,O);
  f.world.row.actor_id=R;
  await assert.rejects(f.adapter.conservarDocumentos(f.context,O),/CONSERVACION_DOCUMENTAL_NO_ACREDITADA/);
  f.world.row.actor_id=A;f.world.row.estado='AUTH_EN_CURSO';f.world.row.intentos_auth=1;
  await assert.rejects(f.adapter.conservarDocumentos(f.context,O),/CONSERVACION_DOCUMENTAL_NO_ACREDITADA/);
  assert(!f.world.calls.some(c=>c.query.includes('conservar_storage_v1')));
});


test('POST Auth: finalización/marcado/recuperación verifican primero y conservan misma operación ante comprobación física pendiente',async()=>{
  for(const options of [{},{postAuthPresent:true},{postProfilePresent:true},{postStorageChanged:true},{postDocumentsChanged:true}]){
    const f=await fixture(options);await f.prepare();await f.adapter.certificarConservacion(f.context,O);
    const c=f.world.row.dependencias_resumen.conservacion_previa_v1;
    f.world.row.dependencias_resumen.conservacion_documental_v1={version:1,vinculo:c.vinculo,certificado_sha256:c.sha256,
      objetos:[],documentos:[],propiedad_neutralizada:true,archivos_verificados:false,habilita_auth:false};
    authorizeMock(f);const before=structuredClone(f.world.row),offset=f.world.calls.length;
    for(const kind of ['VERIFICAR_AUSENCIA','MARCAR_AUTH_ELIMINADA_SQL','FINALIZAR_SQL_ENDURECIDA']){
      await assert.rejects(f.call(kind,{operation:{id:O}}),/CONSERVACION_POSTERIOR_NO_ACREDITADA|VERIFICACION_FISICA_PENDIENTE/);
      assert.deepEqual(f.world.row,before);
    }
    await attachProof(f,'recuperacion');
    await assert.rejects(f.adapter.prepareRecovery(f.context,{id:O}),/CONSERVACION_POSTERIOR_NO_ACREDITADA|VERIFICACION_FISICA_PENDIENTE/);
    assert.deepEqual(f.world.row,before);
    assert(!f.world.calls.slice(offset).some(c=>/^\s*UPDATE|usuario_eliminacion_finalizar_v1|usuario_eliminacion_registrar_resultado_auth_v1|usuario_eliminacion_recuperar_general_v1/.test(c.query)));
  }
});


test('Historia persistente: recuperación comprueba el mismo certificado; alteración no cambia operación ni ejecuta RPC',async()=>{
  const f=await fixture();await f.prepare();await f.adapter.certificarConservacion(f.context,O);
  const c=f.world.row.dependencias_resumen.conservacion_previa_v1;
  f.world.row.dependencias_resumen.conservacion_documental_v1={version:1,vinculo:c.vinculo,certificado_sha256:c.sha256,
    objetos:[],documentos:[],propiedad_neutralizada:true,archivos_verificados:false,habilita_auth:false};
  authorizeMock(f);await attachProof(f,'recuperacion');
  const original=structuredClone(f.world.row),offset=f.world.calls.length;
  await assert.rejects(f.adapter.prepareRecovery(f.context,{id:O}),/VERIFICACION_FISICA_PENDIENTE/);
  assert.deepEqual(f.world.row,original);
  f.world.historyChanged=true;
  await assert.rejects(f.adapter.prepareRecovery(f.context,{id:O}),/CONSERVACION_POSTERIOR_NO_ACREDITADA/);
  assert.deepEqual(f.world.row,original);
  assert(!f.world.calls.slice(offset).some(c=>/^\s*UPDATE|usuario_eliminacion_recuperar_general_v1|usuario_eliminacion_finalizar_v1/.test(c.query)));
});


test('PASO197: HTTP fuera de transacción, prueba durable antes/después ligada a misma operación sin tocar Storage',async()=>{
  let f,reads=0;
  const opts={physicalObjects:[{id:ATTEMPT,bucket_id:'documentos-trabajadores',storage_path:'ficha/archivo',version:'v1',tamano_bytes:3,sha256_documental:null,completa:true}],
    physicalStorageReader:{read:async()=>{reads++;assert.equal(f.world.context,null);return {tamano_bytes:3,sha256:'e'.repeat(64)}}}};
  f=await fixture(opts);await f.prepare();await f.adapter.certificarConservacion(f.context,O);
  const a=await f.adapter.verificarArchivos(f.context,O,'antes');assert.equal(a.habilita_auth,false);
  const before=structuredClone(f.world.row.dependencias_resumen.conservacion_fisica_v1.antes);
  await f.adapter.verificarArchivos(f.context,O,'antes');
  assert.deepEqual(f.world.row.dependencias_resumen.conservacion_fisica_v1.antes,before);
  authorizeMock(f);await attachProof(f,'recuperacion');
  const b=await f.adapter.verificarArchivos(f.context,O,'despues');
  assert.equal(b.archivos_verificados,true);assert.equal(b.habilita_auth,false);assert.equal(reads,3);
  assert.equal(f.world.row.id,O);assert.equal(f.world.row.dependencias_resumen.paso191.request_id,R);
  assert(!f.world.calls.some(c=>/UPDATE storage|conservar_storage_v1|usuario_eliminacion_iniciar_general_v1/.test(c.query)));
});
test('PASO197: pérdida de red no persiste prueba ni reintenta; permiso insuficiente no descarga',async()=>{
  let calls=0;
  const options={physicalObjects:[{id:ATTEMPT,bucket_id:'documentos-cuentas',storage_path:'archivo',version:'v1',tamano_bytes:3,sha256_documental:null,completa:true}],
    physicalStorageReader:{read:async()=>{calls++;throw Error('timeout simulado')}}};
  const f=await fixture(options);await f.prepare();await f.adapter.certificarConservacion(f.context,O);
  const before=structuredClone(f.world.row);
  await assert.rejects(f.adapter.verificarArchivos(f.context,O),/STORAGE_FISICO_NO_ACREDITADO/);
  assert.equal(calls,1);assert.deepEqual(f.world.row,before);
  const g=await fixture({...options,notPermanent:true});
  await assert.rejects(g.adapter.verificarArchivos(g.context,O),/STORAGE_FISICO_NO_ACREDITADO/);
  assert.equal(calls,1);assert.equal(g.world.connections,0);
});
test('PASO197: guarda PREPARADA/0 existente bloquea persistencia posterior; no se elude ni declara éxito',async()=>{
  const f=await fixture({blockPhysicalAfter:true,physicalStorageReader:{read:async()=>{throw Error('sin archivos')}}});
  await f.prepare();await f.adapter.certificarConservacion(f.context,O);await f.adapter.verificarArchivos(f.context,O);
  authorizeMock(f);await attachProof(f,'recuperacion');const before=structuredClone(f.world.row);
  await assert.rejects(f.adapter.verificarArchivos(f.context,O,'despues'),/STORAGE_FISICO_NO_ACREDITADO/);
  assert.deepEqual(f.world.row,before);assert(!f.world.row.dependencias_resumen.conservacion_fisica_v1.despues);
});


test('PASO197: metadatos cambian durante GET, descarta evidencia sin escribir prueba ni tocar propietario',async()=>{
  let f;
  const options={physicalObjects:[{id:ATTEMPT,bucket_id:'documentos-trabajadores',storage_path:'archivo',version:'v1',tamano_bytes:3,sha256_documental:null,completa:true}],
    physicalStorageReader:{read:async()=>{options.physicalObjects[0].version='v2';return {tamano_bytes:3,sha256:'e'.repeat(64)}}}};
  f=await fixture(options);await f.prepare();await f.adapter.certificarConservacion(f.context,O);
  const before=structuredClone(f.world.row);
  await assert.rejects(f.adapter.verificarArchivos(f.context,O),/STORAGE_FISICO_NO_ACREDITADO/);
  assert.deepEqual(f.world.row,before);
});

test('375K.14 documentos de ficha: vínculo histórico certificado y lectura documental RLS sin escrituras',async()=>{
  for(const options of [{},{emptyIdentities:true},{documentsDenied:true},{hidden:true}]){
    const f=lectura365({documentFicha:true,...options});
    const r=await f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'DOCUMENTOS_FICHA',registros:[R]});
    assert.deepEqual(r.cuentas_documentales,options.emptyIdentities||options.documentsDenied||options.hidden?[]:[{trabajador_id:R,cuenta_id:T}]);
    assert(!f.calls.some(q=>/\b(INSERT|UPDATE|DELETE)\b/.test(q)));
    assert.deepEqual(f.modes,['isolation level repeatable read read only']);
    assert.equal(f.events.at(-1),'commit');
  }
});
test('375K.14 documentos de ficha: rechaza roles sin permiso, sesión inválida y cuenta ajena en resultado',async()=>{
  for(const options of [{admin:false},{admin:false,role:'recepcion'},{disabled:true},{invalid:true},{noRls:true},{foreignDocument:true}]){
    const f=lectura365({documentFicha:true,...options});
    await assert.rejects(f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'DOCUMENTOS_FICHA',registros:[R]}));
  }
  const f=lectura365({documentFicha:true});
  await assert.rejects(f.adapter.consultarIdentidades({authorization:f.authorization,modulo:'DOCUMENTOS_FICHA',registros:[R,T]}));
});
