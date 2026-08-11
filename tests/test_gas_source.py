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
    "comments.gs",
    "tests.gs",
}

GAS_MOCKS = r'''
var console = { error: function() {} };
var Utilities = {
  getUuid: function() { return '12345678-1234-4abc-8def-1234567890ab'; },
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
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


def test_successful_send_with_failed_status_update_stays_processing() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      getExistingDeliveryStatus_ = function() { return ''; };
      ensureDiaryCommentToken_ = function() {};
      reserveDelivery_ = function() { return { _rowNumber: 2 }; };
      sendDiaryExchangeMail_ = function() {};
      updateRecord_ = function(name, row, record) {
        if (name === 'DeliveryLog' && record.status === 'delivered') throw new Error('sheet update failed');
      };
      notifyAdminsOfError = function() {};
    ''')
    outcome = context.eval("deliverDiaryOnce_('2026-01-01', { diary_id: 'd1' }, { participantId: 'p1', email: 'one@example.test' }, 'p1')")
    assert outcome == "processing"


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


def test_processing_comment_resolution_requires_explicit_state() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      var updates = [];
      withScriptLock_ = function(callback) { return callback(); };
      getRows_ = function(name) { return name === 'Comments' ? [{
        _rowNumber: 2, comment_id: 'comment-1', status: 'processing'
      }] : []; };
      updateRecord_ = function(name, row, record) { updates.push(record.status); };
      notifyAdminsOfError = function() {};
    ''')
    assert context.eval("resolveProcessingComment('comment-1', 'delivered')") == "delivered"
    assert json.loads(context.eval("JSON.stringify(updates)")) == ["delivered"]


def test_duplicate_comment_post_does_not_send_twice() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      var comments = [];
      var sentComments = 0;
      withScriptLock_ = function(callback) { return callback(); };
      findCommentableDiaryByToken_ = function() { return { diary_date: '2026-01-01', participant_id: 'author' }; };
      getParticipantsById_ = function() { return { author: { participantId: 'author', email: 'author@example.test' } }; };
      getRows_ = function(name) { return name === 'Comments' ? comments : []; };
      appendRecord_ = function(name, record) { record._rowNumber = comments.length + 2; comments.push(record); };
      getSheet_ = function() { return { getLastRow: function() { return comments.length + 1; } }; };
      updateRecord_ = function() {};
      sendAnonymousCommentMail_ = function() { sentComments += 1; };
      notifyAdminsOfError = function() {};
    ''')
    token = "a" * 64
    submission_token = "b" * 64
    first = context.eval(f"submitAnonymousComment_('{token}', '{submission_token}', 'comment')")
    second = context.eval(f"submitAnonymousComment_('{token}', '{submission_token}', 'comment')")
    assert first == second
    assert context.eval("sentComments") == 1
    assert context.eval("comments.length") == 1


def test_comment_submission_token_is_an_append_only_schema_migration() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    headers = json.loads(context.eval("JSON.stringify(SHEET_DEFINITIONS.Comments)"))
    assert headers[-1] == "submission_token"


def test_inactive_author_comment_link_is_not_commentable() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      findDiaryByCommentToken_ = function() { return { participant_id: 'inactive' }; };
      getParticipantsById_ = function() { return {}; };
    ''')
    assert context.eval("findCommentableDiaryByToken_('" + "a" * 64 + "')") is None


def test_matching_handles_fifty_participants_without_duplicates() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    result = json.loads(context.eval(r'''
      JSON.stringify(createMatches_(sampleDiaries_(Array.from({length: 50}, function(_, index) {
        return 'participant-' + index;
      })), {}, {}, '', function() { return 0.25; }))
    '''))
    members = [diary["participant_id"] for pair in result["pairs"] for diary in pair]
    assert len(result["pairs"]) == 25
    assert len(members) == len(set(members)) == 50


def test_duplicate_delivery_log_is_rejected() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      getRows_ = function(name) { return name === 'DeliveryLog' ? [
        { delivery_id: 'one', diary_date: '2026-01-01', diary_id: 'd1', recipient_participant_id: 'p1', status: 'processing' },
        { delivery_id: 'two', diary_date: '2026-01-01', diary_id: 'd1', recipient_participant_id: 'p1', status: 'error' }
      ] : []; };
    ''')
    try:
        context.eval("validateDeliveryLogForDate_('2026-01-01')")
    except quickjs.JSException as error:
        assert "duplicate delivery" in str(error)
    else:
        raise AssertionError("Duplicate DeliveryLog rows must stop delivery")


