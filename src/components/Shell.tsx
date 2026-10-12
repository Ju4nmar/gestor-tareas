"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
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

/** Marco de la aplicación: comprueba el acceso y pinta el menú según el rol. */
export function Shell({ children }: { children: React.ReactNode }) {
  const { listo, perfil, demo, cargado, error, tareas } = useStore();
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();

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
    { href: "/panel", label: t.nav.inicio, cuenta: porHacer, resaltar: true },
    { href: "/panel/tareas", label: t.nav.tareas, cuenta: abiertas.length, resaltar: false },
    { href: "/panel/historial", label: t.nav.historial, cuenta: 0, resaltar: false },
    ...(admin
      ? [
          { href: "/panel/informes", label: t.nav.informes, cuenta: 0, resaltar: false },
          { href: "/panel/equipo", label: t.nav.equipo, cuenta: 0, resaltar: false },
        ]
      : []),
  ];
  const activa = (href: string) => (href === "/panel" ? pathname === href : pathname.startsWith(href));
  const cerrar = () => (demo ? salirDemo() : void salir());

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      {demo && <BarraDemo />}
      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="flex shrink-0 flex-col border-b border-regla lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-5 pt-5 lg:block lg:px-6 lg:pt-8">
            <Link href="/panel" aria-label={t.nav.inicio}>
              <Logo />
            </Link>
            <Ajustes className="lg:hidden" />
          </div>

          <nav className="mt-4 flex gap-5 overflow-x-auto px-5 lg:mt-10 lg:flex-col lg:gap-0 lg:px-3">
            {secciones.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                aria-current={activa(s.href) ? "page" : undefined}
                className={`flex shrink-0 items-center justify-between gap-3 border-b-2 pb-2.5 text-[15px] font-medium transition-colors lg:rounded-[3px] lg:border-b-0 lg:px-3 lg:py-2 ${
                  activa(s.href)
                    ? "border-tinta text-tinta lg:bg-tinta lg:text-papel"
                    : "border-transparent text-gris hover:text-tinta"
                }`}
              >
                {s.label}
                {s.cuenta > 0 && (
                  <span
                    className={`font-mono text-[11px] ${
                      s.resaltar ? "bg-marca px-1.5 py-0.5 text-[#16130e]" : activa(s.href) ? "lg:text-papel/70" : ""
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

        <main className="min-w-0 flex-1 px-5 py-8 lg:px-12 lg:py-11">
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
          <p className="mx-auto mt-16 flex max-w-5xl items-center justify-between border-t border-regla pt-5 text-sm text-gris lg:hidden">
            <span>
              {perfil.nombre} · {t.roles[perfil.rol]}
            </span>
            <button type="button" className="enlace" onClick={cerrar}>
              {demo ? t.demo.salir : t.comun.salir}
            </button>
          </p>
        </main>
      </div>
    </div>
  );
}
