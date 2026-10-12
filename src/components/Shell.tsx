"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ESPERA_ADMIN, abierta } from "@/lib/flujo";
import { personasDemo, recargar, salir, salirDemo, useStore, verComo } from "@/lib/store";
import { useT } from "@/lib/textos";
import { Ajustes, Cargando, Logo } from "./ui";

/** Franja del modo de muestra: avisa que nada se guarda y deja cambiar de persona. */
function BarraDemo() {
  const { perfil } = useStore();
  const { t } = useT();
  return (
    <div className="bg-[#16130e] text-[#f2eee5]">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.08em] lg:px-6">
        <span className="text-marca">{t.demo.aviso}</span>
        <label className="flex items-center gap-2">
          {t.demo.verComo}
          <select
            className="rounded-[3px] border border-white/30 bg-[#16130e] px-2 py-1 font-sans text-xs normal-case tracking-normal text-[#f2eee5]"
            value={perfil?.id}
            onChange={(e) => verComo(e.target.value)}
          >
            {personasDemo().map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} · {t.roles[p.rol]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="ml-auto underline underline-offset-4 hover:text-marca" onClick={salirDemo}>
          {t.demo.salir}
        </button>
      </div>
    </div>
  );
}

/** Dibujos del menú inferior del celular. */
const ICONOS: Record<string, React.ReactNode> = {
  inicio: <path d="M4 11.5 12 4l8 7.5V20h-5.5v-5.5h-5V20H4v-8.5Z" />,
  tareas: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m3.5 6 1.2 1.2L6.8 5M3.5 12l1.2 1.2L6.8 11M3.5 18l1.2 1.2L6.8 17" />
    </>
  ),
  obras: (
    <>
      <path d="M4 20V9l6-4v15M10 20V11h10v9M2.5 20h19" />
      <path d="M13.5 14.5h3M13.5 17.5h3M6.5 12v0M6.5 15.5v0" />
    </>
  ),
  mas: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />,
};

function Icono({ nombre }: { nombre: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {ICONOS[nombre]}
    </svg>
  );
}

