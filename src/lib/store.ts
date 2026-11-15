"use client";

import type { Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import * as demo from "./demo";
import { rutaArchivo } from "./ruta-archivo";
import { limpiarBorradoresCuenta } from "./borradores";
import { SOLO_DEMO } from "./entorno";
import { fechaLocal } from "./fechas";
import { ErrorFlujo } from "./flujo";
import { seleccionarEmpresaApi, supabase } from "./supabase";
import { idiomaActual } from "./textos";
import type {
  Accion,
  Archivo,
  ClienteObra,
  DatosTarea,
  Etapa,
  Empresa,
  Evento,
  Fallo,
  Obra,
  ObraCliente,
  Perfil,
  Plantilla,
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
  nombreCuenta: string;
  empresas: Empresa[];
  empresa: Empresa | null;
  ocupado: boolean;
  plantillas: Plantilla[];
  vistoHasta: string | null;
  operacion: string | null;
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
  nombreCuenta: "",
  empresas: [],
  empresa: null,
  ocupado: false,
  plantillas: [],
  vistoHasta: null,
  operacion: null,
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
let revision = 0;
let sesionActual: Session | null = null;
let operacionesPendientes = 0;
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
    plantillas: admin ? (b.plantillas ?? []) : [],
    vistoHasta: b.vistos?.[b.yo] ?? null,
    empresas: [],
    empresa: {
      id: "demo",
      nombre: b.empresa?.nombre ?? "Constructora Demo",
      perfilId: b.yo,
      rol: yo?.rol ?? "empleado",
      ...b.empresa,
    },
    tareas,
    archivadas,
    eventos: b.eventos.filter((e) => visibles.has(e.tareaId)),
    perfiles: admin ? b.perfiles : b.perfiles.filter((p) => p.id === b.yo),
    obras: admin
      ? b.obras
      : b.obras.filter((o) => tareas.some((t) => t.obraId === o.id)),
    archivos: b.archivos.filter((a) => visibles.has(a.tareaId)),
    clientes: admin ? b.clientes : [],
    seguimiento: yo?.rol === "cliente" ? demo.vistaCliente(b) : [],
  });
}

