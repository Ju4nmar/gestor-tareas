"use client";

import { useState } from "react";
import { Encabezado, Seccion, falloDe } from "@/components/ui";
import { abierta } from "@/lib/flujo";
import { actualizarPerfil, invitar, quitarInvitacion, useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { Perfil, Rol } from "@/lib/types";

const enlaceDe = (codigo: string) => `${window.location.origin}/activar?codigo=${codigo}`;

export default function EquipoPage() {
  const { perfil, perfiles, tareas } = useStore();
  const { t } = useT();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  // Código cuyo enlace se acaba de copiar.
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
    try {
      await navigator.clipboard.writeText(enlaceDe(codigo));
      setCopiado(codigo);
    } catch {
      // Sin permiso para el portapapeles: se muestra el enlace para copiarlo a mano.
      window.prompt(t.equipo.enlace, enlaceDe(codigo));
    }
  };

  const cambiar = (p: Perfil, patch: Partial<Pick<Perfil, "nombre" | "rol" | "activo">>) =>
    intentar(() => actualizarPerfil(p.id, patch.nombre ?? p.nombre, patch.rol ?? p.rol, patch.activo ?? p.activo));

  const abiertasDe = (id: string) => tareas.filter((x) => x.asignadaA === id && abierta(x)).length;

  return (
    <div className="space-y-12">
      <Encabezado rotulo={`${perfiles.filter((p) => p.activo && p.userId).length} ${t.equipo.activo.toLowerCase()}`} titulo={t.equipo.titulo} />

      {error && (
        <p role="alert" className="hoja border-alerta px-4 py-3 text-sm font-medium text-alerta">
          {error}
        </p>
      )}

      <Seccion titulo={t.equipo.invitar}>
        <form onSubmit={crear} className="hoja grid grid-cols-1 gap-4 p-5 sm:grid-cols-[1fr_1.2fr_10rem_auto] sm:items-end">
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
          <button className="btn" disabled={enviando}>
            {t.equipo.boton}
          </button>
        </form>
        <p className="mt-3 max-w-2xl text-sm text-gris">{t.equipo.ayuda}</p>
      </Seccion>

      <ul className="border-t border-tinta">
        {perfiles.map((p) => {
          const yo = p.id === perfil.id;
          const pendiente = !p.userId;
          return (
            <li key={p.id} className={`grid gap-x-6 gap-y-3 border-b border-regla py-4 lg:grid-cols-[1fr_11rem_auto] lg:items-center ${p.activo ? "" : "opacity-55"}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <input
                    className="campo min-w-0 max-w-xs border-transparent bg-transparent px-0 py-0.5 text-lg font-semibold hover:border-regla hover:px-2 focus:px-2"
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
                  {yo && <span className="resaltado font-mono text-[11px] uppercase">{t.equipo.tu}</span>}
                </div>
                <p className="mt-0.5 truncate font-mono text-xs text-gris">
                  {p.email} · {pendiente ? t.comun.pendiente : p.activo ? t.equipo.abiertas(abiertasDe(p.id)) : t.comun.inactivo}
                </p>
              </div>

              <select
                className="campo py-2 text-sm"
                aria-label={t.equipo.rol}
                value={p.rol}
                disabled={yo}
                onChange={(e) => void cambiar(p, { rol: e.target.value as Rol })}
              >
                <option value="empleado">{t.roles.empleado}</option>
                <option value="admin">{t.roles.admin}</option>
              </select>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm lg:justify-end">
                {pendiente && p.codigo && (
                  <button className="enlace font-medium" onClick={() => void copiar(p.codigo!)}>
                    {copiado === p.codigo ? t.equipo.copiado : t.equipo.enlace}
                  </button>
                )}
                {pendiente ? (
                  <button className="enlace text-gris hover:text-tinta" onClick={() => void intentar(() => quitarInvitacion(p.id))}>
                    {t.equipo.retirar}
                  </button>
                ) : (
                  !yo && (
                    <button className="enlace text-gris hover:text-tinta" onClick={() => void cambiar(p, { activo: !p.activo })}>
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
  );
}
