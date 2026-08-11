function notifyAdminsOfError(context, error) {
  var properties = PropertiesService.getScriptProperties();
  var recipients = parseEmailList_(properties.getProperty(CONFIG_KEYS.ADMIN_EMAILS));
  if (recipients.length === 0) {
    console.error('Unable to notify administrators: ADMIN_EMAILS is not configured. Context: ' + context);
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
  return result;
}
