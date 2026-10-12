"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Ajustes, Logo, Sello, falloDe } from "@/components/ui";
import { ESTADOS } from "@/lib/flujo";
import { entrar, entrarDemo, pedirClave, salir, useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { Rol } from "@/lib/types";

export default function EntradaPage() {
  const { listo, perfil, email, desactivada } = useStore();
  const { t } = useT();
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  // Con acceso, directo al panel.
  useEffect(() => {
    if (listo && perfil) router.replace("/panel");
  }, [listo, perfil, router]);

  // Un enlace con ?demo=admin o ?demo=empleado abre la muestra sin pasar por esta página.
  const muestra = useSearchParams().get("demo");
  useEffect(() => {
    if (muestra === "admin" || muestra === "empleado") entrarDemo(muestra);
  }, [muestra]);

  const enviar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clave = String(new FormData(event.currentTarget).get("clave"));
    setEnviando(true);
    setError("");
    setAviso("");
    try {
      await entrar(correo.trim(), clave);
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    } finally {
      setEnviando(false);
    }
  };

  const olvido = async () => {
    setError("");
    if (!/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(correo.trim())) return setAviso(t.entrada.olvidoAyuda);
    await pedirClave(correo.trim());
    setAviso(t.entrada.olvidoListo);
  };

  const demo = (rol: Rol) => {
    entrarDemo(rol);
    router.push("/panel");
  };

  // "Quién hace qué, y para cuándo." → la segunda mitad va resaltada.
  const [antes, despues] = t.lema.split(", ");
  const sinAcceso = listo && email && !perfil;

  return (
    <div className="grid flex-1 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="flex flex-col justify-between gap-12 bg-tinta px-6 py-8 text-papel sm:px-10 lg:px-14 lg:py-12">
        <Logo className="text-3xl" />
        <div>
          <h1 className="font-display text-[clamp(2.6rem,6.4vw,5.2rem)] font-extrabold leading-[0.95] tracking-tight">
            {antes},
            <br />
            <span className="resaltado">{despues}</span>
          </h1>
          <ol className="mt-10 max-w-md space-y-3 border-t border-papel/20 pt-6">
            {t.entrada.puntos.map((punto, i) => (
              <li key={punto} className="flex gap-4 text-lg text-papel/85">
                <span className="mt-1 font-mono text-xs text-papel/50">0{i + 1}</span>
                {punto}
              </li>
            ))}
          </ol>
        </div>
        <div className="hidden flex-wrap gap-x-5 gap-y-2 text-papel/70 sm:flex">
          {ESTADOS.filter((e) => e !== "borrador").map((estado) => (
            <Sello key={estado} estado={estado} />
          ))}
        </div>
      </section>

      <section className="flex flex-col px-6 py-8 sm:px-10 lg:px-14 lg:py-12">
        <Ajustes className="justify-end" />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          {sinAcceso ? (
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight">{t.entrada.titulo}</h2>
              <p className="mt-4 leading-relaxed">
                {desactivada ? t.entrada.desactivada : t.entrada.sinAcceso(email ?? "")}
              </p>
              <button type="button" className="btn btn-linea mt-6" onClick={() => void salir()}>
                {t.comun.salir}
              </button>
            </div>
          ) : (
            <>
              <h2 className="font-display text-3xl font-bold tracking-tight">{t.entrada.titulo}</h2>
              <form onSubmit={enviar} className="mt-6 space-y-4">
                <div>
                  <label className="etiqueta" htmlFor="correo">
                    {t.entrada.correo}
                  </label>
                  <input
                    className="campo"
                    id="correo"
                    type="email"
                    autoComplete="username"
                    required
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                  />
                </div>
                <div>
                  <label className="etiqueta" htmlFor="clave">
                    {t.entrada.clave}
                  </label>
                  <input className="campo" id="clave" name="clave" type="password" autoComplete="current-password" required />
                </div>
                {error && (
                  <p role="alert" className="text-sm font-medium text-alerta">
                    {error}
                  </p>
                )}
                {aviso && <p className="text-sm text-gris">{aviso}</p>}
                <button className="btn w-full" disabled={enviando || !listo}>
                  {enviando ? t.entrada.entrando : t.entrada.boton}
                </button>
              </form>
              <button type="button" className="enlace mt-4 self-start text-sm text-gris hover:text-tinta" onClick={olvido}>
                {t.entrada.olvido}
              </button>
              <p className="mt-2 text-sm text-gris">{t.entrada.invitado}</p>

              <div className="mt-10 border-t border-tinta pt-5">
                <p className="rotulo">{t.entrada.demo}</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button type="button" className="btn btn-linea" onClick={() => demo("admin")}>
                    {t.entrada.demoAdmin}
                  </button>
                  <button type="button" className="btn btn-linea" onClick={() => demo("empleado")}>
                    {t.entrada.demoEmpleado}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gris">{t.entrada.demoNota}</p>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
