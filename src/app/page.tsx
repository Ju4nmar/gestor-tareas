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

  useEffect(() => {
    if (listo && perfil) router.replace("/panel");
  }, [listo, perfil, router]);

  const muestra = useSearchParams().get("demo");
  useEffect(() => {
    if (muestra === "admin" || muestra === "empleado" || muestra === "cliente") entrarDemo(muestra);
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

  const [antes, despues] = t.lema.split(", ");
  const sinAcceso = listo && email && !perfil;

  return (
    <div className="grid min-h-screen flex-1 lg:grid-cols-[1.1fr_0.9fr]">
      {/* Columna Izquierda: Brand & Value Proposition */}
      <section className="flex flex-col justify-between border-b border-slate-800 bg-slate-900 px-6 py-8 text-slate-100 sm:px-10 lg:border-b-0 lg:border-r lg:px-14 lg:py-12">
        <div className="flex items-center">
          <Logo className="text-2xl text-white" />
        </div>

        <div className="my-10 lg:my-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Control visual para obras y reformas
          </div>
          <h1 className="mt-4 font-display text-[clamp(2.4rem,5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tight text-white">
            {antes},
            <br />
            <span className="text-blue-400">{despues}</span>
          </h1>

          <ol className="mt-8 max-w-md space-y-4 border-t border-slate-800 pt-6">
            {t.entrada.puntos.map((punto, i) => (
              <li key={punto} className="flex items-start gap-3.5 text-base text-slate-300">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 font-mono text-xs font-bold text-blue-400">
                  {i + 1}
                </span>
                <span>{punto}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="hidden flex-wrap gap-2 text-slate-400 sm:flex">
          {ESTADOS.filter((e) => e !== "borrador").map((estado) => (
            <Sello key={estado} estado={estado} />
          ))}
        </div>
      </section>

      {/* Columna Derecha: Login / Modo Demo */}
      <section className="flex flex-col justify-between bg-papel px-6 py-8 sm:px-10 lg:px-14 lg:py-12">
        <div className="flex justify-end">
          <Ajustes />
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
          {sinAcceso ? (
            <div className="rounded-2xl border border-regla bg-hoja p-6 shadow-sm">
              <h2 className="font-display text-2xl font-bold tracking-tight text-tinta">{t.entrada.titulo}</h2>
              <p className="mt-3 text-sm leading-relaxed text-gris">
                {desactivada ? t.entrada.desactivada : t.entrada.sinAcceso(email ?? "")}
              </p>
              <button type="button" className="btn btn-linea mt-5" onClick={() => void salir()}>
                {t.comun.salir}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-regla bg-hoja p-6 shadow-sm sm:p-8">
              <h2 className="font-display text-2xl font-extrabold tracking-tight text-tinta">{t.entrada.titulo}</h2>
              <form onSubmit={enviar} className="mt-5 space-y-4">
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
                  <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {error}
                  </p>
                )}
                {aviso && <p className="text-xs text-gris">{aviso}</p>}
                <button className="btn btn-marca w-full justify-center" disabled={enviando || !listo}>
                  {enviando ? t.entrada.entrando : t.entrada.boton}
                </button>
              </form>

              <div className="mt-4 flex items-center justify-between text-xs text-gris">
                <button type="button" className="hover:text-tinta underline-offset-2 hover:underline" onClick={olvido}>
                  {t.entrada.olvido}
                </button>
              </div>

              <div className="mt-8 border-t border-regla pt-5">
                <span className="text-xs font-bold uppercase tracking-wider text-gris">{t.entrada.demo}</span>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-regla bg-papel/60 px-3 py-2 text-xs font-semibold text-tinta transition-all hover:border-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => demo("admin")}
                  >
                    {t.entrada.demoAdmin}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-regla bg-papel/60 px-3 py-2 text-xs font-semibold text-tinta transition-all hover:border-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => demo("empleado")}
                  >
                    {t.entrada.demoEmpleado}
                  </button>
                  <button
                    type="button"
                    className="col-span-2 rounded-xl border border-regla bg-papel/60 px-3 py-2 text-xs font-semibold text-tinta transition-all hover:border-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => demo("cliente")}
                  >
                    {t.entrada.demoCliente}
                  </button>
                </div>
                <p className="mt-2.5 text-[11px] text-gris">{t.entrada.demoNota}</p>
              </div>
            </div>
          )}
        </div>

        <div className="text-center text-xs text-gris">
          <span>Relevo · Gestor de Tareas y Obras</span>
        </div>
      </section>
    </div>
  );
}
