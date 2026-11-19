-- 21F.4 y 21F.5. Instalación protegida. Revisar antes de ejecutar.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
SET LOCAL check_function_bodies = on;

DO $preflight$
BEGIN
  IF current_user <> 'postgres'
     OR EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'tareas_pendientes_responsables_v1'
     )
     OR to_regprocedure('public.tareas_pendientes_crear_v1(uuid,text,text,date,uuid,uuid[])') IS NULL
     OR to_regprocedure('public.tareas_pendientes_editar_v1(uuid,uuid,integer,text,text,date,uuid)') IS NULL THEN
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_PRECONDICIONES';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated'), ('service_role')) r(rol)
    CROSS JOIN pg_namespace n
    WHERE n.nspname IN ('pg_catalog', 'public', 'auth')
      AND has_schema_privilege(r.rol::name, n.oid, 'CREATE')
  ) THEN
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_ESQUEMA_NO_CONFIABLE';
  END IF;

  -- Resolver el contrato de columnas sin leer filas.
  PERFORM u.id, u.estado, u.nombre, u.rol_id, u.trabajador_id,
          r.nombre, d.id, d.usuario_id, d.revocado_at, d.vigente_desde, d.vigente_hasta,
          w.id, w.nombre, w.estado, t.id, t.estado, t.completada_en, t.completada_por,
          a.id, a.tarea_id, a.trabajador_id, a.progreso, a.estado, a.asignada_en,
          a.asignada_por, a.asignada_por_nombre_snapshot, a.ejecutor_id,
          a.ejecutor_nombre_snapshot, a.completada_en, a.completada_por,
          a.completada_por_nombre_snapshot, a.retirada_en, a.retirada_por,
          a.retirada_por_nombre_snapshot,
          o.solicitud_id, o.tarea_id, o.actor_id, o.actor_nombre_snapshot, o.accion,
          o.peticion_huella, o.revision_anterior, o.revision_resultante,
          o.antes, o.despues, o.resultado
  FROM public.usuarios u, public.roles r, public.administraciones_temporales d,
       public.trabajadores w, public.tareas_pendientes t,
       public.tareas_pendientes_asignaciones a, public.tareas_pendientes_operaciones o
  LIMIT 0;

  IF to_regprocedure('auth.uid()') IS NULL
     OR to_regprocedure('public.es_administrador_actual()') IS NULL
     OR to_regprocedure('public.normalizar_nombre_rol(text)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger tr
       JOIN pg_proc p ON p.oid = tr.tgfoid
       JOIN pg_namespace n ON n.oid = p.pronamespace
       JOIN pg_attribute a ON a.attrelid = tr.tgrelid AND a.attname = 'estado'
       WHERE tr.tgrelid = 'public.tareas_pendientes'::regclass
         AND n.nspname = 'public' AND p.proname = 'tareas_pendientes_registrar_finalizacion'
         AND NOT tr.tgisinternal AND tr.tgenabled IN ('O', 'A')
         AND tr.tgtype = 19 AND tr.tgattr::text = a.attnum::text
     ) THEN
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_DEPENDENCIA_INCOMPATIBLE';
  END IF;
END;
$preflight$;

