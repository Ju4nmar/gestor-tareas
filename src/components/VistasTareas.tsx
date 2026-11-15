"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buscarTareas, useStore } from "@/lib/store";
import { codigoTarea, ESTADOS } from "@/lib/flujo";
import { useHoy } from "@/lib/fechas";
import { useT } from "@/lib/textos";
import type { Tarea } from "@/lib/types";
import { ListaTareas, Sello } from "./ui";

type Resultado = {
  clave: string;
  pagina: number;
  tareas: Tarea[];
  total: number;
  error: boolean;
};

export function VistasTareas({
  filtro,
  local,
}: {
  filtro: Record<string, unknown>;
  local: Tarea[];
}) {
  const { demo, perfil, empresa } = useStore();
  const { t } = useT();
  const hoy = useHoy();
  const [vista, setVista] = useState<"lista" | "tablero" | "calendario">(
    "lista",
  );
  const [mes, setMes] = useState("");
  const mesActual = mes || hoy.slice(0, 7);
  const calendario = vista === "calendario" && mesActual;
  const desde = calendario ? mesActual + "-01" : "";
  const hasta = calendario
    ? new Date(
        Date.UTC(Number(mesActual.slice(0, 4)), Number(mesActual.slice(5)), 0),
      )
        .toISOString()
        .slice(0, 10)
    : "";
  const clave = JSON.stringify({ ...filtro, from: desde, to: hasta });
  const contexto = `${empresa?.id}:${perfil?.id}:${clave}`;
  const [posicion, setPosicion] = useState({ contexto: "", pagina: 1 });
  const pagina = posicion.contexto === contexto ? posicion.pagina : 1;
  const [remoto, setRemoto] = useState<Resultado | null>(null);
  const [reintento, setReintento] = useState(0);
  useEffect(() => {
    if (demo) return;
    let vigente = true;
    const timer = setTimeout(() => {
      buscarTareas(JSON.parse(clave), pagina)
        .then((resultado) => {
          if (vigente)
            setRemoto({ clave: contexto, pagina, ...resultado, error: false });
        })
        .catch(() => {
          if (vigente)
            setRemoto({
              clave: contexto,
              pagina,
              tareas: [],
              total: 0,
              error: true,
            });
        });
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [clave, contexto, pagina, demo, reintento, local]);
  const locales = calendario
    ? local.filter((t) => t.vence?.startsWith(mesActual))
    : local;
  const actual =
    remoto?.clave === contexto && remoto.pagina === pagina ? remoto : null;
  const lista = demo
    ? locales.slice((pagina - 1) * 30, pagina * 30)
    : (actual?.tareas ?? []);
  const total = demo ? locales.length : (actual?.total ?? 0);
  const cargando = !demo && !actual;
  const paginas = Math.max(1, Math.ceil(total / 30));
  const primera = calendario ? new Date(mesActual + "-01T12:00:00Z") : null;
  const inicio = primera
    ? new Date(primera.getTime() - ((primera.getUTCDay() + 6) % 7) * 86400000)
    : null;
  return (
    <section className="space-y-4" aria-label="Resultados de tareas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" aria-label="Vista de tareas">
          {(["lista", "tablero", "calendario"] as const).map((opcion) => (
            <button
              key={opcion}
              className={vista === opcion ? "btn btn-marca" : "btn btn-linea"}
              aria-pressed={vista === opcion}
              onClick={() => setVista(opcion)}
            >
              {opcion[0].toUpperCase() + opcion.slice(1)}
            </button>
          ))}
        </div>
        {vista === "calendario" && (
          <label className="flex items-center gap-2 text-sm">
            Mes
            <input
              className="campo"
              type="month"
              value={mesActual}
              onChange={(e) => setMes(e.target.value)}
            />
          </label>
        )}
      </div>
      {cargando ? (
        <p role="status" className="hoja p-8 text-gris">
          Buscando tareas…
        </p>
      ) : actual?.error ? (
        <div role="alert" className="hoja p-6">
          <p>No se pudieron consultar las tareas.</p>
          <button
            className="btn btn-linea mt-3"
            onClick={() => setReintento((n) => n + 1)}
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-gris">
            {total} resultados · Página {pagina} de {paginas}
          </p>
          {vista === "lista" && (
            <ListaTareas
              tareas={lista}
              conObra
              conResponsable={perfil?.rol === "admin"}
            />
          )}
          {vista === "tablero" && (
            <div className="flex gap-4 overflow-x-auto pb-3">
              {ESTADOS.map((estado) => (
                <section
                  key={estado}
                  className="w-64 shrink-0 rounded-xl border border-regla bg-papel p-3"
                >
                  <h3 className="mb-3 text-sm font-semibold">
                    {t.estados[estado]}
                  </h3>
                  <ul className="space-y-2">
                    {lista
                      .filter((t) => t.estado === estado)
                      .map((tarea) => (
                        <li key={tarea.id}>
                          <Link
                            href={`/panel/tareas/${tarea.id}`}
                            className="hoja block p-3 text-sm"
                          >
                            <span className="block text-xs text-gris">
                              {codigoTarea(tarea.numero)}
                            </span>
                            {tarea.titulo}
                            <span className="mt-2 block text-xs text-gris">
                              {tarea.vence ?? "Sin fecha"}
                            </span>
                          </Link>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {vista === "calendario" && inicio && (
            <div className="overflow-x-auto">
              <div className="grid min-w-[700px] grid-cols-7 gap-px rounded-xl border border-regla bg-regla">
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(
                  (dia) => (
                    <div
                      key={dia}
                      className="bg-hoja p-3 text-center text-xs font-semibold"
                    >
                      {dia}
                    </div>
                  ),
                )}
                {Array.from({ length: 42 }, (_, i) => {
                  const fecha = new Date(inicio.getTime() + i * 86400000)
                    .toISOString()
                    .slice(0, 10);
                  return (
                    <section
                      key={fecha}
                      aria-label={fecha}
                      className={`min-h-28 bg-hoja p-2 ${fecha.startsWith(mesActual) ? "" : "opacity-60"}`}
                    >
                      <time className="text-xs font-semibold">
                        {Number(fecha.slice(-2))}
                      </time>
                      {lista
                        .filter((t) => t.vence === fecha)
                        .map((tarea) => (
                          <Link
                            key={tarea.id}
                            href={`/panel/tareas/${tarea.id}`}
                            className="my-1 block rounded bg-blue-50 p-1.5 text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                          >
                            {tarea.titulo}
                            <Sello estado={tarea.estado} />
                          </Link>
                        ))}
                    </section>
                  );
                })}
              </div>
            </div>
          )}
          {!lista.length && (
            <p className="hoja p-8 text-center text-sm text-gris">
              No hay tareas para estos filtros.
            </p>
          )}
          {paginas > 1 && (
            <nav
              className="flex items-center justify-between"
              aria-label="Páginas de tareas"
            >
              <button
                className="btn btn-linea"
                disabled={pagina <= 1}
                onClick={() => setPosicion({ contexto, pagina: pagina - 1 })}
              >
                Anterior
              </button>
              <span className="text-xs text-gris">
                {pagina} / {paginas}
              </span>
              <button
                className="btn btn-linea"
                disabled={pagina >= paginas}
                onClick={() => setPosicion({ contexto, pagina: pagina + 1 })}
              >
                Siguiente
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
