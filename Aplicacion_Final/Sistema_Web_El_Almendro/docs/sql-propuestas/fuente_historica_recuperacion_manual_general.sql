-- PASO 233. PROPUESTA NO INSTALADA. No ejecutar sin revisión y autorización.
-- Una sola función, exclusivamente para recuperación manual como postgres.
-- No llama Auth, no repite la eliminación ni modifica registros históricos.
-- Baseline admitida: SQL215 RECEPCION_TECNICO_RESTRINGIDO_V1, no piloto212/192.
-- Los UUID esperados comprueban la selección original; NO autentican una persona.
-- La autoridad de recuperación es la conexión administrativa postgres. No se
-- finge auth.uid(), no se otorgan permisos y se conserva el actor original.
-- Instalación propuesta rodeada de ROLLBACK. NO incluye llamadas de recuperación.
-- Una futura llamada autorizada debe ejecutarse en una transacción nueva
-- READ COMMITTED, sin haber adquirido antes bloqueos de filas o tablas.
-- SHARE ROW EXCLUSIVE en referencias auxiliares impide escrituras concurrentes
-- mientras se comprueban las ausencias. Puede bloquear escritores brevemente;
-- validar bloqueo/timeout en PostgreSQL aislado antes de aprobar instalación.
-- No se certifican referencias ajenas al alcance que SQL215 dejó documentado.
-- PASO236: los SET LOCAL siguientes solo limitan esta transacción de instalación.
-- Para una futura ejecución manual autorizada: abrir BEGIN ISOLATION LEVEL READ COMMITTED;
-- ejecutar SET LOCAL lock_timeout = '3s'; y SET LOCAL statement_timeout = '20s';
-- ANTES del SELECT que llame a esta función; COMMIT únicamente si termina correctamente.
-- Si falla/caduca, ROLLBACK. No repetir Auth ni cambiar estados manualmente.
-- statement_timeout debe estar activo al recibir el SELECT, no establecerse dentro
-- de la función para intentar limitar retroactivamente la sentencia en curso.
-- La función conserva lock_timeout=3s; ese límite por bloqueo NO sustituye al total.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

