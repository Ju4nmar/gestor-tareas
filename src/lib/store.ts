"use client";

import type { Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import * as demo from "./demo";
import { fechaLocal } from "./fechas";
import { ErrorFlujo } from "./flujo";
import { supabase } from "./supabase";
import { idiomaActual } from "./textos";
import type {
  Accion,
  Archivo,
  ClienteObra,
  DatosTarea,
  Etapa,
  Evento,
  Fallo,
  Obra,
  ObraCliente,
  Perfil,
  Rol,
  Tarea,
} from "./types";

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
  /** Tareas archivadas; solo las recibe el administrador. */
  archivadas: Tarea[];
  eventos: Evento[];
  perfiles: Perfil[];
  obras: Obra[];
  archivos: Archivo[];
  /** Clientes invitados a cada obra; solo lo recibe el administrador. */
  clientes: ClienteObra[];
  /** Lo que ve quien entra como cliente: sus obras con tareas resumidas y fotos. */
  seguimiento: ObraCliente[];
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
  archivadas: [],
  eventos: [],
  perfiles: [],
  obras: [],
  archivos: [],
  clientes: [],
  seguimiento: [],
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
    const b = guardado ? (JSON.parse(guardado) as demo.Base) : null;
    // Una muestra guardada antes de que hubiera clientes: se empieza de nuevo.
    return b && Array.isArray(b.clientes) ? b : null;
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
  // El cliente no recibe tareas ni historial: solo el resumen de sus obras.
  // Las archivadas solo las ve el administrador, y van aparte de las activas.
  const activas = b.tareas.filter((t) => !t.archivada);
  const tareas = admin ? activas : activas.filter((t) => t.asignadaA === b.yo);
  const archivadas = admin ? b.tareas.filter((t) => t.archivada) : [];
  const visibles = new Set([...tareas, ...archivadas].map((t) => t.id));
  set({
    listo: true,
    demo: true,
    email: yo?.email ?? null,
    perfil: yo,
    desactivada: false,
    cargado: true,
    error: false,
    tareas,
    archivadas,
    eventos: b.eventos.filter((e) => visibles.has(e.tareaId)),
    perfiles: admin ? b.perfiles : b.perfiles.filter((p) => p.id === b.yo),
    obras: admin ? b.obras : b.obras.filter((o) => tareas.some((t) => t.obraId === o.id)),
    archivos: b.archivos.filter((a) => visibles.has(a.tareaId)),
    clientes: admin ? b.clientes : [],
    seguimiento: yo?.rol === "cliente" ? demo.vistaCliente(b) : [],
  });
}

export function entrarDemo(rol: Rol) {
  const b = semillaDemo();
  b.yo = rol === "admin" ? "admin" : rol === "cliente" ? "c1" : "p1";
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
  project_id: string | null;
  status: Tarea["estado"];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
};

