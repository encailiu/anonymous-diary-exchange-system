function runDailyExchange() {
  return runDailyExchangeForDate_(getExchangeTargetDate_(new Date()));
}

function runDailyExchangeForDate(diaryDate) {
  if (!isValidDateKey_(String(diaryDate))) throw new Error('Date must be a valid YYYY-MM-DD date.');
  return runDailyExchangeForDate_(String(diaryDate));
}

function runDailyExchangeForDate_(diaryDate) {
  return withScriptLock_(function() {
    try {
      var matches = ensureMatchesForDate_(diaryDate);
      var deliveryResult = deliverPendingMatches_(diaryDate, matches);
      if (deliveryResult.failed > 0 || deliveryResult.processing > 0) {
        appendRunLog_(diaryDate, 'error', deliveryResult.failed + ' failed and ' + deliveryResult.processing + ' remain processing.');
      } else {
        appendRunLog_(diaryDate, 'completed', 'Daily exchange run completed.');
      }
      return deliveryResult;
    } catch (error) {
      appendRunLogSafely_(diaryDate, 'error', error.message || String(error));
      notifyAdminsOfError('runDailyExchange', error);
      throw error;
    }
  });
}

function runExchangeForDateFromPrompt() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('指定日を実行', '日記の日付を YYYY-MM-DD 形式で入力してください。検証時だけ使用してください。', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  runDailyExchangeForDate(response.getResponseText().trim());
  ui.alert('指定日の交換処理を実行しました。RunLog と DeliveryLog を確認してください。');
}

function ensureMatchesForDate_(diaryDate) {
  var existingMatches = getExistingMatchesForDate_(diaryDate);
  var diaries = getAcceptedDiariesForDate_(diaryDate);
  if (existingMatches.length > 0) {
    validateMatchesForDiaries_(existingMatches, diaries);
    return existingMatches;
  }
  if (diaries.length === 0) {
    appendRunLog_(diaryDate, 'skipped_no_submissions', 'No accepted diaries.');
    return [];
  }
  if (diaries.length === 1) {
    appendSkippedMatch_(diaryDate, diaries[0]);
    appendRunLog_(diaryDate, 'skipped_one_submission', 'One accepted diary.');
    return getExistingMatchesForDate_(diaryDate);
  }
  var skipHistory = getSkipHistory_();
  var result = createMatches_(diaries, getRecentPairKeys_(diaryDate), skipHistory.counts, skipHistory.lastSkippedParticipantId);
  var records = result.pairs.map(function(pair) { return createPairMatchRecord_(diaryDate, pair[0], pair[1]); });
  if (result.skipped) records.push(createSkippedMatchRecord_(diaryDate, result.skipped));
  appendRecords_('Matches', records);
  return getExistingMatchesForDate_(diaryDate);
}

function deliverPendingMatches_(diaryDate, matches) {
  var diariesById = {};
  getAcceptedDiariesForDate_(diaryDate).forEach(function(diary) { diariesById[String(diary.diary_id)] = diary; });
  var participantsById = getParticipantsById_();
  var result = { delivered: 0, skipped: 0, failed: 0, processing: 0 };
  matches.filter(function(match) { return String(match.match_type) === 'pair'; }).forEach(function(match) {
    recordDeliveryOutcome_(result, deliverDiaryOnce_(diaryDate, diariesById[String(match.left_diary_id)],
      participantsById[String(match.right_participant_id)], String(match.right_participant_id)));
    recordDeliveryOutcome_(result, deliverDiaryOnce_(diaryDate, diariesById[String(match.right_diary_id)],
      participantsById[String(match.left_participant_id)], String(match.left_participant_id)));
  });
  updateMatchDeliveryStatuses_(diaryDate, matches);
  return result;
}

function recordDeliveryOutcome_(result, outcome) {
  if (outcome === 'delivered') result.delivered += 1;
  else if (outcome === 'error') result.failed += 1;
  else if (outcome === 'processing') result.processing += 1;
  else result.skipped += 1;
}

