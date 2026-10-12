"use client";

import { useEffect, useRef, useState } from "react";
import { quitarArchivo, subirArchivos, urlsDe, useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { Archivo, Tarea } from "@/lib/types";
import { falloDe } from "./ui";

const esFoto = (a: Pick<Archivo, "tipo">) => a.tipo.startsWith("image/");

function Camara() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M4 8h3l1.5-2.500h7L17 8h3v11H4V8Z" />
      <circle cx="12" cy="13.500" r="3.200" />
    </svg>
  );
}

function Clip() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="m20 11.500-7.800 7.800a5 5 0 0 1-7-7l8.300-8.300a3.300 3.300 0 0 1 4.700 4.700l-8.300 8.300a1.700 1.700 0 0 1-2.400-2.400l7.800-7.800" />
    </svg>
  );
}

/**
 * Dos botones para elegir archivos: uno abre la cámara del celular y el otro la
 * galería o los documentos. Entrega los archivos elegidos sin subirlos.
 */
export function Elegir({ onElegir, ocupado = false }: { onElegir: (files: File[]) => void; ocupado?: boolean }) {
  const { t } = useT();
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const elegir = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length) onElegir(files);
  };
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <button type="button" className="btn btn-linea" disabled={ocupado} onClick={() => camara.current?.click()}>
        <Camara />
        {t.archivos.tomarFoto}
      </button>
      <button type="button" className="btn btn-linea" disabled={ocupado} onClick={() => galeria.current?.click()}>
        <Clip />
        {t.archivos.subir}
      </button>
      <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={elegir} />
      <input ref={galeria} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={elegir} />
    </div>
  );
}

/** Lista de archivos elegidos que aún no se han subido, con opción de quitarlos. */
export function Elegidos({ files, onQuitar }: { files: File[]; onQuitar: (i: number) => void }) {
  const { t } = useT();
  if (files.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 border-b border-regla py-1.5">
          <span className="truncate">{f.name}</span>
          <button type="button" className="enlace shrink-0 text-gris" onClick={() => onQuitar(i)}>
            {t.archivos.quitar}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Direcciones para ver los archivos; se piden al almacén cuando cambia la lista. */
function useUrls(archivos: Archivo[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const clave = archivos.map((a) => a.id).join(",");
  useEffect(() => {
    let vigente = true;
    urlsDe(archivos)
      .then((nuevas) => vigente && setUrls(nuevas))
      .catch(() => {});
    return () => {
      vigente = false;
    };
    // La lista se identifica por sus ids: `archivos` cambia de referencia en cada pintado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return urls;
}

/** Fotos y archivos de una tarea: verlos en grande, subir más y quitar los propios. */
export function Galeria({ tarea }: { tarea: Tarea }) {
  const { perfil, archivos: todos } = useStore();
  const { t, momento } = useT();
  const archivos = todos.filter((a) => a.tareaId === tarea.id);
  const urls = useUrls(archivos);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [porQuitar, setPorQuitar] = useState<string | null>(null);
  if (!perfil) return null;

  const subir = async (files: File[]) => {
    setSubiendo(true);
    setError("");
    try {
      await subirArchivos(tarea.id, files);
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    } finally {
      setSubiendo(false);
    }
  };

  const quitar = async (id: string) => {
    setPorQuitar(null);
    try {
      await quitarArchivo(id);
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    }
  };

  const grande = archivos.find((a) => a.id === abierta);
  const puedeQuitar = (a: Archivo) => perfil.rol === "admin" || a.subidoPor === perfil.id;

  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-3 font-display text-xl font-bold tracking-tight">
        {t.archivos.titulo}
        {archivos.length > 0 && <span className="font-mono text-xs font-normal text-gris">{archivos.length}</span>}
      </h2>

      {archivos.length === 0 ? (
        <p className="mb-4 text-gris">{t.archivos.vacio}</p>
      ) : (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {archivos.map((a) => (
            <li key={a.id} className="hoja overflow-hidden">
              {esFoto(a) ? (
                <button type="button" className="block w-full" onClick={() => setAbierta(a.id)} aria-label={`${t.archivos.abrir}: ${a.nombre}`}>
                  {urls[a.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- las fotos vienen del almacén privado, con enlace temporal
                    <img src={urls[a.id]} alt={a.nombre} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <span className="block aspect-[4/3] w-full animate-pulse bg-regla" />
                  )}
                </button>
              ) : (
                <a
                  href={urls[a.id] || undefined}
                  target="_blank"
                  rel="noreferrer"
                  title={urls[a.id] ? undefined : t.archivos.sinVista}
                  className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-papel"
                >
                  <span className="border border-tinta px-2 py-1 font-mono text-xs font-medium">PDF</span>
                  <span className="enlace text-sm">{t.archivos.abrir}</span>
                </a>
              )}
              <div className="px-3 py-2">
                <p className="truncate text-sm font-medium">{a.nombre}</p>
                <p className="truncate font-mono text-[11px] text-gris">
                  {a.autor.split(" ")[0]} · {momento(a.fecha)}
                </p>
                {puedeQuitar(a) &&
                  (porQuitar === a.id ? (
                    <p className="mt-1 text-xs">
                      {t.archivos.quitarSeguro}
                      <button className="enlace ml-2 py-1.5 font-semibold text-alerta" onClick={() => void quitar(a.id)}>
                        {t.comun.si}
                      </button>
                      <button className="enlace ml-2 py-1.5" onClick={() => setPorQuitar(null)}>
                        {t.comun.no}
                      </button>
                    </p>
                  ) : (
                    <button className="enlace mt-1 py-1.5 text-xs text-gris" onClick={() => setPorQuitar(a.id)}>
                      {t.archivos.quitar}
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Elegir onElegir={(files) => void subir(files)} ocupado={subiendo} />
      <p className="mt-2 text-xs text-gris" aria-live="polite">
        {subiendo ? t.archivos.subiendo : t.archivos.ayuda}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-alerta">
          {error}
        </p>
      )}

      {grande && urls[grande.id] && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
          role="dialog"
          aria-modal
          aria-label={grande.nombre}
          onClick={() => setAbierta(null)}
        >
          <div className="flex items-center justify-between gap-4 pb-3 text-white">
            <p className="truncate text-sm">
              {grande.nombre} · {t.archivos.de(grande.autor)}
            </p>
            <button type="button" className="btn shrink-0 border-white bg-white text-black">
              {t.archivos.cerrar}
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- foto del almacén privado */}
            <img src={urls[grande.id]} alt={grande.nombre} className="max-h-full max-w-full object-contain" />
          </div>
        </div>
      )}
    </section>
  );
}
