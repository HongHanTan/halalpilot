#!/usr/bin/env python3
"""validate_plugin.py — structural check for a WorkBuddy Expert Team plugin (HalalPilot).

Usage:  python scripts/validate_plugin.py [plugin-dir]     (default: ./halalpilot)

Rules come from the CodeBuddy plugin reference (manifest location, agent frontmatter limits) and
the WorkBuddy marketplace upload checks used by published teams (name/plugin/agentName agreement,
settings.json lead, 3 tags, 3 quick prompts, 40–50 UTF-16 zh description, profession.zh ==
displayName.zh), plus team-consistency checks specific to this repo.

Exit 0 = no errors (warnings allowed), 1 = errors. Standard library only.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

FRONT_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
FORBIDDEN_AGENT_FIELDS = {"hooks", "mcpServers", "permissionMode"}
KNOWN_AGENT_FIELDS = {"name", "description", "model", "effort", "maxTurns", "tools", "disallowedTools",
                      "skills", "memory", "background", "isolation", "displayName", "profession",
                      "initialPrompt"}
IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def utf16_len(s: str) -> int:
    return len(s.encode("utf-16-le")) // 2


def frontmatter(path: Path) -> tuple[dict, str | None]:
    """Minimal YAML-subset reader: top-level `key: value` and `key:` + `  - item` lists.
    Nested mappings are recorded as present (value None); that is all these checks need."""
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        return {}, "file starts with a UTF-8 BOM; frontmatter must be the first bytes"
    m = FRONT_RE.match(raw.decode("utf-8"))
    if not m:
        return {}, "no YAML frontmatter at the start of the file"
    data: dict = {}
    key = None
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith((" ", "\t")):
            if ":" not in line:
                return {}, f"cannot parse frontmatter line: {line!r}"
            key, _, val = line.partition(":")
            key, val = key.strip(), val.strip()
            data[key] = val.strip("\"'") if val else None
        elif key and line.strip().startswith("- "):
            if not isinstance(data.get(key), list):
                data[key] = []
            data[key].append(line.strip()[2:].strip().strip("\"'"))
    return data, None


def main(argv: list[str]) -> int:
    root = Path(argv[0] if argv else "halalpilot").resolve()
    errs: list[str] = []
    warns: list[str] = []
    aid = root.name

    pj_path = root / ".codebuddy-plugin" / "plugin.json"
    if not pj_path.is_file():
        print(f"FAIL: {pj_path} not found")
        return 1
    try:
        pj = json.loads(pj_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"FAIL: plugin.json is not valid JSON: {e}")
        return 1
    extra = [p.name for p in (root / ".codebuddy-plugin").iterdir() if p.name != "plugin.json"]
    if extra:
        errs.append(f".codebuddy-plugin/ must only hold plugin.json; found {extra}")

    # Identity
    if pj.get("expertType") != "team":
        errs.append(f"expertType must be 'team', got {pj.get('expertType')!r}")
    if pj.get("name") != aid:
        errs.append(f"plugin.json name {pj.get('name')!r} must equal directory name {aid!r}")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", str(pj.get("name", ""))):
        errs.append("name must be kebab-case")
    if pj.get("plugin") != pj.get("name"):
        errs.append("plugin must equal name")
    lead = f"{aid}-team-lead"
    if pj.get("agentName") != lead:
        errs.append(f"agentName must be {lead!r}")
    if not re.fullmatch(r"\d+\.\d+\.\d+", str(pj.get("version", ""))):
        errs.append("version must be semver x.y.z")

    # settings.json
    st = root / "settings.json"
    if not st.is_file():
        errs.append("settings.json missing (team lead is declared there)")
    else:
        try:
            if json.loads(st.read_text(encoding="utf-8")).get("agent") != pj.get("agentName"):
                errs.append("settings.json agent must equal plugin.json agentName")
        except json.JSONDecodeError as e:
            errs.append(f"settings.json invalid JSON: {e}")

    # Marketplace display rules
    for field in ("displayName", "profession", "displayDescription"):
        if not isinstance(pj.get(field), dict) or not pj[field].get("zh") or not pj[field].get("en"):
            errs.append(f"{field} needs zh and en")
    if (pj.get("profession") or {}).get("zh") != (pj.get("displayName") or {}).get("zh"):
        errs.append("team profession.zh must equal displayName.zh")
    dzh = (pj.get("displayDescription") or {}).get("zh") or ""
    n = utf16_len(dzh)
    if not 40 <= n <= 50:
        errs.append(f"displayDescription.zh is {n} UTF-16 units; must be 40–50")
    elif not 42 <= n <= 48:
        warns.append(f"displayDescription.zh is {n} UTF-16 units; 42–48 leaves safer margin")
    tags = pj.get("tags") or []
    if len(tags) != 3 or not all(isinstance(t, dict) and t.get("zh") and t.get("en") for t in tags):
        errs.append("tags must be exactly 3 objects with zh and en")
    qp = pj.get("quickPrompts") or []
    if len(qp) != 3:
        errs.append(f"quickPrompts must have exactly 3 entries, has {len(qp)}")
    if qp and pj.get("defaultInitPrompt") != qp[0]:
        errs.append("defaultInitPrompt must equal quickPrompts[0]")
    if pj.get("avatar") and not (root / pj["avatar"]).is_file():
        errs.append(f"avatar {pj['avatar']} not found")

    # Component paths
    for kind in ("agents", "skills"):
        for p in pj.get(kind) or []:
            if not p.startswith("./"):
                errs.append(f"{kind} path {p!r} must start with ./")
    declared_agents = {Path(p).stem for p in pj.get("agents") or []}
    for p in pj.get("agents") or []:
        if not (root / p).is_file():
            errs.append(f"agents entry {p} does not exist")
    declared_skills = {Path(p).name for p in pj.get("skills") or []}
    for p in pj.get("skills") or []:
        if not (root / p / "SKILL.md").is_file():
            errs.append(f"skills entry {p} has no SKILL.md")

    # Team roster consistency
    ti = pj.get("teamInfo") or {}
    if ti.get("leadAgent") != lead:
        errs.append(f"teamInfo.leadAgent must be {lead!r}")
    roster = {ti.get("leadAgent")} | set(ti.get("memberAgents") or [])
    if roster != declared_agents:
        errs.append(f"teamInfo roster {sorted(roster)} != agents files {sorted(declared_agents)}")
    members = pj.get("members") or []
    leads = [m for m in members if m.get("role") == "lead"]
    if len(leads) != 1 or leads[0].get("id") != lead:
        errs.append("members must contain exactly one role=lead entry, the team lead")
    if {m.get("id") for m in members} != declared_agents:
        errs.append("members[].id must match the agents files")
    for m in members:
        if m.get("avatar") and not (root / m["avatar"]).is_file():
            warns.append(f"member avatar {m['avatar']} not found")
    av = root / "avatars"
    for a in declared_agents:
        if not (av.is_dir() and any(f.stem == a and f.suffix.lower() in IMG_EXTS for f in av.iterdir())):
            warns.append(f"avatars/{a}.png|jpg missing")

    # Agent files
    on_disk = {p.stem for p in (root / "agents").glob("*.md")}
    if on_disk != declared_agents:
        errs.append(f"agents/ files {sorted(on_disk)} != plugin.json agents {sorted(declared_agents)}")
    skill_dirs = {p.parent.name for p in (root / "skills").glob("*/SKILL.md")}
    lead_body = ""
    for path in sorted((root / "agents").glob("*.md")):
        fm, problem = frontmatter(path)
        if problem:
            errs.append(f"{path.name}: {problem}")
            continue
        if fm.get("name") != path.stem:
            errs.append(f"{path.name}: frontmatter name {fm.get('name')!r} must equal file name")
        if not fm.get("description"):
            errs.append(f"{path.name}: description missing")
        bad = FORBIDDEN_AGENT_FIELDS & fm.keys()
        if bad:
            errs.append(f"{path.name}: plugin agents may not use {sorted(bad)}")
        unknown = set(fm) - KNOWN_AGENT_FIELDS - FORBIDDEN_AGENT_FIELDS
        if unknown:
            warns.append(f"{path.name}: unrecognised frontmatter fields {sorted(unknown)}")
        for s in fm.get("skills") or []:
            if s not in skill_dirs:
                errs.append(f"{path.name}: skill {s!r} not found in skills/")
        if path.stem == lead:
            lead_body = path.read_text(encoding="utf-8")

    # Orchestration contract: the lead must create the team and name every member.
    if lead_body:
        if "TeamCreate" not in lead_body:
            errs.append("lead agent must instruct formal team creation (TeamCreate)")
        for a in sorted(declared_agents - {lead}):
            if a not in lead_body:
                errs.append(f"lead agent never references member {a}")
        for phrase in ("parallel", "NEEDS_REVIEW", "validate_pack.py", "repair"):
            if phrase.lower() not in lead_body.lower():
                errs.append(f"lead agent is missing the {phrase!r} instruction")

    # Skills
    for sk in sorted((root / "skills").glob("*/SKILL.md")):
        fm, problem = frontmatter(sk)
        if problem:
            errs.append(f"{sk.parent.name}/SKILL.md: {problem}")
            continue
        if fm.get("name") != sk.parent.name:
            errs.append(f"{sk.parent.name}/SKILL.md: name must equal directory name")
        for k in ("description", "version", "category"):
            if not fm.get(k):
                errs.append(f"{sk.parent.name}/SKILL.md: {k} missing")
    if skill_dirs != declared_skills:
        errs.append(f"skills/ dirs {sorted(skill_dirs)} != plugin.json skills {sorted(declared_skills)}")
    for tpl in sorted(root.glob("skills/*/templates/*.json")):
        try:
            json.loads(tpl.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            errs.append(f"template {tpl.relative_to(root)} invalid JSON: {e}")
    for script in sorted(root.glob("skills/*/scripts/*.py")):
        try:  # compile in memory so no __pycache__ lands inside the plugin package
            compile(script.read_text(encoding="utf-8"), str(script), "exec")
        except SyntaxError as e:
            errs.append(f"script {script.relative_to(root)} does not compile: {e}")

    print(f"HalalPilot plugin check: {root}")
    print(f"  agents {len(declared_agents)} | skills {len(declared_skills)} | displayDescription.zh {n} UTF-16 units")
    for w in warns:
        print(f"  WARN  {w}")
    for e in errs:
        print(f"  ERROR {e}")
    print("RESULT:", "PASS" if not errs else f"FAIL ({len(errs)} errors)")
    return 0 if not errs else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
