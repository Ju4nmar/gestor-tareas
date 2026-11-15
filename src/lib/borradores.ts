"use client";

import { useState, useSyncExternalStore } from "react";

type Borrador = {
  valor: unknown;
  solicitud: string;
  fecha: string | null;
  persistido: boolean;
};
const cache = new Map<string, Borrador>();
const listeners = new Set<() => void>();
const notificar = () => listeners.forEach((listener) => listener());
const suscribir = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const prefijo = "trazo-borrador:";

function estructuraValida(valor: unknown, inicial: unknown): boolean {
  if (inicial === null) return valor === null || typeof valor === "string";
  if (typeof valor !== typeof inicial) return false;
  if (typeof inicial === "number") return Number.isFinite(valor);
  if (typeof inicial === "object") {
    if (!valor || Array.isArray(valor)) return false;
    return Object.entries(inicial as Record<string, unknown>).every(
      ([campo, ejemplo]) =>
        estructuraValida((valor as Record<string, unknown>)[campo], ejemplo),
    );
  }
  return true;
}

function cargar(clave: string, inicial: Borrador) {
  const existente = cache.get(clave);
  if (existente) return existente;
  let valor = { ...inicial, solicitud: crypto.randomUUID() };
  try {
    const guardado = JSON.parse(
      localStorage.getItem(prefijo + clave) ?? "null",
    );
    if (
      guardado?.version === 1 &&
      typeof guardado.solicitud === "string" &&
      typeof guardado.fecha === "string" &&
      estructuraValida(guardado.valor, inicial.valor)
    ) {
      valor = {
        valor: guardado.valor,
        solicitud: guardado.solicitud,
        fecha: guardado.fecha,
        persistido: true,
      };
    }
  } catch {
    valor.persistido = false;
  }
  cache.set(clave, valor);
  return valor;
}

export function useBorrador<T>(clave: string, valorInicial: T) {
  const [inicial] = useState<Borrador>({
    valor: valorInicial,
    solicitud: "",
    fecha: null,
    persistido: true,
  });
  const borrador = useSyncExternalStore(
    suscribir,
    () => cargar(clave, inicial),
    () => inicial,
  );
  function escribir(valor: T) {
    const nuevo = {
      ...cargar(clave, inicial),
      valor,
      fecha: new Date().toISOString(),
      persistido: true,
    };
    try {
      localStorage.setItem(
        prefijo + clave,
        JSON.stringify({ ...nuevo, version: 1 }),
      );
    } catch {
      nuevo.persistido = false;
    }
    cache.set(clave, nuevo);
    notificar();
  }
  function limpiar() {
    try {
      localStorage.removeItem(prefijo + clave);
    } catch {
      /* Se limpia la memoria de esta visita. */
    }
    cache.set(clave, { ...inicial, solicitud: crypto.randomUUID() });
    notificar();
  }
  return {
    valor: borrador.valor as T,
    escribir,
    limpiar,
    solicitud: borrador.solicitud,
    fecha: borrador.fecha,
    persistido: borrador.persistido,
  };
}

export function limpiarBorradoresCuenta(cuenta: string) {
  try {
    for (const clave of Object.keys(localStorage)) {
      if (clave.startsWith(prefijo + cuenta + ":"))
        localStorage.removeItem(clave);
    }
  } catch {
    /* La memoria se limpia tambien con el almacenamiento restringido. */
  }
  for (const clave of cache.keys())
    if (clave.startsWith(cuenta + ":")) cache.delete(clave);
  notificar();
}
