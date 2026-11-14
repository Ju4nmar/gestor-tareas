"use client";

import { useState } from "react";
import { Encabezado, Seccion, useNombres, useObras } from "@/components/ui";
import { fechaLocal, sumarDias, useHoy } from "@/lib/fechas";
import { ESTADOS, PRIORIDADES, abierta, codigoTarea, vencida } from "@/lib/flujo";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { Tarea } from "@/lib/types";

/** Día local en que ocurrió un instante. */
const diaDe = (iso: string) => fechaLocal(new Date(iso));

/** Entregada a tiempo: se aprobó el día límite o antes. Nulo si no tenía fecha. */
const aTiempo = (x: Tarea) => (x.completada && x.vence ? diaDe(x.completada) <= x.vence : null);

function porcentaje(lista: Tarea[]) {
  const conFecha = lista.map(aTiempo).filter((v) => v !== null);
  return conFecha.length ? `${Math.round((conFecha.filter(Boolean).length / conFecha.length) * 100)}%` : "—";
}

function Barra({ etiqueta, valor, maximo, color }: { etiqueta: string; valor: number; maximo: number; color: string }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 py-2">
      <span className="truncate text-xs font-semibold text-tinta">{etiqueta}</span>
      <span className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <span className="block h-full rounded-full transition-all" style={{ width: `${maximo ? (valor / maximo) * 100 : 0}%`, background: color }} />
      </span>
      <span className="text-right font-mono text-xs font-semibold text-gris">{valor}</span>
    </div>
  );
}

