/** Una misma persona puede reintentar el mismo contenido tras recargar la página. */
export async function rutaArchivo(
  tarea: string,
  perfil: string,
  blob: Blob,
  tipo: string,
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  const hash = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `${tarea}/${perfil}-${hash}.${tipo === "application/pdf" ? "pdf" : "jpg"}`;
}
