function getExistingMatchesForDate_(diaryDate) {
  return getRows_('Matches').filter(function(row) { return String(row.diary_date) === diaryDate; });
}

function getRecentPairKeys_(diaryDate) {
  var earliestDate = addDaysToDateKey_(diaryDate, -7);
  var keys = {};
  getRows_('Matches').forEach(function(row) {
    if (String(row.match_type) === 'pair' && String(row.diary_date) >= earliestDate && String(row.diary_date) < diaryDate) {
      keys[pairKey_(row.left_participant_id, row.right_participant_id)] = true;
    }
  });
  return keys;
}

function getSkipHistory_() {
  var counts = {};
  var skippedRows = getRows_('Matches').filter(function(row) { return String(row.match_type) === 'skipped'; });
  skippedRows.forEach(function(row) {
    var id = String(row.left_participant_id);
    counts[id] = Number(counts[id] || 0) + 1;
  });
  return { counts: counts, lastSkippedParticipantId: skippedRows.length ? String(skippedRows[skippedRows.length - 1].left_participant_id) : '' };
}

function appendMatch_(diaryDate, leftDiary, rightDiary) {
  appendRecord_('Matches', createPairMatchRecord_(diaryDate, leftDiary, rightDiary));
}

function createPairMatchRecord_(diaryDate, leftDiary, rightDiary) {
  return {
    match_id: createId_(), diary_date: diaryDate, match_type: 'pair', left_diary_id: leftDiary.diary_id,
    right_diary_id: rightDiary.diary_id, left_participant_id: leftDiary.participant_id,
    right_participant_id: rightDiary.participant_id, status: 'pending_delivery', created_at: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss')
  };
}

function appendSkippedMatch_(diaryDate, diary) {
  appendRecord_('Matches', createSkippedMatchRecord_(diaryDate, diary));
}

function createSkippedMatchRecord_(diaryDate, diary) {
  return {
    match_id: createId_(), diary_date: diaryDate, match_type: 'skipped', left_diary_id: diary.diary_id,
    right_diary_id: '', left_participant_id: diary.participant_id, right_participant_id: '', status: 'skipped',
    created_at: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss')
  };
}

function validateMatchesForDiaries_(matches, diaries) {
  var expected = {};
  var participantsByDiaryId = {};
  var matchIds = {};
  var skippedCount = 0;
  diaries.forEach(function(diary) {
    var diaryId = String(diary.diary_id);
    expected[diaryId] = 0;
    participantsByDiaryId[diaryId] = String(diary.participant_id);
  });
  matches.forEach(function(match) {
    var matchId = String(match.match_id || '');
    if (!matchId || matchIds[matchId]) throw new Error('Matches contain a missing or duplicate match ID.');
    matchIds[matchId] = true;
    var matchType = String(match.match_type);
    if (matchType !== 'pair' && matchType !== 'skipped') throw new Error('Matches contain an unknown match type.');
    var leftDiaryId = String(match.left_diary_id);
    var leftParticipantId = String(match.left_participant_id);
    var diaryIds = [leftDiaryId];
    if (matchType === 'pair') {
      var rightDiaryId = String(match.right_diary_id);
      var rightParticipantId = String(match.right_participant_id);
      if (!rightDiaryId || !rightParticipantId) throw new Error('A pair match is incomplete.');
      if (leftDiaryId === rightDiaryId || leftParticipantId === rightParticipantId) throw new Error('A self match is forbidden.');
      if (participantsByDiaryId[rightDiaryId] !== rightParticipantId) throw new Error('A match participant does not own the referenced diary.');
      diaryIds.push(rightDiaryId);
    } else {
      skippedCount += 1;
      if (String(match.right_diary_id || '') || String(match.right_participant_id || '')) throw new Error('A skipped match must not contain a right side.');
    }
    if (participantsByDiaryId[leftDiaryId] !== leftParticipantId) throw new Error('A match participant does not own the referenced diary.');
    diaryIds.forEach(function(diaryId) {
      if (!Object.prototype.hasOwnProperty.call(expected, diaryId)) throw new Error('Matches contain an unknown diary.');
      expected[diaryId] += 1;
    });
  });
  if (skippedCount !== diaries.length % 2) throw new Error('Matches contain an invalid number of skipped diaries.');
  Object.keys(expected).forEach(function(diaryId) {
    if (expected[diaryId] !== 1) throw new Error('Matches are incomplete or duplicated for the requested date.');
  });
}

function appendRunLog_(diaryDate, status, details) {
  appendRecord_('RunLog', { run_id: createId_(), diary_date: diaryDate, status: status, details: details, created_at: formatJst_(new Date(), 'yyyy-MM-dd HH:mm:ss') });
}

function appendRunLogOnce_(diaryDate, status, details) {
  var exists = getRows_('RunLog').some(function(row) {
    return String(row.diary_date) === diaryDate && String(row.status) === status;
  });
  if (!exists) appendRunLog_(diaryDate, status, details);
}

function deleteMatchesForDate_(diaryDate) {
  var sheet = getSheet_('Matches');
  getExistingMatchesForDate_(diaryDate).map(function(row) { return row._rowNumber; })
    .sort(function(left, right) { return right - left; })
    .forEach(function(rowNumber) { sheet.deleteRow(rowNumber); });
}
