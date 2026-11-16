# Operación de TRAZO

## Enfoque técnico

- **Next.js (React) + TypeScript + Tailwind CSS**, con **Supabase** (Postgres y autenticación).
- **Permisos en la base de datos, no en el navegador.** Cada tabla tiene seguridad por fila:
  cada empresa tiene sus propios datos y membresías. Una persona ve sus tareas y el administrador ve su empresa.
- **Nadie escribe directo en las tablas.** Crear, editar y cada paso del flujo pasan por funciones de la
  base que comprueban quién llama, validan los datos y anotan el paso en el historial. Aunque alguien
  manipule la aplicación, no puede aprobar su propia tarea ni saltarse un estado.
- **Registro de cuentas y empresas.** Cada cuenta confirma su correo y crea su empresa como administrador.
  El administrador crea la invitación y comparte un enlace de un solo uso;
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
  (interfaz en español); añadir un campo o un paso no obliga a tocar las pantallas una por una.

## Proyecto dedicado y registro de empresas

El proyecto de TRAZO es `dcwmzdsefflgodwyhadp`. La conexión local está en `.env.local`, que Git ignora.
Para una instalación limpia, ejecutar `supabase/schema.sql` completo una sola vez. Las migraciones
multiempresa requieren una base limpia o ya multiempresa. Una instalación anterior con perfiles requiere
una migración de datos específica antes de aplicar estos cambios.

1. En Supabase, Authentication > URL Configuration, usar `http://localhost:3000` como Site URL
   durante el desarrollo. Añadir `http://localhost:3000/**` a Redirect URLs para confirmaciones,
   invitaciones y recuperación de contraseña. Para publicar, configurar también las direcciones reales.
2. Mantener habilitados los registros por correo y la confirmación del correo.
3. Abrir `/registro`, crear una cuenta personal y confirmar el correo.
4. En `/empresas`, registrar la empresa. Su creador recibe el rol de administrador en ella.
5. Invitar personas desde Equipo o clientes desde Obras. Una cuenta existente puede aceptar
   invitaciones de otras empresas. Cada membresía conserva su propio rol.
6. Usar Cambiar empresa para elegir el contexto o crear otra empresa.

La cabecera `x-trazo-company` selecciona la empresa en las consultas. Postgres comprueba la pertenencia
con `auth.uid()` y aplica seguridad por fila en todas las tablas y funciones del flujo. Los enlaces
entre tareas, obras, personas y archivos también llevan claves de empresa. Cambiar la cabecera por
cuenta propia exige igualmente una membresía activa. El cambio de empresa espera las operaciones
en curso, vacía los datos y enlaces temporales locales y descarta respuestas anteriores.

