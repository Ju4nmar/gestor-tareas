"use client";

import Link from "next/link";
import { useState } from "react";
import { Avance, Encabezado, Seccion, falloDe } from "@/components/ui";
import { useHoy } from "@/lib/fechas";
import { abierta, vencida } from "@/lib/flujo";
import { borrarObra, guardarObra, useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { Obra, Tarea } from "@/lib/types";

/** Nombre y dirección de una obra: sirve para crearla y para corregirla. */
function ObraForm({ obra, onDone }: { obra?: Obra; onDone: () => void }) {
  const { t } = useT();
  const [nombre, setNombre] = useState(obra?.nombre ?? "");
  const [detalle, setDetalle] = useState(obra?.detalle ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async (event: React.FormEvent) => {
    event.preventDefault();
    setGuardando(true);
    setError("");
    try {
      await guardarObra(obra?.id ?? null, nombre, detalle, obra?.activa ?? true);
      onDone();
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={guardar} className="space-y-4">
      <div>
        <label className="etiqueta" htmlFor={`nombre-${obra?.id ?? "nueva"}`}>
          {t.obras.nombre}
        </label>
        <input
          className="campo"
          id={`nombre-${obra?.id ?? "nueva"}`}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          minLength={2}
          maxLength={80}
          required
          autoFocus
        />
      </div>
      <div>
        <label className="etiqueta" htmlFor={`detalle-${obra?.id ?? "nueva"}`}>
          {t.obras.detalle}
        </label>
        <input
          className="campo"
          id={`detalle-${obra?.id ?? "nueva"}`}
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          maxLength={200}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-alerta">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={guardando}>
          {obra ? t.comun.guardar : t.obras.crear}
        </button>
        <button type="button" className="btn btn-suave" onClick={onDone}>
          {t.comun.cancelar}
        </button>
      </div>
    </form>
  );
}

function Tarjeta({ obra, tareas, admin }: { obra: Obra; tareas: Tarea[]; admin: boolean }) {
  const { t } = useT();
  const hoy = useHoy();
  const [editando, setEditando] = useState(false);
  const [porBorrar, setPorBorrar] = useState(false);
  const [error, setError] = useState("");

  const hechas = tareas.filter((x) => x.estado === "completada").length;
  const abiertas = tareas.filter(abierta).length;
  const vencidas = tareas.filter((x) => vencida(x, hoy)).length;

  const intentar = async (cambio: () => Promise<unknown>) => {
    setError("");
    setPorBorrar(false);
    try {
      await cambio();
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    }
  };

  if (editando) {
    return (
      <li className="hoja p-5">
        <ObraForm obra={obra} onDone={() => setEditando(false)} />
      </li>
    );
  }

  return (
    <li className={`hoja flex flex-col p-5 ${obra.activa ? "" : "opacity-70"}`}>
      <h3 className="font-display text-2xl font-bold leading-tight tracking-tight">{obra.nombre}</h3>
      {obra.detalle && <p className="mt-1 text-sm text-gris">{obra.detalle}</p>}

      <div className="mt-5">
        <Avance hechas={hechas} total={tareas.length} />
        <p className="mt-2 text-sm">{tareas.length ? t.obras.avance(hechas, tareas.length) : t.obras.sinTareas}</p>
        {abiertas > 0 && (
          <p className="mt-0.5 font-mono text-xs text-gris">
            {t.obras.abiertas(abiertas)}
            {vencidas > 0 && <span className="font-medium text-alerta"> · {t.obras.vencidas(vencidas)}</span>}
          </p>
        )}
      </div>

      <div className="mt-auto pt-5">
        <Link href={`/panel/tareas?obra=${obra.id}`} className="btn btn-linea w-full">
          {t.obras.verTareas} →
        </Link>
        {admin && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <button className="enlace py-1" onClick={() => setEditando(true)}>
              {t.detalle.editar}
            </button>
            <button
              className="enlace py-1 text-gris hover:text-tinta"
              onClick={() => void intentar(() => guardarObra(obra.id, obra.nombre, obra.detalle, !obra.activa))}
            >
              {obra.activa ? t.obras.archivar : t.obras.reactivar}
            </button>
            {tareas.length === 0 &&
              (porBorrar ? (
                <span>
                  {t.obras.borrarSeguro}
                  <button className="enlace ml-3 py-1 font-semibold text-alerta" onClick={() => void intentar(() => borrarObra(obra.id))}>
                    {t.comun.si}
                  </button>
                  <button className="enlace ml-3 py-1" onClick={() => setPorBorrar(false)}>
                    {t.comun.no}
                  </button>
                </span>
              ) : (
                <button className="enlace py-1 text-gris hover:text-tinta" onClick={() => setPorBorrar(true)}>
                  {t.obras.borrar}
                </button>
              ))}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm font-medium text-alerta">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

export default function ObrasPage() {
  const { perfil, obras, tareas } = useStore();
  const { t } = useT();
  const [creando, setCreando] = useState(false);
  if (!perfil) return null;

  const admin = perfil.rol === "admin";
  const de = (obra: Obra) => tareas.filter((x) => x.obraId === obra.id);
  const activas = obras.filter((o) => o.activa);
  const archivadas = obras.filter((o) => !o.activa);

  return (
    <div className="space-y-8">
      <Encabezado titulo={t.obras.titulo}>
        {admin && !creando && (
          <button className="btn" onClick={() => setCreando(true)}>
            + {t.obras.nueva}
          </button>
        )}
      </Encabezado>
      <p className="max-w-2xl text-gris">{admin ? t.obras.ayuda : t.obras.tuyas}</p>

      {creando && (
        <div className="hoja animate-entrar p-5 sm:p-7">
          <h2 className="mb-4 font-display text-2xl font-bold tracking-tight">{t.obras.nueva}</h2>
          <ObraForm onDone={() => setCreando(false)} />
        </div>
      )}

      {activas.length === 0 ? (
        <p className="border-y border-regla py-12 text-center text-gris">{admin ? t.obras.vacio : t.obras.sinTuyas}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {activas.map((o) => (
            <Tarjeta key={o.id} obra={o} tareas={de(o)} admin={admin} />
          ))}
        </ul>
      )}

      {archivadas.length > 0 && (
        <Seccion titulo={t.obras.archivadas} cuenta={archivadas.length}>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {archivadas.map((o) => (
              <Tarjeta key={o.id} obra={o} tareas={de(o)} admin={admin} />
            ))}
          </ul>
        </Seccion>
      )}
    </div>
  );
}
