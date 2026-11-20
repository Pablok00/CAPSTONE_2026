// Inventario estático local, NO certificación RLS. Sin red, SQL ejecutado o lectura de env.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
export function inventariarRutas(root) {
  const routes = [];
  function scan(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (entry.name.endsWith('.js')) {
        const text = readFileSync(path, 'utf8');
        // Incluye alias de cliente y rutas dinámicas para revisión manual; no interpreta código.
        const pattern = /\b(\w+)\s*\.\s*(from|rpc|invoke)\s*\(\s*(?:['"]([\w.-]+)['"]|([^\n)]{1,120}))/g;
        for (const match of text.matchAll(pattern)) {
          if (match[1] === 'Array') continue;
          const prefix = text.slice(Math.max(0, match.index - 40), match.index);
          const kind = match[2] === 'rpc' ? 'rpc' : match[2] === 'invoke' ? 'edge' :
            /storage\s*\.\s*$/.test(prefix) || match[1] === 'storage' || match[3]?.includes('-') ? 'bucket' : 'tabla';
          routes.push({ archivo: relative(root, path).replaceAll('\\', '/'),
            linea: text.slice(0, match.index).split('\n').length, tipo: kind,
            nombre: match[3] || null, dinamica: !match[3], revision_backend: 'PENDIENTE' });
        }
      }
    }
  }
  scan(resolve(root, 'js'));
  let exported = JSON.parse(readFileSync(resolve(root, 'docs/sql-propuestas/captura_historica_contratos_instalados.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (Array.isArray(exported)) exported = exported[0].contratos_paso189;
  if (typeof exported === 'string') exported = JSON.parse(exported);
  const sqlReferences = [...new Set(exported.funciones.flatMap(f => [...f.definicion.matchAll(/\b(?:FROM|JOIN)\s+(public|auth|storage)\.(\w+)/gi)]
    .map(m => m[1] + '.' + m[2])))].sort();
  return { version: 'paso192-inventario-estatico-v1', cobertura_certificada: false, referencias_sql_versionadas: sqlReferences,
    limite: 'Búsqueda léxica: revisar alias, comentarios, SQL dinámico, Realtime, Storage, RPC y otras rutas no representadas.', rutas: routes };
}
function metadataSql(inventory) {
  const safe = values => [...new Set(values)].filter(v => /^[a-z_][a-z0-9_]*$/.test(v)).sort();
  const tables = safe(inventory.rutas.filter(r => r.tipo === 'tabla' && r.nombre).map(r => r.nombre)
    .concat(inventory.referencias_sql_versionadas.filter(name => name.startsWith('public.')).map(name => name.slice(7))));
  const funcs = safe(inventory.rutas.filter(r => r.tipo === 'rpc' && r.nombre).map(r => r.nombre)
    .concat(['es_rol_administrador', 'es_administrador_permanente_actual', 'mi_estado_administrativo']));
  const values = list => list.map(v => `('${v}')`).join(',\n');
  return `-- Paso 192: UNA consulta de metadatos para revisión MANUAL. NO ejecutada.
-- Sin filas de cuentas, claves, SQL DDL/DML ni invocaciones a RPC. No Logs Query.
-- Revisar resultado localmente: los cuerpos existentes podrían contener literales privados.
WITH RECURSIVE nombres_tablas(nombre) AS (VALUES ${values(tables)}),
nombres_funciones(nombre) AS (VALUES ${values(funcs)}),
relaciones AS (
 SELECT c.oid,n.nspname AS esquema,c.relname AS nombre,c.relrowsecurity,c.relforcerowsecurity,c.relacl
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname='public' AND c.relname IN (SELECT nombre FROM nombres_tablas))
    OR (n.nspname='auth' AND c.relname IN ('users','sessions'))
    OR (n.nspname='storage' AND c.relname IN ('objects','buckets'))
), semillas AS (
 SELECT p.oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND p.proname IN (SELECT nombre FROM nombres_funciones)
 UNION SELECT t.tgfoid FROM pg_catalog.pg_trigger t JOIN relaciones r ON r.oid=t.tgrelid WHERE NOT t.tgisinternal
 UNION SELECT d.refobjid FROM pg_catalog.pg_policy p JOIN relaciones r ON r.oid=p.polrelid
 JOIN pg_catalog.pg_depend d ON d.classid='pg_catalog.pg_policy'::regclass AND d.objid=p.oid AND d.refclassid='pg_catalog.pg_proc'::regclass
), funciones(oid) AS (
 SELECT oid FROM semillas UNION SELECT d.refobjid FROM funciones f JOIN pg_catalog.pg_depend d
 ON d.classid='pg_catalog.pg_proc'::regclass AND d.objid=f.oid AND d.refclassid='pg_catalog.pg_proc'::regclass
 JOIN pg_catalog.pg_proc p ON p.oid=d.refobjid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','auth','storage') AND p.prokind='f'
)
SELECT jsonb_build_object(
 'server_version',current_setting('server_version'),
 'sha256_disponible',pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)') IS NOT NULL,
 'relaciones', (SELECT jsonb_agg(jsonb_build_object('esquema',r.esquema,'nombre',r.nombre,
   'rls',r.relrowsecurity,'forzada',r.relforcerowsecurity,'acl',r.relacl::text,
   'columnas',(SELECT jsonb_agg(jsonb_build_object('nombre',a.attname,'tipo',pg_catalog.format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull) ORDER BY a.attnum)
     FROM pg_catalog.pg_attribute a WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),
   'restricciones',(SELECT jsonb_agg(pg_catalog.pg_get_constraintdef(c.oid)) FROM pg_catalog.pg_constraint c WHERE c.conrelid=r.oid),
   'triggers',(SELECT jsonb_agg(pg_catalog.pg_get_triggerdef(t.oid)) FROM pg_catalog.pg_trigger t WHERE t.tgrelid=r.oid AND NOT t.tgisinternal),
   'politicas',(SELECT jsonb_agg(jsonb_build_object('nombre',p.polname,'comando',p.polcmd,'permisiva',p.polpermissive,
     'roles',(SELECT jsonb_agg(CASE WHEN id=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(id)::text END) FROM unnest(p.polroles) x(id)),
     'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),'with_check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)))
     FROM pg_catalog.pg_policy p WHERE p.polrelid=r.oid)) ORDER BY r.esquema,r.nombre) FROM relaciones r),
 'funciones',(SELECT jsonb_agg(jsonb_build_object('esquema',n.nspname,'nombre',p.proname,'acl',p.proacl::text,
   'propietario',pg_catalog.pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,
   'definicion',pg_catalog.pg_get_functiondef(p.oid)) ORDER BY n.nspname,p.proname,p.oid)
   FROM funciones f JOIN pg_catalog.pg_proc p ON p.oid=f.oid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace),
 'fk_entrantes_identidad',(SELECT jsonb_agg(jsonb_build_object('tabla',c.conrelid::regclass::text,'nombre',c.conname,'definicion',pg_catalog.pg_get_constraintdef(c.oid)))
   FROM pg_catalog.pg_constraint c WHERE c.contype='f' AND c.confrelid IN ('auth.users'::regclass,'public.usuarios'::regclass)),
 'limite','Metadatos de rutas literales detectadas, no prueba de ejecución ni cobertura de referencias sin FK/dinámicas. No certifica conservación.'
) AS metadatos_paso192;
`;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('No se admiten parámetros');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const inventory = inventariarRutas(root);
  writeFileSync(resolve(root, 'docs/inventario_estatico_rutas_protegidas.json'), JSON.stringify(inventory, null, 2) + '\n');
  writeFileSync(resolve(root, 'docs/sql-propuestas/inspeccionar_metadatos_rutas_solo_lectura.sql'), metadataSql(inventory));
  console.log('Inventario estático y consulta de metadatos preparados localmente. Ninguna conexión.');
}
