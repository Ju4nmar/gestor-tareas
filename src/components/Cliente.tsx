"use client";

import { useState } from "react";
import { fechaLocal, useHoy } from "@/lib/fechas";
import { ETAPAS } from "@/lib/flujo";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { Etapa, TareaCliente } from "@/lib/types";
import { Visor, esFoto, useUrls } from "./Archivos";
import { Avance, Seccion } from "./ui";

/** Color de cada etapa: los mismos de los estados del equipo. */
const COLOR: Record<Etapa, string> = {
  pendiente: "var(--e-borrador)",
  en_proceso: "var(--e-en_curso)",
  terminada: "var(--e-completada)",
};

/**
 * Lo que ve el cliente de una obra: cuánto va, las fotos y las tareas en tres
 * etapas. Es solo de lectura y no muestra nada interno del equipo.
 */
export function VistaCliente() {
  const { perfil, seguimiento } = useStore();
  const { t, dia, hoyLargo } = useT();
  const hoy = useHoy();
  const [elegida, setElegida] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);

  const obra = seguimiento.find((o) => o.id === elegida) ?? seguimiento[0];
  const archivos = obra?.archivos ?? [];
  const urls = useUrls(archivos);
  if (!perfil) return null;

  const tareas = obra?.tareas ?? [];
  const de = (etapa: Etapa) => tareas.filter((x) => x.etapa === etapa);
  const hechas = de("terminada").length;
  const titulo = new Map(tareas.map((x) => [x.id, x.titulo]));
  const grande = archivos.find((a) => a.id === abierta);

  const cuando = (x: TareaCliente) =>
    x.completada
      ? t.cliente.terminadaEl(dia(fechaLocal(new Date(x.completada))))
      : x.vence
        ? t.cliente.para(dia(x.vence))
        : "";

  return (
    <div className="space-y-8 sm:space-y-10">
      <header>
        <p className="rotulo first-letter:uppercase">{hoy ? hoyLargo(hoy) : ""}</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-tinta sm:text-4xl">
          {t.inicio.hola(perfil.nombre.split(" ")[0])}
        </h1>
      </header>

      {!obra ? (
        <div className="hoja p-8 text-center text-gris">{t.cliente.sinObras}</div>
      ) : (
        <>
          {seguimiento.length > 1 && (
            <div
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
              role="group"
              aria-label={t.cliente.tusObras}
            >
              {seguimiento.map((o) => (
                <button
                  key={o.id}
                  aria-pressed={o.id === obra.id}
                  onClick={() => setElegida(o.id)}
                  className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-medium whitespace-nowrap transition-all ${
                    o.id === obra.id
                      ? "bg-blue-600 text-white shadow-xs"
                      : "border border-regla bg-hoja text-slate-700 hover:border-slate-300 dark:text-slate-300"
                  }`}
                >
                  {o.nombre}
                </button>
              ))}
            </div>
          )}

          {/* Tarjeta de resumen de obra principal */}
          <section className="hoja border-regla bg-gradient-to-br from-white to-slate-50/70 p-6 shadow-sm sm:p-8 dark:from-slate-900 dark:to-slate-900/60">
            <span className="inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              {obra.activa ? t.campos.obra : t.cliente.terminadaObra}
            </span>
            <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight tracking-tight text-tinta sm:text-3xl">
              {obra.nombre}
            </h2>
            {obra.detalle && <p className="mt-1.5 text-sm text-gris">{obra.detalle}</p>}

            <div className="mt-8 flex items-baseline justify-between gap-4">
              <div>
                <span className="font-display text-5xl font-extrabold leading-none tracking-tight text-tinta sm:text-6xl">
                  {tareas.length ? Math.round((hechas / tareas.length) * 100) : 0}
                  <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">%</span>
                </span>
                <span className="block text-xs font-medium text-gris mt-1">Avance total completado</span>
              </div>
              <span className="text-right text-xs font-semibold text-gris">
                {tareas.length ? t.cliente.avance(hechas, tareas.length) : t.cliente.sinTareas}
              </span>
            </div>
            <div className="mt-4">
              <Avance hechas={hechas} total={tareas.length} />
            </div>

            <dl className="mt-8 grid grid-cols-3 gap-3 border-t border-regla pt-6">
              {ETAPAS.map((etapa) => (
                <div key={etapa} className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/40">
                  <dd className="font-display text-2xl font-bold text-tinta sm:text-3xl">{de(etapa).length}</dd>
                  <dt className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gris">
                    <span aria-hidden className="h-2 w-2 rounded-full shrink-0" style={{ background: COLOR[etapa] }} />
                    <span className="truncate">{t.etapas[etapa]}</span>
                  </dt>
                </div>
              ))}
            </dl>
          </section>

          {/* Fotos y documentos */}
          <Seccion titulo={t.cliente.fotos} cuenta={archivos.length}>
            {archivos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-regla py-8 text-center text-sm text-gris">
                {t.cliente.sinFotos}
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {archivos.map((a) => (
                  <li key={a.id} className="hoja group overflow-hidden border border-regla shadow-xs transition-shadow hover:shadow-md">
                    {esFoto(a) ? (
                      <button
                        type="button"
                        className="block w-full overflow-hidden bg-slate-100 dark:bg-slate-800"
                        onClick={() => setAbierta(a.id)}
                        aria-label={`${t.archivos.abrir}: ${a.nombre}`}
                      >
                        {urls[a.id] ? (
                          // eslint-disable-next-line @next/next/no-img-element -- foto del almacén privado, con enlace temporal
                          <img
                            src={urls[a.id]}
                            alt={a.nombre}
                            loading="lazy"
                            className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <span className="block aspect-[4/3] w-full animate-pulse bg-slate-200 dark:bg-slate-700" />
                        )}
                      </button>
                    ) : (
                      <a
                        href={urls[a.id] || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-slate-50 transition-colors hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800"
                      >
                        <span className="rounded-md border border-regla bg-hoja px-2 py-0.5 text-xs font-bold text-tinta">
                          PDF
                        </span>
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{t.archivos.abrir}</span>
                      </a>
                    )}
                    <div className="p-3">
                      <p className="truncate text-xs font-semibold text-tinta">{titulo.get(a.tareaId) ?? a.nombre}</p>
                      <p className="mt-0.5 text-[11px] text-gris">{dia(fechaLocal(new Date(a.fecha)))}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          {/* Tareas por etapa */}
          <Seccion titulo={t.cliente.tareas} cuenta={tareas.length}>
            {tareas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-regla py-8 text-center text-sm text-gris">
                {t.cliente.sinTareas}
              </p>
            ) : (
              <div className="space-y-6">
                {ETAPAS.filter((etapa) => de(etapa).length > 0).map((etapa) => (
                  <div key={etapa} className="hoja p-4 sm:p-5">
                    <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-tinta">
                      <span aria-hidden className="h-2 w-2 rounded-full shrink-0" style={{ background: COLOR[etapa] }} />
                      {t.etapas[etapa]}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-gris dark:bg-slate-800">
                        {de(etapa).length}
                      </span>
                    </h3>
                    <ul className="mt-3 divide-y divide-regla">
                      {de(etapa).map((x) => (
                        <li key={x.id} className="py-2.5 sm:flex sm:items-baseline sm:justify-between sm:gap-6">
                          <span className={`block text-sm font-medium ${etapa === "terminada" ? "text-gris line-through" : "text-tinta"}`}>
                            {x.titulo}
                          </span>
                          <span className="mt-0.5 block shrink-0 text-xs text-gris sm:mt-0">{cuando(x)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Seccion>

          <p className="text-xs text-gris text-center">{t.cliente.privado}</p>
        </>
      )}

      {grande && urls[grande.id] && (
        <Visor
          url={urls[grande.id]}
          nombre={grande.nombre}
          pie={titulo.get(grande.tareaId) ?? grande.nombre}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </div>
  );
}
