# Hoja de ruta

Documento compartido entre las herramientas que trabajan en este repositorio (Claude, Codex).
Se lee al empezar y se actualiza al terminar cada tarea.

## Cómo trabajamos

- **Una rama por tarea** (`fix/...`, `feat/...`, `test/...`), partiendo de `main` actualizado.
- **Solo una herramienta edita una rama a la vez.** La otra revisa el diff (`git diff main...<rama>`).
- Antes de unir una rama: `npx tsc --noEmit`, `npm run lint` y `npm run build` sin errores.
- Los cambios de base de datos van como migración numerada en `supabase/migrations/` **y** al final de
  `supabase/schema.sql` (nueva PARTE), con el mismo contenido. Se prueban primero en el Supabase de pruebas.
- Los textos van siempre en español e inglés (`src/lib/textos.ts`).

## Estado

| # | Tarea | Rama | Estado |
|---|-------|------|--------|
| 1 | Archivar tareas en vez de borrarlas (+ limpieza de fotos al borrar) | `fix/archivar-tareas` | Hecha |
| 2 | Invitaciones que caducan | `fix/invitaciones-caducan` | Hecha |
| 3 | Pruebas de las transiciones del flujo (TypeScript y SQL) | `test/transiciones-flujo` | Hecha |

### Tarea 1 · Archivar tareas

Hecho: migración `003_archivar_tareas.sql` (columna `archived_at`, funciones `tm_archive_task` y
`tm_delete_task` que solo borra archivadas, políticas y vistas que ocultan las archivadas al equipo y al
cliente, disparadores que congelan la tarea archivada), cambios en `store.ts`, `demo.ts`, textos y pantallas.

Por verificar a mano en el Supabase de pruebas (ver pasos en la conversación): archivar, restaurar,
borrar definitivamente con fotos, y que un empleado y un cliente no vean las archivadas.

### Tarea 2 · Invitaciones que caducan

Hecho: migración `004_invitaciones_caducan.sql` (columna `invite_expires_at`, funciones `tm_invite_info`,
`tm_activate`, `tm_invite`, `tm_invite_client`, `tm_renew_invite`), vigencia en `store.ts`, `demo.ts`,
componentes `VigenciaInvitacion` y `AccionesInvitacion`, pantallas de equipo y obras, y pantalla `/activar`.
Probado con prueba E2E de navegador.

### Tarea 3 · Pruebas de las transiciones del flujo (TypeScript y SQL)

Hecho: suite de pruebas automatizadas en `test/flujo-transiciones.test.ts` con runner `test/run.mjs`
y comando `npm test`. Cubre las 450 combinaciones de transiciones de estado, permisos por rol,
validación de notas, tareas archivadas y paridad estricta entre `flujo.ts` y la función SQL `tm_act`.

## Después de estas tres

Decididas tras el piloto con el primer cliente (obra real, 2 a 3 semanas). Candidatas, sin orden:
notificaciones, plantillas de obra, informe semanal al cliente con fotos, vista tablero, personalización
por cliente (logo, color, nombre), paginación, cabecera CSP (primero en modo solo reporte), multiempresa.