export function entrarDemo(rol: Rol) {
  revision++;
  seleccionarEmpresaApi(null);
  firmadas.clear();
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
export const personasDemo = () =>
  base?.perfiles.filter((p) => p.userId && p.activo) ?? [];

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
  invite_expires_at?: string | null;
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
  invitacionVence: f.invite_expires_at ?? null,
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
  weight?: number;
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
  peso: f.weight ?? 1,
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

const aObra = (f: FilaObra): Obra => ({
  id: f.id,
  nombre: f.name,
  detalle: f.detail,
  activa: f.active,
});

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
  tasks: {
    id: string;
    number: number;
    title: string;
    stage: Etapa;
    due_date: string | null;
    completed_at: string | null;
    weight?: number;
  }[];
  files: {
    id: string;
    task_id: string;
    path: string;
    name: string;
    mime: string;
    created_at: string;
  }[];
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
    peso: t.weight ?? 1,
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

/** Recorre paginas estables para evitar el limite de filas de la API. */
async function leerPaginas<T>(
  tabla: string,
  columnas = "*",
  orden = "id",
  ascending = true,
) {
  const filas: T[] = [];
  const vistas = new Set<string>();
  const esperada = revision;
  for (let inicio = 0; ; inicio += 500) {
    if (esperada !== revision)
      return { data: filas, error: new ErrorFlujo("empresa_cambio") };
    const consulta = supabase
      .from(tabla)
      .select(columnas)
      .order(orden, { ascending });
    const resultado = await consulta
      .order(tabla === "tm_project_clients" ? "profile_id" : "id")
      .range(inicio, inicio + 499);
    if (resultado.error) return { data: filas, error: resultado.error };
    for (const fila of resultado.data as unknown as T[]) {
      const campos = fila as Record<string, unknown>;
      const clave = String(
        campos.id ?? `${campos.project_id}:${campos.profile_id}`,
      );
      if (!vistas.has(clave)) {
        vistas.add(clave);
        filas.push(fila);
      }
    }
    if (resultado.data.length < 500) return { data: filas, error: null };
  }
}

async function cargarComplementos(esperada: number) {
  const [plantillas, marcador, empresa] = await Promise.all([
    leerPaginas<{
      id: string;
      name: string;
      title: string;
      description: string;
      priority: Plantilla["prioridad"];
      weight: number;
    }>("tm_templates"),
    supabase.from("tm_read_markers").select("seen_at").maybeSingle(),
    supabase
      .from("tm_companies")
      .select("id,name,contact,phone,logo_path")
      .eq("id", state.empresa!.id)
      .single(),
  ]);
  if (esperada !== revision) return;
  if (plantillas.error || marcador.error || empresa.error)
    throw new ErrorFlujo("error");
  let logoUrl: string | undefined;
  if (empresa.data.logo_path) {
    const logo = await supabase.storage
      .from("empresas")
      .createSignedUrl(empresa.data.logo_path, 3600);
    logoUrl = logo.data?.signedUrl;
  }
  if (esperada !== revision) return;
  set({
    plantillas: plantillas.data.map((p) => ({
      id: p.id,
      nombre: p.name,
      titulo: p.title,
      descripcion: p.description,
      prioridad: p.priority,
      peso: p.weight,
    })),
    vistoHasta: marcador.data?.seen_at ?? null,
    empresa: {
      ...state.empresa!,
      nombre: empresa.data.name,
      contacto: empresa.data.contact,
      telefono: empresa.data.phone,
      logo: empresa.data.logo_path,
      logoUrl,
    },
    empresas: state.empresas.map((e) =>
      e.id === empresa.data.id ? { ...e, nombre: empresa.data.name } : e,
    ),
  });
}

/** Trae tareas, historial, equipo, obras y archivos. La base de datos entrega solo lo que esa persona puede ver. */
export async function recargar() {
  if (state.demo || !state.perfil) return;
  const consultaRevision = revision;
  let complementosOk = true;
  try {
    await cargarComplementos(consultaRevision);
  } catch {
    complementosOk = false;
    if (consultaRevision === revision) set({ error: true });
  }
  if (consultaRevision !== revision) return;
  if (state.perfil.rol === "cliente") {
    // El cliente no lee las tablas: una función le arma el resumen de sus obras.
    const { data, error } = await supabase.rpc("tm_client_view");
    if (consultaRevision !== revision) return;
    if (error) return set({ cargado: true, error: true });
    return set({
      cargado: true,
      error: !complementosOk,
      seguimiento: ((data ?? []) as FilaSeguimiento[]).map(aSeguimiento),
    });
  }
  const [tareas, eventos, perfiles, obras, archivos, clientes] =
    await Promise.all([
      leerPaginas<FilaTarea>("tm_tasks", "*", "number", false),
      leerPaginas<FilaEvento>("tm_events", "*", "id", false),
      leerPaginas<FilaPerfil>("tm_profiles"),
      leerPaginas<FilaObra>("tm_projects", "*", "created_at"),
      leerPaginas<FilaArchivo>("tm_files", "*", "created_at", false),
      leerPaginas<{ project_id: string; profile_id: string }>(
        "tm_project_clients",
        "project_id,profile_id",
        "project_id",
      ),
    ]);
  if (consultaRevision !== revision) return;
  if (
    tareas.error ||
    eventos.error ||
    perfiles.error ||
    obras.error ||
    archivos.error ||
    clientes.error
  ) {
    return set({ cargado: true, error: true });
  }
  // Las archivadas llegan solo al administrador (lo decide la base de datos) y van aparte.
  const filas = (tareas.data as FilaTarea[]).map(aTarea);
  set({
    cargado: true,
    error: !complementosOk,
    tareas: filas.filter((t) => !t.archivada),
    archivadas: filas.filter((t) => t.archivada),
    eventos: (eventos.data as FilaEvento[]).map(aEvento),
    perfiles: (perfiles.data as FilaPerfil[]).map(aPerfil),
    obras: (obras.data as FilaObra[]).map(aObra),
    archivos: (archivos.data as FilaArchivo[]).map(aArchivo),
    clientes: (
      clientes.data as { project_id: string; profile_id: string }[]
    ).map((c) => ({
      obraId: c.project_id,
      perfilId: c.profile_id,
    })),
  });
}

type FilaEmpresa = { id: string; name: string; profile_id: string; role: Rol };
const aEmpresa = (fila: FilaEmpresa): Empresa => ({
  id: fila.id,
  nombre: fila.name,
  perfilId: fila.profile_id,
  rol: fila.role,
});

function recordarEmpresa(id: string | null, email: string) {
  try {
    const clave = `trazo-empresa:${email}`;
    if (id) window.sessionStorage.setItem(clave, id);
    else window.sessionStorage.removeItem(clave);
  } catch {
    // La seleccion funciona durante esta visita sin almacenamiento.
  }
}

export async function seleccionarEmpresa(id: string) {
  if (state.demo || operacionesPendientes > 0) throw new ErrorFlujo("ocupado");
  const empresa = state.empresas.find((item) => item.id === id);
  if (!empresa || !state.email) throw new ErrorFlujo("permiso");
  const accesoRevision = ++revision;
  const { email, empresas, nombreCuenta } = state;
  seleccionarEmpresaApi(id);
  firmadas.clear();
  set({ ...initial, email, empresas, empresa, nombreCuenta });
  try {
    const { data, error } = await supabase.rpc("tm_enter");
    if (accesoRevision !== revision) return;
    if (error || !data) throw new ErrorFlujo("permiso");
    const perfil = aPerfil(data as FilaPerfil);
    recordarEmpresa(id, email);
    set({ listo: true, perfil, desactivada: false });
    await recargar();
  } catch (error) {
    if (accesoRevision !== revision) return;
    seleccionarEmpresaApi(null);
    recordarEmpresa(null, email);
    set({
      listo: true,
      perfil: null,
      empresa: null,
      cargado: true,
      error: true,
    });
    throw error;
  }
}

async function aplicarSesion(session: Session | null, preferida?: string) {
  if (state.demo) return;
  const accesoRevision = ++revision;
  sesionActual = session;
  seleccionarEmpresaApi(null);
  firmadas.clear();
  const email = session?.user.email ?? null;
  const nombreCuenta =
    typeof session?.user.user_metadata.full_name === "string"
      ? session.user.user_metadata.full_name
      : "";
  set({ ...initial, email, nombreCuenta, ocupado: operacionesPendientes > 0 });
  if (!session) return set({ listo: true });
  try {
    const { data, error } = await supabase.rpc("tm_list_companies");
    if (accesoRevision !== revision) return;
    if (error) throw error;
    const empresas = ((data ?? []) as FilaEmpresa[]).map(aEmpresa);
    set({ empresas });
    let guardada = preferida;
    try {
      guardada ??=
        window.sessionStorage.getItem(`trazo-empresa:${email}`) ?? undefined;
    } catch {
      /* La seleccion puede hacerse manualmente. */
    }
    const elegida =
      empresas.find((item) => item.id === guardada) ??
      (empresas.length === 1 ? empresas[0] : undefined);
    if (elegida && operacionesPendientes === 0)
      await seleccionarEmpresa(elegida.id);
    else set({ listo: true });
  } catch {
    if (accesoRevision === revision)
      set({ listo: true, cargado: true, error: true });
  }
}

export const recargarAcceso = () => aplicarSesion(sesionActual);

function start() {
  const muestra = leerDemo();
  if (muestra) return ponerDemo(muestra);
  if (SOLO_DEMO) return entrarDemo("admin");
  supabase.auth.onAuthStateChange((_event, session) => {
    // Las consultas se ejecutan fuera del bloqueo de Supabase Auth.
    setTimeout(() => {
      if (state.demo) return;
      if (session && sesionActual?.user.id === session.user.id) {
        sesionActual = session;
        void recargar();
      } else void aplicarSesion(session);
    }, 0);
  });
  window.addEventListener("focus", () => {
    if (state.email && !state.perfil) void recargarAcceso();
    else void recargar();
  });
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
  "invitacion_vencida",
  "ya_activa",
  "sesion",
  "obra",
  "con_tareas",
  "archivada",
  "no_archivada",
  "archivo",
  "confirmar",
  "ocupado",
  "empresa_cambio",
]);

