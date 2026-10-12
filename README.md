# Relevo · Gestión de tareas

Aplicación para repartir tareas entre un administrador y su equipo. El administrador
crea y asigna; cada persona acepta, pide aclaraciones, trabaja y entrega; el
administrador revisa, aprueba o devuelve. Todo queda en el historial.

## Qué hace

**Administrador**
- Crea tareas con título, descripción, prioridad, fecha límite y responsable; las edita, reasigna o elimina.
- Ve todas las tareas con filtros (estado, prioridad, responsable, vencidas) y el flujo completo en su tablero.
- Responde aclaraciones, revisa entregas, aprueba, devuelve con cambios o reabre.
- Consulta el historial de actividad e informes por persona, estado y prioridad; descarga las tareas en CSV.
- Administra el equipo: invita, cambia roles, desactiva accesos.

**Equipo**
- Ve solo sus tareas, con lo que le toca hacer primero y las fechas que se acercan o ya pasaron.
- Acepta, pide aclaración (con motivo), empieza, envía con nota de entrega y comenta.
- Consulta sus tareas completadas y su historial.

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
`/?demo=admin` o `/?demo=empleado`). La muestra vive en la pestaña y no toca la base de datos.

## Instalarla para un cliente

1. Crea un proyecto en Supabase y ejecuta `supabase/schema.sql` completo en el SQL Editor.
2. En Supabase → Authentication → Users, crea el usuario del administrador (correo y contraseña).
3. En Authentication → URL Configuration, pon la dirección definitiva del sitio como *Site URL*.
   Los enlaces de confirmación de correo y de cambio de contraseña llevan a esa dirección.
4. Publica en Vercel con las dos variables de arriba.
5. Entra con ese usuario: el primero que entra queda como administrador.
6. En Equipo, invita a cada persona y envíale su enlace.

**Correos:** con la configuración por defecto, Supabase pide confirmar el correo al crear la cuenta y
envía pocos mensajes por hora. Para un equipo real, configura un servidor de correo propio (SMTP) en
Authentication → Emails, o desactiva la confirmación si las invitaciones se entregan en persona.
