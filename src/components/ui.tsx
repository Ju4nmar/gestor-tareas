"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Icon } from "./Icon";
export { Logo } from "./Marca";
import { useHoy } from "@/lib/fechas";
import { ErrorFlujo, abierta, codigoTarea, diasInvitacion, diasRestantes, vencida } from "@/lib/flujo";
import { useStore } from "@/lib/store";
import { type Textos, useT } from "@/lib/textos";
import type { Estado, Evento, Fallo, Prioridad, Tarea } from "@/lib/types";

/** Clave del motivo de un error, para buscar su texto en `t.fallos`. */
export const falloDe = (e: unknown): Fallo => (e instanceof ErrorFlujo ? e.fallo : "error");

/** Enlace de un solo uso con el que una persona invitada crea su contraseña. */
export const enlaceInvitacion = (codigo: string) => `${window.location.origin}/activar?codigo=${codigo}`;

/** Copia el enlace de invitación; sin permiso para el portapapeles, lo muestra para copiarlo a mano. */
export async function copiarInvitacion(codigo: string, titulo: string) {
  try {
    await navigator.clipboard.writeText(enlaceInvitacion(codigo));
    return true;
  } catch {
    window.prompt(titulo, enlaceInvitacion(codigo));
    return false;
  }
}

/** Estado de una tarea: badge moderno tipo pill con punto de color y texto nítido. */
export function Sello({
  estado,
  variante = "badge",
  className = "",
}: {
  estado: Estado;
  variante?: "simple" | "badge";
  className?: string;
}) {
  const { t } = useT();
  const esBadge = variante === "badge";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium transition-all ${
        esBadge
          ? "rounded-full border px-2.5 py-0.5 shadow-sm"
          : "font-mono text-[11px] uppercase tracking-wider"
      } ${className}`}
      style={{
        backgroundColor: esBadge ? `var(--e-${estado}-fondo)` : "transparent",
        borderColor: esBadge ? `var(--e-${estado}-borde)` : "transparent",
        color: `var(--tinta)`,
      }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: `var(--e-${estado})` }}
      />
      {t.estados[estado]}
    </span>
  );
}

const NIVEL: Record<Prioridad, number> = { baja: 1, media: 2, alta: 3, urgente: 4 };
const COLOR_PRIORIDAD: Record<Prioridad, string> = {
  baja: "bg-slate-400",
  media: "bg-blue-500",
  alta: "bg-amber-500",
  urgente: "bg-red-500",
};

/** Prioridad como cuatro barras modernas redondeadas. */
export function Barras({ prioridad, conTexto = false }: { prioridad: Prioridad; conTexto?: boolean }) {
  const { t } = useT();
  const color = COLOR_PRIORIDAD[prioridad];
  return (
    <span className="inline-flex items-center gap-2" title={`${t.campos.prioridad}: ${t.prioridades[prioridad]}`}>
      <span aria-hidden className="flex items-end gap-1">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={`w-1 rounded-full transition-colors ${n <= NIVEL[prioridad] ? color : "bg-slate-200 dark:bg-slate-700"}`}
            style={{ height: 4 + n * 2.5 }}
          />
        ))}
      </span>
      <span className={conTexto ? `text-xs font-semibold ${prioridad === "urgente" ? "text-red-700 dark:text-red-300" : "text-gris"}` : "sr-only"}>
        {t.prioridades[prioridad]}
      </span>
    </span>
  );
}

/** Fecha límite con formato humano y badge sutil según urgencia. */
export function Vence({ tarea, className = "" }: { tarea: Tarea; className?: string }) {
  const { t, dia } = useT();
  const hoy = useHoy();
  if (!tarea.vence) return <span className={`text-xs text-gris ${className}`}>{t.comun.sinFecha}</span>;
  const dias = diasRestantes(tarea, hoy);
  const fecha = dia(tarea.vence);
  if (!abierta(tarea) || dias === null || dias > 7) {
    return <span className={`text-xs whitespace-nowrap text-gris ${className}`}>{fecha}</span>;
  }
  const { fechas } = t;
  const falta =
    dias === 0 ? fechas.hoy : dias === 1 ? fechas.manana : dias > 1 ? fechas.en(dias) : dias === -1 ? fechas.ayer : fechas.hace(-dias);
  
  if (dias < 0) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900/40 ${className}`}>
        {fecha} · {falta}
      </span>
    );
  }
  if (dias === 0) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900/40 ${className}`}>
        {fecha} · {falta}
      </span>
    );
  }
  return (
    <span className={`text-xs whitespace-nowrap text-gris ${className}`}>
      {fecha} · {falta}
    </span>
  );
}

/** Vigencia de un enlace de invitación pendiente. */
export function VigenciaInvitacion({ vence }: { vence: string | null }) {
  const { t } = useT();
  const hoy = useHoy();
  const dias = diasInvitacion(vence, hoy);
  if (dias === null) return null;
  return dias < 0 ? (
    <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300">
      {t.equipo.invitacionVencida}
    </span>
  ) : (
    <span className="text-xs text-gris">{t.equipo.invitacionVence(dias)}</span>
  );
}

type InvitacionPendiente = { id: string; codigo: string | null; invitacionVence: string | null };

/** Acciones disponibles para un enlace pendiente, con botones modernos. */
export function AccionesInvitacion({ perfil, copiado, onCopiar, onRenovar }: {
  perfil: InvitacionPendiente;
  copiado: string;
  onCopiar: (codigo: string) => void;
  onRenovar: (id: string) => void;
}) {
  const { t } = useT();
  const hoy = useHoy();
  const dias = diasInvitacion(perfil.invitacionVence, hoy);
  const vencida = dias !== null && dias < 0;
  return (
    <div className="flex items-center gap-2">
      {perfil.codigo && !vencida && (
        <button
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold shadow-sm transition-all ${
            copiado === perfil.codigo
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
          }`}
          onClick={() => onCopiar(perfil.codigo!)}
        >
          {copiado === perfil.codigo ? (
            <>
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
              </svg>
              {t.equipo.copiado}
            </>
          ) : (
            <>
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-slate-500">
                <path d="M11 2.5a1.5 1.5 0 0 0-1.5-1.5h-5A1.5 1.5 0 0 0 3 2.5v7A1.5 1.5 0 0 0 4.5 11h5a1.5 1.5 0 0 0 1.5-1.5v-7Z" />
                <path d="M13 5.5a1.5 1.5 0 0 0-1.5-1.5h-.5v5.5a2.5 2.5 0 0 1-2.5 2.5H4v.5A1.5 1.5 0 0 0 5.5 14h5a1.5 1.5 0 0 0 1.5-1.5v-7Z" />
              </svg>
              {t.equipo.enlace}
            </>
          )}
        </button>
      )}
      <button
        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
          vencida
            ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
        }`}
        onClick={() => onRenovar(perfil.id)}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 14 10.727a6 6 0 0 1-9.44 1.242l-.842-.84v1.644a.75.75 0 0 1-1.5 0V9.59a.75.75 0 0 1 .75-.75h3.182a.75.75 0 0 1 0 1.5H4.78l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.272Z" clipRule="evenodd" />
        </svg>
        {t.equipo.renovar}
      </button>
    </div>
  );
}

/** Frase del historial: qué hizo esa persona. */
export function frase(t: Textos, e: Evento) {
  if (e.suceso === "editar") {
    return t.sucesos.editar(
      e.nota
        .split(",")
        .map((campo) => t.camposEditados[campo] ?? campo)
        .join(", "),
    );
  }
  return t.sucesos[e.suceso](e.nota);
}

/** Sucesos cuya nota es un dato (un nombre, una lista de campos) y no un mensaje. */
export const SIN_MENSAJE = new Set<Evento["suceso"]>([
  "crear",
  "asignar",
  "reasignar",
  "desasignar",
  "editar",
  "adjuntar",
  "archivar",
  "restaurar",
]);

/** Nombre de quien tiene la tarea, o "Sin asignar". */
export function useNombres() {
  const { perfiles } = useStore();
  const { t } = useT();
  return (id: string | null) => perfiles.find((p) => p.id === id)?.nombre ?? t.comun.sinResponsable;
}

/** Nombre de la obra de una tarea, o "Sin obra". */
export function useObras() {
  const { obras } = useStore();
  const { t } = useT();
  return (id: string | null) => obras.find((o) => o.id === id)?.nombre ?? t.comun.sinObra;
}

/** Avance de una obra: barra redondeada moderna y limpia. */
export function Avance({ hechas, total }: { hechas: number; total: number }) {
  const porcentaje = total ? Math.min(100, Math.round((hechas / total) * 100)) : 0;
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-label="Avance de tareas completadas" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100}>
      <span
        className="block h-full rounded-full bg-exito transition-all duration-300"
        style={{ width: `${porcentaje}%` }}
      />
    </span>
  );
}

const COLUMNAS = "lg:grid-cols-[4.5rem_minmax(0,1fr)_9rem_10.5rem_2rem_11.5rem]";

/** Lista de tareas moderna: tabla limpia en desktop, tarjetas táctiles en móvil. */
export function ListaTareas({
  tareas,
  conResponsable = false,
  conObra = false,
  cabecera = true,
}: {
  tareas: Tarea[];
  conResponsable?: boolean;
  /** Muestra la obra bajo el título; sobra cuando la lista ya está agrupada por obra. */
  conObra?: boolean;
  cabecera?: boolean;
}) {
  const { t } = useT();
  const hoy = useHoy();
  const nombre = useNombres();
  const obra = useObras();
  return (
    <div className="overflow-hidden rounded-2xl border border-regla bg-hoja shadow-sm">
      <div className={`hidden gap-4 border-b border-regla bg-slate-50/70 px-4 py-2.5 text-xs font-semibold text-gris dark:bg-slate-900/50 ${cabecera ? "lg:grid" : ""} ${COLUMNAS}`}>
        <span>{t.campos.codigo}</span>
        <span>{t.campos.tarea}</span>
        <span>{conResponsable ? t.campos.responsable : ""}</span>
        <span>{t.campos.estado}</span>
        <span>
          <span className="sr-only">{t.campos.prioridad}</span>
        </span>
        <span className="text-right whitespace-nowrap">{t.campos.vence}</span>
      </div>
      <div className="divide-y divide-regla">
        {tareas.map((tarea) => (
          <Link
            key={tarea.id}
            href={`/panel/tareas/${tarea.id}`}
            className={`group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 p-4 transition-all hover:bg-hoja-hover sm:px-5 lg:gap-4 lg:py-3.5 ${COLUMNAS}`}
          >
            <span className="order-1 font-mono text-xs font-medium text-gris lg:order-none">{codigoTarea(tarea.numero)}</span>
            <span className="order-3 col-span-2 min-w-0 lg:order-none lg:col-span-1">
              <span className="block font-semibold text-tinta group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors lg:truncate">{tarea.titulo}</span>
              {(conObra || conResponsable) && (
                <span className={`block truncate text-xs text-gris mt-0.5 ${conObra ? "" : "lg:hidden"}`}>
                  {conObra && obra(tarea.obraId)}
                  {conResponsable && (
                    <span className="lg:hidden">
                      {conObra && " · "}
                      {nombre(tarea.asignadaA)}
                    </span>
                  )}
                </span>
              )}
            </span>
            <span className="hidden truncate text-xs font-medium text-gris lg:block">{conResponsable && nombre(tarea.asignadaA)}</span>
            <span className="order-2 justify-self-end lg:order-none lg:justify-self-start">
              <Sello estado={tarea.estado} />
            </span>
            <span className="order-5 justify-self-end lg:order-none lg:justify-self-start">
              <Barras prioridad={tarea.prioridad} />
            </span>
            <span className="order-4 lg:order-none lg:text-right">
              <Vence tarea={tarea} />
              {vencida(tarea, hoy) && <span className="sr-only"> · {t.vencida}</span>}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// --- Tema ------------------------------------------------------------------

const oyentesTema = new Set<() => void>();
const temaActual = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

function subscribeTema(oyente: () => void) {
  oyentesTema.add(oyente);
  return () => {
    oyentesTema.delete(oyente);
  };
}

/** Selector de tema con preferencia persistente. */
export function Ajustes({ className = "" }: { className?: string }) {
  const { t } = useT();
  const tema = useSyncExternalStore(subscribeTema, temaActual, () => "light");
  const alternar = () => {
    const nuevo = tema === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nuevo);
    try {
      window.localStorage.setItem("relevo-tema", nuevo);
    } catch {
      // Sin almacenamiento el tema dura hasta recargar.
    }
    oyentesTema.forEach((o) => o());
  };
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        className="tema-toggle"
        onClick={alternar}
        aria-label={tema === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
        aria-pressed={tema === "dark"}
        title={t.comun.tema}
      >
        <Icon name={tema === "dark" ? "luna" : "sol"} /><span>{tema === "dark" ? "Oscuro" : "Claro"}</span>
      </button>
    </div>
  );
}

export function Cargando() {
  const { t } = useT();
  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center" role="status">
      <div className="flex flex-col items-center gap-3">
        <span className="font-display text-xl font-bold tracking-widest text-tinta">TRAZO</span>
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <span className="text-xs font-medium text-gris">{t.comun.cargando}</span>
      </div>
    </div>
  );
}

/** Lista corta de tareas para los tableros: tarjetas limpias y modernas. */
export function Renglones({
  tareas,
  vacio,
  conResponsable = false,
}: {
  tareas: Tarea[];
  vacio: string;
  conResponsable?: boolean;
}) {
  const nombre = useNombres();
  const obra = useObras();
  if (tareas.length === 0) return <p className="rounded-xl border border-dashed border-regla p-6 text-center text-sm text-gris">{vacio}</p>;
  return (
    <div className="grid grid-cols-1 gap-2.5">
      {tareas.map((tarea) => (
        <Link
          key={tarea.id}
          href={`/panel/tareas/${tarea.id}`}
          className="group block rounded-xl border border-regla bg-hoja p-3.5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md dark:hover:border-blue-900 sm:flex sm:items-center sm:justify-between sm:gap-4"
        >
          <div className="min-w-0">
            <p className="font-semibold text-tinta group-hover:text-blue-600 transition-colors sm:truncate">{tarea.titulo}</p>
            <p className="mt-1 flex items-center gap-2 text-xs text-gris">
              <span className="font-mono font-medium">{codigoTarea(tarea.numero)}</span>
              <span>·</span>
              <span className="truncate">{obra(tarea.obraId)}{conResponsable && ` · ${nombre(tarea.asignadaA)}`}</span>
            </p>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3 sm:mt-0 sm:shrink-0 sm:flex-col sm:items-end sm:gap-1.5">
            <Sello estado={tarea.estado} />
            <Vence tarea={tarea} />
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Encabezado de página moderno con jerarquía limpia. */
export function Encabezado({
  rotulo,
  titulo,
  children,
}: {
  rotulo?: string;
  titulo: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-heading flex flex-wrap items-center justify-between gap-4">
      <div>
        {rotulo && <p className="text-xs font-semibold uppercase tracking-wider text-gris">{rotulo}</p>}
        <h1 className="mt-1 font-sans text-2xl font-bold tracking-tight text-tinta sm:text-3xl">{titulo}</h1>
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </header>
  );
}

/** Título de una sección dentro de una página con badge de conteo. */
export function Seccion({ titulo, cuenta, children }: { titulo: string; cuenta?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-3.5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold text-tinta sm:text-lg">
          {titulo}
          {cuenta !== undefined && cuenta > 0 && (
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {cuenta}
            </span>
          )}
        </h2>
      </div>
      {children}
    </section>
  );
}
