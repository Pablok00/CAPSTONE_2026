-- Requiere PASOS 220/236/251 y migración documental PASO 258; habilita_auth=false.
-- ENSAYO POSTGRESQL REVERSIBLE: SOLO REVISIÓN/EJECUCIÓN MANUAL DEL BLOQUE COMPLETO.
-- No ejecutado ni compilado localmente: PostgreSQL local no disponible.
-- habilita_auth=false. No invoca Auth, Storage API, neutralización ni RPC de eliminación.
-- Todos los DDL se ejecutan en una subtransacción revertida deliberadamente;
-- se compara el catálogo previo/posterior antes de terminar con ROLLBACK externo.
-- Sin tablas temporales ni estado persistente de sesión. Las reservas fixture del
-- bloque funcional opcional 358 se revierten antes de verificar el catálogo.
-- Event triggers: solo los seis contratos estándar acreditados por nombre/evento/tags/MD5.
-- Los tags de extensión no se activan aquí; NOTIFY de PostgREST es transaccional y se revierte.
-- Si este preflight falla, NO desactivar triggers ni saltarlo: el ensayo queda bloqueado.
-- Un error distinto del código deliberado se propaga y aborta el ensayo; ejecutar ROLLBACK
-- si el cliente deja la transacción abierta. No ejecutar fragmentos ni reemplazar ROLLBACK.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $ensayo_reversible$
DECLARE
  catalogo_antes text;
  catalogo_despues text;
  instalacion_comprobada boolean:=false;
BEGIN
  -- Contratos estándar acreditados: igualdad exacta, NULL no equivale a tags vacíos.
  -- No se cambia evtenabled. También se rechazan contratos desconocidos deshabilitados.
  IF EXISTS(
    SELECT 1 FROM pg_event_trigger e
    FULL JOIN (VALUES
      ('issue_graphql_placeholder','sql_drop',ARRAY['DROP EXTENSION']::text[],'8da9dff6b2ae47498209d341acaeb60b'),
      ('issue_pg_cron_access','ddl_command_end',ARRAY['CREATE EXTENSION']::text[],'53a44336da0ac1dd62d89dbd988e6d1d'),
      ('issue_pg_graphql_access','ddl_command_end',ARRAY['CREATE EXTENSION']::text[],'4e6d7efe4aed1b3b92063b648aa7a0cf'),
      ('issue_pg_net_access','ddl_command_end',ARRAY['CREATE EXTENSION']::text[],'1d06ef4fb47bb0ab6e6f8818a62013bb'),
      ('pgrst_ddl_watch','ddl_command_end',NULL::text[],'afaad7193dcf8f81e728d2bedb85e43e'),
      ('pgrst_drop_watch','sql_drop',NULL::text[],'4357772baf5cfcd5c6d7049585b3a537')
    ) AS esperado(nombre,evento,tags,huella) ON e.evtname::text=esperado.nombre
    WHERE e.oid IS NULL OR esperado.nombre IS NULL
      OR e.evtevent IS DISTINCT FROM esperado.evento
      OR e.evttags IS DISTINCT FROM esperado.tags
      OR md5(pg_get_functiondef(e.evtfoid)) IS DISTINCT FROM esperado.huella
  ) THEN
    RAISE EXCEPTION 'ENSAYO_BLOQUEADO_EVENT_TRIGGER_NO_ACREDITADO';
  END IF;

  SELECT encode(sha256(convert_to(coalesce(jsonb_agg(j ORDER BY j::text),'[]'::jsonb)::text,'UTF8')),'hex')
    INTO catalogo_antes FROM (
      SELECT jsonb_build_array('REL',c.oid,to_jsonb(c)) AS j FROM pg_class c
        WHERE c.relnamespace IN ('public'::regnamespace,'storage'::regnamespace)
      UNION ALL SELECT jsonb_build_array('ATTR',a.attrelid,a.attnum,to_jsonb(a)) FROM pg_attribute a
        JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace IN ('public'::regnamespace,'storage'::regnamespace)
      UNION ALL SELECT jsonb_build_array('CONSTRAINT',k.oid,to_jsonb(k),pg_get_constraintdef(k.oid)) FROM pg_constraint k
        JOIN pg_class c ON c.oid=k.conrelid WHERE c.relnamespace IN ('public'::regnamespace,'storage'::regnamespace)
      UNION ALL SELECT jsonb_build_array('TRIGGER',t.oid,to_jsonb(t),pg_get_triggerdef(t.oid)) FROM pg_trigger t
        JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace IN ('public'::regnamespace,'storage'::regnamespace)
      UNION ALL SELECT jsonb_build_array('POLICY',p.oid,to_jsonb(p)) FROM pg_policy p
        JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace IN ('public'::regnamespace,'storage'::regnamespace)
      UNION ALL SELECT jsonb_build_array('FUNC',p.oid,to_jsonb(p),pg_get_functiondef(p.oid)) FROM pg_proc p
        WHERE p.pronamespace IN ('public'::regnamespace,'storage'::regnamespace) AND p.prokind IN ('f','p')
    ) AS estado;

  BEGIN
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $requisitos_migracion$
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'MIGRACION_REQUIERE_POSTGRES';
  END IF;
  IF to_regclass('public.usuarios_eliminaciones_operaciones') IS NULL THEN
    RAISE EXCEPTION 'OPERACIONES_EXISTENTES_REQUERIDAS';
  END IF;
  IF EXISTS(SELECT 1 FROM public.usuarios_eliminaciones_operaciones
    WHERE dependencias_resumen ? 'conservacion_previa_v1' OR dependencias_resumen ? 'conservacion_documental_v1') THEN
    RAISE EXCEPTION 'CERTIFICADOS_EXISTENTES_REQUIEREN_MIGRACION_VERSIONADA';
  END IF;
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid='storage.objects'::regclass
      AND NOT attisdropped AND ((attname='owner' AND atttypid='uuid'::regtype AND NOT attnotnull) OR
        (attname='owner_id' AND atttypid='text'::regtype AND NOT attnotnull)))<>2 THEN
    RAISE EXCEPTION 'PROPIEDAD_STORAGE_NO_NEUTRALIZABLE';
  END IF;
  IF NOT has_schema_privilege('postgres','storage','USAGE') OR
     NOT has_table_privilege('postgres','storage.objects','SELECT') OR
     NOT has_table_privilege('postgres','storage.objects','TRIGGER') THEN


    RAISE EXCEPTION 'PRIVILEGIOS_STORAGE_NO_ACREDITADOS';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='storage.objects'::regclass
      AND tgname='update_objects_updated_at' AND NOT tgisinternal AND tgenabled IN ('O','A')) OR
     NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='storage.objects'::regclass
      AND tgname='protect_objects_delete' AND NOT tgisinternal AND tgenabled IN ('O','A')) THEN
    RAISE EXCEPTION 'GUARDAS_STORAGE_NO_ACREDITADAS';
  END IF;
END;
$requisitos_migracion$;

-- TRAMO DEL-FIX-20
-- DEL-FIX-20 / TRAMO ESTRUCTURAL V1. PROPUESTA; NO EJECUTADA.
-- No habilita eliminación integral ni reemplaza las RPC actuales.
-- Revisar y compilar junto al certificado integral antes de instalar.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $preflight$
DECLARE r record; c record;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'INSTALACION_REQUIERE_POSTGRES'; END IF;
  PERFORM pg_advisory_xact_lock(209,1);
  IF to_regclass('public.usuarios_identidades_historicas') IS NOT NULL THEN
    RAISE EXCEPTION 'IDENTIDADES_HISTORICAS_YA_EXISTE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuarios_eliminaciones_operaciones
    WHERE intentos_auth > 0 AND estado IN ('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION')) THEN
    RAISE EXCEPTION 'OPERACION_IRREVERSIBLE_PENDIENTE';
  END IF;
  FOR r IN SELECT * FROM (VALUES
    ('public.usuario_eliminacion_iniciar_general_v1(uuid)','01d2ccdd57874427e064d2c3117b9845'),
    ('public.usuario_eliminacion_evaluar_recepcion_v1(uuid)','0bc8e1ffc5025a41d0d7f9e4baf46aec'),
    ('public.usuario_eliminacion_finalizar_v1(uuid)','dbfa66cabacf0d7b4b3330b0a16e7d6b'),
    ('public.usuario_eliminacion_recuperar_general_v1(uuid,uuid,uuid,text)','7695c07fee206b0736d7d55c3cc622ba'),
    ('public.cuentas_documentos_barrera_fila_v1()','86be85af4d5fdf402681657b9f781613'),
    ('public.usuario_habilitado_actual()','26e58a80d9649b1ec87e0a89a3a0fa25'),
    ('public.usuarios_trabajadores_guard_eliminacion_v1()','bed43e0b19d45f78dab40c7cbcb51ff0'),
    ('public.usuarios_trabajadores_validar_operacion_v1(jsonb,jsonb)','13c6752d27ce23250a31ef76a1f8b647')
  ) AS v(firma,huella) LOOP
    IF to_regprocedure(r.firma) IS NULL OR
       md5(pg_get_functiondef(to_regprocedure(r.firma))) IS DISTINCT FROM r.huella THEN
      RAISE EXCEPTION 'CONTRATO_INSTALADO_DISTINTO';
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM (VALUES
    ('tareas','responsable_id','tareas_responsable_id_fkey','n'),
    ('mantenciones','responsable_id','mantenciones_responsable_id_fkey','n'),
    ('alertas','usuario_id','alertas_usuario_id_fkey','c'),
    ('solicitudes_reactivas_avisos_estado','usuario_id','solicitudes_reactivas_avisos_estado_usuario_id_fkey','c'),
    ('usuarios_correos_verificados','usuario_id','usuarios_correos_verificados_usuario_id_fkey','c'),
    ('usuarios_sesion_cambios','usuario_id','usuarios_sesion_cambios_usuario_id_fkey','c')
  ) AS v(tabla,columna,nombre,accion) LOOP
    SELECT k.*, a.attname AS columna_local, b.attname AS columna_referida
    INTO STRICT c
    FROM pg_constraint k
    JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1]
    JOIN pg_attribute b ON b.attrelid=k.confrelid AND b.attnum=k.confkey[1]
    WHERE k.conrelid=to_regclass('public.'||r.tabla) AND k.conname=r.nombre;
    IF c.contype <> 'f' OR NOT c.convalidated OR c.condeferrable OR
       cardinality(c.conkey) <> 1 OR cardinality(c.confkey) <> 1 OR
       c.confrelid <> 'public.usuarios'::regclass OR c.columna_local <> r.columna OR
       c.columna_referida <> 'id' OR c.confdeltype::text <> r.accion OR
       c.confupdtype <> 'a' OR c.confmatchtype <> 's' THEN
      RAISE EXCEPTION 'FK_CONSERVACION_DISTINTA';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.usuarios u LEFT JOIN public.trabajadores t
    ON t.id=u.trabajador_id WHERE u.trabajador_id IS NOT NULL AND t.id IS NULL) THEN
    RAISE EXCEPTION 'FICHA_REFERENCIADA_NO_EXISTE';
  END IF;
END;
$preflight$;

CREATE TABLE public.usuarios_identidades_historicas (
  cuenta_id uuid PRIMARY KEY,
  nombre_snapshot text,
  trabajador_id uuid REFERENCES public.trabajadores(id) ON DELETE RESTRICT,
  operacion_id uuid REFERENCES public.usuarios_eliminaciones_operaciones(id) ON DELETE RESTRICT,
  registrada_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  auth_eliminado_en timestamptz,
  CHECK (auth_eliminado_en IS NULL OR operacion_id IS NOT NULL),
  CHECK (auth_eliminado_en IS NULL OR auth_eliminado_en >= registrada_en)
);
ALTER TABLE public.usuarios_identidades_historicas OWNER TO postgres;
ALTER TABLE public.usuarios_identidades_historicas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usuarios_identidades_historicas FROM PUBLIC, anon, authenticated, service_role;
-- Intencionadamente sin políticas de acceso API ni campos de rol/contraseña/token.

CREATE FUNCTION public.usuarios_identidad_historica_guardar_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp SET row_security = off
AS $guard$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'IDENTIDAD_HISTORICA_INMUTABLE'; END IF;
  IF NEW.cuenta_id IS DISTINCT FROM OLD.cuenta_id OR NEW.registrada_en IS DISTINCT FROM OLD.registrada_en THEN
    RAISE EXCEPTION 'IDENTIDAD_HISTORICA_INMUTABLE';
  END IF;
  IF OLD.auth_eliminado_en IS NOT NULL AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'IDENTIDAD_HISTORICA_INMUTABLE';
  END IF;
  -- La confirmación futura no puede reescribir la persona ni su ficha original.
  IF NEW.auth_eliminado_en IS DISTINCT FROM OLD.auth_eliminado_en AND
     (NEW.nombre_snapshot IS DISTINCT FROM OLD.nombre_snapshot OR
      NEW.trabajador_id IS DISTINCT FROM OLD.trabajador_id) THEN
    RAISE EXCEPTION 'IDENTIDAD_HISTORICA_INMUTABLE';
  END IF;
  IF NEW.auth_eliminado_en IS NOT DISTINCT FROM OLD.auth_eliminado_en AND
     to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    -- Solo el trigger de sincronización puede reflejar un perfil operativo real.
    -- La profundidad no sustituye estas comprobaciones ni concede acceso API.
    IF pg_trigger_depth()<2 OR NEW.operacion_id IS DISTINCT FROM OLD.operacion_id OR
       NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=NEW.cuenta_id
         AND u.nombre IS NOT DISTINCT FROM NEW.nombre_snapshot
         AND u.trabajador_id IS NOT DISTINCT FROM NEW.trabajador_id) OR
       EXISTS(SELECT 1 FROM public.usuarios_eliminaciones_operaciones o
         WHERE o.objetivo_id=NEW.cuenta_id AND o.intentos_auth>0) THEN
      RAISE EXCEPTION 'IDENTIDAD_HISTORICA_CAMBIO_NO_AUTORIZADO';
    END IF;
  END IF;
  IF OLD.auth_eliminado_en IS NULL AND NEW.auth_eliminado_en IS NOT NULL THEN
    -- El tramo estructural no produce este certificado. La confirmación integral
    -- solo podrá añadirse por la implementación servidor revisada posteriormente.
    IF EXISTS (SELECT 1 FROM auth.users WHERE id=NEW.cuenta_id) OR
       EXISTS (SELECT 1 FROM public.usuarios WHERE id=NEW.cuenta_id) OR NOT EXISTS (
         SELECT 1 FROM public.usuarios_eliminaciones_operaciones o
         JOIN public.del_registro_eliminaciones a ON a.id=o.auditoria_id
         WHERE o.id=NEW.operacion_id AND o.objetivo_id=NEW.cuenta_id AND o.estado='COMPLETADA'
           AND a.entidad_id=o.objetivo_id AND a.ejecutado_por=o.actor_id
           AND (o.dependencias_resumen @>
             '{"conservacion_integral_v1":{"version":1,"verificada":true}}'::jsonb OR
             (o.dependencias_resumen->'conservacion_posterior_v2' @> '{"version":2,"verificada":true,"habilita_auth":false}'::jsonb
              AND o.dependencias_resumen->'conservacion_posterior_v2'->>'certificado_sha256' =
                o.dependencias_resumen->'conservacion_integral_v2'->>'sha256'
              AND o.intentos_auth=1 AND o.dependencias_resumen->'ejecucion_integral_v2' IS NOT NULL
              AND o.dependencias_resumen->'conservacion_integral_v2'->'ledger_laboral'->>'trabajador_actual'
                IS NOT DISTINCT FROM NEW.trabajador_id::text))
       ) THEN RAISE EXCEPTION 'ELIMINACION_HISTORICA_NO_CONFIRMADA'; END IF;
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.usuarios_identidad_historica_guardar_v1() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER usuarios_identidad_historica_inmutable
BEFORE UPDATE OR DELETE ON public.usuarios_identidades_historicas
FOR EACH ROW EXECUTE FUNCTION public.usuarios_identidad_historica_guardar_v1();

CREATE FUNCTION public.usuarios_identidad_historica_sincronizar_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp SET row_security = off
AS $sync$
BEGIN
  IF TG_OP='UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'IDENTIDAD_UUID_INMUTABLE';
  END IF;
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.usuarios_identidades_historicas WHERE cuenta_id=NEW.id) THEN
    RAISE EXCEPTION 'IDENTIDAD_ARCHIVADA_NO_REUTILIZABLE';
  END IF;
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.usuarios_eliminaciones_operaciones o
      WHERE o.objetivo_id=NEW.id AND o.intentos_auth>0) THEN
    -- La desvinculación operativa autorizada por las guardas laborales no borra
    -- el UUID laboral histórico. No se autoriza aquí ninguna desvinculación.
    IF NEW.nombre IS DISTINCT FROM OLD.nombre OR
       (NEW.trabajador_id IS DISTINCT FROM OLD.trabajador_id AND NEW.trabajador_id IS NOT NULL) OR
       NOT EXISTS(SELECT 1 FROM public.usuarios_identidades_historicas h WHERE h.cuenta_id=OLD.id
         AND h.nombre_snapshot IS NOT DISTINCT FROM OLD.nombre
         AND (OLD.trabajador_id IS NULL OR h.trabajador_id IS NOT DISTINCT FROM OLD.trabajador_id)) THEN
      RAISE EXCEPTION 'IDENTIDAD_EN_ELIMINACION_INMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  INSERT INTO public.usuarios_identidades_historicas AS h(cuenta_id,nombre_snapshot,trabajador_id)
    VALUES (NEW.id,NEW.nombre,NEW.trabajador_id)
  ON CONFLICT (cuenta_id) DO UPDATE SET
    nombre_snapshot=EXCLUDED.nombre_snapshot, trabajador_id=EXCLUDED.trabajador_id
    WHERE h.auth_eliminado_en IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'IDENTIDAD_ARCHIVADA_NO_REUTILIZABLE'; END IF;
  RETURN NEW;
END;
$sync$;
REVOKE ALL ON FUNCTION public.usuarios_identidad_historica_sincronizar_v1() FROM PUBLIC, anon, authenticated, service_role;

-- Se bloquea el alta/cambio de perfiles mientras se establece su padre histórico.
LOCK TABLE public.usuarios IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO public.usuarios_identidades_historicas(cuenta_id,nombre_snapshot,trabajador_id)
  SELECT id,nombre,trabajador_id FROM public.usuarios;
CREATE TRIGGER zz_usuarios_identidad_historica_sincronizar
AFTER INSERT OR UPDATE OF id,nombre,trabajador_id ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.usuarios_identidad_historica_sincronizar_v1();

CREATE FUNCTION public.usuarios_identidad_historica_referencia_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp SET row_security = off
AS $reference$
DECLARE nuevo uuid; anterior uuid;
BEGIN
  nuevo := (to_jsonb(NEW)->>TG_ARGV[0])::uuid;
  IF TG_OP='UPDATE' THEN anterior := (to_jsonb(OLD)->>TG_ARGV[0])::uuid; END IF;
  -- No impedir cambios legítimos de otros campos de un registro histórico.
  IF TG_OP='UPDATE' AND nuevo IS NOT DISTINCT FROM anterior THEN RETURN NEW; END IF;
  -- Coordinar también la retirada de referencias con el inicio/certificación.
  PERFORM pg_advisory_xact_lock(209,1);
  IF TG_OP='UPDATE' AND anterior IS NOT NULL AND (NOT EXISTS(
      SELECT 1 FROM public.usuarios WHERE id=anterior) OR EXISTS(
      SELECT 1 FROM public.usuarios_eliminaciones_operaciones o
      WHERE o.objetivo_id=anterior AND o.intentos_auth>0)) THEN
    RAISE EXCEPTION 'REFERENCIA_HISTORICA_INMUTABLE';
  END IF;
  IF nuevo IS NULL THEN RETURN NEW; END IF;
  -- Reproduce la exigencia previa de perfil existente para nuevas referencias;
  -- una identidad archivada no se convierte en responsable de nuevos trabajos.
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id=nuevo
    FOR SHARE
) OR EXISTS (
    SELECT 1
    FROM public.usuarios_eliminaciones_operaciones o
    WHERE o.objetivo_id=nuevo
      AND o.intentos_auth>0
) THEN
    RAISE EXCEPTION 'NUEVA_REFERENCIA_A_CUENTA_ELIMINADA';
  END IF;
  RETURN NEW;
END;
$reference$;
REVOKE ALL ON FUNCTION public.usuarios_identidad_historica_referencia_v1() FROM PUBLIC, anon, authenticated, service_role;

DO $foreign_keys$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('tareas','responsable_id','tareas_responsable_id_fkey'),
    ('mantenciones','responsable_id','mantenciones_responsable_id_fkey'),
    ('alertas','usuario_id','alertas_usuario_id_fkey'),
    ('solicitudes_reactivas_avisos_estado','usuario_id','solicitudes_reactivas_avisos_estado_usuario_id_fkey'),
    ('usuarios_correos_verificados','usuario_id','usuarios_correos_verificados_usuario_id_fkey'),
    ('usuarios_sesion_cambios','usuario_id','usuarios_sesion_cambios_usuario_id_fkey')
  ) AS v(tabla,columna,nombre) LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',r.tabla,r.nombre);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.usuarios_identidades_historicas(cuenta_id) ON DELETE RESTRICT',r.tabla,r.nombre,r.columna);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON public.%I FOR EACH ROW EXECUTE FUNCTION public.usuarios_identidad_historica_referencia_v1(%L)',
      'zz_identidad_historica_'||r.tabla,r.columna,r.tabla,r.columna);
  END LOOP;
END;
$foreign_keys$;
DO $unchanged$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE
      conrelid='public.usuarios'::regclass AND conname='usuarios_id_fkey'
      AND confrelid='auth.users'::regclass AND contype='f' AND confdeltype='c' AND convalidated)
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE
      conrelid='public.solicitudes_reactivas_avisos_estado'::regclass
      AND conname='solicitudes_reactivas_avisos_estado_solicitud_id_fkey'
      AND confrelid='public.solicitudes_reactivas_avisos'::regclass
      AND contype='f' AND confdeltype='r' AND convalidated) THEN
    RAISE EXCEPTION 'FK_NO_AFECTADA_CAMBIO';
  END IF;
END;
$unchanged$;
-- Mantener intacta la FK avisos_estado.solicitud_id -> avisos.solicitud_id RESTRICT.
-- Mantener intacta la FK usuarios.id -> auth.users.id CASCADE.
-- No trasladar ni modificar filas históricas ni referencias UUID existentes.

-- Una señal conservada no debe dar lectura a un JWT previo de un perfil borrado.
CREATE POLICY usuarios_sesion_cambios_lector_habilitado_v1
ON public.usuarios_sesion_cambios AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.usuario_habilitado_actual() IS TRUE);

DO $postflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuarios u LEFT JOIN public.usuarios_identidades_historicas h ON h.cuenta_id=u.id
      WHERE h.cuenta_id IS NULL OR h.nombre_snapshot IS DISTINCT FROM u.nombre
         OR h.trabajador_id IS DISTINCT FROM u.trabajador_id) THEN
    RAISE EXCEPTION 'IDENTIDADES_INICIALES_INCOMPLETAS';
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuarios_identidades_historicas WHERE auth_eliminado_en IS NOT NULL) THEN
    RAISE EXCEPTION 'NO_SE_PERMITE_CONFIRMAR_ELIMINACIONES_EN_INSTALACION';
  END IF;
  IF has_table_privilege('anon','public.usuarios_identidades_historicas','SELECT') OR
     has_table_privilege('authenticated','public.usuarios_identidades_historicas','SELECT') OR
     has_table_privilege('service_role','public.usuarios_identidades_historicas','SELECT') THEN
    RAISE EXCEPTION 'IDENTIDAD_HISTORICA_EXPUESTA';
  END IF;
END;
$postflight$;