export default function InformesPage() {
  const { perfil, tareas, eventos, perfiles, obras } = useStore();
  const { t, diaLargo } = useT();
  const hoy = useHoy();
  const nombre = useNombres();
  const obra = useObras();
  const [periodo, setPeriodo] = useState("30");
  if (!perfil || perfil.rol !== "admin") return null;

  const desde = periodo === "todo" || !hoy ? "" : sumarDias(hoy, -Number(periodo));
  const enPeriodo = (iso: string | null) => Boolean(iso) && diaDe(iso!) >= desde;
  const creadas = tareas.filter((x) => enPeriodo(x.creada));
  const completadas = tareas.filter((x) => enPeriodo(x.completada));
  const devoluciones = eventos.filter((e) => e.suceso === "devolver" && enPeriodo(e.fecha));
  const vencidas = tareas.filter((x) => vencida(x, hoy));
  const dias = completadas.map((x) => (Date.parse(x.completada!) - Date.parse(x.creada)) / 86_400_000);
  const promedio = dias.length ? (dias.reduce((s, d) => s + d, 0) / dias.length).toFixed(1) : "—";

  const cifras: [string, string | number][] = [
    [t.informes.creadas, creadas.length],
    [t.informes.completadas, completadas.length],
    [t.informes.aTiempo, porcentaje(completadas)],
    [t.informes.promedio, promedio],
    [t.informes.vencidas, vencidas.length],
    [t.informes.devoluciones, devoluciones.length],
  ];

  const devueltasDe = new Map<string, number>();
  for (const e of devoluciones) {
    const responsable = tareas.find((x) => x.id === e.tareaId)?.asignadaA;
    if (responsable) devueltasDe.set(responsable, (devueltasDe.get(responsable) ?? 0) + 1);
  }
  const personas = perfiles
    .filter((p) => p.rol !== "cliente")
    .map((p) => {
      const suyas = tareas.filter((x) => x.asignadaA === p.id);
      const hechas = suyas.filter((x) => enPeriodo(x.completada));
      return {
        p,
        abiertas: suyas.filter(abierta).length,
        hechas: hechas.length,
        aTiempo: porcentaje(hechas),
        vencidas: suyas.filter((x) => vencida(x, hoy)).length,
        devueltas: devueltasDe.get(p.id) ?? 0,
      };
    })
    .filter((f) => f.abiertas + f.hechas > 0 || (f.p.activo && f.p.rol === "empleado"));

  const porObra = [...obras.map((o) => ({ id: o.id as string | null, nombre: o.nombre })), { id: null, nombre: t.comun.sinObra }]
    .map((o) => {
      const suyas = tareas.filter((x) => x.obraId === o.id);
      return {
        ...o,
        total: suyas.length,
        abiertas: suyas.filter(abierta).length,
        hechas: suyas.filter((x) => enPeriodo(x.completada)).length,
        vencidas: suyas.filter((x) => vencida(x, hoy)).length,
        avance: suyas.length ? `${Math.round((suyas.filter((x) => x.estado === "completada").length / suyas.length) * 100)}%` : "—",
      };
    })
    .filter((f) => f.total > 0);

  const porEstado = ESTADOS.map((e) => ({ e, n: tareas.filter((x) => x.estado === e).length }));
  const abiertas = tareas.filter(abierta);
  const porPrioridad = PRIORIDADES.map((p) => ({ p, n: abiertas.filter((x) => x.prioridad === p).length }));

  const descargar = () => {
    const celda = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = [
      [t.campos.codigo, t.campos.obra, t.campos.titulo, t.campos.estado, t.campos.prioridad, t.campos.responsable, t.campos.vence, t.campos.creada, t.informes.completadas],
      ...tareas.map((x) => [
        codigoTarea(x.numero),
        obra(x.obraId),
        x.titulo,
        t.estados[x.estado],
        t.prioridades[x.prioridad],
        nombre(x.asignadaA),
        x.vence,
        diaDe(x.creada),
        x.completada ? diaDe(x.completada) : "",
      ]),
    ];
    const csv = "\uFEFF" + filas.map((f) => f.map(celda).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const enlace = Object.assign(document.createElement("a"), { href: url, download: `relevo-${hoy}.csv` });
    enlace.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 sm:space-y-10">
      <Encabezado rotulo={desde ? `${diaLargo(desde)} — ${diaLargo(hoy)}` : t.informes.periodos.todo} titulo={t.informes.titulo}>
        <div className="flex flex-wrap items-center gap-2">
          <select className="campo w-auto py-1.5 text-xs font-semibold" aria-label={t.informes.periodo} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {Object.entries(t.informes.periodos).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
          <button className="btn btn-linea py-1.5 text-xs font-semibold" onClick={descargar}>
            {t.informes.descargar}
          </button>
        </div>
      </Encabezado>

      <div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          {cifras.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="hoja p-4 shadow-xs">
              <dt className="text-xs font-semibold uppercase tracking-wider text-gris">{etiqueta}</dt>
              <dd className="mt-2 font-display text-3xl font-extrabold tracking-tight text-tinta">{valor}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-gris">{t.informes.nota}</p>
      </div>

      <Seccion titulo={t.informes.porPersona}>
        {personas.length === 0 ? (
          <div className="hoja p-8 text-center text-xs text-gris">{t.informes.sinDatos}</div>
        ) : (
          <div className="hoja overflow-x-auto shadow-xs">
            <table className="w-full min-w-[34rem] text-xs">
              <thead>
                <tr className="border-b border-regla bg-slate-50/70 text-left dark:bg-slate-800/40">
                  {[t.historial.persona, t.informes.abiertas, t.informes.completadas, t.informes.aTiempo, t.informes.vencidas, t.informes.devoluciones].map(
                    (c, i) => (
                      <th key={c} className={`p-3 font-bold uppercase tracking-wider text-gris ${i > 0 ? "text-right" : ""}`}>
                        {c}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-regla">
                {personas.map((f) => (
                  <tr key={f.p.id} className="transition-colors hover:bg-slate-50/40 dark:hover:bg-slate-800/20">
                    <td className="p-3 font-semibold text-tinta">{f.p.nombre}</td>
                    <td className="p-3 text-right font-mono text-gris">{f.abiertas}</td>
                    <td className="p-3 text-right font-mono text-gris">{f.hechas}</td>
                    <td className="p-3 text-right font-mono font-semibold text-tinta">{f.aTiempo}</td>
                    <td className={`p-3 text-right font-mono ${f.vencidas ? "font-bold text-rose-600 dark:text-rose-400" : "text-gris"}`}>{f.vencidas}</td>
                    <td className="p-3 text-right font-mono text-gris">{f.devueltas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {porObra.length > 0 && (
        <Seccion titulo={t.informes.porObra}>
          <div className="hoja overflow-x-auto shadow-xs">
            <table className="w-full min-w-[34rem] text-xs">
              <thead>
                <tr className="border-b border-regla bg-slate-50/70 text-left dark:bg-slate-800/40">
                  {[t.campos.obra, t.informes.abiertas, t.informes.completadas, t.informes.vencidas, t.obras.avanceCorto].map((c, i) => (
                    <th key={c} className={`p-3 font-bold uppercase tracking-wider text-gris ${i > 0 ? "text-right" : ""}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-regla">
                {porObra.map((f) => (
                  <tr key={f.id ?? "ninguna"} className="transition-colors hover:bg-slate-50/40 dark:hover:bg-slate-800/20">
                    <td className="p-3 font-semibold text-tinta">{f.nombre}</td>
                    <td className="p-3 text-right font-mono text-gris">{f.abiertas}</td>
                    <td className="p-3 text-right font-mono text-gris">{f.hechas}</td>
                    <td className={`p-3 text-right font-mono ${f.vencidas ? "font-bold text-rose-600 dark:text-rose-400" : "text-gris"}`}>{f.vencidas}</td>
                    <td className="p-3 text-right font-mono font-semibold text-blue-600 dark:text-blue-400">{f.avance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Seccion titulo={t.informes.porEstado}>
          <div className="hoja p-4 shadow-xs">
            {porEstado.map(({ e, n }) => (
              <Barra key={e} etiqueta={t.estados[e]} valor={n} maximo={Math.max(...porEstado.map((x) => x.n))} color={`var(--e-${e})`} />
            ))}
          </div>
        </Seccion>
        <Seccion titulo={t.informes.porPrioridad}>
          <div className="hoja p-4 shadow-xs">
            {porPrioridad.map(({ p, n }) => (
              <Barra
                key={p}
                etiqueta={t.prioridades[p]}
                valor={n}
                maximo={Math.max(...porPrioridad.map((x) => x.n))}
                color={p === "urgente" ? "var(--alerta)" : "var(--tinta)"}
              />
            ))}
          </div>
        </Seccion>
      </div>
    </div>
  );
}