-- ASIGNAR: altas; REASIGNAR: altas y retiros simultáneos;
-- AVANCE: UUID de asignación vigente y porcentaje.
CREATE FUNCTION public.tareas_pendientes_responsables_v1(
  p_solicitud_id uuid,
  p_tarea_id uuid,
  p_revision_esperada bigint,
  p_accion text,
  p_incorporar uuid[],
  p_retirar uuid[],
  p_asignacion_id uuid,
  p_progreso numeric
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $rpc$
DECLARE
  v_actor uuid := auth.uid();
  v_usuario record;
  v_rol text;
  v_rol_inicial uuid;
  v_admin boolean;
  v_permanente boolean;
  v_desde timestamptz;
  v_hasta timestamptz;
  v_ahora timestamptz;
  v_tarea public.tareas_pendientes%ROWTYPE;
  v_asignacion public.tareas_pendientes_asignaciones%ROWTYPE;
  v_operacion public.tareas_pendientes_operaciones%ROWTYPE;
  v_ficha record;
  v_ejecutor_nombre text;
  v_incorporar uuid[];
  v_retirar uuid[];
  v_progreso numeric;
  v_huella text;
  v_revision bigint;
  v_cantidad bigint;
  v_activas bigint;
  v_completadas bigint;
  v_antes jsonb;
  v_despues jsonb;
  v_resultado jsonb;
  v_aplicada boolean := true;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_NO_AUTORIZADA' USING ERRCODE = '42501';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_REQUIERE_READ_COMMITTED' USING ERRCODE = '25000';
  END IF;
  SELECT u.rol_id INTO v_rol_inicial
  FROM public.usuarios u WHERE u.id = v_actor AND u.estado IS TRUE;
  IF v_rol_inicial IS NULL THEN
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_NO_AUTORIZADA' USING ERRCODE = '42501';
  END IF;

  IF p_solicitud_id IS NULL OR p_tarea_id IS NULL
     OR p_revision_esperada IS NULL OR p_revision_esperada < 1
     OR p_accion IS NULL OR p_accion NOT IN ('ASIGNAR', 'REASIGNAR', 'AVANCE')
     OR coalesce(array_ndims(p_incorporar), 1) <> 1
     OR coalesce(array_ndims(p_retirar), 1) <> 1 THEN
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_DATOS_INVALIDOS' USING ERRCODE = '22023';
  END IF;
  SELECT ARRAY(SELECT x FROM unnest(p_incorporar) AS ids(x) ORDER BY x),
         ARRAY(SELECT x FROM unnest(p_retirar) AS ids(x) ORDER BY x)
  INTO v_incorporar, v_retirar;

  IF cardinality(v_incorporar) <> (SELECT count(DISTINCT x) FROM unnest(v_incorporar) AS ids(x))
     OR cardinality(v_retirar) <> (SELECT count(DISTINCT x) FROM unnest(v_retirar) AS ids(x))
     OR v_incorporar && v_retirar
     OR (p_accion = 'ASIGNAR' AND (cardinality(v_incorporar) = 0 OR cardinality(v_retirar) <> 0))
     OR (p_accion = 'REASIGNAR' AND (cardinality(v_incorporar) = 0 OR cardinality(v_retirar) = 0))
     OR (p_accion <> 'AVANCE' AND (p_asignacion_id IS NOT NULL OR p_progreso IS NOT NULL))
     OR (p_accion = 'AVANCE' AND (
       cardinality(v_incorporar) <> 0 OR cardinality(v_retirar) <> 0
       OR p_asignacion_id IS NULL OR p_progreso IS NULL
       OR p_progreso NOT BETWEEN 0 AND 100 OR p_progreso <> trunc(p_progreso, 2)
     )) THEN
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_DATOS_INVALIDOS' USING ERRCODE = '22023';
  END IF;
  v_progreso := trunc(p_progreso, 2);

  v_huella := encode(sha256(convert_to(jsonb_build_object(
    'contrato', 'tareas_pendientes_responsables_v1',
    'accion', p_accion, 'tarea_id', p_tarea_id, 'revision', p_revision_esperada,
    'incorporar', v_incorporar, 'retirar', v_retirar,
    'asignacion_id', p_asignacion_id, 'progreso', v_progreso
  )::text, 'UTF8')), 'hex');

  -- Mismo espacio de solicitud y orden que CREAR y EDITAR.
  PERFORM pg_advisory_xact_lock(215202, hashtext(p_solicitud_id::text));
  SELECT u.estado, u.rol_id, u.trabajador_id, nullif(btrim(u.nombre), '') AS nombre
  INTO v_usuario FROM public.usuarios u WHERE u.id = v_actor
  FOR SHARE OF u NOWAIT;
  IF NOT FOUND OR v_usuario.estado IS DISTINCT FROM TRUE
     OR v_usuario.rol_id IS DISTINCT FROM v_rol_inicial THEN
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_NO_AUTORIZADA' USING ERRCODE = '42501';
  END IF;

  SELECT public.normalizar_nombre_rol(r.nombre)
  INTO v_rol FROM public.roles r WHERE r.id = v_usuario.rol_id
  FOR SHARE OF r NOWAIT;
  IF NOT FOUND OR nullif(v_rol, '') IS NULL THEN
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_NO_AUTORIZADA' USING ERRCODE = '42501';
  END IF;

  v_permanente := v_rol = 'administrador';
  v_admin := v_permanente;
  IF NOT v_permanente AND public.es_administrador_actual() IS TRUE THEN
    v_ahora := clock_timestamp();
    SELECT d.vigente_desde, d.vigente_hasta INTO v_desde, v_hasta
    FROM public.administraciones_temporales d
    WHERE d.usuario_id = v_actor AND d.revocado_at IS NULL
      AND d.vigente_desde <= v_ahora AND d.vigente_hasta > v_ahora
    ORDER BY d.vigente_hasta DESC, d.id LIMIT 1
    FOR SHARE OF d NOWAIT;
    v_admin := FOUND;
  END IF;

  IF v_admin THEN
    IF public.es_administrador_actual() IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'TAREAS_RESPONSABLES_NO_AUTORIZADA' USING ERRCODE = '42501';
    END IF;
  ELSIF p_accion <> 'AVANCE' OR v_rol <> 'tecnico' OR v_usuario.trabajador_id IS NULL THEN
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_NO_AUTORIZADA' USING ERRCODE = '42501';
  END IF;

  -- El candado de tarea serializa la revisión y el cálculo del cierre global.
  SELECT t.* INTO v_tarea FROM public.tareas_pendientes t
  WHERE t.id = p_tarea_id FOR NO KEY UPDATE OF t NOWAIT;
  IF NOT FOUND THEN
    IF NOT v_admin THEN
      RAISE EXCEPTION 'TAREAS_RESPONSABLES_NO_AUTORIZADA' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_TAREA_INEXISTENTE' USING ERRCODE = 'P0002';
  END IF;

  IF p_accion = 'AVANCE' THEN
    SELECT a.* INTO v_asignacion FROM public.tareas_pendientes_asignaciones a
    WHERE a.id = p_asignacion_id AND a.tarea_id = p_tarea_id AND a.retirada_en IS NULL;
    IF NOT v_admin AND (
      v_asignacion.id IS NULL OR v_asignacion.trabajador_id IS DISTINCT FROM v_usuario.trabajador_id
    ) THEN
      RAISE EXCEPTION 'TAREAS_RESPONSABLES_NO_AUTORIZADA' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Una ficha laboral vigente es requisito de acceso del Técnico, también en reenvíos.
  IF NOT v_admin THEN
    PERFORM 1 FROM public.trabajadores w
    WHERE w.id = v_usuario.trabajador_id AND w.estado = 'Activo'
    FOR SHARE OF w NOWAIT;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TAREAS_RESPONSABLES_NO_AUTORIZADA' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT o.* INTO v_operacion FROM public.tareas_pendientes_operaciones o
  WHERE o.solicitud_id = p_solicitud_id;
  IF FOUND THEN
    IF v_operacion.actor_id IS DISTINCT FROM v_actor
       OR v_operacion.tarea_id IS DISTINCT FROM p_tarea_id
       OR v_operacion.accion IS DISTINCT FROM p_accion
       OR v_operacion.peticion_huella IS DISTINCT FROM v_huella THEN
      RAISE EXCEPTION 'TAREAS_RESPONSABLES_SOLICITUD_INCOMPATIBLE' USING ERRCODE = '23505';
    END IF;
    v_resultado := v_operacion.resultado || jsonb_build_object('reenvio', true);
  ELSE
    IF v_usuario.nombre IS NULL THEN
      RAISE EXCEPTION 'TAREAS_RESPONSABLES_ACTOR_SIN_NOMBRE' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.tareas_pendientes_operaciones o
      WHERE o.tarea_id = p_tarea_id AND o.accion = 'CREAR'
        AND o.revision_resultante = 1 AND o.revision_anterior IS NULL
    ) THEN
      RAISE EXCEPTION 'TAREAS_RESPONSABLES_SIN_REVISION_INICIAL' USING ERRCODE = '55000';
    END IF;
    SELECT max(o.revision_resultante) INTO v_revision
    FROM public.tareas_pendientes_operaciones o WHERE o.tarea_id = p_tarea_id;
    IF v_revision IS DISTINCT FROM p_revision_esperada THEN
      RAISE EXCEPTION 'TAREAS_RESPONSABLES_REVISION_DESACTUALIZADA' USING ERRCODE = '40001';
    END IF;
    IF v_tarea.estado <> 'pendiente' THEN
      RAISE EXCEPTION 'TAREAS_RESPONSABLES_TAREA_FINALIZADA' USING ERRCODE = '55000';
    END IF;

    IF p_accion = 'AVANCE' THEN
      IF v_asignacion.id IS NULL THEN
        RAISE EXCEPTION 'TAREAS_RESPONSABLES_ASIGNACION_NO_VIGENTE' USING ERRCODE = '55000';
      END IF;
      IF v_asignacion.estado = 'completada' AND v_progreso <> 100 THEN
        RAISE EXCEPTION 'TAREAS_RESPONSABLES_ASIGNACION_FINALIZADA' USING ERRCODE = '55000';
      END IF;
      SELECT nullif(btrim(w.nombre), '') INTO v_ejecutor_nombre
      FROM public.trabajadores w
      WHERE w.id = v_asignacion.trabajador_id AND w.estado = 'Activo'
      FOR SHARE OF w NOWAIT;
      IF NOT FOUND OR (v_progreso = 100 AND v_ejecutor_nombre IS NULL) THEN
        RAISE EXCEPTION 'TAREAS_RESPONSABLES_TRABAJADOR_NO_ELEGIBLE' USING ERRCODE = '22023';
      END IF;
      v_aplicada := v_progreso IS DISTINCT FROM v_asignacion.progreso;
    ELSE
      v_cantidad := 0;
      FOR v_ficha IN
        SELECT w.id, w.estado FROM public.trabajadores w
        WHERE w.id = ANY(v_incorporar) ORDER BY w.id FOR SHARE OF w NOWAIT
      LOOP
        IF v_ficha.estado IS DISTINCT FROM 'Activo' THEN
          RAISE EXCEPTION 'TAREAS_RESPONSABLES_TRABAJADOR_NO_ELEGIBLE' USING ERRCODE = '22023';
        END IF;
        v_cantidad := v_cantidad + 1;
      END LOOP;
      IF v_cantidad <> cardinality(v_incorporar) THEN
        RAISE EXCEPTION 'TAREAS_RESPONSABLES_TRABAJADOR_NO_ELEGIBLE' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.tareas_pendientes_asignaciones a
        WHERE a.tarea_id = p_tarea_id AND a.retirada_en IS NULL
          AND a.trabajador_id = ANY(v_incorporar)
      ) THEN
        RAISE EXCEPTION 'TAREAS_RESPONSABLES_YA_ASIGNADO' USING ERRCODE = '23505';
      END IF;
    END IF;

    SELECT jsonb_build_object(
      'tarea', jsonb_build_object('id', v_tarea.id, 'estado', v_tarea.estado,
        'completada_en', v_tarea.completada_en, 'completada_por', v_tarea.completada_por),
      'asignaciones', coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]'::jsonb)
    ) INTO v_antes
    FROM public.tareas_pendientes_asignaciones a
    WHERE a.tarea_id = p_tarea_id AND a.retirada_en IS NULL;

    v_ahora := clock_timestamp();
    IF v_admin AND (
      public.es_administrador_actual() IS DISTINCT FROM TRUE
      OR (NOT v_permanente AND NOT (v_desde <= v_ahora AND v_ahora < v_hasta))
    ) THEN
      RAISE EXCEPTION 'TAREAS_RESPONSABLES_NO_AUTORIZADA' USING ERRCODE = '42501';
    END IF;

    IF p_accion = 'AVANCE' THEN
      IF v_aplicada THEN
        UPDATE public.tareas_pendientes_asignaciones
        SET progreso = v_progreso,
            estado = CASE WHEN v_progreso = 100 THEN 'completada'
                          WHEN v_progreso = 0 THEN 'pendiente' ELSE 'en_proceso' END,
            ejecutor_id = CASE WHEN v_progreso = 100 THEN trabajador_id END,
            ejecutor_nombre_snapshot = CASE WHEN v_progreso = 100 THEN v_ejecutor_nombre END,
            completada_en = CASE WHEN v_progreso = 100 THEN v_ahora END,
            completada_por = CASE WHEN v_progreso = 100 THEN v_actor END,
            completada_por_nombre_snapshot = CASE WHEN v_progreso = 100 THEN v_usuario.nombre END
        WHERE id = v_asignacion.id AND retirada_en IS NULL;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'TAREAS_RESPONSABLES_ASIGNACION_NO_VIGENTE' USING ERRCODE = '55000';
        END IF;
      END IF;
    ELSE
      IF p_accion = 'REASIGNAR' THEN
        UPDATE public.tareas_pendientes_asignaciones
        SET retirada_en = v_ahora, retirada_por = v_actor,
            retirada_por_nombre_snapshot = v_usuario.nombre
        WHERE tarea_id = p_tarea_id AND retirada_en IS NULL
          AND trabajador_id = ANY(v_retirar);
        GET DIAGNOSTICS v_cantidad = ROW_COUNT;
        IF v_cantidad <> cardinality(v_retirar) THEN
          RAISE EXCEPTION 'TAREAS_RESPONSABLES_ASIGNACION_NO_VIGENTE' USING ERRCODE = '55000';
        END IF;
      END IF;

      INSERT INTO public.tareas_pendientes_asignaciones (
        tarea_id, trabajador_id, estado, progreso, asignada_en, asignada_por,
        asignada_por_nombre_snapshot
      )
      SELECT p_tarea_id, x, 'pendiente', 0, v_ahora, v_actor, v_usuario.nombre
      FROM unnest(v_incorporar) AS ids(x);
    END IF;

    SELECT count(*), count(*) FILTER (WHERE a.progreso = 100)
    INTO v_activas, v_completadas
    FROM public.tareas_pendientes_asignaciones a
    WHERE a.tarea_id = p_tarea_id AND a.retirada_en IS NULL;
    IF v_activas = 0 THEN
      RAISE EXCEPTION 'TAREAS_RESPONSABLES_SIN_RESPONSABLES' USING ERRCODE = '55000';
    END IF;

    IF v_activas = v_completadas THEN
      -- El trigger existente toma auth.uid() y establece los datos del cierre.
      UPDATE public.tareas_pendientes SET estado = 'completada'
      WHERE id = p_tarea_id RETURNING * INTO v_tarea;
      IF NOT FOUND OR v_tarea.estado IS DISTINCT FROM 'completada'
         OR v_tarea.completada_en IS NULL OR v_tarea.completada_por IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION 'TAREAS_RESPONSABLES_CIERRE_INCOMPATIBLE' USING ERRCODE = '55000';
      END IF;
      v_aplicada := true;
    END IF;

    SELECT jsonb_build_object(
      'tarea', jsonb_build_object('id', v_tarea.id, 'estado', v_tarea.estado,
        'completada_en', v_tarea.completada_en, 'completada_por', v_tarea.completada_por),
      'asignaciones', coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]'::jsonb)
    ) INTO v_despues
    FROM public.tareas_pendientes_asignaciones a
    WHERE a.tarea_id = p_tarea_id
      AND (a.retirada_en IS NULL OR (
        p_accion = 'REASIGNAR' AND a.retirada_en = v_ahora
        AND a.retirada_por = v_actor AND a.trabajador_id = ANY(v_retirar)
      ));

    v_resultado := jsonb_build_object(
      'solicitud_id', p_solicitud_id, 'tarea_id', p_tarea_id,
      'revision', v_revision + 1, 'estado', v_tarea.estado,
      'aplicada', v_aplicada, 'reenvio', false
    );
    INSERT INTO public.tareas_pendientes_operaciones (
      solicitud_id, tarea_id, actor_id, actor_nombre_snapshot, accion,
      peticion_huella, revision_anterior, revision_resultante, antes, despues, resultado
    ) VALUES (
      p_solicitud_id, p_tarea_id, v_actor, v_usuario.nombre, p_accion,
      v_huella, v_revision, v_revision + 1, v_antes, v_despues, v_resultado
    );
  END IF;

  v_ahora := clock_timestamp();
  IF v_admin AND (
    public.es_administrador_actual() IS DISTINCT FROM TRUE
    OR (NOT v_permanente AND NOT (v_desde <= v_ahora AND v_ahora < v_hasta))
  ) THEN
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_NO_AUTORIZADA' USING ERRCODE = '42501';
  END IF;
  RETURN v_resultado;
