import { NextResponse } from "next/server";
import { callGemini, GeminiError, modelName } from "@/lib/gemini";
import { buildParts, systemPrompt, thinkingBudget } from "@/lib/prompts";
import type { AgentError, AgentRequest, AgentResponse, Role } from "@/lib/types";

// Each call is one agent phase. Needs Fluid Compute (Hobby default max 300s). Lower to 60 if the plan requires it.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ROLES: Role[] = ["clerk", "investigator", "process-builder", "auditor"];
const MAX_FILES = 80;

function fail(error: string, code: AgentError["code"], status: number) {
  return NextResponse.json<AgentError>({ ok: false, error, code }, { status });
}

export async function POST(req: Request) {
  const required = process.env.ACCESS_CODE;
  if (required && req.headers.get("x-access-code") !== required) return fail("Access code required", "UNAUTHORIZED", 401);

  let body: AgentRequest;
  try {
    body = (await req.json()) as AgentRequest;
  } catch {
    return fail("Body must be JSON", "BAD_REQUEST", 400);
  }
  if (!ROLES.includes(body.role)) return fail("Unknown role", "BAD_REQUEST", 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.asOf ?? "")) return fail("asOf must be YYYY-MM-DD", "BAD_REQUEST", 400);
  if ((body.files?.length ?? 0) > MAX_FILES) return fail(`At most ${MAX_FILES} files`, "BAD_REQUEST", 400);
  const mode = body.mode ?? "build";
  if (body.role === "clerk" && !body.files?.length) return fail("clerk needs files", "BAD_REQUEST", 400);
  if (body.role !== "clerk" && !body.manifest) return fail("manifest is required", "BAD_REQUEST", 400);
  if (mode === "repair" && (!body.current || !body.issues?.length)) return fail("repair needs current + issues", "BAD_REQUEST", 400);

  const t0 = Date.now();
  try {
    const { json, usage } = await callGemini({
      system: systemPrompt(body.role),
      parts: buildParts(body),
      thinkingBudget: thinkingBudget(body.role, mode),
    });
    return NextResponse.json<AgentResponse>({ ok: true, json, ms: Date.now() - t0, model: modelName(), usage });
  } catch (e) {
    if (e instanceof GeminiError) {
      const status = e.code === "NO_KEY" ? 500 : e.code === "QUOTA" ? 429 : 502;
      return fail(e.message, e.code, status);
    }
    return fail(String((e as Error)?.message ?? e).slice(0, 300), "UPSTREAM", 502);
  }
}