const aTarea = (f: FilaTarea): Tarea => ({
  id: f.id,
  numero: f.number,
  titulo: f.title,
  descripcion: f.description,
  prioridad: f.priority,
  vence: f.due_date,
  asignadaA: f.assignee_id,
  obraId: f.project_id,
  estado: f.status,
  creada: f.created_at,
  actualizada: f.updated_at,
  completada: f.completed_at,
  archivada: f.archived_at,
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

type FilaObra = { id: string; name: string; detail: string; active: boolean };

const aObra = (f: FilaObra): Obra => ({ id: f.id, nombre: f.name, detalle: f.detail, activa: f.active });

type FilaArchivo = {
  id: string;
  task_id: string;
  path: string;
  name: string;
  mime: string;
  size: number;
  uploaded_by: string | null;
  uploader_name: string;
  created_at: string;
};

const aArchivo = (f: FilaArchivo): Archivo => ({
  id: f.id,
  tareaId: f.task_id,
  ruta: f.path,
  nombre: f.name,
  tipo: f.mime,
  peso: f.size,
  subidoPor: f.uploaded_by,
  autor: f.uploader_name,
  fecha: f.created_at,
});

type FilaSeguimiento = FilaObra & {
  tasks: { id: string; number: number; title: string; stage: Etapa; due_date: string | null; completed_at: string | null }[];
  files: { id: string; task_id: string; path: string; name: string; mime: string; created_at: string }[];
};

const aSeguimiento = (f: FilaSeguimiento): ObraCliente => ({
  ...aObra(f),
  tareas: f.tasks.map((t) => ({
    id: t.id,
    numero: t.number,
    titulo: t.title,
    etapa: t.stage,
    vence: t.due_date,
    completada: t.completed_at,
  })),
  archivos: f.files.map((a) => ({
    id: a.id,
    tareaId: a.task_id,
    ruta: a.path,
    nombre: a.name,
    tipo: a.mime,
    peso: 0,
    subidoPor: null,
    autor: "",
    fecha: a.created_at,
  })),
});

/** Trae tareas, historial, equipo, obras y archivos. La base de datos entrega solo lo que esa persona puede ver. */
export async function recargar() {
  if (state.demo || !state.perfil) return;
  if (state.perfil.rol === "cliente") {
    // El cliente no lee las tablas: una función le arma el resumen de sus obras.
    const { data, error } = await supabase.rpc("tm_client_view");
    if (error) return set({ cargado: true, error: true });
    return set({ cargado: true, error: false, seguimiento: ((data ?? []) as FilaSeguimiento[]).map(aSeguimiento) });
  }
  const [tareas, eventos, perfiles, obras, archivos, clientes] = await Promise.all([
    supabase.from("tm_tasks").select("*").order("number", { ascending: false }),
    supabase.from("tm_events").select("*").order("id", { ascending: false }).limit(3000),
    supabase.from("tm_profiles").select("*").order("name"),
    supabase.from("tm_projects").select("*").order("created_at"),
    supabase.from("tm_files").select("*").order("created_at", { ascending: false }),
    supabase.from("tm_project_clients").select("project_id, profile_id"),
  ]);
  if (tareas.error || eventos.error || perfiles.error || obras.error || archivos.error || clientes.error) {
    return set({ cargado: true, error: true });
  }
  // Las archivadas llegan solo al administrador (lo decide la base de datos) y van aparte.
  const filas = (tareas.data as FilaTarea[]).map(aTarea);
  set({
    cargado: true,
    error: false,
    tareas: filas.filter((t) => !t.archivada),
    archivadas: filas.filter((t) => t.archivada),
    eventos: (eventos.data as FilaEvento[]).map(aEvento),
    perfiles: (perfiles.data as FilaPerfil[]).map(aPerfil),
    obras: (obras.data as FilaObra[]).map(aObra),
    archivos: (archivos.data as FilaArchivo[]).map(aArchivo),
    clientes: (clientes.data as { project_id: string; profile_id: string }[]).map((c) => ({
      obraId: c.project_id,
      perfilId: c.profile_id,
    })),
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
  "obra",
  "con_tareas",
  "archivada",
  "no_archivada",
  "archivo",
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
        p_project: datos.obraId,
      }),
    (b) => demo.guardarTarea(b, datos, id),
  );

/** Archiva la tarea (se conserva con su historial y sus fotos) o la restaura. */
export const archivarTarea = (id: string, archivar = true) =>
  cambiar(
    () => rpc<void>("tm_archive_task", { p_id: id, p_archive: archivar }),
    (b) => demo.archivarTarea(b, id, archivar),
  );

/** Borra del todo una tarea ya archivada, con su historial y sus fotos. */
export const borrarTarea = (id: string) =>
  cambiar(
    async () => {
      if (!state.archivadas.some((t) => t.id === id)) throw new ErrorFlujo("no_archivada");
      // Primero las fotos: si el almacén fallara, la tarea sigue ahí y no quedan archivos sueltos.
      const rutas = state.archivos.filter((a) => a.tareaId === id && a.ruta).map((a) => a.ruta);
      if (rutas.length) {
        const { error } = await supabase.storage.from(ALMACEN).remove(rutas);
        if (error) throw new ErrorFlujo("error");
      }
      await rpc<void>("tm_delete_task", { p_id: id });
    },
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

/** Crea la obra (sin `id`) o cambia su nombre, detalle o estado. */
export const guardarObra = (id: string | null, nombre: string, detalle: string, activa = true) =>
  cambiar(
    () => rpc<string>("tm_save_project", { p_id: id, p_name: nombre, p_detail: detalle, p_active: activa }),
    (b) => demo.guardarObra(b, id, nombre, detalle, activa),
  );

export const borrarObra = (id: string) =>
  cambiar(
    () => rpc<void>("tm_delete_project", { p_id: id }),
    (b) => demo.borrarObra(b, id),
  );

/**
 * Invita a un cliente a seguir una obra. Devuelve su código de invitación, o vacío
 * si esa persona ya tenía cuenta de cliente (queda unida a la obra sin más pasos).
 */
export const invitarCliente = (obraId: string, nombre: string, email: string) =>
  cambiar(
    () =>
      rpc<FilaPerfil>("tm_invite_client", { p_project: obraId, p_name: nombre, p_email: email }).then(
        (fila) => fila.invite_code ?? "",
      ),
    (b) => demo.invitarCliente(b, obraId, nombre, email),
  );

export const quitarCliente = (obraId: string, perfilId: string) =>
  cambiar(
    () => rpc<void>("tm_remove_client", { p_project: obraId, p_profile: perfilId }),
    (b) => demo.quitarCliente(b, obraId, perfilId),
  );

// --- Fotos y archivos -------------------------------------------------------

const ALMACEN = "tareas";
const PESO_MAXIMO = 15 * 1024 * 1024;

/**
 * Deja el archivo listo para subir. Las fotos se reducen y se pasan a JPEG: las de
 * un celular pesan varios megas y así suben rápido incluso con mala señal.
 */
async function preparar(file: File, lado: number) {
  if (file.type === "application/pdf") {
    if (file.size > PESO_MAXIMO) throw new ErrorFlujo("archivo_grande");
    return { blob: file as Blob, nombre: file.name, tipo: file.type };
  }
  if (!file.type.startsWith("image/")) throw new ErrorFlujo("archivo_tipo");
  const blob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const lienzo = document.createElement("canvas");
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      lienzo.getContext("2d")!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      URL.revokeObjectURL(img.src);
      lienzo.toBlob((b) => (b ? resolve(b) : reject(new ErrorFlujo("archivo_tipo"))), "image/jpeg", 0.82);
    };
    img.onerror = () => reject(new ErrorFlujo("archivo_tipo"));
    img.src = URL.createObjectURL(file);
  });
  return { blob, nombre: file.name.replace(/\.[^.]+$/, "") + ".jpg", tipo: "image/jpeg" };
}

const comoDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new ErrorFlujo("archivo"));
    lector.readAsDataURL(blob);
  });

/** Sube fotos o PDF y los deja adjuntos a la tarea. */
export async function subirArchivos(tareaId: string, files: File[]) {
  for (const file of files) {
    if (state.demo && base) {
      // En la muestra la foto se guarda pequeña en la pestaña; un PDF solo queda con su nombre.
      const { blob, nombre, tipo } = await preparar(file, 900);
      const url = tipo === "image/jpeg" ? await comoDataUrl(blob) : undefined;
      const copia = structuredClone(base);
      demo.adjuntar(copia, tareaId, { nombre, tipo, peso: blob.size, url });
      ponerDemo(copia);
      continue;
    }
    const { blob, nombre, tipo } = await preparar(file, 1800);
    const ruta = `${tareaId}/${crypto.randomUUID()}.${tipo === "image/jpeg" ? "jpg" : "pdf"}`;
    const { error } = await supabase.storage.from(ALMACEN).upload(ruta, blob, { contentType: tipo });
    if (error) throw new ErrorFlujo("archivo");
    try {
      await rpc("tm_add_file", { p_task: tareaId, p_path: ruta, p_name: nombre, p_mime: tipo, p_size: blob.size });
    } catch (e) {
      // La base de datos no lo aceptó (por ejemplo, la tarea se archivó): no se deja suelto en el almacén.
      await supabase.storage.from(ALMACEN).remove([ruta]);
      throw e;
    }
  }
  await recargar();
}

export const quitarArchivo = (id: string) =>
  cambiar(
    async () => {
      const ruta = await rpc<string>("tm_remove_file", { p_id: id });
      // Si el borrado del almacén falla, el archivo queda huérfano pero ya no se ve en ninguna parte.
      await supabase.storage.from(ALMACEN).remove([ruta]);
    },
    (b) => demo.quitarArchivo(b, id),
  );

// Direcciones temporales ya pedidas, para no pedirlas en cada pintado.
const firmadas = new Map<string, { url: string; hasta: number }>();

/**
 * Dirección para ver cada archivo, por id. El almacén es privado: entrega enlaces
 * que duran una hora y solo a quien puede ver la tarea.
 */
export async function urlsDe(archivos: Archivo[]) {
  const ahora = Date.now();
  const pendientes = archivos.filter((a) => !a.url && a.ruta && !((firmadas.get(a.ruta)?.hasta ?? 0) > ahora));
  if (pendientes.length) {
    const { data } = await supabase.storage.from(ALMACEN).createSignedUrls(
      pendientes.map((a) => a.ruta),
      3600,
    );
    for (const f of data ?? []) {
      if (f.path && f.signedUrl) firmadas.set(f.path, { url: f.signedUrl, hasta: ahora + 50 * 60_000 });
    }
  }
  return Object.fromEntries(archivos.map((a) => [a.id, a.url ?? firmadas.get(a.ruta)?.url ?? ""]));
}

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
