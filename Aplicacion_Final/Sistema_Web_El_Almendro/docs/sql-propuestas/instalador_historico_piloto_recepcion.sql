-- PASO 212. INSTALACION ACOTADA para UNA cuenta de prueba (NO ELIMINA AUTH).
-- No elimina usuarios, no llama a Auth Admin ni ejecuta la finalización.
-- INSTALACION REVERSIBLE DE FUNCIONES/TRIGGERS: COMMIT al final. NO EJECUTA EL INICIO.
-- NO prueba concurrencia, NO llama la funcion de inicio y NO autoriza borrar Auth por si solo.
-- REVISAR ANTES DE INSTALAR: depende de contratos existentes y de que la
-- eliminación Auth se coordine exclusivamente desde un servidor confiable.
-- Cuenta piloto: dbceb8be-8356-4412-bfe9-915328f6d916
-- Solicitud preservada: 7fdb8fc8-df65-43b4-bbc7-71cd35e7bd3e
BEGIN;
-- Precondiciones del caso piloto. Si fallan, aborta toda la instalación.
DO $preflight$
DECLARE
  v_target constant uuid := 'dbceb8be-8356-4412-bfe9-915328f6d916'::uuid;
  v_req constant uuid := '7fdb8fc8-df65-43b4-bbc7-71cd35e7bd3e'::uuid;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'INSTALACION_REQUIERE_POSTGRES';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_target)
     OR NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = v_target AND estado IS TRUE AND nombre = 'Pablo Gamboa')
     OR (SELECT count(*) FROM public.solicitudes_reactivas WHERE creada_por = v_target) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.solicitudes_reactivas
                    WHERE id = v_req AND creada_por = v_target
                      AND creador_nombre_snapshot = 'Pablo Gamboa' AND estado = 'pendiente')
     OR (SELECT count(*) FROM public.solicitudes_reactivas_avisos WHERE solicitud_id = v_req) <> 1
     OR EXISTS (SELECT 1 FROM public.usuarios_eliminaciones_operaciones WHERE objetivo_id = v_target)
  THEN RAISE EXCEPTION 'PILOTO_NO_COINCIDE_CON_BASELINE'; END IF;
END;
$preflight$;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

-- IMPORTANTE: el bloqueo tiene que adquirirse antes de los locks de fila.
-- BEFORE STATEMENT se ejecuta antes de que la operación de la tabla tome
-- locks sobre filas objetivo; sin esta fase, BEFORE ROW podría causar deadlock.
-- Coste: todos los escritores de estas 3 tablas toman lock COMPARTIDO 209/1
-- durante la transacción; el iniciador mantiene lock EXCLUSIVO solo durante
-- su transacción corta de certificación/inicio.
CREATE FUNCTION public.usuario_eliminacion_piloto_entrada_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
BEGIN
  -- Nunca rechazar escritores de otros usuarios por su nivel de aislamiento.
  -- La verificacion de aislamiento se hace SOLO para filas del piloto.
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(209, 1);
  RETURN NULL;
END;
$body$;

CREATE TRIGGER usuario_eliminacion_piloto_entrada_usuarios_v1
  BEFORE UPDATE OR DELETE ON public.usuarios FOR EACH STATEMENT
  EXECUTE FUNCTION public.usuario_eliminacion_piloto_entrada_v1();
CREATE TRIGGER usuario_eliminacion_piloto_entrada_solicitudes_v1
  BEFORE INSERT OR UPDATE OR DELETE ON public.solicitudes_reactivas FOR EACH STATEMENT
  EXECUTE FUNCTION public.usuario_eliminacion_piloto_entrada_v1();
CREATE TRIGGER usuario_eliminacion_piloto_entrada_avisos_v1
  BEFORE INSERT OR UPDATE OR DELETE ON public.solicitudes_reactivas_avisos FOR EACH STATEMENT
  EXECUTE FUNCTION public.usuario_eliminacion_piloto_entrada_v1();