function deliverDiaryOnce_(diaryDate, diary, recipient, recipientParticipantId) {
  if (!diary) throw new Error('Match references a missing diary.');
  var existingStatus = getExistingDeliveryStatus_(diaryDate, diary.diary_id, recipientParticipantId);
  if (existingStatus) {
    if (existingStatus === 'error') return 'error';
    if (existingStatus === 'processing') return 'processing';
    if (existingStatus === 'delivered') return 'skipped';
    throw new Error('DeliveryLog contains an unknown status.');
  }
  if (!recipient) throw new Error('Match references a participant who is no longer active.');
  var delivery = reserveDelivery_(diaryDate, diary.diary_id, recipient);
  if (delivery._existingStatus) {
    if (delivery._existingStatus === 'error') return 'error';
    if (delivery._existingStatus === 'processing') return 'processing';
    return 'skipped';
  }
  try {
    sendDiaryExchangeMail_(recipient.email, diary);
    updateRecord_('DeliveryLog', delivery._rowNumber, { status: 'delivered', delivered_at: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss'), error: '' });
    return 'delivered';
  } catch (error) {
    updateRecord_('DeliveryLog', delivery._rowNumber, { status: 'error', error: error.message || String(error) });
    notifyAdminsOfError('deliverDiaryOnce', error);
    return 'error';
  }
}

function getExistingDeliveryStatus_(diaryDate, diaryId, recipientParticipantId) {
  var existing = getRows_('DeliveryLog').find(function(row) {
    return String(row.diary_date) === diaryDate && String(row.diary_id) === String(diaryId) &&
      String(row.recipient_participant_id) === String(recipientParticipantId);
  });
  return existing ? String(existing.status) : '';
}

function retryFailedDeliveriesForDate(diaryDate) {
  if (!isValidDateKey_(String(diaryDate))) throw new Error('Date must be a valid YYYY-MM-DD date.');
  try {
    return withScriptLock_(function() { return retryFailedDeliveriesForDate_(String(diaryDate)); });
  } catch (error) {
    notifyAdminsOfError('retryFailedDeliveries', error);
    throw error;
  }
}

function retryFailedDeliveriesForDate_(diaryDate) {
  var diariesById = {};
  getAcceptedDiariesForDate_(diaryDate).forEach(function(diary) { diariesById[String(diary.diary_id)] = diary; });
  var participantsById = getParticipantsById_();
  var result = { delivered: 0, skipped: 0, failed: 0, processing: 0 };
  getRows_('DeliveryLog').filter(function(row) {
    return String(row.diary_date) === diaryDate && String(row.status) === 'error';
  }).forEach(function(delivery) {
    var diary = diariesById[String(delivery.diary_id)];
    var recipient = participantsById[String(delivery.recipient_participant_id)];
    if (!diary || !recipient) throw new Error('Failed delivery references a missing diary or active participant.');
    updateRecord_('DeliveryLog', delivery._rowNumber, {
      status: 'processing', attempted_at: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss'), delivered_at: '', error: ''
    });
    try {
      sendDiaryExchangeMail_(recipient.email, diary);
      updateRecord_('DeliveryLog', delivery._rowNumber, {
        status: 'delivered', delivered_at: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss'), error: ''
      });
      result.delivered += 1;
    } catch (error) {
      updateRecord_('DeliveryLog', delivery._rowNumber, { status: 'error', error: error.message || String(error) });
      notifyAdminsOfError('retryFailedDeliveries', error);
      result.failed += 1;
    }
  });
  updateMatchDeliveryStatuses_(diaryDate, getExistingMatchesForDate_(diaryDate));
  appendRunLog_(diaryDate, result.failed > 0 ? 'error' : 'retry_completed',
    result.delivered + ' failed delivery attempt(s) retried; ' + result.failed + ' failed.');
  return result;
}

function retryFailedDeliveriesFromPrompt() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('失敗した配信を再送', '日記の日付を YYYY-MM-DD 形式で入力してください。processing は再送されません。', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var result = retryFailedDeliveriesForDate(response.getResponseText().trim());
  ui.alert(result.delivered + '件を再送し、' + result.failed + '件が失敗しました。');
}

function reserveDelivery_(diaryDate, diaryId, recipient) {
  var existing = getRows_('DeliveryLog').find(function(row) {
    return String(row.diary_date) === diaryDate && String(row.diary_id) === String(diaryId) && String(row.recipient_participant_id) === String(recipient.participantId);
  });
  if (existing) return { _existingStatus: String(existing.status) };
  var record = {
    delivery_id: createId_(), diary_date: diaryDate, diary_id: diaryId, recipient_participant_id: recipient.participantId,
    recipient_email: recipient.email, status: 'processing', attempted_at: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss'), delivered_at: '', error: ''
  };
  appendRecord_('DeliveryLog', record);
  var lastRow = getSheet_('DeliveryLog').getLastRow();
  record._rowNumber = lastRow;
  return record;
}

function updateMatchDeliveryStatuses_(diaryDate, matches) {
  var deliveries = {};
  getRows_('DeliveryLog').filter(function(row) { return String(row.diary_date) === diaryDate; }).forEach(function(row) {
    deliveries[String(row.diary_id) + ':' + String(row.recipient_participant_id)] = String(row.status);
  });
  matches.filter(function(match) { return String(match.match_type) === 'pair'; }).forEach(function(match) {
    var statuses = [
      deliveries[String(match.left_diary_id) + ':' + String(match.right_participant_id)],
      deliveries[String(match.right_diary_id) + ':' + String(match.left_participant_id)]
    ];
    var status = statuses.every(function(value) { return value === 'delivered'; }) ? 'delivered'
      : statuses.some(function(value) { return value === 'error'; }) ? 'error'
      : statuses.some(function(value) { return value === 'processing'; }) ? 'processing' : 'pending_delivery';
    updateRecord_('Matches', match._rowNumber, { status: status });
  });
}

function appendRunLogSafely_(diaryDate, status, details) {
  try { appendRunLog_(diaryDate, status, details); } catch (ignored) { console.error('RunLog write failed.'); }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('匿名日記システム')
    .addItem('シートを初期化', 'initializeSpreadsheet')
    .addItem('参加者を追加', 'addParticipantFromPrompt')
    .addItem('トリガーを設定', 'installTriggers')
    .addItem('日次交換を実行', 'runDailyExchange')
    .addItem('指定日を実行（検証用）', 'runExchangeForDateFromPrompt')
    .addItem('失敗した配信を再送', 'retryFailedDeliveriesFromPrompt')
    .addItem('自己テストを実行', 'runMvpSelfTests')
    .addToUi();
}