Las funciones de alta y listado de empresas usan permisos elevados para crear la membresía inicial
y listar exclusivamente las membresías propias. El asesor de seguridad de Supabase las señala como
`authenticated_security_definer_function_executable`. Su exposición es intencional y sus comprobaciones
se cubren en `supabase/tests/empresas.sql`.
[Detalle del aviso de Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

### Correos y verificación

Para recibir confirmaciones con el correo de la cuenta principal de Supabase puede utilizarse su
servicio inicial. Para que se registren otras empresas hace falta configurar un proveedor SMTP y un
remitente válido en Authentication > Emails. El servicio inicial solo entrega a los miembros de la
organización de Supabase y tiene un límite reducido de envíos.
Referencia oficial https://supabase.com/docs/guides/auth/auth-smtp

La integración de Supabase disponible permite instalar y probar el esquema. La configuración de SMTP
y de URLs de Auth se realiza en el panel. La entrega de un correo real y la primera cuenta de la
empresa deben verificarse con su propietario.

### Pruebas

Ejecutar `npm test`, `npx tsc --noEmit`, `npm run lint` y `npm run build`.
En SQL Editor, ejecutar `supabase/tests/empresas.sql` como postgres. Comprueba aislamiento, roles por
empresa, invitaciones de cuentas existentes, numeración independiente y permisos de archivos y
limpieza. Todo se ejecuta en una transacción que termina con ROLLBACK.


### Vistas previas y comprobaciones automaticas

Vercel Preview utiliza `NEXT_PUBLIC_DEMO_ONLY=true`. La muestra se abre con datos ficticios y permite
cambiar entre administrador, empleado y cliente. El cliente bloquea consultas, autenticacion y
archivos de Supabase en este modo. Las variables de conexion a Supabase estan limitadas a Produccion.
Para trabajar localmente con la muestra puede usarse la misma variable. Con su valor predeterminado,
la conexion local se toma de `.env.local`.

GitHub Actions ejecuta pruebas, generacion de tipos de Next.js, TypeScript, lint y compilacion al abrir
una solicitud a `main` y al integrar cambios en `main`. Usa Node.js 24 y Ubuntu con permisos de lectura,
un limite de 15 minutos y cancelacion de ejecuciones anteriores de la misma rama. Las comprobaciones
utilizan la demo. El resultado se ve en el control `Verificaciones` de cada solicitud de integracion.
Vercel ejecuta tambien `npm test && npm run lint && npm run build` antes de publicar.
El límite de gasto de la cuenta se revisa en Billing > Budgets and alerts. Los recursos facturables
dependen de la visibilidad del repositorio, del runner utilizado y del producto contratado.


### Operación, respaldos y correo de TRAZO

Desde Empresa, un administrador puede descargar un respaldo comprimido de sus datos y archivos.
La importación comprueba SHA-256 y crea una empresa nueva con identificadores nuevos. Los otros
miembros reciben invitaciones nuevas. Si una transferencia falla, volver a abrir el mismo archivo
reanuda la recuperación. Se conservan las empresas originales. El límite es de 250 MB descomprimidos,
10.000 tareas, 10.000 archivos, 2.000 perfiles y 30 MB de metadatos.

Guardar las copias en una ubicación privada externa y comprobar periódicamente su recuperación.
Para recuperación del proyecto completo se necesita también una copia de Postgres con Auth y los
objetos de Storage, preparada con las herramientas oficiales de Supabase y las credenciales de base
de datos del propietario. Las contraseñas y credenciales se guardan fuera del repositorio.

El propietario creará una cuenta exclusiva de TRAZO para el correo. Configurar en el panel de
Supabase Authentication > Emails > SMTP el servidor, puerto, remitente y credenciales del proveedor
elegido. Comprobar confirmación, recuperación y aceptación de invitaciones con una cuenta externa.
Mantener Site URL en https://gestor-tareas-woad.vercel.app y las redirecciones autorizadas del proyecto.

Los borradores guardan textos en el navegador de la cuenta y empresa correspondiente. Cerrar sesión
los elimina del dispositivo. Las selecciones de archivos deben repetirse después de recargar.
Las notificaciones son internas. El informe de cliente usa Imprimir o guardar PDF del navegador.

Las comprobaciones adicionales de base de datos están en `supabase/tests/operaciones.sql` y finalizan
con ROLLBACK. Incluyen recuperación, permisos, reintentos y búsqueda paginada por encima de 1.000 tareas.


La tabla privada `tm_restore_jobs` usa RLS con acceso directo revocado. Solo las funciones de
recuperación acceden a sus registros, con comprobación de cuenta creadora y empresa.
[Referencia de la comprobación RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

La protección de contraseñas filtradas sigue pendiente según las funciones disponibles del plan.
[Referencia de seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).


### Inicio de sesión con Google

El botón Continuar con Google está disponible en acceso y registro. Supabase mantiene la sesión
y el flujo existente selecciona la membresía o abre la creación de empresa para una cuenta nueva.
La vista previa de demostración mantiene el acceso externo bloqueado.

Configurar en Google Auth Platform un cliente de aplicación web del proyecto TRAZO, con los scopes
openid, email y profile. Autorizar los orígenes de producción y desarrollo, y la redirección
`https://dcwmzdsefflgodwyhadp.supabase.co/auth/v1/callback`.
Guardar Client ID y Client Secret directamente en el proveedor Google de Supabase y habilitarlo.
El secreto permanece en Supabase. El cliente comprueba que el proveedor esté activo antes de abrir Google.
Mientras Google esté en Testing, añadir las cuentas de prueba en Audience. Para admitir a las empresas
externas, completar los requisitos de Google y publicar la aplicación OAuth.

Probar una cuenta nueva, una cuenta existente y la aceptación de una invitación con esa sesión.
La activación y la prueba real quedan pendientes de las credenciales del propietario. El código forma parte de main.
