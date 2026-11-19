-- HOTEL EL ALMENDRO / PASO 215
-- GENERALIZACION ACOTADA: cuentas Recepcion y Tecnico con dependencias certificables.
-- REUTILIZA LOS 6 TRIGGERS INSTALADOS EN EL PASO 212 (NO CREA TRIGGERS NUEVOS).
-- NO ELIMINA USUARIOS, NO LLAMA A AUTH ADMIN, NO ACTIVA EL BOTON.
-- NO ADMITE ADMINISTRADORES, AUTOELIMINACION, OBJETOS STORAGE,
-- ASIGNACIONES, REFERENCIAS EXTRA NI ALERTAS/ESTADOS PERSONALES AUN NO CONSERVADOS.
-- Conserva solicitudes y avisos por UUID con huellas de todas sus filas.
-- REQUIERE verificar posteriormente el flujo real de Auth/recuperacion ANTES de habilitar.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

DO $preflight$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'INSTALACION_REQUIERE_POSTGRES';
  END IF;
  -- No reemplazar reglas mientras haya un borrado posiblemente irreversible.
  IF EXISTS (
    SELECT 1 FROM public.usuarios_eliminaciones_operaciones
    WHERE estado IN ('AUTH_EN_CURSO', 'AUTH_ELIMINADA', 'REQUIERE_REVISION')
  ) THEN
    RAISE EXCEPTION 'OPERACION_IRREVERSIBLE_EXISTENTE_REQUIERE_REVISION';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger
      WHERE tgname IN (
        'usuario_eliminacion_piloto_entrada_usuarios_v1',
        'usuario_eliminacion_piloto_entrada_solicitudes_v1',
        'usuario_eliminacion_piloto_entrada_avisos_v1',
        'usuario_eliminacion_piloto_usuarios_v1',
        'usuario_eliminacion_piloto_solicitudes_v1',
        'usuario_eliminacion_piloto_avisos_v1'
      ) AND NOT tgisinternal AND tgenabled IN ('O','A')) <> 6 THEN
    RAISE EXCEPTION 'GUARDAS_PASO212_NO_COINCIDEN';
  END IF;
  -- Serializar la sustitucion frente a escritores que usan los triggers 212.
  PERFORM pg_catalog.pg_advisory_xact_lock(209,1);
END;
$preflight$;

