import { sumarDias } from "./fechas";
import { ErrorFlujo, NOTA_MAXIMA, NOTA_MINIMA, REGLAS, etapaDe, puede } from "./flujo";
import type {
  Accion,
  Archivo,
  ClienteObra,
  DatosTarea,
  Estado,
  Evento,
  Obra,
  ObraCliente,
  Perfil,
  Plantilla,
  Empresa,
  Rol,
  Suceso,
  Tarea,
} from "./types";

// El modo de muestra: una empresa de remodelaciones ficticia que vive en la pestaña
// del visitante. Estas funciones hacen lo mismo que las de la base de datos
// (supabase/schema.sql), con las mismas reglas de flujo.ts, sobre un objeto en memoria.

export type Base = {
  plantillas?: Plantilla[];
  vistos?: Record<string, string>;
  empresa?: Partial<Empresa>;
  /** Perfil con el que se está viendo la muestra. */
  yo: string;
  perfiles: Perfil[];
  obras: Obra[];
  tareas: Tarea[];
  eventos: Evento[];
  archivos: Archivo[];
  /** Qué cliente sigue qué obra. */
  clientes: ClienteObra[];
  /** Consecutivo para números de tarea e ids. */
  sec: number;
};

const ahoraIso = () => new Date().toISOString();

/** Cuánto dura una invitación en la muestra, igual que en la base de datos. */
const DIAS_INVITACION = 7;
const venceEn = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();

function administrador(b: Base) {
  const p = b.perfiles.find((x) => x.id === b.yo && x.activo);
  if (!p || p.rol !== "admin") throw new ErrorFlujo("permiso");
  return p;
}

function anotar(
  b: Base,
  tareaId: string,
  actor: Perfil,
  suceso: Suceso,
  de: Estado | null,
  a: Estado | null,
  nota: string,
  fecha: string,
) {
  b.eventos.unshift({
    id: `e${++b.sec}`,
    tareaId,
    fecha,
    actorId: actor.id,
    actor: actor.nombre,
    rol: actor.rol,
    suceso,
    de,
    a,
    nota,
  });
}

export function guardarTarea(b: Base, datos: DatosTarea, id: string | null, fecha = ahoraIso()) {
  const admin = administrador(b);
  const titulo = datos.titulo.trim();
  const peso = datos.peso ?? 1;
  if (!Number.isInteger(peso) || peso < 1 || peso > 1000) throw new ErrorFlujo("error");
  if (titulo.length < 3 || titulo.length > 140) throw new ErrorFlujo("titulo");
  if (datos.descripcion.length > 5000) throw new ErrorFlujo("descripcion");
  // Un cliente nunca es responsable de una tarea.
  const responsable = datos.asignadaA
    ? b.perfiles.find((p) => p.id === datos.asignadaA && p.activo && p.rol !== "cliente")
    : null;
  if (datos.asignadaA && !responsable) throw new ErrorFlujo("asignado");
  if (datos.obraId && !b.obras.some((o) => o.id === datos.obraId)) throw new ErrorFlujo("obra");

  if (!id) {
    const tarea: Tarea = {
      ...datos,
      titulo,
      id: `t${++b.sec}`,
      numero: b.tareas.length + 1,
      estado: responsable ? "asignada" : "borrador",
      creada: fecha,
      actualizada: fecha,
      completada: null,
      archivada: null,
    };
    b.tareas.unshift(tarea);
    anotar(b, tarea.id, admin, "crear", null, "borrador", "", fecha);
    if (responsable) anotar(b, tarea.id, admin, "asignar", "borrador", "asignada", responsable.nombre, fecha);
    return tarea.id;
  }

  const tarea = b.tareas.find((t) => t.id === id);
  if (!tarea) throw new ErrorFlujo("no_existe");
  if (tarea.archivada) throw new ErrorFlujo("archivada");
  const movida = tarea.asignadaA !== datos.asignadaA;
  if (movida && tarea.estado === "completada") throw new ErrorFlujo("completada");
  const cambios: string[] = (["titulo", "descripcion", "prioridad", "vence"] as const).filter(
    (campo) => tarea[campo] !== (campo === "titulo" ? titulo : datos[campo]),
  );
  if (tarea.obraId !== datos.obraId) cambios.push("obra");
  const antes = tarea.estado;
  const anterior = tarea.asignadaA;
  Object.assign(tarea, datos, { titulo, actualizada: fecha });
  if (movida) tarea.estado = responsable ? "asignada" : "borrador";
  if (cambios.length) anotar(b, id, admin, "editar", antes, antes, cambios.join(","), fecha);
  if (movida) {
    const suceso: Suceso = !responsable ? "desasignar" : anterior ? "reasignar" : "asignar";
    anotar(b, id, admin, suceso, antes, tarea.estado, responsable?.nombre ?? "", fecha);
  }
  return id;
}

