-- Ejecutar MANUALMENTE solo para recuperar definiciones faltantes. NO ejecutado por el agente.
-- Una única consulta SELECT: sin DDL/DML, datos de usuarios, secretos o invocación de RPC.
-- No busca todo el catálogo: seis nombres y tres relaciones de coordinación/autorización.
WITH RECURSIVE
esperadas(nombre) AS (VALUES
  ('usuario_eliminacion_preparar_v1'),
  ('usuario_eliminacion_registrar_resultado_auth_v1'),
  ('usuario_eliminacion_finalizar_v1'),
  ('usuario_eliminacion_evaluar_recepcion_v1'),
  ('es_administrador_permanente_actual'),
  ('mi_estado_administrativo')
),
relaciones AS (
  SELECT c.oid, n.nspname AS esquema, c.relname AS nombre, c.relowner,
    c.relrowsecurity, c.relforcerowsecurity, c.relacl
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN
    ('usuarios_eliminaciones_operaciones', 'del_registro_eliminaciones', 'usuarios')
),
semillas AS (
  SELECT p.oid FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN esperadas e ON e.nombre = p.proname
  WHERE n.nspname = 'public' AND p.prokind = 'f'
  UNION
  SELECT t.tgfoid FROM pg_catalog.pg_trigger t
  JOIN relaciones r ON r.oid = t.tgrelid WHERE NOT t.tgisinternal
  UNION
  SELECT d.refobjid FROM pg_catalog.pg_policy pol
  JOIN relaciones r ON r.oid = pol.polrelid
  JOIN pg_catalog.pg_depend d ON d.classid = 'pg_catalog.pg_policy'::regclass
    AND d.objid = pol.oid AND d.refclassid = 'pg_catalog.pg_proc'::regclass
),
funciones(oid) AS (
  SELECT oid FROM semillas
  UNION
  SELECT d.refobjid FROM funciones f
  JOIN pg_catalog.pg_depend d ON d.classid = 'pg_catalog.pg_proc'::regclass
    AND d.objid = f.oid AND d.refclassid = 'pg_catalog.pg_proc'::regclass
  JOIN pg_catalog.pg_proc p ON p.oid = d.refobjid
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
)
SELECT jsonb_build_object(
  'relaciones_no_encontradas', COALESCE((SELECT jsonb_agg(e.nombre ORDER BY e.nombre)
    FROM (VALUES ('usuarios_eliminaciones_operaciones'), ('del_registro_eliminaciones'), ('usuarios')) AS e(nombre)
    WHERE NOT EXISTS (SELECT 1 FROM relaciones r WHERE r.nombre = e.nombre)), '[]'::jsonb),
  'funciones_no_encontradas', COALESCE((SELECT jsonb_agg(e.nombre ORDER BY e.nombre)
    FROM esperadas e WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = e.nombre AND p.prokind = 'f')), '[]'::jsonb),
  'funciones', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'esquema', n.nspname, 'nombre', p.proname,
      'argumentos', pg_catalog.pg_get_function_arguments(p.oid),
      'identidad_argumentos', pg_catalog.pg_get_function_identity_arguments(p.oid),
      'retorno', pg_catalog.pg_get_function_result(p.oid),
      'propietario', pg_catalog.pg_get_userbyid(p.proowner),
      'security_definer', p.prosecdef, 'configuracion', p.proconfig,
      'acl', p.proacl::text, 'definicion', pg_catalog.pg_get_functiondef(p.oid)
    ) ORDER BY n.nspname, p.proname, p.oid)
    FROM funciones f JOIN pg_catalog.pg_proc p ON p.oid = f.oid
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace), '[]'::jsonb),
  'relaciones', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'esquema', r.esquema, 'nombre', r.nombre,
      'propietario', pg_catalog.pg_get_userbyid(r.relowner),
      'rls', r.relrowsecurity, 'rls_forzada', r.relforcerowsecurity, 'acl', r.relacl::text,
      'columnas', (SELECT jsonb_agg(jsonb_build_object(
        'nombre', a.attname, 'tipo', pg_catalog.format_type(a.atttypid, a.atttypmod),
        'not_null', a.attnotnull, 'default', pg_catalog.pg_get_expr(ad.adbin, ad.adrelid)
        ) ORDER BY a.attnum)
        FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef ad
          ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        WHERE a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped),
      'restricciones', (SELECT jsonb_agg(jsonb_build_object(
        'nombre', c.conname, 'definicion', pg_catalog.pg_get_constraintdef(c.oid)) ORDER BY c.conname)
        FROM pg_catalog.pg_constraint c WHERE c.conrelid = r.oid),
      'indices', (SELECT jsonb_agg(pg_catalog.pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid)
        FROM pg_catalog.pg_index i WHERE i.indrelid = r.oid),
      'triggers', (SELECT jsonb_agg(pg_catalog.pg_get_triggerdef(t.oid) ORDER BY t.tgname)
        FROM pg_catalog.pg_trigger t WHERE t.tgrelid = r.oid AND NOT t.tgisinternal),
      'politicas', (SELECT jsonb_agg(jsonb_build_object(
        'nombre', pol.polname, 'comando', pol.polcmd, 'permisiva', pol.polpermissive,
        'roles', (SELECT jsonb_agg(CASE WHEN role_oid = 0 THEN 'PUBLIC'
          ELSE pg_catalog.pg_get_userbyid(role_oid)::text END)
          FROM unnest(pol.polroles) AS x(role_oid)),
        'using', pg_catalog.pg_get_expr(pol.polqual, pol.polrelid),
        'with_check', pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid)) ORDER BY pol.polname)
        FROM pg_catalog.pg_policy pol WHERE pol.polrelid = r.oid)
    ) ORDER BY r.nombre) FROM relaciones r), '[]'::jsonb),
  'limite', 'Solo definiciones; pg_depend puede omitir llamadas PLpgSQL o SQL dinamico. No certifica RLS global, preservacion ni ejecucion.'
) AS contratos_paso189;