-- La función de entrada por sentencia no cambia; mantiene el lock compartido 209/1.
-- Se reemplaza solamente el cuerpo de la guarda por fila: sin UUID ni nombre fijo.
CREATE OR REPLACE FUNCTION public.usuario_eliminacion_piloto_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $guard$
DECLARE
  v_ids uuid[] := ARRAY[]::uuid[];
  v_op public.usuarios_eliminaciones_operaciones%ROWTYPE;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' THEN
    RAISE EXCEPTION 'RELACION_NO_ADMITIDA';
  END IF;
  IF TG_OP = 'UPDATE' AND pg_catalog.to_jsonb(OLD) = pg_catalog.to_jsonb(NEW) THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'usuarios' THEN
    v_ids := ARRAY[OLD.id];
  ELSIF TG_TABLE_NAME = 'solicitudes_reactivas' THEN
    IF TG_OP = 'INSERT' THEN
      v_ids := ARRAY[NEW.creada_por];
    ELSIF TG_OP = 'DELETE' THEN
      v_ids := ARRAY[OLD.creada_por];
    ELSE
      v_ids := ARRAY[OLD.creada_por, NEW.creada_por];
    END IF;
  ELSIF TG_TABLE_NAME = 'solicitudes_reactivas_avisos' THEN
    IF TG_OP = 'INSERT' THEN
      SELECT pg_catalog.array_agg(s.creada_por) INTO v_ids
      FROM public.solicitudes_reactivas s WHERE s.id = NEW.solicitud_id;
    ELSIF TG_OP = 'DELETE' THEN
      SELECT pg_catalog.array_agg(s.creada_por) INTO v_ids
      FROM public.solicitudes_reactivas s WHERE s.id = OLD.solicitud_id;
    ELSE
      SELECT pg_catalog.array_agg(DISTINCT s.creada_por) INTO v_ids
      FROM public.solicitudes_reactivas s
      WHERE s.id IN (OLD.solicitud_id, NEW.solicitud_id);
    END IF;
  ELSE
    RAISE EXCEPTION 'RELACION_NO_ADMITIDA';
  END IF;
  IF v_ids IS NULL OR pg_catalog.cardinality(v_ids) = 0 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    -- Solo se exige este aislamiento si existe una reserva que afecta la fila.
    IF EXISTS (SELECT 1 FROM public.usuarios_eliminaciones_operaciones o
      WHERE o.intentos_auth > 0
        AND o.estado IN ('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION')
        AND (o.objetivo_id = ANY(v_ids)
           OR (TG_TABLE_NAME = 'usuarios' AND o.actor_id = ANY(v_ids)))) THEN
      RAISE EXCEPTION 'AISLAMIENTO_ELIMINACION_NO_CERTIFICADO';
    END IF;
  END IF;
  FOR v_op IN
    SELECT * FROM public.usuarios_eliminaciones_operaciones o
    WHERE o.intentos_auth > 0
      AND o.estado IN ('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION')
      AND (o.objetivo_id = ANY(v_ids)
        OR (TG_TABLE_NAME = 'usuarios' AND o.actor_id = ANY(v_ids)))
  LOOP
    -- Permitir exclusivamente la cascada del perfil objetivo al eliminar Auth.
    -- El borrado de Auth debe estar autorizado previamente en la operación.
    IF TG_TABLE_NAME = 'usuarios' AND TG_OP = 'DELETE'
      AND OLD.id = v_op.objetivo_id AND OLD.id <> v_op.actor_id
      AND v_op.estado = 'AUTH_EN_CURSO'
      AND v_op.dependencias_resumen @>
        '{"conservacion_historica_certificada":true,"autorizacion_irreversible_confirmada":true}'::jsonb
      AND NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = OLD.id) THEN
      CONTINUE;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CUENTA_O_HISTORIAL_EN_ELIMINACION';
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$guard$;

