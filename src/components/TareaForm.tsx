"use client";

import { useState } from "react";
import { PRIORIDADES } from "@/lib/flujo";
import { guardarTarea, useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { DatosTarea, Tarea } from "@/lib/types";
import { Barras, falloDe } from "./ui";

const VACIA: DatosTarea = { titulo: "", descripcion: "", prioridad: "media", vence: null, asignadaA: null };

/** Formulario para crear una tarea o editar una existente. */
export function TareaForm({
  tarea,
  onDone,
  onCancel,
}: {
  tarea?: Tarea;
  /** Recibe el id de la tarea guardada. */
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const { perfiles } = useStore();
  const { t } = useT();
  const [d, setD] = useState<DatosTarea>(
    tarea
      ? {
          titulo: tarea.titulo,
          descripcion: tarea.descripcion,
          prioridad: tarea.prioridad,
          vence: tarea.vence,
          asignadaA: tarea.asignadaA,
        }
      : VACIA,
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<DatosTarea>) => setD((prev) => ({ ...prev, ...patch }));

  // Se puede asignar a cualquier persona activa; quien ya tiene la tarea sigue en la lista aunque esté desactivada.
  const personas = perfiles.filter((p) => p.activo || p.id === tarea?.asignadaA);
  const cambiaResponsable = tarea && tarea.asignadaA && d.asignadaA && tarea.asignadaA !== d.asignadaA;

  const guardar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (d.titulo.trim().length < 3) return setError(t.formulario.tituloCorto);
    setGuardando(true);
    setError("");
    try {
      onDone(await guardarTarea(d, tarea?.id ?? null));
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={guardar} className="hoja animate-entrar space-y-5 p-5 sm:p-7">
      <h2 className="font-display text-2xl font-bold tracking-tight">
        {tarea ? t.formulario.editar : t.formulario.nueva}
      </h2>
      <div>
        <label className="etiqueta" htmlFor="titulo">
          {t.campos.titulo}
        </label>
        <input
          className="campo"
          id="titulo"
          value={d.titulo}
          onChange={(e) => set({ titulo: e.target.value })}
          maxLength={140}
          required
          autoFocus
        />
      </div>
      <div>
        <label className="etiqueta" htmlFor="descripcion">
          {t.campos.descripcion}
        </label>
        <textarea
          className="campo min-h-32 resize-y leading-relaxed"
          id="descripcion"
          value={d.descripcion}
          onChange={(e) => set({ descripcion: e.target.value })}
          maxLength={5000}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="etiqueta" htmlFor="responsable">
            {t.campos.responsable}
          </label>
          <select
            className="campo"
            id="responsable"
            value={d.asignadaA ?? ""}
            onChange={(e) => set({ asignadaA: e.target.value || null })}
          >
            <option value="">{t.formulario.borrador}</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {!p.userId ? ` (${t.comun.pendiente})` : !p.activo ? ` (${t.comun.inactivo})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="vence">
            {t.campos.vence}
          </label>
          <input
            className="campo"
            id="vence"
            type="date"
            value={d.vence ?? ""}
            onChange={(e) => set({ vence: e.target.value || null })}
          />
        </div>
      </div>
      <fieldset>
        <legend className="etiqueta">{t.campos.prioridad}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRIORIDADES.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={d.prioridad === p}
              onClick={() => set({ prioridad: p })}
              className={`flex items-center justify-between gap-3 rounded-[3px] border px-3 py-2.5 text-sm font-medium transition-colors ${
                d.prioridad === p ? "border-tinta bg-papel shadow-[3px_3px_0_var(--marca)]" : "border-regla hover:border-tinta"
              }`}
            >
              {t.prioridades[p]}
              <Barras prioridad={p} />
            </button>
          ))}
        </div>
      </fieldset>
      {cambiaResponsable && <p className="text-sm text-gris">{t.formulario.reasignar}</p>}
      {error && (
        <p role="alert" className="text-sm font-medium text-alerta">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={guardando}>
          {tarea ? t.formulario.guardar : t.formulario.crear}
        </button>
        <button type="button" className="btn btn-suave" onClick={onCancel}>
          {t.comun.cancelar}
        </button>
      </div>
    </form>
  );
}
