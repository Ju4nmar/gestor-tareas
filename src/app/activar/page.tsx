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
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-relaxed text-gris">{t.activar.invalida}</p>
          <Link href="/" className="btn btn-linea inline-flex">
            {t.activar.irEntrar}
          </Link>
        </div>
      ) : "vencida" in invitacion ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs font-semibold text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {t.activar.vencida}
        </div>
      ) : porConfirmar ? (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs font-medium text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
          {t.activar.confirmar(invitacion.email)}
        </div>
      ) : email ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm font-semibold text-tinta">{t.activar.hola(invitacion.name)}</p>
          <p className="font-mono text-xs text-gris">{email}</p>
          {error && (
            <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5 pt-2">
            <button className="btn btn-marca" disabled={enviando} onClick={() => void intentar(() => activarConSesion(codigo))}>
              {enviando ? t.activar.activando : t.activar.boton}
            </button>
            <button className="btn btn-linea" onClick={() => void salir()}>
              {t.comun.salir}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={crear} className="mt-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-tinta">{t.activar.hola(invitacion.name)}</p>
            <p className="font-mono text-xs text-gris">{invitacion.email}</p>
          </div>
          <div>
            <label className="etiqueta" htmlFor="clave">
              {t.activar.clave}
            </label>
            <input className="campo" id="clave" name="clave" type="password" minLength={8} autoComplete="new-password" required />
            <p className="mt-1 text-xs text-gris">{t.activar.claveAyuda}</p>
          </div>
          <div>
            <label className="etiqueta" htmlFor="repetir">
              {t.activar.repetir}
            </label>
            <input className="campo" id="repetir" name="repetir" type="password" minLength={8} autoComplete="new-password" required />
          </div>
          {error && (
            <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          <button className="btn btn-marca w-full" disabled={enviando}>
            {enviando ? t.activar.activando : t.activar.boton}
          </button>
        </form>
      )}
    </Marco>
  );
}
