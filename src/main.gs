function runDailyExchange() {
  return withScriptLock_(function() {
    var diaryDate = getExchangeTargetDate_(new Date());
    try {
      var matches = ensureMatchesForDate_(diaryDate);
      deliverPendingMatches_(diaryDate, matches);
      appendRunLog_(diaryDate, 'completed', 'Daily exchange run completed.');
    } catch (error) {
      appendRunLogSafely_(diaryDate, 'error', error.message || String(error));
      notifyAdminsOfError('runDailyExchange', error);
      throw error;
    }
  });
}

function ensureMatchesForDate_(diaryDate) {
  var existingMatches = getExistingMatchesForDate_(diaryDate);
  if (existingMatches.length > 0) return existingMatches;
  var diaries = getAcceptedDiariesForDate_(diaryDate);
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
  result.pairs.forEach(function(pair) { appendMatch_(diaryDate, pair[0], pair[1]); });
  if (result.skipped) appendSkippedMatch_(diaryDate, result.skipped);
  return getExistingMatchesForDate_(diaryDate);
}

function deliverPendingMatches_(diaryDate, matches) {
  var diariesById = {};
  getAcceptedDiariesForDate_(diaryDate).forEach(function(diary) { diariesById[String(diary.diary_id)] = diary; });
  var participantsById = getParticipantsById_();
  matches.filter(function(match) { return String(match.match_type) === 'pair'; }).forEach(function(match) {
    deliverDiaryOnce_(diaryDate, diariesById[String(match.left_diary_id)], participantsById[String(match.right_participant_id)]);
    deliverDiaryOnce_(diaryDate, diariesById[String(match.right_diary_id)], participantsById[String(match.left_participant_id)]);
  });
}

function deliverDiaryOnce_(diaryDate, diary, recipient) {
  if (!diary || !recipient) throw new Error('Match references a missing diary or active participant.');
  var delivery = reserveDelivery_(diaryDate, diary.diary_id, recipient);
  if (!delivery) return;
  try {
    sendDiaryExchangeMail_(recipient.email, diary);
    updateRecord_('DeliveryLog', delivery._rowNumber, { status: 'delivered', delivered_at: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss'), error: '' });
  } catch (error) {
    updateRecord_('DeliveryLog', delivery._rowNumber, { status: 'error', error: error.message || String(error) });
    notifyAdminsOfError('deliverDiaryOnce', error);
  }
}

function reserveDelivery_(diaryDate, diaryId, recipient) {
  var existing = getRows_('DeliveryLog').some(function(row) {
    return String(row.diary_date) === diaryDate && String(row.diary_id) === String(diaryId) && String(row.recipient_participant_id) === String(recipient.participantId);
  });
  if (existing) return null;
  var record = {
    delivery_id: createId_(), diary_date: diaryDate, diary_id: diaryId, recipient_participant_id: recipient.participantId,
    recipient_email: recipient.email, status: 'processing', attempted_at: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss'), delivered_at: '', error: ''
  };
  appendRecord_('DeliveryLog', record);
  var lastRow = getSheet_('DeliveryLog').getLastRow();
  record._rowNumber = lastRow;
  return record;
}

function appendRunLogSafely_(diaryDate, status, details) {
  try { appendRunLog_(diaryDate, status, details); } catch (ignored) { console.error(ignored); }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('匿名日記システム')
    .addItem('シートを初期化', 'initializeSpreadsheet')
    .addItem('トリガーを設定', 'installTriggers')
    .addItem('日次交換を実行', 'runDailyExchange')
    .addItem('自己テストを実行', 'runMvpSelfTests')
    .addToUi();
}
