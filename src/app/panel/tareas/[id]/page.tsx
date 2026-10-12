"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Elegidos, Elegir, Galeria } from "@/components/Archivos";
import { TareaForm } from "@/components/TareaForm";
import { Barras, SIN_MENSAJE, Sello, Vence, falloDe, frase, useNombres, useObras } from "@/components/ui";
import { ESPERA_ADMIN, NOTA_MAXIMA, NOTA_MINIMA, REGLAS, codigoTarea, pasosDisponibles } from "@/lib/flujo";
import { actuar, borrarTarea, subirArchivos, useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { Accion, Evento, Perfil, Tarea } from "@/lib/types";

/** Los pasos que esa persona puede dar ahora, o a quién se está esperando. */
function Pasos({ tarea, perfil, onHecho }: { tarea: Tarea; perfil: Perfil; onHecho: () => void }) {
  const { t } = useT();
  const nombre = useNombres();
  // Paso que pide una nota y espera confirmación.
  const [abierto, setAbierto] = useState<Accion | null>(null);
  const [nota, setNota] = useState("");
  // Fotos que acompañan la nota: el avance al entregar, o lo que hay que corregir al devolver.
  const [files, setFiles] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const pasos = pasosDisponibles(tarea, perfil);

  const dar = async (accion: Accion, texto = "") => {
    setEnviando(true);
    setError("");
    try {
      if (files.length) {
        await subirArchivos(tarea.id, files);
        setFiles([]);
      }
      await actuar(tarea.id, accion, texto);
      setAbierto(null);
      setNota("");
      onHecho();
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    } finally {
      setEnviando(false);
    }
  };

  const elegir = (accion: Accion) => {
    setError("");
    setNota("");
    setFiles([]);
    if (REGLAS[accion].nota === "no") void dar(accion);
    else setAbierto(accion);
  };

  if (pasos.length === 0) {
    const espera =
      tarea.estado === "completada"
        ? t.detalle.terminada
        : !tarea.asignadaA
          ? t.detalle.sinResponsable
          : perfil.rol === "admin" && !ESPERA_ADMIN.includes(tarea.estado)
            ? t.detalle.esperaA(nombre(tarea.asignadaA))
            : t.detalle.esperaAdmin;
    return <p className="border-y border-regla py-4 text-gris">{espera}</p>;
  }

  const obligatoria = abierto !== null && REGLAS[abierto].nota === "obligatoria";
  return (
    <section className="hoja border-tinta p-5 shadow-[5px_5px_0_var(--marca)]">
      <h2 className="rotulo">{t.detalle.siguiente}</h2>
      {abierto ? (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (obligatoria && nota.trim().length < NOTA_MINIMA) return setError(t.detalle.notaCorta);
            void dar(abierto, nota);
          }}
        >
          <p className="font-display text-xl font-bold tracking-tight">{t.acciones[abierto].boton}</p>
          <p className="mt-1 text-sm text-gris">{t.acciones[abierto].ayuda}</p>
          <label className="etiqueta mt-4" htmlFor="nota">
            {t.acciones[abierto].nota}
          </label>
          <textarea
            id="nota"
            className="campo min-h-24 resize-y leading-relaxed"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={NOTA_MAXIMA}
            required={obligatoria}
            autoFocus
          />
          <p className="etiqueta mt-4">{perfil.rol === "admin" ? t.archivos.agregar : t.archivos.conNota}</p>
          <Elegir onElegir={(nuevos) => setFiles((prev) => [...prev, ...nuevos])} ocupado={enviando} />
          <Elegidos files={files} onQuitar={(i) => setFiles((prev) => prev.filter((_, n) => n !== i))} />
          {files.length > 0 && <p className="mt-2 text-xs text-gris">{t.archivos.elegidos(files.length)}</p>}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button className="btn" disabled={enviando}>
              {enviando && files.length ? t.archivos.subiendo : t.detalle.confirmar}
            </button>
            <button type="button" className="btn btn-suave" disabled={enviando} onClick={() => setAbierto(null)}>
              {t.comun.cancelar}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="mt-2 text-sm text-gris">{t.acciones[pasos[0]].ayuda}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {pasos.map((accion, i) => (
              <button
                key={accion}
                className={`btn ${i > 0 ? "btn-linea" : "min-h-14 text-base sm:min-h-0 sm:text-sm"}`}
                disabled={enviando}
                onClick={() => elegir(accion)}
              >
                {t.acciones[accion].boton}
              </button>
            ))}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-alerta">
          {error}
        </p>
      )}
    </section>
  );
}

