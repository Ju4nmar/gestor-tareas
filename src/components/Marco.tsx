import Link from "next/link";
import { Ajustes, Logo } from "./ui";

/** Página suelta y centrada: activar la cuenta o cambiar la contraseña. */
export function Marco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-papel px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
        <Link href="/" className="transition-opacity hover:opacity-90">
          <Logo />
        </Link>
        <Ajustes />
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
        <div className="rounded-2xl border border-regla bg-hoja p-6 shadow-sm sm:p-8">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-tinta sm:text-3xl">{titulo}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
