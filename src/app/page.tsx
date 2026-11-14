"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Ajustes, Logo, falloDe } from "@/components/ui";
import { Arquitectura } from "@/components/Arquitectura";
import { Icon } from "@/components/Icon";
import { entrar, entrarDemo, pedirClave, useStore } from "@/lib/store";
import { useT } from "@/lib/textos";

export default function EntradaPage() {
  const { listo, perfil, email } = useStore();
  const { t } = useT();
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [visible, setVisible] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [recuperando, setRecuperando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (listo && email) router.replace(perfil ? "/panel" : "/empresas");
  }, [listo, perfil, email, router]);

  const muestra = useSearchParams().get("demo");
  useEffect(() => {
    if (muestra === "admin" || muestra === "empleado" || muestra === "cliente")
      entrarDemo(muestra);
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
    if (!/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(correo.trim())) {
      setAviso(t.entrada.olvidoAyuda);
      document.getElementById("correo")?.focus();
      return;
    }
    setRecuperando(true);
    setAviso("");
    try {
      await pedirClave(correo.trim());
      setAviso(t.entrada.olvidoListo);
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    } finally {
      setRecuperando(false);
    }
  };

  return (
    <main className="entrada-trazo">
      <section
        className="entrada-hero"
        aria-label="TRAZO, del plano al progreso"
      >
        <Logo className="logo-inverso" />
        <div className="entrada-titular">
          <p className="lema-trazo">Del plano al progreso.</p>
          <h1>
            Planifica, ejecuta y<br /> controla tus obras
            <br /> <span>en un solo lugar.</span>
          </h1>
          <p className="entrada-descripcion">
            Cada tarea tiene un responsable.
            <br />
            Cada avance, un lugar en tu obra.
          </p>
        </div>
        <Arquitectura />
        <div className="entrada-beneficios">
          <div>
            <Icon name="tareas" />
            <span>
              <strong>Gestión de tareas</strong>
              <small>Asigna, sigue y cierra actividades.</small>
            </span>
          </div>
          <div>
            <Icon name="capas" />
            <span>
              <strong>Control de obras</strong>
              <small>Todos tus proyectos conectados.</small>
            </span>
          </div>
          <div>
            <Icon name="avance" />
            <span>
              <strong>Reportes y avance</strong>
              <small>Decide con una visión clara.</small>
            </span>
          </div>
        </div>
        <span className="ilustracion-nota">Visualización ilustrativa</span>
      </section>

      <section className="entrada-acceso" aria-label="Acceso a tu cuenta">
        <div className="entrada-ajustes">
          <Ajustes />
        </div>
        <div className="entrada-tarjeta">
          <Logo />
          <div className="entrada-form-heading">
            <h2>{t.entrada.titulo}</h2>
            <p>Accede a tu cuenta para continuar</p>
          </div>
          <>
            <form
              onSubmit={enviar}
              className="entrada-form"
              aria-busy={enviando}
            >
              <div>
                <label className="etiqueta" htmlFor="correo">
                  {t.entrada.correo}
                </label>
                <div className="campo-icono">
                  <Icon name="correo" />
                  <input
                    className="campo"
                    id="correo"
                    type="email"
                    autoComplete="username"
                    placeholder="tu@correo.com"
                    required
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    aria-describedby={
                      error
                        ? "entrada-error"
                        : aviso
                          ? "entrada-aviso"
                          : undefined
                    }
                  />
                </div>
              </div>
              <div>
                <label className="etiqueta" htmlFor="clave">
                  {t.entrada.clave}
                </label>
                <div className="campo-icono">
                  <Icon name="candado" />
                  <input
                    className="campo campo-clave"
                    id="clave"
                    name="clave"
                    type={visible ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Tu contraseña"
                    required
                    aria-describedby={error ? "entrada-error" : undefined}
                  />
                  <button
                    type="button"
                    className="mostrar-clave"
                    aria-label={
                      visible ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                    aria-pressed={visible}
                    onClick={() => setVisible(!visible)}
                  >
                    <Icon name={visible ? "ocultar" : "ojo"} />
                  </button>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="enlace text-xs"
                  onClick={() => void olvido()}
                  disabled={recuperando}
                >
                  {recuperando ? "Enviando enlace…" : t.entrada.olvido}
                </button>
              </div>
              {error && (
                <p id="entrada-error" role="alert" className="mensaje-error">
                  {error}
                </p>
              )}
              {aviso && (
                <p id="entrada-aviso" role="status" className="mensaje-info">
                  {aviso}
                </p>
              )}
              <button
                className="btn btn-marca entrada-submit w-full"
                disabled={enviando || !listo}
              >
                {enviando
                  ? t.entrada.entrando
                  : !listo
                    ? "Preparando acceso…"
                    : t.entrada.boton}
                <Icon name="flecha" />
              </button>
            </form>
            <Link
              href="/registro"
              className="btn btn-linea mt-4 flex w-full justify-center"
            >
              Crear cuenta
            </Link>
            <div className="demo-separador">
              <span>Conoce TRAZO</span>
            </div>
            <Link href="/demo" className="enlace block text-center text-sm">
              Explorar demo
            </Link>
            <p className="demo-nota">{t.entrada.demoNota}</p>
          </>
        </div>
      </section>
    </main>
  );
}
