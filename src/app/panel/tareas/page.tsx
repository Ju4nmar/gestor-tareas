"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { TareaForm } from "@/components/TareaForm";
import { Encabezado, ListaTareas } from "@/components/ui";
import { useHoy } from "@/lib/fechas";
import { ESTADOS, PRIORIDADES, abierta, codigoTarea, vencida } from "@/lib/flujo";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { Estado, Tarea } from "@/lib/types";

type Vista = "abiertas" | "completadas" | "todas";

const sinTildes = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

function Tareas({ estadoInicial }: { estadoInicial: Estado | "" }) {
  const { perfil, tareas, perfiles } = useStore();
  const { t } = useT();
  const hoy = useHoy();
  const router = useRouter();
  const admin = perfil?.rol === "admin";

  const [vista, setVista] = useState<Vista>(estadoInicial === "completada" ? "completadas" : "abiertas");
  const [estado, setEstado] = useState<Estado | "">(estadoInicial);
  const [responsable, setResponsable] = useState("");
  const [prioridad, setPrioridad] = useState("");
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [creando, setCreando] = useState(false);

  const texto = sinTildes(busqueda.trim());
  const lista = tareas
    .filter((x) => (vista === "todas" ? true : vista === "abiertas" ? abierta(x) : !abierta(x)))
    .filter((x) => !estado || x.estado === estado)
    .filter((x) => !responsable || (responsable === "nadie" ? !x.asignadaA : x.asignadaA === responsable))
    .filter((x) => !prioridad || x.prioridad === prioridad)
    .filter((x) => !soloVencidas || vencida(x, hoy))
    .filter((x) => !texto || sinTildes(`${codigoTarea(x.numero)} ${x.titulo}`).includes(texto))
    // Primero lo que vence antes; lo completado, de lo más reciente a lo más viejo.
    .sort((a: Tarea, b: Tarea) =>
      vista === "completadas"
        ? (b.completada ?? "").localeCompare(a.completada ?? "")
        : (a.vence ?? "9").localeCompare(b.vence ?? "9") || b.numero - a.numero,
    );

  // Los estados que tiene sentido ofrecer en cada vista.
  const estados = ESTADOS.filter((e) =>
    vista === "todas" ? true : vista === "abiertas" ? e !== "completada" : e === "completada",
  );
  const cambiarVista = (nueva: Vista) => {
    setVista(nueva);
    setEstado("");
    if (nueva === "completadas") setSoloVencidas(false);
  };

  return (
    <div className="space-y-8">
      <Encabezado rotulo={t.tareas.cuenta(lista.length)} titulo={t.tareas.titulo}>
        {admin && !creando && (
          <button className="btn" onClick={() => setCreando(true)}>
            + {t.tareas.nueva}
          </button>
        )}
      </Encabezado>

      {creando && (
        <TareaForm onCancel={() => setCreando(false)} onDone={(id) => router.push(`/panel/tareas/${id}`)} />
      )}

      <div>
        <div className="flex gap-6 overflow-x-auto border-b border-regla">
          {(["abiertas", "completadas", "todas"] as Vista[]).map((v) => (
            <button
              key={v}
              className={`pestana ${vista === v ? "pestana-activa" : ""}`}
              onClick={() => cambiarVista(v)}
            >
              {t.tareas.vistas[v]}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
          <input
            type="search"
            className="campo"
            placeholder={t.tareas.buscar}
            aria-label={t.tareas.buscar}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <select
            className="campo"
            aria-label={t.campos.estado}
            value={estado}
            onChange={(e) => setEstado(e.target.value as Estado | "")}
          >
            <option value="">
              {t.campos.estado}: {t.comun.todos.toLowerCase()}
            </option>
            {estados.map((e) => (
              <option key={e} value={e}>
                {t.estados[e]}
              </option>
            ))}
          </select>
          <select
            className="campo"
            aria-label={t.campos.prioridad}
            value={prioridad}
            onChange={(e) => setPrioridad(e.target.value)}
          >
            <option value="">
              {t.campos.prioridad}: {t.comun.todas.toLowerCase()}
            </option>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {t.prioridades[p]}
              </option>
            ))}
          </select>
          {admin && (
            <select
              className="campo"
              aria-label={t.campos.responsable}
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
            >
              <option value="">
                {t.campos.responsable}: {t.comun.todos.toLowerCase()}
              </option>
              {perfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
              <option value="nadie">{t.comun.sinResponsable}</option>
            </select>
          )}
          {vista !== "completadas" && (
            <label className="flex cursor-pointer items-center gap-2 px-1 text-sm whitespace-nowrap">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--alerta)]"
                checked={soloVencidas}
                onChange={(e) => setSoloVencidas(e.target.checked)}
              />
              {t.tareas.soloVencidas}
            </label>
          )}
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="border-y border-regla py-12 text-center text-gris">{t.tareas.vacio}</p>
      ) : (
        <ListaTareas tareas={lista} conResponsable={admin} />
      )}
    </div>
  );
}

export default function TareasPage() {
  const estado = useSearchParams().get("estado") ?? "";
  const valido = (ESTADOS as string[]).includes(estado) ? (estado as Estado) : "";
  // La key reinicia los filtros cuando se llega con otro estado desde el tablero.
  return <Tareas key={valido} estadoInicial={valido} />;
}
