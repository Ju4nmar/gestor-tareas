"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { TareaForm } from "@/components/TareaForm";
import { ListaTareas, Avance } from "@/components/ui";
import { useUrls, esFoto } from "@/components/Archivos";
import { avanceDe } from "@/lib/avance";
import { useStore } from "@/lib/store";

export default function ObraPage() {
  const { id } = useParams<{ id: string }>();
  const { perfil, obras, tareas, perfiles, archivos, clientes } = useStore();
  const [creando, setCreando] = useState(false);
  const obra = obras.find((o) => o.id === id);
  const suyas = tareas.filter((t) => t.obraId === id && !t.archivada);
  const ids = new Set(suyas.map((t) => t.id));
  const fotos = archivos.filter((a) => ids.has(a.tareaId));
  const urls = useUrls(fotos);
  if (!perfil) return null;
  if (!obra) return <p className="hoja p-8">Esta obra no está disponible.</p>;
  const avance = avanceDe(suyas);
  const personas = perfiles.filter(
    (p) =>
      suyas.some((t) => t.asignadaA === p.id) ||
      clientes.some((c) => c.obraId === id && c.perfilId === p.id),
  );
  return (
    <div className="space-y-6">
      <Link href="/panel/obras" className="enlace text-sm">
        ← Obras
      </Link>
      <header className="hoja space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">{obra.nombre}</h1>
            <p className="mt-2 text-sm text-gris">{obra.detalle}</p>
          </div>
          {perfil.rol === "admin" && (
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-marca"
                disabled={!obra.activa}
                onClick={() => setCreando(!creando)}
              >
                Nueva tarea
              </button>
              <Link
                href={`/panel/obras/${id}/informe`}
                className="btn btn-linea"
              >
                Informe para cliente
              </Link>
            </div>
          )}
        </div>
        <p className="text-sm font-semibold">
          Avance ponderado · {avance.porcentaje}%
        </p>
        <Avance hechas={avance.hechas} total={avance.total} />
        <p className="text-xs text-gris">
          {suyas.filter((t) => t.estado === "completada").length} de{" "}
          {suyas.length} tareas completadas
        </p>
      </header>
      {creando && (
        <div className="hoja p-6">
          <TareaForm
            key={id}
            obraInicial={id}
            onCancel={() => setCreando(false)}
            onDone={() => setCreando(false)}
          />
        </div>
      )}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold">Tareas</h2>
          <Link className="enlace text-xs" href={`/panel/tareas?obra=${id}`}>
            Abrir filtros y vistas
          </Link>
        </div>
        <ListaTareas tareas={suyas} conResponsable={perfil.rol === "admin"} />
      </section>
      <section className="hoja p-6">
        <h2 className="mb-3 font-display text-xl font-bold">
          Personas de la obra
        </h2>
        {personas.length ? (
          <ul className="divide-y divide-regla">
            {personas.map((p) => (
              <li key={p.id} className="py-3 text-sm">
                {p.nombre}
                <span className="ml-2 text-xs text-gris">
                  {p.rol === "cliente" ? "Cliente" : "Equipo"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gris">
            Las personas aparecerán al asignar tareas o invitar clientes.
          </p>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-display text-xl font-bold">
          Archivos de la obra
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {fotos.map((a) => (
            <li key={a.id} className="hoja overflow-hidden">
              <a
                href={urls[a.id]}
                target="_blank"
                rel="noreferrer"
                className="block p-3"
              >
                {esFoto(a) && urls[a.id] && (
                  /* eslint-disable-next-line @next/next/no-img-element -- archivo privado con enlace temporal */
                  <img
                    src={urls[a.id]}
                    alt={a.nombre}
                    className="mb-2 aspect-video w-full rounded-lg object-cover"
                  />
                )}
                <span className="text-sm">{a.nombre}</span>
              </a>
            </li>
          ))}
        </ul>
        {!fotos.length && (
          <p className="hoja p-6 text-sm text-gris">
            Los archivos adjuntos a las tareas aparecerán aquí.
          </p>
        )}
      </section>
    </div>
  );
}