function Comentar({ tarea }: { tarea: Tarea }) {
  const { t } = useT();
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (nota.trim().length < NOTA_MINIMA) return setError(t.detalle.notaCorta);
    setEnviando(true);
    setError("");
    try {
      await actuar(tarea.id, "comentar", nota);
      setNota("");
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <textarea
        className="campo min-h-11 flex-1 resize-y leading-relaxed"
        rows={1}
        placeholder={t.acciones.comentar.nota}
        aria-label={t.acciones.comentar.nota}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        maxLength={NOTA_MAXIMA}
      />
      <button className="btn btn-linea shrink-0" disabled={enviando || !nota.trim()}>
        {t.acciones.comentar.boton}
      </button>
      {error && (
        <p role="alert" className="text-sm font-medium text-alerta sm:order-last sm:basis-full">
          {error}
        </p>
      )}
    </form>
  );
}

function Linea({ eventos }: { eventos: Evento[] }) {
  const { t, momento } = useT();
  return (
    <ol className="border-t border-regla">
      {eventos.map((e) => (
        <li key={e.id} className="grid grid-cols-[0.5rem_1fr] gap-x-4 border-b border-regla py-3.5">
          <span aria-hidden className="mt-[7px] h-2 w-2" style={{ background: `var(--e-${e.a ?? "borrador"})` }} />
          <div className="min-w-0">
            <p>
              <span className="font-semibold">{e.actor}</span> {frase(t, e)}
            </p>
            <p className="mt-0.5 font-mono text-xs text-gris">
              {momento(e.fecha)} · {t.roles[e.rol]}
              {e.a && e.de !== e.a && ` · ${t.estados[e.a]}`}
            </p>
            {e.nota && !SIN_MENSAJE.has(e.suceso) && (
              <blockquote className="mt-2.5 whitespace-pre-wrap border-l-2 border-tinta pl-3 leading-relaxed">
                {e.nota}
              </blockquote>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function TareaPage() {
  const { id } = useParams<{ id: string }>();
  // Se llega con ?aviso=archivo cuando la tarea se creó pero alguno de sus archivos no subió.
  const sinArchivos = useSearchParams().get("aviso") === "archivo";
  const { perfil, tareas, eventos } = useStore();
  const { t, diaLargo, momento } = useT();
  const nombre = useNombres();
  const obra = useObras();
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [porBorrar, setPorBorrar] = useState(false);
  const [error, setError] = useState("");
  // Confirma en palabras el paso que se acaba de dar.
  const [hecho, setHecho] = useState(false);

  const tarea = tareas.find((x) => x.id === id);
  if (!perfil) return null;
  if (!tarea) {
    return (
      <div>
        <p className="text-gris">{t.detalle.noExiste}</p>
        <Link href="/panel/tareas" className="enlace mt-4 inline-block">
          ← {t.detalle.volver}
        </Link>
      </div>
    );
  }

  const admin = perfil.rol === "admin";
  const historial = eventos.filter((e) => e.tareaId === tarea.id);
  const borrar = async () => {
    try {
      await borrarTarea(tarea.id);
      router.replace("/panel/tareas");
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    }
  };

  const filas: [string, React.ReactNode][] = [
    [t.campos.obra, obra(tarea.obraId)],
    [t.campos.estado, <Sello key="e" estado={tarea.estado} />],
    [t.campos.prioridad, <Barras key="p" prioridad={tarea.prioridad} conTexto />],
    [t.campos.vence, <Vence key="v" tarea={tarea} className="!text-sm" />],
    [t.campos.responsable, nombre(tarea.asignadaA)],
    [t.campos.creada, diaLargo(tarea.creada)],
    [t.campos.actualizada, momento(tarea.actualizada)],
  ];
  const ficha = (
    <dl className="hoja divide-y divide-regla px-4">
      {filas.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="flex items-center justify-between gap-4 py-3">
          <dt className="rotulo">{etiqueta}</dt>
          <dd className="text-right text-sm">{valor}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <div>
      <Link
        href={tarea.obraId ? `/panel/tareas?obra=${tarea.obraId}` : "/panel/tareas"}
        className="rotulo inline-block py-1 hover:text-tinta"
      >
        ← {tarea.obraId ? obra(tarea.obraId) : t.detalle.volver}
      </Link>

      {editando ? (
        <div className="mt-5">
          <TareaForm tarea={tarea} onCancel={() => setEditando(false)} onDone={() => setEditando(false)} />
        </div>
      ) : (
        <>
          <header className="mt-4 border-b border-tinta pb-6">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="font-mono text-sm text-gris">{codigoTarea(tarea.numero)}</span>
              <Sello estado={tarea.estado} />
              <Vence tarea={tarea} />
            </div>
            <h1 className="mt-3 font-display text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-[2.6rem]">
              {tarea.titulo}
            </h1>
            {admin && (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <button className="enlace py-1" onClick={() => setEditando(true)}>
                  {t.detalle.editar}
                </button>
                {porBorrar ? (
                  <span>
                    {t.detalle.eliminarSeguro}
                    <button className="enlace ml-3 py-1 font-semibold text-alerta" onClick={() => void borrar()}>
                      {t.detalle.eliminarSi}
                    </button>
                    <button className="enlace ml-3 py-1" onClick={() => setPorBorrar(false)}>
                      {t.comun.no}
                    </button>
                  </span>
                ) : (
                  <button className="enlace py-1 text-gris hover:text-tinta" onClick={() => setPorBorrar(true)}>
                    {t.detalle.eliminar}
                  </button>
                )}
                {error && <span className="font-medium text-alerta">{error}</span>}
              </div>
            )}
          </header>

          <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="min-w-0 space-y-9">
              {sinArchivos && (
                <p role="alert" className="hoja border-alerta px-4 py-3 text-sm font-medium text-alerta">
                  {t.fallos.archivo}
                </p>
              )}
              {hecho && (
                <p role="status" className="flex items-center gap-3 font-medium">
                  <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center bg-marca text-[#16130e]">
                    ✓
                  </span>
                  {t.detalle.hecho(t.estados[tarea.estado])}
                </p>
              )}
              <Pasos key={`${tarea.estado}-${perfil.id}`} tarea={tarea} perfil={perfil} onHecho={() => setHecho(true)} />
              <section>
                <h2 className="rotulo mb-2">{t.campos.descripcion}</h2>
                <p className="max-w-2xl whitespace-pre-wrap text-[17px] leading-relaxed">
                  {tarea.descripcion || <span className="text-gris">{t.detalle.sinDescripcion}</span>}
                </p>
              </section>
              <Galeria tarea={tarea} />
              {/* En el celular la ficha va después de lo que hay que hacer y ver. */}
              <div className="lg:hidden">{ficha}</div>
              <section>
                <h2 className="mb-3 font-display text-xl font-bold tracking-tight">{t.detalle.historial}</h2>
                <div className="mb-4">
                  <Comentar tarea={tarea} />
                </div>
                <Linea eventos={historial} />
              </section>
            </div>

            <aside className="hidden lg:block">
              <div className="sticky top-8">{ficha}</div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
