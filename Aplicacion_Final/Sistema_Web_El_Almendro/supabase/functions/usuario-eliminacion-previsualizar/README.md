# Eliminación de usuarios — componentes compartidos

Referencias vigentes: [Handoff](../../../docs/HANDOFF_TECNICO.md), [Estado](../../../docs/ESTADO_PROYECTO.md) y [Bitácora](../../../docs/BITACORA_CAMBIOS.md).

Previsualización: index.ts, handler.mjs y database-safety.mjs, solo lectura. Ejecución: ../usuario-eliminacion-ejecutar/index.ts reutiliza adaptador-sql-instalado.mjs, eliminacion-coordinar.mjs, eliminacion-preparar.mjs y reautenticacion-servidor.mjs. No duplicar sistemas ni unir módulos para despliegue.

Estado vigente 16-11-2026 / PASO 375K.29: eliminación integral V2 y gestión documental aprobadas en producción por el usuario, sin restricciones temporales por UUID. El ejecutor utiliza createIntegralDeletionCoordinator e integral del adaptador; este directorio contiene auxiliares compartidos y lecturas históricas, no otro sistema de borrado. CONSULTAR_OPERACION y CONSULTAR_IDENTIDADES_HISTORICAS no ejecutan Auth Delete. Preparación, certificación individual, verificación física previa/posterior, reautenticación, autorización SQL, recuperación y finalización siguen separadas.

SQL histórico conservado en docs/sql-propuestas: exportación190, fuentes212/215, recuperación233; propuestas reversibles V2/documentales en supabase/sql-propuestas. Son fuentes de regresión/reconstrucción, NO exportaciones exactas de contratos instalados (incluidas correcciones 42725 hechas por usuario). Los helpers de pruebas permanecen en tests/, sin dependencia operativa. Manifiesto192 sigue histórico NO_ACREDITADO; no convertirlo en certificado V2 ni reinstalar pilotos.

Configuración proyecto/TLS/CORS y contratos en encabezado vigente del Handoff. Secretos solo servidor, RLS/alcance de cada módulo, privados de Storage y protección permanente/cuenta propia intactos. Modales 375K.27 aprobados LOCAL (20/20 pruebas, 12/12 visuales informadas), publicación pendiente. Matriz global MFA/concurrencia/JWT no acreditada por pilotos. Acumular mejoras locales para un único commit/push autorizado; no desplegar ni ejecutar pruebas destructivas por este README.
