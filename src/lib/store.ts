"use client";

import type { Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import * as demo from "./demo";
import { fechaLocal } from "./fechas";
import { ErrorFlujo } from "./flujo";
import { supabase } from "./supabase";
import { idiomaActual } from "./textos";
import type { Accion, DatosTarea, Evento, Fallo, Perfil, Rol, Tarea } from "./types";

// Estado compartido. Con sesión, los datos vienen de Supabase y cada cambio pasa
// por una función de la base de datos; en el modo de muestra todo ocurre en la
// pestaña (ver demo.ts). Las pantallas no distinguen entre uno y otro.

export type State = {
  /** Ya se sabe si hay sesión o no. */
  listo: boolean;
  /** Correo de la sesión, tenga o no acceso. */
  email: string | null;
  /** Perfil activo de quien usa la aplicación; nulo si no ha entrado o no tiene acceso. */
  perfil: Perfil | null;
  desactivada: boolean;
  demo: boolean;
  /** Las tareas ya llegaron. */
  cargado: boolean;
  error: boolean;
  tareas: Tarea[];
  eventos: Evento[];
  perfiles: Perfil[];
};

const initial: State = {
  listo: false,
  email: null,
  perfil: null,
  desactivada: false,
  demo: false,
  cargado: false,
  error: false,
  tareas: [],
  eventos: [],
  perfiles: [],
};

let state = initial;
let started = false;
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  if (!started) {
    started = true;
    start();
  }
  return state;
}

export function useStore() {
  return useSyncExternalStore(subscribe, getSnapshot, () => initial);
}

// --- Modo de muestra --------------------------------------------------------

const CLAVE_DEMO = "relevo-muestra";
let base: demo.Base | null = null;

function leerDemo(): demo.Base | null {
  try {
    const guardado = window.sessionStorage.getItem(CLAVE_DEMO);
    return guardado ? (JSON.parse(guardado) as demo.Base) : null;
  } catch {
    return null;
  }
}

/** Publica la muestra con lo que vería esa persona, igual que lo filtraría la base de datos. */
function ponerDemo(b: demo.Base) {
  base = b;
  try {
    window.sessionStorage.setItem(CLAVE_DEMO, JSON.stringify(b));
  } catch {
    // Sin almacenamiento la muestra dura hasta recargar.
  }
  const yo = b.perfiles.find((p) => p.id === b.yo) ?? null;
  const admin = yo?.rol === "admin";
  const tareas = admin ? b.tareas : b.tareas.filter((t) => t.asignadaA === b.yo);
  const visibles = new Set(tareas.map((t) => t.id));
  set({
    listo: true,
    demo: true,
    email: yo?.email ?? null,
    perfil: yo,
    desactivada: false,
    cargado: true,
    error: false,
    tareas,
    eventos: b.eventos.filter((e) => visibles.has(e.tareaId)),
    perfiles: admin ? b.perfiles : b.perfiles.filter((p) => p.id === b.yo),
  });
}

export function entrarDemo(rol: Rol) {
  const b = semillaDemo();
  b.yo = rol === "admin" ? "admin" : "p1";
  ponerDemo(b);
}

const semillaDemo = () => demo.semilla(idiomaActual(), fechaLocal());

/** Cambia la persona con la que se mira la muestra, sin perder lo hecho. */
export function verComo(perfilId: string) {
  if (base) ponerDemo({ ...base, yo: perfilId });
}

/** Personas con las que se puede mirar la muestra. */
export const personasDemo = () => base?.perfiles.filter((p) => p.userId && p.activo) ?? [];

export function salirDemo() {
  try {
    window.sessionStorage.removeItem(CLAVE_DEMO);
  } catch {
    // Nada que borrar.
  }
  // Al recargar ya no hay muestra: el panel devuelve a la entrada.
  window.location.reload();
}

// --- Carga con sesión -------------------------------------------------------

type FilaPerfil = {
  id: string;
  user_id: string | null;
  email: string;
  name: string;
  role: Rol;
  active: boolean;
  invite_code?: string | null;
  created_at: string;
};