async function rpc<T>(nombre: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(nombre, args);
  if (error)
    throw new ErrorFlujo(
      FALLOS.has(error.message) ? (error.message as Fallo) : "error",
    );
  return data as T;
}

/** Ejecuta el cambio en la base de datos o en la muestra, y refresca lo que se ve. */
async function cambiar<T>(
  real: () => Promise<T>,
  enDemo: (b: demo.Base) => T,
): Promise<T> {
  if (state.demo && base) {
    const copia = structuredClone(base);
    const resultado = enDemo(copia);
    ponerDemo(copia);
    return resultado;
  }
  return enOperacion(async () => {
    const operacionRevision = revision;
    const resultado = await real();
    comprobarRevision(operacionRevision);
    await recargar();
    return resultado;
  });
}

function comprobarRevision(esperada: number) {
  if (esperada !== revision) throw new ErrorFlujo("empresa_cambio");
}

export async function enOperacion<T>(operacion: () => Promise<T>): Promise<T> {
  const esperada = revision;
  operacionesPendientes++;
  set({ ocupado: true });
  try {
    const resultado = await operacion();
    comprobarRevision(esperada);
    return resultado;
  } finally {
    operacionesPendientes--;
    set({ ocupado: operacionesPendientes > 0 });
  }
}

/** Crea la tarea (sin `id`) o la edita. Devuelve su id. */
export const guardarTarea = (
  datos: DatosTarea,
  id: string | null = null,
  solicitud: string = crypto.randomUUID(),
) =>
  cambiar(
    () =>
      rpc<string>("tm_save_task_v2", {
        p_id: id,
        p_request: solicitud,
        p_data: {
          title: datos.titulo,
          description: datos.descripcion,
          priority: datos.prioridad,
          due_date: datos.vence,
          assignee_id: datos.asignadaA,
          project_id: datos.obraId,
          weight: datos.peso ?? 1,
        },
      }),
    (b) => demo.guardarTarea(b, datos, id),
  );

