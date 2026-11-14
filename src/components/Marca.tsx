/** Isotipo arquitectónico de TRAZO, legible sobre ambos temas. */
export function Isotipo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M12 47V28l13-8v26M25 46V12l14-8 12 8v29"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M25 12 39 4v39M39 4v39"
        stroke="var(--cian)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M5 57c13-12 23-13 38-15 17-3 20-13 8-18"
        stroke="var(--marca)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M5 57c13-8 25-7 42-9"
        stroke="var(--cian)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  className = "",
  compacto = false,
}: {
  className?: string;
  compacto?: boolean;
}) {
  return (
    <span className={`trazo-logo ${className}`}>
      <Isotipo className="trazo-isotipo" />
      {compacto ? (
        <span className="sr-only">TRAZO</span>
      ) : (
        <span className="trazo-wordmark">
          <strong>TRAZO</strong>
          <span>Gestión de Obras y Tareas</span>
        </span>
      )}
    </span>
  );
}
