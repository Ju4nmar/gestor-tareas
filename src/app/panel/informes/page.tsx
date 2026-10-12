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
    <div className="grid grid-cols-[9.5rem_1fr_2rem] items-center gap-3 py-1.5">
      <span className="truncate text-sm">{etiqueta}</span>
      <span className="h-2.5 bg-regla">
        <span className="block h-full" style={{ width: `${maximo ? (valor / maximo) * 100 : 0}%`, background: color }} />
      </span>
      <span className="text-right font-mono text-xs">{valor}</span>
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
    // El BOM inicial hace que Excel lea bien las tildes.
    const csv = "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const enlace = Object.assign(document.createElement("a"), { href: url, download: `relevo-${hoy}.csv` });
    enlace.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-12">
      <Encabezado rotulo={desde ? `${diaLargo(desde)} — ${diaLargo(hoy)}` : t.informes.periodos.todo} titulo={t.informes.titulo}>
        <div className="flex flex-wrap gap-2">
          <select className="campo w-auto" aria-label={t.informes.periodo} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {Object.entries(t.informes.periodos).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
          <button className="btn btn-linea" onClick={descargar}>
            {t.informes.descargar}
          </button>
        </div>
      </Encabezado>

      <div>
        <dl className="grid grid-cols-2 gap-y-6 border-y border-tinta py-6 sm:grid-cols-3 lg:grid-cols-6">
          {cifras.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="border-l border-regla pl-4 first:border-l-0 first:pl-0">
              <dd className="font-display text-4xl font-extrabold leading-none tracking-tight">{valor}</dd>
              <dt className="rotulo mt-2">{etiqueta}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-gris">{t.informes.nota}</p>
      </div>

      <Seccion titulo={t.informes.porPersona}>
        {personas.length === 0 ? (
          <p className="border-t border-regla py-4 text-sm text-gris">{t.informes.sinDatos}</p>
        ) : (
          <div className="overflow-x-auto border-t border-tinta">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-regla text-left">
                  {[t.historial.persona, t.informes.abiertas, t.informes.completadas, t.informes.aTiempo, t.informes.vencidas, t.informes.devoluciones].map(
                    (c, i) => (
                      <th key={c} className={`rotulo py-2 font-normal ${i > 0 ? "text-right" : ""}`}>
                        {c}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {personas.map((f) => (
                  <tr key={f.p.id} className="border-b border-regla">
                    <td className="py-3 font-medium">{f.p.nombre}</td>
                    <td className="text-right font-mono">{f.abiertas}</td>
                    <td className="text-right font-mono">{f.hechas}</td>
                    <td className="text-right font-mono">{f.aTiempo}</td>
                    <td className={`text-right font-mono ${f.vencidas ? "font-medium text-alerta" : ""}`}>{f.vencidas}</td>
                    <td className="text-right font-mono">{f.devueltas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {porObra.length > 0 && (
        <Seccion titulo={t.informes.porObra}>
          <div className="overflow-x-auto border-t border-tinta">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-regla text-left">
                  {[t.campos.obra, t.informes.abiertas, t.informes.completadas, t.informes.vencidas, t.obras.avanceCorto].map((c, i) => (
                    <th key={c} className={`rotulo py-2 font-normal ${i > 0 ? "text-right" : ""}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porObra.map((f) => (
                  <tr key={f.id ?? "ninguna"} className="border-b border-regla">
                    <td className="py-3 font-medium">{f.nombre}</td>
                    <td className="text-right font-mono">{f.abiertas}</td>
                    <td className="text-right font-mono">{f.hechas}</td>
                    <td className={`text-right font-mono ${f.vencidas ? "font-medium text-alerta" : ""}`}>{f.vencidas}</td>
                    <td className="text-right font-mono">{f.avance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
        <Seccion titulo={t.informes.porEstado}>
          <div className="border-t border-regla pt-2">
            {porEstado.map(({ e, n }) => (
              <Barra key={e} etiqueta={t.estados[e]} valor={n} maximo={Math.max(...porEstado.map((x) => x.n))} color={`var(--e-${e})`} />
            ))}
          </div>
        </Seccion>
        <Seccion titulo={t.informes.porPrioridad}>
          <div className="border-t border-regla pt-2">
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
