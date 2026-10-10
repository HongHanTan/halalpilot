// Browser-side intake: unzip, inventory, assign doc_ids, shrink photos. Nothing here touches the server.
import JSZip from "jszip";
import type { DocFile } from "./types";

export const LIMITS = {
  zipBytes: 15 * 1024 * 1024,
  files: 80,
  textChars: 20_000,
  imagePx: 1024,
  pdfBytes: 1_000_000,
  payloadBytes: 3_800_000,
};

const TEXT_EXT = new Set(["txt", "md", "csv", "tsv", "json", "html", "htm", "xml", "log", "yaml", "yml", "rtf"]);
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

export class IntakeError extends Error {}

export interface Intake {
  files: DocFile[];
  inventory: string[];
  caseName: string;
  counts: { text: number; image: number; pdf: number; other: number };
}

const ext = (p: string) => (p.split(".").pop() ?? "").toLowerCase();

async function shrinkImage(blob: Blob, maxPx: number, quality: number): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    const url = canvas.toDataURL("image/jpeg", quality);
    return url.slice(url.indexOf(",") + 1);
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

export async function readZip(blob: Blob): Promise<Intake> {
  if (blob.size > LIMITS.zipBytes) throw new IntakeError(`Zip is ${(blob.size / 1e6).toFixed(1)} MB. The limit is ${LIMITS.zipBytes / 1e6} MB.`);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(blob);
  } catch {
    throw new IntakeError("That file is not a valid .zip archive.");
  }

  const zipNames = Object.keys(zip.files).filter((n) => {
    if (zip.files[n].dir) return false;
    const parts = n.split("/");
    if (parts.some((p) => p.startsWith(".") || p === "__MACOSX")) return false;
    if (parts.includes("halalpilot-output")) return false;
    return true;
  });
  if (zipNames.length === 0) throw new IntakeError("The zip has no files in it.");
  if (zipNames.length > LIMITS.files) throw new IntakeError(`The zip has ${zipNames.length} files. The limit is ${LIMITS.files}.`);

  // Strip one shared top-level folder (e.g. "sambal-mak-embun/...").
  let caseName = "case";
  let strip = 0;
  const tops = new Set(zipNames.map((n) => n.split("/")[0]));
  if (tops.size === 1 && zipNames.every((n) => n.includes("/"))) {
    caseName = [...tops][0];
    strip = caseName.length + 1;
  }
  const entries = zipNames.map((zipName) => ({ rel: zipName.slice(strip), zipName }));
  entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  const files: DocFile[] = [];
  const counts = { text: 0, image: 0, pdf: 0, other: 0 };
  let payload = 0;
  let n = 0;
  for (const { rel, zipName } of entries) {
    n += 1;
    const doc_id = `DOC-${String(n).padStart(3, "0")}`;
    const e = ext(rel);
    const entry = zip.files[zipName];
    if (TEXT_EXT.has(e)) {
      const raw = await entry.async("string");
      const text = raw.replace(/^﻿/, "");
      const truncated = text.length > LIMITS.textChars;
      files.push({ doc_id, path: rel, kind: "text", text: truncated ? text.slice(0, LIMITS.textChars) : text, truncated });
      counts.text++;
      payload += Math.min(text.length, LIMITS.textChars);
    } else if (IMAGE_EXT.has(e)) {
      const blobImg = await entry.async("blob");
      const data = await shrinkImage(blobImg, LIMITS.imagePx, 0.78);
      if (data) {
        files.push({ doc_id, path: rel, kind: "image", mime: "image/jpeg", data });
        counts.image++;
        payload += data.length;
      } else {
        files.push({ doc_id, path: rel, kind: "other" });
        counts.other++;
      }
    } else if (e === "pdf") {
      const bytes = await entry.async("uint8array");
      if (bytes.length <= LIMITS.pdfBytes) {
        const data = toBase64(bytes);
        files.push({ doc_id, path: rel, kind: "pdf", mime: "application/pdf", data });
        counts.pdf++;
        payload += data.length;
      } else {
        files.push({ doc_id, path: rel, kind: "other" });
        counts.other++;
      }
    } else {
      files.push({ doc_id, path: rel, kind: "other" });
      counts.other++;
    }
  }

  if (counts.text + counts.pdf === 0) {
    throw new IntakeError("No readable documents found. Add recipes, invoices or certificates as .txt, .pdf or .md files.");
  }
  if (payload > LIMITS.payloadBytes) {
    throw new IntakeError(
      `The readable content is ${(payload / 1e6).toFixed(1)} MB, over the ${(LIMITS.payloadBytes / 1e6).toFixed(1)} MB demo limit. Remove large PDFs or photos and try again.`,
    );
  }
  return { files, inventory: files.map((f) => f.path), caseName, counts };
}

export async function fetchDemoZip(): Promise<Blob> {
  const res = await fetch("/demo/sambal-mak-embun.zip");
  if (!res.ok) throw new IntakeError("Could not load the demo case.");
  return res.blob();
}
