"use client";

import { avanceDe } from "@/lib/avance";

import Link from "next/link";
import { ObraVisual } from "@/components/Arquitectura";
import { useState } from "react";
import { AccionesInvitacion, Avance, Encabezado, Seccion, VigenciaInvitacion, copiarInvitacion, falloDe } from "@/components/ui";
import { useHoy } from "@/lib/fechas";
import { abierta, vencida } from "@/lib/flujo";
import { borrarObra, guardarObra, invitarCliente, quitarCliente, renovarInvitacion, useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { Obra, Perfil, Tarea } from "@/lib/types";

/** Nombre y dirección de una obra: sirve para crearla y para corregirla. */
function ObraForm({ obra, onDone }: { obra?: Obra; onDone: () => void }) {
  const { t } = useT();
  const [nombre, setNombre] = useState(obra?.nombre ?? "");
  const [detalle, setDetalle] = useState(obra?.detalle ?? "");
  const [cliente, setCliente] = useState("");
  const [correo, setCorreo] = useState("");
  const [id, setId] = useState(obra?.id ?? null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async (event: React.FormEvent) => {
    event.preventDefault();
    setGuardando(true);
    setError("");
    try {
      const obraId = await guardarObra(id, nombre, detalle, obra?.activa ?? true);
      setId(obraId);
      if (!obra && correo.trim()) await invitarCliente(obraId, cliente, correo);
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
      {!obra && (
        <fieldset className="rounded-xl border border-regla bg-papel/50 p-4">
          <legend className="px-1 text-xs font-bold uppercase tracking-wider text-gris">{t.obras.clienteOpcional}</legend>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="etiqueta" htmlFor="cliente-nueva">
                {t.obras.clienteNombre}
              </label>
              <input className="campo" id="cliente-nueva" value={cliente} onChange={(e) => setCliente(e.target.value)} maxLength={80} />
            </div>
            <div>
              <label className="etiqueta" htmlFor="correo-nueva">
                {t.obras.clienteCorreo}
              </label>
              <input className="campo" id="correo-nueva" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
            </div>
          </div>
          <p className="mt-2 text-xs text-gris">{t.obras.clienteAyuda}</p>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-2">
        <button className="btn btn-marca" disabled={guardando}>
          {obra ? t.comun.guardar : t.obras.crear}
        </button>
        <button type="button" className="btn btn-linea" onClick={onDone}>
          {t.comun.cancelar}
        </button>
      </div>
    </form>
  );
}

/** Quién sigue la obra como cliente: invitar, copiar el enlace y quitar el acceso. */
function Clientes({ obra, clientes }: { obra: Obra; clientes: Perfil[] }) {
  const { t } = useT();
  const [invitando, setInvitando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState("");
  const [recien, setRecien] = useState(false);
  const [porQuitar, setPorQuitar] = useState("");

  const invitar = async (event: React.FormEvent) => {
    event.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const codigo = await invitarCliente(obra.id, nombre, correo);
      setRecien(Boolean(codigo));
      setInvitando(false);
      setNombre("");
      setCorreo("");
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    } finally {
      setEnviando(false);
    }
  };

  const copiar = async (codigo: string) => {
    if (await copiarInvitacion(codigo, t.equipo.enlace)) setCopiado(codigo);
  };

  const renovar = async (id: string) => {
    setError("");
    try {
      await copiar(await renovarInvitacion(id));
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    }
  };

  const quitar = async (perfilId: string) => {
    setPorQuitar("");
    setRecien(false);
    try {
      await quitarCliente(obra.id, perfilId);
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    }
  };

  return (
    <div className="mt-5 border-t border-regla pt-4">
      <span className="text-xs font-bold uppercase tracking-wider text-gris">{t.obras.clientes}</span>
      {clientes.length === 0 && !invitando && (
        <p className="mt-1 text-xs text-gris">{t.obras.sinCliente}</p>
      )}
      <ul className="mt-2 space-y-2">
        {clientes.map((c) => (
          <li key={c.id} className="rounded-xl border border-regla bg-papel/50 p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-tinta">{c.nombre}</span>
              <span className="text-[11px] text-gris">
                {!c.userId ? (
                  <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {t.comun.pendiente}
                  </span>
                ) : !c.activo ? (
                  t.comun.inactivo
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {t.equipo.activo}
                  </span>
                )}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-gris">{c.email}</p>
            {!c.userId && (
              <div className="mt-1.5 text-[11px] text-gris">
                <VigenciaInvitacion vence={c.invitacionVence} />
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-regla/60">
              {!c.userId && <AccionesInvitacion perfil={c} copiado={copiado} onCopiar={copiar} onRenovar={renovar} />}
              {porQuitar === c.id ? (
                <span className="text-xs">
                  {t.obras.quitarClienteSeguro}
                  <button className="ml-2 font-bold text-rose-600 dark:text-rose-400" onClick={() => void quitar(c.id)}>
                    {t.comun.si}
                  </button>
                  <button className="ml-2 font-medium text-gris" onClick={() => setPorQuitar("")}>
                    {t.comun.no}
                  </button>
                </span>
              ) : (
                <button className="text-[11px] font-medium text-gris hover:text-rose-600" onClick={() => setPorQuitar(c.id)}>
                  {t.obras.quitarCliente}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {recien && <p className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400">{t.obras.enlaceListo}</p>}

      {invitando ? (
        <form onSubmit={invitar} className="mt-3 space-y-3 rounded-xl border border-regla bg-papel/60 p-3">
          <div>
            <label className="etiqueta" htmlFor={`cliente-${obra.id}`}>
              {t.obras.clienteNombre}
            </label>
            <input
              className="campo"
              id={`cliente-${obra.id}`}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              minLength={2}
              maxLength={80}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="etiqueta" htmlFor={`correo-${obra.id}`}>
              {t.obras.clienteCorreo}
            </label>
            <input className="campo" id={`correo-${obra.id}`} type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
          </div>
          <p className="text-[11px] text-gris">{t.obras.clienteAyuda}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button className="btn btn-marca py-1 text-xs" disabled={enviando}>
              {t.equipo.boton}
            </button>
            <button type="button" className="btn btn-linea py-1 text-xs" onClick={() => setInvitando(false)}>
              {t.comun.cancelar}
            </button>
          </div>
        </form>
      ) : (
        <button className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400" onClick={() => setInvitando(true)}>
          <span>+</span> {t.obras.invitarCliente}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

function Tarjeta({ obra, tareas, admin, clientes }: { obra: Obra; tareas: Tarea[]; admin: boolean; clientes: Perfil[] }) {
  const { t } = useT();
  const hoy = useHoy();
  const [editando, setEditando] = useState(false);
  const [porBorrar, setPorBorrar] = useState(false);
  const [error, setError] = useState("");

  const hechas = tareas.filter((x) => x.estado === "completada").length;
  const avance = avanceDe(tareas);
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
      <li className="hoja p-5 sm:p-6">
        <ObraForm obra={obra} onDone={() => setEditando(false)} />
      </li>
    );
  }

  return (
    <li className={`hoja flex flex-col p-5 shadow-xs transition-shadow hover:shadow-md sm:p-6 ${obra.activa ? "" : "opacity-75"}`}>
      <ObraVisual className="obra-modulo-visual" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl font-bold tracking-tight text-tinta">{obra.nombre}</h2>
          {obra.detalle && <p className="mt-1 text-xs text-gris line-clamp-2">{obra.detalle}</p>}
        </div>
        {!obra.activa && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-gris dark:bg-slate-800">
            {t.obras.archivadas}
          </span>
        )}
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs font-semibold text-gris">
          <span>{tareas.length ? t.obras.avance(hechas, tareas.length) : t.obras.sinTareas}</span>
          <span>{`${avance.porcentaje}%`}</span>
        </div>
        <div className="mt-2">
          <Avance hechas={avance.hechas} total={avance.total} />
        </div>
        {abiertas > 0 && (
          <p className="mt-2 flex items-center gap-2 text-xs text-gris">
            <span>{t.obras.abiertas(abiertas)}</span>
            {vencidas > 0 && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                {t.obras.vencidas(vencidas)}
              </span>
            )}
          </p>
        )}
      </div>

      {admin && <Clientes obra={obra} clientes={clientes} />}

      <div className="mt-auto pt-6">
        <Link href={`/panel/obras/${obra.id}`} className="btn btn-linea w-full justify-center text-xs font-semibold">
          Ver obra →
        </Link>
        {admin && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gris">
            <button className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400" onClick={() => setEditando(true)}>
              {t.detalle.editar}
            </button>
            <button
              className="hover:text-tinta"
              onClick={() => void intentar(() => guardarObra(obra.id, obra.nombre, obra.detalle, !obra.activa))}
            >
              {obra.activa ? t.obras.archivar : t.obras.reactivar}
            </button>
            {tareas.length === 0 &&
              (porBorrar ? (
                <span>
                  {t.obras.borrarSeguro}
                  <button className="ml-2 font-bold text-rose-600 dark:text-rose-400" onClick={() => void intentar(() => borrarObra(obra.id))}>
                    {t.comun.si}
                  </button>
                  <button className="ml-2 font-medium text-gris" onClick={() => setPorBorrar(false)}>
                    {t.comun.no}
                  </button>
                </span>
              ) : (
                <button className="hover:text-rose-600" onClick={() => setPorBorrar(true)}>
                  {t.obras.borrar}
                </button>
              ))}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

export default function ObrasPage() {
  const { perfil, obras, tareas, perfiles, clientes } = useStore();
  const { t } = useT();
  const [creando, setCreando] = useState(false);
  if (!perfil) return null;

  const admin = perfil.rol === "admin";
  const de = (obra: Obra) => tareas.filter((x) => x.obraId === obra.id);
  const siguen = (obra: Obra) =>
    clientes
      .filter((c) => c.obraId === obra.id)
      .map((c) => perfiles.find((p) => p.id === c.perfilId))
      .filter((p): p is Perfil => Boolean(p));
  const activas = obras.filter((o) => o.activa);
  const archivadas = obras.filter((o) => !o.activa);

  return (
    <div className="space-y-6 sm:space-y-8">
      <Encabezado titulo={t.obras.titulo}>
        {admin && !creando && (
          <button className="btn btn-marca" onClick={() => setCreando(true)}>
            + {t.obras.nueva}
          </button>
        )}
      </Encabezado>
      <p className="max-w-2xl text-sm text-gris">{admin ? t.obras.ayuda : t.obras.tuyas}</p>

      {creando && (
        <div className="hoja animate-entrar p-5 sm:p-7">
          <h2 className="mb-4 font-display text-xl font-bold tracking-tight text-tinta">{t.obras.nueva}</h2>
          <ObraForm onDone={() => setCreando(false)} />
        </div>
      )}

      {activas.length === 0 ? (
        <div className="hoja p-12 text-center text-sm text-gris">{admin ? t.obras.vacio : t.obras.sinTuyas}</div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {activas.map((o) => (
            <Tarjeta key={o.id} obra={o} tareas={de(o)} admin={admin} clientes={siguen(o)} />
          ))}
        </ul>
      )}

      {archivadas.length > 0 && (
        <Seccion titulo={t.obras.archivadas} cuenta={archivadas.length}>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {archivadas.map((o) => (
              <Tarjeta key={o.id} obra={o} tareas={de(o)} admin={admin} clientes={siguen(o)} />
            ))}
          </ul>
        </Seccion>
      )}
    </div>
  );
}
