"use client";

import Link from "next/link";
import { useState } from "react";
import { Encabezado, ListaTareas, SIN_MENSAJE, frase } from "@/components/ui";
import { codigoTarea } from "@/lib/flujo";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/textos";

const MAXIMO = 150;

export default function HistorialPage() {
  const { perfil, tareas, eventos, perfiles } = useStore();
  const { t, momento } = useT();
  const [vista, setVista] = useState<"actividad" | "completadas">("actividad");
  const [persona, setPersona] = useState("");
  if (!perfil) return null;

  const admin = perfil.rol === "admin";
  const porId = new Map(tareas.map((x) => [x.id, x]));
  const actividad = eventos.filter((e) => !persona || e.actorId === persona).slice(0, MAXIMO);
  const completadas = tareas
    .filter((x) => x.estado === "completada")
    .sort((a, b) => (b.completada ?? "").localeCompare(a.completada ?? ""));

  return (
    <div className="space-y-8">
      <Encabezado titulo={t.historial.titulo} />
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-regla">
        <div className="flex gap-6">
          {(["actividad", "completadas"] as const).map((v) => (
            <button key={v} className={`pestana ${vista === v ? "pestana-activa" : ""}`} onClick={() => setVista(v)}>
              {t.historial[v]}
              {v === "completadas" && <span className="ml-2 font-mono text-xs">{completadas.length}</span>}
            </button>
          ))}
        </div>
        {admin && vista === "actividad" && (
          <select
            className="campo mb-2 w-auto py-1.5 text-sm"
            aria-label={t.historial.persona}
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
          >
            <option value="">
              {t.historial.persona}: {t.comun.todas.toLowerCase()}
            </option>
            {perfiles
              .filter((p) => p.userId)
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
          <p className="py-10 text-center text-gris">{t.historial.sinCompletadas}</p>
        ) : (
          <ListaTareas tareas={completadas} conResponsable={admin} conObra />
        )
      ) : actividad.length === 0 ? (
        <p className="py-10 text-center text-gris">{t.historial.vacio}</p>
      ) : (
        <ol>
          {actividad.map((e) => {
            const tarea = porId.get(e.tareaId);
            return (
              <li key={e.id} className="grid grid-cols-1 gap-x-6 gap-y-1 border-b border-regla py-3.5 sm:grid-cols-[9.5rem_1fr]">
                <span className="font-mono text-xs text-gris sm:pt-1">{momento(e.fecha)}</span>
                <div className="min-w-0">
                  <p>
                    <span className="font-semibold">{e.actor}</span> {frase(t, e)}
                  </p>
                  {tarea && (
                    <Link href={`/panel/tareas/${tarea.id}`} className="group mt-0.5 flex items-baseline gap-2 text-sm text-gris">
                      <span className="font-mono text-xs">{codigoTarea(tarea.numero)}</span>
                      <span className="truncate underline-offset-4 group-hover:text-tinta group-hover:underline">
                        {tarea.titulo}
                      </span>
                    </Link>
                  )}
                  {e.nota && !SIN_MENSAJE.has(e.suceso) && (
                    <blockquote className="mt-2 line-clamp-3 whitespace-pre-wrap border-l-2 border-tinta pl-3 text-[15px] leading-relaxed">
                      {e.nota}
                    </blockquote>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
