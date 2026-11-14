"use client";

import { useState } from "react";
import { PRIORIDADES } from "@/lib/flujo";
import { guardarTarea, subirArchivos, useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { DatosTarea, Tarea } from "@/lib/types";
import { Elegidos, Elegir } from "./Archivos";
import { Barras, falloDe } from "./ui";

const VACIA: DatosTarea = { titulo: "", descripcion: "", prioridad: "media", vence: null, asignadaA: null, obraId: null };

/** Formulario para crear una tarea o editar una existente. */
export function TareaForm({
  tarea,
  obraInicial = null,
  onDone,
  onCancel,
}: {
  tarea?: Tarea;
  obraInicial?: string | null;
  onDone: (id: string, sinArchivos: boolean) => void;
  onCancel: () => void;
}) {
  const { perfiles, obras } = useStore();
  const { t } = useT();
  const [d, setD] = useState<DatosTarea>(
    tarea
      ? {
          titulo: tarea.titulo,
          descripcion: tarea.descripcion,
          prioridad: tarea.prioridad,
          vence: tarea.vence,
          asignadaA: tarea.asignadaA,
          obraId: tarea.obraId,
        }
      : { ...VACIA, obraId: obraInicial },
  );
  const [files, setFiles] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<DatosTarea>) => setD((prev) => ({ ...prev, ...patch }));

  const personas = perfiles.filter((p) => p.rol !== "cliente" && (p.activo || p.id === tarea?.asignadaA));
  const elegibles = obras.filter((o) => o.activa || o.id === tarea?.obraId);
  const cambiaResponsable = tarea && tarea.asignadaA && d.asignadaA && tarea.asignadaA !== d.asignadaA;

  const guardar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (d.titulo.trim().length < 3) return setError(t.formulario.tituloCorto);
    setGuardando(true);
    setError("");
    let id: string;
    try {
      id = await guardarTarea(d, tarea?.id ?? null);
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
      setGuardando(false);
      return;
    }
    let sinArchivos = false;
    if (files.length) {
      try {
        await subirArchivos(id, files);
      } catch {
        sinArchivos = true;
      }
    }
    onDone(id, sinArchivos);
  };

  return (
    <form onSubmit={guardar} className="space-y-5">
      <h2 className="font-display text-xl font-bold tracking-tight text-tinta sm:text-2xl">
        {tarea ? t.formulario.editar : t.formulario.nueva}
      </h2>
      <div>
        <label className="etiqueta" htmlFor="obra">
          {t.campos.obra}
        </label>
        <select className="campo" id="obra" value={d.obraId ?? ""} onChange={(e) => set({ obraId: e.target.value || null })}>
          <option value="">{t.comun.sinObra}</option>
          {elegibles.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
              {!o.activa ? ` (${t.obras.archivada.toLowerCase()})` : ""}
            </option>
          ))}
        </select>
      </div>
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
          className="campo min-h-28 resize-y leading-relaxed text-sm"
          id="descripcion"
          value={d.descripcion}
          onChange={(e) => set({ descripcion: e.target.value })}
          maxLength={5000}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {PRIORIDADES.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={d.prioridad === p}
              onClick={() => set({ prioridad: p })}
              className={`flex min-h-12 items-center justify-between gap-2.5 rounded-xl border p-3 text-xs font-semibold transition-all ${
                d.prioridad === p
                  ? "border-blue-500 bg-blue-50/70 text-blue-700 shadow-xs dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-300"
                  : "border-regla bg-hoja text-slate-700 hover:border-slate-300 dark:text-slate-300"
              }`}
            >
              <span>{t.prioridades[p]}</span>
              <Barras prioridad={p} />
            </button>
          ))}
        </div>
      </fieldset>
      {!tarea && (
        <div className="rounded-xl border border-dashed border-regla p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gris mb-2">{t.archivos.alCrear}</p>
          <Elegir onElegir={(nuevos) => setFiles((prev) => [...prev, ...nuevos])} ocupado={guardando} />
          <Elegidos files={files} onQuitar={(i) => setFiles((prev) => prev.filter((_, n) => n !== i))} />
          <p className="mt-2 text-xs text-gris">{files.length ? t.archivos.elegidos(files.length) : t.archivos.ayuda}</p>
        </div>
      )}
      {cambiaResponsable && <p className="text-xs text-gris">{t.formulario.reasignar}</p>}
      {error && (
        <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2.5 pt-2">
        <button className="btn btn-marca" disabled={guardando}>
          {guardando && files.length ? t.archivos.subiendo : tarea ? t.formulario.guardar : t.formulario.crear}
        </button>
        <button type="button" className="btn btn-linea" onClick={onCancel} disabled={guardando}>
          {t.comun.cancelar}
        </button>
      </div>
    </form>
  );
}
