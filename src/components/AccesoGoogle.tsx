"use client";

import { useState, useSyncExternalStore } from "react";
import { entrarConGoogle } from "@/lib/store";
import { SOLO_DEMO } from "@/lib/entorno";

function suscribirError(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
const errorDeRetorno = () =>
  new URLSearchParams(window.location.hash.slice(1)).has("error");

export function AccesoGoogle({ ocupado = false }: { ocupado?: boolean }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const errorOAuth = useSyncExternalStore(
    suscribirError,
    errorDeRetorno,
    () => false,
  );
  const mensaje =
    error ||
    (errorOAuth ? "No se pudo completar el acceso. Vuelve a intentarlo." : "");
  if (SOLO_DEMO) return null;
  async function entrar() {
    setEnviando(true);
    setError("");
    try {
      await entrarConGoogle();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo iniciar el acceso con Google.",
      );
      setEnviando(false);
    }
  }
  return (
    <div className="mt-3">
      <button
        type="button"
        className="btn btn-linea w-full justify-center"
        disabled={ocupado || enviando}
        aria-busy={enviando}
        onClick={() => void entrar()}
      >
        {enviando ? "Conectando con Google…" : "Continuar con Google"}
      </button>
      {mensaje && (
        <p role="alert" className="mensaje-error mt-2 text-sm">
          {mensaje}
        </p>
      )}
    </div>
  );
}