CREATE FUNCTION public.usuario_eliminacion_recuperar_general_v1(
  p_operacion_id uuid,
  p_actor_original_id uuid,
  p_objetivo_original_id uuid,
  p_motivo_recuperacion text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
SET row_security = 'off'
SET lock_timeout = '3s'
AS $recuperar$
DECLARE
  v_op public.usuarios_eliminaciones_operaciones%ROWTYPE;
  v_audit public.del_registro_eliminaciones%ROWTYPE;
  v_e jsonb;
  v_eval jsonb;
  v_reauth jsonb;
  v_otros jsonb;
  v_s jsonb;
  v_a jsonb;
  v_expected_audit jsonb;
  v_preservado jsonb;
  v_result jsonb;
  v_capturado timestamptz;
  v_motivo text;
BEGIN
  -- INVOKER: current_user no adquiere postgres por ser una SECURITY DEFINER.
  IF current_user <> 'postgres' OR session_user <> 'postgres'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolbypassrls)
     OR pg_catalog.current_setting('transaction_isolation') <> 'read committed'
     OR pg_catalog.current_setting('transaction_read_only') <> 'off'
     OR pg_catalog.current_setting('row_security') <> 'off'
     OR pg_catalog.current_setting('session_replication_role') <> 'origin' THEN
    RAISE EXCEPTION 'CONTEXTO_RECUPERACION_NO_ADMITIDO';
  END IF;
  v_motivo := pg_catalog.btrim(p_motivo_recuperacion);
  IF p_operacion_id IS NULL OR p_actor_original_id IS NULL OR p_objetivo_original_id IS NULL
     OR v_motivo IS NULL OR pg_catalog.length(v_motivo) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'DATOS_RECUPERACION_INVALIDOS';
  END IF;

  -- Mismo orden del inicio general: exclusión global, operación, perfil original.
  PERFORM pg_catalog.pg_advisory_xact_lock(209,1);
  SELECT * INTO STRICT v_op FROM public.usuarios_eliminaciones_operaciones
    WHERE id=p_operacion_id FOR UPDATE;
  IF v_op.actor_id IS DISTINCT FROM p_actor_original_id
     OR v_op.objetivo_id IS DISTINCT FROM p_objetivo_original_id
     OR v_op.actor_id=v_op.objetivo_id OR v_op.intentos_auth<>1
     OR v_op.estado NOT IN ('REQUIERE_REVISION','AUTH_EN_CURSO','AUTH_ELIMINADA','COMPLETADA') THEN
    RAISE EXCEPTION 'OPERACION_RECUPERACION_NO_VINCULADA';
  END IF;
  PERFORM u.id FROM public.usuarios u WHERE u.id=v_op.actor_id FOR UPDATE;
  IF v_op.estado<>'COMPLETADA' AND (NOT EXISTS (SELECT 1 FROM public.usuarios u
      WHERE u.id=v_op.actor_id AND u.estado IS TRUE AND public.es_rol_administrador(u.rol_id) IS TRUE)
     OR NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id=v_op.actor_id)) THEN
    RAISE EXCEPTION 'ADMINISTRADOR_ORIGINAL_NO_HABILITADO';
  END IF;
  IF v_op.estado<>'COMPLETADA' AND EXISTS (SELECT 1 FROM public.usuarios_eliminaciones_operaciones o
      WHERE o.id<>v_op.id AND o.estado IN ('AUTH_EN_CURSO','AUTH_ELIMINADA','REQUIERE_REVISION')
        AND o.intentos_auth>0
        AND (o.actor_id IN (v_op.actor_id,v_op.objetivo_id)
          OR o.objetivo_id IN (v_op.actor_id,v_op.objetivo_id))) THEN
    RAISE EXCEPTION 'OTRA_OPERACION_INCOMPATIBLE';
  END IF;

  v_e := v_op.dependencias_resumen->'paso176_evidencia';
  v_eval := v_e->'evaluacion';
  v_reauth := v_op.dependencias_resumen->'paso192'->'reauth';
  IF v_op.dependencias_resumen->'conservacion_historica_certificada' IS DISTINCT FROM 'true'::jsonb
     OR v_op.dependencias_resumen->'autorizacion_irreversible_confirmada' IS DISTINCT FROM 'true'::jsonb
     OR v_op.dependencias_resumen->>'alcance_eliminacion' IS DISTINCT FROM 'RECEPCION_TECNICO_RESTRINGIDO_V1'
     OR pg_catalog.jsonb_typeof(v_e) IS DISTINCT FROM 'object'
     OR v_e->>'alcance' IS DISTINCT FROM 'recepcion_tecnico_restringido'
     OR v_e->>'objetivo_id' IS DISTINCT FROM v_op.objetivo_id::text
     OR coalesce(pg_catalog.lower(pg_catalog.btrim(v_e->>'rol')),'') NOT IN ('recepcion','recepción','tecnico','técnico')
     OR v_e->>'algoritmo_huellas' IS DISTINCT FROM 'sha256-jsonb-postgresql-v1'
     OR pg_catalog.jsonb_typeof(v_e->'huellas_solicitudes') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_e->'huellas_avisos') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(v_e->'capturado_en') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(v_eval) IS DISTINCT FROM 'object'
     OR v_eval->>'objetivo_id' IS DISTINCT FROM v_op.objetivo_id::text
     OR v_eval->>'nombre' IS DISTINCT FROM v_op.objetivo_nombre_snapshot
     OR v_eval->>'rol' IS DISTINCT FROM v_e->>'rol'
     OR v_eval->'cuenta_auth_existe' IS DISTINCT FROM 'true'::jsonb
     OR v_eval->'otras_referencias_detectadas' IS DISTINCT FROM 'false'::jsonb
     OR v_eval->'conservacion_historica_certificada' IS DISTINCT FROM 'false'::jsonb
     OR v_eval->'eliminacion_habilitada' IS DISTINCT FROM 'false'::jsonb
     OR v_eval->'solicitudes_snapshot_incorrecto' IS DISTINCT FROM '0'::jsonb
     OR v_eval->'objetos_storage' IS DISTINCT FROM '0'::jsonb
     OR v_eval->'mantenciones_asignadas' IS DISTINCT FROM '0'::jsonb
     OR v_eval->'tareas_asignadas' IS DISTINCT FROM '0'::jsonb
     OR pg_catalog.jsonb_typeof(v_eval->'detalle_otras_referencias') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'CERTIFICACION_ORIGINAL_NO_VERIFICABLE';
  END IF;
  IF v_e->'solicitudes_creadas' IS DISTINCT FROM pg_catalog.to_jsonb(pg_catalog.jsonb_array_length(v_e->'huellas_solicitudes'))
     OR v_e->'avisos_asociados' IS DISTINCT FROM pg_catalog.to_jsonb(pg_catalog.jsonb_array_length(v_e->'huellas_avisos'))
     OR v_eval->'solicitudes_creadas' IS DISTINCT FROM v_e->'solicitudes_creadas'
     OR v_eval->'avisos_asociados' IS DISTINCT FROM v_e->'avisos_asociados' THEN
    RAISE EXCEPTION 'CONTEOS_CERTIFICADOS_INCONSISTENTES';
  END IF;
  -- PASO236: preparar omite created_at en INSERT; usa DEFAULT now() (inicio de su transacción).
  -- SQL215 calcula v_ms con clock_timestamp() ANTES del UPDATE y de capturado_en.
  -- consumed_at guarda ese v_ms anterior, aunque su clave JSON aparezca después
  -- de capturado_en. No comparar por orden textual de las claves ni exigir
  -- created_at <= verified_at: una operación PREPARADA puede reutilizarse.
  v_capturado := (v_e->>'capturado_en')::timestamptz;
  IF v_capturado<v_op.created_at OR v_capturado>pg_catalog.clock_timestamp()
     OR pg_catalog.jsonb_typeof(v_reauth) IS DISTINCT FROM 'object'
     OR v_reauth->>'actor_id' IS DISTINCT FROM v_op.actor_id::text
     OR v_reauth->>'target_id' IS DISTINCT FROM v_op.objetivo_id::text
     OR v_reauth->>'operation_id' IS DISTINCT FROM v_op.id::text
     OR v_reauth->>'request_id' IS DISTINCT FROM v_op.dependencias_resumen->'paso191'->>'request_id'
     OR v_reauth->>'fingerprint' IS DISTINCT FROM v_op.dependencias_resumen->'paso191'->>'fingerprint'
     OR coalesce(v_reauth->>'request_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR coalesce(v_reauth->>'fingerprint','') !~ '^[0-9a-f]{64}$'
     OR coalesce(v_reauth->>'proof_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR coalesce(v_reauth->>'session_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR coalesce(v_op.dependencias_resumen->'paso191'->>'attempt_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR v_reauth->>'method' IS DISTINCT FROM 'password'
     OR v_reauth->>'purpose' IS DISTINCT FROM 'inicio'
     OR pg_catalog.jsonb_typeof(v_reauth->'verified_at') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(v_reauth->'expires_at') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(v_reauth->'consumed_at') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'VINCULO_ORIGINAL_NO_VERIFICABLE';
  END IF;
  -- Se verifica la vigencia AL INICIO ORIGINAL, no se reutiliza su autorización caducada.
  -- verified_at <= consumed_at < expires_at y consumed_at <= capturado_en son compatibles
  -- con SQL215. Su consumo único procede del inicio PREPARADA/intentos_auth=0,
  -- consumed_at=null y actualización atómica a AUTH_EN_CURSO/intentos_auth=1.
  -- La recuperación solo verifica ese consumo original; no lo vuelve a consumir.
  IF (v_reauth->>'expires_at')::numeric-(v_reauth->>'verified_at')::numeric<>120000
     OR (v_reauth->>'verified_at')::numeric>(v_reauth->>'consumed_at')::numeric
     OR (v_reauth->>'consumed_at')::numeric>=(v_reauth->>'expires_at')::numeric
     OR (v_reauth->>'consumed_at')::numeric>pg_catalog.date_part('epoch',v_capturado)*1000 THEN
    RAISE EXCEPTION 'INICIO_ORIGINAL_NO_VERIFICABLE';
  END IF;

  -- No tomar locks de tabla sobre las 3 relaciones protegidas por triggers:
  -- un escritor puede tener RowExclusiveLock antes de esperar el advisory209.
  -- La exclusión209 y las reservas durables protegen esas filas del historial.
  LOCK TABLE auth.users, storage.objects,
    public.administraciones_temporales, public.bodegas_inventariados,
    public.del_registro_eliminaciones, public.guia_contenido_auditoria,
    public.inventario_catalogo_auditoria, public.inventario_entradas_formatos,
    public.inventario_movimientos, public.inventario_movimientos_anulaciones,
    public.inventario_productos, public.jardineria_contenido_auditoria,
    public.mantencion_historial, public.mantencion_historial_anulaciones,
    public.mantenciones_operativas, public.mantenciones_operativas_anulaciones,
    public.mantenciones_reactivas, public.prevencion_documentos,
    public.prevencion_gantt_contenido_auditoria, public.solicitudes_notificaciones_revision,
    public.solicitudes_reactivas_eliminaciones_auditoria, public.solicitudes_reactivas_eventos,
    public.trabajadores_documentos, public.usuarios_gestion_auditoria,
    public.mantenciones, public.tareas, public.alertas, public.solicitudes_reactivas_avisos_estado,
    public.usuarios_correos_verificados, public.usuarios_sesion_cambios
  IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id=v_op.objetivo_id)
     OR EXISTS (SELECT 1 FROM public.usuarios WHERE id=v_op.objetivo_id) THEN
    RAISE EXCEPTION 'AUTH_O_PERFIL_TODAVIA_EXISTE';
  END IF;

  v_expected_audit := v_op.dependencias_resumen || pg_catalog.jsonb_build_object(
    'procedimiento','USUARIO_ELIMINACION_FINALIZAR_V1','operacion_id',v_op.id,
    'cuenta_auth_restante',false,'perfil_restante',false);
  IF v_op.estado='COMPLETADA' THEN
    -- Una solicitud puede gestionarse legítimamente después de completar la eliminación.
    -- La repetición NO vuelve a congelarla ni exige que siga con su estado anterior;
    -- valida la certificación/evidencia que quedó en la auditoría inmutable.
    SELECT * INTO STRICT v_audit FROM public.del_registro_eliminaciones WHERE id=v_op.auditoria_id;
    IF (SELECT count(*) FROM public.del_registro_eliminaciones d
          WHERE d.modulo='Administración de Usuarios' AND d.entidad_tipo='usuario'
            AND d.entidad_id=v_op.objetivo_id AND d.accion='ELIMINACION_PERMANENTE')<>1
       OR v_audit.modulo IS DISTINCT FROM 'Administración de Usuarios'
       OR v_audit.entidad_tipo IS DISTINCT FROM 'usuario'
       OR v_audit.accion IS DISTINCT FROM 'ELIMINACION_PERMANENTE'
       OR v_audit.entidad_id IS DISTINCT FROM v_op.objetivo_id
       OR v_audit.ejecutado_por IS DISTINCT FROM v_op.actor_id
       OR v_audit.entidad_referencia IS DISTINCT FROM v_op.objetivo_nombre_snapshot
       OR v_audit.ejecutado_por_nombre_snapshot IS DISTINCT FROM v_op.actor_nombre_snapshot
       OR v_audit.motivo IS DISTINCT FROM v_op.motivo
       OR v_audit.dependencias_resumen IS DISTINCT FROM v_expected_audit
       OR v_op.dependencias_resumen->'auth_eliminacion_verificada' IS DISTINCT FROM 'true'::jsonb THEN
      RAISE EXCEPTION 'AUDITORIA_FINAL_INCONSISTENTE';
    END IF;
    RETURN pg_catalog.jsonb_build_object('resultado','YA_COMPLETADA','operacion_id',v_op.id,
      'auditoria_id',v_op.auditoria_id,'puede_eliminar',false,'eliminacion_habilitada',false);
  END IF;
  IF v_op.auditoria_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.del_registro_eliminaciones d
          WHERE d.modulo='Administración de Usuarios' AND d.entidad_tipo='usuario' AND d.entidad_id=v_op.objetivo_id)
     OR v_op.dependencias_resumen ? 'paso233_recuperacion' THEN
    RAISE EXCEPTION 'AUDITORIA_O_RECUPERACION_PREVIA_INCONSISTENTE';
  END IF;

  -- Acreditar los seis triggers sobre sus relaciones, eventos y funciones reales.
  IF (SELECT count(*) FROM (VALUES
      ('usuario_eliminacion_piloto_entrada_usuarios_v1','public.usuarios'::regclass,'public.usuario_eliminacion_piloto_entrada_v1()'::regprocedure,26),
      ('usuario_eliminacion_piloto_entrada_solicitudes_v1','public.solicitudes_reactivas'::regclass,'public.usuario_eliminacion_piloto_entrada_v1()'::regprocedure,30),
      ('usuario_eliminacion_piloto_entrada_avisos_v1','public.solicitudes_reactivas_avisos'::regclass,'public.usuario_eliminacion_piloto_entrada_v1()'::regprocedure,30),
      ('usuario_eliminacion_piloto_usuarios_v1','public.usuarios'::regclass,'public.usuario_eliminacion_piloto_guard_v1()'::regprocedure,27),
      ('usuario_eliminacion_piloto_solicitudes_v1','public.solicitudes_reactivas'::regclass,'public.usuario_eliminacion_piloto_guard_v1()'::regprocedure,31),
      ('usuario_eliminacion_piloto_avisos_v1','public.solicitudes_reactivas_avisos'::regclass,'public.usuario_eliminacion_piloto_guard_v1()'::regprocedure,31)
    ) AS e(nombre,relacion,funcion,eventos) JOIN pg_catalog.pg_trigger t
      ON t.tgname=e.nombre AND t.tgrelid=e.relacion AND t.tgfoid=e.funcion
      AND t.tgtype=e.eventos AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal AND t.tgqual IS NULL)<>6 THEN
    RAISE EXCEPTION 'GUARDAS_HISTORICAS_NO_ACREDITADAS';
  END IF;

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',s.id,'estado',s.estado,'sha256',pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.to_jsonb(s)::text,'UTF8')),'hex'))
    ORDER BY s.id),'[]'::jsonb) INTO v_s
    FROM public.solicitudes_reactivas s WHERE s.creada_por=v_op.objetivo_id;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'solicitud_id',a.solicitud_id,'sha256',pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.to_jsonb(a)::text,'UTF8')),'hex'))
    ORDER BY a.solicitud_id,pg_catalog.to_jsonb(a)::text),'[]'::jsonb) INTO v_a
    FROM public.solicitudes_reactivas_avisos a JOIN public.solicitudes_reactivas s ON s.id=a.solicitud_id
    WHERE s.creada_por=v_op.objetivo_id;
  IF v_s IS DISTINCT FROM v_e->'huellas_solicitudes' OR v_a IS DISTINCT FROM v_e->'huellas_avisos' THEN
    RAISE EXCEPTION 'HISTORIAL_CERTIFICADO_CAMBIO';
  END IF;

  -- Las mismas 25 expresiones del evaluador REAL exportado en PASO190.
  -- No se llama al evaluador tras borrar el perfil: devolvería PERFIL_NO_EXISTE.
  v_otros := jsonb_build_object( 'delegaciones', EXISTS ( SELECT 1 FROM public.administraciones_temporales t WHERE t.usuario_id = v_op.objetivo_id OR t.otorgado_por = v_op.objetivo_id OR t.revocado_por = v_op.objetivo_id ),
    'bodegas_inventariados', EXISTS ( SELECT 1 FROM public.bodegas_inventariados t WHERE t.registrado_por = v_op.objetivo_id ),
    'auditoria_eliminaciones_actor', EXISTS ( SELECT 1 FROM public.del_registro_eliminaciones t WHERE t.ejecutado_por = v_op.objetivo_id ),
    'auditoria_eliminaciones_objetivo', EXISTS ( SELECT 1 FROM public.del_registro_eliminaciones t WHERE t.entidad_id = v_op.objetivo_id AND t.modulo = 'Administración de Usuarios' AND t.entidad_tipo = 'usuario' ),
    'guia_contenido_auditoria', EXISTS ( SELECT 1 FROM public.guia_contenido_auditoria t WHERE t.autor_id = v_op.objetivo_id ),
    'inventario_catalogo_auditoria', EXISTS ( SELECT 1 FROM public.inventario_catalogo_auditoria t WHERE t.registrado_por_id = v_op.objetivo_id ),
    'inventario_entradas_formatos', EXISTS ( SELECT 1 FROM public.inventario_entradas_formatos t WHERE t.actor_id = v_op.objetivo_id ),
    'inventario_movimientos', EXISTS ( SELECT 1 FROM public.inventario_movimientos t WHERE t.registrado_por_id = v_op.objetivo_id ),
    'inventario_movimientos_anulaciones', EXISTS ( SELECT 1 FROM public.inventario_movimientos_anulaciones t WHERE t.registrado_por_id = v_op.objetivo_id ),
    'inventario_productos', EXISTS ( SELECT 1 FROM public.inventario_productos t WHERE t.creado_por = v_op.objetivo_id ),
    'jardineria_contenido_auditoria', EXISTS ( SELECT 1 FROM public.jardineria_contenido_auditoria t WHERE t.autor_id = v_op.objetivo_id ),
    'mantencion_historial', EXISTS ( SELECT 1 FROM public.mantencion_historial t WHERE t.revisado_por = v_op.objetivo_id ),
    'mantencion_historial_anulaciones', EXISTS ( SELECT 1 FROM public.mantencion_historial_anulaciones t WHERE t.anulado_por = v_op.objetivo_id ),
    'mantenciones_operativas', EXISTS ( SELECT 1 FROM public.mantenciones_operativas t WHERE t.registrado_por = v_op.objetivo_id ),
    'mantenciones_operativas_anulaciones', EXISTS ( SELECT 1 FROM public.mantenciones_operativas_anulaciones t WHERE t.anulado_por = v_op.objetivo_id ),
    'mantenciones_reactivas', EXISTS ( SELECT 1 FROM public.mantenciones_reactivas t WHERE t.creada_por = v_op.objetivo_id ),
    'prevencion_documentos', EXISTS ( SELECT 1 FROM public.prevencion_documentos t WHERE t.creado_por = v_op.objetivo_id ),
    'prevencion_gantt_contenido_auditoria', EXISTS ( SELECT 1 FROM public.prevencion_gantt_contenido_auditoria t WHERE t.autor_id = v_op.objetivo_id ),
    'solicitudes_notificaciones_revision', EXISTS ( SELECT 1 FROM public.solicitudes_notificaciones_revision t WHERE t.destinatario_id = v_op.objetivo_id ),
    'solicitudes_reactivas_otras_acciones', EXISTS ( SELECT 1 FROM public.solicitudes_reactivas t WHERE t.revisada_por = v_op.objetivo_id OR t.anulada_por = v_op.objetivo_id ),
    'solicitudes_eliminaciones_auditoria', EXISTS ( SELECT 1 FROM public.solicitudes_reactivas_eliminaciones_auditoria t WHERE t.eliminado_por = v_op.objetivo_id ),
    'solicitudes_reactivas_eventos', EXISTS ( SELECT 1 FROM public.solicitudes_reactivas_eventos t WHERE t.actor_id = v_op.objetivo_id ),
    'trabajadores_documentos', EXISTS ( SELECT 1 FROM public.trabajadores_documentos t WHERE t.creado_por = v_op.objetivo_id ),
    'usuarios_gestion_auditoria', EXISTS ( SELECT 1 FROM public.usuarios_gestion_auditoria t WHERE t.actor_id = v_op.objetivo_id OR t.objetivo_id = v_op.objetivo_id ),
    'operaciones_eliminacion_como_actor', EXISTS ( SELECT 1 FROM public.usuarios_eliminaciones_operaciones t WHERE t.actor_id = v_op.objetivo_id ) );
  IF v_eval->'detalle_otras_referencias' IS DISTINCT FROM v_otros
     OR (SELECT count(*) FROM pg_catalog.jsonb_each(v_otros))<>25
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(v_otros) x WHERE x.value IS DISTINCT FROM 'false'::jsonb)
     OR EXISTS (SELECT 1 FROM storage.objects s WHERE s.owner_id=v_op.objetivo_id::text OR s.owner=v_op.objetivo_id)
     OR EXISTS (SELECT 1 FROM public.mantenciones WHERE responsable_id=v_op.objetivo_id)
     OR EXISTS (SELECT 1 FROM public.tareas WHERE responsable_id=v_op.objetivo_id)
     OR EXISTS (SELECT 1 FROM public.alertas WHERE usuario_id=v_op.objetivo_id)
     OR EXISTS (SELECT 1 FROM public.solicitudes_reactivas_avisos_estado WHERE usuario_id=v_op.objetivo_id)
     OR EXISTS (SELECT 1 FROM public.usuarios_correos_verificados WHERE usuario_id=v_op.objetivo_id)
     OR EXISTS (SELECT 1 FROM public.usuarios_sesion_cambios WHERE usuario_id=v_op.objetivo_id) THEN
    RAISE EXCEPTION 'REFERENCIAS_NO_CUBIERTAS_O_INCONSISTENTES';
  END IF;

  -- Conservar los errores/estado anteriores ANTES de que las v1 los limpien.
  -- Solo metadata nueva en la MISMA operación; no se toca el motivo ni snapshots originales.
  v_preservado := pg_catalog.jsonb_build_object(
    'version',1,'operacion_id',v_op.id,'actor_original_id',v_op.actor_id,'objetivo_id',v_op.objetivo_id,
    'estado_previo',v_op.estado,'ultimo_error_codigo_previo',v_op.ultimo_error_codigo,
    'updated_at_previo',v_op.updated_at,'intentos_auth_previo',v_op.intentos_auth,
    'auth_eliminacion_verificada_previa',v_op.dependencias_resumen->'auth_eliminacion_verificada',
    'motivo_recuperacion',v_motivo,'ejecutor_sql',session_user,'recuperado_en',pg_catalog.clock_timestamp(),
    'auth_ausente',true,'perfil_ausente',true,'huellas_solicitudes_verificadas',true,
    'huellas_avisos_verificadas',true,'referencias_restantes',v_otros);
  UPDATE public.usuarios_eliminaciones_operaciones
    SET dependencias_resumen=dependencias_resumen || pg_catalog.jsonb_build_object('paso233_recuperacion',v_preservado),
        updated_at=pg_catalog.clock_timestamp()
    WHERE id=v_op.id;
  -- Transición técnica SOLO dentro de esta función protegida, tras verificar todo.
  IF v_op.estado='REQUIERE_REVISION' THEN
    UPDATE public.usuarios_eliminaciones_operaciones SET estado='AUTH_EN_CURSO',updated_at=pg_catalog.clock_timestamp()
      WHERE id=v_op.id AND estado='REQUIERE_REVISION';
    IF NOT FOUND THEN RAISE EXCEPTION 'OPERACION_CAMBIO'; END IF;
  END IF;
  SELECT public.usuario_eliminacion_registrar_resultado_auth_v1(v_op.id,'CONFIRMADA',NULL) INTO v_result;
  IF pg_catalog.jsonb_typeof(v_result) IS DISTINCT FROM 'object'
     OR v_result->>'operacion_id' IS DISTINCT FROM v_op.id::text
     OR v_result->>'estado' IS DISTINCT FROM 'AUTH_ELIMINADA'
     OR coalesce(v_result->>'resultado','') NOT IN ('AUTH_ELIMINADA','YA_CONFIRMADA') THEN
    RAISE EXCEPTION 'CONFIRMACION_SQL_NO_VERIFICABLE';
  END IF;
  SELECT public.usuario_eliminacion_finalizar_v1(v_op.id) INTO v_result;
  IF pg_catalog.jsonb_typeof(v_result) IS DISTINCT FROM 'object'
     OR v_result->>'resultado' IS DISTINCT FROM 'COMPLETADA'
     OR v_result->>'operacion_id' IS DISTINCT FROM v_op.id::text THEN
    RAISE EXCEPTION 'FINALIZACION_SQL_NO_VERIFICABLE';
  END IF;
  -- Verificar la auditoría y la operación que realmente quedaron, no solo el retorno.
  SELECT * INTO STRICT v_op FROM public.usuarios_eliminaciones_operaciones WHERE id=p_operacion_id;
  SELECT * INTO STRICT v_audit FROM public.del_registro_eliminaciones WHERE id=v_op.auditoria_id;
  v_expected_audit := v_op.dependencias_resumen || pg_catalog.jsonb_build_object(
    'procedimiento','USUARIO_ELIMINACION_FINALIZAR_V1','operacion_id',v_op.id,
    'cuenta_auth_restante',false,'perfil_restante',false);
  IF v_op.estado IS DISTINCT FROM 'COMPLETADA' OR v_result->>'auditoria_id' IS DISTINCT FROM v_audit.id::text
     OR v_op.dependencias_resumen->'paso233_recuperacion' IS DISTINCT FROM v_preservado
     OR v_audit.modulo IS DISTINCT FROM 'Administración de Usuarios'
     OR v_audit.entidad_tipo IS DISTINCT FROM 'usuario' OR v_audit.accion IS DISTINCT FROM 'ELIMINACION_PERMANENTE'
     OR v_audit.entidad_id IS DISTINCT FROM v_op.objetivo_id OR v_audit.ejecutado_por IS DISTINCT FROM v_op.actor_id
     OR v_audit.entidad_referencia IS DISTINCT FROM v_op.objetivo_nombre_snapshot
     OR v_audit.ejecutado_por_nombre_snapshot IS DISTINCT FROM v_op.actor_nombre_snapshot
     OR v_audit.motivo IS DISTINCT FROM v_op.motivo OR v_audit.dependencias_resumen IS DISTINCT FROM v_expected_audit
     OR (SELECT count(*) FROM public.del_registro_eliminaciones d WHERE d.modulo='Administración de Usuarios'
          AND d.entidad_tipo='usuario' AND d.entidad_id=v_op.objetivo_id AND d.accion='ELIMINACION_PERMANENTE')<>1 THEN
    RAISE EXCEPTION 'AUDITORIA_FINAL_NO_VERIFICABLE';
  END IF;
  RETURN pg_catalog.jsonb_build_object('resultado','COMPLETADA','operacion_id',v_op.id,
    'auditoria_id',v_op.auditoria_id,'puede_eliminar',false,'eliminacion_habilitada',false);
  -- Sin EXCEPTION que oculte fallos: cualquier error revierte TODA la llamada,
  -- incluidas transiciones técnicas, metadata y auditoría. No efectos externos.
END;
$recuperar$;

ALTER FUNCTION public.usuario_eliminacion_recuperar_general_v1(uuid,uuid,uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.usuario_eliminacion_recuperar_general_v1(uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;

ROLLBACK;
