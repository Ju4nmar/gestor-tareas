"use client";

import { useSyncExternalStore } from "react";

// "Hoy" como fecha local "AAAA-MM-DD". En el servidor vale "" (aún no se sabe)
// y en el navegador se revisa cada minuto, por si la pestaña queda abierta de un
// día para otro.

export function fechaLocal(d = new Date()) {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

export function sumarDias(fecha: string, n: number) {
  const [y, m, d] = fecha.split("-").map(Number);
  return fechaLocal(new Date(y, m - 1, d + n));
}

let hoy = "";
const oyentes = new Set<() => void>();
let reloj: ReturnType<typeof setInterval> | undefined;

function subscribe(oyente: () => void) {
  oyentes.add(oyente);
  reloj ??= setInterval(() => {
    const ahora = fechaLocal();
    if (ahora === hoy) return;
    hoy = ahora;
    oyentes.forEach((o) => o());
  }, 60_000);
  return () => {
    oyentes.delete(oyente);
    if (oyentes.size === 0) {
      clearInterval(reloj);
      reloj = undefined;
    }
  };
}

export const useHoy = () =>
  useSyncExternalStore(
    subscribe,
    () => (hoy ||= fechaLocal()),
    () => "",
  );
