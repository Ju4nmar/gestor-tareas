"use client";

import {
  datosRespaldo,
  enOperacion,
  informarOperacion,
  recargar,
  recargarAcceso,
  seleccionarEmpresa,
} from "./store";
import { supabase } from "./supabase";
import {
  bytesRespaldo,
  hashRespaldo,
  validarRespaldo,
  type FilaRespaldo,
  type Respaldo,
} from "./respaldo-formato";

function base64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("No se pudo leer un archivo."));
    reader.readAsDataURL(blob);
  });
}

export async function descargarRespaldo() {
  try {
    const blob = await enOperacion(async () => {
      informarOperacion("Preparando respaldo de empresa…");
      const metadata = await datosRespaldo();
      const company = metadata.company as { id: string; logo_path?: string };
      const archivos = (metadata.files as FilaRespaldo[]).map((f) => ({
        bucket: "tareas",
        path: String(f.path),
        mime: String(f.mime),
        url: f.url as string | undefined,
        fila: f,
      }));
      if (company.logo_path)
        archivos.push({
          bucket: "empresas",
          path: company.logo_path,
          mime: "image/jpeg",
          url: undefined,
          fila: {},
        });
      const files: Respaldo["files"] = [];
      for (const [indice, archivo] of archivos.entries()) {
        informarOperacion(
          `Respaldo · descargando archivo ${indice + 1} de ${archivos.length}`,
        );
        let data: Blob;
        if (archivo.url) {
          const response = await fetch(archivo.url);
          if (!response.ok)
            throw new Error("No se pudo descargar una fotografía de la demo.");
          data = await response.blob();
        } else {
          const resultado = await supabase.storage
            .from(archivo.bucket)
            .download(archivo.path);
          if (resultado.error || !resultado.data)
            throw new Error(
              `No se pudo respaldar ${archivo.path}. Vuelve a intentarlo.`,
            );
          data = resultado.data;
        }
        archivo.fila.size = data.size;
        delete archivo.fila.url;
        files.push({
          bucket: archivo.bucket,
          path: archivo.path,
          mime: archivo.mime,
          sha256: await hashRespaldo(new Uint8Array(await data.arrayBuffer())),
          data: await base64(data),
        });
      }
      const copia: Respaldo = {
        format: "trazo-company",
        version: 1,
        created_at: new Date().toISOString(),
        metadata,
        files,
      };
      await validarRespaldo(copia);
      const json = new Blob([JSON.stringify(copia)], {
        type: "application/json",
      });
      if (json.size > 250 * 1024 * 1024) {
        throw new Error(
          "El respaldo supera el límite de 250 MB de recuperación desde el navegador.",
        );
      }
      return new Response(
        json.stream().pipeThrough(new CompressionStream("gzip")),
      ).blob();
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trazo-respaldo-${new Date().toISOString().slice(0, 10)}.json.gz`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } finally {
    informarOperacion(null);
  }
}

export async function abrirRespaldo(file: File) {
  informarOperacion("Validando archivos y comprobaciones de integridad…");
  try {
    const cabecera = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    const stream =
      cabecera[0] === 31 && cabecera[1] === 139
        ? file.stream().pipeThrough(new DecompressionStream("gzip"))
        : file.stream();
    const reader = stream.getReader();
    const partes: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 250 * 1024 * 1024) {
        await reader.cancel();
        throw new Error(
          "Este respaldo supera el límite de 250 MB de recuperación desde el navegador.",
        );
      }
      partes.push(value);
    }
    const contenido = new Uint8Array(total);
    let offset = 0;
    for (const parte of partes) {
      contenido.set(parte, offset);
      offset += parte.length;
    }
    return await validarRespaldo(
      JSON.parse(new TextDecoder().decode(contenido)),
    );
  } finally {
    informarOperacion(null);
  }
}

export async function restaurarRespaldo(copia: Respaldo) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Inicia sesión para recuperar una empresa.");
  const hash = await hashRespaldo(
    new TextEncoder().encode(JSON.stringify(copia.metadata)),
  );
  const clave = `trazo-recuperacion:${user.id}:${hash}`;
  let id = localStorage.getItem(clave);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(clave, id);
  }
  try {
    informarOperacion("Creando la empresa recuperada…");
    const plan = await enOperacion(async () => {
      const resultado = await supabase.rpc("tm_restore_company", {
        p_id: id,
        p_backup: copia.metadata,
      });
      if (resultado.error)
        throw new Error(
          "No se pudo recuperar la empresa. Revisa el respaldo y vuelve a intentarlo.",
        );
      return resultado.data as {
        company_id: string;
        finished: boolean;
        paths: { bucket: string; old_path: string; path: string }[];
      };
    });
    await recargarAcceso();
    await seleccionarEmpresa(plan.company_id);
    await enOperacion(async () => {
      if (!plan.finished) {
        for (const [indice, ruta] of plan.paths.entries()) {
          informarOperacion(
            `Recuperando archivo ${indice + 1} de ${plan.paths.length}…`,
          );
          const archivo = copia.files.find(
            (f) => f.bucket === ruta.bucket && f.path === ruta.old_path,
          );
          if (!archivo) throw new Error("Falta un archivo del respaldo.");
          const { error } = await supabase.storage
            .from(ruta.bucket)
            .upload(ruta.path, bytesRespaldo(archivo.data), {
              contentType: archivo.mime,
            });
          if (error && !/already exists|duplicate/i.test(error.message))
            throw new Error(
              "La recuperación quedó pendiente. Abre el mismo respaldo para reintentar.",
            );
        }
        const { error } = await supabase.rpc("tm_finish_restore", {
          p_id: plan.company_id,
        });
        if (error)
          throw new Error(
            "Faltan archivos por recuperar. Reintenta con el mismo respaldo.",
          );
      }
      await recargar();
    });
    localStorage.removeItem(clave);
  } finally {
    informarOperacion(null);
  }
}
