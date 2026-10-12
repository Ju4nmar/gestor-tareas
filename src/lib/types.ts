export type Rol = "admin" | "empleado";

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
export type Suceso = Accion | "crear" | "asignar" | "reasignar" | "desasignar" | "editar";

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
  estado: Estado;
  creada: string;
  actualizada: string;
  completada: string | null;
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

/** Campos que el administrador llena al crear o editar una tarea. */
export type DatosTarea = Pick<Tarea, "titulo" | "descripcion" | "prioridad" | "vence" | "asignadaA">;

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
  | "error";
