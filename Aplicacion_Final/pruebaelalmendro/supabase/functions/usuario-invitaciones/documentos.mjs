import { createPhysicalStorageReader } from '../usuario-eliminacion-previsualizar/conservacion-previa.mjs';
import { InvitationError, UUID, PROJECT_URL } from './invitaciones.mjs';
const LIMIT=10*1024*1024, BODY_LIMIT=14*1024*1024+4096;
const fail=(code,status=409)=>{throw new InvitationError(code,status);};
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export async function institutionalInput(body){
  if(!body||Array.isArray(body)||!UUID.test(body.documento_id||''))fail('DOCUMENTO_DATOS_INVALIDOS',400);
  if(body.accion==='REVISAR_DOCUMENTO_INSTITUCIONAL'){
    if(Object.keys(body).sort().join(',')!=='accion,documento_id')fail('DOCUMENTO_DATOS_INVALIDOS',400);
    return {id:body.documento_id,revisar:true};
  }
  if(body.accion!=='SUBIR_DOCUMENTO_INSTITUCIONAL'||Object.keys(body).sort().join(',')!=='accion,contenido_base64,cuenta_id,documento_id,mime,nombre'||
    !UUID.test(body.cuenta_id||'')||typeof body.nombre!=='string'||!body.nombre.trim()||body.nombre.length>255||/[\\/\x00-\x1f\x7f]/.test(body.nombre)||
    !['application/pdf','image/jpeg','image/png','image/webp'].includes(body.mime)||typeof body.contenido_base64!=='string'||
    body.contenido_base64.length>Math.ceil(LIMIT/3)*4||body.contenido_base64.length%4!==0||/[^A-Za-z0-9+/=]/.test(body.contenido_base64))fail('DOCUMENTO_DATOS_INVALIDOS',400);
  const padding=body.contenido_base64.indexOf('=');
  if(padding!==-1&&(padding<body.contenido_base64.length-2||!/^={1,2}$/.test(body.contenido_base64.slice(padding))))fail('DOCUMENTO_DATOS_INVALIDOS',400);
  let bytes;try{bytes=Uint8Array.from(atob(body.contenido_base64),c=>c.charCodeAt(0));}catch{fail('DOCUMENTO_DATOS_INVALIDOS',400);}
  if(!bytes.length||bytes.length>LIMIT)fail('DOCUMENTO_TAMANO_INVALIDO',400);
  const magic=body.mime==='application/pdf'?[37,80,68,70,45].every((b,i)=>bytes[i]===b):body.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
    body.mime==='image/png'?[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b):[82,73,70,70].every((b,i)=>bytes[i]===b)&&[87,69,66,80].every((b,i)=>bytes[i+8]===b);
  if(!magic)fail('DOCUMENTO_FORMATO_INVALIDO',400);
  return {id:body.documento_id,cuenta:body.cuenta_id,nombre:body.nombre,mime:body.mime,bytes,size:bytes.length,sha:await digest(bytes),revisar:false};
}
function validRow(r,actor){
  if(!r||!UUID.test(r.id||'')||!UUID.test(r.cuenta_id||'')||r.creado_por!==actor.id||r.propiedad_institucional!==true||
    !r.subida_institucional_intentada_en||!/^[a-f0-9]{64}$/.test(r.sha256_institucional_declarado||'')||
    r.bucket_id!=='documentos-cuentas'||r.storage_path!=='cuentas/'+r.cuenta_id+'/'+r.id||
    !['pendiente','disponible'].includes(r.estado_reserva)||!Number.isSafeInteger(Number(r.tamano_bytes_declarado))||
    Number(r.tamano_bytes_declarado)<1||Number(r.tamano_bytes_declarado)>LIMIT)fail('DOCUMENTO_REQUIERE_REVISION',202);
  return r;
}
export function createInstitutionalStore(transaction){
  const work=(actor,fn)=>transaction(actor,async tx=>{
    // Claims proceden exclusivamente del JWT validado por el autenticador existente.
    await tx`SELECT public.cuentas_documentos_institucional_contexto_v1()`;
    return fn(tx);
  });
  const read=async(tx,actor,id)=>{
    const rows=await tx`SELECT * FROM public.cuentas_documentos WHERE id=${id}::uuid FOR UPDATE NOWAIT`;
    if(rows.length!==1)fail('DOCUMENTO_REQUIERE_REVISION',202);
    return validRow(rows[0],actor);
  };
  return {
    async prepare(actor,input){return work(actor,async tx=>{
      const rows=await tx`SELECT * FROM public.cuentas_documentos WHERE id=${input.id}::uuid FOR UPDATE NOWAIT`;
      if(rows.length){const row=validRow(rows[0],actor);
        if(row.cuenta_id!==input.cuenta||row.nombre_original!==input.nombre||row.mime_type_declarado!==input.mime||Number(row.tamano_bytes_declarado)!==input.size||row.sha256_institucional_declarado!==input.sha)fail('DOCUMENTO_IDENTIDAD_DISTINTA');
        return {row,upload:false};
      }
      const targets=await tx`SELECT u.id FROM public.usuarios u JOIN public.roles r ON r.id=u.rol_id
        JOIN auth.users a ON a.id=u.id JOIN public.usuarios_correos_verificados v ON v.usuario_id=u.id
        WHERE u.id=${input.cuenta}::uuid AND u.estado IS TRUE AND a.email_confirmed_at IS NOT NULL AND
          lower(r.nombre) IN ('administrador','técnico','tecnico','recepción','recepcion') FOR SHARE OF u,r,a,v NOWAIT`;
      if(targets.length!==1)fail('DOCUMENTO_DESTINATARIO_NO_AUTORIZADO',403);
      const counts=await tx`SELECT count(*)::int AS total FROM public.cuentas_documentos WHERE creado_por=${actor.id}::uuid
        AND propiedad_institucional AND subida_institucional_intentada_en>clock_timestamp()-interval '1 minute'`;
      if(counts.length!==1||!Number.isSafeInteger(counts[0].total)||counts[0].total<0)fail('DOCUMENTO_REQUIERE_REVISION',202);
      if(counts[0].total>=8)fail('DOCUMENTO_LIMITE_ESPERAR',429);
      const created=await tx`INSERT INTO public.cuentas_documentos
        (id,cuenta_id,bucket_id,storage_path,nombre_original,mime_type_declarado,tamano_bytes_declarado,estado_reserva,
         propiedad_institucional,subida_institucional_intentada_en,sha256_institucional_declarado)
        VALUES(${input.id}::uuid,${input.cuenta}::uuid,'documentos-cuentas',${'cuentas/'+input.cuenta+'/'+input.id},${input.nombre},${input.mime},${input.size},'pendiente',
          true,clock_timestamp(),${input.sha}) RETURNING *`;
      if(created.length!==1||created[0].id!==input.id||created[0].cuenta_id!==input.cuenta||created[0].nombre_original!==input.nombre||created[0].mime_type_declarado!==input.mime||Number(created[0].tamano_bytes_declarado)!==input.size||created[0].sha256_institucional_declarado!==input.sha)fail('DOCUMENTO_REQUIERE_REVISION',202);
      return {row:validRow(created[0],actor),upload:true};
    });},
    async inspect(actor,id){return work(actor,async tx=>{
      const row=await read(tx,actor,id);
      const objects=await tx`SELECT id,version,owner,owner_id,metadata FROM storage.objects
        WHERE bucket_id=${row.bucket_id} AND name=${row.storage_path} FOR SHARE NOWAIT`;
      if(objects.length!==1)fail('DOCUMENTO_REQUIERE_REVISION',202);
      const o=objects[0];
      if(!UUID.test(o.id||'')||typeof o.version!=='string'||!o.version||o.owner!==null||o.owner_id!==null||
        Number(o.metadata?.size)!==Number(row.tamano_bytes_declarado)||o.metadata?.mimetype!==row.mime_type_declarado||
        row.estado_reserva==='disponible'&&(row.storage_object_id!==o.id||row.storage_version!==o.version||row.sha256_verificado!==row.sha256_institucional_declarado))fail('DOCUMENTO_IDENTIDAD_DISTINTA');
      return {row,object:o};
    });},
    async confirm(actor,before,sha){return work(actor,async tx=>{
      const row=await read(tx,actor,before.row.id);
      if(row.sha256_institucional_declarado!==sha||row.cuenta_id!==before.row.cuenta_id||row.storage_path!==before.row.storage_path||
        row.mime_type_declarado!==before.row.mime_type_declarado||String(row.tamano_bytes_declarado)!==String(before.row.tamano_bytes_declarado))fail('DOCUMENTO_IDENTIDAD_DISTINTA');
      const objects=await tx`SELECT id,version,owner,owner_id,metadata FROM storage.objects
        WHERE bucket_id=${row.bucket_id} AND name=${row.storage_path} FOR SHARE NOWAIT`;
      const o=objects[0];if(objects.length!==1||o.id!==before.object.id||o.version!==before.object.version||o.owner!==null||o.owner_id!==null||
        Number(o.metadata?.size)!==Number(row.tamano_bytes_declarado)||o.metadata?.mimetype!==row.mime_type_declarado)fail('DOCUMENTO_IDENTIDAD_DISTINTA');
      if(row.estado_reserva==='disponible'){
        if(row.storage_object_id!==o.id||row.storage_version!==o.version||row.sha256_verificado!==sha)fail('DOCUMENTO_IDENTIDAD_DISTINTA');
        return;
      }
      const updated=await tx`UPDATE public.cuentas_documentos SET estado_reserva='disponible',storage_object_id=${o.id}::uuid,
        storage_version=${o.version},sha256_verificado=${sha} WHERE id=${row.id}::uuid AND estado_reserva='pendiente' RETURNING id`;
      if(updated.length!==1)fail('DOCUMENTO_REQUIERE_REVISION',202);
    });}
  };
}
export function createInstitutionalStorage(key,requestFetch=fetch){
  const path=row=>{
    if(!UUID.test(row.id||'')||!UUID.test(row.cuenta_id||'')||row.bucket_id!=='documentos-cuentas'||(row.storage_path!=='cuentas/'+row.cuenta_id+'/'+row.id && !(UUID.test(row.migracion_operacion_id||'') && row.storage_path==='cuentas/'+row.cuenta_id+'/'+row.id+'/institucional/'+row.migracion_operacion_id)))fail('DOCUMENTO_IDENTIDAD_DISTINTA');
    return 'documentos-cuentas/'+row.storage_path;
  };
  const headers=()=>{const k=key();if(typeof k!=='string'||!k)fail('DOCUMENTOS_SERVIDOR_NO_CONFIGURADO',503);return {Authorization:'Bearer '+k,apikey:k};};
  return {
    async upload(row,input){
      // Un único POST, sin SDK/reintentos, sin upsert ni DELETE compensatorio.
      const result=await requestFetch(PROJECT_URL+'/storage/v1/object/'+path(row),{method:'POST',headers:{...headers(),'Content-Type':input.mime,'x-upsert':'false'},
        body:input.bytes,redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!result.ok){await result.body?.cancel();fail('DOCUMENTO_REQUIERE_REVISION',202);}
      await result.body?.cancel();
    },
    async download(row){
      const result=await requestFetch(PROJECT_URL+'/storage/v1/object/authenticated/'+path(row),{method:'GET',headers:headers(),redirect:'error',signal:AbortSignal.timeout(30000)});
      if(result.status!==200||!result.body){await result.body?.cancel();fail('DOCUMENTO_REQUIERE_REVISION',202);}
      const reader=result.body.getReader(),parts=[];let size=0;
      try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>LIMIT||size>Number(row.tamano_bytes_declarado)){await reader.cancel();fail('DOCUMENTO_CONTENIDO_DISTINTO');}parts.push(next.value);}}
      finally{reader.releaseLock();}
      if(size!==Number(row.tamano_bytes_declarado))fail('DOCUMENTO_CONTENIDO_DISTINTO');
      const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
    }
  };
}
export function createInstitutionalService({store,storage,authorize}){
  return async({body,actor,token})=>{
    await authorize(token,actor);
    const input=await institutionalInput(body);
    if(!input.revisar){
      const prepared=await store.prepare(actor,input);
      if(prepared.upload){await authorize(token,actor);await storage.upload(prepared.row,input);}
    }
    await authorize(token,actor);
    const before=await store.inspect(actor,input.id),bytes=await storage.download(before.row),sha=await digest(bytes);
    if(bytes.length!==Number(before.row.tamano_bytes_declarado)||sha!==before.row.sha256_institucional_declarado)fail('DOCUMENTO_CONTENIDO_DISTINTO');
    await authorize(token,actor);await store.confirm(actor,before,sha);
    return {ok:true,estado:'DOCUMENTO_DISPONIBLE',documento_id:input.id,habilita_auth:false};
  };
}
export function createInstitutionalHandler({enabled=false,origins=/** @type {string[]} */ ([]),authenticate,authorize,execute,maxBodyBytes=BODY_LIMIT,disabledCode='DOCUMENTOS_INSTITUCIONALES_DESHABILITADOS'}){
  return async request=>{
    const origin=request.headers.get('origin'),allowed=!!origin&&origins.includes(origin);
    const headers={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin',...(allowed?{'Access-Control-Allow-Origin':origin,
      'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'}:{})};
    const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
    try{
      if(!allowed)fail('ORIGEN_NO_PERMITIDO',403);
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
      if(request.method!=='POST')fail('METODO_NO_PERMITIDO',405);
      if(!enabled)fail(disabledCode,503);
      const authorization=request.headers.get('authorization')||'';
      if(!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)||authorization.length>8192)fail('SESION_INVALIDA',401);
      const actor=await authenticate(authorization.slice(7));
      if(!UUID.test(actor?.id||'')||!UUID.test(actor?.sessionId||''))fail('SESION_INVALIDA',401);
      await authorize(authorization.slice(7),actor);
      if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')||!request.body)fail('DOCUMENTO_DATOS_INVALIDOS',400);
      const reader=request.body.getReader(),parts=[];let size=0;
      try{for(;;){const n=await reader.read();if(n.done)break;size+=n.value.length;if(size>maxBodyBytes){await reader.cancel();fail('CUERPO_DEMASIADO_GRANDE',413);}parts.push(n.value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
      let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('JSON_INVALIDO',400);}
      return reply(200,await execute({body,actor,token:authorization.slice(7)}));
    }catch(error){
      // Igualdad exacta con la guarda instalada; nunca publicar el mensaje SQL.
      const bloqueoEliminacion=error?.code==='55000'&&error?.message==='REGISTRO_RELACIONADO_EN_ELIMINACION_V2';
      return reply(bloqueoEliminacion?409:error instanceof InvitationError?error.status:503,{ok:false,
      error:bloqueoEliminacion?'DOCUMENTO_BLOQUEADO_POR_ELIMINACION':error instanceof InvitationError?error.code:'DOCUMENTO_RESULTADO_NO_CONFIRMADO',requiere_revision:true,
      no_reintentar_automaticamente:true,habilita_auth:false});}
  };
}

