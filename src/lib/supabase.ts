import { createClient } from "@supabase/supabase-js";
import { SOLO_DEMO } from "./entorno";

let empresaActual: string | null = null;

export function seleccionarEmpresaApi(id: string | null) {
  empresaActual = id;
}

// La clave publicable puede ir al navegador: lo que cada quien puede leer o
// escribir lo deciden las políticas de la base de datos (supabase/schema.sql).
export const supabase = createClient(
  SOLO_DEMO ? "https://demo.invalid" : process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SOLO_DEMO ? "demo-only" : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      persistSession: !SOLO_DEMO,
      autoRefreshToken: !SOLO_DEMO,
      detectSessionInUrl: !SOLO_DEMO,
    },
    global: {
      fetch: (input, init) => {
        if (SOLO_DEMO) {
          return Promise.reject(new Error("La vista previa utiliza datos de demostración."));
        }
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
        if (empresaActual) headers.set("x-trazo-company", empresaActual);
        return fetch(input, { ...init, headers });
      },
    },
  },
);