/** Archiva la tarea o la restaura; queda anotado en su historial. */
export function archivarTarea(b: Base, id: string, archivar: boolean, fecha = ahoraIso()) {
  const admin = administrador(b);
  const tarea = b.tareas.find((t) => t.id === id);
  if (!tarea) throw new ErrorFlujo("no_existe");
  if (Boolean(tarea.archivada) === archivar) return;
  tarea.archivada = archivar ? fecha : null;
  tarea.actualizada = fecha;
  anotar(b, id, admin, archivar ? "archivar" : "restaurar", tarea.estado, tarea.estado, "", fecha);
}

/** Borra del todo una tarea, con su historial y sus archivos. Solo si ya está archivada. */
export function borrarTarea(b: Base, id: string) {
  administrador(b);
  const tarea = b.tareas.find((t) => t.id === id);
  if (!tarea) throw new ErrorFlujo("no_existe");
  if (!tarea.archivada) throw new ErrorFlujo("no_archivada");
  b.tareas = b.tareas.filter((t) => t.id !== id);
  b.eventos = b.eventos.filter((e) => e.tareaId !== id);
  b.archivos = b.archivos.filter((a) => a.tareaId !== id);
}

export function actuar(b: Base, id: string, accion: Accion, nota: string, fecha = ahoraIso()) {
  const yo = b.perfiles.find((p) => p.id === b.yo && p.activo);
  if (!yo) throw new ErrorFlujo("permiso");
  const tarea = b.tareas.find((t) => t.id === id);
  if (!tarea) throw new ErrorFlujo("no_existe");
  if (tarea.asignadaA !== yo.id && yo.rol !== "admin") throw new ErrorFlujo("permiso");
  if (tarea.archivada) throw new ErrorFlujo("archivada");
  if (!puede(accion, tarea, yo)) throw new ErrorFlujo("transicion");
  const regla = REGLAS[accion];
  const texto = nota.trim();
  if (texto.length > NOTA_MAXIMA || (regla.nota === "obligatoria" && texto.length < NOTA_MINIMA)) {
    throw new ErrorFlujo("nota");
  }
  const antes = tarea.estado;
  tarea.estado = regla.hacia ?? antes;
  tarea.actualizada = fecha;
  if (accion === "aprobar") tarea.completada = fecha;
  if (accion === "reabrir") tarea.completada = null;
  anotar(b, id, yo, accion, antes, tarea.estado, texto, fecha);
}

/** Adjunta un archivo a una tarea: el administrador o su responsable. */
export function adjuntar(
  b: Base,
  tareaId: string,
  archivo: Pick<Archivo, "nombre" | "tipo" | "peso" | "url">,
  fecha = ahoraIso(),
) {
  const yo = b.perfiles.find((p) => p.id === b.yo && p.activo);
  const tarea = b.tareas.find((t) => t.id === tareaId);
  if (!yo || !tarea || (tarea.asignadaA !== yo.id && yo.rol !== "admin")) throw new ErrorFlujo("permiso");
  if (tarea.archivada) throw new ErrorFlujo("archivada");
  b.archivos.unshift({
    ...archivo,
    id: `a${++b.sec}`,
    tareaId,
    ruta: "",
    subidoPor: yo.id,
    autor: yo.nombre,
    fecha,
  });
  tarea.actualizada = fecha;
  anotar(b, tareaId, yo, "adjuntar", tarea.estado, tarea.estado, archivo.nombre, fecha);
}

