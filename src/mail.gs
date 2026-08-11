function sendSystemMail(to, subject, body, htmlBody) {
  var provider = PropertiesService.getScriptProperties().getProperty(CONFIG_KEYS.MAIL_PROVIDER) || 'gmail';
  if (provider !== 'gmail') throw new Error('Unsupported MAIL_PROVIDER: ' + provider);
  GmailApp.sendEmail(to, subject, body, { htmlBody: htmlBody || escapeHtml_(body).replace(/\n/g, '<br>') });
}

function sendDiaryExchangeMail_(recipientEmail, diary) {
  var subject = '匿名日記が届きました';
  var commentUrl = getCommentUrl_(diary.comment_token);
  var body = '匿名の日記が届きました。\n\n' + String(diary.body || '') + '\n\n匿名コメントを送る:\n' + commentUrl;
  var htmlBody = '<p>匿名の日記が届きました。</p><hr><div>' + escapeHtml_(diary.body).replace(/\n/g, '<br>') +
    '</div><hr><p><a href="' + escapeHtml_(commentUrl) + '">匿名コメントを送る</a></p>';
  sendSystemMail(recipientEmail, subject, body, htmlBody);
}

function getCommentUrl_(commentToken) {
  var webAppUrl = getConfig_().webAppUrl;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/.test(webAppUrl)) {
    throw new Error('WEB_APP_URL must be the deployed Apps Script /exec URL.');
  }
  if (!/^[a-f0-9]{64}$/i.test(String(commentToken))) throw new Error('Diary comment token is missing or invalid.');
  return webAppUrl + '?token=' + encodeURIComponent(String(commentToken));
}

function sendAnonymousCommentMail_(authorEmail, commentBody) {
  var subject = '匿名コメントが届きました';
  var body = 'あなたの日記に匿名コメントが届きました。\n\n' + String(commentBody || '');
  var htmlBody = '<p>あなたの日記に匿名コメントが届きました。</p><hr><div>' +
    escapeHtml_(commentBody).replace(/\n/g, '<br>') + '</div>';
  sendSystemMail(authorEmail, subject, body, htmlBody);
}
