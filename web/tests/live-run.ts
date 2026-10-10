// Live end-to-end run against a dev server: real Gemini calls, real /api/agent, real orchestrator.
//   1) npm run dev          (in another terminal)
//   2) npx tsx tests/live-run.ts [path-to-case-folder]
// Writes the outputs to .live-run/ and checks them against demo_dataset/ANSWER-KEY.md expectations.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { runPipeline, type RunState, type Step } from "../lib/orchestrator";
import type { DocFile } from "../lib/types";

const BASE = process.env.LIVE_BASE ?? "http://localhost:3000";
const ROOT = resolve(__dirname, "..", "..");
const CASE = resolve(process.argv[2] ?? join(ROOT, "demo_dataset/sambal-mak-embun"));
const OUT = join(resolve(__dirname, ".."), ".live-run");

const TEXT = new Set([".txt", ".md", ".csv", ".json", ".html", ".xml", ".yaml", ".yml"]);
const IMAGE: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function walk(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir).sort()) {
    if (n.startsWith(".") || n === "halalpilot-output") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p).split("\\").join("/"));
  }
  return out;
}

const inventory = walk(CASE, CASE);
const files: DocFile[] = inventory.map((path, i) => {
  const doc_id = `DOC-${String(i + 1).padStart(3, "0")}`;
  const e = extname(path).toLowerCase();
  if (TEXT.has(e)) {
    const text = readFileSync(join(CASE, path), "utf8").replace(/^\uFEFF/, "");
    return { doc_id, path, kind: "text", text: text.slice(0, 20_000), truncated: text.length > 20_000 };
  }
  if (IMAGE[e]) return { doc_id, path, kind: "image", mime: IMAGE[e], data: readFileSync(join(CASE, path)).toString("base64") };
  if (e === ".pdf") return { doc_id, path, kind: "pdf", mime: "application/pdf", data: readFileSync(join(CASE, path)).toString("base64") };
  return { doc_id, path, kind: "other" };
});

// The orchestrator fetches the relative "/api/agent"; point that at the dev server.
const realFetch = globalThis.fetch;
(globalThis as any).fetch = (url: any, init?: any) =>
  realFetch(typeof url === "string" && url.startsWith("/") ? BASE + url : url, init);

const seen = new Set<string>();
function progress(s: RunState) {
  for (const st of s.steps) {
    const key = `${st.id}:${st.status}`;
    if (seen.has(key) || st.status === "pending") continue;
    seen.add(key);
    const t = st.ms !== undefined ? ` (${(st.ms / 1000).toFixed(1)}s)` : "";
    console.log(`  [${st.status.padEnd(7)}] ${st.actor.padEnd(16)} ${st.label.slice(0, 72)}${t}${st.note ? ` :: ${st.note}` : ""}`);
  }
}

async function main() {
  console.log(`case: ${CASE}`);
  console.log(`files: ${files.length} (${files.filter((f) => f.kind === "text").length} text, ${files.filter((f) => f.kind === "image").length} image)`);
  try {
    const ping = await realFetch(`${BASE}/api/agent`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (ping.status === 401) console.log("note: ACCESS_CODE is set on the server; export LIVE_ACCESS_CODE to match it");
  } catch {
    console.error(`Cannot reach ${BASE}. Start the dev server first:  npm run dev`);
    process.exit(2);
  }

  const t0 = Date.now();
  const state = await runPipeline(
    {
      files,
      inventory,
      ownerPrompt: process.env.LIVE_PROMPT ?? "Get me ready for halal certification.",
      accessCode: process.env.LIVE_ACCESS_CODE,
    },
    progress,
  );
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  mkdirSync(OUT, { recursive: true });
  const write = (n: string, v: unknown) => writeFileSync(join(OUT, n), typeof v === "string" ? v : JSON.stringify(v, null, 2) + "\n", "utf8");
  if (state.data.manifest) write("01-case-manifest.json", state.data.manifest);
  if (state.data.matrix) write("02-ingredient-matrix.json", state.data.matrix);
  if (state.data.process) write("03-process-pack.json", state.data.process);
  if (state.data.audit) write("04-audit-report.json", state.data.audit);
  if (state.repairLog) write("05-repair-log.json", state.repairLog);
  if (state.validation) write("validation-report.json", state.validation);
  if (state.pack) write("READINESS-PACK.md", state.pack);

  const rd = state.validation?.readiness;
  console.log(`\n--- run finished in ${secs}s ---`);
  if (state.error) console.log(`error: ${state.error}`);
  console.log(`validator: ${state.validation?.passed ? "PASS" : "FAIL"} — ${state.validation?.errors.length ?? "?"} error(s)`);
  console.log(`readiness: ${rd?.status} score ${rd?.score}/100, blockers ${rd?.blockers.total}`);
  console.log(`verdicts : ${JSON.stringify(rd?.verdict_counts ?? {})}`);
  console.log(`audit    : ${state.auditAvailable ? `${(state.data.audit as any)?.verdict} with ${((state.data.audit as any)?.findings ?? []).length} finding(s)` : "not available"}`);
  console.log(`repairs  : ${state.repairLog?.rounds.length ?? 0} round(s), stopped: ${state.repairLog?.stopped_because}`);
  console.log(`outputs  : ${OUT}`);

  if (basename(CASE) === "sambal-mak-embun") {
    console.log("\n--- against demo_dataset/ANSWER-KEY.md ---");
    const rows: any[] = (state.data.matrix as any)?.rows ?? [];
    const findText = (re: RegExp) => rows.filter((r) => re.test(`${r.ingredient ?? ""}`));
    const verdicts = (re: RegExp) => findText(re).map((r) => `${r.ingredient}=${r.verdict}/${r.risk_level}`);
    const has = (re: RegExp, v: string) => findText(re).some((r) => r.verdict === v);
    const chk = (name: string, cond: boolean, detail: string) => console.log(`${cond ? "ok  " : "MISS"} ${name}  ${detail}`);
    chk("1 chilli cert expired", has(/cili|chilli|chili/i, "EXPIRED"), verdicts(/cili|chilli|chili/i).join(", ") || "no row matched");
    chk("2 dried shrimp mismatch", has(/udang/i, "MISMATCH"), verdicts(/udang/i).join(", ") || "no row matched");
    chk(
      "3 chicken flavour no cert + HIGH",
      findText(/perisa|flavou?r/i).some((r) => r.verdict === "NO_CERT" && r.risk_level === "HIGH"),
      verdicts(/perisa|flavou?r/i).join(", ") || "no row matched",
    );
    const sopText = JSON.stringify(state.data.process ?? {}) + JSON.stringify(state.data.audit ?? {});
    chk("4 missing SOP-03 cleaning", /SOP-03|sanitasi|sanitation|cleaning/i.test(sopText), "mentioned in process pack or audit");
    chk("status NOT_READY", rd?.status === "NOT_READY", String(rd?.status));
    chk("score 65-85", (rd?.score ?? 0) >= 65 && (rd?.score ?? 0) <= 85, String(rd?.score));
    chk("validator clean", (state.validation?.errors.length ?? 1) === 0, `${state.validation?.errors.length} error(s)`);
    const reqs = ((state.data.matrix as any)?.supplier_requests ?? []).length;
    chk("supplier drafts >= 3", reqs >= 3, `${reqs} draft(s)`);
  }

  const failed = state.steps.filter((s: Step) => s.status === "failed");
  if (failed.length) console.log(`\n${failed.length} step(s) failed: ${failed.map((s) => `${s.actor}: ${s.note}`).join(" | ")}`);
  process.exit(state.error ? 1 : 0);
}

void main();
