"use client";

import { useSyncExternalStore } from "react";
import type { Accion, Estado, Fallo, Prioridad, Rol, Suceso } from "./types";

// Todos los textos de la aplicación, en español e inglés. El idioma se elige con
// el botón del menú y se recuerda en el navegador.

const es = {
  marca: "Relevo",
  lema: "Quién hace qué, y para cuándo.",
  roles: { admin: "Administrador", empleado: "Empleado" } as Record<Rol, string>,
  estados: {
    borrador: "Sin asignar",
    asignada: "Asignada",
    aclaracion: "Aclaración pedida",
    aceptada: "Aceptada",
    en_curso: "En curso",
    enviada: "Enviada",
    en_revision: "En revisión",
    devuelta: "Devuelta",
    completada: "Completada",
  } as Record<Estado, string>,
  vencida: "Vencida",
  prioridades: { baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente" } as Record<Prioridad, string>,
  /** Botón, explicación y etiqueta de la nota de cada paso. */
  acciones: {
    aceptar: { boton: "Aceptar tarea", ayuda: "Confirmas que la recibiste y que la vas a hacer.", nota: "" },
    aclarar: {
      boton: "Pedir aclaración",
      ayuda: "La tarea vuelve al administrador hasta que te responda.",
      nota: "¿Qué necesitas que te aclaren o que se cambie?",
    },
    iniciar: { boton: "Empezar a trabajar", ayuda: "La tarea pasa a «En curso».", nota: "" },
    enviar: {
      boton: "Enviar para revisión",
      ayuda: "El administrador revisará tu entrega.",
      nota: "Nota de entrega (opcional): qué hiciste, dónde está, qué falta.",
    },
    responder: {
      boton: "Responder aclaración",
      ayuda: "Si hace falta, edita primero la tarea. Vuelve a quedar «Asignada» para que la acepten.",
      nota: "Tu respuesta",
    },
    revisar: { boton: "Empezar revisión", ayuda: "Avisa al equipo que ya la estás revisando.", nota: "" },
    aprobar: { boton: "Aprobar", ayuda: "La tarea queda completada.", nota: "Comentario (opcional)" },
    devolver: {
      boton: "Devolver con cambios",
      ayuda: "La tarea vuelve a su responsable para que la corrija.",
      nota: "¿Qué hay que cambiar?",
    },
    reabrir: {
      boton: "Reabrir",
      ayuda: "La tarea vuelve a su responsable como «Devuelta».",
      nota: "¿Por qué se reabre?",
    },
    comentar: { boton: "Comentar", ayuda: "", nota: "Escribe un comentario" },
  } as Record<Accion, { boton: string; ayuda: string; nota: string }>,
  /** Cómo se cuenta cada paso en el historial. */
  sucesos: {
    crear: () => "creó la tarea",
    asignar: (n) => `la asignó a ${n}`,
    reasignar: (n) => `la reasignó a ${n}`,
    desasignar: () => "la dejó sin responsable",
    editar: (n) => `editó ${n}`,
    aceptar: () => "aceptó la tarea",
    aclarar: () => "pidió una aclaración",
    iniciar: () => "empezó a trabajar",
    enviar: () => "envió la tarea para revisión",
    responder: () => "respondió la aclaración",
    revisar: () => "empezó la revisión",
    aprobar: () => "aprobó la tarea",
    devolver: () => "devolvió la tarea con cambios",
    reabrir: () => "reabrió la tarea",
    comentar: () => "comentó",
  } as Record<Suceso, (nota: string) => string>,
  campos: {
    titulo: "Título",
    descripcion: "Descripción e instrucciones",
    prioridad: "Prioridad",
    vence: "Fecha límite",
    responsable: "Responsable",
    estado: "Estado",
    creada: "Creada",
    actualizada: "Último movimiento",
    codigo: "Código",
    tarea: "Tarea",
  },
  /** Nombres de los campos en la frase "editó título, fecha límite". */
  camposEditados: { titulo: "el título", descripcion: "la descripción", prioridad: "la prioridad", vence: "la fecha límite" } as Record<
    string,
    string
  >,
  nav: { inicio: "Inicio", tareas: "Tareas", historial: "Historial", informes: "Informes", equipo: "Equipo" },
  comun: {
    salir: "Cerrar sesión",
    cancelar: "Cancelar",
    guardar: "Guardar",
    cargando: "Cargando…",
    reintentar: "Reintentar",
    errorCarga: "No pudimos cargar los datos. Revisa tu conexión.",
    sinFecha: "Sin fecha",
    sinResponsable: "Sin asignar",
    todos: "Todos",
    todas: "Todas",
    si: "Sí",
    no: "No",
    ver: "Ver",
    tema: "Cambiar entre claro y oscuro",
    idioma: "English",
    pendiente: "invitación pendiente",
    inactivo: "desactivado",
  },
  fechas: {
    hoy: "vence hoy",
    manana: "vence mañana",
    en: (n: number) => `en ${n} días`,
    ayer: "venció ayer",
    hace: (n: number) => `venció hace ${n} días`,
  },
  entrada: {
    puntos: ["El administrador crea y asigna.", "El equipo acepta, trabaja y entrega.", "Cada paso queda en el historial."],
    titulo: "Entrar",
    correo: "Correo",
    clave: "Contraseña",
    boton: "Entrar",
    entrando: "Entrando…",
    olvido: "¿Olvidaste tu contraseña?",
    olvidoAyuda: "Escribe tu correo arriba y te enviamos un enlace para crear una nueva.",
    olvidoListo: "Si ese correo tiene cuenta, ya va en camino el enlace.",
    invitado: "¿Te invitaron? Abre el enlace que te envió tu administrador.",
    demo: "Probar sin cuenta",
    demoAdmin: "Entrar como administradora",
    demoEmpleado: "Entrar como empleado",
    demoNota: "Datos de ejemplo. Nada se guarda.",
    sinAcceso: (correo: string) =>
      `La cuenta ${correo} todavía no tiene acceso. Pide a tu administrador el enlace de invitación.`,
    desactivada: "Tu cuenta está desactivada. Habla con tu administrador.",
  },
  activar: {
    titulo: "Activa tu cuenta",
    hola: (nombre: string) => `Hola, ${nombre}. Crea tu contraseña para entrar.`,
    invalida: "Este enlace de invitación no es válido o ya se usó.",
    clave: "Crea una contraseña",
    claveAyuda: "Mínimo 8 caracteres.",
    repetir: "Repítela",
    distintas: "Las contraseñas no coinciden.",
    boton: "Activar cuenta",
    activando: "Activando…",
    confirmar: (correo: string) =>
      `Te enviamos un correo a ${correo}. Confírmalo y vuelve a abrir este enlace: con la misma contraseña quedas adentro.`,
    irEntrar: "Ir a entrar",
  },
  restablecer: {
    titulo: "Nueva contraseña",
    boton: "Guardar contraseña",
    listo: "Contraseña actualizada.",
    sinSesion: "Abre esta página desde el enlace que llegó a tu correo.",
  },
  demo: {
    aviso: "Modo de muestra · los cambios no se guardan",
    verComo: "Ver como",
    salir: "Salir de la muestra",
  },
  inicio: {
    hola: (nombre: string) => `Hola, ${nombre}`,
    flujo: "El flujo, ahora",
    esperanPorTi: "Esperan por ti",
    nadaPendiente: "Nada espera por ti. Buen momento para adelantar.",
    fechas: "Fechas",
    sinFechas: "Ninguna fecha límite cerca.",
    sinAsignar: "Sin asignar",
    enEspera: "Esperando respuesta",
    cifras: { abiertas: "Abiertas", vencidas: "Vencidas", porRevisar: "Por revisar", completadas: "Completadas en 30 días" },
    tuTurno: "Tu turno",
    porAceptar: "Por aceptar",
    enMarcha: "En marcha",
    devueltas: "Devueltas con cambios",
    verTodas: "Ver todas las tareas",
  },
  tareas: {
    titulo: "Tareas",
    nueva: "Nueva tarea",
    buscar: "Buscar por título o código",
    vistas: { abiertas: "Abiertas", completadas: "Completadas", todas: "Todas" },
    soloVencidas: "Solo vencidas",
    vacio: "No hay tareas con esos filtros.",
    cuenta: (n: number) => (n === 1 ? "1 tarea" : `${n} tareas`),
  },
  formulario: {
    nueva: "Nueva tarea",
    editar: "Editar tarea",
    borrador: "Sin asignar (queda guardada como borrador)",
    crear: "Crear tarea",
    guardar: "Guardar cambios",
    tituloCorto: "El título necesita al menos 3 letras.",
    reasignar: "Al cambiar de responsable, la tarea vuelve a «Asignada» para que la nueva persona la acepte.",
  },
  detalle: {
    volver: "Tareas",
    noExiste: "Esta tarea no existe o no tienes acceso a ella.",
    siguiente: "Siguiente paso",
    esperaAdmin: "Esperando al administrador.",
    esperaA: (nombre: string) => `Esperando a ${nombre}.`,
    sinResponsable: "Asigna un responsable para que la tarea empiece a moverse.",
    terminada: "Tarea completada.",
    otras: "Otras acciones",
    confirmar: "Confirmar",
    historial: "Historial",
    editar: "Editar",
    eliminar: "Eliminar",
    eliminarSeguro: "¿Eliminar esta tarea y todo su historial?",
    eliminarSi: "Sí, eliminar",
    sinDescripcion: "Sin descripción.",
    notaCorta: "Escribe al menos 3 letras.",
  },
  historial: {
    titulo: "Historial",
    actividad: "Actividad",
    completadas: "Completadas",
    vacio: "Todavía no hay movimientos.",
    sinCompletadas: "Aún no hay tareas completadas.",
    persona: "Persona",
    completadaEl: "Completada el",
  },
  informes: {
    titulo: "Informes",
    periodo: "Periodo",
    periodos: { "7": "Últimos 7 días", "30": "Últimos 30 días", "90": "Últimos 90 días", todo: "Todo" } as Record<string, string>,
    creadas: "Creadas",
    completadas: "Completadas",
    aTiempo: "Entregadas a tiempo",
    promedio: "Días promedio hasta completar",
    vencidas: "Vencidas ahora",
    devoluciones: "Devoluciones",
    porPersona: "Por persona",
    porEstado: "Por estado",
    porPrioridad: "Por prioridad (abiertas)",
    abiertas: "Abiertas",
    descargar: "Descargar CSV",
    sinDatos: "Sin datos en este periodo.",
    nota: "«A tiempo» compara el día en que se aprobó con la fecha límite; las tareas sin fecha no cuentan.",
  },
  equipo: {
    titulo: "Equipo",
    invitar: "Invitar a alguien",
    nombre: "Nombre",
    correo: "Correo",
    rol: "Rol",
    boton: "Crear invitación",
    enlace: "Copiar enlace de invitación",
    copiado: "Enlace copiado",
    ayuda: "Cada persona crea su propia contraseña con el enlace. Envíalo por un canal privado: sirve una sola vez.",
    activo: "Activo",
    desactivar: "Desactivar acceso",
    reactivar: "Reactivar",
    retirar: "Retirar invitación",
    tu: "tú",
    abiertas: (n: number) => (n === 1 ? "1 tarea abierta" : `${n} tareas abiertas`),
    guardar: "Guardar",
  },
  fallos: {
    permiso: "No tienes permiso para hacer eso.",
    no_existe: "Ya no existe. Recarga la página.",
    transicion: "La tarea cambió de estado mientras tanto. Recarga y revisa.",
    nota: "La nota es obligatoria (entre 3 y 2.000 letras).",
    titulo: "El título debe tener entre 3 y 140 letras.",
    descripcion: "La descripción es demasiado larga.",
    prioridad: "Elige una prioridad.",
    asignado: "Esa persona ya no está activa.",
    completada: "Una tarea completada no cambia de responsable. Reábrela primero.",
    email: "Ese correo no parece válido.",
    nombre: "El nombre debe tener entre 2 y 80 letras.",
    rol: "Elige un rol.",
    duplicado: "Ya hay alguien del equipo con ese correo.",
    propio: "No puedes quitarte a ti mismo el rol de administrador ni desactivarte.",
    ultimo_admin: "El equipo no puede quedarse sin administrador.",
    activa: "Esa persona ya activó su cuenta: desactívala en vez de retirarla.",
    invitacion: "La invitación no es válida, ya se usó o es para otro correo.",
    ya_activa: "Tu cuenta ya está activa. Entra con tu correo y contraseña.",
    sesion: "Inicia sesión para continuar.",
    credenciales: "Correo o contraseña incorrectos.",
    confirmar: "Falta confirmar tu correo. Revisa tu bandeja de entrada.",
    clave: "La contraseña debe tener al menos 8 caracteres.",
    error: "Algo salió mal. Intenta de nuevo.",
  } as Record<Fallo, string>,
};

const en: typeof es = {
  marca: "Relevo",
  lema: "Who does what, and by when.",
  roles: { admin: "Admin", empleado: "Team member" },
  estados: {
    borrador: "Unassigned",
    asignada: "Assigned",
    aclaracion: "Clarification asked",
    aceptada: "Accepted",
    en_curso: "In progress",
    enviada: "Submitted",
    en_revision: "In review",
    devuelta: "Returned",
    completada: "Completed",
  },
  vencida: "Overdue",
  prioridades: { baja: "Low", media: "Medium", alta: "High", urgente: "Urgent" },
  acciones: {
    aceptar: { boton: "Accept task", ayuda: "You confirm you received it and will do it.", nota: "" },
    aclarar: {
      boton: "Ask for clarification",
      ayuda: "The task goes back to the admin until they answer.",
      nota: "What do you need clarified or changed?",
    },
    iniciar: { boton: "Start working", ayuda: "The task moves to “In progress”.", nota: "" },
    enviar: {
      boton: "Submit for review",
      ayuda: "The admin will review your work.",
      nota: "Submission note (optional): what you did, where it is, what is missing.",
    },
    responder: {
      boton: "Answer clarification",
      ayuda: "Edit the task first if needed. It goes back to “Assigned” to be accepted again.",
      nota: "Your answer",
    },
    revisar: { boton: "Start review", ayuda: "Lets the team know you are reviewing it.", nota: "" },
    aprobar: { boton: "Approve", ayuda: "The task is marked as completed.", nota: "Comment (optional)" },
    devolver: {
      boton: "Return with changes",
      ayuda: "The task goes back to its owner to be fixed.",
      nota: "What needs to change?",
    },
    reabrir: { boton: "Reopen", ayuda: "The task goes back to its owner as “Returned”.", nota: "Why is it being reopened?" },
    comentar: { boton: "Comment", ayuda: "", nota: "Write a comment" },
  },
  sucesos: {
    crear: () => "created the task",
    asignar: (n) => `assigned it to ${n}`,
    reasignar: (n) => `reassigned it to ${n}`,
    desasignar: () => "left it unassigned",
    editar: (n) => `edited ${n}`,
    aceptar: () => "accepted the task",
    aclarar: () => "asked for clarification",
    iniciar: () => "started working",
    enviar: () => "submitted the task for review",
    responder: () => "answered the clarification",
    revisar: () => "started the review",
    aprobar: () => "approved the task",
    devolver: () => "returned the task with changes",
    reabrir: () => "reopened the task",
    comentar: () => "commented",
  },
  campos: {
    titulo: "Title",
    descripcion: "Description and instructions",
    prioridad: "Priority",
    vence: "Due date",
    responsable: "Owner",
    estado: "Status",
    creada: "Created",
    actualizada: "Last activity",
    codigo: "Code",
    tarea: "Task",
  },
  camposEditados: { titulo: "the title", descripcion: "the description", prioridad: "the priority", vence: "the due date" },
  nav: { inicio: "Home", tareas: "Tasks", historial: "History", informes: "Reports", equipo: "Team" },
  comun: {
    salir: "Sign out",
    cancelar: "Cancel",
    guardar: "Save",
    cargando: "Loading…",
    reintentar: "Retry",
    errorCarga: "We could not load the data. Check your connection.",
    sinFecha: "No date",
    sinResponsable: "Unassigned",
    todos: "All",
    todas: "All",
    si: "Yes",
    no: "No",
    ver: "View",
    tema: "Switch between light and dark",
    idioma: "Español",
    pendiente: "invitation pending",
    inactivo: "deactivated",
  },
  fechas: {
    hoy: "due today",
    manana: "due tomorrow",
    en: (n) => `in ${n} days`,
    ayer: "due yesterday",
    hace: (n) => `${n} days overdue`,
  },
  entrada: {
    puntos: ["The admin creates and assigns.", "The team accepts, works and delivers.", "Every step stays in the history."],
    titulo: "Sign in",
    correo: "Email",
    clave: "Password",
    boton: "Sign in",
    entrando: "Signing in…",
    olvido: "Forgot your password?",
    olvidoAyuda: "Type your email above and we will send you a link to create a new one.",
    olvidoListo: "If that email has an account, the link is on its way.",
    invitado: "Were you invited? Open the link your admin sent you.",
    demo: "Try it without an account",
    demoAdmin: "Enter as the admin",
    demoEmpleado: "Enter as a team member",
    demoNota: "Sample data. Nothing is saved.",
    sinAcceso: (correo) => `The account ${correo} has no access yet. Ask your admin for the invitation link.`,
    desactivada: "Your account is deactivated. Talk to your admin.",
  },
  activar: {
    titulo: "Activate your account",
    hola: (nombre) => `Hi, ${nombre}. Create your password to get in.`,
    invalida: "This invitation link is not valid or was already used.",
    clave: "Create a password",
    claveAyuda: "At least 8 characters.",
    repetir: "Repeat it",
    distintas: "The passwords do not match.",
    boton: "Activate account",
    activando: "Activating…",
    confirmar: (correo) =>
      `We sent an email to ${correo}. Confirm it and open this link again: the same password gets you in.`,
    irEntrar: "Go to sign in",
  },
  restablecer: {
    titulo: "New password",
    boton: "Save password",
    listo: "Password updated.",
    sinSesion: "Open this page from the link in your email.",
  },
  demo: { aviso: "Sample mode · changes are not saved", verComo: "View as", salir: "Leave the sample" },
  inicio: {
    hola: (nombre) => `Hi, ${nombre}`,
    flujo: "The flow, right now",
    esperanPorTi: "Waiting on you",
    nadaPendiente: "Nothing is waiting on you. A good time to get ahead.",
    fechas: "Dates",
    sinFechas: "No due dates coming up.",
    sinAsignar: "Unassigned",
    enEspera: "Waiting for an answer",
    cifras: { abiertas: "Open", vencidas: "Overdue", porRevisar: "To review", completadas: "Completed in 30 days" },
    tuTurno: "Your turn",
    porAceptar: "To accept",
    enMarcha: "Under way",
    devueltas: "Returned with changes",
    verTodas: "See all tasks",
  },
  tareas: {
    titulo: "Tasks",
    nueva: "New task",
    buscar: "Search by title or code",
    vistas: { abiertas: "Open", completadas: "Completed", todas: "All" },
    soloVencidas: "Overdue only",
    vacio: "No tasks match those filters.",
    cuenta: (n) => (n === 1 ? "1 task" : `${n} tasks`),
  },
  formulario: {
    nueva: "New task",
    editar: "Edit task",
    borrador: "Unassigned (saved as a draft)",
    crear: "Create task",
    guardar: "Save changes",
    tituloCorto: "The title needs at least 3 letters.",
    reasignar: "Changing the owner sends the task back to “Assigned” so the new person can accept it.",
  },
  detalle: {
    volver: "Tasks",
    noExiste: "This task does not exist or you have no access to it.",
    siguiente: "Next step",
    esperaAdmin: "Waiting on the admin.",
    esperaA: (nombre) => `Waiting on ${nombre}.`,
    sinResponsable: "Assign an owner to get this task moving.",
    terminada: "Task completed.",
    otras: "Other actions",
    confirmar: "Confirm",
    historial: "History",
    editar: "Edit",
    eliminar: "Delete",
    eliminarSeguro: "Delete this task and all its history?",
    eliminarSi: "Yes, delete",
    sinDescripcion: "No description.",
    notaCorta: "Write at least 3 letters.",
  },
  historial: {
    titulo: "History",
    actividad: "Activity",
    completadas: "Completed",
    vacio: "No activity yet.",
    sinCompletadas: "No completed tasks yet.",
    persona: "Person",
    completadaEl: "Completed on",
  },
  informes: {
    titulo: "Reports",
    periodo: "Period",
    periodos: { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", todo: "All time" },
    creadas: "Created",
    completadas: "Completed",
    aTiempo: "Delivered on time",
    promedio: "Average days to complete",
    vencidas: "Overdue now",
    devoluciones: "Returns",
    porPersona: "By person",
    porEstado: "By status",
    porPrioridad: "By priority (open)",
    abiertas: "Open",
    descargar: "Download CSV",
    sinDatos: "No data in this period.",
    nota: "“On time” compares the approval day with the due date; tasks without a date do not count.",
  },
  equipo: {
    titulo: "Team",
    invitar: "Invite someone",
    nombre: "Name",
    correo: "Email",
    rol: "Role",
    boton: "Create invitation",
    enlace: "Copy invitation link",
    copiado: "Link copied",
    ayuda: "Each person creates their own password with the link. Send it privately: it works only once.",
    activo: "Active",
    desactivar: "Deactivate access",
    reactivar: "Reactivate",
    retirar: "Withdraw invitation",
    tu: "you",
    abiertas: (n) => (n === 1 ? "1 open task" : `${n} open tasks`),
    guardar: "Save",
  },
  fallos: {
    permiso: "You are not allowed to do that.",
    no_existe: "It no longer exists. Reload the page.",
    transicion: "The task changed status in the meantime. Reload and check.",
    nota: "The note is required (3 to 2,000 letters).",
    titulo: "The title must have 3 to 140 letters.",
    descripcion: "The description is too long.",
    prioridad: "Choose a priority.",
    asignado: "That person is no longer active.",
    completada: "A completed task cannot change owner. Reopen it first.",
    email: "That email does not look valid.",
    nombre: "The name must have 2 to 80 letters.",
    rol: "Choose a role.",
    duplicado: "Someone on the team already has that email.",
    propio: "You cannot remove your own admin role or deactivate yourself.",
    ultimo_admin: "The team cannot be left without an admin.",
    activa: "That person already activated their account: deactivate them instead.",
    invitacion: "The invitation is not valid, was already used or belongs to another email.",
    ya_activa: "Your account is already active. Sign in with your email and password.",
    sesion: "Sign in to continue.",
    credenciales: "Wrong email or password.",
    confirmar: "Your email is not confirmed yet. Check your inbox.",
    clave: "The password must have at least 8 characters.",
    error: "Something went wrong. Please try again.",
  },
};

export type Idioma = "es" | "en";
export type Textos = typeof es;
const diccionario: Record<Idioma, Textos> = { es, en };
const regiones: Record<Idioma, string> = { es: "es-CO", en: "en-US" };

// --- Idioma elegido ---------------------------------------------------------

const CLAVE = "relevo-idioma";
const oyentes = new Set<() => void>();
let idioma: Idioma | null = null;

function leer(): Idioma {
  if (idioma) return idioma;
  let guardado: string | null = null;
  try {
    guardado = window.localStorage.getItem(CLAVE);
  } catch {
    // Sin almacenamiento se usa el idioma del navegador.
  }
  idioma = guardado === "es" || guardado === "en" ? guardado : navigator.language.startsWith("en") ? "en" : "es";
  document.documentElement.lang = idioma;
  return idioma;
}

export function cambiarIdioma(nuevo: Idioma) {
  idioma = nuevo;
  document.documentElement.lang = nuevo;
  try {
    window.localStorage.setItem(CLAVE, nuevo);
  } catch {
    // Sin almacenamiento el idioma dura hasta recargar.
  }
  oyentes.forEach((o) => o());
}

function subscribe(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Idioma actual; "es" mientras se pinta en el servidor. */
export const useIdioma = () => useSyncExternalStore<Idioma>(subscribe, leer, () => "es");

/** Idioma en que se arma el contenido de muestra. */
export const idiomaActual = () => leer();

/** Textos y formatos de fecha en el idioma elegido. */
export function useT() {
  const actual = useIdioma();
  const region = regiones[actual];
  const con = (opciones: Intl.DateTimeFormatOptions) => (valor: string) => {
    // Una fecha suelta ("2026-10-15") se toma como día local, no como medianoche UTC.
    const fecha = valor.length === 10 ? new Date(`${valor}T12:00:00`) : new Date(valor);
    return new Intl.DateTimeFormat(region, opciones).format(fecha);
  };
  return {
    t: diccionario[actual],
    idioma: actual,
    /** "15 oct" */
    dia: con({ day: "numeric", month: "short" }),
    /** "15 oct 2026" */
    diaLargo: con({ day: "numeric", month: "short", year: "numeric" }),
    /** "15 oct, 3:40 p. m." */
    momento: con({ day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
    /** "lunes, 12 de octubre" */
    hoyLargo: con({ weekday: "long", day: "numeric", month: "long" }),
  };
}