END;
$rpc$;

REVOKE EXECUTE ON FUNCTION public.tareas_pendientes_responsables_v1(
  uuid, uuid, bigint, text, uuid[], uuid[], uuid, numeric
) FROM PUBLIC, anon, authenticated, service_role;

DO $postflight$
DECLARE
  v_rpc oid := 'public.tareas_pendientes_responsables_v1(uuid,uuid,bigint,text,uuid[],uuid[],uuid,numeric)'::regprocedure;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = v_rpc AND pg_get_userbyid(p.proowner) = 'postgres'
      AND p.prosecdef AND p.provolatile = 'v'
      AND 'search_path=pg_catalog, public, auth, pg_temp' = ANY(p.proconfig)
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = v_rpc AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p
    CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) r(rol)
    WHERE p.oid = v_rpc AND (
      has_function_privilege(r.rol::name, p.oid, 'EXECUTE')
      OR pg_has_role(r.rol::name, p.proowner, 'MEMBER')
    )
  ) THEN
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_RPC_NO_AISLADA';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) r(rol)
    WHERE c.oid IN ('public.tareas_pendientes_asignaciones'::regclass,
                    'public.tareas_pendientes_operaciones'::regclass)
      AND (
        NOT c.relrowsecurity
        OR EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
        OR pg_has_role(r.rol::name, c.relowner, 'MEMBER')
        OR has_table_privilege(r.rol::name, c.oid,
          'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
        OR has_any_column_privilege(r.rol::name, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
      )
  ) THEN
    RAISE EXCEPTION 'TAREAS_RESPONSABLES_TABLAS_NO_AISLADAS';
  END IF;
END;
$postflight$;

COMMIT;
