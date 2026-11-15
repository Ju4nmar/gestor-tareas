import test from "node:test";
import assert from "node:assert/strict";
import { avanceDe } from "../src/lib/avance";
import { rutaArchivo } from "../src/lib/ruta-archivo";
import {
  hashRespaldo,
  validarRespaldo,
  type Respaldo,
} from "../src/lib/respaldo-formato";
import type { Tarea, TareaCliente } from "../src/lib/types";

test("Avance compatible con pesos antiguos y tareas archivadas", () => {
  const tareas = [
    { estado: "completada" },
    { estado: "en_curso", peso: 3 },
    { estado: "completada", peso: 50, archivada: "2026-01-01" },
  ] as Tarea[];
  assert.deepEqual(avanceDe(tareas), { total: 4, hechas: 1, porcentaje: 25 });
  assert.equal(avanceDe([]).porcentaje, 0);
  assert.equal(
    avanceDe([
      { etapa: "terminada", peso: 3 },
      { etapa: "pendiente", peso: 1 },
    ] as TareaCliente[]).porcentaje,
    75,
  );
});

test("La ruta de un archivo es estable en reintentos y separa responsables", async () => {
  const blob = new Blob(["archivo de prueba"], { type: "application/pdf" });
  const ruta = await rutaArchivo("tarea", "persona", blob, "application/pdf");
  assert.equal(
    ruta,
    await rutaArchivo("tarea", "persona", blob, "application/pdf"),
  );
  assert.notEqual(
    ruta,
    await rutaArchivo("tarea", "otra-persona", blob, "application/pdf"),
  );
  assert.notEqual(
    ruta,
    await rutaArchivo("otra-tarea", "persona", blob, "application/pdf"),
  );
});

async function copiaDePrueba(): Promise<Respaldo> {
  const bytes = new TextEncoder().encode("contenido PDF de prueba");
  return {
    format: "trazo-company",
    version: 1,
    created_at: new Date().toISOString(),
    metadata: {
      company: { id: "empresa" },
      profiles: [],
      projects: [],
      tasks: [],
      events: [],
      clients: [],
      templates: [],
      files: [{ company_id: "empresa", path: "tarea/archivo.pdf" }],
    },
    files: [
      {
        bucket: "tareas",
        path: "tarea/archivo.pdf",
        mime: "application/pdf",
        sha256: await hashRespaldo(bytes),
        data: btoa("contenido PDF de prueba"),
      },
    ],
  };
}

test("Respaldo valida integridad y rechaza archivos modificados o ausentes", async () => {
  const copia = await copiaDePrueba();
  assert.equal(await validarRespaldo(copia), copia);
  const alterada = structuredClone(copia);
  alterada.files[0].data = btoa("alterado");
  await assert.rejects(validarRespaldo(alterada), /integridad/);
  await assert.rejects(
    validarRespaldo({ ...copia, files: [] }),
    /Faltan archivos/,
  );
  const mezclada = structuredClone(copia);
  (mezclada.metadata.profiles as unknown[]).push({ company_id: "otra" });
  await assert.rejects(validarRespaldo(mezclada), /mezcla empresas/);
});
