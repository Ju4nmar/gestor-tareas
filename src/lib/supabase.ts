import { createClient } from "@supabase/supabase-js";

// La clave publicable puede ir al navegador: lo que cada quien puede leer o
// escribir lo deciden las políticas de la base de datos (supabase/schema.sql).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);