export function quitarArchivo(b: Base, id: string) {
  const yo = b.perfiles.find((p) => p.id === b.yo && p.activo);
  const archivo = b.archivos.find((a) => a.id === id);
  if (!archivo) throw new ErrorFlujo("no_existe");
  if (!yo || (yo.rol !== "admin" && archivo.subidoPor !== yo.id)) throw new ErrorFlujo("permiso");
  // Una tarea archivada no se modifica: tampoco se le quitan archivos.
  if (b.tareas.some((t) => t.id === archivo.tareaId && t.archivada)) throw new ErrorFlujo("archivada");
  b.archivos = b.archivos.filter((a) => a.id !== id);
}

export function guardarObra(b: Base, id: string | null, nombre: string, detalle: string, activa: boolean) {
  administrador(b);
  if (nombre.trim().length < 2 || nombre.trim().length > 80) throw new ErrorFlujo("nombre");
  if (!id) {
    const obra: Obra = { id: `o${++b.sec}`, nombre: nombre.trim(), detalle: detalle.trim(), activa: true };
    b.obras.push(obra);
    return obra.id;
  }
  const obra = b.obras.find((o) => o.id === id);
  if (!obra) throw new ErrorFlujo("no_existe");
  Object.assign(obra, { nombre: nombre.trim(), detalle: detalle.trim(), activa });
  return id;
}

export function borrarObra(b: Base, id: string) {
  administrador(b);
  if (b.tareas.some((t) => t.obraId === id)) throw new ErrorFlujo("con_tareas");
  b.obras = b.obras.filter((o) => o.id !== id);
  b.clientes = b.clientes.filter((c) => c.obraId !== id);
}

/**
 * Invita a un cliente a una obra y devuelve su código de invitación (vacío si ya
 * tenía cuenta). Si ese correo ya es de un cliente, solo lo une a la obra.
 */
export function invitarCliente(b: Base, obraId: string, nombre: string, email: string) {
  administrador(b);
  if (!b.obras.some((o) => o.id === obraId)) throw new ErrorFlujo("obra");
  const correo = email.trim().toLowerCase();
  if (!/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(correo)) throw new ErrorFlujo("email");
  let perfil = b.perfiles.find((p) => p.email === correo);
  if (perfil && perfil.rol !== "cliente") throw new ErrorFlujo("duplicado");
  if (!perfil) {
    if (nombre.trim().length < 2 || nombre.trim().length > 80) throw new ErrorFlujo("nombre");
    perfil = {
      id: `c${++b.sec}`,
      userId: null,
      email: correo,
      nombre: nombre.trim(),
      rol: "cliente",
      activo: true,
      codigo: `DEMO${String(b.sec).padStart(6, "0")}`,
      invitacionVence: venceEn(DIAS_INVITACION),
      creado: ahoraIso(),
    };
    b.perfiles.push(perfil);
  } else if (!perfil.userId && (!perfil.invitacionVence || new Date(perfil.invitacionVence) <= new Date())) {
    // Todavía no activó su cuenta y su código venció: se le da uno nuevo para que el enlace sirva.
    perfil.codigo = `DEMO${String(++b.sec).padStart(6, "0")}`;
    perfil.invitacionVence = venceEn(DIAS_INVITACION);
  }
  if (!b.clientes.some((c) => c.obraId === obraId && c.perfilId === perfil.id)) {
    b.clientes.push({ obraId, perfilId: perfil.id });
  }
  return perfil.codigo ?? "";
}

/** Quita a un cliente de una obra; si no le queda ninguna y no activó su cuenta, se va la invitación. */
export function quitarCliente(b: Base, obraId: string, perfilId: string) {
  administrador(b);
  if (!b.clientes.some((c) => c.obraId === obraId && c.perfilId === perfilId)) throw new ErrorFlujo("no_existe");
  b.clientes = b.clientes.filter((c) => !(c.obraId === obraId && c.perfilId === perfilId));
  if (!b.clientes.some((c) => c.perfilId === perfilId)) {
    b.perfiles = b.perfiles.filter((p) => !(p.id === perfilId && p.rol === "cliente" && !p.userId));
  }
}

