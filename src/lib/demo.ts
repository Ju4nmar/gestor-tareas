import { sumarDias } from "./fechas";
import { ErrorFlujo, NOTA_MAXIMA, NOTA_MINIMA, REGLAS, puede } from "./flujo";
import type { Accion, DatosTarea, Estado, Evento, Perfil, Rol, Suceso, Tarea } from "./types";

// El modo de muestra: un equipo ficticio que vive en la pestaña del visitante.
// Estas funciones hacen lo mismo que las de la base de datos (supabase/schema.sql),
// con las mismas reglas de flujo.ts, pero sobre un objeto en memoria.

export type Base = {
  /** Perfil con el que se está viendo la muestra. */
  yo: string;
  perfiles: Perfil[];
  tareas: Tarea[];
  eventos: Evento[];
  /** Consecutivo para números de tarea e ids. */
  sec: number;
};

const ahoraIso = () => new Date().toISOString();

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
  if (titulo.length < 3 || titulo.length > 140) throw new ErrorFlujo("titulo");
  if (datos.descripcion.length > 5000) throw new ErrorFlujo("descripcion");
  const responsable = datos.asignadaA ? b.perfiles.find((p) => p.id === datos.asignadaA && p.activo) : null;
  if (datos.asignadaA && !responsable) throw new ErrorFlujo("asignado");

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
    };
    b.tareas.unshift(tarea);
    anotar(b, tarea.id, admin, "crear", null, "borrador", "", fecha);
    if (responsable) anotar(b, tarea.id, admin, "asignar", "borrador", "asignada", responsable.nombre, fecha);
    return tarea.id;
  }

  const tarea = b.tareas.find((t) => t.id === id);
  if (!tarea) throw new ErrorFlujo("no_existe");
  const movida = tarea.asignadaA !== datos.asignadaA;
  if (movida && tarea.estado === "completada") throw new ErrorFlujo("completada");
  const cambios = (["titulo", "descripcion", "prioridad", "vence"] as const).filter(
    (campo) => tarea[campo] !== (campo === "titulo" ? titulo : datos[campo]),
  );
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

export function borrarTarea(b: Base, id: string) {
  administrador(b);
  if (!b.tareas.some((t) => t.id === id)) throw new ErrorFlujo("no_existe");
  b.tareas = b.tareas.filter((t) => t.id !== id);
  b.eventos = b.eventos.filter((e) => e.tareaId !== id);
}

export function actuar(b: Base, id: string, accion: Accion, nota: string, fecha = ahoraIso()) {
  const yo = b.perfiles.find((p) => p.id === b.yo && p.activo);
  if (!yo) throw new ErrorFlujo("permiso");
  const tarea = b.tareas.find((t) => t.id === id);
  if (!tarea) throw new ErrorFlujo("no_existe");
  if (tarea.asignadaA !== yo.id && yo.rol !== "admin") throw new ErrorFlujo("permiso");
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
    creado: ahoraIso(),
  });
  return codigo;
}

export function actualizarPerfil(b: Base, id: string, nombre: string, rol: Rol, activo: boolean) {
  const admin = administrador(b);
  if (nombre.trim().length < 2 || nombre.trim().length > 80) throw new ErrorFlujo("nombre");
  const perfil = b.perfiles.find((p) => p.id === id);
  if (!perfil) throw new ErrorFlujo("no_existe");
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
    if (t.asignadaA === id && t.estado !== "completada") Object.assign(t, { asignadaA: null, estado: "borrador" });
  }
  b.perfiles = b.perfiles.filter((p) => p.id !== id);
}

// --- Contenido de muestra ---------------------------------------------------

type Par = [es: string, en: string];
type PasoDemo = [accion: Accion, diasAtras: number, nota?: Par];
type TareaDemo = {
  titulo: Par;
  descripcion: Par;
  prioridad: Tarea["prioridad"];
  /** Días desde hoy hasta la fecha límite; negativo si ya pasó. */
  vence: number | null;
  /** Posición en el equipo (1 a 3), o 0 si queda sin asignar. */
  para: number;
  creada: number;
  pasos: PasoDemo[];
};

