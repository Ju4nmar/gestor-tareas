# TRAZO

**Del plano al progreso.**

Gestión de obras y tareas para empresas de construcción. Organiza al equipo, documenta cada avance
y comparte con el cliente el seguimiento de su obra desde el celular o el escritorio.

[Aplicación](https://gestor-tareas-woad.vercel.app) · [Repositorio](https://github.com/Ju4nmar/trazo) · [Hoja de ruta](ROADMAP.md)

## Funcionalidades

- Empresas independientes con roles de administrador, empleado y cliente.
- Obras con tareas, responsables, vencimientos, prioridades y avance ponderado.
- Flujo de asignación, aceptación, ejecución, entrega, revisión y aprobación.
- Comentarios, historial, fotos y documentos PDF privados.
- Borradores recuperables, progreso de archivos y reintentos.
- Lista con búsqueda y paginación, tablero y calendario.
- Plantillas reutilizables y duplicación de tareas.
- Notificaciones de actividad dentro de la app.
- Seguimiento para clientes e informes imprimibles para guardar como PDF.
- Personalización de empresa y respaldos con recuperación independiente.

## Tecnología

Next.js 16, React, TypeScript y Tailwind CSS. Supabase proporciona autenticación, Postgres y almacenamiento
privado. Vercel publica la aplicación y GitHub Actions verifica los cambios.

## Desarrollo local

```sh
npm ci
```

Crear `.env.local` con las variables del proyecto de Supabase.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
```

```sh
npm run dev
```

Abrir `http://localhost:3000`. El enlace **Explorar demo** carga un equipo ficticio guardado en la pestaña.
Para trabajar exclusivamente con esa muestra, añadir `NEXT_PUBLIC_DEMO_ONLY=true` al entorno.

## Verificación

```sh
npm test
npx next typegen
npx tsc --noEmit
npm run lint
npm run build
```

Las pruebas SQL de `supabase/tests` comprueban permisos y aislamiento con datos temporales y finalizan
con ROLLBACK. Las vistas previas de Vercel utilizan la demo.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `src/app` | Pantallas y estilos |
| `src/components` | Componentes compartidos |
| `src/lib` | Sesión, datos y reglas de negocio |
| `public/marca` | Recursos de identidad visual |
| `supabase` | Esquema, migraciones y pruebas de base de datos |
| `test` | Pruebas automatizadas |
| `docs` | Configuración y operación |

## Configuración pendiente

- Comprar el dominio y configurar el correo exclusivo de TRAZO en Zoho.
- Configurar un proveedor transaccional SMTP para confirmaciones y recuperación en Supabase.
- Crear el cliente OAuth de Google, habilitar el proveedor y probar el acceso real.

[Configuración, publicación, permisos y respaldos](docs/OPERACION.md)