/** Lo que ve un cliente: sus obras con las tareas resumidas y las fotos, sin nada interno. */
export function vistaCliente(b: Base): ObraCliente[] {
  return b.obras
    .filter((o) => b.clientes.some((c) => c.obraId === o.id && c.perfilId === b.yo))
    .map((o) => {
      const tareas = b.tareas.filter((t) => t.obraId === o.id && !t.archivada).sort((x, y) => x.numero - y.numero);
      const ids = new Set(tareas.map((t) => t.id));
      return {
        ...o,
        tareas: tareas.map((t) => ({
          id: t.id,
          numero: t.numero,
          titulo: t.titulo,
          etapa: etapaDe(t.estado),
          vence: t.vence,
          completada: t.completada,
          peso: t.peso ?? 1,
        })),
        archivos: b.archivos
          .filter((a) => ids.has(a.tareaId))
          .map((a) => ({ ...a, peso: 0, subidoPor: null, autor: "" })),
      };
    });
}

export function invitar(b: Base, nombre: string, email: string, rol: Rol) {
  administrador(b);
  const correo = email.trim().toLowerCase();
  if (!/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(correo)) throw new ErrorFlujo("email");
  if (nombre.trim().length < 2 || nombre.trim().length > 80) throw new ErrorFlujo("nombre");
  if (b.perfiles.some((p) => p.email === correo)) throw new ErrorFlujo("duplicado");
  const codigo = `DEMO${String(++b.sec).padStart(6, "0")}`;
  b.perfiles.push({
    id: `p${b.sec}`,
    userId: null,
    email: correo,
    nombre: nombre.trim(),
    rol,
    activo: true,
    codigo,
    invitacionVence: venceEn(DIAS_INVITACION),
    creado: ahoraIso(),
  });
  return codigo;
}

/** Renueva una invitación pendiente: código nuevo y otros siete días. Devuelve el código. */
export function renovarInvitacion(b: Base, id: string) {
  administrador(b);
  const perfil = b.perfiles.find((p) => p.id === id);
  if (!perfil) throw new ErrorFlujo("no_existe");
  if (perfil.userId) throw new ErrorFlujo("ya_activa");
  perfil.codigo = `DEMO${String(++b.sec).padStart(6, "0")}`;
  perfil.invitacionVence = venceEn(DIAS_INVITACION);
  return perfil.codigo;
}

export function actualizarPerfil(b: Base, id: string, nombre: string, rol: Rol, activo: boolean) {
  const admin = administrador(b);
  if (nombre.trim().length < 2 || nombre.trim().length > 80) throw new ErrorFlujo("nombre");
  const perfil = b.perfiles.find((p) => p.id === id);
  if (!perfil) throw new ErrorFlujo("no_existe");
  // El rol de cliente no se cambia desde Equipo, ni nadie del equipo pasa a ser cliente.
  if ((perfil.rol === "cliente") !== (rol === "cliente")) throw new ErrorFlujo("rol");
  const pierde = rol !== "admin" || !activo;
  if (perfil.id === admin.id && pierde) throw new ErrorFlujo("propio");
  const admins = b.perfiles.filter((p) => p.rol === "admin" && p.activo && p.userId).length;
  if (perfil.rol === "admin" && perfil.activo && perfil.userId && pierde && admins <= 1) {
    throw new ErrorFlujo("ultimo_admin");
  }
  Object.assign(perfil, { nombre: nombre.trim(), rol, activo });
}

export function quitarInvitacion(b: Base, id: string) {
  administrador(b);
  if (!b.perfiles.some((p) => p.id === id && !p.userId)) throw new ErrorFlujo("activa");
  for (const t of b.tareas) {
    if (t.asignadaA !== id) continue;
    // Como en la base de datos: las pendientes vuelven a borrador; las completadas y las
    // archivadas no se tocan, solo pierden al responsable porque ese perfil desaparece.
    if (!t.archivada && t.estado !== "completada") t.estado = "borrador";
    t.asignadaA = null;
  }
  b.perfiles = b.perfiles.filter((p) => p.id !== id);
  b.clientes = b.clientes.filter((c) => c.perfilId !== id);
}

// --- Contenido de muestra ---------------------------------------------------

