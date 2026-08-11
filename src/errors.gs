function notifyAdminsOfError(context, error) {
  var properties = PropertiesService.getScriptProperties();
  var recipients = parseEmailList_(properties.getProperty(CONFIG_KEYS.ADMIN_EMAILS));
  if (recipients.length === 0) {
    console.error('Unable to notify administrators: ADMIN_EMAILS is not configured. Context: ' + context);
    return;
  }
  var detail = error && error.message ? error.message : String(error);
  var body = [
    '発生時刻: ' + formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss') + ' JST',
    '発生処理: ' + context,
    'エラー内容: ' + detail,
    '',
    '管理者用Spreadsheetを確認してください。'
  ].join('\n');
  recipients.forEach(function(email) {
    try {
      sendSystemMail(email, '【緊急アラート】匿名日記システムでエラーが発生しました', body);
    } catch (mailError) {
      console.error('Administrator notification failed.');
    }
  });
}
