"use client";

import Link from "next/link";
import { Encabezado, Renglones, Seccion } from "@/components/ui";
import { sumarDias, useHoy } from "@/lib/fechas";
import { ESPERA_ADMIN, abierta, proxima, vencida } from "@/lib/flujo";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { Estado, Tarea } from "@/lib/types";

/** Estados por los que pasa una tarea en marcha, para la franja del flujo. */
const EN_MARCHA: Estado[] = ["asignada", "aclaracion", "aceptada", "en_curso", "enviada", "en_revision", "devuelta"];

const porFecha = (a: Tarea, b: Tarea) => (a.vence ?? "9").localeCompare(b.vence ?? "9");

function Cifra({ valor, etiqueta, tono }: { valor: number; etiqueta: string; tono?: "alerta" | "marca" }) {
  return (
    <div className="border-l border-regla pl-4 first:border-l-0 first:pl-0">
      <p className={`font-display text-5xl font-extrabold leading-none tracking-tight ${tono === "alerta" && valor > 0 ? "text-alerta" : ""}`}>
        {tono === "marca" && valor > 0 ? <span className="resaltado">{valor}</span> : valor}
      </p>
      <p className="rotulo mt-2">{etiqueta}</p>
    </div>
  );
}

/** Cuántas tareas hay en cada estado, como una franja proporcional y sus cifras. */
function Flujo({ tareas }: { tareas: Tarea[] }) {
  const { t } = useT();
  const cuentas = EN_MARCHA.map((estado) => ({ estado, n: tareas.filter((x) => x.estado === estado).length }));
  const total = cuentas.reduce((s, c) => s + c.n, 0);
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-[2px] bg-regla" aria-hidden>
        {cuentas.map(
          (c) => c.n > 0 && <span key={c.estado} style={{ width: `${(c.n / total) * 100}%`, background: `var(--e-${c.estado})` }} />,
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
        {cuentas.map((c) => (
          <Link
            key={c.estado}
            href={`/panel/tareas?estado=${c.estado}`}
            className={`group border-t-2 pt-2 transition-opacity ${c.n === 0 ? "opacity-45" : ""}`}
            style={{ borderColor: `var(--e-${c.estado})` }}
          >
            <span className="block font-display text-3xl font-bold leading-none">{c.n}</span>
            <span className="rotulo mt-1.5 block group-hover:text-tinta">{t.estados[c.estado]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function InicioPage() {
  const { perfil, tareas } = useStore();
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
  const cabecera = <Encabezado rotulo={hoy ? hoyLargo(hoy) : ""} titulo={t.inicio.hola(nombre)} />;

  if (admin) {
    const esperan = abiertas.filter((x) => ESPERA_ADMIN.includes(x.estado)).sort(porFecha);
    const borradores = abiertas.filter((x) => x.estado === "borrador");
    return (
      <div className="space-y-12">
        {cabecera}
        <div className="grid grid-cols-2 gap-y-6 border-y border-tinta py-6 sm:grid-cols-4">
          <Cifra valor={abiertas.length} etiqueta={t.inicio.cifras.abiertas} />
          <Cifra valor={esperan.length} etiqueta={t.inicio.cifras.porRevisar} tono="marca" />
          <Cifra valor={vencidas.length} etiqueta={t.inicio.cifras.vencidas} tono="alerta" />
          <Cifra valor={completadas} etiqueta={t.inicio.cifras.completadas} />
        </div>
        <Seccion titulo={t.inicio.flujo}>
          <Flujo tareas={abiertas} />
        </Seccion>
        <div className="grid gap-12 lg:grid-cols-2">
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

  // Para quien recibe tareas: primero lo que le toca mover, luego lo que espera respuesta.
  const con = (...estados: Estado[]) => abiertas.filter((x) => estados.includes(x.estado)).sort(porFecha);
  const porAceptar = con("asignada");
  const devueltas = con("devuelta");
  const enMarcha = con("aceptada", "en_curso");
  const enEspera = con("aclaracion", "enviada", "en_revision");

  return (
    <div className="space-y-12">
      {cabecera}
      <div className="grid grid-cols-2 gap-y-6 border-y border-tinta py-6 sm:grid-cols-4">
        <Cifra valor={porAceptar.length + devueltas.length} etiqueta={t.inicio.tuTurno} tono="marca" />
        <Cifra valor={enMarcha.length} etiqueta={t.inicio.enMarcha} />
        <Cifra valor={vencidas.length} etiqueta={t.inicio.cifras.vencidas} tono="alerta" />
        <Cifra valor={completadas} etiqueta={t.inicio.cifras.completadas} />
      </div>
      <div className="grid gap-12 lg:grid-cols-2">
        <div className="space-y-10">
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
        <div className="space-y-10">
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
      <Link href="/panel/tareas" className="enlace inline-block text-sm">
        {t.inicio.verTodas} →
      </Link>
    </div>
  );
}