-- Guarda por fila, aplicada únicamente al objetivo y su historial.
-- OJO: la ordenación de locks de otras tablas no queda cubierta por este piloto.
CREATE FUNCTION public.usuario_eliminacion_piloto_guard_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE
  v_target constant uuid := 'dbceb8be-8356-4412-bfe9-915328f6d916'::uuid;
  v_req constant uuid := '7fdb8fc8-df65-43b4-bbc7-71cd35e7bd3e'::uuid;
  v_aplica boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'usuarios' THEN
    v_aplica := TG_OP IN ('UPDATE','DELETE') AND OLD.id = v_target;
  ELSIF TG_TABLE_NAME = 'solicitudes_reactivas' THEN
    IF TG_OP = 'INSERT' THEN
      v_aplica := NEW.creada_por = v_target;
    ELSIF TG_OP = 'DELETE' THEN
      v_aplica := OLD.creada_por = v_target;
    ELSE
      v_aplica := OLD.creada_por = v_target OR NEW.creada_por = v_target;
    END IF;
  ELSIF TG_TABLE_NAME = 'solicitudes_reactivas_avisos' THEN
    IF TG_OP = 'INSERT' THEN
      v_aplica := NEW.solicitud_id = v_req;
    ELSIF TG_OP = 'DELETE' THEN
      v_aplica := OLD.solicitud_id = v_req;
    ELSE
      v_aplica := OLD.solicitud_id = v_req OR NEW.solicitud_id = v_req;
    END IF;
  ELSE
    RAISE EXCEPTION 'TABLA_PILOTO_NO_ADMITIDA';
  END IF;

  IF v_aplica THEN
    -- Un snapshot anterior a la reserva no es apto para proteger la fila piloto.
    IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'AISLAMIENTO_PILOTO_NO_CERTIFICADO';
    END IF;
    -- Escritores del historial esperan cualquier certificación en curso.
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(209, 1);
    IF EXISTS (
      SELECT 1 FROM public.usuarios_eliminaciones_operaciones o
      WHERE o.objetivo_id = v_target
        AND o.estado IN ('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION')
        AND o.intentos_auth >= 1
    ) THEN
      -- Borrado en cascada desde auth.users, DESPUÉS de que el usuario Auth
      -- ya no existe en esta misma transacción; no bloquear ese DELETE.
      -- Un borrado directo de perfil con Auth todavía existente sí se bloquea.
      IF TG_TABLE_NAME = 'usuarios' AND TG_OP = 'DELETE'
         AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_target) THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CUENTA_PILOTO_EN_ELIMINACION';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$body$;

CREATE TRIGGER usuario_eliminacion_piloto_usuarios_v1
  BEFORE UPDATE OR DELETE ON public.usuarios FOR EACH ROW
  EXECUTE FUNCTION public.usuario_eliminacion_piloto_guard_v1();
CREATE TRIGGER usuario_eliminacion_piloto_solicitudes_v1
  BEFORE INSERT OR UPDATE OR DELETE ON public.solicitudes_reactivas FOR EACH ROW
  EXECUTE FUNCTION public.usuario_eliminacion_piloto_guard_v1();
CREATE TRIGGER usuario_eliminacion_piloto_avisos_v1
  BEFORE INSERT OR UPDATE OR DELETE ON public.solicitudes_reactivas_avisos FOR EACH ROW
  EXECUTE FUNCTION public.usuario_eliminacion_piloto_guard_v1();

