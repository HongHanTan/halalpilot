// Demo safety net: replays one recorded run through the real orchestrator.
// Only the transport is faked — steps, parallelism, the repair loop, the validator and the pack
// builder all execute for real, so the screen behaves exactly as it does live.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DocFile, Role } from "./types";

export interface Recording {
  case: string;
  recordedAt: string;
  model: string;
  files: DocFile[];
  inventory: string[];
  outputs: Partial<Record<Role, any>>;
  /** Per-role think time, so the replay keeps the rhythm of the live run. */
  ms?: Partial<Record<Role, number>>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A fetch-shaped transport that answers /api/agent from a recording.
 * `speed` scales the recorded durations (0.25 = four times faster than live).
 */
export function replayFetch(rec: Recording, speed = 0.25): typeof fetch {
  return (async (_url: any, init?: any) => {
    const body = JSON.parse(init.body) as { role: Role; mode?: string };
    const out = rec.outputs[body.role];
    const wait = Math.max(450, (rec.ms?.[body.role] ?? 12_000) * speed);
    await sleep(body.mode === "repair" ? wait / 2 : wait);
    if (!out) {
      return {
        ok: false,
        status: 502,
        json: async () => ({ ok: false, error: `no recorded output for ${body.role}`, code: "UPSTREAM" }),
      } as any;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, json: JSON.parse(JSON.stringify(out)), ms: wait, model: `${rec.model} (replay)` }),
    } as any;
  }) as unknown as typeof fetch;
}

export async function loadRecording(): Promise<Recording> {
  const res = await fetch("/demo/recorded-run.json");
  if (!res.ok) throw new Error("No recorded run is bundled with this deployment.");
  return res.json();
}
