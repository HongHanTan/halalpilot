"""Tests for scripts/validate_plugin.py: the real package passes; common packaging mistakes fail."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts/validate_plugin.py"
PLUGIN = ROOT / "halalpilot"


def check(plugin_dir: Path) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), str(plugin_dir)], capture_output=True, text=True,
                          encoding="utf-8")


class PluginPackage(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.copy = self.tmp / "halalpilot"
        shutil.copytree(PLUGIN, self.copy)

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def edit_json(self, rel: str, fn) -> None:
        p = self.copy / rel
        data = json.loads(p.read_text(encoding="utf-8"))
        fn(data)
        p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def assertFails(self, needle: str) -> None:
        r = check(self.copy)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn(needle, r.stdout)

    def test_real_package_passes(self):
        r = check(PLUGIN)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("RESULT: PASS", r.stdout)

    def test_settings_must_name_the_lead(self):
        self.edit_json("settings.json", lambda d: d.update(agent="halalpilot-mock-auditor"))
        self.assertFails("settings.json agent must equal")

    def test_exactly_three_tags(self):
        self.edit_json(".codebuddy-plugin/plugin.json", lambda d: d["tags"].pop())
        self.assertFails("tags must be exactly 3")

    def test_agent_name_matches_file(self):
        p = self.copy / "agents/halalpilot-mock-auditor.md"
        p.write_text(p.read_text(encoding="utf-8").replace("name: halalpilot-mock-auditor", "name: auditor", 1),
                     encoding="utf-8")
        self.assertFails("must equal file name")

    def test_plugin_agents_cannot_set_permission_mode(self):
        p = self.copy / "agents/halalpilot-evidence-clerk.md"
        p.write_text(p.read_text(encoding="utf-8").replace("maxTurns: 80", "maxTurns: 80\npermissionMode: bypassPermissions", 1),
                     encoding="utf-8")
        self.assertFails("plugin agents may not use")

    def test_lead_must_create_team(self):
        p = self.copy / "agents/halalpilot-team-lead.md"
        p.write_text(p.read_text(encoding="utf-8").replace("TeamCreate", "team setup"), encoding="utf-8")
        self.assertFails("TeamCreate")

    def test_roster_must_match_agent_files(self):
        (self.copy / "agents/halalpilot-process-builder.md").unlink()
        self.assertFails("does not exist")


if __name__ == "__main__":
    unittest.main()