type Par = [es: string, en: string];
type PasoDemo = [accion: Accion, diasAtras: number, nota?: Par];
/** Foto de muestra (Unsplash, licencia libre): quién la sube y hace cuántos días. */
type FotoDemo = [id: string, nombre: Par, de: "admin" | "responsable", diasAtras: number];
type TareaDemo = {
  titulo: Par;
  descripcion: Par;
  prioridad: Tarea["prioridad"];
  /** Días desde hoy hasta la fecha límite; negativo si ya pasó. */
  vence: number | null;
  /** Posición en el equipo (1 a 3), o 0 si queda sin asignar. */
  para: number;
  /** Posición de la obra (1 a 3). */
  obra: number;
  creada: number;
  pasos: PasoDemo[];
  fotos?: FotoDemo[];
};

const OBRAS: [nombre: Par, detalle: Par][] = [
  [
    ["Local Calle 85", "85th Street shop"],
    ["Local comercial · Calle 85 # 12-40", "Retail unit · 85th Street"],
  ],
  [
    ["Apartamento Rosales 402", "Rosales apartment 402"],
    ["Remodelación de cocina y baños", "Kitchen and bathroom remodel"],
  ],
  [
    ["Casa Cedritos", "Cedritos house"],
    ["Pisos, pintura y terraza", "Floors, paint and terrace"],
  ],
];

