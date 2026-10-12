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

const SIN_OBRA = "ninguna";

function Tareas({ estadoInicial, obraInicial }: { estadoInicial: Estado | ""; obraInicial: string }) {
  const { perfil, tareas, perfiles, obras } = useStore();
  const { t } = useT();
  const hoy = useHoy();
  const router = useRouter();
  const admin = perfil?.rol === "admin";

  const [vista, setVista] = useState<Vista>(estadoInicial === "completada" ? "completadas" : "abiertas");
  const [estado, setEstado] = useState<Estado | "">(estadoInicial);
  const [obra, setObra] = useState(obraInicial);
  const [responsable, setResponsable] = useState("");
  const [prioridad, setPrioridad] = useState("");
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [creando, setCreando] = useState(false);

  const texto = sinTildes(busqueda.trim());
  const lista = tareas
    .filter((x) => (vista === "todas" ? true : vista === "abiertas" ? abierta(x) : !abierta(x)))
    .filter((x) => !estado || x.estado === estado)
    .filter((x) => !obra || (obra === SIN_OBRA ? !x.obraId : x.obraId === obra))
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
  // Se ofrecen las obras activas y cualquier otra que tenga tareas a la vista.
  const conTareas = new Set(tareas.map((x) => x.obraId));
  const opciones = [
    { id: "", nombre: t.obras.todas },
    ...obras.filter((o) => o.activa || conTareas.has(o.id) || o.id === obra).map((o) => ({ id: o.id, nombre: o.nombre })),
    ...(conTareas.has(null) ? [{ id: SIN_OBRA, nombre: t.comun.sinObra }] : []),
  ];
  // Sin obra elegida, la lista se parte por obra.
  const grupos = obra
    ? []
    : opciones
        .slice(1)
        .map((o) => ({ ...o, tareas: lista.filter((x) => (o.id === SIN_OBRA ? !x.obraId : x.obraId === o.id)) }))
        .filter((g) => g.tareas.length > 0);

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
        <TareaForm
          obraInicial={obra && obra !== SIN_OBRA ? obra : null}
          onCancel={() => setCreando(false)}
          onDone={(id, sinArchivos) => router.push(`/panel/tareas/${id}${sinArchivos ? "?aviso=archivo" : ""}`)}
        />
      )}

      {opciones.length > 2 && (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label={t.campos.obra}>
          {opciones.map((o) => (
            <button
              key={o.id}
              aria-pressed={obra === o.id}
              onClick={() => setObra(o.id)}
              className={`min-h-11 shrink-0 rounded-[3px] border px-4 text-sm font-medium whitespace-nowrap transition-colors ${
                obra === o.id ? "border-tinta bg-tinta text-papel" : "border-tinta/30 hover:border-tinta"
              }`}
            >
              {o.nombre}
            </button>
          ))}
        </div>
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
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
          <input
            type="search"
            className="campo col-span-2 lg:col-span-1"
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
            <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm whitespace-nowrap">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--alerta)] sm:h-4 sm:w-4"
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
      ) : grupos.length > 1 ? (
        <div className="space-y-10">
          {grupos.map((g, i) => (
            <section key={g.id}>
              <h2 className="mb-3 flex items-baseline justify-between gap-3">
                <button
                  className="text-left font-display text-xl font-bold tracking-tight underline-offset-4 hover:underline"
                  onClick={() => setObra(g.id)}
                >
                  {g.nombre}
                </button>
                <span className="font-mono text-xs text-gris">{t.tareas.cuenta(g.tareas.length)}</span>
              </h2>
              <ListaTareas tareas={g.tareas} conResponsable={admin} cabecera={i === 0} />
            </section>
          ))}
        </div>
      ) : (
        <ListaTareas tareas={lista} conResponsable={admin} conObra={!obra} />
      )}
    </div>
  );
}

export default function TareasPage() {
  const params = useSearchParams();
  const estado = params.get("estado") ?? "";
  const obra = params.get("obra") ?? "";
  const valido = (ESTADOS as string[]).includes(estado) ? (estado as Estado) : "";
  // La key reinicia los filtros cuando se llega con otro estado u otra obra desde el tablero.
  return <Tareas key={`${valido}-${obra}`} estadoInicial={valido} obraInicial={obra} />;
}
