"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Marco } from "@/components/Marco";
import { Cargando, falloDe } from "@/components/ui";
import {
  crearEmpresa,
  recargarAcceso,
  salir,
  seleccionarEmpresa,
  useStore,
} from "@/lib/store";
import { useT } from "@/lib/textos";

export default function EmpresasPage() {
  const {
    listo,
    email,
    empresas,
    nombreCuenta,
    ocupado,
    error: errorCarga,
    demo,
  } = useStore();
  const router = useRouter();
  const { t } = useT();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const solicitud = useRef<{ id: string; datos: string } | null>(null);

  useEffect(() => {
    if (listo && !email) router.replace("/");
    if (demo) router.replace("/panel");
  }, [listo, email, demo, router]);

  async function intentar(operacion: () => Promise<void>) {
    setEnviando(true);
    setError("");
    try {
      await operacion();
      router.push("/panel");
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    } finally {
      setEnviando(false);
    }
  }

  function crear(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const datos = new FormData(event.currentTarget);
    const nombre = String(datos.get("empresa")).trim();
    const persona = String(datos.get("persona")).trim();
    const firma = JSON.stringify([email, nombre, persona]);
    if (solicitud.current?.datos !== firma) {
      solicitud.current = { id: crypto.randomUUID(), datos: firma };
    }
    const id = solicitud.current.id;
    void intentar(async () => {
      await crearEmpresa(id, nombre, persona);
      solicitud.current = null;
    });
  }

  if (!listo || !email || demo) return <Cargando />;
  const deshabilitado = ocupado || enviando;
  return (
    <Marco titulo={empresas.length ? "Tus empresas" : "Registra tu empresa"}>
      <p className="mt-3 break-words text-sm text-gris">{email}</p>
      {errorCarga && (
        <div role="alert" className="mt-4 space-y-2">
          <p className="mensaje-error">No pudimos cargar tu acceso.</p>
          <button
            className="btn btn-linea"
            onClick={() => void recargarAcceso()}
          >
            Reintentar
          </button>
        </div>
      )}
      {empresas.length > 0 && (
        <ul
          className="mt-5 space-y-2"
          aria-label="Empresas a las que perteneces"
        >
          {empresas.map((empresa) => (
            <li key={empresa.id}>
              <button
                className="btn btn-linea flex w-full justify-between gap-3 text-left"
                disabled={deshabilitado}
                onClick={() =>
                  void intentar(() => seleccionarEmpresa(empresa.id))
                }
              >
                <span className="min-w-0 break-words">{empresa.nombre}</span>
                <span className="text-xs text-gris">
                  {t.roles[empresa.rol]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        key={email + nombreCuenta}
        onSubmit={crear}
        className="mt-6 space-y-4 border-t border-regla pt-5"
        aria-busy={enviando}
      >
        {empresas.length > 0 && (
          <h2 className="font-semibold text-tinta">Crear otra empresa</h2>
        )}
        <p className="text-sm leading-relaxed text-gris">
          Serás su administrador y podrás invitar a tu equipo y a tus clientes.
        </p>
        <div>
          <label className="etiqueta" htmlFor="empresa">
            Nombre de la empresa
          </label>
          <input
            className="campo"
            id="empresa"
            name="empresa"
            autoComplete="organization"
            minLength={2}
            maxLength={80}
            required
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor="persona">
            Tu nombre en esta empresa
          </label>
          <input
            className="campo"
            id="persona"
            name="persona"
            autoComplete="name"
            defaultValue={nombreCuenta}
            minLength={2}
            maxLength={80}
            required
          />
        </div>
        {error && (
          <p role="alert" className="mensaje-error">
            {error}
          </p>
        )}
        <button className="btn btn-marca w-full" disabled={deshabilitado}>
          {enviando ? "Preparando empresa…" : "Crear empresa"}
        </button>
      </form>
      {ocupado && (
        <p role="status" className="mt-3 text-xs text-gris">
          Espera a que termine la operación en curso.
        </p>
      )}
      <button
        className="enlace mt-5 text-sm"
        disabled={deshabilitado}
        onClick={() => void intentar(salir)}
      >
        Cerrar sesión
      </button>
    </Marco>
  );
}