-- PASO 233: contrato estructural 220 y guardas acreditadas, sin ejecutar RPC mutantes.
-- Las definiciones completas permanecen incluidas en la huella de catálogo del certificado.
CREATE FUNCTION public.usuario_eliminacion_documental_contrato_220_v1()
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $contrato220$
DECLARE f record; k oid; filas integer;
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'CONSERVACION_CONTEXTO_NO_ADMITIDO';
  END IF;
  FOR f IN SELECT * FROM (VALUES
    ('public.cuentas_documentos_barrera_entrada_v1()','trigger',true),
    ('public.cuentas_documentos_barrera_fila_v1()','trigger',true),
    ('public.cuentas_documentos_confirmar_retiro_v1(uuid)','jsonb',true),
    ('public.cuentas_documentos_reservar_retiro_v1(uuid,uuid,boolean,uuid)','jsonb',true),
    ('public.cuentas_documentos_borrado_validar_v1(text,jsonb)','void',true),
    ('public.cuentas_documentos_borrado_guard_v1()','trigger',true),
    ('public.cuentas_documentos_retiro_identidad_v1(jsonb,jsonb)','boolean',false),
    ('public.cuentas_documentos_solo_institucional_v1()','trigger',false),
    ('public.cuentas_documentos_ruta_certificada_v1(jsonb)','boolean',false),
    ('public.cuentas_documentos_migracion_permitir_v1(jsonb,jsonb)','void',false),
    ('public.cuentas_documentos_migracion_guard_v1()','trigger',true),
    ('public.cuentas_documentos_migrar_institucional_v1(text,uuid,uuid,jsonb)','jsonb',false)
  ) v(firma,retorno,definidor) LOOP
    k:=to_regprocedure(f.firma);
    IF k IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc pr WHERE pr.oid=k AND pr.prokind='f'
      AND pg_get_userbyid(pr.proowner)='postgres' AND pr.prorettype=to_regtype(f.retorno)
      AND NOT pr.proretset AND pr.prosecdef=f.definidor AND
      pr.proconfig @> ARRAY['search_path=""']::text[] AND
      (NOT f.definidor OR pr.proconfig @> ARRAY['row_security=off']::text[])) THEN
      RAISE EXCEPTION 'CONTRATO_DOCUMENTAL_220_NO_ACREDITADO';
    END IF;
    IF EXISTS(SELECT 1 FROM pg_proc pr,
      LATERAL aclexplode(coalesce(pr.proacl,acldefault('f',pr.proowner))) a
      WHERE pr.oid=k AND (a.grantee=0 OR pg_get_userbyid(a.grantee) NOT IN
        ('postgres',CASE WHEN f.firma IN ('public.cuentas_documentos_confirmar_retiro_v1(uuid)',
          'public.cuentas_documentos_reservar_retiro_v1(uuid,uuid,boolean,uuid)') THEN 'authenticated' ELSE 'postgres' END))) THEN
      RAISE EXCEPTION 'ACL_DOCUMENTAL_220_NO_ACREDITADA';
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated','public.cuentas_documentos_confirmar_retiro_v1(uuid)','EXECUTE') OR
     NOT has_function_privilege('authenticated','public.cuentas_documentos_reservar_retiro_v1(uuid,uuid,boolean,uuid)','EXECUTE') OR
     md5(pg_get_functiondef('public.cuentas_documentos_barrera_fila_v1()'::regprocedure)) IS DISTINCT FROM
       '86be85af4d5fdf402681657b9f781613' OR
     md5(pg_get_functiondef('public.cuentas_documentos_barrera_entrada_v1()'::regprocedure)) IS DISTINCT FROM
       '4085aa62ed260da05099fd264869a5d1' OR
     md5(pg_get_functiondef('public.cuentas_documentos_reservar_retiro_v1(uuid,uuid,boolean,uuid)'::regprocedure)) IS DISTINCT FROM
       '7ad66dfa3b74cc9f12a193c5fb89de1d' THEN
    RAISE EXCEPTION 'CONTRATO_DOCUMENTAL_220_DISTINTO';
  END IF;
  k:=to_regclass('public.cuentas_documentos_borrado_capacidad_v1');
  IF k IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=k AND relkind='r' AND
    pg_get_userbyid(relowner)='postgres' AND relrowsecurity) OR
    EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=k) THEN
    RAISE EXCEPTION 'CAPACIDAD_DOCUMENTAL_220_NO_ACREDITADA';
  END IF;
  SELECT count(*) INTO filas FROM pg_attribute WHERE attrelid=k AND attnum>0 AND NOT attisdropped;
  IF filas<>7 OR EXISTS(SELECT 1 FROM (VALUES
      ('transaccion','xid8'),('backend','integer'),('documento_id','uuid'),('operacion_id','uuid'),
      ('actor_id','uuid'),('documento','jsonb'),('retiro','jsonb')) v(nombre,tipo)
    WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=k AND a.attname=v.nombre
      AND a.atttypid=to_regtype(v.tipo) AND a.attnotnull AND NOT a.attisdropped)) THEN
    RAISE EXCEPTION 'CAPACIDAD_DOCUMENTAL_COLUMNAS_DISTINTAS';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=k AND c.contype='p' AND c.convalidated
    AND (SELECT array_agg(a.attname::text ORDER BY z.orden) FROM unnest(c.conkey) WITH ORDINALITY z(num,orden)
      JOIN pg_attribute a ON a.attrelid=k AND a.attnum=z.num)=ARRAY['transaccion','backend','documento_id']) OR
    NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=k AND c.contype='u' AND c.convalidated
    AND (SELECT array_agg(a.attname::text ORDER BY z.orden) FROM unnest(c.conkey) WITH ORDINALITY z(num,orden)
      JOIN pg_attribute a ON a.attrelid=k AND a.attnum=z.num)=ARRAY['transaccion','backend','operacion_id']) OR
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=k AND contype='f') THEN
    RAISE EXCEPTION 'CAPACIDAD_DOCUMENTAL_RESTRICCIONES_DISTINTAS';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid=k AND contype<>'t')<>4 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=k AND contype='t')<>1 OR
     (SELECT count(*) FROM pg_constraint WHERE conrelid=k AND contype='c' AND convalidated AND
       pg_get_expr(conbin,conrelid) IN
         ('(jsonb_typeof(documento) = ''object''::text)','(jsonb_typeof(retiro) = ''object''::text)'))<>2 OR
     EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('public.cuentas_documentos'::regclass,
       'public.cuentas_documentos_retiros'::regclass) AND NOT relrowsecurity) OR
     EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class IN ('public.cuentas_documentos'::regclass,
       'public.cuentas_documentos_retiros'::regclass,k)) THEN
    RAISE EXCEPTION 'CONTRATO_DOCUMENTAL_RESTRICCIONES_O_RLS_DISTINTOS';
  END IF;
  IF EXISTS(SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) v(rol)
    WHERE has_table_privilege(v.rol,k,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
      has_table_privilege(v.rol,'public.cuentas_documentos','DELETE,TRUNCATE') OR
      has_table_privilege(v.rol,'public.cuentas_documentos_retiros','DELETE,TRUNCATE')) OR
    EXISTS(SELECT 1 FROM pg_class c,LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid=k AND (a.grantee=0 OR a.grantee<>c.relowner)) THEN
    RAISE EXCEPTION 'CAPACIDAD_DOCUMENTAL_PERMISOS_DISTINTOS';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.cuentas_documentos_retiros'::regclass
    AND confrelid='public.cuentas_documentos'::regclass AND conname='cuentas_documentos_retiros_documento_id_fkey'
    AND contype='f' AND confdeltype='r' AND convalidated AND
    cardinality(conkey)=1 AND cardinality(confkey)=1
AND confupdtype='a' AND confmatchtype='s'
AND NOT condeferrable
AND conkey=ARRAY[
    (SELECT attnum FROM pg_attribute
     WHERE attrelid='public.cuentas_documentos_retiros'::regclass
     AND attname='documento_id' AND NOT attisdropped)
]
AND confkey=ARRAY[
    (SELECT attnum FROM pg_attribute
     WHERE attrelid='public.cuentas_documentos'::regclass
     AND attname='id' AND NOT attisdropped)
]) OR
    NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=k AND tgname='cuentas_documentos_capacidad_consumida_v1'
      AND tgfoid='public.cuentas_documentos_borrado_guard_v1()'::regprocedure AND tgtype=21
      AND tgdeferrable AND tginitdeferred AND tgenabled IN ('O','A') AND NOT tgisinternal) OR
    NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.cuentas_documentos_retiros'::regclass
      AND tgname='cuentas_documentos_retiro_borrado_guard_v1' AND tgtype=11
      AND tgfoid='public.cuentas_documentos_borrado_guard_v1()'::regprocedure AND tgenabled IN ('O','A') AND NOT tgisinternal) OR
    NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.cuentas_documentos'::regclass
      AND tgfoid='public.cuentas_documentos_barrera_fila_v1()'::regprocedure AND (tgtype::integer & 11)=11
      AND tgenabled IN ('O','A') AND NOT tgisinternal) OR
    NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.cuentas_documentos'::regclass
      AND tgfoid='public.cuentas_documentos_barrera_entrada_v1()'::regprocedure AND (tgtype::integer & 11)=10
      AND tgenabled IN ('O','A') AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'GUARDAS_DOCUMENTALES_220_NO_ACREDITADAS';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.cuentas_documentos'::regclass
    AND attname='migracion_institucional' AND atttypid='jsonb'::regtype AND NOT attisdropped) OR
    NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.cuentas_documentos'::regclass
      AND tgname='zz_cuentas_documentos_migracion_guard_v1' AND tgtype=31 AND NOT tgisinternal
      AND tgfoid='public.cuentas_documentos_migracion_guard_v1()'::regprocedure AND tgenabled IN ('O','A')) OR
    NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.cuentas_documentos_retiros'::regclass
      AND tgname='zz_cuentas_documentos_retiro_migracion_guard_v1' AND tgtype=23 AND NOT tgisinternal
      AND tgfoid='public.cuentas_documentos_migracion_guard_v1()'::regprocedure AND tgenabled IN ('O','A')) THEN
    RAISE EXCEPTION 'MIGRACION_DOCUMENTAL_GUARDAS_NO_ACREDITADAS';
  END IF;
  -- PASO 251: cierre de nuevas reservas personales; no modifica lectura/retiro de las existentes.
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.cuentas_documentos'::regclass
    AND tgname='aa_cuentas_documentos_solo_institucional_v1' AND tgtype=7 AND NOT tgisinternal
    AND tgfoid='public.cuentas_documentos_solo_institucional_v1()'::regprocedure AND tgenabled IN ('O','A')) OR
    (SELECT md5(regexp_replace(prosrc,'[[:space:]]','','g')) FROM pg_proc
      WHERE oid='public.cuentas_documentos_solo_institucional_v1()'::regprocedure) IS DISTINCT FROM 'd853470286cd7f59f5762d3ef273e3b1' THEN
    RAISE EXCEPTION 'CIERRE_RESERVAS_PERSONALES_NO_ACREDITADO';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass
    AND polname='cuentas_documentos_storage_insert_bloqueado' AND polcmd='a' AND NOT polpermissive AND polroles=ARRAY[0::oid]
    AND polqual IS NULL AND regexp_replace(pg_get_expr(polwithcheck,polrelid),'[[:space:]]','','g')=
      '(bucket_idISDISTINCTFROM''documentos-cuentas''::text)') OR
    NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass
    AND polname='cuentas_documentos_storage_insert_permanente' AND polcmd='a' AND polpermissive
    AND polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')]
    AND polqual IS NULL AND pg_get_expr(polwithcheck,polrelid)='false') THEN
    RAISE EXCEPTION 'CIERRE_STORAGE_DIRECTO_NO_ACREDITADO';
  END IF;
  IF EXISTS(SELECT 1 FROM public.cuentas_documentos_borrado_capacidad_v1) THEN
    RAISE EXCEPTION 'CAPACIDAD_DOCUMENTAL_NO_CONSUMIDA';
  END IF;
END;
$contrato220$;
ALTER FUNCTION public.usuario_eliminacion_documental_contrato_220_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.usuario_eliminacion_documental_contrato_220_v1() FROM PUBLIC,anon,authenticated,service_role;
DO $validar_contrato220$
BEGIN
  PERFORM public.usuario_eliminacion_documental_contrato_220_v1();
END;
$validar_contrato220$;

-- TRAMO DEL-FIX-21
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $preflight21$
BEGIN
  IF current_user <> 'postgres' OR to_regclass('public.usuarios_identidades_historicas') IS NULL OR
     to_regprocedure('public.usuario_eliminacion_conservacion_previa_v1(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'CONSERVACION_PREFLIGHT_NO_ACREDITADO';
  END IF;
  IF md5(pg_get_functiondef('public.usuarios_trabajadores_certificar_ledger_v1(uuid,uuid)'::regprocedure))
      IS DISTINCT FROM '584df37e96f279457bb30487b3761514' THEN
    RAISE EXCEPTION 'CONTRATO_LABORAL_DISTINTO';
  END IF;
END;
$preflight21$;

-- INVOKER privado: NO acceso API, NO SECURITY DEFINER ni cambios de claims/rol.
CREATE FUNCTION public.usuario_eliminacion_conservacion_previa_v1(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, pg_temp SET row_security = off
AS $certificate21$
DECLARE
  o public.usuarios_eliminaciones_operaciones%ROWTYPE;
  u public.usuarios%ROWTYPE;
  h public.usuarios_identidades_historicas%ROWTYPE;
  r record; n bigint; bytes bigint; digest_text text; categorias jsonb := '{}'::jsonb;
  categoria text; detalle jsonb; ledger jsonb; catalogo text; propietarios jsonb;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' OR
     current_setting('transaction_isolation') <> 'read committed' OR
     auth.uid() IS NULL OR public.es_administrador_permanente_actual() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CONSERVACION_CONTEXTO_NO_ADMITIDO';
  END IF;
  SELECT * INTO STRICT o FROM public.usuarios_eliminaciones_operaciones WHERE id=p_operacion_id;
  IF o.actor_id IS DISTINCT FROM auth.uid() OR o.objetivo_id=auth.uid() OR
     o.estado <> 'PREPARADA' OR o.intentos_auth <> 0 OR o.auditoria_id IS NOT NULL OR
     o.dependencias_resumen->'paso191'->>'request_id' IS NULL OR
     o.dependencias_resumen->'paso191'->>'fingerprint' IS NULL THEN
    RAISE EXCEPTION 'CONSERVACION_OPERACION_NO_ADMITIDA';
  END IF;
  PERFORM public.usuario_eliminacion_documental_contrato_220_v1();
  -- El manifiesto es global: todo retiro sin confirmar bloquea, incluso vencido.
  IF EXISTS(SELECT 1 FROM public.cuentas_documentos_retiros r WHERE r.confirmado_en IS NULL) OR
     EXISTS(SELECT 1 FROM public.cuentas_documentos d WHERE d.migracion_institucional IS NOT NULL
       AND d.migracion_institucional->>'estado' IS DISTINCT FROM 'COMPLETADA') THEN
    RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_RETIRO_EN_CURSO';
  END IF;
  SELECT * INTO STRICT u FROM public.usuarios WHERE id=o.objetivo_id;
  SELECT * INTO STRICT h FROM public.usuarios_identidades_historicas WHERE cuenta_id=o.objetivo_id;
  IF u.estado IS DISTINCT FROM true OR u.nombre IS DISTINCT FROM o.objetivo_nombre_snapshot OR
     h.nombre_snapshot IS DISTINCT FROM u.nombre OR h.trabajador_id IS DISTINCT FROM u.trabajador_id OR
     h.auth_eliminado_en IS NOT NULL OR public.es_rol_administrador(u.rol_id) IS DISTINCT FROM false OR
     NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u.id) THEN
    RAISE EXCEPTION 'CONSERVACION_IDENTIDAD_NO_ACREDITADA';
  END IF;
  -- Un dato incompleto de vigencia también bloquea. Incluye programadas y las otorgadas por el objetivo.
  IF EXISTS (SELECT 1 FROM public.administraciones_temporales d
    WHERE (d.usuario_id=u.id OR d.otorgado_por=u.id OR d.revocado_por=u.id)
      AND d.revocado_at IS NULL AND (d.vigente_hasta IS NULL OR d.vigente_hasta > clock_timestamp())) THEN
    RAISE EXCEPTION 'CONSERVACION_DELEGACION_NO_CERRADA';
  END IF;
  -- Ninguna nueva arista pública CASCADE/SET NULL/SET DEFAULT se acepta sin diseño explícito.
  IF EXISTS(WITH RECURSIVE desaparecen(oid) AS (
      SELECT 'auth.users'::regclass::oid
      UNION
      SELECT k.conrelid FROM pg_constraint k JOIN desaparecen d ON d.oid=k.confrelid
        WHERE k.contype='f' AND k.confdeltype='c'
    ) SELECT 1 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
      JOIN desaparecen d ON d.oid=k.confrelid
    WHERE k.contype='f' AND c.relnamespace='public'::regnamespace
      AND k.confdeltype IN ('c','n','d')
      AND NOT (k.conrelid='public.usuarios'::regclass AND k.confrelid='auth.users'::regclass
        AND k.conname='usuarios_id_fkey' AND k.confdeltype='c' AND k.convalidated)) THEN
    RAISE EXCEPTION 'CONSERVACION_CASCADA_NO_CUBIERTA';
  END IF;
  -- Certificar la estructura efectiva, no la mera existencia del padre histórico.
  IF (SELECT count(*) FROM (VALUES
      ('tareas','responsable_id'),('mantenciones','responsable_id'),('alertas','usuario_id'),
      ('solicitudes_reactivas_avisos_estado','usuario_id'),
      ('usuarios_correos_verificados','usuario_id'),('usuarios_sesion_cambios','usuario_id')) v(tabla,columna)
    WHERE EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1]
      JOIN pg_attribute b ON b.attrelid=k.confrelid AND b.attnum=k.confkey[1]
      WHERE k.contype='f' AND k.conrelid=to_regclass('public.'||v.tabla)
        AND k.confrelid='public.usuarios_identidades_historicas'::regclass
        AND cardinality(k.conkey)=1 AND cardinality(k.confkey)=1
        AND a.attname=v.columna AND b.attname='cuenta_id' AND k.confdeltype='r' AND k.convalidated)) <> 6 THEN
    RAISE EXCEPTION 'CONSERVACION_FK_NO_ACREDITADA';
  END IF;
  IF EXISTS(SELECT 1 FROM public.cuentas_documentos d
    LEFT JOIN storage.objects s ON s.bucket_id=d.bucket_id AND s.name=d.storage_path
    WHERE (d.cuenta_id=u.id OR d.creado_por=u.id) AND
      (d.estado_reserva IS DISTINCT FROM 'disponible' OR
       public.cuentas_documentos_ruta_certificada_v1(to_jsonb(d)) IS DISTINCT FROM true OR
       s.id IS DISTINCT FROM d.storage_object_id OR
       s.version IS DISTINCT FROM d.storage_version OR
       (CASE WHEN d.propiedad_institucional THEN (s.owner_id IS NOT NULL OR s.owner IS NOT NULL)
        ELSE s.owner_id IS DISTINCT FROM d.creado_por::text END) OR
       (s.metadata->'size') IS DISTINCT FROM to_jsonb(d.tamano_bytes_verificado) OR
       (s.metadata->>'mimetype') IS DISTINCT FROM d.mime_type_verificado OR
       d.sha256_verificado IS NULL OR d.sha256_verificado !~ '^[0-9a-f]{64}$' OR
       d.cuenta_nombre_snapshot IS NULL OR d.creado_por_nombre_snapshot IS NULL)) THEN
    RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_NO_ACREDITADA';
  END IF;
  ledger := public.usuarios_trabajadores_certificar_ledger_v1(u.id,u.trabajador_id);
  IF ledger IS NULL OR jsonb_typeof(ledger) <> 'object' OR ledger='{}'::jsonb THEN
    RAISE EXCEPTION 'CONSERVACION_LEDGER_NO_ACREDITADO';
  END IF;
  -- Lista cerrada de tablas acreditadas; nunca identificadores del navegador.
  FOR r IN SELECT * FROM (VALUES
    ('identidad','public','usuarios'), ('identidad','public','usuarios_identidades_historicas'),
    ('identidad','public','trabajadores'),
    ('documentos','public','cuentas_documentos'), ('documentos','public','cuentas_documentos_retiros'),
    ('documentos','public','trabajadores_documentos'), ('documentos','public','prevencion_documentos'),
    ('storage','storage','objects'), ('storage','storage','buckets'),
    ('trabajos','public','tareas'), ('trabajos','public','mantenciones'),
    ('trabajos','public','tareas_pendientes'), ('trabajos','public','tareas_pendientes_asignaciones'),
    ('trabajos','public','tareas_pendientes_operaciones'), ('trabajos','public','mantenciones_operativas'),
    ('trabajos','public','mantenciones_operativas_responsables'), ('trabajos','public','mantenciones_reactivas'),
    ('trabajos','public','mantencion_historial'), ('trabajos','public','mantencion_historial_anulaciones'),
    ('trabajos','public','mantenciones_operativas_anulaciones'),
    ('auditorias','public','usuarios_gestion_auditoria'), ('auditorias','public','del_registro_eliminaciones'),
    ('auditorias','public','usuarios_eliminaciones_operaciones'),
    ('auditorias','public','guia_contenido_auditoria'), ('auditorias','public','inventario_catalogo_auditoria'),
    ('auditorias','public','inventario_entradas_formatos'), ('auditorias','public','inventario_movimientos'),
    ('auditorias','public','inventario_movimientos_anulaciones'), ('auditorias','public','inventario_productos'),
    ('auditorias','public','bodegas_inventariados'), ('auditorias','public','jardineria_contenido_auditoria'),
    ('auditorias','public','prevencion_gantt_contenido_auditoria'),
    ('delegaciones','public','administraciones_temporales'),
    ('operativas','public','solicitudes_reactivas'), ('operativas','public','solicitudes_reactivas_avisos'),
    ('operativas','public','solicitudes_reactivas_avisos_estado'),
    ('operativas','public','solicitudes_notificaciones_revision'),
    ('operativas','public','solicitudes_reactivas_eliminaciones_auditoria'),
    ('operativas','public','solicitudes_reactivas_eventos'), ('operativas','public','alertas'),
    ('operativas','public','usuarios_correos_verificados'), ('operativas','public','usuarios_sesion_cambios')
  ) AS v(categoria,esquema,tabla) ORDER BY categoria,esquema,tabla LOOP
    -- Excluir SOLO la propia operación evita que guardar/renovar reauth o certificado invalide su huella.
    -- Su intención completa está vinculada por el adaptador y por el fingerprint original.
    EXECUTE format('SELECT count(*),coalesce(sum(octet_length(j)),0),coalesce(string_agg(encode(sha256(convert_to(j,''UTF8'')),''hex''),'''' ORDER BY j),'''') FROM (SELECT to_jsonb(t)::text AS j FROM %I.%I t WHERE ($1 IS NULL OR (to_jsonb(t)->>''id'') IS DISTINCT FROM $1) LIMIT 10001) s',r.esquema,r.tabla)
      INTO n,bytes,digest_text USING CASE WHEN r.tabla='usuarios_eliminaciones_operaciones' THEN o.id::text ELSE NULL END;
    IF n > 10000 OR bytes > 16777216 THEN RAISE EXCEPTION 'CONSERVACION_LIMITE_SUPERADO'; END IF;
    categoria := r.categoria;
    detalle := coalesce(categorias->categoria,'{"filas":0,"tablas":{}}'::jsonb);
    detalle := jsonb_set(detalle,'{filas}',to_jsonb((detalle->>'filas')::bigint+n));
    detalle := jsonb_set(detalle,ARRAY['tablas',r.esquema||'.'||r.tabla],
      jsonb_build_object('filas',n,'sha256',encode(sha256(convert_to(digest_text,'UTF8')),'hex')));
    categorias := jsonb_set(categorias,ARRAY[categoria],detalle);
  END LOOP;
  -- Huella de estructura y seguridad; sin devolver cuerpos, ACL ni políticas al cliente.
  SELECT encode(sha256(convert_to(coalesce(jsonb_agg(j ORDER BY j::text),'[]'::jsonb)::text,'UTF8')),'hex') INTO catalogo
    FROM (
      SELECT jsonb_build_array('FK',oid,pg_get_constraintdef(oid),convalidated) j FROM pg_constraint WHERE contype='f'
      UNION ALL SELECT jsonb_build_array('TRIGGER',oid,pg_get_triggerdef(oid),tgenabled) FROM pg_trigger WHERE NOT tgisinternal
      UNION ALL SELECT jsonb_build_array('POLICY',oid,to_jsonb(p)) FROM pg_policy p
      UNION ALL SELECT jsonb_build_array('REL',c.oid,c.relrowsecurity,c.relforcerowsecurity,c.relacl,
          (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped))
        FROM pg_class c WHERE c.relnamespace IN ('public'::regnamespace,'storage'::regnamespace)
      UNION ALL SELECT jsonb_build_array('FUNC',p.oid,p.proacl,md5(pg_get_functiondef(p.oid)))
        FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p')
    ) estructura;
  FOR categoria,detalle IN SELECT key,value FROM jsonb_each(categorias) LOOP
    categorias := jsonb_set(categorias,ARRAY[categoria],jsonb_build_object('filas',(detalle->>'filas')::bigint,
      'sha256',encode(sha256(convert_to((detalle->'tablas')::text,'UTF8')),'hex')));
  END LOOP;
  -- Solo metadatos técnicos originales. La neutralización NO se ejecuta en esta etapa.
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'owner',owner,'owner_id',owner_id) ORDER BY id),'[]'::jsonb)
    INTO propietarios FROM storage.objects WHERE owner=u.id OR owner_id=u.id::text;

  IF propietarios IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'MIGRACION_INSTITUCIONAL_REQUERIDA';
  END IF;
  RETURN jsonb_build_object('version',1,'vinculo',jsonb_build_object('operacion_id',o.id,'actor_id',o.actor_id,
    'objetivo_id',u.id,'request_id',o.dependencias_resumen->'paso191'->>'request_id',
    'fingerprint',o.dependencias_resumen->'paso191'->>'fingerprint'),
    'identidad_integra',true,'documentos_integros',true,'fk_preservadas',true,'auth_presente',true,'delegaciones_cerradas',true,'ledger_laboral',ledger,
    'catalogo_sha256',catalogo,'categorias',categorias||jsonb_build_object('contratos',jsonb_build_object('filas',1,'sha256',catalogo)),
    'propietarios_originales',propietarios,'archivos_verificados',false,'propiedad_neutralizada',false);
END;
$certificate21$;
ALTER FUNCTION public.usuario_eliminacion_conservacion_previa_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.usuario_eliminacion_conservacion_previa_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Inmutabilidad de la reserva documental/propiedad técnica: ni refresco ni borrado silencioso.
-- También bloquea SQL directo de inicio del flujo nuevo, además del bloqueo del adaptador.

-- PASO 198: clasificación estructural privada. No autoriza inicio ni cambio de estado.
-- El servidor verifica SHA-256/cuerpo API; SQL protege el ancla previa y el append posterior.
CREATE FUNCTION public.usuario_eliminacion_fisica_transicion_v1(p_old jsonb,p_new jsonb)
RETURNS text LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp
AS $forma198$
DECLARE a jsonb; b jsonb; c jsonb; pre jsonb; post jsonb; fase text; x jsonb; total numeric:=0;
BEGIN
  IF jsonb_typeof(p_old) IS DISTINCT FROM 'object' OR jsonb_typeof(p_new) IS DISTINCT FROM 'object' OR
     (p_new - ARRAY['updated_at','dependencias_resumen']::text[]) IS DISTINCT FROM (p_old - ARRAY['updated_at','dependencias_resumen']::text[]) OR
     jsonb_typeof(p_old->'updated_at') IS DISTINCT FROM 'string' OR
     jsonb_typeof(p_new->'updated_at') IS DISTINCT FROM 'string' OR
     (p_new->>'updated_at')::timestamptz < (p_old->>'updated_at')::timestamptz OR
     ((p_new->'dependencias_resumen') - 'conservacion_fisica_v1'::text) IS DISTINCT FROM ((p_old->'dependencias_resumen') - 'conservacion_fisica_v1'::text)
