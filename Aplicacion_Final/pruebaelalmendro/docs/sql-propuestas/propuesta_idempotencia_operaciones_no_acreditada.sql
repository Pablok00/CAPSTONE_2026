-- PROPUESTA LOCAL, NO EJECUTADA. No instalar todavía. No concede permisos.
-- Reutiliza la tabla instalada y documenta el namespace JSON NUEVO paso191.
-- No modifica las v1, sus ACL, el estado, intentos, históricos ni datos de cuentas.
-- Requiere prueba PostgreSQL aislada, revisión de datos/locks y autorización separada.
BEGIN;

ALTER TABLE public.usuarios_eliminaciones_operaciones
  ADD CONSTRAINT usuarios_eliminaciones_paso191_binding_valido CHECK (
    NOT (dependencias_resumen ? 'paso191') OR (
      jsonb_typeof(dependencias_resumen->'paso191') IS NOT DISTINCT FROM 'object'
      AND jsonb_typeof(dependencias_resumen->'paso191'->'request_id') IS NOT DISTINCT FROM 'string'
      AND (dependencias_resumen->'paso191'->>'request_id') ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND jsonb_typeof(dependencias_resumen->'paso191'->'fingerprint') IS NOT DISTINCT FROM 'string'
      AND (dependencias_resumen->'paso191'->>'fingerprint') ~ '^[0-9a-f]{64}$'
    )
  );

-- Incluye COMPLETADA: el identificador de petición no vuelve a utilizarse para otro borrado.
CREATE UNIQUE INDEX usuarios_eliminaciones_paso191_request_unico
  ON public.usuarios_eliminaciones_operaciones
  ((dependencias_resumen->'paso191'->>'request_id'))
  WHERE dependencias_resumen ? 'paso191';

-- No se añade aquí una función stub ni un UPDATE que cambie certificados a true.
-- La transición PREPARADA -> AUTH_EN_CURSO sigue sin vía instalable hasta acreditar:
-- 1. reautenticación durable vinculada a actor/sesión/operación, vigente y consumida;
-- 2. manifiesto semántico revisado (incluidos FK/triggers, alertas y avisos_estado);
-- 3. baseline durable de solicitudes/avisos completos en instantánea coherente;
-- 4. cooperación con cambios de rol/estado y creación de nuevas dependencias;
-- 5. intento UUID/reserva durable y CAS; auth.uid humano verificado, no un parámetro.
-- Entonces la misma transición atómica deberá revalidar esas pruebas y registrar,
-- en la operación existente y sin HTTP dentro de la transacción:
--   estado = AUTH_EN_CURSO, intentos_auth = 1 (único intento inicial),
--   paso191.attempt_id = UUID servidor,
--   conservacion_historica_certificada = true,
--   autorizacion_irreversible_confirmada = true,
--   auth_eliminacion_verificada = false.
-- Esas rutas de flags raíz están confirmadas en las v1 del JSON; attempt_id es PROPUESTO.
-- Ni un booleano del frontend ni el evaluador preliminar satisfacen esas precondiciones.
-- Tras incertidumbre no volver a PREPARADA ni incrementar intentos para reintentar Auth.

ROLLBACK;
