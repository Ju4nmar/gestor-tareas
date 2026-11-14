"use client";

import Link from "next/link";
import { Avance, Encabezado, Renglones, Seccion } from "@/components/ui";
import { sumarDias, useHoy } from "@/lib/fechas";
import { ESPERA_ADMIN, abierta, proxima, vencida } from "@/lib/flujo";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { Estado, Obra, Tarea } from "@/lib/types";

/** Estados por los que pasa una tarea en marcha, para la franja del flujo. */
const EN_MARCHA: Estado[] = ["asignada", "aclaracion", "aceptada", "en_curso", "enviada", "en_revision", "devuelta"];

const porFecha = (a: Tarea, b: Tarea) => (a.vence ?? "9").localeCompare(b.vence ?? "9");

function TarjetaKPI({
  valor,
  etiqueta,
  tono,
}: {
  valor: number;
  etiqueta: string;
  tono?: "alerta" | "marca" | "exito";
}) {
  const tonoClase =
    tono === "alerta" && valor > 0
      ? "text-rose-600 dark:text-rose-400 bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/40"
      : tono === "marca" && valor > 0
        ? "text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/40"
        : "text-tinta bg-hoja border-regla";

  return (
    <div className={`flex flex-col justify-between rounded-2xl border p-4 shadow-xs transition-shadow hover:shadow-md sm:p-5 ${tonoClase}`}>
      <span className="text-xs font-semibold uppercase tracking-wider text-gris">{etiqueta}</span>
      <span className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
        {valor}
      </span>
    </div>
  );
}

