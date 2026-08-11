function doGet(event) {
  try {
    var token = String(event && event.parameter && event.parameter.token || '');
    if (!findCommentableDiaryByToken_(token)) return createCommentPage_('このコメントリンクは無効です。', false, '', '');
    return createCommentPage_('匿名コメントを送る', true, token, createUniqueCommentSubmissionToken_());
  } catch (error) {
    notifyAdminsOfError('commentPage', error);
    return createCommentPage_('現在コメントを受け付けられません。', false, '', '');
  }
}

function doPost(event) {
  try {
    var token = String(event && event.parameter && event.parameter.token || '');
    var submissionToken = String(event && event.parameter && event.parameter.submission_token || '');
    var body = String(event && event.parameter && event.parameter.body || '').trim();
    if (!findCommentableDiaryByToken_(token) || !isValidCommentSubmissionToken_(submissionToken)) {
      throw new Error('Invalid comment submission.');
    }
    if (!body) return createCommentPage_('コメントを入力してください。', true, token, submissionToken);
    if (body.length > 5000) return createCommentPage_('コメントは5000文字以内で入力してください。', true, token, submissionToken);
    submitAnonymousComment_(token, submissionToken, body);
    return createCommentPage_('匿名コメントを受け付けました。', false, '', '');
  } catch (error) {
    notifyAdminsOfError('submitAnonymousComment', error);
    return createCommentPage_('コメントを受け付けられませんでした。管理者へ通知しました。', false, '', '');
  }
}

function submitAnonymousComment_(token, submissionToken, body) {
  return withScriptLock_(function() {
    if (!isValidCommentSubmissionToken_(submissionToken)) throw new Error('Invalid comment submission token.');
    var existing = getRows_('Comments').find(function(row) {
      return String(row.submission_token) === submissionToken;
    });
    if (existing) return String(existing.comment_id);
    var diary = findCommentableDiaryByToken_(token);
    if (!diary) throw new Error('Invalid comment token.');
    var author = getParticipantsById_()[String(diary.participant_id)];
    if (!author) throw new Error('Comment target author is no longer active.');
    var record = {
      comment_id: createId_(), comment_token: token, submission_token: submissionToken,
      diary_date: String(diary.diary_date), body: body,
      status: 'processing', submitted_at: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss'), notified_at: '', error: ''
    };
    appendRecord_('Comments', record);
    record._rowNumber = getSheet_('Comments').getLastRow();
    try {
      sendAnonymousCommentMail_(author.email, body);
    } catch (error) {
      updateRecord_('Comments', record._rowNumber, { status: 'error', error: error.message || String(error) });
      notifyAdminsOfError('anonymousCommentNotification', error);
      return record.comment_id;
    }
    try {
      updateRecord_('Comments', record._rowNumber, {
        status: 'delivered', notified_at: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss'), error: ''
      });
    } catch (error) {
      notifyAdminsOfError('anonymousCommentStatusUpdate', error);
    }
    return record.comment_id;
  });
}

function findDiaryByCommentToken_(token) {
  if (!/^[a-f0-9]{64}$/i.test(String(token))) return null;
  return getRows_('Diaries').find(function(row) {
    return String(row.comment_token) === String(token) && String(row.status) === 'accepted';
  }) || null;
}

function findCommentableDiaryByToken_(token) {
  var diary = findDiaryByCommentToken_(token);
  if (!diary) return null;
  return getParticipantsById_()[String(diary.participant_id)] ? diary : null;
}

function createUniqueCommentSubmissionToken_() {
  var existing = {};
  getRows_('Comments').forEach(function(row) {
    if (row.submission_token) existing[String(row.submission_token)] = true;
  });
  for (var attempt = 0; attempt < 5; attempt += 1) {
    var token = createCommentToken_();
    if (!existing[token]) return token;
  }
  throw new Error('Unable to generate a unique comment submission token.');
}

function isValidCommentSubmissionToken_(token) {
  return /^[a-f0-9]{64}$/i.test(String(token));
}