THEN RETURN NULL; END IF;
  a:=p_old->'dependencias_resumen'->'conservacion_fisica_v1';
  b:=p_new->'dependencias_resumen'->'conservacion_fisica_v1';
  c:=p_old->'dependencias_resumen'->'conservacion_previa_v1';
  IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR b->'version' IS DISTINCT FROM '1'::jsonb OR
     b->'habilita_auth' IS DISTINCT FROM 'false'::jsonb OR c IS NULL OR
     c->'habilita_auth' IS DISTINCT FROM 'false'::jsonb OR
     coalesce(c->'vinculo'->>'request_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
     coalesce(c->'vinculo'->>'fingerprint','') !~ '^[0-9a-f]{64}$' OR
     c->'vinculo'->>'operacion_id' IS DISTINCT FROM p_old->>'id' OR
     c->'vinculo'->>'actor_id' IS DISTINCT FROM p_old->>'actor_id' OR
     c->'vinculo'->>'objetivo_id' IS DISTINCT FROM p_old->>'objetivo_id' OR
     c->'vinculo'->>'request_id' IS DISTINCT FROM p_old->'dependencias_resumen'->'paso191'->>'request_id' OR
     c->'vinculo'->>'fingerprint' IS DISTINCT FROM p_old->'dependencias_resumen'->'paso191'->>'fingerprint' OR
     coalesce(c->>'sha256','') !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  IF a IS NULL THEN
    IF p_old->>'estado' IS DISTINCT FROM 'PREPARADA' OR p_old->'intentos_auth' IS DISTINCT FROM '0'::jsonb OR
       (b-ARRAY['version','habilita_auth','antes'])<>'{}'::jsonb THEN RETURN NULL; END IF;
    fase:='ANTES';pre:=b->'antes';
  ELSE
    IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR a->'version' IS DISTINCT FROM '1'::jsonb OR
       a->'habilita_auth' IS DISTINCT FROM 'false'::jsonb OR a ? 'despues' OR
       (a-ARRAY['version','habilita_auth','antes'])<>'{}'::jsonb OR
       (b-'despues') IS DISTINCT FROM a OR NOT (b ? 'despues') OR
       p_old->>'estado' NOT IN ('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION','COMPLETADA') OR
       p_old->'intentos_auth' IS DISTINCT FROM '1'::jsonb THEN RETURN NULL; END IF;
    fase:='DESPUES';pre:=a->'antes';post:=b->'despues';
  END IF;
  IF jsonb_typeof(pre) IS DISTINCT FROM 'object' OR pre->'version' IS DISTINCT FROM '1'::jsonb OR
     pre->>'fase' IS DISTINCT FROM 'antes' OR pre->'habilita_auth' IS DISTINCT FROM 'false'::jsonb OR
     pre->'archivos_verificados' IS DISTINCT FROM 'false'::jsonb OR pre->'vinculo' IS DISTINCT FROM c->'vinculo' OR
     pre->>'certificado_sha256' IS DISTINCT FROM c->>'sha256' OR
     coalesce(pre->>'inventario_sha256','') !~ '^[0-9a-f]{64}$' OR coalesce(pre->>'sha256','') !~ '^[0-9a-f]{64}$' OR
     (pre-ARRAY['version','fase','habilita_auth','archivos_verificados','vinculo','certificado_sha256','inventario_sha256','sha256','objetos'])<>'{}'::jsonb OR
     jsonb_typeof(pre->'objetos') IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
  IF jsonb_array_length(pre->'objetos')>128 OR
     (SELECT count(*)<>count(DISTINCT elementos.x->>'id') OR count(*)<>count(DISTINCT (elementos.x->>'bucket_id',elementos.x->>'storage_path'))
      FROM jsonb_array_elements(pre->'objetos') AS elementos(x)) THEN RETURN NULL; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(pre->'objetos') LOOP
    IF coalesce(x->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
       coalesce(x->>'bucket_id','') NOT IN ('documentos-cuentas','documentos-trabajadores','documentos-prevencionista') OR
       jsonb_typeof(x->'storage_path') IS DISTINCT FROM 'string' OR
       jsonb_typeof(x->'version') IS DISTINCT FROM 'string' OR
       nullif(x->>'storage_path','') IS NULL OR nullif(x->>'version','') IS NULL OR
       length(x->>'storage_path')>1024 OR position(chr(92) IN (x->>'storage_path'))>0 OR
       EXISTS(SELECT 1 FROM unnest(string_to_array(x->>'storage_path','/')) AS segmentos(segmento) WHERE segmento IN ('','.','..')) OR
       coalesce(x->>'sha256','') !~ '^[0-9a-f]{64}$' OR
       jsonb_typeof(x->'tamano_bytes') IS DISTINCT FROM 'number' OR
       (x-ARRAY['id','bucket_id','storage_path','version','tamano_bytes','sha256'])<>'{}'::jsonb THEN RETURN NULL; END IF;
    IF (x->>'tamano_bytes')::numeric<0 OR (x->>'tamano_bytes')::numeric>16777216 OR
       trunc((x->>'tamano_bytes')::numeric)<>(x->>'tamano_bytes')::numeric THEN RETURN NULL; END IF;
    total:=total+(x->>'tamano_bytes')::numeric;
  END LOOP;
  IF total>67108864 THEN RETURN NULL; END IF;
  IF fase='DESPUES' AND (jsonb_typeof(post) IS DISTINCT FROM 'object' OR
     post->'version' IS DISTINCT FROM '1'::jsonb OR post->>'fase' IS DISTINCT FROM 'despues' OR
     post->'habilita_auth' IS DISTINCT FROM 'false'::jsonb OR post->'archivos_verificados' IS DISTINCT FROM 'true'::jsonb OR
     post->'vinculo' IS DISTINCT FROM pre->'vinculo' OR post->>'certificado_sha256' IS DISTINCT FROM pre->>'certificado_sha256' OR
     post->>'inventario_sha256' IS DISTINCT FROM pre->>'inventario_sha256' OR post->'objetos' IS DISTINCT FROM pre->'objetos' OR
     coalesce(post->>'sha256','') !~ '^[0-9a-f]{64}$' OR
     (post-ARRAY['version','fase','habilita_auth','archivos_verificados','vinculo','certificado_sha256','inventario_sha256','sha256','objetos'])<>'{}'::jsonb) THEN RETURN NULL; END IF;
  RETURN fase;
END;
$forma198$;
ALTER FUNCTION public.usuario_eliminacion_fisica_transicion_v1(jsonb,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.usuario_eliminacion_fisica_transicion_v1(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.usuario_eliminacion_guard_fisica_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp SET row_security=off
AS $guarda198$
DECLARE a jsonb; b jsonb; fase text; c jsonb; claims jsonb;
BEGIN
  a:=OLD.dependencias_resumen->'conservacion_fisica_v1';
  IF TG_OP='DELETE' THEN
    IF a IS NOT NULL THEN RAISE EXCEPTION 'EVIDENCIA_FISICA_INMUTABLE'; END IF;
    RETURN OLD;
  END IF;
  b:=NEW.dependencias_resumen->'conservacion_fisica_v1';
  IF a IS NOT NULL AND (a->'antes' IS DISTINCT FROM b->'antes' OR
      (a ? 'despues' AND a->'despues' IS DISTINCT FROM b->'despues')) THEN
    RAISE EXCEPTION 'EVIDENCIA_FISICA_INMUTABLE';
  END IF;
  IF a IS NOT DISTINCT FROM b THEN RETURN NEW; END IF;
  fase:=public.usuario_eliminacion_fisica_transicion_v1(to_jsonb(OLD),to_jsonb(NEW));
  claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
  IF fase IS NULL OR current_user<>'postgres' OR session_user<>'postgres' OR
     auth.uid() IS DISTINCT FROM OLD.actor_id OR auth.role() IS DISTINCT FROM 'authenticated' OR
     public.es_administrador_permanente_actual() IS DISTINCT FROM true OR
     coalesce(claims->>'session_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'EVIDENCIA_FISICA_TRANSICION_NO_AUTORIZADA';
  END IF;
  c:=OLD.dependencias_resumen->'conservacion_previa_v1';
  IF fase='ANTES' THEN
    IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.objetivo_id) OR
       NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=OLD.objetivo_id AND estado IS TRUE) THEN
      RAISE EXCEPTION 'EVIDENCIA_FISICA_IDENTIDAD_CAMBIO';
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.objetivo_id) OR
       EXISTS(SELECT 1 FROM public.usuarios WHERE id=OLD.objetivo_id) OR
       NOT EXISTS(SELECT 1 FROM public.usuarios_identidades_historicas h WHERE h.cuenta_id=OLD.objetivo_id
         AND h.nombre_snapshot IS NOT DISTINCT FROM OLD.objetivo_nombre_snapshot
         AND h.trabajador_id IS NOT DISTINCT FROM (c->'evidencia'->'ledger_laboral'->>'trabajador_actual')::uuid) THEN
      RAISE EXCEPTION 'EVIDENCIA_FISICA_AUSENCIA_NO_ACREDITADA';
    END IF;
    IF OLD.estado='COMPLETADA' AND NOT EXISTS(SELECT 1 FROM public.del_registro_eliminaciones r
      WHERE r.id=OLD.auditoria_id AND r.entidad_id=OLD.objetivo_id AND r.ejecutado_por=OLD.actor_id
        AND r.entidad_tipo='usuario' AND r.accion='ELIMINACION_PERMANENTE'
        AND r.modulo='Administración de Usuarios' AND r.entidad_referencia=OLD.objetivo_nombre_snapshot
        AND r.ejecutado_por_nombre_snapshot=OLD.actor_nombre_snapshot AND r.motivo=OLD.motivo
        AND r.dependencias_resumen->>'operacion_id'=OLD.id::text) THEN
      RAISE EXCEPTION 'EVIDENCIA_FISICA_AUDITORIA_NO_ACREDITADA';
    END IF;
  END IF;
  RETURN NEW;
END;
$guarda198$;
ALTER FUNCTION public.usuario_eliminacion_guard_fisica_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.usuario_eliminacion_guard_fisica_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_conservacion_fisica BEFORE UPDATE OR DELETE ON public.usuarios_eliminaciones_operaciones
FOR EACH ROW EXECUTE FUNCTION public.usuario_eliminacion_guard_fisica_v1();

-- Pruebas de forma sin INSERT/UPDATE/DELETE ni cuentas reales. Se ejecutan solo en el ensayo manual.
DO $pruebas198$
DECLARE o jsonb; n jsonb; pre jsonb; post jsonb; v jsonb;
BEGIN
  v:=jsonb_build_object('operacion_id','11111111-1111-4111-8111-111111111111','actor_id','22222222-2222-4222-8222-222222222222',
    'objetivo_id','33333333-3333-4333-8333-333333333333','request_id','44444444-4444-4444-8444-444444444444','fingerprint',repeat('f',64));
  pre:=jsonb_build_object('version',1,'fase','antes','habilita_auth',false,'archivos_verificados',false,'vinculo',v,
    'certificado_sha256',repeat('a',64),'inventario_sha256',repeat('b',64),'sha256',repeat('c',64),'objetos','[]'::jsonb);
  o:=jsonb_build_object('id',v->'operacion_id','actor_id',v->'actor_id','objetivo_id',v->'objetivo_id','estado','PREPARADA',
    'intentos_auth',0,'updated_at','2026-11-14T00:00:00Z','dependencias_resumen',jsonb_build_object(
      'paso191',jsonb_build_object('request_id',v->'request_id','fingerprint',v->'fingerprint'),
      'conservacion_previa_v1',jsonb_build_object('vinculo',v,'sha256',repeat('a',64),'habilita_auth',false)));
  n:=jsonb_set(o,'{dependencias_resumen,conservacion_fisica_v1}',jsonb_build_object('version',1,'habilita_auth',false,'antes',pre));
  IF public.usuario_eliminacion_fisica_transicion_v1(o,n) IS DISTINCT FROM 'ANTES' THEN RAISE EXCEPTION 'PRUEBA198_ANTES'; END IF;
  o:=jsonb_set(jsonb_set(n,'{estado}','"AUTH_ELIMINADA"'),'{intentos_auth}','1');
  post:=pre||jsonb_build_object('fase','despues','archivos_verificados',true,'sha256',repeat('d',64));
  n:=jsonb_set(o,'{dependencias_resumen,conservacion_fisica_v1,despues}',post);
  IF public.usuario_eliminacion_fisica_transicion_v1(o,n) IS DISTINCT FROM 'DESPUES' THEN RAISE EXCEPTION 'PRUEBA198_DESPUES'; END IF;
  IF public.usuario_eliminacion_fisica_transicion_v1(o,jsonb_set(n,'{dependencias_resumen,conservacion_fisica_v1,antes,sha256}',to_jsonb(repeat('e',64)))) IS NOT NULL THEN
    RAISE EXCEPTION 'PRUEBA198_PREVIA_ALTERADA'; END IF;
  IF public.usuario_eliminacion_fisica_transicion_v1(o,jsonb_set(n,'{estado}','"COMPLETADA"')) IS NOT NULL THEN RAISE EXCEPTION 'PRUEBA198_ESTADO'; END IF;
  IF public.usuario_eliminacion_fisica_transicion_v1(o,jsonb_set(n,'{dependencias_resumen,conservacion_fisica_v1,despues,habilita_auth}','true')) IS NOT NULL THEN
    RAISE EXCEPTION 'PRUEBA198_AUTH'; END IF;
  IF public.usuario_eliminacion_fisica_transicion_v1(o,jsonb_set(n,'{dependencias_resumen,conservacion_fisica_v1,despues,inventario_sha256}',to_jsonb(repeat('e',64)))) IS NOT NULL THEN
    RAISE EXCEPTION 'PRUEBA198_INVENTARIO'; END IF;
  IF public.usuario_eliminacion_fisica_transicion_v1(n,n) IS NOT NULL THEN RAISE EXCEPTION 'PRUEBA198_REESCRITURA'; END IF;
  IF public.usuario_eliminacion_fisica_transicion_v1(o,jsonb_set(n,'{actor_id}',to_jsonb('55555555-5555-4555-8555-555555555555'::text))) IS NOT NULL THEN
    RAISE EXCEPTION 'PRUEBA198_ACTOR'; END IF;
  IF public.usuario_eliminacion_fisica_transicion_v1(o,jsonb_set(n,'{dependencias_resumen,paso191,request_id}',to_jsonb('55555555-5555-4555-8555-555555555555'::text))) IS NOT NULL THEN
    RAISE EXCEPTION 'PRUEBA198_SOLICITUD'; END IF;
  IF public.usuario_eliminacion_fisica_transicion_v1(o,n#-'{dependencias_resumen,conservacion_fisica_v1,despues,objetos}') IS NOT NULL THEN
    RAISE EXCEPTION 'PRUEBA198_EVIDENCIA_AUSENTE'; END IF;
  pre:=jsonb_set(pre,'{objetos}',jsonb_build_array(jsonb_build_object('id','55555555-5555-4555-8555-555555555555',
    'bucket_id','documentos-cuentas','storage_path','cuentas/prueba/objeto','version','version-prueba','tamano_bytes',3,'sha256',repeat('a',64))));
  o:=jsonb_set(o,'{dependencias_resumen,conservacion_fisica_v1,antes}',pre);
  post:=pre||jsonb_build_object('fase','despues','archivos_verificados',true,'sha256',repeat('d',64));
  n:=jsonb_set(o,'{dependencias_resumen,conservacion_fisica_v1,despues}',post);
  IF public.usuario_eliminacion_fisica_transicion_v1(o,n) IS DISTINCT FROM 'DESPUES' THEN RAISE EXCEPTION 'PRUEBA198_ARCHIVO_IDENTICO'; END IF;
  IF public.usuario_eliminacion_fisica_transicion_v1(o,jsonb_set(n,'{dependencias_resumen,conservacion_fisica_v1,despues,objetos,0,sha256}',to_jsonb(repeat('b',64)))) IS NOT NULL THEN
    RAISE EXCEPTION 'PRUEBA198_ARCHIVO_ALTERADO'; END IF;
  IF public.usuario_eliminacion_fisica_transicion_v1(o,jsonb_set(n,'{intentos_auth}','2')) IS NOT NULL THEN RAISE EXCEPTION 'PRUEBA198_INTENTOS'; END IF;

END;
$pruebas198$;

CREATE FUNCTION public.usuario_eliminacion_guard_conservacion_previa_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $immutable21$
DECLARE c jsonb;
BEGIN
  IF OLD.dependencias_resumen ? 'conservacion_previa_v1' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CONSERVACION_PREVIA_INMUTABLE'; END IF;
    IF NEW.dependencias_resumen->'conservacion_previa_v1'
        IS DISTINCT FROM OLD.dependencias_resumen->'conservacion_previa_v1' THEN
      RAISE EXCEPTION 'CONSERVACION_PREVIA_INMUTABLE';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.dependencias_resumen ? 'conservacion_previa_v1' THEN
    c := NEW.dependencias_resumen->'conservacion_previa_v1';
    IF c->>'version' IS DISTINCT FROM '1' OR c->'habilita_auth' IS DISTINCT FROM 'false'::jsonb OR
       c->>'alcance' IS DISTINCT FROM 'EVIDENCIA_PREVIA_NO_AUTORIZANTE' OR
       c->'vinculo'->>'operacion_id' IS DISTINCT FROM NEW.id::text OR
       c->'vinculo'->>'actor_id' IS DISTINCT FROM NEW.actor_id::text OR
       c->'vinculo'->>'objetivo_id' IS DISTINCT FROM NEW.objetivo_id::text OR
       c->'vinculo'->>'request_id' IS DISTINCT FROM NEW.dependencias_resumen->'paso191'->>'request_id' OR
       c->'vinculo'->>'fingerprint' IS DISTINCT FROM NEW.dependencias_resumen->'paso191'->>'fingerprint' THEN
      RAISE EXCEPTION 'CONSERVACION_PREVIA_NO_VINCULADA';
    END IF;
    IF (NEW.estado IS DISTINCT FROM 'PREPARADA' OR NEW.intentos_auth IS DISTINCT FROM 0) AND
       public.usuario_eliminacion_fisica_transicion_v1(to_jsonb(OLD),to_jsonb(NEW)) IS DISTINCT FROM 'DESPUES' THEN
      RAISE EXCEPTION 'CONSERVACION_INTEGRAL_NO_HABILITADA';
    END IF;
  END IF;
  RETURN NEW;
END;
$immutable21$;
ALTER FUNCTION public.usuario_eliminacion_guard_conservacion_previa_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.usuario_eliminacion_guard_conservacion_previa_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_usuario_eliminacion_conservacion_previa
BEFORE UPDATE OR DELETE ON public.usuarios_eliminaciones_operaciones
FOR EACH ROW EXECUTE FUNCTION public.usuario_eliminacion_guard_conservacion_previa_v1();

DO $postflight21$
BEGIN
  IF has_function_privilege('authenticated','public.usuario_eliminacion_conservacion_previa_v1(uuid)','EXECUTE') OR
     has_function_privilege('anon','public.usuario_eliminacion_conservacion_previa_v1(uuid)','EXECUTE') OR
     has_function_privilege('service_role','public.usuario_eliminacion_conservacion_previa_v1(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'CERTIFICADO_API_NO_ADMITIDO';
  END IF;
END;
$postflight21$;

-- TRAMO DEL-FIX-22
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $preflight22$
BEGIN
  IF current_user <> 'postgres' OR
     to_regprocedure('public.usuario_eliminacion_conservacion_previa_v1(uuid)') IS NULL OR
     to_regprocedure('public.usuario_eliminacion_conservar_storage_v1(uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_PREFLIGHT';
  END IF;
  -- No invalidar silenciosamente un certificado durable creado con el catálogo anterior.
  IF EXISTS(SELECT 1 FROM public.usuarios_eliminaciones_operaciones
    WHERE dependencias_resumen ? 'conservacion_previa_v1') THEN
    RAISE EXCEPTION 'CERTIFICADOS_PREVIOS_REQUIEREN_REVISION_VERSIONADA';
  END IF;
  IF md5(pg_get_functiondef('public.cuentas_documentos_barrera_fila_v1()'::regprocedure))
      IS DISTINCT FROM '86be85af4d5fdf402681657b9f781613' THEN
    RAISE EXCEPTION 'BARRERA_DOCUMENTAL_DISTINTA';
  END IF;
END;
$preflight22$;

CREATE FUNCTION public.usuario_eliminacion_storage_verificar_v1(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $verify22$
DECLARE o public.usuarios_eliminaciones_operaciones%ROWTYPE; c jsonb; d jsonb; x jsonb; s jsonb; ids jsonb;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' OR auth.uid() IS NULL OR
     public.es_administrador_permanente_actual() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_NO_AUTORIZADA';
  END IF;
  SELECT * INTO STRICT o FROM public.usuarios_eliminaciones_operaciones WHERE id=p_operacion_id;
  c:=o.dependencias_resumen->'conservacion_previa_v1'; d:=o.dependencias_resumen->'conservacion_documental_v1';
  IF o.actor_id IS DISTINCT FROM auth.uid() OR o.estado <> 'PREPARADA' OR o.intentos_auth <> 0 OR
     c IS NULL OR d IS NULL OR d->>'version' IS DISTINCT FROM '1' OR
     d->'habilita_auth' IS DISTINCT FROM 'false'::jsonb OR d->'archivos_verificados' IS DISTINCT FROM 'false'::jsonb OR
     d->>'certificado_sha256' IS DISTINCT FROM c->>'sha256' OR
     d->'vinculo' IS DISTINCT FROM c->'vinculo' OR
     d->'propiedad_neutralizada' IS DISTINCT FROM 'true'::jsonb OR
     jsonb_typeof(d->'objetos') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'documentos') IS DISTINCT FROM 'array' OR
     jsonb_array_length(d->'documentos')>10000 THEN
    RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_RECIBO_INVALIDO';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',elementos.valor->'id','owner',elementos.valor->'owner','owner_id',elementos.valor->'owner_id') ORDER BY elementos.valor->>'id'),'[]'::jsonb)
    INTO ids FROM jsonb_array_elements(d->'objetos') AS elementos(valor) WHERE elementos.valor->'neutralizado'='true'::jsonb;
  IF ids IS DISTINCT FROM (SELECT coalesce(jsonb_agg(elementos.valor ORDER BY elementos.valor->>'id'),'[]'::jsonb)
      FROM jsonb_array_elements(c->'evidencia'->'propietarios_originales') AS elementos(valor)) OR
     (SELECT count(*)<>count(DISTINCT elementos.valor->>'id') FROM jsonb_array_elements(d->'objetos') AS elementos(valor)) THEN
    RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_OBJETOS_CAMBIO';
  END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(d->'objetos') LOOP
    SELECT to_jsonb(t) INTO STRICT s FROM storage.objects t WHERE id=(x->>'id')::uuid;
    IF x->'neutralizado' IS DISTINCT FROM 'false'::jsonb OR
       s->'owner' IS DISTINCT FROM (CASE WHEN x->'neutralizado'='true'::jsonb THEN 'null'::jsonb ELSE x->'owner' END) OR
s->'owner_id' IS DISTINCT FROM (CASE WHEN x->'neutralizado'='true'::jsonb THEN 'null'::jsonb ELSE x->'owner_id' END) OR
       s->>'bucket_id' IS DISTINCT FROM x->>'bucket_id' OR s->>'name' IS DISTINCT FROM x->>'name' OR
       s->>'version' IS DISTINCT FROM x->>'version' OR
       s->'updated_at' IS DISTINCT FROM x->'updated_at_neutral' OR
       encode(sha256(convert_to((s-'owner'-'owner_id'-'updated_at')::text,'UTF8')),'hex')
         IS DISTINCT FROM x->>'sha256_inmutable' THEN
      RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_OBJETO_CAMBIO';
    END IF;
  END LOOP;
  IF (SELECT count(*)<>count(DISTINCT (elementos.valor->>'tabla',elementos.valor->>'id')) FROM jsonb_array_elements(d->'documentos') AS elementos(valor)) THEN
    RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_RECIBO_INVALIDO';
  END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(d->'documentos') LOOP
    IF x->>'tabla' NOT IN ('cuentas_documentos','trabajadores_documentos','prevencion_documentos') THEN
      RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_RELACION_NO_ADMITIDA';
    END IF;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE to_jsonb(t)->>''id''=$1',x->>'tabla')
      INTO STRICT s USING x->>'id';
    IF encode(sha256(convert_to(s::text,'UTF8')),'hex') IS DISTINCT FROM x->>'sha256' THEN
      RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_FILA_CAMBIO';
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM storage.objects WHERE owner=o.objetivo_id OR owner_id=o.objetivo_id::text) THEN
    RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_PROPIEDAD_NUEVA';
  END IF;
  RETURN jsonb_build_object('operacion_id',o.id,'objetos_neutralizados',(SELECT count(*) FROM jsonb_array_elements(d->'objetos') AS elementos(valor) WHERE elementos.valor->'neutralizado'='true'::jsonb),
    'documentos_conservados',true,'propiedad_neutralizada',true,'archivos_verificados',false,'habilita_auth',false);
END;
$verify22$;
ALTER FUNCTION public.usuario_eliminacion_storage_verificar_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.usuario_eliminacion_storage_verificar_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.usuario_eliminacion_conservar_storage_v1(p_operacion_id uuid,p_certificado_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp SET row_security=off
AS $neutral22$
DECLARE o public.usuarios_eliminaciones_operaciones%ROWTYPE; c jsonb; x jsonb; before_obj jsonb; after_obj jsonb;
  objetos jsonb:='[]'::jsonb; documentos jsonb:='[]'::jsonb; r record; recibo jsonb; instante timestamptz;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' OR auth.uid() IS NULL OR
     current_setting('transaction_isolation') <> 'read committed' OR
     public.es_administrador_permanente_actual() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_NO_AUTORIZADA';
  END IF;
  PERFORM pg_advisory_xact_lock(209,1);
  SELECT * INTO STRICT o FROM public.usuarios_eliminaciones_operaciones WHERE id=p_operacion_id FOR UPDATE;
  c:=o.dependencias_resumen->'conservacion_previa_v1';
  IF o.actor_id IS DISTINCT FROM auth.uid() OR o.actor_id=o.objetivo_id OR
     o.estado <> 'PREPARADA' OR o.intentos_auth <> 0 OR c IS NULL OR
     c->>'sha256' IS DISTINCT FROM p_certificado_sha256 OR c->'habilita_auth' IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_OPERACION_INVALIDA';
  END IF;
  IF o.dependencias_resumen ? 'conservacion_documental_v1' THEN
    RETURN public.usuario_eliminacion_storage_verificar_v1(o.id);
  END IF;
  -- Bloqueos breves, sin HTTP: certifican documentos sin cambiar Storage.
  LOCK TABLE public.cuentas_documentos,public.cuentas_documentos_retiros,
    public.trabajadores_documentos,public.prevencion_documentos IN SHARE MODE;
  -- Comprobar evidencia actual; esta función no escribe en storage.objects.
  IF public.usuario_eliminacion_conservacion_previa_v1(o.id) IS DISTINCT FROM c->'evidencia' THEN
    RAISE EXCEPTION 'CERTIFICADO_DESACTUALIZADO';
  END IF;
  IF EXISTS(SELECT 1 FROM public.cuentas_documentos_retiros r WHERE r.confirmado_en IS NULL) OR
     EXISTS(SELECT 1 FROM public.cuentas_documentos d WHERE d.migracion_institucional IS NOT NULL
       AND d.migracion_institucional->>'estado' IS DISTINCT FROM 'COMPLETADA') THEN
    RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_RETIRO_EN_CURSO';
  END IF;
  -- La propiedad personal debe resolverse previamente
  -- mediante la migracion institucional autorizada.
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE owner=o.objetivo_id
       OR owner_id=o.objetivo_id::text
  ) THEN
    RAISE EXCEPTION 'MIGRACION_INSTITUCIONAL_REQUERIDA';
  END IF;

  FOR r IN
    SELECT 'cuentas_documentos' tabla,to_jsonb(d) fila FROM public.cuentas_documentos d
      WHERE d.cuenta_id=o.objetivo_id OR d.creado_por=o.objetivo_id
    UNION ALL SELECT 'trabajadores_documentos',to_jsonb(d) FROM public.trabajadores_documentos d
      WHERE to_jsonb(d)->>'creado_por'=o.objetivo_id::text OR
        to_jsonb(d)->>'trabajador_id'=c->'evidencia'->'ledger_laboral'->>'trabajador_actual'
    UNION ALL SELECT 'prevencion_documentos',to_jsonb(d) FROM public.prevencion_documentos d
      WHERE to_jsonb(d)->>'creado_por'=o.objetivo_id::text
  LOOP
    documentos:=documentos||jsonb_build_array(jsonb_build_object('tabla',r.tabla,'id',r.fila->>'id',
      'sha256',encode(sha256(convert_to(r.fila::text,'UTF8')),'hex')));
    IF jsonb_array_length(documentos)>10000 THEN RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_LIMITE'; END IF;
    -- Proteger también el archivo de un documento del destinatario aunque pertenezca técnicamente a otro actor.
    -- En ese caso se conserva su propietario real y NO se neutraliza.
    SELECT to_jsonb(z) INTO STRICT before_obj FROM storage.objects z
      WHERE z.bucket_id=CASE r.tabla WHEN 'cuentas_documentos' THEN r.fila->>'bucket_id'
        WHEN 'trabajadores_documentos' THEN 'documentos-trabajadores' ELSE 'documentos-prevencionista' END
        AND z.name=r.fila->>'storage_path' FOR UPDATE;
    IF nullif(before_obj->>'version','') IS NULL THEN RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_VERSION_AUSENTE'; END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(objetos) AS e(valor) WHERE e.valor->>'id'=before_obj->>'id') THEN
      objetos:=objetos||jsonb_build_array(jsonb_build_object('neutralizado',false,
        'id',before_obj->'id','bucket_id',before_obj->'bucket_id','name',before_obj->'name','version',before_obj->'version',
        'owner',before_obj->'owner','owner_id',before_obj->'owner_id','updated_at',before_obj->'updated_at',
        'updated_at_neutral',before_obj->'updated_at',
        'sha256_inmutable',encode(sha256(convert_to((before_obj-'owner'-'owner_id'-'updated_at')::text,'UTF8')),'hex')));
      IF jsonb_array_length(objetos)>10000 THEN RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_LIMITE'; END IF;
    END IF;
  END LOOP;
  instante:=clock_timestamp();
  recibo:=jsonb_build_object('version',1,'vinculo',c->'vinculo','certificado_sha256',p_certificado_sha256,
    'objetos',objetos,'documentos',documentos,'registrado_en',instante,'propiedad_neutralizada',true,'archivos_verificados',false,'habilita_auth',false);
  UPDATE public.usuarios_eliminaciones_operaciones SET dependencias_resumen=dependencias_resumen||
    jsonb_build_object('conservacion_documental_v1',recibo),updated_at=instante
    WHERE id=o.id AND estado='PREPARADA' AND intentos_auth=0 AND NOT (dependencias_resumen ? 'conservacion_documental_v1');
  IF NOT FOUND THEN RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_CONFLICTO'; END IF;
  RETURN public.usuario_eliminacion_storage_verificar_v1(o.id);
END;
$neutral22$;
ALTER FUNCTION public.usuario_eliminacion_conservar_storage_v1(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.usuario_eliminacion_conservar_storage_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.usuario_eliminacion_guard_documentos_storage_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET row_security=off
AS $guard22$
DECLARE j jsonb; d jsonb;
BEGIN
  IF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='usuarios_eliminaciones_operaciones' THEN
    IF OLD.dependencias_resumen ? 'conservacion_documental_v1' THEN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_INMUTABLE'; END IF;
      IF NEW.dependencias_resumen->'conservacion_documental_v1'
        IS DISTINCT FROM OLD.dependencias_resumen->'conservacion_documental_v1' THEN
        RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_INMUTABLE';
      END IF;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF NEW.dependencias_resumen ? 'conservacion_documental_v1' THEN
      d:=NEW.dependencias_resumen->'conservacion_documental_v1';
      IF d->'vinculo' IS DISTINCT FROM NEW.dependencias_resumen->'conservacion_previa_v1'->'vinculo' OR
         d->>'certificado_sha256' IS DISTINCT FROM NEW.dependencias_resumen->'conservacion_previa_v1'->>'sha256' OR
         d->'habilita_auth' IS DISTINCT FROM 'false'::jsonb OR
         ((NEW.estado IS DISTINCT FROM 'PREPARADA' OR NEW.intentos_auth IS DISTINCT FROM 0) AND
          public.usuario_eliminacion_fisica_transicion_v1(to_jsonb(OLD),to_jsonb(NEW)) IS DISTINCT FROM 'DESPUES') THEN
        RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_NO_AUTORIZA_AUTH';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  j:=to_jsonb(OLD);
  IF TG_TABLE_SCHEMA='storage' AND TG_TABLE_NAME='objects' THEN
    IF EXISTS(SELECT 1 FROM public.usuarios_eliminaciones_operaciones o,
      LATERAL jsonb_array_elements(coalesce(o.dependencias_resumen->'conservacion_documental_v1'->'objetos','[]'::jsonb)) x
      WHERE x->>'id'=j->>'id'
        AND o.intentos_auth>0
        AND o.estado IN ('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION'))
      THEN RAISE EXCEPTION 'OBJETO_HISTORICO_INMUTABLE'; END IF;
  ELSIF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME IN ('cuentas_documentos','trabajadores_documentos','prevencion_documentos') THEN
    IF EXISTS(SELECT 1 FROM public.usuarios_eliminaciones_operaciones o,
      LATERAL jsonb_array_elements(coalesce(o.dependencias_resumen->'conservacion_documental_v1'->'documentos','[]'::jsonb)) x
      WHERE x->>'tabla'=TG_TABLE_NAME AND x->>'id'=j->>'id'
        AND o.intentos_auth>0
        AND o.estado IN ('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION')) THEN
      RAISE EXCEPTION 'DOCUMENTO_HISTORICO_INMUTABLE';
    END IF;
  ELSE RAISE EXCEPTION 'GUARDA_DOCUMENTAL_RELACION_NO_ADMITIDA';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$guard22$;
ALTER FUNCTION public.usuario_eliminacion_guard_documentos_storage_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.usuario_eliminacion_guard_documentos_storage_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_conservacion_documental_operacion BEFORE UPDATE OR DELETE ON public.usuarios_eliminaciones_operaciones
FOR EACH ROW EXECUTE FUNCTION public.usuario_eliminacion_guard_documentos_storage_v1();
CREATE TRIGGER zz_conservacion_documental_objeto BEFORE UPDATE OR DELETE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION public.usuario_eliminacion_guard_documentos_storage_v1();
CREATE TRIGGER zz_conservacion_documental_cuenta BEFORE UPDATE OR DELETE ON public.cuentas_documentos
FOR EACH ROW EXECUTE FUNCTION public.usuario_eliminacion_guard_documentos_storage_v1();
CREATE TRIGGER zz_conservacion_documental_trabajador BEFORE UPDATE OR DELETE ON public.trabajadores_documentos
FOR EACH ROW EXECUTE FUNCTION public.usuario_eliminacion_guard_documentos_storage_v1();
CREATE TRIGGER zz_conservacion_documental_prevencion BEFORE UPDATE OR DELETE ON public.prevencion_documentos
FOR EACH ROW EXECUTE FUNCTION public.usuario_eliminacion_guard_documentos_storage_v1();

-- Sustitución coordinada de la proyección del certificado previo, no de las barreras instaladas.


DO $postflight22$
BEGIN
  IF has_function_privilege('authenticated','public.usuario_eliminacion_conservar_storage_v1(uuid,text)','EXECUTE') OR
     has_function_privilege('anon','public.usuario_eliminacion_conservar_storage_v1(uuid,text)','EXECUTE') OR
     has_function_privilege('service_role','public.usuario_eliminacion_conservar_storage_v1(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_API_NO_ADMITIDA';
  END IF;
END;
$postflight22$;

-- PASO 356. V2 privado, sin activar Auth Delete.
DO $preflight356$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'usuario_eliminacion_%_v2') THEN
  RAISE EXCEPTION 'CONTRATO_V2_PREEXISTENTE_REQUIERE_REVISION'; END IF;
 IF (SELECT count(*) FROM pg_attribute WHERE attrelid='public.usuarios_sesion_cambios'::regclass AND attnum>0 AND NOT attisdropped)<>3 OR
    NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.usuarios_sesion_cambios'::regclass AND attname='usuario_id' AND atttypid='uuid'::regtype AND NOT attisdropped) OR
    NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.usuarios_sesion_cambios'::regclass AND attname='revision' AND atttypid IN('bigint'::regtype,'integer'::regtype) AND NOT attisdropped) OR
    NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.usuarios_sesion_cambios'::regclass AND attname='actualizado_en' AND atttypid='timestamptz'::regtype AND NOT attisdropped) THEN
   RAISE EXCEPTION 'CONTRATO_SESION_V2_DISTINTO'; END IF;
END;
$preflight356$;

CREATE FUNCTION public.usuario_eliminacion_v2_habilitada()
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS 'SELECT false';

CREATE FUNCTION public.usuario_eliminacion_contexto_v2(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $contexto356$
DECLARE o public.usuarios_eliminaciones_operaciones%ROWTYPE;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' OR auth.uid() IS NULL OR
    auth.role() IS DISTINCT FROM 'authenticated' OR current_setting('transaction_isolation')<>'read committed' OR
    current_setting('row_security')<>'off' OR public.es_administrador_permanente_actual() IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'CONTEXTO_V2_NO_AUTORIZADO';
 END IF;
 PERFORM pg_advisory_xact_lock(209,1);
 SELECT * INTO STRICT o FROM public.usuarios_eliminaciones_operaciones WHERE id=p_operacion_id FOR UPDATE;
 IF o.actor_id IS DISTINCT FROM auth.uid() OR o.objetivo_id=o.actor_id OR
    coalesce(o.dependencias_resumen->'paso191'->>'request_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
    coalesce(o.dependencias_resumen->'paso191'->>'fingerprint','') !~ '^[0-9a-f]{64}$' THEN
   RAISE EXCEPTION 'OPERACION_V2_NO_VINCULADA';
 END IF;
 RETURN to_jsonb(o);
END;
$contexto356$;

-- Lista cerrada: $1 cuenta,$2 ficha,$3 tareas,$4 solicitudes,$5 operativas,
-- $6 historiales,$7 mantenciones clásicas,$8 operación. Nunca SQL del navegador.
-- Resolver las columnas de autoría de TV desde sus contratos efectivos. No
-- presuponer actor_id: si no hay identidad UUID acreditable se bloquea el ensayo.
CREATE FUNCTION public.usuario_eliminacion_reactiva_relacionada_v2(p_id uuid,p_cuenta uuid,p_ficha uuid,p_solicitudes uuid[])
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $reactiva358$
 SELECT EXISTS(SELECT 1 FROM public.mantenciones_reactivas m WHERE m.id=p_id AND
   (m.creada_por=p_cuenta OR m.responsable_trabajador_id=p_ficha OR m.solicitud_id=ANY(p_solicitudes) OR
    EXISTS(SELECT 1 FROM public.mantenciones_reactivas_ciclos c WHERE c.mantencion_id=m.id AND c.responsable_trabajador_id=p_ficha) OR
    EXISTS(SELECT 1 FROM public.solicitudes_reactivas_eventos e WHERE e.mantencion_reactiva_id=m.id AND
      (e.actor_id=p_cuenta OR e.detalle->>'trabajador_anterior'=p_ficha::text OR e.detalle->>'trabajador_nuevo'=p_ficha::text))))
$reactiva358$;

CREATE FUNCTION public.usuario_eliminacion_predicado_tv_v2(p_auditoria boolean)
RETURNS text LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp
AS $tv358$
DECLARE aud text; directo text; vinculo text;
BEGIN
 SELECT string_agg(format('a.%I=$1',attname),' OR ' ORDER BY attname) INTO aud FROM pg_attribute a
 WHERE attrelid='public.televisores_habitaciones_auditoria'::regclass AND attnum>0 AND NOT attisdropped AND atttypid='uuid'::regtype AND
   (attname IN('actor_id','usuario_id','autor_id','registrado_por','creado_por','ejecutado_por') OR EXISTS(
     SELECT 1 FROM pg_constraint k WHERE k.conrelid=a.attrelid AND k.contype='f' AND a.attnum=ANY(k.conkey) AND
       k.confrelid IN('public.usuarios'::regclass,'public.usuarios_identidades_historicas'::regclass)));
 SELECT format('a.%I=t.id',a.attname) INTO vinculo FROM pg_attribute a WHERE
   a.attrelid='public.televisores_habitaciones_auditoria'::regclass AND a.attname='televisor_id' AND
   a.atttypid='uuid'::regtype AND NOT a.attisdropped;
 IF aud IS NULL OR vinculo IS NULL THEN RAISE EXCEPTION 'RELACION_TV_V2_NO_ACREDITADA'; END IF;
 IF p_auditoria THEN RETURN replace(aud,'a.','t.'); END IF;
 SELECT string_agg(format('t.%I=$1',attname),' OR ' ORDER BY attname) INTO directo FROM pg_attribute a
 WHERE attrelid='public.televisores_habitaciones'::regclass AND attnum>0 AND NOT attisdropped AND atttypid='uuid'::regtype AND
   attname IN('actor_id','usuario_id','autor_id','registrado_por','creado_por','actualizado_por','retirado_por');
 RETURN coalesce('('||directo||') OR ','')||'EXISTS(SELECT 1 FROM public.televisores_habitaciones_auditoria a WHERE '||vinculo||' AND ('||aud||'))';
END;
$tv358$;

CREATE FUNCTION public.usuario_eliminacion_relaciones_v2()
RETURNS TABLE(tabla text,predicado text) LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp
AS $relaciones356$
VALUES
 ('public.usuarios_identidades_historicas','t.cuenta_id=$1'),
 ('public.trabajadores','t.id=$2'),
 ('public.cuentas_documentos','t.cuenta_id=$1 OR t.creado_por=$1'),
 ('public.cuentas_documentos_retiros','t.cuenta_id=$1 OR t.propietario_id=$1 OR t.autorizado_por=$1 OR t.solicitado_por=$1 OR t.confirmado_por=$1 OR EXISTS(SELECT 1 FROM public.cuentas_documentos d WHERE d.id=t.documento_id AND (d.cuenta_id=$1 OR d.creado_por=$1))'),
 ('public.trabajadores_documentos','t.trabajador_id=$2 OR t.creado_por=$1'),
 ('public.prevencion_documentos','t.creado_por=$1'),
 ('storage.objects','t.owner=$1 OR t.owner_id=$1::text OR EXISTS(SELECT 1 FROM public.cuentas_documentos d WHERE d.bucket_id=t.bucket_id AND d.storage_path=t.name AND (d.cuenta_id=$1 OR d.creado_por=$1)) OR (t.bucket_id=''documentos-trabajadores'' AND EXISTS(SELECT 1 FROM public.trabajadores_documentos d WHERE d.storage_path=t.name AND (d.trabajador_id=$2 OR d.creado_por=$1))) OR (t.bucket_id=''documentos-prevencionista'' AND EXISTS(SELECT 1 FROM public.prevencion_documentos d WHERE d.storage_path=t.name AND d.creado_por=$1))'),
 ('storage.buckets','t.owner=$1 OR t.owner_id=$1::text OR EXISTS(SELECT 1 FROM public.cuentas_documentos d WHERE d.bucket_id=t.id AND (d.cuenta_id=$1 OR d.creado_por=$1)) OR (t.id=''documentos-trabajadores'' AND EXISTS(SELECT 1 FROM public.trabajadores_documentos d WHERE d.trabajador_id=$2 OR d.creado_por=$1)) OR (t.id=''documentos-prevencionista'' AND EXISTS(SELECT 1 FROM public.prevencion_documentos d WHERE d.creado_por=$1))'),
 ('public.tareas','t.responsable_id=$1'),
 ('public.mantenciones','t.id=ANY($7) OR t.responsable_id=$1'),
 ('public.tareas_pendientes','t.id=ANY($3) OR t.creada_por=$1 OR t.completada_por=$1 OR t.retirada_por=$1'),
 ('public.tareas_pendientes_asignaciones','t.tarea_id=ANY($3) OR t.trabajador_id=$2 OR t.asignada_por=$1 OR t.completada_por=$1 OR t.retirada_por=$1 OR t.ejecutor_id=$1'),
 ('public.tareas_pendientes_operaciones','t.tarea_id=ANY($3) OR t.actor_id=$1'),
 ('public.mantenciones_operativas','t.id=ANY($5) OR t.registrado_por=$1 OR t.trabajador_id=$2'),
 ('public.mantenciones_operativas_responsables','t.mantencion_id=ANY($5) OR t.trabajador_id=$2'),
 ('public.mantenciones_reactivas','public.usuario_eliminacion_reactiva_relacionada_v2(t.id,$1,$2,$4)'),
 ('public.mantencion_historial','t.id=ANY($6) OR t.revisado_por=$1'),
 ('public.mantencion_historial_anulaciones','t.historial_id=ANY($6) OR t.anulado_por=$1'),
 ('public.mantenciones_operativas_anulaciones','t.anulado_por=$1 OR t.mantencion_id=ANY($5)'),
 ('public.usuarios_gestion_auditoria','t.actor_id=$1 OR t.objetivo_id=$1'),
 ('public.del_registro_eliminaciones','(t.ejecutado_por=$1 OR (t.entidad_id=$1 AND t.modulo=''Administración de Usuarios'' AND t.entidad_tipo=''usuario'')) AND NOT EXISTS(SELECT 1 FROM public.usuarios_eliminaciones_operaciones o WHERE o.id=$8 AND (o.auditoria_id=t.id OR (o.estado=''AUTH_ELIMINADA'' AND t.dependencias_resumen->>''operacion_id''=o.id::text AND t.entidad_id=o.objetivo_id AND t.ejecutado_por=o.actor_id AND t.entidad_referencia=o.objetivo_nombre_snapshot AND t.ejecutado_por_nombre_snapshot=o.actor_nombre_snapshot AND t.motivo=o.motivo AND t.accion=''ELIMINACION_PERMANENTE'' AND t.modulo=''Administración de Usuarios'' AND t.entidad_tipo=''usuario'')))'),
 ('public.usuarios_eliminaciones_operaciones','t.id<>$8 AND (t.actor_id=$1 OR t.objetivo_id=$1)'),
 ('public.guia_contenido_auditoria','t.autor_id=$1'),
 ('public.inventario_catalogo_auditoria','t.registrado_por_id=$1'),
 ('public.inventario_entradas_formatos','t.actor_id=$1'),
 ('public.inventario_movimientos','t.registrado_por_id=$1'),
 ('public.inventario_movimientos_anulaciones','t.registrado_por_id=$1'),
 ('public.inventario_productos','t.creado_por=$1'),
 ('public.bodegas_inventariados','t.registrado_por=$1'),
 ('public.jardineria_contenido_auditoria','t.autor_id=$1'),
 ('public.prevencion_gantt_contenido_auditoria','t.autor_id=$1'),
 ('public.administraciones_temporales','t.usuario_id=$1 OR t.otorgado_por=$1 OR t.revocado_por=$1'),
 ('public.solicitudes_reactivas','t.id=ANY($4) OR t.creada_por=$1 OR t.revisada_por=$1 OR t.anulada_por=$1'),
 ('public.solicitudes_reactivas_avisos','t.solicitud_id=ANY($4)'),
 ('public.solicitudes_reactivas_avisos_estado','t.solicitud_id=ANY($4) OR t.usuario_id=$1'),
 ('public.solicitudes_notificaciones_revision','t.destinatario_id=$1 OR t.solicitud_id=ANY($4)'),
 ('public.solicitudes_reactivas_eliminaciones_auditoria','t.eliminado_por=$1 OR t.solicitud_id=ANY($4)'),
 ('public.solicitudes_reactivas_eventos','t.solicitud_id=ANY($4) OR t.actor_id=$1 OR public.usuario_eliminacion_reactiva_relacionada_v2(t.mantencion_reactiva_id,$1,$2,$4)'),
 ('public.alertas','t.usuario_id=$1 OR t.tarea_id IN(SELECT id FROM public.tareas WHERE responsable_id=$1) OR t.mantencion_id=ANY($7)'),
 ('public.usuarios_correos_verificados','t.usuario_id=$1'),
 ('public.usuarios_sesion_cambios','t.usuario_id=$1'),
 ('public.usuarios_trabajadores_vinculos_auditoria','t.usuario_id=$1 OR t.trabajador_id=$2'),
 ('public.mantenciones_reactivas_ciclos','t.responsable_trabajador_id=$2 OR public.usuario_eliminacion_reactiva_relacionada_v2(t.mantencion_id,$1,$2,$4)'),
 ('public.televisores_habitaciones',public.usuario_eliminacion_predicado_tv_v2(false)),
 ('public.televisores_habitaciones_auditoria',public.usuario_eliminacion_predicado_tv_v2(true)||' OR EXISTS(SELECT 1 FROM public.televisores_habitaciones z WHERE z.id=t.televisor_id AND ('||replace(public.usuario_eliminacion_predicado_tv_v2(false),'t.','z.')||'))'),
 ('public.usuarios_creaciones_manuales_operaciones','t.actor_id=$1 OR t.cuenta_id=$1 OR t.trabajador_id=$2 OR t.ficha_objetivo_id=$2')
$relaciones356$;

CREATE FUNCTION public.usuario_eliminacion_ambito_v2(p_operacion jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $ambito356$
DECLARE cuenta uuid:=(p_operacion->>'objetivo_id')::uuid; ficha uuid;
 tareas uuid[]; solicitudes uuid[]; operativas uuid[]; historiales uuid[]; mantenciones uuid[];
BEGIN
 SELECT trabajador_id INTO STRICT ficha FROM public.usuarios_identidades_historicas WHERE cuenta_id=cuenta;
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),ARRAY[]::uuid[]) INTO tareas FROM (
   SELECT id FROM public.tareas_pendientes WHERE creada_por=cuenta OR completada_por=cuenta OR retirada_por=cuenta
   UNION SELECT tarea_id FROM public.tareas_pendientes_asignaciones WHERE trabajador_id=ficha OR
     asignada_por=cuenta OR completada_por=cuenta OR retirada_por=cuenta OR ejecutor_id=cuenta
   UNION SELECT tarea_id FROM public.tareas_pendientes_operaciones WHERE actor_id=cuenta) x WHERE id IS NOT NULL;
 SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::uuid[]) INTO solicitudes FROM public.solicitudes_reactivas
   WHERE creada_por=cuenta OR revisada_por=cuenta OR anulada_por=cuenta OR
     id IN(SELECT solicitud_id FROM public.mantenciones_reactivas m WHERE creada_por=cuenta OR responsable_trabajador_id=ficha OR
       EXISTS(SELECT 1 FROM public.mantenciones_reactivas_ciclos c WHERE c.mantencion_id=m.id AND c.responsable_trabajador_id=ficha)) OR
     id IN(SELECT solicitud_id FROM public.solicitudes_reactivas_eventos e WHERE actor_id=cuenta OR
       e.detalle->>'trabajador_anterior'=ficha::text OR e.detalle->>'trabajador_nuevo'=ficha::text) OR
     id IN(SELECT solicitud_id FROM public.solicitudes_reactivas_avisos_estado WHERE usuario_id=cuenta) OR
     id IN(SELECT solicitud_id FROM public.solicitudes_notificaciones_revision WHERE destinatario_id=cuenta) OR
     id IN(SELECT solicitud_id FROM public.solicitudes_reactivas_eliminaciones_auditoria WHERE eliminado_por=cuenta);
 SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::uuid[]) INTO operativas FROM public.mantenciones_operativas
   WHERE registrado_por=cuenta OR trabajador_id=ficha OR
     id IN(SELECT mantencion_id FROM public.mantenciones_operativas_anulaciones WHERE anulado_por=cuenta) OR
     id IN(SELECT entidad_id FROM public.mantencion_historial WHERE revisado_por=cuenta OR
       id IN(SELECT historial_id FROM public.mantencion_historial_anulaciones WHERE anulado_por=cuenta)) OR
     id IN(SELECT mantencion_id FROM public.mantenciones_operativas_responsables WHERE trabajador_id=ficha);
 SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::uuid[]) INTO mantenciones FROM public.mantenciones WHERE responsable_id=cuenta;
 SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::uuid[]) INTO historiales FROM public.mantencion_historial WHERE
   revisado_por=cuenta OR entidad_id=ANY(operativas) OR entidad_id=ANY(mantenciones) OR
   entidad_id IN(SELECT id FROM public.mantenciones_reactivas m WHERE public.usuario_eliminacion_reactiva_relacionada_v2(m.id,cuenta,ficha,solicitudes));
 RETURN jsonb_build_object('cuenta',cuenta,'ficha',ficha,'tareas',tareas,'solicitudes',solicitudes,
   'operativas',operativas,'historiales',historiales,'mantenciones',mantenciones);
