"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useBorrador } from "@/lib/borradores";
import { Elegidos, Elegir, Galeria, ProgresoSubida, useSubidaArchivos } from "@/components/Archivos";
import { TareaForm } from "@/components/TareaForm";
import { Barras, SIN_MENSAJE, Sello, Vence, falloDe, frase, useNombres, useObras } from "@/components/ui";
import { ESPERA_ADMIN, NOTA_MAXIMA, NOTA_MINIMA, REGLAS, codigoTarea, pasosDisponibles } from "@/lib/flujo";
import { actuar, archivarTarea, borrarTarea, useStore } from "@/lib/store";
import { useT } from "@/lib/textos";
import type { Accion, Evento, Perfil, Tarea } from "@/lib/types";

/** Los pasos que esa persona puede dar ahora, o a quién se está esperando. */
function Pasos({ tarea, perfil, onHecho }: { tarea: Tarea; perfil: Perfil; onHecho: () => void }) {
  const { t } = useT();
  const nombre = useNombres();
  const [abierto, setAbierto] = useState<Accion | null>(null);
  const {perfil: yo,empresa} = useStore();
  const borrador = useBorrador(`${yo?.userId ?? yo?.id}:${empresa?.id}:nota:${tarea.id}:${abierto ?? "sin-paso"}`, "");
  const nota = borrador.valor;
  const setNota = borrador.escribir;
  const [files, setFiles] = useState<File[]>([]);
  const subida = useSubidaArchivos();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const pasos = pasosDisponibles(tarea, perfil);

  const dar = async (accion: Accion, texto = "") => {
    setEnviando(true);
    setError("");
    try {
      if (files.length) {
        await subida.subir(tarea.id, files);
        setFiles([]);
      }
      await actuar(tarea.id, accion, texto);
      borrador.limpiar();
      setAbierto(null);
      onHecho();
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    } finally {
      setEnviando(false);
    }
  };

  const elegir = (accion: Accion) => {
    setError("");
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
    return (
      <div className="rounded-2xl border border-regla bg-slate-50/70 p-4 text-center text-xs font-semibold text-gris dark:bg-slate-800/40">
        {espera}
      </div>
    );
  }

  const obligatoria = abierto !== null && REGLAS[abierto].nota === "obligatoria";
  return (
    <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/50 to-white p-5 shadow-sm dark:border-blue-900/50 dark:from-blue-950/20 dark:to-slate-900 sm:p-6">
      <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
        {t.detalle.siguiente}
      </span>
      {abierto ? (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (obligatoria && nota.trim().length < NOTA_MINIMA) return setError(t.detalle.notaCorta);
            void dar(abierto, nota);
          }}
        >
          <p className="font-display text-xl font-bold tracking-tight text-tinta">{t.acciones[abierto].boton}</p>
          <p className="mt-1 text-xs text-gris">{t.acciones[abierto].ayuda}</p>
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
          <ProgresoSubida progreso={subida.progreso} />
          {files.length > 0 && <p className="mt-2 text-xs text-gris">{t.archivos.elegidos(files.length)}</p>}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button className="btn btn-marca" disabled={enviando}>
              {enviando && files.length ? t.archivos.subiendo : t.detalle.confirmar}
            </button>
            <button type="button" className="btn btn-linea" disabled={enviando} onClick={() => setAbierto(null)}>
              {t.comun.cancelar}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="mt-1.5 text-xs text-gris">{t.acciones[pasos[0]].ayuda}</p>
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            {pasos.map((accion, i) => (
              <button
                key={accion}
                className={`btn ${i > 0 ? "btn-linea" : "btn-marca min-h-12 text-sm"}`}
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
        <p role="alert" className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </section>
  );
}

function Comentar({ tarea }: { tarea: Tarea }) {
  const { t } = useT();
  const {perfil,empresa} = useStore();
  const borrador = useBorrador(`${perfil?.userId ?? perfil?.id}:${empresa?.id}:comentario:${tarea.id}`, "");
  const nota = borrador.valor;
  const setNota = borrador.escribir;
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (nota.trim().length < NOTA_MINIMA) return setError(t.detalle.notaCorta);
    setEnviando(true);
    setError("");
    try {
      await actuar(tarea.id, "comentar", nota);
      borrador.limpiar();
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <textarea
        className="campo min-h-11 flex-1 resize-y leading-relaxed text-sm"
        rows={1}
        placeholder={t.acciones.comentar.nota}
        aria-label={t.acciones.comentar.nota}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        maxLength={NOTA_MAXIMA}
      />
      <button className="btn btn-linea shrink-0 text-xs font-semibold" disabled={enviando || !nota.trim()}>
        {t.acciones.comentar.boton}
      </button>
      {error && (
        <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400 sm:order-last sm:basis-full">
          {error}
        </p>
      )}
    </form>
  );
}

function Linea({ eventos }: { eventos: Evento[] }) {
  const { t, momento } = useT();
  return (
    <ol className="relative space-y-4 border-l-2 border-slate-200 pl-4 dark:border-slate-800">
      {eventos.map((e) => (
        <li key={e.id} className="relative">
          <span
            aria-hidden
            className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-slate-900"
            style={{ background: `var(--e-${e.a ?? "borrador"})` }}
          />
          <div className="rounded-xl border border-regla bg-hoja p-3.5 shadow-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-tinta">
                {e.actor} <span className="font-normal text-gris">{frase(t, e)}</span>
              </p>
              <span className="text-[11px] text-gris">{momento(e.fecha)}</span>
            </div>
            <p className="mt-0.5 text-xs text-gris">
              {t.roles[e.rol]}
              {e.a && e.de !== e.a && ` · ${t.estados[e.a]}`}
            </p>
            {e.nota && !SIN_MENSAJE.has(e.suceso) && (
              <blockquote className="mt-2.5 rounded-lg bg-slate-50 p-2.5 text-xs leading-relaxed text-tinta dark:bg-slate-800/50">
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
  const sinArchivos = useSearchParams().get("aviso") === "archivo";
  const { perfil, tareas, archivadas, eventos } = useStore();
  const { t, diaLargo, momento } = useT();
  const nombre = useNombres();
  const obra = useObras();
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [porBorrar, setPorBorrar] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState(false);

  const tarea = tareas.find((x) => x.id === id) ?? archivadas.find((x) => x.id === id);
  if (!perfil) return null;
  if (!tarea) {
    return (
      <div className="hoja p-8 text-center">
        <p className="text-sm text-gris">{t.detalle.noExiste}</p>
        <Link href="/panel/tareas" className="btn btn-linea mt-4 inline-flex">
          ← {t.detalle.volver}
        </Link>
      </div>
    );
  }

  const admin = perfil.rol === "admin";
  const historial = eventos.filter((e) => e.tareaId === tarea.id);

  const archivar = async (archivando: boolean) => {
    setError("");
    try {
      await archivarTarea(tarea.id, archivando);
    } catch (e) {
      setError(t.fallos[falloDe(e)]);
    }
  };

  const borrar = async () => {
    try {
      const fotosSueltas = await borrarTarea(tarea.id);
      router.replace(fotosSueltas ? "/panel/tareas?aviso=fotos" : "/panel/tareas");
    } catch (e) {
      setPorBorrar(false);
      setError(t.fallos[falloDe(e)]);
    }
  };

  const filas: [string, React.ReactNode][] = [
    [t.campos.obra, <span key="o" className="font-semibold">{obra(tarea.obraId)}</span>],
    [t.campos.estado, <Sello key="e" estado={tarea.estado} />],
    [t.campos.prioridad, <Barras key="p" prioridad={tarea.prioridad} conTexto />],
    [t.campos.vence, <Vence key="v" tarea={tarea} className="!text-xs" />],
    [t.campos.responsable, <span key="r" className="font-semibold">{nombre(tarea.asignadaA)}</span>],
    [t.campos.creada, diaLargo(tarea.creada)],
    [t.campos.actualizada, momento(tarea.actualizada)],
  ];

  const ficha = (
    <div className="rounded-2xl border border-regla bg-hoja p-4 shadow-xs">
      <span className="block mb-2 text-xs font-bold uppercase tracking-wider text-gris">Ficha técnica</span>
      <dl className="divide-y divide-regla">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-xs text-gris">{etiqueta}</dt>
            <dd className="text-right text-xs text-tinta">{valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  return (
    <div className="space-y-6 sm:space-y-8">
      <Link
        href={tarea.obraId ? `/panel/tareas?obra=${tarea.obraId}` : "/panel/tareas"}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris transition-colors hover:text-blue-600 dark:hover:text-blue-400"
      >
        <span>←</span> {tarea.obraId ? obra(tarea.obraId) : t.detalle.volver}
      </Link>

      {editando ? (
        <div className="rounded-2xl border border-regla bg-hoja p-5 shadow-sm sm:p-7">
          <TareaForm key={tarea.id} tarea={tarea} onCancel={() => setEditando(false)} onDone={() => setEditando(false)} />
        </div>
      ) : (
        <>
          <header className="rounded-2xl border border-regla bg-hoja p-5 shadow-xs sm:p-7">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {codigoTarea(tarea.numero)}
              </span>
              <Sello estado={tarea.estado} />
              {tarea.archivada && (
                <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                  {t.obras.archivada}
                </span>
              )}
              <Vence tarea={tarea} />
            </div>

            {admin && <Link className="enlace mt-4 inline-block text-xs" href={`/panel/tareas?duplicar=${tarea.id}`}>Duplicar tarea</Link>}
            <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-tinta sm:text-3xl">
              {tarea.titulo}
            </h1>

            {admin && (
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-regla pt-4 text-xs">
                {tarea.archivada ? (
                  <>
                    <button className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400" onClick={() => void archivar(false)}>
                      {t.detalle.restaurar}
                    </button>
                    {porBorrar ? (
                      <span>
                        {t.detalle.eliminarSeguro}
                        <button className="ml-2 font-bold text-rose-600 dark:text-rose-400" onClick={() => void borrar()}>
                          {t.detalle.eliminarSi}
                        </button>
                        <button className="ml-2 font-medium text-gris" onClick={() => setPorBorrar(false)}>
                          {t.comun.no}
                        </button>
                      </span>
                    ) : (
                      <button className="font-semibold text-gris hover:text-rose-600" onClick={() => setPorBorrar(true)}>
                        {t.detalle.eliminar}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400" onClick={() => setEditando(true)}>
                      {t.detalle.editar}
                    </button>
                    <button className="text-gris hover:text-tinta" onClick={() => void archivar(true)}>
                      {t.detalle.archivar}
                    </button>
                  </>
                )}
                {error && <span className="font-semibold text-rose-600 dark:text-rose-400">{error}</span>}
              </div>
            )}
          </header>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0 space-y-8">
              {sinArchivos && (
                <div role="alert" className="hoja border-rose-200 bg-rose-50/80 p-4 text-xs font-semibold text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                  {t.fallos.archivo}
                </div>
              )}
              {tarea.archivada && (
                <div role="status" className="hoja p-4 text-xs font-medium text-gris">
                  {t.detalle.archivadaAviso}
                </div>
              )}
              {hecho && (
                <div role="status" className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                    ✓
                  </span>
                  {t.detalle.hecho(t.estados[tarea.estado])}
                </div>
              )}

              {!tarea.archivada && (
                <Pasos key={`${tarea.estado}-${perfil.id}`} tarea={tarea} perfil={perfil} onHecho={() => setHecho(true)} />
              )}

              <section className="hoja p-5 sm:p-6">
                <span className="text-xs font-bold uppercase tracking-wider text-gris">{t.campos.descripcion}</span>
                <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-tinta">
                  {tarea.descripcion || <span className="text-gris italic">{t.detalle.sinDescripcion}</span>}
                </p>
              </section>

              <Galeria tarea={tarea} />

              <div className="lg:hidden">{ficha}</div>

              <section className="space-y-4">
                <h2 className="font-display text-lg font-bold tracking-tight text-tinta">{t.detalle.historial}</h2>
                {!tarea.archivada && (
                  <div>
                    <Comentar tarea={tarea} />
                  </div>
                )}
                <Linea eventos={historial} />
              </section>
            </div>

            <aside className="hidden lg:block">
              <div className="sticky top-6">{ficha}</div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
