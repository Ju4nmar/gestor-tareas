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

function Tareas({
  estadoInicial,
  obraInicial,
  avisoFotos,
}: {
  estadoInicial: Estado | "";
  obraInicial: string;
  avisoFotos: boolean;
}) {
  const { perfil, tareas, archivadas, perfiles, obras } = useStore();
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
  // Las archivadas solo las ve el administrador.
  const archivadasVista = admin
    ? archivadas
        .filter((x) => !obra || (obra === SIN_OBRA ? !x.obraId : x.obraId === obra))
        .sort((a: Tarea, b: Tarea) => (b.archivada ?? "").localeCompare(a.archivada ?? ""))
    : [];

  const conTareas = new Set(tareas.map((x) => x.obraId));
  const opciones = [
    { id: "", nombre: t.obras.todas },
    ...obras.filter((o) => o.activa || conTareas.has(o.id) || o.id === obra).map((o) => ({ id: o.id, nombre: o.nombre })),
    ...(conTareas.has(null) ? [{ id: SIN_OBRA, nombre: t.comun.sinObra }] : []),
  ];

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
    <div className="space-y-6 sm:space-y-8">
      <Encabezado rotulo={t.tareas.cuenta(lista.length)} titulo={t.tareas.titulo}>
        {admin && !creando && (
          <button className="btn btn-marca hidden sm:inline-flex" onClick={() => setCreando(true)}>
            + {t.tareas.nueva}
          </button>
        )}
      </Encabezado>

      {/* Botón flotante FAB en móvil */}
      {admin && !creando && (
        <button
          onClick={() => setCreando(true)}
          aria-label={t.tareas.nueva}
          className="fixed bottom-20 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl transition-transform active:scale-95 sm:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-6 w-6">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {avisoFotos && (
        <div role="status" className="hoja border-amber-200 bg-amber-50/80 p-4 text-sm font-medium text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          {t.tareas.avisoFotos}
        </div>
      )}

      {creando && (
        <div className="rounded-2xl border border-regla bg-hoja p-5 shadow-sm sm:p-7">
          <TareaForm
            obraInicial={obra && obra !== SIN_OBRA ? obra : null}
            onCancel={() => setCreando(false)}
            onDone={(id, sinArchivos) => router.push(`/panel/tareas/${id}${sinArchivos ? "?aviso=archivo" : ""}`)}
          />
        </div>
      )}

      {/* Chips de selección de Obra */}
      {opciones.length > 2 && (
        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
          role="group"
          aria-label={t.campos.obra}
        >
          {opciones.map((o) => (
            <button
              key={o.id}
              aria-pressed={obra === o.id}
              onClick={() => setObra(o.id)}
              className={`min-h-10 shrink-0 rounded-xl px-3.5 text-xs font-semibold whitespace-nowrap transition-all ${
                obra === o.id
                  ? "bg-blue-600 text-white shadow-xs"
                  : "border border-regla bg-hoja text-slate-700 hover:border-slate-300 dark:text-slate-300"
              }`}
            >
              {o.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Barra de pestañas y filtros */}
      <div className="space-y-4">
        <div className="flex gap-2 border-b border-regla pb-1">
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

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
          <div className="relative col-span-2 lg:col-span-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="search"
              className="campo pl-10"
              placeholder={t.tareas.buscar}
              aria-label={t.tareas.buscar}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

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
              {perfiles
                .filter((p) => p.rol !== "cliente")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              <option value="nadie">{t.comun.sinResponsable}</option>
            </select>
          )}

          {vista !== "completadas" && (
            <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-regla bg-hoja px-3 text-xs font-semibold sm:col-span-1 lg:col-span-1">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-md accent-rose-600"
                checked={soloVencidas}
                onChange={(e) => setSoloVencidas(e.target.checked)}
              />
              <span className="truncate">{t.tareas.soloVencidas}</span>
            </label>
          )}
        </div>
      </div>

      {/* Resultados de tareas */}
      {lista.length === 0 ? (
        <div className="hoja p-12 text-center text-sm text-gris">{t.tareas.vacio}</div>
      ) : grupos.length > 1 ? (
        <div className="space-y-8">
          {grupos.map((g, i) => (
            <section key={g.id} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <button
                  className="text-left font-display text-lg font-bold tracking-tight text-tinta hover:text-blue-600 dark:hover:text-blue-400"
                  onClick={() => setObra(g.id)}
                >
                  {g.nombre}
                </button>
                <span className="text-xs font-semibold text-gris">{t.tareas.cuenta(g.tareas.length)}</span>
              </div>
              <ListaTareas tareas={g.tareas} conResponsable={admin} cabecera={i === 0} />
            </section>
          ))}
        </div>
      ) : (
        <ListaTareas tareas={lista} conResponsable={admin} conObra={!obra} />
      )}

      {/* Tareas Archivadas */}
      {archivadasVista.length > 0 && (
        <section className="mt-12 space-y-3 border-t border-regla pt-8">
          <div className="flex items-baseline justify-between gap-3 font-display text-lg font-bold tracking-tight text-tinta">
            <span>{t.tareas.archivadas}</span>
            <span className="text-xs font-normal text-gris">{t.tareas.cuenta(archivadasVista.length)}</span>
          </div>
          <p className="text-xs text-gris">{t.tareas.archivadasAyuda}</p>
          <ListaTareas tareas={archivadasVista} conResponsable conObra={!obra} />
        </section>
      )}
    </div>
  );
}

export default function TareasPage() {
  const params = useSearchParams();
  const estado = params.get("estado") ?? "";
  const obra = params.get("obra") ?? "";
  const avisoFotos = params.get("aviso") === "fotos";
  const valido = (ESTADOS as string[]).includes(estado) ? (estado as Estado) : "";
  return <Tareas key={`${valido}-${obra}`} estadoInicial={valido} obraInicial={obra} avisoFotos={avisoFotos} />;
}
