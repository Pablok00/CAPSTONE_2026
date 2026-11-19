import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sql=readFileSync(new URL('../supabase/sql-propuestas/20261114_cuentas_documentos_borrado_revision.sql',import.meta.url),'utf8');
const conservation=readFileSync(new URL('../supabase/sql-propuestas/20261113_conservacion_cuentas_revision.sql',import.meta.url),'utf8');
const barrier=sql.match(/CREATE OR REPLACE FUNCTION public\.cuentas_documentos_barrera_fila_v1\(\)[\s\S]*?AS \$function\$\n[\s\S]*?\$function\$\n/)[0];
const rpc=sql.match(/CREATE OR REPLACE FUNCTION public\.cuentas_documentos_confirmar_retiro_v1\(p_operacion_id uuid\)[\s\S]*?\$confirmar\$;/)[0];
test('217 estático: ensayo con rollback interno y externo, sin ejecución de RPC ni Auth',()=>{
 assert.match(sql,/BEGIN;[\s\S]*RAISE EXCEPTION USING ERRCODE='ZX901'/);
 assert.match(sql,/catalogo_antes IS DISTINCT FROM catalogo_despues/);
 assert.match(sql,/ROLLBACK;\s*$/);assert.doesNotMatch(sql,/^COMMIT;|^\s*(?:SELECT|PERFORM) public\.cuentas_documentos_confirmar_retiro_v1\(/m);
 assert.match(sql,/habilita_auth=false/);assert.doesNotMatch(sql,/DELETE FROM (?:storage\.objects|auth\.users)/);
});
test('217 estático: cambio mínimo de barrera, MD5 de todas las ramas anteriores intacto',()=>{
 const restored=barrier.replace(/    IF TG_OP = 'DELETE' THEN\n      -- Capacidad privada[\s\S]*?      RETURN OLD;\n    END IF;/,
 "    IF TG_OP = 'DELETE' THEN\n      RAISE EXCEPTION USING\n        ERRCODE = '55000',\n        MESSAGE = 'BORRADO_METADATA_DOCUMENTAL_NO_PERMITIDO';\n    END IF;");
 assert.equal(createHash('md5').update(restored).digest('hex'),'f6cedba16de88a3d6fb1c4baa971607e');
 const hash=createHash('md5').update(barrier).digest('hex');
 assert.equal(conservation.split('86be85af4d5fdf402681657b9f781613').length-1,3);assert.ok(sql.includes(hash));
});
test('217 estático: RESTRICT conservado, retiro antes de documento y capacidad sin FK',()=>{
 assert.match(sql,/confdeltype='r' AND convalidated/);assert.doesNotMatch(sql,/DROP CONSTRAINT|ON DELETE CASCADE/);
 const cap=sql.match(/CREATE TABLE public\.cuentas_documentos_borrado_capacidad_v1[\s\S]*?\n\);/)[0];
 assert.doesNotMatch(cap,/REFERENCES/);
 const retirar=rpc.indexOf('DELETE FROM public.cuentas_documentos_retiros');
 const documento=rpc.indexOf('DELETE FROM public.cuentas_documentos WHERE');
 const limpiar=rpc.indexOf('DELETE FROM public.cuentas_documentos_borrado_capacidad_v1');
 assert.ok(retirar>0 && documento>retirar && limpiar>documento);
 assert.equal((rpc.match(/GET DIAGNOSTICS n=ROW_COUNT/g)||[]).length,3);
});
test('217 estático: capacidad privada transaccional, retiro confirmado y protección directa',()=>{
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);assert.match(sql,/REVOKE ALL ON public\.cuentas_documentos_borrado_capacidad_v1 FROM PUBLIC,anon,authenticated,service_role/);
 assert.match(sql,/transaccion=pg_current_xact_id\(\) AND backend=pg_backend_pid\(\) AND actor_id=auth.uid\(\)/);
 assert.match(sql,/nullif\(c.retiro->>'confirmado_en',''\) IS NULL/);
 assert.match(sql,/fila IS DISTINCT FROM c.documento/);assert.match(sql,/fila IS DISTINCT FROM c.retiro/);
 assert.match(sql,/DEFERRABLE INITIALLY DEFERRED/);assert.match(sql,/CAPACIDAD_DOCUMENTAL_NO_CONSUMIDA/);
});
test('217 estático: Storage solo lectura, ausencia fresca y misma identidad de archivo',()=>{
 assert.match(rpc,/LOCK TABLE storage.objects IN SHARE MODE NOWAIT/);
 assert.match(rpc,/o.bucket_id=r.bucket_id AND o.name=r.storage_path/);
 assert.match(rpc,/o.id=r.objeto_id/);
 assert.ok(rpc.indexOf('LOCK TABLE storage.objects')<rpc.indexOf('DELETE FROM public.cuentas_documentos_retiros'));
 assert.doesNotMatch(sql,/(?:UPDATE|INSERT INTO|DELETE FROM) storage\.objects/);
 assert.match(sql,/objeto_version.*storage_version/);assert.match(sql,/propietario_id.*creado_por/);
});
test('217 estático: JWT, administrador, conservación sellada y pérdidas de respuesta cierran sin éxito falso',()=>{
 assert.match(rpc,/auth.role\(\) IS DISTINCT FROM 'authenticated'/);assert.match(rpc,/public.es_administrador_actual\(\) IS NOT TRUE/);
 assert.match(rpc,/LOCK TABLE public.usuarios_eliminaciones_operaciones IN SHARE MODE NOWAIT/);
 assert.match(rpc,/CONSERVACION_DOCUMENTAL_BLOQUEA_RETIRO/);
 assert.match(rpc,/IF NOT FOUND THEN RAISE EXCEPTION 'OPERACION_DOCUMENTAL_NO_ENCONTRADA'/);
 assert.equal((rpc.match(/'resultado','AUSENCIA_CONFIRMADA'/g)||[]).length,1);
 assert.ok(rpc.indexOf("'resultado','AUSENCIA_CONFIRMADA'")>rpc.indexOf('DELETE FROM public.cuentas_documentos_borrado_capacidad_v1'));
});
test('217 estático: pre/postflight de dependencias y casos puros de evidencia alterada o ausente',()=>{
 assert.match(sql,/FK_ENTRANTE_NO_ACREDITADA/);assert.match(sql,/TRIGGER_RETIRO_NO_ACREDITADO/);
 assert.match(sql,/TRIGGERS_DELETE_DOCUMENTALES_NO_ACREDITADOS/);assert.match(sql,/ACL_DOCUMENTAL_NO_ACREDITADA/);
 assert.match(sql,/r-'propietario_id'/);assert.match(sql,/jsonb_set\(r,'\{objeto_version\}'/);
 assert.match(sql,/retiro_identidad_v1\(NULL,r\) IS NOT FALSE/);
 assert.equal((sql.match(/FULL JOIN \(VALUES/g)||[]).length,1);
});

test('218.1 estático: COMPLETADA queda fuera de todo el bloqueo; certificados abiertos y guardas privadas se conservan',()=>{
 assert.match(rpc,/WHERE o.estado IS DISTINCT FROM 'COMPLETADA' AND \(/);
 assert.match(sql,/PRUEBA_ALCANCE_CERTIFICADO_FALLO/);
 assert.match(sql,/\('COMPLETADA',true,true,1,false\)/);
 assert.match(sql,/\('PREPARADA',true,false,0,true\)/);
 assert.match(sql,/\('REQUIERE_REVISION',false,true,0,true\)/);
 assert.match(sql,/CREATE CONSTRAINT TRIGGER cuentas_documentos_capacidad_consumida_v1/);
 assert.doesNotMatch(sql,/DISABLE TRIGGER|DROP TRIGGER/);
});

test('233 estático: contrato 220 privado revisado al instalar y en ambas certificaciones',()=>{
 assert.equal((conservation.match(/PERFORM public\.usuario_eliminacion_documental_contrato_220_v1\(\)/g)||[]).length,3);
 for(const code of ['CONTRATO_DOCUMENTAL_220_NO_ACREDITADO','ACL_DOCUMENTAL_220_NO_ACREDITADA','CAPACIDAD_DOCUMENTAL_COLUMNAS_DISTINTAS','CAPACIDAD_DOCUMENTAL_PERMISOS_DISTINTOS','GUARDAS_DOCUMENTALES_220_NO_ACREDITADAS'])assert(conservation.includes(code));
 assert.match(conservation,/tgtype=21[\s\S]*?tgdeferrable AND tginitdeferred/);
 assert.match(conservation,/REVOKE ALL ON FUNCTION public\.usuario_eliminacion_documental_contrato_220_v1\(\) FROM PUBLIC,anon,authenticated,service_role/);
});
test('233 estático: todos los pendientes vencidos bloquean el manifiesto global y se conserva habilita_auth=false',()=>{
 const checks=conservation.match(/IF EXISTS\(SELECT 1 FROM public\.cuentas_documentos_retiros r[\s\S]*?RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_RETIRO_EN_CURSO'/g);
 assert.equal(checks.length,3);for(const check of checks){assert.match(check,/r\.confirmado_en IS NULL/);assert.doesNotMatch(check,/autorizado_hasta/);}
 assert.equal((conservation.match(/FROM public\.cuentas_documentos_retiros r WHERE r\.confirmado_en IS NULL/g)||[]).length,3);
 assert.match(conservation,/habilita_auth=false/);assert.match(conservation,/ROLLBACK;\s*$/);
});

test('251 estático: certificado exige guard de INSERT institucional, cuerpo acreditado y acceso privado',()=>{
 const body=`
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'cuentas_documentos' OR TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'EVENTO_DOCUMENTAL_NO_ADMITIDO';
  END IF;
  IF NEW.propiedad_institucional IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'NUEVA_RESERVA_PERSONAL_NO_PERMITIDA' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
`;
 const hash=createHash('md5').update(body.replace(/\s/g,'')).digest('hex');assert.ok(conservation.includes(hash));
 assert.match(conservation,/tgname='aa_cuentas_documentos_solo_institucional_v1' AND tgtype=7/);
 assert.match(conservation,/\('public\.cuentas_documentos_solo_institucional_v1\(\)','trigger',false\)/);
 assert.match(conservation,/CIERRE_RESERVAS_PERSONALES_NO_ACREDITADO/);
});
test('251 estático: cierre permisivo y restrictivo de INSERT, sin alterar contratos de retiro y bytes',()=>{
 const closure=conservation.slice(conservation.indexOf('-- PASO 251: cierre'),conservation.indexOf("  IF EXISTS(SELECT 1 FROM public.cuentas_documentos_borrado_capacidad_v1) THEN"));
 assert.match(closure,/NOT polpermissive/);assert.match(closure,/polpermissive/);
 assert.match(closure,/polroles=ARRAY\[0::oid\]/);assert.match(closure,/pg_get_expr\(polwithcheck,polrelid\)='false'/);
 assert.doesNotMatch(closure,/DELETE FROM|UPDATE storage|DROP POLICY|DISABLE TRIGGER/);
 assert.match(conservation,/7ad66dfa3b74cc9f12a193c5fb89de1d/);assert.match(conservation,/habilita_auth=false/);
});
