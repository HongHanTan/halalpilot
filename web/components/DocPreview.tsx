"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import type { DocFile } from "@/lib/types";

const fileName = (p: string) => p.split("/").pop() ?? p;
const folder = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

function Thumb({ f }: { f: DocFile }) {
  if (f.kind === "image" && f.data) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="doc-thumb-img" src={`data:${f.mime ?? "image/jpeg"};base64,${f.data}`} alt="" />;
  }
  if (f.kind === "text" && f.text) return <pre className="doc-thumb-text">{f.text.slice(0, 260)}</pre>;
  return <div className="doc-thumb-ico">{f.kind === "pdf" ? "PDF" : "FILE"}</div>;
}

/** Swipeable strip of the uploaded files. Click one to open it. */
export function DocCarousel({ files, onOpen }: { files: DocFile[]; onOpen: (f: DocFile) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const by = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <div className="carousel">
      <div className="carousel-head">
        <span>{files.length} files — swipe to preview</span>
        <span className="carousel-nav">
          <button type="button" className="btn small" onClick={() => by(-1)} aria-label="Scroll left">
            ‹
          </button>
          <button type="button" className="btn small" onClick={() => by(1)} aria-label="Scroll right">
            ›
          </button>
        </span>
      </div>
      <div className="carousel-track" ref={ref} tabIndex={0}>
        {files.map((f) => (
          <button type="button" className="doc-card" key={f.doc_id} onClick={() => onOpen(f)} title={f.path}>
            <div className="doc-thumb">
              <Thumb f={f} />
            </div>
            <div className="doc-name">{fileName(f.path)}</div>
            <div className="doc-folder">{folder(f.path) || "—"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Accepts ISO (2026-07-31) and returns the spellings a certificate might use. */
function dateForms(iso?: string | null): string[] {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso ? [iso] : [];
  const [, y, mo, d] = m;
  const dn = String(Number(d));
  const mn = String(Number(mo));
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const ms = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(mo) - 1];
  const ml = months[Number(mo) - 1];
  const out = new Set<string>();
  for (const sep of ["/", "-", "."]) {
    out.add(`${d}${sep}${mo}${sep}${y}`);
    out.add(`${dn}${sep}${mn}${sep}${y}`);
  }
  out.add(m[0]);
  out.add(`${dn} ${ml} ${y}`);
  out.add(`${d} ${ml} ${y}`);
  out.add(`${dn} ${ms} ${y}`);
  out.add(`${ml} ${dn}, ${y}`);
  return [...out].sort((a, b) => b.length - a.length);
}

function splitHighlight(text: string, forms: string[]): { t: string; hit: boolean }[] {
  if (!forms.length) return [{ t: text, hit: false }];
  const re = new RegExp(`(${forms.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text
    .split(re)
    .filter((t) => t !== "")
    .map((t) => ({ t, hit: forms.some((f) => f.toLowerCase() === t.toLowerCase()) }));
}

export interface Mark {
  /** ISO date to find and highlight in the text. */
  date?: string | null;
  /** Banner shown above the document, e.g. "Expired on 31 Jul 2026". */
  note?: string;
  /** The certificate as a picture (data URL or static path). Shown instead of the text when it loads. */
  imageSrc?: string;
  /** Where the expiry date sits on that picture, as fractions [left, top, width, height]. */
  box?: [number, number, number, number];
}

/** Known expiry-date positions on the bundled demo certificate scans, by file stem. */
export const CERT_BOX: Record<string, [number, number, number, number]> = {
  "sijil-halal-seri-wangi": [0.225, 0.688, 0.26, 0.064],
};


const EXPIRY_LINE = /tamat|expir|sah laku|valid (until|to)|berkuat/i;

/** Draws a text certificate as a paper-style JPG, with the expiry date boxed and highlighted. */
function renderCertJpg(text: string, date: string | null | undefined, expired: boolean): string | null {
  try {
    const forms = dateForms(date);
    const W = 960;
    const pad = 56;
    const font = "20px ui-monospace, Consolas, 'Courier New', monospace";
    const lh = 34;
    const measure = document.createElement("canvas").getContext("2d");
    if (!measure) return null;
    measure.font = font;
    // wrap long lines
    const rows: string[] = [];
    for (const raw of text.split("\n")) {
      if (measure.measureText(raw).width <= W - pad * 2) {
        rows.push(raw);
        continue;
      }
      let cur = "";
      for (const w of raw.split(" ")) {
        if (cur && measure.measureText(`${cur} ${w}`).width > W - pad * 2) {
          rows.push(cur);
          cur = w;
        } else cur = cur ? `${cur} ${w}` : w;
      }
      rows.push(cur);
    }
    const H = pad * 2 + rows.length * lh + 30;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#fbf7ea";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#1c5d46";
    g.lineWidth = 6;
    g.strokeRect(16, 16, W - 32, H - 32);
    g.lineWidth = 2;
    g.strokeRect(26, 26, W - 52, H - 52);
    g.font = font;
    g.textBaseline = "middle";
    const anyExact = rows.some((r) => forms.some((f) => r.toLowerCase().includes(f.toLowerCase())));
    rows.forEach((row, i) => {
      const y = pad + i * lh + lh / 2;
      const sample = row.startsWith("***");
      g.fillStyle = sample ? "#a33" : "#1d2b24";
      g.font = sample ? "italic 15px sans-serif" : font;
      let ranges: [number, number][] = [];
      const low = row.toLowerCase();
      for (const f of forms) {
        const at = low.indexOf(f.toLowerCase());
        if (at >= 0 && !ranges.some(([a, b]) => at < b && at + f.length > a)) ranges.push([at, at + f.length]);
      }
      if (!anyExact && date && EXPIRY_LINE.test(row)) {
        const colon = row.indexOf(":");
        ranges = [[colon >= 0 ? colon + 1 : 0, row.length]];
      }
      ranges.sort((a, b) => a[0] - b[0]);
      let x = pad;
      let at = 0;
      const draw = (t: string, hit: boolean) => {
        if (!t) return;
        const w = g.measureText(t).width;
        if (hit) {
          const trimmed = t.trim();
          const lead = g.measureText(t.slice(0, t.length - t.trimStart().length)).width;
          const bw = g.measureText(trimmed).width;
          g.fillStyle = "#ffe14d";
          g.fillRect(x + lead - 8, y - 17, bw + 16, 34);
          g.strokeStyle = "#c4261c";
          g.lineWidth = 3;
          g.strokeRect(x + lead - 8, y - 17, bw + 16, 34);
          g.fillStyle = "#7a0c06";
          g.font = "bold 20px ui-monospace, Consolas, monospace";
          g.fillText(t, x, y);
          g.font = font;
          x += g.measureText(t).width;
          g.fillStyle = "#1d2b24";
        } else {
          g.fillText(t, x, y);
          x += w;
        }
      };
      for (const [a, b] of ranges) {
        draw(row.slice(at, a), false);
        draw(row.slice(a, b), true);
        at = b;
      }
      draw(row.slice(at), false);
    });
    if (expired) {
      g.save();
      g.translate(W - 210, H - 120);
      g.rotate(-0.22);
      g.strokeStyle = "rgba(196,38,28,.85)";
      g.fillStyle = "rgba(196,38,28,.85)";
      g.lineWidth = 6;
      g.strokeRect(-110, -34, 220, 68);
      g.font = "bold 40px sans-serif";
      g.textAlign = "center";
      g.fillText("EXPIRED", 0, 2);
      g.restore();
    }
    return c.toDataURL("image/jpeg", 0.92);
  } catch {
    return null;
  }
}

export function DocModal({ file, mark, onClose }: { file: DocFile; mark?: Mark; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const [jpg, setJpg] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setJpg(file.kind === "text" && mark?.date ? renderCertJpg(file.text ?? "", mark.date, /^expired/i.test(mark.note ?? "")) : null);
  }, [file, mark?.date, mark?.note]);
  const forms = dateForms(mark?.date);
  const lines = (file.text ?? "").split("\n");
  // If the exact date isn't written in a recognisable format, fall back to the "expiry" line.
  const anyHit = lines.some((l) => splitHighlight(l, forms).some((p) => p.hit));
  const expiryLine = EXPIRY_LINE;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={file.path} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{fileName(file.path)}</div>
            <div className="modal-sub">
              {file.doc_id} · {file.path}
            </div>
          </div>
          <button type="button" className="btn small" onClick={onClose} aria-label="Close preview">
            ✕
          </button>
        </div>
        {mark?.note && <div className="modal-note">{mark.note}</div>}
        <div className="modal-body">
          {file.kind === "image" && file.data ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="modal-img" src={`data:${file.mime ?? "image/jpeg"};base64,${file.data}`} alt={fileName(file.path)} />
          ) : mark?.imageSrc && !imgFailed ? (
            <div className="cert-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="modal-img cert-jpg" src={mark.imageSrc} alt={`${fileName(file.path)} scan`} onError={() => setImgFailed(true)} />
              {mark.box && (
                <div className="cert-hl" style={{ left: `${mark.box[0] * 100}%`, top: `${mark.box[1] * 100}%`, width: `${mark.box[2] * 100}%`, height: `${mark.box[3] * 100}%` }}>
                  <span>{mark.note ?? "Expiry date"}</span>
                </div>
              )}
            </div>
          ) : jpg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="modal-img cert-jpg" src={jpg} alt={`${fileName(file.path)} with the expiry date highlighted`} />
          ) : file.kind === "text" ? (
            <div className="paper">
              {lines.map((line, i) => {
                const parts = splitHighlight(line, forms);
                const lineHit = !anyHit && !!mark?.date && expiryLine.test(line);
                return (
                  <div className={`paper-line ${lineHit ? "hit-line" : ""}`} key={i}>
                    {parts.map((p, j) => (
                      <Fragment key={j}>{p.hit ? <mark className="hit">{p.t}</mark> : p.t}</Fragment>
                    ))}
                    {"​"}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">This file type can&apos;t be previewed here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