// PASO258: migración de una fila existente; no crea una identidad documental nueva.
export function migrationInput(body){
  const actions=['PREPARAR','COPIAR','REVISAR','ASOCIAR','RETIRAR_ORIGINAL'];
  if(!body||Array.isArray(body)||!actions.includes(body.accion)||!UUID.test(body.documento_id||''))fail('MIGRACION_DATOS_INVALIDOS',400);
  const expected=body.accion==='PREPARAR'?['accion','documento_id']:body.accion==='RETIRAR_ORIGINAL'?['accion','documento_id','operacion_id','confirmar']:['accion','documento_id','operacion_id'];
  if(Object.keys(body).sort().join(',')!==expected.sort().join(',')||body.accion!=='PREPARAR'&&!UUID.test(body.operacion_id||'')||body.accion==='RETIRAR_ORIGINAL'&&body.confirmar!==true)fail('MIGRACION_CONFIRMACION_INVALIDA',400);
  return {...body,documento_id:body.documento_id.toLowerCase(),...(body.operacion_id?{operacion_id:body.operacion_id.toLowerCase()}:{})};
}
function migrationRow(m,dest=false){
  if(!m||m.version!==1||!UUID.test(m.operacion_id||'')||!UUID.test(m.documento_id||'')||!UUID.test(m.original?.cuenta_id||'')||
    m.original.id!==m.documento_id||m.original.propiedad_institucional!==false||!UUID.test(m.original.creado_por||'')||!UUID.test(m.original.storage_object_id||'')||typeof m.original.storage_version!=='string'||!m.original.storage_version||!['application/pdf','image/jpeg','image/png','image/webp'].includes(m.original.mime_type_verificado)||m.original.bucket_id!=='documentos-cuentas'||m.original.storage_path!=='cuentas/'+m.original.cuenta_id+'/'+m.documento_id||
    !/^[a-f0-9]{64}$/.test(m.original.sha256_verificado||'')||!Number.isSafeInteger(Number(m.original.tamano_bytes_verificado))||Number(m.original.tamano_bytes_verificado)<1||Number(m.original.tamano_bytes_verificado)>LIMIT||
    m.destino_path!==m.original.storage_path+'/institucional/'+m.operacion_id)fail('MIGRACION_EVIDENCIA_INVALIDA');
  return {id:m.documento_id,cuenta_id:m.original.cuenta_id,bucket_id:'documentos-cuentas',
    storage_path:dest?m.destino_path:m.original.storage_path,migracion_operacion_id:m.operacion_id,
    tamano_bytes_declarado:Number(m.original.tamano_bytes_verificado),mime_type_declarado:m.original.mime_type_verificado};
}
export function createMigrationStore(transaction){
  return {
    async transition(actor,action,id,op=null,proof={}){
      return transaction(actor,async tx=>{
        const rows=await tx`SELECT public.cuentas_documentos_migrar_institucional_v1(${action},${id}::uuid,${op}::uuid,${JSON.stringify(proof)}::text::jsonb) AS migracion`;
        if(rows.length!==1)fail('MIGRACION_REQUIERE_REVISION',202);
        const m=rows[0].migracion;migrationRow(m);if(m.documento_id!==id||op!==null&&m.operacion_id!==op)fail('MIGRACION_EVIDENCIA_INVALIDA');return m;
      });
    },
    async inspect(actor,m){return transaction(actor,async tx=>{
      await tx`SELECT public.cuentas_documentos_institucional_contexto_v1()`;
      const original=migrationRow(m),destino=migrationRow(m,true);
      const originalRows=await tx`SELECT id,bucket_id,name,version,owner,owner_id,metadata FROM storage.objects
        WHERE (bucket_id='documentos-cuentas' AND name=${original.storage_path}) OR id=${m.original.storage_object_id}::uuid FOR SHARE NOWAIT`;
      const destinationRows=await tx`SELECT id,bucket_id,name,version,owner,owner_id,metadata FROM storage.objects
        WHERE bucket_id='documentos-cuentas' AND name=${destino.storage_path} FOR SHARE NOWAIT`;
      if(originalRows.length>1||destinationRows.length>1)fail('MIGRACION_EVIDENCIA_INVALIDA');
      return {original:originalRows[0]||null,nuevo:destinationRows[0]||null};
    });}
  };
}
export function createMigrationStorage(key,requestFetch=fetch,publicKey=/** @type {() => string | null} */ (()=>null)){
  const base=createInstitutionalStorage(key,requestFetch);
  const physical=createPhysicalStorageReader({projectUrl:PROJECT_URL,publicKey,fetchImpl:requestFetch});
  const headers=()=>{const k=key();if(typeof k!=='string'||!k)fail('DOCUMENTOS_SERVIDOR_NO_CONFIGURADO',503);return {Authorization:'Bearer '+k,apikey:k,'Content-Type':'application/json'};};
  return {
    download:(m,dest=false)=>base.download(migrationRow(m,dest)),
    readAuthorized:(m,object,token)=>physical.read({id:object.id,bucket_id:'documentos-cuentas',storage_path:m.destino_path,
      version:object.version,tamano_bytes:Number(m.original.tamano_bytes_verificado),sha256_documental:m.original.sha256_verificado},'Bearer '+token),
    async copy(m){
      if(m.estado!=='COPIA_EN_CURSO'||m.intentos_copia!==1)fail('MIGRACION_COPIA_NO_AUTORIZADA');
      const source=migrationRow(m),dest=migrationRow(m,true);
      const r=await requestFetch(PROJECT_URL+'/storage/v1/object/copy',{method:'POST',headers:{...headers(),'x-upsert':'false'},
        body:JSON.stringify({bucketId:'documentos-cuentas',sourceKey:source.storage_path,destinationKey:dest.storage_path,upsert:false}),redirect:'error',signal:AbortSignal.timeout(30000)});
      await r.body?.cancel();if(!r.ok)fail('MIGRACION_COPIA_NO_CONFIRMADA',202);
    },
    async removeOriginal(m){
      if(m.estado!=='RETIRO_EN_CURSO'||m.intentos_retiro!==1)fail('MIGRACION_RETIRO_NO_AUTORIZADO');
      const original=migrationRow(m);
      const r=await requestFetch(PROJECT_URL+'/storage/v1/object/documentos-cuentas',{method:'DELETE',headers:headers(),
        body:JSON.stringify({prefixes:[original.storage_path]}),redirect:'error',signal:AbortSignal.timeout(30000)});
      await r.body?.cancel();if(!r.ok)fail('MIGRACION_RETIRO_NO_CONFIRMADO',202);
    },
    async originalAbsent(m){
      const original=migrationRow(m);
      const r=await requestFetch(PROJECT_URL+'/storage/v1/object/authenticated/documentos-cuentas/'+original.storage_path,
        {method:'GET',headers:headers(),redirect:'error',signal:AbortSignal.timeout(15000)});
      if(r.status===404){await r.body?.cancel();return true;}
      if(r.status===400&&r.body){
        const reader=r.body.getReader();let text='',length=0;
        try{for(;;){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>2048)return false;text+=new TextDecoder().decode(chunk.value);}
          const payload=JSON.parse(text);return String(payload.statusCode)==='404'&&['not_found','NoSuchKey','Not Found'].includes(payload.error||payload.code);
        }catch{return false;}finally{void reader.cancel().catch(()=>{});}
      }
      await r.body?.cancel();return false;
    }
  };
}
export function createMigrationService({store,storage,authorize}){
  const publicResult=m=>({ok:true,documento_id:m.documento_id,operacion_id:m.operacion_id,estado:m.estado,
    completada:m.estado==='COMPLETADA',habilita_auth:false});
  return async({body,actor,token})=>{
    const input=migrationInput(body);await authorize(token,actor);
    const step=(action,m,proof={})=>store.transition(actor,action,input.documento_id,m?.operacion_id||input.operacion_id||null,proof);
    if(input.accion==='PREPARAR')return publicResult(await step('PREPARAR',null));
    let m=await step('LEER',null);
    const originalEvidence=o=>o&&o.id===m.original.storage_object_id&&o.version===m.original.storage_version&&o.bucket_id==='documentos-cuentas'&&o.name===m.original.storage_path&&o.owner_id===m.original.creado_por;
    const targetEvidence=o=>o&&UUID.test(o.id||'')&&o.id!==m.original.storage_object_id&&typeof o.version==='string'&&o.version&&o.bucket_id==='documentos-cuentas'&&o.name===m.destino_path&&o.owner===null&&o.owner_id===null&&
      Number(o.metadata?.size)===Number(m.original.tamano_bytes_verificado)&&o.metadata?.mimetype===m.original.mime_type_verificado&&(!m.nuevo||o.id===m.nuevo.id&&o.version===m.nuevo.version);
    const measure=async(dest)=>{const bytes=await storage.download(m,dest);if(bytes.length!==Number(m.original.tamano_bytes_verificado)||await digest(bytes)!==m.original.sha256_verificado)fail('MIGRACION_CONTENIDO_DISTINTO');};
    const verify=async(requireOriginal=true)=>{
      await authorize(token,actor);const before=await store.inspect(actor,m);
      if(!targetEvidence(before.nuevo)||requireOriginal&&!originalEvidence(before.original))fail('MIGRACION_EVIDENCIA_INVALIDA');
      if(requireOriginal)await measure(false);await measure(true);
      const authorized=['ASOCIADA','RETIRO_EN_CURSO','COMPLETADA'].includes(m.estado);
      if(authorized){const read=await storage.readAuthorized(m,before.nuevo,token);if(read.tamano_bytes!==Number(m.original.tamano_bytes_verificado)||read.sha256!==m.original.sha256_verificado)fail('MIGRACION_LECTURA_NO_AUTORIZADA');}
      const after=await store.inspect(actor,m);
      if(!targetEvidence(after.nuevo)||after.nuevo.id!==before.nuevo.id||after.nuevo.version!==before.nuevo.version||requireOriginal&&!originalEvidence(after.original))fail('MIGRACION_EVIDENCIA_INVALIDA');
      return {sha256:m.original.sha256_verificado,tamano:Number(m.original.tamano_bytes_verificado),nuevo_id:after.nuevo.id,nuevo_version:after.nuevo.version,lectura_autorizada:authorized};
    };
    const review=async()=>{
      if(m.estado==='COPIA_EN_CURSO'){const proof=await verify();await authorize(token,actor);m=await step('CERTIFICAR_COPIA',m,proof);}
      else if(m.estado==='RETIRO_EN_CURSO'){
        const proof=await verify(false),current=await store.inspect(actor,m);
        if(current.original||!await storage.originalAbsent(m))fail('MIGRACION_ORIGINAL_PENDIENTE_REVISION',202);
        await authorize(token,actor);m=await step('REGISTRAR_AUSENCIA',m,{...proof,original_api_ausente:true});
      }else if(['ASOCIADA','COMPLETADA'].includes(m.estado)){await verify(false);}
      return publicResult(m);
    };
    if(input.accion==='REVISAR')return await review();
    if(input.accion==='COPIAR'){
      if(m.estado!=='PREPARADA')fail('MIGRACION_USAR_REVISION',202);
      const before=await store.inspect(actor,m);if(!originalEvidence(before.original)||before.nuevo)fail('MIGRACION_EVIDENCIA_INVALIDA');
      await measure(false);await authorize(token,actor);
      m=await step('INICIAR_COPIA',m,{sha256:m.original.sha256_verificado,tamano:Number(m.original.tamano_bytes_verificado)});
      await authorize(token,actor);await storage.copy(m);return await review();
    }
    if(input.accion==='ASOCIAR'){
      if(m.estado!=='COPIA_VERIFICADA')fail('MIGRACION_ESTADO_NO_ADMITIDO');
      const proof=await verify();await authorize(token,actor);m=await step('ASOCIAR',m,proof);await verify(false);return publicResult(m);
    }
    if(input.accion==='RETIRAR_ORIGINAL'){
      if(m.estado!=='ASOCIADA')fail('MIGRACION_USAR_REVISION',202);
      const proof=await verify();await authorize(token,actor);m=await step('INICIAR_RETIRO',m,proof);
      await authorize(token,actor);await storage.removeOriginal(m);return await review();
    }
    fail('MIGRACION_ESTADO_NO_ADMITIDO');
  };
}
