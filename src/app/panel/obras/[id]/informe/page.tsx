"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { avanceDe } from "@/lib/avance";
import { etapaDe, codigoTarea } from "@/lib/flujo";
import { useHoy } from "@/lib/fechas";
import { esFoto, useUrls } from "@/components/Archivos";
import { useT } from "@/lib/textos";

export default function InformeObra() {
  const { id } = useParams<{ id: string }>();
  const { perfil, empresa, obras, tareas, archivos } = useStore();
  const { t, dia } = useT();
  const hoy = useHoy();
  const [error, setError] = useState("");
  const obra = obras.find((o) => o.id === id);
  const suyas = tareas.filter((t) => t.obraId === id && !t.archivada);
  const ids = new Set(suyas.map((t) => t.id));
  const fotos = archivos.filter((a) => ids.has(a.tareaId) && esFoto(a));
  const urls = useUrls(fotos);
  if (!perfil || perfil.rol !== "admin") return null;
  if (!obra) return <p>La obra no está disponible.</p>;
  const avance = avanceDe(suyas);
  async function imprimir() {
    try {
      setError("");
      await document.fonts.ready;
      await Promise.all(
        Array.from(
          document.querySelectorAll<HTMLImageElement>(".informe-obra img"),
        ).map((img) => img.decode()),
      );
      window.print();
    } catch {
      setError("Espera a que carguen las fotografías y vuelve a intentarlo.");
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3 print:hidden">
        <Link className="enlace" href={`/panel/obras/${id}`}>
          ← Volver a la obra
        </Link>
        <button
          className="btn btn-marca"
          disabled={fotos.some((a) => !urls[a.id])}
          onClick={() => void imprimir()}
        >
          Imprimir o guardar PDF
        </button>
      </div>
      {error && (
        <p role="alert" className="mensaje-error">
          {error}
        </p>
      )}
      <article className="informe-obra hoja space-y-7 p-7 sm:p-10">
        <header className="border-b border-regla pb-5">
          <p className="text-sm font-semibold text-blue-700">
            {empresa?.nombre} · TRAZO
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold">
            {obra.nombre}
          </h1>
          <p className="mt-2 text-sm text-gris">{obra.detalle}</p>
          <p className="mt-2 text-xs text-gris">
            Informe de avance · {hoy ? dia(hoy) : ""}
          </p>
        </header>
        <section>
          <h2 className="text-xl font-bold">Avance · {avance.porcentaje}%</h2>
          <p className="mt-2 text-sm">
            {suyas.filter((t) => t.estado === "completada").length} de{" "}
            {suyas.length} tareas completadas. El porcentaje considera el peso
            de cada tarea.
          </p>
        </section>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-regla">
              <th className="py-3">Tarea</th>
              <th>Etapa</th>
              <th>Fecha prevista</th>
            </tr>
          </thead>
          <tbody>
            {suyas.map((tarea) => (
              <tr key={tarea.id} className="border-b border-regla">
                <td className="py-3 pr-3">
                  {codigoTarea(tarea.numero)} · {tarea.titulo}
                </td>
                <td className="pr-3">{t.etapas[etapaDe(tarea.estado)]}</td>
                <td>{tarea.vence ? dia(tarea.vence) : "Por definir"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {fotos.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-bold">Registro fotográfico</h2>
            <div className="grid grid-cols-2 gap-4">
              {fotos.map((a) => (
                <figure key={a.id} className="break-inside-avoid">
                  {/* eslint-disable-next-line @next/next/no-img-element -- fotografías privadas del informe */}
                  <img
                    src={urls[a.id]}
                    alt={a.nombre}
                    className="aspect-[4/3] w-full rounded-lg object-cover"
                  />
                  <figcaption className="mt-2 text-xs text-gris">
                    {a.nombre} · {dia(a.fecha.slice(0, 10))}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
        <footer className="border-t border-regla pt-4 text-xs text-gris">
          {empresa?.contacto} {empresa?.telefono}
        </footer>
      </article>
    </div>
  );
}