/** Archiva la tarea (se conserva con su historial y sus fotos) o la restaura. */
export const archivarTarea = (id: string, archivar = true) =>
  cambiar(
    () => rpc<void>("tm_archive_task", { p_id: id, p_archive: archivar }),
    (b) => demo.archivarTarea(b, id, archivar),
  );

/**
 * Borra del todo una tarea ya archivada, con su historial y sus fotos. Devuelve `true` si
 * alguna foto no se pudo quitar del almacén: la tarea ya no existe, pero esas fotos siguen
 * guardadas (ya sin enlace en la aplicación) y conviene avisar.
 */
export const borrarTarea = (id: string) =>
  cambiar(
    async () => {
      // La base de datos decide si se puede (solo archivadas) y devuelve las rutas de sus fotos.
      const rutas = await rpc<string[]>("tm_delete_task", { p_id: id });
      if (!rutas?.length) return false;
      // Las fotos se quitan DESPUÉS: si algo falla antes, no se pierde nada. Dos intentos, porque
      // la tarea ya no existe y no habría otra oportunidad de limpiar.
      for (let intento = 0; intento < 2; intento++) {
        const { error } = await supabase.storage.from(ALMACEN).remove(rutas);
        if (!error) return false;
      }
      console.error("No se pudieron borrar estas fotos del almacén:", rutas);
      return true;
    },
    (b) => {
      demo.borrarTarea(b, id);
      return false;
    },
  );

/** Da un paso del flujo (aceptar, enviar, aprobar…) o deja un comentario. */
export const actuar = (id: string, accion: Accion, nota = "") =>
  cambiar(
    () =>
      rpc<string>("tm_act", {
        p_task: id,
        p_action: accion,
        p_note: nota,
      }).then(() => undefined),
    (b) => demo.actuar(b, id, accion, nota),
  );