-- Nueva función para cualquier cuenta Recepcion/Tecnico segura y verificable.
-- No reemplaza evaluar_recepcion_v1: usa sus comprobaciones de referencias,
-- pero valida ambos roles por separado sin confiar en apto_preliminar para Tecnico.
CREATE FUNCTION public.usuario_eliminacion_iniciar_general_v1(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $inicio$
DECLARE
  v_op public.usuarios_eliminaciones_operaciones%ROWTYPE;
  v_actor uuid;
  v_target uuid;
  v_nombre text;
  v_rol text;
  v_eval jsonb;
  v_reauth jsonb;
  v_claims jsonb;
  v_ms numeric;
  v_ref_count bigint;
  v_solicitudes bigint;
  v_avisos bigint;
  v_alertas bigint;
  v_estados bigint;
  v_huellas_s jsonb;
  v_huellas_a jsonb;
  v_correo jsonb;
  v_sesion jsonb;
  v_attempt uuid;
BEGIN
  IF current_user <> 'postgres'
     OR pg_catalog.current_setting('transaction_isolation') <> 'read committed'
     OR pg_catalog.current_setting('row_security') <> 'off' THEN
    RAISE EXCEPTION 'CONTEXTO_SQL_NO_ADMITIDO';
  END IF;
  v_actor := auth.uid();
  IF v_actor IS NULL OR public.es_administrador_permanente_actual() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SOLO_ADMIN_PERMANENTE';
  END IF;
  -- Primero el lock exclusivo, DESPUES los locks de operaciones y perfiles.
  PERFORM pg_catalog.pg_advisory_xact_lock(209,1);
  SELECT * INTO STRICT v_op FROM public.usuarios_eliminaciones_operaciones
  WHERE id = p_operacion_id FOR UPDATE;
  v_target := v_op.objetivo_id;
  IF v_op.actor_id IS DISTINCT FROM v_actor OR v_target IS NULL
     OR v_actor = v_target OR v_op.estado <> 'PREPARADA'
     OR v_op.intentos_auth <> 0 OR v_op.auditoria_id IS NOT NULL
     OR v_op.dependencias_resumen->'conservacion_historica_certificada'
          IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'OPERACION_NO_INICIABLE';
  END IF;
  PERFORM id FROM public.usuarios
    WHERE id IN (v_actor, v_target) ORDER BY id FOR UPDATE;
  IF public.es_administrador_permanente_actual() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PRIVILEGIO_CAMBIO';
  END IF;
  SELECT u.nombre::text, r.nombre::text INTO STRICT v_nombre, v_rol
    FROM public.usuarios u JOIN public.roles r ON r.id = u.rol_id
    WHERE u.id = v_target AND u.estado IS TRUE
      AND public.es_rol_administrador(u.rol_id) IS FALSE;
  IF v_nombre IS DISTINCT FROM v_op.objetivo_nombre_snapshot
     OR pg_catalog.lower(pg_catalog.btrim(v_rol))
          NOT IN ('recepcion','recepción','tecnico','técnico') THEN
    RAISE EXCEPTION 'ROL_O_NOMBRE_NO_ADMITIDO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_target) THEN
    RAISE EXCEPTION 'AUTH_OBJETIVO_NO_EXISTE';
  END IF;
  -- Una sola operación irreversible activa para cada actor/objetivo.
  IF EXISTS (SELECT 1 FROM public.usuarios_eliminaciones_operaciones o
    WHERE o.id <> v_op.id AND o.intentos_auth > 0
      AND o.estado IN ('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION')
      AND (o.actor_id IN (v_actor,v_target) OR o.objetivo_id IN (v_actor,v_target))) THEN
    RAISE EXCEPTION 'RESERVA_EXISTENTE';
  END IF;
  -- Las guardas operativas deben seguir exactamente donde fueron instaladas.
  IF (SELECT count(*) FROM pg_catalog.pg_trigger t
       WHERE t.tgname IN (
         'usuario_eliminacion_piloto_usuarios_v1',
         'usuario_eliminacion_piloto_solicitudes_v1',
         'usuario_eliminacion_piloto_avisos_v1')
         AND t.tgenabled IN ('O','A')
         AND t.tgfoid = 'public.usuario_eliminacion_piloto_guard_v1()'::regprocedure
         AND NOT t.tgisinternal) <> 3
     OR (SELECT count(*) FROM pg_catalog.pg_trigger t
       WHERE t.tgname IN (
         'usuario_eliminacion_piloto_entrada_usuarios_v1',
         'usuario_eliminacion_piloto_entrada_solicitudes_v1',
         'usuario_eliminacion_piloto_entrada_avisos_v1')
         AND t.tgenabled IN ('O','A')
         AND t.tgfoid = 'public.usuario_eliminacion_piloto_entrada_v1()'::regprocedure
         AND NOT t.tgisinternal) <> 3 THEN
    RAISE EXCEPTION 'GUARDAS_NO_ACREDITADAS';
  END IF;
  SELECT public.usuario_eliminacion_evaluar_recepcion_v1(v_target) INTO v_eval;
  IF pg_catalog.jsonb_typeof(v_eval) IS DISTINCT FROM 'object'
     OR v_eval->>'objetivo_id' IS DISTINCT FROM v_target::text
     OR v_eval->>'nombre' IS DISTINCT FROM v_nombre
     OR v_eval->>'rol' IS DISTINCT FROM v_rol
     OR v_eval->'cuenta_auth_existe' IS DISTINCT FROM 'true'::jsonb
     OR v_eval->'otras_referencias_detectadas' IS DISTINCT FROM 'false'::jsonb
     OR v_eval->'conservacion_historica_certificada' IS DISTINCT FROM 'false'::jsonb
     OR v_eval->'eliminacion_habilitada' IS DISTINCT FROM 'false'::jsonb
     OR v_eval->'solicitudes_snapshot_incorrecto' IS DISTINCT FROM '0'::jsonb
     OR v_eval->'objetos_storage' IS DISTINCT FROM '0'::jsonb
     OR v_eval->'mantenciones_asignadas' IS DISTINCT FROM '0'::jsonb
     OR v_eval->'tareas_asignadas' IS DISTINCT FROM '0'::jsonb
     OR pg_catalog.jsonb_typeof(v_eval->'detalle_otras_referencias') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'DEPENDENCIAS_NO_ADMITIDAS';
  END IF;
  SELECT count(*) INTO v_ref_count
    FROM pg_catalog.jsonb_object_keys(v_eval->'detalle_otras_referencias');
  IF v_ref_count <> 25 THEN
    RAISE EXCEPTION 'COBERTURA_EVALUADOR_CAMBIO';
  END IF;
  -- Causas de cascada personal no cubiertas por el evaluador (no conservar datos sensibles).
  SELECT count(*) INTO v_alertas FROM public.alertas WHERE usuario_id = v_target;
  SELECT count(*) INTO v_estados FROM public.solicitudes_reactivas_avisos_estado WHERE usuario_id = v_target;
  IF v_alertas <> 0 OR v_estados <> 0 THEN
    RAISE EXCEPTION 'REGISTROS_PERSONALES_PENDIENTES';
  END IF;
  SELECT count(*) INTO v_solicitudes
    FROM public.solicitudes_reactivas WHERE creada_por = v_target;
  SELECT count(*) INTO v_avisos
    FROM public.solicitudes_reactivas_avisos a
    JOIN public.solicitudes_reactivas s ON s.id = a.solicitud_id
    WHERE s.creada_por = v_target;
  IF v_eval->'solicitudes_creadas' IS DISTINCT FROM pg_catalog.to_jsonb(v_solicitudes)
     OR v_eval->'avisos_asociados' IS DISTINCT FROM pg_catalog.to_jsonb(v_avisos) THEN
    RAISE EXCEPTION 'HISTORIAL_CAMBIO';
  END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',s.id,'estado',s.estado,'sha256',pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.to_jsonb(s)::text,'UTF8')),'hex'))
      ORDER BY s.id),'[]'::jsonb)
    INTO v_huellas_s FROM public.solicitudes_reactivas s WHERE s.creada_por = v_target;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'solicitud_id',a.solicitud_id,'sha256',pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.to_jsonb(a)::text,'UTF8')),'hex'))
      ORDER BY a.solicitud_id, pg_catalog.to_jsonb(a)::text),'[]'::jsonb)
    INTO v_huellas_a FROM public.solicitudes_reactivas_avisos a
    JOIN public.solicitudes_reactivas s ON s.id = a.solicitud_id
    WHERE s.creada_por = v_target;
  IF pg_catalog.octet_length(v_huellas_s::text) + pg_catalog.octet_length(v_huellas_a::text) > 1048576 THEN
    RAISE EXCEPTION 'EVIDENCIA_SUPERA_LIMITE';
  END IF;
  SELECT pg_catalog.jsonb_build_object('verificado_en',c.verificado_en)
    INTO v_correo FROM public.usuarios_correos_verificados c WHERE c.usuario_id = v_target;
  SELECT pg_catalog.jsonb_build_object('revision',s.revision,'actualizado_en',s.actualizado_en)
    INTO v_sesion FROM public.usuarios_sesion_cambios s WHERE s.usuario_id = v_target;

  -- El identificador de petición y la huella deben existir de verdad;
  -- una igualdad de dos valores NULL no vincula ninguna autorización.
  IF pg_catalog.jsonb_typeof(v_op.dependencias_resumen->'paso191') IS DISTINCT FROM 'object'
     OR coalesce(v_op.dependencias_resumen->'paso191'->>'request_id','')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR coalesce(v_op.dependencias_resumen->'paso191'->>'fingerprint','')
       !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'PETICION_NO_VINCULADA';
  END IF;
  v_reauth := v_op.dependencias_resumen->'paso192'->'reauth';
  v_claims := NULLIF(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb;
  v_ms := pg_catalog.date_part('epoch',pg_catalog.clock_timestamp())*1000;
  IF pg_catalog.jsonb_typeof(v_reauth) IS DISTINCT FROM 'object'
     OR v_reauth->>'actor_id' IS DISTINCT FROM v_actor::text
     OR v_reauth->>'target_id' IS DISTINCT FROM v_target::text
     OR v_reauth->>'operation_id' IS DISTINCT FROM v_op.id::text
     OR v_reauth->>'request_id' IS DISTINCT FROM v_op.dependencias_resumen->'paso191'->>'request_id'
     OR v_reauth->>'fingerprint' IS DISTINCT FROM v_op.dependencias_resumen->'paso191'->>'fingerprint'
     OR v_reauth->>'session_id' IS DISTINCT FROM v_claims->>'session_id'
     OR coalesce(v_claims->>'session_id','') = ''
     OR coalesce(v_reauth->>'proof_id','')
          !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR v_reauth->>'purpose' IS DISTINCT FROM 'inicio'
     OR v_reauth->>'method' IS DISTINCT FROM 'password'
     OR v_reauth->'consumed_at' IS DISTINCT FROM 'null'::jsonb
     OR pg_catalog.jsonb_typeof(v_reauth->'verified_at') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(v_reauth->'expires_at') IS DISTINCT FROM 'number'
     OR (v_reauth->>'verified_at')::numeric > v_ms
     OR (v_reauth->>'expires_at')::numeric <= v_ms
     OR (v_reauth->>'expires_at')::numeric - (v_reauth->>'verified_at')::numeric <> 120000 THEN
    RAISE EXCEPTION 'REAUTENTICACION_NO_ACREDITADA';
  END IF;

  -- Invalidar inmediatamente las acciones de la cuenta con JWT previo.
  UPDATE public.usuarios SET estado = false WHERE id = v_target AND estado IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OBJETIVO_CAMBIO'; END IF;
  v_attempt := pg_catalog.gen_random_uuid();
  UPDATE public.usuarios_eliminaciones_operaciones
     SET estado='AUTH_EN_CURSO', intentos_auth=1,
         dependencias_resumen=dependencias_resumen || pg_catalog.jsonb_build_object(
           'conservacion_historica_certificada',true,
           'autorizacion_irreversible_confirmada',true,
           'auth_eliminacion_verificada',false,
           'alcance_eliminacion','RECEPCION_TECNICO_RESTRINGIDO_V1',
           'paso176_evidencia',pg_catalog.jsonb_build_object(
             'alcance','recepcion_tecnico_restringido','objetivo_id',v_target,
             'rol',v_rol,'solicitudes_creadas',v_solicitudes,'avisos_asociados',v_avisos,
             'huellas_solicitudes',v_huellas_s,'huellas_avisos',v_huellas_a,
             'algoritmo_huellas','sha256-jsonb-postgresql-v1',
             'metadatos_correo',v_correo,'metadatos_sesion',v_sesion,
             'evaluacion',v_eval,'capturado_en',pg_catalog.clock_timestamp()),
           'paso191',(dependencias_resumen->'paso191') ||
             pg_catalog.jsonb_build_object('attempt_id',v_attempt),
           'paso192',(dependencias_resumen->'paso192') ||
             pg_catalog.jsonb_build_object('reauth',v_reauth ||
               pg_catalog.jsonb_build_object('consumed_at',v_ms))),
         updated_at=pg_catalog.clock_timestamp()
   WHERE id=v_op.id AND estado='PREPARADA' AND intentos_auth=0;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPERACION_CAMBIO'; END IF;
  RETURN pg_catalog.jsonb_build_object(
    'operacion_id',v_op.id,'estado','AUTH_EN_CURSO','attempt_id',v_attempt,
    'eliminacion_habilitada',false,'puede_eliminar',false);
END;
$inicio$;

-- Retirar la entrada exclusivamente de Pablo. Los mismos seis triggers
-- existentes ahora llaman a la guarda dinamica anterior.
DROP FUNCTION public.usuario_eliminacion_iniciar_piloto_v1(uuid);
REVOKE ALL ON FUNCTION public.usuario_eliminacion_iniciar_general_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.usuario_eliminacion_piloto_guard_v1()
  FROM PUBLIC, anon, authenticated, service_role;

DO $assertions$
BEGIN
  IF to_regprocedure('public.usuario_eliminacion_iniciar_piloto_v1(uuid)') IS NOT NULL
     OR to_regprocedure('public.usuario_eliminacion_iniciar_general_v1(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FUNCION_GENERAL_NO_VERIFICADA';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger t
      WHERE t.tgname IN (
        'usuario_eliminacion_piloto_entrada_usuarios_v1',
        'usuario_eliminacion_piloto_entrada_solicitudes_v1',
        'usuario_eliminacion_piloto_entrada_avisos_v1',
        'usuario_eliminacion_piloto_usuarios_v1',
        'usuario_eliminacion_piloto_solicitudes_v1',
        'usuario_eliminacion_piloto_avisos_v1')
      AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal) <> 6 THEN
    RAISE EXCEPTION 'GUARDAS_NO_VERIFICADAS';
  END IF;
END;
$assertions$;

-- INSTALACION DE CODIGO SQL UNICAMENTE. NO INICIA NI ELIMINA CUENTAS.
COMMIT;

-- VERIFICACION NO DESTRUCTIVA DESPUES DEL COMMIT: una sola salida de resultado.
SELECT
  CASE WHEN to_regprocedure('public.usuario_eliminacion_iniciar_general_v1(uuid)') IS NOT NULL
       AND to_regprocedure('public.usuario_eliminacion_iniciar_piloto_v1(uuid)') IS NULL
       THEN 'OK' ELSE 'REVISAR' END AS funcion_general,
  CASE WHEN (SELECT count(*) FROM pg_catalog.pg_trigger
             WHERE tgname IN (
               'usuario_eliminacion_piloto_entrada_usuarios_v1',
               'usuario_eliminacion_piloto_entrada_solicitudes_v1',
               'usuario_eliminacion_piloto_entrada_avisos_v1',
               'usuario_eliminacion_piloto_usuarios_v1',
               'usuario_eliminacion_piloto_solicitudes_v1',
               'usuario_eliminacion_piloto_avisos_v1')
               AND tgenabled IN ('O','A') AND NOT tgisinternal) = 6
       THEN 'OK' ELSE 'REVISAR' END AS seis_guardas,
  CASE WHEN NOT pg_catalog.has_function_privilege('authenticated',
                'public.usuario_eliminacion_iniciar_general_v1(uuid)'::regprocedure, 'EXECUTE')
         AND NOT pg_catalog.has_function_privilege('anon',
                'public.usuario_eliminacion_iniciar_general_v1(uuid)'::regprocedure, 'EXECUTE')
         AND NOT pg_catalog.has_function_privilege('service_role',
                'public.usuario_eliminacion_iniciar_general_v1(uuid)'::regprocedure, 'EXECUTE')
       THEN 'OK' ELSE 'REVISAR' END AS acceso_restringido,
  CASE WHEN EXISTS (SELECT 1 FROM auth.users
                     WHERE id='dbceb8be-8356-4412-bfe9-915328f6d916'::uuid)
       AND EXISTS (SELECT 1 FROM public.solicitudes_reactivas
                     WHERE id='7fdb8fc8-df65-43b4-bbc7-71cd35e7bd3e'::uuid
                       AND estado='pendiente')
       AND (SELECT count(*) FROM public.solicitudes_reactivas_avisos
                     WHERE solicitud_id='7fdb8fc8-df65-43b4-bbc7-71cd35e7bd3e'::uuid)=1
       THEN 'OK' ELSE 'REVISAR' END AS prueba_pablo_intacta;
