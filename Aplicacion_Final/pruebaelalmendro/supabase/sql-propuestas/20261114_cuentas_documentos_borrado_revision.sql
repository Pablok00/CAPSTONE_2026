-- PASO 218.1 / 217: ensayo completo reversible; NO ejecutar fragmentos ni sustituir ROLLBACK.
-- No ejecutado/compilado en PostgreSQL local. habilita_auth=false. No llama Auth ni Storage API.
-- No prueba borrados con datos reales. Sin recibo permanente, una respuesta perdida requiere revisión.
-- Instalar definitivamente solo tras autorizar y validar este ensayo; primero217, después conservación.
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

DO $preflight_217$
DECLARE x record;
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'ENSAYO_REQUIERE_POSTGRES';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'AISLAMIENTO_DOCUMENTAL_NO_ADMITIDO';
  END IF;
  FOR x IN SELECT * FROM (VALUES
    ('public.cuentas_documentos_barrera_entrada_v1()','4085aa62ed260da05099fd264869a5d1'),
    ('public.cuentas_documentos_barrera_fila_v1()','f6cedba16de88a3d6fb1c4baa971607e'),
    ('public.cuentas_documentos_confirmar_retiro_v1(uuid)','edd9ada5804c7033625552cdbc58e2a8'),
    ('public.cuentas_documentos_reservar_retiro_v1(uuid,uuid,boolean,uuid)','d54bc3eb5408acb9e2646bbec4c801a4')
  ) AS c(firma,huella) LOOP
    IF to_regprocedure(x.firma) IS NULL OR
       md5(pg_get_functiondef(to_regprocedure(x.firma))) IS DISTINCT FROM x.huella OR
       (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure(x.firma)) <> 'postgres'
    THEN RAISE EXCEPTION 'CONTRATO_DOCUMENTAL_CAMBIO'; END IF;
  END LOOP;
  IF to_regclass('public.cuentas_documentos_borrado_capacidad_v1') IS NOT NULL OR
     to_regprocedure('public.cuentas_documentos_borrado_guard_v1()') IS NOT NULL OR
     to_regprocedure('public.cuentas_documentos_borrado_validar_v1(text,jsonb)') IS NOT NULL OR
     to_regprocedure('public.cuentas_documentos_retiro_identidad_v1(jsonb,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'PROPUESTA_217_YA_EXISTE';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE
    conrelid='public.cuentas_documentos_retiros'::regclass AND
    confrelid='public.cuentas_documentos'::regclass AND
    conname='cuentas_documentos_retiros_documento_id_fkey' AND contype='f' AND
    confdeltype='r' AND convalidated AND
    pg_get_constraintdef(oid)='FOREIGN KEY (documento_id) REFERENCES cuentas_documentos(id) ON DELETE RESTRICT') THEN
    RAISE EXCEPTION 'FK_RESTRICT_NO_ACREDITADA';
  END IF;
  -- Un DELETE adicional podría causar cascadas: ninguna relación entrante se supone segura.
  IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND
    confrelid IN ('public.cuentas_documentos'::regclass,'public.cuentas_documentos_retiros'::regclass) AND
    conname <> 'cuentas_documentos_retiros_documento_id_fkey') THEN
    RAISE EXCEPTION 'FK_ENTRANTE_NO_ACREDITADA';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.cuentas_documentos_retiros'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'TRIGGER_RETIRO_NO_ACREDITADO';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN
      ('public.cuentas_documentos'::regclass,'public.cuentas_documentos_retiros'::regclass) AND NOT relrowsecurity) OR
     EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class IN
      ('public.cuentas_documentos'::regclass,'public.cuentas_documentos_retiros'::regclass)) THEN
    RAISE EXCEPTION 'RLS_O_REGLA_DOCUMENTAL_NO_ACREDITADA';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.cuentas_documentos'::regclass AND NOT tgisinternal
     AND (tgtype::integer & 8)<>0 AND
     (tgenabled NOT IN ('O','A') OR tgfoid NOT IN
       ('public.cuentas_documentos_barrera_entrada_v1()'::regprocedure,'public.cuentas_documentos_barrera_fila_v1()'::regprocedure))) OR
     NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.cuentas_documentos'::regclass AND NOT tgisinternal
       AND tgfoid='public.cuentas_documentos_barrera_fila_v1()'::regprocedure AND
       (tgtype::integer & 11)=11 AND tgenabled IN ('O','A')) OR
     NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.cuentas_documentos'::regclass AND NOT tgisinternal
       AND tgfoid='public.cuentas_documentos_barrera_entrada_v1()'::regprocedure AND
       (tgtype::integer & 11)=10 AND tgenabled IN ('O','A')) THEN
    RAISE EXCEPTION 'TRIGGERS_DELETE_DOCUMENTALES_NO_ACREDITADOS';
  END IF;
  IF EXISTS(SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) r(rol)
    CROSS JOIN (VALUES ('public.cuentas_documentos'),('public.cuentas_documentos_retiros')) t(tabla)
    WHERE has_table_privilege(r.rol,t.tabla,'DELETE') OR has_table_privilege(r.rol,t.tabla,'TRUNCATE')) THEN
    RAISE EXCEPTION 'BORRADO_DIRECTO_NO_BLOQUEADO';
  END IF;
  -- No se modifica ninguna ACL existente. Fallar ante una API diferente de la acreditada.
  IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid IN ('public.cuentas_documentos_confirmar_retiro_v1(uuid)'::regprocedure,
      'public.cuentas_documentos_reservar_retiro_v1(uuid,uuid,boolean,uuid)'::regprocedure)
    AND a.privilege_type='EXECUTE' AND
      (a.grantee=0 OR pg_get_userbyid(a.grantee) NOT IN ('postgres','authenticated'))) THEN
    RAISE EXCEPTION 'ACL_DOCUMENTAL_NO_ACREDITADA';
  END IF;
