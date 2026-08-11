"""Run pure GAS logic locally with a minimal Apps Script mock.

This test deliberately does not call Forms, Sheets, Gmail, or Drive. Those services
require the separate Google verification environment described in SETUP.md.
"""

from pathlib import Path
import json

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


def test_failed_delivery_retry_policy_is_explicit() -> None:
    source = (SOURCE_DIR / "main.gs").read_text(encoding="utf-8")
    assert "String(row.status) === 'error'" in source
    assert "String(row.status) === 'processing'" not in source


def test_retry_sends_only_error_deliveries() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      var sentDeliveryIds = [];
      var currentDeliveryId = '';
      getEligibleDiariesForDate_ = function() { return [{ diary_id: 'd1', body: 'body' }, { diary_id: 'd2', body: 'body' }]; };
      getParticipantsById_ = function() { return { p1: { participantId: 'p1', email: 'one@example.test' }, p2: { participantId: 'p2', email: 'two@example.test' } }; };
      getRows_ = function(name) { return name === 'DeliveryLog' ? [
        { _rowNumber: 2, delivery_id: 'failed', diary_date: '2026-01-01', diary_id: 'd1', recipient_participant_id: 'p1', status: 'error' },
        { _rowNumber: 3, delivery_id: 'uncertain', diary_date: '2026-01-01', diary_id: 'd2', recipient_participant_id: 'p2', status: 'processing' }
      ] : []; };
      updateRecord_ = function(name, rowNumber) { if (name === 'DeliveryLog' && rowNumber === 2) currentDeliveryId = 'failed'; };
      sendDiaryExchangeMail_ = function() { sentDeliveryIds.push(currentDeliveryId); };
      appendRunLog_ = function() {};
      notifyAdminsOfError = function() {};
    ''')
    result = json.loads(context.eval("JSON.stringify(retryFailedDeliveriesForDate_('2026-01-01'))"))
    sent = json.loads(context.eval("JSON.stringify(sentDeliveryIds)"))
    assert result == {"delivered": 1, "skipped": 0, "failed": 0, "processing": 0}
    assert sent == ["failed"]


def test_daily_run_records_delivery_failure_as_error() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      var recordedStatuses = [];
      withScriptLock_ = function(callback) { return callback(); };
      ensureMatchesForDate_ = function() { return [{ match_type: 'pair' }]; };
      deliverPendingMatches_ = function() { return { delivered: 1, skipped: 0, failed: 1 }; };
      appendRunLog_ = function(date, status) { recordedStatuses.push(status); };
      notifyAdminsOfError = function() {};
    ''')
    context.eval("runDailyExchangeForDate_('2026-01-01')")
    assert json.loads(context.eval("JSON.stringify(recordedStatuses)")) == ["error"]


def test_delivered_mail_is_not_reopened_when_participant_is_inactive() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      getRows_ = function(name) { return name === 'DeliveryLog' ? [{
        diary_date: '2026-01-01', diary_id: 'd1', recipient_participant_id: 'p1', status: 'delivered'
      }] : []; };
    ''')
    outcome = context.eval("deliverDiaryOnce_('2026-01-01', { diary_id: 'd1' }, undefined, 'p1')")
    assert outcome == "skipped"


def test_inactive_participants_are_excluded_from_matching() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      getAcceptedDiariesForDate_ = function() { return [
        { diary_id: 'd1', participant_id: 'active' }, { diary_id: 'd2', participant_id: 'inactive' }
      ]; };
      getParticipantsById_ = function() { return { active: { participantId: 'active', email: 'active@example.test' } }; };
    ''')
    eligible = json.loads(context.eval("JSON.stringify(getEligibleDiariesForDate_('2026-01-01'))"))
    assert [row["participant_id"] for row in eligible] == ["active"]


def test_processing_resolution_requires_explicit_state() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      var updates = [];
      withScriptLock_ = function(callback) { return callback(); };
      getRows_ = function(name) { return name === 'DeliveryLog' ? [{
        _rowNumber: 2, delivery_id: 'delivery-1', diary_date: '2026-01-01', status: 'processing'
      }] : []; };
      updateRecord_ = function(name, row, record) { updates.push(record.status); };
      getExistingMatchesForDate_ = function() { return []; };
      appendRunLog_ = function() {};
      notifyAdminsOfError = function() {};
    ''')
    assert context.eval("resolveProcessingDelivery('delivery-1', 'error')") == "error"
    assert json.loads(context.eval("JSON.stringify(updates)")) == ["error"]


def test_logs_do_not_include_admin_recipient() -> None:
    source = (SOURCE_DIR / "errors.gs").read_text(encoding="utf-8")
    assert "failed for ' + email" not in source


def test_error_notification_attempts_every_admin() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      var notified = [];
      PropertiesService = { getScriptProperties: function() { return {
        getProperty: function(key) { return key === 'ADMIN_EMAILS' ? 'first@example.test,second@example.test' : ''; }
      }; } };
      sendSystemMail = function(to) { notified.push(to); if (notified.length === 1) throw new Error('mail failure'); };
    ''')
    context.eval("notifyAdminsOfError('test', new Error('failure'))")
    assert json.loads(context.eval("JSON.stringify(notified)")) == ["first@example.test", "second@example.test"]


def test_no_checked_in_clasp_credentials() -> None:
    assert not (ROOT / ".clasp.json").exists(), ".clasp.json must not be committed"


if __name__ == "__main__":
    test_local_gas_self_tests()
    test_mail_is_centrally_routed()
    test_failed_delivery_retry_policy_is_explicit()
    test_retry_sends_only_error_deliveries()
    test_daily_run_records_delivery_failure_as_error()
    test_delivered_mail_is_not_reopened_when_participant_is_inactive()
    test_inactive_participants_are_excluded_from_matching()
    test_processing_resolution_requires_explicit_state()
    test_logs_do_not_include_admin_recipient()
    test_error_notification_attempts_every_admin()
    test_no_checked_in_clasp_credentials()
    print("Local GAS source tests passed.")
