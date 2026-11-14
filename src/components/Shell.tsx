"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ESPERA_ADMIN, abierta } from "@/lib/flujo";
import { personasDemo, recargar, salir, salirDemo, useStore, verComo } from "@/lib/store";
import { useT } from "@/lib/textos";
import { VistaCliente } from "./Cliente";
import { Ajustes, Cargando, Logo } from "./ui";

/** Franja del modo de muestra: moderna y discreta con selector rápido. */
function BarraDemo() {
  const { perfil } = useStore();
  const { t } = useT();
  return (
    <div role="region" aria-label="Modo de demostración" className="border-b border-slate-800 bg-slate-900 text-slate-200">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 text-xs lg:px-8">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            {t.demo.aviso}
          </span>
          <span className="hidden text-slate-400 sm:inline">·</span>
          <label className="flex items-center gap-2 text-slate-300">
            <span className="hidden sm:inline">{t.demo.verComo}</span>
            <select
              aria-label={t.demo.verComo}
              className="rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1 text-xs text-slate-100 transition-colors focus:border-blue-500 focus:outline-none"
              value={perfil?.id}
              onChange={(e) => verComo(e.target.value)}
            >
              {personasDemo().map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({t.roles[p.rol]})
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          onClick={salirDemo}
        >
          {t.demo.salir}
        </button>
      </div>
    </div>
  );
}

/** Iconografía SVG moderna y uniforme para la navegación. */
const ICONOS: Record<string, React.ReactNode> = {
  inicio: (
    <>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </>
  ),
  tareas: (
    <>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>
  ),
  obras: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </>
  ),
  historial: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),
  informes: (
    <>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </>
  ),
  equipo: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  mas: (
    <>
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
    </>
  ),
  salir: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
};

function Icono({ nombre, className = "h-5 w-5" }: { nombre: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONOS[nombre]}
    </svg>
  );
}

/** Iniciales para avatar de usuario. */
function Avatar({ nombre }: { nombre: string }) {
  const iniciales = nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 font-sans text-xs font-bold text-blue-700 shadow-xs dark:bg-blue-950 dark:text-blue-300">
      {iniciales || "U"}
    </span>
  );
}