const aPerfil = (f: FilaPerfil): Perfil => ({
  id: f.id,
  userId: f.user_id,
  email: f.email,
  nombre: f.name,
  rol: f.role,
  activo: f.active,
  codigo: f.invite_code ?? null,
  creado: f.created_at,
});

type FilaTarea = {
  id: string;
  number: number;
  title: string;
  description: string;
  priority: Tarea["prioridad"];
  due_date: string | null;
  assignee_id: string | null;
  status: Tarea["estado"];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const aTarea = (f: FilaTarea): Tarea => ({
  id: f.id,
  numero: f.number,
  titulo: f.title,
  descripcion: f.description,
  prioridad: f.priority,
  vence: f.due_date,
  asignadaA: f.assignee_id,
  estado: f.status,
  creada: f.created_at,
  actualizada: f.updated_at,
  completada: f.completed_at,
});

type FilaEvento = {
  id: number;
  task_id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: Rol;
  action: Evento["suceso"];
  from_status: Evento["de"];
  to_status: Evento["a"];
  note: string;
};

const aEvento = (f: FilaEvento): Evento => ({
  id: String(f.id),
  tareaId: f.task_id,
  fecha: f.created_at,
  actorId: f.actor_id,
  actor: f.actor_name,
  rol: f.actor_role,
  suceso: f.action,
  de: f.from_status,
  a: f.to_status,
  nota: f.note,
});

/** Trae tareas, historial y equipo. La base de datos entrega solo lo que esa persona puede ver. */
export async function recargar() {
  if (state.demo || !state.perfil) return;
  const [tareas, eventos, perfiles] = await Promise.all([
    supabase.from("tm_tasks").select("*").order("number", { ascending: false }),
    supabase.from("tm_events").select("*").order("id", { ascending: false }).limit(3000),
    supabase.from("tm_profiles").select("*").order("name"),
  ]);
  if (tareas.error || eventos.error || perfiles.error) return set({ cargado: true, error: true });
  set({
    cargado: true,
    error: false,
    tareas: (tareas.data as FilaTarea[]).map(aTarea),
    eventos: (eventos.data as FilaEvento[]).map(aEvento),
    perfiles: (perfiles.data as FilaPerfil[]).map(aPerfil),
  });
}

async function aplicarSesion(session: Session | null) {
  if (state.demo) return;
  if (!session) return set({ ...initial, listo: true });
  // La base de datos dice quién es: su perfil, o nada si no tiene acceso.
  const { data } = await supabase.rpc("tm_enter");
  const perfil = data ? aPerfil(data as FilaPerfil) : null;
  set({
    listo: true,
    email: session.user.email ?? "",
    perfil: perfil?.activo ? perfil : null,
    desactivada: Boolean(perfil && !perfil.activo),
  });
  await recargar();
}

function start() {
  const muestra = leerDemo();
  if (muestra) return ponerDemo(muestra);
  supabase.auth.onAuthStateChange((_event, session) => {
    // Las consultas van fuera del callback: dentro pueden bloquear al cliente de auth.
    setTimeout(() => void aplicarSesion(session), 0);
  });
  // Al volver a la pestaña se refresca, por si alguien más movió una tarea.
  window.addEventListener("focus", () => void recargar());
}

// --- Operaciones ------------------------------------------------------------

const FALLOS = new Set<string>([
  "permiso",
  "no_existe",
  "transicion",
  "nota",
  "titulo",
  "descripcion",
  "prioridad",
  "asignado",
  "completada",
  "email",
  "nombre",
  "rol",
  "duplicado",
  "propio",
  "ultimo_admin",
  "activa",
  "invitacion",
  "ya_activa",
  "sesion",
]);

async function rpc<T>(nombre: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(nombre, args);
  if (error) throw new ErrorFlujo(FALLOS.has(error.message) ? (error.message as Fallo) : "error");
  return data as T;
}

/** Ejecuta el cambio en la base de datos o en la muestra, y refresca lo que se ve. */
async function cambiar<T>(real: () => Promise<T>, enDemo: (b: demo.Base) => T): Promise<T> {
  if (state.demo && base) {
    const copia = structuredClone(base);
    const resultado = enDemo(copia);
    ponerDemo(copia);
    return resultado;
  }
  const resultado = await real();
  await recargar();
  return resultado;
}

/** Crea la tarea (sin `id`) o la edita. Devuelve su id. */
export const guardarTarea = (datos: DatosTarea, id: string | null = null) =>
  cambiar(
    () =>
      rpc<string>("tm_save_task", {
        p_id: id,
        p_title: datos.titulo,
        p_description: datos.descripcion,
        p_priority: datos.prioridad,
        p_due: datos.vence,
        p_assignee: datos.asignadaA,
      }),
    (b) => demo.guardarTarea(b, datos, id),
  );

export const borrarTarea = (id: string) =>
  cambiar(
    () => rpc<void>("tm_delete_task", { p_id: id }),
    (b) => demo.borrarTarea(b, id),
  );

/** Da un paso del flujo (aceptar, enviar, aprobar…) o deja un comentario. */
export const actuar = (id: string, accion: Accion, nota = "") =>
  cambiar(
    () => rpc<string>("tm_act", { p_task: id, p_action: accion, p_note: nota }).then(() => undefined),
    (b) => demo.actuar(b, id, accion, nota),
  );

/** Invita a una persona y devuelve su código de invitación. */
export const invitar = (nombre: string, email: string, rol: Rol) =>
  cambiar(
    () =>
      rpc<FilaPerfil>("tm_invite", { p_name: nombre, p_email: email, p_role: rol }).then(
        (fila) => fila.invite_code ?? "",
      ),
    (b) => demo.invitar(b, nombre, email, rol),
  );

export const actualizarPerfil = (id: string, nombre: string, rol: Rol, activo: boolean) =>
  cambiar(
    () => rpc<void>("tm_update_profile", { p_id: id, p_name: nombre, p_role: rol, p_active: activo }),
    (b) => demo.actualizarPerfil(b, id, nombre, rol, activo),
  );

export const quitarInvitacion = (id: string) =>
  cambiar(
    () => rpc<void>("tm_remove_invite", { p_id: id }),
    (b) => demo.quitarInvitacion(b, id),
  );

// --- Cuenta -----------------------------------------------------------------

export async function entrar(email: string, clave: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
  if (error) throw new ErrorFlujo(error.code === "email_not_confirmed" ? "confirmar" : "credenciales");
}

export async function salir() {
  await supabase.auth.signOut();
}

/** Nombre y correo de una invitación pendiente, o nulo si el código no sirve. */
export async function infoInvitacion(codigo: string) {
  const { data } = await supabase.rpc("tm_invite_info", { p_code: codigo });
  return (data as { name: string; email: string } | null) ?? null;
}

/** Une la sesión actual con su invitación y carga el perfil. */
export async function activarConSesion(codigo: string) {
  await rpc("tm_activate", { p_code: codigo });
  const { data } = await supabase.auth.getSession();
  await aplicarSesion(data.session);
}

/**
 * Crea la cuenta de una persona invitada con la contraseña que eligió y la activa.
 * Si el proyecto exige confirmar el correo, lanza "confirmar": la persona confirma
 * y repite el paso con la misma contraseña.
 */
export async function activar(codigo: string, email: string, clave: string) {
  if (clave.length < 8) throw new ErrorFlujo("clave");
  const alta = await supabase.auth.signUp({
    email,
    password: clave,
    options: { emailRedirectTo: `${window.location.origin}/activar?codigo=${encodeURIComponent(codigo)}` },
  });
  if (alta.error?.code === "weak_password") throw new ErrorFlujo("clave");
  if (!alta.data.session) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
    if (error) throw new ErrorFlujo("confirmar");
  }
  await activarConSesion(codigo);
}

/** Envía el correo para crear una contraseña nueva. */
export async function pedirClave(email: string) {
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/restablecer` });
}

export async function cambiarClave(clave: string) {
  if (clave.length < 8) throw new ErrorFlujo("clave");
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) throw new ErrorFlujo(error.code === "weak_password" ? "clave" : "error");
}