const TAREAS: TareaDemo[] = [
  {
    titulo: ["Organizar el archivo de facturas", "Organise the invoice archive"],
    descripcion: [
      "Separar las facturas del año por mes y proveedor, y subir las escaneadas a la carpeta compartida.",
      "Sort this year's invoices by month and supplier, and upload the scanned ones to the shared folder.",
    ],
    prioridad: "baja",
    vence: -10,
    para: 2,
    creada: 18,
    pasos: [
      ["aceptar", 17],
      ["iniciar", 16],
      ["enviar", 13, ["Quedaron en la carpeta «Facturas 2026».", "They are in the “Invoices 2026” folder."]],
      ["aprobar", 12],
    ],
  },
  {
    titulo: ["Llamar a proveedores de empaques", "Call the packaging suppliers"],
    descripcion: [
      "Pedir tres cotizaciones de cajas y bolsas con el logo. Necesitamos precio por 500 y por 1.000 unidades.",
      "Get three quotes for branded boxes and bags. We need prices for 500 and for 1,000 units.",
    ],
    prioridad: "baja",
    vence: -6,
    para: 1,
    creada: 12,
    pasos: [
      ["aceptar", 11],
      ["iniciar", 9],
      ["enviar", 5, ["Adjunto las tres cotizaciones en el correo.", "The three quotes are attached in the email."]],
      ["aprobar", 5, ["Gracias. Nos quedamos con la segunda.", "Thanks. We are going with the second one."]],
    ],
  },
  {
    titulo: ["Informe de ventas de septiembre", "September sales report"],
    descripcion: [
      "Ventas por línea de producto y por vendedor, comparadas con agosto. Una página, con las tres conclusiones arriba.",
      "Sales by product line and by salesperson, compared with August. One page, with the three takeaways at the top.",
    ],
    prioridad: "media",
    vence: -3,
    para: 3,
    creada: 10,
    pasos: [
      ["aceptar", 9],
      ["iniciar", 8],
      ["enviar", 5],
      ["revisar", 4],
      ["aprobar", 4, ["Muy claro. Lo presento el lunes.", "Very clear. I will present it on Monday."]],
    ],
  },
  {
    titulo: ["Conciliar la caja de la semana", "Reconcile this week's cash register"],
    descripcion: [
      "Cuadrar los cierres diarios contra los extractos del banco y dejar anotadas las diferencias.",
      "Match the daily closings against the bank statements and note any differences.",
    ],
    prioridad: "urgente",
    vence: -1,
    para: 1,
    creada: 5,
    pasos: [
      ["aceptar", 5],
      ["iniciar", 3],
    ],
  },
  {
    titulo: ["Inventario de bodega", "Warehouse stock count"],
    descripcion: [
      "Contar las referencias de la estantería A y B y actualizar la hoja de inventario.",
      "Count the items on shelves A and B and update the stock sheet.",
    ],
    prioridad: "alta",
    vence: 0,
    para: 2,
    creada: 6,
    pasos: [
      ["aceptar", 6],
      ["iniciar", 4],
      ["enviar", 2],
      ["devolver", 1, ["Falta la estantería B completa. Revísala y vuelve a enviar.", "Shelf B is missing entirely. Check it and submit again."]],
    ],
  },
  {
    titulo: ["Cotización para Ferretería El Roble", "Quote for El Roble Hardware"],
    descripcion: [
      "Piden 40 cajas de tornillería surtida y entrega en dos semanas. Incluir el descuento por volumen.",
      "They want 40 boxes of assorted screws delivered in two weeks. Include the volume discount.",
    ],
    prioridad: "alta",
    vence: 1,
    para: 1,
    creada: 3,
    pasos: [
      ["aceptar", 2],
      ["iniciar", 1],
    ],
  },
  {
    titulo: ["Fotos del nuevo local para redes", "Photos of the new shop for social media"],
    descripcion: [
      "Diez fotos del local ya organizado: fachada, vitrina y mostrador. Con buena luz, en la mañana.",
      "Ten photos of the finished shop: front, window and counter. In good morning light.",
    ],
    prioridad: "media",
    vence: 2,
    para: 2,
    creada: 4,
    pasos: [
      ["aceptar", 4],
      ["iniciar", 2],
      ["enviar", 0, ["Subí 14 fotos a la carpeta. Las mejores son la 3, la 7 y la 11.", "I uploaded 14 photos to the folder. The best are 3, 7 and 11."]],
    ],
  },
  {
    titulo: ["Actualizar la lista de precios", "Update the price list"],
    descripcion: [
      "Subir los precios de la línea de pinturas según la nueva lista del proveedor.",
      "Raise the prices of the paint line according to the supplier's new list.",
    ],
    prioridad: "alta",
    vence: 3,
    para: 3,
    creada: 2,
    pasos: [
      [
        "aclarar",
        1,
        ["¿El aumento aplica también para los pedidos que ya están cotizados?", "Does the increase also apply to orders that are already quoted?"],
      ],
    ],
  },
  {
    titulo: ["Diseñar el volante de descuentos", "Design the discount flyer"],
    descripcion: [
      "Volante media carta para la promoción de fin de mes. Usar los colores de la marca y dejar espacio para el código QR.",
      "Half-letter flyer for the end-of-month promotion. Use the brand colours and leave room for the QR code.",
    ],
    prioridad: "media",
    vence: 4,
    para: 3,
    creada: 5,
    pasos: [
      ["aceptar", 5],
      ["iniciar", 4],
      ["enviar", 1, ["Van dos versiones: una clara y una oscura.", "Two versions: one light and one dark."]],
      ["revisar", 0],
    ],
  },
  {
    titulo: ["Publicar el catálogo de noviembre", "Publish the November catalogue"],
    descripcion: [
      "Cargar los productos nuevos en la tienda en línea, con foto, precio y existencias.",
      "Load the new products into the online store, with photo, price and stock.",
    ],
    prioridad: "media",
    vence: 5,
    para: 2,
    creada: 0,
    pasos: [],
  },
  {
    titulo: ["Capacitación de la nueva cajera", "Train the new cashier"],
    descripcion: [
      "Dos mañanas: apertura y cierre de caja, devoluciones y el sistema de facturación.",
      "Two mornings: opening and closing the register, returns and the invoicing system.",
    ],
    prioridad: "media",
    vence: 7,
    para: 1,
    creada: 1,
    pasos: [["aceptar", 1]],
  },
  {
    titulo: ["Renovar el dominio del sitio", "Renew the website domain"],
    descripcion: [
      "Vence el mes que viene. Revisar si conviene pagar dos años.",
      "It expires next month. Check whether paying for two years is worth it.",
    ],
    prioridad: "baja",
    vence: 12,
    para: 0,
    creada: 1,
    pasos: [],
  },
];

