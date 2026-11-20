# Sistema web de Obras, Mantención y Mejoras

**Hotel & Centro de Eventos El Almendro — Equipo BPB**

Código fuente de la aplicación web desarrollada para centralizar el registro y seguimiento de mantenciones, solicitudes, tareas, inventario, obras y mejoras del hotel.

## Tecnologías

- **HTML, CSS y JavaScript:** interfaz y funcionalidades.
- **Supabase y PostgreSQL:** autenticación, persistencia de datos y operaciones autorizadas.
- **Vercel:** alojamiento web.

## Archivos principales

| Ruta | Propósito |
|---|---|
| `index.html` | Página principal de la plataforma |
| `login.html` | Inicio de sesión |
| `registrar.html` | Registro de usuarios |
| `recuperar-password.html` | Recuperación de contraseña |
| `js/` | Módulos, vistas, servicios y configuración del cliente |
| `css/` | Estilos de la aplicación |
| `publicacion/` | Copia de archivos utilizada durante desarrollo y revisiones |
| `docs/` | Documentación técnica y seguimiento de cambios |

## Ejecución local

1. Abra esta carpeta en Visual Studio Code.
2. Inicie un servidor HTTP local, por ejemplo mediante Live Server.
3. Acceda a `login.html` desde el navegador.

La aplicación utiliza servicios alojados de Supabase. **La ejecución local de la interfaz no crea un backend aislado**; cualquier prueba que modifique datos debe utilizar un entorno y cuentas autorizados.

## Documentación

- [Manual de usuario por rol](../../Documentacion_Por_Fases/Fase_3_Implementacion_y_Cierre/03_Manuales_y_Despliegue/01_Manual_Usuario_por_Rol.docx)
- [Guía de implementación y despliegue](../../Documentacion_Por_Fases/Fase_3_Implementacion_y_Cierre/03_Manuales_y_Despliegue/02_Guia_Implementacion_y_Despliegue.docx)
- [Plan de pruebas y validación](../../Documentacion_Por_Fases/Fase_3_Implementacion_y_Cierre/02_Pruebas_y_Validacion/03_Plan_de_Pruebas_y_Validacion.docx)
- [Estado técnico del proyecto](docs/ESTADO_PROYECTO.md)
- [Bitácora técnica](docs/BITACORA_CAMBIOS.md)

El código aquí incorporado corresponde a la copia académica de la aplicación. Para reproducir un despliegue se deben verificar la configuración vigente de Vercel, la conexión a Supabase y las pruebas correspondientes.