END;
$preflight_217$;

-- Tabla privada permanente con filas efímeras, no tabla TEMP ni historial: vacía al COMMIT.
-- Necesaria para autorizar el segundo DELETE después de consumir el retiro por RESTRICT.
-- Un GUC o pg_trigger_depth() falsificable no sustituye esta evidencia privada.
-- No contiene contraseñas, archivos ni recibos persistentes. Solo la RPC puede escribirla.
CREATE TABLE public.cuentas_documentos_borrado_capacidad_v1 (
  transaccion xid8 NOT NULL,
  backend integer NOT NULL,
  documento_id uuid NOT NULL,
  operacion_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  documento jsonb NOT NULL CHECK (jsonb_typeof(documento)='object'),
  retiro jsonb NOT NULL CHECK (jsonb_typeof(retiro)='object'),
  PRIMARY KEY (transaccion,backend,documento_id),
  UNIQUE (transaccion,backend,operacion_id)
);
ALTER TABLE public.cuentas_documentos_borrado_capacidad_v1 OWNER TO postgres;
ALTER TABLE public.cuentas_documentos_borrado_capacidad_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cuentas_documentos_borrado_capacidad_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.cuentas_documentos_retiro_identidad_v1(d jsonb,r jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $identidad$
 SELECT coalesce(
   jsonb_typeof(d)='object' AND jsonb_typeof(r)='object' AND
   nullif(d->>'id','') IS NOT NULL AND nullif(r->>'id','') IS NOT NULL AND
   nullif(d->>'cuenta_id','') IS NOT NULL AND nullif(d->>'creado_por','') IS NOT NULL AND
   nullif(d->>'storage_object_id','') IS NOT NULL AND nullif(d->>'storage_version','') IS NOT NULL AND
   d->>'estado_reserva'='disponible' AND d->>'bucket_id'='documentos-cuentas' AND
   d->>'storage_path'='cuentas/'||(d->>'cuenta_id')||'/'||(d->>'id') AND
   r->>'documento_id'=d->>'id' AND r->>'cuenta_id'=d->>'cuenta_id' AND
   r->>'bucket_id'=d->>'bucket_id' AND r->>'storage_path'=d->>'storage_path' AND
   r->>'objeto_id'=d->>'storage_object_id' AND r->>'objeto_version'=d->>'storage_version' AND
   r->>'propietario_id'=d->>'creado_por',false);
$identidad$;
REVOKE ALL ON FUNCTION public.cuentas_documentos_retiro_identidad_v1(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.cuentas_documentos_borrado_validar_v1(tipo text,fila jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $validar$
DECLARE c public.cuentas_documentos_borrado_capacidad_v1%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL OR
     public.es_administrador_actual() IS NOT TRUE THEN
    RAISE EXCEPTION 'RETIRO_NO_AUTORIZADO' USING ERRCODE='42501';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'AISLAMIENTO_DOCUMENTAL_NO_ADMITIDO';
  END IF;
  SELECT * INTO c FROM public.cuentas_documentos_borrado_capacidad_v1
    WHERE transaccion=pg_current_xact_id() AND backend=pg_backend_pid() AND actor_id=auth.uid()
      AND ((tipo='documento' AND documento_id::text=fila->>'id') OR
           (tipo='retiro' AND operacion_id::text=fila->>'id'));
  IF NOT FOUND OR NOT public.cuentas_documentos_retiro_identidad_v1(c.documento,c.retiro) OR
     nullif(c.retiro->>'confirmado_en','') IS NULL OR nullif(c.retiro->>'confirmado_por','') IS NULL OR
     (tipo='documento' AND fila IS DISTINCT FROM c.documento) OR
     (tipo='retiro' AND fila IS DISTINCT FROM c.retiro) OR tipo NOT IN ('documento','retiro') THEN
    RAISE EXCEPTION 'BORRADO_METADATA_DOCUMENTAL_NO_PERMITIDO' USING ERRCODE='55000';
  END IF;
  IF tipo='retiro' AND NOT EXISTS(SELECT 1 FROM public.cuentas_documentos d
      WHERE d.id=c.documento_id AND to_jsonb(d)=c.documento) THEN
    RAISE EXCEPTION 'EVIDENCIA_DOCUMENTAL_DISTINTA';
  END IF;
  IF tipo='documento' AND EXISTS(SELECT 1 FROM public.cuentas_documentos_retiros r
      WHERE r.documento_id=c.documento_id) THEN
    RAISE EXCEPTION 'RETIRO_NO_CONSUMIDO';
  END IF;
  -- La RPC ya mantiene SHARE sobre Storage: no puede reaparecer una ruta entre chequeo y DELETE.
  IF EXISTS(SELECT 1 FROM storage.objects o WHERE
     (o.bucket_id=c.documento->>'bucket_id' AND o.name=c.documento->>'storage_path') OR
      o.id::text=c.documento->>'storage_object_id') THEN
    RAISE EXCEPTION 'OBJETO_STORAGE_NO_AUSENTE';
  END IF;
END;
$validar$;
REVOKE ALL ON FUNCTION public.cuentas_documentos_borrado_validar_v1(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.cuentas_documentos_borrado_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $guard$
BEGIN
  IF TG_TABLE_NAME='cuentas_documentos_borrado_capacidad_v1' THEN
    IF EXISTS(SELECT 1 FROM public.cuentas_documentos_borrado_capacidad_v1
      WHERE transaccion=NEW.transaccion AND backend=NEW.backend AND documento_id=NEW.documento_id) THEN
      RAISE EXCEPTION 'CAPACIDAD_DOCUMENTAL_NO_CONSUMIDA';
    END IF;
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME='cuentas_documentos_retiros' AND TG_OP='DELETE' THEN
    PERFORM public.cuentas_documentos_borrado_validar_v1('retiro',to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'EVENTO_DOCUMENTAL_NO_ADMITIDO';
END;
$guard$;
REVOKE ALL ON FUNCTION public.cuentas_documentos_borrado_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER cuentas_documentos_capacidad_consumida_v1
AFTER INSERT OR UPDATE ON public.cuentas_documentos_borrado_capacidad_v1
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.cuentas_documentos_borrado_guard_v1();
CREATE TRIGGER cuentas_documentos_retiro_borrado_guard_v1
BEFORE DELETE ON public.cuentas_documentos_retiros
FOR EACH ROW EXECUTE FUNCTION public.cuentas_documentos_borrado_guard_v1();

-- Solo cambia la rama DELETE. INSERT/UPDATE y barreras de eliminación de cuenta permanecen exactas.
CREATE OR REPLACE FUNCTION public.cuentas_documentos_barrera_fila_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' THEN
    RAISE EXCEPTION 'RELACION_DOCUMENTAL_NO_ADMITIDA';
  END IF;

  IF TG_TABLE_NAME = 'usuarios_eliminaciones_operaciones' THEN

    -- También cubre el retorno a AUTH_EN_CURSO de SQL233.
    IF NEW.estado = 'AUTH_EN_CURSO'
       AND EXISTS (
         SELECT 1
         FROM public.cuentas_documentos AS d
         WHERE d.cuenta_id = NEW.objetivo_id
            OR d.creado_por = NEW.objetivo_id
       )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'DOCUMENTOS_CUENTA_NO_CERTIFICADOS';
    END IF;

    RETURN NEW;

  ELSIF TG_TABLE_NAME = 'usuarios' AND TG_OP = 'DELETE' THEN

    -- Incluye DELETE directo y cascada procedente de Auth.
    IF EXISTS (
      SELECT 1
      FROM public.cuentas_documentos AS d
      WHERE d.cuenta_id = OLD.id
         OR d.creado_por = OLD.id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'DOCUMENTOS_CUENTA_IMPIDEN_BORRADO';
    END IF;

    RETURN OLD;

  ELSIF TG_TABLE_NAME = 'cuentas_documentos' THEN

    IF TG_OP IN ('INSERT','UPDATE') THEN
      DECLARE
        v_actor_id uuid := auth.uid();
        v_actor public.usuarios%ROWTYPE;
        v_cuenta public.usuarios%ROWTYPE;
        v_rol text;
        v_obj jsonb;
      BEGIN
        IF auth.role() IS DISTINCT FROM 'authenticated'
           OR v_actor_id IS NULL
           OR public.es_administrador_actual() IS NOT TRUE
        THEN
          RAISE EXCEPTION 'SOLO_ADMINISTRADOR_PERMANENTE';
        END IF;

        PERFORM u.id
        FROM public.usuarios u
        WHERE u.id IN (
          v_actor_id, NEW.cuenta_id, NEW.creado_por
        )
        ORDER BY u.id
        FOR SHARE NOWAIT;

        PERFORM r.id
        FROM public.roles r
        WHERE r.id IN (
          SELECT u.rol_id
          FROM public.usuarios u
          WHERE u.id IN (
            v_actor_id, NEW.cuenta_id, NEW.creado_por
          )
        )
        ORDER BY r.id
        FOR SHARE NOWAIT;

        SELECT * INTO v_actor
        FROM public.usuarios
        WHERE id=v_actor_id;

        SELECT * INTO v_cuenta
        FROM public.usuarios
        WHERE id=NEW.cuenta_id;

        SELECT r.nombre INTO v_rol
        FROM public.roles r
        WHERE r.id=v_cuenta.rol_id;

        IF v_actor.id IS NULL
           OR v_actor.estado IS NOT TRUE
           OR public.es_administrador_actual() IS NOT TRUE
           OR v_cuenta.id IS NULL
           OR lower(btrim(coalesce(v_rol,''))) NOT IN (
             'recepcion','recepción','tecnico','técnico','administrador'
           )
           OR NOT EXISTS (
             SELECT 1 FROM auth.users WHERE id=v_actor_id
           )
           OR NOT EXISTS (
             SELECT 1 FROM auth.users WHERE id=NEW.cuenta_id
           )
        THEN
          RAISE EXCEPTION 'IDENTIDADES_DOCUMENTALES_NO_AUTORIZADAS';
        END IF;

        IF TG_OP='INSERT' THEN
          IF NEW.creado_por IS NOT NULL
             OR NEW.cuenta_nombre_snapshot IS NOT NULL
             OR NEW.cuenta_rol_snapshot IS NOT NULL
             OR NEW.creado_por_nombre_snapshot IS NOT NULL
             OR NEW.estado_reserva IS DISTINCT FROM 'pendiente'
             OR NEW.storage_object_id IS NOT NULL
             OR NEW.storage_version IS NOT NULL
             OR NEW.mime_type_verificado IS NOT NULL
             OR NEW.tamano_bytes_verificado IS NOT NULL
             OR NEW.sha256_verificado IS NOT NULL
             OR NEW.verificado_en IS NOT NULL
          THEN
            RAISE EXCEPTION 'INSERT_DOCUMENTAL_MANIPULADO';
          END IF;

          NEW.creado_por := v_actor_id;
          NEW.creado_por_nombre_snapshot := v_actor.nombre;
          NEW.cuenta_nombre_snapshot := v_cuenta.nombre;
          NEW.cuenta_rol_snapshot := v_rol;

        ELSE
          IF NEW.nombre_original
               IS DISTINCT FROM OLD.nombre_original
             OR NEW.mime_type_declarado
               IS DISTINCT FROM OLD.mime_type_declarado
             OR NEW.tamano_bytes_declarado
               IS DISTINCT FROM OLD.tamano_bytes_declarado
             OR NEW.created_at
               IS DISTINCT FROM OLD.created_at
          THEN
            RAISE EXCEPTION 'DECLARACION_DOCUMENTAL_INMUTABLE';
          END IF;

          IF OLD.estado_reserva='disponible' THEN
            IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
              RAISE EXCEPTION 'DOCUMENTO_DISPONIBLE_INMUTABLE';
            END IF;

          ELSIF OLD.estado_reserva='pendiente'
                AND NEW.estado_reserva='requiere_revision'
          THEN
            IF NEW.storage_object_id IS NOT NULL
               OR NEW.storage_version IS NOT NULL
               OR NEW.mime_type_verificado IS NOT NULL
               OR NEW.tamano_bytes_verificado IS NOT NULL
               OR NEW.sha256_verificado IS NOT NULL
               OR NEW.verificado_en IS NOT NULL
            THEN
              RAISE EXCEPTION 'REVISION_CON_EVIDENCIA_NO_ADMITIDA';
            END IF;

          ELSIF OLD.estado_reserva IS DISTINCT FROM 'pendiente'
                OR NEW.estado_reserva IS DISTINCT FROM 'disponible'
          THEN
            RAISE EXCEPTION 'TRANSICION_DOCUMENTAL_NO_ADMITIDA';
          END IF;

          IF NEW.estado_reserva='disponible' THEN
            SELECT to_jsonb(s) INTO v_obj
            FROM storage.objects s
            WHERE s.bucket_id=OLD.bucket_id
              AND s.name=OLD.storage_path
            FOR SHARE NOWAIT;

            IF v_obj IS NULL
               OR NOT (v_obj ? 'owner_id')
               OR v_obj->>'owner_id'
                    IS DISTINCT FROM OLD.creado_por::text
               OR v_obj->>'id'
                    IS DISTINCT FROM NEW.storage_object_id::text
               OR nullif(v_obj->>'version','') IS NULL
               OR v_obj->>'version'
                    IS DISTINCT FROM NEW.storage_version
               OR (v_obj->'metadata'->'size')
                    IS DISTINCT FROM to_jsonb(OLD.tamano_bytes_declarado)
               OR v_obj->'metadata'->>'mimetype'
                    IS DISTINCT FROM OLD.mime_type_declarado
               OR NEW.sha256_verificado IS NULL
               OR NEW.sha256_verificado !~ '^[0-9a-f]{64}$'
            THEN
              RAISE EXCEPTION 'OBJETO_STORAGE_NO_COINCIDE';
            END IF;

            NEW.storage_object_id := (v_obj->>'id')::uuid;
            NEW.storage_version := v_obj->>'version';
            NEW.mime_type_verificado :=
              v_obj->'metadata'->>'mimetype';
            NEW.tamano_bytes_verificado :=
              OLD.tamano_bytes_declarado;

            IF OLD.estado_reserva='pendiente' THEN
              NEW.verificado_en := clock_timestamp();
            END IF;
          END IF;
        END IF;
      END;
    END IF;



    IF TG_OP = 'DELETE' THEN
      -- Capacidad privada de esta transacción; no se autoriza mediante GUC del cliente.
      PERFORM public.cuentas_documentos_borrado_validar_v1('documento', to_jsonb(OLD));
      RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF NEW.id IS DISTINCT FROM OLD.id
         OR NEW.cuenta_id IS DISTINCT FROM OLD.cuenta_id
         OR NEW.creado_por IS DISTINCT FROM OLD.creado_por
         OR NEW.cuenta_nombre_snapshot
              IS DISTINCT FROM OLD.cuenta_nombre_snapshot
         OR NEW.cuenta_rol_snapshot
              IS DISTINCT FROM OLD.cuenta_rol_snapshot
         OR NEW.creado_por_nombre_snapshot
              IS DISTINCT FROM OLD.creado_por_nombre_snapshot
         OR NEW.bucket_id IS DISTINCT FROM OLD.bucket_id
         OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
      THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'IDENTIDAD_DOCUMENTAL_INMUTABLE';
      END IF;
    END IF;

    -- No autoriza crear documentos para perfiles desaparecidos.
    -- SELECT histórico no se ve afectado.
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE id = NEW.cuenta_id
    ) OR NOT EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE id = NEW.creado_por AND estado IS TRUE
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'IDENTIDAD_DOCUMENTAL_NO_DISPONIBLE';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.usuarios_eliminaciones_operaciones AS o
      WHERE
        (
          -- Destinatario o autor documental es OBJETIVO
          -- de una eliminación todavía no resuelta.
          o.objetivo_id IN (NEW.cuenta_id, NEW.creado_por)
          AND o.estado IN (
            'PREPARADA',
            'AUTH_EN_CURSO',
            'AUTH_ELIMINADA',
            'REQUIERE_REVISION'
          )
        )
        OR
        (
          -- Reserva irreversible activa del administrador original.
          -- No bloquea por haber actuado en una COMPLETADA,
          -- ni por ser actor de una simple PREPARADA.
          o.actor_id IN (NEW.cuenta_id, NEW.creado_por)
          AND o.intentos_auth > 0
          AND o.estado IN (
            'AUTH_EN_CURSO',
            'AUTH_ELIMINADA',
            'REQUIERE_REVISION'
          )
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'IDENTIDAD_CON_ELIMINACION_PENDIENTE';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'EVENTO_DOCUMENTAL_NO_ADMITIDO';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cuentas_documentos_confirmar_retiro_v1(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $confirmar$
DECLARE
 a uuid:=auth.uid(); r public.cuentas_documentos_retiros%ROWTYPE;
 d public.cuentas_documentos%ROWTYPE; objeto jsonb; n integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR a IS NULL OR
    public.es_administrador_actual() IS NOT TRUE THEN
   RAISE EXCEPTION 'RETIRO_NO_AUTORIZADO' USING ERRCODE='42501';
 END IF;
 IF current_setting('transaction_isolation') <> 'read committed' THEN
   RAISE EXCEPTION 'AISLAMIENTO_DOCUMENTAL_NO_ADMITIDO';
 END IF;
 IF p_operacion_id IS NULL THEN RAISE EXCEPTION 'OPERACION_DOCUMENTAL_NO_ENCONTRADA'; END IF;
 IF NOT pg_try_advisory_xact_lock(209,1) THEN
   RAISE EXCEPTION 'COORDINACION_DOCUMENTAL_OCUPADA' USING ERRCODE='55P03';
 END IF;
 -- Cero HTTP bajo estos locks. NOWAIT evita esperar o congelar operaciones del hotel.
 PERFORM u.id FROM public.usuarios u WHERE u.id=a AND u.estado IS TRUE FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'RETIRO_NO_AUTORIZADO' USING ERRCODE='42501'; END IF;
 PERFORM ro.id FROM public.roles ro JOIN public.usuarios u ON u.rol_id=ro.id WHERE u.id=a FOR SHARE OF ro NOWAIT;
 IF public.es_administrador_actual() IS NOT TRUE THEN
   RAISE EXCEPTION 'RETIRO_NO_AUTORIZADO' USING ERRCODE='42501';
 END IF;
 SELECT * INTO r FROM public.cuentas_documentos_retiros WHERE id=p_operacion_id;
 -- Una respuesta perdida no se convierte en éxito por ausencia de recibo.
 IF NOT FOUND THEN RAISE EXCEPTION 'OPERACION_DOCUMENTAL_NO_ENCONTRADA'; END IF;
 SELECT * INTO d FROM public.cuentas_documentos WHERE id=r.documento_id FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'EVIDENCIA_DOCUMENTAL_DISTINTA'; END IF;
 SELECT * INTO r FROM public.cuentas_documentos_retiros WHERE id=p_operacion_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR NOT public.cuentas_documentos_retiro_identidad_v1(to_jsonb(d),to_jsonb(r)) THEN
   RAISE EXCEPTION 'EVIDENCIA_DOCUMENTAL_DISTINTA';
 END IF;
 -- Los certificados globales solo bloquean mientras la operación NO esté COMPLETADA.
 -- Las guardas específicas de documentos conservados siguen intactas; no se libera su historia.
 -- PREPARADA/0 sin certificado admite retirar explícitamente documentos antes de certificar.
 LOCK TABLE public.usuarios_eliminaciones_operaciones IN SHARE MODE NOWAIT;
 IF EXISTS(SELECT 1 FROM public.usuarios_eliminaciones_operaciones o
   WHERE o.estado IS DISTINCT FROM 'COMPLETADA' AND (
     coalesce(o.dependencias_resumen,'{}'::jsonb) ?| ARRAY['conservacion_previa_v1','conservacion_documental_v1','conservacion_fisica_v1'] OR
     ((o.objetivo_id IN (d.cuenta_id,d.creado_por) OR o.actor_id IN (d.cuenta_id,d.creado_por)) AND
      (o.intentos_auth>0 OR o.estado IN ('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION'))))) THEN
   RAISE EXCEPTION 'CONSERVACION_DOCUMENTAL_BLOQUEA_RETIRO';
 END IF;
 -- storage.objects es solo lectura: bloqueo breve contra recreación/movimiento; no se escribe su catálogo.
 LOCK TABLE storage.objects IN SHARE MODE NOWAIT;
 SELECT to_jsonb(o) INTO objeto FROM storage.objects o WHERE o.bucket_id=r.bucket_id AND o.name=r.storage_path;
 IF FOUND THEN
   RETURN jsonb_build_object('operacion_id',r.id,'resultado',CASE
     WHEN objeto->>'id'=r.objeto_id::text AND objeto->>'version'=r.objeto_version AND
          objeto->>'owner_id'=r.propietario_id::text THEN 'OBJETO_ORIGINAL_PRESENTE' ELSE 'IDENTIDAD_STORAGE_DISTINTA' END);
 END IF;
 IF EXISTS(SELECT 1 FROM storage.objects o WHERE o.id=r.objeto_id) THEN
   RETURN jsonb_build_object('operacion_id',r.id,'resultado','IDENTIDAD_STORAGE_DISTINTA');
 END IF;
 IF r.confirmado_en IS NULL THEN
   UPDATE public.cuentas_documentos_retiros SET confirmado_por=a,confirmado_en=clock_timestamp()
     WHERE id=r.id RETURNING * INTO r;
 END IF;
 IF r.confirmado_por IS NULL OR r.confirmado_en IS NULL THEN RAISE EXCEPTION 'RETIRO_NO_CONFIRMADO'; END IF;
 INSERT INTO public.cuentas_documentos_borrado_capacidad_v1
   (transaccion,backend,documento_id,operacion_id,actor_id,documento,retiro)
 VALUES(pg_current_xact_id(),pg_backend_pid(),d.id,r.id,a,to_jsonb(d),to_jsonb(r));
 DELETE FROM public.cuentas_documentos_retiros WHERE id=r.id AND to_jsonb(cuentas_documentos_retiros)=to_jsonb(r);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'RETIRO_NO_CONSUMIDO'; END IF;
 DELETE FROM public.cuentas_documentos WHERE id=d.id AND to_jsonb(cuentas_documentos)=to_jsonb(d);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'DOCUMENTO_NO_ELIMINADO'; END IF;
 DELETE FROM public.cuentas_documentos_borrado_capacidad_v1
   WHERE transaccion=pg_current_xact_id() AND backend=pg_backend_pid() AND documento_id=d.id;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'CAPACIDAD_DOCUMENTAL_NO_CONSUMIDA'; END IF;
 RETURN jsonb_build_object('operacion_id',r.id,'resultado','AUSENCIA_CONFIRMADA',
   'confirmado_en',r.confirmado_en,'eliminacion_definitiva',true);
END;
$confirmar$;
-- CREATE OR REPLACE mantiene propietario/ACL de las dos funciones existentes.

DO $postflight_217$
DECLARE d jsonb; r jsonb;
BEGIN
 IF md5(pg_get_functiondef('public.cuentas_documentos_barrera_fila_v1()'::regprocedure)) <> 'fb5b5b98fdd99b5c973dc6c3ab43012f' THEN
   RAISE EXCEPTION 'HUELLA_BARRERA_217_DISTINTA';
 END IF;
 IF md5(pg_get_functiondef('public.cuentas_documentos_barrera_entrada_v1()'::regprocedure)) <> '4085aa62ed260da05099fd264869a5d1' OR
    md5(pg_get_functiondef('public.cuentas_documentos_reservar_retiro_v1(uuid,uuid,boolean,uuid)'::regprocedure)) <> 'd54bc3eb5408acb9e2646bbec4c801a4' THEN
   RAISE EXCEPTION 'CONTRATO_AJENO_MODIFICADO';
 END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.cuentas_documentos_borrado_capacidad_v1'::regclass) OR
    EXISTS(SELECT 1 FROM public.cuentas_documentos_borrado_capacidad_v1) OR
    EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.cuentas_documentos_borrado_capacidad_v1'::regclass) THEN
   RAISE EXCEPTION 'CAPACIDAD_PRIVADA_NO_ACREDITADA';
 END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) t(rol)
   WHERE has_table_privilege(t.rol,'public.cuentas_documentos_borrado_capacidad_v1','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') OR
   has_function_privilege(t.rol,'public.cuentas_documentos_borrado_validar_v1(text,jsonb)','EXECUTE') OR
   has_function_privilege(t.rol,'public.cuentas_documentos_borrado_guard_v1()','EXECUTE') OR
   has_function_privilege(t.rol,'public.cuentas_documentos_retiro_identidad_v1(jsonb,jsonb)','EXECUTE')) THEN
   RAISE EXCEPTION 'CAPACIDAD_EXPUESTA';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='cuentas_documentos_retiros_documento_id_fkey'
   AND conrelid='public.cuentas_documentos_retiros'::regclass AND confdeltype='r' AND convalidated) OR
   NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='cuentas_documentos_retiro_borrado_guard_v1'
     AND tgrelid='public.cuentas_documentos_retiros'::regclass AND tgenabled='O') OR
   NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='cuentas_documentos_capacidad_consumida_v1'
     AND tgrelid='public.cuentas_documentos_borrado_capacidad_v1'::regclass AND tgdeferrable AND tginitdeferred AND tgenabled='O') THEN
   RAISE EXCEPTION 'GUARDAS_217_NO_ACREDITADAS';
 END IF;
 -- Regresión 218.1: la terminal COMPLETADA no produce bloqueo global ni por intentos históricos.
 -- No se crean operaciones; son valores en memoria dentro de este ensayo reversible.
 IF EXISTS(SELECT 1 FROM (VALUES
   ('COMPLETADA',true,true,1,false),
   ('COMPLETADA',true,false,0,false),
   ('PREPARADA',true,false,0,true),
   ('PREPARADA',false,true,0,false),
   ('AUTH_EN_CURSO',false,true,1,true),
   ('AUTH_ELIMINADA',false,true,1,true),
   ('REQUIERE_REVISION',false,true,0,true),
   ('AUTH_EN_CURSO',false,false,1,false),
   (NULL::text,true,false,0,true)
 ) AS casos(estado,certificado,relacionado,intentos,esperado)
 WHERE ((estado IS DISTINCT FROM 'COMPLETADA') AND
   (certificado OR (relacionado AND (intentos>0 OR estado IN
    ('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION'))))) IS DISTINCT FROM esperado) THEN
   RAISE EXCEPTION 'PRUEBA_ALCANCE_CERTIFICADO_FALLO';
 END IF;
 -- Pruebas puras: JSON sintético, ninguna fila documental/Auth/Storage se toca.
 d:=jsonb_build_object('id','11111111-1111-4111-8111-111111111111','cuenta_id','22222222-2222-4222-8222-222222222222',
   'creado_por','33333333-3333-4333-8333-333333333333','estado_reserva','disponible','bucket_id','documentos-cuentas',
   'storage_path','cuentas/22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111',
   'storage_object_id','44444444-4444-4444-8444-444444444444','storage_version','version-prueba');
 r:=jsonb_build_object('id','55555555-5555-4555-8555-555555555555','documento_id',d->>'id','cuenta_id',d->>'cuenta_id',
   'bucket_id',d->>'bucket_id','storage_path',d->>'storage_path','objeto_id',d->>'storage_object_id',
   'objeto_version',d->>'storage_version','propietario_id',d->>'creado_por');
 IF public.cuentas_documentos_retiro_identidad_v1(d,r) IS NOT TRUE OR
    public.cuentas_documentos_retiro_identidad_v1(d,jsonb_set(r,'{objeto_version}','"otra"')) IS NOT FALSE OR
    public.cuentas_documentos_retiro_identidad_v1(d,r-'propietario_id') IS NOT FALSE OR
    public.cuentas_documentos_retiro_identidad_v1(NULL,r) IS NOT FALSE THEN
   RAISE EXCEPTION 'PRUEBA_IDENTIDAD_DOCUMENTAL_FALLO';
 END IF;
END;
$postflight_217$;

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
     to_regclass('public.cuentas_documentos_borrado_capacidad_v1') IS NOT NULL OR
     to_regprocedure('public.cuentas_documentos_borrado_guard_v1()') IS NOT NULL THEN
    RAISE EXCEPTION 'ENSAYO_REVERSION_NO_ACREDITADA';
  END IF;
  RAISE NOTICE 'ENSAYO_RETIRO_DEFINITIVO_OK: instalación/FK/triggers/RLS comprobados y revertidos; habilita_auth=false';
END;
$ensayo_reversible$;
ROLLBACK;
