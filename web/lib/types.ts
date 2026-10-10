export type Role = "clerk" | "investigator" | "process-builder" | "auditor";

export interface DocFile {
  doc_id: string;
  path: string;
  /** text: inline UTF-8. image/pdf: base64 in `data`. other: not readable by the model. */
  kind: "text" | "image" | "pdf" | "other";
  text?: string;
  mime?: string;
  data?: string;
  truncated?: boolean;
}

export interface AgentRequest {
  role: Role;
  mode?: "build" | "repair";
  asOf: string;
  ownerPrompt?: string;
  files?: DocFile[];
  manifest?: unknown;
  matrix?: unknown;
  process?: unknown;
  previousAudit?: unknown;
  round?: number;
  /** repair: the owner's current file and the exact items to fix */
  current?: unknown;
  issues?: unknown[];
}

export interface AgentResponse {
  ok: true;
  json: unknown;
  ms: number;
  model: string;
  usage?: { promptTokens?: number; outputTokens?: number };
}
export interface AgentError {
  ok: false;
  error: string;
  code: "BAD_REQUEST" | "UNAUTHORIZED" | "NO_KEY" | "QUOTA" | "UPSTREAM" | "BAD_JSON";
}

export const AGENT_META: Record<Role, { id: string; name: string; job: string }> = {
  clerk: { id: "halalpilot-evidence-clerk", name: "Evidence Clerk", job: "Reads every file into a cited case manifest" },
  investigator: {
    id: "halalpilot-ingredient-investigator",
    name: "Ingredient Investigator",
    job: "Ingredient ↔ supplier ↔ certificate, risk screen",
  },
  "process-builder": {
    id: "halalpilot-process-builder",
    name: "Process Builder",
    job: "Process flows, SOP drafts, missing documents",
  },
  auditor: { id: "halalpilot-mock-auditor", name: "Mock Auditor", job: "Strict independent audit of the pack" },
};
export const ROLE_BY_AGENT_ID: Record<string, Role> = Object.fromEntries(
  (Object.entries(AGENT_META) as [Role, { id: string }][]).map(([r, m]) => [m.id, r]),
);