/** Invita a una persona y devuelve su código de invitación. */
export const invitar = (nombre: string, email: string, rol: Rol) =>
  cambiar(
    () =>
      rpc<FilaPerfil>("tm_invite", {
        p_name: nombre,
        p_email: email,
        p_role: rol,
      }).then((fila) => fila.invite_code ?? ""),
    (b) => demo.invitar(b, nombre, email, rol),
  );

export const actualizarPerfil = (
  id: string,
  nombre: string,
  rol: Rol,
  activo: boolean,
) =>
  cambiar(
    () =>
      rpc<void>("tm_update_profile", {
        p_id: id,
        p_name: nombre,
        p_role: rol,
        p_active: activo,
      }),
    (b) => demo.actualizarPerfil(b, id, nombre, rol, activo),
  );

/**
 * Renueva una invitación que nadie ha activado: código nuevo y otros siete días, con el mismo
 * perfil y las mismas obras. Devuelve el código nuevo.
 */
export const renovarInvitacion = (id: string) =>
  cambiar(
    () =>
      rpc<FilaPerfil>("tm_renew_invite", { p_id: id }).then(
        (fila) => fila.invite_code ?? "",
      ),
    (b) => demo.renovarInvitacion(b, id),
  );

export const quitarInvitacion = (id: string) =>
  cambiar(
    () => rpc<void>("tm_remove_invite", { p_id: id }),
    (b) => demo.quitarInvitacion(b, id),
  );

/** Crea la obra (sin `id`) o cambia su nombre, detalle o estado. */
export const guardarObra = (
  id: string | null,
  nombre: string,
  detalle: string,
  activa = true,
) =>
  cambiar(
    () =>
      rpc<string>("tm_save_project", {
        p_id: id,
        p_name: nombre,
        p_detail: detalle,
        p_active: activa,
      }),
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
      rpc<FilaPerfil>("tm_invite_client", {
        p_project: obraId,
        p_name: nombre,
        p_email: email,
      }).then((fila) => fila.invite_code ?? ""),
    (b) => demo.invitarCliente(b, obraId, nombre, email),
  );

export const quitarCliente = (obraId: string, perfilId: string) =>
  cambiar(
    () =>
      rpc<void>("tm_remove_client", { p_project: obraId, p_profile: perfilId }),
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
    return {
      blob: file as Blob,
      nombre: file.name.slice(0, 200),
      tipo: file.type,
    };
  }
  if (!file.type.startsWith("image/")) throw new ErrorFlujo("archivo_tipo");
  const blob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const lienzo = document.createElement("canvas");
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      lienzo
        .getContext("2d")!
        .drawImage(img, 0, 0, lienzo.width, lienzo.height);
      URL.revokeObjectURL(img.src);
      lienzo.toBlob(
        (b) => (b ? resolve(b) : reject(new ErrorFlujo("archivo_tipo"))),
        "image/jpeg",
        0.82,
      );
    };
    img.onerror = () => reject(new ErrorFlujo("archivo_tipo"));
    img.src = URL.createObjectURL(file);
  });
  return {
    blob,
    nombre: file.name.replace(/\.[^.]+$/, "").slice(0, 196) + ".jpg",
    tipo: "image/jpeg",
  };
}

const comoDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new ErrorFlujo("archivo"));
    lector.readAsDataURL(blob);
  });

/** Sube fotos o PDF y los deja adjuntos a la tarea. */
export type ProgresoArchivo = {
  indice: number;
  total: number;
  nombre: string;
  estado: "preparando" | "subiendo" | "guardado" | "error";
};
const intentosArchivo = new WeakMap<
  File,
  { revision: number; tarea: string; ruta: string; guardado: boolean }
>();

export async function subirArchivos(
  tareaId: string,
  files: File[],
  progreso?: (estado: ProgresoArchivo) => void,
) {
  return enOperacion(() => subirArchivosEnEmpresa(tareaId, files, progreso));
}

