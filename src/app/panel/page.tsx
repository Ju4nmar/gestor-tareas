"use client";

import Link from "next/link";
import { Avance, Barras, Renglones, Seccion } from "@/components/ui";
import { ObraVisual } from "@/components/Arquitectura";
import { Icon } from "@/components/Icon";
import { fechaLocal, sumarDias, useHoy } from "@/lib/fechas";
import {
  ESTADOS,
  ESPERA_ADMIN,
  abierta,
  codigoTarea,
  diasRestantes,
  vencida,
} from "@/lib/flujo";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { Obra, Tarea } from "@/lib/types";

const porFecha = (a: Tarea, b: Tarea) =>
  (a.vence ?? "9").localeCompare(b.vence ?? "9");

function TarjetaKPI({
  valor,
  etiqueta,
  icono,
  tono = "",
}: {
  valor: number;
  etiqueta: string;
  icono: "tareas" | "revisar" | "alerta" | "check";
  tono?: string;
}) {
  return (
    <div className={`kpi ${tono}`}>
      <span className="kpi-icono">
        <Icon name={icono} />
      </span>
      <div>
        <strong>{valor}</strong>
        <p>{etiqueta}</p>
      </div>
    </div>
  );
}

function Flujo({ tareas }: { tareas: Tarea[] }) {
  const { t } = useT();
  const cuentas = ESTADOS.map((estado) => ({
    estado,
    n: tareas.filter((x) => x.estado === estado).length,
  }));
  const total = tareas.length;
  let acumulado = 0;
  const segmentos = cuentas
    .filter((c) => c.n > 0)
    .map((c) => {
      const inicio = acumulado;
      acumulado += (c.n / total) * 100;
      return `var(--e-${c.estado}) ${inicio}% ${acumulado}%`;
    });

  return (
    <div className="hoja flujo-contenido">
      <div
        className="flujo-dona"
        style={{
          background: total
            ? `conic-gradient(${segmentos.join(",")})`
            : "var(--regla)",
        }}
        aria-hidden="true"
      >
        <div className="flujo-total">
          <strong>{total}</strong>
          <span>Tareas</span>
        </div>
      </div>
      <ul className="flujo-leyenda" aria-label="Cantidad de tareas por estado">
        {cuentas.map((c) => (
          <li key={c.estado}>
            <Link href={`/panel/tareas?estado=${c.estado}`}>
              <span>
                <i
                  style={{ background: `var(--e-${c.estado})` }}
                  aria-hidden="true"
                />
                {t.estados[c.estado]}
              </span>
              <b>{c.n}</b>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Obras({
  obras,
  tareas,
  hoy,
}: {
  obras: Obra[];
  tareas: Tarea[];
  hoy: string;
}) {
  const { t } = useT();
  return (
    <ul className="dashboard-obras">
      {obras.map((o) => {
        const suyas = tareas.filter((x) => x.obraId === o.id);
        const hechas = suyas.filter((x) => x.estado === "completada").length;
        const abiertas = suyas.filter(abierta).length;
        const vencidas = suyas.filter((x) => vencida(x, hoy)).length;
        const porcentaje = suyas.length
          ? Math.round((hechas / suyas.length) * 100)
          : 0;
        return (
          <li key={o.id}>
            <Link
              href={`/panel/tareas?obra=${o.id}`}
              className="dashboard-obra"
            >
              <ObraVisual />
              <div className="dashboard-obra-info">
                <h3>{o.nombre}</h3>
                <div className="dashboard-obra-progreso">
                  <Avance hechas={hechas} total={suyas.length} />
                  <strong>{porcentaje}%</strong>
                </div>
                <p>
                  <span>
                    {suyas.length
                      ? t.obras.abiertas(abiertas)
                      : t.obras.sinTareas}
                  </span>
                  {vencidas > 0 && <b>{t.obras.vencidas(vencidas)}</b>}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Vencimientos({ tareas, hoy }: { tareas: Tarea[]; hoy: string }) {
  const { obras } = useStore();
  const { dia } = useT();
  return (
    <section className="hoja vencimientos">
      <header>
        <h2>Próximos vencimientos</h2>
        <Link href="/panel/tareas">Ver todas →</Link>
      </header>
      {tareas.length === 0 ? (
        <p className="p-6 text-sm text-gris">
          No hay tareas abiertas con fecha límite.
        </p>
      ) : (
        <ul>
          {tareas.slice(0, 5).map((tarea) => {
            const dias = diasRestantes(tarea, hoy);
            const atrasada = dias !== null && dias < 0;
            const inminente = dias !== null && dias >= 0 && dias <= 3;
            const etiqueta =
              dias === null
                ? ""
                : dias < 0
                  ? `Hace ${-dias} ${dias === -1 ? "día" : "días"}`
                  : dias === 0
                    ? "Hoy"
                    : dias === 1
                      ? "Mañana"
                      : `En ${dias} días`;
            return (
              <li key={tarea.id}>
                <Link
                  href={`/panel/tareas/${tarea.id}`}
                  className="vencimiento-fila"
                >
                  <span
                    className="vencimiento-marca"
                    style={{
                      background: atrasada
                        ? "var(--alerta)"
                        : inminente
                          ? "var(--advertencia)"
                          : "var(--exito)",
                    }}
                    aria-hidden="true"
                  />
                  <div className="vencimiento-datos">
                    <strong>{tarea.titulo}</strong>
                    <p>
                      {codigoTarea(tarea.numero)} ·{" "}
                      {obras.find((o) => o.id === tarea.obraId)?.nombre ??
                        "Sin obra"}
                    </p>
                    <span className="mt-1 inline-flex">
                      <Barras prioridad={tarea.prioridad} conTexto />
                    </span>
                  </div>
                  <div className="vencimiento-fecha">
                    <span>
                      <Icon name="calendario" />
                      {tarea.vence ? dia(tarea.vence) : ""}
                    </span>
                    <span
                      className={`vencimiento-etiqueta ${atrasada ? "atrasada" : inminente ? "inminente" : ""}`}
                    >
                      {atrasada && <span className="sr-only">Vencida. </span>}
                      {etiqueta}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
  const fechas = abiertas.filter((x) => x.vence).sort(porFecha);
  const desde = hoy ? sumarDias(hoy, -29) : "";
  const completadas = tareas.filter(
    (x) =>
      x.completada &&
      hoy &&
      fechaLocal(new Date(x.completada)) >= desde &&
      fechaLocal(new Date(x.completada)) <= hoy,
  ).length;
  const activas = obras.filter((o) => o.activa);
  const esperan = abiertas
    .filter((x) => ESPERA_ADMIN.includes(x.estado))
    .sort(porFecha);
  const borradores = abiertas.filter((x) => x.estado === "borrador");
  const porAceptar = abiertas.filter((x) => x.estado === "asignada");
  const devueltas = abiertas.filter((x) => x.estado === "devuelta");
  const enMarcha = abiertas.filter(
    (x) => x.estado === "aceptada" || x.estado === "en_curso",
  );
  const enEspera = abiertas.filter((x) => ESPERA_ADMIN.includes(x.estado));
  const avances = activas.map((o) => {
    const suyas = tareas.filter((x) => x.obraId === o.id);
    return suyas.length
      ? (suyas.filter((x) => x.estado === "completada").length / suyas.length) *
          100
      : 0;
  });
  const promedio = avances.length
    ? `${Math.round(avances.reduce((s, n) => s + n, 0) / avances.length)}%`
    : "—";

  return (
    <div className="dashboard">
      <header className="dashboard-cabecera">
        <div>
          <p className="dashboard-fecha">{hoy ? hoyLargo(hoy) : ""}</p>
          <h1>{t.inicio.hola(perfil.nombre.split(" ")[0])}</h1>
          <p>Así va el avance de {admin ? "tus obras" : "tus tareas"} hoy.</p>
        </div>
        {admin && (
          <Link href="/panel/tareas?nueva=1" className="btn btn-marca">
            <Icon name="mas" />
            Nueva tarea
          </Link>
        )}
      </header>
      <div className="dashboard-kpis">
        <TarjetaKPI
          valor={admin ? abiertas.length : porAceptar.length + devueltas.length}
          etiqueta={admin ? "Tareas abiertas" : t.inicio.tuTurno}
          icono="tareas"
        />
        <TarjetaKPI
          valor={admin ? esperan.length : enMarcha.length}
          etiqueta={admin ? t.inicio.cifras.porRevisar : t.inicio.enMarcha}
          icono="revisar"
          tono="kpi-revisar"
        />
        <TarjetaKPI
          valor={vencidas.length}
          etiqueta={t.inicio.cifras.vencidas}
          icono="alerta"
          tono="kpi-alerta"
        />
        <TarjetaKPI
          valor={completadas}
          etiqueta={t.inicio.cifras.completadas}
          icono="check"
          tono="kpi-exito"
        />
      </div>
      <div className="dashboard-cuerpo">
        <div className="dashboard-columna">
          <Seccion titulo={t.inicio.obras} cuenta={activas.length}>
            {activas.length ? (
              <Obras obras={activas} tareas={tareas} hoy={hoy} />
            ) : (
              <div className="hoja p-6 text-sm text-gris">
                {admin
                  ? "Crea tu primera obra desde el módulo Obras."
                  : "Tus obras aparecerán aquí cuando tengas tareas asignadas."}
              </div>
            )}
          </Seccion>
          <Seccion titulo={t.inicio.flujo}>
            <Flujo tareas={tareas} />
          </Seccion>
          {admin ? (
            <>
              <Seccion titulo={t.inicio.esperanPorTi} cuenta={esperan.length}>
                <Renglones
                  tareas={esperan}
                  vacio={t.inicio.nadaPendiente}
                  conResponsable
                />
              </Seccion>
              {borradores.length > 0 && (
                <Seccion
                  titulo={t.inicio.sinAsignar}
                  cuenta={borradores.length}
                >
                  <Renglones tareas={borradores} vacio="" />
                </Seccion>
              )}
            </>
          ) : (
            <>
              <Seccion titulo={t.inicio.porAceptar} cuenta={porAceptar.length}>
                <Renglones
                  tareas={porAceptar.sort(porFecha)}
                  vacio={t.inicio.nadaPendiente}
                />
              </Seccion>
              {devueltas.length > 0 && (
                <Seccion titulo={t.inicio.devueltas} cuenta={devueltas.length}>
                  <Renglones tareas={devueltas.sort(porFecha)} vacio="" />
                </Seccion>
              )}
              {enMarcha.length > 0 && (
                <Seccion titulo={t.inicio.enMarcha} cuenta={enMarcha.length}>
                  <Renglones tareas={enMarcha.sort(porFecha)} vacio="" />
                </Seccion>
              )}
              {enEspera.length > 0 && (
                <Seccion titulo={t.inicio.enEspera} cuenta={enEspera.length}>
                  <Renglones tareas={enEspera.sort(porFecha)} vacio="" />
                </Seccion>
              )}
            </>
          )}
        </div>
        <div className="dashboard-columna">
          <section className="hoja resumen-general">
            <h2>
              <Icon name="avance" />
              Resumen general
            </h2>
            <div className="resumen-cifras">
              <div>
                <strong>{promedio}</strong>
                <span>{admin ? "Avance promedio de obras activas" : "Avance de tus tareas por obra"}</span>
              </div>
              <div>
                <strong>{activas.length}</strong>
                <span>Obras activas</span>
              </div>
              <div>
                <strong>{tareas.length}</strong>
                <span>Tareas totales</span>
              </div>
            </div>
          </section>
          <Vencimientos tareas={fechas} hoy={hoy} />
        </div>
      </div>
    </div>
  );
}
