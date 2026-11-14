"use client";

import Link from "next/link";
import { useState } from "react";
import { Encabezado, ListaTareas, SIN_MENSAJE, frase } from "@/components/ui";
import { codigoTarea } from "@/lib/flujo";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/textos";

const MAXIMO = 150;

export default function HistorialPage() {
  const { perfil, tareas, archivadas, eventos, perfiles } = useStore();
  const { t, momento } = useT();
  const [vista, setVista] = useState<"actividad" | "completadas">("actividad");
  const [persona, setPersona] = useState("");
  if (!perfil) return null;

  const admin = perfil.rol === "admin";
  const porId = new Map([...tareas, ...archivadas].map((x) => [x.id, x]));
  const actividad = eventos.filter((e) => !persona || e.actorId === persona).slice(0, MAXIMO);
  const completadas = tareas
    .filter((x) => x.estado === "completada")
    .sort((a, b) => (b.completada ?? "").localeCompare(a.completada ?? ""));

  return (
    <div className="space-y-6 sm:space-y-8">
      <Encabezado titulo={t.historial.titulo} />

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-regla pb-2">
        <div className="flex gap-2">
          {(["actividad", "completadas"] as const).map((v) => (
            <button key={v} aria-pressed={vista === v} className={`pestana ${vista === v ? "pestana-activa" : ""}`} onClick={() => setVista(v)}>
              {t.historial[v]}
              {v === "completadas" && (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-gris dark:bg-slate-800">
                  {completadas.length}
                </span>
              )}
            </button>
          ))}
        </div>
        {admin && vista === "actividad" && (
          <select
            className="campo w-auto py-1.5 text-xs font-semibold"
            aria-label={t.historial.persona}
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
          >
            <option value="">
              {t.historial.persona}: {t.comun.todas.toLowerCase()}
            </option>
            {perfiles
              .filter((p) => p.userId && p.rol !== "cliente")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </select>
        )}
      </div>

      {vista === "completadas" ? (
        completadas.length === 0 ? (
          <div className="hoja p-12 text-center text-sm text-gris">{t.historial.sinCompletadas}</div>
        ) : (
          <ListaTareas tareas={completadas} conResponsable={admin} conObra />
        )
      ) : actividad.length === 0 ? (
        <div className="hoja p-12 text-center text-sm text-gris">{t.historial.vacio}</div>
      ) : (
        <ol className="historial-timeline divide-y divide-regla rounded-2xl border border-regla bg-hoja shadow-xs overflow-hidden">
          {actividad.map((e) => {
            const tarea = porId.get(e.tareaId);
            return (
              <li key={e.id} className="p-4 transition-colors hover:bg-slate-50/50 sm:p-5 dark:hover:bg-slate-800/30">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <p className="text-sm font-semibold text-tinta">
                    {e.actor} <span className="font-normal text-gris">{frase(t, e)}</span>
                  </p>
                  <span className="text-[11px] font-mono text-gris">{momento(e.fecha)}</span>
                </div>
                {tarea && (
                  <div className="mt-1">
                    <Link
                      href={`/panel/tareas/${tarea.id}`}
                      className="group inline-flex items-center gap-2 text-xs font-medium text-gris hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {codigoTarea(tarea.numero)}
                      </span>
                      <span className="truncate">{tarea.titulo}</span>
                    </Link>
                  </div>
                )}
                {e.nota && !SIN_MENSAJE.has(e.suceso) && (
                  <blockquote className="mt-2.5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-tinta dark:bg-slate-800/40">
                    {e.nota}
                  </blockquote>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
