"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import type { DocFile } from "@/lib/types";
import { CERT_BOX, DocModal, type Mark } from "./DocPreview";

const PROBLEM = new Set(["EXPIRED", "MISMATCH", "NO_CERT", "NEEDS_REVIEW"]);
const ORDER: Record<string, number> = { EXPIRED: 0, MISMATCH: 1, NO_CERT: 2, NEEDS_REVIEW: 3, EXPIRING: 4, LOW_RISK_NO_CERT: 5, VERIFIED: 6 };

interface Link {
  label: string;
  main: string;
  sub?: string;
  state: "ok" | "bad" | "none";
  onOpen?: () => void;
}

function Chain({ links, breakAt }: { links: Link[]; breakAt: number }) {
  return (
    <div className="chain">
      {links.map((l, i) => (
        <div className="chain-cell" key={l.label}>
          {i > 0 && (
            <span className={`chain-link ${i === breakAt ? "broken" : ""}`} aria-hidden="true">
              {i === breakAt ? "✕" : ""}
            </span>
          )}
          {(() => {
            const inner = (
              <>
                <div className="chain-label">{l.label}</div>
                <div className="chain-main">{l.main}</div>
                {l.sub && <div className="chain-sub">{l.sub}</div>}
                {l.onOpen && <div className="chain-open">View document ↗</div>}
              </>
            );
            return l.onOpen ? (
              <button type="button" className={`chain-box ${l.state} clickable`} onClick={l.onOpen}>
                {inner}
              </button>
            ) : (
              <div className={`chain-box ${l.state}`}>{inner}</div>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

export default function EvidenceChain({ manifest, matrix, files = [] }: { manifest: any; matrix: any; files?: DocFile[] }) {
  const [problemsOnly, setProblemsOnly] = useState(false);
  // The certificate scan: a same-named image in the uploaded folder, else the bundled demo scan.
  const stem = (f: DocFile) => (f.path.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
  const scanOf = (f: DocFile) => {
    const img = files.find((x) => x.kind === "image" && x.data && stem(x) === stem(f));
    return img ? `data:${img.mime ?? "image/jpeg"};base64,${img.data}` : `/demo/certs/${stem(f)}.jpg`;
  };
  const [open, setOpen] = useState<{ file: DocFile; mark: Mark } | null>(null);
  const rows: any[] = matrix?.rows ?? [];
  if (!rows.length) return null;

  const suppliers: any[] = manifest?.suppliers ?? [];
  const lines: any[] = manifest?.invoice_lines ?? [];
  const certs: any[] = manifest?.certificates ?? [];
  const products: any[] = manifest?.products ?? [];
  const ing = (id: string) => products.flatMap((p) => p.ingredients ?? []).find((x: any) => x.ingredient_id === id);
  const pName = (id?: string) => products.find((p) => p.product_id === id)?.name ?? id ?? "—";

  const problemCount = rows.filter((r) => PROBLEM.has(r.verdict)).length;
  const sorted = [...rows].sort((a, b) => (ORDER[a.verdict] ?? 9) - (ORDER[b.verdict] ?? 9));
  const shown = problemsOnly ? sorted.filter((r) => PROBLEM.has(r.verdict)) : sorted;

  return (
    <div className="card">
      <div className="xray-head">
        <div>
          <h2>Ingredient X-ray</h2>
          <p className="sub">
            Every ingredient followed from the recipe to a supplier&apos;s halal certificate. A broken link is a reason this application would be
            rejected.
          </p>
        </div>
        <button className="btn small" onClick={() => setProblemsOnly((v) => !v)}>
          {problemsOnly ? `Show all ${rows.length}` : `Problems only (${problemCount})`}
        </button>
      </div>

      {shown.map((r) => {
        const line = lines.find((l) => l.line_id === r.invoice_line_id);
        const sup = suppliers.find((s) => s.supplier_id === r.supplier_id);
        const cert = certs.find((c) => c.cert_id === r.cert_id);
        const bad = PROBLEM.has(r.verdict);
        const certFile = files.find((f) => f.doc_id === (cert?.doc_id ?? cert?.source));
        const expiry: string | undefined = r.cert_expiry ?? cert?.expiry_date ?? undefined;

        const links: Link[] = [
          {
            label: "Recipe",
            main: r.ingredient ?? ing(r.ingredient_id)?.name ?? r.ingredient_id,
            sub: pName(r.product_id),
            state: "ok",
          },
          {
            label: "Invoice",
            main: line ? (line.code ?? line.item ?? r.invoice_line_id) : "no purchase record",
            sub: line?.date,
            state: line ? "ok" : "none",
          },
          {
            label: "Supplier",
            main: sup?.name ?? "unknown",
            sub: line?.brand ?? undefined,
            state: sup ? "ok" : "none",
          },
          {
            label: "Certificate",
            main: cert?.certificate_no ?? (r.verdict === "LOW_RISK_NO_CERT" ? "none needed?" : "none in folder"),
            sub: r.cert_expiry ? `expires ${r.cert_expiry}` : undefined,
            state: cert ? (bad ? "bad" : "ok") : r.verdict === "LOW_RISK_NO_CERT" ? "none" : "bad",
            onOpen: certFile
              ? () =>
                  setOpen({
                    file: certFile,
                    mark: {
                      imageSrc: scanOf(certFile),
                      box: CERT_BOX[stem(certFile)],
                      date: expiry,
                      note: expiry ? (r.verdict === "EXPIRED" ? `EXPIRED on ${expiry}` : `Expiry date: ${expiry}`) : undefined,
                    },
                  })
              : undefined,
          },
        ];
        // Where the chain actually breaks: the first missing link, else the certificate.
        const breakAt = !line ? 1 : !sup ? 2 : bad ? 3 : -1;

        return (
          <div className={`xray-row ${bad ? "bad" : ""}`} key={r.ingredient_id}>
            <div className="xray-row-head">
              <span className="xray-name">{r.ingredient}</span>
              <span className={`v-chip r-${r.risk_level}`}>{r.risk_level} risk</span>
              <span className={`v-chip v-${r.verdict}`}>{r.verdict}</span>
            </div>
            <Chain links={links} breakAt={breakAt} />
            {r.match_basis && <div className="xray-why">{r.match_basis}</div>}
            {r.reason && <div className="xray-why">{r.reason}</div>}
            {bad && r.actions?.length > 0 && <div className="xray-fix">→ {r.actions[r.actions.length - 1]}</div>}
          </div>
        );
      })}
      {open && <DocModal file={open.file} mark={open.mark} onClose={() => setOpen(null)} />}
    </div>
  );
}
