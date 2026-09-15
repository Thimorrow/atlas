"use client";

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export async function openNotebookPdf(data: ArrayBuffer) {
  const task = getDocument({ data: new Uint8Array(data), useSystemFonts: true });
  const document = await task.promise;
  return { document, destroy: () => task.destroy() };
}
