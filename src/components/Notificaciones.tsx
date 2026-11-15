"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { marcarNotificaciones, useStore } from "@/lib/store";
import { ESPERA_ADMIN, abierta, codigoTarea } from "@/lib/flujo";
import { useHoy } from "@/lib/fechas";
import { useT } from "@/lib/textos";

export function Notificaciones() {
  const { t, momento } = useT();
  const { perfil, eventos, tareas, seguimiento, vistoHasta } = useStore();
  const hoy = useHoy();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const id = useId();
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (evento: PointerEvent) => {
      if (!contenedor.current?.contains(evento.target as Node))
        setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);
  if (!perfil) return null;
  const avisos =
    perfil.rol === "cliente"
      ? seguimiento.flatMap((o) =>
          o.tareas
            .filter((t) => t.completada)
            .map((t) => ({
              id: t.id,
              fecha: t.completada!,
              texto: `Terminada · ${t.titulo}`,
              href: "/panel",
            })),
        )
      : eventos
          .filter((e) => e.actorId !== perfil.id && e.suceso !== "editar")
          .map((e) => ({
            id: e.id,
            fecha: e.fecha,
            texto: `${e.actor} · ${t.sucesos[e.suceso](e.nota)}`,
            href: `/panel/tareas/${e.tareaId}`,
          }));
  const nuevas = avisos.filter(
    (a) => !vistoHasta || a.fecha > vistoHasta,
  ).length;
  const pendientes = tareas.filter(
    (tarea) =>
      abierta(tarea) &&
      ((tarea.vence && tarea.vence <= hoy) ||
        (perfil.rol === "admin"
          ? ESPERA_ADMIN.includes(tarea.estado)
          : ["asignada", "devuelta"].includes(tarea.estado))),
  );
  return (
    <div className="relative" ref={contenedor}>
      <button
        type="button"
        ref={boton}
        className="btn btn-linea text-xs"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto(!abierto)}
      >
        Notificaciones
        {nuevas > 0 && (
          <span className="rounded-full bg-blue-600 px-2 text-white">
            {nuevas}
          </span>
        )}
      </button>
      {abierto && (
        <section
          id={id}
          aria-label="Notificaciones"
          className="trazo-avisos z-40 overflow-auto rounded-2xl border border-regla bg-hoja p-4 shadow-xl"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setAbierto(false);
              boton.current?.focus();
            }
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Actividad y pendientes</h2>
            <button
              className="enlace text-xs"
              disabled={guardando}
              onClick={async () => {
                setGuardando(true);
                try {
                  await marcarNotificaciones();
                  setError("");
                } catch {
                  setError("No se pudo guardar la lectura.");
                } finally {
                  setGuardando(false);
                }
              }}
            >
              Marcar como leídas
            </button>
          </div>
          {error && (
            <p role="alert" className="mensaje-error">
              {error}
            </p>
          )}
          {pendientes.length > 0 && (
            <div className="mb-3">
              <h3 className="etiqueta">Requieren atención</h3>
              {pendientes.slice(0, 10).map((tarea) => (
                <Link
                  key={tarea.id}
                  href={`/panel/tareas/${tarea.id}`}
                  onClick={() => setAbierto(false)}
                  className="block border-b border-regla py-2 text-sm"
                >
                  {codigoTarea(tarea.numero)} · {tarea.titulo}
                </Link>
              ))}
            </div>
          )}
          {!avisos.length && !pendientes.length && (
            <p className="text-sm text-gris">Estás al día.</p>
          )}
          {[...avisos]
            .sort((a, b) => b.fecha.localeCompare(a.fecha))
            .slice(0, 30)
            .map((aviso) => (
              <Link
                key={aviso.id}
                href={aviso.href}
                onClick={() => setAbierto(false)}
                className={`block border-b border-regla py-3 text-sm ${!vistoHasta || aviso.fecha > vistoHasta ? "font-semibold" : "text-gris"}`}
              >
                {aviso.texto}
                <time className="mt-1 block text-xs font-normal">
                  {momento(aviso.fecha)}
                </time>
              </Link>
            ))}
        </section>
      )}
    </div>
  );
}
