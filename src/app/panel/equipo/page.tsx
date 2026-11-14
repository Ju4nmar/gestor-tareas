"use client";

import { useState } from "react";
import { AccionesInvitacion, Encabezado, Seccion, VigenciaInvitacion, copiarInvitacion, falloDe } from "@/components/ui";
import { abierta } from "@/lib/flujo";
import { actualizarPerfil, invitar, quitarInvitacion, renovarInvitacion, useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { Perfil, Rol } from "@/lib/types";

function Avatar({ nombre }: { nombre: string }) {
  const iniciales = nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 font-sans text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
      {iniciales || "U"}
    </span>
  );
}

export default function EquipoPage() {
  const { perfil, perfiles: todos, tareas, obras, clientes: enlaces } = useStore();
  const { t } = useT();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState("");
  if (!perfil || perfil.rol !== "admin") return null;

  const intentar = async (paso: () => Promise<unknown>) => {
    setError("");
    try {
      await paso();
      return true;
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
      return false;
    }
  };

  const crear = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formulario = event.currentTarget;
    const data = new FormData(formulario);
    setEnviando(true);
    const hecho = await intentar(() =>
      invitar(String(data.get("nombre")), String(data.get("correo")), data.get("rol") as Rol),
    );
    setEnviando(false);
    if (hecho) formulario.reset();
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

  const perfiles = todos.filter((p) => p.rol !== "cliente");
  const clientes = todos.filter((p) => p.rol === "cliente");
  const obrasDe = (id: string) =>
    enlaces
      .filter((c) => c.perfilId === id)
      .map((c) => obras.find((o) => o.id === c.obraId)?.nombre)
      .filter(Boolean)
      .join(", ");

  const cambiar = (p: Perfil, patch: Partial<Pick<Perfil, "nombre" | "rol" | "activo">>) =>
    intentar(() => actualizarPerfil(p.id, patch.nombre ?? p.nombre, patch.rol ?? p.rol, patch.activo ?? p.activo));

  const abiertasDe = (id: string) => tareas.filter((x) => x.asignadaA === id && abierta(x)).length;

  return (
    <div className="space-y-8 sm:space-y-10">
      <Encabezado
        rotulo={`${perfiles.filter((p) => p.activo && p.userId).length} ${t.equipo.activo.toLowerCase()}`}
        titulo={t.equipo.titulo}
      />

      {error && (
        <div role="alert" className="hoja border-rose-200 bg-rose-50/80 p-4 text-sm font-semibold text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Formulario de invitación moderno */}
      <Seccion titulo={t.equipo.invitar}>
        <form onSubmit={crear} className="hoja grid grid-cols-1 gap-4 p-5 sm:grid-cols-[1.2fr_1.5fr_10rem_auto] sm:items-end sm:p-6">
          <div>
            <label className="etiqueta" htmlFor="nombre">
              {t.equipo.nombre}
            </label>
            <input className="campo" id="nombre" name="nombre" minLength={2} maxLength={80} required />
          </div>
          <div>
            <label className="etiqueta" htmlFor="correo">
              {t.equipo.correo}
            </label>
            <input className="campo" id="correo" name="correo" type="email" required />
          </div>
          <div>
            <label className="etiqueta" htmlFor="rol">
              {t.equipo.rol}
            </label>
            <select className="campo" id="rol" name="rol" defaultValue="empleado">
              <option value="empleado">{t.roles.empleado}</option>
              <option value="admin">{t.roles.admin}</option>
            </select>
          </div>
          <button className="btn btn-marca" disabled={enviando}>
            {t.equipo.boton}
          </button>
        </form>
        <p className="mt-2 text-xs text-gris">{t.equipo.ayuda}</p>
      </Seccion>

      {/* Lista del equipo en tarjetas limpias */}
      <div className="space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-gris">
          {t.equipo.titulo} ({perfiles.length})
        </span>
        <ul className="divide-y divide-regla rounded-2xl border border-regla bg-hoja shadow-xs overflow-hidden">
          {perfiles.map((p) => {
            const yo = p.id === perfil.id;
            const pendiente = !p.userId;
            return (
              <li
                key={p.id}
                className={`flex flex-col gap-4 p-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:p-5 ${
                  p.activo ? "hover:bg-slate-50/60 dark:hover:bg-slate-800/40" : "opacity-60 bg-slate-50/40"
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <Avatar nombre={p.nombre} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        className="campo min-w-0 max-w-xs border-transparent bg-transparent px-0 py-0.5 text-base font-bold text-tinta hover:border-regla hover:px-2 focus:px-2"
                        defaultValue={p.nombre}
                        key={p.nombre}
                        aria-label={t.equipo.nombre}
                        maxLength={80}
                        onBlur={(e) => {
                          const nombre = e.target.value.trim();
                          if (nombre.length >= 2 && nombre !== p.nombre) void cambiar(p, { nombre });
                          else e.target.value = p.nombre;
                        }}
                      />
                      {yo && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          {t.equipo.tu}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gris">
                      {p.email} ·{" "}
                      {pendiente ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {t.comun.pendiente} · <VigenciaInvitacion vence={p.invitacionVence} />
                        </span>
                      ) : p.activo ? (
                        t.equipo.abiertas(abiertasDe(p.id))
                      ) : (
                        t.comun.inactivo
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <select
                    className="campo py-1.5 text-xs font-semibold"
                    aria-label={t.equipo.rol}
                    value={p.rol}
                    disabled={yo}
                    onChange={(e) => void cambiar(p, { rol: e.target.value as Rol })}
                  >
                    <option value="empleado">{t.roles.empleado}</option>
                    <option value="admin">{t.roles.admin}</option>
                  </select>

                  {pendiente && <AccionesInvitacion perfil={p} copiado={copiado} onCopiar={copiar} onRenovar={renovar} />}

                  {pendiente ? (
                    <button
                      className="text-xs font-semibold text-gris hover:text-rose-600"
                      onClick={() => void intentar(() => quitarInvitacion(p.id))}
                    >
                      {t.equipo.retirar}
                    </button>
                  ) : (
                    !yo && (
                      <button
                        className="text-xs font-semibold text-gris hover:text-tinta"
                        onClick={() => void cambiar(p, { activo: !p.activo })}
                      >
                        {p.activo ? t.equipo.desactivar : t.equipo.reactivar}
                      </button>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Clientes */}
      {clientes.length > 0 && (
        <Seccion titulo={t.equipo.clientes} cuenta={clientes.length}>
          <p className="mb-3 text-xs text-gris">{t.equipo.clientesAyuda}</p>
          <ul className="divide-y divide-regla rounded-2xl border border-regla bg-hoja shadow-xs overflow-hidden">
            {clientes.map((p) => (
              <li
                key={p.id}
                className={`flex flex-col gap-4 p-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:p-5 ${
                  p.activo ? "hover:bg-slate-50/60 dark:hover:bg-slate-800/40" : "opacity-60 bg-slate-50/40"
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <Avatar nombre={p.nombre} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-tinta">{p.nombre}</p>
                    <p className="mt-0.5 truncate text-xs text-gris">
                      {p.email} ·{" "}
                      {!p.userId ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {t.comun.pendiente} · <VigenciaInvitacion vence={p.invitacionVence} />
                        </span>
                      ) : p.activo ? (
                        t.equipo.sigue(obrasDe(p.id) || t.equipo.sinObra)
                      ) : (
                        t.comun.inactivo
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  {!p.userId && <AccionesInvitacion perfil={p} copiado={copiado} onCopiar={copiar} onRenovar={renovar} />}
                  {p.userId && (
                    <button
                      className="text-xs font-semibold text-gris hover:text-tinta"
                      onClick={() => void cambiar(p, { activo: !p.activo })}
                    >
                      {p.activo ? t.equipo.desactivar : t.equipo.reactivar}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Seccion>
      )}
    </div>
  );
}