/** Marco de la aplicación: comprueba el acceso y pinta el menú según el rol. */
export function Shell({ children }: { children: React.ReactNode }) {
  const { listo, perfil, demo, cargado, error, tareas } = useStore();
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  // Hoja de "Más" del menú del celular.
  const [mas, setMas] = useState(false);

  // Sin acceso no hay panel: de vuelta a la entrada.
  useEffect(() => {
    if (listo && !perfil) router.replace("/");
  }, [listo, perfil, router]);

  // Mientras se comprueba el acceso, la página se monta oculta para que Next pueda
  // validar y precargar la ruta.
  if (!listo || !perfil || !cargado) {
    return (
      <>
        <Cargando />
        <div className="hidden">{children}</div>
      </>
    );
  }

  const admin = perfil.rol === "admin";
  const abiertas = tareas.filter(abierta);
  // Lo que espera una acción de quien mira: revisiones para el administrador, tareas por aceptar o corregir para el resto.
  const porHacer = abiertas.filter((x) =>
    admin ? ESPERA_ADMIN.includes(x.estado) : x.estado === "asignada" || x.estado === "devuelta",
  ).length;

  const secciones = [
    { href: "/panel", icono: "inicio", label: t.nav.inicio, cuenta: porHacer, resaltar: true },
    { href: "/panel/tareas", icono: "tareas", label: t.nav.tareas, cuenta: abiertas.length, resaltar: false },
    { href: "/panel/obras", icono: "obras", label: t.nav.obras, cuenta: 0, resaltar: false },
    { href: "/panel/historial", icono: "", label: t.nav.historial, cuenta: 0, resaltar: false },
    ...(admin
      ? [
          { href: "/panel/informes", icono: "", label: t.nav.informes, cuenta: 0, resaltar: false },
          { href: "/panel/equipo", icono: "", label: t.nav.equipo, cuenta: 0, resaltar: false },
        ]
      : []),
  ];
  // En el celular van abajo las tres secciones de todos los días; el resto queda en "Más".
  const abajo = secciones.filter((s) => s.icono);
  const resto = secciones.filter((s) => !s.icono);
  const activa = (href: string) => (href === "/panel" ? pathname === href : pathname.startsWith(href));
  const enResto = resto.some((s) => activa(s.href));
  const cerrar = () => (demo ? salirDemo() : void salir());

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      {demo && <BarraDemo />}
      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="flex shrink-0 flex-col border-b border-regla lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-5 py-4 lg:block lg:px-6 lg:pb-0 lg:pt-8">
            <Link href="/panel" aria-label={t.nav.inicio}>
              <Logo />
            </Link>
            <Ajustes className="lg:hidden" />
          </div>

          <nav className="mt-10 hidden flex-col px-3 lg:flex">
            {secciones.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                aria-current={activa(s.href) ? "page" : undefined}
                className={`flex items-center justify-between gap-3 rounded-[3px] px-3 py-2 text-[15px] font-medium transition-colors ${
                  activa(s.href) ? "bg-tinta text-papel" : "text-gris hover:text-tinta"
                }`}
              >
                {s.label}
                {s.cuenta > 0 && (
                  <span
                    className={`font-mono text-[11px] ${
                      s.resaltar ? "bg-marca px-1.5 py-0.5 text-[#16130e]" : activa(s.href) ? "text-papel/70" : ""
                    }`}
                  >
                    {s.cuenta}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <div className="mt-auto hidden space-y-5 px-6 pb-7 lg:block">
            <Ajustes />
            <div className="border-t border-regla pt-5">
              <p className="truncate font-medium">{perfil.nombre}</p>
              <p className="rotulo mt-0.5">{t.roles[perfil.rol]}</p>
              <button type="button" className="enlace mt-3 text-sm text-gris hover:text-tinta" onClick={cerrar}>
                {demo ? t.demo.salir : t.comun.salir}
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-5 pb-28 pt-7 lg:px-12 lg:py-11">
          <div className="mx-auto max-w-5xl animate-entrar" key={pathname}>
            {error && (
              <p className="hoja mb-6 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                {t.comun.errorCarga}
                <button type="button" className="enlace" onClick={() => void recargar()}>
                  {t.comun.reintentar}
                </button>
              </p>
            )}
            {children}
          </div>
        </main>
      </div>

      {mas && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMas(false)}>
          <div
            className="absolute inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] animate-entrar border-t border-tinta bg-hoja px-5 pb-4 pt-2"
            onClick={(e) => e.stopPropagation()}
          >
            {resto.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                onClick={() => setMas(false)}
                aria-current={activa(s.href) ? "page" : undefined}
                className={`flex min-h-14 items-center justify-between border-b border-regla text-lg font-medium ${
                  activa(s.href) ? "" : "text-gris"
                }`}
              >
                {s.label}
                <span aria-hidden>→</span>
              </Link>
            ))}
            <div className="flex min-h-14 items-center justify-between gap-4">
              <span className="min-w-0">
                <span className="block truncate font-medium">{perfil.nombre}</span>
                <span className="rotulo">{t.roles[perfil.rol]}</span>
              </span>
              <button type="button" className="btn btn-linea shrink-0" onClick={cerrar}>
                {demo ? t.demo.salir : t.comun.salir}
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 grid auto-cols-fr grid-flow-col border-t border-tinta bg-hoja pb-[env(safe-area-inset-bottom)] lg:hidden">
        {abajo.map((s) => {
          const aqui = !mas && activa(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              onClick={() => setMas(false)}
              aria-current={aqui ? "page" : undefined}
              className={`relative flex h-[4.25rem] flex-col items-center justify-center gap-1 text-xs font-medium ${
                aqui ? "text-tinta" : "text-gris"
              }`}
            >
              {aqui && <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] bg-tinta" />}
              <span className="relative">
                <Icono nombre={s.icono} />
                {s.resaltar && s.cuenta > 0 && (
                  <span className="absolute -right-3.5 -top-1.5 min-w-5 bg-marca px-1 text-center font-mono text-[11px] leading-5 text-[#16130e]">
                    {s.cuenta}
                  </span>
                )}
              </span>
              {s.label}
            </Link>
          );
        })}
        <button
          type="button"
          aria-expanded={mas}
          onClick={() => setMas((v) => !v)}
          className={`relative flex h-[4.25rem] flex-col items-center justify-center gap-1 text-xs font-medium ${
            mas || enResto ? "text-tinta" : "text-gris"
          }`}
        >
          {(mas || enResto) && <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] bg-tinta" />}
          <Icono nombre="mas" />
          {t.nav.mas}
        </button>
      </nav>
    </div>
  );
}
