"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Marco } from "@/components/Marco";
import { Cargando, falloDe } from "@/components/ui";
import { activar, activarConSesion, infoInvitacion, salir, useStore } from "@/lib/store";
import { useT } from "@/lib/textos";

type Invitacion = { name: string; email: string } | { vencida: true };

export default function ActivarPage() {
  const { listo, perfil, email } = useStore();
  const { t } = useT();
  const router = useRouter();
  const codigo = (useSearchParams().get("codigo") ?? "").trim();
  // undefined = consultando; null = el código no sirve.
  const [invitacion, setInvitacion] = useState<Invitacion | null | undefined>(codigo ? undefined : null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [porConfirmar, setPorConfirmar] = useState(false);

  useEffect(() => {
    if (!codigo) return;
    let vigente = true;
    infoInvitacion(codigo)
      .then((info) => vigente && setInvitacion(info))
      .catch(() => vigente && setInvitacion(null));
    return () => {
      vigente = false;
    };
  }, [codigo]);

  // Cuenta ya activa: al panel.
  useEffect(() => {
    if (listo && perfil) router.replace("/panel");
  }, [listo, perfil, router]);

  const intentar = async (paso: () => Promise<void>) => {
    setEnviando(true);
    setError("");
    try {
      await paso();
    } catch (e) {
      const fallo = falloDe(e);
      if (fallo === "confirmar") setPorConfirmar(true);
      else setError(t.fallos[fallo]);
    } finally {
      setEnviando(false);
    }
  };

  const crear = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invitacion || "vencida" in invitacion) return;
    const data = new FormData(event.currentTarget);
    if (data.get("clave") !== data.get("repetir")) return setError(t.activar.distintas);
    void intentar(() => activar(codigo, invitacion.email, String(data.get("clave"))));
  };

  if (!listo || invitacion === undefined) return <Cargando />;

  return (
    <Marco titulo={t.activar.titulo}>
      {!invitacion ? (
        <>
          <p className="mt-4 leading-relaxed text-gris">{t.activar.invalida}</p>
          <Link href="/" className="btn btn-linea mt-6 self-start">
            {t.activar.irEntrar}
          </Link>
        </>
      ) : "vencida" in invitacion ? (
        <p className="mt-4 leading-relaxed text-gris">{t.activar.vencida}</p>
      ) : porConfirmar ? (
        <p className="hoja mt-6 p-4 leading-relaxed">{t.activar.confirmar(invitacion.email)}</p>
      ) : email ? (
        // Ya hay sesión (por ejemplo, al volver del correo de confirmación): solo falta unirla a la invitación.
        <>
          <p className="mt-4 leading-relaxed">{t.activar.hola(invitacion.name)}</p>
          <p className="mt-2 font-mono text-sm text-gris">{email}</p>
          {error && (
            <p role="alert" className="mt-4 text-sm font-medium text-alerta">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn" disabled={enviando} onClick={() => void intentar(() => activarConSesion(codigo))}>
              {enviando ? t.activar.activando : t.activar.boton}
            </button>
            <button className="btn btn-suave" onClick={() => void salir()}>
              {t.comun.salir}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={crear} className="mt-4 space-y-4">
          <p className="leading-relaxed">{t.activar.hola(invitacion.name)}</p>
          <p className="font-mono text-sm text-gris">{invitacion.email}</p>
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
          <button className="btn w-full" disabled={enviando}>
            {enviando ? t.activar.activando : t.activar.boton}
          </button>
        </form>
      )}
    </Marco>
  );
}
