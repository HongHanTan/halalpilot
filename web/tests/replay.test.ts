// Proves the labelled replay produces a complete run with no network access.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runPipeline } from "../lib/orchestrator";
import { replayFetch, type Recording } from "../lib/replay";

const rec: Recording = JSON.parse(readFileSync(resolve(__dirname, "..", "public", "demo", "recorded-run.json"), "utf8"));

// Any real network call is a bug: the replay must be self-contained.
(globalThis as any).fetch = () => {
  throw new Error("replay must not touch the network");
};

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond || !detail ? "" : `  — ${detail}`}`);
  if (!cond) failures++;
};

async function main() {
  const t0 = Date.now();
  const s = await runPipeline(
    {
      files: rec.files,
      inventory: rec.inventory,
      ownerPrompt: "Get me ready for halal certification.",
      fetchImpl: replayFetch(rec, 0.02), // fast-forward for the test
    },
    () => {},
  );
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  check("no error", !s.error, s.error ?? "");
  check("all four agents produced a file", !!(s.data.manifest && s.data.matrix && s.data.process && s.data.audit));
  check("validator ran clean", (s.validation?.errors.length ?? 1) === 0, JSON.stringify(s.validation?.errors.slice(0, 2)));
  check("readiness NOT_READY", s.validation?.readiness?.status === "NOT_READY", String(s.validation?.readiness?.status));
  check("score 65-85", (s.validation?.readiness?.score ?? 0) >= 65 && (s.validation?.readiness?.score ?? 0) <= 85, String(s.validation?.readiness?.score));
  check("pack built", !!s.pack && s.pack.includes("Ingredient X-ray"));
  check("no step failed", s.steps.every((x) => x.status === "done"), s.steps.filter((x) => x.status !== "done").map((x) => `${x.actor}:${x.note}`).join(" | "));
  check("parallel groups preserved", s.steps.filter((x) => x.group.startsWith("Phase 2")).length === 2);
  check("audit present", s.auditAvailable && ((s.data.audit as any)?.findings ?? []).length > 0);

  const rows: any[] = (s.data.matrix as any)?.rows ?? [];
  const has = (re: RegExp, v: string) => rows.some((r) => re.test(r.ingredient ?? "") && r.verdict === v);
  check("x-ray data: chilli EXPIRED", has(/cili/i, "EXPIRED"));
  check("x-ray data: udang MISMATCH", has(/udang/i, "MISMATCH"));
  check("x-ray data: perisa NO_CERT", has(/perisa/i, "NO_CERT"));
  const verified = rows.filter((r) => r.verdict === "VERIFIED").length;
  check("distributor brand certs still VERIFIED", verified >= 6, `${verified} verified`);

  console.log(`\nreplay finished in ${secs}s (fast-forwarded)`);
  console.log(failures ? `${failures} failure(s)` : "replay: all checks passed");
  process.exit(failures ? 1 : 0);
}

void main();