-- Los flags certificados solo los asigna esta función tras validaciones reales.
CREATE FUNCTION public.usuario_eliminacion_iniciar_piloto_v1(p_operacion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE
  v_target constant uuid := 'dbceb8be-8356-4412-bfe9-915328f6d916'::uuid;
  v_req constant uuid := '7fdb8fc8-df65-43b4-bbc7-71cd35e7bd3e'::uuid;
  v_op public.usuarios_eliminaciones_operaciones%ROWTYPE;
  v_eval jsonb;
  v_reauth jsonb;
  v_claims jsonb;
  v_actor uuid;
  v_session text;
  v_ms numeric;
  v_attempt uuid;
  v_s jsonb;
  v_a jsonb;
  v_cuenta bigint;
  v_avisos bigint;
  v_alertas bigint;
  v_estados bigint;
  v_correo jsonb;
  v_sesion jsonb;
BEGIN
  IF current_user <> 'postgres'
     OR pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'CONTEXTO_SQL_NO_ADMITIDO';
  END IF;
  v_actor := auth.uid();
  IF v_actor IS NULL OR public.es_administrador_permanente_actual() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SOLO_ADMIN_PERMANENTE';
  END IF;

  -- SERIALIZACIÓN: misma llave que los tres triggers del piloto.
  PERFORM pg_catalog.pg_advisory_xact_lock(209, 1);
  SELECT * INTO STRICT v_op
    FROM public.usuarios_eliminaciones_operaciones
    WHERE id = p_operacion_id FOR UPDATE;
  IF v_op.objetivo_id <> v_target OR v_op.actor_id <> v_actor OR v_actor = v_target
     OR v_op.estado <> 'PREPARADA' OR v_op.intentos_auth <> 0
     OR v_op.auditoria_id IS NOT NULL
     OR v_op.objetivo_nombre_snapshot <> 'Pablo Gamboa' THEN
    RAISE EXCEPTION 'OPERACION_PILOTO_NO_VALIDA';
  END IF;

  PERFORM id FROM public.usuarios
    WHERE id IN (v_actor, v_target) ORDER BY id FOR UPDATE;
  IF public.es_administrador_permanente_actual() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PRIVILEGIO_CAMBIO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u
                 JOIN public.roles r ON r.id = u.rol_id
                 WHERE u.id = v_target AND u.estado IS TRUE
                   AND u.nombre = 'Pablo Gamboa' AND r.nombre = 'Recepción') THEN
    RAISE EXCEPTION 'PERFIL_PILOTO_CAMBIO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_target) THEN
    RAISE EXCEPTION 'AUTH_PILOTO_AUSENTE';
  END IF;

  SELECT public.usuario_eliminacion_evaluar_recepcion_v1(v_target) INTO v_eval;
  IF v_eval->>'resultado' <> 'APTO_PARA_REVISION_FINAL'
     OR v_eval->'apto_preliminar' IS DISTINCT FROM 'true'::jsonb
     OR v_eval->'otras_referencias_detectadas' IS DISTINCT FROM 'false'::jsonb
     OR v_eval->'solicitudes_creadas' IS DISTINCT FROM '1'::jsonb
     OR v_eval->'avisos_asociados' IS DISTINCT FROM '1'::jsonb
     OR v_eval->'solicitudes_snapshot_incorrecto' IS DISTINCT FROM '0'::jsonb
     OR v_eval->'objetos_storage' IS DISTINCT FROM '0'::jsonb THEN
    RAISE EXCEPTION 'DEPENDENCIAS_PILOTO_NO_APTAS';
  END IF;
  SELECT count(*) INTO v_cuenta
  FROM public.solicitudes_reactivas s
  WHERE s.id = v_req AND s.creada_por = v_target
    AND s.creador_nombre_snapshot = 'Pablo Gamboa' AND s.estado = 'pendiente';
  SELECT count(*) INTO v_avisos FROM public.solicitudes_reactivas_avisos a
  WHERE a.solicitud_id = v_req;
  SELECT count(*) INTO v_alertas FROM public.alertas WHERE usuario_id = v_target;
  SELECT count(*) INTO v_estados FROM public.solicitudes_reactivas_avisos_estado
    WHERE usuario_id = v_target;
  IF v_cuenta <> 1 OR v_avisos <> 1 OR v_alertas <> 0 OR v_estados <> 0 THEN
    RAISE EXCEPTION 'HISTORIAL_PILOTO_CAMBIO';
  END IF;

  SELECT jsonb_build_object('verificado_en', c.verificado_en) INTO v_correo
    FROM public.usuarios_correos_verificados c WHERE c.usuario_id = v_target;
  SELECT jsonb_build_object('revision', s.revision,
                            'actualizado_en', s.actualizado_en) INTO v_sesion
    FROM public.usuarios_sesion_cambios s WHERE s.usuario_id = v_target;
  IF v_correo IS NULL OR v_sesion IS NULL THEN
    RAISE EXCEPTION 'METADATOS_TECNICOS_CAMBIARON';
  END IF;

  SELECT pg_catalog.coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('id',s.id,'estado',s.estado,
      'sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.to_jsonb(s)::text,'UTF8')),'hex'))
    ORDER BY s.id), '[]'::jsonb)
  INTO v_s FROM public.solicitudes_reactivas s WHERE s.creada_por = v_target;
  SELECT pg_catalog.coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('solicitud_id',a.solicitud_id,
      'sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.to_jsonb(a)::text,'UTF8')),'hex'))
    ORDER BY a.solicitud_id,pg_catalog.to_jsonb(a)::text), '[]'::jsonb)
  INTO v_a FROM public.solicitudes_reactivas_avisos a WHERE a.solicitud_id = v_req;

  v_reauth := v_op.dependencias_resumen->'paso192'->'reauth';
  v_ms := pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()) * 1000;
  v_claims := NULLIF(pg_catalog.current_setting('request.jwt.claims', true),'')::jsonb;
  v_session := v_claims->>'session_id';
  IF v_reauth IS NULL OR pg_catalog.jsonb_typeof(v_reauth) <> 'object'
     OR v_reauth->>'actor_id' IS DISTINCT FROM v_actor::text
     OR v_reauth->>'target_id' IS DISTINCT FROM v_target::text
     OR v_reauth->>'operation_id' IS DISTINCT FROM v_op.id::text
     OR v_reauth->>'request_id' IS DISTINCT FROM v_op.dependencias_resumen->'paso191'->>'request_id'
     OR v_reauth->>'fingerprint' IS DISTINCT FROM v_op.dependencias_resumen->'paso191'->>'fingerprint'
     OR v_reauth->>'session_id' IS DISTINCT FROM v_session OR v_session IS NULL
     OR v_reauth->>'method' IS DISTINCT FROM 'password'
     OR v_reauth->>'purpose' IS DISTINCT FROM 'inicio'
     OR v_reauth->'consumed_at' IS DISTINCT FROM 'null'::jsonb
     OR pg_catalog.jsonb_typeof(v_reauth->'verified_at') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(v_reauth->'expires_at') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'REAUTENTICACION_NO_ACREDITADA';
  END IF;
  IF (v_reauth->>'verified_at')::numeric > v_ms
     OR (v_reauth->>'expires_at')::numeric <= v_ms
     OR (v_reauth->>'expires_at')::numeric - (v_reauth->>'verified_at')::numeric <> 120000 THEN
    RAISE EXCEPTION 'REAUTENTICACION_CADUCADA';
  END IF;

  -- Una vez desactivado, las políticas que requieren perfil habilitado deniegan
  -- las acciones de la cuenta aunque conserve temporalmente un JWT válido.
  UPDATE public.usuarios SET estado = false WHERE id = v_target AND estado IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OBJETIVO_CAMBIO'; END IF;

  v_attempt := pg_catalog.gen_random_uuid();
  UPDATE public.usuarios_eliminaciones_operaciones
  SET estado = 'AUTH_EN_CURSO', intentos_auth = 1,
      dependencias_resumen = dependencias_resumen
        || pg_catalog.jsonb_build_object(
           'conservacion_historica_certificada', true,
           'autorizacion_irreversible_confirmada', true,
           'auth_eliminacion_verificada', false,
           'piloto_restringido', 'recepcion-unico-uuid-209',
           'paso176_evidencia',pg_catalog.jsonb_build_object(
               'alcance','piloto_recepcion',
               'objetivo_id',v_target,
               'solicitudes_creadas',1,'avisos_asociados',1,
               'huellas_solicitudes',v_s,'huellas_avisos',v_a,
               'algoritmo_huellas','sha256-jsonb-postgresql-v1',
               'metadatos_correo',v_correo,'metadatos_sesion',v_sesion,
               'evaluacion',v_eval,'capturado_en',pg_catalog.clock_timestamp()),
           'paso191',(dependencias_resumen->'paso191')
               || pg_catalog.jsonb_build_object('attempt_id',v_attempt),
           'paso192',(dependencias_resumen->'paso192')
               || pg_catalog.jsonb_build_object('reauth',
                   v_reauth || pg_catalog.jsonb_build_object('consumed_at',v_ms))),
      updated_at = pg_catalog.clock_timestamp()
  WHERE id=v_op.id AND estado='PREPARADA' AND intentos_auth=0;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPERACION_CAMBIO'; END IF;

  RETURN pg_catalog.jsonb_build_object(
    'operacion_id',v_op.id,'estado','AUTH_EN_CURSO',
    'attempt_id',v_attempt, 'eliminacion_habilitada',false,
    'puede_eliminar',false);
END;
$body$;

-- Supabase HTTP/PostgREST no puede invocar estas funciones desde cuentas cliente.
REVOKE ALL ON FUNCTION public.usuario_eliminacion_piloto_entrada_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.usuario_eliminacion_piloto_guard_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.usuario_eliminacion_iniciar_piloto_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- COMPROBACION ESTRUCTURAL EN LA MISMA TRANSACCION, antes del ROLLBACK.
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_trigger
      WHERE tgname IN (
        'usuario_eliminacion_piloto_entrada_usuarios_v1',
        'usuario_eliminacion_piloto_entrada_solicitudes_v1',
        'usuario_eliminacion_piloto_entrada_avisos_v1',
        'usuario_eliminacion_piloto_usuarios_v1',
        'usuario_eliminacion_piloto_solicitudes_v1',
        'usuario_eliminacion_piloto_avisos_v1') AND NOT tgisinternal) <> 6 THEN
    RAISE EXCEPTION 'TRIGGERS_PILOTO_NO_VERIFICADOS';
  END IF;
END;
$check$;

-- Instalar guardas exclusivamente. NO se invoca la función de inicio ni Auth.
COMMIT;