def test_retry_stops_before_sending_duplicate_delivery_log() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      var sent = 0;
      getRows_ = function(name) { return name === 'DeliveryLog' ? [
        { delivery_id: 'one', diary_date: '2026-01-01', diary_id: 'd1', recipient_participant_id: 'p1', status: 'error' },
        { delivery_id: 'two', diary_date: '2026-01-01', diary_id: 'd1', recipient_participant_id: 'p1', status: 'error' }
      ] : []; };
      sendDiaryExchangeMail_ = function() { sent += 1; };
    ''')
    try:
        context.eval("retryFailedDeliveriesForDate_('2026-01-01')")
    except quickjs.JSException:
        pass
    else:
        raise AssertionError("Retry must reject duplicate DeliveryLog rows")
    assert context.eval("sent") == 0


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
      var notificationFailures = [];
      recordAdminNotificationFailure_ = function(context, attempted, sent, failed, status) {
        notificationFailures.push({ context: context, attempted: attempted, sent: sent, failed: failed, status: status });
      };
      sendSystemMail = function(to) { notified.push(to); if (notified.length === 1) throw new Error('mail failure'); };
    ''')
    result = json.loads(context.eval("JSON.stringify(notifyAdminsOfError('test', new Error('failure')))") )
    assert json.loads(context.eval("JSON.stringify(notified)")) == ["first@example.test", "second@example.test"]
    assert result == {"attempted": 2, "sent": 1, "failed": 1, "configurationError": False}
    assert json.loads(context.eval("JSON.stringify(notificationFailures)")) == [{
        "context": "test", "attempted": 2, "sent": 1, "failed": 1, "status": "delivery_error"
    }]


def test_admin_email_list_is_normalized_and_deduplicated() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    emails = json.loads(context.eval("JSON.stringify(parseEmailList_(' First@Example.test,first@example.test, second@example.test '))"))
    assert emails == ["first@example.test", "second@example.test"]


def test_notification_failure_log_contains_no_recipient_address() -> None:
    source = (SOURCE_DIR / "errors.gs").read_text(encoding="utf-8")
    record_source = source[source.index("function recordAdminNotificationFailure_"):]
    assert "email" not in record_source.lower()


