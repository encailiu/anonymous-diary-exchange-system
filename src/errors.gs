function notifyAdminsOfError(context, error) {
  var properties = PropertiesService.getScriptProperties();
  var recipients = parseEmailList_(properties.getProperty(CONFIG_KEYS.ADMIN_EMAILS));
  if (recipients.length === 0) {
    console.error('Unable to notify administrators: ADMIN_EMAILS is not configured. Context: ' + context);
    recordAdminNotificationFailure_(context, 0, 0, 0, 'configuration_error');
    return { attempted: 0, sent: 0, failed: 0, configurationError: true };
  }
  var detail = error && error.message ? error.message : String(error);
  var body = [
    '発生時刻: ' + formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss') + ' JST',
    '発生処理: ' + context,
    'エラー内容: ' + detail,
    '',
    '管理者用Spreadsheetを確認してください。'
  ].join('\n');
  var result = { attempted: recipients.length, sent: 0, failed: 0, configurationError: false };
  recipients.forEach(function(email) {
    try {
      sendSystemMail(email, '【緊急アラート】匿名日記システムでエラーが発生しました', body);
      result.sent += 1;
    } catch (mailError) {
      result.failed += 1;
      console.error('Administrator notification failed.');
    }
  });
  if (result.failed > 0) {
    recordAdminNotificationFailure_(context, result.attempted, result.sent, result.failed, 'delivery_error');
  }
  return result;
}

function recordAdminNotificationFailure_(context, attempted, sent, failed, status) {
  try {
    var spreadsheetId = PropertiesService.getScriptProperties().getProperty(CONFIG_KEYS.SPREADSHEET_ID);
    if (!spreadsheetId) throw new Error('SPREADSHEET_ID is not configured.');
    var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName('AdminNotificationLog');
    if (!sheet) throw new Error('AdminNotificationLog sheet is missing.');
    var record = {
      notification_id: createId_(), context: String(context || ''), attempted: attempted,
      sent: sent, failed: failed, status: status, created_at: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss')
    };
    sheet.appendRow(SHEET_DEFINITIONS.AdminNotificationLog.map(function(header) {
      return record[header] === null || record[header] === undefined ? '' : record[header];
    }));
  } catch (logError) {
    console.error('Administrator notification failure log could not be written.');
  }
}
