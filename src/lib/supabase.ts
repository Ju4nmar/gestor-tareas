import { createClient } from "@supabase/supabase-js";

let empresaActual: string | null = null;

export function seleccionarEmpresaApi(id: string | null) {
  empresaActual = id;
}

// La clave publicable puede ir al navegador: lo que cada quien puede leer o
// escribir lo deciden las políticas de la base de datos (supabase/schema.sql).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
        if (empresaActual) headers.set("x-trazo-company", empresaActual);
        return fetch(input, { ...init, headers });
      },
    },
  },
);
