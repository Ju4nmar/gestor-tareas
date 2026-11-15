import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

// Cada proceso importa el cliente con su propio entorno y una red simulada.
// Incluso si alguien añade credenciales reales a Preview, el cliente debe bloquearlas.
const comprobarCliente = (soloDemo: boolean) => {
  const script = `
    const assert = require("node:assert/strict");
    const { createJiti } = require("jiti");
    const path = require("node:path");
    let solicitudes = 0;
    let empresa;
    globalThis.fetch = async (input, init) => {
      solicitudes++;
      empresa = new Headers(init.headers).get("x-trazo-company");
      return new Response("[]", { headers: { "content-type": "application/json" } });
    };
    const jiti = createJiti(path.join(process.cwd(), "cliente-prueba.js"));
    const { supabase, seleccionarEmpresaApi } = jiti("./src/lib/supabase.ts");
    (async () => {
      seleccionarEmpresaApi("11111111-1111-4111-8111-111111111111");
      const resultado = await supabase.from("tm_tasks").select("*");
      if (process.env.NEXT_PUBLIC_DEMO_ONLY === "true") {
        assert.equal(supabase.supabaseUrl, "https://demo.invalid");
        assert.equal(solicitudes, 0);
        assert.ok(resultado.error);
        const almacen = await supabase.storage.from("tareas").list();
        assert.ok(almacen.error);
        const acceso = await supabase.auth.signInWithPassword({ email: "prueba@example.invalid", password: "solo-prueba" });
        assert.ok(acceso.error);
        assert.equal(solicitudes, 0);
      } else {
        assert.equal(supabase.supabaseUrl, "https://produccion.example.invalid");
        assert.equal(resultado.error, null);
        assert.equal(solicitudes, 1);
        assert.equal(empresa, "11111111-1111-4111-8111-111111111111");
      }
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const resultado = spawnSync(process.execPath, ["-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_DEMO_ONLY: String(soloDemo),
      NEXT_PUBLIC_SUPABASE_URL: "https://produccion.example.invalid",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_solo_para_pruebas",
    },
  });
  assert.equal(resultado.status, 0, resultado.stderr || String(resultado.error ?? ""));
};

test("Preview bloquea consultas, archivos y autenticación contra Supabase", () => comprobarCliente(true));
test("Producción conserva la conexión y el contexto de empresa", () => comprobarCliente(false));
