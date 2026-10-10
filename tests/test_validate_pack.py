"""Tests for halal-readiness-pack/scripts/validate_pack.py.

Run from the workspace root:  python -m unittest discover -s tests -v

The fixture in tests/fixtures/sample-run is an honest team run over samples/kedai-sambal-contoh
(as_of 2026-10-10). Each test copies it, injects one kind of fabrication or omission, and checks that
the validator rejects it and routes the error to the right agent.
"""
from __future__ import annotations

import copy
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "halalpilot/skills/halal-readiness-pack/scripts/validate_pack.py"
FIXTURE = ROOT / "tests/fixtures/sample-run"
CASE = ROOT / "samples/kedai-sambal-contoh"

sys.dont_write_bytecode = True  # keep __pycache__ out of the shipped plugin folder
spec = importlib.util.spec_from_file_location("validate_pack", SCRIPT)
vp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vp)


def load(name: str) -> dict:
    return json.loads((FIXTURE / name).read_text(encoding="utf-8"))


class PackTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.out = self.tmp / "out"
        shutil.copytree(FIXTURE, self.out)
        self.files = {n: load(n) for n in vp.FILES.values()}

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_with(self, **edits) -> dict:
        """edits: short key (manifest|matrix|process|audit) → function(data) that mutates a copy."""
        for part, fn in edits.items():
            name = vp.FILES[part]
            data = copy.deepcopy(self.files[name])
            fn(data)
            (self.out / name).write_text(json.dumps(data), encoding="utf-8")
        return vp.validate(self.out, CASE, None, 90)

    def assertError(self, result: dict, code: str, owner: str) -> None:
        hits = [e for e in result["errors"] if e["code"] == code]
        self.assertTrue(hits, f"expected {code}, got {[e['code'] for e in result['errors']]}")
        self.assertEqual(hits[0]["owner"], owner)
        self.assertFalse(result["passed"])
        self.assertEqual(result["readiness"]["status"], "INVALID_PACK")


def row(data: dict, iid: str) -> dict:
    return next(r for r in data["rows"] if r["ingredient_id"] == iid)


class HonestRun(PackTestCase):
    def test_honest_pack_is_consistent_but_not_ready(self):
        r = vp.validate(self.out, CASE, None, 90)
        self.assertEqual(r["errors"], [])
        rd = r["readiness"]
        self.assertEqual(rd["status"], "NOT_READY")
        self.assertEqual(rd["score"], 46)
        self.assertEqual(rd["verdict_counts"], {"VERIFIED": 4, "LOW_RISK_NO_CERT": 4, "EXPIRED": 2, "EXPIRING": 2,
                                                "NO_CERT": 5, "NEEDS_REVIEW": 1, "MISMATCH": 1})
        self.assertEqual(rd["blockers"]["blocking_missing_documents"], 6)
        self.assertEqual(rd["blockers"]["open_critical_findings"], ["F-01", "F-02"])
        # Every planted ingredient gap is a blocker.
        for iid in ("P1-I04", "P2-I09", "P2-I10", "P2-I11"):
            self.assertIn(iid, rd["blockers"]["ingredients"])

    def test_cli_exit_codes_and_report_file(self):
        ok = subprocess.run([sys.executable, str(SCRIPT), str(self.out), "--case-dir", str(CASE), "--quiet"])
        self.assertEqual(ok.returncode, 0)
        self.assertTrue((self.out / "validation-report.json").is_file())
        (self.out / vp.FILES["matrix"]).unlink()
        bad = subprocess.run([sys.executable, str(SCRIPT), str(self.out), "--case-dir", str(CASE), "--quiet"])
        self.assertEqual(bad.returncode, 1)
        missing = subprocess.run([sys.executable, str(SCRIPT), str(self.tmp / "nope")], capture_output=True)
        self.assertEqual(missing.returncode, 2)

    def test_later_date_turns_expiring_into_inconsistent(self):
        # On 2026-12-01 the cooking-oil cert (2026-11-20) has expired; EXPIRING is now wrong.
        r = vp.validate(self.out, CASE, vp.parse_date("2026-12-01"), 90)
        self.assertTrue(any(e["code"] == "VERDICT_INCONSISTENT" for e in r["errors"]))


