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
  /** Obra que viene elegida al crear una tarea desde la lista de una obra. */
  obraInicial?: string | null;
  /** Recibe el id de la tarea guardada y si alguno de sus archivos no se pudo subir. */
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
  // Planos o fotos que se suben al crear la tarea; después se manejan desde la tarea.
  const [files, setFiles] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<DatosTarea>) => setD((prev) => ({ ...prev, ...patch }));

  // Se puede asignar a cualquier persona activa; quien ya tiene la tarea sigue en la lista aunque esté desactivada.
  const personas = perfiles.filter((p) => p.activo || p.id === tarea?.asignadaA);
  // Lo mismo con las obras: las archivadas no se ofrecen, salvo la que ya tiene la tarea.
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
    // La tarea ya quedó guardada: si un archivo falla, se avisa en la tarea en vez de repetir el formulario.
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
    <form onSubmit={guardar} className="hoja animate-entrar space-y-5 p-5 sm:p-7">
      <h2 className="font-display text-2xl font-bold tracking-tight">
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
          className="campo min-h-32 resize-y leading-relaxed"
          id="descripcion"
          value={d.descripcion}
          onChange={(e) => set({ descripcion: e.target.value })}
          maxLength={5000}
        />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
              className={`flex min-h-12 items-center justify-between gap-3 rounded-[3px] border px-3 py-2.5 text-sm font-medium transition-colors sm:min-h-0 ${
                d.prioridad === p ? "border-tinta bg-papel shadow-[3px_3px_0_var(--marca)]" : "border-regla hover:border-tinta"
              }`}
            >
              {t.prioridades[p]}
              <Barras prioridad={p} />
            </button>
          ))}
        </div>
      </fieldset>
      {!tarea && (
        <div>
          <p className="etiqueta">{t.archivos.alCrear}</p>
          <Elegir onElegir={(nuevos) => setFiles((prev) => [...prev, ...nuevos])} ocupado={guardando} />
          <Elegidos files={files} onQuitar={(i) => setFiles((prev) => prev.filter((_, n) => n !== i))} />
          <p className="mt-2 text-xs text-gris">{files.length ? t.archivos.elegidos(files.length) : t.archivos.ayuda}</p>
        </div>
      )}
      {cambiaResponsable && <p className="text-sm text-gris">{t.formulario.reasignar}</p>}
      {error && (
        <p role="alert" className="text-sm font-medium text-alerta">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={guardando}>
          {guardando && files.length ? t.archivos.subiendo : tarea ? t.formulario.guardar : t.formulario.crear}
        </button>
        <button type="button" className="btn btn-suave" onClick={onCancel} disabled={guardando}>
          {t.comun.cancelar}
        </button>
      </div>
    </form>
  );
}