async function subirArchivosEnEmpresa(
  tareaId: string,
  files: File[],
  progreso?: (estado: ProgresoArchivo) => void,
) {
  const operacionRevision = revision;
  let fallo: unknown;
  for (const [indice, file] of files.entries()) {
    comprobarRevision(operacionRevision);
    const informar = (estado: ProgresoArchivo["estado"]) =>
      progreso?.({ indice, total: files.length, nombre: file.name, estado });
    let intento = intentosArchivo.get(file);
    if (
      !intento ||
      intento.revision !== operacionRevision ||
      intento.tarea !== tareaId
    ) {
      intento = {
        revision: operacionRevision,
        tarea: tareaId,
        ruta: "",
        guardado: false,
      };
      intentosArchivo.set(file, intento);
    }
    if (intento.guardado) {
      informar("guardado");
      continue;
    }
    informar("preparando");
    try {
      if (state.demo && base) {
        // La muestra conserva las fotos reducidas y los documentos en esta pestaña.
        const { blob, nombre, tipo } = await preparar(file, 900);
        const url = await comoDataUrl(blob);
        comprobarRevision(operacionRevision);
        const copia = structuredClone(base);
        if (!copia.archivos.some((a) => a.tareaId === tareaId && a.url === url))
          demo.adjuntar(copia, tareaId, { nombre, tipo, peso: blob.size, url });
        ponerDemo(copia);
        intento.guardado = true;
        informar("guardado");
        continue;
      }
      const { blob, nombre, tipo } = await preparar(file, 1800);
      comprobarRevision(operacionRevision);
      intento.ruta ||= await rutaArchivo(tareaId, state.perfil!.id, blob, tipo);
      comprobarRevision(operacionRevision);
      const ruta = intento.ruta;
      informar("subiendo");
      const { error } = await supabase.storage
        .from(ALMACEN)
        .upload(ruta, blob, { contentType: tipo });
      if (error && !/already exists|duplicate/i.test(error.message))
        throw new ErrorFlujo("archivo");
      comprobarRevision(operacionRevision);
      await rpc("tm_add_file_v2", {
        p_task: tareaId,
        p_path: ruta,
        p_name: nombre,
        p_mime: tipo,
        p_size: blob.size,
      });
      intento.guardado = true;
      informar("guardado");
    } catch (e) {
      comprobarRevision(operacionRevision);
      // La misma ruta permite resolver respuestas perdidas sin duplicar ni borrar un archivo confirmado.
      fallo ??= e;
      informar("error");
    }
  }
  await recargar();
  if (fallo) throw fallo;
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
  const consultaRevision = revision;
  const ahora = Date.now();
  const pendientes = archivos.filter(
    (a) => !a.url && a.ruta && !((firmadas.get(a.ruta)?.hasta ?? 0) > ahora),
  );
  if (pendientes.length) {
    const { data } = await supabase.storage.from(ALMACEN).createSignedUrls(
      pendientes.map((a) => a.ruta),
      3600,
    );
    if (consultaRevision !== revision) return {};
    for (const f of data ?? []) {
      if (f.path && f.signedUrl)
        firmadas.set(f.path, { url: f.signedUrl, hasta: ahora + 50 * 60_000 });
    }
  }
  return Object.fromEntries(
    archivos.map((a) => [a.id, a.url ?? firmadas.get(a.ruta)?.url ?? ""]),
  );
}

// --- Cuenta -----------------------------------------------------------------

export async function entrar(email: string, clave: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: clave,
  });
  if (error)
    throw new ErrorFlujo(
      error.code === "email_not_confirmed" ? "confirmar" : "credenciales",
    );
  await aplicarSesion(data.session);
}

export async function salir() {
  const cuenta = state.perfil?.userId;
  const { error } = await supabase.auth.signOut();
  if (error) throw new ErrorFlujo("error");
  if (cuenta) limpiarBorradoresCuenta(cuenta);
  await aplicarSesion(null);
}

/**
 * Nombre y correo de una invitación pendiente; `{ vencida: true }` si su código ya venció
 * (no se revela a quién era); nulo si el código no sirve.
 */
export type InfoInvitacion =
  { name: string; email: string; company: string } | { vencida: true } | null;

export async function infoInvitacion(codigo: string): Promise<InfoInvitacion> {
  const { data } = await supabase.rpc("tm_invite_info", { p_code: codigo });
  if (!data) return null;
  if ((data as { expired?: boolean }).expired) return { vencida: true };
  return data as { name: string; email: string; company: string };
}