const TAREAS: TareaDemo[] = [
  {
    titulo: ["Demoler el muro de la cocina", "Demolish the kitchen wall"],
    descripcion: [
      "Tumbar el muro que separa cocina y comedor. Cuidado con la tubería de gas del costado izquierdo.",
      "Take down the wall between kitchen and dining room. Mind the gas pipe on the left side.",
    ],
    prioridad: "alta",
    vence: -10,
    para: 1,
    obra: 2,
    creada: 18,
    pasos: [
      ["aceptar", 17],
      ["iniciar", 16],
      ["enviar", 13, ["Muro abajo y escombro retirado.", "Wall down and debris removed."]],
      ["aprobar", 12],
    ],
  },
  {
    titulo: ["Instalar drywall del cielo raso", "Install the drywall ceiling"],
    descripcion: [
      "Cielo raso en drywall para toda el área de ventas, a 2,80 m. Dejar listas las salidas de las lámparas.",
      "Drywall ceiling across the sales floor, at 2.80 m. Leave the lamp outlets ready.",
    ],
    prioridad: "media",
    vence: -6,
    para: 2,
    obra: 1,
    creada: 12,
    pasos: [
      ["aceptar", 11],
      ["iniciar", 9],
      ["enviar", 5, ["Terminado. Faltó masillar una junta, quedó para mañana.", "Done. One joint still needs filler, left for tomorrow."]],
      ["aprobar", 5, ["Quedó bien. Gracias.", "Looks good. Thanks."]],
    ],
  },
  {
    titulo: ["Pintar sala y comedor", "Paint the living and dining room"],
    descripcion: [
      "Dos manos de blanco hueso en paredes y blanco puro en techos. Proteger el piso de madera.",
      "Two coats of off-white on walls and pure white on ceilings. Protect the wooden floor.",
    ],
    prioridad: "media",
    vence: -3,
    para: 3,
    obra: 3,
    creada: 10,
    pasos: [
      ["aceptar", 9],
      ["iniciar", 8],
      ["enviar", 5],
      ["revisar", 4],
      ["aprobar", 4, ["Muy buen acabado.", "Very good finish."]],
    ],
    fotos: [["1717281234297-3def5ae3eee1", ["Pintura del techo.jpg", "Ceiling painting.jpg"], "responsable", 5]],
  },
  {
    titulo: ["Enchapar el baño principal", "Tile the main bathroom"],
    descripcion: [
      "Enchape de piso y paredes con la cerámica gris que ya está en obra. Juntas de 2 mm.",
      "Tile floor and walls with the grey ceramic already on site. 2 mm joints.",
    ],
    prioridad: "urgente",
    vence: -1,
    para: 1,
    obra: 2,
    creada: 5,
    pasos: [
      ["aceptar", 5],
      ["iniciar", 3],
    ],
  },
  {
    titulo: ["Instalar puntos eléctricos de la barra", "Install the electrical points for the bar"],
    descripcion: [
      "Seis tomas dobles y dos salidas para lámparas colgantes, según el plano adjunto.",
      "Six double sockets and two outlets for pendant lamps, as shown in the attached plan.",
    ],
    prioridad: "alta",
    vence: 0,
    para: 2,
    obra: 1,
    creada: 6,
    pasos: [
      ["aceptar", 6],
      ["iniciar", 4],
      ["enviar", 2],
      ["devolver", 1, ["Faltan las dos salidas de las lámparas. Revisa el plano y vuelve a enviar.", "The two lamp outlets are missing. Check the plan and submit again."]],
    ],
    fotos: [["1721244654394-36a7bc2da288", ["Plano.jpg", "Plan.jpg"], "admin", 6]],
  },
  {
    titulo: ["Cotizar el piso laminado", "Quote the laminate flooring"],
    descripcion: [
      "Son 62 m². Pedir precio en dos proveedores, con instalación y guardaescobas.",
      "It is 62 m². Get prices from two suppliers, including installation and skirting.",
    ],
    prioridad: "alta",
    vence: 1,
    para: 1,
    obra: 3,
    creada: 3,
    pasos: [
      ["aceptar", 2],
      ["iniciar", 1],
    ],
  },
  {
    titulo: ["Fotos del avance de la fachada", "Progress photos of the shop front"],
    descripcion: [
      "Tomar fotos de la fachada ya con el vidrio instalado, de frente y desde la esquina.",
      "Take photos of the front with the glass installed, head-on and from the corner.",
    ],
    prioridad: "media",
    vence: 2,
    para: 2,
    obra: 1,
    creada: 4,
    pasos: [
      ["aceptar", 4],
      ["iniciar", 2],
      ["enviar", 0, ["Subí dos fotos. El vidrio de la izquierda llega el jueves.", "I uploaded two photos. The left glass panel arrives on Thursday."]],
    ],
    fotos: [
      ["1704742950992-9815a104820c", ["Estructura interior.jpg", "Interior framing.jpg"], "responsable", 0],
      ["1736182615481-3795ea557614", ["Avance del local.jpg", "Shop progress.jpg"], "responsable", 0],
    ],
  },
  {
    titulo: ["Cambiar la grifería de la cocina", "Replace the kitchen taps"],
    descripcion: [
      "Cambiar la grifería del lavaplatos y revisar que no haya fugas en el sifón.",
      "Replace the sink taps and check the trap for leaks.",
    ],
    prioridad: "media",
    vence: 3,
    para: 3,
    obra: 2,
    creada: 2,
    pasos: [
      [
        "aclarar",
        1,
        ["¿Instalo la grifería que dejó el cliente o hay que comprar una nueva?", "Do I install the taps the client left, or do we buy new ones?"],
      ],
    ],
  },
  {
    titulo: ["Resanar y estucar paredes", "Patch and plaster the walls"],
    descripcion: [
      "Resanar grietas del segundo piso y estucar las tres habitaciones antes de pintar.",
      "Patch the cracks on the second floor and plaster the three bedrooms before painting.",
    ],
    prioridad: "media",
    vence: 4,
    para: 3,
    obra: 3,
    creada: 5,
    pasos: [
      ["aceptar", 5],
      ["iniciar", 4],
      ["enviar", 1, ["Listas las tres habitaciones.", "All three bedrooms are done."]],
      ["revisar", 0],
    ],
    fotos: [["1618832515490-e181c4794a45", ["Protección antes de pintar.jpg", "Covered before painting.jpg"], "responsable", 1]],
  },
  {
    titulo: ["Instalar las puertas de vidrio", "Install the glass doors"],
    descripcion: [
      "Dos puertas batientes de vidrio templado en la entrada. El proveedor entrega el miércoles en la mañana.",
      "Two tempered-glass swing doors at the entrance. The supplier delivers on Wednesday morning.",
    ],
    prioridad: "media",
    vence: 5,
    para: 2,
    obra: 1,
    creada: 0,
    pasos: [],
  },
  {
    titulo: ["Impermeabilizar la terraza", "Waterproof the terrace"],
    descripcion: [
      "Limpiar, aplicar manto líquido en dos capas y probar con agua durante 24 horas.",
      "Clean, apply two coats of liquid membrane and water-test for 24 hours.",
    ],
    prioridad: "media",
    vence: 7,
    para: 1,
    obra: 3,
    creada: 1,
    pasos: [["aceptar", 1]],
  },
  {
    titulo: ["Comprar materiales de plomería", "Buy the plumbing materials"],
    descripcion: [
      "Lista pendiente: tubería de media, codos, uniones y dos válvulas de paso.",
      "Pending list: half-inch pipe, elbows, couplings and two stop valves.",
    ],
    prioridad: "baja",
    vence: 12,
    para: 0,
    obra: 2,
    creada: 1,
    pasos: [],
  },
];

