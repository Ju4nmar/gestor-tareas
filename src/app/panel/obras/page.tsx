"use client";

import Link from "next/link";
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
  // Al crear la obra se puede invitar de una vez a su cliente.
  const [cliente, setCliente] = useState("");
  const [correo, setCorreo] = useState("");
  // Si la obra ya se creó pero la invitación falló, al reintentar no se crea otra obra.
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
        <fieldset className="border-t border-regla pt-4">
          <legend className="etiqueta">{t.obras.clienteOpcional}</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

/** Quién sigue la obra como cliente: invitar, copiar el enlace y quitar el acceso. */
function Clientes({ obra, clientes }: { obra: Obra; clientes: Perfil[] }) {
  const { t } = useT();
  const [invitando, setInvitando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  // Código cuyo enlace se acaba de copiar, e invitación recién creada.
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
      <p className="rotulo">{t.obras.clientes}</p>
      {clientes.length === 0 && !invitando && <p className="mt-1 text-sm text-gris">{t.obras.sinCliente}</p>}
      <ul>
        {clientes.map((c) => (
          <li key={c.id} className="mt-2 text-sm">
            <p className="font-medium">{c.nombre}</p>
            <p className="truncate font-mono text-xs text-gris">
              {c.email}
              {!c.userId ? <> · {t.comun.pendiente} · <VigenciaInvitacion vence={c.invitacionVence} /></> : !c.activo ? ` · ${t.comun.inactivo}` : ""}
            </p>
            <p className="flex flex-wrap items-center gap-x-5">
              {!c.userId && <AccionesInvitacion perfil={c} copiado={copiado} onCopiar={copiar} onRenovar={renovar} />}
              {porQuitar === c.id ? (
                <span>
                  {t.obras.quitarClienteSeguro}
                  <button className="enlace ml-3 py-1 font-semibold text-alerta" onClick={() => void quitar(c.id)}>
                    {t.comun.si}
                  </button>
                  <button className="enlace ml-3 py-1" onClick={() => setPorQuitar("")}>
                    {t.comun.no}
                  </button>
                </span>
              ) : (
                <button className="enlace py-1 text-gris hover:text-tinta" onClick={() => setPorQuitar(c.id)}>
                  {t.obras.quitarCliente}
                </button>
              )}
            </p>
          </li>
        ))}
      </ul>
      {recien && <p className="mt-2 text-sm">{t.obras.enlaceListo}</p>}

      {invitando ? (
        <form onSubmit={invitar} className="mt-3 space-y-3">
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
          <p className="text-xs text-gris">{t.obras.clienteAyuda}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={enviando}>
              {t.equipo.boton}
            </button>
            <button type="button" className="btn btn-suave" onClick={() => setInvitando(false)}>
              {t.comun.cancelar}
            </button>
          </div>
        </form>
      ) : (
        <button className="enlace mt-2 py-1 text-sm font-medium" onClick={() => setInvitando(true)}>
          + {t.obras.invitarCliente}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-alerta">
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

      {admin && <Clientes obra={obra} clientes={clientes} />}

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
