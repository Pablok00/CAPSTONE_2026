# Aplicación web — Hotel & Centro de Eventos El Almendro

## Sistema de Obras, Mantención y Mejoras

Esta carpeta reúne el **código fuente de la aplicación web** desarrollada por el equipo BPB para el Hotel & Centro de Eventos El Almendro.

**[Explorar el código de la aplicación](Sistema_Web_El_Almendro/)**

## Propósito

La plataforma permite organizar y consultar información relacionada con mantenciones generales y reactivas, obras, mejoras, solicitudes, inventario, trabajadores, tareas y planificación. Las funciones disponibles dependen del perfil de cada usuario.

## Tecnologías utilizadas

| Tecnología | Uso |
|---|---|
| HTML, CSS y JavaScript | Interfaz y funcionalidades de la plataforma |
| Supabase y PostgreSQL | Autenticación, almacenamiento de información y operaciones de datos |
| Vercel | Alojamiento de la aplicación web |
| GitHub | Control de versiones y documentación del proyecto |

## Estructura principal

| Ruta | Contenido |
|---|---|
| [`Sistema_Web_El_Almendro/index.html`](Sistema_Web_El_Almendro/index.html) | Página principal |
| [`Sistema_Web_El_Almendro/login.html`](Sistema_Web_El_Almendro/login.html) | Inicio de sesión |
| [`Sistema_Web_El_Almendro/js/`](Sistema_Web_El_Almendro/js/) | Lógica, servicios y módulos |
| [`Sistema_Web_El_Almendro/css/`](Sistema_Web_El_Almendro/css/) | Estilos |
| [`Sistema_Web_El_Almendro/docs/`](Sistema_Web_El_Almendro/docs/) | Documentación técnica del código |

## Documentos de apoyo

- [Manual de usuario por rol](../Documentacion_Por_Fases/Fase_3_Implementacion_y_Cierre/03_Manuales_y_Despliegue/01_Manual_Usuario_por_Rol.docx)
- [Guía de implementación y despliegue](../Documentacion_Por_Fases/Fase_3_Implementacion_y_Cierre/03_Manuales_y_Despliegue/02_Guia_Implementacion_y_Despliegue.docx)
- [Plan de pruebas y validación](../Documentacion_Por_Fases/Fase_3_Implementacion_y_Cierre/02_Pruebas_y_Validacion/03_Plan_de_Pruebas_y_Validacion.docx)

## Uso y configuración

Para revisar la interfaz localmente, abra la carpeta de la aplicación con un servidor HTTP, como Live Server, y acceda a `login.html`.

La aplicación utiliza servicios alojados de Supabase: **ejecutarla localmente no crea una base de datos local ni aísla automáticamente los datos**. Las pruebas que modifican información deben realizarse con cuentas y datos autorizados.

El repositorio contiene el código y la documentación de la solución. La configuración real de servicios y los resultados de validación deben comprobarse en sus respectivos entornos y registros.
