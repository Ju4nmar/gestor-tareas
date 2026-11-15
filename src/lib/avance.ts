import type { Tarea, TareaCliente } from "./types";

export function avanceDe(tareas: (Tarea | TareaCliente)[]) {
  const visibles = tareas.filter((t) => !("archivada" in t && t.archivada));
  const total = visibles.reduce((suma, t) => suma + (t.peso ?? 1), 0);
  const hechas = visibles.reduce((suma, t) => {
    const terminada =
      "estado" in t ? t.estado === "completada" : t.etapa === "terminada";
    return suma + (terminada ? (t.peso ?? 1) : 0);
  }, 0);
  return {
    total,
    hechas,
    porcentaje: total ? Math.round((100 * hechas) / total) : 0,
  };
}
