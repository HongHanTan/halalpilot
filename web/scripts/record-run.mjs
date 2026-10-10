// Builds public/demo/recorded-run.json from a completed .live-run/, for the labelled replay.
// Any missing agent output (e.g. the auditor) is fetched once from the dev server.
//   node scripts/record-run.mjs [baseUrl]
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, "..");
const CASE = resolve(web, "..", "demo_dataset", "sambal-mak-embun");
const LIVE = join(web, ".live-run");
const OUT = join(web, "public", "demo", "recorded-run.json");
const BASE = process.argv[2] ?? "http://localhost:3002";

const TEXT = new Set([".txt", ".md", ".csv", ".json", ".html", ".xml", ".yaml", ".yml"]);
const IMAGE = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function walk(dir, base) {
  const out = [];
  for (const n of readdirSync(dir).sort()) {
    if (n.startsWith(".") || n === "halalpilot-output") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p).split("\\").join("/"));
  }
  return out;
}

const inventory = walk(CASE, CASE);
const files = inventory.map((path, i) => {
  const doc_id = `DOC-${String(i + 1).padStart(3, "0")}`;
  const e = extname(path).toLowerCase();
  if (TEXT.has(e)) {
    const text = readFileSync(join(CASE, path), "utf8").replace(/^\uFEFF/, "");
    return { doc_id, path, kind: "text", text: text.slice(0, 20000), truncated: text.length > 20000 };
  }
  if (IMAGE[e]) return { doc_id, path, kind: "image", mime: IMAGE[e], data: readFileSync(join(CASE, path)).toString("base64") };
  return { doc_id, path, kind: "other" };
});

const read = (f) => (existsSync(join(LIVE, f)) ? JSON.parse(readFileSync(join(LIVE, f), "utf8")) : null);
const outputs = {
  clerk: read("01-case-manifest.json"),
  investigator: read("02-ingredient-matrix.json"),
  "process-builder": read("03-process-pack.json"),
  auditor: read("04-audit-report.json"),
};
for (const [k, v] of Object.entries(outputs)) if (!v) console.log(`missing: ${k}`);
if (!outputs.clerk || !outputs.investigator || !outputs["process-builder"]) {
  console.error("Need at least the clerk, investigator and process-builder outputs in .live-run/. Run tests/live-run.ts first.");
  process.exit(1);
}

// Fill a missing auditor (its request is large, so it is the one most likely to have failed).
if (!outputs.auditor) {
  console.log("fetching the auditor once from", BASE);
  const res = await fetch(`${BASE}/api/agent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      role: "auditor",
      asOf: outputs.clerk.as_of,
      round: 1,
      ownerPrompt: "Get me ready for halal certification.",
      manifest: outputs.clerk,
      matrix: outputs.investigator,
      process: outputs["process-builder"],
      files: files.filter((f) => f.kind === "text"),
    }),
  });
  const body = await res.json();
  if (!body.ok) {
    console.error("auditor call failed:", body.code, String(body.error).slice(0, 200));
    process.exit(1);
  }
  outputs.auditor = body.json;
  writeFileSync(join(LIVE, "04-audit-report.json"), JSON.stringify(body.json, null, 2) + "\n");
  console.log(`auditor: ${body.json.verdict}, ${(body.json.findings ?? []).length} findings`);
}

const recording = {
  case: "Sambal Mak Embun",
  recordedAt: new Date().toISOString().slice(0, 10),
  model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
  files,
  inventory,
  outputs,
  ms: { clerk: 29500, investigator: 19000, "process-builder": 28300, auditor: 24000 },
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(recording));
console.log(`wrote ${OUT} (${(JSON.stringify(recording).length / 1e6).toFixed(2)} MB)`);
