# Hoja de ruta de TRAZO

## Entregado

- Rediseño TRAZO, acceso adaptable, temas y navegación móvil.
- Next.js 16.4.6, registro, recuperación de contraseña e invitaciones con caducidad.
- Supabase dedicado, empresas independientes, permisos por membresía y archivos privados.
- Flujo de tareas, historial, archivo y eliminación con limpieza de archivos.
- Borradores de tareas, comentarios y notas de acciones guardados por cuenta y empresa en el dispositivo.
- Reintentos de creación y archivos con protección frente a duplicados, progreso por archivo.
- Notificaciones de actividad dentro de la app y marca de lectura por persona y empresa.
- Ficha de obra con tareas, personas, archivos y avance ponderado.
- Plantillas reutilizables de tareas y duplicación.
- Informe de obra para cliente con fotografías, impresión y guardado como PDF.
- Datos de empresa, contacto y logo privado.
- Lista paginada con búsqueda en servidor, tablero y calendario de vencimientos.
- Respaldo comprimido de empresa con archivos, integridad SHA-256 y recuperación en una empresa nueva.
- Vistas previas de Vercel con datos ficticios y conexión de Supabase bloqueada.
- Verificaciones en GitHub y antes de cada publicación en Vercel.

## Verificación

Ejecutar `npm test`, `npx next typegen`, `npx tsc --noEmit`, `npm run lint` y `npm run build`.
Las pruebas SQL `supabase/tests/empresas.sql` y `supabase/tests/operaciones.sql` usan datos temporales y terminan con ROLLBACK.
Cubren aislamiento, roles, invitaciones, archivos, pesos, plantillas, creación repetida, búsqueda de más de 1.000 tareas y recuperación.
Los cambios SQL se incluyen en migraciones y se agregan al final de `supabase/schema.sql`.

## Acceso con Google pendiente de activación

Código integrado en `main`. Botón en acceso y registro, manejo de errores y pruebas automatizadas.
Pendiente crear el cliente web en Google Cloud, habilitar el proveedor en Supabase y probar el recorrido real.

## Pendientes del propietario

- Comprar el dominio, crear el correo exclusivo de TRAZO en Zoho, elegir el envío SMTP y guardar sus credenciales en Supabase. Verificar confirmación, recuperación e invitaciones con destinatarios externos.
- Revisar el límite de gasto de GitHub en Billing > Budgets and alerts. La API disponible no permite confirmar esta configuración de la cuenta personal.
- Guardar periódicamente las copias de empresa en una ubicación privada externa. Ensayar la recuperación con una copia reciente que incluya archivos.
- Preparar además un respaldo completo de Postgres/Auth y Storage para recuperación ante pérdida del proyecto. Las copias de empresa recuperan datos operativos y generan nuevas invitaciones.

## Límites actuales

- Los archivos seleccionados permanecen en la pestaña hasta subirlos. Tras recargar, deben volver a seleccionarse.
- La recuperación de empresa admite 250 MB descomprimidos, 10.000 tareas, 10.000 archivos y 2.000 perfiles, con hasta 30 MB de metadatos.
- El tablero y el calendario respetan los filtros y la página de resultados seleccionada.
- El PDF se guarda mediante el diálogo de impresión del navegador.
