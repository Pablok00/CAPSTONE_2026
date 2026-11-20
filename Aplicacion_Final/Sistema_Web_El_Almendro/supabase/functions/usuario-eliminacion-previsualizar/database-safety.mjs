// Solo configuración y lecturas de catálogo. No leer env ni abrir conexiones al importar.
export const PROJECT_REF = 'hgveesryfmcjxpeumzbp';
export const REQUIRED_TABLES = Object.freeze([
  'public.roles', 'public.usuarios', 'auth.users', 'public.mantenciones',
  'public.tareas', 'public.prevencion_documentos', 'public.trabajadores_documentos', 'storage.objects',
  'public.solicitudes_reactivas', 'public.solicitudes_reactivas_avisos',
]);
const fail = () => { throw new Error('VISIBILIDAD_O_CONFIGURACION_NO_ACREDITADA'); };

// Preferencia explícita conservada; si no existe, usar el secreto predeterminado de plataforma.
// No corregir silenciosamente un override vacío/inválido: validateDatabaseUrl debe rechazarlo.
export function databaseUrlFromEnvironment(read) {
  const override = read('PREVIEW_DATABASE_URL');
  return override === undefined
    ? { url: read('SUPABASE_DB_URL'), source: 'SUPABASE_DB_URL' }
    : { url: override, source: 'PREVIEW_DATABASE_URL' };
}

// Diagnóstico temporal: marca privada, nunca propiedades o mensajes de errores del driver.
const erroresConfiguracion = new WeakMap();
function falloConfiguracion(codigo) {
  const error = new Error('VISIBILIDAD_O_CONFIGURACION_NO_ACREDITADA');
  erroresConfiguracion.set(error, codigo);
  throw error;
}
export function detalleConfiguracion(error) { return erroresConfiguracion.get(error); }

export function validateDatabaseUrl(raw, source = 'PREVIEW_DATABASE_URL') {
  if (raw === undefined || raw === null || raw === '') return falloConfiguracion('URL_AUSENTE');
  if (typeof raw !== 'string' || /[\u0000-\u0020\u007f]/.test(raw)) return falloConfiguracion('FORMATO_URL_INVALIDO');
  let url;
  try { url = new URL(raw); } catch { return falloConfiguracion('FORMATO_URL_INVALIDO'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) return falloConfiguracion('FORMATO_URL_INVALIDO');
  const direct = url.hostname === `db.${PROJECT_REF}.supabase.co`;
  const shared = /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname);
  if (!direct && !shared) return falloConfiguracion('HOST_NO_ADMITIDO');
  const port = Number(url.port || '5432');
  if (port !== 5432) return falloConfiguracion('PUERTO_NO_ADMITIDO');
  let username, password, pathname;
  try { username = decodeURIComponent(url.username); } catch { return falloConfiguracion('USUARIO_NO_ADMITIDO'); }
  if (username !== (direct ? 'postgres' : `postgres.${PROJECT_REF}`)) return falloConfiguracion('USUARIO_NO_ADMITIDO');
  try { pathname = decodeURIComponent(url.pathname); } catch { return falloConfiguracion('BASE_DATOS_NO_ADMITIDA'); }
  if (pathname !== '/postgres') return falloConfiguracion('BASE_DATOS_NO_ADMITIDA');
  const options = [...url.searchParams];
  // Solo el valor automático tolera parámetros: se descartan TODOS, incluidos sslmode/host/options.
  // Nunca usar la URL original ni searchParams al construir el controlador.
  if (source !== 'SUPABASE_DB_URL' && (options.length > 1 || options.some(([k, v]) => k !== 'sslmode' || !['require', 'verify-full'].includes(v)))) return falloConfiguracion('PARAMETROS_NO_ADMITIDOS');
  try { password = decodeURIComponent(url.password); } catch { return falloConfiguracion('CREDENCIALES_NO_VERIFICABLES'); }
  if (!password) return falloConfiguracion('CREDENCIALES_NO_VERIFICABLES');
  // No verifica la contraseña contra PostgreSQL; solo su presencia y codificación.
  return { host: url.hostname, port, database: 'postgres', username, password };
}

export function createDatabaseProvider({ postgres, databaseUrl }) {
  let client;
  return () => {
    if (!client) {
      const selection = databaseUrl();
      // Las llamadas antiguas con string conservan política estricta.
      const config = selection && typeof selection === 'object'
        ? validateDatabaseUrl(selection.url, selection.source)
        : validateDatabaseUrl(selection);
      try {
        client = postgres({
          ...config, ssl: { rejectUnauthorized: true }, max: 1, prepare: false,
          max_pipeline: 100,
          connect_timeout: 10, idle_timeout: 5, max_lifetime: 60,
          debug: false, onnotice: () => {},
        });
      } catch { client = undefined; return falloConfiguracion('INICIALIZACION_CLIENTE_FALLIDA'); }
    }
    return client;
  };
}

export async function assertCompleteVisibility(tx) {
  // SET LOCAL no modifica datos ni políticas; se limita a esta transacción de lectura.
  // Evita depender de parámetros de inicio de sesión que un pooler pueda no conservar.
  await tx`SET LOCAL statement_timeout = '10s'`;
  await tx`SET LOCAL lock_timeout = '3s'`;
  // No desactiva RLS: si fuera a filtrar una consulta, PostgreSQL debe fallar en vez de ocultar filas.
  await tx`SET LOCAL row_security = off`;
  const rows = await tx`
    WITH required(schema_name, table_name) AS (VALUES
      ('public','roles'), ('public','usuarios'), ('auth','users'), ('public','mantenciones'),
      ('public','tareas'), ('public','prevencion_documentos'), ('public','trabajadores_documentos'), ('storage','objects'),
      ('public','solicitudes_reactivas'), ('public','solicitudes_reactivas_avisos')
    )
    SELECT required.schema_name || '.' || required.table_name AS table_name,
      current_user::text AS effective_role, session_user::text AS login_role,
      current_database() AS database_name,
      current_setting('transaction_read_only') AS read_only,
      current_setting('transaction_isolation') AS isolation,
      current_setting('row_security') AS row_security,
      db_role.rolbypassrls AS bypass_rls,
      c.relkind::text AS relation_kind,
      pg_catalog.has_schema_privilege(current_user, ns.oid, 'USAGE') AS schema_usage,
      pg_catalog.has_table_privilege(current_user, c.oid, 'SELECT') AS can_select,
      CASE WHEN c.oid IS NOT NULL THEN pg_catalog.row_security_active(c.oid) ELSE NULL END AS rls_active
    FROM required
    LEFT JOIN pg_catalog.pg_namespace ns ON ns.nspname = required.schema_name
    LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = ns.oid AND c.relname = required.table_name
    LEFT JOIN pg_catalog.pg_roles db_role ON db_role.rolname = current_user`;
  if (!Array.isArray(rows) || rows.length !== REQUIRED_TABLES.length) return fail();
  const seen = new Set();
  for (const row of rows) {
    if (!REQUIRED_TABLES.includes(row.table_name) || seen.has(row.table_name) ||
        row.effective_role !== 'postgres' || row.login_role !== 'postgres' || row.database_name !== 'postgres' ||
        row.read_only !== 'on' || row.isolation !== 'repeatable read' || row.row_security !== 'off' ||
        row.bypass_rls !== true || !['r', 'p'].includes(row.relation_kind) ||
        row.schema_usage !== true || row.can_select !== true || row.rls_active !== false) return fail();
    seen.add(row.table_name);
  }
}
