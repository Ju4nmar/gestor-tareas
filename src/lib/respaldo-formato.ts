export type FilaRespaldo = Record<string, unknown>;
export type ArchivoRespaldo = {
  bucket: string;
  path: string;
  mime: string;
  sha256: string;
  data: string;
};
export type Respaldo = {
  format: "trazo-company";
  version: 1;
  created_at: string;
  metadata: Record<string, unknown>;
  files: ArchivoRespaldo[];
};

export const tablasRespaldo = [
  "profiles",
  "projects",
  "tasks",
  "events",
  "files",
  "clients",
  "templates",
] as const;

export function bytesRespaldo(base64: string) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export async function hashRespaldo(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer,
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function validarRespaldo(valor: unknown): Promise<Respaldo> {
  const copia = valor as Respaldo;
  if (
    copia?.format !== "trazo-company" ||
    copia.version !== 1 ||
    !copia.metadata ||
    !Array.isArray(copia.files)
  )
    throw new Error("El formato del respaldo no es compatible.");
  const company = copia.metadata.company as { id?: string; logo_path?: string };
  if (
    !company?.id ||
    !tablasRespaldo.every((tabla) => Array.isArray(copia.metadata[tabla]))
  )
    throw new Error("El respaldo tiene tablas incompletas.");
  if (
    new TextEncoder().encode(JSON.stringify(copia.metadata)).length >
      30_000_000 ||
    (copia.metadata.tasks as unknown[]).length > 10_000 ||
    (copia.metadata.profiles as unknown[]).length > 2_000 ||
    (copia.metadata.files as unknown[]).length > 10_000
  ) {
    throw new Error(
      "El respaldo supera los límites de recuperación de esta versión.",
    );
  }
  for (const tabla of tablasRespaldo) {
    if (
      (copia.metadata[tabla] as FilaRespaldo[]).some(
        (f) => f.company_id !== company.id,
      )
    )
      throw new Error("El respaldo mezcla empresas.");
  }
  const esperados = new Set(
    (copia.metadata.files as FilaRespaldo[]).map((f) => `tareas/${f.path}`),
  );
  if (company.logo_path) esperados.add(`empresas/${company.logo_path}`);
  if (copia.files.length !== esperados.size)
    throw new Error("Faltan archivos en el respaldo.");
  for (const archivo of copia.files) {
    const clave = `${archivo.bucket}/${archivo.path}`;
    if (
      !esperados.delete(clave) ||
      typeof archivo.data !== "string" ||
      !["image/jpeg", "application/pdf"].includes(archivo.mime)
    )
      throw new Error("La lista de archivos no es válida.");
    if ((await hashRespaldo(bytesRespaldo(archivo.data))) !== archivo.sha256)
      throw new Error(
        `El archivo ${archivo.path} no pasó la comprobación de integridad.`,
      );
  }
  return copia;
}