/** Cuántas tareas hay en cada estado, como una franja proporcional y sus cifras. */
function Flujo({ tareas }: { tareas: Tarea[] }) {
  const { t } = useT();
  const cuentas = EN_MARCHA.map((estado) => ({ estado, n: tareas.filter((x) => x.estado === estado).length }));
  const total = cuentas.reduce((s, c) => s + c.n, 0);

  return (
    <div className="hoja p-5 sm:p-6">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
        {cuentas.map(
          (c) =>
            c.n > 0 && (
              <span
                key={c.estado}
                style={{ width: `${(c.n / total) * 100}%`, background: `var(--e-${c.estado})` }}
                className="transition-all first:rounded-l-full last:rounded-r-full"
              />
            ),
        )}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {cuentas.map((c) => (
          <Link
            key={c.estado}
            href={`/panel/tareas?estado=${c.estado}`}
            className={`group rounded-xl border border-regla bg-papel/50 p-2.5 transition-all hover:border-slate-300 hover:shadow-xs dark:hover:border-slate-700 ${
              c.n === 0 ? "opacity-50" : ""
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: `var(--e-${c.estado})` }} />
              <span className="truncate text-[11px] font-semibold text-gris group-hover:text-tinta">
                {t.estados[c.estado]}
              </span>
            </div>
            <span className="mt-1 block font-display text-2xl font-bold text-tinta">{c.n}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Cada obra activa con su avance; al tocarla se abren sus tareas. */
function Obras({ obras, tareas, hoy }: { obras: Obra[]; tareas: Tarea[]; hoy: string }) {
  const { t } = useT();
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {obras.map((o) => {
        const suyas = tareas.filter((x) => x.obraId === o.id);
        const hechas = suyas.filter((x) => x.estado === "completada").length;
        const abiertas = suyas.filter(abierta).length;
        const vencidas = suyas.filter((x) => vencida(x, hoy)).length;
        return (
          <li key={o.id}>
            <Link
              href={`/panel/tareas?obra=${o.id}`}
              className="hoja group block p-4 shadow-xs transition-all hover:border-blue-300 hover:shadow-md dark:hover:border-blue-900/60 sm:p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-base font-bold text-tinta group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {o.nombre}
                </span>
                <span className="shrink-0 text-xs font-semibold text-gris">
                  {hechas}/{suyas.length}
                </span>
              </div>
              <div className="mt-3">
                <Avance hechas={hechas} total={suyas.length} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-gris">
                <span>{suyas.length === 0 ? t.obras.sinTareas : t.obras.abiertas(abiertas)}</span>
                {vencidas > 0 && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                    {t.obras.vencidas(vencidas)}
                  </span>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function InicioPage() {
  const { perfil, tareas, obras } = useStore();
  const { t, hoyLargo } = useT();
  const hoy = useHoy();
  if (!perfil) return null;

  const admin = perfil.rol === "admin";
  const abiertas = tareas.filter(abierta);
  const vencidas = abiertas.filter((x) => vencida(x, hoy)).sort(porFecha);
  const proximas = abiertas.filter((x) => proxima(x, hoy)).sort(porFecha);
  const fechas = [...vencidas, ...proximas];
  const desde = hoy ? sumarDias(hoy, -30) : "";
  const completadas = tareas.filter((x) => x.completada && x.completada.slice(0, 10) >= desde).length;
  const nombre = perfil.nombre.split(" ")[0];
  const enMarchaObras = obras.filter((o) => o.activa);
  const cabecera = <Encabezado rotulo={hoy ? hoyLargo(hoy) : ""} titulo={t.inicio.hola(nombre)} />;

  if (admin) {
    const esperan = abiertas.filter((x) => ESPERA_ADMIN.includes(x.estado)).sort(porFecha);
    const borradores = abiertas.filter((x) => x.estado === "borrador");
    return (
      <div className="space-y-10 sm:space-y-12">
        {cabecera}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <TarjetaKPI valor={abiertas.length} etiqueta={t.inicio.cifras.abiertas} />
          <TarjetaKPI valor={esperan.length} etiqueta={t.inicio.cifras.porRevisar} tono="marca" />
          <TarjetaKPI valor={vencidas.length} etiqueta={t.inicio.cifras.vencidas} tono="alerta" />
          <TarjetaKPI valor={completadas} etiqueta={t.inicio.cifras.completadas} />
        </div>

        {enMarchaObras.length > 0 && (
          <Seccion titulo={t.inicio.obras} cuenta={enMarchaObras.length}>
            <Obras obras={enMarchaObras} tareas={tareas} hoy={hoy} />
          </Seccion>
        )}

        <Seccion titulo={t.inicio.flujo}>
          <Flujo tareas={abiertas} />
        </Seccion>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Seccion titulo={t.inicio.esperanPorTi} cuenta={esperan.length}>
            <Renglones tareas={esperan} vacio={t.inicio.nadaPendiente} conResponsable />
          </Seccion>
          <Seccion titulo={t.inicio.fechas} cuenta={fechas.length}>
            <Renglones tareas={fechas} vacio={t.inicio.sinFechas} conResponsable />
          </Seccion>
        </div>

        {borradores.length > 0 && (
          <Seccion titulo={t.inicio.sinAsignar} cuenta={borradores.length}>
            <Renglones tareas={borradores} vacio="" />
          </Seccion>
        )}
      </div>
    );
  }

  // Para quien recibe tareas
  const con = (...estados: Estado[]) => abiertas.filter((x) => estados.includes(x.estado)).sort(porFecha);
  const porAceptar = con("asignada");
  const devueltas = con("devuelta");
  const enMarcha = con("aceptada", "en_curso");
  const enEspera = con("aclaracion", "enviada", "en_revision");

  return (
    <div className="space-y-10 sm:space-y-12">
      {cabecera}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <TarjetaKPI valor={porAceptar.length + devueltas.length} etiqueta={t.inicio.tuTurno} tono="marca" />
        <TarjetaKPI valor={enMarcha.length} etiqueta={t.inicio.enMarcha} />
        <TarjetaKPI valor={vencidas.length} etiqueta={t.inicio.cifras.vencidas} tono="alerta" />
        <TarjetaKPI valor={completadas} etiqueta={t.inicio.cifras.completadas} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          {porAceptar.length + devueltas.length + enMarcha.length === 0 && (
            <Seccion titulo={t.inicio.tuTurno}>
              <Renglones tareas={[]} vacio={t.inicio.nadaPendiente} />
            </Seccion>
          )}
          {porAceptar.length > 0 && (
            <Seccion titulo={t.inicio.porAceptar} cuenta={porAceptar.length}>
              <Renglones tareas={porAceptar} vacio="" />
            </Seccion>
          )}
          {devueltas.length > 0 && (
            <Seccion titulo={t.inicio.devueltas} cuenta={devueltas.length}>
              <Renglones tareas={devueltas} vacio="" />
            </Seccion>
          )}
          {enMarcha.length > 0 && (
            <Seccion titulo={t.inicio.enMarcha} cuenta={enMarcha.length}>
              <Renglones tareas={enMarcha} vacio="" />
            </Seccion>
          )}
        </div>
        <div className="space-y-8">
          <Seccion titulo={t.inicio.fechas} cuenta={fechas.length}>
            <Renglones tareas={fechas} vacio={t.inicio.sinFechas} />
          </Seccion>
          {enEspera.length > 0 && (
            <Seccion titulo={t.inicio.enEspera} cuenta={enEspera.length}>
              <Renglones tareas={enEspera} vacio="" />
            </Seccion>
          )}
        </div>
      </div>

      <div>
        <Link href="/panel/tareas" className="btn btn-linea inline-flex items-center gap-2 text-sm font-semibold">
          {t.inicio.verTodas} <span>→</span>
        </Link>
      </div>
    </div>
  );
}
