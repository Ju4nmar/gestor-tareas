"use client";

import { useState } from "react";
import { actualizarEmpresa, quitarPlantilla, useStore } from "@/lib/store";
import {
  abrirRespaldo,
  descargarRespaldo,
  restaurarRespaldo,
} from "@/lib/respaldos";
import type { Empresa } from "@/lib/types";
import type { Respaldo } from "@/lib/respaldo-formato";

function Configuracion({ empresa }: { empresa: Empresa }) {
  const { plantillas, demo, ocupado, operacion } = useStore();
  const [nombre, setNombre] = useState(empresa.nombre);
  const [contacto, setContacto] = useState(empresa.contacto ?? "");
  const [telefono, setTelefono] = useState(empresa.telefono ?? "");
  const [foto, setFoto] = useState<File>();
  const [copia, setCopia] = useState<Respaldo | null>(null);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  async function intentar(paso: () => Promise<unknown>, mensaje: string) {
    setTrabajando(true);
    setError("");
    setAviso("");
    try {
      await paso();
      setAviso(mensaje);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo completar la operación.",
      );
    } finally {
      setTrabajando(false);
    }
  }
  const bloqueado = ocupado || trabajando;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Empresa</h1>
        <p className="mt-2 text-sm text-gris">
          Identidad, plantillas y recuperación de datos.
        </p>
      </header>
      {aviso && (
        <p role="status" className="mensaje-info">
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="mensaje-error">
          {error}
        </p>
      )}
      <form
        className="hoja space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void intentar(
            () => actualizarEmpresa(nombre, contacto, telefono, foto),
            "Datos de empresa guardados.",
          );
        }}
      >
        <h2 className="font-display text-xl font-bold">Datos de empresa</h2>
        {empresa.logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element -- logo privado con enlace temporal */
          <img
            src={empresa.logoUrl}
            alt={`Logo de ${empresa.nombre}`}
            className="h-20 w-20 rounded-xl object-contain"
          />
        )}
        <div>
          <label htmlFor="empresa-nombre" className="etiqueta">
            Nombre
          </label>
          <input
            id="empresa-nombre"
            className="campo"
            minLength={2}
            maxLength={80}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="empresa-contacto" className="etiqueta">
            Contacto o dirección
          </label>
          <input
            id="empresa-contacto"
            className="campo"
            maxLength={200}
            value={contacto}
            onChange={(e) => setContacto(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="empresa-telefono" className="etiqueta">
            Teléfono
          </label>
          <input
            id="empresa-telefono"
            className="campo"
            type="tel"
            maxLength={50}
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="empresa-logo" className="etiqueta">
            Logo
          </label>
          <input
            id="empresa-logo"
            className="campo"
            type="file"
            accept="image/*"
            onChange={(e) => setFoto(e.target.files?.[0])}
          />
        </div>
        <button className="btn btn-marca" disabled={bloqueado}>
          Guardar datos
        </button>
      </form>
      <section className="hoja p-6">
        <h2 className="mb-3 font-display text-xl font-bold">
          Plantillas de tareas
        </h2>
        <p className="mb-4 text-sm text-gris">
          Crea plantillas desde el formulario de una tarea y reutilízalas al
          crear actividades.
        </p>
        <ul className="divide-y divide-regla">
          {plantillas.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <span>{p.nombre}</span>
              <button
                className="enlace text-xs"
                disabled={bloqueado}
                onClick={() => {
                  if (window.confirm(`¿Eliminar la plantilla ${p.nombre}?`))
                    void intentar(
                      () => quitarPlantilla(p.id),
                      "Plantilla eliminada.",
                    );
                }}
              >
                Eliminar plantilla
              </button>
            </li>
          ))}
        </ul>
        {!plantillas.length && (
          <p className="text-sm text-gris">Todavía no hay plantillas.</p>
        )}
      </section>
      <section className="hoja space-y-4 p-6">
        <h2 className="font-display text-xl font-bold">
          Respaldos y recuperación
        </h2>
        <p className="text-sm leading-relaxed text-gris">
          Descarga los datos de esta empresa y sus archivos en un respaldo
          comprimido. Guárdalo en una ubicación privada. La recuperación crea
          una empresa independiente y nuevas invitaciones para las otras
          personas. La recuperación completa del proyecto requiere también un
          respaldo del servicio de autenticación.
        </p>
        <button
          className="btn btn-linea"
          disabled={bloqueado}
          onClick={() =>
            void intentar(
              descargarRespaldo,
              "Respaldo descargado y comprobado.",
            )
          }
        >
          Descargar respaldo
        </button>
        <div>
          <label htmlFor="respaldo-file" className="etiqueta">
            Validar un respaldo de TRAZO
          </label>
          <input
            id="respaldo-file"
            className="campo"
            type="file"
            accept=".gz,.json,application/gzip,application/json"
            disabled={bloqueado}
            onChange={(e) => {
              const file = e.target.files?.[0];
              setCopia(null);
              if (file)
                void intentar(
                  async () => setCopia(await abrirRespaldo(file)),
                  "Integridad y archivos comprobados.",
                );
            }}
          />
          <p className="mt-2 text-xs text-gris">
            La recuperación desde el navegador admite hasta 250 MB
            descomprimidos.
          </p>
        </div>
        {copia && (
          <div className="rounded-xl border border-regla p-4 text-sm">
            <p>
              {String((copia.metadata.company as { name: string }).name)} ·{" "}
              {(copia.metadata.tasks as unknown[]).length} tareas ·{" "}
              {copia.files.length} archivos
            </p>
            <button
              className="btn btn-marca mt-3"
              disabled={bloqueado || demo}
              onClick={() => {
                if (
                  window.confirm(
                    "¿Crear una empresa nueva con este respaldo y recuperar sus archivos?",
                  )
                )
                  void intentar(
                    () => restaurarRespaldo(copia),
                    "Empresa recuperada.",
                  );
              }}
            >
              Recuperar como empresa nueva
            </button>
            {demo && (
              <p className="mt-2 text-xs text-gris">
                Recupera tus respaldos desde tu cuenta de TRAZO.
              </p>
            )}
          </div>
        )}
        {operacion && (
          <p role="status" className="text-sm text-gris">
            {operacion}
          </p>
        )}
      </section>
    </div>
  );
}

export default function EmpresaPage() {
  const { perfil, empresa, cargado, error } = useStore();
  if (!cargado || error || !perfil || perfil.rol !== "admin" || !empresa)
    return null;
  return <Configuracion key={empresa.id} empresa={empresa} />;
}