/** Arma el equipo y las tareas de muestra con fechas relativas a hoy. */
export function semilla(idioma: "es" | "en", hoy: string): Base {
  const i = idioma === "es" ? 0 : 1;
  const persona = (id: string, nombre: string, rol: Rol, activa = true): Perfil => ({
    id,
    userId: activa ? `u-${id}` : null,
    email: `${nombre.split(" ")[0].toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")}@ejemplo.com`,
    nombre,
    rol,
    activo: true,
    codigo: activa ? null : "DEMOSOFIA1",
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
    ],
    tareas: [],
    eventos: [],
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
    b.yo = "admin";
    const id = guardarTarea(
      b,
      {
        titulo: d.titulo[i],
        descripcion: d.descripcion[i],
        prioridad: d.prioridad,
        vence: d.vence === null ? null : sumarDias(hoy, d.vence),
        asignadaA: d.para ? `p${d.para}` : null,
      },
      null,
      momento(d.creada),
    );
    for (const [accion, diasAtras, nota] of d.pasos) {
      b.yo = REGLAS[accion].quien === "admin" ? "admin" : `p${d.para}`;
      actuar(b, id, accion, nota?.[i] ?? "", momento(diasAtras));
    }
  }
  // Lo más reciente primero, como lo entrega la base de datos.
  b.eventos.sort((x, y) => y.fecha.localeCompare(x.fecha));
  b.tareas.sort((x, y) => y.numero - x.numero);
  b.yo = "admin";
  return b;
}
