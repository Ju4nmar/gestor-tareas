"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useHoy } from "@/lib/fechas";
import { ErrorFlujo, abierta, codigoTarea, diasRestantes, vencida } from "@/lib/flujo";
import { useStore } from "@/lib/store";
import { type Textos, cambiarIdioma, useT } from "@/lib/textos";
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

/** Nombre de la aplicación, con su punto de resaltador. */
export function Logo({ className = "text-2xl" }: { className?: string }) {
  const { t } = useT();
  return (
    <span className={`inline-flex items-baseline font-display font-extrabold lowercase tracking-tight ${className}`}>
      {t.marca}
      <span aria-hidden className="ml-[0.08em] inline-block h-[0.24em] w-[0.24em] bg-marca" />
    </span>
  );
}

/** Estado de una tarea: un cuadro de su color y el nombre. */
export function Sello({ estado, className = "" }: { estado: Estado; className?: string }) {
  const { t } = useT();
  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.07em] whitespace-nowrap ${className}`}
    >
      <span aria-hidden className="h-2 w-2 shrink-0" style={{ background: `var(--e-${estado})` }} />
      {t.estados[estado]}
    </span>
  );
}

const NIVEL: Record<Prioridad, number> = { baja: 1, media: 2, alta: 3, urgente: 4 };

/** Prioridad como cuatro barras que se van llenando. */
export function Barras({ prioridad, conTexto = false }: { prioridad: Prioridad; conTexto?: boolean }) {
  const { t } = useT();
  const color = prioridad === "urgente" ? "bg-alerta" : "bg-tinta";
  return (
    <span className="inline-flex items-center gap-2" title={`${t.campos.prioridad}: ${t.prioridades[prioridad]}`}>
      <span aria-hidden className="flex items-end gap-[2px]">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={`w-[3px] ${n <= NIVEL[prioridad] ? color : "bg-regla"}`}
            style={{ height: 3 + n * 3 }}
          />
        ))}
      </span>
      <span className={conTexto ? `text-sm ${prioridad === "urgente" ? "font-semibold text-alerta" : ""}` : "sr-only"}>
        {t.prioridades[prioridad]}
      </span>
    </span>
  );
}

/** Fecha límite con lo que falta: "15 oct · en 3 días", en rojo si ya pasó. */
export function Vence({ tarea, className = "" }: { tarea: Tarea; className?: string }) {
  const { t, dia } = useT();
  const hoy = useHoy();
  if (!tarea.vence) return <span className={`font-mono text-xs text-gris ${className}`}>{t.comun.sinFecha}</span>;
  const dias = diasRestantes(tarea, hoy);
  const fecha = dia(tarea.vence);
  if (!abierta(tarea) || dias === null || dias > 7) {
    return <span className={`font-mono text-xs whitespace-nowrap text-gris ${className}`}>{fecha}</span>;
  }
  const { fechas } = t;
  const falta =
    dias === 0 ? fechas.hoy : dias === 1 ? fechas.manana : dias > 1 ? fechas.en(dias) : dias === -1 ? fechas.ayer : fechas.hace(-dias);
  return (
    <span className={`font-mono text-xs whitespace-nowrap ${dias < 0 ? "font-medium text-alerta" : ""} ${className}`}>
      {fecha} · {dias === 0 ? <span className="resaltado">{falta}</span> : falta}
    </span>
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
export const SIN_MENSAJE = new Set<Evento["suceso"]>(["crear", "asignar", "reasignar", "desasignar", "editar", "adjuntar"]);

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

/** Avance de una obra: barra con las tareas completadas sobre el total. */
export function Avance({ hechas, total }: { hechas: number; total: number }) {
  return (
    <span className="block h-2.5 w-full bg-regla" aria-hidden>
      <span className="block h-full bg-[var(--e-completada)]" style={{ width: `${total ? (hechas / total) * 100 : 0}%` }} />
    </span>
  );
}

const COLUMNAS = "lg:grid-cols-[4.5rem_minmax(0,1fr)_9rem_10.5rem_2rem_12.5rem]";

/** Lista de tareas con reglas: tabla en pantallas anchas, filas apiladas en el celular. */
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
    <div className="border-t border-tinta">
      <div className={`hidden gap-4 border-b border-regla py-2 ${cabecera ? "lg:grid" : ""} ${COLUMNAS}`}>
        <span className="rotulo">{t.campos.codigo}</span>
        <span className="rotulo">{t.campos.tarea}</span>
        <span className="rotulo">{conResponsable ? t.campos.responsable : ""}</span>
        <span className="rotulo">{t.campos.estado}</span>
        {/* La columna de prioridad no lleva título visible, pero ocupa su lugar en la cuadrícula. */}
        <span>
          <span className="sr-only">{t.campos.prioridad}</span>
        </span>
        <span className="rotulo text-right whitespace-nowrap">{t.campos.vence}</span>
      </div>
      {tareas.map((tarea) => (
        <Link
          key={tarea.id}
          href={`/panel/tareas/${tarea.id}`}
          className={`group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 border-b border-regla py-3.5 transition-colors hover:bg-hoja lg:gap-4 lg:px-0 ${COLUMNAS}`}
        >
          <span className="order-1 font-mono text-xs text-gris lg:order-none">{codigoTarea(tarea.numero)}</span>
          <span className="order-3 col-span-2 min-w-0 lg:order-none lg:col-span-1">
            <span className="block font-medium underline-offset-4 group-hover:underline lg:truncate">{tarea.titulo}</span>
            {(conObra || conResponsable) && (
              <span className={`block truncate text-sm text-gris ${conObra ? "" : "lg:hidden"}`}>
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
          <span className="hidden truncate text-sm text-gris lg:block">{conResponsable && nombre(tarea.asignadaA)}</span>
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
  );
}

// --- Tema e idioma ----------------------------------------------------------

const oyentesTema = new Set<() => void>();
const temaActual = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

function subscribeTema(oyente: () => void) {
  oyentesTema.add(oyente);
  return () => {
    oyentesTema.delete(oyente);
  };
}

/** Botones pequeños para cambiar de idioma y de tema. */
export function Ajustes({ className = "" }: { className?: string }) {
  const { t, idioma } = useT();
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
  const boton = "font-mono text-[11px] uppercase tracking-[0.09em] text-gris transition-colors hover:text-tinta";
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <button type="button" className={boton} onClick={() => cambiarIdioma(idioma === "es" ? "en" : "es")}>
        {t.comun.idioma}
      </button>
      <button type="button" className={boton} onClick={alternar} aria-label={t.comun.tema} title={t.comun.tema}>
        <span aria-hidden className="mr-1.5 inline-block h-2 w-2 translate-y-[-1px] rounded-full border border-current bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]" />
        {tema === "dark" ? "Dark" : "Light"}
      </button>
    </div>
  );
}

export function Cargando() {
  const { t } = useT();
  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center" role="status">
      <span className="rotulo animate-pulse">{t.comun.cargando}</span>
    </div>
  );
}

/** Lista corta de tareas para los tableros: dos líneas por tarea. */
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
  if (tareas.length === 0) return <p className="border-t border-regla py-4 text-sm text-gris">{vacio}</p>;
  return (
    <ul className="border-t border-regla">
      {tareas.map((tarea) => (
        <li key={tarea.id} className="border-b border-regla">
          <Link href={`/panel/tareas/${tarea.id}`} className="group block py-3.5 sm:flex sm:items-start sm:justify-between sm:gap-4 sm:py-3">
            <span className="block min-w-0">
              <span className="block font-medium underline-offset-4 group-hover:underline sm:truncate">{tarea.titulo}</span>
              <span className="mt-0.5 flex items-center gap-2 text-sm text-gris">
                <span className="shrink-0 font-mono text-xs whitespace-nowrap">{codigoTarea(tarea.numero)}</span>
                <span className="truncate">
                  · {obra(tarea.obraId)}
                  {conResponsable && ` · ${nombre(tarea.asignadaA)}`}
                </span>
              </span>
            </span>
            <span className="mt-2 flex items-center justify-between gap-3 sm:mt-0 sm:shrink-0 sm:flex-col sm:items-end sm:gap-1.5 sm:pt-0.5">
              <Sello estado={tarea.estado} />
              <Vence tarea={tarea} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Encabezado de página: una línea pequeña arriba y el título grande. */
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
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {rotulo && <p className="rotulo first-letter:uppercase">{rotulo}</p>}
        <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{titulo}</h1>
      </div>
      {children}
    </header>
  );
}

/** Título de una sección dentro de una página. */
export function Seccion({ titulo, cuenta, children }: { titulo: string; cuenta?: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-3 font-display text-xl font-bold tracking-tight">
        {titulo}
        {cuenta !== undefined && cuenta > 0 && <span className="font-mono text-xs font-normal text-gris">{cuenta}</span>}
      </h2>
      {children}
    </section>
  );
}
