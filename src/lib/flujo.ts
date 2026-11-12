import type { Accion, Estado, Etapa, Fallo, Perfil, Prioridad, Tarea } from "./types";

// Las reglas del flujo de trabajo. La base de datos aplica estas mismas reglas
// (función tm_act en supabase/schema.sql): aquí sirven para mostrar solo los
// botones que corresponden y para el modo de muestra.

/** Estados en el orden en que avanza una tarea. */
export const ESTADOS: Estado[] = [
  "borrador",
  "asignada",
  "aclaracion",
  "aceptada",
  "en_curso",
  "enviada",
  "en_revision",
  "devuelta",
  "completada",
];

export const PRIORIDADES: Prioridad[] = ["baja", "media", "alta", "urgente"];

type Regla = {
  /** Quién puede dar el paso: la persona responsable o un administrador. */
  quien: "responsable" | "admin" | "ambos";
  desde: Estado[] | "cualquiera";
  /** Estado en que queda la tarea; nulo si no cambia. */
  hacia: Estado | null;
  nota: "obligatoria" | "opcional" | "no";
};

export const REGLAS: Record<Accion, Regla> = {
  aceptar: { quien: "responsable", desde: ["asignada"], hacia: "aceptada", nota: "no" },
  aclarar: {
    quien: "responsable",
    desde: ["asignada", "aceptada", "en_curso", "devuelta"],
    hacia: "aclaracion",
    nota: "obligatoria",
  },
  iniciar: { quien: "responsable", desde: ["aceptada", "devuelta"], hacia: "en_curso", nota: "no" },
  enviar: { quien: "responsable", desde: ["en_curso"], hacia: "enviada", nota: "opcional" },
  responder: { quien: "admin", desde: ["aclaracion"], hacia: "asignada", nota: "obligatoria" },
  revisar: { quien: "admin", desde: ["enviada"], hacia: "en_revision", nota: "no" },
  aprobar: { quien: "admin", desde: ["enviada", "en_revision"], hacia: "completada", nota: "opcional" },
  devolver: { quien: "admin", desde: ["enviada", "en_revision"], hacia: "devuelta", nota: "obligatoria" },
  reabrir: { quien: "admin", desde: ["completada"], hacia: "devuelta", nota: "obligatoria" },
  comentar: { quien: "ambos", desde: "cualquiera", hacia: null, nota: "obligatoria" },
};

export const NOTA_MINIMA = 3;
export const NOTA_MAXIMA = 2000;

/** Si esa persona puede dar ese paso en esa tarea. */
export function puede(accion: Accion, tarea: Tarea, perfil: Perfil) {
  const regla = REGLAS[accion];
  const responsable = tarea.asignadaA === perfil.id;
  const admin = perfil.rol === "admin";
  if (!responsable && !admin) return false;
  if (regla.quien === "responsable" && !responsable) return false;
  if (regla.quien === "admin" && !admin) return false;
  return regla.desde === "cualquiera" || regla.desde.includes(tarea.estado);
}

/** Pasos que cambian el estado y que esa persona puede dar ahora, en orden de importancia. */
export const pasosDisponibles = (tarea: Tarea, perfil: Perfil) =>
  (["aceptar", "iniciar", "enviar", "aprobar", "revisar", "responder", "devolver", "aclarar", "reabrir"] as Accion[]).filter(
    (a) => puede(a, tarea, perfil),
  );

/** Días que faltan para la fecha límite: negativo si ya pasó, nulo si no tiene. */
export function diasRestantes(tarea: Pick<Tarea, "vence">, hoy: string) {
  if (!tarea.vence || !hoy) return null;
  const dia = (f: string) => {
    const [y, m, d] = f.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((dia(tarea.vence) - dia(hoy)) / 86_400_000);
}

/**
 * Días que le quedan a una invitación pendiente: 0 es "vence hoy" y un número negativo,
 * que ya venció. Nulo si no hay fecha o si todavía no se sabe qué día es hoy.
 */
export function diasInvitacion(vence: string | null, hoy: string) {
  if (!vence || !hoy) return null;
  const fecha = new Date(vence);
  const [y, m, d] = hoy.split("-").map(Number);
  return Math.round((Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) - Date.UTC(y, m - 1, d)) / 86_400_000);
}

export const abierta = (tarea: Tarea) => tarea.estado !== "completada";

/** Vencida: pasó su fecha límite y aún no está completada. */
export function vencida(tarea: Tarea, hoy: string) {
  const dias = diasRestantes(tarea, hoy);
  return abierta(tarea) && dias !== null && dias < 0;
}

/** Vence hoy o en los próximos `dias` días. */
export function proxima(tarea: Tarea, hoy: string, dias = 3) {
  const faltan = diasRestantes(tarea, hoy);
  return abierta(tarea) && faltan !== null && faltan >= 0 && faltan <= dias;
}

/** Estados en que la tarea espera algo del administrador. */
export const ESPERA_ADMIN: Estado[] = ["aclaracion", "enviada", "en_revision"];
/** Estados en que la tarea espera algo de su responsable. */
export const ESPERA_RESPONSABLE: Estado[] = ["asignada", "aceptada", "en_curso", "devuelta"];

/** Código corto de una tarea: "T-042". */
export const codigoTarea = (numero: number) => `T-${String(numero).padStart(3, "0")}`;

/** Operación rechazada: lleva la clave del motivo para mostrar el texto en el idioma elegido. */
/** Estado que ve el cliente: resume el flujo interno en tres etapas. */
export const etapaDe = (estado: Estado): Etapa =>
  estado === "completada"
    ? "terminada"
    : (["en_curso", "enviada", "en_revision", "devuelta"] as Estado[]).includes(estado)
      ? "en_proceso"
      : "pendiente";

export const ETAPAS: Etapa[] = ["en_proceso", "pendiente", "terminada"];

export class ErrorFlujo extends Error {
  constructor(public fallo: Fallo) {
    super(fallo);
  }
}