def test_daily_lock_failure_notifies_admins() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      var notifiedContext = '';
      withScriptLock_ = function() { throw new Error('lock unavailable'); };
      notifyAdminsOfError = function(context) { notifiedContext = context; };
    ''')
    try:
        context.eval("runDailyExchangeForDate_('2026-01-01')")
    except quickjs.JSException:
        pass
    else:
        raise AssertionError("A lock failure must remain an error")
    assert context.eval("notifiedContext") == "runDailyExchange"


def test_daily_trigger_is_safely_after_the_submission_cutoff() -> None:
    source = (SOURCE_DIR / "admin.gs").read_text(encoding="utf-8")
    assert ".atHour(22).nearMinute(20).everyDays(1)" in source
    assert ".nearMinute(5)" not in source


def test_comment_url_exposes_only_random_token() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    token = "a" * 64
    context.eval(r'''
      getConfig_ = function() { return { webAppUrl: 'https://script.google.com/macros/s/deployment/exec' }; };
    ''')
    url = context.eval(f"getCommentUrl_('{token}')")
    assert url == f"https://script.google.com/macros/s/deployment/exec?token={token}"
    assert "diary" not in url and "participant" not in url and "email" not in url


def test_comment_source_does_not_read_google_identity() -> None:
    source = (SOURCE_DIR / "comments.gs").read_text(encoding="utf-8")
    assert "Session." not in source
    assert "getActiveUser" not in source
    assert "getEffectiveUser" not in source


def test_archive_cutoff_and_csv_safety() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    selected = json.loads(context.eval(r'''JSON.stringify(selectArchiveRows_([
      { diary_date: '2025-12-31', value: 'old' },
      { diary_date: '2026-01-01', value: 'boundary' },
      { diary_date: '2026-01-02', submitted_at: '2025-12-31 22:00:00', value: 'new' },
      { diary_date: '2025-99-99', value: 'invalid-date' }
    ], '2026-01-01'))'''))
    assert [row["value"] for row in selected] == ["old"]
    csv = context.eval(r'''recordsToCsv_(['body'], [{ body: '=IMPORTDATA("https://example.test")' }, { body: 'a,"b"\nline' }])''')
    assert "'=IMPORTDATA" in csv
    assert '"a,""b""\nline"' in csv


def test_photo_metadata_is_internal_and_attachments_are_anonymous() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    parsed = json.loads(context.eval("JSON.stringify(parsePhotoFileIds_('[\"file-1\",\"file-2\"]'))"))
    assert parsed == ["file-1", "file-2"]
    mail_source = (SOURCE_DIR / "mail.gs").read_text(encoding="utf-8")
    assert ".getUrl(" not in mail_source
    assert ".getName(" not in mail_source
    assert "anonymous-photo-" in mail_source


def test_photo_cleanup_failure_is_not_treated_as_success() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      SlidesApp = { create: function() { return {
        getId: function() { return 'temporary-presentation'; },
        getSlides: function() { return [{ getPageElements: function() { return []; } }]; }
      }; } };
      DriveApp = { getFileById: function() { return {
        setTrashed: function() { throw new Error('trash failed'); }
      }; } };
    ''')
    try:
        context.eval("rasterizePhotoBlobs_([])")
    except quickjs.JSException as error:
        assert "Temporary photo presentation cleanup failed" in str(error)
    else:
        raise AssertionError("Photo cleanup failure must not be treated as success")


def test_management_entrypoint_failures_notify_admins() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    context.eval(r'''
      var notifiedContexts = [];
      notifyAdminsOfError = function(context) { notifiedContexts.push(context); };
      getSpreadsheet_ = function() { throw new Error('spreadsheet unavailable'); };
      getConfig_ = function() { throw new Error('configuration unavailable'); };
      SpreadsheetApp = { getUi: function() { throw new Error('UI unavailable'); } };
    ''')
    for expression in ("initializeSpreadsheet()", "installTriggers()", "addParticipantFromPrompt()"):
        try:
            context.eval(expression)
        except quickjs.JSException:
            pass
        else:
            raise AssertionError(f"{expression} must preserve the original failure")
    assert json.loads(context.eval("JSON.stringify(notifiedContexts)")) == [
        "initializeSpreadsheet", "installTriggers", "addParticipant"
    ]


def test_participant_mail_does_not_render_internal_identifiers() -> None:
    context = quickjs.Context()
    load_gas_sources(context)
    token = "b" * 64
    context.eval(r'''
      var capturedMail = null;
      getConfig_ = function() { return { webAppUrl: 'https://script.google.com/macros/s/deployment/exec' }; };
      createAnonymousPhotoAttachments_ = function() { return []; };
      sendSystemMail = function(to, subject, body, htmlBody) {
        capturedMail = { subject: subject, body: body, htmlBody: htmlBody.htmlBody };
      };
    ''')
    context.eval(f'''sendDiaryExchangeMail_('reader@example.test', {{
      diary_id: 'internal-diary-id', participant_id: 'internal-participant-id', email: 'author@example.test',
      body: 'safe diary body', comment_token: '{token}', photo_file_ids: '[]'
    }})''')
    rendered = context.eval("JSON.stringify(capturedMail)")
    assert "internal-diary-id" not in rendered
    assert "internal-participant-id" not in rendered
    assert "author@example.test" not in rendered


def test_no_checked_in_clasp_credentials() -> None:
    assert not (ROOT / ".clasp.json").exists(), ".clasp.json must not be committed"


if __name__ == "__main__":
    tests = [value for name, value in globals().items() if name.startswith("test_") and callable(value)]
    for test in sorted(tests, key=lambda value: value.__name__):
        test()
    print(f"{len(tests)} local GAS source tests passed.")
