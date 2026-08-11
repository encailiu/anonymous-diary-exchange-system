function sendSystemMail(to, subject, body, htmlBody) {
  var provider = PropertiesService.getScriptProperties().getProperty(CONFIG_KEYS.MAIL_PROVIDER) || 'gmail';
  if (provider !== 'gmail') throw new Error('Unsupported MAIL_PROVIDER: ' + provider);
  var content = htmlBody && typeof htmlBody === 'object' ? htmlBody : { htmlBody: htmlBody };
  var options = { htmlBody: content.htmlBody || escapeHtml_(body).replace(/\n/g, '<br>') };
  if (content.attachments && content.attachments.length > 0) options.attachments = content.attachments;
  GmailApp.sendEmail(to, subject, body, options);
}

function sendDiaryExchangeMail_(recipientEmail, diary) {
  var subject = '匿名日記が届きました';
  var commentUrl = getCommentUrl_(diary.comment_token);
  var body = '匿名の日記が届きました。\n\n' + String(diary.body || '') + '\n\n匿名コメントを送る:\n' + commentUrl;
  var htmlBody = '<p>匿名の日記が届きました。</p><hr><div>' + escapeHtml_(diary.body).replace(/\n/g, '<br>') +
    '</div><hr><p><a href="' + escapeHtml_(commentUrl) + '">匿名コメントを送る</a></p>';
  var attachments = createAnonymousPhotoAttachments_(diary.photo_file_ids);
  sendSystemMail(recipientEmail, subject, body, { htmlBody: htmlBody, attachments: attachments });
}

function createAnonymousPhotoAttachments_(serializedFileIds) {
  var fileIds = parsePhotoFileIds_(serializedFileIds);
  if (fileIds.length === 0) return [];
  if (fileIds.length > 3) throw new Error('A diary may contain at most three photos.');
  validatePhotoFileIds_(fileIds);
  var sourceBlobs = fileIds.map(function(fileId) {
    var file = DriveApp.getFileById(fileId);
    return file.getBlob();
  });
  return rasterizePhotoBlobs_(sourceBlobs);
}

function parsePhotoFileIds_(serializedFileIds) {
  if (!serializedFileIds) return [];
  var parsed;
  try { parsed = JSON.parse(String(serializedFileIds)); }
  catch (error) { throw new Error('Diary photo metadata is invalid.'); }
  if (!Array.isArray(parsed) || parsed.some(function(value) { return typeof value !== 'string' || value === ''; })) {
    throw new Error('Diary photo metadata is invalid.');
  }
  return parsed;
}

function rasterizePhotoBlobs_(sourceBlobs) {
  var presentation = SlidesApp.create('anonymous-diary-photo-processing-' + createId_());
  var presentationId = presentation.getId();
  var exports = [];
  try {
    var firstSlide = presentation.getSlides()[0];
    firstSlide.getPageElements().forEach(function(element) { element.remove(); });
    sourceBlobs.forEach(function(blob, index) {
      var slide = index === 0 ? firstSlide : presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
      var image = slide.insertImage(blob);
      fitImageToSlide_(image, presentation.getPageWidth(), presentation.getPageHeight());
      exports.push({ pageId: slide.getObjectId(), index: index });
    });
    presentation.saveAndClose();
    return exports.map(function(item) {
      var url = 'https://docs.google.com/presentation/d/' + encodeURIComponent(presentationId) +
        '/export/png?pageid=' + encodeURIComponent(item.pageId);
      var response = UrlFetchApp.fetch(url, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
      });
      if (response.getResponseCode() !== 200) throw new Error('Photo rasterization failed.');
      return response.getBlob().setName('anonymous-photo-' + (item.index + 1) + '.png');
    });
  } finally {
    try { DriveApp.getFileById(presentationId).setTrashed(true); }
    catch (ignored) { console.error('Temporary photo presentation cleanup failed.'); }
  }
}

function fitImageToSlide_(image, pageWidth, pageHeight) {
  var scale = Math.min(pageWidth / image.getWidth(), pageHeight / image.getHeight());
  image.setWidth(image.getWidth() * scale);
  image.setHeight(image.getHeight() * scale);
  image.setLeft((pageWidth - image.getWidth()) / 2);
  image.setTop((pageHeight - image.getHeight()) / 2);
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