function createCommentPage_(message, showForm, token, submissionToken) {
  var form = showForm ? [
    '<form method="post">',
    '<input type="hidden" name="token" value="' + escapeHtml_(token) + '">',
    '<input type="hidden" name="submission_token" value="' + escapeHtml_(submissionToken) + '">',
    '<label for="body">コメント</label>',
    '<textarea id="body" name="body" maxlength="5000" required></textarea>',
    '<button type="submit">匿名で送る</button>',
    '</form>'
  ].join('') : '';
  var html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>匿名コメント</title><style>body{font-family:sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem}' +
    'textarea{box-sizing:border-box;width:100%;min-height:10rem;margin:.5rem 0 1rem}button{padding:.7rem 1rem}</style></head>' +
    '<body><h1>匿名コメント</h1><p>' + escapeHtml_(message) + '</p>' + form + '</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('匿名コメント');
}

function retryFailedCommentNotificationsForDate(diaryDate) {
  if (!isValidDateKey_(String(diaryDate))) throw new Error('Date must be a valid YYYY-MM-DD date.');
  try {
    return withScriptLock_(function() {
      var result = { delivered: 0, failed: 0, processing: 0 };
      getRows_('Comments').filter(function(row) {
        return String(row.diary_date) === String(diaryDate) && String(row.status) === 'error';
      }).forEach(function(comment) {
        var diary = findDiaryByCommentToken_(String(comment.comment_token));
        var author = diary && getParticipantsById_()[String(diary.participant_id)];
        if (!author) throw new Error('Failed comment notification has no active author.');
        updateRecord_('Comments', comment._rowNumber, { status: 'processing', error: '' });
        try {
          sendAnonymousCommentMail_(author.email, String(comment.body));
        } catch (error) {
          updateRecord_('Comments', comment._rowNumber, { status: 'error', error: error.message || String(error) });
          notifyAdminsOfError('retryFailedCommentNotification', error);
          result.failed += 1;
          return;
        }
        try {
          updateRecord_('Comments', comment._rowNumber, {
            status: 'delivered', notified_at: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss'), error: ''
          });
          result.delivered += 1;
        } catch (error) {
          notifyAdminsOfError('commentRetryStatusUpdate', error);
          result.processing += 1;
        }
      });
      return result;
    });
  } catch (error) {
    notifyAdminsOfError('retryFailedCommentNotifications', error);
    throw error;
  }
}

function retryFailedCommentNotificationsFromPrompt() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('失敗したコメント通知を再送', '日記の日付を YYYY-MM-DD 形式で入力してください。', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var result = retryFailedCommentNotificationsForDate(response.getResponseText().trim());
  ui.alert(result.delivered + '件を再送し、' + result.failed + '件が失敗、' + result.processing + '件がprocessingのままです。');
}

function resolveProcessingComment(commentId, resolution) {
  if (resolution !== 'delivered' && resolution !== 'error') throw new Error('Resolution must be delivered or error.');
  try {
    return withScriptLock_(function() {
      var comment = getRows_('Comments').find(function(row) { return String(row.comment_id) === String(commentId); });
      if (!comment || String(comment.status) !== 'processing') throw new Error('A processing comment with that ID was not found.');
      updateRecord_('Comments', comment._rowNumber, {
        status: resolution,
        notified_at: resolution === 'delivered' ? formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss') : '',
        error: resolution === 'error' ? 'Administrator confirmed that the notification was not sent.' : ''
      });
      return resolution;
    });
  } catch (error) {
    notifyAdminsOfError('resolveProcessingComment', error);
    throw error;
  }
}

function resolveProcessingCommentFromPrompt() {
  var ui = SpreadsheetApp.getUi();
  var idResponse = ui.prompt('コメント通知のprocessingを確認', 'Commentsの comment_id を入力してください。', ui.ButtonSet.OK_CANCEL);
  if (idResponse.getSelectedButton() !== ui.Button.OK) return;
  var resolutionResponse = ui.prompt('確認結果', 'Gmailで通知済みなら delivered、未送信を確認できた場合だけ error と入力してください。', ui.ButtonSet.OK_CANCEL);
  if (resolutionResponse.getSelectedButton() !== ui.Button.OK) return;
  var resolution = resolutionResponse.getResponseText().trim().toLowerCase();
  resolveProcessingComment(idResponse.getResponseText().trim(), resolution);
  ui.alert('コメント通知のprocessingを ' + resolution + ' に更新しました。');
}
