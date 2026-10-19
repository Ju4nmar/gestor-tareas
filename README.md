# Relevo · Gestión de tareas

Aplicación para repartir tareas entre un administrador y su equipo, agrupadas por obra
(un local, una casa, un apartamento). El administrador crea y asigna; cada persona acepta,
pide aclaraciones, trabaja y entrega con fotos del avance; el administrador revisa, aprueba
o devuelve. Todo queda en el historial. Está pensada para usarse desde el celular.

## Qué hace

**Administrador**
- Crea las obras y las archiva cuando terminan; ve el avance de cada una.
- Invita al cliente de cada obra, al crearla o después, con un enlace de un solo uso.
- Crea tareas con obra, título, descripción, prioridad, fecha límite y responsable; las edita, reasigna o elimina.
- Adjunta planos o fotos (imágenes o PDF) para explicar la tarea.
- Ve todas las tareas agrupadas por obra, con filtros (obra, estado, prioridad, responsable, vencidas) y el flujo completo en su tablero.
- Responde aclaraciones, revisa entregas, aprueba, devuelve con cambios o reabre.
- Consulta el historial de actividad e informes por persona, obra, estado y prioridad; descarga las tareas en CSV.
- Administra el equipo: invita, cambia roles, desactiva accesos.

**Equipo**
- Ve solo sus tareas, con lo que le toca hacer primero y las fechas que se acercan o ya pasaron.
- Acepta, pide aclaración (con motivo), empieza, envía con nota de entrega y comenta.
- Toma una foto con el celular o sube una de la galería para mostrar el avance, al entregar o en cualquier momento.
- Consulta sus tareas completadas y su historial.

**Cliente de una obra**
- Ve solo su obra (o sus obras): el porcentaje de avance, las fotos y las tareas en tres etapas
  —pendiente, en proceso, terminada—, con sus fechas.
- No ve instrucciones, comentarios, historial ni quién hace cada tarea, y no puede cambiar nada.

## Flujo de estados

```
Sin asignar → Asignada → Aceptada → En curso → Enviada → En revisión → Completada
                 ↑  ↓                              ↓
          Aclaración pedida                    Devuelta → En curso …
```

«Vencida» no es un estado: se calcula con la fecha límite mientras la tarea siga abierta.
Las reglas están en `src/lib/flujo.ts` y, las que mandan, en la función `tm_act` de la base de datos.

## Enfoque técnico

- **Next.js (React) + TypeScript + Tailwind CSS**, con **Supabase** (Postgres y autenticación).
- **Permisos en la base de datos, no en el navegador.** Cada tabla tiene seguridad por fila:
  una persona solo puede leer su perfil, sus tareas y el historial de esas tareas; el administrador lee todo.
- **Nadie escribe directo en las tablas.** Crear, editar y cada paso del flujo pasan por funciones de la
  base que comprueban quién llama, validan los datos y anotan el paso en el historial. Aunque alguien
  manipule la aplicación, no puede aprobar su propia tarea ni saltarse un estado.
- **Usuarios por invitación.** El administrador crea la invitación y comparte un enlace de un solo uso;
  la persona elige su contraseña. El administrador nunca la conoce.
- **El cliente no lee las tablas.** Una función de la base le arma el resumen de su obra campo por
  campo, así que lo interno no viaja a su navegador aunque abra las herramientas del desarrollador.
- **Fotos y archivos privados.** Se guardan en un almacén privado de Supabase: solo los abre el
  administrador o la persona responsable de esa tarea, con enlaces que caducan en una hora. Las fotos
  se reducen en el teléfono antes de subir, para que carguen rápido con mala señal.
- **Hecha para el celular.** Menú fijo abajo con tres secciones, botones grandes, el siguiente paso
  siempre arriba y una confirmación en palabras después de cada acción.
- **Sin claves secretas en la aplicación.** Solo se usa la clave publicable de Supabase.
- **Cabeceras de seguridad** en `next.config.ts` (no se puede incrustar en otros sitios, entre otras).
- **Pensada para crecer.** Los estados y reglas viven en un solo lugar; los textos, en `src/lib/textos.ts`
  (español e inglés); añadir un campo o un paso no obliga a tocar las pantallas una por una.

## Probarla

```bash
npm install
npm run dev
```

Necesita un archivo `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

En la página de entrada, «Probar sin cuenta» abre una muestra con un equipo ficticio (también con
`/?demo=admin`, `/?demo=empleado` o `/?demo=cliente`). La muestra vive en la pestaña y no toca la base de datos.

## Instalarla para un cliente

1. Crea un proyecto en Supabase y ejecuta `supabase/schema.sql` completo en el SQL Editor.
   Si la base ya tenía una versión anterior, basta con ejecutar en orden las migraciones que
   falten de `supabase/migrations/` (001 obras y archivos, 002 clientes, 003 archivar tareas).
2. En Supabase → Authentication → Users, crea el usuario del administrador (correo y contraseña).
3. En Authentication → URL Configuration, pon la dirección definitiva del sitio como *Site URL*.
   Los enlaces de confirmación de correo y de cambio de contraseña llevan a esa dirección.
4. Publica en Vercel con las dos variables de arriba.
5. Entra con ese usuario: el primero que entra queda como administrador.
6. En Equipo, invita a cada persona y envíale su enlace.

**Correos:** con la configuración por defecto, Supabase pide confirmar el correo al crear la cuenta y
envía pocos mensajes por hora. Para un equipo real, configura un servidor de correo propio (SMTP) en
Authentication → Emails, o desactiva la confirmación si las invitaciones se entregan en persona.
