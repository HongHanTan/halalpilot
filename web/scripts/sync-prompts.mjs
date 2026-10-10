// Builds web/prompts/bundle.json from the WorkBuddy plugin so the plugin stays the single source of truth.
// The bundle is committed: if the plugin folder is not reachable at build time, the existing bundle is used.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const plugin = resolve(here, "..", "..", "halalpilot");
const out = resolve(here, "..", "prompts", "bundle.json");

if (!existsSync(join(plugin, "agents"))) {
  console.log("sync-prompts: plugin folder not found, keeping committed bundle");
  process.exit(0);
}

const body = (file) => {
  const t = readFileSync(file, "utf8").replace(/^﻿/, "");
  const m = t.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return (m ? t.slice(m[0].length) : t).trim();
};
const text = (file) => readFileSync(file, "utf8").replace(/^﻿/, "").trim();

const agent = (name) => body(join(plugin, "agents", `halalpilot-${name}.md`));
const proto = join(plugin, "skills", "halal-evidence-protocol");
const pack = join(plugin, "skills", "halal-readiness-pack");

const bundle = {
  agents: {
    clerk: agent("evidence-clerk"),
    investigator: agent("ingredient-investigator"),
    "process-builder": agent("process-builder"),
    auditor: agent("mock-auditor"),
  },
  protocol: body(join(proto, "SKILL.md")),
  references: {
    riskIngredients: text(join(proto, "references", "risk-ingredients.md")),
    documentChecklist: text(join(proto, "references", "document-checklist.md")),
  },
  templates: {
    manifest: text(join(pack, "templates", "case-manifest.template.json")),
    matrix: text(join(pack, "templates", "ingredient-matrix.template.json")),
    process: text(join(pack, "templates", "process-pack.template.json")),
    audit: text(join(pack, "templates", "audit-report.template.json")),
  },
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(bundle, null, 2) + "\n");
console.log(`sync-prompts: wrote ${out}`);