/** Une la sesión actual con su invitación y carga el perfil. */
export async function activarConSesion(codigo: string) {
  const perfil = await rpc<FilaPerfil & { company_id: string }>("tm_activate", {
    p_code: codigo,
  });
  const { data } = await supabase.auth.getSession();
  await aplicarSesion(data.session, perfil.company_id);
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
    options: {
      emailRedirectTo: `${window.location.origin}/activar?codigo=${encodeURIComponent(codigo)}`,
    },
  });
  if (alta.error)
    throw new ErrorFlujo(
      alta.error.code === "weak_password" ? "clave" : "error",
    );
  if (!alta.data.session) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: clave,
    });
    if (error) throw new ErrorFlujo("confirmar");
  }
  await activarConSesion(codigo);
}

/** Envía el correo para crear una contraseña nueva. */
export async function pedirClave(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/restablecer`,
  });
  if (error) throw new ErrorFlujo("error");
}

export async function cambiarClave(clave: string) {
  if (clave.length < 8) throw new ErrorFlujo("clave");
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error)
    throw new ErrorFlujo(error.code === "weak_password" ? "clave" : "error");
}

/** Registro de una cuenta personal. La empresa se crea tras confirmar el correo. */
export async function registrar(nombre: string, email: string, clave: string) {
  if (nombre.trim().length < 2 || nombre.trim().length > 80)
    throw new ErrorFlujo("nombre");
  if (clave.length < 8) throw new ErrorFlujo("clave");
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password: clave,
    options: {
      data: { full_name: nombre.trim() },
      emailRedirectTo: `${window.location.origin}/empresas`,
    },
  });
  if (error)
    throw new ErrorFlujo(error.code === "weak_password" ? "clave" : "error");
  return Boolean(data.session);
}

export async function crearEmpresa(
  id: string,
  nombre: string,
  persona: string,
) {
  await enOperacion(() =>
    rpc("tm_create_company", {
      p_id: id,
      p_name: nombre.trim(),
      p_person_name: persona.trim(),
    }),
  );
  await aplicarSesion(sesionActual, id);
  if (state.empresa?.id !== id || !state.perfil) throw new ErrorFlujo("error");
}

export const guardarPlantilla = (nombre: string, datos: DatosTarea) =>
  cambiar(
    () =>
      rpc<string>("tm_save_template", {
        p_id: null,
        p_data: {
          name: nombre,
          title: datos.titulo,
          description: datos.descripcion,
          priority: datos.prioridad,
          weight: datos.peso ?? 1,
        },
      }),
    (b) => {
      if (state.perfil?.rol !== "admin") throw new ErrorFlujo("permiso");
      const id = crypto.randomUUID();
      b.plantillas = [
        ...(b.plantillas ?? []),
        {
          id,
          nombre,
          titulo: datos.titulo,
          descripcion: datos.descripcion,
          prioridad: datos.prioridad,
          peso: datos.peso ?? 1,
        },
      ];
      return id;
    },
  );

export const quitarPlantilla = (id: string) =>
  cambiar(
    () => rpc("tm_save_template", { p_id: id, p_data: {} }),
    (b) => {
      if (state.perfil?.rol !== "admin") throw new ErrorFlujo("permiso");
      b.plantillas = (b.plantillas ?? []).filter((p) => p.id !== id);
    },
  );

export const marcarNotificaciones = () =>
  cambiar(
    () => rpc("tm_mark_seen", {}),
    (b) => {
      b.vistos = { ...b.vistos, [b.yo]: new Date().toISOString() };
    },
  );

export async function buscarTareas(
  filtro: Record<string, unknown>,
  pagina: number,
  cantidad = 30,
) {
  const esperada = revision;
  const data = await rpc<{ rows: FilaTarea[]; total: number }>(
    "tm_search_tasks",
    { p_filter: filtro, p_offset: (pagina - 1) * cantidad, p_limit: cantidad },
  );
  comprobarRevision(esperada);
  return { tareas: data.rows.map(aTarea), total: data.total };
}

export async function actualizarEmpresa(
  nombre: string,
  contacto: string,
  telefono: string,
  foto?: File,
) {
  if (state.perfil?.rol !== "admin" || !state.empresa)
    throw new ErrorFlujo("permiso");
  if (
    nombre.trim().length < 2 ||
    nombre.trim().length > 80 ||
    contacto.length > 200 ||
    telefono.length > 50
  )
    throw new ErrorFlujo("nombre");
  const esperada = revision;
  let logo = state.empresa.logo ?? null;
  let logoUrl = state.empresa.logoUrl;
  await enOperacion(async () => {
    if (foto) {
      if (!foto.type.startsWith("image/")) throw new ErrorFlujo("archivo_tipo");
      const { blob } = await preparar(foto, 300);
      comprobarRevision(esperada);
      if (state.demo) logoUrl = await comoDataUrl(blob);
      else {
        logo = `${state.empresa!.id}/logo.jpg`;
        const { error } = await supabase.storage
          .from("empresas")
          .upload(logo, blob, { contentType: "image/jpeg", upsert: true });
        if (error) throw new ErrorFlujo("archivo");
      }
    }
    comprobarRevision(esperada);
    if (state.demo && base) {
      const copia = structuredClone(base);
      copia.empresa = { nombre, contacto, telefono, logoUrl };
      ponerDemo(copia);
    } else {
      await rpc("tm_update_company", {
        p_name: nombre,
        p_contact: contacto,
        p_phone: telefono,
        p_logo: logo,
      });
      await recargar();
    }
  });
}

export const informarOperacion = (operacion: string | null) =>
  set({ operacion });

export async function datosRespaldo() {
  if (state.perfil?.rol !== "admin") throw new ErrorFlujo("permiso");
  if (!state.demo || !base)
    return rpc<Record<string, unknown>>("tm_export_company", {});
  const company_id = "demo";
  return {
    version: 1,
    owner_profile_id: state.perfil.id,
    company: {
      id: company_id,
      name: state.empresa?.nombre ?? "Constructora Demo",
      contact: state.empresa?.contacto ?? "",
      phone: state.empresa?.telefono ?? "",
      logo_path: null,
    },
    profiles: base.perfiles.map((p) => ({
      id: p.id,
      company_id,
      name: p.nombre,
      email: p.email,
      role: p.rol,
      active: p.activo,
    })),
    projects: base.obras.map((o) => ({
      id: o.id,
      company_id,
      name: o.nombre,
      detail: o.detalle,
      active: o.activa,
    })),
    tasks: base.tareas.map((t) => ({
      id: t.id,
      company_id,
      number: t.numero,
      title: t.titulo,
      description: t.descripcion,
      priority: t.prioridad,
      due_date: t.vence,
      assignee_id: t.asignadaA,
      project_id: t.obraId,
      status: t.estado,
      created_by: "admin",
      created_at: t.creada,
      updated_at: t.actualizada,
      completed_at: t.completada,
      archived_at: t.archivada,
      weight: t.peso ?? 1,
    })),
    events: base.eventos.map((e) => ({
      company_id,
      task_id: e.tareaId,
      actor_id: e.actorId,
      actor_name: e.actor,
      actor_role: e.rol,
      action: e.suceso,
      from_status: e.de,
      to_status: e.a,
      note: e.nota,
      created_at: e.fecha,
    })),
    files: base.archivos.map((a) => ({
      id: a.id,
      company_id,
      task_id: a.tareaId,
      path: `${a.tareaId}/${a.id}.${a.tipo === "application/pdf" ? "pdf" : "jpg"}`,
      name: a.nombre,
      mime: a.tipo,
      size: a.peso,
      uploaded_by: a.subidoPor,
      uploader_name: a.autor,
      created_at: a.fecha,
      url: a.url,
    })),
    clients: base.clientes.map((c) => ({
      company_id,
      project_id: c.obraId,
      profile_id: c.perfilId,
    })),
    templates: (base.plantillas ?? []).map((p) => ({
      company_id,
      name: p.nombre,
      title: p.titulo,
      description: p.descripcion,
      priority: p.prioridad,
      weight: p.peso,
    })),
  };
}
