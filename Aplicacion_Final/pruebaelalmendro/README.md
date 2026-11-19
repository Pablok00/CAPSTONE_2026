# Hotel & Centro de Eventos El Almendro

SPA estática con Supabase como fuente de verdad. Leer [AGENTS](AGENTS.md), [Estado](docs/ESTADO_PROYECTO.md), [Bitácora](docs/BITACORA_CAMBIOS.md) y [Handoff](docs/HANDOFF_TECNICO.md).

Raíz: index.html, login.html, registrar.html, recuperar-password.html, js/ y css/ operativos; publicacion/ espejo de pruebas/entrega. Servir por HTTP(S), abrir login.html. Sin build JS ni package.json; Tailwind compilado y herramientas en tools/. Conservar ambos árboles, sin normalizar finales de línea innecesariamente.

Estado 16-11-2026 / PASO 375K.29: eliminación integral de cuentas V2 y gestión documental aprobadas en producción por el usuario, sin restricción de piloto UUID. Conserva identidad histórica, ficha laboral, documentos, trabajos y auditorías; no concede acceso a identidades eliminadas. Modales 375K.27 aprobados localmente (20/20 pruebas y 12/12 verificaciones visuales informadas); publicación pendiente. Ver encabezados vigentes de Estado/Handoff, no instrucciones históricas de activación. No ejecutar borrados como pruebas por defecto.

Repositorio Pablok00/pruebaelalmendro, main. Vercel sirve raíz (Root Directory ./ informado); .vercelignore excluye espejo/backend/pruebas/docs. Este cierre no verifica SHA remoto ni cambia configuración. Acumular mejoras locales para UN commit/push cuando se apruebe el bloque completo; push puede desplegar y requiere autorización.

Secretos solo servidor; autorización RLS/RPC/Edge. No hay respaldo completo BD/Storage ni fuente de todas las políticas. SQL conservado como referencia, no migraciones automáticamente ejecutables. Pruebas y limitaciones en BITACORA; no instalar dependencias a ciegas.
