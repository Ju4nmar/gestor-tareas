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
    <div className="space-y-10">
      <header>
        <p className="rotulo first-letter:uppercase">{hoy ? hoyLargo(hoy) : ""}</p>
        <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          {t.inicio.hola(perfil.nombre.split(" ")[0])}
        </h1>
      </header>

      {!obra ? (
        <p className="border-y border-regla py-12 text-center text-gris">{t.cliente.sinObras}</p>
      ) : (
        <>
          {seguimiento.length > 1 && (
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label={t.cliente.tusObras}>
              {seguimiento.map((o) => (
                <button
                  key={o.id}
                  aria-pressed={o.id === obra.id}
                  onClick={() => setElegida(o.id)}
                  className={`min-h-11 shrink-0 rounded-[3px] border px-4 text-sm font-medium whitespace-nowrap transition-colors ${
                    o.id === obra.id ? "border-tinta bg-tinta text-papel" : "border-tinta/30 hover:border-tinta"
                  }`}
                >
                  {o.nombre}
                </button>
              ))}
            </div>
          )}

          <section className="hoja border-tinta p-5 shadow-[5px_5px_0_var(--marca)] sm:p-7">
            <p className="rotulo">{obra.activa ? t.campos.obra : t.cliente.terminadaObra}</p>
            <h2 className="mt-1 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{obra.nombre}</h2>
            {obra.detalle && <p className="mt-1 text-gris">{obra.detalle}</p>}

            <div className="mt-7 flex items-end justify-between gap-4">
              <span className="font-display text-6xl font-extrabold leading-none tracking-tight">
                {tareas.length ? Math.round((hechas / tareas.length) * 100) : 0}
                <span className="text-3xl">%</span>
              </span>
              <span className="pb-1 text-right text-sm">
                {tareas.length ? t.cliente.avance(hechas, tareas.length) : t.cliente.sinTareas}
              </span>
            </div>
            <div className="mt-3">
              <Avance hechas={hechas} total={tareas.length} />
            </div>

            <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-regla pt-5">
              {ETAPAS.map((etapa) => (
                <div key={etapa}>
                  <dd className="font-display text-3xl font-bold leading-none">{de(etapa).length}</dd>
                  <dt className="mt-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.07em] text-gris">
                    <span aria-hidden className="h-2 w-2 shrink-0" style={{ background: COLOR[etapa] }} />
                    {t.etapas[etapa]}
                  </dt>
                </div>
              ))}
            </dl>
          </section>

          <Seccion titulo={t.cliente.fotos} cuenta={archivos.length}>
            {archivos.length === 0 ? (
              <p className="border-t border-regla py-4 text-gris">{t.cliente.sinFotos}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {archivos.map((a) => (
                  <li key={a.id} className="hoja overflow-hidden">
                    {esFoto(a) ? (
                      <button type="button" className="block w-full" onClick={() => setAbierta(a.id)} aria-label={`${t.archivos.abrir}: ${a.nombre}`}>
                        {urls[a.id] ? (
                          // eslint-disable-next-line @next/next/no-img-element -- foto del almacén privado, con enlace temporal
                          <img src={urls[a.id]} alt={a.nombre} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                        ) : (
                          <span className="block aspect-[4/3] w-full animate-pulse bg-regla" />
                        )}
                      </button>
                    ) : (
                      <a
                        href={urls[a.id] || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-papel"
                      >
                        <span className="border border-tinta px-2 py-1 font-mono text-xs font-medium">PDF</span>
                        <span className="enlace text-sm">{t.archivos.abrir}</span>
                      </a>
                    )}
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-medium">{titulo.get(a.tareaId) ?? a.nombre}</p>
                      <p className="font-mono text-[11px] text-gris">{dia(fechaLocal(new Date(a.fecha)))}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          <Seccion titulo={t.cliente.tareas} cuenta={tareas.length}>
            {tareas.length === 0 ? (
              <p className="border-t border-regla py-4 text-gris">{t.cliente.sinTareas}</p>
            ) : (
              <div className="space-y-7 border-t border-tinta pt-5">
                {ETAPAS.filter((etapa) => de(etapa).length > 0).map((etapa) => (
                  <div key={etapa}>
                    <h3 className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.07em]">
                      <span aria-hidden className="h-2 w-2 shrink-0" style={{ background: COLOR[etapa] }} />
                      {t.etapas[etapa]}
                      <span className="font-normal text-gris">{de(etapa).length}</span>
                    </h3>
                    <ul className="mt-2 border-t border-regla">
                      {de(etapa).map((x) => (
                        <li key={x.id} className="border-b border-regla py-3 sm:flex sm:items-baseline sm:justify-between sm:gap-6">
                          <span className={`block font-medium ${etapa === "terminada" ? "text-gris" : ""}`}>{x.titulo}</span>
                          <span className="mt-0.5 block shrink-0 font-mono text-xs whitespace-nowrap text-gris sm:mt-0">{cuando(x)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Seccion>

          <p className="text-sm text-gris">{t.cliente.privado}</p>
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