class InventedEvidence(PackTestCase):
    def test_verified_without_certificate(self):
        def f(d):
            r = row(d, "P2-I11"); r.update(verdict="VERIFIED", cert_id="C9", cert_expiry="2027-12-31")
        self.assertError(self.run_with(matrix=f), "UNKNOWN_CERT", "halalpilot-ingredient-investigator")

    def test_expired_cert_marked_verified(self):
        self.assertError(self.run_with(matrix=lambda d: row(d, "P1-I04").update(verdict="VERIFIED")),
                         "VERDICT_INCONSISTENT", "halalpilot-ingredient-investigator")

    def test_retyped_expiry_date(self):
        self.assertError(self.run_with(matrix=lambda d: row(d, "P1-I04").update(cert_expiry="2027-08-31")),
                         "EXPIRY_MISMATCH", "halalpilot-ingredient-investigator")

    def test_fact_without_source(self):
        self.assertError(self.run_with(manifest=lambda d: d["certificates"][0].update(source=None)),
                         "FACT_WITHOUT_SOURCE", "halalpilot-evidence-clerk")

    def test_source_that_does_not_exist(self):
        self.assertError(self.run_with(manifest=lambda d: d["suppliers"][0].update(source="DOC-099")),
                         "UNKNOWN_SOURCE", "halalpilot-evidence-clerk")

    def test_fact_read_from_unreadable_photo(self):
        def f(d):
            d["photo_observations"].append({"obs_id": "O9", "doc_id": "DOC-011", "text": "Label shows E471 (plant)",
                                            "source": "DOC-011", "status": "OBSERVED"})
        self.assertError(self.run_with(manifest=f), "SOURCE_UNREADABLE", "halalpilot-evidence-clerk")

    def test_needs_review_must_say_why(self):
        self.assertError(self.run_with(matrix=lambda d: row(d, "P2-I09").pop("reason")),
                         "NEEDS_REVIEW_WITHOUT_REASON", "halalpilot-ingredient-investigator")

    def test_sop_presented_as_existing_practice(self):
        self.assertError(self.run_with(process=lambda d: d["procedures"][0].update(status="EXTRACTED", source="DOC-009")),
                         "BAD_STATUS", "halalpilot-process-builder")


class DroppedWork(PackTestCase):
    def test_file_left_out_of_manifest(self):
        self.assertError(self.run_with(manifest=lambda d: d["documents"].pop(10)),
                         "FILE_NOT_CATALOGUED", "halalpilot-evidence-clerk")

    def test_ingredient_dropped_from_matrix(self):
        self.assertError(self.run_with(matrix=lambda d: d["rows"].pop()),
                         "INGREDIENT_NOT_COVERED", "halalpilot-ingredient-investigator")

    def test_product_without_flow(self):
        self.assertError(self.run_with(process=lambda d: d["flows"].pop()),
                         "FLOW_MISSING", "halalpilot-process-builder")

    def test_problem_without_action(self):
        self.assertError(self.run_with(matrix=lambda d: row(d, "P2-I10").update(actions=[])),
                         "NO_ACTION", "halalpilot-ingredient-investigator")


class RiskAndAudit(PackTestCase):
    def test_e471_cannot_be_downgraded(self):
        self.assertError(self.run_with(matrix=lambda d: row(d, "P2-I11").update(risk_level="LOW")),
                         "RISK_UNDERSTATED", "halalpilot-ingredient-investigator")

    def test_auditor_cannot_pass_open_critical(self):
        self.assertError(self.run_with(audit=lambda d: d["findings"][0].update(status="OPEN")),
                         "PASS_WITH_OPEN_CRITICAL", "halalpilot-mock-auditor")

    def test_risk_screen_has_no_false_positive_on_quantities(self):
        self.assertIsNone(vp.HIGH_RISK_RE.search("bawang merah 1.5 kg, add the 450g base"))
        self.assertIsNotNone(vp.HIGH_RISK_RE.search("Emulsifier E-471"))


if __name__ == "__main__":
    unittest.main()