/** Marco de la aplicación: comprueba el acceso y pinta el menú según el rol. */
export function Shell({ children }: { children: React.ReactNode }) {
  const { listo, perfil, demo, cargado, error, tareas } = useStore();
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  // Hoja modal de "Más" en móvil
  const [mas, setMas] = useState(false);
  const menuRef = useRef<HTMLDialogElement>(null);
  const masRef = useRef<HTMLButtonElement>(null);
  const cerrarMenu = () => {
    menuRef.current?.close();
    setMas(false);
    masRef.current?.focus();
  };
  useEffect(() => {
    const menu = menuRef.current;
    if (mas && menu && !menu.open) menu.showModal();
    if (!mas && menu?.open) menu.close();
    if (!mas) return;
    const escritorio = window.matchMedia("(min-width: 1024px)");
    const adaptar = () => {
      if (escritorio.matches) {
        menu?.close();
        setMas(false);
      }
    };
    escritorio.addEventListener("change", adaptar);
    return () => escritorio.removeEventListener("change", adaptar);
  }, [mas]);

  // Sin acceso no hay panel: de vuelta a la entrada.
  useEffect(() => {
    if (listo && !perfil) router.replace("/");
  }, [listo, perfil, router]);

  // Mientras se comprueba el acceso, la página se monta oculta.
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
  // Lo que espera una acción de quien mira
  const porHacer = abiertas.filter((x) =>
    admin ? ESPERA_ADMIN.includes(x.estado) : x.estado === "asignada" || x.estado === "devuelta",
  ).length;

  const secciones = [
    { href: "/panel", icono: "inicio", label: t.nav.inicio, cuenta: porHacer, resaltar: true },
    { href: "/panel/tareas", icono: "tareas", label: t.nav.tareas, cuenta: abiertas.length, resaltar: false },
    { href: "/panel/obras", icono: "obras", label: t.nav.obras, cuenta: 0, resaltar: false },
    { href: "/panel/historial", icono: "historial", label: t.nav.historial, cuenta: 0, resaltar: false },
    ...(admin
      ? [
          { href: "/panel/informes", icono: "informes", label: t.nav.informes, cuenta: 0, resaltar: false },
          { href: "/panel/equipo", icono: "equipo", label: t.nav.equipo, cuenta: 0, resaltar: false },
        ]
      : []),
  ];

  // En el celular van abajo las 3 secciones principales; el resto en "Más".
  const abajo = secciones.slice(0, 3);
  const resto = secciones.slice(3);
  const activa = (href: string) => (href === "/panel" ? pathname === href : pathname.startsWith(href));
  const enResto = resto.some((s) => activa(s.href));
  const cerrar = () => (demo ? salirDemo() : void salir());

  const aviso = error && (
    <div className="hoja mb-6 flex flex-wrap items-center justify-between gap-3 border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-rose-500" />
        {t.comun.errorCarga}
      </span>
      <button type="button" className="btn btn-linea py-1 text-xs" onClick={() => void recargar()}>
        {t.comun.reintentar}
      </button>
    </div>
  );

  // Vista cliente: diseño limpio y centrado sin barra lateral interna.
  if (perfil.rol === "cliente") {
    return (
      <div className="flex min-h-screen flex-1 flex-col bg-papel">
        {demo && <BarraDemo />}
        <header className="sticky top-0 z-20 border-b border-regla bg-hoja/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3.5">
            <Logo />
            <Ajustes />
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-16 pt-8 sm:pt-10">
          <div className="animate-entrar">
            {aviso}
            <VistaCliente />
          </div>
          <div className="mt-14 flex items-center justify-between gap-4 border-t border-regla pt-6 text-sm text-gris">
            <div className="flex items-center gap-3">
              <Avatar nombre={perfil.nombre} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-tinta">{perfil.nombre}</p>
                <p className="text-xs text-gris">{t.roles.cliente}</p>
              </div>
            </div>
            <button type="button" className="btn btn-linea py-1.5 text-xs" onClick={cerrar}>
              {demo ? t.demo.salir : t.comun.salir}
            </button>
          </div>
        </main>
        <div className="hidden">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-papel">
      {demo && <BarraDemo />}
      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Barra lateral Desktop */}
        <aside className="trazo-sidebar shrink-0 border-b border-regla bg-hoja lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-col lg:border-b-0 lg:border-r">
          {/* Cabecera / Logo */}
          <div className="flex items-center justify-between px-5 py-4 lg:px-6 lg:pb-4 lg:pt-6">
            <Link href="/panel" aria-label={t.nav.inicio} className="transition-opacity hover:opacity-90">
              <Logo />
            </Link>
            <Ajustes className="lg:hidden" />
          </div>

          {/* Menú de navegación Desktop */}
          <nav aria-label="Navegación principal" className="sidebar-nav mt-4 hidden flex-1 flex-col gap-1 px-3 lg:flex">
            {secciones.map((s) => {
              const active = activa(s.href);
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={`group flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                    active
                      ? "bg-blue-50 font-semibold text-blue-700 shadow-xs dark:bg-blue-950/50 dark:text-blue-300"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icono
                      nombre={s.icono}
                      className={`h-5 w-5 transition-colors ${
                        active
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300"
                      }`}
                    />
                    {s.label}
                  </span>
                  {s.cuenta > 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors ${
                        s.resaltar
                          ? "bg-blue-600 text-white shadow-xs"
                          : active
                            ? "bg-blue-200/80 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {s.cuenta}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Tarjeta de usuario y ajustes Desktop */}
          <div className="mt-auto hidden flex-col gap-4 border-t border-white/10 p-4 lg:flex">
            <div className="sidebar-user flex items-center justify-between gap-3 rounded-xl border p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar nombre={perfil.nombre} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-tinta">{perfil.nombre}</p>
                  <p className="truncate text-[11px] text-gris">{t.roles[perfil.rol]}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={cerrar}
                title={demo ? t.demo.salir : t.comun.salir}
                aria-label={demo ? t.demo.salir : t.comun.salir}
                className="rounded-lg p-1.5 text-gris transition-colors hover:bg-slate-200 hover:text-tinta dark:hover:bg-slate-700"
              >
                <Icono nombre="salir" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Contenido principal */}
        <main id="contenido" className="trazo-main min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 sm:pb-28 sm:pt-8 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-[1440px] animate-entrar" key={pathname}>
            <div className="panel-toolbar"><span>{secciones.find((seccion) => activa(seccion.href))?.label}</span><Ajustes /></div>
            {aviso}
            {children}
          </div>
        </main>
      </div>

      {/* Modal / Menú "Más" para Celular */}
      {mas && (
        <dialog
          ref={menuRef}
          aria-labelledby="menu-movil-titulo"
          className="menu-movil fixed inset-0 z-40 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 lg:hidden"
          onCancel={cerrarMenu}
          onClick={(event) => { if (event.target === event.currentTarget) cerrarMenu(); }}
        >
          <div
            className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-regla bg-hoja p-5 shadow-2xl animate-entrar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700" />
            <button type="button" autoFocus aria-label="Cerrar menú" className="btn btn-linea mb-4 w-full" onClick={cerrarMenu}>Cerrar menú</button>
            <h2 id="menu-movil-titulo" className="mb-2 text-xs font-bold uppercase tracking-wider text-gris">
              {t.nav.mas}
            </h2>
            <div className="divide-y divide-regla">
              {resto.map((s) => {
                const active = activa(s.href);
                return (
                  <Link
                    key={s.href}
                    href={s.href}
                    onClick={cerrarMenu}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-[52px] items-center justify-between py-3 font-medium transition-colors ${
                      active ? "font-semibold text-blue-600 dark:text-blue-400" : "text-tinta"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icono nombre={s.icono} className="h-5 w-5 text-gris" />
                      {s.label}
                    </span>
                    <span className="text-gris">→</span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-regla pt-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar nombre={perfil.nombre} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-tinta">{perfil.nombre}</p>
                  <p className="text-xs text-gris">{t.roles[perfil.rol]}</p>
                </div>
              </div>
              <button type="button" className="btn btn-linea py-1.5 text-xs" onClick={cerrar}>
                {demo ? t.demo.salir : t.comun.salir}
              </button>
            </div>
          </div>
        </dialog>
      )}

      {/* Barra de navegación inferior Celular (Touch-friendly 4-tabs) */}
      <nav
        aria-label="Navegación principal móvil"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-regla bg-hoja/95 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur-md lg:hidden"
      >
        {abajo.map((s) => {
          const aqui = !mas && activa(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              onClick={() => setMas(false)}
              aria-current={aqui ? "page" : undefined}
              className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                aqui ? "font-semibold text-blue-600 dark:text-blue-400" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <div className="relative">
                <Icono nombre={s.icono} className="h-5 w-5" />
                {s.cuenta > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white shadow-xs">
                    {s.cuenta}
                  </span>
                )}
              </div>
              <span>{s.label}</span>
              {aqui && (
                <span className="absolute bottom-1 h-1 w-6 rounded-full bg-blue-600 dark:bg-blue-400" />
              )}
            </Link>
          );
        })}

        <button
          type="button"
          ref={masRef}
          aria-expanded={mas}
          aria-haspopup="dialog"
          onClick={() => setMas((v) => !v)}
          className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mas || enResto
              ? "font-semibold text-blue-600 dark:text-blue-400"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <Icono nombre="mas" className="h-5 w-5" />
          <span>{t.nav.mas}</span>
          {(mas || enResto) && (
            <span className="absolute bottom-1 h-1 w-6 rounded-full bg-blue-600 dark:bg-blue-400" />
          )}
        </button>
      </nav>
    </div>
  );
}