END;
$ambito356$;

CREATE FUNCTION public.usuario_eliminacion_catalogo_v2()
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $catalogo356$
 SELECT encode(sha256(convert_to(coalesce(jsonb_agg(j ORDER BY j::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM (
  SELECT jsonb_build_array('FK',oid,pg_get_constraintdef(oid),convalidated) j FROM pg_constraint WHERE contype='f'
  UNION ALL SELECT jsonb_build_array('TRIGGER',oid,pg_get_triggerdef(oid),tgenabled) FROM pg_trigger WHERE NOT tgisinternal
  UNION ALL SELECT jsonb_build_array('POLICY',oid,to_jsonb(p)) FROM pg_policy p
  UNION ALL SELECT jsonb_build_array('REL',c.oid,c.relrowsecurity,c.relforcerowsecurity,c.relacl,
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped))
    FROM pg_class c WHERE c.relnamespace IN ('public'::regnamespace,'storage'::regnamespace)
  UNION ALL SELECT jsonb_build_array('FUNC',p.oid,p.proacl,md5(pg_get_functiondef(p.oid))) FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.prokind IN('f','p')) q
$catalogo356$;

CREATE FUNCTION public.usuario_eliminacion_fila_v2(p_tabla text,p_fila jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp
AS $fila356$
 SELECT CASE p_tabla
  WHEN 'public.usuarios_identidades_historicas' THEN p_fila-'operacion_id'-'auth_eliminado_en'
  WHEN 'public.usuarios_sesion_cambios' THEN p_fila-'revision'-'actualizado_en'
  ELSE p_fila END
$fila356$;

CREATE FUNCTION public.usuario_eliminacion_huellas_individuales_v2(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $huellas356$
DECLARE o jsonb; amb jsonb; r record; j jsonb; item jsonb; filas jsonb; resultado jsonb:='{}'::jsonb;
 claves text; clave jsonb; n integer; total integer:=0; cuenta uuid; ficha uuid;
 tareas uuid[]; solicitudes uuid[]; operativas uuid[]; historiales uuid[]; mantenciones uuid[];
BEGIN
 o:=public.usuario_eliminacion_contexto_v2(p_operacion_id); amb:=public.usuario_eliminacion_ambito_v2(o);
 cuenta:=(amb->>'cuenta')::uuid; ficha:=(amb->>'ficha')::uuid;
 SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO tareas FROM jsonb_array_elements_text(amb->'tareas');
 SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO solicitudes FROM jsonb_array_elements_text(amb->'solicitudes');
 SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO operativas FROM jsonb_array_elements_text(amb->'operativas');
 SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO historiales FROM jsonb_array_elements_text(amb->'historiales');
 SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO mantenciones FROM jsonb_array_elements_text(amb->'mantenciones');
 FOR r IN SELECT * FROM public.usuario_eliminacion_relaciones_v2() ORDER BY tabla LOOP
  SELECT string_agg(format('%L,to_jsonb(t)->%L',a.attname,a.attname),',' ORDER BY k.orden) INTO claves
  FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(numero,orden)
  JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.numero
  WHERE i.indrelid=to_regclass(r.tabla) AND i.indisprimary AND k.orden<=i.indnkeyatts;
  IF claves IS NULL THEN
    claves:=CASE r.tabla
      WHEN 'public.mantenciones_operativas_responsables' THEN '''mantencion_id'',to_jsonb(t)->''mantencion_id'',''trabajador_id'',to_jsonb(t)->''trabajador_id'''
      WHEN 'public.solicitudes_reactivas_avisos' THEN '''solicitud_id'',to_jsonb(t)->''solicitud_id'''
      WHEN 'public.solicitudes_reactivas_avisos_estado' THEN '''solicitud_id'',to_jsonb(t)->''solicitud_id'',''usuario_id'',to_jsonb(t)->''usuario_id'''
      WHEN 'public.usuarios_correos_verificados' THEN '''usuario_id'',to_jsonb(t)->''usuario_id'''
      WHEN 'public.usuarios_sesion_cambios' THEN '''usuario_id'',to_jsonb(t)->''usuario_id'''
      ELSE NULL END;
    IF claves IS NULL THEN RAISE EXCEPTION 'CLAVE_V2_NO_ACREDITADA'; END IF;
  END IF;
  filas:='[]'::jsonb; n:=0;
  FOR item IN EXECUTE format('SELECT jsonb_build_object(''clave'',jsonb_build_object(%s),''fila'',to_jsonb(t)) FROM %s t WHERE (%s) ORDER BY to_jsonb(t)::text LIMIT 10001',claves,r.tabla,r.predicado)
    USING cuenta,ficha,tareas,solicitudes,operativas,historiales,mantenciones,p_operacion_id LOOP
   j:=public.usuario_eliminacion_fila_v2(r.tabla,item->'fila'); clave:=item->'clave';
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(filas) e WHERE e->'clave'=clave) THEN RAISE EXCEPTION 'CLAVE_V2_AMBIGUA'; END IF;
   filas:=filas||jsonb_build_array(jsonb_build_object('clave',clave,'sha256',encode(sha256(convert_to(j::text,'UTF8')),'hex')));
   n:=n+1;
  END LOOP;
  IF r.tabla='public.usuarios_sesion_cambios' AND n=0 THEN
   j:=jsonb_build_object('usuario_id',cuenta);
   filas:=jsonb_build_array(jsonb_build_object('clave',j,'sha256',encode(sha256(convert_to(j::text,'UTF8')),'hex'))); n:=1;
  END IF;
  SELECT coalesce(jsonb_agg(value ORDER BY (value->'clave')::text),'[]'::jsonb) INTO filas FROM jsonb_array_elements(filas);
  total:=total+n;
  IF total>10000 THEN RAISE EXCEPTION 'HUELLAS_V2_SUPERAN_LIMITE'; END IF;
  resultado:=resultado||jsonb_build_object(r.tabla,jsonb_build_object('total',n,'registros',filas));
 END LOOP;
 IF (SELECT count(*) FROM jsonb_object_keys(resultado))<>46 OR octet_length(resultado::text)>4194304 THEN
   RAISE EXCEPTION 'COBERTURA_V2_NO_ACREDITADA';
 END IF;
 RETURN resultado;
END;
$huellas356$;

CREATE FUNCTION public.usuario_eliminacion_estructura_v2()
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $estructura356$
DECLARE r record;
BEGIN
 PERFORM public.usuario_eliminacion_documental_contrato_220_v1();
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.usuarios_eliminaciones_operaciones'::regclass
    AND relrowsecurity AND relowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')) OR
    has_table_privilege('anon','public.usuarios_eliminaciones_operaciones','INSERT,UPDATE,DELETE') OR
    has_table_privilege('authenticated','public.usuarios_eliminaciones_operaciones','INSERT,UPDATE,DELETE') OR
    has_table_privilege('service_role','public.usuarios_eliminaciones_operaciones','INSERT,UPDATE,DELETE') THEN
  RAISE EXCEPTION 'RESERVA_V2_NO_PRIVADA'; END IF;
 IF (SELECT count(*) FROM public.usuario_eliminacion_relaciones_v2())<>46 THEN RAISE EXCEPTION 'COBERTURA_V2_NO_ACREDITADA'; END IF;
 IF EXISTS(WITH RECURSIVE desaparecen(oid) AS (
   SELECT 'auth.users'::regclass::oid UNION SELECT k.conrelid FROM pg_constraint k
   JOIN desaparecen d ON d.oid=k.confrelid WHERE k.contype='f' AND k.confdeltype='c')
   SELECT 1 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN desaparecen d ON d.oid=k.confrelid
   WHERE k.contype='f' AND c.relnamespace='public'::regnamespace AND k.confdeltype IN('c','n','d') AND
     NOT(k.conrelid='public.usuarios'::regclass AND k.confrelid='auth.users'::regclass AND k.conname='usuarios_id_fkey'
       AND k.confdeltype='c' AND k.convalidated)) THEN RAISE EXCEPTION 'CASCADA_V2_NO_CUBIERTA'; END IF;
 FOR r IN SELECT * FROM (VALUES('tareas','responsable_id'),('mantenciones','responsable_id'),('alertas','usuario_id'),
   ('solicitudes_reactivas_avisos_estado','usuario_id'),('usuarios_correos_verificados','usuario_id'),
   ('usuarios_sesion_cambios','usuario_id')) v(tabla,columna) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1]
     WHERE k.contype='f' AND k.conrelid=to_regclass('public.'||r.tabla) AND a.attname=r.columna AND
       k.confrelid='public.usuarios_identidades_historicas'::regclass AND cardinality(k.conkey)=1 AND
       cardinality(k.confkey)=1 AND k.confdeltype='r' AND k.convalidated) THEN RAISE EXCEPTION 'FK_V2_NO_ACREDITADA'; END IF;
 END LOOP;
 FOR r IN SELECT * FROM (VALUES
  ('usuario_eliminacion_piloto_entrada_usuarios_v1','public.usuarios',26),
  ('usuario_eliminacion_piloto_entrada_solicitudes_v1','public.solicitudes_reactivas',30),
  ('usuario_eliminacion_piloto_entrada_avisos_v1','public.solicitudes_reactivas_avisos',30)) v(nombre,tabla,tipo) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass(r.tabla) AND tgname=r.nombre AND tgtype=r.tipo
     AND tgfoid='public.usuario_eliminacion_piloto_entrada_v1()'::regprocedure AND NOT tgisinternal AND tgenabled IN('O','A')) THEN
   RAISE EXCEPTION 'ENTRADA_V2_NO_ACREDITADA'; END IF;
 END LOOP;
 IF md5(pg_get_functiondef('public.usuario_eliminacion_piloto_entrada_v1()'::regprocedure))<>'eb500a21c4cd76a01e208848f480fa6e' THEN
  RAISE EXCEPTION 'HUELLA_ENTRADA_V2_DISTINTA'; END IF;
END;
$estructura356$;

CREATE FUNCTION public.usuario_eliminacion_inventario_v2(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $inventario356$
DECLARE o jsonb; amb jsonb; cuentas uuid; ficha uuid; objetos jsonb; r record; resultado jsonb:='[]'::jsonb; total_bytes bigint:=0;
BEGIN
 o:=public.usuario_eliminacion_contexto_v2(p_operacion_id); amb:=public.usuario_eliminacion_ambito_v2(o);
 cuentas:=(amb->>'cuenta')::uuid; ficha:=(amb->>'ficha')::uuid;
 IF EXISTS(SELECT 1 FROM storage.objects WHERE owner=cuentas OR owner_id=cuentas::text) THEN
  RAISE EXCEPTION 'MIGRACION_INSTITUCIONAL_REQUERIDA'; END IF;
 IF EXISTS(SELECT 1 FROM public.cuentas_documentos_retiros ret WHERE ret.confirmado_en IS NULL AND
   (ret.cuenta_id=cuentas OR ret.propietario_id=cuentas OR ret.solicitado_por=cuentas OR ret.autorizado_por=cuentas OR
    EXISTS(SELECT 1 FROM public.cuentas_documentos d WHERE d.id=ret.documento_id AND (d.cuenta_id=cuentas OR d.creado_por=cuentas)))) OR
   EXISTS(SELECT 1 FROM public.cuentas_documentos d WHERE (d.cuenta_id=cuentas OR d.creado_por=cuentas) AND
     d.migracion_institucional IS NOT NULL AND d.migracion_institucional->>'estado' IS DISTINCT FROM 'COMPLETADA') THEN
  RAISE EXCEPTION 'RETIRO_O_MIGRACION_V2_PENDIENTE'; END IF;
 IF EXISTS(SELECT 1 FROM public.cuentas_documentos d LEFT JOIN storage.objects s ON s.bucket_id=d.bucket_id AND s.name=d.storage_path
   WHERE (d.cuenta_id=cuentas OR d.creado_por=cuentas) AND (d.estado_reserva IS DISTINCT FROM 'disponible' OR
    public.cuentas_documentos_ruta_certificada_v1(to_jsonb(d)) IS DISTINCT FROM true OR s.id IS DISTINCT FROM d.storage_object_id OR
    s.version IS DISTINCT FROM d.storage_version OR s.metadata->'size' IS DISTINCT FROM to_jsonb(d.tamano_bytes_verificado) OR
    s.metadata->>'mimetype' IS DISTINCT FROM d.mime_type_verificado OR coalesce(d.sha256_verificado,'') !~ '^[0-9a-f]{64}$' OR
    d.cuenta_nombre_snapshot IS NULL OR d.creado_por_nombre_snapshot IS NULL OR
    (d.propiedad_institucional AND (s.owner IS NOT NULL OR s.owner_id IS NOT NULL)))) THEN
   RAISE EXCEPTION 'DOCUMENTO_V2_NO_ACREDITADO'; END IF;
 -- LEFT JOIN: un documento sin archivo jamás se convierte en inventario vacío válido.
 FOR r IN WITH rutas AS (
   SELECT d.bucket_id,d.storage_path FROM public.cuentas_documentos d WHERE d.cuenta_id=cuentas OR d.creado_por=cuentas
   UNION SELECT 'documentos-trabajadores',d.storage_path FROM public.trabajadores_documentos d WHERE d.trabajador_id=ficha OR d.creado_por=cuentas
   UNION SELECT 'documentos-prevencionista',d.storage_path FROM public.prevencion_documentos d WHERE d.creado_por=cuentas)
   SELECT s.id,rutas.bucket_id,rutas.storage_path,s.version,s.metadata,
     (SELECT d.sha256_verificado FROM public.cuentas_documentos d WHERE d.bucket_id=rutas.bucket_id AND d.storage_path=rutas.storage_path) AS sha
   FROM rutas LEFT JOIN storage.objects s ON s.bucket_id=rutas.bucket_id AND s.name=rutas.storage_path ORDER BY s.id LOOP
  IF r.id IS NULL OR nullif(r.version,'') IS NULL OR coalesce(r.metadata->>'size','') !~ '^[0-9]+$' OR
     (r.metadata->>'size')::numeric<0 OR (r.metadata->>'size')::numeric>16777216 OR
     r.storage_path IS NULL OR r.storage_path ~ '(^|/)[.][.]?(/|$)' OR position(chr(92) in r.storage_path)>0 THEN
    RAISE EXCEPTION 'OBJETO_FISICO_V2_NO_ACREDITADO'; END IF;
  resultado:=resultado||jsonb_build_array(jsonb_build_object('id',r.id,'bucket_id',r.bucket_id,'storage_path',r.storage_path,
    'version',r.version,'tamano_bytes',(r.metadata->>'size')::bigint,'sha256_documental',r.sha));
  total_bytes:=total_bytes+(r.metadata->>'size')::bigint;
  IF jsonb_array_length(resultado)>128 OR total_bytes>67108864 OR octet_length(resultado::text)>1048576 THEN RAISE EXCEPTION 'INVENTARIO_V2_SUPERA_LIMITE'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(resultado) e GROUP BY e->>'id' HAVING count(*)>1) THEN
   RAISE EXCEPTION 'INVENTARIO_V2_AMBIGUO'; END IF;
 RETURN resultado;
END;
$inventario356$;

CREATE FUNCTION public.usuario_eliminacion_validar_previa_v2(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $previa356$
DECLARE o jsonb; u public.usuarios%ROWTYPE; h public.usuarios_identidades_historicas%ROWTYPE; ledger jsonb; sesion jsonb;
BEGIN
 o:=public.usuario_eliminacion_contexto_v2(p_operacion_id);
 IF o->>'estado'<>'PREPARADA' OR o->>'intentos_auth'<>'0' OR o->'auditoria_id'<>'null'::jsonb THEN RAISE EXCEPTION 'PREVIA_V2_NO_PREPARADA'; END IF;
 PERFORM public.usuario_eliminacion_estructura_v2();
 SELECT * INTO STRICT u FROM public.usuarios WHERE id=(o->>'objetivo_id')::uuid FOR SHARE;
 SELECT * INTO STRICT h FROM public.usuarios_identidades_historicas WHERE cuenta_id=u.id FOR SHARE;
 IF u.estado IS DISTINCT FROM true OR u.nombre IS DISTINCT FROM o->>'objetivo_nombre_snapshot' OR
    h.nombre_snapshot IS DISTINCT FROM u.nombre OR h.trabajador_id IS DISTINCT FROM u.trabajador_id OR
    h.auth_eliminado_en IS NOT NULL OR h.operacion_id IS NOT NULL OR public.es_rol_administrador(u.rol_id) IS DISTINCT FROM false OR
    NOT EXISTS(SELECT 1 FROM public.roles WHERE id=u.rol_id AND lower(btrim(nombre)) IN('tecnico','técnico','recepcion','recepción')) OR
    NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u.id) THEN RAISE EXCEPTION 'IDENTIDAD_V2_NO_ACREDITADA'; END IF;
 IF EXISTS(SELECT 1 FROM public.administraciones_temporales d WHERE
    (d.usuario_id=u.id OR d.otorgado_por=u.id OR d.revocado_por=u.id) AND d.revocado_at IS NULL AND
    (d.vigente_hasta IS NULL OR d.vigente_hasta>clock_timestamp())) THEN RAISE EXCEPTION 'DELEGACION_V2_NO_CERRADA'; END IF;
 ledger:=public.usuarios_trabajadores_certificar_ledger_v1(u.id,u.trabajador_id);
 IF jsonb_typeof(ledger) IS DISTINCT FROM 'object' OR ledger='{}'::jsonb THEN RAISE EXCEPTION 'LEDGER_V2_NO_ACREDITADO'; END IF;
 SELECT jsonb_build_object('revision',t.revision,'actualizado_en',t.actualizado_en) INTO sesion FROM public.usuarios_sesion_cambios t WHERE usuario_id=u.id;
 RETURN jsonb_build_object('version',2,'habilita_auth',false,'vinculo',jsonb_build_object('operacion_id',o->'id','actor_id',o->'actor_id',
   'objetivo_id',o->'objetivo_id','request_id',o->'dependencias_resumen'->'paso191'->'request_id',
   'fingerprint',o->'dependencias_resumen'->'paso191'->'fingerprint'),
   'catalogo_sha256',public.usuario_eliminacion_catalogo_v2(),'ledger_laboral',ledger,'sesion_original',sesion,
   'ambito',public.usuario_eliminacion_ambito_v2(o),'inventario',public.usuario_eliminacion_inventario_v2(p_operacion_id),
   'registros',public.usuario_eliminacion_huellas_individuales_v2(p_operacion_id));
END;
$previa356$;

CREATE FUNCTION public.usuario_eliminacion_preparar_v2(p_objetivo_id uuid,p_nombre_exacto text,p_motivo text,
 p_confirmacion boolean,p_request_id uuid,p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $preparar356$
DECLARE actor uuid:=auth.uid(); nombre_actor text; u public.usuarios%ROWTYPE; o public.usuarios_eliminaciones_operaciones%ROWTYPE; id_operacion uuid;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' OR auth.role() IS DISTINCT FROM 'authenticated' OR actor IS NULL OR
    current_setting('transaction_isolation')<>'read committed' OR current_setting('row_security')<>'off' OR
    public.es_administrador_permanente_actual() IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONTEXTO_V2_NO_AUTORIZADO'; END IF;
 IF p_objetivo_id IS NULL OR p_objetivo_id=actor OR p_confirmacion IS DISTINCT FROM true OR p_request_id IS NULL OR
    coalesce(p_fingerprint,'') !~ '^[0-9a-f]{64}$' OR nullif(btrim(p_nombre_exacto),'') IS NULL OR
    p_motivo IS NULL OR p_motivo<>btrim(p_motivo) OR length(p_motivo) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'INTENCION_V2_NO_ADMITIDA'; END IF;
 PERFORM pg_advisory_xact_lock(209,1);
 SELECT nombre INTO STRICT nombre_actor FROM public.usuarios WHERE id=actor AND estado IS TRUE FOR SHARE;
 IF nullif(btrim(nombre_actor),'') IS NULL THEN RAISE EXCEPTION 'ACTOR_V2_INCOMPLETO'; END IF;
 SELECT * INTO STRICT u FROM public.usuarios WHERE id=p_objetivo_id FOR SHARE;
 IF u.nombre IS DISTINCT FROM p_nombre_exacto THEN RAISE EXCEPTION 'NOMBRE_V2_NO_COINCIDE'; END IF;
 IF EXISTS(SELECT 1 FROM public.usuarios_eliminaciones_operaciones x WHERE x.dependencias_resumen->'paso191'->>'request_id'=p_request_id::text
    AND (x.actor_id<>actor OR x.objetivo_id<>u.id OR x.objetivo_nombre_snapshot<>p_nombre_exacto OR x.motivo<>p_motivo OR
      x.dependencias_resumen->'paso191'->>'fingerprint' IS DISTINCT FROM p_fingerprint)) THEN RAISE EXCEPTION 'REQUEST_V2_CONFLICTO'; END IF;
 SELECT * INTO o FROM public.usuarios_eliminaciones_operaciones WHERE objetivo_id=u.id AND estado IN('PREPARADA','AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION') FOR UPDATE;
 IF FOUND THEN
  IF o.actor_id<>actor OR o.estado<>'PREPARADA' OR o.intentos_auth<>0 OR o.motivo<>p_motivo OR o.objetivo_nombre_snapshot<>p_nombre_exacto OR
     o.dependencias_resumen->'paso191'->>'request_id' IS DISTINCT FROM p_request_id::text OR
     o.dependencias_resumen->'paso191'->>'fingerprint' IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'OPERACION_EXISTENTE_REQUIERE_REVISION'; END IF;
  id_operacion:=o.id;
 ELSE
  INSERT INTO public.usuarios_eliminaciones_operaciones(objetivo_id,objetivo_nombre_snapshot,actor_id,actor_nombre_snapshot,motivo,estado,dependencias_resumen)
   VALUES(u.id,u.nombre,actor,nombre_actor,p_motivo,'PREPARADA',jsonb_build_object('procedimiento_preparacion','USUARIO_ELIMINACION_PREPARAR_V2',
     'conservacion_historica_certificada',false,'autorizacion_irreversible_confirmada',false,
     'paso191',jsonb_build_object('request_id',p_request_id,'fingerprint',p_fingerprint))) RETURNING id INTO id_operacion;
 END IF;
 PERFORM public.usuario_eliminacion_validar_previa_v2(id_operacion);
 RETURN jsonb_build_object('operacion_id',id_operacion,'request_id',p_request_id,'estado','PREPARADA','habilita_auth',false);
END;
$preparar356$;

CREATE FUNCTION public.usuario_eliminacion_certificar_v2(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $certificar356$
DECLARE o jsonb; c jsonb; anterior jsonb; historial jsonb;
BEGIN
 o:=public.usuario_eliminacion_contexto_v2(p_operacion_id); c:=public.usuario_eliminacion_validar_previa_v2(p_operacion_id);
 anterior:=o->'dependencias_resumen'->'conservacion_integral_v2';
 IF anterior IS NOT NULL AND anterior->>'sha256' IS DISTINCT FROM encode(sha256(convert_to((anterior-'sha256')::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'CERTIFICADO_V2_NO_ACREDITADO'; END IF;
 IF anterior IS NOT NULL AND (anterior-ARRAY['sha256','revision','renovacion_de'])=c THEN RETURN anterior; END IF;
 IF o->'dependencias_resumen' ? 'ejecucion_integral_v2' OR
    o->'dependencias_resumen'->'autorizacion_irreversible_confirmada'='true'::jsonb THEN RAISE EXCEPTION 'RENOVACION_V2_NO_ADMITIDA'; END IF;
 c:=c||jsonb_build_object('revision',coalesce((anterior->>'revision')::integer,0)+1,'renovacion_de',anterior->'sha256');
 c:=c||jsonb_build_object('sha256',encode(sha256(convert_to(c::text,'UTF8')),'hex'));
 historial:=coalesce(o->'dependencias_resumen'->'certificados_anteriores_v2','[]'::jsonb);
 IF anterior IS NOT NULL THEN
  historial:=historial||jsonb_build_array(jsonb_build_object('certificado',anterior,
    'fisica',o->'dependencias_resumen'->'fisica_integral_v2','renovado_en',clock_timestamp()));
 END IF;
 IF jsonb_array_length(historial)>16 OR octet_length(historial::text)>8388608 THEN RAISE EXCEPTION 'HISTORIAL_CERTIFICADOS_V2_SUPERA_LIMITE'; END IF;
  IF o->'dependencias_resumen' ? 'conservacion_previa_v1' OR o->'dependencias_resumen' ? 'conservacion_documental_v1' THEN
   RAISE EXCEPTION 'CERTIFICADO_V1_REQUIERE_TRANSICION_EXPLICITA'; END IF;
  UPDATE public.usuarios_eliminaciones_operaciones SET dependencias_resumen=(dependencias_resumen-'fisica_integral_v2')||
    jsonb_build_object('conservacion_integral_v2',c,'certificados_anteriores_v2',historial),
    updated_at=clock_timestamp() WHERE id=p_operacion_id AND estado='PREPARADA' AND intentos_auth=0;
  IF NOT FOUND THEN RAISE EXCEPTION 'CERTIFICADO_V2_CONFLICTO'; END IF;
 RETURN c;
END;
$certificar356$;

CREATE FUNCTION public.usuario_eliminacion_verificar_huellas_v2(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $verificar356$
DECLARE o jsonb; c jsonb; h public.usuarios_identidades_historicas%ROWTYPE; sesion jsonb; esperada jsonb;
BEGIN
 o:=public.usuario_eliminacion_contexto_v2(p_operacion_id); c:=o->'dependencias_resumen'->'conservacion_integral_v2';
 IF c IS NULL OR c->>'version' IS DISTINCT FROM '2' OR c->'habilita_auth' IS DISTINCT FROM 'false'::jsonb OR
    c->>'sha256' IS DISTINCT FROM encode(sha256(convert_to((c-'sha256')::text,'UTF8')),'hex') OR
    c->'vinculo' IS DISTINCT FROM jsonb_build_object('operacion_id',o->'id','actor_id',o->'actor_id','objetivo_id',o->'objetivo_id',
      'request_id',o->'dependencias_resumen'->'paso191'->'request_id','fingerprint',o->'dependencias_resumen'->'paso191'->'fingerprint') OR
    c->>'catalogo_sha256' IS DISTINCT FROM public.usuario_eliminacion_catalogo_v2() THEN RAISE EXCEPTION 'CERTIFICADO_V2_NO_ACREDITADO'; END IF;
 PERFORM public.usuario_eliminacion_estructura_v2();
 IF c->'ambito' IS DISTINCT FROM public.usuario_eliminacion_ambito_v2(o) OR
    c->'registros' IS DISTINCT FROM public.usuario_eliminacion_huellas_individuales_v2(p_operacion_id) OR
    c->'inventario' IS DISTINCT FROM public.usuario_eliminacion_inventario_v2(p_operacion_id) THEN
   RAISE EXCEPTION 'REGISTROS_INDIVIDUALES_V2_CAMBIARON'; END IF;
 SELECT * INTO STRICT h FROM public.usuarios_identidades_historicas WHERE cuenta_id=(o->>'objetivo_id')::uuid;
 IF h.nombre_snapshot IS DISTINCT FROM o->>'objetivo_nombre_snapshot' OR
    c->'ledger_laboral' IS DISTINCT FROM public.usuarios_trabajadores_certificar_ledger_v1(h.cuenta_id,h.trabajador_id) THEN
   RAISE EXCEPTION 'LEDGER_V2_CAMBIO'; END IF;
 SELECT jsonb_build_object('revision',t.revision,'actualizado_en',t.actualizado_en) INTO sesion FROM public.usuarios_sesion_cambios t WHERE usuario_id=h.cuenta_id;
 esperada:=CASE WHEN o->>'intentos_auth'='0' THEN c->'sesion_original' ELSE o->'dependencias_resumen'->'ejecucion_integral_v2'->'sesion_esperada' END;
 IF coalesce(sesion,'null'::jsonb) IS DISTINCT FROM coalesce(esperada,'null'::jsonb) THEN RAISE EXCEPTION 'REVISION_SESION_V2_CAMBIO'; END IF;
 RETURN jsonb_build_object('registros_conservados',true,'habilita_auth',false,'certificado_sha256',c->'sha256');
END;
$verificar356$;

-- Únicamente servidor postgres ya autorizado: el recibo representa GET de bytes,
-- no una comprobación que SQL pueda efectuar. No se expone este puerto por API.
CREATE FUNCTION public.usuario_eliminacion_registrar_fisica_v2(p_operacion_id uuid,p_fase text,p_objetos jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $fisica356$
DECLARE o jsonb; c jsonb; previo jsonb; actual jsonb; inventario jsonb; x jsonb; m jsonb; recibo jsonb;
BEGIN
 o:=public.usuario_eliminacion_contexto_v2(p_operacion_id); c:=o->'dependencias_resumen'->'conservacion_integral_v2';
 PERFORM public.usuario_eliminacion_verificar_huellas_v2(p_operacion_id);
 IF p_fase NOT IN('antes','despues') OR p_fase IS NULL OR jsonb_typeof(p_objetos) IS DISTINCT FROM 'array' OR
    jsonb_array_length(p_objetos)>128 OR octet_length(p_objetos::text)>1048576 THEN RAISE EXCEPTION 'RECIBO_FISICO_V2_INVALIDO'; END IF;
 IF p_fase='antes' AND (o->>'estado'<>'PREPARADA' OR o->>'intentos_auth'<>'0') THEN RAISE EXCEPTION 'FASE_FISICA_V2_INVALIDA'; END IF;
 IF p_fase='despues' AND (o->>'intentos_auth'<>'1' OR o->>'estado' NOT IN('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION','COMPLETADA') OR
    EXISTS(SELECT 1 FROM auth.users WHERE id=(o->>'objetivo_id')::uuid) OR
    EXISTS(SELECT 1 FROM public.usuarios WHERE id=(o->>'objetivo_id')::uuid)) THEN RAISE EXCEPTION 'AUSENCIA_FISICA_V2_NO_ACREDITADA'; END IF;
 inventario:=c->'inventario';
 IF jsonb_array_length(p_objetos)<>jsonb_array_length(inventario) OR
    EXISTS(SELECT 1 FROM jsonb_array_elements(p_objetos) e GROUP BY e->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'INVENTARIO_FISICO_V2_DISTINTO'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(inventario) LOOP
  SELECT value INTO STRICT m FROM jsonb_array_elements(p_objetos) WHERE value->>'id'=x->>'id';
  IF (m-ARRAY['id','bucket_id','storage_path','version','tamano_bytes','sha256'])<>'{}'::jsonb OR
     (m-'sha256') IS DISTINCT FROM (x-'sha256_documental') OR
     coalesce(m->>'sha256','') !~ '^[0-9a-f]{64}$' OR
     (x->>'sha256_documental' IS NOT NULL AND x->>'sha256_documental' IS DISTINCT FROM m->>'sha256') THEN
   RAISE EXCEPTION 'CONTENIDO_FISICO_V2_CAMBIO'; END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'id'),'[]'::jsonb) INTO actual FROM jsonb_array_elements(p_objetos);
 previo:=o->'dependencias_resumen'->'fisica_integral_v2';
 IF p_fase='despues' AND (previo->'antes' IS NULL OR previo->'antes'->'objetos' IS DISTINCT FROM actual OR
    previo->'antes'->>'certificado_sha256' IS DISTINCT FROM c->>'sha256') THEN RAISE EXCEPTION 'EVIDENCIA_FISICA_PREVIA_V2_REQUERIDA'; END IF;
 recibo:=jsonb_build_object('version',2,'fase',p_fase,'habilita_auth',false,'certificado_sha256',c->'sha256','objetos',actual);
 recibo:=recibo||jsonb_build_object('sha256',encode(sha256(convert_to(recibo::text,'UTF8')),'hex'));
 IF previo ? p_fase THEN
  IF previo->p_fase IS DISTINCT FROM recibo THEN RAISE EXCEPTION 'RECIBO_FISICO_V2_INMUTABLE'; END IF;
 ELSE
  UPDATE public.usuarios_eliminaciones_operaciones SET dependencias_resumen=dependencias_resumen||
    jsonb_build_object('fisica_integral_v2',coalesce(previo,'{}'::jsonb)||jsonb_build_object(p_fase,recibo)),updated_at=clock_timestamp()
    WHERE id=p_operacion_id AND estado=o->>'estado' AND intentos_auth=(o->>'intentos_auth')::integer;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECIBO_FISICO_V2_CONFLICTO'; END IF;
 END IF;
 RETURN jsonb_build_object('fase',p_fase,'archivos',jsonb_array_length(actual),'habilita_auth',false);
END;
$fisica356$;

CREATE FUNCTION public.usuario_eliminacion_reautenticacion_v2(p_operacion_id uuid,p_proposito text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $reauth356$
DECLARE o jsonb; prueba jsonb; claims jsonb; ms numeric:=date_part('epoch',clock_timestamp())*1000;
BEGIN
 o:=public.usuario_eliminacion_contexto_v2(p_operacion_id);
 IF p_proposito NOT IN('inicio','recuperacion') OR p_proposito IS NULL THEN RAISE EXCEPTION 'PROPOSITO_V2_INVALIDO'; END IF;
 prueba:=o->'dependencias_resumen'->'paso192'->CASE WHEN p_proposito='inicio' THEN 'reauth' ELSE 'recovery_reauth' END;
 claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 IF jsonb_typeof(prueba) IS DISTINCT FROM 'object' OR prueba->>'actor_id' IS DISTINCT FROM o->>'actor_id' OR
    prueba->>'target_id' IS DISTINCT FROM o->>'objetivo_id' OR prueba->>'operation_id' IS DISTINCT FROM o->>'id' OR
    prueba->>'request_id' IS DISTINCT FROM o->'dependencias_resumen'->'paso191'->>'request_id' OR
    prueba->>'fingerprint' IS DISTINCT FROM o->'dependencias_resumen'->'paso191'->>'fingerprint' OR
    coalesce(prueba->>'proof_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
    coalesce(prueba->>'session_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
    prueba->>'session_id' IS DISTINCT FROM claims->>'session_id' OR prueba->>'purpose' IS DISTINCT FROM p_proposito OR
    prueba->>'method' IS DISTINCT FROM 'password' OR prueba->'consumed_at' IS DISTINCT FROM 'null'::jsonb OR
    jsonb_typeof(prueba->'verified_at') IS DISTINCT FROM 'number' OR jsonb_typeof(prueba->'expires_at') IS DISTINCT FROM 'number' THEN
   RAISE EXCEPTION 'REAUTENTICACION_V2_NO_ACREDITADA'; END IF;
 IF (prueba->>'verified_at')::numeric>ms OR (prueba->>'expires_at')::numeric<=ms OR
    (prueba->>'expires_at')::numeric-(prueba->>'verified_at')::numeric<>120000 OR EXISTS(
     SELECT 1 FROM public.usuarios_eliminaciones_operaciones x CROSS JOIN LATERAL
       (VALUES(x.dependencias_resumen->'paso192'->'reauth'),(x.dependencias_resumen->'paso192'->'recovery_reauth')) p(j)
     WHERE p.j->>'proof_id'=prueba->>'proof_id' AND p.j->'consumed_at' IS DISTINCT FROM 'null'::jsonb) THEN
   RAISE EXCEPTION 'REAUTENTICACION_V2_VENCIDA_O_CONSUMIDA'; END IF;
 RETURN prueba||jsonb_build_object('consumed_at',ms);
END;
$reauth356$;

CREATE FUNCTION public.usuario_eliminacion_iniciar_v2(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $iniciar356$
DECLARE o jsonb; c jsonb; prueba jsonb; inicio timestamptz; sesion jsonb; intento uuid; previa jsonb;
BEGIN
 o:=public.usuario_eliminacion_contexto_v2(p_operacion_id); c:=o->'dependencias_resumen'->'conservacion_integral_v2';
 IF o->>'estado'<>'PREPARADA' OR o->>'intentos_auth'<>'0' OR o->'auditoria_id'<>'null'::jsonb THEN RAISE EXCEPTION 'INICIO_V2_NO_PREPARADO'; END IF;
 PERFORM public.usuario_eliminacion_verificar_huellas_v2(p_operacion_id);
 previa:=public.usuario_eliminacion_validar_previa_v2(p_operacion_id);
 IF c-ARRAY['sha256','revision','renovacion_de'] IS DISTINCT FROM previa THEN RAISE EXCEPTION 'CERTIFICADO_V2_DESACTUALIZADO'; END IF;
 IF o->'dependencias_resumen'->'fisica_integral_v2'->'antes'->>'certificado_sha256' IS DISTINCT FROM c->>'sha256' THEN
   RAISE EXCEPTION 'FISICA_PREVIA_V2_REQUERIDA'; END IF;
 prueba:=public.usuario_eliminacion_reautenticacion_v2(p_operacion_id,'inicio');
 IF EXISTS(SELECT 1 FROM public.usuarios_eliminaciones_operaciones x WHERE x.id<>p_operacion_id AND x.intentos_auth>0 AND
    x.estado IN('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION') AND
    (x.actor_id IN((o->>'actor_id')::uuid,(o->>'objetivo_id')::uuid) OR x.objetivo_id IN((o->>'actor_id')::uuid,(o->>'objetivo_id')::uuid))) THEN
   RAISE EXCEPTION 'RESERVA_IRREVERSIBLE_V2_EXISTENTE'; END IF;
 -- Cierre deliberado: no hay transición, consumo, deshabilitación ni Auth Delete.
 IF public.usuario_eliminacion_v2_habilitada() IS DISTINCT FROM true THEN RAISE EXCEPTION 'ELIMINACION_INTEGRAL_V2_DESHABILITADA'; END IF;
 inicio:=clock_timestamp();
 UPDATE public.usuarios SET estado=false WHERE id=(o->>'objetivo_id')::uuid AND estado IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OBJETIVO_V2_CAMBIO'; END IF;
 SELECT jsonb_build_object('revision',t.revision,'actualizado_en',t.actualizado_en) INTO STRICT sesion FROM public.usuarios_sesion_cambios t WHERE usuario_id=(o->>'objetivo_id')::uuid;
 IF (sesion->>'revision')::numeric<>coalesce((c->'sesion_original'->>'revision')::numeric,0)+1 OR
    (sesion->>'actualizado_en')::timestamptz<inicio OR (sesion->>'actualizado_en')::timestamptz>clock_timestamp() THEN
   RAISE EXCEPTION 'INCREMENTO_SESION_V2_NO_ACREDITADO'; END IF;
 intento:=gen_random_uuid();
 UPDATE public.usuarios_eliminaciones_operaciones SET estado='AUTH_EN_CURSO',intentos_auth=1,
  dependencias_resumen=dependencias_resumen||jsonb_build_object('conservacion_historica_certificada',true,
   'autorizacion_irreversible_confirmada',true,'auth_eliminacion_verificada',false,'alcance_eliminacion','CONSERVACION_INTEGRAL_V2',
   'paso191',(dependencias_resumen->'paso191')||jsonb_build_object('attempt_id',intento),
   'paso192',(dependencias_resumen->'paso192')||jsonb_build_object('reauth',prueba),
   'ejecucion_integral_v2',jsonb_build_object('version',2,'certificado_sha256',c->'sha256','attempt_id',intento,
     'sesion_esperada',sesion,'iniciada_en',inicio)),updated_at=inicio WHERE id=p_operacion_id AND estado='PREPARADA' AND intentos_auth=0;
 IF NOT FOUND THEN RAISE EXCEPTION 'INICIO_V2_CONFLICTO'; END IF;
 RETURN jsonb_build_object('operacion_id',p_operacion_id,'estado','AUTH_EN_CURSO','attempt_id',intento,'habilita_auth',false);
END;
$iniciar356$;

CREATE FUNCTION public.usuario_eliminacion_verificar_posterior_v2(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $posterior356$
DECLARE o jsonb; c jsonb; e jsonb; f jsonb;
BEGIN
 o:=public.usuario_eliminacion_contexto_v2(p_operacion_id); c:=o->'dependencias_resumen'->'conservacion_integral_v2';
 e:=o->'dependencias_resumen'->'ejecucion_integral_v2'; f:=o->'dependencias_resumen'->'fisica_integral_v2';
 IF o->>'intentos_auth'<>'1' OR o->>'estado' NOT IN('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION','COMPLETADA') OR
    e->>'certificado_sha256' IS DISTINCT FROM c->>'sha256' OR e->>'attempt_id' IS DISTINCT FROM o->'dependencias_resumen'->'paso191'->>'attempt_id' OR
    o->'dependencias_resumen'->'conservacion_historica_certificada' IS DISTINCT FROM 'true'::jsonb OR
    o->'dependencias_resumen'->'autorizacion_irreversible_confirmada' IS DISTINCT FROM 'true'::jsonb OR
    EXISTS(SELECT 1 FROM auth.users WHERE id=(o->>'objetivo_id')::uuid) OR
    EXISTS(SELECT 1 FROM public.usuarios WHERE id=(o->>'objetivo_id')::uuid) THEN RAISE EXCEPTION 'AUSENCIA_AUTH_V2_NO_ACREDITADA'; END IF;
 IF o->>'estado'<>'COMPLETADA' THEN
  PERFORM public.usuario_eliminacion_verificar_huellas_v2(p_operacion_id);
 ELSE
  -- Recibo final idempotente: no recertificar trabajos posteriores legítimos.
  IF c->>'sha256' IS DISTINCT FROM encode(sha256(convert_to((c-'sha256')::text,'UTF8')),'hex') OR
     o->'dependencias_resumen'->'conservacion_posterior_v2' IS DISTINCT FROM jsonb_build_object('version',2,'verificada',true,'certificado_sha256',c->'sha256','habilita_auth',false) THEN
   RAISE EXCEPTION 'RECIBO_FINAL_V2_NO_ACREDITADO'; END IF;
 END IF;
 IF f->'antes' IS NULL OR f->'despues' IS NULL OR f->'antes'->'objetos' IS DISTINCT FROM f->'despues'->'objetos' OR
    f->'antes'->>'sha256' IS DISTINCT FROM encode(sha256(convert_to((f->'antes'-'sha256')::text,'UTF8')),'hex') OR
    f->'antes'->>'certificado_sha256' IS DISTINCT FROM c->>'sha256' OR f->'despues'->>'certificado_sha256' IS DISTINCT FROM c->>'sha256' OR
    f->'despues'->>'sha256' IS DISTINCT FROM encode(sha256(convert_to((f->'despues'-'sha256')::text,'UTF8')),'hex') THEN
   RAISE EXCEPTION 'FISICA_POSTERIOR_V2_PENDIENTE'; END IF;
 IF o->>'estado'='COMPLETADA' AND (NOT EXISTS(SELECT 1 FROM public.del_registro_eliminaciones a WHERE a.id=(o->>'auditoria_id')::uuid AND
    a.entidad_id=(o->>'objetivo_id')::uuid AND a.ejecutado_por=(o->>'actor_id')::uuid AND a.entidad_referencia=o->>'objetivo_nombre_snapshot' AND
    a.ejecutado_por_nombre_snapshot=o->>'actor_nombre_snapshot' AND a.motivo=o->>'motivo' AND a.modulo='Administración de Usuarios' AND
    a.entidad_tipo='usuario' AND a.accion='ELIMINACION_PERMANENTE' AND a.dependencias_resumen->>'operacion_id'=o->>'id' AND a.dependencias_resumen->'conservacion_posterior_v2'=o->'dependencias_resumen'->'conservacion_posterior_v2') OR NOT EXISTS(
      SELECT 1 FROM public.usuarios_identidades_historicas h WHERE h.cuenta_id=(o->>'objetivo_id')::uuid AND h.operacion_id=p_operacion_id AND h.auth_eliminado_en IS NOT NULL AND h.nombre_snapshot=o->>'objetivo_nombre_snapshot' AND h.trabajador_id IS NOT DISTINCT FROM (c->'ledger_laboral'->>'trabajador_actual')::uuid)) THEN
   RAISE EXCEPTION 'AUDITORIA_ARCHIVO_V2_NO_ACREDITADOS'; END IF;
 RETURN jsonb_build_object('version',2,'verificada',true,'certificado_sha256',c->'sha256','habilita_auth',false);
END;
$posterior356$;

-- Camino normal después de la respuesta Auth confirmada y de los GET posteriores.
-- No requiere otra contraseña para constatar ausencia; la incertidumbre sí utiliza
-- recuperar_v2 con una prueba nueva. Ninguno de ambos caminos repite Auth Delete.
CREATE FUNCTION public.usuario_eliminacion_confirmar_auth_v2(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $confirmar356$
DECLARE o jsonb; posterior jsonb; prueba jsonb;
BEGIN
 o:=public.usuario_eliminacion_contexto_v2(p_operacion_id);
 IF o->>'estado' NOT IN('AUTH_EN_CURSO','AUTH_ELIMINADA') OR o->>'intentos_auth'<>'1' THEN
  RAISE EXCEPTION 'CONFIRMACION_AUTH_V2_NO_ADMITIDA'; END IF;
 prueba:=o->'dependencias_resumen'->'paso192'->'reauth';
 IF prueba->>'session_id' IS DISTINCT FROM nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id' OR
    jsonb_typeof(prueba->'consumed_at') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'SESION_INICIO_V2_NO_VINCULADA'; END IF;
 posterior:=public.usuario_eliminacion_verificar_posterior_v2(p_operacion_id);
 IF o->>'estado'='AUTH_EN_CURSO' THEN
  UPDATE public.usuarios_eliminaciones_operaciones SET estado='AUTH_ELIMINADA',dependencias_resumen=dependencias_resumen||
    jsonb_build_object('auth_eliminacion_verificada',true,'conservacion_posterior_v2',posterior),updated_at=clock_timestamp()
    WHERE id=p_operacion_id AND estado='AUTH_EN_CURSO' AND intentos_auth=1;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONFIRMACION_AUTH_V2_CONFLICTO'; END IF;
 END IF;
 RETURN jsonb_build_object('estado','AUTH_ELIMINADA','operacion_id',p_operacion_id,'habilita_auth',false);
END;
$confirmar356$;

CREATE FUNCTION public.usuario_eliminacion_recuperar_v2(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $recuperar356$
DECLARE o jsonb; prueba jsonb; posterior jsonb;
BEGIN
 o:=public.usuario_eliminacion_contexto_v2(p_operacion_id);
 IF o->>'estado'='COMPLETADA' THEN
  PERFORM public.usuario_eliminacion_verificar_posterior_v2(p_operacion_id);
  RETURN jsonb_build_object('estado','COMPLETADA','operacion_id',p_operacion_id,'habilita_auth',false);
 END IF;
 IF o->>'intentos_auth'<>'1' OR o->>'estado' NOT IN('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION') THEN RAISE EXCEPTION 'RECUPERACION_V2_NO_ADMITIDA'; END IF;
 prueba:=public.usuario_eliminacion_reautenticacion_v2(p_operacion_id,'recuperacion');
 -- Auth todavía presente: nunca reintentar ni simular una transición confirmada.
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=(o->>'objetivo_id')::uuid) THEN
  RETURN jsonb_build_object('estado',o->'estado','requiere_revision',true,'codigo','AUTH_TODAVIA_PRESENTE','habilita_auth',false);
 END IF;
 posterior:=public.usuario_eliminacion_verificar_posterior_v2(p_operacion_id);
 UPDATE public.usuarios_eliminaciones_operaciones SET estado='AUTH_ELIMINADA',dependencias_resumen=dependencias_resumen||
   jsonb_build_object('auth_eliminacion_verificada',true,'conservacion_posterior_v2',posterior,
     'paso192',(dependencias_resumen->'paso192')||jsonb_build_object('recovery_reauth',prueba)),updated_at=clock_timestamp()
   WHERE id=p_operacion_id AND intentos_auth=1 AND estado=o->>'estado';
 IF NOT FOUND THEN RAISE EXCEPTION 'RECUPERACION_V2_CONFLICTO'; END IF;
 RETURN jsonb_build_object('estado','AUTH_ELIMINADA','operacion_id',p_operacion_id,'requiere_finalizacion',true,'habilita_auth',false);
END;
$recuperar356$;

CREATE FUNCTION public.usuario_eliminacion_finalizar_v2(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $finalizar356$
DECLARE o jsonb; posterior jsonb; auditoria uuid; instante timestamptz;
BEGIN
 o:=public.usuario_eliminacion_contexto_v2(p_operacion_id); posterior:=public.usuario_eliminacion_verificar_posterior_v2(p_operacion_id);
 IF o->>'estado'='COMPLETADA' THEN RETURN jsonb_build_object('resultado','YA_COMPLETADA','operacion_id',p_operacion_id,'auditoria_id',o->'auditoria_id','habilita_auth',false); END IF;
 IF o->>'estado'<>'AUTH_ELIMINADA' OR o->'dependencias_resumen'->'auth_eliminacion_verificada' IS DISTINCT FROM 'true'::jsonb THEN
   RAISE EXCEPTION 'FINALIZACION_V2_NO_CONFIRMADA'; END IF;
 IF EXISTS(SELECT 1 FROM public.del_registro_eliminaciones WHERE modulo='Administración de Usuarios' AND entidad_tipo='usuario' AND
    entidad_id=(o->>'objetivo_id')::uuid AND accion='ELIMINACION_PERMANENTE') THEN RAISE EXCEPTION 'AUDITORIA_V2_EXISTENTE_REQUIERE_REVISION'; END IF;
 instante:=clock_timestamp();
 INSERT INTO public.del_registro_eliminaciones(modulo,entidad_tipo,entidad_id,entidad_referencia,accion,motivo,dependencias_resumen,ejecutado_por,ejecutado_por_nombre_snapshot)
  VALUES('Administración de Usuarios','usuario',(o->>'objetivo_id')::uuid,o->>'objetivo_nombre_snapshot','ELIMINACION_PERMANENTE',o->>'motivo',
    jsonb_build_object('procedimiento','USUARIO_ELIMINACION_FINALIZAR_V2','operacion_id',p_operacion_id,'conservacion_posterior_v2',posterior),
    (o->>'actor_id')::uuid,o->>'actor_nombre_snapshot') RETURNING id INTO auditoria;
 UPDATE public.usuarios_eliminaciones_operaciones SET estado='COMPLETADA',auditoria_id=auditoria,ultimo_error_codigo=NULL,
   dependencias_resumen=dependencias_resumen||jsonb_build_object('conservacion_posterior_v2',posterior),updated_at=instante
   WHERE id=p_operacion_id AND estado='AUTH_ELIMINADA' AND intentos_auth=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINALIZACION_V2_CONFLICTO'; END IF;
 UPDATE public.usuarios_identidades_historicas SET operacion_id=p_operacion_id,auth_eliminado_en=instante
   WHERE cuenta_id=(o->>'objetivo_id')::uuid AND auth_eliminado_en IS NULL AND operacion_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'ARCHIVO_V2_CONFLICTO'; END IF;
 PERFORM public.usuario_eliminacion_verificar_posterior_v2(p_operacion_id);
 RETURN jsonb_build_object('resultado','COMPLETADA','operacion_id',p_operacion_id,'auditoria_id',auditoria,'habilita_auth',false);
END;
$finalizar356$;

-- Permiso documental específico. No autoriza DELETE de documentos, retiros ni
-- Storage; únicamente acredita la conservación para la cascada del perfil.
CREATE FUNCTION public.usuario_eliminacion_documentos_autorizados_v2(p_operacion jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $documentos356$
DECLARE c jsonb:=p_operacion->'dependencias_resumen'->'conservacion_integral_v2'; e jsonb;
BEGIN
 e:=p_operacion->'dependencias_resumen'->'ejecucion_integral_v2';
 IF c IS NULL OR c->>'version' IS DISTINCT FROM '2' OR c->'habilita_auth' IS DISTINCT FROM 'false'::jsonb OR
    c->>'sha256' IS DISTINCT FROM encode(sha256(convert_to((c-'sha256')::text,'UTF8')),'hex') OR
    e->>'certificado_sha256' IS DISTINCT FROM c->>'sha256' OR
    e->>'attempt_id' IS DISTINCT FROM p_operacion->'dependencias_resumen'->'paso191'->>'attempt_id' OR
    coalesce(e->>'attempt_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
    p_operacion->>'estado' NOT IN('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION','COMPLETADA') OR
    p_operacion->>'intentos_auth'<>'1' OR p_operacion->'dependencias_resumen'->'conservacion_historica_certificada' IS DISTINCT FROM 'true'::jsonb OR
    p_operacion->'dependencias_resumen'->'autorizacion_irreversible_confirmada' IS DISTINCT FROM 'true'::jsonb OR
    p_operacion->'dependencias_resumen'->'fisica_integral_v2'->'antes'->>'certificado_sha256' IS DISTINCT FROM c->>'sha256' THEN RETURN false; END IF;
 -- Todas las filas documentales y objetos originales deben seguir existiendo.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(c->'registros'->'public.cuentas_documentos'->'registros') x
    LEFT JOIN public.cuentas_documentos d ON d.id=(x->'clave'->>'id')::uuid
    WHERE d.id IS NULL OR x->>'sha256' IS DISTINCT FROM encode(sha256(convert_to(to_jsonb(d)::text,'UTF8')),'hex')) OR
    EXISTS(SELECT 1 FROM jsonb_array_elements(c->'registros'->'storage.objects'->'registros') x
    LEFT JOIN storage.objects s ON s.id=(x->'clave'->>'id')::uuid
    WHERE s.id IS NULL OR x->>'sha256' IS DISTINCT FROM encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex')) OR
    EXISTS(SELECT 1 FROM storage.objects WHERE owner=(p_operacion->>'objetivo_id')::uuid OR owner_id=p_operacion->>'objetivo_id') THEN RETURN false; END IF;
 RETURN true;
END;
$documentos356$;

CREATE FUNCTION public.usuario_eliminacion_renovacion_valida_v2(p_old jsonb,p_new jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $renovar358$
DECLARE a jsonb:=p_old->'dependencias_resumen'->'conservacion_integral_v2'; b jsonb:=p_new->'dependencias_resumen'->'conservacion_integral_v2';
 historial jsonb; previo jsonb; ultimo jsonb; base jsonb;
BEGIN
 IF a IS NULL OR b IS NULL OR current_user<>'postgres' OR session_user<>'postgres' OR
    auth.uid() IS DISTINCT FROM (p_old->>'actor_id')::uuid OR public.es_administrador_permanente_actual() IS DISTINCT FROM true OR
    p_old->>'estado' IS DISTINCT FROM 'PREPARADA' OR p_new->>'estado' IS DISTINCT FROM 'PREPARADA' OR
    p_old->>'intentos_auth' IS DISTINCT FROM '0' OR p_new->>'intentos_auth' IS DISTINCT FROM '0' OR
    p_old->'dependencias_resumen' ? 'ejecucion_integral_v2' OR p_new->'dependencias_resumen' ? 'ejecucion_integral_v2' OR
    p_old->'dependencias_resumen'->'autorizacion_irreversible_confirmada'='true'::jsonb OR
    p_new->'dependencias_resumen'->'autorizacion_irreversible_confirmada'='true'::jsonb OR
    p_new->'dependencias_resumen' ? 'fisica_integral_v2' THEN RETURN false; END IF;
 base:=public.usuario_eliminacion_validar_previa_v2((p_old->>'id')::uuid);
 IF b-ARRAY['sha256','revision','renovacion_de'] IS DISTINCT FROM base OR
    jsonb_typeof(a->'revision') IS DISTINCT FROM 'number' OR jsonb_typeof(b->'revision') IS DISTINCT FROM 'number' OR
    b->>'sha256' IS DISTINCT FROM encode(sha256(convert_to((b-'sha256')::text,'UTF8')),'hex') OR
    a->>'sha256' IS DISTINCT FROM encode(sha256(convert_to((a-'sha256')::text,'UTF8')),'hex') OR
    b->>'renovacion_de' IS DISTINCT FROM a->>'sha256' OR
    (b->>'revision')::integer IS DISTINCT FROM (a->>'revision')::integer+1 THEN RETURN false; END IF;
 historial:=p_new->'dependencias_resumen'->'certificados_anteriores_v2'; previo:=coalesce(p_old->'dependencias_resumen'->'certificados_anteriores_v2','[]'::jsonb);
 IF jsonb_typeof(historial) IS DISTINCT FROM 'array' OR jsonb_array_length(historial)<>jsonb_array_length(previo)+1 OR
    jsonb_array_length(historial)>16 OR octet_length(historial::text)>8388608 THEN RETURN false; END IF;
 ultimo:=historial->(jsonb_array_length(historial)-1);
 IF historial-(jsonb_array_length(historial)-1) IS DISTINCT FROM previo OR ultimo->'certificado' IS DISTINCT FROM a OR
    ultimo->'fisica' IS DISTINCT FROM coalesce(p_old->'dependencias_resumen'->'fisica_integral_v2','null'::jsonb) OR
    nullif(ultimo->>'renovado_en','') IS NULL THEN RETURN false; END IF;
 RETURN true;
END;
$renovar358$;

CREATE FUNCTION public.usuario_eliminacion_guard_certificado_v2()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp SET row_security=off
AS $guard356$
DECLARE a jsonb; b jsonb; ea jsonb; eb jsonb; fa jsonb; fb jsonb; p jsonb; fase text; comprobacion jsonb; renovacion boolean:=false;
BEGIN
 a:=OLD.dependencias_resumen->'conservacion_integral_v2';
 IF TG_OP='DELETE' THEN
  IF a IS NOT NULL THEN RAISE EXCEPTION 'CERTIFICADO_V2_INMUTABLE'; END IF;
  RETURN OLD;
 END IF;
 b:=NEW.dependencias_resumen->'conservacion_integral_v2';
 IF a IS NULL AND b IS NULL THEN
  IF NEW.dependencias_resumen ? 'ejecucion_integral_v2' OR NEW.dependencias_resumen ? 'fisica_integral_v2' OR
     NEW.dependencias_resumen ? 'conservacion_posterior_v2' OR NEW.dependencias_resumen ? 'certificados_anteriores_v2' THEN RAISE EXCEPTION 'EVIDENCIA_V2_SIN_CERTIFICADO'; END IF;
  RETURN NEW;
 END IF;
 IF a IS NOT NULL AND a IS DISTINCT FROM b THEN
  renovacion:=public.usuario_eliminacion_renovacion_valida_v2(to_jsonb(OLD),to_jsonb(NEW));
  IF renovacion IS DISTINCT FROM true THEN RAISE EXCEPTION 'CERTIFICADO_V2_INMUTABLE'; END IF;
 END IF;
 IF NOT renovacion AND OLD.dependencias_resumen->'certificados_anteriores_v2' IS DISTINCT FROM NEW.dependencias_resumen->'certificados_anteriores_v2' AND
    NOT(a IS NULL AND NEW.dependencias_resumen->'certificados_anteriores_v2'='[]'::jsonb) THEN RAISE EXCEPTION 'HISTORIAL_CERTIFICADOS_V2_INMUTABLE'; END IF;
 IF OLD.dependencias_resumen ? 'conservacion_posterior_v2' AND OLD.dependencias_resumen->'conservacion_posterior_v2'
    IS DISTINCT FROM NEW.dependencias_resumen->'conservacion_posterior_v2' THEN RAISE EXCEPTION 'POSTERIOR_V2_INMUTABLE'; END IF;
 IF current_user<>'postgres' OR session_user<>'postgres' OR auth.uid() IS DISTINCT FROM OLD.actor_id OR
    public.es_administrador_permanente_actual() IS DISTINCT FROM true OR
    NEW.id IS DISTINCT FROM OLD.id OR NEW.actor_id IS DISTINCT FROM OLD.actor_id OR NEW.objetivo_id IS DISTINCT FROM OLD.objetivo_id OR
    NEW.objetivo_nombre_snapshot IS DISTINCT FROM OLD.objetivo_nombre_snapshot OR NEW.actor_nombre_snapshot IS DISTINCT FROM OLD.actor_nombre_snapshot OR
    NEW.motivo IS DISTINCT FROM OLD.motivo OR NEW.dependencias_resumen->'paso191'->'request_id' IS DISTINCT FROM OLD.dependencias_resumen->'paso191'->'request_id' OR
    NEW.dependencias_resumen->'paso191'->'fingerprint' IS DISTINCT FROM OLD.dependencias_resumen->'paso191'->'fingerprint' THEN
  RAISE EXCEPTION 'TRANSICION_V2_NO_AUTORIZADA'; END IF;
 IF a IS NULL THEN
  comprobacion:=public.usuario_eliminacion_validar_previa_v2(OLD.id);
  IF b-ARRAY['sha256','revision','renovacion_de'] IS DISTINCT FROM comprobacion OR b->>'revision' IS DISTINCT FROM '1' OR
     b->'renovacion_de' IS DISTINCT FROM 'null'::jsonb OR b->>'sha256' IS DISTINCT FROM encode(sha256(convert_to((b-'sha256')::text,'UTF8')),'hex') OR
     NEW.estado<>'PREPARADA' OR NEW.intentos_auth<>0 THEN RAISE EXCEPTION 'CERTIFICADO_V2_NO_ACREDITADO'; END IF;
 END IF;
 ea:=OLD.dependencias_resumen->'ejecucion_integral_v2'; eb:=NEW.dependencias_resumen->'ejecucion_integral_v2';
 IF ea IS NOT NULL AND ea IS DISTINCT FROM eb THEN RAISE EXCEPTION 'INTENTO_V2_INMUTABLE'; END IF;
 IF ea IS NULL AND eb IS NOT NULL THEN
  IF public.usuario_eliminacion_v2_habilitada() IS DISTINCT FROM true OR OLD.estado<>'PREPARADA' OR OLD.intentos_auth<>0 OR
     NEW.estado<>'AUTH_EN_CURSO' OR NEW.intentos_auth<>1 OR
     public.usuario_eliminacion_documentos_autorizados_v2(to_jsonb(NEW)) IS DISTINCT FROM true THEN RAISE EXCEPTION 'INICIO_V2_NO_ACREDITADO'; END IF;
  p:=public.usuario_eliminacion_reautenticacion_v2(OLD.id,'inicio');
  IF (NEW.dependencias_resumen->'paso192'->'reauth'-'consumed_at') IS DISTINCT FROM (p-'consumed_at') OR
     jsonb_typeof(NEW.dependencias_resumen->'paso192'->'reauth'->'consumed_at') IS DISTINCT FROM 'number' OR
     (NEW.dependencias_resumen->'paso192'->'reauth'->>'consumed_at')::numeric<(p->>'verified_at')::numeric OR
     (NEW.dependencias_resumen->'paso192'->'reauth'->>'consumed_at')::numeric>=(p->>'expires_at')::numeric THEN RAISE EXCEPTION 'CONSUMO_REAUTH_V2_INVALIDO'; END IF;
 ELSIF OLD.estado IS DISTINCT FROM NEW.estado THEN
  IF ea IS NULL OR NEW.intentos_auth<>OLD.intentos_auth OR NOT(
     (OLD.estado IN('AUTH_EN_CURSO','REQUIERE_REVISION') AND NEW.estado='AUTH_ELIMINADA') OR
     (OLD.estado='AUTH_ELIMINADA' AND NEW.estado='COMPLETADA') OR
     (OLD.estado='AUTH_EN_CURSO' AND NEW.estado='REQUIERE_REVISION')) THEN RAISE EXCEPTION 'ESTADO_V2_NO_ADMITIDO'; END IF;
  IF NEW.estado IN('AUTH_ELIMINADA','COMPLETADA') THEN
   comprobacion:=public.usuario_eliminacion_verificar_posterior_v2(OLD.id);
   IF NEW.dependencias_resumen->'conservacion_posterior_v2' IS DISTINCT FROM comprobacion THEN RAISE EXCEPTION 'POSTERIOR_V2_NO_ACREDITADA'; END IF;
  END IF;
 END IF;
 IF eb IS NULL AND (NEW.estado<>'PREPARADA' OR NEW.intentos_auth<>0 OR
    NEW.dependencias_resumen->'autorizacion_irreversible_confirmada'='true'::jsonb) THEN RAISE EXCEPTION 'V2_NO_AUTORIZA_AUTH'; END IF;
 IF ea IS NOT NULL AND (NEW.intentos_auth<>1 OR NEW.dependencias_resumen->'paso191'->'attempt_id' IS DISTINCT FROM OLD.dependencias_resumen->'paso191'->'attempt_id' OR
    NEW.dependencias_resumen->'paso192'->'reauth' IS DISTINCT FROM OLD.dependencias_resumen->'paso192'->'reauth') THEN RAISE EXCEPTION 'INTENTO_V2_ALTERADO'; END IF;
 fa:=OLD.dependencias_resumen->'fisica_integral_v2'; fb:=NEW.dependencias_resumen->'fisica_integral_v2';
 IF fa IS DISTINCT FROM fb AND NOT renovacion THEN
  IF jsonb_typeof(fb) IS DISTINCT FROM 'object' OR (fb-ARRAY['antes','despues'])<>'{}'::jsonb OR
     (fa ? 'antes' AND fa->'antes' IS DISTINCT FROM fb->'antes') OR (fa ? 'despues' AND fa->'despues' IS DISTINCT FROM fb->'despues') THEN RAISE EXCEPTION 'FISICA_V2_INMUTABLE'; END IF;
  FOREACH fase IN ARRAY ARRAY['antes','despues'] LOOP
   IF fb ? fase AND (NOT coalesce(fa ? fase,false)) THEN
    p:=fb->fase;
    IF p->>'version' IS DISTINCT FROM '2' OR p->>'fase' IS DISTINCT FROM fase OR p->'habilita_auth' IS DISTINCT FROM 'false'::jsonb OR
       p->>'certificado_sha256' IS DISTINCT FROM b->>'sha256' OR p->>'sha256' IS DISTINCT FROM encode(sha256(convert_to((p-'sha256')::text,'UTF8')),'hex') OR
       (fase='antes' AND (OLD.estado<>'PREPARADA' OR OLD.intentos_auth<>0)) OR
       (fase='despues' AND (OLD.intentos_auth<>1 OR fb->'antes'->'objetos' IS DISTINCT FROM p->'objetos' OR
         EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.objetivo_id) OR EXISTS(SELECT 1 FROM public.usuarios WHERE id=OLD.objetivo_id))) THEN
     RAISE EXCEPTION 'FISICA_V2_NO_ACREDITADA'; END IF;
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END;
$guard356$;
CREATE TRIGGER zz_conservacion_certificado_v2 BEFORE UPDATE OR DELETE ON public.usuarios_eliminaciones_operaciones
FOR EACH ROW EXECUTE FUNCTION public.usuario_eliminacion_guard_certificado_v2();

-- El lock compartido de sentencia precede a los locks de filas. Misma coordinación
-- del piloto, aplicada a todas las relaciones certificadas (sin cambiar su RLS).
CREATE FUNCTION public.usuario_eliminacion_entrada_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET row_security=off
AS $entrada356$
BEGIN
 PERFORM pg_advisory_xact_lock_shared(209,1);
 RETURN NULL;
END;
$entrada356$;

CREATE FUNCTION public.usuario_eliminacion_guard_registros_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET row_security=off
AS $registros356$
DECLARE o record; amb jsonb; predicado text; relacionado boolean; fila jsonb; viejo jsonb; a uuid; w uuid;
 t uuid[]; s uuid[]; m uuid[]; h uuid[]; mc uuid[];
BEGIN
 IF TG_OP='UPDATE' AND to_jsonb(NEW)=to_jsonb(OLD) THEN RETURN NEW; END IF;
 SELECT r.predicado INTO STRICT predicado FROM public.usuario_eliminacion_relaciones_v2() r WHERE r.tabla=TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME;
 FOR o IN SELECT * FROM public.usuarios_eliminaciones_operaciones WHERE intentos_auth=1 AND
     estado IN('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION') AND dependencias_resumen ? 'ejecucion_integral_v2' LOOP
  IF TG_TABLE_NAME='usuarios_eliminaciones_operaciones' AND TG_TABLE_SCHEMA='public' AND
     TG_OP<>'INSERT' AND OLD.id=o.id THEN CONTINUE; END IF;
  amb:=o.dependencias_resumen->'conservacion_integral_v2'->'ambito'; a:=o.objetivo_id; w:=(amb->>'ficha')::uuid;
  SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO t FROM jsonb_array_elements_text(amb->'tareas');
  SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO s FROM jsonb_array_elements_text(amb->'solicitudes');
  SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO m FROM jsonb_array_elements_text(amb->'operativas');
  SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO h FROM jsonb_array_elements_text(amb->'historiales');
  SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO mc FROM jsonb_array_elements_text(amb->'mantenciones');
  viejo:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  FOREACH fila IN ARRAY ARRAY[viejo,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END] LOOP
   IF fila IS NULL THEN CONTINUE; END IF;
   EXECUTE format('SELECT (%s) IS TRUE FROM jsonb_populate_record(NULL::%I.%I,$9) t',predicado,TG_TABLE_SCHEMA,TG_TABLE_NAME)
     INTO relacionado USING a,w,t,s,m,h,mc,o.id,fila;
   IF relacionado THEN
    -- Solo la auditoría final exacta, en la transacción del actor original.
    IF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='del_registro_eliminaciones' AND TG_OP='INSERT' AND
       o.estado='AUTH_ELIMINADA' AND auth.uid()=o.actor_id AND public.es_administrador_permanente_actual() IS TRUE AND
       fila->>'modulo'='Administración de Usuarios' AND fila->>'entidad_tipo'='usuario' AND fila->>'accion'='ELIMINACION_PERMANENTE' AND
       fila->>'entidad_id'=o.objetivo_id::text AND fila->>'entidad_referencia'=o.objetivo_nombre_snapshot AND
       fila->>'ejecutado_por'=o.actor_id::text AND fila->>'ejecutado_por_nombre_snapshot'=o.actor_nombre_snapshot AND
       fila->>'motivo'=o.motivo AND fila->'dependencias_resumen'->>'operacion_id'=o.id::text THEN CONTINUE; END IF;
    RAISE EXCEPTION 'REGISTRO_RELACIONADO_EN_ELIMINACION_V2' USING ERRCODE='55000';
   END IF;
  END LOOP;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$registros356$;

DO $instalar_guardas356$
DECLARE r record; firma text; definicion text; anterior text; nueva text; huella text; n integer;
BEGIN
 IF md5(pg_get_functiondef('public.usuario_eliminacion_piloto_entrada_v1()'::regprocedure))<>'eb500a21c4cd76a01e208848f480fa6e' OR
    md5(pg_get_functiondef('public.usuario_eliminacion_piloto_guard_v1()'::regprocedure))<>'ad69cd1a9decbe5bf3ded0de5065cb52' OR
    md5(pg_get_functiondef('public.registrar_senal_cambio_sesion()'::regprocedure))<>'ceedb90bc1fa2c198a574cdd12257653' THEN
  RAISE EXCEPTION 'CONTRATO_356_DISTINTO'; END IF;
 FOR r IN SELECT * FROM public.usuario_eliminacion_relaciones_v2() LOOP
  -- Resolver columnas y tipos sin seleccionar datos; falla si el contrato difiere.
  EXECUTE format('SELECT count(*) FROM %s t WHERE false AND (%s)',r.tabla,r.predicado)
   USING NULL::uuid,NULL::uuid,ARRAY[]::uuid[],ARRAY[]::uuid[],ARRAY[]::uuid[],ARRAY[]::uuid[],ARRAY[]::uuid[],NULL::uuid;
  EXECUTE format('CREATE TRIGGER zz_conservacion_v2_entrada BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH STATEMENT EXECUTE FUNCTION public.usuario_eliminacion_entrada_v2()',r.tabla);
  EXECUTE format('CREATE TRIGGER zz_conservacion_v2_registro BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.usuario_eliminacion_guard_registros_v2()',r.tabla);
 END LOOP;
 -- Parche acotado de la barrera acreditada: las ramas V1 conservan su rechazo.
 definicion:=pg_get_functiondef('public.cuentas_documentos_barrera_fila_v1()'::regprocedure);
 IF md5(definicion)<>'86be85af4d5fdf402681657b9f781613' THEN RAISE EXCEPTION 'BARRERA_356_NO_ACREDITADA'; END IF;
 anterior:='IF NEW.estado = ''AUTH_EN_CURSO''';
 IF (length(definicion)-length(replace(definicion,anterior,'')))<>length(anterior) THEN RAISE EXCEPTION 'RAMA_OPERACION_356_DISTINTA'; END IF;
 definicion:=replace(definicion,anterior,anterior||' AND NOT public.usuario_eliminacion_documentos_autorizados_v2(to_jsonb(NEW))');
 anterior:='ELSIF TG_TABLE_NAME = ''usuarios'' AND TG_OP = ''DELETE'' THEN';
 IF (length(definicion)-length(replace(definicion,anterior,'')))<>length(anterior) THEN RAISE EXCEPTION 'RAMA_PERFIL_356_DISTINTA'; END IF;
 nueva:=anterior||chr(10)||'    IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.id) AND EXISTS(SELECT 1 FROM public.usuarios_eliminaciones_operaciones o WHERE o.objetivo_id=OLD.id AND o.estado=''AUTH_EN_CURSO'' AND public.usuario_eliminacion_documentos_autorizados_v2(to_jsonb(o))) THEN RETURN OLD; END IF;';
 definicion:=replace(definicion,anterior,nueva); EXECUTE definicion;
 huella:=md5(pg_get_functiondef('public.cuentas_documentos_barrera_fila_v1()'::regprocedure));
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND
    position('86be85af4d5fdf402681657b9f781613' in prosrc)>0 AND proname NOT IN
      ('usuario_eliminacion_documental_contrato_220_v1','cuentas_documentos_institucional_contexto_v1')) THEN
  RAISE EXCEPTION 'CONSUMIDOR_HUELLA_DOCUMENTAL_356_NO_ACREDITADO'; END IF;
 -- Actualización coordinada de verificadores, NO de MD5 acreditados del preflight.
 FOREACH firma IN ARRAY ARRAY['public.usuario_eliminacion_documental_contrato_220_v1()',
    'public.cuentas_documentos_institucional_contexto_v1()'] LOOP
  definicion:=pg_get_functiondef(to_regprocedure(firma));
  n:=(length(definicion)-length(replace(definicion,'86be85af4d5fdf402681657b9f781613','')))/32;
  IF n<>1 THEN RAISE EXCEPTION 'VERIFICADOR_BARRERA_356_DISTINTO'; END IF;
  EXECUTE replace(definicion,'86be85af4d5fdf402681657b9f781613',huella);
 END LOOP;
END;
$instalar_guardas356$;

-- PASO 365. Puertos de lectura privados para la Edge. No crean operaciones,
-- certificados ni reservas. Invocación únicamente en transacción READ ONLY.
CREATE FUNCTION public.usuario_eliminacion_resumen_v2(p_objetivo_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $resumen365$
DECLARE u public.usuarios%ROWTYPE; amb jsonb; r record; n bigint; resultado jsonb:='[]'::jsonb;
 t uuid[]; s uuid[]; m uuid[]; h uuid[]; mc uuid[]; ficha uuid; nombre_ficha text; individuales bigint; retiros bigint; migraciones bigint;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' OR current_setting('transaction_read_only')<>'on' OR
    auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR
    public.es_administrador_permanente_actual() IS DISTINCT FROM true THEN RAISE EXCEPTION 'RESUMEN_V2_NO_AUTORIZADO'; END IF;
 SELECT * INTO STRICT u FROM public.usuarios WHERE id=p_objetivo_id;
 amb:=public.usuario_eliminacion_ambito_v2(jsonb_build_object('objetivo_id',u.id)); ficha:=(amb->>'ficha')::uuid;
 IF ficha IS NOT NULL THEN SELECT nombre INTO STRICT nombre_ficha FROM public.trabajadores WHERE id=ficha; END IF;
 SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO t FROM jsonb_array_elements_text(amb->'tareas');
 SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO s FROM jsonb_array_elements_text(amb->'solicitudes');
 SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO m FROM jsonb_array_elements_text(amb->'operativas');
 SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO h FROM jsonb_array_elements_text(amb->'historiales');
 SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO mc FROM jsonb_array_elements_text(amb->'mantenciones');
 FOR r IN SELECT * FROM public.usuario_eliminacion_relaciones_v2() ORDER BY tabla LOOP
  EXECUTE format('SELECT count(*) FROM %s t WHERE (%s)',r.tabla,replace(r.predicado,'t.id<>$8','($8 IS NULL OR t.id<>$8)'))
    INTO n USING u.id,ficha,t,s,m,h,mc,NULL::uuid;
  resultado:=resultado||jsonb_build_array(jsonb_build_object('tabla',r.tabla,'cantidad',n));
 END LOOP;
 IF jsonb_array_length(resultado)<>46 THEN RAISE EXCEPTION 'RESUMEN_V2_INCOMPLETO'; END IF;
 SELECT count(*) INTO individuales FROM storage.objects WHERE owner=u.id OR owner_id=u.id::text;
 SELECT count(*) INTO retiros FROM public.cuentas_documentos_retiros ret WHERE ret.confirmado_en IS NULL AND
   (ret.cuenta_id=u.id OR ret.propietario_id=u.id OR ret.solicitado_por=u.id OR ret.autorizado_por=u.id OR
    EXISTS(SELECT 1 FROM public.cuentas_documentos d WHERE d.id=ret.documento_id AND (d.cuenta_id=u.id OR d.creado_por=u.id)));
 SELECT count(*) INTO migraciones FROM public.cuentas_documentos d WHERE (d.cuenta_id=u.id OR d.creado_por=u.id) AND
   d.migracion_institucional IS NOT NULL AND d.migracion_institucional->>'estado' IS DISTINCT FROM 'COMPLETADA';
 RETURN jsonb_build_object('contrato','usuario-eliminacion-resumen/v2','usuario_id',u.id,'comprobado_en',statement_timestamp(),
   'registros',resultado,'ficha_laboral',CASE WHEN ficha IS NULL THEN NULL ELSE jsonb_build_object('id',ficha,'nombre',nombre_ficha) END,
   'archivos_propiedad_individual',individuales,'retiros_pendientes',retiros,'migraciones_pendientes',migraciones,
   'conservacion_certificada',false,'verificacion_fisica','pendiente','eliminacion_habilitada',false,'puede_eliminar',false);
END;
$resumen365$;

-- Los contextos los construye la Edge DESPUÉS de leer cada registro con el rol
-- authenticated y su RLS real. No se aceptan UUID de cuentas desde el navegador.
CREATE FUNCTION public.usuario_eliminacion_identidades_consultar_v2(p_contextos jsonb)
RETURNS TABLE(registro_id uuid,origen_id uuid,referencia_id uuid,tipo text,cuenta_id uuid,nombre_snapshot text,cuenta_eliminada boolean)
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp SET row_security=off
AS $identidades365$
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' OR current_setting('transaction_read_only')<>'on' OR
    auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR
    public.usuario_habilitado_actual() IS DISTINCT FROM true THEN RAISE EXCEPTION 'IDENTIDADES_V2_NO_AUTORIZADAS'; END IF;
 IF jsonb_typeof(p_contextos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_contextos)>600 OR
    octet_length(p_contextos::text)>262144 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_contextos) x WHERE
      (x-ARRAY['registro_id','origen_id','tabla','referencia_id','tipo'])<>'{}'::jsonb OR coalesce(x->>'tipo','') NOT IN('cuenta','trabajador') OR
      x->>'registro_id' IS NULL OR x->>'origen_id' IS NULL OR x->>'referencia_id' IS NULL OR NOT EXISTS(
        SELECT 1 FROM public.usuario_eliminacion_relaciones_v2() r WHERE r.tabla=x->>'tabla')) THEN RAISE EXCEPTION 'CONTEXTO_IDENTIDAD_V2_INVALIDO'; END IF;
 IF EXISTS(WITH candidatos AS (
   SELECT c.registro_id,c.origen_id,c.referencia_id,c.tipo,h.cuenta_id FROM jsonb_to_recordset(p_contextos)
     AS c(registro_id uuid,origen_id uuid,referencia_id uuid,tipo text,tabla text)
   JOIN public.usuarios_identidades_historicas h ON (c.tipo='cuenta' AND h.cuenta_id=c.referencia_id) OR (c.tipo='trabajador' AND h.trabajador_id=c.referencia_id)
   JOIN public.usuarios_eliminaciones_operaciones o ON o.id=h.operacion_id
   WHERE h.auth_eliminado_en IS NOT NULL AND o.estado='COMPLETADA' AND c.tipo='trabajador' AND EXISTS(
     SELECT 1 FROM jsonb_array_elements(o.dependencias_resumen->'conservacion_integral_v2'->'registros'->c.tabla->'registros') k
       WHERE k->'clave'->>'id'=c.origen_id::text))
   SELECT 1 FROM candidatos GROUP BY candidatos.registro_id,candidatos.origen_id,candidatos.referencia_id,candidatos.tipo HAVING count(DISTINCT candidatos.cuenta_id)>1) THEN
   RAISE EXCEPTION 'IDENTIDAD_HISTORICA_V2_AMBIGUA'; END IF;
 RETURN QUERY SELECT DISTINCT c.registro_id,c.origen_id,c.referencia_id,c.tipo,h.cuenta_id,h.nombre_snapshot,true
 FROM jsonb_to_recordset(p_contextos) AS c(registro_id uuid,origen_id uuid,referencia_id uuid,tipo text,tabla text)
 JOIN public.usuarios_identidades_historicas h ON (c.tipo='cuenta' AND h.cuenta_id=c.referencia_id) OR (c.tipo='trabajador' AND h.trabajador_id=c.referencia_id)
 JOIN public.usuarios_eliminaciones_operaciones o ON o.id=h.operacion_id AND o.objetivo_id=h.cuenta_id
 JOIN public.del_registro_eliminaciones a ON a.id=o.auditoria_id
 WHERE h.auth_eliminado_en IS NOT NULL AND o.estado='COMPLETADA' AND o.intentos_auth=1 AND nullif(btrim(h.nombre_snapshot),'') IS NOT NULL
   AND h.nombre_snapshot=o.objetivo_nombre_snapshot AND a.entidad_id=h.cuenta_id AND a.ejecutado_por=o.actor_id
   AND a.modulo='Administración de Usuarios' AND a.entidad_tipo='usuario' AND a.accion='ELIMINACION_PERMANENTE'
   AND a.entidad_referencia=o.objetivo_nombre_snapshot AND a.ejecutado_por_nombre_snapshot=o.actor_nombre_snapshot AND a.motivo=o.motivo
   AND a.dependencias_resumen->>'operacion_id'=o.id::text
   AND o.dependencias_resumen->'conservacion_posterior_v2' @> '{"version":2,"verificada":true,"habilita_auth":false}'::jsonb
   AND o.dependencias_resumen->'conservacion_posterior_v2'->>'certificado_sha256'=o.dependencias_resumen->'conservacion_integral_v2'->>'sha256'
   AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=h.cuenta_id) AND NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=h.cuenta_id)
   AND (c.tipo='cuenta' OR (o.dependencias_resumen->'conservacion_integral_v2'->'ledger_laboral'->>'trabajador_actual'=c.referencia_id::text AND EXISTS(
     SELECT 1 FROM jsonb_array_elements(o.dependencias_resumen->'conservacion_integral_v2'->'registros'->c.tabla->'registros') k
       WHERE k->'clave'->>'id'=c.origen_id::text)));
END;
$identidades365$;

-- Privilegios exclusivamente postgres. Ninguno de estos puertos es una RPC pública.
DO $privilegios356$
DECLARE p record;
BEGIN
 FOR p IN SELECT oid,oid::regprocedure::text AS firma FROM pg_proc WHERE pronamespace='public'::regnamespace AND
   proname IN('usuario_eliminacion_v2_habilitada','usuario_eliminacion_contexto_v2','usuario_eliminacion_relaciones_v2',
    'usuario_eliminacion_predicado_tv_v2','usuario_eliminacion_renovacion_valida_v2',
    'usuario_eliminacion_resumen_v2','usuario_eliminacion_identidades_consultar_v2',
    'usuario_eliminacion_reactiva_relacionada_v2',
    'usuario_eliminacion_ambito_v2','usuario_eliminacion_catalogo_v2','usuario_eliminacion_fila_v2',
    'usuario_eliminacion_huellas_individuales_v2','usuario_eliminacion_estructura_v2','usuario_eliminacion_inventario_v2',
    'usuario_eliminacion_validar_previa_v2','usuario_eliminacion_preparar_v2','usuario_eliminacion_certificar_v2',
    'usuario_eliminacion_verificar_huellas_v2','usuario_eliminacion_registrar_fisica_v2','usuario_eliminacion_reautenticacion_v2',
    'usuario_eliminacion_iniciar_v2','usuario_eliminacion_verificar_posterior_v2','usuario_eliminacion_confirmar_auth_v2','usuario_eliminacion_recuperar_v2',
    'usuario_eliminacion_finalizar_v2','usuario_eliminacion_documentos_autorizados_v2','usuario_eliminacion_guard_certificado_v2',
    'usuario_eliminacion_entrada_v2','usuario_eliminacion_guard_registros_v2') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',p.firma);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',p.firma);
  IF has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE') OR
     has_function_privilege('service_role',p.oid,'EXECUTE') THEN RAISE EXCEPTION 'ACL_V2_NO_ACREDITADA'; END IF;
 END LOOP;
 IF public.usuario_eliminacion_v2_habilitada() IS DISTINCT FROM false OR
    (SELECT count(*) FROM public.usuario_eliminacion_relaciones_v2())<>46 THEN RAISE EXCEPTION 'CIERRE_V2_NO_ACREDITADO'; END IF;
END;
$privilegios356$;

-- PASO 358: pruebas funcionales opcionales, siempre dentro de subtransacción.
-- Para ejecutarlas manualmente, configurar ANTES de este DO (dentro de BEGIN):
-- SET LOCAL alm.ensayo_actor_v2='UUID administrador permanente elegido';
-- SET LOCAL alm.ensayo_objetivo_v2='UUID Técnico/Recepción elegido SIN operación pendiente ni archivos relacionados';
-- No se elige una cuenta automáticamente. No se crean identidades Auth ni se
-- modifica perfil/ficha/historia real. Solo dos reservas fixture, revertidas aquí.
-- Los claims/prueba son sintéticos: esto NO acredita JWT ni contraseña reales.
DO $pruebas_funcionales358$
DECLARE actor uuid:=nullif(current_setting('alm.ensayo_actor_v2',true),'')::uuid;
 objetivo uuid:=nullif(current_setting('alm.ensayo_objetivo_v2',true),'')::uuid;
 solicitud uuid:=gen_random_uuid(); op uuid; fixture uuid:=gen_random_uuid(); referencia uuid:=gen_random_uuid();
 sesion uuid:=gen_random_uuid(); nombre text; motivo text:='Ensayo reversible SQL V2 paso 358';
 huella text; perfil jsonb; resultado jsonb; c1 jsonb; c2 jsonb; ms numeric;
 rechazado boolean; finalizadas boolean:=false;
BEGIN
 IF public.usuario_eliminacion_v2_habilitada() IS DISTINCT FROM false THEN RAISE EXCEPTION 'PRUEBA358_COMPUERTA_ABIERTA'; END IF;
 IF actor IS NULL AND objetivo IS NULL THEN
  RAISE NOTICE 'PRUEBAS_FUNCIONALES_358_PENDIENTES: faltan UUID explícitos de ensayo; no se ejecutaron'; RETURN;
 END IF;
 IF actor IS NULL OR objetivo IS NULL OR actor=objetivo THEN RAISE EXCEPTION 'PRUEBA358_IDENTIDADES_REQUERIDAS'; END IF;
 IF EXISTS(SELECT 1 FROM public.usuarios_eliminaciones_operaciones WHERE objetivo_id=objetivo AND
    estado IN('PREPARADA','AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION')) THEN RAISE EXCEPTION 'PRUEBA358_NO_USAR_OPERACION_EXISTENTE'; END IF;
 SELECT t.nombre,to_jsonb(t) INTO STRICT nombre,perfil FROM public.usuarios t WHERE t.id=objetivo;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub',actor::text,true),set_config('request.jwt.claims',
    jsonb_build_object('sub',actor,'role','authenticated','session_id',sesion)::text,true);
  huella:=encode(sha256(convert_to('['||to_json(actor::text)::text||','||to_json(objetivo::text)::text||','||
    to_json(solicitud::text)::text||','||to_json(nombre)::text||','||to_json(motivo)::text||',true]','UTF8')),'hex');
  resultado:=public.usuario_eliminacion_preparar_v2(objetivo,nombre,motivo,true,solicitud,huella); op:=(resultado->>'operacion_id')::uuid;
  IF resultado->>'estado'<>'PREPARADA' OR resultado->'habilita_auth' IS DISTINCT FROM 'false'::jsonb OR
     public.usuario_eliminacion_preparar_v2(objetivo,nombre,motivo,true,solicitud,huella)->>'operacion_id'<>op::text THEN
   RAISE EXCEPTION 'PRUEBA358_PREPARACION_NO_IDEMPOTENTE'; END IF;
  c1:=public.usuario_eliminacion_certificar_v2(op);
  IF c1 IS DISTINCT FROM public.usuario_eliminacion_certificar_v2(op) OR c1->>'revision'<>'1' THEN RAISE EXCEPTION 'PRUEBA358_CERTIFICACION'; END IF;
  IF jsonb_array_length(c1->'inventario')<>0 THEN RAISE EXCEPTION 'PRUEBA358_ELEGIR_OBJETIVO_SIN_ARCHIVOS'; END IF;
  PERFORM public.usuario_eliminacion_verificar_huellas_v2(op);
  -- Cambio exclusivamente fixture: nueva referencia administrativa a la cuenta.
  INSERT INTO public.usuarios_eliminaciones_operaciones(id,objetivo_id,objetivo_nombre_snapshot,actor_id,actor_nombre_snapshot,motivo,estado,dependencias_resumen)
    VALUES(fixture,referencia,'Fixture SQL 358',objetivo,nombre,motivo,'PREPARADA','{"ensayo_358":true}'::jsonb);
  rechazado:=false;
  BEGIN
   PERFORM public.usuario_eliminacion_verificar_huellas_v2(op);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM<>'REGISTROS_INDIVIDUALES_V2_CAMBIARON' THEN RAISE; END IF; rechazado:=true;
  END;
  IF NOT rechazado THEN RAISE EXCEPTION 'PRUEBA358_HUELLA_CAMBIADA_ACEPTADA'; END IF;
  c2:=public.usuario_eliminacion_certificar_v2(op);
  IF c2->>'revision'<>'2' OR c2->>'renovacion_de' IS DISTINCT FROM c1->>'sha256' OR NOT EXISTS(
     SELECT 1 FROM public.usuarios_eliminaciones_operaciones WHERE id=op AND
       dependencias_resumen->'certificados_anteriores_v2'->0->'certificado'=c1) THEN RAISE EXCEPTION 'PRUEBA358_RENOVACION_SIN_TRAZA'; END IF;
  PERFORM public.usuario_eliminacion_verificar_huellas_v2(op);
  rechazado:=false;
  BEGIN
   UPDATE public.usuarios_eliminaciones_operaciones SET dependencias_resumen=jsonb_set(dependencias_resumen,
     '{conservacion_integral_v2,sha256}',to_jsonb(repeat('0',64))) WHERE id=op;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM<>'CERTIFICADO_V2_INMUTABLE' THEN RAISE; END IF; rechazado:=true;
  END;
  IF NOT rechazado THEN RAISE EXCEPTION 'PRUEBA358_CERTIFICADO_MANIPULADO_ACEPTADO'; END IF;
  PERFORM public.usuario_eliminacion_registrar_fisica_v2(op,'antes','[]'::jsonb);
  ms:=date_part('epoch',clock_timestamp())*1000;
  UPDATE public.usuarios_eliminaciones_operaciones SET dependencias_resumen=dependencias_resumen||jsonb_build_object('paso192',
    jsonb_build_object('reauth',jsonb_build_object('proof_id',gen_random_uuid(),'actor_id',actor,'target_id',objetivo,'operation_id',op,
      'request_id',solicitud,'fingerprint',huella,'session_id',sesion,'purpose','inicio','method','password',
      'verified_at',ms,'expires_at',ms+120000,'consumed_at',NULL))) WHERE id=op;
  rechazado:=false;
  BEGIN
   PERFORM public.usuario_eliminacion_iniciar_v2(op);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM<>'ELIMINACION_INTEGRAL_V2_DESHABILITADA' THEN RAISE; END IF; rechazado:=true;
  END;
  IF NOT rechazado OR NOT EXISTS(SELECT 1 FROM public.usuarios_eliminaciones_operaciones WHERE id=op AND estado='PREPARADA' AND intentos_auth=0) OR
     NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=objetivo AND estado IS TRUE) THEN RAISE EXCEPTION 'PRUEBA358_INICIO_NO_BLOQUEADO'; END IF;
  finalizadas:=true;
  RAISE EXCEPTION USING ERRCODE='ZX358',MESSAGE='REVERTIR_FIXTURES_358';
 EXCEPTION WHEN SQLSTATE 'ZX358' THEN
  IF NOT finalizadas THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.usuarios_eliminaciones_operaciones WHERE id IN(op,fixture)) OR
    NOT EXISTS(SELECT 1 FROM public.usuarios t WHERE id=objetivo AND to_jsonb(t)=perfil) OR
    NOT EXISTS(SELECT 1 FROM auth.users WHERE id=objetivo) THEN RAISE EXCEPTION 'PRUEBA358_REVERSION_INCOMPLETA'; END IF;
 RAISE NOTICE 'PRUEBAS_FUNCIONALES_358_OK: preparación, certificados, renovación, huellas, manipulación e inicio cerrado; fixtures revertidas';
END;
$pruebas_funcionales358$;

-- Verificaciones de instalación: solo catálogo; NO ejecutar funciones de conservación aquí.
DO $verificacion_migracion$
DECLARE r record; p record;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.usuarios_identidades_historicas'::regclass
      AND relrowsecurity AND relowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')) THEN
    RAISE EXCEPTION 'IDENTIDAD_PRIVADA_NO_ACREDITADA';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.usuarios_identidades_historicas'::regclass) THEN
    RAISE EXCEPTION 'POLITICAS_IDENTIDAD_NO_ADMITIDAS';
  END IF;
  FOR r IN SELECT * FROM (VALUES
    ('public.usuarios_identidad_historica_guardar_v1()',true),
    ('public.usuarios_identidad_historica_sincronizar_v1()',true),
    ('public.usuarios_identidad_historica_referencia_v1()',true),
    ('public.usuario_eliminacion_conservacion_previa_v1(uuid)',false),
    ('public.usuario_eliminacion_guard_conservacion_previa_v1()',false),
    ('public.usuario_eliminacion_fisica_transicion_v1(jsonb,jsonb)',false),
    ('public.usuario_eliminacion_guard_fisica_v1()',false),
    ('public.usuario_eliminacion_storage_verificar_v1(uuid)',false),
    ('public.usuario_eliminacion_conservar_storage_v1(uuid,text)',false),
    ('public.usuario_eliminacion_guard_documentos_storage_v1()',true)
  ) f(firma,definidor) LOOP
    IF to_regprocedure(r.firma) IS NULL THEN RAISE EXCEPTION 'FUNCION_CONSERVACION_AUSENTE'; END IF;
    SELECT * INTO STRICT p FROM pg_proc WHERE oid=to_regprocedure(r.firma);
    IF p.proowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres') OR p.prosecdef IS DISTINCT FROM r.definidor OR
       ('search_path=pg_catalog, pg_temp'=ANY(p.proconfig)) IS DISTINCT FROM true OR
       has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE') OR
       has_function_privilege('service_role',p.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'PRIVILEGIOS_FUNCION_NO_ACREDITADOS';
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.usuarios_sesion_cambios'::regclass
      AND polname='usuarios_sesion_cambios_lector_habilitado_v1' AND NOT polpermissive AND polcmd='r'
      AND polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')]) THEN
    RAISE EXCEPTION 'RLS_SESION_NO_ACREDITADA';
  END IF;
  FOR r IN SELECT * FROM (VALUES
    ('public.usuarios_identidades_historicas','usuarios_identidad_historica_inmutable','public.usuarios_identidad_historica_guardar_v1()'),
    ('public.usuarios','zz_usuarios_identidad_historica_sincronizar','public.usuarios_identidad_historica_sincronizar_v1()'),
    ('public.usuarios_eliminaciones_operaciones','zz_usuario_eliminacion_conservacion_previa','public.usuario_eliminacion_guard_conservacion_previa_v1()'),
    ('public.usuarios_eliminaciones_operaciones','zz_conservacion_documental_operacion','public.usuario_eliminacion_guard_documentos_storage_v1()'),
    ('public.usuarios_eliminaciones_operaciones','zz_conservacion_fisica','public.usuario_eliminacion_guard_fisica_v1()'),
    ('storage.objects','zz_conservacion_documental_objeto','public.usuario_eliminacion_guard_documentos_storage_v1()'),
    ('public.cuentas_documentos','zz_conservacion_documental_cuenta','public.usuario_eliminacion_guard_documentos_storage_v1()'),
    ('public.trabajadores_documentos','zz_conservacion_documental_trabajador','public.usuario_eliminacion_guard_documentos_storage_v1()'),
    ('public.prevencion_documentos','zz_conservacion_documental_prevencion','public.usuario_eliminacion_guard_documentos_storage_v1()')
  ) v(tabla,nombre,firma) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass(r.tabla) AND tgname=r.nombre
      AND tgfoid=to_regprocedure(r.firma) AND NOT tgisinternal AND tgenabled IN ('O','A')) THEN
      RAISE EXCEPTION 'TRIGGER_CONSERVACION_NO_ACREDITADO';
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM (VALUES ('tareas','responsable_id'),('mantenciones','responsable_id'),('alertas','usuario_id'),
    ('solicitudes_reactivas_avisos_estado','usuario_id'),('usuarios_correos_verificados','usuario_id'),('usuarios_sesion_cambios','usuario_id')) v(tabla,columna) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1]
      JOIN pg_attribute b ON b.attrelid=k.confrelid AND b.attnum=k.confkey[1]
      WHERE k.conrelid=to_regclass('public.'||r.tabla) AND k.contype='f' AND k.convalidated
        AND cardinality(k.conkey)=1 AND cardinality(k.confkey)=1 AND a.attname=r.columna AND b.attname='cuenta_id'
        AND k.confrelid='public.usuarios_identidades_historicas'::regclass AND k.confdeltype='r') THEN
      RAISE EXCEPTION 'FK_FINAL_NO_ACREDITADA';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||r.tabla)
      AND tgname='zz_identidad_historica_'||r.tabla
      AND tgfoid='public.usuarios_identidad_historica_referencia_v1()'::regprocedure AND tgenabled IN ('O','A')) THEN
      RAISE EXCEPTION 'GUARDA_REFERENCIA_NO_ACREDITADA';
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.usuarios_identidades_historicas WHERE auth_eliminado_en IS NOT NULL) OR
     (SELECT count(*) FROM public.usuarios_identidades_historicas)<>(SELECT count(*) FROM public.usuarios) THEN
    RAISE EXCEPTION 'SEMILLA_HISTORICA_NO_ACREDITADA';
  END IF;
END;
$verificacion_migracion$;

    instalacion_comprobada:=true;
    RAISE EXCEPTION USING ERRCODE='ZX901',MESSAGE='ROLLBACK_INTERNO_DELIBERADO';
  EXCEPTION WHEN SQLSTATE 'ZX901' THEN
    IF NOT instalacion_comprobada THEN RAISE; END IF;
    -- Solo este código emitido DESPUÉS de los postflight se captura.
    -- PostgreSQL ya revirtió íntegramente la subtransacción DDL/DML.
  END;

  SELECT encode(sha256(convert_to(coalesce(jsonb_agg(j ORDER BY j::text),'[]'::jsonb)::text,'UTF8')),'hex')
    INTO catalogo_despues FROM (
      SELECT jsonb_build_array('REL',c.oid,to_jsonb(c)) AS j FROM pg_class c
        WHERE c.relnamespace IN ('public'::regnamespace,'storage'::regnamespace)
      UNION ALL SELECT jsonb_build_array('ATTR',a.attrelid,a.attnum,to_jsonb(a)) FROM pg_attribute a
        JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace IN ('public'::regnamespace,'storage'::regnamespace)
      UNION ALL SELECT jsonb_build_array('CONSTRAINT',k.oid,to_jsonb(k),pg_get_constraintdef(k.oid)) FROM pg_constraint k
        JOIN pg_class c ON c.oid=k.conrelid WHERE c.relnamespace IN ('public'::regnamespace,'storage'::regnamespace)
      UNION ALL SELECT jsonb_build_array('TRIGGER',t.oid,to_jsonb(t),pg_get_triggerdef(t.oid)) FROM pg_trigger t
        JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace IN ('public'::regnamespace,'storage'::regnamespace)
      UNION ALL SELECT jsonb_build_array('POLICY',p.oid,to_jsonb(p)) FROM pg_policy p
        JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace IN ('public'::regnamespace,'storage'::regnamespace)
      UNION ALL SELECT jsonb_build_array('FUNC',p.oid,to_jsonb(p),pg_get_functiondef(p.oid)) FROM pg_proc p
        WHERE p.pronamespace IN ('public'::regnamespace,'storage'::regnamespace) AND p.prokind IN ('f','p')
    ) AS estado;

  IF catalogo_antes IS DISTINCT FROM catalogo_despues OR
     to_regclass('public.usuarios_identidades_historicas') IS NOT NULL OR
     to_regprocedure('public.usuario_eliminacion_conservar_storage_v1(uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'ENSAYO_REVERSION_NO_ACREDITADA';
  END IF;
  RAISE NOTICE 'ENSAYO_CONSERVACION_OK: instalación/FK/triggers/RLS comprobados y revertidos; habilita_auth=false';
END;
$ensayo_reversible$;
ROLLBACK;

