import type { ReactNode } from "react";

const trazos = {
  tareas: (
    <>
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="M9 3h6v4H9zM9 12h6M9 16h6" />
    </>
  ),
  capas: (
    <>
      <path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  avance: (
    <>
      <path d="M5 20v-6M12 20V8M19 20V3" />
    </>
  ),
  equipo: (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5" />
    </>
  ),
  revisar: (
    <>
      <path d="M20 7a8 8 0 0 0-14-1L3 9m0-6v6h6M4 17a8 8 0 0 0 14 1l3-3m0 6v-6h-6" />
    </>
  ),
  alerta: (
    <>
      <path d="m10.3 4-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  flecha: <path d="M4 12h16m-6-6 6 6-6 6" />,
  correo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 6 9 7 9-7" />
    </>
  ),
  candado: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  ojo: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  ocultar: (
    <>
      <path d="m3 3 18 18M10 5a12 12 0 0 1 12 7 18 18 0 0 1-3 4M6 6a18 18 0 0 0-4 6s4 7 10 7a12 12 0 0 0 5-1" />
    </>
  ),
  corona: (
    <>
      <path d="m3 6 4 4 5-7 5 7 4-4-3 12H6zM6 21h12" />
    </>
  ),
  casco: (
    <>
      <path d="M3 17h18v3H3zM5 17v-4a7 7 0 0 1 14 0v4M10 5v7M14 5v7" />
    </>
  ),
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" />
    </>
  ),
  luna: <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z" />,
  calendario: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </>
  ),
  mas: <path d="M12 5v14M5 12h14" />,
} satisfies Record<string, ReactNode>;

export function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: keyof typeof trazos;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {trazos[name]}
    </svg>
  );
}
