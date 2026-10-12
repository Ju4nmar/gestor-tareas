import Link from "next/link";
import { Ajustes, Logo } from "./ui";

/** Página suelta y centrada: activar la cuenta o cambiar la contraseña. */
export function Marco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col px-6 py-8 sm:px-10">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Logo />
        </Link>
        <Ajustes />
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
        <h1 className="font-display text-3xl font-bold tracking-tight">{titulo}</h1>
        {children}
      </div>
    </div>
  );
}
