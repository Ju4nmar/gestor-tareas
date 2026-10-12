"use client";

import Link from "next/link";
import { useState } from "react";
import { Marco } from "@/components/Marco";
import { Cargando, falloDe } from "@/components/ui";
import { cambiarClave, useStore } from "@/lib/store";
import { useT } from "@/lib/textos";

export default function RestablecerPage() {
  const { listo, email } = useStore();
  const { t } = useT();
  const [estado, setEstado] = useState<"listo" | "guardando" | "hecho">("listo");
  const [error, setError] = useState("");

  const guardar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("clave") !== data.get("repetir")) return setError(t.activar.distintas);
    setEstado("guardando");
    setError("");
    try {
      await cambiarClave(String(data.get("clave")));
      setEstado("hecho");
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
      setEstado("listo");
    }
  };

  if (!listo) return <Cargando />;
  return (
    <Marco titulo={t.restablecer.titulo}>
      {estado === "hecho" ? (
        <>
          <p className="mt-4">{t.restablecer.listo}</p>
          <Link href="/panel" className="btn mt-6 self-start">
            {t.nav.inicio}
          </Link>
        </>
      ) : !email ? (
        // El enlace del correo abre esta página ya con sesión; sin él no hay a quién cambiarle la contraseña.
        <p className="mt-4 leading-relaxed text-gris">{t.restablecer.sinSesion}</p>
      ) : (
        <form onSubmit={guardar} className="mt-6 space-y-4">
          <p className="font-mono text-sm text-gris">{email}</p>
          <div>
            <label className="etiqueta" htmlFor="clave">
              {t.activar.clave}
            </label>
            <input className="campo" id="clave" name="clave" type="password" minLength={8} autoComplete="new-password" required />
            <p className="mt-1.5 text-xs text-gris">{t.activar.claveAyuda}</p>
          </div>
          <div>
            <label className="etiqueta" htmlFor="repetir">
              {t.activar.repetir}
            </label>
            <input className="campo" id="repetir" name="repetir" type="password" minLength={8} autoComplete="new-password" required />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-alerta">
              {error}
            </p>
          )}
          <button className="btn w-full" disabled={estado === "guardando"}>
            {t.restablecer.boton}
          </button>
        </form>
      )}
    </Marco>
  );
}
