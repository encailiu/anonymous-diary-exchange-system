function sendSystemMail(to, subject, body, htmlBody) {
  var provider = PropertiesService.getScriptProperties().getProperty(CONFIG_KEYS.MAIL_PROVIDER) || 'gmail';
  if (provider !== 'gmail') throw new Error('Unsupported MAIL_PROVIDER: ' + provider);
  GmailApp.sendEmail(to, subject, body, { htmlBody: htmlBody || escapeHtml_(body).replace(/\n/g, '<br>') });
}

function sendDiaryExchangeMail_(recipientEmail, diary) {
  var subject = '匿名日記が届きました';
  var body = '匿名の日記が届きました。\n\n' + String(diary.body || '');
  var htmlBody = '<p>匿名の日記が届きました。</p><hr><div>' + escapeHtml_(diary.body).replace(/\n/g, '<br>') + '</div>';
  sendSystemMail(recipientEmail, subject, body, htmlBody);
}
