"""Run pure GAS logic locally with a minimal Apps Script mock.

This test deliberately does not call Forms, Sheets, Gmail, or Drive. Those services
require the separate Google verification environment described in SETUP.md.
"""

from pathlib import Path

import quickjs


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "src"
EXPECTED_FILES = {
    "config.gs",
    "utils.gs",
    "schema.gs",
    "participants.gs",
    "diary.gs",
    "matching.gs",
    "history.gs",
    "mail.gs",
    "errors.gs",
    "main.gs",
    "admin.gs",
    "tests.gs",
}

GAS_MOCKS = r'''
var console = { error: function() {} };
var Utilities = {
  getUuid: function() { return 'test-uuid'; },
  formatDate: function(date, timezone, pattern) {
    if (timezone !== 'Asia/Tokyo') throw new Error('Unexpected timezone: ' + timezone);
    var jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    var parts = {
      yyyy: String(jst.getUTCFullYear()),
      MM: String(jst.getUTCMonth() + 1).padStart(2, '0'),
      dd: String(jst.getUTCDate()).padStart(2, '0'),
      HH: String(jst.getUTCHours()).padStart(2, '0'),
      mm: String(jst.getUTCMinutes()).padStart(2, '0'),
      ss: String(jst.getUTCSeconds()).padStart(2, '0')
    };
    return pattern.replace('yyyy', parts.yyyy).replace('MM', parts.MM)
      .replace('dd', parts.dd).replace('HH', parts.HH)
      .replace('mm', parts.mm).replace('ss', parts.ss);
  }
};
'''


def load_gas_sources(context: quickjs.Context) -> None:
    files = {path.name for path in SOURCE_DIR.glob("*.gs")}
    assert EXPECTED_FILES <= files, f"Missing GAS files: {sorted(EXPECTED_FILES - files)}"
    context.eval(GAS_MOCKS)
    for path in sorted(SOURCE_DIR.glob("*.gs")):
        context.eval(path.read_text(encoding="utf-8"))


def test_local_gas_self_tests() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    assert context.eval("runMvpSelfTests()") == "MVP self-tests passed."


def test_mail_is_centrally_routed() -> None:
    direct_send_files = [
        path.name for path in SOURCE_DIR.glob("*.gs") if "GmailApp.sendEmail" in path.read_text(encoding="utf-8")
    ]
    assert direct_send_files == ["mail.gs"]


def test_no_checked_in_clasp_credentials() -> None:
    assert not (ROOT / ".clasp.json").exists(), ".clasp.json must not be committed"


if __name__ == "__main__":
    test_local_gas_self_tests()
    test_mail_is_centrally_routed()
    test_no_checked_in_clasp_credentials()
    print("Local GAS source tests passed.")