const fotoDemo = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=70`;

/** Arma el equipo, las obras y las tareas de muestra con fechas relativas a hoy. */
export function semilla(idioma: "es" | "en", hoy: string): Base {
  const i = idioma === "es" ? 0 : 1;
  const persona = (id: string, nombre: string, rol: Rol, activa = true): Perfil => ({
    id,
    userId: activa ? `u-${id}` : null,
    email: `${nombre.split(" ")[0].toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")}@ejemplo.com`,
    nombre,
    rol,
    activo: true,
    codigo: activa ? null : `DEMO${id.toUpperCase()}INVITA`,
    // Las invitaciones de ejemplo llevan cuatro días enviadas: les quedan tres.
    invitacionVence: activa ? null : venceEn(DIAS_INVITACION - 4),
    creado: `${sumarDias(hoy, -30)}T14:00:00.000Z`,
  });
  const b: Base = {
    yo: "admin",
    perfiles: [
      persona("admin", "Laura Restrepo", "admin"),
      persona("p1", "Camilo Vargas", "empleado"),
      persona("p2", "Daniela Ortiz", "empleado"),
      persona("p3", "Andrés Peña", "empleado"),
      persona("p4", "Sofía Mejía", "empleado", false),
      persona("c1", "Marcela Gómez", "cliente"),
      persona("c2", "Jorge Salazar", "cliente", false),
    ],
    obras: OBRAS.map(([nombre, detalle], n) => ({ id: `o${n + 1}`, nombre: nombre[i], detalle: detalle[i], activa: true })),
    tareas: [],
    eventos: [],
    archivos: [],
    // Marcela sigue el local; Jorge fue invitado al apartamento y aún no activa su cuenta.
    clientes: [
      { obraId: "o1", perfilId: "c1" },
      { obraId: "o2", perfilId: "c2" },
    ],
    sec: 0,
  };
  // La hora avanza con cada paso para que el historial quede en orden.
  let minuto = 0;
  const momento = (diasAtras: number) =>
    diasAtras === 0
      ? // Lo de hoy pasó hace un rato, nunca en el futuro.
        new Date(Date.now() - (180 - minuto++) * 60_000).toISOString()
      : `${sumarDias(hoy, -diasAtras)}T${String(13 + (minuto % 6)).padStart(2, "0")}:${String((minuto++ * 7) % 60).padStart(2, "0")}:00.000Z`;

  for (const d of TAREAS) {
    const responsable = `p${d.para}`;
    b.yo = "admin";
    const id = guardarTarea(
      b,
      {
        titulo: d.titulo[i],
        descripcion: d.descripcion[i],
        prioridad: d.prioridad,
        vence: d.vence === null ? null : sumarDias(hoy, d.vence),
        asignadaA: d.para ? responsable : null,
        obraId: `o${d.obra}`,
      },
      null,
      momento(d.creada),
    );
    // Los pasos y las fotos se aplican en orden de fecha, del más viejo al más reciente.
    const sucesos = [
      ...d.pasos.map(([accion, dias, nota]) => ({ dias, orden: 1, hacer: () => {
        b.yo = REGLAS[accion].quien === "admin" ? "admin" : responsable;
        actuar(b, id, accion, nota?.[i] ?? "", momento(dias));
      } })),
      ...(d.fotos ?? []).map(([foto, nombre, de, dias]) => ({ dias, orden: 0, hacer: () => {
        b.yo = de === "admin" ? "admin" : responsable;
        adjuntar(b, id, { nombre: nombre[i], tipo: "image/jpeg", peso: 240_000, url: fotoDemo(foto) }, momento(dias));
      } })),
    ].sort((x, y) => y.dias - x.dias || x.orden - y.orden);
    for (const s of sucesos) s.hacer();
  }
  // Lo más reciente primero, como lo entrega la base de datos.
  b.eventos.sort((x, y) => y.fecha.localeCompare(x.fecha));
  b.tareas.sort((x, y) => y.numero - x.numero);
  b.yo = "admin";
  return b;
}
