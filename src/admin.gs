function installTriggers() {
  var config = getConfig_();
  if (!config.formId) throw new Error('FORM_ID is not configured.');
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    var handler = trigger.getHandlerFunction();
    if (handler === 'onDiaryFormSubmit' || handler === 'runDailyExchange') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('onDiaryFormSubmit').forForm(FormApp.openById(config.formId)).onFormSubmit().create();
  ScriptApp.newTrigger('runDailyExchange').timeBased().atHour(22).nearMinute(5).everyDays(1).create();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('匿名日記システム')
    .addItem('シートを初期化', 'initializeSpreadsheet')
    .addItem('参加者を追加', 'addParticipantFromPrompt')
    .addItem('トリガーを設定', 'installTriggers')
    .addItem('日次交換を実行', 'runDailyExchange')
    .addItem('指定日を実行（検証用）', 'runExchangeForDateFromPrompt')
    .addItem('失敗した配信を再送', 'retryFailedDeliveriesFromPrompt')
    .addItem('未配信のマッチを再構築', 'repairMatchesFromPrompt')
    .addItem('processingを確認済みにする', 'resolveProcessingFromPrompt')
    .addItem('失敗したコメント通知を再送', 'retryFailedCommentNotificationsFromPrompt')
    .addItem('コメント通知のprocessingを確認', 'resolveProcessingCommentFromPrompt')
    .addItem('旧データをアーカイブして削除', 'archiveOldDataFromPrompt')
    .addItem('管理者通知をテスト', 'sendAdminAlertTest')
    .addItem('自己テストを実行', 'runMvpSelfTestsFromMenu')
    .addToUi();
}

function runExchangeForDateFromPrompt() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('指定日を実行', '日記の日付を YYYY-MM-DD 形式で入力してください。検証時だけ使用してください。', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  runDailyExchangeForDate(response.getResponseText().trim());
  ui.alert('指定日の交換処理を実行しました。RunLog と DeliveryLog を確認してください。');
}

var ARCHIVE_SHEETS = ['Diaries', 'Matches', 'Comments', 'DeliveryLog'];

function archiveOldData(beforeDate) {
  if (!isValidDateKey_(String(beforeDate))) throw new Error('Date must be a valid YYYY-MM-DD date.');
  try {
    return withScriptLock_(function() { return archiveOldData_(String(beforeDate)); });
  } catch (error) {
    notifyAdminsOfError('archiveOldData', error);
    throw error;
  }
}

function archiveOldData_(beforeDate) {
  var config = getConfig_();
  if (!config.archiveFolderId) throw new Error('ARCHIVE_FOLDER_ID is not configured.');
  var rootFolder = DriveApp.getFolderById(config.archiveFolderId);
  validateArchiveFolderPrivacy_(rootFolder, config.adminEmails);
  var archiveSets = ARCHIVE_SHEETS.map(function(sheetName) {
    var rows = selectArchiveRows_(getRows_(sheetName), beforeDate);
    var csv = recordsToCsv_(SHEET_DEFINITIONS[sheetName], rows);
    return { sheetName: sheetName, rows: rows, csv: csv, sha256: sha256Base64_(csv) };
  });
  var runName = 'archive_before_' + beforeDate.replace(/-/g, '') + '_' + formatJst_(new Date(), 'yyyyMMdd_HHmmss');
  var runFolder = rootFolder.createFolder(runName);
  var manifest = {
    version: 1,
    beforeDate: beforeDate,
    createdAtJst: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    csvFormulaEscaping: 'Cells beginning with optional whitespace and =, +, -, or @ are prefixed with a single quote.',
    files: []
  };
  archiveSets.forEach(function(set) {
    var fileName = set.sheetName + '.csv';
    var file = runFolder.createFile(fileName, set.csv, MimeType.CSV);
    verifyArchiveFile_(file, set.csv, set.sha256);
    manifest.files.push({ name: fileName, sheet: set.sheetName, rowCount: set.rows.length, sha256: set.sha256 });
  });
  var manifestText = JSON.stringify(manifest, null, 2);
  var manifestFile = runFolder.createFile('manifest.json', manifestText, MimeType.PLAIN_TEXT);
  verifyArchiveFile_(manifestFile, manifestText, sha256Base64_(manifestText));

  archiveSets.forEach(function(set) { deleteArchivedRows_(set.sheetName, set.rows); });
  ARCHIVE_SHEETS.forEach(function(sheetName) {
    if (selectArchiveRows_(getRows_(sheetName), beforeDate).length !== 0) {
      throw new Error('Archive deletion verification failed for sheet: ' + sheetName + '.');
    }
  });
  notifyAdminsOfArchive_(beforeDate, manifest, config.adminEmails);
  return manifest;
}

