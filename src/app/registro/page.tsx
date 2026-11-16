"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccesoGoogle } from "@/components/AccesoGoogle";
import { Marco } from "@/components/Marco";
import { falloDe } from "@/components/ui";
import { registrar } from "@/lib/store";
import { useT } from "@/lib/textos";

export default function RegistroPage() {
  const router = useRouter();
  const { t } = useT();
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState("");

  async function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const datos = new FormData(event.currentTarget);
    setError("");
    if (datos.get("clave") !== datos.get("repetir"))
      return setError(t.activar.distintas);
    setEnviando(true);
    try {
      const activa = await registrar(
        String(datos.get("nombre")),
        String(datos.get("email")),
        String(datos.get("clave")),
      );
      if (activa) router.replace("/empresas");
      else setConfirmar(true);
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Marco titulo="Crea tu cuenta">
      {confirmar ? (
        <p role="status" className="mt-5 text-sm leading-relaxed text-gris">
          Revisa tu correo para confirmar la cuenta. Después podrás crear tu
          empresa. Si ya tienes una cuenta, inicia sesión con tu contraseña.
        </p>
      ) : (
        <form onSubmit={enviar} className="mt-5 space-y-4" aria-busy={enviando}>
          <p className="text-sm text-gris">
            Crea tu cuenta personal y registra tu empresa en el siguiente paso.
          </p>
          <div>
            <label className="etiqueta" htmlFor="nombre">
              Tu nombre
            </label>
            <input
              id="nombre"
              name="nombre"
              className="campo"
              autoComplete="name"
              minLength={2}
              maxLength={80}
              required
            />
          </div>
          <div>
            <label className="etiqueta" htmlFor="email">
              Correo electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="campo"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="etiqueta" htmlFor="clave">
              Contraseña
            </label>
            <input
              id="clave"
              name="clave"
              type="password"
              className="campo"
              autoComplete="new-password"
              minLength={8}
              aria-describedby="clave-ayuda"
              required
            />
            <p id="clave-ayuda" className="mt-1 text-xs text-gris">
              Usa al menos 8 caracteres.
            </p>
          </div>
          <div>
            <label className="etiqueta" htmlFor="repetir">
              Repite la contraseña
            </label>
            <input
              id="repetir"
              name="repetir"
              type="password"
              className="campo"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          {error && (
            <p role="alert" className="mensaje-error">
              {error}
            </p>
          )}
          <button className="btn btn-marca w-full" disabled={enviando}>
            {enviando ? "Creando cuenta…" : "Crear cuenta"}
          </button>
        </form>
      )}
      {!confirmar && <AccesoGoogle ocupado={enviando} />}
      <Link href="/" className="enlace mt-5 inline-block text-sm">
        Ya tengo cuenta. Iniciar sesión
      </Link>
    </Marco>
  );
}
