"use client";
import { useCallback, useRef, useState } from "react";
import { fetchDemoZip, IntakeError, readZip, type Intake } from "@/lib/intake";
import { localToday, runPipeline, type RunState } from "@/lib/orchestrator";
import Timeline from "@/components/Timeline";
import Results from "@/components/Results";

const DEFAULT_PROMPT = "Get me ready for halal certification.";

export default function Page() {
  const [intake, setIntake] = useState<Intake | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<RunState | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (blob: Blob, name: string) => {
    setError(null);
    setState(null);
    setReading(true);
    try {
      const res = await readZip(blob);
      setIntake(res);
      setFileName(name);
    } catch (e) {
      setIntake(null);
      setFileName("");
      setError(e instanceof IntakeError ? e.message : `Could not read that file: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setReading(false);
    }
  }, []);

  const onPick = (f?: File | null) => {
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) {
      setError("Please upload a .zip file containing your business folder.");
      return;
    }
    void load(f, f.name);
  };

  const useDemo = async () => {
    setReading(true);
    setError(null);
    try {
      const blob = await fetchDemoZip();
      await load(blob, "sambal-mak-embun.zip (demo)");
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setReading(false);
    }
  };

  const run = async () => {
    if (!intake) return;
    setBusy(true);
    setError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const final = await runPipeline(
        { files: intake.files, inventory: intake.inventory, ownerPrompt: prompt, accessCode: accessCode || undefined },
        setState,
        ac.signal,
      );
      if (final.error) setError(final.error);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const counts = intake?.counts;

  return (
    <div className="wrap">
      <header className="top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/avatars/halalpilot.png" alt="" />
        <div>
          <h1>HalalPilot</h1>
          <p>Halal certification readiness, from a messy folder to a submission pack.</p>
        </div>
      </header>

      <p className="hero">
        Drop in the folder you already have — recipes, supplier invoices, halal certificates, kitchen photos — and type one sentence. A team of five
        agents reads every file, traces each ingredient to a supplier certificate, drafts your processes, then <strong>audits its own work</strong> and
        repairs what fails. Every claim cites a file. Nothing is invented.
      </p>

      <div className="card">
        <h2>1. Your documents</h2>
        <p className="sub">One .zip of your business folder. Text, PDF and photos are read; up to 80 files, 15 MB.</p>

        {!intake ? (
          <div
            className={`drop ${over ? "over" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              onPick(e.dataTransfer.files?.[0]);
            }}
          >
            <div className="big">{reading ? "Reading your zip…" : "Drop your .zip here, or click to choose"}</div>
            <div className="small">Nothing is stored. Files are sent to the model only for this run.</div>
          </div>
        ) : (
          <div className="file-ok">
            <div>
              <div className="name">{fileName}</div>
              <div className="meta">
                {intake.files.length} files · {counts?.text} text · {counts?.image} photo · {counts?.pdf} pdf
                {counts?.other ? ` · ${counts.other} unreadable` : ""}
              </div>
            </div>
            <button
              className="btn small"
              disabled={busy}
              onClick={() => {
                setIntake(null);
                setFileName("");
                setState(null);
                setError(null);
              }}
            >
              Change
            </button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            onPick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {!intake && (
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={useDemo} disabled={reading}>
              Use the demo case (Sambal Mak Embun)
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              A fictional home sambal business with four planted problems.
            </span>
          </div>
        )}

        <label className="lab" htmlFor="prompt">
          2. What do you want?
        </label>
        <textarea
          id="prompt"
          className="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={DEFAULT_PROMPT}
          disabled={busy}
        />

        <details>
          <summary>Access code (only if this deployment asks for one)</summary>
          <input className="text" type="password" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="optional" />
        </details>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={run} disabled={!intake || busy || reading}>
            {busy ? "Running the team…" : "Run HalalPilot"}
          </button>
          {busy && (
            <button className="btn" onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
          )}
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 13 }}>
            Run date {localToday()} · one prompt, end to end
          </span>
        </div>

        {error && (
          <div className="alert bad" role="alert">
            {error}
          </div>
        )}
      </div>

      {state && <Timeline steps={state.steps} />}
      {state?.done && state.error && state.data.manifest && (
        <div className="alert warn">The run stopped early. What the team produced before that is below.</div>
      )}
      {state?.done && <Results state={state} />}

      <footer className="foot">
        HalalPilot prepares an application. It does not certify anything, and it does not check certificates against the official JAKIM / state
        directory — that stays an action item in your pack. Same agents and the same validator as the HalalPilot WorkBuddy expert team.
      </footer>
    </div>
  );
}