function selectArchiveRows_(rows, beforeDate) {
  return rows.filter(function(row) {
    var dateKey = String(row.diary_date || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dateKey < beforeDate;
  });
}

function recordsToCsv_(headers, rows) {
  var lines = [headers.map(csvEscape_).join(',')];
  rows.forEach(function(row) {
    lines.push(headers.map(function(header) { return csvEscape_(archiveValue_(row[header])); }).join(','));
  });
  return lines.join('\r\n') + '\r\n';
}

function archiveValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') return formatJst_(value, "yyyy-MM-dd'T'HH:mm:ssXXX");
  var text = value === null || value === undefined ? '' : String(value);
  return /^[\t ]*[=+\-@]/.test(text) ? "'" + text : text;
}

function csvEscape_(value) {
  var text = String(value === null || value === undefined ? '' : value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function sha256Base64_(text) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

function verifyArchiveFile_(file, expectedText, expectedHash) {
  var actual = file.getBlob().getDataAsString('UTF-8');
  if (actual !== expectedText || sha256Base64_(actual) !== expectedHash) {
    throw new Error('Archive verification failed.');
  }
}

function deleteArchivedRows_(sheetName, rows) {
  var sheet = getSheet_(sheetName);
  rows.map(function(row) { return row._rowNumber; })
    .sort(function(left, right) { return right - left; })
    .forEach(function(rowNumber) { sheet.deleteRow(rowNumber); });
}

function validateArchiveFolderPrivacy_(folder, adminEmails) {
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('Archive folder must not use link or domain sharing.');
  var allowed = {};
  adminEmails.forEach(function(email) { allowed[normalizeEmail_(email)] = true; });
  folder.getEditors().concat(folder.getViewers()).forEach(function(user) {
    if (!allowed[normalizeEmail_(user.getEmail())]) throw new Error('Archive folder is shared with a non-administrator.');
  });
}

function notifyAdminsOfArchive_(beforeDate, manifest, recipients) {
  var summary = manifest.files.map(function(file) { return file.sheet + ': ' + file.rowCount + ' rows'; }).join('\n');
  var body = 'アーカイブと対象行の削除が完了しました。\n基準日: ' + beforeDate + '\n\n' + summary;
  var failed = 0;
  recipients.forEach(function(email) {
    try { sendSystemMail(email, '【完了】匿名日記システムのアーカイブ', body); }
    catch (ignored) { failed += 1; console.error('Archive completion notification failed.'); }
  });
  if (failed > 0) throw new Error('Archive completed, but ' + failed + ' administrator notification(s) failed.');
}

function archiveOldDataFromPrompt() {
  var ui = SpreadsheetApp.getUi();
  var dateResponse = ui.prompt('旧データをアーカイブ', '基準日を YYYY-MM-DD 形式で入力してください。この日より前だけが対象です。', ui.ButtonSet.OK_CANCEL);
  if (dateResponse.getSelectedButton() !== ui.Button.OK) return;
  var beforeDate = dateResponse.getResponseText().trim();
  var confirmResponse = ui.prompt('削除の最終確認', '実行するには DELETE BEFORE ' + beforeDate + ' と正確に入力してください。', ui.ButtonSet.OK_CANCEL);
  if (confirmResponse.getSelectedButton() !== ui.Button.OK || confirmResponse.getResponseText() !== 'DELETE BEFORE ' + beforeDate) {
    ui.alert('入力が一致しないため中止しました。');
    return;
  }
  var manifest = archiveOldData(beforeDate);
  ui.alert(manifest.files.reduce(function(total, file) { return total + file.rowCount; }, 0) + '行をアーカイブして削除しました。');
}

function sendAdminAlertTest() {
  var result = notifyAdminsOfError('管理者通知テスト', new Error('これは動作確認用の通知です。システム障害ではありません。'));
  if (result.configurationError || result.failed > 0) {
    throw new Error('管理者通知テストに失敗しました。Apps Scriptの実行ログとADMIN_EMAILSを確認してください。');
  }
  SpreadsheetApp.getUi().alert(result.sent + '人の管理者へ通知を送信しました。全員の受信を確認してください。');
}
