// Parity test: the TS validator must agree with validate_pack.py (codes, pointers, owners, readiness).
// Run: npm test   (needs `py` or `python` on PATH)
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { validate, FILES, type Part } from "../lib/validate";

const ROOT = resolve(__dirname, "..", "..");
const SCRIPT = join(ROOT, "halalpilot/skills/halal-readiness-pack/scripts/validate_pack.py");
const PARTS = Object.keys(FILES) as Part[];

const rel = (base: string, p: string) => relative(base, p).split("\\").join("/");
function listAll(base: string, dir: string, skip: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (p === skip) continue;
    if (statSync(p).isDirectory()) out.push(...listAll(base, p, skip));
    else out.push(rel(base, p));
  }
  return out;
}

type Data = Partial<Record<Part, any>>;

function copyTree(src: string, dst: string, skipName: string) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    if (name === skipName) continue;
    const p = join(src, name);
    if (statSync(p).isDirectory()) copyTree(p, join(dst, name), skipName);
    else copyFileSync(p, join(dst, name));
  }
}

// Mirrors real use: outputs live in <case>/halalpilot-output.
function runPython(data: Data, caseDir: string): any {
  const tmp = mkdtempSync(join(tmpdir(), "hp-parity-"));
  try {
    const tmpCase = join(tmp, "case");
    copyTree(caseDir, tmpCase, "halalpilot-output");
    const out = join(tmpCase, "halalpilot-output");
    mkdirSync(out, { recursive: true });
    for (const part of PARTS) if (data[part]) writeFileSync(join(out, FILES[part]), JSON.stringify(data[part]));
    const outFile = join(tmp, "report.json");
    const bin = process.platform === "win32" ? "py" : "python3";
    try {
      execFileSync(bin, [SCRIPT, out, "--case-dir", tmpCase, "--out", outFile, "--quiet"], { stdio: "pipe" });
    } catch (e: any) {
      if (e.status !== 1) throw e; // 1 = integrity errors, expected
    }
    return JSON.parse(readFileSync(outFile, "utf8"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const norm = (r: any) => ({
  passed: r.passed,
  errors: r.errors.map((e: any) => `${e.code}|${e.file}|${e.pointer}|${e.owner}`).sort(),
  readiness: r.readiness && {
    status: r.readiness.status,
    score: r.readiness.score,
    components: r.readiness.components,
    verdict_counts: r.readiness.verdict_counts,
    blockers: r.readiness.blockers,
  },
});

const load = (dir: string): Data => {
  const d: Data = {};
  for (const part of PARTS) {
    try {
      d[part] = JSON.parse(readFileSync(join(dir, FILES[part]), "utf8").replace(/^\uFEFF/, ""));
    } catch {
      /* optional */
    }
  }
  return d;
};
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const cases: { name: string; dir: string; caseDir: string }[] = [
  { name: "sample-run", dir: join(ROOT, "tests/fixtures/sample-run"), caseDir: join(ROOT, "samples/kedai-sambal-contoh") },
  {
    name: "demo-run",
    dir: join(ROOT, "demo_dataset/sambal-mak-embun/halalpilot-output"),
    caseDir: join(ROOT, "demo_dataset/sambal-mak-embun"),
  },
];

const mutations: [string, (d: Data) => void][] = [
  ["none", () => {}],
  ["drop-audit", (d) => delete d.audit],
  ["drop-process", (d) => delete d.process],
  ["drop-matrix-row", (d) => d.matrix.rows.pop()],
  ["understate-risk", (d) => d.matrix.rows.forEach((r: any) => (r.risk_level = "LOW"))],
  ["bad-expiry", (d) => d.matrix.rows.forEach((r: any) => r.cert_expiry && (r.cert_expiry = "2099-01-01"))],
  ["all-verified", (d) => d.matrix.rows.forEach((r: any) => (r.verdict = "VERIFIED"))],
  ["unknown-source", (d) => (d.manifest.products[0].ingredients[0].source = "DOC-999")],
  ["drop-doc", (d) => d.manifest.documents.pop()],
  ["audit-pass-open-critical", (d) => d.audit && (d.audit.verdict = "PASS")],
  ["empty-actions", (d) => d.matrix.rows.forEach((r: any) => (r.actions = []))],
  ["flow-missing", (d) => d.process.flows.pop()],
];

let failures = 0;
for (const c of cases) {
  const base = load(c.dir);
  const skip = join(c.caseDir, "halalpilot-output");
  const inventory = listAll(c.caseDir, c.caseDir, skip);
  for (const [name, mutate] of mutations) {
    const data = clone(base);
    try {
      mutate(data);
    } catch {
      continue; // mutation does not apply to this fixture
    }
    const py = norm(runPython(data, c.caseDir));
    const ts = norm(validate({ ...data, inventory }));
    const same = JSON.stringify(py) === JSON.stringify(ts);
    console.log(`${same ? "ok  " : "FAIL"} ${c.name} / ${name}  (errors py=${py.errors.length} ts=${ts.errors.length})`);
    if (!same) {
      failures++;
      console.log("  python:", JSON.stringify(py).slice(0, 600));
      console.log("  ts    :", JSON.stringify(ts).slice(0, 600));
    }
  }
}
if (failures) {
  console.error(`${failures} parity failure(s)`);
  process.exit(1);
}
console.log("parity: all cases match");
