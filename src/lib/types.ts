/** El cliente solo mira el avance de su obra: no recibe tareas ni cambia nada. */
export type Rol = "admin" | "empleado" | "cliente";

/** Estados de una tarea, en el orden del flujo. */
export type Estado =
  | "borrador" // creada, sin asignar
  | "asignada" // espera que la persona la acepte
  | "aclaracion" // la persona pidió una aclaración o un cambio
  | "aceptada"
  | "en_curso"
  | "enviada" // entregada, espera revisión
  | "en_revision"
  | "devuelta" // revisada y devuelta con comentarios
  | "completada";

export type Prioridad = "baja" | "media" | "alta" | "urgente";

/** Pasos del flujo que cambian el estado, más el comentario suelto. */
export type Accion =
  | "aceptar"
  | "aclarar"
  | "iniciar"
  | "enviar"
  | "responder"
  | "revisar"
  | "aprobar"
  | "devolver"
  | "reabrir"
  | "comentar";

/** Lo que puede quedar en el historial: los pasos del flujo y los cambios del administrador. */
export type Suceso =
  | Accion
  | "crear"
  | "asignar"
  | "reasignar"
  | "desasignar"
  | "editar"
  | "adjuntar"
  | "archivar"
  | "restaurar";

export type Perfil = {
  id: string;
  /** Nulo mientras la persona no haya activado su invitación. */
  userId: string | null;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  /** Código de invitación pendiente; solo lo ve el administrador. */
  codigo: string | null;
  creado: string;
};

/** Obra o trabajo al que pertenecen las tareas: un local, una casa, un apartamento. */
export type Obra = {
  id: string;
  nombre: string;
  /** Dirección o nota corta. */
  detalle: string;
  /** Falso = archivada: ya no se le agregan tareas. */
  activa: boolean;
};

/** Foto, plano o documento adjunto a una tarea. */
export type Archivo = {
  id: string;
  tareaId: string;
  /** Ruta en el almacén privado; vacía en el modo de muestra. */
  ruta: string;
  nombre: string;
  /** Tipo MIME: "image/jpeg", "application/pdf"… */
  tipo: string;
  peso: number;
  /** Perfil de quien lo subió. */
  subidoPor: string | null;
  autor: string;
  fecha: string;
  /** Dirección para verlo. En el modo de muestra viene aquí; con sesión se pide al almacén. */
  url?: string;
};

export type Tarea = {
  id: string;
  numero: number;
  titulo: string;
  descripcion: string;
  prioridad: Prioridad;
  /** Fecha límite "AAAA-MM-DD", o nulo si no tiene. */
  vence: string | null;
  /** Id del perfil responsable. */
  asignadaA: string | null;
  obraId: string | null;
  estado: Estado;
  creada: string;
  actualizada: string;
  completada: string | null;
  /** Fecha en que se archivó; nulo si está activa. Solo el administrador ve las archivadas. */
  archivada: string | null;
};

export type Evento = {
  id: string;
  tareaId: string;
  fecha: string;
  actorId: string | null;
  actor: string;
  rol: Rol;
  suceso: Suceso;
  de: Estado | null;
  a: Estado | null;
  nota: string;
};

/** Cómo va una tarea a ojos del cliente, sin los pasos internos del equipo. */
export type Etapa = "pendiente" | "en_proceso" | "terminada";

/** Lo que un cliente ve de una tarea. */
export type TareaCliente = {
  id: string;
  numero: number;
  titulo: string;
  etapa: Etapa;
  vence: string | null;
  completada: string | null;
};

/** Una obra tal como la ve su cliente: tareas resumidas y fotos. */
export type ObraCliente = Obra & { tareas: TareaCliente[]; archivos: Archivo[] };

/** Un cliente invitado a seguir una obra. */
export type ClienteObra = { obraId: string; perfilId: string };

/** Campos que el administrador llena al crear o editar una tarea. */
export type DatosTarea = Pick<Tarea, "titulo" | "descripcion" | "prioridad" | "vence" | "asignadaA" | "obraId">;

/** Claves de error que devuelve la base de datos (ver supabase/schema.sql). */
export type Fallo =
  | "permiso"
  | "no_existe"
  | "transicion"
  | "nota"
  | "titulo"
  | "descripcion"
  | "prioridad"
  | "asignado"
  | "completada"
  | "email"
  | "nombre"
  | "rol"
  | "duplicado"
  | "propio"
  | "ultimo_admin"
  | "activa"
  | "invitacion"
  | "ya_activa"
  | "sesion"
  | "credenciales"
  | "confirmar"
  | "clave"
  | "obra"
  | "con_tareas"
  | "archivada"
  | "no_archivada"
  | "archivo"
  | "archivo_tipo"
  | "archivo_grande"
  | "error";
